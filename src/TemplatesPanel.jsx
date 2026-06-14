/**
 * src/TemplatesPanel.jsx
 * Manage reusable email templates / canned responses.
 * Templates appear in compose via a picker button.
 */

import { useState } from "react";

export default function TemplatesPanel({ templates, setTemplates, dark, T }) {
  const [editing, setEditing] = useState(null);
  const [adding,  setAdding]  = useState(false);
  const [draft,   setDraft]   = useState({ name:"", subject:"", body:"" });

  const startAdd  = () => { setDraft({ name:"", subject:"", body:"" }); setAdding(true); setEditing(null); };
  const startEdit = (t) => { setDraft({ ...t }); setEditing(t.id); setAdding(false); };

  const save = () => {
    if (!draft.name.trim() || !draft.body.trim()) return;
    if (adding) {
      setTemplates(p => [...p, { ...draft, id: Math.random().toString(36).slice(2) }]);
    } else {
      setTemplates(p => p.map(t => t.id === draft.id ? draft : t));
    }
    setDraft({ name:"", subject:"", body:"" }); setAdding(false); setEditing(null);
  };

  const remove = (id) => { if (window.confirm("Delete this template?")) setTemplates(p => p.filter(t => t.id !== id)); };
  const cancel = ()   => { setDraft({ name:"", subject:"", body:"" }); setAdding(false); setEditing(null); };

  const inputStyle = {
    width:"100%", background:T.input, border:`1px solid ${T.border}`,
    borderRadius:8, padding:"8px 12px", fontSize:13, color:T.text,
    fontFamily:"inherit", outline:"none",
  };

  const Form = () => (
    <div style={{ background:T.panel, border:`1.5px solid ${T.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
      <div style={{ marginBottom:12 }}>
        <label style={{ fontSize:11, fontWeight:600, color:T.sub, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Template name</label>
        <input value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} placeholder="e.g. Introduction, Follow-up…" style={inputStyle}/>
      </div>
      <div style={{ marginBottom:12 }}>
        <label style={{ fontSize:11, fontWeight:600, color:T.sub, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Subject (optional)</label>
        <input value={draft.subject} onChange={e=>setDraft(p=>({...p,subject:e.target.value}))} placeholder="Pre-filled subject line" style={inputStyle}/>
      </div>
      <div style={{ marginBottom:16 }}>
        <label style={{ fontSize:11, fontWeight:600, color:T.sub, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Body</label>
        <textarea value={draft.body} onChange={e=>setDraft(p=>({...p,body:e.target.value}))} placeholder="Write your template…" rows={6}
          style={{ ...inputStyle, resize:"vertical", lineHeight:1.6 }}/>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={save} style={{ background:dark?"#fff":"#111", color:dark?"#111":"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>
          {adding ? "Add Template" : "Save"}
        </button>
        <button onClick={cancel} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 14px", fontFamily:"inherit", fontSize:12, color:T.sub, cursor:"pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"30px 40px", background:T.surface }}>
      <div style={{ maxWidth:620 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, color:T.text, marginBottom:4 }}>Templates</h2>
            <p style={{ fontSize:13, color:T.sub }}>Reusable email templates. Insert them from compose.</p>
          </div>
          <button onClick={startAdd} style={{ background:dark?"#fff":"#111", color:dark?"#111":"#fff", border:"none", borderRadius:8, padding:"8px 16px", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            + New Template
          </button>
        </div>

        {(adding || editing) && <Form/>}

        {templates.length === 0 && !adding && (
          <div style={{ padding:40, textAlign:"center", color:T.sub, fontSize:13 }}>
            No templates yet. Create one to speed up common replies.
          </div>
        )}

        {templates.map(t => (
          <div key={t.id} style={{ background:T.panel, border:`1.5px solid ${T.border}`, borderRadius:10, padding:"14px 16px", marginBottom:8 }}>
            {editing === t.id ? null : (
              <div>
                <div style={{ display:"flex", alignItems:"flex-start", gap:12, justifyContent:"space-between" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:4 }}>{t.name}</div>
                    {t.subject && <div style={{ fontSize:11, color:T.sub, marginBottom:4 }}>Subject: {t.subject}</div>}
                    <div style={{ fontSize:12, color:T.sub, whiteSpace:"pre-wrap", maxHeight:60, overflow:"hidden", WebkitLineClamp:3, display:"-webkit-box", WebkitBoxOrient:"vertical" }}>
                      {t.body}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                    <button onClick={()=>startEdit(t)} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:7, padding:"4px 10px", fontSize:11, color:T.sub, cursor:"pointer", fontFamily:"inherit" }}>Edit</button>
                    <button onClick={()=>remove(t.id)} style={{ background:"none", border:"1px solid #ffbbbb", borderRadius:7, padding:"4px 10px", fontSize:11, color:"#cc4444", cursor:"pointer", fontFamily:"inherit" }}>Delete</button>
                  </div>
                </div>
              </div>
            )}
            {editing === t.id && <Form/>}
          </div>
        ))}
      </div>
    </div>
  );
}
