import React from 'react';
import { ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';

const BootstrappingScreen = ({
  title = 'Preparing your workspace',
  message = 'Checking your account, setup state, and access before opening the app.',
}: {
  title?: string;
  message?: string;
}) => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 24,
    alignItems: 'center',
  },
  title: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
  },
  message: {
    marginTop: 10,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default BootstrappingScreen;
