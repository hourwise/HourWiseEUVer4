import type { WorkStatus } from './types';

export type ActivitySegmentType = 'work' | 'break' | 'poa' | 'driving_reference';
export type ActivitySegmentSource = 'manual' | 'auto' | 'system' | 'restore';

export type ActivitySegmentMutationKind = 'upsert' | 'close';

export type ActivitySegmentMutation = {
  mutationId: string;
  kind: ActivitySegmentMutationKind;
  id: string;
  sessionId: string;
  userId: string;
  activityType: ActivitySegmentType;
  startTime: string;
  endTime: string | null;
  source: ActivitySegmentSource;
  confidence: number;
  clientUpdatedAt: string;
};

const timestampToKey = (iso: string): string => {
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) ? String(ts) : iso.replace(/[^a-zA-Z0-9]/g, '');
};

export const statusToActivitySegmentType = (
  status: WorkStatus,
): ActivitySegmentType | null => {
  if (status === 'working') return 'work';
  if (status === 'break') return 'break';
  if (status === 'poa') return 'poa';
  return null;
};

export const buildActivitySegmentId = ({
  sessionId,
  activityType,
  startTime,
}: {
  sessionId: string;
  activityType: ActivitySegmentType;
  startTime: string;
}): string => `${sessionId}:${activityType}:${timestampToKey(startTime)}`;

export const buildOpenSegmentMutation = ({
  userId,
  sessionId,
  activityType,
  startTime,
  source = 'manual',
  confidence = 1,
  clientUpdatedAt = new Date().toISOString(),
}: {
  userId: string;
  sessionId: string;
  activityType: ActivitySegmentType;
  startTime: string;
  source?: ActivitySegmentSource;
  confidence?: number;
  clientUpdatedAt?: string;
}): ActivitySegmentMutation => {
  const id = buildActivitySegmentId({ sessionId, activityType, startTime });
  return {
    mutationId: `upsert:${id}`,
    kind: 'upsert',
    id,
    sessionId,
    userId,
    activityType,
    startTime,
    endTime: null,
    source,
    confidence,
    clientUpdatedAt,
  };
};

export const buildCloseSegmentMutation = ({
  userId,
  sessionId,
  activityType,
  startTime,
  endTime,
  source = 'manual',
  confidence = 1,
  clientUpdatedAt = new Date().toISOString(),
}: {
  userId: string;
  sessionId: string;
  activityType: ActivitySegmentType;
  startTime: string;
  endTime: string;
  source?: ActivitySegmentSource;
  confidence?: number;
  clientUpdatedAt?: string;
}): ActivitySegmentMutation | null => {
  if (new Date(endTime).getTime() < new Date(startTime).getTime()) {
    return null;
  }

  const id = buildActivitySegmentId({ sessionId, activityType, startTime });
  return {
    mutationId: `close:${id}:${timestampToKey(endTime)}`,
    kind: 'close',
    id,
    sessionId,
    userId,
    activityType,
    startTime,
    endTime,
    source,
    confidence,
    clientUpdatedAt,
  };
};

export const buildStatusTransitionSegmentMutations = ({
  userId,
  sessionId,
  previousStatus,
  previousSegmentStart,
  nextStatus,
  transitionTime,
  source = 'manual',
  confidence = 1,
}: {
  userId: string;
  sessionId: string;
  previousStatus: WorkStatus;
  previousSegmentStart: string | null;
  nextStatus: WorkStatus;
  transitionTime: string;
  source?: ActivitySegmentSource;
  confidence?: number;
}): ActivitySegmentMutation[] => {
  if (previousStatus === nextStatus) return [];

  const clientUpdatedAt = new Date().toISOString();
  const mutations: ActivitySegmentMutation[] = [];
  const previousActivityType = statusToActivitySegmentType(previousStatus);
  const nextActivityType = statusToActivitySegmentType(nextStatus);

  if (previousActivityType && previousSegmentStart) {
    const closeMutation = buildCloseSegmentMutation({
      userId,
      sessionId,
      activityType: previousActivityType,
      startTime: previousSegmentStart,
      endTime: transitionTime,
      source,
      confidence,
      clientUpdatedAt,
    });
    if (closeMutation) mutations.push(closeMutation);
  }

  if (nextActivityType) {
    mutations.push(
      buildOpenSegmentMutation({
        userId,
        sessionId,
        activityType: nextActivityType,
        startTime: transitionTime,
        source,
        confidence,
        clientUpdatedAt,
      }),
    );
  }

  return mutations;
};
