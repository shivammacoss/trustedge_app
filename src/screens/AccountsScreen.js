import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';
import { useTheme } from '../context/ThemeContext';

function isDemoAccount(a) {
  return !!(a?.is_demo || a?.isDemo || a?.accountTypeId?.isDemo);
}

function isActiveStatus(a) {
  const s = String(a?.status || '').toLowerCase();
  return !s || s === 'active';
}

const AccountsScreen = ({ navigation, route }) => {
  const { colors } = useTheme();
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Transfer states
  const [walletBalance, setWalletBalance] = useState(0);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showWithdrawRequestModal, setShowWithdrawRequestModal] = useState(false);
  const [showAccountTransferModal, setShowAccountTransferModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [targetAccount, setTargetAccount] = useState(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  
  // Withdrawal request states
  const [withdrawMethod, setWithdrawMethod] = useState('Bank'); // 'Bank', 'UPI'
  const [bankDetails, setBankDetails] = useState({
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    accountHolderName: '',
  });
  const [upiId, setUpiId] = useState('');
  
  // Handle incoming route params for deposit/withdraw action
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      // Fetch all data and then set loading false
      const loadData = async () => {
        try {
          await Promise.all([fetchAccounts(), fetchWalletBalance()]);
        } catch (e) {
          console.error('Error loading accounts data:', e);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
  }, [user]);
  
  // Handle route params to auto-open deposit/withdraw modal
  useEffect(() => {
    if (route?.params?.action && route?.params?.accountId && accounts.length > 0) {
      const account = accounts.find(
        (a) => String(a.id || a._id) === String(route.params.accountId)
      );
      if (account) {
        setSelectedAccount(account);
        setTransferAmount('');
        if (route.params.action === 'deposit') {
          fetchWalletBalance();
          setShowTransferModal(true);
        } else if (route.params.action === 'withdraw') {
          setShowWithdrawModal(true);
        }
        // Clear the params to prevent re-triggering
        navigation.setParams({ action: null, accountId: null });
      }
    }
  }, [route?.params, accounts]);

  const fetchWalletBalance = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;
      const res = await fetch(`${API_URL}/wallet/summary`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setWalletBalance(data.balance || 0);
    } catch (e) {
      console.error('Error fetching wallet:', e);
    }
  };

  const loadUser = async () => {
    try {
      const userData = await SecureStore.getItemAsync('user');
      if (userData) {
        setUser(JSON.parse(userData));
      } else {
        navigation.replace('Login');
      }
    } catch (e) {
      console.error('Error loading user:', e);
    }
  };

  const fetchAccounts = async () => {
    if (!user) return;
    try {
      const token = await SecureStore.getItemAsync('token');
      console.log('AccountsScreen - Fetching accounts with token auth');
      const res = await fetch(`${API_URL}/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const items = data.items || data || [];
      // Map PTD2 account fields to expected format
      const mappedAccounts = items.map((a) => ({
        ...a,
        id: a.id || a._id,
        _id: a.id || a._id,
        accountId: a.account_number || a.accountId || a.id,
        account_number: a.account_number,
        isDemo: a.is_demo || a.isDemo || false,
        status: a.status === 'active' ? 'Active' : (a.status || 'Active'),
        accountType: a.account_type || a.accountType || 'Standard',
      }));
      const liveOnly = mappedAccounts.filter((a) => !isDemoAccount(a));
      const list = liveOnly.length > 0 ? liveOnly : mappedAccounts;
      console.log('AccountsScreen - Accounts response:', list.length, 'main accounts');
      setAccounts(list);
    } catch (e) {
      console.warn('AccountsScreen - Error fetching accounts:', e.message);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAccounts(), fetchWalletBalance()]);
    setRefreshing(false);
  };


  const handleDeposit = (account) => {
    console.log('Opening deposit modal for account:', account.accountId, account._id);
    setSelectedAccount(account);
    setTransferAmount('');
    fetchWalletBalance(); // Refresh wallet balance
    setShowTransferModal(true);
  };

  const handleWithdraw = (account) => {
    console.log('Opening withdraw modal for account:', account.accountId, account._id);
    setSelectedAccount(account);
    setTransferAmount('');
    setShowWithdrawModal(true);
  };

  const handleAccountTransfer = (account) => {
    setSelectedAccount(account);
    setTargetAccount(null);
    setTransferAmount('');
    setShowAccountTransferModal(true);
  };

  // Transfer from wallet to account - PTD2 uses wallet deposit
  const handleTransferFunds = async () => {
    if (!selectedAccount || !selectedAccount._id) {
      Alert.alert('Error', 'No account selected');
      return;
    }
    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (parseFloat(transferAmount) > walletBalance) {
      Alert.alert('Error', 'Insufficient wallet balance');
      return;
    }

    setIsTransferring(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/wallet/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          account_id: selectedAccount.id || selectedAccount._id,
          amount: parseFloat(transferAmount),
          method: 'internal_transfer',
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        await Promise.all([fetchAccounts(), fetchWalletBalance()]);
        setShowTransferModal(false);
        setTransferAmount('');
        setSelectedAccount(null);
        Alert.alert('Success', 'Funds transferred successfully!');
      } else {
        Alert.alert('Error', data.detail || data.message || 'Transfer failed');
      }
    } catch (e) {
      console.error('Transfer error:', e);
      Alert.alert('Error', 'Error transferring funds: ' + e.message);
    }
    setIsTransferring(false);
  };

  // Withdraw from account to wallet - PTD2 uses wallet withdraw
  const handleWithdrawFromAccount = async () => {
    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (!selectedAccount) {
      Alert.alert('Error', 'No account selected');
      return;
    }
    if (parseFloat(transferAmount) > (selectedAccount.balance || 0)) {
      Alert.alert('Error', 'Insufficient account balance');
      return;
    }

    setIsTransferring(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/wallet/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          account_id: selectedAccount.id || selectedAccount._id,
          amount: parseFloat(transferAmount),
          method: 'internal_transfer',
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        await Promise.all([fetchAccounts(), fetchWalletBalance()]);
        setShowWithdrawModal(false);
        setTransferAmount('');
        setSelectedAccount(null);
        Alert.alert('Success', 'Funds withdrawn to main wallet!');
      } else {
        Alert.alert('Error', data.detail || data.message || 'Withdrawal failed');
      }
    } catch (e) {
      Alert.alert('Error', 'Error withdrawing funds');
    }
    setIsTransferring(false);
  };

  // Submit withdrawal request to admin (from wallet to bank/UPI)
  const handleWithdrawRequest = async () => {
    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (parseFloat(transferAmount) > walletBalance) {
      Alert.alert('Error', 'Insufficient wallet balance');
      return;
    }

    // Validate payment details
    if (withdrawMethod === 'Bank') {
      if (!bankDetails.bankName || !bankDetails.accountNumber || !bankDetails.ifscCode || !bankDetails.accountHolderName) {
        Alert.alert('Error', 'Please fill all bank details');
        return;
      }
    } else if (withdrawMethod === 'UPI') {
      if (!upiId) {
        Alert.alert('Error', 'Please enter UPI ID');
        return;
      }
    }

    setIsTransferring(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const bankAccountDetails = withdrawMethod === 'Bank' 
        ? {
            type: 'Bank',
            bankName: bankDetails.bankName,
            accountNumber: bankDetails.accountNumber,
            ifscCode: bankDetails.ifscCode,
            accountHolderName: bankDetails.accountHolderName,
          }
        : {
            type: 'UPI',
            upiId: upiId,
          };

      const res = await fetch(`${API_URL}/wallet/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          amount: parseFloat(transferAmount),
          method: withdrawMethod === 'Bank' ? 'bank' : 'upi',
          bank_details: bankAccountDetails,
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        Alert.alert('Success', 'Withdrawal request submitted! Admin will process it shortly.');
        setShowWithdrawRequestModal(false);
        setTransferAmount('');
        setBankDetails({ bankName: '', accountNumber: '', ifscCode: '', accountHolderName: '' });
        setUpiId('');
        fetchWalletBalance();
      } else {
        Alert.alert('Error', data.message || 'Withdrawal request failed');
      }
    } catch (e) {
      Alert.alert('Error', 'Error submitting withdrawal request');
    }
    setIsTransferring(false);
  };

  // Transfer between accounts - PTD2 doesn't support direct account-to-account transfer
  const handleAccountToAccountTransfer = async () => {
    Alert.alert('Info', 'Account-to-account transfer is not available. Please withdraw to wallet first, then deposit to target account.');
  };

  const selectAccountForTrading = async (account) => {
    const aid = account.id || account._id;
    await SecureStore.setItemAsync('selectedAccountId', aid);
    navigation.navigate('MainTrading', { selectedAccountId: aid });
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const mainTradingAccounts = accounts.filter(
    (a) => !isDemoAccount(a) && isActiveStatus(a)
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bgPrimary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Account</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Wallet — same as web: funds live under Wallet */}
        <TouchableOpacity
          style={[styles.walletCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          onPress={() => navigation.navigate('Wallet')}
          activeOpacity={0.85}
        >
          <View style={styles.walletHeader}>
            <View style={[styles.walletIconContainer, { backgroundColor: colors.accent + '20' }]}>
              <Ionicons name="wallet-outline" size={24} color={colors.accent} />
            </View>
            <View style={styles.walletInfo}>
              <Text style={[styles.walletTitle, { color: colors.textMuted }]}>Wallet</Text>
              <Text style={[styles.walletBalanceText, { color: colors.textPrimary }]}>${walletBalance.toFixed(2)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyText, { color: colors.textMuted, marginTop: 8, paddingHorizontal: 4 }]}>
            Deposit and withdraw in Wallet (same as web).
          </Text>
        </TouchableOpacity>

        <Text style={[styles.walletTitle, { color: colors.textMuted, marginTop: 12, marginBottom: 4, marginHorizontal: 4, fontSize: 13 }]}>
          Trading account
        </Text>

        {mainTradingAccounts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="briefcase-outline" size={64} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No trading account</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Use Wallet to add funds, then open the Trade tab.</Text>
            <TouchableOpacity
              style={[styles.tradeBtn, { backgroundColor: colors.accent, marginTop: 16 }]}
              onPress={() => navigation.navigate('Wallet')}
            >
              <Text style={styles.tradeBtnText}>Open Wallet</Text>
            </TouchableOpacity>
          </View>
        ) : (
          mainTradingAccounts.map((account) => (
            <View key={String(account.id || account._id)} style={[styles.accountCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <TouchableOpacity style={styles.accountHeader} onPress={() => selectAccountForTrading(account)}>
                <View style={[styles.accountIconContainer, { backgroundColor: colors.accent + '20' }]}>
                  <Ionicons name="briefcase-outline" size={24} color={colors.accent} />
                </View>
                <View style={styles.accountInfo}>
                  <Text style={[styles.accountId, { color: colors.textPrimary }]}>
                    {account.account_number || account.accountId}
                  </Text>
                  <Text style={[styles.accountType, { color: colors.textMuted }]}>
                    {account.accountTypeId?.name || account.accountType || 'Standard'}
                    {' • Leverage '}
                    {String(account.leverage || '').includes(':')
                      ? account.leverage
                      : `1:${account.leverage || 100}`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>

              <View style={styles.balanceSection}>
                <View style={styles.balanceRow}>
                  <View style={styles.balanceItem}>
                    <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>Balance</Text>
                    <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>${(account.balance || 0).toFixed(2)}</Text>
                  </View>
                  <View style={styles.balanceItem}>
                    <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>Equity</Text>
                    <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>
                      ${(Number(account.equity) || (account.balance || 0) + (account.credit || 0)).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.balanceItem}>
                    <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>Free margin</Text>
                    <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>
                      ${(account.free_margin != null ? Number(account.free_margin) : 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.depositBtn, { backgroundColor: colors.accent }]}
                  onPress={() => handleDeposit(account)}
                >
                  <Ionicons name="arrow-down-circle-outline" size={18} color="#000" />
                  <Text style={styles.depositBtnText}>Deposit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.withdrawBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
                  onPress={() => handleWithdraw(account)}
                >
                  <Ionicons name="arrow-up-circle-outline" size={18} color={colors.textPrimary} />
                  <Text style={[styles.withdrawBtnText, { color: colors.textPrimary }]}>Withdraw</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.tradeBtn, { backgroundColor: colors.accent }]}
                onPress={() => selectAccountForTrading(account)}
              >
                <Ionicons name="trending-up" size={18} color="#000" />
                <Text style={styles.tradeBtnText}>Trade</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* Deposit Modal - Transfer from Wallet to Account */}
      <Modal visible={showTransferModal} animationType="slide" transparent onRequestClose={() => setShowTransferModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowTransferModal(false)} />
          <View style={[styles.transferModalContent, { backgroundColor: colors.bgCard }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Deposit to Account</Text>
              <TouchableOpacity onPress={() => setShowTransferModal(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            
            <View style={[styles.transferInfo, { backgroundColor: colors.bgSecondary }]}>
              <View style={[styles.transferInfoRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.transferLabel, { color: colors.textMuted }]}>From</Text>
                <Text style={[styles.transferValue, { color: colors.textPrimary }]}>Main Wallet</Text>
              </View>
              <View style={[styles.transferInfoRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.transferLabel, { color: colors.textMuted }]}>Available</Text>
                <Text style={[styles.transferValueGold, { color: colors.primary }]}>${walletBalance.toFixed(2)}</Text>
              </View>
              <View style={[styles.transferInfoRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.transferLabel, { color: colors.textMuted }]}>To</Text>
                <Text style={[styles.transferValue, { color: colors.textPrimary }]}>{selectedAccount?.accountId}</Text>
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Amount (USD)</Text>
            <TextInput
              style={[styles.transferInput, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              value={transferAmount}
              onChangeText={setTransferAmount}
              placeholder="Enter amount"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            <TouchableOpacity 
              style={[styles.transferSubmitBtn, isTransferring && styles.btnDisabled]}
              onPress={handleTransferFunds}
              disabled={isTransferring}
            >
              {isTransferring ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.transferSubmitBtnText}>Transfer to Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Withdraw Modal - Transfer from Account to Wallet */}
      <Modal visible={showWithdrawModal} animationType="slide" transparent onRequestClose={() => setShowWithdrawModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowWithdrawModal(false)} />
          <View style={[styles.transferModalContent, { backgroundColor: colors.bgCard }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Withdraw to Wallet</Text>
              <TouchableOpacity onPress={() => setShowWithdrawModal(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            
            <View style={[styles.transferInfo, { backgroundColor: colors.bgSecondary }]}>
              <View style={[styles.transferInfoRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.transferLabel, { color: colors.textMuted }]}>From</Text>
                <Text style={[styles.transferValue, { color: colors.textPrimary }]}>{selectedAccount?.accountId}</Text>
              </View>
              <View style={[styles.transferInfoRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.transferLabel, { color: colors.textMuted }]}>Available</Text>
                <Text style={[styles.transferValueGold, { color: colors.primary }]}>${(selectedAccount?.balance || 0).toFixed(2)}</Text>
              </View>
              <View style={[styles.transferInfoRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.transferLabel, { color: colors.textMuted }]}>To</Text>
                <Text style={[styles.transferValue, { color: colors.textPrimary }]}>Main Wallet</Text>
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Amount (USD)</Text>
            <TextInput
              style={[styles.transferInput, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              value={transferAmount}
              onChangeText={setTransferAmount}
              placeholder="Enter amount"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            <TouchableOpacity 
              style={[styles.withdrawSubmitBtn, { backgroundColor: colors.primary }, isTransferring && styles.btnDisabled]}
              onPress={handleWithdrawFromAccount}
              disabled={isTransferring}
            >
              {isTransferring ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.withdrawSubmitBtnText}>Withdraw to Wallet</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Withdrawal Request Modal - To Bank/UPI */}
      <Modal visible={showWithdrawRequestModal} animationType="slide" transparent onRequestClose={() => setShowWithdrawRequestModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowWithdrawRequestModal(false)} />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}>
            <View style={[styles.transferModalContent, { backgroundColor: colors.bgCard, maxHeight: '90%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Withdraw Funds</Text>
                <TouchableOpacity onPress={() => setShowWithdrawRequestModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              
              <View style={[styles.transferInfo, { backgroundColor: colors.bgSecondary }]}>
                <View style={[styles.transferInfoRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.transferLabel, { color: colors.textMuted }]}>Wallet Balance</Text>
                  <Text style={[styles.transferValueGold, { color: colors.primary }]}>${walletBalance.toFixed(2)}</Text>
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Amount (USD)</Text>
              <TextInput
                style={[styles.transferInput, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                value={transferAmount}
                onChangeText={setTransferAmount}
                placeholder="Enter amount"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />

              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Payment Method</Text>
              <View style={styles.methodRow}>
                <TouchableOpacity
                  style={[styles.methodBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.border }, withdrawMethod === 'Bank' && { backgroundColor: `${colors.primary}20`, borderColor: colors.primary }]}
                  onPress={() => setWithdrawMethod('Bank')}
                >
                  <Ionicons name="business-outline" size={20} color={withdrawMethod === 'Bank' ? colors.primary : colors.textMuted} />
                  <Text style={[styles.methodBtnText, { color: withdrawMethod === 'Bank' ? colors.primary : colors.textMuted }]}>Bank Transfer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.border }, withdrawMethod === 'UPI' && { backgroundColor: `${colors.primary}20`, borderColor: colors.primary }]}
                  onPress={() => setWithdrawMethod('UPI')}
                >
                  <Ionicons name="phone-portrait-outline" size={20} color={withdrawMethod === 'UPI' ? colors.primary : colors.textMuted} />
                  <Text style={[styles.methodBtnText, { color: withdrawMethod === 'UPI' ? colors.primary : colors.textMuted }]}>UPI</Text>
                </TouchableOpacity>
              </View>

              {withdrawMethod === 'Bank' && (
                <View>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Account Holder Name</Text>
                  <TextInput
                    style={[styles.transferInput, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                    value={bankDetails.accountHolderName}
                    onChangeText={(text) => setBankDetails({ ...bankDetails, accountHolderName: text })}
                    placeholder="Enter account holder name"
                    placeholderTextColor={colors.textMuted}
                  />
                  
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Bank Name</Text>
                  <TextInput
                    style={[styles.transferInput, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                    value={bankDetails.bankName}
                    onChangeText={(text) => setBankDetails({ ...bankDetails, bankName: text })}
                    placeholder="Enter bank name"
                    placeholderTextColor={colors.textMuted}
                  />
                  
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Account Number</Text>
                  <TextInput
                    style={[styles.transferInput, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                    value={bankDetails.accountNumber}
                    onChangeText={(text) => setBankDetails({ ...bankDetails, accountNumber: text })}
                    placeholder="Enter account number"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                  
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>IFSC Code</Text>
                  <TextInput
                    style={[styles.transferInput, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                    value={bankDetails.ifscCode}
                    onChangeText={(text) => setBankDetails({ ...bankDetails, ifscCode: text.toUpperCase() })}
                    placeholder="Enter IFSC code"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                  />
                </View>
              )}

              {withdrawMethod === 'UPI' && (
                <View>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>UPI ID</Text>
                  <TextInput
                    style={[styles.transferInput, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                    value={upiId}
                    onChangeText={setUpiId}
                    placeholder="Enter UPI ID (e.g., name@upi)"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />
                </View>
              )}

              <TouchableOpacity 
                style={[styles.withdrawSubmitBtn, { backgroundColor: colors.primary }, isTransferring && styles.btnDisabled]}
                onPress={handleWithdrawRequest}
                disabled={isTransferring}
              >
                {isTransferring ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.withdrawSubmitBtnText}>Submit Withdrawal Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Account to Account Transfer Modal */}
      <Modal visible={showAccountTransferModal} animationType="slide" transparent onRequestClose={() => setShowAccountTransferModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowAccountTransferModal(false)} />
          <View style={[styles.transferModalContent, { backgroundColor: colors.bgCard }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Transfer Between Accounts</Text>
              <TouchableOpacity onPress={() => setShowAccountTransferModal(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            
            <View style={[styles.transferInfo, { backgroundColor: colors.bgSecondary }]}>
              <View style={[styles.transferInfoRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.transferLabel, { color: colors.textMuted }]}>From</Text>
                <Text style={[styles.transferValue, { color: colors.textPrimary }]}>{selectedAccount?.accountId}</Text>
              </View>
              <View style={[styles.transferInfoRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.transferLabel, { color: colors.textMuted }]}>Available</Text>
                <Text style={[styles.transferValueGold, { color: colors.primary }]}>${(selectedAccount?.balance || 0).toFixed(2)}</Text>
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Select Target Account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
              {accounts.filter(a => a._id !== selectedAccount?._id).map(account => (
                <TouchableOpacity
                  key={account._id}
                  style={[styles.accountSelectCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border }, targetAccount?._id === account._id && styles.accountSelectCardActive]}
                  onPress={() => setTargetAccount(account)}
                >
                  <Text style={[styles.accountSelectId, { color: colors.textPrimary }, targetAccount?._id === account._id && { color: '#fff' }]}>{account.accountId}</Text>
                  <Text style={[styles.accountSelectBalance, { color: colors.textMuted }]}>${(account.balance || 0).toFixed(2)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Amount (USD)</Text>
            <TextInput
              style={[styles.transferInput, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              value={transferAmount}
              onChangeText={setTransferAmount}
              placeholder="Enter amount"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            <TouchableOpacity 
              style={[styles.transferSubmitBtn, { backgroundColor: colors.primary }, isTransferring && styles.btnDisabled]}
              onPress={handleAccountToAccountTransfer}
              disabled={isTransferring}
            >
              {isTransferring ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.transferSubmitBtnText}>Transfer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  accountCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  primaryCard: {
    borderColor: '#2563EB',
    borderWidth: 2,
  },
  primaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
    gap: 4,
  },
  primaryBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  accountIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2563EB20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountInfo: {
    flex: 1,
    marginLeft: 12,
  },
  accountId: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  accountType: {
    color: '#666',
    fontSize: 13,
    marginTop: 2,
  },
  balanceSection: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balanceItem: {
    alignItems: 'center',
  },
  balanceLabel: {
    color: '#666',
    fontSize: 12,
    marginBottom: 4,
  },
  balanceValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  depositBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: '#2563EB',
    borderRadius: 10,
  },
  depositBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  withdrawBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  withdrawBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  setPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 12,
  },
  setPrimaryBtnText: {
    color: '#2563EB',
    fontSize: 14,
  },
  tradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#2563EB',
    borderRadius: 10,
  },
  tradeBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '600',
  },
  openAccountBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Tabs Styles
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#2563EB',
  },
  tabText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  // Buy Challenge Styles
  buyChallengeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  buyChallengeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  walletBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E1E1E',
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  walletBalanceLabel: {
    color: '#888',
    fontSize: 14,
  },
  walletBalanceValue: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: 'bold',
  },
  challengesList: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  challengeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginVertical: 6,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  challengeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2563EB20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  challengeInfo: {
    flex: 1,
  },
  challengeName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  challengeDesc: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  challengeDetails: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  challengeDetail: {
    color: '#666',
    fontSize: 11,
  },
  buyBtnSmall: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buyBtnSmallText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  // Challenge Account Styles
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  challengeProgress: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  progressLabel: {
    color: '#888',
    fontSize: 12,
  },
  progressValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  accountTypesList: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  loadingTypes: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#666',
    marginTop: 12,
  },
  accountTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginVertical: 6,
    borderRadius: 12,
  },
  accountTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2563EB20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountTypeInfo: {
    flex: 1,
  },
  accountTypeName: {
    fontSize: 16,
    fontWeight: '600',
  },
  accountTypeDesc: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  accountTypeDetails: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  accountTypeDetail: {
    color: '#888',
    fontSize: 11,
  },
  backToTypesBtn: {
    flex: 1,
    backgroundColor: '#333',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  backToTypesBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  createAccountBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createAccountBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  
  // Transfer Modal Styles
  transferModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  transferInfo: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  transferInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  transferLabel: {
    color: '#888',
    fontSize: 14,
  },
  transferValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  transferValueGold: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: 'bold',
  },
  inputLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
    marginTop: 8,
  },
  transferInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    textAlign: 'center',
  },
  transferSubmitBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  transferSubmitBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  withdrawSubmitBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  withdrawSubmitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  accountsScroll: {
    marginVertical: 8,
  },
  accountSelectCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginRight: 10,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 1,
  },
  accountSelectCardActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  accountSelectId: {
    fontSize: 14,
    fontWeight: '600',
  },
  accountSelectBalance: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  // Wallet Card Styles
  walletCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  walletIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  walletInfo: {
    flex: 1,
  },
  walletTitle: {
    fontSize: 12,
    marginBottom: 2,
  },
  walletBalanceText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  walletWithdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  walletWithdrawBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Method Selection Styles
  methodRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  methodBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default AccountsScreen;
