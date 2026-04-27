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
