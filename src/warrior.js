import * as THREE from '../vendor/three.module.js';
import { MOVES } from './combat.js';

const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const lerp = (a,b,t) => a+(b-a)*t;
const ease = x => x*x*(3-2*x);
const TAU = Math.PI*2;
const rest = {hip:1.14,hx:0,lean:-.035,twist:0,rx:.35,ry:.25,lx:.02,ly:.18,
  blade:-1.95,fx:.25,fy:.105,bx:-.24,by:.105,head:0};
const pose = p => ({...rest,...p});
function blend(a,b,t) {const q={};for(const k in rest)q[k]=lerp(a[k],b[k],t);return q;}
function keys(frames,t) {
  for(let i=1;i<frames.length;i++)if(t<=frames[i][0]){
    const [ta,a]=frames[i-1],[tb,b]=frames[i];return blend(a,b,ease(clamp((t-ta)/(tb-ta),0,1)));
  }
  return frames.at(-1)[1];
}
const ready=pose();
const coil=pose({hip:1.05,lean:.13,twist:-.12,rx:-.25,ry:1.03,lx:.04,ly:.60,blade:1.50,fx:.36,bx:-.39});
const cut=pose({hip:.98,hx:.08,lean:-.28,twist:.14,rx:.64,ry:.47,lx:.16,ly:.42,blade:-1.52,fx:.69,bx:-.57});
const finish=pose({hip:1.01,hx:.10,lean:-.20,rx:.43,ry:.17,lx:-.17,ly:.43,blade:-2.32,fx:.60,bx:-.48});
const overhead=pose({hip:1.03,lean:.14,rx:.04,ry:1.35,lx:.00,ly:1.14,blade:.62,fx:.41,bx:-.44});
const heavy=pose({hip:.86,hx:.16,lean:-.42,rx:.49,ry:.17,lx:.31,ly:.36,blade:-2.18,fx:.76,bx:-.56});
const STANCES={
  slash1:[[0,ready],[.25,coil],[.48,cut],[.76,finish],[1,ready]],
  slash2:[[0,finish],[.23,pose({...finish,rx:.47,ry:.10,blade:-2.60,twist:.16})],
    [.5,pose({hip:1.05,lean:.10,rx:.15,ry:.99,lx:-.24,ly:.45,blade:.82,twist:-.2,fx:.46,bx:-.45})],
    [.77,coil],[1,ready]],
  slash3:[[0,ready],[.30,overhead],[.52,heavy],[.76,pose({...heavy,blade:-2.50,rx:.33,ry:.04})],[1,ready]],
  upper:[[0,ready],[.27,pose({...heavy,hip:.86,rx:.04,ry:.15,blade:-2.7})],
    [.52,pose({hip:1.15,lean:.18,rx:.43,ry:1.21,blade:-.44,lx:-.25,ly:.45,fx:.22,bx:-.26})],
    [.78,overhead],[1,ready]],
  air:[[0,pose({fx:.42,fy:.49,bx:-.4,by:.39,rx:-.23,ry:.98,blade:1.5})],
    [.25,pose({...coil,fx:.4,fy:.4,bx:-.3,by:.28})],
    [.54,pose({...cut,fx:.48,fy:.3,bx:-.45,by:.45})],[1,pose({...finish,fx:.2,fy:.5,bx:-.4,by:.3})]],
  dive:[[0,overhead],[.2,pose({...heavy,hip:1.06,rx:.3,ry:.4,blade:-2.9,fx:.19,bx:-.15})],
    [.72,pose({...heavy,hip:.79,blade:-2.6})],[1,ready]],
};

// Rings follow the volume of a clothed body. Each row is [height, depth, width, x offset].
function rings(rows,segments=20,fold=0) {
  const positions=[],uv=[],indices=[];
  for(let j=0;j<rows.length;j++){
    const [y,rx,rz,cx=0]=rows[j];
    for(let i=0;i<=segments;i++){
      const a=i/segments*TAU,wrinkle=1+fold*Math.sin(a*7+j*.55);
      positions.push(cx+Math.cos(a)*rx*wrinkle,y,Math.sin(a)*rz*wrinkle);uv.push(i/segments,j/(rows.length-1));
      if(j&&i){const k=j*(segments+1)+i;indices.push(k,k-1,k-segments-2,k,k-segments-2,k-segments-1);}
    }
  }
  if(rows.at(-1)[0]>rows[0][0])for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function strip(points,width=.015){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve,Math.max(8,points.length*3),width,5,false);
}
function patch(points){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));
  const indices=[];for(let i=1;i<points.length-1;i++)indices.push(0,i,i+1);g.setIndex(indices);g.computeVertexNormals();return g;
}
function ik(x,y,l1,l2,bend){
  const d=clamp(Math.hypot(x,y),.035,l1+l2-.006),theta=Math.atan2(x,-y);
  const a=theta+bend*Math.acos(clamp((d*d+l1*l1-l2*l2)/(2*d*l1),-1,1));
  return [a,Math.atan2(x-Math.sin(a)*l1,-(y+Math.cos(a)*l1))-a];
}

export class Warrior {
  constructor(type){
    this.type=type;this.root=new THREE.Group();this.body=new THREE.Group();this.torso=new THREE.Group();
    this.root.add(this.body);this.body.add(this.torso);this.materials=[];this.textures=[];this.geometries=new Set();
    this.gait=0;this.lastTime=null;this.q=null;
    const boss=type==='boss',hero=type==='player';
    const gradient=new THREE.DataTexture(new Uint8Array([72,149,220,255]),4,1,THREE.RedFormat);
    gradient.minFilter=gradient.magFilter=THREE.NearestFilter;gradient.needsUpdate=true;this.textures.push(gradient);
    const toon=(color,extra={})=>{const m=new THREE.MeshToonMaterial({color,gradientMap:gradient,...extra});this.materials.push(m);return m;};
    const flat=(color,extra={})=>{const m=new THREE.MeshBasicMaterial({color,...extra});this.materials.push(m);return m;};
    this.cloth=toon(boss?0xe3e1d4:hero?0x323b3e:0x566058);
    this.fold=toon(boss?0xb3bbb1:hero?0x485352:0x747b6c);
    this.dark=toon(0x1c2628);this.skin=toon(boss?0xc9c8b8:0xb5b7a7);this.hair=toon(0x182225);
    this.trim=toon(boss?0x556765:hero?0x87958c:0x8b917d);this.steel=toon(0xd7e1df);
    this.light=flat(0xe6eae0);this.edge=flat(0xf6f5eb);this.ink=flat(0x152123);this.leather=toon(0x35413e);
    this.outline=flat(0x111b1e,{side:THREE.BackSide});
    const add=(parent,g,m,outline=false)=>{
      this.geometries.add(g);const mesh=new THREE.Mesh(g,m);parent.add(mesh);
      if(outline){const o=new THREE.Mesh(g,this.outline);o.scale.setScalar(1.025);o.userData.noGhost=true;mesh.add(o);}
      return mesh;
    };
    this.add=add;
    const ellipsoid=(parent,x,y,z,sx,sy,sz,m,outline=false)=>{
      const mesh=add(parent,new THREE.SphereGeometry(1,16,12),m,outline);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);return mesh;
    };
    this.ellipsoid=ellipsoid;
    const tube=(parent,pts,r,m)=>add(parent,strip(pts,r),m);
    const chest=add(this.torso,rings([[0,.18,.205],[.12,.192,.22],[.27,.165,.23],[.43,.19,.265],
      [.59,.208,.277],[.68,.186,.238],[.76,.12,.14],[.79,.075,.082]],24,.025),this.cloth,true);
    // The wrap crosses the chest, whose front is +X, rather than drawing a flat vest over the camera.
    add(this.torso,patch([[.123,.76,-.10],[.201,.61,-.19],[.223,.40,.12],[.169,.25,.20],[.167,.45,.05]]),this.fold);
    add(this.torso,patch([[.139,.73,.11],[.205,.58,.18],[.208,.51,.09],[.129,.72,.045]]),this.dark);
    tube(this.torso,[[.12,.765,-.096],[.213,.58,-.1],[.215,.41,.09],[.172,.25,.19]],.014,this.trim);
    tube(this.torso,[[.12,.765,.096],[.204,.59,.15],[.216,.50,.07]],.012,this.trim);
    for(let i=0;i<3;i++)tube(this.torso,[[.186,.29+i*.105,-.07],[.204,.27+i*.105,.035],[.177,.21+i*.105,.19]],.007,this.fold);
    // A fitted sash joins the robe to the hips; the lower panels are independent cloth surfaces.
    add(this.body,rings([[-.055,.207,.225],[-.02,.213,.23],[.075,.207,.226],[.105,.19,.219]],24,.012),this.dark,true);
    for(let y=-.025;y<.075;y+=.025)add(this.body,rings([[y,.215,.234],[y+.012,.215,.234]],24),this.trim);
    ellipsoid(this.body,.214,.025,.12,.04,.056,.046,this.steel);
    const knot=new THREE.Group();knot.position.set(.09,0,.246);this.body.add(knot);
    ellipsoid(knot,0,0,0,.055,.06,.033,this.dark);
    tube(knot,[[0,-.01,0],[-.11,-.17,.02],[-.09,-.29,.025]],.012,this.trim);
    tube(knot,[[0,-.01,0],[.03,-.19,.02],[.09,-.32,.025]],.01,this.trim);
    this.cloths=[];
    const length=boss?1.01:hero?.89:.80;
    [[.18,2.30],[2.23,4.40],[4.32,6.11]].forEach(([from,to],i)=>{
      const rows=10,cols=10,p=new Float32Array((rows+1)*(cols+1)*3),idx=[];
      for(let j=0;j<rows;j++)for(let k=0;k<cols;k++){const n=j*(cols+1)+k;idx.push(n,n+cols+1,n+1,n+1,n+cols+1,n+cols+2);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(idx);
      const m=(i===1?this.fold:this.cloth).clone();m.side=THREE.DoubleSide;this.materials.push(m);
      const mesh=add(this.body,g,m);const lineIndices=[];
      for(let k=0;k<cols;k++)lineIndices.push(rows*(cols+1)+k,rows*(cols+1)+k+1);
      for(let k=2;k<cols;k+=3)for(let j=3;j<rows;j++)lineIndices.push(j*(cols+1)+k,(j+1)*(cols+1)+k);
      const seamGeometry=new THREE.BufferGeometry();seamGeometry.setAttribute('position',g.attributes.position);seamGeometry.setIndex(lineIndices);this.geometries.add(seamGeometry);
      const seamMaterial=new THREE.LineBasicMaterial({color:boss?0x929e94:0x66736c,transparent:true,opacity:.22});this.materials.push(seamMaterial);
      const seam=new THREE.LineSegments(seamGeometry,seamMaterial);this.body.add(seam);
      this.cloths.push({g,p,from,to,rows,cols,length:length*(i===1?1:.95),i});
    });
    // Legs have separate thigh, calf, ankle and boot volumes, with cloth gathers above the bindings.
    this.legs=[];
    for(const z of [-.135,.135]){
      const leg=new THREE.Group();leg.position.z=z;this.body.add(leg);
      add(leg,rings([[0,.125,.137],[-.12,.137,.145],[-.34,.114,.12],[-.54,.09,.097]],18,.045),this.dark,true);
      const knee=new THREE.Group();knee.position.y=-.57;leg.add(knee);
      ellipsoid(knee,0,0,0,.097,.11,.1,this.dark);
      add(knee,rings([[0,.095,.10],[-.14,.087,.09],[-.28,.068,.072],[-.54,.057,.065]],16,.025),this.dark,true);
      for(let j=0;j<5;j++){
        const y=-.15-j*.052,rx=lerp(.088,.067,j/4),rz=rx+ .005;
        const binding=add(knee,rings([[y,rx,rz],[y-.018,rx,rz]],16),this.fold);binding.rotation.z=-.09;
      }
      const foot=new THREE.Group();foot.position.y=-.54;knee.add(foot);
      ellipsoid(foot,.07,-.022,0,.165,.071,.087,this.dark,true);
      const sole=ellipsoid(foot,.076,-.06,0,.167,.025,.09,this.ink);
      tube(foot,[[-.06,.018,.069],[.05,.04,.079],[.18,-.005,.055]],.009,this.fold);
      this.legs.push({leg,knee,foot});
    }
    // A small, sculpted head and neck keep the silhouette close to adult human proportions.
    add(this.torso,rings([[.72,.07,.072],[.86,.074,.074],[.93,.082,.075]],16),this.skin);
    this.head=new THREE.Group();this.head.position.set(.012,.843,0);this.torso.add(this.head);
    add(this.head,rings([[0,.065,.062,.017],[.035,.095,.077,.018],[.09,.116,.099,.004],
      [.175,.119,.11,-.006],[.25,.108,.102,-.013],[.29,.075,.072,-.015],[.309,.009,.01,-.02]],24),this.skin,true);
    ellipsoid(this.head,.128,.134,0,.031,.032,.027,this.skin);
    ellipsoid(this.head,.122,.172,0,.018,.038,.023,this.skin);
    for(const s of [-1,1]){
      ellipsoid(this.head,-.045,.132,s*.103,.027,.047,.017,this.skin);
      ellipsoid(this.head,.089,.195,s*.090,.023,.009,.009,this.dark);
      ellipsoid(this.head,.104,.194,s*.081,.008,.009,.009,this.ink);
      tube(this.head,[[.071,.218,s*.101],[.117,.213,s*.070]],.009,this.hair);
      tube(this.head,[[.077,.219,s*.087],[.116,.211,s*.059]],.01,this.hair);
      tube(this.head,[[.099,.064,s*.034],[.117,.068,0]],.004,this.ink);
    }
    // A fitted hair cap with a swept fringe, tied crown and long articulated queue.
    const hairCap=add(this.head,rings([[.21,.118,.111,-.024],[.255,.116,.111,-.024],
      [.306,.086,.083,-.026],[.332,.035,.036,-.03],[.339,.004,.006,-.03]],24,.015),this.hair,true);
    ellipsoid(this.head,-.105,.164,0,.044,.106,.092,this.hair);
    for(const s of [-1,1]){
      tube(this.head,[[-.09,.26,s*.08],[-.01,.282,s*.104],[.091,.234,s*.071],[.113,.198,s*.049]],.019,this.hair);
      tube(this.head,[[-.085,.235,s*.1],[-.064,.154,s*.109],[-.087,.067,s*.098]],.013,this.hair);
    }
    ellipsoid(this.head,-.075,.353,0,.061,.066,.058,this.hair,true);
    add(this.head,rings([[.343,.059,.053,-.07],[.355,.059,.053,-.07]],18),this.trim);
    this.tail=new THREE.Group();this.tail.position.set(-.12,.27,-.03);this.head.add(this.tail);
    tube(this.tail,[[0,0,0],[-.09,-.07,0],[-.12,-.25,.02],[-.09,-.43,.015]],.026,this.hair);
    tube(this.tail,[[-.02,-.01,.026],[-.10,-.14,.028],[-.11,-.36,.038],[-.07,-.48,.02]],.012,this.hair);
    if(hero){
      // A face wrap gives the ink-clad wanderer a distinct, readable silhouette.
      add(this.head,rings([[.004,.073,.073,.018],[.046,.111,.102,.010],[.095,.125,.115,.004],[.119,.126,.112,.004]],24,.014),this.cloth);
      tube(this.head,[[.10,.115,.077],[.06,.083,.11],[-.035,.068,.11]],.007,this.fold);
      add(this.torso,rings([[.75,.093,.098],[.80,.107,.107],[.845,.09,.092]],20,.05),this.fold);
    }
    if(type==='blade'){
      const hat=new THREE.Group();hat.position.y=.265;this.head.add(hat);
      const cone=add(hat,new THREE.ConeGeometry(.43,.22,32,1,true),this.leather,true);cone.position.y=.055;
      const brim=add(hat,new THREE.TorusGeometry(.426,.013,5,40),this.trim);brim.rotation.x=Math.PI/2;brim.position.y=-.055;
      for(let i=0;i<18;i++){
        const a=i/18*TAU;tube(hat,[[0,.16,0],[Math.cos(a)*.425,-.055,Math.sin(a)*.425]],.003,this.trim);
      }
      this.tail.scale.setScalar(.6);
    }
    if(type==='spear'){
      add(this.head,rings([[.225,.136,.127],[.30,.123,.116],[.36,.08,.073],[.43,.012,.013]],20),this.leather,true);
      tube(this.head,[[-.12,.24,.126],[0,.28,.13],[.09,.25,.08]],.013,this.trim);this.tail.visible=false;
    }
    this.ribbons=[];
    for(let i=0;i<2;i++){
      const group=new THREE.Group();group.position.set(-.10,.785,-.08+i*.15);this.torso.add(group);
      const g=patch([[0,.025,0],[-.2,.012,.013],[-.47,-.1,0],[-.63,-.075,-.02],[-.50,-.17,0],[-.19,-.042,.013],[0,-.022,0]]);
      const material=this.trim.clone();material.side=THREE.DoubleSide;this.materials.push(material);add(group,g,material);
      this.ribbons.push(group);
    }
    // Upper sleeves are broad at the shoulder and gather into narrow wrapped forearms.
    this.arms=[];
    for(const z of [-.238,.238]){
      const upper=new THREE.Group();upper.position.set(0,.65,z);this.torso.add(upper);
      ellipsoid(upper,0,-.035,0,.115,.14,.117,this.cloth);
      add(upper,rings([[.015,.10,.115],[-.07,.128,.128],[-.23,.139,.133],[-.34,.105,.101],[-.40,.08,.079]],18,.06),this.cloth,true);
      const fore=new THREE.Group();fore.position.y=-.40;upper.add(fore);
      ellipsoid(fore,0,0,0,.077,.086,.078,this.fold);
      add(fore,rings([[0,.077,.075],[-.08,.073,.069],[-.29,.044,.048],[-.365,.044,.044]],16,.02),this.dark,true);
      for(let j=0;j<5;j++){
        const y=-.08-j*.043,r=lerp(.075,.055,j/4);
        const wrap=add(fore,rings([[y,r,r],[y-.016,r,r]],16),this.trim);wrap.rotation.z=.13;
      }
      const hand=new THREE.Group();hand.position.set(0,-.37,.002);fore.add(hand);
      ellipsoid(hand,0,-.016,0,.052,.073,.039,this.skin,true);
      for(let j=0;j<4;j++)ellipsoid(hand,.024,-.06+j*.025,.025,.035,.014,.027,this.skin);
      ellipsoid(hand,-.033,-.012,.025,.02,.037,.022,this.skin);
      this.arms.push({upper,fore,hand});
    }
    this.weapon=new THREE.Group();this.arms[1].hand.add(this.weapon);this.weapon.position.set(.035,-.016,.025);
    this.bladeGroup=new THREE.Group();this.weapon.add(this.bladeGroup);
    if(type==='spear'){
      const shaft=add(this.weapon,new THREE.CylinderGeometry(.021,.025,3.1,10),this.leather);shaft.position.y=.53;
      for(let i=0;i<4;i++){const band=add(this.weapon,new THREE.CylinderGeometry(.026,.026,.025,10),this.trim);band.position.y=1.7+i*.05;}
      add(this.bladeGroup,patch([[-.072,1.92,0],[0,2.33,.018],[.072,1.92,0],[0,1.84,.035]]),this.steel);
      this.weaponLength=2.33;
    }else{
      const grip=add(this.weapon,new THREE.CylinderGeometry(.034,.031,.26,10),this.dark);grip.position.y=-.075;
      for(let j=0;j<7;j++){
        const wrap=add(this.weapon,new THREE.TorusGeometry(.034,.006,4,10),this.trim);wrap.rotation.x=Math.PI/2;wrap.rotation.y=.32;wrap.position.y=-.19+j*.029;
      }
      const pommel=add(this.weapon,new THREE.SphereGeometry(1,12,6),this.steel);pommel.scale.set(.042,.025,.045);pommel.position.y=-.22;
      const guard=add(this.weapon,new THREE.SphereGeometry(1,16,8),this.leather,true);guard.position.y=.08;guard.scale.set(.106,.025,.064);
      const collar=add(this.weapon,new THREE.BoxGeometry(.065,.07,.041),this.steel);collar.position.y=.13;
      // A raised spine, a narrow bevel and a curved cutting edge catch the light separately.
      const bladeLength=boss?1.36:1.28;
      const g=new THREE.BufferGeometry(),p=[],idx=[];
      const sections=[[.15,-.031,.039],[bladeLength*.68,-.015,.042],[bladeLength,.025,.064],[bladeLength+.10,.055,.055]];
      for(const [y,left,right]of sections)p.push(left,y,0,(left+right)/2,y,.018,right,y,0,(left+right)/2,y,-.018);
      for(let j=0;j<3;j++)for(let k=0;k<4;k++){let a=j*4+k,b=j*4+(k+1)%4;idx.push(a,b,a+4,b,b+4,a+4);}
      g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();add(this.bladeGroup,g,this.steel);
      tube(this.bladeGroup,sections.map(([y,l,r])=>[r,y,.002]),.004,this.edge);
      this.weaponLength=bladeLength+.10;
      this.scabbard=new THREE.Group();this.scabbard.position.set(-.08,.02,-.25);this.scabbard.rotation.z=-1.04;this.body.add(this.scabbard);
      add(this.scabbard,rings([[.1,.043,.037],[-.1,.043,.037],[-.9,.041,.036],[-1.23,.025,.028],[-1.26,.006,.006]],12),this.dark,true);
      for(const y of [.085,-.11,-1.19])add(this.scabbard,rings([[y,.047,.041],[y-.04,.047,.041]],12),this.trim);
      tube(this.body,[[-.06,.055,-.233],[.06,-.03,-.25],[-.06,-.13,-.30]],.012,this.trim);
    }
    const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=64;
    const ctx=shadowCanvas.getContext('2d'),grad=ctx.createRadialGradient(64,32,4,64,32,57);
    grad.addColorStop(0,'rgba(17,28,27,.75)');grad.addColorStop(1,'rgba(17,28,27,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,64);
    const shadowTexture=new THREE.CanvasTexture(shadowCanvas);this.textures.push(shadowTexture);
    this.shadow=add(this.root,new THREE.PlaneGeometry(1.8,.82),flat(0x17211e,{map:shadowTexture,transparent:true,opacity:.45,depthWrite:false}));
    this.shadow.rotation.x=-Math.PI/2;this.shadow.userData.noGhost=true;
    this.tip=new THREE.Vector3();this.base=new THREE.Vector3();this.trail=[];
    this.trailPositions=new Float32Array(8*18);this.trailGeometry=new THREE.BufferGeometry();
    this.trailGeometry.setAttribute('position',new THREE.BufferAttribute(this.trailPositions,3));
    this.trailMesh=new THREE.Mesh(this.trailGeometry,flat(0xf1f0e4,{transparent:true,opacity:.66,side:THREE.DoubleSide,depthWrite:false}));
    this.trailMesh.frustumCulled=false;
  }
  gaitFoot(phase){
    const p=((phase%1)+1)%1;
    if(p<.52)return {x:.59-2.27*p,y:.105};
    const t=(p-.52)/.48;return {x:lerp(-.59,.59,ease(t)),y:.105+Math.sin(t*Math.PI)*.26};
  }
  update(a,time,dt){
    const delta=this.lastTime===null?dt:clamp(time-this.lastTime,0,.045);this.lastTime=time;
    const t=a.t,boss=a.type==='boss';let q=pose();
    if(a.state==='run'){
      this.gait+=Math.abs(a.vx)*delta/2.27;
      const f=this.gaitFoot(this.gait),b=this.gaitFoot(this.gait+.5);
      q=pose({hip:1.025+Math.cos(this.gait*TAU*2)*.025,lean:-.19,rx:-.14,ry:.16,blade:2.59,
        lx:.1+Math.sin(this.gait*TAU)*.30,ly:.34,fx:f.x,fy:f.y,bx:b.x,by:b.y,head:.04,twist:Math.sin(this.gait*TAU)*.04});
    }else if(a.state==='attack')q=keys(STANCES[a.move]||STANCES.slash1,clamp(t/(MOVES[a.move]?.duration||.34),0,1));
    else if(a.state==='dash')q=pose({hip:.87,hx:.08,lean:-.57,rx:-.21,ry:.11,lx:-.39,ly:.34,blade:2.6,fx:.67,bx:-.65,by:.15});
    else if(a.state==='jump')q=pose({hip:1.06,lean:-.12,rx:.31,ry:.36,lx:-.26,ly:.54,blade:-1.95,fx:.4,fy:.43,bx:-.38,by:.28});
    else if(a.state==='guard')q=pose({hip:1.025,lean:.055,rx:.48,ry:.60,lx:.38,ly:.45,blade:-.28,fx:.41,bx:-.39});
    else if(a.state==='hit')q=pose({hip:1.00,lean:.33,rx:.08,ry:.24,lx:-.32,ly:.60,blade:-2.2,fx:.52,bx:-.37});
    else if(a.state==='broken')q=pose({hip:.76,lean:-.47,rx:.22,ry:.06,lx:.24,ly:.2,blade:-2.8,fx:.5,bx:-.42,head:-.2});
    else if(a.state==='windup')q=boss&&a.phase>=2?
      pose({hip:1.01,lean:-.20,rx:-.10,ry:.13,lx:-.1,ly:.10,blade:2.05,fx:.41,bx:-.42}):
      a.type==='spear'?pose({hip:1.04,lean:.12,rx:-.14,ry:.43,lx:.38,ly:.49,blade:-1.6,fx:.40,bx:-.38}):overhead;
    else if(a.state==='enemyAttack')q=keys(STANCES.slash3,.30+clamp(t/(a.duration||.3),0,1)*.46);
    else if(a.state==='recover')q=blend(heavy,ready,ease(clamp(t/(a.duration||.5),0,1)));
    else if(a.state==='phase')q=pose({hip:1.12,rx:.05,ry:.19,lx:-.1,ly:.12,blade:2.05});
    else if(a.state==='execute')q=keys(STANCES.slash3,clamp(t/.62,0,1));
    else if(a.state==='ultimate')q=keys(STANCES.slash1,(t%.19)/.19);
    else if(a.state==='dead')q=pose({hip:.32,lean:1.30,rx:-.22,ry:.21,lx:-.2,ly:.37,blade:1.3,fx:.64,bx:-.26});
    else q.hip+=Math.sin(time*2)*.007;
    if(boss&&a.flash>0&&a.state!=='phase')q.lean+=Math.sin(a.flash/.12*Math.PI)*.1;
    if(a.type==='spear'){
      q.blade=-1.56;
      if(['run','idle'].includes(a.state)){q.rx=.04;q.ry=.37;q.lx=.48;q.ly=.41;}
      if(a.state==='enemyAttack')q=pose({hip:.94,lean:-.23,rx:.61,ry:.54,lx:.73,ly:.55,blade:-1.58,fx:.65,bx:-.54});
    }
    if(!this.q||delta===0&&this.lastState!==a.state)this.q=q;
    else if(delta>0)this.q=blend(this.q,q,Math.min(1,delta*(a.state==='attack'||a.state==='enemyAttack'?90:32)));
    q=this.q;this.lastState=a.state;
    const size=boss?1.09:1;this.root.position.set(a.x,a.y,boss?.02:0);this.root.scale.set(a.facing*size,size,size);
    this.root.rotation.y=-.48*a.facing;
    this.body.position.set(q.hx,q.hip,0);this.torso.rotation.set(0,q.twist,q.lean);
    this.head.rotation.z=q.head-q.lean*.32;this.head.rotation.y=-.08;
    for(let i=0;i<2;i++){
      const {leg,knee,foot}=this.legs[i],front=i===1;
      const [upper,lower]=ik((front?q.fx:q.bx)-q.hx,(front?q.fy:q.by)-q.hip,.57,.54,1);
      leg.rotation.z=upper;knee.rotation.z=lower;foot.rotation.z=-upper-lower;
      const arm=this.arms[i],x=front?q.rx:q.lx,y=front?q.ry:q.ly;
      const twoHands=a.state==='guard'||a.state==='phase'||(a.state==='attack'&&a.move==='slash3')||(a.state==='windup'&&boss&&a.phase>=2);
      const target=new THREE.Vector3(x,y,front?.248:twoHands?.218:-.22);
      const shoulder=arm.upper.position,dir=target.clone().sub(shoulder),distance=clamp(dir.length(),.025,.766);dir.normalize();
      target.copy(shoulder).addScaledVector(dir,distance);
      const bend=new THREE.Vector3(-1,-.20,front?.45:-.65);bend.addScaledVector(dir,-bend.dot(dir)).normalize();
      const along=(distance*distance+.4*.4-.37*.37)/(2*distance);
      const elbow=shoulder.clone().addScaledVector(dir,along).addScaledVector(bend,Math.sqrt(Math.max(0,.4*.4-along*along)));
      const down=new THREE.Vector3(0,-1,0);
      arm.upper.quaternion.setFromUnitVectors(down,elbow.clone().sub(shoulder).normalize());
      const lowerRotation=new THREE.Quaternion().setFromUnitVectors(down,target.clone().sub(elbow).normalize());
      arm.fore.quaternion.copy(arm.upper.quaternion).invert().multiply(lowerRotation);
    }
    this.orientWeapon(q.blade);
    this.bladeGroup.visible=!(boss&&a.phase>=2&&['windup','phase'].includes(a.state));
    // Cloth follows stride and acceleration; the split panels keep the legs readable.
    const motion=clamp(a.vx*a.facing*.085,-.8,1.6),swing=Math.sin(this.gait*TAU);
    for(const c of this.cloths){
      for(let j=0;j<=c.rows;j++)for(let k=0;k<=c.cols;k++){
        const v=j/c.rows,angle=lerp(c.from,c.to,k/c.cols),fold=Math.sin(angle*9+v*.6)*.014*v;
        const rx=.20+v*.16+fold,rz=.222+v*.105+fold;
        const footPush=Math.cos(angle)>0?Math.abs(swing)*.15*v*v:0;
        const flutter=Math.sin(time*9+angle*2+v*3)*(.012+Math.abs(motion)*.037)*v*v;
        const n=(j*(c.cols+1)+k)*3;
        c.p[n]=Math.cos(angle)*rx-motion*.34*v*v+flutter+footPush;
        c.p[n+1]=-.018-v*c.length+Math.pow(v,5)*(.04*Math.sin(angle*3)+Math.abs(motion)*.1)+Math.abs(swing)*v*.025;
        c.p[n+2]=Math.sin(angle)*rz+Math.sin(time*6+v*3+angle)*.012*v;
      }
      c.g.attributes.position.needsUpdate=true;c.g.computeVertexNormals();
    }
    this.tail.rotation.z=-motion*.36+Math.sin(time*4)*.045;
    this.ribbons.forEach((r,i)=>{r.rotation.z=-motion*.24+Math.sin(time*7+i)*(.025+Math.abs(motion)*.1);r.rotation.y=Math.sin(time*5+i)*.16;});
    this.shadow.position.y=-a.y/size+.018;this.shadow.scale.setScalar(1/(1+a.y*.15));this.shadow.material.opacity=.45/(1+a.y*.6);
    this.root.visible=a.state!=='dead'||a.deadTime<.22;
    if(a.invuln>0&&a.state==='hit')this.root.visible=Math.floor(time*22)%2===0;
    this.root.updateMatrixWorld(true);
    this.weapon.localToWorld(this.tip.set(0,this.weaponLength,.02));this.weapon.localToWorld(this.base.set(0,.14,.02));
    if(['run','dash'].includes(a.state)&&a.y<.01&&this.tip.y<.035&&a.type!=='spear'){
      const hilt=this.weapon.localToWorld(new THREE.Vector3());
      const angle=Math.acos(clamp((.035-hilt.y)/(this.weaponLength*size),-1,1));
      this.orientWeapon(angle);
      this.root.updateMatrixWorld(true);this.weapon.localToWorld(this.tip.set(0,this.weaponLength,.02));this.weapon.localToWorld(this.base.set(0,.14,.02));
    }
    const move=MOVES[a.move];
    const cutting=a.state==='ultimate'||a.state==='enemyAttack'||(a.state==='attack'&&move&&t>=move.active*.7&&t<=move.end+.03);
    this.trail.forEach(p=>p.life-=dt);this.trail=this.trail.filter(p=>p.life>0);
    if(cutting&&delta>0)this.trail.push({tip:this.tip.clone(),inner:this.tip.clone().lerp(this.base,.22),life:.12});
    if(this.trail.length>9)this.trail.shift();let offset=0;
    for(let i=1;i<this.trail.length;i++)for(const point of [this.trail[i-1].tip,this.trail[i-1].inner,this.trail[i].tip,this.trail[i].tip,this.trail[i-1].inner,this.trail[i].inner]){
      this.trailPositions[offset++]=point.x;this.trailPositions[offset++]=point.y;this.trailPositions[offset++]=point.z+.025;
    }
    this.trailGeometry.attributes.position.needsUpdate=true;this.trailGeometry.setDrawRange(0,offset/3);
    this.trailMesh.visible=this.root.visible&&this.trail.length>1;this.trailMesh.material.color.set(a.state==='ultimate'?0xa62622:0xf1f0e4);
  }
  orientWeapon(angle){
    const parentRotation=this.torso.quaternion.clone().multiply(this.arms[1].upper.quaternion).multiply(this.arms[1].fore.quaternion);
    this.weapon.quaternion.copy(parentRotation).invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),angle));
  }
  captureGhost(red=false){
    // Snapshot the actual posed silhouette into one mesh, including the sword and flowing robe.
    const vertices=[],v=new THREE.Vector3();this.root.updateMatrixWorld(true);
    this.root.traverse(o=>{
      if(!o.isMesh||o.userData.noGhost||!o.visible||o.parent===this.bladeGroup&&!this.bladeGroup.visible)return;
      const p=o.geometry.attributes.position,idx=o.geometry.index;
      for(let i=0;i<(idx?idx.count:p.count);i++){
        const n=idx?idx.getX(i):i;v.fromBufferAttribute(p,n).applyMatrix4(o.matrixWorld);vertices.push(v.x,v.y,v.z-.08);
      }
    });
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    return new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:red?0xa62622:0x182224,transparent:true,opacity:.17,depthWrite:false,side:THREE.DoubleSide}));
  }
  dispose(){
    this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.trailGeometry.dispose();
  }
}
