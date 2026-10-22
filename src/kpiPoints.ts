// Puntos semanales de performance por métrica (única fuente de verdad).
// Cada métrica da: puntos completos si cumple, 40% si queda "igual" a la meta
// (o 1 tardanza en asistencia), y 0 si no. El 40% conserva la proporción 2/5
// que tenía la escala anterior (5 / 2 / 0).
export const KPI_FULL = { qa: 75, aht: 50, att: 75 } as const;
export const KPI_MID_RATIO = 0.4;
export const kpiMid = (full: number) => Math.round(full * KPI_MID_RATIO);
export const KPI_WEEK_MAX = KPI_FULL.qa + KPI_FULL.aht + KPI_FULL.att; // 200

// Color/semáforo de una semana según qué parte del máximo logró
// (equivale al 12/15 y 8/15 de la escala anterior).
export const weekTone = (pts: number): "good" | "warn" | "bad" =>
  pts >= KPI_WEEK_MAX * 0.8 ? "good" : pts >= KPI_WEEK_MAX * 0.53 ? "warn" : "bad";

// ─── Categorías de premios (sustituyen a los "niveles") ──────────────────────
// Ya no hay Rookie/Rising/Elite. Los premios se agrupan en 3 categorías por su
// valor, y las categorías 2 y 3 se abren con COINS GANADOS en el trimestre (no
// con el saldo): gastar no te quita la categoría. Primer trimestre = 11 semanas,
// por eso 1,500 y 2,200; antes de un trimestre completo (13 semanas) se pueden subir.
export const CATEGORY_GATES = { 2: 1500, 3: 2200 } as const;
export const unlockedCategory = (earned: number): 1 | 2 | 3 =>
  earned >= CATEGORY_GATES[3] ? 3 : earned >= CATEGORY_GATES[2] ? 2 : 1;
export const CATEGORY_NAMES: Record<number, string> = { 1: "Categoría 1", 2: "Categoría 2", 3: "Categoría 3" };

// Máximo de canjes por agente por trimestre (el admin puede desbloquear más).
export const MAX_REDEMPTIONS = 3;

// ─── Bono de racha ───────────────────────────────────────────────────────────
// 200 coins por cada 3 semanas seguidas "en meta" (85% o más del máximo semanal).
// Bloques sin traslape; una semana excusada ni rompe la racha ni cuenta.
export const STREAK_BONUS = { coins: 200, weeks: 3, minPct: 0.85 } as const;
export const STREAK_MIN_PTS = KPI_WEEK_MAX * STREAK_BONUS.minPct; // 170 de 200

export type WeekRow = { week: string; total: number; excused: boolean };

// "W42-2026" -> 202642 (para ordenar); cualquier otra etiqueta no se usa.
export const weekOrder = (label: string): number | null => {
  const m = /^W(\d{1,2})-(\d{4})$/.exec(label || "");
  return m ? Number(m[2]) * 100 + Number(m[1]) : null;
};

const orderedWeeks = (rows: WeekRow[]): WeekRow[] => {
  const seen = new Map<string, WeekRow>();
  rows.forEach(r => { if (weekOrder(r.week) !== null) seen.set(r.week, r); });
  return [...seen.values()].sort((a, b) => (weekOrder(a.week) as number) - (weekOrder(b.week) as number));
};

// Semanas en las que el agente completa un bloque de 3 seguidas en meta.
export function streakBlocks(rows: WeekRow[]): string[] {
  const out: string[] = [];
  let run = 0;
  for (const r of orderedWeeks(rows)) {
    if (r.excused) continue;
    if (r.total >= STREAK_MIN_PTS) {
      run++;
      if (run === STREAK_BONUS.weeks) { out.push(r.week); run = 0; }
    } else run = 0;
  }
  return out;
}

// Progreso actual hacia el siguiente bono (0, 1 o 2 semanas seguidas) y bonos ganados.
export function streakProgress(rows: WeekRow[]): { current: number; blocks: number } {
  let run = 0, blocks = 0;
  for (const r of orderedWeeks(rows)) {
    if (r.excused) continue;
    if (r.total >= STREAK_MIN_PTS) {
      run++;
      if (run === STREAK_BONUS.weeks) { blocks++; run = 0; }
    } else run = 0;
  }
  return { current: run, blocks };
}

// ─── Cálculo de puntos de una semana (lo usa la carga del Excel) ─────────────
export function calcAttendance(abs: number, tard: number) {
  if (abs >= 1 || tard >= 2) return { status: "absent" as const, pts: 0 };
  if (tard === 1) return { status: "late" as const, pts: kpiMid(KPI_FULL.att) };
  return { status: "perfect" as const, pts: KPI_FULL.att };
}

export function calcPts(val: number | null, goal: number | null, higherBetter: boolean, full: number): number {
  if (val === null || goal === null) return 0;
  if (higherBetter) return val > goal ? full : val === goal ? kpiMid(full) : 0;
  // time: lower is better, but 0 means no calls = 0 pts
  if (val === 0) return 0;
  return val < goal ? full : val === goal ? kpiMid(full) : 0;
}

