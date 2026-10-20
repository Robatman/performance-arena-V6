// Ranking de coaches por USO DIARIO de la app (solo si sus agentes entran; no importa qué hagan adentro).
//
// Para cada día hábil (lunes a viernes) se mide qué % de los agentes del coach entró ESE día.
//   % del día   = agentes del coach que entraron ese día / agentes del equipo
//   índice      = promedio de los % de los días hábiles transcurridos del periodo   (0 a 100)
//   vista "Hoy" = solo el % del día de hoy
// Todo se calcula por agente del equipo, nunca en totales, así un coach con 15 agentes no gana por
// tener más gente que uno con 10: si ambos equipos entran igual sacan lo mismo y comparten posición.
// Se cuentan DÍAS con acceso, no inicios de sesión: entrar 20 veces en un día vale igual que una vez.
// Agentes en vacaciones, incapacidad o MSL (semana excusada en el Excel semanal) que NO entraron no
// cuentan en contra: salen del equipo de esa semana. Si entraron igual, cuentan normal.
// Los accesos en fin de semana no cuentan (el ranking es de lunes a viernes).

// El ranking arranca con el uso de HOY (martes 20-oct-2026); no se toman días anteriores.
export const LAUNCH_DATE = new Date(2026, 9, 20);
export const WORKDAYS = 5;

export type UsageAgent = { game_id?: string; username?: string; name?: string; coach_id?: string };
export type UsageLogin = { game_id?: string; user_type?: string; logged_in_at: string };
export type DayStat = { day: string; entered: number; pct: number };

export type CoachUsageRow = {
  key: string; team: number; entered: number; logins: number;
  reachPct: number;        // agentes que entraron al menos un día del periodo
  index: number;           // promedio de los % diarios (0 a 100)
  rank: number;            // posición con empates
  daily: DayStat[];        // % por día hábil
  todayPct: number; todayRank: number; // vista "Hoy" (último día hábil transcurrido)
  absent: string[]; excused: number;
};

const norm = (v: any) => String(v || "").trim().toUpperCase();
export const noCoach = (v: any) => !v || !String(v).trim() || /pending|sin asignar/i.test(String(v));
export const coachKey = (u: UsageAgent) => (noCoach(u.coach_id) ? "SIN ASIGNAR" : norm(u.coach_id));
export const dayKey = (d: Date) => d.toLocaleDateString("en-CA"); // día local AAAA-MM-DD
const dayOf = (iso: string) => dayKey(new Date(iso));

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

// Días hábiles (lunes a viernes) del periodo transcurridos hasta hoy inclusive, como AAAA-MM-DD.
export function workdayKeys(range: { effStart: Date; end: Date }, now = new Date()): string[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const stop = new Date(Math.min(range.end.getTime() - 86400000, today.getTime()));
  const out: string[] = [];
  for (let d = new Date(range.effStart); d <= stop; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd >= 1 && wd <= 5) out.push(dayKey(d));
  }
  return out;
}

export function computeCoachUsage(agents: UsageAgent[], logins: UsageLogin[], days: string[], excused: Set<string> = new Set()) {
  const dayList = days || [];
  const daySet = new Set(dayList);
  const daysBy: Record<string, Set<string>> = {};
  const loginsBy: Record<string, number> = {};
  (logins || []).filter(l => !l.user_type || l.user_type === "agent").forEach(l => {
    const k = norm(l.game_id);
    const d = dayOf(l.logged_in_at);
    if (!daySet.has(d)) return; // fin de semana o fuera del periodo
    (daysBy[k] = daysBy[k] || new Set()).add(d);
    loginsBy[k] = (loginsBy[k] || 0) + 1;
  });
  const map: Record<string, any> = {};
  (agents || []).forEach(u => {
    const c = coachKey(u);
    const x = map[c] || (map[c] = { key: c, team: 0, entered: 0, logins: 0, perDay: {} as Record<string, number>, absent: [] as string[], excused: 0 });
    const k = norm(u.game_id || u.username);
    if (excused.has(k) && !daysBy[k]) { x.excused++; return; } // excusado y no entró: no cuenta en contra
    x.team++;
    if (daysBy[k]) {
      x.entered++; x.logins += loginsBy[k] || 0;
      daysBy[k].forEach(d => { x.perDay[d] = (x.perDay[d] || 0) + 1; });
    } else x.absent.push(u.game_id || u.name || "");
  });
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const rows: CoachUsageRow[] = Object.values(map).map((x: any) => {
    const daily: DayStat[] = dayList.map(d => ({ day: d, entered: x.perDay[d] || 0, pct: x.team ? ((x.perDay[d] || 0) / x.team) * 100 : 0 }));
    const index = daily.length ? r1(daily.reduce((s, d) => s + d.pct, 0) / daily.length) : 0;
    const today = daily.length ? daily[daily.length - 1].pct : 0;
    return {
      key: x.key, team: x.team, entered: x.entered, logins: x.logins,
      reachPct: x.team ? Math.round((x.entered / x.team) * 100) : 0,
      index, rank: 0, daily: daily.map(d => ({ ...d, pct: Math.round(d.pct) })),
      todayPct: Math.round(today), todayRank: 0, absent: x.absent, excused: x.excused,
    };
  });
  const ranked = rows.filter(r => r.key !== "SIN ASIGNAR").sort((a, b) => b.index - a.index || b.reachPct - a.reachPct || a.key.localeCompare(b.key));
  // posición con empates: mismo valor = misma posición (1, 1, 3, ...)
  ranked.forEach((r, i) => { r.rank = i > 0 && r.index === ranked[i - 1].index ? ranked[i - 1].rank : i + 1; });
  [...ranked].sort((a, b) => b.todayPct - a.todayPct || a.key.localeCompare(b.key))
    .forEach((r, i, arr) => { r.todayRank = i > 0 && r.todayPct === arr[i - 1].todayPct ? arr[i - 1].todayRank : i + 1; });
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
