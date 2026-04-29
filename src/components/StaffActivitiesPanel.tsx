// @ts-nocheck
import { useState, useEffect } from "react";

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";

async function sbFetch(path: string, options: any = {}) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: options.prefer || "return=representation",
        ...options.headers,
      },
      ...options,
    });
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  } catch { return null; }
}

// ─── Add points to staff member ───────────────────────────────────────────
async function grantStaffPoints(gameId: string, points: number, source: string, description: string, week?: string, grantedBy?: string) {
  // 1. Insert log entry
  await sbFetch("staff_points_log", {
    method: "POST", prefer: "return=minimal",
    body: JSON.stringify({
      staff_game_id: gameId, points, source, description,
      week: week || null, status: "approved",
      granted_by: grantedBy || null,
      created_at: new Date().toISOString(),
    }),
  });
  // 2. Update coins balance in staff_profiles
  const prof = await sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(gameId)}&select=coins`);
  if (prof && prof.length > 0) {
    const cur = prof[0].coins ?? 0;
    await sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(gameId)}`, {
      method: "PATCH", prefer: "return=minimal",
      body: JSON.stringify({ coins: Math.max(0, cur + points) }),
    });
  }
}

const S = {
  bg: "#0f1117", card: "#1a1d27", border: "#2a2d3e", text: "#e8eaf6",
  muted: "#64748b", accent: "#6366f1", green: "#22c55e", red: "#ef4444",
  yellow: "#f59e0b", purple: "#a855f7", gold: "#f59e0b", blue: "#3b82f6",
};

const SCard = ({ children, style = {} }: any) =>
  <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 14, padding: 16, ...style }}>{children}</div>;

const SBtn = ({ children, onClick, disabled = false, color = S.accent, sm = false, style = {} }: any) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: `${color}22`, color, border: `1px solid ${color}44`,
    borderRadius: 8, padding: sm ? "5px 10px" : "9px 18px",
    cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700,
    fontSize: sm ? 11 : 13, opacity: disabled ? 0.5 : 1,
    fontFamily: "inherit", ...style,
  }}>{children}</button>
);

// ─── Points config per activity ───────────────────────────────────────────

const ACTIVITY_DEFS: Record<string, {
  label: string; emoji: string; basePts: number; desc: string;
  roles: string[]; // which roles can submit this
  approver: string; // "manager" | "training_manager" | "superadmin"
  fields: { key: string; label: string; type: "text" | "number" | "boolean" }[];
}> = {
  // ── QA Coach ──────────────────────────────────────────────────────────
  qa_evals_complete: {
    label: "Evaluaciones QA completadas", emoji: "✅", basePts: 5,
    desc: "Completó todas las evaluaciones de calidad de la semana",
    roles: ["quality_coach"], approver: "manager",
    fields: [{ key: "week", label: "Semana", type: "text" }],
  },
  improvement_plan: {
    label: "Plan de mejora con resultados", emoji: "📈", basePts: 8,
    desc: "Propuso plan de mejora y se observó mejoría en agentes",
    roles: ["quality_coach"], approver: "manager",
    fields: [
      { key: "week", label: "Semana", type: "text" },
      { key: "agents_improved", label: "# agentes que mejoraron", type: "number" },
    ],
  },

  // ── Trainer — con o sin clase ─────────────────────────────────────────
  certification_reached: {
    label: "Certification score alcanzado", emoji: "🎓", basePts: 15,
    desc: "La clase alcanzó el score de certificación (semana 4)",
    roles: ["training_coach"], approver: "training_manager",
    fields: [
      { key: "class_name", label: "Nombre de la clase", type: "text" },
      { key: "cert_score", label: "Score obtenido (%)", type: "number" },
    ],
  },
  assessment_weekly: {
    label: "Assessment semanal ≥80% trainees", emoji: "📝", basePts: 8,
    desc: "Al menos 80% de trainees pasaron el assessment semanal",
    roles: ["training_coach"], approver: "training_manager",
    fields: [
      { key: "week", label: "Semana", type: "text" },
      { key: "pct_passed", label: "% que pasaron", type: "number" },
      { key: "trainees_total", label: "Total trainees", type: "number" },
    ],
  },
  trainer_observation: {
    label: "Observación de participación trainees", emoji: "👁️", basePts: 4,
    desc: "Training Manager observó y aprobó la sesión del trainer",
    roles: ["training_coach"], approver: "training_manager",
    fields: [{ key: "week", label: "Semana", type: "text" }],
  },
  huddle: {
    label: "Huddle meeting realizado", emoji: "🤝", basePts: 3,
    desc: "Se realizó el huddle meeting semanal",
    roles: ["training_coach"], approver: "training_manager",
    fields: [{ key: "week", label: "Semana", type: "text" }],
  },

  // ── Shared (all scorable roles) ───────────────────────────────────────
  participation: {
    label: "Participación en actividad", emoji: "🎪", basePts: 3,
    desc: "Participó en una actividad especial del equipo",
    roles: ["team_coach", "quality_coach", "training_coach"], approver: "manager",
    fields: [{ key: "activity_name", label: "Nombre de la actividad", type: "text" }],
  },
  of_the_month: {
    label: "Coach / QA / Trainer del Mes 🏆", emoji: "🏆", basePts: 20,
    desc: "Reconocimiento mensual por desempeño sobresaliente",
    roles: ["team_coach", "quality_coach", "training_coach"], approver: "superadmin",
    fields: [{ key: "month", label: "Mes (ej: April 2026)", type: "text" }],
  },
  custom_bonus: {
    label: "Bono especial manual", emoji: "💰", basePts: 0,
    desc: "Puntos especiales otorgados por SA o Manager",
    roles: ["team_coach", "quality_coach", "training_coach"], approver: "superadmin",
    fields: [
      { key: "reason", label: "Motivo del bono", type: "text" },
      { key: "custom_pts", label: "Puntos a otorgar", type: "number" },
    ],
  },
};

const ROLE_LABEL: Record<string, string> = {
  team_coach: "Team Coach", quality_coach: "QA Coach",
  training_coach: "Trainer", manager: "Manager",
  training_manager: "Training Manager", superadmin: "Super Admin",
};

const inp: any = {
  width: "100%", background: "#0f172a", border: `1px solid ${S.border}`,
  borderRadius: 8, padding: "9px 12px", color: S.text,
  fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

// ─── SUBMIT PANEL — for Team Coach, QA Coach, Trainer ────────────────────

function SubmitActivityForm({ user, onSubmitted }: { user: any; onSubmitted: () => void }) {
  const myActivities = Object.entries(ACTIVITY_DEFS).filter(([, def]) => def.roles.includes(user.role));
  const [selectedKey, setSelectedKey] = useState(myActivities[0]?.[0] || "");
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  const def = ACTIVITY_DEFS[selectedKey];

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const handleSubmit = async () => {
    if (!def) return;
    // Validate required fields
    for (const f of def.fields) {
      if (!fieldValues[f.key] && fieldValues[f.key] !== 0) {
        showToast(`Completa el campo: ${f.label}`); return;
      }
    }
    setLoading(true);
    try {
      await sbFetch("staff_activities", {
        method: "POST", prefer: "return=minimal",
        body: JSON.stringify({
          staff_game_id: user.gameId || user.game_id,
          activity_type: selectedKey,
          week: fieldValues.week || null,
          description: `${def.emoji} ${def.label}${fieldValues.activity_name ? ` — ${fieldValues.activity_name}` : ""}${fieldValues.class_name ? ` — ${fieldValues.class_name}` : ""}`,
          result: fieldValues,
          points_awarded: selectedKey === "custom_bonus" ? (Number(fieldValues.custom_pts) || 0) : def.basePts,
          status: "pending",
          submitted_by: user.gameId || user.game_id,
          created_at: new Date().toISOString(),
        }),
      });
      showToast("✅ Actividad enviada — pendiente de aprobación");
      setFieldValues({});
      onSubmitted();
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  return (
    <SCard style={{ marginBottom: 16 }}>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "12px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13,
          background: toast.startsWith("✅") ? "#052e16" : "#2d1515",
          border: `1px solid ${toast.startsWith("✅") ? "#14532d" : "#7f1d1d"}`,
          color: toast.startsWith("✅") ? S.green : S.red,
        }}>{toast}</div>
      )}

      <div style={{ color: S.muted, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>
        REGISTRAR ACTIVIDAD
      </div>

      {/* Activity selector */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: S.muted, fontSize: 11, marginBottom: 5 }}>TIPO DE ACTIVIDAD</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {myActivities.map(([key, d]) => (
            <div key={key} onClick={() => { setSelectedKey(key); setFieldValues({}); }}
              style={{
                padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${selectedKey === key ? S.accent : S.border}`,
                background: selectedKey === key ? `${S.accent}18` : "#0a1020",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
              <div>
                <span style={{ fontSize: 16, marginRight: 8 }}>{d.emoji}</span>
                <span style={{ color: S.text, fontWeight: 600, fontSize: 13 }}>{d.label}</span>
                <div style={{ color: S.muted, fontSize: 11, marginTop: 2, marginLeft: 24 }}>{d.desc}</div>
              </div>
              <span style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                background: `${S.green}22`, color: S.green, flexShrink: 0, marginLeft: 10,
              }}>
                +{key === "custom_bonus" ? "?" : d.basePts} pts
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic fields */}
      {def && def.fields.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {def.fields.map(f => (
            <div key={f.key}>
              <div style={{ color: S.muted, fontSize: 11, marginBottom: 4 }}>{f.label.toUpperCase()}</div>
              <input
                style={inp}
                type={f.type === "number" ? "number" : "text"}
                value={fieldValues[f.key] ?? ""}
                onChange={e => setFieldValues(p => ({ ...p, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value }))}
                placeholder={f.label}
              />
            </div>
          ))}
        </div>
      )}

      <SBtn onClick={handleSubmit} disabled={loading} color={S.accent} style={{ width: "100%", padding: 11 }}>
        {loading ? "Enviando..." : `Enviar para aprobación`}
      </SBtn>
    </SCard>
  );
}

// ─── MY ACTIVITIES — history for the staff member ─────────────────────────

function MyActivities({ gameId }: { gameId: string }) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [gameId]);

  const load = async () => {
    setLoading(true);
    const data = await sbFetch(`staff_activities?staff_game_id=eq.${encodeURIComponent(gameId)}&order=created_at.desc&limit=50`);
    setActivities(data || []);
    setLoading(false);
  };

  const STATUS_META: Record<string, { label: string; color: string }> = {
    pending: { label: "Pendiente", color: S.yellow },
    approved: { label: "Aprobado", color: S.green },
    rejected: { label: "Rechazado", color: S.red },
  };

  return (
    <SCard>
      <div style={{ color: S.muted, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>
        MIS ACTIVIDADES
      </div>
      {loading && <div style={{ color: S.muted, textAlign: "center", padding: 20 }}>Cargando...</div>}
      {!loading && activities.length === 0 && (
        <div style={{ color: S.muted, textAlign: "center", padding: 20, fontSize: 13 }}>
          No has registrado actividades aún.
        </div>
      )}
      {activities.map((a, i) => {
        const sm = STATUS_META[a.status] || STATUS_META.pending;
        const def = ACTIVITY_DEFS[a.activity_type];
        return (
          <div key={a.id || i} style={{
            padding: "10px 12px", borderRadius: 10, marginBottom: 8,
            background: "#0a1020", border: `1px solid ${S.border}`,
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: S.text, fontWeight: 600, fontSize: 13 }}>
                {def?.emoji || "•"} {def?.label || a.activity_type}
              </div>
              {a.week && <div style={{ color: S.muted, fontSize: 11, marginTop: 2 }}>Semana: {a.week}</div>}
              <div style={{ color: S.muted, fontSize: 10, marginTop: 2 }}>
                {new Date(a.created_at).toLocaleDateString("es-MX")}
                {a.approved_by && <span> · Aprobado por: {a.approved_by}</span>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${sm.color}22`, color: sm.color }}>
                {sm.label}
              </span>
              {a.status === "approved" && (
                <span style={{ color: S.green, fontWeight: 700, fontSize: 13 }}>+{a.points_awarded} pts</span>
              )}
            </div>
          </div>
        );
      })}
    </SCard>
  );
}

// ─── APPROVAL PANEL — for Manager / Training Manager ─────────────────────

function ApprovalPanel({ approver }: { approver: any }) {
  const [pending, setPending] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [historyTab, setHistoryTab] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const isTrainingManager = approver.role === "training_manager";
  const isSA = approver.role === "superadmin";

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const load = async () => {
    setLoading(true);
    const [acts, st] = await Promise.all([
      sbFetch("staff_activities?order=created_at.desc&limit=200"),
      sbFetch("staff_profiles?select=game_id,full_name,role,project&order=full_name.asc"),
    ]);
    const allActs = acts || [];
    const allStaff = st || [];
    setStaff(allStaff);

    // Filter: each approver sees activities they're responsible for
    const filteredPending = allActs.filter((a: any) => {
      const def = ACTIVITY_DEFS[a.activity_type];
      if (!def) return false;
      if (a.status !== "pending") return false;
      if (isSA) return def.approver === "superadmin" || def.approver === "manager" || def.approver === "training_manager";
      if (isTrainingManager) return def.approver === "training_manager";
      return def.approver === "manager"; // regular manager
    });

    const filteredHistory = allActs.filter((a: any) => {
      const def = ACTIVITY_DEFS[a.activity_type];
      if (!def) return false;
      if (a.status === "pending") return false;
      if (isSA) return true;
      if (isTrainingManager) return def.approver === "training_manager";
      return def.approver === "manager";
    });

    setPending(filteredPending);
    setHistory(filteredHistory.slice(0, 50));
    setLoading(false);
  };

  const handleApprove = async (act: any) => {
    setActionId(act.id);
    const def = ACTIVITY_DEFS[act.activity_type];
    const pts = act.points_awarded;

    try {
      // 1. Update activity status
      await sbFetch(`staff_activities?id=eq.${act.id}`, {
        method: "PATCH", prefer: "return=minimal",
        body: JSON.stringify({
          status: "approved",
          approved_by: approver.gameId || approver.game_id,
          approved_at: new Date().toISOString(),
        }),
      });

      // 2. Grant points
      await grantStaffPoints(
        act.staff_game_id,
        pts,
        "manual_bonus",
        `${def?.emoji || ""} ${def?.label || act.activity_type}${act.week ? ` — ${act.week}` : ""}`,
        act.week || undefined,
        approver.gameId || approver.game_id,
      );

      showToast(`✅ Aprobado — +${pts} pts para ${act.staff_game_id}`);
      load();
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    }
    setActionId(null);
  };

  const handleReject = async (act: any) => {
    setActionId(act.id);
    try {
      await sbFetch(`staff_activities?id=eq.${act.id}`, {
        method: "PATCH", prefer: "return=minimal",
        body: JSON.stringify({
          status: "rejected",
          approved_by: approver.gameId || approver.game_id,
          approved_at: new Date().toISOString(),
        }),
      });
      showToast("Actividad rechazada.");
      load();
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    }
    setActionId(null);
  };

  const getStaffInfo = (gameId: string) => staff.find(s => s.game_id === gameId);

  return (
    <div style={{ paddingBottom: 80 }}>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "12px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13,
          background: toast.startsWith("✅") ? "#052e16" : "#2d1515",
          border: `1px solid ${toast.startsWith("✅") ? "#14532d" : "#7f1d1d"}`,
          color: toast.startsWith("✅") ? S.green : S.red,
        }}>{toast}</div>
      )}

      {/* Header */}
      <SCard style={{ marginBottom: 14, background: "linear-gradient(135deg,#1e1b4b,#312e81)", border: "none" }}>
        <div style={{ fontSize: 24, marginBottom: 4 }}>⚡</div>
        <div style={{ color: S.text, fontWeight: 800, fontSize: 16 }}>Panel de Aprobación</div>
        <div style={{ color: "#a5b4fc", fontSize: 12, marginTop: 2 }}>
          {isTrainingManager ? "Training Manager — aprueba actividades de Trainers" : isSA ? "Super Admin — todas las actividades" : "Manager — aprueba actividades de Team Coach y QA Coach"}
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
            <div style={{ color: S.yellow, fontWeight: 900, fontSize: 20 }}>{pending.length}</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>Pendientes</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
            <div style={{ color: S.green, fontWeight: 900, fontSize: 20 }}>{history.filter(h => h.status === "approved").length}</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>Aprobadas</div>
          </div>
        </div>
      </SCard>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[
          { id: false, label: `⏳ Pendientes (${pending.length})` },
          { id: true, label: "📋 Historial" },
        ].map(t => (
          <button key={String(t.id)} onClick={() => setHistoryTab(t.id)}
            style={{
              padding: "8px 16px", borderRadius: 9, fontWeight: 700, fontSize: 12,
              border: `1px solid ${historyTab === t.id ? S.accent : S.border}`,
              background: historyTab === t.id ? `${S.accent}22` : S.card,
              color: historyTab === t.id ? "#a5b4fc" : S.muted,
              cursor: "pointer", fontFamily: "inherit",
            }}>{t.label}</button>
        ))}
      </div>

      {loading && <div style={{ color: S.muted, textAlign: "center", padding: 40 }}>Cargando...</div>}

      {/* Pending approvals */}
      {!loading && !historyTab && (
        <>
          {pending.length === 0 && (
            <SCard style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
              <div style={{ color: S.muted, fontSize: 13 }}>No hay actividades pendientes de aprobación.</div>
            </SCard>
          )}
          {pending.map((act, i) => {
            const def = ACTIVITY_DEFS[act.activity_type];
            const staffInfo = getStaffInfo(act.staff_game_id);
            const isProcessing = actionId === act.id;
            return (
              <SCard key={act.id || i} style={{ marginBottom: 10, borderLeft: `3px solid ${S.yellow}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>{def?.emoji || "•"}</span>
                      <span style={{ color: S.text, fontWeight: 700, fontSize: 14 }}>{def?.label || act.activity_type}</span>
                      <span style={{ padding: "1px 7px", borderRadius: 4, background: `${S.accent}22`, color: S.accent, fontSize: 10, fontWeight: 700 }}>
                        +{act.points_awarded} pts
                      </span>
                    </div>
                    <div style={{ color: S.muted, fontSize: 12, marginBottom: 2 }}>
                      <strong style={{ color: "#c7d2fe" }}>{act.staff_game_id}</strong>
                      {staffInfo && <span> · {ROLE_LABEL[staffInfo.role]} · {staffInfo.project}</span>}
                    </div>
                    {act.week && <div style={{ color: S.muted, fontSize: 11 }}>Semana: {act.week}</div>}
                    {/* Show submitted result fields */}
                    {act.result && Object.keys(act.result).length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {Object.entries(act.result).map(([k, v]: any) => (
                          <span key={k} style={{ background: "#0a1020", border: `1px solid ${S.border}`, borderRadius: 4, padding: "2px 7px", fontSize: 10, color: S.muted }}>
                            {k}: <strong style={{ color: S.text }}>{v}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ color: S.muted, fontSize: 10, marginTop: 4 }}>
                      {new Date(act.created_at).toLocaleString("es-MX")}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <SBtn onClick={() => handleApprove(act)} disabled={isProcessing} color={S.green} sm>
                    {isProcessing ? "..." : `✅ Aprobar (+${act.points_awarded} pts)`}
                  </SBtn>
                  <SBtn onClick={() => handleReject(act)} disabled={isProcessing} color={S.red} sm>
                    {isProcessing ? "..." : "✕ Rechazar"}
                  </SBtn>
                </div>
              </SCard>
            );
          })}
        </>
      )}

      {/* History */}
      {!loading && historyTab && (
        <>
          {history.length === 0 && (
            <SCard style={{ textAlign: "center", padding: 30 }}>
              <div style={{ color: S.muted, fontSize: 13 }}>Sin historial aún.</div>
            </SCard>
          )}
          {history.map((act, i) => {
            const def = ACTIVITY_DEFS[act.activity_type];
            const approved = act.status === "approved";
            return (
              <SCard key={act.id || i} style={{ marginBottom: 8, opacity: approved ? 1 : 0.6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ color: S.text, fontWeight: 600, fontSize: 13 }}>
                      {def?.emoji} {act.staff_game_id} — {def?.label || act.activity_type}
                    </div>
                    <div style={{ color: S.muted, fontSize: 11, marginTop: 2 }}>
                      {act.approved_by && `Por: ${act.approved_by} · `}
                      {new Date(act.approved_at || act.created_at).toLocaleDateString("es-MX")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                      background: `${approved ? S.green : S.red}22`,
                      color: approved ? S.green : S.red,
                    }}>{approved ? "Aprobado" : "Rechazado"}</span>
                    {approved && <div style={{ color: S.green, fontWeight: 700, fontSize: 13, marginTop: 2 }}>+{act.points_awarded} pts</div>}
                  </div>
                </div>
              </SCard>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── AUTO KPI PANEL — shows auto-calculated points from Excel ─────────────

function AutoKpiPanel({ gameId }: { gameId: string }) {
  const [kpiLogs, setKpiLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [gameId]);

  const load = async () => {
    setLoading(true);
    const data = await sbFetch(`staff_points_log?staff_game_id=eq.${encodeURIComponent(gameId)}&source=eq.auto_kpi&order=created_at.desc&limit=20`);
    setKpiLogs(data || []);
    setLoading(false);
  };

  return (
    <SCard>
      <div style={{ color: S.muted, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>
        PUNTOS AUTOMÁTICOS (EXCEL)
      </div>
      <div style={{ color: S.muted, fontSize: 12, marginBottom: 10 }}>
        Calculados automáticamente al subir el Excel semanal
      </div>
      {loading && <div style={{ color: S.muted, textAlign: "center", padding: 16 }}>Cargando...</div>}
      {!loading && kpiLogs.length === 0 && (
        <div style={{ color: S.muted, textAlign: "center", padding: 16, fontSize: 12 }}>
          Sin puntos automáticos aún. Se generan al subir el Excel.
        </div>
      )}
      {kpiLogs.map((log, i) => (
        <div key={log.id || i} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "8px 0", borderBottom: i < kpiLogs.length - 1 ? `1px solid ${S.border}` : "none",
        }}>
          <div>
            <div style={{ color: S.text, fontSize: 13, fontWeight: 600 }}>📊 {log.description}</div>
            <div style={{ color: S.muted, fontSize: 10, marginTop: 2 }}>
              {log.week} · {new Date(log.created_at).toLocaleDateString("es-MX")}
            </div>
          </div>
          <span style={{ color: log.points >= 0 ? S.green : S.red, fontWeight: 700, fontSize: 14 }}>
            {log.points >= 0 ? "+" : ""}{log.points} pts
          </span>
        </div>
      ))}
    </SCard>
  );
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────

export default function StaffActivitiesPanel({ user }: { user: any }) {
  const role = user?.role;
  const gameId = user?.gameId || user?.game_id;
  const [refreshKey, setRefreshKey] = useState(0);

  const isApprover = ["manager", "training_manager", "superadmin"].includes(role);
  const isScored = ["team_coach", "quality_coach", "training_coach"].includes(role);

  const [tab, setTab] = useState<"submit" | "mine" | "approve">(
    isApprover ? "approve" : "submit"
  );

  const tabs = [
    ...(isScored ? [
      { id: "submit", label: "📤 Registrar actividad" },
      { id: "mine", label: "📋 Mis actividades" },
      { id: "kpi", label: "📊 Puntos automáticos" },
    ] : []),
    ...(isApprover ? [{ id: "approve", label: `⚡ Aprobaciones` }] : []),
  ];

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            style={{
              padding: "8px 14px", borderRadius: 9, fontWeight: 700, fontSize: 12,
              border: `1px solid ${tab === t.id ? S.accent : S.border}`,
              background: tab === t.id ? `${S.accent}22` : S.card,
              color: tab === t.id ? "#a5b4fc" : S.muted,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}>{t.label}</button>
        ))}
      </div>

      {tab === "submit" && isScored && (
        <SubmitActivityForm user={user} onSubmitted={() => setRefreshKey(k => k + 1)} />
      )}
      {tab === "mine" && isScored && (
        <MyActivities key={refreshKey} gameId={gameId} />
      )}
      {tab === "kpi" && isScored && (
        <AutoKpiPanel gameId={gameId} />
      )}
      {tab === "approve" && isApprover && (
        <ApprovalPanel approver={user} />
      )}

      {!isScored && !isApprover && (
        <SCard style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
          <div style={{ color: S.muted }}>Tu rol no tiene actividades de scoring configuradas.</div>
        </SCard>
      )}
    </div>
  );
}
