import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import {
  buildCriticalTimerWriteId,
  canFlushCriticalTimerWrite,
  mergeCriticalTimerWriteQueue,
  type CriticalTimerWrite,
  type CriticalTimerWriteInput,
} from '../lib/tacho/criticalTimerQueue';

const CRITICAL_TIMER_WRITE_QUEUE_KEY = 'critical_timer_write_queue_v1';
const PENDING_TOO_LONG_MS = 5 * 60 * 1000;
export { buildCriticalTimerWriteId, mergeCriticalTimerWriteQueue };

const normalizeWrite = (write: CriticalTimerWriteInput): CriticalTimerWrite => ({
  ...write,
  createdAtMs: write.createdAtMs ?? Date.now(),
  attempts: 0,
  lastAttemptAtMs: null,
  lastError: null,
});

const serializeError = (error: unknown): string => {
  if (!error) return 'unknown_error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const message = (error as any)?.message;
  return typeof message === 'string' ? message : JSON.stringify(error);
};

const applyCriticalTimerWrite = async (write: CriticalTimerWrite) => {
  if (write.kind === 'start_session') {
    return supabase
      .from('work_sessions')
      .upsert(write.payload as any, { onConflict: 'id' })
      .select()
      .single();
  }

  return supabase
    .from('work_sessions')
    .update(write.payload as any)
    .eq('id', write.sessionId)
    .select()
    .maybeSingle();
};

export const offlineQueueService = {
  getQueue: async (): Promise<CriticalTimerWrite[]> => {
    try {
      const storedQueue = await AsyncStorage.getItem(CRITICAL_TIMER_WRITE_QUEUE_KEY);
      return storedQueue ? JSON.parse(storedQueue) as CriticalTimerWrite[] : [];
    } catch (e) {
      console.error('Failed to get critical timer write queue', e);
      return [];
    }
  },

  enqueueCriticalTimerWrite: async (
    writeInput: CriticalTimerWriteInput,
  ): Promise<CriticalTimerWrite[]> => {
    const write = normalizeWrite(writeInput);
    const currentQueue = await offlineQueueService.getQueue();
    const nextQueue = mergeCriticalTimerWriteQueue(currentQueue, write);
    await offlineQueueService.updateQueue(nextQueue);
    return nextQueue;
  },

  updateQueue: async (queue: CriticalTimerWrite[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(CRITICAL_TIMER_WRITE_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to update critical timer write queue', e);
    }
  },

  clearQueue: async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(CRITICAL_TIMER_WRITE_QUEUE_KEY);
    } catch (e) {
      console.error('Failed to clear critical timer write queue', e);
    }
  },

  flushCriticalTimerWrites: async (): Promise<{
    flushed: number;
    remaining: CriticalTimerWrite[];
    skippedForAuth: number;
  }> => {
    const queue = await offlineQueueService.getQueue();
    if (queue.length === 0) return { flushed: 0, remaining: [], skippedForAuth: 0 };

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id ?? null;

    const remaining: CriticalTimerWrite[] = [];
    let flushed = 0;
    let skippedForAuth = 0;

    for (let index = 0; index < queue.length; index += 1) {
      const write = queue[index];

      if (!canFlushCriticalTimerWrite(write, currentUserId)) {
        remaining.push(write);
        skippedForAuth += 1;
        continue;
      }

      try {
        const { error } = await applyCriticalTimerWrite(write);
        if (error) {
          remaining.push({
            ...write,
            attempts: write.attempts + 1,
            lastAttemptAtMs: Date.now(),
            lastError: serializeError(error),
          });
          remaining.push(...queue.slice(index + 1));
          break;
        }
        flushed += 1;
      } catch (e) {
        remaining.push({
          ...write,
          attempts: write.attempts + 1,
          lastAttemptAtMs: Date.now(),
          lastError: serializeError(e),
        });
        remaining.push(...queue.slice(index + 1));
        break;
      }
    }

    await offlineQueueService.updateQueue(remaining);
    return { flushed, remaining, skippedForAuth };
  },

  getHealth: async (): Promise<{
    pendingCount: number;
    oldestPendingAgeMs: number;
    pendingTooLong: boolean;
  }> => {
    const queue = await offlineQueueService.getQueue();
    const nowMs = Date.now();
    const oldestCreatedAt = queue.reduce<number | null>(
      (oldest, write) => oldest === null ? write.createdAtMs : Math.min(oldest, write.createdAtMs),
      null,
    );
    const oldestPendingAgeMs = oldestCreatedAt === null ? 0 : Math.max(0, nowMs - oldestCreatedAt);
    return {
      pendingCount: queue.length,
      oldestPendingAgeMs,
      pendingTooLong: oldestPendingAgeMs > PENDING_TOO_LONG_MS,
    };
  },
};
