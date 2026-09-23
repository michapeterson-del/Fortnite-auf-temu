// ---------------------------------------------------------------------
// Spielzustand
// ---------------------------------------------------------------------
const game = { mode: 'combat', piece: 'wall', buildTarget: null, buildRepeat: 0, debug: false, interactTarget: null, endAt: 0, victory: false, spectate: null, adsBlend: 0 };

function setMode(m) {
  game.mode = m;
  if (m === 'build') { player.ads = false; player.healTimer = 0; player.reloadTimer = 0; }
  refreshHud();
}
function setPiece(p) { game.piece = p; refreshHud(); }

function onElimination(a, killer) {
  if (a === player) {
    game.spectate = killer && killer !== player && killer.alive ? killer : null;
    game.mode = 'combat';
    refreshHud();
    game.endAt = gameTime + CONFIG.match.endScreenDelay;
    game.victory = false;
    announce(killer && killer !== player ? 'Eliminiert von ' + killer.name : 'Du wurdest eliminiert');
  } else if (player.alive && aliveActors() === 1) {
    game.victory = true;
    game.endAt = gameTime + CONFIG.match.endScreenDelay;
    announce('#1 VICTORY ROYALE!');
  }
  if (game.spectate === a) game.spectate = killer && killer.alive ? killer : (actors.find((x) => x.alive && x !== player) || null);
}

// Kamera-Rig: Über-die-Schulter, mit eigenem Kollisions-Raycast
const rig = { px: 0, py: 0, pz: 0, cx: 0, cy: 0, cz: 0, fx: 0, fy: 0, fz: -1 };
function computeRig(pos, height, yaw, pitch, out, mode, ignore) {
  const C = CONFIG.camera;
  const cp = Math.cos(pitch);
  out.fx = -Math.sin(yaw) * cp; out.fy = Math.sin(pitch); out.fz = -Math.cos(yaw) * cp;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  out.px = pos.x; out.py = pos.y + height - CONFIG.player.eyeFromTop; out.pz = pos.z;
  let dist = C.distance, shoulder = C.shoulder, up = C.height;
  if (mode === 'air') { dist = C.airDistance; shoulder = 0; up = 1.2; }
  else if (mode === 'bus') { dist = C.busDistance; shoulder = 0; up = 9; }
  else { const k = game.adsBlend; dist = lerp(C.distance, C.adsDistance, k); shoulder = lerp(C.shoulder, C.adsShoulder, k); }
  const sx = out.px + rx * shoulder, sy = out.py + up, sz = out.pz + rz * shoulder;
  const tx = sx - out.fx * dist, ty = sy - out.fy * dist, tz = sz - out.fz * dist;
  let dx = tx - out.px, dy = ty - out.py, dz = tz - out.pz;
  const len = Math.hypot(dx, dy, dz);
  dx /= len; dy /= len; dz /= len;
  let d = len;
  if (mode !== 'bus' && raycastWorld(out.px, out.py, out.pz, dx, dy, dz, len, ignore)) d = Math.max(C.minDistance, worldHit.t - C.padding);
  out.cx = out.px + dx * d; out.cy = out.py + dy * d; out.cz = out.pz + dz * d;
  return out;
}

function playerCamMode() {
  if (player.phase === 'bus') return 'bus';
  if (player.phase === 'freefall' || player.phase === 'glide') return 'air';
  return 'ground';
}

// Zielpunkt unter dem Fadenkreuz -> Richtung ab Auge
const _aim = { x: 0, y: 0, z: 0 };
function playerAimDir(out) {
  computeRig(player.pos, player.height, player.yaw, player.pitch, rig, playerCamMode(), player.collider);
  actorEye(player, _eye);
  const camToEye = Math.hypot(rig.cx - _eye.x, rig.cy - _eye.y, rig.cz - _eye.z);
  let tx, ty, tz;
  if (raycastWorld(rig.cx, rig.cy, rig.cz, rig.fx, rig.fy, rig.fz, 600, player.collider) && worldHit.t > camToEye + 0.5) {
    tx = worldHit.px; ty = worldHit.py; tz = worldHit.pz;
  } else {
    tx = rig.cx + rig.fx * 600; ty = rig.cy + rig.fy * 600; tz = rig.cz + rig.fz * 600;
  }
  const dx = tx - _eye.x, dy = ty - _eye.y, dz = tz - _eye.z, l = Math.hypot(dx, dy, dz) || 1;
  out.x = dx / l; out.y = dy / l; out.z = dz / l;
  return out;
}

// ---------------------------------------------------------------------
// TICK – feste Reihenfolge:
// Input → Spieler → Bots → Physik → Waffen & Projektile → Bauen → Sturm → Loot → Aufräumen
// ---------------------------------------------------------------------
function tick(dt) {
  gameTime += dt;
  for (const a of actors) a.prev.copy(a.pos);

  // 1) Input
  if (player.alive) { samplePlayerInput(); handlePlayerActions(); }
  // 2) Spieler (Absicht → Geschwindigkeit) + Battle Bus
  updateBus(dt);
  if (player.alive && player.phase === 'ground') player.jumped = updateActorMovement(player, player.cmd, dt);
  // 3) Bots (KI max. 5×/s, Steuerung jeden Tick)
  updateBots(dt);
  for (const a of actors) if (a.ai && a.alive && a.phase === 'ground') a.jumped = updateActorMovement(a, a.cmd, dt);
  // 4) Physik
  for (const a of actors) {
    if (!a.alive) continue;
    if (a.phase === 'ground') groundPhysics(a, dt, a.jumped);
    else if (a.phase === 'freefall' || a.phase === 'glide') updateAirborne(a, a.cmd, dt);
    a.jumped = false;
  }
  // 5) Waffen & Projektile
  for (const a of actors) if (a.alive) updateActionTimers(a, dt);
  if (player.alive) updatePlayerCombat();
  updateParticles(dt);
  updateTracers(dt);
  updateDamageNumbers(dt);
  // 6) Bauen
  updatePlayerBuilding(dt);
  updateCollapse();
  // 7) Sturm
  updateStorm(dt);
  // 8) Loot
  updateLoot(dt);
  game.interactTarget = player.alive && player.phase === 'ground' ? findInteractable(player, CONFIG.player.interactRange) : null;
  // 9) Aufräumen
  cleanup();
  endInputTick();
  if (game.endAt && gameTime >= game.endAt) showEndScreen(game.victory);
}

function handlePlayerActions() {
  const pr = input.pressed, a = player;
  if (pr.has('F3')) { game.debug = !game.debug; $('debug').classList.toggle('hidden', !game.debug); setDebugVisible(game.debug); }
  if (pr.has('KeyM')) toggleBigMap();
  if (a.phase === 'bus') { if (a.cmd.jump && canJumpFromBus()) jumpFromBus(a); return; }
  if (a.phase !== 'ground') return;
  if (pr.has('KeyQ')) setMode(game.mode === 'build' ? 'combat' : 'build');
  if (pr.has('KeyF')) { setMode('combat'); selectSlot(a, -1); refreshHud(); }
  for (let i = 0; i < 5; i++) {
    if (pr.has('Slot' + i)) { if (game.mode === 'build') setMode('combat'); selectSlot(a, i); refreshHud(); }
  }
  for (let i = 0; i < 5; i++) {
    if (!pr.has('Digit' + (i + 1))) continue;
    if (game.mode === 'build' && i < PIECES.length) setPiece(PIECES[i]);
    else if (game.mode === 'combat') { selectSlot(a, i); refreshHud(); }
  }
  if (input.wheel !== 0) {
    if (game.mode === 'build') setPiece(PIECES[(PIECES.indexOf(game.piece) + (input.wheel > 0 ? 1 : -1) + PIECES.length) % PIECES.length]);
    else {
      const order = [-1, 0, 1, 2, 3, 4].filter((i) => i < 0 || a.inv.slots[i]);
      const cur = Math.max(0, order.indexOf(a.inv.sel));
      selectSlot(a, order[(cur + (input.wheel > 0 ? 1 : -1) + order.length) % order.length]);
      refreshHud();
    }
  }
  if (pr.has('KeyR')) startReload(a);
  if (pr.has('KeyE') && game.interactTarget) { interact(a, game.interactTarget); refreshHud(); }
  const it = currentItem(a);
  a.ads = game.mode === 'combat' && !!it && it.kind === 'weapon' && (input.adsHeld || input.adsToggle);
  if (!a.ads && !isTouchAdsWeapon()) input.adsToggle = false;
}

function isTouchAdsWeapon() { const it = currentItem(player); return !!(it && it.kind === 'weapon'); }

const _dir = { x: 0, y: 0, z: 0 };
function updatePlayerCombat() {
  const a = player;
  if (!input.fireHeld) a.burstShots = 0;
  if (game.mode !== 'combat' || a.phase !== 'ground') return;
  if (!(input.fireHeld || input.firePressed)) return;
  const it = currentItem(a);
  if (!it) {
    computeRig(a.pos, a.height, a.yaw, a.pitch, rig, 'ground', a.collider);
    swingPickaxe(a, rig.cx, rig.cy, rig.cz, rig.fx, rig.fy, rig.fz);
  } else if (it.kind === 'heal') {
    if (input.firePressed) startHeal(a);
  } else {
    playerAimDir(_dir);
    fireWeapon(a, _dir.x, _dir.y, _dir.z);
  }
}

function updatePlayerBuilding(dt) {
  const a = player;
  if (game.mode === 'build' && a.alive && a.phase === 'ground') {
    game.buildTarget = computeBuildTarget(a, game.piece);
    game.buildRepeat = Math.max(0, game.buildRepeat - dt);
    if (input.firePressed || (input.fireHeld && game.buildRepeat <= 0)) {
      const bt = game.buildTarget;
      if (bt.valid && a.inv.mats >= CONFIG.build.cost) {
        tryBuild(a, bt);
        game.buildTarget = computeBuildTarget(a, game.piece);
      } else if (input.firePressed) {
        sfx('deny');
        if (a.inv.mats < CONFIG.build.cost) toast('Zu wenig Holz – hacke Bäume, Steine oder Kisten');
      }
      game.buildRepeat = CONFIG.build.repeatDelay;
    }
  } else game.buildTarget = null;
  updateGhost(game.buildTarget, game.mode === 'build', a.inv.mats >= CONFIG.build.cost);
}

function cleanup() {
  while (trash.length) {
    const m = trash.pop();
    scene.remove(m);
  }
  cleanupEffects();
  cleanupLoot();
}

// ---------------------------------------------------------------------
// Rendering mit Interpolation zwischen den letzten zwei Ticks
// ---------------------------------------------------------------------
const renderPos = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
let lastFrameDt = 0;
function render(alpha, dt) {
  lastFrameDt = dt;
  if (gameState === 'start' || gameState === 'loading') {
    if (player && lobby.stage) renderLobby(dt);
    return;
  }
  if (player) {
    // Wem folgt die Kamera?
    let focus = player, mode = playerCamMode();
    if (!player.alive && game.spectate && game.spectate.alive) { focus = game.spectate; mode = focus.phase === 'ground' ? 'ground' : 'air'; }
    if (mode === 'bus') renderPos.lerpVectors(bus.prev, bus.pos, alpha);
    else renderPos.lerpVectors(focus.prev, focus.pos, alpha);
    const wantAds = player.ads ? 1 : 0;
    game.adsBlend += (wantAds - game.adsBlend) * Math.min(1, dt * 14);
    let camYaw = player.yaw, camPitch = player.pitch;
    if (focus !== player) {
      game.specYaw = game.specYaw === undefined ? focus.yaw : game.specYaw + angleDiff(game.specYaw, focus.yaw) * Math.min(1, dt * 4);
      camYaw = game.specYaw; camPitch = -0.15;
    }
    computeRig(renderPos, focus.height, camYaw, camPitch, rig, mode, focus.collider);
    camera.position.set(rig.cx, rig.cy, rig.cz);
    camera.lookAt(rig.cx + rig.fx, rig.cy + rig.fy, rig.cz + rig.fz);
    const it = currentItem(player);
    const adsFov = it && it.kind === 'weapon' && CONFIG.weapons[it.type].scope ? CONFIG.render.scopeFov : CONFIG.render.adsFov;
    const fov = lerp(CONFIG.render.fov, adsFov, game.adsBlend);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // Figuren
    const vis = CONFIG.render.visibleActorDistance;
    for (const a of actors) {
      if (!a.rpos) a.rpos = new THREE.Vector3();
      a.rpos.lerpVectors(a.prev, a.pos, alpha);
      const far = Math.abs(a.rpos.x - camera.position.x) + Math.abs(a.rpos.z - camera.position.z) > vis;
      if (far) { a.model.group.visible = false; continue; }
      animateCharacter(a, a.rpos, dt);
    }
    if (player.phase !== 'bus' && isScoped()) player.model.group.visible = false;
    renderBus(alpha);
    renderStorm();
    renderLoot(dt, camera.position.x, camera.position.z);
    sky.position.copy(camera.position);
    if (cloudGroup) cloudGroup.rotation.y += dt * 0.004;
    waterNormal.offset.x = (gameTime * 0.012) % 1; waterNormal.offset.y = (gameTime * 0.008) % 1;
    _camTarget.set(camera.position.x, 0, camera.position.z);
    sun.position.set(_camTarget.x + SUN_DIR.x * 150, SUN_DIR.y * 150, _camTarget.z + SUN_DIR.z * 150);
    sun.target.position.copy(_camTarget);
    if (gameState === 'playing' || gameState === 'ended') { updateTargetInfo(); updateHud(dt, game.interactTarget); }
    if (game.debug) { updateDebugDraw(renderPos); updateDebugText(dt); }
  }
  renderer.render(scene, camera);
  renderDamageNumbers();
}

function updateTargetInfo() {
  let shown = false;
  if (player.alive && player.phase === 'ground' && raycastWorld(camera.position.x, camera.position.y, camera.position.z, rig.fx, rig.fy, rig.fz, CONFIG.raycast.infoDistance + CONFIG.camera.distance, player.collider)) {
    const c = worldHit.collider;
    if (c && c.owner && c.owner.gridBox) {
      const o = c.owner;
      setText(HUD.targetLabel, PIECE_NAMES[o.type] + ' ' + Math.max(0, Math.ceil(o.hp)) + '/' + o.maxHp);
      setStyle(HUD.targetFill, 'width', (100 * Math.max(0, o.hp) / o.maxHp) + '%');
      shown = true;
    }
  }
  HUD.target.classList.toggle('hidden', !shown);
}

// ---------------------------------------------------------------------
// Hauptschleife mit festem Tick
// ---------------------------------------------------------------------
let accumulator = 0, lastTime = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > CONFIG.maxFrameTime) dt = CONFIG.maxFrameTime;
  if (gameState === 'playing' || gameState === 'ended') {
    accumulator += dt;
    let n = 0;
    while (accumulator >= TICK && n < CONFIG.maxTicksPerFrame) { tick(TICK); accumulator -= TICK; n++; }
    if (n >= CONFIG.maxTicksPerFrame) accumulator = 0;
  }
  render(gameState === 'playing' || gameState === 'ended' ? accumulator / TICK : 1, dt);
}

// ---------------------------------------------------------------------
// Qualität, Menüs
// ---------------------------------------------------------------------
function applyQuality() {
  const q = CONFIG.render.quality[settings.quality] || CONFIG.render.quality.mittel;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  if (renderer.shadowMap.enabled !== q.shadows || sun.shadow.mapSize.x !== q.shadowMap) {
    renderer.shadowMap.enabled = q.shadows;
    sun.castShadow = q.shadows;
    sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }
  scene.traverse((o) => { if (o.userData.grass) o.visible = q.grass > 0; });
  resize();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function applyTouchUI() { $('touchUI').classList.toggle('hidden', !(touchEnabled() && gameState === 'playing')); }

function startMatch() {
  initBus();
  planBotDrops();
  initStorm();
  announce('Willkommen im Battle Bus!');
}

function startGame() {
  initAudio();
  $('lobby').classList.add('hidden');
  $('helpPanel').classList.add('hidden');
  applyLobbySettings();
  $('hud').classList.remove('hidden');
  gameState = 'playing';
  lastTime = performance.now(); accumulator = 0;
  applyTouchUI();
  if (!touchEnabled() && document.body.requestPointerLock) document.body.requestPointerLock();
  startMatch();
}
function pauseGame() {
  if (gameState !== 'playing') return;
  gameState = 'paused';
  input.keys.clear(); input.fireHeld = false; input.adsHeld = false;
  input.joy.id = null; input.lookId = null; input.btnLook.clear(); joyBase.classList.add('hidden');
  $('optSens').value = settings.sens; $('optQuality').value = settings.quality;
  $('optTouch').value = settings.touch; $('optInvert').value = settings.invert; $('optSprint').value = settings.autoSprint;
  $('pauseMenu').classList.remove('hidden');
  applyTouchUI();
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}
function resumeGame() {
  $('pauseMenu').classList.add('hidden');
  gameState = 'playing';
  lastTime = performance.now(); accumulator = 0;
  applyTouchUI();
  if (!touchEnabled() && document.body.requestPointerLock) document.body.requestPointerLock();
}

$('btnResume').addEventListener('click', resumeGame);
$('btnQuit').addEventListener('click', () => location.reload());
$('btnAgain').addEventListener('click', () => location.reload());
$('btnAgain2').addEventListener('click', () => location.reload());
$('btnWatch').addEventListener('click', () => { $('endScreen').classList.add('hidden'); });
$('bigMap').addEventListener('pointerdown', (e) => { e.stopPropagation(); toggleBigMap(); });
$('btnFullscreen').addEventListener('click', () => {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) { try { const r = req.call(el); if (r && r.catch) r.catch(() => toast('Tipp: Teilen → „Zum Home-Bildschirm“ für Vollbild')); } catch (e) { toast('Vollbild nicht verfügbar'); } }
  else toast('Tipp: Teilen → „Zum Home-Bildschirm“ für Vollbild');
});
$('optSens').addEventListener('input', (e) => { settings.sens = parseFloat(e.target.value); saveSettings(); });
$('optQuality').addEventListener('change', (e) => { settings.quality = e.target.value; saveSettings(); applyQuality(); });
$('optTouch').addEventListener('change', (e) => { settings.touch = e.target.value; saveSettings(); });
$('optInvert').addEventListener('change', (e) => { settings.invert = e.target.value; saveSettings(); });
$('optSprint').addEventListener('change', (e) => { settings.autoSprint = e.target.value; saveSettings(); });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// Offline-Cache, wenn über http(s) geöffnet (Home-Bildschirm-App)
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Service Worker weiter */ });
}

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------
function init() {
  $('controlsKeyboard').classList.toggle('hidden', isTouchDevice && !matchMedia('(pointer: fine)').matches);
  $('controlsTouch').classList.toggle('hidden', !isTouchDevice);
  buildWorld();
  buildMapBase();
  populateLoot();
  lobby.skin = clamp(lobby.skin | 0, 0, SKINS.length - 1);
  lobby.bots = clamp(lobby.bots | 0, 1, CONFIG.match.players - 1);
  if (!DIFF_HINTS[lobby.difficulty]) lobby.difficulty = 'mittel';
  player = createActor({ name: lobby.name || 'Du', isPlayer: true, outfit: SKINS[lobby.skin].outfit });
  initBots(CONFIG.match.players - 1);
  buildLobbyStage();
  setupLobbyUI();
  player.yaw = 0; player.pitch = -0.25;
  applyQuality();
  refreshHud();
  camera.position.set(0, 110, 300);
  camera.lookAt(0, 5, 0);
  renderer.compile(scene, camera);
  player.phase = 'bus';
  gameState = 'start';
  $('loadingText').classList.add('hidden');
  $('btnStart').classList.remove('hidden');
  requestAnimationFrame(frame);
}

// Für automatisierte Tests / Debug-Konsole
window.__game = {
  CONFIG, grid, parts, items, chests, actors, storm, bus, game, input,
  tick: (n) => { for (let i = 0; i < n; i++) tick(TICK); },
  getHeight, raycastWorld, worldHit, evaluatePlacement, placePart, destroyPart, computeBuildTarget,
  makeWeapon, makeHeal, makeAmmo, addToInventory, selectSlot, jumpFromBus, openChest, applyDamage,
  get player() { return player; }, get state() { return gameState; }, collapseQueue, lobby,
  startNow: () => { $('lobby').classList.add('hidden'); startGame(); },
};

setTimeout(init, 30);
