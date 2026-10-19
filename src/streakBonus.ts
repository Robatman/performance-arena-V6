import { STREAK_BONUS, streakBlocks, type WeekRow } from "./kpiPoints";

// Paga el bono de racha (200 coins por cada 3 semanas seguidas en meta, 85%+).
// Relee TODAS las semanas de cada agente (no solo la subida de hoy) y registra cada
// bloque en coin_bonuses con (game_id, semana); por eso subir el mismo Excel dos veces
// o recalcular nunca paga dos veces el mismo bloque.
// `get(table, query)` e `insert(table, rows)` los pone quien llama (el navegador o una prueba).
export type StreakIO = {
  get: (table: string, query: string) => Promise<any>;
  insert: (table: string, rows: any) => Promise<void>;
};

export async function payStreakBonuses(io: StreakIO, onlyGameIds?: string[]): Promise<{ paid: { game_id: string; week: string }[] }> {
  const hist: any[] = [];
  for (let off = 0; ; off += 1000) {
    const page = await io.get("weekly_metrics", `select=game_id,week,qa_pts,aht_pts,attendance_pts,attendance_status,flag&order=game_id.asc,week.asc,id.asc&limit=1000&offset=${off}`);
    if (!Array.isArray(page)) throw new Error("No se pudo leer el historial semanal");
    hist.push(...page);
    if (page.length < 1000) break;
  }
  const paid = await io.get("coin_bonuses", "kind=eq.streak&select=game_id,week");
  if (!Array.isArray(paid)) throw new Error("Falta correr el SQL de coin_bonuses (columnas kind/week)");
  const paidKey = new Set<string>(paid.map((p: any) => `${String(p.game_id).toUpperCase()}|${p.week}`));
  const only = onlyGameIds ? new Set(onlyGameIds.map(g => g.toUpperCase())) : null;

  const byAgent = new Map<string, WeekRow[]>();
  hist.forEach(r => {
    const k = String(r.game_id || "").toUpperCase();
    if (!k || (only && !only.has(k))) return;
    const list = byAgent.get(k) || [];
    list.push({
      week: r.week,
      total: (r.qa_pts || 0) + (r.aht_pts || 0) + (r.attendance_pts || 0),
      excused: r.attendance_status === "excused" || r.flag === "msl",
    });
    byAgent.set(k, list);
  });

  const profs = await io.get("profiles", "select=id,game_id");
  const profByGame = new Map<string, { id: string; game_id: string }>((Array.isArray(profs) ? profs : []).map((p: any) => [String(p.game_id).toUpperCase(), { id: p.id, game_id: p.game_id }]));
  // El bono se guarda con el game_id EXACTO del perfil (las consultas del agente comparan tal cual).
  const firstSeen = new Map<string, string>();
  hist.forEach(r => { const k = String(r.game_id || "").toUpperCase(); if (k && !firstSeen.has(k)) firstSeen.set(k, r.game_id); });

  const bonuses: any[] = [];
  const notifs: any[] = [];
  const result: { game_id: string; week: string }[] = [];
  byAgent.forEach((rows, key) => {
    streakBlocks(rows).forEach(wk => {
      if (paidKey.has(`${key}|${wk}`)) return;
      const gid = profByGame.get(key)?.game_id || firstSeen.get(key) || key;
      bonuses.push({ game_id: gid, coins: STREAK_BONUS.coins, reason: `Racha de ${STREAK_BONUS.weeks} semanas en meta (hasta ${wk})`, given_by: "system", kind: "streak", week: wk });
      result.push({ game_id: gid, week: wk });
      const rid = profByGame.get(key)?.id;
      if (rid) notifs.push({ recipient_id: rid, title: `🔥 Bono de racha: +${STREAK_BONUS.coins} coins`, message: `Completaste ${STREAK_BONUS.weeks} semanas seguidas en meta (hasta ${wk}).`, type: "info", is_read: false });
    });
  });
  for (let i = 0; i < bonuses.length; i += 100) await io.insert("coin_bonuses", bonuses.slice(i, i + 100));
  for (let i = 0; i < notifs.length; i += 100) { try { await io.insert("notifications", notifs.slice(i, i + 100)); } catch { /* el aviso es opcional */ } }
  return { paid: result };
}
