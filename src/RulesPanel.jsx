/**
 * src/RulesPanel.jsx
 * Email rules / filters — automatically label, archive, or move emails
 * based on sender, subject, or keywords.
 *
 * Rules are evaluated client-side when new messages are loaded.
 * They're stored in prefs so they sync across devices.
 */

import { useState } from "react";

const CONDITION_FIELDS  = ["from", "to", "subject", "body"];
const CONDITION_OPS     = ["contains", "is", "starts with", "ends with"];
const ACTION_TYPES      = ["label", "archive", "move", "mark read", "star", "delete"];

function emptyRule() {
  return {
    id:        Math.random().toString(36).slice(2),
    name:      "",
    enabled:   true,
    condition: { field: "from", op: "contains", value: "" },
    action:    { type: "label", labelId: "", folder: "Archive" },
  };
}

export default function RulesPanel({ rules, setRules, labels, dark, T }) {
  const [editing,  setEditing]  = useState(null);
  const [adding,   setAdding]   = useState(false);
  const [draft,    setDraft]    = useState(null);

  const startAdd = () => {
    setDraft(emptyRule());
    setAdding(true);
    setEditing(null);
  };

  const startEdit = (rule) => {
    setDraft({ ...rule, condition: { ...rule.condition }, action: { ...rule.action } });
    setEditing(rule.id);
    setAdding(false);
  };

  const save = () => {
    if (!draft.condition.value.trim()) return;
    if (adding) setRules(p => [...p, draft]);
    else        setRules(p => p.map(r => r.id === draft.id ? draft : r));
    setDraft(null); setAdding(false); setEditing(null);
  };

  const toggle  = (id) => setRules(p => p.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  const remove  = (id) => { if (window.confirm("Delete this rule?")) setRules(p => p.filter(r => r.id !== id)); };
  const cancel  = ()   => { setDraft(null); setAdding(false); setEditing(null); };

  const ALL_FOLDERS = ["Inbox","Archive","Trash","Spam","Starred"];

  const inputStyle = {
    background: T.input, border: `1px solid ${T.border}`, borderRadius: 7,
    padding: "7px 10px", fontSize: 12, color: T.text, fontFamily: "inherit", outline: "none",
  };
  const selectStyle = { ...inputStyle, cursor: "pointer" };

  const RuleForm = () => !draft ? null : (
    <div style={{ background:T.panel, border:`1.5px solid ${T.border}`, borderRadius:12, padding:20, marginBottom:20 }}>
      <div style={{ marginBottom:12 }}>
        <label style={{ fontSize:11, fontWeight:600, color:T.sub, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Rule name</label>
        <input value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} placeholder="e.g. Archive newsletters" style={{...inputStyle,width:"100%"}}/>
      </div>

      <div style={{ fontSize:11, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>When</div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <select value={draft.condition.field} onChange={e=>setDraft(p=>({...p,condition:{...p.condition,field:e.target.value}}))} style={selectStyle}>
          {CONDITION_FIELDS.map(f=><option key={f} value={f}>{f}</option>)}
        </select>
        <select value={draft.condition.op} onChange={e=>setDraft(p=>({...p,condition:{...p.condition,op:e.target.value}}))} style={selectStyle}>
          {CONDITION_OPS.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
        <input value={draft.condition.value} onChange={e=>setDraft(p=>({...p,condition:{...p.condition,value:e.target.value}}))}
          placeholder="Value…" style={{...inputStyle,flex:1,minWidth:120}}/>
      </div>

      <div style={{ fontSize:11, fontWeight:700, color:T.sub, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Then</div>
      <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
        <select value={draft.action.type} onChange={e=>setDraft(p=>({...p,action:{...p.action,type:e.target.value}}))} style={selectStyle}>
          {ACTION_TYPES.map(a=><option key={a} value={a}>{a}</option>)}
        </select>
        {draft.action.type === "label" && (
          <select value={draft.action.labelId} onChange={e=>setDraft(p=>({...p,action:{...p.action,labelId:e.target.value}}))} style={selectStyle}>
            <option value="">Choose label…</option>
            {labels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        {draft.action.type === "move" && (
          <select value={draft.action.folder} onChange={e=>setDraft(p=>({...p,action:{...p.action,folder:e.target.value}}))} style={selectStyle}>
            {ALL_FOLDERS.map(f=><option key={f} value={f}>{f}</option>)}
          </select>
        )}
      </div>

      <div style={{ display:"flex", gap:8 }}>
        <button onClick={save} style={{ background:dark?"#fff":"#111", color:dark?"#111":"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>
          {adding ? "Add Rule" : "Save Rule"}
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
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, color:T.text, marginBottom:4 }}>Rules & Filters</h2>
            <p style={{ fontSize:13, color:T.sub }}>Automatically process incoming emails.</p>
          </div>
          <button onClick={startAdd} style={{ background:dark?"#fff":"#111", color:dark?"#111":"#fff", border:"none", borderRadius:8, padding:"8px 16px", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            + New Rule
          </button>
        </div>

        <div style={{ marginTop:20 }}>
          {(adding || editing) && {RuleForm()}}

          {rules.length === 0 && !adding && (
            <div style={{ padding:40, textAlign:"center", color:T.sub, fontSize:13 }}>
              No rules yet. Add a rule to automatically label, archive, or move emails.
            </div>
          )}

          {rules.map(rule => (
            <div key={rule.id} style={{ background:T.panel, border:`1.5px solid ${T.border}`, borderRadius:10, padding:"12px 16px", marginBottom:8, opacity:rule.enabled?1:0.55 }}>
              {editing === rule.id ? null : (
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:3 }}>
                      {rule.name || `If ${rule.condition.field} ${rule.condition.op} "${rule.condition.value}"`}
                    </div>
                    <div style={{ fontSize:11, color:T.sub }}>
                      When <strong style={{color:T.text}}>{rule.condition.field}</strong> {rule.condition.op} <em>"{rule.condition.value}"</em>
                      {" → "}
                      <strong style={{color:T.text}}>{rule.action.type}</strong>
                      {rule.action.type==="label"&&rule.action.labelId ? ` "${labels.find(l=>l.id===rule.action.labelId)?.name||"?"}"` : ""}
                      {rule.action.type==="move" ? ` to ${rule.action.folder}` : ""}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                    {/* Enable/disable toggle */}
                    <div onClick={()=>toggle(rule.id)} style={{ width:36, height:20, borderRadius:10, background:rule.enabled?(dark?"#fff":"#111"):"#ccc", position:"relative", cursor:"pointer", flexShrink:0 }}>
                      <div style={{ width:14, height:14, borderRadius:"50%", background:rule.enabled?(dark?"#111":"#fff"):"#fff", position:"absolute", top:3, left:rule.enabled?19:3, transition:"left 0.15s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
                    </div>
                    <button onClick={()=>startEdit(rule)} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:7, padding:"3px 10px", fontSize:11, color:T.sub, cursor:"pointer", fontFamily:"inherit" }}>Edit</button>
                    <button onClick={()=>remove(rule.id)} style={{ background:"none", border:"1px solid #ffbbbb", borderRadius:7, padding:"3px 10px", fontSize:11, color:"#cc4444", cursor:"pointer", fontFamily:"inherit" }}>Delete</button>
                  </div>
                </div>
              )}
              {editing === rule.id && {RuleForm()}}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Apply rules to an email object. Returns modified email.
 * Call this on every incoming message before adding to state.
 */
export function applyRules(email, rules, labels) {
  let e = { ...email };
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const { field, op, value } = rule.condition;
    const haystack = (e[field] || e[fieldToKey(field)] || "").toLowerCase();
    const needle   = value.toLowerCase();
    let match = false;
    if (op === "contains")    match = haystack.includes(needle);
    if (op === "is")          match = haystack === needle;
    if (op === "starts with") match = haystack.startsWith(needle);
    if (op === "ends with")   match = haystack.endsWith(needle);
    if (!match) continue;

    const { type, labelId, folder } = rule.action;
    if (type === "label" && labelId) {
      if (!e.labels.includes(labelId)) e.labels = [...e.labels, labelId];
    } else if (type === "archive")    { e.folder = "Archive"; }
    else if (type === "move")         { e.folder = folder || "Archive"; }
    else if (type === "mark read")    { e.unread = false; }
    else if (type === "star")         { e.starred = true; }
    else if (type === "delete")       { e.folder = "Trash"; }
  }
  return e;
}

function fieldToKey(field) {
  const map = { from:"fromEmail", to:"to", subject:"subject", body:"body" };
  return map[field] || field;
}
