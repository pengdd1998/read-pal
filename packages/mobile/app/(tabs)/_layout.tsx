import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';
import { ActivityIndicator, View, Text } from 'react-native';
import { useColorScheme } from 'react-native';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Library: '📚',
    Settings: '⚙️',
  };
  return (
    <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.5 }}>
      {icons[name] || '📖'}
    </Text>
  );
}

export default function TabsLayout() {
  const { isAuthenticated, loading } = useAuthStore();
  const colorScheme = useColorScheme();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-primary-50">
        <ActivityIndicator size="large" color="#d97706" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#d97706',
        tabBarInactiveTintColor: '#8a99ae',
        tabBarStyle: {
          backgroundColor: colorScheme === 'dark' ? '#151d28' : '#ffffff',
          borderTopColor: colorScheme === 'dark' ? '#1e2a38' : '#f0e9e0',
          height: 88,
          paddingBottom: 28,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="Library" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="Settings" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
