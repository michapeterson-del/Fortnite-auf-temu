// ---------------------------------------------------------------------
// Nachbearbeitung: HDR-Szene (mit MSAA) → Bloom (2 Stufen) → Tonemapping,
// Farbkorrektur und Vignette. Auf „Niedrig“ wird direkt gerendert.
// „Ultra“ nutzt zusätzlich den Tiefenpuffer: Umgebungsverdeckung (SSAO)
// in halber Auflösung und Sonnenstrahlen (God Rays) als radiale Unschärfe.
// ---------------------------------------------------------------------
const post = {
  enabled: false, samples: 4, w: 0, h: 0,
  rtScene: null, rtHalf: null, rtQa: null, rtQb: null, rtEa: null, rtEb: null,
  quad: null, fsScene: new THREE.Scene(), fsCam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
  brightMat: null, blurMat: null, compMat: null,
  ultra: false, rtAo: null, rtAo2: null, rtRays: null, rtRays2: null, aoMat: null, aoBlurMat: null, rayMaskMat: null, rayMat: null, ultraOk: true,
  rtDa: null, rtDb: null, rtDc: null, rtDd: null, dof: 0, dofFocus: 10, dofRange: 8,
  grade: { saturation: 1.08, contrast: 1.06, warmth: 0.0, vignette: 0.32, bloom: 0.55 },
};

const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

function postTexType() {
  const ext = renderer.extensions;
  return renderer.capabilities.isWebGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')) ? THREE.HalfFloatType : THREE.UnsignedByteType;
}

function initPost() {
  const type = postTexType();
  const mk = (samples) => new THREE.WebGLRenderTarget(4, 4, { type, samples: samples || 0, depthBuffer: !!samples, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  post.rtScene = mk(post.samples);
  post.rtScene.depthBuffer = true;
  // Tiefe als Textur (für SSAO und Sonnenstrahlen); MSAA-Tiefe wird beim Auflösen mitkopiert
  post.rtScene.depthTexture = new THREE.DepthTexture(4, 4);
  post.rtScene.depthTexture.type = THREE.UnsignedIntType;
  const mk8 = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  post.rtAo = mk8(); post.rtAo2 = mk8(); post.rtRays = mk8(); post.rtRays2 = mk8();
  post.rtDa = mk(); post.rtDb = mk(); post.rtDc = mk(); post.rtDd = mk();
  const U = CONFIG.render.ultra;
  // Tiefe → Blickraum-Position
  const VIEWPOS = [
    'uniform sampler2D tDepth; uniform mat4 projInv;',
    'vec3 viewPos(vec2 uv){ float z = texture2D(tDepth, uv).x; vec4 p = projInv * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0); return p.xyz / p.w; }',
  ].join('\n');
  post.aoMat = new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, proj: { value: new THREE.Matrix4() }, texel: { value: new THREE.Vector2() }, radius: { value: U.aoRadius }, power: { value: U.aoPower } },
    vertexShader: FS_VERT,
    fragmentShader: [
      VIEWPOS,
      'uniform mat4 proj; uniform vec2 texel; uniform float radius; uniform float power; varying vec2 vUv;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main(){',
      '  float z = texture2D(tDepth, vUv).x;',
      '  if (z > 0.99999) { gl_FragColor = vec4(1.0); return; }',
      '  vec3 P = viewPos(vUv);',
      '  vec3 px = viewPos(vUv + vec2(texel.x, 0.0)) - P, nx = P - viewPos(vUv - vec2(texel.x, 0.0));',
      '  vec3 py = viewPos(vUv + vec2(0.0, texel.y)) - P, ny = P - viewPos(vUv - vec2(0.0, texel.y));',
      '  vec3 N = normalize(cross(abs(px.z) < abs(nx.z) ? px : nx, abs(py.z) < abs(ny.z) ? py : ny));',
      '  float r = radius * (1.0 + clamp(-P.z / 60.0, 0.0, 2.0));',
      '  vec4 c = proj * vec4(P + vec3(r, 0.0, 0.0), 1.0); float sr = abs(c.x / c.w * 0.5 - (proj * vec4(P, 1.0)).x / (proj * vec4(P, 1.0)).w * 0.5);',
      '  float ang = hash(vUv * 731.0) * 6.2831853, occ = 0.0;',
      '  for (int i = 0; i < 12; i++) {',
      '    float fi = float(i) + 0.5; float rr = sqrt(fi / 12.0) * sr;',
      '    float a = ang + fi * 2.39996;',
      '    vec3 S = viewPos(vUv + vec2(cos(a), sin(a)) * rr);',
      '    vec3 v = S - P; float d2 = dot(v, v);',
      '    occ += max(0.0, dot(v, N) - 0.02 * -P.z) / (d2 + 0.05) * max(0.0, 1.0 - d2 / (r * r * 4.0));',
      '  }',
      '  float ao = clamp(1.0 - occ / 12.0 * 2.2, 0.0, 1.0);',
      '  gl_FragColor = vec4(vec3(pow(ao, power)), 1.0); }',
    ].join('\n'),
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  // tiefenabhängige Unschärfe, damit AO nicht über Kanten läuft
  post.aoBlurMat = new THREE.ShaderMaterial({
    uniforms: { tAo: { value: null }, tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, dir: { value: new THREE.Vector2() } },
    vertexShader: FS_VERT,
    fragmentShader: [
      VIEWPOS,
      'uniform sampler2D tAo; uniform vec2 dir; varying vec2 vUv;',
      'void main(){ float z0 = -viewPos(vUv).z; float s = 0.0, w = 0.0;',
      '  for (int i = -3; i <= 3; i++) { vec2 uv = vUv + dir * float(i);',
      '    float zi = -viewPos(uv).z; float wi = exp(-abs(zi - z0) / (0.05 * z0 + 0.1)) * (1.0 - abs(float(i)) / 4.5);',
      '    s += texture2D(tAo, uv).r * wi; w += wi; }',
      '  gl_FragColor = vec4(vec3(s / max(w, 1e-4)), 1.0); }',
    ].join('\n'),
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  // Sonnenstrahlen: Himmel nahe der Sonne hell, alles Verdeckende schwarz …
  post.rayMaskMat = new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: null }, tScene: { value: null }, sunUv: { value: new THREE.Vector2() }, aspect: { value: 1 } },
    vertexShader: FS_VERT,
    fragmentShader: [
      'uniform sampler2D tDepth; uniform sampler2D tScene; uniform vec2 sunUv; uniform float aspect; varying vec2 vUv;',
      'void main(){ float sky = step(0.99999, texture2D(tDepth, vUv).x);',
      '  vec2 d = vUv - sunUv; d.x *= aspect; float g = exp(-dot(d, d) * 9.0);',
      '  vec3 c = min(texture2D(tScene, vUv).rgb, vec3(3.0));',
      '  gl_FragColor = vec4(c * sky * g, 1.0); }',
    ].join('\n'),
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  // … dann radial zur Sonne hin verwischen
  post.rayMat = new THREE.ShaderMaterial({
    uniforms: { tMask: { value: null }, sunUv: { value: new THREE.Vector2() }, len: { value: 0.5 } },
    vertexShader: FS_VERT,
    fragmentShader: [
      'uniform sampler2D tMask; uniform vec2 sunUv; uniform float len; varying vec2 vUv;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main(){ vec2 step = (sunUv - vUv) * len / 32.0; vec2 uv = vUv + step * hash(vUv * 517.0);',
      '  vec3 s = vec3(0.0); float w = 1.0;',
      '  for (int i = 0; i < 32; i++) { s += texture2D(tMask, uv).rgb * w; w *= 0.96; uv += step; }',
      '  gl_FragColor = vec4(s / 14.0, 1.0); }',
    ].join('\n'),
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  post.rtHalf = mk(); post.rtQa = mk(); post.rtQb = mk(); post.rtEa = mk(); post.rtEb = mk();
  post.brightMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, threshold: { value: 0.9 }, knee: { value: 0.6 } },
    vertexShader: FS_VERT,
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float threshold; uniform float knee; varying vec2 vUv;',
      'void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(max(c.r, c.g), c.b);',
      '  float w = smoothstep(threshold, threshold + knee, l); gl_FragColor = vec4(c * w, 1.0); }',
    ].join('\n'),
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  post.blurMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) } },
    vertexShader: FS_VERT,
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;',
      'void main(){',
      '  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;',
      '  c += texture2D(tDiffuse, vUv + dir * 1.3846153846).rgb * 0.3162162162;',
      '  c += texture2D(tDiffuse, vUv - dir * 1.3846153846).rgb * 0.3162162162;',
      '  c += texture2D(tDiffuse, vUv + dir * 3.2307692308).rgb * 0.0702702703;',
      '  c += texture2D(tDiffuse, vUv - dir * 3.2307692308).rgb * 0.0702702703;',
      '  gl_FragColor = vec4(c, 1.0); }',
    ].join('\n'),
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  post.compMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null }, tBloom1: { value: null }, tBloom2: { value: null },
      tAo: { value: null }, tRays: { value: null }, aoAmount: { value: 0 }, rays: { value: 0 }, rayColor: { value: new THREE.Color(1, 0.9, 0.7) },
      tDof: { value: null }, tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, dof: { value: 0 }, dofFocus: { value: 10 }, dofRange: { value: 8 },
      bloom: { value: post.grade.bloom }, saturation: { value: post.grade.saturation }, contrast: { value: post.grade.contrast },
      warmth: { value: 0 }, vignette: { value: post.grade.vignette }, tint: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: FS_VERT,
    fragmentShader: [
      'uniform sampler2D tScene; uniform sampler2D tBloom1; uniform sampler2D tBloom2; uniform sampler2D tAo; uniform sampler2D tRays;',
      'uniform float aoAmount; uniform float rays; uniform vec3 rayColor;',
      'uniform sampler2D tDof; uniform sampler2D tDepth; uniform mat4 projInv; uniform float dof; uniform float dofFocus; uniform float dofRange;',
      'uniform float bloom; uniform float saturation; uniform float contrast; uniform float warmth; uniform float vignette; uniform vec3 tint; varying vec2 vUv;',
      'void main(){',
      '  vec3 c = texture2D(tScene, vUv).rgb;',
      '  if (aoAmount > 0.0) c *= mix(1.0, texture2D(tAo, vUv).r, aoAmount);',
      '  if (dof > 0.0) { float z = texture2D(tDepth, vUv).x; vec4 vp = projInv * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0); float d = -vp.z / vp.w;',
      '    float coc = clamp((abs(d - dofFocus) - dofRange * 0.25) / dofRange, 0.0, 1.0) * dof; c = mix(c, texture2D(tDof, vUv).rgb, coc); }',
      '  if (rays > 0.0) c += texture2D(tRays, vUv).rgb * rayColor * rays;',
      '  c += (texture2D(tBloom1, vUv).rgb * 0.6 + texture2D(tBloom2, vUv).rgb * 0.8) * bloom;',
      '  c *= tint;',
      '  c.r *= 1.0 + warmth * 0.08; c.b *= 1.0 - warmth * 0.08;',
      '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
      '  c = mix(vec3(l), c, saturation);',
      '  c = max(vec3(0.0), (c - 0.18) * contrast + 0.18);',
      '  vec2 d = vUv - 0.5; c *= 1.0 - vignette * dot(d, d) * 1.6;',
      '  gl_FragColor = vec4(c, 1.0);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
    depthTest: false, depthWrite: false,
  });
  post.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post.compMat);
  post.quad.frustumCulled = false;
  post.fsScene.add(post.quad);
}

const _pdb = new THREE.Vector2();
function resizePost() {
  if (!post.rtScene) return;
  renderer.getDrawingBufferSize(_pdb);
  const w = Math.max(4, _pdb.x), h = Math.max(4, _pdb.y);
  if (w === post.w && h === post.h) return;
  post.w = w; post.h = h;
  post.rtScene.setSize(w, h);
  post.rtHalf.setSize(w >> 1, h >> 1);
  post.rtQa.setSize(w >> 2, h >> 2); post.rtQb.setSize(w >> 2, h >> 2);
  post.rtEa.setSize(w >> 3, h >> 3); post.rtEb.setSize(w >> 3, h >> 3);
  post.rtAo.setSize(w >> 1, h >> 1); post.rtAo2.setSize(w >> 1, h >> 1);
  post.rtRays.setSize(w >> 2, h >> 2); post.rtRays2.setSize(w >> 2, h >> 2);
  post.rtDa.setSize(w >> 1, h >> 1); post.rtDb.setSize(w >> 1, h >> 1);
  post.rtDc.setSize(w >> 2, h >> 2); post.rtDd.setSize(w >> 2, h >> 2);
}

// Tiefenunschärfe (Lobby-Porträt, Zielen): unscharfe Kopie der Szene,
// im Endbild je nach Abstand zur Schärfeebene eingeblendet
function dofPass() {
  const cu = post.compMat.uniforms;
  if (post.dof < 0.01) { cu.dof.value = 0; return; }
  blurPass(post.rtScene, post.rtDa, post.rtDb);
  blurPass(post.rtDb, post.rtDc, post.rtDd);
  blurPass(post.rtDd, post.rtDc, post.rtDd);
  cu.tDof.value = post.rtDd.texture; cu.tDepth.value = post.rtScene.depthTexture;
  cu.projInv.value.copy(camera.projectionMatrixInverse);
  cu.dof.value = post.dof; cu.dofFocus.value = post.dofFocus; cu.dofRange.value = post.dofRange;
}

// SSAO und Sonnenstrahlen (nur Ultra)
const _sunNdc = new THREE.Vector3();
function ultraPasses() {
  const U = CONFIG.render.ultra, cu = post.compMat.uniforms;
  const depth = post.rtScene.depthTexture;
  // Umgebungsverdeckung
  const a = post.aoMat.uniforms;
  a.tDepth.value = depth; a.projInv.value.copy(camera.projectionMatrixInverse); a.proj.value.copy(camera.projectionMatrix);
  a.texel.value.set(2 / post.w, 2 / post.h);
  fsPass(post.aoMat, post.rtAo);
  const b = post.aoBlurMat.uniforms;
  b.tDepth.value = depth; b.projInv.value.copy(camera.projectionMatrixInverse);
  b.tAo.value = post.rtAo.texture; b.dir.value.set(2 / post.w, 0);
  fsPass(post.aoBlurMat, post.rtAo2);
  b.tAo.value = post.rtAo2.texture; b.dir.value.set(0, 2 / post.h);
  fsPass(post.aoBlurMat, post.rtAo);
  cu.tAo.value = post.rtAo.texture; cu.aoAmount.value = U.aoStrength;
  // Sonnenstrahlen, wenn die Sonne vor uns steht
  _sunNdc.copy(camera.position).addScaledVector(SUN_DIR, 500).project(camera);
  camera.getWorldDirection(_rayDir);
  const facing = _rayDir.dot(SUN_DIR);
  const fade = smoothstep(0.1, 0.55, facing) * (1 - smoothstep(1.3, 2.2, Math.max(Math.abs(_sunNdc.x), Math.abs(_sunNdc.y))));
  if (fade > 0.01) {
    const su = _sunNdc.x * 0.5 + 0.5, sv = _sunNdc.y * 0.5 + 0.5;
    const m = post.rayMaskMat.uniforms;
    m.tDepth.value = depth; m.tScene.value = post.rtScene.texture; m.sunUv.value.set(su, sv); m.aspect.value = post.w / post.h;
    fsPass(post.rayMaskMat, post.rtRays);
    const r = post.rayMat.uniforms;
    r.tMask.value = post.rtRays.texture; r.sunUv.value.set(su, sv); r.len.value = U.rayLength;
    fsPass(post.rayMat, post.rtRays2);
    cu.tRays.value = post.rtRays2.texture; cu.rays.value = U.rays * fade;
    cu.rayColor.value.copy(sun.color);
  } else cu.rays.value = 0;
}
const _rayDir = new THREE.Vector3();

function fsPass(mat, target) {
  post.quad.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(post.fsScene, post.fsCam);
}

function blurPass(src, tmp, dst) {
  const b = post.blurMat;
  b.uniforms.tDiffuse.value = src.texture; b.uniforms.dir.value.set(1 / src.width, 0);
  fsPass(b, tmp);
  b.uniforms.tDiffuse.value = tmp.texture; b.uniforms.dir.value.set(0, 1 / tmp.height);
  fsPass(b, dst);
}

// Ersetzt renderer.render(scene, camera)
function renderFrame() {
  if (!post.enabled) {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return;
  }
  resizePost();
  renderer.setRenderTarget(post.rtScene);
  renderer.render(scene, camera);
  post.brightMat.uniforms.tDiffuse.value = post.rtScene.texture;
  fsPass(post.brightMat, post.rtHalf);
  if (post.ultra) { ultraPasses(); dofPass(); }
  else { post.compMat.uniforms.aoAmount.value = 0; post.compMat.uniforms.rays.value = 0; post.compMat.uniforms.dof.value = 0; }
  blurPass(post.rtHalf, post.rtQa, post.rtQb);
  blurPass(post.rtQb, post.rtEa, post.rtEb);
  const u = post.compMat.uniforms;
  u.tScene.value = post.rtScene.texture; u.tBloom1.value = post.rtQb.texture; u.tBloom2.value = post.rtEb.texture;
  fsPass(post.compMat, null);
}
