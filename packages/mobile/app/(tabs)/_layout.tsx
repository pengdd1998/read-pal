import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';
import { ActivityIndicator, View } from 'react-native';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { isAuthenticated, loading } = useAuthStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface[1] }}>
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
        tabBarActiveTintColor: colors.primary[500],
        tabBarInactiveTintColor: isDark ? '#8a8090' : colors.navy[300],
        tabBarStyle: {
          backgroundColor: isDark ? '#252538' : colors.surface[0],
          borderTopColor: isDark ? '#3a3a50' : colors.surface[2],
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="home/index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, size }: { focused: boolean; size: number }) =>
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={focused ? colors.primary[500] : (isDark ? '#8a8090' : colors.navy[300])} />,
        }}
      />
      <Tabs.Screen
        name="library/index"
        options={{
          title: 'Library',
          tabBarIcon: ({ focused, size }: { focused: boolean; size: number }) =>
            <Ionicons name={focused ? 'book' : 'book-outline'} size={size} color={focused ? colors.primary[500] : (isDark ? '#8a8090' : colors.navy[300])} />,
        }}
      />
      <Tabs.Screen
        name="study/index"
        options={{
          title: 'Study',
          tabBarIcon: ({ focused, size }: { focused: boolean; size: number }) =>
            <Ionicons name={focused ? 'school' : 'school-outline'} size={size} color={focused ? colors.primary[500] : (isDark ? '#8a8090' : colors.navy[300])} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused, size }: { focused: boolean; size: number }) =>
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={focused ? colors.primary[500] : (isDark ? '#8a8090' : colors.navy[300])} />,
        }}
      />
      <Tabs.Screen name="library/[bookId]" options={{ href: null }} />
      <Tabs.Screen name="study/session" options={{ href: null }} />
      <Tabs.Screen name="study/knowledge" options={{ href: null }} />
    </Tabs>
  );
}
