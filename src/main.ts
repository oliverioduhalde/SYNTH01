import { createNetAdapter } from "./net";
import { Engine } from "./game/Engine";
import { Renderer } from "./game/Renderer";
import { Lobby } from "./game/Lobby";
import { InputManager } from "./game/Input";
import { LobbyUI } from "./ui/LobbyUI";
import { OptionsUI } from "./ui/OptionsUI";
import { AudioManager } from "./ui/Audio";
import { GRID_COLS, GRID_ROWS, TILE_PADDING } from "./constants";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const engine = new Engine();
const net = createNetAdapter();
const lobby = new Lobby((slots) => {
  engine.setupSlots(slots);
  lobbyUI.hide();
  lobbyUI.updateStatus("RUN");
});
const lobbyUI = new LobbyUI();
const optionsUI = new OptionsUI();
const audio = new AudioManager();

let lastTime = 0;
let running = false;

const input = new InputManager(canvas, (pos) => screenToTile(pos));

lobbyUI.onStart = () => {
  lobby.forceStart();
};

window.addEventListener("pointerdown", () => audio.resume(), { once: true });

net.connect().then(() => {
  if ("onSlots" in net) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (net as any).onSlots((slots: any) => {
      lobby.setSlots(slots);
      lobbyUI.updateSlots(slots);
      if (!running) {
        lobbyUI.show();
        lobby.startCountdown();
        running = true;
      }
    });
  }
});

function loop(time: number) {
  const delta = time - lastTime;
  lastTime = time;
  if (running) {
    const target = input.consumeTarget();
    if (target) {
      input.input.target = target;
    }
    engine.update(delta, input.input);
    const layout = layoutBoard();
    engine.setTileSize(layout.tileSize);
    renderer.resize(layout.width, layout.height);
    renderer.draw({
      maze: engine.state.maze,
      theseus: engine.state.theseus,
      minotaurs: engine.state.minotaurs,
      thread: engine.state.thread,
      tileSize: layout.tileSize,
      offsetX: layout.offsetX,
      offsetY: layout.offsetY,
    });
  }
  requestAnimationFrame(loop);
}

function layoutBoard() {
  const hud = document.querySelector(".hud") as HTMLElement;
  const hudHeight = hud?.offsetHeight ?? 80;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const maxWidth = width - TILE_PADDING * 2;
  const maxHeight = height - hudHeight - TILE_PADDING * 2 - (width < 720 ? 90 : 0);
  const tileSize = Math.floor(Math.min(maxWidth / GRID_COLS, maxHeight / GRID_ROWS));
  const boardWidth = tileSize * GRID_COLS;
  const boardHeight = tileSize * GRID_ROWS;
  return {
    width,
    height,
    tileSize,
    offsetX: (width - boardWidth) / 2,
    offsetY: hudHeight + (maxHeight - boardHeight) / 2 + TILE_PADDING,
  };
}

function screenToTile(pos: { x: number; y: number }) {
  const layout = layoutBoard();
  const x = Math.floor((pos.x - layout.offsetX) / layout.tileSize);
  const y = Math.floor((pos.y - layout.offsetY) / layout.tileSize);
  return { x: clamp(x, 0, GRID_COLS - 1), y: clamp(y, 0, GRID_ROWS - 1) };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

requestAnimationFrame(loop);
