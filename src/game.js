/* =====================================================================
 * FORTNITE AUF TEMU – Phase 1: Engine-Grundlage
 * Three.js wird NUR zum Rendern benutzt. Kollision, Raycasts und
 * Physik sind komplett eigene Implementierungen (siehe Abschnitt 1b).
 * ===================================================================== */
(function () {
'use strict';

// ---------------------------------------------------------------------
// CONFIG – alle Spielwerte an einer Stelle
// ---------------------------------------------------------------------
const CONFIG = {
  tickRate: 60,
  maxTicksPerFrame: 8,
  maxFrameTime: 0.25,
  render: {
    fov: 72, near: 0.1, far: 430, fogNear: 170, fogFar: 420,
    skyColor: 0x9fd4ff, shadowMapSize: 1024, shadowArea: 60,
    quality: {
      niedrig: { pixelRatio: 0.75, shadows: false },
      mittel:  { pixelRatio: 1.0,  shadows: false },
      hoch:    { pixelRatio: 1.5,  shadows: true },
    },
    defaultQuality: 'mittel',
  },
  world: {
    size: 640, cellSize: 2, maxHeight: 36, waterLevel: 0, seed: 20240917,
    islandFalloffStart: 0.70, islandFalloffEnd: 0.96, seaFloor: -8,
    lake: { x: 120, z: -80, radius: 55, depth: -4, name: 'Nebelsee' },
    houses: 14, houseMinDist: 36, houseSpread: 0.62,
    trees: 380, rocks: 110, crates: 40,
    boundsPadding: 2,
  },
  grid: { cellSize: 8 },
  player: {
    radius: 0.4, height: 1.8, crouchHeight: 1.2, eyeFromTop: 0.15, headRadius: 0.25,
    walkSpeed: 5.5, sprintSpeed: 8.2, crouchSpeed: 2.8, waterSpeedFactor: 0.55, waterDepth: 0.4,
    groundAccel: 55, airAccel: 9, jumpSpeed: 7.4, gravity: 22, maxFallSpeed: 55,
    stepHeight: 0.45, snapDistance: 0.35, maxSubstep: 0.2, groundNormalY: 0.7,
    surfaceClimb: 0.8, collisionPasses: 2, color: 0x3d7bd9,
  },
  camera: { distance: 3.4, shoulder: 0.7, height: 0.45, minDistance: 0.5, padding: 0.2, pitchMin: -1.35, pitchMax: 1.3 },
  input: { mouseSensitivity: 0.0022, touchSensitivity: 0.0055, joystickRadius: 60, joystickZone: 0.42, sprintThreshold: 0.92, deadZone: 0.12 },
  build: {
    tile: 5, height: 4, thickness: 0.25, roofRise: 1.6,
    hp: { wall: 150, floor: 140, ramp: 140, roof: 140 },
    groundTolerance: 0.5, collapseStepDelay: 0.05,
    levelBias: 0.6, pitchUpLevel: 0.55, pitchDownFloor: -0.65, aheadFactor: 0.65,
    sideSegments: 4, sideThickness: 0.1, sideGap: 0.35, maxBury: 3.5,
    repeatDelay: 0.12, color: 0xb5835a,
  },
  pickaxe: { damageBuild: 50, damageBody: 20, damageHead: 40, range: 3.2, cooldown: 0.45, swingTime: 0.3 },
  dummy: { count: 3, hp: 200, regenDelay: 3, respawnTime: 3, spacing: 3, distance: 7, color: 0xd9a13d },
  effects: { poolSize: 200, damageNumberPool: 40, particleLife: 0.6, particleGravity: 14, damageNumberLife: 0.9, damageNumberRise: 1.2 },
  debug: { colliderRange: 14, maxLines: 8000, textInterval: 0.25 },
  raycast: { terrainStep: 0.5, terrainRefine: 8, maxGridSteps: 2048, aimDistance: 60, infoDistance: 10 },
  audio: { volume: 0.25 },
};

const TICK = 1 / CONFIG.tickRate;
const T = CONFIG.build.tile, H = CONFIG.build.height, TH = CONFIG.build.thickness;

// ---------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const $ = (id) => document.getElementById(id);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createNoise2D(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const base = [];
  for (let i = 0; i < 256; i++) base.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = base[i]; base[i] = base[j]; base[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) vals[i] = rnd();
  const v = (ix, iz) => vals[perm[(perm[ix & 255] + iz) & 255]];
  function noise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
    const a = v(ix, iz), b = v(ix + 1, iz), c = v(ix, iz + 1), d = v(ix + 1, iz + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), w);
  }
  function fbm(x, z, octaves) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += noise(x * freq, z * freq) * amp; norm += amp; amp *= 0.5; freq *= 2.03; }
    return sum / norm;
  }
  return { noise, fbm };
}

// ---------------------------------------------------------------------
// Object Pool (Partikel, Schadenszahlen, später Kugeln/Tracer)
// ---------------------------------------------------------------------
class Pool {
  constructor(createFn, size) {
    this.items = [];
    this.free = [];
    for (let i = 0; i < size; i++) { const o = createFn(i); this.items.push(o); this.free.push(o); }
  }
  get() { return this.free.length ? this.free.pop() : null; }
  release(o) { this.free.push(o); }
  get used() { return this.items.length - this.free.length; }
}

// ---------------------------------------------------------------------
// Terrain: Heightmap mit bilinearer Interpolation
// ---------------------------------------------------------------------
const W = CONFIG.world;
const HALF = W.size / 2;
const HM_N = W.size / W.cellSize + 1;
const heights = new Float32Array(HM_N * HM_N);
let terrainMaxHeight = 0;
const noiseGen = createNoise2D(W.seed);

function generateHeights() {
  const L = W.lake;
  for (let j = 0; j < HM_N; j++) {
    for (let i = 0; i < HM_N; i++) {
      const x = i * W.cellSize - HALF, z = j * W.cellSize - HALF;
      const n = noiseGen.fbm(x / 170 + 11.3, z / 170 - 4.7, 5);
      const b = Math.max(0, (n - 0.32) / 0.68);
      let h = 1.6 + Math.pow(b, 1.55) * W.maxHeight * 1.35;
      h += (noiseGen.fbm(x / 34 - 3.1, z / 34 + 8.2, 3) - 0.5) * 2.6;
      const d = Math.sqrt(x * x + z * z) / HALF;
      h = lerp(h, W.seaFloor, smoothstep(W.islandFalloffStart, W.islandFalloffEnd, d));
      const ld = Math.hypot(x - L.x, z - L.z);
      h = lerp(h, L.depth, smoothstep(L.radius, L.radius * 0.45, ld));
      heights[j * HM_N + i] = h;
    }
  }
}

function getHeight(x, z) {
  let gx = (x + HALF) / W.cellSize, gz = (z + HALF) / W.cellSize;
  gx = clamp(gx, 0, HM_N - 1.000001); gz = clamp(gz, 0, HM_N - 1.000001);
  const i = Math.floor(gx), j = Math.floor(gz);
  const fx = gx - i, fz = gz - j;
  const k = j * HM_N + i;
  const h00 = heights[k], h10 = heights[k + 1], h01 = heights[k + HM_N], h11 = heights[k + HM_N + 1];
  return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
}

const _n = { x: 0, y: 1, z: 0 };
function getNormal(x, z, out) {
  const e = W.cellSize;
  const hl = getHeight(x - e, z), hr = getHeight(x + e, z);
  const hd = getHeight(x, z - e), hu = getHeight(x, z + e);
  let nx = hl - hr, ny = 2 * e, nz = hd - hu;
  const len = Math.hypot(nx, ny, nz);
  out = out || _n;
  out.x = nx / len; out.y = ny / len; out.z = nz / len;
  return out;
}

function flattenArea(cx, cz, halfW, halfD, margin, blend, target) {
  const x0 = cx - halfW - margin - blend, x1 = cx + halfW + margin + blend;
  const z0 = cz - halfD - margin - blend, z1 = cz + halfD + margin + blend;
  const i0 = Math.max(0, Math.floor((x0 + HALF) / W.cellSize)), i1 = Math.min(HM_N - 1, Math.ceil((x1 + HALF) / W.cellSize));
  const j0 = Math.max(0, Math.floor((z0 + HALF) / W.cellSize)), j1 = Math.min(HM_N - 1, Math.ceil((z1 + HALF) / W.cellSize));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = i * W.cellSize - HALF, z = j * W.cellSize - HALF;
      const dx = Math.max(0, Math.abs(x - cx) - halfW - margin);
      const dz = Math.max(0, Math.abs(z - cz) - halfD - margin);
      const t = 1 - smoothstep(0, blend, Math.hypot(dx, dz));
      const k = j * HM_N + i;
      heights[k] = lerp(heights[k], target, t);
    }
  }
}

// ---------------------------------------------------------------------
// Collider-Typen
//   box     : achsenparallele Box (Wände, Böden, Häuser, Bäume, Steine)
//   surface : Höhenfunktion innerhalb einer Kachel (Rampe, Dach)
//   actor   : Figur mit Hitboxen (Kopf-Kugel + Körper-Kapsel)
// ---------------------------------------------------------------------
let colliderIdCounter = 0;
function makeCollider(kind, minX, minY, minZ, maxX, maxY, maxZ, owner) {
  return {
    id: ++colliderIdCounter, kind, owner: owner || null,
    min: [minX, minY, minZ], max: [maxX, maxY, maxZ],
    cells: [], range: null, stamp: 0,
    foundation: false, planes: null, thick: 0,
  };
}

function surfaceHeight(c, x, z) {
  let h = Infinity;
  const pl = c.planes;
  for (let i = 0; i < pl.length; i++) { const v = pl[i].a * x + pl[i].b * z + pl[i].c; if (v < h) h = v; }
  return h;
}

// ---------------------------------------------------------------------
// Spatial Hash Grid (Zellgröße 8 m) + Raycast nach Amanatides & Woo
// ---------------------------------------------------------------------
class SpatialGrid {
  constructor(cellSize) {
    this.cs = cellSize; this.inv = 1 / cellSize;
    this.cells = new Map();
    this.stamp = 0; this.count = 0;
  }
  static key(ix, iy, iz) { return ((ix + 1024) * 2048 + (iy + 1024)) * 2048 + (iz + 1024); }
  rangeOf(min, max) {
    const inv = this.inv;
    return [Math.floor(min[0] * inv), Math.floor(min[1] * inv), Math.floor(min[2] * inv),
            Math.floor(max[0] * inv), Math.floor(max[1] * inv), Math.floor(max[2] * inv)];
  }
  insert(c) {
    const r = this.rangeOf(c.min, c.max);
    c.range = r; c.cells.length = 0;
    for (let x = r[0]; x <= r[3]; x++) for (let y = r[1]; y <= r[4]; y++) for (let z = r[2]; z <= r[5]; z++) {
      const k = SpatialGrid.key(x, y, z);
      let arr = this.cells.get(k);
      if (!arr) { arr = []; this.cells.set(k, arr); }
      arr.push(c); c.cells.push(k);
    }
    this.count++;
  }
  remove(c) {
    for (let i = 0; i < c.cells.length; i++) {
      const k = c.cells[i];
      const arr = this.cells.get(k);
      if (!arr) continue;
      const idx = arr.indexOf(c);
      if (idx >= 0) { arr[idx] = arr[arr.length - 1]; arr.pop(); }
      if (arr.length === 0) this.cells.delete(k);
    }
    c.cells.length = 0; c.range = null;
    this.count--;
  }
  update(c) {
    const r = this.rangeOf(c.min, c.max), o = c.range;
    if (o && o[0] === r[0] && o[1] === r[1] && o[2] === r[2] && o[3] === r[3] && o[4] === r[4] && o[5] === r[5]) return;
    if (o) this.remove(c);
    this.insert(c);
  }
  query(min, max, out) {
    out.length = 0;
    const s = ++this.stamp, inv = this.inv;
    const x0 = Math.floor(min[0] * inv), y0 = Math.floor(min[1] * inv), z0 = Math.floor(min[2] * inv);
    const x1 = Math.floor(max[0] * inv), y1 = Math.floor(max[1] * inv), z1 = Math.floor(max[2] * inv);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const arr = this.cells.get(SpatialGrid.key(x, y, z));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (c.stamp === s) continue;
        c.stamp = s;
        if (c.max[0] < min[0] || c.min[0] > max[0] || c.max[1] < min[1] || c.min[1] > max[1] || c.max[2] < min[2] || c.min[2] > max[2]) continue;
        out.push(c);
      }
    }
    return out;
  }
  // 3D-DDA durch die Zellen; pro Zelle Strahl gegen alle Collider, nächster Treffer gewinnt.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, ignore, hit) {
    const cs = this.cs, inv = this.inv;
    let ix = Math.floor(ox * inv), iy = Math.floor(oy * inv), iz = Math.floor(oz * inv);
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0, stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0, stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tDX = stepX ? Math.abs(cs / dx) : Infinity, tDY = stepY ? Math.abs(cs / dy) : Infinity, tDZ = stepZ ? Math.abs(cs / dz) : Infinity;
    let tMX = stepX ? ((stepX > 0 ? (ix + 1) * cs - ox : ox - ix * cs) / Math.abs(dx)) : Infinity;
    let tMY = stepY ? ((stepY > 0 ? (iy + 1) * cs - oy : oy - iy * cs) / Math.abs(dy)) : Infinity;
    let tMZ = stepZ ? ((stepZ > 0 ? (iz + 1) * cs - oz : oz - iz * cs) / Math.abs(dz)) : Infinity;
    const s = ++this.stamp;
    let best = maxDist;
    hit.t = Infinity; hit.collider = null; hit.zone = null;
    for (let step = 0; step < CONFIG.raycast.maxGridSteps; step++) {
      const arr = this.cells.get(SpatialGrid.key(ix, iy, iz));
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (c.stamp === s || c === ignore) continue;
          c.stamp = s;
          const t = rayCollider(c, ox, oy, oz, dx, dy, dz, best, _rh);
          if (t >= 0 && t < best) {
            best = t; hit.t = t; hit.collider = c; hit.zone = _rh.zone;
            hit.nx = _rh.nx; hit.ny = _rh.ny; hit.nz = _rh.nz;
          }
        }
      }
      const tNext = Math.min(tMX, tMY, tMZ);
      if (tNext > best) break;
      if (tMX <= tMY && tMX <= tMZ) { ix += stepX; tMX += tDX; }
      else if (tMY <= tMZ) { iy += stepY; tMY += tDY; }
      else { iz += stepZ; tMZ += tDZ; }
    }
    if (hit.collider) { hit.px = ox + dx * hit.t; hit.py = oy + dy * hit.t; hit.pz = oz + dz * hit.t; return true; }
    return false;
  }
}

const _rh = { zone: null, nx: 0, ny: 0, nz: 0 };

// Slab-Methode
function rayAABB(ox, oy, oz, dx, dy, dz, mn, mx, out) {
  let tmin = -Infinity, tmax = Infinity, axis = 0, sign = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < mn[a] || o[a] > mx[a]) return -1;
      continue;
    }
    const inv = 1 / d[a];
    let t1 = (mn[a] - o[a]) * inv, t2 = (mx[a] - o[a]) * inv;
    let sg = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sg = 1; }
    if (t1 > tmin) { tmin = t1; axis = a; sign = sg; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  out.nx = axis === 0 ? sign : 0; out.ny = axis === 1 ? sign : 0; out.nz = axis === 2 ? sign : 0;
  return tmin < 0 ? 0 : tmin;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const mx = ox - cx, my = oy - cy, mz = oz - cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t < 0 ? 0 : t;
}

// vertikale Kapsel: Zylinder zwischen y0 und y1 plus Halbkugeln
function rayCapsuleV(ox, oy, oz, dx, dy, dz, cx, cz, y0, y1, r) {
  let best = Infinity;
  const px = ox - cx, pz = oz - cz;
  const A = dx * dx + dz * dz;
  if (A > 1e-10) {
    const B = 2 * (px * dx + pz * dz), C = px * px + pz * pz - r * r;
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t >= 0) { const y = oy + dy * t; if (y >= y0 && y <= y1) best = t; }
    }
  }
  const t0 = raySphere(ox, oy, oz, dx, dy, dz, cx, y0, cz, r);
  if (t0 >= 0 && t0 < best) best = t0;
  const t1 = raySphere(ox, oy, oz, dx, dy, dz, cx, y1, cz, r);
  if (t1 >= 0 && t1 < best) best = t1;
  return best === Infinity ? -1 : best;
}

function raySurface(c, ox, oy, oz, dx, dy, dz, maxT, out) {
  let best = maxT, found = false;
  const e = 1e-4;
  for (const pl of c.planes) {
    const denom = dy - pl.a * dx - pl.b * dz;
    if (Math.abs(denom) < 1e-9) continue;
    const t = (pl.a * ox + pl.b * oz + pl.c - oy) / denom;
    if (t < 0 || t >= best) continue;
    const x = ox + dx * t, z = oz + dz * t;
    if (x < c.min[0] - e || x > c.max[0] + e || z < c.min[2] - e || z > c.max[2] + e) continue;
    const y = oy + dy * t;
    if (Math.abs(surfaceHeight(c, x, z) - y) > 1e-3) continue;
    const len = Math.hypot(pl.a, 1, pl.b);
    const flip = denom > 0 ? -1 : 1;
    out.nx = -pl.a / len * flip; out.ny = 1 / len * flip; out.nz = -pl.b / len * flip;
    best = t; found = true;
  }
  return found ? best : -1;
}

function rayCollider(c, ox, oy, oz, dx, dy, dz, maxT, out) {
  out.zone = null;
  if (c.kind === 'box') return rayAABB(ox, oy, oz, dx, dy, dz, c.min, c.max, out);
  if (c.kind === 'surface') {
    if (rayAABB(ox, oy, oz, dx, dy, dz, c.min, c.max, _tmpN) < 0) return -1;
    return raySurface(c, ox, oy, oz, dx, dy, dz, maxT, out);
  }
  if (c.kind === 'actor') {
    const a = c.owner;
    if (!a.alive) return -1;
    // Kopf wird zuerst geprüft
    const hr = CONFIG.player.headRadius;
    const headY = a.pos.y + a.height - hr;
    const th = raySphere(ox, oy, oz, dx, dy, dz, a.pos.x, headY, a.pos.z, hr);
    if (th >= 0) { out.zone = 'head'; out.nx = 0; out.ny = 1; out.nz = 0; return th; }
    const r = a.radius;
    const tb = rayCapsuleV(ox, oy, oz, dx, dy, dz, a.pos.x, a.pos.z, a.pos.y + r, a.pos.y + a.height - 2 * hr, r);
    if (tb >= 0) { out.zone = 'body'; out.nx = -dx; out.ny = 0; out.nz = -dz; return tb; }
    return -1;
  }
  return -1;
}
const _tmpN = { nx: 0, ny: 0, nz: 0 };

// Terrain-Raycast: 0,5-m-Schritte, dann Binärsuche mit 8 Iterationen
function rayTerrain(ox, oy, oz, dx, dy, dz, maxDist) {
  if (oy < getHeight(ox, oz)) return -1;
  const step = CONFIG.raycast.terrainStep;
  let prev = 0;
  for (let t = step; ; t += step) {
    const tt = Math.min(t, maxDist);
    const y = oy + dy * tt;
    if (y > terrainMaxHeight && dy >= 0) return -1;
    if (y < getHeight(ox + dx * tt, oz + dz * tt)) {
      let lo = prev, hi = tt;
      for (let i = 0; i < CONFIG.raycast.terrainRefine; i++) {
        const mid = (lo + hi) * 0.5;
        if (oy + dy * mid < getHeight(ox + dx * mid, oz + dz * mid)) hi = mid; else lo = mid;
      }
      return hi;
    }
    prev = tt;
    if (tt >= maxDist) return -1;
  }
}

const grid = new SpatialGrid(CONFIG.grid.cellSize);

// Kombinierter Raycast: Spatial Grid + Terrain, nächster Treffer gewinnt
const worldHit = { t: 0, collider: null, zone: null, terrain: false, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0 };
function raycastWorld(ox, oy, oz, dx, dy, dz, maxDist, ignore) {
  const gh = grid.raycast(ox, oy, oz, dx, dy, dz, maxDist, ignore, worldHit);
  const gt = gh ? worldHit.t : Infinity;
  const tt = rayTerrain(ox, oy, oz, dx, dy, dz, Math.min(maxDist, gt));
  if (tt >= 0 && tt < gt) {
    worldHit.t = tt; worldHit.collider = null; worldHit.zone = null; worldHit.terrain = true;
    worldHit.px = ox + dx * tt; worldHit.py = oy + dy * tt; worldHit.pz = oz + dz * tt;
    const n = getNormal(worldHit.px, worldHit.pz);
    worldHit.nx = n.x; worldHit.ny = n.y; worldHit.nz = n.z;
    return true;
  }
  worldHit.terrain = false;
  return gh;
}

// ---------------------------------------------------------------------
// Three.js: Renderer, Szene, Licht
// ---------------------------------------------------------------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.render.skyColor);
scene.fog = new THREE.Fog(CONFIG.render.skyColor, CONFIG.render.fogNear, CONFIG.render.fogFar);
const camera = new THREE.PerspectiveCamera(CONFIG.render.fov, 1, CONFIG.render.near, CONFIG.render.far);
camera.rotation.order = 'YXZ';

const hemi = new THREE.HemisphereLight(0xdff1ff, 0x5a6b3a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d6, 2.0);
sun.position.set(60, 120, 40);
sun.shadow.mapSize.set(CONFIG.render.shadowMapSize, CONFIG.render.shadowMapSize);
const sa = CONFIG.render.shadowArea;
Object.assign(sun.shadow.camera, { left: -sa, right: sa, top: sa, bottom: -sa, near: 1, far: 300 });
scene.add(sun, sun.target);

// Geteilte Geometrien und Materialien
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
function lambert(color) {
  let m = matCache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); matCache.set(color, m); }
  return m;
}

// ---------------------------------------------------------------------
// Welt aufbauen
// ---------------------------------------------------------------------
const houses = [];
let spawnPoint = { x: 0, y: 10, z: 0, yaw: 0 };

function planHouses(rnd) {
  const tries = 600;
  for (let t = 0; t < tries && houses.length < W.houses; t++) {
    const x = (rnd() * 2 - 1) * HALF * W.houseSpread, z = (rnd() * 2 - 1) * HALF * W.houseSpread;
    const w = rnd() < 0.5 ? 10 : 12, d = rnd() < 0.5 ? 8 : 10;
    const h = getHeight(x, z);
    if (h < W.waterLevel + 2) continue;
    let minH = Infinity, maxH = -Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      const hh = getHeight(x + sx * (w / 2 + 3), z + sz * (d / 2 + 3));
      minH = Math.min(minH, hh); maxH = Math.max(maxH, hh);
    }
    if (maxH - minH > 4 || minH < W.waterLevel + 1) continue;
    if (Math.hypot(x - W.lake.x, z - W.lake.z) < W.lake.radius + 15) continue;
    if (houses.some((o) => Math.hypot(o.x - x, o.z - z) < W.houseMinDist)) continue;
    houses.push({ x, z, w, d, ground: Math.round(h * 10) / 10, door: Math.floor(rnd() * 4) });
  }
  for (const hs of houses) flattenArea(hs.x, hs.z, hs.w / 2, hs.d / 2, 2, 7, hs.ground);
}

function buildTerrainMesh() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(HM_N * HM_N * 3);
  const col = new Float32Array(HM_N * HM_N * 3);
  const c = new THREE.Color();
  const cSand = new THREE.Color(0xd9c38a), cGrass1 = new THREE.Color(0x5aa34a), cGrass2 = new THREE.Color(0x3f8a38);
  const cRock = new THREE.Color(0x7d7466), cSnow = new THREE.Color(0xe4ecef), cSea = new THREE.Color(0xa99a6a);
  const nrm = { x: 0, y: 1, z: 0 };
  for (let j = 0; j < HM_N; j++) {
    for (let i = 0; i < HM_N; i++) {
      const k = j * HM_N + i;
      const x = i * W.cellSize - HALF, z = j * W.cellSize - HALF, h = heights[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      getNormal(x, z, nrm);
      if (h < W.waterLevel - 0.5) c.copy(cSea);
      else if (h < W.waterLevel + 0.9) c.copy(cSand);
      else if (nrm.y < 0.8) c.copy(cRock);
      else if (h > W.maxHeight * 0.95) c.copy(cSnow);
      else c.copy(cGrass1).lerp(cGrass2, noiseGen.noise(x / 9, z / 9));
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      if (h > terrainMaxHeight) terrainMaxHeight = h;
    }
  }
  const idx = new Uint32Array((HM_N - 1) * (HM_N - 1) * 6);
  let p = 0;
  for (let j = 0; j < HM_N - 1; j++) for (let i = 0; i < HM_N - 1; i++) {
    const a = j * HM_N + i, b = a + 1, cc = a + HM_N, d = cc + 1;
    idx[p++] = a; idx[p++] = cc; idx[p++] = b;
    idx[p++] = b; idx[p++] = cc; idx[p++] = d;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(W.size * 3, W.size * 3),
    new THREE.MeshLambertMaterial({ color: 0x2f7fb8, transparent: true, opacity: 0.78 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = W.waterLevel;
  water.updateMatrix(); water.matrixAutoUpdate = false;
  scene.add(water);
}

const staticMeshes = [];
function addStaticBox(minX, minY, minZ, maxX, maxY, maxZ, color, foundation) {
  const m = new THREE.Mesh(unitBox, lambert(color));
  m.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  m.scale.set(maxX - minX, maxY - minY, maxZ - minZ);
  m.castShadow = true; m.receiveShadow = true;
  m.updateMatrix(); m.matrixAutoUpdate = false;
  scene.add(m); staticMeshes.push(m);
  const c = makeCollider('box', minX, minY, minZ, maxX, maxY, maxZ, null);
  c.foundation = !!foundation;
  grid.insert(c);
  return c;
}

// Wand entlang einer Achse mit Öffnung (Tür/Fenster)
function wallWithOpening(axis, fixed0, fixed1, a0, a1, y0, y1, openCenter, openW, openBottom, openTop, color) {
  const box = (s0, s1, b0, b1) => {
    if (s1 - s0 < 0.01 || b1 - b0 < 0.01) return;
    if (axis === 'x') addStaticBox(s0, b0, fixed0, s1, b1, fixed1, color, true);
    else addStaticBox(fixed0, b0, s0, fixed1, b1, s1, color, true);
  };
  if (openW <= 0) { box(a0, a1, y0, y1); return; }
  const o0 = openCenter - openW / 2, o1 = openCenter + openW / 2;
  box(a0, o0, y0, y1);
  box(o1, a1, y0, y1);
  box(o0, o1, y0, y0 + openBottom);
  box(o0, o1, y0 + openTop, y1);
}

function buildHouse(hs) {
  const { x, z, w, d, ground } = hs;
  const wt = 0.3, storey = 3.6, floorTop = ground + 0.3;
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  addStaticBox(x0, ground - 1.5, z0, x1, floorTop, z1, 0x8a8a8a, true);
  const top = floorTop + storey;
  const cW = 0xe8dcc4;
  // Seiten: 0=N(-z) 1=O(+x) 2=S(+z) 3=W(-x); Tür auf hs.door, Fenster gegenüber
  const opening = (side) => side === hs.door ? { w: 1.4, b: 0, t: 2.4 } : side === (hs.door + 2) % 4 ? { w: 1.6, b: 1.0, t: 2.3 } : { w: 0, b: 0, t: 0 };
  let o = opening(0); wallWithOpening('x', z0, z0 + wt, x0, x1, floorTop, top, x, o.w, o.b, o.t, cW);
  o = opening(2); wallWithOpening('x', z1 - wt, z1, x0, x1, floorTop, top, x, o.w, o.b, o.t, cW);
  o = opening(3); wallWithOpening('z', x0, x0 + wt, z0 + wt, z1 - wt, floorTop, top, z, o.w, o.b, o.t, cW);
  o = opening(1); wallWithOpening('z', x1 - wt, x1, z0 + wt, z1 - wt, floorTop, top, z, o.w, o.b, o.t, cW);
  addStaticBox(x0 - 0.3, top, z0 - 0.3, x1 + 0.3, top + 0.3, z1 + 0.3, 0x9b4a3c, true);
  addStaticBox(x + w / 2 - 2.2, floorTop, z + d / 2 - 2.2, x + w / 2 - 0.9, floorTop + 1.2, z + d / 2 - 0.9, 0xa0703c, true);
}

function insideHouse(x, z, margin) {
  return houses.some((h) => Math.abs(x - h.x) < h.w / 2 + margin && Math.abs(z - h.z) < h.d / 2 + margin);
}

function populateNature(rnd) {
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1, 6);
  const crownGeo = new THREE.ConeGeometry(1, 1, 7);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, lambert(0x6b4a2b), W.trees);
  const crowns = new THREE.InstancedMesh(crownGeo, lambert(0x2f6f35), W.trees);
  const rocks = new THREE.InstancedMesh(rockGeo, lambert(0x8d8a84), W.rocks);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const nrm = { x: 0, y: 1, z: 0 };
  const okSpot = (x, z, minH) => {
    const h = getHeight(x, z);
    if (h < W.waterLevel + minH) return false;
    if (getNormal(x, z, nrm).y < 0.82) return false;
    if (insideHouse(x, z, 4)) return false;
    if (Math.hypot(x - spawnPoint.x, z - spawnPoint.z) < 14) return false;
    return true;
  };
  let tc = 0;
  for (let t = 0; t < W.trees * 6 && tc < W.trees; t++) {
    const x = (rnd() * 2 - 1) * HALF * 0.9, z = (rnd() * 2 - 1) * HALF * 0.9;
    if (!okSpot(x, z, 1.2)) continue;
    const g = getHeight(x, z), th = 3 + rnd() * 2, cr = 1.6 + rnd() * 1.2, ch = 4 + rnd() * 3;
    p.set(x, g + th / 2, z); s.set(1, th, 1); q.identity();
    m.compose(p, q, s); trunks.setMatrixAt(tc, m);
    p.set(x, g + th + ch / 2 - 0.6, z); s.set(cr, ch, cr);
    m.compose(p, q, s); crowns.setMatrixAt(tc, m);
    grid.insert(makeCollider('box', x - 0.3, g - 0.5, z - 0.3, x + 0.3, g + th + ch * 0.6, z + 0.3, null));
    tc++;
  }
  trunks.count = tc; crowns.count = tc;
  let rc = 0;
  for (let t = 0; t < W.rocks * 6 && rc < W.rocks; t++) {
    const x = (rnd() * 2 - 1) * HALF * 0.9, z = (rnd() * 2 - 1) * HALF * 0.9;
    if (!okSpot(x, z, 0.3)) continue;
    const g = getHeight(x, z), sc = 0.8 + rnd() * 1.6;
    e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e);
    p.set(x, g + sc * 0.35, z); s.set(sc, sc * 0.8, sc);
    m.compose(p, q, s); rocks.setMatrixAt(rc, m);
    const r = sc * 0.8;
    grid.insert(makeCollider('box', x - r, g - 1, z - r, x + r, g + sc * 0.35 + sc * 0.7, z + r, null));
    rc++;
  }
  rocks.count = rc;
  for (const im of [trunks, crowns, rocks]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; scene.add(im); }
  let cc = 0;
  for (let t = 0; t < W.crates * 8 && cc < W.crates; t++) {
    const x = (rnd() * 2 - 1) * HALF * 0.8, z = (rnd() * 2 - 1) * HALF * 0.8;
    if (!okSpot(x, z, 0.8)) continue;
    const g = getHeight(x, z);
    addStaticBox(x - 0.75, g - 0.4, z - 0.75, x + 0.75, g + 1.5, z + 0.75, 0xa0703c, false);
    cc++;
  }
}

function buildWorld() {
  generateHeights();
  const rnd = mulberry32(W.seed ^ 0x5bd1e995);
  planHouses(rnd);
  const hs = houses[0];
  if (hs) {
    const off = [[0, -1], [1, 0], [0, 1], [-1, 0]][hs.door];
    const dist = (hs.door % 2 === 0 ? hs.d : hs.w) / 2 + 5;
    spawnPoint = { x: hs.x + off[0] * dist, y: 0, z: hs.z + off[1] * dist, yaw: Math.atan2(off[0], off[1]) };
  } else {
    spawnPoint = { x: 0, y: 0, z: 0, yaw: 0 };
  }
  buildTerrainMesh();
  for (const h of houses) buildHouse(h);
  populateNature(rnd);
  spawnPoint.y = getHeight(spawnPoint.x, spawnPoint.z) + 0.5;
}

// ---------------------------------------------------------------------
// Figuren (Spieler + Trainingspuppen)
// ---------------------------------------------------------------------
function createCharacterMesh(color) {
  const g = new THREE.Group();
  const skin = lambert(0xf0c9a0), body = lambert(color), dark = lambert(0x2b2f3a);
  const part = (mat, sx, sy, sz, x, y, z, parent) => {
    const m = new THREE.Mesh(unitBox, mat);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true;
    (parent || g).add(m); return m;
  };
  const hip = new THREE.Group(); hip.position.y = 0.9; g.add(hip);
  const legL = new THREE.Group(); legL.position.set(-0.13, 0, 0); hip.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.13, 0, 0); hip.add(legR);
  part(dark, 0.22, 0.9, 0.24, 0, -0.45, 0, legL);
  part(dark, 0.22, 0.9, 0.24, 0, -0.45, 0, legR);
  part(body, 0.56, 0.62, 0.3, 0, 0.31, 0, hip);
  const head = part(skin, 0.36, 0.36, 0.36, 0, 0.84, 0, hip);
  const armL = new THREE.Group(); armL.position.set(-0.36, 0.58, 0); hip.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.36, 0.58, 0); hip.add(armR);
  part(body, 0.16, 0.62, 0.18, 0, -0.28, 0, armL);
  part(body, 0.16, 0.62, 0.18, 0, -0.28, 0, armR);
  return { group: g, hip, legL, legR, armL, armR, head };
}

function createActor(color, isPlayer) {
  const P = CONFIG.player;
  const a = {
    pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(),
    yaw: 0, pitch: 0, radius: P.radius, height: P.height, crouching: false,
    onGround: false, wasGrounded: false, groundCollider: null, inWater: false,
    alive: true, hp: 100, isPlayer: !!isPlayer, walkPhase: 0, swing: 0,
    model: createCharacterMesh(color), collider: null, lastHit: -99, respawnAt: 0,
  };
  a.collider = makeCollider('actor', 0, 0, 0, 0, 0, 0, a);
  scene.add(a.model.group);
  return a;
}

function updateActorCollider(a) {
  const c = a.collider, r = a.radius;
  c.min[0] = a.pos.x - r; c.min[1] = a.pos.y; c.min[2] = a.pos.z - r;
  c.max[0] = a.pos.x + r; c.max[1] = a.pos.y + a.height; c.max[2] = a.pos.z + r;
  grid.update(c);
}

let player = null;
const dummies = [];

// ---------------------------------------------------------------------
// Physik: Kapsel gegen AABB / Oberflächen / Terrain, Substeps ≤ 0,2 m
// ---------------------------------------------------------------------
const qList = [];
const qMin = [0, 0, 0], qMax = [0, 0, 0];
const nrmTmp = { x: 0, y: 1, z: 0 };

function capsuleOverlapsBox(px, feet, pz, r, h, mn, mx) {
  const top = feet + h;
  if (px + r <= mn[0] || px - r >= mx[0] || pz + r <= mn[2] || pz - r >= mx[2] || top <= mn[1] || feet >= mx[1]) return false;
  const y0 = feet + r, y1 = top - r;
  const cx = clamp(px, mn[0], mx[0]), cz = clamp(pz, mn[2], mx[2]);
  let segY;
  if (mx[1] < y0) segY = y0; else if (mn[1] > y1) segY = y1; else segY = clamp((Math.max(mn[1], y0) + Math.min(mx[1], y1)) * 0.5, y0, y1);
  const by = clamp(segY, mn[1], mx[1]);
  const dx = px - cx, dy = segY - by, dz = pz - cz;
  return dx * dx + dy * dy + dz * dz < r * r - 1e-6;
}

function resolveCapsuleBox(a, c) {
  const P = CONFIG.player, r = a.radius, p = a.pos;
  const mn = c.min, mx = c.max;
  if (!capsuleOverlapsBox(p.x, p.y, p.z, r, a.height, mn, mx)) return false;
  const pushXn = (p.x + r) - mn[0], pushXp = mx[0] - (p.x - r);
  const pushZn = (p.z + r) - mn[2], pushZp = mx[2] - (p.z - r);
  const pushUp = mx[1] - p.y, pushDown = (p.y + a.height) - mn[1];
  let best = pushUp, axis = 'up';
  if (pushDown < best) { best = pushDown; axis = 'down'; }
  if (pushXn < best) { best = pushXn; axis = 'xn'; }
  if (pushXp < best) { best = pushXp; axis = 'xp'; }
  if (pushZn < best) { best = pushZn; axis = 'zn'; }
  if (pushZp < best) { best = pushZp; axis = 'zp'; }
  // Kleine Kanten hochsteigen (Treppenstufe / Fundament)
  if (axis !== 'up' && pushUp <= P.stepHeight && a.wasGrounded && a.vel.y <= 0.5) axis = 'up';
  switch (axis) {
    case 'up':
      p.y += pushUp; if (a.vel.y < 0) a.vel.y = 0;
      a.onGround = true; a.groundCollider = c; break; // Normale (0,1,0): y > 0,7 => Boden
    case 'down': p.y -= pushDown; if (a.vel.y > 0) a.vel.y = 0; break;
    case 'xn': p.x -= pushXn; if (a.vel.x > 0) a.vel.x = 0; break;
    case 'xp': p.x += pushXp; if (a.vel.x < 0) a.vel.x = 0; break;
    case 'zn': p.z -= pushZn; if (a.vel.z > 0) a.vel.z = 0; break;
    case 'zp': p.z += pushZp; if (a.vel.z < 0) a.vel.z = 0; break;
  }
  return true;
}

function resolveCapsuleSurface(a, c) {
  const P = CONFIG.player, p = a.pos;
  if (p.x < c.min[0] || p.x > c.max[0] || p.z < c.min[2] || p.z > c.max[2]) return false;
  const h = surfaceHeight(c, p.x, p.z);
  if (p.y >= h) return false;
  const pen = h - p.y;
  if (pen <= P.surfaceClimb) {
    p.y = h; if (a.vel.y < 0) a.vel.y = 0;
    if (c.normalY > P.groundNormalY) { a.onGround = true; a.groundCollider = c; }
    return true;
  }
  const bottom = h - c.thick;
  if (p.y + a.height > bottom) { p.y = bottom - a.height; if (a.vel.y > 0) a.vel.y = 0; return true; }
  return false;
}

function resolveCapsuleActor(a, c) {
  const o = c.owner;
  if (!o.alive || o === a) return false;
  if (a.pos.y >= o.pos.y + o.height || a.pos.y + a.height <= o.pos.y) return false;
  const dx = a.pos.x - o.pos.x, dz = a.pos.z - o.pos.z;
  const d = Math.hypot(dx, dz), min = a.radius + o.radius;
  if (d >= min) return false;
  const nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0;
  a.pos.x += nx * (min - d); a.pos.z += nz * (min - d);
  const vn = a.vel.x * nx + a.vel.z * nz;
  if (vn < 0) { a.vel.x -= nx * vn; a.vel.z -= nz * vn; }
  return true;
}

function resolveTerrain(a) {
  const P = CONFIG.player, p = a.pos;
  for (let i = 0; i < 2; i++) {
    const h = getHeight(p.x, p.z);
    if (p.y >= h) return;
    const n = getNormal(p.x, p.z, nrmTmp);
    if (n.y >= P.groundNormalY) {
      p.y = h; if (a.vel.y < 0) a.vel.y = 0;
      a.onGround = true; a.groundCollider = null;
      return;
    }
    const d = (h - p.y) * n.y;
    p.x += n.x * d; p.y += n.y * d; p.z += n.z * d;
    const vn = a.vel.x * n.x + a.vel.y * n.y + a.vel.z * n.z;
    if (vn < 0) { a.vel.x -= n.x * vn; a.vel.y -= n.y * vn; a.vel.z -= n.z * vn; }
  }
  const h = getHeight(p.x, p.z);
  if (p.y < h - 0.5) p.y = h;
}

function resolveCollisions(a) {
  const P = CONFIG.player, r = a.radius, p = a.pos;
  for (let pass = 0; pass < P.collisionPasses; pass++) {
    qMin[0] = p.x - r - 0.05; qMin[1] = p.y - 0.05; qMin[2] = p.z - r - 0.05;
    qMax[0] = p.x + r + 0.05; qMax[1] = p.y + a.height + 0.05; qMax[2] = p.z + r + 0.05;
    grid.query(qMin, qMax, qList);
    let moved = false;
    for (let i = 0; i < qList.length; i++) {
      const c = qList[i];
      if (c === a.collider) continue;
      if (c.kind === 'box') moved = resolveCapsuleBox(a, c) || moved;
      else if (c.kind === 'surface') moved = resolveCapsuleSurface(a, c) || moved;
      else if (c.kind === 'actor') moved = resolveCapsuleActor(a, c) || moved;
    }
    if (!moved) break;
  }
  resolveTerrain(a);
  const lim = HALF - W.boundsPadding;
  if (p.x < -lim) { p.x = -lim; a.vel.x = Math.max(0, a.vel.x); }
  if (p.x > lim) { p.x = lim; a.vel.x = Math.min(0, a.vel.x); }
  if (p.z < -lim) { p.z = -lim; a.vel.z = Math.max(0, a.vel.z); }
  if (p.z > lim) { p.z = lim; a.vel.z = Math.min(0, a.vel.z); }
}

function snapToGround(a) {
  const P = CONFIG.player;
  const len = P.snapDistance + 0.05;
  if (raycastWorld(a.pos.x, a.pos.y + 0.05, a.pos.z, 0, -1, 0, len, a.collider)) {
    if (worldHit.ny > P.groundNormalY) {
      a.pos.y = worldHit.py; a.onGround = true;
      a.groundCollider = worldHit.collider;
      if (a.vel.y < 0) a.vel.y = 0;
    }
  }
}

function physicsStep(a, dt, jumped) {
  const P = CONFIG.player;
  a.wasGrounded = a.onGround;
  a.onGround = false; a.groundCollider = null;
  const dx = a.vel.x * dt, dy = a.vel.y * dt, dz = a.vel.z * dt;
  const dist = Math.hypot(dx, dy, dz);
  const steps = Math.max(1, Math.ceil(dist / P.maxSubstep));
  for (let s = 0; s < steps; s++) {
    a.pos.x += dx / steps; a.pos.y += dy / steps; a.pos.z += dz / steps;
    resolveCollisions(a);
  }
  if (!a.onGround && a.wasGrounded && !jumped && a.vel.y <= 0) snapToGround(a);
  a.inWater = a.pos.y < W.waterLevel - P.waterDepth;
  updateActorCollider(a);
}

function canStand(a, height) {
  qMin[0] = a.pos.x - a.radius; qMin[1] = a.pos.y + 0.05; qMin[2] = a.pos.z - a.radius;
  qMax[0] = a.pos.x + a.radius; qMax[1] = a.pos.y + height; qMax[2] = a.pos.z + a.radius;
  grid.query(qMin, qMax, qList);
  for (const c of qList) {
    if (c === a.collider) continue;
    if (c.kind === 'box' && capsuleOverlapsBox(a.pos.x, a.pos.y + 0.05, a.pos.z, a.radius, height - 0.05, c.min, c.max)) return false;
    if (c.kind === 'surface' && a.pos.x >= c.min[0] && a.pos.x <= c.max[0] && a.pos.z >= c.min[2] && a.pos.z <= c.max[2]) {
      const hh = surfaceHeight(c, a.pos.x, a.pos.z);
      if (hh - c.thick > a.pos.y + 0.5 && hh - c.thick < a.pos.y + height) return false;
    }
  }
  return true;
}

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
const buildMat = new THREE.MeshLambertMaterial({ color: CONFIG.build.color });
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
    // y = base + R * (half - (p - c)·o) / half
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
  spawnParticles(_pc.x, _pc.y, _pc.z, CONFIG.build.color, 12, 3.5);
  sfx('break');
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

function damagePart(part, dmg, hx, hy, hz) {
  if (!part.alive) return;
  part.hp -= dmg;
  showDamageNumber(hx, hy, hz, dmg, false);
  if (part.hp <= 0) destroyPart(part, 'damage');
}

// ---------------------------------------------------------------------
// Effekte: Partikel und Schadenszahlen aus Pools
// ---------------------------------------------------------------------
const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const particles = new Pool(() => {
  const m = new THREE.Mesh(particleGeo, lambert(0xffffff));
  m.visible = false; m.matrixAutoUpdate = true;
  scene.add(m);
  return { mesh: m, vel: new THREE.Vector3(), life: 0, active: false };
}, CONFIG.effects.poolSize);
const activeParticles = [];

function spawnParticles(x, y, z, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const p = particles.get();
    if (!p) return;
    p.mesh.material = lambert(color);
    p.mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4);
    p.vel.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed);
    p.life = CONFIG.effects.particleLife * (0.6 + Math.random() * 0.6);
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
    p.vel.y -= g * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += dt * 8; p.mesh.rotation.y += dt * 6;
  }
}

const dmgLayer = $('dmgLayer');
const damageNumbers = new Pool(() => {
  const el = document.createElement('div');
  el.className = 'dmg'; el.style.display = 'none';
  dmgLayer.appendChild(el);
  return { el, x: 0, y: 0, z: 0, life: 0, active: false };
}, CONFIG.effects.damageNumberPool);
const activeDamageNumbers = [];

function showDamageNumber(x, y, z, value, head) {
  const d = damageNumbers.get();
  if (!d) return;
  d.x = x; d.y = y; d.z = z; d.life = CONFIG.effects.damageNumberLife; d.active = true;
  d.el.textContent = Math.round(value);
  d.el.className = head ? 'dmg head' : 'dmg';
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

// ---------------------------------------------------------------------
// Audio (WebAudio-Oszillatoren, keine Dateien nötig)
// ---------------------------------------------------------------------
let audioCtx = null;
function initAudio() {
  if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) audioCtx = new AC();
}
function sfx(kind) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  const v = CONFIG.audio.volume;
  const presets = {
    place: ['square', 420, 260, 0.07, v * 0.5],
    hit: ['triangle', 220, 120, 0.08, v],
    head: ['triangle', 660, 380, 0.1, v],
    break: ['sawtooth', 160, 50, 0.22, v * 0.7],
    swing: ['sine', 300, 180, 0.05, v * 0.3],
    deny: ['square', 140, 120, 0.08, v * 0.4],
  };
  const pr = presets[kind];
  if (!pr) return;
  o.type = pr[0];
  o.frequency.setValueAtTime(pr[1], t);
  o.frequency.exponentialRampToValueAtTime(pr[2], t + pr[3]);
  g.gain.setValueAtTime(pr[4], t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + pr[3]);
  o.connect(g).connect(audioCtx.destination);
  o.start(t); o.stop(t + pr[3] + 0.02);
}

// ---------------------------------------------------------------------
// Einstellungen (localStorage nur als Komfort, mit try/catch)
// ---------------------------------------------------------------------
const settings = { sens: 1, quality: CONFIG.render.defaultQuality, touch: 'auto', invert: '0' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('fat-settings') || '{}')); } catch (e) { /* ohne Speicher weiter */ }
function saveSettings() { try { localStorage.setItem('fat-settings', JSON.stringify(settings)); } catch (e) { /* egal */ } }

const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
function touchEnabled() { return settings.touch === 'an' || (settings.touch === 'auto' && isTouchDevice); }

function applyQuality() {
  const q = CONFIG.render.quality[settings.quality] || CONFIG.render.quality.mittel;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  if (renderer.shadowMap.enabled !== q.shadows) {
    renderer.shadowMap.enabled = q.shadows;
    sun.castShadow = q.shadows;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }
  resize();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------
// Eingabe: Tastatur, Maus (Pointer Lock), Touch (Joystick + Wischen)
// ---------------------------------------------------------------------
const input = {
  keys: new Set(), pressed: new Set(),
  actionHeld: false, actionPressed: false,
  joy: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
  lookId: null, lookX: 0, lookY: 0,
  touchJump: false, touchCrouchToggle: false,
  wheel: 0,
};
let pointerLocked = false;
let gameState = 'loading'; // loading | start | playing | paused

function lookDelta(dx, dy, sens) {
  if (!player) return;
  const inv = settings.invert === '1' ? -1 : 1;
  player.yaw -= dx * sens * settings.sens;
  player.pitch = clamp(player.pitch - dy * sens * settings.sens * inv, CONFIG.camera.pitchMin, CONFIG.camera.pitchMax);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'F3' || e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  if (gameState !== 'playing') {
    if (gameState === 'paused' && e.code === 'KeyP') resumeGame();
    return;
  }
  if (!e.repeat) input.pressed.add(e.code);
  input.keys.add(e.code);
  if (e.code === 'KeyP' || e.code === 'Escape') pauseGame();
});
window.addEventListener('keyup', (e) => { input.keys.delete(e.code); });
window.addEventListener('blur', () => { input.keys.clear(); input.actionHeld = false; });

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === document.body;
  if (!pointerLocked && gameState === 'playing' && !touchEnabled()) pauseGame();
});
document.addEventListener('mousemove', (e) => {
  if (pointerLocked && gameState === 'playing') lookDelta(e.movementX || 0, e.movementY || 0, CONFIG.input.mouseSensitivity);
});
window.addEventListener('wheel', (e) => { if (gameState === 'playing') input.wheel += Math.sign(e.deltaY); }, { passive: true });

const touchLayer = $('touchLayer');
const joyBase = $('joyBase'), joyKnob = $('joyKnob');
touchLayer.addEventListener('contextmenu', (e) => e.preventDefault());
touchLayer.addEventListener('pointerdown', (e) => {
  if (gameState !== 'playing') return;
  if (e.pointerType === 'mouse') {
    if (!pointerLocked && document.body.requestPointerLock) { document.body.requestPointerLock(); return; }
    if (e.button === 0) { input.actionHeld = true; input.actionPressed = true; }
    return;
  }
  e.preventDefault();
  const zone = window.innerWidth * CONFIG.input.joystickZone;
  if (e.clientX < zone && input.joy.id === null) {
    input.joy.id = e.pointerId; input.joy.ox = e.clientX; input.joy.oy = e.clientY; input.joy.x = 0; input.joy.y = 0;
    joyBase.style.left = e.clientX + 'px'; joyBase.style.top = e.clientY + 'px';
    joyKnob.style.left = '60px'; joyKnob.style.top = '60px';
    joyBase.classList.remove('hidden');
  } else if (input.lookId === null) {
    input.lookId = e.pointerId; input.lookX = e.clientX; input.lookY = e.clientY;
  }
  try { touchLayer.setPointerCapture(e.pointerId); } catch (err) { /* ältere Safari */ }
});
touchLayer.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') return;
  if (e.pointerId === input.joy.id) {
    const R = CONFIG.input.joystickRadius;
    let dx = e.clientX - input.joy.ox, dy = e.clientY - input.joy.oy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx *= R / len; dy *= R / len; }
    input.joy.x = dx / R; input.joy.y = dy / R;
    joyKnob.style.left = (60 + dx) + 'px'; joyKnob.style.top = (60 + dy) + 'px';
  } else if (e.pointerId === input.lookId) {
    lookDelta(e.clientX - input.lookX, e.clientY - input.lookY, CONFIG.input.touchSensitivity);
    input.lookX = e.clientX; input.lookY = e.clientY;
  }
});
function endPointer(e) {
  if (e.pointerType === 'mouse') { if (e.button === 0) input.actionHeld = false; return; }
  if (e.pointerId === input.joy.id) { input.joy.id = null; input.joy.x = 0; input.joy.y = 0; joyBase.classList.add('hidden'); }
  if (e.pointerId === input.lookId) input.lookId = null;
}
touchLayer.addEventListener('pointerup', endPointer);
touchLayer.addEventListener('pointercancel', endPointer);

// Touch-Knöpfe
const btnHeld = new Set();
document.querySelectorAll('[data-btn]').forEach((el) => {
  const name = el.dataset.btn;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    el.classList.add('down');
    btnHeld.add(name);
    initAudio();
    if (name === 'menu') { if (gameState === 'playing') pauseGame(); return; }
    if (gameState !== 'playing') return;
    if (name === 'action') { input.actionHeld = true; input.actionPressed = true; }
    else if (name === 'jump') input.touchJump = true;
    else if (name === 'crouch') input.touchCrouchToggle = true;
    else if (name === 'build') input.pressed.add('KeyQ');
    else if (name === 'debug') input.pressed.add('F3');
    else if (PIECES.includes(name)) input.pressed.add('Digit' + (PIECES.indexOf(name) + 1));
  });
  const up = (e) => {
    e.preventDefault(); el.classList.remove('down'); btnHeld.delete(name);
    if (name === 'action') input.actionHeld = false;
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
});

// iOS: Zoom-/Scroll-Gesten unterdrücken
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (!e.target.closest('.panel')) e.preventDefault(); }, { passive: false });

// ---------------------------------------------------------------------
// Spielzustand
// ---------------------------------------------------------------------
let gameTime = 0;
const game = { mode: 'combat', piece: 'wall', buildTarget: null, buildRepeat: 0, swingCooldown: 0, debug: false, aimPart: null };
const cmd = { mx: 0, mz: 0, sprint: false, jump: false, crouchToggle: false, crouchHold: false };

// Kamera-Rig: Über-die-Schulter, mit eigenem Kollisions-Raycast
const rig = { px: 0, py: 0, pz: 0, cx: 0, cy: 0, cz: 0, fx: 0, fy: 0, fz: -1 };
function computeRig(pos, height, yaw, pitch, out) {
  const C = CONFIG.camera;
  const cp = Math.cos(pitch);
  out.fx = -Math.sin(yaw) * cp; out.fy = Math.sin(pitch); out.fz = -Math.cos(yaw) * cp;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  out.px = pos.x; out.py = pos.y + height - CONFIG.player.eyeFromTop; out.pz = pos.z;
  const sx = out.px + rx * C.shoulder, sy = out.py + C.height, sz = out.pz + rz * C.shoulder;
  let tx = sx - out.fx * C.distance, ty = sy - out.fy * C.distance, tz = sz - out.fz * C.distance;
  let dx = tx - out.px, dy = ty - out.py, dz = tz - out.pz;
  const len = Math.hypot(dx, dy, dz);
  dx /= len; dy /= len; dz /= len;
  let d = len;
  if (raycastWorld(out.px, out.py, out.pz, dx, dy, dz, len, player ? player.collider : null)) d = Math.max(CONFIG.camera.minDistance, worldHit.t - C.padding);
  out.cx = out.px + dx * d; out.cy = out.py + dy * d; out.cz = out.pz + dz * d;
  return out;
}

// Zielpunkt fürs Bauen bestimmen (Kachel, Stockwerk, Richtung)
function facingDir(yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 'E' : 'W';
  return fz > 0 ? 'S' : 'N';
}

function computeBuildTarget() {
  const B = CONFIG.build, p = player.pos;
  const dir = facingDir(player.yaw);
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const tileX = Math.floor(p.x / T), tileZ = Math.floor(p.z / T);
  let level = Math.floor((p.y + B.levelBias) / H);
  const gp = player.groundCollider && player.groundCollider.owner && player.groundCollider.owner.type ? player.groundCollider.owner : null;
  const pitch = player.pitch;
  const type = game.piece;
  let x = tileX, z = tileZ, y = level;
  if (type === 'wall') {
    if (pitch > B.pitchUpLevel) y++;
  } else if (type === 'floor') {
    if (pitch > B.pitchDownFloor) {
      x = Math.floor((p.x + fx * T * B.aheadFactor) / T); z = Math.floor((p.z + fz * T * B.aheadFactor) / T);
    }
    if (pitch > B.pitchUpLevel * 0.6) y++;
  } else if (type === 'ramp') {
    x = Math.floor((p.x + fx * T * B.aheadFactor) / T); z = Math.floor((p.z + fz * T * B.aheadFactor) / T);
    if (gp && gp.type === 'ramp' && gp.dir === dir && (x !== gp.x || z !== gp.z)) y = gp.y + 1;
    else if (pitch > B.pitchUpLevel) y++;
  } else if (type === 'roof') {
    x = Math.floor((p.x + fx * T * B.aheadFactor) / T); z = Math.floor((p.z + fz * T * B.aheadFactor) / T);
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

function updateGhost() {
  for (const t of PIECES) ghosts[t].visible = false;
  const bt = game.buildTarget;
  if (game.mode !== 'build' || !bt) return;
  const g = ghosts[bt.type];
  g.material = bt.valid ? ghostMatOk : ghostMatBad;
  applyPartTransform(g, bt.type, bt.x, bt.y, bt.z, bt.dir);
  g.visible = true;
}

// ---------------------------------------------------------------------
// Trainingspuppen (Hitbox-Test für Kopf/Körper)
// ---------------------------------------------------------------------
function createDummies() {
  const D = CONFIG.dummy;
  const fx = -Math.sin(spawnPoint.yaw), fz = -Math.cos(spawnPoint.yaw);
  const rx = Math.cos(spawnPoint.yaw), rz = -Math.sin(spawnPoint.yaw);
  for (let i = 0; i < D.count; i++) {
    const a = createActor(D.color, false);
    // Reihe rechts neben dem Spawn, Blick zum Spieler
    const off = (i - (D.count - 1) / 2) * D.spacing;
    a.pos.set(spawnPoint.x + rx * D.distance + fx * off, 0, spawnPoint.z + rz * D.distance + fz * off);
    a.pos.y = getHeight(a.pos.x, a.pos.z);
    a.yaw = spawnPoint.yaw + Math.PI / 2;
    a.hp = D.hp;
    a.prev.copy(a.pos);
    grid.insert(a.collider);
    updateActorCollider(a);
    dummies.push(a);
  }
}

function hitDummy(a, zone, hx, hy, hz) {
  const P = CONFIG.pickaxe, D = CONFIG.dummy;
  const head = zone === 'head';
  const dmg = head ? P.damageHead : P.damageBody;
  a.hp -= dmg; a.lastHit = gameTime;
  showDamageNumber(hx, hy, hz, dmg, head);
  spawnParticles(hx, hy, hz, head ? 0xffd23f : 0xffffff, 6, 3);
  sfx(head ? 'head' : 'hit');
  if (a.hp <= 0) { a.alive = false; a.respawnAt = gameTime + D.respawnTime; }
}

function updateDummies() {
  const D = CONFIG.dummy;
  for (const a of dummies) {
    if (!a.alive && gameTime >= a.respawnAt) { a.alive = true; a.hp = D.hp; }
    if (a.alive && a.hp < D.hp && gameTime - a.lastHit > D.regenDelay) a.hp = D.hp;
  }
}

// ---------------------------------------------------------------------
// TICK – feste Reihenfolge:
// Input → Spieler → Bots → Physik → Waffen & Projektile → Bauen → Sturm → Loot → Aufräumen
// (Sturm und Loot kommen in späteren Phasen dazu; hier laufen nur vorhandene Systeme.)
// ---------------------------------------------------------------------
function tick(dt) {
  gameTime += dt;
  player.prev.copy(player.pos);

  // 1) Input
  sampleInput();
  // 2) Spieler (Absicht → Geschwindigkeit)
  const jumped = updatePlayerIntent(dt);
  // 3) Bots – hier Trainingspuppen (Regeneration / Respawn)
  updateDummies();
  // 4) Physik
  physicsStep(player, dt, jumped);
  // 5) Waffen & Projektile (Spitzhacke, Effekte)
  updateCombat(dt);
  updateParticles(dt);
  updateDamageNumbers(dt);
  // 6) Bauen
  updateBuilding(dt);
  // 9) Aufräumen
  cleanup();
  input.pressed.clear();
  input.actionPressed = false;
  input.touchJump = false;
  input.touchCrouchToggle = false;
  input.wheel = 0;
}

function sampleInput() {
  const k = input.keys;
  let mx = 0, mz = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
  let sprint = k.has('ShiftLeft') || k.has('ShiftRight');
  const j = input.joy;
  if (j.id !== null) {
    const len = Math.hypot(j.x, j.y);
    if (len > CONFIG.input.deadZone) { mx += j.x; mz += j.y; }
    if (len >= CONFIG.input.sprintThreshold) sprint = true;
  }
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  cmd.mx = mx; cmd.mz = mz; cmd.sprint = sprint;
  cmd.jump = k.has('Space') || input.touchJump;
  cmd.crouchToggle = input.pressed.has('KeyC') || input.touchCrouchToggle;
  cmd.crouchHold = k.has('ControlLeft') || k.has('ControlRight');

  if (input.pressed.has('F3')) { game.debug = !game.debug; $('debug').classList.toggle('hidden', !game.debug); setDebugVisible(game.debug); }
  if (input.pressed.has('KeyQ')) setMode(game.mode === 'build' ? 'combat' : 'build');
  for (let i = 0; i < PIECES.length; i++) if (input.pressed.has('Digit' + (i + 1))) { setPiece(PIECES[i]); setMode('build'); }
  if (input.wheel !== 0 && game.mode === 'build') {
    const idx = (PIECES.indexOf(game.piece) + (input.wheel > 0 ? 1 : -1) + PIECES.length) % PIECES.length;
    setPiece(PIECES[idx]);
  }
}

let crouchToggled = false;
function updatePlayerIntent(dt) {
  const P = CONFIG.player, a = player;
  if (cmd.crouchToggle) { crouchToggled = !crouchToggled; $('btnCrouch').classList.toggle('on', crouchToggled); }
  const wantCrouch = crouchToggled || cmd.crouchHold;
  if (wantCrouch && !a.crouching) { a.crouching = true; a.height = P.crouchHeight; }
  else if (!wantCrouch && a.crouching && canStand(a, P.height)) { a.crouching = false; a.height = P.height; }

  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  let wx = cmd.mx * cos + cmd.mz * sin;
  let wz = -cmd.mx * sin + cmd.mz * cos;
  let speed = a.crouching ? P.crouchSpeed : (cmd.sprint && cmd.mz < 0 ? P.sprintSpeed : P.walkSpeed);
  if (a.inWater) speed *= P.waterSpeedFactor;
  const tx = wx * speed, tz = wz * speed;
  const accel = (a.onGround ? P.groundAccel : P.airAccel) * dt;
  const dvx = tx - a.vel.x, dvz = tz - a.vel.z;
  const dl = Math.hypot(dvx, dvz);
  if (dl <= accel) { a.vel.x = tx; a.vel.z = tz; }
  else { a.vel.x += dvx / dl * accel; a.vel.z += dvz / dl * accel; }

  let jumped = false;
  if (cmd.jump && a.onGround) {
    if (a.crouching && canStand(a, P.height)) { a.crouching = false; crouchToggled = false; a.height = P.height; $('btnCrouch').classList.remove('on'); }
    a.vel.y = P.jumpSpeed; a.onGround = false; jumped = true;
  }
  a.vel.y = Math.max(-P.maxFallSpeed, a.vel.y - P.gravity * dt);
  const moving = Math.hypot(a.vel.x, a.vel.z);
  a.walkPhase += moving * dt * 2.2;
  return jumped;
}

function updateCombat(dt) {
  const P = CONFIG.pickaxe;
  game.swingCooldown = Math.max(0, game.swingCooldown - dt);
  player.swing = Math.max(0, player.swing - dt);
  if (game.mode !== 'combat') return;
  if (!(input.actionPressed || input.actionHeld) || game.swingCooldown > 0) return;
  game.swingCooldown = P.cooldown;
  player.swing = P.swingTime;
  sfx('swing');
  computeRig(player.pos, player.height, player.yaw, player.pitch, rig);
  const ox = rig.cx, oy = rig.cy, oz = rig.cz;
  const camToEye = Math.hypot(rig.cx - rig.px, rig.cy - rig.py, rig.cz - rig.pz);
  if (!raycastWorld(ox, oy, oz, rig.fx, rig.fy, rig.fz, camToEye + P.range + 1, player.collider)) return;
  const eyeDist = Math.hypot(worldHit.px - rig.px, worldHit.py - rig.py, worldHit.pz - rig.pz);
  if (eyeDist > P.range) return;
  const c = worldHit.collider;
  if (c && c.owner && c.owner.type && PIECES.includes(c.owner.type)) {
    sfx('hit');
    spawnParticles(worldHit.px, worldHit.py, worldHit.pz, CONFIG.build.color, 5, 2.5);
    damagePart(c.owner, P.damageBuild, worldHit.px, worldHit.py, worldHit.pz);
  } else if (c && c.kind === 'actor') {
    hitDummy(c.owner, worldHit.zone, worldHit.px, worldHit.py, worldHit.pz);
  } else {
    spawnParticles(worldHit.px, worldHit.py, worldHit.pz, worldHit.terrain ? 0x6b8f4a : 0x999999, 4, 2);
    sfx('hit');
  }
}

function updateBuilding(dt) {
  if (game.mode === 'build') {
    game.buildTarget = computeBuildTarget();
    game.buildRepeat = Math.max(0, game.buildRepeat - dt);
    if (input.actionPressed || (input.actionHeld && game.buildRepeat <= 0)) {
      const bt = game.buildTarget;
      if (bt.valid) {
        placePart(bt, 'player');
        sfx('place');
        game.buildTarget = computeBuildTarget();
      } else if (input.actionPressed) sfx('deny');
      game.buildRepeat = CONFIG.build.repeatDelay;
    }
  } else game.buildTarget = null;
  updateGhost();
  // Einsturz-Kettenreaktion abarbeiten
  for (let i = collapseQueue.length - 1; i >= 0; i--) {
    const e = collapseQueue[i];
    if (gameTime >= e.time) { collapseQueue.splice(i, 1); if (e.part.alive) destroyPart(e.part, 'collapse'); }
  }
}

function cleanup() {
  while (trash.length) {
    const m = trash.pop();
    scene.remove(m);
    if (m.userData.unique) { m.geometry.dispose(); m.material.dispose(); }
  }
  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    if (!p.active) { p.mesh.visible = false; activeParticles.splice(i, 1); particles.release(p); }
  }
  for (let i = activeDamageNumbers.length - 1; i >= 0; i--) {
    const d = activeDamageNumbers[i];
    if (!d.active) { d.el.style.display = 'none'; activeDamageNumbers.splice(i, 1); damageNumbers.release(d); }
  }
}

// ---------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------
const modeLabel = $('modeLabel'), slotsEl = $('slots'), btnAction = $('btnAction'), btnBuild = $('btnBuild'), buildBtns = $('buildBtns');
function setMode(m) {
  game.mode = m;
  refreshHud();
}
function setPiece(p) { game.piece = p; refreshHud(); }
function refreshHud() {
  const build = game.mode === 'build';
  modeLabel.textContent = build ? 'Bauen – ' + PIECE_NAMES[game.piece] : 'Kampf – Spitzhacke';
  slotsEl.style.opacity = build ? 1 : 0.45;
  slotsEl.querySelectorAll('.slot').forEach((s) => s.classList.toggle('active', build && s.dataset.slot === game.piece));
  btnAction.textContent = build ? 'Bauen' : 'Hacken';
  btnBuild.classList.toggle('on', build);
  btnBuild.textContent = build ? 'Kampf' : 'Bauen';
  buildBtns.classList.toggle('hidden', !build);
  buildBtns.querySelectorAll('.tbtn').forEach((b) => b.classList.toggle('on', b.dataset.btn === game.piece));
  $('btnCrouch').classList.toggle('on', crouchToggled);
}

const targetInfo = $('targetInfo'), targetLabel = $('targetLabel'), targetFill = $('targetFill');
function updateTargetInfo() {
  let shown = false;
  if (raycastWorld(camera.position.x, camera.position.y, camera.position.z, rig.fx, rig.fy, rig.fz, CONFIG.raycast.infoDistance + CONFIG.camera.distance, player.collider)) {
    const c = worldHit.collider;
    if (c && c.owner) {
      const o = c.owner;
      if (o.type && PIECES.includes(o.type)) {
        targetLabel.textContent = PIECE_NAMES[o.type] + ' ' + Math.max(0, Math.ceil(o.hp)) + '/' + o.maxHp;
        targetFill.style.width = (100 * Math.max(0, o.hp) / o.maxHp) + '%';
        shown = true;
      } else if (c.kind === 'actor') {
        targetLabel.textContent = 'Trainingspuppe ' + Math.max(0, o.hp) + '/' + CONFIG.dummy.hp + (worldHit.zone === 'head' ? ' (Kopf)' : '');
        targetFill.style.width = (100 * Math.max(0, o.hp) / CONFIG.dummy.hp) + '%';
        shown = true;
      }
    }
  }
  targetInfo.classList.toggle('hidden', !shown);
}

let toastTimer = 0;
function toast(text) {
  const el = $('toast'); el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---------------------------------------------------------------------
// Debug-Modus (F3)
// ---------------------------------------------------------------------
const dbgGeo = new THREE.BufferGeometry();
const dbgPos = new Float32Array(CONFIG.debug.maxLines * 6);
const dbgCol = new Float32Array(CONFIG.debug.maxLines * 6);
dbgGeo.setAttribute('position', new THREE.BufferAttribute(dbgPos, 3));
dbgGeo.setAttribute('color', new THREE.BufferAttribute(dbgCol, 3));
const dbgLines = new THREE.LineSegments(dbgGeo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
dbgLines.frustumCulled = false; dbgLines.visible = false; dbgLines.renderOrder = 20;
dbgLines.userData.unique = true;
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
    body.userData.unique = true;
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
  // Grid-Zellen um den Spieler
  const cs = CONFIG.grid.cellSize;
  const cx = Math.floor(renderPos.x / cs), cy = Math.floor((renderPos.y + 0.9) / cs), cz = Math.floor(renderPos.z / cs);
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
    const own = i === 0 && k === 0;
    dbgBox([(cx + i) * cs, cy * cs, (cz + k) * cs], [(cx + i + 1) * cs, (cy + 1) * cs, (cz + k + 1) * cs], own ? 0xffe23f : 0x8a7a2a);
  }
  dbgGeo.attributes.position.needsUpdate = true;
  dbgGeo.attributes.color.needsUpdate = true;
  dbgGeo.setDrawRange(0, dbgCount * 2);
  // Hitboxen als Drahtgitter
  for (const a of [player, ...dummies]) {
    const w = actorWire(a);
    const pos = a === player ? renderPos : a.pos;
    const hr = CONFIG.player.headRadius;
    // Körper-Kapsel: Kugelmittelpunkte bei y0 und y1 (wie im Raycast)
    const bodyLen = Math.max(0.01, a.height - 2 * hr - a.radius);
    if (Math.abs(w.len - bodyLen) > 1e-3) {
      w.body.geometry.dispose();
      w.body.geometry = new THREE.CapsuleGeometry(a.radius, bodyLen, 4, 10);
      w.len = bodyLen;
    }
    const y0 = pos.y + a.radius, y1 = pos.y + a.height - 2 * hr;
    w.body.position.set(pos.x, (y0 + y1) / 2, pos.z);
    w.head.position.set(pos.x, pos.y + a.height - hr, pos.z);
    w.body.visible = w.head.visible = a.alive;
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
    'Boden      ' + (player.onGround ? (g ? (g.owner && g.owner.type ? PIECE_NAMES[g.owner.type] : 'Objekt') : 'Terrain') : 'in der Luft') + '\n' +
    'Tempo      ' + Math.hypot(player.vel.x, player.vel.z).toFixed(2) + ' m/s\n' +
    'Collider   ' + grid.count + '  (Zellen ' + grid.cells.size + ')\n' +
    'Bauteile   ' + parts.size + '  Einsturz-Queue ' + collapseQueue.length + '\n' +
    'Partikel   ' + particles.used + '/' + CONFIG.effects.poolSize + '\n' +
    'Szene      ' + scene.children.length + ' Objekte, ' + renderer.info.render.calls + ' Draw Calls\n' +
    'Bauziel    ' + (game.buildTarget ? game.buildTarget.key + (game.buildTarget.valid ? '' : ' (ungültig)') : '-');
}

// ---------------------------------------------------------------------
// Rendering mit Interpolation zwischen den letzten zwei Ticks
// ---------------------------------------------------------------------
const renderPos = new THREE.Vector3();
function animateCharacter(a, pos, dt) {
  const m = a.model;
  m.group.position.copy(pos);
  m.group.rotation.y = a.yaw;
  const s = a.height / CONFIG.player.height;
  m.group.scale.set(1, s, 1);
  const speed = Math.hypot(a.vel.x, a.vel.z);
  const amp = Math.min(1, speed / CONFIG.player.walkSpeed) * 0.7;
  const sw = Math.sin(a.walkPhase * 3.2) * amp;
  m.legL.rotation.x = sw; m.legR.rotation.x = -sw;
  m.armL.rotation.x = -sw * 0.8;
  const swingT = a.swing > 0 ? a.swing / CONFIG.pickaxe.swingTime : 0;
  m.armR.rotation.x = swingT > 0 ? -2.4 * Math.sin(swingT * Math.PI) : sw * 0.8;
  m.group.visible = a.alive;
}

function render(alpha, dt) {
  if (player) {
    renderPos.lerpVectors(player.prev, player.pos, alpha);
    computeRig(renderPos, player.height, player.yaw, player.pitch, rig);
    camera.position.set(rig.cx, rig.cy, rig.cz);
    camera.lookAt(rig.cx + rig.fx, rig.cy + rig.fy, rig.cz + rig.fz);
    animateCharacter(player, renderPos, dt);
    for (const d of dummies) animateCharacter(d, d.pos, dt);
    sun.position.set(renderPos.x + 60, renderPos.y + 120, renderPos.z + 40);
    sun.target.position.copy(renderPos);
    if (gameState === 'playing') updateTargetInfo();
    if (game.debug) { updateDebugDraw(renderPos); updateDebugText(dt); }
  }
  renderer.render(scene, camera);
  renderDamageNumbers();
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
  if (gameState === 'playing') {
    accumulator += dt;
    let n = 0;
    while (accumulator >= TICK && n < CONFIG.maxTicksPerFrame) { tick(TICK); accumulator -= TICK; n++; }
    if (n >= CONFIG.maxTicksPerFrame) accumulator = 0;
  }
  render(gameState === 'playing' ? accumulator / TICK : 1, dt);
}

// ---------------------------------------------------------------------
// Menüs
// ---------------------------------------------------------------------
function applyTouchUI() { $('touchUI').classList.toggle('hidden', !(touchEnabled() && gameState === 'playing')); }

function startGame() {
  initAudio();
  $('startScreen').classList.add('hidden');
  gameState = 'playing';
  lastTime = performance.now(); accumulator = 0;
  applyTouchUI();
  if (!touchEnabled() && document.body.requestPointerLock) document.body.requestPointerLock();
  toast(touchEnabled() ? 'Links laufen, rechts umsehen' : 'Q = Bauen, 1–4 = Bauteil');
}
function pauseGame() {
  if (gameState !== 'playing') return;
  gameState = 'paused';
  input.keys.clear(); input.actionHeld = false;
  input.joy.id = null; input.lookId = null; joyBase.classList.add('hidden');
  $('optSens').value = settings.sens; $('optQuality').value = settings.quality;
  $('optTouch').value = settings.touch; $('optInvert').value = settings.invert;
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

$('btnStart').addEventListener('click', startGame);
$('btnResume').addEventListener('click', resumeGame);
$('btnFullscreen').addEventListener('click', () => {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) { try { const r = req.call(el); if (r && r.catch) r.catch(() => toast('Vollbild nicht verfügbar – zum Home-Bildschirm hinzufügen')); } catch (e) { toast('Vollbild nicht verfügbar'); } }
  else toast('Tipp: Teilen → „Zum Home-Bildschirm“ für Vollbild');
});
$('optSens').addEventListener('input', (e) => { settings.sens = parseFloat(e.target.value); saveSettings(); });
$('optQuality').addEventListener('change', (e) => { settings.quality = e.target.value; saveSettings(); applyQuality(); });
$('optTouch').addEventListener('change', (e) => { settings.touch = e.target.value; saveSettings(); });
$('optInvert').addEventListener('change', (e) => { settings.invert = e.target.value; saveSettings(); });
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
  player = createActor(CONFIG.player.color, true);
  player.pos.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);
  player.prev.copy(player.pos);
  player.yaw = spawnPoint.yaw;
  grid.insert(player.collider);
  updateActorCollider(player);
  // Pickaxe in der rechten Hand
  const pick = new THREE.Group();
  const handle = new THREE.Mesh(unitBox, lambert(0x6b4a2b)); handle.scale.set(0.06, 0.7, 0.06); handle.position.y = -0.25; pick.add(handle);
  const headM = new THREE.Mesh(unitBox, lambert(0x9fb4c8)); headM.scale.set(0.08, 0.1, 0.5); headM.position.set(0, 0.08, -0.12); pick.add(headM);
  pick.position.set(0, -0.6, -0.12); pick.rotation.x = -Math.PI / 2.2;
  player.model.armR.add(pick);
  createDummies();
  applyQuality();
  refreshHud();
  // Szene einmal vorkompilieren, damit der erste Frame nicht ruckelt
  computeRig(player.pos, player.height, player.yaw, player.pitch, rig);
  camera.position.set(rig.cx, rig.cy, rig.cz);
  camera.lookAt(rig.cx + rig.fx, rig.cy + rig.fy, rig.cz + rig.fz);
  renderer.compile(scene, camera);
  gameState = 'start';
  $('loadingText').classList.add('hidden');
  $('btnStart').classList.remove('hidden');
  requestAnimationFrame(frame);
}

// Für automatisierte Tests / Debug-Konsole
window.__game = { CONFIG, grid, parts, tick: (n) => { for (let i = 0; i < n; i++) tick(TICK); }, computeBuildTarget, getHeight, raycastWorld, worldHit, evaluatePlacement, placePart, destroyPart, get player() { return player; }, get state() { return gameState; }, game, input, dummies, collapseQueue };

setTimeout(init, 30);
})();
