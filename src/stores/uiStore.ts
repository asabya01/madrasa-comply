import { create } from 'zustand';
import i18n from '../i18n/index';

const RTL_KEY  = 'madrasa_rtl';
const LANG_KEY = 'madrasa_lang';

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  rtl: boolean;
  setRtl: (val: boolean) => void;
  lang: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;
}

function applyDir(rtl: boolean) {
  document.documentElement.dir  = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = rtl ? 'ar'  : 'en';
}

// Apply persisted preference immediately on module load
const storedLang = (localStorage.getItem(LANG_KEY) as 'en' | 'ar') || 'en';
const storedRtl  = storedLang === 'ar';
applyDir(storedRtl);

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  rtl: storedRtl,
  lang: storedLang,
  setRtl: (val) => {
    const lang = val ? 'ar' : 'en';
    localStorage.setItem(RTL_KEY,  String(val));
    localStorage.setItem(LANG_KEY, lang);
    applyDir(val);
    i18n.changeLanguage(lang);
    set({ rtl: val, lang });
  },
  setLanguage: (lang) => {
    const rtl = lang === 'ar';
    localStorage.setItem(LANG_KEY, lang);
    localStorage.setItem(RTL_KEY,  String(rtl));
    applyDir(rtl);
    i18n.changeLanguage(lang);
    set({ lang, rtl });
  },
}));
