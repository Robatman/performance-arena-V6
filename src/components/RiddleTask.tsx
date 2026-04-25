// @ts-nocheck
import { useState, useEffect } from 'react'

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";

async function sbFetch(path, options: any = {}) {
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
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const C = {
  blue:"#1a1aff", blueDk:"#0d0db3", red:"#e8282a", white:"#fff",
  bg:"#f0f2ff", bgDk:"#e6e9ff", card:"#fff", text:"#0a0a40",
  muted:"#6b7280", border:"#d1d5f0", green:"#16a34a", greenBg:"#dcfce7",
  yellow:"#d97706", yellowBg:"#fef9c3", red2:"#fee2e2", purple:"#7c3aed",
};

const inp = {
  width:"100%", border:`1.5px solid ${C.border}`, borderRadius:9,
  padding:"10px 13px", fontSize:14, outline:"none", fontFamily:"inherit",
  boxSizing:"border-box" as const, background:C.bg, color:C.text,
};

interface Props {
  gameId: string
  isAdmin: boolean
  defaultTab?: 'riddle' | 'task'
}

export default function RiddleTask({ gameId, isAdmin, defaultTab = 'riddle' }: Props) {
  const [tab, setTab] = useState<'riddle' | 'task'>(defaultTab)

  return (
    <div style={{paddingBottom:100}}>
      {defaultTab === 'riddle' && <RiddleSection gameId={gameId} isAdmin={isAdmin} />}
      {defaultTab === 'task' && <TaskSection gameId={gameId} isAdmin={isAdmin} />}
    </div>
  )
  )
}

// ─── RIDDLE ───────────────────────────────────────────────
function RiddleSection({ gameId, isAdmin }: { gameId: string; isAdmin: boolean }) {
  const [riddles, setRiddles] = useState<any[]>([])
  const [activeRiddle, setActiveRiddle] = useState<any>(null)
  const [myAnswer, setMyAnswer] = useState<any>(null)
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingAnswers, setPendingAnswers] = useState<any[]>([])
  const [adminTab, setAdminTab] = useState<'create'|'manage'|'pending'>('pending')

  // Create form
  const [form, setForm] = useState({ week:'', question:'', a:'', b:'', c:'', d:'', correct:'A' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchAll() }, [])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function fetchAll() {
    setLoading(true)
    try {
      const all = await sbFetch("riddles?select=*&order=created_at.desc")
      setRiddles(all || [])
      const active = (all || []).find((r: any) => r.active)
      setActiveRiddle(active || null)

      if (active) {
        const ans = await sbFetch(`agent_riddle_answers?riddle_id=eq.${active.id}&game_id=eq.${gameId}&select=*`)
        setMyAnswer((ans || [])[0] || null)

        if (isAdmin) {
          const pending = await sbFetch(`agent_riddle_answers?riddle_id=eq.${active.id}&approved=eq.false&select=*&order=answered_at.asc`)
          setPendingAnswers(pending || [])
        }
      }
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function createRiddle() {
    if (!form.week || !form.question || !form.a || !form.b || !form.correct) {
      showToast('Completa semana, pregunta y al menos opciones A y B'); return
    }
    setSaving(true)
    try {
      await sbFetch("riddles", { method:"POST", body: JSON.stringify({
        week: form.week, question: form.question,
        option_a: form.a, option_b: form.b, option_c: form.c, option_d: form.d,
        correct_answer: form.correct, points: 10, active: false
      })})
      setForm({ week:'', question:'', a:'', b:'', c:'', d:'', correct:'A' })
      showToast('✅ Riddle creado! Actívalo desde Gestionar.')
      fetchAll()
    } catch(e) { showToast('Error al crear') }
    setSaving(false)
  }

  async function toggleActive(riddle: any) {
    try {
      if (!riddle.active) {
        // Desactivar todos primero
        await sbFetch("riddles?active=eq.true", { method:"PATCH", body: JSON.stringify({ active: false }) })
        await sbFetch(`riddles?id=eq.${riddle.id}`, { method:"PATCH", body: JSON.stringify({ active: true }) })
        showToast('✅ Riddle activado')
      } else {
        await sbFetch(`riddles?id=eq.${riddle.id}`, { method:"PATCH", body: JSON.stringify({ active: false }) })
        showToast('⏸️ Riddle pausado')
      }
      fetchAll()
    } catch(e) { showToast('Error') }
  }

  async function submitAnswer() {
    if (!selected || !activeRiddle) return
    try {
      await sbFetch("agent_riddle_answers", { method:"POST", body: JSON.stringify({
        game_id: gameId, riddle_id: activeRiddle.id,
        answer: selected, correct: false, approved: false, points_awarded: 0
      })})
      setMyAnswer({ answer: selected, approved: false, correct: false })
      showToast('✅ Respuesta enviada — pendiente de revisión')
    } catch(e) { showToast('Error al enviar') }
  }

  async function approveAnswer(ans: any, approve: boolean) {
    try {
      if (approve) {
        const points = activeRiddle?.points || 10
        await sbFetch(`agent_riddle_answers?id=eq.${ans.id}`, {
          method:"PATCH", body: JSON.stringify({ approved: true, correct: true, points_awarded: points })
        })
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_points`, {
          method:"POST",
          headers: { apikey: SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, "Content-Type":"application/json" },
          body: JSON.stringify({ p_game_id: ans.game_id, p_points: points })
        })
        showToast(`✅ Aprobado! +${points}pts a ${ans.game_id}`)
      } else {
        // Delete so agent can retry
        await sbFetch(`agent_riddle_answers?id=eq.${ans.id}`, { method:"DELETE" })
        showToast(`🔄 Rechazado — el agente puede volver a intentar`)
      }
      fetchAll()
    } catch(e) { showToast('Error') }
  }

  if (loading) return <div style={{textAlign:"center", padding:40, color:C.muted}}>Cargando...</div>

  return (
    <div>
      {toast && <div style={{position:"fixed",top:56,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:toast.includes('Error')?C.red:C.green,color:"#fff",padding:"10px 22px",borderRadius:12,fontWeight:700,fontSize:13,boxShadow:"0 4px 20px rgba(0,0,0,0.25)",whiteSpace:"nowrap"}}>{toast}</div>}

      {/* ── ADMIN VIEW ── */}
      {isAdmin && (
        <div>
          {/* Admin tabs */}
          <div style={{display:"flex", gap:6, marginBottom:14}}>
            {[
              {id:'pending', label:`⏳ Pendientes (${pendingAnswers.length})`},
              {id:'manage', label:'📋 Gestionar'},
              {id:'create', label:'➕ Crear'},
            ].map(t => (
              <button key={t.id} onClick={() => setAdminTab(t.id as any)} style={{flex:1, padding:"8px 4px", borderRadius:9, border:`1.5px solid ${adminTab===t.id?C.purple:C.border}`, background:adminTab===t.id?`${C.purple}12`:C.card, color:adminTab===t.id?C.purple:C.muted, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit"}}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Pending approvals */}
          {adminTab === 'pending' && (
  <div>
    {activeRiddle && (
      <div style={{background:`${C.purple}12`, border:`1.5px solid ${C.purple}33`, borderRadius:12, padding:14, marginBottom:14}}>
        <div style={{color:C.muted, fontSize:11, marginBottom:4}}>{activeRiddle.week}</div>
        <div style={{color:C.purple, fontWeight:800, fontSize:14, marginBottom:8}}>🧩 {activeRiddle.question}</div>
        <div style={{display:"flex", flexDirection:"column", gap:4}}>
          {(['a','b','c','d'] as const).map(opt => activeRiddle[`option_${opt}`] && (
            <div key={opt} style={{color:opt===activeRiddle.correct_answer?.toLowerCase()?C.green:C.text, fontSize:13}}>
              <strong>{opt.toUpperCase()}.</strong> {activeRiddle[`option_${opt}`]}{opt===activeRiddle.correct_answer?.toLowerCase()?' ✅':''}
            </div>
          ))}
        </div>
      </div>
    )}
    {pendingAnswers.length === 0 ? (
                <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:32, textAlign:"center"}}>
                  <div style={{fontSize:40, marginBottom:8}}>✅</div>
                  <div style={{color:C.muted}}>No hay respuestas pendientes</div>
                </div>
              ) : (
                pendingAnswers.map(ans => (
                  <div key={ans.id} style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16, marginBottom:10}}>
                    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
                      <div>
                        <div style={{color:C.text, fontWeight:800, fontSize:15}}>🎮 {ans.game_id}</div>
                        <div style={{color:C.muted, fontSize:12, marginTop:2}}>Respondió: <strong style={{color:C.purple}}>Opción {ans.answer}</strong></div>
                        <div style={{color:C.muted, fontSize:11, marginTop:2}}>{new Date(ans.answered_at).toLocaleString()}</div>
                      </div>
                    </div>
                    <div style={{display:"flex", gap:8}}>
                      <button onClick={() => approveAnswer(ans, true)} style={{flex:1, padding:"9px 0", borderRadius:9, border:"none", background:C.green, color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"inherit"}}>✅ Correcto (+{activeRiddle?.points||10}pts)</button>
                      <button onClick={() => approveAnswer(ans, false)} style={{flex:1, padding:"9px 0", borderRadius:9, border:"none", background:C.red, color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"inherit"}}>❌ Incorrecto (0pts)</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Manage riddles */}
          {adminTab === 'manage' && (
            <div>
              {riddles.length === 0 ? (
                <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:32, textAlign:"center", color:C.muted}}>No hay riddles creados aún</div>
              ) : riddles.map(r => (
                <div key={r.id} style={{background:C.card, border:`1.5px solid ${r.active?C.green:C.border}`, borderRadius:14, padding:14, marginBottom:10}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
                        <span style={{padding:"2px 8px", borderRadius:6, background:r.active?`${C.green}18`:`${C.muted}18`, color:r.active?C.green:C.muted, fontSize:11, fontWeight:700}}>{r.active?'🟢 ACTIVO':'⏸️ PAUSADO'}</span>
                        <span style={{color:C.muted, fontSize:11}}>{r.week}</span>
                      </div>
                      <div style={{color:C.text, fontWeight:700, fontSize:14}}>{r.question}</div>
                      <div style={{color:C.muted, fontSize:12, marginTop:4}}>
                        A: {r.option_a} · B: {r.option_b}{r.option_c?` · C: ${r.option_c}`:''}{r.option_d?` · D: ${r.option_d}`:''}
                      </div>
                      <div style={{color:C.purple, fontSize:12, fontWeight:700, marginTop:2}}>Correcta: {r.correct_answer}</div>
                    </div>
                    <button onClick={() => toggleActive(r)} style={{flexShrink:0, marginLeft:10, padding:"7px 14px", borderRadius:9, border:`1.5px solid ${r.active?C.yellow:C.green}`, background:r.active?C.yellowBg:C.greenBg, color:r.active?C.yellow:C.green, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit"}}>
                      {r.active ? '⏸️ Pausar' : '▶️ Activar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create riddle */}
          {adminTab === 'create' && (
            <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16}}>
              <div style={{color:C.purple, fontSize:11, letterSpacing:2, fontWeight:700, marginBottom:14}}>NUEVO RIDDLE</div>
              <div style={{marginBottom:10}}>
                <div style={{color:C.muted, fontSize:11, marginBottom:4}}>SEMANA</div>
                <input value={form.week} onChange={e=>setForm(p=>({...p,week:e.target.value}))} style={inp} placeholder="ej. Semana_15"/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{color:C.muted, fontSize:11, marginBottom:4}}>PREGUNTA</div>
                <textarea value={form.question} onChange={e=>setForm(p=>({...p,question:e.target.value}))} rows={3} style={{...inp, resize:"vertical"}} placeholder="Escribe la pregunta..."/>
              </div>
              {[{k:'a',label:'OPCIÓN A'},{k:'b',label:'OPCIÓN B'},{k:'c',label:'OPCIÓN C (opcional)'},{k:'d',label:'OPCIÓN D (opcional)'}].map(opt => (
                <div key={opt.k} style={{marginBottom:10}}>
                  <div style={{color:C.muted, fontSize:11, marginBottom:4}}>{opt.label}</div>
                  <input value={form[opt.k]} onChange={e=>setForm(p=>({...p,[opt.k]:e.target.value}))} style={inp} placeholder={`Opción ${opt.k.toUpperCase()}`}/>
                </div>
              ))}
              <div style={{marginBottom:14}}>
                <div style={{color:C.muted, fontSize:11, marginBottom:4}}>RESPUESTA CORRECTA</div>
                <select value={form.correct} onChange={e=>setForm(p=>({...p,correct:e.target.value}))} style={inp}>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
              </div>
              <button onClick={createRiddle} disabled={saving} style={{width:"100%", padding:12, borderRadius:10, border:"none", background:saving?"#c5cae9":C.purple, color:"#fff", fontWeight:800, fontSize:14, cursor:saving?"not-allowed":"pointer", fontFamily:"inherit"}}>
                {saving ? 'Guardando...' : '✅ Crear Riddle'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── AGENT VIEW ── */}
      {!isAdmin && (
        <div>
          {activeRiddle ? (
            <div>
              <div style={{background:C.card, border:`1.5px solid ${C.purple}44`, borderRadius:14, padding:14, marginBottom:12}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4}}>
                  <span style={{color:C.muted, fontSize:12}}>{activeRiddle.week}</span>
                  <span style={{color:C.purple, fontWeight:800, fontSize:14}}>+{activeRiddle.points} pts</span>
                </div>
                <div style={{color:C.purple, fontWeight:800, fontSize:16, lineHeight:1.5}}>{activeRiddle.question}</div>
              </div>

              {myAnswer ? (
                <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:24, textAlign:"center"}}>
                  {myAnswer.approved ? (
                    myAnswer.correct ? (
                      <div>
                        <div style={{fontSize:48, marginBottom:8}}>✅</div>
                        <div style={{color:C.green, fontWeight:800, fontSize:18}}>¡Correcto! +{myAnswer.points_awarded} pts</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{fontSize:48, marginBottom:8}}>❌</div>
                        <div style={{color:C.red, fontWeight:800, fontSize:18}}>Respuesta incorrecta</div>
                        <div style={{color:C.muted, fontSize:13, marginTop:8}}>Sigue participando la próxima semana 💪</div>
                      </div>
                    )
                  ) : (
                    <div>
                      <div style={{fontSize:48, marginBottom:8}}>📬</div>
                      <div style={{color:C.yellow, fontWeight:800, fontSize:18}}>Respuesta enviada</div>
                      <div style={{color:C.muted, fontSize:13, marginTop:8}}>Pendiente de revisión por el admin</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16}}>
                  <div style={{color:C.muted, fontSize:12, marginBottom:12}}>Selecciona tu respuesta:</div>
                  {(['a','b','c','d'] as const).map(opt => (
                    activeRiddle[`option_${opt}`] && (
                      <div key={opt} onClick={() => setSelected(opt.toUpperCase())} style={{padding:"12px 14px", borderRadius:11, border:`2px solid ${selected===opt.toUpperCase()?C.purple:C.border}`, background:selected===opt.toUpperCase()?`${C.purple}0e`:C.bg, cursor:"pointer", display:"flex", alignItems:"center", gap:10, marginBottom:8}}>
                        <div style={{width:28, height:28, borderRadius:"50%", background:selected===opt.toUpperCase()?C.purple:"#e8eaf6", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:13, color:selected===opt.toUpperCase()?"#fff":C.muted, flexShrink:0}}>
                          {opt.toUpperCase()}
                        </div>
                        <span style={{color:C.text, fontSize:14}}>{activeRiddle[`option_${opt}`]}</span>
                      </div>
                    )
                  ))}
                  <button onClick={submitAnswer} disabled={!selected} style={{width:"100%", padding:12, borderRadius:10, border:"none", background:selected?C.purple:"#c5cae9", color:"#fff", fontWeight:800, fontSize:14, cursor:selected?"pointer":"not-allowed", fontFamily:"inherit", marginTop:8}}>
                    Enviar respuesta
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:40, textAlign:"center"}}>
              <div style={{fontSize:48, marginBottom:8}}>🧩</div>
              <div style={{color:C.muted, fontSize:15}}>No hay riddle activo esta semana</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TASK ───────────────────────────────────────────────
function TaskSection({ gameId, isAdmin }: { gameId: string; isAdmin: boolean }) {
  const [tasks, setTasks] = useState<any[]>([])
  const [activeTask, setActiveTask] = useState<any>(null)
  const [mySubmission, setMySubmission] = useState<any>(null)
  const [completionPct, setCompletionPct] = useState(100)
  const [loading, setLoading] = useState(true)
  const [pendingSubs, setPendingSubs] = useState<any[]>([])
  const [adminTab, setAdminTab] = useState<'pending'|'manage'|'create'>('pending')

  const [form, setForm] = useState({ week:'', title:'', instructions:'' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchAll() }, [])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function fetchAll() {
    setLoading(true)
    try {
      const all = await sbFetch("tasks?select=*&order=created_at.desc")
      setTasks(all || [])
      const active = (all || []).find((t: any) => t.active)
      setActiveTask(active || null)

      if (active) {
        const sub = await sbFetch(`agent_task_submissions?task_id=eq.${active.id}&game_id=eq.${gameId}&select=*`)
        setMySubmission((sub || [])[0] || null)

        if (isAdmin) {
          const pending = await sbFetch(`agent_task_submissions?task_id=eq.${active.id}&approved=eq.false&select=*&order=submitted_at.asc`)
          setPendingSubs(pending || [])
        }
      }
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function createTask() {
    if (!form.week || !form.title) { showToast('Completa semana y título'); return }
    setSaving(true)
    try {
      await sbFetch("tasks", { method:"POST", body: JSON.stringify({
        week: form.week, title: form.title, instructions: form.instructions, points: 10, active: false
      })})
      setForm({ week:'', title:'', instructions:'' })
      showToast('✅ Task creada! Actívala desde Gestionar.')
      fetchAll()
    } catch(e) { showToast('Error al crear') }
    setSaving(false)
  }

  async function toggleActive(task: any) {
    try {
      if (!task.active) {
        await sbFetch("tasks?active=eq.true", { method:"PATCH", body: JSON.stringify({ active: false }) })
        await sbFetch(`tasks?id=eq.${task.id}`, { method:"PATCH", body: JSON.stringify({ active: true }) })
        showToast('✅ Task activada')
      } else {
        await sbFetch(`tasks?id=eq.${task.id}`, { method:"PATCH", body: JSON.stringify({ active: false }) })
        showToast('⏸️ Task pausada')
      }
      fetchAll()
    } catch(e) { showToast('Error') }
  }

  async function submitTask() {
    if (!activeTask) return
    try {
      await sbFetch("agent_task_submissions", { method:"POST", body: JSON.stringify({
        game_id: gameId, task_id: activeTask.id,
        completion_pct: completionPct, approved: false, points_awarded: 0
      })})
      setMySubmission({ completion_pct: completionPct, approved: false })
      showToast('✅ Task entregada — pendiente de aprobación')
    } catch(e) { showToast('Error al entregar') }
  }

  async function approveSubmission(sub: any, approve: boolean) {
    try {
      if (approve) {
        const points = sub.completion_pct === 100 ? 10 : sub.completion_pct === 75 ? 5 : 1
        await sbFetch(`agent_task_submissions?id=eq.${sub.id}`, {
          method:"PATCH", body: JSON.stringify({ approved: true, points_awarded: points })
        })
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_points`, {
          method:"POST",
          headers: { apikey: SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, "Content-Type":"application/json" },
          body: JSON.stringify({ p_game_id: sub.game_id, p_points: points })
        })
        showToast(`✅ Aprobado! +${points}pts a ${sub.game_id}`)
      } else {
        // Delete so agent can retry
        await sbFetch(`agent_task_submissions?id=eq.${sub.id}`, { method:"DELETE" })
        showToast(`🔄 Rechazado — el agente puede volver a entregar`)
      }
      fetchAll()
    } catch(e) { showToast('Error') }
  }

  if (loading) return <div style={{textAlign:"center", padding:40, color:C.muted}}>Cargando...</div>

  return (
    <div>
      {toast && <div style={{position:"fixed",top:56,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:toast.includes('Error')?C.red:C.green,color:"#fff",padding:"10px 22px",borderRadius:12,fontWeight:700,fontSize:13,boxShadow:"0 4px 20px rgba(0,0,0,0.25)",whiteSpace:"nowrap"}}>{toast}</div>}

      {/* ── ADMIN VIEW ── */}
      {isAdmin && (
        <div>
          <div style={{display:"flex", gap:6, marginBottom:14}}>
            {[
              {id:'pending', label:`⏳ Pendientes (${pendingSubs.length})`},
              {id:'manage', label:'📋 Gestionar'},
              {id:'create', label:'➕ Crear'},
            ].map(t => (
              <button key={t.id} onClick={() => setAdminTab(t.id as any)} style={{flex:1, padding:"8px 4px", borderRadius:9, border:`1.5px solid ${adminTab===t.id?C.blue:C.border}`, background:adminTab===t.id?`${C.blue}12`:C.card, color:adminTab===t.id?C.blue:C.muted, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit"}}>
                {t.label}
              </button>
            ))}
          </div>

          {adminTab === 'pending' && (
            <div>
              {pendingSubs.length === 0 ? (
                <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:32, textAlign:"center"}}>
                  <div style={{fontSize:40, marginBottom:8}}>✅</div>
                  <div style={{color:C.muted}}>No hay entregas pendientes</div>
                </div>
              ) : pendingSubs.map(sub => (
                <div key={sub.id} style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16, marginBottom:10}}>
                  <div style={{marginBottom:10}}>
                    <div style={{color:C.text, fontWeight:800, fontSize:15}}>🎮 {sub.game_id}</div>
                    <div style={{color:C.muted, fontSize:12, marginTop:2}}>Completó al <strong style={{color:C.blue}}>{sub.completion_pct}%</strong></div>
                    <div style={{color:C.muted, fontSize:11, marginTop:2}}>{new Date(sub.submitted_at).toLocaleString()}</div>
                    <div style={{color:C.blue, fontSize:12, marginTop:2}}>
                      Puntos: {sub.completion_pct===100?'10pts':sub.completion_pct===75?'5pts':'1pt'}
                    </div>
                  </div>
                  <div style={{display:"flex", gap:8}}>
                    <button onClick={() => approveSubmission(sub, true)} style={{flex:1, padding:"9px 0", borderRadius:9, border:"none", background:C.green, color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"inherit"}}>✅ Aprobar</button>
                    <button onClick={() => approveSubmission(sub, false)} style={{flex:1, padding:"9px 0", borderRadius:9, border:"none", background:C.red, color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"inherit"}}>❌ Rechazar</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {adminTab === 'manage' && (
            <div>
              {tasks.length === 0 ? (
                <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:32, textAlign:"center", color:C.muted}}>No hay tasks creadas aún</div>
              ) : tasks.map(t => (
                <div key={t.id} style={{background:C.card, border:`1.5px solid ${t.active?C.green:C.border}`, borderRadius:14, padding:14, marginBottom:10}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
                        <span style={{padding:"2px 8px", borderRadius:6, background:t.active?`${C.green}18`:`${C.muted}18`, color:t.active?C.green:C.muted, fontSize:11, fontWeight:700}}>{t.active?'🟢 ACTIVA':'⏸️ PAUSADA'}</span>
                        <span style={{color:C.muted, fontSize:11}}>{t.week}</span>
                      </div>
                      <div style={{color:C.text, fontWeight:700, fontSize:14}}>{t.title}</div>
                      {t.instructions && <div style={{color:C.muted, fontSize:12, marginTop:4}}>{t.instructions}</div>}
                    </div>
                    <button onClick={() => toggleActive(t)} style={{flexShrink:0, marginLeft:10, padding:"7px 14px", borderRadius:9, border:`1.5px solid ${t.active?C.yellow:C.green}`, background:t.active?C.yellowBg:C.greenBg, color:t.active?C.yellow:C.green, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit"}}>
                      {t.active ? '⏸️ Pausar' : '▶️ Activar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {adminTab === 'create' && (
            <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16}}>
              <div style={{color:C.blue, fontSize:11, letterSpacing:2, fontWeight:700, marginBottom:14}}>NUEVA TASK</div>
              <div style={{marginBottom:10}}>
                <div style={{color:C.muted, fontSize:11, marginBottom:4}}>SEMANA</div>
                <input value={form.week} onChange={e=>setForm(p=>({...p,week:e.target.value}))} style={inp} placeholder="ej. Semana_15"/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{color:C.muted, fontSize:11, marginBottom:4}}>TÍTULO</div>
                <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={inp} placeholder="Título de la task"/>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{color:C.muted, fontSize:11, marginBottom:4}}>INSTRUCCIONES</div>
                <textarea value={form.instructions} onChange={e=>setForm(p=>({...p,instructions:e.target.value}))} rows={4} style={{...inp, resize:"vertical"}} placeholder="Instrucciones para el agente..."/>
              </div>
              <button onClick={createTask} disabled={saving} style={{width:"100%", padding:12, borderRadius:10, border:"none", background:saving?"#c5cae9":C.blue, color:"#fff", fontWeight:800, fontSize:14, cursor:saving?"not-allowed":"pointer", fontFamily:"inherit"}}>
                {saving ? 'Guardando...' : '✅ Crear Task'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── AGENT VIEW ── */}
      {!isAdmin && (
        <div>
          {activeTask ? (
            <div>
              <div style={{background:C.card, border:`1.5px solid ${C.blue}44`, borderRadius:14, padding:14, marginBottom:12}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4}}>
                  <span style={{color:C.muted, fontSize:12}}>{activeTask.week}</span>
                  <span style={{color:C.blue, fontWeight:800, fontSize:14}}>+10 pts</span>
                </div>
                <div style={{color:C.blue, fontWeight:800, fontSize:16}}>{activeTask.title}</div>
                {activeTask.instructions && <div style={{color:C.text, fontSize:13, marginTop:8, lineHeight:1.6, whiteSpace:"pre-line"}}>{activeTask.instructions}</div>}
              </div>

              {mySubmission ? (
                <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:24, textAlign:"center"}}>
                  {mySubmission.approved ? (
                    <div>
                      <div style={{fontSize:48, marginBottom:8}}>✅</div>
                      <div style={{color:C.green, fontWeight:800, fontSize:18}}>¡Aprobado! +{mySubmission.points_awarded} pts</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{fontSize:48, marginBottom:8}}>📬</div>
                      <div style={{color:C.yellow, fontWeight:800, fontSize:18}}>Entregado al {mySubmission.completion_pct}%</div>
                      <div style={{color:C.muted, fontSize:13, marginTop:8}}>Pendiente de aprobación</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16}}>
                  <div style={{color:C.muted, fontSize:12, marginBottom:12}}>¿Qué porcentaje completaste?</div>
                  {[
                    {pct:100, label:'🏆 100% — Completo', pts:'+10pts'},
                    {pct:75, label:'✅ 75% — Casi todo', pts:'+5pts'},
                    {pct:50, label:'⚡ 50% — La mitad', pts:'+1pt'},
                  ].map(opt => (
                    <div key={opt.pct} onClick={() => setCompletionPct(opt.pct)} style={{padding:"12px 14px", borderRadius:11, border:`2px solid ${completionPct===opt.pct?C.blue:C.border}`, background:completionPct===opt.pct?`${C.blue}0e`:C.bg, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
                      <span style={{color:C.text, fontSize:14}}>{opt.label}</span>
                      <span style={{color:C.blue, fontWeight:800, fontSize:13}}>{opt.pts}</span>
                    </div>
                  ))}
                  <button onClick={submitTask} style={{width:"100%", padding:12, borderRadius:10, border:"none", background:C.blue, color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit", marginTop:8}}>
                    Entregar Task
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:40, textAlign:"center"}}>
              <div style={{fontSize:48, marginBottom:8}}>📋</div>
              <div style={{color:C.muted, fontSize:15}}>No hay task activa esta semana</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
