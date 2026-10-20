// Ranking de coaches por USO de la app (solo si sus agentes entran; no importa qué hagan adentro).
//
// Fórmula equitativa: todo se mide POR AGENTE del equipo, nunca en totales, así un coach con 15
// agentes no gana por tener más gente que uno con 10.
//   alcance    = agentes que entraron al menos un día / agentes del equipo            (0 a 100)
//   frecuencia = (días distintos con acceso por agente, promedio del equipo) / días hábiles del periodo (0 a 100)
//   índice     = 70% alcance + 30% frecuencia
// Agentes en vacaciones, incapacidad o MSL (semana excusada en el Excel semanal) que NO entraron no
// cuentan en contra: salen del equipo de esa semana. Si entraron igual, cuentan normal.
// Se cuentan DÍAS con acceso, no inicios de sesión: un agente que entra 20 veces el mismo día
// vale lo mismo que uno que entra una vez, y por agente nunca se cuentan más días que los hábiles
// del periodo, así nadie puede inflar el índice del equipo entrando de más.
// Si dos equipos se comportan igual (por ejemplo, todos entran todos los días) sacan el mismo
// índice aunque uno sea de 10 y el otro de 15, y comparten posición.

export const REACH_WEIGHT = 0.7;
export const FREQ_WEIGHT = 0.3;
export const WORKDAYS = 5;
// El ranking arranca con el uso de HOY (martes 20-oct-2026); no se toman días anteriores.
export const LAUNCH_DATE = new Date(2026, 9, 20);

export type UsageAgent = { game_id?: string; username?: string; name?: string; coach_id?: string };
export type UsageLogin = { game_id?: string; user_type?: string; logged_in_at: string };

export type CoachUsageRow = {
  key: string; team: number; entered: number; logins: number;
  reachPct: number; avgDays: number; freqPct: number; index: number; rank: number; absent: string[]; excused: number;
};

const norm = (v: any) => String(v || "").trim().toUpperCase();
export const noCoach = (v: any) => !v || !String(v).trim() || /pending|sin asignar/i.test(String(v));
export const coachKey = (u: UsageAgent) => (noCoach(u.coach_id) ? "SIN ASIGNAR" : norm(u.coach_id));
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA"); // día local AAAA-MM-DD

// Semana de lunes a domingo (hora local). offset 0 = esta semana, 1 = la pasada, ...
// `effStart` es el inicio real del periodo: la primera semana empieza el día del lanzamiento.
export function weekRange(offset = 0, now = new Date()) {
  const dow = (now.getDay() + 6) % 7; // lunes = 0
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow - 7 * offset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const effStart = start < LAUNCH_DATE ? LAUNCH_DATE : start;
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  const fmt = (d: Date) => d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
  return { start, end, effStart, label: `${fmt(effStart)} al ${fmt(last)}`, valid: end > LAUNCH_DATE };
}

// Días hábiles (lunes a viernes) transcurridos del periodo, contando hoy; mínimo 1.
export function workdaysElapsed(range: { effStart: Date; end: Date }, now = new Date()) {
  const stop = new Date(Math.min(range.end.getTime() - 86400000, new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()));
  let n = 0;
  for (let d = new Date(range.effStart); d <= stop; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd >= 1 && wd <= 5) n++;
  }
  return Math.max(1, Math.min(WORKDAYS, n));
}

export function computeCoachUsage(agents: UsageAgent[], logins: UsageLogin[], workdays: number = WORKDAYS, excused: Set<string> = new Set()) {
  const daysBy: Record<string, Set<string>> = {};
  const loginsBy: Record<string, number> = {};
  (logins || []).filter(l => !l.user_type || l.user_type === "agent").forEach(l => {
    const k = norm(l.game_id);
    (daysBy[k] = daysBy[k] || new Set()).add(dayOf(l.logged_in_at));
    loginsBy[k] = (loginsBy[k] || 0) + 1;
  });
  const map: Record<string, any> = {};
  (agents || []).forEach(u => {
    const c = coachKey(u);
    const x = map[c] || (map[c] = { key: c, team: 0, entered: 0, logins: 0, daySum: 0, absent: [] as string[], excused: 0 });
    const k = norm(u.game_id || u.username);
    if (excused.has(k) && !daysBy[k]) { x.excused++; return; } // excusado y no entró: no cuenta en contra
    x.team++;
    if (daysBy[k]) { x.entered++; x.logins += loginsBy[k] || 0; x.daySum += Math.min(daysBy[k].size, workdays); }
    else x.absent.push(u.game_id || u.name || "");
  });
  const rows: CoachUsageRow[] = Object.values(map).map((x: any) => {
    const reachPct = x.team ? (x.entered / x.team) * 100 : 0;
    const avgDays = x.team ? x.daySum / x.team : 0;
    const freqPct = Math.min(avgDays / workdays, 1) * 100;
    const index = Math.round((REACH_WEIGHT * reachPct + FREQ_WEIGHT * freqPct) * 10) / 10;
    return { key: x.key, team: x.team, entered: x.entered, logins: x.logins, reachPct: Math.round(reachPct), avgDays: Math.round(avgDays * 10) / 10, freqPct: Math.round(freqPct), index, rank: 0, absent: x.absent, excused: x.excused };
  });
  const ranked = rows.filter(r => r.key !== "SIN ASIGNAR").sort((a, b) => b.index - a.index || b.reachPct - a.reachPct || a.key.localeCompare(b.key));
  // posición con empates: mismo índice = misma posición (1, 1, 3, ...)
  ranked.forEach((r, i) => { r.rank = i > 0 && r.index === ranked[i - 1].index ? ranked[i - 1].rank : i + 1; });
  return { ranked, unassigned: rows.find(r => r.key === "SIN ASIGNAR") || null };
}

// Etiqueta de semana del Excel semanal ("W43-2026") para el lunes de un periodo.
export function isoWeekLabel(monday: Date) {
  const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // jueves de esa semana
  const week1 = new Date(d.getFullYear(), 0, 4);
  const n = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `W${n}-${monday.getFullYear()}`;
}
