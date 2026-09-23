// ---------------------------------------------------------------------
// Effekte: Partikel, Tracer und Schadenszahlen aus Pools
// ---------------------------------------------------------------------
const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const particles = new Pool(() => {
  const m = new THREE.Mesh(particleGeo, lambert(0xffffff));
  m.visible = false;
  scene.add(m);
  return { mesh: m, vel: new THREE.Vector3(), life: 0, active: false, gravity: 1 };
}, CONFIG.effects.poolSize);
const activeParticles = [];

function spawnParticles(x, y, z, color, count, speed, gravity, life, glow) {
  for (let i = 0; i < count; i++) {
    const p = particles.get();
    if (!p) return;
    p.mesh.material = glow ? glowMat(color, 0.9) : lambert(color);
    p.mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4);
    p.vel.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed);
    p.life = (life || CONFIG.effects.particleLife) * (0.6 + Math.random() * 0.6);
    p.gravity = gravity === undefined ? 1 : gravity;
    p.mesh.scale.setScalar(1);
    p.mesh.visible = true; p.active = true;
    activeParticles.push(p);
  }
}

function updateParticles(dt) {
  const g = CONFIG.effects.particleGravity;
  for (const p of activeParticles) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; continue; }
    p.vel.y -= g * p.gravity * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += dt * 8; p.mesh.rotation.y += dt * 6;
    if (p.life < 0.2) p.mesh.scale.setScalar(p.life / 0.2);
  }
}

// Leuchtspuren (Tracer)
const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
tracerGeo.translate(0, 0, -0.5);
const tracers = new Pool(() => {
  const m = new THREE.Mesh(tracerGeo, glowMat(0xffe7a0, 0.85));
  m.visible = false;
  scene.add(m);
  return { mesh: m, life: 0, active: false };
}, CONFIG.effects.tracerPool);
const activeTracers = [];
const _tv = new THREE.Vector3();
function spawnTracer(x0, y0, z0, x1, y1, z1) {
  const t = tracers.get();
  if (!t) return;
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  if (len < 0.5) { tracers.release(t); return; }
  t.mesh.position.set(x0, y0, z0);
  _tv.set(x1, y1, z1);
  t.mesh.lookAt(_tv);
  t.mesh.scale.set(1, 1, len);
  t.mesh.visible = true; t.active = true; t.life = CONFIG.effects.tracerLife;
  activeTracers.push(t);
}
function updateTracers(dt) {
  for (const t of activeTracers) { if (!t.active) continue; t.life -= dt; if (t.life <= 0) t.active = false; }
}

const dmgLayer = $('dmgLayer');
const damageNumbers = new Pool(() => {
  const el = document.createElement('div');
  el.className = 'dmg'; el.style.display = 'none';
  dmgLayer.appendChild(el);
  return { el, x: 0, y: 0, z: 0, life: 0, active: false };
}, CONFIG.effects.damageNumberPool);
const activeDamageNumbers = [];

function showDamageNumber(x, y, z, value, kind) {
  const d = damageNumbers.get();
  if (!d) return;
  d.x = x + rand(-0.3, 0.3); d.y = y; d.z = z + rand(-0.3, 0.3); d.life = CONFIG.effects.damageNumberLife; d.active = true;
  d.el.textContent = Math.round(value);
  d.el.className = 'dmg ' + (kind || '');
  d.el.style.display = 'block';
  activeDamageNumbers.push(d);
}

function updateDamageNumbers(dt) {
  for (const d of activeDamageNumbers) {
    if (!d.active) continue;
    d.life -= dt;
    d.y += CONFIG.effects.damageNumberRise * dt;
    if (d.life <= 0) d.active = false;
  }
}

const _proj = new THREE.Vector3();
function renderDamageNumbers() {
  const w = window.innerWidth, h = window.innerHeight;
  for (const d of activeDamageNumbers) {
    if (!d.active) continue;
    _proj.set(d.x, d.y, d.z).project(camera);
    if (_proj.z > 1) { d.el.style.opacity = 0; continue; }
    const sx = (_proj.x * 0.5 + 0.5) * w, sy = (-_proj.y * 0.5 + 0.5) * h;
    d.el.style.opacity = Math.min(1, d.life / 0.3);
    d.el.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px) translate(-50%,-50%)';
  }
}

function cleanupEffects() {
  cleanupSprites();
  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    if (!p.active) { p.mesh.visible = false; activeParticles.splice(i, 1); particles.release(p); }
  }
  for (let i = activeTracers.length - 1; i >= 0; i--) {
    const t = activeTracers[i];
    if (!t.active) { t.mesh.visible = false; activeTracers.splice(i, 1); tracers.release(t); }
  }
  for (let i = activeDamageNumbers.length - 1; i >= 0; i--) {
    const d = activeDamageNumbers[i];
    if (!d.active) { d.el.style.display = 'none'; activeDamageNumbers.splice(i, 1); damageNumbers.release(d); }
  }
}

// ---------------------------------------------------------------------
// Audio (WebAudio, alles synthetisch – keine Dateien)
// ---------------------------------------------------------------------
let audioCtx = null, noiseBuffer = null, masterGain = null;
function initAudio() {
  if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = CONFIG.audio.volume;
  masterGain.connect(audioCtx.destination);
  noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.6, audioCtx.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

const TONE_PRESETS = {
  place: ['square', 420, 260, 0.07, 0.5],
  hit: ['triangle', 220, 120, 0.08, 1],
  hitmarker: ['square', 1400, 1200, 0.04, 0.35],
  head: ['triangle', 900, 600, 0.12, 0.9],
  break: ['sawtooth', 160, 50, 0.22, 0.7],
  swing: ['sine', 300, 180, 0.05, 0.3],
  deny: ['square', 140, 120, 0.08, 0.4],
  pickup: ['sine', 660, 990, 0.09, 0.5],
  chest: ['triangle', 520, 1040, 0.35, 0.7],
  heal: ['sine', 440, 880, 0.3, 0.5],
  reload: ['square', 300, 500, 0.06, 0.3],
  hurt: ['sawtooth', 200, 90, 0.15, 0.6],
  elim: ['triangle', 520, 1560, 0.4, 0.8],
  glider: ['sine', 200, 420, 0.25, 0.5],
  bus: ['sine', 180, 220, 0.4, 0.4],
};

function playTone(kind, vol) {
  const pr = TONE_PRESETS[kind];
  if (!audioCtx || !pr) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = pr[0];
  o.frequency.setValueAtTime(pr[1], t);
  o.frequency.exponentialRampToValueAtTime(pr[2], t + pr[3]);
  g.gain.setValueAtTime(Math.max(0.0001, pr[4] * vol), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + pr[3]);
  o.connect(g).connect(masterGain);
  o.start(t); o.stop(t + pr[3] + 0.02);
}

function listenerVolume(x, y, z) {
  const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
  if (d > CONFIG.audio.gunRange) return 0;
  return 1 / (1 + d / 18);
}
function sfx(kind) { playTone(kind, 1); }
function sfxAt(kind, x, y, z) { const v = listenerVolume(x, y, z); if (v > 0.02) playTone(kind, v); }

// Schuss: gefiltertes Rauschen mit kurzer Hüllkurve
const GUN_SOUND = { pistol: [2400, 0.12, 0.9], smg: [3000, 0.08, 0.7], ar: [1800, 0.14, 1.0], shotgun: [900, 0.3, 1.3], sniper: [700, 0.5, 1.5], pickaxe: [0, 0, 0] };
function sfxGun(type, x, y, z) {
  if (!audioCtx || !noiseBuffer) return;
  const v = listenerVolume(x, y, z);
  if (v < 0.02) return;
  const [freq, dur, vol] = GUN_SOUND[type] || GUN_SOUND.ar;
  const t = audioCtx.currentTime;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = audioCtx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(200, t + dur);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol * v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(masterGain);
  src.start(t); src.stop(t + dur + 0.02);
}
