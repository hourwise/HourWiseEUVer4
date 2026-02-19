import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_QUEUE_KEY = 'offlineActionQueue_v1';

// Defines the structure of an action to be stored
export interface OfflineAction {
  type: 'END_SHIFT';
  payload: {
    sessionId: string;
    workMinutes: number;
    poaMinutes: number;
    breakMinutes: number;
    otherData: { driving: number };
  };
  timestamp: number; // To know when the action was queued
}

export const offlineQueueService = {
  /**
   * Retrieves the entire queue from AsyncStorage.
   */
  getQueue: async (): Promise<OfflineAction[]> => {
    try {
      const storedQueue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      return storedQueue ? JSON.parse(storedQueue) : [];
    } catch (e) {
      console.error('Failed to get offline queue', e);
      return [];
    }
  },

  /**
   * Adds a new action to the end of the queue.
   */
  addToQueue: async (action: Omit<OfflineAction, 'timestamp'>): Promise<void> => {
    try {
      const currentQueue = await offlineQueueService.getQueue();
      const newAction: OfflineAction = { ...action, timestamp: Date.now() };
      const updatedQueue = [...currentQueue, newAction];
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(updatedQueue));
    } catch (e) {
      console.error('Failed to add to offline queue', e);
    }
  },

  /**
   * Overwrites the queue with a new one, used after processing some actions.
   */
  updateQueue: async (queue: OfflineAction[]): Promise<void> => {
    try {
        await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch(e) {
        console.error('Failed to update offline queue', e);
    }
  },

  /**
   * Clears the entire queue from storage.
   */
  clearQueue: async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    } catch (e) {
      console.error('Failed to clear offline queue', e);
    }
  },
};