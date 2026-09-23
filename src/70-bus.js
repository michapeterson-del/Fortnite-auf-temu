// ---------------------------------------------------------------------
// Battle Bus: fliegt einmal quer über die Insel, dann Freifall + Gleiter
// ---------------------------------------------------------------------
const bus = {
  active: false, t: 0, duration: 0,
  sx: 0, sz: 0, ex: 0, ez: 0, dx: 0, dz: 0, yaw: 0,
  pos: new THREE.Vector3(), prev: new THREE.Vector3(), mesh: null, balloon: null,
};

function buildBusMesh() {
  const g = new THREE.Group();
  const body = modelGeometry('bus', () => [
    { sx: 3, sy: 2.6, sz: 8.5, y: 1.9, c: 0x2f7fe0 },
    { sx: 3.02, sy: 0.9, sz: 7.4, y: 2.5, z: 0.3, c: 0x1c2b44 },
    { sx: 3.04, sy: 0.25, sz: 8.52, y: 0.75, c: 0xe8e8e8 },
    { sx: 2.4, sy: 1.0, sz: 0.1, y: 2.5, z: -4.26, c: 0x9fd4ff },
    { sx: 3.1, sy: 0.3, sz: 8.6, y: 3.3, c: 0xffd23f },
    { sx: 1.2, sy: 0.3, sz: 0.3, x: 0, y: 1.2, z: -4.3, c: 0xd9d9d9 },
    { cyl: true, sx: 1, sy: 0.4, sz: 1, x: -1.45, y: 0.55, z: -2.8, rz: Math.PI / 2, c: 0x1b1e22 },
    { cyl: true, sx: 1, sy: 0.4, sz: 1, x: 1.45, y: 0.55, z: -2.8, rz: Math.PI / 2, c: 0x1b1e22 },
    { cyl: true, sx: 1, sy: 0.4, sz: 1, x: -1.45, y: 0.55, z: 2.8, rz: Math.PI / 2, c: 0x1b1e22 },
    { cyl: true, sx: 1, sy: 0.4, sz: 1, x: 1.45, y: 0.55, z: 2.8, rz: Math.PI / 2, c: 0x1b1e22 },
    { sx: 0.3, sy: 0.3, sz: 0.1, x: -1.1, y: 1.3, z: -4.3, c: 0xfff3b0 },
    { sx: 0.3, sy: 0.3, sz: 0.1, x: 1.1, y: 1.3, z: -4.3, c: 0xfff3b0 },
  ]);
  const bm = new THREE.Mesh(body, vcMat);
  bm.castShadow = true;
  g.add(bm);
  // Heißluftballon
  const balloonGeo = new THREE.SphereGeometry(5.5, 16, 12);
  const cols = [], c = new THREE.Color();
  const pos = balloonGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ang = Math.atan2(pos.getZ(i), pos.getX(i));
    const stripe = Math.floor((ang + Math.PI) / (Math.PI * 2) * 8) % 2;
    c.setHex(stripe ? 0xff4d6d : 0xfff3f3);
    cols.push(c.r, c.g, c.b);
  }
  balloonGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const balloon = new THREE.Mesh(balloonGeo, vcMat);
  balloon.scale.set(1, 1.2, 1);
  balloon.position.y = 13;
  g.add(balloon);
  const rope = lambert(0x5a4632);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(lineGeo, rope);
    l.position.set(sx * 1.4, 3.4, sz * 3.5);
    const tx = sx * 3.6, tz = sz * 2.2, ty = 9.5;
    const dx = tx - sx * 1.4, dy = ty - 3.4, dz = tz - sz * 3.5;
    const len = Math.hypot(dx, dy, dz);
    l.scale.set(1.5, len, 1.5);
    l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    g.add(l);
  }
  g.visible = false;
  scene.add(g);
  bus.mesh = g; bus.balloon = balloon;
}

function initBus() {
  const M = CONFIG.match;
  const ang = Math.random() * Math.PI * 2;
  const off = rand(-0.25, 0.25) * HALF;
  const R = HALF * M.busEdge;
  const px = -Math.sin(ang) * off, pz = Math.cos(ang) * off;
  bus.dx = Math.cos(ang); bus.dz = Math.sin(ang);
  bus.sx = px - bus.dx * R; bus.sz = pz - bus.dz * R;
  bus.ex = px + bus.dx * R; bus.ez = pz + bus.dz * R;
  bus.duration = (2 * R) / M.busSpeed;
  bus.t = 0;
  bus.yaw = Math.atan2(-bus.dx, -bus.dz);
  bus.active = true;
  bus.pos.set(bus.sx, M.busHeight, bus.sz);
  bus.prev.copy(bus.pos);
  if (!bus.mesh) buildBusMesh();
  bus.mesh.visible = true;
  for (const a of actors) {
    a.phase = 'bus';
    a.pos.copy(bus.pos); a.prev.copy(bus.pos);
    grid.remove(a.collider);
  }
  sfx('bus');
}

function busProgress() { return bus.duration > 0 ? bus.t / bus.duration : 1; }

function updateBus(dt) {
  if (!bus.active) return;
  bus.prev.copy(bus.pos);
  bus.t += dt;
  const k = Math.min(1, bus.t / bus.duration);
  bus.pos.set(lerp(bus.sx, bus.ex, k), CONFIG.match.busHeight + Math.sin(bus.t * 0.8) * 0.6, lerp(bus.sz, bus.ez, k));
  for (const a of actors) if (a.phase === 'bus') { a.prev.copy(a.pos); a.pos.copy(bus.pos); }
  if (k >= 1) {
    for (const a of actors) if (a.phase === 'bus' && a.alive) jumpFromBus(a);
    bus.active = false;
    bus.mesh.visible = false;
    if (player && player.phase !== 'bus') announce('Alle sind aus dem Bus!');
  }
}

function canJumpFromBus() { return bus.active && bus.t > CONFIG.match.busDoorDelay; }

function jumpFromBus(a) {
  if (a.phase !== 'bus') return;
  a.phase = 'freefall';
  a.pos.set(bus.pos.x, bus.pos.y - 3, bus.pos.z);
  a.prev.copy(a.pos);
  a.vel.set(bus.dx * 8, -5, bus.dz * 8);
  a.onGround = false; a.wasGrounded = false;
  a.jumpTime = gameTime;
  updateActorCollider(a);
  grid.insert(a.collider);
  updateActorCollider(a);
  if (a === player) { sfx('glider'); announce('Leertaste / Sprung: Gleiter öffnen'); }
}

function openGlider(a) {
  if (a.phase !== 'freefall') return;
  a.phase = 'glide';
  a.glideOpenTime = gameTime;
  if (a === player) sfx('glider');
}

// Freifall und Gleiten: Steuerung mit lokaler Richtung (wie am Boden)
function updateAirborne(a, c, dt) {
  const M = CONFIG.match;
  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  const wx = c.mx * cos + c.mz * sin, wz = -c.mx * sin + c.mz * cos;
  const heightAbove = a.pos.y - getHeight(a.pos.x, a.pos.z);
  let targetVy, steer;
  if (a.phase === 'freefall') {
    const dive = c.mz < -0.5 && a.pitch < -0.6;
    targetVy = -(dive ? M.diveSpeed : M.freefallSpeed);
    steer = M.freefallSteer;
    if (heightAbove < M.autoGlideHeight || (c.jump && gameTime - a.jumpTime > 0.8 && heightAbove > M.minGlideHeight)) openGlider(a);
  } else {
    targetVy = -M.glideFall;
    steer = M.glideSpeed;
  }
  const acc = M.freefallAccel * dt;
  const tx = wx * steer, tz = wz * steer;
  a.vel.x += clamp(tx - a.vel.x, -acc, acc);
  a.vel.z += clamp(tz - a.vel.z, -acc, acc);
  a.vel.y += clamp(targetVy - a.vel.y, -acc * 1.5, acc * 1.5);
  physicsStep(a, dt, false);
  if (a.onGround) {
    a.phase = 'ground';
    a.noFallDamage = true;
    a.vel.y = 0;
    if (a === player) announce('Gelandet! Such dir Waffen und Truhen.');
  }
}

function renderBus(alpha) {
  if (!bus.mesh || !bus.mesh.visible) return;
  bus.mesh.position.lerpVectors(bus.prev, bus.pos, alpha);
  bus.mesh.rotation.y = bus.yaw;
  bus.balloon.rotation.y = gameTime * 0.2;
}
