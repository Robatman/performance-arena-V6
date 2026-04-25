import { useState, useCallback } from "react";
import * as XLSX from "xlsx";

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";
const DEFAULT_PASSWORD = "Centris2026";

async function sbPost(path: string, body: any, upsert = false) {
  const headers: any = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
  if (upsert) {
    headers["Prefer"] = "resolution=merge-duplicates,return=minimal";
  } else {
    headers["Prefer"] = "return=minimal";
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return res.ok;
}

async function sbPatch(path: string, body: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

async function sbGet(path: string) {
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

type AhtType = "time" | "Productivity";
type AgentFlag = "ok" | "msl" | "na" | "no_aht" | "zero_all";
type ReviewReason = "vacation" | "sick_leave" | "termination" | "skip" | "";

interface ProcessedAgent {
  game_id: string; project: string; coach_id: string; qcoach: string;
  aht_raw: any; aht_seconds: number | null; aht_goal_seconds: number | null;
  aht_type: AhtType; qa_score: number | null; qa_goal: number;
  absences: number; tardies: number; flag: AgentFlag;
  attendance_status: "perfect" | "late" | "absent";
  attendance_pts: number; aht_pts: number; qa_pts: number; total_pts: number;
  is_new: boolean; review_reason?: ReviewReason;
}

interface CoachRow { game_id: string; position: string; manager: string; attrition: number; }

interface UploadSummary {
  week: string; agents_processed: number; agents_created: number;
  agents_updated: number; coaches_processed: number; errors: string[];
}

function isMSL(v: any) { return ["MSL"].includes(String(v ?? "").trim().toUpperCase()); }
function isNA(v: any) { return ["N/A","NA","#N/A","-"].includes(String(v ?? "").trim().toUpperCase()); }

function convertAHT(raw: any, type: AhtType): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (isMSL(raw) || isNA(raw)) return null;
  const n = Number(raw);
  if (isNaN(n)) return null;
  if (type === "Productivity") return n;
  if (n > 0 && n < 1) return Math.round(n * 86400);
  return Math.round(n);
}

function calcAttendance(abs: number, tard: number) {
  if (abs >= 1 || tard >= 2) return { status: "absent" as const, pts: 0 };
  if (tard === 1) return { status: "late" as const, pts: 2 };
  return { status: "perfect" as const, pts: 5 };
}

function calcPts(val: number | null, goal: number | null, higherBetter: boolean): number {
  if (val === null || goal === null) return 0;
  if (higherBetter) return val > goal ? 5 : val === goal ? 2 : 0;
  return val < goal ? 5 : val === goal ? 2 : 0;
}

function detectFlag(ahtRaw: any, qaRaw: any, abs: number, tard: number): AgentFlag {
  if (isMSL(ahtRaw) || isMSL(qaRaw)) return "msl";
  if (isNA(ahtRaw) || isNA(qaRaw)) return "na";
  if ((ahtRaw === "" || ahtRaw === null) && (qaRaw === "" || qaRaw === null)) return "no_aht";
  if (Number(ahtRaw) === 0 && Number(qaRaw) === 0 && abs === 0 && tard === 0) return "zero_all";
  return "ok";
}

function getWeekLabel(filename: string): string {
  const matchW = filename.match(/W(\d{1,2})/i);
  if (matchW) return `W${matchW[1]}-${new Date().getFullYear()}`;
  const matchDate = filename.match(/(\w+)[_\s]+(\d+)[_\s]+to[_\s]+(\w+)[_\s]+(\d+)/i);
  if (matchDate) return `${matchDate[1]}_${matchDate[2]}-${matchDate[3]}_${matchDate[4]}`;
  const now = new Date();
  const week = Math.ceil(((now.getTime() - new Date(now.getFullYear(),0,1).getTime()) / 86400000 + new Date(now.getFullYear(),0,1).getDay() + 1) / 7);
  return `W${week}-${now.getFullYear()}`;
}

export default function ExcelUpload({ onClose }: { onClose?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<"idle"|"preview"|"uploading"|"done"|"error">("idle");
  const [agents, setAgents] = useState<ProcessedAgent[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [weekLabel, setWeekLabel] = useState("");
  const [weekAlreadyLoaded, setWeekAlreadyLoaded] = useState(false);
  const [summary, setSummary] = useState<UploadSummary|null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [importNew, setImportNew] = useState<"all"|"none"|"pending">("pending");
  const [progress, setProgress] = useState(0);

  const handleDrag = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(e.type==="dragover"); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f=e.dataTransfer.files[0]; if(f) processFile(f); }, []);
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => { const f=e.target.files?.[0]; if(f) processFile(f); };

  const processFile = async (f: File) => {
    setErrors([]);
    const week = getWeekLabel(f.name);
    setWeekLabel(week);

    try {
      const ex = await sbGet(`weekly_metrics?week=eq.${encodeURIComponent(week)}&limit=1&select=id`);
      setWeekAlreadyLoaded(Array.isArray(ex) && ex.length > 0);
    } catch { setWeekAlreadyLoaded(false); }

    let existingIds = new Set<string>();
    try {
      const p = await sbGet("profiles?select=game_id&is_active=eq.true");
      existingIds = new Set((Array.isArray(p) ? p : []).map((x:any) => String(x.game_id).trim().toUpperCase()));
    } catch {}

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type:"array" });
        const metricsName = wb.SheetNames.find(n => /april|week|kpi|metric/i.test(n)) || wb.SheetNames[1] || wb.SheetNames[0];
        const ms = wb.Sheets[metricsName];
        if (!ms) { setErrors([`No se encontró hoja de métricas. Hojas: ${wb.SheetNames.join(", ")}`]); setStage("error"); return; }

        const rows: any[] = XLSX.utils.sheet_to_json(ms, { defval: "" });
        if (rows.length === 0) { setErrors(["La hoja de métricas está vacía."]); setStage("error"); return; }

        const keys = Object.keys(rows[0] || {});
        const col = ((...names: string[]) => keys.find(k => names.some(n => k.toLowerCase().replace(/[\s_]/g,"").includes(n.toLowerCase().replace(/[\s_]/g,"")))) || "");

        const cGameId = col("gameid","game_id","login");
        const cProject = col("project","campaign","campaing");
        const cCoach = keys.find(k => k.toLowerCase() === "coach id") || col("coachid","coach_id");
        const cQcoach = col("qcoach","qacoach");
        const cAht = keys.find(k => k.toLowerCase() === "aht") || col("aht");
        const cAhtGoal = col("ahtgoal","aht goal","aht_goal");
        const cAhtType = col("ahttype","aht_type","aht type");
        const cQa = col("qascore","qa_score","qa score");
        const cQaGoal = col("qagoal","qa_goal","qa goal");
        const cAbsent = col("absent","absence","absences");
        const cTardies = col("tardie","tardies","late");

        const processed: ProcessedAgent[] = rows
          .filter((r:any) => r[cGameId] && String(r[cGameId]).trim() !== "" && String(r[cGameId]).trim() !== "Game ID")
          .map((r:any) => {
            const gameId = String(r[cGameId]||"").trim();
            const ahtRaw = r[cAht]; const qaRaw = r[cQa];
            const ahtType: AhtType = /productivity/i.test(String(r[cAhtType]||"")) ? "Productivity" : "time";
            const abs = Number(r[cAbsent]||0); const tard = Number(r[cTardies]||0);
            const flag = detectFlag(ahtRaw, qaRaw, abs, tard);
            const ahtSec = convertAHT(ahtRaw, ahtType);
            const ahtGoalSec = convertAHT(r[cAhtGoal], ahtType);
            const qaN = isNA(qaRaw)||String(qaRaw).trim()===""||isMSL(qaRaw) ? null : Number(qaRaw);
            const qaGoal = isNaN(Number(r[cQaGoal])) ? 0 : Number(r[cQaGoal]);
            const att = calcAttendance(abs, tard);
            const ahtPts = flag==="ok" ? calcPts(ahtSec, ahtGoalSec, ahtType==="Productivity") : 0;
            const qaPts = flag==="ok" ? calcPts(qaN, qaGoal, true) : 0;
            const attPts = flag==="msl" ? 0 : att.pts;
            return {
              game_id: gameId, project: String(r[cProject]||"").trim(),
              coach_id: String(r[cCoach]||"").trim(), qcoach: String(r[cQcoach]||"").trim(),
              aht_raw: ahtRaw, aht_seconds: ahtSec, aht_goal_seconds: ahtGoalSec, aht_type: ahtType,
              qa_score: qaN, qa_goal: qaGoal, absences: abs, tardies: tard, flag,
              attendance_status: att.status, attendance_pts: attPts, aht_pts: ahtPts, qa_pts: qaPts,
              total_pts: attPts+ahtPts+qaPts, is_new: !existingIds.has(gameId.toUpperCase()),
              review_reason: flag!=="ok" ? "" : undefined,
            };
          });

        const coachSheetName = wb.SheetNames.find(n => /coach|attrition/i.test(n)) || "";
        let parsedCoaches: CoachRow[] = [];
        if (coachSheetName && wb.Sheets[coachSheetName]) {
          const cr: any[] = XLSX.utils.sheet_to_json(wb.Sheets[coachSheetName], { defval:"" });
          parsedCoaches = cr
            .filter((r:any) => String(r["Game ID"]||r["game_id"]||"").trim() !== "" && /coach|manager/i.test(String(r["Position"]||r["position"]||"")))
            .map((r:any) => ({
              game_id: String(r["Game ID"]||r["game_id"]||"").trim(),
              position: String(r["Position"]||r["position"]||"").trim(),
              manager: String(r["Manager"]||r["manager"]||"").trim(),
              attrition: Number(r["Attrition"]||r["attrition"]||0),
            }));
        }

        if (processed.length === 0) { setErrors(["No se encontraron agentes válidos."]); setStage("error"); return; }
        setAgents(processed); setCoaches(parsedCoaches); setStage("preview");
      } catch(err) { setErrors([`Error: ${err}`]); setStage("error"); }
    };
    reader.readAsArrayBuffer(f);
  };

  const updateReason = (gameId: string, reason: ReviewReason) =>
    setAgents(prev => prev.map(a => a.game_id===gameId ? {...a, review_reason: reason} : a));

  const handleUpload = async () => {
    setStage("uploading"); setProgress(0);
    const errs: string[] = []; let created=0, updated=0;
    const week = weekLabel;
    const total = agents.length + coaches.length;
    let done = 0;
    const tick = () => { done++; setProgress(Math.round((done/total)*100)); };

    // 1. Create new agents
    if (importNew === "all") {
      for (const a of agents.filter(x=>x.is_new)) {
        try {
          const ok = await sbPost("profiles", {
            game_id: a.game_id, username: a.game_id, full_name: a.game_id,
            password_hash: DEFAULT_PASSWORD, needs_pw_change: true, temp_pw: DEFAULT_PASSWORD,
            role: "usuario", team: a.project, is_active: true, level: 1,
            kudos:0, gold_kudos:0, referrals:[], weekly_perf:[],
          }, false);
          if (ok) created++;
        } catch(e:any) { errs.push(`Crear ${a.game_id}: ${e.message}`); }
        tick();
      }
    }

    // 2. Save metrics for each agent
    for (const a of agents) {
      if (a.review_reason === "termination") {
        try { await sbPatch(`profiles?game_id=eq.${encodeURIComponent(a.game_id)}`, {is_active:false}); }
        catch(e:any) { errs.push(`Baja ${a.game_id}: ${e.message}`); }
        tick(); continue;
      }

      const skip = a.review_reason==="vacation"||a.review_reason==="sick_leave"||a.review_reason==="skip";

      try {
        const ok = await sbPost("weekly_metrics", {
          game_id: a.game_id,
          week,
          project: a.project,
          coach: a.coach_id,
          qa_coach: a.qcoach,
          aht: a.aht_seconds,
          aht_goal: a.aht_goal_seconds,
          aht_type: a.aht_type,
          qa_pct: a.qa_score,
          qa_goal: a.qa_goal,
          absences: skip ? 0 : a.absences,
          tardies: skip ? 0 : a.tardies,
          attendance_status: skip ? "excused" : a.attendance_status,
          attendance_pts: skip ? 0 : a.attendance_pts,
          aht_pts: skip ? 0 : a.aht_pts,
          qa_pts: skip ? 0 : a.qa_pts,
          total_pts: skip ? 0 : a.total_pts,
          flag: a.flag,
          review_reason: a.review_reason || null,
        }, true); // upsert = true
        if (ok) updated++;
        else errs.push(`Insert failed: ${a.game_id}`);
      } catch(e:any) { errs.push(`Metrics ${a.game_id}: ${e.message}`); }
      tick();
    }

    // 3. Save coach attrition
    for (const c of coaches) {
      try {
        await sbPost("staff_attrition_monthly", {
          coach_name: c.game_id,
          week,
          voluntary_exits: c.attrition,
          position: c.position,
          manager_id: c.manager || null,
        }, true);
      } catch(e:any) { errs.push(`Coach ${c.game_id}: ${e.message}`); }
      tick();
    }

    setProgress(100);
    setSummary({ week, agents_processed:agents.length, agents_created:created, agents_updated:updated, coaches_processed:coaches.length, errors:errs });
    setStage("done");
  };

  const reset = () => { setStage("idle"); setAgents([]); setCoaches([]); setErrors([]); setSummary(null); setWeekLabel(""); setWeekAlreadyLoaded(false); setImportNew("pending"); setProgress(0); };

  const flagged = agents.filter(a=>a.flag!=="ok");
  const ok = agents.filter(a=>a.flag==="ok");
  const newA = agents.filter(a=>a.is_new);
  const reviewPending = flagged.some(a=>!a.review_reason);
  const canUpload = !reviewPending && importNew !== "pending";

  const SD = { border:"1px solid #1e3a5f", muted:"#64748b", text:"#f1f5f9", card:"#1e293b" };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16}}>
      <div style={{background:"#0f172a",border:SD.border,borderRadius:16,width:"100%",maxWidth:1100,maxHeight:"92vh",overflowY:"auto",padding:24,boxShadow:"0 25px 60px rgba(0,0,0,0.7)"}}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <h2 style={{color:SD.text,fontSize:20,fontWeight:700,margin:0}}>📊 Carga Semanal de Métricas</h2>
            <div style={{marginTop:6,display:"flex",gap:8,flexWrap:"wrap"}}>
              {weekLabel&&<span style={{background:"#1d4ed8",color:"#bfdbfe",padding:"2px 12px",borderRadius:999,fontSize:12,fontWeight:600}}>{weekLabel}</span>}
              {weekAlreadyLoaded&&<span style={{background:"#78350f",color:"#fbbf24",padding:"2px 10px",borderRadius:999,fontSize:11,fontWeight:700}}>⚠️ Semana ya cargada — se sobreescribirá</span>}
            </div>
          </div>
          <button onClick={onClose||reset} style={{background:"transparent",border:"none",color:SD.muted,fontSize:20,cursor:"pointer"}}>✕</button>
        </div>

        {stage==="idle"&&(
          <div onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
            style={{border:`2px dashed ${isDragging?"#3b82f6":"#1e3a5f"}`,borderRadius:12,padding:"48px 32px",textAlign:"center",background:isDragging?"rgba(59,130,246,0.08)":"transparent",cursor:"pointer"}}>
            <div style={{fontSize:52,marginBottom:12}}>📁</div>
            <p style={{color:SD.text,fontSize:18,fontWeight:600,margin:"0 0 4px"}}>Arrastra tu archivo aquí</p>
            <p style={{color:SD.muted,fontSize:13,margin:"0 0 20px"}}>Ej: April_12_to_April_18_KPI.xlsx</p>
            <label style={{display:"inline-block",background:"#1d4ed8",color:"#fff",padding:"11px 28px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:14,marginBottom:24}}>
              Seleccionar archivo
              <input type="file" accept=".xlsx,.xls" onChange={handleInput} style={{display:"none"}}/>
            </label>
            <div style={{background:"#0c2240",borderRadius:8,padding:"14px 18px",textAlign:"left",maxWidth:600,margin:"0 auto"}}>
              <p style={{color:"#93c5fd",fontWeight:600,margin:"0 0 8px",fontSize:13}}>Hojas esperadas:</p>
              <p style={{color:SD.muted,fontSize:12,margin:"4px 0"}}>📄 <b>Hoja de métricas</b>: Game ID · Project · Coach ID · Qcoach · AHT · AHT Goal · AHT type · QA Score · QA Goal · Absent · Tardies</p>
              <p style={{color:SD.muted,fontSize:12,margin:"4px 0"}}>📄 <b>Coach Attrition</b>: Game ID · Position · Manager · Attrition</p>
            </div>
          </div>
        )}

        {stage==="error"&&(
          <div>
            <div style={{background:"#2d1515",border:"1px solid #7f1d1d",borderRadius:10,padding:16,marginBottom:16}}>
              <p style={{color:"#f87171",fontWeight:700,margin:"0 0 8px"}}>❌ Error</p>
              {errors.map((e,i)=><p key={i} style={{color:"#fca5a5",fontSize:13,margin:"3px 0"}}>• {e}</p>)}
            </div>
            <button onClick={reset} style={{background:"transparent",color:"#94a3b8",border:"1px solid #334155",padding:"10px 22px",borderRadius:8,cursor:"pointer",fontWeight:600}}>Intentar de nuevo</button>
          </div>
        )}

        {stage==="preview"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {weekAlreadyLoaded&&(
              <div style={{background:"#2d2000",border:"1px solid #78350f",borderRadius:10,padding:14}}>
                <p style={{color:"#fbbf24",fontWeight:700,margin:"0 0 4px"}}>⚠️ La semana <b>{weekLabel}</b> ya fue cargada</p>
                <p style={{color:"#d97706",fontSize:13,margin:0}}>Al confirmar se sobreescribirán los datos existentes.</p>
              </div>
            )}

            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {[{n:agents.length,l:"Total agentes",c:"#60a5fa"},{n:ok.length,l:"Métricas OK",c:"#4ade80"},{n:flagged.length,l:"Revisión requerida",c:"#fbbf24"},{n:newA.length,l:"Agentes nuevos",c:"#a78bfa"},{n:coaches.length,l:"Coaches",c:"#f97316"}].map(c=>(
                <div key={c.l} style={{flex:1,minWidth:110,background:SD.card,borderRadius:10,padding:14,textAlign:"center"}}>
                  <div style={{fontSize:24,fontWeight:700,color:c.c}}>{c.n}</div>
                  <div style={{fontSize:11,color:SD.muted,marginTop:2}}>{c.l}</div>
                </div>
              ))}
            </div>

            {newA.length>0&&(
              <div style={{background:"#160d33",border:"1px solid #4c1d95",borderRadius:10,padding:16}}>
                <p style={{color:"#a78bfa",fontWeight:700,margin:"0 0 8px"}}>🆕 {newA.length} agentes nuevos detectados</p>
                <p style={{color:"#7c3aed",fontSize:13,margin:"0 0 12px"}}>Estos Game IDs no existen en la app. ¿Crearlos con contraseña <b style={{color:"#c4b5fd"}}>{DEFAULT_PASSWORD}</b>?</p>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  {[{k:"all",l:`✅ Crear todos (${newA.length})`},{k:"none",l:"⏭️ Omitir por ahora"}].map(b=>(
                    <button key={b.k} onClick={()=>setImportNew(b.k as any)}
                      style={{background:importNew===b.k?"#7c3aed":"#1e293b",color:importNew===b.k?"#fff":"#94a3b8",border:`1px solid ${importNew===b.k?"#7c3aed":"#334155"}`,padding:"8px 16px",borderRadius:7,cursor:"pointer",fontWeight:600,fontSize:13}}>
                      {b.l}
                    </button>
                  ))}
                </div>
                {importNew==="all"&&<div style={{maxHeight:80,overflowY:"auto"}}>{newA.map((a,i)=><span key={i} style={{display:"inline-block",background:"#2e1065",color:"#c4b5fd",padding:"2px 8px",borderRadius:4,fontSize:10,margin:"2px"}}>{a.game_id} · {a.project}</span>)}</div>}
              </div>
            )}

            {flagged.length>0&&(
              <div style={{background:"#1a1200",border:"1px solid #78350f",borderRadius:10,padding:16}}>
                <p style={{color:"#fbbf24",fontWeight:700,margin:"0 0 12px"}}>⚠️ Agentes que requieren acción ({flagged.length})</p>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {flagged.map((a,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:"#0f0a00",borderRadius:8,padding:"10px 12px",flexWrap:"wrap"}}>
                      <div style={{flex:1,minWidth:180}}>
                        <span style={{color:"#e2e8f0",fontWeight:700,fontSize:13}}>{a.game_id}</span>
                        <span style={{color:SD.muted,fontSize:11,marginLeft:8}}>{a.project}</span>
                        <span style={{marginLeft:8,padding:"1px 7px",borderRadius:999,fontSize:10,fontWeight:700,
                          background:a.flag==="msl"?"#164e63":a.flag==="na"?"#1e1b4b":"#1c1917",
                          color:a.flag==="msl"?"#67e8f9":a.flag==="na"?"#a5b4fc":"#d6d3d1"}}>
                          {a.flag==="msl"?"🏥 MSL":a.flag==="na"?"❓ N/A":a.flag==="no_aht"?"📭 Sin métricas":"⚪ Todo en ceros"}
                        </span>
                      </div>
                      <select value={a.review_reason||""} onChange={e=>updateReason(a.game_id,e.target.value as ReviewReason)}
                        style={{background:"#1e293b",border:`1px solid ${!a.review_reason?"#dc2626":"#334155"}`,borderRadius:6,padding:"6px 10px",color:"#e2e8f0",fontSize:12,cursor:"pointer",outline:"none"}}>
                        <option value="">-- Selecciona razón --</option>
                        <option value="vacation">🏖️ Vacaciones</option>
                        <option value="sick_leave">🏥 Sick Leave / MSL</option>
                        <option value="termination">📤 Baja — desactivar usuario</option>
                        <option value="skip">⏭️ Omitir esta semana</option>
                      </select>
                    </div>
                  ))}
                </div>
                {reviewPending&&<p style={{color:"#ef4444",fontSize:12,marginTop:10,margin:"10px 0 0"}}>⚠️ Selecciona una razón para todos los agentes marcados.</p>}
              </div>
            )}

            <p style={{color:"#94a3b8",fontSize:13,fontWeight:600,margin:0}}>Vista previa — Agentes OK ({ok.length})</p>
            <div style={{overflowX:"auto",borderRadius:8,border:SD.border}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr>{["Game ID","Project","Coach","AHT","Meta","Tipo","QA","Meta QA","Aus","Tard","Att Pts","AHT Pts","QA Pts","Total"].map(h=>(
                  <th key={h} style={{background:"#0c2240",color:"#93c5fd",fontWeight:600,padding:"8px 10px",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>
                ))}</tr></thead>
                <tbody>{ok.slice(0,20).map((a,i)=>(
                  <tr key={i} style={{background:i%2===0?"#0f172a":"#0c1a2e"}}>
                    <td style={{padding:"7px 10px",color:a.is_new?"#c4b5fd":"#cbd5e1",fontWeight:a.is_new?700:400}}>{a.game_id}{a.is_new&&<span style={{color:"#a78bfa",fontSize:9,marginLeft:4}}>NEW</span>}</td>
                    <td style={{padding:"7px 10px",color:SD.muted}}>{a.project}</td>
                    <td style={{padding:"7px 10px",color:SD.muted}}>{a.coach_id}</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1"}}>{a.aht_type==="Productivity"?a.aht_seconds?.toFixed(2):a.aht_seconds?`${a.aht_seconds}s`:"-"}</td>
                    <td style={{padding:"7px 10px",color:SD.muted}}>{a.aht_type==="Productivity"?a.aht_goal_seconds?.toFixed(2):a.aht_goal_seconds?`${a.aht_goal_seconds}s`:"-"}</td>
                    <td style={{padding:"7px 10px"}}><span style={{padding:"1px 6px",borderRadius:4,fontSize:10,fontWeight:700,background:a.aht_type==="Productivity"?"#052e16":"#0c2240",color:a.aht_type==="Productivity"?"#4ade80":"#60a5fa"}}>{a.aht_type==="Productivity"?"📈":"⏱"}</span></td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1"}}>{a.qa_score!==null?(a.qa_score>1?`${a.qa_score}`:`${(a.qa_score*100).toFixed(1)}%`):"-"}</td>
                    <td style={{padding:"7px 10px",color:SD.muted}}>{a.qa_goal>1?a.qa_goal:`${(a.qa_goal*100).toFixed(0)}%`}</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1",textAlign:"center"}}>{a.absences}</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1",textAlign:"center"}}>{a.tardies}</td>
                    <td style={{padding:"7px 10px"}}><span style={{padding:"2px 7px",borderRadius:999,fontSize:10,fontWeight:600,color:"#fff",background:a.attendance_status==="perfect"?"#16a34a":a.attendance_status==="late"?"#d97706":"#dc2626"}}>{a.attendance_pts}pts</span></td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1",textAlign:"center"}}>{a.aht_pts}</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1",textAlign:"center"}}>{a.qa_pts}</td>
                    <td style={{padding:"7px 10px",fontWeight:700,color:"#60a5fa",textAlign:"center"}}>{a.total_pts}</td>
                  </tr>
                ))}</tbody>
              </table>
              {ok.length>20&&<p style={{color:"#475569",fontSize:12,padding:"8px 12px",margin:0}}>...y {ok.length-20} agentes más</p>}
            </div>

            {coaches.length>0&&(
              <>
                <p style={{color:"#94a3b8",fontSize:13,fontWeight:600,margin:0}}>Coaches / Managers ({coaches.length})</p>
                <div style={{overflowX:"auto",borderRadius:8,border:SD.border}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr>{["Game ID","Posición","Manager","Attrition","Impacto"].map(h=><th key={h} style={{background:"#0c2240",color:"#93c5fd",fontWeight:600,padding:"8px 10px",textAlign:"left"}}>{h}</th>)}</tr></thead>
                    <tbody>{coaches.map((c,i)=>{
                      const imp=c.attrition===0?"+10 pts":c.attrition===1?"+2 pts":c.attrition===2?"0 pts":"-5 pts";
                      const col=c.attrition===0?"#16a34a":c.attrition===1?"#d97706":c.attrition===2?"#6b7280":"#dc2626";
                      return(<tr key={i} style={{background:i%2===0?"#0f172a":"#0c1a2e"}}>
                        <td style={{padding:"7px 10px",color:"#e2e8f0",fontWeight:600}}>{c.game_id}</td>
                        <td style={{padding:"7px 10px",color:SD.muted}}>{c.position}</td>
                        <td style={{padding:"7px 10px",color:"#94a3b8"}}>{c.manager||"—"}</td>
                        <td style={{padding:"7px 10px",color:"#cbd5e1",textAlign:"center"}}>{c.attrition}</td>
                        <td style={{padding:"7px 10px",fontWeight:700,color:col,textAlign:"center"}}>{imp}</td>
                      </tr>);
                    })}</tbody>
                  </table>
                </div>
              </>
            )}

            <div style={{display:"flex",gap:10,justifyContent:"flex-end",paddingTop:4}}>
              <button onClick={reset} style={{background:"transparent",color:"#94a3b8",border:"1px solid #334155",padding:"11px 24px",borderRadius:8,cursor:"pointer",fontWeight:600}}>Cancelar</button>
              <button onClick={handleUpload} disabled={!canUpload}
                style={{background:canUpload?"#1d4ed8":"#334155",color:"#fff",border:"none",padding:"11px 28px",borderRadius:8,cursor:canUpload?"pointer":"not-allowed",fontWeight:700,fontSize:14}}>
                {!canUpload?(reviewPending?"⚠️ Completa la revisión":"⚠️ Define qué hacer con agentes nuevos"):`✅ Confirmar y subir ${weekLabel}`}
              </button>
            </div>
          </div>
        )}

        {stage==="uploading"&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"60px 0",gap:20}}>
            <div style={{width:52,height:52,border:"4px solid #1e3a5f",borderTop:"4px solid #3b82f6",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
            <p style={{color:SD.text,fontSize:18,fontWeight:600,margin:0}}>Subiendo métricas de {weekLabel}...</p>
            <div style={{width:320,background:"#1e293b",borderRadius:999,height:10,overflow:"hidden"}}>
              <div style={{width:`${progress}%`,height:"100%",background:"#3b82f6",borderRadius:999,transition:"width 0.3s ease"}}/>
            </div>
            <p style={{color:SD.muted,fontSize:13,margin:0}}>{progress}%</p>
          </div>
        )}

        {stage==="done"&&summary&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:"#052e16",border:"1px solid #14532d",borderRadius:12,padding:24,textAlign:"center"}}>
              <p style={{fontSize:42,margin:"0 0 8px"}}>🎉</p>
              <p style={{color:"#4ade80",fontSize:20,fontWeight:700,margin:"0 0 4px"}}>¡Carga completada!</p>
              <p style={{color:"#86efac",fontSize:14,margin:0}}>Semana <b>{summary.week}</b> procesada exitosamente</p>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {[{n:summary.agents_processed,l:"Agentes procesados",c:"#60a5fa"},{n:summary.agents_created,l:"Usuarios creados",c:"#a78bfa"},{n:summary.agents_updated,l:"Métricas guardadas",c:"#4ade80"},{n:summary.coaches_processed,l:"Coaches actualizados",c:"#f97316"}].map(c=>(
                <div key={c.l} style={{flex:1,minWidth:110,background:SD.card,borderRadius:10,padding:14,textAlign:"center"}}>
                  <div style={{fontSize:24,fontWeight:700,color:c.c}}>{c.n}</div>
                  <div style={{fontSize:11,color:SD.muted}}>{c.l}</div>
                </div>
              ))}
            </div>
            {summary.errors.length>0&&(
              <div style={{background:"#2d2000",border:"1px solid #78350f",borderRadius:10,padding:16}}>
                <p style={{color:"#fbbf24",fontWeight:700,margin:"0 0 8px"}}>⚠️ {summary.errors.length} errores</p>
                {summary.errors.slice(0,10).map((e,i)=><p key={i} style={{color:"#fca5a5",fontSize:12,margin:"2px 0"}}>• {e}</p>)}
              </div>
            )}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={reset} style={{background:"transparent",color:"#94a3b8",border:"1px solid #334155",padding:"11px 24px",borderRadius:8,cursor:"pointer",fontWeight:600}}>Subir otra semana</button>
              <button onClick={onClose} style={{background:"#1d4ed8",color:"#fff",border:"none",padding:"11px 24px",borderRadius:8,cursor:"pointer",fontWeight:700}}>Cerrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
