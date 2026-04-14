// Align with ThemeContext (Material-style dark / clean light)
import { useColorScheme } from 'react-native';

export const darkTheme = {
  background: '#121212',
  card: '#1E1E1E',
  cardAlt: '#252525',
  surface: '#252525',

  text: '#F4F4F5',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',

  border: '#333333',
  borderLight: '#404040',

  primary: '#1a73e8',
  primaryLight: '#1a73e828',

  success: '#22C55E',
  successLight: '#22C55E20',
  danger: '#EF4444',
  dangerLight: '#EF444420',
  warning: '#FBBF24',
  warningLight: '#FBBF2420',
  info: '#1a73e8',
  infoLight: '#1a73e820',
  purple: '#8B5CF6',
  purpleLight: '#8B5CF620',
};

export const lightTheme = {
  background: '#FFFFFF',
  card: '#F8FAFC',
  cardAlt: '#F1F5F9',
  surface: '#F8FAFC',

  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',

  border: '#E2E8F0',
  borderLight: '#F1F5F9',

  primary: '#1a73e8',
  primaryLight: '#1a73e820',

  success: '#22C55E',
  successLight: '#22C55E20',
  danger: '#EF4444',
  dangerLight: '#EF444420',
  warning: '#FBBF24',
  warningLight: '#FBBF2420',
  info: '#1a73e8',
  infoLight: '#1a73e820',
  purple: '#8B5CF6',
  purpleLight: '#8B5CF620',
};

export const useTheme = () => {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? darkTheme : lightTheme;
};

export default { darkTheme, lightTheme, useTheme };
