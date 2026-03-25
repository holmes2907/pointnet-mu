import { supabase } from "./supabase";
import React, { useState, useEffect, useRef } from "react";
import { Home, ArrowDownCircle, ArrowUpCircle, ShieldCheck, GitBranch,
         MessageCircle, LogOut, Settings, Share2, History, Bell, User, FileText } from "lucide-react";

// ── CONSTANTS ──────────────────────────────────
const ADMIN_ID       = "admin";
const ADMIN_PASSWORD = "Admin1234!";
const TELEGRAM_URL   = "https://t.me/pointnetjp";
const DEPOSIT_TRC    = { addr:"TWtzyQm8vZmPPTwzZtmSJHBudA21FE9K4c",          net:"TRC-20 (TRON)",     color:"#10b981" };
const DEPOSIT_ERC    = { addr:"0xdAC17F958D2ee523a2206206994597C13D831ec7", net:"ERC-20 (Ethereum)", color:"#6366f1" };

// ── 祝日・平日判定 ─────────────────────────────
const JP_HOLIDAYS_2025 = new Set([
  "2025-01-01","2025-01-13","2025-02-11","2025-02-23",
  "2025-02-24","2025-03-20","2025-04-29","2025-05-03",
  "2025-05-04","2025-05-05","2025-05-06","2025-07-21",
  "2025-08-11","2025-09-15","2025-09-23","2025-10-13",
  "2025-11-03","2025-11-23","2025-11-24","2025-12-23",
]);
const JP_HOLIDAYS_2026 = new Set([
  "2026-01-01","2026-01-12","2026-02-11","2026-02-23",
  "2026-03-20","2026-04-29","2026-05-03","2026-05-04",
  "2026-05-05","2026-05-06","2026-07-20","2026-08-11",
  "2026-09-21","2026-09-22","2026-09-23","2026-10-12",
  "2026-11-03","2026-11-23","2026-12-23",
]);
const JP_HOLIDAYS_2027 = new Set([
  "2027-01-01","2027-01-11","2027-02-11","2027-02-23",
  "2027-03-21","2027-04-29","2027-05-03","2027-05-04",
  "2027-05-05","2027-07-19","2027-08-11","2027-09-20",
  "2027-09-23","2027-10-11","2027-11-03","2027-11-23",
]);
const isJPHoliday = (dateStr) => {
  return JP_HOLIDAYS_2025.has(dateStr) || JP_HOLIDAYS_2026.has(dateStr) || JP_HOLIDAYS_2027.has(dateStr);
};
const isWeekday = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const dow = d.getDay(); // 0=日,6=土
  if (dow === 0 || dow === 6) return false;
  if (isJPHoliday(dateStr)) return false;
  return true;
};

const REFERRAL_RATES = [0.10, 0.05, 0.03, 0.02]; // 1段階10%, 2段階5%, 3段階3%, 4段階2%（5段階以降なし） // 1段階10%, 2段階6%, 3段階3%, 4段階以降1% // 1段階10%, 2段階7%, 3段階3%, 4段階以降1%
// n段階目のレートを返す（3段階以降は3%固定）
const getReferralRate = (depth) => depth < REFERRAL_RATES.length ? REFERRAL_RATES[depth] : 0; // 4段階まで

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30分操作なしで自動ログアウト

const CLAIM_INTERVAL_MS   = 23 * 60 * 60 * 1000;
const WD_MAX_AMOUNT       = 100000; // 1回の出金上限pt
const WD_RESET_HOUR       = 10;     // 毎日10:00にリセット

// 今日の出金リセット基準時刻（10:00）を取得
const todayWdKey = () => {
  const now = new Date();
  const reset = new Date();
  reset.setHours(WD_RESET_HOUR, 0, 0, 0);
  // 10:00前なら昨日のキーを使う
  if (now < reset) reset.setDate(reset.getDate() - 1);
  return reset.toISOString().slice(0, 10) + "_" + WD_RESET_HOUR;
};
const nowMs = () => Date.now();
const today = () => new Date().toISOString().slice(0,10);
const now   = () => new Date().toISOString().slice(0,16).replace("T"," ");
const fl1   = n => Math.floor(n * 10) / 10;
const uid   = () => "u" + Math.random().toString(36).slice(2,8);

// ── RANKS ──────────────────────────────────────
const RANKS = [
  { id:"diamond",  label:"ダイヤモンド", minReferrals:20, minRefRankId:"diamond",  minDeposit:50000, dailyRate:0.7, color:"#67e8f9", icon:"💎", bg:"#67e8f918" },
  { id:"platinum", label:"プラチナ",     minReferrals:15, minRefRankId:"platinum", minDeposit:30000, dailyRate:0.6, color:"#e2e8f0", icon:"◆",  bg:"#e2e8f018" },
  { id:"gold",     label:"ゴールド",     minReferrals:10, minRefRankId:"gold",     minDeposit:15000, dailyRate:0.5, color:"#fbbf24", icon:"★",  bg:"#fbbf2418" },
  { id:"silver",   label:"シルバー",     minReferrals:5,  minRefRankId:"silver",   minDeposit:5000,  dailyRate:0.4, color:"#cbd5e1", icon:"◈",  bg:"#cbd5e118" },
  { id:"bronze",   label:"ブロンズ",     minReferrals:2,  minRefRankId:"bronze",   minDeposit:1000,  dailyRate:0.3, color:"#f97316", icon:"●",  bg:"#f9731618" },
  { id:"starter",  label:"スターター",   minReferrals:0,  minRefRankId:"starter",  minDeposit:0,     dailyRate:0.2, color:"#6b7280", icon:"○",  bg:"#6b728018" },
];
const rankIndex = id => RANKS.findIndex(r => r.id === id);
const getMemberRankSimple = (member, members) => {
  const dep = member.depositPt;
  const rc  = members.filter(m => m.referrerId === member.id).length;
  return RANKS.find(r => rc >= r.minReferrals && dep >= r.minDeposit) || RANKS[RANKS.length-1];
};
const getMemberRank = (member, members) => {
  const dep = member.depositPt;
  const map = {};
  RANKS.forEach(r => {
    map[r.id] = members.filter(m => {
      if (m.referrerId !== member.id) return false;
      return rankIndex(getMemberRankSimple(m, members).id) <= rankIndex(r.id);
    }).length;
  });
  return RANKS.find(r => (map[r.minRefRankId]||0) >= r.minReferrals && dep >= r.minDeposit) || RANKS[RANKS.length-1];
};
const getNextRank = rank => { const i = RANKS.findIndex(r => r.id === rank.id); return i > 0 ? RANKS[i-1] : null; };
const maskId = id => { if(!id) return "??"; return id.slice(0,2) + "*".repeat(Math.max(1, id.length-2)); };

// ── SEED DATA ──────────────────────────────────
const SEED = [
  { id:"u001", userId:"u001", name:"田中 太郎",   email:"", password:"pass123", referrerId:null,   depositPt:10000, withdrawablePt:320, lastClaim:null, lastClaimMs:0, lastWdKey:null, status:"active", registeredAddresses:[], messages:[], loginHistory:[{date:"2024-04-22 09:15",device:"iPhone"}], kyc:{basicDone:false,idStatus:"none"}, joinedAt:"2024-01-10" },
  { id:"u002", userId:"u002", name:"鈴木 花子",   email:"", password:"pass123", referrerId:"u001", depositPt:2000,  withdrawablePt:140, lastClaim:null, lastClaimMs:0, status:"active", messages:[], loginHistory:[], kyc:{basicDone:false,idStatus:"none"}, joinedAt:"2024-02-15" },
  { id:"u003", userId:"u003", name:"佐藤 次郎",   email:"", password:"pass123", referrerId:"u001", depositPt:1000,  withdrawablePt:50,  lastClaim:null, lastClaimMs:0, status:"active", messages:[], loginHistory:[], kyc:{basicDone:false,idStatus:"none"}, joinedAt:"2024-03-01" },
  { id:"u004", userId:"u004", name:"高橋 美咲",   email:"", password:"pass123", referrerId:"u002", depositPt:500,   withdrawablePt:20,  lastClaim:null, lastClaimMs:0, status:"active", messages:[], loginHistory:[], kyc:{basicDone:false,idStatus:"none"}, joinedAt:"2024-03-20" },
  { id:"u005", userId:"u005", name:"渡辺 健",     email:"", password:"pass123", referrerId:"u002", depositPt:300,   withdrawablePt:0,   lastClaim:null, lastClaimMs:0, status:"active", messages:[], loginHistory:[], kyc:{basicDone:false,idStatus:"none"}, joinedAt:"2024-04-05" },
  { id:"u006", userId:"u006", name:"伊藤 さくら", email:"", password:"pass123", referrerId:"u001", depositPt:400,   withdrawablePt:0,   lastClaim:null, lastClaimMs:0, status:"active", messages:[], loginHistory:[], kyc:{basicDone:false,idStatus:"none"}, joinedAt:"2024-04-10" },
  { id:"u007", userId:"u007", name:"山本 剛",     email:"", password:"pass123", referrerId:"u001", depositPt:300,   withdrawablePt:0,   lastClaim:null, lastClaimMs:0, status:"active", messages:[], loginHistory:[], kyc:{basicDone:false,idStatus:"none"}, joinedAt:"2024-04-18" },
  { id:"u008", userId:"u008", name:"中村 愛",     email:"", password:"pass123", referrerId:"u001", depositPt:200,   withdrawablePt:0,   lastClaim:null, lastClaimMs:0, status:"active", messages:[], loginHistory:[], kyc:{basicDone:false,idStatus:"none"}, joinedAt:"2024-04-22" },
];
const SEED_WD = [
  { id:"wd001", userId:"u001", amount:1000, payout:990, fee:10, network:"TRC-20", address:"TWtzyQm8...addr1", status:"承認",   createdAt:"2024-04-01 10:00", processedAt:"2024-04-02" },
  { id:"wd002", userId:"u001", amount:500,  payout:495, fee:5,  network:"TRC-20", address:"TWtzyQm8...addr1", status:"審査中", createdAt:"2024-04-20 15:30", processedAt:null },
];
const SEED_ADMIN_LOGS = [
  { id:"al001", date:"2024-04-22 09:00", action:"ログイン", ip:"192.168.1.1" },
];

const SEED_NOTICES = [
  { id:"n001", title:"サービス開始のお知らせ", body:"POINTNETへようこそ！毎日報酬受取ボタンを押すことで出金可能ポイントが貯まります。", date:"2024-04-01", important:true },
  { id:"n002", title:"紹介報酬プログラムについて", body:"紹介した会員が入金した際、入金額の20%があなたの出金可能ポイントに付与されます。", date:"2024-04-05", important:false },
];

// ── PALETTE ────────────────────────────────────
const C = {
  bg:"#06080f", surface:"#0d1220", card:"#111827",
  border:"#1e2d45", accent:"#38bdf8", accent2:"#818cf8",
  green:"#34d399", red:"#f87171", yellow:"#fbbf24",
  muted:"#374151", text:"#e2e8f0", sub:"#94a3b8",
  // グラデーション用
  grad1:"linear-gradient(135deg,#38bdf8,#818cf8)",
  grad2:"linear-gradient(135deg,#34d399,#38bdf8)",
};
const sh = {
  card:  { background:C.card, border:`1px solid ${C.border}`, borderRadius:16, boxShadow:"0 4px 24px #00000030" },
  label: { fontSize:11, color:C.sub, marginBottom:6, display:"block", letterSpacing:1.5, textTransform:"uppercase" },
  input: { width:"100%", background:"#080e1a", border:`1px solid ${C.border}`, borderRadius:10, padding:"13px 16px", color:C.text, fontSize:15, boxSizing:"border-box", outline:"none", transition:"border-color .2s" },
  btn:   v => ({
    background: v==="accent" ? "linear-gradient(135deg,#38bdf8,#818cf8)"
              : v==="green"  ? "linear-gradient(135deg,#34d399,#10b981)"
              : v==="ghost"  ? "transparent" : C.surface,
    color: v==="accent"||v==="green" ? "#fff" : C.text,
    border: v==="ghost" ? `1px solid ${C.border}` : "none",
    borderRadius:12, padding:"13px 20px", cursor:"pointer",
    fontWeight:700, fontSize:15, width:"100%", marginTop:8,
    letterSpacing:0.5, boxShadow: v==="accent"||v==="green" ? "0 4px 20px #38bdf830" : "none",
    transition:"all .2s",
  }),
  badge: c => ({ background:c+"28", color:c, padding:"3px 12px", borderRadius:99, fontSize:11, fontWeight:700, border:`1px solid ${c}44` }),
  title: m => ({ fontSize:m?18:22, fontWeight:800, marginBottom:m?16:24, background:"linear-gradient(135deg,#38bdf8,#818cf8)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", letterSpacing:2 }),
  th:    { padding:"10px 14px", fontSize:11, color:C.sub, fontWeight:700, letterSpacing:1.5, borderBottom:`1px solid ${C.border}`, textAlign:"left", background:"#0a0f1a", textTransform:"uppercase" },
  td:    { padding:"11px 14px", fontSize:12, color:C.text, borderBottom:`1px solid ${C.border}` },
};

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 640);
  useEffect(() => {
    const f = () => setM(window.innerWidth < 640);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return m;
}

// ── CSV HELPER ─────────────────────────────────
function downloadCSV(rows, filename) {
  const bom = "\uFEFF";
  const csv = bom + rows.map(r =>
    r.map(v => {
      const s = v == null ? "" : String(v);
      return (s.includes(",") || s.includes('"')) ? `"${s.replace(/"/g,'""')}"` : s;
    }).join(",")
  ).join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── QR CODE ────────────────────────────────────
function QRCode({ value, size=120 }) {
  const seed = value.split("").reduce((a,c) => a + c.charCodeAt(0), 0);
  const cells = 21, cell = (size-12)/cells, grid = [];
  for (let r=0; r<cells; r++) {
    for (let c2=0; c2<cells; c2++) {
      const inF = (r<7&&c2<7)||(r<7&&c2>=cells-7)||(r>=cells-7&&c2<7);
      const onB = inF && (r===0||r===6||c2===0||c2===6||(r>=2&&r<=4&&c2>=2&&c2<=4));
      if (inF ? onB : (((r*31+c2*17+seed)%3)===0)) grid.push({r,c:c2});
    }
  }
  return (
    <div style={{width:size,height:size,background:"#fff",borderRadius:8,padding:6,position:"relative",flexShrink:0,margin:"0 auto"}}>
      {grid.map(({r,c:c2},i) => (
        <div key={i} style={{position:"absolute",left:6+c2*cell,top:6+r*cell,width:cell-0.5,height:cell-0.5,background:"#000"}}/>
      ))}
    </div>
  );
}

function Avatar({ name, size=32 }) {
  const init = (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2);
  return <div style={{width:size,height:size,borderRadius:"50%",background:C.accent2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:700,color:"#fff",flexShrink:0}}>{init}</div>;
}

function RankBadge({ rank, size="md" }) {
  const fs = size==="sm"?11:size==="lg"?15:13;
  return <span style={{background:`linear-gradient(135deg,${rank.color}18,${rank.color}08)`,color:rank.color,border:`1px solid ${rank.color}55`,padding:size==="lg"?"5px 16px":"3px 10px",borderRadius:99,fontSize:fs,fontWeight:700,letterSpacing:1,whiteSpace:"nowrap",boxShadow:`0 0 12px ${rank.color}22`}}>{rank.icon} {rank.label}</span>;
}

function PointPill({ label, value, color, sub }) {
  return (
    <div style={{background:color+"14",border:`1px solid ${color}33`,borderRadius:10,padding:"12px 14px",flex:1,minWidth:120}}>
      <div style={{fontSize:10,color:C.sub,marginBottom:3,letterSpacing:1}}>{label}</div>
      <div style={{fontSize:20,fontWeight:700,color}}>{value.toLocaleString()} <span style={{fontSize:12}}>pt</span></div>
      {sub && <div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div>}
    </div>
  );
}

// ── TREE NODE ──────────────────────────────────
function TreeNode({ member, members, depth=0 }) {
  const [open, setOpen] = useState(true);
  const children = members.filter(m => m.referrerId === member.id);
  const rank = getMemberRank(member, members);
  return (
    <div style={{marginLeft:Math.min(depth*20,80)}}>
      <div style={{position:"relative"}}>
        {depth > 0 && <div style={{position:"absolute",left:-12,top:0,bottom:0,width:1,background:rank.color+"33"}}/>}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:C.card,borderRadius:10,border:`1.5px solid ${rank.color}44`,marginBottom:6,cursor:children.length?"pointer":"default"}}
          onClick={() => setOpen(o => !o)}>
          <div style={{width:32,height:32,borderRadius:8,background:rank.color+"18",border:`1px solid ${rank.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
            {rank.icon}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:rank.color}}>{maskId(member.userId||member.id)}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:1}}>
              入金 {member.depositPt.toLocaleString()}pt
              {children.length > 0 && <span style={{marginLeft:6,color:C.green}}>· 1段階 {children.length}人</span>}
              {(()=>{ const cnt=children.reduce((a,c)=>a+members.filter(m=>m.referrerId===c.id).length,0); return cnt>0?<span style={{marginLeft:6,color:C.yellow}}>· 2段階 {cnt}人</span>:null; })()}
            </div>
          </div>
          {children.length > 0 && (
            <span style={{color:C.accent,fontSize:12,flexShrink:0,transition:"transform .2s",display:"inline-block",transform:open?"rotate(90deg)":"rotate(0deg)"}}>›</span>
          )}
        </div>
      </div>
      {open && children.map(c => <TreeNode key={c.id} member={c} members={members} depth={depth+1}/>)}
    </div>
  );
}


// ── DASHBOARD ──────────────────────────────────
function Dashboard({ user, members, withdrawals, setMembers, setUser }) {
  const mob = useIsMobile();
  const rank = getMemberRank(user, members);
  const prevRankRef = useRef(rank.id);
  const [rankUpMsg, setRankUpMsg] = useState(null);

  useEffect(() => {
    if (prevRankRef.current && prevRankRef.current !== rank.id) {
      const isUp = RANKS.findIndex(r=>r.id===rank.id) < RANKS.findIndex(r=>r.id===prevRankRef.current);
      if (isUp) { setRankUpMsg(rank); setTimeout(()=>setRankUpMsg(null),5000); }
    }
    prevRankRef.current = rank.id;
  }, [rank.id]);

  const next = getNextRank(rank);
  const myWd = withdrawals.filter(w => w.userId === user.id);
  const todayIsWeekday = isWeekday(today());
  const earnToday = todayIsWeekday ? fl1(user.depositPt * rank.dailyRate / 100) : 0;
  const [claimMsg, setClaimMsg] = useState(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const refCount = members.filter(m => m.referrerId === user.id).length;

  // カウントアップアニメーション
  const [displayPt, setDisplayPt] = useState(user.withdrawablePt);
  useEffect(() => {
    const target = user.withdrawablePt;
    if (displayPt === target) return;
    const diff = target - displayPt, steps = 20;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      setDisplayPt(Math.round(displayPt + diff * (step/steps)));
      if (step >= steps) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [user.withdrawablePt]);

  return (
    <div>
      {/* pt振替モーダル */}
      {showTransfer && (
        <div style={{position:"fixed",inset:0,background:"#000c",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"24px",width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:700,color:C.accent}}>pt振替（複利運用）</div>
              <button onClick={()=>setShowTransfer(false)} style={{background:"transparent",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            <PtTransferPage user={user} members={members} setMembers={setMembers} setUser={setUser} onDone={()=>setTimeout(()=>setShowTransfer(false),2000)}/>
          </div>
        </div>
      )}

      {rankUpMsg && (
        <div style={{padding:"16px 18px",background:`linear-gradient(135deg,${rankUpMsg.bg},#fbbf2418)`,border:`2px solid ${rankUpMsg.color}`,borderRadius:12,marginBottom:14,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:6}}>{rankUpMsg.icon}</div>
          <div style={{fontSize:16,fontWeight:700,color:rankUpMsg.color}}>🎊 ランクアップ！</div>
          <div style={{fontSize:13,color:C.text,marginTop:4}}><RankBadge rank={rankUpMsg} size="lg"/> になりました！</div>
          <div style={{fontSize:12,color:C.sub,marginTop:4}}>日利が <strong style={{color:rankUpMsg.color}}>{rankUpMsg.dailyRate}%</strong> になりました</div>
        </div>
      )}

      {/* 残高メインカード */}
      <div style={{...sh.card,padding:mob?"20px":"28px",marginBottom:14,background:`linear-gradient(160deg,#080e1a,${rank.bg})`,borderColor:rank.color+"44",position:"relative",overflow:"hidden",boxShadow:`0 8px 32px rgba(0,0,0,0.4), 0 0 40px ${rank.color}0a`}}>
        <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,borderRadius:"50%",background:rank.color+"0a",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-60,left:-30,width:200,height:200,borderRadius:"50%",background:C.accent+"06",pointerEvents:"none"}}/>
        <div style={{position:"relative"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <div style={{width:44,height:44,borderRadius:12,background:rank.color+"22",border:`1.5px solid ${rank.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>
              {rank.icon}
            </div>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <RankBadge rank={rank} size="md"/>
                <span style={{fontSize:12,color:rank.color,fontWeight:700,background:rank.color+"18",padding:"2px 8px",borderRadius:99}}>日利 {rank.dailyRate}%</span>
              </div>
              {next && <div style={{fontSize:10,color:C.muted,marginTop:3}}>次のランクまで: {next.label}以上 あと{Math.max(0,next.minReferrals-(members.filter(m=>m.referrerId===user.id&&rankIndex(getMemberRank(m,members).id)<=rankIndex(next.id)).length))}人・{Math.max(0,next.minDeposit-user.depositPt).toLocaleString()} pt</div>}
            </div>
          </div>
          <div style={{marginBottom:6}}>
            <div style={{fontSize:11,color:C.sub,letterSpacing:1,marginBottom:4}}>出金可能ポイント</div>
            <div style={{fontSize:mob?38:48,fontWeight:700,color:C.green,letterSpacing:-1,lineHeight:1}}>
              {displayPt.toLocaleString()}
              <span style={{fontSize:16,color:C.sub,fontWeight:400,marginLeft:6}}>pt</span>
            </div>
          </div>
          <div style={{fontSize:12,color:C.sub,marginBottom:20}}>
            入金ポイント（出金不可）: <strong style={{color:C.accent}}>{user.depositPt.toLocaleString()} pt</strong>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{padding:"10px 16px",background:C.green+"14",border:`1px solid ${C.green}33`,borderRadius:10}}>
              <div style={{fontSize:10,color:C.sub,marginBottom:2}}>本日の日利予定</div>
              <div style={{fontSize:18,fontWeight:700,color:C.green}}>+{earnToday.toLocaleString()} <span style={{fontSize:11}}>pt</span></div>
            </div>
            <div style={{fontSize:11,color:C.muted,lineHeight:1.7}}>
              日利は毎日運営が一括付与します<br/>
              <span style={{color:C.sub}}>最終付与: {user.lastClaim||"未付与"}</span>
            </div>
          </div>
        </div>
      </div>



      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:14}}>
        {[
          {val:refCount,                                        label:"直接紹介数",  c:C.yellow, unit:"人", icon:"👥"},
          {val:myWd.filter(w=>w.status==="審査中").length,     label:"審査中申請",  c:C.sub,    unit:"件", icon:"⏳"},
        ].map(({val,label,c,unit,icon}) => (
          <div key={label} style={{...sh.card,padding:"14px 16px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:24}}>{icon}</span>
            <div>
              <div style={{fontSize:mob?20:22,fontWeight:700,color:c}}>{val}<span style={{fontSize:12,color:C.sub}}>{unit}</span></div>
              <div style={{fontSize:10,color:C.sub,marginTop:2}}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* pt振替ボタン */}
      {user.withdrawablePt >= 100 && (
        <div style={{...sh.card,padding:"14px 16px",marginBottom:14,background:"linear-gradient(135deg,#00e5ff08,#10b98108)",borderColor:"#00e5ff22",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:2}}>複利運用する</div>
            <div style={{fontSize:11,color:C.muted}}>出金可能ptを入金ptへ振替 → 日利が増える（不可逆）</div>
          </div>
          <button onClick={()=>setShowTransfer(true)}
            style={{...sh.btn("accent"),width:"auto",padding:"10px 20px",marginTop:0,fontSize:13,flexShrink:0}}>
            pt振替
          </button>
        </div>
      )}

      {/* ランク一覧 */}
      <div style={{...sh.card,padding:"16px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:12,fontWeight:700,color:C.sub,letterSpacing:1}}>ランク一覧</div>
          <div style={{fontSize:10,color:C.muted}}>
            スターター→ダイヤモンドで日利 <strong style={{color:C.yellow}}>+0.5%</strong> アップ
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {RANKS.map(r => {
            const isCurrent = rank.id === r.id;
            return (
              <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:isCurrent?`linear-gradient(135deg,${r.bg},${r.color}18)`:C.surface,borderRadius:10,border:`1.5px solid ${isCurrent?r.color+"88":C.border}`,flexWrap:"wrap"}}>
                <div style={{width:32,height:32,borderRadius:8,background:r.color+"22",border:`1px solid ${r.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                  {r.icon}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:12,fontWeight:700,color:isCurrent?r.color:C.text}}>{r.label}</span>
                    {isCurrent && <span style={sh.badge(r.color)}>現在</span>}
                  </div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>紹介{r.minReferrals}人 & 入金{r.minDeposit.toLocaleString()}pt</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:r.color}}>日利 {r.dailyRate}%</div>
                  <div style={{fontSize:9,color:C.muted,marginTop:1}}>10,000pt → +{fl1(10000*r.dailyRate/100)}/日</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}



// ── CURRENCIES ─────────────────────────────────
const CURRENCIES = [
  { id:"USDT", name:"Tether",   symbol:"USDT", color:"#26a17b", icon:"₮", networks:["TRC-20","ERC-20"], rate:1,     addr:null,
    notes:["必ずTRC-20またはERC-20ネットワークを選択してください","ネットワークを間違えると資産が失われます","最低入金額: 100 USDT相当から"] },
  { id:"BTC",  name:"Bitcoin",  symbol:"BTC",  color:"#f7931a", icon:"₿", networks:["Bitcoin"],         rate:65000, addr:"bc1phlyj8y3al67ljqjjlj4ddv4scxdm7na5pzpm4qzdevk3myyhvevscxee9m",
    notes:["SegWit（bc1）アドレスです","Bitcoin Networkのみ対応、他のネットワークは不可","当日のレートでUSDT換算してpt付与されます"] },
  { id:"ETH",  name:"Ethereum", symbol:"ETH",  color:"#627eea", icon:"Ξ", networks:["ERC-20"],          rate:3200,  addr:"0x9AebCfb67c2e82eeDb24358Bcd7dC4aDC5941Da3",
    notes:["ERC-20（Ethereum）ネットワークのみ対応","BEP-20（BSC）等には送金しないでください","当日のレートでUSDT換算してpt付与されます"] },
  { id:"SOL",  name:"Solana",   symbol:"SOL",  color:"#9945ff", icon:"◎", networks:["Solana"],          rate:145,   addr:"HHpcJUJEDWK6ZrA63va5gfpCB5qnqWWcE5KFtt9g5MbD",
    notes:["Solanaネットワークのみ対応","メモ（Memo）欄は不要です","当日のレートでUSDT換算してpt付与されます"] },
];
// デモ用固定レート（本番はAPI連携推奨）
// 例: 1 BTC = 65,000 USDT, 1 ETH = 3,200 USDT等
const toUSDT = (amount, currencyId) => {
  const cur = CURRENCIES.find(c => c.id === currencyId);
  return cur ? fl1(amount * cur.rate) : amount;
};

// ── DEPOSIT PAGE ───────────────────────────────
function DepositCard({ net, mob }) {
  const [copied, setCopied] = useState(false);
  const doCopy = () => {
    navigator.clipboard?.writeText(net.addr).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false), 2000);
  };
  return (
    <div style={{...sh.card,padding:mob?16:24,marginBottom:16,borderColor:copied?net.color+"66":C.border,transition:"border-color .3s"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:8,background:net.color+"20",border:`1px solid ${net.color}44`,borderRadius:8,padding:"6px 14px"}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:net.color,display:"inline-block"}}/>
          <span style={{fontSize:12,color:net.color,fontWeight:700}}>{net.net}</span>
        </div>
        {copied && <span style={{fontSize:12,color:net.color,fontWeight:700}}>✓ コピー完了！</span>}
      </div>
      <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
        <QRCode value={net.addr} size={mob?150:140}/>
      </div>
      <div style={{fontSize:11,color:C.sub,marginBottom:6,letterSpacing:1}}>USDTアドレス</div>
      <div onClick={doCopy} style={{background:copied?"#10b98114":"#0a1220",border:`2px solid ${copied?net.color:C.border}`,borderRadius:10,padding:"14px 16px",cursor:"pointer",transition:"all .2s",display:"flex",alignItems:"center",gap:10}}>
        <div style={{flex:1,fontSize:mob?11:12,color:C.text,wordBreak:"break-all",fontFamily:"monospace",lineHeight:1.7}}>
          {net.addr}
        </div>
        <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          {copied
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={net.color} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          }
          <span style={{fontSize:9,color:copied?net.color:C.muted}}>{copied?"完了":"コピー"}</span>
        </div>
      </div>
      <div style={{fontSize:10,color:C.muted,marginTop:5,textAlign:"center"}}>アドレスをタップしてコピー</div>
    </div>
  );
}



// ── AUTO NOTIFICATION HELPER ───────────────────
const createNotice = (text, type="info") => ({
  id: "msg" + Date.now() + Math.random().toString(36).slice(2,5),
  from: "運営",
  text,
  type, // info / success / warning
  date: now(),
  read: false,
});



// ── GLOBAL STYLES ──────────────────────────────
const GlobalStyle = () => {
  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      body { margin: 0; }
      @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      @keyframes glow   { 0%,100% { box-shadow: 0 0 20px #38bdf822; } 50% { box-shadow: 0 0 40px #38bdf844; } }
      @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      input:focus { border-color: #38bdf8 !important; box-shadow: 0 0 0 3px rgba(56,189,248,0.15) !important; }
      button:active { transform: scale(0.97); }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: #0a0f1a; }
      ::-webkit-scrollbar-thumb { background: #1e2d45; border-radius: 99px; }
      ::-webkit-scrollbar-thumb:hover { background: #38bdf855; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  return null;
};

// ── DEPOSIT FLOW ───────────────────────────────
function DepositFlowGuide({ mob }) {
  const steps = [
    { icon:"💰", label:"送金",     desc:"下記アドレスに\n各通貨を送金" },
    { icon:"📝", label:"報告",     desc:"「送金報告」から\nTXハッシュを送信" },
    { icon:"✅", label:"管理者確認", desc:"運営がブロックチェーンで\n送金を確認" },
    { icon:"⭐", label:"pt反映",   desc:"USDT換算で\n入金ptが付与" },
    { icon:"🎁", label:"報酬受取", desc:"毎日報酬受取\nボタンを押す" },
  ];
  return (
    <div style={{...sh.card,padding:"14px 16px",marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:12,letterSpacing:1}}>入金〜報酬受取までの流れ</div>
      <div style={{display:"flex",alignItems:"flex-start",overflowX:"auto",paddingBottom:4}}>
        {steps.map((s,i) => (
          <div key={i} style={{display:"flex",alignItems:"center",flexShrink:0}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,minWidth:mob?56:68}}>
              <div style={{width:40,height:40,borderRadius:"50%",background:C.surface,border:`2px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>
                {s.icon}
              </div>
              <div style={{fontSize:mob?9:10,fontWeight:700,color:C.accent,textAlign:"center"}}>{s.label}</div>
              <div style={{fontSize:mob?8:9,color:C.muted,textAlign:"center",lineHeight:1.5,whiteSpace:"pre-line"}}>{s.desc}</div>
            </div>
            {i < steps.length-1 && (
              <div style={{width:mob?12:20,height:2,background:`linear-gradient(to right,${C.accent}44,${C.accent}22)`,flexShrink:0,margin:"0 2px",marginBottom:24}}/>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DepositAddressAccordion({ currency, mob }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const isUSDT = currency.id === "USDT";
  const addresses = isUSDT
    ? [{net:"TRC-20",addr:DEPOSIT_TRC.addr,color:DEPOSIT_TRC.color},{net:"ERC-20",addr:DEPOSIT_ERC.addr,color:DEPOSIT_ERC.color}]
    : [{net:currency.networks[0],addr:currency.addr,color:currency.color}];

  const doCopy = (addr, key) => {
    navigator.clipboard?.writeText(addr).catch(()=>{});
    setCopied(key); setTimeout(()=>setCopied(""), 2000);
  };

  return (
    <div style={{...sh.card,marginBottom:10,overflow:"hidden"}}>
      {/* ヘッダー（タップで展開） */}
      <div onClick={()=>setOpen(o=>!o)}
        style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",cursor:"pointer",background:open?currency.color+"0e":"transparent",transition:"background .2s"}}>
        <div style={{width:42,height:42,borderRadius:10,background:currency.color+"22",border:`1.5px solid ${currency.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
          {currency.icon}
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:currency.color}}>{currency.id} <span style={{fontSize:12,color:C.sub,fontWeight:400}}>({currency.name})</span></div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>
            {isUSDT ? "TRC-20 / ERC-20" : currency.networks[0]}
  
          </div>
        </div>
        <span style={{color:C.muted,fontSize:16,transition:"transform .25s",display:"inline-block",transform:open?"rotate(90deg)":"rotate(0deg)",flexShrink:0}}>›</span>
      </div>

      {/* 展開コンテンツ */}
      {open && (
        <div style={{borderTop:`1px solid ${C.border}`,padding:"14px 16px",background:"#0a1220"}}>
          {/* QRコード */}
          <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
            <QRCode value={addresses[0].addr} size={mob?130:120}/>
          </div>
          {/* 通貨ごとの注意事項 */}
          {currency.notes && (
            <div style={{marginBottom:14,padding:"10px 12px",background:"#fbbf2410",border:"1px solid #fbbf2430",borderRadius:8}}>
              <div style={{fontSize:11,color:C.yellow,fontWeight:700,marginBottom:6}}>⚠ 送金前にご確認ください</div>
              {currency.notes.map((note,i) => (
                <div key={i} style={{fontSize:11,color:C.sub,display:"flex",gap:6,marginBottom:3}}>
                  <span style={{color:C.yellow,flexShrink:0}}>·</span>{note}
                </div>
              ))}
            </div>
          )}
          {addresses.map(a => {
            const cpKey = a.net;
            return (
              <div key={a.net} style={{marginBottom:10}}>
                <div style={{display:"inline-flex",alignItems:"center",gap:5,background:a.color+"18",border:`1px solid ${a.color}33`,borderRadius:6,padding:"2px 10px",marginBottom:6,fontSize:11,color:a.color,fontWeight:700}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:a.color,display:"inline-block"}}/>
                  {a.net}
                </div>
                <div onClick={()=>doCopy(a.addr, cpKey)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"12px 14px",background:copied===cpKey?currency.color+"12":C.card,border:`2px solid ${copied===cpKey?currency.color:C.border}`,borderRadius:10,cursor:"pointer",transition:"all .2s"}}>
                  <span style={{flex:1,fontSize:mob?10:12,color:C.text,wordBreak:"break-all",fontFamily:"monospace",lineHeight:1.7}}>{a.addr}</span>
                  <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    {copied===cpKey
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={currency.color} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    }
                    <span style={{fontSize:9,color:copied===cpKey?currency.color:C.muted}}>{copied===cpKey?"完了":"コピー"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DepositPage({ user }) {
  const mob = useIsMobile();
  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}><ArrowDownCircle size={20} style={{flexShrink:0}}/> 入金アドレス</div>
      <div style={{padding:"12px 14px",background:"#7c3aed18",border:"1px solid #7c3aed44",borderRadius:10,marginBottom:16,fontSize:12,color:C.sub,lineHeight:1.8}}>
        💡 各通貨を送金後、「入金」タブの<strong style={{color:C.accent}}>「送金報告」</strong>から報告してください。USDT換算でポイントが付与されます。
      </div>

      <DepositFlowGuide mob={mob}/>
      {CURRENCIES.map(c => (
        <DepositAddressAccordion key={c.id} currency={c} mob={mob}/>
      ))}

      <div style={{padding:"14px 16px",background:"#fbbf2410",border:"1px solid #fbbf2430",borderRadius:10,marginBottom:14,marginTop:4}}>
        <div style={{fontSize:12,color:"#fbbf24",fontWeight:700,marginBottom:8}}>⚠ 注意事項</div>
        <ul style={{margin:0,paddingLeft:18,fontSize:12,color:C.sub,lineHeight:2.2}}>
          <li>通貨・ネットワークを間違えると資産を失う恐れがあります</li>
          <li>入金ポイントは出金できません（日利で増えた出金可能ポイントのみ引き出し可）</li>
          <li>入金反映には通常 1〜24時間かかります</li>
          <li>最低入金額: <strong style={{color:C.text}}>100 USDT相当</strong></li>
          <li>BTC/ETH/SOLはレート換算でUSDTポイントとして反映されます</li>
        </ul>
      </div>
      <div style={{padding:"12px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,color:C.sub}}>
        入金時のメモ欄に会員ID <strong style={{color:C.accent}}>{user.userId}</strong> を記入してください
      </div>
    </div>
  );
}



// ── PT TRANSFER PAGE ───────────────────────────
function PtTransferPage({ user, members, setMembers, setUser, onDone }) {
  const mob = useIsMobile();
  const [amount,  setAmount]  = useState("");
  const [confirm, setConfirm] = useState(false);
  const [msg,     setMsg]     = useState(null);
  const [done,    setDone]    = useState(false);

  const maxAmount = user.withdrawablePt;
  const amt = parseInt(amount) || 0;

  const submit = () => {
    setMsg(null);
    if (!amt || amt <= 0)       return setMsg({t:"err", text:"振替額を入力してください"});
    if (amt > maxAmount)        return setMsg({t:"err", text:`出金可能ポイントが不足しています（最大 ${maxAmount.toLocaleString()} pt）`});
    if (amt < 100)              return setMsg({t:"err", text:"最低振替額は 100 pt です"});
    if (!confirm)               return setMsg({t:"err", text:"内容を確認してチェックを入れてください"});

    const newDeposit     = fl1(user.depositPt     + amt);
    const newWithdrawable = fl1(user.withdrawablePt - amt);
    setMembers(p => p.map(m => m.id===user.id
      ? {...m, depositPt:newDeposit, withdrawablePt:newWithdrawable}
      : m
    ));
    setUser(u => ({...u, depositPt:newDeposit, withdrawablePt:newWithdrawable}));
    setDone(true);
    setAmount(""); setConfirm(false);
    if (onDone) onDone();
  };

  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}>
        <ArrowDownCircle size={20}/> pt振替（複利運用）
      </div>

      {/* 説明 */}
      <div style={{...sh.card,padding:"14px 16px",marginBottom:14,background:"linear-gradient(135deg,#00e5ff08,#10b98108)",borderColor:"#00e5ff22"}}>
        <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:8}}>複利運用とは？</div>
        <div style={{fontSize:12,color:C.sub,lineHeight:1.9}}>
          出金可能ポイントを入金ポイントに振り替えることで、<strong style={{color:C.green}}>日利の計算元を増やし</strong>、複利効果で資産を増やせます。<br/>
          <strong style={{color:C.yellow}}>⚠ 振替後は元に戻すことができません。</strong><br/>
          入金ポイントは出金できませんのでご注意ください。
        </div>
      </div>

      {/* 現在の残高 */}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{flex:1,padding:"12px 14px",background:C.accent+"14",border:`1px solid ${C.accent}33`,borderRadius:10}}>
          <div style={{fontSize:10,color:C.sub,marginBottom:3}}>入金ポイント（振替後）</div>
          <div style={{fontSize:18,fontWeight:700,color:C.accent}}>
            {amt>0&&amt<=maxAmount ? (user.depositPt+amt).toLocaleString() : user.depositPt.toLocaleString()}
            <span style={{fontSize:11,color:C.sub,marginLeft:4}}>pt</span>
          </div>
          {amt>0&&amt<=maxAmount&&<div style={{fontSize:10,color:C.green,marginTop:2}}>+{amt.toLocaleString()} pt</div>}
        </div>
        <div style={{flex:1,padding:"12px 14px",background:C.green+"14",border:`1px solid ${C.green}33`,borderRadius:10}}>
          <div style={{fontSize:10,color:C.sub,marginBottom:3}}>出金可能ポイント（振替後）</div>
          <div style={{fontSize:18,fontWeight:700,color:amt>0&&amt<=maxAmount?C.yellow:C.green}}>
            {amt>0&&amt<=maxAmount ? (user.withdrawablePt-amt).toLocaleString() : user.withdrawablePt.toLocaleString()}
            <span style={{fontSize:11,color:C.sub,marginLeft:4}}>pt</span>
          </div>
          {amt>0&&amt<=maxAmount&&<div style={{fontSize:10,color:C.red,marginTop:2}}>-{amt.toLocaleString()} pt</div>}
        </div>
      </div>

      {done && (
        <div style={{padding:"14px 18px",background:C.green+"18",border:`1px solid ${C.green}`,borderRadius:10,marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:C.green,flexShrink:0}}/>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:C.green}}>振替完了しました</div>
            <div style={{fontSize:12,color:C.sub}}>入金ポイントが増加し、次回から日利が増えます。</div>
          </div>
        </div>
      )}

      <div style={{...sh.card,padding:mob?16:24}}>
        <div style={{marginBottom:16}}>
          <label style={sh.label}>振替額（pt）</label>
          <input type="number" inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)}
            placeholder={`例: 100 （最大 ${maxAmount.toLocaleString()} pt）`}
            style={sh.input}/>
          {amt>0&&amt<=maxAmount&&(()=>{
            const rank = RANKS.find(r=>r.id===(user.depositPt>0?"starter":"starter"))||RANKS[RANKS.length-1];
            const newDeposit = user.depositPt + amt;
            // 現在のランクレートで試算
            const dailyIncrease = fl1(amt * 0.003); // 最低ランクの日利0.3%で試算
            return(
              <div style={{marginTop:6,padding:"8px 12px",background:"#10b98110",borderRadius:8,fontSize:11,color:C.green}}>
                振替後の入金pt: <strong>{newDeposit.toLocaleString()} pt</strong>
                　日利増加（目安）: <strong>+{dailyIncrease.toLocaleString()} pt〜/日</strong>
              </div>
            );
          })()}
          {amt>maxAmount&&<div style={{fontSize:12,color:C.red,marginTop:4}}>出金可能ポイントを超えています</div>}
        </div>

        <div onClick={()=>setConfirm(c=>!c)}
          style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",background:confirm?"#ef444414":"#0a1220",border:`1px solid ${confirm?C.red:C.border}`,borderRadius:8,cursor:"pointer",marginBottom:16}}>
          <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${confirm?C.red:C.muted}`,background:confirm?C.red:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
            {confirm&&<span style={{color:"#fff",fontSize:12,fontWeight:700}}>✓</span>}
          </div>
          <span style={{fontSize:12,color:C.sub,lineHeight:1.6}}>
            振替後は<strong style={{color:C.red}}>元に戻すことができない</strong>ことを理解しました。入金ポイントは出金できません。
          </span>
        </div>

        {msg&&(
          <div style={{padding:"8px 12px",borderRadius:8,background:msg.t==="ok"?C.green+"18":C.red+"18",border:`1px solid ${msg.t==="ok"?C.green:C.red}`,color:msg.t==="ok"?C.green:C.red,fontSize:13,marginBottom:8}}>
            {msg.text}
          </div>
        )}
        <button style={{...sh.btn("accent"),opacity:confirm&&amt>=100&&amt<=maxAmount?1:0.5}} onClick={submit}>
          出金可能pt → 入金ptへ振替する
        </button>
      </div>
    </div>
  );
}

// ── WITHDRAWAL ADDRESS PAGE ────────────────────
function WithdrawalAddressPage({ user, members, setMembers, setUser }) {
  const mob = useIsMobile();
  const [currency, setCurrency] = useState("USDT");
  const [network,  setNetwork]  = useState("TRC-20");
  const [address,  setAddress]  = useState("");
  const [label,    setLabel]    = useState("");
  const [msg,      setMsg]      = useState(null);
  const addresses = user.registeredAddresses || [];
  const cur = CURRENCIES.find(c => c.id === currency) || CURRENCIES[0];

  const save = () => {
    setMsg(null);
    if (!address.trim() || address.trim().length < 10) return setMsg({t:"err", text:"正しいアドレスを入力してください"});
    if (addresses.length >= 5) return setMsg({t:"err", text:"登録できるアドレスは最大5件です"});
    const newAddr = {
      id: "addr"+Date.now(),
      currency, network,
      address: address.trim(),
      label: label.trim() || `${currency} アドレス`,
      createdAt: now(),
    };
    const updated = [...addresses, newAddr];
    setMembers(p => p.map(m => m.id===user.id ? {...m, registeredAddresses:updated} : m));
    setUser(u => ({...u, registeredAddresses:updated}));
    setAddress(""); setLabel("");
    setMsg({t:"ok", text:"アドレスを登録しました"});
  };

  const remove = (id) => {
    const updated = addresses.filter(a => a.id !== id);
    setMembers(p => p.map(m => m.id===user.id ? {...m, registeredAddresses:updated} : m));
    setUser(u => ({...u, registeredAddresses:updated}));
  };

  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}>
        <ArrowUpCircle size={20}/> 出金アドレス登録
      </div>
      <div style={{padding:"10px 14px",background:"#10b98114",border:`1px solid ${C.green}33`,borderRadius:10,marginBottom:16,fontSize:12,color:C.sub,lineHeight:1.8}}>
        出金時に使用するアドレスをあらかじめ登録しておくことができます。最大5件まで登録可能です。
      </div>

      {/* 登録済みアドレス一覧 */}
      {addresses.length > 0 && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:C.sub,letterSpacing:1,marginBottom:8}}>登録済みアドレス ({addresses.length}/5)</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {addresses.map(a => {
              const c2 = CURRENCIES.find(c => c.id===a.currency) || CURRENCIES[0];
              return (
                <div key={a.id} style={{...sh.card,padding:"12px 16px"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                    <div style={{width:36,height:36,borderRadius:8,background:c2.color+"22",border:`1px solid ${c2.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                      {c2.icon}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                        <span style={{fontSize:13,fontWeight:700,color:C.text}}>{a.label}</span>
                        <span style={{background:c2.color+"22",color:c2.color,border:`1px solid ${c2.color}44`,borderRadius:6,padding:"1px 8px",fontSize:11,fontWeight:700}}>{a.currency}</span>
                        <span style={{fontSize:11,color:C.muted}}>{a.network}</span>
                      </div>
                      <div style={{fontSize:11,color:C.sub,fontFamily:"monospace",wordBreak:"break-all"}}>{a.address}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:3}}>登録日: {a.createdAt?.slice(0,10)}</div>
                    </div>
                    <button onClick={()=>remove(a.id)} style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,flexShrink:0}}>削除</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 新規登録フォーム */}
      {addresses.length < 5 && (
        <div style={{...sh.card,padding:mob?16:24}}>
          <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:14}}>新しいアドレスを追加</div>
          <div style={{marginBottom:14}}>
            <label style={sh.label}>通貨</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {CURRENCIES.map(c => (
                <div key={c.id} onClick={()=>{setCurrency(c.id);setNetwork(c.networks[0]);}}
                  style={{padding:"8px 14px",borderRadius:8,border:`2px solid ${currency===c.id?c.color:C.border}`,background:currency===c.id?c.color+"18":"transparent",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
                  <div style={{fontSize:16}}>{c.icon}</div>
                  <div style={{fontSize:11,fontWeight:700,color:currency===c.id?c.color:C.sub}}>{c.id}</div>
                </div>
              ))}
            </div>
          </div>
          {cur.networks.length > 1 && (
            <div style={{marginBottom:14}}>
              <label style={sh.label}>ネットワーク</label>
              <div style={{display:"flex",gap:8}}>
                {cur.networks.map(n => (
                  <div key={n} onClick={()=>setNetwork(n)} style={{padding:"8px 16px",borderRadius:8,border:`2px solid ${network===n?cur.color:C.border}`,background:network===n?cur.color+"18":"transparent",cursor:"pointer",fontSize:12,fontWeight:700,color:network===n?cur.color:C.sub}}>
                    {n}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{marginBottom:14}}>
            <label style={sh.label}>アドレス</label>
            <input type="text" value={address} onChange={e=>setAddress(e.target.value)}
              placeholder={`${currency}アドレスを入力`}
              style={{...sh.input,fontFamily:"monospace",fontSize:13}}
              autoCapitalize="none" autoCorrect="off" spellCheck="false"/>
          </div>
          <div style={{marginBottom:16}}>
            <label style={sh.label}>ラベル（任意）</label>
            <input type="text" value={label} onChange={e=>setLabel(e.target.value)}
              placeholder="例: メインウォレット"
              style={sh.input}/>
          </div>
          {msg && (
            <div style={{padding:"8px 12px",borderRadius:8,background:msg.t==="ok"?C.green+"18":C.red+"18",border:`1px solid ${msg.t==="ok"?C.green:C.red}`,color:msg.t==="ok"?C.green:C.red,fontSize:13,marginBottom:8}}>
              {msg.text}
            </div>
          )}
          <button style={sh.btn("accent")} onClick={save}>アドレスを登録する</button>
        </div>
      )}
    </div>
  );
}

// ── WITHDRAWAL PAGE ────────────────────────────
function WithdrawalPage({ user, withdrawals, setWithdrawals, setMembers, setUser }) {
  const mob = useIsMobile();
  const [subTab, setSubTab] = useState("form");
  const [currency, setCurrency] = useState("USDT");
  const [network, setNetwork] = useState("TRC-20");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [memo,    setMemo]    = useState("");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState(null);
  const myWd = withdrawals.filter(w => w.userId === user.id);
  const statusColor = s => s==="承認"?C.green:s==="却下"?C.red:C.yellow;
  const statusLabel = s => s==="承認"?"✓ 承認":s==="却下"?"✗ 却下":"⏳ 審査中";

  const wdKey = todayWdKey();
  const todayWdDone = user.lastWdKey === wdKey;

  const submit = () => {
    setMsg(null);
    const amt = parseInt(amount);
    if (!user.kyc||user.kyc.idStatus!=="approved") return setMsg({t:"err",text:"出金にはKYC本人確認（L2）の完了が必要です。"});
    if (todayWdDone) return setMsg({t:"err",text:"本日の出金申請は完了しています。次回は翌日10:00以降に申請できます。"});
    if (!address.trim()||address.trim().length<20) return setMsg({t:"err",text:"正しいUSDTアドレスを入力してください"});
    if (!amt||amt<=0) return setMsg({t:"err",text:"出金額を入力してください"});
    if (amt<100) return setMsg({t:"err",text:"最低出金額は100 ptです"});
    if (amt>WD_MAX_AMOUNT) return setMsg({t:"err",text:`1回の出金上限は${WD_MAX_AMOUNT.toLocaleString()} ptです`});
    if (amt>user.withdrawablePt) return setMsg({t:"err",text:"出金可能残高が不足しています"});
    if (!confirm) return setMsg({t:"err",text:"内容を確認してチェックを入れてください"});
    const fee = Math.floor(amt*0.01);
    const payout = amt-fee;
    const wd = {id:"wd"+Math.random().toString(36).slice(2,8),userId:user.id,amount:amt,payout,fee,network,address:address.trim(),status:"審査中",createdAt:now(),processedAt:null};
    setWithdrawals(p => [...p, wd]);
    setMembers(p => p.map(m => m.id===user.id ? {...m,withdrawablePt:m.withdrawablePt-amt,lastWdKey:wdKey} : m));
    setUser(u => ({...u, withdrawablePt:u.withdrawablePt-amt, lastWdKey:wdKey}));
    setMsg({t:"ok",text:`申請を受け付けました。実受取: ${payout.toLocaleString()} pt（手数料 ${fee.toLocaleString()} pt差引）。審査には1〜3営業日かかります。`});
    setAddress(""); setAmount(""); setConfirm(false); setMemo("");
    setTimeout(() => setSubTab("history"), 2000);
  };

  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}><ArrowUpCircle size={20} style={{flexShrink:0}}/> 出金</div>
      <div style={{padding:"10px 14px",background:"#7c3aed14",border:"1px solid #7c3aed33",borderRadius:10,marginBottom:14,fontSize:12,color:C.sub,lineHeight:1.8}}>
        💡 出金できるのは <strong style={{color:C.green}}>出金可能ポイント</strong> のみです。出金時に <strong style={{color:C.yellow}}>1%の手数料</strong> がかかります。
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[{id:"form",label:"📝 出金申請"},{id:"history",label:"📋 申請履歴"}].map(t => (
          <button key={t.id} onClick={()=>setSubTab(t.id)} style={{flex:1,background:subTab===t.id?C.accent:"transparent",color:subTab===t.id?"#000":C.sub,border:`1px solid ${subTab===t.id?C.accent:C.border}`,borderRadius:8,padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:13}}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab==="form" && (
        <div style={{...sh.card,padding:mob?16:28,maxWidth:520}}>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <PointPill label="入金ポイント（出金不可）" value={user.depositPt} color={C.accent}/>
            <PointPill label="出金可能ポイント" value={user.withdrawablePt} color={C.green} sub="最低100 pt〜"/>
          </div>
          {/* 出金制限インフォ */}
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            <div style={{flex:1,padding:"8px 12px",background:todayWdDone?"#ef444414":C.surface,border:`1px solid ${todayWdDone?C.red+"44":C.border}`,borderRadius:8}}>
              <div style={{fontSize:10,color:C.sub,marginBottom:2}}>本日の出金</div>
              <div style={{fontSize:13,fontWeight:700,color:todayWdDone?C.red:C.green}}>
                {todayWdDone?"✓ 申請済み":"申請可能"}
              </div>
              <div style={{fontSize:9,color:C.muted,marginTop:1}}>翌日10:00にリセット</div>
            </div>
            <div style={{flex:1,padding:"8px 12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8}}>
              <div style={{fontSize:10,color:C.sub,marginBottom:2}}>1回の上限</div>
              <div style={{fontSize:13,fontWeight:700,color:C.accent}}>{WD_MAX_AMOUNT.toLocaleString()} pt</div>
              <div style={{fontSize:9,color:C.muted,marginTop:1}}>= {WD_MAX_AMOUNT.toLocaleString()} USDT</div>
            </div>
          </div>
          {todayWdDone && (
            <div style={{padding:"10px 14px",background:"#ef444414",border:`1px solid ${C.red}44`,borderRadius:8,marginBottom:14,fontSize:12,color:C.red}}>
              🔒 本日の出金申請は完了しています。次回は <strong>翌日10:00以降</strong> に申請できます。
            </div>
          )}
          {(!user.kyc||user.kyc.idStatus!=="approved") && (
            <div style={{padding:"12px 16px",background:"#ef444414",border:`1px solid ${C.red}44`,borderRadius:10,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <ShieldCheck size={20} color={C.red}/>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:C.red,marginBottom:3}}>本人確認（KYC）が必要です</div>
                  <div style={{fontSize:12,color:C.sub}}>L2本人確認が完了した方から出金申請が可能です。</div>
                </div>
              </div>
            </div>
          )}
          {user.withdrawablePt < 100 && (
            <div style={{padding:"10px 14px",background:C.yellow+"14",border:`1px solid ${C.yellow}33`,borderRadius:8,marginBottom:14,fontSize:12,color:C.yellow}}>
              ⚠ 出金可能ポイントが100 pt未満のため申請できません。
            </div>
          )}
          {/* 出金通貨選択 */}
          <div style={{marginBottom:16}}>
            <label style={sh.label}>出金する通貨</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {CURRENCIES.map(c => (
                <div key={c.id} onClick={()=>{setNetwork(c.networks[0]);setAddress("");setCurrency(c.id);}}
                  style={{padding:"10px 14px",borderRadius:10,border:`2px solid ${currency===c.id?c.color:C.border}`,background:currency===c.id?c.color+"18":"transparent",cursor:"pointer",transition:"all .15s",textAlign:"center",minWidth:65}}>
                  <div style={{fontSize:18,marginBottom:2}}>{c.icon}</div>
                  <div style={{fontSize:12,fontWeight:700,color:currency===c.id?c.color:C.sub}}>{c.id}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ネットワーク選択（複数ある場合） */}
          {(()=>{ const c=CURRENCIES.find(x=>x.id===currency)||CURRENCIES[0]; return c.networks.length>1 ? (
            <div style={{marginBottom:16}}>
              <label style={sh.label}>ネットワーク</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {c.networks.map(n => (
                  <div key={n} onClick={()=>setNetwork(n)}
                    style={{padding:"8px 16px",borderRadius:8,border:`2px solid ${network===n?c.color:C.border}`,background:network===n?c.color+"18":"transparent",cursor:"pointer",fontSize:12,fontWeight:700,color:network===n?c.color:C.sub}}>
                    {n}
                  </div>
                ))}
              </div>
            </div>
          ) : null; })()}

          {/* USDT以外はレート案内のみ */}
          {currency!=="USDT" && (
            <div style={{padding:"10px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:16,fontSize:12,color:C.sub,lineHeight:1.8}}>
              💱 出金額（pt）を当日のレートで {currency} に換算してお送りします。<br/>
              実際の受取額は処理時のレートにより変動します。
            </div>
          )}

          <div style={{marginBottom:16}}>
            <label style={sh.label}>送金先 {currency} アドレス（{network}）</label>
            {/* 登録済みアドレスから選択 */}
            {(user.registeredAddresses||[]).filter(a=>a.currency===currency&&a.network===network).length>0 && (
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,color:C.sub,marginBottom:6}}>登録済みアドレスから選択</div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {(user.registeredAddresses||[]).filter(a=>a.currency===currency&&a.network===network).map(a=>(
                    <div key={a.id} onClick={()=>setAddress(a.address)}
                      style={{padding:"8px 12px",background:address===a.address?C.accent+"18":C.surface,border:`1px solid ${address===a.address?C.accent:C.border}`,borderRadius:8,cursor:"pointer",transition:"all .15s"}}>
                      <div style={{fontSize:12,fontWeight:700,color:address===a.address?C.accent:C.text}}>{a.label}</div>
                      <div style={{fontSize:11,color:C.muted,fontFamily:"monospace",wordBreak:"break-all"}}>{a.address}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <input type="text" value={address} onChange={e=>setAddress(e.target.value)}
              placeholder={`${currency}アドレスを入力または上から選択`}
              style={{...sh.input,fontFamily:"monospace",fontSize:13}} autoCapitalize="none" autoCorrect="off" spellCheck="false"/>
            <div style={{fontSize:11,color:C.muted,marginTop:5}}>⚠ 必ず選択した通貨・ネットワークのアドレスを入力してください</div>
          </div>
          <div style={{marginBottom:20}}>
            <label style={sh.label}>出金額（pt）※ 1pt = 1 USDT</label>
            <input type="number" inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="例: 500" style={sh.input}/>
            {amount && parseInt(amount)>=100 && parseInt(amount)<=user.withdrawablePt && (
              <div style={{fontSize:12,color:C.green,marginTop:5}}>手数料1%差引後の実受取: {Math.floor(parseInt(amount)*0.99).toLocaleString()} pt</div>
            )}
            {amount && parseInt(amount)>WD_MAX_AMOUNT && (
              <div style={{fontSize:12,color:C.red,marginTop:5}}>1回の出金上限（{WD_MAX_AMOUNT.toLocaleString()} pt）を超えています</div>
            )}
            {amount && parseInt(amount)<=WD_MAX_AMOUNT && parseInt(amount)>user.withdrawablePt && (
              <div style={{fontSize:12,color:C.red,marginTop:5}}>出金可能ポイント（{user.withdrawablePt.toLocaleString()} pt）を超えています</div>
            )}
          </div>
          <div style={{marginBottom:16}}>
            <label style={sh.label}>メモ（任意）</label>
            <input type="text" value={memo} onChange={e=>setMemo(e.target.value)}
              placeholder="出金理由・備考など（管理者のみ確認）"
              style={sh.input}/>
          </div>
          <div onClick={()=>setConfirm(c=>!c)} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",background:confirm?"#10b98114":"#0a1220",border:`1px solid ${confirm?C.green:C.border}`,borderRadius:8,cursor:"pointer",marginBottom:16}}>
            <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${confirm?C.green:C.muted}`,background:confirm?C.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
              {confirm && <span style={{color:"#000",fontSize:12,fontWeight:700}}>✓</span>}
            </div>
            <span style={{fontSize:12,color:C.sub,lineHeight:1.6}}>送金先アドレスと出金額を確認しました。申請後のキャンセルはできません。</span>
          </div>
          {msg && (
            <div style={{padding:"10px 14px",borderRadius:8,background:msg.t==="ok"?C.green+"18":C.red+"18",border:`1px solid ${msg.t==="ok"?C.green:C.red}`,color:msg.t==="ok"?C.green:C.red,fontSize:13,marginBottom:8}}>
              {msg.text}
            </div>
          )}
          <button style={{...sh.btn("accent"),opacity:confirm&&user.withdrawablePt>=100&&user.kyc?.idStatus==="approved"&&!todayWdDone?1:0.5}} onClick={submit}>申請する</button>
        </div>
      )}

      {subTab==="history" && (
        <div style={{...sh.card,overflow:"hidden"}}>
          {myWd.length===0 ? (
            <div style={{padding:40,textAlign:"center",color:C.muted}}><div style={{fontSize:32,marginBottom:12}}>📭</div><div>申請履歴がありません</div></div>
          ) : (
            <div style={{display:"flex",flexDirection:"column"}}>
              {[...myWd].reverse().map(w => (
                <div key={w.id} style={{padding:"16px",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{color:C.accent,fontWeight:700,fontSize:15}}>{w.amount.toLocaleString()} pt 申請</div>
                      {w.payout && <div style={{fontSize:11,color:C.sub,marginTop:2}}>実受取: {w.payout.toLocaleString()} pt（手数料 {w.fee} pt）</div>}
                    </div>
                    <span style={sh.badge(statusColor(w.status))}>{statusLabel(w.status)}</span>
                  </div>
                  {/* 進捗トラッカー */}
                  <div style={{display:"flex",alignItems:"center",marginBottom:12}}>
                    {[
                      {label:"申請",   done:true},
                      {label:"審査中", done:w.status!=="審査中"},
                      {label:"処理中", done:w.status==="承認"||w.status==="却下"},
                      {label:"完了",   done:w.status==="承認"},
                    ].map((step, i, arr) => (
                      <div key={i} style={{display:"flex",alignItems:"center",flex:i<arr.length-1?1:"none"}}>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                          <div style={{width:22,height:22,borderRadius:"50%",background:w.status==="却下"&&i>=2?C.red:step.done?C.green:C.muted,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",flexShrink:0,fontWeight:700}}>
                            {w.status==="却下"&&i===2?"✗":step.done?"✓":""}
                          </div>
                          <span style={{fontSize:9,color:w.status==="却下"&&i>=2?C.red:step.done?C.green:C.muted,whiteSpace:"nowrap"}}>{step.label}</span>
                        </div>
                        {i<arr.length-1 && <div style={{flex:1,height:2,background:step.done?C.green:C.muted,margin:"0 3px",marginBottom:14,transition:"background .3s"}}/>}
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                    {(()=>{ const c=CURRENCIES.find(x=>x.id===(w.currency||"USDT"))||CURRENCIES[0]; return <span style={{background:c.color+"22",color:c.color,border:`1px solid ${c.color}44`,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>{c.icon} {c.id}</span>; })()}
                    {w.network && <span style={{background:"#ffffff12",color:C.sub,border:`1px solid ${C.border}`,borderRadius:6,padding:"1px 8px",fontSize:11}}>{w.network}</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:11,color:C.sub,fontFamily:"monospace",wordBreak:"break-all",flex:1}}>{w.address}</span>
                  </div>
                  {w.memo && <div style={{fontSize:11,color:C.sub,marginBottom:3,fontStyle:"italic"}}>メモ: {w.memo}</div>}
                  <div style={{fontSize:11,color:C.muted}}>申請日: {w.createdAt}{w.processedAt && ` · 処理日: ${w.processedAt}`}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── KYC PAGE ───────────────────────────────────
function KycPage({ user, members, setMembers, setUser }) {
  const mob = useIsMobile();
  const kyc = user.kyc || {basicDone:false,idStatus:"none"};
  const [step, setStep] = useState(!kyc.basicDone?"basic":"id");
  const [basic, setBasic] = useState({lastName:"",firstName:"",dob:"",phone:"",address:""});
  const [basicErr, setBasicErr] = useState("");
  const [idFile, setIdFile] = useState(null);
  const [idPreview, setIdPreview] = useState(null);
  const idStatus = kyc.idStatus||"none";
  const basicDone = kyc.basicDone||false;

  const saveBasic = () => {
    if (!basic.lastName||!basic.firstName||!basic.dob||!basic.phone||!basic.address)
      return setBasicErr("すべての項目を入力してください");
    const nk = {...kyc,basicDone:true,basicInfo:basic};
    setMembers(p => p.map(m => m.id===user.id ? {...m,kyc:nk} : m));
    setUser(u => ({...u,kyc:nk}));
    setStep("id");
  };

  const handleFile = e => {
    const f = e.target.files[0]; if(!f) return;
    setIdFile(f);
    const reader = new FileReader();
    reader.onload = ev => setIdPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const submitId = () => {
    if (!idFile) return;
    const nk = {...kyc,basicDone:true,idStatus:"pending"};
    setMembers(p => p.map(m => m.id===user.id ? {...m,kyc:nk} : m));
    setUser(u => ({...u,kyc:nk}));
  };

  const OkBadge  = ({label}) => <span style={{background:C.green+"22",color:C.green,border:`1px solid ${C.green}44`,borderRadius:6,padding:"2px 10px",fontSize:12,fontWeight:700}}>✓ {label}</span>;
  const NgBadge  = () => <span style={{background:"#f9731622",color:"#f97316",border:"1px solid #f9731644",borderRadius:6,padding:"2px 10px",fontSize:12,fontWeight:700}}>未完了</span>;

  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}><ShieldCheck size={20} style={{flexShrink:0}}/> アカウント確認（KYC）</div>

      {/* L1 基本情報 */}
      <div style={{...sh.card,padding:"18px 20px",marginBottom:12,borderColor:basicDone?C.green+"44":C.border}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:basicDone&&step!=="basic"?0:14}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:basicDone?C.green:C.muted,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>
            {basicDone ? "✓" : "📋"}
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
              <span style={{fontSize:14,fontWeight:700}}>L1: 基本情報</span>
              {basicDone ? <OkBadge label="完了"/> : <NgBadge/>}
            </div>
            <div style={{fontSize:12,color:C.sub}}>ご本人様についてより詳しくご記入ください</div>
          </div>
          {basicDone && <button onClick={()=>setStep(step==="basic"?"id":"basic")} style={{background:"transparent",border:`1px solid ${C.border}`,color:C.sub,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,flexShrink:0}}>✏️ 表示と更新</button>}
        </div>
        {(!basicDone||step==="basic") && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10,marginBottom:10}}>
              {[{key:"lastName",label:"姓"},{key:"firstName",label:"名"},{key:"dob",label:"生年月日",type:"date"},{key:"phone",label:"電話番号",type:"tel"}].map(f => (
                <div key={f.key}>
                  <label style={sh.label}>{f.label}</label>
                  <input type={f.type||"text"} value={basic[f.key]} onChange={e=>setBasic(p=>({...p,[f.key]:e.target.value}))} style={sh.input}/>
                </div>
              ))}
            </div>
            <div style={{marginBottom:10}}>
              <label style={sh.label}>住所</label>
              <input type="text" value={basic.address} onChange={e=>setBasic(p=>({...p,address:e.target.value}))} style={sh.input} placeholder="例: 東京都渋谷区..."/>
            </div>
            {basicErr && <div style={{color:C.red,fontSize:12,marginBottom:8}}>{basicErr}</div>}
            <button style={sh.btn("accent")} onClick={saveBasic}>基本情報を保存</button>
          </div>
        )}
      </div>

      {/* L2 本人確認 */}
      <div style={{...sh.card,padding:"18px 20px",borderColor:idStatus==="approved"?C.green+"44":idStatus==="pending"?"#fbbf2444":C.border}}>
        {idStatus==="rejected" && (
          <div style={{padding:"12px 16px",background:"#f9731614",border:"1px solid #f9731644",borderRadius:8,marginBottom:14}}>
            <div style={{display:"flex",gap:8}}>
              <span style={{fontSize:18}}>⚠️</span>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#f97316",marginBottom:4}}>もう少しです: 有効期限内の身分証明書をアップロードしてください。</div>
              </div>
            </div>
          </div>
        )}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:idStatus==="none"||idStatus==="rejected"?14:0}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:idStatus==="approved"?C.green:idStatus==="pending"?C.yellow:C.muted,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>
            {idStatus==="approved"?"✓":idStatus==="pending"?"⏳":"🪪"}
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
              <span style={{fontSize:14,fontWeight:700}}>L2: 本人確認</span>
              {idStatus==="approved" && <OkBadge label="完了"/>}
              {idStatus==="pending"  && <span style={{background:"#fbbf2422",color:C.yellow,border:`1px solid ${C.yellow}44`,borderRadius:6,padding:"2px 10px",fontSize:12,fontWeight:700}}>⏳ 審査待ち</span>}
              {idStatus==="none"     && <NgBadge/>}
              {idStatus==="rejected" && <span style={{background:"#ef444422",color:C.red,border:`1px solid ${C.red}44`,borderRadius:6,padding:"2px 10px",fontSize:12,fontWeight:700}}>✗ 再提出</span>}
            </div>
            <div style={{fontSize:12,color:C.sub}}>身分証明書のコピーをアップロードする</div>
          </div>
        </div>
        {(idStatus==="none"||idStatus==="rejected") && basicDone && (
          <div>
            <div style={{marginBottom:12}}>
              <label style={sh.label}>身分証の種類</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {["運転免許証","マイナンバーカード","パスポート","在留カード"].map(t => (
                  <div key={t} style={{padding:"8px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,cursor:"pointer",color:C.sub}}>{t}</div>
                ))}
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <label style={sh.label}>身分証画像をアップロード</label>
              <label style={{display:"block",cursor:"pointer"}}>
                <input type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>
                {idPreview ? (
                  <div style={{position:"relative"}}>
                    <img src={idPreview} alt="ID" style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:8,border:`1px solid ${C.border}`}}/>
                    <div style={{position:"absolute",top:8,right:8,background:"#000a",borderRadius:6,padding:"4px 8px",fontSize:11,color:"#fff"}}>タップして変更</div>
                  </div>
                ) : (
                  <div style={{border:`2px dashed ${C.border}`,borderRadius:10,padding:"28px 20px",textAlign:"center",background:C.surface}}>
                    <div style={{fontSize:32,marginBottom:8}}>📄</div>
                    <div style={{fontSize:13,color:C.sub,marginBottom:4}}>タップして画像を選択</div>
                    <div style={{fontSize:11,color:C.muted}}>JPG / PNG / PDF対応</div>
                  </div>
                )}
              </label>
            </div>
            <button style={{...sh.btn("accent"),background:"#7c3aed"}} onClick={submitId}>今すぐ確認する</button>
          </div>
        )}
        {idStatus==="none" && !basicDone && <div style={{fontSize:12,color:C.muted,marginTop:4}}>※ 基本情報（L1）を先に完了してください</div>}
        {idStatus==="pending" && <div style={{marginTop:12,padding:"10px 14px",background:"#fbbf2410",border:"1px solid #fbbf2430",borderRadius:8,fontSize:12,color:C.yellow}}>提出済みです。審査には通常1〜3営業日かかります。</div>}
        {idStatus==="approved" && <div style={{marginTop:12,padding:"10px 14px",background:C.green+"14",border:`1px solid ${C.green}33`,borderRadius:8,fontSize:12,color:C.green}}>本人確認が完了しています。すべての機能がご利用いただけます。</div>}
      </div>
    </div>
  );
}

// ── REFERRAL TREE ──────────────────────────────
function ReferralTree({ members, user }) {
  const mob = useIsMobile();
  const rank = getMemberRank(user, members);
  const directCount = members.filter(m => m.referrerId === user.id).length;
  const subMembers = members.filter(m => m.id !== user.id);
  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}><GitBranch size={20} style={{flexShrink:0}}/> 紹介ツリー</div>
      <div style={{...sh.card,padding:"12px 16px",marginBottom:16,background:`linear-gradient(135deg,${C.card},${rank.bg})`,borderColor:rank.color+"55"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:40,height:40,borderRadius:10,background:rank.color+"22",border:`1.5px solid ${rank.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
            {rank.icon}
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:14,fontWeight:700,color:rank.color}}>{maskId(user.userId)}</span>
              <span style={{fontSize:11,color:C.accent,background:C.accent+"18",padding:"1px 8px",borderRadius:99}}>あなた</span>
              <RankBadge rank={rank} size="sm"/>
            </div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>入金 {user.depositPt.toLocaleString()} pt · 直接紹介 {directCount}人</div>
          </div>
        </div>
      </div>
      {/* 2段階報酬の説明 */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {[
          {label:"1段階",color:C.green,   rate:"10%"},
          {label:"2段階",color:C.yellow,  rate:"5%"},
          {label:"3段階",color:"#6366f1", rate:"3%"},
          {label:"4段階",color:C.muted, rate:"2%"},
        ].map(r=>(
          <div key={r.label} style={{flex:1,padding:"8px 10px",background:r.color+"14",border:`1px solid ${r.color}33`,borderRadius:8,textAlign:"center"}}>
            <div style={{fontSize:9,color:C.sub,marginBottom:2}}>{r.label}</div>
            <div style={{fontSize:13,fontWeight:700,color:r.color}}>{r.rate}</div>
          </div>
        ))}
      </div>

      {directCount===0 ? (
        <div style={{...sh.card,padding:32,textAlign:"center",color:C.muted}}>
          <div style={{fontSize:32,marginBottom:8}}>👥</div>
          <div style={{fontSize:13}}>まだ紹介した会員がいません</div>
          <div style={{fontSize:11,marginTop:6,color:C.muted}}>設定の「招待リンク」からシェアしてみましょう</div>
        </div>
      ) : (
        <div style={{...sh.card,padding:mob?12:20}}>
          {subMembers.filter(m => m.referrerId===user.id).map(m => (
            <TreeNode key={m.id} member={m} members={subMembers} depth={0}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SUPPORT PAGE ───────────────────────────────
function FaqSection() {
  const [open, setOpen] = useState(null);
  const faqs = [
    {cat:"入金", items:[
      {q:"入金の反映にどれくらいかかりますか？", a:"通常1〜24時間です。送金報告からTXハッシュを送ると確認が早まります。"},
      {q:"最低入金額はいくらですか？", a:"最低100 USDTからご入金いただけます。"},
      {q:"入金ポイントは出金できますか？", a:"入金ポイント（元本）は出金できません。日利・紹介報酬で増えた出金可能ポイントのみ出金できます。"},
    ]},
    {cat:"出金", items:[
      {q:"最低出金額はいくらですか？", a:"100 ptから出金申請できます（1pt = 1 USDT）。"},
      {q:"出金に手数料はかかりますか？", a:"出金額の1%が手数料として差し引かれます。"},
      {q:"出金申請から反映まで何日かかりますか？", a:"審査・処理には通常1〜3営業日かかります。"},
      {q:"出金するために必要な条件は？", a:"本人確認（KYC）のL2が承認済みであることが必要です。"},
    ]},
    {cat:"ランク・報酬", items:[
      {q:"ランクはどうやって上がりますか？", a:"同ランク以上の会員の紹介人数と入金ptの両方の条件を満たすと昇格します。"},
      {q:"紹介報酬はいつ付与されますか？", a:"紹介した会員が入金した際に付与されます。1段階目（直接紹介）は10%、2段階目は5%、3段階目は3%、4段階目は2%（5段階以降なし）が出金可能ポイントとして継続付与されます。"},
      {q:"日利はいつ付与されますか？", a:"日利は平日（土日祝を除く）に運営が一括付与します。入金ptに対してランク別の日利率で計算されます。"},
    ]},
    {cat:"アカウント", items:[
      {q:"ユーザーIDは変更できますか？", a:"一度登録したユーザーIDは変更できません。"},
      {q:"パスワードを変更したいです。", a:"設定の「プロフィール」ページからご自身でパスワードを変更できます。"},
      {q:"紹介コードはどこで確認できますか？", a:"設定の「招待リンク」ページで確認・コピーできます。"},
    ]},
  ];
  return (
    <div style={{marginBottom:20}}>
      {faqs.map((cat, ci) => (
        <div key={ci} style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:C.accent,letterSpacing:2,marginBottom:8,paddingLeft:4}}>{cat.cat}</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {cat.items.map((item, i) => {
              const key = `${ci}-${i}`;
              const isOpen = open===key;
              return (
                <div key={i} style={{background:C.surface,border:`1px solid ${isOpen?C.accent+"44":C.border}`,borderRadius:10,overflow:"hidden"}}>
                  <div onClick={()=>setOpen(isOpen?null:key)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:"pointer"}}>
                    <span style={{fontSize:12,color:C.accent,fontWeight:700,flexShrink:0}}>Q.</span>
                    <span style={{fontSize:13,color:C.text,flex:1,fontWeight:isOpen?700:400}}>{item.q}</span>
                    <span style={{color:C.muted,fontSize:14,flexShrink:0,transition:"transform .2s",display:"inline-block",transform:isOpen?"rotate(90deg)":"rotate(0deg)"}}>›</span>
                  </div>
                  {isOpen && (
                    <div style={{padding:"0 14px 12px 14px",fontSize:12,color:C.sub,lineHeight:1.8,borderTop:`1px solid ${C.border}`,paddingTop:10}}>
                      <span style={{color:C.green,fontWeight:700,marginRight:6}}>A.</span>{item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SupportPage() {
  const mob = useIsMobile();
  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}><MessageCircle size={20} style={{flexShrink:0}}/> サポート</div>
      <div style={{...sh.card,padding:mob?20:32,maxWidth:480,marginBottom:14}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:8}}>公式Telegramサポート</div>
          <div style={{fontSize:13,color:C.sub,lineHeight:1.8}}>ご質問・お問い合わせは公式Telegramアカウントまでお気軽にどうぞ。担当スタッフが対応いたします。</div>
        </div>
        <FaqSection/>
        <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" style={{display:"block",textDecoration:"none"}}>
          <button style={{...sh.btn("accent"),background:"#229ED9",display:"flex",alignItems:"center",justifyContent:"center",gap:10,fontSize:16}}>
            Telegramで問い合わせる
          </button>
        </a>
        <div style={{marginTop:12,fontSize:11,color:C.muted,textAlign:"center"}}>対応時間: 平日 10:00〜18:00（日本時間）</div>
      </div>
    </div>
  );
}

// ── SETTINGS SUB PAGES ─────────────────────────
function HistoryPage({ user, withdrawals }) {
  const mob = useIsMobile();
  const [filter, setFilter] = useState("all");
  const logs = [
    { id:"l001", type:"deposit",        amount:10000, note:"USDT入金反映",             date:"2024-01-10 10:00" },
    { id:"l002", type:"claim",          amount:30,    note:"日利付与（スターター0.3% / 運営一括）", date:"2024-04-22 10:05" },
    { id:"l003", type:"referral_bonus", amount:200,   note:"紹介報酬（u002の入金）",    date:"2024-02-15 14:00" },
    { id:"l004", type:"withdraw",       amount:-500,  note:"出金申請",                  date:"2024-04-20 15:30" },
  ].filter(l => filter==="all"||l.type===filter);
  const typeInfo = {
    deposit:        {label:"入金反映",  color:C.accent,  icon:"💰"},
    claim:          {label:"日利報酬",  color:C.green,   icon:"🎁"},
    referral_bonus: {label:"紹介報酬",  color:C.yellow,  icon:"👥"},
    withdraw:       {label:"出金",      color:C.red,     icon:"💸"},
  };
  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}><History size={20}/> ポイント履歴</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:14}}>
        <div style={{...sh.card,padding:"14px 16px"}}>
          <div style={{fontSize:10,color:C.sub,marginBottom:3}}>累計受取報酬</div>
          <div style={{fontSize:mob?20:22,fontWeight:700,color:C.green}}>{logs.filter(l=>["claim","referral_bonus"].includes(l.type)).reduce((a,l)=>a+l.amount,0).toLocaleString()} <span style={{fontSize:11}}>pt</span></div>
        </div>
        <div style={{...sh.card,padding:"14px 16px"}}>
          <div style={{fontSize:10,color:C.sub,marginBottom:3}}>累計出金</div>
          <div style={{fontSize:mob?20:22,fontWeight:700,color:C.red}}>{Math.abs(logs.filter(l=>l.type==="withdraw").reduce((a,l)=>a+l.amount,0)).toLocaleString()} <span style={{fontSize:11}}>pt</span></div>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {[{id:"all",label:"すべて"},{id:"deposit",label:"入金"},{id:"claim",label:"日利"},{id:"referral_bonus",label:"紹介報酬"},{id:"withdraw",label:"出金"}].map(f => (
          <button key={f.id} onClick={()=>setFilter(f.id)} style={{background:filter===f.id?C.accent:"transparent",color:filter===f.id?"#000":C.sub,border:`1px solid ${filter===f.id?C.accent:C.border}`,borderRadius:20,padding:"5px 14px",cursor:"pointer",fontWeight:filter===f.id?700:400,fontSize:12}}>
            {f.label}
          </button>
        ))}
      </div>
      <div style={{...sh.card,overflow:"hidden"}}>
        {logs.length===0 ? (
          <div style={{padding:32,textAlign:"center",color:C.muted}}>履歴がありません</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column"}}>
            {logs.map(l => {
              const info = typeInfo[l.type]||{label:l.type,color:C.sub,icon:"•"};
              return (
                <div key={l.id} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{width:38,height:38,borderRadius:"50%",background:info.color+"18",border:`1px solid ${info.color}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                    {info.icon}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:2}}>{info.label}</div>
                    <div style={{fontSize:11,color:C.muted}}>{l.date} · {l.note}</div>
                  </div>
                  <div style={{fontSize:15,fontWeight:700,color:l.amount>0?info.color:C.red,flexShrink:0}}>
                    {l.amount>0?"+":""}{l.amount.toLocaleString()} pt
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function InvitePage({ user, members }) {
  const mob = useIsMobile();
  const [copied, setCopied] = useState(false);
  const inviteUrl = `${window.location.origin}?ref=${user.userId}`;
  const copy = () => {
    navigator.clipboard?.writeText(inviteUrl).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false), 2000);
  };
  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}><Share2 size={20}/> 招待リンク</div>
      <div style={{...sh.card,padding:mob?16:28,marginBottom:14}}>
        <div style={{fontSize:13,color:C.sub,lineHeight:1.8,marginBottom:16}}>
          あなたの招待リンクを友人にシェアしましょう。<br/>
          紹介した方が入金した際、入金額の <strong style={{color:C.yellow}}>20%</strong> が出金可能ポイントに付与されます。
        </div>
        <div style={{marginBottom:14}}>
          <label style={sh.label}>あなたの紹介コード</label>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:"#00e5ff14",border:`2px solid ${C.accent}44`,borderRadius:10}}>
            <span style={{fontSize:22,fontWeight:700,color:C.accent,letterSpacing:3,flex:1}}>{user.userId}</span>
            <button onClick={()=>{navigator.clipboard?.writeText(user.userId).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),2000);}} style={{background:C.accent,color:"#000",border:"none",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:12,flexShrink:0}}>コピー</button>
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={sh.label}>招待URL</label>
          <div style={{background:"#0a1220",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.sub,wordBreak:"break-all",fontFamily:"monospace",marginBottom:8}}>{inviteUrl}</div>
          <button style={sh.btn(copied?"ghost":"accent")} onClick={copy}>{copied?"✓ コピーしました":"招待URLをコピー"}</button>
        </div>
        <div style={{padding:"12px 14px",background:"#fbbf2410",border:"1px solid #fbbf2430",borderRadius:10,fontSize:12,color:C.sub,lineHeight:1.8}}>
          <strong style={{color:C.yellow}}>紹介報酬の仕組み（多段階）</strong><br/>
          <strong style={{color:C.green}}>1段階</strong> 10% / <strong style={{color:C.yellow}}>2段階</strong> 5% / <strong style={{color:"#6366f1"}}>3段階</strong> 3% / <strong style={{color:C.muted}}>4段階</strong> 2%<br/>
          例: 1,000pt入金 → 1段階 <strong style={{color:C.green}}>100pt</strong> / 2段階 <strong style={{color:C.yellow}}>50pt</strong> / 3段階 <strong style={{color:"#6366f1"}}>30pt</strong> / 4段階以降 <strong style={{color:C.sub}}>10pt</strong>
        </div>
      </div>
      <div style={{...sh.card,padding:"16px"}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>👥 紹介した会員</div>
        {members.filter(m=>m.referrerId===user.id).length===0 ? (
          <div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:13}}>まだ紹介した会員がいません</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {members.filter(m=>m.referrerId===user.id).map(m => (
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:C.surface,borderRadius:10}}>
                <Avatar name={m.name} size={36}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.accent}}>{maskId(m.userId)}</div>
                  <div style={{fontSize:11,color:C.muted}}>登録日: {m.joinedAt}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:12,color:C.sub}}>入金</div>
                  <div style={{fontSize:13,fontWeight:700,color:C.accent}}>{m.depositPt.toLocaleString()} pt</div>
                  {m.depositPt>0 && <div style={{fontSize:11,color:C.yellow}}>報酬 {fl1(m.depositPt*0.2).toLocaleString()} pt</div>}
                </div>
              </div>
            ))}
            {(()=>{
              const direct = members.filter(m=>m.referrerId===user.id);
              const bonus1 = fl1(direct.reduce((a,m)=>a+m.depositPt*0.2,0));
              const bonus2 = fl1(direct.flatMap(m=>members.filter(x=>x.referrerId===m.id)).reduce((a,m)=>a+m.depositPt*0.05,0));
              return(
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1,padding:"10px 12px",background:C.green+"14",border:`1px solid ${C.green}33`,borderRadius:8,textAlign:"center"}}>
                    <div style={{fontSize:10,color:C.sub,marginBottom:2}}>1段階累計報酬</div>
                    <div style={{fontSize:13,fontWeight:700,color:C.green}}>{bonus1.toLocaleString()} pt</div>
                  </div>
                  <div style={{flex:1,padding:"10px 12px",background:C.yellow+"14",border:`1px solid ${C.yellow}33`,borderRadius:8,textAlign:"center"}}>
                    <div style={{fontSize:10,color:C.sub,marginBottom:2}}>2段階累計報酬</div>
                    <div style={{fontSize:13,fontWeight:700,color:C.yellow}}>{bonus2.toLocaleString()} pt</div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

function NotifyPage({ notices, mob }) {
  const [read, setRead] = useState([]);
  return (
    <div>
      <div style={{...sh.title(mob||false),display:"flex",alignItems:"center",gap:10}}><Bell size={20}/> お知らせ</div>
      {notices.length===0 ? (
        <div style={{...sh.card,padding:40,textAlign:"center",color:C.muted}}>お知らせはありません</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {notices.map(n => {
            const isRead = read.includes(n.id);
            return (
              <div key={n.id} onClick={()=>setRead(p=>[...p,n.id])} style={{...sh.card,padding:"16px 18px",borderColor:n.important&&!isRead?"#fbbf2466":C.border,cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <div style={{flexShrink:0,marginTop:2}}>
                    {n.important ? <span style={{fontSize:18}}>📢</span> : <span style={{fontSize:18}}>📋</span>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                      <span style={{fontSize:14,fontWeight:700,color:isRead?C.sub:C.text}}>{n.title}</span>
                      {n.important&&!isRead && <span style={{background:"#fbbf2422",color:C.yellow,border:"1px solid #fbbf2444",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700}}>重要</span>}
                      {!isRead && <span style={{width:7,height:7,borderRadius:"50%",background:C.accent,display:"inline-block",marginLeft:"auto"}}/>}
                    </div>
                    <div style={{fontSize:12,color:C.sub,lineHeight:1.7}}>{n.body}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:6}}>{n.date}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserMessagesPage({ user }) {
  const mob = useIsMobile();
  const msgs = user.messages || [];
  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}><MessageCircle size={20}/> 運営からのメッセージ</div>
      {msgs.length===0 ? (
        <div style={{...sh.card,padding:40,textAlign:"center",color:C.muted}}>
          <div style={{fontSize:32,marginBottom:8}}>💬</div>
          <div>運営からのメッセージはありません</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {msgs.map((m,i) => (
            <div key={i} style={{...sh.card,padding:"16px 18px",borderColor:!m.read?C.accent+"44":C.border}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:m.type==="success"?C.green:m.type==="warning"?"#f97316":C.accent,flexShrink:0,marginTop:4}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text}}>運営より</div>
                  <div style={{fontSize:10,color:C.muted}}>{m.date}</div>
                </div>
                {!m.read && <span style={sh.badge(C.accent)}>NEW</span>}
              </div>
              <div style={{fontSize:13,color:C.sub,lineHeight:1.8,paddingLeft:40}}>{m.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfilePage({ user, members, setMembers, setUser, withdrawals }) {
  const mob = useIsMobile();
  const [pwForm, setPwForm] = useState({current:"",newPw:"",confirm:""});
  const [msg, setMsg] = useState(null);

  const validatePw = pw => {
    if (pw.length<6) return "6文字以上で入力してください";
    if (!/[a-zA-Z]/.test(pw)) return "英字を含めてください";
    if (!/[0-9]/.test(pw)) return "数字を含めてください";
    return null;
  };

  const changePw = () => {
    setMsg(null);
    if (!pwForm.current||!pwForm.newPw||!pwForm.confirm) return setMsg({t:"err",text:"すべての項目を入力してください"});
    if (pwForm.current !== user.password) return setMsg({t:"err",text:"現在のパスワードが違います"});
    const err = validatePw(pwForm.newPw);
    if (err) return setMsg({t:"err",text:err});
    if (pwForm.newPw !== pwForm.confirm) return setMsg({t:"err",text:"新しいパスワードが一致しません"});
    if (pwForm.current === pwForm.newPw) return setMsg({t:"err",text:"現在と同じパスワードは使用できません"});
    setMembers(p => p.map(m => m.id===user.id ? {...m,password:pwForm.newPw} : m));
    setUser(u => ({...u,password:pwForm.newPw}));
    setPwForm({current:"",newPw:"",confirm:""});
    setMsg({t:"ok",text:"パスワードを変更しました"});
  };

  const rank = getMemberRank(user, members);
  const refCount = members.filter(m => m.referrerId===user.id).length;

  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}><User size={20}/> プロフィール</div>
      {/* 会員情報 */}
      <div style={{...sh.card,padding:"20px",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:C.accent2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:"#fff",flexShrink:0}}>
            {user.name.slice(0,1)}
          </div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:C.text}}>{user.name}</div>
            <div style={{fontSize:13,color:C.accent}}>@{user.userId}</div>
            <div style={{marginTop:4}}><RankBadge rank={rank} size="sm"/></div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
          {[
            {label:"会員ID",       val:user.userId,                            c:C.accent},
            {label:"登録日",       val:user.joinedAt,                          c:C.sub},
            {label:"入金pt",       val:user.depositPt.toLocaleString()+" pt",  c:C.accent},
            {label:"出金可能pt",   val:user.withdrawablePt.toLocaleString()+" pt", c:C.green},
            {label:"直接紹介数",   val:refCount+" 人",                         c:C.yellow},
            {label:"KYCステータス",val:user.kyc?.idStatus==="approved"?"✓ 完了":"未完了", c:user.kyc?.idStatus==="approved"?C.green:C.muted},
            {label:"規約同意日時",  val:user.agreedAt||"記録なし",                     c:C.muted},
          ].map(({label,val,c}) => (
            <div key={label} style={{background:C.surface,borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:2}}>{label}</div>
              <div style={{fontSize:13,fontWeight:700,color:c}}>{val}</div>
            </div>
          ))}
        </div>
        {/* 累計受取報酬 */}
        <div style={{marginTop:12,padding:"12px 14px",background:`linear-gradient(135deg,${C.green}14,${C.yellow}0a)`,border:`1px solid ${C.green}33`,borderRadius:10}}>
          <div style={{fontSize:10,color:C.sub,marginBottom:4}}>累計受取報酬（日利＋紹介報酬）</div>
          <div style={{fontSize:24,fontWeight:700,color:C.green}}>
            {fl1(user.withdrawablePt + (withdrawals||[]).filter(w=>w.userId===user.id&&w.status==="承認").reduce((a,w)=>a+w.amount,0)).toLocaleString()}
            <span style={{fontSize:13,color:C.sub,fontWeight:400,marginLeft:4}}>pt 以上</span>
          </div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>現在の出金可能pt ＋ 承認済み出金額の合計</div>
        </div>
      </div>
      {/* ログイン履歴 */}
      <div style={{...sh.card,padding:"16px 20px",marginBottom:14}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>🕐 ログイン履歴</div>
        {(user.loginHistory||[]).length===0 ? (
          <div style={{fontSize:12,color:C.muted}}>履歴がありません</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {(user.loginHistory||[]).slice(0,5).map((h,i) => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:i===0?C.accent+"0e":C.surface,borderRadius:8,border:`1px solid ${i===0?C.accent+"33":C.border}`}}>
                <span style={{fontSize:16}}>{h.device==="PC"?"🖥️":"📱"}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:C.text,fontWeight:i===0?700:400}}>{h.device}</div>
                  <div style={{fontSize:10,color:C.muted}}>{h.date}</div>
                </div>
                {i===0 && <span style={{fontSize:10,color:C.accent,fontWeight:700}}>最新</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* パスワード変更 */}
      <div style={{...sh.card,padding:"20px"}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>🔑 パスワード変更</div>
        {[
          {key:"current",label:"現在のパスワード",        ph:"現在のパスワード"},
          {key:"newPw",  label:"新しいパスワード",        ph:"英字+数字を含む6文字以上"},
          {key:"confirm",label:"新しいパスワード（確認）",ph:"もう一度入力"},
        ].map(f => (
          <div key={f.key} style={{marginBottom:14}}>
            <label style={sh.label}>{f.label}</label>
            <input type="password" value={pwForm[f.key]} onChange={e=>setPwForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph} style={{...sh.input, borderColor:f.key==="confirm"&&pwForm.confirm&&pwForm.newPw?(pwForm.confirm===pwForm.newPw?"#10b981":"#ef4444"):undefined}}/>
            {f.key==="confirm"&&pwForm.confirm&&pwForm.newPw && (
              <div style={{fontSize:11,marginTop:4,color:pwForm.confirm===pwForm.newPw?"#10b981":"#ef4444"}}>
                {pwForm.confirm===pwForm.newPw?"✓ 一致しています":"✗ 一致しません"}
              </div>
            )}
          </div>
        ))}
        {msg && <div style={{padding:"8px 12px",borderRadius:8,background:msg.t==="ok"?C.green+"18":C.red+"18",border:`1px solid ${msg.t==="ok"?C.green:C.red}`,color:msg.t==="ok"?C.green:C.red,fontSize:13,marginBottom:8}}>{msg.t==="ok"?"✓ ":""}{msg.text}</div>}
        <button style={sh.btn("accent")} onClick={changePw}>パスワードを変更する</button>
      </div>
    </div>
  );
}

function TermsPage({ showAgree, onAgree }) {
  const mob = useIsMobile();
  const [tab, setTab] = useState("terms");
  const sections = tab==="terms" ? [
    {title:"第1条（サービスの目的）",  body:"本サービスは、会員がUSDTを入金することでポイントを取得し、日利報酬を受け取ることができるポイント管理サービスです。"},
    {title:"第2条（収益モデルについて）", body:"当サービスの報酬原資は、以下の3つの手法によって生み出されています。\n\n【アービトラージ取引】\n複数の暗号資産取引所間に生じるUSDTの価格差を利用した裁定取引（アービトラージ）を行い、その差益を収益として計上しています。\n\n【ステーキング】\n保有するUSDTおよび対応する暗号資産を各種ブロックチェーンネットワークのバリデーター・流動性プールに提供するステーキングを行い、そのステーキング報酬を収益として計上しています。\n\n【AIによる自動運用】\n独自開発のAIシステムが市場データをリアルタイムで分析し、最適なタイミングでの取引・運用を自動で実行することにより収益を最大化しています。AIは24時間365日稼働し、人的判断を超えた高速・高精度な運用を実現しています。\n\nこれらの収益の一部を、入金ポイントに応じた日利報酬として会員の皆様に還元しています。"},
    {title:"第3条（会員登録）",        body:"本サービスの利用には会員登録が必要です。登録時に虚偽の情報を提供することは禁止します。ユーザーIDおよびパスワードの管理は会員自身の責任で行ってください。"},
    {title:"第4条（入金・ポイント）",  body:"入金されたUSDTは入金ポイントとして反映されます。入金ポイントは出金できません。出金可能ポイントは日利報酬・紹介報酬によって付与されます。なお、出金可能ポイントを入金ポイントへ振替することができますが、振替後は元に戻すことができません。入金ポイントから出金可能ポイントへの逆振替はできません。"},
    {title:"第5条（出金）",            body:"出金申請には本人確認（KYC）の完了が必要です。出金時には1%の手数料が発生します。最低出金額は100ptです。審査には1〜3営業日かかります。"},
    {title:"第6条（紹介報酬）",        body:"紹介した会員が入金した際、多段階の紹介報酬が付与されます。1段階目（直接紹介）は入金額の10%、2段階目は5%、3段階目は3%、4段階目は2%（5段階以降なし）が各紹介者の出金可能ポイントとして付与されます。不正な紹介行為が確認された場合は報酬を取り消す場合があります。"},
    {title:"第7条（禁止事項）",        body:"以下の行為を禁止します：①虚偽の情報による登録②不正アクセス③他者への迷惑行為④法令に違反する行為⑤その他当社が不適切と判断する行為"},
    {title:"第8条（免責事項）",        body:"当サービスは投資サービスではありません。ポイントの価値変動・損失について当社は責任を負いません。"},
    {title:"第9条（規約の変更）",      body:"本規約は予告なく変更される場合があります。変更後も継続してサービスを利用した場合、変更後の規約に同意したものとみなします。"},
  ] : [
    {title:"収集する情報",   body:"当サービスでは以下の情報を収集します：ユーザーID・氏名・生年月日・住所・電話番号・身分証明書の画像・取引履歴"},
    {title:"情報の利用目的", body:"収集した情報は以下の目的で使用します：①本人確認②サービスの提供・改善③不正利用の防止④法令に基づく対応"},
    {title:"情報の管理",     body:"収集した個人情報は適切なセキュリティ対策のもと管理します。第三者への提供は法令に基づく場合を除き行いません。"},
    {title:"お問い合わせ",   body:"個人情報の取り扱いに関するお問い合わせは公式Telegramサポートまでご連絡ください。"},
  ];

  const companyInfo = {
    copyright: "© 2026 POINTNET | 全著作権所有",
    name:    "Medium Rare N.V.",
    address: "Seru Loraweg 15 B, Curaçao",
    agents:  "Medium Rare Limited と MRS Tech Limited",
  };
  return (
    <div>
      <div style={{fontSize:mob?17:20,fontWeight:700,marginBottom:16,color:C.accent,letterSpacing:2,display:"flex",alignItems:"center",gap:10}}>
        <FileText size={20}/> {showAgree?"利用規約への同意":"利用規約 / プライバシーポリシー"}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[{id:"terms",label:"利用規約"},{id:"privacy",label:"プライバシーポリシー"}].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,background:tab===t.id?C.accent:"transparent",color:tab===t.id?"#000":C.sub,border:`1px solid ${tab===t.id?C.accent:C.border}`,borderRadius:8,padding:"9px 0",cursor:"pointer",fontWeight:700,fontSize:13}}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{...sh.card,padding:"16px 20px",marginBottom:14,maxHeight:400,overflowY:"auto"}}>
        {sections.map((s,i) => (
          <div key={i} style={{marginBottom:18}}>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:6}}>{s.title}</div>
            <div style={{fontSize:12,color:C.sub,lineHeight:1.9}}>{s.body}</div>
          </div>
        ))}
      </div>
      {showAgree && <button style={sh.btn("accent")} onClick={onAgree}>同意して登録する</button>}

      {/* 運営会社情報 */}
      <div style={{marginTop:20,padding:"16px 18px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10}}>
        <div style={{fontSize:11,fontWeight:700,color:C.sub,letterSpacing:1,marginBottom:10}}>運営会社情報</div>
        <div style={{fontSize:12,color:C.muted,lineHeight:2}}>
          <div style={{fontWeight:700,color:C.sub,marginBottom:4}}>{companyInfo.copyright}</div>
          <div>POINTNETは <strong style={{color:C.sub}}>{companyInfo.name}</strong> によって所有および運営されています。登録住所：<span style={{color:C.sub}}>{companyInfo.address}</span></div>
          <div>支払い代行会社は <span style={{color:C.sub}}>{companyInfo.agents}</span> です。</div>
          <div>お問い合わせ：
            <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" style={{color:C.accent,textDecoration:"none",margin:"0 4px"}}>公式Telegram</a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SETTINGS PAGE ──────────────────────────────
const SETTINGS_MENU = [
  {id:"history",  label:"ポイント履歴",       Icon:History,        desc:"入金・日利・紹介報酬・出金の履歴"},
  {id:"invite",   label:"招待リンク",         Icon:Share2,         desc:"友人を招待して報酬を受け取る"},
  {id:"notify",   label:"お知らせ",           Icon:Bell,           desc:"運営からのお知らせ"},
  {id:"kyc",      label:"本人確認",           Icon:ShieldCheck,    desc:"KYC認証・身分証のアップロード"},
  {id:"messages", label:"運営からのメッセージ",Icon:MessageCircle,  desc:"運営からの個別メッセージを確認"},
  {id:"profile",  label:"プロフィール",       Icon:User,           desc:"パスワード変更など"},
  {id:"terms",    label:"利用規約",           Icon:FileText,       desc:"利用規約・プライバシーポリシー"},
];

function SettingsPage({ user, members, setMembers, setUser, withdrawals, notices }) {
  const mob = useIsMobile();
  const [subPage, setSubPage] = useState(null);
  const back = () => setSubPage(null);

  if (subPage==="history")  return <div><BackBtn onClick={back}/><HistoryPage user={user} members={members} withdrawals={withdrawals}/></div>;
  if (subPage==="invite")   return <div><BackBtn onClick={back}/><InvitePage user={user} members={members}/></div>;
  if (subPage==="notify")   return <div><BackBtn onClick={back}/><NotifyPage notices={notices} mob={mob}/></div>;
  if (subPage==="kyc")      return <div><BackBtn onClick={back}/><KycPage user={user} members={members} setMembers={setMembers} setUser={setUser}/></div>;
  if (subPage==="messages") return <div><BackBtn onClick={back}/><UserMessagesPage user={user}/></div>;
  if (subPage==="wdAddress") return <div><BackBtn onClick={back}/><WithdrawalAddressPage user={user} members={members} setMembers={setMembers} setUser={setUser}/></div>;
  if (subPage==="profile")  return <div><BackBtn onClick={back}/><ProfilePage user={user} members={members} setMembers={setMembers} setUser={setUser} withdrawals={withdrawals}/></div>;
  if (subPage==="terms")    return <div><BackBtn onClick={back}/><TermsPage showAgree={false}/></div>;

  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}><Settings size={20}/> 設定</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {SETTINGS_MENU.map(item => {
          const unreadMsg   = item.id==="messages" && (user.messages||[]).filter(m=>!m.read).length>0;
          const unreadNotify = item.id==="notify"  && notices.length>0;
          const showBadge   = unreadMsg || unreadNotify;
          const kycStatus   = item.id==="kyc" && (
            user.kyc?.idStatus==="approved" ? <span style={sh.badge(C.green)}>✓ 完了</span>
            : user.kyc?.idStatus==="pending"  ? <span style={sh.badge(C.yellow)}>⏳ 審査中</span>
            : <span style={sh.badge(C.muted)}>未提出</span>
          );
          return (
            <div key={item.id} onClick={()=>setSubPage(item.id)}
              style={{...sh.card,padding:"16px 18px",display:"flex",alignItems:"center",gap:14,cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent+"66"}
              onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
              <div style={{width:44,height:44,borderRadius:12,background:C.surface,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative"}}>
                <item.Icon size={20} color={C.accent}/>
                {showBadge && <span style={{position:"absolute",top:-4,right:-4,background:C.red,color:"#fff",borderRadius:99,fontSize:9,padding:"1px 5px",fontWeight:700,minWidth:16,textAlign:"center"}}>NEW</span>}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,fontWeight:700,color:C.text}}>{item.label}</span>
                  {kycStatus}
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{item.desc}</div>
              </div>
              <span style={{color:C.muted,fontSize:18,flexShrink:0}}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:6,background:"transparent",border:"none",color:C.sub,cursor:"pointer",fontSize:13,padding:"0 0 16px 0",fontWeight:600}}>
      ‹ 設定へ戻る
    </button>
  );
}

// ── DEPOSIT REQUEST PAGE ───────────────────────
function DepositRequestPage({ user, depositRequests, setDepositRequests }) {
  const mob = useIsMobile();
  const [subTab,   setSubTab]   = useState("form");
  const [currency, setCurrency] = useState("USDT");
  const [network,  setNetwork]  = useState("TRC-20");
  const [amount,   setAmount]   = useState("");
  const [txHash,   setTxHash]   = useState("");
  const [confirm,  setConfirm]  = useState(false);
  const [msg,      setMsg]      = useState(null);
  const myReqs = (depositRequests||[]).filter(r => r.userId===user.id);
  const statusColor = s => s==="承認"?C.green:s==="却下"?C.red:C.yellow;
  const statusLabel = s => s==="承認"?"✓ 反映済":s==="却下"?"✗ 却下":"⏳ 確認中";
  const [liveRates, setLiveRates] = useState({});
  const [rateLoading, setRateLoading] = useState(false);
  const [rateUpdated, setRateUpdated] = useState("");

  // CoinGecko APIでリアルタイムレート取得
  useEffect(()=>{
    const fetchRates = async () => {
      setRateLoading(true);
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd");
        const data = await res.json();
        setLiveRates({
          BTC: data.bitcoin?.usd || 0,
          ETH: data.ethereum?.usd || 0,
          SOL: data.solana?.usd || 0,
        });
        setRateUpdated(new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}));
      } catch(e) {
        // API失敗時は固定レートを使用
      } finally {
        setRateLoading(false);
      }
    };
    fetchRates();
    const t = setInterval(fetchRates, 60000); // 1分ごとに更新
    return () => clearInterval(t);
  },[]);

  const getRate = (cid) => {
    if (cid==="USDT") return 1;
    return liveRates[cid] || CURRENCIES.find(c=>c.id===cid)?.rate || 1;
  };

  const cur = CURRENCIES.find(c=>c.id===currency)||CURRENCIES[0];
  const currentRate = getRate(currency);
  const usdtAmount = amount ? fl1(parseFloat(amount) * currentRate) : 0;
  const minAmount = currency==="USDT" ? 100 : fl1(100/currentRate);

  const handleCurrencyChange = (cid) => {
    setCurrency(cid);
    const c = CURRENCIES.find(x=>x.id===cid);
    setNetwork(c?.networks[0]||"");
    setAmount("");
  };

  const submit = () => {
    setMsg(null);
    const amt = parseFloat(amount);
    if (!amt||amt<=0) return setMsg({t:"err",text:"送金額を入力してください"});
    if (usdtAmount < 100) return setMsg({t:"err",text:`最低入金額は100 USDT相当（約${minAmount} ${currency}）です`});
    if (!confirm) return setMsg({t:"err",text:"内容を確認してチェックを入れてください"});
    const req = {
      id:"dr"+Math.random().toString(36).slice(2,8),
      userId:user.id, userName:user.name, userUid:user.userId,
      currency, network, amount:amt, usdtAmount,
      txHash:txHash.trim(), status:"確認中", createdAt:now(), processedAt:null
    };
    setDepositRequests(p => [...(p||[]),req]);
    setMsg({t:"ok",text:`送金報告を受け付けました。${amt} ${currency}（約${usdtAmount.toLocaleString()} USDT相当）確認後に反映いたします。`});
    setAmount(""); setTxHash(""); setConfirm(false);
    setTimeout(()=>setSubTab("history"),2000);
  };

  return (
    <div>
      <div style={{...sh.title(mob),display:"flex",alignItems:"center",gap:10}}><ArrowDownCircle size={20} style={{flexShrink:0}}/> 入金</div>
      <div style={{padding:"10px 14px",background:"#7c3aed14",border:"1px solid #7c3aed33",borderRadius:10,marginBottom:14,fontSize:12,color:C.sub,lineHeight:1.8}}>
        💡 まず下記の入金アドレスにUSDTを送金してから、送金完了をこちらで報告してください。管理者が確認後にポイントを反映します。
      </div>
      {/* 送金先アドレス（全通貨アコーディオン） */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:10,letterSpacing:1}}>送金先アドレス</div>
        {CURRENCIES.map(c => <DepositAddressAccordion key={c.id} currency={c} mob={mob}/>)}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[{id:"form",label:"📝 送金報告"},{id:"history",label:"📋 報告履歴"}].map(t => (
          <button key={t.id} onClick={()=>setSubTab(t.id)} style={{flex:1,background:subTab===t.id?C.accent:"transparent",color:subTab===t.id?"#000":C.sub,border:`1px solid ${subTab===t.id?C.accent:C.border}`,borderRadius:8,padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:13}}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab==="form" && (
        <div style={{...sh.card,padding:mob?16:28,maxWidth:520}}>
          {/* 通貨選択 */}
          <div style={{marginBottom:16}}>
            <label style={sh.label}>送金した通貨</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {CURRENCIES.map(c => (
                <div key={c.id} onClick={()=>handleCurrencyChange(c.id)}
                  style={{padding:"10px 16px",borderRadius:10,border:`2px solid ${currency===c.id?c.color:C.border}`,background:currency===c.id?c.color+"18":"transparent",cursor:"pointer",transition:"all .15s",minWidth:70,textAlign:"center"}}>
                  <div style={{fontSize:18,marginBottom:2}}>{c.icon}</div>
                  <div style={{fontSize:12,fontWeight:700,color:currency===c.id?c.color:C.sub}}>{c.id}</div>
                  <div style={{fontSize:9,color:currency===c.id?c.color:C.muted}}>{c.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ネットワーク選択 */}
          {cur.networks.length > 1 && (
            <div style={{marginBottom:16}}>
              <label style={sh.label}>ネットワーク</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {cur.networks.map(n => (
                  <div key={n} onClick={()=>setNetwork(n)}
                    style={{padding:"8px 16px",borderRadius:8,border:`2px solid ${network===n?cur.color:C.border}`,background:network===n?cur.color+"18":"transparent",cursor:"pointer",fontSize:12,fontWeight:700,color:network===n?cur.color:C.sub}}>
                    {n}
                  </div>
                ))}
              </div>
            </div>
          )}



          {/* 送金額 */}
          <div style={{marginBottom:16}}>
            <label style={sh.label}>送金額（{cur.id}）</label>
            <input type="number" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder={`例: ${cur.id==="USDT"?"100":"0.001"}`} style={sh.input}/>
            {amount && parseFloat(amount) > 0 && (
              <div style={{marginTop:6,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:usdtAmount>=100?C.green:C.red,fontWeight:700}}>
                  ≈ {usdtAmount.toLocaleString()} USDT → {usdtAmount>=100?usdtAmount.toLocaleString()+" pt":"100 USDT未満"} {usdtAmount>=100?"が付与されます":"（最低100 USDT相当〜）"}
                </span>
              </div>
            )}
          </div>

          {/* TXハッシュ */}
          <div style={{marginBottom:20}}>
            <label style={sh.label}>TXハッシュ（送金完了後に入力すると確認が早まります）</label>
            <input type="text" value={txHash} onChange={e=>setTxHash(e.target.value)} placeholder="送金のTXハッシュを入力" style={{...sh.input,fontFamily:"monospace",fontSize:12}} autoCapitalize="none" autoCorrect="off"/>
          </div>

          <div onClick={()=>setConfirm(c=>!c)} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",background:confirm?"#10b98114":"#0a1220",border:`1px solid ${confirm?C.green:C.border}`,borderRadius:8,cursor:"pointer",marginBottom:16}}>
            <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${confirm?C.green:C.muted}`,background:confirm?C.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
              {confirm && <span style={{color:"#000",fontSize:12,fontWeight:700}}>✓</span>}
            </div>
            <span style={{fontSize:12,color:C.sub,lineHeight:1.6}}>送金が完了していることを確認しました</span>
          </div>
          {msg && (
            <div style={{padding:"10px 14px",borderRadius:8,background:msg.t==="ok"?C.green+"18":C.red+"18",border:`1px solid ${msg.t==="ok"?C.green:C.red}`,color:msg.t==="ok"?C.green:C.red,fontSize:13,marginBottom:8}}>
              {msg.text}
            </div>
          )}
          <button style={{...sh.btn("accent"),opacity:confirm?1:0.5}} onClick={submit}>送金を報告する</button>
        </div>
      )}

      {subTab==="history" && (
        <div style={{...sh.card,overflow:"hidden"}}>
          {myReqs.length===0 ? (
            <div style={{padding:40,textAlign:"center",color:C.muted}}><div style={{fontSize:32,marginBottom:12}}>📭</div><div>報告履歴がありません</div></div>
          ) : (
            <div style={{display:"flex",flexDirection:"column"}}>
              {[...myReqs].reverse().map(r => (
                <div key={r.id} style={{padding:"16px",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                        {(()=>{ const c=CURRENCIES.find(x=>x.id===(r.currency||"USDT"))||CURRENCIES[0]; return <span style={{background:c.color+"22",color:c.color,border:`1px solid ${c.color}44`,borderRadius:6,padding:"2px 8px",fontSize:12,fontWeight:700}}>{c.icon} {c.id}</span>; })()}
                        {r.network && <span style={{fontSize:11,color:C.muted}}>{r.network}</span>}
                      </div>
                      <div style={{fontSize:15,fontWeight:700,color:C.accent}}>{r.amount.toLocaleString()} {r.currency||"USDT"}</div>
                      {r.usdtAmount && r.currency!=="USDT" && <div style={{fontSize:11,color:C.green,marginTop:2}}>≈ {r.usdtAmount.toLocaleString()} USDT → {r.usdtAmount.toLocaleString()} pt</div>}
                      <div style={{fontSize:11,color:C.sub,marginTop:2}}>{r.createdAt}</div>
                    </div>
                    <span style={sh.badge(statusColor(r.status))}>{statusLabel(r.status)}</span>
                  </div>
                  {r.txHash && <div style={{fontSize:11,color:C.muted,fontFamily:"monospace",wordBreak:"break-all"}}>TX: {r.txHash}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── WELCOME PAGE ───────────────────────────────
function WelcomePage({ user, onClose }) {
  const mob = useIsMobile();
  const [step, setStep] = useState(0);
  const steps = [
    {Icon:()=><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00e5ff" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>, title:"入金してポイントを獲得", desc:"USDTを入金すると入金ポイントが付与されます。入金ポイントは出金できませんが、毎日の日利計算のベースになります。", action:"次へ"},
    {Icon:()=><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>, title:"毎日報酬を受け取ろう", desc:"23時間ごとに「報酬受取」ボタンを押すと、日利分が出金可能ポイントに加算されます。忘れずに毎日受け取りましょう！", action:"次へ"},
    {Icon:()=><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>, title:"友人を招待して報酬をもらおう", desc:"招待した方が入金すると、入金額の20%があなたの出金可能ポイントに付与されます。設定の「招待リンク」からシェアしましょう。", action:"次へ"},
    {Icon:()=><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>, title:"出金可能ポイントを引き出そう", desc:"出金可能ポイントが100pt以上になったら出金申請ができます。事前に本人確認（KYC）を完了させてください。", action:"はじめる"},
  ];
  const s = steps[step];
  return (
    <div style={{position:"fixed",inset:0,background:"#000c",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"32px 28px",width:"100%",maxWidth:400,boxShadow:`0 0 80px #00e5ff18`}}>
        <div style={{display:"flex",gap:4,marginBottom:24,justifyContent:"center"}}>
          {steps.map((_,i) => (
            <div key={i} style={{height:3,flex:1,borderRadius:99,background:i<=step?C.accent:C.muted,transition:"background .3s"}}/>
          ))}
        </div>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><s.Icon/></div>
          <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:10}}>{s.title}</div>
          <div style={{fontSize:13,color:C.sub,lineHeight:1.9}}>{s.desc}</div>
        </div>
        <button style={{...sh.btn("accent"),marginTop:20,fontSize:15}} onClick={()=>step<steps.length-1?setStep(s=>s+1):onClose()}>
          {s.action}
        </button>
        <button style={{background:"transparent",border:"none",color:C.muted,fontSize:12,cursor:"pointer",width:"100%",marginTop:10,padding:"6px"}} onClick={onClose}>
          スキップ
        </button>
      </div>
    </div>
  );
}

// ── ADMIN PAGE ─────────────────────────────────
function AdminNoticeForm({ setNotices }) {
  const [form, setForm] = useState({title:"",body:"",important:false});
  const [err, setErr] = useState("");
  const submit = () => {
    if (!form.title||!form.body) return setErr("タイトルと本文を入力してください");
    setNotices(p => [{id:"n"+Date.now(),title:form.title,body:form.body,important:form.important,date:new Date().toISOString().slice(0,10)},...p]);
    setForm({title:"",body:"",important:false}); setErr("");
  };
  return (
    <div>
      <div style={{marginBottom:10}}>
        <label style={sh.label}>タイトル</label>
        <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} style={sh.input} placeholder="お知らせのタイトル"/>
      </div>
      <div style={{marginBottom:10}}>
        <label style={sh.label}>本文</label>
        <textarea value={form.body} onChange={e=>setForm(p=>({...p,body:e.target.value}))} style={{...sh.input,minHeight:80,resize:"vertical"}} placeholder="お知らせの内容"/>
      </div>
      <div onClick={()=>setForm(p=>({...p,important:!p.important}))} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:10}}>
        <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${form.important?C.yellow:C.muted}`,background:form.important?C.yellow:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          {form.important && <span style={{color:"#000",fontSize:12,fontWeight:700}}>✓</span>}
        </div>
        <span style={{fontSize:13,color:C.sub}}>重要なお知らせとしてマーク</span>
      </div>
      {err && <div style={{color:C.red,fontSize:12,marginBottom:8}}>{err}</div>}
      <button style={{...sh.btn("accent"),marginTop:0}} onClick={submit}>お知らせを配信する</button>
    </div>
  );
}

function AdminMessagePanel({ members, setMembers }) {
  const [target, setTarget] = useState("all");
  const [msgText, setMsgText] = useState("");
  const [sent, setSent] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = members.filter(m => m.userId?.toLowerCase().includes(search.toLowerCase())||m.name?.toLowerCase().includes(search.toLowerCase()));
  const sendMessage = () => {
    if (!msgText.trim()) return;
    const newMsg = createNotice(msgText.trim(), "info");
    setMembers(p => p.map(m => (target==="all"||m.id===target) ? {...m,messages:[newMsg,...(m.messages||[])]} : m));
    setMsgText(""); setSent(true); setTimeout(()=>setSent(false),3000);
  };
  return (
    <div>
      <div style={{...sh.card,padding:"16px 20px",marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:14}}>メッセージを送信</div>
        <div style={{marginBottom:12}}>
          <label style={sh.label}>送信先</label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
            <div onClick={()=>setTarget("all")} style={{padding:"8px 16px",borderRadius:8,border:`2px solid ${target==="all"?C.accent:C.border}`,background:target==="all"?C.accent+"18":"transparent",cursor:"pointer",fontSize:13,color:target==="all"?C.accent:C.sub,fontWeight:target==="all"?700:400}}>
              全会員
            </div>
            {filtered.map(m => (
              <div key={m.id} onClick={()=>setTarget(m.id)} style={{padding:"8px 16px",borderRadius:8,border:`2px solid ${target===m.id?C.accent:C.border}`,background:target===m.id?C.accent+"18":"transparent",cursor:"pointer",fontSize:12,color:target===m.id?C.accent:C.sub}}>
                {m.userId}
              </div>
            ))}
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ユーザーIDで絞り込み..." style={{...sh.input,fontSize:13}}/>
        </div>
        <div style={{marginBottom:12}}>
          <label style={sh.label}>メッセージ内容</label>
          <textarea value={msgText} onChange={e=>setMsgText(e.target.value)} placeholder="会員に送るメッセージを入力..." style={{...sh.input,minHeight:90,resize:"vertical",lineHeight:1.7}}/>
        </div>
        {sent && <div style={{color:C.green,fontSize:13,marginBottom:8,fontWeight:700}}>✓ 送信しました</div>}
        <button style={{...sh.btn("accent"),opacity:msgText.trim()?1:0.5,marginTop:0}} onClick={sendMessage}>
          {target==="all"?"全会員に送信":`${members.find(m=>m.id===target)?.userId||""}に送信`}
        </button>
      </div>
      <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:10,letterSpacing:1}}>会員別メッセージ履歴</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {members.filter(m=>(m.messages||[]).length>0).map(m => (
          <div key={m.id} style={{...sh.card,padding:"14px 16px"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:8}}>{m.userId} <span style={{fontSize:11,color:C.muted}}>({(m.messages||[]).length}件)</span></div>
            {(m.messages||[]).slice(0,3).map((msg,i) => (
              <div key={i} style={{fontSize:11,color:C.sub,padding:"6px 10px",background:C.surface,borderRadius:6,marginBottom:4,lineHeight:1.6}}>
                <span style={{color:C.muted,marginRight:6}}>{msg.date}</span>{msg.text}
              </div>
            ))}
          </div>
        ))}
        {members.filter(m=>(m.messages||[]).length>0).length===0 && (
          <div style={{...sh.card,padding:24,textAlign:"center",color:C.muted,fontSize:13}}>まだメッセージはありません</div>
        )}
      </div>
    </div>
  );
}

function AdminPage({ members, setMembers, withdrawals, setWithdrawals, notices, setNotices, depositRequests, setDepositRequests, adminLogs, maintenance, setMaintenance, onLogout }) {
  const mob = useIsMobile();
  const [tab, setTab] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [depositInput, setDepositInput] = useState({});
  const [msg, setMsg] = useState(null);
  const [detailMember, setDetailMember] = useState(null);
  const showMsg = (text, type="ok") => { setMsg({text,type}); setTimeout(()=>setMsg(null),3000); };

  const ADMIN_TABS = [
    {id:"dashboard",   label:"📊 概要"},
    {id:"daily",       label:"🎁 日利付与"},
    {id:"members",     label:"会員一覧"},
    {id:"kyc",         label:"KYC審査"},
    {id:"depReq",      label:"送金報告"},
    {id:"deposit",     label:"入金反映"},
    {id:"withdrawal",  label:"出金申請"},
    {id:"points",      label:"pt残高"},
    {id:"messages",    label:"💬 メッセージ"},
    {id:"status",      label:"🚫 ステータス"},
    {id:"maintenance", label:"🔧 メンテナンス"},
    {id:"adminlog",    label:"🔑 ログ"},
    {id:"graph",       label:"📈 グラフ"},
    {id:"notices",     label:"お知らせ"},
    {id:"csv",         label:"📥 CSV"},
  ];

  const filtered = members.filter(m =>
    m.userId?.toLowerCase().includes(search.toLowerCase()) ||
    m.name?.toLowerCase().includes(search.toLowerCase())
  );

  const applyDeposit = (memberId) => {
    const amt = parseInt(depositInput[memberId]);
    if (!amt||amt<=0) return showMsg("金額を入力してください","err");
    const member = members.find(m=>m.id===memberId);

    // 上位紹介者チェーンを取得（無限ループ防止のため最大10段階）
    const refChain = [];
    let cur = member;
    for (let i=0; i<4; i++) {
      const ref = cur?.referrerId ? members.find(m=>m.id===cur.referrerId) : null;
      if (!ref) break;
      refChain.push(ref);
      cur = ref;
    }

    // 各段階のボーナス計算
    const bonuses = refChain.map((ref, i) => ({
      member: ref,
      depth:  i+1,
      rate:   getReferralRate(i),
      bonus:  fl1(amt * getReferralRate(i)),
    }));

    const depNotice = createNotice(`入金が確認されました！${amt.toLocaleString()} pt が入金ポイントに反映されました。`,"success");

    setMembers(p => p.map(m => {
      if (m.id===memberId) return {...m, depositPt:m.depositPt+amt, messages:[depNotice,...(m.messages||[])]};
      const b = bonuses.find(x=>x.member.id===m.id);
      if (b) {
        const notice = createNotice(`紹介報酬（${b.depth}段階） +${b.bonus.toLocaleString()} pt が付与されました（${member?.userId} さんの入金 / ${Math.round(b.rate*100)}%）`,"success");
        return {...m, withdrawablePt:fl1(m.withdrawablePt+b.bonus), messages:[notice,...(m.messages||[])]};
      }
      return m;
    }));
    setDepositInput(p => ({...p,[memberId]:""}));
    const bonusSummary = bonuses.filter(b=>b.bonus>0).map(b=>`${b.depth}段階 ${b.bonus}pt`).join(" / ");
    showMsg(`${member?.userId} に ${amt.toLocaleString()} pt 反映${bonusSummary?` / ${bonusSummary}`:""}`);
  };

  const updateKyc = (memberId, status) => {
    const kycNotice = status==="approved"
      ? createNotice("本人確認（KYC）が承認されました。すべての機能がご利用いただけます。出金申請が可能になりました。","success")
      : createNotice("本人確認（KYC）が却下されました。有効期限内の身分証明書で再度お申し込みください。","warning");
    setMembers(p => p.map(m => {
      if (m.id!==memberId) return m;
      return {...m,kyc:{...m.kyc,idStatus:status},messages:[kycNotice,...(m.messages||[])]};
    }));
    showMsg(`KYCを「${status==="approved"?"承認":"却下"}」しました`);
  };

  const updateWithdrawal = (wdId, status) => {
    setWithdrawals(p => p.map(w => {
      if (w.id!==wdId) return w;
      const notice = status==="承認"
        ? createNotice(`出金申請が承認されました。${w.payout?.toLocaleString()||w.amount.toLocaleString()} pt（${w.currency||"USDT"} / ${w.network}）の送金処理を行います。`,"success")
        : createNotice(`出金申請が却下されました。${w.amount.toLocaleString()} pt をお返しします。詳細はサポートまでお問い合わせください。`,"warning");
      setMembers(pp => pp.map(m => {
        if (m.id!==w.userId) return m;
        const base = {...m,messages:[notice,...(m.messages||[])]};
        if (status==="却下") return {...base,withdrawablePt:fl1(m.withdrawablePt+w.amount)};
        return base;
      }));
      return {...w,status,processedAt:now()};
    }));
    showMsg(`出金申請を「${status}」しました`);
  };

  const statusColor = s => s==="承認"?C.green:s==="却下"?C.red:C.yellow;
  const kycColor    = s => s==="approved"?C.green:s==="pending"?C.yellow:s==="rejected"?C.red:C.muted;
  const kycLabel    = s => s==="approved"?"✓ 承認済":s==="pending"?"⏳ 審査中":s==="rejected"?"✗ 却下":"未提出";

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:mob?17:20,fontWeight:700,color:C.red}}>🔐 管理者ページ</div>
        <button onClick={onLogout} style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,padding:"6px 14px",borderRadius:8,cursor:"pointer",fontSize:12}}>管理者ログアウト</button>
      </div>

      {msg && <div style={{padding:"10px 16px",borderRadius:8,background:msg.type==="ok"?C.green+"18":C.red+"18",border:`1px solid ${msg.type==="ok"?C.green:C.red}`,color:msg.type==="ok"?C.green:C.red,fontSize:13,marginBottom:16}}>{msg.text}</div>}

      {/* タブ */}
      <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        {ADMIN_TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?C.accent:"transparent",color:tab===t.id?"#000":C.sub,border:`1px solid ${tab===t.id?C.accent:C.border}`,borderRadius:8,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>
            {t.label}
            {t.id==="kyc"&&members.filter(m=>m.kyc?.idStatus==="pending").length>0&&<span style={{marginLeft:4,background:C.red,color:"#fff",borderRadius:99,padding:"1px 6px",fontSize:10}}>{members.filter(m=>m.kyc?.idStatus==="pending").length}</span>}
            {t.id==="withdrawal"&&withdrawals.filter(w=>w.status==="審査中").length>0&&<span style={{marginLeft:4,background:C.red,color:"#fff",borderRadius:99,padding:"1px 6px",fontSize:10}}>{withdrawals.filter(w=>w.status==="審査中").length}</span>}
            {t.id==="depReq"&&(depositRequests||[]).filter(r=>r.status==="確認中").length>0&&<span style={{marginLeft:4,background:C.red,color:"#fff",borderRadius:99,padding:"1px 6px",fontSize:10}}>{(depositRequests||[]).filter(r=>r.status==="確認中").length}</span>}
          </button>
        ))}
      </div>

      {/* 会員詳細モーダル */}
      {detailMember && (
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"24px",width:"100%",maxWidth:480,maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:700,color:C.accent}}>{detailMember.userId} の詳細</div>
              <button onClick={()=>setDetailMember(null)} style={{background:"transparent",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:16}}>
              {[
                {label:"入金pt",    val:detailMember.depositPt.toLocaleString()+" pt",      c:C.accent},
                {label:"出金可能pt",val:detailMember.withdrawablePt.toLocaleString()+" pt", c:C.green},
                {label:"登録日",    val:detailMember.joinedAt,                              c:C.sub},
                {label:"規約同意",  val:detailMember.agreedAt||"記録なし",                  c:C.sub},
                {label:"KYC",       val:kycLabel(detailMember.kyc?.idStatus),               c:kycColor(detailMember.kyc?.idStatus)},
                {label:"ステータス",val:detailMember.status==="suspended"?"停止中":"アクティブ",c:detailMember.status==="suspended"?C.red:C.green},
              ].map(({label,val,c}) => (
                <div key={label} style={{background:C.surface,borderRadius:8,padding:"8px 12px"}}>
                  <div style={{fontSize:10,color:C.muted,marginBottom:2}}>{label}</div>
                  <div style={{fontSize:12,fontWeight:700,color:c}}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:C.sub,letterSpacing:1,marginBottom:8}}>送金報告履歴</div>
              {(depositRequests||[]).filter(r=>r.userId===detailMember.id).length===0
                ? <div style={{fontSize:12,color:C.muted,padding:"8px 0"}}>なし</div>
                : [...(depositRequests||[])].filter(r=>r.userId===detailMember.id).reverse().map(r => (
                  <div key={r.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",background:C.surface,borderRadius:6,marginBottom:4,fontSize:12}}>
                    <div>
                      <span style={{color:C.accent,fontWeight:700}}>{r.amount.toLocaleString()} {r.currency||"USDT"}</span>
                      <span style={{color:C.muted,marginLeft:6}}>{r.network}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{color:C.muted}}>{r.createdAt?.slice(0,10)}</span>
                      <span style={sh.badge(r.status==="承認"?C.green:r.status==="却下"?C.red:C.yellow)}>{r.status}</span>
                    </div>
                  </div>
                ))
              }
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.sub,letterSpacing:1,marginBottom:8}}>出金申請履歴</div>
              {withdrawals.filter(w=>w.userId===detailMember.id).length===0
                ? <div style={{fontSize:12,color:C.muted,padding:"8px 0"}}>なし</div>
                : [...withdrawals].filter(w=>w.userId===detailMember.id).reverse().map(w => (
                  <div key={w.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",background:C.surface,borderRadius:6,marginBottom:4,fontSize:12}}>
                    <div>
                      <span style={{color:C.green,fontWeight:700}}>{w.amount.toLocaleString()} pt</span>
                      <span style={{color:C.muted,marginLeft:6}}>{w.currency||"USDT"}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{color:C.muted}}>{w.createdAt?.slice(0,10)}</span>
                      <span style={sh.badge(w.status==="承認"?C.green:w.status==="却下"?C.red:C.yellow)}>{w.status}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* 概要 */}
      {tab==="dashboard" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
            {[
              {label:"総会員数",       val:members.length,                                               unit:"人",  color:C.accent},
              {label:"総入金pt",       val:members.reduce((a,m)=>a+m.depositPt,0).toLocaleString(),      unit:"pt",  color:C.accent},
              {label:"総出金可能pt",   val:members.reduce((a,m)=>a+m.withdrawablePt,0).toLocaleString(), unit:"pt",  color:C.green},
              {label:"KYC審査待ち",    val:members.filter(m=>m.kyc?.idStatus==="pending").length,         unit:"件",  color:C.yellow},
              {label:"出金審査中",     val:withdrawals.filter(w=>w.status==="審査中").length,             unit:"件",  color:C.yellow},
              {label:"送金報告確認中", val:(depositRequests||[]).filter(r=>r.status==="確認中").length,   unit:"件",  color:C.red},
            ].map(({label,val,unit,color}) => (
              <div key={label} style={{...sh.card,padding:"14px 16px"}}>
                <div style={{fontSize:22,fontWeight:700,color}}>{val}<span style={{fontSize:12,color:C.sub}}>{unit}</span></div>
                <div style={{fontSize:10,color:C.sub,marginTop:3}}>{label}</div>
              </div>
            ))}
          </div>
          {(members.filter(m=>m.kyc?.idStatus==="pending").length>0||(depositRequests||[]).filter(r=>r.status==="確認中").length>0||withdrawals.filter(w=>w.status==="審査中").length>0) && (
            <div style={{...sh.card,padding:"16px",background:"#fbbf2408",borderColor:"#fbbf2433"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.yellow,marginBottom:10}}>⚠ 対応が必要な項目</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {members.filter(m=>m.kyc?.idStatus==="pending").length>0 && (
                  <div onClick={()=>setTab("kyc")} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:C.surface,borderRadius:8,cursor:"pointer"}}>
                    <span style={{fontSize:13,color:C.text,flex:1}}>KYC審査待ち</span>
                    <span style={sh.badge(C.yellow)}>{members.filter(m=>m.kyc?.idStatus==="pending").length}件</span>
                  </div>
                )}
                {(depositRequests||[]).filter(r=>r.status==="確認中").length>0 && (
                  <div onClick={()=>setTab("depReq")} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:C.surface,borderRadius:8,cursor:"pointer"}}>
                    <span style={{fontSize:13,color:C.text,flex:1}}>送金報告確認待ち</span>
                    <span style={sh.badge(C.red)}>{(depositRequests||[]).filter(r=>r.status==="確認中").length}件</span>
                  </div>
                )}
                {withdrawals.filter(w=>w.status==="審査中").length>0 && (
                  <div onClick={()=>setTab("withdrawal")} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:C.surface,borderRadius:8,cursor:"pointer"}}>
                    <span style={{fontSize:13,color:C.text,flex:1}}>出金審査中</span>
                    <span style={sh.badge(C.yellow)}>{withdrawals.filter(w=>w.status==="審査中").length}件</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 日利付与 */}
      {tab==="daily" && (
        <div>
          <div style={{padding:"12px 16px",background:"#10b98114",border:`1px solid ${C.green}33`,borderRadius:10,marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:700,color:C.green,marginBottom:6}}>日利一括付与について</div>
            <div style={{fontSize:12,color:C.sub,lineHeight:1.8}}>
              全会員の入金ptにランク別日利を計算し一括付与します。<strong style={{color:C.yellow}}>1日1回</strong>実行してください。本日付与済みの会員はスキップされます。
            </div>
          </div>
          <div style={{...sh.card,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>付与プレビュー（本日分）</div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
              {members.filter(m=>m.depositPt>0&&m.status!=="suspended").map(m => {
                const rank = getMemberRank(m,members);
                const earn = fl1(m.depositPt*rank.dailyRate/100);
                const done = m.lastClaim===today();
                return (
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:C.surface,borderRadius:8,opacity:done?0.5:1}}>
                    <div style={{flex:1}}>
                      <span style={{fontSize:13,fontWeight:700,color:C.accent}}>{m.userId}</span>
                      <span style={{fontSize:11,color:C.muted,marginLeft:8}}>{rank.label} {rank.dailyRate}%</span>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:13,fontWeight:700,color:done?C.muted:C.green}}>{done?"付与済":"+"+earn.toLocaleString()+" pt"}</div>
                      <div style={{fontSize:10,color:C.muted}}>入金 {m.depositPt.toLocaleString()} pt</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"#10b98110",borderRadius:8,marginBottom:14}}>
              <span style={{fontSize:13,color:C.sub}}>本日の総付与予定</span>
              <span style={{fontSize:16,fontWeight:700,color:C.green}}>
                +{fl1(members.filter(m=>m.depositPt>0&&m.status!=="suspended"&&m.lastClaim!==today()).reduce((a,m)=>{
                  const rank=getMemberRank(m,members);
                  return a+fl1(m.depositPt*rank.dailyRate/100);
                },0)).toLocaleString()} pt
              </span>
            </div>
            {!isWeekday(today()) && (
              <div style={{padding:"10px 14px",background:"#fbbf2414",border:`1px solid ${C.yellow}44`,borderRadius:8,marginBottom:10,fontSize:12,color:C.yellow}}>
                本日は土日祝のため付与対象外です。平日のみ実行してください。
              </div>
            )}
            <button onClick={()=>{
              const todayStr=today();
              if(!isWeekday(todayStr)){
                showMsg("本日は土日祝のため付与できません","err");
                return;
              }
              let totalEarned=0, count=0;
              setMembers(p=>p.map(m=>{
                if(m.depositPt<=0||m.status==="suspended"||m.lastClaim===todayStr) return m;
                const rank=getMemberRank(m,p);
                const earn=fl1(m.depositPt*rank.dailyRate/100);
                totalEarned+=earn; count++;
                const notice=createNotice(`本日の日利 +${earn.toLocaleString()} pt が付与されました（${rank.label} ${rank.dailyRate}% / 入金 ${m.depositPt.toLocaleString()} pt）`,"success");
                return {...m,withdrawablePt:fl1(m.withdrawablePt+earn),lastClaim:todayStr,lastClaimMs:nowMs(),messages:[notice,...(m.messages||[])]};
              }));
              showMsg(`✓ ${count}名に合計 ${fl1(totalEarned).toLocaleString()} pt を付与しました（${todayStr}）`);
            }} style={{...sh.btn("green"),fontSize:15,fontWeight:700,marginTop:0}}>
              本日の日利を一括付与する
            </button>
          </div>
          <div style={{...sh.card,padding:"14px 16px"}}>
            <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:10,letterSpacing:1}}>最終付与日（会員別）</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {[...members].sort((a,b)=>(b.lastClaim||"").localeCompare(a.lastClaim||"")).map(m => (
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:C.surface,borderRadius:6}}>
                  <span style={{fontSize:12,color:C.accent,fontWeight:700,flex:1}}>{m.userId}</span>
                  <span style={{fontSize:11,color:m.lastClaim===today()?C.green:C.muted}}>{m.lastClaim===today()?"✓ 本日付与済":m.lastClaim||"未付与"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 会員一覧 */}
      {tab==="members" && (
        <div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ユーザーIDまたは名前で検索..." style={{...sh.input,marginBottom:14}}/>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {filtered.map(m => {
              const ref = members.find(r=>r.id===m.referrerId);
              const rank = getMemberRank(m,members);
              return (
                <div key={m.id} style={{...sh.card,padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <Avatar name={m.name} size={36}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:3}}>
                        <span style={{fontSize:14,fontWeight:700,color:C.accent}}>{m.userId}</span>
                        <span style={{fontSize:13,color:C.text}}>{m.name}</span>
                        <RankBadge rank={rank} size="sm"/>
                        {m.status==="suspended"&&<span style={sh.badge(C.red)}>停止中</span>}
                      </div>
                      <div style={{fontSize:11,color:C.muted}}>紹介者: {ref?ref.userId:"なし"} · 登録: {m.joinedAt}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:13,color:C.accent,fontWeight:700}}>{m.depositPt.toLocaleString()} pt入金</div>
                      <div style={{fontSize:13,color:C.green,fontWeight:700}}>{m.withdrawablePt.toLocaleString()} pt出金可</div>
                      <span style={sh.badge(kycColor(m.kyc?.idStatus))}>{kycLabel(m.kyc?.idStatus)}</span>
                      <div style={{marginTop:6}}>
                        <button onClick={()=>setDetailMember(m)} style={{background:"transparent",border:`1px solid ${C.border}`,color:C.sub,borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11}}>詳細</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KYC */}
      {tab==="kyc" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {members.filter(m=>m.kyc?.idStatus==="pending").length===0 ? (
            <div style={{...sh.card,padding:32,textAlign:"center",color:C.muted}}>審査待ちのKYC申請はありません</div>
          ) : members.filter(m=>m.kyc?.idStatus==="pending").map(m => (
            <div key={m.id} style={{...sh.card,padding:"16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
                <Avatar name={m.name} size={32}/>
                <div style={{flex:1}}>
                  <span style={{fontSize:14,fontWeight:700,color:C.accent}}>{m.userId}</span>
                  <span style={{fontSize:13,color:C.text,marginLeft:8}}>{m.name}</span>
                </div>
                <span style={sh.badge(kycColor(m.kyc?.idStatus))}>{kycLabel(m.kyc?.idStatus)}</span>
              </div>
              {m.kyc?.basicInfo && (
                <div style={{background:C.surface,borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:12,color:C.sub,display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6}}>
                  <div>姓名: <strong style={{color:C.text}}>{m.kyc.basicInfo.lastName} {m.kyc.basicInfo.firstName}</strong></div>
                  <div>生年月日: <strong style={{color:C.text}}>{m.kyc.basicInfo.dob}</strong></div>
                  <div>電話: <strong style={{color:C.text}}>{m.kyc.basicInfo.phone}</strong></div>
                  <div>住所: <strong style={{color:C.text}}>{m.kyc.basicInfo.address}</strong></div>
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>updateKyc(m.id,"approved")} style={{flex:1,background:C.green,color:"#000",border:"none",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:13}}>✓ 承認する</button>
                <button onClick={()=>updateKyc(m.id,"rejected")} style={{flex:1,background:C.red,color:"#fff",border:"none",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:13}}>✗ 却下する</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 送金報告 */}
      {tab==="depReq" && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {(depositRequests||[]).length===0 ? (
            <div style={{...sh.card,padding:32,textAlign:"center",color:C.muted}}>送金報告はありません</div>
          ) : [...(depositRequests||[])].reverse().map(r => {
            const member = members.find(m=>m.id===r.userId);
            const sc = r.status==="承認"?C.green:r.status==="却下"?C.red:C.yellow;
            return (
              <div key={r.id} style={{...sh.card,padding:"16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:C.accent,marginBottom:2}}>{member?.userId||"不明"} <span style={{fontSize:13,color:C.text,fontWeight:400}}>{member?.name}</span></div>
                    <div style={{fontSize:15,fontWeight:700,color:C.text}}>{r.amount.toLocaleString()} {r.currency||"USDT"} <span style={{fontSize:11,color:C.sub}}>({r.network})</span></div>
                    <div style={{fontSize:11,color:C.muted,marginTop:3}}>{r.createdAt}</div>
                  </div>
                  <span style={sh.badge(sc)}>{r.status==="承認"?"✓ 反映済":r.status==="却下"?"✗ 却下":"⏳ 確認中"}</span>
                </div>
                {r.txHash && (
                  <div style={{marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,color:C.muted,fontFamily:"monospace",wordBreak:"break-all",flex:1}}>{r.txHash}</span>
                      <div style={{display:"flex",gap:4,flexShrink:0}}>
                        <button onClick={()=>navigator.clipboard?.writeText(r.txHash).catch(()=>{})} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10,color:C.sub}}>コピー</button>
                        {r.network==="TRC-20"&&<a href={`https://tronscan.org/#/transaction/${r.txHash}`} target="_blank" rel="noopener noreferrer" style={{background:"#10b98120",border:"1px solid #10b98144",borderRadius:6,padding:"4px 8px",fontSize:10,color:"#10b981",textDecoration:"none"}}>TronScan</a>}
                        {r.network==="ERC-20"&&<a href={`https://etherscan.io/tx/${r.txHash}`} target="_blank" rel="noopener noreferrer" style={{background:"#6366f120",border:"1px solid #6366f144",borderRadius:6,padding:"4px 8px",fontSize:10,color:"#6366f1",textDecoration:"none"}}>Etherscan</a>}
                      </div>
                    </div>
                  </div>
                )}
                {r.status==="確認中" && (
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{
                      setDepositRequests(p=>p.map(x=>x.id===r.id?{...x,status:"承認",processedAt:now()}:x));
                      // 上位紹介者チェーンを取得
                      const refChainDR = [];
                      let curDR = member;
                      for (let i=0; i<4; i++) {
                        const ref = curDR?.referrerId ? members.find(m=>m.id===curDR.referrerId) : null;
                        if (!ref) break;
                        refChainDR.push(ref);
                        curDR = ref;
                      }
                      const bonusesDR = refChainDR.map((ref,i)=>({
                        member:ref, depth:i+1,
                        rate:getReferralRate(i),
                        bonus:fl1(r.amount*getReferralRate(i)),
                      }));
                      const dnDR = createNotice(`入金が確認されました！${r.amount.toLocaleString()} pt が入金ポイントに反映されました。`,"success");
                      setMembers(p=>p.map(m=>{
                        if(m.id===r.userId) return {...m,depositPt:m.depositPt+r.amount,messages:[dnDR,...(m.messages||[])]};
                        const b=bonusesDR.find(x=>x.member.id===m.id);
                        if(b){
                          const n=createNotice(`紹介報酬（${b.depth}段階） +${b.bonus.toLocaleString()} pt が付与されました（${member?.userId} さんの入金 / ${Math.round(b.rate*100)}%）`,"success");
                          return {...m,withdrawablePt:fl1(m.withdrawablePt+b.bonus),messages:[n,...(m.messages||[])]};
                        }
                        return m;
                      }));
                      const sumDR = bonusesDR.filter(b=>b.bonus>0).map(b=>`${b.depth}段階 ${b.bonus}pt`).join(" / ");
                      showMsg(`${member?.userId} に ${r.amount.toLocaleString()} pt 反映${sumDR?` / ${sumDR}`:""}`);
                    }} style={{flex:1,background:C.green,color:"#000",border:"none",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:13}}>
                      ✓ 承認・反映
                    </button>
                    <button onClick={()=>{setDepositRequests(p=>p.map(x=>x.id===r.id?{...x,status:"却下",processedAt:now()}:x));showMsg("却下しました","err");}} style={{flex:1,background:C.red,color:"#fff",border:"none",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:13}}>
                      ✗ 却下
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 入金反映 */}
      {tab==="deposit" && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{padding:"10px 14px",background:"#7c3aed14",border:"1px solid #7c3aed33",borderRadius:10,marginBottom:8,fontSize:12,color:C.sub,lineHeight:1.8}}>
            入金確認後、該当会員に入金ptを付与してください。紹介者への20%報酬も自動で付与されます。
          </div>
          {members.map(m => (
            <div key={m.id} style={{...sh.card,padding:"14px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <Avatar name={m.name} size={32}/>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontSize:13,fontWeight:700,color:C.accent}}>{m.userId}</div>
                <div style={{fontSize:11,color:C.muted}}>現在: {m.depositPt.toLocaleString()} pt</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                <input type="number" inputMode="numeric" value={depositInput[m.id]||""} onChange={e=>setDepositInput(p=>({...p,[m.id]:e.target.value}))} placeholder="pt数" style={{...sh.input,width:100,marginTop:0,padding:"8px 10px",fontSize:14}}/>
                <button onClick={()=>applyDeposit(m.id)} style={{background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"9px 16px",cursor:"pointer",fontWeight:700,fontSize:13}}>反映</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 出金申請 */}
      {tab==="withdrawal" && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {withdrawals.length===0 ? (
            <div style={{...sh.card,padding:32,textAlign:"center",color:C.muted}}>出金申請はありません</div>
          ) : [...withdrawals].reverse().map(w => {
            const member = members.find(m=>m.id===w.userId);
            return (
              <div key={w.id} style={{...sh.card,padding:"16px"}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.accent,marginBottom:3}}>{member?.userId||"不明"} <span style={{fontSize:13,color:C.text,fontWeight:400}}>{member?.name}</span></div>
                    <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>{w.amount.toLocaleString()} pt → 実受取 {w.payout?.toLocaleString()||"-"} pt</div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:8}}>手数料: {w.fee||0} pt · {w.createdAt}</div>
                    {w.memo&&<div style={{fontSize:11,color:C.sub,marginBottom:8}}>メモ: {w.memo}</div>}
                    <div style={{background:"#0a1220",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                        {w.network&&<span style={{background:w.network==="TRC-20"?"#10b98122":"#6366f122",color:w.network==="TRC-20"?"#10b981":"#6366f1",border:`1px solid ${w.network==="TRC-20"?"#10b98144":"#6366f144"}`,borderRadius:6,padding:"1px 8px",fontSize:11,fontWeight:700}}>{w.network}</span>}
                        <span style={{fontSize:11,color:C.sub}}>送金先アドレス</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{flex:1,fontSize:12,color:C.text,fontFamily:"monospace",wordBreak:"break-all",lineHeight:1.6}}>{w.address}</span>
                        <button onClick={()=>navigator.clipboard?.writeText(w.address).catch(()=>{})} style={{flexShrink:0,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",cursor:"pointer",color:C.sub,fontSize:11}}>コピー</button>
                      </div>
                    </div>
                  </div>
                  <span style={sh.badge(statusColor(w.status))}>{w.status}</span>
                </div>
                {w.status==="審査中" && (
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>updateWithdrawal(w.id,"承認")} style={{flex:1,background:C.green,color:"#000",border:"none",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:13}}>✓ 承認</button>
                    <button onClick={()=>updateWithdrawal(w.id,"却下")} style={{flex:1,background:C.red,color:"#fff",border:"none",borderRadius:8,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:13}}>✗ 却下（ptを返却）</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* pt残高 */}
      {tab==="points" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
            <div style={{...sh.card,padding:"14px 16px"}}>
              <div style={{fontSize:11,color:C.sub,marginBottom:4}}>総入金pt</div>
              <div style={{fontSize:22,fontWeight:700,color:C.accent}}>{members.reduce((a,m)=>a+m.depositPt,0).toLocaleString()} pt</div>
            </div>
            <div style={{...sh.card,padding:"14px 16px"}}>
              <div style={{fontSize:11,color:C.sub,marginBottom:4}}>総出金可能pt</div>
              <div style={{fontSize:22,fontWeight:700,color:C.green}}>{members.reduce((a,m)=>a+m.withdrawablePt,0).toLocaleString()} pt</div>
            </div>
          </div>
          <div style={{...sh.card,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr>
                  <th style={sh.th}>ユーザーID</th>
                  <th style={sh.th}>名前</th>
                  <th style={sh.th}>入金pt</th>
                  <th style={sh.th}>出金可能pt</th>
                  <th style={sh.th}>ランク</th>
                </tr>
              </thead>
              <tbody>
                {[...members].sort((a,b)=>b.depositPt-a.depositPt).map(m => {
                  const rank = getMemberRank(m,members);
                  return (
                    <tr key={m.id}>
                      <td style={sh.td}><span style={{color:C.accent,fontWeight:700}}>{m.userId}</span></td>
                      <td style={sh.td}>{m.name}</td>
                      <td style={sh.td}><span style={{color:C.accent,fontWeight:700}}>{m.depositPt.toLocaleString()}</span></td>
                      <td style={sh.td}><span style={{color:C.green,fontWeight:700}}>{m.withdrawablePt.toLocaleString()}</span></td>
                      <td style={sh.td}><RankBadge rank={rank} size="sm"/></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* メッセージ */}
      {tab==="messages" && <AdminMessagePanel members={members} setMembers={setMembers}/>}

      {/* ステータス */}
      {tab==="status" && (
        <div>
          <div style={{fontSize:12,color:C.sub,marginBottom:14,lineHeight:1.8}}>停止にするとログインできなくなります。</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {members.map(m => (
              <div key={m.id} style={{...sh.card,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <Avatar name={m.name} size={36}/>
                <div style={{flex:1,minWidth:100}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.accent}}>{m.userId}</div>
                  <div style={{fontSize:11,color:C.muted}}>{m.name}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  <span style={sh.badge(m.status==="suspended"?C.red:C.green)}>{m.status==="suspended"?"停止中":"アクティブ"}</span>
                  {m.status==="suspended" ? (
                    <button onClick={()=>{setMembers(p=>p.map(x=>x.id===m.id?{...x,status:"active"}:x));showMsg(`${m.userId} を復元しました`);}} style={{background:C.green,color:"#000",border:"none",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:12}}>復元</button>
                  ) : (
                    <button onClick={()=>{if(!window.confirm(`${m.userId} を停止しますか？`))return;setMembers(p=>p.map(x=>x.id===m.id?{...x,status:"suspended"}:x));showMsg(`${m.userId} を停止しました`,"err");}} style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,borderRadius:6,padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:12}}>停止</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* メンテナンス */}
      {tab==="maintenance" && (
        <div>
          <div style={{...sh.card,padding:"20px",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:16}}>メンテナンスモード</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div>
                <div style={{fontSize:13,color:C.text,fontWeight:700}}>メンテナンス表示</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>ONにするとサイト全体にバナーが表示されます</div>
              </div>
              <div onClick={()=>setMaintenance(p=>({...p,on:!p.on}))} style={{width:52,height:28,borderRadius:99,background:maintenance.on?C.red:C.muted,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
                <div style={{width:22,height:22,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:maintenance.on?27:3,transition:"left .2s",boxShadow:"0 1px 3px #0004"}}/>
              </div>
            </div>
            {maintenance.on && <div style={{padding:"10px 14px",background:"#ef444420",border:`1px solid ${C.red}44`,borderRadius:8,marginBottom:14,fontSize:12,color:C.red}}>現在メンテナンスバナーが表示中です</div>}
            <div>
              <label style={sh.label}>バナーメッセージ</label>
              <input value={maintenance.msg} onChange={e=>setMaintenance(p=>({...p,msg:e.target.value}))} style={sh.input} placeholder="メンテナンス中のメッセージ"/>
            </div>
          </div>
        </div>
      )}

      {/* ログ */}
      {tab==="adminlog" && (
        <div>
          <div style={{fontSize:12,color:C.sub,marginBottom:12}}>管理者ページへのアクセス履歴（最新50件）</div>
          <div style={{...sh.card,overflow:"hidden"}}>
            {(adminLogs||[]).length===0 ? (
              <div style={{padding:32,textAlign:"center",color:C.muted}}>ログがありません</div>
            ) : (adminLogs||[]).map((log,i) => (
              <div key={log.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:`1px solid ${C.border}`,background:i===0?"#00e5ff08":"transparent"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text}}>{log.action}</div>
                  <div style={{fontSize:11,color:C.muted}}>{log.date}</div>
                </div>
                {i===0&&<span style={sh.badge(C.green)}>最新</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* グラフ */}
      {tab==="graph" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
            {[
              {label:"総会員数",    val:members.length,                                               unit:"人",  c:C.accent},
              {label:"総入金pt",    val:members.reduce((a,m)=>a+m.depositPt,0).toLocaleString(),      unit:"pt",  c:C.accent},
              {label:"総出金可能pt",val:members.reduce((a,m)=>a+m.withdrawablePt,0).toLocaleString(), unit:"pt",  c:C.green},
              {label:"承認済み出金",val:withdrawals.filter(w=>w.status==="承認").reduce((a,w)=>a+w.amount,0).toLocaleString(), unit:"pt", c:C.yellow},
            ].map(({label,val,unit,c}) => (
              <div key={label} style={{...sh.card,padding:"14px 16px"}}>
                <div style={{fontSize:10,color:C.sub,marginBottom:4}}>{label}</div>
                <div style={{fontSize:22,fontWeight:700,color:c}}>{val}<span style={{fontSize:12,color:C.sub}}>{unit}</span></div>
              </div>
            ))}
          </div>
          <div style={{...sh.card,padding:"16px",marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:12,letterSpacing:1}}>ランク別会員分布</div>
            {RANKS.map(r => {
              const count = members.filter(m=>getMemberRank(m,members).id===r.id).length;
              const pct = members.length>0 ? Math.round(count/members.length*100) : 0;
              return (
                <div key={r.id} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:12,color:r.color,fontWeight:700}}>{r.icon} {r.label}</span>
                    <span style={{fontSize:12,color:C.sub}}>{count}人 ({pct}%)</span>
                  </div>
                  <div style={{height:8,background:C.surface,borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(to right,${r.color},${r.color}88)`,borderRadius:99}}/>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{...sh.card,padding:"16px"}}>
            <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:12,letterSpacing:1}}>出金申請ステータス</div>
            {[{label:"審査中",color:C.yellow},{label:"承認",color:C.green},{label:"却下",color:C.red}].map(s => {
              const count = withdrawals.filter(w=>w.status===s.label).length;
              const total = withdrawals.reduce((a,w)=>a+(w.status===s.label?w.amount:0),0);
              return (
                <div key={s.label} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:C.surface,borderRadius:8,marginBottom:6}}>
                  <span style={{...sh.badge(s.color),minWidth:52,textAlign:"center"}}>{s.label}</span>
                  <span style={{fontSize:13,color:C.text,flex:1}}>{count}件</span>
                  <span style={{fontSize:13,fontWeight:700,color:s.color}}>{total.toLocaleString()} pt</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* お知らせ */}
      {tab==="notices" && (
        <div>
          <div style={{...sh.card,padding:"16px",marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>新しいお知らせを追加</div>
            <AdminNoticeForm setNotices={setNotices}/>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:10,letterSpacing:1}}>配信済みお知らせ</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {notices.map(n => (
              <div key={n.id} style={{...sh.card,padding:"14px 16px",display:"flex",alignItems:"flex-start",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:700,color:C.text}}>{n.title}</span>
                    {n.important&&<span style={{background:"#fbbf2422",color:C.yellow,border:"1px solid #fbbf2444",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700}}>重要</span>}
                  </div>
                  <div style={{fontSize:12,color:C.sub,marginBottom:4}}>{n.body}</div>
                  <div style={{fontSize:10,color:C.muted}}>{n.date}</div>
                </div>
                <button onClick={()=>setNotices(p=>p.filter(x=>x.id!==n.id))} style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12,flexShrink:0}}>削除</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CSV */}
      {tab==="csv" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:13,color:C.sub,marginBottom:4}}>各データをCSVファイルとしてダウンロードできます</div>
          {[
            {label:"会員一覧", desc:"全会員のID・名前・入金pt・出金可能pt・ランク・登録日",
              onClick:()=>{
                const rows=[["ユーザーID","名前","入金pt","出金可能pt","ランク","直接紹介数","登録日","KYC","規約同意日"]];
                members.forEach(m=>{const rank=getMemberRank(m,members);rows.push([m.userId,m.name,m.depositPt,m.withdrawablePt,rank.label,members.filter(x=>x.referrerId===m.id).length,m.joinedAt,m.kyc?.idStatus||"none",m.agreedAt||""]);});
                downloadCSV(rows,"members.csv");
              }
            },
            {label:"出金申請一覧", desc:"全出金申請のユーザーID・金額・ネットワーク・ステータス・日時",
              onClick:()=>{
                const rows=[["申請ID","ユーザーID","申請額(pt)","実受取(pt)","手数料(pt)","ネットワーク","アドレス","ステータス","申請日時","処理日時"]];
                withdrawals.forEach(w=>{const m=members.find(x=>x.id===w.userId);rows.push([w.id,m?.userId||"",w.amount,w.payout||"",w.fee||"",w.network||"",w.address,w.status,w.createdAt,w.processedAt||""]);});
                downloadCSV(rows,"withdrawals.csv");
              }
            },
            {label:"送金報告一覧", desc:"全送金報告のユーザーID・金額・ネットワーク・ステータス・日時",
              onClick:()=>{
                const rows=[["報告ID","ユーザーID","名前","金額","通貨","ネットワーク","TXハッシュ","ステータス","報告日時","処理日時"]];
                (depositRequests||[]).forEach(r=>{rows.push([r.id,r.userUid||"",r.userName||"",r.amount,r.currency||"USDT",r.network,r.txHash||"",r.status,r.createdAt,r.processedAt||""]);});
                downloadCSV(rows,"deposit_reports.csv");
              }
            },
          ].map(item => (
            <div key={item.label} style={{...sh.card,padding:"16px 18px",display:"flex",alignItems:"center",gap:14}}>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:3}}>{item.label}</div>
                <div style={{fontSize:11,color:C.muted}}>{item.desc}</div>
              </div>
              <button onClick={item.onClick} style={{background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:700,fontSize:13,flexShrink:0}}>↓ CSV</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function AuthCard({ children }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"calc(100vh - 52px)",padding:"20px 16px"}}>
      <div style={{background:"rgba(17,24,39,0.8)",border:"1px solid rgba(56,189,248,0.15)",borderRadius:20,padding:"36px 28px",width:"100%",maxWidth:400,boxShadow:"0 0 80px rgba(56,189,248,0.08), 0 32px 64px rgba(0,0,0,0.4)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"}}>{children}</div>
    </div>
  );
}

function Register({ members, setMembers, onBack }) {
  const [form, setForm] = useState({name:"",userId:"",password:"",passwordConfirm:"",referrerCode:""});
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const validatePw = pw => {
    if (pw.length<6) return "パスワードは6文字以上で入力してください";
    if (!/[a-zA-Z]/.test(pw)) return "パスワードに英字を含めてください";
    if (!/[0-9]/.test(pw)) return "パスワードに数字を含めてください";
    return null;
  };

  const handle = () => {
    setErr("");
    if (!agreed) return setErr("利用規約とプライバシーポリシーへの同意が必要です");
    if (!form.name||!form.userId||!form.password) return setErr("すべての必須項目を入力してください");
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(form.userId)) return setErr("ユーザーIDは半角英数字・アンダースコアで3〜20文字にしてください");
    if (members.find(m=>m.userId===form.userId)) return setErr("このユーザーIDはすでに使用されています");
    const pwErr = validatePw(form.password);
    if (pwErr) return setErr(pwErr);
    if (form.password!==form.passwordConfirm) return setErr("パスワードが一致しません");
    const ref = form.referrerCode ? members.find(m=>m.userId===form.referrerCode) : null;
    if (form.referrerCode&&!ref) return setErr("紹介コードが見つかりません");
    setMembers(p => [...p, {id:uid(),userId:form.userId,name:form.name,email:"",password:form.password,referrerId:ref?.id||null,depositPt:0,withdrawablePt:0,lastClaim:null,lastClaimMs:0,lastWdKey:null,agreedAt:now(),status:"active",messages:[],loginHistory:[],kyc:{basicDone:false,idStatus:"none"},joinedAt:new Date().toISOString().slice(0,10)}]);
    setOk(true);
  };

  if (showTerms) return <AuthCard><TermsPage showAgree={false}/><button style={{...sh.btn("ghost"),marginTop:12}} onClick={()=>setShowTerms(false)}>← 登録画面に戻る</button></AuthCard>;
  if (ok) return <AuthCard><div style={{color:C.green,fontSize:18,fontWeight:700,marginBottom:12}}>✓ 登録完了</div><div style={{color:C.sub,fontSize:13,marginBottom:24}}>ようこそ！入金アドレスよりUSDTを入金してください。</div><button style={sh.btn("accent")} onClick={onBack}>ログインへ</button></AuthCard>;

  return (
    <AuthCard>
      <div style={{fontSize:20,fontWeight:700,marginBottom:24,color:C.accent,letterSpacing:2}}>新規登録</div>
      <div style={{marginBottom:14}}>
        <label style={sh.label}>お名前</label>
        <input type="text" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={sh.input} placeholder="例: 田中 太郎"/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={sh.label}>ユーザーID</label>
        <input type="text" value={form.userId} onChange={e=>setForm(p=>({...p,userId:e.target.value.replace(/[^a-zA-Z0-9_]/g,"")}))} style={sh.input} placeholder="例: tanaka_taro" autoCapitalize="none" autoCorrect="off" spellCheck="false"/>
        <div style={{fontSize:11,color:C.muted,marginTop:4}}>半角英数字・アンダースコア（_）3〜20文字</div>
      </div>
      <div style={{marginBottom:14}}>
        <label style={sh.label}>パスワード</label>
        <input type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} style={sh.input} placeholder="英字+数字を含む6文字以上"/>
        <div style={{fontSize:11,color:C.muted,marginTop:4}}>英字と数字を混ぜた6文字以上</div>
      </div>
      <div style={{marginBottom:14}}>
        <label style={sh.label}>パスワード（確認用）</label>
        <input type="password" value={form.passwordConfirm} onChange={e=>setForm(p=>({...p,passwordConfirm:e.target.value}))} style={{...sh.input,borderColor:form.passwordConfirm&&form.password?(form.passwordConfirm===form.password?"#10b981":"#ef4444"):undefined}} placeholder="もう一度入力してください"/>
        {form.passwordConfirm&&form.password && (
          <div style={{fontSize:11,marginTop:4,color:form.passwordConfirm===form.password?"#10b981":"#ef4444"}}>
            {form.passwordConfirm===form.password?"✓ パスワードが一致しています":"✗ パスワードが一致しません"}
          </div>
        )}
      </div>
      <div style={{marginBottom:14}}>
        <label style={sh.label}>紹介コード（任意）</label>
        <input type="text" value={form.referrerCode} onChange={e=>setForm(p=>({...p,referrerCode:e.target.value}))} placeholder="紹介者のユーザーID" style={sh.input} autoCapitalize="none"/>
      </div>
      {err && <div style={{color:C.red,fontSize:12,marginTop:4,padding:"8px 10px",background:C.red+"14",borderRadius:6}}>{err}</div>}
      <div onClick={()=>setAgreed(a=>!a)}
        style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",background:agreed?"#10b98114":"#0a1220",border:`1px solid ${agreed?C.green:C.border}`,borderRadius:8,cursor:"pointer",marginTop:12}}>
        <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${agreed?C.green:C.muted}`,background:agreed?C.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
          {agreed&&<span style={{color:"#000",fontSize:12,fontWeight:700}}>✓</span>}
        </div>
        <div style={{fontSize:12,color:C.sub,lineHeight:1.7}}>
          <span onClick={e=>{e.stopPropagation();setShowTerms(true);}} style={{color:C.accent,cursor:"pointer",textDecoration:"underline"}}>利用規約</span>
          および
          <span onClick={e=>{e.stopPropagation();setShowTerms(true);}} style={{color:C.accent,cursor:"pointer",textDecoration:"underline"}}>プライバシーポリシー</span>
          に同意します（必須）
        </div>
      </div>
      <button style={sh.btn("accent")} onClick={handle}>登録する</button>
      <button style={sh.btn("ghost")} onClick={onBack}>ログインへ戻る</button>
    </AuthCard>
  );
}

// ── TABS ───────────────────────────────────────
const TABS = [
  {id:"dashboard",  label:"ホーム",   Icon:Home},
  {id:"depositReq", label:"入金",     Icon:ArrowDownCircle},
  {id:"withdrawal", label:"出金",     Icon:ArrowUpCircle},
  {id:"tree",       label:"ツリー",   Icon:GitBranch},
  {id:"settings",   label:"設定",     Icon:Settings},
  {id:"support",    label:"サポート", Icon:MessageCircle},
];

// ── MAIN APP ───────────────────────────────────
export default function App() {
  const mob = useIsMobile();
  const [members,         setMembers]         = useState(SEED);
  const [withdrawals,     setWithdrawals]     = useState(SEED_WD);
  const [notices,         setNotices]         = useState(SEED_NOTICES);
  const [depositRequests, setDepositRequests] = useState([]);
  const [adminLogs,       setAdminLogs]       = useState(SEED_ADMIN_LOGS);
  const [maintenance,     setMaintenance]     = useState({on:false,msg:"現在メンテナンス中です。しばらくお待ちください。"});
  const [user,            setUser]            = useState(null);
  const [page,            setPage]            = useState("login");
  const [tab,             setTab]             = useState("dashboard");
  const [menuOpen,        setMenuOpen]        = useState(false);
  const [loginForm,       setLoginForm]       = useState({email:"",password:""});
  const [loginErr,        setLoginErr]        = useState("");
  const [loginFailCount,  setLoginFailCount]  = useState(0);
  const [loginLocked,     setLoginLocked]     = useState(false);
  const [loginLockTimer,  setLoginLockTimer]  = useState(0);
  const [showWelcome,     setShowWelcome]     = useState(false);
  const lastActiveRef = useRef(Date.now());
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [logoTapCount,    setLogoTapCount]    = useState(0);
  const logoTapTimer = useRef(null);
  const [adminId,         setAdminId]         = useState("");
  const [adminPw,         setAdminPw]         = useState("");
  const [adminErr,        setAdminErr]        = useState("");
  const [adminFailCount,  setAdminFailCount]  = useState(0);
  const [adminLocked,     setAdminLocked]     = useState(false);

  // membersと同期
  useEffect(() => {
    if (user) { const f = members.find(m=>m.id===user.id); if(f) setUser(f); }
  }, [members]);

  // ログインロックタイマー
  useEffect(() => {
    if (loginLockTimer<=0) return;
    const t = setTimeout(()=>setLoginLockTimer(c=>c-1), 1000);
    return () => clearTimeout(t);
  }, [loginLockTimer]);

  const login = () => {
    if (loginLocked) return;
    setLoginErr("");
    const found = members.find(m=>m.userId===loginForm.email&&m.password===loginForm.password);
    if (!found) {
      const newCount = loginFailCount + 1;
      setLoginFailCount(newCount);
      if (newCount >= 10) {
        setLoginLocked(true);
        setLoginLockTimer(30*60);
        setLoginErr("10回失敗しました。30分後に再試行できます。");
        setTimeout(()=>{ setLoginLocked(false); setLoginFailCount(0); setLoginLockTimer(0); }, 30*60*1000);
      } else {
        setLoginErr(`ユーザーIDまたはパスワードが違います（残り${10-newCount}回）`);
      }
      return;
    }
    if (found.status==="suspended") return setLoginErr("このアカウントは停止されています。サポートにお問い合わせください。");
    setLoginFailCount(0);
    const loginEntry = {date:now(), device:navigator.userAgent.includes("Mobile")?"スマートフォン":"PC"};
    const updatedHistory = [loginEntry,...(found.loginHistory||[])].slice(0,10);
    const updatedMember = {...found, loginHistory:updatedHistory};
    setMembers(p => p.map(m=>m.id===found.id?updatedMember:m));
    setUser(updatedMember);
    setPage("app"); setTab("dashboard");
    if (found.depositPt===0) setShowWelcome(true);
  };

  const logout = () => { setUser(null); setPage("login"); setLoginForm({email:"",password:""}); setShowTimeoutWarning(false); };

  // セッションタイムアウト管理
  useEffect(() => {
    if (!user) return;
    const updateActive = () => { lastActiveRef.current = Date.now(); setShowTimeoutWarning(false); };
    const events = ["mousedown","touchstart","keydown","scroll"];
    events.forEach(e => window.addEventListener(e, updateActive, {passive:true}));

    const check = setInterval(() => {
      const elapsed = Date.now() - lastActiveRef.current;
      if (elapsed >= SESSION_TIMEOUT_MS) {
        logout();
      } else if (elapsed >= SESSION_TIMEOUT_MS - 5 * 60 * 1000) {
        // 残り5分で警告
        setShowTimeoutWarning(true);
      }
    }, 30000); // 30秒ごとにチェック

    return () => {
      events.forEach(e => window.removeEventListener(e, updateActive));
      clearInterval(check);
    };
  }, [user]);

  const handleLogoTap = () => {
    // ログイン画面でのみ有効
    if (page !== "login") return;
    const newCount = logoTapCount + 1;
    setLogoTapCount(newCount);
    // タイマーリセット（3秒以内に5回タップ）
    if (logoTapTimer.current) clearTimeout(logoTapTimer.current);
    logoTapTimer.current = setTimeout(() => setLogoTapCount(0), 3000);
    if (newCount >= 5) {
      setLogoTapCount(0);
      if (logoTapTimer.current) clearTimeout(logoTapTimer.current);
      setPage("admin_login");
    }
  };

  const handleAdminLogin = () => {
    if (adminLocked) return;
    setAdminErr("");
    if (adminId===ADMIN_ID && adminPw===ADMIN_PASSWORD) {
      setAdminId(""); setAdminPw(""); setAdminErr(""); setAdminFailCount(0);
      setAdminLogs(p=>[{id:"al"+Date.now(),date:now(),action:"ログイン",ip:"-"},...p].slice(0,50));
      setPage("admin");
    } else {
      const newCount = adminFailCount + 1;
      setAdminFailCount(newCount);
      if (newCount >= 5) {
        setAdminLocked(true);
        setAdminErr("5回失敗しました。アカウントをロックしました。");
        setTimeout(()=>{ setAdminLocked(false); setAdminFailCount(0); }, 30*60*1000);
      } else {
        setAdminErr(adminId!==ADMIN_ID?"管理者IDが違います":"パスワードが違います");
      }
    }
  };

  const root = {fontFamily:"'DM Mono','Courier New',monospace",background:"radial-gradient(ellipse at 20% 50%, #0f1f3d 0%, #06080f 50%, #0a0a1a 100%)",minHeight:"100vh",color:C.text};

  const Nav = () => (
    <nav style={{background:"#0a0f1a",borderBottom:"1px solid #1e2d45",padding:`0 ${mob?14:28}px`,display:"flex",alignItems:"center",justifyContent:"space-between",height:56,position:"sticky",top:0,zIndex:100,backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)"}}>
      <span onClick={handleLogoTap} style={{fontSize:17,fontWeight:900,letterSpacing:3,cursor:page==="login"?"pointer":"default",userSelect:"none",background:"linear-gradient(135deg,#38bdf8,#818cf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>◈ POINTNET</span>
      {user && (mob ? (
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,fontWeight:700,color:C.text}}>{user.userId}</div>
            <div style={{fontSize:10,color:C.green}}>{user.withdrawablePt.toLocaleString()} pt出金可</div>
          </div>
          <button onClick={()=>setMenuOpen(o=>!o)} style={{background:"transparent",border:`1px solid ${C.border}`,color:C.sub,padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:18}}>☰</button>
        </div>
      ) : (
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <Avatar name={user.name} size={28}/>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:C.text}}>{user.userId}</div>
            <div style={{fontSize:10,color:C.sub}}>入金 {user.depositPt.toLocaleString()} pt · 出金可 <span style={{color:C.green}}>{user.withdrawablePt.toLocaleString()} pt</span></div>
          </div>
          <button style={{background:"transparent",border:`1px solid ${C.border}`,color:C.sub,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12}} onClick={logout}>ログアウト</button>
        </div>
      ))}
    </nav>
  );

  // Register page
  if (page==="register") return <div style={root}><Nav/><Register members={members} setMembers={setMembers} onBack={()=>setPage("login")}/></div>;

  // Login page
  if (page==="login") return (
    <div style={root}><GlobalStyle/><Nav/>{maintenance.on&&<div style={{background:'#ef444420',borderBottom:`2px solid ${C.red}`,padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:18}}>🔧</span><span style={{fontSize:13,color:C.red,fontWeight:700,flex:1}}>{maintenance.msg}</span></div>}
      <AuthCard>
        <div style={{fontSize:20,fontWeight:700,marginBottom:24,color:C.accent,letterSpacing:2}}>ログイン</div>
        {[{f:"email",label:"ユーザーID"},{f:"password",label:"パスワード"}].map(({f,label}) => (
          <div key={f} style={{marginBottom:14}}>
            <label style={sh.label}>{label}</label>
            <input type={f==="password"?"password":"text"} value={loginForm[f]} onChange={e=>setLoginForm(p=>({...p,[f]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&login()} style={sh.input} autoCapitalize="none" placeholder={f==="email"?"例: tanaka_taro":""}/>
          </div>
        ))}
        {loginLocked ? (
          <div style={{padding:"16px",background:"#ef444418",border:`1px solid ${C.red}44`,borderRadius:10,textAlign:"center",marginBottom:8}}>
            <div style={{fontSize:28,marginBottom:6}}>🔒</div>
            <div style={{fontSize:14,fontWeight:700,color:C.red,marginBottom:4}}>アカウントがロックされました</div>
            <div style={{fontSize:12,color:C.sub}}>10回連続でログインに失敗しました。</div>
            {loginLockTimer>0 && <div style={{fontSize:13,color:C.yellow,marginTop:6,fontWeight:700}}>解除まで: {Math.floor(loginLockTimer/60)}:{String(loginLockTimer%60).padStart(2,"0")}</div>}
          </div>
        ) : (
          <>
            {loginErr && <div style={{color:C.red,fontSize:12,padding:"8px 10px",background:C.red+"14",borderRadius:6,marginBottom:4}}>{loginErr}</div>}
            <button style={sh.btn("accent")} onClick={login}>ログイン</button>
          </>
        )}
        <button style={sh.btn("ghost")} onClick={()=>setPage("register")}>新規登録</button>

      </AuthCard>
    </div>
  );

  // Admin login page
  if (page==="admin_login") return (
    <div style={root}><Nav/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"calc(100vh - 52px)",padding:"20px 16px"}}>
        <div style={{background:C.card,border:`2px solid ${C.red}44`,borderRadius:16,padding:"32px 24px",width:"100%",maxWidth:380,boxShadow:`0 0 60px #ef444418`}}>
          <div style={{fontSize:20,fontWeight:700,marginBottom:6,color:C.red}}>🔐 管理者ログイン</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:24}}>このページは管理者専用です</div>
          {adminLocked ? (
            <div style={{padding:"16px",background:"#ef444418",border:`1px solid ${C.red}44`,borderRadius:10,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>🔒</div>
              <div style={{fontSize:14,fontWeight:700,color:C.red,marginBottom:6}}>アカウントがロックされました</div>
              <div style={{fontSize:12,color:C.sub}}>ログイン試行が5回失敗しました。しばらく時間をおいてから再試行してください。</div>
            </div>
          ) : (
            <>
              <div style={{marginBottom:14}}>
                <label style={sh.label}>管理者ID</label>
                <input type="text" value={adminId} onChange={e=>setAdminId(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()} placeholder="管理者IDを入力" style={sh.input} autoCapitalize="none" autoCorrect="off"/>
              </div>
              <div style={{marginBottom:14}}>
                <label style={sh.label}>管理者パスワード</label>
                <input type="password" value={adminPw} onChange={e=>setAdminPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()} placeholder="管理者パスワードを入力" style={sh.input}/>
              </div>
              {adminErr && <div style={{padding:"8px 12px",background:"#ef444418",border:`1px solid ${C.red}44`,borderRadius:8,color:C.red,fontSize:12,marginBottom:8}}>{adminErr}</div>}
              <button style={{...sh.btn("accent"),background:C.red,marginTop:4}} onClick={handleAdminLogin}>ログイン</button>
            </>
          )}
          <button style={sh.btn("ghost")} onClick={()=>{setPage("login");setAdminId("");setAdminPw("");setAdminErr("");}}>← 会員ログインへ戻る</button>
        </div>
      </div>
    </div>
  );

  // Admin page
  if (page==="admin") return (
    <div style={root}><Nav/>
      <div style={{display:"flex",minHeight:"calc(100vh - 52px)"}}>
        <main style={{flex:1,padding:mob?"14px":"28px",overflowY:"auto"}}>
          <AdminPage members={members} setMembers={setMembers} withdrawals={withdrawals} setWithdrawals={setWithdrawals} notices={notices} setNotices={setNotices} depositRequests={depositRequests} setDepositRequests={setDepositRequests} adminLogs={adminLogs} maintenance={maintenance} setMaintenance={setMaintenance} onLogout={()=>setPage("login")}/>
        </main>
      </div>
    </div>
  );

  // Main app
  return (
    <div style={root}><GlobalStyle/><Nav/>{maintenance.on&&page!=="admin"&&<div style={{background:'#ef444420',borderBottom:`2px solid ${C.red}`,padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:18}}>🔧</span><span style={{fontSize:13,color:C.red,fontWeight:700,flex:1}}>{maintenance.msg}</span></div>}
      {showWelcome && <WelcomePage user={user} onClose={()=>setShowWelcome(false)}/>}
      {showTimeoutWarning && (
        <div style={{position:"fixed",bottom:mob?70:20,left:"50%",transform:"translateX(-50%)",zIndex:400,background:"#fbbf24",color:"#000",padding:"12px 20px",borderRadius:12,fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 20px #0006",whiteSpace:"nowrap"}}>
          <span>⏱ 間もなく自動ログアウトされます</span>
          <button onClick={()=>{lastActiveRef.current=Date.now();setShowTimeoutWarning(false);}} style={{background:"#000",color:"#fbbf24",border:"none",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontWeight:700,fontSize:12}}>
            延長する
          </button>
        </div>
      )}
      {mob && menuOpen && (
        <div style={{position:"fixed",inset:0,zIndex:200}} onClick={()=>setMenuOpen(false)}>
          <div style={{position:"absolute",right:0,top:52,width:220,background:C.surface,borderLeft:`1px solid ${C.border}`,height:"calc(100vh - 52px)",overflowY:"auto",padding:"16px 0"}} onClick={e=>e.stopPropagation()}>
            {TABS.map(t => (
              <div key={t.id} onClick={()=>{setTab(t.id);setMenuOpen(false);}} style={{padding:"13px 20px",cursor:"pointer",fontSize:14,color:tab===t.id?C.accent:C.sub,background:tab===t.id?"#00e5ff10":"transparent",borderLeft:tab===t.id?`3px solid ${C.accent}`:"3px solid transparent",display:"flex",alignItems:"center",gap:12}}>
                <t.Icon size={22} style={{flexShrink:0,opacity:tab===t.id?1:0.7}}/>
                <span style={{fontWeight:tab===t.id?700:400}}>{t.label}</span>
              </div>
            ))}
            <div style={{borderTop:`1px solid ${C.border}`,margin:"12px 0"}}/>
            <div onClick={logout} style={{padding:"12px 20px",cursor:"pointer",fontSize:14,color:C.red,display:"flex",alignItems:"center",gap:10}}>
              <LogOut size={16}/>ログアウト
            </div>
          </div>
        </div>
      )}
      <div style={{display:"flex",minHeight:"calc(100vh - 52px)"}}>
        {!mob && (
          <aside style={{width:190,background:C.surface,borderRight:`1px solid ${C.border}`,padding:"20px 0",flexShrink:0,position:"sticky",top:52,height:"calc(100vh - 52px)",overflowY:"auto"}}>
            {TABS.map(t => (
              <div key={t.id} onClick={()=>setTab(t.id)} style={{padding:"10px 16px",cursor:"pointer",fontSize:13,letterSpacing:0.5,color:tab===t.id?C.accent:C.sub,background:tab===t.id?"#00e5ff10":"transparent",borderLeft:tab===t.id?`3px solid ${C.accent}`:"3px solid transparent",display:"flex",alignItems:"center",gap:10,transition:"all .15s"}}>
                <t.Icon size={20} style={{flexShrink:0,opacity:tab===t.id?1:0.7}}/>
                <span style={{fontWeight:tab===t.id?700:400}}>{t.label}</span>
              </div>
            ))}
          </aside>
        )}
        <main style={{flex:1,padding:mob?"14px":"28px",overflowY:"auto",paddingBottom:mob?"80px":"28px"}}>
          {tab==="dashboard"  && <Dashboard user={user} members={members} withdrawals={withdrawals} setMembers={setMembers} setUser={setUser}/>}
          {tab==="depositReq" && <DepositRequestPage user={user} depositRequests={depositRequests} setDepositRequests={setDepositRequests}/>}
          {tab==="withdrawal" && <WithdrawalPage user={user} withdrawals={withdrawals} setWithdrawals={setWithdrawals} setMembers={setMembers} setUser={setUser}/>}
          {tab==="tree"       && <ReferralTree members={members} user={user}/>}
          {tab==="settings"   && <SettingsPage user={user} members={members} setMembers={setMembers} setUser={setUser} withdrawals={withdrawals} notices={notices}/>}
          {tab==="support"    && <SupportPage/>}
        </main>
      </div>
      {mob && user && (
        <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(10,15,26,0.95)",borderTop:"1px solid rgba(56,189,248,0.12)",display:"flex",height:64,zIndex:100,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"}}>
          {TABS.map(t => (
            <div key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,cursor:"pointer",color:tab===t.id?C.accent:C.muted,borderTop:tab===t.id?"2px solid transparent":"2px solid transparent",borderBottom:tab===t.id?"none":"none",background:tab===t.id?"linear-gradient(180deg,rgba(56,189,248,0.08),transparent)":"transparent",borderRadius:"0 0 12px 12px",paddingTop:2,transition:"color .15s",position:"relative"}}>
              <t.Icon size={22}/>
              {t.id==="settings" && notices.length>0 && tab!=="settings" && <span style={{position:"absolute",top:2,right:"50%",transform:"translateX(10px)",background:C.red,color:"#fff",borderRadius:99,fontSize:8,padding:"1px 5px",fontWeight:700}}>{notices.length}</span>}
              <span style={{fontSize:9,letterSpacing:0.3,fontWeight:tab===t.id?700:400}}>{t.label}</span>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}
