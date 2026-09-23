// ---------------------------------------------------------------------
// Bau-Raster: Map mit Key "typ|x|y|z|richtung"
// ---------------------------------------------------------------------
const parts = new Map();
const collapseQueue = [];
const trash = [];
const DIRS = ['N', 'E', 'S', 'W'];
const DIR_VEC = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const DIR_YAW = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };
const PIECES = ['wall', 'floor', 'ramp', 'roof'];
const PIECE_NAMES = { wall: 'Wand', floor: 'Boden', ramp: 'Rampe', roof: 'Dach' };

const RAMP_LEN = Math.hypot(T, H);
const RAMP_ANGLE = Math.atan2(H, T);
const buildGeo = {
  wall: new THREE.BoxGeometry(T, H, TH),
  floor: new THREE.BoxGeometry(T, TH, T),
  ramp: new THREE.BoxGeometry(T, TH, RAMP_LEN),
  roof: new THREE.ConeGeometry(T / Math.SQRT2, CONFIG.build.roofRise, 4),
};
const buildMat = texMat('wood', 0xffffff);
const ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x3fa9ff, transparent: true, opacity: 0.42, depthWrite: false });
const ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.42, depthWrite: false });

function partKey(type, x, y, z, dir) { return type + '|' + x + '|' + y + '|' + z + '|' + dir; }

// Wand-Normalisierung: nur Nord- und West-Kanten werden gespeichert
function normalizeWall(x, z, dir) {
  if (dir === 'S') return { x, z: z + 1, dir: 'N' };
  if (dir === 'E') return { x: x + 1, z, dir: 'W' };
  return { x, z, dir };
}

function applyPartTransform(obj, type, x, y, z, dir) {
  obj.rotation.order = 'YXZ';
  obj.rotation.set(0, 0, 0);
  if (type === 'wall') {
    if (dir === 'N') obj.position.set((x + 0.5) * T, y * H + H / 2, z * T);
    else { obj.position.set(x * T, y * H + H / 2, (z + 0.5) * T); obj.rotation.y = Math.PI / 2; }
  } else if (type === 'floor') {
    obj.position.set((x + 0.5) * T, y * H, (z + 0.5) * T);
  } else if (type === 'ramp') {
    obj.position.set((x + 0.5) * T, y * H + H / 2, (z + 0.5) * T);
    obj.rotation.y = DIR_YAW[dir]; obj.rotation.x = RAMP_ANGLE;
    obj.updateMatrix();
    obj.translateY(-TH / 2);
  } else if (type === 'roof') {
    obj.position.set((x + 0.5) * T, y * H + CONFIG.build.roofRise / 2, (z + 0.5) * T);
    obj.rotation.y = Math.PI / 4;
  }
  obj.updateMatrix();
}

// Gitter-Box in Kachel-/Stockwerk-Einheiten (für die Nachbarschaft)
function partGridBox(type, x, y, z, dir) {
  if (type === 'floor' || type === 'roof') return [x, y, z, x + 1, y, z + 1];
  if (type === 'wall') return dir === 'N' ? [x, y, z, x + 1, y + 1, z] : [x, y, z, x, y + 1, z + 1];
  return [x, y, z, x + 1, y + 1, z + 1];
}

// Verbunden = gemeinsame Kante oder Fläche (Schnittmenge mind. 1-dimensional)
function boxesShareEdge(a, b) {
  let dims = 0;
  for (let i = 0; i < 3; i++) {
    const lo = Math.max(a[i], b[i]), hi = Math.min(a[i + 3], b[i + 3]);
    if (hi < lo) return false;
    if (hi > lo) dims++;
  }
  return dims >= 1;
}

function partFootprint(type, x, y, z, dir) {
  if (type === 'wall') {
    if (dir === 'N') return { bottom: y * H, x0: x * T, x1: (x + 1) * T, z0: z * T - TH / 2, z1: z * T + TH / 2 };
    return { bottom: y * H, x0: x * T - TH / 2, x1: x * T + TH / 2, z0: z * T, z1: (z + 1) * T };
  }
  const bottom = type === 'floor' ? y * H - TH / 2 : y * H;
  return { bottom, x0: x * T, x1: (x + 1) * T, z0: z * T, z1: (z + 1) * T };
}

// Geerdet: Unterkante ≤ 0,5 m über Terrain an 4 Ecken + Mitte, oder auf Gebäude-Fundament
function computeGrounded(type, x, y, z, dir) {
  const f = partFootprint(type, x, y, z, dir);
  const tol = CONFIG.build.groundTolerance;
  const pts = [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1], [(f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2]];
  for (const [px, pz] of pts) if (f.bottom - getHeight(px, pz) <= tol) return true;
  qMin[0] = f.x0; qMin[1] = f.bottom - tol - 0.1; qMin[2] = f.z0;
  qMax[0] = f.x1; qMax[1] = f.bottom + 0.3; qMax[2] = f.z1;
  grid.query(qMin, qMax, qList);
  for (const c of qList) if (c.foundation && c.max[1] >= f.bottom - tol && c.max[1] <= f.bottom + 0.3) return true;
  return false;
}

function findNeighbors(type, x, y, z, dir, out) {
  const gb = partGridBox(type, x, y, z, dir);
  out.length = 0;
  for (const p of parts.values()) {
    if (!p.alive || p.doomed) continue;
    if (Math.abs(p.x - x) > 1 || Math.abs(p.y - y) > 1 || Math.abs(p.z - z) > 1) continue;
    if (boxesShareEdge(gb, p.gridBox)) out.push(p);
  }
  return out;
}

function tileHasType(type, x, y, z) {
  for (const d of DIRS) if (parts.has(partKey(type, x, y, z, d))) return true;
  return parts.has(partKey(type, x, y, z, '-'));
}

const nbTmp = [];
function evaluatePlacement(type, x, y, z, dir) {
  let key;
  if (type === 'wall') { const n = normalizeWall(x, z, dir); x = n.x; z = n.z; dir = n.dir; key = partKey('wall', x, y, z, dir); }
  else if (type === 'ramp') key = partKey('ramp', x, y, z, dir);
  else { dir = '-'; key = partKey(type, x, y, z, dir); }
  const res = { type, x, y, z, dir, key, valid: true, grounded: false };
  if (parts.has(key)) res.valid = false;
  if (type === 'ramp' && tileHasType('ramp', x, y, z)) res.valid = false;
  if (type === 'floor' && parts.has(partKey('roof', x, y, z, '-'))) res.valid = false;
  if (type === 'roof' && parts.has(partKey('floor', x, y, z, '-'))) res.valid = false;
  const f = partFootprint(type, x, y, z, dir);
  const top = type === 'wall' || type === 'ramp' ? f.bottom + H : f.bottom + TH;
  if (top < getHeight((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2) - CONFIG.build.maxBury) res.valid = false;
  if (res.valid) {
    res.grounded = computeGrounded(type, x, y, z, dir);
    if (!res.grounded && findNeighbors(type, x, y, z, dir, nbTmp).length === 0) res.valid = false;
  }
  return res;
}

function makeRampPlanes(x, y, z, dir) {
  const [vx, vz] = DIR_VEC[dir];
  const cx = (x + 0.5) * T, cz = (z + 0.5) * T;
  const lowX = cx - vx * T / 2, lowZ = cz - vz * T / 2;
  const k = H / T, base = y * H;
  return [{ a: k * vx, b: k * vz, c: base - k * (vx * lowX + vz * lowZ) }];
}

function makeRoofPlanes(x, y, z) {
  const R = CONFIG.build.roofRise, half = T / 2;
  const cx = (x + 0.5) * T, cz = (z + 0.5) * T, base = y * H;
  const planes = [];
  for (const d of DIRS) {
    const [ox, oz] = DIR_VEC[d];
    const k = R / half;
    planes.push({ a: -k * ox, b: -k * oz, c: base + R + k * (ox * cx + oz * cz) });
  }
  return planes;
}

function createPartColliders(part) {
  const { type, x, y, z, dir } = part;
  const cols = [];
  if (type === 'wall' || type === 'floor') {
    const f = partFootprint(type, x, y, z, dir);
    const top = type === 'wall' ? f.bottom + H : f.bottom + TH;
    cols.push(makeCollider('box', f.x0, f.bottom, f.z0, f.x1, top, f.z1, part));
  } else if (type === 'ramp' || type === 'roof') {
    const top = type === 'ramp' ? (y + 1) * H : y * H + CONFIG.build.roofRise;
    const c = makeCollider('surface', x * T, y * H - TH, z * T, (x + 1) * T, top, (z + 1) * T, part);
    c.planes = type === 'ramp' ? makeRampPlanes(x, y, z, dir) : makeRoofPlanes(x, y, z);
    c.thick = TH;
    c.normalY = 1 / Math.hypot(c.planes[0].a, 1, c.planes[0].b);
    cols.push(c);
    if (type === 'ramp') {
      // dünne seitliche Box-Collider unter der Rampe (gestuft)
      const B = CONFIG.build, [vx, vz] = DIR_VEC[dir];
      const cx = (x + 0.5) * T, cz = (z + 0.5) * T;
      for (const side of [-1, 1]) {
        for (let i = 1; i < B.sideSegments; i++) {
          const segTop = y * H + H * (i / B.sideSegments) - B.sideGap;
          if (segTop <= y * H + 0.05) continue;
          const u0 = -T / 2 + T * (i / B.sideSegments), u1 = u0 + T / B.sideSegments;
          const lat = side * (T / 2 - B.sideThickness / 2);
          const ax = cx + vx * u0 + (vz !== 0 ? lat : 0), az = cz + vz * u0 + (vx !== 0 ? lat : 0);
          const bx = cx + vx * u1 + (vz !== 0 ? lat : 0), bz = cz + vz * u1 + (vx !== 0 ? lat : 0);
          const h = B.sideThickness / 2;
          cols.push(makeCollider('box',
            Math.min(ax, bx) - (vz !== 0 ? h : 0), y * H, Math.min(az, bz) - (vx !== 0 ? h : 0),
            Math.max(ax, bx) + (vz !== 0 ? h : 0), segTop, Math.max(az, bz) + (vx !== 0 ? h : 0), part));
        }
      }
    }
  }
  return cols;
}

function placePart(ev, owner) {
  if (!ev.valid) return null;
  const part = {
    key: ev.key, type: ev.type, x: ev.x, y: ev.y, z: ev.z, dir: ev.dir,
    owner, hp: CONFIG.build.hp[ev.type], maxHp: CONFIG.build.hp[ev.type],
    grounded: ev.grounded, neighbors: new Set(), alive: true, doomed: false,
    gridBox: partGridBox(ev.type, ev.x, ev.y, ev.z, ev.dir), mesh: null, colliders: null,
  };
  const mesh = new THREE.Mesh(buildGeo[ev.type], buildMat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  applyPartTransform(mesh, ev.type, ev.x, ev.y, ev.z, ev.dir);
  scene.add(mesh);
  part.mesh = mesh;
  part.colliders = createPartColliders(part);
  for (const c of part.colliders) grid.insert(c);
  for (const n of findNeighbors(ev.type, ev.x, ev.y, ev.z, ev.dir, nbTmp)) { part.neighbors.add(n); n.neighbors.add(part); }
  parts.set(ev.key, part);
  return part;
}

// Bauen mit Materialkosten (Spieler und Bots)
function tryBuild(a, ev) {
  const cost = CONFIG.build.cost;
  if (!ev.valid) return null;
  if (a.inv.mats < cost) return null;
  const part = placePart(ev, a);
  if (part) {
    a.inv.mats -= cost;
    sfxAt('place', part.mesh.position.x, part.mesh.position.y, part.mesh.position.z);
  }
  return part;
}

function partCenter(p, out) {
  const f = partFootprint(p.type, p.x, p.y, p.z, p.dir);
  out.x = (f.x0 + f.x1) / 2; out.z = (f.z0 + f.z1) / 2;
  out.y = p.type === 'floor' ? p.y * H : p.type === 'roof' ? p.y * H + 0.5 : p.y * H + H / 2;
  return out;
}

const _pc = { x: 0, y: 0, z: 0 };
function destroyPart(part, cause) {
  if (!part.alive) return;
  part.alive = false;
  parts.delete(part.key);
  for (const c of part.colliders) grid.remove(c);
  const nbs = Array.from(part.neighbors);
  for (const n of nbs) n.neighbors.delete(part);
  part.neighbors.clear();
  trash.push(part.mesh);
  partCenter(part, _pc);
  spawnParticles(_pc.x, _pc.y, _pc.z, 0xc4935f, 12, 3.5);
  dustCloud(_pc.x, _pc.y, _pc.z, 0xb8956a, 4, 2.2);
  sfxAt('break', _pc.x, _pc.y, _pc.z);
  if (cause !== 'collapse') checkCollapse(nbs);
}

// Einsturz: BFS von jedem Nachbarn; kein geerdetes Teil gefunden => alle stürzen ein
function checkCollapse(starts) {
  const safe = new Set();
  for (const s of starts) {
    if (!s.alive || s.doomed || safe.has(s)) continue;
    const depth = new Map([[s, 0]]);
    const queue = [s];
    let grounded = false;
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      if (cur.grounded) { grounded = true; break; }
      for (const nb of cur.neighbors) {
        if (!nb.alive || nb.doomed || depth.has(nb)) continue;
        depth.set(nb, depth.get(cur) + 1);
        queue.push(nb);
      }
    }
    if (grounded) { for (const k of depth.keys()) safe.add(k); continue; }
    for (const [p, d] of depth) {
      p.doomed = true;
      collapseQueue.push({ part: p, time: gameTime + d * CONFIG.build.collapseStepDelay });
    }
  }
}

function damagePart(part, dmg, hx, hy, hz, showNumber) {
  if (!part.alive) return;
  part.hp -= dmg;
  if (showNumber) showDamageNumber(hx, hy, hz, dmg, 'build');
  if (part.hp <= 0) destroyPart(part, 'damage');
}

function updateCollapse() {
  for (let i = collapseQueue.length - 1; i >= 0; i--) {
    const e = collapseQueue[i];
    if (gameTime >= e.time) { collapseQueue.splice(i, 1); if (e.part.alive) destroyPart(e.part, 'collapse'); }
  }
}

// Zielkachel fürs Bauen aus Blickrichtung bestimmen
function facingDir(yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 'E' : 'W';
  return fz > 0 ? 'S' : 'N';
}

function computeBuildTarget(a, type) {
  const B = CONFIG.build, p = a.pos;
  const dir = facingDir(a.yaw);
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  const tileX = Math.floor(p.x / T), tileZ = Math.floor(p.z / T);
  const level = Math.floor((p.y + B.levelBias) / H);
  const gp = a.groundCollider && a.groundCollider.owner && a.groundCollider.owner.gridBox ? a.groundCollider.owner : null;
  const pitch = a.pitch;
  let x = tileX, z = tileZ, y = level;
  const ahead = () => { x = Math.floor((p.x + fx * T * B.aheadFactor) / T); z = Math.floor((p.z + fz * T * B.aheadFactor) / T); };
  if (type === 'wall') {
    if (pitch > B.pitchUpLevel) y++;
  } else if (type === 'floor') {
    if (pitch > B.pitchDownFloor) ahead();
    if (pitch > B.pitchUpLevel * 0.6) y++;
  } else if (type === 'ramp') {
    ahead();
    if (gp && gp.type === 'ramp' && gp.dir === dir && (x !== gp.x || z !== gp.z)) y = gp.y + 1;
    else if (pitch > B.pitchUpLevel) y++;
  } else if (type === 'roof') {
    ahead();
    y = level + 1;
  }
  return evaluatePlacement(type, x, y, z, dir);
}

const ghosts = {};
for (const t of PIECES) {
  const g = new THREE.Mesh(buildGeo[t], ghostMatOk);
  g.visible = false; g.matrixAutoUpdate = false; g.renderOrder = 10;
  scene.add(g); ghosts[t] = g;
}

function updateGhost(bt, show, affordable) {
  for (const t of PIECES) ghosts[t].visible = false;
  if (!show || !bt) return;
  const g = ghosts[bt.type];
  g.material = bt.valid && affordable ? ghostMatOk : ghostMatBad;
  applyPartTransform(g, bt.type, bt.x, bt.y, bt.z, bt.dir);
  g.visible = true;
}
