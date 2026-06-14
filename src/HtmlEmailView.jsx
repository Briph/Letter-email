/**
 * src/HtmlEmailView.jsx
 * Renders HTML email content in a sandboxed iframe.
 * - Prevents JS execution (sandbox attribute)
 * - Injects base styles that match the app theme
 * - Handles "load images" toggle for privacy
 * - Detects and surfaces unsubscribe links
 * - Falls back to plain text if no HTML present
 */

import { useState, useRef, useEffect, useCallback } from "react";

export default function HtmlEmailView({ email, dark, fontSize = 14 }) {
  const iframeRef   = useRef(null);
  const [showImages, setShowImages]       = useState(false);
  const [iframeHeight, setIframeHeight]   = useState(200);
  const [unsub, setUnsub]                 = useState(null); // unsubscribe URL if detected
  const [viewMode, setViewMode]           = useState("html"); // "html" | "text"

  const hasHtml = !!(email.bodyHtml || "").trim();

  // ── Detect unsubscribe ─────────────────────────────────────────────────────
  useEffect(() => {
    // Check for List-Unsubscribe in stored header data
    if (email.unsubscribeUrl) { setUnsub(email.unsubscribeUrl); return; }
    // Fall back to scanning body for common unsubscribe patterns
    const body = email.bodyHtml || email.body || "";
    const m = body.match(/href=["']([^"']*unsubscribe[^"']*)["']/i)
           || body.match(/href=["']([^"']*opt[_-]?out[^"']*)["']/i)
           || body.match(/href=["']([^"']*remove[^"']*)["']/i);
    if (m) setUnsub(m[1]);
    else setUnsub(null);
  }, [email.id]);

  // ── Build iframe content ───────────────────────────────────────────────────
  const buildContent = useCallback(() => {
    const bg   = dark ? "#111111" : "#ffffff";
    const text = dark ? "#f0f0f0" : "#111111";
    const link = dark ? "#60a8f0" : "#1a73e8";

    // Block remote images unless user opted in
    const imgPolicy = showImages
      ? ""
      : `<meta http-equiv="Content-Security-Policy" content="img-src 'none' data: cid:;">`;

    let body = hasHtml && viewMode === "html"
      ? (email.bodyHtml || "")
      : `<pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;margin:0">${escapeHtml(email.body || "")}</pre>`;

    // Strip <script> entirely (belt-and-suspenders on top of sandbox)
    body = body.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

    // Make all links open in _blank
    body = body.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');

    return `<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      ${imgPolicy}
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        html { font-size: ${fontSize}px; }
        body {
          margin: 0; padding: 0;
          background: ${bg}; color: ${text};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 1rem; line-height: 1.6; word-break: break-word;
          overflow-x: hidden;
        }
        a { color: ${link}; }
        img { max-width: 100%; height: auto; }
        table { max-width: 100% !important; }
        pre, code { font-family: 'Courier New', monospace; font-size: 0.875rem;
                     background: ${dark?"#1e1e1e":"#f5f5f5"}; padding: 2px 4px; border-radius: 3px; }
        blockquote { border-left: 3px solid ${dark?"#444":"#ddd"};
                     margin: 8px 0 8px 0; padding-left: 12px;
                     color: ${dark?"#aaa":"#666"}; }
      </style>
    </head><body>${body}</body></html>`;
  }, [email.bodyHtml, email.body, hasHtml, viewMode, showImages, dark, fontSize]);

  // ── Resize iframe to fit content ──────────────────────────────────────────
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const html = buildContent();
    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    iframe.src = url;

    const onLoad = () => {
      try {
        const h = iframe.contentDocument?.body?.scrollHeight || 200;
        setIframeHeight(Math.min(Math.max(h + 32, 100), 4000));
      } catch { setIframeHeight(400); }
      URL.revokeObjectURL(url);
    };

    iframe.addEventListener("load", onLoad, { once: true });
    // Cleanup: remove listener only — URL is revoked inside onLoad after iframe loads.
    // Revoking in cleanup would cancel the load if the effect re-runs before load completes.
    return () => iframe.removeEventListener("load", onLoad);
  }, [buildContent]);

  const bd  = dark ? "#242424" : "#e4e4e4";
  const sub = dark ? "#888" : "#888";

  return (
    <div>
      {/* Controls bar */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap" }}>
        {hasHtml && (
          <div style={{ display:"flex", gap:4 }}>
            <button onClick={()=>setViewMode("html")} style={{ background:viewMode==="html"?(dark?"#2a2a2a":"#e8e8e8"):"none", border:`1px solid ${bd}`, borderRadius:6, padding:"3px 10px", fontSize:11, cursor:"pointer", color:viewMode==="html"?(dark?"#f0f0f0":"#111"):sub, fontFamily:"inherit" }}>HTML</button>
            <button onClick={()=>setViewMode("text")} style={{ background:viewMode==="text"?(dark?"#2a2a2a":"#e8e8e8"):"none", border:`1px solid ${bd}`, borderRadius:6, padding:"3px 10px", fontSize:11, cursor:"pointer", color:viewMode==="text"?(dark?"#f0f0f0":"#111"):sub, fontFamily:"inherit" }}>Plain text</button>
          </div>
        )}
        {!showImages && hasHtml && viewMode==="html" && (
          <button onClick={()=>setShowImages(true)} style={{ background:"none", border:`1px solid ${bd}`, borderRadius:6, padding:"3px 10px", fontSize:11, cursor:"pointer", color:"#4a90d9", fontFamily:"inherit" }}>
            🖼 Show images
          </button>
        )}
        {unsub && (
          <a href={unsub} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:"#4a90d9", textDecoration:"none", border:`1px solid #4a90d9`, borderRadius:6, padding:"3px 10px", display:"inline-flex", alignItems:"center", gap:4 }}>
            <span>✕</span> Unsubscribe
          </a>
        )}
      </div>

      {/* Sandboxed iframe */}
      <iframe
        ref={iframeRef}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        style={{ width:"100%", height:iframeHeight, border:"none", display:"block", borderRadius:8 }}
        title="email-body"
      />
    </div>
  );
}

function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
