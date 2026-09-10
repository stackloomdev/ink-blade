// Real page input only. This exercises the renderer's distance tracker, including
// starting, settling, immediate reversals and pausing mid-stride.
export async function checkLocomotion(){
  const held=new Set(),frames=[];
  const key=(code,down)=>{window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));down?held.add(code):held.delete(code);};
  const tap=code=>{key(code,true);key(code,false);};
  const record=()=>{
    const g=window.inkBlade,a=window.inkArt.actors.find(a=>a.type==='player');
    frames.push({x:g.x,facing:g.facing,state:g.state,status:g.status,elapsed:g.elapsed,gait:a?.gait});
  };
  const wait=ms=>new Promise(resolve=>{const end=performance.now()+ms;function frame(){record();performance.now()>=end?resolve():requestAnimationFrame(frame);}requestAnimationFrame(frame);});
  try{
    key('KeyD',true);await wait(360);key('KeyD',false);await wait(250);
    key('KeyA',true);await wait(600);key('KeyA',false);await wait(250);
    key('KeyD',true);await wait(300);key('KeyD',false);key('KeyA',true);await wait(280);key('KeyA',false);
    key('KeyD',true);await wait(250);tap('KeyP');key('KeyD',false);await wait(500);tap('KeyP');await wait(300);
    key('KeyA',true);await wait(220);key('KeyA',false);tap('KeyJ');await wait(550);
  }finally{for(const code of [...held])key(code,false);}
  let maxPlantedDrift=0,plantedChecks=0;
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1],b=frames[i];
    if(a.state!=='run'||b.state!=='run'||a.facing!==b.facing||a.gait?.weight<.99||b.gait?.weight<.99)continue;
    for(let foot=0;foot<2;foot++)if(a.gait.feet[foot].contact&&b.gait.feet[foot].contact){
      maxPlantedDrift=Math.max(maxPlantedDrift,Math.abs(a.gait.feet[foot].x-b.gait.feet[foot].x));plantedChecks++;
    }
  }
  const paused=frames.filter(f=>f.status==='paused'),anchor=paused[0];
  const pauseStable=paused.length>10&&paused.every(f=>f.x===anchor.x&&f.gait.phase===anchor.gait.phase);
  return {pass:plantedChecks>20&&maxPlantedDrift<1e-7&&pauseStable,plantedChecks,maxPlantedDrift,pauseStable,
    states:[...new Set(frames.map(f=>f.state))],facings:[...new Set(frames.map(f=>f.facing))],frames};
}
