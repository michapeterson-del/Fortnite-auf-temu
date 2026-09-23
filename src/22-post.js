// ---------------------------------------------------------------------
// Nachbearbeitung: HDR-Szene (mit MSAA) → Bloom (2 Stufen) → Tonemapping,
// Farbkorrektur und Vignette. Auf „Niedrig“ wird direkt gerendert.
// ---------------------------------------------------------------------
const post = {
  enabled: false, samples: 4, w: 0, h: 0,
  rtScene: null, rtHalf: null, rtQa: null, rtQb: null, rtEa: null, rtEb: null,
  quad: null, fsScene: new THREE.Scene(), fsCam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
  brightMat: null, blurMat: null, compMat: null,
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
      bloom: { value: post.grade.bloom }, saturation: { value: post.grade.saturation }, contrast: { value: post.grade.contrast },
      warmth: { value: 0 }, vignette: { value: post.grade.vignette }, tint: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: FS_VERT,
    fragmentShader: [
      'uniform sampler2D tScene; uniform sampler2D tBloom1; uniform sampler2D tBloom2;',
      'uniform float bloom; uniform float saturation; uniform float contrast; uniform float warmth; uniform float vignette; uniform vec3 tint; varying vec2 vUv;',
      'void main(){',
      '  vec3 c = texture2D(tScene, vUv).rgb;',
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
}

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
  blurPass(post.rtHalf, post.rtQa, post.rtQb);
  blurPass(post.rtQb, post.rtEa, post.rtEb);
  const u = post.compMat.uniforms;
  u.tScene.value = post.rtScene.texture; u.tBloom1.value = post.rtQb.texture; u.tBloom2.value = post.rtEb.texture;
  fsPass(post.compMat, null);
}
