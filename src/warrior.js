import * as THREE from '../vendor/three.module.js';
import { MOVES } from './combat.js';
import { ReferenceArt } from './reference-art.js';
import { buildReferenceWeapons } from './reference-weapons.js';

const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const lerp = (a,b,t) => a+(b-a)*t;
const ease = x => x*x*(3-2*x);
const TAU = Math.PI*2;
const rest = {hip:1.065,hx:.035,lean:-.12,twist:-.025,rx:.29,ry:.23,lx:-.09,ly:.15,
  blade:-2.17,fx:.44,fy:.105,bx:-.34,by:.105,head:.025};
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
// The impact pose lands on the same simulation frame as the move's active window.
const STANCES={
  slash1:[[0,ready],[.20,coil],[.295,cut],[.54,finish],[.77,finish],[1,ready]],
  slash2:[[0,finish],[.16,pose({...finish,rx:.42,ry:.07,blade:-2.7,twist:.15})],
    [.278,pose({hip:.99,lean:-.24,rx:.65,ry:.58,lx:-.28,ly:.42,blade:-1.32,twist:-.16,fx:.68,bx:-.47})],
    [.55,pose({hip:1.05,lean:.11,rx:.30,ry:1.04,blade:-.64,lx:-.15,ly:.37,fx:.42,bx:-.43})],[1,ready]],
  slash3:[[0,ready],[.235,overhead],
    [.315,pose({hip:.94,hx:.14,lean:-.35,rx:.63,ry:.43,lx:.30,ly:.44,blade:-1.72,fx:.74,bx:-.53})],
    [.49,heavy],[.64,pose({...heavy,blade:-2.36,rx:.42,ry:.13})],[.80,finish],[1,ready]],
  upper:[[0,ready],[.20,pose({...heavy,hip:.80,rx:.09,ry:.12,blade:-2.65})],
    [.305,pose({hip:.89,lean:-.12,rx:.61,ry:.46,blade:-1.1,lx:-.29,ly:.47,fx:.57,bx:-.48})],
    [.48,overhead],[.75,overhead],[1,ready]],
  air:[[0,pose({...coil,fx:.42,fy:.44,bx:-.34,by:.3})],
    [.15,pose({...coil,fx:.40,fy:.43,bx:-.4,by:.37})],
    [.26,pose({...cut,fx:.48,fy:.32,bx:-.45,by:.43})],
    [.65,pose({...finish,fx:.3,fy:.38,bx:-.4,by:.40})],[1,pose({...finish,fx:.2,fy:.5,bx:-.4,by:.3})]],
  dive:[[0,overhead],[.15,pose({...heavy,hip:1.0,rx:.34,ry:.40,blade:-2.89,fx:.19,bx:-.15})],
    [.66,pose({...heavy,hip:.79,blade:-2.6})],[1,ready]],
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
    const boss=type==='boss',hero=type==='player',detailed=hero||boss;
    const gradient=new THREE.DataTexture(new Uint8Array(detailed?[105,159,213,255]:[32,76,205,255]),4,1,THREE.RedFormat);
    gradient.minFilter=gradient.magFilter=THREE.NearestFilter;gradient.needsUpdate=true;this.textures.push(gradient);
    const toon=(color,extra={})=>{const m=new THREE.MeshToonMaterial({color,gradientMap:gradient,...extra});this.materials.push(m);return m;};
    const flat=(color,extra={})=>{const m=new THREE.MeshBasicMaterial({color,...extra});this.materials.push(m);return m;};
    this.art=detailed?new ReferenceArt(type,gradient,this):null;
    this.ready=this.art?.ready||Promise.resolve();
    this.root.name=hero?'Moblade_Hero':`Warrior_${type}`;
    this.body.name='hips';this.torso.name='chest';
    this.cloth=toon(boss?0xc4ccd0:hero?0x171a1f:0x303d46);
    this.fold=toon(boss?0x73858f:hero?0x273742:0x4b5c66);
    this.dark=toon(0x0c151f);this.skin=toon(boss?0xa7b7bf:hero?0xd4c1b2:0x748791);this.hair=toon(0x0c1015);
    this.trim=toon(boss?0x566873:hero?0x4e646f:0x657680);this.steel=toon(0xd7e1df);
    this.light=flat(0xe6eae0);this.edge=flat(0xf6f5eb);this.ink=flat(0x152123);this.leather=toon(0x1e2b36);
    this.outline=flat(0x060d15,{side:THREE.BackSide});
    this.flowMaterial=toon(hero?0x8f9fa7:boss?0xaebdc6:0x4b6573,{side:THREE.DoubleSide});
    this.ivory=hero?toon(0xd7d7d0,{side:THREE.DoubleSide}):this.cloth;
    this.cord=hero?toon(0x7d2426,{side:THREE.DoubleSide}):this.trim;
    this.bronze=hero?toon(0x7a6e55):this.trim;
    if(hero){
      // Painted hems are generated locally; the supplied sheet stays an unmodified reference.
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#e8e7df';ctx.fillRect(0,0,256,512);
      let seed=641;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
      for(let i=0;i<30;i++){
        const x=rand()*256;ctx.strokeStyle=`rgba(49,51,54,${.08+rand()*.22})`;ctx.lineWidth=1+rand()*8;
        ctx.beginPath();ctx.moveTo(x,rand()*100);ctx.bezierCurveTo(x-8,190,x+12,360,x-5,512);ctx.stroke();
      }
      for(let i=0;i<300;i++){
        const x=rand()*256,y=300+rand()*230,r=1+rand()*7;
        ctx.fillStyle=rand()>.5?'#181c23':'#525658';ctx.beginPath();
        ctx.ellipse(x,y,r*.5,r*(1+rand()),rand()*2,0,TAU);ctx.fill();
      }
      const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
      this.textures.push(map);this.ivory.map=map;
    }
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
    const painted=(parent,g,part,fallback)=>{
      if(!this.art)return add(parent,g,fallback,true);
      const projected=this.art.project(g,part);return add(parent,projected.geometry,projected.material);
    };
    const chest=painted(this.torso,rings([[0,.16,.205],[.12,.177,.22],[.27,.145,.23],[.43,.164,.255],
      [.59,.175,.27],[.68,.150,.235],[.76,.10,.135],[.79,.067,.079]],28,.018),'chest',hero?this.ivory:this.cloth);
    // The wrap crosses the chest, whose front is +X, rather than drawing a flat vest over the camera.
    if(!detailed){
    add(this.torso,patch([[.123,.76,-.10],[.201,.61,-.19],[.223,.40,.12],[.169,.25,.20],[.167,.45,.05]]),hero?this.cloth:this.fold);
    add(this.torso,patch([[.139,.73,.11],[.205,.58,.18],[.208,.51,.09],[.129,.72,.045]]),this.dark);
    tube(this.torso,[[.12,.765,-.096],[.213,.58,-.1],[.215,.41,.09],[.172,.25,.19]],.009,this.trim);
    tube(this.torso,[[.12,.765,.096],[.204,.59,.15],[.216,.50,.07]],.012,this.trim);
    for(let i=0;i<3;i++)tube(this.torso,[[.186,.29+i*.105,-.07],[.204,.27+i*.105,.035],[.177,.21+i*.105,.19]],.007,this.fold);
    }
    // A fitted sash joins the robe to the hips; the lower panels are independent cloth surfaces.
    add(this.body,rings([[-.055,.207,.225],[-.02,.213,.23],[.075,.207,.226],[.105,.19,.219]],24,.012),this.dark,true);
    for(let y=-.020;y<.075;y+=.060)add(this.body,rings([[y,.215,.234],[y+.012,.215,.234]],24),hero?this.cord:this.trim);
    ellipsoid(this.body,.204,.025,.12,hero?.047:.028,hero?.05:.035,.033,hero?this.bronze:this.leather);
    const knot=new THREE.Group();knot.position.set(.09,0,.246);this.body.add(knot);
    ellipsoid(knot,0,0,0,.055,.06,.033,this.dark);
    tube(knot,[[0,-.01,0],[-.11,-.17,.02],[-.09,-.29,.025]],.012,this.trim);
    tube(knot,[[0,-.01,0],[.03,-.19,.02],[.09,-.32,.025]],.01,this.trim);
    this.cloths=[];
    const length=boss?1.04:hero?1.00:.72;
    const panels=detailed?[[.04,.89],[.92,1.69],[1.72,2.68],[2.71,3.57],[3.60,4.51],[4.54,5.37],[5.40,6.24]]:[[.18,2.30],[2.23,4.40],[4.32,6.11]];
    panels.forEach(([from,to],i)=>{
      const rows=10,cols=10,p=new Float32Array((rows+1)*(cols+1)*3),idx=[],uv=[];
      for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++)uv.push(k/cols,1-j/rows);
      for(let j=0;j<rows;j++)for(let k=0;k<cols;k++){const n=j*(cols+1)+k;idx.push(n,n+cols+1,n+1,n+1,n+cols+1,n+cols+2);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);
      const center=(from+to)*.5,view=Math.cos(center)>.35?'front':Math.cos(center)<-.35?'back':'side';
      const material=detailed?this.art.cloth(g,rows,cols,view,i%2?.42:0,i%2?1:.61):(i===1?this.fold:this.cloth);
      const m=material.clone();m.side=THREE.DoubleSide;this.materials.push(m);
      const mesh=add(this.body,g,m);const lineIndices=[];
      for(let k=0;k<cols;k++)lineIndices.push(rows*(cols+1)+k,rows*(cols+1)+k+1);
      for(let k=2;k<cols;k+=3)for(let j=3;j<rows;j++)lineIndices.push(j*(cols+1)+k,(j+1)*(cols+1)+k);
      const seamGeometry=new THREE.BufferGeometry();seamGeometry.setAttribute('position',g.attributes.position);seamGeometry.setIndex(lineIndices);this.geometries.add(seamGeometry);
      const seamMaterial=new THREE.LineBasicMaterial({color:boss?0x929e94:0x66736c,transparent:true,opacity:.22});this.materials.push(seamMaterial);
      const seam=new THREE.LineSegments(seamGeometry,seamMaterial);this.body.add(seam);
      this.cloths.push({g,p,from,to,rows,cols,length:length*(detailed?[.88,.99,.95,1,.90,.96,.89][i]:(i===1?1:.95)),i});
    });
    // Legs have separate thigh, calf, ankle and boot volumes, with cloth gathers above the bindings.
    this.legs=[];
    for(const z of [-.135,.135]){
      const leg=new THREE.Group();leg.position.z=z;this.body.add(leg);
      add(leg,rings([[0,.125,.137],[-.12,.137,.145],[-.34,.114,.12],[-.54,.09,.097]],18,.045),this.dark,true);
      const knee=new THREE.Group();knee.position.y=-.57;leg.add(knee);
      ellipsoid(knee,0,0,0,.097,.11,.1,this.dark);
      painted(knee,rings([[0,.095,.10],[-.14,.087,.09],[-.28,.068,.072],[-.54,.057,.065]],20,.025),'boot',this.dark);
      for(let j=0;j<3;j++){
        const y=-.17-j*.084,rx=lerp(.085,.067,j/2),rz=rx+ .005;
        const binding=add(knee,rings([[y,rx,rz],[y-.018,rx,rz]],16),this.fold);binding.rotation.z=-.09;
      }
      const foot=new THREE.Group();foot.position.y=-.54;knee.add(foot);
      const boot=ellipsoid(foot,.070,-.022,0,.157,.058,.078,boss?this.cloth:this.dark,true);
      const sole=ellipsoid(foot,.068,-.054,0,.146,.020,.081,this.ink);
      tube(foot,[[-.06,.018,.069],[.05,.04,.079],[.18,-.005,.055]],.009,this.fold);
      this.legs.push({leg,knee,foot});
    }
    // A small, sculpted head and neck keep the silhouette close to adult human proportions.
    add(this.torso,rings([[.70,.079,.079],[.79,.075,.077],[.85,.071,.074]],16),this.dark);
    this.head=new THREE.Group();this.head.name='head';this.head.position.set(.028,.785,0);this.torso.add(this.head);
    if(detailed)this.head.scale.setScalar(.96);
    painted(this.head,rings([[0,.046,.041,.038],[.024,.071,.067,.032],[.060,.094,.084,.018],[.10,.106,.095,.009],
      [.145,.117,.104,.004],[.19,.120,.109,-.004],[.25,.110,.10,-.01],[.29,.077,.073,-.015],[.309,.009,.01,-.02]],40),'face',this.skin);
    if(!detailed){
    ellipsoid(this.head,.122,.134,0,hero?.013:.020,.028,hero?.015:.022,this.skin);
    ellipsoid(this.head,.122,.172,0,hero?.012:.018,.038,hero?.017:.023,this.skin);
    for(const s of [-1,1]){
      ellipsoid(this.head,-.045,.132,s*.103,.027,.047,.017,this.skin);
      ellipsoid(this.head,.089,.195,s*.090,.023,.009,.009,this.dark);
      ellipsoid(this.head,.104,.194,s*.081,.008,.009,.009,this.ink);
      tube(this.head,[[.071,.218,s*.101],[.117,.213,s*.070]],.009,this.hair);
      tube(this.head,[[.077,.219,s*.087],[.116,.211,s*.059]],.01,this.hair);
      tube(this.head,[[.099,.064,s*.034],[.117,.068,0]],.004,this.ink);
    }
    }
    // A fitted hair cap with a swept fringe, tied crown and long articulated queue.
    const hairCap=add(this.head,rings([[.21,.118,.111,-.024],[.255,.116,.111,-.024],
      [.306,.086,.083,-.026],[.332,.035,.036,-.03],[.339,.004,.006,-.03]],28,.015),this.hair);
    ellipsoid(this.head,-.105,.164,0,.044,.106,.092,this.hair);
    for(const s of [-1,1]){
      if(!hero)tube(this.head,[[-.09,.26,s*.08],[-.01,.282,s*.104],[.091,.234,s*.071],[.113,.198,s*.049]],.019,this.hair);
      tube(this.head,[[-.085,.235,s*.1],[-.064,.154,s*.109],[-.087,.067,s*.098]],.013,this.hair);
    }
    ellipsoid(this.head,-.075,.323,0,.046,.054,.049,this.hair,true);
    add(this.head,rings([[.316,.047,.044,-.07],[.329,.047,.044,-.07]],18),this.trim);
    this.tail=new THREE.Group();this.tail.position.set(-.105,detailed?.365:.27,-.015);this.head.add(this.tail);
    tube(this.tail,[[0,0,0],[-.09,-.07,0],[-.12,-.25,.02],[-.09,-.43,.015]],.026,this.hair);
    tube(this.tail,[[-.02,-.01,.026],[-.10,-.14,.028],[-.11,-.36,.038],[-.07,-.48,.02]],.012,this.hair);
    if(detailed){
      // Broad, pointed locks follow the supplied loose-haired, uncovered-face design.
      const hairLock=(parent,points,width,depth=.013)=>{
        const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),p=[],idx=[];
        for(let j=0;j<=14;j++){
          const t=j/14,c=curve.getPoint(t),w=width*(.3+Math.sin(t*Math.PI)*.7)*Math.pow(1-t,.45)+.0005;
          for(let k=0;k<4;k++){const angle=k/4*TAU;p.push(c.x+Math.cos(angle)*depth*(1-t),c.y,c.z+Math.sin(angle)*w);}
          if(j)for(let k=0;k<4;k++){const a=(j-1)*4+k,b=(j-1)*4+(k+1)%4;idx.push(a,b,a+4,b,b+4,a+4);}
        }
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();add(parent,g,this.hair);
      };
      for(const side of [-1,1]){
        for(let i=0;i<3;i++)hairLock(this.head,[[-.07,.30,side*(.015+i*.02)],[.06,.29-i*.015,side*(.060+i*.019)],[.118,.20-i*.02,side*(.084+i*.017)],[.088,.10-i*.05,side*(.112+i*.01)]],.020-i*.003);
        for(let i=0;i<3;i++)hairLock(this.head,[[-.083,.30,side*.09],[-.16,.29-i*.08,side*.12],[-.22-i*.025,-.01-i*.08,side*.145],[-.16-i*.035,-.29-i*.07,side*.12]],.037);
        for(let i=0;i<5;i++)hairLock(this.tail,[[-.02,0,side*.025],[-.14-i*.011,-.10,side*(.025+i*.014)],[-.21-i*.025,-.33,side*(.025+i*.018)],[-.16-i*.018,-.78-i*.05,side*.07]],.050-i*.004,.024);
        if(hero)hairLock(this.head,[[-.04,.32,side*.03],[-.10,.39,side*.055],[-.22,.38,side*.06],[-.26,.27,side*.07]],.027);
      }
      hairLock(this.head,[[.035,.31,.045],[.112,.26,.022],[.133,.215,-.01],[.128,.17,-.035]],.011,.006);
      add(this.head,rings([[.327,.047,.043,-.07],[.338,.047,.043,-.07]],18),this.cord);
      tube(this.head,[[-.09,.32,.04],[-.17,.31,.08],[-.21,.21,.08]],.005,this.cord);
      add(this.torso,rings([[.735,.096,.11],[.79,.10,.109],[.80,.086,.092]],20,.035),boss?this.cloth:this.ivory);
      tube(this.torso,[[.09,.795,.09],[.18,.59,.195],[.22,.32,.09]],.010,this.dark);
      // Both references have small metal/jade ornaments; only the hero wears vermilion.
      tube(this.body,[[.14,.04,.205],[.19,-.13,.24],[.09,-.32,.26]],.009,this.cord);
      tube(this.body,[[.14,.03,.207],[.16,-.10,.275],[.08,-.27,.29]],.006,this.bronze);
      const pendant=new THREE.Group();pendant.position.set(.07,-.30,.28);this.body.add(pendant);
      const ring=add(pendant,new THREE.TorusGeometry(.040,.009,6,18),this.bronze);ring.rotation.y=.28;
      ellipsoid(pendant,0,0,.002,.024,.029,.012,this.fold);
      for(let i=0;i<4;i++)tube(pendant,[[.015-i*.01,-.04,0],[.011-i*.009,-.10,.002],[.015-i*.01,-.19,.015]],.004,this.cord);
    }
    if(type==='blade'){
      const hat=new THREE.Group();hat.position.y=.265;this.head.add(hat);
      const cone=add(hat,new THREE.ConeGeometry(.43,.22,40,1,true),this.leather,true);cone.position.y=.055;
      const brim=add(hat,new THREE.TorusGeometry(.426,.007,5,48),this.trim);brim.rotation.x=Math.PI/2;brim.position.y=-.055;
      for(let i=0;i<20;i++){
        const a=i/20*TAU,r=.425;tube(hat,[[0,.16,0],[Math.cos(a)*r,-.055,Math.sin(a)*r]],.0018,this.fold);
      }
      this.tail.scale.setScalar(.6);
    }
    if(type==='spear'){
      add(this.head,rings([[.225,.136,.127],[.30,.123,.116],[.36,.08,.073],[.43,.012,.013]],20),this.leather,true);
      tube(this.head,[[-.12,.24,.126],[0,.28,.13],[.09,.25,.08]],.013,this.trim);this.tail.visible=false;
    }
    this.ribbons=[];
    for(let i=0;i<2;i++){
      const group=new THREE.Group();group.position.set(hero?.06:-.13,hero?.025:boss?.97:.75,hero?.255+i*.035:-.045+i*.075);this.torso.add(group);
      const rows=20,p=new Float32Array((rows+1)*6),indices=[];
      for(let j=0;j<rows;j++){const n=j*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(indices);
      add(group,g,hero?this.cord:this.flowMaterial);this.ribbons.push({group,g,p,rows,i});
    }
    this.mantle=null;
    if(detailed){
      // The reference has a dark shoulder mantle over long, split ivory inner robes.
      painted(this.torso,rings([[.53,.21,.31,-.07],[.65,.20,.285,-.06],[.76,.14,.18,-.04],[.82,.094,.11,-.02]],28,.035),'mantle',this.dark);
      tube(this.torso,[[-.07,.73,.26],[-.08,.62,.31],[-.18,.53,.285]],.009,this.trim);
      const rows=16,cols=6,p=new Float32Array((rows+1)*(cols+1)*3),idx=[];
      for(let j=0;j<rows;j++)for(let k=0;k<cols;k++){const n=j*(cols+1)+k;idx.push(n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(idx);
      const m=this.art.cloth(g,rows,cols,'back',.18,.82);add(this.torso,g,m);this.mantle={g,p,rows,cols};
    }
    if(boss){
      const crown=add(this.head,rings([[.325,.070,.058,-.065],[.40,.048,.043,-.065],[.48,.037,.032,-.067]],10,.08),this.trim,true);
      tube(this.head,[[-.065,.365,-.15],[-.065,.372,.15]],.009,this.steel);
      for(const side of [-1,1])tube(this.head,[[-.043,.34,side*.07],[-.025,.37,side*.03],[-.054,.445,side*.025]],.005,this.steel);
    }
    // Upper sleeves are broad at the shoulder and gather into narrow wrapped forearms.
    this.arms=[];this.sleeves=[];
    for(const z of [-.238,.238]){
      const upper=new THREE.Group();upper.name=z>0?'right_upper_arm':'left_upper_arm';upper.position.set(0,.65,z);this.torso.add(upper);
      const sleeve=hero?this.ivory:this.cloth;
      ellipsoid(upper,0,-.035,0,.103,.107,.108,hero?this.cloth:sleeve);
      if(detailed){
        const rows=12,cols=24,p=new Float32Array((rows+1)*(cols+1)*3),idx=[],uv=[];
        for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++)uv.push(...this.art.uv('sleeve','front',k/cols,j/rows));
        for(let j=0;j<rows;j++)for(let k=0;k<cols;k++){const n=j*(cols+1)+k;idx.push(n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1);}
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);
        add(upper,g,this.art.materials.front.material);this.sleeves.push({g,p,rows,cols,upper,side:z>0?1:-1});
      }else add(upper,rings([[.015,.094,.108],[-.07,.111,.113],[-.23,.115,.114],[-.34,.084,.085],[-.40,.072,.074]],18,.06),sleeve,true);
      const fore=new THREE.Group();fore.position.y=-.40;upper.add(fore);
      ellipsoid(fore,0,0,0,.077,.086,.078,this.fold);
      painted(fore,rings([[0,.084,.082],[-.08,.079,.075],[-.29,.048,.052],[-.365,.044,.044]],24,.035),'armor',this.dark);
      for(let j=0;j<3;j++){
        const y=-.10-j*.069,r=lerp(.072,.055,j/2);
        const wrap=add(fore,rings([[y,r+.006,r+.008],[y-(detailed?.006:.016),r+.006,r+.008]],16),detailed?this.bronze:this.trim);wrap.rotation.z=.13;
        if(detailed)for(const side of [-1,1])tube(fore,[[.015,y+.02,side*(r+.004)],[.064,y-.026,side*r*.7],[.021,y-.075,side*(r-.004)]],.0035,this.bronze);
      }
      const hand=new THREE.Group();hand.position.set(0,-.37,.002);fore.add(hand);
      ellipsoid(hand,0,-.016,0,.047,.064,.036,hero?this.dark:this.skin,true);
      for(let j=0;j<4;j++)ellipsoid(hand,.024,-.053+j*.023,.025,.028,.012,.024,this.skin);
      ellipsoid(hand,-.031,-.012,.025,.018,.033,.020,hero?this.dark:this.skin);
      this.arms.push({upper,fore,hand});
    }
    this.arms.forEach((arm,i)=>{arm.fore.name=i?'right_forearm':'left_forearm';arm.hand.name=i?'right_hand':'left_hand';});
    this.legs.forEach((leg,i)=>{leg.leg.name=i?'right_thigh':'left_thigh';leg.knee.name=i?'right_shin':'left_shin';leg.foot.name=i?'right_foot':'left_foot';});
    this.weapon=new THREE.Group();this.arms[1].hand.add(this.weapon);this.weapon.position.set(.035,-.016,.025);
    this.weapon.name='sword_grip';this.tail.name='ponytail';
    this.bladeGroup=new THREE.Group();this.weapon.add(this.bladeGroup);
    if(detailed){
      this.referenceWeapons=buildReferenceWeapons(this,type);this.ready=Promise.all([this.ready,this.referenceWeapons.ready]);this.ready.catch(()=>{});
    }else if(type==='spear'){
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
      const bladeLength=boss?1.41:1.38;
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
    this.trailMesh=new THREE.Mesh(this.trailGeometry,flat(0xe4f1f5,{transparent:true,opacity:.90,side:THREE.DoubleSide,depthWrite:false}));
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
    else if(a.state==='enemyAttack')q=boss&&a.phase>=2?pose({hip:.91,lean:-.35,rx:.65,ry:.49,lx:-.17,ly:.2,blade:-1.53,fx:.70,bx:-.53}):keys(STANCES.slash3,.315+clamp(t/(a.duration||.3),0,1)*.4);
    else if(a.state==='recover')q=blend(heavy,ready,ease(clamp(t/(a.duration||.5),0,1)));
    else if(a.state==='phase')q=pose({hip:1.12,rx:.05,ry:.19,lx:-.1,ly:.12,blade:2.05});
    else if(a.state==='execute')q=keys(STANCES.slash3,clamp(t/.95,0,1));
    else if(a.state==='ultimate')q=keys([[0,cut],[.38,finish],[.8,coil],[1,cut]],(t%.19)/.19);
    else if(a.state==='dead')q=pose({hip:.32,lean:1.30,rx:-.22,ry:.21,lx:-.2,ly:.37,blade:1.3,fx:.64,bx:-.26});
    else if(a.state==='model')q=pose({hip:1.17,hx:0,lean:0,twist:0,fx:.10,bx:-.10,head:0});
    else q.hip+=Math.sin(time*2)*.007;
    if(boss&&a.state==='idle')q=a.phase>=2?pose({hip:1.04,lean:-.17,rx:-.10,ry:.13,lx:-.1,ly:.10,blade:2.05,fx:.38,bx:-.36}):pose({hip:1.13,lean:.04,rx:.25,ry:.40,blade:-.74,fx:.29,bx:-.25});
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
    for(const i of [1,0]){
      const {leg,knee,foot}=this.legs[i],front=i===1;
      const [upper,lower]=ik((front?q.fx:q.bx)-q.hx,(front?q.fy:q.by)-q.hip,.57,.54,1);
      leg.rotation.z=upper;knee.rotation.z=lower;foot.rotation.z=-upper-lower;
      const arm=this.arms[i],x=front?q.rx:q.lx,y=front?q.ry:q.ly;
      const twoHands=a.type==='spear'||a.state==='guard'||a.state==='phase'||(a.state==='attack'&&a.move==='slash3')||(a.state==='windup'&&boss&&a.phase>=2);
      const target=new THREE.Vector3(x,y,front?.248:-.22);
      if(a.state==='model')target.set(.015,-.03,front?.60:-.60);
      if(!front&&twoHands){
        const grip=a.type==='spear'?(a.state==='enemyAttack'?-.25:.45):-.18;
        target.copy(this.torso.worldToLocal(this.weapon.localToWorld(new THREE.Vector3(0,grip,.018))));
      }
      const shoulder=arm.upper.position,dir=target.clone().sub(shoulder),distance=clamp(dir.length(),.025,.766);dir.normalize();
      target.copy(shoulder).addScaledVector(dir,distance);
      const bend=new THREE.Vector3(-1,-.20,front?.45:-.65);bend.addScaledVector(dir,-bend.dot(dir)).normalize();
      const along=(distance*distance+.4*.4-.37*.37)/(2*distance);
      const elbow=shoulder.clone().addScaledVector(dir,along).addScaledVector(bend,Math.sqrt(Math.max(0,.4*.4-along*along)));
      const down=new THREE.Vector3(0,-1,0);
      arm.upper.quaternion.setFromUnitVectors(down,elbow.clone().sub(shoulder).normalize());
      const lowerRotation=new THREE.Quaternion().setFromUnitVectors(down,target.clone().sub(elbow).normalize());
      arm.fore.quaternion.copy(arm.upper.quaternion).invert().multiply(lowerRotation);
      if(front){this.orientWeapon(q.blade);this.root.updateMatrixWorld(true);}
    }
    this.orientWeapon(q.blade);
    for(const tassel of this.referenceWeapons?.tassels||[]){
      const qWorld=tassel.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      tassel.quaternion.copy(qWorld);tassel.rotation.z+=Math.sin(time*7)*.11+Math.min(.8,Math.abs(a.vx)*.03);
    }
    this.bladeGroup.visible=!(boss&&a.phase>=2&&['windup','phase','idle','run'].includes(a.state));
    // Cloth follows stride and acceleration; the split panels keep the legs readable.
    const motion=clamp(a.vx*a.facing*.085,-.8,1.6),swing=Math.sin(this.gait*TAU);
    const legCapsules=[];
    if(this.art)for(const {leg,knee}of this.legs){
      const hip=new THREE.Vector3(0,0,leg.position.z),joint=new THREE.Vector3(Math.sin(leg.rotation.z)*.57,-Math.cos(leg.rotation.z)*.57,leg.position.z);
      const foot=joint.clone().add(new THREE.Vector3(Math.sin(leg.rotation.z+knee.rotation.z)*.54,-Math.cos(leg.rotation.z+knee.rotation.z)*.54,0));
      legCapsules.push({a:hip,b:joint,r:.166},{a:joint,b:foot,r:.116});
    }
    this.root.updateMatrixWorld(true);
    for(const sleeve of this.sleeves){
      const inverse=sleeve.upper.getWorldQuaternion(new THREE.Quaternion()).invert();
      const down=new THREE.Vector3(0,-1,0).applyQuaternion(inverse);
      for(let j=0;j<=sleeve.rows;j++)for(let k=0;k<=sleeve.cols;k++){
        const u=j/sleeve.rows,angle=k/sleeve.cols*TAU,r=.101+u*(boss?.125:.105),fold=1+Math.sin(angle*7+u*3)*.065;
        const drape=Math.pow(u,1.6)*(.12+(Math.sin(angle)+1)*.075);
        sleeve.p.set([Math.cos(angle)*r*fold+down.x*drape,-.025-u*.355+down.y*drape,Math.sin(angle)*r*fold+down.z*drape],(j*(sleeve.cols+1)+k)*3);
      }sleeve.g.attributes.position.needsUpdate=true;sleeve.g.computeVertexNormals();
    }
    for(const c of this.cloths){
      for(let j=0;j<=c.rows;j++)for(let k=0;k<=c.cols;k++){
        const v=j/c.rows,angle=lerp(c.from,c.to,k/c.cols),fold=Math.sin(angle*9+v*.6)*.014*v;
        const rx=.20+v*(this.art?.24:.16)+fold,rz=.222+v*(this.art?.19:.105)+fold;
        const footPush=Math.cos(angle)>0?Math.abs(swing)*.15*v*v:0;
        const flutter=Math.sin(time*9+angle*2+v*3)*(.012+Math.abs(motion)*.037)*v*v;
        const n=(j*(c.cols+1)+k)*3;
        c.p[n]=Math.cos(angle)*rx-motion*.34*v*v+flutter+footPush;
        const ragged=this.type==='player'?.045*Math.sin(angle*17+c.i)+.03*Math.cos(angle*31):boss?.02*Math.sin(angle*6):0;
        c.p[n+1]=-.018-v*c.length+Math.pow(v,5)*(.04*Math.sin(angle*3)+ragged+Math.abs(motion)*.1)+Math.abs(swing)*v*.025;
        c.p[n+2]=Math.sin(angle)*rz+Math.sin(time*6+v*3+angle)*.012*v;
        // Push the hem outside the posed legs so bent knees do not cut through the robe.
        if(v>.04)for(const capsule of legCapsules){
          const {a,b,r}=capsule,dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
          const t=clamp(((c.p[n]-a.x)*dx+(c.p[n+1]-a.y)*dy+(c.p[n+2]-a.z)*dz)/(dx*dx+dy*dy+dz*dz),0,1);
          const nx=c.p[n]-a.x-t*dx,ny=c.p[n+1]-a.y-t*dy,nz=c.p[n+2]-a.z-t*dz,d=Math.hypot(nx,ny,nz);
          if(d<r&&d>1e-5){const push=(r-d)/d;c.p[n]+=nx*push;c.p[n+1]+=ny*push;c.p[n+2]+=nz*push;}
        }
      }
      c.g.attributes.position.needsUpdate=true;c.g.computeVertexNormals();
    }
    this.tail.rotation.z=-motion*.56+Math.sin(time*4)*.065;
    this.flowMaterial.color.set(a.state==='ultimate'?0x9f1f1e:this.type==='player'?0x91a1a9:boss?0xaebdc6:0x4b6573);
    for(const r of this.ribbons){
      for(let j=0;j<=r.rows;j++){
        const u=j/r.rows,hero=this.type==='player',len=(r.i?1.00:1.25)*(1+Math.abs(motion)*.30),x=hero?-u*.08-motion*u*u*.58:boss?-u*.15-motion*u*u*.7:-u*len,
          y=(hero?-.80:boss?-1.28:-.12)*u+Math.sin(time*6-u*7+r.i*.9)*u*(.04+Math.abs(motion)*.055),width=(hero?.021:.044+Math.sin(u*Math.PI)*.017)*(1-u*.60);
        r.p.set([x,y+width,Math.sin(u*4+time*4)*u*.065,x,y-width,Math.sin(u*4+time*4)*u*.065],j*6);
      }r.g.attributes.position.needsUpdate=true;r.g.computeVertexNormals();
    }
    if(this.mantle){const c=this.mantle;
      for(let j=0;j<=c.rows;j++)for(let k=0;k<=c.cols;k++){
        const u=j/c.rows,v=k/c.cols,side=(v-.5)*2,width=.25+u*.08;
        const x=-.20-.17*u-motion*.40*u*u+Math.cos(side*Math.PI*.5)*.065+Math.sin(time*5-u*6)*u*u*.04;
        const y=.64-u*1.45+Math.abs(motion)*.28*u*u+Math.sin(side*5+u)*u*.045+Math.pow(u,7)*(.06*Math.sin(v*31)+.07*Math.cos(v*17));
        c.p.set([x,y,side*width+Math.sin(time*5-u*7+side)*u*u*.045],(j*(c.cols+1)+k)*3);
      }c.g.attributes.position.needsUpdate=true;c.g.computeVertexNormals();
    }
    for(const m of this.materials)if(m.isMeshToonMaterial){m.emissive.setHex(0xc4dce8);m.emissiveIntensity=Math.pow(clamp(a.flash/.12,0,1),3)*.75;}

    this.shadow.position.y=-a.y/size+.018;this.shadow.scale.setScalar(1/(1+a.y*.15));this.shadow.material.opacity=.45/(1+a.y*.6);
    this.root.visible=a.state!=='dead'||a.deadTime<.22;
    this.root.updateMatrixWorld(true);
    this.weapon.localToWorld(this.tip.copy(this.weaponTip||new THREE.Vector3(0,this.weaponLength,.02)));this.weapon.localToWorld(this.base.set(0,.14,.02));
    if(['run','dash'].includes(a.state)&&a.y<.01&&this.tip.y<.035&&a.type!=='spear'){
      const hilt=this.weapon.localToWorld(new THREE.Vector3());
      const angle=Math.acos(clamp((.035-hilt.y)/(this.weaponLength*size),-1,1));
      this.orientWeapon(angle);
      this.root.updateMatrixWorld(true);this.weapon.localToWorld(this.tip.copy(this.weaponTip||new THREE.Vector3(0,this.weaponLength,.02)));this.weapon.localToWorld(this.base.set(0,.14,.02));
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
    this.trailMesh.visible=this.root.visible&&this.trail.length>1;this.trailMesh.material.color.set(a.state==='ultimate'?0xb92524:0xe4f1f5);
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
    this.art?.dispose();
    this.referenceWeapons?.dispose();
    this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.trailGeometry.dispose();
  }
}
