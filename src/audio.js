// Original Web Audio synthesis: no paid samples, services or runtime network calls.
export class InkAudio {
  constructor(){this.enabled=true;this.ctx=null;this.rain=null;this.lastStep=0;}
  async start(){
    if(!this.ctx){
      const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
      this.ctx=new Context();this.master=this.ctx.createGain();this.master.gain.value=this.enabled?.6:0;this.master.connect(this.ctx.destination);
      const noise=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate),data=noise.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.65;
      this.noiseBuffer=noise;const src=this.ctx.createBufferSource();src.buffer=noise;src.loop=true;
      const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1100;
      this.rain=this.ctx.createGain();this.rain.gain.value=.052;src.connect(filter);filter.connect(this.rain);this.rain.connect(this.master);src.start();
    }
    if(this.ctx.state==='suspended')await this.ctx.resume();
  }
  toggle(){this.enabled=!this.enabled;if(this.master)this.master.gain.setTargetAtTime(this.enabled?.6:0,this.ctx.currentTime,.08);if(this.enabled)this.start();return this.enabled;}
  pause(value){if(this.rain)this.rain.gain.setTargetAtTime(value?.013:.052,this.ctx.currentTime,.15);}
  tone(freq,duration=.16,gain=.12,type='sine',end=70,delay=0){
    if(!this.ctx||!this.enabled)return;
    const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;
    o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(end,t+duration);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.003);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.01);o.onended=()=>{o.disconnect();g.disconnect();};
  }
  noise(duration=.12,gain=.2,freq=1800){
    if(!this.ctx||!this.enabled)return;
    const t=this.ctx.currentTime,s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=this.noiseBuffer;
    f.type='bandpass';f.frequency.value=freq;f.Q.value=.7;g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);
    s.connect(f);f.connect(g);g.connect(this.master);s.start(t,Math.random());s.stop(t+duration);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};
  }
  play(e){
    const kind=e.type;
    if(kind==='slash'||kind==='enemySlash'){this.noise(.10,.13,2400);this.tone(380,.09,.035,'triangle',110);}
    if(kind==='hit'){this.noise(.07,.24,1250);this.tone(e.heavy?100:170,.14,.2,'triangle',42);}
    if(kind==='parry'){
      this.tone(1800,.55,.13,'sine',1550);this.tone(2700,.3,.05,'sine',2350);this.tone(85,.22,.23,'triangle',35);this.noise(.1,.18,3800);
      if(this.rain){const t=this.ctx.currentTime;this.rain.gain.setValueAtTime(.009,t);this.rain.gain.linearRampToValueAtTime(.052,t+.5);}
    }
    if(kind==='block'){this.tone(900,.18,.10,'triangle',400);this.noise(.05,.15,2900);}
    if(kind==='dash')this.noise(.2,.16,1500);
    if(kind==='land'){this.noise(.10,e.heavy?.24:.08,500);this.tone(75,.12,.10,'sine',32);}
    if(kind==='footstep')this.noise(.035,.06,620);
    if(kind==='hurt'){this.tone(80,.18,.18,'triangle',30);this.noise(.08,.2,700);}
    if(kind==='break'){this.tone(520,.3,.13,'triangle',170);this.noise(.15,.16,900);}
    if(kind==='execution'||kind==='ultimateSlash'){this.noise(.2,.32,2100);this.tone(90,.27,.23,'triangle',30);}
    if(kind==='ultimate'){this.tone(160,.7,.16,'sine',900);this.noise(.5,.17,1600);}
    if(kind==='phase'||kind==='encounter'){this.tone(75,.8,.2,'sine',37);this.tone(220,.9,.045,'triangle',110,.14);}
    if(kind==='won'){[260,325,390,520].forEach((f,i)=>this.tone(f,1,.06,'sine',f*.99,i*.2));}
  }
}
