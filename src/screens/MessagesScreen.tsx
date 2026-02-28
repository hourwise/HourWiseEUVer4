import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getLatestBroadcasts, getSystemMessages } from '../lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { ChevronLeft, MessageSquare } from 'react-native-feather';
import { useNavigation } from '@react-navigation/native';

interface Message {
  id: string;
  content: string;
  created_at: string;
  type: 'broadcast' | 'system';
}

const MessageItem = ({ item }: { item: Message }) => (
  <View className="p-4 border-b border-slate-700">
    {item.type === 'system' && (
      <Text className="text-yellow-400 text-xs font-bold mb-2">SYSTEM ANNOUNCEMENT</Text>
    )}
    <Text className="text-white text-base leading-6">{item.content}</Text>
    <Text className="text-slate-400 text-xs mt-2">
      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
    </Text>
  </View>
);

export default function MessagesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      const [broadcasts, systemMessages] = await Promise.all([
        getLatestBroadcasts(),
        getSystemMessages(),
      ]);

      const formattedBroadcasts = broadcasts.map(m => ({ ...m, type: 'broadcast' as const }));
      const formattedSystem = systemMessages.map(m => ({ ...m, type: 'system' as const }));

      const allMessages = [...formattedBroadcasts, ...formattedSystem];
      allMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setMessages(allMessages);
      setLoading(false);
    };

    fetchMessages();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['top', 'bottom']}>
      <View className="flex-row items-center p-4 border-b border-slate-700">
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2">
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>
        <View className="flex-row items-center justify-center flex-1 pr-10">
          <MessageSquare size={20} color="white" />
          <Text className="text-xl text-white font-bold ml-2">{t('messages.title', 'Messages')}</Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="white" />
        </View>
      ) : messages.length === 0 ? (
        <View className="flex-1 justify-center items-center">
          <Text className="text-slate-400">{t('messages.noMessages', 'No messages yet.')}</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          renderItem={MessageItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
        />
      )}
    </SafeAreaView>
  );
}
