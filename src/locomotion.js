const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const cycle=t=>((t%1)+1)%1;
const TAU=Math.PI*2;

export function gaitSettings(speed){
  const run=smooth((Math.abs(speed)-2.2)/4.8);
  return {run,stride:mix(1.5,2.8,run),duty:mix(.63,.39,run),lift:mix(.075,.57,run)};
}

// Forward-positive, Y-up. A cycle begins at touchdown, followed by support,
// toe-off, heel recovery under the hip and the forward swing to the next contact.
export function sampleGait(phase,speed){
  const settings=gaitSettings(speed),{run,stride,duty,lift}=settings;
  const feet=[0,.5].map(offset=>{
    const p=cycle(phase+offset),contact=p<duty;
    if(contact){
      const t=p/duty;
      return {phase:p,contact,x:stride*(duty*.5-p),y:0,
        angle:mix(.08,.12,run)*(1-smooth(t/.16))-mix(.24,.62,run)*smooth((t-.68)/.32)};
    }
    const t=(p-duty)/(1-duty),reach=stride*duty*.5;
    // Fold the heel first. Sending a straight leg forward here produces a limp.
    const x=t<.34?mix(-reach,-reach*.60,smooth(t/.34)):mix(-reach*.60,reach,smooth((t-.34)/.66));
    const y=t<.32?lift*smooth(t/.32):lift*(1-smooth((t-.32)/.68));
    const angle=t<.28?mix(-mix(.24,.62,run),-mix(.3,.82,run),smooth(t/.28)):
      mix(-mix(.3,.82,run),mix(.08,.12,run),smooth((t-.28)/.72));
    return {phase:p,contact,x,y,angle};
  });
  const step=cycle(phase*2);
  // Compress after touchdown, rise into flight. The pelvis never follows whichever
  // boot happens to be lowest on this frame.
  const bob=-(.018+run*.018)*Math.sin(step*TAU)+run*.035*Math.sin(Math.PI*step)**2;
  return {...settings,phase:cycle(phase),feet,bob,
    lean:mix(.055,.22,run)+.012*Math.sin(step*TAU),arm:Math.cos(phase*TAU)};
}

export class DistanceGait{
  constructor(){this.phase=0;this.weight=0;this.lastX=null;this.lastTime=null;this.facing=1;this.plants=[null,null];this.contact=[false,false];}
  update(a,time){
    const dt=this.lastTime===null?0:clamp(time-this.lastTime,0,.05),speed=Math.abs(a.vx||0);
    const moving=a.state==='run',settling=a.state==='idle'&&this.weight>.001;
    const discontinuity=this.lastX===null||time<this.lastTime||Math.abs(a.x-this.lastX)>2||a.facing!==this.facing;
    if(discontinuity){this.plants=[null,null];this.contact=[false,false];this.phase=0;}
    if(a.gaitPhase!==undefined){this.phase=cycle(a.gaitPhase);this.weight=1;this.plants=[null,null];this.contact=[false,false];}
    else{
      if((moving||settling)&&!discontinuity)this.phase+=Math.abs(a.x-this.lastX)/gaitSettings(Math.max(speed,2.2)).stride;
      this.weight=(moving||settling)?mix(this.weight,moving?1:0,1-Math.exp(-dt*(moving?26:22))):0;
    }
    this.lastX=a.x;this.lastTime=time;this.facing=a.facing;
    const pose=sampleGait(this.phase,Math.max(2.2,speed));
    pose.weight=this.weight;
    pose.feet.forEach((foot,i)=>{
      if(foot.contact){
        if(!this.contact[i]||this.plants[i]===null)this.plants[i]=a.x+a.facing*foot.x;
        foot.x=(this.plants[i]-a.x)*a.facing;
      }else this.plants[i]=null;
      this.contact[i]=foot.contact;foot.worldX=a.x+a.facing*foot.x;
    });
    return pose;
  }
}

// The knee lies on the forward side of the hip-to-ankle line, for both legs.
// The selected pole is anatomical; it must not alternate with the stepping leg.
export function solveLeg(hip,ankle,upper,lower){
  const dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],raw=Math.hypot(dx,dy);
  const d=clamp(raw,Math.abs(upper-lower)+.00001,upper+lower-.00001);
  const nx=dx/(raw||1),ny=dy/(raw||1);
  const along=(upper*upper-lower*lower+d*d)/(2*d),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  return [hip[0]+nx*along-ny*height,hip[1]+ny*along+nx*height];
}

export function poseGaitLegs(d,gait){
  const pixel=p=>[(d.origin[0]-p[0])/d.ppu,(d.origin[1]-p[1])/d.ppu];
  const hip=pixel(d.hip),knee=pixel(d.knee),ankle=pixel(d.ankle),sole=pixel(d.sole);
  const length=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
  const angle=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0]);
  const upperLength=length(hip,knee),lowerLength=length(knee,ankle);
  let hipHeight=hip[1]-mix(.07,.13,gait.run)+gait.bob;
  const legs=gait.feet.map(foot=>{
    const rotate=p=>{const x=p[0]-sole[0],y=p[1]-sole[1],c=Math.cos(foot.angle),s=Math.sin(foot.angle);return [x*c-y*s,x*s+y*c];};
    const toe=rotate(pixel(d.toe)),heel=rotate(pixel(d.heel));
    const targetSole=[foot.x,foot.y-Math.min(0,toe[1],heel[1])];
    const offset=rotate(ankle),targetAnkle=[targetSole[0]+offset[0],targetSole[1]+offset[1]];
    // Different costumes have different boot/ankle proportions. Compress the
    // pelvis a little when needed, rather than stretching a shin to reach the floor.
    const maxHeight=targetAnkle[1]+Math.sqrt(Math.max(0,(upperLength+lowerLength-.008)**2-(targetAnkle[0]-hip[0])**2));
    hipHeight=Math.min(hipHeight,maxHeight);
    return {sole:targetSole,ankle:targetAnkle,angle:foot.angle};
  });
  const targetHip=[hip[0],hipHeight];
  for(const leg of legs){
    leg.hip=targetHip;leg.knee=solveLeg(targetHip,leg.ankle,upperLength,lowerLength);
    leg.upper=angle(targetHip,leg.knee)-angle(hip,knee);
    leg.lower=angle(leg.knee,leg.ankle)-angle(knee,ankle);
  }
  return {legs,drop:hip[1]-hipHeight,bind:{hip,knee,ankle,sole}};
}
