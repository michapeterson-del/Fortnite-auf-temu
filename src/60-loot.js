// ---------------------------------------------------------------------
// Loot: Bodengegenstände und Truhen
// ---------------------------------------------------------------------
const items = [];
const chests = [];
const beamGeo = new THREE.CylinderGeometry(0.05, 0.22, 5, 8, 1, true);
beamGeo.translate(0, 2.5, 0);
const glowRingGeo = new THREE.RingGeometry(0.35, 0.6, 20);
glowRingGeo.rotateX(-Math.PI / 2);

function rollRarity(weights) { return weightedIndex(weights); }
function rollWeaponType() { return weightedKey(CONFIG.weapons, 'weight'); }
function rollHealType() { return weightedKey(CONFIG.heals, 'weight'); }

function rollFloorItem() {
  const kind = weightedKey(CONFIG.loot.floorKind);
  if (kind === 'weapon') return makeWeapon(rollWeaponType(), rollRarity(CONFIG.loot.floorRarity));
  if (kind === 'ammo') return makeAmmo(pick(Object.keys(CONFIG.ammo)));
  if (kind === 'heal') return makeHeal(rollHealType());
  return makeMats(CONFIG.loot.matsPickup);
}

function spawnItem(it, x, y, z, vx, vy, vz) {
  const holder = new THREE.Group();
  const model = itemModel(it, false);
  model.position.y = 0.3;
  holder.add(model);
  if (it.kind === 'weapon' || (it.kind === 'heal' && it.rarity > 0)) {
    const col = CONFIG.rarities[it.rarity].color;
    const beam = new THREE.Mesh(beamGeo, glowMat(col, it.kind === 'weapon' ? 0.28 : 0.15));
    beam.renderOrder = 5;
    holder.add(beam);
    const ring = new THREE.Mesh(glowRingGeo, glowMat(col, 0.5));
    ring.position.y = 0.03;
    holder.add(ring);
  }
  holder.position.set(x, y, z);
  scene.add(holder);
  const e = {
    it, pos: new THREE.Vector3(x, y, z), holder, model, alive: true, phase: Math.random() * 6,
    flying: vx !== undefined, vel: new THREE.Vector3(vx || 0, vy || 0, vz || 0), claimedBy: null,
  };
  items.push(e);
  return e;
}

function removeItem(e) {
  if (!e.alive) return;
  e.alive = false;
  trash.push(e.holder);
}

function scatterItem(it, x, y, z, dirYaw) {
  const ang = dirYaw + rand(-0.7, 0.7), sp = rand(1.5, 3);
  return spawnItem(it, x, y + 0.6, z, -Math.sin(ang) * sp, rand(4, 6), -Math.cos(ang) * sp);
}

// ---------------------------------------------------------------------
// Truhen
// ---------------------------------------------------------------------
const chestBaseGeo = () => modelGeometry('chest-base', () => [
  { sx: 0.95, sy: 0.5, sz: 0.6, y: 0.25, c: 0x8a5a33 },
  { sx: 0.97, sy: 0.07, sz: 0.62, y: 0.12, c: 0xffc93c },
  { sx: 0.97, sy: 0.07, sz: 0.62, y: 0.42, c: 0xffc93c },
  { sx: 0.12, sy: 0.14, sz: 0.04, y: 0.42, z: -0.31, c: 0xffe27a },
]);
const chestLidGeo = () => modelGeometry('chest-lid', () => [
  { sx: 0.95, sy: 0.22, sz: 0.6, y: 0.11, z: -0.3, c: 0x9a6a3c },
  { sx: 0.97, sy: 0.06, sz: 0.62, y: 0.2, z: -0.3, c: 0xffc93c },
  { sx: 0.06, sy: 0.23, sz: 0.62, x: -0.3, y: 0.11, z: -0.3, c: 0xffc93c },
  { sx: 0.06, sy: 0.23, sz: 0.62, x: 0.3, y: 0.11, z: -0.3, c: 0xffc93c },
]);

function createChest(spot) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(chestBaseGeo(), vcMat);
  base.castShadow = true;
  g.add(base);
  const lid = new THREE.Group();
  lid.position.set(0, 0.5, 0.3);
  const lidMesh = new THREE.Mesh(chestLidGeo(), vcMat);
  lidMesh.castShadow = true;
  lid.add(lidMesh);
  g.add(lid);
  const glow = new THREE.Mesh(glowRingGeo, glowMat(0xffd23f, 0.55));
  glow.scale.setScalar(1.6);
  glow.position.y = 0.04;
  g.add(glow);
  g.position.set(spot.x, spot.y, spot.z);
  g.rotation.y = spot.yaw;
  scene.add(g);
  const c = makeCollider('box', spot.x - 0.5, spot.y, spot.z - 0.5, spot.x + 0.5, spot.y + 0.7, spot.z + 0.5, null);
  c.material = 'chest';
  grid.insert(c);
  const ch = { pos: new THREE.Vector3(spot.x, spot.y, spot.z), yaw: spot.yaw, opened: false, group: g, lid, glow, openT: 0, sparkle: Math.random(), claimedBy: null };
  c.owner = null;
  chests.push(ch);
  return ch;
}

function openChest(a, ch) {
  if (ch.opened) return;
  ch.opened = true;
  ch.glow.visible = false;
  sfxAt('chest', ch.pos.x, ch.pos.y, ch.pos.z);
  spawnParticles(ch.pos.x, ch.pos.y + 0.8, ch.pos.z, 0xffd23f, 16, 3, 0.4, 0.8, true);
  const L = CONFIG.loot;
  const wt = rollWeaponType();
  const out = [makeWeapon(wt, rollRarity(L.chestRarity)), makeAmmo(CONFIG.weapons[wt].ammo)];
  if (Math.random() < L.chestHealChance) out.push(makeHeal(rollHealType()));
  out.push(makeMats(L.chestMats));
  // Truhen-Vorderseite zeigt nach -z (lokal)
  for (const it of out) scatterItem(it, ch.pos.x, ch.pos.y, ch.pos.z, ch.yaw);
}

// ---------------------------------------------------------------------
// Inventar
// ---------------------------------------------------------------------
function freeSlot(a) { return a.inv.slots.indexOf(null); }

// Nimmt so viel wie möglich; gibt true zurück, wenn der Gegenstand komplett weg ist
function addToInventory(a, it) {
  if (it.kind === 'ammo') { a.inv.ammo[it.type] = Math.min(999, a.inv.ammo[it.type] + it.amount); return true; }
  if (it.kind === 'mats') {
    const room = CONFIG.build.maxMaterials - a.inv.mats;
    const take = Math.min(room, it.amount);
    a.inv.mats += take; it.amount -= take;
    return it.amount <= 0;
  }
  if (it.kind === 'heal') {
    const stack = CONFIG.heals[it.type].stack;
    for (const s of a.inv.slots) {
      if (s && s.kind === 'heal' && s.type === it.type && s.count < stack) {
        const take = Math.min(stack - s.count, it.count);
        s.count += take; it.count -= take;
        if (it.count <= 0) return true;
      }
    }
  }
  const idx = freeSlot(a);
  if (idx < 0) return false;
  a.inv.slots[idx] = it;
  if (a.inv.sel < 0 && it.kind === 'weapon') a.inv.sel = idx;
  return true;
}

function canAutoPickup(a, it) {
  if (it.kind === 'ammo') return true;
  if (it.kind === 'mats') return a.inv.mats < CONFIG.build.maxMaterials;
  if (it.kind === 'heal') {
    if (freeSlot(a) >= 0) return true;
    const stack = CONFIG.heals[it.type].stack;
    return a.inv.slots.some((s) => s && s.kind === 'heal' && s.type === it.type && s.count < stack);
  }
  return freeSlot(a) >= 0;
}

function pickupItem(a, e, allowSwap) {
  if (!e.alive || e.flying) return false;
  const it = e.it;
  const before = JSON.stringify(it);
  if (addToInventory(a, it)) {
    removeItem(e);
  } else if (allowSwap && (it.kind === 'weapon' || it.kind === 'heal') && a.inv.sel >= 0 && a.inv.slots[a.inv.sel]) {
    const old = a.inv.slots[a.inv.sel];
    a.inv.slots[a.inv.sel] = it;
    removeItem(e);
    scatterItem(old, a.pos.x, a.pos.y, a.pos.z, a.yaw + Math.PI);
    a.reloadTimer = 0; a.healTimer = 0;
  } else if (JSON.stringify(it) === before) {
    if (a === player) toast(a.inv.sel < 0 ? 'Inventar voll – wähle einen Platz zum Tauschen' : 'Inventar voll');
    return false;
  }
  if (a === player) {
    sfx('pickup');
    toast(itemName(it.kind === 'weapon' || it.kind === 'heal' ? it : it));
    refreshHud();
  }
  return true;
}

function dropInventory(a) {
  const x = a.pos.x, y = a.pos.y, z = a.pos.z;
  for (let i = 0; i < a.inv.slots.length; i++) {
    const it = a.inv.slots[i];
    if (it) scatterItem(it, x, y, z, Math.random() * Math.PI * 2);
    a.inv.slots[i] = null;
  }
  for (const k of Object.keys(a.inv.ammo)) {
    if (a.inv.ammo[k] > 0) scatterItem(makeAmmo(k, a.inv.ammo[k]), x, y, z, Math.random() * Math.PI * 2);
    a.inv.ammo[k] = 0;
  }
  if (a.inv.mats > 0) scatterItem(makeMats(a.inv.mats), x, y, z, Math.random() * Math.PI * 2);
  a.inv.mats = 0;
  a.inv.sel = -1;
}

// Nächstes Ziel für E / „Aufheben“
function findInteractable(a, range) {
  let best = null, bestD = range;
  for (const ch of chests) {
    if (ch.opened) continue;
    const d = Math.hypot(ch.pos.x - a.pos.x, ch.pos.z - a.pos.z);
    if (d < bestD && Math.abs(ch.pos.y - a.pos.y) < 2) { bestD = d; best = { chest: ch }; }
  }
  if (best) return best;
  for (const e of items) {
    if (!e.alive || e.flying) continue;
    const d = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
    if (d < bestD && Math.abs(e.pos.y - a.pos.y) < 2) { bestD = d; best = { item: e }; }
  }
  return best;
}

function interact(a, target) {
  if (!target) return false;
  if (target.chest) { openChest(a, target.chest); return true; }
  return pickupItem(a, target.item, true);
}

function autoPickup(a) {
  const r = CONFIG.player.autoPickupRange;
  for (const e of items) {
    if (!e.alive || e.flying) continue;
    if (Math.abs(e.pos.x - a.pos.x) > r || Math.abs(e.pos.z - a.pos.z) > r || Math.abs(e.pos.y - a.pos.y) > 2) continue;
    if (canAutoPickup(a, e.it)) pickupItem(a, e, false);
  }
}

function populateLoot() {
  for (const s of lootSpawns.chests) createChest(s);
  for (const s of lootSpawns.floor) {
    const it = rollFloorItem();
    spawnItem(it, s.x, s.y, s.z);
    if (it.kind === 'weapon') spawnItem(makeAmmo(CONFIG.weapons[it.type].ammo), s.x + 0.7, s.y, s.z + 0.3);
  }
}

function updateLoot(dt) {
  for (const e of items) {
    if (!e.alive || !e.flying) continue;
    e.vel.y -= 20 * dt;
    e.pos.addScaledVector(e.vel, dt);
    const g = groundBelow(e.pos.x, e.pos.y + 0.6, e.pos.z, 30);
    if (e.pos.y <= g && e.vel.y <= 0) { e.pos.y = g; e.flying = false; e.vel.set(0, 0, 0); }
    e.holder.position.copy(e.pos);
  }
  for (const ch of chests) {
    if (ch.opened && ch.openT < 1) { ch.openT = Math.min(1, ch.openT + dt * 3); ch.lid.rotation.x = -ch.openT * 1.9; }
  }
  if (player && player.alive && player.phase === 'ground') autoPickup(player);
}

function renderLoot(dt, cx, cz) {
  const vis = CONFIG.render.visibleItemDistance;
  const t = gameTime;
  for (const e of items) {
    if (!e.alive) continue;
    const d = Math.abs(e.pos.x - cx) + Math.abs(e.pos.z - cz);
    const show = d < vis * 1.4;
    e.holder.visible = show;
    if (!show) continue;
    e.model.rotation.y = t * CONFIG.loot.spinSpeed + e.phase;
    e.model.position.y = 0.3 + (e.flying ? 0 : Math.sin(t * 2 + e.phase) * CONFIG.loot.bobHeight);
  }
  for (const ch of chests) {
    if (ch.opened) continue;
    ch.glow.material.opacity = 0.35 + Math.sin(t * 4 + ch.sparkle * 6) * 0.2;
    if (Math.abs(ch.pos.x - cx) + Math.abs(ch.pos.z - cz) < 40 && Math.random() < dt * 3) {
      spawnParticles(ch.pos.x + rand(-0.5, 0.5), ch.pos.y + 0.7, ch.pos.z + rand(-0.4, 0.4), 0xffe27a, 1, 0.6, -0.15, 0.9, true);
    }
  }
}

function cleanupLoot() {
  for (let i = items.length - 1; i >= 0; i--) if (!items[i].alive) items.splice(i, 1);
}
