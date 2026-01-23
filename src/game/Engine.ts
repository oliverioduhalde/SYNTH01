import { GRID_COLS, GRID_ROWS, ROLE_LABELS } from "../constants";
import type { InputState, SlotState, Vec2 } from "../types";
import { createMinotaur, createTheseus, assignRoles } from "./Entities";
import type { Entity } from "./Entities";
import { MazeGenerator, type MazeResult } from "./Maze";
import { findPath } from "./Pathfinding";
import { MinotaurAI } from "../ai/MinotaurAI";

export type EngineState = {
  theseus: Entity;
  minotaurs: Entity[];
  maze: MazeResult;
  thread: Vec2[];
};

export class Engine {
  state: EngineState;
  ai = new MinotaurAI();
  private tileSize = 20;

  constructor(seed = Date.now()) {
    const generator = new MazeGenerator(seed, GRID_COLS, GRID_ROWS);
    const maze = generator.generate();
    this.state = {
      theseus: createTheseus("theseus", { x: 1, y: 1 }),
      minotaurs: [],
      maze,
      thread: [],
    };
  }

  setupSlots(slots: SlotState[]): void {
    const maze = this.state.maze;
    const ghostCells = maze.ghostHouse.cells;
    const availableRoles = assignRoles();
    const theseusSpawn = this.pickSpawn(maze, false);
    this.state.theseus = createTheseus(slots[0].id || "theseus", theseusSpawn);

    this.state.minotaurs = availableRoles.map((role, index) => {
      const slot = slots.find((s) => s.role === role);
      const spawn = ghostCells[index] ?? this.pickSpawn(maze, true);
      return createMinotaur(slot?.id || `${role}-${index}`, role, spawn, slot?.isAI ?? true);
    });
  }

  update(delta: number, input: InputState): void {
    this.handleTheseusInput(input);
    this.updateEntity(this.state.theseus, delta);
    this.updateThread(this.state.theseus.position);

    this.state.minotaurs.forEach((minotaur) => {
      if (minotaur.isAI) {
        this.ai.update(minotaur, this.state.theseus.position, this.state.maze.grid);
      }
      this.updateEntity(minotaur, delta);
      this.cutThread(minotaur.position);
    });
  }

  setTileSize(tileSize: number): void {
    this.tileSize = tileSize;
  }

  private pickSpawn(maze: MazeResult, avoidHouse: boolean): Vec2 {
    const cells: Vec2[] = [];
    for (let y = 1; y < maze.grid.length - 1; y += 1) {
      for (let x = 1; x < maze.grid[0].length - 1; x += 1) {
        if (maze.grid[y][x] === 0) {
          if (avoidHouse && x > maze.ghostHouse.left && x < maze.ghostHouse.right && y > maze.ghostHouse.top && y < maze.ghostHouse.bottom) {
            continue;
          }
          cells.push({ x, y });
        }
      }
    }
    return cells[Math.floor(Math.random() * cells.length)] ?? { x: 1, y: 1 };
  }

  private handleTheseusInput(input: InputState): void {
    const entity = this.state.theseus;
    if (input.target) {
      const path = findPath(this.state.maze.grid, tile(entity.position), input.target);
      if (path.length > 1) {
        entity.path = path;
        entity.pathIndex = 1;
      }
    }
    if (input.up || input.down || input.left || input.right) {
      entity.path = [];
      entity.pathIndex = 0;
      entity.nextDir = { x: input.right ? 1 : input.left ? -1 : 0, y: input.down ? 1 : input.up ? -1 : 0 };
    }
  }

  private updateEntity(entity: Entity, delta: number): void {
    if (entity.path.length > 0 && entity.pathIndex < entity.path.length) {
      const target = entity.path[entity.pathIndex];
      entity.nextDir = { x: target.x - Math.round(entity.position.x), y: target.y - Math.round(entity.position.y) };
    }

    if (entity.nextDir.x !== 0 || entity.nextDir.y !== 0) {
      entity.dir = entity.nextDir;
    }

    const speed = entity.speed * (delta / 1000);
    const nextPos = { x: entity.position.x + entity.dir.x * speed, y: entity.position.y + entity.dir.y * speed };
    if (this.isWalkable(nextPos)) {
      entity.position = nextPos;
    }

    if (entity.path.length > 0 && entity.pathIndex < entity.path.length) {
      const target = entity.path[entity.pathIndex];
      if (Math.abs(entity.position.x - target.x) < 0.1 && Math.abs(entity.position.y - target.y) < 0.1) {
        entity.position = { x: target.x, y: target.y };
        entity.pathIndex += 1;
      }
    }
  }

  private isWalkable(pos: Vec2): boolean {
    const tilePos = tile(pos);
    const grid = this.state.maze.grid;
    if (!grid[tilePos.y] || typeof grid[tilePos.y][tilePos.x] === "undefined") {
      return false;
    }
    return grid[tilePos.y][tilePos.x] === 0;
  }

  private updateThread(pos: Vec2): void {
    const tilePos = tile(pos);
    const last = this.state.thread[this.state.thread.length - 1];
    if (!last || last.x !== tilePos.x || last.y !== tilePos.y) {
      this.state.thread.push(tilePos);
    }
  }

  private cutThread(pos: Vec2): void {
    const tilePos = tile(pos);
    const index = this.state.thread.findIndex((node) => node.x === tilePos.x && node.y === tilePos.y);
    if (index >= 0) {
      this.state.thread.splice(0, index + 1);
    }
  }
}

function tile(pos: Vec2): Vec2 {
  return { x: Math.round(pos.x), y: Math.round(pos.y) };
}
