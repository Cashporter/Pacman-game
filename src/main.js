import Phaser from 'phaser';
import EasyStar from 'easystarjs';

// ─── CONSTANTS ───────────────────────────────────────────────
const TILE             = 32;
const COLS             = 21;
const ROWS             = 21;
const PAC_SPEED        = 3;
const PAC_RADIUS       = TILE * 0.42;
const GHOST_BASE_SPEED = PAC_SPEED * 0.935;  // 0.85 × 1.1
const W                = COLS * TILE;   // 672
const H                = ROWS * TILE;   // 672

// Horror palette
const C = {
  bg:        0x050008,
  wall:      0x1a0a2e,
  wallEdge:  0x6a0dad,
  wallDot:   0x4b0082,
  floor:     0x0a0012,
  gridLine:  0x4a0082,
  pacYellow: 0xf5c518,
  pellet:    0xcc0066,
};

// Debuff definitions
const DEBUFFS = {
  slow:       { name: 'S L O W',       cssColor: '#4499ff', hex: 0x4499ff, duration: 5000 },
  freeze:     { name: 'F R E E Z E',   cssColor: '#ffffff', hex: 0xffffff, duration: 3000 },
  invert:     { name: 'I N V E R T',   cssColor: '#44ff44', hex: 0x44ff44, duration: 5000 },
  ghostBoost: { name: 'G H O S T  +',  cssColor: '#ff6600', hex: 0xff6600, duration: 5000 },
};
const DEBUFF_TYPES = Object.keys(DEBUFFS);

// Ghost spawn definitions
const GHOST_DEFS = [
  { id: 'blinky', spawnCol: 10, spawnRow:  8, color: 0xff2222 },
  { id: 'pinky',  spawnCol:  9, spawnRow:  9, color: 0xff88cc },
  { id: 'inky',   spawnCol: 11, spawnRow:  9, color: 0x00ccff },
  { id: 'clyde',  spawnCol:  6, spawnRow:  8, color: 0xff8800 },
];

// ─── MAZE ────────────────────────────────────────────────────
// 0 = open path   1 = wall   2 = pellet (set in initPellets)
const MAZE_TEMPLATE = [
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

// ─── SOUND ENGINE ────────────────────────────────────────────
// All audio is synthesised with Web Audio API — no files required.
class SoundEngine {
  constructor() {
    this.ctx       = null;
    this.master    = null;
    this.bgmBus    = null;
    this.sfxBus    = null;
    this.bgmActive = false;
    this.bgmStep   = 0;
    this._timer    = null;
  }

  // Lazy-init: AudioContext requires a prior user gesture.
  _boot() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.bgmBus = this.ctx.createGain(); this.bgmBus.gain.value = 0.28;
    this.bgmBus.connect(this.master);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.80;
    this.sfxBus.connect(this.master);
  }

  // Single pitched note with attack-decay envelope.
  _tone(freq, t, dur, wave = 'square', vol = 0.4, bus) {
    bus = bus || this.sfxBus;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + 0.012);
    env.gain.setValueAtTime(vol * 0.75, t + dur * 0.60);
    env.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(env); env.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  // Frequency glide from f0 → f1 with fade-out.
  _sweep(f0, f1, t, dur, wave = 'sawtooth', vol = 0.4, bus) {
    bus = bus || this.sfxBus;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env.gain.setValueAtTime(vol, t);
    env.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(env); env.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  // ── Background Music ───────────────────────────────────────
  // Three-voice step-sequencer loop in B minor (80 BPM).
  // Inspired by Lavender Town: descending lead, root/fifth bass, triangle fill.
  startBGM() {
    this._boot();
    if (this.bgmActive) return;
    this.bgmActive = true;
    this.bgmStep   = 0;
    this._tick();
  }

  stopBGM() {
    this.bgmActive = false;
    clearTimeout(this._timer);
  }

  _tick() {
    if (!this.bgmActive || !this.ctx) return;
    const BPM = 80, beat = 60 / BPM;  // 0.75 s/beat
    const STEPS = 16, AHEAD = 4;
    const now = this.ctx.currentTime;

    // Melody — high square wave (Game Boy horror lead)
    // B minor arc: B5 descends to A4 then climbs back to A5
    const M = [
      987.77, 880.00, 783.99, 739.99,  // B5  A5  G5  F#5
      659.25, 587.33, 554.37, 493.88,  // E5  D5  C#5 B4
      440.00, 493.88, 554.37, 587.33,  // A4  B4  C#5 D5
      659.25, 739.99, 783.99, 880.00,  // E5  F#5 G5  A5
    ];

    // Bass — low square wave (root / fifth)
    const B = [
      123.47, 0, 185.00, 0,  // B2  –  F#3  –
      164.81, 0, 123.47, 0,  // E3  –  B2   –
      110.00, 0, 185.00, 0,  // A2  –  F#3  –
      164.81, 0, 123.47, 0,  // E3  –  B2   –
    ];

    // Inner harmony — triangle wave (B minor chord tones, soft fill)
    const H = [
      293.66, 0, 293.66, 0,  // D4  –  D4  –
      277.18, 0, 293.66, 0,  // C#4 –  D4  –
      220.00, 0, 277.18, 0,  // A3  –  C#4 –
      277.18, 0, 293.66, 0,  // C#4 –  D4  –
    ];

    for (let i = 0; i < AHEAD; i++) {
      const s = (this.bgmStep + i) % STEPS;
      const t = now + i * beat + 0.05;
      if (M[s]) this._tone(M[s], t, beat * 0.72, 'square',   0.38, this.bgmBus);
      if (B[s]) this._tone(B[s], t, beat * 0.90, 'square',   0.30, this.bgmBus);
      if (H[s]) this._tone(H[s], t, beat * 0.62, 'triangle', 0.15, this.bgmBus);
    }

    this.bgmStep = (this.bgmStep + AHEAD) % STEPS;
    this._timer  = setTimeout(() => this._tick(), (AHEAD - 0.5) * beat * 1000);
  }

  // ── Sound Effects ──────────────────────────────────────────

  // Debuff-specific SFX — each has a distinct sonic character.
  sfxDebuff(type) {
    this._boot();
    const now = this.ctx.currentTime;
    switch (type) {
      case 'slow':
        // Deep descending wail — movement grows heavy
        this._sweep(680, 150, now, 0.60, 'sawtooth', 0.55);
        break;
      case 'freeze':
        // Icy crystal burst — five high sine chimes in quick succession
        [2093, 2637, 3136, 2637, 4186].forEach((f, i) =>
          this._tone(f, now + i * 0.065, 0.13, 'sine', 0.32));
        break;
      case 'invert':
        // Tritone stab (Bb4 + E5) — the "devil's interval", world flips
        [466.16, 659.25].forEach(f => this._tone(f, now, 0.28, 'square', 0.32));
        this._tone(311.13, now + 0.16, 0.22, 'square', 0.24);
        break;
      case 'ghostBoost':
        // Dual rising alarm sweeps — danger escalating
        this._sweep(220,  880, now,        0.32, 'square', 0.42);
        this._sweep(220, 1100, now + 0.38, 0.32, 'square', 0.38);
        break;
    }
  }

  // Descending death jingle — sawtooth for crunch.
  sfxLifeLost() {
    this._boot();
    const now = this.ctx.currentTime;
    [440, 392, 349.23, 293.66, 261.63, 220.00].forEach((f, i) =>
      this._tone(f, now + i * 0.11, 0.16, 'sawtooth', 0.52));
  }

  // B minor ascending arpeggio then a long haunting tone.
  sfxWin() {
    this._boot();
    const now = this.ctx.currentTime;
    [246.94, 293.66, 369.99, 493.88, 587.33, 739.99].forEach((f, i) =>
      this._tone(f, now + i * 0.15, 0.26, 'square', 0.44));
    this._tone(987.77, now + 0.95, 1.80, 'triangle', 0.28);
  }

  // Four descending chords + low drone — doom.
  sfxLose() {
    this._boot();
    const now = this.ctx.currentTime;
    [
      [369.99, 493.88, 587.33],
      [329.63, 440.00, 523.25],
      [277.18, 369.99, 493.88],
      [246.94, 329.63, 415.30],
    ].forEach((chord, i) =>
      chord.forEach(f => this._tone(f, now + i * 0.38, 0.52, 'sawtooth', 0.28)));
    this._tone(123.47, now + 1.55, 2.20, 'sawtooth', 0.38);
  }
}

const sound = new SoundEngine();

// ─── GAME SCENE ──────────────────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  // ── create ─────────────────────────────────────────────────
  create() {
    this.maze = MAZE_TEMPLATE.map(r => [...r]);

    // Game state
    this.score        = 0;
    this.lives        = 3;
    this.pelletsTotal = 0;
    this.pelletsEaten = 0;
    this.gameOver     = false;

    // Debuff state
    this.debuffPickup = null;   // { col, row, type } | null
    this.activeDebuff = null;   // { type, endTime }  | null

    // Pac-Man tile-locked state
    this.pac = {
      col: 10, row: 16,
      x: 10 * TILE + TILE / 2,
      y: 16 * TILE + TILE / 2,
      dir:      { x: 0, y: 0 },
      nextDir:  { x: 0, y: 0 },
      progress:   0,
      moving:     false,
      mouthOpen:  0,
      mouthDir:   1,
      invincible: false,
    };

    // ── Graphics layers (depth order) ──────────────────────
    this.mazeGfx   = this.add.graphics().setDepth(0);
    this.pelletGfx = this.add.graphics().setDepth(2);
    this.debuffGfx = this.add.graphics().setDepth(3);
    this.ghostGfx      = this.add.graphics().setDepth(4);
    this.pacGfx        = this.add.graphics().setDepth(5);
    this.atmosphereGfx = this.add.graphics().setDepth(6);  // danger tint + flicker
    this.vignetteGfx   = this.add.graphics().setDepth(7);  // static corner vignette

    // ── Initialization ─────────────────────────────────────
    this.initPellets();
    this.drawMaze();
    this.drawPellets();
    this.spawnDebuffPickup();
    // Every 4 s, reposition an un-collected debuff in front of the player
    this.time.addEvent({
      delay:    4720,
      loop:     true,
      callback: () => { if (!this.gameOver && this.debuffPickup) this.spawnDebuffPickup(); },
    });
    this.setupHUD();
    this.setupDebuffOverlay();
    this.initGhosts();
    this.setupPathfinder();
    this.setupAtmosphere();

    // ── Input ──────────────────────────────────────────────
    this.keys = this.input.keyboard.addKeys({
      W:     Phaser.Input.Keyboard.KeyCodes.W,
      A:     Phaser.Input.Keyboard.KeyCodes.A,
      S:     Phaser.Input.Keyboard.KeyCodes.S,
      D:     Phaser.Input.Keyboard.KeyCodes.D,
      UP:    Phaser.Input.Keyboard.KeyCodes.UP,
      DOWN:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      LEFT:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      RIGHT: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    });
    // AudioContext requires a prior user gesture — start BGM on first keypress.
    this.input.keyboard.once('keydown', () => sound.startBGM());
  }

  // ── initPellets ────────────────────────────────────────────
  initPellets() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.maze[r][c] === 0) {
          if (c === 10 && r === 16) continue;
          this.maze[r][c] = 2;
          this.pelletsTotal++;
        }
      }
    }
  }

  // ── initGhosts ─────────────────────────────────────────────
  initGhosts() {
    this.ghosts = GHOST_DEFS.map(def => ({
      id:              def.id,
      col:             def.spawnCol,
      row:             def.spawnRow,
      x:               def.spawnCol * TILE + TILE / 2,
      y:               def.spawnRow * TILE + TILE / 2,
      color:           def.color,
      dir:             { x: 1, y: 0 },
      progress:        0,
      moving:          false,
      path:            [],
      pathPending:     false,
      lastPathTime:    0,
      clydeTgt:        null,
      clydeLastChange: 0,
    }));
  }

  // ── setupPathfinder ────────────────────────────────────────
  // EasyStar uses MAZE_TEMPLATE (static layout). Tunnel exits at row 10
  // col 0/20 are blocked so ghosts never use the tunnel wrap.
  setupPathfinder() {
    this.easyStar = new EasyStar.js();
    const grid = MAZE_TEMPLATE.map((row, r) =>
      row.map((cell, c) => {
        if (cell === 1) return 1;
        if (r === 10 && (c === 0 || c === COLS - 1)) return 1;
        return 0;
      })
    );
    this.easyStar.setGrid(grid);
    this.easyStar.setAcceptableTiles([0]);
    this.easyStar.disableCornerCutting();
    this.easyStar.setIterationsPerCalculation(1000);
  }

  // ── spawnDebuffPickup ──────────────────────────────────────
  // Prefers pellet tiles directly ahead of Pac-Man so the debuff sits in
  // the player's natural path. Falls back to a random pellet if none found.
  spawnDebuffPickup() {
    if (this.gameOver) return;
    const type = Phaser.Utils.Array.GetRandom(DEBUFF_TYPES);
    const p    = this.pac;

    // Walk up to 9 tiles in the current facing direction, stopping at walls.
    const aheadTiles = [];
    if (p.dir.x !== 0 || p.dir.y !== 0) {
      let c = p.col, r = p.row;
      for (let i = 0; i < 9; i++) {
        c += p.dir.x;
        r += p.dir.y;
        if (c < 0) c = COLS - 1;   // tunnel wrap
        if (c >= COLS) c = 0;
        if (r < 0 || r >= ROWS || this.maze[r][c] === 1) break;
        if (this.maze[r][c] === 2) aheadTiles.push({ col: c, row: r });
      }
    }

    let pos = null;
    if (aheadTiles.length > 0) {
      // Skip the immediately adjacent tile (too close to react to) when possible
      const pool = aheadTiles.length > 1 ? aheadTiles.slice(1) : aheadTiles;
      pos = Phaser.Utils.Array.GetRandom(pool);
    }

    // Fallback: any pellet tile not under Pac-Man
    if (!pos) {
      const fallback = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (this.maze[r][c] === 2 && !(c === p.col && r === p.row)) {
            fallback.push({ col: c, row: r });
          }
        }
      }
      if (fallback.length === 0) return;
      pos = Phaser.Utils.Array.GetRandom(fallback);
    }

    this.debuffPickup = { col: pos.col, row: pos.row, type };
  }

  // ── drawMaze ───────────────────────────────────────────────
  drawMaze() {
    const g = this.mazeGfx;
    g.clear();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const px = c * TILE, py = r * TILE;
        if (this.maze[r][c] === 1) {
          g.fillStyle(C.wall, 1);
          g.fillRect(px, py, TILE, TILE);
          g.lineStyle(1.5, C.wallEdge, 0.8);
          g.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
          g.fillStyle(C.wallDot, 1);
          g.fillCircle(px + 2,        py + 2,        1.5);
          g.fillCircle(px + TILE - 2, py + 2,        1.5);
          g.fillCircle(px + 2,        py + TILE - 2, 1.5);
          g.fillCircle(px + TILE - 2, py + TILE - 2, 1.5);
        } else {
          g.fillStyle(C.floor, 1);
          g.fillRect(px, py, TILE, TILE);
          g.lineStyle(0.5, C.gridLine, 0.15);
          g.strokeRect(px, py, TILE, TILE);
        }
      }
    }
  }

  // ── drawPellets ────────────────────────────────────────────
  drawPellets() {
    const g = this.pelletGfx;
    g.clear();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.maze[r][c] !== 2) continue;
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        g.fillStyle(C.pellet, 0.12); g.fillCircle(x, y, 7);
        g.fillStyle(C.pellet, 0.30); g.fillCircle(x, y, 5);
        g.fillStyle(C.pellet, 0.90); g.fillCircle(x, y, 3);
      }
    }
  }

  // ── drawDebuffPickup ───────────────────────────────────────
  drawDebuffPickup(time) {
    const g = this.debuffGfx;
    g.clear();
    if (!this.debuffPickup) return;

    const { col, row, type } = this.debuffPickup;
    const cx  = col * TILE + TILE / 2;
    const cy  = row * TILE + TILE / 2;
    const cfg = DEBUFFS[type];
    const s   = TILE * 0.26 * (0.78 + 0.22 * Math.sin(time * 0.005));

    g.fillStyle(cfg.hex, 0.10); g.fillCircle(cx, cy, s * 2.2);
    g.fillStyle(cfg.hex, 0.20); g.fillCircle(cx, cy, s * 1.6);

    g.fillStyle(cfg.hex, 0.92);
    g.beginPath();
    g.moveTo(cx,     cy - s);
    g.lineTo(cx + s, cy    );
    g.lineTo(cx,     cy + s);
    g.lineTo(cx - s, cy    );
    g.closePath();
    g.fillPath();

    g.lineStyle(1.5, 0xffffff, 0.55);
    g.beginPath();
    g.moveTo(cx,     cy - s);
    g.lineTo(cx + s, cy    );
    g.lineTo(cx,     cy + s);
    g.lineTo(cx - s, cy    );
    g.closePath();
    g.strokePath();
  }

  // ── drawGhost ──────────────────────────────────────────────
  drawGhost(ghost) {
    const g   = this.ghostGfx;
    const cx  = ghost.x;
    const cy  = ghost.y;
    const hw  = TILE * 0.34;       // half-width
    const domeY  = cy - TILE * 0.08; // dome arc center y
    const domeR  = hw;
    const botY   = cy + TILE * 0.36; // flat bottom level
    const leftX  = cx - hw;
    const rightX = cx + hw;
    const bumpW  = (hw * 2) / 3;    // width of each scallop
    const bumpR  = bumpW / 2;

    // Outer horror glow
    g.fillStyle(ghost.color, 0.06); g.fillCircle(cx, cy, hw * 2.4);
    g.fillStyle(ghost.color, 0.12); g.fillCircle(cx, cy, hw * 1.7);

    // Body
    g.fillStyle(ghost.color, 0.90);
    g.beginPath();
    g.moveTo(leftX, domeY);
    // Dome: left → top → right (clockwise = upward arc in screen coords)
    g.arc(cx, domeY, domeR, Math.PI, 0, false);
    // Right side down
    g.lineTo(rightX, botY);
    // Three scallops right-to-left (arcs curving upward = concave bottom)
    for (let i = 2; i >= 0; i--) {
      const bx = leftX + bumpR + i * bumpW;
      g.arc(bx, botY, bumpR, 0, Math.PI, true);
    }
    g.closePath();
    g.fillPath();

    // Eye whites + pupils
    const eyeOffX = hw * 0.38;
    const eyeY    = domeY - hw * 0.14;
    const eyeR    = hw * 0.24;
    const irisR   = eyeR * 0.58;
    const pupilR  = eyeR * 0.32;
    const pDX     = ghost.dir.x * irisR * 0.6;
    const pDY     = ghost.dir.y * irisR * 0.6;

    for (const side of [-1, 1]) {
      const ex = cx + side * eyeOffX;
      g.fillStyle(0xffffff, 1);  g.fillCircle(ex, eyeY, eyeR);
      g.fillStyle(0x0044ff, 1);  g.fillCircle(ex + pDX, eyeY + pDY, irisR);
      g.fillStyle(0x000011, 1);  g.fillCircle(ex + pDX * 1.1, eyeY + pDY * 1.1, pupilR);
    }
  }

  // ── drawGhosts ─────────────────────────────────────────────
  drawGhosts() {
    for (const ghost of this.ghosts) this.drawGhost(ghost);
  }

  // ── drawPacMan ─────────────────────────────────────────────
  drawPacMan() {
    const g = this.pacGfx;
    const { x, y, dir, moving, mouthOpen } = this.pac;

    let facing = 0;
    if      (dir.x === -1) facing = Math.PI;
    else if (dir.y === -1) facing = -Math.PI / 2;
    else if (dir.y ===  1) facing =  Math.PI / 2;

    const mA = moving ? 0.15 + mouthOpen * 0.22 : 0.18;

    g.fillStyle(C.pacYellow, 0.05); g.fillCircle(x, y, PAC_RADIUS * 2.2);
    g.fillStyle(C.pacYellow, 0.08); g.fillCircle(x, y, PAC_RADIUS * 1.7);
    g.fillStyle(C.pacYellow, 0.14); g.fillCircle(x, y, PAC_RADIUS * 1.3);

    const bodyAlpha = (this.pac.invincible && Math.floor(this.time.now / 120) % 2 === 0) ? 0.35 : 1;

    g.fillStyle(C.pacYellow, bodyAlpha);
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, PAC_RADIUS, facing + mA, facing + Math.PI * 2 - mA, false);
    g.closePath();
    g.fillPath();

    // Face-local "up" vector — perpendicular to facing, tilted toward screen-up.
    // This keeps the eye on the body regardless of which direction Pac-Man faces.
    let fuX = -Math.sin(facing), fuY = -Math.cos(facing);
    if (fuY > 0) { fuX = -fuX; fuY = -fuY; }   // ensure it points toward screen-up

    const eyeX = x + Math.cos(facing) * PAC_RADIUS * 0.3 + fuX * PAC_RADIUS * 0.42;
    const eyeY = y + Math.sin(facing) * PAC_RADIUS * 0.3 + fuY * PAC_RADIUS * 0.42;

    g.fillStyle(0xffffff, bodyAlpha); g.fillCircle(eyeX, eyeY, PAC_RADIUS * 0.18);

    g.lineStyle(0.8, 0xb40000, 0.6 * bodyAlpha);
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i;
      g.beginPath();
      g.moveTo(eyeX, eyeY);
      g.lineTo(eyeX + Math.cos(a) * PAC_RADIUS * 0.15, eyeY + Math.sin(a) * PAC_RADIUS * 0.15);
      g.strokePath();
    }
    g.fillStyle(0x660000, bodyAlpha); g.fillCircle(eyeX, eyeY, PAC_RADIUS * 0.09);
  }

  // ── setupHUD ───────────────────────────────────────────────
  setupHUD() {
    const base = { fontFamily: '"Courier New", monospace', fontSize: `${Math.floor(TILE * 0.55)}px`, color: '#cc00cc' };

    this.add.text(W / 2, H / 2, 'PAC-MAN: HORROR', {
      ...base, fontSize: `${Math.floor(TILE * 0.7)}px`, color: '#3a003a',
    }).setOrigin(0.5, 0.5).setDepth(1);

    this.scoreText = this.add.text(TILE * 0.4, TILE * 0.2, 'SCORE: 0', base).setDepth(10);
    this.livesText = this.add.text(W - TILE * 4.2, TILE * 0.2, 'LIVES: ♥♥♥', base).setDepth(10);

    const arrowStyle = { ...base, color: '#4a004a', fontSize: `${Math.floor(TILE * 0.6)}px` };
    this.add.text(TILE * 0.15, 10 * TILE + TILE * 0.2, '◄', arrowStyle).setDepth(10);
    this.add.text(W - TILE * 0.8,  10 * TILE + TILE * 0.2, '►', arrowStyle).setDepth(10);
  }

  // ── setupDebuffOverlay ─────────────────────────────────────
  setupDebuffOverlay() {
    const ox = 8, oy = H - 74, ow = 200, oh = 66;

    this.debuffPanelGfx = this.add.graphics().setDepth(15);
    this.debuffPanelGfx.fillStyle(0x000000, 0.80);
    this.debuffPanelGfx.fillRoundedRect(ox, oy, ow, oh, 7);
    this.debuffPanelGfx.lineStyle(1.5, 0x880088, 0.9);
    this.debuffPanelGfx.strokeRoundedRect(ox, oy, ow, oh, 7);
    this.debuffPanelGfx.setVisible(false);

    const txtStyle = { fontFamily: '"Courier New", monospace', fontSize: '12px', color: '#ff3333', fontStyle: 'bold' };
    this.debuffNameTxt  = this.add.text(ox + 12, oy + 9,  '', txtStyle).setDepth(16).setVisible(false);
    this.debuffTimerTxt = this.add.text(ox + 12, oy + 34, '', { ...txtStyle, color: '#cc00cc', fontStyle: 'normal' }).setDepth(16).setVisible(false);
  }

  showDebuffOverlay(visible) {
    this.debuffPanelGfx.setVisible(visible);
    this.debuffNameTxt.setVisible(visible);
    this.debuffTimerTxt.setVisible(visible);
  }

  // ── canStep ────────────────────────────────────────────────
  // Pac-Man movement check (supports tunnel wrap on row 10).
  canStep(col, row, d) {
    if (d.x === 0 && d.y === 0) return false;
    let nc = col + d.x;
    const nr = row + d.y;
    if (nc < 0)     nc = COLS - 1;
    if (nc >= COLS) nc = 0;
    if (nr < 0 || nr >= ROWS) return false;
    return this.maze[nr][nc] !== 1;
  }

  // Ghost movement check (no tunnel wrap).
  canStepGhost(col, row, d) {
    const nc = col + d.x;
    const nr = row + d.y;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return false;
    return this.maze[nr][nc] !== 1;
  }

  // ── getPacSpeed ────────────────────────────────────────────
  getPacSpeed() {
    if (!this.activeDebuff) return PAC_SPEED;
    if (this.activeDebuff.type === 'slow')   return PAC_SPEED * 0.5;
    if (this.activeDebuff.type === 'freeze') return 0;
    return PAC_SPEED;
  }

  // ── getGhostSpeed ──────────────────────────────────────────
  getGhostSpeed() {
    const boost = this.activeDebuff?.type === 'ghostBoost' ? 1.5 : 1;
    return GHOST_BASE_SPEED * boost;
  }

  // ── handleInput ────────────────────────────────────────────
  handleInput() {
    const k   = this.keys;
    const inv = this.activeDebuff?.type === 'invert';

    if      (k.W.isDown || k.UP.isDown)    this.pac.nextDir = inv ? { x:0, y:1  } : { x:0, y:-1 };
    else if (k.S.isDown || k.DOWN.isDown)  this.pac.nextDir = inv ? { x:0, y:-1 } : { x:0, y:1  };
    else if (k.A.isDown || k.LEFT.isDown)  this.pac.nextDir = inv ? { x:1, y:0  } : { x:-1, y:0 };
    else if (k.D.isDown || k.RIGHT.isDown) this.pac.nextDir = inv ? { x:-1, y:0 } : { x:1,  y:0 };
  }

  // ── updatePacMan ───────────────────────────────────────────
  updatePacMan() {
    const p     = this.pac;
    const speed = this.getPacSpeed();

    if (speed === 0) return;

    if (!p.moving) {
      if      (this.canStep(p.col, p.row, p.nextDir)) { p.dir = { ...p.nextDir }; p.moving = true; }
      else if (this.canStep(p.col, p.row, p.dir))     { p.moving = true; }
      else return;
    }

    p.progress += speed;

    if (p.progress >= TILE) {
      const over = p.progress - TILE;

      p.col += p.dir.x;
      p.row += p.dir.y;
      if (p.col < 0)     p.col = COLS - 1;
      if (p.col >= COLS) p.col = 0;

      p.x = p.col * TILE + TILE / 2;
      p.y = p.row * TILE + TILE / 2;

      this.onTileArrival(p.col, p.row);
      if (this.gameOver) return;

      if (this.canStep(p.col, p.row, p.nextDir)) p.dir = { ...p.nextDir };

      if (this.canStep(p.col, p.row, p.dir)) {
        p.progress = over;
      } else {
        p.moving   = false;
        p.progress = 0;
      }
    }

    if (p.moving) {
      p.x = p.col * TILE + TILE / 2 + p.dir.x * p.progress;
      p.y = p.row * TILE + TILE / 2 + p.dir.y * p.progress;
    }
  }

  // ── Ghost AI ───────────────────────────────────────────────

  // Returns the target tile for each ghost's personality.
  getGhostTarget(ghost) {
    const p = this.pac;
    switch (ghost.id) {
      case 'blinky':
        return { col: p.col, row: p.row };

      case 'pinky': {
        const col = Phaser.Math.Clamp(p.col + p.dir.x * 4, 0, COLS - 1);
        const row = Phaser.Math.Clamp(p.row + p.dir.y * 4, 0, ROWS - 1);
        return { col, row };
      }

      case 'inky': {
        const blinky = this.ghosts.find(g => g.id === 'blinky');
        const aCol = p.col + p.dir.x * 2;
        const aRow = p.row + p.dir.y * 2;
        // Reflect vector from Blinky through the 2-ahead point
        const col = Phaser.Math.Clamp(2 * aCol - blinky.col, 0, COLS - 1);
        const row = Phaser.Math.Clamp(2 * aRow - blinky.row, 0, ROWS - 1);
        return { col, row };
      }

      case 'clyde': {
        if (!ghost.clydeTgt || this.time.now - ghost.clydeLastChange > 3000) {
          const openTiles = [];
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              if (MAZE_TEMPLATE[r][c] === 0) openTiles.push({ col: c, row: r });
            }
          }
          ghost.clydeTgt = Phaser.Utils.Array.GetRandom(openTiles);
          ghost.clydeLastChange = this.time.now;
        }
        return ghost.clydeTgt;
      }
    }
    return { col: p.col, row: p.row };
  }

  // Greedy best direction toward target (no reversal, no tunnel).
  ghostGreedyDir(ghost) {
    const tgt  = this.getGhostTarget(ghost);
    const dirs = [{ x:1,y:0 }, { x:-1,y:0 }, { x:0,y:1 }, { x:0,y:-1 }];
    const rev  = { x: -ghost.dir.x, y: -ghost.dir.y };
    let best = null, bestDist = Infinity;

    for (const d of dirs) {
      if (d.x === rev.x && d.y === rev.y) continue;
      if (!this.canStepGhost(ghost.col, ghost.row, d)) continue;
      const nc = ghost.col + d.x, nr = ghost.row + d.y;
      const dist = Math.abs(nc - tgt.col) + Math.abs(nr - tgt.row);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    // Allow reversal only if completely stuck
    if (!best) {
      for (const d of dirs) {
        if (this.canStepGhost(ghost.col, ghost.row, d)) return d;
      }
    }
    return best || { x: 0, y: 0 };
  }

  // Consume path steps until a valid one is found; fall back to greedy.
  getGhostMoveDir(ghost) {
    while (ghost.path.length > 0) {
      const next = ghost.path.shift(); // consume
      const d = { x: next.x - ghost.col, y: next.y - ghost.row };
      if (Math.abs(d.x) + Math.abs(d.y) === 1 &&
          this.canStepGhost(ghost.col, ghost.row, d)) {
        return d;
      }
      // Invalid step — continue consuming stale path
    }
    return this.ghostGreedyDir(ghost);
  }

  // Queue an A* path request for this ghost.
  requestGhostPath(ghost) {
    if (ghost.pathPending) return;
    let tgt = this.getGhostTarget(ghost);
    // Ensure target is on an open tile
    if (MAZE_TEMPLATE[tgt.row]?.[tgt.col] === 1) tgt = { col: this.pac.col, row: this.pac.row };

    ghost.pathPending = true;
    this.easyStar.findPath(ghost.col, ghost.row, tgt.col, tgt.row, (path) => {
      ghost.pathPending = false;
      if (path && path.length > 1) ghost.path = path.slice(1); // skip current tile
    });
  }

  // Tile-locked movement for one ghost.
  updateGhost(ghost, speed) {
    if (speed === 0) return;

    if (!ghost.moving) {
      const d = this.getGhostMoveDir(ghost);
      if (d.x !== 0 || d.y !== 0) {
        ghost.dir    = d;
        ghost.moving = true;
      }
      if (!ghost.moving) return;
    }

    ghost.progress += speed;

    if (ghost.progress >= TILE) {
      const over = ghost.progress - TILE;
      ghost.col = Math.max(0, Math.min(COLS - 1, ghost.col + ghost.dir.x));
      ghost.row = Math.max(0, Math.min(ROWS - 1, ghost.row + ghost.dir.y));
      ghost.x   = ghost.col * TILE + TILE / 2;
      ghost.y   = ghost.row * TILE + TILE / 2;

      const nd = this.getGhostMoveDir(ghost);
      if (nd.x !== 0 || nd.y !== 0) {
        ghost.dir      = nd;
        ghost.progress = over;
      } else {
        ghost.moving   = false;
        ghost.progress = 0;
      }
    }

    if (ghost.moving) {
      ghost.x = ghost.col * TILE + TILE / 2 + ghost.dir.x * ghost.progress;
      ghost.y = ghost.row * TILE + TILE / 2 + ghost.dir.y * ghost.progress;
    }
  }

  // Update all ghosts: stagger path requests, then move each one.
  updateGhosts(time) {
    const speed = this.getGhostSpeed();
    for (const ghost of this.ghosts) {
      if (!ghost.pathPending && time - ghost.lastPathTime > 480) {
        ghost.lastPathTime = time;
        this.requestGhostPath(ghost);
      }
      this.updateGhost(ghost, speed);
    }
  }

  // ── checkGhostCollision ────────────────────────────────────
  checkGhostCollision() {
    if (this.pac.invincible) return;
    const px = this.pac.x, py = this.pac.y;
    const threshold = (TILE * 0.72) ** 2;
    for (const ghost of this.ghosts) {
      const dx = ghost.x - px, dy = ghost.y - py;
      if (dx * dx + dy * dy < threshold) {
        this.loseLife();
        return; // only one hit per frame
      }
    }
  }

  // ── loseLife ───────────────────────────────────────────────
  loseLife() {
    sound.sfxLifeLost();
    this.lives = Math.max(0, this.lives - 1);
    const hearts = '♥'.repeat(this.lives) + '♡'.repeat(3 - this.lives);
    this.livesText.setText(`LIVES: ${hearts}`);

    if (this.lives <= 0) {
      this.endGame(false);
      return;
    }

    // Crimson flash + camera shake + deeper vignette
    this.cameras.main.flash(380, 200, 0, 0);
    this.cameras.main.shake(320, 0.014);
    this.drawVignette(1 + (3 - this.lives) * 0.45);

    // 4-second invincibility window
    this.pac.invincible = true;
    this.time.delayedCall(4000, () => {
      if (!this.gameOver) this.pac.invincible = false;
    });
  }

  // ── setupAtmosphere ────────────────────────────────────────
  // Draws static vignette + scanlines once; initialises flicker clock.
  setupAtmosphere() {
    this.drawVignette(1);
    this.drawScanlines();
    this.nextFlicker   = this.time.now + 3000 + Math.random() * 7000;
    this.flickering    = false;
    this.flickerEnd    = 0;
  }

  // ── drawVignette ───────────────────────────────────────────
  // Stacks semi-transparent black strips from all four edges inward.
  // `intensity` scales the per-step alpha so life loss deepens the effect.
  drawVignette(intensity) {
    const g = this.vignetteGfx;
    g.clear();
    const steps    = 12;
    const stepPx   = 9;            // px per step into the screen
    const stepAlpha = 0.055 * intensity;
    for (let i = 0; i < steps; i++) {
      const m = (steps - i) * stepPx;
      g.fillStyle(0x000000, stepAlpha);
      g.fillRect(0,     0,     W, m);       // top
      g.fillRect(0,     H - m, W, m);       // bottom
      g.fillRect(0,     0,     m, H);       // left
      g.fillRect(W - m, 0,     m, H);       // right
    }
  }

  // ── drawScanlines ──────────────────────────────────────────
  // Subtle horizontal CRT scanlines, drawn once into vignetteGfx.
  drawScanlines() {
    const g = this.vignetteGfx;
    g.lineStyle(1, 0x000000, 0.07);
    for (let y = 0; y < H; y += 3) {
      g.beginPath();
      g.moveTo(0,   y + 0.5);
      g.lineTo(W,   y + 0.5);
      g.strokePath();
    }
  }

  // ── updateAtmosphere ───────────────────────────────────────
  // Redrawn every frame: proximity danger tint + random dark flicker.
  updateAtmosphere(time) {
    const g = this.atmosphereGfx;
    g.clear();

    // Red proximity tint — intensifies as nearest ghost gets close
    if (!this.pac.invincible) {
      let minDist = Infinity;
      for (const gh of this.ghosts) {
        const dx = gh.col - this.pac.col, dy = gh.row - this.pac.row;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) minDist = d;
      }
      const dangerRadius = 5;
      if (minDist < dangerRadius) {
        const t = 1 - minDist / dangerRadius;   // 0 (far) → 1 (on top)
        g.fillStyle(0x880000, t * t * 0.28);
        g.fillRect(0, 0, W, H);
      }
    }

    // Random darkness flicker
    if (time > this.nextFlicker) {
      this.flickering  = true;
      this.flickerEnd  = time + 60 + Math.random() * 110;
      this.nextFlicker = time + 2500 + Math.random() * 9000;
    }
    if (this.flickering) {
      if (time < this.flickerEnd) {
        g.fillStyle(0x000000, 0.45 + Math.random() * 0.25);
        g.fillRect(0, 0, W, H);
      } else {
        this.flickering = false;
      }
    }
  }

  // ── spawnScorePop ──────────────────────────────────────────
  // Tiny +25 text that floats upward and fades above a pellet tile.
  spawnScorePop(col, row) {
    const x = col * TILE + TILE / 2;
    const y = row * TILE;
    const txt = this.add.text(x, y, '+25', {
      fontFamily: '"Courier New", monospace',
      fontSize:   '11px',
      color:      '#cc0066',
    }).setOrigin(0.5, 1).setDepth(8);

    this.tweens.add({
      targets:  txt,
      y:        y - TILE * 1.6,
      alpha:    0,
      duration: 680,
      ease:     'Power1',
      onComplete: () => txt.destroy(),
    });
  }

  // ── onTileArrival ──────────────────────────────────────────
  onTileArrival(col, row) {
    if (this.maze[row][col] === 2) {
      this.maze[row][col] = 0;
      this.score += 25;
      this.pelletsEaten++;
      this.scoreText.setText(`SCORE: ${this.score}`);
      this.drawPellets();
      this.spawnScorePop(col, row);
      this.checkWin();
    }

    if (this.debuffPickup &&
        this.debuffPickup.col === col &&
        this.debuffPickup.row === row) {
      this.applyDebuff(this.debuffPickup.type);
      this.debuffPickup = null;
      this.time.delayedCall(944, this.spawnDebuffPickup, [], this);
    }
  }

  // ── applyDebuff ────────────────────────────────────────────
  applyDebuff(type) {
    const cfg = DEBUFFS[type];
    this.activeDebuff = { type, endTime: this.time.now + cfg.duration };
    this.debuffNameTxt.setText(`⚠  ${cfg.name}`);
    this.debuffNameTxt.setColor(cfg.cssColor);
    this.showDebuffOverlay(true);
    sound.sfxDebuff(type);
  }

  clearDebuff() {
    this.activeDebuff = null;
    this.showDebuffOverlay(false);
  }

  // ── updateDebuffTimer ──────────────────────────────────────
  updateDebuffTimer() {
    if (!this.activeDebuff) return;
    const remaining = (this.activeDebuff.endTime - this.time.now) / 1000;
    if (remaining <= 0) { this.clearDebuff(); return; }

    this.debuffTimerTxt.setText(`${remaining.toFixed(1)}s remaining`);

    if (remaining < 1) {
      const flash = Math.floor(this.time.now / 120) % 2 === 0;
      this.debuffPanelGfx.setVisible(flash);
      this.debuffNameTxt.setVisible(flash);
      this.debuffTimerTxt.setVisible(flash);
    }
  }

  // ── animateMouth ───────────────────────────────────────────
  animateMouth() {
    const p = this.pac;
    if (!p.moving || this.getPacSpeed() === 0) return;
    p.mouthOpen += 0.1 * p.mouthDir;
    if (p.mouthOpen >= 1) { p.mouthOpen = 1; p.mouthDir = -1; }
    if (p.mouthOpen <= 0) { p.mouthOpen = 0; p.mouthDir =  1; }
  }

  // ── checkWin ───────────────────────────────────────────────
  checkWin() {
    if (this.score >= 5000 || this.pelletsEaten >= this.pelletsTotal) {
      this.endGame(true);
    }
  }

  // ── endGame ────────────────────────────────────────────────
  endGame(won) {
    this.gameOver = true;
    sound.stopBGM();
    if (won) sound.sfxWin(); else sound.sfxLose();
    // Do NOT call scene.pause() — it kills the input plugin and prevents the R-key listener from firing.

    const overlay = this.add.graphics().setDepth(20);
    overlay.fillStyle(0x000000, 0.78);
    overlay.fillRect(0, 0, W, H);

    const title = won ? 'YOU SURVIVED' : 'YOU PERISHED';
    const color = won ? '#cc00cc'       : '#ff2222';

    this.add.text(W / 2, H / 2 - 36, title, {
      fontFamily: '"Courier New", monospace',
      fontSize:   '38px',
      color,
      stroke:     '#000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(21);

    this.add.text(W / 2, H / 2 + 18, `SCORE: ${this.score}`, {
      fontFamily: '"Courier New", monospace',
      fontSize:   '22px',
      color:      '#880088',
    }).setOrigin(0.5).setDepth(21);

    this.add.text(W / 2, H / 2 + 56, 'PRESS  R  TO  RESTART', {
      fontFamily: '"Courier New", monospace',
      fontSize:   '14px',
      color:      '#660066',
    }).setOrigin(0.5).setDepth(21);

    this.input.keyboard.once('keydown-R', () => this.scene.restart());
  }

  // ── update ─────────────────────────────────────────────────
  update(time) {
    if (this.gameOver) return;

    this.handleInput();
    this.updatePacMan();
    this.animateMouth();
    this.updateDebuffTimer();

    // Process pending A* calculations
    this.easyStar.calculate();
    this.updateGhosts(time);
    this.checkGhostCollision();

    // Atmosphere (danger tint + flicker) — drawn before gameplay sprites
    this.updateAtmosphere(time);

    // Redraw dynamic layers
    this.pacGfx.clear();
    this.drawPacMan();

    this.debuffGfx.clear();
    this.drawDebuffPickup(time);

    this.ghostGfx.clear();
    this.drawGhosts();
  }
}

// ─── PHASER CONFIG ───────────────────────────────────────────
const config = {
  type:            Phaser.AUTO,
  width:           W,
  height:          H,
  backgroundColor: '#050008',
  scene:           [GameScene],
  scale: {
    mode:       Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  audio: { noAudio: true },
};

new Phaser.Game(config);
