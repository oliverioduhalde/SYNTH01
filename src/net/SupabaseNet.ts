import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { SlotState } from "../types";

export class SupabaseNet {
  private client: SupabaseClient | null = null;
  private listeners: ((slots: SlotState[]) => void)[] = [];
  slots: SlotState[] = [];

  constructor() {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (url && key) {
      this.client = createClient(url, key);
    }
  }

  async connect(): Promise<void> {
    if (!this.client) {
      return;
    }
    this.slots = [
      { id: crypto.randomUUID(), role: "theseus", isAI: false, connected: true },
      { id: "", role: "hunter", isAI: false, connected: false },
      { id: "", role: "warden", isAI: false, connected: false },
      { id: "", role: "tracker", isAI: false, connected: false },
      { id: "", role: "brute", isAI: false, connected: false },
    ];
    this.notify();
  }

  onSlots(listener: (slots: SlotState[]) => void): void {
    this.listeners.push(listener);
    listener(this.slots);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.slots));
  }
}
