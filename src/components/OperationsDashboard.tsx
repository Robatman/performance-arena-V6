import { useState, useEffect } from "react";

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";

async function sbFetch(path: string) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
    });
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch {
    return [];
  }
}

// Normalize strings for comparison — prevents "Campaign K" vs "campaign k" mismatches
const norm = (s: any) => (s || "").toString().trim().toLowerCase();

type Bucket = "S" | "A" | "B" | "C" | "D" | "E" | "F";

const BUCKETS: Record<Bucket, { label: string; desc: string; color: string; bg: string; emoji: string }> = {
  S: { label: "S — ELITE",    desc: "QA + AHT + Attendance perfectos", color: "#4ade80", bg: "#052e16", emoji: "🏆" },
  A: { label: "A — STRONG",   desc: "QA + AHT en meta",                color: "#60a5fa", bg: "#0c2240", emoji: "💪" },
  B: { label: "B — ATTEND",   desc: "QA + Attendance en meta",          color: "#a78bfa", bg: "#160d33", emoji: "📊" },
  C: { label: "C — QUALITY",  desc: "AHT + Attendance en meta",         color: "#fbbf24", bg: "#1a1200", emoji: "⏱"  },
  D: { label: "D — QA ONLY",  desc: "Solo QA en meta",                  color: "#f97316", bg: "#1c0a00", emoji: "📋" },
  E: { label: "E — AHT ONLY", desc: "Solo AHT en meta",                 color: "#fb923c", bg: "#1c0a00", emoji: "⚡" },
  F: { label: "F — AT RISK",  desc: "Ninguno en meta",                  color: "#f87171", bg: "#2d1515", emoji: "🚨" },
};

function getBucket(a: any): Bucket {
  if (a.flag && a.flag !== "ok") return "F";
  const ahtOk = a.aht !== null && a.aht_goal !== null
    ? (a.aht_type === "Productivity" ? a.aht >= a.aht_goal : a.aht <= a.aht_goal)
    : false;
  const qaOk  = a.qa_pct !== null && a.qa_goal !== null ? a.qa_pct >= a.qa_goal : false;
  const attOk = a.attendance_status === "perfect" || a.attendance_status === "late";
  if (qaOk && ahtOk && attOk) return "S";
  if (qaOk && ahtOk)          return "A";
  if (qaOk && attOk)          return "B";
  if (ahtOk && attOk)         return "C";
  if (qaOk)                   return "D";
  if (ahtOk)                  return "E";
  return "F";
}

export default function OperationsDashboard({ user }: { user: any }) {
  const [allMetrics, setAllMetrics] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [week, setWeek]             = useState("");
  const [weeks, setWeeks]           = useState<string[]>([]);
  const [view, setView]             = useState<"overview" | "buckets" | "coaches" | "alerts">("overview");

  const isSA      = user?.role === "superadmin";
  const isManager = user?.role === "manager" || user?.role === "training_manager";
  const isCoach   = user?.role === "team_coach" || user?.role === "quality_coach" || user?.role === "training_coach";

  useEffect(() => { loadMetrics(); }, []);

  const loadMetrics = async () => {
    setLoading(true);
    const data = await sbFetch("weekly_metrics?select=*&order=week.desc&limit=3000");
    const arr  = Array.isArray(data) ? data : [];
    const uniqueWeeks = [...new Set(arr.map((d: any) => d.week))].sort().reverse() as string[];
    setAllMetrics(arr);
    setWeeks(uniqueWeeks);
    if (uniqueWeeks.length > 0) setWeek(uniqueWeeks[0]);
    setLoading(false);
  };

  // ── FILTER by role ─────────────────────────────────────────────────────────
  // Super Admin  → all data
  // Manager      → only their project (normalized comparison)
  // Coach        → only their agents (coach field matches staff name)
  const weekData = allMetrics.filter((m: any) => {
    if (m.week !== week) return false;
    if (isSA)      return true;
    if (isManager) {
      // project "ALL" or empty = see all projects (like SA)
      const proj = (user.project||"").trim().toUpperCase();
      if (!proj || proj === "ALL") return true;
      return norm(m.project) === norm(user.project);
    }
    if (isCoach)   return norm(m.coach) === norm(user.gameId);
    return false;
  });

  const withBuckets = weekData.map((a: any) => ({ ...a, bucket: getBucket(a) }));

  const projects    = [...new Set(weekData.map((m: any) => m.project).filter(Boolean))].sort() as string[];
  const projectSummary = projects.map((proj) => {
    const agents      = withBuckets.filter((a: any) => norm(a.project) === norm(proj));
    const bucketCounts: Record<string, number> = {};
    Object.keys(BUCKETS).forEach((b) => { bucketCounts[b] = agents.filter((a: any) => a.bucket === b).length; });
    const inMeta = agents.filter((a: any) => ["S","A","B","C"].includes(a.bucket)).length;
    const pct    = agents.length > 0 ? Math.round((inMeta / agents.length) * 100) : 0;
    return { proj, total: agents.length, inMeta, pct, bucketCounts };
  });

  const coachList = [...new Set(weekData.map((m: any) => m.coach).filter(Boolean))].sort() as string[];
  const coachRanking = coachList.map((coach) => {
    const agents = withBuckets.filter((a: any) => norm(a.coach) === norm(coach));
    const inMeta = agents.filter((a: any) => ["S","A","B","C"].includes(a.bucket)).length;
    const pct    = agents.length > 0 ? Math.round((inMeta / agents.length) * 100) : 0;
    const avgPts = agents.length > 0
      ? Math.round(agents.reduce((s: number, a: any) => s + (a.total_pts || 0), 0) / agents.length)
      : 0;
    const sCount = agents.filter((a: any) => a.bucket === "S").length;
    const proj   = agents[0]?.project || "";
    return { coach, proj, total: agents.length, inMeta, pct, avgPts, sCount };
  }).sort((a, b) => b.pct - a.pct || b.avgPts - a.avgPts);

  const atRisk        = withBuckets.filter((a: any) => ["D","E","F"].includes(a.bucket)).sort((a: any, b: any) => a.total_pts - b.total_pts);
  const bucketOverview = (Object.keys(BUCKETS) as Bucket[]).map((b) => ({
    bucket: b,
    count:  withBuckets.filter((a: any) => a.bucket === b).length,
    pct:    withBuckets.length > 0
      ? Math.round((withBuckets.filter((a: any) => a.bucket === b).length / withBuckets.length) * 100)
      : 0,
  }));

  const totalAgents = weekData.length;
  const totalInMeta = withBuckets.filter((a: any) => ["S","A","B","C"].includes(a.bucket)).length;
  const globalPct   = totalAgents > 0 ? Math.round((totalInMeta / totalAgents) * 100) : 0;
  const eliteCount  = withBuckets.filter((a: any) => a.bucket === "S").length;
  const atRiskCount = withBuckets.filter((a: any) => a.bucket === "F").length;

  // Role label for header
  const roleLabel = isSA
    ? "⚡ Global — todos los proyectos"
    : isManager
    ? `👔 Mi proyecto: ${user.project || "—"}`
    : isCoach
    ? `🎯 Mi equipo: ${user.name}`
    : "";

  const Sty = {
    bg:"#0f172a", card:"#1e293b", border:"#1e3a5f",
    text:"#f1f5f9", muted:"#64748b", accent:"#6366f1",
  };

  // ── EMPTY STATE ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:60,flexDirection:"column",gap:16,background:Sty.bg,minHeight:"80vh"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{width:44,height:44,border:"4px solid #1e3a5f",borderTop:"4px solid #6366f1",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <p style={{color:Sty.muted,fontSize:14,margin:0}}>Cargando métricas...</p>
    </div>
  );

  if (weeks.length === 0) return (
    <div style={{padding:32,textAlign:"center",background:Sty.bg,minHeight:"80vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontSize:52,marginBottom:16}}>📊</div>
      <p style={{color:Sty.text,fontWeight:700,fontSize:18,margin:"0 0 8px"}}>No hay métricas cargadas aún</p>
      <p style={{color:Sty.muted,fontSize:13,margin:0}}>Admin Panel → 📊 Cargar Excel para subir métricas semanales.</p>
    </div>
  );

  // No data for this role after filter
  if (totalAgents === 0 && !loading) return (
    <div style={{padding:32,textAlign:"center",background:Sty.bg,minHeight:"80vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontSize:52,marginBottom:16}}>🔍</div>
      <p style={{color:Sty.text,fontWeight:700,fontSize:18,margin:"0 0 8px"}}>Sin datos para tu vista</p>
      <p style={{color:Sty.muted,fontSize:13,margin:"0 0 16px",lineHeight:1.6}}>
        {isManager
          ? `No se encontraron agentes con proyecto "${user.project}" en la semana ${week}.`
          : isCoach
          ? `No se encontraron agentes con coach game_id "${user.gameId}" en la semana ${week}.`
          : "No hay datos disponibles."}
      </p>
      <p style={{color:Sty.muted,fontSize:11,margin:0,opacity:0.6}}>
        Verifica que el nombre en tu perfil coincida exactamente con el campo coach/proyecto en el Excel.
      </p>
    </div>
  );

  return (
    <div style={{paddingBottom:100,background:Sty.bg,minHeight:"100vh"}}>

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1e1b4b,#312e81)",padding:"18px 16px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <h2 style={{color:Sty.text,fontSize:18,fontWeight:800,margin:0}}>Operations Dashboard</h2>
            <p style={{color:"#a5b4fc",fontSize:12,margin:"4px 0 0"}}>{roleLabel}</p>
          </div>
          {weeks.length > 0 && (
            <select value={week} onChange={(e) => setWeek(e.target.value)}
              style={{background:"#312e81",border:"1px solid #4f46e5",borderRadius:8,padding:"6px 10px",color:Sty.text,fontSize:12,cursor:"pointer",outline:"none",maxWidth:160}}>
              {weeks.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          )}
        </div>

        {/* KPI cards */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
          {[
            { n: totalAgents,        l: isCoach ? "Mis agentes" : "Total agentes", c: "#60a5fa" },
            { n: `${globalPct}%`,    l: "En meta",      c: globalPct>=80?"#4ade80":globalPct>=60?"#fbbf24":"#f87171" },
            { n: eliteCount,         l: "Elite (S)",    c: "#4ade80" },
            { n: atRiskCount,        l: "En riesgo (F)",c: "#f87171" },
          ].map((c) => (
            <div key={c.l} style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
              <div style={{color:c.c,fontWeight:900,fontSize:20}}>{c.n}</div>
              <div style={{color:"rgba(255,255,255,0.5)",fontSize:10,marginTop:2}}>{c.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Nav tabs */}
      <div style={{display:"flex",gap:6,padding:"0 16px",marginBottom:16,overflowX:"auto"}}>
        {[
          { id:"overview", label:"🌐 " + (isCoach ? "Mi Equipo" : "Proyectos") },
          { id:"buckets",  label:"🪣 Buckets" },
          ...(!isCoach ? [{ id:"coaches", label:"🎯 Coaches" }] : []),
          { id:"alerts",   label:`🚨 Alertas (${atRisk.length})` },
        ].map((t) => (
          <button key={t.id} onClick={() => setView(t.id as any)}
            style={{padding:"8px 14px",borderRadius:9,border:`1px solid ${view===t.id?Sty.accent:Sty.border}`,background:view===t.id?`${Sty.accent}22`:Sty.card,color:view===t.id?"#a5b4fc":Sty.muted,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{padding:"0 16px"}}>

        {/* OVERVIEW */}
        {view==="overview" && (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {/* Coach view: show agent list directly */}
            {isCoach ? (
              <div>
                <p style={{color:Sty.muted,fontSize:12,margin:"0 0 10px"}}>
                  {totalAgents} agentes en tu equipo — semana {week}
                </p>
                {withBuckets
                  .sort((a: any, b: any) => (b.total_pts||0) - (a.total_pts||0))
                  .map((a: any, i: number) => {
                    const b = a.bucket as Bucket;
                    const info = BUCKETS[b];
                    return (
                      <div key={i} style={{background:Sty.card,border:`1px solid ${info.color}33`,borderRadius:10,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:28,height:28,borderRadius:6,background:info.bg,border:`1px solid ${info.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>
                          {info.emoji}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{color:Sty.text,fontWeight:700,fontSize:13}}>{a.game_id}</span>
                            <span style={{background:info.bg,border:`1px solid ${info.color}`,color:info.color,padding:"1px 6px",borderRadius:4,fontSize:9,fontWeight:700}}>{b}</span>
                          </div>
                          <div style={{color:Sty.muted,fontSize:11,marginTop:2}}>
                            QA: {a.qa_pct !== null ? (a.qa_pct > 1 ? `${a.qa_pct}%` : `${(a.qa_pct*100).toFixed(1)}%`) : "N/A"}
                            {" · "}AHT: {a.aht !== null ? (a.aht_type==="Productivity" ? Number(a.aht).toFixed(2) : `${a.aht}s`) : "N/A"}
                            {" · "}Att: {a.attendance_status || "N/A"}
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{color:info.color,fontWeight:900,fontSize:16}}>{a.total_pts||0}</div>
                          <div style={{color:Sty.muted,fontSize:9}}>pts</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              // Manager / SA view: project cards
              projectSummary.length === 0
                ? <div style={{color:Sty.muted,textAlign:"center",padding:40}}>No hay datos para esta semana.</div>
                : projectSummary.map((p) => (
                  <div key={p.proj} style={{background:Sty.card,border:`1px solid ${Sty.border}`,borderRadius:12,padding:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div>
                        <span style={{color:Sty.text,fontWeight:700,fontSize:15}}>{p.proj}</span>
                        <span style={{color:Sty.muted,fontSize:12,marginLeft:8}}>{p.total} agentes</span>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <span style={{color:p.pct>=80?"#4ade80":p.pct>=60?"#fbbf24":"#f87171",fontWeight:900,fontSize:20}}>{p.pct}%</span>
                        <div style={{color:Sty.muted,fontSize:10}}>en meta</div>
                      </div>
                    </div>
                    <div style={{background:"#334155",borderRadius:999,height:8,marginBottom:10,overflow:"hidden"}}>
                      <div style={{width:`${p.pct}%`,height:"100%",borderRadius:999,background:p.pct>=80?"#4ade80":p.pct>=60?"#fbbf24":"#f87171",transition:"width 0.8s ease"}}/>
                    </div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {(Object.keys(BUCKETS) as Bucket[]).map((b) => {
                        const count = p.bucketCounts[b] || 0;
                        if (count===0) return null;
                        const info = BUCKETS[b];
                        return (
                          <div key={b} style={{display:"flex",alignItems:"center",gap:3,background:info.bg,border:`1px solid ${info.color}44`,borderRadius:6,padding:"3px 8px"}}>
                            <span style={{fontSize:10}}>{info.emoji}</span>
                            <span style={{color:info.color,fontWeight:700,fontSize:11}}>{b}</span>
                            <span style={{color:Sty.muted,fontSize:10}}>{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {/* BUCKETS */}
        {view==="buckets" && (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <p style={{color:Sty.muted,fontSize:12,margin:0}}>
              Clasificación — semana {week} · {isCoach ? `equipo de ${user.gameId}` : isManager ? user.project : "global"}
            </p>
            {bucketOverview.map(({bucket,count,pct}) => {
              const info   = BUCKETS[bucket as Bucket];
              const agents = withBuckets.filter((a: any) => a.bucket===bucket);
              return (
                <div key={bucket} style={{background:info.bg,border:`1px solid ${info.color}44`,borderRadius:12,padding:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:20}}>{info.emoji}</span>
                      <div>
                        <div style={{color:info.color,fontWeight:800,fontSize:14}}>{info.label}</div>
                        <div style={{color:Sty.muted,fontSize:11}}>{info.desc}</div>
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{color:info.color,fontWeight:900,fontSize:22}}>{count}</div>
                      <div style={{color:Sty.muted,fontSize:10}}>{pct}% del total</div>
                    </div>
                  </div>
                  <div style={{background:"#334155",borderRadius:999,height:6,marginBottom:count>0?10:0,overflow:"hidden"}}>
                    <div style={{width:`${pct}%`,height:"100%",borderRadius:999,background:info.color,transition:"width 0.8s ease"}}/>
                  </div>
                  {count>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,maxHeight:80,overflowY:"auto"}}>
                      {agents.map((a: any, i: number) => (
                        <span key={i} style={{background:`${info.color}18`,color:info.color,padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:600}}>
                          {a.game_id}{!isCoach && <span style={{opacity:0.6}}> · {a.project}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* COACHES — only for Manager / SA */}
        {view==="coaches" && !isCoach && (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <p style={{color:Sty.muted,fontSize:12,margin:0}}>
              Ranking de coaches por % agentes en meta — semana {week}
            </p>
            {coachRanking.length===0&&<div style={{color:Sty.muted,textAlign:"center",padding:40}}>No hay datos de coaches.</div>}
            {coachRanking.map((c, i) => {
              const medals = ["🥇","🥈","🥉"];
              const color  = c.pct>=80?"#4ade80":c.pct>=60?"#fbbf24":"#f87171";
              return (
                <div key={c.coach} style={{background:Sty.card,border:`1px solid ${i<3?color+"44":Sty.border}`,borderRadius:12,padding:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:32,textAlign:"center",fontWeight:900,fontSize:i<3?20:13,color:i<3?"#f59e0b":Sty.muted,flexShrink:0}}>
                      {i<3?medals[i]:`#${i+1}`}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <div>
                          <span style={{color:Sty.text,fontWeight:700,fontSize:13}}>{c.coach}</span>
                          <span style={{color:Sty.muted,fontSize:11,marginLeft:6}}>{c.proj} · {c.total} agentes</span>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <span style={{color,fontWeight:900,fontSize:18}}>{c.pct}%</span>
                          <div style={{color:Sty.muted,fontSize:10}}>{c.inMeta}/{c.total} en meta</div>
                        </div>
                      </div>
                      <div style={{background:"#334155",borderRadius:999,height:6,overflow:"hidden"}}>
                        <div style={{width:`${c.pct}%`,height:"100%",borderRadius:999,background:color,transition:"width 0.8s ease"}}/>
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:8,paddingLeft:42}}>
                    <span style={{background:"#052e16",color:"#4ade80",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700}}>🏆 Elite: {c.sCount}</span>
                    <span style={{background:"#0c2240",color:"#60a5fa",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700}}>⭐ Avg: {c.avgPts} pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ALERTS */}
        {view==="alerts" && (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <p style={{color:Sty.muted,fontSize:12,margin:0}}>
              {atRisk.length} agentes en riesgo — semana {week}
              {isCoach ? ` · equipo de ${user.gameId}` : isManager ? ` · ${user.project}` : ""}
            </p>
            {atRisk.length===0&&(
              <div style={{background:"#052e16",border:"1px solid #14532d",borderRadius:12,padding:32,textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:8}}>🎉</div>
                <p style={{color:"#4ade80",fontWeight:700,fontSize:16,margin:0}}>¡Sin agentes en riesgo esta semana!</p>
              </div>
            )}
            {atRisk.map((a: any, i: number) => {
              const b    = a.bucket as Bucket;
              const info = BUCKETS[b];
              const ahtOk = a.aht!==null&&a.aht_goal!==null?(a.aht_type==="Productivity"?a.aht>=a.aht_goal:a.aht<=a.aht_goal):false;
              const qaOk  = a.qa_pct!==null?a.qa_pct>=a.qa_goal:false;
              const attOk = a.attendance_status==="perfect"||a.attendance_status==="late";
              const issues = [!qaOk&&"QA fuera de meta",!ahtOk&&(a.aht===null?"Sin AHT":"AHT fuera de meta"),!attOk&&"Attendance"].filter(Boolean);
              return (
                <div key={i} style={{background:info.bg,border:`1px solid ${info.color}44`,borderRadius:12,padding:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:16}}>{info.emoji}</span>
                        <span style={{color:Sty.text,fontWeight:700,fontSize:14}}>{a.game_id}</span>
                        <span style={{background:info.bg,border:`1px solid ${info.color}`,color:info.color,padding:"1px 7px",borderRadius:999,fontSize:10,fontWeight:700}}>{b}</span>
                      </div>
                      <div style={{color:Sty.muted,fontSize:11,marginTop:2,paddingLeft:24}}>
                        {a.project} · Coach: {a.coach}
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{color:info.color,fontWeight:900,fontSize:18}}>{a.total_pts} pts</div>
                      <div style={{color:Sty.muted,fontSize:10}}>esta semana</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",paddingLeft:24,marginBottom:8}}>
                    {issues.map((issue: any, j: number) => (
                      <span key={j} style={{background:"#2d1515",color:"#f87171",border:"1px solid #7f1d1d",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:600}}>⚠️ {issue}</span>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",paddingLeft:24}}>
                    <span style={{background:qaOk?"#052e16":"#2d1515",color:qaOk?"#4ade80":"#f87171",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:600}}>
                      QA: {a.qa_pct!==null?(a.qa_pct>1?`${a.qa_pct}%`:`${(a.qa_pct*100).toFixed(1)}%`):"N/A"} / {a.qa_goal>1?`${a.qa_goal}%`:`${(a.qa_goal*100).toFixed(0)}%`}
                    </span>
                    <span style={{background:ahtOk?"#052e16":"#2d1515",color:ahtOk?"#4ade80":"#f87171",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:600}}>
                      AHT: {a.aht!==null?(a.aht_type==="Productivity"?Number(a.aht).toFixed(2):`${a.aht}s`):"N/A"} / {a.aht_goal!==null?(a.aht_type==="Productivity"?Number(a.aht_goal).toFixed(2):`${a.aht_goal}s`):"N/A"}
                    </span>
                    <span style={{background:attOk?"#052e16":"#2d1515",color:attOk?"#4ade80":"#f87171",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:600}}>
                      Att: {a.attendance_status||"N/A"} ({a.attendance_pts||0}pts)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
