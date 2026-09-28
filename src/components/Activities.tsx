// @ts-nocheck
import { useState, useEffect } from "react";

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
  yellow:"#d97706", yellowBg:"#fef9c3", red2:"#fee2e2", purple:"#7c3aed", gold:"#f59e0b",
};

const inp = {
  width:"100%", border:`1.5px solid ${C.border}`, borderRadius:9,
  padding:"10px 13px", fontSize:14, outline:"none", fontFamily:"inherit",
  boxSizing:"border-box" as const, background:C.bg, color:C.text,
};

interface Props {
  gameId: string;
  isAdmin: boolean;
}

// ─── ACTIVIDADES ──────────────────────────────────────────────────────────
// Registro libre y periódico (mensual/semanal, p.ej. "Halloween"), separado
// de Riddles/Tasks a propósito: el agente elige a cuáles se registra, no hay
// costo en coins fijo por actividad — el admin decide cuántos otorgar al
// aprobar cada participación. Registrarse es solo la intención; la
// verificación de que sí participó pasa fuera de la app (fotos, etc.) y el
// admin la refleja aquí marcando aprobado/rechazado.
export default function Activities({ gameId, isAdmin }: Props) {
  const [activities, setActivities] = useState<any[]>([]);
  const [myRegs, setMyRegs] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState<'pending'|'manage'|'create'>('pending');
  const [form, setForm] = useState({ title:'', description:'' });
  const [awardInput, setAwardInput] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const all = await sbFetch("activities?select=*&order=created_at.desc");
      setActivities(all || []);
      const mine = await sbFetch(`activity_registrations?game_id=eq.${encodeURIComponent(gameId)}&select=*`);
      setMyRegs(mine || []);
      if (isAdmin) {
        // Pending across every activity, active or not — mirrors the fix we
        // already made for riddles/tasks so approvals never go invisible.
        const p = await sbFetch("activity_registrations?status=eq.pending&select=*&order=registered_at.asc");
        setPending(p || []);
      }
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  async function createActivity() {
    if (!form.title.trim()) { showToast('Escribe un título'); return; }
    setSaving(true);
    try {
      await sbFetch("activities", { method:"POST", body: JSON.stringify({
        title: form.title.trim(), description: form.description.trim() || null,
        active: true, created_by: gameId,
      })});
      setForm({ title:'', description:'' });
      showToast('✅ Actividad publicada');
      fetchAll();
    } catch(e) { showToast('Error al crear'); }
    setSaving(false);
  }

  async function toggleActive(activity: any) {
    try {
      await sbFetch(`activities?id=eq.${activity.id}`, { method:"PATCH", body: JSON.stringify({ active: !activity.active }) });
      fetchAll();
    } catch(e) { showToast('Error'); }
  }

  async function register(activity: any) {
    try {
      const existing = await sbFetch(`activity_registrations?activity_id=eq.${activity.id}&game_id=eq.${encodeURIComponent(gameId)}&select=id`);
      if (existing && existing.length > 0) { fetchAll(); showToast('Ya estás registrado en esta actividad'); return; }
      await sbFetch("activity_registrations", { method:"POST", body: JSON.stringify({
        activity_id: activity.id, game_id: gameId, status: "pending", registered_at: new Date().toISOString(),
      })});
      showToast('✅ Registrado — el admin confirmará tu participación');
      fetchAll();
    } catch(e) { showToast('Error al registrarte'); }
  }

  async function review(reg: any, approve: boolean) {
    const activity = activities.find(a => a.id === reg.activity_id);
    try {
      if (approve) {
        const pts = Number(awardInput[reg.id] || 0);
        if (!pts || pts <= 0) { showToast('Escribe cuántos coins otorgar'); return; }
        await sbFetch(`activity_registrations?id=eq.${reg.id}`, {
          method:"PATCH", body: JSON.stringify({ status:"approved", points_awarded:pts, reviewed_at:new Date().toISOString() }),
        });
        try {
          const prof = await sbFetch(`profiles?game_id=eq.${encodeURIComponent(reg.game_id)}&select=id`).catch(()=>[]);
          if (prof?.[0]?.id) {
            await sbFetch("notifications", { method:"POST", prefer:"return=minimal", body: JSON.stringify({
              recipient_id: prof[0].id,
              title: "🎉 Participación confirmada",
              message: `Tu registro en "${activity?.title||'una actividad'}" fue aprobado. +${pts} coins.`,
              type: "info", is_read: false,
            })});
          }
        } catch(e) {}
        showToast(`✅ Aprobado! +${pts} coins a ${reg.game_id}`);
      } else {
        await sbFetch(`activity_registrations?id=eq.${reg.id}`, {
          method:"PATCH", body: JSON.stringify({ status:"rejected", reviewed_at:new Date().toISOString() }),
        });
        try {
          const prof = await sbFetch(`profiles?game_id=eq.${encodeURIComponent(reg.game_id)}&select=id`).catch(()=>[]);
          if (prof?.[0]?.id) {
            await sbFetch("notifications", { method:"POST", prefer:"return=minimal", body: JSON.stringify({
              recipient_id: prof[0].id,
              title: "Participación no confirmada",
              message: `No se pudo confirmar tu registro en "${activity?.title||'una actividad'}".`,
              type: "info", is_read: false,
            })});
          }
        } catch(e) {}
        showToast('Rechazado');
      }
      fetchAll();
    } catch(e) { showToast('Error'); }
  }

  if (loading) return <div style={{textAlign:"center", padding:40, color:C.muted}}>Cargando...</div>;

  const activeActivities = activities.filter(a => a.active);
  const myRegByActivity = Object.fromEntries(myRegs.map(r => [r.activity_id, r]));
  const STATUS_LABEL = { pending:"⏳ Pendiente de confirmación", approved:"✅ Aprobado", rejected:"❌ No confirmado" };
  const STATUS_COLOR = { pending:C.yellow, approved:C.green, rejected:C.red };

  return (
    <div style={{paddingBottom:100}}>
      {toast && <div style={{position:"fixed",top:56,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:toast.includes('Error')?C.red:C.green,color:"#fff",padding:"10px 22px",borderRadius:12,fontWeight:700,fontSize:13,boxShadow:"0 4px 20px rgba(0,0,0,0.25)",whiteSpace:"nowrap"}}>{toast}</div>}

      {/* ── ADMIN VIEW ── */}
      {isAdmin && (
        <div>
          <div style={{display:"flex", gap:6, marginBottom:14}}>
            {[
              {id:'pending', label:`⏳ Pendientes (${pending.length})`},
              {id:'manage', label:'📋 Gestionar'},
              {id:'create', label:'➕ Crear'},
            ].map(t => (
              <button key={t.id} onClick={() => setAdminTab(t.id as any)} style={{flex:1, padding:"8px 4px", borderRadius:9, border:`1.5px solid ${adminTab===t.id?C.purple:C.border}`, background:adminTab===t.id?`${C.purple}12`:C.card, color:adminTab===t.id?C.purple:C.muted, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit"}}>
                {t.label}
              </button>
            ))}
          </div>

          {adminTab === 'pending' && (
            <div>
              {pending.length === 0 ? (
                <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:32, textAlign:"center"}}>
                  <div style={{fontSize:40, marginBottom:8}}>✅</div>
                  <div style={{color:C.muted}}>No hay registros pendientes</div>
                </div>
              ) : pending.map(reg => {
                const activity = activities.find(a => a.id === reg.activity_id);
                return (
                  <div key={reg.id} style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16, marginBottom:10}}>
                    <div style={{marginBottom:10}}>
                      <div style={{color:C.text, fontWeight:800, fontSize:15}}>🎮 {reg.game_id}</div>
                      <div style={{color:C.purple, fontSize:12, fontWeight:700, marginTop:2}}>{activity?.title || "(actividad eliminada)"}</div>
                      <div style={{color:C.muted, fontSize:11, marginTop:2}}>{new Date(reg.registered_at).toLocaleString()}</div>
                    </div>
                    <div style={{display:"flex", gap:8, alignItems:"center"}}>
                      <input type="number" placeholder="Coins" value={awardInput[reg.id]||""} onChange={e=>setAwardInput(p=>({...p,[reg.id]:e.target.value}))} style={{...inp, width:90, padding:"9px 10px"}}/>
                      <button onClick={() => review(reg, true)} style={{flex:1, padding:"9px 0", borderRadius:9, border:"none", background:C.green, color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"inherit"}}>✅ Confirmar y otorgar</button>
                      <button onClick={() => review(reg, false)} style={{padding:"9px 14px", borderRadius:9, border:"none", background:C.red, color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"inherit"}}>❌</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {adminTab === 'manage' && (
            <div>
              {activities.length === 0 ? (
                <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:32, textAlign:"center", color:C.muted}}>No hay actividades creadas aún</div>
              ) : activities.map(a => (
                <div key={a.id} style={{background:C.card, border:`1.5px solid ${a.active?C.green:C.border}`, borderRadius:14, padding:14, marginBottom:10}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
                        <span style={{padding:"2px 8px", borderRadius:6, background:a.active?`${C.green}18`:`${C.muted}18`, color:a.active?C.green:C.muted, fontSize:11, fontWeight:700}}>{a.active?'🟢 ABIERTA':'⏸️ CERRADA'}</span>
                      </div>
                      <div style={{color:C.text, fontWeight:700, fontSize:14}}>{a.title}</div>
                      {a.description && <div style={{color:C.muted, fontSize:12, marginTop:4}}>{a.description}</div>}
                    </div>
                    <button onClick={() => toggleActive(a)} style={{flexShrink:0, marginLeft:10, padding:"7px 14px", borderRadius:9, border:`1.5px solid ${a.active?C.yellow:C.green}`, background:a.active?C.yellowBg:C.greenBg, color:a.active?C.yellow:C.green, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit"}}>
                      {a.active ? '⏸️ Cerrar' : '▶️ Reabrir'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {adminTab === 'create' && (
            <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16}}>
              <div style={{color:C.purple, fontSize:11, letterSpacing:2, fontWeight:700, marginBottom:14}}>NUEVA ACTIVIDAD</div>
              <div style={{marginBottom:10}}>
                <div style={{color:C.muted, fontSize:11, marginBottom:4}}>TÍTULO</div>
                <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={inp} placeholder="ej. Halloween 2026"/>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{color:C.muted, fontSize:11, marginBottom:4}}>DESCRIPCIÓN (opcional)</div>
                <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={3} style={{...inp, resize:"vertical"}} placeholder="Qué tiene que hacer el agente para participar..."/>
              </div>
              <div style={{color:C.muted, fontSize:11, marginBottom:14, background:C.bg, borderRadius:8, padding:"8px 10px"}}>
                No se fija un costo en coins aquí — tú decides cuántos otorgar a cada persona cuando confirmes su participación.
              </div>
              <button onClick={createActivity} disabled={saving} style={{width:"100%", padding:12, borderRadius:10, border:"none", background:saving?"#c5cae9":C.purple, color:"#fff", fontWeight:800, fontSize:14, cursor:saving?"not-allowed":"pointer", fontFamily:"inherit"}}>
                {saving ? 'Publicando...' : '✅ Publicar actividad'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── AGENT VIEW ── */}
      {!isAdmin && (
        <div>
          <div style={{background:`linear-gradient(135deg,${C.purple},${C.blue})`, borderRadius:16, padding:"16px 18px", marginBottom:14}}>
            <div style={{color:"#fff", fontWeight:900, fontSize:18}}>🎉 Actividades</div>
            <div style={{color:"rgba(255,255,255,0.75)", fontSize:12, marginTop:4}}>Regístrate en las que quieras — tú decides. Tu coach confirma tu participación y ahí se otorgan los coins.</div>
          </div>
          {activeActivities.length === 0 ? (
            <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:32, textAlign:"center"}}>
              <div style={{fontSize:40, marginBottom:8}}>📭</div>
              <div style={{color:C.muted}}>No hay actividades abiertas por ahora.</div>
            </div>
          ) : activeActivities.map(a => {
            const reg = myRegByActivity[a.id];
            return (
              <div key={a.id} style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16, marginBottom:10}}>
                <div style={{color:C.text, fontWeight:700, fontSize:15, marginBottom:4}}>{a.title}</div>
                {a.description && <div style={{color:C.muted, fontSize:13, marginBottom:10, lineHeight:1.5}}>{a.description}</div>}
                {reg ? (
                  <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
                    <span style={{color:STATUS_COLOR[reg.status], fontWeight:700, fontSize:13}}>{STATUS_LABEL[reg.status]}</span>
                    {reg.status==="approved" && <span style={{color:C.gold, fontWeight:900, fontSize:14}}>+{reg.points_awarded} 🪙</span>}
                  </div>
                ) : (
                  <button onClick={() => register(a)} style={{width:"100%", padding:11, borderRadius:10, border:"none", background:C.purple, color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"inherit"}}>
                    Registrarme
                  </button>
                )}
              </div>
            );
          })}

          {myRegs.length > 0 && (
            <div style={{marginTop:20}}>
              <div style={{color:C.muted, fontSize:11, letterSpacing:2, fontWeight:700, marginBottom:10}}>MIS REGISTROS</div>
              {myRegs.map(reg => {
                const activity = activities.find(a => a.id === reg.activity_id);
                return (
                  <div key={reg.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.border}`}}>
                    <div>
                      <div style={{color:C.text, fontWeight:600, fontSize:13}}>{activity?.title || "(actividad eliminada)"}</div>
                      <div style={{color:C.muted, fontSize:11}}>{new Date(reg.registered_at).toLocaleDateString("es-MX")}</div>
                    </div>
                    <span style={{color:STATUS_COLOR[reg.status], fontWeight:700, fontSize:12}}>{STATUS_LABEL[reg.status]}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
