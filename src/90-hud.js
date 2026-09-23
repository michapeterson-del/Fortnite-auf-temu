// ---------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------
const hudCache = new Map();
function setText(el, txt) { if (hudCache.get(el) !== txt) { hudCache.set(el, txt); el.textContent = txt; } }
function setStyle(el, prop, v) { const k = prop; const key = el.id + k; if (hudCache.get(key) !== v) { hudCache.set(key, v); el.style[prop] = v; } }

const HUD = {
  hpFill: $('hpFill'), hpText: $('hpText'), shFill: $('shFill'), shText: $('shText'),
  hotbar: $('hotbar'), ammo: $('ammoInfo'), mats: $('matsInfo'), buildBar: $('buildBar'),
  alive: $('aliveCount'), kills: $('killCount'), storm: $('stormInfo'),
  prompt: $('prompt'), progress: $('progress'), progressLabel: $('progressLabel'), progressFill: $('progressFill'),
  announce: $('announce'), feed: $('killFeed'), vignette: $('vignette'), stormTint: $('stormTint'),
  scope: $('scope'), crosshair: $('crosshair'), hitmarker: $('hitmarker'), altimeter: $('altimeter'),
  target: $('targetInfo'), targetLabel: $('targetLabel'), targetFill: $('targetFill'),
  btnInteract: $('btnInteract'), btnAction: $('btnAction'), btnBuild: $('btnBuild'), buildBtns: $('buildBtns'),
  btnJump: $('btnJump'), btnAds: $('btnAds'),
};

function isScoped() {
  if (!player || !player.ads) return false;
  const it = currentItem(player);
  return !!(it && it.kind === 'weapon' && CONFIG.weapons[it.type].scope);
}

function slotLabel(it) {
  if (!it) return ['', ''];
  if (it.kind === 'weapon') return [CONFIG.weapons[it.type].short, String(it.mag)];
  return [CONFIG.heals[it.type].short, '×' + it.count];
}

// ---------------------------------------------------------------------
// Bilder für die Hotbar: aus den Bauteilen der 3D-Modelle gezeichnet
// (Waffen/Spitzhacke in Seitenansicht, Heilung von vorne)
// ---------------------------------------------------------------------
const iconCache = new Map();
function hexCss(c) { return '#' + c.toString(16).padStart(6, '0'); }
function drawPartsIcon(parts, side) {
  const W2 = 128, H2 = 72, pad = 6;
  const rects = parts.map((p) => {
    let w, h, rot = 0, cx, cy;
    if (side) {
      cx = -(p.z || 0); cy = p.y || 0;
      if (p.cyl && Math.abs((p.rx || 0) - Math.PI / 2) < 0.01) { w = p.sy; h = p.sx; }
      else { w = p.sz; h = p.sy; rot = -(p.rx || 0); }
    } else { cx = p.x || 0; cy = p.y || 0; w = p.sx; h = p.sy; }
    return { cx, cy, w, h, rot, c: p.c, cyl: !!p.cyl && !side };
  });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of rects) {
    const ext = Math.max(r.w, r.h) * (r.rot ? 0.6 : 0.5);
    const ex = r.rot ? ext : r.w / 2, ey = r.rot ? ext : r.h / 2;
    x0 = Math.min(x0, r.cx - ex); x1 = Math.max(x1, r.cx + ex); y0 = Math.min(y0, r.cy - ey); y1 = Math.max(y1, r.cy + ey);
  }
  const s = Math.min((W2 - 2 * pad) / (x1 - x0), (H2 - 2 * pad) / (y1 - y0));
  const c = document.createElement('canvas');
  c.width = W2; c.height = H2;
  const g = c.getContext('2d');
  g.translate(W2 / 2 - (x0 + x1) / 2 * s, H2 / 2 + (y0 + y1) / 2 * s);
  g.lineJoin = 'round';
  for (const r of rects) {
    g.save();
    g.translate(r.cx * s, -r.cy * s);
    g.rotate(r.rot);
    g.fillStyle = hexCss(r.c);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1.5;
    const w = Math.max(2, r.w * s), h = Math.max(2, r.h * s);
    if (r.cyl) { g.beginPath(); g.roundRect ? g.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.3) : g.rect(-w / 2, -h / 2, w, h); g.fill(); g.stroke(); }
    else { g.fillRect(-w / 2, -h / 2, w, h); g.strokeRect(-w / 2, -h / 2, w, h); }
    g.restore();
  }
  return c.toDataURL();
}
function itemIcon(it) {
  const key = it ? it.kind + ':' + it.type + ':' + (it.kind === 'weapon' ? it.rarity : '') : 'pickaxe';
  let url = iconCache.get(key);
  if (url) return url;
  if (!it) url = drawPartsIcon([{ sx: 0.05, sy: 0.05, sz: 0.75, z: -0.3, c: 0x8a5a33 }, { sx: 0.06, sy: 0.5, sz: 0.08, z: -0.66, c: 0x9aa6b2 }, { sx: 0.07, sy: 0.12, sz: 0.1, z: -0.66, c: 0x3fa9ff }], true);
  else if (it.kind === 'weapon') url = drawPartsIcon(weaponParts(it.type, CONFIG.rarities[it.rarity].color), true);
  else url = drawPartsIcon(healParts(it.type), false);
  iconCache.set(key, url);
  return url;
}

// Hotbar und Modus-Anzeige neu aufbauen (nur bei Änderungen)
function refreshHud() {
  if (!player) return;
  const build = game.mode === 'build';
  const slots = HUD.hotbar.querySelectorAll('.hslot');
  slots.forEach((el) => {
    const idx = el.dataset.btn === 'pickaxe' ? -1 : parseInt(el.dataset.btn.slice(4), 10);
    const it = idx >= 0 ? player.inv.slots[idx] : null;
    const [name, sub] = idx < 0 ? ['⛏', ''] : slotLabel(it);
    el.querySelector('.n').textContent = name;
    el.querySelector('.s').textContent = sub;
    const ic = el.querySelector('.ic'), url = idx < 0 || it ? itemIcon(it) : '';
    if (ic.getAttribute('src') !== url) ic.setAttribute('src', url);
    el.classList.toggle('has-ic', !!url);
    el.style.background = it ? 'linear-gradient(180deg,' + CONFIG.rarities[it.rarity].css + 'cc, rgba(10,16,32,.7))' : '';
    el.classList.toggle('active', !build && player.inv.sel === idx);
    el.classList.toggle('empty', idx >= 0 && !it);
  });
  HUD.buildBar.classList.toggle('hidden', !build);
  HUD.buildBar.querySelectorAll('.bslot').forEach((s) => s.classList.toggle('active', s.dataset.slot === game.piece));
  HUD.btnAction.textContent = build ? 'Bauen' : (currentItem(player) && currentItem(player).kind === 'heal' ? 'Nutzen' : 'Feuer');
  HUD.btnBuild.classList.toggle('on', build);
  HUD.btnBuild.textContent = build ? 'Kampf' : 'Bauen';
  HUD.buildBtns.classList.toggle('hidden', !build);
  HUD.buildBtns.querySelectorAll('.tbtn').forEach((b) => b.classList.toggle('on', b.dataset.btn === game.piece));
}

function hitmarker(head) {
  const el = HUD.hitmarker;
  el.classList.remove('show', 'head');
  void el.offsetWidth;
  el.classList.add('show');
  if (head) el.classList.add('head');
  sfx(head ? 'head' : 'hitmarker');
}

let vignetteT = 0;
function onPlayerDamaged(amount, attacker, source) {
  vignetteT = 0.5;
  if (source !== 'storm') sfx('hurt');
}

let toastTimer = 0;
function toast(text) {
  const el = $('toast'); el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

let announceTimer = 0;
function announce(text) {
  HUD.announce.textContent = text;
  HUD.announce.classList.add('show');
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => HUD.announce.classList.remove('show'), 3200);
}

function addKillFeed(text, highlight) {
  const el = document.createElement('div');
  el.className = 'feed' + (highlight ? ' me' : '');
  el.textContent = text;
  HUD.feed.prepend(el);
  while (HUD.feed.children.length > 5) HUD.feed.lastChild.remove();
  setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 600); }, 5000);
}

// ---------------------------------------------------------------------
// Minikarte + große Karte
// ---------------------------------------------------------------------
const MAP_RES = 256;
const mapBase = document.createElement('canvas');
function buildMapBase() {
  mapBase.width = mapBase.height = MAP_RES;
  const g = mapBase.getContext('2d');
  const img = g.createImageData(MAP_RES, MAP_RES);
  const nrm = { x: 0, y: 1, z: 0 };
  for (let j = 0; j < MAP_RES; j++) for (let i = 0; i < MAP_RES; i++) {
    const x = (i + 0.5) / MAP_RES * W.size - HALF, z = (j + 0.5) / MAP_RES * W.size - HALF;
    const h = getHeight(x, z);
    let r, gg, b;
    if (h < W.waterLevel) { const d = clamp(-h / 8, 0, 1); r = 40 - d * 20; gg = 130 - d * 50; b = 200 - d * 40; }
    else if (h < W.waterLevel + 1) { r = 226; gg = 207; b = 150; }
    else {
      getNormal(x, z, nrm);
      const shade = clamp(0.75 + (nrm.x - nrm.z) * 1.2, 0.5, 1.2);
      if (nrm.y < 0.8) { r = 138 * shade; gg = 129 * shade; b = 117 * shade; }
      else { const t = clamp(h / W.maxHeight, 0, 1); r = (95 + t * 40) * shade; gg = (170 - t * 30) * shade; b = (75 + t * 20) * shade; }
    }
    const k = (j * MAP_RES + i) * 4;
    img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#e8e2d6'; g.strokeStyle = '#555';
  for (const hs of houses) {
    const s = MAP_RES / W.size;
    const x = (hs.x - hs.w / 2 + HALF) * s, y = (hs.z - hs.d / 2 + HALF) * s;
    g.fillRect(x, y, hs.w * s, hs.d * s); g.strokeRect(x, y, hs.w * s, hs.d * s);
  }
}

function drawMap(ctx, size, cx, cz, span, big) {
  const s = size / span;                      // Pixel pro Meter
  const toX = (x) => (x - cx) * s + size / 2, toY = (z) => (z - cz) * s + size / 2;
  ctx.fillStyle = '#1f5f9e'; ctx.fillRect(0, 0, size, size);
  const px = MAP_RES / W.size;
  ctx.drawImage(mapBase, (cx - span / 2 + HALF) * px, (cz - span / 2 + HALF) * px, span * px, span * px, 0, 0, size, size);
  if (storm.active) {
    ctx.save();
    ctx.fillStyle = 'rgba(120,40,210,0.38)';
    ctx.beginPath(); ctx.rect(0, 0, size, size);
    ctx.arc(toX(storm.cx), toY(storm.cz), Math.max(0.5, storm.r * s), 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(200,120,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(toX(storm.cx), toY(storm.cz), Math.max(0.5, storm.r * s), 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = big ? 2 : 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(toX(storm.toX), toY(storm.toZ), Math.max(0.5, storm.toR * s), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  if (bus.active) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(toX(bus.sx), toY(bus.sz)); ctx.lineTo(toX(bus.ex), toY(bus.ez)); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(toX(bus.pos.x), toY(bus.pos.z), 5, 0, Math.PI * 2); ctx.fill();
  }
  if (player && player.alive) {
    const x = toX(player.pos.x), y = toY(player.pos.z);
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(fz, fx) + Math.PI / 2);
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

const miniCanvas = $('minimap'), miniCtx = miniCanvas.getContext('2d');
const bigCanvas = $('bigMapCanvas'), bigCtx = bigCanvas.getContext('2d');
let mapTimer = 0;
function updateMaps(dt) {
  mapTimer -= dt;
  if (mapTimer > 0) return;
  mapTimer = 0.1;
  const p = player.alive ? player.pos : camera.position;
  const span = bus.active || player.phase === 'freefall' ? W.size : 220;
  const cx = span >= W.size ? 0 : clamp(p.x, -HALF + span / 2, HALF - span / 2);
  const cz = span >= W.size ? 0 : clamp(p.z, -HALF + span / 2, HALF - span / 2);
  drawMap(miniCtx, miniCanvas.width, cx, cz, span, false);
  if (!$('bigMap').classList.contains('hidden')) drawMap(bigCtx, bigCanvas.width, 0, 0, W.size, true);
}

function toggleBigMap() { $('bigMap').classList.toggle('hidden'); mapTimer = 0; }

// ---------------------------------------------------------------------
// HUD pro Frame
// ---------------------------------------------------------------------
function updateHud(dt, interactTarget) {
  const P = CONFIG.player, a = player;
  // Ausgeschieden: eigene Anzeigen weg, klarer Zuschau-Hinweis
  const dead = !a.alive;
  $('hotbarWrap').classList.toggle('hidden', dead);
  $('statusBars').classList.toggle('hidden', dead);
  $('spectateBar').classList.toggle('hidden', !dead || !$('endScreen').classList.contains('hidden'));
  if (dead) {
    const f = game.spectate && game.spectate.alive ? game.spectate : null;
    setText($('spectateText'), 'Du bist raus (Platz #' + a.placement + ')' + (f ? ' – du schaust ' + f.name + ' zu' : ''));
  }
  setStyle(HUD.hpFill, 'width', Math.max(0, a.hp) / P.maxHp * 100 + '%');
  setText(HUD.hpText, String(Math.max(0, Math.ceil(a.hp))));
  setStyle(HUD.shFill, 'width', a.shield / P.maxShield * 100 + '%');
  setText(HUD.shText, String(Math.ceil(a.shield)));
  setText(HUD.alive, '👤 ' + aliveActors());
  setText(HUD.kills, '💀 ' + a.kills);
  setText(HUD.storm, a.phase === 'bus' ? 'Battle Bus' : stormStatusText());
  setText(HUD.mats, '🪵 ' + a.inv.mats);
  const it = currentItem(a);
  if (it && it.kind === 'weapon') {
    const w = CONFIG.weapons[it.type];
    setText(HUD.ammo, it.mag + ' / ' + a.inv.ammo[w.ammo]);
    HUD.ammo.classList.toggle('low', it.mag === 0);
  } else setText(HUD.ammo, '');
  // Hotbar-Zahlen (Magazin) live halten
  if (it && it.kind === 'weapon') {
    const el = HUD.hotbar.querySelector('[data-btn="slot' + a.inv.sel + '"] .s');
    if (el) setText(el, String(it.mag));
  }
  // Fortschritt (Heilen / Nachladen)
  let prog = null;
  if (a.healTimer > 0) prog = ['Heilen: ' + CONFIG.heals[it.type].name, 1 - a.healTimer / a.healTotal];
  else if (a.reloadTimer > 0) prog = ['Nachladen', 1 - a.reloadTimer / a.reloadTotal];
  HUD.progress.classList.toggle('hidden', !prog);
  if (prog) { setText(HUD.progressLabel, prog[0]); setStyle(HUD.progressFill, 'width', (prog[1] * 100).toFixed(0) + '%'); }
  // Interaktion
  let promptText = '';
  if (a.phase === 'bus') promptText = canJumpFromBus() ? (touchEnabled() ? 'Tippe „Sprung“ zum Abspringen' : 'Leertaste: Abspringen') : 'Gleich geht die Tür auf …';
  else if (a.phase === 'freefall') promptText = (touchEnabled() ? '„Sprung“' : 'Leertaste') + ': Gleiter öffnen';
  else if (interactTarget) {
    const t = interactTarget.chest ? 'Truhe öffnen' : 'Aufheben: ' + itemName(interactTarget.item.it);
    promptText = (touchEnabled() ? '' : 'E: ') + t;
  }
  setText(HUD.prompt, promptText);
  HUD.prompt.classList.toggle('hidden', !promptText);
  HUD.btnInteract.classList.toggle('hidden', !interactTarget || a.phase !== 'ground');
  HUD.btnJump.textContent = a.phase === 'bus' ? 'Ab-springen' : a.phase === 'freefall' ? 'Gleiter' : 'Sprung';
  // Höhenmesser
  const air = a.phase === 'bus' || a.phase === 'freefall' || a.phase === 'glide';
  HUD.altimeter.classList.toggle('hidden', !air);
  if (air) setText(HUD.altimeter, Math.max(0, Math.round(a.pos.y - getHeight(a.pos.x, a.pos.z))) + ' m');
  // Vignetten
  vignetteT = Math.max(0, vignetteT - dt);
  setStyle(HUD.vignette, 'opacity', String(Math.min(1, vignetteT * 2)));
  setStyle(HUD.stormTint, 'opacity', a.alive && a.phase !== 'bus' && !inStormSafe(a.pos.x, a.pos.z) ? '1' : '0');
  const scoped = isScoped();
  HUD.scope.classList.toggle('hidden', !scoped);
  HUD.crosshair.classList.toggle('hidden', scoped);
  HUD.btnAds.classList.toggle('on', a.ads);
  updateMaps(dt);
}

let endShown = false;
function showEndScreen(victory) {
  if (endShown) return;
  endShown = true;
  gameState = 'ended';
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  $('endTitle').textContent = victory ? '#1 VICTORY ROYALE' : 'Platz #' + player.placement;
  $('endTitle').classList.toggle('win', victory);
  const killer = player.lastAttacker;
  $('endText').textContent = victory
    ? 'Du hast alle ' + (CONFIG.match.players - 1) + ' Gegner überlebt!'
    : (killer && killer !== player ? 'Eliminiert von ' + killer.name : 'Du wurdest eliminiert');
  $('endKills').textContent = 'Eliminierungen: ' + player.kills;
  $('endScreen').classList.remove('hidden');
  $('touchUI').classList.add('hidden');
  if (victory) for (let i = 0; i < 6; i++) setTimeout(() => spawnParticles(player.pos.x, player.pos.y + 3, player.pos.z, pick([0xffd23f, 0x3fa9ff, 0xff4d6d, 0x6fe06f]), 25, 8, 0.4, 1.6, true), i * 250);
}

// ---------------------------------------------------------------------
// Debug-Modus (F3)
// ---------------------------------------------------------------------
const dbgGeo = new THREE.BufferGeometry();
const dbgPos = new Float32Array(CONFIG.debug.maxLines * 6);
const dbgCol = new Float32Array(CONFIG.debug.maxLines * 6);
dbgGeo.setAttribute('position', new THREE.BufferAttribute(dbgPos, 3));
dbgGeo.setAttribute('color', new THREE.BufferAttribute(dbgCol, 3));
const dbgLines = new THREE.LineSegments(dbgGeo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, toneMapped: false }));
dbgLines.frustumCulled = false; dbgLines.visible = false; dbgLines.renderOrder = 20;
scene.add(dbgLines);
const wireMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, wireframe: true, depthTest: false, transparent: true });
const headWireMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, wireframe: true, depthTest: false, transparent: true });
const headWireGeo = new THREE.SphereGeometry(CONFIG.player.headRadius, 10, 6);
const actorWires = new Map();
let dbgCount = 0;
const _col = new THREE.Color();

function dbgLine(x0, y0, z0, x1, y1, z1, color) {
  if (dbgCount >= CONFIG.debug.maxLines) return;
  const i = dbgCount * 6;
  dbgPos[i] = x0; dbgPos[i + 1] = y0; dbgPos[i + 2] = z0; dbgPos[i + 3] = x1; dbgPos[i + 4] = y1; dbgPos[i + 5] = z1;
  _col.setHex(color);
  dbgCol[i] = dbgCol[i + 3] = _col.r; dbgCol[i + 1] = dbgCol[i + 4] = _col.g; dbgCol[i + 2] = dbgCol[i + 5] = _col.b;
  dbgCount++;
}
function dbgBox(mn, mx, color) {
  const [a, b, c] = mn, [d, e, f] = mx;
  dbgLine(a, b, c, d, b, c, color); dbgLine(a, b, f, d, b, f, color); dbgLine(a, e, c, d, e, c, color); dbgLine(a, e, f, d, e, f, color);
  dbgLine(a, b, c, a, e, c, color); dbgLine(d, b, c, d, e, c, color); dbgLine(a, b, f, a, e, f, color); dbgLine(d, b, f, d, e, f, color);
  dbgLine(a, b, c, a, b, f, color); dbgLine(d, b, c, d, b, f, color); dbgLine(a, e, c, a, e, f, color); dbgLine(d, e, c, d, e, f, color);
}
function dbgSurface(c, color) {
  const n = 4, x0 = c.min[0], z0 = c.min[2], sx = (c.max[0] - x0) / n, sz = (c.max[2] - z0) / n;
  for (let i = 0; i <= n; i++) for (let j = 0; j < n; j++) {
    const xa = x0 + i * sx, za = z0 + j * sz, zb = za + sz;
    dbgLine(xa, surfaceHeight(c, xa, za), za, xa, surfaceHeight(c, xa, zb), zb, color);
    const xb = x0 + j * sx, xc = xb + sx, zc = z0 + i * sz;
    dbgLine(xb, surfaceHeight(c, xb, zc), zc, xc, surfaceHeight(c, xc, zc), zc, color);
  }
}

function actorWire(a) {
  let w = actorWires.get(a);
  if (!w) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(a.radius, 1, 4, 10), wireMat);
    const head = new THREE.Mesh(headWireGeo, headWireMat);
    w = { body, head, len: -1 };
    scene.add(body, head); actorWires.set(a, w);
  }
  return w;
}

function setDebugVisible(v) {
  dbgLines.visible = v;
  for (const w of actorWires.values()) { w.body.visible = v; w.head.visible = v; }
}

const dbgList = [];
function updateDebugDraw(renderPos) {
  dbgCount = 0;
  const R = CONFIG.debug.colliderRange;
  qMin[0] = renderPos.x - R; qMin[1] = renderPos.y - R; qMin[2] = renderPos.z - R;
  qMax[0] = renderPos.x + R; qMax[1] = renderPos.y + R; qMax[2] = renderPos.z + R;
  grid.query(qMin, qMax, dbgList);
  for (const c of dbgList) {
    if (c.kind === 'box') dbgBox(c.min, c.max, c.owner ? 0x3fa9ff : 0x9cff57);
    else if (c.kind === 'surface') dbgSurface(c, 0xff9a3f);
  }
  const cs = CONFIG.grid.cellSize;
  const cx = Math.floor(renderPos.x / cs), cy = Math.floor((renderPos.y + 0.9) / cs), cz = Math.floor(renderPos.z / cs);
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
    const own = i === 0 && k === 0;
    dbgBox([(cx + i) * cs, cy * cs, (cz + k) * cs], [(cx + i + 1) * cs, (cy + 1) * cs, (cz + k + 1) * cs], own ? 0xffe23f : 0x8a7a2a);
  }
  dbgGeo.attributes.position.needsUpdate = true;
  dbgGeo.attributes.color.needsUpdate = true;
  dbgGeo.setDrawRange(0, dbgCount * 2);
  // Hitboxen als Drahtgitter (nur Figuren in der Nähe)
  for (const a of actors) {
    const pos = a === player ? renderPos : a.pos;
    const near = a.alive && a.phase !== 'bus' && pos.distanceTo(renderPos) < 60;
    if (!near) { const w = actorWires.get(a); if (w) { w.body.visible = false; w.head.visible = false; } continue; }
    const w = actorWire(a);
    const hr = CONFIG.player.headRadius;
    const bodyLen = Math.max(0.01, a.height - 2 * hr - a.radius);
    if (Math.abs(w.len - bodyLen) > 1e-3) {
      w.body.geometry.dispose();
      w.body.geometry = new THREE.CapsuleGeometry(a.radius, bodyLen, 4, 10);
      w.len = bodyLen;
    }
    const y0 = pos.y + a.radius, y1 = pos.y + a.height - 2 * hr;
    w.body.position.set(pos.x, (y0 + y1) / 2, pos.z);
    w.head.position.set(pos.x, pos.y + a.height - hr, pos.z);
    w.body.visible = w.head.visible = true;
  }
}

const dbgText = $('debug');
let dbgTimer = 0, fpsFrames = 0, fpsTime = 0, fps = 0;
function updateDebugText(dt) {
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) { fps = fpsFrames / fpsTime; fpsFrames = 0; fpsTime = 0; }
  dbgTimer -= dt;
  if (dbgTimer > 0) return;
  dbgTimer = CONFIG.debug.textInterval;
  const p = player.pos;
  const tile = Math.floor(p.x / T) + '|' + Math.floor((p.y + CONFIG.build.levelBias) / H) + '|' + Math.floor(p.z / T);
  const cs = CONFIG.grid.cellSize;
  const g = player.groundCollider;
  dbgText.textContent =
    'FPS        ' + fps.toFixed(0) + '\n' +
    'Position   ' + p.x.toFixed(2) + ' / ' + p.y.toFixed(2) + ' / ' + p.z.toFixed(2) + '\n' +
    'Kachel     ' + tile + '\n' +
    'Grid-Zelle ' + Math.floor(p.x / cs) + '|' + Math.floor(p.y / cs) + '|' + Math.floor(p.z / cs) + '\n' +
    'Phase      ' + player.phase + (player.onGround ? (g ? (g.owner && g.owner.type ? ' auf ' + PIECE_NAMES[g.owner.type] : ' auf Objekt') : ' auf Terrain') : '') + '\n' +
    'Tempo      ' + Math.hypot(player.vel.x, player.vel.z).toFixed(2) + ' m/s\n' +
    'Collider   ' + grid.count + '  (Zellen ' + grid.cells.size + ')\n' +
    'Bauteile   ' + parts.size + '  Einsturz-Queue ' + collapseQueue.length + '\n' +
    'Loot       ' + items.length + ' Gegenstände, ' + chests.filter((c) => !c.opened).length + ' Truhen zu\n' +
    'Pools      Partikel ' + particles.used + '/' + CONFIG.effects.poolSize + ', Tracer ' + tracers.used + '/' + CONFIG.effects.tracerPool + '\n' +
    'Figuren    ' + aliveActors() + ' leben\n' +
    'Szene      ' + scene.children.length + ' Objekte, ' + renderer.info.render.calls + ' Draw Calls';
}
