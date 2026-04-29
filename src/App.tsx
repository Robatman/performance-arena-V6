// @ts-nocheck
import { useState, useRef, useEffect } from "react";
import ExcelUpload from "./components/ExcelUpload";
import ReferralsPanel from "./components/ReferralsPanel";
import OperationsDashboard from "./components/OperationsDashboard";
import RiddleTask from "./components/RiddleTask";
import CoachingSessions from "./components/CoachingSessions";
import StaffStore from "./components/StaffStore";
import StaffPointsReport from "./components/StaffPointsReport";
import GeneralReport from "./components/GeneralReport";
import StaffActivitiesPanel from "./components/StaffActivitiesPanel";

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";

async function sbFetch(path, options: any = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const db = {
  getUsers: () => sbFetch("profiles?select=*&order=full_name.asc"),
  login: (u) => sbFetch(`profiles?username=eq.${encodeURIComponent(u)}&select=*`),
  createUser: (d) => sbFetch("profiles", { method: "POST", body: JSON.stringify(d) }),
  updateUser: (id, d) => sbFetch(`profiles?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=representation" }),
  getNotifs: (uid) => sbFetch(`notifications?recipient_id=eq.${uid}&order=created_at.desc`),
  createNotif: (d) => sbFetch("notifications", { method: "POST", body: JSON.stringify(d) }),
  markNotifRead: (id) => sbFetch(`notifications?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) }),
  markAllNotifsRead: (uid) => sbFetch(`notifications?recipient_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) }),
  createKudo: (d) => sbFetch("kudos_log", { method: "POST", body: JSON.stringify(d) }),
  getPrizes: () => sbFetch("reward_catalog?is_active=eq.true&order=points_cost.asc"),
  updatePrize: (id, d) => sbFetch(`reward_catalog?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  createPrize: (d) => sbFetch("reward_catalog", { method: "POST", body: JSON.stringify(d) }),
  createRedemption: (d) => sbFetch("reward_redemptions", { method: "POST", body: JSON.stringify(d) }),
  getMyRedemptions: (uid) => sbFetch(`reward_redemptions?user_id=eq.${uid}&order=created_at.desc`),
  getAllRedemptions: () => sbFetch(`reward_redemptions?order=created_at.desc&limit=500`),
  // Coins history
  addCoinsTransaction: (d) => sbFetch("coins_transactions", { method: "POST", body: JSON.stringify(d) }),
  getCoinsHistory: (uid) => sbFetch(`coins_transactions?agent_id=eq.${uid}&order=created_at.desc&limit=50`),
  // Weekly metrics
  getWeeklyMetrics: (gameId) => sbFetch(`weekly_metrics?game_id=eq.${encodeURIComponent(gameId)}&select=*&order=week.asc`),
  getAllWeeklyMetrics: () => sbFetch(`weekly_metrics?select=*&order=game_id.asc`),
  getAllWeeks: () => sbFetch(`weekly_metrics?select=week&order=week.desc`),
  // App config (for trimester reset)
  getConfig: (key) => sbFetch(`app_config?key=eq.${key}&select=*`),
  setConfig: (key, val) => sbFetch(`app_config?key=eq.${key}`, { method: "PATCH", body: JSON.stringify({ value: val }), prefer: "return=representation" }),
  // Riddle/Task counts for max calculation
  getRiddlesMonth: () => sbFetch(`riddles?select=id,created_at&order=created_at.desc`),
  getTasksMonth: () => sbFetch(`tasks?select=id,created_at&order=created_at.desc`),
  // Agent riddle/task completions
  getAgentRiddleAnswers: (gameId) => sbFetch(`agent_riddle_answers?game_id=eq.${encodeURIComponent(gameId)}&select=*`),
  getAgentTaskSubmissions: (gameId) => sbFetch(`agent_task_submissions?game_id=eq.${encodeURIComponent(gameId)}&select=*`),
};

const staffDb = {
  login: (u) => sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(u)}&select=*`),
  getAll: () => sbFetch("staff_profiles?select=*&order=full_name.asc"),
  create: (d) => sbFetch("staff_profiles", { method: "POST", body: JSON.stringify(d) }),
  update: (id, d) => sbFetch(`staff_profiles?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=representation" }),
  getKudos: (id) => sbFetch(`staff_kudos?recipient_id=eq.${id}&order=created_at.desc`),
  createKudo: (d) => sbFetch("staff_kudos", { method: "POST", body: JSON.stringify(d) }),
  updateKudo: (id, d) => sbFetch(`staff_kudos?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  getInnovations: (id) => sbFetch(`staff_innovation_submissions?staff_id=eq.${id}&order=created_at.desc`),
  createInnovation: (d) => sbFetch("staff_innovation_submissions", { method: "POST", body: JSON.stringify(d) }),
  updateInnovation: (id, d) => sbFetch(`staff_innovation_submissions?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  getMetrics: (role, id) => {
    const table = { team_coach:"staff_metrics_team_coach", quality_coach:"staff_metrics_quality_coach", training_coach:"staff_metrics_training_coach", manager:"staff_metrics_manager", training_manager:"staff_metrics_training_manager" }[role];
    return table ? sbFetch(`${table}?staff_id=eq.${id}&order=week_start.desc&limit=8`) : Promise.resolve([]);
  },
  getPoints: (id) => sbFetch(`staff_points?staff_id=eq.${id}&select=*`),
  getBadges: (id) => sbFetch(`staff_badges?staff_id=eq.${id}&order=earned_at.desc`),
};

// ─── SCORE / COINS / LEVEL ENGINE ────────────────────────────────────────────
// Score  = QA + AHT + Attendance + Riddles(approved) + Tasks(approved)   → determines monthly level
// Coins  = Score + Kudos + Referrals                                       → spendable in store
// Max    = (weeks × 15) + (riddles_this_month × 2) + (tasks_this_month × 2)
// Level  = 100% → 4 | ≥90% → 3 | ≥80% → 2 | <80% → 1

export function calcScoreCoins(weeklyMetrics, riddleAnswers, taskSubmissions, kudos, goldKudos, referrals) {
  // Score from weekly metrics (QA + AHT + Attendance per week)
  const kpiScore = (weeklyMetrics || []).reduce((sum, w) => {
    return sum + (w.qa_pts || 0) + (w.aht_pts || 0) + (w.attendance_pts || 0);
  }, 0);

  // Weeks in current data
  const weekCount = (weeklyMetrics || []).length;

  // Riddle points: 2 per approved riddle answer
  const riddleScore = (riddleAnswers || []).filter(r => r.status === "approved").length * 2;

  // Task points: 2 per approved task submission
  const taskScore = (taskSubmissions || []).filter(t => t.status === "approved").length * 2;

  // Total score (for level)
  const score = kpiScore + riddleScore + taskScore;

  // Kudos & referral coins
  const kudosCoins = (kudos || 0) + (goldKudos || 0) * 5;
  const refCoins = (referrals || []).reduce((s, r) => s + (r.approved ? 5 : 1), 0);

  // Total coins (spendable)
  const coins = score + kudosCoins + refCoins;

  return {
    kpiScore,
    riddleScore,
    taskScore,
    score,          // for level calculation
    kudosCoins,
    refCoins,
    coins,          // for store
    weekCount,
  };
}

export function calcLevel(score, maxScore) {
  if (maxScore <= 0) return 1;
  const pct = score / maxScore;
  if (pct >= 1.0) return 4;
  if (pct >= 0.9) return 3;
  if (pct >= 0.8) return 2;
  return 1;
}

export function calcMaxScore(weekCount, riddleCount, taskCount) {
  return (weekCount * 15) + (riddleCount * 2) + (taskCount * 2);
}

export function getLevelPct(score, maxScore) {
  if (maxScore <= 0) return 0;
  return Math.min(score / maxScore, 1);
}

// Level metadata
const LEVEL_META = {
  1: { name: "ROOKIE",  color: "#6b7280", bg: "#6b728018" },
  2: { name: "RISING",  color: "#1a1aff", bg: "#1a1aff18" },
  3: { name: "ELITE",   color: "#7c3aed", bg: "#7c3aed18" },
  4: { name: "LEGEND",  color: "#e8282a", bg: "#e8282a18" },
};

// ─── COLORS ──────────────────────────────────────────────────────────────────
const C = {
  blue:"#1a1aff",blueDk:"#0d0db3",blueLt:"#4d4dff",red:"#e8282a",redLt:"#ff5a5c",
  white:"#fff",bg:"#f0f2ff",bgDk:"#e6e9ff",card:"#fff",text:"#0a0a40",muted:"#6b7280",
  border:"#d1d5f0",green:"#16a34a",greenBg:"#dcfce7",yellow:"#d97706",yellowBg:"#fef9c3",red2:"#fee2e2",purple:"#7c3aed",
  gold:"#f59e0b",
};
const S = {
  bg:"#0f1117",bgCard:"#1a1d27",border:"#2a2d3e",text:"#e8eaf6",muted:"#8b8fa8",
  accent:"#6366f1",accentDk:"#4f46e5",green:"#22c55e",red:"#ef4444",yellow:"#f59e0b",purple:"#a855f7",
};

const DEFAULT_SHOP=[
  {id:"h1",type:"hair",label:"Mohawk",emoji:"💈",pts:50},{id:"h2",type:"hair",label:"Afro Dorado",emoji:"🌟",pts:80},
  {id:"h3",type:"hair",label:"Trenzas",emoji:"🌺",pts:60},{id:"h4",type:"hair",label:"Puas",emoji:"⚡",pts:45},
  {id:"h5",type:"hair",label:"Ondas",emoji:"🌊",pts:55},{id:"h6",type:"hair",label:"Sombrero Mago",emoji:"🎩",pts:90},
  {id:"h7",type:"hair",label:"Gorro Polar",emoji:"🧢",pts:35},{id:"h8",type:"hair",label:"Casco Vikingo",emoji:"⛑️",pts:120},
  {id:"a1",type:"accessory",label:"Lentes Ray",emoji:"🕶️",pts:40},{id:"a2",type:"accessory",label:"Corona",emoji:"👑",pts:150},
  {id:"a3",type:"accessory",label:"Headset",emoji:"🎧",pts:70},{id:"a4",type:"accessory",label:"Monoculo",emoji:"🧐",pts:65},
  {id:"a5",type:"accessory",label:"Mascara Neon",emoji:"🎭",pts:100},{id:"a6",type:"accessory",label:"Collar Estrella",emoji:"⭐",pts:80},
  {id:"a7",type:"accessory",label:"Audif Gaming",emoji:"🎮",pts:95},{id:"a8",type:"accessory",label:"Diamante",emoji:"💎",pts:200},
  {id:"o1",type:"outfit",label:"Traje Elite",emoji:"🤵",pts:200},{id:"o2",type:"outfit",label:"Jersey Rojo",emoji:"👕",pts:90},
  {id:"o3",type:"outfit",label:"Hoodie Neon",emoji:"🧥",pts:120},{id:"o4",type:"outfit",label:"Camisa Pro",emoji:"👔",pts:100},
  {id:"o5",type:"outfit",label:"Bata Cientif",emoji:"🥼",pts:110},{id:"o6",type:"outfit",label:"Capa Heroe",emoji:"🦸",pts:180},
  {id:"o7",type:"outfit",label:"Uniforme Gala",emoji:"🎖️",pts:160},{id:"o8",type:"outfit",label:"Traje Espacial",emoji:"🚀",pts:250},
  {id:"g1",type:"background",label:"Galaxia",emoji:"🌌",pts:80},{id:"g2",type:"background",label:"Fuego",emoji:"🔥",pts:60},
  {id:"g3",type:"background",label:"Diamante",emoji:"💎",pts:180},{id:"g4",type:"background",label:"Confeti",emoji:"🎊",pts:45},
  {id:"g5",type:"background",label:"Aurora",emoji:"🌈",pts:130},{id:"g6",type:"background",label:"Ciudad Noche",emoji:"🌃",pts:110},
  {id:"g7",type:"background",label:"Oceano Deep",emoji:"🌊",pts:95},{id:"g8",type:"background",label:"Volcan",emoji:"🌋",pts:140},
];
const BASES=[{id:"b1",emoji:"😊",label:"Sonriente"},{id:"b2",emoji:"😎",label:"Cool"},{id:"b3",emoji:"🤩",label:"Estrella"},{id:"b4",emoji:"🧑",label:"Neutral"},{id:"b5",emoji:"😄",label:"Alegre"},{id:"b6",emoji:"🥳",label:"Fiesta"}];
const DEFAULT_METRICS=[{id:"qa",name:"QA Score",type:"kpi",max:5,active:true,desc:">meta=5, =meta=2, <meta=0"},{id:"aht",name:"AHT",type:"kpi",max:5,active:true,desc:"<meta=5, =meta=2, >meta=0"},{id:"att",name:"Attendance",type:"special",max:5,active:true,desc:"Perfect=5, 1 tarde=2, falta/2tard=0"},{id:"rdl",name:"Riddle",type:"activity",max:2,active:true,desc:"2pts por riddle aprobado"},{id:"tsk",name:"Task",type:"activity",max:2,active:true,desc:"2pts por task aprobada"},{id:"kdo",name:"Kudos",type:"social",max:999,active:true,desc:"1 kudo=1 coin, 1 gold=5 coins"},{id:"ref",name:"Referidos",type:"social",max:999,active:true,desc:"Enviado=1 coin, aprobado=5 coins total"}];
const STAFF_ROLES={team_coach:"Team Coach",quality_coach:"Quality Coach",training_coach:"Training Coach",manager:"Manager",training_manager:"Training Manager",superadmin:"Super Admin"};
const ROLE_EMOJI={team_coach:"🎯",quality_coach:"🔍",training_coach:"🎓",manager:"👔",training_manager:"📚",superadmin:"⚡"};
const INNOVATION_CATS={ai_project:{label:"AI Project",emoji:"🤖",pts:15,adminOnly:true},process_improvement:{label:"Process Improvement",emoji:"💡",pts:10,adminOnly:false},initiative:{label:"Initiative",emoji:"🚀",pts:8,adminOnly:false},floor_support:{label:"Floor Support",emoji:"🎓",pts:5,adminOnly:false},mentorship:{label:"Mentorship",emoji:"🤝",pts:5,adminOnly:false}};

const lc=(l)=>LEVEL_META[l]?.color||C.muted;
const ln=(l)=>LEVEL_META[l]?.name||"";
const kp=(u)=>(u.kudos||0)+(u.gold_kudos||0)*5;
const rp=(u)=>((u.referrals||[]).reduce((s,r)=>s+(r.approved?5:1),0));

// Legacy gs() kept for compatibility — use calcScoreCoins for new logic
const gs=(u)=>{const perf=(u.weekly_perf||[]).reduce((s,w)=>s+w.tot,0);const wks=Math.max((u.weekly_perf||[]).length,1);const rdl=u.riddle_completed===wks?10:0;const tp=(u.task_completed||0)/wks;const tsk=tp>=1?10:tp>=0.75?5:tp>=0.5?1:0;return{perf,rdl,tsk,kp:kp(u),rp:rp(u),total:perf+rdl+tsk+kp(u)+rp(u)};};

function adaptProfile(p){return{id:p.id,name:p.full_name,username:p.username,password_hash:p.password_hash,role:p.role==="usuario"?"user":p.role,project:p.team||"Campaign K",active:p.is_active,avatar:p.avatar_accessories||{base:"b1",hair:null,accessory:null,outfit:null,background:null},level:p.level||1,puzzlePieces:(p.puzzle_pieces||[]).length,perfectMonths:p.perfect_months||0,kudos:p.kudos||0,goldKudos:p.gold_kudos||0,gold_kudos:p.gold_kudos||0,referrals:p.referrals||[],weekly_perf:p.weekly_perf||[],weeklyPerf:p.weekly_perf||[],riddle_completed:p.riddle_completed||0,riddleCompleted:p.riddle_completed||0,task_completed:p.task_completed||0,taskCompleted:p.task_completed||0,monthsHistory:p.months_history||[],ownedItems:p.owned_items||[],rewards:p.rewards||[],game_id:p.game_id||"",needsPwChange:p.needs_pw_change||false,tempPw:p.temp_pw||null,kudosLog:p.kudos_log||[],points_total:p.points_total||0,coins:p.coins||0,monthly_level:p.monthly_level||1,coach_id:p.coach_id||"",qa_coach:p.qa_coach||"",appType:"agents"};}
function adaptStaffProfile(p){return{id:p.id,gameId:p.game_id||"",username:p.username,name:p.full_name||p.username||"",password_hash:p.password_hash,role:p.role,project:(p.project||"").trim(),managerId:p.manager_id,active:p.is_active,needsPwChange:p.needs_pw_change||false,tempPw:p.temp_pw||null,avatar:p.avatar_accessories||{base:"b1",hair:null,accessory:null,outfit:null,background:null},ownedItems:p.owned_items||[],level:p.level||1,appType:"staff"};}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
function Av({av,sz=80,shop}){const items=shop||DEFAULT_SHOP;const base=BASES.find(b=>b.id===(av?.base||"b1"));const hair=items.find(i=>i.id===av?.hair);const acc=items.find(i=>i.id===av?.accessory);const out=items.find(i=>i.id===av?.outfit);const bg=items.find(i=>i.id===av?.background);const bm={g1:"linear-gradient(135deg,#0a0a40,#1a1aff)",g2:"linear-gradient(135deg,#ff6b35,#f00)",g3:"linear-gradient(135deg,#00d4ff,#0057ff)",g4:"linear-gradient(135deg,#ff9ff3,#ffd700)",g5:"linear-gradient(135deg,#22c55e,#0ea5e9)",g6:"linear-gradient(135deg,#1e1b4b,#f59e0b)",g7:"linear-gradient(135deg,#0369a1,#06b6d4)",g8:"linear-gradient(135deg,#7f1d1d,#f97316)"};const bgs=bg?(bm[bg.id]||`linear-gradient(135deg,${C.bg},${C.bgDk})`):(`linear-gradient(135deg,${C.bg},${C.bgDk})`);return(<div style={{width:sz,height:sz,borderRadius:"50%",background:bgs,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",overflow:"hidden",flexShrink:0,position:"relative",border:`2.5px solid ${C.blue}`,boxShadow:`0 0 0 1px ${C.border}`}}>{out&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:"40%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:sz*0.22}}>{out.emoji}</div>}<div style={{fontSize:sz*0.42,lineHeight:1,zIndex:2}}>{base?.emoji||"😊"}</div>{hair&&<div style={{position:"absolute",top:-2,fontSize:sz*0.26,zIndex:3}}>{hair.emoji}</div>}{acc&&<div style={{position:"absolute",top:"28%",right:"5%",fontSize:sz*0.22,zIndex:4}}>{acc.emoji}</div>}</div>);}
const Card=({children,style={},onClick})=><div onClick={onClick} style={{background:C.card,border:`1.5px solid ${C.border}`,borderRadius:16,padding:18,boxShadow:"0 2px 12px rgba(26,26,255,0.07)",...style,cursor:onClick?"pointer":undefined}}>{children}</div>;
const SCard=({children,style={},onClick})=><div onClick={onClick} style={{background:S.bgCard,border:`1px solid ${S.border}`,borderRadius:14,padding:16,...style,cursor:onClick?"pointer":undefined}}>{children}</div>;
const Btn=({children,onClick,color=C.blue,disabled,style={},sm})=><button onClick={onClick} disabled={disabled} style={{background:disabled?"#c5cae9":color,color:"#fff",border:"none",borderRadius:sm?7:10,padding:sm?"5px 12px":"11px 20px",fontWeight:800,fontSize:sm?12:14,cursor:disabled?"not-allowed":"pointer",boxShadow:disabled?"none":`0 3px 10px ${color}44`,fontFamily:"inherit",transition:"all 0.15s",...style}}>{children}</button>;
const SBtn=({children,onClick,color=S.accent,disabled,style={},sm})=><button onClick={onClick} disabled={disabled} style={{background:disabled?S.border:color,color:"#fff",border:"none",borderRadius:sm?6:9,padding:sm?"5px 12px":"10px 18px",fontWeight:700,fontSize:sm?11:13,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",transition:"all 0.15s",...style}}>{children}</button>;
const Bdg=({l})=><span style={{padding:"3px 10px",borderRadius:20,background:LEVEL_META[l]?.bg||"#6b728018",border:`1.5px solid ${lc(l)}`,color:lc(l),fontWeight:800,fontSize:11,letterSpacing:1.5}}>LVL{l} {ln(l)}</span>;
const Bar=({val,max,color=C.blue,h=8})=>{const p=Math.min((val/Math.max(max,1))*100,100);return <div style={{background:"#e8eaf6",borderRadius:h,overflow:"hidden",height:h}}><div style={{width:p+"%",height:"100%",background:color,borderRadius:h,transition:"width 0.9s cubic-bezier(.34,1.56,.64,1)"}}/></div>;};
const SBar=({val,max,color=S.accent,h=6})=>{const p=Math.min((val/Math.max(max,1))*100,100);return <div style={{background:S.border,borderRadius:h,overflow:"hidden",height:h}}><div style={{width:p+"%",height:"100%",background:color,borderRadius:h,transition:"width 0.9s ease"}}/></div>;};
const Tag=({children,color=C.blue})=><span style={{padding:"2px 8px",borderRadius:6,background:`${color}18`,color,fontSize:11,fontWeight:700}}>{children}</span>;
const STag=({children,color=S.accent})=><span style={{padding:"2px 8px",borderRadius:5,background:`${color}22`,color,fontSize:10,fontWeight:700,letterSpacing:0.5}}>{children}</span>;
const Logo=({sz=32})=><div style={{width:sz,height:sz,borderRadius:"50%",background:`conic-gradient(${C.blue} 0deg 270deg,${C.red} 270deg 360deg)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><div style={{width:"52%",height:"52%",borderRadius:"50%",background:C.bg}}/></div>;
const StaffLogo=({sz=32})=><div style={{width:sz,height:sz,borderRadius:10,background:`linear-gradient(135deg,${S.accent},${S.purple})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:sz*0.5}}>⚡</div>;
const Pzl=({pieces})=><div style={{display:"flex",gap:6,alignItems:"center"}}>{[0,1,2].map(i=><div key={i} style={{width:26,height:26,borderRadius:6,background:i<pieces?`linear-gradient(135deg,${C.red},${C.blue})`:"#e8eaf6",border:`2px solid ${i<pieces?C.red:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>{i<pieces?"🧩":""}</div>)}{pieces>=3&&<span style={{fontSize:18}}>🎁</span>}</div>;

// ─── SCORE BREAKDOWN PILL ─────────────────────────────────────────────────────
function ScorePill({label,val,color,icon}){
  return(
    <div style={{flex:1,background:`${color}10`,border:`1px solid ${color}30`,borderRadius:12,padding:"10px 8px",textAlign:"center"}}>
      <div style={{fontSize:18,marginBottom:2}}>{icon}</div>
      <div style={{color,fontWeight:900,fontSize:18,lineHeight:1}}>{val}</div>
      <div style={{color:C.muted,fontSize:9,marginTop:3,letterSpacing:0.5}}>{label}</div>
    </div>
  );
}

// ─── LEVEL PROGRESS CARD ─────────────────────────────────────────────────────
function LevelProgressCard({score, maxScore, level, coinsTotal}){
  const pct = maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
  const pctDisplay = Math.round(pct * 100);
  const lm = LEVEL_META[level] || LEVEL_META[1];

  // Thresholds for progress bar markers
  const thresholds = [
    { pct: 0.80, label: "L2", color: LEVEL_META[2].color },
    { pct: 0.90, label: "L3", color: LEVEL_META[3].color },
    { pct: 1.00, label: "L4", color: LEVEL_META[4].color },
  ];

  const nextLevel = level < 4 ? level + 1 : null;
  const nextThreshold = nextLevel === 2 ? 0.80 : nextLevel === 3 ? 0.90 : nextLevel === 4 ? 1.00 : null;
  const ptsToNext = nextThreshold ? Math.ceil(nextThreshold * maxScore) - score : 0;

  return(
    <Card style={{marginBottom:12,background:`linear-gradient(135deg,${C.blue} 0%,${C.blueDk} 60%,${C.red} 100%)`,border:"none",color:"#fff"}}>
      {/* Header row */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
        <div>
          <div style={{fontSize:22,fontWeight:900,letterSpacing:1}}>NIVEL DEL MES</div>
          <div style={{marginTop:6,display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.15)",borderRadius:20,padding:"4px 12px"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:lm.color,boxShadow:`0 0 8px ${lm.color}`}}/>
            <span style={{color:"#fff",fontWeight:800,fontSize:13,letterSpacing:1.5}}>LVL {level} · {lm.name}</span>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{color:"rgba(255,255,255,0.6)",fontSize:10,letterSpacing:1}}>SCORE</div>
          <div style={{color:"#fde68a",fontWeight:900,fontSize:28,lineHeight:1}}>{score}</div>
          <div style={{color:"rgba(255,255,255,0.5)",fontSize:11}}>/ {maxScore} max</div>
        </div>
      </div>

      {/* Progress bar with threshold markers */}
      <div style={{marginBottom:10}}>
        <div style={{position:"relative",height:14,background:"rgba(255,255,255,0.2)",borderRadius:7,overflow:"visible",marginBottom:6}}>
          <div style={{width:`${pctDisplay}%`,height:"100%",background:`linear-gradient(90deg,rgba(255,255,255,0.6),#fde68a)`,borderRadius:7,transition:"width 1s cubic-bezier(.34,1.56,.64,1)"}}/>
          {/* Threshold markers */}
          {thresholds.map(t=>(
            <div key={t.label} style={{position:"absolute",top:"-3px",left:`${t.pct*100}%`,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{width:3,height:20,background:t.color,borderRadius:2,opacity:0.9}}/>
              <div style={{color:t.color,fontSize:8,fontWeight:800,marginTop:2,whiteSpace:"nowrap"}}>{t.label}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{color:"rgba(255,255,255,0.7)",fontSize:12,fontWeight:700}}>{pctDisplay}% del máximo</div>
          {level < 4
            ? <div style={{color:"#fde68a",fontSize:12,fontWeight:700}}>Faltan {ptsToNext} pts para Nivel {nextLevel}</div>
            : <div style={{color:"#fde68a",fontSize:12,fontWeight:700}}>🏆 NIVEL MÁXIMO</div>
          }
        </div>
      </div>

      {/* Coins display */}
      <div style={{borderTop:"1px solid rgba(255,255,255,0.2)",paddingTop:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{color:"rgba(255,255,255,0.6)",fontSize:10,letterSpacing:1}}>COINS DISPONIBLES</div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
            <span style={{fontSize:18}}>🪙</span>
            <span style={{color:C.gold,fontWeight:900,fontSize:22}}>{coinsTotal}</span>
            <span style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>para la tienda</span>
          </div>
        </div>
        <Pzl pieces={0}/>
      </div>
    </Card>
  );
}

// ─── SCORE BREAKDOWN CARD ─────────────────────────────────────────────────────
function ScoreBreakdownCard({sc}){
  const rows = [
    { icon:"🎯", label:"KPI (QA+AHT+Att)", val:sc.kpiScore, color:C.blue, desc:"métricas semanales", forScore:true },
    { icon:"🧠", label:"Riddles aprobados", val:sc.riddleScore, color:C.purple, desc:`${sc.riddleScore/2|0} riddles × 2pts`, forScore:true },
    { icon:"📋", label:"Tasks aprobadas",  val:sc.taskScore,   color:C.red,   desc:`${sc.taskScore/2|0} tasks × 2pts`,   forScore:true },
    { icon:"👏", label:"Kudos",            val:sc.kudosCoins,  color:C.gold,  desc:"solo cuentan como coins", forScore:false },
    { icon:"🤝", label:"Referidos",        val:sc.refCoins,    color:C.green, desc:"solo cuentan como coins", forScore:false },
  ];

  return(
    <Card style={{marginBottom:12}}>
      <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:12,fontWeight:700}}>DESGLOSE DE PUNTOS</div>

      {/* Score section */}
      <div style={{background:`${C.blue}08`,borderRadius:10,padding:"10px 12px",marginBottom:8,border:`1px solid ${C.blue}20`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{color:C.blue,fontWeight:800,fontSize:12,letterSpacing:1}}>📊 SCORE (determina nivel)</div>
          <div style={{color:C.blue,fontWeight:900,fontSize:16}}>{sc.score} pts</div>
        </div>
        {rows.filter(r=>r.forScore).map(r=>(
          <div key={r.label} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
            <span style={{fontSize:14,width:20}}>{r.icon}</span>
            <div style={{flex:1}}>
              <span style={{color:C.text,fontSize:13,fontWeight:600}}>{r.label}</span>
              <span style={{color:C.muted,fontSize:11}}> · {r.desc}</span>
            </div>
            <span style={{color:r.color,fontWeight:800,fontSize:14}}>{r.val}</span>
          </div>
        ))}
      </div>

      {/* Coins extras section */}
      <div style={{background:`${C.gold}08`,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.gold}20`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{color:C.gold,fontWeight:800,fontSize:12,letterSpacing:1}}>🪙 COINS EXTRA (solo tienda)</div>
          <div style={{color:C.gold,fontWeight:900,fontSize:16}}>{sc.kudosCoins + sc.refCoins}</div>
        </div>
        {rows.filter(r=>!r.forScore).map(r=>(
          <div key={r.label} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
            <span style={{fontSize:14,width:20}}>{r.icon}</span>
            <div style={{flex:1}}>
              <span style={{color:C.text,fontSize:13,fontWeight:600}}>{r.label}</span>
              <span style={{color:C.muted,fontSize:11}}> · {r.desc}</span>
            </div>
            <span style={{color:r.color,fontWeight:800,fontSize:14}}>{r.val}</span>
          </div>
        ))}
      </div>

      {/* Total coins */}
      <div style={{marginTop:10,padding:"10px 12px",background:`${C.gold}12`,borderRadius:10,border:`1.5px solid ${C.gold}40`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:18}}>🪙</span>
          <span style={{color:C.text,fontWeight:800,fontSize:14}}>Total Coins</span>
        </div>
        <span style={{color:C.gold,fontWeight:900,fontSize:20}}>{sc.coins}</span>
      </div>
    </Card>
  );
}

function Toast({msg,onClose}){useEffect(()=>{if(msg){const t=setTimeout(onClose,3000);return()=>clearTimeout(t);}},[msg]);if(!msg)return null;const err=["error","existe","completa","menos","invalido","minimo","failed"].some(w=>msg.toLowerCase().includes(w));return <div style={{position:"fixed",top:56,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:err?C.red:C.green,color:"#fff",padding:"10px 22px",borderRadius:12,fontWeight:700,fontSize:13,boxShadow:"0 4px 20px rgba(0,0,0,0.25)",whiteSpace:"nowrap",animation:"slideDown 0.3s ease",maxWidth:"90vw",textAlign:"center"}}>{msg}</div>;}

function TempPwModal({user,onSave,dark=false}){const [p1,setP1]=useState("");const [p2,setP2]=useState("");const [err,setErr]=useState("");const save=()=>{if(p1.length<4){setErr(dark?"Minimum 4 characters":"Minimo 4 caracteres");return;}if(p1!==p2){setErr(dark?"Passwords do not match":"Las contrasenas no coinciden");return;}onSave(p1);};const inp={width:"100%",border:`1.5px solid ${dark?S.border:C.border}`,borderRadius:9,padding:"11px 14px",fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:dark?S.bg:C.bg,color:dark?S.text:C.text};return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><div style={{background:dark?S.bgCard:C.card,border:`1px solid ${dark?S.border:C.border}`,borderRadius:16,padding:24,width:"100%",maxWidth:380}}><div style={{textAlign:"center",marginBottom:16}}><div style={{fontSize:42,marginBottom:8}}>🔑</div><div style={{color:dark?S.accent:C.blue,fontWeight:800,fontSize:18,marginBottom:6}}>{dark?"Password Change Required":"Cambio de Contrasena"}</div><div style={{color:dark?S.muted:C.muted,fontSize:13}}>{dark?`Hi ${user.name}, please set your new password.`:`Hola ${user.name}, crea tu nueva contrasena.`}</div></div><div style={{marginBottom:12}}><div style={{color:dark?S.muted:C.muted,fontSize:11,marginBottom:4}}>NEW PASSWORD</div><input type="password" value={p1} onChange={e=>setP1(e.target.value)} style={inp}/></div><div style={{marginBottom:16}}><div style={{color:dark?S.muted:C.muted,fontSize:11,marginBottom:4}}>CONFIRM PASSWORD</div><input type="password" value={p2} onChange={e=>setP2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&save()} style={inp}/></div>{err&&<div style={{color:S.red,fontSize:13,marginBottom:10,textAlign:"center",fontWeight:600}}>{err}</div>}{dark?<SBtn onClick={save} style={{width:"100%",padding:12}}>SAVE PASSWORD</SBtn>:<Btn onClick={save} color={C.blue} style={{width:"100%",padding:12}}>GUARDAR</Btn>}</div></div>);}

function UnifiedLogin({onLoginAgent,onLoginStaff}){
  const [name,setName]=useState("");const [pw,setPw]=useState("");const [err,setErr]=useState("");const [loading,setLoading]=useState(false);const [mode,setMode]=useState("agents");
  const go=async()=>{
    if(!name.trim()||!pw.trim()){setErr(mode==="agents"?"Escribe tu nombre y contrasena":"Enter your username and password");return;}
    setLoading(true);setErr("");
    try{
      if(mode==="agents"){
        const results=await db.login(name.trim());
        if(!results||results.length===0){setErr("Nombre o contrasena incorrectos.");setLoading(false);return;}
        const profile=results[0];
        if(profile.password_hash!==pw){setErr("Nombre o contrasena incorrectos.");setLoading(false);return;}
        if(!profile.is_active){setErr("Cuenta desactivada.");setLoading(false);return;}
        onLoginAgent(adaptProfile(profile));
      }else{
        const results=await staffDb.login(name.trim());
        if(!results||results.length===0){setErr("Invalid username or password.");setLoading(false);return;}
        const profile=results[0];
        if(profile.password_hash!==pw){setErr("Invalid username or password.");setLoading(false);return;}
        if(!profile.is_active){setErr("Account disabled.");setLoading(false);return;}
        onLoginStaff(adaptStaffProfile(profile));
      }
    }catch(e){setErr("Connection error. Please try again.");}
    setLoading(false);
  };
  const isStaff=mode==="staff";
  const inp={width:"100%",border:`1.5px solid ${isStaff?S.border:C.border}`,borderRadius:9,padding:"11px 14px",fontSize:15,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:isStaff?S.bg:C.bg,color:isStaff?S.text:C.text};
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:isStaff?S.bg:`linear-gradient(160deg,${C.bg} 0%,${C.bgDk} 100%)`,transition:"background 0.4s"}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{display:"flex",background:isStaff?S.bgCard:"#e8eaf6",borderRadius:12,padding:4,marginBottom:28,border:`1px solid ${isStaff?S.border:C.border}`}}>
          {["agents","staff"].map(m=><button key={m} onClick={()=>{setMode(m);setErr("");setName("");setPw("");}} style={{flex:1,padding:"10px 0",borderRadius:9,border:"none",background:mode===m?(m==="staff"?S.accent:C.blue):"transparent",color:mode===m?"#fff":isStaff?S.muted:C.muted,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>{m==="agents"?"🏆 Performance Arena":"⚡ Staff Arena"}</button>)}
        </div>
        <div style={{textAlign:"center",marginBottom:28}}>
          {isStaff?(<><div style={{display:"flex",justifyContent:"center",marginBottom:12}}><StaffLogo sz={64}/></div><div style={{fontSize:28,fontWeight:900,color:S.text,letterSpacing:2}}>STAFF</div><div style={{fontSize:28,fontWeight:900,color:S.accent,letterSpacing:2}}>ARENA</div><div style={{color:S.muted,fontSize:12,marginTop:6}}>Staff Performance System</div></>):(<><div style={{display:"flex",justifyContent:"center",marginBottom:12}}><Logo sz={64}/></div><div style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:900,color:C.blue,letterSpacing:2}}>PERFORMANCE</div><div style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:900,color:C.red,letterSpacing:2}}>ARENA</div><div style={{color:C.muted,fontSize:12,marginTop:6}}>Sistema de Gamificacion</div></>)}
        </div>
        <div style={{background:isStaff?S.bgCard:C.card,border:`1.5px solid ${isStaff?S.border:C.border}`,borderRadius:16,padding:20}}>
          <div style={{marginBottom:14}}><div style={{color:isStaff?S.muted:C.muted,fontSize:11,letterSpacing:1,marginBottom:5}}>{isStaff?"USERNAME":"TU NOMBRE"}</div><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder={isStaff?"Your username":"Escribe tu nombre"} style={inp}/></div>
          <div style={{marginBottom:20}}><div style={{color:isStaff?S.muted:C.muted,fontSize:11,letterSpacing:1,marginBottom:5}}>{isStaff?"PASSWORD":"CONTRASENA"}</div><input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder={isStaff?"Your password":"Tu contrasena"} style={inp}/></div>
          {err&&<div style={{color:isStaff?S.red:C.red,fontSize:13,marginBottom:14,textAlign:"center",fontWeight:600,padding:"8px 12px",background:isStaff?`${S.red}22`:C.red2,borderRadius:8}}>{err}</div>}
          <button onClick={go} disabled={loading} style={{width:"100%",padding:13,fontSize:15,background:loading?(isStaff?S.border:"#c5cae9"):(isStaff?S.accent:C.blue),color:"#fff",border:"none",borderRadius:10,fontWeight:800,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit"}}>{loading?"...":(isStaff?"SIGN IN":"ENTRAR")}</button>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD (Agent) ────────────────────────────────────────────────────────
function Dashboard({user, allUsers, notifs, weeklyMetrics, riddleAnswers, taskSubmissions, riddleCount, taskCount, isSA, availableWeeks, selectedWeek, lastEvaluatedWeek, onWeekChange}){
  const sc = calcScoreCoins(
    weeklyMetrics,
    riddleAnswers,
    taskSubmissions,
    user.kudos,
    user.gold_kudos,
    user.referrals
  );
  const maxScore = calcMaxScore(sc.weekCount, riddleCount, taskCount);
  const level = calcLevel(sc.score, maxScore);

  return(
    <div style={{paddingBottom:100}}>
      {/* Level + Score card */}
      <LevelProgressCard score={sc.score} maxScore={maxScore} level={level} coinsTotal={sc.coins}/>

      {isSA&&availableWeeks.length>0&&(<Card style={{marginBottom:12,padding:"12px 14px"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><div><div style={{color:C.muted,fontSize:11,letterSpacing:1,marginBottom:2}}>SEMANA VISUALIZADA</div><div style={{color:C.blue,fontWeight:700,fontSize:13}}>Última evaluada: {availableWeeks[0]}</div></div><select value={selectedWeek} onChange={e=>onWeekChange(e.target.value)} style={{border:`1.5px solid ${C.border}`,borderRadius:8,padding:"7px 11px",fontSize:13,outline:"none",fontFamily:"inherit",background:C.bg,color:C.text,cursor:"pointer"}}>{availableWeeks.map(w=><option key={w} value={w}>{w}</option>)}</select></div></Card>)}
      {!isSA&&lastEvaluatedWeek&&(<Card style={{marginBottom:12,padding:"10px 14px",background:`${C.blue}06`,border:`1.5px solid ${C.blue}20`}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>📅</span><div style={{color:C.muted,fontSize:12}}>Última semana evaluada: <strong style={{color:C.blue}}>{lastEvaluatedWeek}</strong></div></div></Card>)}
      {/* Avatar + identity card */}
      <Card style={{marginBottom:12,display:"flex",alignItems:"center",gap:14}}>
        <Av av={user.avatar} sz={64}/>
        <div style={{flex:1}}>
          <div style={{color:C.text,fontWeight:900,fontSize:17}}>{user.name}</div>
          <div style={{marginTop:4}}><Bdg l={level}/></div>
          <div style={{color:C.muted,fontSize:12,marginTop:4}}>{user.project}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{color:C.muted,fontSize:10,letterSpacing:1}}>MESES PERF.</div>
          <div style={{color:C.gold,fontWeight:900,fontSize:22}}>{user.perfectMonths} ★</div>
        </div>
      </Card>

      {/* Score breakdown */}
      <ScoreBreakdownCard sc={sc}/>

      {/* Mi equipo */}
      <Card style={{marginBottom:12,border:`1.5px solid ${C.blue}22`}}>
        <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>MI EQUIPO</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:C.bg,borderRadius:10}}>
            <div style={{color:C.muted,fontSize:12}}>🎯 Team Coach</div>
            <div style={{color:C.blue,fontWeight:700,fontSize:13}}>{user.coach_id||"—"}</div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:C.bg,borderRadius:10}}>
            <div style={{color:C.muted,fontSize:12}}>🔍 QA Coach</div>
            <div style={{color:C.blue,fontWeight:700,fontSize:13}}>{user.qa_coach||"—"}</div>
          </div>
        </div>
      </Card>

      {/* Semanas del mes */}
      <Card style={{marginBottom:12}}>
        <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:10}}>SEMANAS EVALUADAS</div>
        {(weeklyMetrics||[]).length===0?(
          <div style={{textAlign:"center",color:C.muted,fontSize:13,padding:20}}>No hay datos de semanas aun.</div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min((weeklyMetrics||[]).length,5)},1fr)`,gap:8}}>
            {(weeklyMetrics||[]).map((w,i)=>{
              const wPts=(w.qa_pts||0)+(w.aht_pts||0)+(w.attendance_pts||0);
              const wMax=15;
              const wColor=wPts>=12?C.green:wPts>=8?C.yellow:C.red;
              return(
                <div key={i} style={{background:`${wColor}15`,border:`1px solid ${wColor}40`,borderRadius:10,padding:"9px 5px",textAlign:"center"}}>
                  <div style={{color:C.muted,fontSize:9,marginBottom:2}}>{w.week||`S${i+1}`}</div>
                  <div style={{color:C.text,fontWeight:900,fontSize:18}}>{wPts}</div>
                  <div style={{color:C.muted,fontSize:9}}>/{wMax}</div>
                  <div style={{marginTop:4}}>
                    <Bar val={wPts} max={wMax} color={wColor} h={4}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Historial mensual */}
      <Card>
        <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:10}}>HISTORIAL MENSUAL</div>
        {(user.monthsHistory||[]).length===0?(
          <div style={{textAlign:"center",color:C.muted,fontSize:13,padding:10}}>Sin historial aun.</div>
        ):(
          (user.monthsHistory||[]).map((m,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
              <div style={{width:50,color:C.muted,fontSize:11,flexShrink:0}}>{m.month}</div>
              <div style={{flex:1}}><Bar val={m.score} max={m.maxScore||60} color={lc(m.level||1)} h={7}/></div>
              <Bdg l={m.level||1}/>
              {m.piece&&<span>🧩</span>}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function Leaderboard({user,allUsers,shop,weeklyMetricsAll}){
  const [rankings,setRankings]=useState([]);
  const [loading,setLoading]=useState(true);
  const medals=["🥇","🥈","🥉"];

  useEffect(()=>{
    async function loadRankings(){
      try{
        const res=await fetch(`${SUPABASE_URL}/rest/v1/weekly_metrics?select=game_id,total_pts,qa_pts,aht_pts,attendance_pts&order=game_id.asc`,{
          headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}
        });
        const data=await res.json();
        // Sum KPI score per agent (score = qa+aht+attendance, not total_pts which may include old logic)
        const totals={};
        (data||[]).forEach((r)=>{
          const kpi=(r.qa_pts||0)+(r.aht_pts||0)+(r.attendance_pts||0);
          totals[r.game_id]=(totals[r.game_id]||0)+kpi;
        });
        const ranked=Object.entries(totals)
          .map(([game_id,pts])=>({game_id,pts,profile:allUsers.find(u=>u.game_id===game_id)}))
          .filter(r=>r.profile?.active)
          .sort((a,b)=>b.pts-a.pts);
        setRankings(ranked);
      }catch(e){console.error(e);}
      setLoading(false);
    }
    loadRankings();
  },[allUsers]);

  return(
    <div style={{paddingBottom:100}}>
      <Card style={{marginBottom:14,background:`linear-gradient(135deg,${C.red},${C.blue})`,border:"none",textAlign:"center"}}>
        <div style={{fontSize:34}}>🏆</div>
        <div style={{color:"#fff",fontWeight:800,fontSize:20}}>LEADERBOARD</div>
        <div style={{color:"rgba(255,255,255,0.55)",fontSize:12}}>Score del mes (KPI + Riddles + Tasks)</div>
      </Card>
      {loading&&<div style={{textAlign:"center",padding:40,color:C.muted}}>Cargando ranking...</div>}
      {!loading&&rankings.map((r,i)=>{
        const u=r.profile;
        const isMe=u?.game_id===user.game_id;
        return(
          <div key={r.game_id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",marginBottom:8,borderRadius:14,background:isMe?`${C.blue}10`:C.card,border:`1.5px solid ${isMe?C.blue:C.border}`,boxShadow:isMe?`0 0 14px ${C.blue}2a`:"none"}}>
            <div style={{width:30,textAlign:"center",fontWeight:900,color:i<3?"#f59e0b":C.muted,fontSize:i<3?20:14}}>{i<3?medals[i]:`#${i+1}`}</div>
            <Av av={u?.avatar} sz={42} shop={shop}/>
            <div style={{flex:1}}>
              <div style={{color:C.text,fontWeight:700,fontSize:14}}>{u?.name||r.game_id}{isMe&&<span style={{color:C.blue,fontSize:11}}> - TU</span>}</div>
              <Bdg l={u?.level||1}/>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:C.blue,fontWeight:900,fontSize:19}}>{r.pts}</div>
              <div style={{color:C.muted,fontSize:11}}>score</div>
            </div>
          </div>
        );
      })}
      {!loading&&rankings.length===0&&<Card style={{textAlign:"center",padding:40}}><div style={{fontSize:48,marginBottom:8}}>📭</div><div style={{color:C.muted}}>No hay datos de métricas aún.</div></Card>}
    </div>
  );
}

function RiddleScreen(){const [sel,setSel]=useState(null);const [done,setDone]=useState(false);const [res,setRes]=useState(null);const RIDDLE={question:"Cual accion genera mayor reduccion de errores operativos en un equipo?",options:[{id:"a",text:"Esperar a que el error vuelva"},{id:"b",text:"Documentar causa raiz y crear plan preventivo"},{id:"c",text:"Rotar al agente con mas errores"},{id:"d",text:"Ignorar si no afecta el KPI"}],correct:"b",pts:2};return(<div style={{paddingBottom:100}}><Card style={{marginBottom:14,background:`${C.blue}12`,border:`1.5px solid ${C.blue}44`}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontSize:30}}>🧠</div><div style={{color:C.blue,fontWeight:800,fontSize:16,marginTop:3}}>Riddle Semana 4</div></div><div style={{textAlign:"right"}}><div style={{color:C.red,fontWeight:900,fontSize:20}}>+{RIDDLE.pts}</div><div style={{color:C.muted,fontSize:11}}>puntos score</div></div></div><div style={{color:C.muted,fontSize:12,marginTop:6}}>2 dias restantes - 1 intento</div></Card>{!done?(<Card><div style={{color:C.text,fontWeight:700,fontSize:15,lineHeight:1.55,marginBottom:18}}>{RIDDLE.question}</div><div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:18}}>{RIDDLE.options.map(o=>(<div key={o.id} onClick={()=>setSel(o.id)} style={{padding:"12px 14px",borderRadius:11,border:`2px solid ${sel===o.id?C.blue:C.border}`,background:sel===o.id?`${C.blue}0e`:C.bg,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}><div style={{width:26,height:26,borderRadius:"50%",background:sel===o.id?C.blue:"#e8eaf6",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,color:sel===o.id?"#fff":C.muted,flexShrink:0}}>{o.id.toUpperCase()}</div><span style={{color:C.text,fontSize:14}}>{o.text}</span></div>))}</div><Btn onClick={()=>{setDone(true);setRes(sel===RIDDLE.correct?"correct":"incorrect");}} disabled={!sel} color={C.blue} style={{width:"100%",padding:12}}>ENVIAR RESPUESTA</Btn></Card>):(<Card style={{textAlign:"center"}}><div style={{fontSize:58,marginBottom:10}}>{res==="correct"?"✅":"❌"}</div><div style={{color:res==="correct"?C.green:C.red,fontWeight:800,fontSize:19,marginBottom:8}}>{res==="correct"?"Respuesta Correcta!":"Respuesta Incorrecta"}</div><div style={{color:C.muted,fontSize:14,marginBottom:16}}>{res==="correct"?"Enviado al admin para verificacion. +2 pts al score cuando sea aprobado.":"La respuesta correcta era B."}</div></Card>)}</div>);}

function TaskScreen(){const [desc,setDesc]=useState("");const [file,setFile]=useState(null);const [done,setDone]=useState(false);const ref=useRef();const TASK={title:"Plan de Mejora con IA",instructions:"Usa cualquier herramienta de IA para crear un plan de mejora sobre un problema real de tu operacion. Incluye:\n- Problema identificado\n- Propuesta de mejora\n- Como la IA te ayudo\n- Impacto esperado en KPIs",pts:2};return(<div style={{paddingBottom:100}}><Card style={{marginBottom:14,background:`${C.red}12`,border:`1.5px solid ${C.red}44`}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontSize:30}}>📋</div><div style={{color:C.red,fontWeight:800,fontSize:16,marginTop:3}}>{TASK.title}</div></div><div style={{textAlign:"right"}}><div style={{color:C.red,fontWeight:900,fontSize:20}}>+{TASK.pts}</div><div style={{color:C.muted,fontSize:11}}>puntos score</div></div></div></Card>{!done?(<><Card style={{marginBottom:12}}><div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:8}}>INSTRUCCIONES</div><div style={{color:C.text,fontSize:14,lineHeight:1.65,whiteSpace:"pre-line"}}>{TASK.instructions}</div></Card><Card style={{marginBottom:12}}><textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Describe brevemente que hiciste (min. 50 caracteres)..." rows={4} style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"10px 13px",fontSize:14,outline:"none",color:C.text,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",background:C.bg,marginBottom:6}}/><div style={{color:C.muted,fontSize:11,marginBottom:12}}>{desc.length} caracteres</div><div onClick={()=>ref.current?.click()} style={{border:`2px dashed ${file?"#16a34a":C.border}`,borderRadius:11,padding:20,textAlign:"center",cursor:"pointer",background:file?C.greenBg:C.bg}}>{file?<><div style={{fontSize:26}}>✅</div><div style={{color:C.green,fontWeight:700,marginTop:4}}>{file.name}</div></>:<><div style={{fontSize:26}}>📄</div><div style={{color:C.muted,fontWeight:700,marginTop:4}}>Subir PDF o imagen</div></>}<input ref={ref} type="file" accept=".pdf,image/*" style={{display:"none"}} onChange={e=>setFile(e.target.files[0])}/></div></Card><Btn onClick={()=>setDone(true)} disabled={desc.length<50||!file} color={C.red} style={{width:"100%",padding:12}}>ENVIAR TAREA</Btn></>):(<Card style={{textAlign:"center"}}><div style={{fontSize:58,marginBottom:10}}>📬</div><div style={{color:C.red,fontWeight:800,fontSize:19,marginBottom:8}}>Tarea Enviada!</div><div style={{color:C.muted,fontSize:13}}>+2 pts al score cuando el admin apruebe</div></Card>)}</div>);}

function PrizeCard({p,coins,onRedeem,locked=false}){
  const cost=p.pts||p.points_cost||0;
  const canBuy=!locked&&coins>=cost;
  const stock=p.stock===undefined?(p.stock_remaining||0):(p.stock||0);
  const noStock=stock<=0;
  const minLv=p.minLevel||p.min_level||1;
  const lvColors={1:C.muted,2:C.blue,3:C.purple,4:C.red};
  const lvColor=lvColors[minLv]||C.muted;
  return(
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 13px",borderRadius:14,border:`1.5px solid ${locked?"#e8eaf6":canBuy?C.green:C.border}`,background:locked?"#f9fafb":canBuy?`${C.green}06`:C.bg,marginBottom:10,opacity:locked?0.65:1,transition:"all 0.2s"}}>
      <div style={{width:50,height:50,borderRadius:12,background:locked?"#e8eaf6":`linear-gradient(135deg,${C.blue}18,${C.red}10)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0,border:`1.5px solid ${locked?C.border:C.blue}20`}}>
        {locked?"🔒":p.emoji||"🎁"}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:locked?C.muted:C.text,fontWeight:700,fontSize:14,marginBottom:3}}>{p.name}</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {minLv>1&&(<span style={{padding:"1px 7px",borderRadius:5,background:`${lvColor}18`,border:`1px solid ${lvColor}40`,color:lvColor,fontSize:10,fontWeight:800}}>LVL {minLv}+ requerido</span>)}
          <span style={{color:noStock?C.red:C.muted,fontSize:11}}>{noStock?"Sin stock":`Stock: ${stock}`}</span>
        </div>
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:3,justifyContent:"flex-end",marginBottom:5}}>
          <span style={{fontSize:15}}>🪙</span>
          <span style={{color:locked?C.muted:canBuy?C.gold:C.muted,fontWeight:900,fontSize:17}}>{cost}</span>
        </div>
        {locked
          ?<span style={{color:C.muted,fontSize:11,fontWeight:600}}>Sube de nivel</span>
          :<Btn onClick={()=>onRedeem(p)} disabled={!canBuy||noStock} color={canBuy&&!noStock?C.red:"#9ca3af"} sm>{noStock?"Agotado":canBuy?"Canjear":"Sin coins"}</Btn>
        }
      </div>
    </div>
  );
}

function Rewards({user,prizes,onRedeem,weeklyMetrics,riddleAnswers,taskSubmissions,riddleCount,taskCount}){
  const [tab,setTab]=useState("store");
  const [myRedemptions,setMyRedemptions]=useState([]);
  useEffect(()=>{
    db.getMyRedemptions(user.id).then(d=>setMyRedemptions(d||[])).catch(()=>{});
  },[user.id]);
  const sc=calcScoreCoins(weeklyMetrics,riddleAnswers,taskSubmissions,user.kudos,user.gold_kudos,user.referrals);
  const maxScore=calcMaxScore(sc.weekCount,riddleCount,taskCount);
  const level=calcLevel(sc.score,maxScore);
  const coins=sc.coins;
  const activePrizes=prizes.filter(p=>p.active!==false);
  const freeSection=activePrizes.filter(p=>(p.minLevel||p.min_level||1)===1);
  const exclusiveSection=activePrizes.filter(p=>(p.minLevel||p.min_level||1)>1);
  const exclusiveUnlocked=exclusiveSection.filter(p=>(p.minLevel||p.min_level||1)<=level);
  const exclusiveLocked=exclusiveSection.filter(p=>(p.minLevel||p.min_level||1)>level);
  return(
    <div style={{paddingBottom:100}}>
      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[{id:"store",label:"🏪 Tienda"},{id:"history",label:`📦 Mis Canjes (${myRedemptions.length})`}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 16px",borderRadius:9,border:`1.5px solid ${tab===t.id?C.blue:C.border}`,background:tab===t.id?`${C.blue}12`:"#fff",color:tab===t.id?C.blue:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{t.label}</button>
        ))}
      </div>

      {/* History tab */}
      {tab==="history"&&(
        <div>
          {myRedemptions.length===0?(
            <Card style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:48,marginBottom:8}}>📦</div>
              <div style={{color:C.muted}}>No has canjeado nada aún.</div>
            </Card>
          ):myRedemptions.map((r,i)=>{
            const statusColor={pending:C.yellow,approved:C.green,delivered:C.blue,cancelled:C.red};
            const statusLabel={pending:"Pendiente",approved:"Aprobado",delivered:"Entregado",cancelled:"Cancelado"};
            return(
              <Card key={r.id||i} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{color:C.text,fontWeight:700,fontSize:14,marginBottom:4}}>{r.reward_name||"Premio"}</div>
                    <div style={{color:C.muted,fontSize:12}}>{new Date(r.created_at).toLocaleDateString("es-MX")}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end",marginBottom:4}}>
                      <span>🪙</span>
                      <span style={{color:C.red,fontWeight:700}}>-{r.points_spent||r.coins_spent||0}</span>
                    </div>
                    <span style={{padding:"2px 8px",borderRadius:6,background:`${statusColor[r.status]||C.muted}18`,color:statusColor[r.status]||C.muted,fontSize:11,fontWeight:700}}>{statusLabel[r.status]||r.status}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab==="store"&&<div>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.blue} 0%,#3b0764 50%,${C.red} 100%)`,borderRadius:20,padding:"18px 16px",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div>
            <div style={{color:"#fff",fontWeight:900,fontSize:22,letterSpacing:1}}>🏪 TIENDA</div>
            <div style={{marginTop:4}}><Bdg l={level}/></div>
          </div>
          <Pzl pieces={user.puzzlePieces||0}/>
        </div>
        <div style={{background:"rgba(255,255,255,0.12)",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{color:"rgba(255,255,255,0.6)",fontSize:10,letterSpacing:1,marginBottom:2}}>TUS COINS</div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:24}}>🪙</span>
              <span style={{color:C.gold,fontWeight:900,fontSize:30,lineHeight:1}}>{coins}</span>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:10,marginBottom:2}}>SCORE DEL MES</div>
            <div style={{color:"#fff",fontWeight:800,fontSize:16}}>{sc.score} <span style={{fontSize:11,opacity:0.6}}>/ {maxScore}</span></div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:10}}>Nivel {level} · llave de acceso 🔑</div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 1: COINS LIBRE */}
      <div style={{marginBottom:6}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <div style={{width:4,height:20,borderRadius:2,background:C.gold}}/>
          <div style={{color:C.text,fontWeight:800,fontSize:14}}>Disponibles para todos</div>
          <div style={{flex:1,height:1,background:C.border}}/>
          <span style={{color:C.muted,fontSize:11}}>{freeSection.length} premios</span>
        </div>
        {freeSection.length===0
          ?<Card style={{textAlign:"center",padding:20,color:C.muted,fontSize:13}}>Sin premios en esta sección aún.</Card>
          :freeSection.map(p=><PrizeCard key={p.id} p={p} coins={coins} onRedeem={onRedeem}/>)
        }
      </div>

      {/* SECCIÓN 2: EXCLUSIVOS POR NIVEL */}
      {exclusiveSection.length>0&&(
        <div style={{marginTop:18}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <div style={{width:4,height:20,borderRadius:2,background:C.purple}}/>
            <div style={{color:C.text,fontWeight:800,fontSize:14}}>Exclusivos por Nivel 🔑</div>
            <div style={{flex:1,height:1,background:C.border}}/>
            <span style={{color:C.muted,fontSize:11}}>{exclusiveSection.length} premios</span>
          </div>
          {exclusiveUnlocked.length>0&&(
            <div style={{marginBottom:8}}>
              <div style={{color:C.green,fontSize:11,fontWeight:700,marginBottom:8}}>✅ Tu nivel {level} desbloquea estos:</div>
              {exclusiveUnlocked.map(p=><PrizeCard key={p.id} p={p} coins={coins} onRedeem={onRedeem}/>)}
            </div>
          )}
          {exclusiveLocked.length>0&&(
            <div>
              <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:8}}>🔒 Sube de nivel para acceder:</div>
              {exclusiveLocked.map(p=><PrizeCard key={p.id} p={p} coins={coins} onRedeem={onRedeem} locked/>)}
            </div>
          )}
        </div>
      )}

      {activePrizes.length===0&&(
        <Card style={{textAlign:"center",padding:40}}>
          <div style={{fontSize:48,marginBottom:8}}>🏪</div>
          <div style={{color:C.muted,fontSize:14}}>La tienda está vacía por ahora.</div>
          <div style={{color:C.muted,fontSize:12,marginTop:4}}>El admin agregará premios pronto.</div>
        </Card>
      )}
    </div>}
    </div>
  );
}

function Notifs({user,notifs,onMarkRead,onMarkAll}){const mine=(notifs||[]).filter(n=>n.recipient_id===user.id||n.toId===user.id).sort((a,b)=>new Date(b.created_at||b.ts)-new Date(a.created_at||a.ts));const unread=mine.filter(n=>!n.is_read&&!n.read).length;return(<div style={{paddingBottom:100}}><Card style={{marginBottom:14,background:`${C.blue}0e`,border:`1.5px solid ${C.blue}33`}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:28}}>🔔</div><div style={{color:C.blue,fontWeight:800,fontSize:17}}>Notificaciones</div><div style={{color:C.muted,fontSize:12}}>{unread} sin leer de {mine.length}</div></div>{unread>0&&<Btn onClick={onMarkAll} color={C.blue} sm>Todas leidas</Btn>}</div></Card>{mine.length===0&&<Card style={{textAlign:"center",padding:40}}><div style={{fontSize:48,marginBottom:8}}>📭</div><div style={{color:C.muted}}>No tienes notificaciones aun.</div></Card>}{mine.map(n=>{const isRead=n.is_read||n.read;return(<Card key={n.id} onClick={()=>onMarkRead(n.id)} style={{marginBottom:10,border:`1.5px solid ${isRead?C.border:C.blue}`,background:isRead?C.card:`${C.blue}06`,cursor:"pointer"}}><div style={{display:"flex",gap:10,alignItems:"flex-start"}}><div style={{fontSize:28,flexShrink:0}}>{n.emoji||"📢"}</div><div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}><div style={{color:C.text,fontWeight:700,fontSize:14}}>{n.title}</div>{!isRead&&<div style={{width:8,height:8,borderRadius:"50%",background:C.blue,flexShrink:0,marginTop:4}}/>}</div><div style={{color:C.text,fontSize:13,lineHeight:1.55,marginBottom:4}}>{n.message||n.body}</div></div></div></Card>);})}</div>);}

function Info(){
  const secs=[
    {icon:"📊",color:C.blue,title:"SCORE — determina tu nivel mensual",items:["QA Score: superas meta=5pts, igual=2pts, debajo=0pts","AHT: mejor que meta=5pts, igual=2pts, peor=0pts","Attendance: perfecta=5pts, 1 tardanza=2pts, falta o 2 tardanzas=0pts","Riddle aprobado: +2 pts por cada riddle (aprobado por admin)","Task aprobada: +2 pts por cada task (aprobada por admin)","El Score determina tu nivel: 100%=Nivel 4, ≥90%=Nivel 3, ≥80%=Nivel 2, <80%=Nivel 1"]},
    {icon:"🪙",color:C.gold,title:"COINS — moneda para la tienda",items:["Coins = Score + Kudos + Referidos","Kudos: cada kudo regular = 1 coin, cada gold kudo = 5 coins","Referidos: enviado = 1 coin, si es contratado = 5 coins total","Los coins NO afectan tu nivel, solo sirven para comprar en la tienda","Los coins se reinician cada trimestre (admin)"]},
    {icon:"🏆",color:C.purple,title:"Niveles del mes",items:["El nivel se calcula: Score ÷ Máximo posible del mes × 100","Nivel 4 LEGEND: 100% del máximo","Nivel 3 ELITE: 90% o más","Nivel 2 RISING: 80% o más","Nivel 1 ROOKIE: menos del 80%","El máximo = semanas × 15 + riddles × 2 + tasks × 2"]},
    {icon:"🎁",color:C.red,title:"Tienda de premios",items:["Tu nivel del mes es la llave de acceso","Nivel 4 → acceso a todos los premios","Tus coins son los que gastas al canjear un premio","Cuida tus coins — se reinician cada trimestre"]},
    {icon:"🧩",color:C.green,title:"El rompecabezas",items:["Mes perfecto = 100% en todas las métricas + todos los riddles y tasks aprobados","Cada mes perfecto = 1 pieza del rompecabezas","Al juntar 3 piezas desbloqueas un premio sorpresa"]},
  ];
  return(
    <div style={{paddingBottom:100}}>
      <Card style={{marginBottom:14,background:`linear-gradient(135deg,${C.blue},${C.purple})`,border:"none",textAlign:"center"}}>
        <div style={{fontSize:36}}>📖</div>
        <div style={{color:"#fff",fontWeight:800,fontSize:20}}>COMO FUNCIONA</div>
        <div style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>Score · Coins · Niveles · Tienda</div>
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

function Profile({user,onUpdate,toast,shop,weeklyMetrics,riddleAnswers,taskSubmissions,riddleCount,taskCount}){
  const [av,setAv]=useState(user.avatar||{base:"b1",hair:null,accessory:null,outfit:null,background:null});
  const [tab,setTab]=useState("edit");const [saving,setSaving]=useState(false);
  const sc=calcScoreCoins(weeklyMetrics,riddleAnswers,taskSubmissions,user.kudos,user.gold_kudos,user.referrals);
  const maxScore=calcMaxScore(sc.weekCount,riddleCount,taskCount);
  const level=calcLevel(sc.score,maxScore);
  const coins=sc.coins;
  const types=["hair","accessory","outfit","background"];
  const tl={hair:"Cabello",accessory:"Accesorios",outfit:"Ropa",background:"Fondo"};
  const isOwned=id=>(user.ownedItems||[]).includes(id);
  const equipped=item=>av[item.type]===item.id;
  const equip=item=>{if(!isOwned(item.id)){toast("Compra este item primero");return;}setAv(p=>({...p,[item.type]:p[item.type]===item.id?null:item.id}));};
  const saveAv=async()=>{setSaving(true);try{await db.updateUser(user.id,{avatar_accessories:av});onUpdate({...user,avatar:av});toast("Avatar guardado!");}catch(e){toast("Error al guardar avatar");}setSaving(false);};
  const buy=async(item)=>{
    if(coins<item.pts){toast("No tienes suficientes coins");return;}
    const newOwned=[...(user.ownedItems||[]),item.id];
    try{
      await db.updateUser(user.id,{owned_items:newOwned,coins:(user.coins||0)-(item.pts)});
      onUpdate({...user,ownedItems:newOwned,coins:(user.coins||0)-(item.pts)});
      toast(`${item.label} comprado! -${item.pts} 🪙`);
    }catch(e){toast("Error al comprar item");}
  };
  const myKudos=(user.kudosLog||[]).sort((a,b)=>new Date(b.created_at||b.ts)-new Date(a.created_at||a.ts));
  return(
    <div style={{paddingBottom:100}}>
      <Card style={{marginBottom:14,textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:10}}><Av av={av} sz={100} shop={shop}/></div>
        <div style={{color:C.text,fontWeight:800,fontSize:18}}>{user.name}</div>
        <div style={{marginTop:4}}><Bdg l={level}/></div>
        {/* Score vs Coins */}
        <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:12}}>
          <div style={{background:`${C.blue}10`,border:`1px solid ${C.blue}30`,borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
            <div style={{color:C.blue,fontWeight:900,fontSize:18}}>{sc.score}</div>
            <div style={{color:C.muted,fontSize:10,letterSpacing:0.5}}>SCORE</div>
          </div>
          <div style={{background:`${C.gold}10`,border:`1px solid ${C.gold}30`,borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:14}}>🪙</span>
              <span style={{color:C.gold,fontWeight:900,fontSize:18}}>{coins}</span>
            </div>
            <div style={{color:C.muted,fontSize:10,letterSpacing:0.5}}>COINS</div>
          </div>
          <div style={{textAlign:"center",padding:"8px 14px"}}>
            <div style={{color:C.red,fontWeight:900,fontSize:18}}>{user.perfectMonths||0} ★</div>
            <div style={{color:C.muted,fontSize:10}}>PERF.</div>
          </div>
        </div>
      </Card>

      {myKudos.length>0&&(
        <Card style={{marginBottom:14}}>
          <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>MIS KUDOS RECIBIDOS</div>
          {myKudos.slice(0,6).map((k,i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10,paddingBottom:10,borderBottom:i<Math.min(myKudos.length,6)-1?`1px solid ${C.border}`:"none"}}>
              <div style={{fontSize:24,flexShrink:0}}>{k.gold||k.points_given>=5?"🌟":"👏"}</div>
              <div style={{flex:1}}>
                <div style={{color:C.text,fontWeight:700,fontSize:13}}>{k.gold||k.points_given>=5?"Gold Kudo (+5 coins)":"Kudo (+1 coin)"}</div>
                <div style={{color:C.muted,fontSize:12,marginTop:2,fontStyle:"italic"}}>"{k.reason}"</div>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div style={{display:"flex",gap:8,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
        {["edit","base","shop"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:"8px 15px",borderRadius:9,border:`1.5px solid ${tab===t?C.blue:C.border}`,background:tab===t?`${C.blue}12`:"#fff",color:tab===t?C.blue:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>
            {{edit:"Equipar",base:"Base",shop:"Tienda Avatar"}[t]}
          </button>
        ))}
      </div>

      {tab==="base"&&(<Card><div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>ELIGE TU BASE (GRATIS)</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{BASES.map(b=><div key={b.id} onClick={()=>setAv(p=>({...p,base:b.id}))} style={{padding:13,borderRadius:12,border:`2px solid ${av.base===b.id?C.blue:C.border}`,background:av.base===b.id?`${C.blue}0e`:C.bg,cursor:"pointer",textAlign:"center"}}><div style={{fontSize:36}}>{b.emoji}</div><div style={{color:C.text,fontWeight:700,fontSize:13,marginTop:5}}>{b.label}</div><div style={{color:C.green,fontSize:11}}>Gratis</div></div>)}</div><Btn onClick={saveAv} disabled={saving} color={C.blue} style={{width:"100%",padding:11,marginTop:12}}>{saving?"Guardando...":"GUARDAR"}</Btn></Card>)}

      {tab==="edit"&&(<Card><div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>EQUIPAR ITEMS COMPRADOS</div>{types.map(type=>(<div key={type} style={{marginBottom:14}}><div style={{color:C.text,fontWeight:700,fontSize:12,marginBottom:7}}>{tl[type]}</div><div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}><div onClick={()=>setAv(p=>({...p,[type]:null}))} style={{flexShrink:0,padding:"7px 13px",borderRadius:9,border:`1.5px solid ${!av[type]?C.red:C.border}`,background:!av[type]?"#fee2e2":C.bg,cursor:"pointer",fontSize:12,color:!av[type]?C.red:C.muted,fontWeight:700}}>Ninguno</div>{shop.filter(i=>i.type===type).map(item=>(<div key={item.id} onClick={()=>equip(item)} style={{flexShrink:0,padding:"7px 10px",borderRadius:9,border:`1.5px solid ${equipped(item)?C.blue:isOwned(item.id)?C.border:"#e5e7eb"}`,background:equipped(item)?`${C.blue}12`:isOwned(item.id)?C.bg:"#f9fafb",cursor:"pointer",textAlign:"center",minWidth:62,opacity:isOwned(item.id)?1:0.45}}><div style={{fontSize:20}}>{item.emoji}</div><div style={{color:C.text,fontSize:10,fontWeight:600}}>{item.label}</div>{!isOwned(item.id)&&<div style={{color:C.muted,fontSize:9}}>🔒</div>}</div>))}</div></div>))}<Btn onClick={saveAv} disabled={saving} color={C.blue} style={{width:"100%",padding:11,marginTop:4}}>{saving?"Guardando...":"GUARDAR AVATAR"}</Btn></Card>)}

      {tab==="shop"&&(
        <div>
          <Card style={{marginBottom:10,background:`${C.gold}08`,border:`1px solid ${C.gold}30`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{color:C.text,fontWeight:700}}>Tus coins para avatar</div>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:18}}>🪙</span>
                <span style={{color:C.gold,fontWeight:900,fontSize:20}}>{coins}</span>
              </div>
            </div>
          </Card>
          {types.map(type=>(
            <Card key={type} style={{marginBottom:12}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:10}}>{tl[type].toUpperCase()}</div>
              {shop.filter(i=>i.type===type).map(item=>{
                const owned=isOwned(item.id);const canBuy=coins>=item.pts;
                return(
                  <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",borderRadius:10,border:`1.5px solid ${owned?"#86efac":C.border}`,background:owned?C.greenBg:C.bg,marginBottom:7}}>
                    <div style={{fontSize:26,flexShrink:0}}>{item.emoji}</div>
                    <div style={{flex:1}}>
                      <div style={{color:C.text,fontWeight:700,fontSize:13}}>{item.label}</div>
                      {owned?<Tag color={C.green}>En posesion</Tag>:<div style={{display:"flex",alignItems:"center",gap:3,marginTop:2}}><span style={{fontSize:12}}>🪙</span><Tag color={canBuy?C.gold:C.muted}>{item.pts}</Tag></div>}
                    </div>
                    {!owned&&<Btn onClick={()=>buy(item)} disabled={!canBuy} color={C.gold} sm>Comprar</Btn>}
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

function AdminPanel({cu,allUsers,setAllUsers,prizes,setPrizes,shop,notifs,setNotifs,toast,reloadUsers,riddleCount,taskCount}){
  const [tab,setTab]=useState("users");const isSA=cu.role==="superadmin";
  const inp={width:"100%",border:`1.5px solid ${C.border}`,borderRadius:8,padding:"9px 11px",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:C.bg,color:C.text};
  const blank={name:"",password:"",role:"user",project:"Campaign K",gameId:""};
  const [form,setForm]=useState(blank);const [filter,setFilter]=useState("active");
  const [resetId,setResetId]=useState(null);const [newPw,setNewPw]=useState("");
  const [delConfirm,setDelConfirm]=useState(null);const [loading,setLoading]=useState(false);

  const createUser=async()=>{
    if(!form.name.trim()||!form.password.trim()){toast("Completa nombre y contrasena");return;}
    if(allUsers.find(u=>u.name.toLowerCase()===form.name.toLowerCase())){toast("Error: ese nombre ya existe");return;}
    if(form.gameId.trim()&&allUsers.find(u=>u.game_id===form.gameId.trim())){toast("Error: ese Game ID ya existe");return;}
    setLoading(true);
    try{
      await db.createUser({username:form.name.trim(),full_name:form.name.trim(),password_hash:form.password,role:form.role==="user"?"usuario":form.role,team:form.project,is_active:true,level:1,game_id:form.gameId.trim()||form.name.trim(),coins:0});
      await reloadUsers();setForm(blank);toast(`Usuario ${form.name} creado`);
    }catch(e){toast("Error al crear usuario: "+e.message);}
    setLoading(false);
  };

  const toggleActive=async(u)=>{try{await db.updateUser(u.id,{is_active:!u.active});await reloadUsers();toast(u.active?"Usuario desactivado":"Usuario activado");}catch(e){toast("Error");}};
  const savePw=async(u)=>{if(!newPw.trim()||newPw.trim().length<4){toast("Minimo 4 caracteres");return;}try{await db.updateUser(u.id,{password_hash:newPw.trim(),needs_pw_change:true,temp_pw:newPw.trim()});await reloadUsers();setResetId(null);setNewPw("");toast("Contrasena temporal asignada.");}catch(e){toast("Error");}};

  const [kf,setKf]=useState({toId:"",gold:false,reason:""});
  const sendKudo=async()=>{
    if(!kf.toId||!kf.reason.trim()){toast("Completa todos los campos");return;}
    const target=allUsers.find(u=>u.id===kf.toId);if(!target)return;
    try{
      const pts=kf.gold?5:1;
      await db.createKudo({from_user_id:cu.id,to_user_id:target.id,reason:kf.reason,category:"general",points_given:pts});
      await db.updateUser(target.id,{kudos:(target.kudos||0)+(kf.gold?0:1),gold_kudos:(target.gold_kudos||0)+(kf.gold?1:0)});
      await db.createNotif({recipient_id:target.id,sender_id:cu.id,title:kf.gold?"Recibiste un Gold Kudo! 🌟":"Recibiste un Kudo! 👏",message:`${cu.name} te reconocio: "${kf.reason}" — +${pts} coins`,type:"kudos"});
      await reloadUsers();setKf({toId:"",gold:false,reason:""});toast(`Kudo enviado a ${target.name}! +${pts} coins`);
    }catch(e){toast("Error al enviar kudo");}
  };

  const [nf,setNf]=useState({toId:"all",title:"",body:""});
  const sendNotif=async()=>{if(!nf.title.trim()||!nf.body.trim()){toast("Completa titulo y mensaje");return;}const targets=nf.toId==="all"?allUsers.filter(u=>u.active&&u.role==="user"):allUsers.filter(u=>u.id===nf.toId);try{for(const u of targets){await db.createNotif({recipient_id:u.id,sender_id:cu.id,title:nf.title,message:nf.body,type:"info"});}setNf({toId:"all",title:"",body:""});toast(`Notificacion enviada a ${targets.length} usuario(s)`);}catch(e){toast("Error");}};

  const [pf,setPf]=useState({name:"",pts:100,stock:10,emoji:"🎁",minLevel:1});
  const [allRedemptions,setAllRedemptions]=useState([]);
  const [allStaffRed,setAllStaffRed]=useState([]);
  useEffect(()=>{
    if(isSA){
      db.getAllRedemptions().then(d=>setAllRedemptions(d||[])).catch(()=>{});
      sbFetch("staff_redemptions?order=created_at.desc&limit=200").then(d=>setAllStaffRed(d||[])).catch(()=>{});
    }
  },[isSA]);
  const addPrize=async()=>{if(!pf.name.trim()){toast("Escribe el nombre");return;}try{await db.createPrize({name:pf.name,points_cost:pf.pts,stock:pf.stock,category:"general",is_active:true,min_level:pf.minLevel});const updated=await db.getPrizes();setPrizes(updated||[]);setPf({name:"",pts:100,stock:10,emoji:"🎁",minLevel:1});toast("Premio anadido");}catch(e){toast("Error al crear premio");}};
  const updPz=async(id,field,val)=>{const dbField=field==="pts"?"points_cost":field==="stock"?"stock":field==="minLevel"?"min_level":field;try{await db.updatePrize(id,{[dbField]:val});const updated=await db.getPrizes();setPrizes(updated||[]);}catch(e){toast("Error");}};

  // Coins reset (quarterly)
  const resetAllCoins=async()=>{
    if(!window.confirm("¿Reiniciar coins de TODOS los agentes? Esta acción no se puede deshacer."))return;
    try{
      for(const u of allUsers.filter(x=>x.active)){
        await db.updateUser(u.id,{coins:0});
      }
      await reloadUsers();toast("Coins reiniciados para todos los agentes");
    }catch(e){toast("Error al reiniciar coins");}
  };

  const filtered=allUsers.filter(u=>filter==="active"?u.active:!u.active);
  const tabs=[{id:"users",label:"Usuarios"},{id:"kudos",label:"Dar Kudo"},{id:"notifSend",label:"Enviar Aviso"},{id:"prizes",label:"Premios"},{id:"coins",label:"🪙 Coins"},{id:"canjes",label:"📦 Canjes"},{id:"referrals",label:"🤝 Referidos"}];

  return(
    <div style={{paddingBottom:100}}>
      {delConfirm&&(<div style={{position:"fixed",inset:0,background:"rgba(10,10,64,0.78)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><Card style={{width:"100%",maxWidth:340,textAlign:"center"}}><div style={{fontSize:40,marginBottom:8}}>⚠️</div><div style={{color:C.red,fontWeight:800,fontSize:17,marginBottom:8}}>Desactivar usuario</div><div style={{color:C.muted,fontSize:13,marginBottom:16}}>Se desactivara a <strong>{delConfirm.name}</strong>.</div><div style={{display:"flex",gap:8}}><Btn onClick={()=>setDelConfirm(null)} color={C.muted} style={{flex:1,padding:11}}>Cancelar</Btn><Btn onClick={async()=>{await db.updateUser(delConfirm.id,{is_active:false});await reloadUsers();setDelConfirm(null);toast("Usuario desactivado");}} color={C.red} style={{flex:1,padding:11}}>Desactivar</Btn></div></Card></div>)}

      <Card style={{marginBottom:14,background:`linear-gradient(135deg,${C.blue},${C.red})`,border:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:30}}>⚙️</div>
          <div>
            <div style={{color:"#fff",fontWeight:800,fontSize:17}}>PANEL {isSA?"SUPER ADMIN":"ADMIN"}</div>
            <div style={{color:"rgba(255,255,255,0.55)",fontSize:12}}>{cu.name}</div>
          </div>
        </div>
      </Card>

      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 13px",borderRadius:9,border:`1.5px solid ${tab===t.id?C.blue:C.border}`,background:tab===t.id?`${C.blue}12`:"#fff",color:tab===t.id?C.blue:C.muted,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{t.label}</button>)}
      </div>

      {tab==="users"&&(<div>
        {isSA&&(<Card style={{marginBottom:14,border:`1.5px solid ${C.blue}33`}}>
          <div style={{color:C.blue,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>CREAR NUEVO USUARIO</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>GAME ID</div><input value={form.gameId||""} onChange={e=>setForm(p=>({...p,gameId:e.target.value}))} style={inp} placeholder="ej. AG-001"/></div>
            <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>NOMBRE</div><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={inp} placeholder="Nombre del agente"/></div>
            <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>CONTRASENA</div><input value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} style={inp} placeholder="Contrasena inicial"/></div>
            <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>PROYECTO</div><input value={form.project} onChange={e=>setForm(p=>({...p,project:e.target.value}))} style={inp}/></div>
            <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>ROL</div><select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} style={inp}><option value="user">Usuario</option><option value="admin">Admin</option><option value="superadmin">Super Admin</option></select></div>
          </div>
          <Btn onClick={createUser} disabled={loading} color={C.blue} style={{width:"100%",padding:11}}>{loading?"Creando...":"CREAR USUARIO"}</Btn>
        </Card>)}
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
                  <input type="text" value={newPw} onChange={e=>setNewPw(e.target.value)} style={{...inp,background:"#fffbeb",border:"1.5px solid #fde68a"}}/>
                </div>
                <Btn onClick={()=>savePw(u)} color={C.green} sm>Guardar</Btn>
              </div>
            )}
          </Card>
        ))}
      </div>)}

      {tab==="kudos"&&(<Card>
        <div style={{color:C.blue,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>DAR KUDO A UN AGENTE</div>
        <div style={{marginBottom:10}}><div style={{color:C.muted,fontSize:10,marginBottom:3}}>PARA QUIEN</div><select value={kf.toId} onChange={e=>setKf(p=>({...p,toId:e.target.value}))} style={inp}><option value="">Selecciona un agente</option>{allUsers.filter(u=>u.active&&u.id!==cu.id).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div style={{marginBottom:12}}><div style={{display:"flex",gap:8}}>
          <div onClick={()=>setKf(p=>({...p,gold:false}))} style={{flex:1,padding:10,borderRadius:9,border:`2px solid ${!kf.gold?C.blue:C.border}`,background:!kf.gold?`${C.blue}0e`:C.bg,cursor:"pointer",textAlign:"center"}}><div style={{fontSize:22}}>👏</div><div style={{color:C.text,fontWeight:700,fontSize:12}}>Kudo (+1 coin)</div></div>
          <div onClick={()=>setKf(p=>({...p,gold:true}))} style={{flex:1,padding:10,borderRadius:9,border:`2px solid ${kf.gold?"#f59e0b":C.border}`,background:kf.gold?"#fef9c3":C.bg,cursor:"pointer",textAlign:"center"}}><div style={{fontSize:22}}>🌟</div><div style={{color:C.text,fontWeight:700,fontSize:12}}>Gold Kudo (+5 coins)</div></div>
        </div></div>
        <div style={{marginBottom:14}}><div style={{color:C.muted,fontSize:10,marginBottom:3}}>MOTIVO</div><textarea value={kf.reason} onChange={e=>setKf(p=>({...p,reason:e.target.value}))} rows={3} style={{...inp,resize:"vertical"}} placeholder="Por que merece este reconocimiento?"/></div>
        <Btn onClick={sendKudo} color={C.blue} style={{width:"100%",padding:11}} disabled={!kf.toId||!kf.reason.trim()}>ENVIAR KUDO</Btn>
      </Card>)}

      {tab==="notifSend"&&(<Card>
        <div style={{color:C.blue,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>ENVIAR NOTIFICACION</div>
        <div style={{marginBottom:10}}><div style={{color:C.muted,fontSize:10,marginBottom:3}}>DESTINATARIO</div><select value={nf.toId} onChange={e=>setNf(p=>({...p,toId:e.target.value}))} style={inp}><option value="all">Todos los usuarios</option>{allUsers.filter(u=>u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div style={{marginBottom:10}}><div style={{color:C.muted,fontSize:10,marginBottom:3}}>TITULO</div><input value={nf.title} onChange={e=>setNf(p=>({...p,title:e.target.value}))} style={inp} placeholder="Titulo de la notificacion"/></div>
        <div style={{marginBottom:14}}><div style={{color:C.muted,fontSize:10,marginBottom:3}}>MENSAJE</div><textarea value={nf.body} onChange={e=>setNf(p=>({...p,body:e.target.value}))} rows={4} style={{...inp,resize:"vertical"}} placeholder="Escribe el mensaje..."/></div>
        <Btn onClick={sendNotif} color={C.blue} style={{width:"100%",padding:11}} disabled={!nf.title.trim()||!nf.body.trim()}>ENVIAR NOTIFICACION</Btn>
      </Card>)}

      {tab==="prizes"&&(<div>
        <Card style={{marginBottom:14,border:`1.5px solid ${C.blue}33`}}>
          <div style={{color:C.blue,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>NUEVO PREMIO</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>NOMBRE</div><input value={pf.name} onChange={e=>setPf(p=>({...p,name:e.target.value}))} style={inp} placeholder="Nombre del premio"/></div>
            <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>EMOJI</div><input value={pf.emoji} onChange={e=>setPf(p=>({...p,emoji:e.target.value}))} style={inp}/></div>
            <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>COINS 🪙</div><input type="number" value={pf.pts} onChange={e=>setPf(p=>({...p,pts:+e.target.value}))} style={inp}/></div>
            <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>STOCK</div><input type="number" value={pf.stock} onChange={e=>setPf(p=>({...p,stock:+e.target.value}))} style={inp}/></div>
            <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>NIVEL MÍNIMO</div><select value={pf.minLevel} onChange={e=>setPf(p=>({...p,minLevel:+e.target.value}))} style={inp}><option value={1}>Nivel 1 - Todos</option><option value={2}>Nivel 2+</option><option value={3}>Nivel 3+</option><option value={4}>Solo Nivel 4</option></select></div>
          </div>
          <Btn onClick={addPrize} color={C.blue} style={{width:"100%",padding:11}}>ANADIR PREMIO</Btn>
        </Card>
        {prizes.map(p=>(
          <Card key={p.id} style={{marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:30,flexShrink:0}}>{p.emoji||"🎁"}</div>
              <div style={{flex:1}}>
                <div style={{color:C.text,fontWeight:700}}>{p.name}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                  <span style={{fontSize:12}}>🪙</span>
                  <span style={{color:C.gold,fontWeight:700,fontSize:13}}>{p.points_cost||p.pts} coins</span>
                  <Tag color={C.muted}>Stock: {p.stock}</Tag>
                  <Tag color={C.purple}>Nivel {p.min_level||1}+</Tag>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <Btn onClick={()=>updPz(p.id,"stock",Math.max(0,(p.stock||0)-1))} color={C.red} sm>-1</Btn>
                <Btn onClick={()=>updPz(p.id,"stock",(p.stock||0)+5)} color={C.green} sm>+5</Btn>
                <Btn onClick={async()=>{await db.updatePrize(p.id,{is_active:false});const u=await db.getPrizes();setPrizes(u||[]);toast("Premio ocultado");}} color={C.muted} sm>Ocultar</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>)}

      {tab==="coins"&&(<div>
        <Card style={{marginBottom:14,background:`${C.gold}08`,border:`1.5px solid ${C.gold}30`}}>
          <div style={{fontSize:24,marginBottom:8}}>🪙</div>
          <div style={{color:C.text,fontWeight:800,fontSize:16,marginBottom:4}}>Gestión de Coins</div>
          <div style={{color:C.muted,fontSize:13,marginBottom:16,lineHeight:1.6}}>
            Los coins se reinician cada trimestre (Ene-Mar / Abr-Jun / Jul-Sep / Oct-Dic).<br/>
            Esta acción pondrá los coins de TODOS los agentes activos en 0.
          </div>
          <Btn onClick={resetAllCoins} color={C.red} style={{width:"100%",padding:12}}>
            🔄 REINICIAR COINS (TRIMESTRAL)
          </Btn>
        </Card>
        {/* Coins per agent overview */}
        <Card>
          <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>COINS POR AGENTE</div>
          {allUsers.filter(u=>u.active).sort((a,b)=>(b.coins||0)-(a.coins||0)).slice(0,20).map(u=>(
            <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.border}`}}>
              <Av av={u.avatar} sz={36} shop={DEFAULT_SHOP}/>
              <div style={{flex:1}}>
                <div style={{color:C.text,fontWeight:700,fontSize:13}}>{u.name}</div>
                <div style={{color:C.muted,fontSize:11}}>{u.project}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:14}}>🪙</span>
                <span style={{color:C.gold,fontWeight:900,fontSize:16}}>{u.coins||0}</span>
              </div>
            </div>
          ))}
        </Card>
      </div>)}

      {tab==="canjes"&&(
        <div>
          <Card style={{marginBottom:14,background:`${C.blue}08`,border:`1.5px solid ${C.blue}20`}}>
            <div style={{color:C.blue,fontWeight:800,fontSize:14,marginBottom:4}}>📦 Historial de Canjes</div>
            <div style={{color:C.muted,fontSize:12}}>Todos los canjes de agentes y staff</div>
          </Card>
          {/* Agentes */}
          <div style={{color:C.text,fontWeight:700,fontSize:13,marginBottom:8}}>🏆 Agentes ({allRedemptions.length})</div>
          {allRedemptions.length===0?<Card style={{marginBottom:14,textAlign:"center",color:C.muted,padding:20}}>Sin canjes de agentes aún.</Card>:allRedemptions.map((r,i)=>{
            const u=allUsers.find(x=>x.id===r.user_id);
            const statusColor={pending:C.yellow,approved:C.green,delivered:C.blue,cancelled:C.red};
            const statusLabel={pending:"Pendiente",approved:"Aprobado",delivered:"Entregado",cancelled:"Cancelado"};
            return(
              <Card key={r.id||i} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:C.text,fontWeight:700,fontSize:13}}>{u?.name||r.user_id}</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>{r.reward_name||"Premio"} · {new Date(r.created_at).toLocaleDateString("es-MX")}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                      <span>🪙</span>
                      <span style={{color:C.red,fontWeight:700}}>{r.points_spent||0}</span>
                    </div>
                    <span style={{padding:"2px 8px",borderRadius:6,background:`${statusColor[r.status]||C.muted}18`,color:statusColor[r.status]||C.muted,fontSize:11,fontWeight:700}}>{statusLabel[r.status]||r.status}</span>
                  </div>
                </div>
              </Card>
            );
          })}
          {/* Staff */}
          <div style={{color:C.text,fontWeight:700,fontSize:13,marginBottom:8,marginTop:16}}>⚡ Staff ({allStaffRed.length})</div>
          {allStaffRed.length===0?<Card style={{textAlign:"center",color:C.muted,padding:20}}>Sin canjes de staff aún.</Card>:allStaffRed.map((r,i)=>{
            const statusColor={pending:C.yellow,approved:C.green,delivered:C.blue,cancelled:C.red};
            const statusLabel={pending:"Pendiente",approved:"Aprobado",delivered:"Entregado",cancelled:"Cancelado"};
            return(
              <Card key={r.id||i} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:C.text,fontWeight:700,fontSize:13}}>{r.staff_game_id}</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>{r.reward_name||"Premio"} · {new Date(r.created_at).toLocaleDateString("es-MX")}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                      <span>🪙</span>
                      <span style={{color:C.red,fontWeight:700}}>{r.coins_spent||0}</span>
                    </div>
                    <span style={{padding:"2px 8px",borderRadius:6,background:`${statusColor[r.status]||C.muted}18`,color:statusColor[r.status]||C.muted,fontSize:11,fontWeight:700}}>{statusLabel[r.status]||r.status}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {tab==="referrals"&&<ReferralsPanel isAdmin={true}/>}
    </div>
  );
}

// ─── STAFF COMPONENTS (unchanged) ─────────────────────────────────────────────
function StaffDashboard({user,allStaff,metrics,points,badges,kudos}){
  const totalPts=(points?.points_month)||0;const totalPtsAll=(points?.points_total)||0;
  const roleEmoji=ROLE_EMOJI[user.role]||"👤";
  const levelNames=["","Rookie","Rising Star","Performer","Elite Coach","Legend"];
  const levelColors=["","#6b7280",S.accent,S.purple,S.yellow,S.green];
  const lv=user.level||1;
  const approvedKudos=(kudos||[]).filter(k=>k.status==="approved");
  return(
    <div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}>
      <SCard style={{marginBottom:12,background:`linear-gradient(135deg,${S.accentDk},${S.purple})`,border:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
          <div style={{width:68,height:68,borderRadius:"50%",background:`${S.accent}33`,border:`2px solid ${S.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,flexShrink:0}}>{roleEmoji}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:18,fontWeight:900,color:S.text}}>{user.name}</div>
            <div style={{color:"#a5b4fc",fontSize:13,marginTop:2}}>{STAFF_ROLES[user.role]}</div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:6}}>
              <div style={{padding:"3px 10px",borderRadius:20,background:`${levelColors[lv]}22`,border:`1px solid ${levelColors[lv]}`,color:levelColors[lv],fontWeight:700,fontSize:11}}>LVL {lv} · {levelNames[lv]||"Rookie"}</div>
              <div style={{color:"rgba(255,255,255,0.5)",fontSize:11}}>{user.project}</div>
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[{label:"Month Pts",val:totalPts,color:S.yellow},{label:"Total Pts",val:totalPtsAll,color:S.green},{label:"Badges",val:(badges||[]).length,color:S.purple}].map(stat=>(
            <div key={stat.label} style={{background:"rgba(255,255,255,0.1)",borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
              <div style={{color:stat.color,fontWeight:900,fontSize:20}}>{stat.val}</div>
              <div style={{color:"rgba(255,255,255,0.5)",fontSize:10,marginTop:2}}>{stat.label}</div>
            </div>
          ))}
        </div>
      </SCard>
      <SCard style={{marginBottom:12}}>
        <div style={{color:S.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>RECENT WEEKLY PERFORMANCE</div>
        {(metrics||[]).length===0?(<div style={{textAlign:"center",color:S.muted,fontSize:13,padding:20}}>No metrics uploaded yet.</div>):(<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>{(metrics||[]).slice(0,4).map((w,i)=>{const pts=w.pts_week_total||0;const pct=Math.min((pts/20)*100,100);return(<div key={i} style={{background:pct>=80?`${S.green}22`:pct>=50?`${S.yellow}22`:`${S.red}22`,border:`1px solid ${pct>=80?S.green:pct>=50?S.yellow:S.red}44`,borderRadius:10,padding:"9px 5px",textAlign:"center"}}><div style={{color:S.muted,fontSize:9}}>W{i+1}</div><div style={{color:S.text,fontWeight:900,fontSize:18}}>{pts}</div><div style={{color:S.muted,fontSize:9}}>pts</div></div>);})}</div>)}
      </SCard>
      {approvedKudos.length>0&&(<SCard style={{marginBottom:12}}><div style={{color:S.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>RECENT KUDOS</div>{approvedKudos.slice(0,3).map((k,i)=>(<div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10,paddingBottom:10,borderBottom:i<2?`1px solid ${S.border}`:"none"}}><div style={{fontSize:22}}>{k.kudo_type==="gold"?"🌟":"👏"}</div><div style={{flex:1}}><div style={{color:k.kudo_type==="gold"?S.yellow:S.accent,fontWeight:700,fontSize:13}}>{k.kudo_type==="gold"?"Gold Kudo":"Kudo"} · +{k.points_awarded} pts</div><div style={{color:S.muted,fontSize:12,fontStyle:"italic",marginTop:2}}>"{k.reason}"</div></div></div>))}</SCard>)}
      {(badges||[]).length>0&&(<SCard><div style={{color:S.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>MY BADGES</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{(badges||[]).map((b,i)=>(<div key={i} style={{padding:"6px 12px",borderRadius:20,background:`${S.accent}22`,border:`1px solid ${S.accent}44`,color:S.accent,fontSize:12,fontWeight:700}}>{b.badge_emoji||"🏅"} {b.badge_name}</div>))}</div></SCard>)}
    </div>
  );
}

function StaffLeaderboard({user,allStaff}){const peers=allStaff.filter(u=>u.active&&u.role===user.role&&(user.role==="superadmin"||u.project===user.project));const sorted=[...peers].sort((a,b)=>(b.monthPts||0)-(a.monthPts||0));const medals=["🥇","🥈","🥉"];return(<div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}><SCard style={{marginBottom:14,background:`linear-gradient(135deg,${S.accentDk},${S.purple})`,border:"none",textAlign:"center"}}><div style={{fontSize:34}}>🏆</div><div style={{color:S.text,fontWeight:800,fontSize:20}}>LEADERBOARD</div><div style={{color:S.muted,fontSize:12}}>{STAFF_ROLES[user.role]} · {user.project}</div></SCard>{sorted.length===0&&<SCard style={{textAlign:"center",padding:40}}><div style={{fontSize:48,marginBottom:8}}>👥</div><div style={{color:S.muted}}>No peers found.</div></SCard>}{sorted.map((u,i)=>{const isMe=u.id===user.id;const pts=u.monthPts||0;return(<div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",marginBottom:8,borderRadius:14,background:isMe?`${S.accent}18`:S.bgCard,border:`1px solid ${isMe?S.accent:S.border}`}}><div style={{width:30,textAlign:"center",fontWeight:900,color:i<3?"#f59e0b":S.muted,fontSize:i<3?20:14}}>{i<3?medals[i]:`#${i+1}`}</div><div style={{width:44,height:44,borderRadius:"50%",background:`${S.accent}22`,border:`1px solid ${S.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{ROLE_EMOJI[u.role]||"👤"}</div><div style={{flex:1}}><div style={{color:S.text,fontWeight:700,fontSize:14}}>{u.name}{isMe&&<span style={{color:S.accent,fontSize:11}}> · YOU</span>}</div><div style={{color:S.muted,fontSize:11}}>{u.project}</div></div><div style={{textAlign:"right"}}><div style={{color:S.accent,fontWeight:900,fontSize:19}}>{pts}</div><div style={{color:S.muted,fontSize:11}}>pts</div></div></div>);})}</div>);}

function StaffInnovation({user,innovations,onSubmit,onApprove,isSuperAdmin}){const [tab,setTab]=useState("my");const [form,setForm]=useState({category:"process_improvement",title:"",description:"",tool_used:""});const [submitting,setSubmitting]=useState(false);const myInnovations=(innovations||[]).filter(i=>i.staff_id===user.id);const pending=(innovations||[]).filter(i=>i.status==="pending");const isManager=user.role==="manager"||user.role==="training_manager"||isSuperAdmin;const inp={width:"100%",border:`1px solid ${S.border}`,borderRadius:8,padding:"9px 11px",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:S.bg,color:S.text};const submit=async()=>{if(!form.title.trim()||!form.description.trim())return;setSubmitting(true);const cat=INNOVATION_CATS[form.category];await onSubmit({...form,staff_id:user.id,status:"pending",points_awarded:cat.pts,week_reference:new Date().toISOString().split("T")[0]});setForm({category:"process_improvement",title:"",description:"",tool_used:""});setSubmitting(false);};const tabs=[{id:"my",label:"My Submissions",show:true},{id:"submit",label:"+ Submit",show:true},{id:"pending",label:`Pending (${pending.length})`,show:isManager}];return(<div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}><SCard style={{marginBottom:14,background:`linear-gradient(135deg,${S.accentDk},${S.purple})`,border:"none"}}><div style={{fontSize:32}}>🚀</div><div style={{color:S.text,fontWeight:800,fontSize:18}}>Innovation & AI Projects</div><div style={{color:S.muted,fontSize:12,marginTop:4}}>Submit projects to earn bonus points</div></SCard><div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto"}}>{tabs.filter(t=>t.show).map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 14px",borderRadius:9,border:`1px solid ${tab===t.id?S.accent:S.border}`,background:tab===t.id?`${S.accent}22`:S.bgCard,color:tab===t.id?S.accent:S.muted,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{t.label}</button>)}</div>{tab==="my"&&(<div>{myInnovations.length===0&&<SCard style={{textAlign:"center",padding:32}}><div style={{fontSize:40,marginBottom:8}}>💡</div><div style={{color:S.muted}}>No submissions yet.</div></SCard>}{myInnovations.map((inn,i)=>{const cat=INNOVATION_CATS[inn.category]||{};return(<SCard key={i} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}><div style={{display:"flex",gap:8,alignItems:"center"}}><div style={{fontSize:22}}>{cat.emoji||"💡"}</div><div><div style={{color:S.text,fontWeight:700}}>{inn.title}</div><div style={{color:S.muted,fontSize:11}}>{cat.label}</div></div></div><div style={{padding:"3px 10px",borderRadius:20,background:inn.status==="approved"?`${S.green}22`:inn.status==="rejected"?`${S.red}22`:`${S.yellow}22`,color:inn.status==="approved"?S.green:inn.status==="rejected"?S.red:S.yellow,fontSize:11,fontWeight:700}}>{inn.status.toUpperCase()}</div></div>{inn.status==="approved"&&<div style={{color:S.green,fontWeight:700,fontSize:13}}>+{inn.points_awarded} pts earned</div>}</SCard>);})}</div>)}{tab==="submit"&&(<SCard><div style={{color:S.muted,fontSize:11,letterSpacing:2,marginBottom:14}}>NEW SUBMISSION</div><div style={{marginBottom:12}}><div style={{color:S.muted,fontSize:11,marginBottom:5}}>CATEGORY</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{Object.entries(INNOVATION_CATS).filter(([k,v])=>!v.adminOnly||isSuperAdmin).map(([k,v])=>(<div key={k} onClick={()=>setForm(p=>({...p,category:k}))} style={{padding:10,borderRadius:9,border:`1.5px solid ${form.category===k?S.accent:S.border}`,background:form.category===k?`${S.accent}18`:S.bg,cursor:"pointer",textAlign:"center"}}><div style={{fontSize:20}}>{v.emoji}</div><div style={{color:S.text,fontSize:11,fontWeight:700,marginTop:3}}>{v.label}</div><div style={{color:S.accent,fontSize:10}}>+{v.pts} pts</div></div>))}</div></div><div style={{marginBottom:10}}><div style={{color:S.muted,fontSize:11,marginBottom:4}}>TITLE</div><input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={inp} placeholder="Project name"/></div><div style={{marginBottom:10}}><div style={{color:S.muted,fontSize:11,marginBottom:4}}>DESCRIPTION</div><textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={4} style={{...inp,resize:"vertical"}} placeholder="Describe what you did..."/></div>{(form.category==="ai_project"||form.category==="process_improvement")&&(<div style={{marginBottom:14}}><div style={{color:S.muted,fontSize:11,marginBottom:4}}>TOOL USED</div><input value={form.tool_used} onChange={e=>setForm(p=>({...p,tool_used:e.target.value}))} style={inp} placeholder="e.g. ChatGPT, Claude..."/></div>)}<SBtn onClick={submit} disabled={submitting||!form.title.trim()||!form.description.trim()} style={{width:"100%",padding:11}}>{submitting?"Submitting...":"SUBMIT"}</SBtn></SCard>)}{tab==="pending"&&isManager&&(<div>{pending.length===0&&<SCard style={{textAlign:"center",padding:32}}><div style={{fontSize:40,marginBottom:8}}>✅</div><div style={{color:S.muted}}>No pending.</div></SCard>}{pending.map((inn,i)=>{const cat=INNOVATION_CATS[inn.category]||{};const canApprove=inn.category==="ai_project"?isSuperAdmin:true;return(<SCard key={i} style={{marginBottom:12}}><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}><div style={{fontSize:22}}>{cat.emoji||"💡"}</div><div><div style={{color:S.text,fontWeight:700}}>{inn.title}</div><div style={{color:S.muted,fontSize:11}}>{cat.label} · +{inn.points_awarded} pts</div></div></div><div style={{color:S.muted,fontSize:12,marginBottom:8}}>{inn.description}</div>{!canApprove&&<div style={{color:S.yellow,fontSize:12,padding:"8px 12px",background:`${S.yellow}18`,borderRadius:8,marginBottom:8}}>⚠️ Only Super Admin can approve AI Projects</div>}{canApprove&&(<div style={{display:"flex",gap:8}}><SBtn onClick={()=>onApprove(inn.id,true,"")} color={S.green} style={{flex:1}}>✓ Approve</SBtn><SBtn onClick={()=>onApprove(inn.id,false,"Not meeting criteria")} color={S.red} style={{flex:1}}>✗ Reject</SBtn></div>)}</SCard>);})}</div>)}</div>);}

function StaffKudos({user,allStaff,kudos,onSendKudo,onApproveKudo,isManager}){const [tab,setTab]=useState("received");const [form,setForm]=useState({toId:"",type:"regular",reason:""});const [sending,setSending]=useState(false);const received=(kudos||[]).filter(k=>k.status==="approved");const pending=(kudos||[]).filter(k=>k.status==="pending");const peers=allStaff.filter(u=>u.active&&u.id!==user.id&&(user.role==="superadmin"||u.project===user.project));const inp={width:"100%",border:`1px solid ${S.border}`,borderRadius:8,padding:"9px 11px",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:S.bg,color:S.text};const send=async()=>{if(!form.toId||!form.reason.trim())return;setSending(true);await onSendKudo({recipient_id:form.toId,given_by:user.id,kudo_type:form.type,reason:form.reason,points_awarded:form.type==="gold"?5:1,status:"pending"});setForm({toId:"",type:"regular",reason:""});setSending(false);};const tabs=[{id:"received",label:"Received",show:true},{id:"send",label:"Send Kudo",show:true},{id:"pending",label:`Pending (${pending.length})`,show:isManager}];return(<div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}><SCard style={{marginBottom:14,background:`linear-gradient(135deg,${S.accentDk},${S.purple})`,border:"none"}}><div style={{fontSize:32}}>👏</div><div style={{color:S.text,fontWeight:800,fontSize:18}}>Kudos</div><div style={{display:"flex",gap:16,marginTop:10}}><div style={{textAlign:"center"}}><div style={{color:S.yellow,fontWeight:900,fontSize:20}}>{received.filter(k=>k.kudo_type==="gold").length}</div><div style={{color:S.muted,fontSize:10}}>GOLD</div></div><div style={{textAlign:"center"}}><div style={{color:S.accent,fontWeight:900,fontSize:20}}>{received.filter(k=>k.kudo_type==="regular").length}</div><div style={{color:S.muted,fontSize:10}}>REGULAR</div></div></div></SCard><div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto"}}>{tabs.filter(t=>t.show).map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 14px",borderRadius:9,border:`1px solid ${tab===t.id?S.accent:S.border}`,background:tab===t.id?`${S.accent}22`:S.bgCard,color:tab===t.id?S.accent:S.muted,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{t.label}</button>)}</div>{tab==="received"&&(<div>{received.length===0&&<SCard style={{textAlign:"center",padding:32}}><div style={{fontSize:40,marginBottom:8}}>👏</div><div style={{color:S.muted}}>No kudos yet.</div></SCard>}{received.map((k,i)=>(<SCard key={i} style={{marginBottom:10}}><div style={{display:"flex",gap:10,alignItems:"center"}}><div style={{fontSize:28}}>{k.kudo_type==="gold"?"🌟":"👏"}</div><div style={{flex:1}}><div style={{color:k.kudo_type==="gold"?S.yellow:S.accent,fontWeight:700}}>{k.kudo_type==="gold"?"Gold Kudo":"Kudo"} · +{k.points_awarded} pts</div><div style={{color:S.muted,fontSize:12,fontStyle:"italic",marginTop:2}}>"{k.reason}"</div></div></div></SCard>))}</div>)}{tab==="send"&&(<SCard><div style={{color:S.muted,fontSize:11,letterSpacing:2,marginBottom:14}}>SEND A KUDO</div><div style={{marginBottom:12}}><div style={{color:S.muted,fontSize:11,marginBottom:4}}>TO</div><select value={form.toId} onChange={e=>setForm(p=>({...p,toId:e.target.value}))} style={inp}><option value="">Select colleague</option>{peers.map(u=><option key={u.id} value={u.id}>{u.name} · {STAFF_ROLES[u.role]}</option>)}</select></div><div style={{marginBottom:12}}><div style={{display:"flex",gap:8}}><div onClick={()=>setForm(p=>({...p,type:"regular"}))} style={{flex:1,padding:10,borderRadius:9,border:`1.5px solid ${form.type==="regular"?S.accent:S.border}`,background:form.type==="regular"?`${S.accent}18`:S.bg,cursor:"pointer",textAlign:"center"}}><div style={{fontSize:22}}>👏</div><div style={{color:S.text,fontWeight:700,fontSize:12}}>Kudo (+1pt)</div></div><div onClick={()=>setForm(p=>({...p,type:"gold"}))} style={{flex:1,padding:10,borderRadius:9,border:`1.5px solid ${form.type==="gold"?S.yellow:S.border}`,background:form.type==="gold"?`${S.yellow}18`:S.bg,cursor:"pointer",textAlign:"center"}}><div style={{fontSize:22}}>🌟</div><div style={{color:S.text,fontWeight:700,fontSize:12}}>Gold (+5pts)</div></div></div></div><div style={{marginBottom:14}}><div style={{color:S.muted,fontSize:11,marginBottom:4}}>REASON</div><textarea value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} rows={3} style={{...inp,resize:"vertical"}} placeholder="Why do they deserve this?"/></div><SBtn onClick={send} disabled={sending||!form.toId||!form.reason.trim()} style={{width:"100%",padding:11}}>{sending?"Sending...":"SEND KUDO"}</SBtn></SCard>)}{tab==="pending"&&isManager&&(<div>{pending.length===0&&<SCard style={{textAlign:"center",padding:32}}><div style={{fontSize:40,marginBottom:8}}>✅</div><div style={{color:S.muted}}>No pending.</div></SCard>}{pending.map((k,i)=>(<SCard key={i} style={{marginBottom:10}}><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}><div style={{fontSize:24}}>{k.kudo_type==="gold"?"🌟":"👏"}</div><div><div style={{color:S.text,fontWeight:700}}>{k.kudo_type==="gold"?"Gold Kudo":"Kudo"}</div><div style={{color:S.muted,fontSize:11}}>+{k.points_awarded} pts</div></div></div><div style={{color:S.muted,fontSize:12,marginBottom:12,fontStyle:"italic"}}>"{k.reason}"</div><div style={{display:"flex",gap:8}}><SBtn onClick={()=>onApproveKudo(k.id,true)} color={S.green} style={{flex:1}} sm>✓ Approve</SBtn><SBtn onClick={()=>onApproveKudo(k.id,false)} color={S.red} style={{flex:1}} sm>✗ Reject</SBtn></div></SCard>))}</div>)}</div>);}

function StaffProfile({user,onUpdate,toast}){const [av,setAv]=useState(user.avatar||{base:"b1",hair:null,accessory:null,outfit:null,background:null});const [saving,setSaving]=useState(false);const saveAv=async()=>{setSaving(true);try{await staffDb.update(user.id,{avatar_accessories:av});onUpdate({...user,avatar:av});toast("Avatar saved!");}catch(e){toast("Error");}setSaving(false);};return(<div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}><SCard style={{marginBottom:14,textAlign:"center"}}><div style={{display:"flex",justifyContent:"center",marginBottom:12}}><Av av={av} sz={90}/></div><div style={{color:S.text,fontWeight:800,fontSize:18}}>{user.name}</div><div style={{color:S.accent,fontSize:13,marginTop:2}}>{STAFF_ROLES[user.role]}</div><div style={{color:S.muted,fontSize:12,marginTop:2}}>{user.project} · {user.gameId}</div></SCard><SCard><div style={{color:S.muted,fontSize:11,letterSpacing:2,marginBottom:12}}>CHOOSE YOUR AVATAR</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{BASES.map(b=>(<div key={b.id} onClick={()=>setAv(p=>({...p,base:b.id}))} style={{padding:13,borderRadius:12,border:`2px solid ${av.base===b.id?S.accent:S.border}`,background:av.base===b.id?`${S.accent}18`:S.bg,cursor:"pointer",textAlign:"center"}}><div style={{fontSize:36}}>{b.emoji}</div><div style={{color:S.text,fontWeight:700,fontSize:13,marginTop:5}}>{b.label}</div></div>))}</div><SBtn onClick={saveAv} disabled={saving} style={{width:"100%",padding:11,marginTop:12}}>{saving?"Saving...":"SAVE AVATAR"}</SBtn></SCard></div>);}

function StaffAdminPanel({cu,allStaff,toast,reloadStaff}){
  const [showExcel,setShowExcel]=useState(false);
  const inp={width:"100%",border:`1px solid ${S.border}`,borderRadius:8,padding:"9px 11px",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:S.bg,color:S.text};
  const blank={gameId:"",password:"",role:"team_coach",project:""};
  const [form,setForm]=useState(blank);const [filter,setFilter]=useState("active");
  const [resetId,setResetId]=useState(null);const [newPw,setNewPw]=useState("");const [loading,setLoading]=useState(false);
  const roleColor={team_coach:S.accent,quality_coach:S.green,training_coach:S.purple,manager:S.yellow,training_manager:"#f97316",superadmin:S.red};
  const createStaff=async()=>{if(!form.gameId.trim()||!form.password.trim()||!form.project.trim()){toast("Complete Game ID, password and project");return;}if(allStaff.find(s=>s.gameId===form.gameId.trim())){toast("Error: Game ID already exists");return;}setLoading(true);try{await staffDb.create({game_id:form.gameId.trim(),username:form.gameId.trim(),full_name:form.gameId.trim(),password_hash:form.password,role:form.role,project:form.project,is_active:true,level:1,coins:0});await reloadStaff();setForm(blank);toast(`${form.gameId} created`);}catch(e){toast("Error: "+e.message);}setLoading(false);};
  const toggleActive=async(u)=>{try{await staffDb.update(u.id,{is_active:!u.active});await reloadStaff();toast(u.active?"Deactivated":"Activated");}catch(e){toast("Error");}};
  const deleteStaff=async(u)=>{if(!window.confirm(`Delete ${u.gameId}? This cannot be undone.`))return;try{await sbFetch(`staff_profiles?id=eq.${u.id}`,{method:"DELETE"});await reloadStaff();toast(`${u.gameId} deleted`);}catch(e){toast("Error: "+e.message);}};
  const savePw=async(u)=>{if(!newPw.trim()||newPw.length<4){toast("Minimum 4 characters");return;}try{await staffDb.update(u.id,{password_hash:newPw.trim(),needs_pw_change:true,temp_pw:newPw.trim()});await reloadStaff();setResetId(null);setNewPw("");toast("Password set");}catch(e){toast("Error");}};
  const filtered=allStaff.filter(u=>filter==="active"?u.active:!u.active);
  return(
    <div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}>
      {showExcel&&<ExcelUpload onClose={()=>setShowExcel(false)}/>}
      <SCard style={{marginBottom:14,background:`linear-gradient(135deg,${S.accentDk},${S.purple})`,border:"none"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{fontSize:30}}>⚡</div><div><div style={{color:S.text,fontWeight:800,fontSize:17}}>SUPER ADMIN PANEL</div><div style={{color:S.muted,fontSize:12}}>{cu.name}</div></div></div>
          <SBtn onClick={()=>setShowExcel(true)} color={S.green} style={{flexShrink:0,fontSize:12}}>📊 Cargar Excel</SBtn>
        </div>
      </SCard>
      <SCard style={{marginBottom:14,border:`1px solid ${S.accent}44`}}>
        <div style={{color:S.accent,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>CREATE STAFF USER</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>GAME ID</div><input value={form.gameId} onChange={e=>setForm(p=>({...p,gameId:e.target.value}))} style={inp} placeholder="ej. TC-001 o CM.SANCHEZ"/></div>
          <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>PASSWORD</div><input value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} style={inp} placeholder="Initial password"/></div>
          <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>ROLE</div><select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} style={inp}>{Object.entries(STAFF_ROLES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
          <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>PROJECT</div><input value={form.project} onChange={e=>setForm(p=>({...p,project:e.target.value}))} style={inp} placeholder="Project name"/></div>
        </div>
        <SBtn onClick={createStaff} disabled={loading} style={{width:"100%",padding:11}}>{loading?"Creating...":"CREATE USER"}</SBtn>
      </SCard>
      <div style={{display:"flex",gap:0,marginBottom:14,borderRadius:10,overflow:"hidden",border:`1px solid ${S.border}`}}>
        {[{k:"active",label:"Active",count:allStaff.filter(u=>u.active).length,color:S.green},{k:"inactive",label:"Inactive",count:allStaff.filter(u=>!u.active).length,color:S.red}].map(t=>(
          <button key={t.k} onClick={()=>setFilter(t.k)} style={{flex:1,padding:"10px 8px",background:filter===t.k?`${t.color}22`:S.bgCard,border:"none",borderRight:t.k==="active"?`1px solid ${S.border}`:"none",cursor:"pointer",fontFamily:"inherit"}}>
            <div style={{fontWeight:900,fontSize:20,color:filter===t.k?t.color:S.muted}}>{t.count}</div>
            <div style={{fontSize:11,fontWeight:700,color:filter===t.k?t.color:S.muted}}>{t.label.toUpperCase()}</div>
          </button>
        ))}
      </div>
      {filtered.map(u=>(
        <SCard key={u.id} style={{marginBottom:10,opacity:u.active?1:0.6}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:40,height:40,borderRadius:"50%",background:`${roleColor[u.role]||S.accent}22`,border:`1px solid ${roleColor[u.role]||S.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{ROLE_EMOJI[u.role]||"👤"}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:S.text,fontWeight:700,fontSize:14}}>{u.name}</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:3}}>
                <STag color={roleColor[u.role]||S.accent}>{STAFF_ROLES[u.role]}</STag>
                <STag color={S.muted}>{u.project}</STag>
                <STag color={u.active?S.green:S.red}>{u.active?"ACTIVE":"INACTIVE"}</STag>
              </div>
            </div>
            {u.id!==cu.id&&(
              <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
                <SBtn onClick={()=>toggleActive(u)} color={u.active?S.red:S.green} sm>{u.active?"Deactivate":"Activate"}</SBtn>
                <SBtn onClick={()=>{setResetId(resetId===u.id?null:u.id);setNewPw("");}} color={S.yellow} sm>Password</SBtn>
                <SBtn onClick={()=>deleteStaff(u)} color={S.red} sm>Delete</SBtn>
              </div>
            )}
          </div>
          {resetId===u.id&&(
            <div style={{marginTop:12,padding:"12px 14px",background:`${S.yellow}18`,borderRadius:10,border:`1px solid ${S.yellow}44`,display:"flex",gap:8,alignItems:"flex-end"}}>
              <div style={{flex:1}}><div style={{color:S.yellow,fontSize:11,fontWeight:700,marginBottom:4}}>TEMP PASSWORD</div><input type="text" value={newPw} onChange={e=>setNewPw(e.target.value)} style={inp}/></div>
              <SBtn onClick={()=>savePw(u)} color={S.green} sm>Save</SBtn>
            </div>
          )}
        </SCard>
      ))}
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
function HeaderScorePills({weeklyMetrics,riddleAnswers,taskSubmissions,riddleCount,taskCount,user}){
  if(!user||!weeklyMetrics||weeklyMetrics.length===0)return null;
  const sc=calcScoreCoins(weeklyMetrics,riddleAnswers,taskSubmissions,user.kudos,user.gold_kudos,user.referrals);
  const maxScore=calcMaxScore(sc.weekCount,riddleCount,taskCount);
  const level=calcLevel(sc.score,maxScore);
  return(
    <div style={{display:"flex",gap:6,alignItems:"center"}}>
      <div style={{background:`${lc(level)}15`,border:`1px solid ${lc(level)}40`,borderRadius:8,padding:"3px 8px",textAlign:"center"}}>
        <div style={{color:lc(level),fontWeight:900,fontSize:12}}>L{level}</div>
      </div>
      <div style={{background:`${C.gold}15`,border:`1px solid ${C.gold}40`,borderRadius:8,padding:"3px 8px",display:"flex",alignItems:"center",gap:3}}>
        <span style={{fontSize:11}}>🪙</span>
        <span style={{color:C.gold,fontWeight:900,fontSize:12}}>{sc.coins}</span>
      </div>
    </div>
  );
}

function YuritoKudos({cu,allUsers,allStaff,toast,reloadUsers}){
  const [tab,setTab]=useState("agents");
  const [toId,setToId]=useState("");
  const [gold,setGold]=useState(false);
  const [reason,setReason]=useState("");
  const inp={width:"100%",border:`1px solid ${S.border}`,borderRadius:8,padding:"9px 11px",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:S.bg,color:S.text};
  const send=async()=>{
    if(!toId||!reason.trim()){toast("Complete all fields");return;}
    try{
      if(tab==="agents"){
        const target=allUsers.find(u=>u.id===toId);
        if(!target)return;
        const pts=gold?5:1;
        await db.createKudo({from_user_id:cu.id,to_user_id:target.id,reason,category:"general",points_given:pts});
        await db.updateUser(target.id,{kudos:(target.kudos||0)+(gold?0:1),gold_kudos:(target.gold_kudos||0)+(gold?1:0)});
        await db.createNotif({recipient_id:target.id,title:gold?"Gold Kudo! 🌟":"Kudo! 👏",message:`${cu.gameId} te reconoció: "${reason}"`,type:"kudos"});
        await reloadUsers();
      }else{
        const target=allStaff.find(u=>u.id===toId);
        if(!target)return;
        await staffDb.createKudo({recipient_id:target.id,given_by:cu.id,kudo_type:gold?"gold":"regular",reason,points_awarded:gold?5:1,status:"approved"});
      }
      setToId("");setReason("");setGold(false);
      toast("Kudo sent!");
    }catch(e){toast("Error sending kudo");}
  };
  return(
    <div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}>
      <SCard style={{marginBottom:14,background:`linear-gradient(135deg,${S.accentDk},${S.purple})`,border:"none"}}>
        <div style={{fontSize:28,marginBottom:4}}>👏</div>
        <div style={{color:S.text,fontWeight:800,fontSize:18}}>Send Kudos</div>
        <div style={{color:"#a5b4fc",fontSize:12,marginTop:2}}>Recognize agents and staff</div>
      </SCard>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[{id:"agents",label:"🏆 Agents"},{id:"staff",label:"⚡ Staff"}].map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);setToId("");}} style={{padding:"8px 16px",borderRadius:9,border:`1px solid ${tab===t.id?S.accent:S.border}`,background:tab===t.id?`${S.accent}22`:S.card,color:tab===t.id?"#a5b4fc":S.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{t.label}</button>
        ))}
      </div>
      <SCard>
        <div style={{color:S.accent,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:14}}>SEND KUDO TO {tab==="agents"?"AGENT":"STAFF"}</div>
        <div style={{marginBottom:10}}>
          <div style={{color:S.muted,fontSize:11,marginBottom:4}}>SELECT</div>
          <select value={toId} onChange={e=>setToId(e.target.value)} style={inp}>
            <option value="">Choose...</option>
            {tab==="agents"?allUsers.filter(u=>u.active&&u.role==="user").map(u=><option key={u.id} value={u.id}>{u.name} · {u.project}</option>):allStaff.filter(u=>u.active&&u.gameId!=="YURITO").map(u=><option key={u.id} value={u.id}>{u.gameId} · {u.role}</option>)}
          </select>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <div onClick={()=>setGold(false)} style={{flex:1,padding:10,borderRadius:9,border:`1.5px solid ${!gold?S.accent:S.border}`,background:!gold?`${S.accent}18`:S.bg,cursor:"pointer",textAlign:"center"}}><div style={{fontSize:22}}>👏</div><div style={{color:S.text,fontWeight:700,fontSize:12}}>Kudo (+1)</div></div>
          <div onClick={()=>setGold(true)} style={{flex:1,padding:10,borderRadius:9,border:`1.5px solid ${gold?S.yellow:S.border}`,background:gold?`${S.yellow}18`:S.bg,cursor:"pointer",textAlign:"center"}}><div style={{fontSize:22}}>🌟</div><div style={{color:S.text,fontWeight:700,fontSize:12}}>Gold (+5)</div></div>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{color:S.muted,fontSize:11,marginBottom:4}}>REASON</div>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} style={{...inp,resize:"vertical"}} placeholder="Why do they deserve this?"/>
        </div>
        <SBtn onClick={send} disabled={!toId||!reason.trim()} style={{width:"100%",padding:12}}>SEND KUDO</SBtn>
      </SCard>
    </div>
  );
}

export default function App(){
  const [users,setUsers]=useState([]);const [prizes,setPrizes]=useState([]);
  const [shop]=useState(DEFAULT_SHOP);const [notifs,setNotifs]=useState([]);
  const [loggedIn,setLoggedIn]=useState(null);const [screen,setScreen]=useState("dashboard");
  const [toastMsg,setToastMsg]=useState("");const [appLoading,setAppLoading]=useState(true);
  const [allStaff,setAllStaff]=useState([]);const [staffMetrics,setStaffMetrics]=useState([]);
  const [staffPoints,setStaffPoints]=useState(null);const [staffBadges,setStaffBadges]=useState([]);
  const [staffKudos,setStaffKudos]=useState([]);const [staffInnovations,setStaffInnovations]=useState([]);

  // Score/Coins data for current agent
  const [availableWeeks,setAvailableWeeks]=useState([]);
  const [selectedWeek,setSelectedWeek]=useState("");
  const [lastEvaluatedWeek,setLastEvaluatedWeek]=useState("");
  const [agentWeeklyMetrics,setAgentWeeklyMetrics]=useState([]);
  const [agentRiddleAnswers,setAgentRiddleAnswers]=useState([]);
  const [agentTaskSubmissions,setAgentTaskSubmissions]=useState([]);
  const [monthRiddleCount,setMonthRiddleCount]=useState(0);
  const [monthTaskCount,setMonthTaskCount]=useState(0);

  const loadInitialData=async()=>{
    try{const [usersData,prizesData]=await Promise.all([db.getUsers(),db.getPrizes()]);setUsers((usersData||[]).map(adaptProfile));setPrizes(prizesData||[]);}catch(e){console.error(e);}
    setAppLoading(false);
  };
  useEffect(()=>{loadInitialData();},[]);

  // Load agent-specific scoring data on login
  const loadAgentScoreData=async(agent)=>{
    if(!agent?.game_id)return;
    const safeGet=async(fn)=>{try{return await fn();}catch(e){return [];}};
    const [wm,ra,ts,riddles,tasks,allWeeksData]=await Promise.all([
      safeGet(()=>db.getWeeklyMetrics(agent.game_id)),
      safeGet(()=>db.getAgentRiddleAnswers(agent.game_id)),
      safeGet(()=>db.getAgentTaskSubmissions(agent.game_id)),
      safeGet(()=>db.getRiddlesMonth()),
      safeGet(()=>db.getTasksMonth()),
      safeGet(()=>db.getAllWeeks()),
    ]);
    const uniqueWeeks=[...new Set((allWeeksData||[]).map((r)=>r.week).filter(Boolean))].sort().reverse();
    const lastWeek=uniqueWeeks[0]||"";
    setAvailableWeeks(uniqueWeeks);
    setLastEvaluatedWeek(lastWeek);
    setSelectedWeek(lastWeek);
    setAgentWeeklyMetrics(wm||[]);
    setAgentRiddleAnswers(ra||[]);
    setAgentTaskSubmissions(ts||[]);
    const now=new Date();
    const thisMonth=(d)=>{const dt=new Date(d);return dt.getMonth()===now.getMonth()&&dt.getFullYear()===now.getFullYear();};
    setMonthRiddleCount((riddles||[]).filter(r=>r.created_at&&thisMonth(r.created_at)).length);
    setMonthTaskCount((tasks||[]).filter(t=>t.created_at&&thisMonth(t.created_at)).length);
  };

  const loadNotifs=async(uid)=>{try{const d=await db.getNotifs(uid);setNotifs(d||[]);}catch(e){}};
  useEffect(()=>{
    if(loggedIn?.appType==="agents"){
      loadNotifs(loggedIn.id);
      loadAgentScoreData(loggedIn);
      const i=setInterval(()=>loadNotifs(loggedIn.id),30000);
      return()=>clearInterval(i);
    }
  },[loggedIn?.id]);

  const loadStaffData=async(su)=>{
    try{
      const [metrics,pts,badges,kudos,innovations,allS]=await Promise.all([
        staffDb.getMetrics(su.role,su.id),staffDb.getPoints(su.id),
        staffDb.getBadges(su.id),staffDb.getKudos(su.id),
        staffDb.getInnovations(su.id),staffDb.getAll(),
      ]);
      setStaffMetrics(metrics||[]);setStaffPoints((pts||[])[0]||null);
      setStaffBadges(badges||[]);setStaffKudos(kudos||[]);
      setStaffInnovations(innovations||[]);
      setAllStaff((allS||[]).map(adaptStaffProfile));
    }catch(e){console.error(e);}
  };
  useEffect(()=>{if(loggedIn?.appType==="staff"){loadStaffData(loggedIn);}},[loggedIn?.id]);

  const reloadUsers=async()=>{const d=await db.getUsers();setUsers((d||[]).map(adaptProfile));};
  const reloadStaff=async()=>{const d=await staffDb.getAll();setAllStaff((d||[]).map(adaptStaffProfile));};
  const toast=msg=>setToastMsg(msg);
  const cu=users.find(u=>u.id===loggedIn?.id)||loggedIn;
  const syncUser=upd=>{setUsers(users.map(u=>u.id===upd.id?upd:u));setLoggedIn(upd);};
  const isAdmin=cu?.role==="admin"||cu?.role==="superadmin";
  const isSA=cu?.role==="superadmin";
  const unread=(notifs||[]).filter(n=>(n.recipient_id===cu?.id||n.toId===cu?.id)&&!n.is_read&&!n.read).length;
  const markNotifRead=async(id)=>{try{await db.markNotifRead(id);setNotifs(notifs.map(n=>n.id===id?{...n,is_read:true}:n));}catch(e){}};
  const markAllRead=async()=>{try{await db.markAllNotifsRead(cu.id);setNotifs(notifs.map(n=>n.recipient_id===cu.id?{...n,is_read:true}:n));}catch(e){}};

  // Score props - agents see only last evaluated week, SA sees selected week
  const agentMetricsFiltered=isSA?(selectedWeek?agentWeeklyMetrics.filter((w)=>w.week===selectedWeek):agentWeeklyMetrics):agentWeeklyMetrics.filter((w)=>w.week===lastEvaluatedWeek);
  const scoreProps={weeklyMetrics:agentMetricsFiltered,riddleAnswers:agentRiddleAnswers,taskSubmissions:agentTaskSubmissions,riddleCount:monthRiddleCount,taskCount:monthTaskCount};

  if(appLoading){return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,flexDirection:"column",gap:16}}><Logo sz={64}/><div style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:900,color:C.blue,letterSpacing:2}}>PERFORMANCE ARENA</div><div style={{color:C.muted,fontSize:14,marginTop:8}}>Loading...</div></div>);}

  if(!loggedIn){return<><style>{`*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Segoe UI",system-ui,sans-serif}input,select,textarea{font-family:inherit}@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style><UnifiedLogin onLoginAgent={u=>{setLoggedIn(u);setScreen("dashboard");}} onLoginStaff={u=>{setLoggedIn(u);setScreen("dashboard");}}/></>;}

  // ── STAFF APP ──
  if(loggedIn?.appType==="staff"){
    const isManager=cu?.role==="manager"||cu?.role==="training_manager"||cu?.role==="superadmin";
    const isSAorManager=cu?.role==="superadmin"||cu?.role==="manager";
    const isYurito=cu?.gameId==="YURITO";
    const staffNav=isYurito?[{id:"dashboard",icon:"🏠",label:"Home"},{id:"kudos",icon:"👏",label:"Kudos"}]:[
      {id:"dashboard",icon:"🏠",label:"Home"},
      {id:"leaderboard",icon:"🏆",label:"Rankings"},
      {id:"kudos",icon:"👏",label:"Kudos"},
      {id:"innovation",icon:"🚀",label:"Projects"},
      ...(["team_coach","manager","superadmin"].includes(cu?.role)?[{id:"sessions",icon:"🎯",label:"Sessions"}]:[]),
      ...(["team_coach","quality_coach","training_coach","manager","training_manager","superadmin"].includes(cu?.role)?[{id:"activities",icon:"⭐",label:"Actividades"}]:[]),
      {id:"store",icon:"🏪",label:"Tienda"},
      {id:"profile",icon:"🎨",label:"Profile"},
      ...(cu?.role==="superadmin"?[{id:"report",icon:"📊",label:"Reporte"},{id:"admin",icon:"⚙️",label:"Admin"}]:[])];
    const staffTitles={dashboard:"Dashboard",leaderboard:"Leaderboard",kudos:"Kudos",innovation:"Innovation & AI",sessions:"Coaching Sessions",activities:"Actividades & Puntos",store:"Staff Store",report:"Reporte de Puntos",profile:"Profile",admin:"Admin Panel"};
    return<>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Segoe UI",system-ui,sans-serif;background:${S.bg}}input,select,textarea{font-family:inherit}@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      {cu?.needsPwChange&&<TempPwModal user={cu} dark={true} onSave={async pw=>{await staffDb.update(cu.id,{password_hash:pw,needs_pw_change:false,temp_pw:null});setLoggedIn({...cu,needsPwChange:false,tempPw:null});toast("Password updated!");}}/>}
      <Toast msg={toastMsg} onClose={()=>setToastMsg("")}/>
      <div style={{position:"sticky",top:0,zIndex:100,background:S.bgCard,borderBottom:`1px solid ${S.border}`,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}><StaffLogo sz={32}/><div><div style={{fontSize:14,fontWeight:900,color:S.text,letterSpacing:1.5}}>STAFF</div><div style={{fontSize:14,fontWeight:900,color:S.accent,letterSpacing:1.5}}>ARENA</div></div></div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{textAlign:"right"}}><div style={{color:S.text,fontWeight:700,fontSize:13}}>{cu.name}</div><div style={{color:S.muted,fontSize:11}}>{staffTitles[screen]}</div></div>
          <button onClick={()=>{setLoggedIn(null);setScreen("dashboard");}} style={{background:S.border,border:"none",borderRadius:7,padding:"4px 10px",color:S.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Exit</button>
        </div>
      </div>
      <div style={{padding:"14px 14px 0"}}>
        {screen==="dashboard"&&((isYurito||isSAorManager)?<OperationsDashboard user={loggedIn}/>:<StaffDashboard user={cu} allStaff={allStaff} metrics={staffMetrics} points={staffPoints} badges={staffBadges} kudos={staffKudos}/>)}
        {screen==="leaderboard"&&<StaffLeaderboard user={cu} allStaff={allStaff}/>}
        {screen==="kudos"&&(isYurito?<YuritoKudos cu={cu} allUsers={users} allStaff={allStaff} toast={toast} reloadUsers={reloadUsers}/>:<StaffKudos user={cu} allStaff={allStaff} kudos={staffKudos} isManager={isManager}
          onSendKudo={async d=>{try{await staffDb.createKudo(d);const k=await staffDb.getKudos(cu.id);setStaffKudos(k||[]);toast("Kudo sent!");}catch(e){toast("Error");}}}
          onApproveKudo={async(id,approved)=>{try{await staffDb.updateKudo(id,{status:approved?"approved":"rejected",approved_by:cu.id,approved_at:new Date().toISOString()});const k=await staffDb.getKudos(cu.id);setStaffKudos(k||[]);toast(approved?"Approved!":"Rejected");}catch(e){toast("Error");}}}
        />)}
        {screen==="innovation"&&<StaffInnovation user={cu} innovations={staffInnovations} isSuperAdmin={cu?.role==="superadmin"}
          onSubmit={async d=>{try{await staffDb.createInnovation(d);const i=await staffDb.getInnovations(cu.id);setStaffInnovations(i||[]);toast("Submitted!");}catch(e){toast("Error");}}}
          onApprove={async(id,approved,notes)=>{try{await staffDb.updateInnovation(id,{status:approved?"approved":"rejected",reviewed_by:cu.id,review_notes:notes,reviewed_at:new Date().toISOString()});const i=await staffDb.getInnovations(cu.id);setStaffInnovations(i||[]);toast(approved?"Approved!":"Rejected");}catch(e){toast("Error");}}}
        />}
        {screen==="sessions"&&<CoachingSessions user={cu} staffProfile={allStaff.find(s=>s.id===cu?.id)||cu}/>}
        {screen==="activities"&&<StaffActivitiesPanel user={cu}/>}
        {screen==="store"&&<StaffStore user={cu} staffProfile={allStaff.find(s=>s.id===cu?.id)||cu} onCoinsUpdate={(coins)=>{setLoggedIn({...cu,coins});}}/>}
        {screen==="profile"&&<StaffProfile user={cu} onUpdate={u=>{setLoggedIn(u);}} toast={toast}/>}
        {screen==="report"&&cu?.role==="superadmin"&&<StaffPointsReport user={cu}/>}
        {screen==="admin"&&cu?.role==="superadmin"&&<StaffAdminPanel cu={cu} allStaff={allStaff} toast={toast} reloadStaff={reloadStaff}/>}
      </div>
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:S.bgCard,borderTop:`1px solid ${S.border}`,display:"flex",padding:"6px 0 10px",overflowX:"auto"}}>
        {staffNav.map(item=>{const active=screen===item.id;return(<button key={item.id} onClick={()=>setScreen(item.id)} style={{flex:"0 0 auto",minWidth:58,display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"none",border:"none",cursor:"pointer",padding:"5px 8px"}}><div style={{fontSize:17,filter:active?"none":"grayscale(60%)",transform:active?"scale(1.1)":"scale(1)",transition:"all 0.18s"}}>{item.icon}</div><div style={{fontSize:9,fontWeight:700,color:active?S.accent:S.muted,whiteSpace:"nowrap"}}>{item.label}</div>{active&&<div style={{width:16,height:3,borderRadius:2,background:S.accent}}/>}</button>);})}
      </div>
    </>;
  }

  // ── AGENTS APP ──
  const userNav=[{id:"dashboard",icon:"🏠",label:"Inicio"},{id:"riddle",icon:"🧠",label:"Riddle"},{id:"task",icon:"📋",label:"Task"},{id:"leaderboard",icon:"🏆",label:"Ranking"},{id:"rewards",icon:"🎁",label:"Tienda"},{id:"referrals",icon:"🤝",label:"Referidos"},{id:"info",icon:"📖",label:"Como"},{id:"notifs",icon:"🔔",label:"Avisos",badge:unread},{id:"profile",icon:"🎨",label:"Perfil"}];
  const adminNav=[{id:"dashboard",icon:"📊",label:"Inicio"},{id:"admin",icon:"⚙️",label:"Admin"},{id:"leaderboard",icon:"🏆",label:"Ranking"},{id:"rewards",icon:"🎁",label:"Tienda"},{id:"info",icon:"📖",label:"Como"},{id:"notifs",icon:"🔔",label:"Avisos",badge:unread},{id:"profile",icon:"🎨",label:"Perfil"}];
  const saNav=[{id:"dashboard",icon:"📊",label:"Inicio"},{id:"admin",icon:"⚙️",label:"Admin"},{id:"riddle",icon:"🧠",label:"Riddle"},{id:"task",icon:"📋",label:"Task"},{id:"leaderboard",icon:"🏆",label:"Ranking"},{id:"rewards",icon:"🎁",label:"Tienda"},{id:"report",icon:"📈",label:"Reporte"},{id:"info",icon:"📖",label:"Como"},{id:"notifs",icon:"🔔",label:"Avisos",badge:unread},{id:"profile",icon:"🎨",label:"Perfil"}];
  const nav=isSA?saNav:isAdmin?adminNav:userNav;
  const titles={dashboard:"Dashboard",riddle:"Riddle",task:"Task",leaderboard:"Leaderboard",rewards:"Tienda",info:"Como Funciona",notifs:"Notificaciones",profile:"Perfil",admin:"Panel Admin",referrals:"Referidos",report:"Reporte General"};

  return<>
    <style>{`*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Segoe UI",system-ui,sans-serif;background:${C.bg}}input,select,textarea{font-family:inherit}::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
    {cu?.needsPwChange&&<TempPwModal user={cu} onSave={async pw=>{await db.updateUser(cu.id,{password_hash:pw,needs_pw_change:false,temp_pw:null});syncUser({...cu,needsPwChange:false,tempPw:null});toast("Contrasena actualizada!");}}/>}
    <Toast msg={toastMsg} onClose={()=>setToastMsg("")}/>
    <div style={{position:"sticky",top:0,zIndex:100,background:C.card,borderBottom:`1.5px solid ${C.border}`,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:`0 2px 10px ${C.blue}12`}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}><Logo sz={34}/><div><div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:900,color:C.blue,letterSpacing:1.5,lineHeight:1}}>PERFORMANCE</div><div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:900,color:C.red,letterSpacing:1.5,lineHeight:1}}>ARENA</div></div></div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <Av av={cu?.avatar} sz={34} shop={shop}/>
        <button onClick={()=>{setLoggedIn(null);setScreen("dashboard");}} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,padding:"4px 10px",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Salir</button>
      </div>
    </div>
    <div style={{padding:"14px 14px 0",animation:"fadeIn 0.25s ease"}}>
      {screen==="dashboard"&&<Dashboard user={cu} allUsers={users} notifs={notifs} {...scoreProps} isSA={isSA} availableWeeks={availableWeeks} selectedWeek={selectedWeek} lastEvaluatedWeek={lastEvaluatedWeek} onWeekChange={setSelectedWeek}/>}
      {screen==="riddle"&&<RiddleTask gameId={cu.game_id||cu.username||""} isAdmin={isSA} defaultTab="riddle"/>}
      {screen==="task"&&<RiddleTask gameId={cu.game_id||cu.username||""} isAdmin={isSA} defaultTab="task"/>}
      {screen==="leaderboard"&&<Leaderboard user={cu} allUsers={users} shop={shop}/>}
      {screen==="rewards"&&<Rewards user={cu} prizes={prizes} {...scoreProps} onRedeem={async p=>{
        const sc=calcScoreCoins(agentWeeklyMetrics,agentRiddleAnswers,agentTaskSubmissions,cu.kudos,cu.gold_kudos,cu.referrals);
        const cost=p.points_cost||p.pts||0;
        const stock=p.stock||p.stock_remaining||0;
        if(stock<=0){toast("Sin stock");return;}
        if(sc.coins<cost){toast(`Necesitas ${cost} 🪙 coins, tienes ${sc.coins}`);return;}
        try{
          await db.createRedemption({user_id:cu.id,reward_id:p.id,points_spent:cost,status:"pending"});
          await db.updatePrize(p.id,{stock:stock-1});
          // Deduct coins from profile
          const newCoins=Math.max(0,(cu.coins||0)-cost);
          await db.updateUser(cu.id,{coins:newCoins});
          const updated=await db.getPrizes();setPrizes(updated||[]);
          syncUser({...cu,coins:newCoins});
          toast(`${p.name} canjeado! -${cost} 🪙`);
        }catch(e){toast("Error al canjear");}
      }}/>}
      {screen==="referrals"&&<ReferralsPanel isAdmin={false}/>}
      {screen==="report"&&isSA&&<GeneralReport/>}
      {screen==="info"&&<Info/>}
      {screen==="notifs"&&<Notifs user={cu} notifs={notifs} onMarkRead={markNotifRead} onMarkAll={markAllRead}/>}
      {screen==="profile"&&<Profile user={cu} onUpdate={syncUser} toast={toast} shop={shop} {...scoreProps}/>}
      {screen==="admin"&&<AdminPanel cu={cu} allUsers={users} setAllUsers={setUsers} prizes={prizes} setPrizes={setPrizes} shop={shop} notifs={notifs} setNotifs={setNotifs} toast={toast} reloadUsers={reloadUsers} riddleCount={monthRiddleCount} taskCount={monthTaskCount}/>}
    </div>
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:C.card,borderTop:`1.5px solid ${C.border}`,display:"flex",padding:"6px 0 10px",boxShadow:`0 -2px 10px ${C.blue}10`,overflowX:"auto"}}>
      {nav.map(item=>{const active=screen===item.id;return(<button key={item.id} onClick={()=>setScreen(item.id)} style={{flex:"0 0 auto",minWidth:58,display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"none",border:"none",cursor:"pointer",padding:"5px 8px",position:"relative"}}>{item.badge>0&&<div style={{position:"absolute",top:0,right:8,width:16,height:16,borderRadius:"50%",background:C.red,color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{item.badge}</div>}<div style={{fontSize:17,filter:active?"none":"grayscale(55%)",transform:active?"scale(1.1)":"scale(1)",transition:"all 0.18s"}}>{item.icon}</div><div style={{fontSize:9,fontWeight:700,color:active?C.blue:C.muted,transition:"color 0.18s",whiteSpace:"nowrap"}}>{item.label}</div>{active&&<div style={{width:16,height:3,borderRadius:2,background:C.blue}}/>}</button>);})}
    </div>
  </>;
}
