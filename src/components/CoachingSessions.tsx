// @ts-nocheck
// CoachingSessions.tsx — v2
// Puntos: SOLO cuando agente Y manager confirman (sin doble pago)
// Semana: dropdown con fechas reales de weekly_metrics
// 10 pts fijos por sesión completada
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
  // Agents in coach's team from weekly_metrics
  getCoachAgents: (coachGameId) => sbFetch(`weekly_metrics?coach=eq.${encodeURIComponent(coachGameId)}&select=game_id,week&order=week.desc`),
  // Real weeks from weekly_metrics
  getWeeks: () => sbFetch(`weekly_metrics?select=week&order=week.desc&limit=200`),
  getManagerForProject: (project) => sbFetch(`staff_profiles?project=eq.${encodeURIComponent(project)}&role=in.(manager,training_manager)&select=game_id,full_name&limit=1`),
  // Points — guard: only insert if not already paid
  addPoints: async (d) => {
    // Check for duplicate before inserting
    const existing = await sbFetch(`staff_points_log?staff_game_id=eq.${encodeURIComponent(d.staff_game_id)}&reference_id=eq.${encodeURIComponent(d.reference_id)}&source=eq.coaching_session`).catch(() => null);
    if (existing && existing.length > 0) return; // already paid, skip
    return sbFetch("staff_points_log", { method: "POST", body: JSON.stringify(d) });
  },
  getPointsLog: (gameId) => sbFetch(`staff_points_log?staff_game_id=eq.${encodeURIComponent(gameId)}&order=created_at.desc`),
  updateStaffCoins: (gameId, coins) => sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(gameId)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ coins }) }),
  getStaffByGameId: (gameId) => sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(gameId)}&select=*`),
  createNotif: (d) => sbFetch("notifications", { method: "POST", body: JSON.stringify(d) }),
  getAgentByGameId: (gameId) => sbFetch(`profiles?game_id=eq.${encodeURIComponent(gameId)}&select=id,full_name,game_id`),
};

// ─── Core: award points only once when BOTH agent + manager confirm ───────
async function tryAwardPoints(session: any, grantedBy: string) {
  // Both must have confirmed
  const agentOk = session.agent_q1 === true && session.agent_q2 === true;
  const managerOk = session.manager_confirmed === true;
  if (!agentOk || !managerOk) return false;
  // Guard: mark points_paid first to prevent race condition
  await db.updateSession(session.id, { points_paid: true, status: "completed" });
  // Insert log (has internal duplicate guard)
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
  // Update coins
  const coachStaff = await db.getStaffByGameId(session.coach_game_id);
  if (coachStaff && coachStaff[0]) {
    const cur = coachStaff[0].coins || 0;
    await db.updateStaffCoins(session.coach_game_id, cur + POINTS_PER_SESSION);
  }
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
  const [weeks, setWeeks]         = useState<string[]>([]);
  const [tab, setTab]             = useState<"list"|"new">("list");
  const [form, setForm]           = useState({ agentGameId: "", week: "", notes: "" });
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]         = useState("");
  const [pointsLog, setPointsLog] = useState<any[]>([]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(()=>setToast(""),3000); };

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [sess, metrics, log, weekData] = await Promise.all([
        db.getSessions(user.gameId),
        db.getCoachAgents(user.gameId),
        db.getPointsLog(user.gameId),
        db.getWeeks(),
      ]);
      setSessions(sess || []);
      setPointsLog(log || []);
      // Unique agent game_ids from weekly_metrics
      const uniqueAgents = [...new Set((metrics||[]).map((m:any) => m.game_id))] as string[];
      setAgents(uniqueAgents);
      // Unique weeks — real dates from DB
      const uniqueWeeks = [...new Set((weekData||[]).map((w:any) => w.week))] as string[];
      setWeeks(uniqueWeeks);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const submitSession = async () => {
    if (!form.agentGameId || !form.week) { showToast("Selecciona agente y semana"); return; }
    // Check duplicate for same agent+week
    const dupe = sessions.find(s => s.agent_game_id === form.agentGameId && s.week === form.week && s.status !== "cancelled");
    if (dupe) { showToast("Ya existe una sesión con ese agente esta semana"); return; }
    setSubmitting(true);
    try {
      // Find manager for this coach's project
      let managerGameId = "";
      try {
        const mgrs = await db.getManagerForProject(staffProfile.project);
        if (mgrs && mgrs.length > 0) managerGameId = mgrs[0].game_id;
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
            title: "📋 Evaluación de Coaching Session",
            message: `Tu coach ${user.gameId} registró una sesión contigo (${form.week}). Por favor responde 2 preguntas rápidas.`,
            type: "coaching_session",
            emoji: "📋",
          });
        }
      } catch(e) {}

      // Notify manager
      if (managerGameId) {
        try {
          const mgrs = await db.getManagerForProject(staffProfile.project);
          if (mgrs && mgrs[0]) {
            // Manager is staff — use staff notification or notifications table
            // For now, store in notifications by manager's staff profile id
            const mgStaff = await db.getStaffByGameId(managerGameId);
            if (mgStaff && mgStaff[0]) {
              await db.createNotif({
                recipient_id: mgStaff[0].id,
                title: "👔 Verificación de Coaching Session",
                message: `Coach ${user.gameId} registró sesión con agente ${form.agentGameId} (${form.week}). Pendiente tu verificación.`,
                type: "coaching_verify",
                emoji: "👔",
              });
            }
          }
        } catch(e) {}
      }

      showToast("Sesión registrada. Notificaciones enviadas.");
      setForm({ agentGameId:"", week:"", notes:"" });
      setTab("list");
      await load();
    } catch(e) { showToast("Error al registrar sesión"); }
    setSubmitting(false);
  };

  const totalCoins = staffProfile?.coins || 0;
  const totalPending = sessions.filter(s => s.status === "pending" || s.status === "agent_responded").length;
  const totalCompleted = sessions.filter(s => s.status === "completed").length;
  const totalPoints = pointsLog.filter(p => p.status === "approved").reduce((s:number, p:any) => s + (p.points||0), 0);

  const inp = { width:"100%", border:`1px solid ${S.border}`, borderRadius:8, padding:"9px 11px", fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box" as any, background:S.bg, color:S.text };




  return (
    <div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}>
      {toast && <div style={{position:"fixed",top:56,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:toast.includes("Error")?S.red:S.green,color:"#fff",padding:"10px 22px",borderRadius:12,fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>{toast}</div>}

      {/* Header */}
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

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[{id:"list",label:`📋 Mis Sesiones (${sessions.length})`},{id:"new",label:"➕ Nueva Sesión"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id as any)} style={{padding:"8px 14px",borderRadius:9,border:`1px solid ${tab===t.id?S.accent:S.border}`,background:tab===t.id?`${S.accent}22`:S.card,color:tab===t.id?"#a5b4fc":S.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{t.label}</button>
        ))}
      </div>

      {/* NEW SESSION FORM */}
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
            <div style={{color:S.muted,fontSize:11,marginBottom:4}}>SEMANA</div>
            <select value={form.week} onChange={e=>setForm(p=>({...p,week:e.target.value}))} style={inp}>
              <option value="">Selecciona la semana</option>
              {weeks.map(w=><option key={w} value={w}>{w}</option>)}
            </select>
            {weeks.length===0&&<div style={{color:S.muted,fontSize:11,marginTop:4}}>No hay semanas cargadas aún.</div>}
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

      {/* SESSION LIST */}
      {tab==="list" && (
        <div>
          {loading&&<div style={{textAlign:"center",color:S.muted,padding:40}}>Cargando...</div>}
          {!loading&&sessions.length===0&&(
            <SCard style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:48,marginBottom:8}}>📋</div>
              <div style={{color:S.muted}}>No has registrado sesiones aún.</div>
            </SCard>
          )}
          {sessions.map((s,i)=>{
            const meta = STATUS_META[s.status] || STATUS_META.pending;
            return(
              <SCard key={s.id} style={{marginBottom:10,borderLeft:`3px solid ${meta.color}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:16}}>{meta.emoji}</span>
                      <span style={{color:S.text,fontWeight:700,fontSize:14}}>Agente: {s.agent_game_id}</span>
                    </div>
                    <div style={{color:S.muted,fontSize:11,marginTop:2}}>Semana: {s.week} · Manager: {s.manager_game_id||"—"}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    {s.status==="completed"
                      ? <div style={{color:S.green,fontWeight:900,fontSize:16}}>+{s.points_awarded} pts</div>
                      : <div style={{color:S.yellow,fontWeight:700,fontSize:12}}>Pendiente</div>
                    }
                  </div>
                </div>
                <div style={{padding:"6px 10px",borderRadius:8,background:`${meta.color}18`,border:`1px solid ${meta.color}30`}}>
                  <span style={{color:meta.color,fontSize:11,fontWeight:700}}>{meta.label}</span>
                </div>
                {s.notes&&<div style={{color:S.muted,fontSize:11,marginTop:8,fontStyle:"italic"}}>"{s.notes}"</div>}
                {/* Agent responses if available */}
                {(s.agent_q1!==null||s.agent_q2!==null)&&(
                  <div style={{marginTop:8,display:"flex",gap:8}}>
                    <STag color={s.agent_q1?S.green:S.red}>{s.agent_q1?"✓ P1":"✗ P1"}</STag>
                    <STag color={s.agent_q2?S.green:S.red}>{s.agent_q2?"✓ P2":"✗ P2"}</STag>
                    {s.manager_confirmed!==null&&<STag color={s.manager_confirmed?S.green:S.red}>{s.manager_confirmed?"✓ Manager":"✗ Manager"}</STag>}
                  </div>
                )}
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
        // Rejected — cancel session
        await db.updateSession(session.id, {
          manager_confirmed: false,
          manager_responded_at: new Date().toISOString(),
          status: "cancelled",
        });
        showToast("Sesión rechazada.");
        await load();
        return;
      }

      // Manager confirms — update session
      const agentAlsoConfirmed = session.agent_q1 === true && session.agent_q2 === true;
      const newStatus = agentAlsoConfirmed ? "completed" : "manager_responded";

      await db.updateSession(session.id, {
        manager_confirmed: true,
        manager_responded_at: new Date().toISOString(),
        status: newStatus,
        // Don't set points_paid here — tryAwardPoints handles it
      });

      // Try to award points — only if agent also confirmed AND not already paid
      if (agentAlsoConfirmed && !session.points_paid) {
        const awarded = await tryAwardPoints(
          { ...session, manager_confirmed: true },
          user.gameId
        );
        showToast(awarded ? `✅ Sesión verificada — +${POINTS_PER_SESSION} pts para ${session.coach_game_id}` : "Sesión verificada.");
      } else if (!agentAlsoConfirmed) {
        showToast("Verificado. Esperando respuesta del agente para liberar puntos.");
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

      {/* PENDING */}
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
                {/* Agent response status */}
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

      {/* HISTORY */}
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

// ─── AGENT RESPONSE CARD (rendered inside agent notifications) ────────────────
// This is exported for use in the agent's notification screen
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
      // Update agent responses
      const updatedSession = {
        ...session,
        agent_q1: q1,
        agent_q2: q2,
        agent_responded_at: new Date().toISOString(),
        status: session.manager_confirmed !== null ? "agent_responded" : "agent_responded",
      };

      await sbFetch(`coaching_sessions?id=eq.${session.id}`, {
        method:"PATCH",
        body:JSON.stringify({
          agent_q1: q1,
          agent_q2: q2,
          agent_responded_at: new Date().toISOString(),
          status: "agent_responded",
        })
      });

      // Try to award points — only succeeds if BOTH agent AND manager have confirmed
      // and points_paid is not already true
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
        <span style={{color:C.green,fontWeight:700,fontSize:13}}>¡Gracias! Tus respuestas fueron enviadas.</span>
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

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function CoachingSessions({ user, staffProfile }) {
  const isCoach   = user?.role === "team_coach";
  const isManager = user?.role === "manager" || user?.role === "training_manager" || user?.role === "superadmin";

  if (isCoach)   return <CoachView user={user} staffProfile={staffProfile}/>;
  if (isManager) return <ManagerVerifyView user={user} staffProfile={staffProfile}/>;

  return (
    <div style={{padding:32,textAlign:"center",background:S.bg,minHeight:"80vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontSize:48,marginBottom:8}}>🔒</div>
      <div style={{color:S.muted}}>Esta sección es solo para Team Coaches y Managers.</div>
    </div>
  );
}
