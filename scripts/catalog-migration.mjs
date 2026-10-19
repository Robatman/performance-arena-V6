// Migración del catálogo de premios al esquema de categorías (2026-10-19).
//   node scripts/catalog-migration.mjs                 -> ensayo: muestra cambios y guarda respaldo, NO escribe
//   node scripts/catalog-migration.mjs --apply         -> aplica (guarda respaldo antes)
//   node scripts/catalog-migration.mjs --rollback FILE -> restaura precios y categorías desde un respaldo
// Regla: 250 -> 600 y 2,000 -> 2,200 (lineal), redondeado a 50. Categoría por precio nuevo:
// menos de 1,100 = 1 | 1,100 a 2,199 = 2 | 2,200 o más = 3. El stock NO se toca.
import fs from "node:fs";
const src = fs.readFileSync(new URL("../src/components/Activities.tsx", import.meta.url), "utf8");
const KEY = process.env.SUPABASE_KEY || /eyJ[A-Za-z0-9_.-]+/.exec(src)[0];
const URL_ = "https://dxwjjptjyhiitejupvaq.supabase.co/rest/v1";
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const get = async (p) => { const r = await fetch(`${URL_}/${p}`, { headers: H }); if (!r.ok) throw new Error(await r.text()); return r.json(); };
const patch = async (id, body) => { const r = await fetch(`${URL_}/reward_catalog?id=eq.${id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(await r.text()); };
const newPrice = (old) => Math.round((600 + (old - 250) * (1600 / 1750)) / 50) * 50;
const category = (price) => (price < 1100 ? 1 : price < 2200 ? 2 : 3);

const args = process.argv.slice(2);
if (args[0] === "--rollback") {
  const rows = JSON.parse(fs.readFileSync(args[1], "utf8"));
  for (const r of rows) await patch(r.id, { points_cost: r.points_cost, coins_cost: r.coins_cost, min_level: r.min_level });
  console.log(`Restaurados ${rows.length} premios desde ${args[1]}`);
  process.exit(0);
}

const cat = await get("reward_catalog?is_active=eq.true&select=id,name,points_cost,coins_cost,min_level,stock&order=points_cost.asc");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = new URL(`./catalog-backup-${stamp}.json`, import.meta.url);
fs.writeFileSync(backup, JSON.stringify(cat, null, 2));
console.log(`Respaldo guardado: ${backup.pathname.replace(/^\//, "")} (${cat.length} premios)\n`);
const plan = cat.map((p) => { const price = newPrice(p.points_cost); return { ...p, new_price: price, new_cat: category(price) }; });
const byCat = { 1: [], 2: [], 3: [] };
plan.forEach((p) => byCat[p.new_cat].push(p));
for (const c of [1, 2, 3]) {
  console.log(`CATEGORIA ${c}: ${byCat[c].length} premios, ${byCat[c].reduce((s, p) => s + (p.stock > 0 ? p.stock : 0), 0)} piezas`);
  byCat[c].sort((a, b) => a.new_price - b.new_price).forEach((p) => console.log(`  ${String(p.points_cost).padStart(5)} -> ${String(p.new_price).padStart(5)} | cat ${p.min_level} -> ${p.new_cat} | stock ${p.stock} | ${p.name.trim().slice(0, 60)}`));
}
if (args[0] === "--apply") {
  for (const p of plan) await patch(p.id, { points_cost: p.new_price, coins_cost: p.new_price, min_level: p.new_cat });
  console.log(`\nAPLICADO a ${plan.length} premios. Para revertir: node scripts/catalog-migration.mjs --rollback scripts/catalog-backup-${stamp}.json`);
} else {
  console.log("\n(ensayo: no se escribió nada. Usa --apply para aplicar)");
}
