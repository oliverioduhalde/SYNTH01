import type { Vec2 } from "../types";

export type Grid = number[][];

export function findPath(grid: Grid, start: Vec2, goal: Vec2): Vec2[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const key = (p: Vec2) => `${p.x},${p.y}`;
  const inBounds = (p: Vec2) => p.x >= 0 && p.y >= 0 && p.x < cols && p.y < rows;
  const neighbors = (p: Vec2) => [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ].filter((n) => inBounds(n) && grid[n.y][n.x] === 0);

  const open: Vec2[] = [start];
  const came = new Map<string, string>();
  const g = new Map<string, number>([[key(start), 0]]);
  const f = new Map<string, number>([[key(start), manhattan(start, goal)]]);

  while (open.length) {
    open.sort((a, b) => (f.get(key(a)) ?? 0) - (f.get(key(b)) ?? 0));
    const current = open.shift() as Vec2;
    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(came, current);
    }

    neighbors(current).forEach((next) => {
      const tentative = (g.get(key(current)) ?? 0) + 1;
      const nextKey = key(next);
      if (tentative < (g.get(nextKey) ?? Infinity)) {
        came.set(nextKey, key(current));
        g.set(nextKey, tentative);
        f.set(nextKey, tentative + manhattan(next, goal));
        if (!open.find((p) => p.x === next.x && p.y === next.y)) {
          open.push(next);
        }
      }
    });
  }

  return [];
}

function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function reconstructPath(came: Map<string, string>, current: Vec2): Vec2[] {
  const path: Vec2[] = [current];
  let curKey = `${current.x},${current.y}`;
  while (came.has(curKey)) {
    const prev = came.get(curKey) as string;
    const [x, y] = prev.split(",").map((v) => parseInt(v, 10));
    path.unshift({ x, y });
    curKey = prev;
  }
  return path;
}
