// @ts-nocheck
import { useState, useEffect } from "react";
import { pageAll } from "../pageAll";
import { computeCoachUsage, weekRange, REACH_WEIGHT, FREQ_WEIGHT, WORKDAYS } from "../coachUsage";

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";

async function sbFetch(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Mismo tablero para el admin (con CSV y lista de quién no ha entrado de cada coach) y para el coach
// (ve el ranking completo con su fila resaltada y quién de SU equipo no ha entrado).
// Se mide solo si los agentes ENTRAN a la app, por semana (lunes a domingo).
export default function CoachUsageBoard({ allUsers, myCoachId = null, isAdmin = false, dark = false }: { allUsers: any[]; myCoachId?: string | null; isAdmin?: boolean; dark?: boolean }) {
  const T = dark
    ? { card: "#1a1d27", border: "#2a2d3e", text: "#e8eaf6", muted: "#94a3b8", accent: "#818cf8", bar: "#2a2d3e", hi: "#6366f1" }
    : { card: "#fff", border: "#d1d5f0", text: "#0a0a40", muted: "#6b7280", accent: "#7c3aed", bar: "#e8eaf6", hi: "#7c3aed" };
  const [offset, setOffset] = useState(0);
  const [logins, setLogins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const wk = weekRange(offset);

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(false);
      try {
        const q = `app_logins?select=game_id,user_type,logged_in_at&user_type=eq.agent&logged_in_at=gte.${encodeURIComponent(wk.start.toISOString())}&logged_in_at=lt.${encodeURIComponent(wk.end.toISOString())}&order=logged_in_at.asc,id.asc`;
        setLogins(await pageAll(sbFetch, q));
      } catch (e) { setLogins([]); setErr(true); }
      setLoading(false);
    })();
  }, [offset]);

  const agents = (allUsers || []).filter(u => u.active && u.role === "user");
  const { ranked, unassigned } = computeCoachUsage(agents, logins);
  const mine = myCoachId ? ranked.find(r => r.key === String(myCoachId).trim().toUpperCase()) : null;
  const weekLabels = ["Esta semana", "Semana pasada", "Hace 2 semanas", "Hace 3 semanas"];

  const exportCsv = () => {
    const NL = String.fromCharCode(10), BOM = String.fromCharCode(65279);
    const q = (v: any) => '"' + String(v ?? "").split('"').join('""') + '"';
    const lines = [["posicion", "coach", "agentes_asignados", "agentes_que_entraron", "alcance_pct", "dias_activos_promedio", "frecuencia_pct", "indice", "inicios_de_sesion"].map(q).join(",")];
    ranked.forEach(x => lines.push([x.rank, x.key, x.team, x.entered, x.reachPct, x.avgDays, x.freqPct, x.index, x.logins].map(q).join(",")));
    const blob = new Blob([BOM + lines.join(NL)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ranking_coaches_uso_${wk.start.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const Box = ({ children, style = {} }: any) => <div style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", marginBottom: 8, ...style }}>{children}</div>;
  const medal = (r: any) => (r.rank <= 3 && r.index > 0 ? ["🥇", "🥈", "🥉"][r.rank - 1] : `#${r.rank}`);

  return (
    <div style={{ paddingBottom: 100 }}>
      <Box>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <div>
            <div style={{ color: T.text, fontWeight: 800, fontSize: 16 }}>🏅 Ranking de coaches por uso</div>
            <div style={{ color: T.muted, fontSize: 12, marginTop: 2 }}>Semana del {wk.label}</div>
          </div>
          {isAdmin && <button onClick={exportCsv} style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 9, padding: "7px 14px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>⬇️ CSV</button>}
        </div>
        <select value={offset} onChange={e => setOffset(+e.target.value)} style={{ width: "100%", border: `1.5px solid ${T.border}`, borderRadius: 9, padding: "9px 12px", fontSize: 13, background: T.card, color: T.text, fontFamily: "inherit", marginBottom: 8 }}>
          {weekLabels.map((l, i) => <option key={i} value={i}>{l} ({weekRange(i).label})</option>)}
        </select>
        <div style={{ color: T.muted, fontSize: 11, lineHeight: 1.6 }}>
          Mide solo si tus agentes <strong style={{ color: T.text }}>entran</strong> a la app. Se calcula por agente, no en totales, así un equipo de 10 y uno de 15 compiten parejo:
          índice = {Math.round(REACH_WEIGHT * 100)}% alcance (agentes que entraron al menos un día) + {Math.round(FREQ_WEIGHT * 100)}% frecuencia (días con acceso por agente, sobre {WORKDAYS}). Mismo comportamiento = misma posición.
        </div>
      </Box>

      {err && <Box style={{ color: "#e8282a", fontSize: 13 }}>No se pudieron leer los accesos.</Box>}
      {loading && <div style={{ textAlign: "center", padding: 30, color: T.muted }}>Cargando...</div>}

      {!loading && !err && (<>
        {myCoachId && (
          <Box style={{ border: `2px solid ${T.hi}` }}>
            {mine ? (<>
              <div style={{ color: T.muted, fontSize: 11, letterSpacing: 1, fontWeight: 700 }}>TU POSICIÓN</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <div style={{ color: T.text, fontWeight: 900, fontSize: 24 }}>{medal(mine)} <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>de {ranked.length} coaches</span></div>
                <div style={{ color: T.accent, fontWeight: 900, fontSize: 22 }}>{mine.index}<span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}> / 100</span></div>
              </div>
              <div style={{ color: T.muted, fontSize: 12, marginTop: 6 }}>Entraron {mine.entered} de {mine.team} agentes ({mine.reachPct}%) · Días con acceso por agente: {mine.avgDays}</div>
              {mine.absent.length > 0 ? (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ color: T.muted, fontSize: 11, fontWeight: 700, marginBottom: 3 }}>De tu equipo, no han entrado esta semana ({mine.absent.length}):</div>
                  <div style={{ color: T.text, fontSize: 12, lineHeight: 1.7 }}>{mine.absent.join(" · ")}</div>
                </div>
              ) : <div style={{ marginTop: 8, color: "#16a34a", fontSize: 12, fontWeight: 700 }}>🎉 Todo tu equipo ya entró esta semana</div>}
            </>) : <div style={{ color: T.muted, fontSize: 13 }}>No encontramos agentes asignados a tu usuario (coach {String(myCoachId).toUpperCase()}). Aparecerás cuando el Excel semanal los asigne.</div>}
          </Box>
        )}

        {ranked.map(x => {
          const isMine = myCoachId && x.key === String(myCoachId).trim().toUpperCase();
          return (
            <Box key={x.key} style={{ border: `${isMine ? 2 : 1.5}px solid ${isMine ? T.hi : (x.rank <= 3 && x.index > 0 ? "#f59e0b" : T.border)}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div style={{ color: T.text, fontWeight: 800, fontSize: 14 }}>{medal(x)} {x.key}{isMine ? " (tú)" : ""}</div>
                <div style={{ color: T.accent, fontWeight: 900, fontSize: 16 }}>{x.index}</div>
              </div>
              <div style={{ background: T.bar, borderRadius: 4, height: 7, overflow: "hidden", margin: "7px 0" }}>
                <div style={{ width: `${Math.min(100, x.index)}%`, height: "100%", background: T.accent, borderRadius: 4 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ color: T.muted, fontSize: 11 }}>Entraron {x.entered} de {x.team} ({x.reachPct}%) · Días por agente: {x.avgDays}</div>
                {isAdmin && x.absent.length > 0 && (
                  <button onClick={() => setOpen(open === x.key ? null : x.key)} style={{ background: "none", border: "none", color: T.accent, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{open === x.key ? "Ocultar" : `Sin entrar (${x.absent.length})`}</button>
                )}
              </div>
              {isAdmin && open === x.key && <div style={{ color: T.muted, fontSize: 11, lineHeight: 1.7, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.border}` }}>{x.absent.join(" · ")}</div>}
            </Box>
          );
        })}
        {unassigned && (
          <Box style={{ border: `1.5px solid #d97706` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ color: T.text, fontWeight: 800, fontSize: 14 }}>Sin coach asignado</div>
              <div style={{ color: T.muted, fontSize: 12 }}>entraron {unassigned.entered} de {unassigned.team}</div>
            </div>
            <div style={{ color: T.muted, fontSize: 11, marginTop: 4 }}>No cuentan para el ranking hasta que el Excel semanal les asigne coach.</div>
          </Box>
        )}
        {ranked.length === 0 && <Box style={{ textAlign: "center", color: T.muted }}>Sin datos todavía. Los accesos se registran desde el 19-oct.</Box>}
      </>)}
    </div>
  );
}
