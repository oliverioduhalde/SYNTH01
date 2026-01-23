import { GRID_COLS, GRID_ROWS } from "../constants";

export type MazeCell = 0 | 1;

export type MazeResult = {
  grid: MazeCell[][];
  warpRows: number[];
  ghostHouse: GhostHouse;
};

export type GhostHouse = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cells: { x: number; y: number }[];
};

export type MazeValidate = {
  connected: boolean;
  symmetric: boolean;
  warpOk: boolean;
};

export class MazeRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(list: T[]): T {
    return list[this.int(0, list.length - 1)];
  }

  shuffle<T>(list: T[]): T[] {
    const array = list.slice();
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

export class MazeGenerator {
  cols: number;
  rows: number;
  rng: MazeRng;

  constructor(seed = Date.now(), cols = GRID_COLS, rows = GRID_ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.rng = new MazeRng(seed);
  }

  generate(): MazeResult {
    const halfCols = Math.floor(this.cols / 2);
    const left = this.generateHalfMaze(halfCols, this.rows);
    this.braidDeadEnds(left, 2);
    this.addExtraLoops(left, 6);
    const roomCells = this.carveOpenRooms(left);
    this.thinDoubleCorridors(left, 3, roomCells);
    this.enforceSingleWidth(left, roomCells);
    this.openCenterLinks(left, this.rng.int(2, 4));

    const grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(1) as MazeCell[]);
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < halfCols; x += 1) {
        grid[y][x] = left[y][x];
        grid[y][this.cols - 1 - x] = left[y][x];
      }
    }

    for (let x = 0; x < this.cols; x += 1) {
      grid[0][x] = 1;
      grid[this.rows - 1][x] = 1;
    }
    for (let y = 0; y < this.rows; y += 1) {
      grid[y][0] = 1;
      grid[y][this.cols - 1] = 1;
    }

    const ghostHouse = this.carveGhostHouse(grid);
    const warpRows = this.createWarpTunnels(grid, this.rng.int(1, 3));
    return { grid, warpRows, ghostHouse };
  }

  validate(grid: MazeCell[][], warpRows: number[]): MazeValidate {
    return {
      connected: this.validateConnectivity(grid),
      symmetric: this.validateSymmetry(grid),
      warpOk: this.validateWarpRows(grid, warpRows),
    };
  }

  generateHalfMaze(cols: number, rows: number): MazeCell[][] {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(1) as MazeCell[]);
    const stack: { x: number; y: number; dir: { x: number; y: number } | null }[] = [];
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
      let shuffled = this.rng.shuffle(directions);
      if (current.dir && this.rng.next() < 0.7) {
        shuffled = [current.dir, ...shuffled.filter((dir) => dir.x !== current.dir.x || dir.y !== current.dir.y)];
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

  braidDeadEnds(grid: MazeCell[][], passes: number): void {
    for (let pass = 0; pass < passes; pass += 1) {
      const deadEnds: { x: number; y: number }[] = [];
      for (let y = 1; y < grid.length - 1; y += 1) {
        for (let x = 1; x < grid[0].length - 1; x += 1) {
          if (grid[y][x] === 0 && this.countFloorNeighbors(grid, x, y) <= 1) {
            deadEnds.push({ x, y });
          }
        }
      }

      this.rng.shuffle(deadEnds).forEach((cell) => {
        const options = [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ].filter((dir) => grid[cell.y + dir.y][cell.x + dir.x] === 1);
        if (options.length) {
          const pick = this.rng.pick(options);
          grid[cell.y + pick.y][cell.x + pick.x] = 0;
        }
      });
    }
  }

  thinDoubleCorridors(grid: MazeCell[][], passes: number, roomCells: Set<string>): void {
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

  enforceSingleWidth(grid: MazeCell[][], roomCells: Set<string>): void {
    let attempts = 0;
    const maxAttempts = 200;
    for (let y = 1; y < grid.length - 1; y += 1) {
      for (let x = 1; x < grid[0].length - 1; x += 1) {
        if (attempts >= maxAttempts) {
          return;
        }
        if (grid[y][x] !== 0 || roomCells.has(`${x},${y}`)) {
          continue;
        }
        if (grid[y][x + 1] === 0 && !roomCells.has(`${x + 1},${y}`)) {
          const close = this.chooseCellToClose(grid, { x, y }, { x: x + 1, y });
          if (this.canCloseCell(grid, close.x, close.y, roomCells)) {
            grid[close.y][close.x] = 1;
            attempts += 1;
          }
        }
        if (grid[y + 1] && grid[y + 1][x] === 0 && !roomCells.has(`${x},${y + 1}`)) {
          const close = this.chooseCellToClose(grid, { x, y }, { x, y: y + 1 });
          if (this.canCloseCell(grid, close.x, close.y, roomCells)) {
            grid[close.y][close.x] = 1;
            attempts += 1;
          }
        }
      }
    }
  }

  chooseCellToClose(grid: MazeCell[][], a: { x: number; y: number }, b: { x: number; y: number }) {
    const neighborsA = this.countFloorNeighbors(grid, a.x, a.y);
    const neighborsB = this.countFloorNeighbors(grid, b.x, b.y);
    return neighborsA >= neighborsB ? a : b;
  }

  canCloseCell(grid: MazeCell[][], x: number, y: number, roomCells: Set<string>): boolean {
    if (roomCells.has(`${x},${y}`)) {
      return false;
    }
    grid[y][x] = 1;
    const ok = this.validateConnectivity(grid);
    grid[y][x] = 0;
    return ok;
  }

  addExtraLoops(grid: MazeCell[][], attempts: number): void {
    let added = 0;
    let tries = 0;
    while (added < attempts && tries < attempts * 4) {
      tries += 1;
      const wx = this.rng.int(1, grid[0].length - 2);
      const wy = this.rng.int(1, grid.length - 2);
      if (grid[wy][wx] === 1) {
        const neighbors = this.countFloorNeighbors(grid, wx, wy);
        if (neighbors >= 2) {
          grid[wy][wx] = 0;
          added += 1;
        }
      }
    }
  }

  openCenterLinks(grid: MazeCell[][], count: number): void {
    const x = grid[0].length - 1;
    const candidates: number[] = [];
    for (let y = 2; y < grid.length - 2; y += 1) {
      if (grid[y][x - 1] === 0) {
        candidates.push(y);
      }
    }
    this.rng.shuffle(candidates)
      .slice(0, count)
      .forEach((y) => {
        grid[y][x] = 0;
      });
  }

  carveOpenRooms(grid: MazeCell[][]): Set<string> {
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
    const roomCells = new Set<string>();

    for (let i = 0; i < attempts; i += 1) {
      const roll = this.rng.next() * totalWeight;
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
      const x = this.rng.int(1, Math.max(1, maxX));
      const y = this.rng.int(1, Math.max(1, maxY));

      if (!this.isRoomPlaceable(grid, x, y, pick.w, pick.h)) {
        continue;
      }
      this.carveRoom(grid, x, y, pick.w, pick.h, roomCells);
    }
    return roomCells;
  }

  isRoomPlaceable(grid: MazeCell[][], x: number, y: number, w: number, h: number): boolean {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        if (grid[yy][xx] === 0) {
          return false;
        }
      }
    }
    return this.roomHasOpenNeighbor(grid, x, y, w, h);
  }

  roomHasOpenNeighbor(grid: MazeCell[][], x: number, y: number, w: number, h: number): boolean {
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

  carveRoom(grid: MazeCell[][], x: number, y: number, w: number, h: number, roomCells: Set<string>): void {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        grid[yy][xx] = 0;
        roomCells.add(`${xx},${yy}`);
      }
    }
  }

  carveGhostHouse(grid: MazeCell[][]): GhostHouse {
    const width = 6;
    const height = 5;
    const left = Math.floor(this.cols / 2) - Math.floor(width / 2);
    const top = Math.floor(this.rows / 2) - Math.floor(height / 2);
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

    const cells: { x: number; y: number }[] = [];
    for (let y = top + 1; y <= bottom - 1; y += 1) {
      for (let x = left + 1; x <= right - 1; x += 1) {
        cells.push({ x, y });
      }
    }
    return { left, right, top, bottom, cells };
  }

  createWarpTunnels(grid: MazeCell[][], count: number): number[] {
    const candidates: number[] = [];
    for (let y = 2; y < this.rows - 2; y += 1) {
      if (grid[y][1] === 0 && grid[y][this.cols - 2] === 0) {
        candidates.push(y);
      }
    }
    const warpRows = this.rng.shuffle(candidates).slice(0, Math.min(count, candidates.length));
    if (warpRows.length === 0) {
      warpRows.push(Math.floor(this.rows / 2));
    }

    warpRows.forEach((y) => {
      grid[y][0] = 0;
      grid[y][this.cols - 1] = 0;
    });
    return warpRows;
  }

  validateSymmetry(grid: MazeCell[][]): boolean {
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        if (grid[y][x] !== grid[y][this.cols - 1 - x]) {
          return false;
        }
      }
    }
    return true;
  }

  validateConnectivity(grid: MazeCell[][]): boolean {
    let start: { x: number; y: number } | null = null;
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
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

    const visited = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
    const queue = [start];
    visited[start.y][start.x] = true;

    while (queue.length) {
      const current = queue.shift();
      if (!current) {
        break;
      }
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

    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        if (grid[y][x] === 0 && !visited[y][x]) {
          return false;
        }
      }
    }
    return true;
  }

  validateWarpRows(grid: MazeCell[][], warpRows: number[]): boolean {
    const validRows = warpRows.filter((y) => grid[y][0] === 0 && grid[y][this.cols - 1] === 0);
    return validRows.length >= 1 && validRows.length <= 3;
  }

  countFloorNeighbors(grid: MazeCell[][], x: number, y: number): number {
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

  toAscii(grid: MazeCell[][]): string {
    return grid.map((row) => row.map((cell) => (cell === 1 ? "#" : ".")).join("")).join("\n");
  }
}
