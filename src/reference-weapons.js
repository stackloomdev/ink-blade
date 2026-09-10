import * as THREE from '../vendor/three.module.js';

// Build solid, bevelled blade/scabbard volumes along the contours in the supplied drawings.
// Each broad side uses UVs into the original PNG; no sprite, background card or image edit is used.
export function buildReferenceWeapons(w,type){
  const boss=type==='boss',file=boss?'boss-front.png':'hero-weapons.png',width=boss?1024:1774,height=boss?1536:887;
  const map=new THREE.Texture();map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;w.textures.push(map);
  let disposed=false;
  const ready=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{if(!disposed){map.image=image;map.needsUpdate=true;}resolve();};image.onerror=()=>reject(new Error(`Weapon texture failed to load: ${file}`));image.src=new URL(`../assets/reference/turnarounds/${file}`,import.meta.url).href;});
  ready.catch(error=>console.error(error));
  const material=new THREE.MeshToonMaterial({map,color:0xe7e7e7,gradientMap:w.cloth.gradientMap,side:THREE.DoubleSide});w.materials.push(material);
  const add=(parent,geometry,mat=material)=>w.add(parent,geometry,mat);
  const tube=(parent,points,r,mat=w.bronze)=>add(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),20,r,5,false),mat);
  function volume(parent,sections,depth){
    const positions=[],uv=[],idx=[];
    for(const s of sections){
      // [world y, left x, right x, texture left x/y, texture right x/y]
      const [y,l,r,lu,lv,ru,rv]=s;
      positions.push(l,y,0,(l+r)/2,y,depth,r,y,0,(l+r)/2,y,-depth);
      uv.push(lu/width,1-lv/height,(lu+ru)/2/width,1-(lv+rv)/2/height,ru/width,1-rv/height,(lu+ru)/2/width,1-(lv+rv)/2/height);
    }
    for(let j=0;j<sections.length-1;j++)for(let k=0;k<4;k++){const a=j*4+k,b=j*4+(k+1)%4;idx.push(a,b,a+4,b,b+4,a+4);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    return add(parent,g);
  }
  const bladeLength=boss?1.50:1.48;
  let blade;
  if(boss){
    blade=[[.15,-.036,.036,876,575,900,575],[.34,-.025,.025,879,670,898,670],[1.27,-.017,.017,885,1110,898,1110],[bladeLength,0,0,891,1215,891,1215]];
  }else{
    const contour=[[1247,249,284],[1070,272,312],[850,289,329],[550,296,332],[270,282,311],[112,262,283],[49,251,251]];
    blade=contour.map(([x,top,bottom])=>[.15+(1247-x)/1198*(bladeLength-.15),(top-270)*.0011,(bottom-270)*.0011,x,top,x,bottom]);
  }
  volume(w.bladeGroup,blade,.015);
  tube(w.bladeGroup,blade.map(s=>[s[2],s[0],.002]),.0023,w.edge);
  w.weaponLength=bladeLength;w.weaponTip=new THREE.Vector3(blade.at(-1)[1],bladeLength,.01);

  const grip=add(w.weapon,new THREE.CylinderGeometry(.031,.035,.32,16),w.dark);grip.position.y=-.085;
  for(let j=0;j<9;j++){
    const wrap=add(w.weapon,new THREE.TorusGeometry(.034,.004,4,12),j===0||j===8?w.bronze:w.leather);wrap.rotation.set(Math.PI/2,0,.35);wrap.position.y=-.22+j*.033;
    const diamond=add(w.weapon,new THREE.OctahedronGeometry(.011),w.bronze);diamond.scale.y=1.6;diamond.position.set(.032,-.21+j*.032,0);
  }
  const guardShape=new THREE.Shape();
  if(boss){
    guardShape.moveTo(-.115,0);guardShape.lineTo(-.048,.031);guardShape.lineTo(-.024,.084);guardShape.lineTo(0,.116);guardShape.lineTo(.024,.084);guardShape.lineTo(.048,.031);guardShape.lineTo(.115,0);guardShape.lineTo(.094,-.022);guardShape.lineTo(.035,-.008);guardShape.lineTo(0,-.032);guardShape.lineTo(-.035,-.008);guardShape.lineTo(-.094,-.022);
  }else{
    guardShape.moveTo(-.102,-.03);guardShape.bezierCurveTo(-.156,.026,-.115,.106,-.085,.088);guardShape.lineTo(-.057,.034);guardShape.lineTo(.053,.022);guardShape.bezierCurveTo(.136,.025,.157,-.035,.111,-.052);guardShape.lineTo(.047,-.013);guardShape.lineTo(-.044,-.014);
  }guardShape.closePath();
  const guard=add(w.weapon,new THREE.ExtrudeGeometry(guardShape,{depth:.026,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1,steps:1}),w.bronze);guard.position.set(0,.08,-.013);
  const pommel=add(w.weapon,new THREE.TorusGeometry(.035,.011,6,18),w.bronze);pommel.position.y=-.269;
  add(w.weapon,new THREE.SphereGeometry(.021,12,8),w.dark).position.y=-.269;

  w.scabbard=new THREE.Group();w.scabbard.name='scabbard';w.scabbard.position.set(-.09,.055,-.267);w.scabbard.rotation.z=-1.06;w.body.add(w.scabbard);
  let sheath;
  if(boss)sheath=[[.12,-.041,.041,961,575,993,575],[-.18,-.04,.04,961,713,993,713],[-1.20,-.036,.036,963,1160,993,1160],[-1.31,-.024,.024,966,1210,988,1210]];
  else sheath=[[1578,452,508],[1280,503,566],[910,525,585],[530,517,575],[200,489,545],[60,483,505]].map(([x,top,bottom])=>[.12-(1578-x)/1518*1.45,(top-520)*.00085,(bottom-520)*.00085,x,top,x,bottom]);
  volume(w.scabbard,sheath,.03);
  for(const y of [.11,-.27,-1.25]){
    const collar=add(w.scabbard,new THREE.CylinderGeometry(.050,.050,.035,12),w.bronze);collar.position.y=y;collar.scale.z=.82;
    tube(w.scabbard,[[.048,y+.035,0],[.05,y,.037],[.043,y-.036,0]],.006,boss?w.trim:w.cord);
  }
  const tassels=[];
  for(const [parent,point,length]of [[w.weapon,[0,-.29,0],.25],[w.scabbard,[.02,-.27,.04],.34]]){
    const group=new THREE.Group();group.position.set(...point);parent.add(group);
    const ring=add(group,new THREE.TorusGeometry(.026,.005,5,16),w.bronze);ring.position.y=-.072;
    tube(group,[[0,0,0],[.018,-.030,.009],[0,-.05,0]],.005,boss?w.dark:w.cord);
    for(let i=0;i<7;i++)tube(group,[[i*.005-.015,-.096,0],[i*.006-.018,-length*.7,.01],[i*.007-.021,-length,0]],.003,boss?w.dark:w.cord);
    tassels.push(group);
  }
  return {ready,tassels,dispose(){disposed=true;}};
}
