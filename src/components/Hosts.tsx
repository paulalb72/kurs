import { useUI } from '../lib/ui';
import { TaskDrawer } from './TaskDrawer';
import { MilestoneDrawer } from './MilestoneDrawer';
import { GoalDrawer } from './GoalDrawer';
import { HabitDrawer } from './HabitDrawer';
import { ReviewModal } from './ReviewModal';
import { DataModal } from './DataModal';
import { MethodModal } from './MethodModal';

export function PanelHost() {
  const panel = useUI((s) => s.panel);
  if (!panel) return null;
  if (panel.kind === 'task') return <TaskDrawer key={panel.id} id={panel.id} />;
  if (panel.kind === 'milestone') return <MilestoneDrawer key={panel.id} id={panel.id} />;
  if (panel.kind === 'habit') return <HabitDrawer key={panel.id} id={panel.id} />;
  return <GoalDrawer key={panel.id} id={panel.id} />;
}

export function ModalHost() {
  const modal = useUI((s) => s.modal);
  if (!modal) return null;
  if (modal.kind === 'review') return <ReviewModal key={modal.week} week={modal.week} />;
  if (modal.kind === 'data') return <DataModal />;
  return <MethodModal />;
}

export function Toast() {
  const toast = useUI((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast}>
      {toast}
    </div>
  );
}
