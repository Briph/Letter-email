import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import UpdateBanner from "./UpdateBanner";
import AddAccountWizard from "./AddAccountWizard";
import HtmlEmailView from "./HtmlEmailView";
import ContactsPanel from "./ContactsPanel";
import RulesPanel, { applyRules } from "./RulesPanel";
import TemplatesPanel from "./TemplatesPanel";
import { accounts as accountsApi, labels as labelsApi, settings as settingsApi, mail as mailApi } from "./api";

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCOUNT_COLORS = ["#b8ddb0","#aec6e8","#e8b0c4","#b0cce8","#c4b0e8","#b0e8d8","#f0c8a8","#d0e8b0"];
const LABEL_COLORS   = ["#fbb8b8","#b8d4f8","#b8f0d4","#fde8b8","#d4b8f8","#f8c8e4","#c8f8b8","#b8eef8"];
const uid     = () => Math.random().toString(36).slice(2,9);
const nowStr  = () => new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
const ALL_FOLDERS = ["Inbox","Snoozed","Sent","Drafts","Scheduled","Archive","Trash"];
let _seq = 100;
const nextSeq = () => ++_seq;

const isElectron = !!window.electronAPI;

const DEFAULT_PREFS = {
  dark: false,
  density: "comfortable",
  readingPane: "right",
  undoSendWindow: 5,
  autoMarkReadDelay: 0,
  senderDisplay: "both",
  threadGrouping: true,
  previewLines: 2,
  sortOrder: "newest",
  notifications: true,
  confirmDelete: false,
  shortcuts: true,
  defaultReply: "reply",
  fontSize: "medium",
  // New prefs
  vacation: { enabled: false, subject: "Out of office", body: "I'm currently out of the office and will reply when I return.", startDate: "", endDate: "" },
  pageSize: 50,  // messages per page
};

const FONT_SIZE_MAP = { small:12, medium:14, large:16 };
const DENSITY_MAP   = { compact:8, comfortable:11, cozy:15 };

const INIT_ACCOUNTS = [
  { id:"work",     name:"Work",         email:"alex@company.io", color:"#b8ddb0", isDefault:true,  signature:"Best,\nAlex Hayes\nSenior PM, Company Inc." },
  { id:"personal", name:"Personal",     email:"alex@gmail.com",  color:"#aec6e8", isDefault:false, signature:"Cheers,\nAlex" },
  { id:"side",     name:"Side Project", email:"alex@startup.co", color:"#e8b0c4", isDefault:false, signature:"Alex Hayes\nCo-founder, Startup Co." },
];
const INIT_LABELS = [
  { id:"l1", name:"Finance",   color:"#b8f0d4" },
  { id:"l2", name:"Follow-up", color:"#fbb8b8" },
  { id:"l3", name:"Reading",   color:"#b8d4f8" },
];
const INIT_CONTACTS = [
  { name:"Sarah Chen",  email:"sarah@company.io"   },
  { name:"Marcus Webb", email:"marcus@startup.co"  },
  { name:"Julia Park",  email:"julia@meridian.vc"  },
  { name:"Mom",         email:"linda@gmail.com"    },
  { name:"James",       email:"james.ok@gmail.com" },
  { name:"HR Team",     email:"hr@company.io"      },
];
const INIT_EMAILS = [
  { id:"e1",  seq:1,  threadId:"t1",  account:"work",     folder:"Inbox",   from:"Sarah Chen",  fromEmail:"sarah@company.io",    to:"alex@company.io",   cc:"",                   subject:"Q2 roadmap review — action needed",      preview:"I've gone through the updated roadmap and have a few thoughts before Friday...", body:"Hi Alex,\n\nI've gone through the updated roadmap and have a few thoughts before we present to the board on Friday. Can we sync this afternoon?\n\nI think we need to revisit the timeline for the authentication module — the engineers are pushing back on the 3-week estimate.\n\nSarah", time:"9:41 AM",  date:"Today",     unread:true,  starred:true,  labels:["l2"], attachments:[], snoozedUntil:null, scheduledFor:null },
  { id:"e1b", seq:2,  threadId:"t1",  account:"work",     folder:"Inbox",   from:"You",         fromEmail:"alex@company.io",     to:"sarah@company.io",  cc:"",                   subject:"re: Q2 roadmap review — action needed",  preview:"Happy to sync — how about 3pm today?",                                         body:"Happy to sync — how about 3pm today? I'll send a calendar invite.\n\nAlex",       time:"10:02 AM", date:"Today",     unread:false, starred:false, labels:[],     attachments:[], snoozedUntil:null, scheduledFor:null },
  { id:"e2",  seq:3,  threadId:"t2",  account:"personal", folder:"Inbox",   from:"Mom",         fromEmail:"linda@gmail.com",      to:"alex@gmail.com",    cc:"",                   subject:"Thanksgiving plans 🍂",                  preview:"Just checking if you're still coming home for the long weekend...",             body:"Honey!\n\nJust checking if you're still coming home for the long weekend. Your aunt Karen will be here and keeps asking about you.\n\nLots of love, Mom ❤️", time:"8:15 AM",  date:"Today",     unread:true,  starred:false, labels:[],     attachments:[], snoozedUntil:null, scheduledFor:null },
  { id:"e3",  seq:4,  threadId:"t3",  account:"side",     folder:"Inbox",   from:"Marcus Webb", fromEmail:"marcus@startup.co",    to:"alex@startup.co",   cc:"",                   subject:"Investor intro — Meridian Capital",      preview:"Just heard back from Julia at Meridian. She's interested in a 30-min call...",   body:"Hey,\n\nJust heard back from Julia at Meridian. She's interested in a 30-min intro call. I can make the intro if you want to move fast — her fund closes in 6 weeks.\n\nM", time:"7:00 PM",  date:"Yesterday", unread:true,  starred:true,  labels:["l1"], attachments:[{name:"Term Sheet Draft.pdf",size:"84 KB"}], snoozedUntil:null, scheduledFor:null },
  { id:"e4",  seq:5,  threadId:"t4",  account:"work",     folder:"Inbox",   from:"Dev Digest",  fromEmail:"noreply@devdigest.io", to:"alex@company.io",   cc:"",                   subject:"This week in TypeScript",                preview:"TypeScript 5.4 dropped serious improvements to type inference...",               body:"TypeScript 5.4 dropped serious improvements to type inference for closures.\n\nHere's what changed and why it matters for large codebases.", time:"6:00 AM",  date:"Yesterday", unread:false, starred:false, labels:["l3"], attachments:[], snoozedUntil:null, scheduledFor:null },
  { id:"e5",  seq:6,  threadId:"t5",  account:"personal", folder:"Inbox",   from:"Spotify",     fromEmail:"noreply@spotify.com",  to:"alex@gmail.com",    cc:"",                   subject:"Your Wrapped is here 🎵",                preview:"You listened to 47,000 minutes of music this year...",                           body:"You listened to 47,000 minutes of music this year.\n\nColdplay was your #1 artist.",  time:"9:00 AM",  date:"Monday",    unread:false, starred:false, labels:[],     attachments:[], snoozedUntil:null, scheduledFor:null },
  { id:"e6",  seq:7,  threadId:"t6",  account:"work",     folder:"Archive", from:"Notion",      fromEmail:"team@notion.so",       to:"alex@company.io",   cc:"",                   subject:"Workspace approaching its limit",        preview:"Your team workspace has used 89% of its file storage...",                        body:"Your team workspace has used 89% of its file storage.\n\nUpgrade to keep collaborating.", time:"3:00 PM",  date:"Monday",    unread:false, starred:false, labels:[],     attachments:[], snoozedUntil:null, scheduledFor:null },
  { id:"e7",  seq:8,  threadId:"t7",  account:"side",     folder:"Inbox",   from:"Stripe",      fromEmail:"noreply@stripe.com",   to:"alex@startup.co",   cc:"",                   subject:"Payment received: $420.00",              preview:"A payment of $420.00 USD has been deposited to your bank account...",            body:"A payment of $420.00 USD has been deposited to your bank account ending in 4242.\n\nExpected arrival: 2 business days.", time:"11:00 AM", date:"Sunday",    unread:false, starred:true,  labels:["l1"], attachments:[{name:"Receipt_420.pdf",size:"12 KB"}], snoozedUntil:null, scheduledFor:null },
  { id:"e8",  seq:9,  threadId:"t8",  account:"personal", folder:"Sent",    from:"You",         fromEmail:"alex@gmail.com",       to:"james.ok@gmail.com",cc:"",                   subject:"re: weekend plans",                      preview:"Yeah Saturday works! Let's do 7pm at that ramen place.",                         body:"Yeah Saturday works! Let's do 7pm at that ramen place. I'll book it — see you there!", time:"2:00 PM",  date:"Sunday",    unread:false, starred:false, labels:[],     attachments:[], snoozedUntil:null, scheduledFor:null },
  { id:"e9",  seq:10, threadId:"t9",  account:"work",     folder:"Drafts",  from:"You",         fromEmail:"alex@company.io",      to:"hr@company.io",     cc:"",                   subject:"PTO request — Dec 23–Jan 2",             preview:"I wanted to submit a formal PTO request for the holiday period...",              body:"Hi,\n\nI wanted to submit a formal PTO request for the holiday period (Dec 23 – Jan 2).\n\nThanks,\nAlex", time:"10:00 AM", date:"Friday",    unread:false, starred:false, labels:[],     attachments:[], snoozedUntil:null, scheduledFor:null },
  { id:"e10", seq:11, threadId:"t10", account:"work",     folder:"Inbox",   from:"Julia Park",  fromEmail:"julia@meridian.vc",    to:"alex@company.io",   cc:"marcus@startup.co", subject:"Introduction: Alex <> Meridian Capital", preview:"Marcus mentioned you're building something interesting. Would love to chat...",   body:"Hi Alex,\n\nMarcus mentioned you're building something interesting in the developer tooling space.\n\nWould love to find 30 minutes to connect — are you free next week?\n\nBest,\nJulia\nMeridian Capital", time:"4:22 PM",  date:"Today",     unread:true,  starred:false, labels:["l2"], attachments:[], snoozedUntil:null, scheduledFor:null },
];

// ─── Tiny components ──────────────────────────────────────────────────────────
function AccountBadge({ account, size=28 }) {
  if (!account) return null;
  const initials = account.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return <div style={{width:size,height:size,borderRadius:7,background:account.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.32,fontWeight:700,color:"#222",flexShrink:0,border:"1.5px solid rgba(0,0,0,0.08)"}}>{initials}</div>;
}

function Tooltip({ label, children }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{position:"relative",display:"inline-flex"}} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      {children}
      {show && <div style={{position:"absolute",top:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",background:"#111",color:"#fff",fontSize:10,padding:"3px 8px",borderRadius:5,whiteSpace:"nowrap",pointerEvents:"none",zIndex:1999}}>{label}</div>}
    </div>
  );
}

function Toast({ toasts }) {
  return (
    <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",display:"flex",flexDirection:"column",gap:8,zIndex:9999,pointerEvents:"none"}}>
      {toasts.map(t=>(
        <div key={t.id} style={{background:"#111",color:"#fff",padding:"10px 18px",borderRadius:8,fontSize:12,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",display:"flex",alignItems:"center",gap:10,animation:"fadeUp 0.2s ease",pointerEvents:"all"}}>
          <span>{t.msg}</span>
          {t.undo   && <button onClick={t.undo}   style={{background:"none",border:"1px solid rgba(255,255,255,0.3)",color:"#fff",padding:"2px 8px",borderRadius:4,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>UNDO</button>}
          {t.action && <button onClick={t.action.fn} style={{background:"none",border:"1px solid rgba(255,255,255,0.3)",color:"#fff",padding:"2px 8px",borderRadius:4,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

function ContactInput({ value, onChange, placeholder, contacts, dark }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  useEffect(()=>setQuery(value),[value]);
  const matches = contacts.filter(c=>query.length>0&&(c.name.toLowerCase().includes(query.toLowerCase())||c.email.toLowerCase().includes(query.toLowerCase()))).slice(0,5);
  const db = dark ? {bg:"#161616",border:"#242424",hover:"#1e1e1e",text:"#f0f0f0",sub:"#888",avBg:"#2a2a2a",avText:"#aaa"} : {bg:"#fff",border:"#e4e4e4",hover:"#f4f4f4",text:"#111",sub:"#888",avBg:"#eee",avText:"#666"};
  return (
    <div style={{position:"relative",flex:1}}>
      <input value={query} onChange={e=>{setQuery(e.target.value);onChange(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),150)} placeholder={placeholder} style={{width:"100%",background:"none",border:"none",fontSize:12,padding:"10px 0",color:"inherit"}}/>
      {open&&matches.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,background:db.bg,border:`1.5px solid ${db.border}`,borderRadius:8,zIndex:200,boxShadow:"0 8px 24px rgba(0,0,0,0.18)",overflow:"hidden"}}>
          {matches.map(c=>(
            <div key={c.email} onMouseDown={()=>{setQuery(c.email);onChange(c.email);setOpen(false);}} style={{padding:"8px 12px",cursor:"pointer",display:"flex",gap:8,alignItems:"center",fontSize:12,transition:"background 0.1s"}} onMouseEnter={e=>e.currentTarget.style.background=db.hover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{width:22,height:22,borderRadius:5,background:db.avBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:db.avText,flexShrink:0}}>{c.name[0]}</div>
              <div><div style={{fontWeight:500,color:db.text}}>{c.name}</div><div style={{fontSize:10,color:db.sub}}>{c.email}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LabelChip({ label, onRemove, size="sm" }) {
  if (!label) return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:3,background:label.color,borderRadius:10,padding:size==="sm"?"2px 7px":"3px 10px",fontSize:size==="sm"?9:10,fontWeight:500,color:"#222",whiteSpace:"nowrap"}}>
      {label.name}
      {onRemove&&<span onClick={e=>{e.stopPropagation();onRemove();}} style={{cursor:"pointer",opacity:0.6,marginLeft:1,fontSize:9}}>✕</span>}
    </span>
  );
}

function RichBar({ onFormat, dark }) {
  const col = dark?"#aaa":"#666";
  const hov = dark?"rgba(255,255,255,0.07)":"#eee";
  const div = dark?"#2a2a2a":"#e8e8e8";
  const btn = (lbl,title,fn)=>(
    <Tooltip label={title}>
      <button onMouseDown={e=>{e.preventDefault();fn();}} style={{background:"none",border:"none",cursor:"pointer",color:col,padding:"3px 6px",borderRadius:4,fontSize:12,fontFamily:"serif",fontWeight:lbl==="B"?"700":"400",fontStyle:lbl==="I"?"italic":"normal"}} onMouseEnter={e=>e.currentTarget.style.background=hov} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{lbl}</button>
    </Tooltip>
  );
  return (
    <div style={{display:"flex",alignItems:"center",gap:2,padding:"4px 8px",borderBottom:`1px solid ${div}`}}>
      {btn("B","Bold",()=>onFormat("bold"))}{btn("I","Italic",()=>onFormat("italic"))}{btn("U̲","Underline",()=>onFormat("underline"))}
      <div style={{width:1,height:14,background:div,margin:"0 4px"}}/>
      {btn("•","Bullet list",()=>onFormat("list"))}{btn("1.","Numbered list",()=>onFormat("olist"))}
      <div style={{width:1,height:14,background:div,margin:"0 4px"}}/>
      {btn('"',"Quote",()=>onFormat("quote"))}{btn("✕","Clear format",()=>onFormat("clear"))}
    </div>
  );
}

function SnoozePicker({ onSnooze, onClose, dark }) {
  const bg=dark?"#161616":"#fff", bd=dark?"#242424":"#e4e4e4", tx=dark?"#f0f0f0":"#111";
  const opts=[{label:"Later today",sub:"5:00 PM",hours:5},{label:"Tomorrow",sub:"8:00 AM",hours:20},{label:"This weekend",sub:"Sat 8:00 AM",hours:48},{label:"Next week",sub:"Mon 8:00 AM",hours:72}];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:bg,border:`1.5px solid ${bd}`,borderRadius:12,padding:24,width:280,boxShadow:"0 24px 64px rgba(0,0,0,0.2)"}}>
        <div style={{fontSize:12,fontWeight:600,color:tx,marginBottom:16}}>Snooze until…</div>
        {opts.map(o=>(
          <div key={o.label} onClick={()=>onSnooze(o.hours)} style={{padding:"10px 14px",borderRadius:8,cursor:"pointer",display:"flex",justifyContent:"space-between",marginBottom:4}} onMouseEnter={e=>e.currentTarget.style.background=dark?"#1e1e1e":"#f4f4f4"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{fontSize:13,color:tx}}>{o.label}</span><span style={{fontSize:11,color:"#888"}}>{o.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SendLaterPicker({ onSchedule, onClose, dark }) {
  const bg=dark?"#161616":"#fff", bd=dark?"#242424":"#e4e4e4", tx=dark?"#f0f0f0":"#111";
  const [dt,setDt]=useState("");
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:bg,border:`1.5px solid ${bd}`,borderRadius:12,padding:24,width:300,boxShadow:"0 24px 64px rgba(0,0,0,0.2)"}}>
        <div style={{fontSize:12,fontWeight:600,color:tx,marginBottom:16}}>Schedule send</div>
        <input type="datetime-local" value={dt} onChange={e=>setDt(e.target.value)} style={{width:"100%",background:dark?"#1a1a1a":"#f5f5f5",border:`1px solid ${bd}`,borderRadius:8,padding:"9px 12px",color:tx,fontFamily:"inherit",fontSize:12,marginBottom:14}}/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,background:"none",border:`1px solid ${bd}`,borderRadius:8,padding:"8px",color:tx,cursor:"pointer",fontFamily:"inherit",fontSize:11}}>Cancel</button>
          <button onClick={()=>dt&&onSchedule(dt)} style={{flex:1,background:"#111",color:"#fff",border:"none",borderRadius:8,padding:"8px",cursor:"pointer",fontFamily:"inherit",fontSize:11,opacity:dt?1:0.4}}>Schedule</button>
        </div>
      </div>
    </div>
  );
}

function ThreadView({ emails, threadId, acctMap, dark, onReply, onForward, fontSize }) {
  const thread = useMemo(()=>emails.filter(e=>e.threadId===threadId).sort((a,b)=>a.seq-b.seq),[emails,threadId]);
  const lastId = thread[thread.length-1]?.id;
  const [collapsed, setCollapsed] = useState(()=>new Set(thread.slice(0,-1).map(e=>e.id)));
  const prevLen = useRef(thread.length);
  useEffect(()=>{ if(thread.length>prevLen.current){setCollapsed(p=>{const n=new Set(p);n.delete(lastId);return n;});} prevLen.current=thread.length; },[thread.length,lastId]);
  const bg=dark?"#111":"#fff", bd=dark?"#242424":"#e4e4e4", tx=dark?"#f0f0f0":"#111", sub=dark?"#888":"#888";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {thread.map((email,i)=>{
        const isLast=i===thread.length-1, isColl=collapsed.has(email.id), acct=acctMap[email.account];
        return (
          <div key={email.id} style={{borderRadius:10,overflow:"hidden",background:bg}}>
            <div style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:10,cursor:isLast?"default":"pointer"}} onClick={()=>!isLast&&setCollapsed(p=>{const n=new Set(p);n.has(email.id)?n.delete(email.id):n.add(email.id);return n;})}>
              <AccountBadge account={acct} size={28}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:500,color:tx}}>{email.from}</div>
                {isColl&&<div style={{fontSize:11,color:sub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{email.preview}</div>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                {email.attachments?.length>0&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sub} strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>}
                <span style={{fontSize:10,color:sub}}>{email.time}</span>
                {!isLast&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sub} strokeWidth="2"><polyline points={isColl?"6 9 12 15 18 9":"6 15 12 9 18 15"}/></svg>}
              </div>
            </div>
            {!isColl&&(
              <div style={{padding:"0 16px 16px"}}>
                <div style={{fontSize:11,color:sub,marginBottom:12}}>{email.fromEmail} → {email.to}{email.cc&&` (cc: ${email.cc})`}</div>
                {/* Render HTML email if available, otherwise plain text */}
                {(email.bodyHtml||email.body)?<HtmlEmailView email={email} dark={dark} fontSize={fontSize}/>:null}
                {email.attachments?.length>0&&(
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
                    {email.attachments.map((a,idx)=>(
                      <div key={idx} style={{display:"flex",alignItems:"center",gap:6,background:dark?"#1e1e1e":"#f4f4f4",border:`1px solid ${bd}`,borderRadius:7,padding:"6px 10px"}}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={sub} strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span style={{fontSize:11,color:dark?"#ccc":"#444"}}>{a.name}</span>
                        <span style={{fontSize:10,color:sub}}>{a.size}</span>
                      </div>
                    ))}
                  </div>
                )}
                {isLast&&(
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>onReply(email)} style={{background:"none",border:`1px solid ${bd}`,borderRadius:7,padding:"6px 14px",color:dark?"#ccc":"#444",fontSize:11,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>Reply</button>
                    <button onClick={()=>onForward(email)} style={{background:"none",border:`1px solid ${bd}`,borderRadius:7,padding:"6px 14px",color:dark?"#ccc":"#444",fontSize:11,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>Forward</button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel({ prefs, setPrefs, accounts, setAccounts, labels, setLabels, emails, setEmails, acctFilter, setAcctFilter, T, dark, currentUser, onSignOut, onConnectAccount, onClose }) {
  const [tab, setTab]           = useState("accounts");
  const [addingAcct, setAddingAcct] = useState(false);
  const [addingLabel,setAddingLabel]= useState(false);
  const [nName, setNName]       = useState("");
  const [nEmail,setNEmail]      = useState("");
  const [nColor,setNColor]      = useState(ACCOUNT_COLORS[0]);
  const [nLName,setNLName]      = useState("");
  const [nLColor,setNLColor]    = useState(LABEL_COLORS[0]);
  const [editSig,setEditSig]    = useState(null);

  const syncAccount = async (id) => {
    try { await mailApi.sync(id); } catch(e) { console.warn("Sync failed",e.message); }
  };
  const disconnectAccount = async (id) => {
    if(!window.confirm("Disconnect this account? Your local message cache will be removed.")) return;
    try {
      await mailApi.disconnect(id, true);
      setAccounts(p=>p.map(a=>a.id===id?{...a,connected:false}:a));
    } catch(e) { console.warn("Disconnect failed",e.message); }
  };

  const set = (key,val) => setPrefs(p=>({...p,[key]:val}));
  const setDefault = id => setAccounts(p=>p.map(a=>({...a,isDefault:a.id===id})));

  const addAccount = async ()=>{
    if(!nName.trim()||!nEmail.trim())return;
    // Capture a stable temp id before any async work
    const tempId = uid();
    const newAcct = {id:tempId,name:nName.trim(),email:nEmail.trim(),color:nColor,isDefault:accounts.length===0,signature:""};
    // Optimistic update
    setAccounts(p=>[...p,newAcct]);
    setNName("");setNEmail("");setNColor(ACCOUNT_COLORS[0]);setAddingAcct(false);
    // Sync to server — use functional updater to avoid stale closure over accounts array
    if(currentUser){
      try{
        const saved = await accountsApi.create({name:newAcct.name,email:newAcct.email,color:newAcct.color,signature:newAcct.signature});
        // Replace temp entry by id using functional updater (always fresh state)
        setAccounts(p=>p.map(a=>a.id===tempId ? {...saved} : a));
      }catch(e){ 
        console.warn("Account sync failed:",e.message);
        // Roll back optimistic add on failure
        setAccounts(p=>p.filter(a=>a.id!==tempId));
      }
    }
  };

  const removeAccount = async id=>{
    setAccounts(p=>{ const r=p.filter(a=>a.id!==id); if(r.length&&!r.some(a=>a.isDefault))r[0].isDefault=true; return r; });
    setEmails(p=>p.filter(e=>e.account!==id));
    if(acctFilter===id)setAcctFilter("all");
    if(currentUser){ try{ await accountsApi.remove(id); }catch(e){ console.warn("Remove sync failed:",e.message); } }
  };

  const updateSig=(id,sig)=>{
    setAccounts(p=>p.map(a=>a.id===id?{...a,signature:sig}:a));
    if(currentUser){ accountsApi.update(id,{signature:sig}).catch(()=>{}); }
  };

  const addLabel = async ()=>{
    if(!nLName.trim())return;
    const newLabel = {id:uid(),name:nLName.trim(),color:nLColor};
    setLabels(p=>[...p,newLabel]);
    setNLName("");setNLColor(LABEL_COLORS[0]);setAddingLabel(false);
    if(currentUser){
      try{
        const saved = await labelsApi.create({name:newLabel.name,color:newLabel.color});
        setLabels(p=>p.map(l=>l.id===newLabel.id?saved:l));
      }catch(e){ console.warn("Label sync failed:",e.message); }
    }
  };

  const removeLabel = async id=>{
    setLabels(p=>p.filter(l=>l.id!==id));
    setEmails(p=>p.map(e=>({...e,labels:e.labels.filter(l=>l!==id)})));
    if(currentUser){ try{ await labelsApi.remove(id); }catch(e){ console.warn("Label remove sync failed:",e.message); } }
  };

  const Row = ({label,sub,children})=>(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0",borderBottom:`1px solid ${T.border}`}}>
      <div><div style={{fontSize:13,color:T.text,fontWeight:500}}>{label}</div>{sub&&<div style={{fontSize:11,color:T.sub,marginTop:2}}>{sub}</div>}</div>
      <div style={{flexShrink:0,marginLeft:20}}>{children}</div>
    </div>
  );

  const Toggle = ({val,onChange})=>(
    <div onClick={()=>onChange(!val)} style={{width:42,height:24,borderRadius:12,background:val?(dark?"#fff":"#111"):"#ccc",position:"relative",cursor:"pointer",transition:"background 0.2s",flexShrink:0}}>
      <div style={{width:18,height:18,borderRadius:"50%",background:val?(dark?"#111":"#fff"):"#fff",position:"absolute",top:3,left:val?21:3,transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}/>
    </div>
  );

  const Select = ({val,onChange,options})=>(
    <select value={val} onChange={e=>onChange(e.target.value)} style={{background:T.input,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 10px",color:T.text,fontFamily:"inherit",fontSize:12,cursor:"pointer"}}>
      {options.map(([v,l])=><option key={v} value={v}>{l}</option>)}
    </select>
  );

  const TABS = ["accounts","labels","reading","composing","notifications","shortcuts","general"];

  return (
    <div style={{flex:1,display:"flex",overflow:"hidden"}}>
      {/* Settings sidebar */}
      <div style={{width:180,background:T.panel,borderRight:`1px solid ${T.border}`,padding:"20px 8px",flexShrink:0,overflowY:"auto",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 10px",marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:600,color:T.sub,letterSpacing:"0.08em",textTransform:"uppercase"}}>Settings</div>
          <button onClick={onClose} title="Close settings" style={{background:"none",border:"none",cursor:"pointer",color:T.sub,padding:2,borderRadius:5,display:"flex",alignItems:"center",lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color=T.text} onMouseLeave={e=>e.currentTarget.style.color=T.sub}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {TABS.map(t=>(
          <div key={t} onClick={()=>setTab(t)} style={{padding:"7px 10px",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:tab===t?600:400,color:tab===t?T.text:T.sub,background:tab===t?(dark?"#2a2a2a":"#e8e8e8"):"transparent",marginBottom:2,transition:"all 0.1s",textTransform:"capitalize"}}>
            {t}
          </div>
        ))}
      </div>

      {/* Settings content */}
      <div style={{flex:1,overflowY:"auto",padding:"30px 40px",background:T.surface}}>

        {/* ── ACCOUNTS ── */}
        {tab==="accounts"&&(
          <div style={{maxWidth:560}}>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:6,color:T.text}}>Email Accounts</h2>
            <p style={{fontSize:13,color:T.sub,marginBottom:24}}>Add and manage your email accounts.</p>
            <button onClick={()=>setAddingAcct(a=>!a)} style={{background:dark?"#fff":"#111",color:dark?"#111":"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer",marginBottom:20}}>+ Add Account</button>
            {addingAcct&&(
              <div style={{background:T.panel,border:`1.5px solid ${T.border}`,borderRadius:12,padding:20,marginBottom:20}}>
                {[["Name",nName,setNName,"Work, Newsletter…"],["Email",nEmail,setNEmail,"you@example.com"]].map(([l,v,s,p])=>(
                  <div key={l} style={{marginBottom:12}}>
                    <div style={{fontSize:11,color:T.sub,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div>
                    <input value={v} onChange={e=>s(e.target.value)} placeholder={p} style={{width:"100%",background:T.input,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:T.text}}/>
                  </div>
                ))}
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:11,color:T.sub,fontWeight:600,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>Color</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{ACCOUNT_COLORS.map(c=><div key={c} onClick={()=>setNColor(c)} style={{width:26,height:26,borderRadius:6,background:c,cursor:"pointer",border:nColor===c?"3px solid #111":"2px solid transparent"}}/>)}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={addAccount} style={{background:dark?"#fff":"#111",color:dark?"#111":"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer"}}>Add</button>
                  <button onClick={()=>setAddingAcct(false)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 14px",fontFamily:"inherit",fontSize:12,color:T.sub,cursor:"pointer"}}>Cancel</button>
                </div>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {accounts.map(a=>(
                <div key={a.id} style={{background:T.panel,border:`1.5px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
                  <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
                    <AccountBadge account={a} size={36}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:T.text}}>{a.name}</div>
                      <div style={{fontSize:12,color:T.sub}}>{a.email}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      {a.isDefault?<span style={{fontSize:10,fontWeight:700,background:dark?"#fff":"#111",color:dark?"#111":"#fff",padding:"3px 8px",borderRadius:10,letterSpacing:"0.06em"}}>DEFAULT</span>
                        :<button onClick={()=>setDefault(a.id)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,padding:"4px 10px",fontSize:11,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Set Default</button>}
                      <button onClick={()=>setEditSig(s=>s===a.id?null:a.id)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,padding:"4px 10px",fontSize:11,color:T.sub,cursor:"pointer",fontFamily:"inherit"}}>Signature</button>
                      {currentUser&&(a.connected
                        ?<>
                          <span style={{fontSize:10,color:"#4caf50",fontWeight:600}}>✓ Connected</span>
                          <button onClick={()=>syncAccount(a.id)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,padding:"4px 10px",fontSize:11,color:"#4a90d9",cursor:"pointer",fontFamily:"inherit"}}>Sync</button>
                          <button onClick={()=>disconnectAccount(a.id)} style={{background:"none",border:"1px solid #ffbbbb",borderRadius:7,padding:"4px 10px",fontSize:11,color:"#cc4444",cursor:"pointer",fontFamily:"inherit"}}>Disconnect</button>
                        </>
                        :<button onClick={()=>onConnectAccount?.(a)} style={{background:"#4a90d9",color:"#fff",border:"none",borderRadius:7,padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Connect Inbox</button>
                      )}
                      <button onClick={()=>removeAccount(a.id)} style={{background:"none",border:"1px solid #ffbbbb",borderRadius:7,padding:"4px 10px",fontSize:11,color:"#cc4444",cursor:"pointer",fontFamily:"inherit"}}>Remove</button>
                    </div>
                  </div>
                  {editSig===a.id&&(
                    <div style={{padding:"0 16px 16px",borderTop:`1px solid ${T.border}`}}>
                      <div style={{fontSize:11,color:T.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",margin:"12px 0 6px"}}>Signature</div>
                      <textarea value={a.signature||""} onChange={e=>updateSig(a.id,e.target.value)} style={{width:"100%",background:T.input,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",fontSize:13,lineHeight:1.7,color:T.text,minHeight:90,resize:"vertical",fontFamily:"inherit"}} placeholder="Your signature…"/>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── LABELS ── */}
        {tab==="labels"&&(
          <div style={{maxWidth:520}}>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:6,color:T.text}}>Labels</h2>
            <p style={{fontSize:13,color:T.sub,marginBottom:24}}>Organise emails with colour-coded labels.</p>
            <button onClick={()=>setAddingLabel(a=>!a)} style={{background:dark?"#fff":"#111",color:dark?"#111":"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer",marginBottom:20}}>+ New Label</button>
            {addingLabel&&(
              <div style={{background:T.panel,border:`1.5px solid ${T.border}`,borderRadius:12,padding:20,marginBottom:20}}>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:T.sub,fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Name</div>
                  <input value={nLName} onChange={e=>setNLName(e.target.value)} placeholder="Finance, Travel…" style={{width:"100%",background:T.input,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:T.text}}/>
                </div>
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:11,color:T.sub,fontWeight:600,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>Color</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{LABEL_COLORS.map(c=><div key={c} onClick={()=>setNLColor(c)} style={{width:26,height:26,borderRadius:6,background:c,cursor:"pointer",border:nLColor===c?"3px solid #111":"2px solid transparent"}}/>)}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={addLabel} style={{background:dark?"#fff":"#111",color:dark?"#111":"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer"}}>Add</button>
                  <button onClick={()=>setAddingLabel(false)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 14px",fontFamily:"inherit",fontSize:12,color:T.sub,cursor:"pointer"}}>Cancel</button>
                </div>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {labels.map(l=>(
                <div key={l.id} style={{background:T.panel,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:32,height:32,borderRadius:8,background:l.color,flexShrink:0}}/>
                  <span style={{fontSize:13,fontWeight:500,flex:1,color:T.text}}>{l.name}</span>
                  <button onClick={()=>removeLabel(l.id)} style={{background:"none",border:"1px solid #ffbbbb",borderRadius:7,padding:"4px 10px",fontSize:11,color:"#cc4444",cursor:"pointer",fontFamily:"inherit"}}>Remove</button>
                </div>
              ))}
              {labels.length===0&&<div style={{padding:24,textAlign:"center",color:T.sub,fontSize:13}}>No labels yet.</div>}
            </div>
          </div>
        )}

        {/* ── READING ── */}
        {tab==="reading"&&(
          <div style={{maxWidth:520}}>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:6,color:T.text}}>Reading</h2>
            <p style={{fontSize:13,color:T.sub,marginBottom:24}}>Control how emails are displayed.</p>
            <Row label="Reading pane" sub="Where the email content appears">
              <Select val={prefs.readingPane} onChange={v=>set("readingPane",v)} options={[["right","Right"],["bottom","Bottom"],["off","Off (list only)"]]}/>
            </Row>
            <Row label="Email density" sub="Controls row height and spacing">
              <Select val={prefs.density} onChange={v=>set("density",v)} options={[["compact","Compact"],["comfortable","Comfortable"],["cozy","Cozy"]]}/>
            </Row>
            <Row label="Font size" sub="Size of email body text">
              <Select val={prefs.fontSize} onChange={v=>set("fontSize",v)} options={[["small","Small (12px)"],["medium","Medium (14px)"],["large","Large (16px)"]]}/>
            </Row>
            <Row label="Preview lines" sub="Lines of preview shown in the list">
              <Select val={String(prefs.previewLines)} onChange={v=>set("previewLines",Number(v))} options={[["0","None"],["1","1 line"],["2","2 lines"]]}/>
            </Row>
            <Row label="Sender display" sub="How sender names appear in the list">
              <Select val={prefs.senderDisplay} onChange={v=>set("senderDisplay",v)} options={[["name","Name only"],["email","Email only"],["both","Name and email"]]}/>
            </Row>
            <Row label="Sort order" sub="Order of emails in the list">
              <Select val={prefs.sortOrder} onChange={v=>set("sortOrder",v)} options={[["newest","Newest first"],["oldest","Oldest first"]]}/>
            </Row>
            <Row label="Thread grouping" sub="Group replies into conversations">
              <Toggle val={prefs.threadGrouping} onChange={v=>set("threadGrouping",v)}/>
            </Row>
            <Row label="Auto mark as read" sub="When an email is marked as read">
              <Select val={String(prefs.autoMarkReadDelay)} onChange={v=>set("autoMarkReadDelay",Number(v))} options={[["0","Immediately"],["2000","After 2 seconds"],["5000","After 5 seconds"],["-1","Never (manual only)"]]}/>
            </Row>
          </div>
        )}

        {/* ── COMPOSING ── */}
        {tab==="composing"&&(
          <div style={{maxWidth:520}}>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:6,color:T.text}}>Composing</h2>
            <p style={{fontSize:13,color:T.sub,marginBottom:24}}>Configure how you write and send emails.</p>
            <Row label="Undo send window" sub="How long you can recall a sent email">
              <Select val={String(prefs.undoSendWindow)} onChange={v=>set("undoSendWindow",Number(v))} options={[["5","5 seconds"],["10","10 seconds"],["30","30 seconds"],["0","Disabled"]]}/>
            </Row>
            <Row label="Default reply" sub="What Reply button does by default">
              <Select val={prefs.defaultReply} onChange={v=>set("defaultReply",v)} options={[["reply","Reply"],["replyAll","Reply All"]]}/>
            </Row>
            <Row label="Confirm before delete" sub="Show confirmation when deleting emails">
              <Toggle val={prefs.confirmDelete} onChange={v=>set("confirmDelete",v)}/>
            </Row>
          </div>
        )}

        {/* ── NOTIFICATIONS ── */}
        {tab==="notifications"&&(
          <div style={{maxWidth:520}}>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:6,color:T.text}}>Notifications</h2>
            <p style={{fontSize:13,color:T.sub,marginBottom:24}}>Control how Letter alerts you to new mail.</p>
            <Row label="Enable notifications" sub={isElectron?"Desktop notifications for new emails":"Notifications require the desktop app"}>
              <Toggle val={prefs.notifications&&isElectron} onChange={v=>set("notifications",v)}/>
            </Row>
            {!isElectron&&(
              <div style={{marginTop:16,padding:"14px 16px",background:T.panel,border:`1.5px solid ${T.border}`,borderRadius:10,fontSize:12,color:T.sub,lineHeight:1.7}}>
                💡 Install the <strong style={{color:T.text}}>Letter desktop app</strong> to get native notifications, badge counts, and background mail checking.
              </div>
            )}
          </div>
        )}

        {/* ── SHORTCUTS ── */}
        {tab==="shortcuts"&&(
          <div style={{maxWidth:520}}>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:6,color:T.text}}>Keyboard Shortcuts</h2>
            <p style={{fontSize:13,color:T.sub,marginBottom:24}}>Speed up your workflow.</p>
            <Row label="Enable shortcuts" sub="Global keyboard shortcut support">
              <Toggle val={prefs.shortcuts} onChange={v=>set("shortcuts",v)}/>
            </Row>
            <div style={{marginTop:24,display:"flex",flexDirection:"column",gap:1}}>
              {[
                ["C / ⌘N","Compose new message"],
                ["R","Reply"],
                ["F","Forward"],
                ["E","Archive"],
                ["#","Move to Trash"],
                ["U","Mark as unread"],
                ["H","Snooze"],
                ["Esc","Close / dismiss"],
              ].map(([k,l])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:T.panel,borderRadius:8,marginBottom:4}}>
                  <span style={{fontSize:13,color:T.text}}>{l}</span>
                  <kbd style={{background:dark?"#2a2a2a":"#e0e0e0",borderRadius:5,padding:"2px 8px",fontSize:11,color:T.text,fontFamily:"inherit",border:`1px solid ${T.border}`}}>{k}</kbd>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── GENERAL ── */}
        {tab==="general"&&(
          <div style={{maxWidth:520}}>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:6,color:T.text}}>General</h2>
            <p style={{fontSize:13,color:T.sub,marginBottom:24}}>App-wide preferences.</p>
            <Row label="Dark mode" sub="Use a dark colour scheme">
              <Toggle val={dark} onChange={v=>set("dark",v)}/>
            </Row>
            <Row label="Default send account" sub="Account used for new messages">
              <Select val={accounts.find(a=>a.isDefault)?.id||""} onChange={v=>setAccounts(p=>p.map(a=>({...a,isDefault:a.id===v})))} options={accounts.map(a=>[a.id,`${a.name} (${a.email})`])}/>
            </Row>
            <Row label="Auto-check for updates" sub="Check for new versions every 4 hours">
              <Toggle val={prefs.autoUpdate!==false} onChange={v=>set("autoUpdate",v)}/>
            </Row>
            {isElectron&&(
              <Row label="Check for updates now" sub={window.electronAPI?.appVersion?`Current version: ${window.electronAPI.appVersion}`:""}>
                <button onClick={()=>{ window.electronAPI?.updaterCheck(); }} style={{background:dark?"#fff":"#111",color:dark?"#111":"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer"}}>Check Now</button>
              </Row>
            )}
            {isElectron&&(
              <Row label="App version" sub="Letter desktop app">
                <span style={{fontSize:12,color:T.sub}}>{window.electronAPI?.appVersion||"1.0.0"}</span>
              </Row>
            )}
            <Row label="Messages per page" sub="How many emails to show per page">
              <Select val={String(prefs.pageSize||50)} onChange={v=>set("pageSize",Number(v))} options={[["25","25"],["50","50"],["100","100"],["200","200"]]}/>
            </Row>
            <div style={{marginTop:24,marginBottom:8,fontSize:11,fontWeight:600,color:T.sub,letterSpacing:"0.08em",textTransform:"uppercase"}}>Vacation Responder</div>
            <div style={{background:T.panel,border:`1.5px solid ${T.border}`,borderRadius:12,padding:18,marginBottom:14}}>
              <Row label="Enable vacation responder" sub="Auto-reply to incoming emails">
                <Toggle val={prefs.vacation?.enabled||false} onChange={v=>set("vacation",{...prefs.vacation,enabled:v})}/>
              </Row>
              {prefs.vacation?.enabled&&<>
                <div style={{marginTop:12}}>
                  <div style={{fontSize:11,fontWeight:600,color:T.sub,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Auto-reply subject</div>
                  <input value={prefs.vacation?.subject||""} onChange={e=>set("vacation",{...prefs.vacation,subject:e.target.value})} style={{width:"100%",background:T.input,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:T.text,fontFamily:"inherit",outline:"none"}}/>
                </div>
                <div style={{marginTop:10}}>
                  <div style={{fontSize:11,fontWeight:600,color:T.sub,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Auto-reply message</div>
                  <textarea value={prefs.vacation?.body||""} onChange={e=>set("vacation",{...prefs.vacation,body:e.target.value})} rows={3} style={{width:"100%",background:T.input,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:T.text,fontFamily:"inherit",outline:"none",resize:"vertical"}}/>
                </div>
                <div style={{display:"flex",gap:12,marginTop:10}}>
                  {[["Start date","startDate"],["End date","endDate"]].map(([lbl,key])=>(
                    <div key={key} style={{flex:1}}>
                      <div style={{fontSize:11,fontWeight:600,color:T.sub,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>{lbl} (optional)</div>
                      <input type="date" value={prefs.vacation?.[key]||""} onChange={e=>set("vacation",{...prefs.vacation,[key]:e.target.value})} style={{width:"100%",background:T.input,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:T.text,fontFamily:"inherit",outline:"none"}}/>
                    </div>
                  ))}
                </div>
              </>}
            </div>
            {currentUser&&(<>
              <div style={{marginTop:24,marginBottom:8,fontSize:11,fontWeight:600,color:T.sub,letterSpacing:"0.08em",textTransform:"uppercase"}}>Account</div>
              <div style={{background:T.panel,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"16px 18px",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:4}}>{currentUser.display_name||currentUser.email}</div>
                <div style={{fontSize:12,color:T.sub}}>{currentUser.email}</div>
              </div>
              <button onClick={onSignOut} style={{width:"100%",background:"none",border:`1px solid #ffbbbb`,color:"#cc4444",borderRadius:10,padding:"11px",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer",transition:"background 0.1s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#ffeeee"}
                onMouseLeave={e=>e.currentTarget.style.background="none"}>
                Sign out
              </button>
              <button onClick={()=>{ if(window.confirm("Sign out on all devices? This will revoke all sessions.")) onSignOut(true); }}
                style={{width:"100%",background:"none",border:`1px solid ${T.border}`,color:T.sub,borderRadius:10,padding:"9px",fontFamily:"inherit",fontSize:12,cursor:"pointer",marginTop:8,transition:"background 0.1s"}}
                onMouseEnter={e=>e.currentTarget.style.background=T.hover}
                onMouseLeave={e=>e.currentTarget.style.background="none"}>
                Sign out everywhere
              </button>
            </>)}
            <div style={{marginTop:24,padding:"14px 16px",background:T.panel,border:`1.5px solid ${T.border}`,borderRadius:10,fontSize:12,color:T.sub,lineHeight:1.75}}>
              <strong style={{color:T.text}}>Smart reply:</strong> When replying, Letter automatically uses the account that received the email — not the default send account.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pure utility functions — defined outside component for stable references ──
function formatRelativeDate(iso) {
  const d = new Date(iso), now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) return "Today";
  if (diff < 172800000) return "Yesterday";
  return d.toLocaleDateString([],{month:"short",day:"numeric"});
}
function formatBytes(b) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${Math.round(b/1024)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

// ── Search operator parser ────────────────────────────────────────────────────
// Supports: from:, to:, subject:, has:attachment, before:YYYY-MM-DD, after:YYYY-MM-DD
// Plus free-text fallback
function parseSearchQuery(raw) {
  const tokens = [];
  const opRegex = /(from|to|subject|has|before|after):(\S+)/gi;
  let m;
  // Collect all operator matches first, then strip them all from remainder
  const matched = [];
  while ((m = opRegex.exec(raw)) !== null) {
    tokens.push({ op: m[1].toLowerCase(), val: m[2].toLowerCase() });
    matched.push(m[0]);
  }
  // Remove all matched operator tokens from remainder for free-text
  let remainder = raw;
  for (const tok of matched) remainder = remainder.replace(tok, "");
  remainder = remainder.trim();
  if (remainder) tokens.push({ op: "text", val: remainder.toLowerCase() });
  return tokens;
}

function emailMatchesSearch(email, tokens) {
  for (const { op, val } of tokens) {
    switch (op) {
      case "from":       if (!email.fromEmail?.toLowerCase().includes(val) && !email.from?.toLowerCase().includes(val)) return false; break;
      case "to":         if (!email.to?.toLowerCase().includes(val)) return false; break;
      case "subject":    if (!email.subject?.toLowerCase().includes(val)) return false; break;
      case "has":        if (val === "attachment" && !(email.attachments?.length > 0)) return false; break;
      case "before":     { const d = new Date(val); if (isNaN(d) || (email.seq || 0) >= d.getTime()) return false; break; }
      case "after":      { const d = new Date(val); if (isNaN(d) || (email.seq || 0) <= d.getTime()) return false; break; }
      case "text":       { const q = val; if (!email.from?.toLowerCase().includes(q) && !email.subject?.toLowerCase().includes(q) && !email.preview?.toLowerCase().includes(q) && !email.fromEmail?.toLowerCase().includes(q)) return false; break; }
      default: break;
    }
  }
  return true;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App({ initialAccounts=null, initialLabels=[], initialSettings={}, currentUser=null }) {

  const [accounts,   setAccounts]  = useState(()=> initialAccounts && initialAccounts.length > 0 ? initialAccounts : (initialAccounts === null ? INIT_ACCOUNTS : []));
  const [emails,     setEmails]    = useState(INIT_EMAILS);
  const [labels,     setLabels]    = useState(()=> initialLabels.length   ? initialLabels   : INIT_LABELS);
  const [contacts,   setContacts]  = useState(INIT_CONTACTS);
  const [prefs,      setPrefs]     = useState(()=>({...DEFAULT_PREFS,...initialSettings}));

  // Wizard for connecting real email accounts
  const [wizardAccount, setWizardAccount] = useState(null);

  // Rules, templates, muted threads, reminders
  const [rules,         setRules]         = useState([]);
  const [templates,     setTemplates]     = useState([]);
  const [mutedThreads,  setMutedThreads]  = useState(new Set());
  const [reminders,     setReminders]     = useState([]); // [{id, emailId, remindAt, subject}]
  const [templatePicker,setTemplatePicker]= useState(false);

  // Pagination
  const [page, setPage] = useState(0); // current page index

  // Load real messages from server when user is signed in
  const [serverMessages, setServerMessages] = useState(null); // null = not yet loaded
  // Bug 7 fix: removed dead syncingAcct state

  // Merge server messages into emails when loaded (preserves local mutations)
  useEffect(()=>{
    if(!serverMessages) return;
    setEmails(prev=>{
      const localOnly = prev.filter(e=>(e.folder==="Drafts"||e.folder==="Scheduled") && !serverMessages.find(s=>s.id===e.id));
      const serverIds = new Set(serverMessages.map(m=>m.id));
      return prev
        .filter(e=>!serverIds.has(e.id))
        .concat(serverMessages)
        .concat(localOnly.filter(e=>!serverIds.has(e.id)));
    });
  },[serverMessages]);

  const loadServerMessages = useCallback(async () => {
    if (!currentUser) return;
    try {
      const { messages } = await mailApi.getMessages({ limit: 200 });
      // Bug 2 fix: always set serverMessages even if empty ([])
      // so the merge useEffect fires and clears demo emails for connected accounts
      const converted = (messages || []).map(m => {
        const base = {
          id:          m.id,
          seq:         new Date(m.date).getTime(),
          threadId:    m.threadId || m.id,
          account:     m.accountId,
          folder:      m.folder,
          from:        m.from || m.fromEmail,
          fromEmail:   m.fromEmail,
          to:          m.to,
          cc:          m.cc,
          subject:     m.subject,
          preview:     m.preview,
          body:        m.body,
          bodyHtml:    m.bodyHtml || "",
          time:        new Date(m.date).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
          date:        formatRelativeDate(m.date),
          unread:      m.unread,
          starred:     m.starred,
          labels:      m.labels || [],
          attachments: (m.attachments||[]).map(a=>({name:a.filename||a.name,size:formatBytes(a.size)})),
          snoozedUntil:null, scheduledFor:null,
          unsubscribeUrl: m.unsubscribeUrl || null,
          muted:       false,
        };
        // Apply user-defined rules to each incoming message
        return applyRules(base, rules, labels);
      });
      setServerMessages(converted);
    } catch(e) { console.warn("Could not load server messages:", e.message); }
  }, [currentUser, rules, labels]);

  useEffect(() => { loadServerMessages(); }, [loadServerMessages]);

  // Nav
  const [acctFilter, setAcctFilter] = useState("all");
  const [folder,     setFolder]     = useState("Inbox");
  const [selectedId, setSelectedId] = useState(null);
  const [view,       setView]       = useState("list");
  const [sidebar,    setSidebar]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [selected,   setSelected]   = useState(new Set());
  const [labelFilter,setLabelFilter]= useState(null);

  // Compose
  const [composing,  setComposing] = useState(false);
  const [cFrom,      setCFrom]     = useState(null);
  const [cTo,        setCTo]       = useState("");
  const [cCc,        setCCc]       = useState("");
  const [cBcc,       setCBcc]      = useState("");
  const [cShowCc,    setCShowCc]   = useState(false);
  const [cShowBcc,   setCShowBcc]  = useState(false);
  const [cSubject,   setCSubject]  = useState("");
  const [cBody,      setCBody]     = useState("");
  const [cAcctDrop,  setCAcctDrop] = useState(false);
  const [cMoveDrop,  setCMoveDrop] = useState(false);
  const [cLabelDrop, setCLabelDrop]= useState(false);
  const [cSendLater, setCSendLater]= useState(false);
  const [cSig,       setCSig]      = useState(true);
  const cBodyRef    = useRef(null);
  const draftTimer  = useRef(null);
  const [draftSaved,setDraftSaved] = useState(false);

  const [snoozePicker, setSnoozePicker] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Toast
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});
  const pushToast = useCallback((msg, opts={})=>{
    const id=uid();
    setToasts(p=>[...p,{id,msg,undo:opts.undo?()=>{opts.undo();setToasts(q=>q.filter(t=>t.id!==id));}:null,action:opts.action||null}]);
    timers.current[id]=setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),opts.duration||4500);
  },[]);
  // Clear all pending toast timers when the component unmounts
  useEffect(()=>()=>{ Object.values(timers.current).forEach(clearTimeout); },[]);

  // Load settings from Electron if available
  const manualUpdateCheckRef = useRef(null); // set by UpdateBanner
  useEffect(()=>{
    if (isElectron) {
      window.electronAPI.getSettings().then(s=>{ if(s) setPrefs(p=>({...p,...s})); });
      const cleanup = window.electronAPI.onShortcut(key=>{
        // Use actRef to always get the latest openCompose/setSidebar (Bug 2 fix)
        if(key==="compose") actRef.current.openCompose?.();
        if(key==="sidebar") setSidebar(s=>!s);
        if(key==="check-update") manualUpdateCheckRef.current?.();
      });
      return cleanup;
    }
    // Fallback: localStorage
    try { const s=JSON.parse(localStorage.getItem("letter-prefs")||"{}"); if(Object.keys(s).length) setPrefs(p=>({...p,...s})); } catch{}
  },[]);

  // Persist prefs — server when signed in, localStorage as fallback
  const prefsSyncTimer = useRef(null);
  useEffect(()=>{
    // Always keep localStorage current for fast startup
    try { localStorage.setItem("letter-prefs", JSON.stringify(prefs)); } catch{}
    // Debounce server sync by 1s to avoid hammering on rapid changes
    if (currentUser) {
      clearTimeout(prefsSyncTimer.current);
      prefsSyncTimer.current = setTimeout(()=>{
        settingsApi.patch(prefs).catch(()=>{});
      }, 1000);
    } else if (isElectron) {
      window.electronAPI?.saveSettings(prefs);
    }
    return ()=>clearTimeout(prefsSyncTimer.current);
  },[prefs, currentUser]);

  const dark = prefs.dark;

  // ── Derived ───────────────────────────────────────────────────────────────
  const acctMap  = useMemo(()=>Object.fromEntries(accounts.map(a=>[a.id,a])),[accounts]);
  const labelMap = useMemo(()=>Object.fromEntries(labels.map(l=>[l.id,l])),[labels]);
  const defaultAcct = accounts.find(a=>a.isDefault)||accounts[0];
  const selectedEmail = emails.find(e=>e.id===selectedId)||null;
  const readingFontSize = FONT_SIZE_MAP[prefs.fontSize]||14;
  const rowPad = DENSITY_MAP[prefs.density]||11;

  const threadLatestInFolder = useMemo(()=>{
    const map={};
    emails.filter(e=>e.folder===folder&&(acctFilter==="all"||e.account===acctFilter)).forEach(e=>{
      if(!map[e.threadId]||e.seq>map[e.threadId].seq) map[e.threadId]=e;
    });
    return map;
  },[emails,folder,acctFilter]);

  const threadCount = useMemo(()=>{ const m={}; emails.forEach(e=>{m[e.threadId]=(m[e.threadId]||0)+1;}); return m; },[emails]);
  const threadUnread = useMemo(()=>{ const m={}; emails.forEach(e=>{if(e.unread)m[e.threadId]=(m[e.threadId]||0)+1;}); return m; },[emails]);

  const searchTokens = useMemo(()=>parseSearchQuery(search),[search]);

  const visibleThreads = useMemo(()=>{
    const seen=new Set();
    let list = emails.filter(e=>{
      if(acctFilter!=="all"&&e.account!==acctFilter) return false;
      if(e.folder!==folder) return false;
      if(mutedThreads.has(e.threadId)&&folder==="Inbox") return false;
      if(filterMode==="unread"&&!threadUnread[e.threadId]) return false;
      if(filterMode==="starred"&&!e.starred) return false;
      if(labelFilter&&!e.labels.includes(labelFilter)) return false;
      if(searchTokens.length>0&&!emailMatchesSearch(e,searchTokens)) return false;
      if(prefs.threadGrouping){
        const latest=threadLatestInFolder[e.threadId];
        if(!latest||latest.id!==e.id) return false;
        if(seen.has(e.threadId)) return false;
        seen.add(e.threadId);
      }
      return true;
    });
    if(prefs.sortOrder==="oldest") list=[...list].reverse();
    return list;
  },[emails,acctFilter,folder,filterMode,labelFilter,searchTokens,threadLatestInFolder,threadUnread,prefs.sortOrder,prefs.threadGrouping,mutedThreads]);

  // Pagination
  const pageSize   = prefs.pageSize || 50;
  const totalPages = Math.max(1, Math.ceil(visibleThreads.length / pageSize));
  const pagedThreads = useMemo(()=>visibleThreads.slice(page*pageSize,(page+1)*pageSize),[visibleThreads,page,pageSize]);
  useEffect(()=>{ setPage(0); },[folder,acctFilter,filterMode,labelFilter,search]);

  const unreadFor    = id => emails.filter(e=>(id==="all"||e.account===id)&&e.folder==="Inbox"&&e.unread).length;
  const folderUnread = f  => emails.filter(e=>(acctFilter==="all"||e.account===acctFilter)&&e.folder===f&&e.unread).length;
  const totalUnread  = unreadFor("all");

  // Snooze ticker
  useEffect(()=>{
    const t=setInterval(()=>{
      const n=Date.now();
      setEmails(p=>p.map(e=>{
        if(e.folder==="Snoozed"&&e.snoozedUntil&&new Date(e.snoozedUntil).getTime()<=n){
          pushToast(`Snoozed: "${e.subject}" is back`);
          if(isElectron&&prefs.notifications) window.electronAPI.notify("Letter","Snoozed email returned: "+e.subject);
          return {...e,folder:"Inbox",snoozedUntil:null};
        }
        return e;
      }));
    },60000);
    return ()=>clearInterval(t);
  },[pushToast,prefs.notifications]);

  // Draft autosave
  useEffect(()=>{
    if(!composing)return;
    setDraftSaved(false);
    clearTimeout(draftTimer.current);
    draftTimer.current=setTimeout(()=>setDraftSaved(true),2000);
    return ()=>clearTimeout(draftTimer.current);
  },[cTo,cSubject,cBody,composing]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const switchFolder  = useCallback((f)=>{setFolder(f);setFilterMode("all");setSearch("");setSelectedId(null);setSelected(new Set());setCMoveDrop(false);setLabelFilter(null);},[]);
  const switchAccount = useCallback((id)=>{setAcctFilter(id);setFilterMode("all");setSearch("");setSelectedId(null);setSelected(new Set());},[]);

  const autoMarkTimer = useRef(null);
  const openEmail = useCallback((email)=>{
    setSelectedId(email.id);
    setSelected(new Set());
    setCMoveDrop(false);
    setCLabelDrop(false);
    if(prefs.autoMarkReadDelay===-1) return; // never auto-mark
    clearTimeout(autoMarkTimer.current);
    const mark=()=>setEmails(p=>p.map(e=>e.threadId===email.threadId?{...e,unread:false}:e));
    if(prefs.autoMarkReadDelay===0) mark();
    else autoMarkTimer.current=setTimeout(mark,prefs.autoMarkReadDelay);
  },[prefs.autoMarkReadDelay]);

  const toggleStar   = useCallback((id,ev)=>{if(ev)ev.stopPropagation();setEmails(p=>p.map(e=>e.id===id?{...e,starred:!e.starred}:e));},[]);
  const markUnread   = useCallback((id)=>{setEmails(p=>p.map(e=>e.id===id?{...e,unread:true}:e));pushToast("Marked as unread");},[pushToast]);

  const snoozeEmail = useCallback((id,hours)=>{
    const until=new Date(Date.now()+hours*3600000).toISOString();
    setEmails(p=>p.map(e=>e.id===id?{...e,folder:"Snoozed",snoozedUntil:until}:e));
    setSelectedId(cur=>cur===id?null:cur);
    setSnoozePicker(null);
    pushToast(`Snoozed for ${hours}h`);
  },[pushToast]);

  const doDelete = useCallback((id)=>{
    setEmails(prev=>{
      const target=prev.find(e=>e.id===id);if(!target)return prev;
      const next=prev.map(e=>e.id===id?{...e,folder:"Trash"}:e);
      pushToast("Moved to Trash",{undo:()=>setEmails(q=>q.map(e=>e.id===id?{...target}:e))});
      return next;
    });
    setSelectedId(cur=>cur===id?null:cur);
    setCMoveDrop(false);
    setConfirmDeleteId(null);
  },[pushToast]);

  const moveEmail = useCallback((id,toFolder,opts={})=>{
    if(toFolder==="Trash"&&prefs.confirmDelete&&!opts.skipConfirm){setConfirmDeleteId(id);return;}
    setEmails(prev=>{
      const target=prev.find(e=>e.id===id);if(!target)return prev;
      const next=prev.map(e=>e.id===id?{...e,folder:toFolder}:e);
      if(!opts.silent){
        const label=toFolder==="Trash"?"Moved to Trash":toFolder==="Archive"?"Archived":`Moved to ${toFolder}`;
        pushToast(label,{undo:()=>setEmails(q=>q.map(e=>e.id===id?{...target}:e))});
      }
      return next;
    });
    setSelectedId(cur=>cur===id?null:cur);
    setCMoveDrop(false);
  },[pushToast,prefs.confirmDelete]);

  const addLabelToEmail    = useCallback((eid,lid)=>{setEmails(p=>p.map(e=>e.id===eid&&!e.labels.includes(lid)?{...e,labels:[...e.labels,lid]}:e));setCLabelDrop(false);},[]);
  const removeLabelFromEmail=useCallback((eid,lid)=>{setEmails(p=>p.map(e=>e.id===eid?{...e,labels:e.labels.filter(l=>l!==lid)}:e));},[]);

  const bulkMove = useCallback((toFolder)=>{
    setSelected(sel=>{
      const ids=[...sel];
      setEmails(prev=>{
        const snaps=prev.filter(e=>ids.includes(e.id));
        const next=prev.map(e=>ids.includes(e.id)?{...e,folder:toFolder}:e);
        pushToast(`${ids.length} moved to ${toFolder}`,{undo:()=>setEmails(q=>q.map(e=>{const s=snaps.find(x=>x.id===e.id);return s||e;}))});
        return next;
      });
      setSelectedId(cur=>ids.includes(cur)?null:cur);
      return new Set();
    });
  },[pushToast]);

  const bulkMarkUnread = useCallback(()=>{
    setSelected(sel=>{const ids=[...sel];setEmails(p=>p.map(e=>ids.includes(e.id)?{...e,unread:true}:e));pushToast(`${ids.length} marked as unread`);return new Set();});
  },[pushToast]);

  const markAllRead = useCallback(()=>{
    setEmails(p=>p.map(e=>(e.folder===folder&&(acctFilter==="all"||e.account===acctFilter))?{...e,unread:false}:e));
    pushToast("All marked as read");
  },[folder,acctFilter,pushToast]);

  const muteThread = useCallback((threadId)=>{
    setMutedThreads(p=>{ const n=new Set(p); if(n.has(threadId)){n.delete(threadId);pushToast("Conversation unmuted");}else{n.add(threadId);pushToast("Conversation muted — won't appear in Inbox");} return n; });
    setSelectedId(null);
  },[pushToast]);

  const addReminder = useCallback((emailId,subject,hours)=>{
    const remindAt=new Date(Date.now()+hours*3600000).toISOString();
    setReminders(p=>[...p,{id:uid(),emailId,subject,remindAt}]);
    pushToast(`Reminder set for ${hours}h`);
  },[pushToast]);

  // Reminder ticker
  useEffect(()=>{
    const t=setInterval(()=>{
      const now=Date.now();
      setReminders(prev=>{
        const due=prev.filter(r=>new Date(r.remindAt).getTime()<=now);
        due.forEach(r=>{
          pushToast(`Follow-up reminder: "${r.subject}"`,{duration:8000});
          if(isElectron&&prefs.notifications) window.electronAPI?.notify("Letter",`Follow-up: ${r.subject}`);
        });
        return prev.filter(r=>new Date(r.remindAt).getTime()>now);
      });
    },30000);
    return ()=>clearInterval(t);
  },[pushToast,prefs.notifications]);

  const emptyTrash = useCallback(()=>{
    setEmails(prev=>{
      const toDelete=prev.filter(e=>e.folder==="Trash"&&(acctFilter==="all"||e.account===acctFilter));
      if(!toDelete.length)return prev;
      const toDeleteIds=new Set(toDelete.map(e=>e.id));
      setSelectedId(id=>toDeleteIds.has(id)?null:id);
      pushToast(`${toDelete.length} permanently deleted`);
      return prev.filter(e=>!toDeleteIds.has(e.id));
    });
  },[acctFilter,pushToast]);

  const toggleSelect=(id,ev)=>{ev.stopPropagation();setSelected(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});};
  const selectAll=()=>setSelected(p=>pagedThreads.every(e=>p.has(e.id))?new Set():new Set(pagedThreads.map(e=>e.id)));

  const openCompose = useCallback((defaults={})=>{
    const fromId=defaults.fromId||defaultAcct?.id||accounts[0]?.id;
    const acct=accounts.find(a=>a.id===fromId);
    setCFrom(fromId);
    setCTo(defaults.to||"");
    setCCc(defaults.cc||"");
    setCBcc(defaults.bcc||"");
    setCShowCc(!!(defaults.cc));
    setCShowBcc(!!(defaults.bcc));
    setCSubject(defaults.subject||"");
    const hasSig=defaults.body===undefined;
    setCBody(hasSig?(acct?.signature?`\n\n${acct.signature}`:""):(defaults.body||""));
    setCSig(hasSig);
    setCAcctDrop(false);
    setDraftSaved(false);
    setComposing(true);
  },[defaultAcct,accounts]);

  const sendCompose = useCallback(()=>{
    const fromAcct=acctMap[cFrom];if(!fromAcct||!cTo.trim()||!cSubject.trim())return;
    setComposing(false);
    const undoWindow=(prefs.undoSendWindow||5)*1000;

    const doSend = async () => {
      if(currentUser && fromAcct.connected){
        // Real send via server SMTP
        try {
          await mailApi.send({accountId:cFrom,to:cTo,cc:cCc,bcc:cBcc,subject:cSubject,text:cBody});
          if(undoWindow>0){ pushToast("Message sent",{duration:undoWindow}); }
          else { pushToast("Message sent"); }
          setTimeout(loadServerMessages, 1500);
        } catch(e) { pushToast(`Send failed: ${e.message}`); }
      } else {
        // Demo / offline mode
        const newEmail={id:uid(),seq:nextSeq(),threadId:uid(),account:cFrom,folder:"Sent",from:"You",fromEmail:fromAcct.email,to:cTo,cc:cCc,subject:cSubject,preview:cBody.slice(0,80),body:cBody,time:nowStr(),date:"Today",unread:false,starred:false,labels:[],attachments:[],snoozedUntil:null,scheduledFor:null};
        setEmails(p=>[newEmail,...p]);
        if(undoWindow>0){ pushToast("Message sent",{duration:undoWindow,undo:()=>{setEmails(p=>p.filter(e=>e.id!==newEmail.id));pushToast("Send cancelled");}}); }
        else { pushToast("Message sent"); }
      }
      if(isElectron&&prefs.notifications) window.electronAPI?.notify("Letter","Message sent to "+cTo);
      if(!contacts.find(c=>c.email===cTo)) setContacts(p=>[...p,{name:cTo.split("@")[0],email:cTo}]);
    };

    doSend();
  },[acctMap,cFrom,cTo,cCc,cBcc,cSubject,cBody,contacts,pushToast,prefs.undoSendWindow,prefs.notifications,currentUser,loadServerMessages]);

  const scheduleSend=useCallback((dt)=>{
    const fromAcct=acctMap[cFrom];if(!fromAcct||!cTo.trim()||!cSubject.trim())return;
    setEmails(p=>[{id:uid(),seq:nextSeq(),threadId:uid(),account:cFrom,folder:"Scheduled",from:"You",fromEmail:fromAcct.email,to:cTo,cc:cCc,subject:cSubject,preview:cBody.slice(0,80),body:cBody,time:nowStr(),date:"Today",unread:false,starred:false,labels:[],attachments:[],snoozedUntil:null,scheduledFor:dt},...p]);
    setComposing(false);setCSendLater(false);
    pushToast(`Scheduled for ${new Date(dt).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}`);
  },[acctMap,cFrom,cTo,cCc,cSubject,cBody,pushToast]);

  const applyRichFormat=(cmd)=>{
    if(!cBodyRef.current)return;
    const ta=cBodyRef.current,start=ta.selectionStart,end=ta.selectionEnd,sel=cBody.slice(start,end);
    let r=sel;
    if(cmd==="bold")r=`**${sel}**`;
    else if(cmd==="italic")r=`_${sel}_`;
    else if(cmd==="underline")r=`__${sel}__`;
    else if(cmd==="list")r=sel.split("\n").map(l=>`• ${l}`).join("\n");
    else if(cmd==="olist")r=sel.split("\n").map((l,i)=>`${i+1}. ${l}`).join("\n");
    else if(cmd==="quote")r=sel.split("\n").map(l=>`> ${l}`).join("\n");
    else if(cmd==="clear")r=sel.replace(/\*\*([^*]*)\*\*/g,"$1").replace(/__([^_]*)__/g,"$1").replace(/_([^_]*)_/g,"$1").replace(/^•\s/gm,"").replace(/^\d+\.\s/gm,"").replace(/^>\s/gm,"");
    setCBody(cBody.slice(0,start)+r+cBody.slice(end));
    setTimeout(()=>{ta.selectionStart=start;ta.selectionEnd=start+r.length;ta.focus();},0);
  };

  // Keyboard shortcuts
  const actRef=useRef({});
  actRef.current={openCompose,moveEmail,markUnread,selectedEmail,composing,snoozeEmail,setSnoozePicker,prefs};
  useEffect(()=>{
    const h=(e)=>{
      const {openCompose,moveEmail,markUnread,selectedEmail,composing,setSnoozePicker,prefs}=actRef.current;
      if(!prefs.shortcuts||composing)return;
      if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA")return;
      if(e.key==="c"||e.key==="C"){openCompose();return;}
      if(e.key==="Escape"){setComposing(false);setCAcctDrop(false);setCMoveDrop(false);setCLabelDrop(false);return;}
      if(!selectedEmail)return;
      if(e.key==="r"){if(prefs.defaultReply==="replyAll"){openCompose({fromId:selectedEmail.account,to:selectedEmail.fromEmail,cc:selectedEmail.cc||"",subject:`re: ${selectedEmail.subject}`});}else{openCompose({fromId:selectedEmail.account,to:selectedEmail.fromEmail,subject:`re: ${selectedEmail.subject}`});}}
      if(e.key==="f")openCompose({fromId:selectedEmail.account,to:"",subject:`fwd: ${selectedEmail.subject}`,body:`\n\n--- Forwarded ---\nFrom: ${selectedEmail.fromEmail}\n\n${selectedEmail.body}`});
      if(e.key==="e")moveEmail(selectedEmail.id,"Archive");
      if(e.key==="#")moveEmail(selectedEmail.id,"Trash");
      if(e.key==="u")markUnread(selectedEmail.id);
      if(e.key==="h")setSnoozePicker(selectedEmail.id);
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[]);

  // Close dropdowns on outside click
  useEffect(()=>{
    if(!cMoveDrop&&!cAcctDrop&&!cLabelDrop)return;
    const h=(e)=>{if(!e.target.closest("[data-dropdown]")){setCMoveDrop(false);setCAcctDrop(false);setCLabelDrop(false);}};
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[cMoveDrop,cAcctDrop,cLabelDrop]);

  // Signature update when from-account changes
  useEffect(()=>{
    if(!composing||!cSig)return;
    const acct=accounts.find(a=>a.id===cFrom);
    if(!acct?.signature)return;
    setCBody(b=>{const i=b.lastIndexOf("\n\n");const base=i>=0?b.slice(0,i):b;return `${base}\n\n${acct.signature}`;});
  },[cFrom]);

  // ── Theme ─────────────────────────────────────────────────────────────────
  const T = dark ? {
    bg:"#0a0a0a",surface:"#111",panel:"#161616",border:"#242424",
    text:"#f0f0f0",sub:"#888",input:"#1c1c1c",hover:"rgba(255,255,255,0.05)",
    listHover:"#181818",selected:"#1e1e1e",pillActive:"#222",
  } : {
    bg:"#f8f8f8",surface:"#fff",panel:"#f2f2f2",border:"#e4e4e4",
    text:"#111",sub:"#888",input:"#f5f5f5",hover:"#eee",
    listHover:"#f4f4f4",selected:"#ececec",pillActive:"transparent",
  };

  const allSelected  = pagedThreads.length>0&&pagedThreads.every(e=>selected.has(e.id));
  const someSelected = selected.size>0&&!allSelected;
  const showSettings = view==="settings";
  const showContacts = view==="contacts";
  const showRules    = view==="rules";
  const showTemplates= view==="templates";

  // Reading pane layout
  const pane = prefs.readingPane; // right | bottom | off
  const hasDetail = !showSettings&&selectedId&&selectedEmail;

  const printEmail=()=>{
    if(!selectedEmail)return;
    const w=window.open("","_blank");
    w.document.write(`<html><head><title>${selectedEmail.subject}</title><style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;line-height:1.7;color:#111;}h1{font-size:22px;margin-bottom:8px;}small{color:#666;}hr{border:none;border-top:1px solid #ddd;margin:16px 0;}pre{white-space:pre-wrap;font-family:inherit;font-size:${readingFontSize}px;}</style></head><body>`);
    w.document.write(`<h1>${selectedEmail.subject}</h1><small>From: ${selectedEmail.fromEmail} | To: ${selectedEmail.to} | ${selectedEmail.date} ${selectedEmail.time}</small><hr><pre>${selectedEmail.body}</pre></body></html>`);
    w.document.close();w.print();
  };

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    html,body,#root{height:100%;overflow:hidden;}
    ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${dark?"#333":"#d0d0d0"};border-radius:2px;}
    .erow{transition:background 0.06s;cursor:pointer;border-bottom:1px solid ${T.border};user-select:none;}
    .erow:hover{background:${T.listHover}!important;}
    .ib{background:none;border:none;cursor:pointer;padding:5px;border-radius:5px;transition:all 0.1s;display:flex;align-items:center;justify-content:center;color:${T.sub};}
    .ib:hover{background:${T.hover};}
    .ib-top{background:none;border:none;cursor:pointer;padding:5px;border-radius:5px;transition:all 0.1s;display:flex;align-items:center;justify-content:center;}
    .ib-top:hover{background:rgba(255,255,255,0.12);}
    .fi{cursor:pointer;padding:6px 10px;border-radius:6px;transition:background 0.08s;font-size:11px;letter-spacing:0.04em;display:flex;align-items:center;justify-content:space-between;text-transform:uppercase;color:${T.sub};}
    .fi:hover{background:${T.hover};}
    .fi.active{background:${dark?"#2a2a2a":"#e8e8e8"};color:${T.text};font-weight:600;}
    .pill{border:none;cursor:pointer;transition:all 0.1s;white-space:nowrap;font-family:inherit;}
    .pill:hover{opacity:0.78;}
    input,textarea{font-family:'Inter',system-ui,sans-serif;color:${T.text};}
    input::placeholder,textarea::placeholder{color:${T.sub};}
    input:focus,textarea:focus{outline:none;}
    .abtn{background:none;border:1px solid ${T.border};color:${T.sub};padding:4px 10px;border-radius:6px;font-size:10px;cursor:pointer;font-family:inherit;transition:all 0.1s;display:flex;align-items:center;gap:4px;}
    .abtn:hover{background:${T.hover};}
    .dbtn{background:none;border:1px solid #ffbbbb;color:#cc4444;padding:4px 10px;border-radius:6px;font-size:10px;cursor:pointer;font-family:inherit;}
    .dbtn:hover{background:#ffeeee;color:#aa2222;}
    .stab{cursor:pointer;padding:7px 14px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;border-bottom:2px solid transparent;transition:all 0.1s;}
    .sacct{cursor:pointer;padding:7px 12px;display:flex;align-items:center;gap:8px;font-size:12px;transition:background 0.08s;color:${T.text};}
    .sacct:hover{background:${T.hover};}
    .drop-item{cursor:pointer;padding:7px 14px;font-size:12px;transition:background 0.08s;display:flex;align-items:center;gap:8px;color:${T.text};}
    .drop-item:hover{background:${T.hover};}
    .fmode{cursor:pointer;padding:3px 10px;border-radius:12px;font-size:10px;border:1px solid transparent;transition:all 0.1s;background:none;font-family:inherit;color:${T.sub};}
    .fmode:hover{background:${T.hover};}
    .cb{width:14px;height:14px;border:1.5px solid ${dark?"#444":"#ccc"};border-radius:3px;display:flex;align-items:center;justify-content:center;transition:all 0.1s;flex-shrink:0;cursor:pointer;background:${T.bg};}
    .cb.on{background:${dark?"#fff":"#111"};border-color:${dark?"#fff":"#111"};}
    .cb.some{background:${dark?"#555":"#aaa"};border-color:${dark?"#555":"#aaa"};}
    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes su{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
    input[type=datetime-local]::-webkit-calendar-picker-indicator{filter:${dark?"invert(1)":"none"};opacity:0.5;}
  `;

  const senderLabel=(email)=>{
    const a=acctMap[email.account];
    if(prefs.senderDisplay==="email") return email.fromEmail;
    if(prefs.senderDisplay==="name")  return email.from;
    return email.from; // "both" — name in bold, email small below
  };

  // ─── Email detail pane ─────────────────────────────────────────────────────
  // Assigned as JSX element (not a component function) to avoid remount on every render
  const detailPane = selectedEmail ? (
    <div style={{flex:1,overflowY:"auto",background:T.surface,display:"flex",flexDirection:"column",minWidth:0}}>
      {/* Toolbar */}
      <div style={{padding:"9px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:2,flexShrink:0,flexWrap:"wrap",background:T.surface}}>
        <Tooltip label={`Reply${prefs.defaultReply==="replyAll"?" All":""} (R)`}><button className="ib" onClick={()=>prefs.defaultReply==="replyAll"?openCompose({fromId:selectedEmail.account,to:selectedEmail.fromEmail,cc:selectedEmail.cc||"",subject:`re: ${selectedEmail.subject}`}):openCompose({fromId:selectedEmail.account,to:selectedEmail.fromEmail,subject:`re: ${selectedEmail.subject}`})}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg></button></Tooltip>
        <Tooltip label="Reply All"><button className="ib" onClick={()=>openCompose({fromId:selectedEmail.account,to:selectedEmail.fromEmail,cc:selectedEmail.cc||"",subject:`re: ${selectedEmail.subject}`})}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/></svg></button></Tooltip>
        <Tooltip label="Forward (F)"><button className="ib" onClick={()=>openCompose({fromId:selectedEmail.account,to:"",subject:`fwd: ${selectedEmail.subject}`,body:`\n\n--- Forwarded ---\nFrom: ${selectedEmail.fromEmail}\n\n${selectedEmail.body}`})}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg></button></Tooltip>
        <div style={{width:1,height:16,background:T.border,margin:"0 3px"}}/>
        <Tooltip label="Mark unread (U)"><button className="ib" onClick={()=>markUnread(selectedEmail.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><circle cx="7" cy="10" r="2" fill="currentColor"/></svg></button></Tooltip>
        <Tooltip label="Snooze (H)"><button className="ib" onClick={()=>setSnoozePicker(selectedEmail.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button></Tooltip>
        <div style={{position:"relative"}} data-dropdown="label">
          <Tooltip label="Add label"><button className="ib" onClick={()=>setCLabelDrop(o=>!o)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></button></Tooltip>
          {cLabelDrop&&(<div data-dropdown="label" style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:9,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:50,overflow:"hidden",minWidth:150}}>
            {labels.map(l=>{const has=selectedEmail.labels.includes(l.id);return <div key={l.id} className="drop-item" onClick={()=>has?removeLabelFromEmail(selectedEmail.id,l.id):addLabelToEmail(selectedEmail.id,l.id)} style={{fontSize:11}}><div style={{width:10,height:10,borderRadius:"50%",background:l.color,flexShrink:0}}/>{l.name}{has&&<span style={{marginLeft:"auto",fontSize:10,color:T.sub}}>✓</span>}</div>;})}
            {labels.length===0&&<div style={{padding:"10px 14px",fontSize:11,color:T.sub}}>No labels</div>}
          </div>)}
        </div>
        <div style={{position:"relative"}} data-dropdown="move">
          <Tooltip label="Move to"><button className="ib" onClick={()=>setCMoveDrop(o=>!o)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg></button></Tooltip>
          {cMoveDrop&&(<div data-dropdown="move" style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:9,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:50,overflow:"hidden",minWidth:130}}>
            {ALL_FOLDERS.filter(f=>f!==selectedEmail.folder).map(f=><div key={f} className="drop-item" onClick={()=>moveEmail(selectedEmail.id,f)} style={{fontSize:11}}>{f}</div>)}
          </div>)}
        </div>
        <div style={{width:1,height:16,background:T.border,margin:"0 3px"}}/>
        <Tooltip label="Archive (E)"><button className="ib" onClick={()=>moveEmail(selectedEmail.id,"Archive")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button></Tooltip>
        <Tooltip label="Delete (#)"><button className="ib" style={{color:"#cc4444"}} onClick={()=>moveEmail(selectedEmail.id,"Trash")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></Tooltip>
        <Tooltip label={mutedThreads.has(selectedEmail.threadId)?"Unmute conversation":"Mute conversation"}>
          <button className="ib" onClick={()=>muteThread(selectedEmail.threadId)} style={{color:mutedThreads.has(selectedEmail.threadId)?"#f5a623":undefined}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </button>
        </Tooltip>
        <Tooltip label="Follow-up reminder">
          <button className="ib" onClick={()=>{ const h=window.prompt("Remind me in how many hours? (e.g. 4, 24, 48)","24"); if(h&&!isNaN(h)) addReminder(selectedEmail.id,selectedEmail.subject,Number(h)); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="12" y1="2" x2="12" y2="4"/></svg>
          </button>
        </Tooltip>
        <Tooltip label="Print"><button className="ib" onClick={printEmail}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button></Tooltip>
        <div style={{width:1,height:16,background:T.border,margin:"0 3px"}}/>
        <button className="ib" onClick={e=>toggleStar(selectedEmail.id,e)} style={{color:selectedEmail.starred?"#f5a623":(dark?"#444":"#ccc"),fontSize:17}}>{selectedEmail.starred?"★":"☆"}</button>
      </div>
      <div style={{padding:"20px 24px",flex:1,overflowY:"auto"}}>
        {selectedEmail.labels.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{selectedEmail.labels.map(lid=>{const l=labelMap[lid];return l?<LabelChip key={lid} label={l} size="md" onRemove={()=>removeLabelFromEmail(selectedEmail.id,lid)}/>:null;})}</div>}
        {(()=>{const a=acctMap[selectedEmail.account];return a?(<div style={{marginBottom:12}}><span style={{display:"inline-flex",alignItems:"center",gap:6,background:a.color,borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:600,color:"#222"}}>{a.name} · {a.email}</span></div>):null;})()}
        <h2 style={{fontSize:19,fontWeight:700,lineHeight:1.35,marginBottom:14,color:T.text}}>{selectedEmail.subject}</h2>
        <ThreadView emails={emails} threadId={selectedEmail.threadId} acctMap={acctMap} dark={dark} fontSize={readingFontSize}
          onReply={e=>openCompose({fromId:e.account,to:e.fromEmail,subject:`re: ${e.subject}`})}
          onForward={e=>openCompose({fromId:e.account,to:"",subject:`fwd: ${e.subject}`,body:`\n\n--- Forwarded ---\nFrom: ${e.fromEmail}\n\n${e.body}`})}
        />
      </div>
    </div>
  ) : (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={dark?"#2a2a2a":"#ccc"} strokeWidth="1.2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      <span style={{fontSize:12,color:dark?"#2a2a2a":"#bbb"}}>Select a message</span>
      <span style={{fontSize:11,color:dark?"#222":"#ccc"}}>Press C to compose</span>
    </div>
  );

  return (
    <div style={{fontFamily:"'Inter',system-ui,sans-serif",background:T.bg,height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",color:T.text,transition:"background 0.2s,color 0.2s"}}>
      <style>{css}</style>

      {/* macOS traffic light spacer */}
      {isElectron&&window.electronAPI?.platform==="darwin"&&<div className="titlebar-mac" style={{background:dark?"#000":"#111",flexShrink:0}}/>}

      {/* AUTO-UPDATE BANNER */}
      <UpdateBanner dark={dark} onManualCheck={fn=>{ manualUpdateCheckRef.current=fn; }}/>

      {/* TOPBAR */}
      <div style={{background:dark?"#000":"#111",color:"#fff",height:50,display:"flex",alignItems:"center",gap:8,padding:"0 14px",flexShrink:0}}>
        <button className="ib-top" style={{color:"#fff"}} onClick={()=>setSidebar(s=>!s)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <span style={{fontSize:17,fontWeight:700,letterSpacing:"-0.01em",color:"#fff",marginRight:4}}>Letter</span>
        {totalUnread>0&&<span style={{background:"#ff4444",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:9,fontWeight:700}}>{totalUnread}</span>}
        <div style={{flex:1,display:"flex",justifyContent:"center"}}>
          <div style={{background:dark?"#1a1a1a":"#2a2a2a",borderRadius:8,padding:"6px 12px",display:"flex",alignItems:"center",gap:7,width:300,border:`1px solid ${dark?"#2a2a2a":"#3a3a3a"}`}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search mail…" style={{background:"none",border:"none",color:"#fff",fontSize:12,width:"100%"}}/>
            {search&&<button className="ib-top" style={{color:"#888",padding:2}} onClick={()=>setSearch("")}>✕</button>}
          </div>
        </div>
        <Tooltip label={dark?"Light mode":"Dark mode"}>
          <button className="ib-top" style={{color:"#aaa"}} onClick={()=>setPrefs(p=>({...p,dark:!p.dark}))}>
            {dark?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
        </Tooltip>
        <button className="ib-top" style={{color:showSettings?"#fff":"#aaa"}} onClick={()=>setView(showSettings?"list":"settings")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l-.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <button onClick={()=>openCompose()} style={{background:"#fff",color:"#111",border:"none",borderRadius:8,padding:"7px 15px",fontFamily:"inherit",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>+ Compose</button>
      </div>

      {/* ACCOUNT PILLS */}
      {!showSettings&&(
        <div style={{background:T.panel,borderBottom:`1px solid ${T.border}`,padding:"8px 14px",display:"flex",gap:6,alignItems:"center",flexShrink:0,overflowX:"auto"}}>
          {[{id:"all",name:"All Inboxes",color:"#e0e0e0"},...accounts].map(a=>{
            const cnt=unreadFor(a.id),active=acctFilter===a.id;
            return <button key={a.id} className="pill" onClick={()=>switchAccount(a.id)} style={{background:active?a.color:T.pillActive,border:`1.5px solid ${active?"transparent":T.border}`,borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:active?600:400,color:active?"#111":T.sub,display:"flex",alignItems:"center",gap:5}}>
              {a.name}{cnt>0&&<span style={{background:"#111",color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:700}}>{cnt}</span>}
            </button>;
          })}
          <div style={{width:1,height:16,background:T.border,margin:"0 4px"}}/>
          {labels.map(l=><button key={l.id} className="pill" onClick={()=>setLabelFilter(f=>f===l.id?null:l.id)} style={{background:labelFilter===l.id?l.color:T.pillActive,border:`1.5px solid ${labelFilter===l.id?"transparent":T.border}`,borderRadius:20,padding:"4px 10px",fontSize:10,color:labelFilter===l.id?"#222":T.sub}}>{l.name}</button>)}
        </div>
      )}

      {/* BODY */}
      <div style={{flex:1,display:"flex",flexDirection:pane==="bottom"?"column":"row",overflow:"hidden"}}>

        {/* SIDEBAR */}
        {sidebar&&!showSettings&&(
          <div style={{width:160,background:T.panel,borderRight:`1px solid ${T.border}`,padding:"12px 8px",flexShrink:0,display:"flex",flexDirection:"column",gap:2,overflowY:"auto"}}>
            <div style={{fontSize:9,color:T.sub,letterSpacing:"0.14em",textTransform:"uppercase",padding:"2px 10px 8px"}}>Folders</div>
            {ALL_FOLDERS.map(f=>{const cnt=folderUnread(f),active=folder===f;return(
              <div key={f} className={`fi${active?" active":""}`} onClick={()=>switchFolder(f)}><span>{f}</span>{cnt>0&&<span style={{background:"#111",color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:9,fontWeight:700}}>{cnt}</span>}</div>
            );})}
            {labels.length>0&&<>
              <div style={{fontSize:9,color:T.sub,letterSpacing:"0.14em",textTransform:"uppercase",padding:"12px 10px 6px"}}>Labels</div>
              {labels.map(l=><div key={l.id} className="fi" onClick={()=>{switchFolder("Inbox");setLabelFilter(f=>f===l.id?null:l.id);}} style={{background:labelFilter===l.id?(dark?"#1e1e1e":"#e8e8e8"):"transparent",color:labelFilter===l.id?T.text:T.sub}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:"50%",background:l.color,flexShrink:0}}/><span>{l.name}</span></div>
              </div>)}
            </>}
            <div style={{flex:1}}/>
            {/* Quick nav to contacts/rules/templates */}
            <div style={{display:"flex",flexDirection:"column",gap:2,paddingTop:8,borderTop:`1px solid ${T.border}`,marginTop:8}}>
              {[["contacts","👥","Contacts"],["rules","⚙️","Rules"],["templates","📝","Templates"]].map(([v,icon,label])=>(
                <div key={v} className={`fi${view===v?" active":""}`} onClick={()=>setView(vv=>vv===v?"list":v)} style={{fontSize:10}}>
                  <span>{icon} {label}</span>
                </div>
              ))}
            </div>
            <div style={{padding:"10px",background:dark?"#1c1c1c":"#eee",borderRadius:8,fontSize:9,color:T.sub,lineHeight:1.9,marginTop:8}}>
              <div style={{fontWeight:700,marginBottom:4,color:T.text}}>Shortcuts</div>
              {[["C","Compose"],["R","Reply"],["F","Forward"],["E","Archive"],["U","Unread"],["H","Snooze"],["#","Delete"]].map(([k,l])=><div key={k}><kbd style={{background:dark?"#222":"#e0e0e0",borderRadius:3,padding:"0 4px",color:T.text,fontSize:9}}>{k}</kbd> {l}</div>)}
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {showSettings&&<SettingsPanel
          prefs={prefs} setPrefs={setPrefs}
          accounts={accounts} setAccounts={setAccounts}
          labels={labels} setLabels={setLabels}
          emails={emails} setEmails={setEmails}
          acctFilter={acctFilter} setAcctFilter={setAcctFilter}
          T={T} dark={dark}
          currentUser={currentUser}
          onSignOut={null}
          onConnectAccount={(a)=>setWizardAccount(a)}
          onClose={()=>setView("list")}
        />}
        {showContacts&&<ContactsPanel contacts={contacts} setContacts={setContacts} emails={emails} dark={dark} T={T}/>}
        {showRules&&<RulesPanel rules={rules} setRules={setRules} labels={labels} dark={dark} T={T}/>}
        {showTemplates&&<TemplatesPanel templates={templates} setTemplates={setTemplates} dark={dark} T={T}/>}

        {/* EMAIL LIST */}
        {!showSettings&&!showContacts&&!showRules&&!showTemplates&&(
          <div style={{
            width: pane==="right"&&hasDetail ? 320 : pane==="bottom"&&hasDetail ? "100%" : "100%",
            height: pane==="bottom"&&hasDetail ? "45%" : "auto",
            minWidth: pane==="right"&&hasDetail ? 270 : 0,
            borderRight: pane==="right"&&hasDetail ? `1px solid ${T.border}` : "none",
            borderBottom: pane==="bottom"&&hasDetail ? `1px solid ${T.border}` : "none",
            background:T.bg,flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden"
          }}>
            {/* List toolbar */}
            <div style={{padding:"8px 12px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:8,flexShrink:0,background:T.bg}}>
              <div className={`cb${allSelected?" on":someSelected?" some":""}`} onClick={selectAll}>
                {(allSelected||someSelected)&&<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><polyline points="2,6 5,9 10,3"/></svg>}
              </div>
              {selected.size>0?(
                <div style={{display:"flex",alignItems:"center",gap:6,flex:1,animation:"fadeUp 0.15s ease"}}>
                  <span style={{fontSize:10,color:T.sub}}>{selected.size} selected</span>
                  <button className="abtn" onClick={()=>bulkMove("Archive")}>Archive</button>
                  <button className="abtn" style={{borderColor:"#ffbbbb",color:"#cc4444"}} onClick={()=>bulkMove("Trash")}>Delete</button>
                  <button className="abtn" onClick={bulkMarkUnread}>Unread</button>
                  <button className="abtn" style={{marginLeft:"auto"}} onClick={()=>setSelected(new Set())}>Clear</button>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",gap:4,flex:1}}>
                  {["all","unread","starred"].map(m=><button key={m} className="fmode" onClick={()=>setFilterMode(m)} style={{background:filterMode===m?(dark?"#1e1e1e":"#e8e8e8"):"none",color:filterMode===m?T.text:T.sub,border:`1px solid ${filterMode===m?(dark?"#444":"#aaa"):"transparent"}`}}>{m==="all"?"All":m==="unread"?"Unread":"Starred"}</button>)}
                  <span style={{marginLeft:"auto",fontSize:10,color:T.sub}}>{visibleThreads.length}</span>
                  {folder==="Trash"&&visibleThreads.length>0&&<button className="dbtn" onClick={emptyTrash} style={{fontSize:9,padding:"3px 8px"}}>Empty</button>}
                  <button className="abtn" onClick={markAllRead} style={{fontSize:9,padding:"3px 8px"}}>Mark all read</button>
                </div>
              )}
            </div>
            {/* Rows */}
            <div style={{overflowY:"auto",flex:1}}>
              {visibleThreads.length===0
                ?<div style={{padding:40,textAlign:"center",color:T.sub,fontSize:12}}>{filterMode!=="all"?`No ${filterMode} messages`:`No messages in ${folder}`}</div>
                :pagedThreads.map(email=>{
                  const a=acctMap[email.account],isSel=email.id===selectedId,isBulk=selected.has(email.id),tCount=threadCount[email.threadId]||1,hasUnread=!!(threadUnread[email.threadId]);
                  return (
                    <div key={email.id} className="erow" onClick={()=>openEmail(email)} style={{padding:`${rowPad}px 12px`,background:isBulk?(dark?"#1e1e1e":"#ebebeb"):isSel?T.selected:hasUnread?(dark?"#181818":"#fafafa"):T.bg,display:"flex",gap:8,alignItems:"flex-start"}}>
                      <div className={`cb${isBulk?" on":""}`} style={{marginTop:3}} onClick={e=>toggleSelect(email.id,e)}>{isBulk&&<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><polyline points="2,6 5,9 10,3"/></svg>}</div>
                      <AccountBadge account={a}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
                            <span style={{fontSize:12,fontWeight:hasUnread?700:400,color:hasUnread?T.text:T.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{senderLabel(email)}</span>
                            {prefs.senderDisplay==="both"&&<span style={{fontSize:10,color:T.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{email.fromEmail}</span>}
                            {tCount>1&&<span style={{fontSize:9,background:dark?"#2a2a2a":"#e8e8e8",color:T.sub,borderRadius:8,padding:"1px 5px",flexShrink:0}}>{tCount}</span>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                            {email.attachments?.length>0&&<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>}
                            <span style={{fontSize:9,color:T.sub}}>{email.time}</span>
                          </div>
                        </div>
                        <div style={{fontSize:12,color:hasUnread?T.text:T.sub,fontWeight:hasUnread?500:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:prefs.previewLines>0?2:0}}>{email.subject}</div>
                        {prefs.previewLines>0&&<div style={{display:"flex",alignItems:"center",gap:4,overflow:"hidden"}}>
                          {email.labels.map(lid=>{const l=labelMap[lid];return l?<LabelChip key={lid} label={l}/>:null;})}
                          <span style={{fontSize:11,color:T.sub,overflow:"hidden",textOverflow:"ellipsis",flex:1,display:"-webkit-box",WebkitLineClamp:prefs.previewLines,WebkitBoxOrient:"vertical"}}>{email.preview}</span>
                        </div>}
                      </div>
                      <button className="ib" onClick={e=>toggleStar(email.id,e)} style={{color:email.starred?"#f5a623":(dark?"#444":"#ccc"),fontSize:14,flexShrink:0,marginTop:1}}>{email.starred?"★":"☆"}</button>
                    </div>
                  );
                })
              }
            </div>
            {/* Pagination */}
            {totalPages>1&&(
              <div style={{padding:"8px 12px",borderTop:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,background:T.bg}}>
                <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 12px",fontSize:11,cursor:page===0?"default":"pointer",color:page===0?T.sub:T.text,fontFamily:"inherit",opacity:page===0?0.4:1}}>← Prev</button>
                <span style={{fontSize:11,color:T.sub}}>Page {page+1} of {totalPages}</span>
                <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page>=totalPages-1} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 12px",fontSize:11,cursor:page>=totalPages-1?"default":"pointer",color:page>=totalPages-1?T.sub:T.text,fontFamily:"inherit",opacity:page>=totalPages-1?0.4:1}}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* DETAIL PANE — right or bottom */}
        {!showSettings&&!showContacts&&!showRules&&!showTemplates&&(pane==="right"||pane==="bottom")&&detailPane}
      </div>

      {/* COMPOSE */}
      {composing&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"flex-end",padding:20}} onClick={()=>setComposing(false)}>
          <div onClick={e=>e.stopPropagation()} style={{width:520,background:T.surface,borderRadius:12,border:`1.5px solid ${T.border}`,overflow:"visible",boxShadow:"0 24px 64px rgba(0,0,0,0.25)",animation:"su 0.17s ease",display:"flex",flexDirection:"column",maxHeight:"85vh"}}>
            <div style={{background:dark?"#000":"#111",color:"#fff",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"10px 10px 0 0",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,fontWeight:600}}>New Message</span>
                {draftSaved&&<span style={{fontSize:9,color:"#888"}}>Draft saved</span>}
              </div>
              <button className="ib-top" style={{color:"#aaa"}} onClick={()=>setComposing(false)}>✕</button>
            </div>
            <div style={{position:"relative",flexShrink:0}} data-dropdown="from">
              <div style={{borderBottom:`1px solid ${T.border}`,padding:"0 15px",display:"flex",alignItems:"center",gap:9}}>
                <span style={{fontSize:10,color:T.sub,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",width:42,flexShrink:0}}>From</span>
                <button onClick={()=>setCAcctDrop(o=>!o)} style={{flex:1,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:7,padding:"10px 0",textAlign:"left"}}>
                  {cFrom&&acctMap[cFrom]?(<><div style={{width:11,height:11,borderRadius:3,background:acctMap[cFrom].color,flexShrink:0}}/><span style={{fontSize:12,color:T.text,fontWeight:500}}>{acctMap[cFrom].name}</span><span style={{fontSize:11,color:T.sub}}>{acctMap[cFrom].email}</span></>):<span style={{fontSize:12,color:T.sub}}>Choose account…</span>}
                  <svg style={{marginLeft:"auto"}} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>
              {cAcctDrop&&(<div data-dropdown="from" style={{position:"absolute",top:"100%",left:0,right:0,background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:"0 0 10px 10px",zIndex:20,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",overflow:"hidden"}}>
                {accounts.map(a=><div key={a.id} className="sacct" onClick={()=>{setCFrom(a.id);setCAcctDrop(false);}}>
                  <div style={{width:11,height:11,borderRadius:3,background:a.color,flexShrink:0}}/><span style={{fontSize:12,fontWeight:600}}>{a.name}</span><span style={{fontSize:11,color:T.sub}}>{a.email}</span>{a.isDefault&&<span style={{marginLeft:"auto",fontSize:9,color:T.sub}}>DEFAULT</span>}
                </div>)}
              </div>)}
            </div>
            <div style={{borderBottom:`1px solid ${T.border}`,padding:"0 15px",display:"flex",alignItems:"center",gap:9,flexShrink:0}}>
              <span style={{fontSize:10,color:T.sub,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",width:42,flexShrink:0}}>To</span>
              <ContactInput value={cTo} onChange={setCTo} placeholder="recipient@example.com" contacts={contacts} dark={dark}/>
              {!cShowCc&&<button onClick={()=>setCShowCc(true)} style={{background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:10,color:T.sub,letterSpacing:"0.06em",textTransform:"uppercase",flexShrink:0}}>+ Cc</button>}
              {!cShowBcc&&<button onClick={()=>setCShowBcc(true)} style={{background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:10,color:T.sub,letterSpacing:"0.06em",textTransform:"uppercase",flexShrink:0}}>+ Bcc</button>}
            </div>
            {cShowCc&&<div style={{borderBottom:`1px solid ${T.border}`,padding:"0 15px",display:"flex",alignItems:"center",gap:9,flexShrink:0}}>
              <span style={{fontSize:10,color:T.sub,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",width:42,flexShrink:0}}>Cc</span>
              <ContactInput value={cCc} onChange={setCCc} placeholder="cc@example.com" contacts={contacts} dark={dark}/>
              <button onClick={()=>{setCShowCc(false);setCCc("");}} style={{background:"none",border:"none",cursor:"pointer",color:T.sub,fontSize:12,flexShrink:0}}>✕</button>
            </div>}
            {cShowBcc&&<div style={{borderBottom:`1px solid ${T.border}`,padding:"0 15px",display:"flex",alignItems:"center",gap:9,flexShrink:0}}>
              <span style={{fontSize:10,color:T.sub,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",width:42,flexShrink:0}}>Bcc</span>
              <ContactInput value={cBcc} onChange={setCBcc} placeholder="bcc@example.com" contacts={contacts} dark={dark}/>
              <button onClick={()=>{setCShowBcc(false);setCBcc("");}} style={{background:"none",border:"none",cursor:"pointer",color:T.sub,fontSize:12,flexShrink:0}}>✕</button>
            </div>}
            <div style={{borderBottom:`1px solid ${T.border}`,padding:"0 15px",display:"flex",alignItems:"center",gap:9,flexShrink:0}}>
              <span style={{fontSize:10,color:T.sub,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",width:42,flexShrink:0}}>Subj</span>
              <input value={cSubject} onChange={e=>setCSubject(e.target.value)} placeholder="Subject…" style={{flex:1,background:"none",border:"none",fontSize:12,padding:"10px 0"}}/>
            </div>
            <RichBar onFormat={applyRichFormat} dark={dark}/>
            <div style={{position:"relative",flex:1}} onDragOver={e=>{e.preventDefault();e.currentTarget.style.outline=`2px dashed #4a90d9`;}} onDragLeave={e=>{e.currentTarget.style.outline="none";}} onDrop={e=>{e.preventDefault();e.currentTarget.style.outline="none";const files=[...e.dataTransfer.files];if(files.length){const names=files.map(f=>`[Attachment: ${f.name}]`).join("\n");setCBody(b=>b+"\n"+names);}}}>
              <textarea ref={cBodyRef} value={cBody} onChange={e=>setCBody(e.target.value)} placeholder="Write your message… or drag files here" style={{width:"100%",height:"100%",minHeight:140,padding:"13px 15px",fontSize:13,lineHeight:1.8,border:"none",background:"none",resize:"none",color:T.text,display:"block"}}/>
            </div>
            <div style={{padding:"6px 15px",borderTop:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:8,flexShrink:0,position:"relative"}}>
              <button onClick={()=>setTemplatePicker(t=>!t)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 8px",fontSize:9,letterSpacing:"0.06em",cursor:"pointer",fontFamily:"inherit",color:T.sub}}>
                📝 Template
              </button>
              {templatePicker&&templates.length>0&&(
                <div style={{position:"absolute",bottom:"100%",left:0,background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:9,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:20,overflow:"hidden",minWidth:200,maxHeight:200,overflowY:"auto"}}>
                  {templates.map(t=>(
                    <div key={t.id} className="drop-item" style={{fontSize:12}} onClick={()=>{if(t.subject&&!cSubject)setCSubject(t.subject);setCBody(b=>b+"\n\n"+t.body);setTemplatePicker(false);}}>
                      {t.name}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={()=>{const a=accounts.find(x=>x.id===cFrom);setCSig(s=>{if(s){setCBody(b=>{const i=b.lastIndexOf("\n\n");return i>0?b.slice(0,i):b;});}else if(a?.signature){setCBody(b=>`${b}\n\n${a.signature}`);}return !s;});}} style={{background:cSig?(dark?"#333":"#e8e8e8"):"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 8px",fontSize:9,letterSpacing:"0.06em",cursor:"pointer",fontFamily:"inherit",color:cSig?T.text:T.sub,fontWeight:cSig?600:400}}>
                {cSig?"✓ Sig":"+ Sig"}
              </button>
              <span style={{fontSize:9,color:T.sub,flex:1}}>{draftSaved?"Saved as draft":"Unsaved"}</span>
            </div>
            <div style={{padding:"9px 15px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <button className="dbtn" onClick={()=>setComposing(false)}>Discard</button>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={()=>setCSendLater(true)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 12px",fontFamily:"inherit",fontSize:10,cursor:"pointer",color:T.sub,display:"flex",alignItems:"center",gap:5}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Later
                </button>
                <button onClick={sendCompose} disabled={!cTo.trim()||!cSubject.trim()} style={{background:cTo.trim()&&cSubject.trim()?(dark?"#fff":"#111"):"#ccc",color:cTo.trim()&&cSubject.trim()?(dark?"#111":"#fff"):"#888",border:"none",borderRadius:8,padding:"8px 20px",fontFamily:"inherit",fontSize:12,fontWeight:700,cursor:cTo.trim()&&cSubject.trim()?"pointer":"default"}}>Send →</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE DIALOG */}
      {confirmDeleteId&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setConfirmDeleteId(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:12,padding:28,width:340,boxShadow:"0 24px 64px rgba(0,0,0,0.25)"}}>
            <div style={{fontSize:16,fontWeight:700,color:T.text,marginBottom:8}}>Move to Trash?</div>
            <div style={{fontSize:13,color:T.sub,marginBottom:24,lineHeight:1.6}}>This email will be moved to Trash. You can restore it from there.</div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setConfirmDeleteId(null)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 16px",fontFamily:"inherit",fontSize:12,color:T.sub,cursor:"pointer"}}>Cancel</button>
              <button onClick={()=>doDelete(confirmDeleteId)} style={{background:"#cc4444",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontFamily:"inherit",fontSize:12,fontWeight:700,cursor:"pointer"}}>Move to Trash</button>
            </div>
          </div>
        </div>
      )}

      {snoozePicker&&<SnoozePicker onSnooze={h=>snoozeEmail(snoozePicker,h)} onClose={()=>setSnoozePicker(null)} dark={dark}/>}
      {cSendLater&&<SendLaterPicker onSchedule={scheduleSend} onClose={()=>setCSendLater(false)} dark={dark}/>}
      {wizardAccount&&<AddAccountWizard
        account={wizardAccount} dark={dark}
        onDone={(updated)=>{ setWizardAccount(null); if(updated) setAccounts(p=>p.map(a=>a.id===updated.id?{...a,...updated}:a)); loadServerMessages(); }}
        onCancel={()=>setWizardAccount(null)}
      />}
      <Toast toasts={toasts}/>
    </div>
  );
}
