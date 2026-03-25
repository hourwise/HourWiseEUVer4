import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Clock } from 'react-native-feather';
import { useTranslation } from 'react-i18next';

export const DigitalClock = () => {
  const { t } = useTranslation();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  // Format time in 24-hour format
  const formattedTime = time.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Format date with weekday, day, month, year
  const formattedDate = time.toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View className="flex-row items-center gap-3">
      <Clock color="#60a5fa" size={24} />
      <View>
        <Text className="font-bold text-white text-2xl">
          {formattedTime}
        </Text>
        <Text className="text-slate-400 text-xs">
          {formattedDate}
        </Text>
      </View>
    </View>
  );
};
