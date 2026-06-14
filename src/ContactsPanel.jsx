/**
 * src/ContactsPanel.jsx
 * Full contacts management: view, add, edit, delete, search contacts.
 * Shown as a tab in the main sidebar navigation.
 */

import { useState, useMemo } from "react";

export default function ContactsPanel({ contacts, setContacts, emails, dark, T }) {
  const [search,   setSearch]   = useState("");
  const [editing,  setEditing]  = useState(null);  // contact object being edited
  const [adding,   setAdding]   = useState(false);
  const [nName,    setNName]    = useState("");
  const [nEmail,   setNEmail]   = useState("");
  const [nNote,    setNNote]    = useState("");

  // Derive email count and last-seen date per contact
  const enriched = useMemo(() => {
    return contacts.map(c => {
      const related = emails.filter(e =>
        e.fromEmail?.toLowerCase() === c.email.toLowerCase() ||
        e.to?.toLowerCase().includes(c.email.toLowerCase())
      );
      return {
        ...c,
        emailCount: related.length,
        lastSeen:   related.length ? related[related.length - 1].date : null,
      };
    });
  }, [contacts, emails]);

  const filtered = useMemo(() => {
    if (!search.trim()) return enriched;
    const q = search.toLowerCase();
    return enriched.filter(c =>
      c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [enriched, search]);

  const saveNew = () => {
    if (!nName.trim() || !nEmail.trim()) return;
    if (contacts.find(c => c.email.toLowerCase() === nEmail.trim().toLowerCase())) {
      alert("A contact with that email already exists.");
      return;
    }
    setContacts(p => [...p, { id: Math.random().toString(36).slice(2), name: nName.trim(), email: nEmail.trim().toLowerCase(), note: nNote.trim() }]);
    setNName(""); setNEmail(""); setNNote(""); setAdding(false);
  };

  const saveEdit = () => {
    if (!editing.name.trim() || !editing.email.trim()) return;
    setContacts(p => p.map(c => c.email === editing._original ? { ...c, name: editing.name, email: editing.email, note: editing.note } : c));
    setEditing(null);
  };

  const [confirmRemove, setConfirmRemove] = useState(null);
  const remove = (email) => setConfirmRemove(email);
  const doRemove = () => { setContacts(p => p.filter(c => c.email !== confirmRemove)); setConfirmRemove(null); };

  const inputStyle = {
    width:"100%", background:T.input, border:`1px solid ${T.border}`,
    borderRadius:8, padding:"8px 12px", fontSize:13, color:T.text,
    fontFamily:"inherit", outline:"none",
  };

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"30px 40px", background:T.surface }}>
      <div style={{ maxWidth:640 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, color:T.text, marginBottom:4 }}>Contacts</h2>
            <p style={{ fontSize:13, color:T.sub }}>{contacts.length} contacts</p>
          </div>
          <button onClick={()=>setAdding(a=>!a)} style={{ background:dark?"#fff":"#111", color:dark?"#111":"#fff", border:"none", borderRadius:8, padding:"8px 16px", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            + Add Contact
          </button>
        </div>

        {/* Add form */}
        {adding && (
          <div style={{ background:T.panel, border:`1.5px solid ${T.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:T.sub, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Name</label>
                <input value={nName} onChange={e=>setNName(e.target.value)} placeholder="Full name" style={inputStyle}/>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:T.sub, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Email</label>
                <input value={nEmail} onChange={e=>setNEmail(e.target.value)} placeholder="email@example.com" type="email" style={inputStyle}/>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, fontWeight:600, color:T.sub, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Note (optional)</label>
              <input value={nNote} onChange={e=>setNNote(e.target.value)} placeholder="e.g. Investor, Client…" style={inputStyle}/>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={saveNew} style={{ background:dark?"#fff":"#111", color:dark?"#111":"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>Save</button>
              <button onClick={()=>setAdding(false)} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 14px", fontFamily:"inherit", fontSize:12, color:T.sub, cursor:"pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{ position:"relative", marginBottom:16 }}>
          <svg style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contacts…"
            style={{ ...inputStyle, paddingLeft:36 }}/>
        </div>

        {/* Contact list */}
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {filtered.length === 0 && (
            <div style={{ padding:40, textAlign:"center", color:T.sub, fontSize:13 }}>
              {search ? "No contacts match your search." : "No contacts yet — they're added automatically when you send email."}
            </div>
          )}
          {filtered.map(c => (
            <div key={c.email} style={{ background:T.panel, border:`1.5px solid ${T.border}`, borderRadius:10, padding:"12px 16px" }}>
              {editing?._original === c.email ? (
                // Edit mode
                <div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                    <input value={editing.name} onChange={e=>setEditing(p=>({...p,name:e.target.value}))} style={{...inputStyle,fontSize:12}} placeholder="Name"/>
                    <input value={editing.email} onChange={e=>setEditing(p=>({...p,email:e.target.value}))} style={{...inputStyle,fontSize:12}} placeholder="Email"/>
                  </div>
                  <input value={editing.note||""} onChange={e=>setEditing(p=>({...p,note:e.target.value}))} style={{...inputStyle,fontSize:12,marginBottom:10}} placeholder="Note"/>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={saveEdit} style={{ background:dark?"#fff":"#111", color:dark?"#111":"#fff", border:"none", borderRadius:7, padding:"6px 14px", fontFamily:"inherit", fontSize:11, fontWeight:600, cursor:"pointer" }}>Save</button>
                    <button onClick={()=>setEditing(null)} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:7, padding:"6px 12px", fontFamily:"inherit", fontSize:11, color:T.sub, cursor:"pointer" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  {/* Avatar */}
                  <div style={{ width:38, height:38, borderRadius:10, background:dark?"#2a2a2a":"#e8e8e8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:700, color:dark?"#aaa":"#555", flexShrink:0 }}>
                    {c.name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{c.name}</div>
                    <div style={{ fontSize:12, color:T.sub }}>{c.email}</div>
                    {c.note && <div style={{ fontSize:11, color:T.sub, marginTop:2, fontStyle:"italic" }}>{c.note}</div>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                    {c.emailCount > 0 && (
                      <span style={{ fontSize:10, color:T.sub, background:dark?"#222":"#eee", borderRadius:10, padding:"2px 7px" }}>
                        {c.emailCount} email{c.emailCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    <button onClick={()=>setEditing({...c, _original:c.email})} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:7, padding:"4px 10px", fontSize:11, color:T.sub, cursor:"pointer", fontFamily:"inherit" }}>Edit</button>
                    <button onClick={()=>remove(c.email)} style={{ background:"none", border:"1px solid #ffbbbb", borderRadius:7, padding:"4px 10px", fontSize:11, color:"#cc4444", cursor:"pointer", fontFamily:"inherit" }}>Remove</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      {/* Confirm remove dialog */}
      {confirmRemove&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface||"#fff",border:`1px solid ${T.border||"#e4e4e4"}`,borderRadius:12,padding:28,width:320,boxShadow:"0 24px 64px rgba(0,0,0,0.25)"}}>
            <div style={{fontSize:15,fontWeight:700,color:T.text||"#111",marginBottom:8}}>Remove contact?</div>
            <div style={{fontSize:13,color:T.sub||"#888",marginBottom:20}}>{confirmRemove}</div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setConfirmRemove(null)} style={{background:"none",border:`1px solid ${T.border||"#e4e4e4"}`,borderRadius:8,padding:"7px 14px",fontSize:12,cursor:"pointer",fontFamily:"inherit",color:T.text||"#111"}}>Cancel</button>
              <button onClick={doRemove} style={{background:"#cc4444",color:"#fff",border:"none",borderRadius:8,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Remove</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
