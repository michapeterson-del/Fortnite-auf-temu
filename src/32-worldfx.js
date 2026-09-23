// ---------------------------------------------------------------------
// Welt-Feinschliff: organische Baumkronen mit Wind, weiche Wolken,
// Wasser mit Tiefe und Uferschaum, Felsen an Hängen, Kontaktschatten
// ---------------------------------------------------------------------
let terrainMesh = null;
const aoSpots = [];

// Felsstruktur für steile Hänge
const ROCK_TEX = canvasTexture(256, (g, s) => {
  g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 1800; i++) {
    const v = Math.floor(rand(150, 245));
    g.fillStyle = 'rgba(' + v + ',' + (v - 4) + ',' + (v - 10) + ',0.55)';
    g.fillRect(Math.random() * s, Math.random() * s, rand(2, 9), rand(2, 6));
  }
  g.strokeStyle = 'rgba(60,55,50,0.45)';
  for (let i = 0; i < 26; i++) {
    g.lineWidth = rand(0.8, 2);
    g.beginPath();
    let x = Math.random() * s, y = Math.random() * s;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += rand(-24, 24); y += rand(4, 22); g.lineTo(x, y); }
    g.stroke();
  }
});

// Gleichmäßiges Rauschen aus der Position (gleiche Ecke → gleicher Wert, keine Risse)
function posNoise(x, y, z) {
  const h = Math.sin(Math.round(x * 97) * 12.9898 + Math.round(y * 97) * 78.233 + Math.round(z * 97) * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

// Teile zusammenfügen, organisch verbeulen und von unten nach oben aufhellen
function organicCrown(parts, amp, dark, light) {
  const geo = mergeParts(parts);
  const pos = geo.attributes.position, nor = geo.attributes.normal, col = geo.attributes.color;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) { minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i)); }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = posNoise(x, y, z) - 0.5;
    pos.setXYZ(i, x + nor.getX(i) * n * amp, y + nor.getY(i) * n * amp * 0.6, z + nor.getZ(i) * n * amp);
    const k = (y - minY) / (maxY - minY);
    const lum = dark + (light - dark) * k + (posNoise(z, x, y) - 0.5) * 0.12;
    col.setXYZ(i, col.getX(i) * lum, col.getY(i) * lum, col.getZ(i) * lum);
  }
  pos.needsUpdate = true; col.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}

function pineCrownGeometry() {
  const layers = [[1.0, 0.42, 0.21], [0.82, 0.4, 0.4], [0.64, 0.36, 0.58], [0.44, 0.3, 0.75], [0.24, 0.24, 0.9]];
  return organicCrown(layers.map(([r, h, y]) => ({ s: 'cone', y, sx: 2 * r, sy: h, sz: 2 * r, c: 0xffffff })), 0.09, 0.45, 1.15);
}

function broadCrownGeometry() {
  const blobs = [[0, 0.5, 0, 1.25], [0.45, 0.45, 0.2, 0.85], [-0.42, 0.5, -0.25, 0.9], [0.1, 0.84, -0.1, 0.85], [-0.2, 0.38, 0.45, 0.8]];
  return organicCrown(blobs.map(([x, y, z, d]) => ({ s: 'ico', x, y, z, sx: d, sy: d * 0.9, sz: d, c: 0xffffff })), 0.14, 0.5, 1.2);
}

// Wind: Spitzen schwingen, Fuß bleibt stehen
function windify(mat, strength) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.time = grassField.time;
    sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
      '#include <begin_vertex>',
      'vec4 wIw = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
      'float wS = (sin(time * 1.3 + wIw.x * 0.07 + wIw.z * 0.05) * 0.6 + sin(time * 2.7 + wIw.z * 0.13 + wIw.x * 0.02) * 0.25) * ' + strength.toFixed(3) + ' * max(position.y, 0.0);',
      'transformed.x += wS; transformed.z += wS * 0.5;',
    ].join('\n'));
  };
  return mat;
}

// ---------------------------------------------------------------------
// Weiche Wolken: Billboards im Vertex-Shader, ein Draw Call
// ---------------------------------------------------------------------
const CLOUD_TEX = (() => {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  for (let i = 0; i < 40; i++) {
    const x = s / 2 + rand(-s * 0.26, s * 0.26), y = s / 2 + rand(-s * 0.16, s * 0.2), r = rand(s * 0.1, s * 0.24);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
})();

function buildSoftClouds(rnd) {
  cloudGroup = new THREE.Group();
  const perCloud = 11, n = W.clouds * perCloud;
  const plane = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = plane.index;
  geo.setAttribute('position', plane.attributes.position);
  geo.setAttribute('uv', plane.attributes.uv);
  const off = new Float32Array(n * 3), size = new Float32Array(n), shade = new Float32Array(n);
  let i = 0;
  for (let c = 0; c < W.clouds; c++) {
    const ang = rnd() * Math.PI * 2, dist = 100 + rnd() * 560;
    const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist, cy = 260 + rnd() * 80;
    const sz = 16 + rnd() * 20;
    for (let k = 0; k < perCloud; k++) {
      off[i * 3] = cx + (rnd() - 0.5) * sz * 2.6;
      off[i * 3 + 1] = cy + (rnd() - 0.2) * sz * 0.45;
      off[i * 3 + 2] = cz + (rnd() - 0.5) * sz * 1.6;
      size[i] = sz * (0.9 + rnd() * 1.1);
      shade[i] = rnd();
      i++;
    }
  }
  geo.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute('size', new THREE.InstancedBufferAttribute(size, 1));
  geo.setAttribute('shade', new THREE.InstancedBufferAttribute(shade, 1));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: CLOUD_TEX }, sunColor: { value: sun.color }, skyColor: { value: skyMat.uniforms.horizon.value }, sunDir: { value: SUN_DIR } },
    vertexShader: [
      'attribute vec3 offset; attribute float size; attribute float shade; varying vec2 vUv; varying float vShade; varying float vSunSide;',
      'uniform vec3 sunDir;',
      'void main(){ vUv = uv; vShade = shade;',
      '  vec4 mv = modelViewMatrix * vec4(offset, 1.0);',
      '  mv.xy += position.xy * vec2(size, size * 0.62);',
      '  vec3 viewSun = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);',
      '  vSunSide = dot(normalize(vec3(position.xy, 0.4)), viewSun) * 0.5 + 0.5;',
      '  gl_Position = projectionMatrix * mv; }',
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D map; uniform vec3 sunColor; uniform vec3 skyColor; varying vec2 vUv; varying float vShade; varying float vSunSide;',
      'void main(){ vec4 t = texture2D(map, vUv); if (t.a < 0.01) discard;',
      '  float lit = clamp(vUv.y * 0.7 + vSunSide * 0.5 - 0.1 + vShade * 0.15, 0.0, 1.0);',
      '  vec3 base = mix(skyColor * 0.72 + vec3(0.1), vec3(1.0) * 0.6 + sunColor * 0.25, lit);',
      '  gl_FragColor = vec4(base * 1.05, t.a * 0.95);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
    transparent: true, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  cloudGroup.add(mesh);
  scene.add(cloudGroup);
}

// ---------------------------------------------------------------------
// Wasser: Farbe nach Tiefe (türkis → tiefblau), Schaum an der Küste
// ---------------------------------------------------------------------
function patchWater(mat) {
  const data = new Uint8Array(HM_N * HM_N * 4);
  for (let i = 0; i < HM_N * HM_N; i++) {
    const d = clamp((W.waterLevel - heights[i]) / 6, 0, 1) * 255;
    data[i * 4] = d; data[i * 4 + 1] = d; data[i * 4 + 2] = d; data[i * 4 + 3] = 255;
  }
  const depthTex = new THREE.DataTexture(data, HM_N, HM_N, THREE.RGBAFormat);
  depthTex.magFilter = THREE.LinearFilter; depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.depthTex = { value: depthTex };
    sh.uniforms.time = grassField.time;
    sh.uniforms.islandHalf = { value: HALF };
    sh.uniforms.islandSize = { value: W.size };
    sh.vertexShader = 'varying vec2 vWXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform sampler2D depthTex; uniform float time; uniform float islandHalf; uniform float islandSize; varying vec2 vWXZ;\n' +
      sh.fragmentShader.replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'vec2 duv = (vWXZ + islandHalf) / islandSize;',
        'float dep = 1.0;',
        'if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) dep = texture2D(depthTex, duv).r;',
        'vec3 shallowC = vec3(0.07, 0.42, 0.42); vec3 deepC = vec3(0.012, 0.09, 0.2);',
        'diffuseColor.rgb = mix(shallowC, deepC, smoothstep(0.0, 0.55, dep));',
        'float edge = 1.0 - smoothstep(0.0, 0.06, dep);',
        'float wave = 0.5 + 0.5 * sin(time * 1.7 - dep * 110.0 + (vWXZ.x + vWXZ.y) * 0.12);',
        'float foam = edge * (0.45 + 0.55 * wave);',
        'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.96, 0.97), foam);',
        'diffuseColor.a = mix(0.55, 0.94, smoothstep(0.0, 0.3, dep));',
      ].join('\n'));
  };
  mat.color.setHex(0xffffff);
  mat.needsUpdate = true;
}

// ---------------------------------------------------------------------
// Gelände: Felsstruktur an Hängen, großflächige Variation gegen Kachel-Muster
// ---------------------------------------------------------------------
function patchTerrain(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rockMap = { value: ROCK_TEX };
    sh.vertexShader = 'varying float vWNy;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWNy = normal.y;');
    sh.fragmentShader = 'uniform sampler2D rockMap; varying float vWNy;\n' + sh.fragmentShader.replace('#include <map_fragment>', [
      'vec4 tG = texture2D(map, vMapUv);',
      'vec4 tR = texture2D(rockMap, vMapUv * 0.45);',
      'float macro = 0.84 + 0.32 * texture2D(map, vMapUv * 0.043).r;',
      'float rk = smoothstep(0.84, 0.72, vWNy);',
      'diffuseColor.rgb *= mix(tG.rgb, tR.rgb, rk) * macro;',
    ].join('\n'));
  };
  mat.needsUpdate = true;
}

// Kontaktschatten (vorberechnet) unter Bäumen, Steinen, Kisten und um Häuser
function bakeTerrainAO() {
  if (!terrainMesh) return;
  const col = terrainMesh.geometry.attributes.color;
  const darken = (i, f) => col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  const idxAt = (x, z) => [Math.round((x + HALF) / W.cellSize), Math.round((z + HALF) / W.cellSize)];
  for (const [x, z, r, s] of aoSpots) {
    const [ci, cj] = idxAt(x, z), n = Math.ceil(r / W.cellSize);
    for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
      if (i < 0 || j < 0 || i >= HM_N || j >= HM_N) continue;
      const vx = i * W.cellSize - HALF, vz = j * W.cellSize - HALF;
      const d = Math.hypot(vx - x, vz - z);
      if (d < r) darken(j * HM_N + i, lerp(s, 1, smoothstep(0, r, d)));
    }
  }
  for (const hs of houses) {
    const m = 3.5;
    const [i0, j0] = idxAt(hs.x - hs.w / 2 - m, hs.z - hs.d / 2 - m), [i1, j1] = idxAt(hs.x + hs.w / 2 + m, hs.z + hs.d / 2 + m);
    for (let j = Math.max(0, j0); j <= Math.min(HM_N - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(HM_N - 1, i1); i++) {
      const vx = i * W.cellSize - HALF, vz = j * W.cellSize - HALF;
      const dx = Math.max(0, Math.abs(vx - hs.x) - hs.w / 2), dz = Math.max(0, Math.abs(vz - hs.z) - hs.d / 2);
      darken(j * HM_N + i, lerp(0.62, 1, smoothstep(0, m, Math.hypot(dx, dz))));
    }
  }
  col.needsUpdate = true;
}
