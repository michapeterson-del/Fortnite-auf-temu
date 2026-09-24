// ---------------------------------------------------------------------
// Atmosphäre: Tageszeit (Nachmittag → Goldene Stunde → Sonnenuntergang),
// Nebel, Umgebungslicht (Env-Map) und dichtes Gras mit Wind um die Kamera.
// ---------------------------------------------------------------------
const TOD_KEYS = [
  { t: 0.0, elev: 0.95, azim: 0.65, sun: 0xfff1dc, sunI: 2.9, hemiSky: 0xd6ecff, hemiGround: 0x6f7f45, hemiI: 0.95,
    top: 0x2a74d0, horizon: 0xc4e4ff, bottom: 0xe2f1ff, exposure: 1.0, warmth: 0.0, env: 0.75 },
  { t: 0.55, elev: 0.42, azim: 0.9, sun: 0xffd9a8, sunI: 2.6, hemiSky: 0xffe2c4, hemiGround: 0x6a6440, hemiI: 0.8,
    top: 0x3564b8, horizon: 0xffd2a6, bottom: 0xffe0c4, exposure: 1.05, warmth: 0.45, env: 0.65 },
  { t: 1.0, elev: 0.12, azim: 1.1, sun: 0xff9a5a, sunI: 2.1, hemiSky: 0xffb48c, hemiGround: 0x3f3a44, hemiI: 0.6,
    top: 0x2a3a78, horizon: 0xff9a66, bottom: 0xffb88e, exposure: 1.15, warmth: 0.9, env: 0.55 },
];
const TOD_FIXED = { dynamisch: null, mittag: 0, abend: 0.55, sonnenuntergang: 1 };
const tod = { value: -1, dynamic: true, fixed: 0, matchLength: 420 };
const _ca = new THREE.Color(), _cb = new THREE.Color();

function lerpHex(a, b, k, out) { _ca.setHex(a); _cb.setHex(b); return out.copy(_ca).lerp(_cb, k); }

// Umgebungslicht-Himmel (nur für die Env-Map)
const envUniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color(0x56683f) }, sunDir: { value: SUN_DIR }, sunColor: { value: new THREE.Color() } };
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
  uniforms: envUniforms,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;',
    'void main(){ vec3 d = normalize(vDir); float h = d.y;',
    '  vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon * 0.8, ground, min(1.0, -h * 5.0));',
    '  float s = max(dot(d, sunDir), 0.0); c += sunColor * (pow(s, 64.0) * 6.0 + pow(s, 6.0) * 0.4);',
    '  gl_FragColor = vec4(c, 1.0); }',
  ].join('\n'),
  side: THREE.BackSide, depthWrite: false,
})));
// Die Env-Maps der drei Stimmungen werden beim Laden EINMAL berechnet
// (Neuberechnen mitten im Spiel würde ruckeln) und dann nur umgeschaltet.
const envMaps = [], skyEnvMaps = [];
// Mit eingebetteten HDR-Fotos (Poly Haven) wird das echte Himmelslicht
// genommen und so gedreht, dass die hellste Stelle (die Sonne im Foto)
// dort liegt, wo auch unsere Sonne steht.
const hdrUniforms = { map: { value: null }, rot: { value: 0 }, gain: { value: 1 }, sunDir: { value: SUN_DIR }, sunColor: { value: new THREE.Color() }, ground: { value: new THREE.Color(0x56683f) } };
const hdrScene = new THREE.Scene();
hdrScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), new THREE.ShaderMaterial({
  uniforms: hdrUniforms,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D map; uniform float rot; uniform float gain; uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 ground; varying vec3 vDir;',
    'void main(){ vec3 d = normalize(vDir);',
    '  float u = atan(d.z, d.x) / 6.2831853 + 0.5 + rot; float v = asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5;',
    '  vec3 c = texture2D(map, vec2(fract(u), v)).rgb * gain;',
    '  c = min(c, vec3(8.0));',
    '  if (d.y < 0.0) c = mix(c, ground * dot(c, vec3(0.3, 0.5, 0.2)) * 2.2, min(1.0, -d.y * 4.0));',
    '  float s = max(dot(d, sunDir), 0.0); c += sunColor * pow(s, 64.0) * 6.0;',
    '  gl_FragColor = vec4(c, 1.0); }',
  ].join('\n'),
  side: THREE.BackSide, depthWrite: false,
})));
// hellste Richtung und mittlere Helligkeit des oberen Halbraums eines HDR-Bilds
function analyseHdr(t) {
  const { data, width: w, height: h } = t.image;
  const half = t.type === THREE.HalfFloatType, get = (i) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  const ch = data.length / (w * h);
  let best = -1, bu = 0, sum = 0, n = 0;
  for (let y = 0; y < h; y += 2) {
    const v = y / h;
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * ch;
      const l = get(i) * 0.3 + get(i + 1) * 0.5 + get(i + 2) * 0.2;
      if (v > 0.5 === !t.flipY) { sum += Math.min(l, 4); n++; }
      if (l > best) { best = l; bu = x / w; }
    }
  }
  return { sunU: bu, mean: sum / Math.max(1, n) };
}
function prebuildEnvironments() {
  const gen = new THREE.PMREMGenerator(renderer);
  const names = CONFIG.render.hdri;
  TOD_KEYS.forEach((K, idx) => {
    envUniforms.top.value.setHex(K.top); envUniforms.horizon.value.setHex(K.horizon); envUniforms.sunColor.value.setHex(K.sun);
    const e = K.elev, az = K.azim;
    const dir = new THREE.Vector3(Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az)).normalize();
    const hdr = ASSETS.hdr[names[idx]];
    if (hdr) {
      const info = hdr.userData.info || (hdr.userData.info = analyseHdr(hdr));
      hdrUniforms.map.value = hdr;
      // Foto-Sonne (u) auf unsere Sonnenrichtung drehen
      const targetU = Math.atan2(dir.z, dir.x) / (Math.PI * 2) + 0.5;
      hdrUniforms.rot.value = info.sunU - targetU;
      hdrUniforms.gain.value = CONFIG.render.hdriBrightness / Math.max(0.05, info.mean);
      hdrUniforms.sunDir.value = dir;
      hdrUniforms.sunColor.value.setHex(K.sun).multiplyScalar(0.5);
      envMaps.push(gen.fromScene(hdrScene, 0.02).texture);
    }
    // reiner Himmel (für Wasser-Spiegelungen: keine Bäume aus dem Foto im Meer)
    envUniforms.sunDir.value = dir;
    const skyEnv = gen.fromScene(envScene, 0.02).texture;
    skyEnvMaps.push(skyEnv);
    if (!hdr) envMaps.push(skyEnv);
  });
  envUniforms.sunDir.value = SUN_DIR;
  gen.dispose();
}
function pickEnvironment(v) {
  if (!envMaps.length) prebuildEnvironments();
  let best = 0;
  for (let i = 1; i < TOD_KEYS.length; i++) if (Math.abs(TOD_KEYS[i].t - v) < Math.abs(TOD_KEYS[best].t - v)) best = i;
  if (scene.environment !== envMaps[best]) scene.environment = envMaps[best];
  if (waterMesh && waterMesh.material.envMap !== skyEnvMaps[best]) { waterMesh.material.envMap = skyEnvMaps[best]; waterMesh.material.needsUpdate = true; }
}

// Tageszeit anwenden (0 = Nachmittag, 1 = Sonnenuntergang)
function applyTimeOfDay(v, force) {
  v = clamp(v, 0, 1);
  if (!force && Math.abs(v - tod.value) < 0.0005) return;
  tod.value = v;
  let i = 0;
  while (i < TOD_KEYS.length - 2 && v > TOD_KEYS[i + 1].t) i++;
  const A = TOD_KEYS[i], B = TOD_KEYS[i + 1];
  const k = smoothstep(A.t, B.t, v);
  const L = (x, y) => x + (y - x) * k;
  const elev = L(A.elev, B.elev), azim = L(A.azim, B.azim);
  SUN_DIR.set(Math.cos(elev) * Math.cos(azim), Math.sin(elev), Math.cos(elev) * Math.sin(azim)).normalize();
  lerpHex(A.sun, B.sun, k, sun.color); sun.intensity = L(A.sunI, B.sunI);
  lerpHex(A.hemiSky, B.hemiSky, k, hemi.color); lerpHex(A.hemiGround, B.hemiGround, k, hemi.groundColor); hemi.intensity = L(A.hemiI, B.hemiI);
  lerpHex(A.top, B.top, k, skyMat.uniforms.top.value);
  lerpHex(A.horizon, B.horizon, k, skyMat.uniforms.horizon.value);
  lerpHex(A.bottom, B.bottom, k, skyMat.uniforms.bottom.value);
  scene.fog.color.copy(skyMat.uniforms.horizon.value);
  scene.background.copy(skyMat.uniforms.horizon.value);
  renderer.toneMappingExposure = L(A.exposure, B.exposure) * CONFIG.render.exposure;
  if (post.compMat) post.compMat.uniforms.warmth.value = L(A.warmth, B.warmth);
  charMat.envMapIntensity = L(A.env, B.env);
  pickEnvironment(v);
}

function setTodMode(mode) {
  const f = TOD_FIXED[mode];
  tod.dynamic = f === null || f === undefined;
  tod.fixed = tod.dynamic ? 0 : f;
  applyTimeOfDay(tod.fixed, true);
}

function updateTimeOfDay(matchTime) {
  if (!tod.dynamic) return;
  applyTimeOfDay(matchTime / tod.matchLength, false);
}

// ---------------------------------------------------------------------
// Dichtes Gras um die Kamera: Kacheln mit festen Zufallspositionen,
// Wind im Vertex-Shader. Wird neu verteilt, wenn die Kamera die Kachel wechselt.
// ---------------------------------------------------------------------
const grassField = { mesh: null, tile: 8, radius: 4, perTile: 140, cx: 1e9, cz: 1e9, time: { value: 0 }, enabled: true };

function buildGrassField() {
  const G = grassField;
  const geo = new THREE.BufferGeometry();
  // zwei gekreuzte, spitz zulaufende Halme
  const p = [-0.05, 0, 0, 0.05, 0, 0, 0, 1, 0.03, 0, 0, -0.05, 0, 0, 0.05, 0.03, 0.9, 0];
  const base = [0.2, 0.36, 0.1], tip = [0.6, 0.8, 0.32];
  const c = [...base, ...base, ...tip, ...base, ...base, ...tip];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.time = G.time;
    shader.vertexShader = 'uniform float time;\n' + shader.vertexShader.replace('#include <begin_vertex>', [
      '#include <begin_vertex>',
      'vec4 gWorld = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
      'float sway = sin(time * 1.7 + gWorld.x * 0.31 + gWorld.z * 0.23) * 0.13 + sin(time * 3.3 + gWorld.x * 1.1) * 0.04;',
      'transformed.x += sway * position.y; transformed.z += sway * 0.55 * position.y;',
    ].join('\n'));
    // Normale nach oben: Gras wirkt von allen Seiten gleich hell
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    // Beide Seiten gleich beleuchten (keine schwarzen Rückseiten)
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;');
  };
  const n = (2 * G.radius + 1) ** 2 * G.perTile;
  G.mesh = new THREE.InstancedMesh(geo, mat, n);
  G.mesh.frustumCulled = false;
  G.mesh.receiveShadow = true;
  G.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  scene.add(G.mesh);
}

const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _ge = new THREE.Euler(), _gs = new THREE.Vector3(), _gp = new THREE.Vector3(), _gc = new THREE.Color();
const _gn = { x: 0, y: 1, z: 0 };
function updateGrassField(camX, camZ, dt) {
  const G = grassField;
  if (!G.mesh) return;
  G.time.value += dt;
  G.mesh.visible = G.enabled;
  if (!G.enabled) return;
  const tx = Math.floor(camX / G.tile), tz = Math.floor(camZ / G.tile);
  if (tx === G.cx && tz === G.cz) return;
  G.cx = tx; G.cz = tz;
  let idx = 0;
  for (let dz = -G.radius; dz <= G.radius; dz++) for (let dx = -G.radius; dx <= G.radius; dx++) {
    const ix = tx + dx, iz = tz + dz;
    const rnd = mulberry32(((ix * 73856093) ^ (iz * 19349663)) >>> 0);
    for (let k = 0; k < G.perTile; k++) {
      const x = (ix + rnd()) * G.tile, z = (iz + rnd()) * G.tile;
      const s = 0.3 + rnd() * 0.55, yaw = rnd() * Math.PI * 2, lean = (rnd() - 0.5) * 0.4, tint = rnd();
      const h = getHeight(x, z);
      let ok = h > W.waterLevel + 1.0 && Math.abs(x) < HALF - 4 && Math.abs(z) < HALF - 4;
      if (ok) ok = getNormal(x, z, _gn).y > 0.82 && !insideHouse(x, z, 0.6);
      _ge.set(lean, yaw, 0); _gq.setFromEuler(_ge);
      _gp.set(x, h - 0.03, z);
      _gs.set(ok ? 1 + tint * 0.5 : 0, ok ? s : 0, ok ? 1 : 0);
      _gm.compose(_gp, _gq, _gs);
      G.mesh.setMatrixAt(idx, _gm);
      _gc.setRGB(0.8 + tint * 0.35, 0.9 + tint * 0.2, 0.75 + tint * 0.2);
      G.mesh.setColorAt(idx, _gc);
      idx++;
    }
  }
  G.mesh.instanceMatrix.needsUpdate = true;
  G.mesh.instanceColor.needsUpdate = true;
}
