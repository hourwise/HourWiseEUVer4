export const BACKGROUND_LOCATION_TIME_INTERVAL_MS = 2000;
export const BACKGROUND_LOCATION_DISTANCE_INTERVAL_M = 4;
export const BACKGROUND_LOCATION_NOTIFICATION_COLOR = '#60a5fa';

export type DurableBackgroundLocationOptions = {
  accuracy: unknown;
  timeInterval: number;
  distanceInterval: number;
  pausesUpdatesAutomatically: boolean;
  foregroundService: {
    notificationTitle: string;
    notificationBody: string;
    notificationColor: string;
    killServiceOnDestroy: boolean;
  };
};

export const buildDurableBackgroundLocationOptions = ({
  accuracy,
  notificationTitle,
  notificationBody,
}: {
  accuracy: unknown;
  notificationTitle: string;
  notificationBody: string;
}): DurableBackgroundLocationOptions => ({
  accuracy,
  timeInterval: BACKGROUND_LOCATION_TIME_INTERVAL_MS,
  distanceInterval: BACKGROUND_LOCATION_DISTANCE_INTERVAL_M,
  pausesUpdatesAutomatically: false,
  foregroundService: {
    notificationTitle,
    notificationBody,
    notificationColor: BACKGROUND_LOCATION_NOTIFICATION_COLOR,
    killServiceOnDestroy: false,
  },
});

export const hasDurableBackgroundLocationOptions = (options: unknown): boolean => {
  if (!options || typeof options !== 'object') return false;
  const taskOptions = options as {
    timeInterval?: unknown;
    distanceInterval?: unknown;
    pausesUpdatesAutomatically?: unknown;
    foregroundService?: {
      killServiceOnDestroy?: unknown;
    };
  };

  return (
    taskOptions.timeInterval === BACKGROUND_LOCATION_TIME_INTERVAL_MS &&
    taskOptions.distanceInterval === BACKGROUND_LOCATION_DISTANCE_INTERVAL_M &&
    taskOptions.pausesUpdatesAutomatically === false &&
    !!taskOptions.foregroundService &&
    taskOptions.foregroundService.killServiceOnDestroy === false
  );
};
