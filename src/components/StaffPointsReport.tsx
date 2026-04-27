// @ts-nocheck
import { useState, useEffect } from "react";

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";

async function sbFetch(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    });
    const t = await res.text();
    return t ? JSON.parse(t) : [];
  } catch { return []; }
}

const S = {
  bg:"#0f1117", card:"#1a1d27", border:"#2a2d3e", text:"#e8eaf6",
  muted:"#64748b", accent:"#6366f1", green:"#22c55e", red:"#ef4444",
  yellow:"#f59e0b", purple:"#a855f7", gold:"#f59e0b",
};

const SOURCE_META: Record<string, {label:string,color:string,emoji:string}> = {
  coaching_session: { label:"Coaching Session",  color:S.accent,  emoji:"🎯" },
  auto_kpi:         { label:"KPI Automático",    color:S.green,   emoji:"📊" },
  manual_bonus:     { label:"Bono Manual",       color:S.yellow,  emoji:"💰" },
  innovation:       { label:"Innovation/AI",     color:S.purple,  emoji:"🚀" },
  store_purchase:   { label:"Compra Tienda",     color:S.red,     emoji:"🛒" },
};

const SCard = ({children,style={}}:any) =>
  <div style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:14,padding:16,...style}}>{children}</div>;

export default function StaffPointsReport({ user }) {
  const [log, setLog]           = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [staff, setStaff]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<"points"|"sessions"|"summary">("summary");
  const [filterGameId, setFilter] = useState("all");
  const [filterSource, setFilterSrc] = useState("all");

  useEffect(()=>{ load(); },[]);

  const load = async () => {
    setLoading(true);
    const [l, s, st] = await Promise.all([
      sbFetch("staff_points_log?order=created_at.desc&limit=500"),
      sbFetch("coaching_sessions?order=created_at.desc&limit=500"),
      sbFetch("staff_profiles?select=game_id,full_name,role,project,coins&order=full_name.asc"),
    ]);
    setLog(l||[]);
    setSessions(s||[]);
    setStaff(st||[]);
    setLoading(false);
  };

  // Filtered log
  const filteredLog = log.filter(p =>
    (filterGameId==="all" || p.staff_game_id===filterGameId) &&
    (filterSource==="all" || p.source===filterSource)
  );

  // Summary per staff member
  const summary = staff.map(s => {
    const entries = log.filter(l => l.staff_game_id === s.game_id);
    const earned  = entries.filter(e => e.points > 0 && e.status==="approved").reduce((t,e) => t+(e.points||0), 0);
    const spent   = entries.filter(e => e.points < 0).reduce((t,e) => t+Math.abs(e.points||0), 0);
    const sessions_done = sessions.filter(cs => cs.coach_game_id===s.game_id && cs.status==="completed").length;
    return { ...s, earned, spent, sessions_done, balance: s.coins||0 };
  }).sort((a,b) => b.earned - a.earned);

  // Coaching sessions stats
  const completedSessions = sessions.filter(s=>s.status==="completed");
  const pendingSessions   = sessions.filter(s=>s.status==="pending"||s.status==="agent_responded"||s.status==="manager_responded");

  const ROLE_LABEL: Record<string,string> = {
    team_coach:"Team Coach", quality_coach:"QA Coach", training_coach:"Trainer",
    manager:"Manager", training_manager:"Training Manager", superadmin:"Super Admin",
  };

  const inpSm = { border:`1px solid ${S.border}`, borderRadius:7, padding:"6px 10px", fontSize:12, outline:"none", fontFamily:"inherit", background:S.bg, color:S.text };

  return (
    <div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}>
      {/* Header */}
      <SCard style={{marginBottom:14,background:"linear-gradient(135deg,#1e1b4b,#312e81)",border:"none"}}>
        <div style={{fontSize:28,marginBottom:4}}>📊</div>
        <div style={{color:S.text,fontWeight:800,fontSize:18}}>Reporte de Puntos — Staff</div>
        <div style={{color:"#a5b4fc",fontSize:12,marginTop:2}}>Quién ganó qué, cuándo y por qué</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:12}}>
          {[
            {n:log.filter(l=>l.points>0&&l.status==="approved").reduce((t,l)=>t+l.points,0), l:"Total pts otorgados",  c:S.green},
            {n:completedSessions.length,  l:"Sesiones completadas", c:S.accent},
            {n:pendingSessions.length,    l:"Sesiones pendientes",  c:S.yellow},
          ].map(x=>(
            <div key={x.l} style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"10px 6px",textAlign:"center"}}>
              <div style={{color:x.c,fontWeight:900,fontSize:20}}>{x.n}</div>
              <div style={{color:"rgba(255,255,255,0.5)",fontSize:9,marginTop:2}}>{x.l}</div>
            </div>
          ))}
        </div>
      </SCard>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto"}}>
        {[
          {id:"summary",  label:"👥 Resumen por Staff"},
          {id:"points",   label:"📋 Log de Puntos"},
          {id:"sessions", label:`🎯 Coaching Sessions`},
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id as any)} style={{padding:"8px 14px",borderRadius:9,border:`1px solid ${tab===t.id?S.accent:S.border}`,background:tab===t.id?`${S.accent}22`:S.card,color:tab===t.id?"#a5b4fc":S.muted,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{t.label}</button>
        ))}
      </div>

      {loading&&<div style={{textAlign:"center",color:S.muted,padding:40}}>Cargando reporte...</div>}

      {/* SUMMARY */}
      {!loading&&tab==="summary"&&(
        <div>
          <p style={{color:S.muted,fontSize:12,margin:"0 0 12px"}}>Ordenado por puntos ganados — todos los tiempos</p>
          {summary.filter(s=>s.role!=="superadmin").map((s,i)=>{
            const medals=["🥇","🥈","🥉"];
            return(
              <SCard key={s.game_id} style={{marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:28,textAlign:"center",fontWeight:900,fontSize:i<3?18:12,color:i<3?"#f59e0b":S.muted,flexShrink:0}}>
                    {i<3?medals[i]:`#${i+1}`}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:S.text,fontWeight:700,fontSize:14}}>{s.game_id}</div>
                    <div style={{color:S.muted,fontSize:11}}>{ROLE_LABEL[s.role]||s.role} · {s.project}</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,textAlign:"center",flexShrink:0}}>
                    <div>
                      <div style={{color:S.green,fontWeight:900,fontSize:15}}>+{s.earned}</div>
                      <div style={{color:S.muted,fontSize:9}}>Ganados</div>
                    </div>
                    <div>
                      <div style={{color:S.red,fontWeight:900,fontSize:15}}>-{s.spent}</div>
                      <div style={{color:S.muted,fontSize:9}}>Gastados</div>
                    </div>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:2,justifyContent:"center"}}>
                        <span style={{fontSize:12}}>🪙</span>
                        <span style={{color:S.gold,fontWeight:900,fontSize:15}}>{s.balance}</span>
                      </div>
                      <div style={{color:S.muted,fontSize:9}}>Balance</div>
                    </div>
                  </div>
                </div>
                {s.sessions_done>0&&(
                  <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${S.border}`,display:"flex",gap:8}}>
                    <span style={{background:`${S.accent}22`,color:S.accent,padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700}}>🎯 {s.sessions_done} sesiones completadas</span>
                  </div>
                )}
              </SCard>
            );
          })}
        </div>
      )}

      {/* POINTS LOG */}
      {!loading&&tab==="points"&&(
        <div>
          {/* Filters */}
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <select value={filterGameId} onChange={e=>setFilter(e.target.value)} style={inpSm}>
              <option value="all">Todos los staff</option>
              {staff.map(s=><option key={s.game_id} value={s.game_id}>{s.game_id}</option>)}
            </select>
            <select value={filterSource} onChange={e=>setFilterSrc(e.target.value)} style={inpSm}>
              <option value="all">Todas las fuentes</option>
              {Object.entries(SOURCE_META).map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
          </div>
          <p style={{color:S.muted,fontSize:12,margin:"0 0 10px"}}>{filteredLog.length} registros</p>
          {filteredLog.length===0&&(
            <SCard style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:48,marginBottom:8}}>📋</div>
              <div style={{color:S.muted}}>Sin registros con estos filtros.</div>
            </SCard>
          )}
          {filteredLog.map((p,i)=>{
            const meta = SOURCE_META[p.source] || { label:p.source, color:S.muted, emoji:"•" };
            return(
              <SCard key={p.id||i} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{fontSize:14}}>{meta.emoji}</span>
                      <span style={{color:S.text,fontWeight:700,fontSize:13}}>{p.staff_game_id}</span>
                      <span style={{padding:"1px 6px",borderRadius:4,background:`${meta.color}22`,color:meta.color,fontSize:9,fontWeight:700}}>{meta.label}</span>
                    </div>
                    <div style={{color:S.muted,fontSize:11,lineHeight:1.5}}>
                      {p.description}
                      {p.week&&<span> · {p.week}</span>}
                    </div>
                    <div style={{color:S.muted,fontSize:10,marginTop:2}}>
                      {new Date(p.created_at).toLocaleString("es-MX")}
                      {p.granted_by&&<span> · Por: {p.granted_by}</span>}
                    </div>
                  </div>
                  <div style={{color:p.points>0?S.green:S.red,fontWeight:900,fontSize:18,flexShrink:0,marginLeft:8}}>
                    {p.points>0?"+":""}{p.points} 🪙
                  </div>
                </div>
              </SCard>
            );
          })}
        </div>
      )}

      {/* COACHING SESSIONS */}
      {!loading&&tab==="sessions"&&(
        <div>
          {/* Stats row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[
              {n:sessions.length,           l:"Total",       c:S.text},
              {n:completedSessions.length,  l:"Completadas", c:S.green},
              {n:pendingSessions.length,    l:"Pendientes",  c:S.yellow},
              {n:sessions.filter(s=>s.status==="cancelled").length, l:"Canceladas", c:S.red},
            ].map(x=>(
              <SCard key={x.l} style={{textAlign:"center",padding:"10px 6px"}}>
                <div style={{color:x.c,fontWeight:900,fontSize:20}}>{x.n}</div>
                <div style={{color:S.muted,fontSize:10,marginTop:2}}>{x.l}</div>
              </SCard>
            ))}
          </div>

          {sessions.length===0&&(
            <SCard style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:48,marginBottom:8}}>🎯</div>
              <div style={{color:S.muted}}>No hay coaching sessions registradas aún.</div>
            </SCard>
          )}

          {sessions.map((s,i)=>{
            const statusMeta: Record<string,any> = {
              pending:           {c:S.yellow,  e:"⏳", l:"Pendiente"},
              agent_responded:   {c:S.accent,  e:"👤", l:"Agente respondió"},
              manager_responded: {c:S.purple,  e:"👔", l:"Manager verificó"},
              completed:         {c:S.green,   e:"✅", l:"Completada"},
              cancelled:         {c:S.red,     e:"❌", l:"Cancelada"},
            };
            const sm = statusMeta[s.status]||statusMeta.pending;
            return(
              <SCard key={s.id||i} style={{marginBottom:10,borderLeft:`3px solid ${sm.c}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:14}}>{sm.e}</span>
                      <span style={{color:S.text,fontWeight:700,fontSize:13}}>Coach: {s.coach_game_id}</span>
                    </div>
                    <div style={{color:S.muted,fontSize:11,marginTop:2}}>
                      Agente: {s.agent_game_id} · Manager: {s.manager_game_id||"—"} · {s.week}
                    </div>
                    <div style={{color:S.muted,fontSize:10,marginTop:2}}>{new Date(s.created_at).toLocaleString("es-MX")}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    {s.status==="completed"
                      ?<div style={{color:S.green,fontWeight:900,fontSize:15}}>+{s.points_awarded} 🪙</div>
                      :<span style={{padding:"2px 8px",borderRadius:4,background:`${sm.c}22`,color:sm.c,fontSize:10,fontWeight:700}}>{sm.l}</span>
                    }
                  </div>
                </div>
                {/* Responses */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {s.agent_q1!==null&&(
                    <>
                      <span style={{background:s.agent_q1?`${S.green}18`:`${S.red}18`,color:s.agent_q1?S.green:S.red,padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:700}}>
                        {s.agent_q1?"✓":"✗"} Agente P1
                      </span>
                      <span style={{background:s.agent_q2?`${S.green}18`:`${S.red}18`,color:s.agent_q2?S.green:S.red,padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:700}}>
                        {s.agent_q2?"✓":"✗"} Agente P2
                      </span>
                    </>
                  )}
                  {s.manager_confirmed!==null&&(
                    <span style={{background:s.manager_confirmed?`${S.green}18`:`${S.red}18`,color:s.manager_confirmed?S.green:S.red,padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:700}}>
                      {s.manager_confirmed?"✓":"✗"} Manager
                    </span>
                  )}
                </div>
                {s.notes&&<div style={{color:S.muted,fontSize:11,marginTop:6,fontStyle:"italic"}}>"{s.notes}"</div>}
              </SCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
