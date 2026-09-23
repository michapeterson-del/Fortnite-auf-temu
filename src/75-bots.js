// ---------------------------------------------------------------------
// Bots: KI denkt max. 5×/s, Steuerung + Zielen laufen jeden Tick
// ---------------------------------------------------------------------
const PREF_RANGE = { pistol: 16, smg: 11, ar: 26, shotgun: 5, sniper: 60 };
const TURN_RATE = { leicht: 2.4, mittel: 4.5, schwer: 7 };

function createBotAI() {
  const dk = weightedKey(CONFIG.bots.difficulties, 'weight');
  const d = CONFIG.bots.difficulties[dk];
  return {
    diff: dk, aimError: d.aimError, reaction: d.reaction, buildChance: d.buildChance,
    nextThink: Math.random() * 0.2, state: 'loot',
    goalX: 0, goalZ: 0, hasGoal: false, goalItem: null, goalChest: null, goalUntil: 0,
    enemy: null, enemyVisible: false, throughBuild: false, seenSince: 0, lastSeen: -99, lastEnemyX: 0, lastEnemyZ: 0,
    strafe: 1, strafeUntil: 0, stuck: 0, lastX: 0, lastZ: 0, unstickUntil: 0, unstickSide: 1,
    jumpAt: 0, landX: 0, landZ: 0, buildCooldown: 0, wantJump: false, wantCrouch: false, moving: false,
    aimOffX: 0, aimOffY: 0, aimOffZ: 0,
  };
}

function initBots(n) {
  const names = CONFIG.bots.names.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = names[i]; names[i] = names[j]; names[j] = t; }
  for (let i = 0; i < n; i++) {
    const a = createActor({ name: names[i % names.length] + (i >= names.length ? ' ' + (i + 1) : ''), isPlayer: false });
    a.ai = createBotAI();
  }
}

// Absprungzeit und Landeziel (Truhe/Haus in der Nähe der Busroute)
function planBotDrops() {
  for (const a of actors) {
    if (!a.ai) continue;
    const f = rand(0.08, 0.9);
    a.ai.jumpAt = bus.duration * f;
    const px = lerp(bus.sx, bus.ex, f), pz = lerp(bus.sz, bus.ez, f);
    const near = lootSpawns.chests.filter((c) => Math.hypot(c.x - px, c.z - pz) < 170);
    const tgt = near.length ? pick(near) : { x: px + rand(-80, 80), z: pz + rand(-80, 80) };
    a.ai.landX = clamp(tgt.x + rand(-4, 4), -HALF * 0.85, HALF * 0.85);
    a.ai.landZ = clamp(tgt.z + rand(-4, 4), -HALF * 0.85, HALF * 0.85);
  }
}

function weaponScore(it, dist, a) {
  if (!it || it.kind !== 'weapon') return -1;
  const w = CONFIG.weapons[it.type];
  if (it.mag <= 0 && a.inv.ammo[w.ammo] <= 0) return -1;
  const pref = PREF_RANGE[it.type];
  const fit = 1 / (1 + Math.abs(dist - pref) / pref);
  return fit * 10 + it.rarity * 1.5 + (it.mag > 0 ? 2 : 0);
}

function bestWeaponSlot(a, dist) {
  let best = -1, bs = -1;
  a.inv.slots.forEach((it, i) => { const s = weaponScore(it, dist, a); if (s > bs) { bs = s; best = i; } });
  return best;
}

function isUsefulItem(a, it) {
  if (it.kind === 'ammo') return a.inv.slots.some((s) => s && s.kind === 'weapon' && CONFIG.weapons[s.type].ammo === it.type) && a.inv.ammo[it.type] < 120;
  if (it.kind === 'mats') return a.inv.mats < 300;
  if (it.kind === 'heal') return canAutoPickup(a, it);
  if (freeSlot(a) >= 0) return true;
  return a.inv.slots.some((s) => s && s.kind === 'weapon' && s.type === it.type && s.rarity < it.rarity);
}

const _be = { x: 0, y: 0, z: 0 };
function botPerceive(a) {
  const ai = a.ai, B = CONFIG.bots;
  actorEye(a, _be);
  const cands = [];
  for (const o of actors) {
    if (o === a || !o.alive || (o.phase !== 'ground' && o.phase !== 'glide')) continue;
    const d = Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
    if (d > B.sightRange) continue;
    cands.push({ o, d });
  }
  cands.sort((p, q) => p.d - q.d);
  let found = null, through = false;
  for (let i = 0; i < Math.min(B.sightChecks, cands.length); i++) {
    const { o, d } = cands[i];
    const ang = Math.atan2(-(o.pos.x - a.pos.x), -(o.pos.z - a.pos.z));
    const recentlyHit = a.lastAttacker === o && gameTime - a.lastDamageTime < 3;
    if (d > 15 && Math.abs(angleDiff(a.yaw, ang)) > B.fov / 2 && !recentlyHit) continue;
    const ty = o.pos.y + o.height * 0.65;
    if (lineOfSight(_be.x, _be.y, _be.z, o.pos.x, ty, o.pos.z, a.collider, o)) { found = o; break; }
    const c = worldHit.collider;
    if (c && c.owner && c.owner.gridBox && d < 25) { found = o; through = true; break; }
  }
  if (found) {
    if (ai.enemy !== found || !ai.enemyVisible) ai.seenSince = gameTime;
    ai.enemy = found; ai.enemyVisible = true; ai.throughBuild = through;
    ai.lastSeen = gameTime; ai.lastEnemyX = found.pos.x; ai.lastEnemyZ = found.pos.z;
  } else {
    ai.enemyVisible = false;
    if (a.lastAttacker && a.lastAttacker.alive && gameTime - a.lastDamageTime < 3) {
      ai.enemy = a.lastAttacker; ai.lastEnemyX = ai.enemy.pos.x; ai.lastEnemyZ = ai.enemy.pos.z; ai.lastSeen = gameTime;
    } else if (ai.enemy && (!ai.enemy.alive || gameTime - ai.lastSeen > 6)) ai.enemy = null;
  }
}

function releaseClaims(a) {
  const ai = a.ai;
  if (ai.goalItem && ai.goalItem.claimedBy === a) ai.goalItem.claimedBy = null;
  if (ai.goalChest && ai.goalChest.claimedBy === a) ai.goalChest.claimedBy = null;
  ai.goalItem = null; ai.goalChest = null;
}

function findLootGoal(a) {
  const ai = a.ai, R = CONFIG.bots.lootRange;
  let best = null, bestD = R, bestKind = null;
  for (const ch of chests) {
    if (ch.opened || (ch.claimedBy && ch.claimedBy !== a && ch.claimedBy.alive)) continue;
    const d = Math.hypot(ch.pos.x - a.pos.x, ch.pos.z - a.pos.z) * 0.8;
    if (d < bestD) { bestD = d; best = ch; bestKind = 'chest'; }
  }
  for (const e of items) {
    if (!e.alive || e.flying || (e.claimedBy && e.claimedBy !== a && e.claimedBy.alive)) continue;
    const d = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
    if (d >= bestD || !isUsefulItem(a, e.it)) continue;
    bestD = d; best = e; bestKind = 'item';
  }
  releaseClaims(a);
  if (!best) return false;
  best.claimedBy = a;
  if (bestKind === 'chest') ai.goalChest = best; else ai.goalItem = best;
  ai.goalX = best.pos.x; ai.goalZ = best.pos.z; ai.hasGoal = true; ai.goalUntil = gameTime + 25;
  return true;
}

function setWanderGoal(a) {
  const ai = a.ai;
  const r = Math.max(5, storm.toR * 0.6);
  for (let t = 0; t < 10; t++) {
    const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
    const x = storm.toX + Math.cos(ang) * d, z = storm.toZ + Math.sin(ang) * d;
    if (getHeight(x, z) > W.waterLevel + 0.5) { ai.goalX = x; ai.goalZ = z; break; }
  }
  ai.hasGoal = true; ai.goalUntil = gameTime + 20;
}

function botThink(a) {
  const ai = a.ai, B = CONFIG.bots;
  // Festhängen erkennen
  const moved = Math.hypot(a.pos.x - ai.lastX, a.pos.z - ai.lastZ);
  ai.lastX = a.pos.x; ai.lastZ = a.pos.z;
  if (ai.moving && moved < 0.25) ai.stuck++; else ai.stuck = Math.max(0, ai.stuck - 1);
  ai.wantJump = false;
  if (ai.stuck >= 3) {
    ai.unstickUntil = gameTime + 1.0; ai.unstickSide = Math.random() < 0.5 ? -1 : 1; ai.wantJump = true;
    if (ai.stuck > 9) { releaseClaims(a); ai.hasGoal = false; ai.stuck = 0; }
  }
  botPerceive(a);
  const enemy = ai.enemy;
  const dist = enemy ? Math.hypot(enemy.pos.x - a.pos.x, enemy.pos.z - a.pos.z) : 999;

  // Waffe wählen
  const slot = bestWeaponSlot(a, dist);
  if (a.healTimer <= 0) {
    if (slot >= 0 && (enemy || currentItem(a) === null || currentItem(a).kind !== 'weapon')) selectSlot(a, slot);
  }
  const it = currentItem(a);
  const armed = it && it.kind === 'weapon';

  // Nachladen, wenn gerade niemand zu sehen ist
  if (armed && !ai.enemyVisible) {
    const w = CONFIG.weapons[it.type];
    if (it.mag < w.mag * 0.5) startReload(a);
  }

  // Bauen, wenn beschossen
  if (gameTime - a.lastDamageTime < 0.35 && a.lastAttacker && a.inv.mats >= CONFIG.build.cost && gameTime > ai.buildCooldown && Math.random() < ai.buildChance) {
    const at = a.lastAttacker;
    const saveYaw = a.yaw, savePitch = a.pitch;
    a.yaw = Math.atan2(-(at.pos.x - a.pos.x), -(at.pos.z - a.pos.z)); a.pitch = 0;
    tryBuild(a, computeBuildTarget(a, 'wall'));
    if (Math.random() < 0.4) tryBuild(a, computeBuildTarget(a, 'ramp'));
    a.yaw = saveYaw; a.pitch = savePitch;
    ai.buildCooldown = gameTime + 3;
  }

  // Zustand wählen
  const outside = !inStormSafe(a.pos.x, a.pos.z);
  const outsideNext = !inNextCircle(a.pos.x, a.pos.z, 8);
  const stormUrgent = outside || (outsideNext && (storm.stage !== 'wait' || storm.timer < 35));
  const healItem = a.inv.slots.findIndex((s) => s && s.kind === 'heal' && canUseHeal(a, CONFIG.heals[s.type]));
  if (enemy && ai.enemyVisible && armed) ai.state = 'fight';
  else if (enemy && ai.enemyVisible && dist < 6) ai.state = 'melee';
  else if (stormUrgent) { ai.state = 'rotate'; releaseClaims(a); }
  else if (a.healTimer > 0) ai.state = 'heal';
  else if (healItem >= 0 && gameTime - ai.lastSeen > 3 && gameTime - a.lastDamageTime > 3 && (a.hp < B.healThreshold || a.shield < 50)) {
    selectSlot(a, healItem); startHeal(a); ai.state = 'heal';
  } else if (enemy && armed && gameTime - ai.lastSeen < 5) ai.state = 'chase';
  else {
    const needLoot = !armed || freeSlot(a) >= 0 || a.inv.mats < 100;
    if (!ai.hasGoal || gameTime > ai.goalUntil || (ai.state !== 'loot' && ai.state !== 'wander')) {
      if (!(needLoot && findLootGoal(a))) setWanderGoal(a);
    }
    ai.state = ai.goalItem || ai.goalChest ? 'loot' : 'wander';
  }

  // Ziel erreicht?
  if (ai.state === 'loot') {
    const tgt = ai.goalChest || ai.goalItem;
    if (tgt) {
      const d = Math.hypot(tgt.pos.x - a.pos.x, tgt.pos.z - a.pos.z);
      if (ai.goalChest && (ai.goalChest.opened)) { releaseClaims(a); ai.hasGoal = false; }
      else if (ai.goalItem && !ai.goalItem.alive) { releaseClaims(a); ai.hasGoal = false; }
      else if (d < B.reachDistance && Math.abs(tgt.pos.y - a.pos.y) < 2) {
        if (ai.goalChest) openChest(a, ai.goalChest); else pickupItem(a, ai.goalItem, true);
        releaseClaims(a); ai.hasGoal = false;
      }
    }
  } else if (ai.state === 'wander' && Math.hypot(ai.goalX - a.pos.x, ai.goalZ - a.pos.z) < 3) ai.hasGoal = false;

  // Kampf: seitlich ausweichen, springen, Zielfehler neu würfeln
  if (ai.state === 'fight') {
    if (gameTime > ai.strafeUntil) { ai.strafe = -ai.strafe; ai.strafeUntil = gameTime + rand(B.strafeTime[0], B.strafeTime[1]); }
    if (Math.random() < 0.08) ai.wantJump = true;
    ai.wantCrouch = it.type === 'sniper' && dist > 40;
    const err = ai.aimError * dist;
    ai.aimOffX = rand(-err, err); ai.aimOffY = rand(-err, err) * 0.6; ai.aimOffZ = rand(-err, err);
  } else ai.wantCrouch = false;
  autoPickup(a);
}

const _bd = { x: 0, y: 0, z: 0 };
function botSteer(a, dt) {
  const ai = a.ai, c = a.cmd;
  let wx = 0, wz = 0, faceYaw = null, sprint = false;
  const enemy = ai.enemy;
  if (ai.state === 'fight' || ai.state === 'melee' || ai.state === 'chase') {
    const ex = ai.state === 'chase' ? ai.lastEnemyX : enemy.pos.x, ez = ai.state === 'chase' ? ai.lastEnemyZ : enemy.pos.z;
    const dx = ex - a.pos.x, dz = ez - a.pos.z, d = Math.hypot(dx, dz) || 1;
    faceYaw = Math.atan2(-dx, -dz);
    const it = currentItem(a);
    const pref = ai.state === 'melee' ? 1.5 : it && it.kind === 'weapon' ? PREF_RANGE[it.type] : 10;
    const toward = d > pref + 4 ? 1 : d < pref - 3 ? -1 : 0;
    wx = dx / d * toward + (-dz / d) * ai.strafe * (ai.state === 'fight' ? 0.8 : 0);
    wz = dz / d * toward + (dx / d) * ai.strafe * (ai.state === 'fight' ? 0.8 : 0);
    if (ai.state === 'chase') { wx = dx / d; wz = dz / d; sprint = d > 12; }
  } else if (ai.state === 'rotate') {
    const dx = storm.toX - a.pos.x, dz = storm.toZ - a.pos.z, d = Math.hypot(dx, dz) || 1;
    wx = dx / d; wz = dz / d; sprint = true;
  } else if (ai.state === 'loot' || ai.state === 'wander') {
    const dx = ai.goalX - a.pos.x, dz = ai.goalZ - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.6) { wx = dx / d; wz = dz / d; sprint = d > 12; }
  }
  if (gameTime < ai.unstickUntil) {
    const px = -wz * ai.unstickSide, pz = wx * ai.unstickSide;
    wx = wx * 0.3 + px; wz = wz * 0.3 + pz;
  }
  ai.moving = Math.hypot(wx, wz) > 0.1;
  // Blickrichtung drehen (begrenzte Drehgeschwindigkeit)
  const moveYaw = ai.moving ? Math.atan2(-wx, -wz) : a.yaw;
  const targetYaw = faceYaw !== null ? faceYaw : moveYaw;
  const rate = TURN_RATE[ai.diff] * dt;
  a.yaw += clamp(angleDiff(a.yaw, targetYaw), -rate, rate);
  // Welt- in lokale Richtung umrechnen
  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  const l = Math.hypot(wx, wz);
  if (l > 1) { wx /= l; wz /= l; }
  c.mx = wx * cos - wz * sin;
  c.mz = wx * sin + wz * cos;
  c.sprint = sprint;
  c.jump = ai.wantJump || (a.blocked && ai.moving && Math.random() < 0.1);
  c.crouch = ai.wantCrouch;
  ai.wantJump = false;

  // Von eigenen/fremden Bauteilen blockiert: mit der Spitzhacke durch
  if (a.blocked && a.blockCollider && a.blockCollider.owner && a.blockCollider.owner.gridBox && ai.state !== 'fight' && a.fireCooldown <= 0) {
    const bc = a.blockCollider;
    const tx = (bc.min[0] + bc.max[0]) / 2, tz = (bc.min[2] + bc.max[2]) / 2;
    actorEye(a, _be);
    const dx = tx - _be.x, dz = tz - _be.z, dy = (a.pos.y + 1) - _be.y, dl = Math.hypot(dx, dy, dz) || 1;
    const prevSel = a.inv.sel;
    a.inv.sel = -1;
    swingPickaxe(a, _be.x, _be.y, _be.z, dx / dl, dy / dl, dz / dl);
    a.inv.sel = prevSel;
  }

  // Zielen und Schießen
  if ((ai.state === 'fight' || ai.state === 'melee') && enemy && enemy.alive) {
    actorEye(a, _be);
    const lead = Math.hypot(enemy.pos.x - a.pos.x, enemy.pos.z - a.pos.z) / 250;
    const tx = enemy.pos.x + enemy.vel.x * lead + ai.aimOffX;
    const ty = enemy.pos.y + enemy.height * (ai.diff === 'schwer' && Math.random() < 0.15 ? 0.9 : 0.62) + ai.aimOffY;
    const tz = enemy.pos.z + enemy.vel.z * lead + ai.aimOffZ;
    const dx = tx - _be.x, dy = ty - _be.y, dz = tz - _be.z, dl = Math.hypot(dx, dy, dz) || 1;
    a.pitch = Math.asin(clamp(dy / dl, -1, 1));
    const wantYaw = Math.atan2(-dx, -dz);
    const aligned = Math.abs(angleDiff(a.yaw, wantYaw)) < 0.12;
    const reacted = gameTime - ai.seenSince > ai.reaction;
    if (aligned && reacted && ai.enemyVisible) {
      const it = currentItem(a);
      if (ai.state === 'melee' || !it || it.kind !== 'weapon') {
        if (dl < 3.5) { const ps = a.inv.sel; a.inv.sel = -1; swingPickaxe(a, _be.x, _be.y, _be.z, dx / dl, dy / dl, dz / dl); a.inv.sel = ps; }
      } else {
        fireWeapon(a, dx / dl, dy / dl, dz / dl);
      }
    }
  } else {
    a.pitch *= 0.9;
    a.burstShots = 0;
  }
}

function updateBots(dt) {
  const thinkInterval = 1 / CONFIG.bots.thinkRate;
  for (const a of actors) {
    if (!a.ai || !a.alive) continue;
    const ai = a.ai;
    if (a.phase === 'bus') {
      if (bus.active && bus.t >= ai.jumpAt) jumpFromBus(a);
      continue;
    }
    if (a.phase === 'freefall' || a.phase === 'glide') {
      const dx = ai.landX - a.pos.x, dz = ai.landZ - a.pos.z, d = Math.hypot(dx, dz);
      a.yaw = Math.atan2(-dx, -dz);
      const h = a.pos.y - getHeight(a.pos.x, a.pos.z);
      a.cmd.mx = 0; a.cmd.mz = d > 4 ? -1 : 0;
      a.pitch = d < h * 0.9 ? -1 : 0;
      a.cmd.jump = false;
      if (a.phase === 'freefall' && d > h * 1.6 && h < 90) openGlider(a);
      continue;
    }
    if (a.phase !== 'ground') continue;
    if (gameTime >= ai.nextThink) {
      ai.nextThink = gameTime + thinkInterval * (0.9 + Math.random() * 0.2);
      botThink(a);
    }
    botSteer(a, dt);
  }
}
