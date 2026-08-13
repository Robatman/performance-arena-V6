// @ts-nocheck
import { useState, useEffect } from "react";

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";

async function sbFetch(path: string, options: any = {}) {
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
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

type ReferralStatus =
  // Contacto
  | "pending"              // legacy — treated as pending_contact
  | "pending_contact"      // Pendiente de contacto
  | "no_response"          // No responde (sub)
  // Proceso
  | "in_process"           // En proceso
  | "interview_scheduled"  // Entrevista agendada (sub)
  | "no_show"              // No Show
  | "pending_response"     // Pendiente de respuesta (sub)
  // Resultado
  | "hired"                // Contratado
  | "not_hired"            // No contratado
  | "waiting_list"         // WL / sin clase disponible
  | "rejected";            // legacy — treated as not_hired

interface Referral {
  id: string;
  referred_by_game_id: string;
  referred_by_name?: string;
  referred_name: string;
  referred_phone?: string;
  referred_email?: string;
  status: ReferralStatus;
  submitted_at: string;
  resolved_at?: string;
  notes?: string;
  pts_awarded: number;
}

const STATUS_CONFIG: Record<string, { label: string; stage: string; color: string; bg: string }> = {
  pending:             { label: "Pendiente de contacto",    stage: "contacto",  color: "#fbbf24", bg: "#2d2000" },
  pending_contact:     { label: "Pendiente de contacto",    stage: "contacto",  color: "#fbbf24", bg: "#2d2000" },
  no_response:         { label: "No responde",              stage: "contacto",  color: "#f97316", bg: "#431407" },
  in_process:          { label: "En proceso",               stage: "proceso",   color: "#60a5fa", bg: "#0c2240" },
  interview_scheduled: { label: "Entrevista agendada",      stage: "proceso",   color: "#a78bfa", bg: "#1e1b4b" },
  no_show:             { label: "No Show",                  stage: "proceso",   color: "#fb923c", bg: "#2d1500" },
  pending_response:    { label: "Pendiente de respuesta",   stage: "proceso",   color: "#facc15", bg: "#2d2000" },
  hired:               { label: "Contratado",               stage: "resultado", color: "#4ade80", bg: "#052e16" },
  not_hired:           { label: "No contratado",            stage: "resultado", color: "#f87171", bg: "#2d1515" },
  waiting_list:        { label: "WL / sin clase",           stage: "resultado", color: "#94a3b8", bg: "#1e293b" },
  rejected:            { label: "No avanzó",                stage: "resultado", color: "#f87171", bg: "#2d1515" },
};

const STAGES = [
  { id: "contacto",  label: "Contacto",  color: "#fbbf24", icon: "📞" },
  { id: "proceso",   label: "Proceso",   color: "#60a5fa", icon: "⚙️" },
  { id: "resultado", label: "Resultado", color: "#4ade80", icon: "🏁" },
];

// 6 main admin action buttons
const MAIN_STATUSES: ReferralStatus[] = [
  "pending_contact", "in_process", "no_show", "waiting_list", "hired", "not_hired",
];

// 3 sub-status buttons (secondary row)
const SUB_STATUSES: ReferralStatus[] = [
  "no_response", "interview_scheduled", "pending_response",
];

// Agent sees a CTA for these
const CTA_STATUSES = new Set(["waiting_list", "pending_response"]);

const FINAL_STATUSES = new Set(["hired", "not_hired", "waiting_list", "rejected"]);

function getStage(status: string) {
  return STATUS_CONFIG[status]?.stage ?? "contacto";
}

function getNotifMsg(name: string, status: ReferralStatus): string {
  switch (status) {
    case "in_process":          return `Tu referido ${name} está en proceso de selección.`;
    case "interview_scheduled": return `Tu referido ${name} tiene una entrevista agendada. ¡Buenas noticias!`;
    case "no_show":             return `Tu referido ${name} no se presentó a su entrevista (No Show).`;
    case "hired":               return `¡Tu referido ${name} fue contratado! +4 coins acreditados (total 5 por este referido).`;
    case "not_hired":           return `Tu referido ${name} no avanzó en el proceso. Gracias por participar.`;
    case "waiting_list":        return `Tu referido ${name} está en lista de espera / sin clase disponible.`;
    default:                    return "";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function addCoinsToAgent(gameId: string, amount: number, reason: string) {
  const profile = await sbFetch(
    `profiles?game_id=eq.${encodeURIComponent(gameId)}&select=coins`
  );
  if (!profile || profile.length === 0) return;
  const currentCoins = profile[0].coins ?? 0;
  await sbFetch(`profiles?game_id=eq.${encodeURIComponent(gameId)}`, {
    method: "PATCH",
    body: JSON.stringify({ coins: currentCoins + amount }),
  });
  await sbFetch("coins_log", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({ game_id: gameId, amount, reason, created_at: new Date().toISOString() }),
  }).catch(() => {});
}

async function sendNotification(gameId: string, message: string) {
  try {
    const profiles = await sbFetch(`profiles?game_id=eq.${encodeURIComponent(gameId)}&select=id`);
    if (!profiles || !profiles[0]) return;
    await sbFetch("notifications", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({
        recipient_id: profiles[0].id,
        message,
        title: "Actualización de referido",
        type: "referral",
        is_read: false,
        created_at: new Date().toISOString(),
      }),
    });
  } catch {}
}

// ──────────────────────────────────────────────────────────────────────────────

export default function ReferralsPanel({
  isAdmin = false,
  currentUser,
}: {
  isAdmin?: boolean;
  currentUser?: { game_id: string; username: string };
}) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<"all" | "contacto" | "proceso" | "resultado">("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRef, setNewRef] = useState({
    referred_name: "",
    referred_phone: "",
    referred_email: "",
    notes: "",
  });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const currentGameId = currentUser?.game_id || localStorage.getItem("game_id") || "";

  useEffect(() => { fetchReferrals(); }, []);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchReferrals = async () => {
    setLoading(true);
    try {
      const q = isAdmin
        ? "referrals?select=*&order=submitted_at.desc"
        : `referrals?referred_by_game_id=eq.${currentGameId}&select=*&order=submitted_at.desc`;
      const data = await sbFetch(q);
      setReferrals(
        (data || []).map((r: any) => ({
          ...r,
          referred_by_name: r.profiles?.username || r.referred_by_game_id,
        }))
      );
    } catch {
      setReferrals([]);
    }
    setLoading(false);
  };

  // ── Registrar nuevo referido (+1 coin inmediato) ───────────────────────────
  const handleSubmitReferral = async () => {
    if (!newRef.referred_name.trim()) { showToast("El nombre es obligatorio.", "error"); return; }
    if (!currentGameId)               { showToast("No se encontró tu Game ID. Vuelve a iniciar sesión.", "error"); return; }
    setActionLoading("new");
    try {
      const today = new Date().toISOString().split("T")[0];
      const todayRefs = referrals.filter(r => (r.submitted_at || "").split("T")[0] === today);
      if (todayRefs.length >= 3) { showToast("Límite de 3 referidos por día alcanzado.", "error"); setActionLoading(null); return; }
      const dupName = referrals.find(r =>
        r.referred_name.trim().toLowerCase() === newRef.referred_name.trim().toLowerCase()
      );
      if (dupName) { showToast(`Ya enviaste un referido con ese nombre.`, "error"); setActionLoading(null); return; }

      await sbFetch("referrals", {
        method: "POST",
        body: JSON.stringify({
          referred_by_game_id: currentGameId,
          referred_name: newRef.referred_name.trim(),
          referred_phone: newRef.referred_phone.trim() || null,
          referred_email: newRef.referred_email.trim() || null,
          status: "pending_contact",
          pts_awarded: 1,
          notes: newRef.notes.trim() || null,
          submitted_at: new Date().toISOString(),
        }),
      });

      await addCoinsToAgent(currentGameId, 1, `Referido enviado: ${newRef.referred_name.trim()}`);
      showToast("Referido registrado — +1 coin acreditado", "success");
      setNewRef({ referred_name: "", referred_phone: "", referred_email: "", notes: "" });
      setShowAddForm(false);
      fetchReferrals();
    } catch (e: any) {
      showToast(`Error: ${e.message}`, "error");
    }
    setActionLoading(null);
  };

  // ── Admin: actualizar estado ───────────────────────────────────────────────
  const handleUpdateStatus = async (ref: Referral, newStatus: ReferralStatus) => {
    if (ref.status === newStatus) return;
    setActionLoading(ref.id + newStatus);
    try {
      const patch: any = { status: newStatus };
      if (FINAL_STATUSES.has(newStatus)) patch.resolved_at = new Date().toISOString();

      const isNewlyHired = newStatus === "hired" && ref.pts_awarded < 5;
      if (isNewlyHired) patch.pts_awarded = 5;

      await sbFetch(`referrals?id=eq.${ref.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });

      if (isNewlyHired) {
        await addCoinsToAgent(ref.referred_by_game_id, 4, `Referido contratado: ${ref.referred_name}`);
      }

      const msg = getNotifMsg(ref.referred_name, newStatus);
      if (msg) await sendNotification(ref.referred_by_game_id, msg);

      showToast(
        isNewlyHired
          ? `Contratado — +4 coins para ${ref.referred_by_name || ref.referred_by_game_id}`
          : `Estado: ${STATUS_CONFIG[newStatus]?.label}`,
        "success"
      );
      fetchReferrals();
    } catch (e: any) {
      showToast(`Error: ${e.message}`, "error");
    }
    setActionLoading(null);
  };

  // ── Filtros ────────────────────────────────────────────────────────────────
  const filtered = referrals.filter((r) => {
    const matchF = stageFilter === "all" || getStage(r.status) === stageFilter;
    const matchS =
      search === "" ||
      r.referred_name.toLowerCase().includes(search.toLowerCase()) ||
      (r.referred_by_name || "").toLowerCase().includes(search.toLowerCase());
    return matchF && matchS;
  });

  const counts = {
    all:       referrals.length,
    contacto:  referrals.filter(r => getStage(r.status) === "contacto").length,
    proceso:   referrals.filter(r => getStage(r.status) === "proceso").length,
    resultado: referrals.filter(r => getStage(r.status) === "resultado").length,
  };

  const totalCoinsAwarded = referrals.reduce((a, r) => a + r.pts_awarded, 0);

  const inp: React.CSSProperties = {
    width: "100%", border: "1px solid #1e3a5f", borderRadius: 6,
    padding: "9px 12px", color: "#e2e8f0", fontSize: 14, outline: "none",
    background: "#0f172a", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto", position: "relative", paddingBottom: 100 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "12px 20px", borderRadius: 8, border: "1px solid",
          fontWeight: 600, fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          background: toast.type === "success" ? "#052e16" : "#2d1515",
          borderColor: toast.type === "success" ? "#14532d" : "#7f1d1d",
          color: toast.type === "success" ? "#4ade80" : "#f87171",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
            Panel de Referidos
          </h2>
          <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
            {isAdmin
              ? `${counts.contacto} en contacto · ${counts.proceso} en proceso · ${counts.resultado} resueltos`
              : `Tus referidos — ${counts.all} registrados`}
          </p>
        </div>
        {!isAdmin && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{ background: "#1d4ed8", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}
          >
            + Registrar referido
          </button>
        )}
      </div>

      {/* Flujo de etapas (info visual) */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        background: "#0c1a2e", border: "1px solid #1e3a5f", borderRadius: 10, padding: "10px 16px",
        marginBottom: 16, overflowX: "auto",
      }}>
        {STAGES.map((st, i) => (
          <div key={st.id} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16 }}>{st.icon}</span>
              <div>
                <div style={{ color: st.color, fontWeight: 700, fontSize: 12 }}>{st.label}</div>
                <div style={{ color: "#475569", fontSize: 10 }}>
                  {st.id === "contacto"  && "Pendiente · No responde"}
                  {st.id === "proceso"   && "En proceso · Entrevista · No Show · P. respuesta"}
                  {st.id === "resultado" && "Contratado · No contratado · WL/sin clase"}
                </div>
              </div>
            </div>
            {i < STAGES.length - 1 && (
              <span style={{ color: "#334155", margin: "0 12px", fontSize: 18 }}>→</span>
            )}
          </div>
        ))}
      </div>

      {/* Formulario nuevo referido */}
      {showAddForm && (
        <div style={{ background: "#0c2240", border: "1px solid #1e3a5f", borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <h3 style={{ color: "#93c5fd", fontWeight: 700, margin: "0 0 14px" }}>Nuevo Referido</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[
              { l: "Nombre completo *", k: "referred_name", p: "Juan García" },
              { l: "Teléfono", k: "referred_phone", p: "555-1234" },
              { l: "Email", k: "referred_email", p: "juan@email.com" },
              { l: "Notas", k: "notes", p: "Ex-compañero de trabajo..." },
            ].map((f) => (
              <div key={f.k}>
                <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>{f.l}</div>
                <input
                  style={inp}
                  placeholder={f.p}
                  value={(newRef as any)[f.k]}
                  onChange={(e) => setNewRef((p) => ({ ...p, [f.k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>
              Al enviar recibirás <b style={{ color: "#60a5fa" }}>+1 coin</b>. Si es contratado el equipo de reclutamiento aprobará{" "}
              <b style={{ color: "#4ade80" }}>+4 coins</b> adicionales (total 5).
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowAddForm(false)}
                style={{ background: "transparent", color: "#94a3b8", border: "1px solid #334155", padding: "9px 18px", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitReferral}
                disabled={actionLoading === "new"}
                style={{ background: "#1d4ed8", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 13, opacity: actionLoading === "new" ? 0.6 : 1 }}
              >
                {actionLoading === "new" ? "Enviando..." : "Registrar (+1 coin)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs de filtro por etapa + contador de coins */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {([
          { id: "all",       label: "Todos",     icon: "📋" },
          { id: "contacto",  label: "Contacto",  icon: "📞" },
          { id: "proceso",   label: "Proceso",   icon: "⚙️" },
          { id: "resultado", label: "Resultado", icon: "🏁" },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStageFilter(tab.id)}
            style={{
              background: stageFilter === tab.id ? "#0c2240" : "#1e293b",
              border: `1px solid ${stageFilter === tab.id ? "#3b82f6" : "#334155"}`,
              borderRadius: 10, padding: "10px 16px",
              display: "flex", flexDirection: "column", alignItems: "center",
              cursor: "pointer", minWidth: 76,
            }}
          >
            <span style={{ fontSize: 18, marginBottom: 2 }}>{tab.icon}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#60a5fa" }}>{counts[tab.id]}</span>
            <span style={{ fontSize: 10, color: "#64748b" }}>{tab.label}</span>
          </button>
        ))}
        <div style={{
          marginLeft: "auto", background: "#1e293b", border: "1px solid #334155",
          borderRadius: 10, padding: "10px 16px", display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#4ade80" }}>{totalCoinsAwarded}</span>
          <span style={{ fontSize: 10, color: "#64748b" }}>Coins entregados</span>
        </div>
      </div>

      {/* Búsqueda */}
      <input
        style={{ ...inp, marginBottom: 14 }}
        placeholder="Buscar por nombre o agente..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Tabla */}
      {loading ? (
        <div style={{ color: "#64748b", padding: 40, textAlign: "center" }}>Cargando referidos...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "#475569", padding: 40, textAlign: "center" }}>No hay referidos que coincidan.</div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #1e3a5f" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {(isAdmin
                  ? ["Referido por", "Candidato", "Contacto", "Fecha", "Etapa / Estado", "Coins", "Gestionar estado"]
                  : ["Candidato", "Contacto", "Fecha", "Etapa / Estado", "Coins"]
                ).map((h) => (
                  <th key={h} style={{ background: "#0c2240", color: "#93c5fd", fontWeight: 600, padding: "10px 14px", textAlign: "left", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const sc = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
                const stage = sc.stage;
                const stageIdx = STAGES.findIndex(s => s.id === stage);
                const showCTA = !isAdmin && CTA_STATUSES.has(r.status);

                return (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? "#0f172a" : "#0c1a2e", verticalAlign: "top" }}>

                    {/* Referido por (admin only) */}
                    {isAdmin && (
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{r.referred_by_name}</span>
                        <br />
                        <span style={{ color: "#475569", fontSize: 11 }}>{r.referred_by_game_id}</span>
                      </td>
                    )}

                    {/* Candidato */}
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{r.referred_name}</span>
                      {r.notes && (
                        <>
                          <br />
                          <span style={{ color: "#475569", fontSize: 11 }}>{r.notes}</span>
                        </>
                      )}
                    </td>

                    {/* Contacto */}
                    <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>
                      {r.referred_phone || "-"}
                      {r.referred_email && (
                        <>
                          <br />
                          {r.referred_email}
                        </>
                      )}
                    </td>

                    {/* Fechas */}
                    <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 12, whiteSpace: "nowrap" }}>
                      {new Date(r.submitted_at).toLocaleDateString("es-MX")}
                      {r.resolved_at && (
                        <>
                          <br />
                          <span style={{ color: "#475569" }}>
                            → {new Date(r.resolved_at).toLocaleDateString("es-MX")}
                          </span>
                        </>
                      )}
                    </td>

                    {/* Etapa / Estado */}
                    <td style={{ padding: "10px 14px", minWidth: 180 }}>
                      {/* Stage progress dots */}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                        {STAGES.map((st, si) => (
                          <div key={st.id} style={{ display: "flex", alignItems: "center" }}>
                            <div style={{
                              width: 10, height: 10, borderRadius: "50%",
                              background: si <= stageIdx ? st.color : "#1e293b",
                              border: `2px solid ${si <= stageIdx ? st.color : "#334155"}`,
                            }} />
                            {si < STAGES.length - 1 && (
                              <div style={{ width: 20, height: 2, background: si < stageIdx ? "#334155" : "#1e293b" }} />
                            )}
                          </div>
                        ))}
                        <span style={{ color: "#475569", fontSize: 10, marginLeft: 4 }}>
                          {STAGES[stageIdx]?.label}
                        </span>
                      </div>
                      {/* Status badge */}
                      <span style={{
                        padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                        border: "1px solid", background: sc.bg, color: sc.color,
                        borderColor: sc.color + "44", display: "inline-block",
                      }}>
                        {sc.label}
                      </span>
                      {/* CTA for agents */}
                      {showCTA && (
                        <div style={{
                          marginTop: 6, padding: "6px 8px", borderRadius: 6,
                          background: "#1e293b", border: "1px solid #334155",
                          color: "#94a3b8", fontSize: 11, lineHeight: 1.4,
                        }}>
                          💬 ¿Quieres más información sobre el estatus de tu referido? Acércate con Reclutamiento.
                        </div>
                      )}
                    </td>

                    {/* Coins */}
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <span style={{ fontWeight: 700, color: r.pts_awarded >= 5 ? "#4ade80" : "#60a5fa" }}>
                        {r.pts_awarded}/5
                      </span>
                    </td>

                    {/* Acciones (admin only) */}
                    {isAdmin && (
                      <td style={{ padding: "10px 14px", minWidth: 260 }}>
                        {/* Main 6 status buttons */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, marginBottom: 4 }}>
                          {MAIN_STATUSES.map((s) => {
                            const cfg = STATUS_CONFIG[s];
                            const isCurrent = r.status === s || (s === "pending_contact" && r.status === "pending");
                            const isLoading = actionLoading === r.id + s;
                            return (
                              <button
                                key={s}
                                onClick={() => handleUpdateStatus(r, s)}
                                disabled={isCurrent || !!actionLoading}
                                title={cfg.label}
                                style={{
                                  background: isCurrent ? cfg.bg : "#1e293b",
                                  color: isCurrent ? cfg.color : "#64748b",
                                  border: `1px solid ${isCurrent ? cfg.color + "55" : "#334155"}`,
                                  borderRadius: 5, padding: "4px 5px",
                                  cursor: isCurrent ? "default" : "pointer",
                                  fontWeight: isCurrent ? 700 : 500,
                                  fontSize: 10, lineHeight: 1.2,
                                  opacity: actionLoading && !isLoading ? 0.5 : 1,
                                  transition: "all 0.15s",
                                }}
                              >
                                {isLoading ? "..." : cfg.label}
                              </button>
                            );
                          })}
                        </div>
                        {/* Sub-status buttons */}
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                          {SUB_STATUSES.map((s) => {
                            const cfg = STATUS_CONFIG[s];
                            const isCurrent = r.status === s;
                            const isLoading = actionLoading === r.id + s;
                            return (
                              <button
                                key={s}
                                onClick={() => handleUpdateStatus(r, s)}
                                disabled={isCurrent || !!actionLoading}
                                title={cfg.label}
                                style={{
                                  background: isCurrent ? cfg.bg : "transparent",
                                  color: isCurrent ? cfg.color : "#475569",
                                  border: `1px solid ${isCurrent ? cfg.color + "44" : "#1e293b"}`,
                                  borderRadius: 4, padding: "3px 6px",
                                  cursor: isCurrent ? "default" : "pointer",
                                  fontSize: 9, fontWeight: isCurrent ? 700 : 500,
                                  opacity: actionLoading && !isLoading ? 0.5 : 1,
                                }}
                              >
                                {isLoading ? "..." : cfg.label}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    )}

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
