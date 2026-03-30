import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Colors, Typography } from '../lib/theme';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { LibraryScreen } from '../screens/library/LibraryScreen';
import { ReaderScreen } from '../screens/reader/ReaderScreen';
import { ChatScreen } from '../screens/chat/ChatScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';

type AuthStackParamList = {
  Login: { setAuth: (token: string | null) => void };
  Register: { setAuth: (token: string | null) => void };
};

type MainTabParamList = {
  Library: undefined;
  Reader: { bookId: string; title: string };
  Chat: undefined;
  Profile: { setAuth: (token: string | null) => void };
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};

import type { NavigatorScreenParams } from '@react-navigation/native';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator<MainTabParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

interface AuthNavigatorProps {
  setAuth: (token: string | null) => void;
}

function AuthNavigator({ setAuth }: AuthNavigatorProps) {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} initialParams={{ setAuth }} />
      <AuthStack.Screen name="Register" component={RegisterScreen} initialParams={{ setAuth }} />
    </AuthStack.Navigator>
  );
}

interface MainNavigatorProps {
  setAuth: (token: string | null) => void;
}

function MainNavigator({ setAuth }: MainNavigatorProps) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerTintColor: Colors.text,
        headerTitleStyle: { ...Typography.h3, color: Colors.text },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray400,
        tabBarLabelStyle: { ...Typography.caption },
      }}
    >
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{ title: 'Library', tabBarLabel: 'Library' }}
      />
      <Tab.Screen
        name="Reader"
        component={ReaderScreen}
        options={{ title: 'Reader', tabBarLabel: 'Reader' }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'Chat', tabBarLabel: 'Chat' }}
      />
      <Tab.Screen
        name="Profile"
        children={({ navigation }) => (
          <ProfileScreen navigation={navigation} setAuth={setAuth} />
        )}
        options={{ title: 'Profile', tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

interface AppNavigatorProps {
  isAuthenticated: boolean;
  setAuth: (token: string | null) => void;
}

export function AppNavigator({ isAuthenticated, setAuth }: AppNavigatorProps) {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="Main">
            {() => <MainNavigator setAuth={setAuth} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Auth">
            {() => <AuthNavigator setAuth={setAuth} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
