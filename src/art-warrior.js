import * as THREE from '../vendor/three.module.js';
import {MOVES} from './combat.js';
import {ART_VIEWS, ART_WEAPONS} from './art-rig-data.js';
import {decodeCoverage} from './art-coverage.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const TAU=Math.PI*2;
const assets=new Map();
const sourceRoot=new URL('../assets/reference/turnarounds/',import.meta.url);
const coverageRoot=new URL('../assets/rig/coverage/',import.meta.url);

async function loadArt(file,maskFile=file) {
  const key=file===maskFile?file:file+'/'+maskFile;
  if(!assets.has(key))assets.set(key,(async()=>{
    const [map,response]=await Promise.all([
      file===maskFile?new THREE.TextureLoader().loadAsync(new URL(file+'.png',sourceRoot).href):loadArt(file).then(a=>a.map),
      fetch(new URL(maskFile+'.coverage',coverageRoot)),
    ]);
    if(!response.ok)throw new Error(`角色轮廓加载失败：${file}`);
    const {w,h,data}=decodeCoverage(await response.arrayBuffer());
    if(file===maskFile&&(w!==map.image.width||h!==map.image.height))throw new Error(`角色轮廓尺寸不匹配：${file}`);
    const coverage=new THREE.DataTexture(data,w,h,THREE.RedFormat);
    coverage.repeat.set(map.image.width/w,map.image.height/h);
    coverage.flipY=true;coverage.magFilter=THREE.LinearFilter;coverage.minFilter=THREE.LinearFilter;coverage.needsUpdate=true;
    map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
    return {map,coverage,w:map.image.width,h:map.image.height,file};
  })());
  return assets.get(key);
}

export async function preloadOriginalArt(){
  await Promise.all([...new Set(Object.values(ART_VIEWS).flatMap(views=>Object.values(views).map(d=>d.file)))].map(file=>loadArt(file)));
  await Promise.all(Object.values(ART_WEAPONS).map(d=>loadArt(d.file,d.coverage||d.file)));
}

// MeshBasicMaterial keeps the source color; no toon light or invented surface changes the face.
function artMaterial(art,{mask=true,ghost=false}={}) {
  const m=new THREE.MeshBasicMaterial({map:art.map,alphaMap:mask?art.coverage:null,
    side:THREE.DoubleSide,transparent:true,alphaTest:.018,depthWrite:false,depthTest:false,toneMapped:false,fog:false});
  m.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',
      '#ifdef USE_ALPHAMAP\n diffuseColor.a *= smoothstep(.30,.92,texture2D(alphaMap, vAlphaMapUv).r);\n #endif');
    if(ghost)shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
      '#ifdef USE_MAP\n diffuseColor.a *= texture2D(map,vMapUv).a;\n #endif');
  };
  m.customProgramCacheKey=()=>`source-art-${ghost?'silhouette':'rgb'}-v1`;
  return m;
}

function rectangle([x,y,r,b]){return [[x,y],[r,y],[r,b],[x,b]];}
function geometry(outer,holes,art,maxEdge=65){
  const contour=outer.map(p=>new THREE.Vector2(...p)),cuts=holes.map(h=>h.map(p=>new THREE.Vector2(...p)));
  const all=[...contour,...cuts.flat()],triangles=THREE.ShapeUtils.triangulateShape(contour,cuts),p=[],uv=[];
  function add(a,b,c,depth=0){
    const ab=a.distanceTo(b),bc=b.distanceTo(c),ca=c.distanceTo(a);
    if(Math.max(ab,bc,ca)>maxEdge&&depth<13){
      if(ab>=bc&&ab>=ca){const d=a.clone().add(b).multiplyScalar(.5);add(a,d,c,depth+1);add(d,b,c,depth+1);}
      else if(bc>=ca){const d=b.clone().add(c).multiplyScalar(.5);add(a,b,d,depth+1);add(a,d,c,depth+1);}
      else{const d=c.clone().add(a).multiplyScalar(.5);add(a,b,d,depth+1);add(d,b,c,depth+1);}
    }else for(const v of [a,b,c]){p.push(v.x,v.y,0);uv.push(v.x/art.w,1-v.y/art.h);}
  }
  for(const [a,b,c] of triangles)add(all[a],all[b],all[c]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.userData.bind=new Float32Array(p);return g;
}
function rotate(x,y,cx,cy,angle){const dx=x-cx,dy=y-cy,c=Math.cos(angle),s=Math.sin(angle);return [cx+dx*c-dy*s,cy+dx*s+dy*c];}
function transformPoint(point,from,to,angle){const [x,y]=rotate(...point,...from,angle);return [x+to[0]-from[0],y+to[1]-from[1]];}
function angleBetween(a,b){return Math.atan2(b[1]-a[1],b[0]-a[0]);}
function distance(a,b){return Math.hypot(b[0]-a[0],b[1]-a[1]);}
function solveArm(shoulder,target,l1,l2){
  const dx=target[0]-shoulder[0],dy=target[1]-shoulder[1],d=clamp(Math.hypot(dx,dy),1,l1+l2-.1);
  const dir=Math.atan2(dy,dx),a=dir-Math.acos(clamp((d*d+l1*l1-l2*l2)/(2*d*l1),-1,1));
  return [shoulder[0]+Math.cos(a)*l1,shoulder[1]+Math.sin(a)*l1];
}
const stance=(p={})=>({lean:0,drop:0,reach:0,lift:0,blade:-2.20,stride:0,knee:0,flow:0,...p});
function interpolate(a,b,t){return Object.fromEntries(Object.keys(a).map(k=>[k,mix(a[k],b[k],t)]));}
function sequence(frames,t){for(let i=1;i<frames.length;i++)if(t<=frames[i][0])return interpolate(frames[i-1][1],frames[i][1],smooth((t-frames[i-1][0])/(frames[i][0]-frames[i-1][0])));return frames.at(-1)[1];}
const idle=stance({reach:.06,lift:.04,blade:-2.17});
const coil=stance({lean:-.12,drop:.06,reach:.28,lift:.73,blade:2.40,stride:.35,flow:.35});
const strike=stance({lean:.23,drop:.11,reach:.65,lift:.20,blade:.12,stride:.65,flow:.8});
const settle=stance({lean:.13,drop:.09,reach:.45,lift:-.06,blade:-.62,stride:.48,flow:.45});
const overhead=stance({lean:-.08,drop:.04,reach:.02,lift:.85,blade:1.98,stride:.28,flow:.3});
const low=stance({lean:.35,drop:.25,reach:.48,lift:-.13,blade:-.78,stride:.66,flow:1});

export function artPose(a,time){
  const t=a.t||0;
  if(a.state==='reference'||a.state==='model')return stance();
  if(a.state==='run')return stance({lean:.28,drop:.08+Math.cos(time*TAU*5)*.025,
    reach:-.14,lift:.04+Math.sin(time*TAU*2.5)*.035,blade:-2.48,stride:Math.sin(time*TAU*2.5)*.60,knee:Math.cos(time*TAU*2.5),flow:.65});
  if(a.state==='attack'){
    const move=MOVES[a.move]||MOVES.slash1,active=move.active,end=move.duration;
    let a0=idle,a1=coil,a2=strike,a3=settle;
    if(a.move==='slash2'){a0=settle;a1=stance({...low,blade:-1.6});a2=stance({...strike,lift:.5,blade:.85});a3=overhead;}
    if(a.move==='slash3'||a.move==='dive'){a1=overhead;a2=stance({...low,blade:-.30});a3=low;}
    if(a.move==='upper'){a1=stance({...low,blade:-1.8});a2=stance({...strike,lean:.09,lift:.62,blade:.95});a3=overhead;}
    if(a.move==='air'){a1=coil;a2=strike;a3=settle;}
    const q=sequence([[0,a0],[active*.65,a1],[active,a2],[Math.max(active+.045,end*.58),a3],[end*.80,a3],[end,idle]],t);
    if(a.move==='air'||a.move==='dive')q.knee=.8;return q;
  }
  if(a.state==='guard')return stance({lean:-.05,drop:.05,reach:.43,lift:.39,blade:1.19,stride:.23,flow:.15});
  if(a.state==='dash')return stance({lean:.64,drop:.27,reach:-.1,lift:.10,blade:-2.61,stride:.77,knee:.2,flow:1});
  if(a.state==='jump')return stance({lean:.16,drop:.08,reach:.1,lift:.3,blade:-.8,stride:.36,knee:1,flow:.7});
  if(a.state==='hit')return stance({lean:-.27,drop:.05,reach:-.13,lift:.16,blade:-2.14,stride:.27,flow:.5});
  if(a.state==='broken')return stance({lean:.45,drop:.32,reach:.1,lift:-.1,blade:-1.25,stride:.4,flow:.1});
  if(a.state==='windup')return a.phase>=2?stance({lean:.19,drop:.1,reach:-.06,lift:.02,blade:-2.8,stride:.25}):overhead;
  if(a.state==='enemyAttack')return sequence([[0,strike],[.12,low],[a.duration||.35,settle]],t);
  if(a.state==='recover')return interpolate(settle,idle,smooth(t/(a.duration||.5)));
  if(a.state==='execute')return sequence([[0,idle],[.22,coil],[.34,strike],[.6,low],[.95,idle]],t);
  if(a.state==='ultimate')return sequence([[0,coil],[.07,strike],[.14,settle],[.19,coil]],t%.19);
  if(a.state==='dead')return stance({lean:1.4,drop:1.4,reach:.2,lift:0,blade:-1.3,stride:.5});
  if(a.type==='boss')return stance({reach:.09,lift:.12,blade:a.phase>=2?-2.6:-.8,flow:.04});
  return {...idle,flow:.02};
}

export class ArtWarrior {
  constructor(type='player'){
    this.type=type;this.isOriginalArt=true;this.root=new THREE.Group();this.body=new THREE.Group();this.root.add(this.body);
    this.root.name=type==='boss'?'WhiteSwordsman_OriginalArt':'Hero_OriginalArt';
    this.head=new THREE.Object3D();this.root.add(this.head);this.tip=new THREE.Vector3();this.base=new THREE.Vector3();
    this.pieces=[];this.views=new Map();this.materials=[];this.lastGhostTime=-1;this.view='side';this.loaded=false;this.disposed=false;
    this.trailGeometry=new THREE.BufferGeometry();this.trailGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(18*6*3),3));this.trailGeometry.setDrawRange(0,0);
    this.trailMesh=new THREE.Mesh(this.trailGeometry,new THREE.MeshBasicMaterial({color:0xf2ede1,transparent:true,opacity:.46,side:THREE.DoubleSide,depthWrite:false,depthTest:false}));
    this.trailMesh.visible=false;this.trailMesh.renderOrder=140;this.trail=[];
    this.ready=this.load();
  }
  async load(){
    const data=ART_VIEWS[this.type];
    // Load all original views once. Multiple enemies/restarts share immutable GPU artwork.
    const entries=await Promise.all(Object.entries(data).map(async([view,d])=>[view,d,await loadArt(d.file)]));
    const weapon=ART_WEAPONS[this.type],wa=await loadArt(weapon.file,weapon.coverage||weapon.file);
    if(this.disposed)return;
    for(const [view,d,art]of entries){
      const m=artMaterial(art);this.materials.push(m);
      const g=geometry(rectangle(d.bounds),[],art,view==='side'?90:180);
      const mesh=new THREE.Mesh(g,m);mesh.layers.set(1);mesh.renderOrder=101;mesh.frustumCulled=false;mesh.visible=false;this.body.add(mesh);
      this.views.set(view,{d,art,mesh});
    }
    const {d,art}=this.views.get('side'),m=this.views.get('side').mesh.material;
    const piece=(name,outline,holes=[],z=0)=>{
      const g=geometry(outline,holes,art,55),mesh=new THREE.Mesh(g,m);mesh.layers.set(1);mesh.frustumCulled=false;mesh.renderOrder=102+z;
      this.body.add(mesh);const p={name,mesh,g,bind:g.userData.bind};this.pieces.push(p);return p;
    };
    // The hidden arm/boot areas are genuinely removed from the torso mesh, so limbs can separate.
    piece('body',rectangle(d.bounds),[d.arm,d.bootHole],2);
    piece('farLeg',d.leg,[],0);piece('leg',d.leg,[],1);
    piece('arm',d.arm,[],5);
    // A small source-fabric underlap covers the area revealed when the forearm leaves the robe.
    const patchPoly=d.arm;
    const patch=piece('underlap',patchPoly,[],3);
    const puv=patch.g.attributes.uv;for(let i=0;i<puv.count;i++){
      const x=patch.bind[i*3],y=patch.bind[i*3+1];
      const center=this.type==='player'?mix(442,356,smooth((y-460)/290)):mix(363,318,smooth((y-340)/240));
      puv.setX(i,(center+(x-(this.type==='player'?450:377))*.25)/art.w);
    }
    const wm=artMaterial(wa);this.materials.push(wm);
    for(const name of ['blade','sheath','tassel']){
      const g=geometry(weapon[name],[],wa,120),mesh=new THREE.Mesh(g,wm);mesh.layers.set(1);mesh.frustumCulled=false;
      mesh.renderOrder=name==='sheath'?100:108;this.body.add(mesh);
      this.pieces.push({name,mesh,g,bind:g.userData.bind,weapon:true});
    }
    this.loaded=true;if(this.lastActor)this.update(this.lastActor,this.lastClock,0);
  }
  setView(view){this.view=view==='game'?'side':view;}
  localFromPixel(x,y,d){return [(x-d.origin[0])/d.ppu,(d.origin[1]-y)/d.ppu];}
  update(a,time,dt){
    this.lastActor={...a};this.lastClock=time;
    this.root.position.set(a.x,a.y||0,.45);this.root.rotation.set(0,0,0);this.root.scale.set(1,1,1);
    // Camera tilt is compensated by the scene; art remains in its original proportions.
    this.body.rotation.set(0,0,0);this.body.scale.set(this.view==='side'?-(a.facing||1):1,1,1);
    this.root.visible=!(a.state==='dead'&&(a.t||0)>.70);
    if(!this.loaded){this.head.position.set(0,2.75,0);return;}
    const reference=['reference','model'].includes(a.state)||this.view!=='side';
    for(const [v,{mesh}]of this.views)mesh.visible=reference&&v===this.view;
    for(const p of this.pieces)p.mesh.visible=!reference;
    const view=this.views.get(this.view)||this.views.get('side'),{d}=view;
    if(reference){
      const g=view.mesh.geometry,bind=g.userData.bind,p=g.attributes.position;
      for(let i=0;i<p.count;i++){const [x,y]=this.localFromPixel(bind[i*3],bind[i*3+1],d);p.setXYZ(i,x,y,0);}p.needsUpdate=true;
      this.head.position.set(0,2.65,0);this.trailMesh.visible=false;return;
    }
    const q=artPose(a,time),px=d.ppu;
    const hip=d.hip,lean=q.lean,drop=q.drop*px;
    const torso=(x,y)=>{const [rx,ry]=rotate(x,y,...hip,-lean);return [rx,ry+drop];};
    const shoulder=torso(...d.shoulder),wrist0=torso(...d.wrist);
    const wrist=[wrist0[0]-q.reach*px,wrist0[1]-q.lift*px];
    const armLength=distance(d.shoulder,d.elbow)+distance(d.elbow,d.wrist)-.2,reach=distance(shoulder,wrist);
    if(reach>armLength){wrist[0]=mix(shoulder[0],wrist[0],armLength/reach);wrist[1]=mix(shoulder[1],wrist[1],armLength/reach);}
    const elbow=solveArm(shoulder,wrist,distance(d.shoulder,d.elbow),distance(d.elbow,d.wrist));
    const upperA=angleBetween(shoulder,elbow)-angleBetween(d.shoulder,d.elbow);
    const lowerA=angleBetween(elbow,wrist)-angleBetween(d.elbow,d.wrist);
    const palm=transformPoint([d.wrist[0]-7/500*px,d.wrist[1]+25/500*px],d.elbow,elbow,lowerA);
    const legOrigin=[d.knee[0],d.hip[1]+90/500*px];
    const legDeform=(x,y,far=false)=>{
      const phase=far?-1:1,angle=q.stride*phase,bend=q.knee*(far?-1:1);
      let [rx,ry]=rotate(x,y,...legOrigin,angle);
      if(y>d.knee[1]){
        const knee=rotate(...d.knee,...legOrigin,angle);
        [rx,ry]=rotate(rx,ry,...knee,Math.max(0,bend)*.85);
      }
      return [rx+(far?30/500*px:0),ry+drop-Math.abs(q.stride)*.05*px-Math.max(0,bend)*.06*px];
    };
    const bodyDeform=(x,y)=>{
      if(y<hip[1]){
        let [rx,ry]=torso(x,y);
        // Long hair has delayed motion, while the head and face move rigidly with the torso.
        if(x>d.shoulder[0]+75/500*px&&y>d.neck[1]){
          const w=smooth((x-d.shoulder[0]-75/500*px)/(190/500*px))*(1-smooth((y-hip[1]+.32*px)/(.32*px)));
          rx+=(q.flow*.28+Math.sin(time*3.6+y*.014)*.012)*px*w;
          ry-=q.flow*.08*px*w;
        }
        return [rx,ry];
      }
      const t=smooth((y-hip[1])/(d.origin[1]-hip[1]));
      const flow=(q.flow*.48+Math.sin(time*4.1+y*.013)*(.009+q.flow*.025))*t;
      const [rx,ry]=rotate(x,y,...hip,-lean*(1-t));
      return [rx+flow*px, ry+drop*(1-t*.75)-q.flow*px*.18*t];
    };
    const weapon=ART_WEAPONS[this.type];
    // Angles are expressed toward the opponent; source side art faces left.
    const localBladeAngle=Math.PI+q.blade;
    const sourceBladeAngle=angleBetween(weapon.pivot,weapon.tip);
    const weaponScale=d.ppu/weapon.ppu;
    this.pieces.forEach(p=>{
      const pos=p.g.attributes.position,bind=p.bind;
      for(let i=0;i<pos.count;i++){
        let x=bind[i*3],y=bind[i*3+1],out;
        if(p.weapon){
          const pivot=p.name==='sheath'?weapon.sheathPivot:weapon.pivot;
          const anchor=p.name==='sheath'?torso(hip[0]+.02*px,hip[1]-.22*px):palm;
          const angle=p.name==='sheath'?.33-sourceBladeAngle:localBladeAngle-sourceBladeAngle;
          const c=Math.cos(angle),s=Math.sin(angle),dx=(x-pivot[0])*weaponScale,dy=(y-pivot[1])*weaponScale;
          out=[anchor[0]+dx*c-dy*s,anchor[1]+dx*s+dy*c];
          if(p.name==='tassel'){out[0]+=Math.sin(time*9+y*.025)*.015*px;}
        }else if(p.name==='arm'){
          const up=transformPoint([x,y],d.shoulder,shoulder,upperA),low=transformPoint([x,y],d.elbow,elbow,lowerA);
          const blend=smooth((y-d.elbow[1]+35/500*px)/(65/500*px));out=[mix(up[0],low[0],blend),mix(up[1],low[1],blend)];
          // Curl the source fingers toward the palm when holding the blade.
          if(y>d.wrist[1]+28/500*px){
            const curl=smooth((y-d.wrist[1]-28/500*px)/(70/500*px));
            out[0]=mix(out[0],palm[0]+(x-d.wrist[0])*.45,curl*.65);
            out[1]=mix(out[1],palm[1],curl*.58);
          }
        }else if(p.name==='leg'||p.name==='farLeg')out=legDeform(x,y,p.name==='farLeg');
        else out=bodyDeform(x,y);
        const local=this.localFromPixel(...out,d);pos.setXYZ(i,...local,0);
      }
      pos.needsUpdate=true;
    });
    if(!(a.y>0)&&a.state!=='jump'){
      const footY=d.origin[1]-5/500*px,footX=d.ankle[0];
      const contacts=[false,true].flatMap(far=>[footX,footX-.24*px].map(x=>legDeform(x,footY,far)[1]));
      this.root.position.y=(Math.max(...contacts)-d.origin[1])/px;
    }
    const h=torso(d.neck[0],d.neck[1]-100/500*px),hl=this.localFromPixel(...h,d);
    this.head.position.set(hl[0]*this.body.scale.x,hl[1],0);
    this.root.updateMatrixWorld(true);
    const grip=this.localFromPixel(...palm,d),tipPx=[palm[0]+Math.cos(localBladeAngle)*distance(weapon.pivot,weapon.tip)*weaponScale,palm[1]+Math.sin(localBladeAngle)*distance(weapon.pivot,weapon.tip)*weaponScale];
    const tip=this.localFromPixel(...tipPx,d);
    this.base.copy(this.body.localToWorld(new THREE.Vector3(...grip,0)));
    this.tip.copy(this.body.localToWorld(new THREE.Vector3(...tip,0)));
    this.updateTrail(a,dt);
  }
  updateTrail(a,dt){
    const move=MOVES[a.move],cutting=a.state==='ultimate'||a.state==='enemyAttack'||a.state==='attack'&&a.t>=move?.active*.70&&a.t<=move?.end+.035;
    if(!cutting){this.trail.length=0;this.trailMesh.visible=false;return;}
    if(dt>0){this.trail.push({base:this.base.clone(),tip:this.tip.clone()});if(this.trail.length>6)this.trail.shift();}
    const p=this.trailGeometry.attributes.position;let n=0;
    for(let i=1;i<this.trail.length;i++){
      const a=this.trail[i-1],b=this.trail[i];
      const ai=a.tip.clone().lerp(a.base,.16),bi=b.tip.clone().lerp(b.base,.16);
      for(const v of [a.tip,ai,b.tip,b.tip,ai,bi])p.setXYZ(n++,v.x,v.y,v.z+.04);
    }
    p.needsUpdate=true;this.trailGeometry.setDrawRange(0,n);this.trailMesh.visible=n>0;
    this.trailMesh.material.color.set(a.state==='ultimate'?0xc03126:0xefe8d9);
  }
  captureGhost(){
    // Capture the posed, alpha-masked original body. A mask prevents rectangular dash ghosts.
    const art=this.views.get('side').art,positions=[],uv=[];this.root.updateMatrixWorld(true);
    for(const p of this.pieces.filter(p=>!p.weapon&&p.name!=='underlap')){
      const v=p.g.attributes.position,u=p.g.attributes.uv;
      for(let i=0;i<v.count;i++){const point=new THREE.Vector3().fromBufferAttribute(v,i).applyMatrix4(p.mesh.matrixWorld);positions.push(...point);uv.push(u.getX(i),u.getY(i));}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const mesh=new THREE.Mesh(g,artMaterial(art,{ghost:true}));mesh.layers.set(1);mesh.renderOrder=95;mesh.frustumCulled=false;return mesh;
  }
  dispose(){this.disposed=true;this.body.traverse(o=>o.geometry?.dispose());this.materials.forEach(m=>m.dispose());this.trailGeometry.dispose();this.trailMesh.material.dispose();}
}
