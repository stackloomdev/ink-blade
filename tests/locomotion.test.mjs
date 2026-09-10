import test from 'node:test';
import assert from 'node:assert/strict';
import {DistanceGait,sampleGait,poseGaitLegs} from '../src/locomotion.js';
import {ART_VIEWS} from '../src/art-rig-data.js';

const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

test('both legs take equal steps; walking has double support and running has flight',()=>{
  for(const speed of [2.2,3.9,7.4]){
    let doubleSupport=0,flight=0,maxLift=0;
    for(let i=0;i<1000;i++){
      const pose=sampleGait(i/1000,speed),other=sampleGait(i/1000+.5,speed);
      near(pose.feet[0].x,other.feet[1].x);near(pose.feet[0].y,other.feet[1].y);
      const contacts=pose.feet.filter(f=>f.contact).length;
      if(contacts===2)doubleSupport++;if(!contacts)flight++;
      maxLift=Math.max(maxLift,pose.feet[0].y);
    }
    if(speed===2.2){assert.ok(doubleSupport>0);assert.equal(flight,0);assert.ok(maxLift<.1);}
    if(speed===7.4){assert.equal(doubleSupport,0);assert.ok(flight>0);assert.ok(maxLift>.5);}
  }
});

test('planted feet stay fixed in world space through acceleration at 30, 60 and 120 FPS',()=>{
  for(const facing of [-1,1])for(const fps of [30,60,120]){
    const gait=new DistanceGait();let x=0,previous;
    for(let frame=0;frame<fps*3;frame++){
      const time=frame/fps,speed=Math.min(7.4,2.2+time*8);x+=facing*speed/fps;
      const pose=gait.update({state:'run',x,vx:facing*speed,facing},time);
      if(previous)for(let i=0;i<2;i++)if(pose.feet[i].contact&&previous.feet[i].contact)near(pose.feet[i].worldX,previous.feet[i].worldX);
      previous=pose;
    }
  }
});

test('cadence follows distance and does not drift during hitstop or pause',()=>{
  const phases=[];
  for(const fps of [30,60,120]){
    const gait=new DistanceGait(),a={state:'run',x:0,vx:7.4,facing:1};gait.update(a,0);
    for(let frame=1;frame<=fps;frame++){a.x=7.4*frame/fps;gait.update(a,frame/fps);}
    phases.push(gait.phase);
    const before=gait.update(a,1);
    for(let frame=0;frame<120;frame++)assert.deepEqual(gait.update(a,1),before);
  }
  phases.forEach(p=>near(p,7.4/2.8));
});

test('turning, restarting and leaving locomotion discard previous foot plants',()=>{
  const gait=new DistanceGait(),a={state:'run',x:4,vx:7.4,facing:1};gait.update(a,1);
  a.x=4.2;gait.update(a,1.03);
  a.facing=-1;a.vx=-7.4;const turn=gait.update(a,1.05);near(turn.phase,0);
  assert.ok(turn.feet.every(f=>Math.abs(f.worldX-a.x)<1));
  a.x=40;const teleport=gait.update(a,2);near(teleport.phase,0);
  a.state='attack';near(gait.update(a,2.02).weight,0);
  a.state='idle';a.x=0;near(gait.update(a,0).weight,0);
});

test('both original costumes keep anatomical knees, fixed bone lengths and grounded soles',()=>{
  for(const type of ['player','boss'])for(const speed of [2.2,3.9,7.4]){
    const d=ART_VIEWS[type].side;
    for(let i=0;i<1000;i++){
      const gait=sampleGait(i/1000,speed),{legs,bind}=poseGaitLegs(d,gait);
      for(const [j,leg]of legs.entries()){
        near(distance(leg.hip,leg.knee),distance(bind.hip,bind.knee));
        near(distance(leg.knee,leg.ankle),distance(bind.knee,bind.ankle));
        const dx=leg.ankle[0]-leg.hip[0],dy=leg.ankle[1]-leg.hip[1];
        assert.ok(dx*(leg.knee[1]-leg.hip[1])-dy*(leg.knee[0]-leg.hip[0])>0,'knee bent backwards');
        const floor=[d.toe,d.heel,d.sole].map(p=>{
          const x=(d.sole[0]-p[0])/d.ppu,y=(d.sole[1]-p[1])/d.ppu;
          return leg.sole[1]+x*Math.sin(leg.angle)+y*Math.cos(leg.angle);
        });
        assert.ok(Math.min(...floor)>-1e-8,'boot below ground');
        if(gait.feet[j].contact)near(Math.min(...floor),0);
      }
    }
  }
});

test('the run cycle is continuous across toe-off, passing and touchdown',()=>{
  for(const speed of [2.2,3.9,7.4]){
    const duty=sampleGait(0,speed).duty;
    for(const phase of [0,duty,duty+(1-duty)*.32,duty+(1-duty)*.34,1]){
      const a=sampleGait(phase-.00001,speed),b=sampleGait(phase+.00001,speed);
      for(let i=0;i<2;i++){
        near(a.feet[i].x,b.feet[i].x,.001);near(a.feet[i].y,b.feet[i].y,.001);
        near(a.feet[i].angle,b.feet[i].angle,.001);
      }
    }
  }
});
