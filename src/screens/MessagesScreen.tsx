import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getLatestBroadcasts, getSystemMessages } from '../lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { ChevronLeft, MessageSquare, X, CheckCircle } from 'react-native-feather';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Message {
  id: string;
  content: string;
  created_at: string;
  type: 'broadcast' | 'system';
}

const READ_MESSAGES_KEY = 'read_message_ids_v1';

const MessageItem = ({ item, isRead, onPress }: { item: Message; isRead: boolean; onPress: () => void }) => (
  <TouchableOpacity
    onPress={onPress}
    className={`p-4 border-b border-slate-700 ${isRead ? 'opacity-60' : 'bg-slate-800/40'}`}
  >
    <View className="flex-row justify-between items-start mb-1">
      {item.type === 'system' ? (
        <Text className="text-yellow-400 text-[10px] font-bold uppercase tracking-wider">System Announcement</Text>
      ) : (
        <Text className="text-blue-400 text-[10px] font-bold uppercase tracking-wider">Fleet Message</Text>
      )}
      {!isRead && <View className="w-2 h-2 rounded-full bg-blue-500" />}
    </View>
    <Text className="text-white text-base leading-6" numberOfLines={2}>{item.content}</Text>
    <Text className="text-slate-500 text-[10px] mt-2">
      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
    </Text>
  </TouchableOpacity>
);

export default function MessagesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'unread' | 'read'>('unread');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [broadcasts, systemMessages, storedReadIds] = await Promise.all([
          getLatestBroadcasts(),
          getSystemMessages(),
          AsyncStorage.getItem(READ_MESSAGES_KEY)
        ]);

        const formattedBroadcasts = broadcasts.map(m => ({ ...m, type: 'broadcast' as const }));
        const formattedSystem = systemMessages.map(m => ({ ...m, type: 'system' as const }));
        const allMessages = [...formattedBroadcasts, ...formattedSystem];
        allMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        setMessages(allMessages);
        if (storedReadIds) {
          setReadIds(JSON.parse(storedReadIds));
        }
      } catch (error) {
        console.error('Error loading messages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const { unreadMessages, readMessages } = useMemo(() => {
    const unread = messages.filter(m => !readIds.includes(m.id));
    const read = messages.filter(m => readIds.includes(m.id));
    return { unreadMessages: unread, readMessages: read };
  }, [messages, readIds]);

  const markAsRead = async (id: string) => {
    const newReadIds = [...new Set([...readIds, id])];
    setReadIds(newReadIds);
    await AsyncStorage.setItem(READ_MESSAGES_KEY, JSON.stringify(newReadIds));
    setSelectedMessage(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-center p-4 border-b border-slate-700 bg-slate-900">
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2">
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>
        <View className="flex-row items-center justify-center flex-1 pr-10">
          <MessageSquare size={20} color="white" />
          <Text className="text-xl text-white font-bold ml-2">{t('messages.title', 'Messages')}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row bg-slate-800/50 m-4 rounded-xl p-1">
        <TouchableOpacity
          onPress={() => setActiveTab('unread')}
          className={`flex-1 py-2 rounded-lg items-center ${activeTab === 'unread' ? 'bg-slate-700 shadow-sm' : ''}`}
        >
          <Text className={`font-bold ${activeTab === 'unread' ? 'text-white' : 'text-slate-400'}`}>
            {t('messages.unread', 'Unread')} ({unreadMessages.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('read')}
          className={`flex-1 py-2 rounded-lg items-center ${activeTab === 'read' ? 'bg-slate-700 shadow-sm' : ''}`}
        >
          <Text className={`font-bold ${activeTab === 'read' ? 'text-white' : 'text-slate-400'}`}>
            {t('messages.read', 'Read')}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#60a5fa" />
        </View>
      ) : (
        <FlatList
          data={activeTab === 'unread' ? unreadMessages : readMessages}
          renderItem={({ item }) => (
            <MessageItem
              item={item}
              isRead={readIds.includes(item.id)}
              onPress={() => setSelectedMessage(item)}
            />
          )}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View className="flex-1 justify-center items-center py-20 px-10">
              <Text className="text-slate-500 text-center">
                {activeTab === 'unread'
                  ? t('messages.noUnread', 'All caught up! No unread messages.')
                  : t('messages.noRead', 'No read messages.')}
              </Text>
            </View>
          }
        />
      )}

      {/* Message Detail Modal */}
      <Modal
        visible={!!selectedMessage}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMessage(null)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-slate-800 rounded-t-3xl h-[70%] border-t border-slate-700">
            <View className="flex-row justify-between items-center p-6 border-b border-slate-700">
              <View>
                <Text className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
                  {selectedMessage?.type === 'system' ? 'System Announcement' : 'Fleet Message'}
                </Text>
                <Text className="text-slate-500 text-[10px]">
                  {selectedMessage ? new Date(selectedMessage.created_at).toLocaleString() : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedMessage(null)} className="bg-slate-700 p-2 rounded-full">
                <X size={20} color="white" />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 p-6">
              <Text className="text-white text-lg font-medium leading-7">
                {selectedMessage?.content}
              </Text>
            </ScrollView>

            <View className="p-6 bg-slate-800 border-t border-slate-700">
              {!readIds.includes(selectedMessage?.id || '') ? (
                <TouchableOpacity
                  onPress={() => markAsRead(selectedMessage!.id)}
                  className="bg-blue-600 flex-row items-center justify-center py-4 rounded-xl gap-2"
                >
                  <CheckCircle size={20} color="white" />
                  <Text className="text-white font-bold text-lg">Mark as Read</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => setSelectedMessage(null)}
                  className="bg-slate-700 py-4 rounded-xl"
                >
                  <Text className="text-white font-bold text-center text-lg">Close</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
