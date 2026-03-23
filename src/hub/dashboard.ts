/** Self-contained HTML dashboard — served at GET / on the hub */
export const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent Bus Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#c9d1d9;--muted:#8b949e;--green:#3fb950;--red:#f85149;--blue:#58a6ff;--purple:#d2a8ff;--orange:#f0883e;--mono:'SF Mono','Cascadia Code','Consolas',monospace}
body{background:var(--bg);color:var(--text);font-family:var(--mono);font-size:13px}
#stats{display:flex;gap:24px;padding:12px 20px;background:var(--card);border-bottom:1px solid var(--border);flex-wrap:wrap}
.stat{display:flex;flex-direction:column}.stat-val{font-size:18px;font-weight:700;color:var(--green)}.stat-lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
#main{display:grid;grid-template-columns:320px 1fr;height:calc(100vh - 48px);overflow:hidden}
#agents{padding:12px;overflow-y:auto;border-right:1px solid var(--border)}
#feed{padding:12px;overflow-y:auto}
.agent{background:var(--card);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px;cursor:pointer;transition:border-color .2s}
.agent:hover{border-color:var(--blue)}
.agent-hdr{display:flex;align-items:center;gap:8px}
.agent-emoji{font-size:20px}
.agent-name{font-weight:700;font-size:14px}
.agent-dot{width:8px;height:8px;border-radius:50%;margin-left:auto}
.dot-active{background:var(--green);box-shadow:0 0 6px var(--green)}
.dot-idle{background:var(--muted)}
.agent-meta{color:var(--muted);font-size:11px;margin-top:4px}
.event{padding:6px 8px;border-bottom:1px solid var(--border);animation:fadeIn .3s}
.event-time{color:var(--muted);margin-right:8px}
.event-agent{color:var(--blue);margin-right:8px}
.event-type{padding:1px 6px;border-radius:3px;font-size:11px;margin-right:8px}
.t-session_start{background:#3fb95022;color:var(--green)}
.t-session_end{background:#f8514922;color:var(--red)}
.t-tool_use{background:#58a6ff22;color:var(--blue)}
.t-task_complete{background:#d2a8ff22;color:var(--purple)}
.t-heartbeat{background:#8b949e22;color:var(--muted)}
.t-chat_message{background:#f0883e22;color:var(--orange)}
.event-detail{color:var(--text)}
#modal{display:none;position:fixed;inset:0;background:#000a;z-index:10;justify-content:center;align-items:center}
#modal.show{display:flex}
#modal-content{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px;width:90%;max-width:500px;max-height:80vh;overflow-y:auto}
#modal h3{margin-bottom:12px;color:var(--blue)}
#modal-close{float:right;cursor:pointer;color:var(--muted);font-size:18px}
.no-agents{color:var(--muted);text-align:center;padding:40px 20px}
h2{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media(max-width:768px){#main{grid-template-columns:1fr}#agents{max-height:200px;border-right:none;border-bottom:1px solid var(--border)}}
</style>
</head>
<body>
<div id="stats">
  <div class="stat"><span class="stat-val" id="s-clients">0</span><span class="stat-lbl">Clients</span></div>
  <div class="stat"><span class="stat-val" id="s-events">0</span><span class="stat-lbl">Events</span></div>
  <div class="stat"><span class="stat-val" id="s-epm">0</span><span class="stat-lbl">Events/min</span></div>
  <div class="stat"><span class="stat-val" id="s-agents">0</span><span class="stat-lbl">Agents</span></div>
  <div class="stat"><span class="stat-val" id="s-status">connecting</span><span class="stat-lbl">Hub</span></div>
</div>
<div id="main">
  <div id="agents"><h2>Agents</h2><div id="agent-list"><div class="no-agents">Waiting for events...</div></div></div>
  <div id="feed"><h2>Live Event Feed</h2><div id="event-list"></div></div>
</div>
<div id="modal"><div id="modal-content"><span id="modal-close">&times;</span><h3 id="modal-title"></h3><div id="modal-events"></div></div></div>
<script>
const EMOJIS=['💻','🤖','🛠️','⚡','🔧','📦','🚀','🧪','📡','🎯'];
const agents={};const events=[];const eventTimes=[];let totalEvents=0;
function hash(s){let h=0;for(const c of s)h=((h<<5)-h+c.charCodeAt(0))|0;return Math.abs(h)}
function emoji(n){return EMOJIS[hash(n)%EMOJIS.length]}
function fmtTime(ts){return new Date(ts).toLocaleTimeString()}

function connect(){
  const ws=new WebSocket('ws://'+location.host);
  document.getElementById('s-status').textContent='connecting';
  ws.onopen=()=>{document.getElementById('s-status').textContent='connected';fetchHealth()};
  ws.onclose=()=>{document.getElementById('s-status').textContent='reconnecting';setTimeout(connect,2000)};
  ws.onmessage=(msg)=>{
    try{const e=JSON.parse(msg.data);handleEvent(e)}catch{}
  };
}

function handleEvent(e){
  const key=e.agent+':'+e.project;
  const now=Date.now();
  // Update agent
  if(!agents[key])agents[key]={id:e.agent,project:e.project,emoji:emoji(e.agent),status:'active',lastTool:'',lastSeen:now,events:[]};
  const a=agents[key];a.lastSeen=now;
  if(e.event==='session_start')a.status='active';
  else if(e.event==='session_end')a.status='idle';
  else if(e.event==='tool_use'){a.status='active';a.lastTool=e.tool||'';}
  else if(e.event==='task_complete')a.lastTool='done';
  a.events.unshift(e);if(a.events.length>20)a.events.pop();
  // Feed
  events.unshift(e);if(events.length>50)events.pop();
  totalEvents++;eventTimes.push(now);
  render();
}

function render(){
  // Stats
  const now=Date.now();const recentEvents=eventTimes.filter(t=>now-t<60000);
  document.getElementById('s-events').textContent=totalEvents;
  document.getElementById('s-epm').textContent=recentEvents.length;
  const agentList=Object.values(agents);
  document.getElementById('s-agents').textContent=agentList.length;
  // Idle detection
  agentList.forEach(a=>{if(now-a.lastSeen>60000&&a.status==='active')a.status='idle'});
  // Agent cards
  const al=document.getElementById('agent-list');
  if(agentList.length===0){al.innerHTML='<div class="no-agents">Waiting for events...</div>';return}
  al.innerHTML=agentList.map(a=>'<div class="agent" onclick="showTimeline(\\''+a.id+':'+a.project+'\\')"><div class="agent-hdr"><span class="agent-emoji">'+a.emoji+'</span><span class="agent-name">'+a.id+'</span><span class="agent-dot '+(a.status==='active'?'dot-active':'dot-idle')+'"></span></div><div class="agent-meta">'+a.project+(a.lastTool?' · '+a.lastTool:'')+'</div></div>').join('');
  // Event feed
  const el=document.getElementById('event-list');
  el.innerHTML=events.map(e=>'<div class="event"><span class="event-time">'+fmtTime(e.ts)+'</span><span class="event-agent">'+e.agent+'</span><span class="event-type t-'+e.event+'">'+e.event+'</span><span class="event-detail">'+(e.tool||e.message||'')+(e.file?' · '+e.file:'')+'</span></div>').join('');
}

function showTimeline(key){
  const a=agents[key];if(!a)return;
  document.getElementById('modal-title').textContent=a.emoji+' '+a.id+' ('+a.project+')';
  document.getElementById('modal-events').innerHTML=a.events.map(e=>'<div class="event"><span class="event-time">'+fmtTime(e.ts)+'</span><span class="event-type t-'+e.event+'">'+e.event+'</span><span class="event-detail">'+(e.tool||e.message||'')+(e.file?' · '+e.file:'')+'</span></div>').join('')||'<div class="no-agents">No events yet</div>';
  document.getElementById('modal').classList.add('show');
}

document.getElementById('modal-close').onclick=()=>document.getElementById('modal').classList.remove('show');
document.getElementById('modal').onclick=(e)=>{if(e.target.id==='modal')document.getElementById('modal').classList.remove('show')};

async function fetchHealth(){
  try{const r=await fetch('/health');const d=await r.json();document.getElementById('s-clients').textContent=d.clients;totalEvents=d.events;document.getElementById('s-events').textContent=d.events}catch{}
}
setInterval(()=>{fetchHealth();render()},5000);
connect();
</script>
</body>
</html>`;
