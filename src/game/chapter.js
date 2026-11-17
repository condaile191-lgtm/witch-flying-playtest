import * as THREE from 'three';
import { ChapterVisuals } from './chapter-visuals.js';

const clamp = THREE.MathUtils.clamp;
const STAGES = ['贴地花海', '风车小屋', '小城镇', '悬崖出口', '海上飞行'];
const CFG = { speed: 31, maxSpeed: 49, lateral: 13, vertical: 6, attackCd: 0.65, slowCd: 10, slowDuration: 3.5, slowFactor: 0.42 };

// Positions are on Petalwake's baked island. The world, water, towns and wake stay upstream.
const NODES = [
  [-610, 500, 20], [-510, 500, 29], [-390, 515, 31], [-245, 545, 36],
  [-105, 560, 37], [-38, 615, 38], [-65, 740, 32], [-105, 855, 31],
  [-75, 970, 38], [-28, 1085, 43], [3, 1165, 42], [30, 1225, 35],
  [60, 1305, 16], [85, 1415, 5], [105, 1530, 4.5], [128, 1680, 4.5], [150, 1830, 4.5],
];
const STAGE_NODE = [0, 4, 8, 10, 13, 16];

export class Chapter {
  constructor(game) {
    this.game = game;
    this.curve = new THREE.CatmullRomCurve3(NODES.map(([x, z, y]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
    this.length = this.curve.getLength();
    this.stageAt = STAGE_NODE.map(i => this.length * i / (NODES.length - 1));
    this.group = new THREE.Group();
    game.pipeline.overlay.add(this.group);
    this.obstacles = [];
    this.pickups = [];
    this.active = false;
    this.el = document.getElementById('chapterUi');
    this.makeCourse();
    this.bindUI();
  }

  point(s, x = 0, h = 0) {
    const u = clamp(s / this.length, 0, 1);
    const p = this.curve.getPointAt(u);
    const t = this.curve.getTangentAt(u);
    const len = Math.hypot(t.x, t.z) || 1;
    p.x += -t.z / len * x;
    p.z += t.x / len * x;
    p.y += h;
    return p;
  }

  makeCourse() {
    this.visuals = new ChapterVisuals(this);
    for (const [distance, kind, opening] of [[190,'gate',-7],[340,'gate',7],[510,'windows',0],[680,'gate',0],[850,'high',0],[1210,'ring',0],[1390,'gate',-7]]) {
      this.obstacles.push(...this.visuals.obstacle(distance,kind,opening));
    }
    const glow = new THREE.MeshBasicMaterial({ color: 0xffdb78 });
    for (const s of [100, 215, 335, 475, 615, 785, 955, 1130, 1270, 1430]) {
      if (s >= this.length - 30) continue;
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 1), glow);
      const x = s % 2 ? 4 : -4;
      mesh.position.copy(this.point(s, x, 1));
      this.group.add(mesh);
      this.pickups.push({ s, x, mesh, got: false });
    }
    // A persistent ability pickup sits at the start of the windmill approach.
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 1), new THREE.MeshBasicMaterial({ color: 0x74f4ed }));
    orb.position.copy(this.point(380, 0, 2));
    this.group.add(orb);
    this.abilityPickup = { s: 380, mesh: orb, got: false };
    this.enemies = [950, 1500].filter(s => s < this.length - 80).map(s => {
      const mesh = this.visuals.enemy();
      mesh.position.copy(this.point(s + 38, 0, 1));
      this.group.add(mesh);
      return { gate: s, s: s + 38, mesh, hp: 2, alive: true, fire: 1.2 };
    });
    this.bullets = [];
  }

  bindUI() {
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && !e.repeat && this.active) { e.preventDefault(); this.togglePause(); }
    });
    document.getElementById('chapterRetry').addEventListener('click', () => this.start());
    document.getElementById('chapterContinue').addEventListener('click', () => this.togglePause());
    document.getElementById('chapterPause').addEventListener('click', () => this.togglePause());
    document.getElementById('chapterAttack').addEventListener('pointerdown', e => { e.preventDefault(); this.attack(); });
    document.getElementById('chapterSlow').addEventListener('pointerdown', e => { e.preventDefault(); this.slow(); });
    for (const button of document.querySelectorAll('[data-move]')) {
      button.addEventListener('pointerdown', e => { e.preventDefault(); this.touch.add(button.dataset.move); button.setPointerCapture(e.pointerId); });
      const release = () => this.touch.delete(button.dataset.move);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
    }
    window.addEventListener('blur', () => { if (this.active && !this.paused) this.togglePause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.active && !this.paused) this.togglePause(); });
  }

  start() {
    this.s = 0; this.x = 0; this.h = 0; this.vx = 0; this.vh = 0;
    this.speed = CFG.speed; this.score = 0; this.attackLeft = 0; this.slowLeft = 0;
    this.slowTime = 0; this.hasSlow = false; this.invuln = 0; this.paused = false;
    this.touch = new Set(); this.active = true; this.finished = false;
    this.prev = this.point(0);
    this.obstacles.forEach(o => { o.gone = false; o.mesh.visible = true; });
    this.pickups.forEach(o => { o.got = false; o.mesh.visible = true; });
    this.abilityPickup.got = false; this.abilityPickup.mesh.visible = true;
    this.enemies.forEach(e => { e.alive = true; e.hp = 2; e.fire = 1.2; e.mesh.visible = true; e.engaged = false; e.age = 0; });
    this.bullets.forEach(b => this.group.remove(b.mesh)); this.bullets.length = 0;
    const f = this.game.flight;
    f.auto = { step: (dt, t, flight) => this.fly(dt, flight) };
    f.pos.copy(this.prev); f.speed = this.speed;
    f.vel.set(0, 0, 0); f.roll = 0;
    const tangent = this.curve.getTangentAt(0);
    f.yaw = Math.atan2(tangent.x, -tangent.z);
    f.pitch = Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z));
    f._dir();
    this.game.chase.snap();
    this.game.paused = false;
    this.el.hidden = false;
    document.getElementById('chapterModal').hidden = true;
    this.updateHud();
  }

  fly(dt, f) {
    if (!this.active || this.paused) return;
    const input = this.game.input;
    const left = input.keys.has('KeyA') || input.keys.has('ArrowLeft') || this.touch.has('left');
    const right = input.keys.has('KeyD') || input.keys.has('ArrowRight') || this.touch.has('right');
    const up = input.keys.has('KeyW') || input.keys.has('ArrowUp') || this.touch.has('up');
    const down = input.keys.has('KeyS') || input.keys.has('ArrowDown') || this.touch.has('down');
    const ix = Number(right) - Number(left), ih = Number(up) - Number(down);
    this.vx = THREE.MathUtils.damp(this.vx, ix * 18, 8, dt);
    this.vh = THREE.MathUtils.damp(this.vh, ih * 10, 8, dt);
    this.x = clamp(this.x + this.vx * dt, -CFG.lateral, CFG.lateral);
    const center = this.point(this.s, this.x);
    const floor = f.surfaceAt(center.x, center.z, this.game.time);
    const minH = Math.max(-CFG.vertical, floor + 2.4 - center.y);
    this.h = clamp(this.h + this.vh * dt, minH, CFG.vertical);
    const playDt = dt * (this.slowTime > 0 ? CFG.slowFactor : 1);
    this.prev.copy(f.pos);
    this.s = Math.min(this.length, this.s + this.speed * playDt);
    const next = this.point(this.s, this.x, this.h);
    f.vel.copy(next).sub(f.pos).divideScalar(Math.max(dt, 0.001));
    f.pos.copy(next); f.speed = this.speed;
    const tangent = this.curve.getTangentAt(this.s / this.length);
    f.yaw = Math.atan2(tangent.x, -tangent.z);
    f.pitch = clamp(Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z)), -0.45, 0.35);
    f.roll = THREE.MathUtils.damp(f.roll, -ix * 0.25, 5, dt);
    this.attackLeft = Math.max(0, this.attackLeft - dt);
    this.slowLeft = Math.max(0, this.slowLeft - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (input.take('KeyJ')) this.attack();
    if (input.take('KeyK')) this.slow();
    this.visuals.update(dt);
    this.checkCourse();
    this.updateBattle(playDt);
    if (this.s >= this.length && this.active) this.end(true, '抵达海岸终点');
    this.updateHud();
  }

  checkCourse() {
    for (const o of this.pickups) {
      if (o.got || Math.abs(o.s - this.s) > 3 || Math.abs(o.x - this.x) > 3 || Math.abs(1 - this.h) > 4) continue;
      o.got = true; o.mesh.visible = false; this.score += 100;
      this.speed = Math.min(CFG.maxSpeed, this.speed + 1.8);
      this.game.sound.chime(this.score / 100);
      this.game.toast('风能收集 · 速度提升');
    }
    const a = this.abilityPickup;
    if (!a.got && Math.abs(a.s - this.s) < 4 && Math.abs(this.x) < 4 && Math.abs(this.h - 2) < 5) {
      a.got = true; a.mesh.visible = false; this.hasSlow = true;
      this.game.toast('获得缓时 · K 键使用');
    }
    for (const o of this.obstacles) {
      if (o.gone || this.invuln > 0 || o.s < this.s - 4 || o.s > this.s + 4) continue;
      if (Math.abs(o.x - this.x) < o.w / 2 + 0.8 && Math.abs(o.h - this.h) < o.ht / 2 + 0.8) {
        this.damage('撞上了前方障碍');
      }
    }
  }

  damage(reason) {
    if (this.invuln > 0 || !this.active) return;
    this.invuln = 1.7;
    this.game.flight.bump = 1;
    if (this.hasSlow) { this.hasSlow = false; this.slowTime = 0; this.game.toast('受击 · 失去缓时'); }
    else this.end(false, reason);
  }

  target() {
    return this.enemies.find(e => e.alive && e.engaged && e.s > this.s && e.s - this.s < 60 && Math.abs(this.x) < 12 && Math.abs(this.h - 1) < 8) || null;
  }

  updateBattle(dt) {
    const shotMat = new THREE.MeshBasicMaterial({ color: 0xff9c65 });
    for (const e of this.enemies) {
      if (!e.alive || this.s < e.gate - 45) continue;
      e.engaged = true; e.age = (e.age || 0) + dt;
      e.s = Math.min(this.length, this.s + 42);
      e.x = Math.sin(e.age * .8) * 6;
      e.h = 1 + Math.sin(e.age * 1.2) * 2;
      e.mesh.position.copy(this.point(e.s,e.x,e.h));
      const tangent=this.curve.getTangentAt(e.s/this.length);
      e.mesh.rotation.y=Math.atan2(tangent.x,-tangent.z);
      if(e.age > 9){e.alive=false;e.mesh.visible=false;this.game.toast('敌人撤离 · 继续前进');continue;}
      e.fire -= dt;
      if (e.fire <= 0) {
        e.fire = 1.5;
        const mesh = new THREE.Group();
        const core=new THREE.Mesh(new THREE.SphereGeometry(.55,16,12),shotMat);mesh.add(core);
        const halo=new THREE.Mesh(new THREE.TorusGeometry(.9,.1,8,24),new THREE.MeshBasicMaterial({color:0xffd094}));mesh.add(halo);
        const trail=new THREE.Mesh(new THREE.ConeGeometry(.5,4,12),new THREE.MeshBasicMaterial({color:0xe75c91,transparent:true,opacity:.6}));trail.rotation.x=Math.PI/2;trail.position.z=2;mesh.add(trail);
        mesh.position.copy(this.point(e.s - 4, this.x, this.h));
        this.group.add(mesh);
        this.bullets.push({ s: e.s - 4, x: this.x, h: this.h, mesh });
      }
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.s -= dt * 29;
      b.mesh.position.copy(this.point(b.s, b.x, b.h));
      if (Math.abs(b.s - this.s) < 2 && Math.abs(b.x - this.x) < 2.2 && Math.abs(b.h - this.h) < 2.2) this.damage('被敌方弹幕击中');
      if (b.s < this.s - 8 || !this.active) { this.group.remove(b.mesh); b.mesh.traverse(m=>{m.geometry?.dispose();}); this.bullets.splice(i, 1); }
    }
  }

  attack() {
    if (!this.active || this.paused || this.attackLeft > 0) return;
    this.attackLeft = CFG.attackCd;
    const enemy = this.target();
    if (enemy) {
      const hitPoint = enemy.mesh.position.clone();
      this.visuals.bolt(this.game.flight.pos.clone(), hitPoint, () => this.visuals.burst(hitPoint,0x9bf8ff));
      enemy.hp--;

      if (enemy.hp <= 0) { enemy.alive = false; enemy.mesh.visible = false; this.score += 250; this.game.toast('敌人清除 · 继续飞行'); }
      else this.game.toast('爆破命中 · 再来一次');
      this.updateHud();
      return;
    }
    const target = this.obstacles.find(o => !o.gone && o.s > this.s && o.s - this.s < 48 && Math.abs(o.x - this.x) < o.w / 2 + 3 && Math.abs(o.h - this.h) < o.ht / 2 + 3);
    if (target) {
      const hit=target.mesh.getWorldPosition(new THREE.Vector3());
      this.visuals.bolt(this.game.flight.pos.clone(),hit,()=>this.visuals.burst(hit));
      // Blast opens a complete, visible passage; removed masonry shares collision state.
      for(const o of this.obstacles) if(!o.gone && Math.abs(o.s-target.s)<1 && Math.abs(o.x-target.x)<4.5 && Math.abs(o.h-target.h)<5){o.gone=true;o.mesh.visible=false;}
      this.score+=50;this.game.toast('爆破命中 · 通路打开');
    }
    else this.game.toast('爆破 · 前方没有目标');
    this.updateHud();
  }

  slow() {
    if (!this.active || this.paused || !this.hasSlow || this.slowLeft > 0) return;
    this.slowLeft = CFG.slowCd; this.slowTime = CFG.slowDuration;
    this.game.toast('缓时启动'); this.updateHud();
  }

  togglePause() {
    if (!this.active) return;
    this.paused = !this.paused;
    this.game.paused = this.paused;
    this.game.input.keys.clear(); this.touch.clear();
    const modal = document.getElementById('chapterModal');
    modal.hidden = !this.paused;
    if (this.paused) { document.getElementById('chapterResult').textContent = '已暂停'; document.getElementById('chapterContinue').hidden = false; }
  }

  end(success, reason) {
    this.active = false; this.finished = true;
    this.game.paused = true; this.game.input.keys.clear(); this.touch.clear();
    const stage = this.stage();
    document.getElementById('chapterResult').textContent = `${success ? '第一章完成' : '本局结束'} · ${reason}\n抵达：${stage}  ·  得分：${this.score}`;
    document.getElementById('chapterContinue').hidden = true;
    document.getElementById('chapterModal').hidden = false;
    if (success) { try { localStorage.setItem('witch-flight-best', String(Math.max(this.score, Number(localStorage.getItem('witch-flight-best')) || 0))); } catch {} }
  }

  stage() {
    let i = 0;
    for (let j = 1; j < this.stageAt.length - 1; j++) if (this.s >= this.stageAt[j]) i = j;
    return STAGES[i];
  }

  updateHud() {
    document.getElementById('chapterStage').textContent = `花海海岸 · ${this.stage()}`;
    document.getElementById('chapterProgress').style.width = `${100 * this.s / this.length}%`;
    document.getElementById('chapterStats').textContent = `${Math.round(this.s)} m  ·  ${Math.round(this.speed * 3.6)} km/h  ·  ${this.score} 分`;
    document.getElementById('chapterAttack').textContent = this.attackLeft > 0 ? `爆破 ${this.attackLeft.toFixed(1)}` : '爆破 J';
    document.getElementById('chapterSlow').textContent = !this.hasSlow ? '缓时未获得' : this.slowTime > 0 ? `缓时 ${this.slowTime.toFixed(1)}` : this.slowLeft > 0 ? `缓时 ${this.slowLeft.toFixed(1)}` : '缓时 K';
    document.getElementById('chapterTarget').textContent = this.target() ? '◇ 目标可攻击' : '';
    this.el.classList.toggle('slow', this.slowTime > 0);
  }
}
