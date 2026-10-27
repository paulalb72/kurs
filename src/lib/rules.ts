// Regeln, die App und Server (MCP-Tools) gemeinsam nutzen.
import type { GoalColor, Task } from './types';

export const GOAL_COLORS: GoalColor[] = ['sage', 'blue', 'clay', 'plum', 'ochre', 'slate'];

/** Höchstens drei Top-Aufgaben pro Tag */
export const MAX_TOP = 3;

/** Standardlänge eines neuen Meilensteins: 12 Wochen */
export const MILESTONE_DAYS = 12 * 7;

/** Offene zuerst, dann in der Reihenfolge, in der sie angelegt wurden */
export function sortTasks(a: Task, b: Task) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  return a.createdAt - b.createdAt;
}
