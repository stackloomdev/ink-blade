import * as THREE from '../vendor/three.module.js';

const ROOT=new URL('../assets/reference/turnarounds/',import.meta.url);
const clamp=v=>Math.max(0,Math.min(1,v));
const assets={
  player:{front:['hero-front.png',1024,1536],side:['hero-side.png',1024,1536],back:['hero-back.png',1024,1536]},
  boss:{front:['boss-front.png',1024,1536],side:['boss-side-back.png',1448,1086],back:['boss-side-back.png',1448,1086]},
};
// Coordinates refer to the untouched supplied drawings. UVs select each garment's painted region.
const regions={
  player:{
    face:{front:[438,120,580,244],side:[396,128,530,249],back:[448,103,568,248]},
    chest:{front:[376,240,644,524],side:[366,233,555,512],back:[363,244,650,533]},
    sleeve:{front:[253,358,400,570],side:[400,327,559,540],back:[282,352,424,558]},
    armor:{front:[176,574,254,658],side:[435,532,510,617],back:[185,551,263,642]},
    hem:{front:[304,585,700,1290],side:[349,564,678,1260],back:[304,569,710,1265]},
    mantle:{front:[318,262,463,355],side:[429,263,576,478],back:[356,264,666,529]},
    hair:{front:[451,63,507,125],side:[537,99,601,393],back:[491,103,556,450]},
    boot:{front:[294,1240,365,1430],side:[375,1234,495,1437],back:[306,1195,379,1409]},
  },
  boss:{
    face:{front:[412,132,523,249],side:[302,85,393,177],back:[1057,90,1130,193]},
    chest:{front:[344,242,582,509],side:[337,183,455,385],back:[964,187,1236,398]},
    sleeve:{front:[223,342,366,588],side:[358,225,478,405],back:[875,260,1005,430]},
    armor:{front:[133,575,209,675],side:[376,407,433,469],back:[891,424,946,489]},
    hem:{front:[254,548,687,1322],side:[272,403,552,982],back:[916,412,1303,983]},
    mantle:{front:[305,275,600,378],side:[367,215,476,372],back:[969,197,1230,397]},
    hair:{front:[461,62,501,119],side:[402,91,449,300],back:[1091,62,1152,344]},
    boot:{front:[262,1369,323,1451],side:[318,1001,362,1041],back:[1037,1004,1100,1069]},
  },
};

export class ReferenceArt{
  constructor(type,gradient,owner){
    this.type=type;this.owner=owner;this.materials={};this.loaded=false;this.disposed=false;
    const tasks=[],images=new Map();
    for(const [view,[file,w,h]]of Object.entries(assets[type])){
      if(!images.has(file)){
        const texture=new THREE.Texture();texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
        owner.textures.push(texture);images.set(file,texture);
        tasks.push(new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{if(!this.disposed){texture.image=image;texture.needsUpdate=true;}resolve();};image.onerror=()=>reject(new Error(`Character reference failed to load: ${file}`));image.src=new URL(file,ROOT).href;}));
      }
      const material=new THREE.MeshToonMaterial({color:0xdedede,map:images.get(file),gradientMap:gradient,side:THREE.DoubleSide});
      owner.materials.push(material);this.materials[view]={material,width:w,height:h};
    }
    this.ready=Promise.all(tasks).then(()=>{this.loaded=true;});
    // Rendering can start before images load. Export still awaits and reports failures.
    this.ready.catch(error=>console.error(error));
  }
  uv(part,view,u,v){
    const [x0,y0,x1,y1]=regions[this.type][part][view],source=this.materials[view];
    return [(x0+(x1-x0)*clamp(u))/source.width,1-(y0+(y1-y0)*clamp(v))/source.height];
  }
  project(geometry,part){
    geometry.computeBoundingBox();const b=geometry.boundingBox,source=geometry.index?geometry.toNonIndexed():geometry;
    const pos=source.attributes.position,norm=source.attributes.normal,buckets=Array.from({length:3},()=>({p:[],n:[],uv:[]}));
    const views=['front','side','back'];
    for(let i=0;i<pos.count;i+=3){
      const nx=(norm.getX(i)+norm.getX(i+1)+norm.getX(i+2))/3;
      const index=nx>.42?0:nx<-.42?2:1,view=views[index],bucket=buckets[index];
      for(let j=i;j<i+3;j++){
        const x=pos.getX(j),y=pos.getY(j),z=pos.getZ(j);
        const u=view==='side'?1-(x-b.min.x)/(b.max.x-b.min.x):view==='front'?1-(z-b.min.z)/(b.max.z-b.min.z):(z-b.min.z)/(b.max.z-b.min.z);
        bucket.p.push(x,y,z);bucket.n.push(norm.getX(j),norm.getY(j),norm.getZ(j));
        bucket.uv.push(...this.uv(part,view,u,1-(y-b.min.y)/(b.max.y-b.min.y)));
      }
    }
    const g=new THREE.BufferGeometry(),p=[],n=[],uv=[];let start=0;
    buckets.forEach((bucket,i)=>{p.push(...bucket.p);n.push(...bucket.n);uv.push(...bucket.uv);if(bucket.p.length)g.addGroup(start,bucket.p.length/3,i);start+=bucket.p.length/3;});
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    if(source!==geometry)source.dispose();geometry.dispose();
    return {geometry:g,material:views.map(view=>this.materials[view].material)};
  }
  cloth(geometry,rows,cols,view='front',u0=0,u1=1){
    const uv=[];for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++)uv.push(...this.uv('hem',view,u0+(u1-u0)*k/cols,j/rows));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return this.materials[view].material;
  }
  dispose(){this.disposed=true;}
}
