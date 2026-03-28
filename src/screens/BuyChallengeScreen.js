import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '../context/ThemeContext';
import { API_URL } from '../config';

const BuyChallengeScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [buying, setBuying] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);

  // Selection state
  const [selectedType, setSelectedType] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedChallenge, setSelectedChallenge] = useState(null);

  useEffect(() => {
    loadUser();
    fetchChallenges();
    fetchWalletBalance();
  }, []);

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

  const fetchChallenges = async () => {
    try {
      const res = await fetch(`${API_URL}/prop/challenges`);
      const data = await res.json();
      if (data.success) {
        setChallenges(data.challenges || []);
        setEnabled(data.enabled);
      }
    } catch (error) {
      console.error('Error fetching challenges:', error);
    }
    setLoading(false);
  };

  const fetchWalletBalance = async () => {
    try {
      const userData = await SecureStore.getItemAsync('user');
      if (userData) {
        const parsed = JSON.parse(userData);
        const res = await fetch(`${API_URL}/wallet/${parsed._id}`);
        const data = await res.json();
        // API returns { wallet: { balance: ... } }
        setWalletBalance(data.wallet?.balance || 0);
      }
    } catch (e) {
      console.error('Error fetching wallet:', e);
    }
  };

  // Group challenges by type
  const challengeTypes = [...new Set(challenges.map(c => c.stepsCount))].sort();
  const accountSizes = selectedType !== null
    ? [...new Set(challenges.filter(c => c.stepsCount === selectedType).map(c => c.fundSize))].sort((a, b) => a - b)
    : [];

  // Find matching challenge
  useEffect(() => {
    if (selectedType !== null && selectedSize !== null) {
      const match = challenges.find(c => c.stepsCount === selectedType && c.fundSize === selectedSize);
      setSelectedChallenge(match || null);
    } else {
      setSelectedChallenge(null);
    }
  }, [selectedType, selectedSize, challenges]);

  const getStepLabel = (steps) => {
    if (steps === 0) return 'Instant Fund';
    if (steps === 1) return 'One Step';
    return 'Two Step';
  };

  const handleBuyChallenge = async () => {
    if (!user?._id) {
      Alert.alert('Error', 'Please login to buy a challenge');
      return;
    }
    if (!selectedChallenge) {
      Alert.alert('Error', 'Please select a challenge');
      return;
    }
    if (!agreedToTerms) {
      Alert.alert('Error', 'Please agree to the terms and conditions');
      return;
    }

    const challengeFee = selectedChallenge.challengeFee || 0;
    if (walletBalance < challengeFee) {
      Alert.alert('Insufficient Balance', `You need $${challengeFee} to buy this challenge. Your balance: $${walletBalance.toFixed(2)}`);
      return;
    }

    setBuying(true);
    try {
      const res = await fetch(`${API_URL}/prop/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          challengeId: selectedChallenge._id,
          paymentId: `PAY${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Success', 'Challenge purchased successfully!', [
          { text: 'OK', onPress: () => {
            // Navigate back and trigger refresh of challenge accounts
            navigation.navigate('MainTrading');
          }}
        ]);
      } else {
        Alert.alert('Error', data.message || 'Failed to purchase challenge');
      }
    } catch (error) {
      console.error('Error buying challenge:', error);
      Alert.alert('Error', 'Error purchasing challenge');
    }
    setBuying(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading challenges...</Text>
        </View>
      </View>
    );
  }

  if (!enabled) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={[styles.header, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>New Challenge</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.disabledContainer}>
          <Ionicons name="trophy-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.disabledTitle, { color: colors.textPrimary }]}>Challenges Coming Soon</Text>
          <Text style={[styles.disabledText, { color: colors.textMuted }]}>Prop trading challenges are not available at the moment.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="trophy" size={24} color={colors.accent} />
          <View style={{ marginLeft: 8 }}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>New Challenge</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>Choose the type of challenge</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Challenge Type Selection */}
        <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Challenge Type</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>Choose the type of challenge you want to take</Text>
          <View style={styles.typeGrid}>
            {challengeTypes.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeCard,
                  { backgroundColor: colors.bgSecondary, borderColor: colors.border },
                  selectedType === type && { borderColor: colors.accent, backgroundColor: colors.accent + '15' }
                ]}
                onPress={() => {
                  setSelectedType(type);
                  setSelectedSize(null);
                }}
              >
                <View style={styles.typeCardContent}>
                  <View style={[styles.radioOuter, selectedType === type && { borderColor: colors.accent }]}>
                    {selectedType === type && <View style={[styles.radioInner, { backgroundColor: colors.accent }]} />}
                  </View>
                  <Text style={[styles.typeLabel, { color: colors.textPrimary }]}>{getStepLabel(type)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Account Size Selection */}
        {selectedType !== null && (
          <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Account Size</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>Choose your preferred account size</Text>
            <View style={styles.sizeGrid}>
              {accountSizes.map((size) => (
                <TouchableOpacity
                  key={size}
                  style={[
                    styles.sizeCard,
                    { backgroundColor: colors.bgSecondary, borderColor: colors.border },
                    selectedSize === size && { borderColor: colors.accent, backgroundColor: colors.accent + '15' }
                  ]}
                  onPress={() => setSelectedSize(size)}
                >
                  <View style={styles.typeCardContent}>
                    <View style={[styles.radioOuter, selectedSize === size && { borderColor: colors.accent }]}>
                      {selectedSize === size && <View style={[styles.radioInner, { backgroundColor: colors.accent }]} />}
                    </View>
                    <Text style={[styles.sizeLabel, { color: colors.textPrimary }]}>${size.toLocaleString()}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Trading Rules */}
        {selectedChallenge && (
          <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={styles.rulesHeader}>
              <View style={[styles.rulesIcon, { backgroundColor: colors.accent + '20' }]}>
                <Ionicons name="document-text" size={20} color={colors.accent} />
              </View>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Trading Rules</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>Challenge parameters you must follow</Text>
              </View>
            </View>

            <View style={styles.rulesGrid}>
              <View style={[styles.ruleItem, { backgroundColor: colors.bgSecondary }]}>
                <Text style={[styles.ruleLabel, { color: colors.textMuted }]}>Daily Drawdown</Text>
                <Text style={[styles.ruleValue, { color: '#ef4444' }]}>{selectedChallenge.rules?.maxDailyDrawdownPercent || 5}%</Text>
              </View>
              <View style={[styles.ruleItem, { backgroundColor: colors.bgSecondary }]}>
                <Text style={[styles.ruleLabel, { color: colors.textMuted }]}>Max Drawdown</Text>
                <Text style={[styles.ruleValue, { color: '#ef4444' }]}>{selectedChallenge.rules?.maxOverallDrawdownPercent || 10}%</Text>
              </View>
              {selectedChallenge.stepsCount > 0 && (
                <View style={[styles.ruleItem, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.ruleLabel, { color: colors.textMuted }]}>Profit Target</Text>
                  <Text style={[styles.ruleValue, { color: '#22c55e' }]}>{selectedChallenge.rules?.profitTargetPhase1Percent || 8}%</Text>
                </View>
              )}
              <View style={[styles.ruleItem, { backgroundColor: colors.bgSecondary }]}>
                <Text style={[styles.ruleLabel, { color: colors.textMuted }]}>Time Limit</Text>
                <Text style={[styles.ruleValue, { color: colors.textPrimary }]}>{selectedChallenge.rules?.challengeExpiryDays || 30} days</Text>
              </View>
              <View style={[styles.ruleItem, { backgroundColor: colors.bgSecondary }]}>
                <Text style={[styles.ruleLabel, { color: colors.textMuted }]}>Min Lot Size</Text>
                <Text style={[styles.ruleValue, { color: colors.textPrimary }]}>{selectedChallenge.rules?.minLotSize || 0.01}</Text>
              </View>
              <View style={[styles.ruleItem, { backgroundColor: colors.bgSecondary }]}>
                <Text style={[styles.ruleLabel, { color: colors.textMuted }]}>Max Lot Size</Text>
                <Text style={[styles.ruleValue, { color: colors.textPrimary }]}>{selectedChallenge.rules?.maxLotSize || 100}</Text>
              </View>
              <View style={[styles.ruleItem, { backgroundColor: colors.bgSecondary }]}>
                <Text style={[styles.ruleLabel, { color: colors.textMuted }]}>Max Leverage</Text>
                <Text style={[styles.ruleValue, { color: colors.textPrimary }]}>1:{selectedChallenge.rules?.maxLeverage || 100}</Text>
              </View>
              <View style={[styles.ruleItem, { backgroundColor: colors.bgSecondary }]}>
                <Text style={[styles.ruleLabel, { color: colors.textMuted }]}>Profit Split</Text>
                <Text style={[styles.ruleValue, { color: colors.accent }]}>{selectedChallenge.fundedSettings?.profitSplitPercent || 80}%</Text>
              </View>
            </View>

            {/* Rule Toggles */}
            <View style={styles.ruleToggles}>
              <View style={[styles.ruleToggle, { backgroundColor: selectedChallenge.rules?.stopLossMandatory ? '#eab30820' : colors.bgSecondary }]}>
                <Ionicons name={selectedChallenge.rules?.stopLossMandatory ? 'checkmark-circle' : 'close-circle'} size={16} color={selectedChallenge.rules?.stopLossMandatory ? '#eab308' : colors.textMuted} />
                <Text style={[styles.ruleToggleText, { color: selectedChallenge.rules?.stopLossMandatory ? '#eab308' : colors.textMuted }]}>Stop Loss Required</Text>
              </View>
              <View style={[styles.ruleToggle, { backgroundColor: selectedChallenge.rules?.allowWeekendHolding ? '#22c55e20' : '#ef444420' }]}>
                <Ionicons name={selectedChallenge.rules?.allowWeekendHolding ? 'checkmark-circle' : 'close-circle'} size={16} color={selectedChallenge.rules?.allowWeekendHolding ? '#22c55e' : '#ef4444'} />
                <Text style={[styles.ruleToggleText, { color: selectedChallenge.rules?.allowWeekendHolding ? '#22c55e' : '#ef4444' }]}>Weekend Holding</Text>
              </View>
              <View style={[styles.ruleToggle, { backgroundColor: selectedChallenge.rules?.allowNewsTrading ? '#22c55e20' : '#ef444420' }]}>
                <Ionicons name={selectedChallenge.rules?.allowNewsTrading ? 'checkmark-circle' : 'close-circle'} size={16} color={selectedChallenge.rules?.allowNewsTrading ? '#22c55e' : '#ef4444'} />
                <Text style={[styles.ruleToggleText, { color: selectedChallenge.rules?.allowNewsTrading ? '#22c55e' : '#ef4444' }]}>News Trading</Text>
              </View>
            </View>
          </View>
        )}

        {/* Order Summary */}
        <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Order Summary</Text>
          {selectedChallenge ? (
            <View style={styles.orderSummary}>
              <View style={styles.orderRow}>
                <View>
                  <Text style={[styles.orderTitle, { color: colors.textPrimary }]}>${selectedChallenge.fundSize.toLocaleString()} — {getStepLabel(selectedChallenge.stepsCount)}</Text>
                  <Text style={[styles.orderSubtitle, { color: colors.textMuted }]}>{selectedChallenge.name}</Text>
                </View>
                <Text style={[styles.orderPrice, { color: colors.textPrimary }]}>${selectedChallenge.challengeFee.toLocaleString()}</Text>
              </View>
              <View style={[styles.orderDivider, { backgroundColor: colors.border }]} />
              <View style={styles.orderRow}>
                <Text style={[styles.orderTotalLabel, { color: colors.textPrimary }]}>Total</Text>
                <Text style={[styles.orderTotalValue, { color: colors.textPrimary }]}>${selectedChallenge.challengeFee.toLocaleString()}</Text>
              </View>
              <View style={[styles.walletInfo, { backgroundColor: colors.bgSecondary }]}>
                <Ionicons name="wallet" size={16} color={colors.accent} />
                <Text style={[styles.walletInfoText, { color: colors.textMuted }]}>Wallet Balance: </Text>
                <Text style={[styles.walletInfoValue, { color: walletBalance >= selectedChallenge.challengeFee ? '#22c55e' : '#ef4444' }]}>${walletBalance.toFixed(2)}</Text>
              </View>
            </View>
          ) : (
            <Text style={[styles.noSelection, { color: colors.textMuted }]}>Select a challenge type and account size</Text>
          )}
        </View>

        {/* Terms Agreement */}
        <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.termsRow} onPress={() => setAgreedToTerms(!agreedToTerms)}>
            <View style={[styles.checkbox, agreedToTerms && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
              {agreedToTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <View style={styles.termsContent}>
              <Text style={[styles.termsTitle, { color: colors.textMuted }]}>I agree with all the following terms:</Text>
              <View style={styles.termsList}>
                <Text style={[styles.termsItem, { color: colors.textMuted }]}>• I have read and agreed to the <Text style={{ color: colors.accent }} onPress={() => setShowTermsModal(true)}>Terms of Use</Text></Text>
                <Text style={[styles.termsItem, { color: colors.textMuted }]}>• All information provided is correct</Text>
                <Text style={[styles.termsItem, { color: colors.textMuted }]}>• I have read and agree with the <Text style={{ color: colors.accent }} onPress={() => setShowTermsModal(true)}>Terms & Conditions</Text></Text>
                <Text style={[styles.termsItem, { color: colors.textMuted }]}>• I understand the trading rules and risks</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Buy Button */}
        <TouchableOpacity
          style={[styles.buyButton, (!selectedChallenge || !agreedToTerms || buying) && styles.buyButtonDisabled]}
          onPress={handleBuyChallenge}
          disabled={!selectedChallenge || !agreedToTerms || buying}
        >
          {buying ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Text style={styles.buyButtonText}>Continue to Payment</Text>
              <Ionicons name="chevron-forward" size={20} color="#000" />
            </>
          )}
        </TouchableOpacity>

        {/* How It Works */}
        <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.howItWorksTitle, { color: colors.textPrimary }]}>How It Works</Text>
          <View style={styles.stepsContainer}>
            {[
              { step: 1, title: 'Buy Challenge', desc: 'Choose your account size and pay the one-time fee.' },
              { step: 2, title: 'Pass Evaluation', desc: 'Trade within the rules and hit your profit target.' },
              { step: 3, title: 'Get Funded', desc: 'Receive your funded account and start earning.' }
            ].map((item) => (
              <View key={item.step} style={styles.stepItem}>
                <View style={[styles.stepNumber, { backgroundColor: colors.accent + '20' }]}>
                  <Text style={[styles.stepNumberText, { color: colors.accent }]}>{item.step}</Text>
                </View>
                <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                <Text style={[styles.stepDesc, { color: colors.textMuted }]}>{item.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Warning */}
        <View style={[styles.warningBox, { backgroundColor: '#eab30815', borderColor: '#eab30830' }]}>
          <Ionicons name="warning" size={20} color="#eab308" />
          <View style={styles.warningContent}>
            <Text style={[styles.warningTitle, { color: '#eab308' }]}>Important Rules</Text>
            <Text style={[styles.warningText, { color: colors.textMuted }]}>
              Breaking any rule will result in immediate account failure. All trades must follow the challenge rules. Make sure to review all trading parameters before starting.
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Terms Modal */}
      <Modal visible={showTermsModal} animationType="slide" transparent onRequestClose={() => setShowTermsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.bgCard }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Terms & Conditions</Text>
              <TouchableOpacity onPress={() => setShowTermsModal(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={[styles.modalSectionTitle, { color: colors.textPrimary }]}>Challenge Rules</Text>
              <View style={styles.modalList}>
                <Text style={[styles.modalListItem, { color: colors.textMuted }]}>• You must not exceed the maximum daily drawdown limit</Text>
                <Text style={[styles.modalListItem, { color: colors.textMuted }]}>• You must not exceed the maximum overall drawdown limit</Text>
                <Text style={[styles.modalListItem, { color: colors.textMuted }]}>• All trades must have a stop loss if required by the challenge</Text>
                <Text style={[styles.modalListItem, { color: colors.textMuted }]}>• You must reach the profit target within the time limit</Text>
                <Text style={[styles.modalListItem, { color: colors.textMuted }]}>• Lot sizes must be within the specified range</Text>
                <Text style={[styles.modalListItem, { color: colors.textMuted }]}>• Weekend holding rules must be followed</Text>
                <Text style={[styles.modalListItem, { color: colors.textMuted }]}>• News trading restrictions apply if specified</Text>
              </View>
              <Text style={[styles.modalSectionTitle, { color: colors.textPrimary, marginTop: 20 }]}>Account Termination</Text>
              <Text style={[styles.modalText, { color: colors.textMuted }]}>Your challenge account will be terminated if you break any of the above rules. No refunds will be provided for terminated accounts.</Text>
              <Text style={[styles.modalSectionTitle, { color: colors.textPrimary, marginTop: 20 }]}>Funded Account</Text>
              <Text style={[styles.modalText, { color: colors.textMuted }]}>Upon successfully completing the challenge, you will receive a funded account with the specified profit split. Withdrawals are subject to the withdrawal frequency rules.</Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalAgreeBtn}
              onPress={() => {
                setAgreedToTerms(true);
                setShowTermsModal(false);
              }}
            >
              <Text style={styles.modalAgreeBtnText}>I Agree to Terms</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 12,
  },
  disabledContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  disabledTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  disabledText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    marginBottom: 16,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
  },
  typeCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 2,
  },
  typeCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  radioOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  sizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sizeCard: {
    width: '48%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
  },
  sizeLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  rulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  rulesIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rulesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  ruleItem: {
    width: '48%',
    padding: 12,
    borderRadius: 10,
  },
  ruleLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  ruleValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  ruleToggles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  ruleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  ruleToggleText: {
    fontSize: 12,
  },
  orderSummary: {
    marginTop: 8,
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  orderSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  orderPrice: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  orderDivider: {
    height: 1,
    marginVertical: 12,
  },
  orderTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  orderTotalValue: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  walletInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  walletInfoText: {
    fontSize: 13,
  },
  walletInfoValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  noSelection: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 14,
  },
  termsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  termsContent: {
    flex: 1,
  },
  termsTitle: {
    fontSize: 13,
    marginBottom: 8,
  },
  termsList: {
    gap: 4,
  },
  termsItem: {
    fontSize: 12,
    lineHeight: 18,
  },
  buyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f59e0b',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  buyButtonDisabled: {
    opacity: 0.5,
  },
  buyButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  howItWorksTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  stepNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 16,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  modalList: {
    gap: 8,
  },
  modalListItem: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalText: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalAgreeBtn: {
    margin: 16,
    backgroundColor: '#f59e0b',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalAgreeBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
});

export default BuyChallengeScreen;
