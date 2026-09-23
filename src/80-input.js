// ---------------------------------------------------------------------
// Einstellungen (localStorage nur als Komfort, mit try/catch)
// ---------------------------------------------------------------------
const settings = { sens: 1, quality: CONFIG.render.defaultQuality, touch: 'auto', invert: '0', autoSprint: '1' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('fat-settings') || '{}')); } catch (e) { /* ohne Speicher weiter */ }
function saveSettings() { try { localStorage.setItem('fat-settings', JSON.stringify(settings)); } catch (e) { /* ohne Speicher weiter */ } }

const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
function touchEnabled() { return settings.touch === 'an' || (settings.touch === 'auto' && isTouchDevice); }

// ---------------------------------------------------------------------
// Eingabe: Tastatur, Maus (Pointer Lock), Touch (Joystick + Wischen)
// ---------------------------------------------------------------------
const input = {
  keys: new Set(), pressed: new Set(),
  fireHeld: false, firePressed: false, adsHeld: false, adsToggle: false,
  joy: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
  lookId: null, lookX: 0, lookY: 0,
  btnLook: new Map(),
  touchJump: false, touchJumpHeld: false, touchCrouchToggle: false,
  wheel: 0,
};
let pointerLocked = false;

function lookDelta(dx, dy, sens) {
  if (!player) return;
  const inv = settings.invert === '1' ? -1 : 1;
  const ads = player.ads ? CONFIG.input.adsSensitivity * (isScoped() ? 0.5 : 1) : 1;
  player.yaw -= dx * sens * settings.sens * ads;
  player.pitch = clamp(player.pitch - dy * sens * settings.sens * inv * ads, CONFIG.camera.pitchMin, CONFIG.camera.pitchMax);
}

window.addEventListener('keydown', (e) => {
  if (gameState === 'playing' && ['F3', 'Tab', 'Space', 'KeyM'].includes(e.code)) e.preventDefault();
  if (gameState !== 'playing') {
    if (gameState === 'paused' && e.code === 'KeyP') resumeGame();
    return;
  }
  if (!e.repeat) input.pressed.add(e.code);
  input.keys.add(e.code);
  if (e.code === 'KeyP' || e.code === 'Escape') pauseGame();
});
window.addEventListener('keyup', (e) => { input.keys.delete(e.code); });
window.addEventListener('blur', () => { input.keys.clear(); input.fireHeld = false; input.adsHeld = false; });

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === document.body;
  if (!pointerLocked && gameState === 'playing' && !touchEnabled()) pauseGame();
});
document.addEventListener('mousemove', (e) => {
  if (pointerLocked && gameState === 'playing') lookDelta(e.movementX || 0, e.movementY || 0, CONFIG.input.mouseSensitivity);
});
window.addEventListener('wheel', (e) => { if (gameState === 'playing') input.wheel += Math.sign(e.deltaY); }, { passive: true });
window.addEventListener('mouseup', (e) => { if (e.button === 0) input.fireHeld = false; if (e.button === 2) input.adsHeld = false; });

const touchLayer = $('touchLayer');
const joyBase = $('joyBase'), joyKnob = $('joyKnob');
document.addEventListener('contextmenu', (e) => e.preventDefault());
touchLayer.addEventListener('pointerdown', (e) => {
  if (gameState !== 'playing') return;
  if (e.pointerType === 'mouse') {
    if (!pointerLocked && document.body.requestPointerLock) { document.body.requestPointerLock(); return; }
    if (e.button === 0) { input.fireHeld = true; input.firePressed = true; }
    if (e.button === 2) input.adsHeld = true;
    return;
  }
  e.preventDefault();
  const zone = window.innerWidth * CONFIG.input.joystickZone;
  if (e.clientX < zone && input.joy.id === null) {
    input.joy.id = e.pointerId; input.joy.ox = e.clientX; input.joy.oy = e.clientY; input.joy.x = 0; input.joy.y = 0;
    joyBase.style.left = e.clientX + 'px'; joyBase.style.top = e.clientY + 'px';
    joyKnob.style.left = '60px'; joyKnob.style.top = '60px';
    joyBase.classList.remove('hidden');
  } else if (input.lookId === null) {
    input.lookId = e.pointerId; input.lookX = e.clientX; input.lookY = e.clientY;
  }
  try { touchLayer.setPointerCapture(e.pointerId); } catch (err) { /* ältere Safari */ }
});
touchLayer.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') return;
  if (e.pointerId === input.joy.id) {
    const R = CONFIG.input.joystickRadius;
    let dx = e.clientX - input.joy.ox, dy = e.clientY - input.joy.oy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx *= R / len; dy *= R / len; }
    input.joy.x = dx / R; input.joy.y = dy / R;
    joyKnob.style.left = (60 + dx) + 'px'; joyKnob.style.top = (60 + dy) + 'px';
  } else if (e.pointerId === input.lookId) {
    lookDelta(e.clientX - input.lookX, e.clientY - input.lookY, CONFIG.input.touchSensitivity);
    input.lookX = e.clientX; input.lookY = e.clientY;
  }
});
function endPointer(e) {
  if (e.pointerType === 'mouse') return;
  if (e.pointerId === input.joy.id) { input.joy.id = null; input.joy.x = 0; input.joy.y = 0; joyBase.classList.add('hidden'); }
  if (e.pointerId === input.lookId) input.lookId = null;
}
touchLayer.addEventListener('pointerup', endPointer);
touchLayer.addEventListener('pointercancel', endPointer);

// Touch-Knöpfe (Schießknöpfe drehen beim Ziehen zusätzlich die Kamera)
function bindButton(el) {
  const name = el.dataset.btn;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    el.classList.add('down');
    initAudio();
    if (name === 'menu') { if (gameState === 'playing') pauseGame(); return; }
    if (gameState !== 'playing') return;
    if (name === 'action' || name === 'fire2') { input.fireHeld = true; input.firePressed = true; input.btnLook.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
    else if (name === 'jump') { input.touchJump = true; input.touchJumpHeld = true; }
    else if (name === 'crouch') input.touchCrouchToggle = true;
    else if (name === 'build') input.pressed.add('KeyQ');
    else if (name === 'debug') input.pressed.add('F3');
    else if (name === 'reload') input.pressed.add('KeyR');
    else if (name === 'interact') input.pressed.add('KeyE');
    else if (name === 'ads') input.adsToggle = !input.adsToggle;
    else if (name === 'map') input.pressed.add('KeyM');
    else if (name === 'pickaxe') input.pressed.add('KeyF');
    else if (name.startsWith('slot')) input.pressed.add('Slot' + name.slice(4));
    else if (PIECES.includes(name)) input.pressed.add('Digit' + (PIECES.indexOf(name) + 1));
  });
  el.addEventListener('pointermove', (e) => {
    const p = input.btnLook.get(e.pointerId);
    if (!p || gameState !== 'playing') return;
    lookDelta(e.clientX - p.x, e.clientY - p.y, CONFIG.input.touchSensitivity);
    p.x = e.clientX; p.y = e.clientY;
  });
  const up = (e) => {
    e.preventDefault(); el.classList.remove('down');
    input.btnLook.delete(e.pointerId);
    if (name === 'action' || name === 'fire2') input.fireHeld = input.btnLook.size > 0;
    if (name === 'jump') input.touchJumpHeld = false;
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}
document.querySelectorAll('[data-btn]').forEach(bindButton);

// iOS: Zoom-/Scroll-Gesten unterdrücken
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (!e.target.closest || !e.target.closest('.panel, .lpanel, input')) e.preventDefault(); }, { passive: false });

// ---------------------------------------------------------------------
// Eingabe pro Tick in Befehle für den Spieler übersetzen
// ---------------------------------------------------------------------
let crouchToggled = false;
function samplePlayerInput() {
  const k = input.keys, c = player.cmd;
  let mx = 0, mz = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
  let sprint = k.has('ShiftLeft') || k.has('ShiftRight');
  const j = input.joy;
  if (j.id !== null) {
    const len = Math.hypot(j.x, j.y);
    if (len > CONFIG.input.deadZone) { mx += j.x; mz += j.y; }
    if (len >= CONFIG.input.sprintThreshold) sprint = true;
  }
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  if (settings.autoSprint === '1' && j.id === null && mz < -0.5) sprint = true;
  c.mx = mx; c.mz = mz; c.sprint = sprint;
  c.jump = k.has('Space') || input.touchJump || input.touchJumpHeld;
  if (input.pressed.has('KeyC') || input.touchCrouchToggle) { crouchToggled = !crouchToggled; $('btnCrouch').classList.toggle('on', crouchToggled); }
  c.crouch = crouchToggled || k.has('ControlLeft') || k.has('ControlRight');
  if (c.jump && crouchToggled && player.onGround) { crouchToggled = false; c.crouch = false; $('btnCrouch').classList.remove('on'); }
}

function endInputTick() {
  input.pressed.clear();
  input.firePressed = false;
  input.touchJump = false;
  input.touchCrouchToggle = false;
  input.wheel = 0;
}
