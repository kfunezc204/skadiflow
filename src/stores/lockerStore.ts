import { create } from "zustand";
import {
  getAllBlockerProfiles,
  createBlockerProfile,
  setBlockerDomains,
} from "@/lib/db";
import { invoke } from "@tauri-apps/api/core";

type LockerState = {
  blockedDomains: string[];
  _defaultProfileId: string | null;
  isLockerActive: boolean;
  hasPermission: boolean | null;
  isLoaded: boolean;
};

type LockerActions = {
  loadBlockedDomains: () => Promise<void>;
  setBlockedDomains: (domains: string[]) => Promise<void>;
  checkPermission: () => Promise<void>;
  setLockerActive: (val: boolean) => void;
};

export const useLockerStore = create<LockerState & LockerActions>((set, get) => ({
  blockedDomains: [],
  _defaultProfileId: null,
  isLockerActive: false,
  hasPermission: null,
  isLoaded: false,

  loadBlockedDomains: async () => {
    try {
      let profiles = await getAllBlockerProfiles();
      let profile = profiles[0];
      if (!profile) {
        const id = crypto.randomUUID();
        await createBlockerProfile(id, "__default__");
        await setBlockerDomains(id, []);
        profiles = await getAllBlockerProfiles();
        profile = profiles[0];
      }
      set({
        blockedDomains: profile?.domains ?? [],
        _defaultProfileId: profile?.id ?? null,
        isLoaded: true,
      });
    } catch (e) {
      console.error("loadBlockedDomains failed:", e);
      set({ isLoaded: true });
    }
  },

  setBlockedDomains: async (domains) => {
    const profileId = get()._defaultProfileId;
    if (!profileId) return;
    await setBlockerDomains(profileId, domains);
    set({ blockedDomains: domains });
  },

  checkPermission: async () => {
    try {
      const result = await invoke<boolean>("check_locker_permission");
      set({ hasPermission: result });
    } catch {
      set({ hasPermission: false });
    }
  },

  setLockerActive: (val) => {
    set({ isLockerActive: val });
  },
}));
