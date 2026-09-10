// Development-only acceptance test. Sends ordinary keyboard events; never edits game state.
export function runPlaythrough(maxMs=95000){
  return new Promise(resolve=>{
    const held=new Set(),states=new Set(),moves=new Set(),phases=new Set(),frameTimes=[];
    const started=performance.now();let frame=0,last=started,lastAttack=-20,bestCombo=0,maxCalls=0,maxTriangles=0;
    const hold=(code,on)=>{if(on&&!held.has(code)){held.add(code);window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));}else if(!on&&held.has(code)){held.delete(code);window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));}};
    const tap=code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));};
    function step(now){
      const g=window.inkBlade;if(!g)return resolve({error:'Game diagnostics unavailable'});
      frameTimes.push(now-last);last=now;frame++;states.add(g.state);if(g.move)moves.add(g.move);bestCombo=Math.max(bestCombo,g.combo);
      maxCalls=Math.max(maxCalls,g.render.calls);maxTriangles=Math.max(maxTriangles,g.render.triangles);
      for(const e of g.enemies)if(e.type==='boss')phases.add(e.phase);
      if(g.status!=='playing'||now-started>maxMs){
        for(const code of [...held])hold(code,false);
        const sorted=frameTimes.slice().sort((a,b)=>a-b);
        resolve({status:g.status,hp:g.hp,elapsed:g.elapsed,parries:g.parries,bestCombo,frames:frame,states:[...states],moves:[...moves],phases:[...phases],
          medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxCalls,maxTriangles,art:window.inkArt});return;
      }
      const enemy=g.enemies.filter(e=>e.hp>0).sort((a,b)=>Math.abs(a.x-g.x)-Math.abs(b.x-g.x))[0];
      const dx=enemy?enemy.x-g.x:1,dist=Math.abs(dx),face=Math.sign(dx)||g.facing;
      let movement=!enemy?1:dist>1.7||face!==g.facing?face:0;
      const danger=enemy&&dist<(enemy.type==='spear'?3.45:2.7)&&((enemy.state==='windup'&&enemy.duration-enemy.t<.085)||enemy.state==='enemyAttack');
      if(danger){movement=face!==g.facing?face:0;hold('KeyK',true);}
      else{
        hold('KeyK',false);
        if(enemy?.state==='broken'&&dist<3)tap('KeyL');
        if(g.ink>=100&&dist<7)tap('KeyQ');
        if(enemy&&enemy.state!=='windup'&&dist<2.6&&frame-lastAttack>=9){tap('KeyJ');lastAttack=frame;}
      }
      hold('KeyD',movement>0);hold('KeyA',movement<0);
      if(frame===8)tap('Space');if(frame===18)tap('KeyJ');
      if(frame===36){hold('KeyS',true);tap('KeyJ');hold('KeyS',false);}
      if(frame===80)tap('ShiftLeft');if(frame===130){hold('KeyW',true);tap('KeyJ');hold('KeyW',false);}
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}
