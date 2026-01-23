import { COLORS } from "../constants";
import type { Entity } from "./Entities";
import type { MazeResult } from "./Maze";
import type { Vec2 } from "../types";

export type RenderState = {
  maze: MazeResult;
  theseus: Entity;
  minotaurs: Entity[];
  thread: Vec2[];
  tileSize: number;
  offsetX: number;
  offsetY: number;
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas unsupported");
    }
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  draw(state: RenderState): void {
    this.clear();
    this.drawMaze(state);
    this.drawThread(state);
    this.drawPellets(state);
    this.drawEntities(state);
  }

  private clear(): void {
    this.ctx.fillStyle = COLORS.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawMaze(state: RenderState): void {
    const { grid } = state.maze;
    const rows = grid.length;
    const cols = grid[0].length;
    this.ctx.strokeStyle = COLORS.walls;
    this.ctx.lineWidth = 3;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (grid[y][x] === 1) {
          const px = state.offsetX + x * state.tileSize;
          const py = state.offsetY + y * state.tileSize;
          if (y === 0 || grid[y - 1][x] === 0) {
            this.line(px, py, px + state.tileSize, py);
          }
          if (y === rows - 1 || grid[y + 1][x] === 0) {
            this.line(px, py + state.tileSize, px + state.tileSize, py + state.tileSize);
          }
          if (x === 0 || grid[y][x - 1] === 0) {
            this.line(px, py, px, py + state.tileSize);
          }
          if (x === cols - 1 || grid[y][x + 1] === 0) {
            this.line(px + state.tileSize, py, px + state.tileSize, py + state.tileSize);
          }
        }
      }
    }
  }

  private line(x1: number, y1: number, x2: number, y2: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  private drawPellets(state: RenderState): void {
    const { grid, ghostHouse } = state.maze;
    this.ctx.fillStyle = COLORS.pellet;
    for (let y = 1; y < grid.length - 1; y += 1) {
      for (let x = 1; x < grid[0].length - 1; x += 1) {
        if (grid[y][x] === 0 && !insideHouse(x, y, ghostHouse)) {
          const px = state.offsetX + x * state.tileSize + state.tileSize / 2;
          const py = state.offsetY + y * state.tileSize + state.tileSize / 2;
          this.ctx.beginPath();
          this.ctx.arc(px, py, state.tileSize * 0.08, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    }
  }

  private drawThread(state: RenderState): void {
    if (state.thread.length < 2) {
      return;
    }
    this.ctx.strokeStyle = COLORS.thread;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    state.thread.forEach((node, index) => {
      const px = state.offsetX + node.x * state.tileSize + state.tileSize / 2;
      const py = state.offsetY + node.y * state.tileSize + state.tileSize / 2;
      if (index === 0) {
        this.ctx.moveTo(px, py);
      } else {
        this.ctx.lineTo(px, py);
      }
    });
    this.ctx.stroke();
  }

  private drawEntities(state: RenderState): void {
    this.drawTheseus(state.theseus, state);
    state.minotaurs.forEach((minotaur) => this.drawMinotaur(minotaur, state));
  }

  private drawTheseus(entity: Entity, state: RenderState): void {
    const px = state.offsetX + entity.position.x * state.tileSize + state.tileSize / 2;
    const py = state.offsetY + entity.position.y * state.tileSize + state.tileSize / 2;
    this.ctx.fillStyle = COLORS.theseus;
    this.ctx.beginPath();
    this.ctx.moveTo(px, py - state.tileSize * 0.3);
    this.ctx.lineTo(px + state.tileSize * 0.25, py + state.tileSize * 0.25);
    this.ctx.lineTo(px - state.tileSize * 0.25, py + state.tileSize * 0.25);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawMinotaur(entity: Entity, state: RenderState): void {
    const px = state.offsetX + entity.position.x * state.tileSize + state.tileSize / 2;
    const py = state.offsetY + entity.position.y * state.tileSize + state.tileSize / 2;
    this.ctx.fillStyle = colorForRole(entity.role);
    this.ctx.beginPath();
    this.ctx.arc(px, py, state.tileSize * 0.28, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillRect(px - state.tileSize * 0.18, py - state.tileSize * 0.42, state.tileSize * 0.12, state.tileSize * 0.18);
    this.ctx.fillRect(px + state.tileSize * 0.06, py - state.tileSize * 0.42, state.tileSize * 0.12, state.tileSize * 0.18);
  }
}

function insideHouse(x: number, y: number, house: MazeResult["ghostHouse"]): boolean {
  return x > house.left && x < house.right && y > house.top && y < house.bottom;
}

function colorForRole(role: Entity["role"]): string {
  switch (role) {
    case "hunter":
      return COLORS.hunter;
    case "warden":
      return COLORS.warden;
    case "tracker":
      return COLORS.tracker;
    case "brute":
      return COLORS.brute;
    default:
      return COLORS.theseus;
  }
}
