// ---------------------------------------------------------------------
// Realistische Figuren: eingebettetes Mixamo-Modell (Soldat) mit
// Motion-Capture-Animationen (Stehen/Gehen/Rennen). Alles, was es nicht als
// Animation gibt (Zielen, Ducken, Springen, Gleiten, Heilen, Spitzhacke,
// Umfallen), wird per eigener Zwei-Knochen-IK auf das Skelett gerechnet.
// Fällt auf die Baukasten-Figur (52-character.js) zurück, wenn das Modell fehlt.
// ---------------------------------------------------------------------
const ASSETS = { soldier: null, hdr: {} };

function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

async function loadAssets() {
  const A = window.THREE_ADDONS, src = window.__ASSETS;
  if (!A || !src) return;
  if (src.soldier) {
    const gl = new A.GLTFLoader();
    ASSETS.soldier = await new Promise((res, rej) => gl.parse(b64ToArrayBuffer(src.soldier), '', res, rej));
  }
  const exr = new A.EXRLoader();
  exr.setDataType(THREE.HalfFloatType);
  for (const k of ['hdriPark', 'hdriDawn', 'hdriSunset']) {
    if (!src[k]) continue;
    const d = exr.parse(b64ToArrayBuffer(src[k]));
    const t = new THREE.DataTexture(d.data, d.width, d.height, d.format, d.type);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.flipY = false;
    t.needsUpdate = true;
    ASSETS.hdr[k] = t;
  }
}

const RB = {
  hips: 'mixamorigHips', spine: 'mixamorigSpine1', chest: 'mixamorigSpine2', neck: 'mixamorigNeck', head: 'mixamorigHead',
  armL: 'mixamorigLeftArm', foreL: 'mixamorigLeftForeArm', handL: 'mixamorigLeftHand',
  armR: 'mixamorigRightArm', foreR: 'mixamorigRightForeArm', handR: 'mixamorigRightHand',
  legL: 'mixamorigLeftUpLeg', kneeL: 'mixamorigLeftLeg', footL: 'mixamorigLeftFoot',
  legR: 'mixamorigRightUpLeg', kneeR: 'mixamorigRightLeg', footR: 'mixamorigRightFoot',
};

function buildGlider(shirt) {
  const glider = new THREE.Group();
  const canopy = new THREE.Mesh(gliderGeo, new THREE.MeshStandardMaterial({ color: shirt, side: THREE.DoubleSide, roughness: 0.5 }));
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
  return glider;
}

const realMatCache = new Map();
function createRealCharacter(outfitIn) {
  const o = fullOutfit(outfitIn);
  const A = window.THREE_ADDONS;
  const root = A.SkeletonUtils.clone(ASSETS.soldier.scene);
  // das Modell schaut wie das Spiel nach -z
  const tint = new THREE.Color(0xffffff).lerp(new THREE.Color(o.shirt), 0.75);
  root.traverse((n) => {
    if (!n.isMesh) return;
    n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false;
    const key = n.material.name + '|' + (n.material.name.includes('Body') ? tint.getHexString() : '');
    let mat = realMatCache.get(key);
    if (!mat) {
      mat = n.material.clone();
      mat.roughness = n.material.name.includes('Visor') ? 0.25 : 0.62;
      mat.metalness = n.material.name.includes('Visor') ? 0.6 : 0.15;
      mat.envMapIntensity = 1.0;
      if (n.material.name.includes('Body')) mat.color.copy(tint);
      realMatCache.set(key, mat);
    }
    n.material = mat;
  });
  const g = new THREE.Group();
  g.add(root);
  const bones = {};
  for (const [k, name] of Object.entries(RB)) bones[k] = root.getObjectByName(name);
  const mixer = new THREE.AnimationMixer(root);
  const clips = ASSETS.soldier.animations;
  const act = (name) => { const c = THREE.AnimationClip.findByName(clips, name); const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); return a; };
  const actions = { idle: act('Idle'), walk: act('Walk'), run: act('Run') };
  actions.idle.setEffectiveWeight(1);
  const hand = new THREE.Group();
  g.add(hand);
  const glider = buildGlider(o.shirt);
  g.add(glider);
  return {
    real: true, group: g, root, bones, mixer, actions, hand, glider, held: null, heldKey: '',
    w: { idle: 1, walk: 0, run: 0 }, hipsBase: bones.hips.position.clone(), fall: 0, skip: 0,
  };
}

// --- Knochen-Werkzeuge (Weltkoordinaten) ---
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rc = new THREE.Vector3(), _rdd = new THREE.Vector3(), _re = new THREE.Vector3();
const _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _rq3 = new THREE.Quaternion();
function rotateBoneWorld(b, qWorld) {
  b.getWorldQuaternion(_rq2);
  b.parent.getWorldQuaternion(_rq3);
  _rq2.premultiply(qWorld);
  b.quaternion.copy(_rq3.invert().multiply(_rq2));
  b.updateMatrixWorld(true);
}
function aimBone(b, child, target) {
  b.getWorldPosition(_ra); child.getWorldPosition(_rb);
  _rb.sub(_ra).normalize();
  _rc.copy(target).sub(_ra).normalize();
  _rq.setFromUnitVectors(_rb, _rc);
  rotateBoneWorld(b, _rq);
}
const _ik = { s: new THREE.Vector3(), t: new THREE.Vector3(), e: new THREE.Vector3(), p: new THREE.Vector3() };
function twoBoneIK(upper, lower, end, target, pole) {
  upper.getWorldPosition(_ik.s); lower.getWorldPosition(_rdd); end.getWorldPosition(_re);
  const a = _ik.s.distanceTo(_rdd), b = _rdd.distanceTo(_re);
  _ik.t.copy(target).sub(_ik.s);
  const d = clamp(_ik.t.length(), 0.02, a + b - 0.002);
  _ik.t.normalize();
  const along = (a * a + d * d - b * b) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  _ik.p.copy(pole).sub(_ik.s);
  _ik.p.addScaledVector(_ik.t, -_ik.p.dot(_ik.t)).normalize();
  _ik.e.copy(_ik.s).addScaledVector(_ik.t, along).addScaledVector(_ik.p, h);
  aimBone(upper, lower, _ik.e);
  _ik.e.copy(_ik.s).addScaledVector(_ik.t, d);
  aimBone(lower, end, target.lengthSq() ? target : _ik.e);
}

// --- Animation pro Frame ---
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
const _aimQ = new THREE.Quaternion(), _aimE = new THREE.Euler(0, 0, 0, 'YXZ'), _gqC = new THREE.Quaternion(), _hp = new THREE.Vector3();
const _footL = new THREE.Vector3(), _footR = new THREE.Vector3();
const _frustum = new THREE.Frustum(), _pvm = new THREE.Matrix4(), _sph = new THREE.Sphere(new THREE.Vector3(), 1.4);
// einmal pro Bild vor den Figuren aufrufen
function updateCharFrustum() {
  camera.updateMatrixWorld();
  _pvm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pvm);
}

function setLocomotion(m, speed, dt, crouch) {
  const W0 = CONFIG.player.walkSpeed;
  let wi = 1 - smoothstep(0.15, 1.2, speed), wr = smoothstep(3.2, 5.2, speed), ww = Math.max(0, 1 - wi - wr);
  const k = 1 - Math.exp(-dt * 10);
  m.w.idle += (wi - m.w.idle) * k; m.w.walk += (ww - m.w.walk) * k; m.w.run += (wr - m.w.run) * k;
  m.actions.idle.setEffectiveWeight(m.w.idle);
  m.actions.walk.setEffectiveWeight(m.w.walk);
  m.actions.run.setEffectiveWeight(m.w.run);
  m.actions.walk.timeScale = clamp(speed / 1.6, 0.6, 2.2) * (crouch ? 0.8 : 1);
  m.actions.run.timeScale = clamp(speed / (W0 * 0.95), 0.7, 1.6);
}

function animateRealCharacter(a, pos, dt) {
  const m = a.model, g = m.group, B = m.bones;
  if (a.phase === 'bus') { g.visible = false; return; }
  g.visible = true;
  g.position.copy(pos);
  g.scale.set(1, 1, 1);
  // Umfallen: Figur kippt nach hinten, bleibt 5 s liegen
  if (a.phase === 'dead') {
    const t = gameTime - a.deathTime;
    if (t > 5) { g.visible = false; return; }
    const k = Math.min(1, t / 0.6);
    g.rotation.set(0, a.deathDir, 0);
    m.root.rotation.set(k * 1.45, 0, 0);
    m.root.position.y = k * 0.18;
    m.root.visible = true;
    m.glider.visible = false;
    setLocomotion(m, 0, dt, false);
    m.mixer.update(dt * (1 - k));
    return;
  }
  m.root.rotation.set(0, 0, 0); m.root.position.set(0, 0, 0);
  g.rotation.set(0, a.yaw, 0);
  m.glider.visible = a.phase === 'glide';
  updateHeldModel(a);
  const it = currentItem(a);
  const speed = Math.hypot(a.vel.x, a.vel.z);
  const air = a.phase === 'ground' && !a.onGround && Math.abs(a.vel.y) > 1.5;
  const freefall = a.phase === 'freefall', glide = a.phase === 'glide';
  setLocomotion(m, freefall || glide ? 0 : speed, dt, a.crouching);
  // Sichtbarkeit selbst prüfen (Skinned Meshes haben kein Frustum-Culling)
  const dist = Math.hypot(pos.x - camera.position.x, pos.z - camera.position.z);
  _sph.center.set(pos.x, pos.y + 0.9, pos.z);
  if (!_frustum.intersectsSphere(_sph)) { m.root.visible = false; m.skip += dt; return; }
  m.root.visible = true;
  // weit weg: seltener animieren, keine IK
  const far = dist > 60;
  m.skip += dt;
  if (far && m.skip < 1 / 15) return;
  m.mixer.update(m.skip);
  m.skip = 0;
  if (freefall) { m.root.rotation.x = -1.3; m.root.position.set(0, 0.9, 0.9); }
  m.root.updateMatrixWorld(true);
  // Richtungen
  const yaw = a.yaw, pitch = clamp(a.pitch, -1.2, 1.2);
  _f.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  _r.set(Math.cos(yaw), 0, -Math.sin(yaw));
  if (!far) {
    // Ducken: Hüfte runter, Füße bleiben am Boden (Bein-IK)
    if ((a.crouching || air) && !freefall && !glide) {
      B.footL.getWorldPosition(_footL); B.footR.getWorldPosition(_footR);
      const drop = a.crouching ? 0.42 : 0;
      B.hips.position.y = m.hipsBase.y - drop * 100 + (air ? 0 : 0);
      B.hips.updateMatrixWorld(true);
      if (air) { _footL.y += 0.35; _footR.y += 0.2; _footL.addScaledVector(_f, 0.1); }
      _t1.copy(pos).addScaledVector(_f, 2).addScaledVector(_u, 0.6);
      twoBoneIK(B.legL, B.kneeL, B.footL, _footL, _t1);
      twoBoneIK(B.legR, B.kneeR, B.footR, _footR, _t1);
      // Oberkörper leicht nach vorn
      _rq.setFromAxisAngle(_r, a.crouching ? -0.35 : -0.1);
      rotateBoneWorld(B.spine, _rq);
    }
    // Blick nach oben/unten: Brust neigen
    if (!freefall && !glide) { _rq.setFromAxisAngle(_r, pitch * 0.45); rotateBoneWorld(B.chest, _rq); }
    B.chest.getWorldPosition(_p1);
    B.armR.getWorldPosition(_p2);
    if (freefall) {
      B.armL.getWorldPosition(_t2);
      _t1.copy(_p2).addScaledVector(_r, 0.55).addScaledVector(_f, 0.15).addScaledVector(_u, 0.05);
      twoBoneIK(B.armR, B.foreR, B.handR, _t1, _t1.clone().addScaledVector(_u, -1));
      _t1.copy(_t2).addScaledVector(_r, -0.55).addScaledVector(_f, 0.15).addScaledVector(_u, 0.05);
      twoBoneIK(B.armL, B.foreL, B.handL, _t1, _t1.clone().addScaledVector(_u, -1));
    } else if (glide) {
      B.armL.getWorldPosition(_t2);
      _t1.copy(_p2).addScaledVector(_u, 0.52).addScaledVector(_r, 0.12);
      twoBoneIK(B.armR, B.foreR, B.handR, _t1, _p2.clone().addScaledVector(_r, 1));
      _t1.copy(_t2).addScaledVector(_u, 0.52).addScaledVector(_r, -0.12);
      twoBoneIK(B.armL, B.foreL, B.handL, _t1, _t2.clone().addScaledVector(_r, -1));
    } else if (a.healTimer > 0) {
      B.head.getWorldPosition(_t1);
      _t1.addScaledVector(_f, 0.22).addScaledVector(_u, -0.12 + Math.sin(gameTime * 10) * 0.02);
      twoBoneIK(B.armR, B.foreR, B.handR, _t1, _p2.clone().addScaledVector(_u, -1).addScaledVector(_r, 0.6));
    } else if (it && it.kind === 'weapon') {
      // Gewehr-Haltung: rechte Hand an der Brust, linke Hand vorne am Lauf
      const rec = a.recoil * 0.06;
      _t1.copy(_p1).addScaledVector(_r, 0.13).addScaledVector(_f, 0.3 - rec).addScaledVector(_u, 0.12);
      twoBoneIK(B.armR, B.foreR, B.handR, _t1, _p2.clone().addScaledVector(_u, -1).addScaledVector(_r, 0.5));
      B.armL.getWorldPosition(_t2);
      const reach = it.type === 'pistol' ? 0.05 : it.type === 'smg' ? 0.2 : 0.32;
      _p2.copy(_t1).addScaledVector(_f, reach).addScaledVector(_r, -0.06).addScaledVector(_u, -0.02);
      twoBoneIK(B.armL, B.foreL, B.handL, _p2, _t2.clone().addScaledVector(_u, -1).addScaledVector(_r, -0.5));
    } else if (a.swing > 0) {
      const s = Math.sin((a.swing / CONFIG.pickaxe.swingTime) * Math.PI);
      _t1.copy(_p2).addScaledVector(_u, 0.35 - 0.75 * s).addScaledVector(_f, 0.25 + 0.35 * s).addScaledVector(_r, -0.05);
      twoBoneIK(B.armR, B.foreR, B.handR, _t1, _p2.clone().addScaledVector(_u, -1).addScaledVector(_r, 0.8));
    }
  }
  // Gegenstand in der rechten Hand ausrichten (Weltlage → Gruppe)
  B.handR.getWorldPosition(_hp);
  g.worldToLocal(_hp);
  m.hand.position.copy(_hp);
  let hp = pitch;
  if (!(it && it.kind === 'weapon')) hp = a.swing > 0 ? 2.2 - 2.5 * (1 - a.swing / CONFIG.pickaxe.swingTime) : (it ? 0.2 : 1.3);
  _aimE.set(hp, 0, 0);
  m.hand.quaternion.setFromEuler(_aimE);
  if (m.held && !(it && it.kind === 'weapon')) m.hand.position.addScaledVector(_u, 0);
}

function animateRealLobby(m, t, dt) {
  setLocomotion(m, 0, dt, false);
  m.mixer.update(dt);
  m.root.rotation.set(0, 0, 0);
  m.root.updateMatrixWorld(true);
  m.bones.handR.getWorldPosition(_hp);
  m.group.worldToLocal(_hp);
  m.hand.position.copy(_hp);
  _aimE.set(1.3, 0, 0);
  m.hand.quaternion.setFromEuler(_aimE);
}
