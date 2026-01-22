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
  }

  create() {
    this.scale.on("resize", this.handleResize, this);

    this.board = this.add.container(0, 0);
    this.wallGraphics = this.add.graphics();
    this.portalGraphics = this.add.graphics();
    this.board.add(this.wallGraphics);
    this.board.add(this.portalGraphics);

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
    this.grid = this.generateMaze(size.cols, size.rows);
    this.spawnPoints = this.pickSpawnPoints();
    this.buildWalls();
    this.buildDoors();
    this.buildPortals();
    this.buildPellets();
    this.buildGhosts();
  }

  getGridSize() {
    return { cols: 27, rows: 31 };
  }

  generateMaze(cols, rows) {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(1));
    const stack = [];
    const start = { x: 1, y: 1 };
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
      const shuffled = Phaser.Utils.Array.Shuffle(directions.slice());
      let carved = false;

      for (const dir of shuffled) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        if (ny > 0 && ny < rows - 1 && nx > 0 && nx < cols - 1 && grid[ny][nx] === 1) {
          grid[ny][nx] = 0;
          grid[current.y + dir.y / 2][current.x + dir.x / 2] = 0;
          stack.push({ x: nx, y: ny });
          carved = true;
          break;
        }
      }

      if (!carved) {
        stack.pop();
      }
    }

    const loops = Phaser.Math.Between(1, 2);
    let added = 0;
    while (added < loops) {
      const wx = Phaser.Math.Between(2, cols - 3);
      const wy = Phaser.Math.Between(2, rows - 3);
      if (grid[wy][wx] === 1) {
        const neighbors = this.countFloorNeighbors(grid, wx, wy);
        if (neighbors >= 2) {
          grid[wy][wx] = 0;
          added += 1;
        }
      }
    }

    return grid;
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
    for (let y = 1; y < this.grid.length - 1; y += 1) {
      for (let x = 1; x < this.grid[0].length - 1; x += 1) {
        if (this.grid[y][x] === 0) {
          floors.push({ x, y });
        }
      }
    }

    const player = floors.shift();
    const ghosts = Phaser.Utils.Array.Shuffle(floors).slice(0, 4);
    return { player, ghosts };
  }

  buildWalls() {
    const { tileSize, offsetX, offsetY } = this.layoutBoard();
    this.tileSize = tileSize;
    this.offsetX = offsetX;
    this.offsetY = offsetY;

    this.wallGraphics.clear();
    const stroke = Math.max(2, tileSize * 0.18);
    const color = 0x37f6ff;
    const alpha = 0.85;
    this.wallGraphics.lineStyle(stroke, color, alpha);
    this.wallGraphics.fillStyle(color, alpha);

    const rows = this.grid.length;
    const cols = this.grid[0].length;
    const capRadius = stroke * 0.5;
    const drawSegment = (x1, y1, x2, y2) => {
      this.wallGraphics.lineBetween(x1, y1, x2, y2);
      this.wallGraphics.fillCircle(x1, y1, capRadius);
      this.wallGraphics.fillCircle(x2, y2, capRadius);
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
    const powerCount = Phaser.Math.Between(3, 10);
    const floorTiles = [];
    const portalSet = new Set(this.portals.map((portal) => `${portal.x},${portal.y}`));
    for (let y = 1; y < this.grid.length - 1; y += 1) {
      for (let x = 1; x < this.grid[0].length - 1; x += 1) {
        if (this.grid[y][x] === 0) {
          if (!portalSet.has(`${x},${y}`)) {
            floorTiles.push({ x, y });
          }
        }
      }
    }

    const shuffled = Phaser.Utils.Array.Shuffle(floorTiles);
    const powerTiles = shuffled.slice(0, powerCount);
    const powerSet = new Set(powerTiles.map((tile) => `${tile.x},${tile.y}`));

    floorTiles.forEach((tile) => {
      const key = `${tile.x},${tile.y}`;
      if (tile.x === this.spawnPoints.player.x && tile.y === this.spawnPoints.player.y) {
        return;
      }
      if (powerSet.has(key)) {
        const powerType = Phaser.Utils.Array.GetRandom(POWER_TYPES);
        const power = this.add.circle(0, 0, this.tileSize * 0.22, powerType.color);
        power.setStrokeStyle(1, 0xffffff, 0.8);
        power.baseTileSize = this.tileSize;
        power.tile = { ...tile };
        this.positionObject(power, tile.x, tile.y);
        power.powerType = powerType;
        this.powerGroup.add(power);
        this.board.add(power);
        this.powerMap.set(key, power);
      } else {
        const pellet = this.add.circle(0, 0, this.tileSize * 0.1, 0xffffff);
        pellet.setAlpha(0.8);
        pellet.baseTileSize = this.tileSize;
        pellet.tile = { ...tile };
        this.positionObject(pellet, tile.x, tile.y);
        this.pelletGroup.add(pellet);
        this.board.add(pellet);
        this.pelletMap.set(key, pellet);
      }
    });
  }

  buildPortals() {
    const floors = [];
    const blocked = new Set([
      `${this.spawnPoints.player.x},${this.spawnPoints.player.y}`,
      ...this.spawnPoints.ghosts.map((spawn) => `${spawn.x},${spawn.y}`),
    ]);
    for (let y = 1; y < this.grid.length - 1; y += 1) {
      for (let x = 1; x < this.grid[0].length - 1; x += 1) {
        if (this.grid[y][x] === 0) {
          const key = `${x},${y}`;
          if (!blocked.has(key)) {
            floors.push({ x, y });
          }
        }
      }
    }

    const portalTiles = Phaser.Utils.Array.Shuffle(floors).slice(0, 2);
    this.portals = portalTiles.map((tile, index) => ({
      ...tile,
      id: index,
      pair: index === 0 ? 1 : 0,
    }));

    this.portalGraphics.clear();
    this.portalGraphics.lineStyle(2, 0xff2bd6, 0.8);
    this.portalGraphics.fillStyle(0x25102c, 1);
    this.portals.forEach((portal) => {
      const px = portal.x * this.tileSize + this.tileSize * 0.15;
      const py = portal.y * this.tileSize + this.tileSize * 0.15;
      this.portalGraphics.strokeRoundedRect(px, py, this.tileSize * 0.7, this.tileSize * 0.7, 6);
      this.portalGraphics.fillRoundedRect(px, py, this.tileSize * 0.7, this.tileSize * 0.7, 6);
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
      speed: 90 + this.levelIndex * 8,
      canPassWalls: false,
      superActive: false,
      lastPortal: 0,
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
      ghost.ghostData.speed = 70 + this.levelIndex * 6;
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
      const dx = target.x - this.playerData.tileX;
      const dy = target.y - this.playerData.tileY;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.queueDirection(dx > 0 ? "right" : "left");
      } else if (Math.abs(dy) > 0) {
        this.queueDirection(dy > 0 ? "down" : "up");
      }
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

  queueDirection(dirKey) {
    this.playerData.nextDir = { ...DIRS[dirKey] };
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
    const mouth = 0.35 + 0.15 * Math.sin(time * 0.008);
    const bodyColor = 0xffe85b;
    const bgColor = 0x0a0a12;

    this.player.clear();
    this.player.fillStyle(bodyColor, 0.98);
    this.player.beginPath();
    this.player.arc(0, -radius * 0.1, radius, Math.PI, 0, false);
    this.player.lineTo(radius, radius * 0.7);
    const tentacleCount = 4;
    for (let i = tentacleCount; i >= 0; i -= 1) {
      const x = radius - (i * radius * 2) / tentacleCount;
      const y = radius * 0.9 + (i % 2 === 0 ? radius * 0.12 : -radius * 0.08);
      this.player.lineTo(x, y);
    }
    this.player.lineTo(-radius, radius * 0.7);
    this.player.closePath();
    this.player.fillPath();

    this.player.fillStyle(bgColor, 1);
    this.player.beginPath();
    this.player.moveTo(0, 0);
    this.player.arc(0, 0, radius * 0.65, angle + mouth, angle - mouth, false);
    this.player.closePath();
    this.player.fillPath();
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
    this.updateDoors(delta);
    this.updatePlayer(delta);
    this.updateGhosts(delta);
    this.drawSquidPlayer(time);
    this.drawEnemies(time);
    this.checkCollisions();
  }

  updateBoardWiggle(time) {
    const driftX = Math.sin(time * 0.0014) * 4;
    const driftY = Math.cos(time * 0.0011) * 3;
    this.board.x = this.offsetX + driftX;
    this.board.y = this.offsetY + driftY;
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
    const speed = player.speed * (this.activeEffects.has("speed") ? 1.4 : 1);
    const canPass = player.canPassWalls;

    if (!player.moving) {
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
      const speed = data.speed * speedMultiplier;

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
      }
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
    const maxWidth = this.scale.width;
    const maxHeight = this.scale.height - 90;
    const tileSize = Math.floor(Math.min(maxWidth / this.grid[0].length, maxHeight / this.grid.length));
    const boardWidth = tileSize * this.grid[0].length;
    const boardHeight = tileSize * this.grid.length;
    const offsetX = (this.scale.width - boardWidth) / 2;
    const offsetY = (this.scale.height - boardHeight) / 2 + 40;
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
    this.portalGraphics.fillStyle(0x25102c, 1);
    this.portals.forEach((portal) => {
      const px = portal.x * this.tileSize + this.tileSize * 0.15;
      const py = portal.y * this.tileSize + this.tileSize * 0.15;
      this.portalGraphics.strokeRoundedRect(px, py, this.tileSize * 0.7, this.tileSize * 0.7, 6);
      this.portalGraphics.fillRoundedRect(px, py, this.tileSize * 0.7, this.tileSize * 0.7, 6);
    });
    this.pelletGroup.getChildren().forEach((pellet) => {
      this.positionObject(pellet, pellet.tile.x, pellet.tile.y);
      const scale = this.tileSize / pellet.baseTileSize;
      pellet.setScale(scale);
    });
    this.powerGroup.getChildren().forEach((power) => {
      this.positionObject(power, power.tile.x, power.tile.y);
      const scale = this.tileSize / power.baseTileSize;
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
