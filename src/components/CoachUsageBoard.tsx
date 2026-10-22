// @ts-nocheck
import { useState, useEffect } from "react";
import { pageAll } from "../pageAll";
import { computeCoachUsage, weekRange, workdayKeys, isoWeekLabel } from "../coachUsage";

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
// Se mide por INGRESO DIARIO: % de los agentes del coach que entró cada día hábil; el índice de la
// semana es el promedio de esos días, y la vista "Hoy" es solo el día de hoy.
export default function CoachUsageBoard({ allUsers, myCoachId = null, isAdmin = false, dark = false }: { allUsers: any[]; myCoachId?: string | null; isAdmin?: boolean; dark?: boolean }) {
  const T = dark
    ? { card: "#1a1d27", border: "#2a2d3e", text: "#e8eaf6", muted: "#94a3b8", accent: "#818cf8", bar: "#2a2d3e", hi: "#6366f1" }
    : { card: "#fff", border: "#d1d5f0", text: "#0a0a40", muted: "#6b7280", accent: "#7c3aed", bar: "#e8eaf6", hi: "#7c3aed" };
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState("week"); // week | today
  const [logins, setLogins] = useState<any[]>([]);
  const [excusedRows, setExcusedRows] = useState<any[]>([]);
  const [weekLoaded, setWeekLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const wk = weekRange(offset);
  const days = workdayKeys(wk);

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(false);
      try {
        const q = `app_logins?select=game_id,user_type,logged_in_at&user_type=eq.agent&logged_in_at=gte.${encodeURIComponent(wk.effStart.toISOString())}&logged_in_at=lt.${encodeURIComponent(wk.end.toISOString())}&order=logged_in_at.asc,id.asc`;
        setLogins(await pageAll(sbFetch, q));
        // Semana del Excel: quién estuvo excusado (vacaciones, incapacidad, MSL) y si ya se cargó
        const label = isoWeekLabel(wk.start);
        const wkRows = await pageAll(sbFetch, `weekly_metrics?select=game_id,attendance_status,flag&week=eq.${encodeURIComponent(label)}&order=id.asc`).catch(() => []);
        setWeekLoaded(wkRows.length > 0);
        setExcusedRows(wkRows.filter((r: any) => r.attendance_status === "excused" || r.flag === "msl"));
      } catch (e) { setLogins([]); setErr(true); }
      setLoading(false);
    })();
  }, [offset]);

  const agents = (allUsers || []).filter(u => u.active && u.role === "user");
  const excusedSet = new Set(excusedRows.map((r: any) => String(r.game_id || "").trim().toUpperCase()));
  const { ranked: byWeek, unassigned } = computeCoachUsage(agents, logins, days, excusedSet);
  const today = mode === "today";
  const ranked = today ? [...byWeek].sort((a, b) => a.todayRank - b.todayRank || a.key.localeCompare(b.key)) : byWeek;
  const posOf = (r: any) => (today ? r.todayRank : r.rank);
  const scoreOf = (r: any) => (today ? r.todayPct : r.index);
  const mine = myCoachId ? ranked.find(r => r.key === String(myCoachId).trim().toUpperCase()) : null;
  const weekLabels = ["Esta semana", "Semana pasada", "Hace 2 semanas", "Hace 3 semanas"];
  const weekOptions = weekLabels.map((l, i) => ({ i, l, r: weekRange(i) })).filter(o => o.r.valid);
  const dayName = (d: string) => ["D", "L", "M", "M", "J", "V", "S"][new Date(d + "T12:00:00").getDay()];
  const lastDay = days.length ? new Date(days[days.length - 1] + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "short" }) : "";

  const exportCsv = () => {
    const NL = String.fromCharCode(10), BOM = String.fromCharCode(65279);
    const q = (v: any) => '"' + String(v ?? "").split('"').join('""') + '"';
    const head = ["posicion", "coach", "agentes_asignados", "agentes_que_entraron", "indice_promedio_diario"].concat(days.map(d => "pct_" + d)).concat(["inicios_de_sesion", "en_vacaciones_o_msl"]);
    const lines = [head.map(q).join(",")];
    byWeek.forEach(x => lines.push([x.rank, x.key, x.team, x.entered, x.index].concat(x.daily.map((d: any) => d.pct)).concat([x.logins, x.excused]).map(q).join(",")));
    const blob = new Blob([BOM + lines.join(NL)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ranking_coaches_uso_${wk.effStart.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const Box = ({ children, style = {} }: any) => <div style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", marginBottom: 8, ...style }}>{children}</div>;
  const medal = (r: any) => (posOf(r) <= 3 && scoreOf(r) > 0 ? ["🥇", "🥈", "🥉"][posOf(r) - 1] : `#${posOf(r)}`);
  const Strip = ({ r }: any) => (
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
      {r.daily.map((d: any) => (
        <div key={d.day} style={{ flex: 1, textAlign: "center" }}>
          <div style={{ background: T.bar, borderRadius: 3, height: 26, display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
            <div style={{ width: "100%", height: `${Math.max(d.pct > 0 ? 6 : 0, d.pct)}%`, background: T.accent }} />
          </div>
          <div style={{ color: T.muted, fontSize: 9, marginTop: 2 }}>{dayName(d.day)} {d.pct}%</div>
        </div>
      ))}
    </div>
  );
  const pill = (id: string, label: string) => (
    <button key={id} onClick={() => setMode(id)} style={{ flex: 1, padding: "8px 6px", borderRadius: 9, border: `1.5px solid ${mode === id ? T.hi : T.border}`, background: mode === id ? `${T.hi}22` : "transparent", color: mode === id ? T.accent : T.muted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
  );

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
          {weekOptions.map(o => <option key={o.i} value={o.i}>{o.l} ({o.r.label})</option>)}
        </select>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>{pill("week", "Semana (promedio diario)")}{pill("today", offset === 0 ? "Hoy" : "Último día")}</div>
        <div style={{ color: T.muted, fontSize: 11, lineHeight: 1.6 }}>
          Mide el <strong style={{ color: T.text }}>ingreso diario</strong>: qué % de los agentes de cada coach entró cada día hábil (lunes a viernes). El índice de la semana es el promedio de esos días{days.length ? ` (${days.length} día${days.length === 1 ? "" : "s"} hasta ${lastDay})` : ""}.
          Es por agente, no en totales, así un equipo de 10 y uno de 15 compiten parejo. Entrar 20 veces en un día vale igual que una. Quien está en vacaciones, incapacidad o MSL y no entra no cuenta en contra. El ranking cuenta el uso desde el 20-oct.
        </div>
        <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: weekLoaded ? "#16a34a22" : "#d9770622", color: weekLoaded ? "#16a34a" : "#d97706" }}>
          {weekLoaded ? "✅ Con el Excel de la semana cargado: vacaciones y MSL ya están descontados." : "⏳ Provisional: se ajusta al cargar el Excel de la semana (ahí se descuentan vacaciones y MSL)."}
        </div>
      </Box>

      {err && <Box style={{ color: "#e8282a", fontSize: 13 }}>No se pudieron leer los accesos.</Box>}
      {loading && <div style={{ textAlign: "center", padding: 30, color: T.muted }}>Cargando...</div>}

      {!loading && !err && (<>
        {myCoachId && (
          <Box style={{ border: `2px solid ${T.hi}` }}>
            {mine ? (<>
              <div style={{ color: T.muted, fontSize: 11, letterSpacing: 1, fontWeight: 700 }}>TU POSICIÓN {today ? "HOY" : "DE LA SEMANA"}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <div style={{ color: T.text, fontWeight: 900, fontSize: 24 }}>{medal(mine)} <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>de {ranked.length} coaches</span></div>
                <div style={{ color: T.accent, fontWeight: 900, fontSize: 22 }}>{scoreOf(mine)}%</div>
              </div>
              <Strip r={mine} />
              <div style={{ color: T.muted, fontSize: 12, marginTop: 8 }}>Entraron {mine.entered} de {mine.team} agentes en la semana{mine.excused > 0 ? ` · ${mine.excused} en vacaciones/MSL no cuentan` : ""}</div>
              {mine.absent.length > 0 ? (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ color: T.muted, fontSize: 11, fontWeight: 700, marginBottom: 3 }}>De tu equipo, no han entrado esta semana ({mine.absent.length}):</div>
                  <div style={{ color: T.text, fontSize: 12, lineHeight: 1.7 }}>{mine.absent.join(" · ")}</div>
                </div>
              ) : <div style={{ marginTop: 8, color: "#16a34a", fontSize: 12, fontWeight: 700 }}>🎉 Todo tu equipo ya entró esta semana</div>}
            </>) : <div style={{ color: T.muted, fontSize: 13 }}>No encontramos agentes asignados a tu usuario (coach {String(myCoachId).toUpperCase()}). Aparecerás cuando el Excel semanal o el perfil de tus agentes te los asigne.</div>}
          </Box>
        )}

        {ranked.map(x => {
          const isMine = myCoachId && x.key === String(myCoachId).trim().toUpperCase();
          return (
            <Box key={x.key} style={{ border: `${isMine ? 2 : 1.5}px solid ${isMine ? T.hi : (posOf(x) <= 3 && scoreOf(x) > 0 ? "#f59e0b" : T.border)}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div style={{ color: T.text, fontWeight: 800, fontSize: 14 }}>{medal(x)} {x.key}{isMine ? " (tú)" : ""}</div>
                <div style={{ color: T.accent, fontWeight: 900, fontSize: 16 }}>{scoreOf(x)}%</div>
              </div>
              <Strip r={x} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}>
                <div style={{ color: T.muted, fontSize: 11 }}>Entraron {x.entered} de {x.team} en la semana{x.excused > 0 ? ` · ${x.excused} en vacaciones/MSL no cuentan` : ""}</div>
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
            <div style={{ color: T.muted, fontSize: 11, marginTop: 4 }}>No cuentan para el ranking hasta que se les asigne coach.</div>
          </Box>
        )}
        {ranked.length === 0 && <Box style={{ textAlign: "center", color: T.muted }}>Sin datos todavía. Los accesos se cuentan desde el 20-oct.</Box>}
      </>)}
    </div>
  );
}
