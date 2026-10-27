export type ID = string;
export type GoalColor = 'sage' | 'blue' | 'clay' | 'plum' | 'ochre' | 'slate';
export type Status = 'achieved' | 'on' | 'risk' | 'off' | 'planned' | 'none';

/** Ebene 1: Richtung für das Jahr */
export interface Goal {
  id: ID;
  title: string;
  emoji: string;
  why: string;
  year: number;
  color: GoalColor;
  createdAt: number;
}

export interface Metric {
  current: number;
  target: number;
  unit: string;
}

/** Ebene 2: messbares Ergebnis in 4–12 Wochen */
export interface Milestone {
  id: ID;
  goalId: ID;
  title: string;
  emoji: string;
  start: string;
  due: string;
  /** Wenn gesetzt, ergibt sich der Fortschritt aus dem Messwert statt aus den Aufgaben. */
  metric: Metric | null;
  obstacle: string;
  plan: string;
  achieved: boolean;
  createdAt: number;
}

/** Wiederkehrendes Verhalten mit Wochenziel – zahlt wie ein Meilenstein auf ein Jahresziel ein */
export interface Habit {
  id: ID;
  goalId: ID;
  title: string;
  emoji: string;
  /** Mindestens so oft pro Woche – mehr ist gut */
  perWeek: number;
  /** Ab diesem Tag wird gezählt und bewertet */
  start: string;
  createdAt: number;
}

/** Ein Eintrag = an diesem Tag erledigt. id = `${habitId}:${date}` */
export interface HabitLog {
  id: ID;
  habitId: ID;
  date: string;
}

/** Ebene 3: der nächste konkrete Schritt */
export interface Task {
  id: ID;
  title: string;
  milestoneId: ID | null;
  date: string | null;
  top: boolean;
  done: boolean;
  doneAt: string | null;
  createdAt: number;
}

export interface Review {
  week: string;
  good: string;
  blocked: string;
  change: string;
  savedAt: number;
}

export interface Data {
  goals: Goal[];
  milestones: Milestone[];
  habits: Habit[];
  habitLogs: HabitLog[];
  tasks: Task[];
  reviews: Review[];
}
