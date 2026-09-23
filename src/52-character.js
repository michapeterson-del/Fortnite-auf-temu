// ---------------------------------------------------------------------
// Figuren-Modell mit Gelenk-Hierarchie und Animation
//   Hüfte → Wirbelsäule → Nacken/Kopf
//   Schulter → Oberarm → Ellbogen → Unterarm → Hand
//   Hüfte → Oberschenkel → Knie → Unterschenkel/Fuß
// Jedes Körpersegment ist EINE Geometrie mit Vertexfarben; alle Figuren
// teilen sich ein PBR-Material (Umgebungslicht aus der Himmels-Env-Map).
// ---------------------------------------------------------------------
const charMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02, envMapIntensity: 0.7 });
const HAIR_STYLES = ['kurz', 'stachel', 'lang', 'zopf', 'muetze'];
const EYE_COLORS = [0x3b2a1a, 0x2f6fd6, 0x3f8f3a, 0x5a4632];

const SHAPE = {
  box: new THREE.BoxGeometry(1, 1, 1, 1, 1, 1).toNonIndexed(),
  sph: new THREE.SphereGeometry(0.5, 16, 12).toNonIndexed(),
  sphS: new THREE.SphereGeometry(0.5, 8, 6).toNonIndexed(),
  ico: new THREE.IcosahedronGeometry(0.5, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14).toNonIndexed(),
  cone: new THREE.ConeGeometry(0.5, 1, 10).toNonIndexed(),
};
const capCache = new Map();
function capsuleShape(r, len) {
  const k = r.toFixed(3) + '|' + len.toFixed(3);
  let g = capCache.get(k);
  if (!g) { g = (r < 0.03 ? new THREE.CapsuleGeometry(r, len, 2, 6) : new THREE.CapsuleGeometry(r, len, 4, 10)).toNonIndexed(); capCache.set(k, g); }
  return g;
}

const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _ce = new THREE.Euler(), _cs = new THREE.Vector3(), _cp = new THREE.Vector3(), _cc = new THREE.Color();
// Teile: { s: 'box'|'sph'|'cyl'|'cone'|'cap', x,y,z, sx,sy,sz, rx,ry,rz, c, r, len }
function mergeParts(list) {
  const pos = [], nor = [], col = [];
  for (const p of list) {
    // kleine Kugeln (Augen, Lippen, …) automatisch gröber auflösen
    const small = p.s === 'sph' && Math.max(p.sx || 1, p.sy || 1, p.sz || 1) < 0.09;
    const src = p.s === 'cap' ? capsuleShape(p.r, p.len) : SHAPE[small ? 'sphS' : p.s];
    _ce.set(p.rx || 0, p.ry || 0, p.rz || 0);
    _cq.setFromEuler(_ce);
    _cm.compose(_cp.set(p.x || 0, p.y || 0, p.z || 0), _cq, _cs.set(p.sx || 1, p.sy || 1, p.sz || 1));
    const g = src.clone();
    g.applyMatrix4(_cm);
    _cc.setHex(p.c);
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i += 3) {
      pos.push(pa[i], pa[i + 1], pa[i + 2]); nor.push(na[i], na[i + 1], na[i + 2]); col.push(_cc.r, _cc.g, _cc.b);
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

function shade(hex, f) { _cc.setHex(hex); _cc.multiplyScalar(f); return _cc.getHex(); }

function randomOutfit() {
  return {
    skin: pick(SKIN_TONES), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIRS), pack: pick(PANTS),
    accent: pick(SHIRTS), hairStyle: pick(HAIR_STYLES), eyes: pick(EYE_COLORS), gloves: Math.random() < 0.4, longSleeve: Math.random() < 0.5,
  };
}

// Vollständiges Outfit (fehlende Felder aus den Farben ableiten)
function fullOutfit(o) {
  const h = (o.shirt ^ (o.pants * 7) ^ (o.hair * 13)) >>> 0;
  return {
    skin: o.skin, shirt: o.shirt, pants: o.pants, hair: o.hair, pack: o.pack,
    accent: o.accent !== undefined ? o.accent : shade(o.shirt, 0.6),
    hairStyle: o.hairStyle || HAIR_STYLES[h % HAIR_STYLES.length],
    eyes: o.eyes !== undefined ? o.eyes : EYE_COLORS[(h >> 3) % EYE_COLORS.length],
    gloves: o.gloves !== undefined ? o.gloves : ((h >> 5) & 1) === 1,
    longSleeve: o.longSleeve !== undefined ? o.longSleeve : ((h >> 6) & 1) === 1,
  };
}

const charGeoCache = new Map();
function characterGeometries(o) {
  const key = [o.skin, o.shirt, o.pants, o.hair, o.pack, o.accent, o.hairStyle, o.eyes, o.gloves, o.longSleeve].join('|');
  let set = charGeoCache.get(key);
  if (set) return set;
  const skin = o.skin, skinD = shade(o.skin, 0.9), shirt = o.shirt, shirtD = shade(o.shirt, 0.78), pants = o.pants, pantsD = shade(o.pants, 0.8);
  const shoe = 0x23262e, sole = 0xe8e6e0, packD = shade(o.pack, 0.75), hair = o.hair, glove = o.gloves ? 0x2b2f3a : skin;
  // Becken
  const pelvis = [
    { s: 'sph', y: -0.02, sx: 0.36, sy: 0.22, sz: 0.25, c: pants },
    { s: 'cyl', y: 0.07, sx: 0.37, sy: 0.06, sz: 0.26, c: 0x1c1f26 },
    { s: 'box', y: 0.07, z: -0.128, sx: 0.07, sy: 0.05, sz: 0.02, c: 0xd9b54a },
  ];
  // Oberkörper (Wirbelsäulen-Raum)
  const chest = [
    { s: 'sph', y: 0.08, sx: 0.36, sy: 0.3, sz: 0.24, c: shirt },
    { s: 'sph', y: 0.28, sx: 0.44, sy: 0.5, sz: 0.27, c: shirt },
    { s: 'sph', y: 0.45, sx: 0.52, sy: 0.18, sz: 0.26, c: shirt },
    { s: 'box', y: 0.25, z: -0.132, sx: 0.014, sy: 0.4, sz: 0.012, c: o.accent },
    { s: 'cyl', x: 0.1, y: 0.36, z: -0.128, rx: Math.PI / 2, sx: 0.08, sy: 0.012, sz: 0.08, c: o.accent },
    { s: 'cyl', y: 0.55, sx: 0.2, sy: 0.06, sz: 0.17, c: shirtD },
    { s: 'cyl', y: 0.6, sx: 0.1, sy: 0.14, sz: 0.1, c: skinD },
    // Kapuze im Nacken, Brusttaschen, Saum
    { s: 'sph', y: 0.53, z: 0.1, sx: 0.32, sy: 0.14, sz: 0.2, c: shirtD },
    { s: 'box', x: -0.1, y: 0.12, z: -0.118, sx: 0.12, sy: 0.08, sz: 0.02, c: shirtD },
    { s: 'box', x: 0.1, y: 0.12, z: -0.118, sx: 0.12, sy: 0.08, sz: 0.02, c: shirtD },
    { s: 'cyl', y: -0.04, sx: 0.37, sy: 0.04, sz: 0.25, c: shirtD },
    // Rucksack mit Tasche und Gurten
    { s: 'box', y: 0.3, z: 0.2, sx: 0.34, sy: 0.4, sz: 0.14, c: o.pack },
    { s: 'sph', y: 0.49, z: 0.2, sx: 0.34, sy: 0.08, sz: 0.14, c: o.pack },
    { s: 'box', y: 0.2, z: 0.285, sx: 0.26, sy: 0.14, sz: 0.04, c: packD },
    { s: 'box', x: -0.11, y: 0.32, z: -0.128, sx: 0.035, sy: 0.38, sz: 0.015, c: packD },
    { s: 'box', x: 0.11, y: 0.32, z: -0.128, sx: 0.035, sy: 0.38, sz: 0.015, c: packD },
  ];
  // Kopf (Nacken-Raum)
  const head = [
    { s: 'sph', y: 0.15, sx: 0.24, sy: 0.27, sz: 0.25, c: skin },
    { s: 'sph', y: 0.07, z: -0.02, sx: 0.2, sy: 0.13, sz: 0.2, c: skin },
    { s: 'sph', x: -0.122, y: 0.15, sx: 0.05, sy: 0.07, sz: 0.04, c: skinD },
    { s: 'sph', x: 0.122, y: 0.15, sx: 0.05, sy: 0.07, sz: 0.04, c: skinD },
    { s: 'sph', x: -0.05, y: 0.17, z: -0.106, sx: 0.052, sy: 0.042, sz: 0.024, c: 0xffffff },
    { s: 'sph', x: 0.05, y: 0.17, z: -0.106, sx: 0.052, sy: 0.042, sz: 0.024, c: 0xffffff },
    { s: 'sph', x: -0.05, y: 0.169, z: -0.117, sx: 0.026, sy: 0.03, sz: 0.012, c: o.eyes },
    { s: 'sph', x: 0.05, y: 0.169, z: -0.117, sx: 0.026, sy: 0.03, sz: 0.012, c: o.eyes },
    { s: 'box', x: -0.05, y: 0.205, z: -0.113, rz: 0.12, sx: 0.056, sy: 0.013, sz: 0.012, c: shade(hair, 0.8) },
    { s: 'box', x: 0.05, y: 0.205, z: -0.113, rz: -0.12, sx: 0.056, sy: 0.013, sz: 0.012, c: shade(hair, 0.8) },
    { s: 'sph', x: -0.05, y: 0.169, z: -0.124, sx: 0.013, sy: 0.015, sz: 0.006, c: 0x0c0c10 },
    { s: 'sph', x: 0.05, y: 0.169, z: -0.124, sx: 0.013, sy: 0.015, sz: 0.006, c: 0x0c0c10 },
    { s: 'sph', x: -0.043, y: 0.177, z: -0.127, sx: 0.008, sy: 0.008, sz: 0.004, c: 0xffffff },
    { s: 'sph', x: 0.057, y: 0.177, z: -0.127, sx: 0.008, sy: 0.008, sz: 0.004, c: 0xffffff },
    { s: 'sph', x: -0.05, y: 0.186, z: -0.103, sx: 0.06, sy: 0.022, sz: 0.03, c: skinD },
    { s: 'sph', x: 0.05, y: 0.186, z: -0.103, sx: 0.06, sy: 0.022, sz: 0.03, c: skinD },
    { s: 'box', y: 0.15, z: -0.118, sx: 0.022, sy: 0.05, sz: 0.02, c: skin },
    { s: 'sph', y: 0.128, z: -0.125, sx: 0.038, sy: 0.034, sz: 0.036, c: skinD },
    { s: 'sph', x: -0.078, y: 0.115, z: -0.088, sx: 0.045, sy: 0.03, sz: 0.02, c: shade(0xe0806a, 1.0) },
    { s: 'sph', x: 0.078, y: 0.115, z: -0.088, sx: 0.045, sy: 0.03, sz: 0.02, c: shade(0xe0806a, 1.0) },
    { s: 'sph', y: 0.089, z: -0.112, sx: 0.055, sy: 0.014, sz: 0.018, c: 0xb4605a },
    { s: 'sph', y: 0.078, z: -0.11, sx: 0.05, sy: 0.016, sz: 0.018, c: 0xc4706a },
    { s: 'sph', y: 0.04, z: -0.075, sx: 0.07, sy: 0.04, sz: 0.05, c: skin },
  ];
  const cap = { s: 'sph', y: 0.235, z: 0.01, sx: 0.262, sy: 0.2, sz: 0.272, c: hair };
  const back = { s: 'sph', y: 0.16, z: 0.05, sx: 0.25, sy: 0.22, sz: 0.2, c: hair };
  if (o.hairStyle !== 'muetze') {
    head.push({ s: 'sph', y: 0.245, z: -0.085, rx: 0.4, sx: 0.23, sy: 0.08, sz: 0.1, c: hair });
    head.push({ s: 'box', x: -0.117, y: 0.16, z: -0.03, sx: 0.02, sy: 0.07, sz: 0.04, c: hair }, { s: 'box', x: 0.117, y: 0.16, z: -0.03, sx: 0.02, sy: 0.07, sz: 0.04, c: hair });
  }
  if (o.hairStyle === 'muetze') {
    head.push({ s: 'sph', y: 0.245, sx: 0.27, sy: 0.22, sz: 0.28, c: o.accent }, { s: 'cyl', y: 0.2, sx: 0.272, sy: 0.05, sz: 0.282, c: shade(o.accent, 0.75) }, { s: 'sph', y: 0.37, sx: 0.07, sy: 0.07, sz: 0.07, c: 0xffffff });
  } else {
    head.push(cap, back);
    if (o.hairStyle === 'stachel') {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        head.push({ s: 'cone', x: Math.cos(a) * 0.07, y: 0.31, z: Math.sin(a) * 0.07 + 0.01, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5, sx: 0.07, sy: 0.12, sz: 0.07, c: hair });
      }
    } else if (o.hairStyle === 'lang') {
      head.push({ s: 'box', y: 0.04, z: 0.08, sx: 0.24, sy: 0.3, sz: 0.09, c: hair }, { s: 'box', x: -0.11, y: 0.1, z: 0.0, sx: 0.04, sy: 0.18, sz: 0.14, c: hair }, { s: 'box', x: 0.11, y: 0.1, z: 0.0, sx: 0.04, sy: 0.18, sz: 0.14, c: hair });
    } else if (o.hairStyle === 'zopf') {
      head.push({ s: 'sph', y: 0.13, z: 0.17, rx: 0.5, sx: 0.09, sy: 0.18, sz: 0.09, c: hair }, { s: 'cyl', y: 0.2, z: 0.14, rx: 0.5, sx: 0.05, sy: 0.03, sz: 0.05, c: o.accent });
    }
  }
  // Oberarm (Schulter-Raum, hängt nach -y)
  const upperArm = [
    { s: 'sph', y: -0.01, sx: 0.15, sy: 0.15, sz: 0.15, c: shirt },
    { s: 'cap', r: 0.064, len: 0.16, y: -0.13, c: shirt },
  ];
  // Unterarm + Hand (Ellbogen-Raum)
  const foreArm = [
    { s: 'cap', r: 0.053, len: 0.14, y: -0.11, c: o.longSleeve ? shirt : skin },
    { s: 'cyl', y: -0.2, sx: 0.115, sy: 0.035, sz: 0.115, c: o.longSleeve ? o.accent : shirtD },
    { s: 'sph', y: -0.27, sx: 0.095, sy: 0.1, sz: 0.06, c: glove },
    // vier Finger (leicht gekrümmt) und Daumen
    { s: 'cap', r: 0.013, len: 0.045, x: -0.03, y: -0.335, z: -0.006, rx: 0.35, c: glove },
    { s: 'cap', r: 0.014, len: 0.052, x: -0.01, y: -0.34, z: -0.006, rx: 0.35, c: glove },
    { s: 'cap', r: 0.014, len: 0.05, x: 0.01, y: -0.338, z: -0.006, rx: 0.35, c: glove },
    { s: 'cap', r: 0.012, len: 0.04, x: 0.03, y: -0.33, z: -0.006, rx: 0.35, c: glove },
    { s: 'cap', r: 0.015, len: 0.04, y: -0.27, z: -0.045, rx: 0.9, c: glove },
    { s: 'box', y: -0.225, sx: 0.1, sy: 0.02, sz: 0.07, c: o.gloves ? 0x3a3f4a : skinD },
  ];
  // Oberschenkel (Hüftgelenk-Raum)
  const thigh = [
    { s: 'cap', r: 0.088, len: 0.24, y: -0.2, c: pants },
    { s: 'box', x: 0, y: -0.2, z: 0.0, sx: 0.182, sy: 0.12, sz: 0.1, c: pantsD },
  ];
  // Unterschenkel + Schuh (Knie-Raum)
  const shin = [
    { s: 'sph', y: 0.0, sx: 0.15, sy: 0.14, sz: 0.15, c: pantsD },
    { s: 'sph', y: -0.03, z: -0.06, sx: 0.12, sy: 0.12, sz: 0.06, c: shade(o.accent, 0.55) },
    { s: 'cap', r: 0.072, len: 0.22, y: -0.18, c: pants },
    { s: 'cyl', y: -0.33, sx: 0.15, sy: 0.05, sz: 0.15, c: pantsD },
  ];
  // Fuß/Schuh (Sprunggelenk-Raum)
  const foot = [
    { s: 'sph', y: -0.035, z: -0.055, sx: 0.13, sy: 0.1, sz: 0.27, c: shoe },
    { s: 'sph', y: -0.01, z: 0.03, sx: 0.12, sy: 0.12, sz: 0.12, c: shoe },
    { s: 'box', y: -0.082, z: -0.055, sx: 0.126, sy: 0.03, sz: 0.265, c: sole },
    { s: 'box', y: 0.0, z: -0.1, rx: -0.25, sx: 0.07, sy: 0.015, sz: 0.1, c: 0xffffff },
    { s: 'box', y: 0.006, z: -0.075, rx: -0.25, sx: 0.07, sy: 0.012, sz: 0.012, c: 0xffffff },
    { s: 'box', y: 0.012, z: -0.125, rx: -0.25, sx: 0.07, sy: 0.012, sz: 0.012, c: 0xffffff },
    { s: 'box', y: -0.04, z: -0.19, sx: 0.12, sy: 0.05, sz: 0.02, c: o.accent },
  ];
  set = { pelvis: mergeParts(pelvis), chest: mergeParts(chest), head: mergeParts(head), upperArm: mergeParts(upperArm), foreArm: mergeParts(foreArm), thigh: mergeParts(thigh), shin: mergeParts(shin), foot: mergeParts(foot) };
  charGeoCache.set(key, set);
  return set;
}

function createCharacterMesh(outfitIn) {
  const o = fullOutfit(outfitIn);
  const G = characterGeometries(o);
  const g = new THREE.Group();
  const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  const mesh = (parent, geo) => { const m = new THREE.Mesh(geo, charMat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const pelvis = joint(g, 0, 0.92, 0); mesh(pelvis, G.pelvis);
  const spine = joint(pelvis, 0, 0.08, 0); mesh(spine, G.chest);
  const neck = joint(spine, 0, 0.54, 0); mesh(neck, G.head).scale.setScalar(1.14);
  const shL = joint(spine, -0.24, 0.47, 0); mesh(shL, G.upperArm);
  const shR = joint(spine, 0.24, 0.47, 0); mesh(shR, G.upperArm);
  const elL = joint(shL, 0, -0.28, 0); mesh(elL, G.foreArm);
  const elR = joint(shR, 0, -0.28, 0); mesh(elR, G.foreArm);
  const hand = joint(elR, 0, -0.3, 0);
  const hipL = joint(pelvis, -0.1, -0.04, 0); mesh(hipL, G.thigh);
  const hipR = joint(pelvis, 0.1, -0.04, 0); mesh(hipR, G.thigh);
  const knL = joint(hipL, 0, -0.42, 0); mesh(knL, G.shin);
  const knR = joint(hipR, 0, -0.42, 0); mesh(knR, G.shin);
  const anL = joint(knL, 0, -0.36, 0); mesh(anL, G.foot);
  const anR = joint(knR, 0, -0.36, 0); mesh(anR, G.foot);
  // Gleiter
  const glider = new THREE.Group();
  const canopy = new THREE.Mesh(gliderGeo, new THREE.MeshStandardMaterial({ color: o.shirt, side: THREE.DoubleSide, roughness: 0.5 }));
  canopy.scale.set(1.25, 0.55, 0.85); canopy.position.y = 2.3; canopy.castShadow = true;
  glider.add(canopy);
  const lineMat = lambert(0x1c1f26);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(lineGeo, lineMat);
    l.position.set(sx * 0.3, 1.9, 0);
    l.scale.set(1, 1.2, 1);
    l.rotation.z = -sx * 0.85; l.rotation.x = sz * 0.45;
    glider.add(l);
  }
  glider.visible = false;
  g.add(glider);
  return { group: g, pelvis, spine, neck, shL, shR, elL, elR, hand, hipL, hipR, knL, knR, anL, anR, glider, held: null, heldKey: '', cur: {}, tgt: {} };
}

// ---------------------------------------------------------------------
// Animation: Zielpose pro Zustand, Gelenke blenden weich (~0,15 s)
// ---------------------------------------------------------------------
const POSE_KEYS = ['pelvisY', 'pelvisX', 'spineX', 'spineY', 'neckX', 'neckY', 'shLX', 'shLZ', 'elL', 'shRX', 'shRZ', 'elR', 'hipLX', 'hipRX', 'knL', 'knR', 'anL', 'anR'];

function computePose(T, P) {
  const W0 = CONFIG.player.walkSpeed;
  T.pelvisY = 0.92; T.pelvisX = 0; T.spineX = 0; T.spineY = 0; T.neckX = 0; T.neckY = 0;
  T.shLX = 0.05; T.shLZ = -0.12; T.elL = 0.18; T.shRX = 0.05; T.shRZ = 0.12; T.elR = 0.18;
  T.hipLX = 0; T.hipRX = 0; T.knL = 0; T.knR = 0; T.anL = 0; T.anR = 0;
  const t = P.time;
  if (P.state === 'dead') {
    const k = Math.min(1, P.deadT / 0.6);
    T.pelvisX = 1.45 * k; T.pelvisY = 0.92 - 0.72 * k; T.shLZ = -1.2 * k; T.shRZ = 1.2 * k; T.shLX = 0.3; T.shRX = 0.3;
    T.hipLX = 0.3 * k; T.hipRX = 0.1 * k; T.knL = -0.4 * k; T.neckX = -0.3 * k;
    return;
  }
  if (P.state === 'freefall') {
    T.pelvisX = -1.35; T.pelvisY = 1.05; T.neckX = 1.05;
    T.shLX = 0.25; T.shLZ = -1.35 + Math.sin(t * 7) * 0.05; T.shRX = 0.25; T.shRZ = 1.35 - Math.sin(t * 7) * 0.05; T.elL = 0.5; T.elR = 0.5;
    T.hipLX = 0.15; T.hipRX = 0.05; T.knL = -0.6; T.knR = -0.4; T.anL = 0.6; T.anR = 0.6;
    return;
  }
  if (P.state === 'glide') {
    T.shLX = 2.85; T.shLZ = -0.35; T.shRX = 2.85; T.shRZ = 0.35; T.elL = 0.25; T.elR = 0.25;
    T.hipLX = 0.2 + Math.sin(t * 2) * 0.1; T.hipRX = 0.05 - Math.sin(t * 2) * 0.1; T.knL = -0.4; T.knR = -0.25;
    return;
  }
  // Beine: Stehen / Laufen / Springen / Ducken
  const A = clamp(P.speed / W0, 0, 1.5), A1 = Math.min(1, A), ph = P.phase;
  if (P.air) {
    T.hipLX = 0.7; T.knL = -1.1; T.hipRX = 0.25; T.knR = -0.55;
    T.shLX = 0.5; T.shLZ = -0.5; T.shRX = 0.5; T.shRZ = 0.5; T.elL = 0.6; T.elR = 0.6;
  } else if (A > 0.06) {
    const amp = (P.crouch ? 0.35 : 0.55) * A;
    T.hipLX = Math.sin(ph) * amp; T.hipRX = -Math.sin(ph) * amp;
    T.knL = -(0.08 + 1.15 * A1 * Math.max(0, Math.cos(ph)));
    T.knR = -(0.08 + 1.15 * A1 * Math.max(0, -Math.cos(ph)));
    T.shLX = -Math.sin(ph) * 0.55 * A; T.shRX = Math.sin(ph) * 0.55 * A;
    T.elL = T.elR = 0.3 + 0.55 * A1;
    T.pelvisY += Math.abs(Math.cos(ph)) * 0.035 * A1 - 0.02 * A1;
    T.spineX = -0.1 * A; T.spineY = Math.sin(ph) * 0.12 * A; T.neckY = -T.spineY;
  } else {
    const b = Math.sin(t * 2.1);
    T.spineX = b * 0.012; T.neckX = -b * 0.01; T.shLZ -= b * 0.02; T.shRZ += b * 0.02;
    T.hipLX = 0.02; T.hipRX = -0.02;
  }
  if (P.crouch && !P.air) {
    T.pelvisY -= 0.44; T.hipLX += 1.3; T.hipRX += 1.3; T.knL -= 2.0; T.knR -= 2.0; T.spineX -= 0.3; T.neckX += 0.25;
  }
  // Sprunggelenke: Fuß flach zum Boden (Becken-Neigung mit eingerechnet)
  const flat = P.air ? 0.45 : 1;
  T.anL = -(T.hipLX + T.knL + T.pelvisX) * flat + (P.air ? 0.35 : 0);
  T.anR = -(T.hipRX + T.knR + T.pelvisX) * flat + (P.air ? 0.35 : 0);
  // Oberkörper je nach Aktion
  const pitch = P.pitch || 0;
  if (P.action === 'aim') {
    const rec = P.recoil || 0;
    T.spineX += pitch * 0.35; T.neckX += pitch * 0.35; T.spineY = -0.18; T.neckY = 0.15;
    T.shRX = 1.45 + pitch * 0.6 + rec * 0.2; T.shRZ = -0.08; T.elR = 0.12 + rec * 0.1;
    T.shLX = 1.35 + pitch * 0.6 + rec * 0.2; T.shLZ = 0.55; T.elL = 0.65;
  } else if (P.action === 'heal') {
    T.shRX = 1.9 + Math.sin(t * 10) * 0.08; T.shRZ = -0.1; T.elR = 1.7; T.shLX = 0.7; T.elL = 1.1; T.neckX = -0.15;
  } else if (P.action === 'swing') {
    const s = Math.sin(P.swingT * Math.PI);
    T.shRX = 0.4 + 2.4 * s; T.elR = 0.3 + 0.5 * (1 - s); T.spineY = -0.3 * s; T.spineX -= 0.15 * s;
  } else if (P.action === 'pickaxe' && !(A > 0.06)) {
    T.shRX = 0.45; T.elR = 0.5;
  }
}

// Pose weich anwenden (Überblendung zwischen Zuständen)
function applyPose(m, P, dt) {
  computePose(m.tgt, P);
  const k = P.instant ? 1 : 1 - Math.exp(-dt * 13);
  const C = m.cur, T = m.tgt;
  for (const key of POSE_KEYS) C[key] = C[key] === undefined ? T[key] : C[key] + (T[key] - C[key]) * k;
  m.pelvis.position.y = C.pelvisY; m.pelvis.rotation.x = C.pelvisX;
  m.spine.rotation.set(C.spineX, C.spineY, 0);
  m.neck.rotation.set(C.neckX, C.neckY, 0);
  m.shL.rotation.set(C.shLX, 0, C.shLZ); m.shR.rotation.set(C.shRX, 0, C.shRZ);
  m.elL.rotation.x = C.elL; m.elR.rotation.x = C.elR;
  m.hipL.rotation.x = C.hipLX; m.hipR.rotation.x = C.hipRX;
  m.knL.rotation.x = C.knL; m.knR.rotation.x = C.knR;
  m.anL.rotation.x = C.anL; m.anR.rotation.x = C.anR;
}

const _pose = { state: 'ground', speed: 0, phase: 0, air: false, crouch: false, action: 'pickaxe', pitch: 0, recoil: 0, swingT: 0, time: 0, deadT: 0, instant: false };
function animateCharacter(a, pos, dt) {
  const m = a.model, g = m.group;
  if (a.phase === 'bus') { g.visible = false; return; }
  const P = _pose;
  P.time = gameTime; P.instant = false;
  if (a.phase === 'dead') {
    const t = gameTime - a.deathTime;
    if (t > 5) { g.visible = false; return; }
    g.visible = true;
    g.position.copy(pos);
    g.rotation.set(0, a.deathDir, 0);
    m.glider.visible = false;
    P.state = 'dead'; P.deadT = t;
    applyPose(m, P, dt * 2);
    return;
  }
  g.visible = true;
  g.position.copy(pos);
  g.rotation.set(0, a.yaw, 0);
  g.scale.set(1, 1, 1);
  m.glider.visible = a.phase === 'glide';
  updateHeldModel(a);
  const it = currentItem(a);
  P.state = a.phase === 'freefall' ? 'freefall' : a.phase === 'glide' ? 'glide' : 'ground';
  P.speed = Math.hypot(a.vel.x, a.vel.z);
  P.phase = a.walkPhase * 0.75;
  P.air = a.phase === 'ground' && !a.onGround && Math.abs(a.vel.y) > 1.5;
  P.crouch = a.crouching;
  P.pitch = a.pitch;
  P.recoil = a.recoil;
  P.swingT = a.swing > 0 ? a.swing / CONFIG.pickaxe.swingTime : 0;
  if (a.healTimer > 0) P.action = 'heal';
  else if (it && it.kind === 'weapon') P.action = 'aim';
  else if (P.swingT > 0) P.action = 'swing';
  else P.action = 'pickaxe';
  applyPose(m, P, dt);
}

// Lobby: ruhige Stehpose
function animateLobbyCharacter(m, t, dt) {
  const P = _pose;
  P.state = 'ground'; P.speed = 0; P.air = false; P.crouch = false; P.action = 'pickaxe'; P.pitch = 0; P.recoil = 0; P.swingT = 0; P.time = t; P.instant = false;
  applyPose(m, P, dt);
  m.neck.rotation.y = Math.sin(t * 0.7) * 0.25;
}
