import { create } from 'zustand';
import type { ID } from './types';
import { todayKey } from './dates';

export type Panel = { kind: 'task' | 'milestone' | 'habit' | 'goal'; id: ID };
export type Modal = { kind: 'review'; week: string } | { kind: 'data' } | { kind: 'method' } | { kind: 'more' };

interface UIState {
  panel: Panel | null;
  modal: Modal | null;
  day: string;
  week: string;
  year: number;
  toast: string | null;
  open: (panel: Panel) => void;
  closePanel: () => void;
  showModal: (modal: Modal) => void;
  closeModal: () => void;
  setDay: (day: string) => void;
  setWeek: (week: string) => void;
  setYear: (year: number) => void;
  notify: (message: string) => void;
}

let toastTimer: number | undefined;

export const useUI = create<UIState>()((set) => ({
  panel: null,
  modal: null,
  day: todayKey(),
  week: todayKey(),
  year: new Date().getFullYear(),
  toast: null,
  open: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),
  showModal: (modal) => set({ modal, panel: null }),
  closeModal: () => set({ modal: null }),
  setDay: (day) => set({ day }),
  setWeek: (week) => set({ week }),
  setYear: (year) => set({ year }),
  notify: (toast) => {
    window.clearTimeout(toastTimer);
    set({ toast });
    toastTimer = window.setTimeout(() => set({ toast: null }), 2600);
  },
}));
