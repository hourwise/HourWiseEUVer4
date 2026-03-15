import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { X, Bell } from 'react-native-feather';
import { supabase, getLatestBroadcasts, getSystemMessages } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { useTranslation } from 'react-i18next';

async function registerForPushNotificationsAsync(userId: string) {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') return;
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
  } catch (error) {
    console.error('Error getting a push token', error);
  }
}

const MessagesScreen = () => {
  const { t } = useTranslation();
  const { session, profile } = useAuth();
  const userId = session?.user?.id;

  const [activeTab, setActiveTab] = useState<'unread' | 'read'>('unread');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    try {
      // Read statuses
      const { data: readData, error: readError } = await supabase
        .from('message_reads')
        .select('message_id')
        .eq('user_id', userId);

      if (readError) {
        console.error('message_reads error:', readError);
      }

      const readIds = new Set((readData ?? []).map((r) => r.message_id));

      // Fetch system + broadcasts using same helper logic as dashboard
      const [systemMessages, broadcasts] = await Promise.all([
        getSystemMessages(),
        getLatestBroadcasts(profile?.company_id),
      ]);

      const combined = [
        ...systemMessages.map((m: any) => ({
          ...m,
          type: 'system',
          is_read: readIds.has(m.id),
        })),
        ...broadcasts.map((m: any) => ({
          ...m,
          type: 'broadcast',
          is_read: readIds.has(m.id),
        })),
      ].sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

      setMessages(combined);
    } catch (err: any) {
      console.error('Critical fetchMessages error:', err);
      setFetchError(err?.message || 'Failed to load messages');
      setMessages([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, profile?.company_id]);

  useEffect(() => {
    if (userId) {
      registerForPushNotificationsAsync(userId);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchMessages();
    }, [fetchMessages])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchMessages();
  };

  const handleOpenMessage = async (message: any) => {
    setSelectedMessage(message);
    if (!message.is_read && userId) {
      try {
        const { error } = await supabase
          .from('message_reads')
          .insert({ user_id: userId, message_id: message.id });

        if (!error || error.code === '23505') {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === message.id ? { ...msg, is_read: true } : msg
            )
          );
        }
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const filteredMessages = messages.filter(m => activeTab === 'unread' ? !m.is_read : m.is_read);
  const unreadCount = messages.filter(m => !m.is_read).length;

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{fetchError}</Text>
        <TouchableOpacity onPress={fetchMessages} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>{t('common.retry', 'Retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          onPress={() => setActiveTab('unread')}
          style={[styles.tab, activeTab === 'unread' && styles.activeTab]}
        >
          <Text style={[styles.tabText, activeTab === 'unread' && styles.activeTabText]}>
            {t('messages.unread', 'Unread')} {unreadCount > 0 && `(${unreadCount})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('read')}
          style={[styles.tab, activeTab === 'read' && styles.activeTab]}
        >
          <Text style={[styles.tabText, activeTab === 'read' && styles.activeTabText]}>
            {t('messages.read', 'Read')}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredMessages}
        keyExtractor={(item, index) => (item.id || index).toString()}
        renderItem={({ item }) => {
          const isSystem = item.type === 'system';

          return (
            <TouchableOpacity
              onPress={() => handleOpenMessage(item)}
              style={[
                styles.messageCard,
                !item.is_read && styles.unreadCard,
                isSystem && styles.systemCard,
              ]}
            >
              {!item.is_read && <View style={styles.unreadIndicatorDot} />}

              <View style={styles.messageHeader}>
                <Text style={[styles.messageTitle, !item.is_read && styles.unreadTitle]}>
                  {item.title ||
                    (isSystem
                      ? t('messages.systemNotificationTitle', 'System Announcement')
                      : t('messages.notificationTitle', 'Fleet Message'))}
                </Text>

                <View style={[styles.badge, isSystem && styles.systemBadge]}>
                  <Text style={[styles.badgeText, isSystem && styles.systemBadgeText]}>
                    {isSystem ? 'SYSTEM' : 'FLEET'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.messageContent, !item.is_read && styles.unreadContent]} numberOfLines={2}>
                {item.content}
              </Text>

              <Text style={styles.messageDate}>{formatDate(item.created_at)}</Text>
            </TouchableOpacity>
          );
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Bell size={48} color="#334155" style={{ marginBottom: 16 }} />
            <Text style={styles.noMessagesText}>
              {t('messages.noMessages', 'No messages yet.')}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* Message Viewer Modal */}
      <Modal visible={!!selectedMessage} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalType}>{selectedMessage?.type === 'system' ? 'System Update' : 'Fleet Alert'}</Text>
              <TouchableOpacity onPress={() => setSelectedMessage(null)}><X color="#94a3b8" /></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalTitle}>{selectedMessage?.title || (selectedMessage?.type === 'system' ? t('messages.systemNotificationTitle') : t('messages.notificationTitle'))}</Text>
              <Text style={styles.modalDate}>{formatDate(selectedMessage?.created_at)}</Text>
              <Text style={styles.modalText}>{selectedMessage?.content}</Text>
            </ScrollView>
            <TouchableOpacity onPress={() => setSelectedMessage(null)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>{t('common.close', 'Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  tabContainer: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  activeTab: { backgroundColor: '#1e293b' },
  tabText: { color: '#94a3b8', fontWeight: 'bold' },
  activeTabText: { color: '#fff' },
  listContent: { padding: 16, flexGrow: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 24,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  messageCard: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
    position: 'relative',
  },
  unreadCard: {
    backgroundColor: '#1e293b',
    borderLeftColor: '#3b82f6',
  },
  systemCard: {
    borderTopWidth: 2,
    borderTopColor: '#ef4444',
  },
  unreadIndicatorDot: {
    position: 'absolute',
    top: 12,
    left: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f1f5f9',
    flex: 1,
    paddingRight: 8,
  },
  unreadTitle: {
    color: '#fff',
  },
  messageContent: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
    marginBottom: 12,
  },
  unreadContent: {
    color: '#f1f5f9',
    fontWeight: '500',
  },
  messageDate: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  systemBadge: {
    backgroundColor: '#450a0a'
  },
  systemBadgeText: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: 'bold',
  },
  fleetBadge: {
    backgroundColor: '#172554',
  },
  fleetBadgeText: {
    color: '#60a5fa',
    fontSize: 10,
    fontWeight: 'bold',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  noMessagesText: {
    fontSize: 16,
    color: '#64748b',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  modalType: { color: '#60a5fa', fontWeight: 'bold', textTransform: 'uppercase', fontSize: 12 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  modalDate: { fontSize: 12, color: '#64748b', marginBottom: 16 },
  modalText: { fontSize: 16, color: '#cbd5e1', lineHeight: 24, marginBottom: 24 },
  modalBody: { marginBottom: 20 },
  closeButton: { backgroundColor: '#2563eb', padding: 14, borderRadius: 8, alignItems: 'center' },
  closeButtonText: { color: '#fff', fontWeight: 'bold' },
});

export default MessagesScreen;
