import * as SecureStore from 'expo-secure-store';

/**
 * Token read that never throws — fixes APK builds where native SecureStore
 * isn't linked yet ("Property 'SecureStore' doesn't exist").
 */
export async function getStoredToken() {
  try {
    if (typeof SecureStore?.getItemAsync !== 'function') return null;
    return await SecureStore.getItemAsync('token');
  } catch {
    return null;
  }
}
