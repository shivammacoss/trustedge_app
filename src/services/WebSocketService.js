import { WS_URL } from '../config';
import * as SecureStore from 'expo-secure-store';

class WebSocketService {
  constructor() {
    this.ws = null;
    this.priceWs = null;
    this.tradeWs = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.priceListeners = new Set();
    this.tradeListeners = new Set();
    this.isConnecting = false;
  }

  async connectPriceStream() {
    if (this.priceWs && this.priceWs.readyState === WebSocket.OPEN) {
      console.log('Price WebSocket already connected');
      return;
    }

    if (this.isConnecting) {
      console.log('Price WebSocket connection already in progress');
      return;
    }

    this.isConnecting = true;

    try {
      const token = await SecureStore.getItemAsync('token');
      const wsUrl = token ? `${WS_URL}/ws/prices?token=${token}` : `${WS_URL}/ws/prices`;
      
      console.log('Connecting to price stream:', wsUrl);
      
      this.priceWs = new WebSocket(wsUrl);

      this.priceWs.onopen = () => {
        console.log('Price WebSocket connected');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
      };

      this.priceWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.notifyPriceListeners(data);
        } catch (error) {
          console.error('Error parsing price message:', error);
        }
      };

      this.priceWs.onerror = (error) => {
        console.error('Price WebSocket error:', error);
        this.isConnecting = false;
      };

      this.priceWs.onclose = () => {
        console.log('Price WebSocket disconnected');
        this.isConnecting = false;
        this.handleReconnect('price');
      };
    } catch (error) {
      console.error('Error connecting to price stream:', error);
      this.isConnecting = false;
    }
  }

  async connectTradeStream(accountId) {
    if (this.tradeWs && this.tradeWs.readyState === WebSocket.OPEN) {
      console.log('Trade WebSocket already connected');
      return;
    }

    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) {
        console.error('No token found for trade stream');
        return;
      }

      const wsUrl = `${WS_URL}/ws/trades/${accountId}?token=${token}`;
      console.log('Connecting to trade stream:', wsUrl);
      
      this.tradeWs = new WebSocket(wsUrl);

      this.tradeWs.onopen = () => {
        console.log('Trade WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.tradeWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.notifyTradeListeners(data);
        } catch (error) {
          console.error('Error parsing trade message:', error);
        }
      };

      this.tradeWs.onerror = (error) => {
        console.error('Trade WebSocket error:', error);
      };

      this.tradeWs.onclose = () => {
        console.log('Trade WebSocket disconnected');
        this.handleReconnect('trade', accountId);
      };
    } catch (error) {
      console.error('Error connecting to trade stream:', error);
    }
  }

  handleReconnect(type, accountId = null) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`Max reconnect attempts reached for ${type} stream`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(`Reconnecting ${type} stream in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (type === 'price') {
        this.connectPriceStream();
      } else if (type === 'trade' && accountId) {
        this.connectTradeStream(accountId);
      }
    }, delay);
  }

  onPriceUpdate(callback) {
    this.priceListeners.add(callback);
    return () => this.priceListeners.delete(callback);
  }

  onTradeUpdate(callback) {
    this.tradeListeners.add(callback);
    return () => this.tradeListeners.delete(callback);
  }

  notifyPriceListeners(data) {
    this.priceListeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in price listener:', error);
      }
    });
  }

  notifyTradeListeners(data) {
    this.tradeListeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in trade listener:', error);
      }
    });
  }

  disconnectPriceStream() {
    if (this.priceWs) {
      this.priceWs.close();
      this.priceWs = null;
    }
  }

  disconnectTradeStream() {
    if (this.tradeWs) {
      this.tradeWs.close();
      this.tradeWs = null;
    }
  }

  disconnectAll() {
    this.disconnectPriceStream();
    this.disconnectTradeStream();
    this.priceListeners.clear();
    this.tradeListeners.clear();
  }

  getConnectionStatus() {
    return {
      price: this.priceWs ? this.priceWs.readyState : WebSocket.CLOSED,
      trade: this.tradeWs ? this.tradeWs.readyState : WebSocket.CLOSED,
    };
  }
}

export default new WebSocketService();
