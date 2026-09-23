// ---------------------------------------------------------------------
// Welt aufbauen: Terrain, Wasser, Häuser, Natur, Wolken, Loot-Punkte
// ---------------------------------------------------------------------
const houses = [];
const lootSpawns = { chests: [], floor: [] };
let waterMesh = null, cloudGroup = null;
const HOUSE_COLORS = [0xf2e6d0, 0xdfe9f2, 0xf2d9d0, 0xe3f0dc, 0xf0ecc8, 0xe8dff2];
const HOUSE_TRIMS = [0x5b6b82, 0x7a4b3a, 0x3f6f5a, 0x6d5a8a];

function planHouses(rnd) {
  for (let t = 0; t < 800 && houses.length < W.houses; t++) {
    const x = (rnd() * 2 - 1) * HALF * W.houseSpread, z = (rnd() * 2 - 1) * HALF * W.houseSpread;
    const w = rnd() < 0.5 ? 10 : 12, d = rnd() < 0.5 ? 8 : 10;
    const h = getHeight(x, z);
    if (h < W.waterLevel + 2) continue;
    let minH = Infinity, maxH = -Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      const hh = getHeight(x + sx * (w / 2 + 3), z + sz * (d / 2 + 3));
      minH = Math.min(minH, hh); maxH = Math.max(maxH, hh);
    }
    if (maxH - minH > 4.5 || minH < W.waterLevel + 1) continue;
    if (Math.hypot(x - W.lake.x, z - W.lake.z) < W.lake.radius + 15) continue;
    if (houses.some((o) => Math.hypot(o.x - x, o.z - z) < W.houseMinDist)) continue;
    houses.push({
      x, z, w, d, ground: Math.round(h * 10) / 10, door: Math.floor(rnd() * 4),
      color: HOUSE_COLORS[Math.floor(rnd() * HOUSE_COLORS.length)], trim: HOUSE_TRIMS[Math.floor(rnd() * HOUSE_TRIMS.length)],
      chimney: rnd() < 0.6,
    });
  }
  for (const hs of houses) flattenArea(hs.x, hs.z, hs.w / 2, hs.d / 2, 2, 7, hs.ground);
}

function insideHouse(x, z, margin) {
  return houses.some((h) => Math.abs(x - h.x) < h.w / 2 + margin && Math.abs(z - h.z) < h.d / 2 + margin);
}

function buildTerrainMesh() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(HM_N * HM_N * 3);
  const col = new Float32Array(HM_N * HM_N * 3);
  const uv = new Float32Array(HM_N * HM_N * 2);
  const c = new THREE.Color();
  const cSand = new THREE.Color(0xe2cf96), cGrass1 = new THREE.Color(0x5e9e44), cGrass2 = new THREE.Color(0x3d7a33), cGrass3 = new THREE.Color(0x93ae4c);
  const cRock = new THREE.Color(0x8a8175), cSnow = new THREE.Color(0xf0f4f5), cSea = new THREE.Color(0xb7a878), cDirt = new THREE.Color(0xa3906c);
  const nrm = { x: 0, y: 1, z: 0 };
  for (let j = 0; j < HM_N; j++) {
    for (let i = 0; i < HM_N; i++) {
      const k = j * HM_N + i;
      const x = i * W.cellSize - HALF, z = j * W.cellSize - HALF, h = heights[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
      getNormal(x, z, nrm);
      if (h < W.waterLevel - 0.5) c.copy(cSea);
      else if (h < W.waterLevel + 1.0) c.copy(cSand).lerp(cGrass1, smoothstep(W.waterLevel + 0.6, W.waterLevel + 1.0, h));
      else if (nrm.y < 0.8) c.copy(cRock).lerp(cGrass2, smoothstep(0.72, 0.8, nrm.y));
      else if (h > W.maxHeight * 0.95) c.copy(cSnow);
      else {
        c.copy(cGrass1).lerp(cGrass2, noiseGen.noise(x / 14, z / 14));
        c.lerp(cGrass3, smoothstep(0.55, 0.8, noiseGen.noise(x / 40 + 7, z / 40 - 3)) * 0.6);
        if (insideHouse(x, z, 3.5)) c.lerp(cDirt, 0.85);
      }
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
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.detail }));
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(W.size * 3, W.size * 3),
    new THREE.MeshStandardMaterial({ color: 0x14597f, roughness: 0.08, metalness: 0.1, normalMap: waterNormal, normalScale: new THREE.Vector2(0.45, 0.45), transparent: true, opacity: 0.9, envMapIntensity: 1.1 }));
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = W.waterLevel;
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);
}

// Box mit Collider (Kollision immer eigene Implementierung)
function addCollider(b, foundation) {
  const c = makeCollider('box', b[0], b[1], b[2], b[3], b[4], b[5], null);
  c.foundation = !!foundation;
  grid.insert(c);
  return c;
}

function addStaticBox(minX, minY, minZ, maxX, maxY, maxZ, material, foundation) {
  const m = new THREE.Mesh(unitBox, material);
  m.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  m.scale.set(maxX - minX, maxY - minY, maxZ - minZ);
  m.castShadow = true; m.receiveShadow = true;
  m.updateMatrix(); m.matrixAutoUpdate = false;
  scene.add(m);
  return addCollider([minX, minY, minZ, maxX, maxY, maxZ], foundation);
}

function buildHouse(hs) {
  const { x, z, w, d, ground } = hs;
  const wt = 0.3, storey = 3.6, floorTop = ground + 0.35;
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  const top = floorTop + storey;
  const L = { wall: [], found: [], floor: [], roof: [], trim: [], glass: [] };
  const solid = (list, b) => { list.push(b); addCollider(b, true); };

  solid(L.found, [x0 - 0.2, ground - 1.5, z0 - 0.2, x1 + 0.2, floorTop - 0.06, z1 + 0.2]);
  solid(L.floor, [x0 + wt, floorTop - 0.06, z0 + wt, x1 - wt, floorTop, z1 - wt]);

  // Seiten: 0=N(-z) 1=O(+x) 2=S(+z) 3=W(-x); Tür auf hs.door, Fenster auf den anderen Seiten
  const opening = (side) => side === hs.door ? { w: 1.4, b: 0, t: 2.4 } : { w: side === (hs.door + 2) % 4 ? 2.0 : 1.4, b: 1.0, t: 2.3 };
  const wall = (axis, f0, f1, a0, a1, side) => {
    const o = opening(side);
    const c = axis === 'x' ? x : z;
    const box = (s0, s1, b0, b1) => {
      if (s1 - s0 < 0.01 || b1 - b0 < 0.01) return;
      solid(L.wall, axis === 'x' ? [s0, b0, f0, s1, b1, f1] : [f0, b0, s0, f1, b1, s1]);
    };
    const o0 = c - o.w / 2, o1 = c + o.w / 2;
    box(a0, o0, floorTop, top); box(o1, a1, floorTop, top);
    box(o0, o1, floorTop, floorTop + o.b); box(o0, o1, floorTop + o.t, top);
    // Rahmen (nur Optik) und Glas in Fenstern
    const tr = 0.08, out = 0.05;
    const frame = (s0, s1, b0, b1) => L.trim.push(axis === 'x' ? [s0, b0, f0 - out, s1, b1, f1 + out] : [f0 - out, b0, s0, f1 + out, b1, s1]);
    frame(o0 - tr, o0, floorTop + o.b, floorTop + o.t + tr); frame(o1, o1 + tr, floorTop + o.b, floorTop + o.t + tr);
    frame(o0 - tr, o1 + tr, floorTop + o.t, floorTop + o.t + tr);
    if (o.b > 0) {
      frame(o0 - tr, o1 + tr, floorTop + o.b - tr, floorTop + o.b);
      const mid = (f0 + f1) / 2;
      L.glass.push(axis === 'x' ? [o0, floorTop + o.b, mid - 0.02, o1, floorTop + o.t, mid + 0.02] : [mid - 0.02, floorTop + o.b, o0, mid + 0.02, floorTop + o.t, o1]);
    }
  };
  wall('x', z0, z0 + wt, x0, x1, 0);
  wall('x', z1 - wt, z1, x0, x1, 2);
  wall('z', x0, x0 + wt, z0 + wt, z1 - wt, 3);
  wall('z', x1 - wt, x1, z0 + wt, z1 - wt, 1);
  // Dach mit Brüstung
  solid(L.roof, [x0 - 0.3, top, z0 - 0.3, x1 + 0.3, top + 0.3, z1 + 0.3]);
  const pt = top + 0.3, ph = 0.55;
  solid(L.trim, [x0 - 0.3, pt, z0 - 0.3, x1 + 0.3, pt + ph, z0]);
  solid(L.trim, [x0 - 0.3, pt, z1, x1 + 0.3, pt + ph, z1 + 0.3]);
  solid(L.trim, [x0 - 0.3, pt, z0, x0, pt + ph, z1]);
  solid(L.trim, [x1, pt, z0, x1 + 0.3, pt + ph, z1]);
  L.trim.push([x0 - 0.02, top - 0.25, z0 - 0.02, x1 + 0.02, top, z1 + 0.02]);
  if (hs.chimney) solid(L.found, [x1 - 2.2, pt, z0 + 1, x1 - 1.3, pt + 1.6, z0 + 1.9]);

  const mats = {
    wall: texMat('plaster', hs.color), found: texMat('stone', 0xffffff), floor: texMat('wood', 0xd9c2a0),
    roof: texMat('stone', 0x9a9a9a), trim: lambert(hs.trim),
    glass: new THREE.MeshPhongMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.35, shininess: 120, specular: 0xffffff, depthWrite: false }),
  };
  for (const k of Object.keys(L)) {
    if (!L[k].length) continue;
    const m = new THREE.Mesh(mergeBoxes(L[k], k === 'wall' ? 3 : 2), mats[k]);
    m.castShadow = k !== 'glass'; m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
  }

  // Loot-Punkte im Haus: Truhe in der Ecke gegenüber der Tür, Bodenloot verteilt
  const cornerX = hs.door === 1 ? x0 + 1.2 : x1 - 1.2;
  const cornerZ = hs.door === 2 ? z0 + 1.2 : z1 - 1.2;
  const chestYaw = Math.atan2(x - cornerX, z - cornerZ);
  lootSpawns.chests.push({ x: cornerX, y: floorTop, z: cornerZ, yaw: chestYaw });
  for (let i = 0; i < CONFIG.loot.floorPerHouse; i++) {
    lootSpawns.floor.push({ x: x + rand(-w / 2 + 1.3, w / 2 - 1.3), y: floorTop, z: z + rand(-d / 2 + 1.3, d / 2 - 1.3) });
  }
  lootSpawns.floor.push({ x: x + rand(-w / 3, w / 3), y: pt, z: z + rand(-d / 3, d / 3) });
}

function populateNature(rnd) {
  const nrm = { x: 0, y: 1, z: 0 };
  const okSpot = (x, z, minH, minNy) => {
    const h = getHeight(x, z);
    if (h < W.waterLevel + minH) return false;
    if (getNormal(x, z, nrm).y < (minNy || 0.82)) return false;
    if (insideHouse(x, z, 4)) return false;
    return true;
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), col = new THREE.Color();
  const white = lambert(0xffffff);
  const flat = (color) => new THREE.MeshLambertMaterial({ color: color || 0xffffff, flatShading: true });

  // Bäume: Nadelbäume (zwei Kegel) und Laubbäume (Kugel-Krone)
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 1, 7);
  const coneGeo = new THREE.ConeGeometry(1, 1, 8);
  const blobGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkGeo, texMat('bark', 0xffffff), W.trees);
  const cones = new THREE.InstancedMesh(coneGeo, flat(), W.trees * 2);
  const blobs = new THREE.InstancedMesh(blobGeo, flat(), W.trees);
  let tc = 0, cc = 0, bc = 0;
  for (let t = 0; t < W.trees * 6 && tc < W.trees; t++) {
    const x = (rnd() * 2 - 1) * HALF * 0.9, z = (rnd() * 2 - 1) * HALF * 0.9;
    if (!okSpot(x, z, 1.2)) continue;
    const g = getHeight(x, z);
    const pine = rnd() < 0.55;
    const th = pine ? 2.5 + rnd() * 1.5 : 2.8 + rnd() * 1.8;
    p.set(x, g + th / 2 - 0.2, z); s.set(1, th, 1); q.identity();
    m.compose(p, q, s); trunks.setMatrixAt(tc, m);
    let topY;
    if (pine) {
      const r = 1.9 + rnd() * 1.1, hh = 4 + rnd() * 2.5;
      col.setHSL(0.33 + rnd() * 0.05, 0.45 + rnd() * 0.15, 0.24 + rnd() * 0.08);
      p.set(x, g + th + hh / 2 - 0.8, z); s.set(r, hh, r); m.compose(p, q, s); cones.setMatrixAt(cc, m); cones.setColorAt(cc++, col);
      p.set(x, g + th + hh - 0.6, z); s.set(r * 0.7, hh * 0.75, r * 0.7); m.compose(p, q, s); cones.setMatrixAt(cc, m); cones.setColorAt(cc++, col);
      topY = g + th + hh * 1.3;
    } else {
      const r = 2 + rnd() * 1.3;
      col.setHSL(0.22 + rnd() * 0.1, 0.5 + rnd() * 0.2, 0.33 + rnd() * 0.1);
      e.set(rnd(), rnd() * 3, rnd()); q.setFromEuler(e);
      p.set(x, g + th + r * 0.6, z); s.set(r, r * 0.85, r); m.compose(p, q, s); blobs.setMatrixAt(bc, m); blobs.setColorAt(bc++, col);
      q.identity();
      topY = g + th + r * 1.4;
    }
    const c = addCollider([x - 0.3, g - 0.5, z - 0.3, x + 0.3, topY, z + 0.3], false);
    c.material = 'tree';
    tc++;
  }
  trunks.count = tc; cones.count = cc; blobs.count = bc;

  // Steine
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, flat(), W.rocks);
  let rc = 0;
  for (let t = 0; t < W.rocks * 6 && rc < W.rocks; t++) {
    const x = (rnd() * 2 - 1) * HALF * 0.9, z = (rnd() * 2 - 1) * HALF * 0.9;
    if (!okSpot(x, z, 0.3, 0.7)) continue;
    const g = getHeight(x, z), sc = 0.8 + rnd() * 1.8;
    e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e);
    p.set(x, g + sc * 0.35, z); s.set(sc, sc * 0.8, sc);
    m.compose(p, q, s); rocks.setMatrixAt(rc, m);
    const v = 0.45 + rnd() * 0.15; col.setRGB(v, v * 0.98, v * 0.93); rocks.setColorAt(rc, col);
    const r = sc * 0.8;
    const c = addCollider([x - r, g - 1, z - r, x + r, g + sc * 0.35 + sc * 0.7, z + r], false);
    c.material = 'rock';
    if (rnd() < 0.18) lootSpawns.chests.push({ x: x + r + 1.2, y: getHeight(x + r + 1.2, z), z, yaw: -Math.PI / 2, outdoor: true });
    rc++;
  }
  rocks.count = rc;
  q.identity();

  // Büsche (ohne Kollision), Gras und Blumen
  const bushes = new THREE.InstancedMesh(blobGeo, flat(), W.bushes);
  let bu = 0;
  for (let t = 0; t < W.bushes * 5 && bu < W.bushes; t++) {
    const x = (rnd() * 2 - 1) * HALF * 0.9, z = (rnd() * 2 - 1) * HALF * 0.9;
    if (!okSpot(x, z, 1)) continue;
    const g = getHeight(x, z), sc = 0.6 + rnd() * 0.7;
    p.set(x, g + sc * 0.35, z); s.set(sc * 1.2, sc * 0.8, sc * 1.2); e.set(0, rnd() * 3, 0); q.setFromEuler(e);
    m.compose(p, q, s); bushes.setMatrixAt(bu, m);
    col.setHSL(0.27 + rnd() * 0.08, 0.5, 0.28 + rnd() * 0.08); bushes.setColorAt(bu++, col);
  }
  bushes.count = bu;
  q.identity();
  const grassGeo = new THREE.ConeGeometry(0.09, 0.6, 3);
  grassGeo.translate(0, 0.3, 0);
  const grassMesh = new THREE.InstancedMesh(grassGeo, white, W.grass);
  const flowerMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), white, Math.floor(W.grass / 6));
  let gc = 0, fc = 0;
  const flowerColors = [0xffe14d, 0xff6f91, 0xffffff, 0xb28dff];
  for (let t = 0; t < W.grass * 3 && gc < W.grass; t++) {
    const x = (rnd() * 2 - 1) * HALF * 0.85, z = (rnd() * 2 - 1) * HALF * 0.85;
    if (!okSpot(x, z, 1.1, 0.85)) continue;
    const g = getHeight(x, z);
    for (let k = 0; k < 3 && gc < W.grass; k++) {
      const gx = x + rnd() * 0.6 - 0.3, gz = z + rnd() * 0.6 - 0.3;
      e.set(rnd() * 0.4 - 0.2, rnd() * 3, rnd() * 0.4 - 0.2); q.setFromEuler(e);
      const hs = 0.6 + rnd() * 0.8;
      p.set(gx, getHeight(gx, gz) - 0.05, gz); s.set(1, hs, 1);
      m.compose(p, q, s); grassMesh.setMatrixAt(gc, m);
      col.setHSL(0.25 + rnd() * 0.08, 0.55, 0.32 + rnd() * 0.12); grassMesh.setColorAt(gc++, col);
    }
    if (rnd() < 0.3 && fc < flowerMesh.count) {
      q.identity(); p.set(x, g + 0.35, z); s.set(1, 1, 1);
      m.compose(p, q, s); flowerMesh.setMatrixAt(fc, m);
      col.setHex(flowerColors[Math.floor(rnd() * flowerColors.length)]); flowerMesh.setColorAt(fc++, col);
    }
  }
  grassMesh.count = gc; flowerMesh.count = fc;
  grassMesh.userData.grass = true; flowerMesh.userData.grass = true;

  for (const im of [trunks, cones, blobs, rocks, bushes, grassMesh, flowerMesh]) {
    im.castShadow = !im.userData.grass; im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    scene.add(im);
  }

  // Holzkisten als Deckung
  let crates = 0;
  for (let t = 0; t < W.crates * 8 && crates < W.crates; t++) {
    const x = (rnd() * 2 - 1) * HALF * 0.8, z = (rnd() * 2 - 1) * HALF * 0.8;
    if (!okSpot(x, z, 0.8)) continue;
    const g = getHeight(x, z);
    const c = addStaticBox(x - 0.75, g - 0.4, z - 0.75, x + 0.75, g + 1.5, z + 0.75, texMat('wood', 0xc79a6a), false);
    c.material = 'crate';
    crates++;
  }

  // Bodenloot draußen
  for (let t = 0; t < CONFIG.loot.floorOutdoor * 8 && lootSpawns.floor.length < houses.length * (CONFIG.loot.floorPerHouse + 1) + CONFIG.loot.floorOutdoor; t++) {
    const x = (rnd() * 2 - 1) * HALF * 0.82, z = (rnd() * 2 - 1) * HALF * 0.82;
    if (!okSpot(x, z, 0.8, 0.8)) continue;
    qMin[0] = x - 1; qMin[1] = getHeight(x, z) - 1; qMin[2] = z - 1; qMax[0] = x + 1; qMax[1] = qMin[1] + 4; qMax[2] = z + 1;
    if (grid.query(qMin, qMax, qList).length) continue;
    lootSpawns.floor.push({ x, y: getHeight(x, z), z });
  }
}

function buildClouds(rnd) {
  cloudGroup = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8899aa, flatShading: true, fog: false });
  const perCloud = 6;
  const im = new THREE.InstancedMesh(geo, mat, W.clouds * perCloud);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let i = 0;
  for (let c = 0; c < W.clouds; c++) {
    const ang = rnd() * Math.PI * 2, dist = 120 + rnd() * 520;
    const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist, cy = 270 + rnd() * 60;
    const size = 10 + rnd() * 14;
    for (let k = 0; k < perCloud; k++) {
      p.set(cx + (rnd() - 0.5) * size * 2.2, cy + (rnd() - 0.3) * size * 0.4, cz + (rnd() - 0.5) * size);
      const r = size * (0.5 + rnd() * 0.6);
      s.set(r, r * 0.55, r * 0.8);
      m.compose(p, q, s); im.setMatrixAt(i++, m);
    }
  }
  im.instanceMatrix.needsUpdate = true;
  im.frustumCulled = false;
  cloudGroup.add(im);
  scene.add(cloudGroup);
}

function buildWorld() {
  generateHeights();
  const rnd = mulberry32(W.seed ^ 0x5bd1e995);
  planHouses(rnd);
  buildTerrainMesh();
  for (const h of houses) buildHouse(h);
  populateNature(rnd);
  buildClouds(rnd);
  spawnBarrels(rnd);
  // Truhen draußen auffüllen, falls die Steine zu wenige geliefert haben
  for (let t = 0; t < 400 && lootSpawns.chests.filter((c) => c.outdoor).length < CONFIG.loot.chestsOutdoor; t++) {
    const x = (rnd() * 2 - 1) * HALF * 0.75, z = (rnd() * 2 - 1) * HALF * 0.75;
    const h = getHeight(x, z);
    if (h < W.waterLevel + 1 || getNormal(x, z).y < 0.85 || insideHouse(x, z, 3)) continue;
    qMin[0] = x - 1.5; qMin[1] = h - 1; qMin[2] = z - 1.5; qMax[0] = x + 1.5; qMax[1] = h + 3; qMax[2] = z + 1.5;
    if (grid.query(qMin, qMax, qList).length) continue;
    lootSpawns.chests.push({ x, y: h, z, yaw: rnd() * Math.PI * 2, outdoor: true });
  }
}
