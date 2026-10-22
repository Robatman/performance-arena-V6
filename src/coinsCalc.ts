// @ts-nocheck
// Cálculo de coins (puro, sin React): lo usan la app, el reinicio de trimestre y las pruebas.
// Coins ganados = performance semanal + riddles/tasks + kudos + referidos + actividades + bonos.
// Saldo = ganados - canjes de la temporada.

export function calcScoreCoins(weeklyMetrics, riddleAnswers, taskSubmissions, kudos, goldKudos, referrals, coinSettings: any = {}, activityRegistrations = []) {
  // Configurable coin values (admin-editable, defaults if not set)
  const riddleCoins = coinSettings?.riddle_coins ?? 2;
  const taskCoins   = coinSettings?.task_coins   ?? 2;

  // Score from weekly metrics (QA + AHT + Attendance per week)
  const kpiScore = (weeklyMetrics || []).reduce((sum, w) => {
    return sum + (w.qa_pts || 0) + (w.aht_pts || 0) + (w.attendance_pts || 0);
  }, 0);

  // Weeks in current data
  const weekCount = (weeklyMetrics || []).length;

  // Riddle points: riddleCoins per approved riddle answer
  // DB stores approved:true (boolean); also accept status:"approved" for forward-compat
  const riddleScore = (riddleAnswers || []).filter(r => r.approved === true || r.status === "approved").length * riddleCoins;

  // Task points: taskCoins per approved task submission
  const taskScore = (taskSubmissions || []).filter(t => t.approved === true || t.status === "approved").length * taskCoins;

  // Total score (for level)
  const score = kpiScore + riddleScore + taskScore;

  // Kudos & referral coins
  const kudosCoins = (kudos || 0) + (goldKudos || 0) * 5;
  const refCoins = (referrals || []).reduce((s, r) => s + (r.approved ? 5 : 1), 0);

  // Activities: admin decides the coin amount per approval (no fixed price),
  // so it's just a sum of whatever was awarded on each approved registration.
  const activityCoins = (activityRegistrations || []).filter(r => r.status === "approved").reduce((s, r) => s + (r.points_awarded || 0), 0);

  // Total coins (spendable)
  const coins = score + kudosCoins + refCoins + activityCoins;

  return {
    kpiScore,
    riddleScore,
    taskScore,
    score,          // for level calculation
    kudosCoins,
    activityCoins,
    refCoins,
    coins,          // for store
    weekCount,
  };
}



export const inSeason = (rows, seasonStart, field = "redeemed_at") =>
  seasonStart ? (rows || []).filter(r => Date.parse(r[field]) >= Date.parse(seasonStart)) : (rows || []);
export const spentCoins = (rows) => (rows || [])
  .filter(r => ["pending", "approved", "delivered"].includes(r.status))
  .reduce((s, r) => s + (r.points_spent || r.coins_spent || 0), 0);
export const usedRedemptions = (rows) => (rows || []).filter(r => r.status !== "cancelled").length;
export const extraRedemptions = (unlocks, seasonStart) =>
  inSeason(unlocks, seasonStart, "created_at").reduce((s, u) => s + (u.extra || 0), 0);

