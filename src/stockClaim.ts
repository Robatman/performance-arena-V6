// Reclamo atómico de stock. El PATCH solo aplica si el stock sigue siendo el que leímos,
// así que si dos agentes compran la última pieza a la vez solo uno gana y el otro recibe
// "agotado" sin que se le descuente nada.
export type Fetcher = (path: string, options?: any) => Promise<any>;

export async function claimStock(sbFetch: Fetcher, prizeId: string): Promise<{ ok: boolean; left?: number; soldOut?: boolean; error?: boolean }> {
  for (let i = 0; i < 12; i++) {
    const cur = await sbFetch(`reward_catalog?id=eq.${prizeId}&select=stock`);
    const stock = cur?.[0]?.stock;
    if (stock === undefined || stock === null) return { ok: false, error: true };
    if (stock === -1) return { ok: true, left: -1 };
    if (stock <= 0) return { ok: false, soldOut: true };
    const upd = await sbFetch(`reward_catalog?id=eq.${prizeId}&stock=eq.${stock}`, { method: "PATCH", body: JSON.stringify({ stock: stock - 1 }) });
    if (Array.isArray(upd) && upd.length === 1) return { ok: true, left: stock - 1 };
  }
  return { ok: false, soldOut: true };
}

export async function releaseStock(sbFetch: Fetcher, prizeId: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const cur = await sbFetch(`reward_catalog?id=eq.${prizeId}&select=stock`).catch(() => null);
    const stock = cur?.[0]?.stock;
    if (stock === undefined || stock === null || stock === -1) return;
    const upd = await sbFetch(`reward_catalog?id=eq.${prizeId}&stock=eq.${stock}`, { method: "PATCH", body: JSON.stringify({ stock: stock + 1 }) }).catch(() => null);
    if (Array.isArray(upd) && upd.length === 1) return;
  }
}
