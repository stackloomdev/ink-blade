import test from 'node:test';
import assert from 'node:assert/strict';
import { InkGame, STEP } from '../src/combat.js';

function advance(g,seconds,input={},fps=60){for(let i=0;i<Math.round(seconds*fps);i++)g.advance(1/fps,input);}
function arena(){const g=new InkGame();g.reset();g.player.x=9;g.advance(STEP);g.events=[];return g;}

test('movement and gravity stay consistent at 30, 60 and 120 rendering FPS',()=>{
  const results=[30,60,120].map(fps=>{const g=new InkGame();g.reset();g.command('jump');advance(g,.5,{move:1},fps);return [g.player.x,g.player.y,g.player.vy];});
  for(const result of results)result.forEach((v,i)=>assert.ok(Math.abs(v-results[0][i])<1e-8));
});

test('a swing hits each enemy once; separate buffered inputs chain all three slashes',()=>{
  const g=arena(),p=g.player,e=g.enemies[0];e.x=p.x+1.6;e.cooldown=99;g.enemies=[e];
  g.command('attack');advance(g,.20);assert.equal(e.hp,e.maxHp-19);
  advance(g,.05);assert.equal(e.hp,e.maxHp-19);
  e.x=p.x+1.5;g.command('attack');
  for(let i=0;i<12&&p.move!=='slash2';i++)advance(g,STEP);
  assert.equal(p.move,'slash2');
  for(let i=0;i<30&&p.t<.18;i++)advance(g,STEP);
  e.x=p.x+1.5;g.command('attack');advance(g,.12);assert.equal(p.move,'slash3');
});

test('uppercut launches an enemy, while the player must actively jump to pursue',()=>{
  const g=arena(),p=g.player,e=g.enemies[0];e.x=p.x+1.5;e.cooldown=99;g.enemies=[e];
  g.command('attack',{up:true});advance(g,.25);
  assert.ok(e.y>0);assert.equal(p.y,0);
  advance(g,.10);g.command('jump');advance(g,.1);assert.ok(p.y>0);
  g.command('attack');advance(g,.02);assert.equal(p.move,'air');
  advance(g,.25);g.command('attack',{down:true});advance(g,.02);assert.equal(p.move,'dive');
  advance(g,1);assert.equal(p.y,0);
});

test('precise guard parries; an early held guard only blocks and builds posture',()=>{
  for(const early of [false,true]){
    const g=arena(),p=g.player,e=g.enemies[0];g.enemies=[e];e.x=p.x+1.3;e.facing=-1;e.cooldown=99;
    g.command('guard');if(early)advance(g,.22,{guard:true});else advance(g,STEP,{guard:true});
    g.setState(e,'enemyAttack',.24);e.hitSet.clear();advance(g,STEP,{guard:true});
    assert.equal(p.hp,100);assert.equal(g.parries,early?0:1);
    if(early)assert.ok(p.posture>0);else{assert.ok(e.posture>=54);assert.equal(g.ink,24);}
    advance(g,.1,{guard:true});assert.equal(g.parries,early?0:1);
  }
});

test('repeated guard commands do not renew the precise window during its cooldown',()=>{
  const g=arena(),p=g.player,e=g.enemies[0];g.enemies=[e];e.x=p.x+1.2;e.cooldown=99;
  g.command('guard');advance(g,.2,{guard:true});g.command('guard');advance(g,STEP,{guard:true});
  g.setState(e,'enemyAttack',.24);e.facing=-1;advance(g,STEP,{guard:true});
  assert.equal(g.parries,0);assert.ok(p.posture>0);
});

test('a fast draw-cut checks the swept interval and cannot tunnel through the player',()=>{
  const g=new InkGame();g.reset(true);advance(g,STEP);const e=g.enemies[0],p=g.player;
  e.x=p.x+4;e.facing=-1;e.vx=-500;e.phase=2;g.setState(e,'enemyAttack',.38);
  advance(g,STEP);assert.equal(p.hp,78);
});

test('dash gives brief invulnerability and cannot be restarted during cooldown',()=>{
  const g=arena(),p=g.player,e=g.enemies[0];g.enemies=[e];e.x=p.x+1.5;e.facing=-1;
  g.command('dash');g.setState(e,'enemyAttack',.24);advance(g,STEP);
  assert.equal(p.hp,100);assert.equal(p.state,'dash');
  advance(g,.27);g.command('dash');advance(g,STEP);assert.notEqual(p.state,'dash');
});

test('execution requires a nearby broken enemy and consumes a Boss opening only once',()=>{
  const g=new InkGame();g.reset(true);advance(g,STEP);const e=g.enemies[0],p=g.player;e.x=p.x+1.5;
  g.command('execute');advance(g,STEP);assert.notEqual(p.state,'execute');
  g.setState(e,'broken',3);g.command('execute');advance(g,.65);
  assert.equal(e.hp,e.maxHp-95);assert.equal(e.posture,0);assert.notEqual(e.state,'broken');
  const hp=e.hp;g.command('execute');advance(g,.3);assert.equal(e.hp,hp);
});

test('normal attacks do not restart Boss recovery; each phase starts exactly once',()=>{
  const g=new InkGame();g.reset(true);advance(g,STEP);const e=g.enemies[0];
  g.setState(e,'recover',.8);e.t=.4;g.hitEnemy(e,19,19,3,'slash1');assert.equal(e.state,'recover');assert.equal(e.t,.4);
  g.hitEnemy(e,350,0,0,'slash3');assert.equal(e.phase,2);assert.equal(e.state,'phase');
  g.hitEnemy(e,350,0,0,'slash3');assert.equal(e.phase,2);
  advance(g,2);g.hitEnemy(e,370,0,0,'slash3');assert.equal(e.phase,3);assert.equal(g.gateBroken,true);
  assert.equal(g.drainEvents().filter(e=>e.type==='phase').length,2);
});

test('ultimate requires a full meter and consumes it once',()=>{
  const g=arena();g.command('ultimate');advance(g,STEP);assert.notEqual(g.player.state,'ultimate');
  g.ink=100;g.command('ultimate');advance(g,STEP);assert.equal(g.player.state,'ultimate');assert.equal(g.ink,0);
  g.command('ultimate');advance(g,.1);assert.equal(g.ink,0);
});

test('pause discards queued inputs and freezes state; retry clears the previous fight',()=>{
  const g=arena();g.command('attack');g.pause();const time=g.time,x=g.player.x;
  advance(g,2,{move:1});assert.equal(g.time,time);assert.equal(g.player.x,x);
  g.pause();advance(g,STEP);assert.notEqual(g.player.state,'attack');
  g.reset(true);assert.equal(g.player.hp,100);assert.equal(g.enemies.length,0);assert.equal(g.encounter,3);assert.equal(g.combo,0);assert.equal(g.gateBroken,false);
});

function playCampaign(bossOnly){
  const g=new InkGame();g.reset(bossOnly);let lastAttack=0,guarding=false;const phases=[];
  // A reactive controller uses the same commands as a player; no health, damage,
  // meter, positions or enemy state are changed after starting the run.
  for(let frame=0;frame<18000&&g.status==='playing';frame++){
    const p=g.player,e=g.enemies.filter(e=>e.hp>0).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0],dx=e?e.x-p.x:0;
    const input={move:e?(Math.abs(dx)>1.7||p.facing!==Math.sign(dx)?Math.sign(dx):0):1,guard:false};
    const danger=g.enemies.find(a=>a.hp>0&&((a.state==='windup'&&a.duration-a.t<.08)||a.state==='enemyAttack')&&Math.abs(a.x-p.x)<(a.type==='spear'?3.45:2.7));
    if(danger){input.move=Math.sign(danger.x-p.x);input.guard=true;if(!guarding)g.command('guard');guarding=true;}
    else{
      guarding=false;
      if(e?.state==='broken'&&Math.abs(dx)<3)g.command('execute');
      else if(g.ink>=100&&e&&Math.abs(dx)<7)g.command('ultimate');
      else if(e&&e.state!=='windup'&&Math.abs(dx)<2.6&&frame-lastAttack>=9){g.command('attack');lastAttack=frame;}
    }
    g.advance(STEP,input);for(const event of g.drainEvents())if(event.type==='phase')phases.push(event.phase);
  }
  assert.equal(g.status,'won');assert.deepEqual(phases,[2,3]);assert.ok(g.parries>0);assert.equal(g.kills,bossOnly?1:9);
  return g;
}
test('the full bamboo chapter and all three Boss phases can be cleared through real commands',()=>{playCampaign(false);});
test('the direct Boss challenge can be cleared from its normal starting health and meter',()=>{playCampaign(true);});
