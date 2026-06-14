import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import {
  buildOpenSegmentMutation,
  buildStatusTransitionSegmentMutations,
  type ActivitySegmentMutation,
} from '../lib/tacho/activitySegments';
import type { WorkStatus } from '../lib/tacho/types';

const SEGMENT_MUTATION_QUEUE_KEY = 'work_session_segment_mutations_v1';

let missingTableWarned = false;

const loadPendingMutations = async (): Promise<ActivitySegmentMutation[]> => {
  try {
    const raw = await AsyncStorage.getItem(SEGMENT_MUTATION_QUEUE_KEY);
    return raw ? JSON.parse(raw) as ActivitySegmentMutation[] : [];
  } catch (e) {
    console.warn('Failed to load segment mutation queue:', e);
    return [];
  }
};

const savePendingMutations = async (mutations: ActivitySegmentMutation[]) => {
  await AsyncStorage.setItem(SEGMENT_MUTATION_QUEUE_KEY, JSON.stringify(mutations));
};

const enqueueMutations = async (mutations: ActivitySegmentMutation[]) => {
  if (mutations.length === 0) return;
  const pending = await loadPendingMutations();
  const byId = new Map(pending.map(mutation => [mutation.mutationId, mutation]));
  for (const mutation of mutations) {
    byId.set(mutation.mutationId, mutation);
  }
  await savePendingMutations([...byId.values()]);
};

const isMissingTableError = (error: any): boolean => {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  return message.includes('work_session_segments') && (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('relation')
  );
};

const applyMutation = async (mutation: ActivitySegmentMutation) => {
  const clientUpdatedAt = mutation.clientUpdatedAt || new Date().toISOString();

  if (mutation.kind === 'upsert') {
    return (supabase as any)
      .from('work_session_segments')
      .upsert({
        id: mutation.id,
        session_id: mutation.sessionId,
        user_id: mutation.userId,
        activity_type: mutation.activityType,
        start_time: mutation.startTime,
        end_time: mutation.endTime,
        source: mutation.source,
        confidence: mutation.confidence,
        client_created_at: mutation.startTime,
        client_updated_at: clientUpdatedAt,
        updated_at: clientUpdatedAt,
      }, { onConflict: 'id' });
  }

  return (supabase as any)
    .from('work_session_segments')
    .update({
      end_time: mutation.endTime,
      source: mutation.source,
      confidence: mutation.confidence,
      client_updated_at: clientUpdatedAt,
      updated_at: clientUpdatedAt,
    })
    .eq('id', mutation.id);
};

export const flushPendingSegmentMutations = async () => {
  const pending = await loadPendingMutations();
  if (pending.length === 0) return;

  const remaining: ActivitySegmentMutation[] = [];
  for (const mutation of pending) {
    try {
      const { error } = await applyMutation(mutation);
      if (error) {
        remaining.push(mutation);
        if (isMissingTableError(error)) {
          if (!missingTableWarned) {
            console.warn('work_session_segments table is not available yet; segment ledger writes are queued.');
            missingTableWarned = true;
          }
        } else {
          console.warn('Segment ledger sync failed:', error);
        }
      }
    } catch (e) {
      remaining.push(mutation);
      console.warn('Segment ledger sync failed:', e);
    }
  }

  await savePendingMutations(remaining);
};

const recordMutations = async (mutations: ActivitySegmentMutation[]) => {
  await enqueueMutations(mutations);
  await flushPendingSegmentMutations();
};

export const workSessionSegmentService = {
  recordShiftStart: async ({
    userId,
    sessionId,
    startedAt,
  }: {
    userId: string;
    sessionId: string;
    startedAt: string;
  }) => recordMutations([
    buildOpenSegmentMutation({
      userId,
      sessionId,
      activityType: 'work',
      startTime: startedAt,
      source: 'manual',
      confidence: 1,
    }),
  ]),

  recordStatusTransition: async ({
    userId,
    sessionId,
    previousStatus,
    previousSegmentStart,
    nextStatus,
    transitionTime,
  }: {
    userId: string;
    sessionId: string;
    previousStatus: WorkStatus;
    previousSegmentStart: string | null;
    nextStatus: WorkStatus;
    transitionTime: string;
  }) => recordMutations(
    buildStatusTransitionSegmentMutations({
      userId,
      sessionId,
      previousStatus,
      previousSegmentStart,
      nextStatus,
      transitionTime,
      source: 'manual',
      confidence: 1,
    }),
  ),

  recordShiftEnd: async ({
    userId,
    sessionId,
    previousStatus,
    previousSegmentStart,
    endedAt,
  }: {
    userId: string;
    sessionId: string;
    previousStatus: WorkStatus;
    previousSegmentStart: string | null;
    endedAt: string;
  }) => recordMutations(
    buildStatusTransitionSegmentMutations({
      userId,
      sessionId,
      previousStatus,
      previousSegmentStart,
      nextStatus: 'idle',
      transitionTime: endedAt,
      source: 'manual',
      confidence: 1,
    }),
  ),

  flushPending: flushPendingSegmentMutations,
};
