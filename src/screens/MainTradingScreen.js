import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  FlatList,
  Animated,
  PanResponder,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Linking,
  Image,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import { API_URL, API_BASE_URL } from '../config';
import { useTheme } from '../context/ThemeContext';
import socketService from '../services/socketService';
import { getJsonAuthHeaders } from '../utils/authHeaders';
import {
  extractInstrumentRows,
  extractPriceRows,
  rowsToPriceDict,
  normalizeInstrumentCategory,
} from '../utils/marketData';
import Mt5QuoteRow from '../components/Mt5QuoteRow';

const Tab = createBottomTabNavigator();
const { width, height } = Dimensions.get('window');

// iOS 26 Style Toast Notification Component
const ToastContext = React.createContext();

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  
  const showToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  };
  
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View style={toastStyles.container} pointerEvents="none">
        {toasts.map((toast, index) => (
          <ToastItem key={toast.id} toast={toast} index={index} />
        ))}
      </View>
    </ToastContext.Provider>
  );
};

const ToastItem = ({ toast, index }) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -100, duration: 300, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }, 2500);
    
    return () => clearTimeout(timer);
  }, []);
  
  const getToastStyle = () => {
    switch (toast.type) {
      case 'success': return { backgroundColor: 'rgba(34, 197, 94, 0.95)', icon: 'checkmark-circle' };
      case 'error': return { backgroundColor: 'rgba(239, 68, 68, 0.95)', icon: 'close-circle' };
      case 'warning': return { backgroundColor: 'rgba(251, 191, 36, 0.95)', icon: 'warning' };
      default: return { backgroundColor: 'rgba(37, 99, 235, 0.95)', icon: 'information-circle' };
    }
  };
  
  const style = getToastStyle();
  
  return (
    <Animated.View style={[
      toastStyles.toast,
      { backgroundColor: style.backgroundColor, transform: [{ translateY }], opacity, marginTop: index * 60 }
    ]}>
      <View style={toastStyles.toastContent}>
        <Ionicons name={style.icon} size={22} color="#fff" />
        <Text style={toastStyles.toastText}>{toast.message}</Text>
      </View>
    </Animated.View>
  );
};

const toastStyles = StyleSheet.create({
  container: { position: 'absolute', top: 60, left: 16, right: 16, zIndex: 9999 },
  toast: { 
    borderRadius: 16, 
    paddingVertical: 14, 
    paddingHorizontal: 18, 
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
});

const useToast = () => React.useContext(ToastContext);

// Default instruments - fallback only, will be replaced by API data
const defaultInstruments = [
  // Minimal fallback - actual instruments fetched from backend API
  { symbol: 'EURUSD', name: 'EUR/USD', bid: 0, ask: 0, spread: 0, category: 'Forex', starred: true },
  { symbol: 'GBPUSD', name: 'GBP/USD', bid: 0, ask: 0, spread: 0, category: 'Forex', starred: true },
  { symbol: 'XAUUSD', name: 'Gold', bid: 0, ask: 0, spread: 0, category: 'Metals', starred: true },
  { symbol: 'BTCUSD', name: 'Bitcoin', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: true },
];

// Shared context for trading data
const TradingContext = React.createContext();

/** Align with web: one main (live) trading account — exclude demo from picker and API list. */
function normalizeTradingAccountRow(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const id = raw.id || raw._id;
  const accNum = String(raw.account_number ?? raw.accountNumber ?? '').trim();
  return {
    ...raw,
    id,
    _id: id,
    account_number: accNum || raw.account_number,
    accountNumber: accNum,
    accountId: accNum || String(id ?? ''),
    balance: Number(raw.balance ?? 0),
    equity: Number(raw.equity ?? raw.balance ?? 0),
    credit: Number(raw.credit ?? 0),
    is_demo: raw.is_demo === true,
    isDemo: raw.is_demo === true || raw.isDemo === true,
  };
}

function isDemoTradingAccount(a) {
  return !!(a?.is_demo || a?.isDemo || a?.accountTypeId?.isDemo);
}

const TradingProvider = ({ children, navigation, route }) => {
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [challengeAccounts, setChallengeAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedChallengeAccount, setSelectedChallengeAccount] = useState(null);
  const [isChallengeMode, setIsChallengeMode] = useState(false);
  const [openTrades, setOpenTrades] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [instruments, setInstruments] = useState(defaultInstruments);
  const [livePrices, setLivePrices] = useState({});
  const [adminSpreads, setAdminSpreads] = useState({});
  const [loading, setLoading] = useState(true);
  const [accountSummary, setAccountSummary] = useState({
    balance: 0, equity: 0, credit: 0, freeMargin: 0, usedMargin: 0, floatingPnl: 0
  });
  const [marketWatchNews, setMarketWatchNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [currentMainTab, setCurrentMainTab] = useState('Home'); // Track current tab for notifications

  useEffect(() => {
    loadUser();
    fetchInstrumentsFromAPI(); // Fetch instruments from backend API
  }, []);

  useEffect(() => {
    console.log('[TrustEdge] User state changed:', !!user);
    if (user) {
      console.log('[TrustEdge] User loaded, fetching accounts for user ID:', user.id || user._id);
      fetchAccounts(user.id || user._id); // TrustEdge uses 'id', fallback to '_id'
      fetchChallengeAccounts(user.id || user._id);
    } else {
      console.log('[TrustEdge] No user - not fetching accounts');
    }
  }, [user]);

  // Fetch instruments from backend API (TrustEdge)
  const fetchInstrumentsFromAPI = async () => {
    try {
      const headers = await getJsonAuthHeaders();
      const urls = [`${API_URL}/instruments/`, `${API_URL}/instruments`];
      let data = null;
      let ok = false;
      for (const url of urls) {
        console.log('[Mobile] Fetching instruments from:', url);
        const res = await fetch(url, { headers });
        data = await res.json().catch(() => null);
        console.log('[Mobile] Instruments response status:', res.status);
        if (res.ok) {
          ok = true;
          break;
        }
      }
      const rows = extractInstrumentRows(data);
      if (ok && rows.length > 0) {
        const starredSymbols = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD'];
        const mappedInstruments = rows.map((inst) => {
          const sym = String(inst.symbol || inst.pair || inst.name || '').trim().toUpperCase();
          if (!sym) return null;
          const category = normalizeInstrumentCategory(inst.segment || inst.category, sym);
          return {
            symbol: sym,
            name: inst.display_name || inst.name || sym,
            bid: 0,
            ask: 0,
            spread: 0,
            category,
            starred: starredSymbols.includes(sym),
            digits: inst.digits,
            pip_size: inst.pip_size,
          };
        }).filter(Boolean);
        setInstruments(mappedInstruments);
        console.log('[Mobile] Loaded', mappedInstruments.length, 'instruments from API');
      } else if (!ok) {
        console.warn('[Mobile] Instruments request failed; using default watchlist until prices load');
      }
    } catch (e) {
      console.error('[Mobile] Error fetching instruments:', e);
    } finally {
      fetchAllPrices();
    }
  };

  // Fetch all current prices from TrustEdge
  const fetchAllPrices = async () => {
    try {
      const headers = await getJsonAuthHeaders();
      console.log('[Mobile] Fetching prices from:', `${API_URL}/instruments/prices/all`);
      const res = await fetch(`${API_URL}/instruments/prices/all`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.warn('[Mobile] Prices HTTP', res.status, typeof data === 'string' ? data : JSON.stringify(data)?.slice(0, 200));
        return;
      }
      const rows = extractPriceRows(data);
      const pricesDict = rows.length ? rowsToPriceDict(rows) : {};
      console.log('[Mobile] Price rows:', rows.length, 'symbols:', Object.keys(pricesDict).length);

      if (Object.keys(pricesDict).length === 0) return;

      setLivePrices(pricesDict);

      setInstruments((prev) => {
        try {
          return prev.map((inst) => {
            if (!inst?.symbol) return inst;
            const price = pricesDict[inst.symbol];
            if (price && (price.bid > 0 || price.ask > 0)) {
              return {
                ...inst,
                bid: price.bid,
                ask: price.ask || price.bid,
                spread: price.spread ?? Math.abs((price.ask || price.bid) - price.bid),
              };
            }
            return inst;
          });
        } catch (e) {
          console.error('[Mobile] Error updating instruments:', e);
          return prev;
        }
      });
    } catch (e) {
      console.error('[Mobile] Error fetching prices:', e);
    }
  };

  // Handle selectedAccountId from navigation params (when coming from AccountsScreen)
  useEffect(() => {
    if (route?.params?.selectedAccountId && accounts.length > 0) {
      const account = accounts.find(a => (a.id || a._id) === route.params.selectedAccountId);
      if (account) {
        setSelectedAccount(account);
        setIsChallengeMode(false);
        setSelectedChallengeAccount(null);
        SecureStore.setItemAsync('selectedAccountId', account.id || account._id);
        SecureStore.deleteItemAsync('selectedChallengeAccountId');
        // Clear the param to prevent re-triggering
        navigation.setParams({ selectedAccountId: null });
      }
    }
  }, [route?.params?.selectedAccountId, accounts]);

  // Handle challengeAccountId from navigation params (when coming from AccountsScreen Challenge tab)
  useEffect(() => {
    if (route?.params?.challengeAccountId && challengeAccounts.length > 0) {
      const challengeAccount = challengeAccounts.find(a => a._id === route.params.challengeAccountId);
      console.log('DEBUG: Selecting challenge account from params:', route.params.challengeAccountId);
      if (challengeAccount) {
        setSelectedChallengeAccount(challengeAccount);
        setIsChallengeMode(true);
        // Save to SecureStore for persistence
        SecureStore.setItemAsync('selectedChallengeAccountId', challengeAccount._id);
        // Clear the param to prevent re-triggering
        navigation.setParams({ challengeAccountId: null });
      }
    }
  }, [route?.params?.challengeAccountId, challengeAccounts]);

  // Fetch challenge accounts - TrustEdge doesn't have a separate prop endpoint
  // Challenge accounts are regular accounts, skip this for now
  const fetchChallengeAccounts = async (userId) => {
    // TrustEdge doesn't have /prop/my-accounts endpoint
    // Challenge accounts are handled as regular accounts
    setChallengeAccounts([]);
  };
  
  // Refresh challenge account stats periodically
  const refreshChallengeAccountStats = async () => {
    // TrustEdge doesn't have prop accounts endpoint - skip
    return;
    if (!isChallengeMode || !selectedChallengeAccount || !user) return;
    try {
      const res = await fetch(`${API_URL}/prop/my-accounts/${user._id}`);
      const data = await res.json();
      if (data.success && data.accounts?.length > 0) {
        const updatedAccount = data.accounts.find(a => a._id === selectedChallengeAccount._id);
        if (updatedAccount) {
          // Log full account data to see available fields
          console.log('[ChallengeStats] Full account data:', JSON.stringify(updatedAccount, null, 2));
          setSelectedChallengeAccount(updatedAccount);
        }
      }
    } catch (e) {
      console.error('[ChallengeStats] Error refreshing:', e);
    }
  };

  // Save selected account ID whenever it changes (TrustEdge uses 'id' UUID, not '_id')
  useEffect(() => {
    const accountId = selectedAccount?.id || selectedAccount?._id;
    if (accountId) {
      SecureStore.setItemAsync('selectedAccountId', accountId);
    }
  }, [selectedAccount?.id, selectedAccount?._id]);

  useEffect(() => {
    // Fetch trades for the active account (regular or challenge)
    // Only fetch if user is authenticated and has an active account
    const hasActiveAccount = isChallengeMode ? selectedChallengeAccount : selectedAccount;
    if (user && hasActiveAccount) {
      console.log('[TrustEdge] User authenticated and account selected, fetching trading data');
      fetchOpenTrades();
      fetchPendingOrders();
      fetchTradeHistory();
      fetchAccountSummary();
      
      // Faster polling for real-time sync with web (every 2 seconds)
      const interval = setInterval(() => {
        if (user) { // Double-check user is still authenticated
          fetchOpenTrades();
          fetchPendingOrders();
          fetchAccountSummary();
        }
      }, 2000);
      
      // Refresh history less frequently (every 10 seconds)
      const historyInterval = setInterval(() => {
        if (user) { // Double-check user is still authenticated
          fetchTradeHistory();
        }
      }, 10000);
      
      // Refresh challenge account stats every 5 seconds (for DD, profit, balance)
      const challengeStatsInterval = setInterval(() => {
        if (isChallengeMode) {
          refreshChallengeAccountStats();
        }
      }, 5000);
      
      return () => {
        clearInterval(interval);
        clearInterval(historyInterval);
        clearInterval(challengeStatsInterval);
      };
    }
  }, [user, selectedAccount, isChallengeMode, selectedChallengeAccount]);

  // Refs to batch price updates and avoid "Maximum update depth exceeded"
  const livePricesRef = useRef({});
  const priceFlushTimer = useRef(null);

  // WebSocket connection for real-time prices
  useEffect(() => {
    // Connect to WebSocket
    socketService.connect();

    // Flush buffered prices into state at most once per 500ms
    const flushPrices = () => {
      const snapshot = livePricesRef.current;
      if (!snapshot || Object.keys(snapshot).length === 0) return;

      setLivePrices(snapshot);

      setInstruments(prev => {
        let changed = false;
        const next = prev.map(inst => {
          const key = inst.symbol;
          const price = snapshot[key] ?? snapshot[String(key || '').toUpperCase()];
          if (!price) return inst;
          const bid = Number(price.bid);
          const ask = Number(price.ask);
          if ((Number.isFinite(bid) && bid > 0) || (Number.isFinite(ask) && ask > 0)) {
            const bidN = Number.isFinite(bid) && bid > 0 ? bid : ask;
            const askN = Number.isFinite(ask) && ask > 0 ? ask : bidN;
            // Only create a new object when the price actually changed
            if (inst.bid === bidN && inst.ask === askN) return inst;
            changed = true;
            return {
              ...inst,
              bid: bidN,
              ask: askN,
              spread: price.spread != null && Number.isFinite(Number(price.spread))
                ? Number(price.spread)
                : Math.abs(askN - bidN),
            };
          }
          return inst;
        });
        return changed ? next : prev;
      });
    };

    // Subscribe to price updates via WebSocket - buffer into ref, flush throttled
    const unsubscribe = socketService.addPriceListener((prices) => {
      if (prices && Object.keys(prices).length > 0) {
        livePricesRef.current = { ...livePricesRef.current, ...prices };

        // Schedule a flush if one isn't already pending
        if (!priceFlushTimer.current) {
          priceFlushTimer.current = setTimeout(() => {
            priceFlushTimer.current = null;
            flushPrices();
          }, 500);
        }
      }
    });
    
    // Fetch admin spreads and news (these don't need WebSocket)
    fetchAdminSpreads();
    fetchMarketWatchNews();
    
    // Refresh news every 30 seconds
    const newsInterval = setInterval(fetchMarketWatchNews, 30000);
    
    // Check SL/TP every 2 seconds (like web app)
    const slTpInterval = setInterval(() => {
      checkSlTp();
    }, 2000);
    
    return () => {
      unsubscribe();
      if (priceFlushTimer.current) clearTimeout(priceFlushTimer.current);
      clearInterval(newsInterval);
      clearInterval(slTpInterval);
    };
  }, []);

  const fetchAdminSpreads = async () => {
    // TrustEdge doesn't have /charges/spreads endpoint - spreads are per-instrument
    setAdminSpreads({});
  };

  const fetchMarketWatchNews = async () => {
    // TrustEdge doesn't have /news/marketwatch endpoint
    setMarketWatchNews([]);
    setLoadingNews(false);
  };

  // Check SL/TP for all open trades
  // TrustEdge backend handles SL/TP server-side, no need to check from mobile
  const checkSlTp = async () => {
    try {
      // TrustEdge handles SL/TP server-side - just refresh open trades periodically
      if (!Array.isArray(openTrades) || openTrades.length === 0) return;
      return; // Skip - TrustEdge handles this
      const data = {};
      
      // Debug log
      if (data.closedCount > 0) {
        console.log(`[SL/TP] Response:`, JSON.stringify(data));
      }
      
      if (data.success && data.closedTrades && data.closedTrades.length > 0) {
        // Trades were closed by SL/TP - refresh trades
        console.log(`[SL/TP] ${data.closedTrades.length} trades closed - showing alerts`);
        fetchOpenTrades();
        fetchAccountSummary();
        
        // Get current selected account ID
        const currentAccountId = ctx.isChallengeMode 
          ? ctx.selectedChallengeAccount?._id 
          : ctx.selectedAccount?._id;
        
        // Show toast and alert only for trades belonging to the selected account
        data.closedTrades.forEach((closed) => {
          // Only show notification if trade belongs to currently selected account
          if (closed.tradingAccountId && closed.tradingAccountId !== currentAccountId) {
            console.log(`[Trade Close] Skipping notification - trade belongs to different account`);
            return;
          }
          
          const trigger = closed.trigger || closed.closedBy || closed.reason || 'Manual';
          const pnlValue = Number(closed.pnl || 0);
          const pnlText = pnlValue >= 0 ? `+$${pnlValue.toFixed(2)}` : `-$${Math.abs(pnlValue).toFixed(2)}`;
          console.log(`[Trade Close] Showing alert for ${closed.symbol} - ${trigger}`);
          
          // Determine alert title and message based on trigger type
          let alertTitle = '';
          let alertMessage = '';
          let toastType = closed.pnl >= 0 ? 'success' : 'warning';
          
          if (trigger === 'STOP_OUT') {
            alertTitle = '⚠️ Stop Out - Equity Zero';
            alertMessage = `All trades closed due to equity reaching zero.\n\n${closed.symbol}: ${pnlText}`;
            toastType = 'error';
          } else if (trigger === 'SL') {
            alertTitle = '🔴 Stop Loss Hit';
            alertMessage = `${closed.symbol} closed by Stop Loss.\n\nPnL: ${pnlText}`;
          } else if (trigger === 'TP') {
            alertTitle = '🟢 Take Profit Hit';
            alertMessage = `${closed.symbol} closed by Take Profit.\n\nPnL: ${pnlText}`;
          } else {
            alertTitle = `Trade Closed`;
            alertMessage = `${closed.symbol} closed. PnL: ${pnlText}`;
          }
          
          toast?.showToast(`${trigger}: ${closed.symbol} ${pnlText}`, toastType);
          Alert.alert(alertTitle, alertMessage);
        });
      }
    } catch (e) {
      console.log(`[SL/TP] Error:`, e.message);
    }
  };

  const loadUser = async () => {
    try {
      const userData = await SecureStore.getItemAsync('user');
      console.log('DEBUG: User data from SecureStore:', userData ? 'Found' : 'Not found');
      if (userData) {
        const parsedUser = JSON.parse(userData);
        console.log('DEBUG: Parsed user ID:', parsedUser?.id || parsedUser?._id);
        setUser(parsedUser);
      } else {
        console.log('DEBUG: No user data, redirecting to Login');
        navigation.replace('Login');
      }
    } catch (e) {
      console.error('Error loading user:', e);
    }
    setLoading(false);
  };

  const fetchAccounts = async (userId, forceSelectFirst = false) => {
    try {
      console.log('[TrustEdge] Fetching accounts from backend');
      const token = await SecureStore.getItemAsync('token');
      
      if (!token) {
        console.log('[TrustEdge] No token found, redirecting to login');
        navigation.replace('Login');
        return;
      }
      
      const res = await fetch(`${API_URL}/accounts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      console.log('[TrustEdge] Accounts response:', data);
      
      const rawList = data.items || data || [];
      const normalized = Array.isArray(rawList) ? rawList.map(normalizeTradingAccountRow) : [];
      // Show both demo and live in the picker (matches web)
      const accountsList = normalized;

      setAccounts(accountsList);
      
      if (accountsList.length > 0) {
        console.log('[TrustEdge] Accounts loaded (live-first):', accountsList.length);

        let accountToSelect = null;
        const savedAccountId = await SecureStore.getItemAsync('selectedAccountId');
        if (savedAccountId) {
          accountToSelect = accountsList.find(
            (a) => String(a.id || a._id) === String(savedAccountId)
          );
          if (accountToSelect) {
            console.log('[TrustEdge] Restoring saved account:', accountToSelect.account_number || accountToSelect.id);
          }
        }

        if (!accountToSelect) {
          accountToSelect = accountsList[0];
          console.log('[TrustEdge] Auto-selecting first account:', accountToSelect.account_number || accountToSelect.id);
        }

        setSelectedAccount(accountToSelect);
        const idToSave = accountToSelect.id || accountToSelect._id;
        if (idToSave) SecureStore.setItemAsync('selectedAccountId', idToSave);
      } else {
        console.log('[TrustEdge] No accounts available');
        setAccounts([]);
      }
    } catch (e) {
      console.error('Error fetching accounts:', e);
    }
  };

  const fetchOpenTrades = async () => {
    // Use challenge account if in challenge mode, otherwise regular account
    const accountId = isChallengeMode && selectedChallengeAccount 
      ? (selectedChallengeAccount.id || selectedChallengeAccount._id)
      : (selectedAccount?.id || selectedAccount?._id);
    if (!accountId) {
      console.log('[TrustEdge] No account ID for fetchOpenTrades');
      return;
    }
    try {
      const token = await SecureStore.getItemAsync('token');
      console.log('[TrustEdge] Token available for open trades:', !!token);
      console.log('[TrustEdge] Account ID for open trades:', accountId);
      
      if (!token) {
        console.log('[TrustEdge] No token - skipping open trades fetch');
        return;
      }
      
      const res = await fetch(`${API_URL}/positions/?account_id=${accountId}&status=open`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      console.log('[TrustEdge] Open positions response:', data);
      // Map backend snake_case to camelCase expected by UI
      const rawList = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
      const mappedTrades = rawList.map(t => ({
        ...t,
        _id: t.id || t._id,
        side: (t.side || '').toUpperCase(),
        quantity: t.lots || t.quantity || 0,
        openPrice: t.open_price || t.openPrice || 0,
        currentPrice: t.current_price || t.currentPrice || 0,
        stopLoss: t.stop_loss || t.stopLoss || null,
        takeProfit: t.take_profit || t.takeProfit || null,
        sl: t.stop_loss || t.sl || null,
        tp: t.take_profit || t.tp || null,
        contractSize: t.contract_size || t.contractSize || 100000,
        marginUsed: t.margin_used || t.marginUsed || 0,
        commission: t.commission || 0,
        swap: t.swap || 0,
        profit: t.profit || 0,
      }));
      setOpenTrades(mappedTrades);
    } catch (e) {
      console.error('Error fetching open trades:', e);
    }
  };

  const fetchPendingOrders = async () => {
    // Use challenge account if in challenge mode, otherwise regular account
    const accountId = isChallengeMode && selectedChallengeAccount 
      ? (selectedChallengeAccount.id || selectedChallengeAccount._id)
      : (selectedAccount?.id || selectedAccount?._id);
    if (!accountId) {
      console.log('[TrustEdge] No account ID for fetchPendingOrders');
      return;
    }
    try {
      const token = await SecureStore.getItemAsync('token');
      console.log('[TrustEdge] Token available for pending orders:', !!token);
      
      if (!token) {
        console.log('[TrustEdge] No token - skipping pending orders fetch');
        return;
      }
      
      const res = await fetch(`${API_URL}/orders/?account_id=${accountId}&status=pending`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      console.log('[TrustEdge] Pending orders response:', data);
      // Map backend snake_case to camelCase expected by UI
      const rawOrders = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
      const mappedOrders = rawOrders.map(o => ({
        ...o,
        _id: o.id || o._id,
        side: (o.side || '').toUpperCase(),
        quantity: o.lots || o.quantity || 0,
        orderType: o.order_type || o.orderType || 'limit',
        price: o.price || o.filled_price || 0,
        stopLoss: o.stop_loss || o.stopLoss || null,
        takeProfit: o.take_profit || o.takeProfit || null,
        sl: o.stop_loss || o.sl || null,
        tp: o.take_profit || o.tp || null,
      }));
      setPendingOrders(mappedOrders);
    } catch (e) {
      console.error('Error fetching pending orders:', e);
    }
  };

  const fetchTradeHistory = async () => {
    // Use challenge account if in challenge mode, otherwise regular account
    const accountId = isChallengeMode && selectedChallengeAccount 
      ? (selectedChallengeAccount.id || selectedChallengeAccount._id)
      : (selectedAccount?.id || selectedAccount?._id);
    if (!accountId) {
      console.log('[TrustEdge] No account ID for fetchTradeHistory');
      return;
    }
    try {
      const token = await SecureStore.getItemAsync('token');
      console.log('[TrustEdge] Token available for trade history:', !!token);
      
      if (!token) {
        console.log('[TrustEdge] No token - skipping trade history fetch');
        return;
      }
      
      // Use /portfolio/trades for proper trade history with close_price and profit
      const res = await fetch(`${API_URL}/portfolio/trades?account_id=${accountId}&per_page=200`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      console.log('[TrustEdge] Trade history response:', data);
      
      // Backend returns { items: [...] } with snake_case fields
      // UI expects camelCase fields, so map them here
      const rawItems = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const mappedHistory = rawItems.map(trade => ({
        _id: trade.id || trade._id,
        id: trade.id || trade._id,
        symbol: trade.symbol || '',
        side: (trade.side || '').toUpperCase(), // UI expects "BUY"/"SELL"
        quantity: trade.lots || trade.quantity || 0,
        lots: trade.lots || trade.quantity || 0,
        openPrice: trade.open_price || trade.openPrice || 0,
        open_price: trade.open_price || trade.openPrice || 0,
        closePrice: trade.close_price || trade.closePrice || 0,
        close_price: trade.close_price || trade.closePrice || 0,
        realizedPnl: trade.pnl || trade.profit || trade.realizedPnl || 0,
        pnl: trade.pnl || trade.profit || trade.realizedPnl || 0,
        profit: trade.pnl || trade.profit || 0,
        commission: trade.commission || 0,
        swap: trade.swap || 0,
        closedAt: trade.close_time || trade.closed_at || trade.closedAt || null,
        closed_at: trade.close_time || trade.closed_at || trade.closedAt || null,
        closedBy: trade.close_reason || trade.closedBy || 'manual',
        close_reason: trade.close_reason || trade.closedBy || 'manual',
        created_at: trade.opened_at || trade.created_at || null,
      }));
      
      setTradeHistory(mappedHistory);
    } catch (e) {
      console.error('Error fetching trade history:', e);
    }
  };

  const fetchAccountSummary = async () => {
    // For challenge accounts, use the account data directly
    if (isChallengeMode && selectedChallengeAccount) {
      setAccountSummary({
        balance: Number(selectedChallengeAccount.currentBalance || selectedChallengeAccount.balance || 0),
        equity: Number(selectedChallengeAccount.currentEquity || selectedChallengeAccount.currentBalance || 0),
        credit: Number(selectedChallengeAccount.credit || 0),
        usedMargin: 0,
        freeMargin: Number(selectedChallengeAccount.currentBalance || 0),
        floatingPnl: 0
      });
      return;
    }
    
    // For regular accounts, fetch from TrustEdge API
    const accountId = selectedAccount?.id || selectedAccount?._id;
    if (!accountId) {
      console.log('[TrustEdge] No account ID for fetchAccountSummary');
      return;
    }
    
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) {
        console.log('[TrustEdge] No token for fetchAccountSummary');
        return;
      }
      
      const res = await fetch(`${API_URL}/accounts/${accountId}/summary`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.log('[TrustEdge] Account summary fetch failed:', res.status, errData?.detail || errData);
        return;
      }
      
      const data = await res.json();
      console.log('[TrustEdge] Account summary:', data);
      
      // Ensure all values are numbers to prevent toFixed crashes
      setAccountSummary({
        balance: Number(data.balance || 0),
        equity: Number(data.equity || 0),
        credit: Number(data.credit || 0),
        usedMargin: Number(data.margin_used || 0),
        freeMargin: Number(data.free_margin || 0),
        floatingPnl: Number(data.unrealized_pnl || 0)
      });
    } catch (e) {
      console.error('[TrustEdge] Error fetching account summary:', e);
      // Set safe defaults to prevent crashes
      setAccountSummary({
        balance: 0,
        equity: 0,
        credit: 0,
        usedMargin: 0,
        freeMargin: 0,
        floatingPnl: 0
      });
    }
  };

  const calculatePnl = (trade) => {
    if (!trade || !trade.symbol) return 0;
    const prices = livePrices[trade.symbol];
    if (!prices || !prices.bid) return 0;
    const side = (trade.side || '').toUpperCase();
    const currentPrice = side === 'BUY' ? prices.bid : prices.ask;
    if (!currentPrice) return 0;
    const openPrice = trade.openPrice || trade.open_price || 0;
    const quantity = trade.lots || trade.quantity || 0;
    const contractSize = trade.contract_size || trade.contractSize || 100000;
    const pnl = side === 'BUY'
      ? (currentPrice - openPrice) * quantity * contractSize
      : (openPrice - currentPrice) * quantity * contractSize;
    return pnl - (trade.commission || 0) - (trade.swap || 0);
  };

  // Use useMemo for real-time values to avoid infinite loops
  const realTimeValues = React.useMemo(() => {
    // Use challenge account balance when in challenge mode, fallback to accountSummary
    const activeAccount = isChallengeMode ? selectedChallengeAccount : selectedAccount;
    // Ensure all values are numbers to prevent toFixed crashes
    const balance = Number(accountSummary.balance || activeAccount?.balance || 0);
    const credit = Number(accountSummary.credit || activeAccount?.credit || 0);
    
    // Calculate today's realized PnL from closed trades
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const safeTradeHistory = Array.isArray(tradeHistory) ? tradeHistory : [];
    // tradeHistory contains only closed positions (fetched with status=closed)
    // Use closed_at if available, fallback to created_at for date filtering
    const todayClosedPnl = safeTradeHistory
      .filter(trade => {
        if (!trade) return false;
        const closedAt = new Date(trade.closed_at || trade.closedAt || trade.updated_at || trade.updatedAt || trade.created_at);
        return closedAt >= today;
      })
      .reduce((sum, trade) => sum + Number(trade.pnl || trade.profit || 0), 0);

    // Calculate real-time PnL from live prices
    let totalPnl = 0;
    let totalMargin = 0;

    const safeOpenTrades = Array.isArray(openTrades) ? openTrades : [];
    safeOpenTrades.forEach(trade => {
      if (!trade) return;
      totalPnl += calculatePnl(trade);
      totalMargin += Number(trade.marginUsed || trade.margin_used || 0);
    });

    const equity = Number(balance + credit + totalPnl);
    // Free Margin = Balance - Used Margin (not equity based)
    const freeMargin = Number(balance - totalMargin);
    
    // Calculate challenge-specific real-time values
    let realTimeDailyDD = 0;
    let realTimeOverallDD = 0;
    let realTimeProfit = 0;
    
    if (isChallengeMode && selectedChallengeAccount) {
      const initialBalance = Number(selectedChallengeAccount.initialBalance || selectedChallengeAccount.phaseStartBalance || 5000);
      const dayStartEquity = Number(selectedChallengeAccount.dayStartEquity || initialBalance);
      
      // Daily Drawdown = (dayStartEquity - currentEquity) / dayStartEquity * 100
      // Only count if equity dropped below day start
      const dailyLoss = Number(dayStartEquity - equity);
      realTimeDailyDD = dailyLoss > 0 ? Number((dailyLoss / dayStartEquity) * 100) : 0;
      
      // Overall Drawdown = (initialBalance - lowestEquity) / initialBalance * 100
      // Use current equity if it's lower than recorded lowest
      const lowestEquity = Math.min(Number(selectedChallengeAccount.lowestEquityOverall || initialBalance), Number(equity));
      const overallLoss = Number(initialBalance - lowestEquity);
      realTimeOverallDD = overallLoss > 0 ? Number((overallLoss / initialBalance) * 100) : 0;
      
      // Profit = (currentEquity - initialBalance) / initialBalance * 100
      realTimeProfit = Number(((Number(equity) - initialBalance) / initialBalance) * 100);
    }

    return {
      totalFloatingPnl: Math.round(totalPnl * 100) / 100,
      realTimeEquity: Math.round(equity * 100) / 100,
      realTimeFreeMargin: Math.round(freeMargin * 100) / 100,
      totalUsedMargin: Math.round(totalMargin * 100) / 100,
      todayPnl: Math.round((todayClosedPnl + totalPnl) * 100) / 100,
      realTimeDailyDD: Math.round(realTimeDailyDD * 100) / 100,
      realTimeOverallDD: Math.round(realTimeOverallDD * 100) / 100,
      realTimeProfit: Math.round(realTimeProfit * 100) / 100
    };
  }, [livePrices, openTrades, accountSummary, tradeHistory, isChallengeMode, selectedChallengeAccount, selectedAccount]);

  const { totalFloatingPnl, realTimeEquity, realTimeFreeMargin, totalUsedMargin, todayPnl, realTimeDailyDD, realTimeOverallDD, realTimeProfit } = realTimeValues;

  const logout = async () => {
    await SecureStore.deleteItemAsync('user');
    await SecureStore.deleteItemAsync('token');
    navigation.replace('Login');
  };

  const refreshAccounts = async () => {
    if (user) {
      await fetchAccounts(user.id);
      await fetchChallengeAccounts(user.id);
    }
  };

  // Get the active trading account ID (either regular or challenge)
  const getActiveTradingAccountId = () => {
    if (isChallengeMode && selectedChallengeAccount) {
      return selectedChallengeAccount.id;
    }
    return selectedAccount?.id;
  };

  // Get active account display info
  const getActiveAccountInfo = () => {
    if (isChallengeMode && selectedChallengeAccount) {
      return {
        accountId: selectedChallengeAccount.accountId,
        balance: selectedChallengeAccount.currentBalance || 0,
        equity: selectedChallengeAccount.currentEquity || 0,
        isChallenge: true,
        challengeName: selectedChallengeAccount.challengeId?.name || 'Challenge',
        status: selectedChallengeAccount.status
      };
    }
    return {
      accountId: selectedAccount?.accountId,
      balance: accountSummary?.balance || selectedAccount?.balance || 0,
      equity: realTimeEquity || accountSummary?.equity || 0,
      isChallenge: false
    };
  };

  return (
    <TradingContext.Provider value={{
      user, accounts, selectedAccount, setSelectedAccount,
      challengeAccounts, selectedChallengeAccount, setSelectedChallengeAccount,
      isChallengeMode, setIsChallengeMode,
      openTrades, pendingOrders, tradeHistory, instruments, livePrices, adminSpreads,
      loading, accountSummary, totalFloatingPnl, realTimeEquity, realTimeFreeMargin, todayPnl,
      realTimeDailyDD, realTimeOverallDD, realTimeProfit,
      fetchOpenTrades, fetchPendingOrders, fetchTradeHistory, fetchAccountSummary,
      refreshAccounts, calculatePnl, logout, setInstruments,
      marketWatchNews, loadingNews, fetchMarketWatchNews,
      getActiveTradingAccountId, getActiveAccountInfo,
      currentMainTab, setCurrentMainTab,
      navigation
    }}>
      {children}
    </TradingContext.Provider>
  );
};

/** Compact performance bars for copy-trader cards (no extra deps). */
const MiniSparkline = ({ seed, positive }) => {
  const s = typeof seed === 'string'
    ? seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    : Number(seed) || 0;
  const bars = [];
  for (let i = 0; i < 14; i += 1) {
    bars.push(0.25 + 0.75 * Math.abs(Math.sin((s + i * 17) * 0.01)));
  }
  const max = Math.max(...bars, 0.001);
  const color = positive ? '#22c55e' : '#f97316';
  return (
    <View style={styles.sparklineRow}>
      {bars.map((v, i) => (
        <View
          key={i}
          style={[
            styles.sparklineBar,
            { height: Math.max(3, (v / max) * 26), backgroundColor: color },
          ]}
        />
      ))}
    </View>
  );
};

// HOME TAB
const HomeTab = ({ navigation }) => {
  const ctx = React.useContext(TradingContext);
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const parentNav = navigation.getParent();
  const [refreshing, setRefreshing] = useState(false);
  const sessionOpenRef = useRef({});
  
  // Banner slider state
  const [banners, setBanners] = useState([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const bannerScrollRef = React.useRef(null);
  
  // Copy Trade Masters state
  const [masters, setMasters] = useState([]);
  const [mySubscriptions, setMySubscriptions] = useState([]);
  const [selectedMaster, setSelectedMaster] = useState(null);
  const [showMasterModal, setShowMasterModal] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  
  // Market data tabs state
  const [marketTab, setMarketTab] = useState('watchlist'); // 'watchlist', 'gainers', 'losers'

  // Account picker modal state
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  // Main wallet balance + unread count (top nav, polled — not deps-based to avoid loops)
  const [walletBal, setWalletBal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const fetchAll = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (!token || !mounted) return;
        const headers = { Authorization: `Bearer ${token}` };

        // Wallet + accounts in parallel — derive wallet-only if backend doesn't expose it directly
        const [wRes, aRes, nRes] = await Promise.all([
          fetch(`${API_URL}/wallet/summary`, { headers }),
          fetch(`${API_URL}/accounts`, { headers }),
          fetch(`${API_URL}/notifications?page=1&per_page=50`, { headers }),
        ]);

        if (!mounted) return;

        const wData = await wRes.json().catch(() => ({}));
        const aData = await aRes.json().catch(() => ({}));
        const nData = await nRes.json().catch(() => ({}));

        let bal = wData.main_wallet_balance ?? wData.wallet_balance ?? wData.main_balance;
        if (bal == null) {
          const total = Number(wData.balance ?? wData.total ?? 0);
          const acctList = Array.isArray(aData.items) ? aData.items : (Array.isArray(aData) ? aData : []);
          const acctTotal = acctList.reduce((s, a) => s + Number(a?.balance || 0), 0);
          bal = total - acctTotal;
        }
        if (mounted) setWalletBal(Math.max(0, Number(bal) || 0));

        const list = nData.items || nData.notifications || [];
        const count = Array.isArray(list)
          ? list.filter((n) => !(n.is_read || n.read)).length
          : 0;
        if (mounted) setUnreadCount(count);
      } catch (e) {}
    };

    fetchAll();
    const id = setInterval(fetchAll, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Compute user initials for the avatar pill (cheap, inline)
  const u = ctx.user || {};
  const fn = (u.first_name || u.firstName || '').trim();
  const ln = (u.last_name || u.lastName || '').trim();
  const userInitials = (fn || ln)
    ? (((fn[0] || '') + (ln[0] || '')).toUpperCase() || '?')
    : ((u.email || '').trim().slice(0, 2).toUpperCase() || '?');

  const switchToAccount = async (account) => {
    if (!account) return;
    const aid = account.id || account._id;
    ctx.setSelectedAccount(account);
    try {
      await SecureStore.setItemAsync('selectedAccountId', aid);
    } catch (e) {}
    setShowAccountPicker(false);
    if (ctx.fetchAccountSummary) ctx.fetchAccountSummary();
    if (ctx.fetchOpenTrades) ctx.fetchOpenTrades();
  };

  useEffect(() => {
    const lp = ctx.livePrices || {};
    Object.keys(lp).forEach((sym) => {
      if (sessionOpenRef.current[sym] != null) return;
      const row = lp[sym];
      const bid = row?.bid;
      const ask = row?.ask;
      const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : (ask || bid);
      if (mid > 0) sessionOpenRef.current[sym] = mid;
    });
  }, [ctx.livePrices]);

  // Fetch banners on mount
  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/banners`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) return;
      const data = await res.json();
      const bannerList = data.items || data || [];
      if (bannerList.length > 0) {
        setBanners(bannerList);
      }
    } catch (e) {
      // Silently ignore - banners are optional
    }
  };

  // Auto-scroll banners
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners.length]);

  // Scroll to current banner
  useEffect(() => {
    if (bannerScrollRef.current && banners.length > 0) {
      bannerScrollRef.current.scrollTo({
        x: currentBannerIndex * (Dimensions.get('window').width - 32),
        animated: true
      });
    }
  }, [currentBannerIndex, banners.length]);

  // Fetch masters on mount
  useEffect(() => {
    fetchMasters();
    fetchMySubscriptions();
  }, []);

  const fetchMasters = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/social/masters`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { setMasters([]); return; }
      const data = await res.json();
      setMasters(data.items || data.masters || data || []);
    } catch (e) {
      setMasters([]);
    }
  };

  const fetchMySubscriptions = async () => {
    if (!ctx.user?.id && !ctx.user?._id) return;
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/social/subscriptions`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { setMySubscriptions([]); return; }
      const data = await res.json();
      setMySubscriptions(data.items || data.subscriptions || data || []);
    } catch (e) {
      setMySubscriptions([]);
    }
  };

  const isFollowingMaster = (masterId) => {
    if (!masterId) return false;
    return mySubscriptions.some(
      (sub) =>
        (sub.masterTraderId?._id === masterId || sub.masterTraderId?.id === masterId) &&
        sub.status === 'ACTIVE'
    );
  };

  const handleFollowMaster = async (master) => {
    if (!ctx.selectedAccount) {
      Alert.alert('Error', 'Please select a trading account first');
      return;
    }
    setIsFollowing(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const masterId = master.id || master._id;
      const accountId = ctx.selectedAccount.id || ctx.selectedAccount._id;
      const res = await fetch(`${API_URL}/social/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          provider_id: masterId,
          account_id: accountId,
          copy_mode: 'fixed_lot',
          fixed_lot_size: 0.01
        })
      });
      if (res.ok) {
        Alert.alert('Success', `Now following master trader`);
        fetchMySubscriptions();
        setShowMasterModal(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        Alert.alert('Error', errData.detail || 'Failed to follow');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to follow master');
    }
    setIsFollowing(false);
  };

  const getMarketData = () => {
    const instruments = ctx.instruments || [];
    const prices = ctx.livePrices || {};
    const withChanges = instruments
      .map((inst) => {
        if (!inst?.symbol) return null;
        const sym = inst.symbol;
        const p = prices[sym] || {};
        const bid = Number(p.bid ?? inst.bid ?? 0);
        const ask = Number(p.ask ?? inst.ask ?? 0);
        const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : (ask || bid || 0);
        if (!mid || mid <= 0) return null;
        let change = 0;
        const apiPct = p.change_percent ?? p.change_pct ?? p.pct_change ?? p.percent_change;
        if (apiPct != null && Number.isFinite(Number(apiPct))) {
          change = Number(apiPct);
        } else {
          const open = p.open ?? p.prev_close ?? p.day_open ?? sessionOpenRef.current[sym];
          if (open && Number(open) > 0) {
            change = ((mid - Number(open)) / Number(open)) * 100;
          }
        }
        return { ...inst, bid, ask, currentPrice: mid, change };
      })
      .filter(Boolean);

    if (marketTab === 'gainers') {
      return [...withChanges]
        .filter((i) => i.change > 0)
        .sort((a, b) => b.change - a.change)
        .slice(0, 12);
    }
    if (marketTab === 'losers') {
      return [...withChanges]
        .filter((i) => i.change < 0)
        .sort((a, b) => a.change - b.change)
        .slice(0, 12);
    }
    const watch = withChanges.filter((i) => i.starred);
    if (watch.length > 0) return watch.slice(0, 12);
    return withChanges.slice(0, 12);
  };

  // Refresh accounts when screen gains focus (e.g., after creating new account)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (ctx.refreshAccounts) {
        ctx.refreshAccounts();
      }
      fetchMasters();
      fetchMySubscriptions();
    });
    return unsubscribe;
  }, [navigation, ctx.refreshAccounts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      ctx.refreshAccounts(),
      ctx.fetchAccountSummary(),
      ctx.fetchOpenTrades(),
      fetchMasters(),
      fetchMySubscriptions()
    ]);
    setRefreshing(false);
  };

  if (ctx.loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Top nav bar — hamburger | wallet pill | bell | avatar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + 8,
          paddingHorizontal: 14,
          paddingBottom: 12,
          gap: 10,
          backgroundColor: colors.bgPrimary,
        }}
      >
        {/* Wallet pill */}
        <TouchableOpacity
          onPress={() => parentNav?.navigate('Wallet')}
          activeOpacity={0.85}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingHorizontal: 16,
            height: 44,
            borderRadius: 22,
            borderWidth: 1.5,
            borderColor: colors.success,
            backgroundColor: colors.success + '15',
          }}
        >
          <Ionicons name="wallet-outline" size={18} color={colors.success} />
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '800' }}>
            ${Number(walletBal).toFixed(2)}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.success} />
        </TouchableOpacity>

        {/* Notification bell with badge */}
        <TouchableOpacity
          onPress={() => parentNav?.navigate('Notifications')}
          activeOpacity={0.75}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
          {unreadCount > 0 && (
            <View
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                minWidth: 18,
                height: 18,
                paddingHorizontal: 4,
                borderRadius: 9,
                backgroundColor: colors.error,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: colors.bgPrimary,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* User avatar */}
        <TouchableOpacity
          onPress={() => parentNav?.navigate('Profile')}
          activeOpacity={0.75}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.success,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#000', fontSize: 13, fontWeight: '800' }}>{userInitials}</Text>
        </TouchableOpacity>
      </View>


      {/* Quick row — Vantage-style tiles */}
      <View style={[styles.vantageQuickRow, { borderColor: colors.border }]}>
        <TouchableOpacity style={styles.vantageQuickItem} onPress={() => parentNav?.navigate('Accounts')}>
          <View style={[styles.vantageQuickIconBg, { backgroundColor: colors.bgCard }]}>
            <Ionicons name="briefcase-outline" size={22} color={colors.primary} />
          </View>
          <Text style={[styles.vantageQuickLabel, { color: colors.textSecondary }]}>Account</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.vantageQuickItem} onPress={() => parentNav?.navigate('Portfolio')}>
          <View style={[styles.vantageQuickIconBg, { backgroundColor: colors.bgCard }]}>
            <Ionicons name="pie-chart-outline" size={22} color={colors.primary} />
          </View>
          <Text style={[styles.vantageQuickLabel, { color: colors.textSecondary }]}>Portfolio</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.vantageQuickItem} onPress={() => parentNav?.navigate('Social')}>
          <View style={[styles.vantageQuickIconBg, { backgroundColor: colors.bgCard }]}>
            <Ionicons name="people-outline" size={22} color={colors.primary} />
          </View>
          <Text style={[styles.vantageQuickLabel, { color: colors.textSecondary }]}>Top Traders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.vantageQuickItem} onPress={() => parentNav?.navigate('Wallet')}>
          <View style={[styles.vantageQuickIconBg, { backgroundColor: colors.bgCard }]}>
            <Ionicons name="wallet-outline" size={22} color={colors.success} />
          </View>
          <Text style={[styles.vantageQuickLabel, { color: colors.textSecondary }]}>Wallet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.vantageQuickItem} onPress={() => navigation.navigate('More')}>
          <View style={[styles.vantageQuickIconBg, { backgroundColor: colors.bgCard }]}>
            <Ionicons name="newspaper-outline" size={22} color={colors.info} />
          </View>
          <Text style={[styles.vantageQuickLabel, { color: colors.textSecondary }]}>News & more</Text>
        </TouchableOpacity>
      </View>

      {/* Banner Slider */}
      {banners.length > 0 && (
        <View style={styles.bannerContainer}>
          <ScrollView
            ref={bannerScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / (Dimensions.get('window').width - 32));
              setCurrentBannerIndex(index);
            }}
          >
            {banners.map((banner, index) => (
              <TouchableOpacity 
                key={banner._id} 
                activeOpacity={banner.link ? 0.8 : 1}
                onPress={() => {
                  if (banner.link) {
                    Linking.openURL(banner.link).catch(() => {});
                  }
                }}
                style={styles.bannerSlide}
              >
                <Image
                  source={{ uri: `${API_BASE_URL}${banner.imageUrl}` }}
                  style={styles.bannerImage}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
          {banners.length > 1 && (
            <View style={styles.bannerDots}>
              {banners.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.bannerDot,
                    { backgroundColor: index === currentBannerIndex ? '#CFF12F' : 'rgba(255,255,255,0.5)' }
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Copy Trade Masters - Horizontal Scrolling Cards */}
      {masters.length > 0 && (
        <View style={styles.mastersSection}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => parentNav?.navigate('Social')}
            activeOpacity={0.7}
          >
            <Text style={[styles.copyTradingTitle, { color: colors.textPrimary }]}>Copy-Trading</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mastersScroll}>
            {masters.slice(0, 10).map((master) => {
              const mid = master._id || master.id;
              const following = isFollowingMaster(mid);
              const ret = Number(master.stats?.totalProfitGenerated ?? master.stats?.monthlyReturn ?? 0);
              const positive = ret >= 0;
              const idKey = String(mid || '');
              return (
                <TouchableOpacity
                  key={idKey}
                  style={[styles.masterCardVantage, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
                  onPress={() => { setSelectedMaster(master); setShowMasterModal(true); }}
                >
                  <View style={styles.masterCardTopRow}>
                    <View style={[styles.masterAvatar, { backgroundColor: colors.primary + '28' }]}>
                      <Text style={[styles.masterAvatarText, { color: colors.primary }]}>
                        {master.userId?.firstName?.charAt(0) || 'M'}
                      </Text>
                    </View>
                    {following && (
                      <View style={styles.followingBadgeSmall}>
                        <Ionicons name="checkmark" size={10} color={colors.success} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.masterNameVantage, { color: colors.textPrimary }]} numberOfLines={1}>
                    {`${master.userId?.firstName || ''} ${master.userId?.lastName || ''}`.trim() || 'Master'}
                  </Text>
                  <Text style={[styles.masterReturnPct, { color: positive ? colors.success : colors.error }]}>
                    {positive ? '+' : ''}{ret.toFixed(2)}%
                  </Text>
                  <Text style={[styles.masterReturnLabel, { color: colors.textMuted }]}>Return (1M)</Text>
                  <MiniSparkline seed={idKey} positive={positive} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Watchlist / Gainers / Losers — Vantage-style tabs + 2-col grid */}
      <View style={styles.marketDataSection}>
        <View style={styles.vantageMarketTabsRow}>
          {(['watchlist', 'gainers', 'losers']).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={styles.vantageMarketTabHit}
              onPress={() => setMarketTab(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.vantageMarketTabText,
                  {
                    color: marketTab === tab ? colors.textPrimary : colors.textMuted,
                    fontWeight: marketTab === tab ? '700' : '500',
                  },
                ]}
              >
                {tab === 'watchlist' ? 'Watchlist' : tab === 'gainers' ? 'Gainers' : 'Losers'}
              </Text>
              {marketTab === tab && (
                <View style={[styles.vantageMarketTabUnderline, { backgroundColor: colors.primary }]} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.marketGrid}>
          {getMarketData().length === 0 && marketTab === 'watchlist' ? (
            <View style={[styles.emptyWatchlistHome, { width: '100%' }]}>
              <Ionicons name="star-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.emptyWatchlistHomeText, { color: colors.textSecondary }]}>No symbols in watchlist</Text>
              <Text style={[styles.emptyWatchlistHomeHint, { color: colors.textMuted }]}>Add favourites from Markets</Text>
            </View>
          ) : getMarketData().length === 0 ? (
            <View style={[styles.emptyWatchlistHome, { width: '100%' }]}>
              <Ionicons name={marketTab === 'gainers' ? 'trending-up' : 'trending-down'} size={32} color={colors.textMuted} />
              <Text style={[styles.emptyWatchlistHomeText, { color: colors.textSecondary }]}>No {marketTab} right now</Text>
              <Text style={[styles.emptyWatchlistHomeHint, { color: colors.textMuted }]}>Pull to refresh or check back shortly</Text>
            </View>
          ) : (
            getMarketData().map((inst) => {
              if (!inst?.symbol) return null;
              const isPositive = inst.change >= 0;
              const decimals = inst.category === 'Forex' ? 5 : inst.category === 'Crypto' ? 2 : 2;
              const cardW = (width - 42) / 2;
              return (
                <TouchableOpacity
                  key={inst.symbol}
                  style={[
                    styles.marketGridCard,
                    {
                      width: cardW,
                      backgroundColor: colors.bgCard,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => navigation.navigate('Chart')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.gridSymbol, { color: colors.textPrimary }]}>{inst.symbol}</Text>
                  <Text style={[styles.gridName, { color: colors.textMuted }]} numberOfLines={1}>{inst.name}</Text>
                  <View style={styles.gridBottomRow}>
                    <Text style={[styles.gridCategory, { color: colors.textSecondary }]}>{inst.category || 'Forex'}</Text>
                    {inst.starred ? (
                      <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={18} color={colors.textMuted} />
                    )}
                  </View>
                  <Text style={[styles.gridPrice, { color: colors.textPrimary }]}>
                    {inst.ask ? Number(inst.ask).toFixed(decimals) : '…'}
                  </Text>
                  <View style={[styles.gridChangePill, { backgroundColor: isPositive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                    <Text style={{ color: isPositive ? colors.success : colors.error, fontSize: 12, fontWeight: '600' }}>
                      {isPositive ? '+' : ''}{Number(inst.change || 0).toFixed(2)}%
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.addWatchlistPill,
            { borderColor: isDark ? 'rgba(255,255,255,0.35)' : colors.border },
          ]}
          onPress={() => navigation.navigate('Markets')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color={colors.textPrimary} />
          <Text style={[styles.addWatchlistPillText, { color: colors.textPrimary }]}>Add to Watchlist</Text>
        </TouchableOpacity>
      </View>

      {/* Master Detail Modal */}
      <Modal visible={showMasterModal} animationType="slide" transparent onRequestClose={() => setShowMasterModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.masterDetailModal, { backgroundColor: colors.bgCard }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.masterModalHeader}>
              <Text style={[styles.masterModalTitle, { color: colors.textPrimary }]}>Master Profile</Text>
              <TouchableOpacity onPress={() => setShowMasterModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedMaster && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Master Info */}
                <View style={styles.masterProfileCard}>
                  <View style={[styles.masterProfileAvatar, { backgroundColor: colors.primary + '30' }]}>
                    <Text style={[styles.masterProfileAvatarText, { color: colors.primary }]}>
                      {selectedMaster.userId?.firstName?.charAt(0) || 'M'}
                    </Text>
                  </View>
                  <Text style={[styles.masterProfileName, { color: colors.textPrimary }]}>
                    {selectedMaster.userId?.firstName || 'Master Trader'}
                  </Text>
                  <Text style={[styles.masterProfileBio, { color: colors.textSecondary }]}>
                    {selectedMaster.bio || 'Professional trader with consistent returns'}
                  </Text>
                  {isFollowingMaster(selectedMaster._id || selectedMaster.id) && (
                    <View style={styles.followingBadgeLarge}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <Text style={[styles.followingBadgeLargeText, { color: colors.success }]}>Following</Text>
                    </View>
                  )}
                </View>

                {/* Stats Grid */}
                <View style={styles.masterStatsGrid}>
                  <View style={[styles.masterStatBox, { backgroundColor: colors.bgSecondary }]}>
                    <Text style={[styles.masterStatLabel, { color: colors.textMuted }]}>Total Profit</Text>
                    <Text style={[styles.masterStatValue, { color: colors.success }]}>
                      ${(selectedMaster.stats?.totalProfitGenerated || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={[styles.masterStatBox, { backgroundColor: colors.bgSecondary }]}>
                    <Text style={[styles.masterStatLabel, { color: colors.textMuted }]}>Win Rate</Text>
                    <Text style={[styles.masterStatValue, { color: colors.textPrimary }]}>
                      {(selectedMaster.stats?.winRate || 0).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={[styles.masterStatBox, { backgroundColor: colors.bgSecondary }]}>
                    <Text style={[styles.masterStatLabel, { color: colors.textMuted }]}>Followers</Text>
                    <Text style={[styles.masterStatValue, { color: colors.textPrimary }]}>
                      {selectedMaster.stats?.totalFollowers || 0}
                    </Text>
                  </View>
                  <View style={[styles.masterStatBox, { backgroundColor: colors.bgSecondary }]}>
                    <Text style={[styles.masterStatLabel, { color: colors.textMuted }]}>Commission</Text>
                    <Text style={[styles.masterStatValue, { color: colors.textPrimary }]}>
                      {selectedMaster.approvedCommissionPercentage || 0}%
                    </Text>
                  </View>
                </View>

                {/* Follow Button */}
                {!isFollowingMaster(selectedMaster._id || selectedMaster.id) ? (
                  <TouchableOpacity 
                    style={[styles.followMasterBtn, { backgroundColor: colors.primary }, isFollowing && styles.btnDisabled]}
                    onPress={() => handleFollowMaster(selectedMaster)}
                    disabled={isFollowing}
                  >
                    {isFollowing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="add-circle-outline" size={18} color="#fff" />
                        <Text style={styles.followMasterBtnText}>Follow Master</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.alreadyFollowingBox}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                    <Text style={[styles.alreadyFollowingText, { color: colors.success }]}>You are following this master</Text>
                  </View>
                )}

                {/* View Full Profile */}
                <TouchableOpacity 
                  style={styles.viewFullProfileBtn}
                  onPress={() => { setShowMasterModal(false); parentNav?.navigate('Social'); }}
                >
                  <Text style={[styles.viewFullProfileText, { color: colors.primary }]}>View Full Profile</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Account Picker Modal — switch active account or open new one */}
      <Modal
        visible={showAccountPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAccountPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowAccountPicker(false)} />
          <View style={{ backgroundColor: colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>Select Account</Text>
              <TouchableOpacity onPress={() => setShowAccountPicker(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }}>
              {ctx.accounts && ctx.accounts.length > 0 ? (
                <>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 }}>
                    Trading Accounts
                  </Text>
                  {ctx.accounts.map((account) => {
                    const aid = account.id || account._id;
                    const isActive = !ctx.isChallengeMode && (ctx.selectedAccount?.id === aid || ctx.selectedAccount?._id === aid);
                    const demo = isDemoTradingAccount(account);
                    return (
                      <TouchableOpacity
                        key={aid}
                        activeOpacity={0.85}
                        onPress={() => {
                          ctx.setIsChallengeMode(false);
                          switchToAccount(account);
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 18,
                          paddingVertical: 14,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.border,
                          backgroundColor: isActive ? colors.accent + '10' : 'transparent',
                          borderLeftWidth: 3,
                          borderLeftColor: isActive ? colors.accent : 'transparent',
                        }}
                      >
                        <View style={{
                          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: isActive ? colors.accent + '25' : colors.bgSecondary,
                        }}>
                          <Ionicons name="briefcase" size={18} color={isActive ? colors.accent : colors.textMuted} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
                              {account.account_number || account.accountId || String(aid).slice(0, 8)}
                            </Text>
                            <View style={{
                              paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3,
                              backgroundColor: demo ? colors.warning + '25' : colors.success + '25',
                            }}>
                              <Text style={{
                                fontSize: 8, fontWeight: '800',
                                color: demo ? colors.warning : colors.success,
                              }}>
                                {demo ? 'DEMO' : 'LIVE'}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                            {account.account_group?.name || account.accountTypeId?.name || account.accountType || 'Standard'}
                            {' • 1:' + (String(account.leverage || '').replace(/^1:/, '') || '100')}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
                            ${Number(account.balance || 0).toFixed(2)}
                          </Text>
                          {isActive && (
                            <Ionicons name="checkmark-circle" size={16} color={colors.accent} style={{ marginTop: 2 }} />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}

              {ctx.challengeAccounts && ctx.challengeAccounts.length > 0 && (
                <>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 6 }}>
                    Challenge Accounts
                  </Text>
                  {ctx.challengeAccounts.filter((a) => a.status === 'ACTIVE').map((account) => {
                    const aid = account.id || account._id;
                    const isActive = ctx.isChallengeMode && (ctx.selectedChallengeAccount?.id === aid || ctx.selectedChallengeAccount?._id === aid);
                    return (
                      <TouchableOpacity
                        key={aid}
                        activeOpacity={0.85}
                        onPress={() => {
                          ctx.setIsChallengeMode(true);
                          ctx.setSelectedChallengeAccount(account);
                          setShowAccountPicker(false);
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 18,
                          paddingVertical: 14,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.border,
                          backgroundColor: isActive ? '#5a189a15' : 'transparent',
                          borderLeftWidth: 3,
                          borderLeftColor: isActive ? '#5a189a' : 'transparent',
                        }}
                      >
                        <View style={{
                          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: isActive ? '#5a189a30' : '#5a189a15',
                        }}>
                          <Ionicons name="trophy" size={18} color="#5a189a" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>{account.accountId}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                            {account.challengeId?.name || 'Challenge'} • Step {account.currentStep || 1}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
                            ${Number(account.currentBalance || account.balance || 0).toFixed(2)}
                          </Text>
                          {isActive && (
                            <Ionicons name="checkmark-circle" size={16} color="#5a189a" style={{ marginTop: 2 }} />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {(!ctx.accounts || ctx.accounts.length === 0) && (!ctx.challengeAccounts || ctx.challengeAccounts.length === 0) && (
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Ionicons name="wallet-outline" size={48} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, marginTop: 10 }}>No accounts available</Text>
                </View>
              )}
            </ScrollView>

            {/* Open new account CTA */}
            <View style={{ padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <TouchableOpacity
                onPress={() => {
                  setShowAccountPicker(false);
                  parentNav?.navigate('Accounts', { action: 'open' });
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: colors.accent,
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Open New Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

// QUOTES TAB - Full Order Panel with all order types
const QuotesTab = ({ navigation }) => {
  const ctx = React.useContext(TradingContext);
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const orderScrollRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('watchlist');
  const [expandedSegment, setExpandedSegment] = useState(null);
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [orderSide, setOrderSide] = useState('BUY');
  const [orderType, setOrderType] = useState('MARKET');
  const [pendingType, setPendingType] = useState('LIMIT');
  const [volume, setVolume] = useState(0.01);
  const [volumeText, setVolumeText] = useState('0.01');
  const [pendingPrice, setPendingPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showQuickSlModal, setShowQuickSlModal] = useState(false);
  const [quickSlValue, setQuickSlValue] = useState('');
  const [pendingQuickTradeSide, setPendingQuickTradeSide] = useState(null);

  const [sessionStats, setSessionStats] = useState({});
  const prevBidRef = useRef({});
  const prevAskRef = useRef({});
  const [flashBid, setFlashBid] = useState({});
  const [flashAsk, setFlashAsk] = useState({});

  useEffect(() => {
    setSessionStats((prev) => {
      const next = { ...prev };
      for (const inst of ctx.instruments) {
        const s = inst.symbol;
        const lp = ctx.livePrices[s] || ctx.livePrices[String(s).toUpperCase()];
        const b = lp?.bid ?? inst.bid;
        if (b == null || !Number.isFinite(b) || b <= 0) continue;
        const cur = next[s];
        if (!cur) next[s] = { open: b, high: b, low: b };
        else next[s] = { ...cur, high: Math.max(cur.high, b), low: Math.min(cur.low, b) };
      }
      return next;
    });
  }, [ctx.livePrices, ctx.instruments]);

  useEffect(() => {
    const ub = {};
    const ua = {};
    for (const inst of ctx.instruments) {
      const s = inst.symbol;
      const lp = ctx.livePrices[s] || ctx.livePrices[String(s).toUpperCase()];
      const bid = lp?.bid ?? inst.bid;
      const ask = lp?.ask ?? inst.ask;
      if (bid != null && Number.isFinite(bid)) {
        const pb = prevBidRef.current[s];
        if (pb != null && bid !== pb) ub[s] = bid > pb ? 'up' : 'down';
        prevBidRef.current[s] = bid;
      }
      if (ask != null && Number.isFinite(ask)) {
        const pa = prevAskRef.current[s];
        if (pa != null && ask !== pa) ua[s] = ask > pa ? 'up' : 'down';
        prevAskRef.current[s] = ask;
      }
    }
    if (Object.keys(ub).length === 0 && Object.keys(ua).length === 0) return undefined;
    setFlashBid((f) => ({ ...f, ...ub }));
    setFlashAsk((f) => ({ ...f, ...ua }));
    const t = setTimeout(() => {
      setFlashBid((f) => {
        const n = { ...f };
        Object.keys(ub).forEach((k) => delete n[k]);
        return n;
      });
      setFlashAsk((f) => {
        const n = { ...f };
        Object.keys(ua).forEach((k) => delete n[k]);
        return n;
      });
    }, 220);
    return () => clearTimeout(t);
  }, [ctx.livePrices, ctx.instruments]);
  
  // Get leverage from account
  const getAccountLeverage = () => {
    if (ctx.isChallengeMode && ctx.selectedChallengeAccount) {
      return ctx.selectedChallengeAccount.leverage || '1:100';
    }
    return ctx.selectedAccount?.leverage || ctx.selectedAccount?.accountTypeId?.leverage || '1:100';
  };
  
  const segments = ['Forex', 'Metals', 'Commodities', 'Crypto', 'Indices', 'Stocks'];

  const openTradePanel = (instrument) => {
    setSelectedInstrument(instrument);
    setShowOrderPanel(true);
  };

  // Helper to get segment/category from symbol
  const getSymbolCategory = (symbol) => {
    if (['XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD'].includes(symbol)) return 'Metals';
    if (['USOIL', 'UKOIL', 'NGAS', 'COPPER', 'ALUMINUM', 'NICKEL'].includes(symbol)) return 'Commodities';
    const cryptoSymbols = ['BTCUSD', 'ETHUSD', 'BNBUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'TRXUSD', 'LINKUSD', 'MATICUSD', 'DOTUSD', 'SHIBUSD', 'LTCUSD', 'BCHUSD', 'AVAXUSD', 'XLMUSD', 'UNIUSD', 'ATOMUSD', 'ETCUSD', 'FILUSD', 'ICPUSD', 'VETUSD', 'NEARUSD', 'GRTUSD', 'AAVEUSD', 'MKRUSD', 'ALGOUSD', 'FTMUSD', 'SANDUSD', 'MANAUSD', 'AXSUSD', 'THETAUSD', 'XMRUSD', 'FLOWUSD', 'SNXUSD', 'EOSUSD', 'CHZUSD', 'ENJUSD', 'ZILUSD', 'BATUSD', 'CRVUSD', 'COMPUSD', 'SUSHIUSD', 'ZRXUSD', 'LRCUSD', 'ANKRUSD', 'GALAUSD', 'APEUSD', 'WAVESUSD', 'ZECUSD', 'PEPEUSD', 'ARBUSD', 'OPUSD', 'SUIUSD', 'APTUSD', 'INJUSD', 'LDOUSD', 'IMXUSD', 'RUNEUSD', 'KAVAUSD', 'KSMUSD', 'NEOUSD', 'QNTUSD', 'FETUSD', 'RNDRUSD', 'OCEANUSD', 'WLDUSD', 'SEIUSD', 'TIAUSD', 'BLURUSD', 'TONUSD', 'HBARUSD', '1INCHUSD', 'BONKUSD', 'FLOKIUSD', 'ORDIUSD'];
    if (cryptoSymbols.includes(symbol)) return 'Crypto';
    return 'Forex';
  };

  const executeTrade = async (overrideStopLoss = null, overrideSide = null) => {
    // Check if we have a valid account (either regular or challenge)
    const hasValidAccount = ctx.isChallengeMode 
      ? ctx.selectedChallengeAccount 
      : ctx.selectedAccount;
    
    if (!ctx.user) { toast?.showToast('Please login first', 'error'); return; }
    if (!hasValidAccount) { toast?.showToast('Please select a trading account first', 'error'); return; }
    if (!selectedInstrument) { toast?.showToast('Please select an instrument', 'error'); return; }
    if (isExecuting) return;
    
    // Use override values if provided, otherwise use state
    const effectiveStopLoss = overrideStopLoss || stopLoss;
    const effectiveSide = overrideSide || orderSide;
    
    // Client-side validation for challenge account SL mandatory rule
    if (ctx.isChallengeMode && ctx.selectedChallengeAccount) {
      const rules = ctx.selectedChallengeAccount.challengeId?.rules;
      if (rules?.stopLossMandatory && !effectiveStopLoss) {
        toast?.showToast('⚠️ Stop Loss is mandatory for this challenge', 'warning');
        return;
      }
    }
    
    const activeAccount = ctx.isChallengeMode ? ctx.selectedChallengeAccount : ctx.selectedAccount;
    console.log('DEBUG: Executing trade with account:', { 
      accountId: activeAccount?.accountId, 
      _id: activeAccount?._id,
      balance: activeAccount?.balance, 
      isChallengeMode: ctx.isChallengeMode
    });
    
    setIsExecuting(true);
    try {
      // Use prices from the selected instrument
      const bid = selectedInstrument.bid;
      const ask = selectedInstrument.ask;
      
      // Validate prices
      if (!bid || !ask || bid <= 0 || ask <= 0) {
        toast?.showToast('Market is closed or no price data available', 'error');
        setIsExecuting(false);
        return;
      }

      // Validate pending price for pending orders
      if (orderType === 'PENDING' && !pendingPrice) {
        toast?.showToast('Please enter a pending price', 'warning');
        setIsExecuting(false);
        return;
      }

      const segment = getSymbolCategory(selectedInstrument.symbol);
      
      // For pending orders, use entry price for bid/ask (matching web version)
      const finalBid = (orderType === 'PENDING' && pendingPrice) ? parseFloat(pendingPrice) : parseFloat(bid);
      const finalAsk = (orderType === 'PENDING' && pendingPrice) ? parseFloat(pendingPrice) : parseFloat(ask);
      
      // Build order data for TrustEdge backend
      // TrustEdge uses account.id (UUID) not _id
      const tradingAccountId = ctx.isChallengeMode && ctx.selectedChallengeAccount 
        ? (ctx.selectedChallengeAccount.id || ctx.selectedChallengeAccount._id)
        : (ctx.selectedAccount.id || ctx.selectedAccount._id);
      
      const orderData = {
        account_id: tradingAccountId,
        symbol: selectedInstrument.symbol,
        side: effectiveSide.toLowerCase(), // TrustEdge expects lowercase: "buy" or "sell"
        order_type: orderType === 'MARKET' ? 'market' : pendingType.toLowerCase(), // "market", "limit", or "stop"
        lots: parseFloat(volume) || 0.01,
      };
      
      // Add SL/TP if set (TrustEdge uses stop_loss and take_profit)
      if (effectiveStopLoss) orderData.stop_loss = parseFloat(effectiveStopLoss);
      if (takeProfit) orderData.take_profit = parseFloat(takeProfit);
      
      // Add price for limit/stop orders
      if (orderType === 'PENDING' && pendingPrice) {
        orderData.price = parseFloat(pendingPrice);
      }

      console.log('TrustEdge Trade order data:', JSON.stringify(orderData, null, 2));
      
      // Get token for authentication
      const token = await SecureStore.getItemAsync('token');
      
      const res = await fetch(`${API_URL}/orders/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(orderData)
      });
      const data = await res.json();
      console.log('TrustEdge Trade response:', res.status, JSON.stringify(data, null, 2));
      
      if (res.ok && data) {
        const isChallengeTradeMsg = data.isChallengeAccount ? ' (Challenge)' : '';
        toast?.showToast(`${effectiveSide} ${orderType === 'MARKET' ? 'Market' : pendingType} order placed!${isChallengeTradeMsg}`, 'success');
        setShowOrderPanel(false);
        setPendingPrice('');
        setStopLoss('');
        setTakeProfit('');
        ctx.fetchOpenTrades();
        ctx.fetchPendingOrders();
        ctx.fetchAccountSummary();
      } else {
        // TrustEdge backend uses 'detail' (FastAPI standard), fallback to 'message'
        const errMsg = data.detail || data.message || 'Failed to place order';
        console.error('Trade failed:', errMsg, data);
        if (data.code === 'DRAWDOWN_BREACH' || data.code === 'DAILY_DRAWDOWN_BREACH') {
          toast?.showToast(`⚠️ Challenge Failed: ${errMsg}`, 'error');
        } else if (data.code === 'MAX_LOTS_EXCEEDED' || data.code === 'MIN_LOTS_REQUIRED') {
          toast?.showToast(`⚠️ Lot Size Error: ${errMsg}`, 'warning');
        } else if (data.accountFailed) {
          toast?.showToast(`❌ Challenge Account Failed: ${data.failReason || errMsg}`, 'error');
        } else {
          toast?.showToast(errMsg, 'error');
        }
      }
    } catch (e) {
      console.error('Trade execution error:', e);
      toast?.showToast('Network error: ' + e.message, 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const toggleStar = (symbol) => {
    ctx.setInstruments(prev => prev.map(i => 
      i.symbol === symbol ? { ...i, starred: !i.starred } : i
    ));
  };

  const watchlistInstruments = ctx.instruments.filter(inst => {
    const matchesSearch = inst.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inst.name.toLowerCase().includes(searchTerm.toLowerCase());
    return inst.starred && matchesSearch;
  });

  const getSegmentInstruments = (segment) => {
    return ctx.instruments.filter(inst => {
      const matchesSearch = inst.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inst.name.toLowerCase().includes(searchTerm.toLowerCase());
      // Map 'Energy' from backend to 'Commodities' segment in app
      let instCategory = inst.category === 'Energy' ? 'Commodities' : inst.category;
      instCategory = normalizeInstrumentCategory(instCategory, inst.symbol);
      return instCategory === segment && matchesSearch;
    });
  };

  const renderInstrumentItem = (item) => {
    if (!item?.symbol) return null;
    const sym = item.symbol;
    const liveTick = ctx.livePrices[sym] || ctx.livePrices[String(sym).toUpperCase()] || {};
    const bid = liveTick.bid ?? item.bid ?? 0;
    const ask = liveTick.ask ?? item.ask ?? 0;
    const spreadPipsText =
      ctx.adminSpreads[sym]?.spread > 0
        ? sym.includes('JPY')
          ? (ctx.adminSpreads[sym].spread * 100).toFixed(1)
          : bid > 100
            ? ctx.adminSpreads[sym].spread.toFixed(2)
            : (ctx.adminSpreads[sym].spread * 10000).toFixed(1)
        : bid && ask
          ? ((ask - bid) * (bid > 100 ? 1 : 10000)).toFixed(1)
          : '—';

    const accent = isDark ? '#50A5F1' : colors.primary;

    return (
      <Mt5QuoteRow
        key={sym}
        item={item}
        liveTick={liveTick}
        session={sessionStats[sym]}
        flashBid={flashBid[sym]}
        flashAsk={flashAsk[sym]}
        spreadPipsText={spreadPipsText}
        isDark={isDark}
        accentColor={accent}
        colors={colors}
        onPressRow={() => openTradePanel(item)}
        onToggleStar={() => toggleStar(sym)}
        onChart={() => navigation.navigate('Chart', { symbol: sym })}
      />
    );
  };

  const marketAccent = isDark ? '#50A5F1' : colors.primary;
  const searchBg = isDark ? 'rgba(255,255,255,0.06)' : colors.bgCard;
  const searchBorder = isDark ? 'rgba(255,255,255,0.1)' : colors.border;
  const searchIcon = isDark ? 'rgba(255,255,255,0.45)' : colors.textMuted;
  const tabInactiveText = isDark ? 'rgba(255,255,255,0.45)' : colors.textSecondary;
  const segmentBg = isDark ? '#121212' : colors.bgCard;
  const segmentCountBg = isDark ? 'rgba(255,255,255,0.08)' : colors.bgSecondary;

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Search Bar */}
      <View style={[styles.marketSearchContainer, { backgroundColor: searchBg, borderColor: searchBorder }]}>
        <Ionicons name="search" size={20} color={searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search instruments..."
          placeholderTextColor={colors.textMuted}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm.length > 0 && (
          <TouchableOpacity onPress={() => setSearchTerm('')}>
            <Ionicons name="close-circle" size={20} color={searchIcon} />
          </TouchableOpacity>
        )}
      </View>

      {/* Account Selector - Below search bar */}
      <TouchableOpacity style={[styles.accountSelector, { backgroundColor: searchBg, borderColor: searchBorder }]} onPress={() => setShowAccountPicker(true)}>
        <View style={styles.accountSelectorLeft}>
          <View style={[styles.accountIcon, { backgroundColor: isDark ? 'rgba(80,165,241,0.15)' : `${colors.primary}18` }]}>
            <Ionicons name="wallet" size={16} color={marketAccent} />
          </View>
          <View>
            <Text style={[styles.accountSelectorLabel, { color: colors.textSecondary }]}>Account</Text>
            <Text style={[styles.accountSelectorValue, { color: colors.textPrimary }]}>
              {ctx.isChallengeMode 
                ? `${ctx.selectedChallengeAccount?.accountId || 'Select'} • $${(ctx.selectedChallengeAccount?.currentBalance || 0).toFixed(2)}`
                : `${ctx.selectedAccount?.accountId || ctx.selectedAccount?.accountNumber || 'Select'} • $${(ctx.selectedAccount?.balance || ctx.accountSummary?.balance || 0).toFixed(2)}`
              }
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Watchlist / Markets Toggle */}
      <View style={[styles.marketTabsContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.bgSecondary }]}>
        <TouchableOpacity
          style={[styles.marketTabBtn, activeTab === 'watchlist' && { backgroundColor: marketAccent }]}
          onPress={() => setActiveTab('watchlist')}
        >
          <Text style={[styles.marketTabText, { color: tabInactiveText }, activeTab === 'watchlist' && styles.marketTabTextActive]}>
            Watchlist
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.marketTabBtn, activeTab === 'markets' && { backgroundColor: marketAccent }]}
          onPress={() => setActiveTab('markets')}
        >
          <Text style={[styles.marketTabText, { color: tabInactiveText }, activeTab === 'markets' && styles.marketTabTextActive]}>
            Markets
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={[styles.marketContent, { backgroundColor: colors.bgPrimary }]} showsVerticalScrollIndicator={false}>
        {activeTab === 'watchlist' ? (
          <>
            {watchlistInstruments.length === 0 ? (
              <View style={styles.emptyWatchlist}>
                <Ionicons name="star-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyWatchlistTitle, { color: colors.textPrimary }]}>No instruments in watchlist</Text>
                <Text style={[styles.emptyWatchlistText, { color: colors.textSecondary }]}>
                  Tap the star icon on any instrument to add it to your watchlist
                </Text>
              </View>
            ) : (
              watchlistInstruments.map(item => renderInstrumentItem(item))
            )}
          </>
        ) : (
          <>
            {segments.map(segment => {
              const segmentInstruments = getSegmentInstruments(segment);
              const isExpanded = expandedSegment === segment;
              return (
                <View key={segment} style={[styles.segmentContainer, { backgroundColor: segmentBg, borderColor: colors.border }]}>
                  <TouchableOpacity 
                    style={[styles.segmentHeader, { backgroundColor: segmentBg }]}
                    onPress={() => setExpandedSegment(isExpanded ? null : segment)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.segmentHeaderLeft}>
                      <Ionicons 
                        name={
                          segment === 'Forex' ? 'swap-horizontal'
                            : segment === 'Metals' ? 'diamond'
                            : segment === 'Commodities' ? 'flame'
                            : segment === 'Crypto' ? 'logo-bitcoin'
                            : segment === 'Indices' ? 'stats-chart'
                            : 'briefcase'
                        }
                        size={20}
                        color={marketAccent}
                      />
                      <Text style={[styles.segmentTitle, { color: colors.textPrimary }]}>{segment}</Text>
                      <View style={[styles.segmentCount, { backgroundColor: segmentCountBg }]}>
                        <Text style={[styles.segmentCountText, { color: colors.textMuted }]}>{segmentInstruments.length}</Text>
                      </View>
                    </View>
                    <Ionicons 
                      name={isExpanded ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color={colors.textMuted} 
                    />
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={[styles.segmentInstruments, { borderTopColor: colors.border }]}>
                      {segmentInstruments.map(item => renderInstrumentItem(item))}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Order Panel Slide Up - Full Order Types */}
      <Modal visible={showOrderPanel} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.orderModalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <TouchableOpacity 
            style={styles.orderPanelBackdrop} 
            activeOpacity={1} 
            onPress={() => setShowOrderPanel(false)}
          />
          <ScrollView 
            ref={orderScrollRef}
            style={[styles.orderPanelScroll, { backgroundColor: colors.bgCard }]} 
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.orderPanelContainer, { backgroundColor: colors.bgCard }]}>
              {/* Handle Bar */}
              <View style={[styles.orderPanelHandle, { backgroundColor: colors.border }]} />
              
              {/* Header */}
              <View style={styles.orderPanelHeaderRow}>
                <View>
                  <Text style={[styles.orderPanelSymbol, { color: colors.textPrimary }]}>{selectedInstrument?.symbol}</Text>
                  <Text style={[styles.orderPanelName, { color: colors.textMuted }]}>{selectedInstrument?.name}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowOrderPanel(false)} style={styles.orderCloseBtn}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Leverage Display (from account) */}
              <View style={[styles.leverageRow, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                <Text style={[styles.leverageLabel, { color: colors.textMuted }]}>Leverage</Text>
                <Text style={[styles.leverageValue, { color: colors.textPrimary }]}>{getAccountLeverage()}</Text>
              </View>

              {/* One-Click Buy/Sell - Slim Buttons */}
              <View style={styles.quickTradeRow}>
                <TouchableOpacity 
                  style={[styles.quickSellBtn, isExecuting && styles.btnDisabled]}
                  onPress={() => { 
                    // Check if challenge mode with SL mandatory
                    if (ctx.isChallengeMode && ctx.selectedChallengeAccount?.challengeId?.rules?.stopLossMandatory) {
                      setPendingQuickTradeSide('SELL');
                      setQuickSlValue('');
                      setShowQuickSlModal(true);
                    } else {
                      setOrderSide('SELL');
                      setOrderType('MARKET');
                      executeTrade(null, 'SELL');
                    }
                  }}
                  disabled={isExecuting}
                >
                  <Text style={styles.quickBtnLabel}>SELL</Text>
                  <Text style={styles.quickBtnPrice}>
                    {selectedInstrument?.bid ? selectedInstrument.bid.toFixed(selectedInstrument?.category === 'Forex' ? 5 : 2) : '-'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.quickBuyBtn, isExecuting && styles.btnDisabled]}
                  onPress={() => { 
                    // Check if challenge mode with SL mandatory
                    if (ctx.isChallengeMode && ctx.selectedChallengeAccount?.challengeId?.rules?.stopLossMandatory) {
                      setPendingQuickTradeSide('BUY');
                      setQuickSlValue('');
                      setShowQuickSlModal(true);
                    } else {
                      setOrderSide('BUY');
                      setOrderType('MARKET');
                      executeTrade(null, 'BUY');
                    }
                  }}
                  disabled={isExecuting}
                >
                  <Text style={styles.quickBtnLabel}>BUY</Text>
                  <Text style={styles.quickBtnPrice}>
                    {selectedInstrument?.ask ? selectedInstrument.ask.toFixed(selectedInstrument?.category === 'Forex' ? 5 : 2) : '-'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Spread Info */}
              <View style={styles.spreadInfoRow}>
                <Text style={[styles.spreadInfoText, { color: colors.textMuted }]}>
                  Spread: {selectedInstrument?.bid ? 
                    ((selectedInstrument?.ask - selectedInstrument?.bid) * 
                    (selectedInstrument?.category === 'Forex' ? 10000 : 1)).toFixed(1) : '-'} pips
                </Text>
              </View>

              {/* SL Mandatory Warning for Challenge Accounts */}
              {ctx.isChallengeMode && ctx.selectedChallengeAccount?.challengeId?.rules?.stopLossMandatory && (
                <View style={styles.slMandatoryBanner}>
                  <Ionicons name="warning" size={16} color="#f59e0b" />
                  <Text style={styles.slMandatoryText}>Stop Loss is mandatory for this challenge account</Text>
                </View>
              )}

              {/* Order Type Toggle */}
              <View style={styles.orderTypeRow}>
                <TouchableOpacity 
                  style={[styles.orderTypeBtn, { backgroundColor: colors.bgSecondary }, orderType === 'MARKET' && styles.orderTypeBtnActive]}
                  onPress={() => setOrderType('MARKET')}
                >
                  <Text style={[styles.orderTypeBtnText, { color: colors.textMuted }, orderType === 'MARKET' && styles.orderTypeBtnTextActive]}>Market</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.orderTypeBtn, { backgroundColor: colors.bgSecondary }, orderType === 'PENDING' && styles.orderTypeBtnActive]}
                  onPress={() => setOrderType('PENDING')}
                >
                  <Text style={[styles.orderTypeBtnText, { color: colors.textMuted }, orderType === 'PENDING' && styles.orderTypeBtnTextActive]}>Pending</Text>
                </TouchableOpacity>
              </View>

              {/* Pending Order Types */}
              {orderType === 'PENDING' && (
                <View style={styles.pendingTypeRow}>
                  {['LIMIT', 'STOP'].map(type => (
                    <TouchableOpacity 
                      key={type}
                      style={[styles.pendingTypeBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.border }, pendingType === type && styles.pendingTypeBtnActive]}
                      onPress={() => setPendingType(type)}
                    >
                      <Text style={[styles.pendingTypeText, { color: colors.textMuted }, pendingType === type && styles.pendingTypeTextActive]}>
                        {type === 'LIMIT' ? 'Limit' : 'Stop'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Pending Price Input */}
              {orderType === 'PENDING' && (
                <View style={styles.inputSection}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                    {pendingType === 'LIMIT' ? 'Limit Price' : 'Stop Price'}
                  </Text>
                  <TextInput
                    style={[styles.priceInput, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                    value={pendingPrice}
                    onChangeText={setPendingPrice}
                    placeholder={ctx.livePrices[selectedInstrument?.symbol]?.bid?.toFixed(2) || '0.00'}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
              )}

              {/* Volume Control */}
              <View style={styles.inputSection}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Volume (Lots)</Text>
                <View style={styles.volumeControlRow}>
                  <TouchableOpacity 
                    style={[styles.volumeControlBtn, { backgroundColor: colors.accent }]} 
                    onPress={() => {
                      const newVol = Math.max(0.01, volume - 0.01);
                      setVolume(newVol);
                      setVolumeText(newVol.toFixed(2));
                    }}
                  >
                    <Ionicons name="remove" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.volumeInputField, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                    value={volumeText}
                    onChangeText={(text) => {
                      // Allow empty, numbers, and decimal point
                      if (text === '' || /^\d*\.?\d*$/.test(text)) {
                        setVolumeText(text);
                        // Update volume state in real-time for valid numbers
                        const val = parseFloat(text);
                        if (!isNaN(val) && val > 0) {
                          setVolume(val);
                        }
                      }
                    }}
                    onFocus={() => {
                      // Scroll to make input visible above keyboard
                      setTimeout(() => {
                        orderScrollRef.current?.scrollTo({ y: 200, animated: true });
                      }, 300);
                    }}
                    onBlur={() => {
                      const val = parseFloat(volumeText);
                      if (isNaN(val) || val <= 0) {
                        setVolumeText('0.01');
                        setVolume(0.01);
                      } else {
                        setVolume(val);
                        setVolumeText(val.toFixed(2));
                      }
                    }}
                    keyboardType="decimal-pad"
                    selectTextOnFocus={true}
                  />
                  <TouchableOpacity 
                    style={[styles.volumeControlBtn, { backgroundColor: colors.accent }]} 
                    onPress={() => {
                      const newVol = volume + 0.01;
                      setVolume(newVol);
                      setVolumeText(newVol.toFixed(2));
                    }}
                  >
                    <Ionicons name="add" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Stop Loss & Take Profit */}
              <View style={styles.slTpRow}>
                <View style={styles.slTpCol}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Stop Loss</Text>
                  <TextInput
                    style={[styles.slTpInputOrder, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                    value={stopLoss}
                    onChangeText={(text) => setStopLoss(text.replace(/[^0-9.]/g, ''))}
                    placeholder="Optional"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    selectionColor="#5a189a"
                    onFocus={() => {
                      setTimeout(() => {
                        orderScrollRef.current?.scrollToEnd({ animated: true });
                      }, 300);
                    }}
                  />
                </View>
                <View style={styles.slTpCol}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Take Profit</Text>
                  <TextInput
                    style={[styles.slTpInputOrder, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                    value={takeProfit}
                    onChangeText={(text) => setTakeProfit(text.replace(/[^0-9.]/g, ''))}
                    placeholder="Optional"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    selectionColor="#5a189a"
                    onFocus={() => {
                      setTimeout(() => {
                        orderScrollRef.current?.scrollToEnd({ animated: true });
                      }, 300);
                    }}
                  />
                </View>
              </View>

              {/* Final Buy/Sell Buttons - Slim */}
              <View style={styles.finalTradeRow}>
                <TouchableOpacity 
                  style={[styles.finalSellBtn, isExecuting && styles.btnDisabled]}
                  onPress={() => executeTrade(null, 'SELL')}
                  disabled={isExecuting}
                >
                  <Text style={styles.finalBtnText}>
                    {isExecuting ? 'EXECUTING...' : orderType === 'PENDING' ? `SELL ${pendingType}` : 'SELL'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.finalBuyBtn, isExecuting && styles.btnDisabled]}
                  onPress={() => executeTrade(null, 'BUY')}
                  disabled={isExecuting}
                >
                  <Text style={styles.finalBtnText}>
                    {isExecuting ? 'EXECUTING...' : orderType === 'PENDING' ? `BUY ${pendingType}` : 'BUY'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Account Picker Modal */}
      <Modal visible={showAccountPicker} animationType="slide" transparent onRequestClose={() => setShowAccountPicker(false)}>
        <View style={styles.accountPickerOverlay}>
          <TouchableOpacity style={styles.accountPickerBackdrop} onPress={() => setShowAccountPicker(false)} />
          <View style={[styles.accountPickerContent, { backgroundColor: colors.bgCard }]}>
            <View style={[styles.accountPickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.accountPickerTitle, { color: colors.textPrimary }]}>Select Account</Text>
              <TouchableOpacity onPress={() => setShowAccountPicker(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.accountPickerList}>
              {/* Regular Accounts Section */}
              {ctx.accounts && ctx.accounts.length > 0 && (
                <>
                  <Text style={[styles.accountPickerSectionTitle, { color: colors.textMuted }]}>Trading Accounts</Text>
                  {ctx.accounts.map(account => (
                    <TouchableOpacity 
                      key={account._id}
                      style={[styles.accountPickerItem, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }, !ctx.isChallengeMode && ctx.selectedAccount?._id === account._id && styles.accountPickerItemActive]}
                      onPress={() => { 
                        ctx.setIsChallengeMode(false);
                        ctx.setSelectedAccount(account); 
                        setShowAccountPicker(false); 
                      }}
                    >
                      <View style={styles.accountPickerItemLeft}>
                        <View style={[styles.accountPickerIcon, { backgroundColor: colors.bgSecondary }, !ctx.isChallengeMode && ctx.selectedAccount?._id === account._id && styles.accountPickerIconActive]}>
                          <Ionicons name="wallet" size={20} color={!ctx.isChallengeMode && ctx.selectedAccount?._id === account._id ? colors.accent : colors.textMuted} />
                        </View>
                        <View>
                          <Text style={[styles.accountPickerNumber, { color: colors.textPrimary }]}>{account.accountId || account.accountNumber}</Text>
                          <Text style={[styles.accountPickerType, { color: colors.textMuted }]}>{account.accountTypeId?.name || account.accountType || 'Standard'} • {account.leverage}</Text>
                        </View>
                      </View>
                      <View style={styles.accountPickerItemRight}>
                        <Text style={[styles.accountPickerBalance, { color: colors.textPrimary }]}>${(account.balance || 0).toFixed(2)}</Text>
                        {!ctx.isChallengeMode && (ctx.selectedAccount?.id === account.id || ctx.selectedAccount?._id === account._id) && (
                          <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* Challenge Accounts Section */}
              {ctx.challengeAccounts && ctx.challengeAccounts.length > 0 && (
                <>
                  <Text style={[styles.accountPickerSectionTitle, { color: colors.textMuted, marginTop: 16 }]}>Challenge Accounts</Text>
                  {ctx.challengeAccounts.filter(acc => acc.status === 'ACTIVE').map(account => (
                    <TouchableOpacity 
                      key={account._id}
                      style={[styles.accountPickerItem, { backgroundColor: colors.bgCard, borderBottomColor: colors.border, borderLeftWidth: 3, borderLeftColor: '#5a189a' }, ctx.isChallengeMode && ctx.selectedChallengeAccount?._id === account._id && styles.accountPickerItemActive]}
                      onPress={() => { 
                        ctx.setIsChallengeMode(true);
                        ctx.setSelectedChallengeAccount(account); 
                        setShowAccountPicker(false); 
                      }}
                    >
                      <View style={styles.accountPickerItemLeft}>
                        <View style={[styles.accountPickerIcon, { backgroundColor: '#5a189a20' }, ctx.isChallengeMode && ctx.selectedChallengeAccount?._id === account._id && { backgroundColor: '#5a189a40' }]}>
                          <Ionicons name="trophy" size={20} color="#5a189a" />
                        </View>
                        <View>
                          <Text style={[styles.accountPickerNumber, { color: colors.textPrimary }]}>{account.accountId}</Text>
                          <Text style={[styles.accountPickerType, { color: colors.textMuted }]}>{account.challengeId?.name || 'Challenge'} • Step {account.currentStep || 1}</Text>
                        </View>
                      </View>
                      <View style={styles.accountPickerItemRight}>
                        <Text style={[styles.accountPickerBalance, { color: colors.textPrimary }]}>${(account.currentBalance || account.balance || 0).toFixed(2)}</Text>
                        {ctx.isChallengeMode && (ctx.selectedChallengeAccount?.id === account.id || ctx.selectedChallengeAccount?._id === account._id) && (
                          <Ionicons name="checkmark-circle" size={20} color="#5a189a" />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* No accounts message */}
              {(!ctx.accounts || ctx.accounts.length === 0) && (!ctx.challengeAccounts || ctx.challengeAccounts.length === 0) && (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Ionicons name="wallet-outline" size={48} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, marginTop: 10 }}>No accounts available</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 5 }}>Please create an account first</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Quick Stop Loss Modal for Challenge Accounts */}
      <Modal visible={showQuickSlModal} animationType="fade" transparent onRequestClose={() => setShowQuickSlModal(false)}>
        <View style={styles.quickSlModalOverlay}>
          <View style={[styles.quickSlModalContent, { backgroundColor: colors.bgCard }]}>
            <View style={styles.quickSlModalHeader}>
              <Ionicons name="warning" size={24} color="#f59e0b" />
              <Text style={[styles.quickSlModalTitle, { color: colors.textPrimary }]}>Stop Loss Required</Text>
            </View>
            <Text style={[styles.quickSlModalSubtitle, { color: colors.textMuted }]}>
              Stop Loss is mandatory for challenge accounts. Please set a stop loss price before placing your trade.
            </Text>
            
            <View style={styles.quickSlInputContainer}>
              <Text style={[styles.quickSlInputLabel, { color: colors.textMuted }]}>Stop Loss Price</Text>
              <TextInput
                style={[styles.quickSlInput, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                value={quickSlValue}
                onChangeText={(text) => setQuickSlValue(text.replace(/[^0-9.]/g, ''))}
                placeholder={`e.g. ${pendingQuickTradeSide === 'BUY' 
                  ? (ctx.livePrices[selectedInstrument?.symbol]?.bid * 0.99)?.toFixed(selectedInstrument?.category === 'Forex' ? 5 : 2) 
                  : (ctx.livePrices[selectedInstrument?.symbol]?.ask * 1.01)?.toFixed(selectedInstrument?.category === 'Forex' ? 5 : 2)}`}
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
              />
              <Text style={[styles.quickSlHint, { color: colors.textMuted }]}>
                Current {pendingQuickTradeSide === 'BUY' ? 'Bid' : 'Ask'}: {pendingQuickTradeSide === 'BUY' 
                  ? ctx.livePrices[selectedInstrument?.symbol]?.bid?.toFixed(selectedInstrument?.category === 'Forex' ? 5 : 2) 
                  : ctx.livePrices[selectedInstrument?.symbol]?.ask?.toFixed(selectedInstrument?.category === 'Forex' ? 5 : 2)}
              </Text>
            </View>

            <View style={styles.quickSlModalButtons}>
              <TouchableOpacity 
                style={[styles.quickSlCancelBtn, { backgroundColor: colors.bgSecondary }]}
                onPress={() => {
                  setShowQuickSlModal(false);
                  setPendingQuickTradeSide(null);
                  setQuickSlValue('');
                }}
              >
                <Text style={[styles.quickSlCancelBtnText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.quickSlConfirmBtn, { backgroundColor: pendingQuickTradeSide === 'BUY' ? '#22c55e' : '#ef4444' }]}
                onPress={() => {
                  if (!quickSlValue || isNaN(parseFloat(quickSlValue))) {
                    toast?.showToast('Please enter a valid stop loss price', 'warning');
                    return;
                  }
                  const slValue = quickSlValue;
                  const tradeSide = pendingQuickTradeSide;
                  setStopLoss(slValue);
                  setOrderSide(tradeSide);
                  setOrderType('MARKET');
                  setShowQuickSlModal(false);
                  setPendingQuickTradeSide(null);
                  setQuickSlValue('');
                  // Execute trade with SL and side passed directly (avoid async state issues)
                  setTimeout(() => executeTrade(slValue, tradeSide), 100);
                }}
              >
                <Text style={styles.quickSlConfirmBtnText}>
                  {pendingQuickTradeSide === 'BUY' ? 'BUY' : 'SELL'} with SL
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// TRADE TAB - Account summary + Positions/Pending/History (like mobile web view)
const TradeTab = () => {
  const ctx = React.useContext(TradingContext);
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [tradeTab, setTradeTab] = useState('positions');
  const [refreshing, setRefreshing] = useState(false);
  const [showSlTpModal, setShowSlTpModal] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [closingTradeId, setClosingTradeId] = useState(null);
  const [showCloseAllModal, setShowCloseAllModal] = useState(false);
  const [closeAllType, setCloseAllType] = useState('all');
  const [isClosingAll, setIsClosingAll] = useState(false);
  const [showKillSwitch, setShowKillSwitch] = useState(false);
  const [isKillSwitchActive, setIsKillSwitchActive] = useState(false);
  const [showTradeDetails, setShowTradeDetails] = useState(false);
  const [detailTrade, setDetailTrade] = useState(null);
  const [showHistoryDetails, setShowHistoryDetails] = useState(false);
  const [historyDetailTrade, setHistoryDetailTrade] = useState(null);
  
  // History filter states
  const [historyFilter, setHistoryFilter] = useState('all');

  const totalUsedMargin = (Array.isArray(ctx.openTrades) ? ctx.openTrades : []).reduce((sum, trade) => sum + (trade.marginUsed || 0), 0);
  
  // Filter trade history based on selected filter
  const getFilteredHistory = () => {
    const now = new Date();
    return (Array.isArray(ctx.tradeHistory) ? ctx.tradeHistory : []).filter(trade => {
      const tradeDate = new Date(trade.closedAt);
      if (historyFilter === 'all') return true;
      if (historyFilter === 'today') {
        return tradeDate.toDateString() === now.toDateString();
      }
      if (historyFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return tradeDate >= weekAgo;
      }
      if (historyFilter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return tradeDate >= monthAgo;
      }
      if (historyFilter === 'year') {
        const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        return tradeDate >= yearAgo;
      }
      return true;
    });
  };

  // Calculate total P&L for filtered history
  const getHistoryTotalPnl = () => {
    return getFilteredHistory().reduce((sum, trade) => sum + (trade.realizedPnl || 0), 0);
  };

  // Calculate PnL for a trade
  const calculatePnl = (trade) => {
    const prices = ctx.livePrices[trade.symbol];
    if (!prices?.bid || !prices?.ask) return 0;
    const currentPrice = trade.side === 'BUY' ? prices.bid : prices.ask;
    return trade.side === 'BUY'
      ? (currentPrice - trade.openPrice) * trade.quantity * trade.contractSize
      : (trade.openPrice - currentPrice) * trade.quantity * trade.contractSize;
  };

  // Close single trade
  const closeTrade = async (trade) => {
    if (closingTradeId) return;
    const prices = ctx.livePrices[trade.symbol];
    if (!prices?.bid || !prices?.ask) {
      toast?.showToast('No price data available', 'error');
      return;
    }
    
    setClosingTradeId(trade.id || trade._id);
    try {
      const token = await SecureStore.getItemAsync('token');
      const positionId = trade.id || trade._id;
      
      const res = await fetch(`${API_URL}/positions/${positionId}/close`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      console.log('[TrustEdge] Close position response:', data);
      
      if (res.ok) {
        const pnl = data.profit || 0;
        toast?.showToast(`Closed! P/L: $${pnl.toFixed(2)}`, pnl >= 0 ? 'success' : 'warning');
        ctx.fetchOpenTrades();
        ctx.fetchTradeHistory();
        ctx.fetchAccountSummary();
      } else {
        toast?.showToast(data.detail || data.message || 'Failed to close', 'error');
      }
    } catch (e) {
      console.error('Close trade error:', e);
      toast?.showToast('Failed to close trade', 'error');
    } finally {
      setClosingTradeId(null);
    }
  };

  // Close all trades (all, profit, or loss)
  const closeAllTrades = async (type) => {
    setCloseAllType(type);
    setShowCloseAllModal(true);
  };

  const confirmCloseAll = async () => {
    setIsClosingAll(true);
    const safeOpenTrades = Array.isArray(ctx.openTrades) ? ctx.openTrades : [];
    const tradesToClose = safeOpenTrades.filter(trade => {
      if (!trade) return false;
      const pnl = calculatePnl(trade);
      if (closeAllType === 'profit') return pnl > 0;
      if (closeAllType === 'loss') return pnl < 0;
      return true;
    });

    let closedCount = 0;
    const token = await SecureStore.getItemAsync('token');
    for (const trade of tradesToClose) {
      try {
        const positionId = trade.id || trade._id;
        const res = await fetch(`${API_URL}/positions/${positionId}/close`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) closedCount++;
      } catch (e) {
        console.error('Close trade error:', e);
      }
    }

    setShowCloseAllModal(false);
    setIsClosingAll(false);
    toast?.showToast(`Closed ${closedCount} trade(s)`, 'success');
    ctx.fetchOpenTrades();
    ctx.fetchTradeHistory();
    ctx.fetchAccountSummary();
  };

  // Kill Switch - Close all trades and cancel all pending orders
  const executeKillSwitch = async () => {
    setIsKillSwitchActive(true);
    let closedTrades = 0;
    let cancelledOrders = 0;

    // Close all open trades via TrustEdge
    const token = await SecureStore.getItemAsync('token');
    const safeOpenTrades = Array.isArray(ctx.openTrades) ? ctx.openTrades : [];
    for (const trade of safeOpenTrades) {
      try {
        const positionId = trade.id || trade._id;
        const res = await fetch(`${API_URL}/positions/${positionId}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) closedTrades++;
      } catch (e) {
        console.error('Kill switch close error:', e);
      }
    }

    // Cancel all pending orders via TrustEdge
    const safePendingOrders = Array.isArray(ctx.pendingOrders) ? ctx.pendingOrders : [];
    for (const order of safePendingOrders) {
      try {
        const orderId = order.id || order._id;
        const res = await fetch(`${API_URL}/orders/${orderId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (res.ok) cancelledOrders++;
      } catch (e) {
        console.error('Kill switch cancel error:', e);
      }
    }

    setShowKillSwitch(false);
    setIsKillSwitchActive(false);
    toast?.showToast(`Kill Switch: Closed ${closedTrades} trades, cancelled ${cancelledOrders} orders`, 'warning');
    ctx.fetchOpenTrades();
    ctx.fetchPendingOrders();
    ctx.fetchTradeHistory();
    ctx.fetchAccountSummary();
  };

  const openSlTpModal = (trade) => {
    setSelectedTrade(trade);
    // Check both sl/stopLoss and tp/takeProfit fields for compatibility (like web app)
    setStopLoss((trade.sl || trade.stopLoss || trade.stop_loss)?.toString() || '');
    setTakeProfit((trade.tp || trade.takeProfit || trade.take_profit)?.toString() || '');
    setShowSlTpModal(true);
  };

  const updateSlTp = async () => {
    if (!selectedTrade) return;
    try {
      const slValue = stopLoss && stopLoss.trim() !== '' ? parseFloat(stopLoss) : null;
      const tpValue = takeProfit && takeProfit.trim() !== '' ? parseFloat(takeProfit) : null;
      
      const positionId = selectedTrade.id || selectedTrade._id;
      console.log('Updating SL/TP:', { positionId, stop_loss: slValue, take_profit: tpValue });
      
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/positions/${positionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          stop_loss: slValue,
          take_profit: tpValue
        })
      });
      const data = await res.json();
      console.log('[TrustEdge] SL/TP update response:', data);

      if (res.ok) {
        toast?.showToast('SL/TP updated successfully', 'success');
        setShowSlTpModal(false);
        setSelectedTrade(null);
        ctx.fetchOpenTrades();
      } else {
        toast?.showToast(data.detail || data.message || 'Failed to update SL/TP', 'error');
      }
    } catch (e) {
      console.error('Update SL/TP error:', e);
      toast?.showToast('Network error', 'error');
    }
  };

  // Cancel pending order
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const cancelPendingOrder = async (order) => {
    if (cancellingOrderId) return;
    const orderId = order.id || order._id;
    setCancellingOrderId(orderId);
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/orders/${orderId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        toast?.showToast('Order cancelled', 'success');
        ctx.fetchPendingOrders();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast?.showToast(errData.detail || 'Failed to cancel order', 'error');
      }
    } catch (e) {
      toast?.showToast('Network error', 'error');
    } finally {
      setCancellingOrderId(null);
    }
  };

  const accountDisplay =
    ctx.isChallengeMode
      ? String(ctx.selectedChallengeAccount?.name || ctx.selectedChallengeAccount?.accountId || ctx.selectedChallengeAccount?.accountNumber || 'Challenge')
      : String(ctx.selectedAccount?.accountId || ctx.selectedAccount?.accountNumber || ctx.selectedAccount?.label || '—');

  const onTradeRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        ctx.fetchOpenTrades(),
        ctx.fetchPendingOrders(),
        ctx.fetchTradeHistory(),
        ctx.fetchAccountSummary(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const escapeCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const exportTradeCsv = async () => {
    let csv = '';
    if (tradeTab === 'positions') {
      csv = ['ACCOUNT', 'SYMBOL', 'SIDE', 'QTY', 'OPEN', 'CURRENT', 'FLOATING_PNL'].join(',') + '\n';
      (Array.isArray(ctx.openTrades) ? ctx.openTrades : []).forEach((t) => {
        const prices = ctx.livePrices[t.symbol];
        const cur = t.side === 'BUY' ? prices?.bid : prices?.ask;
        const pnl = ctx.calculatePnl(t);
        csv +=
          [
            escapeCsv(accountDisplay),
            escapeCsv(t.symbol),
            escapeCsv(t.side),
            escapeCsv(t.quantity),
            escapeCsv(t.openPrice != null ? Number(t.openPrice).toFixed(5) : ''),
            escapeCsv(cur != null ? Number(cur).toFixed(5) : ''),
            escapeCsv(pnl.toFixed(2)),
          ].join(',') + '\n';
      });
    } else if (tradeTab === 'pending') {
      csv = ['ACCOUNT', 'SYMBOL', 'TYPE', 'QTY', 'PRICE'].join(',') + '\n';
      (Array.isArray(ctx.pendingOrders) ? ctx.pendingOrders : []).forEach((o) => {
        csv +=
          [
            escapeCsv(accountDisplay),
            escapeCsv(o.symbol),
            escapeCsv(o.orderType),
            escapeCsv(o.quantity),
            escapeCsv(o.pendingPrice != null ? Number(o.pendingPrice).toFixed(5) : ''),
          ].join(',') + '\n';
      });
    } else {
      csv = ['ACCOUNT', 'SYMBOL', 'SIDE', 'QTY', 'OPEN', 'CLOSE', 'REALIZED_PNL', 'CLOSED_AT'].join(',') + '\n';
      getFilteredHistory().forEach((t) => {
        csv +=
          [
            escapeCsv(accountDisplay),
            escapeCsv(t.symbol),
            escapeCsv(t.side),
            escapeCsv(t.quantity),
            escapeCsv(t.openPrice != null ? Number(t.openPrice).toFixed(5) : ''),
            escapeCsv(t.closePrice != null ? Number(t.closePrice).toFixed(5) : ''),
            escapeCsv((t.realizedPnl ?? 0).toFixed(2)),
            escapeCsv(t.closedAt ? new Date(t.closedAt).toISOString() : ''),
          ].join(',') + '\n';
      });
    }
    try {
      await Share.share({ message: csv, title: 'trades-export.csv' });
    } catch (e) {
      if (e?.message !== 'User did not share') {
        toast?.showToast('Could not export', 'error');
      }
    }
  };

  const balanceVal = Number(
    ctx.accountSummary.balance ||
      (ctx.isChallengeMode ? ctx.selectedChallengeAccount?.balance : ctx.selectedAccount?.balance) ||
      0
  );
  const creditVal = Number(ctx.accountSummary.credit || 0);
  const floatPl = ctx.totalFloatingPnl ?? 0;
  const floatColor = floatPl >= 0 ? colors.accent : colors.lossColor;
  const todayPnlVal = Number(ctx.todayPnl ?? 0);
  const todayPnlColor = todayPnlVal >= 0 ? colors.profitColor : colors.lossColor;

  return (
    <View style={[styles.tradeDashRoot, { backgroundColor: isDark ? colors.bgPrimary : colors.bgPrimary }]}>
      {/* Top strip — scroll for all account stats */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        style={styles.tradeSummaryStrip}
        contentContainerStyle={[
          styles.tradeSummaryStripContent,
          { paddingTop: Math.max(insets.top, 12) + 8, paddingBottom: 12 },
        ]}
      >
        {[
          { label: 'Balance', value: balanceVal.toFixed(2), valueColor: colors.textPrimary },
          { label: 'Equity', value: ctx.realTimeEquity.toFixed(2), valueColor: colors.textPrimary },
          { label: 'Credit', value: creditVal.toFixed(2), valueColor: colors.textPrimary },
          { label: 'Used Margin', value: totalUsedMargin.toFixed(2), valueColor: colors.textPrimary },
          { label: 'Free Margin', value: ctx.realTimeFreeMargin.toFixed(2), valueColor: colors.accent },
          { label: 'Floating PL', value: `${floatPl >= 0 ? '+' : ''}${floatPl.toFixed(2)}`, valueColor: floatColor },
          { label: "Today's P&L", value: `${todayPnlVal >= 0 ? '+' : ''}${todayPnlVal.toFixed(2)}`, valueColor: todayPnlColor },
        ].map((s) => (
          <View
            key={s.label}
            style={[
              styles.tradeStatPill,
              {
                backgroundColor: isDark ? colors.bgCard : colors.bgSecondary,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.tradeStatLabel, { color: colors.textSecondary }]}>{s.label}</Text>
            <Text style={[styles.tradeStatValue, { color: s.valueColor }]} numberOfLines={1}>
              {s.value}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View
        style={[
          styles.tradeDashCard,
          {
            backgroundColor: colors.bgCard,
            borderColor: colors.border,
            shadowColor: isDark ? '#000' : '#0f172a',
          },
        ]}
      >
        {/* Open | Pending | History */}
        <View style={[styles.tradeDashTabsRow, { borderBottomColor: colors.border }]}>
          {[
            { id: 'positions', title: 'Open', count: ctx.openTrades?.length ?? 0 },
            { id: 'pending', title: 'Pending', count: ctx.pendingOrders?.length ?? 0 },
            { id: 'history', title: 'History', count: ctx.tradeHistory?.length ?? 0 },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={styles.tradeDashTabHit}
              onPress={() => setTradeTab(tab.id)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tradeDashTabLabel,
                  { color: colors.textMuted },
                  tradeTab === tab.id && { color: colors.primary, fontWeight: '700' },
                ]}
              >
                {tab.title} ({tab.count})
              </Text>
              {tradeTab === tab.id ? (
                <View style={[styles.tradeDashTabUnderline, { backgroundColor: colors.primary }]} />
              ) : (
                <View style={styles.tradeDashTabUnderlinePlaceholder} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Toolbar: refresh + CSV */}
        <View style={[styles.tradeToolbarRow, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.tradeToolOutlineBtn, { borderColor: colors.border }]}
            onPress={onTradeRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="refresh-outline" size={20} color={colors.primary} />
            )}
            <Text style={[styles.tradeToolBtnLabel, { color: colors.textPrimary }]}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tradeToolOutlineBtn, { borderColor: colors.border }]} onPress={exportTradeCsv}>
            <Ionicons name="download-outline" size={20} color={colors.primary} />
            <Text style={[styles.tradeToolBtnLabel, { color: colors.textPrimary }]}>CSV</Text>
          </TouchableOpacity>
        </View>

        {tradeTab === 'positions' && ctx.openTrades.length > 0 && (
          <View style={[styles.closeAllRow, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
            <TouchableOpacity style={styles.closeAllBtn} onPress={() => closeAllTrades('all')}>
              <Text style={styles.closeAllText}>Close All ({ctx.openTrades.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeProfitBtn} onPress={() => closeAllTrades('profit')}>
              <Text style={styles.closeProfitText}>Close Profit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeLossBtn} onPress={() => closeAllTrades('loss')}>
              <Text style={styles.closeLossText}>Close Loss</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView
          style={styles.tradesList}
          nestedScrollEnabled
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onTradeRefresh} tintColor={colors.primary} />}
        >
        {tradeTab === 'positions' && (
          ctx.openTrades.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="trending-up-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No open positions</Text>
            </View>
          ) : (
            ctx.openTrades.map((trade) => {
              const pnl = ctx.calculatePnl(trade);
              const prices = ctx.livePrices[trade.symbol];
              const currentPrice = trade.side === 'BUY' ? prices?.bid : prices?.ask;

              const renderRightActions = () => (
                <TouchableOpacity style={styles.swipeCloseBtn} onPress={() => closeTrade(trade)}>
                  <Ionicons name="close-circle" size={24} color="#fff" />
                  <Text style={styles.swipeCloseText}>Close</Text>
                </TouchableOpacity>
              );

              return (
                <Swipeable
                  key={trade._id || trade.id}
                  renderRightActions={renderRightActions}
                  rightThreshold={40}
                  overshootRight={false}
                >
                  <TouchableOpacity
                    style={[styles.positionItem, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}
                    onPress={() => { setDetailTrade(trade); setShowTradeDetails(true); }}
                  >
                    <View style={styles.positionRow}>
                      <View style={styles.positionInfo}>
                        <View style={styles.positionSymbolRow}>
                          <Text style={[styles.positionSymbol, { color: colors.textPrimary }]}>{trade.symbol}</Text>
                          <View style={[styles.sideBadge, { backgroundColor: trade.side === 'BUY' ? '#22c55e20' : '#ef444420' }]}>
                            <Text style={[styles.sideText, { color: trade.side === 'BUY' ? '#22c55e' : '#ef4444' }]}>{trade.side}</Text>
                          </View>
                        </View>
                        <Text style={[styles.positionDetail, { color: colors.textMuted }]}>{trade.quantity} lots @ {trade.openPrice?.toFixed(5)}</Text>
                        {(trade.sl || trade.stopLoss || trade.tp || trade.takeProfit) && (
                          <Text style={[styles.slTpText, { color: colors.textMuted }]}>
                            {(trade.sl || trade.stopLoss) ? `SL: ${trade.sl || trade.stopLoss}` : ''} {(trade.tp || trade.takeProfit) ? `TP: ${trade.tp || trade.takeProfit}` : ''}
                          </Text>
                        )}
                      </View>
                      <View style={styles.positionActions}>
                        <TouchableOpacity style={styles.editBtn} onPress={(e) => { e.stopPropagation?.(); openSlTpModal(trade); }}>
                          <Ionicons name="pencil" size={16} color={colors.accent} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.positionPnlCol}>
                        <Text style={[styles.positionPnl, { color: pnl >= 0 ? '#22c55e' : '#ef4444' }]}>
                          ${pnl >= 0 ? '' : '-'}{Math.abs(pnl).toFixed(2)}
                        </Text>
                        <Text style={[styles.currentPriceText, { color: colors.textMuted }]}>{currentPrice?.toFixed(5) || '-'}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </Swipeable>
              );
            })
          )
        )}

        {tradeTab === 'pending' && (
          ctx.pendingOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No pending orders</Text>
            </View>
          ) : (
            ctx.pendingOrders.map((order) => (
              <View key={order._id || order.id} style={[styles.positionItem, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
                <View style={styles.positionRow}>
                  <View style={styles.positionInfo}>
                    <View style={styles.positionSymbolRow}>
                      <Text style={[styles.positionSymbol, { color: colors.textPrimary }]}>{order.symbol}</Text>
                      <View style={[styles.sideBadge, { backgroundColor: '#eab30820' }]}>
                        <Text style={[styles.sideText, { color: '#eab308' }]}>{order.orderType}</Text>
                      </View>
                    </View>
                    <Text style={[styles.positionDetail, { color: colors.textMuted }]}>{order.quantity} lots @ {order.pendingPrice?.toFixed(5)}</Text>
                    {(order.sl || order.stopLoss || order.tp || order.takeProfit) && (
                      <Text style={[styles.slTpText, { color: colors.textMuted }]}>
                        {(order.sl || order.stopLoss) ? `SL: ${order.sl || order.stopLoss}` : ''} {(order.tp || order.takeProfit) ? `TP: ${order.tp || order.takeProfit}` : ''}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.cancelOrderBtn, cancellingOrderId === (order.id || order._id) && styles.btnDisabled]}
                    onPress={() => cancelPendingOrder(order)}
                    disabled={cancellingOrderId === (order.id || order._id)}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.accent} />
                    <Text style={[styles.cancelOrderText, { color: colors.accent }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )
        )}

        {tradeTab === 'history' && (
          <>
            {/* History Filter Buttons */}
            <View style={[styles.historyFilters, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyFiltersContent}>
                {[
                  { key: 'all', label: 'All' },
                  { key: 'today', label: 'Today' },
                  { key: 'week', label: 'This Week' },
                  { key: 'month', label: 'This Month' },
                  { key: 'year', label: 'This Year' }
                ].map(filter => (
                  <TouchableOpacity
                    key={filter.key}
                    style={[
                      styles.historyFilterBtn,
                      { backgroundColor: historyFilter === filter.key ? '#22c55e' : colors.bgCard }
                    ]}
                    onPress={() => setHistoryFilter(filter.key)}
                  >
                    <Text style={[
                      styles.historyFilterText,
                      { color: historyFilter === filter.key ? '#000' : colors.textMuted }
                    ]}>
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            
            {/* History Summary */}
            <View style={[styles.historySummary, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
              <Text style={[styles.historySummaryText, { color: colors.textMuted }]}>
                {getFilteredHistory().length} trades
              </Text>
              <Text style={[styles.historySummaryText, { color: colors.textMuted }]}>
                P&L: <Text style={{ color: getHistoryTotalPnl() >= 0 ? '#22c55e' : '#ef4444', fontWeight: '600' }}>
                  ${getHistoryTotalPnl().toFixed(2)}
                </Text>
              </Text>
            </View>

            {getFilteredHistory().length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No trade history</Text>
              </View>
            ) : (
              getFilteredHistory().map((trade) => (
                <TouchableOpacity
                  key={trade._id || trade.id}
                  style={[styles.historyItem, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}
                  onPress={() => { setHistoryDetailTrade(trade); setShowHistoryDetails(true); }}
                >
                  <View style={styles.historyHeader}>
                    <View style={styles.historyLeft}>
                      <Text style={[styles.historySymbol, { color: colors.textPrimary }]}>{trade.symbol}</Text>
                      <Text style={[styles.historySide, { color: trade.side === 'BUY' ? '#22c55e' : '#ef4444' }]}>{trade.side}</Text>
                      {trade.closedBy === 'ADMIN' && (
                        <View style={styles.adminBadge}>
                          <Text style={styles.adminBadgeText}>Admin Close</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.historyPnl, { color: (trade.realizedPnl || 0) >= 0 ? '#22c55e' : '#ef4444' }]}>
                      {(trade.realizedPnl || 0) >= 0 ? '+' : ''}${(trade.realizedPnl || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={[styles.historyDetail, { color: colors.textMuted }]}>{trade.quantity} lots</Text>
                    <Text style={[styles.historyDetail, { color: colors.textMuted }]}>{new Date(trade.closedAt).toLocaleDateString()}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>
      </View>

      {/* SL/TP Modal */}
      <Modal visible={showSlTpModal} animationType="slide" transparent onRequestClose={() => setShowSlTpModal(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.slTpModalOverlay}
        >
          <TouchableOpacity 
            style={styles.slTpModalBackdrop} 
            activeOpacity={1} 
            onPress={() => { Keyboard.dismiss(); setShowSlTpModal(false); }}
          />
          <View style={styles.slTpModalContent}>
            <View style={styles.slTpModalHandle} />
            <View style={styles.slTpModalHeader}>
              <Text style={styles.slTpModalTitle}>
                {selectedTrade?.symbol} - Set SL/TP
              </Text>
              <TouchableOpacity onPress={() => { setShowSlTpModal(false); Keyboard.dismiss(); }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.slTpInputGroup}>
              <Text style={styles.slTpLabel}>Stop Loss</Text>
              <TextInput
                style={styles.slTpInput}
                value={stopLoss}
                onChangeText={(text) => setStopLoss(text.replace(/[^0-9.]/g, ''))}
                placeholder="Enter stop loss price"
                placeholderTextColor="#666"
                keyboardType="numbers-and-punctuation"
                returnKeyType="next"
                autoCorrect={false}
                autoCapitalize="none"
                selectionColor="#5a189a"
                editable={true}
              />
            </View>
            
            <View style={styles.slTpInputGroup}>
              <Text style={styles.slTpLabel}>Take Profit</Text>
              <TextInput
                style={styles.slTpInput}
                value={takeProfit}
                onChangeText={(text) => setTakeProfit(text.replace(/[^0-9.]/g, ''))}
                placeholder="Enter take profit price"
                placeholderTextColor="#666"
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
                autoCorrect={false}
                autoCapitalize="none"
                selectionColor="#5a189a"
                editable={true}
                onSubmitEditing={updateSlTp}
              />
            </View>

            <View style={styles.slTpCurrentInfo}>
              <Text style={styles.slTpCurrentText}>
                Open: {selectedTrade?.openPrice?.toFixed(5) || '-'}
              </Text>
              <Text style={styles.slTpCurrentText}>
                {selectedTrade?.side || '-'} | {selectedTrade?.quantity || 0} lots
              </Text>
            </View>
            
            <View style={styles.slTpButtonRow}>
              <TouchableOpacity 
                style={styles.slTpClearBtn} 
                onPress={() => { setStopLoss(''); setTakeProfit(''); }}
              >
                <Text style={styles.slTpClearBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.slTpSaveBtn} onPress={updateSlTp}>
                <Text style={styles.slTpSaveBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Trade Details Modal */}
      <Modal visible={showTradeDetails} animationType="slide" transparent onRequestClose={() => setShowTradeDetails(false)}>
        <View style={styles.slTpModalOverlay}>
          <TouchableOpacity style={styles.slTpModalBackdrop} activeOpacity={1} onPress={() => setShowTradeDetails(false)} />
          <View style={[styles.tradeDetailsContent, { backgroundColor: colors.bgCard }]}>
            <View style={[styles.slTpModalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.slTpModalHeader}>
              <Text style={[styles.slTpModalTitle, { color: colors.textPrimary }]}>{detailTrade?.symbol} Trade Details</Text>
              <TouchableOpacity onPress={() => setShowTradeDetails(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            {detailTrade && (
              <ScrollView style={styles.tradeDetailsScroll}>
                {/* Trade ID & Status */}
                <View style={[styles.detailSection, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>Trade Info</Text>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Trade ID</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{detailTrade.tradeId}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Status</Text>
                    <Text style={[styles.detailValue, { color: '#22c55e' }]}>{detailTrade.status}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Side</Text>
                    <Text style={[styles.detailValue, { color: detailTrade.side === 'BUY' ? '#22c55e' : '#ef4444' }]}>{detailTrade.side}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Order Type</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{detailTrade.orderType}</Text>
                  </View>
                </View>

                {/* Position Details */}
                <View style={[styles.detailSection, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>Position</Text>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Volume</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{detailTrade.quantity} lots</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Open Price</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{detailTrade.openPrice?.toFixed(5)}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Current Price</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                      {(detailTrade.side === 'BUY' ? ctx.livePrices[detailTrade.symbol]?.bid : ctx.livePrices[detailTrade.symbol]?.ask)?.toFixed(5) || '-'}
                    </Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Contract Size</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{detailTrade.contractSize?.toLocaleString()}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Leverage</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>1:{detailTrade.leverage}</Text>
                  </View>
                </View>

                {/* SL/TP */}
                <View style={[styles.detailSection, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>Stop Loss / Take Profit</Text>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Stop Loss</Text>
                    <Text style={[styles.detailValue, { color: (detailTrade.sl || detailTrade.stopLoss) ? '#5a189a' : colors.textMuted }]}>
                      {detailTrade.sl || detailTrade.stopLoss || 'Not Set'}
                    </Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Take Profit</Text>
                    <Text style={[styles.detailValue, { color: (detailTrade.tp || detailTrade.takeProfit) ? '#22c55e' : colors.textMuted }]}>
                      {detailTrade.tp || detailTrade.takeProfit || 'Not Set'}
                    </Text>
                  </View>
                </View>

                {/* Charges */}
                <View style={[styles.detailSection, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>Charges</Text>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Margin Used</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>${detailTrade.marginUsed?.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Spread</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{detailTrade.spread || 0} pips</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Commission</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>${detailTrade.commission?.toFixed(2) || '0.00'}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Swap</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>${detailTrade.swap?.toFixed(2) || '0.00'}</Text>
                  </View>
                </View>

                {/* P&L */}
                <View style={[styles.detailSection, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>Profit & Loss</Text>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Floating P&L</Text>
                    <Text style={[styles.detailValue, { color: ctx.calculatePnl(detailTrade) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 'bold' }]}>
                      ${ctx.calculatePnl(detailTrade).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Time */}
                <View style={[styles.detailSection, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>Time</Text>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Opened At</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{new Date(detailTrade.openedAt || detailTrade.createdAt).toLocaleString()}</Text>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.detailActions}>
                  <TouchableOpacity 
                    style={styles.detailEditBtn} 
                    onPress={() => { setShowTradeDetails(false); openSlTpModal(detailTrade); }}
                  >
                    <Ionicons name="pencil" size={18} color="#5a189a" />
                    <Text style={styles.detailEditText}>Edit SL/TP</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.detailCloseBtn} 
                    onPress={() => { setShowTradeDetails(false); closeTrade(detailTrade); }}
                  >
                    <Ionicons name="close-circle" size={18} color="#fff" />
                    <Text style={styles.detailCloseText}>Close Trade</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Close All Confirmation Modal */}
      <Modal visible={showCloseAllModal} animationType="fade" transparent onRequestClose={() => setShowCloseAllModal(false)}>
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={[styles.confirmModalIcon, { backgroundColor: closeAllType === 'profit' ? '#5a189a20' : closeAllType === 'loss' ? '#5a189a20' : '#5a189a20' }]}>
              <Ionicons name={closeAllType === 'profit' ? 'trending-up' : closeAllType === 'loss' ? 'trending-down' : 'close-circle'} size={32} color={closeAllType === 'profit' ? '#5a189a' : closeAllType === 'loss' ? '#5a189a' : '#5a189a'} />
            </View>
            <Text style={styles.confirmModalTitle}>
              {closeAllType === 'all' && 'Close All Trades?'}
              {closeAllType === 'profit' && 'Close Winning Trades?'}
              {closeAllType === 'loss' && 'Close Losing Trades?'}
            </Text>
            <Text style={styles.confirmModalMessage}>
              {closeAllType === 'all' && `This will close all ${ctx.openTrades.length} open trade(s)`}
              {closeAllType === 'profit' && 'This will close all trades currently in profit'}
              {closeAllType === 'loss' && 'This will close all trades currently in loss'}
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setShowCloseAllModal(false)} disabled={isClosingAll}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.confirmCloseBtn, { backgroundColor: closeAllType === 'profit' ? '#5a189a' : closeAllType === 'loss' ? '#5a189a' : '#5a189a' }, isClosingAll && styles.btnDisabled]} 
                onPress={confirmCloseAll}
                disabled={isClosingAll}
              >
                <Text style={styles.confirmCloseText}>{isClosingAll ? 'Closing...' : 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* History Trade Details Modal */}
      <Modal visible={showHistoryDetails} animationType="slide" transparent onRequestClose={() => setShowHistoryDetails(false)}>
        <View style={styles.slTpModalOverlay}>
          <TouchableOpacity style={styles.slTpModalBackdrop} activeOpacity={1} onPress={() => setShowHistoryDetails(false)} />
          <View style={[styles.tradeDetailsContent, { backgroundColor: colors.bgCard }]}>
            <View style={[styles.slTpModalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.slTpModalHeader}>
              <Text style={[styles.slTpModalTitle, { color: colors.textPrimary }]}>{historyDetailTrade?.symbol} - Closed Trade</Text>
              <TouchableOpacity onPress={() => setShowHistoryDetails(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            {historyDetailTrade && (
              <ScrollView style={styles.tradeDetailsScroll}>
                {/* Trade Info */}
                <View style={[styles.detailSection, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>Trade Info</Text>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Trade ID</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{historyDetailTrade.tradeId}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Status</Text>
                    <Text style={[styles.detailValue, { color: colors.textMuted }]}>{historyDetailTrade.status}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Side</Text>
                    <Text style={[styles.detailValue, { color: historyDetailTrade.side === 'BUY' ? '#22c55e' : '#ef4444' }]}>{historyDetailTrade.side}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Order Type</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{historyDetailTrade.orderType}</Text>
                  </View>
                  {/* Closed By - Show for all close types */}
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Closed By</Text>
                    <Text style={[styles.detailValue, { 
                      color: historyDetailTrade.closedBy === 'STOP_OUT' ? '#ef4444' : 
                             historyDetailTrade.closedBy === 'SL' ? '#ef4444' : 
                             historyDetailTrade.closedBy === 'TP' ? '#22c55e' : 
                             historyDetailTrade.closedBy === 'ADMIN' ? '#f59e0b' : colors.textMuted
                    }]}>
                      {historyDetailTrade.closedBy === 'STOP_OUT' ? '⚠️ Stop Out (Equity Zero)' :
                       historyDetailTrade.closedBy === 'SL' ? '🔴 Stop Loss Hit' :
                       historyDetailTrade.closedBy === 'TP' ? '🟢 Take Profit Hit' :
                       historyDetailTrade.closedBy === 'ADMIN' ? '👤 Admin Close' :
                       historyDetailTrade.closedBy === 'USER' ? '👤 Manual Close' :
                       historyDetailTrade.closedBy || 'Manual Close'}
                    </Text>
                  </View>
                </View>

                {/* Position Details */}
                <View style={[styles.detailSection, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>Position</Text>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Volume</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{historyDetailTrade.quantity} lots</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Open Price</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{historyDetailTrade.openPrice?.toFixed(5)}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Close Price</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{historyDetailTrade.closePrice?.toFixed(5)}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Contract Size</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{historyDetailTrade.contractSize?.toLocaleString()}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Leverage</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>1:{historyDetailTrade.leverage}</Text>
                  </View>
                </View>

                {/* SL/TP */}
                <View style={[styles.detailSection, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>Stop Loss / Take Profit</Text>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Stop Loss</Text>
                    <Text style={[styles.detailValue, { color: (historyDetailTrade.sl || historyDetailTrade.stopLoss) ? '#5a189a' : colors.textMuted }]}>
                      {historyDetailTrade.sl || historyDetailTrade.stopLoss || 'Not Set'}
                    </Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Take Profit</Text>
                    <Text style={[styles.detailValue, { color: (historyDetailTrade.tp || historyDetailTrade.takeProfit) ? '#22c55e' : colors.textMuted }]}>
                      {historyDetailTrade.tp || historyDetailTrade.takeProfit || 'Not Set'}
                    </Text>
                  </View>
                </View>

                {/* Charges */}
                <View style={[styles.detailSection, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>Charges</Text>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Margin Used</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>${historyDetailTrade.marginUsed?.toFixed(2) || '0.00'}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Spread</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{historyDetailTrade.spread || 0} pips</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Commission</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>${historyDetailTrade.commission?.toFixed(2) || '0.00'}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Swap</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>${historyDetailTrade.swap?.toFixed(2) || '0.00'}</Text>
                  </View>
                </View>

                {/* P&L */}
                <View style={[styles.detailSection, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>Realized Profit & Loss</Text>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Realized P&L</Text>
                    <Text style={[styles.detailValue, { color: (historyDetailTrade.realizedPnl || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 'bold', fontSize: 18 }]}>
                      {(historyDetailTrade.realizedPnl || 0) >= 0 ? '+' : ''}${(historyDetailTrade.realizedPnl || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Time */}
                <View style={[styles.detailSection, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>Time</Text>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Opened At</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{new Date(historyDetailTrade.openedAt || historyDetailTrade.createdAt).toLocaleString()}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Closed At</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{new Date(historyDetailTrade.closedAt).toLocaleString()}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Duration</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                      {(() => {
                        const openTime = new Date(historyDetailTrade.openedAt || historyDetailTrade.createdAt);
                        const closeTime = new Date(historyDetailTrade.closedAt);
                        const diffMs = closeTime - openTime;
                        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                        return diffHrs > 0 ? `${diffHrs}h ${diffMins}m` : `${diffMins}m`;
                      })()}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
};

// HISTORY TAB
const HistoryTab = () => {
  const ctx = React.useContext(TradingContext);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await ctx.fetchTradeHistory();
    setRefreshing(false);
  };

  return (
    <FlatList
      style={styles.container}
      data={ctx.tradeHistory}
      keyExtractor={item => item._id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5a189a" />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={48} color="#666" />
          <Text style={styles.emptyText}>No trade history</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.historyItemFull}>
          <View style={styles.historyHeader}>
            <View style={styles.historyLeft}>
              <Text style={styles.historySymbol}>{item.symbol}</Text>
              <View style={[styles.sideBadge, { backgroundColor: item.side === 'BUY' ? '#22c55e20' : '#ef444420' }]}>
                <Text style={[styles.sideText, { color: item.side === 'BUY' ? '#22c55e' : '#ef4444' }]}>{item.side}</Text>
              </View>
              {item.closedBy === 'ADMIN' && (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>Admin Close</Text>
                </View>
              )}
            </View>
            <Text style={[styles.historyPnl, { color: (item.realizedPnl || 0) >= 0 ? '#22c55e' : '#ef4444' }]}>
              {(item.realizedPnl || 0) >= 0 ? '+' : ''}${(item.realizedPnl || 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.historyMeta}>
            <Text style={styles.historyMetaText}>{item.quantity} lots</Text>
            <Text style={styles.historyMetaText}>Open: {item.openPrice?.toFixed(5)}</Text>
            <Text style={styles.historyMetaText}>Close: {item.closePrice?.toFixed(5)}</Text>
          </View>
          <Text style={styles.historyDate}>{new Date(item.closedAt).toLocaleDateString()}</Text>
        </View>
      )}
    />
  );
};

/** Segments for Add Chart flow (match instrument `category` from API). */
const CHART_ADD_SYMBOL_SEGMENTS = ['Forex', 'Metals', 'Commodities', 'Crypto', 'Indices', 'Stocks'];

// CHART TAB - Full screen TradingView chart with multiple chart tabs
const ChartTab = ({ route }) => {
  const ctx = React.useContext(TradingContext);
  const { colors, isDark } = useTheme();
  const toast = useToast();
  
  // Get initial symbol from route params or default to XAUUSD (always uppercase for API / livePrices keys)
  const initialSymbol = String(route?.params?.symbol || 'XAUUSD').trim().toUpperCase();
  const [chartTabs, setChartTabs] = useState([{ symbol: initialSymbol, id: 1 }]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  /** Add Chart modal: pick segment first, then symbol */
  const [chartAddStep, setChartAddStep] = useState('segments');
  const [chartAddSegment, setChartAddSegment] = useState(null);
  
  // Handle symbol change from navigation params
  React.useEffect(() => {
    if (route?.params?.symbol) {
      const symbol = String(route.params.symbol).trim().toUpperCase();
      // Check if symbol already exists in tabs
      const existingTab = chartTabs.find(t => t.symbol === symbol);
      if (existingTab) {
        // Switch to existing tab
        setActiveTabId(existingTab.id);
      } else {
        // Add new tab with this symbol
        const newId = Math.max(...chartTabs.map(t => t.id)) + 1;
        setChartTabs(prev => [...prev, { symbol, id: newId }]);
        setActiveTabId(newId);
      }
    }
  }, [route?.params?.symbol]);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [orderSide, setOrderSide] = useState('BUY');
  const [volume, setVolume] = useState(0.01);
  const [volumeText, setVolumeText] = useState('0.01');
  const [isExecuting, setIsExecuting] = useState(false);
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [showChartSlModal, setShowChartSlModal] = useState(false);
  const [chartSlValue, setChartSlValue] = useState('');
  const [pendingChartTradeSide, setPendingChartTradeSide] = useState(null);
  
  // Get leverage from account
  const getAccountLeverage = () => {
    if (ctx.isChallengeMode && ctx.selectedChallengeAccount) {
      return ctx.selectedChallengeAccount.leverage || '1:100';
    }
    return ctx.selectedAccount?.leverage || ctx.selectedAccount?.accountTypeId?.leverage || '1:100';
  };

  const activeTab = chartTabs.find(t => t.id === activeTabId) || chartTabs[0];
  const activeSymbol = String(activeTab?.symbol || 'XAUUSD').trim().toUpperCase();

  const resetChartSymbolPicker = () => {
    setChartAddStep('segments');
    setChartAddSegment(null);
  };

  const addNewChartTab = (symbol) => {
    const sym = String(symbol || '').trim().toUpperCase();
    const newId = Math.max(...chartTabs.map(t => t.id)) + 1;
    setChartTabs([...chartTabs, { symbol: sym, id: newId }]);
    setActiveTabId(newId);
    setShowSymbolPicker(false);
    resetChartSymbolPicker();
  };

  const instrumentsInChartSegment = React.useMemo(() => {
    if (!chartAddSegment) return [];
    const list = ctx.instruments || [];
    return list
      .filter((i) => String(i.category || 'Forex') === chartAddSegment)
      .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
  }, [ctx.instruments, chartAddSegment]);

  const segmentSymbolCounts = React.useMemo(() => {
    const counts = {};
    CHART_ADD_SYMBOL_SEGMENTS.forEach((s) => { counts[s] = 0; });
    for (const inst of ctx.instruments || []) {
      const c = String(inst.category || 'Forex');
      if (counts[c] !== undefined) counts[c] += 1;
    }
    return counts;
  }, [ctx.instruments]);

  const removeChartTab = (id) => {
    if (chartTabs.length > 1) {
      const newTabs = chartTabs.filter(t => t.id !== id);
      setChartTabs(newTabs);
      if (activeTabId === id) {
        setActiveTabId(newTabs[0].id);
      }
    }
  };

  const currentInstrument =
    ctx.instruments.find((i) => String(i?.symbol || '').toUpperCase() === activeSymbol) || null;
  const liveTick = ctx.livePrices[activeSymbol] || ctx.livePrices[String(activeSymbol).toUpperCase()] || {};
  const bidNum = Number(liveTick.bid ?? currentInstrument?.bid ?? 0);
  const askNum = Number(liveTick.ask ?? currentInstrument?.ask ?? 0);
  const currentPrice = {
    bid: Number.isFinite(bidNum) && bidNum > 0 ? bidNum : 0,
    ask: Number.isFinite(askNum) && askNum > 0 ? askNum : 0,
  };
  const isForex = currentInstrument?.category === 'Forex';
  const decimals = isForex ? 5 : 2;

  const getSymbolForTradingView = (symbol) => {
    const symbolMap = {
      'EURUSD': 'OANDA:EURUSD', 'GBPUSD': 'OANDA:GBPUSD', 'USDJPY': 'OANDA:USDJPY',
      'USDCHF': 'OANDA:USDCHF', 'AUDUSD': 'OANDA:AUDUSD', 'NZDUSD': 'OANDA:NZDUSD',
      'USDCAD': 'OANDA:USDCAD', 'EURGBP': 'OANDA:EURGBP', 'EURJPY': 'OANDA:EURJPY',
      'GBPJPY': 'OANDA:GBPJPY', 'XAUUSD': 'OANDA:XAUUSD', 'XAGUSD': 'OANDA:XAGUSD',
      'BTCUSD': 'COINBASE:BTCUSD', 'ETHUSD': 'COINBASE:ETHUSD', 'LTCUSD': 'COINBASE:LTCUSD',
      'XRPUSD': 'BITSTAMP:XRPUSD', 'BNBUSD': 'BINANCE:BNBUSDT', 'SOLUSD': 'COINBASE:SOLUSD',
      'ADAUSD': 'COINBASE:ADAUSD', 'DOGEUSD': 'BINANCE:DOGEUSDT', 'DOTUSD': 'COINBASE:DOTUSD',
      'MATICUSD': 'COINBASE:MATICUSD', 'AVAXUSD': 'COINBASE:AVAXUSD', 'LINKUSD': 'COINBASE:LINKUSD',
    };
    return symbolMap[symbol] || `OANDA:${symbol}`;
  };

  const openOrderPanel = (side) => {
    setOrderSide(side);
    setShowOrderPanel(true);
  };

  // One-click trade execution - Fast execution (same endpoint as Quotes tab: /orders/)
  const executeOneClickTrade = async (side, slPrice = null) => {
    if (isExecuting) return;

    const hasValidAccount = ctx.isChallengeMode ? ctx.selectedChallengeAccount : ctx.selectedAccount;
    if (!ctx.user) {
      toast?.showToast('Please login first', 'error');
      return;
    }
    if (!hasValidAccount) {
      toast?.showToast('Please select a trading account first', 'error');
      return;
    }
    
    // Check if challenge mode with SL mandatory
    if (ctx.isChallengeMode && ctx.selectedChallengeAccount?.challengeId?.rules?.stopLossMandatory && !slPrice) {
      setPendingChartTradeSide(side);
      setChartSlValue('');
      setShowChartSlModal(true);
      return;
    }
    
    if (!currentPrice.bid || !currentPrice.ask || currentPrice.bid <= 0 || currentPrice.ask <= 0) {
      toast?.showToast('Market is closed or no price data available', 'error');
      return;
    }
    
    setIsExecuting(true);
    try {
      const price = side === 'BUY' ? currentPrice.ask : currentPrice.bid;
      
      const tradingAccountId = ctx.isChallengeMode && ctx.selectedChallengeAccount 
          ? (ctx.selectedChallengeAccount.id || ctx.selectedChallengeAccount._id)
          : (ctx.selectedAccount.id || ctx.selectedAccount._id);

      const orderData = {
        account_id: tradingAccountId,
        symbol: activeSymbol,
        side: side.toLowerCase(),
        order_type: 'market',
        lots: parseFloat(volume) || 0.01,
      };
      
      if (slPrice) orderData.stop_loss = parseFloat(slPrice);
      
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/orders/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(orderData)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data) {
        toast?.showToast(`${side} ${volume} ${activeSymbol} @ ${price.toFixed(decimals)}`, 'success');
        ctx.fetchOpenTrades();
        ctx.fetchPendingOrders?.();
        ctx.fetchAccountSummary();
      } else {
        toast?.showToast(data.detail || data.message || 'Failed to place order', 'error');
      }
    } catch (e) {
      toast?.showToast('Network error', 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const executeTrade = async () => {
    const hasValidAccount = ctx.isChallengeMode ? ctx.selectedChallengeAccount : ctx.selectedAccount;
    if (!ctx.user) {
      toast?.showToast('Please login first', 'error');
      return;
    }
    if (!hasValidAccount) {
      toast?.showToast('Please select a trading account first', 'error');
      return;
    }
    if (!currentPrice.bid || !currentPrice.ask || currentPrice.bid <= 0 || currentPrice.ask <= 0) {
      toast?.showToast('Market is closed or no price data available', 'error');
      return;
    }

    // Client-side validation for challenge account SL mandatory rule
    if (ctx.isChallengeMode && ctx.selectedChallengeAccount) {
      const rules = ctx.selectedChallengeAccount.challengeId?.rules;
      if (rules?.stopLossMandatory && !stopLoss) {
        Alert.alert('Stop Loss Required', 'Stop Loss is mandatory for this challenge. Please set SL before trading.');
        return;
      }
    }
    
    setIsExecuting(true);
    try {
      // Use challenge account ID if in challenge mode
      const tradingAccountId = ctx.isChallengeMode && ctx.selectedChallengeAccount 
        ? (ctx.selectedChallengeAccount.id || ctx.selectedChallengeAccount._id)
        : (ctx.selectedAccount?.id || ctx.selectedAccount?._id);
      
      const orderData = {
        account_id: tradingAccountId,
        symbol: activeSymbol,
        side: orderSide.toLowerCase(),
        order_type: 'market',
        lots: parseFloat(volume) || 0.01,
      };
      
      // Add SL/TP if set (TrustEdge uses stop_loss/take_profit)
      if (stopLoss) orderData.stop_loss = parseFloat(stopLoss);
      if (takeProfit) orderData.take_profit = parseFloat(takeProfit);
      
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/orders/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(orderData)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data) {
        toast?.showToast(`${orderSide} order placed!`, 'success');
        setShowOrderPanel(false);
        setStopLoss('');
        setTakeProfit('');
        ctx.fetchOpenTrades();
        ctx.fetchPendingOrders?.();
        ctx.fetchAccountSummary();
      } else {
        toast?.showToast(data.detail || data.message || 'Failed to place order', 'error');
      }
    } catch (e) {
      toast?.showToast('Network error', 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const chartTheme = isDark ? 'dark' : 'light';
  const chartBg = isDark ? '#121212' : '#ffffff';
  
  const chartHtml = `
    <!DOCTYPE html>
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>*{margin:0;padding:0;box-sizing:border-box;}html,body{height:100%;width:100%;background:${chartBg};overflow:hidden;}</style></head>
    <body>
    <div class="tradingview-widget-container" style="height:100%;width:100%">
      <div id="tradingview_chart" style="height:100%;width:100%"></div>
    </div>
    <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
    <script type="text/javascript">
    new TradingView.widget({
      "autosize": true,
      "symbol": "${getSymbolForTradingView(activeSymbol)}",
      "interval": "5",
      "timezone": "Etc/UTC",
      "theme": "${chartTheme}",
      "style": "1",
      "locale": "en",
      "toolbar_bg": "${chartBg}",
      "enable_publishing": false,
      "hide_top_toolbar": false,
      "hide_legend": false,
      "hide_side_toolbar": false,
      "save_image": false,
      "container_id": "tradingview_chart",
      "backgroundColor": "${chartBg}",
      "withdateranges": true,
      "allow_symbol_change": false,
      "details": true,
      "hotlist": false,
      "calendar": false,
      "show_popup_button": true,
      "popup_width": "1000",
      "popup_height": "650",
      "studies": [],
      "studies_overrides": {},
      "overrides": {
        "mainSeriesProperties.showPriceLine": true,
        "mainSeriesProperties.highLowAvgPrice.highLowPriceLinesVisible": true,
        "scalesProperties.showSeriesLastValue": true,
        "scalesProperties.showStudyLastValue": true,
        "paneProperties.legendProperties.showLegend": true,
        "paneProperties.legendProperties.showSeriesTitle": true,
        "paneProperties.legendProperties.showSeriesOHLC": true,
        "paneProperties.legendProperties.showBarChange": true
      }
    });
    </script></body></html>
  `;

  return (
    <View style={[styles.chartContainer, { backgroundColor: colors.bgPrimary }]}>
      {/* Top Bar - Multiple Chart Tabs */}
      <View style={[styles.chartTabsBar, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartTabsScroll}>
          {chartTabs.map(tab => (
            <TouchableOpacity 
              key={tab.id}
              style={[styles.chartTab, { backgroundColor: colors.bgCard }, activeTabId === tab.id && styles.chartTabActive]}
              onPress={() => setActiveTabId(tab.id)}
              onLongPress={() => removeChartTab(tab.id)}
            >
              <Text style={[styles.chartTabText, { color: colors.textMuted }, activeTabId === tab.id && styles.chartTabTextActive]}>
                {tab.symbol}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          style={styles.addChartBtn}
          onPress={() => {
            resetChartSymbolPicker();
            setShowSymbolPicker(true);
          }}
        >
          <Ionicons name="add" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Quick Trade Bar - Screenshot Style: SELL price | - lot + | BUY price (elevated so WebView does not steal touches on Android) */}
      <View style={[styles.quickTradeBarTop, { backgroundColor: colors.bgCard, borderBottomColor: colors.border, zIndex: 10, elevation: Platform.OS === 'android' ? 8 : 0 }]}>
        {/* SELL Button with Price */}
        <TouchableOpacity 
          style={[styles.sellPriceBtn, isExecuting && styles.btnDisabled]}
          onPress={() => executeOneClickTrade('SELL')}
          disabled={isExecuting}
        >
          <Text style={styles.sellLabel}>sell</Text>
          <Text style={styles.sellPrice}>{currentPrice?.bid?.toFixed(decimals) || '-'}</Text>
        </TouchableOpacity>

        {/* Lot Size with +/- */}
        <View style={[styles.lotControlCenter, { backgroundColor: colors.bgSecondary }]}>
          <TouchableOpacity style={styles.lotMinusBtn} onPress={() => { const v = Math.max(0.01, volume - 0.01); setVolume(v); setVolumeText(v.toFixed(2)); }}>
            <Text style={styles.lotControlText}>−</Text>
          </TouchableOpacity>
          <TextInput
            style={[styles.lotCenterInput, { color: colors.textPrimary }]}
            value={volumeText}
            onChangeText={(text) => {
              if (text === '' || /^\d*\.?\d*$/.test(text)) {
                setVolumeText(text);
                // Update volume state in real-time for valid numbers
                const val = parseFloat(text);
                if (!isNaN(val) && val > 0) {
                  setVolume(val);
                }
              }
            }}
            onBlur={() => {
              const val = parseFloat(volumeText);
              if (isNaN(val) || val <= 0) {
                setVolumeText('0.01');
                setVolume(0.01);
              } else {
                setVolume(val);
                setVolumeText(val.toFixed(2));
              }
            }}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <TouchableOpacity style={styles.lotPlusBtn} onPress={() => { const v = volume + 0.01; setVolume(v); setVolumeText(v.toFixed(2)); }}>
            <Text style={styles.lotControlText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* BUY Button with Price */}
        <TouchableOpacity 
          style={[styles.buyPriceBtn, isExecuting && styles.btnDisabled]}
          onPress={() => executeOneClickTrade('BUY')}
          disabled={isExecuting}
        >
          <Text style={styles.buyLabel}>buy</Text>
          <Text style={styles.buyPrice}>{currentPrice?.ask?.toFixed(decimals) || '-'}</Text>
        </TouchableOpacity>
      </View>

      {/* Full Screen Chart */}
      <View style={[styles.chartWrapper, { zIndex: 0 }]}>
        <WebView
          key={`${activeSymbol}-${isDark}`}
          source={{ html: chartHtml }}
          style={{ flex: 1, backgroundColor: chartBg }}
          javaScriptEnabled={true}
          scrollEnabled={false}
          androidLayerType="hardware"
        />
      </View>

      {/* Order Panel Slide Up */}
      <Modal visible={showOrderPanel} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.orderSlidePanel}>
            <View style={styles.orderPanelHandle} />
            <View style={styles.orderPanelHeader}>
              <Text style={styles.orderPanelTitle}>{activeSymbol}</Text>
              <TouchableOpacity onPress={() => setShowOrderPanel(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Side Toggle */}
            <View style={styles.sideToggle}>
              <TouchableOpacity 
                style={[styles.sideBtn, orderSide === 'SELL' && styles.sideBtnSell]}
                onPress={() => setOrderSide('SELL')}
              >
                <Text style={styles.sideBtnText}>SELL</Text>
                <Text style={styles.sideBtnPrice}>{currentPrice?.bid?.toFixed(decimals) || '-'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.sideBtn, orderSide === 'BUY' && styles.sideBtnBuy]}
                onPress={() => setOrderSide('BUY')}
              >
                <Text style={styles.sideBtnText}>BUY</Text>
                <Text style={styles.sideBtnPrice}>{currentPrice?.ask?.toFixed(decimals) || '-'}</Text>
              </TouchableOpacity>
            </View>

            {/* Volume */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Volume (Lots)</Text>
              <View style={styles.volumeInput}>
                <TouchableOpacity style={styles.volumeBtn} onPress={() => setVolume(Math.max(0.01, volume - 0.01))}>
                  <Ionicons name="remove" size={20} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.volumeValue}>{volume.toFixed(2)}</Text>
                <TouchableOpacity style={styles.volumeBtn} onPress={() => setVolume(volume + 0.01)}>
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* SL/TP for Challenge Accounts */}
            {ctx.isChallengeMode && ctx.selectedChallengeAccount && (
              <View style={styles.slTpRow}>
                <View style={styles.slTpInputGroup}>
                  <Text style={[styles.inputLabel, ctx.selectedChallengeAccount.challengeId?.rules?.stopLossMandatory && { color: '#f59e0b' }]}>
                    Stop Loss {ctx.selectedChallengeAccount.challengeId?.rules?.stopLossMandatory ? '*' : ''}
                  </Text>
                  <TextInput
                    style={[styles.slTpInput, { backgroundColor: '#333333', color: '#fff', borderColor: '#333' }]}
                    value={stopLoss}
                    onChangeText={(text) => setStopLoss(text.replace(/[^0-9.]/g, ''))}
                    placeholder="0.00"
                    placeholderTextColor="#666"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={styles.slTpInputGroup}>
                  <Text style={styles.inputLabel}>Take Profit</Text>
                  <TextInput
                    style={[styles.slTpInput, { backgroundColor: '#333333', color: '#fff', borderColor: '#333' }]}
                    value={takeProfit}
                    onChangeText={(text) => setTakeProfit(text.replace(/[^0-9.]/g, ''))}
                    placeholder="0.00"
                    placeholderTextColor="#666"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
            )}

            {/* Execute Button */}
            <TouchableOpacity 
              style={[styles.executeBtn, { backgroundColor: orderSide === 'BUY' ? '#22c55e' : '#ef4444' }, isExecuting && { opacity: 0.6 }]}
              onPress={executeTrade}
              disabled={isExecuting}
            >
              {isExecuting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.executeBtnText}>
                  {orderSide} {volume.toFixed(2)} {activeSymbol}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Symbol Picker Modal - segment first, then symbols (themed) */}
      <Modal
        visible={showSymbolPicker}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowSymbolPicker(false);
          resetChartSymbolPicker();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.symbolPickerModal, { backgroundColor: colors.bgCard }]}>
            <View style={[styles.symbolPickerHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.symbolPickerHeaderLeft}>
                {chartAddStep === 'symbols' ? (
                  <TouchableOpacity
                    onPress={() => {
                      setChartAddStep('segments');
                      setChartAddSegment(null);
                    }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={styles.symbolPickerBackBtn}
                  >
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                  </TouchableOpacity>
                ) : null}
                <Text style={[styles.symbolPickerTitle, { color: colors.textPrimary }]}>
                  {chartAddStep === 'segments' ? 'Add Chart' : chartAddSegment || 'Symbols'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowSymbolPicker(false);
                  resetChartSymbolPicker();
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {chartAddStep === 'segments'
                ? CHART_ADD_SYMBOL_SEGMENTS.map((seg) => (
                    <TouchableOpacity
                      key={seg}
                      style={[styles.chartAddSegmentRow, { borderBottomColor: colors.border }]}
                      onPress={() => {
                        setChartAddSegment(seg);
                        setChartAddStep('symbols');
                      }}
                    >
                      <Text style={[styles.chartAddSegmentLabel, { color: colors.textPrimary }]}>{seg}</Text>
                      <View style={styles.chartAddSegmentRight}>
                        <Text style={[styles.chartAddSegmentCount, { color: colors.textMuted, marginRight: 8 }]}>
                          {segmentSymbolCounts[seg] ?? 0}
                        </Text>
                        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                      </View>
                    </TouchableOpacity>
                  ))
                : instrumentsInChartSegment.length === 0 ? (
                    <View style={styles.chartAddEmptyWrap}>
                      <Text style={[styles.chartAddEmptyText, { color: colors.textMuted }]}>
                        No symbols in this segment
                      </Text>
                    </View>
                  ) : (
                    instrumentsInChartSegment.map((inst) => {
                      const onChart = chartTabs.some((t) => t.symbol === inst.symbol);
                      return (
                        <TouchableOpacity
                          key={inst.symbol}
                          style={[
                            styles.symbolPickerItem,
                            { borderBottomColor: colors.border },
                            onChart && { backgroundColor: isDark ? `${colors.primary}18` : `${colors.primary}14` },
                          ]}
                          onPress={() => addNewChartTab(inst.symbol)}
                        >
                          <View>
                            <Text style={[styles.symbolPickerSymbol, { color: colors.textPrimary }]}>{inst.symbol}</Text>
                            <Text style={[styles.symbolPickerName, { color: colors.textMuted }]}>{inst.name}</Text>
                          </View>
                          {onChart ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                        </TouchableOpacity>
                      );
                    })
                  )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Chart SL Modal for Challenge Accounts */}
      <Modal visible={showChartSlModal} animationType="fade" transparent onRequestClose={() => setShowChartSlModal(false)}>
        <View style={styles.quickSlModalOverlay}>
          <View style={[styles.quickSlModalContent, { backgroundColor: colors.bgCard }]}>
            <View style={styles.quickSlModalHeader}>
              <Ionicons name="warning" size={24} color="#f59e0b" />
              <Text style={[styles.quickSlModalTitle, { color: colors.textPrimary }]}>Stop Loss Required</Text>
            </View>
            <Text style={[styles.quickSlModalSubtitle, { color: colors.textMuted }]}>
              Stop Loss is mandatory for challenge accounts. Please set a stop loss price before placing your trade.
            </Text>
            
            <View style={styles.quickSlInputContainer}>
              <Text style={[styles.quickSlInputLabel, { color: colors.textMuted }]}>Stop Loss Price</Text>
              <TextInput
                style={[styles.quickSlInput, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                value={chartSlValue}
                onChangeText={(text) => setChartSlValue(text.replace(/[^0-9.]/g, ''))}
                placeholder={`e.g. ${pendingChartTradeSide === 'BUY' 
                  ? (currentPrice?.bid * 0.99)?.toFixed(decimals) 
                  : (currentPrice?.ask * 1.01)?.toFixed(decimals)}`}
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
              />
              <Text style={[styles.quickSlHint, { color: colors.textMuted }]}>
                Current {pendingChartTradeSide === 'BUY' ? 'Bid' : 'Ask'}: {pendingChartTradeSide === 'BUY' 
                  ? currentPrice?.bid?.toFixed(decimals) 
                  : currentPrice?.ask?.toFixed(decimals)}
              </Text>
            </View>

            <View style={styles.quickSlModalButtons}>
              <TouchableOpacity 
                style={[styles.quickSlCancelBtn, { backgroundColor: colors.bgSecondary }]}
                onPress={() => {
                  setShowChartSlModal(false);
                  setPendingChartTradeSide(null);
                  setChartSlValue('');
                }}
              >
                <Text style={[styles.quickSlCancelBtnText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.quickSlConfirmBtn, { backgroundColor: pendingChartTradeSide === 'BUY' ? '#22c55e' : '#ef4444' }]}
                onPress={() => {
                  if (!chartSlValue || isNaN(parseFloat(chartSlValue))) {
                    toast?.showToast('Please enter a valid stop loss price', 'warning');
                    return;
                  }
                  setShowChartSlModal(false);
                  // Execute trade with SL
                  executeOneClickTrade(pendingChartTradeSide, chartSlValue);
                  setPendingChartTradeSide(null);
                  setChartSlValue('');
                }}
              >
                <Text style={styles.quickSlConfirmBtnText}>
                  {pendingChartTradeSide === 'BUY' ? 'BUY' : 'SELL'} with SL
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// MORE TAB - Matching screenshot exactly
const MoreTab = ({ navigation }) => {
  const ctx = React.useContext(TradingContext);
  const { colors, isDark, toggleTheme } = useTheme();
  const parentNav = navigation.getParent();

  const menuItems = [
    { icon: 'book-outline', label: 'Orders', screen: 'OrderBook', isTab: false, color: colors.primary },
    { icon: 'wallet-outline', label: 'Wallet', screen: 'Wallet', isTab: false, color: colors.primary },
    { icon: 'bar-chart-outline', label: 'PAMM / MAM', screen: 'Pamm', isTab: false, color: '#06b6d4' },
    { icon: 'calculator-outline', label: 'Risk Calculator', screen: 'RiskCalculator', isTab: false, color: '#f59e0b' },
    { icon: 'calendar-outline', label: 'Economic Calendar', screen: 'EconomicCalendar', isTab: false, color: '#ef4444' },
    { icon: 'school-outline', label: 'Academy', screen: 'Academy', isTab: false, color: '#2196f3' },
    { icon: 'receipt-outline', label: 'Transaction History', screen: 'TransactionHistory', isTab: false, color: '#a855f7' },
    { icon: 'people-circle-outline', label: 'Social', screen: 'Social', isTab: false, color: colors.primary },
    { icon: 'briefcase-outline', label: 'Business', screen: 'Business', params: { initialTab: 'ib' }, isTab: false, color: colors.primary },
    { icon: 'person-outline', label: 'Profile', screen: 'Profile', isTab: false, color: colors.primary },
    { icon: 'help-circle-outline', label: 'Support', screen: 'Support', isTab: false, color: colors.primary },
    { icon: 'document-text-outline', label: 'Instructions', screen: 'Instructions', isTab: false, color: colors.primary },
  ];

  const handleNavigate = (screen, isTab, params) => {
    if (isTab) {
      navigation.navigate(screen, params);
    } else if (parentNav) {
      parentNav.navigate(screen, params);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.moreMenuHeader, { backgroundColor: colors.bgPrimary }]}>
        <Text style={[styles.moreMenuTitle, { color: colors.textPrimary }]}>More</Text>
      </View>

      {/* Menu Items */}
      <ScrollView style={styles.moreMenuList}>
        {menuItems.map((item, index) => (
          <TouchableOpacity key={index} style={[styles.moreMenuItem, { borderBottomColor: colors.border }]} onPress={() => handleNavigate(item.screen, item.isTab, item.params)}>
            <View style={[styles.moreMenuIcon, { backgroundColor: `${item.color}20` }]}>
              <Ionicons name={item.icon} size={20} color={item.color} />
            </View>
            <Text style={[styles.moreMenuItemText, { color: colors.textPrimary }]}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}

        {/* Dark/Light Mode Toggle */}
        <View style={[styles.themeToggleItem, { borderBottomColor: colors.border }]}>
          <View style={[styles.moreMenuIcon, { backgroundColor: `${colors.primary}20` }]}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={colors.primary} />
          </View>
          <Text style={[styles.moreMenuItemText, { color: colors.textPrimary }]}>Dark Mode</Text>
          <TouchableOpacity 
            style={[styles.themeToggle, { backgroundColor: isDark ? colors.primary : colors.border }, isDark && styles.themeToggleActive]}
            onPress={toggleTheme}
          >
            <View style={[styles.themeToggleThumb, isDark && styles.themeToggleThumbActive]} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={[styles.moreMenuItem, { borderBottomColor: colors.border }]} onPress={ctx.logout}>
          <View style={[styles.moreMenuIcon, { backgroundColor: `${colors.primary}20` }]}>
            <Ionicons name="log-out-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.moreMenuItemText, { color: colors.primary }]}>Log Out</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

// Tab Navigator with theme support
const ThemedTabNavigator = () => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const ctx = React.useContext(TradingContext);

  const bottomPadding = Math.max(insets.bottom, 10);
  const tabActive = isDark ? '#50A5F1' : colors.primary;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 58 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 6,
          elevation: 0,
        },
        tabBarActiveTintColor: tabActive,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginBottom: 2 },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Markets') iconName = focused ? 'stats-chart' : 'stats-chart-outline';
          else if (route.name === 'Chart') iconName = focused ? 'analytics' : 'analytics-outline';
          else if (route.name === 'Trade') iconName = focused ? 'trending-up' : 'trending-up-outline';
          else if (route.name === 'More') iconName = focused ? 'menu' : 'menu-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
      screenListeners={({ route }) => ({
        tabPress: () => {
          ctx.setCurrentMainTab(route.name);
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeTab} />
      <Tab.Screen name="Markets" component={QuotesTab} />
      <Tab.Screen name="Chart" component={ChartTab} />
      <Tab.Screen name="Trade" component={TradeTab} />
      <Tab.Screen name="More" component={MoreTab} />
    </Tab.Navigator>
  );
};

// MAIN SCREEN
const MainTradingScreen = ({ navigation, route }) => {
  return (
    <ToastProvider>
      <TradingProvider navigation={navigation} route={route}>
        <ThemedTabNavigator />
      </TradingProvider>
    </ToastProvider>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  tabBar: { backgroundColor: '#121212', borderTopColor: '#333333', height: 60, paddingBottom: 8 },
  
  // Banner Slider
  bannerContainer: { marginHorizontal: 16, marginBottom: 16, borderRadius: 12, overflow: 'hidden' },
  bannerSlide: { width: Dimensions.get('window').width - 32, height: 140 },
  bannerImage: { width: '100%', height: '100%', borderRadius: 12 },
  bannerDots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', position: 'absolute', bottom: 10, left: 0, right: 0, gap: 6 },
  bannerDot: { width: 8, height: 8, borderRadius: 4 },

  // Home
  homeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50 },
  greeting: { color: '#666', fontSize: 14 },
  userName: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  notificationBtn: { padding: 10, backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#222', position: 'relative' },
  notificationBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#ef4444', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  notificationBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  
  accountCard: { margin: 16, padding: 16, backgroundColor: '#141414', borderRadius: 16, borderWidth: 1, borderColor: '#1e1e1e' },
  accountCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  accountIconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#5a189a20', justifyContent: 'center', alignItems: 'center' },
  accountInfo: { flex: 1, marginLeft: 12 },
  accountId: { color: '#fff', fontSize: 16, fontWeight: '600' },
  accountType: { color: '#666', fontSize: 12, marginTop: 2 },
  challengeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  challengeBadgeText: { fontSize: 10, fontWeight: '700' },
  challengeInfoBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  challengeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  challengeInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  challengeInfoRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  challengeInfoName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 120,
  },
  challengeInfoPhase: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
  },
  challengeInfoLabel: {
    color: '#888',
    fontSize: 11,
  },
  challengeInfoValue: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  failedReasonContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#ef444420', 
    padding: 12, 
    borderRadius: 10, 
    marginBottom: 12,
    gap: 8
  },
  failedReasonText: { 
    color: '#ef4444', 
    fontSize: 13, 
    flex: 1,
    fontWeight: '500'
  },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  balanceLabel: { color: '#666', fontSize: 11, marginBottom: 2 },
  balanceValue: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  equityValue: { fontSize: 20, fontWeight: 'bold' },
  pnlRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1e1e1e' },
  pnlValue: { fontSize: 16, fontWeight: '600' },
  freeMarginValue: { fontSize: 16, fontWeight: '600' },
  cardActionButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16, borderTopWidth: 1, borderTopColor: '#1e1e1e' },
  statItem: { flex: 1 },
  statLabel: { color: '#666', fontSize: 12, marginBottom: 4 },
  statValue: { color: '#fff', fontSize: 16, fontWeight: '600' },
  
  // Deposit/Withdraw Buttons
  actionButtons: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 },
  depositBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#5a189a', borderRadius: 12 },
  depositBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  withdrawBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#0f0f0f', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a2a' },
  withdrawBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  
  // Quick Actions Grid - 8 stylish buttons
  quickActionsGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    paddingHorizontal: 16, 
    paddingVertical: 12,
    justifyContent: 'space-between'
  },
  quickActionBtn: { 
    width: '23%', 
    alignItems: 'center', 
    paddingVertical: 14,
    marginBottom: 12
  },
  quickActionBtnLabel: { 
    color: '#a0a0a0', 
    fontSize: 11, 
    fontWeight: '500', 
    marginTop: 6 
  },
  // Legacy styles (kept for compatibility)
  quickActionsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  quickActionCard: { flex: 1, alignItems: 'center', paddingVertical: 16, backgroundColor: '#1E1E1E', borderRadius: 12, borderWidth: 1, borderColor: '#333333' },
  quickActionIconBg: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickActionLabel: { color: '#fff', fontSize: 11, fontWeight: '500' },
  
  // Section Header
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  seeAllText: { color: '#5a189a', fontSize: 13, fontWeight: '500' },
  
  // Copy Trade Masters Section
  mastersSection: { marginHorizontal: 16, marginTop: 16 },
  mastersScroll: { marginLeft: -4 },
  masterCard: { 
    width: 100, 
    backgroundColor: '#0f0f0f', 
    borderRadius: 12, 
    padding: 12, 
    marginLeft: 8, 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333'
  },
  masterCardHeader: { position: 'relative', marginBottom: 8 },
  masterAvatar: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    backgroundColor: '#5a189a30', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  masterAvatarText: { color: '#5a189a', fontSize: 18, fontWeight: 'bold' },
  followingBadgeSmall: { 
    position: 'absolute', 
    bottom: -2, 
    right: -2, 
    width: 18, 
    height: 18, 
    borderRadius: 9, 
    backgroundColor: '#22c55e20', 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#111'
  },
  masterName: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  masterProfit: { color: '#22c55e', fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  masterFollowers: { color: '#666', fontSize: 10, marginTop: 2 },
  
  // Market Data Section
  marketDataSection: { marginHorizontal: 16, marginTop: 20 },
  marketTabs: { flexDirection: 'row', backgroundColor: '#0f0f0f', borderRadius: 10, padding: 4, marginBottom: 12 },
  marketTab: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 4, 
    paddingVertical: 8, 
    borderRadius: 8 
  },
  marketTabActive: { backgroundColor: '#5a189a' },
  marketTabText: { color: '#888', fontSize: 12, fontWeight: '600' },
  marketTabTextActive: { color: '#fff' },
  marketList: {},
  marketItem: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: '#333333' 
  },
  marketItemLeft: {},
  marketSymbol: { color: '#fff', fontSize: 14, fontWeight: '600' },
  marketName: { color: '#666', fontSize: 11, marginTop: 2, maxWidth: 150 },
  marketItemRight: { alignItems: 'flex-end' },
  marketPrice: { color: '#fff', fontSize: 14, fontWeight: '600' },
  changeBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 2, 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 4, 
    marginTop: 4 
  },
  changeText: { fontSize: 11, fontWeight: '600' },
  
  // Empty Watchlist Home
  emptyWatchlistHome: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  emptyWatchlistHomeText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 10,
  },
  emptyWatchlistHomeHint: {
    color: '#555',
    fontSize: 12,
    marginTop: 4,
  },

  sparklineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 32,
    gap: 2,
    marginTop: 8,
    alignSelf: 'stretch',
  },
  sparklineBar: { flex: 1, borderRadius: 1, opacity: 0.9 },

  vantageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  vantageHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vantageHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vantageLogoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vantageLogoLetter: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  liveChipText: { fontSize: 14, fontWeight: '600' },
  headerIconBtn: { padding: 10 },

  verifyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 8,
  },
  verifyStripText: { flex: 1, fontSize: 13, fontWeight: '500' },
  verifyStripCta: { color: '#fb923c', fontSize: 13, fontWeight: '700' },

  heroBlock: { paddingHorizontal: 20, paddingBottom: 16 },
  heroEquityLabel: { fontSize: 13, marginBottom: 4 },
  heroEquityValue: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  heroHeadline: { fontSize: 17, fontWeight: '700', marginTop: 14, lineHeight: 22 },
  heroSub: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  heroWelcome: { fontSize: 14, marginTop: 10 },
  heroSetupBtn: {
    marginTop: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  heroSetupBtnText: { fontSize: 16, fontWeight: '700' },

  vantageQuickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  vantageQuickItem: { flex: 1, alignItems: 'center', maxWidth: '25%' },
  vantageQuickIconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  vantageQuickLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  copyTradingTitle: { fontSize: 17, fontWeight: '700' },
  masterCardVantage: {
    width: 148,
    borderRadius: 14,
    padding: 12,
    marginLeft: 10,
    borderWidth: 1,
    alignItems: 'stretch',
  },
  masterCardTopRow: { position: 'relative', marginBottom: 8, alignSelf: 'stretch' },
  masterNameVantage: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  masterReturnPct: { fontSize: 20, fontWeight: '800' },
  masterReturnLabel: { fontSize: 11, marginTop: 2 },

  vantageMarketTabsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    marginBottom: 14,
    gap: 20,
  },
  vantageMarketTabHit: { paddingBottom: 8 },
  vantageMarketTabText: { fontSize: 15 },
  vantageMarketTabUnderline: { height: 3, borderRadius: 2, marginTop: 6 },

  marketGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  marketGridCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 4,
  },
  gridSymbol: { fontSize: 15, fontWeight: '700' },
  gridName: { fontSize: 11, marginTop: 2 },
  gridBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  gridCategory: { fontSize: 11, fontWeight: '500', flex: 1 },
  gridPrice: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  gridChangePill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  addWatchlistPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    alignSelf: 'center',
    paddingHorizontal: 22,
  },
  addWatchlistPillText: { fontSize: 15, fontWeight: '600' },
  
  // Master Detail Modal
  masterDetailModal: { 
    backgroundColor: '#111', 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    padding: 20, 
    paddingBottom: 40,
    maxHeight: '80%'
  },
  modalHandle: { width: 40, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  masterModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  masterModalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  masterProfileCard: { alignItems: 'center', marginBottom: 20 },
  masterProfileAvatar: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: '#5a189a30', 
    justifyContent: 'center', 
    alignItems: 'center',
    marginBottom: 12
  },
  masterProfileAvatarText: { color: '#5a189a', fontSize: 32, fontWeight: 'bold' },
  masterProfileName: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  masterProfileBio: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 8, paddingHorizontal: 20 },
  followingBadgeLarge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    backgroundColor: '#22c55e20', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 20, 
    marginTop: 12 
  },
  followingBadgeLargeText: { color: '#22c55e', fontSize: 12, fontWeight: '600' },
  masterStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  masterStatBox: { 
    flex: 1, 
    minWidth: '45%', 
    backgroundColor: '#121212', 
    borderRadius: 12, 
    padding: 14, 
    alignItems: 'center' 
  },
  masterStatLabel: { color: '#666', fontSize: 11 },
  masterStatValue: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  followMasterBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8, 
    backgroundColor: '#5a189a', 
    paddingVertical: 14, 
    borderRadius: 12 
  },
  followMasterBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  alreadyFollowingBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8, 
    backgroundColor: '#22c55e20', 
    paddingVertical: 14, 
    borderRadius: 12 
  },
  alreadyFollowingText: { color: '#22c55e', fontSize: 14, fontWeight: '600' },
  viewFullProfileBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 6, 
    marginTop: 16, 
    paddingVertical: 12 
  },
  viewFullProfileText: { color: '#5a189a', fontSize: 14, fontWeight: '600' },
  
  // MarketWatch News Section
  marketWatchSection: { marginHorizontal: 16, marginTop: 16 },
  marketWatchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  marketWatchTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marketWatchTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ef444420', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444', marginRight: 4 },
  liveText: { color: '#ef4444', fontSize: 10, fontWeight: '700' },
  newsCardsContainer: { paddingRight: 16, gap: 12 },
  newsCardsVertical: { gap: 16 },
  newsCard: { width: 280, backgroundColor: '#111', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
  newsCardVertical: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#222', marginBottom: 12 },
  newsCardFull: { width: '100%', backgroundColor: '#111', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
  newsCardImage: { width: '100%', height: 180, backgroundColor: '#333333' },
  newsCardImageVertical: { width: 140, height: 140, backgroundColor: '#333333' },
  newsCardImageFull: { width: '100%', height: 200, backgroundColor: '#333333' },
  newsCardContent: { padding: 14 },
  newsCardContentVertical: { flex: 1, padding: 14, justifyContent: 'space-between' },
  newsCardContentFull: { padding: 14 },
  newsCardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  newsCategoryBadge: { backgroundColor: '#5a189a20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  newsCategoryText: { color: '#5a189a', fontSize: 11, fontWeight: '600' },
  newsTime: { color: '#666', fontSize: 11 },
  newsCardTitle: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 6 },
  newsCardDesc: { color: '#888', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  newsCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  newsSource: { color: '#888', fontSize: 11, flex: 1 },
  newsLoadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 10 },
  newsLoadingText: { color: '#666', fontSize: 14 },
  marketWatchNewsContainer: { height: 450, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  marketWatchWebView: { flex: 1, backgroundColor: 'transparent' },
  newsListContainer: { gap: 12 },
  newsCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  newsTimeText: { color: '#666', fontSize: 11 },
  newsCardSummary: { color: '#888', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  newsSourceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  newsSourceText: { color: '#888', fontSize: 12 },
  
  // Positions Card
  positionsCard: { margin: 16, padding: 16, backgroundColor: '#1E1E1E', borderRadius: 16, borderWidth: 1, borderColor: '#333333' },
  positionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  positionsTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  positionsCount: { color: '#5a189a', fontSize: 14 },
  noPositionsText: { color: '#666', fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  positionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#1E1E1E', borderRadius: 12, marginBottom: 8 },
  positionSide: { fontSize: 12, marginTop: 2 },
  positionPnlValue: { fontSize: 16, fontWeight: '600' },
  viewAllText: { color: '#5a189a', fontSize: 14, textAlign: 'center', paddingTop: 8 },
  
  // News Section (Home Tab)
  newsSection: { margin: 16, marginTop: 8 },
  newsSectionTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 12 },
  newsTabs: { flexDirection: 'row', backgroundColor: '#1E1E1E', borderRadius: 12, padding: 4, marginBottom: 12, borderWidth: 1, borderColor: '#333333' },
  newsTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  newsTabActive: { backgroundColor: '#1E1E1E' },
  newsTabText: { color: '#666', fontSize: 12, fontWeight: '500' },
  newsTabTextActive: { color: '#5a189a' },
  newsContent: {},
  newsItem: { backgroundColor: '#1E1E1E', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#333333' },
  newsCategory: { backgroundColor: '#5a189a20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 8 },
  newsCategoryText: { color: '#5a189a', fontSize: 11, fontWeight: '600' },
  newsTitle: { color: '#fff', fontSize: 14, fontWeight: '500', lineHeight: 20, marginBottom: 8 },
  newsMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  newsSource: { color: '#888', fontSize: 12 },
  newsTime: { color: '#666', fontSize: 12 },
  calendarContent: { backgroundColor: '#1E1E1E', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#333333' },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#1E1E1E', borderBottomWidth: 1, borderBottomColor: '#333333' },
  calendarHeaderText: { color: '#666', fontSize: 11, fontWeight: '600', width: 50, textAlign: 'center' },
  calendarRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#333333' },
  calendarTime: { color: '#fff', fontSize: 12, fontWeight: '500', width: 50, textAlign: 'center' },
  currencyBadge: { backgroundColor: '#5a189a20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, width: 50, alignItems: 'center' },
  currencyText: { color: '#5a189a', fontSize: 11, fontWeight: '600' },
  eventName: { color: '#fff', fontSize: 13, fontWeight: '500' },
  eventForecast: { color: '#666', fontSize: 10, marginTop: 2 },
  impactDot: { width: 10, height: 10, borderRadius: 5 },
  
  // TradingView Widget Container
  tradingViewContainer: { height: 700, backgroundColor: '#1E1E1E', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#333333' },
  tradingViewWebView: { flex: 1, backgroundColor: '#1E1E1E' },
  webViewLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E1E1E' },
  webViewLoadingText: { color: '#666', fontSize: 12, marginTop: 8 },
  
  section: { padding: 16 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 12 },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#666', marginTop: 12 },
  
  tradeItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#1E1E1E', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#333333' },
  tradeLeft: {},
  tradeSymbol: { color: '#fff', fontSize: 16, fontWeight: '600' },
  tradeSide: { fontSize: 12, marginTop: 4 },
  tradePnl: { fontSize: 16, fontWeight: '600' },
  
  // Quotes/Market - Venta Black Style (Responsive)
  searchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginHorizontal: 12, 
    marginTop: 50, 
    marginBottom: 10, 
    paddingHorizontal: 12, 
    paddingVertical: 10, 
    backgroundColor: '#1E1E1E', 
    borderRadius: 10,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#333333',
  },
  searchInput: { flex: 1, marginLeft: 8, color: '#fff', fontSize: 14, paddingVertical: 0 },
  
  // Market Section - New Styles
  marketSearchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginHorizontal: 12, 
    marginTop: 50, 
    marginBottom: 12, 
    paddingHorizontal: 14, 
    paddingVertical: 12, 
    backgroundColor: '#1E1E1E', 
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  marketTabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 4,
  },
  marketTabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  marketTabBtnActive: {
    backgroundColor: '#5a189a',
  },
  marketTabText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  marketTabTextActive: {
    color: '#ffffff',
  },
  marketContent: {
    flex: 1,
    paddingHorizontal: 12,
  },
  emptyWatchlist: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyWatchlistTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyWatchlistText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  segmentContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333333',
  },
  segmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  segmentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  segmentTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  segmentCount: {
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  segmentCountText: {
    color: '#666',
    fontSize: 12,
  },
  segmentInstruments: {
    borderTopWidth: 1,
  },
  categoriesContainer: { paddingHorizontal: 10, marginBottom: 8, height: 40 },
  categoryBtn: { 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    marginRight: 6, 
    borderRadius: 16, 
    backgroundColor: '#1E1E1E',
    height: 34,
    justifyContent: 'center',
    minWidth: 50,
    borderWidth: 1,
    borderColor: '#333333',
  },
  categoryBtnActive: { backgroundColor: '#5a189a' },
  categoryText: { color: '#666', fontSize: 12, fontWeight: '500' },
  categoryTextActive: { color: '#000', fontWeight: '600' },
  
  instrumentItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 12, 
    paddingVertical: 12, 
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  starBtn: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  instrumentInfo: { flex: 1, marginLeft: 8 },
  instrumentSymbol: { color: '#fff', fontSize: 14, fontWeight: '600' },
  instrumentName: { color: '#666', fontSize: 10, marginTop: 2 },
  instrumentPriceCol: { width: 60, alignItems: 'center' },
  bidPrice: { color: '#5a189a', fontSize: 13, fontWeight: '500' },
  askPrice: { color: '#ef4444', fontSize: 13, fontWeight: '500' },
  priceLabel: { color: '#666', fontSize: 9, marginTop: 1 },
  spreadBadgeCol: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4, marginHorizontal: 4, minWidth: 32, alignItems: 'center', borderWidth: 1 },
  spreadBadgeText: { color: '#5a189a', fontSize: 11, fontWeight: '600' },
  chartIconBtn: { 
    width: 32, 
    height: 32, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderRadius: 8,
    borderWidth: 1,
  },
  
  // Chart Trading Panel - One Click Buy/Sell
  chartTradingPanel: { backgroundColor: '#1E1E1E', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 16 },
  chartVolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  chartVolMinusBtn: { width: 36, height: 36, backgroundColor: '#1E1E1E', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  chartVolPlusBtn: { width: 36, height: 36, backgroundColor: '#1E1E1E', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  chartVolDisplay: { alignItems: 'center', marginHorizontal: 16, minWidth: 80 },
  chartVolLabel: { color: '#666', fontSize: 10 },
  chartVolValue: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  chartTradeButtons: { flexDirection: 'row', gap: 10 },
  chartSellButton: { flex: 1, backgroundColor: '#ef4444', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  chartBuyButton: { flex: 1, backgroundColor: '#22c55e', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  chartSellLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  chartBuyLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  chartSellPrice: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  chartBuyPrice: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  chartSpreadText: { color: '#666', fontSize: 11, textAlign: 'center', marginTop: 8 },
  
  // Order Panel - Slide from Bottom (Fixed - positioned at bottom)
  orderModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  orderPanelBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  orderPanelScroll: { maxHeight: height * 0.85 },
  orderPanelContainer: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 },
  orderPanelHandle: { width: 40, height: 4, backgroundColor: '#1E1E1E', borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 12 },
  orderPanelHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  orderPanelSymbol: { color: '#fff', fontSize: 16, fontWeight: '600' },
  orderPanelName: { color: '#666', fontSize: 12, marginTop: 2 },
  orderCloseBtn: { padding: 6 },
  leverageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E1E1E', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  leverageLabel: { color: '#888', fontSize: 12 },
  leverageValue: { color: '#5a189a', fontSize: 14, fontWeight: 'bold' },
  quickTradeRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  quickSellBtn: { flex: 1, backgroundColor: '#ef4444', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  quickBuyBtn: { flex: 1, backgroundColor: '#22c55e', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  quickBtnLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  quickBtnPrice: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  btnDisabled: { opacity: 0.5 },
  spreadInfoRow: { alignItems: 'center', marginBottom: 10 },
  spreadInfoText: { color: '#666', fontSize: 11 },
  slMandatoryBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.15)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 10, gap: 8 },
  slMandatoryText: { color: '#f59e0b', fontSize: 12, flex: 1 },
  orderTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  orderTypeBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  orderTypeBtnActive: { backgroundColor: '#5a189a' },
  orderTypeBtnText: { fontSize: 13, fontWeight: '600' },
  orderTypeBtnTextActive: { color: '#fff' },
  pendingTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  pendingTypeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  pendingTypeBtnActive: { borderColor: '#5a189a' },
  pendingTypeText: { color: '#666', fontSize: 12 },
  pendingTypeTextActive: { color: '#5a189a' },
  inputSection: { marginBottom: 10 },
  inputLabel: { color: '#888', fontSize: 11, marginBottom: 4 },
  priceInput: { backgroundColor: '#1E1E1E', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 15 },
  volumeControlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  volumeControlBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#5a189a', borderRadius: 8 },
  volumeInputField: { flex: 1, backgroundColor: '#1E1E1E', borderRadius: 8, paddingVertical: 10, textAlign: 'center', color: '#fff', fontSize: 15 },
  slTpRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  slTpCol: { flex: 1 },
  slTpInputOrder: { backgroundColor: '#1E1E1E', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 14 },
  finalTradeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  finalSellBtn: { flex: 1, backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  finalBuyBtn: { flex: 1, backgroundColor: '#22c55e', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  finalBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  spreadBadge: { backgroundColor: '#1E1E1E', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginHorizontal: 8, borderWidth: 1, borderColor: '#333333' },
  spreadText: { color: '#5a189a', fontSize: 10 },
  
  // Trade
  priceBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#1E1E1E' },
  currentSymbol: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  currentName: { color: '#666', fontSize: 12 },
  priceDisplay: { flexDirection: 'row', gap: 16 },
  bidPriceMain: { color: '#5a189a', fontSize: 16, fontWeight: '600' },
  askPriceMain: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  
  // Trade tab — dashboard (web-style)
  tradeDashRoot: { flex: 1 },
  tradeSummaryStrip: { flexGrow: 0 },
  tradeSummaryStripContent: { flexDirection: 'row', alignItems: 'stretch', gap: 10, paddingHorizontal: 12 },
  tradeStatPill: { minWidth: 108, maxWidth: 140, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  tradeStatLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  tradeStatValue: { fontSize: 15, fontWeight: '700' },
  tradeDashCard: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  tradeDashTabsRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tradeDashTabHit: { flex: 1, alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  tradeDashTabLabel: { fontSize: 14 },
  tradeDashTabUnderline: { height: 3, width: '72%', borderRadius: 2, marginTop: 8 },
  tradeDashTabUnderlinePlaceholder: { height: 3, marginTop: 8, opacity: 0 },
  tradeToolbarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  tradeToolOutlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  tradeToolBtnLabel: { fontSize: 13, fontWeight: '600' },
  tradeHScroll: { flexGrow: 0 },
  tradeTableHeaderRow: { flexDirection: 'row', alignItems: 'center', minHeight: 38, borderBottomWidth: StyleSheet.hairlineWidth },
  tradeThCell: { paddingHorizontal: 6, justifyContent: 'center', paddingVertical: 8 },
  tradeThText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  tradeTableRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, paddingHorizontal: 4 },
  tradeTableRowInner: { flexDirection: 'row', alignItems: 'center' },
  tradeTableRowTouch: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  tradeTdCell: { paddingHorizontal: 6, justifyContent: 'center', paddingVertical: 4 },
  tradeTdText: { fontSize: 12 },
  tradeTdBold: { fontWeight: '700' },
  tradeActCell: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'flex-end', paddingRight: 6 },
  tradeRowPnlHint: { fontSize: 11, fontWeight: '600', marginTop: 4, marginLeft: 6 },
  tradeEmptyWrap: { justifyContent: 'center', alignItems: 'center', paddingVertical: 48 },
  tradeEmptyTitle: { fontSize: 15, fontWeight: '500' },

  // Account Summary (Trade Tab) — legacy rows (other screens may reference)
  accountSummaryList: { backgroundColor: '#1E1E1E', borderBottomWidth: 1, borderBottomColor: '#333333', paddingTop: 50 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#333333' },
  summaryLabel: { color: '#666', fontSize: 14 },
  summaryValue: { color: '#fff', fontSize: 14 },
  pendingStatus: { color: '#5a189a', fontSize: 12, fontWeight: '600' },
  historySide: { fontSize: 12, marginLeft: 8 },
  
  tradeTabs: { flexDirection: 'row', backgroundColor: '#1E1E1E', borderBottomWidth: 1, borderBottomColor: '#333333' },
  tradeTabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tradeTabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#5a189a' },
  tradeTabText: { color: '#666', fontSize: 14 },
  tradeTabTextActive: { color: '#5a189a', fontWeight: '600' },
  
  tradesList: { flex: 1 },
  positionItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#333333' },
  positionRow: { flexDirection: 'row', alignItems: 'center' },
  positionInfo: { flex: 1 },
  positionSymbolRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  positionSymbol: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sideBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  sideText: { fontSize: 10, fontWeight: '600' },
  positionDetail: { color: '#666', fontSize: 12, marginTop: 4 },
  slTpText: { color: '#888', fontSize: 11, marginTop: 2 },
  positionActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 8 },
  editBtn: { padding: 10, backgroundColor: '#5a189a20', borderRadius: 10 },
  closeTradeBtn: { padding: 10, backgroundColor: '#5a189a20', borderRadius: 10 },
  positionPnlCol: { alignItems: 'flex-end' },
  positionPnl: { fontSize: 15, fontWeight: '600' },
  currentPriceText: { color: '#666', fontSize: 12, marginTop: 2 },
  closeBtn: { backgroundColor: '#5a189a20', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 },
  closeBtnText: { color: '#5a189a', fontSize: 12, fontWeight: '600' },
  
  // SL/TP Modal
  slTpModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  slTpModalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)' },
  slTpModalContent: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  slTpModalHandle: { width: 40, height: 4, backgroundColor: '#1E1E1E', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  slTpModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  slTpModalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  slTpInputGroup: { marginBottom: 16 },
  slTpLabel: { color: '#888', fontSize: 13, marginBottom: 8 },
  slTpInput: { backgroundColor: '#1E1E1E', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#333333' },
  slTpCurrentInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 },
  slTpCurrentText: { color: '#888', fontSize: 13 },
  slTpButtonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  slTpClearBtn: { flex: 1, backgroundColor: '#1E1E1E', padding: 16, borderRadius: 12, alignItems: 'center' },
  slTpClearBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  slTpSaveBtn: { flex: 2, backgroundColor: '#5a189a', padding: 16, borderRadius: 12, alignItems: 'center' },
  slTpSaveBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  
  // Trade Details Modal - colors applied inline with theme
  tradeDetailsContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '85%' },
  tradeDetailsScroll: { maxHeight: 500 },
  detailSection: { borderRadius: 12, padding: 16, marginBottom: 12 },
  detailSectionTitle: { color: '#5a189a', fontSize: 14, fontWeight: 'bold', marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#333333' },
  detailLabel: { color: '#888', fontSize: 14 },
  detailValue: { color: '#fff', fontSize: 14, fontWeight: '500' },
  detailActions: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 20 },
  detailEditBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#5a189a20', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#5a189a' },
  detailEditText: { color: '#5a189a', fontSize: 15, fontWeight: '600' },
  detailCloseBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#5a189a', padding: 14, borderRadius: 12 },
  detailCloseText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  
  // iOS-style Confirmation Modal
  confirmModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 40 },
  confirmModalContent: { backgroundColor: '#1E1E1E', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center' },
  confirmModalIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#5a189a20', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  confirmModalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  confirmModalMessage: { color: '#888', fontSize: 15, textAlign: 'center', marginBottom: 24 },
  confirmModalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmCancelBtn: { flex: 1, backgroundColor: '#1E1E1E', padding: 14, borderRadius: 12, alignItems: 'center' },
  confirmCancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  confirmCloseBtn: { flex: 1, backgroundColor: '#5a189a', padding: 14, borderRadius: 12, alignItems: 'center' },
  confirmCloseText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  
  // Close All Buttons - background applied inline with theme
  closeAllRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  closeAllBtn: { flex: 1, backgroundColor: '#5a189a20', paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#5a189a' },
  closeAllText: { color: '#5a189a', fontSize: 12, fontWeight: '600' },
  closeProfitBtn: { flex: 1, backgroundColor: '#5a189a20', paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#5a189a' },
  closeProfitText: { color: '#5a189a', fontSize: 12, fontWeight: '600' },
  closeLossBtn: { flex: 1, backgroundColor: '#5a189a20', paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#5a189a' },
  closeLossText: { color: '#5a189a', fontSize: 12, fontWeight: '600' },
  
  // Cancel Order Button
  cancelOrderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#5a189a20', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#5a189a' },
  cancelOrderText: { color: '#5a189a', fontSize: 12, fontWeight: '600' },
  
  // Swipe to Close
  swipeCloseBtn: { backgroundColor: '#5a189a', justifyContent: 'center', alignItems: 'center', width: 80, height: '100%' },
  swipeCloseText: { color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 4 },
  
  tradeButton: { margin: 16, padding: 16, backgroundColor: '#5a189a', borderRadius: 12, alignItems: 'center' },
  tradeButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  
  // Order Panel
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  orderPanel: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  orderPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  orderPanelTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  sideToggle: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  sideBtn: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: '#1E1E1E', alignItems: 'center' },
  sideBtnSell: { backgroundColor: '#ef4444' },
  sideBtnBuy: { backgroundColor: '#22c55e' },
  sideBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sideBtnPrice: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  
  inputGroup: { marginBottom: 16 },
  inputLabel: { color: '#666', fontSize: 12, marginBottom: 8 },
  volumeInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E1E', borderRadius: 12 },
  volumeBtn: { padding: 16 },
  volumeValue: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '600' },
  
  slTpRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  slTpInputWrapper: { flex: 1 },
  input: { backgroundColor: '#1E1E1E', borderRadius: 12, padding: 14, color: '#fff', fontSize: 16 },
  
  executeBtn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  executeBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  
  // History
  historyItemFull: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#333333' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historySymbol: { color: '#fff', fontSize: 16, fontWeight: '600' },
  historyPnl: { fontSize: 16, fontWeight: '600' },
  historyMeta: { flexDirection: 'row', gap: 16, marginTop: 8 },
  historyMetaText: { color: '#666', fontSize: 12 },
  historyDate: { color: '#64748b', fontSize: 11, marginTop: 8 },
  historyItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#333333' },
  historyDetails: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  historyDetail: { color: '#666', fontSize: 12 },
  adminBadge: { backgroundColor: '#5a189a20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  adminBadgeText: { color: '#5a189a', fontSize: 10 },
  
  // History Filters
  historyFilters: { paddingVertical: 8, borderBottomWidth: 1 },
  historyFiltersContent: { paddingHorizontal: 12, gap: 8, flexDirection: 'row' },
  historyFilterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  historyFilterText: { fontSize: 12, fontWeight: '500' },
  historySummary: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  historySummaryText: { fontSize: 12 },
  
  // More Menu - Matching screenshot
  moreMenuHeader: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  moreMenuTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  moreMenuList: { flex: 1, paddingHorizontal: 16 },
  moreMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#333333' },
  moreMenuIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  moreMenuItemText: { flex: 1, color: '#fff', fontSize: 16 },
  themeToggleItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#333333' },
  themeToggle: { width: 50, height: 28, backgroundColor: '#1E1E1E', borderRadius: 14, justifyContent: 'center', paddingHorizontal: 2 },
  themeToggleActive: { backgroundColor: '#5a189a' },
  themeToggleThumb: { width: 24, height: 24, backgroundColor: '#fff', borderRadius: 12 },
  themeToggleThumbActive: { marginLeft: 'auto' },
  
  // Chart Tab - Full screen with multiple tabs
  chartContainer: { flex: 1, backgroundColor: '#1E1E1E' },
  chartTabsBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingLeft: 8, backgroundColor: '#1E1E1E', borderBottomWidth: 1, borderBottomColor: '#333333' },
  chartTabsScroll: { flexGrow: 0 },
  chartTab: { paddingHorizontal: 14, paddingVertical: 10, marginRight: 2, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  chartTabActive: { borderBottomColor: '#5a189a' },
  chartTabText: { color: '#666', fontSize: 13, fontWeight: '500' },
  chartTabTextActive: { color: '#5a189a' },
  addChartBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  chartWrapper: { flex: 1, backgroundColor: '#1E1E1E', minHeight: 400 },
  sentimentSection: { backgroundColor: '#1E1E1E', paddingHorizontal: 16, paddingVertical: 12 },
  sentimentTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  sentimentWidget: { height: 180, backgroundColor: '#1E1E1E', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#333333' },
  chartPriceBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#1E1E1E' },
  chartPriceItem: { alignItems: 'center' },
  chartPriceLabel: { color: '#666', fontSize: 11, marginBottom: 2 },
  chartBidPrice: { color: '#5a189a', fontSize: 16, fontWeight: '600' },
  chartAskPrice: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  chartSpread: { color: '#fff', fontSize: 14 },
  chartOneClickContainer: { backgroundColor: '#1E1E1E', paddingBottom: 16 },
  chartVolumeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 16 },
  chartVolBtn: { width: 32, height: 32, backgroundColor: '#1E1E1E', borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  chartVolText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  chartButtons: { flexDirection: 'row', gap: 10, paddingHorizontal: 12 },
  chartSellBtn: { flex: 1, backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  chartBuyBtn: { flex: 1, backgroundColor: '#22c55e', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  chartBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  chartBtnLabel: { color: '#fff', fontSize: 12, fontWeight: '600', opacity: 0.9 },
  chartBtnPrice: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginTop: 2 },
  orderSlidePanel: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  orderPanelHandle: { width: 40, height: 4, backgroundColor: '#1E1E1E', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  symbolPickerModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  symbolPickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  symbolPickerHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  symbolPickerBackBtn: { marginRight: 4 },
  symbolPickerTitle: { fontSize: 18, fontWeight: 'bold', flexShrink: 1 },
  symbolPickerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  symbolPickerSymbol: { fontSize: 16, fontWeight: '600' },
  symbolPickerName: { fontSize: 12, marginTop: 2 },
  chartAddSegmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  chartAddSegmentLabel: { fontSize: 16, fontWeight: '600' },
  chartAddSegmentRight: { flexDirection: 'row', alignItems: 'center' },
  chartAddSegmentCount: { fontSize: 13, fontWeight: '500' },
  chartAddEmptyWrap: { padding: 32, alignItems: 'center' },
  chartAddEmptyText: { fontSize: 15, textAlign: 'center' },
  
  // Quick Trade Bar - Screenshot Style
  quickTradeBarTop: { 
    flexDirection: 'row', 
    alignItems: 'stretch', 
    backgroundColor: '#1E1E1E',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  sellPriceBtn: { 
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  sellLabel: { color: '#fff', fontSize: 11, fontWeight: '500' },
  sellPrice: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  buyPriceBtn: { 
    flex: 1,
    backgroundColor: '#22c55e',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
    borderWidth: 2,
    borderColor: '#22c55e',
  },
  buyLabel: { color: '#fff', fontSize: 11, fontWeight: '500' },
  buyPrice: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  lotControlCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  lotMinusBtn: {
    width: 36,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#5a189a',
    borderRadius: 6,
    marginRight: 4,
  },
  lotPlusBtn: {
    width: 36,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#5a189a',
    borderRadius: 6,
    marginLeft: 4,
  },
  lotControlText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  lotCenterInput: {
    width: 50,
    height: 36,
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 0,
  },
  btnDisabled: { opacity: 0.5 },
  
  // Leverage Picker Modal
  leverageModalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' },
  leverageModalContent: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 16, width: 200 },
  leverageModalTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  leverageModalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8 },
  leverageModalItemActive: { backgroundColor: '#5a189a20' },
  leverageModalItemText: { color: '#888', fontSize: 14, fontWeight: '600' },
  leverageModalItemTextActive: { color: '#5a189a' },
  
  // Leverage Selector
  leverageSelector: { flexDirection: 'row', gap: 6 },
  leverageOption: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#1E1E1E', borderRadius: 6, borderWidth: 1, borderColor: '#333333' },
  leverageOptionActive: { backgroundColor: '#5a189a20', borderColor: '#5a189a' },
  leverageOptionText: { color: '#888', fontSize: 12, fontWeight: '600' },
  leverageOptionTextActive: { color: '#5a189a' },
  
  // Account Selector - Below search bar
  accountSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1E1E1E', marginHorizontal: 12, marginTop: 0, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#333333' },
  accountSelectorLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#5a189a20', justifyContent: 'center', alignItems: 'center' },
  accountSelectorLabel: { color: '#666', fontSize: 9 },
  accountSelectorValue: { color: '#fff', fontSize: 12, fontWeight: '600' },
  
  // Account Picker Modal
  accountPickerOverlay: { flex: 1, justifyContent: 'flex-end' },
  accountPickerBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)' },
  accountPickerContent: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%' },
  accountPickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#333333' },
  accountPickerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  accountPickerList: { paddingHorizontal: 12, paddingBottom: 40 },
  accountPickerSectionTitle: { fontSize: 12, fontWeight: '600', paddingHorizontal: 4, paddingTop: 12, paddingBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  accountPickerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, marginVertical: 4, backgroundColor: '#1E1E1E', borderRadius: 12 },
  accountPickerItemActive: { backgroundColor: '#5a189a15', borderWidth: 1, borderColor: '#5a189a' },
  accountPickerItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accountPickerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E1E1E', justifyContent: 'center', alignItems: 'center' },
  accountPickerIconActive: { backgroundColor: '#5a189a20' },
  accountPickerNumber: { color: '#fff', fontSize: 15, fontWeight: '600' },
  accountPickerType: { color: '#666', fontSize: 12, marginTop: 2 },
  accountPickerItemRight: { alignItems: 'flex-end', gap: 4 },
  accountPickerBalance: { color: '#5a189a', fontSize: 16, fontWeight: 'bold' },
  
  // Quick SL Modal for Challenge Accounts
  quickSlModalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
  quickSlModalContent: { width: '85%', borderRadius: 16, padding: 20 },
  quickSlModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  quickSlModalTitle: { fontSize: 18, fontWeight: 'bold' },
  quickSlModalSubtitle: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  quickSlInputContainer: { marginBottom: 20 },
  quickSlInputLabel: { fontSize: 12, marginBottom: 6 },
  quickSlInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  quickSlHint: { fontSize: 11, marginTop: 6 },
  quickSlModalButtons: { flexDirection: 'row', gap: 10 },
  quickSlCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  quickSlCancelBtnText: { fontSize: 15, fontWeight: '600' },
  quickSlConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  quickSlConfirmBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});

export default MainTradingScreen;
