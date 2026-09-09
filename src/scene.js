import * as THREE from '../vendor/three.module.js';
import { Warrior } from './warrior.js';

const INK = 0x171f20, PAPER = 0xd9ddd2, WHITE = 0xf1f0e4, RED = 0xa62622;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a,b,t) => a+(b-a)*t;
let seed = 71;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const materialCache = new Map();
function mat(color, extra = {}) {
  if (Object.keys(extra).length) return new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, ...extra });
  if (!materialCache.has(color)) materialCache.set(color, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  return materialCache.get(color);
}
function polygon(points, color, depth = 0) {
  const s = new THREE.Shape(); points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y)); s.closePath();
  const g = depth ? new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false}) : new THREE.ShapeGeometry(s);
  return new THREE.Mesh(g, mat(color));
}
function box(w,h,d,color,x=0,y=0,z=0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color)); m.position.set(x,y,z); return m;
}
function texture(w,h,draw) {
  const c = document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}

export class InkScene {
  constructor(canvas) {
    this.canvas=canvas;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color(PAPER); this.scene.fog=new THREE.Fog(PAPER,13,54);
    this.camera=new THREE.OrthographicCamera(-10,10,5,-5,.1,120);
    this.cameraX=7; this.cameraY=2.55; this.time=0; this.shake=0; this.zoom=1; this.burst=0;
    this.actors=new Map(); this.effects=[]; this.bamboo=[]; this.scars=[]; this.dustClock=0;
    this.world=new THREE.Group(); this.scene.add(this.world);
    this.scene.add(new THREE.HemisphereLight(0xecf2ed,0x627169,.85));
    const key=new THREE.DirectionalLight(0xfff5df,1.6);key.position.set(-3,7,9);this.scene.add(key);
    const rim=new THREE.DirectionalLight(0xd3e5e3,.9);rim.position.set(3,4,-5);this.scene.add(rim);
    this.createWorld(); this.createWeather();
    this.resizeObserver=new ResizeObserver(()=>this.resize()); this.resizeObserver.observe(canvas);
    this.resize();
  }
  resize() {
    const w=this.canvas.clientWidth,h=this.canvas.clientHeight;
    this.renderer.setSize(w,h,false); this.aspect=w/h;
    this.camera.left=-4.5*this.aspect; this.camera.right=4.5*this.aspect;
    this.camera.top=4.5; this.camera.bottom=-4.5; this.camera.updateProjectionMatrix();
  }
  reset() {
    for(const a of this.actors.values()){this.scene.remove(a.root,a.trailMesh);a.dispose();}
    this.actors.clear(); this.effects.forEach(e=>this.removeEffect(e)); this.effects=[];
    this.scars.forEach(s=>{this.scene.remove(s);s.geometry.dispose();s.material.dispose();}); this.scars=[];
    this.bamboo.forEach(b=>{b.cut=false;b.fall=0;b.top.rotation.z=0;b.top.position.x=0;b.top.position.y=b.cutY;b.top.visible=true;});
    if(this.gate) this.gate.children.forEach(c=>{c.visible=true;c.rotation.z=0;});
    this.cameraX=7; this.shake=0;
  }
  createWorld() {
    const wash=texture(256,256,(ctx,w,h)=>{
      ctx.fillStyle='#dce0d5';ctx.fillRect(0,0,w,h);
      for(let i=0;i<4500;i++){let g=120+rand()*90;ctx.fillStyle=`rgba(${g},${g+5},${g},${rand()*.1})`;ctx.fillRect(rand()*w,rand()*h,rand()*8+.5,rand()*2+.2);}
    }); wash.wrapS=wash.wrapT=THREE.RepeatWrapping;wash.repeat.set(25,3);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,80),new THREE.MeshBasicMaterial({map:wash,color:0xa6afa4}));
    ground.rotation.x=-Math.PI/2;ground.position.set(43,-.055,-22);this.world.add(ground);
    const pathTex=texture(512,128,(ctx,w,h)=>{
      ctx.fillStyle='#aeb6ac';ctx.fillRect(0,0,w,h);
      for(let j=0;j<3;j++)for(let i=0;i<9;i++){
        const x=i*65+(j%2)*30,y=j*48;
        ctx.fillStyle=`rgba(219,223,211,${.2+rand()*.28})`;ctx.fillRect(x+3,y+3,59+rand()*2,39);
        ctx.strokeStyle='rgba(39,50,47,.14)';ctx.lineWidth=1;ctx.strokeRect(x+2,y+2,61,43);
        ctx.beginPath();ctx.moveTo(x+10,y+10);ctx.lineTo(x+30,y+14);ctx.lineTo(x+24,y+30);ctx.stroke();
      }
    });pathTex.wrapS=THREE.RepeatWrapping;pathTex.repeat.set(24,1);
    const path=new THREE.Mesh(new THREE.PlaneGeometry(115,3.7),new THREE.MeshBasicMaterial({map:pathTex}));
    path.rotation.x=-Math.PI/2;path.position.set(44,-.012,.4);this.world.add(path);
    // Repeated mountain washes use broad, imperfect ridgelines and sparse vertical ink strokes.
    for(let layer=0;layer<3;layer++) {
      const mountainTex=texture(2048,512,(ctx,w,h)=>{
        const ys=[]; for(let x=0;x<=w;x+=16) ys.push([x,160+Math.sin(x*.007+layer)*80+Math.sin(x*.018)*24+rand()*23]);
        ctx.beginPath();ctx.moveTo(0,h);ys.forEach(([x,y])=>ctx.lineTo(x,y));ctx.lineTo(w,h);ctx.closePath();
        const gradient=ctx.createLinearGradient(0,70,0,h);gradient.addColorStop(0,layer===0?'#84968b':'#a4b0a3');gradient.addColorStop(1,'#d8ddd1');ctx.fillStyle=gradient;ctx.fill();
        ctx.save();ctx.clip();
        for(let i=0;i<2500;i++){ctx.strokeStyle=`rgba(56,76,66,${rand()*.15})`;ctx.lineWidth=rand()*2;const x=rand()*w,y=rand()*h;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-rand()*10,y+rand()*60);ctx.stroke();}
        ctx.restore();
      });
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(100,19),new THREE.MeshBasicMaterial({map:mountainTex,transparent:true,depthWrite:false,fog:false,opacity:.35+layer*.14}));
      plane.position.set(40,-4.1+layer*.9,-42+layer*9);this.world.add(plane);
    }
    const moon=new THREE.Mesh(new THREE.CircleGeometry(1.38,64),mat(0xf2f1e5,{transparent:true,opacity:.75,fog:false,depthWrite:false}));
    moon.position.set(11,1.0,-35);this.world.add(moon);
    for(let i=0;i<155;i++) {
      const x=-8+rand()*109,z=-3.2-rand()*22,h=5+rand()*9;
      this.makeBamboo(x,z,h,z<-14?0x7f9185:z<-7?0x5c7367:0x344b42,false);
    }
    for(const x of [13.6,21.5,35.7,40.5,50.8,58.5,62]) this.makeBamboo(x,-.85,7+rand()*3,0x263e34,true);
    // Foreground bamboo frames the screen without concealing the fighting lane.
    for(const x of [-2,24,44,66,93]) this.makeBamboo(x,3.3,10,0x233a31,false);
    for(let i=0;i<78;i++) {
      const x=rand()*100,z=rand()>.5?-2.3-rand()*2:3.6+rand();
      const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.18+rand()*.35,0),mat(0x526359));
      rock.scale.set(1.6,.6,1);rock.position.set(x,.05,z);rock.rotation.set(rand(),rand(),rand());this.world.add(rock);
      if(i%2===0){const grass=new THREE.Group();grass.position.set(x,.02,z);for(let k=0;k<5;k++){const leaf=polygon([[0,0],[.10+rand()*.3,.45+rand()*.4],[.07,0]],0x4c6556);leaf.rotation.y=rand()*Math.PI;grass.add(leaf);}this.world.add(grass);}
    }
    const mistTex=texture(128,64,(ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(236,238,226,.7)');g.addColorStop(1,'rgba(236,238,226,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
    this.mists=[];
    for(let i=0;i<9;i++){const m=new THREE.Mesh(new THREE.PlaneGeometry(24,4),new THREE.MeshBasicMaterial({map:mistTex,transparent:true,opacity:.3,depthWrite:false}));m.position.set(i*13-5,1.4,-5-i%3*4);this.world.add(m);this.mists.push(m);}
    this.makeTemple();
  }
  makeBamboo(x,z,height,color,breakable) {
    const root=new THREE.Group();root.position.set(x,0,z);root.rotation.z=(rand()-.5)*.10;this.world.add(root);
    const cutY=1.1+rand()*.3, top=new THREE.Group();top.position.y=cutY;root.add(top);
    const radius=.065+rand()*.055;
    const cyl=(length,y,parent)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(radius*.85,radius,length,5),mat(color));m.position.y=y;parent.add(m);};
    cyl(cutY,cutY/2,root);cyl(height-cutY,(height-cutY)/2,top);
    for(let y=.3;y<height-cutY;y+=.85){top.add(box(radius*2.5,.042,radius*2.4,color===0x263e34?0x698476:color,0,y));}
    const leafColor=color;
    for(let j=0;j<4;j++) {
      const cluster=new THREE.Group(); cluster.position.y=height-cutY-1-j*.75;cluster.rotation.z=(j%2?1:-1)*(.45+rand()*.3);top.add(cluster);
      cluster.add(polygon([[0,0],[.025,.9],[0,1.7],[-.015,.4]],leafColor));
      for(let k=0;k<6;k++) {
        const leaf=polygon([[0,0],[.11,.30],[.08,.62],[0,.89],[-.065,.4]],leafColor);
        leaf.position.set(0,.2+k*.21,0);leaf.rotation.z=(k%2?1:-1)*(.7+rand()*.5);leaf.scale.setScalar(.6+rand()*.5);cluster.add(leaf);
      }
    }
    if(breakable)this.bamboo.push({root,top,x,cutY,cut:false,fall:0,direction:1});
  }
  makeTemple() {
    const temple=new THREE.Group();temple.position.set(79,0,-5);this.world.add(temple);
    temple.add(box(15,.35,7,0x77837a,0,.05,0));temple.add(box(13,.2,5,0x68766e,0,.3,0));
    for(const x of [-5.5,-2,2,5.5])temple.add(box(.23,5,.3,0x46574d,x,2.8,1));
    temple.add(box(12,.4,.5,0x45574b,0,5.25,1));
    const roof=polygon([[-7,4.7],[-5.5,5.2],[-4.7,6.7],[0,7.1],[4.7,6.7],[5.5,5.2],[7,4.7],[5.9,4.9],[0,5.3],[-5.9,4.9]],0x354c40,.8);temple.add(roof);
    for(let i=-6;i<=6;i++)temple.add(box(.028,.6,.03,0x8b9788,i,5.18,.86));
    temple.add(box(5.8,4,.25,0x8b998c,0,2.5,-.5));
    this.gate=new THREE.Group();this.gate.position.set(0,.45,1.2);temple.add(this.gate);
    for(const s of [-1,1]) {
      const door=new THREE.Group();door.position.set(s*1.0,0,0);this.gate.add(door);
      door.add(box(1.85,3.9,.16,0x45564a,0,1.95));
      for(let k=0;k<6;k++)door.add(box(.04,3.7,.03,0x6e7e6d,-.8+k*.31,1.95,.12));
      door.add(box(1.9,.13,.2,0x293f32,0,1.45,.12));door.add(box(.11,.11,.06,0xc1c6b4,-s*.6,1.8,.2));
    }
    for(const x of [-6.4,6.4]) {
      temple.add(box(.5,.7,.5,0x506559,x,.65,2));temple.add(box(.32,1.4,.32,0x738374,x,1.6,2));
      temple.add(box(.9,.12,.9,0x354e3b,x,2.35,2));
    }
  }
  createWeather() {
    this.rainCount=550; this.rainData=new Float32Array(this.rainCount*6); this.rainSeeds=[];
    for(let i=0;i<this.rainCount;i++)this.rainSeeds.push({x:rand()*32-16,y:rand()*15,z:rand()*15-9,speed:10+rand()*9});
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.rainData,3));
    this.rain=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xeef1e7,transparent:true,opacity:.29,depthWrite:false}));this.scene.add(this.rain);this.rain.frustumCulled=false;
    this.leafTexture=texture(32,32,(ctx)=>{ctx.fillStyle='#24392b';ctx.beginPath();ctx.moveTo(1,28);ctx.quadraticCurveTo(7,1,30,2);ctx.quadraticCurveTo(28,23,1,28);ctx.fill();});
    this.inkTexture=texture(64,64,(ctx)=>{
      ctx.fillStyle='#17231e';ctx.beginPath();for(let i=0;i<20;i++){let a=i/20*Math.PI*2,r=15+rand()*15;let x=32+Math.cos(a)*r,y=32+Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();
    });
  }
  actor(a) { if(!this.actors.has(a.id)){const w=new Warrior(a.type);this.actors.set(a.id,w);this.scene.add(w.root,w.trailMesh);}return this.actors.get(a.id); }
  ring(x,y,color=WHITE,radius=1.6) {
    const m=new THREE.Mesh(new THREE.RingGeometry(radius*.95,radius,64),mat(color,{transparent:true,opacity:.9,depthWrite:false}));
    m.position.set(x,y,1.2);this.scene.add(m);this.effects.push({mesh:m,life:.38,max:.38,kind:'ring'});
  }
  slash(x,y,face,move,red=false) {
    const points=[], segments=32, r=move==='slash3'?2.6:2.2;
    const tilt=move==='upper'?-1.25:move==='slash2'?.55:-.35;
    const positions=[];
    for(let i=0;i<=segments;i++) {
      const t=i/segments, a=-1.15+t*2.8+tilt;
      const width=Math.sin(t*Math.PI)*.25;
      points.push([Math.cos(a)*r*face,Math.sin(a)*r*.65,Math.cos(a)*(r-width)*face,Math.sin(a)*(r-width)*.65]);
    }
    for(let i=0;i<segments;i++){let a=points[i],b=points[i+1];positions.push(a[0],a[1],0,a[2],a[3],0,b[0],b[1],0,b[0],b[1],0,a[2],a[3],0,b[2],b[3],0);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const m=new THREE.Mesh(g,mat(red?RED:WHITE,{transparent:true,opacity:.95,depthWrite:false}));m.position.set(x,y,.65);this.scene.add(m);
    this.effects.push({mesh:m,life:.19,max:.19,kind:'slash'});
  }
  particles(x,y,n=15,{red=false,white=false,leaves=false,direction=0}={}) {
    for(let i=0;i<n;i++) {
      const size=leaves?.09+rand()*.11:.035+rand()*.12;
      const m=new THREE.Mesh(new THREE.PlaneGeometry(size*(white?3:1),size),mat(red?RED:white?WHITE:INK,{map:leaves?this.leafTexture:white?null:this.inkTexture,transparent:true,opacity:.9,depthWrite:false}));
      m.position.set(x,y,.4+rand()*.35);m.rotation.z=rand()*6.28;this.scene.add(m);
      const life=.3+rand()*(leaves?1.2:.5);
      this.effects.push({mesh:m,life,max:life,kind:'particle',vx:direction*3+(rand()-.5)*8,vy:rand()*6+1,spin:(rand()-.5)*12,gravity:leaves?3:12});
    }
  }
  scar(x,big=false) {
    const m=new THREE.Mesh(new THREE.PlaneGeometry(big?2.5:1.0,big?1.4:.65),mat(INK,{map:this.inkTexture,transparent:true,opacity:big?.48:.25,depthWrite:false}));
    m.rotation.x=-Math.PI/2;m.rotation.z=rand()*6;m.position.set(x,.013,.25);this.scene.add(m);this.scars.push(m);
    if(this.scars.length>90){const old=this.scars.shift();this.scene.remove(old);old.geometry.dispose();old.material.dispose();}
  }
  handle(event) {
    const {type,x=0,y=1}=event;
    if(type==='slash') {this.slash(x,y,event.facing,event.move);this.particles(x,.15,3,{leaves:true,direction:event.facing});}
    if(type==='enemySlash'){
      if(event.spear){
        const m=polygon([[.35,-.025],[3.8,0],[.35,.075]],WHITE);m.material=mat(WHITE,{transparent:true,opacity:.8,depthWrite:false});
        m.position.set(x,y,.5);m.scale.x=event.facing;this.scene.add(m);this.effects.push({mesh:m,life:.14,max:.14,kind:'slash'});
      }else this.slash(x,y,event.facing,'slash1');
    }
    if(type==='hit') {this.particles(x,y,event.heavy?24:13,{direction:event.direction});this.particles(x,y,7,{white:true,direction:event.direction});this.scar(x,event.heavy);if(event.heavy)this.shake=.12;}
    if(type==='kill'){this.particles(x,y,event.boss?60:32);this.scar(x,true);}
    if(type==='parry'){this.ring(x,y,WHITE,2.0);this.ring(x,y,INK,1.65);this.particles(x,y,32,{white:true});this.shake=.19;this.burst=.18;}
    if(type==='block')this.particles(x,y,12,{white:true});
    if(type==='hurt'){this.particles(x,y,17);this.shake=.16;}
    if(type==='break'){this.ring(x,y,WHITE,1.3);this.particles(x,y,18);}
    if(type==='execution'){this.particles(x,y,52);this.slash(x,y,1,'slash3');this.shake=.26;this.scar(x,true);}
    if(type==='ultimateSlash'){this.slash(x,y,event.facing,'slash3',true);this.particles(x,y,25,{red:true});this.shake=.12;}
    if(type==='dash') {this.particles(x,.2,12,{leaves:true,direction:-event.facing});}
    if(type==='land'||type==='footstep') {
      if(type==='land'){const ring=new THREE.Mesh(new THREE.RingGeometry(.6,.64,40),mat(WHITE,{transparent:true,opacity:.5,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(x,.022,.1);this.scene.add(ring);this.effects.push({mesh:ring,life:.5,max:.5,kind:'ring'});if(event.heavy){this.shake=.18;this.particles(x,.1,22,{leaves:true});}}
      else this.particles(x,.05,2,{white:true});
    }
    if(type==='phase'&&event.phase===3){this.particles(79,3,65,{direction:1});this.shake=.35;}
    if((type==='hit'&&event.heavy)||type==='execution'||type==='ultimateSlash') {
      for(const b of this.bamboo)if(!b.cut&&Math.abs(b.x-x)<3.3){b.cut=true;b.direction=event.direction||event.facing||1;this.particles(b.x,2,23,{leaves:true});}
    }
  }
  removeEffect(e){this.scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();}
  update(game,realDt) {
    const dt=Math.min(realDt,.04),paused=game.status==='paused';
    if(!paused)this.time+=dt;
    const activeDt=paused?0:dt;
    const p=game.player,playing=game.status==='playing';
    const cinematic=p.state==='execute';
    const halfWidth=4.5*this.aspect,lead=Math.min(2.1,halfWidth*.25),edge=Math.min(7,halfWidth);
    const target=game.status==='menu'?(this.aspect<1?10.6:8):clamp(p.x+p.facing*lead,edge,89-edge);
    this.cameraX=mix(this.cameraX,target,Math.min(1,dt*(cinematic?7:4)));
    this.zoom=mix(this.zoom,cinematic?1.17:1,dt*8);this.camera.zoom=this.zoom;this.camera.updateProjectionMatrix();
    this.shake=Math.max(0,this.shake-activeDt*.7);this.burst=Math.max(0,this.burst-activeDt);
    const sx=Math.sin(this.time*110)*this.shake,sy=Math.cos(this.time*83)*this.shake*.6;
    this.camera.position.set(this.cameraX+sx,4.70+sy,16);
    this.camera.lookAt(this.cameraX+sx,this.cameraY+sy,0);
    const actors=[p,...game.enemies];
    for(const a of actors) {
      const w=this.actor(a);w.update(a,game.status==='menu'?this.time:game.time,activeDt);
      if(playing&&['dash','ultimate'].includes(a.state)&&game.time-(w.lastGhostTime??-1)>(a.state==='dash'?.048:.078)){
        this.afterimage(w,a.state==='ultimate');w.lastGhostTime=game.time;
      }
    }
    const ids=new Set(actors.map(a=>a.id));for(const [id,w]of this.actors)if(!ids.has(id)){this.scene.remove(w.root,w.trailMesh);w.dispose();this.actors.delete(id);}
    for(const b of this.bamboo) {
      if(b.cut){b.fall=Math.min(1.8,b.fall+activeDt);b.top.rotation.z=-b.direction*b.fall*.65;b.top.position.y=b.cutY-Math.pow(b.fall,2)*.7;b.top.position.x=b.direction*b.fall*.25;}
      else b.top.rotation.z=Math.sin(this.time*.7+b.x)*.007;
    }
    if(game.gateBroken)this.gate.children.forEach((door,i)=>{door.rotation.z=mix(door.rotation.z,i?1.3:-1.3,activeDt*2);});
    for(let i=0;i<this.rainCount;i++) {
      const r=this.rainSeeds[i];if(!paused)r.y-=activeDt*r.speed*(game.slow>0?.3:1);if(r.y<-.5)r.y=12+rand()*2;
      const wind=game.gateBroken?.32:.10;
      const x=this.cameraX+r.x+r.y*wind,k=i*6;
      this.rainData[k]=x;this.rainData[k+1]=r.y;this.rainData[k+2]=r.z;
      this.rainData[k+3]=x-wind;this.rainData[k+4]=r.y-.45;this.rainData[k+5]=r.z;
    }
    this.rain.geometry.attributes.position.needsUpdate=true;
    this.dustClock+=activeDt;
    if(this.dustClock>.38){this.dustClock=0;this.particles(this.cameraX+(rand()-.5)*22,5+rand()*3,1,{leaves:true,direction:-1});}
    for(let i=this.effects.length-1;i>=0;i--) {
      const e=this.effects[i];e.life-=activeDt;if(e.life<=0){this.removeEffect(e);this.effects.splice(i,1);continue;}
      const t=1-e.life/e.max;e.mesh.material.opacity=(1-t)*(e.kind==='ghost'?.17:.85);
      if(e.kind==='ring')e.mesh.scale.setScalar(1+t*1.8);
      if(e.kind==='slash')e.mesh.scale.setScalar(1+t*.12);
      if(e.kind==='particle'){e.vy-=e.gravity*activeDt;e.mesh.position.x+=e.vx*activeDt;e.mesh.position.y+=e.vy*activeDt;e.mesh.rotation.z+=e.spin*activeDt;}
    }
    this.scene.background.set(p.state==='ultimate'?0xc7c8bd:PAPER);
    this.renderer.render(this.scene,this.camera);
  }
  afterimage(w,red=false) {
    const m=w.captureGhost(red);
    this.scene.add(m);this.effects.push({mesh:m,life:.22,max:.22,kind:'ghost'});
  }
  project(x,y,z=0) {
    const v=new THREE.Vector3(x,y,z).project(this.camera);
    return {x:(v.x*.5+.5)*this.canvas.clientWidth,y:(-.5*v.y+.5)*this.canvas.clientHeight};
  }
}
