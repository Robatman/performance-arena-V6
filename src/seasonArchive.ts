// @ts-nocheck
import { calcScoreCoins, inSeason, spentCoins } from "./coinsCalc";

// Foto del trimestre por agente (se guarda en season_archive ANTES de borrar nada).
// Pura: recibe las filas ya leídas y devuelve las filas a guardar; así se prueba sin tocar la base.
export function buildSeasonArchive({ users, wm, ra, ts, ar, bn, reds, seasonStart, seasonId, coinSettings }) {
  const by = (rows, key = "game_id") => {
    const m = {};
    (rows || []).forEach(r => { const k = String(r[key] || "").toUpperCase(); (m[k] = m[k] || []).push(r); });
    return m;
  };
  const mWm = by(wm), mRa = by(ra), mTs = by(ts), mAr = by(ar), mBn = by(bn);
  const mRed = {};
  (inSeason(reds, seasonStart) || []).forEach(r => { (mRed[r.user_id] = mRed[r.user_id] || []).push(r); });
  return (users || []).filter(u => u.active && u.game_id).map(u => {
    const k = String(u.game_id).toUpperCase();
    const bonusRows = mBn[k] || [];
    const bonusCoins = bonusRows.reduce((t, b) => t + (b.coins || 0), 0);
    const regs = mAr[k] || [];
    const asRegs = [...regs, ...bonusRows.map(b => ({ status: "approved", points_awarded: b.coins }))];
    const sc = calcScoreCoins(mWm[k] || [], mRa[k] || [], mTs[k] || [], u.kudos, u.gold_kudos, u.referrals, coinSettings, asRegs);
    const spent = spentCoins(mRed[u.id] || []);
    return {
      season_id: seasonId, game_id: u.game_id, agent_name: u.name, earned_coins: sc.coins, spent_coins: spent,
      breakdown: { performance: sc.kpiScore, riddles: sc.riddleScore, tasks: sc.taskScore, activities: sc.activityCoins - bonusCoins, bonuses: bonusCoins, kudos: sc.kudosCoins, referrals: sc.refCoins },
      weeks: (mWm[k] || []).map(w => ({ week: w.week, qa_pts: w.qa_pts, aht_pts: w.aht_pts, attendance_pts: w.attendance_pts, attendance_status: w.attendance_status, flag: w.flag })),
      activities: regs.map(a => ({ activity_id: a.activity_id, status: a.status, points_awarded: a.points_awarded, registered_at: a.registered_at })),
    };
  });
}
