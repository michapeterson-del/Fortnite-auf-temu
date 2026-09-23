// ---------------------------------------------------------------------
// Lobby: Figur auf einer Plattform im Himmel, Einstellungen für die Runde
// ---------------------------------------------------------------------
const SKINS = [
  { name: 'Blauer Blitz', outfit: { skin: 0xf1c9a5, shirt: 0x2f6fd6, pants: 0x2b2f3a, hair: 0x3b2a1a, pack: 0xffd23f } },
  { name: 'Feuerfuchs', outfit: { skin: 0xf5d7bd, shirt: 0xff6a2b, pants: 0x3a2a22, hair: 0xc9501a, pack: 0x2b2f3a } },
  { name: 'Dschungel', outfit: { skin: 0xc68c63, shirt: 0x3f8f3a, pants: 0x4a5a2a, hair: 0x1a1a1a, pack: 0x8a5a33 } },
  { name: 'Nachtschatten', outfit: { skin: 0xe0ac86, shirt: 0x2a2340, pants: 0x14121f, hair: 0x5a3b8a, pack: 0x9b59d9 } },
  { name: 'Goldjunge', outfit: { skin: 0x8d5a3b, shirt: 0xffc93c, pants: 0xf4f1ea, hair: 0x1a1a1a, pack: 0xffffff } },
  { name: 'Zuckerwatte', outfit: { skin: 0xf1c9a5, shirt: 0xff8fc8, pants: 0x8fd8ff, hair: 0xffe14d, pack: 0xb28dff } },
];
const DIFF_HINTS = {
  leicht: 'Bots zielen schlecht und reagieren langsam – gut zum Üben.',
  mittel: 'Ausgeglichen: Bots treffen ordentlich und bauen manchmal.',
  schwer: 'Bots zielen genau, reagieren schnell und bauen oft Deckung.',
  gemischt: 'Jeder Bot bekommt zufällig eine Stärke – wie in einer echten Runde.',
};
const LOBBY_POS = new THREE.Vector3(0, 460, 0);

const lobby = {
  difficulty: 'mittel', bots: CONFIG.match.players - 1, skin: 0, name: 'Du', tod: 'dynamisch',
  stats: { games: 0, wins: 0, kills: 0 },
  stage: null, ring: null, t: 0, searching: false,
};
try { Object.assign(lobby, JSON.parse(localStorage.getItem('fat-lobby') || '{}')); } catch (e) { /* ohne Speicher weiter */ }
lobby.searching = false;
function saveLobby() {
  try {
    localStorage.setItem('fat-lobby', JSON.stringify({ difficulty: lobby.difficulty, bots: lobby.bots, skin: lobby.skin, name: lobby.name, tod: lobby.tod, stats: lobby.stats }));
  } catch (e) { /* ohne Speicher weiter */ }
}

function buildLobbyStage() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.6, 32), texMat('stone', 0xd8dde6));
  top.position.y = -0.3; top.receiveShadow = true;
  g.add(top);
  const under = new THREE.Mesh(new THREE.ConeGeometry(3.6, 3.5, 32), texMat('stone', 0x9aa3b5));
  under.position.y = -2.35; under.rotation.x = Math.PI;
  g.add(under);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.08, 8, 48), glowMat(0x3fa9ff, 0.9));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.02;
  g.add(ring);
  const beam = new THREE.Mesh(beamGeo, glowMat(0x3fa9ff, 0.12));
  beam.scale.set(8, 1.2, 8); beam.position.y = -6;
  g.add(beam);
  g.position.copy(LOBBY_POS);
  scene.add(g);
  lobby.stage = g; lobby.ring = ring;
}

function applySkin(idx) {
  lobby.skin = (idx + SKINS.length) % SKINS.length;
  if (!player) return;
  scene.remove(player.model.group);
  player.model = createCharacterMesh(SKINS[lobby.skin].outfit);
  scene.add(player.model.group);
}

// Figur und Kamera in der Lobby
function renderLobby(dt) {
  lobby.t += dt;
  const m = player.model, g = m.group;
  g.visible = true;
  g.position.copy(LOBBY_POS);
  g.rotation.set(0, Math.PI - 0.35 + Math.sin(lobby.t * 0.5) * 0.3, 0);
  g.scale.set(1, 1, 1);
  m.glider.visible = false;
  updateHeldModel(player);
  animateLobbyCharacter(m, lobby.t, dt);
  lobby.ring.material.opacity = 0.6 + Math.sin(lobby.t * 3) * 0.3;
  // Figur rechts im Bild, Einstellungen links
  camera.position.set(LOBBY_POS.x - 0.8, LOBBY_POS.y + 1.4, LOBBY_POS.z + 2.35);
  camera.lookAt(LOBBY_POS.x - 0.98, LOBBY_POS.y + 1.08, LOBBY_POS.z);
  if (Math.abs(camera.fov - CONFIG.render.fov) > 0.01) { camera.fov = CONFIG.render.fov; camera.updateProjectionMatrix(); }
  sky.position.copy(camera.position);
  sun.position.set(LOBBY_POS.x + SUN_DIR.x * 50, LOBBY_POS.y + SUN_DIR.y * 50, LOBBY_POS.z + SUN_DIR.z * 50);
  sun.target.position.copy(LOBBY_POS);
  if (cloudGroup) cloudGroup.rotation.y += dt * 0.01;
  updateGrassField(0, 0, dt);
  renderFrame();
}

function refreshLobbyUI() {
  document.querySelectorAll('#diffSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === lobby.difficulty));
  document.querySelectorAll('#todSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === lobby.tod));
  $('diffHint').textContent = DIFF_HINTS[lobby.difficulty];
  $('botCount').value = lobby.bots;
  $('botCountVal').textContent = lobby.bots;
  $('skinName').textContent = SKINS[lobby.skin].name;
  document.querySelectorAll('#skinRow .skin').forEach((el, i) => el.classList.toggle('on', i === lobby.skin));
  $('lobbyName').value = lobby.name;
  const s = lobby.stats;
  $('lobbyStats').textContent = 'Spiele ' + s.games + '  ·  Siege ' + s.wins + '  ·  Eliminierungen ' + s.kills;
}

function setupLobbyUI() {
  document.querySelectorAll('#diffSeg button').forEach((b) => b.addEventListener('click', () => { lobby.difficulty = b.dataset.v; saveLobby(); refreshLobbyUI(); sfx('pickup'); }));
  document.querySelectorAll('#todSeg button').forEach((b) => b.addEventListener('click', () => { lobby.tod = b.dataset.v; setTodMode(lobby.tod); saveLobby(); refreshLobbyUI(); sfx('pickup'); }));
  $('botCount').max = CONFIG.match.players - 1;
  $('botCount').addEventListener('input', (e) => { lobby.bots = parseInt(e.target.value, 10); saveLobby(); refreshLobbyUI(); });
  const row = $('skinRow');
  SKINS.forEach((sk, i) => {
    const el = document.createElement('button');
    el.className = 'skin';
    el.title = sk.name;
    el.style.background = 'linear-gradient(135deg, ' + hexCss(sk.outfit.shirt) + ' 55%, ' + hexCss(sk.outfit.pack) + ' 55%)';
    el.addEventListener('click', () => { applySkin(i); saveLobby(); refreshLobbyUI(); sfx('pickup'); });
    row.appendChild(el);
  });
  $('lobbyName').addEventListener('input', (e) => { lobby.name = e.target.value.trim().slice(0, 14); saveLobby(); });
  $('btnHelp').addEventListener('click', () => $('helpPanel').classList.remove('hidden'));
  $('btnHelpClose').addEventListener('click', () => $('helpPanel').classList.add('hidden'));
  $('btnStart').addEventListener('click', beginMatchmaking);
  refreshLobbyUI();
}

// „Spiel wird gesucht“ – kurzer Countdown, dann geht der Bus los
function beginMatchmaking() {
  if (lobby.searching) return;
  lobby.searching = true;
  initAudio();
  $('lobbyName').blur();
  $('btnStart').classList.add('hidden');
  $('matchmaking').classList.remove('hidden');
  let n = 3;
  $('mmCount').textContent = n;
  sfx('pickup');
  const step = () => {
    n--;
    if (n <= 0) { $('lobby').classList.add('hidden'); startGame(); return; }
    $('mmCount').textContent = n;
    sfx('pickup');
    setTimeout(step, 1000);
  };
  setTimeout(step, 1000);
}

// Einstellungen aus der Lobby auf die Runde anwenden
function applyLobbySettings() {
  player.name = lobby.name || 'Du';
  const bots = actors.filter((a) => a.ai);
  for (let i = lobby.bots; i < bots.length; i++) {
    const a = bots[i];
    scene.remove(a.model.group);
    grid.remove(a.collider);
    actors.splice(actors.indexOf(a), 1);
  }
  for (const a of actors) {
    if (!a.ai) continue;
    const dk = lobby.difficulty === 'gemischt' ? weightedKey(CONFIG.bots.difficulties, 'weight') : lobby.difficulty;
    const d = CONFIG.bots.difficulties[dk];
    a.ai.diff = dk; a.ai.aimError = d.aimError; a.ai.reaction = d.reaction; a.ai.buildChance = d.buildChance;
  }
  if (lobby.stage) lobby.stage.visible = false;
  setTodMode(lobby.tod);
}

function recordMatchStats(victory) {
  lobby.stats.games++;
  if (victory) lobby.stats.wins++;
  lobby.stats.kills += player.kills;
  saveLobby();
}
