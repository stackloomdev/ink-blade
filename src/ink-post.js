import * as THREE from '../vendor/three.module.js';

// A single compositor pass handles ink contrast, rain-shock distortion and restrained impact frames.
export class InkPost{
  constructor(renderer){
    this.renderer=renderer;this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,type:renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType,samples:Math.min(4,renderer.capabilities.maxSamples)});
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.uniforms={sceneMap:{value:this.target.texture},resolution:{value:new THREE.Vector2(1,1)},time:{value:0},
      strength:{value:0},center:{value:new THREE.Vector2(.5,.5)},age:{value:2},mode:{value:0},ultimate:{value:0},reduced:{value:0}};
    this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,depthTest:false,depthWrite:false,
      vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader:`
      uniform sampler2D sceneMap;uniform vec2 resolution;uniform float time,strength,age,mode,ultimate,reduced;uniform vec2 center;varying vec2 vUv;
      float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      vec3 sampleScene(vec2 uv){return pow(max(texture2D(sceneMap,clamp(uv,.001,.999)).rgb,vec3(0.0)),vec3(.454545));}
      void main(){
        vec2 uv=vUv;vec2 d=uv-center;d.x*=resolution.x/resolution.y;float dist=length(d);
        float shock=exp(-pow((dist-age*1.65)*32.0,2.0))*exp(-age*7.0)*strength*(1.0-reduced);
        uv+=normalize(d+vec2(.0001))*shock*.008;
        vec3 color=sampleScene(uv);vec2 texel=1.0/resolution;
        float lum=dot(color,vec3(.2126,.7152,.0722));
        vec3 nearX=sampleScene(uv+texel*vec2(1.2,0.0)),nearY=sampleScene(uv+texel*vec2(0.0,1.2));
        float edge=length(color-nearX)+length(color-nearY);color*=1.0-min(.17,edge*.32);
        // Keep the storm almost monochrome. Vermilion belongs to the player's ultimate.
        color=mix(vec3(lum),color,.34);color=(color-.44)*1.09+.44;
        float vignette=smoothstep(.28,.83,length((vUv-.5)*vec2(1.08,.92)));color*=1.0-vignette*.29;
        color+=(noise(gl_FragCoord.xy+floor(time*12.0)*7.0)-.5)*.007;
        color+=shock*vec3(.28,.31,.33);
        if(mode>1.5&&age<.034&&reduced<.5){float ink=smoothstep(.18,.66,lum);color=mix(color,mix(vec3(.018,.024,.027),vec3(.88,.89,.85),ink),.76*strength);}
        if(mode>2.5){float cut=exp(-abs((uv.y-center.y)-(uv.x-center.x)*.30)*240.0);color+=cut*exp(-age*8.0)*.25*strength;}
        float redEdge=smoothstep(.18,.70,length(vUv-center));color=mix(color,color*vec3(1.35,.70,.64),ultimate*redEdge*.45);
        gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
      }`});
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));
    this.pulse={x:0,y:0,age:2,strength:0,mode:0};
  }
  resize(w,h){this.target.setSize(w,h);this.uniforms.resolution.value.set(w,h);}
  impact(x,y,strength=1,mode=1){
    if(this.pulse.age<.045&&this.pulse.strength>strength)return;
    this.pulse={x,y,age:0,strength,mode};
  }
  render(scene,camera,time,dt,ultimate,reduced){
    const p=this.pulse;p.age+=dt;const v=new THREE.Vector3(p.x,p.y,0).project(camera);
    this.uniforms.center.value.set(v.x*.5+.5,v.y*.5+.5);this.uniforms.age.value=p.age;this.uniforms.strength.value=p.strength;
    this.uniforms.mode.value=p.mode;this.uniforms.time.value=time;this.uniforms.ultimate.value=ultimate?1:0;this.uniforms.reduced.value=reduced?1:0;
    this.renderer.setRenderTarget(this.target);this.renderer.render(scene,camera);this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);
  }
  reset(){this.pulse.age=2;}
}
