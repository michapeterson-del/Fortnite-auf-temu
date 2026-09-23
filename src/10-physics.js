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
  const nx = hl - hr, ny = 2 * e, nz = hd - hu;
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
    cells: [], range: null, stamp: 0, inGrid: false,
    foundation: false, planes: null, thick: 0, normalY: 1, material: null,
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
    if (c.inGrid) return;
    const r = this.rangeOf(c.min, c.max);
    c.range = r; c.cells.length = 0;
    for (let x = r[0]; x <= r[3]; x++) for (let y = r[1]; y <= r[4]; y++) for (let z = r[2]; z <= r[5]; z++) {
      const k = SpatialGrid.key(x, y, z);
      let arr = this.cells.get(k);
      if (!arr) { arr = []; this.cells.set(k, arr); }
      arr.push(c); c.cells.push(k);
    }
    c.inGrid = true;
    this.count++;
  }
  remove(c) {
    if (!c.inGrid) return;
    for (let i = 0; i < c.cells.length; i++) {
      const k = c.cells[i];
      const arr = this.cells.get(k);
      if (!arr) continue;
      const idx = arr.indexOf(c);
      if (idx >= 0) { arr[idx] = arr[arr.length - 1]; arr.pop(); }
      if (arr.length === 0) this.cells.delete(k);
    }
    c.cells.length = 0; c.range = null; c.inGrid = false;
    this.count--;
  }
  update(c) {
    if (!c.inGrid) return;
    const r = this.rangeOf(c.min, c.max), o = c.range;
    if (o[0] === r[0] && o[1] === r[1] && o[2] === r[2] && o[3] === r[3] && o[4] === r[4] && o[5] === r[5]) return;
    this.remove(c);
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
const _tmpN = { nx: 0, ny: 0, nz: 0 };
const _ro = [0, 0, 0], _rd = [0, 0, 0];

// Slab-Methode
function rayAABB(ox, oy, oz, dx, dy, dz, mn, mx, out) {
  let tmin = -Infinity, tmax = Infinity, axis = 0, sign = 0;
  _ro[0] = ox; _ro[1] = oy; _ro[2] = oz; _rd[0] = dx; _rd[1] = dy; _rd[2] = dz;
  for (let a = 0; a < 3; a++) {
    const o = _ro[a], d = _rd[a];
    if (Math.abs(d) < 1e-12) {
      if (o < mn[a] || o > mx[a]) return -1;
      continue;
    }
    const inv = 1 / d;
    let t1 = (mn[a] - o) * inv, t2 = (mx[a] - o) * inv;
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

// Höhe des obersten begehbaren Punkts unter (x, fromY, z); Figuren werden übersprungen
function groundBelow(x, fromY, z, maxDist) {
  let oy = fromY;
  for (let i = 0; i < 4; i++) {
    if (!raycastWorld(x, oy, z, 0, -1, 0, maxDist || 250, null)) return getHeight(x, z);
    const c = worldHit.collider;
    if (c && c.kind === 'actor') { oy = c.min[1] - 0.01; continue; }
    return worldHit.py;
  }
  return getHeight(x, z);
}

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
    case 'xn': p.x -= pushXn; if (a.vel.x > 0) a.vel.x = 0; a.blocked = true; break;
    case 'xp': p.x += pushXp; if (a.vel.x < 0) a.vel.x = 0; a.blocked = true; break;
    case 'zn': p.z -= pushZn; if (a.vel.z > 0) a.vel.z = 0; a.blocked = true; break;
    case 'zp': p.z += pushZp; if (a.vel.z < 0) a.vel.z = 0; a.blocked = true; break;
  }
  if (axis !== 'up' && axis !== 'down') a.blockCollider = c;
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
    if (worldHit.ny > P.groundNormalY && (!worldHit.collider || worldHit.collider.kind !== 'actor')) {
      a.pos.y = worldHit.py; a.onGround = true;
      a.groundCollider = worldHit.collider;
      if (a.vel.y < 0) a.vel.y = 0;
    }
  }
}

function updateActorCollider(a) {
  const c = a.collider, r = a.radius;
  c.min[0] = a.pos.x - r; c.min[1] = a.pos.y; c.min[2] = a.pos.z - r;
  c.max[0] = a.pos.x + r; c.max[1] = a.pos.y + a.height; c.max[2] = a.pos.z + r;
  grid.update(c);
}

function physicsStep(a, dt, jumped) {
  const P = CONFIG.player;
  a.wasGrounded = a.onGround;
  a.onGround = false; a.groundCollider = null; a.blocked = false; a.blockCollider = null;
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

// Sichtlinie zwischen zwei Punkten (für Bots): true = frei
function lineOfSight(ax, ay, az, bx, by, bz, ignoreA, target) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return true;
  if (!raycastWorld(ax, ay, az, dx / len, dy / len, dz / len, len, ignoreA)) return true;
  if (target && worldHit.collider === target.collider) return true;
  if (worldHit.t >= len - 0.3) return true;
  return false;
}
