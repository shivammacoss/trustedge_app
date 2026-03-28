import { WS_URL, API_URL } from '../config';
import { getStoredToken } from '../utils/safeSecureStore';
import {
  extractPriceRows,
  rowsToPriceDict,
  messageToPriceDict,
} from '../utils/marketData';

/**
 * Live market data: try native WebSocket (/ws/prices) first, then REST polling.
 * React Native provides WebSocket; no need for Expo-only polling only.
 */
class SocketService {
  constructor() {
    this.ws = null;
    this.pollingInterval = null;
    this.isPolling = false;
    this.intentionalDisconnect = false;
    this.priceListeners = new Set();
    this.tradeListeners = new Set();
    this.accountListeners = new Map();
    this.prices = {};
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected && (this.ws?.readyState === WebSocket.OPEN || this.isPolling)) {
      return;
    }
    this.intentionalDisconnect = false;
    await this.tryWebSocket();
  }

  async tryWebSocket() {
    try {
      // Gateway accepts anonymous /ws/prices; sending ?token= with an expired JWT closes the socket (4001).
      const base = (WS_URL || '').replace(/\/$/, '');
      const url = `${base}/ws/prices`;

      console.log('[Socket] Trying WebSocket:', url);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[Socket] WebSocket open');
        this.clearPolling();
        this.isConnected = true;
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          const delta = messageToPriceDict(raw);
          if (Object.keys(delta).length === 0) return;
          this.prices = { ...this.prices, ...delta };
          this.notifyPriceListeners(this.prices);
        } catch (e) {
          console.warn('[Socket] WS message parse:', e?.message);
        }
      };

      this.ws.onerror = (e) => {
        console.warn('[Socket] WebSocket error (falling back to poll if close follows)');
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (this.intentionalDisconnect) {
          this.isConnected = false;
          return;
        }
        console.log('[Socket] WebSocket closed, using REST poll for prices');
        this.isConnected = this.isPolling;
        this.startPolling();
      };
    } catch (e) {
      console.warn('[Socket] WebSocket setup failed:', e?.message);
      this.startPolling();
    }
  }

  clearPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
  }

  startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    this.isConnected = true;
    console.log('[Socket] REST polling:', `${API_URL}/instruments/prices/all`);

    this.pollPrices();
    this.pollingInterval = setInterval(() => this.pollPrices(), 2000);
  }

  async pollPrices() {
    try {
      const headers = await getHeaders();
      const response = await fetch(`${API_URL}/instruments/prices/all`, { headers });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.warn('[Socket] prices/all HTTP', response.status, text?.slice(0, 120));
        return;
      }

      const data = await response.json().catch(() => null);
      const rows = extractPriceRows(data);
      if (!rows.length) {
        return;
      }

      const pricesDict = rowsToPriceDict(rows);
      this.prices = pricesDict;
      this.notifyPriceListeners(pricesDict);
    } catch (error) {
      console.error('[Socket] Polling error:', error?.message);
    }
  }

  notifyPriceListeners(data) {
    this.priceListeners.forEach((callback) => {
      try {
        callback(data);
      } catch (e) {
        console.error('[Socket] Price listener error:', e);
      }
    });
  }

  addPriceListener(callback) {
    this.priceListeners.add(callback);
    if (Object.keys(this.prices).length > 0) {
      callback(this.prices);
    }
    return () => this.priceListeners.delete(callback);
  }

  removePriceListener(callback) {
    this.priceListeners.delete(callback);
  }

  disconnect() {
    this.intentionalDisconnect = true;
    this.clearPolling();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.priceListeners.clear();
    console.log('[Socket] Disconnected');
  }

  getPrices() {
    return this.prices;
  }

  getPrice(symbol) {
    return this.prices[symbol];
  }

  isSocketConnected() {
    return this.isConnected;
  }

  subscribeToPrices() {}
  unsubscribePrices() {}
  subscribeToAccount() {}
  unsubscribeFromAccount() {}
  addTradeListener(cb) {
    this.tradeListeners.add(cb);
    return () => this.tradeListeners.delete(cb);
  }
  addAccountListener() {
    return () => {};
  }
}

async function getHeaders() {
  const token = await getStoredToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const socketService = new SocketService();
export default socketService;
