import React, { useState, useEffect } from 'react';
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
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { API_URL } from '../config';
import { useTheme } from '../context/ThemeContext';

const WalletScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState({ balance: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [localAmount, setLocalAmount] = useState('');
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState({ currency: 'USD', symbol: '$', rateToUSD: 1, markup: 0 });
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  
  // Withdrawal bank/UPI details
  const [bankDetails, setBankDetails] = useState({
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    accountHolderName: '',
  });
  const [upiId, setUpiId] = useState('');
  const [bankInfo, setBankInfo] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      // Fetch wallet data first, then set loading false
      const loadData = async () => {
        await fetchWalletData();
        setLoading(false);
      };
      loadData();
      // Fetch payment methods and currencies in background
      fetchPaymentMethods();
      fetchCurrencies();
    }
  }, [user]);

  const fetchCurrencies = async () => {
    // TrustEdge does not have a currencies endpoint - USD only
    setCurrencies([]);
  };

  const calculateUSDAmount = (localAmt, currency) => {
    if (!currency || currency.currency === 'USD') return localAmt;
    const effectiveRate = currency.rateToUSD * (1 + (currency.markup || 0) / 100);
    return localAmt / effectiveRate;
  };

  const loadUser = async () => {
    try {
      const userData = await SecureStore.getItemAsync('user');
      if (userData) {
        setUser(JSON.parse(userData));
      }
    } catch (e) {
      console.error('Error loading user:', e);
    }
  };

  const fetchWalletData = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) { setRefreshing(false); return; }

      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

      const [walletRes, transRes] = await Promise.all([
        fetch(`${API_URL}/wallet/summary`, { headers }),
        fetch(`${API_URL}/wallet/transactions`, { headers }),
      ]);

      if (walletRes.ok) {
        const walletData = await walletRes.json();
        // Web uses main_wallet_balance — that's the wallet's own balance,
        // separate from trading account balances. Fall back to balance for older backends.
        const mainBal = walletData.main_wallet_balance ?? walletData.wallet_balance ?? walletData.balance ?? 0;
        setWallet({ ...walletData, balance: Number(mainBal) || 0 });
      }

      if (transRes.ok) {
        const transData = await transRes.json();
        setTransactions(transData.items || []);
      }
    } catch (e) {
      console.error('Error fetching wallet:', e);
    }
    setRefreshing(false);
  };

  const fetchBankInfo = async (amount) => {
    try {
      const res = await fetch(`${API_URL}/wallet/bank-info?amount=${amount || 100}`);
      if (res.ok) {
        const data = await res.json();
        setBankInfo(data);
      }
    } catch (e) {
      console.error('Error fetching bank info:', e);
    }
  };

  const fetchPaymentMethods = async () => {
    setLoadingMethods(true);
    // TrustEdge uses fixed methods; bank details fetched from /wallet/bank-info
    setPaymentMethods([
      { id: 'bank', type: 'Bank Transfer', name: 'Bank Transfer' },
      { id: 'upi', type: 'UPI', name: 'UPI' },
    ]);
    setLoadingMethods(false);
    // Fetch bank/UPI details for displaying to user
    fetchBankInfo(localAmount || 100);
  };

  const pickScreenshot = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload payment screenshots.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        Alert.alert('Error', 'Screenshot must be less than 5MB');
        return;
      }
      setScreenshot(asset);
      setScreenshotPreview(asset.uri);
    }
  };

  const sanitizeAmount = (val) => {
    // Strip non-numeric chars except decimal point, ensure valid number
    const cleaned = String(val).replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    if (!Number.isFinite(num) || num <= 0) return null;
    if (num > 1000000) return null; // Max $1M per transaction
    return Math.round(num * 100) / 100; // 2 decimal places
  };

  const handleDeposit = async () => {
    const sanitized = sanitizeAmount(localAmount);
    if (!sanitized) {
      Alert.alert('Error', 'Please enter a valid amount (max $1,000,000)');
      return;
    }
    if (!selectedMethod) {
      Alert.alert('Error', 'Please select a payment method');
      return;
    }
    if (!transactionRef || transactionRef.trim() === '') {
      Alert.alert('Error', 'Please enter the transaction ID/reference number');
      return;
    }

    const usdAmount = selectedCurrency && selectedCurrency.currency !== 'USD'
      ? calculateUSDAmount(parseFloat(localAmount), selectedCurrency)
      : parseFloat(localAmount);

    setIsSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync('token');

      // Get user's first live trading account
      const accountsRes = await fetch(`${API_URL}/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const accountsData = await accountsRes.json();
      const accounts = accountsData.items || accountsData || [];
      const liveAccount = accounts.find(a => !a.is_demo) || accounts[0];
      if (!liveAccount) {
        Alert.alert('Error', 'No trading account found. Please contact support.');
        setIsSubmitting(false);
        return;
      }

      const methodMap = { 'Bank Transfer': 'bank', 'UPI': 'upi', 'QR Code': 'qr', 'Crypto USDT': 'crypto_usdt' };
      const method = methodMap[selectedMethod.type] || 'bank';

      const res = await fetch(`${API_URL}/wallet/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          account_id: liveAccount.id,
          amount: usdAmount,
          method,
          transaction_id: transactionRef.trim() || undefined,
          screenshot_url: screenshotPreview || undefined,
        })
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Success', 'Deposit request submitted! Awaiting approval.');
        setShowDepositModal(false);
        setLocalAmount('');
        setTransactionRef('');
        setSelectedMethod(null);
        setSelectedCurrency({ currency: 'USD', symbol: '$', rateToUSD: 1, markup: 0 });
        setScreenshot(null);
        setScreenshotPreview(null);
        fetchWalletData();
      } else {
        Alert.alert('Error', data.detail || data.message || 'Failed to submit deposit');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to submit deposit request');
    }
    setIsSubmitting(false);
  };

  const handleWithdraw = async () => {
    const sanitized = sanitizeAmount(amount);
    if (!sanitized) {
      Alert.alert('Error', 'Please enter a valid amount (max $1,000,000)');
      return;
    }
    if (sanitized > wallet.balance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }
    if (!selectedMethod) {
      Alert.alert('Error', 'Please select a payment method');
      return;
    }

    // Validate bank details if Bank Transfer selected
    if (selectedMethod.type === 'Bank Transfer') {
      if (!bankDetails.accountHolderName || !bankDetails.bankName || !bankDetails.accountNumber || !bankDetails.ifscCode) {
        Alert.alert('Error', 'Please fill all bank details');
        return;
      }
    }

    // Validate UPI if UPI selected
    if (selectedMethod.type === 'UPI') {
      if (!upiId) {
        Alert.alert('Error', 'Please enter UPI ID');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Build bank account details based on payment method
      let bankAccountDetails = null;
      if (selectedMethod.type === 'Bank Transfer') {
        bankAccountDetails = {
          type: 'Bank',
          bankName: bankDetails.bankName,
          accountNumber: bankDetails.accountNumber,
          ifscCode: bankDetails.ifscCode,
          accountHolderName: bankDetails.accountHolderName,
        };
      } else if (selectedMethod.type === 'UPI') {
        bankAccountDetails = {
          type: 'UPI',
          upiId: upiId,
        };
      }

      const token = await SecureStore.getItemAsync('token');

      // Get user's first live trading account
      const accountsRes = await fetch(`${API_URL}/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const accountsData = await accountsRes.json();
      const accounts = accountsData.items || accountsData || [];
      const liveAccount = accounts.find(a => !a.is_demo) || accounts[0];
      if (!liveAccount) {
        Alert.alert('Error', 'No trading account found. Please contact support.');
        setIsSubmitting(false);
        return;
      }

      const methodMap = { 'Bank Transfer': 'bank', 'UPI': 'upi' };
      const method = methodMap[selectedMethod.type] || 'bank';

      const res = await fetch(`${API_URL}/wallet/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          account_id: liveAccount.id,
          amount: parseFloat(amount),
          method,
          bank_details: bankAccountDetails,
        })
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Success', 'Withdrawal request submitted! Awaiting approval.');
        setShowWithdrawModal(false);
        setAmount('');
        setSelectedMethod(null);
        setBankDetails({ bankName: '', accountNumber: '', ifscCode: '', accountHolderName: '' });
        setUpiId('');
        fetchWalletData();
      } else {
        Alert.alert('Error', data.detail || data.message || 'Failed to submit withdrawal');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to submit withdrawal request');
    }
    setIsSubmitting(false);
  };

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved' || s === 'completed' || s === 'success') return '#22c55e';
    if (s === 'pending' || s === 'processing') return '#eab308';
    if (s === 'rejected' || s === 'failed' || s === 'cancelled') return '#ef4444';
    return '#666';
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bgPrimary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchWalletData(); }} tintColor={colors.accent} />
        }
      >
        {/* Balance Card */}
        <View style={[styles.balanceCard, { backgroundColor: colors.bgCard }]}>
          <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>Available Balance</Text>
          <Text style={[styles.balanceAmount, { color: colors.textPrimary }]}>${wallet.balance?.toLocaleString() || '0.00'}</Text>
          
          <View style={styles.actionButtons}>
            <TouchableOpacity style={[styles.depositBtn, { backgroundColor: colors.accent }]} onPress={() => { fetchPaymentMethods(); fetchBankInfo(100); setShowDepositModal(true); }}>
              <Ionicons name="arrow-down-circle" size={20} color="#000" />
              <Text style={styles.depositBtnText}>Deposit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.withdrawBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]} onPress={() => setShowWithdrawModal(true)}>
              <Ionicons name="arrow-up-circle" size={20} color={colors.accent} />
              <Text style={[styles.withdrawBtnText, { color: colors.accent }]}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transactions */}
        <View style={styles.transactionsSection}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Transactions</Text>
          
          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No transactions yet</Text>
            </View>
          ) : (
            transactions.map((tx) => {
              // TrustEdge types: deposit, withdrawal, adjustment, credit, profit, loss
              const isPositive = tx.type === 'deposit' || tx.type === 'DEPOSIT' || tx.type === 'Deposit'
                || tx.type === 'adjustment' || tx.type === 'credit'
                || tx.type === 'Admin_Fund_Add' || tx.type === 'Admin_Credit_Add'
                || tx.type === 'Transfer_From_Account' || tx.type === 'Account_Transfer_In'
                || (tx.amount > 0);
              const getTypeLabel = (type) => {
                switch(type) {
                  case 'deposit': return 'Deposit';
                  case 'withdrawal': return 'Withdrawal';
                  case 'adjustment': return 'Admin Adjustment';
                  case 'credit': return 'Credit';
                  case 'profit': return 'Trade Profit';
                  case 'loss': return 'Trade Loss';
                  case 'Admin_Fund_Add': return 'Admin Fund Addition';
                  case 'Admin_Credit_Add': return 'Admin Credit Addition';
                  case 'Admin_Credit_Remove': return 'Admin Credit Removal';
                  case 'Transfer_To_Account': return 'To Trading Account';
                  case 'Transfer_From_Account': return 'From Trading Account';
                  default: return type || 'Transaction';
                }
              };
              const getIcon = (type) => {
                if (type === 'deposit' || type === 'credit' || type === 'adjustment') return 'arrow-down';
                if (type === 'withdrawal') return 'arrow-up';
                if (type === 'profit') return 'trending-up';
                if (type === 'loss') return 'trending-down';
                if (isPositive) return 'arrow-down';
                return 'arrow-up';
              };
              return (
                <View key={tx.id || tx._id} style={[styles.transactionItem, { backgroundColor: colors.bgCard }]}>
                  <View style={styles.txLeft}>
                    <View style={[styles.txIcon, { backgroundColor: isPositive ? colors.success + '20' : colors.error + '20' }]}>
                      <Ionicons name={getIcon(tx.type)} size={20} color={isPositive ? colors.success : colors.error} />
                    </View>
                    <View>
                      <Text style={[styles.txType, { color: colors.textPrimary }]}>{getTypeLabel(tx.type)}</Text>
                      {tx.method && tx.method !== 'admin' && (
                        <Text style={[styles.txDate, { color: colors.textMuted }]}>{tx.method.replace('_', ' ').toUpperCase()}</Text>
                      )}
                      <Text style={[styles.txDate, { color: colors.textMuted }]}>{formatDate(tx.created_at || tx.createdAt)}</Text>
                    </View>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={[styles.txAmount, { color: isPositive ? colors.success : colors.error }]}>
                      {isPositive ? '+' : '-'}${Math.abs(tx.amount || 0).toLocaleString()}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(tx.status) + '20' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(tx.status) }]}>{tx.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Deposit Modal */}
      <Modal visible={showDepositModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <SafeAreaView style={{ flex: 1, justifyContent: 'flex-end' }}>
            <ScrollView 
              style={[styles.modalContent, { backgroundColor: colors.bgCard, maxHeight: '90%' }]} 
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Deposit Funds</Text>
                <TouchableOpacity onPress={() => {
                  setShowDepositModal(false);
                  setLocalAmount('');
                  setTransactionRef('');
                  setSelectedMethod(null);
                  setSelectedCurrency({ currency: 'USD', symbol: '$', rateToUSD: 1, markup: 0 });
                }} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

            {/* Currency Selection */}
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Select Currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodsScroll}>
              <TouchableOpacity
                style={[styles.currencyCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border }, selectedCurrency?.currency === 'USD' && styles.currencyCardActive]}
                onPress={() => setSelectedCurrency({ currency: 'USD', symbol: '$', rateToUSD: 1, markup: 0 })}
              >
                <Text style={[styles.currencySymbol, { color: colors.textPrimary }]}>$</Text>
                <Text style={[styles.currencyName, { color: colors.textMuted }]}>USD</Text>
              </TouchableOpacity>
              {currencies.map((curr) => (
                <TouchableOpacity
                  key={curr._id}
                  style={[styles.currencyCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border }, selectedCurrency?.currency === curr.currency && styles.currencyCardActive]}
                  onPress={() => setSelectedCurrency(curr)}
                >
                  <Text style={[styles.currencySymbol, { color: colors.textPrimary }]}>{curr.symbol}</Text>
                  <Text style={[styles.currencyName, { color: colors.textMuted }]}>{curr.currency}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
              Amount ({selectedCurrency?.symbol || '$'} {selectedCurrency?.currency || 'USD'})
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              value={localAmount}
              onChangeText={setLocalAmount}
              placeholder={`Enter amount in ${selectedCurrency?.currency || 'USD'}`}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            {/* USD Conversion Display */}
            {selectedCurrency && selectedCurrency.currency !== 'USD' && localAmount && parseFloat(localAmount) > 0 && (
              <View style={styles.conversionBox}>
                <Text style={styles.conversionLabel}>You will receive</Text>
                <Text style={styles.conversionAmount}>
                  ${calculateUSDAmount(parseFloat(localAmount), selectedCurrency).toFixed(2)} USD
                </Text>
                <Text style={styles.conversionRate}>
                  Rate: 1 USD = {selectedCurrency.symbol}{(selectedCurrency.rateToUSD * (1 + (selectedCurrency.markup || 0) / 100)).toFixed(2)} {selectedCurrency.currency}
                </Text>
              </View>
            )}

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Payment Method</Text>
            {loadingMethods ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={{ color: colors.textMuted, marginTop: 8 }}>Loading payment methods...</Text>
              </View>
            ) : paymentMethods.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Ionicons name="card-outline" size={32} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, marginTop: 8 }}>No payment methods available</Text>
                <TouchableOpacity onPress={fetchPaymentMethods} style={{ marginTop: 8 }}>
                  <Text style={{ color: colors.accent }}>Tap to retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodsScroll}>
                {paymentMethods.map((method) => (
                  <TouchableOpacity
                    key={method._id}
                    style={[styles.methodCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border }, selectedMethod?._id === method._id && styles.methodCardActive]}
                    onPress={() => setSelectedMethod(method)}
                  >
                    <Text style={[styles.methodName, { color: colors.textPrimary }, selectedMethod?._id === method._id && { color: '#fff' }]}>
                      {method.type || method.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Payment Method Details */}
            {selectedMethod && (
              <View style={[styles.methodDetails, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                {!bankInfo && (
                  <ActivityIndicator size="small" color={colors.accent} style={{ margin: 12 }} />
                )}
                {selectedMethod.type === 'Bank Transfer' && bankInfo && (
                  <>
                    {bankInfo.bank_name ? (
                      <TouchableOpacity style={styles.copyRow} onPress={() => { Clipboard.setStringAsync(bankInfo.bank_name); Alert.alert('Copied', 'Bank name copied!'); }}>
                        <Text style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Bank: </Text>
                          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{bankInfo.bank_name}</Text>
                        </Text>
                        <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                    {bankInfo.account_number ? (
                      <TouchableOpacity style={styles.copyRow} onPress={() => { Clipboard.setStringAsync(bankInfo.account_number); Alert.alert('Copied', 'Account number copied!'); }}>
                        <Text style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Account: </Text>
                          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{bankInfo.account_number}</Text>
                        </Text>
                        <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                    {bankInfo.account_name ? (
                      <TouchableOpacity style={styles.copyRow} onPress={() => { Clipboard.setStringAsync(bankInfo.account_name); Alert.alert('Copied', 'Name copied!'); }}>
                        <Text style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Name: </Text>
                          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{bankInfo.account_name}</Text>
                        </Text>
                        <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                    {bankInfo.ifsc_code ? (
                      <TouchableOpacity style={styles.copyRow} onPress={() => { Clipboard.setStringAsync(bankInfo.ifsc_code); Alert.alert('Copied', 'IFSC copied!'); }}>
                        <Text style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>IFSC: </Text>
                          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{bankInfo.ifsc_code}</Text>
                        </Text>
                        <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </>
                )}
                {selectedMethod.type === 'UPI' && bankInfo && bankInfo.upi_id && (
                  <>
                    <TouchableOpacity style={styles.copyRow} onPress={() => { Clipboard.setStringAsync(bankInfo.upi_id); Alert.alert('Copied', 'UPI ID copied!'); }}>
                      <Text style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>UPI ID: </Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{bankInfo.upi_id}</Text>
                      </Text>
                      <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                    {bankInfo.qr_code_url && (
                      <View style={styles.qrContainer}>
                        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Scan QR Code to Pay:</Text>
                        <Image source={{ uri: bankInfo.qr_code_url }} style={styles.qrImage} resizeMode="contain" />
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Transaction ID / Reference Number *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              value={transactionRef}
              onChangeText={setTransactionRef}
              placeholder="Enter transaction ID or reference"
              placeholderTextColor={colors.textMuted}
            />

            {/* Payment Screenshot Upload */}
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Payment Screenshot (Proof)</Text>
            {screenshotPreview ? (
              <View style={{ marginBottom: 16 }}>
                <Image 
                  source={{ uri: screenshotPreview }} 
                  style={{ width: '100%', height: 200, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
                  resizeMode="contain"
                />
                <TouchableOpacity
                  onPress={() => { setScreenshot(null); setScreenshotPreview(null); }}
                  style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#ef4444', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={pickScreenshot}
                style={{ marginBottom: 16, padding: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 8, alignItems: 'center', gap: 8 }}
              >
                <Ionicons name="cloud-upload-outline" size={28} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>Tap to upload payment screenshot</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, opacity: 0.6 }}>PNG, JPG up to 5MB</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={[styles.submitBtn, { backgroundColor: colors.accent }, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleDeposit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, { color: '#fff' }]}>Submit Deposit Request</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Withdraw Modal */}
      <Modal visible={showWithdrawModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <SafeAreaView style={{ flex: 1, justifyContent: 'flex-end' }}>
            <ScrollView 
              style={[styles.modalContent, { backgroundColor: colors.bgCard, maxHeight: '90%' }]} 
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Withdraw Funds</Text>
                <TouchableOpacity onPress={() => {
                  setShowWithdrawModal(false);
                  setAmount('');
                  setSelectedMethod(null);
                }} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

            <View style={[styles.availableBalance, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <Text style={[styles.availableLabel, { color: colors.textMuted }]}>Available Balance</Text>
              <Text style={[styles.availableAmount, { color: colors.accent }]}>${wallet.balance?.toLocaleString()}</Text>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Amount (USD)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="Enter amount"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Payment Method</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodsScroll}>
              {paymentMethods.filter(m => m.type !== 'QR Code').map((method) => (
                <TouchableOpacity
                  key={method._id}
                  style={[styles.methodCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border }, selectedMethod?._id === method._id && styles.methodCardActive]}
                  onPress={() => setSelectedMethod(method)}
                >
                  <Text style={[styles.methodName, { color: colors.textPrimary }, selectedMethod?._id === method._id && { color: '#fff' }]}>
                    {method.type || method.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Bank Transfer Input Fields */}
            {selectedMethod?.type === 'Bank Transfer' && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Account Holder Name *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                  value={bankDetails.accountHolderName}
                  onChangeText={(text) => setBankDetails({ ...bankDetails, accountHolderName: text })}
                  placeholder="Enter account holder name"
                  placeholderTextColor={colors.textMuted}
                />
                
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Bank Name *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                  value={bankDetails.bankName}
                  onChangeText={(text) => setBankDetails({ ...bankDetails, bankName: text })}
                  placeholder="Enter bank name"
                  placeholderTextColor={colors.textMuted}
                />
                
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Account Number *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                  value={bankDetails.accountNumber}
                  onChangeText={(text) => setBankDetails({ ...bankDetails, accountNumber: text })}
                  placeholder="Enter account number"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                />
                
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>IFSC Code *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                  value={bankDetails.ifscCode}
                  onChangeText={(text) => setBankDetails({ ...bankDetails, ifscCode: text.toUpperCase() })}
                  placeholder="Enter IFSC code"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
            )}

            {/* UPI Input Field */}
            {selectedMethod?.type === 'UPI' && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>UPI ID *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                  value={upiId}
                  onChangeText={setUpiId}
                  placeholder="Enter UPI ID (e.g., name@upi)"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>
            )}

            <TouchableOpacity 
              style={[styles.submitBtn, { backgroundColor: colors.accent }, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleWithdraw}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, { color: '#fff' }]}>Submit Withdrawal Request</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  scrollContent: { flex: 1 },
  scrollContentContainer: { paddingBottom: 40 },
  
  balanceCard: { margin: 16, padding: 20, borderRadius: 16 },
  balanceLabel: { fontSize: 14 },
  balanceAmount: { fontSize: 36, fontWeight: 'bold', marginTop: 8 },
  
  actionButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  depositBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1a73e8', paddingVertical: 14, borderRadius: 12 },
  depositBtnText: { color: '#000', fontSize: 16, fontWeight: '600' },
  withdrawBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, paddingVertical: 14, borderRadius: 12 },
  withdrawBtnText: { color: '#1a73e8', fontSize: 16, fontWeight: '600' },
  
  transactionsSection: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#666', fontSize: 14, marginTop: 12 },
  
  transactionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8 },
  txLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  txType: { fontSize: 14, fontWeight: '600' },
  txDate: { color: '#666', fontSize: 12, marginTop: 2 },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 16, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '600' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  
  inputLabel: { color: '#666', fontSize: 12, marginBottom: 8, marginTop: 16 },
  input: { borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1 },
  
  methodsScroll: { marginTop: 8 },
  methodCard: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginRight: 8, borderWidth: 1 },
  methodCardActive: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  methodName: { fontSize: 14, fontWeight: '500' },
  
  availableBalance: { padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1 },
  availableLabel: { color: '#666', fontSize: 12 },
  availableAmount: { color: '#1a73e8', fontSize: 24, fontWeight: 'bold', marginTop: 4 },
  
  submitBtn: { backgroundColor: '#1a73e8', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  withdrawSubmitBtn: { backgroundColor: '#1a73e8' },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  
  // Currency selection styles
  currencyCard: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginRight: 8, alignItems: 'center', minWidth: 60, borderWidth: 1 },
  currencyCardActive: { backgroundColor: '#1a73e8' },
  currencySymbol: { fontSize: 18, fontWeight: 'bold' },
  currencyName: { color: '#666', fontSize: 10, marginTop: 2 },
  
  // Conversion box styles
  conversionBox: { backgroundColor: '#1a73e820', borderWidth: 1, borderColor: '#1a73e850', borderRadius: 12, padding: 16, marginTop: 12, alignItems: 'center' },
  conversionLabel: { color: '#666', fontSize: 12 },
  conversionAmount: { color: '#1a73e8', fontSize: 24, fontWeight: 'bold', marginTop: 4 },
  conversionRate: { color: '#666', fontSize: 11, marginTop: 8 },
  
  // Method details styles
  methodDetails: { borderRadius: 12, padding: 16, marginTop: 12, borderWidth: 1 },
  copyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#333' },
  detailRow: { marginBottom: 8 },
  detailLabel: { color: '#666', fontSize: 13 },
  detailValue: { fontSize: 13 },
  
  // QR Code styles
  qrContainer: { alignItems: 'center', marginTop: 8 },
  qrImage: { width: 200, height: 200, marginTop: 12, borderRadius: 8 },
});

export default WalletScreen;
