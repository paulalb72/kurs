import { create } from 'zustand';
import type { Data, Goal, Habit, ID, Milestone, Review, Task } from './types';
import { addDays, todayKey } from './dates';
import { GOAL_COLORS, MAX_TOP, MILESTONE_DAYS } from './rules';

export { GOAL_COLORS, MAX_TOP, sortTasks } from './rules';

export const uid = () => Math.random().toString(36).slice(2, 10);
export const EMPTY: Data = { goals: [], milestones: [], habits: [], habitLogs: [], tasks: [], reviews: [] };
export const habitLogId = (habitId: ID, date: string) => `${habitId}:${date}`;

interface Actions {
  addGoal: (patch?: Partial<Goal>) => ID;
  updateGoal: (id: ID, patch: Partial<Goal>) => void;
  deleteGoal: (id: ID) => void;
  addMilestone: (goalId: ID, patch?: Partial<Milestone>) => ID;
  updateMilestone: (id: ID, patch: Partial<Milestone>) => void;
  deleteMilestone: (id: ID) => void;
  addHabit: (goalId: ID, patch?: Partial<Habit>) => ID;
  updateHabit: (id: ID, patch: Partial<Habit>) => void;
  deleteHabit: (id: ID) => void;
  /** Hakt eine Gewohnheit für einen Tag ab – oder nimmt den Haken wieder weg. */
  toggleHabitDay: (habitId: ID, date: string) => void;
  addTask: (patch: Partial<Task> & { title: string }) => ID;
  updateTask: (id: ID, patch: Partial<Task>) => void;
  toggleTask: (id: ID) => void;
  deleteTask: (id: ID) => void;
  /** Verschiebt eine Aufgabe auf einen Tag (oder zurück in "Unverplant"). */
  scheduleTask: (id: ID, date: string | null) => void;
  /** Gibt false zurück, wenn der Tag schon drei Top-Aufgaben hat. */
  toggleTop: (id: ID) => boolean;
  saveReview: (review: Omit<Review, 'savedAt'>) => void;
  replaceAll: (data: Data) => void;
}

const mapTask = (tasks: Task[], id: ID, fn: (t: Task) => Task) => tasks.map((t) => (t.id === id ? fn(t) : t));

// Gespeichert wird auf dem Server – siehe sync.ts.
export const useStore = create<Data & Actions>()(
  (set, get) => ({
    ...EMPTY,

    addGoal: (patch = {}) => {
      const { goals } = get();
      const goal: Goal = {
        id: uid(),
        title: '',
        emoji: '🎯',
        why: '',
        year: new Date().getFullYear(),
        color: GOAL_COLORS[goals.length % GOAL_COLORS.length],
        createdAt: Date.now(),
        ...patch,
      };
      set({ goals: [...goals, goal] });
      return goal.id;
    },
    updateGoal: (id, patch) => set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
    deleteGoal: (id) =>
      set((s) => {
        const removed = new Set(s.milestones.filter((m) => m.goalId === id).map((m) => m.id));
        const habits = new Set(s.habits.filter((h) => h.goalId === id).map((h) => h.id));
        return {
          goals: s.goals.filter((g) => g.id !== id),
          milestones: s.milestones.filter((m) => m.goalId !== id),
          habits: s.habits.filter((h) => h.goalId !== id),
          habitLogs: s.habitLogs.filter((l) => !habits.has(l.habitId)),
          tasks: s.tasks.map((t) => (t.milestoneId && removed.has(t.milestoneId) ? { ...t, milestoneId: null } : t)),
        };
      }),

    addMilestone: (goalId, patch = {}) => {
      const start = patch.start ?? todayKey();
      const milestone: Milestone = {
        id: uid(),
        goalId,
        title: '',
        emoji: '🏁',
        start,
        due: addDays(start, MILESTONE_DAYS - 1),
        metric: null,
        obstacle: '',
        plan: '',
        achieved: false,
        createdAt: Date.now(),
        ...patch,
      };
      set((s) => ({ milestones: [...s.milestones, milestone] }));
      return milestone.id;
    },
    updateMilestone: (id, patch) =>
      set((s) => ({ milestones: s.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
    deleteMilestone: (id) =>
      set((s) => ({
        milestones: s.milestones.filter((m) => m.id !== id),
        tasks: s.tasks.map((t) => (t.milestoneId === id ? { ...t, milestoneId: null } : t)),
      })),

    addHabit: (goalId, patch = {}) => {
      const habit: Habit = { id: uid(), goalId, title: '', emoji: '🔁', perWeek: 3, start: todayKey(), createdAt: Date.now(), ...patch };
      set((s) => ({ habits: [...s.habits, habit] }));
      return habit.id;
    },
    updateHabit: (id, patch) => set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),
    deleteHabit: (id) =>
      set((s) => ({ habits: s.habits.filter((h) => h.id !== id), habitLogs: s.habitLogs.filter((l) => l.habitId !== id) })),
    toggleHabitDay: (habitId, date) =>
      set((s) => {
        const id = habitLogId(habitId, date);
        return s.habitLogs.some((l) => l.id === id)
          ? { habitLogs: s.habitLogs.filter((l) => l.id !== id) }
          : { habitLogs: [...s.habitLogs, { id, habitId, date }] };
      }),

    addTask: (patch) => {
      const task: Task = {
        id: uid(),
        milestoneId: null,
        date: null,
        top: false,
        done: false,
        doneAt: null,
        createdAt: Date.now(),
        ...patch,
      };
      if (task.top && get().tasks.filter((t) => t.date === task.date && t.top).length >= MAX_TOP) task.top = false;
      set((s) => ({ tasks: [...s.tasks, task] }));
      return task.id;
    },
    updateTask: (id, patch) => set((s) => ({ tasks: mapTask(s.tasks, id, (t) => ({ ...t, ...patch })) })),
    toggleTask: (id) =>
      set((s) => ({
        tasks: mapTask(s.tasks, id, (t) => ({ ...t, done: !t.done, doneAt: t.done ? null : todayKey() })),
      })),
    deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
    scheduleTask: (id, date) =>
      set((s) => ({
        // Prioritäten gelten pro Tag – wer verschiebt, entscheidet am neuen Tag neu.
        tasks: mapTask(s.tasks, id, (t) => ({ ...t, date, top: !!date && t.date === date && t.top })),
      })),
    toggleTop: (id) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return false;
      if (task.top) {
        get().updateTask(id, { top: false });
        return true;
      }
      const date = task.date ?? todayKey();
      if (get().tasks.filter((t) => t.date === date && t.top).length >= MAX_TOP) return false;
      get().updateTask(id, { top: true, date });
      return true;
    },

    saveReview: (review) =>
      set((s) => ({ reviews: [...s.reviews.filter((r) => r.week !== review.week), { ...review, savedAt: Date.now() }] })),
    // Ältere Backups kennen noch keine Gewohnheiten.
    replaceAll: ({ goals, milestones, habits = [], habitLogs = [], tasks, reviews }) =>
      set({ goals, milestones, habits, habitLogs, tasks, reviews }),
  }),
);
