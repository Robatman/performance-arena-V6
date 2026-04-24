import { useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const supabase = createClient(
  "https://dxwjjptjyhiitejupvaq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8"
);

// ─── Types ────────────────────────────────────────────────────────────────────
interface AgentRow {
  game_id: string;
  project: string;
  coach: string;
  qa_coach: string;
  aht: number;
  aht_goal: number;
  qa_pct: number;
  qa_goal: number;
  absences: number;
  tardies: number;
}

interface CoachExitRow {
  coach: string;
  voluntary_exits: number;
}

interface ProcessedAgent {
  game_id: string;
  project: string;
  coach: string;
  qa_coach: string;
  aht: number;
  aht_goal: number;
  qa_pct: number;
  qa_goal: number;
  absences: number;
  tardies: number;
  attendance_status: "perfect" | "late" | "absent";
  attendance_pts: number;
  aht_pts: number;
  qa_pts: number;
  total_pts: number;
}

interface UploadSummary {
  week: string;
  agents_processed: number;
  coaches_processed: number;
  agents_updated: number;
  errors: string[];
}

// ─── Scoring logic ────────────────────────────────────────────────────────────
function calcAttendance(absences: number, tardies: number): { status: "perfect" | "late" | "absent"; pts: number } {
  if (absences >= 1 || tardies >= 2) return { status: "absent", pts: 0 };
  if (tardies === 1) return { status: "late", pts: 2 };
  return { status: "perfect", pts: 5 };
}

function calcMetricPts(value: number, goal: number, higherIsBetter = true): number {
  const beats = higherIsBetter ? value > goal : value < goal;
  const meets = value === goal;
  if (beats) return 5;
  if (meets) return 2;
  return 0;
}

function getWeekLabel(filename: string): string {
  // Try to extract week from filename like metrics_2026-W17.xlsx
  const match = filename.match(/W(\d{1,2})/i);
  if (match) return `W${match[1]}`;
  // Fallback: current ISO week
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `W${week}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ExcelUpload({ onClose }: { onClose?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "preview" | "uploading" | "done" | "error">("idle");
  const [agents, setAgents] = useState<ProcessedAgent[]>([]);
  const [coachExits, setCoachExits] = useState<CoachExitRow[]>([]);
  const [weekLabel, setWeekLabel] = useState("");
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) processFile(dropped);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
  };

  // ── Parse Excel ──────────────────────────────────────────────────────────────
  const processFile = (f: File) => {
    setFile(f);
    setErrors([]);
    const week = getWeekLabel(f.name);
    setWeekLabel(week);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });

        const parseErrors: string[] = [];

        // ── Sheet: agents ────────────────────────────────────────────────────
        const agentSheet = wb.Sheets["agents"];
        if (!agentSheet) {
          parseErrors.push('No se encontró la hoja "agents".');
          setErrors(parseErrors);
          setStage("error");
          return;
        }

        const rawAgents: AgentRow[] = XLSX.utils.sheet_to_json(agentSheet, { defval: 0 });
        const processedAgents: ProcessedAgent[] = rawAgents
          .filter((r) => r.game_id && String(r.game_id).trim() !== "")
          .map((r, i) => {
            const att = calcAttendance(Number(r.absences), Number(r.tardies));
            const ahtPts = calcMetricPts(Number(r.aht), Number(r.aht_goal), false); // lower AHT = better
            const qaPts = calcMetricPts(Number(r.qa_pct), Number(r.qa_goal), true);
            const total = att.pts + ahtPts + qaPts;

            if (!r.game_id) parseErrors.push(`Fila ${i + 2}: game_id faltante.`);
            if (!r.coach) parseErrors.push(`Fila ${i + 2}: coach faltante.`);

            return {
              game_id: String(r.game_id).trim(),
              project: String(r.project || "").trim(),
              coach: String(r.coach || "").trim(),
              qa_coach: String(r.qa_coach || "").trim(),
              aht: Number(r.aht),
              aht_goal: Number(r.aht_goal),
              qa_pct: Number(r.qa_pct),
              qa_goal: Number(r.qa_goal),
              absences: Number(r.absences),
              tardies: Number(r.tardies),
              attendance_status: att.status,
              attendance_pts: att.pts,
              aht_pts: ahtPts,
              qa_pts: qaPts,
              total_pts: total,
            };
          });

        // ── Sheet: coaches ───────────────────────────────────────────────────
        const coachSheet = wb.Sheets["coaches"];
        let parsedCoaches: CoachExitRow[] = [];
        if (coachSheet) {
          parsedCoaches = XLSX.utils.sheet_to_json<CoachExitRow>(coachSheet, { defval: 0 }).filter(
            (r) => r.coach && String(r.coach).trim() !== ""
          );
        } else {
          parseErrors.push('Hoja "coaches" no encontrada — bajas no se procesarán.');
        }

        if (processedAgents.length === 0) {
          parseErrors.push('La hoja "agents" no tiene datos válidos.');
          setErrors(parseErrors);
          setStage("error");
          return;
        }

        setAgents(processedAgents);
        setCoachExits(parsedCoaches);
        setErrors(parseErrors);
        setStage("preview");
      } catch (err) {
        setErrors([`Error al leer el archivo: ${err}`]);
        setStage("error");
      }
    };
    reader.readAsArrayBuffer(f);
  };

  // ── Upload to Supabase ───────────────────────────────────────────────────────
  const handleUpload = async () => {
    setStage("uploading");
    const uploadErrors: string[] = [];
    let agentsUpdated = 0;

    try {
      // 1. Upsert agent weekly metrics into profiles points log
      for (const agent of agents) {
        // Add points to profiles table (upsert by game_id + week)
        const { error: metricsErr } = await supabase.from("profiles").upsert(
          {
            game_id: agent.game_id,
            // Only update metric-related fields; keep other profile data intact
            last_qa_pct: agent.qa_pct,
            last_qa_goal: agent.qa_goal,
            last_aht: agent.aht,
            last_aht_goal: agent.aht_goal,
            last_absences: agent.absences,
            last_tardies: agent.tardies,
            last_attendance_status: agent.attendance_status,
            last_week: weekLabel,
          },
          { onConflict: "game_id" }
        );
        if (metricsErr) {
          uploadErrors.push(`Agent ${agent.game_id}: ${metricsErr.message}`);
        } else {
          agentsUpdated++;
        }

        // Log weekly points in kudos_log
        const { error: logErr } = await supabase.from("kudos_log").insert({
          game_id: agent.game_id,
          week: weekLabel,
          source: "weekly_metrics",
          qa_pts: agent.qa_pts,
          aht_pts: agent.aht_pts,
          attendance_pts: agent.attendance_pts,
          total_pts: agent.total_pts,
          notes: `Carga automática ${weekLabel}`,
        });
        if (logErr && !logErr.message.includes("duplicate")) {
          uploadErrors.push(`Log ${agent.game_id}: ${logErr.message}`);
        }
      }

      // 2. Log coach voluntary exits → staff_attrition_monthly
      for (const ce of coachExits) {
        const { error: attrErr } = await supabase.from("staff_attrition_monthly").upsert(
          {
            coach_name: ce.coach,
            week: weekLabel,
            voluntary_exits: ce.voluntary_exits,
          },
          { onConflict: "coach_name,week" }
        );
        if (attrErr) {
          uploadErrors.push(`Coach ${ce.coach}: ${attrErr.message}`);
        }
      }

      setSummary({
        week: weekLabel,
        agents_processed: agents.length,
        coaches_processed: coachExits.length,
        agents_updated: agentsUpdated,
        errors: uploadErrors,
      });
      setStage("done");
    } catch (err) {
      setErrors([`Error inesperado: ${err}`]);
      setStage("error");
    }
  };

  const reset = () => {
    setFile(null);
    setStage("idle");
    setAgents([]);
    setCoachExits([]);
    setErrors([]);
    setSummary(null);
    setWeekLabel("");
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>📊 Carga Semanal de Métricas</h2>
            {weekLabel && <span style={styles.weekBadge}>{weekLabel}</span>}
          </div>
          <button onClick={onClose || reset} style={styles.closeBtn}>✕</button>
        </div>

        {/* ── IDLE: Drop zone ── */}
        {stage === "idle" && (
          <div
            style={{ ...styles.dropzone, ...(isDragging ? styles.dropzoneActive : {}) }}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            <div style={styles.dropIcon}>📁</div>
            <p style={styles.dropText}>Arrastra tu archivo aquí</p>
            <p style={styles.dropSub}>metrics_2026-W17.xlsx</p>
            <label style={styles.browseBtn}>
              Seleccionar archivo
              <input type="file" accept=".xlsx,.xls" onChange={handleFileInput} style={{ display: "none" }} />
            </label>
            <div style={styles.formatHint}>
              <p style={styles.hintTitle}>Formato esperado:</p>
              <p style={styles.hintRow}>📄 Hoja <b>agents</b>: game_id · project · coach · qa_coach · aht · aht_goal · qa_pct · qa_goal · absences · tardies</p>
              <p style={styles.hintRow}>📄 Hoja <b>coaches</b>: coach · voluntary_exits</p>
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {stage === "error" && (
          <div style={styles.section}>
            <div style={styles.errorBox}>
              <p style={styles.errorTitle}>❌ Error al procesar el archivo</p>
              {errors.map((e, i) => <p key={i} style={styles.errorItem}>• {e}</p>)}
            </div>
            <button onClick={reset} style={styles.btnSecondary}>Intentar de nuevo</button>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {stage === "preview" && (
          <div style={styles.section}>
            {/* Warnings */}
            {errors.length > 0 && (
              <div style={styles.warnBox}>
                <p style={styles.warnTitle}>⚠️ Advertencias ({errors.length})</p>
                {errors.map((e, i) => <p key={i} style={styles.errorItem}>• {e}</p>)}
              </div>
            )}

            {/* Summary cards */}
            <div style={styles.cards}>
              <div style={styles.card}>
                <span style={styles.cardNum}>{agents.length}</span>
                <span style={styles.cardLabel}>Agentes</span>
              </div>
              <div style={styles.card}>
                <span style={styles.cardNum}>{coachExits.length}</span>
                <span style={styles.cardLabel}>Coaches con bajas</span>
              </div>
              <div style={styles.card}>
                <span style={styles.cardNum}>{agents.filter(a => a.attendance_status === "perfect").length}</span>
                <span style={styles.cardLabel}>Asistencia perfecta</span>
              </div>
              <div style={styles.card}>
                <span style={styles.cardNum}>{agents.filter(a => a.qa_pts === 5).length}</span>
                <span style={styles.cardLabel}>QA sobre meta</span>
              </div>
            </div>

            {/* Agents table preview */}
            <p style={styles.tableTitle}>Vista previa — Agentes ({agents.length})</p>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {["Game ID","Project","Coach","QA Coach","AHT","AHT Goal","QA%","QA Goal","Att.","Tardies","Status","Att.Pts","AHT Pts","QA Pts","Total"].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agents.slice(0, 20).map((a, i) => (
                    <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                      <td style={styles.td}>{a.game_id}</td>
                      <td style={styles.td}>{a.project}</td>
                      <td style={styles.td}>{a.coach}</td>
                      <td style={styles.td}>{a.qa_coach}</td>
                      <td style={styles.td}>{a.aht}s</td>
                      <td style={styles.td}>{a.aht_goal}s</td>
                      <td style={styles.td}>{a.qa_pct}%</td>
                      <td style={styles.td}>{a.qa_goal}%</td>
                      <td style={styles.td}>{a.absences}</td>
                      <td style={styles.td}>{a.tardies}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.badge,
                          background: a.attendance_status === "perfect" ? "#16a34a" :
                                       a.attendance_status === "late" ? "#d97706" : "#dc2626"
                        }}>
                          {a.attendance_status}
                        </span>
                      </td>
                      <td style={styles.tdNum}>{a.attendance_pts}</td>
                      <td style={styles.tdNum}>{a.aht_pts}</td>
                      <td style={styles.tdNum}>{a.qa_pts}</td>
                      <td style={{ ...styles.tdNum, fontWeight: 700, color: "#60a5fa" }}>{a.total_pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {agents.length > 20 && (
                <p style={styles.truncNote}>...y {agents.length - 20} agentes más</p>
              )}
            </div>

            {/* Coach exits preview */}
            {coachExits.length > 0 && (
              <>
                <p style={styles.tableTitle}>Bajas por Coach</p>
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Coach</th>
                        <th style={styles.th}>Bajas voluntarias</th>
                        <th style={styles.th}>Impacto en puntos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coachExits.map((c, i) => {
                        const exits = Number(c.voluntary_exits);
                        const impact = exits === 0 ? "+10 pts" : exits === 1 ? "+2 pts" : exits === 2 ? "0 pts" : "-5 pts";
                        const color = exits === 0 ? "#16a34a" : exits === 1 ? "#d97706" : exits === 2 ? "#6b7280" : "#dc2626";
                        return (
                          <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                            <td style={styles.td}>{c.coach}</td>
                            <td style={styles.tdNum}>{exits}</td>
                            <td style={{ ...styles.tdNum, color, fontWeight: 700 }}>{impact}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Action buttons */}
            <div style={styles.actions}>
              <button onClick={reset} style={styles.btnSecondary}>Cancelar</button>
              <button onClick={handleUpload} style={styles.btnPrimary}>
                ✅ Confirmar y subir {weekLabel}
              </button>
            </div>
          </div>
        )}

        {/* ── UPLOADING ── */}
        {stage === "uploading" && (
          <div style={styles.centered}>
            <div style={styles.spinner} />
            <p style={styles.uploadingText}>Subiendo métricas de {weekLabel}...</p>
            <p style={styles.uploadingSub}>Procesando {agents.length} agentes</p>
          </div>
        )}

        {/* ── DONE ── */}
        {stage === "done" && summary && (
          <div style={styles.section}>
            <div style={styles.successBox}>
              <p style={styles.successIcon}>🎉</p>
              <p style={styles.successTitle}>¡Carga completada!</p>
              <p style={styles.successSub}>Semana <b>{summary.week}</b> procesada correctamente</p>
            </div>

            <div style={styles.cards}>
              <div style={styles.card}>
                <span style={styles.cardNum}>{summary.agents_updated}</span>
                <span style={styles.cardLabel}>Agentes actualizados</span>
              </div>
              <div style={styles.card}>
                <span style={styles.cardNum}>{summary.coaches_processed}</span>
                <span style={styles.cardLabel}>Coaches procesados</span>
              </div>
            </div>

            {summary.errors.length > 0 && (
              <div style={styles.warnBox}>
                <p style={styles.warnTitle}>⚠️ {summary.errors.length} errores durante la carga</p>
                {summary.errors.map((e, i) => <p key={i} style={styles.errorItem}>• {e}</p>)}
              </div>
            )}

            <div style={styles.actions}>
              <button onClick={reset} style={styles.btnSecondary}>Subir otra semana</button>
              <button onClick={onClose} style={styles.btnPrimary}>Cerrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 9999, padding: "16px",
  },
  modal: {
    background: "#0f172a",
    border: "1px solid #1e3a5f",
    borderRadius: "16px",
    width: "100%", maxWidth: "1100px",
    maxHeight: "90vh", overflowY: "auto",
    padding: "28px",
    boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: "24px",
  },
  title: {
    color: "#f1f5f9", fontSize: "22px", fontWeight: 700, margin: 0,
  },
  weekBadge: {
    display: "inline-block", marginTop: "6px",
    background: "#1d4ed8", color: "#bfdbfe",
    padding: "2px 10px", borderRadius: "999px", fontSize: "13px", fontWeight: 600,
  },
  closeBtn: {
    background: "transparent", border: "none", color: "#64748b",
    fontSize: "20px", cursor: "pointer", padding: "4px 8px", lineHeight: 1,
  },
  // Drop zone
  dropzone: {
    border: "2px dashed #1e3a5f",
    borderRadius: "12px", padding: "48px 32px",
    textAlign: "center", cursor: "pointer",
    transition: "all 0.2s",
  },
  dropzoneActive: {
    borderColor: "#3b82f6", background: "rgba(59,130,246,0.08)",
  },
  dropIcon: { fontSize: "48px", marginBottom: "12px" },
  dropText: { color: "#e2e8f0", fontSize: "18px", fontWeight: 600, margin: "0 0 4px" },
  dropSub: { color: "#64748b", fontSize: "13px", margin: "0 0 20px" },
  browseBtn: {
    display: "inline-block", background: "#1d4ed8", color: "#fff",
    padding: "10px 24px", borderRadius: "8px", cursor: "pointer",
    fontWeight: 600, fontSize: "14px", marginBottom: "28px",
  },
  formatHint: {
    background: "#0c2240", borderRadius: "8px", padding: "14px 18px",
    textAlign: "left", maxWidth: "600px", margin: "0 auto",
  },
  hintTitle: { color: "#93c5fd", fontWeight: 600, margin: "0 0 6px", fontSize: "13px" },
  hintRow: { color: "#64748b", fontSize: "12px", margin: "3px 0" },
  // Section
  section: { display: "flex", flexDirection: "column", gap: "20px" },
  // Cards
  cards: { display: "flex", gap: "12px", flexWrap: "wrap" as const },
  card: {
    flex: 1, minWidth: "120px",
    background: "#1e293b", borderRadius: "10px", padding: "16px",
    display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "4px",
  },
  cardNum: { fontSize: "28px", fontWeight: 700, color: "#60a5fa" },
  cardLabel: { fontSize: "12px", color: "#64748b", textAlign: "center" as const },
  // Table
  tableTitle: { color: "#94a3b8", fontSize: "13px", fontWeight: 600, margin: 0 },
  tableWrap: { overflowX: "auto" as const, borderRadius: "8px", border: "1px solid #1e3a5f" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: "12px" },
  th: {
    background: "#0c2240", color: "#93c5fd", fontWeight: 600,
    padding: "8px 10px", textAlign: "left" as const, whiteSpace: "nowrap" as const,
  },
  td: { padding: "7px 10px", color: "#cbd5e1", whiteSpace: "nowrap" as const },
  tdNum: { padding: "7px 10px", color: "#cbd5e1", textAlign: "center" as const },
  trEven: { background: "#0f172a" },
  trOdd: { background: "#0c1a2e" },
  truncNote: { color: "#475569", fontSize: "12px", padding: "8px 12px", margin: 0 },
  badge: {
    display: "inline-block", padding: "2px 8px", borderRadius: "999px",
    fontSize: "11px", fontWeight: 600, color: "#fff",
  },
  // Boxes
  errorBox: {
    background: "#2d1515", border: "1px solid #7f1d1d",
    borderRadius: "10px", padding: "16px",
  },
  errorTitle: { color: "#f87171", fontWeight: 700, margin: "0 0 8px" },
  errorItem: { color: "#fca5a5", fontSize: "13px", margin: "3px 0" },
  warnBox: {
    background: "#2d2000", border: "1px solid #78350f",
    borderRadius: "10px", padding: "16px",
  },
  warnTitle: { color: "#fbbf24", fontWeight: 700, margin: "0 0 8px" },
  successBox: {
    background: "#052e16", border: "1px solid #14532d",
    borderRadius: "12px", padding: "24px", textAlign: "center" as const,
  },
  successIcon: { fontSize: "40px", margin: "0 0 8px" },
  successTitle: { color: "#4ade80", fontSize: "20px", fontWeight: 700, margin: "0 0 4px" },
  successSub: { color: "#86efac", fontSize: "14px", margin: 0 },
  // Uploading
  centered: {
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    padding: "60px 0", gap: "16px",
  },
  spinner: {
    width: "48px", height: "48px",
    border: "4px solid #1e3a5f",
    borderTop: "4px solid #3b82f6",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  uploadingText: { color: "#e2e8f0", fontSize: "18px", fontWeight: 600, margin: 0 },
  uploadingSub: { color: "#64748b", fontSize: "14px", margin: 0 },
  // Actions
  actions: { display: "flex", gap: "12px", justifyContent: "flex-end" as const },
  btnPrimary: {
    background: "#1d4ed8", color: "#fff", border: "none",
    padding: "12px 28px", borderRadius: "8px", cursor: "pointer",
    fontWeight: 700, fontSize: "14px",
  },
  btnSecondary: {
    background: "transparent", color: "#94a3b8",
    border: "1px solid #334155",
    padding: "12px 28px", borderRadius: "8px", cursor: "pointer",
    fontWeight: 600, fontSize: "14px",
  },
};
