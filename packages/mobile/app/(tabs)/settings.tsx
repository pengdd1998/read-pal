import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth-store';
import { router } from 'expo-router';

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-primary-50">
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-display text-primary-800">Settings</Text>
      </View>

      {/* User Card */}
      <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-xs">
        <View className="flex-row items-center">
          <View className="w-12 h-12 rounded-full bg-primary-200 items-center justify-center">
            <Text className="text-lg font-semibold text-primary-700">
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <View className="ml-4 flex-1">
            <Text className="text-base font-semibold text-navy-800">{user?.name || 'User'}</Text>
            <Text className="text-sm text-navy-400">{user?.email || ''}</Text>
          </View>
        </View>
      </View>

      {/* Settings Items */}
      <View className="mx-5 mt-6 bg-white rounded-2xl overflow-hidden shadow-xs">
        <SettingsItem title="Reader Settings" subtitle="Font, theme, display" />
        <SettingsItem title="Reading Goals" subtitle="Daily reading targets" />
        <SettingsItem title="Notifications" subtitle="Reminders and updates" />
        <SettingsItem title="About" subtitle="Version 1.0.0" last />
      </View>

      {/* Logout */}
      <View className="mx-5 mt-8">
        <TouchableOpacity
          className="bg-russet/10 rounded-xl py-4 items-center"
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Text className="text-russet font-semibold text-base">Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function SettingsItem({ title, subtitle, last }: { title: string; subtitle: string; last?: boolean }) {
  return (
    <TouchableOpacity
      className={`px-5 py-4 flex-row items-center justify-between ${!last ? 'border-b border-surface-2' : ''}`}
      activeOpacity={0.6}
    >
      <View>
        <Text className="text-base text-navy-800">{title}</Text>
        <Text className="text-sm text-navy-400 mt-0.5">{subtitle}</Text>
      </View>
      <Text className="text-navy-300">›</Text>
    </TouchableOpacity>
  );
}
