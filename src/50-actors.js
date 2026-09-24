// ---------------------------------------------------------------------
// Figuren (Spieler + Bots): Modell, Zustand, Schaden, Eliminierung
// ---------------------------------------------------------------------
const SKIN_TONES = [0xf1c9a5, 0xe0ac86, 0xc68c63, 0x8d5a3b, 0xf5d7bd];
const SHIRTS = [0xd94f4f, 0x4fa3d9, 0x4fd97a, 0xd9c14f, 0x9b59d9, 0xff8a3d, 0x2ec4b6, 0xe84393, 0x6c5ce7, 0x00b894];
const PANTS = [0x2b2f3a, 0x3d4a5c, 0x5a4632, 0x1e3a5f, 0x4a4a4a];
const HAIRS = [0x3b2a1a, 0x1a1a1a, 0xc9a13b, 0x8a3b1a, 0xe0e0e0, 0x5a3b8a];

const gliderGeo = new THREE.SphereGeometry(1.7, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
const lineGeo = new THREE.CylinderGeometry(0.015, 0.015, 1, 4);
lineGeo.translate(0, 0.5, 0);

// Modell und Animation: siehe 52-character.js

let actorIdCounter = 0;
function createActor(opts) {
  const P = CONFIG.player;
  const a = {
    id: ++actorIdCounter, name: opts.name, isPlayer: !!opts.isPlayer, isBot: !opts.isPlayer,
    pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(),
    yaw: 0, pitch: 0, radius: P.radius, height: P.height, crouching: false,
    onGround: false, wasGrounded: false, groundCollider: null, inWater: false, blocked: false, blockCollider: null,
    alive: true, hp: P.maxHp, shield: 0, phase: 'bus',
    inv: { slots: new Array(CONFIG.loot.slots).fill(null), sel: -1, ammo: { leicht: 0, mittel: 0, schwer: 0, schrot: 0 }, mats: CONFIG.build.startMaterials },
    fireCooldown: 0, reloadTimer: 0, reloadTotal: 0, healTimer: 0, healTotal: 0, swing: 0, ads: false, burstShots: 0,
    walkPhase: 0, kills: 0, lastDamageTime: -99, lastAttacker: null, deathTime: 0, deathDir: 0,
    noFallDamage: false, glideOpenTime: 0, jumpTime: 0,
    model: createCharacterMesh(opts.outfit || randomOutfit()), collider: null,
    cmd: { mx: 0, mz: 0, sprint: false, jump: false, crouch: false },
    ai: null, placement: 0, recoil: 0,
  };
  a.collider = makeCollider('actor', 0, 0, 0, 0, 0, 0, a);
  a.model.group.visible = false;
  scene.add(a.model.group);
  actors.push(a);
  return a;
}

function aliveActors() { let n = 0; for (const a of actors) if (a.alive) n++; return n; }

function actorEye(a, out) {
  out.x = a.pos.x; out.y = a.pos.y + a.height - CONFIG.player.eyeFromTop; out.z = a.pos.z;
  return out;
}

function currentItem(a) { return a.inv.sel >= 0 ? a.inv.slots[a.inv.sel] : null; }

// Schaden: Schild zuerst (außer Sturm und Fallschaden)
function applyDamage(target, amount, attacker, source, zone, hx, hy, hz) {
  if (!target.alive || target.phase === 'bus' || amount <= 0) return;
  let rem = amount, shieldHit = false;
  if (source !== 'storm' && source !== 'fall') {
    const s = Math.min(target.shield, rem);
    if (s > 0) { target.shield -= s; rem -= s; shieldHit = true; }
  }
  target.hp -= rem;
  target.lastDamageTime = gameTime;
  if (attacker && attacker !== target) target.lastAttacker = attacker;
  if (attacker === player && target !== player && hx !== undefined) {
    showDamageNumber(hx, hy, hz, amount, zone === 'head' ? 'head' : shieldHit ? 'shield' : '');
    hitmarker(zone === 'head');
  }
  if (target === player) onPlayerDamaged(amount, attacker, source);
  if (target.hp <= 0) eliminate(target, attacker, source);
}

function eliminate(a, killer, source) {
  if (!a.alive) return;
  a.alive = false;
  a.hp = 0;
  a.phase = 'dead';
  a.deathTime = gameTime;
  a.deathDir = killer && killer !== a ? Math.atan2(a.pos.x - killer.pos.x, a.pos.z - killer.pos.z) : a.yaw;
  a.placement = aliveActors() + 1;
  grid.remove(a.collider);
  a.healTimer = 0; a.reloadTimer = 0;
  dropInventory(a);
  let text;
  if (killer && killer !== a) {
    killer.kills++;
    const item = currentItem(killer);
    const how = item && item.kind === 'weapon' ? CONFIG.weapons[item.type].name : 'Spitzhacke';
    text = killer.name + ' ⟶ ' + a.name + ' (' + how + ')';
    if (killer === player) { sfx('elim'); toast('Eliminiert: ' + a.name); }
  } else {
    text = a.name + (source === 'storm' ? ' ist im Sturm untergegangen' : source === 'fall' ? ' ist zu tief gefallen' : ' wurde eliminiert');
  }
  addKillFeed(text, a === player || killer === player);
  spawnParticles(a.pos.x, a.pos.y + 1, a.pos.z, 0xffffff, 14, 4, 0.3, 1.0, true);
  onElimination(a, killer);
}

// Bewegung aus Befehl (lokale Richtung mx/mz relativ zum Blick)
function updateActorMovement(a, c, dt) {
  const P = CONFIG.player;
  if (c.crouch && !a.crouching) { a.crouching = true; a.height = P.crouchHeight; }
  else if (!c.crouch && a.crouching && canStand(a, P.height)) { a.crouching = false; a.height = P.height; }
  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  const wx = c.mx * cos + c.mz * sin;
  const wz = -c.mx * sin + c.mz * cos;
  let speed = a.crouching ? P.crouchSpeed : (c.sprint && c.mz < 0 && !a.ads ? P.sprintSpeed : P.walkSpeed);
  if (a.ads) speed *= P.adsSpeedFactor;
  if (a.healTimer > 0) speed *= P.healSpeedFactor;
  if (a.inWater) speed *= P.waterSpeedFactor;
  const tx = wx * speed, tz = wz * speed;
  const accel = (a.onGround ? P.groundAccel : P.airAccel) * dt;
  const dvx = tx - a.vel.x, dvz = tz - a.vel.z;
  const dl = Math.hypot(dvx, dvz);
  if (dl <= accel) { a.vel.x = tx; a.vel.z = tz; }
  else { a.vel.x += dvx / dl * accel; a.vel.z += dvz / dl * accel; }
  let jumped = false;
  if (c.jump && a.onGround) {
    if (a.crouching && canStand(a, P.height)) { a.crouching = false; a.height = P.height; }
    a.vel.y = P.jumpSpeed; a.onGround = false; jumped = true;
  }
  a.vel.y = Math.max(-P.maxFallSpeed, a.vel.y - P.gravity * dt);
  a.walkPhase += Math.hypot(a.vel.x, a.vel.z) * dt * 2.2;
  return jumped;
}

// Bodenbewegung inkl. Fallschaden
function groundPhysics(a, dt, jumped) {
  const vyBefore = a.vel.y;
  physicsStep(a, dt, jumped);
  if (a.onGround && !a.wasGrounded) {
    const P = CONFIG.player;
    if (!a.noFallDamage && vyBefore < -P.fallSafeSpeed) {
      applyDamage(a, Math.round((-vyBefore - P.fallSafeSpeed) * P.fallDamagePerMs), null, 'fall');
    }
    a.noFallDamage = false;
  }
}

// Gehaltenes Modell (Waffe/Spitzhacke/Heilung) in der rechten Hand
function updateHeldModel(a) {
  const it = currentItem(a);
  const key = it ? it.kind + ':' + (it.type || '') + ':' + (it.rarity || 0) : 'pickaxe';
  const m = a.model;
  if (m.heldKey === key) return;
  if (m.held) m.hand.remove(m.held);
  m.held = it ? itemModel(it, !m.real) : pickaxeModel();
  if (m.real && !it) m.held.rotation.set(0, 0, 0);
  m.hand.add(m.held);
  m.heldKey = key;
}
