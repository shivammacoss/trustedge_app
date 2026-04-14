import React, { createContext, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const appStateRef = useRef(AppState.currentState);
  const tokenCheckIntervalRef = useRef(null);

  useEffect(() => {
    loadStoredAuth();

    // Check token when app comes to foreground
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Periodic token check every 2 minutes
    tokenCheckIntervalRef.current = setInterval(() => {
      checkAndHandleTokenExpiry();
    }, 120000);

    return () => {
      subscription?.remove();
      if (tokenCheckIntervalRef.current) clearInterval(tokenCheckIntervalRef.current);
    };
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await SecureStore.getItemAsync('token');
      const storedUser = await SecureStore.getItemAsync('user');
      
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Error loading auth:', error);
    }
    setLoading(false);
  };

  const handleAppStateChange = async (nextAppState) => {
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground — check if token is still valid
      await checkAndHandleTokenExpiry();
    }
    appStateRef.current = nextAppState;
  };

  const checkAndHandleTokenExpiry = async () => {
    try {
      const storedUser = await SecureStore.getItemAsync('user');
      const storedToken = await SecureStore.getItemAsync('token');
      if (!storedUser || !storedToken) return;

      const parsed = JSON.parse(storedUser);
      if (parsed.expires_at) {
        const expiresAt = new Date(parsed.expires_at).getTime();
        if (Date.now() >= expiresAt) {
          // Token expired — force logout
          console.log('[Auth] Token expired, logging out');
          await logout();
        }
      }
    } catch (e) {
      console.error('[Auth] Token expiry check error:', e);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.access_token) {
        // TrustEdge backend returns access_token, user_id, role, expires_at
        const userInfo = {
          id: data.user_id,
          email: email,
          role: data.role,
          expires_at: data.expires_at
        };
        
        await SecureStore.setItemAsync('token', data.access_token);
        await SecureStore.setItemAsync('user', JSON.stringify(userInfo));
        setToken(data.access_token);
        setUser(userInfo);
        return { success: true };
      } else {
        return { success: false, message: data.detail || data.message || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Network error' };
    }
  };

  const signup = async (userData) => {
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (response.ok && data.access_token) {
        // TrustEdge backend returns access_token, user_id, role, expires_at
        const userInfo = {
          id: data.user_id,
          email: userData.email,
          role: data.role,
          expires_at: data.expires_at
        };
        
        await SecureStore.setItemAsync('token', data.access_token);
        await SecureStore.setItemAsync('user', JSON.stringify(userInfo));
        setToken(data.access_token);
        setUser(userInfo);
        return { success: true };
      } else {
        return { success: false, message: data.detail || data.message || 'Signup failed' };
      }
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, message: 'Network error' };
    }
  };

  const logout = async () => {
    try {
      await SecureStore.deleteItemAsync('token');
      await SecureStore.deleteItemAsync('user');
      setToken(null);
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const updateUser = async (updatedUser) => {
    try {
      await SecureStore.setItemAsync('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (error) {
      console.error('Update user error:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        signup,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
