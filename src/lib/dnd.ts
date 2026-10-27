import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { ID, Task } from './types';

export const TASK_MIME = 'application/x-kurs-task';

export function startTaskDrag(e: DragEvent, task: Task) {
  e.dataTransfer.setData(TASK_MIME, task.id);
  e.dataTransfer.effectAllowed = 'move';
  document.body.classList.add('is-dragging');
}

export const endTaskDrag = () => document.body.classList.remove('is-dragging');

export const hasTask = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(TASK_MIME);

export function useDrop(onDrop: (id: ID, e: DragEvent) => void) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const reset = () => {
      depth.current = 0;
      setOver(false);
    };
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', reset);
    };
  }, []);

  const props = {
    onDragEnter: (e: DragEvent) => {
      if (!hasTask(e)) return;
      depth.current += 1;
      setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasTask(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasTask(e)) return;
      depth.current -= 1;
      if (depth.current <= 0) {
        depth.current = 0;
        setOver(false);
      }
    },
    onDrop: (e: DragEvent) => {
      if (!hasTask(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setOver(false);
      endTaskDrag();
      const id = e.dataTransfer.getData(TASK_MIME);
      if (id) onDrop(id, e);
    },
  };

  return { over, props };
}
