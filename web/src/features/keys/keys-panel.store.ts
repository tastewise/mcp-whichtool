import { create } from "zustand";

// Whether the API keys panel is open: the header opens it, and so does whatever needs a key first.
export const useKeysPanel = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false, setOpen: (open) => set({ open }),
}));
