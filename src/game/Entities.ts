import { ROLE_SPEED, ROLE_LABELS } from "../constants";
import type { Vec2, Role } from "../types";

export type Entity = {
  id: string;
  role: Role;
  position: Vec2;
  dir: Vec2;
  nextDir: Vec2;
  speed: number;
  path: Vec2[];
  pathIndex: number;
  isAI: boolean;
};

export function createTheseus(id: string, position: Vec2): Entity {
  return {
    id,
    role: "theseus",
    position,
    dir: { x: 0, y: 0 },
    nextDir: { x: 0, y: 0 },
    speed: ROLE_SPEED.theseus,
    path: [],
    pathIndex: 0,
    isAI: false,
  };
}

export function createMinotaur(id: string, role: Role, position: Vec2, isAI: boolean): Entity {
  return {
    id,
    role,
    position,
    dir: { x: 0, y: 0 },
    nextDir: { x: 0, y: 0 },
    speed: ROLE_SPEED[role],
    path: [],
    pathIndex: 0,
    isAI,
  };
}

export function assignRoles(): Role[] {
  return ROLE_LABELS.slice();
}
