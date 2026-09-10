// Layered, original Web Audio synthesis. All sound is generated locally.
export class InkAudio{
  constructor(){this.enabled=true;this.ctx=null;this.rain=null;this.paused=false;}
  async start(){
    if(!this.ctx){
      const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;this.ctx=new Context();
      this.master=this.ctx.createGain();this.master.gain.value=this.enabled?.60:0;
      const compressor=this.ctx.createDynamicsCompressor();compressor.threshold.value=-14;compressor.knee.value=15;compressor.ratio.value=5;compressor.attack.value=.003;compressor.release.value=.20;
      this.master.connect(compressor);compressor.connect(this.ctx.destination);
      this.noiseBuffer=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate);const data=this.noiseBuffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.7;
      const source=this.ctx.createBufferSource();source.buffer=this.noiseBuffer;source.loop=true;
      const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1500;
      this.rain=this.ctx.createGain();this.rain.gain.value=.065;source.connect(filter);filter.connect(this.rain);this.rain.connect(this.master);source.start();
    }
    if(this.ctx.state==='suspended')await this.ctx.resume();
  }
  toggle(){this.enabled=!this.enabled;if(this.master)this.master.gain.setTargetAtTime(this.enabled?.60:0,this.ctx.currentTime,.08);if(this.enabled)this.start();return this.enabled;}
  pause(value){this.paused=value;if(this.rain){this.rain.gain.cancelScheduledValues(this.ctx.currentTime);this.rain.gain.setTargetAtTime(value?.013:.065,this.ctx.currentTime,.12);}}
  duck(duration=.35){if(!this.rain)return;const t=this.ctx.currentTime;this.rain.gain.cancelScheduledValues(t);this.rain.gain.setValueAtTime(.004,t);this.rain.gain.linearRampToValueAtTime(this.paused?.013:.065,t+duration);}
  tone(freq,duration=.16,gain=.12,type='sine',end=70,delay=0){
    if(!this.ctx||!this.enabled)return;const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;
    o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(10,end),t+duration);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.002);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.01);o.onended=()=>{o.disconnect();g.disconnect();};
  }
  noise(duration=.12,gain=.2,freq=1800,end=freq,delay=0){
    if(!this.ctx||!this.enabled)return;const t=this.ctx.currentTime+delay,s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=this.noiseBuffer;
    f.type='bandpass';f.frequency.setValueAtTime(freq,t);f.frequency.exponentialRampToValueAtTime(end,t+duration);f.Q.value=.7;
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(gain,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    s.connect(f);f.connect(g);g.connect(this.master);s.start(t,Math.random());s.stop(t+duration+.01);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};
  }
  metal(gain=.1,long=false){
    for(const [frequency,volume,duration]of [[1670,1,.26],[2810,.43,.19],[4330,.2,.09]])this.tone(frequency,long?duration*2.1:duration,gain*volume,'sine',frequency*.91);
    this.noise(.027,gain*1.6,5300,2400);
  }
  strike(heavy=false){
    this.noise(heavy?.13:.07,heavy?.42:.29,heavy?1600:2350,heavy?380:1050);
    this.tone(heavy?120:185,heavy?.27:.14,heavy?.36:.19,'sine',heavy?32:62);
    this.tone(410,.045,.085,'triangle',95);this.metal(heavy?.065:.036);
    if(heavy){this.noise(.27,.16,540,210,.035);this.duck(.20);}
  }
  play(e){
    if(!this.ctx||!this.enabled)return;const kind=e.type;
    if(kind==='slash'||kind==='enemySlash'){
      const heavy=e.move==='slash3'||e.move==='dive';this.noise(heavy?.17:.10,heavy?.22:.16,heavy?2100:3700,heavy?490:1050);this.tone(heavy?195:380,.075,.05,'triangle',70);
    }
    if(kind==='hit')this.strike(e.heavy);
    if(kind==='parry'){this.metal(.19,true);this.tone(96,.33,.35,'sine',31);this.noise(.09,.30,7200,2400);this.duck(.55);}
    if(kind==='block'){this.metal(.085);this.tone(145,.12,.11,'triangle',67);}
    if(kind==='dash'){this.noise(.21,.25,2300,500);this.tone(65,.12,.09,'sine',30);}
    if(kind==='land'){this.noise(e.heavy?.19:.08,e.heavy?.36:.08,900,330);this.tone(e.heavy?105:72,e.heavy?.27:.12,e.heavy?.28:.08,'sine',30);}
    if(kind==='footstep')this.noise(.045,.045,1100,400);
    if(kind==='hurt'){this.tone(83,.2,.23,'triangle',29);this.noise(.10,.24,750,210);}
    if(kind==='break'){this.tone(580,.24,.18,'triangle',150);this.noise(.15,.28,1400,410);this.tone(78,.26,.24,'sine',32);}
    if(kind==='execution'){this.strike(true);this.noise(.36,.3,4200,340);this.tone(57,.65,.32,'sine',26);this.duck(.66);}
    if(kind==='ultimateSlash'){this.strike(true);this.metal(.055);}
    if(kind==='ultimate'){this.duck(.5);this.tone(145,.65,.21,'sine',850);this.noise(.48,.20,650,5100);}
    if(kind==='phase'||kind==='encounter'){this.tone(72,.85,.24,'sine',31);this.tone(217,.95,.04,'triangle',105,.15);if(e.phase===3)this.noise(.85,.32,650,140);}
    if(kind==='won')[260,325,390,520].forEach((f,i)=>this.tone(f,1,.06,'sine',f*.99,i*.2));
  }
}
