import * as THREE from 'three';

// ---------- 定数 ----------
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.4;
const PLAYER_SPEED = 5;
const PLAYER_MAX_HP = 100;
const PLAYER_INVULN_TIME = 1.0;
const CONTACT_DAMAGE = 15;
const MAG_SIZE = 30;
const RELOAD_TIME = 1.5;
const FIRE_COOLDOWN = 0.25;
const ENEMY_COUNT = 5;
const ENEMY_HP = 2;
const ENEMY_SPEED = 1.8;
const ENEMY_SIZE = 1.4;
const ENEMY_DAMAGE_RANGE = 1.0;

// ---------- レベル定義（2Dグリッド: 1=壁 0=床 2=敵スポーン）----------
const MAP = [
  '1111111111111111',
  '1..........2.....1',
  '1.11.111.111.111.1',
  '1.1.1.....1...1..1',
  '1.1.1.1111.1.111.1',
  '1.....1..2..1....1',
  '11.1.11....11.11.1',
  '1..1...1.1.....2.1',
  '1.11.1..1..1.111.1',
  '1.....1....1.....1',
  '1.111.11.111.111.1',
  '1.2........2.....1',
  '1111111111111111',
];
const MAP_H = MAP.length;
const MAP_W = MAP[0].length;
const CELL = 2;
const WALL_H = CELL;

// ---------- 基本セットアップ ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x181820);
scene.fog = new THREE.Fog(0x181820, 10, 45);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 100);
camera.rotation.order = 'YXZ';
camera.position.set(0, PLAYER_HEIGHT, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const dirLight = new THREE.DirectionalLight(0xffeecc, 0.8);
dirLight.position.set(5, 12, 3);
scene.add(dirLight);

// ---------- レベル構築 ----------
const wallMeshes = [];
const spawnPoints = [];
function cellToXZ(cx, cz) {
  return { x: (cx - (MAP_W - 1) / 2) * CELL, z: (cz - (MAP_H - 1) / 2) * CELL };
}
const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a7f6a });
const floorMat = new THREE.MeshLambertMaterial({ color: 0x3a3a44 });
const ceilMat = new THREE.MeshLambertMaterial({ color: 0x22222a });

for (let z = 0; z < MAP_H; z++) {
  for (let x = 0; x < MAP_W; x++) {
    const c = MAP[z][x];
    const { x: wx, z: wz } = cellToXZ(x, z);
    if (c === '1') {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), wallMat);
      wall.position.set(wx, WALL_H / 2, wz);
      scene.add(wall);
      wallMeshes.push(wall);
    } else {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(wx, 0, wz);
      scene.add(floor);
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), ceilMat);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(wx, WALL_H, wz);
      scene.add(ceil);
    }
    if (c === '2') spawnPoints.push(new THREE.Vector3(wx, 0, wz));
  }
}
// プレイヤー開始位置（床セルで手動指定）
const start = cellToXZ(1, 1);

// ---------- 敵 ----------
function makeEnemyTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7a1010'; g.fillRect(0, 0, 128, 256); // 胴体
  g.fillStyle = '#4a0808'; g.fillRect(20, 40, 16, 90); g.fillRect(92, 40, 16, 90); // 腕
  g.fillStyle = '#e8c890'; g.fillRect(34, 8, 60, 52); // 顔
  g.fillStyle = '#000'; g.fillRect(44, 24, 12, 12); g.fillRect(72, 24, 12, 12); // 目
  g.fillRect(40, 46, 48, 6); // 口
  g.fillStyle = '#5a0c0c'; g.fillRect(38, 200, 24, 56); g.fillRect(66, 200, 24, 56); // 脚
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
const enemyTex = makeEnemyTexture();
const enemies = [];

function spawnEnemy(pos) {
  const geo = new THREE.PlaneGeometry(ENEMY_SIZE, ENEMY_SIZE * 2);
  const mat = new THREE.MeshBasicMaterial({ map: enemyTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos.x, ENEMY_SIZE, pos.z);
  scene.add(mesh);
  const enemy = { mesh, hp: ENEMY_HP, alive: true, dying: 0 };
  enemies.push(enemy);
}

// ---------- 状態 ----------
const state = {
  status: 'title', // title | playing | win | lose
  hp: PLAYER_MAX_HP,
  ammo: MAG_SIZE,
  kills: 0,
  invuln: 0,
  fireCd: 0,
  reloading: 0,
  locked: false,
};
const keys = {};
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

// ---------- HUD ----------
const elHp = document.getElementById('hp');
const elHpBar = document.getElementById('hpBar');
const elAmmo = document.getElementById('ammo');
const elKills = document.getElementById('kills');
const elOverlay = document.getElementById('overlay');
const elTitle = document.getElementById('title');
const elMsg = document.getElementById('msg');
const elHud = document.getElementById('hud');
const elCrosshair = document.getElementById('crosshair');
const elGuide = document.getElementById('guide');
const elGuideTitle = document.getElementById('guideTitle');

function updateHud() {
  elHp.textContent = Math.max(0, Math.round(state.hp));
  const pct = Math.max(0, state.hp / PLAYER_MAX_HP);
  elHpBar.textContent = '[' + '#'.repeat(Math.ceil(pct * 10)).padEnd(10, '-') + ']';
  elHpBar.style.color = pct > 0.5 ? '#4f4' : pct > 0.25 ? '#ff4' : '#f44';
  elAmmo.textContent = state.reloading > 0 ? '···' : state.ammo;
  elKills.textContent = state.kills;
}

const GUIDE_TEXT = 'WASD/矢印: 移動 / マウス: 視点 / クリック or F: 射撃 / R: リロード';
function showOverlay(title, msg) {
  elTitle.textContent = title;
  elMsg.textContent = msg;
  elOverlay.classList.remove('hidden');
}
function setGuide() {
  elGuide.textContent = GUIDE_TEXT;
  elGuideTitle.textContent = GUIDE_TEXT;
}
function hideOverlay() {
  elOverlay.classList.add('hidden');
}

// ---------- ゲーム制御 ----------
function resetGame() {
  for (const e of enemies) scene.remove(e.mesh);
  enemies.length = 0;
  for (const p of spawnPoints) spawnEnemy(p);
  camera.position.set(start.x, PLAYER_HEIGHT, start.z);
  camera.rotation.set(0, 0, 0);
  state.hp = PLAYER_MAX_HP;
  state.ammo = MAG_SIZE;
  state.kills = 0;
  state.invuln = 0;
  state.fireCd = 0;
  state.reloading = 0;
  updateHud();
}

function startGame() {
  resetGame();
  state.status = 'playing';
  hideOverlay();
  elHud.classList.remove('hidden');
  elCrosshair.classList.remove('hidden');
  renderer.domElement.requestPointerLock();
}

function resumeFromPause() {
  elOverlay.classList.add('hidden');
  state.status = 'playing';
  renderer.domElement.requestPointerLock();
}

function endGame(win) {
  state.status = win ? 'win' : 'lose';
  document.exitPointerLock();
  elHud.classList.add('hidden');
  elCrosshair.classList.add('hidden');
  showOverlay(win ? 'クリア!' : 'ゲームオーバー', `撃破数: ${state.kills} — どれかのキーでリスタート`);
}

// ---------- 入力 ----------
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (state.status === 'playing' && e.code === 'KeyR') {
    if (state.reloading <= 0 && state.ammo < MAG_SIZE) state.reloading = RELOAD_TIME;
  }
  if (state.status === 'playing' && e.code === 'KeyF' && !e.repeat) {
    tryFire();
  }
  if (state.status === 'paused' && e.code === 'Escape') {
    state.status = 'title';
    elHud.classList.add('hidden');
    elCrosshair.classList.add('hidden');
    showOverlay('DOOMライク FPS', 'クリックで開始（マウスがロックされます）');
  }
  if ((state.status === 'win' || state.status === 'lose') && (e.code === 'Space' || e.code === 'Enter')) {
    startGame();
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (state.status === 'title') { startGame(); return; }
  if (state.status === 'paused') { resumeFromPause(); return; }
  if (state.status !== 'playing') return;
  if (document.pointerLockElement !== renderer.domElement) {
    resumeFromPause();
    return;
  }
  tryFire();
});

addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  camera.rotation.y -= e.movementX * 0.0022;
  camera.rotation.x -= e.movementY * 0.0022;
  const lim = Math.PI / 2 - 0.05;
  camera.rotation.x = Math.max(-lim, Math.min(lim, camera.rotation.x));
});

document.addEventListener('pointerlockchange', () => {
  state.locked = document.pointerLockElement === renderer.domElement;
    if (!state.locked && state.status === 'playing') {
      // ポーズ: 敵更新・移動を停止し再開待ちにする
    elOverlay.classList.remove('hidden');
    elTitle.textContent = '一時停止';
    elMsg.textContent = 'クリックで再開';
    state.status = 'paused';
  }
});

// ---------- 射撃 ----------
const muzzle = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffcc44 })
);
muzzle.visible = false;
scene.add(muzzle);

function tryFire() {
  if (state.fireCd > 0 || state.reloading > 0) return;
  if (state.ammo <= 0) { state.reloading = RELOAD_TIME; return; }
  state.ammo--;
  state.fireCd = FIRE_COOLDOWN;

  raycaster.setFromCamera(center, camera);
  const hits = raycaster.intersectObjects(enemies.filter(e => e.alive).map(e => e.mesh), false);
  const wallHits = raycaster.intersectObjects(wallMeshes, false);
  let hitEnemy = null;
  if (hits.length > 0) {
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : Infinity;
    if (hits[0].distance <= wallDist) {
      hitEnemy = enemies.find(e => e.mesh === hits[0].object);
    }
  }
  // マズルフラッシュ位置
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  muzzle.position.copy(camera.position).addScaledVector(dir, 0.5).addScaledVector(new THREE.Vector3(0.3, -0.25, 0).applyQuaternion(camera.quaternion), 1);
  muzzle.visible = true;
  setTimeout(() => { muzzle.visible = false; }, 60);

  if (hitEnemy) damageEnemy(hitEnemy, 1);
  updateHud();
}

function damageEnemy(enemy, dmg) {
  enemy.hp -= dmg;
  // ヒット演出: 一瞬白く
  enemy.mesh.material.color.set(0x8888ff);
  setTimeout(() => { if (enemy.alive) enemy.mesh.material.color.set(0xffffff); }, 40);
  if (enemy.hp <= 0 && enemy.alive) {
    enemy.alive = false;
    enemy.dying = 0.4; // 消滅演出の残り時間
    state.kills++;
    updateHud();
    if (state.kills >= ENEMY_COUNT) endGame(true);
  }
}

// ---------- 衝突（グリッドベース）----------
function isWall(x, z) {
  const cx = Math.round(x / CELL + (MAP_W - 1) / 2);
  const cz = Math.round(z / CELL + (MAP_H - 1) / 2);
  if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H) return true;
  return MAP[cz][cx] === '1';
}
function collides(x, z) {
  const r = PLAYER_RADIUS;
  return isWall(x - r, z) || isWall(x + r, z) || isWall(x, z - r) || isWall(x, z + r);
}
function tryMove(dx, dz) {
  const nx = camera.position.x + dx;
  const nz = camera.position.z + dz;
  if (!collides(nx, camera.position.z)) camera.position.x = nx;
  if (!collides(camera.position.x, nz)) camera.position.z = nz;
}

// ---------- 敵更新 ----------
function updateEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive) {
      if (e.dying > 0) {
        e.dying -= dt;
        const s = Math.max(0.01, e.dying / 0.4);
        e.mesh.scale.set(s, s, s);
        e.mesh.material.opacity = s;
        if (e.dying <= 0) scene.remove(e.mesh);
      }
      continue;
    }
    const toPlayer = new THREE.Vector3().subVectors(camera.position, e.mesh.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    toPlayer.normalize();
    if (dist > 0.6) {
      const step = ENEMY_SPEED * dt;
      const nx = e.mesh.position.x + toPlayer.x * step;
      const nz = e.mesh.position.z + toPlayer.z * step;
      // 壁めり込み防止（敵も簡易に壁判定）
      const ecx = Math.round(nx / CELL + (MAP_W - 1) / 2);
      const ecz = Math.round(nz / CELL + (MAP_H - 1) / 2);
      const inWall = ecx >= 0 && ecz >= 0 && ecx < MAP_W && ecz < MAP_H && MAP[ecz][ecx] === '1';
      if (!inWall) {
        e.mesh.position.x = nx;
        e.mesh.position.z = nz;
      }
    }
    e.mesh.lookAt(camera.position.x, e.mesh.position.y, camera.position.z);
    if (dist < ENEMY_DAMAGE_RANGE && state.invuln <= 0) {
      state.hp -= CONTACT_DAMAGE;
      state.invuln = PLAYER_INVULN_TIME;
      updateHud();
      if (state.hp <= 0) { state.hp = 0; updateHud(); endGame(false); }
    }
  }
}

// ---------- メインループ ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state.status === 'playing') {
    if (state.invuln > 0) state.invuln -= dt;
    if (state.fireCd > 0) state.fireCd -= dt;
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) { state.ammo = MAG_SIZE; state.reloading = 0; }
      updateHud();
    }
    // 移動
    const fwd = new THREE.Vector3(-Math.sin(camera.rotation.y), 0, -Math.cos(camera.rotation.y));
    const right = new THREE.Vector3(Math.cos(camera.rotation.y), 0, -Math.sin(camera.rotation.y));
    const move = new THREE.Vector3();
    if (state.locked) {
      if (keys['KeyW'] || keys['ArrowUp']) move.add(fwd);
      if (keys['KeyS'] || keys['ArrowDown']) move.sub(fwd);
      if (keys['KeyD'] || keys['ArrowRight']) move.add(right);
      if (keys['KeyA'] || keys['ArrowLeft']) move.sub(right);
    }
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(PLAYER_SPEED * dt);
      tryMove(move.x, move.z);
    }
    updateEnemies(dt);
  }
  renderer.render(scene, camera);
}

// ---------- リサイズ ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- 開始 ----------
resetGame();
showOverlay('DOOMライク FPS', 'クリックで開始（マウスがロックされます）');
setGuide();
loop(performance.now());
