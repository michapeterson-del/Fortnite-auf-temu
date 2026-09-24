// ---------------------------------------------------------------------
// Gegenstände: Modelle (eine Geometrie pro Modell, Vertexfarben, geteilt)
// ---------------------------------------------------------------------
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35, envMapIntensity: 0.9 });
const modelCache = new Map();
const _mm = new THREE.Matrix4(), _mq = new THREE.Quaternion(), _me = new THREE.Euler(), _ms = new THREE.Vector3(), _mp = new THREE.Vector3(), _mc = new THREE.Color();
const unitBoxNI = unitBox.toNonIndexed();
const unitCylNI = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).toNonIndexed();

function buildModel(parts) {
  const pos = [], nor = [], col = [];
  for (const p of parts) {
    const src = p.cyl ? unitCylNI : unitBoxNI;
    _me.set(p.rx || 0, p.ry || 0, p.rz || 0);
    _mq.setFromEuler(_me);
    _mm.compose(_mp.set(p.x || 0, p.y || 0, p.z || 0), _mq, _ms.set(p.sx, p.sy, p.sz));
    const g = src.clone();
    g.applyMatrix4(_mm);
    _mc.setHex(p.c);
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i += 3) {
      pos.push(pa[i], pa[i + 1], pa[i + 2]); nor.push(na[i], na[i + 1], na[i + 2]); col.push(_mc.r, _mc.g, _mc.b);
    }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

const GUN = 0x2d3238, GUN2 = 0x1b1e22, WOOD = 0x8a5a33, STEEL = 0x9aa6b2;
// Alle Modelle: Griff im Ursprung, Lauf zeigt nach -z
function weaponParts(type, rarityColor) {
  const P = [];
  const b = (sx, sy, sz, x, y, z, c, rx) => P.push({ sx, sy, sz, x, y, z, c, rx });
  const cyl = (r, len, x, y, z, c) => P.push({ cyl: true, sx: r * 2, sy: len, sz: r * 2, x, y, z, c, rx: Math.PI / 2 });
  if (type === 'pistol') {
    b(0.06, 0.1, 0.26, 0, 0.07, -0.08, GUN); b(0.05, 0.15, 0.07, 0, -0.03, 0.02, GUN2, 0.25);
    cyl(0.018, 0.08, 0, 0.08, -0.24, GUN2); b(0.062, 0.02, 0.2, 0, 0.12, -0.08, rarityColor);
  } else if (type === 'smg') {
    b(0.07, 0.12, 0.42, 0, 0.07, -0.14, GUN); b(0.05, 0.2, 0.06, 0, -0.08, -0.12, GUN2);
    b(0.05, 0.14, 0.06, 0, -0.03, 0.03, GUN2, 0.2); b(0.04, 0.05, 0.2, 0, 0.06, 0.15, GUN2);
    cyl(0.02, 0.12, 0, 0.08, -0.4, GUN2); b(0.072, 0.025, 0.3, 0, 0.14, -0.14, rarityColor);
  } else if (type === 'ar') {
    b(0.07, 0.12, 0.62, 0, 0.07, -0.2, GUN); cyl(0.022, 0.3, 0, 0.08, -0.65, GUN2);
    b(0.05, 0.22, 0.08, 0, -0.08, -0.2, GUN2, -0.25); b(0.05, 0.14, 0.06, 0, -0.03, 0.03, GUN2, 0.2);
    b(0.06, 0.14, 0.26, 0, 0.05, 0.23, GUN2); b(0.03, 0.05, 0.12, 0, 0.16, -0.2, GUN2);
    b(0.072, 0.025, 0.42, 0, 0.12, -0.22, rarityColor);
  } else if (type === 'shotgun') {
    b(0.09, 0.12, 0.5, 0, 0.07, -0.1, GUN); cyl(0.035, 0.5, 0, 0.1, -0.55, GUN2);
    b(0.075, 0.07, 0.22, 0, 0.02, -0.5, WOOD); b(0.07, 0.16, 0.3, 0, 0.02, 0.26, WOOD, -0.15);
    b(0.05, 0.14, 0.06, 0, -0.03, 0.03, GUN2, 0.2); b(0.092, 0.025, 0.36, 0, 0.14, -0.1, rarityColor);
  } else if (type === 'sniper') {
    b(0.07, 0.1, 0.72, 0, 0.07, -0.18, GUN); cyl(0.02, 0.55, 0, 0.08, -0.8, GUN2);
    cyl(0.04, 0.36, 0, 0.19, -0.15, GUN2); b(0.03, 0.05, 0.04, 0, 0.14, -0.15, GUN2);
    b(0.06, 0.16, 0.3, 0, 0.03, 0.3, WOOD, -0.1); b(0.05, 0.14, 0.06, 0, -0.03, 0.03, GUN2, 0.2);
    b(0.072, 0.025, 0.5, 0, 0.12, -0.2, rarityColor);
  }
  return P;
}

function healParts(type) {
  if (type === 'bandage') return [{ cyl: true, sx: 0.16, sy: 0.14, sz: 0.16, c: 0xf4f1ea }, { cyl: true, sx: 0.06, sy: 0.15, sz: 0.06, c: 0xd9d2c3 }];
  if (type === 'medkit') return [{ sx: 0.36, sy: 0.22, sz: 0.26, c: 0xf4f4f4 }, { sx: 0.2, sy: 0.23, sz: 0.06, c: 0xe03b3b }, { sx: 0.06, sy: 0.23, sz: 0.2, c: 0xe03b3b }, { sx: 0.1, sy: 0.04, sz: 0.04, y: 0.13, c: 0x777777 }];
  if (type === 'shieldSmall') return [{ cyl: true, sx: 0.1, sy: 0.14, sz: 0.1, c: 0x3fa9ff }, { cyl: true, sx: 0.05, sy: 0.06, sz: 0.05, y: 0.1, c: 0xdddddd }];
  return [{ cyl: true, sx: 0.18, sy: 0.24, sz: 0.18, c: 0x2f8fff }, { cyl: true, sx: 0.07, sy: 0.1, sz: 0.07, y: 0.16, c: 0xdddddd }, { cyl: true, sx: 0.19, sy: 0.04, sz: 0.19, y: 0.05, c: 0x9fd8ff }];
}

function modelGeometry(key, partsFn) {
  let g = modelCache.get(key);
  if (!g) { g = buildModel(partsFn()); modelCache.set(key, g); }
  return g;
}

function pickaxeModel() {
  const geo = modelGeometry('pickaxe', () => [
    { sx: 0.05, sy: 0.05, sz: 0.75, z: -0.3, c: WOOD },
    { sx: 0.06, sy: 0.5, sz: 0.08, z: -0.66, c: STEEL, rx: 0 },
    { sx: 0.07, sy: 0.12, sz: 0.1, z: -0.66, c: 0x3fa9ff },
  ]);
  const m = new THREE.Mesh(geo, vcMat);
  m.castShadow = true;
  const holder = new THREE.Group();
  holder.add(m);
  holder.rotation.x = -Math.PI / 2;
  return holder;
}

// Modell eines Gegenstands (für die Hand oder als Bodenloot)
function itemModel(it, held) {
  let geo;
  if (it.kind === 'weapon') {
    const rc = CONFIG.rarities[it.rarity].color;
    geo = modelGeometry('w:' + it.type + ':' + it.rarity, () => weaponParts(it.type, rc));
  } else if (it.kind === 'heal') geo = modelGeometry('h:' + it.type, () => healParts(it.type));
  else if (it.kind === 'ammo') {
    const c = CONFIG.ammo[it.type].color;
    geo = modelGeometry('a:' + it.type, () => [{ sx: 0.3, sy: 0.18, sz: 0.2, c: 0x4a4f3a }, { sx: 0.31, sy: 0.05, sz: 0.21, y: 0.08, c }]);
  } else {
    geo = modelGeometry('mats', () => [0, 1, 2].map((i) => ({ sx: 0.8, sy: 0.08, sz: 0.18, y: i * 0.09, z: (i % 2) * 0.05, ry: i * 0.3, c: 0xc4935f })));
  }
  const m = new THREE.Mesh(geo, vcMat);
  m.castShadow = true;
  const holder = new THREE.Group();
  holder.add(m);
  if (held) { holder.rotation.x = -Math.PI / 2; if (it.kind !== 'weapon') holder.position.z = -0.05; }
  return holder;
}

// ---------------------------------------------------------------------
// Gegenstände erzeugen
// ---------------------------------------------------------------------
function makeWeapon(type, rarity) { return { kind: 'weapon', type, rarity, mag: CONFIG.weapons[type].mag }; }
function makeHeal(type, count) { return { kind: 'heal', type, count: count || CONFIG.heals[type].pickup, rarity: CONFIG.heals[type].rarity }; }
function makeAmmo(type, amount) { return { kind: 'ammo', type, amount: amount || CONFIG.ammo[type].pickup, rarity: 0 }; }
function makeMats(amount) { return { kind: 'mats', amount, rarity: 0 }; }

function itemName(it) {
  if (it.kind === 'weapon') return CONFIG.weapons[it.type].name + ' (' + CONFIG.rarities[it.rarity].name + ')';
  if (it.kind === 'heal') return CONFIG.heals[it.type].name + ' ×' + it.count;
  if (it.kind === 'ammo') return CONFIG.ammo[it.type].name + ' ×' + it.amount;
  return 'Holz ×' + it.amount;
}

// ---------------------------------------------------------------------
// Auswahl, Nachladen, Heilen
// ---------------------------------------------------------------------
function selectSlot(a, idx) {
  if (idx === a.inv.sel) return;
  if (idx >= 0 && !a.inv.slots[idx]) return;
  a.inv.sel = idx;
  a.reloadTimer = 0; a.healTimer = 0; a.ads = false;
  a.fireCooldown = Math.max(a.fireCooldown, 0.2);
  if (a === player) refreshHud();
}

function startReload(a) {
  const it = currentItem(a);
  if (!it || it.kind !== 'weapon' || a.reloadTimer > 0) return false;
  const w = CONFIG.weapons[it.type];
  if (it.mag >= w.mag || a.inv.ammo[w.ammo] <= 0) return false;
  a.reloadTimer = a.reloadTotal = w.reload;
  if (a === player) sfx('reload');
  return true;
}

function canUseHeal(a, h) {
  if (h.hp) return a.hp < h.maxTo;
  return a.shield < h.maxTo;
}

function startHeal(a) {
  const it = currentItem(a);
  if (!it || it.kind !== 'heal' || a.healTimer > 0) return false;
  const h = CONFIG.heals[it.type];
  if (!canUseHeal(a, h)) { if (a === player) toast(h.hp ? 'Du hast schon genug Leben' : 'Dein Schild ist schon voll genug'); return false; }
  a.healTimer = a.healTotal = h.time;
  return true;
}

function updateActionTimers(a, dt) {
  a.fireCooldown = Math.max(0, a.fireCooldown - dt);
  a.swing = Math.max(0, a.swing - dt);
  a.recoil = Math.max(0, a.recoil - dt * 6);
  if (a.reloadTimer > 0) {
    a.reloadTimer -= dt;
    if (a.reloadTimer <= 0) {
      a.reloadTimer = 0;
      const it = currentItem(a);
      if (it && it.kind === 'weapon') {
        const w = CONFIG.weapons[it.type];
        const take = Math.min(w.mag - it.mag, a.inv.ammo[w.ammo]);
        it.mag += take; a.inv.ammo[w.ammo] -= take;
      }
    }
  }
  if (a.healTimer > 0) {
    a.healTimer -= dt;
    if (a.healTimer <= 0) {
      a.healTimer = 0;
      const it = currentItem(a);
      if (it && it.kind === 'heal') {
        const h = CONFIG.heals[it.type];
        if (h.hp) a.hp = Math.max(a.hp, Math.min(h.maxTo, a.hp + h.hp));
        if (h.shield) a.shield = Math.min(h.maxTo, a.shield + h.shield);
        it.count--;
        if (a === player) { sfx('heal'); spawnParticles(a.pos.x, a.pos.y + 1, a.pos.z, h.hp ? 0x6fe06f : 0x3fa9ff, 10, 2, -0.3, 0.8, true); }
        if (it.count <= 0) { a.inv.slots[a.inv.sel] = null; a.inv.sel = -1; }
        if (a === player) refreshHud();
      }
    }
  }
}

// ---------------------------------------------------------------------
// Schießen (Hitscan über eigenen Raycast) und Spitzhacke
// ---------------------------------------------------------------------
const _eye = { x: 0, y: 0, z: 0 };
function perturb(dx, dy, dz, spread, out) {
  if (spread <= 0) { out.x = dx; out.y = dy; out.z = dz; return out; }
  const r = spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
  // zwei Achsen senkrecht zur Richtung
  let ux = -dz, uy = 0, uz = dx;
  let ul = Math.hypot(ux, uz);
  if (ul < 1e-5) { ux = 1; uz = 0; ul = 1; }
  ux /= ul; uz /= ul;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
  let x = dx + (ux * Math.cos(a) + vx * Math.sin(a)) * r;
  let y = dy + (uy * Math.cos(a) + vy * Math.sin(a)) * r;
  let z = dz + (uz * Math.cos(a) + vz * Math.sin(a)) * r;
  const l = Math.hypot(x, y, z);
  out.x = x / l; out.y = y / l; out.z = z / l;
  return out;
}

const _pd = { x: 0, y: 0, z: 1 };
// Richtung dx/dy/dz ist bereits normiert und kommt vom Auge der Figur
const _muz = new THREE.Vector3();
function fireWeapon(a, dx, dy, dz) {
  const it = currentItem(a);
  if (!it || it.kind !== 'weapon') return false;
  if (a.reloadTimer > 0 || a.fireCooldown > 0 || a.healTimer > 0) return false;
  const w = CONFIG.weapons[it.type];
  if (it.mag <= 0) { if (!startReload(a) && a === player) sfx('deny'); return false; }
  const rm = CONFIG.rarities[it.rarity].mult;
  it.mag--;
  a.fireCooldown = 1 / w.rate;
  a.recoil = 1;
  let spread = a.ads ? w.adsSpread : w.spread;
  if (Math.hypot(a.vel.x, a.vel.z) > 1) spread *= 1.4;
  if (!a.onGround) spread *= 1.8;
  if (a.crouching) spread *= 0.8;
  if (w.auto) { spread += Math.min(0.03, a.burstShots * 0.004); a.burstShots++; }
  actorEye(a, _eye);
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw), rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw);
  let mx = _eye.x + rx * 0.3 + fx * 0.7, my = _eye.y - 0.3, mz = _eye.z + rz * 0.3 + fz * 0.7;
  if (realMuzzle(a, it.type, _muz)) { mx = _muz.x; my = _muz.y; mz = _muz.z; }
  for (let p = 0; p < w.pellets; p++) {
    perturb(dx, dy, dz, spread, _pd);
    let ex, ey, ez;
    if (raycastWorld(_eye.x, _eye.y, _eye.z, _pd.x, _pd.y, _pd.z, w.range, a.collider)) {
      const dist = worldHit.t;
      let fall = 1;
      if (w.falloffStart) fall = lerp(1, w.falloffMin, smoothstep(w.falloffStart, w.falloffEnd, dist));
      ex = worldHit.px; ey = worldHit.py; ez = worldHit.pz;
      const c = worldHit.collider;
      if (c && c.kind === 'actor') {
        const head = worldHit.zone === 'head';
        applyDamage(c.owner, w.dmg * rm * (head ? w.head : 1) * fall, a, 'weapon', worldHit.zone, ex, ey + 0.3, ez);
        spawnParticles(ex, ey, ez, head ? 0xffd23f : 0xff5a5a, 3, 2, 1, 0.3);
      } else if (c && c.owner && c.owner.gridBox) {
        damagePart(c.owner, w.dmg * rm * w.build * fall, ex, ey, ez, a === player);
        spawnParticles(ex, ey, ez, 0xc4935f, 3, 2.5);
        impactFx(ex, ey, ez, 'wood');
      } else if (c && c.owner && c.owner.barrel) {
        damageBarrel(c.owner, w.dmg * rm * fall, a);
        impactFx(ex, ey, ez, 'metal');
      } else {
        spawnParticles(ex, ey, ez, worldHit.terrain ? 0x7a6a4a : 0xb0b0b0, 2, 2);
        impactFx(ex, ey, ez, worldHit.terrain ? 'terrain' : c && (c.material === 'tree' || c.material === 'crate') ? 'wood' : 'stone');
      }
    } else {
      const r = Math.min(w.range, 150);
      ex = _eye.x + _pd.x * r; ey = _eye.y + _pd.y * r; ez = _eye.z + _pd.z * r;
    }
    spawnTracer(mx, my, mz, ex, ey, ez);
  }
  muzzleFlash(mx, my, mz, it.type === 'shotgun' || it.type === 'sniper');
  sfxGun(it.type, _eye.x, _eye.y, _eye.z);
  if (it.mag === 0) startReload(a);
  return true;
}

// Spitzhacke: Strahl ab Auge (bzw. Kamera beim Spieler) mit Reichweitenprüfung ab Auge
function swingPickaxe(a, ox, oy, oz, dx, dy, dz) {
  const P = CONFIG.pickaxe;
  if (a.fireCooldown > 0 || a.healTimer > 0) return false;
  a.fireCooldown = P.cooldown;
  a.swing = P.swingTime;
  sfxAt('swing', a.pos.x, a.pos.y, a.pos.z);
  actorEye(a, _eye);
  const extra = Math.hypot(ox - _eye.x, oy - _eye.y, oz - _eye.z);
  if (!raycastWorld(ox, oy, oz, dx, dy, dz, extra + P.range + 1, a.collider)) return true;
  if (Math.hypot(worldHit.px - _eye.x, worldHit.py - _eye.y, worldHit.pz - _eye.z) > P.range) return true;
  const c = worldHit.collider, hx = worldHit.px, hy = worldHit.py, hz = worldHit.pz;
  if (c && c.kind === 'actor') {
    const head = worldHit.zone === 'head';
    applyDamage(c.owner, P.damageActor * (head ? P.headMult : 1), a, 'pickaxe', worldHit.zone, hx, hy + 0.3, hz);
    sfxAt(head ? 'head' : 'hit', hx, hy, hz);
  } else if (c && c.owner && c.owner.gridBox) {
    sfxAt('hit', hx, hy, hz);
    spawnParticles(hx, hy, hz, 0xc4935f, 5, 2.5);
    damagePart(c.owner, P.damageBuild, hx, hy, hz, a === player);
  } else if (c && c.owner && c.owner.barrel) {
    damageBarrel(c.owner, P.damageBuild, a);
    sfxAt('hit', hx, hy, hz);
  } else if (c && (c.material === 'tree' || c.material === 'rock' || c.material === 'crate')) {
    const before = a.inv.mats;
    a.inv.mats = Math.min(CONFIG.build.maxMaterials, a.inv.mats + P.harvest);
    spawnParticles(hx, hy, hz, c.material === 'rock' ? 0x9a9a9a : 0xc4935f, 6, 2.5);
    sfxAt('hit', hx, hy, hz);
    if (a === player && a.inv.mats > before) { showDamageNumber(hx, hy, hz, a.inv.mats - before, 'mats'); refreshHud(); }
  } else {
    spawnParticles(hx, hy, hz, worldHit.terrain ? 0x6b8f4a : 0x999999, 4, 2);
    sfxAt('hit', hx, hy, hz);
  }
  return true;
}
