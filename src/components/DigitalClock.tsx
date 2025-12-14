import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Clock } from 'lucide-react-native';

export const DigitalClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  return (
    <View className="flex-row items-center gap-3">
      <Clock color="#60a5fa" size={24} />
      <View>
        <Text className="font-bold text-white text-2xl">
          {time.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })}
        </Text>
        <Text className="text-slate-400 text-xs">
          {time.toLocaleDateString([], {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </View>
    </View>
  );
};
