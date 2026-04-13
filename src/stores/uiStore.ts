import { create } from 'zustand';

const RTL_KEY = 'madrasa_rtl';

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  rtl: boolean;
  setRtl: (val: boolean) => void;
}

function applyDir(rtl: boolean) {
  document.documentElement.dir  = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = rtl ? 'ar'  : 'en';
}

// Apply persisted preference immediately on module load
const storedRtl = localStorage.getItem(RTL_KEY) === 'true';
applyDir(storedRtl);

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  rtl: storedRtl,
  setRtl: (val) => {
    localStorage.setItem(RTL_KEY, String(val));
    applyDir(val);
    set({ rtl: val });
  },
}));
