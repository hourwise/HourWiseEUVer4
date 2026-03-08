import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Vibration, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

type Props = {
  visible?: boolean;
};

export default function AlertTestPanel({ visible = true }: Props) {
  const [log, setLog] = useState<string[]>([]);
  const soundRef = useRef<Audio.Sound | null>(null);

  const pushLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [`${time} - ${msg}`, ...prev].slice(0, 8));
  }, []);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const testImmediateNotification = useCallback(async () => {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'HourWise Test',
          body: 'Immediate notification test fired.',
          sound: 'default',
          priority: 'max',
          categoryIdentifier: 'alarm',
          channelId: 'compliance-alerts-v5',
        },
        trigger: null,
      });
      pushLog(`Immediate notification scheduled: ${id}`);
    } catch (e: any) {
      pushLog(`Immediate notification failed: ${String(e?.message || e)}`);
    }
  }, [pushLog]);

  const testDelayedNotification = useCallback(async (seconds: number) => {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'HourWise Test',
          body: `${seconds} second delayed notification fired.`,
          sound: 'default',
          priority: 'max',
          categoryIdentifier: 'alarm',
          channelId: 'compliance-alerts-v5',
        },
        trigger: { seconds },
      });
      pushLog(`${seconds} second notification scheduled: ${id}`);
    } catch (e: any) {
      pushLog(`Delayed notification failed: ${String(e?.message || e)}`);
    }
  }, [pushLog]);

  const testVibration = useCallback(() => {
    try {
      Vibration.vibrate([0, 300, 150, 300, 150, 500]);
      pushLog('Vibration triggered');
    } catch (e: any) {
      pushLog(`Vibration failed: ${String(e?.message || e)}`);
    }
  }, [pushLog]);

  const testSpeech = useCallback(() => {
    try {
      Speech.speak('This is a test warning from HourWise.', {
        language: 'en-GB',
      });
      pushLog('Speech triggered');
    } catch (e: any) {
      pushLog(`Speech failed: ${String(e?.message || e)}`);
    }
  }, [pushLog]);

  const testForegroundSound = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // Fixed: Using the new lowercase filename
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/sound_5_minute_critical.mp3'),
        { shouldPlay: true }
      );

      soundRef.current = sound;
      pushLog('Foreground sound triggered');
    } catch (e: any) {
      pushLog(`Foreground sound failed: ${String(e?.message || e)}`);
    }
  }, [pushLog]);

  const testAllDelayed = useCallback(async (seconds: number) => {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'HourWise Test (All)',
          body: `Combined test alert fired after ${seconds} seconds.`,
          sound: 'default',
          priority: 'max',
          categoryIdentifier: 'alarm',
          channelId: 'channel-critical-v5',
        },
        trigger: { seconds },
      });
      pushLog(`Combined test scheduled in ${seconds}s: ${id}`);
    } catch (e: any) {
      pushLog(`Combined test failed: ${String(e?.message || e)}`);
    }
  }, [pushLog]);

  const testAllForeground = useCallback(async () => {
    testVibration();
    testSpeech();
    await testForegroundSound();
    await testImmediateNotification();
    pushLog('Combined foreground alert triggered');
  }, [testVibration, testSpeech, testForegroundSound, testImmediateNotification, pushLog]);

  const cancelAllScheduled = useCallback(async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      pushLog('All scheduled notifications cancelled');
    } catch (e: any) {
      pushLog(`Cancel scheduled failed: ${String(e?.message || e)}`);
    }
  }, [pushLog]);

  const checkPermissions = useCallback(async () => {
    try {
      const perms = await Notifications.getPermissionsAsync();
      pushLog(`Notifications permission: ${perms.status}`);
    } catch (e: any) {
      pushLog(`Permission check failed: ${String(e?.message || e)}`);
    }
  }, [pushLog]);

  if (!visible) return null;

  return (
    <View className="bg-slate-900 border border-slate-700 rounded-xl p-4 mt-4">
      <Text className="text-white font-bold text-lg mb-3">Alert Test Panel</Text>
      <Text className="text-slate-400 text-xs mb-4">
        Use this on a real device to verify notification, vibration, speech, and sound behavior.
      </Text>

      <View className="gap-2">
        <TouchableOpacity
          onPress={checkPermissions}
          className="bg-slate-700 rounded-lg py-3 px-4"
        >
          <Text className="text-white font-semibold text-center">Check Notification Permission</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={testImmediateNotification}
          className="bg-blue-600 rounded-lg py-3 px-4"
        >
          <Text className="text-white font-semibold text-center">Test Immediate Notification</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => testDelayedNotification(10)}
          className="bg-indigo-600 rounded-lg py-3 px-4"
        >
          <Text className="text-white font-semibold text-center">Test Notification in 10s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => testAllDelayed(60)}
          className="bg-purple-600 rounded-lg py-3 px-4"
        >
          <Text className="text-white font-semibold text-center">Test ALL in 1 Minute</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => testAllDelayed(300)}
          className="bg-purple-800 rounded-lg py-3 px-4"
        >
          <Text className="text-white font-semibold text-center">Test ALL in 5 Minutes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={testVibration}
          className="bg-orange-600 rounded-lg py-3 px-4"
        >
          <Text className="text-white font-semibold text-center">Test Vibration</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={testSpeech}
          className="bg-emerald-600 rounded-lg py-3 px-4"
        >
          <Text className="text-white font-semibold text-center">Test Speech</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={testForegroundSound}
          className="bg-red-600 rounded-lg py-3 px-4"
        >
          <Text className="text-white font-semibold text-center">Test Foreground Sound</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={testAllForeground}
          className="bg-yellow-600 rounded-lg py-3 px-4"
        >
          <Text className="text-black font-semibold text-center">Test Combined Foreground Alert</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={cancelAllScheduled}
          className="bg-slate-600 rounded-lg py-3 px-4"
        >
          <Text className="text-white font-semibold text-center">Cancel All Scheduled Notifications</Text>
        </TouchableOpacity>
      </View>

      <View className="mt-4 border-t border-slate-700 pt-3">
        <Text className="text-slate-300 font-semibold mb-2">Recent Log</Text>
        {log.length === 0 ? (
          <Text className="text-slate-500 text-xs">No test actions yet.</Text>
        ) : (
          log.map((item, idx) => (
            <Text key={idx} className="text-slate-400 text-xs mb-1">
              {item}
            </Text>
          ))
        )}
      </View>

      {Platform.OS === 'android' ? (
        <Text className="text-slate-500 text-xs mt-3">
          Android note: sound and vibration also depend on device silent mode, DND, app notification settings, and the channel settings.
        </Text>
      ) : null}
    </View>
  );
}
