// Combat runs at 60 fixed simulation steps. Rendering never decides who was hit.
export const STEP = 1 / 60;
export const MOVES = {
  slash1: { duration: .34, active: .10, end: .18, damage: 19, posture: 19, reach: 2.25, push: 3.5, cancel: .20 },
  slash2: { duration: .36, active: .10, end: .19, damage: 21, posture: 23, reach: 2.45, push: 4, cancel: .21 },
  slash3: { duration: .48, active: .15, end: .25, damage: 29, posture: 34, reach: 2.8, push: 9, cancel: .31 },
  upper: { duration: .46, active: .14, end: .23, damage: 22, posture: 28, reach: 2.15, push: 1.5, launch: 8.2, cancel: .26 },
  air: { duration: .31, active: .08, end: .18, damage: 21, posture: 20, reach: 2.5, push: 2, cancel: .18 },
  dive: { duration: .68, active: .10, end: .65, damage: 34, posture: 38, reach: 2.1, push: 8, cancel: .58 },
};
export const ENCOUNTERS = [
  { at: 9, left: 4, right: 23, name: '竹影 · 初逢', enemies: [['blade', 15], ['blade', 18]] },
  { at: 29, left: 25, right: 43, name: '听雨 · 破势', enemies: [['blade', 34], ['spear', 39], ['blade', 31]] },
  { at: 48, left: 44, right: 63, name: '疾行 · 无回', enemies: [['spear', 57], ['blade', 54], ['blade', 59]] },
  { at: 70, left: 67, right: 89, name: '古寺 · 白衣', enemies: [['boss', 80]] },
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function actor(type, x, id) {
  const maxHp = type === 'player' ? 100 : type === 'boss' ? 1080 : type === 'spear' ? 94 : 76;
  return { id, type, x, y: 0, vx: 0, vy: 0, facing: type === 'player' ? 1 : -1,
    hp: maxHp, maxHp, posture: 0, maxPosture: type === 'boss' ? 180 : 85,
    state: 'idle', t: 0, duration: 0, move: null, hitSet: new Set(), invuln: 0,
    cooldown: 0, guardCooldown: 0, dashCooldown: 0, phase: 1, attackCount: 0,
    deadTime: 0, flash: 0, attackFacing: -1, attackOrigin: x, sequence: 0 };
}
export class InkGame {
  constructor() { this.reset(); this.status = 'menu'; }
  reset(bossOnly = false) {
    this.player = actor('player', bossOnly ? 70 : 5, 0);
    this.enemies = []; this.events = []; this.commands = []; this.buffer = null;
    this.status = 'playing'; this.time = 0; this.elapsed = 0; this.accumulator = 0;
    this.freeze = 0; this.slow = 0; this.combo = 0; this.bestCombo = 0; this.comboTime = 0;
    this.ink = bossOnly ? 35 : 0; this.kills = 0; this.parries = 0; this.damageTaken = 0;
    this.encounter = bossOnly ? 3 : 0; this.activeEncounter = null;
    this.bossOnly = bossOnly; this.checkpoint = bossOnly; this.gateBroken = false;
    this.nextId = 1; this.ultimateTick = 0; this.lastStep = 0;
    this.emit('chapter', { text: bossOnly ? '白衣候雨' : '雨落无声', sub: bossOnly ? '古寺 · 决斗' : '第一章 · 雨夜竹林' });
  }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drainEvents() { return this.events.splice(0); }
  command(name, data = {}) { if (this.status === 'playing') this.commands.push({ name, ...data }); }
  setState(a, state, duration = 0) { a.state = state; a.t = 0; a.duration = duration; }
  pause() {
    if (this.status === 'playing') { this.status = 'paused'; this.commands = []; this.buffer = null; }
    else if (this.status === 'paused') this.status = 'playing';
  }
  advance(realDt, input = {}) {
    if (this.status !== 'playing') return;
    const raw = Math.min(Math.max(realDt, 0), .1); this.elapsed += raw;
    let dt = raw;
    if (this.freeze > 0) { const consumed = Math.min(this.freeze, dt); this.freeze -= consumed; dt -= consumed; }
    if (this.slow > 0) { this.slow = Math.max(0, this.slow - raw); dt *= .35; }
    this.accumulator += dt;
    while (this.accumulator + 1e-9 >= STEP && this.status === 'playing') {
      this.accumulator -= STEP; this.step(STEP, input);
    }
  }
  step(dt, input) {
    this.time += dt;
    const p = this.player;
    for (const a of [p, ...this.enemies]) {
      a.t += dt; a.invuln = Math.max(0, a.invuln - dt); a.flash = Math.max(0, a.flash - dt);
      a.cooldown = Math.max(0, a.cooldown - dt); a.guardCooldown = Math.max(0, a.guardCooldown - dt);
      a.dashCooldown = Math.max(0, a.dashCooldown - dt);
      if (a.state === 'dead') { a.deadTime += dt; continue; }
      if (a.state !== 'broken' && a.state !== 'guard' && a.state !== 'windup') a.posture = Math.max(0, a.posture - dt * (a.type === 'boss' ? 4 : 3));
    }
    if (this.comboTime > 0) this.comboTime -= dt; else this.combo = 0;
    if (this.buffer) { this.buffer.life -= dt; if (this.buffer.life <= 0) this.buffer = null; }
    this.handleCommands(input);
    this.updatePlayer(dt, input);
    this.checkEncounter();
    for (const e of this.enemies) this.updateEnemy(e, dt);
    for (const a of [p, ...this.enemies]) this.integrate(a, dt);
    if (p.state === 'attack') this.playerAttack();
    if (p.state === 'ultimate') this.updateUltimate();
    if (p.state === 'execute' && p.t >= .30 && !p.executed) {
      p.executed = true;
      const target = this.enemies.find(e => e.id === p.target && e.hp > 0);
      if (target) {
        this.hitEnemy(target, target.type === 'boss' ? 95 : target.hp + 1, 0, 12, 'execute');
        target.posture = 0;
        if (target.hp > 0 && target.state !== 'phase') this.setState(target, 'recover', .85);
        this.freeze = .11; this.emit('execution', { x: target.x, y: target.y + 1 });
        p.hp = Math.min(p.maxHp, p.hp + 8); this.ink = Math.min(100, this.ink + 12);
      }
    }
    const encounter = this.activeEncounter;
    if (encounter && this.enemies.every(e => e.hp <= 0)) {
      this.activeEncounter = null; this.encounter++;
      if (this.encounter >= ENCOUNTERS.length) {
        this.status = 'won'; this.emit('won');
      } else {
        p.hp = Math.min(100, p.hp + 18); this.emit('clear', { text: '竹影散尽', sub: '气血恢复 · 继续向右' });
      }
    }
  }
  canAct() {
    const p = this.player;
    return ['idle', 'run', 'jump', 'guard'].includes(p.state) || (p.state === 'attack' && p.t >= MOVES[p.move].cancel);
  }
  handleCommands(input) {
    const p = this.player;
    for (const cmd of this.commands.splice(0)) {
      if (cmd.name === 'attack') this.buffer = { name: 'attack', up: cmd.up ?? input.up, down: cmd.down ?? input.down, life: .16 };
      if (cmd.name === 'jump' && this.canAct() && p.y < .06) {
        p.vy = 9; p.y = .01; this.setState(p, 'jump'); this.emit('jump', { x: p.x });
      }
      if (cmd.name === 'dash' && this.canAct() && p.dashCooldown <= 0) {
        if (input.move) p.facing = Math.sign(input.move);
        this.setState(p, 'dash', .19); p.dashCooldown = .52; p.invuln = .22; p.vx = 24 * p.facing;
        this.emit('dash', { x: p.x, y: p.y, facing: p.facing });
      }
      if (cmd.name === 'guard' && this.canAct() && p.guardCooldown <= 0) {
        this.setState(p, 'guard'); p.guardCooldown = .32;
        if (input.move) p.facing = Math.sign(input.move);
      }
      if (cmd.name === 'execute' && this.canAct()) {
        const target = this.enemies.filter(e => e.state === 'broken' && Math.abs(e.x - p.x) < 3.2 && Math.abs(e.y - p.y) < 1.5).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];
        if (target) {
          p.facing = Math.sign(target.x - p.x) || p.facing; p.x = target.x - p.facing * 1.05;
          p.target = target.id; p.executed = false; p.invuln = .9; p.vx = 0;
          this.setState(p, 'execute', .80); this.emit('executeStart', { x: target.x, y: target.y + 1 });
        }
      }
      if (cmd.name === 'ultimate' && this.canAct() && this.ink >= 100) {
        this.ink = 0; this.ultimateTick = 0; p.invuln = 1.7; p.vx = 0;
        this.setState(p, 'ultimate', 1.45); this.emit('ultimate', { x: p.x, y: p.y + 1 });
      }
    }
    if (this.buffer && this.canAct()) {
      const cmd = this.buffer; this.buffer = null;
      if (input.move) p.facing = Math.sign(input.move);
      const previous = p.move;
      const chained = p.state === 'attack';
      const move = p.y > .15 ? (cmd.down ? 'dive' : 'air') : cmd.up ? 'upper' : chained && previous === 'slash1' ? 'slash2' : chained && previous === 'slash2' ? 'slash3' : 'slash1';
      this.setState(p, 'attack', MOVES[move].duration); p.move = move; p.hitSet.clear(); p.slashEmitted = false;
      p.vx = p.facing * (move === 'slash3' ? 5 : 3);
      if (move === 'air') p.vy = Math.max(p.vy, 1.3);
      if (move === 'dive') p.vy = -15;
    }
  }
  updatePlayer(dt, input) {
    const p = this.player;
    if (p.state === 'dead') return;
    if (['attack', 'dash', 'hit', 'execute', 'ultimate'].includes(p.state) && p.t >= p.duration) {
      this.setState(p, p.y > .05 ? 'jump' : 'idle'); p.vx *= .35;
    }
    if (p.state === 'guard' && !input.guard && p.t > .16) this.setState(p, p.y > .05 ? 'jump' : 'idle');
    if (['idle', 'run', 'jump'].includes(p.state)) {
      const direction = input.move || 0;
      p.vx += (direction * 7.4 - p.vx) * Math.min(1, dt * 22);
      if (direction) p.facing = Math.sign(direction);
      if (p.y < .05) p.state = direction ? 'run' : 'idle'; else p.state = 'jump';
      if (p.state === 'run' && this.time - this.lastStep > .22) { this.lastStep = this.time; this.emit('footstep', { x: p.x }); }
    } else if (p.state === 'dash') p.vx = 24 * p.facing;
    else p.vx *= Math.exp(-dt * (p.state === 'guard' ? 24 : 9));
  }
  integrate(a, dt) {
    if (a.state === 'dead') return;
    a.x += a.vx * dt;
    if (a.type !== 'player') a.vx *= Math.exp(-dt * (a.state === 'enemyAttack' ? 2 : 7));
    if (a.y > 0 || a.vy > 0) {
      a.vy -= 24 * dt; a.y += a.vy * dt;
      if (a.y <= 0) {
        a.y = 0; a.vy = 0;
        if (a.type === 'player') {
          this.emit('land', { x: a.x, heavy: a.move === 'dive' && a.state === 'attack' });
          if (a.move === 'dive' && a.state === 'attack') { this.playerAttack(); a.t = Math.max(a.t, .46); }
        }
      }
    }
    const bounds = this.activeEncounter;
    a.x = clamp(a.x, bounds ? bounds.left : 1, bounds ? bounds.right : 89);
  }
  checkEncounter() {
    if (this.activeEncounter || this.encounter >= ENCOUNTERS.length) return;
    const data = ENCOUNTERS[this.encounter];
    if (this.player.x < data.at) return;
    this.activeEncounter = data;
    this.enemies = data.enemies.map(([type, x], i) => { const e = actor(type, x, this.nextId++); e.cooldown = .65 + i * .48; return e; });
    if (this.encounter === 3) this.checkpoint = true;
    this.emit('encounter', { text: data.name, boss: this.encounter === 3, sub: this.encounter === 3 ? '剑有三境。你能走到哪一境？' : '斩开去路' });
  }
  playerAttack() {
    const p = this.player, m = MOVES[p.move];
    if (!m || p.t < m.active || p.t > m.end) return;
    if (!p.slashEmitted) { p.slashEmitted = true; this.emit('slash', { x: p.x, y: p.y + 1.05, facing: p.facing, move: p.move }); }
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.state === 'phase' || p.hitSet.has(e.id)) continue;
      const dx = (e.x - p.x) * p.facing;
      if (dx < -.6 || dx > m.reach || Math.abs((e.y + .9) - (p.y + 1)) > (p.move === 'upper' ? 2.4 : 1.65)) continue;
      p.hitSet.add(e.id);
      this.hitEnemy(e, m.damage, m.posture, m.push * p.facing, p.move);
      if (m.launch && e.type !== 'boss' && e.hp > 0) { e.vy = m.launch; e.y = .05; this.setState(e, 'hit', .75); }
      if (p.move === 'air' && e.type !== 'boss' && e.y > .2) e.vy = 3;
      this.freeze = Math.max(this.freeze, p.move === 'slash3' || p.move === 'dive' ? .065 : .035);
    }
  }
  hitEnemy(e, damage, posture, push, move) {
    if (e.hp <= 0 || e.state === 'phase') return;
    e.hp = Math.max(0, e.hp - damage); e.posture += posture * (e.type === 'boss' ? .55 : 1); e.flash = .12;
    e.vx = push * (e.type === 'boss' ? .25 : 1);
    this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo); this.comboTime = 3;
    if (move !== 'ultimate') this.ink = Math.min(100, this.ink + 7);
    this.emit('hit', { x: e.x, y: e.y + 1.1, direction: Math.sign(push), heavy: ['slash3', 'dive', 'execute'].includes(move), boss: e.type === 'boss' });
    if (e.hp <= 0) {
      this.setState(e, 'dead'); this.kills++; this.emit('kill', { x: e.x, y: e.y + 1, boss: e.type === 'boss' }); return;
    }
    if (e.type === 'boss') {
      const phase = e.hp <= e.maxHp * .33 ? 3 : e.hp <= e.maxHp * .67 ? 2 : 1;
      if (phase > e.phase) {
        e.phase = phase; e.posture = 0; this.setState(e, 'phase', 1.8); e.vx = 0;
        if (phase === 3) this.gateBroken = true;
        this.emit('phase', { phase, x: e.x, text: phase === 2 ? '贰 · 藏锋' : '叁 · 破雨', sub: phase === 2 ? '听出刀的那一瞬' : '寺门尽碎，风雨入画' }); return;
      }
    }
    if (e.posture >= e.maxPosture) {
      e.posture = e.maxPosture; this.setState(e, 'broken', e.type === 'boss' ? 2.8 : 4.0);
      this.emit('break', { x: e.x, y: e.y + 1 });
    } else if (e.state !== 'broken' && e.type !== 'boss') {
      this.setState(e, 'hit', .30); e.cooldown = .5;
    }
  }
  updateEnemy(e, dt) {
    if (e.hp <= 0) return;
    const p = this.player;
    if (['hit', 'broken', 'phase', 'recover'].includes(e.state)) {
      if (e.t >= e.duration && e.y <= .05) {
        if (e.state === 'broken') e.posture = 0;
        this.setState(e, 'idle'); e.cooldown = e.type === 'boss' ? .35 : .6;
      }
      return;
    }
    if (e.state === 'windup') {
      if (e.t < e.duration - .18) e.facing = Math.sign(p.x - e.x) || e.facing;
      if (e.t >= e.duration) {
        e.attackFacing = e.facing; e.attackOrigin = e.x; e.hitSet.clear();
        this.setState(e, 'enemyAttack', e.type === 'boss' && e.phase >= 2 ? .38 : .24);
        if (e.type === 'boss' && e.phase >= 2) e.vx = e.facing * (e.phase === 3 ? 26 : 21);
        this.emit('enemySlash', { x: e.x, y: 1.05, facing: e.facing, spear: e.type === 'spear', boss: e.type === 'boss' });
      }
      return;
    }
    if (e.state === 'enemyAttack') {
      // Swept horizontal range includes the distance covered during a fast draw-cut.
      const reach = e.type === 'spear' ? 3.4 : e.type === 'boss' ? 2.65 : 1.85;
      const oldX = e.x, nextX = e.x + e.vx * dt;
      const min = Math.min(oldX, nextX) - (e.facing < 0 ? reach : .35);
      const max = Math.max(oldX, nextX) + (e.facing > 0 ? reach : .35);
      if (!e.hitSet.has(p.id) && p.x >= min && p.x <= max && p.y < 1.6 && p.hp > 0) {
        e.hitSet.add(p.id); this.enemyHit(e);
      }
      if (e.state === 'enemyAttack' && e.t >= e.duration) {
        const fastFollowup = e.type === 'boss' && e.phase === 3 && e.attackCount % 2 === 1;
        this.setState(e, 'recover', fastFollowup ? .32 : e.type === 'boss' ? .8 : 1.0);
      }
      return;
    }
    if (p.state === 'execute' || p.state === 'ultimate') { e.vx *= .8; return; }
    const distance = Math.abs(p.x - e.x);
    e.facing = Math.sign(p.x - e.x) || e.facing;
    const range = e.type === 'spear' ? 3.0 : e.type === 'boss' && e.phase >= 2 ? 7 : 1.55;
    if (distance > range) {
      e.state = 'run'; e.vx = e.facing * (e.type === 'boss' ? 3.9 : 2.6);
    } else {
      e.state = 'idle'; e.vx *= .7;
      const attacking = this.enemies.filter(a => a !== e && ['windup', 'enemyAttack'].includes(a.state)).length;
      if (e.cooldown <= 0 && attacking < 2 && p.y < 2.5) {
        e.attackCount++;
        const windup = e.type === 'boss' ? (e.phase >= 2 ? (e.attackCount % 2 ? .85 : 1.20) : .54) : e.type === 'spear' ? .8 : .66;
        this.setState(e, 'windup', windup);
        this.emit('tell', { x: e.x, y: 2.5, boss: e.type === 'boss', spear: e.type === 'spear' });
      }
    }
  }
  enemyHit(e) {
    const p = this.player;
    if (p.invuln > 0 || ['execute', 'ultimate', 'dead'].includes(p.state)) return;
    const facing = (e.x - p.x) * p.facing >= -.3;
    if (p.state === 'guard' && facing) {
      if (p.t <= .135) {
        this.parries++; this.ink = Math.min(100, this.ink + 24); p.posture = Math.max(0, p.posture - 25);
        e.posture += e.type === 'boss' ? 62 : 55; e.vx = -e.facing * 5;
        if (e.posture >= e.maxPosture) { e.posture = e.maxPosture; this.setState(e, 'broken', 3); this.emit('break', { x: e.x, y: 1 }); }
        else this.setState(e, 'recover', .9);
        this.freeze = .085; this.slow = .30; p.invuln = .25;
        this.emit('parry', { x: p.x + p.facing * .75, y: p.y + 1.3 });
      } else {
        p.posture += e.type === 'boss' ? 38 : 27;
        this.emit('block', { x: p.x + p.facing * .6, y: p.y + 1.2 });
        if (p.posture >= p.maxPosture) {
          p.posture = 0; this.hurtPlayer(e, 8); this.setState(p, 'hit', .7);
        } else { p.vx = e.facing * 3; this.freeze = .025; }
      }
      return;
    }
    this.hurtPlayer(e, e.type === 'boss' ? (e.phase === 3 ? 25 : 22) : e.type === 'spear' ? 14 : 11);
  }
  hurtPlayer(e, damage) {
    const p = this.player; p.hp = Math.max(0, p.hp - damage); this.damageTaken += damage;
    p.vx = e.facing * 7; p.invuln = .85; p.flash = .25;
    this.setState(p, 'hit', .34); this.combo = 0; this.buffer = null;
    this.freeze = .045; this.emit('hurt', { x: p.x, y: p.y + 1.1 });
    if (p.hp <= 0) { this.setState(p, 'dead'); this.status = 'lost'; this.emit('lost'); }
  }
  updateUltimate() {
    const p = this.player;
    const tick = Math.floor(p.t / .19);
    if (tick <= this.ultimateTick || tick > 6) return;
    this.ultimateTick = tick;
    const targets = this.enemies.filter(e => e.hp > 0 && e.state !== 'phase' && Math.abs(e.x - p.x) < 10);
    if (!targets.length) return;
    const target = targets[(tick - 1) % targets.length];
    p.facing = tick % 2 ? 1 : -1;
    const bounds = this.activeEncounter;
    p.x = clamp(target.x - p.facing * 1.2, bounds?.left ?? 1, bounds?.right ?? 89);
    this.emit('ultimateSlash', { x: target.x, y: target.y + 1.2, facing: p.facing });
    for (const e of targets) if (Math.abs(e.x - p.x) < 4.5) this.hitEnemy(e, 23, 12, p.facing * 3, 'ultimate');
  }
}
