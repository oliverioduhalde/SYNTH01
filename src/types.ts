export type Vec2 = { x: number; y: number };

export type Role = "theseus" | "hunter" | "warden" | "tracker" | "brute";

export type SlotState = {
  id: string;
  role: Role;
  isAI: boolean;
  connected: boolean;
};

export type InputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  target?: Vec2 | null;
};

export type NetMessage = {
  type: "join" | "leave" | "input" | "slots" | "ping" | "pong";
  payload?: unknown;
};
