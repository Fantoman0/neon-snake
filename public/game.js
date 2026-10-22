
import * as THREE from "three";

(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const canvas = $("world");

  const COLORS = {
    green: 0x00ff9c,
    pink: 0xff00e5,
    cyan: 0x00d9ff,
    floor: 0x070b18
  };

  const GRID = 32;
  const CELL = 1.5;
  const HALF = GRID * CELL / 2;

  const DEFAULTS = {
    speed: "normal",
    quality: "balanced",
    snakeColor: "#00ff9c",
    sound: true,
    vibration: false
  };

  function loadSettings() {
    try {
      const raw = JSON.parse(
        localStorage.getItem("neon3d-settings") || "{}"
      );

      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ...DEFAULTS };
      }

      return {
        speed: ["slow", "normal", "fast"].includes(raw.speed)
          ? raw.speed : DEFAULTS.speed,
        quality: ["balanced", "high"].includes(raw.quality)
          ? raw.quality : DEFAULTS.quality,
        snakeColor:
          typeof raw.snakeColor === "string" &&
          /^#[0-9a-fA-F]{6}$/.test(raw.snakeColor)
            ? raw.snakeColor : DEFAULTS.snakeColor,
        sound: typeof raw.sound === "boolean"
          ? raw.sound : DEFAULTS.sound,
        vibration: typeof raw.vibration === "boolean"
          ? raw.vibration : DEFAULTS.vibration
      };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function getNumber(key) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch (_) {
      return 0;
    }
  }

  function saveNumber(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (_) {}
  }

  let settings = loadSettings();
  let best = getNumber("neon3d-best");
  let games = getNumber("neon3d-games");

  let score = 0;
  let state = "menu";
  let timer = null;

  let snake = [];
  let direction = { x: 0, z: -1 };
  let nextDirection = { x: 0, z: -1 };

  let food = { x: 0, z: 0 };
  let foodMesh = null;
  let foodLight = null;

  let powerup = null;
  let powerupMesh = null;
  let powerupLight = null;

  let foodsCollected = 0;
  let activeEffect = null;
  let effectUntil = 0;

  let segments = [];
  let audioContext = null;

  let lastTime = 0;
  let toastUntil = 0;

  let joystickPointer = null;
  let joystickOrigin = { x: 0, y: 0 };
  let lastJoystickDirection = "";

  let particles = [];
  const MAX_PARTICLES = 180;
  const particleGeometry = new THREE.SphereGeometry(0.055, 6, 6);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050510);
  scene.fog = new THREE.FogExp2(0x050510, 0.012);

  const camera = new THREE.PerspectiveCamera(
    63,
    window.innerWidth / window.innerHeight,
    0.1,
    160
  );
  camera.position.set(0, 5, 8);

  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.quality === "high",
      alpha: false,
      powerPreference: "high-performance"
    });
  } catch (_) {
    $("resultTitle").textContent = "الجهاز لا يدعم الرسومات المطلوبة";
    $("resultText").textContent =
      "جرّب متصفحًا أو جهازًا يدعم WebGL.";
    $("menu").classList.add("hidden");
    $("result").classList.remove("hidden");
    return;
  }

  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio || 1,
      settings.quality === "high" ? 1.7 : 1.25
    )
  );
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene.add(new THREE.HemisphereLight(0x91caff, 0x101020, 2.0));

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.1);
  mainLight.position.set(8, 16, 5);
  scene.add(mainLight);

  const greenLight = new THREE.PointLight(COLORS.green, 15, 35);
  greenLight.position.set(-8, 4, -8);
  scene.add(greenLight);

  const pinkLight = new THREE.PointLight(COLORS.pink, 12, 24);
  pinkLight.position.set(8, 3, 8);
  scene.add(pinkLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID * CELL, GRID * CELL),
    new THREE.MeshStandardMaterial({
      color: COLORS.floor,
      roughness: 0.8,
      metalness: 0.15
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.08;
  scene.add(floor);

  const grid = new THREE.GridHelper(
    GRID * CELL,
    GRID,
    0x00ff9c,
    0x173047
  );
  grid.position.y = -0.04;
  scene.add(grid);

  const borderMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff9c,
    emissive: 0x00ff9c,
    emissiveIntensity: 1.7,
    metalness: 0.25,
    roughness: 0.35
  });

  function addWall(x, z, w, d) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.25, d),
      borderMaterial
    );
    wall.position.set(x, 0.05, z);
    scene.add(wall);
  }

  addWall(0, -HALF, GRID * CELL, 0.12);
  addWall(0, HALF, GRID * CELL, 0.12);
  addWall(-HALF, 0, 0.12, GRID * CELL);
  addWall(HALF, 0, 0.12, GRID * CELL);

  const snakeMaterial = new THREE.MeshStandardMaterial({
    color: settings.snakeColor,
    emissive: settings.snakeColor,
    emissiveIntensity: 0.75,
    roughness: 0.26,
    metalness: 0.22
  });

  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9fff2,
    emissive: settings.snakeColor,
    emissiveIntensity: 1.0,
    roughness: 0.22
  });

  const segmentGeometry = new THREE.SphereGeometry(0.48, 16, 12);
  const headGeometry = new THREE.SphereGeometry(0.53, 20, 14);

  function makeSnakeMesh(isHead) {
    const mesh = new THREE.Mesh(
      isHead ? headGeometry : segmentGeometry,
      isHead ? headMaterial : snakeMaterial
    );
    scene.add(mesh);
    return mesh;
  }

  function gridPosition(p) {
    return new THREE.Vector3(
      (p.x - (GRID - 1) / 2) * CELL,
      0.48,
      (p.z - (GRID - 1) / 2) * CELL
    );
  }

  function updateSnakeMeshes() {
    while (segments.length < snake.length) {
      segments.push(makeSnakeMesh(segments.length === 0));
    }

    while (segments.length > snake.length) {
      scene.remove(segments.pop());
    }

    segments.forEach((mesh, i) => {
      mesh.position.copy(gridPosition(snake[i]));
      mesh.scale.setScalar(
        i === 0 ? 1.05 : Math.max(0.72, 1 - i * 0.008)
      );
      mesh.material = i === 0 ? headMaterial : snakeMaterial;
    });

    if (snake.length) {
      segments[0].rotation.y = Math.atan2(direction.x, direction.z);
    }
  }

  // --------------------------------------------------
  // Neon particle effects
  // --------------------------------------------------

  function spawnParticles(position, color, count = 14) {
    const available = Math.max(0, MAX_PARTICLES - particles.length);
    count = Math.min(count, available);

    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false
      });

      const mesh = new THREE.Mesh(particleGeometry, material);
      mesh.position.copy(position);
      scene.add(mesh);

      particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 5,
        vy: Math.random() * 3 + 0.5,
        vz: (Math.random() - 0.5) * 5,
        life: 0.55 + Math.random() * 0.45,
        maxLife: 1
      });
    }
  }

  function updateParticles(delta) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      p.life -= delta;

      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        particles.splice(i, 1);
        continue;
      }

      p.mesh.position.x += p.vx * delta;
      p.mesh.position.y += p.vy * delta;
      p.mesh.position.z += p.vz * delta;
      p.vy -= 5 * delta;

      const alpha = p.life / p.maxLife;
      p.mesh.material.opacity = alpha;
      p.mesh.scale.setScalar(Math.max(0.05, alpha));
    }
  }

  function clearParticles() {
    for (const p of particles) {
      scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    particles = [];
  }

  // --------------------------------------------------
  // Food
  // --------------------------------------------------

  function removeFood() {
    if (foodMesh) {
      scene.remove(foodMesh);
      foodMesh.geometry.dispose();
      foodMesh.material.dispose();
      foodMesh = null;
    }

    if (foodLight) {
      scene.remove(foodLight);
      foodLight = null;
    }
  }

  function randomFood() {
    const free = [];

    for (let z = 0; z < GRID; z++) {
      for (let x = 0; x < GRID; x++) {
        if (!snake.some(p => p.x === x && p.z === z)) {
          free.push({ x, z });
        }
      }
    }

    if (!free.length) {
      finish(true);
      return false;
    }

    removeFood();
    food = free[Math.floor(Math.random() * free.length)];

    foodMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.38, 2),
      new THREE.MeshStandardMaterial({
        color: COLORS.pink,
        emissive: COLORS.pink,
        emissiveIntensity: 2.4,
        roughness: 0.2,
        metalness: 0.2
      })
    );

    foodMesh.position.copy(gridPosition(food));
    foodMesh.position.y = 0.55;
    scene.add(foodMesh);

    foodLight = new THREE.PointLight(COLORS.pink, 5, 6);
    foodLight.position.copy(foodMesh.position);
    scene.add(foodLight);

    return true;
  }

  // --------------------------------------------------
  // Power-ups
  // --------------------------------------------------

  function removePowerup() {
    if (powerupMesh) {
      scene.remove(powerupMesh);
      powerupMesh.geometry.dispose();
      powerupMesh.material.dispose();
      powerupMesh = null;
    }

    if (powerupLight) {
      scene.remove(powerupLight);
      powerupLight = null;
    }

    powerup = null;
  }

  function spawnPowerup() {
    if (powerupMesh || state !== "playing") return;

    const free = [];

    for (let z = 0; z < GRID; z++) {
      for (let x = 0; x < GRID; x++) {
        const occupiedBySnake = snake.some(
          p => p.x === x && p.z === z
        );

        const occupiedByFood = food.x === x && food.z === z;

        if (!occupiedBySnake && !occupiedByFood) {
          free.push({ x, z });
        }
      }
    }

    if (!free.length) return;

    const types = ["boost", "slow", "bonus"];
    const type = types[Math.floor(Math.random() * types.length)];

    const colors = {
      boost: COLORS.green,
      slow: COLORS.cyan,
      bonus: COLORS.pink
    };

    powerup = {
      ...free[Math.floor(Math.random() * free.length)],
      type,
      expiresAt: Date.now() + 12000
    };

    const color = colors[type];

    powerupMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.43, 1),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 2.5,
        roughness: 0.2,
        metalness: 0.2
      })
    );

    powerupMesh.position.copy(gridPosition(powerup));
    powerupMesh.position.y = 0.65;
    scene.add(powerupMesh);

    powerupLight = new THREE.PointLight(color, 4, 7);
    powerupLight.position.copy(powerupMesh.position);
    scene.add(powerupLight);
  }

  function collectPowerup() {
    if (!powerup || state !== "playing") return;

    const collected = { ...powerup };
    const colors = {
      boost: COLORS.green,
      slow: COLORS.cyan,
      bonus: COLORS.pink
    };

    const position = powerupMesh
      ? powerupMesh.position.clone()
      : gridPosition(collected);

    spawnParticles(position, colors[collected.type], 24);
    removePowerup();

    if (collected.type === "bonus") {
      score += 30;

      if (score > best) {
        best = score;
        saveNumber("neon3d-best", best);
      }

      $("score").textContent = score;
      $("best").textContent = best;
      $("menuBest").textContent = best;

      $("toast").textContent = "+30 BONUS";
      toastUntil = Date.now() + 1500;

      sound(1050, 0.16);
      vibrate();
      return;
    }

    activeEffect = collected.type;
    effectUntil = Date.now() + 5000;

    $("toast").textContent = collected.type === "boost"
      ? "⚡ SPEED BOOST!"
      : "❄ SLOW MOTION";

    toastUntil = Date.now() + 1500;
    sound(collected.type === "boost" ? 1100 : 400, 0.16);
    vibrate();

    clearInterval(timer);
    timer = setInterval(step, speedMs());
  }

  function updatePowerup(time) {
    if (!powerupMesh || !powerup) return;

    if (Date.now() >= powerup.expiresAt) {
      removePowerup();
      return;
    }

    const seconds = time / 1000;

    powerupMesh.rotation.x = seconds * 1.3;
    powerupMesh.rotation.y = seconds * 2;
    powerupMesh.position.y = 0.65 + Math.sin(seconds * 3) * 0.14;

    if (powerupLight) {
      powerupLight.position.copy(powerupMesh.position);
    }
  }

  // --------------------------------------------------
  // Camera, speed, sound, vibration
  // --------------------------------------------------

  function updateCamera() {
    if (!snake.length) return;

    const head = gridPosition(snake[0]);
    const back = direction;

    const desired = new THREE.Vector3(
      head.x - back.x * 5.6,
      head.y + 3.5,
      head.z - back.z * 5.6
    );

    camera.position.lerp(desired, 0.11);

    const target = new THREE.Vector3(
      head.x + back.x * 3.1,
      head.y - 0.05,
      head.z + back.z * 3.1
    );

    camera.lookAt(target);
  }

  function speedMs() {
    const base = {
      slow: 235,
      normal: 175,
      fast: 125
    }[settings.speed] || 175;

    let interval = base - Math.floor(score / 100) * 4;

    if (activeEffect === "boost" && Date.now() < effectUntil) {
      interval *= 0.72;
    } else if (
      activeEffect === "slow" &&
      Date.now() < effectUntil
    ) {
      interval *= 1.45;
    }

    return Math.max(85, Math.round(interval));
  }

  function sound(freq = 550, duration = 0.08) {
    if (!settings.sound) return;

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;

      if (!audioContext) audioContext = new AC();
      if (audioContext.state === "suspended") audioContext.resume();

      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.055, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + duration
      );

      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch (_) {}
  }

  function vibrate() {
    if (!settings.vibration) return;

    try {
      if (navigator.vibrate) navigator.vibrate(25);
    } catch (_) {}
  }

  // --------------------------------------------------
  // Settings
  // --------------------------------------------------

  function applySettings() {
    const color = new THREE.Color(settings.snakeColor);

    snakeMaterial.color.copy(color);
    snakeMaterial.emissive.copy(color);
    headMaterial.emissive.copy(color);

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        settings.quality === "high" ? 1.7 : 1.25
      )
    );

    renderer.setSize(window.innerWidth, window.innerHeight);

    $("best").textContent = best;
    $("menuBest").textContent = best;
    $("games").textContent = games;

    $("speed").value = settings.speed;
    $("quality").value = settings.quality;
    $("snakeColor").value = settings.snakeColor;
    $("sound").checked = settings.sound;
    $("vibration").checked = settings.vibration;
  }

  function saveSettings() {
    settings.speed = $("speed").value;
    settings.quality = $("quality").value;
    settings.snakeColor = $("snakeColor").value;
    settings.sound = $("sound").checked;
    settings.vibration = $("vibration").checked;

    try {
      localStorage.setItem(
        "neon3d-settings",
        JSON.stringify(settings)
      );
    } catch (_) {}

    applySettings();
    closeSettings();

    if (state === "playing") {
      clearInterval(timer);
      timer = setInterval(step, speedMs());
    }
  }

  // --------------------------------------------------
  // Game lifecycle
  // --------------------------------------------------

  function startGame() {
    clearInterval(timer);
    timer = null;

    removePowerup();
    clearParticles();

    activeEffect = null;
    effectUntil = 0;
    foodsCollected = 0;
    toastUntil = 0;
    lastJoystickDirection = "";

    $("menu").classList.add("hidden");
    $("pause").classList.add("hidden");
    $("result").classList.add("hidden");
    $("settings").classList.add("hidden");
    $("hud").classList.remove("hidden");
    $("joystick").classList.remove("hidden");
    $("hint").classList.remove("hidden");
    $("toast").textContent = "";

    score = 0;

    snake = [
      { x: 16, z: 19 },
      { x: 16, z: 20 },
      { x: 16, z: 21 },
      { x: 16, z: 22 }
    ];

    direction = { x: 0, z: -1 };
    nextDirection = { x: 0, z: -1 };
    state = "playing";

    games++;
    saveNumber("neon3d-games", games);

    $("score").textContent = score;
    $("best").textContent = best;
    $("games").textContent = games;

    updateSnakeMeshes();
    randomFood();
    updateCamera();

    if (state === "playing") {
      timer = setInterval(step, speedMs());
    }

    sound(620, 0.12);
  }

  function turn(dx, dz) {
    if (state !== "playing") return;

    if (dx === -direction.x && dz === -direction.z) return;

    nextDirection = { x: dx, z: dz };
  }

  function step() {
    if (state !== "playing") return;

    if (activeEffect && Date.now() >= effectUntil) {
      activeEffect = null;
      clearInterval(timer);
      timer = setInterval(step, speedMs());
    }

    direction = { ...nextDirection };

    const head = {
      x: snake[0].x + direction.x,
      z: snake[0].z + direction.z
    };

    const ate = head.x === food.x && head.z === food.z;

    const collectedPowerup = !!powerup &&
      head.x === powerup.x &&
      head.z === powerup.z;

    const body = ate ? snake : snake.slice(0, -1);

    if (
      head.x < 0 || head.x >= GRID ||
      head.z < 0 || head.z >= GRID ||
      body.some(p => p.x === head.x && p.z === head.z)
    ) {
      finish(false);
      return;
    }

    if (ate && foodMesh) {
      spawnParticles(foodMesh.position.clone(), COLORS.pink, 18);
    }

    snake.unshift(head);

    if (ate) {
      score += 10;
      foodsCollected++;

      if (score > best) {
        best = score;
        saveNumber("neon3d-best", best);
      }

      $("score").textContent = score;
      $("best").textContent = best;
      $("menuBest").textContent = best;

      sound(800, 0.06);
      vibrate();

      if (!randomFood()) return;

      if (foodsCollected % 3 === 0) {
        spawnPowerup();
      }

      clearInterval(timer);
      timer = setInterval(step, speedMs());
    } else {
      snake.pop();
    }

    updateSnakeMeshes();

    if (collectedPowerup) {
      collectPowerup();
    }
  }

  function finish(won) {
    if (state !== "playing") return;

    clearInterval(timer);
    timer = null;
    state = "over";

    removePowerup();
    activeEffect = null;
    effectUntil = 0;

    $("toast").textContent = "";

    $("resultTitle").textContent = won
      ? "🏆 انتصار أسطوري!"
      : "انتهت الجولة!";

    $("resultText").textContent = won
      ? "ملأت الساحة بالكامل! أداء مذهل."
      : "اصطدمت بعائق. جرّب مرة أخرى وحطّم رقمك القياسي.";

    $("finalScore").textContent = score;
    $("result").classList.remove("hidden");
    $("joystick").classList.add("hidden");
    $("hint").classList.add("hidden");

    sound(won ? 950 : 180, 0.22);
  }

  function pauseGame() {
    if (state !== "playing") return;

    state = "paused";
    clearInterval(timer);
    timer = null;

    $("pause").classList.remove("hidden");
  }

  function resumeGame() {
    if (state !== "paused") return;

    $("pause").classList.add("hidden");
    state = "playing";
    timer = setInterval(step, speedMs());
  }

  function goMenu() {
    clearInterval(timer);
    timer = null;
    state = "menu";

    removePowerup();
    clearParticles();

    activeEffect = null;
    effectUntil = 0;
    lastJoystickDirection = "";

    $("menu").classList.remove("hidden");
    $("pause").classList.add("hidden");
    $("result").classList.add("hidden");
    $("settings").classList.add("hidden");
    $("hud").classList.add("hidden");
    $("joystick").classList.add("hidden");
    $("hint").classList.add("hidden");
    $("toast").textContent = "";

    $("menuBest").textContent = best;
    $("games").textContent = games;
  }

  function openSettings() {
    $("settings").classList.remove("hidden");
  }

  function closeSettings() {
    $("settings").classList.add("hidden");
  }

  // --------------------------------------------------
  // Input
  // --------------------------------------------------

  $("playBtn").addEventListener("click", startGame);
  $("retryBtn").addEventListener("click", startGame);
  $("resumeBtn").addEventListener("click", resumeGame);
  $("pauseBtn").addEventListener("click", pauseGame);
  $("menuBtn").addEventListener("click", goMenu);
  $("pauseMenuBtn").addEventListener("click", goMenu);
  $("resultMenuBtn").addEventListener("click", goMenu);
  $("settingsBtn").addEventListener("click", openSettings);
  $("pauseSettingsBtn").addEventListener("click", openSettings);
  $("saveSettings").addEventListener("click", saveSettings);
  $("closeSettings").addEventListener("click", closeSettings);

  document.addEventListener("keydown", e => {
    const keys = {
      ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
      ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
      ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
      ArrowRight: [1, 0], d: [1, 0], D: [1, 0]
    };

    if (e.key === "Escape" || e.key.toLowerCase() === "p") {
      if (state === "playing") pauseGame();
      else if (state === "paused") resumeGame();
      return;
    }

    if (keys[e.key] && state === "playing") {
      e.preventDefault();
      turn(...keys[e.key]);
    }
  });

  const joystick = $("joystick");
  const stick = $("stick");

  function resetJoystick() {
    stick.style.transform = "translate(0px,0px)";
    joystickPointer = null;
  }

  joystick.addEventListener("pointerdown", e => {
    if (state !== "playing") return;

    joystickPointer = e.pointerId;
    joystick.setPointerCapture(e.pointerId);

    const r = joystick.getBoundingClientRect();

    joystickOrigin = {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2
    };

    moveJoystick(e);
  });

  function moveJoystick(e) {
    if (joystickPointer !== e.pointerId) return;

    let dx = e.clientX - joystickOrigin.x;
    let dy = e.clientY - joystickOrigin.y;

    const max = 42;
    const len = Math.hypot(dx, dy);

    if (len > max) {
      dx = dx / len * max;
      dy = dy / len * max;
    }

    stick.style.transform = `translate(${dx}px,${dy}px)`;

    if (Math.hypot(dx, dy) < 13) return;

    let name;

    if (Math.abs(dx) > Math.abs(dy)) {
      name = dx > 0 ? "right" : "left";
    } else {
      name = dy > 0 ? "down" : "up";
    }

    if (name !== lastJoystickDirection) {
      lastJoystickDirection = name;

      const map = {
        up: [0, -1],
        down: [0, 1],
        left: [-1, 0],
        right: [1, 0]
      };

      turn(...map[name]);
    }
  }

  joystick.addEventListener("pointermove", moveJoystick);

  function endJoystick(e) {
    if (joystickPointer !== e.pointerId) return;

    resetJoystick();
    lastJoystickDirection = "";
  }

  joystick.addEventListener("pointerup", endJoystick);
  joystick.addEventListener("pointercancel", endJoystick);
  joystick.addEventListener("lostpointercapture", resetJoystick);

  // --------------------------------------------------
  // Animation loop
  // --------------------------------------------------

  function animate(time) {
    requestAnimationFrame(animate);

    const seconds = time / 1000;
    const delta = lastTime
      ? Math.min((time - lastTime) / 1000, 0.05)
      : 0;

    lastTime = time;

    updateParticles(delta);
    updatePowerup(time);

    if (toastUntil && Date.now() >= toastUntil) {
      $("toast").textContent = "";
      toastUntil = 0;
    }

    if (foodMesh) {
      foodMesh.rotation.y = seconds * 1.5;
      foodMesh.rotation.x = Math.sin(seconds) * 0.25;
      foodMesh.position.y = 0.55 + Math.sin(seconds * 2.5) * 0.12;

      if (foodLight) {
        foodLight.position.copy(foodMesh.position);
      }
    }

    if (segments.length) {
      updateCamera();

      segments.forEach((mesh, i) => {
        if (i > 0) {
          mesh.position.y =
            0.42 + Math.sin(seconds * 4 - i * 0.5) * 0.035;
        }
      });
    }

    renderer.render(scene, camera);
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applySettings();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing") {
      pauseGame();
    }
  });

  applySettings();

  snake = [
    { x: 16, z: 19 },
    { x: 16, z: 20 },
    { x: 16, z: 21 },
    { x: 16, z: 22 }
  ];

  updateSnakeMeshes();
  randomFood();
  updateCamera();

  requestAnimationFrame(animate);
})();
