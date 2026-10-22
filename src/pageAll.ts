// La API de Supabase devuelve como máximo 1,000 filas por consulta (aunque se pida
// limit=5000). Para tablas que crecen (weekly_metrics: ~216 agentes por semana,
// activity_registrations, canjes...) hay que leer por páginas. `path` DEBE traer un
// order estable (por ejemplo order=id.asc) para no repetir ni saltar filas.
export async function pageAll(fetchOne: (path: string) => Promise<any>, path: string, pageSize = 1000): Promise<any[]> {
  const out: any[] = [];
  for (let off = 0; ; off += pageSize) {
    const sep = path.includes("?") ? "&" : "?";
    const page = await fetchOne(`${path}${sep}limit=${pageSize}&offset=${off}`);
    if (!Array.isArray(page)) break;
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}
