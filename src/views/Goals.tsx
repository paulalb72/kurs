import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flag, Plus, Repeat, Target } from 'lucide-react';
import type { ID, Milestone, Task } from '../lib/types';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';
import { goalInfo, habitInfo, milestoneInfo, pct } from '../lib/progress';
import { HabitCard } from '../components/Habits';
import { fmtRemaining, fmtShort, todayKey } from '../lib/dates';
import { sampleData } from '../lib/sample';
import { replaceEverything } from '../lib/sync';
import { ProgressBar, Segmented, SectionTitle, StatusChip, goalColor } from '../components/ui';
import { Logo } from '../components/Sidebar';
import { GoalTimeline } from './GoalTimeline';

export function Goals() {
  const year = useUI((s) => s.year);
  const setYear = useUI((s) => s.setYear);
  const open = useUI((s) => s.open);
  const allGoals = useStore((s) => s.goals);
  const milestones = useStore((s) => s.milestones);
  const tasks = useStore((s) => s.tasks);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const [tab, setTab] = useState<'board' | 'timeline'>('board');

  const today = todayKey();
  const goals = useMemo(() => allGoals.filter((g) => g.year === year), [allGoals, year]);
  const ownMilestones = milestones.filter((m) => goals.some((g) => g.id === m.goalId));
  const ownHabits = habits.filter((h) => goals.some((g) => g.id === h.goalId));
  const onTrack =
    ownMilestones.filter((m) => milestoneInfo(m, tasks, today).status === 'on').length +
    ownHabits.filter((h) => habitInfo(h, habitLogs, today).status === 'on').length;

  const { addGoal, addMilestone, addHabit } = useStore.getState();
  const startForYear = year === new Date().getFullYear() ? today : `${year}-01-01`;
  const newGoal = () => open({ kind: 'goal', id: addGoal({ year }) });
  const newMilestone = (goalId: ID) => open({ kind: 'milestone', id: addMilestone(goalId, { start: startForYear }) });
  const newHabit = (goalId: ID) => open({ kind: 'habit', id: addHabit(goalId, { start: startForYear }) });

  return (
    <div className="view view-wide">
      <header className="view-head">
        <div>
          <div className="eyebrow">Ziele</div>
          <h1>{year}</h1>
          <div className="view-sub">
            {goals.length === 0
              ? 'Noch keine Jahresziele'
              : `${goals.length} Jahresziele · ${ownMilestones.length} Meilensteine · ${ownHabits.length} Gewohnheiten · ${onTrack} auf Kurs`}
          </div>
        </div>
        <div className="head-actions">
          {goals.length > 0 && (
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'board', label: 'Übersicht' },
                { value: 'timeline', label: 'Zeitplan' },
              ]}
            />
          )}
          <div className="stepper">
            <button type="button" className="icon-btn" onClick={() => setYear(year - 1)} aria-label="Vorheriges Jahr">
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="icon-btn" onClick={() => setYear(year + 1)} aria-label="Nächstes Jahr">
              <ChevronRight size={16} />
            </button>
          </div>
          {goals.length > 0 && (
            <button type="button" className="btn btn-primary" onClick={newGoal}>
              <Plus size={15} />
              Jahresziel
            </button>
          )}
        </div>
      </header>

      {goals.length === 0 ? (
        <div className="empty-hero">
          <Logo size={44} />
          <h2>Wohin soll dein Jahr gehen?</h2>
          <p>
            Lege bis zu drei Jahresziele fest. Darauf zahlen messbare Meilensteine mit Deadline und Gewohnheiten mit Wochenziel ein –
            und jede Aufgabe auf einen Meilenstein.
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={newGoal}>
              Erstes Jahresziel anlegen
            </button>
            {allGoals.length === 0 && (
              <button type="button" className="btn" onClick={() => replaceEverything(sampleData())}>
                Beispiel ansehen
              </button>
            )}
          </div>
        </div>
      ) : tab === 'timeline' ? (
        <GoalTimeline year={year} goals={goals} />
      ) : (
        <>
          <section className="section">
            <SectionTitle icon={<Target size={15} />}>Jahresziele</SectionTitle>
            <div className="goal-grid">
              {goals.map((g) => {
                const info = goalInfo(g, { milestones, tasks, habits, habitLogs }, today);
                return (
                  <button key={g.id} type="button" className="card goal-card" style={goalColor(g)} onClick={() => open({ kind: 'goal', id: g.id })}>
                    <div className="card-title">
                      <span className="card-emoji">{g.emoji}</span>
                      <span>{g.title || 'Ohne Titel'}</span>
                    </div>
                    {g.why && <p className="goal-why">{g.why}</p>}
                    <div className="card-foot">
                      <StatusChip status={info.status} />
                      {info.count > 0 && <span className="card-meta">{pct(info.progress)}</span>}
                    </div>
                    <ProgressBar value={info.progress} status={info.status} />
                  </button>
                );
              })}
              {goals.length < 3 && (
                <button type="button" className="card card-new" onClick={newGoal}>
                  <Plus size={16} />
                  Jahresziel
                </button>
              )}
            </div>
            {goals.length > 3 && <p className="hint section-hint">Weniger ist mehr: Mit mehr als drei Jahreszielen verteilt sich deine Energie.</p>}
          </section>

          <section className="section">
            <SectionTitle icon={<Flag size={15} />}>Meilensteine</SectionTitle>
            <div className="ms-board">
              {goals.map((g) => {
                const own = milestones.filter((m) => m.goalId === g.id).sort(byActiveThenDue(tasks, today));
                return (
                  <div key={g.id} className="ms-col">
                    <div className="ms-col-head" style={goalColor(g)}>
                      <span className="dot" />
                      <span className="clip">
                        {g.emoji} {g.title || 'Ohne Titel'}
                      </span>
                      <span className="count">{own.length}</span>
                    </div>
                    {own.map((m) => (
                      <MilestoneCard key={m.id} milestone={m} tasks={tasks} today={today} />
                    ))}
                    <button type="button" className="add-row" onClick={() => newMilestone(g.id)}>
                      <Plus size={14} />
                      Meilenstein
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="section">
            <SectionTitle icon={<Repeat size={15} />} aside={<span className="section-aside">Wochenziel – bewertet über 4 Wochen und gesamt</span>}>
              Gewohnheiten
            </SectionTitle>
            <div className="ms-board">
              {goals.map((g) => {
                const own = habits.filter((h) => h.goalId === g.id);
                return (
                  <div key={g.id} className="ms-col">
                    <div className="ms-col-head" style={goalColor(g)}>
                      <span className="dot" />
                      <span className="clip">
                        {g.emoji} {g.title || 'Ohne Titel'}
                      </span>
                      <span className="count">{own.length}</span>
                    </div>
                    {own.map((h) => (
                      <HabitCard key={h.id} habit={h} info={habitInfo(h, habitLogs, today)} />
                    ))}
                    <button type="button" className="add-row" onClick={() => newHabit(g.id)}>
                      <Plus size={14} />
                      Gewohnheit
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const byActiveThenDue = (tasks: Task[], today: string) => (a: Milestone, b: Milestone) => {
  const done = (m: Milestone) => Number(milestoneInfo(m, tasks, today).status === 'achieved');
  return done(a) - done(b) || a.due.localeCompare(b.due);
};

function MilestoneCard({ milestone: m, tasks, today }: { milestone: Milestone; tasks: Task[]; today: string }) {
  const open = useUI((s) => s.open);
  const info = milestoneInfo(m, tasks, today);
  const running = info.status !== 'achieved' && info.status !== 'planned';
  const measure = m.metric
    ? `${m.metric.current} / ${m.metric.target} ${m.metric.unit}`.trim()
    : info.total
      ? `${info.done} / ${info.total} Aufgaben`
      : 'Noch keine Aufgaben';

  return (
    <button type="button" className="card ms-card" onClick={() => open({ kind: 'milestone', id: m.id })}>
      <div className="card-title">
        <span className="card-emoji">{m.emoji}</span>
        <span>{m.title || 'Ohne Titel'}</span>
      </div>
      <div className="card-meta">
        {measure} · {info.status === 'achieved' ? `bis ${fmtShort(m.due)}` : fmtRemaining(m.due, today)}
      </div>
      <ProgressBar value={info.progress} status={info.status} marker={running ? info.elapsed : undefined} />
      <div className="card-foot">
        <StatusChip status={info.status} />
      </div>
    </button>
  );
}
