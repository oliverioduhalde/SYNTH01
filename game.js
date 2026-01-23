const UI = {
  score: document.getElementById("score"),
  lives: document.getElementById("lives"),
  level: document.getElementById("level"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayText: document.getElementById("overlay-text"),
  overlayBtn: document.getElementById("overlay-btn"),
};

const CONTROLS = document.getElementById("controls");

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const POWER_TYPES = [
  { key: "speed", color: 0xff274c, label: "SPEED" },
  { key: "slow", color: 0x3b6bff, label: "SLOW" },
  { key: "fright", color: 0x9aff3b, label: "FEAR" },
  { key: "glutton", color: 0xffa43b, label: "GLUTTON" },
  { key: "super", color: 0xffe85b, label: "SUPER" },
];

class GameScene extends Phaser.Scene {
  constructor() {
    super("game");
    this.levelIndex = 0;
    this.maxLevels = 3;
    this.score = 0;
    this.lives = 3;
    this.extraLifeAt = 10000;
    this.isPlaying = false;
    this.baseSeed = null;
    this.rng = null;
  }

  create() {
    this.scale.on("resize", this.handleResize, this);
    this.initSeed();

    this.board = this.add.container(0, 0);
    this.wallGraphics = this.add.graphics();
    this.portalGraphics = this.add.graphics();
    this.board.add(this.wallGraphics);
    this.board.add(this.portalGraphics);
    this.wallColor = 0x37f6ff;
    this.lastWallPulse = 0;

    this.pelletGroup = this.add.group();
    this.powerGroup = this.add.group();
    this.ghostGroup = this.add.group();

    this.player = this.add.graphics();
    this.player.setDepth(3);
    this.board.add(this.player);

    this.levelMessage = this.add.text(0, 0, "", {
      fontSize: "14px",
      fontFamily: "Press Start 2P",
      color: "#ffffff",
    });
    this.levelMessage.setOrigin(0.5);
    this.levelMessage.setDepth(10);

    this.activeEffects = new Map();

    this.setupInput();
    this.showOverlay("AI PACKMAN", "Press P or tap START.");
    this.hudHeight = document.querySelector(".hud")?.offsetHeight ?? 80;

    UI.overlayBtn.addEventListener("click", () => this.startGame());
    document.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "p") {
        if (!this.isPlaying) {
          this.startGame();
        } else {
          this.togglePause();
        }
      }
    });

    this.handleResize({ width: this.scale.width, height: this.scale.height });
  }

  initSeed() {
    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get("seed");
    const parsed = seedParam !== null ? parseInt(seedParam, 10) : null;
    this.baseSeed = Number.isFinite(parsed) ? parsed : Date.now();
  }

  setLevelSeed(attempt = 0) {
    const seed = this.baseSeed + this.levelIndex * 1000 + attempt;
    this.rng = this.mulberry32(seed);
  }

  mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  random() {
    return this.rng ? this.rng() : Math.random();
  }

  randInt(min, max) {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  randPick(list) {
    return list[this.randInt(0, list.length - 1)];
  }

  shuffle(list) {
    const array = list.slice();
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = this.randInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  startGame() {
    if (this.isPlaying) {
      return;
    }
    this.initAudio();
    this.isPlaying = true;
    UI.overlay.classList.add("hidden");
    this.levelIndex = 0;
    this.score = 0;
    this.lives = 3;
    this.extraLifeAt = 10000;
    this.startLevel();
  }

  togglePause() {
    const paused = this.scene.isPaused(this.scene.key);
    paused ? this.scene.resume() : this.scene.pause();
  }

  showOverlay(title, text) {
    UI.overlayTitle.textContent = title;
    UI.overlayText.textContent = text;
    UI.overlay.classList.remove("hidden");
  }

  startLevel() {
    this.levelIndex += 1;
    this.clearLevel();
    this.buildLevel();
    this.resetEntities();
    this.updateUI();
    this.flashMessage(`LEVEL ${this.levelIndex}`);
  }

  clearLevel() {
    this.wallGraphics.clear();
    this.portalGraphics.clear();
    this.pelletGroup.clear(true, true);
    this.powerGroup.clear(true, true);
    this.ghostGroup.clear(true, true);
    if (this.doors) {
      this.doors.forEach((door) => door.sprite.destroy());
    }
    this.doors = [];
    this.portals = [];
    this.pelletMap = new Map();
    this.powerMap = new Map();
    this.activeEffects.clear();
    this.player.clear();
  }

  buildLevel() {
    const size = this.getGridSize();
    let grid = null;
    let warpRows = [];
    for (let attempt = 0; attempt < 30; attempt += 1) {
      this.setLevelSeed(attempt);
      const result = this.generateMaze(size.cols, size.rows);
      grid = result.grid;
      warpRows = result.warpRows;
      if (this.validateMaze(grid, warpRows)) {
        break;
      }
      grid = null;
    }

    if (!grid) {
      this.setLevelSeed(0);
      const fallback = this.generateMaze(size.cols, size.rows);
      grid = fallback.grid;
      warpRows = fallback.warpRows;
    }

    this.grid = grid;
    this.warpRows = warpRows;
    this.spawnPoints = this.pickSpawnPoints();
    this.buildWalls();
    this.buildDoors();
    this.buildPortals();
    this.buildPellets();
    this.buildGhosts();
  }

  getGridSize() {
    return { cols: 28, rows: 31 };
  }

  generateMaze(cols, rows) {
    // Build left half, then mirror for perfect vertical symmetry.
    const halfCols = Math.floor(cols / 2);
    const left = this.generateHalfMaze(halfCols, rows);
    this.braidDeadEnds(left, 2);
    this.addExtraLoops(left, 6);
    const roomCells = this.carveOpenRooms(left);
    this.thinDoubleCorridors(left, 3, roomCells);
    this.enforceSingleWidth(left, roomCells);
    this.openCenterLinks(left, this.randInt(2, 4));

    const grid = Array.from({ length: rows }, () => Array(cols).fill(1));
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < halfCols; x += 1) {
        grid[y][x] = left[y][x];
        grid[y][cols - 1 - x] = left[y][x];
      }
    }

    for (let x = 0; x < cols; x += 1) {
      grid[0][x] = 1;
      grid[rows - 1][x] = 1;
    }
    for (let y = 0; y < rows; y += 1) {
      grid[y][0] = 1;
      grid[y][cols - 1] = 1;
    }

    // Reserve a centered ghost house (Pac-Man style).
    this.ghostHouse = this.carveGhostHouse(grid);
    // Add 1–3 warp tunnels that connect left/right borders.
    const warpRows = this.createWarpTunnels(grid, this.randInt(1, 3));

    return { grid, warpRows };
  }

  generateHalfMaze(cols, rows) {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(1));
    const stack = [];
    const start = { x: 1, y: 1, dir: null };
    grid[start.y][start.x] = 0;
    stack.push(start);

    const directions = [
      { x: 0, y: -2 },
      { x: 0, y: 2 },
      { x: -2, y: 0 },
      { x: 2, y: 0 },
    ];

    while (stack.length) {
      const current = stack[stack.length - 1];
      let shuffled = this.shuffle(directions);
      if (current.dir && this.random() < 0.7) {
        const rest = shuffled.filter((dir) => dir.x !== current.dir.x || dir.y !== current.dir.y);
        shuffled = [current.dir, ...rest];
      }
      let carved = false;

      for (const dir of shuffled) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        if (ny > 0 && ny < rows - 1 && nx > 0 && nx < cols - 1 && grid[ny][nx] === 1) {
          grid[ny][nx] = 0;
          grid[current.y + dir.y / 2][current.x + dir.x / 2] = 0;
          stack.push({ x: nx, y: ny, dir });
          carved = true;
          break;
        }
      }

      if (!carved) {
        stack.pop();
      }
    }

    return grid;
  }

  braidDeadEnds(grid, passes) {
    // Remove single-cell dead ends to keep flowy corridors.
    for (let pass = 0; pass < passes; pass += 1) {
      const deadEnds = [];
      for (let y = 1; y < grid.length - 1; y += 1) {
        for (let x = 1; x < grid[0].length - 1; x += 1) {
          if (grid[y][x] === 0 && this.countFloorNeighbors(grid, x, y) <= 1) {
            deadEnds.push({ x, y });
          }
        }
      }

      this.shuffle(deadEnds).forEach((cell) => {
        const options = [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ].filter((dir) => grid[cell.y + dir.y][cell.x + dir.x] === 1);
        if (options.length) {
          const pick = this.randPick(options);
          grid[cell.y + pick.y][cell.x + pick.x] = 0;
        }
      });
    }
  }

  thinDoubleCorridors(grid, passes, roomCells = new Set()) {
    // Reduce accidental 2-wide corridors (except intentional rooms).
    for (let pass = 0; pass < passes; pass += 1) {
      for (let y = 1; y < grid.length - 1; y += 1) {
        for (let x = 1; x < grid[0].length - 2; x += 1) {
          if (grid[y][x] === 0 && grid[y][x + 1] === 0) {
            const candidate = { x: x + 1, y };
            if (!roomCells.has(`${candidate.x},${candidate.y}`) && this.countFloorNeighbors(grid, candidate.x, candidate.y) >= 3) {
              grid[candidate.y][candidate.x] = 1;
            }
          }
        }
      }
      for (let y = 1; y < grid.length - 2; y += 1) {
        for (let x = 1; x < grid[0].length - 1; x += 1) {
          if (grid[y][x] === 0 && grid[y + 1][x] === 0) {
            const candidate = { x, y: y + 1 };
            if (!roomCells.has(`${candidate.x},${candidate.y}`) && this.countFloorNeighbors(grid, candidate.x, candidate.y) >= 3) {
              grid[candidate.y][candidate.x] = 1;
            }
          }
        }
      }
    }
  }

  enforceSingleWidth(grid, roomCells) {
    // Aggressively close double-wide corridors while keeping connectivity.
    const maxAttempts = 200;
    let attempts = 0;
    for (let y = 1; y < grid.length - 1; y += 1) {
      for (let x = 1; x < grid[0].length - 1; x += 1) {
        if (attempts >= maxAttempts) {
          return;
        }
        if (grid[y][x] !== 0 || roomCells.has(`${x},${y}`)) {
          continue;
        }
        if (grid[y][x + 1] === 0 && !roomCells.has(`${x + 1},${y}`)) {
          const keep = this.chooseCellToClose(grid, { x, y }, { x: x + 1, y });
          if (this.canCloseCell(grid, keep.x, keep.y, roomCells)) {
            grid[keep.y][keep.x] = 1;
            attempts += 1;
          }
        }
        if (grid[y + 1] && grid[y + 1][x] === 0 && !roomCells.has(`${x},${y + 1}`)) {
          const keep = this.chooseCellToClose(grid, { x, y }, { x, y: y + 1 });
          if (this.canCloseCell(grid, keep.x, keep.y, roomCells)) {
            grid[keep.y][keep.x] = 1;
            attempts += 1;
          }
        }
      }
    }
  }

  chooseCellToClose(grid, a, b) {
    const neighborsA = this.countFloorNeighbors(grid, a.x, a.y);
    const neighborsB = this.countFloorNeighbors(grid, b.x, b.y);
    return neighborsA >= neighborsB ? a : b;
  }

  canCloseCell(grid, x, y, roomCells) {
    if (roomCells.has(`${x},${y}`)) {
      return false;
    }
    grid[y][x] = 1;
    const ok = this.validateConnectivity(grid);
    grid[y][x] = 0;
    return ok;
  }

  addExtraLoops(grid, attempts) {
    // Add a few loops to avoid tree-like mazes.
    let added = 0;
    let tries = 0;
    while (added < attempts && tries < attempts * 4) {
      tries += 1;
      const wx = this.randInt(1, grid[0].length - 2);
      const wy = this.randInt(1, grid.length - 2);
      if (grid[wy][wx] === 1) {
        const neighbors = this.countFloorNeighbors(grid, wx, wy);
        if (neighbors >= 2) {
          grid[wy][wx] = 0;
          added += 1;
        }
      }
    }
  }

  openCenterLinks(grid, count) {
    // Ensure several connections across the symmetry seam.
    const x = grid[0].length - 1;
    const candidates = [];
    for (let y = 2; y < grid.length - 2; y += 1) {
      if (grid[y][x - 1] === 0) {
        candidates.push(y);
      }
    }
    this.shuffle(candidates)
      .slice(0, count)
      .forEach((y) => {
        grid[y][x] = 0;
      });
  }

  carveOpenRooms(grid) {
    // Add sparse rectangular open spaces without internal walls.
    const sizes = [
      { w: 1, h: 1, weight: 95 },
      { w: 1, h: 2, weight: 1 },
      { w: 2, h: 1, weight: 1 },
      { w: 2, h: 2, weight: 0.5 },
      { w: 3, h: 2, weight: 0.3 },
      { w: 2, h: 3, weight: 0.3 },
      { w: 4, h: 4, weight: 0.1 },
    ];
    const totalWeight = sizes.reduce((sum, item) => sum + item.weight, 0);
    const attempts = Math.floor((grid.length * grid[0].length) / 40);
    const roomCells = new Set();

    for (let i = 0; i < attempts; i += 1) {
      const roll = this.random() * totalWeight;
      let pick = sizes[0];
      let accum = 0;
      for (const size of sizes) {
        accum += size.weight;
        if (roll <= accum) {
          pick = size;
          break;
        }
      }

      const maxX = grid[0].length - pick.w - 1;
      const maxY = grid.length - pick.h - 1;
      const x = this.randInt(1, Math.max(1, maxX));
      const y = this.randInt(1, Math.max(1, maxY));

      if (!this.isRoomPlaceable(grid, x, y, pick.w, pick.h)) {
        continue;
      }
      this.carveRoom(grid, x, y, pick.w, pick.h, roomCells);
    }
    return roomCells;
  }

  isRoomPlaceable(grid, x, y, w, h) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        if (grid[yy][xx] === 0) {
          return false;
        }
      }
    }
    return this.roomHasOpenNeighbor(grid, x, y, w, h);
  }

  roomHasOpenNeighbor(grid, x, y, w, h) {
    for (let yy = y - 1; yy <= y + h; yy += 1) {
      for (let xx = x - 1; xx <= x + w; xx += 1) {
        if (!grid[yy] || typeof grid[yy][xx] === "undefined") {
          continue;
        }
        if (yy >= y && yy < y + h && xx >= x && xx < x + w) {
          continue;
        }
        if (grid[yy][xx] === 0) {
          return true;
        }
      }
    }
    return false;
  }

  carveRoom(grid, x, y, w, h, roomCells) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        grid[yy][xx] = 0;
        if (roomCells) {
          roomCells.add(`${xx},${yy}`);
        }
      }
    }
  }

  carveGhostHouse(grid) {
    // Carve a central ghost house with a single door.
    const cols = grid[0].length;
    const rows = grid.length;
    const width = 6;
    const height = 5;
    const left = Math.floor(cols / 2) - Math.floor(width / 2);
    const top = Math.floor(rows / 2) - Math.floor(height / 2);
    const right = left + width - 1;
    const bottom = top + height - 1;

    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        grid[y][x] = 1;
      }
    }
    for (let y = top + 1; y <= bottom - 1; y += 1) {
      for (let x = left + 1; x <= right - 1; x += 1) {
        grid[y][x] = 0;
      }
    }

    const doorX = Math.floor((left + right) / 2);
    grid[top][doorX] = 0;
    if (grid[top - 1] && typeof grid[top - 1][doorX] !== "undefined") {
      grid[top - 1][doorX] = 0;
    }

    const cells = [];
    for (let y = top + 1; y <= bottom - 1; y += 1) {
      for (let x = left + 1; x <= right - 1; x += 1) {
        cells.push({ x, y });
      }
    }
    return { left, right, top, bottom, cells };
  }

  createWarpTunnels(grid, count) {
    // Create 1–3 aligned warp tunnels on the borders.
    const rows = grid.length;
    const cols = grid[0].length;
    const candidates = [];
    for (let y = 2; y < rows - 2; y += 1) {
      if (grid[y][1] === 0 && grid[y][cols - 2] === 0) {
        candidates.push(y);
      }
    }
    const shuffled = this.shuffle(candidates);
    const warpRows = shuffled.slice(0, Math.min(count, shuffled.length));
    if (warpRows.length === 0) {
      warpRows.push(Math.floor(rows / 2));
    }

    warpRows.forEach((y) => {
      grid[y][0] = 0;
      grid[y][cols - 1] = 0;
    });
    return warpRows;
  }

  validateMaze(grid, warpRows) {
    // Validate symmetry, connectivity, and warp count.
    if (!this.validateSymmetry(grid)) {
      return false;
    }
    if (!this.validateConnectivity(grid)) {
      return false;
    }
    if (!this.validateWarpRows(grid, warpRows)) {
      return false;
    }
    return true;
  }

  validateSymmetry(grid) {
    const rows = grid.length;
    const cols = grid[0].length;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (grid[y][x] !== grid[y][cols - 1 - x]) {
          return false;
        }
      }
    }
    return true;
  }

  validateConnectivity(grid) {
    const rows = grid.length;
    const cols = grid[0].length;
    let start = null;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (grid[y][x] === 0) {
          start = { x, y };
          break;
        }
      }
      if (start) {
        break;
      }
    }
    if (!start) {
      return false;
    }

    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const queue = [start];
    visited[start.y][start.x] = true;
    while (queue.length) {
      const current = queue.shift();
      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];
      neighbors.forEach((pos) => {
        if (!grid[pos.y] || typeof grid[pos.y][pos.x] === "undefined") {
          return;
        }
        if (grid[pos.y][pos.x] === 0 && !visited[pos.y][pos.x]) {
          visited[pos.y][pos.x] = true;
          queue.push(pos);
        }
      });
    }

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (grid[y][x] === 0 && !visited[y][x]) {
          return false;
        }
      }
    }
    return true;
  }

  validateWarpRows(grid, warpRows) {
    const cols = grid[0].length;
    const validRows = warpRows.filter((y) => grid[y][0] === 0 && grid[y][cols - 1] === 0);
    return validRows.length >= 1 && validRows.length <= 3;
  }

  mazeToAscii(grid) {
    return grid.map((row) => row.map((cell) => (cell === 1 ? "#" : ".")).join("")).join("\n");
  }

  countFloorNeighbors(grid, x, y) {
    const dirs = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];
    return dirs.reduce((count, dir) => {
      const nx = x + dir.x;
      const ny = y + dir.y;
      if (grid[ny] && grid[ny][nx] === 0) {
        return count + 1;
      }
      return count;
    }, 0);
  }

  pickSpawnPoints() {
    const floors = [];
    const ghostCells = this.ghostHouse?.cells ? this.ghostHouse.cells.slice() : [];
    for (let y = 1; y < this.grid.length - 1; y += 1) {
      for (let x = 1; x < this.grid[0].length - 1; x += 1) {
        if (this.grid[y][x] === 0) {
          if (!this.isInsideGhostHouse(x, y)) {
            floors.push({ x, y });
          }
        }
      }
    }

    const shuffledFloors = this.shuffle(floors);
    const player = shuffledFloors[0] || { x: 1, y: 1 };
    const remainingFloors = shuffledFloors.filter((tile) => tile.x !== player.x || tile.y !== player.y);
    let ghosts = [];
    if (ghostCells.length >= 4) {
      ghosts = this.shuffle(ghostCells).slice(0, 4);
    } else {
      ghosts = this.shuffle(remainingFloors).slice(0, 4);
    }
    return { player, ghosts };
  }

  isInsideGhostHouse(x, y) {
    if (!this.ghostHouse) {
      return false;
    }
    return x > this.ghostHouse.left && x < this.ghostHouse.right && y > this.ghostHouse.top && y < this.ghostHouse.bottom;
  }

  buildWalls() {
    const { tileSize, offsetX, offsetY } = this.layoutBoard();
    this.tileSize = tileSize;
    this.offsetX = offsetX;
    this.offsetY = offsetY;

    this.wallGraphics.clear();
    const stroke = 3;
    const color = this.wallColor ?? 0x37f6ff;
    const alpha = 0.85;
    this.wallGraphics.lineStyle(stroke, color, alpha);
    this.wallGraphics.fillStyle(color, alpha);

    const rows = this.grid.length;
    const cols = this.grid[0].length;
    const drawSegment = (x1, y1, x2, y2) => {
      this.wallGraphics.lineBetween(x1, y1, x2, y2);
    };

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (this.grid[y][x] === 1) {
          const px = x * tileSize;
          const py = y * tileSize;
          if (y === 0 || this.grid[y - 1][x] === 0) {
            drawSegment(px, py, px + tileSize, py);
          }
          if (y === rows - 1 || this.grid[y + 1][x] === 0) {
            drawSegment(px, py + tileSize, px + tileSize, py + tileSize);
          }
          if (x === 0 || this.grid[y][x - 1] === 0) {
            drawSegment(px, py, px, py + tileSize);
          }
          if (x === cols - 1 || this.grid[y][x + 1] === 0) {
            drawSegment(px + tileSize, py, px + tileSize, py + tileSize);
          }
        }
      }
    }
  }

  buildPellets() {
    const powerCount = this.randInt(3, 10);
    const floorTiles = [];
    const portalSet = new Set(this.portals.map((portal) => `${portal.x},${portal.y}`));
    for (let y = 1; y < this.grid.length - 1; y += 1) {
      for (let x = 1; x < this.grid[0].length - 1; x += 1) {
        if (this.grid[y][x] === 0) {
          if (!portalSet.has(`${x},${y}`) && !this.isInsideGhostHouse(x, y)) {
            floorTiles.push({ x, y });
          }
        }
      }
    }

    const shuffled = this.shuffle(floorTiles);
    const powerTiles = shuffled.slice(0, powerCount);
    const powerSet = new Set(powerTiles.map((tile) => `${tile.x},${tile.y}`));

    floorTiles.forEach((tile) => {
      const key = `${tile.x},${tile.y}`;
      if (tile.x === this.spawnPoints.player.x && tile.y === this.spawnPoints.player.y) {
        return;
      }
      if (powerSet.has(key)) {
        const powerType = this.randPick(POWER_TYPES);
        const power = this.add.circle(0, 0, this.tileSize * 0.22, powerType.color);
        power.setStrokeStyle(2, 0xffffff, 0.9);
        power.baseTileSize = this.tileSize;
        power.baseScale = 1;
        power.pulseOffset = Phaser.Math.FloatBetween(0, Math.PI * 2);
        power.tile = { ...tile };
        this.positionObject(power, tile.x, tile.y);
        power.powerType = powerType;
        this.powerGroup.add(power);
        this.board.add(power);
        this.powerMap.set(key, power);
      } else {
        const pellet = this.add.circle(0, 0, this.tileSize * 0.12, 0xffffff);
        pellet.setAlpha(0.9);
        pellet.setStrokeStyle(1, 0x37f6ff, 0.8);
        pellet.baseTileSize = this.tileSize;
        pellet.baseScale = 1;
        pellet.pulseOffset = Phaser.Math.FloatBetween(0, Math.PI * 2);
        pellet.tile = { ...tile };
        this.positionObject(pellet, tile.x, tile.y);
        this.pelletGroup.add(pellet);
        this.board.add(pellet);
        this.pelletMap.set(key, pellet);
      }
    });
  }

  buildPortals() {
    const cols = this.grid[0].length;
    this.portals = [];
    let id = 0;
    (this.warpRows || []).forEach((row) => {
      const left = { x: 0, y: row, id, pair: id + 1, side: "left" };
      const right = { x: cols - 1, y: row, id: id + 1, pair: id, side: "right" };
      this.portals.push(left, right);
      id += 2;
    });

    this.portalGraphics.clear();
    this.portalGraphics.lineStyle(2, 0xff2bd6, 0.8);
    this.portalGraphics.fillStyle(0xff2bd6, 0.6);
    this.portals.forEach((portal) => {
      const edgeX = portal.side === "left" ? 0 : this.grid[0].length * this.tileSize;
      const px = edgeX;
      const py = portal.y * this.tileSize + this.tileSize * 0.2;
      const width = this.tileSize * 0.12;
      const height = this.tileSize * 0.6;
      this.portalGraphics.fillRect(px - width / 2, py, width, height);
    });
  }

  buildDoors() {
    const candidates = [];
    for (let y = 1; y < this.grid.length - 1; y += 1) {
      for (let x = 1; x < this.grid[0].length - 1; x += 1) {
        if (this.grid[y][x] === 1 && this.countFloorNeighbors(this.grid, x, y) >= 2) {
          candidates.push({ x, y });
        }
      }
    }

    const doorTiles = Phaser.Utils.Array.Shuffle(candidates).slice(0, 6);
    doorTiles.forEach((tile) => {
      const leftOpen = this.grid[tile.y][tile.x - 1] === 0;
      const rightOpen = this.grid[tile.y][tile.x + 1] === 0;
      const upOpen = this.grid[tile.y - 1][tile.x] === 0;
      const downOpen = this.grid[tile.y + 1][tile.x] === 0;
      const vertical = leftOpen && rightOpen;
      const width = vertical ? this.tileSize * 0.2 : this.tileSize * 0.8;
      const height = vertical ? this.tileSize * 0.8 : this.tileSize * 0.2;
      const rect = this.add.rectangle(0, 0, width, height, 0xff2bd6, 0.7);
      rect.setStrokeStyle(2, 0xff2bd6, 1);
      rect.tile = { ...tile };
      this.positionObject(rect, tile.x, tile.y);
      this.board.add(rect);
      const door = {
        ...tile,
        sprite: rect,
        open: false,
        timer: 0,
        interval: Phaser.Math.Between(2000, 5000),
        vertical,
      };
      this.doors.push(door);
    });
  }

  buildGhosts() {
    const colors = [0xff2bd6, 0x37f6ff, 0xff274c, 0x9aff3b];
    const types = ["blinky", "pinky", "inky", "clyde"];
    this.spawnPoints.ghosts.forEach((spawn, index) => {
      const enemy = this.add.graphics();
      this.positionObject(enemy, spawn.x, spawn.y);
      enemy.setDepth(2);
      this.ghostGroup.add(enemy);
      this.board.add(enemy);
      enemy.ghostData = {
        tileX: spawn.x,
        tileY: spawn.y,
        dir: { x: 0, y: 0 },
        moving: false,
        speed: 70,
        color: colors[index],
        renderColor: colors[index],
        mode: "normal",
        lastPortal: 0,
        spawnIndex: index,
        type: types[index],
        animOffset: Phaser.Math.Between(0, 1000),
      };
    });
  }

  resetEntities() {
    this.playerData = {
      tileX: this.spawnPoints.player.x,
      tileY: this.spawnPoints.player.y,
      dir: { x: 0, y: 0 },
      nextDir: { x: 0, y: 0 },
      moving: false,
      speed: 5 + this.levelIndex * 0.25,
      canPassWalls: false,
      superActive: false,
      lastPortal: 0,
      usingPath: false,
      path: null,
      pathIndex: 0,
      pathTarget: null,
    };
    this.positionObject(this.player, this.playerData.tileX, this.playerData.tileY);

    this.ghostGroup.getChildren().forEach((ghost, index) => {
      const spawn = this.spawnPoints.ghosts[index];
      ghost.ghostData.tileX = spawn.x;
      ghost.ghostData.tileY = spawn.y;
      ghost.ghostData.dir = { x: 0, y: 0 };
      ghost.ghostData.moving = false;
      ghost.ghostData.mode = "normal";
      ghost.ghostData.renderColor = ghost.ghostData.color;
      ghost.ghostData.speed = 4.4 + this.levelIndex * 0.2;
      ghost.ghostData.lastPortal = 0;
      this.positionObject(ghost, spawn.x, spawn.y);
    });
  }

  setupInput() {
    this.input.on("pointerdown", (pointer) => {
      if (!this.isPlaying) {
        return;
      }
      const rect = this.scale.canvas.getBoundingClientRect();
      const localX = pointer.x - rect.left;
      const localY = pointer.y - rect.top;
      const target = this.worldToTile(localX - this.board.x, localY - this.board.y);
      this.setPathToTarget(target);
    });

    CONTROLS.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) {
        return;
      }
      const dir = button.dataset.dir;
      if (dir) {
        this.queueDirection(dir);
      }
    });

    this.input.keyboard.on("keydown", (event) => {
      if (!this.isPlaying) {
        return;
      }
      switch (event.key) {
        case "ArrowUp":
          this.queueDirection("up");
          break;
        case "ArrowDown":
          this.queueDirection("down");
          break;
        case "ArrowLeft":
          this.queueDirection("left");
          break;
        case "ArrowRight":
          this.queueDirection("right");
          break;
        default:
          break;
      }
    });
  }

  queueDirection(dirKey, source = "manual") {
    if (source === "manual") {
      this.clearPath();
    }
    this.playerData.nextDir = { ...DIRS[dirKey] };
  }

  clearPath() {
    this.playerData.usingPath = false;
    this.playerData.path = null;
    this.playerData.pathIndex = 0;
    this.playerData.pathTarget = null;
  }

  setPathToTarget(target) {
    const start = { x: this.playerData.tileX, y: this.playerData.tileY };
    const result = this.findPath(start, target, this.playerData.canPassWalls);
    if (!result || result.path.length < 2) {
      return;
    }
    this.playerData.usingPath = true;
    this.playerData.path = result.path;
    this.playerData.pathIndex = 1;
    this.playerData.pathTarget = result.target;
  }

  findPath(start, target, canPassWalls) {
    const rows = this.grid.length;
    const cols = this.grid[0].length;
    const keyFor = (pos) => `${pos.x},${pos.y}`;
    const queue = [start];
    const visited = new Set([keyFor(start)]);
    const cameFrom = new Map();
    let best = start;
    let bestScore = Math.abs(start.x - target.x) + Math.abs(start.y - target.y);

    while (queue.length) {
      const current = queue.shift();
      const score = Math.abs(current.x - target.x) + Math.abs(current.y - target.y);
      if (score < bestScore) {
        best = current;
        bestScore = score;
      }
      if (current.x === target.x && current.y === target.y) {
        best = current;
        break;
      }
      const neighbors = this.getPathNeighbors(current, canPassWalls);
      neighbors.forEach((neighbor) => {
        const key = keyFor(neighbor);
        if (!visited.has(key)) {
          visited.add(key);
          cameFrom.set(key, keyFor(current));
          queue.push(neighbor);
        }
      });
    }

    const bestKey = keyFor(best);
    if (bestKey !== keyFor(start) && !cameFrom.has(bestKey)) {
      return null;
    }
    const path = [best];
    let currentKey = bestKey;
    while (currentKey !== keyFor(start)) {
      const prevKey = cameFrom.get(currentKey);
      if (!prevKey) {
        break;
      }
      const [x, y] = prevKey.split(",").map((value) => parseInt(value, 10));
      path.unshift({ x, y });
      currentKey = prevKey;
    }
    return { path, target: best };
  }

  getPathNeighbors(tile, canPassWalls) {
    const neighbors = [];
    const dirs = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
    dirs.forEach((dir) => {
      const nx = tile.x + dir.x;
      const ny = tile.y + dir.y;
      if (this.isWalkable(nx, ny, canPassWalls)) {
        neighbors.push({ x: nx, y: ny });
      }
    });
    const portal = this.getPortalAt(tile.x, tile.y);
    if (portal) {
      const pair = this.getPortalPair(portal);
      if (pair) {
        neighbors.push({ x: pair.x, y: pair.y });
      }
    }
    return neighbors;
  }

  getPortalAt(x, y) {
    return this.portals.find((portal) => portal.x === x && portal.y === y);
  }

  getPortalPair(portal) {
    return this.portals.find((candidate) => candidate.id === portal.pair);
  }

  getDirectionAngle(dir) {
    if (dir.x === 1) {
      return 0;
    }
    if (dir.x === -1) {
      return Math.PI;
    }
    if (dir.y === -1) {
      return -Math.PI / 2;
    }
    if (dir.y === 1) {
      return Math.PI / 2;
    }
    return 0;
  }

  drawPacman(graphics, color, angle, mouth, size, background) {
    const radius = size * 0.5;
    graphics.clear();
    graphics.fillStyle(color, 0.95);
    graphics.beginPath();
    graphics.moveTo(0, 0);
    graphics.arc(0, 0, radius, angle + mouth, angle - mouth, false);
    graphics.closePath();
    graphics.fillPath();
    if (background) {
      graphics.fillStyle(background, 1);
      graphics.beginPath();
      graphics.moveTo(0, 0);
      graphics.arc(0, 0, radius * 0.55, angle + mouth * 0.8, angle - mouth * 0.8, false);
      graphics.closePath();
      graphics.fillPath();
    }
  }

  drawSquidPlayer(time) {
    const size = this.tileSize * (this.playerData.superActive ? 1.2 : 0.9);
    const radius = size * 0.5;
    const angle = this.getDirectionAngle(this.playerData.dir);
    const bodyColor = 0xffe85b;
    const bgColor = 0x0a0a12;

    this.player.clear();
    this.player.fillStyle(bodyColor, 0.98);
    this.player.beginPath();
    this.player.arc(0, -radius * 0.1, radius, Math.PI, 0, false);
    this.player.lineTo(radius * 0.8, radius * 1.1);
    const tentacleCount = 4;
    const wave = time * 0.01;
    for (let i = tentacleCount; i >= 0; i -= 1) {
      const x = radius - (i * radius * 2) / tentacleCount;
      const wobble = Math.sin(wave + i * 0.9) * radius * 0.12;
      const y = radius * 1.25 + wobble;
      this.player.lineTo(x, y);
    }
    this.player.lineTo(-radius * 0.8, radius * 1.1);
    this.player.closePath();
    this.player.fillPath();
    for (let i = 0; i < 4; i += 1) {
      const trailAlpha = 0.2 - i * 0.04;
      const trailY = radius * (1.35 + i * 0.22);
      this.player.fillStyle(bodyColor, Math.max(trailAlpha, 0.05));
      this.player.fillEllipse(0, trailY, radius * (1.1 - i * 0.18), radius * 0.5);
    }
    const eyeOffset = radius * 0.22;
    this.player.fillStyle(bgColor, 0.9);
    this.player.fillCircle(-eyeOffset, -radius * 0.05, radius * 0.12);
    this.player.fillCircle(eyeOffset, -radius * 0.05, radius * 0.12);
    this.player.rotation = angle + Math.PI / 2;
  }

  drawEnemies(time) {
    this.ghostGroup.getChildren().forEach((ghost) => {
      const data = ghost.ghostData;
      const angle = this.getDirectionAngle(data.dir);
      const mouth = 0.28 + 0.18 * Math.abs(Math.sin((time + data.animOffset) * 0.007));
      const size = this.tileSize * 0.85;
      this.drawPacman(ghost, data.renderColor, angle, mouth, size, null);
    });
  }

  update(time, delta) {
    if (!this.isPlaying) {
      return;
    }

    this.updateBoardWiggle(time);
    this.updateWallGlow(time);
    this.updateDoors(delta);
    this.updatePlayer(delta);
    this.updateGhosts(delta);
    this.updatePelletGlow(time);
    this.drawSquidPlayer(time);
    this.drawEnemies(time);
    this.checkCollisions();
  }

  updateBoardWiggle(time) {
    const driftX = Math.sin(time * 0.0014) * 0.6;
    const driftY = Math.cos(time * 0.0011) * 0.5;
    this.board.x = this.offsetX + driftX;
    this.board.y = this.offsetY + driftY;
  }

  updatePelletGlow(time) {
    const basePulse = Math.sin(time * 0.006);
    this.pelletGroup.getChildren().forEach((pellet) => {
      const pulse = 1 + 0.12 * Math.sin(time * 0.01 + pellet.pulseOffset) + 0.04 * basePulse;
      const base = pellet.baseScale || 1;
      pellet.setScale(base * pulse);
    });
    this.powerGroup.getChildren().forEach((power) => {
      const pulse = 1 + 0.22 * Math.sin(time * 0.012 + power.pulseOffset);
      const base = power.baseScale || 1;
      power.setScale(base * pulse);
    });
  }

  updateWallGlow(time) {
    if (time - this.lastWallPulse < 120) {
      return;
    }
    this.lastWallPulse = time;
    const t = (Math.sin(time * 0.0006) + 1) / 2;
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      new Phaser.Display.Color(55, 246, 255),
      new Phaser.Display.Color(255, 43, 214),
      100,
      Math.floor(t * 100)
    );
    this.wallColor = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
    this.buildWalls();
  }

  updateDoors(delta) {
    this.doors.forEach((door) => {
      door.timer += delta;
      if (door.timer >= door.interval) {
        door.open = !door.open;
        door.timer = 0;
        door.interval = Phaser.Math.Between(2000, 5000);
        door.sprite.setAlpha(door.open ? 0.2 : 0.7);
      }
    });
  }

  updatePlayer(delta) {
    const player = this.playerData;
    const speed = player.speed * this.tileSize * (this.activeEffects.has("speed") ? 1.4 : 1);
    const canPass = player.canPassWalls;

    if (!player.moving) {
      if (player.usingPath) {
        this.advancePlayerPath();
        this.updatePathDirection();
      }
      const next = this.getNextDirection(player.nextDir, player, canPass);
      if (next) {
        player.dir = next;
        player.moving = true;
        player.target = {
          x: player.tileX + next.x,
          y: player.tileY + next.y,
        };
      } else {
        player.dir = { x: 0, y: 0 };
        if (player.usingPath && player.pathTarget) {
          this.setPathToTarget(player.pathTarget);
        }
      }
    }

    if (player.moving) {
      this.moveEntity(player, this.player, speed, delta, canPass);
    }
  }

  updateGhosts(delta) {
    this.ghostGroup.getChildren().forEach((ghost) => {
      const data = ghost.ghostData;
      const speedMultiplier = this.activeEffects.has("slow") ? 0.6 : 1;
      const speed = data.speed * this.tileSize * speedMultiplier;

      if (!data.moving) {
        const target = this.getGhostTarget(ghost);
        const dir = this.chooseGhostDirection(data, target);
        if (dir) {
          data.dir = dir;
          data.moving = true;
          data.target = { x: data.tileX + dir.x, y: data.tileY + dir.y };
        }
      }

      if (data.moving) {
        this.moveEntity(data, ghost, speed, delta, false);
      }
    });
  }

  moveEntity(data, sprite, speed, delta, canPassWalls) {
    const targetX = data.target.x * this.tileSize + this.tileSize / 2;
    const targetY = data.target.y * this.tileSize + this.tileSize / 2;
    const currentX = sprite.x;
    const currentY = sprite.y;
    const distance = speed * (delta / 1000);

    const angle = Math.atan2(targetY - currentY, targetX - currentX);
    const nextX = currentX + Math.cos(angle) * distance;
    const nextY = currentY + Math.sin(angle) * distance;

    const reached = Phaser.Math.Distance.Between(nextX, nextY, targetX, targetY) < 2;
    sprite.x = reached ? targetX : nextX;
    sprite.y = reached ? targetY : nextY;

    if (reached) {
      data.tileX = data.target.x;
      data.tileY = data.target.y;
      data.moving = false;
      this.handlePortal(data, sprite);

      if (sprite === this.player) {
        this.collectPellet(data.tileX, data.tileY);
        this.advancePlayerPath();
      } else {
        this.trackGhostHistory(data);
      }
    }
  }

  updatePathDirection() {
    const player = this.playerData;
    if (!player.path || player.pathIndex >= player.path.length) {
      this.clearPath();
      return;
    }
    const next = player.path[player.pathIndex];
    const dx = next.x - player.tileX;
    const dy = next.y - player.tileY;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      player.nextDir = { x: dx, y: dy };
    }
  }

  advancePlayerPath() {
    const player = this.playerData;
    if (!player.path || player.pathIndex >= player.path.length) {
      return;
    }
    const next = player.path[player.pathIndex];
    if (next.x === player.tileX && next.y === player.tileY) {
      player.pathIndex += 1;
      return;
    }
    if (player.pathIndex < player.path.length - 1) {
      const expectedPortal = player.path[player.pathIndex];
      const nextAfter = player.path[player.pathIndex + 1];
      const portal = this.getPortalAt(expectedPortal.x, expectedPortal.y);
      if (portal && nextAfter.x === player.tileX && nextAfter.y === player.tileY) {
        player.pathIndex += 2;
      }
    }
  }

  trackGhostHistory(data) {
    if (!data.pathHistory) {
      data.pathHistory = [];
      data.loopCount = 0;
      data.loopThreshold = Phaser.Math.Between(2, 5);
    }
    data.pathHistory.push(`${data.tileX},${data.tileY}`);
    if (data.pathHistory.length > 6) {
      data.pathHistory.shift();
    }

    const playerStill = !this.playerData.moving;
    if (!playerStill) {
      data.loopCount = 0;
      data.forceRandom = false;
      return;
    }

    const recent = data.pathHistory.slice(-5);
    const unique = new Set(recent);
    if (unique.size <= 2 && recent.length >= 4) {
      data.loopCount += 1;
    } else {
      data.loopCount = 0;
    }

    if (data.loopCount >= data.loopThreshold) {
      data.forceRandom = true;
      data.loopCount = 0;
      data.loopThreshold = Phaser.Math.Between(2, 5);
    }
  }

  getNextDirection(nextDir, data, canPassWalls) {
    if (nextDir.x === 0 && nextDir.y === 0) {
      return null;
    }
    const nx = data.tileX + nextDir.x;
    const ny = data.tileY + nextDir.y;
    if (this.isWalkable(nx, ny, canPassWalls)) {
      return nextDir;
    }
    if (data.dir.x !== 0 || data.dir.y !== 0) {
      const cx = data.tileX + data.dir.x;
      const cy = data.tileY + data.dir.y;
      if (this.isWalkable(cx, cy, canPassWalls)) {
        return data.dir;
      }
    }
    return null;
  }

  chooseGhostDirection(data, target) {
    const options = this.getAvailableDirs(data.tileX, data.tileY, false);
    if (!options.length) {
      return null;
    }

    const reverse = { x: -data.dir.x, y: -data.dir.y };
    const filtered = options.filter((dir) => !(dir.x === reverse.x && dir.y === reverse.y));
    const choices = filtered.length ? filtered : options;

    if (data.forceRandom) {
      data.forceRandom = false;
      return Phaser.Utils.Array.GetRandom(choices);
    }

    if (data.mode === "fruit") {
      return Phaser.Utils.Array.GetRandom(choices);
    }

    const scored = choices.map((dir) => {
      const nx = data.tileX + dir.x;
      const ny = data.tileY + dir.y;
      const distance = Phaser.Math.Distance.Between(nx, ny, target.x, target.y);
      return { dir, distance };
    });

    scored.sort((a, b) => a.distance - b.distance);
    if (data.mode === "fright") {
      scored.reverse();
    }

    return scored[0].dir;
  }

  getGhostTarget(ghost) {
    const data = ghost.ghostData;
    const playerTile = { x: this.playerData.tileX, y: this.playerData.tileY };
    const cols = this.grid[0].length;
    const rows = this.grid.length;
    const clampTarget = (target) => ({
      x: Phaser.Math.Clamp(target.x, 1, cols - 2),
      y: Phaser.Math.Clamp(target.y, 1, rows - 2),
    });

    if (data.mode === "fright") {
      return clampTarget({ x: cols - playerTile.x, y: rows - playerTile.y });
    }

    if (data.mode === "fruit") {
      return { x: Phaser.Math.Between(1, cols - 2), y: Phaser.Math.Between(1, rows - 2) };
    }

    switch (data.type) {
      case "pinky": {
        const dir = this.playerData.dir;
        return clampTarget({ x: playerTile.x + dir.x * 4, y: playerTile.y + dir.y * 4 });
      }
      case "inky": {
        const blinky = this.ghostGroup.getChildren().find((g) => g.ghostData.type === "blinky");
        const dir = this.playerData.dir;
        const ahead = { x: playerTile.x + dir.x * 2, y: playerTile.y + dir.y * 2 };
        if (blinky) {
          const vec = { x: ahead.x - blinky.ghostData.tileX, y: ahead.y - blinky.ghostData.tileY };
          return clampTarget({ x: ahead.x + vec.x, y: ahead.y + vec.y });
        }
        return clampTarget(ahead);
      }
      case "clyde": {
        const distance = Phaser.Math.Distance.Between(data.tileX, data.tileY, playerTile.x, playerTile.y);
        if (distance > 8) {
          return playerTile;
        }
        return { x: 1, y: rows - 2 };
      }
      case "blinky":
      default:
        return playerTile;
    }
  }

  getAvailableDirs(x, y, canPassWalls) {
    const dirs = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
    return dirs.filter((dir) => this.isWalkable(x + dir.x, y + dir.y, canPassWalls));
  }

  isWalkable(x, y, canPassWalls) {
    if (!this.grid[y] || typeof this.grid[y][x] === "undefined") {
      return false;
    }
    if (canPassWalls) {
      return true;
    }
    if (this.grid[y][x] === 0) {
      return true;
    }
    const door = this.doors.find((d) => d.x === x && d.y === y);
    if (door && door.open) {
      return true;
    }
    return false;
  }

  handlePortal(data, sprite) {
    const portal = this.portals.find((p) => p.x === data.tileX && p.y === data.tileY);
    if (!portal) {
      return;
    }
    if (this.time.now - data.lastPortal < 500) {
      return;
    }
    const pair = this.portals.find((p) => p.id === portal.pair);
    if (!pair) {
      return;
    }
    data.tileX = pair.x;
    data.tileY = pair.y;
    data.target = null;
    data.moving = false;
    data.lastPortal = this.time.now;
    this.positionObject(sprite, pair.x, pair.y);
  }

  collectPellet(x, y) {
    const key = `${x},${y}`;
    const pellet = this.pelletMap.get(key);
    if (pellet) {
      pellet.destroy();
      this.pelletMap.delete(key);
      this.addScore(10);
      this.playTone(880, 0.05, "square", 0.08);
    }
    const power = this.powerMap.get(key);
    if (power) {
      power.destroy();
      this.powerMap.delete(key);
      this.addScore(50);
      this.playTone(220, 0.2, "sawtooth", 0.12);
      this.activatePower(power.powerType.key);
    }

    if (this.pelletMap.size === 0 && this.powerMap.size === 0) {
      if (this.levelIndex >= this.maxLevels) {
        this.winGame();
      } else {
        this.startLevel();
      }
    }
  }

  activatePower(type) {
    this.activeEffects.set(type, this.time.now + 10000);
    this.applyGhostMode();
  }

  applyGhostMode() {
    let mode = "normal";
    if (this.activeEffects.has("glutton")) {
      mode = "fruit";
    } else if (this.activeEffects.has("fright")) {
      mode = "fright";
    }

    this.ghostGroup.getChildren().forEach((ghost) => {
      ghost.ghostData.mode = mode;
      if (mode === "fright") {
        ghost.ghostData.renderColor = 0x3b6bff;
      } else if (mode === "fruit") {
        ghost.ghostData.renderColor = 0xffa43b;
      } else {
        ghost.ghostData.renderColor = ghost.ghostData.color;
      }
    });
  }

  checkCollisions() {
    this.ghostGroup.getChildren().forEach((ghost) => {
      const data = ghost.ghostData;
      if (data.tileX === this.playerData.tileX && data.tileY === this.playerData.tileY) {
        if (data.mode === "fright" || data.mode === "fruit" || this.activeEffects.has("super")) {
          this.addScore(200);
          const spawn = this.spawnPoints.ghosts[data.spawnIndex] || this.spawnPoints.ghosts[0];
          data.tileX = spawn.x;
          data.tileY = spawn.y;
          data.moving = false;
          this.positionObject(ghost, data.tileX, data.tileY);
        } else {
          this.loseLife();
        }
      }
    });

    this.updateActiveEffects();
  }

  updateActiveEffects() {
    const now = this.time.now;
    for (const [key, expiry] of this.activeEffects.entries()) {
      if (now >= expiry) {
        this.activeEffects.delete(key);
      }
    }
    const superActive = this.activeEffects.has("super");
    this.playerData.canPassWalls = superActive;
    this.playerData.superActive = superActive;
    this.applyGhostMode();
  }

  loseLife() {
    this.lives -= 1;
    this.playTone(120, 0.25, "triangle", 0.12);
    if (this.lives <= 0) {
      this.isPlaying = false;
      this.showOverlay("GAME OVER", "Press P or tap START to play again.");
      return;
    }
    this.resetEntities();
    this.updateUI();
  }

  winGame() {
    this.isPlaying = false;
    this.showOverlay("YOU WIN", "AI PACKMAN COMPLETE.");
  }

  addScore(points) {
    this.score += points;
    if (this.score >= this.extraLifeAt) {
      this.lives += 1;
      this.extraLifeAt += 10000;
    }
    this.updateUI();
  }

  updateUI() {
    UI.score.textContent = `SCORE ${String(this.score).padStart(4, "0")}`;
    UI.lives.textContent = `LIVES ${this.lives}`;
    UI.level.textContent = `LEVEL ${this.levelIndex}`;
  }

  initAudio() {
    if (this.audio) {
      if (this.audio.ctx.state === "suspended") {
        this.audio.ctx.resume();
      }
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return;
    }
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.12;
    master.connect(ctx.destination);
    this.audio = { ctx, master };
  }

  playTone(freq, duration, type, gain) {
    if (!this.audio) {
      return;
    }
    const osc = this.audio.ctx.createOscillator();
    const amp = this.audio.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(this.audio.master);
    osc.start();
    osc.stop(this.audio.ctx.currentTime + duration);
  }

  flashMessage(text) {
    this.levelMessage.setText(text);
    this.levelMessage.setPosition(this.scale.width / 2, this.scale.height / 2);
    this.levelMessage.setAlpha(1);
    this.tweens.add({
      targets: this.levelMessage,
      alpha: 0,
      duration: 1200,
      ease: "Power2",
    });
  }

  layoutBoard() {
    const padding = Math.max(8, Math.floor(Math.min(this.scale.width, this.scale.height) * 0.03));
    const hudOffset = this.hudHeight || 80;
    const controlsOffset = this.scale.width < 720 ? 90 : 0;
    const maxWidth = this.scale.width - padding * 2;
    const maxHeight = this.scale.height - padding * 2 - hudOffset - controlsOffset;
    const tileSize = Math.floor(Math.min(maxWidth / this.grid[0].length, maxHeight / this.grid.length));
    const boardWidth = tileSize * this.grid[0].length;
    const boardHeight = tileSize * this.grid.length;
    const offsetX = (this.scale.width - boardWidth) / 2;
    const offsetY = hudOffset + padding + (maxHeight - boardHeight) / 2;
    return { tileSize, offsetX, offsetY };
  }

  positionObject(object, tileX, tileY) {
    object.x = tileX * this.tileSize + this.tileSize / 2;
    object.y = tileY * this.tileSize + this.tileSize / 2;
  }

  worldToTile(x, y) {
    return {
      x: Phaser.Math.Clamp(Math.floor(x / this.tileSize), 0, this.grid[0].length - 1),
      y: Phaser.Math.Clamp(Math.floor(y / this.tileSize), 0, this.grid.length - 1),
    };
  }

  handleResize({ width, height }) {
    if (!this.grid) {
      return;
    }
    this.buildWalls();
    this.portalGraphics.clear();
    this.portalGraphics.lineStyle(2, 0xff2bd6, 0.8);
    this.portalGraphics.fillStyle(0xff2bd6, 0.6);
    this.portals.forEach((portal) => {
      const edgeX = portal.side === "left" ? 0 : this.grid[0].length * this.tileSize;
      const px = edgeX;
      const py = portal.y * this.tileSize + this.tileSize * 0.2;
      const width = this.tileSize * 0.12;
      const height = this.tileSize * 0.6;
      this.portalGraphics.fillRect(px - width / 2, py, width, height);
    });
    this.pelletGroup.getChildren().forEach((pellet) => {
      this.positionObject(pellet, pellet.tile.x, pellet.tile.y);
      const scale = this.tileSize / pellet.baseTileSize;
      pellet.baseScale = scale;
      pellet.setScale(scale);
    });
    this.powerGroup.getChildren().forEach((power) => {
      this.positionObject(power, power.tile.x, power.tile.y);
      const scale = this.tileSize / power.baseTileSize;
      power.baseScale = scale;
      power.setScale(scale);
    });
    this.doors.forEach((door) => {
      this.positionObject(door.sprite, door.x, door.y);
      door.sprite.width = door.vertical ? this.tileSize * 0.2 : this.tileSize * 0.8;
      door.sprite.height = door.vertical ? this.tileSize * 0.8 : this.tileSize * 0.2;
    });
    this.positionObject(this.player, this.playerData.tileX, this.playerData.tileY);
    this.ghostGroup.getChildren().forEach((ghost) => {
      this.positionObject(ghost, ghost.ghostData.tileX, ghost.ghostData.tileY);
    });
    this.drawSquidPlayer(this.time.now);
    this.drawEnemies(this.time.now);
  }
}

const config = {
  type: Phaser.CANVAS,
  parent: "game-wrap",
  canvas: document.getElementById("game"),
  backgroundColor: "#0a0a12",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
};

new Phaser.Game(config);
