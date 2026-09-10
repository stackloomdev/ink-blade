import * as THREE from '../vendor/three.module.js';

const mix=(a,b,t)=>a+(b-a)*t;
let seed=217;
const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
function canvasTexture(w,h,draw){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'),w,h);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function shape(points){const s=new THREE.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return new THREE.ShapeGeometry(s);}
const palette={near:0x0c1319,middle:0x28363e,far:0x596973,stone:0x202b32};

export class InkWorld{
  constructor(scene){
    this.scene=scene;this.root=new THREE.Group();scene.add(this.root);this.bamboo=[];this.mists=[];this.ripples=[];
    this.materials=new Map();this.createSky();this.createGround();this.createForest();this.createTemple();this.createRain();
  }
  material(color){if(!this.materials.has(color))this.materials.set(color,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));return this.materials.get(color);}
  box(parent,w,h,d,color,x=0,y=0,z=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.material(color));m.position.set(x,y,z);parent.add(m);return m;}
  plane(texture,w,h,x,y,z,color=0xffffff,opacity=1){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,color,transparent:true,opacity,depthWrite:false,fog:false,side:THREE.DoubleSide}));
    m.position.set(x,y,z);this.root.add(m);return m;
  }
  createSky(){
    const sky=canvasTexture(32,512,(ctx,w,h)=>{
      const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#101920');g.addColorStop(.30,'#344650');g.addColorStop(.62,'#a7b1b4');g.addColorStop(1,'#35434b');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    });this.plane(sky,220,40,40,-2,-64);
    // Mountain edges and dry-brush strokes fade into transparent mist instead of rectangular sheets.
    for(let layer=0;layer<3;layer++){
      const mountain=canvasTexture(3072,900,(ctx,w,h)=>{
        const points=[];
        for(let x=-160;x<=w+160;x+=150){const peak=140+Math.sin(x*.002+layer*1.7)*95+random()*150;points.push([x,peak]);}
        const path=new Path2D();path.moveTo(-160,h);path.lineTo(...points[0]);
        for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];path.bezierCurveTo(a[0]+65,a[1],b[0]-50,b[1],b[0],b[1]);}path.lineTo(w+160,h);path.closePath();
        const g=ctx.createLinearGradient(0,70,0,h);g.addColorStop(0,layer===0?'rgba(18,33,43,.60)':'rgba(28,44,54,.75)');g.addColorStop(.6,'rgba(43,60,69,.30)');g.addColorStop(1,'rgba(57,71,80,0)');ctx.fillStyle=g;ctx.fill(path);ctx.save();ctx.clip(path);
        for(let i=0;i<3700;i++){
          const x=random()*w,y=random()*h;ctx.strokeStyle=`rgba(10,24,32,${random()*.065})`;ctx.lineWidth=.5+random()*2;
          ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x-15,y+25,x-32,y+65,x-30-random()*45,y+110+random()*90);ctx.stroke();
        }ctx.restore();
      });this.plane(mountain,120,27,40,-6.5+layer*.25,-49+layer*9,0xffffff,.78);
    }
    const moon=canvasTexture(768,768,(ctx,w,h)=>{
      const g=ctx.createRadialGradient(w/2,h/2,w*.23,w/2,h/2,w*.49);g.addColorStop(0,'rgba(224,231,229,.33)');g.addColorStop(1,'rgba(224,231,229,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      ctx.beginPath();ctx.arc(w/2,h/2,w*.246,0,Math.PI*2);ctx.fillStyle='#e2e7e3';ctx.fill();ctx.save();ctx.clip();
      for(let i=0;i<3200;i++){ctx.fillStyle=`rgba(91,111,115,${random()*.055})`;ctx.beginPath();ctx.ellipse(random()*w,random()*h,1+random()*14,1+random()*8,random()*Math.PI,0,Math.PI*2);ctx.fill();}ctx.restore();
    });this.moon=this.plane(moon,8.8,8.8,11.6,.15,-32,0xffffff,.95);
    // Clouds occlude the moon softly, with a second moon over the cliffside temple.
    this.plane(moon,9,9,82,.6,-36,0xc6d2d4,.65);
    for(let i=0;i<12;i++){
      const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
        uniforms:{color:{value:new THREE.Color(0xb6c9d3)},opacity:{value:.14+random()*.06},phase:{value:random()*6}},
        vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:`varying vec2 vUv;uniform vec3 color;uniform float opacity,phase;
          void main(){float y=(vUv.y-.5)*2.;float x=(vUv.x-.5)*2.;
            float wave=.10*sin(vUv.x*11.+phase)+.05*sin(vUv.x*23.+phase);
            float a=exp(-pow((y-wave)*3.8,2.))*pow(max(0.,1.-x*x),2.)*opacity;
            gl_FragColor=vec4(color,a);
            #include <colorspace_fragment>
          }`});
      const m=new THREE.Mesh(new THREE.PlaneGeometry(23+random()*8,4+random()*2),material);m.position.set(i*10-6,.3+random()*.8,-3-random()*13);this.root.add(m);
      this.mists.push({mesh:m,x:m.position.x,speed:.08+random()*.12,phase:random()*7});
    }
  }
  createGround(){
    const groundTexture=canvasTexture(1024,512,(ctx,w,h)=>{
      ctx.fillStyle='#182128';ctx.fillRect(0,0,w,h);
      for(let i=0;i<85;i++){
        const x=random()*w,y=random()*h,rx=10+random()*160,ry=1+random()*15;
        ctx.fillStyle=`rgba(118,141,154,${random()*.06})`;ctx.beginPath();ctx.ellipse(x,y,rx,ry,random()*.09,0,Math.PI*2);ctx.fill();
      }
      for(let i=0;i<1900;i++){const l=60+random()*90;ctx.fillStyle=`rgba(${l},${l+6},${l+10},${random()*.06})`;ctx.fillRect(random()*w,random()*h,.5+random()*10,random()*1.1+.3);}
    });groundTexture.wrapS=groundTexture.wrapT=THREE.RepeatWrapping;groundTexture.repeat.set(10,2);groundTexture.anisotropy=8;
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,18),new THREE.MeshBasicMaterial({map:groundTexture}));ground.rotation.x=-Math.PI/2;ground.position.set(43,-.035,2);this.root.add(ground);
    const path=canvasTexture(2048,512,(ctx,w,h)=>{
      ctx.fillStyle='#29363d';ctx.fillRect(0,0,w,h);
      for(let row=0;row<3;row++)for(let col=-1;col<9;col++){
        const x=col*280+(row%2)*115,y=row*190-35;
        const p=new Path2D();p.moveTo(x+12,y+15);p.lineTo(x+255-random()*18,y+8);p.lineTo(x+269,y+159);p.lineTo(x+28,y+170);p.closePath();
        ctx.fillStyle=`rgba(152,171,177,${.04+random()*.09})`;ctx.fill(p);ctx.strokeStyle='rgba(6,14,20,.85)';ctx.lineWidth=3;ctx.stroke(p);
        ctx.strokeStyle='rgba(165,185,191,.17)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+17,y+17);ctx.lineTo(x+247,y+11);ctx.stroke();
        ctx.strokeStyle='rgba(7,16,22,.5)';ctx.beginPath();ctx.moveTo(x+45,y+43);ctx.lineTo(x+120,y+68);ctx.lineTo(x+139,y+120);ctx.stroke();
      }
      for(let i=0;i<270;i++){
        const x=random()*w,y=random()*h;ctx.fillStyle=`rgba(177,201,214,${random()*.13})`;ctx.beginPath();ctx.ellipse(x,y,8+random()*150,random()*6+.3,-.04,0,Math.PI*2);ctx.fill();
      }
      for(let i=0;i<800;i++){ctx.strokeStyle=`rgba(203,218,221,${random()*.12})`;ctx.lineWidth=.5;const x=random()*w,y=random()*h;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+2+random()*17,y);ctx.stroke();}
    });path.wrapS=THREE.RepeatWrapping;path.repeat.set(8,1);path.anisotropy=8;
    const stones=new THREE.Mesh(new THREE.PlaneGeometry(120,4.4),new THREE.MeshBasicMaterial({map:path}));stones.rotation.x=-Math.PI/2;stones.position.set(45,-.013,.25);this.root.add(stones);
    for(let i=0;i<75;i++){
      const x=random()*105-7,z=random()>.5?-2.6-random()*2:3.1+random()*2;
      const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.13+random()*.5),this.material(0x152029));rock.scale.set(1.7,.5,.8);rock.rotation.set(random(),random(),random());rock.position.set(x,.03,z);this.root.add(rock);
      if(i%2===0){const reed=new THREE.Group();reed.position.set(x,0,z);for(let j=0;j<6;j++){
        const h=.18+random()*.54,drift=(random()-.5)*.55;
        const grass=new THREE.Mesh(shape([[0,0],[drift*.3,h*.65],[drift,h],[drift*.35,h*.62],[.024,0]]),this.material(0x0b161e));grass.rotation.y=random()*Math.PI;reed.add(grass);
      }this.root.add(reed);}
    }
    const ringGeometry=new THREE.RingGeometry(.46,.473,36);
    for(let i=0;i<32;i++){
      const m=new THREE.Mesh(ringGeometry,new THREE.MeshBasicMaterial({color:0xb1c6d1,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.y=.012;this.root.add(m);this.ripples.push({mesh:m,t:random(),offset:(random()-.5)*26,z:(random()-.5)*6});
    }
  }
  createForest(){
    this.leafTexture=canvasTexture(512,320,(ctx,w,h)=>{
      ctx.translate(45,h*.80);
      // Branch and leaf silhouettes are painted as tapered, curved strokes.
      ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(120,-40,230,-115,375,-170);ctx.stroke();
      for(let i=0;i<11;i++){
        const t=i/11,x=25+t*330,y=-t*150,s=i%2?1:-1;
        const ex=x+35+random()*30,ey=y+s*(40+random()*65);
        ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+25,y+s*18,ex,ey);ctx.stroke();
        for(let k=0;k<3;k++){
          const a=.4+k*.24,sx=mix(x,ex,a),sy=mix(y,ey,a),len=32+random()*41,dx=12+random()*23,dy=s*len;
          ctx.fillStyle=`rgba(255,255,255,${.75+random()*.25})`;ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(sx+dx*.8+10,sy+dy*.45,sx+dx,sy+dy);ctx.quadraticCurveTo(sx+dx*.1-5,sy+dy*.4,sx,sy);ctx.fill();
          ctx.strokeStyle='rgba(210,221,219,.16)';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+dx,sy+dy);ctx.stroke();
        }
      }
    });
    this.barkTexture=canvasTexture(64,512,(ctx,w,h)=>{
      const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,'#253440');g.addColorStop(.16,'#627680');g.addColorStop(.3,'#253640');g.addColorStop(.75,'#121e27');g.addColorStop(1,'#3c515e');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      for(let i=0;i<2200;i++){ctx.fillStyle=`rgba(193,211,214,${random()*.08})`;ctx.fillRect(random()*w,random()*h,.2+random()*.7,random()*20);}
      for(let y=45;y<h;y+=93){ctx.fillStyle='rgba(155,172,176,.38)';ctx.fillRect(0,y,w,2);ctx.fillStyle='#0a1821';ctx.fillRect(0,y+3,w,4);}
    });
    for(let i=0;i<108;i++){
      const x=-10+random()*112,z=-4-random()*25;if(x>9&&x<13&&z>-12)continue;this.makeBamboo(x,z,4.2+random()*9,z<-17?palette.far:z<-9?palette.middle:palette.near,false);
    }
    for(const x of [4,17,30,47,61,72,87])this.makeBamboo(x,-4,5.8+random()*2,0x12222d,false);
    for(const x of [13.6,21.5,35.7,40.5,50.8,58.5,62])this.makeBamboo(x,-1.2,6.5+random()*3,0x101d25,true);
    for(const x of [-3,25,45,65,95])this.makeBamboo(x,4.4,11,0x050b11,false);
  }
  makeBamboo(x,z,height,color,breakable){
    const drop=breakable?0:6;height+=drop;
    const root=new THREE.Group();root.position.set(x,-drop,z);root.rotation.z=(random()-.5)*.11;this.root.add(root);
    const cutY=1.25,top=new THREE.Group();top.position.y=cutY;root.add(top);const radius=(z>0?.05:.026)+random()*.040;
    const bark=new THREE.MeshBasicMaterial({color:color===palette.far?0x82939b:color===palette.middle?0x516977:0x657a84,map:this.barkTexture});
    for(const [h,y,parent]of [[cutY,cutY/2,root],[height-cutY,(height-cutY)/2,top]]){
      const m=new THREE.Mesh(new THREE.CylinderGeometry(radius*.8,radius,h,9,1),bark);m.position.y=y;parent.add(m);
    }
    const leafMaterial=new THREE.MeshBasicMaterial({color,map:this.leafTexture,transparent:true,opacity:z<-12?.40:z<-5?.57:.82,alphaTest:.018,side:THREE.DoubleSide,depthWrite:false});
    for(let j=0;j<3;j++){
      const side=(x>8&&x<14&&z>-12)?Math.sign(x-11)||1:j%2?1:-1,leaf=new THREE.Mesh(new THREE.PlaneGeometry(2.35,1.55),leafMaterial);leaf.position.set(side*.94,height-cutY-1-j*1.03,.01+j*.03);leaf.rotation.z=side*(.08+random()*.25);leaf.scale.x=side;top.add(leaf);
    }
    if(breakable)this.bamboo.push({root,top,x,cutY,cut:false,fall:0,direction:1});
  }
  createTemple(){
    const temple=new THREE.Group();temple.position.set(79,0,-5);this.root.add(temple);
    this.box(temple,16,.24,8,0x24313b,0,.02);this.box(temple,13,.18,6,0x34434c,0,.23);
    for(const x of [-5.5,-2.3,2.3,5.5]){
      this.box(temple,.25,5.0,.30,0x111e29,x,2.72,1);
      this.box(temple,.038,4.9,.33,0x5e727d,x-.11,2.72,1.03);
      this.box(temple,.43,.16,.48,0x52616a,x,.46,1);
    }
    this.box(temple,12,.3,.45,0x182731,0,5.25,1);
    const roofShape=[[-7.8,5.0],[-6.55,5.21],[-5.60,5.57],[-4.50,6.80],[0,7.4],[4.50,6.80],[5.6,5.57],[6.55,5.21],[7.8,5.0],[6.8,4.93],[5.4,5.10],[0,5.46],[-5.4,5.10],[-6.8,4.93]];
    const roof=new THREE.Mesh(shape(roofShape),this.material(0x101d27));roof.position.z=.1;temple.add(roof);
    for(let i=-18;i<=18;i++){
      const x=i*.35,y=5.36+.105*(6.3-Math.abs(x));this.box(temple,.027,.052,.15,0x657984,x,y,.14);
    }
    this.box(temple,5.8,4.1,.25,0x3b4a53,0,2.50,-.5);
    this.gate=new THREE.Group();this.gate.position.set(0,.43,1.2);temple.add(this.gate);
    for(const s of [-1,1]){
      const door=new THREE.Group();door.position.set(s*1.0,0,0);this.gate.add(door);
      this.box(door,1.88,3.9,.16,0x18252f,0,1.95);
      for(let k=0;k<7;k++)this.box(door,.027,3.7,.028,0x63727a,-.81+k*.27,1.95,.12);
      this.box(door,1.9,.12,.2,0x0c1822,0,1.43,.12);
      const knocker=new THREE.Mesh(new THREE.TorusGeometry(.09,.018,5,14),this.material(0x939f9f));knocker.position.set(-s*.61,1.85,.17);door.add(knocker);
    }
    for(const x of [-6.4,6.4]){
      this.box(temple,.52,.45,.5,0x2b3a44,x,.6,2);this.box(temple,.30,1.4,.3,0x41525c,x,1.5,2);
      this.box(temple,.80,.12,.85,0x101d26,x,2.22,2);this.box(temple,.36,.35,.35,0xa8b7ba,x,1.99,2);
    }
  }
  createRain(){
    this.rainCount=750;this.rainData=new Float32Array(this.rainCount*6);this.rainSeeds=[];
    for(let i=0;i<this.rainCount;i++)this.rainSeeds.push({x:(random()-.5)*32,y:random()*14,z:random()*18-10,speed:11+random()*11});
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.rainData,3));
    this.rain=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xc5d7e0,transparent:true,opacity:.25,depthWrite:false}));this.rain.frustumCulled=false;this.root.add(this.rain);
  }
  repel(x,y){this.shock={x,y,t:0};}
  update(time,dt,cameraX,game){
    if(this.shock)this.shock.t+=dt;
    for(const b of this.bamboo){
      if(b.cut){b.fall=Math.min(1.8,b.fall+dt);b.top.rotation.z=-b.direction*b.fall*.7;b.top.position.set(b.direction*b.fall*.38,b.cutY-b.fall*b.fall*.85,0);}
      else b.top.rotation.z=Math.sin(time*.9+b.x)*.008;
    }
    for(const m of this.mists)m.mesh.position.x=m.x+Math.sin(time*m.speed+m.phase)*2;
    if(game.gateBroken)this.gate.children.forEach((d,i)=>{d.rotation.z=mix(d.rotation.z,i?1.42:-1.42,dt*2.4);d.position.y=mix(d.position.y,-1.1,dt*.9);});
    for(let i=0;i<this.rainCount;i++){
      const r=this.rainSeeds[i];r.y-=dt*r.speed*(game.slow>0?.32:1);if(r.y<-.5)r.y=11+random()*3;
      const wind=game.gateBroken?.34:.16,k=i*6;let x=cameraX+r.x+r.y*wind,y=r.y;
      if(this.shock&&this.shock.t<.6){const dx=x-this.shock.x,dy=y-this.shock.y,d=Math.hypot(dx,dy);const power=Math.exp(-Math.pow((d-this.shock.t*12)*2.5,2))*.7;if(d>.01){x+=dx/d*power;y+=dy/d*power;}}
      this.rainData.set([x,y,r.z,x-wind*.7,y-.55,r.z],k);
    }this.rain.geometry.attributes.position.needsUpdate=true;
    for(const r of this.ripples){r.t+=dt*.65;if(r.t>1){r.t=0;r.offset=(random()-.5)*26;r.z=(random()-.5)*5.8;}
      r.mesh.position.set(cameraX+r.offset,.014,r.z);r.mesh.scale.setScalar(.18+r.t*.8);r.mesh.material.opacity=(1-r.t)*.18;
    }
  }
  reset(){
    this.shock=null;
    this.bamboo.forEach(b=>{b.cut=false;b.fall=0;b.top.rotation.z=0;b.top.position.set(0,b.cutY,0);});
    this.gate.children.forEach(d=>{d.rotation.z=0;d.position.y=0;});
  }
}
