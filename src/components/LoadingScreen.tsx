import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet, StatusBar } from 'react-native';

const LoadingScreen = () => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.text}>Synchronizing...</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a', // Matches brand-dark
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#94a3b8', // Slate-400
    marginTop: 16,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});

export default LoadingScreen;
