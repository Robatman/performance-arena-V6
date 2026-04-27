// @ts-nocheck
import { useState, useEffect } from "react";

const SUPABASE_URL = "https://dxwjjptjyhiitejupvaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4d2pqcHRqeWhpaXRlanVwdmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODgwMjEsImV4cCI6MjA5MjU2NDAyMX0.UgQDse6To0oe49llGDC7e9jYO1_bR6gxk-YcE6h7Bn8";

async function sbFetch(path, opts: any = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...opts.headers,
    },
    ...opts,
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const db = {
  getRewards: () => sbFetch("staff_reward_catalog?is_active=eq.true&order=coins_cost.asc"),
  getAllRewards: () => sbFetch("staff_reward_catalog?order=coins_cost.asc"),
  createReward: (d) => sbFetch("staff_reward_catalog", { method:"POST", body:JSON.stringify(d) }),
  updateReward: (id, d) => sbFetch(`staff_reward_catalog?id=eq.${id}`, { method:"PATCH", body:JSON.stringify(d) }),
  getRedemptions: () => sbFetch("staff_redemptions?order=created_at.desc&limit=200"),
  getMyRedemptions: (gameId) => sbFetch(`staff_redemptions?staff_game_id=eq.${encodeURIComponent(gameId)}&order=created_at.desc`),
  createRedemption: (d) => sbFetch("staff_redemptions", { method:"POST", body:JSON.stringify(d) }),
  updateRedemption: (id, d) => sbFetch(`staff_redemptions?id=eq.${id}`, { method:"PATCH", body:JSON.stringify(d) }),
  updateCoins: (id, coins) => sbFetch(`staff_profiles?id=eq.${id}`, { method:"PATCH", body:JSON.stringify({ coins }) }),
  getStaffByGameId: (gameId) => sbFetch(`staff_profiles?game_id=eq.${encodeURIComponent(gameId)}&select=*`),
  getPointsLog: (gameId) => sbFetch(`staff_points_log?staff_game_id=eq.${encodeURIComponent(gameId)}&order=created_at.desc&limit=30`),
  addPointsLog: (d) => sbFetch("staff_points_log", { method:"POST", body:JSON.stringify(d) }),
  // Manual bonus
  getAllStaff: () => sbFetch("staff_profiles?select=*&order=full_name.asc"),
};

const S = {
  bg:"#0f1117", card:"#1a1d27", border:"#2a2d3e", text:"#e8eaf6",
  muted:"#8b8fa8", accent:"#6366f1", green:"#22c55e", red:"#ef4444",
  yellow:"#f59e0b", purple:"#a855f7", gold:"#f59e0b",
};

const CATS = {
  tiempo:          { label:"Tiempo",          emoji:"⏰", color:"#06b6d4" },
  capacitacion:    { label:"Capacitación",    emoji:"📚", color:S.accent },
  reconocimiento:  { label:"Reconocimiento",  emoji:"🏆", color:S.yellow },
  experiencia:     { label:"Experiencia",     emoji:"🎉", color:S.purple },
};

const SCard = ({children,style={},onClick}:any) =>
  <div onClick={onClick} style={{background:S.card,border:`1px solid ${S.border}`,borderRadius:14,padding:16,...style,cursor:onClick?"pointer":undefined}}>{children}</div>;
const SBtn = ({children,onClick,color=S.accent,disabled=false,style={},sm=false}:any) =>
  <button onClick={onClick} disabled={disabled} style={{background:disabled?S.border:color,color:"#fff",border:"none",borderRadius:sm?6:9,padding:sm?"5px 12px":"10px 18px",fontWeight:700,fontSize:sm?11:13,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",transition:"all 0.15s",...style}}>{children}</button>;
const STag = ({children,color=S.accent}:any) =>
  <span style={{padding:"2px 8px",borderRadius:5,background:`${color}22`,color,fontSize:10,fontWeight:700,letterSpacing:0.5}}>{children}</span>;

// ─── REWARD CARD ─────────────────────────────────────────────────────────────
function RewardCard({ reward, coins, onRedeem }) {
  const cost = reward.coins_cost;
  const canBuy = coins >= cost;
  const noStock = (reward.stock||0) <= 0;
  const cat = CATS[reward.category] || { label:reward.category, emoji:"🎁", color:S.muted };

  return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px",borderRadius:14,border:`1.5px solid ${canBuy&&!noStock?cat.color+"44":S.border}`,background:canBuy&&!noStock?`${cat.color}08`:S.card,marginBottom:10,transition:"all 0.2s"}}>
      <div style={{width:52,height:52,borderRadius:12,background:`${cat.color}18`,border:`1.5px solid ${cat.color}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>
        {reward.emoji||cat.emoji}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:S.text,fontWeight:700,fontSize:14,marginBottom:2}}>{reward.name}</div>
        {reward.description&&<div style={{color:S.muted,fontSize:11,marginBottom:4,lineHeight:1.4}}>{reward.description}</div>}
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <STag color={cat.color}>{cat.emoji} {cat.label}</STag>
          <span style={{color:noStock?S.red:S.muted,fontSize:11}}>{noStock?"Sin stock":`Stock: ${reward.stock}`}</span>
        </div>
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:3,justifyContent:"flex-end",marginBottom:6}}>
          <span style={{fontSize:16}}>🪙</span>
          <span style={{color:canBuy?S.gold:S.muted,fontWeight:900,fontSize:18}}>{cost}</span>
        </div>
        <SBtn onClick={()=>onRedeem(reward)} disabled={!canBuy||noStock} color={canBuy&&!noStock?S.accent:S.border} sm>
          {noStock?"Agotado":canBuy?"Canjear":"Sin coins"}
        </SBtn>
      </div>
    </div>
  );
}

// ─── STAFF STORE (USER VIEW) ──────────────────────────────────────────────────
function StoreView({ user, staffProfile, onCoinsUpdate }) {
  const [rewards, setRewards]       = useState<any[]>([]);
  const [myRedemptions, setMyR]     = useState<any[]>([]);
  const [pointsLog, setLog]         = useState<any[]>([]);
  const [tab, setTab]               = useState<"store"|"history"|"points">("store");
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState("");
  const coins = staffProfile?.coins || 0;

  const showToast = (msg:string) => { setToast(msg); setTimeout(()=>setToast(""),3000); };

  useEffect(()=>{ load(); },[]);
  const load = async () => {
    setLoading(true);
    try {
      const [r, red, log] = await Promise.all([
        db.getRewards(),
        db.getMyRedemptions(user.gameId),
        db.getPointsLog(user.gameId),
      ]);
      setRewards(r||[]);
      setMyR(red||[]);
      setLog(log||[]);
    } catch(e){}
    setLoading(false);
  };

  const redeem = async (reward:any) => {
    const cost = reward.coins_cost;
    if (coins < cost) { showToast("No tienes suficientes coins"); return; }
    try {
      // Deduct coins
      const newCoins = coins - cost;
      await db.updateCoins(staffProfile.id, newCoins);
      // Create redemption
      await db.createRedemption({
        staff_game_id: user.gameId,
        reward_id: reward.id,
        reward_name: reward.name,
        coins_spent: cost,
        status: "pending",
      });
      // Log negative transaction
      await db.addPointsLog({
        staff_game_id: user.gameId,
        points: -cost,
        source: "store_purchase",
        description: `Canjeó: ${reward.name}`,
        status: "approved",
      });
      // Update stock
      if ((reward.stock||0) < 999) {
        await db.updateReward(reward.id, { stock: Math.max(0, (reward.stock||0)-1) });
      }
      onCoinsUpdate(newCoins);
      showToast(`✅ ${reward.name} canjeado! Pendiente de aprobación.`);
      await load();
    } catch(e){ showToast("Error al canjear"); }
  };

  const catGroups = Object.entries(CATS).map(([key, meta]) => ({
    key, meta, items: rewards.filter(r => r.category === key),
  })).filter(g => g.items.length > 0);

  const STATUS_COLOR = { pending:S.yellow, approved:S.accent, delivered:S.green };
  const STATUS_LABEL = { pending:"Pendiente", approved:"Aprobado", delivered:"Entregado" };

  return (
    <div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}>
      {toast&&<div style={{position:"fixed",top:56,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:toast.includes("Error")?S.red:S.green,color:"#fff",padding:"10px 22px",borderRadius:12,fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>{toast}</div>}

      {/* Header */}
      <div style={{background:`linear-gradient(135deg,#1e1b4b,#312e81,#4a1942)`,borderRadius:20,padding:"18px 16px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{color:"#fff",fontWeight:900,fontSize:22}}>🏪 Staff Store</div>
            <div style={{color:"#a5b4fc",fontSize:12,marginTop:2}}>{user.gameId}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:10,letterSpacing:1}}>TUS COINS</div>
            <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
              <span style={{fontSize:22}}>🪙</span>
              <span style={{color:S.gold,fontWeight:900,fontSize:28}}>{coins}</span>
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"8px 12px"}}>
            <div style={{color:S.yellow,fontWeight:900,fontSize:16}}>{myRedemptions.filter(r=>r.status==="pending").length}</div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:10}}>Canjes pendientes</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"8px 12px"}}>
            <div style={{color:S.green,fontWeight:900,fontSize:16}}>{myRedemptions.filter(r=>r.status==="delivered").length}</div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:10}}>Canjes entregados</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto"}}>
        {[
          {id:"store",   label:"🏪 Tienda"},
          {id:"history", label:`📦 Mis Canjes (${myRedemptions.length})`},
          {id:"points",  label:"📊 Mis Puntos"},
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id as any)} style={{padding:"8px 14px",borderRadius:9,border:`1px solid ${tab===t.id?S.accent:S.border}`,background:tab===t.id?`${S.accent}22`:S.card,color:tab===t.id?"#a5b4fc":S.muted,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{t.label}</button>
        ))}
      </div>

      {/* STORE */}
      {tab==="store"&&(
        <div>
          {loading&&<div style={{textAlign:"center",color:S.muted,padding:40}}>Cargando...</div>}
          {!loading&&rewards.length===0&&(
            <SCard style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:48,marginBottom:8}}>🏪</div>
              <div style={{color:S.muted}}>La tienda staff está vacía. El admin agregará premios pronto.</div>
            </SCard>
          )}
          {catGroups.map(({key,meta,items})=>(
            <div key={key} style={{marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{width:4,height:20,borderRadius:2,background:meta.color}}/>
                <span style={{color:S.text,fontWeight:800,fontSize:14}}>{meta.emoji} {meta.label}</span>
                <div style={{flex:1,height:1,background:S.border}}/>
                <span style={{color:S.muted,fontSize:11}}>{items.length}</span>
              </div>
              {items.map(r=><RewardCard key={r.id} reward={r} coins={coins} onRedeem={redeem}/>)}
            </div>
          ))}
        </div>
      )}

      {/* REDEMPTION HISTORY */}
      {tab==="history"&&(
        <div>
          {myRedemptions.length===0
            ?<SCard style={{textAlign:"center",padding:40}}><div style={{fontSize:48,marginBottom:8}}>📦</div><div style={{color:S.muted}}>Sin canjes aún.</div></SCard>
            :myRedemptions.map((r,i)=>(
              <SCard key={r.id} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:S.text,fontWeight:700,fontSize:13}}>{r.reward_name||"Premio"}</div>
                    <div style={{color:S.muted,fontSize:11,marginTop:2}}>{new Date(r.created_at).toLocaleDateString("es-MX")}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{display:"flex",alignItems:"center",gap:3,justifyContent:"flex-end",marginBottom:4}}>
                      <span style={{fontSize:12}}>🪙</span>
                      <span style={{color:S.red,fontWeight:700,fontSize:13}}>-{r.coins_spent}</span>
                    </div>
                    <STag color={STATUS_COLOR[r.status]||S.muted}>{STATUS_LABEL[r.status]||r.status}</STag>
                  </div>
                </div>
                {r.notes&&<div style={{color:S.muted,fontSize:11,marginTop:6,fontStyle:"italic"}}>"{r.notes}"</div>}
              </SCard>
            ))
          }
        </div>
      )}

      {/* POINTS LOG */}
      {tab==="points"&&(
        <div>
          <SCard style={{marginBottom:12,background:`${S.accent}10`,border:`1px solid ${S.accent}30`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{color:S.text,fontWeight:700}}>Balance actual</div>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:20}}>🪙</span>
                <span style={{color:S.gold,fontWeight:900,fontSize:24}}>{coins}</span>
              </div>
            </div>
          </SCard>
          {pointsLog.length===0
            ?<SCard style={{textAlign:"center",padding:40}}><div style={{fontSize:48,marginBottom:8}}>📊</div><div style={{color:S.muted}}>Sin movimientos aún.</div></SCard>
            :pointsLog.map((p,i)=>(
              <SCard key={p.id} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{color:S.text,fontWeight:600,fontSize:13}}>{p.description||p.source}</div>
                    <div style={{color:S.muted,fontSize:11,marginTop:2}}>
                      {new Date(p.created_at).toLocaleDateString("es-MX")}
                      {p.week&&` · ${p.week}`}
                      {p.granted_by&&` · Por: ${p.granted_by}`}
                    </div>
                  </div>
                  <div style={{color:p.points>0?S.green:S.red,fontWeight:900,fontSize:16,flexShrink:0,marginLeft:8}}>
                    {p.points>0?"+":""}{p.points} 🪙
                  </div>
                </div>
              </SCard>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ─── ADMIN VIEW (Super Admin manages the store) ───────────────────────────────
function AdminStoreView({ user }) {
  const [rewards, setRewards]     = useState<any[]>([]);
  const [redemptions, setRed]     = useState<any[]>([]);
  const [allStaff, setAllStaff]   = useState<any[]>([]);
  const [tab, setTab]             = useState<"catalog"|"redemptions"|"bonus">("catalog");
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState("");
  const [form, setForm]           = useState({ name:"", description:"", emoji:"🎁", coins_cost:100, stock:10, category:"tiempo" });
  const [bonusForm, setBonusForm] = useState({ gameId:"", points:10, description:"", week:"" });
  const [editId, setEditId]       = useState<string|null>(null);
  const [editData, setEditData]   = useState<any>({});

  const showToast = (msg:string) => { setToast(msg); setTimeout(()=>setToast(""),3000); };

  useEffect(()=>{ load(); },[]);
  const load = async () => {
    setLoading(true);
    try {
      const [r, red, staff] = await Promise.all([
        db.getAllRewards(),
        db.getRedemptions(),
        db.getAllStaff(),
      ]);
      setRewards(r||[]);
      setRed(red||[]);
      setAllStaff(staff||[]);
    } catch(e){}
    setLoading(false);
  };

  const addReward = async () => {
    if (!form.name.trim()) { showToast("Escribe el nombre del premio"); return; }
    try {
      await db.createReward({ ...form });
      await load();
      setForm({ name:"", description:"", emoji:"🎁", coins_cost:100, stock:10, category:"tiempo" });
      showToast("Premio agregado");
    } catch(e){ showToast("Error al agregar premio"); }
  };

  const saveEdit = async (id:string) => {
    try {
      await db.updateReward(id, editData);
      setEditId(null);
      await load();
      showToast("Premio actualizado");
    } catch(e){ showToast("Error"); }
  };

  const toggleActive = async (r:any) => {
    try {
      await db.updateReward(r.id, { is_active: !r.is_active });
      await load();
      showToast(r.is_active?"Premio ocultado":"Premio activado");
    } catch(e){ showToast("Error"); }
  };

  const approveRedemption = async (r:any, approved:boolean) => {
    try {
      await db.updateRedemption(r.id, {
        status: approved ? "approved" : "cancelled",
        approved_by: user.gameId,
      });
      await load();
      showToast(approved?"Aprobado":"Rechazado");
    } catch(e){ showToast("Error"); }
  };

  const deliverRedemption = async (r:any) => {
    try {
      await db.updateRedemption(r.id, { status: "delivered", approved_by: user.gameId });
      await load();
      showToast("Marcado como entregado");
    } catch(e){ showToast("Error"); }
  };

  const giveBonus = async () => {
    if (!bonusForm.gameId || !bonusForm.points || !bonusForm.description) {
      showToast("Completa todos los campos"); return;
    }
    try {
      const staffArr = await db.getStaffByGameId(bonusForm.gameId);
      if (!staffArr||!staffArr[0]) { showToast("Staff no encontrado"); return; }
      const s = staffArr[0];
      const newCoins = (s.coins||0) + Number(bonusForm.points);
      await db.updateCoins(s.id, newCoins);
      await db.addPointsLog({
        staff_game_id: bonusForm.gameId,
        points: Number(bonusForm.points),
        source: "manual_bonus",
        description: bonusForm.description,
        week: bonusForm.week,
        status: "approved",
        granted_by: user.gameId,
      });
      setBonusForm({ gameId:"", points:10, description:"", week:"" });
      showToast(`+${bonusForm.points} coins asignados a ${bonusForm.gameId}`);
    } catch(e){ showToast("Error al asignar bono"); }
  };

  const inp = { width:"100%", border:`1px solid ${S.border}`, borderRadius:8, padding:"9px 11px", fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box" as any, background:S.bg, color:S.text };
  const pendingRed = redemptions.filter(r=>r.status==="pending");
  const approvedRed = redemptions.filter(r=>r.status==="approved");

  return (
    <div style={{paddingBottom:100,background:S.bg,minHeight:"100vh"}}>
      {toast&&<div style={{position:"fixed",top:56,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:toast.includes("Error")?S.red:S.green,color:"#fff",padding:"10px 22px",borderRadius:12,fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>{toast}</div>}

      <SCard style={{marginBottom:14,background:`linear-gradient(135deg,#1e1b4b,#312e81)`,border:"none"}}>
        <div style={{fontSize:28,marginBottom:4}}>⚙️</div>
        <div style={{color:S.text,fontWeight:800,fontSize:18}}>Admin — Staff Store</div>
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <div style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"6px 14px",textAlign:"center"}}>
            <div style={{color:S.yellow,fontWeight:900,fontSize:18}}>{pendingRed.length}</div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:9}}>Canjes pendientes</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"6px 14px",textAlign:"center"}}>
            <div style={{color:S.accent,fontWeight:900,fontSize:18}}>{approvedRed.length}</div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:9}}>Aprobados</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"6px 14px",textAlign:"center"}}>
            <div style={{color:S.green,fontWeight:900,fontSize:18}}>{rewards.filter(r=>r.is_active).length}</div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:9}}>Premios activos</div>
          </div>
        </div>
      </SCard>

      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto"}}>
        {[
          {id:"catalog",     label:"📦 Catálogo"},
          {id:"redemptions", label:`🎁 Canjes (${pendingRed.length} pend.)`},
          {id:"bonus",       label:"💰 Dar Bono"},
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id as any)} style={{padding:"8px 14px",borderRadius:9,border:`1px solid ${tab===t.id?S.accent:S.border}`,background:tab===t.id?`${S.accent}22`:S.card,color:tab===t.id?"#a5b4fc":S.muted,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{t.label}</button>
        ))}
      </div>

      {/* CATALOG */}
      {tab==="catalog"&&(
        <div>
          {/* Add new */}
          <SCard style={{marginBottom:14,border:`1px solid ${S.accent}44`}}>
            <div style={{color:S.accent,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>AGREGAR PREMIO</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div style={{gridColumn:"1/-1"}}><div style={{color:S.muted,fontSize:10,marginBottom:3}}>NOMBRE</div><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={inp} placeholder="Nombre del premio"/></div>
              <div style={{gridColumn:"1/-1"}}><div style={{color:S.muted,fontSize:10,marginBottom:3}}>DESCRIPCIÓN</div><input value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} style={inp} placeholder="Descripción breve"/></div>
              <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>EMOJI</div><input value={form.emoji} onChange={e=>setForm(p=>({...p,emoji:e.target.value}))} style={inp}/></div>
              <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>COINS 🪙</div><input type="number" value={form.coins_cost} onChange={e=>setForm(p=>({...p,coins_cost:+e.target.value}))} style={inp}/></div>
              <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>STOCK</div><input type="number" value={form.stock} onChange={e=>setForm(p=>({...p,stock:+e.target.value}))} style={inp}/></div>
              <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>CATEGORÍA</div>
                <select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={inp}>
                  {Object.entries(CATS).map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
                </select>
              </div>
            </div>
            <SBtn onClick={addReward} style={{width:"100%",padding:11}}>AGREGAR PREMIO</SBtn>
          </SCard>

          {/* Existing rewards */}
          {loading&&<div style={{textAlign:"center",color:S.muted,padding:20}}>Cargando...</div>}
          {rewards.map(r=>(
            <SCard key={r.id} style={{marginBottom:10,opacity:r.is_active?1:0.55}}>
              {editId===r.id?(
                <div>
                  <div style={{color:S.accent,fontSize:11,fontWeight:700,marginBottom:10}}>EDITANDO: {r.name}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                    <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>NOMBRE</div><input value={editData.name??r.name} onChange={e=>setEditData(p=>({...p,name:e.target.value}))} style={inp}/></div>
                    <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>EMOJI</div><input value={editData.emoji??r.emoji} onChange={e=>setEditData(p=>({...p,emoji:e.target.value}))} style={inp}/></div>
                    <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>COINS</div><input type="number" value={editData.coins_cost??r.coins_cost} onChange={e=>setEditData(p=>({...p,coins_cost:+e.target.value}))} style={inp}/></div>
                    <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>STOCK</div><input type="number" value={editData.stock??r.stock} onChange={e=>setEditData(p=>({...p,stock:+e.target.value}))} style={inp}/></div>
                    <div style={{gridColumn:"1/-1"}}><div style={{color:S.muted,fontSize:10,marginBottom:3}}>DESCRIPCIÓN</div><input value={editData.description??r.description??""} onChange={e=>setEditData(p=>({...p,description:e.target.value}))} style={inp}/></div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <SBtn onClick={()=>saveEdit(r.id)} color={S.green} style={{flex:1}}>Guardar</SBtn>
                    <SBtn onClick={()=>setEditId(null)} color={S.muted} style={{flex:1}}>Cancelar</SBtn>
                  </div>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{fontSize:28,flexShrink:0}}>{r.emoji||"🎁"}</div>
                  <div style={{flex:1}}>
                    <div style={{color:S.text,fontWeight:700,fontSize:13}}>{r.name}</div>
                    <div style={{display:"flex",gap:6,marginTop:3,alignItems:"center"}}>
                      <span style={{fontSize:12}}>🪙</span>
                      <span style={{color:S.gold,fontWeight:700,fontSize:12}}>{r.coins_cost}</span>
                      <span style={{color:S.muted,fontSize:11}}>· Stock: {r.stock}</span>
                      <span style={{color:S.muted,fontSize:11}}>· {CATS[r.category]?.emoji||""} {CATS[r.category]?.label||r.category}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
                    <SBtn onClick={()=>{setEditId(r.id);setEditData({});}} color={S.accent} sm>Editar</SBtn>
                    <SBtn onClick={()=>toggleActive(r)} color={r.is_active?S.muted:S.green} sm>{r.is_active?"Ocultar":"Activar"}</SBtn>
                  </div>
                </div>
              )}
            </SCard>
          ))}
        </div>
      )}

      {/* REDEMPTIONS */}
      {tab==="redemptions"&&(
        <div>
          {/* Pending */}
          {pendingRed.length>0&&(
            <div style={{marginBottom:16}}>
              <div style={{color:S.yellow,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:10}}>⏳ PENDIENTES DE APROBACIÓN</div>
              {pendingRed.map(r=>(
                <SCard key={r.id} style={{marginBottom:10,border:`1px solid ${S.yellow}44`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{color:S.text,fontWeight:700,fontSize:13}}>{r.staff_game_id}</div>
                      <div style={{color:S.text,fontSize:13,marginTop:2}}>→ {r.reward_name}</div>
                      <div style={{color:S.muted,fontSize:11,marginTop:2}}>{new Date(r.created_at).toLocaleDateString("es-MX")}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:3}}>
                      <span style={{fontSize:14}}>🪙</span>
                      <span style={{color:S.gold,fontWeight:900,fontSize:16}}>{r.coins_spent}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <SBtn onClick={()=>approveRedemption(r,true)}  color={S.green} style={{flex:1}} sm>✓ Aprobar</SBtn>
                    <SBtn onClick={()=>approveRedemption(r,false)} color={S.red}   style={{flex:1}} sm>✗ Rechazar</SBtn>
                  </div>
                </SCard>
              ))}
            </div>
          )}

          {/* Approved — mark as delivered */}
          {approvedRed.length>0&&(
            <div style={{marginBottom:16}}>
              <div style={{color:S.accent,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:10}}>✅ APROBADOS — MARCAR ENTREGADO</div>
              {approvedRed.map(r=>(
                <SCard key={r.id} style={{marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{color:S.text,fontWeight:600,fontSize:13}}>{r.staff_game_id} → {r.reward_name}</div>
                    <div style={{color:S.muted,fontSize:11}}>{new Date(r.created_at).toLocaleDateString("es-MX")}</div>
                  </div>
                  <SBtn onClick={()=>deliverRedemption(r)} color={S.green} sm>Entregado</SBtn>
                </SCard>
              ))}
            </div>
          )}

          {/* All history */}
          <div>
            <div style={{color:S.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:10}}>📂 HISTORIAL COMPLETO</div>
            {redemptions.filter(r=>r.status==="delivered"||r.status==="cancelled").map(r=>(
              <SCard key={r.id} style={{marginBottom:8,opacity:0.7}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:S.text,fontSize:12,fontWeight:600}}>{r.staff_game_id} → {r.reward_name}</div>
                    <div style={{color:S.muted,fontSize:11}}>{new Date(r.created_at).toLocaleDateString("es-MX")}</div>
                  </div>
                  <span style={{padding:"2px 8px",borderRadius:5,background:r.status==="delivered"?`${S.green}22`:`${S.red}22`,color:r.status==="delivered"?S.green:S.red,fontSize:10,fontWeight:700}}>
                    {r.status==="delivered"?"Entregado":"Cancelado"}
                  </span>
                </div>
              </SCard>
            ))}
          </div>
        </div>
      )}

      {/* MANUAL BONUS */}
      {tab==="bonus"&&(
        <SCard>
          <div style={{color:S.accent,fontSize:11,letterSpacing:2,fontWeight:700,marginBottom:12}}>DAR BONO DE COINS</div>
          <div style={{marginBottom:10}}>
            <div style={{color:S.muted,fontSize:10,marginBottom:3}}>STAFF MEMBER (Game ID)</div>
            <select value={bonusForm.gameId} onChange={e=>setBonusForm(p=>({...p,gameId:e.target.value}))} style={inp}>
              <option value="">Selecciona un miembro del staff</option>
              {allStaff.filter(s=>s.is_active).map(s=><option key={s.id} value={s.game_id}>{s.game_id} — {s.full_name} ({s.role})</option>)}
            </select>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>COINS A DAR 🪙</div><input type="number" value={bonusForm.points} onChange={e=>setBonusForm(p=>({...p,points:+e.target.value}))} style={inp}/></div>
            <div><div style={{color:S.muted,fontSize:10,marginBottom:3}}>SEMANA (opcional)</div><input value={bonusForm.week} onChange={e=>setBonusForm(p=>({...p,week:e.target.value}))} style={inp} placeholder="ej. Week_18_2025"/></div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{color:S.muted,fontSize:10,marginBottom:3}}>MOTIVO</div>
            <textarea value={bonusForm.description} onChange={e=>setBonusForm(p=>({...p,description:e.target.value}))} rows={3} style={{...inp,resize:"vertical" as any}} placeholder="Por qué se otorga este bono..."/>
          </div>
          <SBtn onClick={giveBonus} disabled={!bonusForm.gameId||!bonusForm.description} style={{width:"100%",padding:12}}>
            DAR BONO DE COINS
          </SBtn>
        </SCard>
      )}
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function StaffStore({ user, staffProfile, onCoinsUpdate }) {
  const isSA = user?.role === "superadmin";

  // SA sees both: admin panel + their own store
  if (isSA) {
    const [view, setView] = useState<"admin"|"store">("admin");
    return (
      <div style={{background:S.bg,minHeight:"100vh"}}>
        <div style={{display:"flex",gap:6,marginBottom:14,padding:"14px 0 0"}}>
          {[{id:"admin",label:"⚙️ Gestionar"},{id:"store",label:"🏪 Mi Tienda"}].map(t=>(
            <button key={t.id} onClick={()=>setView(t.id as any)} style={{padding:"8px 14px",borderRadius:9,border:`1px solid ${view===t.id?S.accent:S.border}`,background:view===t.id?`${S.accent}22`:S.card,color:view===t.id?"#a5b4fc":S.muted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{t.label}</button>
          ))}
        </div>
        {view==="admin"&&<AdminStoreView user={user}/>}
        {view==="store"&&<StoreView user={user} staffProfile={staffProfile} onCoinsUpdate={onCoinsUpdate}/>}
      </div>
    );
  }

  return <StoreView user={user} staffProfile={staffProfile} onCoinsUpdate={onCoinsUpdate}/>;
}
