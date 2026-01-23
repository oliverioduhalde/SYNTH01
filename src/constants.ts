export const GRID_COLS = 28;
export const GRID_ROWS = 31;
export const TILE_PADDING = 8;
export const LOBBY_COUNTDOWN = 60;

export const COLORS = {
  background: "#06070d",
  walls: "#37f6ff",
  wallsAlt: "#ff2bd6",
  pellet: "#9aff3b",
  power: "#ffe85b",
  thread: "#ff2bd6",
  theseus: "#ffe85b",
  hunter: "#ff244f",
  warden: "#37f6ff",
  tracker: "#9aff3b",
  brute: "#ff2bd6",
};

export const ROLE_SPEED = {
  theseus: 6.0,
  hunter: 5.2,
  warden: 4.6,
  tracker: 4.8,
  brute: 4.4,
};

export const ROLE_LABELS = ["hunter", "warden", "tracker", "brute"] as const;
export type MinotaurRole = (typeof ROLE_LABELS)[number];

export const ROLE_COLORS: Record<MinotaurRole, string> = {
  hunter: COLORS.hunter,
  warden: COLORS.warden,
  tracker: COLORS.tracker,
  brute: COLORS.brute,
};
