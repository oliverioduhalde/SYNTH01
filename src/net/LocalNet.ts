import type { SlotState, NetMessage } from "../types";

export class LocalNet {
  id = crypto.randomUUID();
  slots: SlotState[] = [];
  private channel: BroadcastChannel;
  private listeners: ((slots: SlotState[]) => void)[] = [];

  constructor() {
    this.channel = new BroadcastChannel("minotaur-run");
    this.channel.onmessage = (event) => this.onMessage(event.data as NetMessage);
  }

  async connect(): Promise<void> {
    this.slots = this.createInitialSlots();
    this.broadcast({ type: "join", payload: { id: this.id } });
    this.notify();
  }

  disconnect(): void {
    this.broadcast({ type: "leave", payload: { id: this.id } });
  }

  onSlots(listener: (slots: SlotState[]) => void): void {
    this.listeners.push(listener);
    listener(this.slots);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.slots));
  }

  private broadcast(message: NetMessage): void {
    this.channel.postMessage(message);
  }

  private onMessage(message: NetMessage): void {
    if (message.type === "join") {
      const payload = message.payload as { id: string };
      if (!this.slots.find((slot) => slot.id === payload.id)) {
        const open = this.slots.find((slot) => !slot.connected && !slot.isAI && slot.role !== "theseus");
        if (open) {
          open.id = payload.id;
          open.connected = true;
        }
      }
      this.notify();
    }
    if (message.type === "leave") {
      const payload = message.payload as { id: string };
      const slot = this.slots.find((s) => s.id === payload.id);
      if (slot) {
        slot.connected = false;
        slot.id = "";
      }
      this.notify();
    }
  }

  private createInitialSlots(): SlotState[] {
    return [
      { id: this.id, role: "theseus", isAI: false, connected: true },
      { id: "", role: "hunter", isAI: false, connected: false },
      { id: "", role: "warden", isAI: false, connected: false },
      { id: "", role: "tracker", isAI: false, connected: false },
      { id: "", role: "brute", isAI: false, connected: false },
    ];
  }
}
