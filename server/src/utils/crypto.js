/**
 * server/src/utils/crypto.js
 * AES-256-GCM encryption/decryption for IMAP/SMTP credentials.
 * The key is derived from CREDENTIALS_SECRET in .env.
 * Never store plaintext passwords — always encrypt before writing to DB.
 */

const forge = require("node-forge");

// Derive a 256-bit key from the secret using SHA-256
// SECRET is read lazily at call time so dotenv has time to load
function deriveKey(secret) {
  const md = forge.md.sha256.create();
  md.update(secret);
  return md.digest().getBytes(); // 32 raw bytes
}

/**
 * Encrypt a plaintext string.
 * Returns a JSON string: { iv, tag, ciphertext } — all hex-encoded.
 */
function encrypt(plaintext) {
  const SECRET = process.env.CREDENTIALS_SECRET || "dev_credentials_secret_change_me_32ch";
  const key = deriveKey(SECRET);
  const iv  = forge.random.getBytesSync(12); // 96-bit IV for GCM

  const cipher = forge.cipher.createCipher("AES-GCM", key);
  cipher.start({ iv, tagLength: 128 });
  cipher.update(forge.util.createBuffer(plaintext, "utf8"));
  cipher.finish();

  return JSON.stringify({
    iv:         forge.util.bytesToHex(iv),
    tag:        forge.util.bytesToHex(cipher.mode.tag.getBytes()),
    ciphertext: forge.util.bytesToHex(cipher.output.getBytes()),
  });
}

/**
 * Decrypt a string previously produced by encrypt().
 * Returns the original plaintext.
 */
function decrypt(encryptedJson) {
  const SECRET = process.env.CREDENTIALS_SECRET || "dev_credentials_secret_change_me_32ch";
  const { iv, tag, ciphertext } = JSON.parse(encryptedJson);
  const key = deriveKey(SECRET);

  const decipher = forge.cipher.createDecipher("AES-GCM", key);
  decipher.start({
    iv:  forge.util.hexToBytes(iv),
    tag: forge.util.createBuffer(forge.util.hexToBytes(tag)),
    tagLength: 128,
  });
  decipher.update(forge.util.createBuffer(forge.util.hexToBytes(ciphertext)));

  const pass = decipher.finish();
  if (!pass) throw new Error("Decryption failed — invalid credentials or wrong secret");

  return decipher.output.toString();
}

module.exports = { encrypt, decrypt };
