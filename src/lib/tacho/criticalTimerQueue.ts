export type CriticalTimerWriteKind =
  | 'start_session'
  | 'update_session'
  | 'end_session';

export type CriticalTimerWrite = {
  id: string;
  kind: CriticalTimerWriteKind;
  sessionId: string;
  userId: string;
  createdAtMs: number;
  attempts: number;
  lastAttemptAtMs: number | null;
  lastError: string | null;
  payload: Record<string, any>;
};

export type CriticalTimerWriteInput = Omit<
  CriticalTimerWrite,
  'createdAtMs' | 'attempts' | 'lastAttemptAtMs' | 'lastError'
> & {
  createdAtMs?: number;
};

export const buildCriticalTimerWriteId = ({
  kind,
  sessionId,
  reason,
  at,
}: {
  kind: CriticalTimerWriteKind;
  sessionId: string;
  reason?: string;
  at?: string | number | null;
}) => {
  if (kind === 'start_session') return `start:${sessionId}`;
  if (kind === 'end_session') return `end:${sessionId}`;
  if (reason === 'checkpoint') return `checkpoint:${sessionId}`;
  return `update:${sessionId}:${reason ?? 'unknown'}:${at ?? Date.now()}`;
};

export const mergeCriticalTimerWriteQueue = (
  queue: CriticalTimerWrite[],
  write: CriticalTimerWrite,
): CriticalTimerWrite[] => [
  ...queue.filter(existing => existing.id !== write.id),
  write,
];

export const canFlushCriticalTimerWrite = (
  write: CriticalTimerWrite,
  currentUserId: string | null | undefined,
): boolean => !!currentUserId && write.userId === currentUserId;
