
import * as THREE from "three";

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const GRID = 32;
  const CELL = 1.5;
  const HALF = GRID * CELL / 2;

  const COLORS = {
    green: 0x00ff9c,
    pink: 0xff00e5,
    cyan: 0x00d9ff,
    floor: 0x070b18
  };

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
        snakeColor: /^#[0-9a-f]{6}$/i.test(raw.snakeColor || "")
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
      const n = Number(localStorage.getItem(key));
      return Number.isFinite(n) && n >= 0 ? n : 0;
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
  let snake = [];
  let previousSnake = [];

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
  let particles = [];
  const MAX_PARTICLES = 90;

  let audioContext = null;
  let lastTime = 0;
  let accumulator = 0;
  let toastUntil = 0;

  let joystickPointer = null;
  let joystickOrigin = { x: 0, y: 0 };
  let lastJoystickDirection = "";

  const canvas = $("world");

  // --------------------------------------------------
  // Three.js renderer
  // --------------------------------------------------

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050510);
  scene.fog = new THREE.FogExp2(0x050510, 0.009);

  const camera = new THREE.OrthographicCamera(
    -21, 21, 21, -21, 0.1, 180
  );

  // كاميرا علوية تتبع الثعبان، مع اتجاه ثابت للساحة.
  camera.up.set(0, 0, -1);
  camera.position.set(0, 60, 0.01);
  camera.lookAt(0, 0, 0);

  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.quality === "high",
      alpha: false,
      powerPreference: "high-performance"
    });
  } catch (_) {
    $("resultTitle").textContent =
      "الجهاز لا يدعم الرسومات المطلوبة";
    $("resultText").textContent =
      "جرّب متصفحًا أو جهازًا يدعم WebGL.";
    $("menu").classList.add("hidden");
    $("result").classList.remove("hidden");
    return;
  }

  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio || 1,
      settings.quality === "high" ? 1.35 : 1
    )
  );

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  function resizeCamera() {
    const aspect = window.innerWidth / window.innerHeight;

    // مساحة رؤية ثابتة نسبيًا مع مراعاة الشاشات الطولية.
    const viewHeight = 42;
    const viewWidth = viewHeight * aspect;

    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;

    camera.updateProjectionMatrix();

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        settings.quality === "high" ? 1.35 : 1
      )
    );

    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --------------------------------------------------
  // Lighting and arena
  // --------------------------------------------------

  scene.add(
    new THREE.HemisphereLight(0x91caff, 0x101020, 2)
  );

  const mainLight = new THREE.DirectionalLight(0xffffff, 2);
  mainLight.position.set(8, 16, 5);
  scene.add(mainLight);

  const greenLight = new THREE.PointLight(
    COLORS.green, 9, 32
  );
  greenLight.position.set(-8, 4, -8);
  scene.add(greenLight);

  const pinkLight = new THREE.PointLight(
    COLORS.pink, 7, 25
  );
  pinkLight.position.set(8, 3, 8);
  scene.add(pinkLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID * CELL, GRID * CELL),
    new THREE.MeshStandardMaterial({
      color: COLORS.floor,
      roughness: 0.85,
      metalness: 0.1
    })
  );

  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.08;
  scene.add(floor);

  const grid = new THREE.GridHelper(
    GRID * CELL, GRID, COLORS.green, 0x173047
  );

  grid.position.y = -0.04;
  scene.add(grid);

  const borderMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.green,
    emissive: COLORS.green,
    emissiveIntensity: 1.5,
    metalness: 0.2,
    roughness: 0.4
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

  // --------------------------------------------------
  // Snake
  // --------------------------------------------------

  const snakeMaterial = new THREE.MeshStandardMaterial({
    color: settings.snakeColor,
    emissive: settings.snakeColor,
    emissiveIntensity: 0.75,
    roughness: 0.3,
    metalness: 0.15
  });

  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9fff2,
    emissive: settings.snakeColor,
    emissiveIntensity: 1,
    roughness: 0.25
  });

  const segmentGeometry = new THREE.SphereGeometry(
    0.48, 12, 8
  );

  const headGeometry = new THREE.SphereGeometry(
    0.53, 16, 10
  );

  function gridPosition(p) {
    return new THREE.Vector3(
      (p.x - (GRID - 1) / 2) * CELL,
      0.48,
      (p.z - (GRID - 1) / 2) * CELL
    );
  }

  function makeSnakeMesh(isHead) {
    const mesh = new THREE.Mesh(
      isHead ? headGeometry : segmentGeometry,
      isHead ? headMaterial : snakeMaterial
    );

    scene.add(mesh);
    return mesh;
  }

  function ensureSnakeMeshes() {
    while (segments.length < snake.length) {
      segments.push(
        makeSnakeMesh(segments.length === 0)
      );
    }

    while (segments.length > snake.length) {
      scene.remove(segments.pop());
    }

    segments.forEach((mesh, i) => {
      mesh.material = i === 0
        ? headMaterial
        : snakeMaterial;

      mesh.scale.setScalar(
        i === 0 ? 1.05 : Math.max(0.72, 1 - i * 0.008)
      );
    });
  }

  // تحريك مرئي تدريجي بين خلايا الشبكة بدل القفز كل خطوة.
  function renderSnake(alpha, seconds) {
    ensureSnakeMeshes();

    segments.forEach((mesh, i) => {
      const current = snake[i];
      const previous = previousSnake[i] || current;

      const from = gridPosition(previous);
      const to = gridPosition(current);

      mesh.position.set(
        THREE.MathUtils.lerp(from.x, to.x, alpha),
        0.44 + Math.sin(seconds * 4 - i * 0.35) * 0.025,
        THREE.MathUtils.lerp(from.z, to.z, alpha)
      );
    });

    if (segments.length) {
      segments[0].rotation.y = Math.atan2(
        direction.x, direction.z
      );
    }
  }

  // --------------------------------------------------
  // Smooth overhead camera tracking
  // --------------------------------------------------

  const cameraTarget = new THREE.Vector3();
  const cameraDesired = new THREE.Vector3();

  function updateCamera(delta) {
    if (!snake.length) return;

    const head = gridPosition(snake[0]);

    cameraTarget.set(head.x, 0, head.z);

    cameraDesired.set(head.x, 60, head.z + 0.01);

    // حركة تعتمد على الزمن لتكون متقاربة بين الأجهزة.
    const smoothing = 1 - Math.exp(-5 * delta);

    camera.position.x = THREE.MathUtils.lerp(
      camera.position.x, cameraDesired.x, smoothing
    );

    camera.position.z = THREE.MathUtils.lerp(
      camera.position.z, cameraDesired.z, smoothing
    );

    camera.lookAt(cameraTarget);
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

  function randomFreeCell() {
    const free = [];

    for (let z = 0; z < GRID; z++) {
      for (let x = 0; x < GRID; x++) {
        if (snake.some(p => p.x === x && p.z === z)) {
          continue;
        }

        if (powerup && powerup.x === x && powerup.z === z) {
          continue;
        }

        free.push({ x, z });
      }
    }

    if (!free.length) return null;

    return free[Math.floor(Math.random() * free.length)];
  }

  function randomFood() {
    const cell = randomFreeCell();

    if (!cell) {
      finish(true);
      return false;
    }

    removeFood();
    food = cell;

    foodMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.38, 1),
      new THREE.MeshStandardMaterial({
        color: COLORS.pink,
        emissive: COLORS.pink,
        emissiveIntensity: 2.3,
        roughness: 0.25,
        metalness: 0.15
      })
    );

    foodMesh.position.copy(gridPosition(food));
    foodMesh.position.y = 0.55;
    scene.add(foodMesh);

    foodLight = new THREE.PointLight(
      COLORS.pink, 4, 6
    );

    foodLight.position.copy(foodMesh.position);
    scene.add(foodLight);

    return true;
  }

  // --------------------------------------------------
  // Particles: capped for mobile performance
  // --------------------------------------------------

  const particleGeometry = new THREE.SphereGeometry(
    0.055, 5, 5
  );

  function spawnParticles(position, color, count = 12) {
    count = Math.min(
      count,
      MAX_PARTICLES - particles.length
    );

    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false
      });

      const mesh = new THREE.Mesh(
        particleGeometry, material
      );

      mesh.position.copy(position);
      scene.add(mesh);

      particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 2.5 + 0.5,
        vz: (Math.random() - 0.5) * 4,
        life: 0.45 + Math.random() * 0.3,
        maxLife: 0.75
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

      p.vy -= 4 * delta;

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
    if (powerup || state !== "playing") return;

    const cell = randomFreeCell();
    if (!cell) return;

    const types = ["boost", "slow", "bonus"];
    const type = types[
      Math.floor(Math.random() * types.length)
    ];

    const colors = {
      boost: COLORS.green,
      slow: COLORS.cyan,
      bonus: COLORS.pink
    };

    powerup = {
      ...cell,
      type,
      expiresAt: Date.now() + 12000
    };

    const color = colors[type];

    powerupMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.43, 0),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 2.3,
        roughness: 0.25,
        metalness: 0.15
      })
    );

    powerupMesh.position.copy(gridPosition(cell));
    powerupMesh.position.y = 0.65;
    scene.add(powerupMesh);

    powerupLight = new THREE.PointLight(color, 3, 6);
    powerupLight.position.copy(powerupMesh.position);
    scene.add(powerupLight);
  }

  function collectPowerup() {
    if (!powerup) return;

    const collected = { ...powerup };

    const colors = {
      boost: COLORS.green,
      slow: COLORS.cyan,
      bonus: COLORS.pink
    };

    const position = powerupMesh
      ? powerupMesh.position.clone()
      : gridPosition(collected);

    spawnParticles(position, colors[collected.type], 18);
    removePowerup();

    if (collected.type === "bonus") {
      score += 30;
      updateScore();

      $("toast").textContent = "+30 BONUS";
      toastUntil = Date.now() + 1500;

      sound(1050, 0.15);
      vibrate();
      return;
    }

    activeEffect = collected.type;
    effectUntil = Date.now() + 5000;

    $("toast").textContent =
      collected.type === "boost"
        ? "⚡ SPEED BOOST!"
        : "❄ SLOW MOTION";

    toastUntil = Date.now() + 1500;

    sound(collected.type === "boost" ? 1100 : 400, 0.15);
    vibrate();
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
    powerupMesh.position.y =
      0.65 + Math.sin(seconds * 3) * 0.12;

    if (powerupLight) {
      powerupLight.position.copy(powerupMesh.position);
    }
  }

  // --------------------------------------------------
  // Speed, audio and vibration
  // --------------------------------------------------

  function speedMs() {
    const base = {
      slow: 235,
      normal: 175,
      fast: 125
    }[settings.speed] || 175;

    let interval = base - Math.floor(score / 100) * 4;

    if (activeEffect && Date.now() >= effectUntil) {
      activeEffect = null;
    }

    if (activeEffect === "boost") {
      interval *= 0.72;
    } else if (activeEffect === "slow") {
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

      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.frequency.value = freq;

      gain.gain.setValueAtTime(
        0.045, audioContext.currentTime
      );

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
  // Score and settings
  // --------------------------------------------------

  function updateScore() {
    if (score > best) {
      best = score;
      saveNumber("neon3d-best", best);
    }

    $("score").textContent = score;
    $("best").textContent = best;
    $("menuBest").textContent = best;
  }

  function applySettings() {
    const color = new THREE.Color(settings.snakeColor);

    snakeMaterial.color.copy(color);
    snakeMaterial.emissive.copy(color);
    headMaterial.emissive.copy(color);

    resizeCamera();

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
  }

  // --------------------------------------------------
  // Game lifecycle
  // --------------------------------------------------

  function startGame() {
    state = "menu";
    accumulator = 0;

    removeFood();
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

    previousSnake = snake.map(p => ({ ...p }));

    direction = { x: 0, z: -1 };
    nextDirection = { x: 0, z: -1 };

    state = "playing";

    games++;
    saveNumber("neon3d-games", games);

    $("score").textContent = score;
    $("best").textContent = best;
    $("games").textContent = games;

    ensureSnakeMeshes();

    snake.forEach((p, i) => {
      segments[i].position.copy(gridPosition(p));
    });

    randomFood();
    updateCamera(1);

    sound(620, 0.12);
  }

  function turn(dx, dz) {
    if (state !== "playing") return;

    // منع الانعكاس المباشر إلى الخلف.
    if (
      dx === -nextDirection.x &&
      dz === -nextDirection.z
    ) {
      return;
    }

    nextDirection = { x: dx, z: dz };
  }

  function step() {
    if (state !== "playing") return;

    direction = { ...nextDirection };

    const head = {
      x: snake[0].x + direction.x,
      z: snake[0].z + direction.z
    };

    const ate = head.x === food.x && head.z === food.z;

    const collectedPowerup = !!powerup &&
      head.x === powerup.x &&
      head.z === powerup.z;

    // يمكن دخول الخلية التي سيغادرها الذيل في هذه الخطوة.
    const body = ate
      ? snake
      : snake.slice(0, -1);

    if (
      head.x < 0 || head.x >= GRID ||
      head.z < 0 || head.z >= GRID ||
      body.some(p => p.x === head.x && p.z === head.z)
    ) {
      finish(false);
      return;
    }

    previousSnake = snake.map(p => ({ ...p }));

    if (ate && foodMesh) {
      spawnParticles(
        foodMesh.position.clone(), COLORS.pink, 12
      );
    }

    snake.unshift(head);

    if (!ate) {
      snake.pop();
    } else {
      score += 10;
      foodsCollected++;

      updateScore();
      sound(800, 0.06);
      vibrate();

      if (!randomFood()) return;

      if (foodsCollected % 3 === 0) {
        spawnPowerup();
      }
    }

    if (collectedPowerup) {
      collectPowerup();
    }
  }

  function finish(won) {
    if (state !== "playing") return;

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
    accumulator = 0;

    $("pause").classList.remove("hidden");
  }

  function resumeGame() {
    if (state !== "paused") return;

    $("pause").classList.add("hidden");
    state = "playing";
    accumulator = 0;
  }

  function goMenu() {
    state = "menu";
    accumulator = 0;

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
  // Keyboard and buttons
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
      ArrowUp: [0, -1],
      w: [0, -1],
      W: [0, -1],
      ArrowDown: [0, 1],
      s: [0, 1],
      S: [0, 1],
      ArrowLeft: [-1, 0],
      a: [-1, 0],
      A: [-1, 0],
      ArrowRight: [1, 0],
      d: [1, 0],
      D: [1, 0]
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

  // --------------------------------------------------
  // Touch joystick
  // --------------------------------------------------

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
  // Main animation loop
  // --------------------------------------------------

  function animate(time) {
    requestAnimationFrame(animate);

    const seconds = time / 1000;
    const delta = lastTime
      ? Math.min((time - lastTime) / 1000, 0.05)
      : 0;

    lastTime = time;

    if (state === "playing") {
      accumulator += delta * 1000;

      // منطق اللعبة ثابت التوقيت، والرسم مستقل عنه.
      let safety = 0;

      while (
        state === "playing" &&
        accumulator >= speedMs() &&
        safety < 4
      ) {
        const interval = speedMs();

        accumulator -= interval;
        step();
        safety++;
      }

      // منع قفزة كبيرة بعد تباطؤ الجهاز.
      if (safety >= 4) accumulator = 0;
    } else {
      accumulator = 0;
    }

    const alpha = state === "playing"
      ? Math.min(1, accumulator / speedMs())
      : 1;

    updateParticles(delta);
    updatePowerup(time);

    if (toastUntil && Date.now() >= toastUntil) {
      $("toast").textContent = "";
      toastUntil = 0;
    }

    if (foodMesh) {
      foodMesh.rotation.y = seconds * 1.5;
      foodMesh.rotation.x = Math.sin(seconds) * 0.2;
      foodMesh.position.y =
        0.55 + Math.sin(seconds * 2.5) * 0.1;

      if (foodLight) {
        foodLight.position.copy(foodMesh.position);
      }
    }

    renderSnake(alpha, seconds);

    // الكاميرا تتبع الثعبان من الأعلى بسلاسة.
    updateCamera(delta);

    renderer.render(scene, camera);
  }

  window.addEventListener("resize", resizeCamera);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing") {
      pauseGame();
    }
  });

  // --------------------------------------------------
  // Initialisation
  // --------------------------------------------------

  applySettings();

  snake = [
    { x: 16, z: 19 },
    { x: 16, z: 20 },
    { x: 16, z: 21 },
    { x: 16, z: 22 }
  ];

  previousSnake = snake.map(p => ({ ...p }));

  ensureSnakeMeshes();

  snake.forEach((p, i) => {
    segments[i].position.copy(gridPosition(p));
  });

  randomFood();
  updateCamera(1);

  requestAnimationFrame(animate);
})();
