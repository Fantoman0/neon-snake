NEON SNAKE 3D

Project Documentation & Development Reference

Project: NEON SNAKE
Version: 2.0.0
Application ID: "com.neonsnake.game"
Platform: Web / Android (Capacitor)
Language: Arabic UI ("ar", RTL)
Status: Existing project documented; further development ongoing.

---

1. Purpose of This Document

This file is the main technical reference for NEON SNAKE 3D.

It records:

- Project structure and technologies.
- Game mechanics and implementation details.
- Rendering, camera, input, and interface systems.
- Settings and persistent data.
- Build and Android integration.
- Known issues and technical debt.
- Development decisions and future plans.
- A changelog of project updates.

When continuing development in a new conversation, provide this file together with any newer source files or changes not yet recorded here.

Documentation rule: Do not assume that a feature is implemented merely because its UI element exists. Verify implementation against the current source code.

---

2. Project Overview

NEON SNAKE 3D is a neon-themed Snake arcade game built with JavaScript and Three.js.

The game combines classic grid-based Snake mechanics with a three-dimensional scene, glowing materials, colored lighting, a following camera, and touch controls.

Current documented features

- 3D scene rendered with Three.js.
- Grid-based snake movement.
- Food collection and score progression.
- Collision detection against walls and the snake's body.
- Gradually increasing movement speed as the score increases.
- Best-score and game-count persistence.
- Keyboard controls.
- Virtual joystick for touch devices.
- Start, pause, resume, game-over, and retry flows.
- Configurable movement speed, graphics quality, and snake color.
- Procedural oscillator-based sound effects.
- Optional vibration when collecting food.
- Responsive Arabic right-to-left interface.
- Android packaging support through Capacitor.

These features are identified in the provided source code. Actual runtime behavior and device compatibility have not yet been verified through a complete test session.

---

3. Technology Stack

Technology| Version / Configuration| Purpose
JavaScript| ES modules| Game logic and application behavior
Three.js| "^0.180.0"| 3D rendering, scene, meshes, lighting, and camera
Capacitor Core| "^7.4.3"| Native application integration
Capacitor Android| "^7.4.3"| Android platform integration
Capacitor CLI| "^7.4.3"| Capacitor project commands
esbuild| "^0.25.0"| JavaScript bundling and minification
HTML / CSS| Native| Interface and responsive layout
localStorage| Browser / WebView| Local settings and statistics persistence

Project metadata

The supplied "package.json" specifies:

- Package name: "neon-snake"
- Package version: "2.0.0"
- Private package: "true"
- Android application ID: "com.neonsnake.game"
- Application display name: "NEON SNAKE"
- Web output directory: "www"

No dedicated test script is currently defined in the supplied "package.json".

---

4. Project Structure

The following structure is based on the supplied build configuration and source files. Items marked as conditional must be verified against the actual repository.

neon-snake/
├── package.json
├── capacitor.config.json          # If this is the actual config filename
├── public/
│   ├── index.html                 # Main UI and CSS
│   └── game.js                    # Main game implementation
├── www/                           # Generated web build
│   ├── index.html
│   └── game.js
├── android/                       # Capacitor Android project, if present
└── scripts/
    └── prepare.js                 # Possible location of copy script;
                                   # actual filename is unconfirmed

Important distinction

The copy script supplied during development copies "public/index.html" into "www/index.html".

However, the supplied "package.json" uses a different build implementation: it copies HTML using "cp" and bundles "public/game.js" using esbuild.

The relationship between the standalone copy script and the active build process has not yet been confirmed.

The generated "www" directory should be treated as build output. Normally, modify files under "public/", then rebuild rather than editing generated files directly.

---

5. Build and Android Workflow

Build command

npm run build

The configured command performs the following operations:

1. Creates "www" if necessary.
2. Copies "public/index.html" to "www/index.html".
3. Bundles "public/game.js".
4. Minifies the bundle.
5. Produces an IIFE bundle at "www/game.js".

Equivalent configured command:

mkdir -p www &&
cp public/index.html www/index.html &&
esbuild public/game.js --bundle --minify --format=iife --outfile=www/game.js

The command assumes the "esbuild" executable is available, normally through installed npm dependencies.

Android synchronization

npm run build:android

This runs:

cap sync android

The "build:android" script synchronizes Capacitor web assets and native platform dependencies. It does not itself invoke a complete Android APK build.

Capacitor configuration

The supplied configuration is:

{
  "appId": "com.neonsnake.game",
  "appName": "NEON SNAKE",
  "webDir": "www",
  "server": {
    "androidScheme": "https"
  }
}

Meaning:

- "appId": Android/application identifier.
- "appName": Display name.
- "webDir": Location of built web assets.
- "androidScheme": URL scheme used by the Android WebView integration.

Do not change the application ID casually because it affects application identity and update/install compatibility.

Recommended development workflow

1. Edit source files in "public/".
2. Run "npm run build".
3. Test the web build.
4. Run "npm run build:android" when preparing Android changes.
5. Test on an Android device or emulator.
6. Record verified changes in the changelog.

Android SDK, Java, Gradle, signing, and release configuration requirements have not yet been inspected.

---

6. Interface Reference: "public/index.html"

The HTML document uses Arabic language metadata and right-to-left layout:

<html lang="ar" dir="rtl">

The primary drawing canvas is:

<canvas id="world"></canvas>

The game JavaScript is loaded using:

<script src="./game.js"></script>

Main interface elements

Element ID| Responsibility
"app"| Application container
"world"| Three.js rendering canvas
"hud"| In-game score and action controls
"score"| Current score
"best"| Best score in the HUD
"menuBest"| Best score in the main menu
"games"| Total game count
"pauseBtn"| Pause current game
"menuBtn"| Return to main menu
"joystick"| Touch input region
"stick"| Movable joystick indicator
"hint"| Gameplay instructions
"toast"| Temporary-message element; no active message system has been identified
"menu"| Main menu
"playBtn"| Start a new game
"settingsBtn"| Open settings
"pause"| Pause screen
"resumeBtn"| Resume current game
"pauseSettingsBtn"| Open settings from pause screen
"pauseMenuBtn"| Return to menu from pause screen
"result"| End-of-game screen
"resultTitle"| Result heading
"resultText"| Result description
"finalScore"| Final score
"retryBtn"| Start another game
"resultMenuBtn"| Return to main menu from result screen
"settings"| Settings screen
"speed"| Speed selection
"quality"| Graphics quality selection
"snakeColor"| Snake color selection
"sound"| Sound toggle
"vibration"| Vibration toggle
"saveSettings"| Save selected settings
"closeSettings"| Close settings

Visual design

The CSS defines a dark background and neon green, pink, and cyan accents. It includes:

- Responsive menu cards.
- Neon-bordered statistics.
- Full-screen canvas.
- Virtual joystick.
- Safe-area support.
- Small-screen adjustments.
- Wider-screen joystick placement.
- Blur and glow effects.

The interface disables normal page scrolling and uses touch-oriented interaction styles.

---

7. Game Configuration and World

The main game implementation is in "public/game.js".

Grid

const GRID = 32;
const CELL = 1.5;
const HALF = GRID * CELL / 2;

The logical playfield contains:

- 32 columns.
- 32 rows.
- 1,024 total cells.
- 1.5 world units per cell.
- 48 world units across each side.

Grid coordinates range from "0" through "31" for both "x" and "z".

The grid is mapped to world coordinates with:

function gridPosition(p) {
  return new THREE.Vector3(
    (p.x - (GRID - 1) / 2) * CELL,
    0.48,
    (p.z - (GRID - 1) / 2) * CELL
  );
}

The snake moves on the XZ plane, while Y represents vertical height.

Initial snake

The initial snake consists of four cells:

[
  { x: 16, z: 19 },
  { x: 16, z: 20 },
  { x: 16, z: 21 },
  { x: 16, z: 22 }
]

Its initial direction is:

{ x: 0, z: -1 }

World rendering

The scene contains:

- Dark background.
- Exponential fog.
- Perspective camera.
- Hemisphere lighting.
- Directional lighting.
- Green and pink point lights.
- Standard-material floor.
- Grid helper.
- Four neon boundary walls.

The walls are visual meshes; collision is enforced through grid-coordinate checks.

Snake meshes

The snake uses sphere geometry:

- Head: "SphereGeometry(0.53, 20, 14)".
- Body segments: "SphereGeometry(0.48, 16, 12)".

Segments are created or removed to match the logical snake length.

The head and body use emissive "MeshStandardMaterial" instances. The body segments receive a slight scale variation.

Food

Food is represented by an "IcosahedronGeometry" mesh with pink emissive material and a point light.

The food:

- Spawns at a randomly selected unoccupied grid cell.
- Rotates and oscillates vertically.
- Uses a light that follows the food mesh.
- Is replaced after being collected.

When every cell is occupied, "randomFood()" calls "finish(true)" to declare victory.

---

8. Game Logic

State variables

The game uses the following primary state:

let score = 0;
let state = "menu";
let timer = null;

let snake = [];
let direction = { x: 0, z: -1 };
let nextDirection = { x: 0, z: -1 };

let food = { x: 0, z: 0 };

Known state values:

- "menu"
- "playing"
- "paused"
- "over"

These values are managed manually, rather than through a dedicated state-machine library.

Starting a game

"startGame()":

1. Clears the previous interval.
2. Hides menus and result overlays.
3. Shows the HUD and joystick.
4. Resets score and snake coordinates.
5. Resets direction.
6. Sets state to "playing".
7. Increments and saves the game count.
8. Updates the snake meshes.
9. Spawns food.
10. Updates the camera.
11. Starts the movement interval.
12. Plays a sound.

Direction changes

"turn(dx, dz)" rejects movement directly opposite the current direction.

if (dx === -direction.x && dz === -direction.z) return;

Accepted directions are stored in "nextDirection" and applied by the next game step.

Movement and collision

"step()":

1. Checks that the game is playing.
2. Applies the next direction.
3. Calculates the next head cell.
4. Checks whether that cell contains food.
5. Checks collisions with walls and the relevant snake body cells.
6. Finishes the game on collision.
7. Adds the new head.
8. Adds 10 points if food was collected.
9. Updates the best score when necessary.
10. Plays collection sound and optional vibration.
11. Spawns new food after collection.
12. Removes the tail if food was not collected.
13. Updates mesh positions.

The collision check excludes the current tail cell when the snake is not eating, because the tail moves away during that step. This is appropriate for standard Snake rules.

Scoring

Each food item adds:

score += 10;

The best score is updated whenever the current score exceeds the stored best.

Movement speed

The configured base interval is:

Speed| Base interval
Slow| 235 ms
Normal| 175 ms
Fast| 125 ms

The actual interval is calculated as:

Math.max(85, base - Math.floor(score / 100) * 4)

Movement becomes faster every 100 points, with an interval floor of 85 ms.

The timer is recreated after food collection and when changing speed settings during gameplay.

Game completion

"finish(won)" clears the movement timer, changes the state to "over", updates the result screen, hides touch instructions, and plays a result sound.

The win state is triggered when no free grid cell remains.

---

9. Camera and Animation

Camera

The game uses a "PerspectiveCamera" with:

- Field of view: 63 degrees.
- Near clipping plane: 0.1.
- Far clipping plane: 160.

"updateCamera()" calculates a desired position behind the snake based on its current direction.

The camera moves using interpolation:

camera.position.lerp(desired, 0.11);

It then looks toward a point ahead of the snake.

Animation loop

"animate()" is driven by "requestAnimationFrame".

It continuously:

- Rotates the food.
- Animates the food vertically.
- Updates the food light position.
- Calls camera-follow logic.
- Applies a subtle vertical oscillation to body segments.
- Renders the scene.

The animation loop continues while the game is in the menu or paused state. The movement timer, by contrast, is cleared when pausing or ending a game.

---

10. Input and Controls

Keyboard

The current keyboard mapping is:

Input| Direction
Arrow Up / W| Up ("z - 1")
Arrow Down / S| Down ("z + 1")
Arrow Left / A| Left ("x - 1")
Arrow Right / D| Right ("x + 1")
Escape / P| Toggle pause and resume

Direction input is accepted only while playing.

Touch joystick

The joystick uses Pointer Events:

- "pointerdown"
- "pointermove"
- "pointerup"
- "pointercancel"
- "lostpointercapture"

The pointer displacement is clamped to 42 pixels.

A minimum displacement of 13 pixels is required before a direction is selected. The dominant horizontal or vertical axis determines the direction.

The last joystick direction is tracked to prevent repeated direction updates while the pointer remains in the same directional zone.

Visibility handling

When the document becomes hidden while playing, the game pauses automatically.

This helps prevent gameplay from continuing in the background.

---

11. Settings

Default configuration

const DEFAULTS = {
  speed: "normal",
  quality: "balanced",
  snakeColor: "#00ff9c",
  sound: true,
  vibration: false
};

Persistent storage keys

Key| Contents
"neon3d-settings"| Serialized settings JSON
"neon3d-best"| Best score
"neon3d-games"| Number of games started

Settings are loaded through "loadSettings()" and saved through "saveSettings()".

The game catches localStorage errors to reduce the chance of storage restrictions crashing the application.

Graphics quality

Setting| Antialiasing| Pixel ratio cap
Balanced| Disabled| 1.25
High| Enabled| 1.7

"applySettings()" updates renderer pixel ratio and dimensions, and updates the UI controls.

Snake color

The selected color is applied to the snake's body and the head's emissive material.

Sound

Sound effects are generated using the Web Audio API and oscillator nodes. Frequencies and durations vary for different events.

Audio is skipped when sound is disabled or when the browser does not provide the required audio API.

Vibration

When enabled, the game attempts to vibrate for 25 milliseconds when food is collected, using "navigator.vibrate" if available.

Device support and browser permissions have not been verified.

---

12. Current Technical Findings

These findings come from static code review. They have not yet been confirmed through profiling or a complete runtime test suite.

Finding 1: GPU resource cleanup

"randomFood()" creates a new food geometry, material, and point light when food is replaced.

The previous food mesh and light are removed from the scene, but the code does not explicitly dispose of the previous geometry and material.

Recommended action: Dispose of replaced food geometry and material, and remove and dispose of the old point light where appropriate.

Finding 2: Movement timer architecture

Movement is driven by "setInterval(step, speedMs())", separate from the rendering loop.

This is straightforward for the current game, but makes future features such as temporary slow motion, speed boosts, and pause-safe timing harder to coordinate.

Recommended action: Consider a time-accumulator movement loop driven by "requestAnimationFrame" if advanced timing features are introduced. This is a proposed improvement, not a required rewrite.

Finding 3: Settings validation

"loadSettings()" merges stored JSON with defaults but does not validate the types or allowed values.

Malformed or unexpected stored settings could cause inconsistent behavior.

Recommended action: Validate speed, quality, color, and Boolean settings when loading.

Finding 4: End-state guard

"finish()" does not explicitly reject repeated calls after the game has already ended.

Recommended action: Add an appropriate state guard before performing end-of-game side effects.

Finding 5: Renderer lifecycle

The renderer is created once and resized on window changes. There is no explicit renderer disposal or centralized application teardown.

This is not necessarily a current bug, but should be considered if restartable scenes, route changes, or explicit application shutdown are added.

Finding 6: Build-script duplication

The standalone HTML-copy script and "package.json" build command perform overlapping tasks.

The standalone script's actual filename and whether it is used in production remain unconfirmed.

Recommended action: Verify the repository structure and keep one authoritative build process.

Finding 7: Runtime verification remains outstanding

The following have not yet been confirmed through real execution:

- Mobile performance and memory use.
- Android WebView behavior.
- Full-screen layout across devices.
- Audio and vibration support.
- Actual WebGL fallback behavior.
- Build success in the target environment.

---

13. Development Roadmap

Priorities may be reordered according to the next requested feature.

Phase A — Reliability

- [ ] Dispose of replaced food resources.
- [ ] Validate saved settings.
- [ ] Add an end-state guard.
- [ ] Test collision edge cases.
- [ ] Test full-grid victory.
- [ ] Test pause, resume, retry, and return-to-menu flows.

Phase B — Performance and Controls

- [ ] Profile rendering on lower-end Android devices.
- [ ] Verify resize and orientation handling.
- [ ] Verify joystick behavior on multiple screen sizes.
- [ ] Evaluate a shared timing architecture for movement and animation.
- [ ] Verify renderer quality settings and memory behavior.

Phase C — Gameplay Expansion

Potential features, not currently confirmed as implemented:

- [ ] Power-ups.
- [ ] Obstacles and arena variations.
- [ ] Multiple food types.
- [ ] Combo scoring.
- [ ] Missions and achievements.
- [ ] Difficulty presets.
- [ ] Improved sound design.
- [ ] Additional visual effects.
- [ ] Persistent statistics and high-score history.

Phase D — Release Readiness

- [ ] Confirm build reproducibility.
- [ ] Verify Capacitor configuration and Android project.
- [ ] Test on real Android hardware.
- [ ] Validate offline behavior.
- [ ] Check performance and stability in long sessions.
- [ ] Prepare release build and version notes.

---

14. Changelog

This section must be updated after each confirmed code change.

Version 2.0.0 — Existing supplied project

Status: Version metadata supplied in "package.json". The release history itself has not been independently verified.

Documented implementation includes:

- Three.js-based 3D rendering.
- Grid-based Snake mechanics.
- Food collection and scoring.
- Camera following the snake.
- Neon lighting and materials.
- Keyboard and touch controls.
- Main menu, pause, and result screens.
- Settings for speed, quality, color, sound, and vibration.
- localStorage persistence.
- Capacitor Android integration.
- esbuild bundling.

No changes have been applied to the source files as part of preparing this document.

Future update template

For each new release, add:

### Version X.Y.Z — YYYY-MM-DD

Added:
- ...

Changed:
- ...

Fixed:
- ...

Performance:
- ...

Files changed:
- ...

Tests performed:
- ...

Known limitations:
- ...

Only record a fix as completed after the source has been updated and the result verified to the extent possible.

---

15. Development Rules

When extending NEON SNAKE:

1. Preserve existing gameplay unless a change explicitly requires otherwise.
2. Make targeted changes rather than rewriting unrelated systems.
3. Keep source code under "public/" authoritative for the web build.
4. Do not edit generated "www" files as the permanent implementation.
5. Validate settings and handle unsupported browser APIs safely.
6. Dispose of Three.js resources when they are no longer needed.
7. Keep UI labels and instructions consistent with actual gameplay behavior.
8. Update this README whenever architecture, behavior, build steps, or persistent data changes.
9. Distinguish proposed features from implemented and tested features.
10. Record the files changed, tests performed, and remaining issues for every development task.

---

16. Handoff Checklist for Future Conversations

When continuing development from this document:

- [ ] Read this README first.
- [ ] Read the latest "public/game.js".
- [ ] Read "public/index.html" if UI behavior is involved.
- [ ] Check "package.json" and Capacitor configuration if build behavior is involved.
- [ ] Compare current code against this document.
- [ ] Identify whether the requested feature already exists.
- [ ] Implement only the required changes.
- [ ] Run available tests or build checks.
- [ ] Explain any unverified assumptions.
- [ ] Update the changelog and technical findings.

Current documentation baseline

This README is based on the "package.json", Capacitor configuration, HTML-copy script, "public/index.html", and "public/game.js" supplied in the conversation.

It is a technical handoff document, not a guarantee that the current GitHub repository matches every detail. Reconcile it with the latest source before making substantial changes.
