// @ts-nocheck
// CoachingSessions.tsx — v3 (fixes: manager notif, coach coins, + SA breakdown view)
// FIX 1: Manager recibe coaching_verify al responder agente (ya existía; ahora con sender_id)
// FIX 2: Coins del coach se leen fresh de staff_profiles en cada load (no del prop estático)
// FIX 3: PointsBreakdownView — Super Admin busca cualquier game_id y ve desglose completo
import { useState, useEffect } from "react";

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";

const POINTS_PER_SESSION = 10;

async function sbFetch(path, opts: any = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...opts.headers,
    },
    ...opts,
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const db = {
  getSessions: (coachId) => sbFetch(`coaching_sessions?coach_game_id=eq.${encodeURIComponent(coachId)}&order=created_at.desc`),
  getSessionsForManager: (managerGameId) => sbFetch(`coaching_sessions?manager_game_id=eq.${encodeURIComponent(managerGameId)}&order=created_at.desc`),
  getSessionsForAgent: (agentGameId) => sbFetch(`coaching_sessions?agent_game_id=eq.${encodeURIComponent(agentGameId)}&status=eq.pending&order=created_at.desc`),
  getAllSessions: () => sbFetch(`coaching_sessions?order=created_at.desc&limit=500`),
  createSession: (d) => sbFetch("coaching_sessions", { method: "POST", body: JSON.stringify(d) }),
  updateSession: (id, d) => sbFetch(`coaching_sessions?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d) }),
  getCoachAgents: (coachGameId) => sbFetch(`weekly_metrics?coach=eq.${encodeURIComponent(coachGameId)}&select=game_id,week&order=week.desc`),
  getWeeks: () => sbFetch(`weekly_metrics?select=week&order=week.desc&limit=200`),
  getManagerForProject: (project) => sbFetch(`staff_profiles?project=eq.${encodeURIComponent(project)}&role=in.(manager,training_manager)&select=game_id,full_name,id&limit=1`),
  // FIX 2: duplicate guard on points
  addPoints: async (d) => {
    const existing = await sbFetch(`staff_points_log?staff_game_id=eq.${encodeURIComponent(d.staff_game_id)}&reference_id=eq.${encodeURIComponent(d.reference_id)}&source=eq.coaching_session`).catch(() => null);
    if (existing && existing.length > 0) return;
    return sbFetch("staff_points_log", { method: "POST", body: JSON.stringify(d) });
  },
  getPointsLog: (gameId) => sbFetch(`staff_points_log?staff_game_id=eq.${encodeURIComponent(gameId)}&order=created_at.desc`),
  // FIX 2: always read coins fresh from DB (not from stale prop)
  updateStaffCoins: (gameId, coins) => sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(gameId)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ coins }) }),
  getStaffByGameId: (gameId) => sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(gameId)}&select=*`),
  createNotif: (d) => sbFetch("notifications", { method: "POST", prefer: "return=minimal", body: JSON.stringify(d) }),
  getAgentByGameId: (gameId) => sbFetch(`profiles?game_id=eq.${encodeURIComponent(gameId)}&select=id,full_name,game_id`),
  // FIX 3: breakdown queries
  getAgentBreakdown: (gameId) => sbFetch(`weekly_metrics?game_id=eq.${encodeURIComponent(gameId)}&select=*&order=week.asc`),
  getAgentProfile: (gameId) => sbFetch(`profiles?game_id=eq.${encodeURIComponent(gameId)}&select=*`),
  getAgentRiddles: (gameId) => sbFetch(`agent_riddle_answers?game_id=eq.${encodeURIComponent(gameId)}&select=*`),
  getAgentTasks: (gameId) => sbFetch(`agent_task_submissions?game_id=eq.${encodeURIComponent(gameId)}&select=*`),
  getAgentKudos: (gameId) => sbFetch(`profiles?game_id=eq.${encodeURIComponent(gameId)}&select=kudos,gold_kudos,referrals`),
  getStaffPointsLog: (gameId) => sbFetch(`staff_points_log?staff_game_id=eq.${encodeURIComponent(gameId)}&order=created_at.desc&limit=200`),
};

// ─── Core: award points only once when BOTH agent + manager confirm ───────────
async function tryAwardPoints(session: any, grantedBy: string) {
  const agentOk = session.agent_q1 === true && session.agent_q2 === true;
  const managerOk = session.manager_confirmed === true;
  if (!agentOk || !managerOk) return false;
  // Award points before marking session paid — if addPoints fails, session stays unpaid and can be retried.
  // addPoints has a reference_id duplicate guard so re-runs are safe.
  await db.addPoints({
    staff_game_id: session.coach_game_id,
    points: POINTS_PER_SESSION,
    source: "coaching_session",
    description: `Coaching session — agente ${session.agent_game_id} (${session.week})`,
    week: session.week,
    status: "approved",
    granted_by: grantedBy,
    reference_id: session.id,
    created_at: new Date().toISOString(),
  });
  // FIX 2: read current coins fresh, then add
  const coachStaff = await db.getStaffByGameId(session.coach_game_id);
  if (coachStaff && coachStaff[0]) {
    const cur = coachStaff[0].coins || 0;
    await db.updateStaffCoins(session.coach_game_id, cur + POINTS_PER_SESSION);
  }
  await db.updateSession(session.id, { points_paid: true, status: "completed" });
  return true;
}

const S = {
  bg:"#0f1117", card:"#1a1d27", border:"#2a2d3e", text:"#e8eaf6",
  muted:"#8b8fa8", accent:"#6366f1", green:"#22c55e", red:"#ef4444",
  yellow:"#f59e0b", purple:"#a855f7",
};

const SCard = ({children,style={},onClick}:any) =>
  <div onClick={onClick} style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:14,padding:16,...style,cursor:onClick?"pointer":undefined}}>{children}</div>;
const SBtn = ({children,onClick,color=S.accent,disabled=false,style={},sm=false}:any) =>
  <button onClick={onClick} disabled={disabled} style={{background:disabled?S.border:color,color:"#fff",border:"none",borderRadius:sm?6:9,padding:sm?"5px 12px":"10px 18px",fontWeight:700,fontSize:sm?11:13,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",transition:"all 0.15s",...style}}>{children}</button>;
const STag = ({children,color=S.accent}:any) =>
  <span style={{padding:"2px 8px",borderRadius:5,background:`${color}22`,color,fontSize:10,fontWeight:700,letterSpacing:0.5}}>{children}</span>;

const STATUS_META: Record<string, {label:string,color:string,emoji:string}> = {
  pending:           { label:"Pendiente — esperando respuestas", color:S.yellow,  emoji:"⏳" },
  agent_responded:   { label:"Agente respondió — esperando manager", color:S.accent, emoji:"👤" },
  manager_responded: { label:"Manager verificó — procesando puntos", color:S.purple, emoji:"👔" },
  completed:         { label:"Completada — puntos otorgados",  color:S.green,  emoji:"✅" },
  cancelled:         { label:"Cancelada",                      color:S.red,    emoji:"❌" },
};

// ─── COACH VIEW ───────────────────────────────────────────────────────────────
function CoachView({ user, staffProfile }) {
  const [sessions, setSessions]   = useState<any[]>([]);
  const [agents, setAgents]       = useState<string[]>([]);
  const [tab, setTab]             = useState<"list"|"new">("list");
  const [form, setForm]           = useState({ agentGameId: "", week: "", notes: "" });
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]         = useState("");
  const [pointsLog, setPointsLog] = useState<any[]>([]);
  // FIX 2: store fresh coins read from DB, not from stale prop
  const [freshCoins, setFreshCoins] = useState<number|null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(()=>setToast(""),3000); };

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [sess, metrics, log, freshProfile] = await Promise.all([
        db.getSessions(user.gameId),
        db.getCoachAgents(user.gameId),
        db.getPointsLog(user.gameId),
        // FIX 2: always fetch current coins from DB
        db.getStaffByGameId(user.gameId).catch(() => null),
      ]);
      setSessions(sess || []);
      setPointsLog(log || []);
      if (freshProfile && freshProfile[0]) {
        setFreshCoins(freshProfile[0].coins || 0);
      }
      const uniqueAgents = [...new Set((metrics||[]).map((m:any) => m.game_id))] as string[];
      setAgents(uniqueAgents);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const submitSession = async () => {
    if (!form.agentGameId) { showToast("Selecciona un agente"); return; }
    const dupe = sessions.find(s => s.agent_game_id === form.agentGameId && s.week === form.week && s.status !== "cancelled" && form.week);
    if (dupe) { showToast("Ya existe una sesión con ese agente esta semana"); return; }
    setSubmitting(true);
    try {
      let managerGameId = "";
      let managerStaffId = "";
      try {
        const mgrs = await db.getManagerForProject(staffProfile.project);
        if (mgrs && mgrs.length > 0) {
          managerGameId = mgrs[0].game_id;
          managerStaffId = mgrs[0].id;
        }
      } catch(e) {}

      const session = await db.createSession({
        coach_game_id: user.gameId,
        agent_game_id: form.agentGameId,
        manager_game_id: managerGameId,
        week: form.week,
        notes: form.notes,
        status: "pending",
        points_awarded: 10,
      });

      // Notify agent
      try {
        const agents = await db.getAgentByGameId(form.agentGameId);
        if (agents && agents[0]) {
          await db.createNotif({
            recipient_id: agents[0].id,
            sender_id: user.id,
            title: "📋 Evaluación de Coaching Session",
            message: `Tu coach ${user.gameId} registró una sesión contigo (${form.week||"reciente"}). Por favor responde 2 preguntas en la campana 🔔 de tu app.`,
            type: "coaching_session",
            is_read: false,
          });
        }
      } catch(e) { console.error("[CoachingSessions] createNotif agent error:", e); }

      // FIX 1: Notify manager — use staff UUID from the query above (not a second lookup)
      if (managerGameId) {
        try {
          // Use managerStaffId if we got it from the query, else fallback lookup
          let mgId = managerStaffId;
          if (!mgId) {
            const mgStaff = await db.getStaffByGameId(managerGameId);
            mgId = mgStaff?.[0]?.id;
          }
          if (mgId) {
            await db.createNotif({
              recipient_id: mgId,
              sender_id: user.id,
              title: "👔 Verificación de Coaching Session",
              message: `Coach ${user.gameId} registró sesión con agente ${form.agentGameId} (${form.week||"reciente"}). Pendiente tu verificación en Avisos 🔔.`,
              type: "coaching_verify",
              is_read: false,
            });
          }
        } catch(e) { console.error("[CoachingSessions] manager notif error:", e); }
      }

      showToast("Sesión registrada. Notificaciones enviadas.");
      setForm({ agentGameId:"", week:"", notes:"" });
      setTab("list");
      await load();
    } catch(e) { showToast("Error al registrar sesión"); }
    setSubmitting(false);
  };

  // FIX 2: prefer freshCoins (DB read) over stale staffProfile prop
  const totalCoins = freshCoins !== null ? freshCoins : (staffProfile?.coins || 0);
  const totalPending = sessions.filter(s => s.status === "pending" || s.status === "agent_responded").length;
  const totalCompleted = sessions.filter(s => s.status === "completed").length;
  const totalPoints = pointsLog.filter(p => p.status === "approved").reduce((s:number, p:any) => s + (p.points||0), 0);

  const inp = { width:"100%", border:`1px solid ${S.border}`, borderRadius:8, padding:"9px 11px", fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box" as any, background:S.bg, color:S.text };

  return (
    <div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}>
      {toast && <div style={{position:"fixed",top:56,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:toast.includes("Error")?S.red:S.green,color:"#fff",padding:"10px 22px",borderRadius:12,fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>{toast}</div>}

      <SCard style={{marginBottom:12,background:`linear-gradient(135deg,#1e1b4b,#312e81)`,border:"none"}}>
        <div style={{fontSize:28,marginBottom:4}}>🎯</div>
        <div style={{color:S.text,fontWeight:800,fontSize:18}}>Coaching Sessions</div>
        <div style={{color:"#a5b4fc",fontSize:12,marginTop:2}}>Registra y gestiona tus sesiones · {user.gameId}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginTop:12}}>
          {[
            {n:totalCompleted,  l:"Completadas", c:S.green},
            {n:totalPending,    l:"Pendientes",  c:S.yellow},
            {n:totalPoints,     l:"Pts ganados", c:"#f59e0b"},
            {n:totalCoins,      l:"🪙 Coins",    c:S.accent},
          ].map(x=>(
            <div key={x.l} style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"10px 6px",textAlign:"center"}}>
              <div style={{color:x.c,fontWeight:900,fontSize:18}}>{x.n}</div>
              <div style={{color:"rgba(255,255,255,0.5)",fontSize:9,marginTop:2}}>{x.l}</div>
            </div>
          ))}
        </div>
      </SCard>

      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[{id:"list",label:`📋 Mis Sesiones (${sessions.length})`},{id:"new",label:"➕ Nueva Sesión"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id as any)} style={{padding:"8px 14px",borderRadius:9,border:`1px solid ${tab===t.id?S.accent:S.border}`,background:tab===t.id?`${S.accent}22`:S.card,color:tab===t.id?"#a5b4fc":S.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{t.label}</button>
        ))}
      </div>

      {tab==="new" && (
        <SCard>
          <div style={{color:S.accent,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:14}}>REGISTRAR COACHING SESSION</div>
          <div style={{marginBottom:12}}>
            <div style={{color:S.muted,fontSize:11,marginBottom:4}}>AGENTE</div>
            <select value={form.agentGameId} onChange={e=>setForm(p=>({...p,agentGameId:e.target.value}))} style={inp}>
              <option value="">Selecciona un agente de tu equipo</option>
              {agents.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
            {agents.length===0&&<div style={{color:S.muted,fontSize:11,marginTop:4}}>No se encontraron agentes. Verifica que tu Game ID coincide con el campo "coach" en las métricas.</div>}
          </div>
          <div style={{marginBottom:12}}>
            <div style={{color:S.muted,fontSize:11,marginBottom:4}}>PERÍODO / FECHA</div>
            <input type="text" value={form.week} onChange={e=>setForm(p=>({...p,week:e.target.value}))} placeholder="Ej: W20-2026, Semana del 12 al 16 mayo..." style={inp}/>
            <div style={{color:S.yellow,fontSize:11,marginTop:5,display:"flex",alignItems:"center",gap:4}}>
              <span>📝</span><span>Indica la fecha o período de la sesión</span>
            </div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{color:S.muted,fontSize:11,marginBottom:4}}>NOTAS (opcional)</div>
            <textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} rows={3} style={{...inp,resize:"vertical" as any}} placeholder="Temas tratados en la sesión..."/>
          </div>
          <div style={{background:`${S.accent}10`,border:`1px solid ${S.accent}30`,borderRadius:10,padding:"10px 12px",marginBottom:14}}>
            <div style={{color:S.accent,fontWeight:700,fontSize:12,marginBottom:4}}>📋 Flujo de la sesión</div>
            <div style={{color:S.muted,fontSize:11,lineHeight:1.7}}>
              1. Registras la sesión → notificación al agente y manager<br/>
              2. El agente responde 2 preguntas de confirmación<br/>
              3. El manager verifica que la sesión se realizó<br/>
              4. <strong style={{color:S.green}}>Ambos confirman → +{POINTS_PER_SESSION} pts automáticos</strong><br/>
              <span style={{color:S.yellow}}>⚠️ Si solo uno confirma, los puntos quedan en espera</span>
            </div>
          </div>
          <SBtn onClick={submitSession} disabled={submitting||!form.agentGameId||!form.week} style={{width:"100%",padding:12}}>
            {submitting?"Registrando...":"REGISTRAR SESIÓN"}
          </SBtn>
        </SCard>
      )}

      {tab==="list" && (
        <div>
          {loading&&<div style={{textAlign:"center",color:S.muted,padding:40}}>Cargando...</div>}
          {!loading&&sessions.length===0&&(
            <SCard style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:48,marginBottom:8}}>📋</div>
              <div style={{color:S.muted}}>No has registrado sesiones aún.</div>
            </SCard>
          )}
          {/* Points log section */}
          {pointsLog.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{color:S.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:8}}>💰 HISTORIAL DE PUNTOS</div>
              {pointsLog.filter(p=>p.status==="approved").slice(0,5).map((p,i)=>(
                <SCard key={p.id||i} style={{marginBottom:6,padding:"10px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{color:S.text,fontSize:12,fontWeight:600}}>{p.description||p.source}</div>
                      <div style={{color:S.muted,fontSize:10,marginTop:2}}>{p.week} · {p.created_at?new Date(p.created_at).toLocaleDateString("es-MX"):""}</div>
                    </div>
                    <div style={{color:S.green,fontWeight:900,fontSize:16}}>+{p.points}</div>
                  </div>
                </SCard>
              ))}
            </div>
          )}
          {sessions.map((s)=>{
            const meta = STATUS_META[s.status] || STATUS_META.pending;
            return(
              <SCard key={s.id} style={{marginBottom:10,borderLeft:`3px solid ${meta.color}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:16}}>{meta.emoji}</span>
                      <span style={{color:S.text,fontWeight:700,fontSize:14}}>Agente: {s.agent_game_id}</span>
                    </div>
                    <div style={{color:S.muted,fontSize:11,marginTop:3}}>{s.week}</div>
                  </div>
                  <STag color={meta.color}>{s.status}</STag>
                </div>
                {s.notes&&<div style={{color:S.muted,fontSize:12,fontStyle:"italic",marginBottom:8}}>"{s.notes}"</div>}
                <div style={{display:"flex",gap:6,flexWrap:"wrap" as any}}>
                  <STag color={s.agent_q1!==null?S.green:S.yellow}>Agente: {s.agent_q1===null?"⏳ esperando":s.agent_q1&&s.agent_q2?"✅ confirmó":"⚠️ respondió"}</STag>
                  <STag color={s.manager_confirmed!==null?S.green:S.yellow}>Manager: {s.manager_confirmed===null?"⏳ esperando":s.manager_confirmed?"✅ verificó":"❌ rechazó"}</STag>
                  {s.points_paid&&<STag color={S.green}>+{POINTS_PER_SESSION} pts ✓</STag>}
                </div>
              </SCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MANAGER VERIFY VIEW ──────────────────────────────────────────────────────
function ManagerVerifyView({ user, staffProfile }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState("");

  const showToast = (msg:string) => { setToast(msg); setTimeout(()=>setToast(""),3000); };

  useEffect(()=>{ load(); },[]);

  const load = async () => {
    setLoading(true);
    try {
      const sess = await db.getSessionsForManager(user.gameId);
      setSessions(sess||[]);
    } catch(e){}
    setLoading(false);
  };

  const verify = async (session:any, confirmed:boolean) => {
    try {
      if (!confirmed) {
        await db.updateSession(session.id, {
          manager_confirmed: false,
          manager_responded_at: new Date().toISOString(),
          status: "cancelled",
        });
        showToast("Sesión rechazada.");
        await load();
        return;
      }

      const agentAlsoConfirmed = session.agent_q1 === true && session.agent_q2 === true;
      const newStatus = agentAlsoConfirmed ? "completed" : "manager_responded";

      await db.updateSession(session.id, {
        manager_confirmed: true,
        manager_responded_at: new Date().toISOString(),
        status: newStatus,
      });

      if (agentAlsoConfirmed && !session.points_paid) {
        const awarded = await tryAwardPoints(
          { ...session, manager_confirmed: true },
          user.gameId
        );
        if (awarded) {
          // Notify coach
          try {
            const coachStaff = await db.getStaffByGameId(session.coach_game_id);
            if (coachStaff?.[0]) {
              await db.createNotif({
                recipient_id: coachStaff[0].id,
                sender_id: user.id,
                title: "⭐ Coaching Session completada",
                message: `Manager ${user.gameId} verificó tu sesión con ${session.agent_game_id}. +${POINTS_PER_SESSION} pts acreditados 🎉`,
                type: "coaching_complete",
                is_read: false,
              });
            }
          } catch(e) {}
          // Notify agent
          try {
            const agentProfile = await db.getAgentByGameId(session.agent_game_id);
            if (agentProfile?.[0]?.id) {
              await db.createNotif({
                recipient_id: agentProfile[0].id,
                sender_id: user.id,
                title: "✅ Sesión de Coaching completada",
                message: `Tu coaching session con ${session.coach_game_id} fue verificada y completada. ¡Buen trabajo! 🎉`,
                type: "coaching_complete",
                is_read: false,
              });
            }
          } catch(e) {}
        }
        showToast(awarded ? `✅ Sesión verificada — +${POINTS_PER_SESSION} pts para ${session.coach_game_id}` : "Sesión verificada.");
      } else if (!agentAlsoConfirmed) {
        // Manager confirmed first — notify agent to respond so points can be released
        try {
          const agentProfile = await db.getAgentByGameId(session.agent_game_id);
          if (agentProfile?.[0]?.id) {
            await db.createNotif({
              recipient_id: agentProfile[0].id,
              sender_id: user.id,
              title: "📋 Evaluación de Coaching Session pendiente",
              message: `Tu manager verificó la sesión con coach ${session.coach_game_id}. Por favor responde las preguntas en tu 🔔 para liberar los puntos.`,
              type: "coaching_session",
              is_read: false,
            });
          }
        } catch(e) {}
        showToast("Verificado. Notificación enviada al agente para que responda.");
      } else {
        showToast("Sesión ya tenía puntos acreditados.");
      }

      await load();
    } catch(e){ showToast("Error al verificar"); }
  };

  const pending = sessions.filter(s=>s.status==="pending"||s.status==="agent_responded");
  const history = sessions.filter(s=>s.status==="completed"||s.status==="cancelled"||s.status==="manager_responded");

  return (
    <div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}>
      {toast&&<div style={{position:"fixed",top:56,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:toast.includes("Error")?S.red:S.green,color:"#fff",padding:"10px 22px",borderRadius:12,fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>{toast}</div>}

      <SCard style={{marginBottom:14,background:`linear-gradient(135deg,#1e1b4b,#312e81)`,border:"none"}}>
        <div style={{fontSize:28,marginBottom:4}}>👔</div>
        <div style={{color:S.text,fontWeight:800,fontSize:18}}>Verificación de Coaching Sessions</div>
        <div style={{color:"#a5b4fc",fontSize:12,marginTop:2}}>Confirma las sesiones de tus coaches</div>
        <div style={{display:"flex",gap:12,marginTop:10}}>
          <div style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"8px 16px",textAlign:"center"}}>
            <div style={{color:S.yellow,fontWeight:900,fontSize:20}}>{pending.length}</div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:10}}>Pendientes</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"8px 16px",textAlign:"center"}}>
            <div style={{color:S.green,fontWeight:900,fontSize:20}}>{sessions.filter(s=>s.status==="completed").length}</div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:10}}>Completadas</div>
          </div>
        </div>
      </SCard>

      {loading&&<div style={{textAlign:"center",color:S.muted,padding:40}}>Cargando...</div>}

      {pending.length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{color:S.yellow,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:10}}>⏳ PENDIENTES DE VERIFICACIÓN</div>
          {pending.map((s)=>{
            const agentOk = s.agent_q1!==null&&s.agent_q2!==null;
            return(
              <SCard key={s.id} style={{marginBottom:10,border:`1px solid ${S.yellow}44`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <div style={{color:S.text,fontWeight:700,fontSize:14}}>Coach: {s.coach_game_id}</div>
                    <div style={{color:S.muted,fontSize:11,marginTop:2}}>Agente: {s.agent_game_id} · {s.week}</div>
                  </div>
                  <STag color={S.yellow}>Pendiente tuya</STag>
                </div>
                {s.notes&&<div style={{color:S.muted,fontSize:12,fontStyle:"italic",marginBottom:10}}>"{s.notes}"</div>}
                <div style={{marginBottom:10,padding:"8px 10px",background:`${S.accent}10`,borderRadius:8}}>
                  <div style={{color:S.accent,fontSize:11,fontWeight:700,marginBottom:4}}>Respuestas del agente</div>
                  {agentOk?(
                    <div style={{display:"flex",gap:8}}>
                      <STag color={s.agent_q1?S.green:S.red}>{s.agent_q1?"✓":"✗"} ¿Coach se reunió con él?</STag>
                      <STag color={s.agent_q2?S.green:S.red}>{s.agent_q2?"✓":"✗"} ¿Recibió retroalimentación?</STag>
                    </div>
                  ):(
                    <div style={{color:S.yellow,fontSize:11}}>⏳ Agente aún no responde — los puntos se liberan cuando ambos confirmen</div>
                  )}
                </div>
                <div style={{color:S.text,fontWeight:600,fontSize:12,marginBottom:8}}>
                  👔 ¿Confirmas que esta sesión se realizó?
                  {!agentOk&&<span style={{color:S.muted,fontWeight:400}}> (puedes confirmar ahora — puntos se liberan cuando el agente también responda)</span>}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <SBtn onClick={()=>verify(s,true)} color={S.green} style={{flex:1}}>✓ Sí, se realizó</SBtn>
                  <SBtn onClick={()=>verify(s,false)} color={S.red} style={{flex:1}}>✗ No se realizó</SBtn>
                </div>
              </SCard>
            );
          })}
        </div>
      )}

      {history.length>0&&(
        <div>
          <div style={{color:S.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:10}}>📂 HISTORIAL</div>
          {history.map((s)=>{
            const meta=STATUS_META[s.status]||STATUS_META.pending;
            return(
              <SCard key={s.id} style={{marginBottom:8,opacity:0.8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:S.text,fontWeight:600,fontSize:13}}>{s.coach_game_id} → {s.agent_game_id}</div>
                    <div style={{color:S.muted,fontSize:11}}>{s.week}</div>
                  </div>
                  <STag color={meta.color}>{meta.emoji} {s.status==="completed"?"Completada":"Rechazada"}</STag>
                </div>
              </SCard>
            );
          })}
        </div>
      )}

      {!loading&&sessions.length===0&&(
        <SCard style={{textAlign:"center",padding:40}}>
          <div style={{fontSize:48,marginBottom:8}}>✅</div>
          <div style={{color:S.muted}}>No hay sesiones pendientes de verificación.</div>
        </SCard>
      )}
    </div>
  );
}

// ─── AGENT RESPONSE CARD ──────────────────────────────────────────────────────
export function AgentCoachingCard({ session, agentId, onRespond }) {
  const [q1, setQ1] = useState<boolean|null>(null);
  const [q2, setQ2] = useState<boolean|null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const C = {
    blue:"#1a1aff", red:"#e8282a", green:"#16a34a", muted:"#6b7280",
    border:"#d1d5f0", bg:"#f0f2ff", text:"#0a0a40", card:"#fff",
  };

  const submit = async () => {
    if (q1===null||q2===null) return;
    setSubmitting(true);
    try {
      await sbFetch(`coaching_sessions?id=eq.${session.id}`, {
        method:"PATCH",
        body:JSON.stringify({
          agent_q1: q1,
          agent_q2: q2,
          agent_responded_at: new Date().toISOString(),
          status: "agent_responded",
        })
      });

      // FIX 1: Notify manager that agent responded — use manager_game_id to find staff UUID
      try {
        if (session.manager_game_id) {
          const mgStaff = await sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(session.manager_game_id)}&select=id`).catch(()=>[]);
          if (mgStaff?.[0]?.id) {
            await sbFetch("notifications", {
              method: "POST",
              prefer: "return=minimal",
              body: JSON.stringify({
                recipient_id: mgStaff[0].id,
                title: "👔 Agente respondió — verificación pendiente",
                message: `El agente ${session.agent_game_id} confirmó la sesión del coach ${session.coach_game_id} (${session.week||"reciente"}). Entra a Avisos 🔔 para verificar.`,
                type: "coaching_verify",
                is_read: false,
              }),
            });
          }
        }
      } catch(e) { console.error("[AgentCoachingCard] manager notif error:", e); }

      // Try to award points if manager already confirmed
      if (!session.points_paid && session.manager_confirmed === true && q1 === true && q2 === true) {
        await tryAwardPoints(
          { ...session, agent_q1: q1, agent_q2: q2, manager_confirmed: true },
          "system"
        );
      }

      setDone(true);
      if (onRespond) onRespond();
    } catch(e){}
    setSubmitting(false);
  };

  if (done) return (
    <div style={{background:"#dcfce7",border:"1.5px solid #86efac",borderRadius:12,padding:"12px 14px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:20}}>✅</span>
        <span style={{color:C.green,fontWeight:700,fontSize:13}}>¡Gracias! Tus respuestas fueron enviadas. El manager recibirá aviso 🔔</span>
      </div>
    </div>
  );

  const QBtn = ({val,selected,onClick,color}:any) => (
    <button onClick={onClick} style={{flex:1,padding:"9px 0",borderRadius:8,border:`2px solid ${selected===val?color:C.border}`,background:selected===val?`${color}18`:C.bg,color:selected===val?color:C.muted,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
      {val?"Sí ✓":"No ✗"}
    </button>
  );

  return (
    <div style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:14,padding:14,marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{fontSize:22}}>📋</span>
        <div>
          <div style={{color:C.blue,fontWeight:800,fontSize:14}}>Evaluación de Coaching Session</div>
          <div style={{color:C.muted,fontSize:11}}>Coach: {session.coach_game_id} · {session.week}</div>
        </div>
      </div>
      <div style={{marginBottom:12}}>
        <div style={{color:C.text,fontWeight:600,fontSize:13,marginBottom:6}}>1. ¿Tu coach se reunió contigo esta semana para revisar tu desempeño?</div>
        <div style={{display:"flex",gap:8}}>
          <QBtn val={true}  selected={q1} onClick={()=>setQ1(true)}  color={C.green}/>
          <QBtn val={false} selected={q1} onClick={()=>setQ1(false)} color={C.red}/>
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{color:C.text,fontWeight:600,fontSize:13,marginBottom:6}}>2. ¿Recibiste retroalimentación clara y accionable durante la sesión?</div>
        <div style={{display:"flex",gap:8}}>
          <QBtn val={true}  selected={q2} onClick={()=>setQ2(true)}  color={C.green}/>
          <QBtn val={false} selected={q2} onClick={()=>setQ2(false)} color={C.red}/>
        </div>
      </div>
      <button onClick={submit} disabled={submitting||q1===null||q2===null} style={{width:"100%",padding:11,background:q1===null||q2===null?"#c5cae9":C.blue,color:"#fff",border:"none",borderRadius:9,fontWeight:800,fontSize:13,cursor:q1===null||q2===null?"not-allowed":"pointer",fontFamily:"inherit"}}>
        {submitting?"Enviando...":"ENVIAR RESPUESTAS"}
      </button>
    </div>
  );
}

// ─── HIGH EVALUATION ──────────────────────────────────────────────────────────
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function HighEvaluationView({ user }: { user: any }) {
  const [coaches, setCoaches]   = useState<any[]>([]);
  const [evals, setEvals]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string|null>(null);
  const [toast, setToast]       = useState("");
  const [form, setForm]         = useState({
    coachGameId: "", month: "", year: String(new Date().getFullYear()), passed: true,
  });
  const [showForm, setShowForm] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [coachList, evalList] = await Promise.all([
      sbFetch(`staff_profiles?role=eq.team_coach&select=game_id,full_name,project,coins&order=full_name.asc`).catch(() => []),
      sbFetch(`coaching_high_evaluations?order=created_at.desc&limit=100`).catch(() => []),
    ]);
    setCoaches(coachList || []);
    setEvals(evalList || []);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!form.coachGameId || !form.month || !form.year) {
      showToast("Selecciona coach, mes y año"); return;
    }
    const period = `${form.month}_${form.year}`;
    const dupe = evals.find(e => e.coach_game_id === form.coachGameId && e.period === period);
    if (dupe) { showToast("Ya existe una evaluación para este coach en ese mes"); return; }

    setSaving("new");
    try {
      const pts = form.passed ? 25 : 0;

      await sbFetch("coaching_high_evaluations", {
        method: "POST", prefer: "return=minimal",
        body: JSON.stringify({
          coach_game_id: form.coachGameId,
          period,
          month: form.month,
          year: Number(form.year),
          passed: form.passed,
          points_awarded: pts,
          evaluated_by: user.gameId || user.game_id,
          created_at: new Date().toISOString(),
        }),
      });

      if (form.passed) {
        await sbFetch("staff_points_log", {
          method: "POST", prefer: "return=minimal",
          body: JSON.stringify({
            staff_game_id: form.coachGameId,
            points: pts,
            source: "coaching_high_eval",
            description: `⭐ Coaching High Evaluation aprobada — ${form.month} ${form.year}`,
            week: period,
            status: "approved",
            granted_by: user.gameId || user.game_id,
            created_at: new Date().toISOString(),
          }),
        });
        const prof = await sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(form.coachGameId)}&select=coins`);
        if (prof && prof.length > 0) {
          await sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(form.coachGameId)}`, {
            method: "PATCH", prefer: "return=minimal",
            body: JSON.stringify({ coins: Math.max(0, (prof[0].coins || 0) + pts) }),
          });
        }
      }

      showToast(`✅ Evaluación registrada${form.passed ? ` — +${pts} pts para ${form.coachGameId}` : ""}`);
      setForm(p => ({ ...p, coachGameId: "", month: "" }));
      setShowForm(false);
      await load();
    } catch(e) {
      showToast("Error al registrar evaluación");
    }
    setSaving(null);
  };

  const years = [2025, 2026, 2027];
  const inp = { width:"100%", border:`1px solid ${S.border}`, borderRadius:8, padding:"9px 11px", fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box" as any, background:S.bg, color:S.text };

  return (
    <div style={{paddingBottom:60}}>
      {toast && <div style={{position:"fixed",top:56,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:toast.includes("Error")?S.red:S.green,color:"#fff",padding:"10px 22px",borderRadius:12,fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>{toast}</div>}

      <SCard style={{marginBottom:14,background:`linear-gradient(135deg,#1a1a3e,#2d1b69)`,border:"none"}}>
        <div style={{fontSize:28,marginBottom:4}}>⭐</div>
        <div style={{color:S.text,fontWeight:800,fontSize:18}}>High Evaluation</div>
        <div style={{color:"#c4b5fd",fontSize:12,marginTop:2}}>Evaluación mensual de coaches — +25 pts si aprueba</div>
        <SBtn onClick={()=>setShowForm(p=>!p)} color={S.purple} style={{marginTop:12,width:"100%"}}>
          {showForm ? "✕ Cancelar" : "➕ Nueva Evaluación"}
        </SBtn>
      </SCard>

      {showForm && (
        <SCard style={{marginBottom:14,border:`1px solid ${S.purple}44`}}>
          <div style={{color:S.purple,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:14}}>REGISTRAR EVALUACIÓN</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10,marginBottom:14}}>
            <div>
              <div style={{color:S.muted,fontSize:11,marginBottom:4}}>COACH</div>
              <select value={form.coachGameId} onChange={e=>setForm(p=>({...p,coachGameId:e.target.value}))} style={inp}>
                <option value="">Selecciona coach</option>
                {coaches.map(c => (
                  <option key={c.game_id} value={c.game_id}>
                    {c.game_id}{c.project?` — ${c.project}`:""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={{color:S.muted,fontSize:11,marginBottom:4}}>MES</div>
              <select value={form.month} onChange={e=>setForm(p=>({...p,month:e.target.value}))} style={inp}>
                <option value="">Selecciona mes</option>
                {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <div style={{color:S.muted,fontSize:11,marginBottom:4}}>AÑO</div>
              <select value={form.year} onChange={e=>setForm(p=>({...p,year:e.target.value}))} style={inp}>
                {years.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div style={{marginBottom:16}}>
            <div style={{color:S.muted,fontSize:11,marginBottom:8}}>RESULTADO DE LA EVALUACIÓN</div>
            <div style={{display:"flex",gap:10}}>
              <div onClick={()=>setForm(p=>({...p,passed:true}))} style={{
                flex:1,padding:"16px 12px",borderRadius:12,cursor:"pointer",
                border:`2px solid ${form.passed?S.green:S.border}`,
                background:form.passed?`${S.green}18`:"#0a1020",textAlign:"center",transition:"all 0.15s",
              }}>
                <div style={{fontSize:28,marginBottom:4}}>✅</div>
                <div style={{color:form.passed?S.green:S.muted,fontWeight:700,fontSize:14}}>Aprobó</div>
                <div style={{color:form.passed?S.green:S.muted,fontSize:11,marginTop:2}}>+25 pts</div>
              </div>
              <div onClick={()=>setForm(p=>({...p,passed:false}))} style={{
                flex:1,padding:"16px 12px",borderRadius:12,cursor:"pointer",
                border:`2px solid ${!form.passed?S.red:S.border}`,
                background:!form.passed?`${S.red}18`:"#0a1020",textAlign:"center",transition:"all 0.15s",
              }}>
                <div style={{fontSize:28,marginBottom:4}}>❌</div>
                <div style={{color:!form.passed?S.red:S.muted,fontWeight:700,fontSize:14}}>No aprobó</div>
                <div style={{color:!form.passed?S.red:S.muted,fontSize:11,marginTop:2}}>0 pts</div>
              </div>
            </div>
          </div>

          <button onClick={handleSubmit} disabled={saving==="new"||!form.coachGameId||!form.month} style={{
            width:"100%",padding:12,
            background:!form.coachGameId||!form.month?S.border:form.passed?S.green:S.red,
            color:"#fff",border:"none",borderRadius:9,
            fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",
            opacity:saving==="new"?0.6:1,
          }}>
            {saving==="new"?"Guardando...":`Registrar — ${form.passed?"Aprobó (+25 pts)":"No aprobó"}`}
          </button>
        </SCard>
      )}

      {loading?(
        <div style={{color:S.muted,textAlign:"center",padding:40}}>Cargando...</div>
      ):evals.length===0?(
        <SCard style={{textAlign:"center",padding:40}}>
          <div style={{fontSize:40,marginBottom:8}}>⭐</div>
          <div style={{color:S.muted,fontSize:13}}>No hay evaluaciones registradas aún.</div>
        </SCard>
      ):(
        <div>
          <div style={{color:S.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:10}}>HISTORIAL DE EVALUACIONES</div>
          {evals.map((ev,i)=>(
            <SCard key={ev.id||i} style={{marginBottom:8,borderLeft:`3px solid ${ev.passed?S.green:S.red}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                    <span style={{fontSize:18}}>{ev.passed?"✅":"❌"}</span>
                    <span style={{color:S.text,fontWeight:700,fontSize:14}}>{ev.coach_game_id}</span>
                    <span style={{padding:"1px 7px",borderRadius:4,fontSize:10,fontWeight:700,background:`${ev.passed?S.green:S.red}22`,color:ev.passed?S.green:S.red}}>{ev.passed?"Aprobó":"No aprobó"}</span>
                  </div>
                  <div style={{color:S.muted,fontSize:11}}>
                    {ev.month} {ev.year}
                    {ev.evaluated_by&&<span> · Evaluado por: {ev.evaluated_by}</span>}
                  </div>
                  <div style={{color:S.muted,fontSize:10,marginTop:2}}>{new Date(ev.created_at).toLocaleDateString("es-MX")}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  {ev.passed&&<div style={{color:S.green,fontWeight:900,fontSize:18}}>+{ev.points_awarded}</div>}
                  <div style={{color:S.muted,fontSize:10}}>pts</div>
                </div>
              </div>
            </SCard>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FIX 3: POINTS BREAKDOWN VIEW (Super Admin) ───────────────────────────────
export function PointsBreakdownView() {
  const [gameId, setGameId]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<any>(null);
  const [error, setError]       = useState("");
  const [personType, setPersonType] = useState<"agent"|"staff"|null>(null);

  const search = async () => {
    if (!gameId.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");
    setPersonType(null);
    try {
      // Try agent first
      const [agentProf, staffProf] = await Promise.all([
        sbFetch(`profiles?game_id=eq.${encodeURIComponent(gameId.trim())}&select=*`).catch(()=>[]),
        sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(gameId.trim())}&select=*`).catch(()=>[]),
      ]);

      if (agentProf && agentProf.length > 0) {
        // AGENT breakdown
        setPersonType("agent");
        const agent = agentProf[0];
        const [metrics, riddles, tasks, referrals] = await Promise.all([
          sbFetch(`weekly_metrics?game_id=eq.${encodeURIComponent(gameId.trim())}&select=*&order=week.asc`).catch(()=>[]),
          sbFetch(`agent_riddle_answers?game_id=eq.${encodeURIComponent(gameId.trim())}&select=*`).catch(()=>[]),
          sbFetch(`agent_task_submissions?game_id=eq.${encodeURIComponent(gameId.trim())}&select=*`).catch(()=>[]),
          sbFetch(`referrals?referred_by_game_id=eq.${encodeURIComponent(gameId.trim())}&select=pts_awarded`).catch(()=>[]),
        ]);
        setResult({ agent, metrics: metrics||[], riddles: riddles||[], tasks: tasks||[], referrals: referrals||[] });
      } else if (staffProf && staffProf.length > 0) {
        // STAFF breakdown
        setPersonType("staff");
        const staff = staffProf[0];
        const [pointsLog, sessions, highEvals] = await Promise.all([
          sbFetch(`staff_points_log?staff_game_id=eq.${encodeURIComponent(gameId.trim())}&order=created_at.desc&limit=200`).catch(()=>[]),
          sbFetch(`coaching_sessions?coach_game_id=eq.${encodeURIComponent(gameId.trim())}&order=created_at.desc`).catch(()=>[]),
          sbFetch(`coaching_high_evaluations?coach_game_id=eq.${encodeURIComponent(gameId.trim())}&order=created_at.desc`).catch(()=>[]),
        ]);
        setResult({ staff, pointsLog: pointsLog||[], sessions: sessions||[], highEvals: highEvals||[] });
      } else {
        setError(`No se encontró ningún usuario con Game ID: "${gameId.trim()}"`);
      }
    } catch(e) {
      setError("Error al buscar: " + (e as any).message);
    }
    setLoading(false);
  };

  const inp = {
    border:`1px solid ${S.border}`,borderRadius:8,padding:"10px 14px",fontSize:14,
    outline:"none",fontFamily:"inherit",background:S.bg,color:S.text,flex:1,
  };

  // ── Agent breakdown render ────────────────────────────────────────────────
  const renderAgent = () => {
    const { agent, metrics, riddles, tasks, referrals } = result;
    const approvedRiddles = riddles.filter(r=>r.status==="approved");
    const approvedTasks = tasks.filter(t=>t.status==="approved");
    const kpiScore = metrics.reduce((s,w)=>(s+(w.qa_pts||0)+(w.aht_pts||0)+(w.attendance_pts||0)),0);
    const riddleScore = approvedRiddles.length * 2;
    const taskScore = approvedTasks.length * 2;
    const kudosCoins = (agent.kudos||0)*1 + (agent.gold_kudos||0)*5;
    const refCoins = (referrals||[]).reduce((s:number,r:any)=>s+(r.pts_awarded||0),0);
    const totalScore = kpiScore + riddleScore + taskScore;
    const totalCoins = totalScore + kudosCoins + refCoins;

    return (
      <div>
        {/* Identity card */}
        <SCard style={{marginBottom:12,background:`linear-gradient(135deg,#1a2040,#0d1233)`,border:"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <div style={{fontSize:36}}>🏆</div>
            <div>
              <div style={{color:S.text,fontWeight:900,fontSize:18}}>{agent.full_name||agent.username}</div>
              <div style={{color:"#a5b4fc",fontSize:13}}>Game ID: {agent.game_id} · {agent.project}</div>
              <div style={{color:S.muted,fontSize:11,marginTop:2}}>Agente · {agent.role}</div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[
              {l:"Score Total",v:totalScore,c:"#60a5fa"},
              {l:"Coins Totales",v:totalCoins,c:"#fbbf24"},
              {l:"Semanas",v:metrics.length,c:S.green},
            ].map(x=>(
              <div key={x.l} style={{background:"rgba(255,255,255,0.07)",borderRadius:10,padding:"10px 6px",textAlign:"center"}}>
                <div style={{color:x.c,fontWeight:900,fontSize:22}}>{x.v}</div>
                <div style={{color:"rgba(255,255,255,0.45)",fontSize:9,marginTop:2}}>{x.l}</div>
              </div>
            ))}
          </div>
        </SCard>

        {/* Score breakdown */}
        <SCard style={{marginBottom:12}}>
          <div style={{color:S.accent,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>📊 DESGLOSE DE SCORE</div>
          {[
            {icon:"🎯",label:"KPI (QA + AHT + Asistencia)",val:kpiScore,color:"#60a5fa",desc:`${metrics.length} semanas`},
            {icon:"🧠",label:"Riddles aprobados",val:riddleScore,color:S.purple,desc:`${approvedRiddles.length} riddles × 2pts`},
            {icon:"📋",label:"Tasks aprobadas",val:taskScore,color:"#f97316",desc:`${approvedTasks.length} tasks × 2pts`},
            {icon:"👏",label:"Kudos (coins extra)",val:kudosCoins,color:"#fbbf24",desc:`${agent.kudos||0} regular + ${agent.gold_kudos||0} gold`},
            {icon:"👥",label:"Referidos",val:refCoins,color:"#34d399",desc:`${(referrals||[]).length} referido(s) · ${refCoins} coins`},
          ].map(r=>(
            <div key={r.label} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${S.border}`}}>
              <span style={{fontSize:18,width:24}}>{r.icon}</span>
              <div style={{flex:1}}>
                <div style={{color:S.text,fontSize:13,fontWeight:600}}>{r.label}</div>
                <div style={{color:S.muted,fontSize:11}}>{r.desc}</div>
              </div>
              <div style={{color:r.color,fontWeight:900,fontSize:18}}>{r.val}</div>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",marginTop:4}}>
            <span style={{color:S.text,fontWeight:800,fontSize:14}}>TOTAL COINS</span>
            <span style={{color:"#fbbf24",fontWeight:900,fontSize:20}}>🪙 {totalCoins}</span>
          </div>
        </SCard>

        {/* Weekly metrics detail */}
        {metrics.length > 0 && (
          <SCard style={{marginBottom:12}}>
            <div style={{color:S.accent,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:10}}>📅 SEMANA A SEMANA</div>
            {metrics.map((w,i)=>{
              const wPts=(w.qa_pts||0)+(w.aht_pts||0)+(w.attendance_pts||0);
              return(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${S.border}`}}>
                  <div style={{color:S.muted,fontSize:11,width:90,flexShrink:0}}>{w.week}</div>
                  <div style={{flex:1,display:"flex",gap:6,flexWrap:"wrap" as any}}>
                    <STag color="#60a5fa">QA: {w.qa_pts||0}</STag>
                    <STag color="#34d399">AHT: {w.aht_pts||0}</STag>
                    <STag color="#a78bfa">Att: {w.attendance_pts||0}</STag>
                  </div>
                  <div style={{color:wPts>=12?S.green:wPts>=8?S.yellow:S.red,fontWeight:800,fontSize:15}}>{wPts}pts</div>
                </div>
              );
            })}
          </SCard>
        )}

        {/* Riddles & Tasks detail */}
        {(approvedRiddles.length>0||approvedTasks.length>0) && (
          <SCard style={{marginBottom:12}}>
            <div style={{color:S.accent,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:10}}>🧠 ACTIVIDADES</div>
            {approvedRiddles.map((r,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${S.border}`}}>
                <div style={{color:S.text,fontSize:12}}>🧠 Riddle aprobado</div>
                <div style={{color:S.purple,fontWeight:700}}>+2</div>
              </div>
            ))}
            {approvedTasks.map((t,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${S.border}`}}>
                <div style={{color:S.text,fontSize:12}}>📋 Task aprobada</div>
                <div style={{color:"#f97316",fontWeight:700}}>+2</div>
              </div>
            ))}
          </SCard>
        )}
      </div>
    );
  };

  // ── Staff breakdown render ─────────────────────────────────────────────────
  const renderStaff = () => {
    const { staff, pointsLog, sessions, highEvals } = result;
    const approvedPts = pointsLog.filter(p=>p.status==="approved");
    const totalPts = approvedPts.reduce((s,p)=>s+(p.points||0),0);
    const bySource: Record<string,number> = {};
    approvedPts.forEach(p=>{ bySource[p.source]=(bySource[p.source]||0)+(p.points||0); });

    return (
      <div>
        {/* Identity */}
        <SCard style={{marginBottom:12,background:`linear-gradient(135deg,#1e1b4b,#312e81)`,border:"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <div style={{fontSize:36}}>⚡</div>
            <div>
              <div style={{color:S.text,fontWeight:900,fontSize:18}}>{staff.full_name}</div>
              <div style={{color:"#a5b4fc",fontSize:13}}>Game ID: {staff.game_id} · {staff.project}</div>
              <div style={{color:S.muted,fontSize:11,marginTop:2}}>{staff.role}</div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[
              {l:"Coins en perfil",v:staff.coins||0,c:"#fbbf24"},
              {l:"Pts aprobados (log)",v:totalPts,c:S.green},
              {l:"Sesiones completadas",v:sessions.filter(s=>s.status==="completed").length,c:S.accent},
            ].map(x=>(
              <div key={x.l} style={{background:"rgba(255,255,255,0.07)",borderRadius:10,padding:"10px 6px",textAlign:"center"}}>
                <div style={{color:x.c,fontWeight:900,fontSize:22}}>{x.v}</div>
                <div style={{color:"rgba(255,255,255,0.45)",fontSize:9,marginTop:2}}>{x.l}</div>
              </div>
            ))}
          </div>
          {(staff.coins||0) !== totalPts && (
            <div style={{marginTop:10,padding:"8px 10px",borderRadius:8,background:`${S.yellow}18`,border:`1px solid ${S.yellow}44`}}>
              <div style={{color:S.yellow,fontSize:11,fontWeight:700}}>⚠️ Desincronización detectada</div>
              <div style={{color:S.muted,fontSize:11}}>Coins en perfil ({staff.coins||0}) ≠ suma del log ({totalPts}). Se puede sincronizar manualmente.</div>
            </div>
          )}
        </SCard>

        {/* By source */}
        {Object.keys(bySource).length > 0 && (
          <SCard style={{marginBottom:12}}>
            <div style={{color:S.accent,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:10}}>📊 PUNTOS POR FUENTE</div>
            {Object.entries(bySource).map(([source,pts])=>(
              <div key={source} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${S.border}`}}>
                <div style={{color:S.text,fontSize:13,fontWeight:600,textTransform:"capitalize"}}>{source.replace(/_/g," ")}</div>
                <div style={{color:S.green,fontWeight:800,fontSize:16}}>+{pts}</div>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",marginTop:4}}>
              <span style={{color:S.text,fontWeight:800}}>TOTAL</span>
              <span style={{color:"#fbbf24",fontWeight:900,fontSize:20}}>🪙 {totalPts}</span>
            </div>
          </SCard>
        )}

        {/* Points log detail */}
        {approvedPts.length > 0 && (
          <SCard style={{marginBottom:12}}>
            <div style={{color:S.accent,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:10}}>📋 LOG COMPLETO ({approvedPts.length} entradas)</div>
            {approvedPts.map((p,i)=>(
              <div key={p.id||i} style={{padding:"7px 0",borderBottom:`1px solid ${S.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{color:S.text,fontSize:12,fontWeight:600}}>{p.description||p.source}</div>
                    <div style={{color:S.muted,fontSize:10,marginTop:2}}>
                      {p.week&&<span>{p.week} · </span>}
                      {p.created_at?new Date(p.created_at).toLocaleDateString("es-MX"):""}
                      {p.granted_by&&<span> · por {p.granted_by}</span>}
                    </div>
                  </div>
                  <div style={{color:S.green,fontWeight:800,fontSize:15,marginLeft:8}}>+{p.points}</div>
                </div>
              </div>
            ))}
          </SCard>
        )}

        {/* Coaching sessions */}
        {sessions.length > 0 && (
          <SCard style={{marginBottom:12}}>
            <div style={{color:S.accent,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:10}}>🎯 COACHING SESSIONS ({sessions.length})</div>
            {sessions.map((s,i)=>{
              const meta=STATUS_META[s.status]||STATUS_META.pending;
              return(
                <div key={s.id||i} style={{padding:"7px 0",borderBottom:`1px solid ${S.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:S.text,fontSize:12}}>{meta.emoji} Agente: {s.agent_game_id}</div>
                    <div style={{color:S.muted,fontSize:10}}>{s.week}</div>
                  </div>
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    <STag color={meta.color}>{s.status}</STag>
                    {s.points_paid&&<STag color={S.green}>+{POINTS_PER_SESSION}pts</STag>}
                  </div>
                </div>
              );
            })}
          </SCard>
        )}

        {/* High evaluations */}
        {highEvals.length > 0 && (
          <SCard style={{marginBottom:12}}>
            <div style={{color:S.accent,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:10}}>⭐ HIGH EVALUATIONS</div>
            {highEvals.map((ev,i)=>(
              <div key={ev.id||i} style={{padding:"7px 0",borderBottom:`1px solid ${S.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{color:S.text,fontSize:12}}>{ev.passed?"✅":"❌"} {ev.month} {ev.year}</div>
                  <div style={{color:S.muted,fontSize:10}}>Evaluado por: {ev.evaluated_by}</div>
                </div>
                {ev.passed&&<div style={{color:S.green,fontWeight:800}}>+{ev.points_awarded}</div>}
              </div>
            ))}
          </SCard>
        )}
      </div>
    );
  };

  return (
    <div style={{paddingBottom:80,background:S.bg,minHeight:"100vh"}}>
      <SCard style={{marginBottom:14,background:`linear-gradient(135deg,#1e1b4b,#312e81)`,border:"none"}}>
        <div style={{fontSize:28,marginBottom:4}}>🔍</div>
        <div style={{color:S.text,fontWeight:800,fontSize:18}}>Desglose de Puntos</div>
        <div style={{color:"#a5b4fc",fontSize:12,marginTop:2}}>Busca cualquier Game ID — agente o staff</div>
      </SCard>

      <SCard style={{marginBottom:16}}>
        <div style={{color:S.muted,fontSize:11,letterSpacing:1,marginBottom:8}}>GAME ID A CONSULTAR</div>
        <div style={{display:"flex",gap:8}}>
          <input
            value={gameId}
            onChange={e=>setGameId(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&search()}
            placeholder="Ej: AG-001, TC-012, CM.SANCHEZ..."
            style={inp}
          />
          <SBtn onClick={search} disabled={loading||!gameId.trim()} style={{flexShrink:0,padding:"10px 18px"}}>
            {loading?"...":"🔍 Buscar"}
          </SBtn>
        </div>
        {error && (
          <div style={{marginTop:10,color:S.red,fontSize:12,fontWeight:600}}>{error}</div>
        )}
      </SCard>

      {result && personType === "agent" && renderAgent()}
      {result && personType === "staff" && renderStaff()}
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function CoachingSessions({ user, staffProfile }) {
  const isCoach   = user?.role === "team_coach";
  const isManager = user?.role === "manager" || user?.role === "training_manager" || user?.role === "superadmin";
  const isSA      = user?.role === "superadmin";
  const [mainTab, setMainTab] = useState<"sessions"|"high_eval"|"breakdown">("sessions");

  const tabs = [
    { id: "sessions",   label: "🎯 Coaching Sessions" },
    { id: "high_eval",  label: "⭐ High Evaluation" },
    ...(isSA ? [{ id: "breakdown", label: "🔍 Desglose" }] : []),
  ];

  if (isCoach) return <CoachView user={user} staffProfile={staffProfile}/>;

  if (isManager) return (
    <div style={{ paddingBottom: 100, background: S.bg, minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" as any }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setMainTab(t.id as any)} style={{
            padding: "10px 18px", borderRadius: 9, fontWeight: 700, fontSize: 13,
            border: `1px solid ${mainTab === t.id ? S.accent : S.border}`,
            background: mainTab === t.id ? `${S.accent}22` : S.card,
            color: mainTab === t.id ? "#a5b4fc" : S.muted,
            cursor: "pointer", fontFamily: "inherit",
          }}>{t.label}</button>
        ))}
      </div>

      {mainTab === "sessions"   && <ManagerVerifyView user={user} staffProfile={staffProfile}/>}
      {mainTab === "high_eval"  && <HighEvaluationView user={user}/>}
      {mainTab === "breakdown"  && isSA && <PointsBreakdownView/>}
    </div>
  );

  return (
    <div style={{padding:32,textAlign:"center",background:S.bg,minHeight:"80vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontSize:48,marginBottom:8}}>🔒</div>
      <div style={{color:S.muted}}>Esta sección es solo para Team Coaches y Managers.</div>
    </div>
  );
}
