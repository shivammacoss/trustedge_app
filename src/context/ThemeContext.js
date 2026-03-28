import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { View, ActivityIndicator } from 'react-native';

/** Dark — BG #121212, Card #1E1E1E, Blue #2563EB */
const darkTheme = {
  name: 'Dark',
  isDark: true,
  colors: {
    primary: '#2563EB',
    primaryHover: '#1D4ED8',
    secondary: '#2563EB',
    accent: '#2563EB',
    bgPrimary: '#121212',
    bgSecondary: '#252525',
    bgCard: '#1E1E1E',
    bgHover: '#2A2A2A',
    textPrimary: '#F4F4F5',
    textSecondary: '#A1A1AA',
    textMuted: '#71717A',
    border: '#333333',
    borderLight: '#404040',
    success: '#22C55E',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#2563EB',
    buyColor: '#22C55E',
    sellColor: '#EF4444',
    profitColor: '#22C55E',
    lossColor: '#EF4444',
    tabBarBg: '#121212',
    cardBg: '#1E1E1E',
    purple: '#A855F7',
    cyan: '#22D3EE',
    orange: '#F97316',
    pink: '#EC4899',
    yellow: '#EAB308',
    lime: '#84CC16',
  },
};

/** Light — BG #FFFFFF, Card #F8FAFC, Blue #2563EB */
const lightTheme = {
  name: 'Light',
  isDark: false,
  colors: {
    primary: '#2563EB',
    primaryHover: '#1D4ED8',
    secondary: '#2563EB',
    accent: '#2563EB',
    bgPrimary: '#FFFFFF',
    bgSecondary: '#F8FAFC',
    bgCard: '#F8FAFC',
    bgHover: '#F1F5F9',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    success: '#22C55E',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#2563EB',
    buyColor: '#22C55E',
    sellColor: '#EF4444',
    profitColor: '#22C55E',
    lossColor: '#EF4444',
    tabBarBg: '#FFFFFF',
    cardBg: '#F8FAFC',
  },
};

const LOADING_BG = '#121212';
const LOADING_ACCENT = '#2563EB';

const ThemeContext = createContext({
  theme: darkTheme,
  colors: darkTheme.colors,
  isDark: true,
  toggleTheme: () => {},
  loading: true,
});

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedTheme = await SecureStore.getItemAsync('themeMode');
        if (savedTheme !== null) {
          setIsDark(savedTheme === 'dark');
        }
      } catch (error) {
        console.log('Error loading theme preference:', error.message);
      }
      setLoading(false);
    };
    loadThemePreference();
  }, []);

  const toggleTheme = async () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    try {
      await SecureStore.setItemAsync('themeMode', newIsDark ? 'dark' : 'light');
    } catch (error) {
      console.log('Error saving theme preference:', error.message);
    }
  };

  const theme = isDark ? darkTheme : lightTheme;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: LOADING_BG }}>
        <ActivityIndicator size="large" color={LOADING_ACCENT} />
      </View>
    );
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        colors: theme.colors,
        isDark,
        toggleTheme,
        loading,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: darkTheme,
      colors: darkTheme.colors,
      isDark: true,
      toggleTheme: () => {},
      loading: false,
    };
  }
  return context;
};

export default ThemeContext;
