import { Ionicons } from '@expo/vector-icons';
import { ViewStyle } from 'react-native';

interface IconProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

// Navigation
export const BackIcon = ({ size = 24, color = '#d97706', style }: IconProps) =>
  <Ionicons name="chevron-back" size={size} color={color} style={style} />;

export const CloseIcon = ({ size = 24, color = '#8a99ae', style }: IconProps) =>
  <Ionicons name="close" size={size} color={color} style={style} />;

// Library
export const LibraryIcon = ({ size = 24, color = '#8a99ae', style }: IconProps) =>
  <Ionicons name="book-outline" size={size} color={color} style={style} />;
export const LibraryActiveIcon = ({ size = 24, color = '#d97706', style }: IconProps) =>
  <Ionicons name="book" size={size} color={color} style={style} />;

export const GridIcon = ({ size = 22, color = '#8a99ae', style }: IconProps) =>
  <Ionicons name="grid-outline" size={size} color={color} style={style} />;
export const ListIcon = ({ size = 22, color = '#8a99ae', style }: IconProps) =>
  <Ionicons name="list-outline" size={size} color={color} style={style} />;

export const SearchIcon = ({ size = 20, color = '#8a99ae', style }: IconProps) =>
  <Ionicons name="search-outline" size={size} color={color} style={style} />;

export const UploadIcon = ({ size = 28, color = '#d97706', style }: IconProps) =>
  <Ionicons name="cloud-upload-outline" size={size} color={color} style={style} />;

export const BookPlaceholderIcon = ({ size = 32, color = '#d4b896', style }: IconProps) =>
  <Ionicons name="book-outline" size={size} color={color} style={style} />;

// Reader
export const MenuIcon = ({ size = 22, color = '#1e2a38', style }: IconProps) =>
  <Ionicons name="menu-outline" size={size} color={color} style={style} />;

export const BookmarkIcon = ({ size = 22, color = '#d97706', style }: IconProps) =>
  <Ionicons name="bookmark" size={size} color={color} style={style} />;
export const BookmarkOutlineIcon = ({ size = 22, color = '#8a99ae', style }: IconProps) =>
  <Ionicons name="bookmark-outline" size={size} color={color} style={style} />;

export const SettingsIcon = ({ size = 22, color = '#1e2a38', style }: IconProps) =>
  <Ionicons name="settings-outline" size={size} color={color} style={style} />;

export const FontSizeIcon = ({ size = 20, color = '#3d5578', style }: IconProps) =>
  <Ionicons name="text-outline" size={size} color={color} style={style} />;

export const PaletteIcon = ({ size = 20, color = '#3d5578', style }: IconProps) =>
  <Ionicons name="color-palette-outline" size={size} color={color} style={style} />;

// AI Companion
export const AISparkleIcon = ({ size = 24, color = '#d97706', style }: IconProps) =>
  <Ionicons name="sparkles" size={size} color={color} style={style} />;

export const ChatBubbleIcon = ({ size = 24, color = '#ffffff', style }: IconProps) =>
  <Ionicons name="chatbubble" size={size} color={color} style={style} />;

export const SendIcon = ({ size = 22, color = '#ffffff', style }: IconProps) =>
  <Ionicons name="send" size={size} color={color} style={style} />;

export const StopCircleIcon = ({ size = 22, color = '#ffffff', style }: IconProps) =>
  <Ionicons name="stop-circle" size={size} color={color} style={style} />;

export const RobotIcon = ({ size = 20, color = '#d97706', style }: IconProps) =>
  <Ionicons name="hardware-chip-outline" size={size} color={color} style={style} />;

// Auth
export const MailIcon = ({ size = 20, color = '#8a99ae', style }: IconProps) =>
  <Ionicons name="mail-outline" size={size} color={color} style={style} />;

export const LockIcon = ({ size = 20, color = '#8a99ae', style }: IconProps) =>
  <Ionicons name="lock-closed-outline" size={size} color={color} style={style} />;

export const PersonIcon = ({ size = 20, color = '#8a99ae', style }: IconProps) =>
  <Ionicons name="person-outline" size={size} color={color} style={style} />;

export const EyeIcon = ({ size = 20, color = '#8a99ae', style }: IconProps) =>
  <Ionicons name="eye-outline" size={size} color={color} style={style} />;
export const EyeOffIcon = ({ size = 20, color = '#8a99ae', style }: IconProps) =>
  <Ionicons name="eye-off-outline" size={size} color={color} style={style} />;

// Settings
export const ReaderSettingsIcon = ({ size = 22, color = '#3d5578', style }: IconProps) =>
  <Ionicons name="reader-outline" size={size} color={color} style={style} />;

export const TargetIcon = ({ size = 22, color = '#3d5578', style }: IconProps) =>
  <Ionicons name="flag-outline" size={size} color={color} style={style} />;

export const BellIcon = ({ size = 22, color = '#3d5578', style }: IconProps) =>
  <Ionicons name="notifications-outline" size={size} color={color} style={style} />;

export const InfoIcon = ({ size = 22, color = '#3d5578', style }: IconProps) =>
  <Ionicons name="information-circle-outline" size={size} color={color} style={style} />;

export const LanguageIcon = ({ size = 22, color = '#3d5578', style }: IconProps) =>
  <Ionicons name="language-outline" size={size} color={color} style={style} />;

export const MoonIcon = ({ size = 22, color = '#3d5578', style }: IconProps) =>
  <Ionicons name="moon-outline" size={size} color={color} style={style} />;

export const LogOutIcon = ({ size = 22, color = '#a65d57', style }: IconProps) =>
  <Ionicons name="log-out-outline" size={size} color={color} style={style} />;

export const ChevronRightIcon = ({ size = 20, color = '#b1bbc9', style }: IconProps) =>
  <Ionicons name="chevron-forward" size={size} color={color} style={style} />;

// Status
export const CheckmarkIcon = ({ size = 20, color = '#6b9e76', style }: IconProps) =>
  <Ionicons name="checkmark-circle" size={size} color={color} style={style} />;

export const AlertIcon = ({ size = 20, color = '#a65d57', style }: IconProps) =>
  <Ionicons name="alert-circle-outline" size={size} color={color} style={style} />;

export const RefreshIcon = ({ size = 20, color = '#d97706', style }: IconProps) =>
  <Ionicons name="refresh-outline" size={size} color={color} style={style} />;

export const WifiOffIcon = ({ size = 48, color = '#8a99ae', style }: IconProps) =>
  <Ionicons name="wifi-outline" size={size} color={color} style={style} />;

export const TrashIcon = ({ size = 20, color = '#a65d57', style }: IconProps) =>
  <Ionicons name="trash-outline" size={size} color={color} style={style} />;

export const ShareIcon = ({ size = 20, color = '#3d5578', style }: IconProps) =>
  <Ionicons name="share-outline" size={size} color={color} style={style} />;

export const CopyIcon = ({ size = 20, color = '#3d5578', style }: IconProps) =>
  <Ionicons name="copy-outline" size={size} color={color} style={style} />;
