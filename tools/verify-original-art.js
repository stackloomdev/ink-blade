import * as THREE from '../vendor/three.module.js';
import {ArtWarrior} from '../src/art-warrior.js';
import {ART_VIEWS} from '../src/art-rig-data.js';
import {MOVES} from '../src/combat.js';

// Developer-only audit: renders the actual game class at one source pixel per output pixel.
// Only opaque interiors are compared; extracted edge coverage is deliberately not called exact.
export async function verifyOriginalArt(){
  const canvas=document.createElement('canvas'),renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,preserveDrawingBuffer:true});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setPixelRatio(1);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,20);camera.position.z=10;camera.layers.enable(1);
  const expected=document.createElement('canvas'),actual=document.createElement('canvas');
  const ec=expected.getContext('2d',{willReadFrequently:true}),ac=actual.getContext('2d',{willReadFrequently:true});
  const views=[],motion=[];
  try{
    for(const type of ['player','boss']){
      const warrior=new ArtWarrior(type);await warrior.ready;scene.add(warrior.root,warrior.trailMesh);
      for(const view of ['front','side','back']){
        const d=ART_VIEWS[type][view],[l,t,r,b]=d.bounds,w=r-l,h=b-t;
        warrior.setView(view);warrior.update({type,x:0,y:0,facing:-1,state:'reference',t:0},0,0);
        renderer.setSize(w,h,false);camera.left=(l-d.origin[0])/d.ppu;camera.right=(r-d.origin[0])/d.ppu;
        camera.top=(d.origin[1]-t)/d.ppu;camera.bottom=(d.origin[1]-b)/d.ppu;camera.updateProjectionMatrix();renderer.render(scene,camera);
        expected.width=actual.width=w;expected.height=actual.height=h;
        ec.drawImage(warrior.views.get(view).art.map.image,l,t,w,h,0,0,w,h);ac.drawImage(canvas,0,0);
        const source=ec.getImageData(0,0,w,h).data,render=ac.getImageData(0,0,w,h).data;
        let count=0,sum=0,max=0,overTwo=0;
        for(let i=0;i<render.length;i+=16){if(render[i+3]!==255)continue;count++;
          for(let c=0;c<3;c++){const error=Math.abs(source[i+c]-render[i+c]);sum+=error;max=Math.max(max,error);if(error>2)overTwo++;}
        }
        const result={type,view,file:d.file,pixels:count,meanChannelError:sum/(count*3),maxChannelError:max,channelsOverTwo:overTwo};
        result.pass=count>1000&&result.meanChannelError<.5&&overTwo===0;views.push(result);
      }
      warrior.setView('side');
      for(const state of ['idle','run','guard','dash','jump','hit','broken','windup','enemyAttack','execute','ultimate','dead','attack']){
        const moves=state==='attack'?Object.keys(MOVES):['slash1'];
        for(const move of moves){let finite=true,minTip=Infinity,maxTip=-Infinity;
          for(let frame=0;frame<12;frame++){
            const t=frame/11*(state==='attack'?MOVES[move].duration:.7);
            warrior.update({type,x:3,y:state==='jump'?.5:0,facing:frame%2?1:-1,state,move,t,phase:2,duration:.7},t,1/60);
            finite&&=[...warrior.tip,...warrior.base].every(Number.isFinite);
            for(const p of warrior.pieces)finite&&=p.g.attributes.position.array.every(Number.isFinite);
            minTip=Math.min(minTip,warrior.tip.x);maxTip=Math.max(maxTip,warrior.tip.x);
          }
          motion.push({type,state,move,finite,tipTravel:maxTip-minTip});
        }
      }
      scene.remove(warrior.root,warrior.trailMesh);warrior.dispose();
    }
  }finally{renderer.dispose();}
  return {pass:views.every(v=>v.pass)&&motion.every(m=>m.finite),views,motion,
    scope:'Source color and UV at native resolution, opaque interiors only. Motion geometry and both facings. Does not claim reference animation frames exist.'};
}
