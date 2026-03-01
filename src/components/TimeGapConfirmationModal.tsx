import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UnconfirmedTimespan, WorkStatus } from '../hooks/useWorkTimer';

interface Props {
  visible: boolean;
  timespan: UnconfirmedTimespan | null;
  onResolve: (action: 'confirm' | 'end_last') => void;
}

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute(s)`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hour(s) and ${remainingMinutes} minute(s)`;
};

const statusToText = (status: WorkStatus, isDriving: boolean): string => {
  if (status === 'working' && isDriving) return 'Driving';
  if (status === 'working') return 'Working';
  if (status === 'break') return 'On Break';
  if (status === 'poa') return 'on POA';
  return 'in an unknown state';
};

export const TimeGapConfirmationModal: React.FC<Props> = ({ visible, timespan, onResolve }) => {
  const { t } = useTranslation();

  if (!timespan) return null;

  const durationSeconds = Math.floor((timespan.restoredAtMs - timespan.lastTickMs) / 1000);
  const durationText = formatDuration(durationSeconds);
  const lastStatusText = statusToText(timespan.assumedStatus, timespan.isDriving);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 justify-center items-center bg-black/60 p-4">
        <View className="bg-slate-800 rounded-lg p-6 w-full max-w-sm border border-slate-700 shadow-xl">
          <Text className="text-white text-xl font-bold mb-4 text-center">
            Welcome Back!
          </Text>
          <Text className="text-slate-300 text-base mb-6 text-center">
            The app was inactive for about <Text className="font-bold text-white">{durationText}</Text>.
            Your last activity was <Text className="font-bold text-white">{lastStatusText}</Text>.
          </Text>
          <Text className="text-slate-300 text-base mb-6 text-center">
            Please confirm what happened during this time:
          </Text>

          <TouchableOpacity
            onPress={() => onResolve('confirm')}
            className="bg-blue-600 rounded-lg py-4 mb-4"
          >
            <Text className="text-white font-bold text-center text-lg">
              I was <Text className="uppercase">{lastStatusText}</Text> the whole time
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onResolve('end_last')}
            className="bg-slate-600 rounded-lg py-4"
          >
            <Text className="text-white font-bold text-center text-lg">
              I Started a New Activity
            </Text>
            <Text className="text-slate-300 text-xs text-center mt-1">
              (Ends the last activity at the time the app closed)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
