import * as THREE from '../vendor/three.module.js';
import { Warrior } from './warrior.js';
import { InkWorld } from './ink-world.js';
import { InkPost } from './ink-post.js';

const INK=0x090f15,WHITE=0xe4edf0,RED=0xb92a24;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
let seed=93;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const material=(color,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false});
function texture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}

export class InkScene{
  constructor(canvas){
    this.canvas=canvas;this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.info.autoReset=false;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x2b3a44);this.scene.fog=new THREE.Fog(0x6d7a82,17,60);
    this.camera=new THREE.OrthographicCamera(-10,10,4.5,-4.5,.1,130);this.cameraX=7;this.cameraY=2.35;
    this.time=0;this.shake=0;this.zoom=1;this.kick=0;this.impactZoom=0;this.dustClock=0;
    this.actors=new Map();this.effects=[];this.scars=[];this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    this.scene.add(new THREE.HemisphereLight(0xc6d4df,0x142533,.7));
    const key=new THREE.DirectionalLight(0xdbe6e8,1.0);key.position.set(-3,7,8);this.scene.add(key);
    const rim=new THREE.DirectionalLight(0xecf5f4,3.6);rim.position.set(4,5,-7);this.scene.add(rim);
    this.environment=new InkWorld(this.scene);this.bamboo=this.environment.bamboo;this.gate=this.environment.gate;
    this.post=new InkPost(this.renderer);
    this.inkTexture=texture(128,128,(ctx,w,h)=>{
      ctx.fillStyle='white';ctx.beginPath();for(let i=0;i<64;i++){const a=i/64*Math.PI*2,r=25+rand()*22;const x=64+Math.cos(a)*r,y=64+Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();
      for(let i=0;i<28;i++){ctx.beginPath();ctx.ellipse(rand()*w,rand()*h,1+rand()*5,1+rand()*2,rand()*6,0,Math.PI*2);ctx.fill();}
    });
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  }
  resize(){
    const w=this.canvas.clientWidth,h=this.canvas.clientHeight;this.renderer.setSize(w,h,false);this.aspect=w/h;
    this.camera.left=-4.5*this.aspect;this.camera.right=4.5*this.aspect;this.camera.top=4.5;this.camera.bottom=-4.5;this.camera.updateProjectionMatrix();
    this.post.resize(Math.round(w*this.renderer.getPixelRatio()),Math.round(h*this.renderer.getPixelRatio()));
  }
  reset(){
    for(const a of this.actors.values()){this.scene.remove(a.root,a.trailMesh);a.dispose();}this.actors.clear();
    this.effects.forEach(e=>this.removeEffect(e));this.effects=[];
    this.scars.forEach(s=>{this.scene.remove(s);s.geometry.dispose();s.material.dispose();});this.scars=[];
    this.environment.reset();this.post.reset();this.cameraX=7;this.shake=0;this.kick=0;this.zoom=1;this.impactZoom=0;
  }
  actor(a){if(!this.actors.has(a.id)){const w=new Warrior(a.type);this.actors.set(a.id,w);this.scene.add(w.root,w.trailMesh);}return this.actors.get(a.id);}
  addEffect(mesh,life,kind,extra={}){this.scene.add(mesh);const effect={mesh,life,max:life,kind,opacity:mesh.material.opacity,...extra};this.effects.push(effect);return effect;}
  ring(x,y,radius=1.8,ground=false,heavy=false){
    const m=new THREE.Mesh(new THREE.RingGeometry(radius*.978,radius,96),material(WHITE,heavy?.75:.4));m.position.set(x,y,1.0);
    if(ground){m.rotation.x=-Math.PI/2;m.position.set(x,.028,.2);m.scale.y=.9;}
    this.addEffect(m,heavy?.52:.36,'ring',{ground});
    if(heavy){const outer=new THREE.Mesh(new THREE.RingGeometry(radius*.90,radius*.904,96),material(WHITE,.26));outer.position.copy(m.position);outer.rotation.copy(m.rotation);this.addEffect(outer,.55,'ring',{ground});}
  }
  slash(x,y,face,move,red=false){
    const r=move==='slash3'||move==='dive'?2.75:2.35,tilt=move==='upper'?-1.20:move==='slash2'?.58:-.3;
    for(let stroke=0;stroke<3;stroke++){
      const positions=[],segments=48,points=[];
      for(let i=0;i<=segments;i++){
        const t=i/segments,a=-1.12+t*2.62+tilt,width=Math.pow(Math.sin(t*Math.PI),1.5)*(stroke===0?.15:.035)*(1+rand()*.3);
        const radius=r-stroke*.12+(rand()-.5)*.023;
        points.push([Math.cos(a)*radius*face,Math.sin(a)*radius*.66,Math.cos(a)*(radius-width)*face,Math.sin(a)*(radius-width)*.66]);
      }
      for(let i=0;i<segments;i++){const a=points[i],b=points[i+1];positions.push(a[0],a[1],0,a[2],a[3],0,b[0],b[1],0,b[0],b[1],0,a[2],a[3],0,b[2],b[3],0);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      const mesh=new THREE.Mesh(g,material(red?RED:stroke===2?0x94b6c6:WHITE,stroke===0?.94:.36));mesh.position.set(x,y,.8+stroke*.012);
      this.addEffect(mesh,.115+stroke*.018,'slash');
    }
  }
  particles(x,y,n=15,{red=false,white=false,leaves=false,direction=0,heavy=false}={}){
    for(let i=0;i<n;i++){
      const angle=(rand()-.5)*Math.PI*1.55+(direction<0?Math.PI:0),speed=3+rand()*(heavy?14:8);
      const size=leaves?.07+rand()*.14:white?.009+rand()*.022:.05+rand()*.14;
      const g=new THREE.PlaneGeometry(white?.10+rand()*.30:size*(leaves?2.8:1.6),size);
      const m=new THREE.Mesh(g,material(red?RED:white?WHITE:leaves?0x8b9ca4:INK,white?.9:leaves?.65:.85));
      if(!white&&!leaves){m.material.map=this.inkTexture;m.material.needsUpdate=true;}
      m.position.set(x+(rand()-.5)*.14,y+(rand()-.5)*.12,.8+rand()*.8);m.rotation.z=angle;const life=white?.14+rand()*.22:leaves?.65+rand()*.6:.25+rand()*.45;
      this.addEffect(m,life,white?'spark':'particle',{vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed+(leaves?2:0),spin:(rand()-.5)*12,gravity:leaves?4:18});
    }
  }
  scar(x,big=false){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(big?2.9:1.1,big?1.5:.6),material(0x03090d,big?.8:.5));m.material.map=this.inkTexture;m.rotation.x=-Math.PI/2;m.rotation.z=rand()*6.28;m.position.set(x,.017,.2);this.scene.add(m);this.scars.push(m);
    if(this.scars.length>80){const old=this.scars.shift();this.scene.remove(old);old.geometry.dispose();old.material.dispose();}
  }
  impact(x,y,power,mode=1,direction=0){
    this.post.impact(x,y,power,mode);this.impactZoom=Math.max(this.impactZoom,power*.032);
    if(!this.reducedMotion.matches){this.shake=Math.max(this.shake,power*.095);this.kick=direction*power*.05;}
  }
  handle(event){
    const {type,x=0,y=1}=event;
    if(type==='slash'){this.slash(x,y,event.facing,event.move);this.particles(x,.08,4,{leaves:true,direction:event.facing});}
    if(type==='enemySlash'){
      if(event.spear){const m=new THREE.Mesh(new THREE.PlaneGeometry(3.6,.024),material(WHITE,.65));m.position.set(x+event.facing*1.8,y,.7);this.addEffect(m,.095,'slash');}
      else this.slash(x,y,event.facing,'slash1');
    }
    if(type==='hit'){
      this.particles(x,y,event.heavy?27:13,{heavy:event.heavy,direction:event.direction});this.particles(x,y,event.heavy?19:9,{white:true,heavy:event.heavy,direction:event.direction});this.scar(x,event.heavy);
      this.impact(x,y,event.heavy?1.0:.22,1,event.direction);if(event.heavy)this.ring(x,.025,1.1,true);
    }
    if(type==='kill'){this.particles(x,y,event.boss?60:32,{heavy:true});this.scar(x,true);}
    if(type==='parry'){
      this.ring(x,y,1.5,false,true);this.ring(x,.025,1.8,true,true);this.particles(x,y,40,{white:true,heavy:true});
      this.impact(x,y,1.35,2);this.environment.repel(x,y);
      for(const angle of [.30,-.65]){const line=new THREE.Mesh(new THREE.PlaneGeometry(4.6,.028),material(WHITE,.96));line.position.set(x,y,1.5);line.rotation.z=angle;this.addEffect(line,.13,'slash');}
    }
    if(type==='block')this.particles(x,y,15,{white:true});
    if(type==='hurt'){this.particles(x,y,17);this.impact(x,y,.9);}
    if(type==='break'){this.ring(x,y,.85,false,true);this.particles(x,y,19,{white:true});this.impact(x,y,.7);}
    if(type==='executeStart'){this.impactZoom=.15;}
    if(type==='execution'){this.particles(x,y,48,{heavy:true});this.slash(x,y,1,'slash3');this.impact(x,y,1.6,3);this.scar(x,true);}
    if(type==='ultimate'){this.impactZoom=.12;this.ring(x,y,1.5,false,true);}
    if(type==='ultimateSlash'){this.slash(x,y,event.facing,'slash3',true);this.particles(x,y,25,{red:true,heavy:true,direction:event.facing});this.impact(x,y,.85,1,event.facing);}
    if(type==='dash'){this.particles(x,.12,13,{leaves:true,direction:-event.facing});}
    if(type==='land'){
      this.ring(x,.025,event.heavy?1.45:.55,true,event.heavy);this.particles(x,.06,event.heavy?24:6,{white:true,heavy:event.heavy});if(event.heavy)this.impact(x,.3,1.1);
    }
    if(type==='footstep')this.particles(x,.04,2,{white:true});
    if(type==='phase'&&event.phase===3){this.particles(79,3,65,{heavy:true,direction:1});this.impact(x,y,1.8);}
    if(type==='hit'&&event.heavy||type==='execution'||type==='ultimateSlash'){
      for(const b of this.bamboo)if(!b.cut&&Math.abs(b.x-x)<3.3){b.cut=true;b.direction=event.direction||event.facing||1;this.particles(b.x,2,24,{leaves:true,heavy:true});}
    }
  }
  removeEffect(e){this.scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();}
  update(game,realDt){
    const dt=Math.min(realDt,.04),paused=game.status==='paused',activeDt=paused?0:dt,playing=game.status==='playing',menu=game.status==='menu';
    if(!paused)this.time+=dt;const p=game.player,halfWidth=4.5*this.aspect,lead=Math.min(2.0,halfWidth*.23),edge=Math.min(7,halfWidth);
    const target=menu?p.x-halfWidth*.44:clamp(p.x+p.facing*lead,edge,89-edge);
    this.cameraX=mix(this.cameraX,target,Math.min(1,dt*4.5));this.cameraY=mix(this.cameraY,menu?2.5:2.25+Math.min(.4,p.y*.2),dt*4);
    this.impactZoom*=Math.exp(-activeDt*8);const targetZoom=(menu?1.02:p.state==='execute'?1.27:1.10)+(this.reducedMotion.matches?0:this.impactZoom);
    this.zoom=mix(this.zoom,targetZoom,dt*12);this.camera.zoom=this.zoom;this.camera.updateProjectionMatrix();
    this.shake*=Math.exp(-activeDt*17);this.kick*=Math.exp(-activeDt*18);
    const sx=Math.sin(this.time*135)*this.shake+this.kick,sy=Math.cos(this.time*107)*this.shake*.42;
    this.camera.position.set(this.cameraX+sx,this.cameraY+2.15+sy,16);this.camera.lookAt(this.cameraX+sx,this.cameraY+sy,0);
    const actors=[p,...game.enemies];
    for(const a of actors){
      const w=this.actor(a);w.update(a,menu?this.time:game.time,activeDt);
      if(menu){w.root.scale.multiplyScalar(this.aspect<1?1.18:1.38);w.root.updateMatrixWorld(true);}
      if(playing&&['dash','ultimate'].includes(a.state)&&game.time-(w.lastGhostTime??-1)>(a.state==='dash'?.045:.075)){
        const m=w.captureGhost(a.state==='ultimate');m.material.color.set(a.state==='ultimate'?RED:0x9bb5c1);m.material.opacity=a.state==='ultimate'?.27:.16;
        this.addEffect(m,.20,'ghost');w.lastGhostTime=game.time;
      }
      if(playing&&a.type==='player'&&a.state==='run'&&w.tip.y<.10&&game.time-(w.lastDragSpark??0)>.09){this.particles(w.tip.x,.045,2,{white:true,direction:-a.facing});w.lastDragSpark=game.time;}
    }
    const ids=new Set(actors.map(a=>a.id));for(const[id,w]of this.actors)if(!ids.has(id)){this.scene.remove(w.root,w.trailMesh);w.dispose();this.actors.delete(id);}
    this.environment.update(this.time,activeDt,this.cameraX,game);
    this.dustClock+=activeDt;if(this.dustClock>.45){this.dustClock=0;this.particles(this.cameraX+(rand()-.5)*24,4+rand()*3,1,{leaves:true,direction:-1});}
    for(let i=this.effects.length-1;i>=0;i--){
      const e=this.effects[i];e.life-=activeDt;if(e.life<=0){this.removeEffect(e);this.effects.splice(i,1);continue;}
      const t=1-e.life/e.max;e.mesh.material.opacity=(1-t)*(1-t)*e.opacity;
      if(e.kind==='ring')e.mesh.scale.setScalar(.65+t*2.2);
      if(e.kind==='slash')e.mesh.scale.setScalar(1+t*.09);
      if(e.kind==='particle'||e.kind==='spark'){
        e.vy-=e.gravity*activeDt;e.mesh.position.x+=e.vx*activeDt;e.mesh.position.y+=e.vy*activeDt;
        if(e.kind==='spark'){e.mesh.rotation.z=Math.atan2(e.vy,e.vx);e.mesh.scale.x=1+t*.5;}else e.mesh.rotation.z+=e.spin*activeDt;
      }
    }
    this.renderer.info.reset();this.post.render(this.scene,this.camera,this.time,activeDt,p.state==='ultimate',this.reducedMotion.matches);
  }
  actorLabel(a){
    const w=this.actors.get(a.id);if(!w)return this.project(a.x,a.y+2.5);
    const top=w.head.localToWorld(new THREE.Vector3(0,.45,0));return this.project(top.x,top.y,top.z);
  }
  project(x,y,z=0){const v=new THREE.Vector3(x,y,z).project(this.camera);return{x:(v.x*.5+.5)*this.canvas.clientWidth,y:(-.5*v.y+.5)*this.canvas.clientHeight};}
}
