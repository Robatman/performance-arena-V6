// @ts-nocheck
import { useState, useEffect } from "react";
import { pageAll } from "../pageAll";

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
// Los coins de cada actividad los fija el admin al CREARLA y ya no se
// pueden modificar (no hay UI de edición y la base lo bloquea con un trigger
// — ver sql/2026-09-30_activity_coins_bonus.sql). Al aprobar, el agente recibe
// exactamente esa cantidad. Registrarse es solo la intención; la
// verificación de que sí participó pasa fuera de la app (fotos, etc.) y el
// admin la refleja aquí marcando aprobado/rechazado.
export default function Activities({ gameId, isAdmin }: Props) {
  const [activities, setActivities] = useState<any[]>([]);
  const [myRegs, setMyRegs] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState<'pending'|'manage'|'create'|'bonus'|'participation'>('pending');
  const [form, setForm] = useState({ title:'', description:'', coins:'' });
  const [people, setPeople] = useState<any[]>([]);
  const [bonusForm, setBonusForm] = useState({ who:'', coins:'', reason:'' });
  const [recentBonuses, setRecentBonuses] = useState<any[]>([]);
  const [awardInput, setAwardInput] = useState<Record<string,string>>({});
  const [pendingActFilter, setPendingActFilter] = useState('all');
  const [pendingQuery, setPendingQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [regFormId, setRegFormId] = useState<string|null>(null);
  const [regForm, setRegForm] = useState({ fullName:'', coachName:'', campaignName:'' });
  // Datos del propio agente (coach y campaña salen de su perfil, que el Excel semanal mantiene al día)
  const [me, setMe] = useState<any>({});
  const [lastFullName, setLastFullName] = useState('');
  const [editMeta, setEditMeta] = useState(false);
  const [coachList, setCoachList] = useState<string[]>([]);
  const [campaignList, setCampaignList] = useState<string[]>([]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { if (!isAdmin) loadMyMeta(); }, [gameId, isAdmin]);

  // Coach y campaña NO se escriben: se toman del perfil. El nombre completo se recuerda
  // de su último registro (no se toca profiles.full_name, que se usa como nombre en rankings).
  async function loadMyMeta() {
    try {
      const [p, regs] = await Promise.all([
        sbFetch(`profiles?game_id=eq.${encodeURIComponent(gameId)}&select=full_name,team,coach_id`).catch(() => []),
        sbFetch(`activity_registrations?game_id=eq.${encodeURIComponent(gameId)}&select=full_name,registered_at&order=registered_at.desc&limit=5`).catch(() => []),
      ]);
      setMe(p && p[0] ? p[0] : {});
      setLastFullName((regs || []).map((r: any) => r.full_name).find((n: any) => n && String(n).trim()) || '');
    } catch (e) { console.error(e); }
  }

  // Listas para el desplegable de respaldo (solo se cargan si hacen falta)
  async function loadLists() {
    if (coachList.length || campaignList.length) return;
    const [coaches, teams] = await Promise.all([
      sbFetch("staff_profiles?role=eq.team_coach&is_active=eq.true&select=game_id&order=game_id.asc").catch(() => []),
      sbFetch("profiles?is_active=eq.true&select=team&limit=1000").catch(() => []),
    ]);
    setCoachList((coaches || []).map((c: any) => c.game_id).filter(Boolean));
    setCampaignList([...new Set((teams || []).map((t: any) => t.team).filter(Boolean))].sort() as string[]);
  }
  useEffect(() => { if (isAdmin && adminTab === 'bonus') loadBonusData(); }, [adminTab]);

  async function loadBonusData() {
    try {
      const [ag, st, ab, sb] = await Promise.all([
        sbFetch("profiles?is_active=eq.true&select=game_id,full_name,username,id&order=full_name.asc").catch(() => []),
        sbFetch("staff_profiles?is_active=eq.true&select=game_id,full_name,username&order=full_name.asc").catch(() => []),
        sbFetch("coin_bonuses?select=*&order=created_at.desc&limit=10").catch(() => []),
        sbFetch("staff_points_log?source=eq.admin_bonus&select=*&order=created_at.desc&limit=10").catch(() => []),
      ]);
      setPeople([
        ...(ag || []).map((p: any) => ({ kind: 'agent', gameId: p.game_id, profileId: p.id, name: p.full_name || p.username || p.game_id })),
        ...(st || []).map((p: any) => ({ kind: 'staff', gameId: p.game_id, name: p.full_name || p.username || p.game_id })),
      ].filter(p => p.gameId));
      setRecentBonuses([
        ...(ab || []).map((b: any) => ({ who: b.game_id, kind: 'agent', coins: b.coins, reason: b.reason, by: b.given_by, at: b.created_at })),
        ...(sb || []).map((b: any) => ({ who: b.staff_game_id, kind: 'staff', coins: b.points, reason: b.reason || b.description, by: b.granted_by, at: b.created_at })),
      ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10));
    } catch (e) { console.error(e); }
  }

  const personLabel = (p: any) => `${p.name} · ${p.gameId} · ${p.kind === 'agent' ? 'Agente' : 'Staff'}`;

  // Bonus extraordinario: cualquier admin puede darlo a un agente o a alguien
  // de staff, sin pasar por una actividad. Agente -> tabla coin_bonuses (se suma
  // a sus coins junto con las actividades). Staff -> staff_points_log (la misma
  // fuente que ya usa su saldo) y se recalcula staff_profiles.coins desde el log.
  async function grantBonus() {
    const person = people.find(p => personLabel(p) === bonusForm.who);
    const coins = Number(bonusForm.coins);
    if (!person) { showToast('Elige a la persona de la lista'); return; }
    if (!Number.isInteger(coins) || coins <= 0) { showToast('Los coins deben ser un entero mayor a 0'); return; }
    if (!bonusForm.reason.trim()) { showToast('Escribe el motivo'); return; }
    if (!window.confirm(`¿Dar +${coins} coins a ${person.name} (${person.kind === 'agent' ? 'Agente' : 'Staff'})?\n\nMotivo: ${bonusForm.reason.trim()}\n\nNo se puede deshacer desde aquí.`)) return;
    setSaving(true);
    try {
      const reason = bonusForm.reason.trim();
      if (person.kind === 'agent') {
        await sbFetch("coin_bonuses", { method:"POST", prefer:"return=minimal", body: JSON.stringify({
          game_id: person.gameId, coins, reason, given_by: gameId,
        })});
        if (person.profileId) {
          await sbFetch("notifications", { method:"POST", prefer:"return=minimal", body: JSON.stringify({
            recipient_id: person.profileId, title: "⭐ Bonus extraordinario",
            message: `+${coins} coins. ${reason}`, type: "info", is_read: false,
          })}).catch(() => {});
        }
      } else {
        await sbFetch("staff_points_log", { method:"POST", prefer:"return=minimal", body: JSON.stringify({
          staff_game_id: person.gameId, points: coins, source: "admin_bonus",
          description: `⭐ Bonus extraordinario: ${reason}`, reason, status: "approved", granted_by: gameId,
        })});
        const log = await sbFetch(`staff_points_log?staff_game_id=eq.${encodeURIComponent(person.gameId)}&status=eq.approved&select=points`);
        const total = Math.max(0, (log || []).reduce((t: number, r: any) => t + (r.points ?? 0), 0));
        await sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(person.gameId)}`, { method:"PATCH", prefer:"return=minimal", body: JSON.stringify({ coins: total }) });
      }
      setBonusForm({ who:'', coins:'', reason:'' });
      showToast(`⭐ +${coins} coins para ${person.name}`);
      loadBonusData();
    } catch(e) { showToast('Error al dar el bonus'); }
    setSaving(false);
  }

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
    const coins = Number(form.coins);
    if (!Number.isInteger(coins) || coins <= 0) { showToast('Los coins deben ser un entero mayor a 0'); return; }
    setSaving(true);
    try {
      await sbFetch("activities", { method:"POST", body: JSON.stringify({
        title: form.title.trim(), description: form.description.trim() || null,
        active: true, created_by: gameId, coins,
      })});
      setForm({ title:'', description:'', coins:'' });
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

  function openRegForm(activityId: string) {
    setRegFormId(prev => prev === activityId ? null : activityId);
    const coach = isMissingValue(me.coach_id) ? '' : String(me.coach_id).trim();
    const camp = isMissingValue(me.team) ? '' : String(me.team).trim();
    setRegForm({ fullName: lastFullName, coachName: coach, campaignName: camp });
    setEditMeta(!coach || !camp);
    if (!coach || !camp) loadLists();
  }

  async function submitRegistration(activity: any) {
    if (!regForm.coachName.trim()) { showToast('Elige tu coach'); return; }
    if (!regForm.campaignName.trim()) { showToast('Elige tu campaña'); return; }
    setSaving(true);
    try {
      const existing = await sbFetch(`activity_registrations?activity_id=eq.${activity.id}&game_id=eq.${encodeURIComponent(gameId)}&select=id`);
      if (existing && existing.length > 0) { fetchAll(); showToast('Ya estás registrado en esta actividad'); setRegFormId(null); setSaving(false); return; }
      await sbFetch("activity_registrations", { method:"POST", body: JSON.stringify({
        activity_id: activity.id, game_id: gameId, status: "pending",
        full_name: regForm.fullName.trim() || null, coach_name: regForm.coachName.trim(),
        campaign_name: regForm.campaignName.trim(), registered_at: new Date().toISOString(),
      })});
      if (regForm.fullName.trim()) setLastFullName(regForm.fullName.trim());
      showToast('✅ Registrado — el admin confirmará tu participación');
      setRegFormId(null);
      fetchAll();
    } catch(e) { showToast('Error al registrarte'); }
    setSaving(false);
  }

  async function review(reg: any, approve: boolean) {
    const activity = activities.find(a => a.id === reg.activity_id);
    try {
      if (approve) {
        // Coins fijados al crear la actividad. Solo una actividad vieja sin
        // coins (anterior a este cambio) cae al monto escrito a mano.
        const pts = activity?.coins > 0 ? activity.coins : Number(awardInput[reg.id] || 0);
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

  // Pendientes: filtro por actividad (con conteo) y búsqueda por game id, nombre, coach o campaña
  const pendingByAct: Record<string, number> = {};
  pending.forEach(r => { pendingByAct[r.activity_id] = (pendingByAct[r.activity_id] || 0) + 1; });
  const pendingActOptions = Object.keys(pendingByAct)
    .map(id => ({ id, title: activities.find(a => a.id === id)?.title || '(actividad eliminada)', n: pendingByAct[id] }))
    .sort((a, b) => b.n - a.n);
  const pq = pendingQuery.trim().toLowerCase();
  const pendingShown = pending.filter(r =>
    (pendingActFilter === 'all' || r.activity_id === pendingActFilter) &&
    (!pq || `${r.game_id || ''} ${r.full_name || ''} ${r.coach_name || ''} ${r.campaign_name || ''}`.toLowerCase().includes(pq))
  );

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
              {id:'bonus', label:'⭐ Bonus'},
              {id:'participation', label:'📊 Participación'},
            ].map(t => (
              <button key={t.id} onClick={() => setAdminTab(t.id as any)} style={{flex:1, padding:"8px 4px", borderRadius:9, border:`1.5px solid ${adminTab===t.id?C.purple:C.border}`, background:adminTab===t.id?`${C.purple}12`:C.card, color:adminTab===t.id?C.purple:C.muted, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit"}}>
                {t.label}
              </button>
            ))}
          </div>

          {adminTab === 'participation' && <ParticipationPanel activities={activities} />}

          {adminTab === 'pending' && (
            <div>
              {pending.length > 0 && (
                <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:12, marginBottom:12}}>
                  <select value={pendingActFilter} onChange={e => setPendingActFilter(e.target.value)} style={{...inp, marginBottom:8}}>
                    <option value="all">Todas las actividades ({pending.length})</option>
                    {pendingActOptions.map(o => <option key={o.id} value={o.id}>{o.title} ({o.n})</option>)}
                  </select>
                  <input value={pendingQuery} onChange={e => setPendingQuery(e.target.value)} placeholder="🔍 Buscar por game id, nombre, coach o campaña..." style={inp}/>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8, color:C.muted, fontSize:12}}>
                    <span>Mostrando {pendingShown.length} de {pending.length} pendientes</span>
                    {(pendingActFilter !== 'all' || pq) && (
                      <button onClick={() => { setPendingActFilter('all'); setPendingQuery(''); }} style={{background:"none", border:"none", color:C.purple, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit"}}>Limpiar filtros</button>
                    )}
                  </div>
                </div>
              )}
              {pendingShown.length === 0 ? (
                <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:32, textAlign:"center"}}>
                  <div style={{fontSize:40, marginBottom:8}}>{pending.length === 0 ? '✅' : '🔎'}</div>
                  <div style={{color:C.muted}}>{pending.length === 0 ? 'No hay registros pendientes' : 'Ningún pendiente con ese filtro'}</div>
                </div>
              ) : pendingShown.map(reg => {
                const activity = activities.find(a => a.id === reg.activity_id);
                return (
                  <div key={reg.id} style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16, marginBottom:10}}>
                    <div style={{marginBottom:10}}>
                      <div style={{color:C.text, fontWeight:800, fontSize:15}}>🎮 {reg.game_id}</div>
                      {reg.full_name && <div style={{color:C.text, fontSize:13, fontWeight:600, marginTop:2}}>👤 {reg.full_name}</div>}
                      {reg.coach_name && <div style={{color:C.muted, fontSize:12, marginTop:1}}>Coach: {reg.coach_name}</div>}
                      {reg.campaign_name && <div style={{color:C.muted, fontSize:12, marginTop:1}}>Campaña: {reg.campaign_name}</div>}
                      <div style={{color:C.purple, fontSize:12, fontWeight:700, marginTop:2}}>{activity?.title || "(actividad eliminada)"}</div>
                      <div style={{color:C.muted, fontSize:11, marginTop:2}}>{new Date(reg.registered_at).toLocaleString()}</div>
                    </div>
                    <div style={{display:"flex", gap:8, alignItems:"center"}}>
                      {activity?.coins > 0
                        ? <div style={{width:90, textAlign:"center", color:C.gold, fontWeight:900, fontSize:15}}>{activity.coins} 🪙</div>
                        : <input type="number" placeholder="Coins" value={awardInput[reg.id]||""} onChange={e=>setAwardInput(p=>({...p,[reg.id]:e.target.value}))} style={{...inp, width:90, padding:"9px 10px"}}/>}
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
                        <span style={{padding:"2px 8px", borderRadius:6, background:`${C.gold}18`, color:C.gold, fontSize:11, fontWeight:800}}>{a.coins>0?`🪙 ${a.coins}`:'🪙 sin monto fijo'}</span>
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

          {adminTab === 'bonus' && (
            <div>
              <div style={{background:C.card, border:`1.5px solid ${C.gold}66`, borderRadius:14, padding:16, marginBottom:12}}>
                <div style={{color:C.gold, fontSize:11, letterSpacing:2, fontWeight:700, marginBottom:6}}>BONUS EXTRAORDINARIO</div>
                <div style={{color:C.muted, fontSize:12, marginBottom:14}}>Para reconocer algo fuera de lo normal (por ejemplo, ayudar muchísimo a alguien). Sirve para agentes y para staff.</div>
                <div style={{marginBottom:10}}>
                  <div style={{color:C.muted, fontSize:11, marginBottom:4}}>PERSONA</div>
                  <input list="bonus-people" value={bonusForm.who} onChange={e=>setBonusForm(p=>({...p,who:e.target.value}))} style={inp} placeholder="Escribe para buscar un agente o staff..."/>
                  <datalist id="bonus-people">{people.map(p => <option key={p.kind+p.gameId} value={personLabel(p)}/>)}</datalist>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{color:C.muted, fontSize:11, marginBottom:4}}>COINS</div>
                  <input type="number" min={1} step={1} value={bonusForm.coins} onChange={e=>setBonusForm(p=>({...p,coins:e.target.value}))} style={inp} placeholder="ej. 50"/>
                </div>
                <div style={{marginBottom:14}}>
                  <div style={{color:C.muted, fontSize:11, marginBottom:4}}>MOTIVO (se le avisa a la persona)</div>
                  <textarea value={bonusForm.reason} onChange={e=>setBonusForm(p=>({...p,reason:e.target.value}))} rows={2} style={{...inp, resize:"vertical"}} placeholder="Qué hizo para merecerlo..."/>
                </div>
                <button onClick={grantBonus} disabled={saving} style={{width:"100%", padding:12, borderRadius:10, border:"none", background:saving?"#c5cae9":C.gold, color:"#fff", fontWeight:800, fontSize:14, cursor:saving?"not-allowed":"pointer", fontFamily:"inherit"}}>
                  {saving ? 'Dando bonus...' : '⭐ Dar bonus'}
                </button>
              </div>
              {recentBonuses.length > 0 && (
                <div>
                  <div style={{color:C.muted, fontSize:11, letterSpacing:2, fontWeight:700, marginBottom:8}}>ÚLTIMOS BONUS</div>
                  {recentBonuses.map((b, i) => (
                    <div key={i} style={{display:"flex", justifyContent:"space-between", gap:10, padding:"9px 0", borderBottom:`1px solid ${C.border}`}}>
                      <div style={{minWidth:0}}>
                        <div style={{color:C.text, fontWeight:700, fontSize:13}}>{b.who} <span style={{color:C.muted, fontWeight:600, fontSize:11}}>· {b.kind === 'agent' ? 'Agente' : 'Staff'}</span></div>
                        <div style={{color:C.muted, fontSize:11}}>{b.reason} — por {b.by || '—'} · {new Date(b.at).toLocaleDateString("es-MX")}</div>
                      </div>
                      <div style={{color:C.gold, fontWeight:900, fontSize:14, flexShrink:0}}>+{b.coins} 🪙</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {adminTab === 'create' && (
            <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16}}>
              <div style={{color:C.purple, fontSize:11, letterSpacing:2, fontWeight:700, marginBottom:14}}>NUEVA ACTIVIDAD</div>
              <div style={{marginBottom:10}}>
                <div style={{color:C.muted, fontSize:11, marginBottom:4}}>TÍTULO</div>
                <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={inp} placeholder="ej. 🎃 Halloween 2026"/>
                <div style={{color:C.muted, fontSize:10, marginTop:4}}>Si el título empieza con un emoji, ese será el ícono de su burbuja en el Inicio.</div>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{color:C.muted, fontSize:11, marginBottom:4}}>DESCRIPCIÓN (opcional)</div>
                <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={3} style={{...inp, resize:"vertical"}} placeholder="Qué tiene que hacer el agente para participar..."/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{color:C.muted, fontSize:11, marginBottom:4}}>COINS POR PARTICIPACIÓN</div>
                <input type="number" min={1} step={1} value={form.coins} onChange={e=>setForm(p=>({...p,coins:e.target.value}))} style={inp} placeholder="ej. 25"/>
              </div>
              <div style={{color:C.muted, fontSize:11, marginBottom:14, background:C.bg, borderRadius:8, padding:"8px 10px"}}>
                ⚠️ Los coins quedan fijos al publicar y <strong>no se pueden modificar después</strong>. Cada agente que cumpla recibirá exactamente esa cantidad. Si te equivocas, cierra la actividad y crea otra.
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
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:4}}>
                  <div style={{color:C.text, fontWeight:700, fontSize:15}}>{a.title}</div>
                  {a.coins>0 && <span style={{flexShrink:0, padding:"3px 10px", borderRadius:20, background:`${C.gold}1f`, color:C.gold, fontWeight:900, fontSize:13}}>+{a.coins} 🪙</span>}
                </div>
                {a.description && <div style={{color:C.muted, fontSize:13, marginBottom:10, lineHeight:1.5}}>{a.description}</div>}
                {reg ? (
                  <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
                    <span style={{color:STATUS_COLOR[reg.status], fontWeight:700, fontSize:13}}>{STATUS_LABEL[reg.status]}</span>
                    {reg.status==="approved" && <span style={{color:C.gold, fontWeight:900, fontSize:14}}>+{reg.points_awarded} 🪙</span>}
                  </div>
                ) : regFormId === a.id ? (
                  <div>
                    <div style={{background:C.bg, borderRadius:10, padding:"10px 12px", marginBottom:10}}>
                      <div style={{color:C.muted, fontSize:10, marginBottom:4}}>TE REGISTRAS COMO</div>
                      <div style={{color:C.text, fontWeight:800, fontSize:14}}>🎮 {gameId}</div>
                      {!editMeta && (<>
                        <div style={{color:C.muted, fontSize:12, marginTop:3}}>Coach: <strong style={{color:C.text}}>{regForm.coachName}</strong></div>
                        <div style={{color:C.muted, fontSize:12, marginTop:1}}>Campaña: <strong style={{color:C.text}}>{regForm.campaignName}</strong></div>
                        <button onClick={() => { setEditMeta(true); loadLists(); }} style={{marginTop:6, background:"none", border:"none", color:C.purple, fontSize:11, fontWeight:700, cursor:"pointer", padding:0, fontFamily:"inherit"}}>Esto no es correcto</button>
                      </>)}
                    </div>
                    {editMeta && (
                      <div style={{display:"flex", flexDirection:"column", gap:9, marginBottom:10}}>
                        <div>
                          <div style={{color:C.muted, fontSize:10, marginBottom:3}}>TU COACH *</div>
                          <select value={regForm.coachName} onChange={e=>setRegForm(p=>({...p,coachName:e.target.value}))} style={inp}>
                            <option value="">Elige tu coach...</option>
                            {[...new Set([regForm.coachName, ...coachList].filter(Boolean))].map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <div style={{color:C.muted, fontSize:10, marginBottom:3}}>TU CAMPAÑA *</div>
                          <select value={regForm.campaignName} onChange={e=>setRegForm(p=>({...p,campaignName:e.target.value}))} style={inp}>
                            <option value="">Elige tu campaña...</option>
                            {[...new Set([regForm.campaignName, ...campaignList].filter(Boolean))].map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                    <div style={{marginBottom:10}}>
                      <div style={{color:C.muted, fontSize:10, marginBottom:3}}>NOMBRE COMPLETO (opcional)</div>
                      <input value={regForm.fullName} onChange={e=>setRegForm(p=>({...p,fullName:e.target.value}))} style={inp} placeholder="Para entregar tu premio"/>
                    </div>
                    <div style={{display:"flex", gap:8}}>
                      <button onClick={() => submitRegistration(a)} disabled={saving} style={{flex:1, padding:11, borderRadius:10, border:"none", background:saving?C.muted:C.purple, color:"#fff", fontWeight:800, fontSize:13, cursor:saving?"not-allowed":"pointer", fontFamily:"inherit"}}>{saving?"Registrando...":"✅ Confirmar registro"}</button>
                      <button onClick={() => setRegFormId(null)} style={{padding:"11px 14px", borderRadius:10, border:`1.5px solid ${C.border}`, background:C.card, color:C.muted, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit"}}>✕</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => openRegForm(a.id)} style={{width:"100%", padding:11, borderRadius:10, border:"none", background:C.purple, color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"inherit"}}>
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

// ─── BURBUJAS (Inicio del agente) ─────────────────────────────────────────
// Una burbuja flotante por actividad abierta. El emoji sale del título si
// empieza con uno ("🎃 Halloween"), así el admin lo elige sin campo nuevo ni
// cambio de base de datos; si no, 🎉. Tocar una lleva a la pestaña Actividades.
const LEADING_EMOJI = /^\s*(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u;
export function activityEmoji(title: string) {
  const m = LEADING_EMOJI.exec(title || "");
  return { emoji: m ? m[1] : "🎉", label: (title || "").replace(LEADING_EMOJI, "").trim() || title };
}

export function ActivityBubbles({ gameId, onOpen }: { gameId: string; onOpen: () => void }) {
  const [acts, setActs] = useState<any[]>([]);
  const [regs, setRegs] = useState<Record<string, any>>({});
  useEffect(() => {
    (async () => {
      try {
        const a = await sbFetch("activities?active=eq.true&select=id,title,coins&order=created_at.desc");
        setActs(a || []);
        if (gameId) {
          const r = await sbFetch(`activity_registrations?game_id=eq.${encodeURIComponent(gameId)}&select=activity_id,status`);
          setRegs(Object.fromEntries((r || []).map((x: any) => [x.activity_id, x])));
        }
      } catch (e) { console.error(e); }
    })();
  }, [gameId]);

  if (acts.length === 0) return null;
  const MAX = 5;
  const shown = acts.slice(0, MAX);
  const extra = acts.length - shown.length;
  const bubble = (key: string, top: React.ReactNode, sub: string, delay: number, done?: boolean, coins?: number) => (
    <button key={key} onClick={onOpen} className="act-bubble" style={{
      width: 96, height: 96, borderRadius: "50%", border: `2px solid ${done ? C.green : "rgba(255,255,255,0.45)"}`,
      background: done ? "rgba(22,163,74,0.35)" : "rgba(255,255,255,0.16)", backdropFilter: "blur(4px)",
      color: "#fff", cursor: "pointer", fontFamily: "inherit", padding: 6,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      animation: `actFloat 3.4s ease-in-out ${delay}s infinite`,
    }}>
      <div style={{ fontSize: 30, lineHeight: 1 }}>{top}</div>
      <div style={{ fontSize: 10, fontWeight: 800, marginTop: 4, lineHeight: 1.15, maxWidth: 80, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{sub}</div>
      {coins > 0 && <div style={{ fontSize: 10, fontWeight: 900, color: "#fde68a", marginTop: 2 }}>+{coins} 🪙</div>}
    </button>
  );
  return (
    <div style={{ background: `linear-gradient(135deg,${C.purple},${C.blue})`, borderRadius: 16, padding: "14px 12px 18px", marginBottom: 12 }}>
      <style>{`@keyframes actFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}} .act-bubble:active{transform:scale(.94)}`}</style>
      <div style={{ color: "#fff", fontWeight: 900, fontSize: 15, marginBottom: 2, paddingLeft: 6 }}>🎉 Actividades abiertas</div>
      <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginBottom: 12, paddingLeft: 6 }}>Toca una burbuja para participar</div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14 }}>
        {shown.map((a, i) => {
          const { emoji, label } = activityEmoji(a.title);
          const done = !!regs[a.id];
          return bubble(a.id, done ? "✅" : emoji, label, i * 0.4, done, a.coins);
        })}
        {extra > 0 && bubble("more", `+${extra}`, "ver todas", MAX * 0.4)}
      </div>
    </div>
  );
}

// ─── TARJETA DE ACTIVIDADES EN EL DASHBOARD ───────────────────────────────
// Lista compacta de actividades abiertas con estado de registro del agente.
// Se auto-carga y no necesita props del store principal.
export function ActivityDashboardCard({ gameId, onOpen }: { gameId: string; onOpen: () => void }) {
  const [acts, setActs] = useState<any[]>([]);
  const [regs, setRegs] = useState<Record<string, any>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [a, r] = await Promise.all([
          sbFetch("activities?active=eq.true&select=id,title,description,coins&order=created_at.asc"),
          gameId ? sbFetch(`activity_registrations?game_id=eq.${encodeURIComponent(gameId)}&select=activity_id,status,points_awarded`) : Promise.resolve([]),
        ]);
        setActs(a || []);
        setRegs(Object.fromEntries((r || []).map((x: any) => [x.activity_id, x])));
      } catch (e) { console.error(e); }
      setLoaded(true);
    })();
  }, [gameId]);

  if (!loaded || acts.length === 0) return null;

  const STATUS_COLOR: Record<string,string> = { pending: C.yellow, approved: C.green, rejected: C.red };
  const STATUS_LABEL: Record<string,string> = { pending:"⏳ Pendiente", approved:"✅ Aprobado", rejected:"❌ No confirmado" };

  return (
    <div style={{ background:"linear-gradient(135deg,#1e1b4b,#1e3a5f)", border:"1.5px solid #6d28d9", borderRadius:16, padding:16, marginBottom:12, boxShadow:"0 4px 20px rgba(109,40,217,0.15)" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:20 }}>🎉</span>
          <span style={{ color:"#fff", fontWeight:800, fontSize:15 }}>Actividades Abiertas</span>
        </div>
        <button onClick={onOpen} style={{ background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.25)", borderRadius:8, padding:"5px 12px", color:"#e0e7ff", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Ver todas →</button>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {acts.map(a => {
          const reg = regs[a.id];
          return (
            <div key={a.id} style={{ background:"rgba(255,255,255,0.08)", borderRadius:10, padding:"10px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:"#fff", fontWeight:700, fontSize:13, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{a.title}</div>
                {a.description && <div style={{ color:"rgba(255,255,255,0.55)", fontSize:11, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{a.description}</div>}
              </div>
              <div style={{ flexShrink:0, display:"flex", alignItems:"center", gap:8 }}>
                {a.coins > 0 && <span style={{ color:"#fde68a", fontWeight:900, fontSize:12 }}>+{a.coins}🪙</span>}
                {reg ? (
                  <span style={{ color:STATUS_COLOR[reg.status]||C.muted, fontWeight:700, fontSize:11 }}>{STATUS_LABEL[reg.status]||reg.status}</span>
                ) : (
                  <button onClick={onOpen} style={{ background:"#7c3aed", border:"none", borderRadius:7, padding:"5px 12px", color:"#fff", fontSize:11, fontWeight:800, cursor:"pointer", fontFamily:"inherit" }}>Registrarme</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Un coach o campaña "vacío" o "Pending Coach" cuenta como sin asignar.
function isMissingValue(v: any) {
  return !v || !String(v).trim() || /pending|sin asignar/i.test(String(v));
}

// ─── ADMIN: participación por coach y por campaña ────────────────────────────
// Cruza cada registro con el perfil del agente (coach_id / team, que el Excel semanal
// mantiene) para contar cuántos agentes de cada coach o campaña se registraron, cuántos
// fueron aprobados y cuántos coins se entregaron. Si el perfil no tiene el dato, usa lo
// guardado en el registro; si tampoco, queda como SIN ASIGNAR.
function ParticipationPanel({ activities }: { activities: any[] }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState(false);
  const [actId, setActId] = useState('all');
  const [groupBy, setGroupBy] = useState<'coach'|'campaign'>('coach');

  useEffect(() => {
    (async () => {
      try {
        const [regs, profs] = await Promise.all([
          pageAll(sbFetch, "activity_registrations?select=*&order=id.asc"),
          pageAll(sbFetch, "profiles?is_active=eq.true&select=game_id,team,coach_id&order=id.asc"),
        ]);
        setData({ regs, profs });
      } catch (e) { setErr(true); }
    })();
  }, []);

  if (err) return <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:24, textAlign:"center", color:C.red}}>No se pudo cargar la participación.</div>;
  if (!data) return <div style={{textAlign:"center", padding:30, color:C.muted}}>Cargando...</div>;

  const norm = (v: any) => String(v || '').trim().toUpperCase();
  const profBy: Record<string, any> = {};
  data.profs.forEach((p: any) => { profBy[norm(p.game_id)] = p; });
  const field = groupBy === 'coach' ? 'coach_id' : 'team';
  const snap = groupBy === 'coach' ? 'coach_name' : 'campaign_name';
  const keyOf = (p: any, reg: any) => {
    const live = p ? p[field] : null;
    const saved = reg ? reg[snap] : null;
    const v = !isMissingValue(live) ? live : (!isMissingValue(saved) ? saved : null);
    return v ? norm(v) : 'SIN ASIGNAR';
  };

  const groups: Record<string, any> = {};
  const g = (k: string) => (groups[k] = groups[k] || { key: k, assigned: 0, registered: new Set(), approved: new Set(), coins: 0, regs: 0 });
  data.profs.forEach((p: any) => { g(keyOf(p, null)).assigned++; });
  const regs = data.regs.filter((r: any) => r.status !== 'rejected' && (actId === 'all' || r.activity_id === actId));
  regs.forEach((r: any) => {
    const x = g(keyOf(profBy[norm(r.game_id)], r));
    x.registered.add(norm(r.game_id)); x.regs++;
    if (r.status === 'approved') { x.approved.add(norm(r.game_id)); x.coins += r.points_awarded || 0; }
  });
  const rows = Object.values(groups).map((x: any) => ({ ...x, nReg: x.registered.size, nApp: x.approved.size, pct: x.assigned ? Math.round((x.registered.size / x.assigned) * 100) : 0 }))
    .sort((a: any, b: any) => b.nReg - a.nReg || b.pct - a.pct);
  const totals = rows.reduce((t: any, x: any) => ({ assigned: t.assigned + x.assigned, nReg: t.nReg + x.nReg, nApp: t.nApp + x.nApp, coins: t.coins + x.coins, regs: t.regs + x.regs }), { assigned: 0, nReg: 0, nApp: 0, coins: 0, regs: 0 });
  const maxReg = Math.max(1, ...rows.map((x: any) => x.nReg));

  const exportCsv = () => {
    const NL = String.fromCharCode(10);
    const BOM = String.fromCharCode(65279);
    const q = (v: any) => '"' + String(v ?? '').split('"').join('""') + '"';
    const title = groupBy === 'coach' ? 'coach' : 'campana';
    const lines = [[title, 'agentes_asignados', 'agentes_registrados', 'porcentaje', 'agentes_aprobados', 'inscripciones', 'coins_entregados'].map(q).join(',')];
    rows.forEach((x: any) => lines.push([x.key, x.assigned, x.nReg, x.pct, x.nApp, x.regs, x.coins].map(q).join(',')));
    const blob = new Blob([BOM + lines.join(NL)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `participacion_${title}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pill = (id: string, label: string) => (
    <button key={id} onClick={() => setGroupBy(id as any)} style={{padding:"7px 14px", borderRadius:9, border:`1.5px solid ${groupBy===id?C.purple:C.border}`, background:groupBy===id?`${C.purple}12`:C.card, color:groupBy===id?C.purple:C.muted, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit"}}>{label}</button>
  );

  return (
    <div>
      <div style={{background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:14, marginBottom:12}}>
        <div style={{display:"flex", gap:6, marginBottom:10, flexWrap:"wrap", alignItems:"center"}}>
          {pill('coach', 'Por coach')}{pill('campaign', 'Por campaña')}
          <button onClick={exportCsv} style={{marginLeft:"auto", padding:"7px 14px", borderRadius:9, border:"none", background:C.green, color:"#fff", fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:"inherit"}}>⬇️ CSV</button>
        </div>
        <select value={actId} onChange={e => setActId(e.target.value)} style={inp}>
          <option value="all">Todas las actividades</option>
          {activities.map((a: any) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
        <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginTop:12}}>
          {[{l:'Agentes registrados', v:`${totals.nReg}/${totals.assigned}`, c:C.purple}, {l:'Inscripciones', v:totals.regs, c:C.blue}, {l:'Coins entregados', v:totals.coins, c:C.gold}].map(x => (
            <div key={x.l} style={{background:`${x.c}12`, border:`1px solid ${x.c}30`, borderRadius:10, padding:"8px 6px", textAlign:"center"}}>
              <div style={{color:x.c, fontWeight:900, fontSize:18}}>{x.v}</div><div style={{color:C.muted, fontSize:10}}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>

      {rows.map((x: any) => (
        <div key={x.key} style={{background:C.card, border:`1.5px solid ${x.key==='SIN ASIGNAR'?C.yellow:C.border}`, borderRadius:12, padding:"10px 14px", marginBottom:8}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:8}}>
            <div style={{color:C.text, fontWeight:800, fontSize:14}}>{x.key}</div>
            <div style={{color:C.purple, fontWeight:900, fontSize:14}}>{x.nReg} <span style={{color:C.muted, fontWeight:600, fontSize:11}}>de {x.assigned} · {x.pct}%</span></div>
          </div>
          <div style={{background:C.border, borderRadius:4, height:7, overflow:"hidden", margin:"7px 0"}}>
            <div style={{width:`${Math.round((x.nReg / maxReg) * 100)}%`, height:"100%", background:C.purple, borderRadius:4}}/>
          </div>
          <div style={{color:C.muted, fontSize:11}}>Aprobados: {x.nApp} · Inscripciones: {x.regs} · Coins entregados: {x.coins}</div>
        </div>
      ))}
      {rows.length === 0 && <div style={{textAlign:"center", padding:24, color:C.muted}}>Sin registros todavía.</div>}
    </div>
  );
}
