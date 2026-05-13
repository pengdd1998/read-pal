import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';
import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  const { isAuthenticated, loading } = useAuthStore();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-primary-50">
        <ActivityIndicator size="large" color="#d97706" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
