// G-HUB Built-in Current Trending Games (2026 Arcade Collection)
// Works 100% online & offline in PWA, supports PC + Mobile touch controls

const SUIKA_MERGE_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>ネオン・オーブマージ</title>
<style>
  *{box-sizing:border-box;user-select:none;-webkit-user-select:none}
  body{margin:0;background:#080c18;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;overflow:hidden;touch-action:none}
  .hud{width:min(94vw,420px);display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#11182c;border:1px solid #263354;border-radius:14px;margin-bottom:8px;font-size:13px;font-weight:800}
  .score{color:#38bdf8;font-family:monospace;font-size:18px}
  .next{display:flex;align-items:center;gap:6px;font-size:12px;color:#cbd5e1}
  .dot{width:22px;height:22px;border-radius:50%;display:inline-block;border:2px solid rgba(255,255,255,0.5)}
  canvas{background:linear-gradient(180deg,#0c1326,#090d1a);border:2px solid #38bdf8;border-radius:16px;box-shadow:0 0 30px rgba(56,189,248,0.2);max-width:94vw;max-height:76vh}
  .bar{margin-top:8px;font-size:11px;color:#94a3b8;display:flex;gap:10px;align-items:center}
  button{background:#4f46e5;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-weight:800;cursor:pointer}
</style>
</head>
<body>
  <div class="hud">
    <div>SCORE <div class="score" id="sc">0</div></div>
    <div>COMBO <div class="score" id="cb" style="color:#f472b6">x1</div></div>
    <div class="next">NEXT <span class="dot" id="nx"></span></div>
  </div>
  <canvas id="c" width="380" height="500"></canvas>
  <div class="bar">
    <span>クリック / タップで落下・同じ色を合体！</span>
    <button onclick="resetGame()">リスタート</button>
  </div>
<script>
const canvas=document.getElementById('c'),ctx=canvas.getContext('2d');
const TIERS=[
  {r:14,c:'#38bdf8',lbl:'1'},{r:20,c:'#34d399',lbl:'2'},{r:27,c:'#a3e635',lbl:'3'},
  {r:34,c:'#fbbf24',lbl:'4'},{r:42,c:'#fb923c',lbl:'5'},{r:52,c:'#f43f5e',lbl:'6'},
  {r:64,c:'#c084fc',lbl:'7'},{r:78,c:'#fef08a',lbl:'★'}
];
let orbs=[],score=0,combo=1,comboTimer=0,aimX=190,curTier=0,nextTier=1,cool=0,gameOver=false,pops=[];
let ac=null;
function beep(f,d=0.07){try{ac=ac||new (window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume();const o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(0.08,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+d);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+d);}catch(e){}}
function updateHud(){document.getElementById('sc').textContent=score;document.getElementById('cb').textContent='x'+combo;document.getElementById('nx').style.background=TIERS[nextTier].c;}
function resetGame(){orbs=[];pops=[];score=0;combo=1;gameOver=false;curTier=Math.floor(Math.random()*3);nextTier=Math.floor(Math.random()*3);updateHud();}
function drop(x){if(gameOver||cool>0)return;const t=TIERS[curTier];const cx=Math.max(t.r+6,Math.min(canvas.width-t.r-6,x));orbs.push({x:cx,y:44,vx:(Math.random()-0.5)*0.6,vy:1,tier:curTier,r:t.r,age:0});curTier=nextTier;nextTier=Math.floor(Math.random()*4);cool=18;beep(320+curTier*60,0.06);updateHud();}
canvas.addEventListener('pointermove',e=>{const rect=canvas.getBoundingClientRect();aimX=(e.clientX-rect.left)*(canvas.width/rect.width);});
canvas.addEventListener('pointerdown',e=>{const rect=canvas.getBoundingClientRect();aimX=(e.clientX-rect.left)*(canvas.width/rect.width);drop(aimX);});
function step(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(cool>0)cool--;
  if(comboTimer>0)comboTimer--;else combo=1;
  ctx.strokeStyle='rgba(244,63,94,0.5)';ctx.setLineDash([6,6]);ctx.beginPath();ctx.moveTo(0,82);ctx.lineTo(canvas.width,82);ctx.stroke();ctx.setLineDash([]);
  if(!gameOver&&cool<=0){
    const t=TIERS[curTier];const px=Math.max(t.r+6,Math.min(canvas.width-t.r-6,aimX));
    ctx.globalAlpha=0.55;ctx.beginPath();ctx.arc(px,44,t.r,0,Math.PI*2);ctx.fillStyle=t.c;ctx.fill();ctx.globalAlpha=1;
  }
  const toRemove=new Set(),toAdd=[];
  for(let i=0;i<orbs.length;i++){
    const a=orbs[i];a.age++;a.vy+=0.34;a.vx*=0.992;a.vy*=0.996;a.x+=a.vx;a.y+=a.vy;
    if(a.x-a.r<0){a.x=a.r;a.vx=Math.abs(a.vx)*0.5;}
    if(a.x+a.r>canvas.width){a.x=canvas.width-a.r;a.vx=-Math.abs(a.vx)*0.5;}
    if(a.y+a.r>canvas.height){a.y=canvas.height-a.r;a.vy=-Math.abs(a.vy)*0.22;}
  }
  for(let pass=0;pass<2;pass++){
    for(let i=0;i<orbs.length;i++){
      if(toRemove.has(i))continue;
      for(let j=i+1;j<orbs.length;j++){
        if(toRemove.has(j))continue;
        const a=orbs[i],b=orbs[j];
        const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||0.01,minD=a.r+b.r;
        if(dist<minD){
          if(a.tier===b.tier&&a.tier<TIERS.length-1&&!toRemove.has(i)&&!toRemove.has(j)){
            toRemove.add(i);toRemove.add(j);
            const nt=a.tier+1,t=TIERS[nt];
            toAdd.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,vx:(a.vx+b.vx)*0.3,vy:-2.2,tier:nt,r:t.r,age:0});
            const pts=(nt+1)*20*combo;score+=pts;combo=Math.min(12,combo+1);comboTimer=90;
            pops.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,txt:'+'+pts,life:36,c:t.c});
            beep(440+nt*95,0.1);updateHud();
          }else{
            const overlap=(minD-dist)*0.5,nx=dx/dist,ny=dy/dist;
            a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
            const rvx=b.vx-a.vx,rvy=b.vy-a.vy,vn=rvx*nx+rvy*ny;
            if(vn<0){const imp=-vn*0.65;a.vx-=nx*imp;a.vy-=ny*imp;b.vx+=nx*imp;b.vy+=ny*imp;}
          }
        }
      }
    }
  }
  if(toRemove.size>0){orbs=orbs.filter((_,idx)=>!toRemove.has(idx)).concat(toAdd);}
  for(const o of orbs){
    const t=TIERS[o.tier];
    ctx.beginPath();ctx.arc(o.x,o.y,o.r,0,Math.PI*2);ctx.fillStyle=t.c;ctx.fill();
    ctx.lineWidth=2.5;ctx.strokeStyle='rgba(255,255,255,0.65)';ctx.stroke();
    ctx.fillStyle='#080c18';ctx.font='900 '+Math.max(11,Math.floor(o.r*0.65))+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t.lbl,o.x,o.y+1);
    if(o.age>70&&o.y-o.r<82)gameOver=true;
  }
  pops=pops.filter(p=>p.life>0);
  for(const p of pops){ctx.globalAlpha=p.life/36;ctx.fillStyle=p.c;ctx.font='900 16px monospace';ctx.textAlign='center';ctx.fillText(p.txt,p.x,p.y-(36-p.life));ctx.globalAlpha=1;p.life--;}
  if(gameOver){ctx.fillStyle='rgba(8,12,24,0.84)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f43f5e';ctx.font='900 32px sans-serif';ctx.textAlign='center';ctx.fillText('OVERFLOW!',190,220);ctx.fillStyle='#fff';ctx.font='700 18px monospace';ctx.fillText('FINAL SCORE: '+score,190,260);}
  requestAnimationFrame(step);
}
resetGame();step();
</script>
</body>
</html>`;

const ORBIT_SURVIVOR_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>ネオン弾幕サバイバー</title>
<style>
  *{box-sizing:border-box;user-select:none}
  body{margin:0;background:#050814;color:#fff;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;overflow:hidden;touch-action:none}
  .top{width:min(95vw,640px);display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:#0f172a;border:1px solid #1e293b;border-radius:12px;margin-bottom:6px;font-size:12px;font-weight:800;font-family:monospace}
  canvas{background:radial-gradient(circle at center,#0f172a,#050814);border:2px solid #22d3ee;border-radius:14px;max-width:95vw;max-height:76vh}
  #up{position:fixed;inset:0;background:rgba(5,8,20,0.85);display:none;align-items:center;justify-content:center;padding:16px}
  .box{background:#111827;border:2px solid #22d3ee;border-radius:18px;padding:18px;max-width:360px;width:100%;text-align:center}
  .opt{width:100%;margin-top:8px;padding:11px;border-radius:12px;border:1px solid #334155;background:#1e293b;color:#fff;font-weight:800;cursor:pointer;text-align:left}
  .opt:hover{border-color:#22d3ee;background:#0f172a}
</style>
</head>
<body>
  <div class="top">
    <span id="hp">HP 100</span>
    <span id="lv" style="color:#facc15">LV 1 (0%)</span>
    <span id="kl" style="color:#34d399">KILL 0</span>
    <span id="tm" style="color:#38bdf8">00:00</span>
  </div>
  <canvas id="cv" width="600" height="420"></canvas>
  <div style="font-size:11px;color:#94a3b8;margin-top:6px;">WASD / 矢印キー / 画面ドラッグ移動・オート射撃で無双しよう！</div>
  <div id="up"><div class="box"><div style="color:#facc15;font-weight:900;font-size:18px;">LEVEL UP! 強化を選択</div><div id="opts"></div></div></div>
<script>
const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
let keys={},ptr=null,p,enemies,bullets,gems,t=0,kills=0,paused=false,dead=false;
function init(){p={x:300,y:210,hp:100,maxHp:100,lv:1,xp:0,next:5,spd:3.1,rate:22,multi:1,blades:1,ang:0,cool:0,magnet:55};enemies=[];bullets=[];gems=[];t=0;kills=0;paused=false;dead=false;}
window.addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);
window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
cv.addEventListener('pointerdown',e=>{const r=cv.getBoundingClientRect();ptr={x:(e.clientX-r.left)*(cv.width/r.width),y:(e.clientY-r.top)*(cv.height/r.height)};if(dead)init();});
cv.addEventListener('pointermove',e=>{if(!ptr)return;const r=cv.getBoundingClientRect();ptr={x:(e.clientX-r.left)*(cv.width/r.width),y:(e.clientY-r.top)*(cv.height/r.height)};});
cv.addEventListener('pointerup',()=>ptr=null);
function showUpgrade(){
  paused=true;const up=document.getElementById('up'),opts=document.getElementById('opts');
  const pool=[
    {t:'🔥 マルチショット +1弾',fn:()=>p.multi++},
    {t:'⚡ 連射スピード超強化',fn:()=>p.rate=Math.max(6,p.rate-4)},
    {t:'🌀 回転レーザー刃 +1枚',fn:()=>p.blades++},
    {t:'🧲 回収範囲 & HP+30回復',fn:()=>{p.magnet+=35;p.hp=Math.min(p.maxHp,p.hp+30);}}
  ].sort(()=>0.5-Math.random()).slice(0,3);
  opts.innerHTML='';
  pool.forEach(o=>{const b=document.createElement('button');b.className='opt';b.textContent=o.t;b.onclick=()=>{o.fn();up.style.display='none';paused=false;};opts.appendChild(b);});
  up.style.display='flex';
}
function loop(){
  if(!paused&&!dead){
    t++;
    let dx=0,dy=0;
    if(keys['w']||keys['arrowup'])dy-=1;if(keys['s']||keys['arrowdown'])dy+=1;
    if(keys['a']||keys['arrowleft'])dx-=1;if(keys['d']||keys['arrowright'])dx+=1;
    if(ptr){const tx=ptr.x-p.x,ty=ptr.y-p.y,d=Math.hypot(tx,ty);if(d>6){dx=tx/d;dy=ty/d;}}
    const dl=Math.hypot(dx,dy);if(dl>0){p.x+=dx/dl*p.spd;p.y+=dy/dl*p.spd;}
    p.x=Math.max(14,Math.min(cv.width-14,p.x));p.y=Math.max(14,Math.min(cv.height-14,p.y));
    const spawnGap=Math.max(10,36-Math.floor(t/220));
    if(t%spawnGap===0){
      const side=Math.floor(Math.random()*4),ex=side===0?0:side===1?cv.width:Math.random()*cv.width,ey=side===2?0:side===3?cv.height:Math.random()*cv.height;
      enemies.push({x:ex,y:ey,hp:1+Math.floor(t/900),spd:1.1+Math.min(1.6,t/2400)});
    }
    if(p.cool>0)p.cool--;
    if(p.cool<=0&&enemies.length>0){
      let near=enemies[0],nd=1e9;
      for(const e of enemies){const d=Math.hypot(e.x-p.x,e.y-p.y);if(d<nd){nd=d;near=e;}}
      const base=Math.atan2(near.y-p.y,near.x-p.x);
      for(let k=0;k<p.multi;k++){
        const a=base+(k-(p.multi-1)/2)*0.18;
        bullets.push({x:p.x,y:p.y,vx:Math.cos(a)*7.5,vy:Math.sin(a)*7.5,life:70});
      }
      p.cool=p.rate;
    }
    p.ang+=0.07;
    bullets=bullets.filter(b=>{b.x+=b.vx;b.y+=b.vy;b.life--;return b.life>0;});
    for(const e of enemies){
      const a=Math.atan2(p.y-e.y,p.x-e.x);e.x+=Math.cos(a)*e.spd;e.y+=Math.sin(a)*e.spd;
      if(Math.hypot(e.x-p.x,e.y-p.y)<18){p.hp-=0.6;if(p.hp<=0){p.hp=0;dead=true;}}
      for(const b of bullets){if(Math.hypot(e.x-b.x,e.y-b.y)<14){e.hp--;b.life=0;}}
      for(let k=0;k<p.blades;k++){const ba=p.ang+k*(Math.PI*2/p.blades),bx=p.x+Math.cos(ba)*52,by=p.y+Math.sin(ba)*52;if(Math.hypot(e.x-bx,e.y-by)<18)e.hp-=0.35;}
    }
    enemies=enemies.filter(e=>{if(e.hp<=0){kills++;gems.push({x:e.x,y:e.y});return false;}return true;});
    gems=gems.filter(g=>{const d=Math.hypot(p.x-g.x,p.y-g.y);if(d<p.magnet){g.x+=(p.x-g.x)*0.18;g.y+=(p.y-g.y)*0.18;}if(d<16){p.xp++;if(p.xp>=p.next){p.xp=0;p.lv++;p.next=Math.floor(p.next*1.35+2);showUpgrade();}return false;}return true;});
  }
  ctx.clearRect(0,0,cv.width,cv.height);
  for(const g of gems){ctx.fillStyle='#facc15';ctx.beginPath();ctx.arc(g.x,g.y,4,0,Math.PI*2);ctx.fill();}
  for(const e of enemies){ctx.fillStyle='#f43f5e';ctx.beginPath();ctx.arc(e.x,e.y,10,0,Math.PI*2);ctx.fill();}
  for(const b of bullets){ctx.fillStyle='#38bdf8';ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();}
  for(let k=0;k<p.blades;k++){const ba=p.ang+k*(Math.PI*2/p.blades),bx=p.x+Math.cos(ba)*52,by=p.y+Math.sin(ba)*52;ctx.fillStyle='#22d3ee';ctx.beginPath();ctx.arc(bx,by,7,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#38bdf8';ctx.beginPath();ctx.arc(p.x,p.y,12,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
  const sec=Math.floor(t/60);
  document.getElementById('hp').textContent='HP '+Math.ceil(p.hp);
  document.getElementById('lv').textContent='LV '+p.lv+' ('+Math.floor(p.xp/p.next*100)+'%)';
  document.getElementById('kl').textContent='KILL '+kills;
  document.getElementById('tm').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
  if(dead){ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(0,0,cv.width,cv.height);ctx.fillStyle='#f43f5e';ctx.font='900 30px sans-serif';ctx.textAlign='center';ctx.fillText('GAME OVER',300,190);ctx.fillStyle='#fff';ctx.font='700 15px sans-serif';ctx.fillText('タップ / クリックで再挑戦 (KILL '+kills+')',300,230);}
  requestAnimationFrame(loop);
}
init();loop();
</script>
</body>
</html>`;

const CLICKER_RUSH_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>10秒脳汁オーバーロード</title>
<style>
  *{box-sizing:border-box;user-select:none}
  body{margin:0;background:radial-gradient(circle at center,#2e1065,#090d16);color:#fff;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;overflow:hidden;touch-action:manipulation}
  .wrap{width:min(94vw,420px);text-align:center}
  .stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px}
  .card{background:rgba(15,23,42,0.85);border:1px solid #4c1d95;border-radius:14px;padding:10px}
  .val{font-size:22px;font-weight:900;font-family:monospace;color:#fde047}
  .orb{width:170px;height:170px;border-radius:50%;margin:12px auto;border:6px solid #fde047;background:radial-gradient(circle at 30% 30%,#fde047,#f97316,#e11d48);color:#fff;font-size:28px;font-weight:900;cursor:pointer;box-shadow:0 0 40px rgba(249,115,22,0.65);transition:transform .06s}
  .orb:active{transform:scale(0.91)}
  .bar{height:12px;background:#1e1b4b;border-radius:999px;overflow:hidden;border:1px solid #6366f1;margin:10px 0}
  .fill{height:100%;width:0%;background:linear-gradient(90deg,#38bdf8,#f472b6,#fde047);transition:width .1s}
  .btn{background:#4f46e5;color:#fff;border:none;padding:10px 16px;border-radius:12px;font-weight:800;cursor:pointer;margin:4px}
  .pop{position:fixed;pointer-events:none;font-weight:900;font-family:monospace;font-size:22px;color:#fde047;animation:up .55s ease-out forwards}
  @keyframes up{0%{opacity:1;transform:translate(-50%,0) scale(1)}100%{opacity:0;transform:translate(-50%,-70px) scale(1.3)}}
</style>
</head>
<body>
<div class="wrap" id="wrap">
  <h2 style="margin:0 0 8px 0;">🔥 10秒脳汁オーバーロード</h2>
  <div class="stats">
    <div class="card"><div style="font-size:10px;color:#94a3b8">SCORE</div><div class="val" id="sc">0</div></div>
    <div class="card"><div style="font-size:10px;color:#94a3b8">TIME</div><div class="val" id="tm" style="color:#38bdf8">10.0s</div></div>
    <div class="card"><div style="font-size:10px;color:#94a3b8">MULT</div><div class="val" id="mt" style="color:#f472b6">x1</div></div>
  </div>
  <div class="bar"><div class="fill" id="fv"></div></div>
  <button class="orb" id="orb">TAP!</button>
  <div id="msg" style="font-size:13px;color:#e2e8f0;min-height:22px;font-weight:700">連打またはスペースキーで爆発スコア！</div>
  <div style="margin-top:8px">
    <button class="btn" onclick="reset()">🔄 10秒チャレンジ</button>
    <button class="btn" style="background:#f59e0b;color:#0f172a" onclick="buyBoost()">💎 +2倍パワー (10G)</button>
  </div>
</div>
<script>
let score=0,timeLeft=10.0,running=false,finished=false,fever=0,basePower=10,timerId=null;
function hit(x,y){
  if(finished)return;
  if(!running){running=true;startTimer();}
  fever=Math.min(100,fever+8);
  const mult=fever>=85?5:fever>=50?3:fever>=20?2:1;
  const pts=basePower*mult;
  score+=pts;
  document.getElementById('sc').textContent=score;
  document.getElementById('mt').textContent='x'+mult+(mult===5?' FEVER!':'');
  document.getElementById('fv').style.width=fever+'%';
  const el=document.createElement('div');el.className='pop';el.textContent='+'+pts;el.style.left=x+'px';el.style.top=y+'px';document.body.appendChild(el);setTimeout(()=>el.remove(),550);
  const w=document.getElementById('wrap');w.style.transform='translate('+(Math.random()*6-3)+'px,'+(Math.random()*6-3)+'px)';setTimeout(()=>w.style.transform='',50);
}
function startTimer(){
  clearInterval(timerId);
  timerId=setInterval(()=>{
    timeLeft=Math.max(0,timeLeft-0.1);
    fever=Math.max(0,fever-2.2);
    document.getElementById('tm').textContent=timeLeft.toFixed(1)+'s';
    document.getElementById('fv').style.width=fever+'%';
    if(timeLeft<=0){clearInterval(timerId);finished=true;document.getElementById('msg').textContent='🎉 フィニッシュ！ 記録: '+score+' pts';}
  },100);
}
function reset(){clearInterval(timerId);score=0;timeLeft=10.0;running=false;finished=false;fever=0;document.getElementById('sc').textContent='0';document.getElementById('tm').textContent='10.0s';document.getElementById('mt').textContent='x1';document.getElementById('fv').style.width='0%';document.getElementById('msg').textContent='連打またはスペースキーで爆発スコア！';}
async function buyBoost(){
  if(window.GHUB&&window.GHUB.requestPayment){
    const r=await window.GHUB.requestPayment({itemId:'clicker_2x',itemName:'脳汁2倍ブースト',price:10,consumable:true,seamless:true});
    if(r&&r.success){basePower*=2;document.getElementById('msg').textContent='⚡ 1タップ威力 '+basePower+' に強化！';}
  }else{basePower*=2;document.getElementById('msg').textContent='⚡ オフラインブースト発動！威力 '+basePower;}
}
document.getElementById('orb').addEventListener('pointerdown',e=>hit(e.clientX,e.clientY));
window.addEventListener('keydown',e=>{if(e.code==='Space'||e.key==='Enter'){e.preventDefault();const r=document.getElementById('orb').getBoundingClientRect();hit(r.left+r.width/2,r.top+r.height/2);}});
</script>
</body>
</html>`;

const AI_DUNGEON_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>AIダンジョン・無限異世界RPG</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#07111a;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;justify-content:center;padding:14px;min-height:100vh}
  .app{width:min(96vw,560px);background:#0f172a;border:1px solid #1e293b;border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:12px}
  .hud{display:flex;justify-content:space-between;background:#090d16;padding:10px 14px;border-radius:12px;font-family:monospace;font-weight:800;font-size:13px}
  .story{background:#090d16;border:1px solid #1e293b;border-radius:14px;padding:14px;min-height:170px;line-height:1.7;font-size:13px;white-space:pre-wrap}
  .choices{display:flex;flex-direction:column;gap:8px}
  button.ch{background:#1e293b;border:1px solid #334155;color:#fff;padding:11px 14px;border-radius:12px;font-weight:700;font-size:13px;text-align:left;cursor:pointer;transition:.15s}
  button.ch:hover:not(:disabled){border-color:#10b981;background:#064e3b}
  button.ch:disabled{opacity:.5;cursor:wait}
</style>
</head>
<body>
<div class="app">
  <div class="hud">
    <span style="color:#34d399" id="hp">HP 100</span>
    <span style="color:#fbbf24" id="gold">GOLD 0</span>
    <span style="color:#38bdf8" id="fl">FLOOR 1</span>
  </div>
  <div class="story" id="story">🤖 AIダンジョンへようこそ！\n目の前にはネオンに輝く古代遺跡の扉がある。\nあなたの選択をAIがリアルタイムで紡ぎ出します。</div>
  <div class="choices" id="choices"></div>
</div>
<script>
let hp=100,gold=0,floor=1,busy=false;
const FALLBACK_EVENTS=[
  {text:'💎 光り輝く宝箱を見つけたが、周囲に微かな罠の気配がある。',opts:[['慎重に解除して開ける',15,25],['力任せに蹴り開ける',-10,40],['無視して次の階へ進む',0,5]]},
  {text:'👾 ネオン・スライムが飛び出してきた！',opts:[['⚡ 全力で魔法を放つ',-8,30],['🛡️ 盾を構えて隙を窺う',5,15],['🏃 素早く背後に回り込む',0,20]]},
  {text:'🧙 旅のAI商人が怪しいポーションを差し出している。',opts:[['🧪 15Gで回復薬を飲む',25,-15],['⚔️ 秘術の強化を頼む',-5,35],['💬 遺跡の情報を聞き出す',5,10]]}
];
function renderHud(){document.getElementById('hp').textContent='HP '+hp;document.getElementById('gold').textContent='GOLD '+gold;document.getElementById('fl').textContent='FLOOR '+floor;}
function renderChoices(opts){
  const el=document.getElementById('choices');el.innerHTML='';
  if(hp<=0){const b=document.createElement('button');b.className='ch';b.textContent='🔄 最初から挑戦する';b.onclick=()=>{hp=100;gold=0;floor=1;renderHud();step('旅を再開する');};el.appendChild(b);return;}
  opts.forEach(o=>{
    const b=document.createElement('button');b.className='ch';b.textContent=o;
    b.onclick=()=>step(o);
    el.appendChild(b);
  });
}
async function step(action){
  if(busy)return;busy=true;
  document.querySelectorAll('button.ch').forEach(b=>b.disabled=true);
  document.getElementById('story').textContent='⏳ AIが次の展開を生成中...';
  try{
    let text='',nextOpts=null;
    const prompt='階層:'+floor+' HP:'+hp+' GOLD:'+gold+' プレイヤー行動:'+action+'。短い2〜3文のRPG展開と、JSON配列で選択肢3つを返してください。形式: ストーリー本文\\nCHOICES:["選択肢1","選択肢2","選択肢3"]';
    if(window.GHUB&&window.GHUB.askAI){
      const res=await window.GHUB.askAI(prompt,'あなたはテンポの良い日本語ローグライクRPGのゲームマスターです。');
      if(res&&res.reply)text=res.reply;
    }else{
      const r=await fetch('/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userPrompt:prompt,maxTokens:350})});
      if(r.ok){const d=await r.json();text=d.reply||'';}
    }
    const m=text.match(/CHOICES:\\s*(\\[[\\s\\S]*?\\])/);
    if(m){try{nextOpts=JSON.parse(m[1]);text=text.replace(m[0],'').trim();}catch(e){}}
    if(!text||text.length<8)throw new Error('fallback');
    const hpDelta=Math.floor(Math.random()*26)-14;
    const gDelta=Math.floor(Math.random()*35);
    hp=Math.max(0,Math.min(120,hp+hpDelta));gold+=gDelta;floor++;
    document.getElementById('story').textContent=text+'\\n\\n(HP '+(hpDelta>=0?'+':'')+hpDelta+' / +'+gDelta+' GOLD)';
    renderHud();
    renderChoices(Array.isArray(nextOpts)&&nextOpts.length>=2?nextOpts.slice(0,3):['⚔️ 奥へ突き進む','🔍 周囲を探索する','🧪 少し休憩する']);
  }catch(e){
    const ev=FALLBACK_EVENTS[Math.floor(Math.random()*FALLBACK_EVENTS.length)];
    const pick=ev.opts[Math.floor(Math.random()*ev.opts.length)];
    hp=Math.max(0,Math.min(120,hp+pick[1]));gold=Math.max(0,gold+pick[2]);floor++;
    document.getElementById('story').textContent='[FLOOR '+floor+'] '+ev.text+'\\n→ '+pick[0]+' (HP '+(pick[1]>=0?'+':'')+pick[1]+', GOLD '+(pick[2]>=0?'+':'')+pick[2]+')';
    renderHud();
    renderChoices(ev.opts.map(x=>x[0]));
  }finally{busy=false;}
}
renderHud();
renderChoices(['⚔️ ネオンの扉を開けて進む','🔍 入口の碑文を調べる','🧪 装備を整えて突入する']);
</script>
</body>
</html>`;

export const TRENDING_GAMES_SEED = [
  {
    id: 'trend-suika-neon-drop',
    title: '🍉 ネオン・オーブマージ',
    tag: 'Puzzle',
    description: '【2026トレンド】落とす＆合体の爽快スイカ系パズル！連鎖コンボでハイスコアを狙おう（PC・スマホ・オフライン対応）',
    thumbnail_url: '/trend-thumbs/suika-merge.svg',
    author_email: 'ghub_official@g-hub.io',
    platforms: 'pc,mobile',
    price_coins: 0,
    likes_count: 148,
    play_count: 1240,
    is_event: true,
    is_trending: true,
    trend_badge: '🔥 パズル急上昇',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    html: SUIKA_MERGE_HTML
  },
  {
    id: 'trend-vampire-orbit-survivor',
    title: '⚡ ネオン弾幕サバイバー',
    tag: 'Action',
    description: '【2026トレンド】オート射撃×ローグライト無双！レベルアップで回転レーザーやマルチショットを重ねて大群を殲滅しよう',
    thumbnail_url: '/trend-thumbs/orbit-survivor.svg',
    author_email: 'ghub_official@g-hub.io',
    platforms: 'pc,mobile',
    price_coins: 0,
    likes_count: 192,
    play_count: 1680,
    is_event: true,
    is_trending: true,
    trend_badge: '⚡ トレンド1位',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    html: ORBIT_SURVIVOR_HTML
  },
  {
    id: 'trend-brainrot-clicker-rush',
    title: '🔥 10秒脳汁オーバーロード',
    tag: 'Action',
    description: '【ドパガキ人気】10秒間で連打＆FEVER x5を叩き出すハイテンポクリッカー！課金SDKブースト連携にも対応',
    thumbnail_url: '/trend-thumbs/clicker-rush.svg',
    author_email: 'ghub_official@g-hub.io',
    platforms: 'pc,mobile',
    price_coins: 0,
    likes_count: 126,
    play_count: 980,
    is_event: true,
    is_trending: true,
    trend_badge: '💥 脳汁中毒',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    html: CLICKER_RUSH_HTML
  },
  {
    id: 'trend-ai-dungeon-oracle',
    title: '🤖 AIダンジョン・無限異世界RPG',
    tag: 'RPG',
    description: '【AI連携トレンド】選ぶたびにAIが物語と選択肢を即時生成する無限ローグライクRPG（G-HUB AI＆オフラインフォールバック対応）',
    thumbnail_url: '/trend-thumbs/ai-dungeon.svg',
    author_email: 'ghub_official@g-hub.io',
    platforms: 'pc,mobile',
    price_coins: 0,
    likes_count: 114,
    play_count: 860,
    is_event: false,
    is_trending: true,
    trend_badge: '🤖 AI生成RPG',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    html: AI_DUNGEON_HTML
  }
];
