import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://dxwjjptjyhiitejupvaq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8"
);

// ─── Types ────────────────────────────────────────────────────────────────────
type ReferralStatus = "pending" | "hired" | "rejected";

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
  pts_awarded: number; // 1 on submit, +4 on hire approval
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<ReferralStatus, { label: string; color: string; bg: string }> = {
  pending:  { label: "Pendiente",   color: "#fbbf24", bg: "#2d2000" },
  hired:    { label: "Contratado",  color: "#4ade80", bg: "#052e16" },
  rejected: { label: "No avanzó",  color: "#f87171", bg: "#2d1515" },
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReferralsPanel({ isAdmin = false }: { isAdmin?: boolean }) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | ReferralStatus>("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRef, setNewRef] = useState({ referred_name: "", referred_phone: "", referred_email: "", notes: "" });
  const [currentGameId, setCurrentGameId] = useState<string>("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetchReferrals();
    // Get current user game_id from localStorage/session (adjust to your auth method)
    const storedId = localStorage.getItem("game_id") || "";
    setCurrentGameId(storedId);
  }, []);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchReferrals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("referrals")
      .select("*, profiles!referrals_referred_by_game_id_fkey(username)")
      .order("submitted_at", { ascending: false });

    if (!error && data) {
      setReferrals(
        data.map((r: any) => ({
          ...r,
          referred_by_name: r.profiles?.username || r.referred_by_game_id,
        }))
      );
    }
    setLoading(false);
  };

  // ── Submit new referral (agent action) ──────────────────────────────────────
  const handleSubmitReferral = async () => {
    if (!newRef.referred_name.trim()) {
      showToast("El nombre del referido es obligatorio.", "error");
      return;
    }
    setActionLoading("new");
    const { error } = await supabase.from("referrals").insert({
      referred_by_game_id: currentGameId,
      referred_name: newRef.referred_name.trim(),
      referred_phone: newRef.referred_phone.trim() || null,
      referred_email: newRef.referred_email.trim() || null,
      status: "pending",
      pts_awarded: 1,
      notes: newRef.notes.trim() || null,
      submitted_at: new Date().toISOString(),
    });

    if (!error) {
      // Award 1pt immediately
      await supabase.rpc("increment_points", { p_game_id: currentGameId, p_points: 1, p_source: "referral_submitted" });
      showToast("✅ Referido registrado — +1 pt acreditado", "success");
      setNewRef({ referred_name: "", referred_phone: "", referred_email: "", notes: "" });
      setShowAddForm(false);
      fetchReferrals();
    } else {
      showToast(`Error: ${error.message}`, "error");
    }
    setActionLoading(null);
  };

  // ── Admin: Mark as hired (+4pts) ────────────────────────────────────────────
  const handleMarkHired = async (ref: Referral) => {
    if (ref.pts_awarded >= 5) {
      showToast("Este referido ya tiene los 5 pts acreditados.", "error");
      return;
    }
    setActionLoading(ref.id);
    const { error } = await supabase
      .from("referrals")
      .update({ status: "hired", resolved_at: new Date().toISOString(), pts_awarded: 5 })
      .eq("id", ref.id);

    if (!error) {
      // Award remaining 4pts to the referring agent
      await supabase.rpc("increment_points", {
        p_game_id: ref.referred_by_game_id,
        p_points: 4,
        p_source: "referral_hired",
      });
      showToast(`✅ Marcado como contratado — +4 pts para ${ref.referred_by_name}`, "success");
      fetchReferrals();
    } else {
      showToast(`Error: ${error.message}`, "error");
    }
    setActionLoading(null);
  };

  // ── Admin: Mark as rejected ──────────────────────────────────────────────────
  const handleMarkRejected = async (ref: Referral) => {
    setActionLoading(ref.id);
    const { error } = await supabase
      .from("referrals")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", ref.id);

    if (!error) {
      showToast("Referido marcado como no avanzó.", "success");
      fetchReferrals();
    } else {
      showToast(`Error: ${error.message}`, "error");
    }
    setActionLoading(null);
  };

  // ── Filters ──────────────────────────────────────────────────────────────────
  const filtered = referrals.filter((r) => {
    const matchFilter = filter === "all" || r.status === filter;
    const matchSearch =
      search === "" ||
      r.referred_name.toLowerCase().includes(search.toLowerCase()) ||
      (r.referred_by_name || "").toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    all: referrals.length,
    pending: referrals.filter((r) => r.status === "pending").length,
    hired: referrals.filter((r) => r.status === "hired").length,
    rejected: referrals.filter((r) => r.status === "rejected").length,
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      {/* Toast */}
      {toast && (
        <div style={{ ...styles.toast, background: toast.type === "success" ? "#052e16" : "#2d1515",
          borderColor: toast.type === "success" ? "#14532d" : "#7f1d1d",
          color: toast.type === "success" ? "#4ade80" : "#f87171" }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>🤝 Panel de Referidos</h2>
          <p style={styles.subtitle}>{counts.pending} pendientes de revisión</p>
        </div>
        {!isAdmin && (
          <button onClick={() => setShowAddForm(!showAddForm)} style={styles.btnPrimary}>
            + Registrar referido
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div style={styles.formBox}>
          <h3 style={styles.formTitle}>Nuevo Referido</h3>
          <div style={styles.formGrid}>
            <div style={styles.formField}>
              <label style={styles.label}>Nombre completo *</label>
              <input style={styles.input} placeholder="Juan García"
                value={newRef.referred_name}
                onChange={(e) => setNewRef({ ...newRef, referred_name: e.target.value })} />
            </div>
            <div style={styles.formField}>
              <label style={styles.label}>Teléfono</label>
              <input style={styles.input} placeholder="555-1234"
                value={newRef.referred_phone}
                onChange={(e) => setNewRef({ ...newRef, referred_phone: e.target.value })} />
            </div>
            <div style={styles.formField}>
              <label style={styles.label}>Email</label>
              <input style={styles.input} placeholder="juan@email.com"
                value={newRef.referred_email}
                onChange={(e) => setNewRef({ ...newRef, referred_email: e.target.value })} />
            </div>
            <div style={styles.formField}>
              <label style={styles.label}>Notas</label>
              <input style={styles.input} placeholder="Ej: amigo, ex-compañero..."
                value={newRef.notes}
                onChange={(e) => setNewRef({ ...newRef, notes: e.target.value })} />
            </div>
          </div>
          <div style={styles.formActions}>
            <p style={styles.ptNote}>Al enviar recibirás <b style={{ color: "#60a5fa" }}>+1 pt</b>. Si es contratado el Admin aprobará <b style={{ color: "#4ade80" }}>+4 pts</b> adicionales.</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setShowAddForm(false)} style={styles.btnSecondary}>Cancelar</button>
              <button onClick={handleSubmitReferral} disabled={actionLoading === "new"} style={styles.btnPrimary}>
                {actionLoading === "new" ? "Enviando..." : "Registrar (+1pt)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={styles.statsRow}>
        {(["all", "pending", "hired", "rejected"] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ ...styles.statBtn, ...(filter === s ? styles.statBtnActive : {}) }}>
            <span style={styles.statNum}>{counts[s]}</span>
            <span style={styles.statLabel}>
              {s === "all" ? "Todos" : STATUS_CONFIG[s as ReferralStatus]?.label}
            </span>
          </button>
        ))}
        {/* Total pts awarded */}
        <div style={{ ...styles.statBtn, marginLeft: "auto" }}>
          <span style={{ ...styles.statNum, color: "#4ade80" }}>
            {referrals.reduce((acc, r) => acc + r.pts_awarded, 0)}
          </span>
          <span style={styles.statLabel}>Pts entregados</span>
        </div>
      </div>

      {/* Search */}
      <input style={styles.search} placeholder="🔍  Buscar por nombre o agente..."
        value={search} onChange={(e) => setSearch(e.target.value)} />

      {/* Table */}
      {loading ? (
        <div style={styles.loadingRow}>Cargando referidos...</div>
      ) : filtered.length === 0 ? (
        <div style={styles.emptyRow}>No hay referidos que coincidan.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {["Referido por","Candidato","Contacto","Fecha","Status","Pts","Acciones"].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const sc = STATUS_CONFIG[r.status];
                return (
                  <tr key={r.id} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                    <td style={styles.td}>
                      <span style={styles.agentName}>{r.referred_by_name}</span>
                      <br /><span style={styles.gameId}>{r.referred_by_game_id}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{r.referred_name}</span>
                      {r.notes && <br />}
                      {r.notes && <span style={styles.gameId}>{r.notes}</span>}
                    </td>
                    <td style={styles.td}>
                      {r.referred_phone && <span style={styles.contact}>{r.referred_phone}</span>}
                      {r.referred_email && <><br /><span style={styles.contact}>{r.referred_email}</span></>}
                    </td>
                    <td style={styles.td}>
                      <span style={styles.date}>{new Date(r.submitted_at).toLocaleDateString("es-MX")}</span>
                      {r.resolved_at && (
                        <><br /><span style={styles.gameId}>→ {new Date(r.resolved_at).toLocaleDateString("es-MX")}</span></>
                      )}
                    </td>
                    <td style={styles.td}>
                      <span style={{ ...styles.statusBadge, background: sc.bg, color: sc.color, borderColor: sc.color + "44" }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      <span style={{ fontWeight: 700, color: r.pts_awarded >= 5 ? "#4ade80" : "#60a5fa" }}>
                        {r.pts_awarded} / 5
                      </span>
                    </td>
                    <td style={styles.td}>
                      {isAdmin && r.status === "pending" && (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() => handleMarkHired(r)}
                            disabled={actionLoading === r.id}
                            style={styles.btnHire}>
                            ✅ Contratar
                          </button>
                          <button
                            onClick={() => handleMarkRejected(r)}
                            disabled={actionLoading === r.id}
                            style={styles.btnReject}>
                            ✕
                          </button>
                        </div>
                      )}
                      {r.status !== "pending" && (
                        <span style={styles.resolved}>
                          {r.status === "hired" ? "✅ Aprobado" : "✕ Cerrado"}
                        </span>
                      )}
                    </td>
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: { padding: "24px", maxWidth: "1200px", margin: "0 auto", position: "relative" },
  toast: {
    position: "fixed", top: "20px", right: "20px", zIndex: 9999,
    padding: "12px 20px", borderRadius: "8px", border: "1px solid",
    fontWeight: 600, fontSize: "14px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" },
  title: { color: "#f1f5f9", fontSize: "22px", fontWeight: 700, margin: "0 0 4px" },
  subtitle: { color: "#64748b", fontSize: "14px", margin: 0 },
  // Form
  formBox: {
    background: "#0c2240", border: "1px solid #1e3a5f",
    borderRadius: "12px", padding: "20px", marginBottom: "20px",
  },
  formTitle: { color: "#93c5fd", fontWeight: 700, margin: "0 0 16px" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
  formField: { display: "flex", flexDirection: "column" as const, gap: "6px" },
  label: { color: "#94a3b8", fontSize: "12px", fontWeight: 600 },
  input: {
    background: "#0f172a", border: "1px solid #1e3a5f",
    borderRadius: "6px", padding: "9px 12px",
    color: "#e2e8f0", fontSize: "14px", outline: "none",
  },
  formActions: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginTop: "16px", flexWrap: "wrap" as const, gap: "12px",
  },
  ptNote: { color: "#64748b", fontSize: "13px", margin: 0 },
  // Stats
  statsRow: { display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" as const },
  statBtn: {
    background: "#1e293b", border: "1px solid #334155",
    borderRadius: "10px", padding: "10px 18px",
    display: "flex", flexDirection: "column" as const, alignItems: "center",
    cursor: "pointer", minWidth: "80px",
  },
  statBtnActive: { borderColor: "#3b82f6", background: "#0c2240" },
  statNum: { fontSize: "22px", fontWeight: 700, color: "#60a5fa" },
  statLabel: { fontSize: "11px", color: "#64748b" },
  // Search
  search: {
    width: "100%", background: "#1e293b",
    border: "1px solid #334155", borderRadius: "8px",
    padding: "10px 16px", color: "#e2e8f0", fontSize: "14px",
    outline: "none", marginBottom: "16px",
    boxSizing: "border-box" as const,
  },
  // Table
  tableWrap: { overflowX: "auto" as const, borderRadius: "10px", border: "1px solid #1e3a5f" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: "13px" },
  th: {
    background: "#0c2240", color: "#93c5fd", fontWeight: 600,
    padding: "10px 14px", textAlign: "left" as const,
  },
  td: { padding: "10px 14px", color: "#cbd5e1", verticalAlign: "top" as const },
  trEven: { background: "#0f172a" },
  trOdd: { background: "#0c1a2e" },
  agentName: { color: "#e2e8f0", fontWeight: 600 },
  gameId: { color: "#475569", fontSize: "11px" },
  contact: { color: "#64748b", fontSize: "12px" },
  date: { color: "#94a3b8", fontSize: "12px" },
  statusBadge: {
    display: "inline-block", padding: "3px 10px", borderRadius: "999px",
    fontSize: "11px", fontWeight: 700, border: "1px solid",
  },
  btnHire: {
    background: "#052e16", color: "#4ade80",
    border: "1px solid #14532d", borderRadius: "6px",
    padding: "5px 10px", cursor: "pointer", fontWeight: 600, fontSize: "12px",
  },
  btnReject: {
    background: "#2d1515", color: "#f87171",
    border: "1px solid #7f1d1d", borderRadius: "6px",
    padding: "5px 10px", cursor: "pointer", fontWeight: 600, fontSize: "12px",
  },
  resolved: { color: "#475569", fontSize: "12px", fontStyle: "italic" },
  btnPrimary: {
    background: "#1d4ed8", color: "#fff", border: "none",
    padding: "10px 22px", borderRadius: "8px", cursor: "pointer",
    fontWeight: 700, fontSize: "14px",
  },
  btnSecondary: {
    background: "transparent", color: "#94a3b8",
    border: "1px solid #334155",
    padding: "10px 22px", borderRadius: "8px", cursor: "pointer",
    fontWeight: 600, fontSize: "14px",
  },
  loadingRow: { color: "#64748b", padding: "40px", textAlign: "center" as const },
  emptyRow: { color: "#475569", padding: "40px", textAlign: "center" as const },
};
