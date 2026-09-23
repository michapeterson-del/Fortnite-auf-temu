// ---------------------------------------------------------------------
// Three.js: Renderer, Szene, Licht, Himmel
// ---------------------------------------------------------------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CONFIG.render.exposure;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(CONFIG.render.skyHorizon, CONFIG.render.fogNear, CONFIG.render.fogFar);
scene.background = new THREE.Color(CONFIG.render.skyHorizon);
const camera = new THREE.PerspectiveCamera(CONFIG.render.fov, 1, CONFIG.render.near, CONFIG.render.far);
camera.rotation.order = 'YXZ';

const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
const hemi = new THREE.HemisphereLight(0xd6ecff, 0x6f7f45, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.7);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
const sa = CONFIG.render.shadowArea;
Object.assign(sun.shadow.camera, { left: -sa, right: sa, top: sa, bottom: -sa, near: 1, far: 400 });
scene.add(sun, sun.target);

// Himmelskuppel mit Farbverlauf und Sonnenscheibe
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    top: { value: new THREE.Color(CONFIG.render.skyTop) },
    horizon: { value: new THREE.Color(CONFIG.render.skyHorizon) },
    bottom: { value: new THREE.Color(CONFIG.render.skyBottom) },
    sunDir: { value: SUN_DIR },
  },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vDir;',
    'void main(){',
    '  vec3 d = normalize(vDir); float h = d.y;',
    '  vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, bottom, min(1.0, -h * 4.0));',
    '  float s = max(dot(d, sunDir), 0.0);',
    '  c += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.25);',
    '  gl_FragColor = vec4(c, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}',
  ].join('\n'),
  side: THREE.BackSide, depthWrite: false, fog: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(950, 32, 16), skyMat);
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);

// ---------------------------------------------------------------------
// Prozedurale Texturen (Canvas) – keine Bilddateien nötig
// ---------------------------------------------------------------------
function canvasTexture(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  if (repeat) tex.repeat.set(repeat, repeat);
  return tex;
}

function speckle(g, size, count, minA, maxA, dark) {
  for (let i = 0; i < count; i++) {
    const a = rand(minA, maxA);
    g.fillStyle = dark ? 'rgba(0,0,0,' + a + ')' : 'rgba(255,255,255,' + a + ')';
    const s = rand(1, 3);
    g.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
}

const TEX = {
  // Detailrauschen fürs Terrain (wird mit den Vertexfarben multipliziert)
  detail: canvasTexture(256, (g, s) => {
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(rand(170, 255));
      g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      const w = rand(1, 3), h = rand(2, 6);
      g.fillRect(Math.random() * s, Math.random() * s, w, h);
    }
  }),
  plaster: canvasTexture(256, (g, s) => {
    g.fillStyle = '#f2efe9'; g.fillRect(0, 0, s, s);
    speckle(g, s, 3000, 0.02, 0.08, true);
    speckle(g, s, 1500, 0.05, 0.15, false);
    g.strokeStyle = 'rgba(0,0,0,0.05)';
    for (let y = 0; y < s; y += 64) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(s, y + 0.5); g.stroke(); }
  }),
  wood: canvasTexture(256, (g, s) => {
    const planks = 4, ph = s / planks;
    for (let i = 0; i < planks; i++) {
      const v = Math.floor(rand(-18, 18));
      g.fillStyle = 'rgb(' + (196 + v) + ',' + (146 + v) + ',' + (98 + v) + ')';
      g.fillRect(0, i * ph, s, ph);
      g.strokeStyle = 'rgba(90,50,20,0.25)';
      for (let k = 0; k < 7; k++) {
        g.beginPath();
        const y = i * ph + rand(4, ph - 4);
        g.moveTo(0, y);
        g.bezierCurveTo(s * 0.3, y + rand(-4, 4), s * 0.6, y + rand(-4, 4), s, y + rand(-3, 3));
        g.stroke();
      }
      g.fillStyle = 'rgba(60,30,10,0.55)';
      g.fillRect(0, i * ph, s, 3);
      g.fillStyle = 'rgba(60,30,10,0.6)';
      g.beginPath(); g.arc(rand(20, s - 20), i * ph + ph / 2, 3, 0, Math.PI * 2); g.fill();
    }
  }),
  shingles: canvasTexture(256, (g, s) => {
    g.fillStyle = '#b3523f'; g.fillRect(0, 0, s, s);
    const rows = 8, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 16;
      for (let x = -32; x < s; x += 32) {
        const v = Math.floor(rand(-20, 20));
        g.fillStyle = 'rgb(' + (170 + v) + ',' + (72 + v / 2) + ',' + (55 + v / 2) + ')';
        g.fillRect(x + off + 1, r * rh + 1, 30, rh - 2);
      }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, r * rh + rh - 3, s, 3);
    }
  }),
  stone: canvasTexture(256, (g, s) => {
    g.fillStyle = '#8f8c86'; g.fillRect(0, 0, s, s);
    const rows = 6, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * -24;
      while (x < s) {
        const w = rand(36, 70), v = Math.floor(rand(-22, 22));
        g.fillStyle = 'rgb(' + (140 + v) + ',' + (137 + v) + ',' + (130 + v) + ')';
        g.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
        x += w;
      }
    }
    speckle(g, s, 1500, 0.05, 0.15, true);
  }),
  bark: canvasTexture(128, (g, s) => {
    g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(30,15,5,' + rand(0.2, 0.5) + ')'; g.fillRect(Math.random() * s, 0, rand(1, 3), s); }
  }),
};

// Normal-Map für Wasserwellen
const waterNormal = (() => {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  const hgt = (x, y) => {
    const u = x / s * Math.PI * 2, v = y / s * Math.PI * 2;
    return Math.sin(u * 3 + v * 2) * 0.5 + Math.sin(u * 7 - v * 5) * 0.25 + Math.sin(u * 13 + v * 11) * 0.12 + Math.cos(v * 4 - u) * 0.3;
  };
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
    const nx = -dx * 2.2, ny = -dy * 2.2, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * s + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  return t;
})();

// ---------------------------------------------------------------------
// Geteilte Geometrien und Materialien
// ---------------------------------------------------------------------
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitSphere = new THREE.SphereGeometry(0.5, 12, 8);
const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const matCache = new Map();
function lambert(color) {
  let m = matCache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); matCache.set(color, m); }
  return m;
}
function texMat(texName, color) {
  const key = texName + '|' + color;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ map: TEX[texName], color }); matCache.set(key, m); }
  return m;
}
function glowMat(color, opacity) {
  const key = 'glow|' + color + '|' + opacity;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }); matCache.set(key, m); }
  return m;
}

// Viele Boxen zu EINER Geometrie zusammenfassen (weniger Draw Calls).
// UVs werden weltbezogen berechnet, damit Texturen auf allen Größen gleich dicht sind.
function mergeBoxes(boxes, uvScale) {
  const base = unitBox;
  const bp = base.attributes.position.array, bn = base.attributes.normal.array, bi = base.index.array;
  const vc = bp.length / 3;
  const pos = new Float32Array(boxes.length * vc * 3), nor = new Float32Array(boxes.length * vc * 3), uv = new Float32Array(boxes.length * vc * 2);
  const idx = new Uint32Array(boxes.length * bi.length);
  const s = 1 / (uvScale || 2);
  boxes.forEach((b, k) => {
    const sx = b[3] - b[0], sy = b[4] - b[1], sz = b[5] - b[2];
    const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
    for (let v = 0; v < vc; v++) {
      const o = (k * vc + v) * 3;
      const x = cx + bp[v * 3] * sx, y = cy + bp[v * 3 + 1] * sy, z = cz + bp[v * 3 + 2] * sz;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      const nx = bn[v * 3], ny = bn[v * 3 + 1], nz = bn[v * 3 + 2];
      nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
      const u = (k * vc + v) * 2;
      if (Math.abs(nx) > 0.5) { uv[u] = z * s; uv[u + 1] = y * s; }
      else if (Math.abs(ny) > 0.5) { uv[u] = x * s; uv[u + 1] = z * s; }
      else { uv[u] = x * s; uv[u + 1] = y * s; }
    }
    for (let i = 0; i < bi.length; i++) idx[k * bi.length + i] = bi[i] + k * vc;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
