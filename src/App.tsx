import { useState, useRef, useEffect, useCallback } from "react";
// @ts-nocheck

// =============================================
// SUPABASE CONFIG
// =============================================
const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const db = {
  // Obtener todos los usuarios activos
  getUsers: () => sbFetch("profiles?select=*&order=full_name.asc"),

  // Login: buscar por username
  login: (username) =>
    sbFetch(`profiles?username=eq.${encodeURIComponent(username)}&select=*`),

  // Crear usuario
  createUser: (data) =>
    sbFetch("profiles", { method: "POST", body: JSON.stringify(data) }),

  // Actualizar usuario
  updateUser: (id, data) =>
    sbFetch(`profiles?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      prefer: "return=representation",
    }),

  // Obtener notificaciones de un usuario
  getNotifs: (userId) =>
    sbFetch(`notifications?recipient_id=eq.${userId}&order=created_at.desc`),

  // Crear notificación
  createNotif: (data) =>
    sbFetch("notifications", { method: "POST", body: JSON.stringify(data) }),

  // Marcar notificación como leída
  markNotifRead: (id) =>
    sbFetch(`notifications?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_read: true }),
    }),

  // Marcar todas las notificaciones como leídas
  markAllNotifsRead: (userId) =>
    sbFetch(`notifications?recipient_id=eq.${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_read: true }),
    }),

  // Obtener kudos recibidos por un usuario
  getKudos: (userId) =>
    sbFetch(`kudos_log?to_user_id=eq.${userId}&order=created_at.desc`),

  // Crear kudo
  createKudo: (data) =>
    sbFetch("kudos_log", { method: "POST", body: JSON.stringify(data) }),

  // Obtener catálogo de premios
  getPrizes: () => sbFetch("reward_catalog?is_active=eq.true&order=points_cost.asc"),

  // Actualizar premio
  updatePrize: (id, data) =>
    sbFetch(`reward_catalog?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Crear premio
  createPrize: (data) =>
    sbFetch("reward_catalog", { method: "POST", body: JSON.stringify(data) }),

  // Eliminar premio
  deletePrize: (id) =>
    sbFetch(`reward_catalog?id=eq.${id}`, { method: "DELETE" }),

  // Obtener tienda de avatares
  getShop: () => sbFetch("avatar_shop?is_active=eq.true&order=points_cost.asc"),

  // Canjear premio (crear redención)
  createRedemption: (data) =>
    sbFetch("reward_redemptions", { method: "POST", body: JSON.stringify(data) }),

  // Obtener performance semanal
  getWeeklyPerf: (userId) =>
    sbFetch(`weekly_performance?user_id=eq.${userId}&order=week_number.asc`),
};

// Hash simple para contraseñas (SHA-256 usando Web Crypto)
async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// =============================================
// COLORES Y CONSTANTES
// =============================================
const C = {
  blue:"#1a1aff",blueDk:"#0d0db3",blueLt:"#4d4dff",
  red:"#e8282a",redLt:"#ff5a5c",
  white:"#fff",bg:"#f0f2ff",bgDk:"#e6e9ff",
  card:"#fff",text:"#0a0a40",muted:"#6b7280",
  border:"#d1d5f0",green:"#16a34a",greenBg:"#dcfce7",
  yellow:"#d97706",yellowBg:"#fef9c3",red2:"#fee2e2",
  purple:"#7c3aed",
};

const DEFAULT_SHOP=[
  {id:"h1",type:"hair",label:"Mohawk",emoji:"💈",pts:50},
  {id:"h2",type:"hair",label:"Afro Dorado",emoji:"🌟",pts:80},
  {id:"h3",type:"hair",label:"Trenzas",emoji:"🌺",pts:60},
  {id:"h4",type:"hair",label:"Puas",emoji:"⚡",pts:45},
  {id:"h5",type:"hair",label:"Ondas",emoji:"🌊",pts:55},
  {id:"h6",type:"hair",label:"Sombrero Mago",emoji:"🎩",pts:90},
  {id:"h7",type:"hair",label:"Gorro Polar",emoji:"🧢",pts:35},
  {id:"h8",type:"hair",label:"Casco Vikingo",emoji:"⛑️",pts:120},
  {id:"a1",type:"accessory",label:"Lentes Ray",emoji:"🕶️",pts:40},
  {id:"a2",type:"accessory",label:"Corona",emoji:"👑",pts:150},
  {id:"a3",type:"accessory",label:"Headset",emoji:"🎧",pts:70},
  {id:"a4",type:"accessory",label:"Monoculo",emoji:"🧐",pts:65},
  {id:"a5",type:"accessory",label:"Mascara Neon",emoji:"🎭",pts:100},
  {id:"a6",type:"accessory",label:"Collar Estrella",emoji:"⭐",pts:80},
  {id:"a7",type:"accessory",label:"Audif Gaming",emoji:"🎮",pts:95},
  {id:"a8",type:"accessory",label:"Diamante",emoji:"💎",pts:200},
  {id:"o1",type:"outfit",label:"Traje Elite",emoji:"🤵",pts:200},
  {id:"o2",type:"outfit",label:"Jersey Rojo",emoji:"👕",pts:90},
  {id:"o3",type:"outfit",label:"Hoodie Neon",emoji:"🧥",pts:120},
  {id:"o4",type:"outfit",label:"Camisa Pro",emoji:"👔",pts:100},
  {id:"o5",type:"outfit",label:"Bata Cientif",emoji:"🥼",pts:110},
  {id:"o6",type:"outfit",label:"Capa Heroe",emoji:"🦸",pts:180},
  {id:"o7",type:"outfit",label:"Uniforme Gala",emoji:"🎖️",pts:160},
  {id:"o8",type:"outfit",label:"Traje Espacial",emoji:"🚀",pts:250},
  {id:"g1",type:"background",label:"Galaxia",emoji:"🌌",pts:80},
  {id:"g2",type:"background",label:"Fuego",emoji:"🔥",pts:60},
  {id:"g3",type:"background",label:"Diamante",emoji:"💎",pts:180},
  {id:"g4",type:"background",label:"Confeti",emoji:"🎊",pts:45},
  {id:"g5",type:"background",label:"Aurora",emoji:"🌈",pts:130},
  {id:"g6",type:"background",label:"Ciudad Noche",emoji:"🌃",pts:110},
  {id:"g7",type:"background",label:"Oceano Deep",emoji:"🌊",pts:95},
  {id:"g8",type:"background",label:"Volcan",emoji:"🌋",pts:140},
];

const BASES=[
  {id:"b1",emoji:"😊",label:"Sonriente"},
  {id:"b2",emoji:"😎",label:"Cool"},
  {id:"b3",emoji:"🤩",label:"Estrella"},
  {id:"b4",emoji:"🧑",label:"Neutral"},
  {id:"b5",emoji:"😄",label:"Alegre"},
  {id:"b6",emoji:"🥳",label:"Fiesta"},
];

const DEFAULT_METRICS=[
  {id:"qa",name:"QA Score",type:"kpi",max:5,active:true,desc:">meta=5, =meta=2, <meta=0"},
  {id:"aht",name:"AHT",type:"kpi",max:5,active:true,desc:"<meta=5, =meta=2, >meta=0"},
  {id:"att",name:"Attendance",type:"special",max:5,active:true,desc:"Perfect=5, 1 tarde=3, falta/2tard=0"},
  {id:"rdl",name:"Riddle",type:"activity",max:10,active:true,desc:"Todos=10, falla uno=0"},
  {id:"tsk",name:"Task",type:"activity",max:10,active:true,desc:"100%=10, 75%=5, 50%=1, <50%=0"},
  {id:"kdo",name:"Kudos",type:"social",max:999,active:true,desc:"1 kudo=1pt, 1 gold=5pts"},
  {id:"ref",name:"Referidos",type:"social",max:999,active:true,desc:"Enviado=1pt, aprobado=5pts"},
];

const RIDDLE={
  question:"Cual accion genera mayor reduccion de errores operativos en un equipo?",
  options:[{id:"a",text:"Esperar a que el error vuelva"},{id:"b",text:"Documentar causa raiz y crear plan preventivo"},{id:"c",text:"Rotar al agente con mas errores"},{id:"d",text:"Ignorar si no afecta el KPI"}],
  correct:"b",pts:10,
};
const TASK={
  title:"Plan de Mejora con IA",
  instructions:"Usa cualquier herramienta de IA para crear un plan de mejora sobre un problema real de tu operacion. Incluye:\n- Problema identificado\n- Propuesta de mejora\n- Como la IA te ayudo\n- Impacto esperado en KPIs",
  pts:10,
};

// =============================================
// HELPERS
// =============================================
const lc=l=>({1:"#6b7280",2:C.blue,3:C.purple,4:C.red}[l]||C.muted);
const ln=l=>({1:"ROOKIE",2:"RISING",3:"ELITE",4:"LEGEND"}[l]||"");
const kp=u=>(u.kudos||0)+(u.gold_kudos||0)*5;
const rp=u=>((u.referrals||[]).reduce((s,r)=>s+(r.approved?5:1),0));
const gs=u=>{
  const perf=(u.weekly_perf||[]).reduce((s,w)=>s+w.tot,0);
  const wks=Math.max((u.weekly_perf||[]).length,1);
  const rdl=u.riddle_completed===wks?10:0;
  const tp=(u.task_completed||0)/wks;
  const tsk=tp>=1?10:tp>=0.75?5:tp>=0.5?1:0;
  return{perf,rdl,tsk,kp:kp(u),rp:rp(u),total:perf+rdl+tsk+kp(u)+rp(u)};
};

// Adaptar perfil de Supabase al formato que usa la app
function adaptProfile(p) {
  return {
    id: p.id,
    name: p.full_name,
    username: p.username,
    password_hash: p.password_hash,
    role: p.role === "usuario" ? "user" : p.role,
    project: p.team || "Campaign K",
    active: p.is_active,
    avatar: p.avatar_accessories || { base:"b1",hair:null,accessory:null,outfit:null,background:null },
    level: p.level || 1,
    puzzlePieces: (p.puzzle_pieces || []).length,
    perfectMonths: p.perfect_months || 0,
    kudos: p.kudos || 0,
    goldKudos: p.gold_kudos || 0,
    gold_kudos: p.gold_kudos || 0,
    referrals: p.referrals || [],
    weekly_perf: p.weekly_perf || [],
    weeklyPerf: p.weekly_perf || [],
    riddle_completed: p.riddle_completed || 0,
    riddleCompleted: p.riddle_completed || 0,
    task_completed: p.task_completed || 0,
    taskCompleted: p.task_completed || 0,
    monthsHistory: p.months_history || [],
    ownedItems: p.owned_items || [],
    rewards: p.rewards || [],
    needsPwChange: p.needs_pw_change || false,
    tempPw: p.temp_pw || null,
    kudosLog: p.kudos_log || [],
    points_total: p.points_total || 0,
  };
}

// =============================================
// COMPONENTES UI
// =============================================
function Av({av,sz=80,shop}){
  const items=shop||DEFAULT_SHOP;
  const base=BASES.find(b=>b.id===(av?.base||"b1"));
  const hair=items.find(i=>i.id===av?.hair);
  const acc=items.find(i=>i.id===av?.accessory);
  const out=items.find(i=>i.id===av?.outfit);
  const bg=items.find(i=>i.id===av?.background);
  const bm={g1:"linear-gradient(135deg,#0a0a40,#1a1aff)",g2:"linear-gradient(135deg,#ff6b35,#f00)",g3:"linear-gradient(135deg,#00d4ff,#0057ff)",g4:"linear-gradient(135deg,#ff9ff3,#ffd700)",g5:"linear-gradient(135deg,#22c55e,#0ea5e9)",g6:"linear-gradient(135deg,#1e1b4b,#f59e0b)",g7:"linear-gradient(135deg,#0369a1,#06b6d4)",g8:"linear-gradient(135deg,#7f1d1d,#f97316)"};
  const bgs=bg?(bm[bg.id]||`linear-gradient(135deg,${C.bg},${C.bgDk})`):(`linear-gradient(135deg,${C.bg},${C.bgDk})`);
  return(
    <div style={{width:sz,height:sz,borderRadius:"50%",background:bgs,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",overflow:"hidden",flexShrink:0,position:"relative",border:`2.5px solid ${C.blue}`,boxShadow:`0 0 0 1px ${C.border}`}}>
      {out&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:"40%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:sz*0.22}}>{out.emoji}</div>}
      <div style={{fontSize:sz*0.42,lineHeight:1,zIndex:2}}>{base?.emoji||"😊"}</div>
      {hair&&<div style={{position:"absolute",top:-2,fontSize:sz*0.26,zIndex:3}}>{hair.emoji}</div>}
      {acc&&<div style={{position:"absolute",top:"28%",right:"5%",fontSize:sz*0.22,zIndex:4}}>{acc.emoji}</div>}
    </div>
  );
}

const Card=({children,style={},onClick})=><div onClick={onClick} style={{background:C.card,border:`1.5px solid ${C.border}`,borderRadius:16,padding:18,boxShadow:"0 2px 12px rgba(26,26,255,0.07)",...style,cursor:onClick?"pointer":undefined}}>{children}</div>;
const Btn=({children,onClick,color=C.blue,disabled,style={},sm})=><button onClick={onClick} disabled={disabled} style={{background:disabled?"#c5cae9":color,color:"#fff",border:"none",borderRadius:sm?7:10,padding:sm?"5px 12px":"11px 20px",fontWeight:800,fontSize:sm?12:14,cursor:disabled?"not-allowed":"pointer",boxShadow:disabled?"none":`0 3px 10px ${color}44`,fontFamily:"inherit",transition:"all 0.15s",...style}}>{children}</button>;
const Bdg=({l})=><span style={{padding:"3px 10px",borderRadius:20,background:`${lc(l)}18`,border:`1.5px solid ${lc(l)}`,color:lc(l),fontWeight:800,fontSize:11,letterSpacing:1.5}}>LVL{l} {ln(l)}</span>;
const Bar=({val,max,color=C.blue,h=8})=>{const p=Math.min((val/Math.max(max,1))*100,100);return <div style={{background:"#e8eaf6",borderRadius:h,overflow:"hidden",height:h}}><div style={{width:p+"%",height:"100%",background:color,borderRadius:h,transition:"width 0.9s cubic-bezier(.34,1.56,.64,1)"}}/></div>;};
const Tag=({children,color=C.blue})=><span style={{padding:"2px 8px",borderRadius:6,background:`${color}18`,color,fontSize:11,fontWeight:700}}>{children}</span>;
const Logo=({sz=32})=><div style={{width:sz,height:sz,borderRadius:"50%",background:`conic-gradient(${C.blue} 0deg 270deg,${C.red} 270deg 360deg)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><div style={{width:"52%",height:"52%",borderRadius:"50%",background:C.bg}}/></div>;
const Pzl=({pieces})=><div style={{display:"flex",gap:6,alignItems:"center"}}>{[0,1,2].map(i=><div key={i} style={{width:26,height:26,borderRadius:6,background:i<pieces?`linear-gradient(135deg,${C.red},${C.blue})`:"#e8eaf6",border:`2px solid ${i<pieces?C.red:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>{i<pieces?"🧩":""}</div>)}{pieces>=3&&<span style={{fontSize:18}}>🎁</span>}</div>;

function Toast({msg,onClose}){
  useEffect(()=>{if(msg){const t=setTimeout(onClose,3000);return()=>clearTimeout(t);}},[msg]);
  if(!msg)return null;
  const err=["error","existe","completa","menos","invalido","minimo"].some(w=>msg.toLowerCase().includes(w));
  return <div style={{position:"fixed",top:56,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:err?C.red:C.green,color:"#fff",padding:"10px 22px",borderRadius:12,fontWeight:700,fontSize:13,boxShadow:"0 4px 20px rgba(0,0,0,0.25)",whiteSpace:"nowrap",animation:"slideDown 0.3s ease",maxWidth:"90vw",textAlign:"center"}}>{msg}</div>;
}

function TempPwModal({user,onSave}){
  const [p1,setP1]=useState("");const [p2,setP2]=useState("");const [err,setErr]=useState("");
  const save=()=>{
    if(p1.length<4){setErr("Minimo 4 caracteres");return;}
    if(p1!==p2){setErr("Las contrasenas no coinciden");return;}
    onSave(p1);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(10,10,64,0.78)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{width:"100%",maxWidth:380,boxShadow:`0 8px 40px ${C.blue}44`}}>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:42,marginBottom:8}}>🔑</div>
          <div style={{color:C.blue,fontWeight:800,fontSize:18,marginBottom:6}}>Cambio de Contrasena</div>
          <div style={{color:C.muted,fontSize:13}}>Hola <strong>{user.name}</strong>, el administrador asigno una contrasena temporal. Crea tu nueva contrasena para continuar.</div>
          {user.tempPw&&<div style={{marginTop:10,padding:"8px 12px",background:C.yellowBg,borderRadius:8,color:"#92400e",fontSize:12,fontWeight:700}}>Contrasena temporal: <strong>{user.tempPw}</strong></div>}
        </div>
        <div style={{marginBottom:12}}>
          <div style={{color:C.muted,fontSize:11,letterSpacing:1,marginBottom:4}}>NUEVA CONTRASENA</div>
          <input type="password" value={p1} onChange={e=>setP1(e.target.value)} placeholder="Minimo 4 caracteres" style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"11px 14px",fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:C.bg}}/>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{color:C.muted,fontSize:11,letterSpacing:1,marginBottom:4}}>CONFIRMAR CONTRASENA</div>
          <input type="password" value={p2} onChange={e=>setP2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&save()} placeholder="Repite tu nueva contrasena" style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"11px 14px",fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:C.bg}}/>
        </div>
        {err&&<div style={{color:C.red,fontSize:13,marginBottom:10,textAlign:"center",fontWeight:600}}>{err}</div>}
        <Btn onClick={save} color={C.blue} style={{width:"100%",padding:13}}>GUARDAR NUEVA CONTRASENA</Btn>
      </Card>
    </div>
  );
}

// =============================================
// LOGIN SCREEN - Conectado a Supabase
// =============================================
function LoginScreen({onLogin}){
  const [name,setName]=useState("");
  const [pw,setPw]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  const go=async()=>{
    if(!name.trim()||!pw.trim()){setErr("Escribe tu nombre y contrasena");return;}
    setLoading(true);setErr("");
    try{
      const results = await db.login(name.trim());
      if(!results||results.length===0){
        setErr("Nombre o contrasena incorrectos.");setLoading(false);return;
      }
      const profile = results[0];
      // Comparar contraseña directo (sin hash por ahora)
      if(profile.password_hash !== pw){
        setErr("Nombre o contrasena incorrectos.");setLoading(false);return;
      }
      if(!profile.is_active){
        setErr("Cuenta desactivada. Contacta al administrador.");setLoading(false);return;
      }
      onLogin(adaptProfile(profile));
    }catch(e){
      setErr("Error de conexion. Intenta de nuevo.");
    }
    setLoading(false);
  };

  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:`linear-gradient(160deg,${C.bg} 0%,${C.bgDk} 100%)`}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:14}}><Logo sz={72}/></div>
          <div style={{fontFamily:"Georgia,serif",fontSize:34,fontWeight:900,color:C.blue,letterSpacing:2,lineHeight:1}}>PERFORMANCE</div>
          <div style={{fontFamily:"Georgia,serif",fontSize:34,fontWeight:900,color:C.red,letterSpacing:2,lineHeight:1}}>ARENA</div>
          <div style={{color:C.muted,fontSize:13,marginTop:8}}>Sistema de Gamificacion</div>
        </div>
        <Card style={{boxShadow:`0 8px 40px ${C.blue}18`}}>
          <div style={{marginBottom:14}}>
            <div style={{color:C.muted,fontSize:11,letterSpacing:1,marginBottom:5}}>TU NOMBRE</div>
            <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="Escribe tu nombre" style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"11px 14px",fontSize:15,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:C.bg,color:C.text}}/>
          </div>
          <div style={{marginBottom:20}}>
            <div style={{color:C.muted,fontSize:11,letterSpacing:1,marginBottom:5}}>CONTRASENA</div>
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="Tu contrasena" style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"11px 14px",fontSize:15,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:C.bg,color:C.text}}/>
          </div>
          {err&&<div style={{color:C.red,fontSize:13,marginBottom:14,textAlign:"center",fontWeight:600,padding:"8px 12px",background:C.red2,borderRadius:8}}>{err}</div>}
          <Btn onClick={go} disabled={loading} color={C.blue} style={{width:"100%",padding:13,fontSize:15}}>
            {loading?"Verificando...":"ENTRAR"}
          </Btn>
        </Card>
      </div>
    </div>
  );
}

// =============================================
// DASHBOARD
// =============================================
function Dashboard({user,allUsers,notifs}){
  const sc=gs(user);
  const lv=user.level;
  const maxP=lv===4?9999:lv===3?80:lv===2?64:48;
  const toNext=lv<4?Math.max(0,maxP-sc.total):0;
  return(
    <div style={{paddingBottom:100}}>
      <Card style={{marginBottom:12,background:`linear-gradient(135deg,${C.blue},${C.red})`,border:"none",color:"#fff"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
          <Av av={user.avatar} sz={68}/>
          <div style={{flex:1}}>
            <div style={{fontSize:18,fontWeight:900}}>{user.name}</div>
            <div style={{marginTop:4}}><Bdg l={lv}/></div>
            <div style={{color:"rgba(255,255,255,0.7)",fontSize:12,marginTop:4}}>{user.project}</div>
          </div>
        </div>
        <div style={{marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{color:"rgba(255,255,255,0.7)",fontSize:12}}>Puntos del mes</span>
            <span style={{color:"#fde68a",fontWeight:800,fontSize:14}}>{sc.total} pts</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,alignItems:"center"}}>
            <span style={{color:"rgba(255,255,255,0.55)",fontSize:11}}>Meta nivel {lv+1>4?lv:lv+1}</span>
            <span style={{color:C.redLt,fontSize:12,fontWeight:700}}>{toNext>0?`Faltan ${toNext} pts`:"MAX LEVEL"}</span>
          </div>
          <Bar val={sc.total} max={maxP} color={C.red} h={10}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{color:"rgba(255,255,255,0.45)",fontSize:10,marginBottom:3}}>PUZZLE</div><Pzl pieces={user.puzzlePieces}/></div>
          <div style={{textAlign:"right"}}><div style={{color:"rgba(255,255,255,0.45)",fontSize:10}}>MESES PERFECTOS</div><div style={{color:"#fde68a",fontWeight:800,fontSize:18}}>{user.perfectMonths} ★</div></div>
        </div>
      </Card>
      <Card style={{marginBottom:12}}>
        <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:10}}>SEMANAS DEL MES</div>
        {(user.weeklyPerf||[]).length===0?(
          <div style={{textAlign:"center",color:C.muted,fontSize:13,padding:20}}>No hay datos de semanas aun. El admin los cargara pronto.</div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {(user.weeklyPerf||[]).map((w,i)=>(
              <div key={i} style={{background:w.tot>=12?"#dcfce7":w.tot>=8?"#fef9c3":"#fee2e2",border:`1px solid ${w.tot>=12?"#86efac":w.tot>=8?"#fde68a":"#fca5a5"}`,borderRadius:10,padding:"9px 5px",textAlign:"center"}}>
                <div style={{color:C.muted,fontSize:10}}>S{w.week||i+1}</div>
                <div style={{color:C.text,fontWeight:900,fontSize:19}}>{w.tot}</div>
                <div style={{color:C.muted,fontSize:9}}>/15</div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card style={{marginBottom:12}}>
        <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>METRICAS SOCIALES</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{background:`${C.blue}0c`,border:`1px solid ${C.blue}2a`,borderRadius:12,padding:12}}>
            <div style={{fontSize:24,marginBottom:3}}>👏</div>
            <div style={{color:C.text,fontWeight:700}}>Kudos</div>
            <div style={{color:C.muted,fontSize:12}}>{user.kudos||0} reg - {user.goldKudos||0} gold</div>
            <div style={{color:C.blue,fontWeight:700,fontSize:17,marginTop:4}}>{kp(user)} pts</div>
          </div>
          <div style={{background:`${C.red}0c`,border:`1px solid ${C.red}2a`,borderRadius:12,padding:12}}>
            <div style={{fontSize:24,marginBottom:3}}>🤝</div>
            <div style={{color:C.text,fontWeight:700}}>Referidos</div>
            <div style={{color:C.muted,fontSize:12}}>{(user.referrals||[]).length} total</div>
            <div style={{color:C.red,fontWeight:700,fontSize:17,marginTop:4}}>{rp(user)} pts</div>
          </div>
        </div>
      </Card>
      <Card>
        <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:10}}>HISTORIAL MENSUAL</div>
        {(user.monthsHistory||[]).length===0?(
          <div style={{textAlign:"center",color:C.muted,fontSize:13,padding:10}}>Sin historial aun.</div>
        ):(
          (user.monthsHistory||[]).map((m,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
              <div style={{width:34,color:C.muted,fontSize:12,flexShrink:0}}>{m.month}</div>
              <div style={{flex:1}}><Bar val={m.score} max={80} color={lc(m.level)} h={7}/></div>
              <Bdg l={m.level}/>
              {m.piece&&<span>🧩</span>}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

// =============================================
// LEADERBOARD
// =============================================
function Leaderboard({user,allUsers,shop}){
  const ranked=[...allUsers].filter(u=>u.active).sort((a,b)=>gs(b).total-gs(a).total);
  const medals=["🥇","🥈","🥉"];
  return(
    <div style={{paddingBottom:100}}>
      <Card style={{marginBottom:14,background:`linear-gradient(135deg,${C.red},${C.blue})`,border:"none",textAlign:"center"}}>
        <div style={{fontSize:34}}>🏆</div>
        <div style={{color:"#fff",fontWeight:800,fontSize:20}}>LEADERBOARD</div>
        <div style={{color:"rgba(255,255,255,0.55)",fontSize:12}}>Mes Actual</div>
      </Card>
      {ranked.map((u,i)=>{const sc=gs(u);const isMe=u.id===user.id;return(
        <div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",marginBottom:8,borderRadius:14,background:isMe?`${C.blue}10`:C.card,border:`1.5px solid ${isMe?C.blue:C.border}`,boxShadow:isMe?`0 0 14px ${C.blue}2a`:"none"}}>
          <div style={{width:30,textAlign:"center",fontWeight:900,color:i<3?"#f59e0b":C.muted,fontSize:i<3?20:14}}>{i<3?medals[i]:`#${i+1}`}</div>
          <Av av={u.avatar} sz={42} shop={shop}/>
          <div style={{flex:1}}>
            <div style={{color:C.text,fontWeight:700,fontSize:14}}>{u.name}{isMe&&<span style={{color:C.blue,fontSize:11}}> - TU</span>}</div>
            <Bdg l={u.level}/>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:lc(u.level),fontWeight:900,fontSize:19}}>{sc.total}</div>
            <div style={{color:C.muted,fontSize:11}}>pts</div>
          </div>
        </div>
      );})}
    </div>
  );
}

// =============================================
// RIDDLE
// =============================================
function RiddleScreen(){
  const [sel,setSel]=useState(null);const [done,setDone]=useState(false);const [res,setRes]=useState(null);
  return(
    <div style={{paddingBottom:100}}>
      <Card style={{marginBottom:14,background:`${C.blue}12`,border:`1.5px solid ${C.blue}44`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div><div style={{fontSize:30}}>🧠</div><div style={{color:C.blue,fontWeight:800,fontSize:16,marginTop:3}}>Riddle Semana 4</div></div>
          <div style={{textAlign:"right"}}><div style={{color:C.red,fontWeight:900,fontSize:20}}>+{RIDDLE.pts}</div><div style={{color:C.muted,fontSize:11}}>puntos</div></div>
        </div>
        <div style={{color:C.muted,fontSize:12,marginTop:6}}>2 dias restantes - 1 intento</div>
      </Card>
      {!done?(
        <Card>
          <div style={{color:C.text,fontWeight:700,fontSize:15,lineHeight:1.55,marginBottom:18}}>{RIDDLE.question}</div>
          <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:18}}>
            {RIDDLE.options.map(o=>(
              <div key={o.id} onClick={()=>setSel(o.id)} style={{padding:"12px 14px",borderRadius:11,border:`2px solid ${sel===o.id?C.blue:C.border}`,background:sel===o.id?`${C.blue}0e`:C.bg,cursor:"pointer",display:"flex",alignItems:"center",gap:10,transition:"all 0.15s"}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:sel===o.id?C.blue:"#e8eaf6",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,color:sel===o.id?"#fff":C.muted,flexShrink:0}}>{o.id.toUpperCase()}</div>
                <span style={{color:C.text,fontSize:14}}>{o.text}</span>
              </div>
            ))}
          </div>
          <Btn onClick={()=>{setDone(true);setRes(sel===RIDDLE.correct?"correct":"incorrect");}} disabled={!sel} color={C.blue} style={{width:"100%",padding:12}}>ENVIAR RESPUESTA</Btn>
        </Card>
      ):(
        <Card style={{textAlign:"center"}}>
          <div style={{fontSize:58,marginBottom:10}}>{res==="correct"?"✅":"❌"}</div>
          <div style={{color:res==="correct"?C.green:C.red,fontWeight:800,fontSize:19,marginBottom:8}}>{res==="correct"?"Respuesta Correcta!":"Respuesta Incorrecta"}</div>
          <div style={{color:C.muted,fontSize:14,marginBottom:16}}>{res==="correct"?"Enviado al admin para verificacion.":"La respuesta correcta era B."}</div>
          <div style={{padding:"10px 16px",background:C.yellowBg,border:"1px solid #fde68a",borderRadius:10,display:"inline-block",color:"#92400e",fontWeight:700,fontSize:13}}>El siguiente riddle se desbloquea el proximo lunes</div>
        </Card>
      )}
    </div>
  );
}

// =============================================
// TASK
// =============================================
function TaskScreen(){
  const [desc,setDesc]=useState("");const [file,setFile]=useState(null);const [done,setDone]=useState(false);
  const ref=useRef();
  return(
    <div style={{paddingBottom:100}}>
      <Card style={{marginBottom:14,background:`${C.red}12`,border:`1.5px solid ${C.red}44`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div><div style={{fontSize:30}}>📋</div><div style={{color:C.red,fontWeight:800,fontSize:16,marginTop:3}}>{TASK.title}</div></div>
          <div style={{textAlign:"right"}}><div style={{color:C.red,fontWeight:900,fontSize:20}}>+{TASK.pts}</div><div style={{color:C.muted,fontSize:11}}>puntos</div></div>
        </div>
        <div style={{color:C.muted,fontSize:12,marginTop:6}}>2 dias restantes</div>
      </Card>
      {!done?(
        <>
          <Card style={{marginBottom:12}}>
            <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:8}}>INSTRUCCIONES</div>
            <div style={{color:C.text,fontSize:14,lineHeight:1.65,whiteSpace:"pre-line"}}>{TASK.instructions}</div>
          </Card>
          <Card style={{marginBottom:12}}>
            <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:10}}>TU ENTREGA</div>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Describe brevemente que hiciste (min. 50 caracteres)..." rows={4} style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"10px 13px",fontSize:14,outline:"none",color:C.text,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",background:C.bg,marginBottom:6}}/>
            <div style={{color:C.muted,fontSize:11,marginBottom:12}}>{desc.length} caracteres</div>
            <div onClick={()=>ref.current?.click()} style={{border:`2px dashed ${file?"#16a34a":C.border}`,borderRadius:11,padding:20,textAlign:"center",cursor:"pointer",background:file?C.greenBg:C.bg}}>
              {file?<><div style={{fontSize:26}}>✅</div><div style={{color:C.green,fontWeight:700,marginTop:4}}>{file.name}</div></>:<><div style={{fontSize:26}}>📄</div><div style={{color:C.muted,fontWeight:700,marginTop:4}}>Subir PDF o imagen</div></>}
              <input ref={ref} type="file" accept=".pdf,image/*" style={{display:"none"}} onChange={e=>setFile(e.target.files[0])}/>
            </div>
          </Card>
          <Btn onClick={()=>setDone(true)} disabled={desc.length<50||!file} color={C.red} style={{width:"100%",padding:12}}>ENVIAR TAREA</Btn>
        </>
      ):(
        <Card style={{textAlign:"center"}}>
          <div style={{fontSize:58,marginBottom:10}}>📬</div>
          <div style={{color:C.red,fontWeight:800,fontSize:19,marginBottom:8}}>Tarea Enviada!</div>
          <div style={{color:C.muted,fontSize:14,marginBottom:16}}>El admin revisara tu entrega pronto.</div>
          <div style={{padding:"10px 16px",background:C.yellowBg,border:"1px solid #fde68a",borderRadius:10,display:"inline-block",color:"#92400e",fontWeight:700,fontSize:13}}>La siguiente task se desbloquea el proximo lunes</div>
        </Card>
      )}
    </div>
  );
}

// =============================================
// REWARDS
// =============================================
function Rewards({user,prizes,onRedeem}){
  const sc=gs(user);const lv=user.level;
  const mine=prizes.filter(p=>p.active!==false&&(p.minLevel||p.min_level||1)<=lv);
  const locked=prizes.filter(p=>p.active!==false&&(p.minLevel||p.min_level||1)>lv);
  return(
    <div style={{paddingBottom:100}}>
      <Card style={{marginBottom:14,background:`linear-gradient(135deg,${C.blue},${C.red})`,border:"none",textAlign:"center"}}>
        <div style={{fontSize:36}}>🎁</div>
        <div style={{color:"#fff",fontWeight:800,fontSize:20}}>MIS PREMIOS</div>
        <div style={{marginTop:6}}><Bdg l={lv}/></div>
        <div style={{color:"rgba(255,255,255,0.6)",fontSize:12,marginTop:4}}>Tus puntos: {sc.total}</div>
        <div style={{marginTop:10}}><Pzl pieces={user.puzzlePieces}/></div>
      </Card>
      {mine.length>0&&(
        <Card style={{marginBottom:14}}>
          <div style={{color:C.green,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>DISPONIBLES PARA TU NIVEL</div>
          {mine.map(p=>{const cost=p.pts||p.points_cost||0;const canBuy=sc.total>=cost;return(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 13px",borderRadius:12,border:`1.5px solid ${canBuy?C.green:C.border}`,background:canBuy?`${C.green}08`:C.bg,marginBottom:9}}>
              <div style={{width:46,height:46,borderRadius:8,background:`${C.blue}12`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0}}>{p.emoji||"🎁"}</div>
              <div style={{flex:1}}>
                <div style={{color:C.text,fontWeight:700,fontSize:14}}>{p.name}</div>
                <div style={{color:C.muted,fontSize:12}}>Stock: {p.stock===undefined?p.stock_remaining:p.stock}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:C.blue,fontWeight:800,fontSize:15}}>{cost} pts</div>
                <Btn onClick={()=>onRedeem(p)} disabled={!canBuy||(p.stock||p.stock_remaining||0)<=0} color={C.red} sm>{canBuy&&(p.stock||p.stock_remaining||0)>0?"Canjear":"Sin pts"}</Btn>
              </div>
            </div>
          );})}
        </Card>
      )}
      {locked.length>0&&(
        <Card style={{opacity:0.55}}>
          <div style={{color:C.muted,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>BLOQUEADOS - SUBE DE NIVEL</div>
          {locked.map(p=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 13px",borderRadius:12,border:`1.5px solid ${C.border}`,background:C.bg,marginBottom:8}}>
              <div style={{fontSize:24}}>🔒</div>
              <div style={{flex:1}}><div style={{color:C.muted,fontWeight:700}}>{p.name}</div><div style={{color:C.muted,fontSize:12}}>Requiere Nivel {p.minLevel||p.min_level}</div></div>
              <div style={{color:C.muted,fontWeight:800}}>{p.pts||p.points_cost} pts</div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// =============================================
// NOTIFICACIONES
// =============================================
function Notifs({user,notifs,onMarkRead,onMarkAll}){
  const mine=(notifs||[]).filter(n=>n.recipient_id===user.id||n.toId===user.id).sort((a,b)=>new Date(b.created_at||b.ts)-new Date(a.created_at||a.ts));
  const unread=mine.filter(n=>!n.is_read&&!n.read).length;
  return(
    <div style={{paddingBottom:100}}>
      <Card style={{marginBottom:14,background:`${C.blue}0e`,border:`1.5px solid ${C.blue}33`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:28}}>🔔</div><div style={{color:C.blue,fontWeight:800,fontSize:17}}>Notificaciones</div><div style={{color:C.muted,fontSize:12}}>{unread} sin leer de {mine.length}</div></div>
          {unread>0&&<Btn onClick={onMarkAll} color={C.blue} sm>Todas leidas</Btn>}
        </div>
      </Card>
      {mine.length===0&&<Card style={{textAlign:"center",padding:40}}><div style={{fontSize:48,marginBottom:8}}>📭</div><div style={{color:C.muted}}>No tienes notificaciones aun.</div></Card>}
      {mine.map(n=>{
        const isRead=n.is_read||n.read;
        const ts=n.created_at||n.ts;
        return(
          <Card key={n.id} onClick={()=>onMarkRead(n.id)} style={{marginBottom:10,border:`1.5px solid ${isRead?C.border:C.blue}`,background:isRead?C.card:`${C.blue}06`,cursor:"pointer"}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <div style={{fontSize:28,flexShrink:0}}>{n.emoji||"📢"}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                  <div style={{color:C.text,fontWeight:700,fontSize:14}}>{n.title}</div>
                  {!isRead&&<div style={{width:8,height:8,borderRadius:"50%",background:C.blue,flexShrink:0,marginTop:4}}/>}
                </div>
                <div style={{color:C.text,fontSize:13,lineHeight:1.55,marginBottom:4}}>{n.message||n.body}</div>
                <div style={{color:C.muted,fontSize:11}}>{ts?new Date(ts).toLocaleDateString("es",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):""}</div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// =============================================
// INFO
// =============================================
function Info(){
  const secs=[
    {icon:"📊",color:C.blue,title:"Como se calculan tus puntos",items:["QA Score: superas meta=5pts, igual=2pts, debajo=0pts","AHT: mejor que meta=5pts, igual=2pts, peor=0pts","Attendance: perfecta=5pts, 1 tardanza=3pts, falta o 2 tardanzas=0pts","Riddle: completas todos del mes=10pts, fallas uno=0pts","Task: 100% completadas=10pts, 75%=5pts, 50%=1pt, menos=0pts","Kudos: cada kudo=1pt, cada gold kudo=5pts","Referidos: referido enviado=1pt, si es aprobado=5pts total"]},
    {icon:"🏆",color:C.purple,title:"Como subes de nivel",items:["Level 1 ROOKIE: menos del 80% del maximo posible del mes","Level 2 RISING: 80% o mas del maximo posible","Level 3 ELITE: 90% o mas del maximo posible","Level 4 LEGEND: 100% del maximo posible del mes"]},
    {icon:"🎁",color:C.red,title:"Como obtener premios",items:["Cada nivel desbloquea premios diferentes del catalogo","Level 1: acceso a premios basicos","Level 4: premios exclusivos (VIP room, massage, movie tickets)"]},
    {icon:"🧩",color:C.green,title:"El rompecabezas y meses perfectos",items:["Mes perfecto = maxima performance + Riddle 100% + Task 100%","Cada mes perfecto te da 1 pieza del rompecabezas","Al juntar 3 piezas desbloqueas un premio sorpresa"]},
    {icon:"👏",color:C.yellow,title:"Kudos y Referidos",items:["Los Kudos son reconocimientos que el admin te otorga","Kudo regular = 1 punto, Gold Kudo = 5 puntos","Para referidos: presenta a alguien al equipo = 1pt, si es aprobado = 5pts"]},
    {icon:"🎨",color:C.blueDk,title:"Tu avatar y la tienda",items:["Las bases del avatar son gratis (6 opciones)","Accesorios, ropa, cabello y fondos se compran con puntos","Los precios los establece el administrador"]},
  ];
  return(
    <div style={{paddingBottom:100}}>
      <Card style={{marginBottom:14,background:`linear-gradient(135deg,${C.blue},${C.purple})`,border:"none",textAlign:"center"}}>
        <div style={{fontSize:36}}>📖</div>
        <div style={{color:"#fff",fontWeight:800,fontSize:20}}>COMO FUNCIONA</div>
        <div style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>Guia completa del sistema</div>
      </Card>
      {secs.map(s=>(
        <Card key={s.title} style={{marginBottom:12,borderLeft:`4px solid ${s.color}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{fontSize:26}}>{s.icon}</div>
            <div style={{color:s.color,fontWeight:800,fontSize:15}}>{s.title}</div>
          </div>
          {s.items.map((item,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:7,alignItems:"flex-start"}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:`${s.color}18`,border:`1px solid ${s.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:s.color,flexShrink:0,marginTop:1}}>{i+1}</div>
              <div style={{color:C.text,fontSize:13,lineHeight:1.55}}>{item}</div>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

// =============================================
// PROFILE
// =============================================
function Profile({user,onUpdate,toast,shop}){
  const [av,setAv]=useState(user.avatar||{base:"b1",hair:null,accessory:null,outfit:null,background:null});
  const [tab,setTab]=useState("edit");
  const [saving,setSaving]=useState(false);
  const sc=gs(user);
  const types=["hair","accessory","outfit","background"];
  const tl={hair:"Cabello",accessory:"Accesorios",outfit:"Ropa",background:"Fondo"};
  const isOwned=id=>(user.ownedItems||[]).includes(id);
  const equipped=item=>av[item.type]===item.id;
  const equip=item=>{if(!isOwned(item.id)){toast("Compra este item primero");return;}setAv(p=>({...p,[item.type]:p[item.type]===item.id?null:item.id}));};

  const saveAv=async()=>{
    setSaving(true);
    try{
      await db.updateUser(user.id,{avatar_accessories:av});
      onUpdate({...user,avatar:av});
      toast("Avatar guardado!");
    }catch(e){toast("Error al guardar avatar");}
    setSaving(false);
  };

  const buy=async(item)=>{
    if(sc.total<item.pts){toast("No tienes suficientes puntos");return;}
    const newOwned=[...(user.ownedItems||[]),item.id];
    try{
      await db.updateUser(user.id,{owned_items:newOwned});
      onUpdate({...user,ownedItems:newOwned});
      toast(`${item.label} comprado!`);
    }catch(e){toast("Error al comprar item");}
  };

  const myKudos=(user.kudosLog||[]).sort((a,b)=>new Date(b.created_at||b.ts)-new Date(a.created_at||a.ts));

  return(
    <div style={{paddingBottom:100}}>
      <Card style={{marginBottom:14,textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:10}}><Av av={av} sz={100} shop={shop}/></div>
        <div style={{color:C.text,fontWeight:800,fontSize:18}}>{user.name}</div>
        <div style={{marginTop:4}}><Bdg l={user.level}/></div>
        <div style={{color:C.muted,fontSize:13,marginTop:6}}>Puntos: <strong style={{color:C.blue}}>{sc.total}</strong></div>
        <div style={{display:"flex",justifyContent:"center",gap:16,marginTop:8}}>
          <div style={{textAlign:"center"}}><div style={{color:C.blue,fontWeight:800,fontSize:18}}>{user.kudos||0}</div><div style={{color:C.muted,fontSize:10}}>KUDOS</div></div>
          <div style={{textAlign:"center"}}><div style={{color:"#f59e0b",fontWeight:800,fontSize:18}}>{user.goldKudos||0}</div><div style={{color:C.muted,fontSize:10}}>GOLD</div></div>
          <div style={{textAlign:"center"}}><div style={{color:C.red,fontWeight:800,fontSize:18}}>{(user.referrals||[]).length}</div><div style={{color:C.muted,fontSize:10}}>REFS</div></div>
        </div>
      </Card>
      {myKudos.length>0&&(
        <Card style={{marginBottom:14}}>
          <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>MIS KUDOS RECIBIDOS</div>
          {myKudos.slice(0,6).map((k,i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10,paddingBottom:10,borderBottom:i<Math.min(myKudos.length,6)-1?`1px solid ${C.border}`:"none"}}>
              <div style={{fontSize:24,flexShrink:0}}>{k.gold||k.points_given>=5?"🌟":"👏"}</div>
              <div style={{flex:1}}>
                <div style={{color:C.text,fontWeight:700,fontSize:13}}>{k.gold||k.points_given>=5?"Gold Kudo":"Kudo"}</div>
                <div style={{color:C.muted,fontSize:12,marginTop:2,fontStyle:"italic"}}>"{k.reason}"</div>
              </div>
            </div>
          ))}
        </Card>
      )}
      <div style={{display:"flex",gap:8,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
        {["edit","base","shop"].map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:"8px 15px",borderRadius:9,border:`1.5px solid ${tab===t?C.blue:C.border}`,background:tab===t?`${C.blue}12`:"#fff",color:tab===t?C.blue:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{{edit:"Equipar",base:"Base",shop:"Tienda"}[t]}</button>)}
      </div>
      {tab==="base"&&(
        <Card>
          <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>ELIGE TU BASE (GRATIS)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {BASES.map(b=><div key={b.id} onClick={()=>setAv(p=>({...p,base:b.id}))} style={{padding:13,borderRadius:12,border:`2px solid ${av.base===b.id?C.blue:C.border}`,background:av.base===b.id?`${C.blue}0e`:C.bg,cursor:"pointer",textAlign:"center"}}>
              <div style={{fontSize:36}}>{b.emoji}</div>
              <div style={{color:C.text,fontWeight:700,fontSize:13,marginTop:5}}>{b.label}</div>
              <div style={{color:C.green,fontSize:11}}>Gratis</div>
            </div>)}
          </div>
          <Btn onClick={saveAv} disabled={saving} color={C.blue} style={{width:"100%",padding:11,marginTop:12}}>{saving?"Guardando...":"GUARDAR"}</Btn>
        </Card>
      )}
      {tab==="edit"&&(
        <Card>
          <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>EQUIPAR ITEMS COMPRADOS</div>
          {types.map(type=>(
            <div key={type} style={{marginBottom:14}}>
              <div style={{color:C.text,fontWeight:700,fontSize:12,marginBottom:7}}>{tl[type]}</div>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
                <div onClick={()=>setAv(p=>({...p,[type]:null}))} style={{flexShrink:0,padding:"7px 13px",borderRadius:9,border:`1.5px solid ${!av[type]?C.red:C.border}`,background:!av[type]?"#fee2e2":C.bg,cursor:"pointer",fontSize:12,color:!av[type]?C.red:C.muted,fontWeight:700}}>Ninguno</div>
                {shop.filter(i=>i.type===type).map(item=>(
                  <div key={item.id} onClick={()=>equip(item)} style={{flexShrink:0,padding:"7px 10px",borderRadius:9,border:`1.5px solid ${equipped(item)?C.blue:isOwned(item.id)?C.border:"#e5e7eb"}`,background:equipped(item)?`${C.blue}12`:isOwned(item.id)?C.bg:"#f9fafb",cursor:"pointer",textAlign:"center",minWidth:62,opacity:isOwned(item.id)?1:0.45}}>
                    <div style={{fontSize:20}}>{item.emoji}</div>
                    <div style={{color:C.text,fontSize:10,fontWeight:600}}>{item.label}</div>
                    {!isOwned(item.id)&&<div style={{color:C.muted,fontSize:9}}>🔒</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <Btn onClick={saveAv} disabled={saving} color={C.blue} style={{width:"100%",padding:11,marginTop:4}}>{saving?"Guardando...":"GUARDAR AVATAR"}</Btn>
        </Card>
      )}
      {tab==="shop"&&(
        <div>
          {types.map(type=>(
            <Card key={type} style={{marginBottom:12}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:10}}>{tl[type].toUpperCase()}</div>
              {shop.filter(i=>i.type===type).map(item=>{
                const owned=isOwned(item.id);const canBuy=sc.total>=item.pts;
                return(
                  <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",borderRadius:10,border:`1.5px solid ${owned?"#86efac":C.border}`,background:owned?C.greenBg:C.bg,marginBottom:7}}>
                    <div style={{fontSize:26,flexShrink:0}}>{item.emoji}</div>
                    <div style={{flex:1}}><div style={{color:C.text,fontWeight:700,fontSize:13}}>{item.label}</div>{owned?<Tag color={C.green}>En posesion</Tag>:<Tag color={canBuy?C.blue:C.muted}>{item.pts} pts</Tag>}</div>
                    {!owned&&<Btn onClick={()=>buy(item)} disabled={!canBuy} color={C.blue} sm>Comprar</Btn>}
                  </div>
                );
              })}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================
// ADMIN PANEL
// =============================================
function AdminPanel({cu,allUsers,setAllUsers,metrics,setMetrics,prizes,setPrizes,shop,notifs,setNotifs,toast,reloadUsers}){
  const [tab,setTab]=useState("users");
  const isSA=cu.role==="superadmin";
  const inp={width:"100%",border:`1.5px solid ${C.border}`,borderRadius:8,padding:"9px 11px",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:C.bg,color:C.text};

  const blank={name:"",password:"",role:"user",project:"Campaign K"};
  const [form,setForm]=useState(blank);
  const [filter,setFilter]=useState("active");
  const [resetId,setResetId]=useState(null);
  const [newPw,setNewPw]=useState("");
  const [delConfirm,setDelConfirm]=useState(null);
  const [loading,setLoading]=useState(false);

  const createUser=async()=>{
    if(!form.name.trim()||!form.password.trim()){toast("Completa nombre y contrasena");return;}
    if(allUsers.find(u=>u.name.toLowerCase()===form.name.toLowerCase())){toast("Error: ese nombre ya existe");return;}
    setLoading(true);
    try{
      const hashed=await hashPassword(form.password);
      await db.createUser({
        username:form.name.trim(),
        full_name:form.name.trim(),
        password_hash:hashed,
        role:form.role==="user"?"usuario":form.role,
        team:form.project,
        is_active:true,
        level:1,
      });
      await reloadUsers();
      setForm(blank);
      toast(`Usuario ${form.name} creado`);
    }catch(e){toast("Error al crear usuario: "+e.message);}
    setLoading(false);
  };

  const toggleActive=async(u)=>{
    try{
      await db.updateUser(u.id,{is_active:!u.active});
      await reloadUsers();
      toast(u.active?"Usuario desactivado":"Usuario activado");
    }catch(e){toast("Error al actualizar usuario");}
  };

  const savePw=async(u)=>{
    if(!newPw.trim()||newPw.trim().length<4){toast("Minimo 4 caracteres");return;}
    try{
      const hashed=await hashPassword(newPw.trim());
      await db.updateUser(u.id,{password_hash:hashed,needs_pw_change:true,temp_pw:newPw.trim()});
      await reloadUsers();
      setResetId(null);setNewPw("");
      toast("Contrasena temporal asignada.");
    }catch(e){toast("Error al cambiar contrasena");}
  };

  const deleteUser=async(id)=>{
    try{
      await db.updateUser(id,{is_active:false});
      await reloadUsers();
      setDelConfirm(null);
      toast("Usuario desactivado");
    }catch(e){toast("Error al eliminar usuario");}
  };

  // Kudos
  const [kf,setKf]=useState({toId:"",gold:false,reason:""});
  const sendKudo=async()=>{
    if(!kf.toId||!kf.reason.trim()){toast("Completa todos los campos");return;}
    const target=allUsers.find(u=>u.id===kf.toId);
    if(!target)return;
    try{
      const pts=kf.gold?5:1;
      await db.createKudo({
        from_user_id:cu.id,
        to_user_id:target.id,
        reason:kf.reason,
        category:"general",
        points_given:pts,
      });
      await db.updateUser(target.id,{
        kudos:(target.kudos||0)+(kf.gold?0:1),
        gold_kudos:(target.gold_kudos||0)+(kf.gold?1:0),
        points_total:(target.points_total||0)+pts,
      });
      await db.createNotif({
        recipient_id:target.id,
        sender_id:cu.id,
        title:kf.gold?"Recibiste un Gold Kudo!":"Recibiste un Kudo!",
        message:`${cu.name} te reconocio: "${kf.reason}"`,
        type:"kudos",
      });
      await reloadUsers();
      setKf({toId:"",gold:false,reason:""});
      toast(`Kudo enviado a ${target.name}!`);
    }catch(e){toast("Error al enviar kudo");}
  };

  // Notifs
  const [nf,setNf]=useState({toId:"all",title:"",body:"",emoji:"📢"});
  const sendNotif=async()=>{
    if(!nf.title.trim()||!nf.body.trim()){toast("Completa titulo y mensaje");return;}
    const targets=nf.toId==="all"
      ?allUsers.filter(u=>u.active&&u.role==="user")
      :allUsers.filter(u=>u.id===nf.toId);
    try{
      for(const u of targets){
        await db.createNotif({
          recipient_id:u.id,
          sender_id:cu.id,
          title:nf.title,
          message:nf.body,
          type:"info",
        });
      }
      setNf({toId:"all",title:"",body:"",emoji:"📢"});
      toast(`Notificacion enviada a ${targets.length} usuario(s)`);
    }catch(e){toast("Error al enviar notificacion");}
  };

  // Prizes
  const [pf,setPf]=useState({name:"",pts:100,stock:10,emoji:"🎁",minLevel:1});
  const addPrize=async()=>{
    if(!pf.name.trim()){toast("Escribe el nombre");return;}
    try{
      await db.createPrize({
        name:pf.name,
        points_cost:pf.pts,
        stock:pf.stock,
        category:"general",
        is_active:true,
        min_level:pf.minLevel,
      });
      const updated=await db.getPrizes();
      setPrizes(updated||[]);
      setPf({name:"",pts:100,stock:10,emoji:"🎁",minLevel:1});
      toast("Premio anadido");
    }catch(e){toast("Error al crear premio");}
  };

  const updPz=async(id,field,val)=>{
    const dbField=field==="pts"?"points_cost":field==="stock"?"stock":field==="minLevel"?"min_level":field;
    try{
      await db.updatePrize(id,{[dbField]:val});
      const updated=await db.getPrizes();
      setPrizes(updated||[]);
    }catch(e){toast("Error al actualizar premio");}
  };

  const delPz=async(id)=>{
    try{
      await db.updatePrize(id,{is_active:false});
      const updated=await db.getPrizes();
      setPrizes(updated||[]);
      toast("Premio eliminado");
    }catch(e){toast("Error al eliminar premio");}
  };

  const filtered=allUsers.filter(u=>filter==="active"?u.active:!u.active);

  const tabs=[
    {id:"users",label:"Usuarios"},
    {id:"kudos",label:"Dar Kudo"},
    {id:"notifSend",label:"Enviar Aviso"},
    {id:"prizes",label:"Premios"},
    ...(isSA?[{id:"metrics",label:"Metricas"},{id:"guide",label:"Guia Admin"}]:[]),
  ];

  return(
    <div style={{paddingBottom:100}}>
      {delConfirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(10,10,64,0.78)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{width:"100%",maxWidth:340,textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:8}}>⚠️</div>
            <div style={{color:C.red,fontWeight:800,fontSize:17,marginBottom:8}}>Desactivar usuario</div>
            <div style={{color:C.muted,fontSize:13,marginBottom:16}}>Se desactivara a <strong>{delConfirm.name}</strong>. Sus datos quedan guardados.</div>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={()=>setDelConfirm(null)} color={C.muted} style={{flex:1,padding:11}}>Cancelar</Btn>
              <Btn onClick={()=>deleteUser(delConfirm.id)} color={C.red} style={{flex:1,padding:11}}>Desactivar</Btn>
            </div>
          </Card>
        </div>
      )}
      <Card style={{marginBottom:14,background:`linear-gradient(135deg,${C.blue},${C.red})`,border:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:30}}>⚙️</div>
          <div><div style={{color:"#fff",fontWeight:800,fontSize:17}}>PANEL {isSA?"SUPER ADMIN":"ADMIN"}</div><div style={{color:"rgba(255,255,255,0.55)",fontSize:12}}>{cu.name}</div></div>
        </div>
      </Card>
      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 13px",borderRadius:9,border:`1.5px solid ${tab===t.id?C.blue:C.border}`,background:tab===t.id?`${C.blue}12`:"#fff",color:tab===t.id?C.blue:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{t.label}</button>)}
      </div>

      {tab==="users"&&(
        <div>
          {isSA&&(
            <Card style={{marginBottom:14,border:`1.5px solid ${C.blue}33`}}>
              <div style={{color:C.blue,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>CREAR NUEVO USUARIO</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>NOMBRE</div><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={inp} placeholder="Nombre del agente"/></div>
                <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>CONTRASENA</div><input type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} style={inp} placeholder="Contrasena inicial"/></div>
                <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>PROYECTO</div><input value={form.project} onChange={e=>setForm(p=>({...p,project:e.target.value}))} style={inp}/></div>
                <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>ROL</div>
                  <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} style={inp}>
                    <option value="user">Usuario</option><option value="admin">Admin</option>{isSA&&<option value="superadmin">Super Admin</option>}
                  </select>
                </div>
              </div>
              <Btn onClick={createUser} disabled={loading} color={C.blue} style={{width:"100%",padding:11}}>{loading?"Creando...":"CREAR USUARIO"}</Btn>
            </Card>
          )}
          <div style={{display:"flex",gap:0,marginBottom:14,borderRadius:10,overflow:"hidden",border:`1.5px solid ${C.border}`}}>
            {[{k:"active",label:"Activos",count:allUsers.filter(u=>u.active).length,color:C.green,bg:C.greenBg},{k:"inactive",label:"Inactivos",count:allUsers.filter(u=>!u.active).length,color:C.red,bg:C.red2}].map(t=>(
              <button key={t.k} onClick={()=>setFilter(t.k)} style={{flex:1,padding:"10px 8px",background:filter===t.k?t.bg:"#fff",border:"none",borderRight:t.k==="active"?`1px solid ${C.border}`:"none",cursor:"pointer",fontFamily:"inherit"}}>
                <div style={{fontWeight:900,fontSize:20,color:filter===t.k?t.color:C.muted}}>{t.count}</div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:filter===t.k?t.color:C.muted}}>{t.label.toUpperCase()}</div>
              </button>
            ))}
          </div>
          {filtered.map(u=>(
            <Card key={u.id} style={{marginBottom:10,opacity:u.active?1:0.7,border:`1.5px solid ${u.active?C.border:"#fca5a5"}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <Av av={u.avatar} sz={42} shop={DEFAULT_SHOP}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:C.text,fontWeight:700,fontSize:14}}>{u.name}{u.id===cu.id&&<span style={{color:C.blue,fontSize:10}}> (tu)</span>}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:3}}>
                    <Tag color={u.role==="superadmin"?C.red:u.role==="admin"?C.blue:C.muted}>{(u.role||"user").toUpperCase()}</Tag>
                    <Tag color={u.active?C.green:C.red}>{u.active?"ACTIVO":"INACTIVO"}</Tag>
                    <Bdg l={u.level||1}/>
                  </div>
                </div>
                {isSA&&u.id!==cu.id&&(
                  <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
                    <Btn onClick={()=>toggleActive(u)} color={u.active?C.red:C.green} sm>{u.active?"Desactivar":"Activar"}</Btn>
                    <Btn onClick={()=>{setResetId(resetId===u.id?null:u.id);setNewPw("");}} color={resetId===u.id?"#6b7280":C.yellow} sm>{resetId===u.id?"Cancelar":"Contrasena"}</Btn>
                    <Btn onClick={()=>setDelConfirm(u)} color={C.red} sm>Eliminar</Btn>
                  </div>
                )}
              </div>
              {isSA&&resetId===u.id&&(
                <div style={{marginTop:12,padding:"12px 14px",background:C.yellowBg,borderRadius:10,border:"1.5px solid #fde68a",display:"flex",gap:8,alignItems:"flex-end"}}>
                  <div style={{flex:1}}>
                    <div style={{color:"#92400e",fontSize:11,fontWeight:700,marginBottom:4}}>CONTRASENA TEMPORAL</div>
                    <input type="text" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Escribe la contrasena temporal..." style={{...inp,background:"#fffbeb",border:"1.5px solid #fde68a"}}/>
                  </div>
                  <Btn onClick={()=>savePw(u)} color={C.green} sm>Guardar</Btn>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab==="kudos"&&(
        <Card>
          <div style={{color:C.blue,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>DAR KUDO A UN AGENTE</div>
          <div style={{marginBottom:10}}>
            <div style={{color:C.muted,fontSize:10,marginBottom:3}}>PARA QUIEN</div>
            <select value={kf.toId} onChange={e=>setKf(p=>({...p,toId:e.target.value}))} style={inp}>
              <option value="">Selecciona un agente</option>
              {allUsers.filter(u=>u.active&&u.id!==cu.id).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{color:C.muted,fontSize:10,marginBottom:3}}>TIPO</div>
            <div style={{display:"flex",gap:8}}>
              <div onClick={()=>setKf(p=>({...p,gold:false}))} style={{flex:1,padding:10,borderRadius:9,border:`2px solid ${!kf.gold?C.blue:C.border}`,background:!kf.gold?`${C.blue}0e`:C.bg,cursor:"pointer",textAlign:"center"}}>
                <div style={{fontSize:22}}>👏</div><div style={{color:C.text,fontWeight:700,fontSize:12}}>Kudo (+1pt)</div>
              </div>
              <div onClick={()=>setKf(p=>({...p,gold:true}))} style={{flex:1,padding:10,borderRadius:9,border:`2px solid ${kf.gold?"#f59e0b":C.border}`,background:kf.gold?"#fef9c3":C.bg,cursor:"pointer",textAlign:"center"}}>
                <div style={{fontSize:22}}>🌟</div><div style={{color:C.text,fontWeight:700,fontSize:12}}>Gold Kudo (+5pts)</div>
              </div>
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{color:C.muted,fontSize:10,marginBottom:3}}>MOTIVO</div>
            <textarea value={kf.reason} onChange={e=>setKf(p=>({...p,reason:e.target.value}))} rows={3} style={{...inp,resize:"vertical"}} placeholder="Por que merece este reconocimiento?"/>
          </div>
          <Btn onClick={sendKudo} color={C.blue} style={{width:"100%",padding:11}} disabled={!kf.toId||!kf.reason.trim()}>ENVIAR KUDO</Btn>
        </Card>
      )}

      {tab==="notifSend"&&(
        <Card>
          <div style={{color:C.blue,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>ENVIAR NOTIFICACION</div>
          <div style={{marginBottom:10}}>
            <div style={{color:C.muted,fontSize:10,marginBottom:3}}>DESTINATARIO</div>
            <select value={nf.toId} onChange={e=>setNf(p=>({...p,toId:e.target.value}))} style={inp}>
              <option value="all">Todos los usuarios</option>
              {allUsers.filter(u=>u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div style={{marginBottom:10}}><div style={{color:C.muted,fontSize:10,marginBottom:3}}>TITULO</div><input value={nf.title} onChange={e=>setNf(p=>({...p,title:e.target.value}))} style={inp} placeholder="Titulo de la notificacion"/></div>
          <div style={{marginBottom:14}}><div style={{color:C.muted,fontSize:10,marginBottom:3}}>MENSAJE</div><textarea value={nf.body} onChange={e=>setNf(p=>({...p,body:e.target.value}))} rows={4} style={{...inp,resize:"vertical"}} placeholder="Escribe el mensaje..."/></div>
          <Btn onClick={sendNotif} color={C.blue} style={{width:"100%",padding:11}} disabled={!nf.title.trim()||!nf.body.trim()}>ENVIAR NOTIFICACION</Btn>
        </Card>
      )}

      {tab==="prizes"&&(
        <div>
          <Card style={{marginBottom:14,border:`1.5px solid ${C.blue}33`}}>
            <div style={{color:C.blue,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>NUEVO PREMIO</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>NOMBRE</div><input value={pf.name} onChange={e=>setPf(p=>({...p,name:e.target.value}))} style={inp} placeholder="Nombre del premio"/></div>
              <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>EMOJI</div><input value={pf.emoji} onChange={e=>setPf(p=>({...p,emoji:e.target.value}))} style={inp}/></div>
              <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>PUNTOS</div><input type="number" value={pf.pts} onChange={e=>setPf(p=>({...p,pts:+e.target.value}))} style={inp}/></div>
              <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>STOCK</div><input type="number" value={pf.stock} onChange={e=>setPf(p=>({...p,stock:+e.target.value}))} style={inp}/></div>
            </div>
            <Btn onClick={addPrize} color={C.blue} style={{width:"100%",padding:11}}>ANADIR PREMIO</Btn>
          </Card>
          {prizes.map(p=>(
            <Card key={p.id} style={{marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:30,flexShrink:0}}>{p.emoji||"🎁"}</div>
                <div style={{flex:1}}><div style={{color:C.text,fontWeight:700}}>{p.name}</div><div style={{color:C.muted,fontSize:12}}>{p.points_cost||p.pts}pts - Stock:{p.stock}</div></div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  <Btn onClick={()=>updPz(p.id,"stock",Math.max(0,(p.stock||0)-1))} color={C.red} sm>-1</Btn>
                  <Btn onClick={()=>updPz(p.id,"stock",(p.stock||0)+5)} color={C.green} sm>+5</Btn>
                  <Btn onClick={()=>delPz(p.id)} color={C.muted} sm>Ocultar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab==="metrics"&&(
        <div>
          {DEFAULT_METRICS.map(m=>(
            <Card key={m.id} style={{marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,borderRadius:9,background:`${C.blue}12`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:C.blue,flexShrink:0}}>{m.max}</div>
                <div style={{flex:1}}>
                  <div style={{color:C.text,fontWeight:700}}>{m.name}</div>
                  <div style={{color:C.muted,fontSize:12}}>{m.desc}</div>
                </div>
                <Tag color={m.type==="kpi"?C.blue:m.type==="activity"?C.purple:m.type==="social"?C.green:C.yellow}>{m.type}</Tag>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab==="guide"&&(
        <Card>
          <div style={{color:C.blue,fontWeight:800,fontSize:16,marginBottom:14}}>📋 Guia del Super Admin</div>
          {[
            {t:"Crear usuarios",d:"Ve a la pestaña Usuarios y usa el formulario. La contrasena se guarda encriptada en Supabase."},
            {t:"Dar kudos",d:"Pestaña 'Dar Kudo'. Selecciona agente, tipo (regular o gold) y motivo. Se guarda en Supabase y el agente recibe notificacion."},
            {t:"Enviar avisos",d:"Pestaña 'Enviar Aviso'. Puedes enviar a todos o a uno especifico."},
            {t:"Gestionar premios",d:"Pestaña 'Premios'. Agrega, ajusta stock o desactiva premios del catalogo."},
            {t:"Ver datos en Supabase",d:"En supabase.com > Table Editor puedes ver y editar todos los datos directamente."},
          ].map((g,i)=>(
            <div key={i} style={{marginBottom:14,paddingBottom:14,borderBottom:i<4?`1px solid ${C.border}`:"none"}}>
              <div style={{color:C.text,fontWeight:700,marginBottom:4}}>✅ {g.t}</div>
              <div style={{color:C.muted,fontSize:13,lineHeight:1.6}}>{g.d}</div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// =============================================
// APP PRINCIPAL
// =============================================
export default function App(){
  const [users,setUsers]=useState([]);
  const [prizes,setPrizes]=useState([]);
  const [shop]=useState(DEFAULT_SHOP);
  const [notifs,setNotifs]=useState([]);
  const [loggedIn,setLoggedIn]=useState(null);
  const [screen,setScreen]=useState("dashboard");
  const [toastMsg,setToastMsg]=useState("");
  const [appLoading,setAppLoading]=useState(true);

  // Cargar datos iniciales de Supabase
  const loadInitialData=async()=>{
    try{
      const [usersData,prizesData]=await Promise.all([
        db.getUsers(),
        db.getPrizes(),
      ]);
      setUsers((usersData||[]).map(adaptProfile));
      setPrizes(prizesData||[]);
    }catch(e){
      console.error("Error cargando datos:",e);
    }
    setAppLoading(false);
  };

  useEffect(()=>{loadInitialData();},[]);

  // Recargar notificaciones del usuario logueado
  const loadNotifs=async(userId)=>{
    try{
      const data=await db.getNotifs(userId);
      setNotifs(data||[]);
    }catch(e){}
  };

  useEffect(()=>{
    if(loggedIn){
      loadNotifs(loggedIn.id);
      const interval=setInterval(()=>loadNotifs(loggedIn.id),30000);
      return()=>clearInterval(interval);
    }
  },[loggedIn?.id]);

  const reloadUsers=async()=>{
    const data=await db.getUsers();
    setUsers((data||[]).map(adaptProfile));
  };

  const toast=msg=>setToastMsg(msg);
  const cu=users.find(u=>u.id===loggedIn?.id)||loggedIn;
  const syncUser=upd=>{setUsers(users.map(u=>u.id===upd.id?upd:u));setLoggedIn(upd);};
  const isAdmin=cu?.role==="admin"||cu?.role==="superadmin";
  const isSA=cu?.role==="superadmin";
  const unread=(notifs||[]).filter(n=>(n.recipient_id===cu?.id||n.toId===cu?.id)&&!n.is_read&&!n.read).length;

  const markNotifRead=async(id)=>{
    try{
      await db.markNotifRead(id);
      setNotifs(notifs.map(n=>n.id===id?{...n,is_read:true,read:true}:n));
    }catch(e){}
  };

  const markAllRead=async()=>{
    try{
      await db.markAllNotifsRead(cu.id);
      setNotifs(notifs.map(n=>n.recipient_id===cu.id||n.toId===cu.id?{...n,is_read:true,read:true}:n));
    }catch(e){}
  };

  if(appLoading){
    return(
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,flexDirection:"column",gap:16}}>
        <Logo sz={64}/>
        <div style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:900,color:C.blue,letterSpacing:2}}>PERFORMANCE</div>
        <div style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:900,color:C.red,letterSpacing:2}}>ARENA</div>
        <div style={{color:C.muted,fontSize:14,marginTop:8}}>Conectando con Supabase...</div>
      </div>
    );
  }

  const userNav=[
    {id:"dashboard",icon:"🏠",label:"Inicio"},
    {id:"riddle",icon:"🧠",label:"Riddle"},
    {id:"task",icon:"📋",label:"Task"},
    {id:"leaderboard",icon:"🏆",label:"Ranking"},
    {id:"rewards",icon:"🎁",label:"Premios"},
    {id:"info",icon:"📖",label:"Como"},
    {id:"notifs",icon:"🔔",label:"Avisos",badge:unread},
    {id:"profile",icon:"🎨",label:"Perfil"},
  ];
  const adminNav=[
    {id:"dashboard",icon:"📊",label:"Inicio"},
    {id:"admin",icon:"⚙️",label:"Admin"},
    {id:"leaderboard",icon:"🏆",label:"Ranking"},
    {id:"rewards",icon:"🎁",label:"Premios"},
    {id:"info",icon:"📖",label:"Como"},
    {id:"notifs",icon:"🔔",label:"Avisos",badge:unread},
    {id:"profile",icon:"🎨",label:"Perfil"},
  ];
  const saNav=[
    {id:"dashboard",icon:"📊",label:"Inicio"},
    {id:"admin",icon:"⚙️",label:"Admin"},
    {id:"riddle",icon:"🧠",label:"Riddle"},
    {id:"task",icon:"📋",label:"Task"},
    {id:"leaderboard",icon:"🏆",label:"Ranking"},
    {id:"rewards",icon:"🎁",label:"Premios"},
    {id:"info",icon:"📖",label:"Como"},
    {id:"notifs",icon:"🔔",label:"Avisos",badge:unread},
    {id:"profile",icon:"🎨",label:"Perfil"},
  ];
  const nav=isSA?saNav:isAdmin?adminNav:userNav;
  const titles={dashboard:"Dashboard",riddle:"Riddle",task:"Task",leaderboard:"Leaderboard",rewards:"Premios",info:"Como Funciona",notifs:"Notificaciones",profile:"Perfil",admin:"Panel Admin"};

  if(!loggedIn){
    return <>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Segoe UI",system-ui,sans-serif;background:${C.bg}}input,select,textarea{font-family:inherit}::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      <LoginScreen onLogin={u=>{setLoggedIn(u);setScreen("dashboard");}}/>
    </>;
  }

  return <>
    <style>{`*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Segoe UI",system-ui,sans-serif;background:${C.bg}}input,select,textarea{font-family:inherit}::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>

    {cu?.needsPwChange&&<TempPwModal user={cu} onSave={async pw=>{
      const hashed=await hashPassword(pw);
      await db.updateUser(cu.id,{password_hash:hashed,needs_pw_change:false,temp_pw:null});
      syncUser({...cu,needsPwChange:false,tempPw:null});
      toast("Contrasena actualizada!");
    }}/>}
    <Toast msg={toastMsg} onClose={()=>setToastMsg("")}/>

    <div style={{position:"sticky",top:0,zIndex:100,background:C.card,borderBottom:`1.5px solid ${C.border}`,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:`0 2px 10px ${C.blue}12`}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <Logo sz={34}/>
        <div>
          <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:900,color:C.blue,letterSpacing:1.5,lineHeight:1}}>PERFORMANCE</div>
          <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:900,color:C.red,letterSpacing:1.5,lineHeight:1}}>ARENA</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{textAlign:"right",marginRight:4}}>
          <div style={{color:C.text,fontWeight:700,fontSize:13}}>{cu.name}</div>
          <div style={{color:C.muted,fontSize:11}}>{titles[screen]}</div>
        </div>
        <Av av={cu.avatar} sz={36} shop={shop}/>
        <button onClick={()=>{setLoggedIn(null);setScreen("dashboard");}} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,padding:"4px 10px",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Salir</button>
      </div>
    </div>

    <div style={{padding:"14px 14px 0",animation:"fadeIn 0.25s ease"}}>
      {screen==="dashboard"&&<Dashboard user={cu} allUsers={users} notifs={notifs}/>}
      {screen==="riddle"&&<RiddleScreen/>}
      {screen==="task"&&<TaskScreen/>}
      {screen==="leaderboard"&&<Leaderboard user={cu} allUsers={users} shop={shop}/>}
      {screen==="rewards"&&<Rewards user={cu} prizes={prizes} onRedeem={async p=>{
        const stock=p.stock||0;
        if(stock<=0){toast("Sin stock");return;}
        try{
          await db.createRedemption({user_id:cu.id,reward_id:p.id,points_spent:p.points_cost||p.pts,status:"pending"});
          await db.updatePrize(p.id,{stock:stock-1});
          const updated=await db.getPrizes();
          setPrizes(updated||[]);
          toast(`${p.name} canjeado!`);
        }catch(e){toast("Error al canjear");}
      }}/>}
      {screen==="info"&&<Info/>}
      {screen==="notifs"&&<Notifs user={cu} notifs={notifs} onMarkRead={markNotifRead} onMarkAll={markAllRead}/>}
      {screen==="profile"&&<Profile user={cu} onUpdate={syncUser} toast={toast} shop={shop}/>}
      {screen==="admin"&&<AdminPanel cu={cu} allUsers={users} setAllUsers={setUsers} metrics={DEFAULT_METRICS} setMetrics={()=>{}} prizes={prizes} setPrizes={setPrizes} shop={shop} notifs={notifs} setNotifs={setNotifs} toast={toast} reloadUsers={reloadUsers}/>}
    </div>

    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:C.card,borderTop:`1.5px solid ${C.border}`,display:"flex",padding:"6px 0 10px",boxShadow:`0 -2px 10px ${C.blue}10`,overflowX:"auto"}}>
      {nav.map(item=>{
        const active=screen===item.id;
        return(
          <button key={item.id} onClick={()=>setScreen(item.id)} style={{flex:"0 0 auto",minWidth:58,display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"none",border:"none",cursor:"pointer",padding:"5px 8px",position:"relative"}}>
            {item.badge>0&&<div style={{position:"absolute",top:0,right:8,width:16,height:16,borderRadius:"50%",background:C.red,color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{item.badge}</div>}
            <div style={{fontSize:17,filter:active?"none":"grayscale(55%)",transform:active?"scale(1.1)":"scale(1)",transition:"all 0.18s"}}>{item.icon}</div>
            <div style={{fontSize:9,fontWeight:700,color:active?C.blue:C.muted,transition:"color 0.18s",whiteSpace:"nowrap"}}>{item.label}</div>
            {active&&<div style={{width:16,height:3,borderRadius:2,background:C.blue}}/>}
          </button>
        );
      })}
    </div>
  </>;
}
