import { LocalNet } from "./LocalNet";
import { SupabaseNet } from "./SupabaseNet";

export function createNetAdapter() {
  const supabase = new SupabaseNet();
  if ((supabase as unknown as { client?: unknown }).client) {
    return supabase;
  }
  return new LocalNet();
}
