// =============================================================
//  PAC-MAN: HORROR  —  game.js
// =============================================================

// ─── CONSTANTS ───────────────────────────────────────────────
const TILE = 32;
const COLS = 21;
const ROWS = 21;

// 0 = open path  1 = wall  (2 = pellet added phase 3, 3 = debuff added phase 3)
const RAW_MAZE = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  [1,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,1],
  [1,1,1,1,0,1,0,0,0,0,0,0,0,0,0,1,0,1,1,1,1],
  [1,1,1,1,0,1,0,1,1,0,0,0,1,1,0,1,0,1,1,1,1],
  [0,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0],
  [1,1,1,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,1,1,1],
  [1,1,1,1,0,1,0,0,0,0,0,0,0,0,0,1,0,1,1,1,1],
  [1,1,1,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
  [1,1,0,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,0,1,1],
  [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  [1,0,1,1,1,1,1,1,0,1,1,1,0,1,1,1,1,1,1,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const maze = RAW_MAZE.map(row => [...row]);

// ─── CANVAS SETUP ────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

canvas.width  = COLS * TILE;
canvas.height = ROWS * TILE;

// ─── HORROR PALETTE ──────────────────────────────────────────
const CLR = {
  bg:       '#050008',
  wall:     '#1a0a2e',
  wallGlow: '#4b0082',
  wallEdge: '#6a0dad',
  floor:    '#0a0012',
  pacBody:  '#f5c518',
  text:     '#cc00cc',
  textGlow: '#ff00ff',
};

// ─── PAC-MAN STATE ───────────────────────────────────────────
const PAC_RADIUS   = TILE * 0.42;
const PAC_SPEED    = 2.8;          // px per frame
const SNAP_THRESH  = 8;            // px tolerance for lane-snapping on turns

const pacman = {
  x:        10 * TILE + TILE / 2,  // pixel-center
  y:        16 * TILE + TILE / 2,
  dir:      { x: 0, y: 0 },        // current movement direction
  nextDir:  { x: 0, y: 0 },        // buffered next direction
  speed:    PAC_SPEED,
  mouth:    0,
  mouthDir: 1,
  moving:   false,
};

// ─── INPUT ───────────────────────────────────────────────────
const KEY_MAP = {
  ArrowUp:    { x:  0, y: -1 },
  ArrowDown:  { x:  0, y:  1 },
  ArrowLeft:  { x: -1, y:  0 },
  ArrowRight: { x:  1, y:  0 },
  KeyW:       { x:  0, y: -1 },
  KeyS:       { x:  0, y:  1 },
  KeyA:       { x: -1, y:  0 },
  KeyD:       { x:  1, y:  0 },
};

document.addEventListener('keydown', e => {
  const d = KEY_MAP[e.code];
  if (!d) return;
  e.preventDefault();

  // Validate against the nearest tile centre so only reachable directions are buffered.
  // Using fully-snapped centre (no threshold here) means a wall in that direction
  // is detected regardless of where Pac-Man is within the current tile.
  const cx = snapToLane(pacman.x);
  const cy = snapToLane(pacman.y);
  if (clearAt(cx + d.x * PAC_SPEED, cy + d.y * PAC_SPEED)) {
    pacman.nextDir = d;
  }
});

// ─── HELPERS ─────────────────────────────────────────────────
function tileAt(col, row) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return 1;
  return maze[row][col];
}

// Returns true if a circle of radius r centered at (nx,ny) overlaps no walls.
// Uses 8 probe points around the perimeter so diagonal hugging works well.
function clearAt(nx, ny, r) {
  r = r ?? PAC_RADIUS * 0.78;
  const offsets = [
    [r, 0], [-r, 0], [0, r], [0, -r],
    [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7],
    [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7],
  ];
  for (const [ox, oy] of offsets) {
    const col = Math.floor((nx + ox) / TILE);
    const row = Math.floor((ny + oy) / TILE);
    if (tileAt(col, row) === 1) return false;
  }
  return true;
}

// Snap a pixel coordinate to the nearest tile centre on one axis.
// Subtract TILE/2 first so Math.round lands on the correct tile index.
function snapToLane(v) {
  return Math.round((v - TILE / 2) / TILE) * TILE + TILE / 2;
}

// ─── MOVEMENT UPDATE ─────────────────────────────────────────
function updatePacMan() {
  const { nextDir, dir, speed } = pacman;

  // Try to turn into buffered direction.
  // Only allow if we're close enough to a tile centre on the cross-axis.
  if (nextDir.x !== 0 || nextDir.y !== 0) {
    let tryX = pacman.x;
    let tryY = pacman.y;

    // Snap the perpendicular axis when within threshold
    if (nextDir.x !== 0) {
      const snapped = snapToLane(pacman.y);
      if (Math.abs(pacman.y - snapped) <= SNAP_THRESH) {
        tryY = snapped;
      }
    }
    if (nextDir.y !== 0) {
      const snapped = snapToLane(pacman.x);
      if (Math.abs(pacman.x - snapped) <= SNAP_THRESH) {
        tryX = snapped;
      }
    }

    const nx = tryX + nextDir.x * speed;
    const ny = tryY + nextDir.y * speed;

    if (clearAt(nx, ny)) {
      pacman.x   = tryX;
      pacman.y   = tryY;
      pacman.dir = nextDir;
    }
  }

  // Continue in current direction
  if (pacman.dir.x !== 0 || pacman.dir.y !== 0) {
    const nx = pacman.x + pacman.dir.x * speed;
    const ny = pacman.y + pacman.dir.y * speed;

    if (clearAt(nx, ny)) {
      pacman.x = nx;
      pacman.y = ny;
      pacman.moving = true;
    } else {
      pacman.moving = false;
    }
  }

  // Tunnel wrap — row 10 exits left/right edge
  if (pacman.x < -TILE / 2)              pacman.x = canvas.width  + TILE / 2;
  if (pacman.x > canvas.width + TILE / 2) pacman.x = -TILE / 2;
}

// ─── RENDERING ───────────────────────────────────────────────
function drawBackground() {
  ctx.fillStyle = CLR.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawMaze() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE;
      const y = r * TILE;

      if (maze[r][c] === 1) {
        ctx.fillStyle = CLR.wall;
        ctx.fillRect(x, y, TILE, TILE);

        ctx.strokeStyle = CLR.wallEdge;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);

        ctx.fillStyle = CLR.wallGlow;
        for (const [cx2, cy2] of [[x+2,y+2],[x+TILE-2,y+2],[x+2,y+TILE-2],[x+TILE-2,y+TILE-2]]) {
          ctx.beginPath();
          ctx.arc(cx2, cy2, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = CLR.floor;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = 'rgba(74,0,130,0.15)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, TILE, TILE);
      }
    }
  }
}

function drawPacMan() {
  const { x, y, mouth, dir, moving } = pacman;

  // Facing angle
  let facing = 0;
  if (dir.x === -1)      facing = Math.PI;
  else if (dir.y === -1) facing = -Math.PI / 2;
  else if (dir.y ===  1) facing = Math.PI / 2;

  // Mouth only animates while moving
  const mouthAngle = moving ? 0.15 + mouth * 0.22 : 0.18;

  // Glow halo
  const grad = ctx.createRadialGradient(x, y, PAC_RADIUS * 0.3, x, y, PAC_RADIUS * 1.6);
  grad.addColorStop(0, 'rgba(245,197,24,0.25)');
  grad.addColorStop(1, 'rgba(245,197,24,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, PAC_RADIUS * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = CLR.pacBody;
  ctx.shadowColor = '#f5c518';
  ctx.shadowBlur  = 12;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, PAC_RADIUS, facing + mouthAngle, facing + Math.PI * 2 - mouthAngle);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // Bloodshot eye — offset forward along facing then always shift upward in screen space
  const eyeX = x + Math.cos(facing) * PAC_RADIUS * 0.4;
  const eyeY = y + Math.sin(facing) * PAC_RADIUS * 0.4 - PAC_RADIUS * 0.38;

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, PAC_RADIUS * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(180,0,0,0.6)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI * 2 / 4) * i;
    ctx.beginPath();
    ctx.moveTo(eyeX, eyeY);
    ctx.lineTo(eyeX + Math.cos(a) * PAC_RADIUS * 0.15, eyeY + Math.sin(a) * PAC_RADIUS * 0.15);
    ctx.stroke();
  }

  ctx.fillStyle = '#600';
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, PAC_RADIUS * 0.09, 0, Math.PI * 2);
  ctx.fill();
}

function drawHUD() {
  // Watermark
  ctx.fillStyle = 'rgba(180,0,180,0.12)';
  ctx.font = `bold ${TILE * 0.7}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('PAC-MAN: HORROR', canvas.width / 2, canvas.height / 2);
  ctx.textAlign = 'left';

  ctx.fillStyle = CLR.text;
  ctx.shadowColor = CLR.textGlow;
  ctx.shadowBlur  = 8;
  ctx.font = `bold ${TILE * 0.55}px "Courier New", monospace`;
  ctx.fillText('SCORE: 0', TILE * 0.4, TILE * 0.7);

  ctx.fillText('LIVES: ♥♥♥', canvas.width - TILE * 3.5, TILE * 0.7);
  ctx.shadowBlur = 0;

  // Tunnel indicator arrows (subtle)
  ctx.fillStyle = 'rgba(180,0,180,0.35)';
  ctx.font = `${TILE * 0.6}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('◄', TILE * 0.4, 10 * TILE + TILE * 0.65);
  ctx.fillText('►', canvas.width - TILE * 0.4, 10 * TILE + TILE * 0.65);
  ctx.textAlign = 'left';
}

// ─── MOUTH ANIMATION ─────────────────────────────────────────
function animateMouth() {
  if (!pacman.moving) return;
  pacman.mouth += 0.1 * pacman.mouthDir;
  if (pacman.mouth >= 1) { pacman.mouth = 1; pacman.mouthDir = -1; }
  if (pacman.mouth <= 0) { pacman.mouth = 0; pacman.mouthDir =  1; }
}

// ─── MAIN LOOP ───────────────────────────────────────────────
function gameLoop() {
  updatePacMan();
  drawBackground();
  drawMaze();
  drawPacMan();
  drawHUD();
  animateMouth();
  requestAnimationFrame(gameLoop);
}

gameLoop();
