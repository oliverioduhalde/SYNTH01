import { findPath } from "../game/Pathfinding";
import type { Entity } from "../game/Entities";
import type { Vec2 } from "../types";

export class MinotaurAI {
  update(entity: Entity, target: Vec2, grid: number[][]): void {
    if (entity.path.length === 0 || entity.pathIndex >= entity.path.length - 1 || Math.random() < 0.1) {
      const path = findPath(grid, tile(entity.position), target);
      if (path.length > 1) {
        entity.path = path;
        entity.pathIndex = 1;
      }
    }
  }
}

function tile(pos: Vec2): Vec2 {
  return { x: Math.round(pos.x), y: Math.round(pos.y) };
}
