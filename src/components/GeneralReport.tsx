import { useState, useEffect } from "react";

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";

async function sbFetch(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ─── Types ────────────────────────────────────────────────────────────────

interface WeeklyMetric {
  id: string;
  game_id: string;
  week: string;
  project: string;
  coach: string;
  qa_coach: string;
  aht: number | null;
  aht_goal: number | null;
  aht_type: string;
  qa_pct: number | null;
  qa_goal: number | null;
  absences: number;
  tardies: number;
  attendance_status: string;
  attendance_pts: number;
  aht_pts: number;
  qa_pts: number;
  total_pts: number;
  flag: string | null;
  review_reason: string | null;
  username?: string;
}

interface AgentSummary {
  game_id: string;
  username: string;
  project: string;
  coach: string;
  qa_coach: string;
  weeks: number;
  avg_qa: number;
  avg_aht_pts: number;
  avg_attendance_pts: number;
  total_score: number;
  avg_score: number;
  flags: number;
  level: string;
}

interface ProjectSummary {
  project: string;
  agents: number;
  avg_score: number;
  top_agent: string;
  flags: number;
}

interface CoachSummary {
  coach: string;
  agents: number;
  avg_score: number;
  best_agent: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getLevel(score: number): string {
  if (score >= 90) return "Platinum";
  if (score >= 70) return "Gold";
  if (score >= 50) return "Silver";
  return "Bronze";
}

function getLevelColor(level: string): string {
  if (level === "Platinum") return "#e2e8f0";
  if (level === "Gold") return "#fbbf24";
  if (level === "Silver") return "#94a3b8";
  return "#cd7c2f";
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

// ─── IA: build prompt ────────────────────────────────────────────────────

function buildInsightPrompt(
  agentSummaries: AgentSummary[],
  projectSummaries: ProjectSummary[],
  coachSummaries: CoachSummary[],
  weekLabel: string,
  projectLabel: string,
  question: string
): string {
  const top5 = agentSummaries.slice(0, 5).map(a =>
    `${a.username} (${a.project}, coach: ${a.coach}, score prom: ${fmt(a.avg_score)}, QA: ${fmt(a.avg_qa)}%, flags: ${a.flags}, nivel: ${a.level})`
  ).join("\n");

  const bottom5 = agentSummaries.slice(-5).map(a =>
    `${a.username} (${a.project}, coach: ${a.coach}, score prom: ${fmt(a.avg_score)}, flags: ${a.flags})`
  ).join("\n");

  const projStr = projectSummaries.map(p =>
    `${p.project}: ${p.agents} agentes, score prom ${fmt(p.avg_score)}, flags: ${p.flags}`
  ).join("\n");

  const coachStr = coachSummaries.map(c =>
    `${c.coach}: ${c.agents} agentes, score prom equipo ${fmt(c.avg_score)}, mejor agente: ${c.best_agent}`
  ).join("\n");

  const total = agentSummaries.length;
  const plat = agentSummaries.filter(a => a.level === "Platinum").length;
  const gold = agentSummaries.filter(a => a.level === "Gold").length;
  const bronze = agentSummaries.filter(a => a.level === "Bronze").length;
  const flagged = agentSummaries.filter(a => a.flags > 0).length;

  return `Eres un analista de desempeño de call center. Analiza estos datos de Performance Arena y responde la pregunta del administrador en español, de forma clara, directa y accionable. Usa bullets cuando sea útil. Máximo 300 palabras.

DATOS DEL REPORTE
Filtro: Semana = ${weekLabel} | Proyecto = ${projectLabel}
Total agentes: ${total}
Distribución: Platinum ${plat} | Gold ${gold} | Bronze ${bronze}
Agentes con flags: ${flagged}

TOP 5 AGENTES:
${top5}

BOTTOM 5 AGENTES:
${bottom5}

POR PROYECTO:
${projStr}

POR COACH:
${coachStr}

PREGUNTA:
${question}`;
}

// ─── AI Insights Panel ────────────────────────────────────────────────────

const QUICK_QUESTIONS = [
  "¿Quiénes están en riesgo de bajar de nivel?",
  "¿Qué proyecto necesita más atención?",
  "¿Cuál coach tiene el equipo más sólido?",
  "¿Qué patrón tienen los agentes con flags?",
  "Dame un resumen ejecutivo del período",
  "¿Quiénes son candidatos a reconocimiento?",
];

function AIInsightsPanel({
  agentSummaries, projectSummaries, coachSummaries, weekLabel, projectLabel,
}: {
  agentSummaries: AgentSummary[];
  projectSummaries: ProjectSummary[];
  coachSummaries: CoachSummary[];
  weekLabel: string;
  projectLabel: string;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [history, setHistory] = useState<{ q: string; a: string }[]>([]);

  const ask = async (q: string) => {
    if (!q.trim() || aiLoading) return;
    setAiLoading(true);
    setAnswer("");
    const prompt = buildInsightPrompt(agentSummaries, projectSummaries, coachSummaries, weekLabel, projectLabel, q);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "No se pudo generar el análisis.";
      setAnswer(text);
      setHistory(h => [{ q, a: text }, ...h].slice(0, 5));
    } catch {
      setAnswer("Error al conectar con el análisis IA. Intenta de nuevo.");
    }
    setAiLoading(false);
    setQuestion("");
  };

  return (
    <div style={{
      background: "#080f1f",
      border: "1px solid #3730a3",
      borderRadius: 14,
      padding: 20,
      marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "#312e81",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, color: "#a5b4fc",
        }}>✦</div>
        <div>
          <div style={{ color: "#c7d2fe", fontWeight: 700, fontSize: 14 }}>Análisis IA</div>
          <div style={{ color: "#4b5563", fontSize: 11 }}>
            Claude analiza los datos y responde tus preguntas sobre rendimiento
          </div>
        </div>
      </div>

      {/* Quick questions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {QUICK_QUESTIONS.map((q) => (
          <button key={q} onClick={() => ask(q)} disabled={aiLoading}
            style={{
              background: "#0f172a", border: "1px solid #312e81",
              borderRadius: 20, padding: "5px 12px",
              color: "#a5b4fc", fontSize: 11, cursor: "pointer",
              fontWeight: 500, opacity: aiLoading ? 0.5 : 1,
            }}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          style={{
            flex: 1, background: "#0f172a", border: "1px solid #1e3a5f",
            borderRadius: 8, padding: "10px 14px", color: "#e2e8f0",
            fontSize: 13, outline: "none",
          }}
          placeholder="Escribe tu pregunta sobre el rendimiento del equipo..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(question)}
          disabled={aiLoading}
        />
        <button onClick={() => ask(question)} disabled={aiLoading || !question.trim()}
          style={{
            background: aiLoading ? "#1e1b4b" : "#4f46e5",
            color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 18px", cursor: "pointer", fontWeight: 700,
            fontSize: 13, opacity: !question.trim() ? 0.4 : 1, minWidth: 80,
          }}>
          {aiLoading ? "..." : "Analizar"}
        </button>
      </div>

      {/* Spinner */}
      {aiLoading && (
        <div style={{
          background: "#0c1030", border: "1px solid #1e1b4b",
          borderRadius: 10, padding: "14px 18px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: "50%",
            border: "2px solid #4f46e5", borderTopColor: "transparent",
            animation: "ia-spin 0.8s linear infinite",
          }} />
          <span style={{ color: "#6366f1", fontSize: 13 }}>Analizando datos...</span>
          <style>{`@keyframes ia-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Answer */}
      {answer && !aiLoading && (
        <div style={{
          background: "#0c1030", border: "1px solid #312e81",
          borderRadius: 10, padding: "16px 18px", marginBottom: 12,
        }}>
          <div style={{ color: "#818cf8", fontSize: 11, fontWeight: 600, marginBottom: 8, letterSpacing: "0.05em" }}>
            ANÁLISIS IA
          </div>
          <div style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
            {answer}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div>
          <div style={{ color: "#374151", fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
            Consultas anteriores
          </div>
          {history.slice(1).map((h, i) => (
            <div key={i} style={{
              background: "#0a0f1f", border: "1px solid #1e293b",
              borderRadius: 8, padding: "10px 14px", marginBottom: 6,
            }}>
              <div style={{ color: "#6366f1", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{h.q}</div>
              <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {h.a.length > 220 ? h.a.slice(0, 220) + "…" : h.a}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function GeneralReport() {
  const [metrics, setMetrics] = useState<WeeklyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<"excel" | "pdf" | null>(null);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => { fetchData(); }, []);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const data: any[] = await sbFetch(
        "weekly_metrics?select=*,profiles!weekly_metrics_game_id_fkey(username)&order=week.desc,total_pts.desc"
      );
      const enriched = data.map((m) => ({ ...m, username: m.profiles?.username || m.game_id }));
      setMetrics(enriched);
      setWeeks([...new Set(enriched.map((m) => m.week))].sort().reverse() as string[]);
    } catch { setMetrics([]); }
    setLoading(false);
  };

  const filtered = metrics.filter((m) => {
    return (selectedWeek === "all" || m.week === selectedWeek) &&
           (selectedProject === "all" || m.project === selectedProject);
  });

  const projects = [...new Set(metrics.map((m) => m.project))].sort();

  // Agent summaries
  const agentMap = new Map<string, WeeklyMetric[]>();
  filtered.forEach((m) => {
    if (!agentMap.has(m.game_id)) agentMap.set(m.game_id, []);
    agentMap.get(m.game_id)!.push(m);
  });
  const agentSummaries: AgentSummary[] = Array.from(agentMap.entries()).map(([game_id, rows]) => {
    const totalScore = rows.reduce((a, r) => a + r.total_pts, 0);
    return {
      game_id, username: rows[0].username || game_id,
      project: rows[0].project, coach: rows[0].coach, qa_coach: rows[0].qa_coach,
      weeks: rows.length,
      avg_qa: avg(rows.filter(r => r.qa_pct != null).map(r => r.qa_pct!)),
      avg_aht_pts: avg(rows.map(r => r.aht_pts)),
      avg_attendance_pts: avg(rows.map(r => r.attendance_pts)),
      total_score, avg_score: avg(rows.map(r => r.total_pts)),
      flags: rows.filter(r => r.flag).length,
      level: getLevel(totalScore),
    };
  }).sort((a, b) => b.total_score - a.total_score);

  // Project summaries
  const projectMap = new Map<string, AgentSummary[]>();
  agentSummaries.forEach(a => {
    if (!projectMap.has(a.project)) projectMap.set(a.project, []);
    projectMap.get(a.project)!.push(a);
  });
  const projectSummaries: ProjectSummary[] = Array.from(projectMap.entries()).map(([project, agents]) => ({
    project, agents: agents.length,
    avg_score: avg(agents.map(a => a.avg_score)),
    top_agent: agents[0]?.username || "-",
    flags: agents.reduce((a, b) => a + b.flags, 0),
  })).sort((a, b) => b.avg_score - a.avg_score);

  // Coach summaries
  const coachMap = new Map<string, AgentSummary[]>();
  agentSummaries.forEach(a => {
    if (!a.coach) return;
    if (!coachMap.has(a.coach)) coachMap.set(a.coach, []);
    coachMap.get(a.coach)!.push(a);
  });
  const coachSummaries: CoachSummary[] = Array.from(coachMap.entries()).map(([coach, agents]) => ({
    coach, agents: agents.length,
    avg_score: avg(agents.map(a => a.avg_score)),
    best_agent: [...agents].sort((a, b) => b.avg_score - a.avg_score)[0]?.username || "-",
  })).sort((a, b) => b.avg_score - a.avg_score);

  // Computed values
  const totalAgents = agentSummaries.length;
  const flaggedAgents = agentSummaries.filter(a => a.flags > 0).length;
  const platinumCount = agentSummaries.filter(a => a.level === "Platinum").length;
  const goldCount = agentSummaries.filter(a => a.level === "Gold").length;
  const silverCount = agentSummaries.filter(a => a.level === "Silver").length;
  const bronzeCount = agentSummaries.filter(a => a.level === "Bronze").length;
  const overallAvg = avg(agentSummaries.map(a => a.avg_score));
  const topProject = projectSummaries[0]?.project || "-";
  const topCoach = coachSummaries[0]?.coach || "-";
  const reportDate = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
  const weekLabel = selectedWeek === "all" ? "Todas las semanas" : selectedWeek;
  const projectLabel = selectedProject === "all" ? "Todos los proyectos" : selectedProject;

  // ── EXCEL ────────────────────────────────────────────────────────────────
  const exportExcel = async () => {
    setGenerating("excel");
    try {
      const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs" as any);
      const wb = XLSX.utils.book_new();

      const ws1 = XLSX.utils.aoa_to_sheet([
        ["REPORTE GENERAL — PERFORMANCE ARENA"],
        [`Generado: ${reportDate}`],
        [`Semana: ${weekLabel}  |  Proyecto: ${projectLabel}`],
        [],
        ["RESUMEN EJECUTIVO"], ["Métrica", "Valor"],
        ["Total agentes", totalAgents], ["Score promedio", fmt(overallAvg)],
        ["Platinum", platinumCount], ["Gold", goldCount],
        ["Silver", silverCount], ["Bronze", bronzeCount],
        ["Con flags", flaggedAgents], ["Proyecto top", topProject], ["Coach top", topCoach],
      ]);
      ws1["!cols"] = [{ wch: 35 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws1, "Resumen");

      const agentH = ["Game ID","Agente","Proyecto","Coach","QA Coach","Semanas","QA Prom %","AHT Pts","Asist Pts","Score Total","Score Prom","Flags","Nivel"];
      const ws2 = XLSX.utils.aoa_to_sheet([agentH, ...agentSummaries.map(a => [
        a.game_id,a.username,a.project,a.coach,a.qa_coach,a.weeks,
        fmt(a.avg_qa),fmt(a.avg_aht_pts),fmt(a.avg_attendance_pts),
        a.total_score,fmt(a.avg_score),a.flags,a.level,
      ])]);
      ws2["!cols"] = agentH.map(h => ({ wch: Math.max(h.length + 2, 14) }));
      XLSX.utils.book_append_sheet(wb, ws2, "Agentes");

      const ws3 = XLSX.utils.aoa_to_sheet([
        ["Proyecto","# Agentes","Score Prom","Top Agente","Flags"],
        ...projectSummaries.map(p => [p.project,p.agents,fmt(p.avg_score),p.top_agent,p.flags]),
      ]);
      ws3["!cols"] = [{ wch:25 },{ wch:12 },{ wch:14 },{ wch:25 },{ wch:10 }];
      XLSX.utils.book_append_sheet(wb, ws3, "Proyectos");

      const ws4 = XLSX.utils.aoa_to_sheet([
        ["Coach","# Agentes","Score Prom Equipo","Mejor Agente"],
        ...coachSummaries.map(c => [c.coach,c.agents,fmt(c.avg_score),c.best_agent]),
      ]);
      ws4["!cols"] = [{ wch:25 },{ wch:12 },{ wch:20 },{ wch:25 }];
      XLSX.utils.book_append_sheet(wb, ws4, "Coaches");

      const rawH = ["Game ID","Agente","Semana","Proyecto","Coach","QA Coach","AHT","AHT Goal","AHT Type","QA %","QA Goal","Ausencias","Tardanzas","Estado Asist","Pts Asist","Pts AHT","Pts QA","Total Pts","Flag","Razón"];
      const ws5 = XLSX.utils.aoa_to_sheet([rawH, ...filtered.map(m => [
        m.game_id,m.username,m.week,m.project,m.coach,m.qa_coach,
        m.aht??"",m.aht_goal??"",m.aht_type,m.qa_pct??"",m.qa_goal??"",
        m.absences,m.tardies,m.attendance_status,
        m.attendance_pts,m.aht_pts,m.qa_pts,m.total_pts,m.flag??"",m.review_reason??"",
      ])]);
      ws5["!cols"] = rawH.map(() => ({ wch: 16 }));
      XLSX.utils.book_append_sheet(wb, ws5, "Datos");

      const ws6 = XLSX.utils.aoa_to_sheet([
        ["INSIGHTS DE RENDIMIENTO"], [],
        ["Distribución por nivel"], ["Nivel","Agentes","% del total"],
        ["Platinum",platinumCount, totalAgents ? fmt((platinumCount/totalAgents)*100)+"%" : "0%"],
        ["Gold",goldCount, totalAgents ? fmt((goldCount/totalAgents)*100)+"%" : "0%"],
        ["Silver",silverCount, totalAgents ? fmt((silverCount/totalAgents)*100)+"%" : "0%"],
        ["Bronze",bronzeCount, totalAgents ? fmt((bronzeCount/totalAgents)*100)+"%" : "0%"],
        [], ["Agentes con flags"], ["Game ID","Agente","Proyecto","Flags","Score Prom"],
        ...agentSummaries.filter(a => a.flags > 0).map(a => [a.game_id,a.username,a.project,a.flags,fmt(a.avg_score)]),
      ]);
      ws6["!cols"] = [{ wch:20 },{ wch:25 },{ wch:20 },{ wch:10 },{ wch:14 }];
      XLSX.utils.book_append_sheet(wb, ws6, "Insights");

      XLSX.writeFile(wb, `Performance_Arena_${selectedWeek === "all" ? "General" : selectedWeek}.xlsx`);
      showToast("Excel generado correctamente", "success");
    } catch (e: any) { showToast(`Error: ${e.message}`, "error"); }
    setGenerating(null);
  };

  // ── PDF ──────────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    setGenerating("pdf");
    try {
      const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js" as any);
      const { default: autoTable } = await import("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js" as any);

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();

      const C = {
        dark: [15,23,42] as [number,number,number],
        card: [22,36,58] as [number,number,number],
        accent: [59,130,246] as [number,number,number],
        white: [255,255,255] as [number,number,number],
        light: [241,245,249] as [number,number,number],
        muted: [100,116,139] as [number,number,number],
        danger: [127,29,29] as [number,number,number],
      };

      const bg = () => { doc.setFillColor(...C.dark); doc.rect(0,0,W,H,"F"); };
      const header = (title: string, sub: string) => {
        bg();
        doc.setFillColor(...C.accent); doc.rect(0,0,W,18,"F");
        doc.setTextColor(...C.white); doc.setFont("helvetica","bold"); doc.setFontSize(13);
        doc.text("PERFORMANCE ARENA — " + title.toUpperCase(), 10, 12);
        doc.setFont("helvetica","normal"); doc.setFontSize(8);
        doc.text(sub, W-10, 12, { align:"right" });
      };
      const tStyles = {
        headStyles: { fillColor: C.accent, textColor: C.white, fontStyle:"bold" as const, fontSize:8 },
        bodyStyles: { fillColor: C.card, textColor: C.light, fontSize:7.5 },
        alternateRowStyles: { fillColor: [15,26,46] as [number,number,number] },
        styles: { lineColor: [30,58,95] as [number,number,number], lineWidth:0.2 },
        margin: { left:10, right:10 },
      };

      // Pág 1 — Resumen
      header("Reporte general", `${reportDate} | ${weekLabel} | ${projectLabel}`);
      const kpis = [
        {l:"Agentes",v:String(totalAgents)},{l:"Score prom",v:fmt(overallAvg)},
        {l:"Platinum",v:String(platinumCount)},{l:"Gold",v:String(goldCount)},
        {l:"Silver",v:String(silverCount)},{l:"Bronze",v:String(bronzeCount)},
        {l:"Con flags",v:String(flaggedAgents)},
      ];
      const cw = (W-20)/kpis.length;
      kpis.forEach((k,i) => {
        const x = 10+i*cw;
        doc.setFillColor(...C.card); doc.roundedRect(x,22,cw-2,22,2,2,"F");
        doc.setTextColor(...C.accent); doc.setFont("helvetica","bold"); doc.setFontSize(14);
        doc.text(k.v, x+(cw-2)/2, 31, {align:"center"});
        doc.setTextColor(...C.muted); doc.setFont("helvetica","normal"); doc.setFontSize(7);
        doc.text(k.l, x+(cw-2)/2, 38, {align:"center"});
      });
      doc.setTextColor(...C.white); doc.setFont("helvetica","bold"); doc.setFontSize(9);
      doc.text("Insights clave", 10, 52);
      doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...C.light);
      [
        `• Proyecto líder: ${topProject}`,
        `• Coach con mejor equipo: ${topCoach}`,
        `• ${flaggedAgents} agentes requieren atención`,
        `• Gold+Platinum: ${platinumCount+goldCount} agentes (${totalAgents ? fmt(((platinumCount+goldCount)/totalAgents)*100) : 0}%)`,
      ].forEach((l,i) => doc.text(l, 10, 58+i*5.5));

      doc.setTextColor(...C.white); doc.setFont("helvetica","bold"); doc.setFontSize(9);
      doc.text("Top ranking de agentes", 10, 84);
      autoTable(doc, {
        startY:87,
        head:[["#","Agente","Proyecto","Coach","QA%","AHT Pts","Asist","Score Prom","Total","Nivel"]],
        body:agentSummaries.slice(0,30).map((a,i) => [
          i+1,a.username,a.project,a.coach,
          fmt(a.avg_qa)+"%",fmt(a.avg_aht_pts),fmt(a.avg_attendance_pts),
          fmt(a.avg_score),a.total_score,a.level,
        ]),
        ...tStyles,
        didParseCell:(d: any) => {
          if(d.column.index===9 && d.section==="body") {
            const lv = d.cell.raw as string;
            d.cell.styles.textColor = lv==="Platinum"?[226,232,240]:lv==="Gold"?[251,191,36]:lv==="Silver"?[148,163,184]:[205,124,47];
          }
        },
      });

      // Pág 2 — Proyectos y coaches
      doc.addPage(); header("Rankings por proyecto y coach", reportDate);
      doc.setTextColor(...C.white); doc.setFont("helvetica","bold"); doc.setFontSize(9);
      doc.text("Por proyecto", 10, 24);
      autoTable(doc, { startY:27, head:[["Proyecto","Agentes","Score Prom","Top Agente","Flags"]],
        body:projectSummaries.map(p=>[p.project,p.agents,fmt(p.avg_score),p.top_agent,p.flags]), ...tStyles });
      const y2 = (doc as any).lastAutoTable.finalY+10;
      doc.setTextColor(...C.white); doc.setFont("helvetica","bold"); doc.setFontSize(9);
      doc.text("Por coach", 10, y2);
      autoTable(doc, { startY:y2+3, head:[["Coach","Agentes","Score Prom","Mejor Agente"]],
        body:coachSummaries.map(c=>[c.coach,c.agents,fmt(c.avg_score),c.best_agent]), ...tStyles });

      // Pág 3 — Flags
      const flagged = agentSummaries.filter(a => a.flags > 0);
      if(flagged.length > 0) {
        doc.addPage(); header("Agentes con atención requerida", reportDate);
        doc.setTextColor(248,113,113); doc.setFont("helvetica","bold"); doc.setFontSize(9);
        doc.text(`${flagged.length} agentes con flags activos`, 10, 24);
        autoTable(doc, { startY:27,
          head:[["Game ID","Agente","Proyecto","Coach","Flags","Score Prom","Nivel"]],
          body:flagged.map(a=>[a.game_id,a.username,a.project,a.coach,a.flags,fmt(a.avg_score),a.level]),
          ...tStyles, headStyles:{ fillColor:C.danger, textColor:C.white, fontStyle:"bold" as const, fontSize:8 },
        });
      }

      // Pág 4 — Distribución
      doc.addPage(); header("Distribución de niveles", reportDate);
      const lvls = [
        {l:"Platinum",c:platinumCount,col:[226,232,240] as [number,number,number]},
        {l:"Gold",c:goldCount,col:[251,191,36] as [number,number,number]},
        {l:"Silver",c:silverCount,col:[148,163,184] as [number,number,number]},
        {l:"Bronze",c:bronzeCount,col:[205,124,47] as [number,number,number]},
      ];
      let bx = 10;
      if(totalAgents > 0) lvls.forEach(lv => {
        const bw = (lv.c/totalAgents)*(W-20);
        if(bw > 0) {
          doc.setFillColor(...lv.col); doc.rect(bx,24,bw,14,"F");
          if(bw > 18) {
            doc.setTextColor(15,23,42); doc.setFont("helvetica","bold"); doc.setFontSize(7);
            doc.text(`${lv.l} ${lv.c}`, bx+bw/2, 32, {align:"center"});
          }
          bx += bw;
        }
      });
      autoTable(doc, { startY:44,
        head:[["Nivel","Agentes","% del total","Score mínimo"]],
        body:[
          ["Platinum",platinumCount, totalAgents?fmt((platinumCount/totalAgents)*100)+"%":"0%","90+"],
          ["Gold",goldCount, totalAgents?fmt((goldCount/totalAgents)*100)+"%":"0%","70–89"],
          ["Silver",silverCount, totalAgents?fmt((silverCount/totalAgents)*100)+"%":"0%","50–69"],
          ["Bronze",bronzeCount, totalAgents?fmt((bronzeCount/totalAgents)*100)+"%":"0%","0–49"],
        ],
        ...tStyles, tableWidth:120,
      });

      // Footer
      const pages = doc.getNumberOfPages();
      for(let i=1;i<=pages;i++) {
        doc.setPage(i);
        doc.setFillColor(...C.card); doc.rect(0,H-8,W,8,"F");
        doc.setTextColor(...C.muted); doc.setFont("helvetica","normal"); doc.setFontSize(6.5);
        doc.text(`Performance Arena V6  |  ${reportDate}  |  Confidencial`, W/2, H-3, {align:"center"});
        doc.text(`Pág. ${i} / ${pages}`, W-10, H-3, {align:"right"});
      }

      doc.save(`Performance_Arena_${selectedWeek==="all"?"General":selectedWeek}.pdf`);
      showToast("PDF generado correctamente", "success");
    } catch(e: any) { showToast(`Error: ${e.message}`, "error"); }
    setGenerating(null);
  };

  // ── UI ───────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = { background:"#0c1a2e", border:"1px solid #1e3a5f", borderRadius:12, padding:"16px 20px" };
  const sel: React.CSSProperties = { background:"#0f172a", border:"1px solid #1e3a5f", borderRadius:8, color:"#e2e8f0", padding:"9px 12px", fontSize:13, outline:"none", cursor:"pointer" };

  if(loading) return <div style={{padding:40,textAlign:"center",color:"#64748b",fontSize:14}}>Cargando datos...</div>;

  return (
    <div style={{ padding:16, maxWidth:1100, margin:"0 auto", paddingBottom:80 }}>

      {toast && (
        <div style={{
          position:"fixed", top:20, right:20, zIndex:9999,
          padding:"12px 20px", borderRadius:8, border:"1px solid", fontWeight:600, fontSize:14,
          background:toast.type==="success"?"#052e16":"#2d1515",
          borderColor:toast.type==="success"?"#14532d":"#7f1d1d",
          color:toast.type==="success"?"#4ade80":"#f87171",
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <h2 style={{ color:"#f1f5f9", fontSize:20, fontWeight:700, margin:"0 0 4px" }}>Reporte General</h2>
        <p style={{ color:"#64748b", fontSize:13, margin:0 }}>Métricas, rankings e insights — exportable en Excel y PDF</p>
      </div>

      {/* Filtros + Export */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end", marginBottom:20 }}>
        <div>
          <div style={{ color:"#94a3b8", fontSize:11, fontWeight:600, marginBottom:4 }}>Semana</div>
          <select style={sel} value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}>
            <option value="all">Todas las semanas</option>
            {weeks.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <div style={{ color:"#94a3b8", fontSize:11, fontWeight:600, marginBottom:4 }}>Proyecto</div>
          <select style={sel} value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
            <option value="all">Todos los proyectos</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:10 }}>
          <button onClick={exportExcel} disabled={!!generating} style={{
            background:"#052e16", color:"#4ade80", border:"1px solid #14532d",
            borderRadius:8, padding:"10px 20px", cursor:"pointer", fontWeight:700, fontSize:13, opacity:generating?0.7:1,
          }}>{generating==="excel"?"Generando...":"Exportar Excel"}</button>
          <button onClick={exportPDF} disabled={!!generating} style={{
            background:"#0f172a", color:"#818cf8", border:"1px solid #3730a3",
            borderRadius:8, padding:"10px 20px", cursor:"pointer", fontWeight:700, fontSize:13, opacity:generating?0.7:1,
          }}>{generating==="pdf"?"Generando...":"Exportar PDF"}</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:10, marginBottom:20 }}>
        {[
          {label:"Agentes",value:totalAgents,color:"#60a5fa"},
          {label:"Score prom",value:fmt(overallAvg),color:"#60a5fa"},
          {label:"Platinum",value:platinumCount,color:"#e2e8f0"},
          {label:"Gold",value:goldCount,color:"#fbbf24"},
          {label:"Silver",value:silverCount,color:"#94a3b8"},
          {label:"Bronze",value:bronzeCount,color:"#cd7c2f"},
          {label:"Con flags",value:flaggedAgents,color:"#f87171"},
        ].map(k => (
          <div key={k.label} style={{...card,textAlign:"center",padding:"14px 10px"}}>
            <div style={{fontSize:24,fontWeight:700,color:k.color}}>{k.value}</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:3}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Insights fijos */}
      <div style={{...card, marginBottom:20}}>
        <h3 style={{color:"#93c5fd",fontSize:14,fontWeight:700,margin:"0 0 12px"}}>Insights del período</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10}}>
          {[
            {label:"Proyecto líder",value:topProject,color:"#4ade80"},
            {label:"Coach con mejor equipo",value:topCoach,color:"#4ade80"},
            {
              label:"Alto rendimiento (Gold+Platinum)",
              value:`${platinumCount+goldCount} agentes (${totalAgents?fmt(((platinumCount+goldCount)/totalAgents)*100):0}%)`,
              color:"#fbbf24",
            },
            {
              label:"Requieren atención",
              value:`${flaggedAgents} agentes con flags`,
              color:flaggedAgents>0?"#f87171":"#4ade80",
            },
            {label:"Score promedio general",value:fmt(overallAvg)+" pts",color:"#60a5fa"},
            {
              label:"En nivel Bronze",
              value:`${bronzeCount} (${totalAgents?fmt((bronzeCount/totalAgents)*100):0}%)`,
              color:bronzeCount>totalAgents*0.3?"#f87171":"#94a3b8",
            },
          ].map(ins => (
            <div key={ins.label} style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"12px 14px"}}>
              <div style={{color:"#475569",fontSize:11,marginBottom:4}}>{ins.label}</div>
              <div style={{color:ins.color,fontWeight:700,fontSize:14}}>{ins.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel IA */}
      <AIInsightsPanel
        agentSummaries={agentSummaries}
        projectSummaries={projectSummaries}
        coachSummaries={coachSummaries}
        weekLabel={weekLabel}
        projectLabel={projectLabel}
      />

      {/* Proyectos + Coaches */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
        <div style={card}>
          <h3 style={{color:"#93c5fd",fontSize:14,fontWeight:700,margin:"0 0 12px"}}>Por proyecto</h3>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr>{["Proyecto","Agentes","Score Prom","Flags"].map(h=>(
              <th key={h} style={{color:"#475569",fontWeight:600,padding:"4px 0",textAlign:"left",borderBottom:"1px solid #1e3a5f",paddingBottom:6}}>{h}</th>
            ))}</tr></thead>
            <tbody>{projectSummaries.map((p,i)=>(
              <tr key={p.project}>
                <td style={{padding:"6px 0",color:"#e2e8f0",fontWeight:i===0?700:400}}>{p.project}</td>
                <td style={{padding:"6px 0",color:"#94a3b8"}}>{p.agents}</td>
                <td style={{padding:"6px 0",color:"#60a5fa",fontWeight:600}}>{fmt(p.avg_score)}</td>
                <td style={{padding:"6px 0",color:p.flags>0?"#f87171":"#475569"}}>{p.flags}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={card}>
          <h3 style={{color:"#93c5fd",fontSize:14,fontWeight:700,margin:"0 0 12px"}}>Por coach</h3>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr>{["Coach","Agentes","Score Prom","Mejor Agente"].map(h=>(
              <th key={h} style={{color:"#475569",fontWeight:600,padding:"4px 0",textAlign:"left",borderBottom:"1px solid #1e3a5f",paddingBottom:6}}>{h}</th>
            ))}</tr></thead>
            <tbody>{coachSummaries.map((c,i)=>(
              <tr key={c.coach}>
                <td style={{padding:"6px 0",color:"#e2e8f0",fontWeight:i===0?700:400}}>{c.coach}</td>
                <td style={{padding:"6px 0",color:"#94a3b8"}}>{c.agents}</td>
                <td style={{padding:"6px 0",color:"#60a5fa",fontWeight:600}}>{fmt(c.avg_score)}</td>
                <td style={{padding:"6px 0",color:"#94a3b8",fontSize:11}}>{c.best_agent}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {/* Top 10 */}
      <div style={card}>
        <h3 style={{color:"#93c5fd",fontSize:14,fontWeight:700,margin:"0 0 12px"}}>Top 10 agentes — preview</h3>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr>{["#","Agente","Proyecto","Coach","QA%","Score Prom","Score Total","Nivel"].map(h=>(
              <th key={h} style={{background:"#0c2240",color:"#93c5fd",fontWeight:600,padding:"8px 12px",textAlign:"left"}}>{h}</th>
            ))}</tr></thead>
            <tbody>{agentSummaries.slice(0,10).map((a,i)=>(
              <tr key={a.game_id} style={{background:i%2===0?"#0f172a":"#0c1a2e"}}>
                <td style={{padding:"8px 12px",color:"#60a5fa",fontWeight:700}}>{i+1}</td>
                <td style={{padding:"8px 12px",color:"#e2e8f0",fontWeight:600}}>{a.username}</td>
                <td style={{padding:"8px 12px",color:"#94a3b8"}}>{a.project}</td>
                <td style={{padding:"8px 12px",color:"#94a3b8"}}>{a.coach}</td>
                <td style={{padding:"8px 12px",color:"#60a5fa"}}>{fmt(a.avg_qa)}%</td>
                <td style={{padding:"8px 12px",color:"#60a5fa",fontWeight:600}}>{fmt(a.avg_score)}</td>
                <td style={{padding:"8px 12px",color:"#4ade80",fontWeight:700}}>{a.total_score}</td>
                <td style={{padding:"8px 12px"}}>
                  <span style={{padding:"2px 8px",borderRadius:999,fontSize:11,fontWeight:700,
                    color:getLevelColor(a.level),
                    border:`1px solid ${getLevelColor(a.level)}44`,
                    background:getLevelColor(a.level)+"11",
                  }}>{a.level}</span>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {agentSummaries.length>10&&(
          <p style={{color:"#475569",fontSize:12,margin:"10px 0 0",textAlign:"center"}}>
            +{agentSummaries.length-10} agentes más en el reporte exportado
          </p>
        )}
      </div>
    </div>
  );
}
