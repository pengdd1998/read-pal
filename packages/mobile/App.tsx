import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppNavigator } from './src/navigation/AppNavigator';
import { Colors } from './src/lib/theme';

const TOKEN_KEY = 'auth_token';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      setIsAuthenticated(!!token);
      setChecking(false);
    }
    checkAuth();
  }, []);

  const setAuth = useCallback(async (token: string | null) => {
    if (token) {
      await AsyncStorage.setItem(TOKEN_KEY, token);
      setIsAuthenticated(true);
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
      setIsAuthenticated(false);
    }
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <AppNavigator isAuthenticated={isAuthenticated} setAuth={setAuth} />
      <StatusBar style="auto" />
    </>
  );
}
