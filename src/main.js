import { InkGame } from './combat.js';
import { InkScene } from './scene.js';
import { InkAudio } from './audio.js';

const $=id=>document.getElementById(id), game=new InkGame(), audio=new InkAudio();
let scene,previous=performance.now(),announcementUntil=0,feedbackUntil=0,lastStatus='',helpPaused=false,lastHud=0;
const keys=new Set(),touch=new Set(),enemyLabels=new Map();
const ui=Object.fromEntries(['game','intro','pause','health-hud','health-value','health-fill','posture-fill','ink-fill','ink-ready','combo','combo-count','combo-name','announcement','announcement-title','announcement-sub','feedback','objective','objective-text','boss-hud','boss-phase','boss-health-fill','boss-posture-fill','pause-panel','result','result-title','result-eyebrow','result-copy','result-stats','enemies-hud','help-dialog','cinematic','sound','sound-state'].map(id=>[id,$(id)]));
const input=()=>({move:(keys.has('KeyD')||keys.has('ArrowRight')||touch.has('right')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')||touch.has('left')?1:0),guard:keys.has('KeyK')||touch.has('guard'),up:keys.has('KeyW')||keys.has('ArrowUp'),down:keys.has('KeyS')||keys.has('ArrowDown')});
const clearInput=()=>{keys.clear();touch.clear();};
function announce(title,sub='',duration=2.5){ui['announcement-title'].textContent=title;ui['announcement-sub'].textContent=sub;ui.announcement.classList.add('visible');announcementUntil=performance.now()+duration*1000;}
function feedback(text){ui.feedback.textContent=text;ui.feedback.classList.add('visible');feedbackUntil=performance.now()+550;}
function focusGame(){$('world').focus({preventScroll:true});}
function start(boss=false){
  if(!scene?.artReady)return;clearInput();game.reset(boss);scene.reset();scene.cameraX=boss?74:7;audio.start();audio.pause(false);
  announcementUntil=0;feedbackUntil=0;ui.feedback.classList.remove('visible');lastStatus='';syncUI();focusGame();
}
function menu(){clearInput();game.reset();game.status='menu';game.player.x=11;scene.reset();scene.cameraX=8;game.events=[];ui.announcement.classList.remove('visible');lastStatus='';syncUI();}
function pause(){if(!['playing','paused'].includes(game.status))return;game.pause();clearInput();audio.pause(game.status==='paused');syncUI();if(game.status==='playing')focusGame();else $('resume').focus();}
function showHelp(){
  helpPaused=game.status==='playing';if(helpPaused){game.pause();clearInput();audio.pause(true);syncUI();}
  ui['help-dialog'].showModal();
}
function closeHelp(){ui['help-dialog'].close();}
ui['help-dialog'].addEventListener('close',()=>{if(helpPaused&&game.status==='paused'){game.pause();audio.pause(false);syncUI();focusGame();}helpPaused=false;});
function formatTime(s){return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;}
function syncUI(){
  const status=game.status;
  if(status!==lastStatus){
    lastStatus=status;ui.game.dataset.status=status;ui.intro.hidden=status!=='menu';
    ui.pause.hidden=status==='menu'||status==='won'||status==='lost';ui['health-hud'].hidden=status==='menu';
    ui['pause-panel'].hidden=status!=='paused';ui.result.hidden=!['won','lost'].includes(status);
    ui.pause.setAttribute('aria-label',status==='paused'?'继续游戏':'暂停游戏');ui.pause.innerHTML=status==='paused'?'继续 <span>▷</span>':'暂停 <span>Ⅱ</span>';
    if(status==='lost'||status==='won') {
      const won=status==='won';ui['result-title'].textContent=won?'画破':'墨尽';ui['result-eyebrow'].textContent=won?'雨 歇 · 刀 归 鞘':'胜 负 皆 在 一 刀';
      ui['result-copy'].textContent=won?'风雨散尽。这一刀，留在画里。':'听清雨声，再出一刀。';
      ui['result-stats'].innerHTML=`<span><b>${formatTime(game.elapsed)}</b>用时</span><span><b>${game.bestCombo}</b>最高连斩</span><span><b>${game.parries}</b>精准弹反</span>`;
      $('retry').innerHTML=won?'再战一回 <span>⟶</span>':game.checkpoint?'重战白衣 <span>⟶</span>':'再入竹林 <span>⟶</span>';
      clearInput();audio.pause(true);setTimeout(()=>$('retry').focus(),100);
    }
  }
  const p=game.player;
  ui['health-fill'].style.width=`${p.hp}%`;ui['health-value'].textContent=`${Math.ceil(p.hp)} / 100`;
  ui['posture-fill'].style.width=`${p.posture/p.maxPosture*100}%`;ui['ink-fill'].style.width=`${game.ink}%`;
  ui['ink-fill'].style.background=game.ink>=100?'#a62622':'';ui['ink-ready'].hidden=game.ink<100;
  ui.combo.hidden=game.combo<2||status==='menu';ui['combo-count'].textContent=String(game.combo).padStart(2,'0');ui['combo-name'].textContent=game.combo>20?'刀意如雨':game.combo>10?'行云流水':'刀锋未歇';
  const boss=game.enemies.find(e=>e.type==='boss'&&e.hp>0);ui['boss-hud'].hidden=!boss||status==='menu';
  if(boss){ui['boss-phase'].textContent=['','壹 · 对剑','贰 · 藏锋','叁 · 破雨'][boss.phase];ui['boss-health-fill'].style.width=`${boss.hp/boss.maxHp*100}%`;ui['boss-posture-fill'].style.width=`${boss.posture/boss.maxPosture*100}%`;}
  ui.objective.hidden=status!=='playing'||!!boss;
  ui['objective-text'].textContent=game.activeEncounter?`斩开去路 · ${game.enemies.filter(e=>e.hp>0).length} 人`:game.encounter===3?'古寺在前 · 白衣候雨':'向右前行';
}
function updateEnemyLabels(){
  const ids=new Set();
  for(const e of game.enemies){
    if(e.hp<=0||game.status==='menu')continue;ids.add(e.id);
    if(!enemyLabels.has(e.id)){const el=document.createElement('div');el.className='enemy-hud';el.innerHTML='<div class="enemy-life"><i></i></div><div class="enemy-posture"><i></i></div><span class="enemy-label"></span>';ui['enemies-hud'].append(el);enemyLabels.set(e.id,el);}
    const el=enemyLabels.get(e.id),pos=scene.actorLabel(e);
    el.style.left=`${pos.x}px`;el.style.top=`${pos.y}px`;el.style.visibility=pos.x<0||pos.x>innerWidth?'hidden':'visible';
    el.querySelector('.enemy-life i').style.width=`${e.hp/e.maxHp*100}%`;el.querySelector('.enemy-posture i').style.width=`${e.posture/e.maxPosture*100}%`;
    el.classList.toggle('boss-label',e.type==='boss');el.classList.toggle('broken',e.state==='broken');el.classList.toggle('tell',e.state==='windup');
    el.querySelector('.enemy-label').textContent=e.state==='broken'?'破 · L':e.state==='windup'?(e.type==='boss'&&e.phase>=2?'藏':'✧'):'';
  }
  for(const [id,el]of enemyLabels)if(!ids.has(id)){el.remove();enemyLabels.delete(id);}
}
function handleEvents(){
  for(const e of game.drainEvents()){
    scene.handle(e);audio.play(e);
    if(e.type==='chapter'||e.type==='encounter'||e.type==='clear'||e.type==='phase')announce(e.text,e.sub,e.type==='phase'?2.0:2.6);
    if(e.type==='parry')feedback('弹反');
    if(e.type==='break')feedback('破势');
    if(e.type==='ultimate')feedback('墨影');
    if(e.type==='execution'){
      ui.cinematic.classList.remove('active');void ui.cinematic.offsetWidth;ui.cinematic.classList.add('active');
    }
    if(e.type==='won'||e.type==='lost')syncUI();
  }
}
const actionKeys={KeyJ:'attack',KeyK:'guard',KeyL:'execute',KeyQ:'ultimate',Space:'jump',ShiftLeft:'dash',ShiftRight:'dash'};
window.addEventListener('keydown',event=>{
  if(ui['help-dialog'].open)return;
  const code=event.code;
  if(code==='Escape'||code==='KeyP'){event.preventDefault();if(!event.repeat)pause();return;}
  if(code==='KeyM'){if(!event.repeat)toggleSound();return;}
  if(game.status!=='playing')return;
  if(actionKeys[code]||['KeyA','KeyD','KeyW','KeyS','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(code))event.preventDefault();
  keys.add(code);if(event.repeat)return;
  if(actionKeys[code])game.command(actionKeys[code],input());
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{clearInput();if(game.status==='playing')pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(game.status==='playing')pause();}});
$('start').addEventListener('click',()=>start());$('boss-start').addEventListener('click',()=>start(true));
$('pause').addEventListener('click',pause);$('resume').addEventListener('click',pause);
$('restart').addEventListener('click',()=>start(game.checkpoint));$('retry').addEventListener('click',()=>start(game.status==='won'?game.bossOnly:game.checkpoint));
$('menu').addEventListener('click',menu);$('result-menu').addEventListener('click',menu);
$('help').addEventListener('click',showHelp);$('close-help').addEventListener('click',closeHelp);
function toggleSound(){const enabled=audio.toggle();ui['sound-state'].textContent=enabled?'开':'关';ui.sound.setAttribute('aria-pressed',String(enabled));ui.sound.setAttribute('aria-label',enabled?'关闭声音':'开启声音');}
$('sound').addEventListener('click',toggleSound);
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await ui.game.requestFullscreen();}catch{announce('可使用浏览器全屏','');}});
for(const button of document.querySelectorAll('.touch-controls button')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);const hold=button.dataset.hold;if(hold)touch.add(hold);const action=button.dataset.action;if(action==='upper')game.command('attack',{up:true});else if(action==='dive')game.command('attack',{down:true});else if(action)game.command(action,input());});
  const release=()=>{if(button.dataset.hold)touch.delete(button.dataset.hold);};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
try{
  scene=new InkScene($('world'));game.player.x=11;game.events=[];
  $('start').disabled=true;$('boss-start').disabled=true;
  const assetStatus=document.querySelector('.intro-note');assetStatus.textContent='原画载入中…';
  scene.ready.then(()=>{$('start').disabled=false;$('boss-start').disabled=false;assetStatus.textContent='键盘操控 · 建议开启声音';}).catch(error=>{
    console.error(error);$('error').hidden=false;$('error').textContent='角色原画未能载入，请重新载入画卷。';assetStatus.textContent='原画载入失败';
  });
  Object.defineProperty(window,'inkArt',{get:()=>({ready:scene.artReady,error:scene.assetError?.message||null,
    actors:[...scene.actors.values()].filter(w=>w.isOriginalArt).map(w=>({type:w.type,loaded:w.loaded,parts:w.pieces.length,source:w.views.get(w.view)?.d.file,
      gait:w.locomotion?{phase:w.locomotion.phase,weight:w.locomotion.weight,feet:w.locomotion.feet.map(f=>({contact:f.contact,x:f.worldX,y:f.y}))}:null}))})});
  // Read-only diagnostics for development. No state mutation or cheats are exposed.
  Object.defineProperty(window,'inkBlade',{get:()=>({status:game.status,x:game.player.x,y:game.player.y,hp:game.player.hp,state:game.player.state,move:game.player.move,t:game.player.t,facing:game.player.facing,ink:game.ink,combo:game.combo,parries:game.parries,stage:game.encounter,elapsed:game.elapsed,enemies:game.enemies.map(e=>({id:e.id,type:e.type,x:e.x,hp:e.hp,posture:e.posture,state:e.state,t:e.t,duration:e.duration,phase:e.phase})),render:{calls:scene.renderer.info.render.calls,triangles:scene.renderer.info.render.triangles,geometries:scene.renderer.info.memory.geometries,textures:scene.renderer.info.memory.textures}})});
  function frame(now){const dt=Math.min((now-previous)/1000,.1);previous=now;game.advance(dt,input());handleEvents();for(const e of scene.update(game,dt))audio.play(e);updateEnemyLabels();if(now-lastHud>50){syncUI();lastHud=now;}if(now>announcementUntil)ui.announcement.classList.remove('visible');if(now>feedbackUntil)ui.feedback.classList.remove('visible');requestAnimationFrame(frame);}
  syncUI();requestAnimationFrame(frame);
}catch(error){console.error(error);$('error').hidden=false;$('error').textContent='画卷暂未展开。请使用支持 WebGL 2 的现代浏览器，并开启图形加速后重新载入。';$('start').disabled=true;$('boss-start').disabled=true;}
