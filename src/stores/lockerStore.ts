import { create } from "zustand";
import { toast } from "@/lib/toast";
import {
  getAllBlockerProfiles,
  createBlockerProfile as dbCreateBlockerProfile,
  updateBlockerProfile as dbUpdateBlockerProfile,
  deleteBlockerProfile as dbDeleteBlockerProfile,
  setBlockerDomains,
  type BlockerProfile,
} from "@/lib/db";
import { invoke } from "@tauri-apps/api/core";

type LockerState = {
  profiles: BlockerProfile[];
  isLockerActive: boolean;
  hasPermission: boolean | null;
  isLoaded: boolean;
};

type LockerActions = {
  loadProfiles: () => Promise<void>;
  createProfile: (name: string, domains: string[]) => Promise<void>;
  updateProfile: (id: string, name: string, domains: string[]) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  checkPermission: () => Promise<void>;
  setLockerActive: (val: boolean) => void;
};

export const useLockerStore = create<LockerState & LockerActions>((set, get) => ({
  profiles: [],
  isLockerActive: false,
  hasPermission: null,
  isLoaded: false,

  loadProfiles: async () => {
    try {
      const profiles = await getAllBlockerProfiles();
      set({ profiles, isLoaded: true });
    } catch (e) {
      console.error("loadProfiles failed:", e);
      set({ isLoaded: true });
    }
  },

  createProfile: async (name, domains) => {
    const id = crypto.randomUUID();
    await dbCreateBlockerProfile(id, name);
    await setBlockerDomains(id, domains);
    await get().loadProfiles();
  },

  updateProfile: async (id, name, domains) => {
    await dbUpdateBlockerProfile(id, name);
    await setBlockerDomains(id, domains);
    await get().loadProfiles();
  },

  deleteProfile: async (id) => {
    await dbDeleteBlockerProfile(id);
    set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) }));
  },

  checkPermission: async () => {
    try {
      const result = await invoke<boolean>("check_locker_permission");
      set({ hasPermission: result });
      if (!result) {
        toast.error("Admin permission required for website blocker");
      }
    } catch {
      set({ hasPermission: false });
      toast.error("Admin permission required for website blocker");
    }
  },

  setLockerActive: (val) => {
    set({ isLockerActive: val });
  },
}));
