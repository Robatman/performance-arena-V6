import { useState, useEffect } from "react";

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

type ReferralStatus = "pending" | "hired" | "rejected";

interface Referral {
  id: string;
  referred_by_game_id: string;
  referred_by_name?: string;
  referred_name: string;
  referred_phone?: string;
  referred_email?: string;
  status: ReferralStatus;
  submitted_at: string;
  resolved_at?: string;
  notes?: string;
  pts_awarded: number;
}

const STATUS_CONFIG = {
  pending:  { label:"Pendiente",  color:"#fbbf24", bg:"#2d2000" },
  hired:    { label:"Contratado", color:"#4ade80", bg:"#052e16" },
  rejected: { label:"No avanzó",  color:"#f87171", bg:"#2d1515" },
};

export default function ReferralsPanel({ isAdmin = false }: { isAdmin?: boolean }) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all"|ReferralStatus>("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string|null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRef, setNewRef] = useState({ referred_name:"", referred_phone:"", referred_email:"", notes:"" });
  const [currentGameId, setCurrentGameId] = useState("");
  const [toast, setToast] = useState<{msg:string;type:"success"|"error"}|null>(null);

  useEffect(() => {
    fetchReferrals();
    const stored = localStorage.getItem("game_id") || "";
    setCurrentGameId(stored);
  }, []);

  const showToast = (msg: string, type: "success"|"error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchReferrals = async () => {
    setLoading(true);
    try {
      const data = await sbFetch("referrals?select=*,profiles!referrals_referred_by_game_id_fkey(username)&order=submitted_at.desc");
      setReferrals((data||[]).map((r: any) => ({
        ...r, referred_by_name: r.profiles?.username || r.referred_by_game_id,
      })));
    } catch(e) { setReferrals([]); }
    setLoading(false);
  };

  const handleSubmitReferral = async () => {
    if (!newRef.referred_name.trim()) { showToast("El nombre es obligatorio.", "error"); return; }
    setActionLoading("new");
    try {
      await sbFetch("referrals", { method:"POST", body: JSON.stringify({
        referred_by_game_id: currentGameId,
        referred_name: newRef.referred_name.trim(),
        referred_phone: newRef.referred_phone.trim()||null,
        referred_email: newRef.referred_email.trim()||null,
        status:"pending", pts_awarded:1,
        notes: newRef.noted?.trim()||null,
        submitted_at: new Date().toISOString(),
      })});
      showToast("✅ Referido registrado — +1 pt acreditado", "success");
      setNewRef({ referred_name:"", referred_phone:"", referred_email:"", notes:"" });
      setShowAddForm(false);
      fetchReferrals();
    } catch(e: any) { showToast(`Error: ${e.message}`, "error"); }
    setActionLoading(null);
  };

  const handleMarkHired = async (ref: Referral) => {
    if (ref.pts_awarded >= 5) { showToast("Ya tiene los 5 pts acreditados.", "error"); return; }
    setActionLoading(ref.id);
    try {
      await sbFetch(`referrals?id=eq.${ref.id}`, { method:"PATCH",
        body: JSON.stringify({ status:"hired", resolved_at:new Date().toISOString(), pts_awarded:5 }) });
      showToast(`✅ Contratado — +4 pts para ${ref.referred_by_name}`, "success");
      fetchReferrals();
    } catch(e: any) { showToast(`Error: ${e.message}`, "error"); }
    setActionLoading(null);
  };

  const handleMarkRejected = async (ref: Referral) => {
    setActionLoading(ref.id);
    try {
      await sbFetch(`referrals?id=eq.${ref.id}`, { method:"PATCH",
        body: JSON.stringify({ status:"rejected", resolved_at:new Date().toISOString() }) });
      showToast("Marcado como no avanzó.", "success");
      fetchReferrals();
    } catch(e: any) { showToast(`Error: ${e.message}`, "error"); }
    setActionLoading(null);
  };

  const filtered = referrals.filter(r => {
    const matchF = filter==="all" || r.status===filter;
    const matchS = search==="" || r.referred_name.toLowerCase().includes(search.toLowerCase()) || (r.referred_by_name||"").toLowerCase().includes(search.toLowerCase());
    return matchF && matchS;
  });

  const counts = {
    all: referrals.length,
    pending: referrals.filter(r=>r.status==="pending").length,
    hired: referrals.filter(r=>r.status==="hired").length,
    rejected: referrals.filter(r=>r.status==="rejected").length,
  };

  const inp = { width:"100%", border:"1px solid #1e3a5f", borderRadius:6, padding:"9px 12px", color:"#e2e8f0", fontSize:14, outline:"none", background:"#0f172a", boxSizing:"border-box" as const };

  return (
    <div style={{padding:16,maxWidth:1100,margin:"0 auto",position:"relative",paddingBottom:100}}>
      {toast&&(
        <div style={{position:"fixed",top:20,right:20,zIndex:9999,padding:"12px 20px",borderRadius:8,border:"1px solid",fontWeight:600,fontSize:14,boxShadow:"0 4px 20px rgba(0,0,0,0.4)",
          background:toast.type==="success"?"#052e16":"#2d1515",
          borderColor:toast.type==="success"?"#14532d":"#7f1d1d",
          color:toast.type==="success"?"#4ade80":"#f87171"}}>
          {toast.msg}
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
        <div>
          <h2 style={{color:"#f1f5f9",fontSize:20,fontWeight:700,margin:"0 0 4px"}}>🤝 Panel de Referidos</h2>
          <p style={{color:"#64748b",fontSize:13,margin:0}}>{counts.pending} pendientes de revisión</p>
        </div>
        {!isAdmin&&(
          <button onClick={()=>setShowAddForm(!showAddForm)}
            style={{background:"#1d4ed8",color:"#fff",border:"none",padding:"10px 20px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>
            + Registrar referido
          </button>
        )}
      </div>

      {showAddForm&&(
        <div style={{background:"#0c2240",border:"1px solid #1e3a5f",borderRadius:12,padding:20,marginBottom:16}}>
          <h3 style={{color:"#93c5fd",fontWeight:700,margin:"0 0 14px"}}>Nuevo Referido</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[{l:"Nombre completo *",k:"referred_name",p:"Juan García"},{l:"Teléfono",k:"referred_phone",p:"555-1234"},{l:"Email",k:"referred_email",p:"juan@email.com"},{l:"Notas",k:"notes",p:"Ex-compañero..."}].map(f=>(
              <div key={f.k}>
                <div style={{color:"#94a3b8",fontSize:11,fontWeight:600,marginBottom:5}}>{f.l}</div>
                <input style={inp} placeholder={f.p} value={(newRef as any)[f.k]}
                  onChange={e=>setNewRef(p=>({...p,[f.k]:e.target.value}))}/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
            <p style={{color:"#64748b",fontSize:12,margin:0}}>Al enviar recibirás <b style={{color:"#60a5fa"}}>+1 pt</b>. Si es contratado el Admin aprobará <b style={{color:"#4ade80"}}>+4 pts</b> adicionales.</p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowAddForm(false)} style={{background:"transparent",color:"#94a3b8",border:"1px solid #334155",padding:"9px 18px",borderRadius:7,cursor:"pointer",fontWeight:600,fontSize:13}}>Cancelar</button>
              <button onClick={handleSubmitReferral} disabled={actionLoading==="new"}
                style={{background:"#1d4ed8",color:"#fff",border:"none",padding:"9px 18px",borderRadius:7,cursor:"pointer",fontWeight:700,fontSize:13}}>
                {actionLoading==="new"?"Enviando...":"Registrar (+1pt)"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {(["all","pending","hired","rejected"] as const).map(s=>(
          <button key={s} onClick={()=>setFilter(s)}
            style={{background:filter===s?"#0c2240":"#1e293b",border:`1px solid ${filter===s?"#3b82f6":"#334155"}`,borderRadius:10,padding:"10px 16px",
              display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer",minWidth:70}}>
            <span style={{fontSize:20,fontWeight:700,color:"#60a5fa"}}>{counts[s]}</span>
            <span style={{fontSize:10,color:"#64748b"}}>{s==="all"?"Todos":STATUS_CONFIG[s as ReferralStatus]?.label}</span>
          </button>
        ))}
        <div style={{marginLeft:"auto",background:"#1e293b",border:"1px solid #334155",borderRadius:10,padding:"10px 16px",display:"flex",flexDirection:"column",alignItems:"center"}}>
          <span style={{fontSize:20,fontWeight:700,color:"#4ade80"}}>{referrals.reduce((a,r)=>a+r.pts_awarded,0)}</span>
          <span style={{fontSize:10,color:"#64748b"}}>Pts entregados</span>
        </div>
      </div>

      <input style={{...inp,marginBottom:14,width:"100%"}} placeholder="🔍  Buscar por nombre o agente..."
        value={search} onChange={e=>setSearch(e.target.value)}/>

      {loading?(
        <div style={{color:"#64748b",padding:40,textAlign:"center"}}>Cargando referidos...</div>
      ):filtered.length===0?(
        <div style={{color:"#475569",padding:40,textAlign:"center"}}>No hay referidos que coincidan.</div>
      ):(
        <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #1e3a5f"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr>{["Referido por","Candidato","Contacto","Fecha","Status","Pts","Acciones"].map(h=>(
              <th key={h} style={{background:"#0c2240",color:"#93c5fd",fontWeight:600,padding:"10px 14px",textAlign:"left"}}>{h}</th>
            ))}</tr></thead>
            <tbody>{filtered.map((r,i)=>{
              const sc=STATUS_CONFIG[r.status];
              return(
                <tr key={r.id} style={{background:i%2===0?"#0f172a":"#0c1a2e"}}>
                  <td style={{padding:"10px 14px"}}>
                    <span style={{color:"#e2e8f0",fontWeight:600}}>{r.referred_by_name}</span>
                    <br/><span style={{color:"#475569",fontSize:11}}>{r.referred_by_game_id}</span>
                  </td>
                  <td style={{padding:"10px 14px"}}>
                    <span style={{color:"#e2e8f0",fontWeight:600}}>{r.referred_name}</span>
                    {r.notes&&<><br/><span style={{color:"#475569",fontSize:11}}>{r.notes}</span></>}
                  </td>
                  <td style={{padding:"10px 14px",color:"#64748b",fontSize:12}}>
                    {r.referred_phone||"-"}
                    {r.referred_email&&<><br/>{r.referred_email}</>}
                  </td>
                  <td style={{padding:"10px 14px",color:"#94a3b8",fontSize:12}}>
                    {new Date(r.submitted_at).toLocaleDateString("es-MX")}
                    {r.resolved_at&&<><br/><span style={{color:"#475569"}}>→ {new Date(r.resolved_at).toLocaleDateString("es-MX")}</span></>}
                  </td>
                  <td style={{padding:"10px 14px"}}>
                    <span style={{padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:700,border:"1px solid",
                      background:sc.bg,color:sc.color,borderColor:sc.color+"44"}}>{sc.label}</span>
                  </td>
                  <td style={{padding:"10px 14px",textAlign:"center"}}>
                    <span style={{fontWeight:700,color:r.pts_awarded>=5?"#4ade80":"#60a5fa"}}>{r.pts_awarded}/5</span>
                  </td>
                  <td style={{padding:"10px 14px"}}>
                    {isAdmin&&r.status==="pending"&&(
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>handleMarkHired(r)} disabled={actionLoading===r.id}
                          style={{background:"#052e16",color:"#4ade80",border:"1px solid #14532d",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontWeight:600,fontSize:12}}>
                          ✅ Contratar
                        </button>
                        <button onClick={()=>handleMarkRejected(r)} disabled={actionLoading===r.id}
                          style={{background:"#2d1515",color:"#f87171",border:"1px solid #7f1d1d",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontWeight:600,fontSize:12}}>
                          ✕
                        </button>
                      </div>
                    )}
                    {r.status!=="pending"&&(
                      <span style={{color:"#475569",fontSize:12,fontStyle:"italic"}}>
                        {r.status==="hired"?"✅ Aprobado":"✕ Cerrado"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
