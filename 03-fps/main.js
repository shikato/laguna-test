import * as THREE from 'three';

// === Constants ===
const TILE = 2;
const MAP_W = 15;
const MAP_H = 15;

// 0 = floor, 1 = wall
const levelMap = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,1,0,0,0,0,0,1,0,0,1],
  [1,0,1,1,0,1,0,1,1,1,0,1,0,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1],
  [1,0,1,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,1,1,0,1,0,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,1,1,0,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,0,1,1,1,0,1,0,1,1],
  [1,0,0,0,0,1,0,0,0,0,0,1,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const NUM_ENEMIES = 5;
const ENEMY_HP = 2;
const PLAYER_MAX_HP = 100;
const PLAYER_MAX_AMMO = 30;
const DAMAGE_PER_HIT = 10;
const INVINCIBILITY_TIME = 1000; // ms
const DAMAGE_FLASH_DURATION = 120; // ms

// === Game state ===
const state = {
  scene: null,
  camera: null,
  renderer: null,
  player: null,
  raycaster: new THREE.Raycaster(),
  clock: new THREE.Clock(),
  keys: null,
  yaw: Math.PI,
  pitch: 0,
  shootCooldown: 250,
  lastShootTime: 0,
  invincible: false,
  invincibleTimer: 0,
  enemies: [],
  enemyTexture: null,
  wallMeshes: [],
  tracers: [],
  gameState: 'playing',
  removeEventListeners: null,
};

const playerData = {
  hp: PLAYER_MAX_HP,
  ammo: PLAYER_MAX_AMMO,
  score: 0,
  height: 0.8,
};

// === DOM elements ===
const hpEl = document.getElementById('hp');
const ammoEl = document.getElementById('ammo');
const scoreEl = document.getElementById('score');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlaySubEl = document.getElementById('overlay-sub');
const crosshairEl = document.getElementById('crosshair');
const flashEl = document.getElementById('damageFlash');

// === Three.js objects to clean up ===
let flashTexture = null;
let tracerTexture = null;

// === Input state ===
const keys = {
  w: false, a: false, s: false, d: false,
  ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
};

function initRenderer() {
  const container = document.body;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  state.renderer = renderer;
  return renderer;
}

function initScene() {
  // Renderer
  state.renderer = initRenderer();

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202020);
  state.scene = scene;

  // Camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  state.camera = camera;

  // Lighting
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  scene.add(hemiLight);

  // Player object (group to hold camera)
  const player = new THREE.Object3D();
  player.position.set(TILE * 1.5, 0, TILE * 1.5);
  scene.add(player);
  state.player = player;

  // Parent camera to player so it follows movement and yaw rotation
  camera.position.set(0, playerData.height, 0);
  player.add(camera);

  // Apply initial yaw so camera faces an open passage
  player.rotation.y = state.yaw;

  // Build level
  buildLevel();

  // Create enemy texture
  state.enemyTexture = createEnemyTexture();

  // Spawn enemies
  spawnEnemies();

  // Resize handler
  setupResizeListener();

  // Pointer lock
  cleanupPointerLock = initPointerLock();

  // Input
  cleanupInput = initInput();

  animate();
}

function createEnemyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#aa0000';
  ctx.fillRect(8, 8, 48, 48);
  ctx.strokeStyle = '#550000';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, 48, 48);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function buildLevel() {
  const scene = state.scene;
  const wallGeometry = new THREE.BoxGeometry(TILE, TILE * 2, TILE);
  const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
  const floorGeometry = new THREE.PlaneGeometry(MAP_W * TILE, MAP_H * TILE);
  const floorMaterial = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const ceilingMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });

  // Floor
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((MAP_W * TILE) / 2 - TILE / 2, -0.01, (MAP_H * TILE) / 2 - TILE / 2);
  scene.add(floor);

  // Ceiling
  const ceiling = new THREE.Mesh(floorGeometry, ceilingMaterial);
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.set((MAP_W * TILE) / 2 - TILE / 2, TILE * 2 - 0.01, (MAP_H * TILE) / 2 - TILE / 2);
  scene.add(ceiling);

  // Walls
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (levelMap[y][x] === 1) {
         const wall = new THREE.Mesh(wallGeometry, wallMaterial);
         wall.position.set(x * TILE + TILE / 2, TILE, y * TILE + TILE / 2);
         scene.add(wall);
         state.wallMeshes.push(wall);
       }
    }
  }
}

function spawnEnemies() {
  const scene = state.scene;
  const enemyMaterial = new THREE.SpriteMaterial({
    map: state.enemyTexture,
    transparent: true,
    opacity: 0.9,
  });

  const spawnPositions = [
    { x: 13, y: 3 },
    { x: 3, y: 13 },
    { x: 13, y: 11 },
    { x: 9, y: 13 },
    { x: 7, y: 7 },
  ];

  spawnPositions.forEach(pos => {
    const enemy = new THREE.Sprite(enemyMaterial.clone());
    enemy.position.set(
      pos.x * TILE + TILE / 2,
      TILE * 0.5,
      pos.y * TILE + TILE / 2
    );
    enemy.scale.set(TILE, TILE, 1);
    enemy.userData = {
      hp: ENEMY_HP,
      speed: 2.0,
    };
    scene.add(enemy);
    state.enemies.push(enemy);
  });
}

function initPointerLock() {
  const container = document.body;
  const renderer = state.renderer;

  const onPointerLockChange = () => {
    if (document.pointerLockElement === container) {
      crosshairEl.style.display = 'flex';
    } else {
      crosshairEl.style.display = 'none';
    }
  };

  const onClick = () => {
    renderer.domElement.requestPointerLock();
  };

  const onMouseMove = (e) => {
    if (document.pointerLockElement !== container) return;
    if (state.gameState !== 'playing') return;

    const movementX = e.movementX || 0;
    const movementY = e.movementY || 0;

    state.yaw -= movementX * 0.002;
    state.pitch -= movementY * 0.002;
    state.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, state.pitch));

    state.player.rotation.y = state.yaw;
    state.camera.rotation.x = state.pitch;
  };

  container.addEventListener('click', onClick);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mousemove', onMouseMove);

  return () => {
    container.removeEventListener('click', onClick);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('mousemove', onMouseMove);
  };
}

function initInput() {
  const onKeyDown = (e) => {
    if (e.code === 'KeyW') keys.w = true;
    if (e.code === 'KeyA') keys.a = true;
    if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyD') keys.d = true;
    if (e.code === 'ArrowUp') keys.ArrowUp = true;
    if (e.code === 'ArrowDown') keys.ArrowDown = true;
    if (e.code === 'ArrowLeft') keys.ArrowLeft = true;
    if (e.code === 'ArrowRight') keys.ArrowRight = true;
    if (e.code === 'KeyR') {
      if (state.gameState === 'playing') tryReload();
    }

    if (e.code === 'KeyF') {
      if (state.gameState === 'playing') {
        e.preventDefault();
        tryShoot();
      }
    }

    // Restart on game over / clear
    if (state.gameState === 'cleared' || state.gameState === 'gameover') {
      if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
        restartGame();
      }
    }
  };

  const onKeyUp = (e) => {
    if (e.code === 'KeyW') keys.w = false;
    if (e.code === 'KeyA') keys.a = false;
    if (e.code === 'KeyS') keys.s = false;
    if (e.code === 'KeyD') keys.d = false;
    if (e.code === 'ArrowUp') keys.ArrowUp = false;
    if (e.code === 'ArrowDown') keys.ArrowDown = false;
    if (e.code === 'ArrowLeft') keys.ArrowLeft = false;
    if (e.code === 'ArrowRight') keys.ArrowRight = false;
  };

  const onMouseDown = (e) => {
    if (state.gameState !== 'playing') return;
    e.preventDefault();
    if (e.button === 0) {
      tryShoot();
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  state.renderer.domElement.addEventListener('mousedown', onMouseDown);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    state.renderer.domElement.removeEventListener('mousedown', onMouseDown);
  };
}

let resizeListener = null;
function onWindowResize() {
  state.camera.aspect = window.innerWidth / window.innerHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(window.innerWidth, window.innerHeight);
}

let cleanupPointerLock = null;
let cleanupInput = null;

function setupResizeListener() {
  if (resizeListener) {
    window.removeEventListener('resize', resizeListener);
  }
  resizeListener = onWindowResize;
  window.addEventListener('resize', resizeListener);
}

function tryShoot() {
  const now = performance.now();
  if (now - state.lastShootTime < state.shootCooldown) return;
  if (playerData.ammo <= 0) return;

  state.lastShootTime = now;
  playerData.ammo--;
  updateHUD();

  // Raycast
  const camera = state.camera;
  state.raycaster.camera = camera;
  const rayDir = new THREE.Vector3();
  camera.getWorldDirection(rayDir);
  const cameraWorldPos = camera.getWorldPosition(new THREE.Vector3());

  state.raycaster.set(cameraWorldPos, rayDir);

  // Raycast against walls to find impact point
  const wallIntersects = state.raycaster.intersectObjects(state.wallMeshes);
  const enemyIntersects = state.raycaster.intersectObjects(state.enemies);

  // Determine the closest hit point for tracer travel
  let hitPoint = cameraWorldPos.clone().addScaledVector(rayDir, 50);

  if (wallIntersects.length > 0 && enemyIntersects.length > 0) {
    hitPoint = wallIntersects[0].distance < enemyIntersects[0].distance
      ? wallIntersects[0].point
      : enemyIntersects[0].point;
  } else if (wallIntersects.length > 0) {
    hitPoint = wallIntersects[0].point;
  } else if (enemyIntersects.length > 0) {
    hitPoint = enemyIntersects[0].point;
  }

  // Create tracer bullet flying from muzzle to hit point
  const muzzlePos = cameraWorldPos.clone();
  createTracerBullet(muzzlePos, hitPoint);
  // Also create a brief trail
  createTracerTrail(muzzlePos, hitPoint);

  if (enemyIntersects.length > 0) {
    const hit = enemyIntersects[0];
    createHitEffect(hit.point);
    const enemy = hit.object;
    enemy.userData.hp--;

    if (enemy.userData.hp <= 0) {
      // Death effect: scale down and fade
      createDeathEffect(enemy);
      const idx = state.enemies.indexOf(enemy);
      if (idx >= 0) state.enemies.splice(idx, 1);

      playerData.score += 100;
  updateHUD();
  hpEl.classList.add('hp-hit');

      // Check win
      if (state.enemies.length === 0) {
        state.gameState = 'cleared';
        showOverlay('ステージクリア！', 'Enter / スペース / R キーでリスタート');
      }
    }
  }
}

function createDeathEffect(enemy) {
  const scene = state.scene;

  // Flash effect
  const originalColor = enemy.material.color.clone();
  enemy.material.color.set(0xffff00);

  // Animate disappearance
  let scale = 1;
  const interval = setInterval(() => {
    scale *= 0.8;
    enemy.scale.set(scale, scale, scale);
    const opacity = scale;
    if (enemy.material.transparent === false) {
      enemy.material.transparent = true;
    }
    enemy.material.opacity = opacity;

    if (scale < 0.1) {
      clearInterval(interval);
      scene.remove(enemy);
      enemy.material.color.copy(originalColor);
      enemy.material.transparent = false;
      enemy.material.opacity = 1;
    }
  }, 50);
}

function getFlashTexture() {
  if (flashTexture) return flashTexture;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,200,1)');
  gradient.addColorStop(0.4, 'rgba(255,200,50,0.6)');
  gradient.addColorStop(1, 'rgba(255,100,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  flashTexture = new THREE.CanvasTexture(canvas);
  return flashTexture;
}

function getTracerTexture() {
  if (tracerTexture) return tracerTexture;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,200,1)');
  gradient.addColorStop(0.4, 'rgba(255,200,50,0.8)');
  gradient.addColorStop(1, 'rgba(255,100,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  tracerTexture = new THREE.CanvasTexture(canvas);
  return tracerTexture;
}

function createTracerBullet(muzzlePos, hitPoint) {
  const scene = state.scene;
  const camera = state.camera;

  const dir = new THREE.Vector3().subVectors(hitPoint, muzzlePos).normalize();
  const distance = muzzlePos.distanceTo(hitPoint);
  const speed = 30; // units per second

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getTracerTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    color: 0xffff88,
    depthWrite: false,
  }));

  sprite.position.copy(muzzlePos);
  sprite.scale.set(0.15, 0.15, 0.15);
  scene.add(sprite);

  state.tracers.push({
    sprite: sprite,
    startPos: muzzlePos.clone(),
    dir: dir,
    distance: distance,
    traveled: 0,
    speed: speed,
    hitPoint: hitPoint,
  });
}

function createTracerTrail(startPos, endPos) {
  const scene = state.scene;

  const geometry = new THREE.BufferGeometry().setFromPoints([startPos, endPos]);
  const material = new THREE.LineBasicMaterial({
    color: 0xffff88,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  scene.add(line);

  let opacity = 0.6;
  const interval = setInterval(() => {
    opacity -= 0.15;
    line.material.opacity = opacity;
    if (opacity <= 0.05) {
      clearInterval(interval);
      scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    }
  }, 30);
}

function createHitEffect(point) {
  const scene = state.scene;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getFlashTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    color: 0xffff00,
  }));

  sprite.position.copy(point);
  sprite.scale.set(0.3, 0.3, 0.3);
  scene.add(sprite);

  let opacity = 1;
  const interval = setInterval(() => {
    opacity -= 0.2;
    sprite.material.opacity = opacity;
    sprite.scale.multiplyScalar(1.2);
    if (opacity <= 0.1) {
      clearInterval(interval);
      scene.remove(sprite);
    }
  }, 30);
}

function tryReload() {
  if (state.gameState !== 'playing') return;
  playerData.ammo = PLAYER_MAX_AMMO;
  updateHUD();
}

function takeDamage() {
  if (state.invincible) return;

  playerData.hp -= DAMAGE_PER_HIT;
  if (playerData.hp < 0) playerData.hp = 0;

  state.invincible = true;
  state.invincibleTimer = performance.now() + INVINCIBILITY_TIME;

  // Trigger red flash overlay
  flashEl.style.opacity = '1';
  setTimeout(() => {
    if (flashEl) flashEl.style.opacity = '0';
  }, DAMAGE_FLASH_DURATION);

  hpEl.classList.add('hp-hit');
  updateHUD();

  if (playerData.hp <= 0) {
    state.gameState = 'gameover';
    showOverlay('ゲームオーバー', 'Enter / スペース / R キーでリスタート');
  }
}

function updateHUD() {
  hpEl.textContent = playerData.hp;
  hpEl.classList.remove('hp-hit');
  ammoEl.textContent = playerData.ammo;
  scoreEl.textContent = playerData.score;
}

function showOverlay(title, sub) {
  overlayTitleEl.textContent = title;
  overlaySubEl.textContent = sub;
  overlayEl.style.display = 'flex';
}

function hideOverlay() {
  overlayEl.style.display = 'none';
}

function restartGame() {
  // Reset player data
  playerData.hp = PLAYER_MAX_HP;
  playerData.ammo = PLAYER_MAX_AMMO;
  playerData.score = 0;

  // Reset state
  state.invincible = false;
  state.invincibleTimer = 0;
  state.lastShootTime = 0;
  state.gameState = 'playing';
  state.yaw = 0;
  state.pitch = 0;
  state.enemies = [];
  state.wallMeshes = [];
  state.tracers = [];

  // Clean up event listeners
  if (cleanupPointerLock) {
    cleanupPointerLock();
    cleanupPointerLock = null;
  }
  if (cleanupInput) {
    cleanupInput();
    cleanupInput = null;
  }

   if (flashEl) flashEl.style.opacity = '0';

  // Clear scene
  const scene = state.scene;
  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }

  // Re-init
  hideOverlay();
  initScene();
}

function isWalkable(worldX, worldZ) {
  const gridX = Math.floor(worldX / TILE);
  const gridZ = Math.floor(worldZ / TILE);
  if (gridX < 0 || gridX >= MAP_W || gridZ < 0 || gridZ >= MAP_H) return false;
  return levelMap[gridZ][gridX] === 0;
}

function movePlayer(deltaTime) {
  if (state.gameState !== 'playing') return;

  const player = state.player;
  const camera = state.camera;

  const speed = 2.5; // tiles per second
  const moveDistance = speed * TILE * deltaTime;

  // Calculate move direction relative to camera yaw
  const yaw = player.rotation.y;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.sin(yaw + Math.PI / 2), 0, Math.cos(yaw + Math.PI / 2));

  let moveX = 0;
  let moveZ = 0;

  if (keys.w || keys.ArrowUp) {
    moveX += forward.x;
    moveZ += forward.z;
  }
  if (keys.s || keys.ArrowDown) {
    moveX -= forward.x;
    moveZ -= forward.z;
  }
  if (keys.a || keys.ArrowLeft) {
    moveX -= right.x;
    moveZ -= right.z;
  }
  if (keys.d || keys.ArrowRight) {
    moveX += right.x;
    moveZ += right.z;
  }

  if (moveX !== 0 || moveZ !== 0) {
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    moveX /= len;
    moveZ /= len;

    const newX = player.position.x + moveX * moveDistance;
    const newZ = player.position.z + moveZ * moveDistance;

    // Collision: check if the new position is walkable
    if (isWalkable(newX, player.position.z)) {
      player.position.x = newX;
    }
    if (isWalkable(player.position.x, newZ)) {
      player.position.z = newZ;
    }
  }
}

function updateEnemies(deltaTime) {
  if (state.gameState !== 'playing') return;

  const player = state.player;

  state.enemies.forEach(enemy => {
    if (!enemy.userData) return;

    const dir = new THREE.Vector3();
    dir.subVectors(player.position, enemy.position);
    dir.y = 0;
    const dist = dir.length();

    if (dist > 0.01) {
      dir.normalize();
      enemy.position.x += dir.x * enemy.userData.speed * deltaTime;
      enemy.position.z += dir.z * enemy.userData.speed * deltaTime;
    }

    // Damage check: enemy within proximity of player
    const dx = enemy.position.x - player.position.x;
    const dz = enemy.position.z - player.position.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < (TILE * 0.6) * (TILE * 0.6)) {
      takeDamage();
    }
  });

  // Billboard: enemies always face camera
  state.enemies.forEach(enemy => {
    // Make enemies face the camera (only Y rotation)
    enemy.rotation.set(0, 0, 0);
    // Use the camera quaternion for billboarding
    enemy.quaternion.copy(state.camera.quaternion);
  });
}

function animate() {
  requestAnimationFrame(animate);

  const deltaTime = state.clock.getDelta();
  const now = performance.now();

  if (state.gameState === 'playing') {
    movePlayer(deltaTime);
    updateEnemies(deltaTime);

    // Update invincibility timer
    if (state.invincible && now > state.invincibleTimer) {
      state.invincible = false;
      if (flashEl) flashEl.style.opacity = '0';
    }

    // Update tracers
    for (let i = state.tracers.length - 1; i >= 0; i--) {
      const tracer = state.tracers[i];
      tracer.traveled += tracer.speed * deltaTime;

      if (tracer.traveled >= tracer.distance) {
        // Tracer arrived at hit point
        createWallImpactEffect(tracer.hitPoint);
        state.scene.remove(tracer.sprite);
        tracer.sprite.material.dispose();
        tracer.sprite.geometry.dispose();
        state.tracers.splice(i, 1);
      } else {
        tracer.sprite.position.copy(tracer.startPos).addScaledVector(tracer.dir, tracer.traveled);
      }
    }
  }

  state.renderer.render(state.scene, state.camera);
}

function createWallImpactEffect(hitPoint) {
  const scene = state.scene;

  // Flash effect
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getFlashTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    color: 0xffaa44,
  }));

  sprite.position.copy(hitPoint);
  sprite.scale.set(0.4, 0.4, 0.4);
  scene.add(sprite);

  let scale = 1;
  const interval = setInterval(() => {
    scale += 0.15;
    sprite.scale.set(0.4 * scale, 0.4 * scale, 0.4 * scale);
    sprite.material.opacity = 1 - scale;
    if (scale >= 2) {
      clearInterval(interval);
      scene.remove(sprite);
    }
  }, 20);
}

// === Init ===
initScene();;
