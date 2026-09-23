// ---------------------------------------------------------------------
// Effekte 2: Sprites (Feuer, Rauch, Staub, Mündungsfeuer), Lichtblitz,
// Druckwelle, Kamera-Wackeln und explodierende Gaskanister
// ---------------------------------------------------------------------
function radialTexture(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function smokeTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const x = size / 2 + rand(-size * 0.2, size * 0.2), y = size / 2 + rand(-size * 0.2, size * 0.2), r = rand(size * 0.12, size * 0.3);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const FX_TEX = {
  glow: radialTexture(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]),
  flash: radialTexture(64, [[0, 'rgba(255,255,240,1)'], [0.15, 'rgba(255,230,160,0.95)'], [0.5, 'rgba(255,150,40,0.35)'], [1, 'rgba(255,120,0,0)']]),
  smoke: smokeTexture(128),
};

const sprites = new Pool(() => {
  const mat = new THREE.SpriteMaterial({ map: FX_TEX.glow, transparent: true, depthWrite: false, fog: true });
  const s = new THREE.Sprite(mat);
  s.visible = false;
  scene.add(s);
  return { s, mat, life: 0, max: 1, vel: new THREE.Vector3(), size0: 1, size1: 1, a0: 1, a1: 0, grav: 0, drag: 0, spin: 0, c0: new THREE.Color(), c1: new THREE.Color(), active: false };
}, 160);
const activeSprites = [];

// o: { tex, add, color, color2, size, size2, life, alpha, alpha2, vx,vy,vz, grav, drag, spin }
function spawnSprite(x, y, z, o) {
  const p = sprites.get();
  if (!p) return null;
  p.mat.map = FX_TEX[o.tex || 'glow'];
  p.mat.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
  p.mat.rotation = Math.random() * Math.PI * 2;
  p.s.position.set(x, y, z);
  p.vel.set(o.vx || 0, o.vy || 0, o.vz || 0);
  p.life = p.max = o.life || 1;
  p.size0 = o.size || 1; p.size1 = o.size2 !== undefined ? o.size2 : p.size0;
  p.a0 = o.alpha !== undefined ? o.alpha : 1; p.a1 = o.alpha2 !== undefined ? o.alpha2 : 0;
  p.c0.setHex(o.color || 0xffffff); p.c1.setHex(o.color2 !== undefined ? o.color2 : (o.color || 0xffffff));
  if (o.bright) { p.c0.multiplyScalar(o.bright); p.c1.multiplyScalar(o.bright); }
  p.grav = o.grav || 0; p.drag = o.drag || 0; p.spin = o.spin || 0;
  p.s.visible = true; p.active = true;
  p.s.renderOrder = o.add ? 7 : 6;
  activeSprites.push(p);
  return p;
}

function updateSprites(dt) {
  for (const p of activeSprites) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; continue; }
    const k = 1 - p.life / p.max;
    p.vel.y -= p.grav * dt;
    if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
    p.s.position.addScaledVector(p.vel, dt);
    const sz = lerp(p.size0, p.size1, 1 - Math.pow(1 - k, 2));
    p.s.scale.set(sz, sz, 1);
    p.mat.opacity = lerp(p.a0, p.a1, k);
    p.mat.color.copy(p.c0).lerp(p.c1, k);
    p.mat.rotation += p.spin * dt;
  }
}

function cleanupSprites() {
  for (let i = activeSprites.length - 1; i >= 0; i--) {
    const p = activeSprites[i];
    if (!p.active) { p.s.visible = false; activeSprites.splice(i, 1); sprites.release(p); }
  }
}

// Ein Punktlicht für Mündungsfeuer/Explosionen (immer in der Szene → keine Shader-Neukompilierung)
const flashLight = new THREE.PointLight(0xffb870, 0, 14, 2);
scene.add(flashLight);
let flashT = 0, flashMax = 0;
function lightFlash(x, y, z, intensity, dist, dur) {
  const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
  if (d > 60 && intensity < 30) return;
  if (flashT > 0 && flashMax > intensity) return;
  flashLight.position.set(x, y, z);
  flashLight.distance = dist;
  flashMax = intensity; flashT = dur; flashLight.userData.dur = dur;
  flashLight.intensity = intensity;
}
function updateFlash(dt) {
  if (flashT <= 0) { flashLight.intensity = 0; return; }
  flashT -= dt;
  flashLight.intensity = Math.max(0, flashMax * (flashT / flashLight.userData.dur));
}

// Kamera-Wackeln
let camShake = 0;
function addShake(x, y, z, strength, radius) {
  const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
  if (d > radius) return;
  camShake = Math.max(camShake, strength * (1 - d / radius));
}

// Mündungsfeuer + etwas Rauch
function muzzleFlash(x, y, z, big) {
  spawnSprite(x, y, z, { tex: 'flash', add: true, color: 0xffe2a0, bright: 3, size: big ? 0.9 : 0.55, size2: big ? 1.3 : 0.8, life: 0.05, alpha: 1, alpha2: 0.2 });
  spawnSprite(x, y + 0.05, z, { tex: 'smoke', color: 0xcfcfcf, size: 0.3, size2: 0.9, life: 0.6, alpha: 0.25, alpha2: 0, vy: 0.6, drag: 1 });
  lightFlash(x, y, z, big ? 6 : 3.5, big ? 12 : 8, 0.06);
}

// Einschlag: Staub/Splitter je nach Material
function impactFx(x, y, z, kind) {
  if (kind === 'terrain') spawnSprite(x, y + 0.1, z, { tex: 'smoke', color: 0xa08a64, size: 0.3, size2: 1.4, life: 0.9, alpha: 0.55, alpha2: 0, vy: 0.8, drag: 1.5 });
  else if (kind === 'wood') spawnSprite(x, y, z, { tex: 'smoke', color: 0xc9a27a, size: 0.25, size2: 1.1, life: 0.7, alpha: 0.45, alpha2: 0, vy: 0.4, drag: 1.5 });
  else spawnSprite(x, y, z, { tex: 'smoke', color: 0xb8b8b8, size: 0.25, size2: 1.0, life: 0.7, alpha: 0.4, alpha2: 0, vy: 0.4, drag: 1.5 });
  spawnSprite(x, y, z, { tex: 'glow', add: true, color: 0xffd9a0, bright: 2, size: 0.25, size2: 0.05, life: 0.08 });
}

// Staubwolke bei zerstörten Bauteilen
function dustCloud(x, y, z, color, n, size) {
  for (let i = 0; i < n; i++) {
    spawnSprite(x + rand(-1.5, 1.5), y + rand(-1, 1), z + rand(-1.5, 1.5), { tex: 'smoke', color, size: size * 0.6, size2: size * 1.8, life: rand(1.2, 2), alpha: 0.5, alpha2: 0, vx: rand(-1, 1), vy: rand(0.2, 1), vz: rand(-1, 1), drag: 1.2, spin: rand(-0.5, 0.5) });
  }
}

// Druckwellen-Ring
const shockGeo = new THREE.RingGeometry(0.85, 1, 40);
shockGeo.rotateX(-Math.PI / 2);
const shocks = [];
function shockwave(x, y, z, radius) {
  const m = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.position.set(x, y + 0.2, z);
  m.userData = { t: 0, r: radius, unique: true };
  scene.add(m);
  shocks.push(m);
}
function updateShocks(dt) {
  for (let i = shocks.length - 1; i >= 0; i--) {
    const m = shocks[i];
    m.userData.t += dt;
    const k = m.userData.t / 0.45;
    if (k >= 1) { scene.remove(m); m.material.dispose(); shocks.splice(i, 1); continue; }
    const s = 0.5 + m.userData.r * (1 - Math.pow(1 - k, 3));
    m.scale.set(s, 1, s);
    m.material.opacity = 0.45 * (1 - k);
  }
}

// Explosion: Feuerball, Rauchsäule, Funken, Druckwelle, Licht, Wackeln, Knall, Schaden
function explosion(x, y, z, radius, damage, attacker) {
  for (let i = 0; i < 9; i++) {
    spawnSprite(x + rand(-0.6, 0.6), y + rand(0, 0.8), z + rand(-0.6, 0.6), { tex: 'flash', add: true, color: 0xffe7a8, color2: 0xff5a1a, bright: 3.5, size: rand(0.8, 1.6), size2: rand(3.5, 5.5), life: rand(0.35, 0.6), alpha: 1, alpha2: 0, vx: rand(-3, 3), vy: rand(1, 5), vz: rand(-3, 3), drag: 3, spin: rand(-2, 2) });
  }
  for (let i = 0; i < 12; i++) {
    spawnSprite(x + rand(-1, 1), y + rand(0.5, 1.5), z + rand(-1, 1), { tex: 'smoke', color: 0x3a3632, color2: 0x8a8580, size: rand(1.5, 2.5), size2: rand(6, 9), life: rand(2.5, 4), alpha: 0.75, alpha2: 0, vx: rand(-1.5, 1.5), vy: rand(1.5, 3.5), vz: rand(-1.5, 1.5), drag: 0.6, spin: rand(-0.4, 0.4) });
  }
  spawnParticles(x, y + 0.5, z, 0xffb040, 26, 14, 0.8, 1.1, true);
  spawnParticles(x, y + 0.5, z, 0x3a3a3a, 12, 9, 1, 1.4);
  shockwave(x, y, z, radius * 0.9);
  lightFlash(x, y + 1.5, z, 40, 45, 0.5);
  addShake(x, y, z, 1.0, 45);
  sfxExplosion(x, y, z);
  // Schaden an Figuren (Deckung blockiert)
  for (const a of actors) {
    if (!a.alive || a.phase === 'bus') continue;
    const cy = a.pos.y + a.height * 0.5;
    const d = Math.hypot(a.pos.x - x, cy - y, a.pos.z - z);
    if (d > radius) continue;
    if (!lineOfSight(x, y + 0.6, z, a.pos.x, cy, a.pos.z, null, a)) continue;
    applyDamage(a, damage * lerp(1, 0.25, d / radius), attacker, 'explosion', 'body', a.pos.x, a.pos.y + 1.4, a.pos.z);
  }
  // Schaden an Bauteilen
  qMin[0] = x - radius; qMin[1] = y - radius; qMin[2] = z - radius;
  qMax[0] = x + radius; qMax[1] = y + radius; qMax[2] = z + radius;
  const hitParts = new Set();
  for (const c of grid.query(qMin, qMax, [])) {
    if (c.owner && c.owner.gridBox) hitParts.add(c.owner);
    if (c.owner && c.owner.barrel && c.owner.alive) {
      const b = c.owner;
      const d = Math.hypot(b.pos.x - x, b.pos.z - z);
      if (d > 0.1 && d < radius) b.fuse = b.fuse > 0 ? Math.min(b.fuse, 0.15) : 0.15;
    }
  }
  for (const p of hitParts) {
    partCenter(p, _pc);
    const d = Math.hypot(_pc.x - x, _pc.y - y, _pc.z - z);
    if (d < radius + 2) damagePart(p, 250 * lerp(1, 0.3, clamp(d / (radius + 2), 0, 1)), _pc.x, _pc.y, _pc.z, attacker === player);
  }
}

function sfxExplosion(x, y, z) {
  if (!audioCtx || !noiseBuffer) return;
  const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
  const v = 1.6 / (1 + d / 30);
  if (v < 0.03) return;
  const t = audioCtx.currentTime;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer; src.loop = true;
  const f = audioCtx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(60, t + 1.3);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  src.connect(f).connect(g).connect(masterGain);
  src.start(t); src.stop(t + 1.45);
  const o = audioCtx.createOscillator(), og = audioCtx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
  og.gain.setValueAtTime(v * 0.8, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  o.connect(og).connect(masterGain); o.start(t); o.stop(t + 0.75);
}

// ---------------------------------------------------------------------
// Gaskanister: explodieren bei Beschuss (Kettenreaktion möglich)
// ---------------------------------------------------------------------
const barrels = [];
const BARREL = { hp: 50, radius: 7, damage: 95, count: 34 };
function barrelGeometry() {
  return modelGeometry('barrel', () => [
    { cyl: true, sx: 0.55, sy: 0.85, sz: 0.55, y: 0.43, c: 0xc0281e },
    { cyl: true, sx: 0.57, sy: 0.05, sz: 0.57, y: 0.2, c: 0x8a1a14 },
    { cyl: true, sx: 0.57, sy: 0.05, sz: 0.57, y: 0.66, c: 0x8a1a14 },
    { sx: 0.3, sy: 0.18, sz: 0.02, y: 0.45, z: -0.28, c: 0xffd23f },
    { cyl: true, sx: 0.14, sy: 0.12, sz: 0.14, x: 0.12, y: 0.9, c: 0x2d3238 },
    { sx: 0.25, sy: 0.04, sz: 0.06, y: 0.9, x: -0.08, c: 0x2d3238 },
  ]);
}

function spawnBarrels(rnd) {
  let placed = 0;
  for (let t = 0; t < 600 && placed < BARREL.count; t++) {
    let x, z;
    if (houses.length && rnd() < 0.7) {
      const hs = houses[Math.floor(rnd() * houses.length)];
      const side = Math.floor(rnd() * 4);
      const along = rnd() - 0.5;
      x = hs.x + (side === 1 ? hs.w / 2 + 0.8 : side === 3 ? -hs.w / 2 - 0.8 : along * hs.w);
      z = hs.z + (side === 2 ? hs.d / 2 + 0.8 : side === 0 ? -hs.d / 2 - 0.8 : along * hs.d);
    } else {
      x = (rnd() * 2 - 1) * HALF * 0.75; z = (rnd() * 2 - 1) * HALF * 0.75;
    }
    const h = getHeight(x, z);
    if (h < W.waterLevel + 0.8 || getNormal(x, z).y < 0.85) continue;
    qMin[0] = x - 0.6; qMin[1] = h; qMin[2] = z - 0.6; qMax[0] = x + 0.6; qMax[1] = h + 1.2; qMax[2] = z + 0.6;
    if (grid.query(qMin, qMax, qList).length) continue;
    const m = new THREE.Mesh(barrelGeometry(), vcMat);
    m.position.set(x, h - 0.02, z); m.rotation.y = rnd() * Math.PI * 2;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    const b = { barrel: true, pos: new THREE.Vector3(x, h, z), hp: BARREL.hp, alive: true, mesh: m, collider: null, fuse: 0, lastAttacker: null };
    b.collider = makeCollider('box', x - 0.28, h, z - 0.28, x + 0.28, h + 0.95, z + 0.28, b);
    grid.insert(b.collider);
    barrels.push(b);
    placed++;
  }
}

function damageBarrel(b, dmg, attacker) {
  if (!b.alive) return;
  b.hp -= dmg;
  b.lastAttacker = attacker;
  spawnSprite(b.pos.x, b.pos.y + 0.9, b.pos.z, { tex: 'smoke', color: 0xdddddd, size: 0.3, size2: 1.2, life: 0.8, alpha: 0.5, alpha2: 0, vy: 1.5 });
  if (b.hp <= 0) b.fuse = 0.001;
}

function explodeBarrel(b) {
  if (!b.alive) return;
  b.alive = false;
  grid.remove(b.collider);
  trash.push(b.mesh);
  explosion(b.pos.x, b.pos.y + 0.5, b.pos.z, BARREL.radius, BARREL.damage, b.lastAttacker);
}

function updateBarrels(dt) {
  for (const b of barrels) {
    if (!b.alive || b.fuse <= 0) continue;
    b.fuse -= dt;
    if (b.fuse <= 0) explodeBarrel(b);
  }
}

function updateFx(dt) {
  updateSprites(dt);
  updateShocks(dt);
  updateFlash(dt);
  updateBarrels(dt);
  camShake = Math.max(0, camShake - dt * 2.2);
}
