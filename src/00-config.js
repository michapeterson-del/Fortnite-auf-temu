/* =====================================================================
 * FORTNITE AUF TEMU
 * Three.js wird NUR zum Rendern benutzt. Kollision, Raycasts und
 * Physik sind komplett eigene Implementierungen (Abschnitt 1b).
 * Die Dateien in src/ werden von build.mjs der Reihe nach in EINE
 * Funktion zusammengefügt und teilen sich deshalb einen Gültigkeitsbereich.
 * ===================================================================== */

// ---------------------------------------------------------------------
// CONFIG – alle Spielwerte an einer Stelle
// ---------------------------------------------------------------------
const CONFIG = {
  tickRate: 60,
  maxTicksPerFrame: 8,
  maxFrameTime: 0.25,
  render: {
    fov: 72, adsFov: 52, scopeFov: 20, near: 0.1, far: 1100,
    fogDensity: 0.0017, exposure: 1.05,
    skyTop: 0x2f7fd8, skyHorizon: 0xbfe3ff, skyBottom: 0xdff1ff,
    shadowArea: 60, visibleActorDistance: 320, visibleItemDistance: 90,
    quality: {
      niedrig: { pixelRatio: 0.75, shadows: false, shadowMap: 1024, grass: 0, post: false },
      mittel:  { pixelRatio: 1.0,  shadows: true,  shadowMap: 1024, grass: 1, post: true },
      hoch:    { pixelRatio: 1.5,  shadows: true,  shadowMap: 2048, grass: 1, post: true },
    },
    defaultQuality: 'mittel',
  },
  world: {
    size: 640, cellSize: 2, maxHeight: 36, waterLevel: 0, seed: 20240917,
    islandFalloffStart: 0.70, islandFalloffEnd: 0.96, seaFloor: -8,
    lake: { x: 120, z: -80, radius: 55, depth: -4, name: 'Nebelsee' },
    houses: 16, houseMinDist: 34, houseSpread: 0.66,
    trees: 420, rocks: 120, crates: 36, bushes: 420, grass: 3200, clouds: 28,
    boundsPadding: 2,
  },
  grid: { cellSize: 8 },
  player: {
    radius: 0.4, height: 1.8, crouchHeight: 1.2, eyeFromTop: 0.15, headRadius: 0.25,
    walkSpeed: 5.5, sprintSpeed: 8.2, crouchSpeed: 2.8, adsSpeedFactor: 0.6, healSpeedFactor: 0.5,
    waterSpeedFactor: 0.55, waterDepth: 0.4,
    groundAccel: 55, airAccel: 9, jumpSpeed: 7.4, gravity: 22, maxFallSpeed: 60,
    stepHeight: 0.45, snapDistance: 0.35, maxSubstep: 0.2, groundNormalY: 0.7,
    surfaceClimb: 0.8, collisionPasses: 2,
    maxHp: 100, maxShield: 100,
    fallSafeSpeed: 17, fallDamagePerMs: 6.5,
    interactRange: 2.6, autoPickupRange: 1.6,
  },
  camera: {
    distance: 3.4, shoulder: 0.7, height: 0.45, adsDistance: 1.8, adsShoulder: 0.55,
    airDistance: 6.5, busDistance: 34, minDistance: 0.5, padding: 0.2,
    pitchMin: -1.45, pitchMax: 1.3,
  },
  input: { mouseSensitivity: 0.0022, touchSensitivity: 0.0055, joystickRadius: 60, joystickZone: 0.42, sprintThreshold: 0.92, deadZone: 0.12, adsSensitivity: 0.55 },
  build: {
    tile: 5, height: 4, thickness: 0.25, roofRise: 1.6,
    hp: { wall: 150, floor: 140, ramp: 140, roof: 140 },
    cost: 10, maxMaterials: 999, startMaterials: 0,
    groundTolerance: 0.5, collapseStepDelay: 0.05,
    levelBias: 0.6, pitchUpLevel: 0.55, pitchDownFloor: -0.65, aheadFactor: 0.65,
    sideSegments: 4, sideThickness: 0.1, sideGap: 0.35, maxBury: 3.5,
    repeatDelay: 0.12,
  },
  pickaxe: { damageBuild: 50, damageActor: 20, headMult: 1.5, range: 3.2, cooldown: 0.45, swingTime: 0.3, harvest: 8 },
  match: {
    players: 25,
    busHeight: 190, busSpeed: 30, busEdge: 0.95, busDoorDelay: 2,
    freefallSpeed: 36, diveSpeed: 52, freefallSteer: 17, glideSpeed: 15, glideFall: 7.5,
    autoGlideHeight: 34, minGlideHeight: 6, freefallAccel: 30,
    endScreenDelay: 2.2,
  },
  storm: {
    startRadius: 470,
    phases: [
      { wait: 70, shrink: 45, factor: 0.60, dmg: 1 },
      { wait: 50, shrink: 40, factor: 0.55, dmg: 2 },
      { wait: 40, shrink: 35, factor: 0.50, dmg: 5 },
      { wait: 30, shrink: 30, factor: 0.45, dmg: 8 },
      { wait: 25, shrink: 30, factor: 0.00, dmg: 10 },
    ],
    finalDamage: 10, tickInterval: 1, height: 260,
  },
  rarities: [
    { name: 'Gewöhnlich', color: 0x9aa0a6, css: '#9aa0a6', mult: 1.00 },
    { name: 'Ungewöhnlich', color: 0x3fcf4f, css: '#3fcf4f', mult: 1.05 },
    { name: 'Selten', color: 0x3f8fff, css: '#3f8fff', mult: 1.10 },
    { name: 'Episch', color: 0xb04fff, css: '#b04fff', mult: 1.16 },
    { name: 'Legendär', color: 0xffa928, css: '#ffa928', mult: 1.22 },
  ],
  weapons: {
    pistol:  { name: 'Pistole', short: 'PIS', dmg: 24, rate: 6.5, mag: 16, reload: 1.4, spread: 0.035, adsSpread: 0.015, ammo: 'leicht', range: 120, head: 2.0, pellets: 1, auto: false, build: 1.0, weight: 25 },
    smg:     { name: 'Maschinenpistole', short: 'MP', dmg: 17, rate: 11, mag: 30, reload: 2.1, spread: 0.06, adsSpread: 0.035, ammo: 'leicht', range: 90, head: 1.75, pellets: 1, auto: true, build: 0.8, weight: 22 },
    ar:      { name: 'Sturmgewehr', short: 'STG', dmg: 31, rate: 5.5, mag: 30, reload: 2.3, spread: 0.03, adsSpread: 0.008, ammo: 'mittel', range: 180, head: 1.5, pellets: 1, auto: true, build: 1.0, weight: 25 },
    shotgun: { name: 'Schrotflinte', short: 'SCH', dmg: 10, rate: 0.9, mag: 5, reload: 4.2, spread: 0.1, adsSpread: 0.08, ammo: 'schrot', range: 40, head: 1.6, pellets: 9, auto: false, build: 0.9, weight: 20, falloffStart: 8, falloffEnd: 26, falloffMin: 0.35 },
    sniper:  { name: 'Scharfschützengewehr', short: 'SNI', dmg: 105, rate: 0.35, mag: 1, reload: 2.6, spread: 0.09, adsSpread: 0.0, ammo: 'schwer', range: 450, head: 2.5, pellets: 1, auto: false, build: 1.2, weight: 8, scope: true },
  },
  ammo: {
    leicht: { name: 'Leichte Munition', color: 0x7fb6ff, pickup: 36, start: 0 },
    mittel: { name: 'Mittlere Munition', color: 0x9be36b, pickup: 30, start: 0 },
    schwer: { name: 'Schwere Munition', color: 0xff7d5a, pickup: 6, start: 0 },
    schrot: { name: 'Schrot', color: 0xf2d24b, pickup: 8, start: 0 },
  },
  heals: {
    bandage:     { name: 'Verband', short: 'VER', hp: 15, maxTo: 75, time: 3.0, stack: 15, pickup: 5, rarity: 0, weight: 35 },
    medkit:      { name: 'Medikit', short: 'MED', hp: 100, maxTo: 100, time: 8.0, stack: 3, pickup: 1, rarity: 1, weight: 15 },
    shieldSmall: { name: 'Kleiner Schildtrank', short: 'KS', shield: 25, maxTo: 50, time: 2.0, stack: 6, pickup: 3, rarity: 1, weight: 30 },
    shield:      { name: 'Schildtrank', short: 'SCH', shield: 50, maxTo: 100, time: 4.0, stack: 3, pickup: 1, rarity: 2, weight: 20 },
  },
  loot: {
    slots: 5,
    floorPerHouse: 3, floorOutdoor: 80, chestsOutdoor: 24,
    floorKind: { weapon: 42, ammo: 24, heal: 24, mats: 10 },
    floorRarity: [40, 32, 18, 8, 2],
    chestRarity: [0, 38, 36, 19, 7],
    chestMats: 30, chestHealChance: 0.75, matsPickup: 30,
    bobHeight: 0.12, spinSpeed: 1.4,
  },
  bots: {
    count: 24,
    thinkRate: 5, sightRange: 85, sightChecks: 3, fov: 1.9,
    lootRange: 110, wanderRange: 70, reachDistance: 1.8,
    difficulties: {
      leicht:  { weight: 40, aimError: 0.11,  reaction: 0.9,  buildChance: 0.1 },
      mittel:  { weight: 40, aimError: 0.05,  reaction: 0.45, buildChance: 0.3 },
      schwer:  { weight: 20, aimError: 0.022, reaction: 0.22, buildChance: 0.55 },
    },
    healThreshold: 60, strafeTime: [0.6, 1.6],
    names: ['Lukas', 'Mia', 'Finn', 'Emma', 'Ben', 'Lena', 'Paul', 'Hanna', 'Jonas', 'Lea', 'Elias', 'Marie', 'Noah', 'Sophie', 'Leon', 'Clara', 'Felix', 'Ida', 'Max', 'Nele', 'Tim', 'Lina', 'Theo', 'Frieda', 'Oskar', 'Greta'],
  },
  effects: { poolSize: 200, damageNumberPool: 40, tracerPool: 60, particleLife: 0.6, particleGravity: 14, damageNumberLife: 0.9, damageNumberRise: 1.2, tracerLife: 0.06 },
  debug: { colliderRange: 14, maxLines: 8000, textInterval: 0.25 },
  raycast: { terrainStep: 0.5, terrainRefine: 8, maxGridSteps: 2048, infoDistance: 10 },
  audio: { volume: 0.25, gunRange: 160 },
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
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function weightedIndex(weights, rnd) {
  let sum = 0;
  for (const w of weights) sum += w;
  let r = (rnd ? rnd() : Math.random()) * sum;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
  return weights.length - 1;
}
function weightedKey(obj, field) {
  const keys = Object.keys(obj);
  return keys[weightedIndex(keys.map((k) => (field ? obj[k][field] : obj[k])))];
}
function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

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
// Object Pool (Partikel, Tracer, Schadenszahlen)
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

// Laufzeit-Zustand, der von vielen Modulen gelesen wird
let gameTime = 0;
let gameState = 'loading'; // loading | start | playing | paused | ended
let player = null;
const actors = [];
