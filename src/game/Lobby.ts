import { LOBBY_COUNTDOWN, ROLE_LABELS } from "../constants";
import type { SlotState } from "../types";

export class Lobby {
  slots: SlotState[] = [];
  countdown = LOBBY_COUNTDOWN;
  started = false;
  private timerId: number | null = null;

  constructor(private onStart: (slots: SlotState[]) => void) {}

  setSlots(slots: SlotState[]): void {
    this.slots = slots;
  }

  startCountdown(): void {
    if (this.timerId) {
      return;
    }
    this.countdown = LOBBY_COUNTDOWN;
    this.timerId = window.setInterval(() => {
      this.countdown -= 1;
      if (this.countdown <= 0) {
        this.fillAI();
        this.startMatch();
      }
    }, 1000);
  }

  forceStart(): void {
    if (this.slots.length === 0) {
      this.slots = this.createDefaultSlots();
    }
    this.fillAI();
    this.startMatch();
  }

  private startMatch(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.onStart(this.slots);
  }

  private fillAI(): void {
    const roles = ["theseus", ...ROLE_LABELS];
    roles.forEach((role) => {
      const slot = this.slots.find((s) => s.role === role);
      if (slot && !slot.connected) {
        slot.isAI = true;
      }
    });
  }

  private createDefaultSlots(): SlotState[] {
    return [
      { id: "theseus", role: "theseus", isAI: false, connected: true },
      { id: "hunter-ai", role: "hunter", isAI: true, connected: false },
      { id: "warden-ai", role: "warden", isAI: true, connected: false },
      { id: "tracker-ai", role: "tracker", isAI: true, connected: false },
      { id: "brute-ai", role: "brute", isAI: true, connected: false },
    ];
  }
}
