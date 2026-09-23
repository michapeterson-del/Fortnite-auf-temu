// ---------------------------------------------------------------------
// Sturm: schrumpfender Kreis in Phasen, Schaden außerhalb (ignoriert Schild)
// ---------------------------------------------------------------------
const storm = {
  cx: 0, cz: 0, r: CONFIG.storm.startRadius,
  fromX: 0, fromZ: 0, fromR: CONFIG.storm.startRadius,
  toX: 0, toZ: 0, toR: CONFIG.storm.startRadius,
  phase: -1, stage: 'wait', timer: 0, dmg: 0, tickTimer: 0, active: false,
  mesh: null,
};

function stormMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform float time; varying vec2 vUv; varying vec3 vPos;',
      'void main(){',
      '  float w = sin(vUv.x * 120.0 + time * 1.5) * 0.5 + 0.5;',
      '  float w2 = sin(vUv.y * 40.0 - time * 2.0 + vUv.x * 60.0) * 0.5 + 0.5;',
      '  float a = 0.2 + w * 0.1 + w2 * 0.08;',
      '  a *= smoothstep(0.0, 0.03, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));',
      '  gl_FragColor = vec4(mix(vec3(0.45, 0.15, 0.85), vec3(0.8, 0.5, 1.0), w * w2), a);',
      '}',
    ].join('\n'),
    transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
  });
}

function initStorm() {
  const geo = new THREE.CylinderGeometry(1, 1, CONFIG.storm.height, 96, 1, true);
  geo.translate(0, CONFIG.storm.height / 2 - 60, 0);
  storm.mesh = new THREE.Mesh(geo, stormMaterial());
  storm.mesh.frustumCulled = false;
  storm.mesh.renderOrder = 8;
  scene.add(storm.mesh);
  storm.active = true;
  storm.phase = -1;
  nextStormPhase();
}

function pickNextCircle(r) {
  for (let t = 0; t < 40; t++) {
    const maxOff = Math.max(0, storm.r - r);
    const ang = Math.random() * Math.PI * 2, dist = Math.sqrt(Math.random()) * maxOff;
    const x = storm.cx + Math.cos(ang) * dist, z = storm.cz + Math.sin(ang) * dist;
    if (r < 1 || getHeight(x, z) > W.waterLevel + 1) return { x, z };
  }
  return { x: storm.cx, z: storm.cz };
}

function nextStormPhase() {
  storm.phase++;
  const ph = CONFIG.storm.phases[storm.phase];
  storm.fromX = storm.cx; storm.fromZ = storm.cz; storm.fromR = storm.r;
  if (!ph) {
    storm.stage = 'final'; storm.dmg = CONFIG.storm.finalDamage; storm.toR = storm.r;
    return;
  }
  storm.toR = storm.phase === 0 ? HALF * ph.factor : storm.r * ph.factor;
  const c = pickNextCircle(storm.toR);
  storm.toX = c.x; storm.toZ = c.z;
  storm.stage = 'wait';
  storm.timer = ph.wait;
  storm.dmg = storm.phase === 0 ? 0 : CONFIG.storm.phases[storm.phase - 1].dmg;
  if (storm.phase > 0) announce('Sturm hat sich geschlossen – neuer Kreis markiert');
}

function inStormSafe(x, z) { return Math.hypot(x - storm.cx, z - storm.cz) <= storm.r; }
function inNextCircle(x, z, margin) { return Math.hypot(x - storm.toX, z - storm.toZ) <= storm.toR - (margin || 0); }

function updateStorm(dt) {
  if (!storm.active) return;
  const ph = CONFIG.storm.phases[storm.phase];
  if (storm.stage === 'wait') {
    storm.timer -= dt;
    if (storm.timer <= 0) {
      storm.stage = 'shrink'; storm.timer = ph.shrink;
      storm.dmg = ph.dmg;
      announce('Der Sturm zieht sich zusammen!');
    }
  } else if (storm.stage === 'shrink') {
    storm.timer -= dt;
    const k = 1 - Math.max(0, storm.timer) / ph.shrink;
    storm.cx = lerp(storm.fromX, storm.toX, k); storm.cz = lerp(storm.fromZ, storm.toZ, k);
    storm.r = lerp(storm.fromR, storm.toR, k);
    if (storm.timer <= 0) nextStormPhase();
  }
  // Schaden 1× pro Sekunde
  storm.tickTimer += dt;
  if (storm.tickTimer >= CONFIG.storm.tickInterval) {
    storm.tickTimer -= CONFIG.storm.tickInterval;
    const dmg = Math.max(1, storm.dmg);
    for (const a of actors) {
      if (!a.alive || a.phase === 'bus') continue;
      if (!inStormSafe(a.pos.x, a.pos.z)) applyDamage(a, dmg, null, 'storm');
    }
  }
}

function renderStorm() {
  if (!storm.mesh) return;
  // Solange der Kreis noch außerhalb der Insel liegt, bleibt die Wand unsichtbar
  storm.mesh.visible = storm.r < HALF * 1.1;
  storm.mesh.position.set(storm.cx, 0, storm.cz);
  const r = Math.max(0.5, storm.r);
  storm.mesh.scale.set(r, 1, r);
  storm.mesh.material.uniforms.time.value = gameTime;
}

function stormStatusText() {
  if (!storm.active) return '';
  const t = Math.max(0, Math.ceil(storm.timer));
  const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
  if (storm.stage === 'wait') return 'Sturm schließt in ' + mm + ':' + ss;
  if (storm.stage === 'shrink') return 'Sturm zieht zu: ' + mm + ':' + ss;
  return 'Letzter Kreis';
}
