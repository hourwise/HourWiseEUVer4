export const ALERT_TEXT = {
  workWarn30mRemaining: { speechKey: 'audioWork30minLeft', titleKey: 'workTimeWarningTitle', bodyKey: 'workTime30minLeft', channelId: 'channel-30min-v6' },
  workWarn15mRemaining: { speechKey: 'audioWork15minLeft', titleKey: 'workTimeWarningTitle', bodyKey: 'workTime15minLeft', channelId: 'channel-15min-v6' },
  workWarn5mRemaining: { speechKey: 'audioWork5minLeft', titleKey: 'workTimeWarningTitle', bodyKey: 'workTime5minLeft', channelId: 'channel-critical-v6' },
  workLimitReached: { speechKey: 'audioWorkLimitReached', titleKey: 'workTimeWarningTitle', bodyKey: 'workTimeLimitReached', channelId: 'channel-critical-v6' },
  driveCycleWarn30mRemaining: { speechKey: 'audioDriving30minLeft', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime30minLeft', channelId: 'channel-30min-v6' },
  driveCycleWarn15mRemaining: { speechKey: 'audioDriving15minLeft', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime15minLeft', channelId: 'channel-15min-v6' },
  driveCycleWarn5mRemaining: { speechKey: 'audioDriving5minLeft', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime5minLeft', channelId: 'channel-critical-v6' },
  driveCycleLimitReached: { speechKey: 'audioDrivingLimitReached', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTimeLimitReached', channelId: 'channel-critical-v6' },
  driveExtensionWarn30mRemaining: { speechKey: 'audioDrivingExtension30minLeft', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingExtension30minLeft', channelId: 'channel-30min-v6' },
  driveExtensionWarn15mRemaining: { speechKey: 'audioDrivingExtension15minLeft', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingExtension15minLeft', channelId: 'channel-15min-v6' },
  driveExtensionWarn5mRemaining: { speechKey: 'audioDrivingExtension5minLeft', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingExtension5minLeft', channelId: 'channel-critical-v6' },
  driveExtensionLimitReached: { speechKey: 'audioDrivingExtensionLimitReached', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingExtensionLimitReached', channelId: 'channel-critical-v6' },
  weeklyDriveWarn1hRemaining: { speechKey: 'alerts.weeklyDrive1h', titleKey: 'alerts.weeklyDriveTitle', bodyKey: 'alerts.weeklyDrive1h', channelId: 'channel-15min-v6' },
  weeklyDriveLimitReached: { speechKey: 'alerts.weeklyDriveLimit', titleKey: 'alerts.weeklyDriveTitle', bodyKey: 'alerts.weeklyDriveLimit', channelId: 'channel-critical-v6' },
  audioShiftStarted: { speechKey: 'audioShiftStarted', titleKey: '', bodyKey: '', channelId: '' },
  audioShiftEnded: { speechKey: 'audioShiftEnded', titleKey: '', bodyKey: '', channelId: '' },
  warningLowRest: { speechKey: 'alerts.lowRestWarning', titleKey: 'common.error', bodyKey: 'alerts.lowRestWarning', channelId: 'channel-critical-v6' },
  warningReducedRest: { speechKey: 'alerts.reducedRestWarning', titleKey: 'common.error', bodyKey: 'alerts.reducedRestWarning', channelId: 'channel-critical-v6' },
  shift13hLimitSoon: { speechKey: 'alerts.spread30m', titleKey: 'alerts.spreadTitle', bodyKey: 'alerts.spread30m', channelId: 'channel-30min-v6' },
  shift13hLimitReached: { speechKey: 'alerts.spread13hReached', titleKey: 'alerts.spreadTitle', bodyKey: 'alerts.spread13hReached', channelId: 'channel-critical-v6' },
  shift15hLimitSoon: { speechKey: 'alerts.spread15h30m', titleKey: 'alerts.spreadTitle', bodyKey: 'alerts.spread15h30m', channelId: 'channel-30min-v6' },
  shift15hLimitReached: { speechKey: 'alerts.spread15hReached', titleKey: 'alerts.spreadTitle', bodyKey: 'alerts.spread15hReached', channelId: 'channel-critical-v6' },
} as const;

export type AlertKey = keyof typeof ALERT_TEXT;

export const BACKGROUND_DRIVE_ALERT_KEYS: AlertKey[] = [
  'driveCycleWarn30mRemaining',
  'driveCycleWarn15mRemaining',
  'driveCycleWarn5mRemaining',
  'driveCycleLimitReached',
  'driveExtensionWarn30mRemaining',
  'driveExtensionWarn15mRemaining',
  'driveExtensionWarn5mRemaining',
  'driveExtensionLimitReached',
  'weeklyDriveWarn1hRemaining',
  'weeklyDriveLimitReached',
];
