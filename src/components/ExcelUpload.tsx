import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";
const DEFAULT_PASSWORD = "Centris2026";

const HDRS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function dbInsert(table: string, body: any) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: { ...HDRS, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function dbDelete(table: string, filter: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE", headers: { ...HDRS, Prefer: "return=minimal" },
  });
}

async function dbPatch(table: string, filter: string, body: any) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH", headers: { ...HDRS, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

async function dbGet(table: string, filter = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${filter ? "?" + filter : ""}`, { headers: HDRS });
  const txt = await res.text();
  return txt ? JSON.parse(txt) : [];
}

type AhtType = "time" | "Productivity";
type AgentFlag = "ok" | "msl" | "both_empty";
type ReviewReason = "vacation" | "sick_leave" | "termination" | "skip" | "";

interface ProcessedAgent {
  game_id: string; project: string; coach_id: string; qcoach: string;
  aht_seconds: number | null; aht_goal_seconds: number | null; aht_type: AhtType;
  qa_score: number | null; qa_goal: number;
  absences: number; tardies: number; flag: AgentFlag;
  attendance_status: "perfect" | "late" | "absent";
  attendance_pts: number; aht_pts: number; qa_pts: number; total_pts: number;
  is_new: boolean; review_reason?: ReviewReason;
}

interface CoachRow { game_id: string; position: string; manager: string; attrition: number; }
interface UploadSummary { week: string; agents_processed: number; agents_created: number; agents_updated: number; coaches_processed: number; errors: string[]; }

const isMSL = (v: any) => String(v ?? "").trim().toUpperCase() === "MSL";
const isBlank = (v: any) => v === null || v === undefined || String(v).trim() === "" || String(v).trim().toUpperCase() === "N/A" || String(v).trim().toUpperCase() === "#N/A";

// ── Flag logic: only flag if MSL explicit OR both AHT and QA are blank ──
function detectFlag(ahtRaw: any, qaRaw: any): AgentFlag {
  if (isMSL(ahtRaw) || isMSL(qaRaw)) return "msl";
  const ahtBlank = isBlank(ahtRaw);
  const qaBlank  = isBlank(qaRaw);
  if (ahtBlank && qaBlank) return "both_empty";
  return "ok"; // 0 is valid!
}

function convertAHT(raw: any, type: AhtType): number | null {
  if (isBlank(raw) || isMSL(raw)) return null;
  const n = Number(raw);
  if (isNaN(n)) return null;
  if (n === 0) return 0; // 0 is valid — agent had no calls
  if (type === "Productivity") return parseFloat(n.toFixed(4));
  if (n > 0 && n < 1) return Math.round(n * 86400); // Excel time serial
  return Math.round(n); // Already in seconds
}

function parseQA(raw: any): number | null {
  if (isBlank(raw) || isMSL(raw)) return null;
  const s = String(raw).replace("%", "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n; // 0 is valid!
}

function calcAttendance(abs: number, tard: number) {
  if (abs >= 1 || tard >= 2) return { status: "absent" as const, pts: 0 };
  if (tard === 1) return { status: "late" as const, pts: 2 };
  return { status: "perfect" as const, pts: 5 };
}

function calcPts(val: number | null, goal: number | null, higherBetter: boolean): number {
  if (val === null || goal === null) return 0;
  if (higherBetter) return val > goal ? 5 : val === goal ? 2 : 0;
  // time: lower is better, but 0 means no calls = 0 pts
  if (val === 0) return 0;
  return val < goal ? 5 : val === goal ? 2 : 0;
}

function findCol(keys: string[], ...names: string[]): string {
  return keys.find(k => {
    const kn = k.toLowerCase().replace(/[\s_]/g, "");
    return names.some(n => kn === n.toLowerCase().replace(/[\s_]/g, "") || kn.includes(n.toLowerCase().replace(/[\s_]/g, "")));
  }) || "";
}

function getWeekLabel(filename: string): string {
  const mW = filename.match(/W(\d{1,2})/i);
  if (mW) return `W${mW[1]}-${new Date().getFullYear()}`;
  const mD = filename.match(/(\w+)[_\s]+(\d+)[_\s]+to[_\s]+(\w+)[_\s]+(\d+)/i);
  if (mD) return `${mD[1]}_${mD[2]}-${mD[3]}_${mD[4]}`;
  const now = new Date();
  const w = Math.ceil(((now.getTime() - new Date(now.getFullYear(),0,1).getTime()) / 86400000 + new Date(now.getFullYear(),0,1).getDay() + 1) / 7);
  return `W${w}-${now.getFullYear()}`;
}

export default function ExcelUpload({ onClose }: { onClose?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<"idle"|"preview"|"uploading"|"done"|"error">("idle");
  const [agents, setAgents] = useState<ProcessedAgent[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const coachesRef = useRef<CoachRow[]>([]);
  const [weekLabel, setWeekLabel] = useState("");
  const [weekAlreadyLoaded, setWeekAlreadyLoaded] = useState(false);
  const [summary, setSummary] = useState<UploadSummary|null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [importNew, setImportNew] = useState<"all"|"none"|"pending">("pending");
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");

  const handleDrag = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(e.type==="dragover"); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f=e.dataTransfer.files[0]; if(f) processFile(f); }, []);
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => { const f=e.target.files?.[0]; if(f) processFile(f); };

  const processFile = async (f: File) => {
    setErrors([]);
    const week = getWeekLabel(f.name);
    setWeekLabel(week);

    try { const ex = await dbGet("weekly_metrics", `week=eq.${encodeURIComponent(week)}&limit=1&select=id`); setWeekAlreadyLoaded(Array.isArray(ex) && ex.length > 0); } catch { setWeekAlreadyLoaded(false); }

    let existingIds = new Set<string>();
    try { const p = await dbGet("profiles", "select=game_id&is_active=eq.true"); existingIds = new Set((Array.isArray(p)?p:[]).map((x:any)=>String(x.game_id).trim().toUpperCase())); } catch {}

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type:"array" });
        const mName = wb.SheetNames.find(n => /april|week|kpi|metric/i.test(n)) || wb.SheetNames[1] || wb.SheetNames[0];
        const ms = wb.Sheets[mName];
        if (!ms) { setErrors([`No hoja de métricas. Hojas: ${wb.SheetNames.join(", ")}`]); setStage("error"); return; }

        const rows: any[] = XLSX.utils.sheet_to_json(ms, { defval: "" });
        if (!rows.length) { setErrors(["Hoja vacía."]); setStage("error"); return; }

        const keys = Object.keys(rows[0] || {});
        const cGameId  = findCol(keys, "Game ID", "gameid", "game_id", "Login");
        const cProject = findCol(keys, "Project", "campaign");
        const cCoach   = findCol(keys, "Coach ID", "CoachID", "coach_id");
        const cQcoach  = findCol(keys, "Qcoach", "QA Coach", "QACoach");
        const cAht     = findCol(keys, "AHT");
        const cAhtGoal = findCol(keys, "AHT Goal", "AHTGoal", "aht_goal");
        const cAhtType = findCol(keys, "AHT type", "AHTtype", "aht_type", "AHT Type");
        const cQa      = findCol(keys, "QA Score", "QAScore", "qa_score");
        const cQaGoal  = findCol(keys, "QA Goal", "QAGoal", "qa_goal");
        const cAbsent  = findCol(keys, "Absent", "Absences");
        const cTardies = findCol(keys, "Tardies", "Tardie");

        const processed: ProcessedAgent[] = rows
          .filter((r:any) => { const gid = String(r[cGameId]??"").trim(); return gid && gid !== "Game ID"; })
          .map((r:any) => {
            const gid     = String(r[cGameId]??"").trim();
            const ahtRaw  = r[cAht];
            const qaRaw   = r[cQa];
            const ahtType: AhtType = /productivity/i.test(String(r[cAhtType]??"")) ? "Productivity" : "time";
            const abs     = Number(r[cAbsent]??0)||0;
            const tard    = Number(r[cTardies]??0)||0;
            const flag    = detectFlag(ahtRaw, qaRaw);
            const ahtSec  = convertAHT(ahtRaw, ahtType);
            const ahtGoal = convertAHT(r[cAhtGoal], ahtType);
            const qaN     = parseQA(qaRaw);
            const qaGoal  = parseFloat(String(r[cQaGoal]??"0").replace("%",""))||0;
            const att     = calcAttendance(abs, tard);
            const ahtPts  = flag==="ok" ? calcPts(ahtSec, ahtGoal, ahtType==="Productivity") : 0;
            const qaPts   = flag==="ok" ? calcPts(qaN, qaGoal, true) : 0;
            const attPts  = flag==="msl" ? 0 : att.pts;
            return {
              game_id: gid, project: String(r[cProject]??"").trim(),
              coach_id: String(r[cCoach]??"").trim(), qcoach: String(r[cQcoach]??"").trim(),
              aht_seconds: ahtSec, aht_goal_seconds: ahtGoal, aht_type: ahtType,
              qa_score: qaN, qa_goal: qaGoal, absences: abs, tardies: tard, flag,
              attendance_status: att.status, attendance_pts: attPts, aht_pts: ahtPts, qa_pts: qaPts,
              total_pts: attPts+ahtPts+qaPts,
              is_new: !existingIds.has(gid.toUpperCase()),
              review_reason: flag!=="ok" ? "" : undefined,
            };
          });

        const csName = wb.SheetNames.find(n => /coach|attrition/i.test(n)) || "";
        let parsedCoaches: CoachRow[] = [];
        if (csName && wb.Sheets[csName]) {
          const cr: any[] = XLSX.utils.sheet_to_json(wb.Sheets[csName], { defval:"" });
          parsedCoaches = cr.filter((r:any)=>String(r["Game ID"]??r["game_id"]??"").trim()&&/coach|manager/i.test(String(r["Position"]??r["position"]??"")))
            .map((r:any)=>({ game_id:String(r["Game ID"]??r["game_id"]??"").trim(), position:String(r["Position"]??r["position"]??"").trim(), manager:String(r["Manager"]??r["manager"]??"").trim(), attrition:Number(r["Attrition"]??r["attrition"]??0) }));
        }

        if (!processed.length) { setErrors(["No agentes válidos."]); setStage("error"); return; }
        setAgents(processed); setCoaches(parsedCoaches); coachesRef.current=parsedCoaches; setStage("preview");
      } catch(err) { setErrors([`Error: ${err}`]); setStage("error"); }
    };
    reader.readAsArrayBuffer(f);
  };

  const updateReason = (gid: string, reason: ReviewReason) =>
    setAgents(prev => prev.map(a => a.game_id===gid ? {...a, review_reason:reason} : a));

  // Select all flagged agents with one reason
  const selectAllReason = (reason: ReviewReason) =>
    setAgents(prev => prev.map(a => a.flag!=="ok" ? {...a, review_reason:reason} : a));

  const handleUpload = async () => {
    setStage("uploading"); setProgress(0); setProgressMsg("Limpiando...");
    const errs: string[] = []; let created=0, updated=0;
    const week = weekLabel;

    try { await dbDelete("weekly_metrics", `week=eq.${encodeURIComponent(week)}`); } catch {}
    setProgress(5);

    if (resolvedImport==="all") {
      setProgressMsg("Creando usuarios...");
      for (const a of agents.filter(x=>x.is_new)) {
        try {
          await dbInsert("profiles", {
            game_id:a.game_id, username:a.game_id, full_name:a.game_id,
            password_hash:DEFAULT_PASSWORD, needs_pw_change:true, temp_pw:DEFAULT_PASSWORD,
            role:"usuario", team:a.project, is_active:true, level:1,
            kudos:0, gold_kudos:0, referrals:[], weekly_perf:[],
          });
          created++;
        } catch(e:any) { if(!e.message?.includes("duplicate")&&!e.message?.includes("unique")) errs.push(`Crear ${a.game_id}: ${e.message}`); }
      }
    }
    setProgress(25);

    for (const a of agents.filter(x=>x.review_reason==="termination")) {
      try { await dbPatch("profiles", `game_id=eq.${encodeURIComponent(a.game_id)}`, {is_active:false}); }
      catch(e:any) { errs.push(`Baja ${a.game_id}: ${e.message}`); }
    }

    setProgressMsg("Guardando métricas...");
    // Build coach->manager map from sheet 2
    const coachManagerMap: Record<string,string> = {};
    for (const c of coachesRef.current) {
      if (c.game_id && c.manager) {
        coachManagerMap[c.game_id.trim().toUpperCase()] = c.manager.trim();
      }
    }
    console.log("coachManagerMap entries:", Object.keys(coachManagerMap).length, coachManagerMap);

    const metricsRows = agents.filter(a=>a.review_reason!=="termination").map(a=>{
      const skip = a.review_reason==="vacation"||a.review_reason==="sick_leave"||a.review_reason==="skip";
      const coachKey = (a.coach_id||a.qcoach||"").trim().toUpperCase();
      const managerGameId = coachManagerMap[coachKey] || null;
      return {
        game_id:a.game_id, week, project:a.project, coach:a.coach_id, qa_coach:a.qcoach,
        manager_game_id:managerGameId,
        aht:a.aht_seconds, aht_goal:a.aht_goal_seconds, aht_type:a.aht_type,
        qa_pct:a.qa_score, qa_goal:a.qa_goal,
        absences:skip?0:a.absences, tardies:skip?0:a.tardies,
        attendance_status:skip?"excused":a.attendance_status,
        attendance_pts:skip?0:a.attendance_pts, aht_pts:skip?0:a.aht_pts,
        qa_pts:skip?0:a.qa_pts, total_pts:skip?0:a.total_pts,
        flag:a.flag, review_reason:a.review_reason||null,
      };
    });

    const BATCH=50;
    for (let i=0; i<metricsRows.length; i+=BATCH) {
      const batch=metricsRows.slice(i,i+BATCH);
      try { await dbInsert("weekly_metrics", batch); updated+=batch.length; }
      catch(e:any) {
        errs.push(`Batch ${Math.floor(i/BATCH)+1}: ${e.message}`);
        for (const row of batch) { try { await dbInsert("weekly_metrics",row); updated++; } catch(e2:any) { errs.push(`${row.game_id}: ${e2.message}`); } }
      }
      setProgress(25+Math.round(((i+BATCH)/metricsRows.length)*65));
      setProgressMsg(`Guardando... ${Math.min(i+BATCH,metricsRows.length)}/${metricsRows.length}`);
    }

    setProgressMsg("Actualizando coaches...");
    for (const c of coaches) {
      try { await dbInsert("staff_attrition_monthly",{coach_name:c.game_id,week,voluntary_exits:c.attrition,position:c.position,manager_id:c.manager||null}); }
      catch { try { await dbPatch("staff_attrition_monthly",`coach_name=eq.${encodeURIComponent(c.game_id)}&week=eq.${encodeURIComponent(week)}`,{voluntary_exits:c.attrition}); } catch {} }
    }

    setProgress(100); setProgressMsg("¡Completado!");
    setSummary({week, agents_processed:agents.length, agents_created:created, agents_updated:updated, coaches_processed:coaches.length, errors:errs});
    setStage("done");
  };

  const reset = () => { setStage("idle"); setAgents([]); setCoaches([]); setErrors([]); setSummary(null); setWeekLabel(""); setWeekAlreadyLoaded(false); setImportNew("pending"); setProgress(0); setProgressMsg(""); };

  const flagged = agents.filter(a=>a.flag!=="ok");
  const ok      = agents.filter(a=>a.flag==="ok");
  const newA    = agents.filter(a=>a.is_new);
  const reviewPending = flagged.some(a=>!a.review_reason);
  const resolvedImport = newA.length === 0 ? "none" : importNew;
  const canUpload     = !reviewPending && resolvedImport!=="pending";
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
            <label style={{display:"inline-block",background:"#1d4ed8",color:"#fff",padding:"11px 28px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:14,marginBottom:16}}>
              Seleccionar archivo
              <input type="file" accept=".xlsx,.xls" onChange={handleInput} style={{display:"none"}}/>
            </label>
            <div style={{background:"#0c2240",borderRadius:8,padding:"14px 18px",textAlign:"left",maxWidth:580,margin:"16px auto 0"}}>
              <p style={{color:"#93c5fd",fontWeight:600,margin:"0 0 6px",fontSize:13}}>Columnas esperadas:</p>
              <p style={{color:SD.muted,fontSize:12,margin:"3px 0"}}>Game ID · Project · Coach ID · Qcoach · AHT · AHT Goal · AHT type · QA Score · QA Goal · Absent · Tardies</p>
              <p style={{color:SD.muted,fontSize:12,margin:"6px 0 0"}}><b style={{color:"#fbbf24"}}>Nota:</b> AHT=0 → agente sin llamadas (0 pts). Solo se pide revisión si ambas métricas están vacías o hay MSL explícito.</p>
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
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {weekAlreadyLoaded&&<div style={{background:"#2d2000",border:"1px solid #78350f",borderRadius:10,padding:12}}><p style={{color:"#fbbf24",fontWeight:700,margin:0}}>⚠️ Semana <b>{weekLabel}</b> ya cargada — se sobreescribirá</p></div>}

            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[{n:agents.length,l:"Total",c:"#60a5fa"},{n:ok.length,l:"OK",c:"#4ade80"},{n:flagged.length,l:"Revisión",c:"#fbbf24"},{n:newA.length,l:"Nuevos",c:"#a78bfa"},{n:coaches.length,l:"Coaches",c:"#f97316"}].map(c=>(
                <div key={c.l} style={{flex:1,minWidth:90,background:SD.card,borderRadius:10,padding:12,textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:700,color:c.c}}>{c.n}</div>
                  <div style={{fontSize:11,color:SD.muted}}>{c.l}</div>
                </div>
              ))}
            </div>

            {newA.length>0&&(
              <div style={{background:"#160d33",border:"1px solid #4c1d95",borderRadius:10,padding:14}}>
                <p style={{color:"#a78bfa",fontWeight:700,margin:"0 0 6px"}}>🆕 {newA.length} agentes nuevos</p>
                <p style={{color:"#7c3aed",fontSize:13,margin:"0 0 10px"}}>Password temporal: <b style={{color:"#c4b5fd"}}>{DEFAULT_PASSWORD}</b></p>
                <div style={{display:"flex",gap:8}}>
                  {[{k:"all",l:`✅ Crear todos (${newA.length})`},{k:"none",l:"⏭️ Omitir"}].map(b=>(
                    <button key={b.k} onClick={()=>setImportNew(b.k as any)}
                      style={{background:importNew===b.k?"#7c3aed":"#1e293b",color:importNew===b.k?"#fff":"#94a3b8",border:`1px solid ${importNew===b.k?"#7c3aed":"#334155"}`,padding:"8px 16px",borderRadius:7,cursor:"pointer",fontWeight:600,fontSize:13}}>
                      {b.l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {flagged.length>0&&(
              <div style={{background:"#1a1200",border:"1px solid #78350f",borderRadius:10,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <p style={{color:"#fbbf24",fontWeight:700,margin:0}}>⚠️ Requieren acción ({flagged.length})</p>
                  {/* Bulk select buttons */}
                  <div style={{display:"flex",gap:6}}>
                    <span style={{color:SD.muted,fontSize:12,alignSelf:"center"}}>Todos:</span>
                    {[{r:"sick_leave",l:"🏥 MSL"},{r:"vacation",l:"🏖️ Vacaciones"},{r:"skip",l:"⏭️ Omitir"},{r:"termination",l:"📤 Baja"}].map(b=>(
                      <button key={b.r} onClick={()=>selectAllReason(b.r as ReviewReason)}
                        style={{background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",padding:"4px 10px",borderRadius:6,cursor:"pointer",fontWeight:600,fontSize:11}}>
                        {b.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:300,overflowY:"auto"}}>
                  {flagged.map((a,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:"#0f0a00",borderRadius:8,padding:"8px 12px",flexWrap:"wrap"}}>
                      <div style={{flex:1}}>
                        <span style={{color:"#e2e8f0",fontWeight:700,fontSize:13}}>{a.game_id}</span>
                        <span style={{color:SD.muted,fontSize:11,marginLeft:8}}>{a.project}</span>
                        <span style={{marginLeft:8,padding:"1px 7px",borderRadius:999,fontSize:10,fontWeight:700,
                          background:a.flag==="msl"?"#164e63":"#1c1917",
                          color:a.flag==="msl"?"#67e8f9":"#d6d3d1"}}>
                          {a.flag==="msl"?"🏥 MSL":"📭 Sin métricas"}
                        </span>
                      </div>
                      <select value={a.review_reason||""} onChange={e=>updateReason(a.game_id,e.target.value as ReviewReason)}
                        style={{background:"#1e293b",border:`1px solid ${!a.review_reason?"#dc2626":"#334155"}`,borderRadius:6,padding:"5px 8px",color:"#e2e8f0",fontSize:12,cursor:"pointer",outline:"none"}}>
                        <option value="">-- Razón --</option>
                        <option value="vacation">🏖️ Vacaciones</option>
                        <option value="sick_leave">🏥 Sick Leave / MSL</option>
                        <option value="termination">📤 Baja</option>
                        <option value="skip">⏭️ Omitir</option>
                      </select>
                    </div>
                  ))}
                </div>
                {reviewPending&&<p style={{color:"#ef4444",fontSize:12,marginTop:8}}>⚠️ Selecciona razón para todos — o usa los botones de arriba para asignar en bloque.</p>}
              </div>
            )}

            <p style={{color:"#94a3b8",fontSize:13,fontWeight:600,margin:0}}>Vista previa — {ok.length} agentes OK</p>
            <div style={{overflowX:"auto",borderRadius:8,border:SD.border}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr>{["Game ID","Proj","Coach","AHT","MetaAHT","Tipo","QA%","MetaQA","Aus","Tard","Att","AHTp","QAp","Total"].map(h=>(
                  <th key={h} style={{background:"#0c2240",color:"#93c5fd",fontWeight:600,padding:"7px 8px",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>
                ))}</tr></thead>
                <tbody>{ok.slice(0,20).map((a,i)=>(
                  <tr key={i} style={{background:i%2===0?"#0f172a":"#0c1a2e"}}>
                    <td style={{padding:"6px 8px",color:a.is_new?"#c4b5fd":"#cbd5e1",fontWeight:a.is_new?700:400}}>{a.game_id}{a.is_new&&<span style={{color:"#a78bfa",fontSize:8,marginLeft:3}}>NEW</span>}</td>
                    <td style={{padding:"6px 8px",color:SD.muted}}>{a.project}</td>
                    <td style={{padding:"6px 8px",color:SD.muted}}>{a.coach_id}</td>
                    <td style={{padding:"6px 8px",color:"#cbd5e1"}}>{a.aht_type==="Productivity"?a.aht_seconds?.toFixed(2):a.aht_seconds!==null?`${a.aht_seconds}s`:"-"}</td>
                    <td style={{padding:"6px 8px",color:SD.muted}}>{a.aht_type==="Productivity"?a.aht_goal_seconds?.toFixed(2):a.aht_goal_seconds!==null?`${a.aht_goal_seconds}s`:"-"}</td>
                    <td style={{padding:"6px 8px"}}><span style={{fontSize:9,fontWeight:700,color:a.aht_type==="Productivity"?"#4ade80":"#60a5fa"}}>{a.aht_type==="Productivity"?"📈":"⏱"}</span></td>
                    <td style={{padding:"6px 8px",color:"#cbd5e1"}}>{a.qa_score!==null?`${a.qa_score}%`:"-"}</td>
                    <td style={{padding:"6px 8px",color:SD.muted}}>{a.qa_goal}%</td>
                    <td style={{padding:"6px 8px",color:"#cbd5e1",textAlign:"center"}}>{a.absences}</td>
                    <td style={{padding:"6px 8px",color:"#cbd5e1",textAlign:"center"}}>{a.tardies}</td>
                    <td style={{padding:"6px 8px"}}><span style={{padding:"1px 5px",borderRadius:999,fontSize:9,fontWeight:600,color:"#fff",background:a.attendance_status==="perfect"?"#16a34a":a.attendance_status==="late"?"#d97706":"#dc2626"}}>{a.attendance_pts}p</span></td>
                    <td style={{padding:"6px 8px",color:"#cbd5e1",textAlign:"center"}}>{a.aht_pts}</td>
                    <td style={{padding:"6px 8px",color:"#cbd5e1",textAlign:"center"}}>{a.qa_pts}</td>
                    <td style={{padding:"6px 8px",fontWeight:700,color:"#60a5fa",textAlign:"center"}}>{a.total_pts}</td>
                  </tr>
                ))}</tbody>
              </table>
              {ok.length>20&&<p style={{color:"#475569",fontSize:11,padding:"6px 10px",margin:0}}>...y {ok.length-20} más</p>}
            </div>

            {coaches.length>0&&(
              <div style={{overflowX:"auto",borderRadius:8,border:SD.border}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr>{["Game ID","Posición","Manager","Attrition","Impacto"].map(h=><th key={h} style={{background:"#0c2240",color:"#93c5fd",fontWeight:600,padding:"7px 8px",textAlign:"left"}}>{h}</th>)}</tr></thead>
                  <tbody>{coaches.map((c,i)=>{
                    const imp=c.attrition===0?"+10":c.attrition===1?"+2":c.attrition===2?"0":"-5";
                    const col=c.attrition===0?"#16a34a":c.attrition===1?"#d97706":c.attrition===2?"#6b7280":"#dc2626";
                    return(<tr key={i} style={{background:i%2===0?"#0f172a":"#0c1a2e"}}>
                      <td style={{padding:"6px 8px",color:"#e2e8f0",fontWeight:600}}>{c.game_id}</td>
                      <td style={{padding:"6px 8px",color:SD.muted}}>{c.position}</td>
                      <td style={{padding:"6px 8px",color:"#94a3b8"}}>{c.manager||"—"}</td>
                      <td style={{padding:"6px 8px",color:"#cbd5e1",textAlign:"center"}}>{c.attrition}</td>
                      <td style={{padding:"6px 8px",fontWeight:700,color:col,textAlign:"center"}}>{imp} pts</td>
                    </tr>);
                  })}</tbody>
                </table>
              </div>
            )}

            <div style={{display:"flex",gap:10,justifyContent:"flex-end",paddingTop:4}}>
              <button onClick={reset} style={{background:"transparent",color:"#94a3b8",border:"1px solid #334155",padding:"11px 24px",borderRadius:8,cursor:"pointer",fontWeight:600}}>Cancelar</button>
              <button onClick={handleUpload} disabled={!canUpload}
                style={{background:canUpload?"#1d4ed8":"#334155",color:"#fff",border:"none",padding:"11px 28px",borderRadius:8,cursor:canUpload?"pointer":"not-allowed",fontWeight:700}}>
                {!canUpload?(reviewPending?"⚠️ Completa revisión":"⚠️ Define agentes nuevos"):`✅ Confirmar y subir ${weekLabel}`}
              </button>
            </div>
          </div>
        )}

        {stage==="uploading"&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"60px 0",gap:16}}>
            <div style={{width:52,height:52,border:"4px solid #1e3a5f",borderTop:"4px solid #3b82f6",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
            <p style={{color:SD.text,fontSize:18,fontWeight:600,margin:0}}>Subiendo {weekLabel}...</p>
            <div style={{width:320,background:"#1e293b",borderRadius:999,height:10,overflow:"hidden"}}>
              <div style={{width:`${progress}%`,height:"100%",background:"#3b82f6",borderRadius:999,transition:"width 0.3s ease"}}/>
            </div>
            <p style={{color:SD.muted,fontSize:13,margin:0}}>{progress}% — {progressMsg}</p>
          </div>
        )}

        {stage==="done"&&summary&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:"#052e16",border:"1px solid #14532d",borderRadius:12,padding:24,textAlign:"center"}}>
              <p style={{fontSize:42,margin:"0 0 8px"}}>🎉</p>
              <p style={{color:"#4ade80",fontSize:20,fontWeight:700,margin:"0 0 4px"}}>¡Carga completada!</p>
              <p style={{color:"#86efac",fontSize:14,margin:0}}>Semana <b>{summary.week}</b></p>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {[{n:summary.agents_processed,l:"Procesados",c:"#60a5fa"},{n:summary.agents_created,l:"Creados",c:"#a78bfa"},{n:summary.agents_updated,l:"Métricas guardadas",c:"#4ade80"},{n:summary.coaches_processed,l:"Coaches",c:"#f97316"}].map(c=>(
                <div key={c.l} style={{flex:1,minWidth:100,background:SD.card,borderRadius:10,padding:14,textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:700,color:c.c}}>{c.n}</div>
                  <div style={{fontSize:11,color:SD.muted}}>{c.l}</div>
                </div>
              ))}
            </div>
            {summary.errors.length>0&&(
              <div style={{background:"#2d2000",border:"1px solid #78350f",borderRadius:10,padding:14}}>
                <p style={{color:"#fbbf24",fontWeight:700,margin:"0 0 8px"}}>⚠️ {summary.errors.length} errores</p>
                {summary.errors.slice(0,5).map((e,i)=><p key={i} style={{color:"#fca5a5",fontSize:12,margin:"2px 0"}}>• {e}</p>)}
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
