import type { InputState, Vec2 } from "../types";

export class InputManager {
  input: InputState = { up: false, down: false, left: false, right: false };

  constructor(private canvas: HTMLCanvasElement, private toTile: (pos: Vec2) => Vec2) {
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
    canvas.addEventListener("pointerdown", (event) => this.onPointer(event));
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    switch (event.key) {
      case "ArrowUp":
        this.input.up = down;
        break;
      case "ArrowDown":
        this.input.down = down;
        break;
      case "ArrowLeft":
        this.input.left = down;
        break;
      case "ArrowRight":
        this.input.right = down;
        break;
      default:
        break;
    }
  }

  private onPointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.input.target = this.toTile({ x, y });
  }

  consumeTarget(): Vec2 | null {
    const target = this.input.target ?? null;
    this.input.target = null;
    return target;
  }
}
