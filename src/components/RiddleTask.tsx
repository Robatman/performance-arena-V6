import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://dxwjjptjyhiitejupvaq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8'
)

interface Props {
  gameId: string
  isAdmin: boolean
}

export default function RiddleTask({ gameId, isAdmin }: Props) {
  const [tab, setTab] = useState<'riddle' | 'task'>('riddle')

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('riddle')}
          className={`px-4 py-2 rounded font-bold ${tab === 'riddle' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          🧩 Riddle
        </button>
        <button
          onClick={() => setTab('task')}
          className={`px-4 py-2 rounded font-bold ${tab === 'task' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          📋 Task
        </button>
      </div>

      {tab === 'riddle' && (
        <RiddleSection gameId={gameId} isAdmin={isAdmin} />
      )}
      {tab === 'task' && (
        <TaskSection gameId={gameId} isAdmin={isAdmin} />
      )}
    </div>
  )
}

// ─── RIDDLE ───────────────────────────────────────────────
function RiddleSection({ gameId, isAdmin }: { gameId: string; isAdmin: boolean }) {
  const [riddle, setRiddle] = useState<any>(null)
  const [answer, setAnswer] = useState<any>(null)
  const [selected, setSelected] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)

  // Admin form
  const [newQuestion, setNewQuestion] = useState('')
  const [newOptions, setNewOptions] = useState({ a: '', b: '', c: '', d: '' })
  const [newCorrect, setNewCorrect] = useState('A')
  const [newWeek, setNewWeek] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchRiddle()
  }, [])

  async function fetchRiddle() {
    setLoading(true)
    const { data } = await supabase
      .from('riddles')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    setRiddle(data)

    if (data) {
      const { data: ans } = await supabase
        .from('agent_riddle_answers')
        .select('*')
        .eq('game_id', gameId)
        .eq('riddle_id', data.id)
        .single()
      setAnswer(ans)
      if (ans) setSubmitted(true)
    }
    setLoading(false)
  }

  async function submitAnswer() {
    if (!selected || !riddle) return
    const correct = selected === riddle.correct_answer
    const points = correct ? riddle.points : 0

    await supabase.from('agent_riddle_answers').insert({
      game_id: gameId,
      riddle_id: riddle.id,
      answer: selected,
      correct,
      points_awarded: points
    })

    if (correct) {
      await supabase.rpc('increment_points', { p_game_id: gameId, p_points: points })
    }

    setSubmitted(true)
    setAnswer({ correct, points_awarded: points })
  }

  async function createRiddle() {
    if (!newQuestion || !newWeek) return
    setSaving(true)
    // Desactivar riddle anterior
    await supabase.from('riddles').update({ active: false }).eq('active', true)
    // Crear nuevo
    await supabase.from('riddles').insert({
      week: newWeek,
      question: newQuestion,
      option_a: newOptions.a,
      option_b: newOptions.b,
      option_c: newOptions.c,
      option_d: newOptions.d,
      correct_answer: newCorrect,
      points: 10,
      active: true
    })
    setSaving(false)
    setNewQuestion('')
    setNewOptions({ a: '', b: '', c: '', d: '' })
    setNewWeek('')
    fetchRiddle()
    alert('✅ Riddle creado!')
  }

  if (loading) return <div className="text-center py-8">Cargando riddle...</div>

  return (
    <div>
      {/* Admin: Crear Riddle */}
      {isAdmin && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-yellow-800 mb-3">⚙️ Crear Riddle de la Semana</h3>
          <input className="w-full border rounded p-2 mb-2" placeholder="Semana (ej. April_21-April_25)" value={newWeek} onChange={e => setNewWeek(e.target.value)} />
          <textarea className="w-full border rounded p-2 mb-2" placeholder="Pregunta" value={newQuestion} onChange={e => setNewQuestion(e.target.value)} />
          {(['a','b','c','d'] as const).map(opt => (
            <input key={opt} className="w-full border rounded p-2 mb-2" placeholder={`Opción ${opt.toUpperCase()}`} value={newOptions[opt]} onChange={e => setNewOptions(prev => ({ ...prev, [opt]: e.target.value }))} />
          ))}
          <select className="w-full border rounded p-2 mb-3" value={newCorrect} onChange={e => setNewCorrect(e.target.value)}>
            <option value="A">Correcta: A</option>
            <option value="B">Correcta: B</option>
            <option value="C">Correcta: C</option>
            <option value="D">Correcta: D</option>
          </select>
          <button onClick={createRiddle} disabled={saving} className="bg-yellow-500 text-white px-4 py-2 rounded font-bold w-full">
            {saving ? 'Guardando...' : '✅ Publicar Riddle'}
          </button>
        </div>
      )}

      {/* Agente: Ver y responder Riddle */}
      {riddle ? (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="text-xs text-purple-400 mb-1">Semana {riddle.week}</div>
          <h3 className="font-bold text-purple-800 text-lg mb-4">🧩 {riddle.question}</h3>

          {submitted ? (
            <div className={`text-center p-4 rounded-lg ${answer?.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {answer?.correct ? `✅ ¡Correcto! +${answer.points_awarded} pts` : `❌ Incorrecto. La respuesta era ${riddle.correct_answer}`}
            </div>
          ) : (
            <div>
              {(['a','b','c','d'] as const).map(opt => (
                riddle[`option_${opt}`] && (
                  <button
                    key={opt}
                    onClick={() => setSelected(opt.toUpperCase())}
                    className={`w-full text-left p-3 mb-2 rounded-lg border-2 transition ${selected === opt.toUpperCase() ? 'border-purple-600 bg-purple-100' : 'border-gray-200 hover:border-purple-300'}`}
                  >
                    <span className="font-bold mr-2">{opt.toUpperCase()}.</span>{riddle[`option_${opt}`]}
                  </button>
                )
              ))}
              <button onClick={submitAnswer} disabled={!selected} className="mt-3 w-full bg-purple-600 text-white py-2 rounded-lg font-bold disabled:opacity-40">
                Enviar respuesta
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center text-gray-400 py-8">No hay riddle activo esta semana</div>
      )}
    </div>
  )
}

// ─── TASK ───────────────────────────────────────────────
function TaskSection({ gameId, isAdmin }: { gameId: string; isAdmin: boolean }) {
  const [task, setTask] = useState<any>(null)
  const [submission, setSubmission] = useState<any>(null)
  const [completionPct, setCompletionPct] = useState(100)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([])

  // Admin form
  const [newTitle, setNewTitle] = useState('')
  const [newInstructions, setNewInstructions] = useState('')
  const [newWeek, setNewWeek] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchTask()
  }, [])

  async function fetchTask() {
    setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    setTask(data)

    if (data) {
      const { data: sub } = await supabase
        .from('agent_task_submissions')
        .select('*')
        .eq('game_id', gameId)
        .eq('task_id', data.id)
        .single()
      setSubmission(sub)
      if (sub) setSubmitted(true)

      // Admin: ver pendientes
      if (isAdmin) {
        const { data: pending } = await supabase
          .from('agent_task_submissions')
          .select('*')
          .eq('task_id', data.id)
          .eq('approved', false)
        setPendingSubmissions(pending || [])
      }
    }
    setLoading(false)
  }

  async function submitTask() {
    if (!task) return
    await supabase.from('agent_task_submissions').insert({
      game_id: gameId,
      task_id: task.id,
      completion_pct: completionPct,
      approved: false,
      points_awarded: 0
    })
    setSubmitted(true)
    setSubmission({ completion_pct: completionPct, approved: false })
  }

  async function approveSubmission(sub: any) {
    const points = sub.completion_pct === 100 ? 10 : sub.completion_pct === 75 ? 5 : 1
    await supabase.from('agent_task_submissions').update({ approved: true, points_awarded: points }).eq('id', sub.id)
    await supabase.rpc('increment_points', { p_game_id: sub.game_id, p_points: points })
    setPendingSubmissions(prev => prev.filter(s => s.id !== sub.id))
  }

  async function createTask() {
    if (!newTitle || !newWeek) return
    setSaving(true)
    await supabase.from('tasks').update({ active: false }).eq('active', true)
    await supabase.from('tasks').insert({
      week: newWeek,
      title: newTitle,
      instructions: newInstructions,
      points: 10,
      active: true
    })
    setSaving(false)
    setNewTitle('')
    setNewInstructions('')
    setNewWeek('')
    fetchTask()
    alert('✅ Task creada!')
  }

  if (loading) return <div className="text-center py-8">Cargando task...</div>

  return (
    <div>
      {/* Admin: Crear Task */}
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-blue-800 mb-3">⚙️ Crear Task de la Semana</h3>
          <input className="w-full border rounded p-2 mb-2" placeholder="Semana (ej. April_21-April_25)" value={newWeek} onChange={e => setNewWeek(e.target.value)} />
          <input className="w-full border rounded p-2 mb-2" placeholder="Título de la task" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
          <textarea className="w-full border rounded p-2 mb-3" placeholder="Instrucciones para el agente" value={newInstructions} onChange={e => setNewInstructions(e.target.value)} rows={3} />
          <button onClick={createTask} disabled={saving} className="bg-blue-500 text-white px-4 py-2 rounded font-bold w-full">
            {saving ? 'Guardando...' : '✅ Publicar Task'}
          </button>
        </div>
      )}

      {/* Admin: Aprobar submissions */}
      {isAdmin && pendingSubmissions.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-orange-800 mb-3">⏳ Pendientes de aprobación ({pendingSubmissions.length})</h3>
          {pendingSubmissions.map(sub => (
            <div key={sub.id} className="flex items-center justify-between bg-white rounded p-3 mb-2 border">
              <div>
                <span className="font-bold">{sub.game_id}</span>
                <span className="ml-2 text-gray-500">{sub.completion_pct}% completado</span>
              </div>
              <button onClick={() => approveSubmission(sub)} className="bg-green-500 text-white px-3 py-1 rounded font-bold text-sm">
                ✅ Aprobar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Agente: Ver y entregar Task */}
      {task ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-xs text-blue-400 mb-1">Semana {task.week}</div>
          <h3 className="font-bold text-blue-800 text-lg mb-2">📋 {task.title}</h3>
          {task.instructions && <p className="text-gray-600 mb-4">{task.instructions}</p>}

          {submitted ? (
            <div className={`text-center p-4 rounded-lg ${submission?.approved ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {submission?.approved
                ? `✅ Aprobado! +${submission.points_awarded} pts`
                : `⏳ Entregado al ${submission?.completion_pct}% — Pendiente de aprobación`}
            </div>
          ) : (
            <div>
              <p className="font-semibold mb-2">¿Qué porcentaje completaste?</p>
              {[100, 75, 50].map(pct => (
                <button
                  key={pct}
                  onClick={() => setCompletionPct(pct)}
                  className={`w-full text-left p-3 mb-2 rounded-lg border-2 transition ${completionPct === pct ? 'border-blue-600 bg-blue-100' : 'border-gray-200 hover:border-blue-300'}`}
                >
                  {pct === 100 ? '🏆 100% — Completo' : pct === 75 ? '✅ 75% — Casi todo' : '⚡ 50% — La mitad'}
                  <span className="float-right text-blue-600 font-bold">{pct === 100 ? '+10pts' : pct === 75 ? '+5pts' : '+1pt'}</span>
                </button>
              ))}
              <button onClick={submitTask} className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg font-bold">
                Entregar Task
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center text-gray-400 py-8">No hay task activa esta semana</div>
      )}
    </div>
  )
}
