import { useState, useCallback } from "react";
import * as XLSX from "xlsx";

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";

async function sbFetch(path: string, options: any = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...options.headers,
    },
    ...options,
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

interface AgentRow {
  game_id: string; project: string; coach: string; qa_coach: string;
  aht: number; aht_goal: number; qa_pct: number; qa_goal: number;
  absences: number; tardies: number;
}
interface CoachExitRow { coach: string; voluntary_exits: number; }
interface ProcessedAgent {
  game_id: string; project: string; coach: string; qa_coach: string;
  aht: number; aht_goal: number; qa_pct: number; qa_goal: number;
  absences: number; tardies: number;
  attendance_status: "perfect"|"late"|"absent";
  attendance_pts: number; aht_pts: number; qa_pts: number; total_pts: number;
}
interface UploadSummary {
  week: string; agents_processed: number; coaches_processed: number;
  agents_updated: number; errors: string[];
}

function calcAttendance(absences: number, tardies: number) {
  if (absences >= 1 || tardies >= 2) return { status: "absent" as const, pts: 0 };
  if (tardies === 1) return { status: "late" as const, pts: 2 };
  return { status: "perfect" as const, pts: 5 };
}
function calcPts(value: number, goal: number, higherIsBetter = true) {
  const beats = higherIsBetter ? value > goal : value < goal;
  return beats ? 5 : value === goal ? 2 : 0;
}
function getWeekLabel(filename: string) {
  const match = filename.match(/W(\d{1,2})/i);
  if (match) return `W${match[1]}`;
  const now = new Date();
  const week = Math.ceil(((now.getTime() - new Date(now.getFullYear(),0,1).getTime()) / 86400000 + new Date(now.getFullYear(),0,1).getDay() + 1) / 7);
  return `W${week}`;
}

export default function ExcelUpload({ onClose }: { onClose?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<"idle"|"preview"|"uploading"|"done"|"error">("idle");
  const [agents, setAgents] = useState<ProcessedAgent[]>([]);
  const [coachExits, setCoachExits] = useState<CoachExitRow[]>([]);
  const [weekLabel, setWeekLabel] = useState("");
  const [summary, setSummary] = useState<UploadSummary|null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const handleDrag = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(e.type==="dragover"); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f=e.dataTransfer.files[0]; if(f) processFile(f); }, []);
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => { const f=e.target.files?.[0]; if(f) processFile(f); };

  const processFile = (f: File) => {
    setErrors([]);
    setWeekLabel(getWeekLabel(f.name));
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type:"array" });
        const agentSheet = wb.Sheets["agents"];
        if (!agentSheet) { setErrors(['No se encontró la hoja "agents"']); setStage("error"); return; }
        const raw: AgentRow[] = XLSX.utils.sheet_to_json(agentSheet, { defval:0 });
        const processed: ProcessedAgent[] = raw.filter(r=>r.game_id&&String(r.game_id).trim()!=="").map(r=>{
          const att = calcAttendance(Number(r.absences), Number(r.tardies));
          const ahtPts = calcPts(Number(r.aht), Number(r.aht_goal), false);
          const qaPts = calcPts(Number(r.qa_pct), Number(r.qa_goal), true);
          return { game_id:String(r.game_id).trim(), project:String(r.project||""), coach:String(r.coach||""), qa_coach:String(r.qa_coach||""),
            aht:Number(r.aht), aht_goal:Number(r.aht_goal), qa_pct:Number(r.qa_pct), qa_goal:Number(r.qa_goal),
            absences:Number(r.absences), tardies:Number(r.tardies),
            attendance_status:att.status, attendance_pts:att.pts, aht_pts:ahtPts, qa_pts:qaPts, total_pts:att.pts+ahtPts+qaPts };
        });
        if (processed.length===0) { setErrors(['La hoja "agents" no tiene datos válidos']); setStage("error"); return; }
        const coachSheet = wb.Sheets["coaches"];
        const coaches: CoachExitRow[] = coachSheet ? (XLSX.utils.sheet_to_json<CoachExitRow>(coachSheet,{defval:0})).filter(r=>r.coach&&String(r.coach).trim()!=="") : [];
        setAgents(processed); setCoachExits(coaches); setStage("preview");
      } catch(err) { setErrors([`Error: ${err}`]); setStage("error"); }
    };
    reader.readAsArrayBuffer(f);
  };

  const handleUpload = async () => {
    setStage("uploading");
    const errs: string[] = []; let updated = 0;
    const wk = weekLabel;
    for (const a of agents) {
      try {
        await sbFetch(`weekly_metrics`, { method:"POST", prefer:"resolution=merge-duplicates",
          body: JSON.stringify({ game_id:a.game_id, week:wk, project:a.project, coach:a.coach, qa_coach:a.qa_coach,
            aht:a.aht, aht_goal:a.aht_goal, qa_pct:a.qa_pct, qa_goal:a.qa_goal,
            absences:a.absences, tardies:a.tardies, attendance_status:a.attendance_status,
            attendance_pts:a.attendance_pts, aht_pts:a.aht_pts, qa_pts:a.qa_pts, total_pts:a.total_pts }) });
        updated++;
      } catch(e: any) { errs.push(`${a.game_id}: ${e.message}`); }
    }
    for (const c of coachExits) {
      try {
        await sbFetch(`staff_attrition_monthly`, { method:"POST", prefer:"resolution=merge-duplicates",
          body: JSON.stringify({ coach_name:c.coach, week:wk, voluntary_exits:c.voluntary_exits }) });
      } catch(e: any) { errs.push(`Coach ${c.coach}: ${e.message}`); }
    }
    setSummary({ week:wk, agents_processed:agents.length, coaches_processed:coachExits.length, agents_updated:updated, errors:errs });
    setStage("done");
  };

  const reset = () => { setStage("idle"); setAgents([]); setCoachExits([]); setErrors([]); setSummary(null); setWeekLabel(""); };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16}}>
      <div style={{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:16,width:"100%",maxWidth:960,maxHeight:"90vh",overflowY:"auto",padding:24,boxShadow:"0 25px 60px rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <h2 style={{color:"#f1f5f9",fontSize:20,fontWeight:700,margin:0}}>📊 Carga Semanal de Métricas</h2>
            {weekLabel&&<span style={{display:"inline-block",marginTop:6,background:"#1d4ed8",color:"#bfdbfe",padding:"2px 10px",borderRadius:999,fontSize:12,fontWeight:600}}>{weekLabel}</span>}
          </div>
          <button onClick={onClose||reset} style={{background:"transparent",border:"none",color:"#64748b",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>

        {stage==="idle"&&(
          <div onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
            style={{border:`2px dashed ${isDragging?"#3b82f6":"#1e3a5f"}`,borderRadius:12,padding:"48px 32px",textAlign:"center",background:isDragging?"rgba(59,130,246,0.08)":"transparent",cursor:"pointer"}}>
            <div style={{fontSize:48,marginBottom:12}}>📁</div>
            <p style={{color:"#f1f5f9",fontSize:18,fontWeight:600,margin:"0 0 4px"}}>Arrastra tu archivo aquí</p>
            <p style={{color:"#64748b",fontSize:13,margin:"0 0 20px"}}>metrics_2026-W17.xlsx</p>
            <label style={{display:"inline-block",background:"#1d4ed8",color:"#fff",padding:"10px 24px",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:14,marginBottom:24}}>
              Seleccionar archivo
              <input type="file" accept=".xlsx,.xls" onChange={handleFileInput} style={{display:"none"}}/>
            </label>
            <div style={{background:"#0c2240",borderRadius:8,padding:"14px 18px",textAlign:"left",maxWidth:560,margin:"0 auto"}}>
              <p style={{color:"#93c5fd",fontWeight:600,margin:"0 0 6px",fontSize:13}}>Formato esperado:</p>
              <p style={{color:"#64748b",fontSize:12,margin:"3px 0"}}>📄 Hoja <b>agents</b>: game_id · project · coach · qa_coach · aht · aht_goal · qa_pct · qa_goal · absences · tardies</p>
              <p style={{color:"#64748b",fontSize:12,margin:"3px 0"}}>📄 Hoja <b>coaches</b>: coach · voluntary_exits</p>
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
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {[{n:agents.length,l:"Agentes"},{n:coachExits.length,l:"Coaches"},{n:agents.filter(a=>a.attendance_status==="perfect").length,l:"Asist. perfecta"},{n:agents.filter(a=>a.qa_pts===5).length,l:"QA sobre meta"}].map(c=>(
                <div key={c.l} style={{flex:1,minWidth:110,background:"#1e293b",borderRadius:10,padding:14,textAlign:"center"}}>
                  <div style={{fontSize:26,fontWeight:700,color:"#60a5fa"}}>{c.n}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{c.l}</div>
                </div>
              ))}
            </div>
            <div style={{overflowX:"auto",borderRadius:8,border:"1px solid #1e3a5f"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr>{["Game ID","Project","Coach","QA Coach","AHT","Meta AHT","QA%","Meta QA","Aus","Tard","Status","Att Pts","AHT Pts","QA Pts","Total"].map(h=>(
                  <th key={h} style={{background:"#0c2240",color:"#93c5fd",fontWeight:600,padding:"8px 10px",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>
                ))}</tr></thead>
                <tbody>{agents.slice(0,20).map((a,i)=>(
                  <tr key={i} style={{background:i%2===0?"#0f172a":"#0c1a2e"}}>
                    <td style={{padding:"7px 10px",color:"#cbd5e1"}}>{a.game_id}</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1"}}>{a.project}</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1"}}>{a.coach}</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1"}}>{a.qa_coach}</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1"}}>{a.aht}s</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1"}}>{a.aht_goal}s</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1"}}>{a.qa_pct}%</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1"}}>{a.qa_goal}%</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1",textAlign:"center"}}>{a.absences}</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1",textAlign:"center"}}>{a.tardies}</td>
                    <td style={{padding:"7px 10px"}}><span style={{padding:"2px 8px",borderRadius:999,fontSize:11,fontWeight:600,color:"#fff",background:a.attendance_status==="perfect"?"#16a34a":a.attendance_status==="late"?"#d97706":"#dc2626"}}>{a.attendance_status}</span></td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1",textAlign:"center"}}>{a.attendance_pts}</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1",textAlign:"center"}}>{a.aht_pts}</td>
                    <td style={{padding:"7px 10px",color:"#cbd5e1",textAlign:"center"}}>{a.qa_pts}</td>
                    <td style={{padding:"7px 10px",fontWeight:700,color:"#60a5fa",textAlign:"center"}}>{a.total_pts}</td>
                  </tr>
                ))}</tbody>
              </table>
              {agents.length>20&&<p style={{color:"#475569",fontSize:12,padding:"8px 12px",margin:0}}>...y {agents.length-20} más</p>}
            </div>
            {coachExits.length>0&&(
              <div style={{overflowX:"auto",borderRadius:8,border:"1px solid #1e3a5f"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr>{["Coach","Bajas","Impacto pts"].map(h=><th key={h} style={{background:"#0c2240",color:"#93c5fd",fontWeight:600,padding:"8px 10px",textAlign:"left"}}>{h}</th>)}</tr></thead>
                  <tbody>{coachExits.map((c,i)=>{
                    const ex=Number(c.voluntary_exits);
                    const imp=ex===0?"+10":ex===1?"+2":ex===2?"0":"-5";
                    const col=ex===0?"#16a34a":ex===1?"#d97706":ex===2?"#6b7280":"#dc2626";
                    return(<tr key={i} style={{background:i%2===0?"#0f172a":"#0c1a2e"}}>
                      <td style={{padding:"7px 10px",color:"#cbd5e1"}}>{c.coach}</td>
                      <td style={{padding:"7px 10px",color:"#cbd5e1",textAlign:"center"}}>{ex}</td>
                      <td style={{padding:"7px 10px",fontWeight:700,color:col,textAlign:"center"}}>{imp} pts</td>
                    </tr>);
                  })}</tbody>
                </table>
              </div>
            )}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={reset} style={{background:"transparent",color:"#94a3b8",border:"1px solid #334155",padding:"11px 24px",borderRadius:8,cursor:"pointer",fontWeight:600}}>Cancelar</button>
              <button onClick={handleUpload} style={{background:"#1d4ed8",color:"#fff",border:"none",padding:"11px 24px",borderRadius:8,cursor:"pointer",fontWeight:700}}>✅ Confirmar y subir {weekLabel}</button>
            </div>
          </div>
        )}

        {stage==="uploading"&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"60px 0",gap:16}}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{width:48,height:48,border:"4px solid #1e3a5f",borderTop:"4px solid #3b82f6",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
            <p style={{color:"#f1f5f9",fontSize:18,fontWeight:600,margin:0}}>Subiendo métricas de {weekLabel}...</p>
            <p style={{color:"#64748b",fontSize:14,margin:0}}>Procesando {agents.length} agentes</p>
          </div>
        )}

        {stage==="done"&&summary&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:"#052e16",border:"1px solid #14532d",borderRadius:12,padding:24,textAlign:"center"}}>
              <p style={{fontSize:40,margin:"0 0 8px"}}>🎉</p>
              <p style={{color:"#4ade80",fontSize:20,fontWeight:700,margin:"0 0 4px"}}>¡Carga completada!</p>
              <p style={{color:"#86efac",fontSize:14,margin:0}}>Semana <b>{summary.week}</b> · {summary.agents_updated} agentes actualizados</p>
            </div>
            {summary.errors.length>0&&(
              <div style={{background:"#2d2000",border:"1px solid #78350f",borderRadius:10,padding:16}}>
                <p style={{color:"#fbbf24",fontWeight:700,margin:"0 0 8px"}}>⚠️ {summary.errors.length} errores</p>
                {summary.errors.map((e,i)=><p key={i} style={{color:"#fca5a5",fontSize:13,margin:"3px 0"}}>• {e}</p>)}
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
