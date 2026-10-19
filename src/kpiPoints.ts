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
