import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Colors, Typography } from '../lib/theme';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { LibraryScreen } from '../screens/library/LibraryScreen';
import { ReaderScreen } from '../screens/reader/ReaderScreen';
import { ChatScreen } from '../screens/chat/ChatScreen';
import { FriendScreen } from '../screens/friend/FriendScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';

type AuthStackParamList = {
  Login: { setAuth: (token: string | null) => void };
  Register: { setAuth: (token: string | null) => void };
};

type MainTabParamList = {
  Library: undefined;
  Chat: undefined;
  Friend: undefined;
  Notifications: undefined;
  Profile: { setAuth: (token: string | null) => void };
};

type ReaderStackParamList = {
  Reader: { bookId: string; title: string };
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  Reader: NavigatorScreenParams<ReaderStackParamList>;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
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
        children={({ navigation }) => (
          <LibraryScreen navigation={navigation} />
        )}
        options={{ title: 'Library', tabBarLabel: 'Library' }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'Chat', tabBarLabel: 'Chat' }}
      />
      <Tab.Screen
        name="Friend"
        component={FriendScreen}
        options={{ title: 'Reading Friend', tabBarLabel: 'Friend' }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: 'Notifications', tabBarLabel: 'Alerts' }}
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
          <>
            <Stack.Screen name="Main">
              {() => <MainNavigator setAuth={setAuth} />}
            </Stack.Screen>
            <Stack.Screen
              name="Reader"
              options={{ headerShown: true, headerTintColor: Colors.text, headerTitleStyle: { ...Typography.h3, color: Colors.text } }}
            >
              {({ route, navigation }) => <ReaderScreen route={route as any} navigation={navigation} />}
            </Stack.Screen>
          </>
        ) : (
          <Stack.Screen name="Auth">
            {() => <AuthNavigator setAuth={setAuth} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
