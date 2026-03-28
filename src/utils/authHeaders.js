import { getStoredToken } from './safeSecureStore';

export async function getJsonAuthHeaders() {
  const token = await getStoredToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
