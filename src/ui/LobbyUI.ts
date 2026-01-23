import type { SlotState } from "../types";

export class LobbyUI {
  private lobby = document.getElementById("lobby") as HTMLDivElement;
  private slotsContainer = document.getElementById("slots") as HTMLDivElement;
  private timer = document.getElementById("timer") as HTMLSpanElement;
  private status = document.getElementById("status") as HTMLSpanElement;
  private startButton = document.getElementById("start-btn") as HTMLButtonElement;

  onStart: (() => void) | null = null;

  constructor() {
    this.startButton.addEventListener("click", () => this.onStart?.());
  }

  show(): void {
    this.lobby.style.display = "grid";
  }

  hide(): void {
    this.lobby.style.display = "none";
  }

  updateSlots(slots: SlotState[]): void {
    this.slotsContainer.innerHTML = "";
    slots.forEach((slot) => {
      const item = document.createElement("div");
      item.className = "slot";
      item.innerHTML = `<span>${slot.role}</span><span>${slot.connected ? "HUMAN" : slot.isAI ? "AI" : "OPEN"}</span>`;
      this.slotsContainer.appendChild(item);
    });
  }

  updateTimer(value: number): void {
    this.timer.textContent = value.toString();
  }

  updateStatus(value: string): void {
    this.status.textContent = value;
  }
}
