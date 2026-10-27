import type { Data, Goal, Habit, HabitLog, Milestone, Task } from './types';
import { addDays, startOfWeek, todayKey } from './dates.ts';

/** Ausgefülltes Beispiel, relativ zum heutigen Datum, damit Status und Woche lebendig wirken. */
export function sampleData(): Data {
  const today = todayKey();
  const d = (n: number) => addDays(today, n);
  const year = Number(today.slice(0, 4));
  let seq = 0;
  const created = () => Date.now() - 1e7 + seq++ * 1000;

  const goals: Goal[] = [
    { id: 'g-fit', title: 'Fitness und Gesundheit', emoji: '🫀', why: 'Mehr Energie im Alltag – und mit 60 noch die Berge hochkommen.', year, color: 'sage', createdAt: created() },
    { id: 'g-job', title: 'Karriere und Studium', emoji: '💼', why: 'Einen Einstieg finden, bei dem ich jeden Tag dazulerne.', year, color: 'blue', createdAt: created() },
    { id: 'g-me', title: 'Persönliche Entwicklung', emoji: '🌱', why: 'Neugierig bleiben und Dinge wirklich können, statt sie nur anzufangen.', year, color: 'clay', createdAt: created() },
  ];

  const milestone = (m: Pick<Milestone, 'id' | 'goalId' | 'title' | 'emoji' | 'start' | 'due'> & Partial<Milestone>): Milestone => ({
    metric: null,
    obstacle: '',
    plan: '',
    achieved: false,
    createdAt: created(),
    ...m,
  });

  const milestones: Milestone[] = [
    milestone({
      id: 'm-run', goalId: 'g-fit', title: 'Halbmarathon unter 2 Stunden', emoji: '🏅', start: d(-56), due: d(33),
      obstacle: 'Nach langen Unitagen fehlt mir abends die Energie fürs Training.',
      plan: 'Wenn ich abends zu müde bin, laufe ich am nächsten Morgen vor der Uni.',
    }),
    milestone({ id: 'm-food', goalId: 'g-fit', title: 'Ernährung umstellen', emoji: '🥗', start: d(-40), due: d(20), metric: { current: 30, target: 60, unit: 'Tage nach Plan' } }),
    milestone({ id: 'm-apply', goalId: 'g-job', title: 'Bei zehn Unternehmen bewerben', emoji: '📨', start: d(-30), due: d(40), metric: { current: 4, target: 10, unit: 'Bewerbungen' } }),
    milestone({ id: 'm-thesis', goalId: 'g-job', title: 'Masterarbeit: Kapitel 3 schreiben', emoji: '🎓', start: d(-21), due: d(25) }),
    milestone({ id: 'm-net', goalId: 'g-job', title: 'Zwei Networking-Events besuchen', emoji: '🤝', start: d(-90), due: d(-10), achieved: true }),
    milestone({ id: 'm-books', goalId: 'g-me', title: '24 Bücher lesen', emoji: '📚', start: `${year}-01-01`, due: `${year}-12-31`, metric: { current: 18, target: 24, unit: 'Bücher' } }),
    milestone({ id: 'm-es', goalId: 'g-me', title: 'Spanisch auf B2-Niveau', emoji: '🗣️', start: d(-14), due: d(76) }),
    milestone({ id: 'm-trips', goalId: 'g-me', title: 'Drei neue Städte entdecken', emoji: '🌍', start: d(-120), due: d(30), metric: { current: 1, target: 3, unit: 'Städte' } }),
  ];

  let n = 0;
  const task = (t: Pick<Task, 'title'> & Partial<Task>): Task => ({
    id: `t-${n++}`, milestoneId: null, date: null, top: false, done: false, doneAt: null, createdAt: created(), ...t,
  });
  const done = (title: string, milestoneId: string, daysAgo: number) =>
    task({ title, milestoneId, date: d(-daysAgo), done: true, doneAt: d(-daysAgo) });

  const tasks: Task[] = [
    done('Trainingsplan für 12 Wochen erstellen', 'm-run', 54),
    done('Zum Halbmarathon anmelden', 'm-run', 50),
    done('Langer Lauf: 14 km', 'm-run', 13),
    done('Langer Lauf: 16 km', 'm-run', 6),
    done('Laufanalyse im Sportgeschäft', 'm-run', 2),
    task({ title: 'Intervalle: 6 × 800 m', milestoneId: 'm-run', date: today, top: true }),
    task({ title: 'Lockerer Lauf: 8 km', milestoneId: 'm-run', date: d(2) }),
    task({ title: 'Langer Lauf: 18 km', milestoneId: 'm-run', date: d(4) }),
    task({ title: 'Neue Laufschuhe kaufen', milestoneId: 'm-run' }),
    task({ title: 'Meal Prep für die Woche', milestoneId: 'm-food', date: d(5) }),
    task({ title: 'Einkaufsliste mit Rezepten schreiben', milestoneId: 'm-food', date: d(1) }),
    done('LinkedIn-Profil aktualisieren', 'm-apply', 1),
    task({ title: 'Anschreiben für die Produktmanagement-Stelle', milestoneId: 'm-apply', date: today, top: true }),
    task({ title: 'Drei passende Stellen recherchieren', milestoneId: 'm-apply', date: d(3) }),
    done('Literatur für Kapitel 3 sichten', 'm-thesis', 9),
    done('Gliederung mit Betreuerin abstimmen', 'm-thesis', 3),
    task({ title: 'Methodik-Teil schreiben (2 Seiten)', milestoneId: 'm-thesis', date: today, top: true }),
    task({ title: 'Abbildung 3.2 überarbeiten', milestoneId: 'm-thesis', date: d(1) }),
    task({ title: 'Kapitel 3 an Betreuerin schicken', milestoneId: 'm-thesis' }),
    done('Einstufungstest machen', 'm-es', 12),
    task({ title: 'Spanisch: 30 Minuten Vokabeln', milestoneId: 'm-es', date: today }),
    task({ title: 'Für die DELE-B2-Prüfung anmelden', milestoneId: 'm-es', date: d(3) }),
    task({ title: 'Tandempartner finden', milestoneId: 'm-es' }),
    task({ title: 'Wochenende in Lissabon planen', milestoneId: 'm-trips' }),
    task({ title: 'Steuererklärung abschicken', date: d(-1) }),
    task({ title: 'Zahnarzttermin vereinbaren', date: today }),
    task({ title: 'Geschenk für Mamas Geburtstag besorgen', date: d(2) }),
  ];

  // Gewohnheiten mit ein paar Wochen Verlauf: je Woche die Wochentage (0 = Montag), an denen es geklappt hat.
  const monday = startOfWeek(today);
  const weeksAgo = (n: number) => addDays(monday, -7 * n);
  const habits: Habit[] = [
    { id: 'h-kraft', goalId: 'g-fit', title: 'Krafttraining', emoji: '🏋️', perWeek: 3, start: weeksAgo(8), createdAt: created() },
    { id: 'h-zone2', goalId: 'g-fit', title: 'Zone-2-Cardio', emoji: '🚴', perWeek: 5, start: weeksAgo(8), createdAt: created() },
    { id: 'h-spanisch', goalId: 'g-me', title: 'Spanisch üben', emoji: '🗣️', perWeek: 4, start: weeksAgo(5), createdAt: created() },
  ];
  const history: Record<string, number[][]> = {
    'h-kraft': [[0, 2, 4], [0, 2, 4, 5], [1, 3], [0, 2, 4], [0, 3, 5], [1, 4], [0, 2, 4], [0, 2, 5], [0]],
    'h-zone2': [[0, 1, 2, 4, 5], [0, 1, 3, 4, 6], [0, 2, 4, 5], [0, 1, 2, 3, 4, 5], [1, 2, 4], [0, 1, 2, 4, 6], [0, 1, 3, 4, 5], [0, 2, 3, 5, 6], [0, 1]],
    'h-spanisch': [[0, 2, 4, 6], [1, 3], [0, 2, 4], [0, 1, 3], [2, 5], [0]],
  };
  const habitLogs: HabitLog[] = habits.flatMap((h) =>
    history[h.id].flatMap((weekdays, i) =>
      weekdays
        .map((wd) => addDays(addDays(h.start, 7 * i), wd))
        .filter((date) => date <= today)
        .map((date) => ({ id: `${h.id}:${date}`, habitId: h.id, date })),
    ),
  );

  return { goals, milestones, habits, habitLogs, tasks, reviews: [] };
}
