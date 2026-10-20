// Ranking de coaches por USO de la app (solo si sus agentes entran; no importa qué hagan adentro).
//
// Fórmula equitativa: todo se mide POR AGENTE del equipo, nunca en totales, así un coach con 15
// agentes no gana por tener más gente que uno con 10.
//   alcance    = agentes que entraron al menos un día / agentes del equipo            (0 a 100)
//   frecuencia = (días distintos con acceso por agente, promedio del equipo) / 5 días  (0 a 100)
//   índice     = 70% alcance + 30% frecuencia
// Si dos equipos se comportan igual (por ejemplo, todos entran todos los días) sacan el mismo
// índice aunque uno sea de 10 y el otro de 15, y comparten posición.

export const REACH_WEIGHT = 0.7;
export const FREQ_WEIGHT = 0.3;
export const WORKDAYS = 5;

export type UsageAgent = { game_id?: string; username?: string; name?: string; coach_id?: string };
export type UsageLogin = { game_id?: string; user_type?: string; logged_in_at: string };

export type CoachUsageRow = {
  key: string; team: number; entered: number; logins: number;
  reachPct: number; avgDays: number; freqPct: number; index: number; rank: number; absent: string[];
};

const norm = (v: any) => String(v || "").trim().toUpperCase();
export const noCoach = (v: any) => !v || !String(v).trim() || /pending|sin asignar/i.test(String(v));
export const coachKey = (u: UsageAgent) => (noCoach(u.coach_id) ? "SIN ASIGNAR" : norm(u.coach_id));
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA"); // día local AAAA-MM-DD

// Semana de lunes a domingo (hora local). offset 0 = esta semana, 1 = la pasada, ...
export function weekRange(offset = 0, now = new Date()) {
  const dow = (now.getDay() + 6) % 7; // lunes = 0
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow - 7 * offset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  const fmt = (d: Date) => d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
  return { start, end, label: `${fmt(start)} al ${fmt(last)}` };
}

export function computeCoachUsage(agents: UsageAgent[], logins: UsageLogin[]) {
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
    const x = map[c] || (map[c] = { key: c, team: 0, entered: 0, logins: 0, daySum: 0, absent: [] as string[] });
    x.team++;
    const k = norm(u.game_id || u.username);
    if (daysBy[k]) { x.entered++; x.logins += loginsBy[k] || 0; x.daySum += daysBy[k].size; }
    else x.absent.push(u.game_id || u.name || "");
  });
  const rows: CoachUsageRow[] = Object.values(map).map((x: any) => {
    const reachPct = x.team ? (x.entered / x.team) * 100 : 0;
    const avgDays = x.team ? x.daySum / x.team : 0;
    const freqPct = Math.min(avgDays / WORKDAYS, 1) * 100;
    const index = Math.round((REACH_WEIGHT * reachPct + FREQ_WEIGHT * freqPct) * 10) / 10;
    return { key: x.key, team: x.team, entered: x.entered, logins: x.logins, reachPct: Math.round(reachPct), avgDays: Math.round(avgDays * 10) / 10, freqPct: Math.round(freqPct), index, rank: 0, absent: x.absent };
  });
  const ranked = rows.filter(r => r.key !== "SIN ASIGNAR").sort((a, b) => b.index - a.index || b.reachPct - a.reachPct || a.key.localeCompare(b.key));
  // posición con empates: mismo índice = misma posición (1, 1, 3, ...)
  ranked.forEach((r, i) => { r.rank = i > 0 && r.index === ranked[i - 1].index ? ranked[i - 1].rank : i + 1; });
  return { ranked, unassigned: rows.find(r => r.key === "SIN ASIGNAR") || null };
}
