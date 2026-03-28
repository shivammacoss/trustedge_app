import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Share,
  TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';
import { useTheme } from '../context/ThemeContext';

const IBScreen = ({ navigation, route }) => {
  const { colors, isDark } = useTheme();
  const hideMainHeader = route?.params?.hideMainHeader;
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ibProfile, setIbProfile] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [downline, setDownline] = useState([]);
  const [levelProgress, setLevelProgress] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchIBProfile();
    }
  }, [user]);

  useEffect(() => {
    if (ibProfile?._id && (ibProfile.status === 'ACTIVE' || ibProfile.ibStatus === 'ACTIVE')) {
      fetchReferrals();
      fetchCommissions();
      fetchDownline();
    }
  }, [ibProfile]);

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

  const fetchIBProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) { setLoading(false); return; }
      
      const res = await fetch(`${API_URL}/business/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!data.is_ib && !data.ib_status) {
        setIbProfile(null);
      } else {
        // Fetch full dashboard if IB is active
        const ibStatus = data.ib_status || data.status || 'PENDING';
        const profileData = {
          _id: data.id || user?.id,
          status: ibStatus.toUpperCase(),
          ibStatus: ibStatus.toUpperCase(),
          referralCode: data.referral_code || data.referralCode || '',
          ibWalletBalance: 0,
          totalCommissionEarned: 0,
          stats: {},
        };
        
        if (ibStatus.toUpperCase() === 'ACTIVE' || ibStatus.toUpperCase() === 'APPROVED') {
          try {
            const dashRes = await fetch(`${API_URL}/business/ib/dashboard`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (dashRes.ok) {
              const dash = await dashRes.json();
              profileData.ibWalletBalance = dash.wallet_balance || dash.ib_wallet_balance || 0;
              profileData.totalCommissionEarned = dash.total_commission || dash.total_earned || 0;
              profileData.stats = {
                directReferrals: dash.direct_referrals || dash.total_referrals || 0,
                totalDownline: dash.total_downline || 0,
              };
              profileData.referralCode = dash.referral_code || profileData.referralCode;
            }
          } catch (e) { console.error('Dashboard fetch error:', e); }
        }
        
        setIbProfile(profileData);
      }
    } catch (e) {
      console.error('Error fetching IB profile:', e);
      setIbProfile(null);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const fetchReferrals = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/business/ib/referrals`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const items = (data.items || data.referrals || []).map(r => ({
        ...r,
        _id: r.id || r._id,
        firstName: r.first_name || r.firstName,
        lastName: r.last_name || r.lastName,
        createdAt: r.created_at || r.createdAt,
      }));
      setReferrals(items);
    } catch (e) {
      console.error('Error fetching referrals:', e);
    }
  };

  const fetchCommissions = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/business/ib/commissions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const items = (data.items || data.commissions || []).map(c => ({
        ...c,
        _id: c.id || c._id,
      }));
      setCommissions(items);
    } catch (e) {
      console.error('Error fetching commissions:', e);
    }
  };

  const fetchDownline = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/business/ib/tree`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setDownline(data.tree?.downlines || data.downlines || data.items || []);
    } catch (e) {
      console.error('Error fetching downline:', e);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchIBProfile();
  };

  const handleApplyIB = async () => {
    setIsSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/business/apply`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Success', 'IB application submitted! Please wait for admin approval.');
        fetchIBProfile();
      } else {
        Alert.alert('Error', data.detail || data.message || 'Failed to apply');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to submit application');
    }
    setIsSubmitting(false);
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (parseFloat(withdrawAmount) > (ibProfile?.ibWalletBalance || 0)) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/ib/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          amount: parseFloat(withdrawAmount)
        })
      });
      const data = await res.json();
      if (data.status || data.success) {
        Alert.alert('Success', data.message || 'Withdrawal request submitted');
        setWithdrawAmount('');
        setShowWithdrawModal(false);
        fetchIBProfile();
      } else {
        Alert.alert('Error', data.message || 'Failed to withdraw');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to process withdrawal');
    }
    setIsSubmitting(false);
  };

  const copyReferralLink = async () => {
    if (ibProfile?.referralCode) {
      const link = `https://yourapp.com/signup?ref=${ibProfile.referralCode}`;
      await Clipboard.setStringAsync(link);
      Alert.alert('Copied!', 'Referral link copied to clipboard');
    }
  };

  const shareReferralLink = async () => {
    if (ibProfile?.referralCode) {
      try {
        await Share.share({
          message: `Join me on this amazing trading platform! Use my referral code: ${ibProfile.referralCode}\n\nSign up here: https://yourapp.com/signup?ref=${ibProfile.referralCode}`,
        });
      } catch (e) {
        console.error('Error sharing:', e);
      }
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const isActive = ibProfile?.status === 'ACTIVE' || ibProfile?.ibStatus === 'ACTIVE';
  const isPending = ibProfile?.status === 'PENDING' || ibProfile?.ibStatus === 'PENDING';
  const isRejected = ibProfile?.status === 'REJECTED' || ibProfile?.ibStatus === 'REJECTED';

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const tabs = ['overview', 'referrals', 'commissions', 'downline', 'withdraw'];

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {!hideMainHeader ? (
        <View style={[styles.header, { backgroundColor: colors.bgPrimary }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>IB Program</Text>
          <View style={{ width: 40 }} />
        </View>
      ) : null}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Not an IB - Show Apply */}
        {!ibProfile && (
          <View style={styles.applyContainer}>
            <View style={styles.applyIconContainer}>
              <Ionicons name="ribbon" size={48} color={colors.accent} />
            </View>
            <Text style={[styles.applyTitle, { color: colors.textPrimary }]}>Become an Introducing Broker</Text>
            <Text style={[styles.applySubtitle, { color: colors.textMuted }]}>Earn commissions by referring traders. Get up to 5 levels of referral commissions!</Text>
            
            <View style={[styles.benefitsCard, { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border }]}>
              <Text style={[styles.benefitsTitle, { color: colors.textPrimary }]}>Benefits:</Text>
              {[
                'Earn commission on every trade your referrals make',
                'Multi-level commissions (up to 5 levels)',
                'Real-time commission tracking',
                'Easy withdrawal to your wallet'
              ].map((benefit, idx) => (
                <View key={idx} style={styles.benefitRow}>
                  <Ionicons name="chevron-forward" size={16} color="#2563EB" />
                  <Text style={styles.benefitText}>{benefit}</Text>
                </View>
              ))}
            </View>
            
            <TouchableOpacity 
              style={[styles.applyBtn, isSubmitting && styles.btnDisabled]} 
              onPress={handleApplyIB}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.applyBtnText}>Apply Now</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Pending Status */}
        {isPending && (
          <View style={styles.statusContainer}>
            <View style={[styles.statusIconContainer, { backgroundColor: '#eab30830' }]}>
              <Ionicons name="time" size={48} color="#eab308" />
            </View>
            <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>Application Pending</Text>
            <Text style={[styles.statusSubtitle, { color: colors.textMuted }]}>Your IB application is under review. You will be notified once approved.</Text>
          </View>
        )}

        {/* Rejected Status */}
        {isRejected && (
          <View style={styles.statusContainer}>
            <View style={[styles.statusIconContainer, { backgroundColor: '#ef444430' }]}>
              <Ionicons name="close-circle" size={48} color="#ef4444" />
            </View>
            <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>Application Rejected</Text>
            <Text style={[styles.statusSubtitle, { color: colors.textMuted }]}>Unfortunately, your IB application was not approved.</Text>
            {ibProfile?.rejectionReason && (
              <Text style={styles.rejectionReason}>Reason: {ibProfile.rejectionReason}</Text>
            )}
          </View>
        )}

        {/* Active IB Dashboard */}
        {isActive && (
          <>
            {/* Stats Cards */}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={[styles.statIcon, { backgroundColor: '#22c55e20' }]}>
                  <Ionicons name="cash" size={20} color="#22c55e" />
                </View>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Available Balance</Text>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>${ibProfile?.ibWalletBalance?.toFixed(2) || '0.00'}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={[styles.statIcon, { backgroundColor: '#2563EB20' }]}>
                  <Ionicons name="trending-up" size={20} color="#2563EB" />
                </View>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total Earned</Text>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>${ibProfile?.totalCommissionEarned?.toFixed(2) || '0.00'}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={[styles.statIcon, { backgroundColor: '#a855f720' }]}>
                  <Ionicons name="people" size={20} color="#a855f7" />
                </View>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Direct Referrals</Text>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{ibProfile?.stats?.directReferrals || 0}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={[styles.statIcon, { backgroundColor: '#f9731620' }]}>
                  <Ionicons name="git-network" size={20} color="#f97316" />
                </View>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total Downline</Text>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{ibProfile?.stats?.totalDownline || 0}</Text>
              </View>
            </View>

            {/* Commission Rate & Referral Link */}
            <View style={styles.infoCardsRow}>
              {/* Commission Rate */}
              <View style={[styles.commissionRateCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Your Commission Rate</Text>
                <View style={styles.commissionRateRow}>
                  <View>
                    <Text style={[styles.commissionRateValue, { color: colors.textPrimary }]}>
                      ${levelProgress?.currentLevel?.commissionRate || 2}
                      <Text style={[styles.commissionRateUnit, { color: colors.textMuted }]}>/lot</Text>
                    </Text>
                    <Text style={[styles.levelName, { color: colors.textMuted }]}>Level: {levelProgress?.currentLevel?.name || 'Standard'}</Text>
                  </View>
                  <View style={[styles.commissionIcon, { backgroundColor: (levelProgress?.currentLevel?.color || '#22c55e') + '30' }]}>
                    <Ionicons name="cash" size={24} color={levelProgress?.currentLevel?.color || '#22c55e'} />
                  </View>
                </View>
              </View>
            </View>

            {/* Referral Link Card */}
            <View style={styles.referralLinkCard}>
              <Text style={styles.referralLinkLabel}>Your Referral Link</Text>
              <Text style={styles.referralLinkText} numberOfLines={1}>
                https://yourapp.com/signup?ref={ibProfile?.referralCode}
              </Text>
              <Text style={styles.referralCodeText}>Code: <Text style={styles.referralCodeBold}>{ibProfile?.referralCode}</Text></Text>
              <View style={styles.referralActions}>
                <TouchableOpacity style={styles.copyBtn} onPress={copyReferralLink}>
                  <Ionicons name="copy-outline" size={18} color="#fff" />
                  <Text style={styles.copyBtnText}>Copy Link</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareBtn} onPress={shareReferralLink}>
                  <Ionicons name="share-outline" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Level Progress */}
            {levelProgress?.nextLevel && (
              <View style={[styles.levelProgressCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={styles.levelProgressHeader}>
                  <Ionicons name="ribbon" size={20} color="#2563EB" />
                  <Text style={[styles.levelProgressTitle, { color: colors.textPrimary }]}>Commission Levels</Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View style={styles.progressBarLabels}>
                    <Text style={styles.progressLabel}>Progress to {levelProgress.nextLevel.name}</Text>
                    <Text style={styles.progressPercent}>{levelProgress.progressPercent}%</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${levelProgress.progressPercent}%` }]} />
                  </View>
                  <Text style={styles.progressHint}>
                    {levelProgress.referralsNeeded} more referrals needed for {levelProgress.nextLevel.name}
                  </Text>
                </View>
              </View>
            )}

            {/* Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
              <View style={styles.tabs}>
                {tabs.map(tab => (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.tab, activeTab === tab && styles.tabActive]}
                    onPress={() => setActiveTab(tab)}
                  >
                    <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Tab Content */}
            <View style={styles.tabContent}>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <View style={styles.levelStatsGrid}>
                  {[1, 2, 3, 4, 5].map(level => (
                    <View key={level} style={[styles.levelStatCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                      <Text style={[styles.levelStatLabel, { color: colors.textMuted }]}>Level {level}</Text>
                      <Text style={[styles.levelStatValue, { color: colors.textPrimary }]}>{ibProfile?.stats?.[`level${level}Count`] || 0}</Text>
                      <Text style={[styles.levelStatSubLabel, { color: colors.textMuted }]}>trades</Text>
                      <Text style={styles.levelStatCommission}>${(ibProfile?.stats?.[`level${level}Commission`] || 0).toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Referrals Tab */}
              {activeTab === 'referrals' && (
                <View>
                  {referrals.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="people-outline" size={48} color={colors.textMuted} />
                      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Referrals Yet</Text>
                      <Text style={styles.emptyText}>Share your referral link to start earning</Text>
                    </View>
                  ) : (
                    referrals.map((ref) => (
                      <View key={ref._id} style={[styles.referralItem, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                        <View style={styles.referralAvatar}>
                          <Text style={styles.avatarText}>{ref.firstName?.charAt(0)}</Text>
                        </View>
                        <View style={styles.referralInfo}>
                          <Text style={[styles.referralName, { color: colors.textPrimary }]}>{ref.firstName} {ref.lastName}</Text>
                          <Text style={styles.referralEmail}>{ref.email}</Text>
                        </View>
                        <Text style={styles.referralDate}>{formatDate(ref.createdAt)}</Text>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* Commissions Tab */}
              {activeTab === 'commissions' && (
                <View>
                  {commissions.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="cash-outline" size={48} color={colors.textMuted} />
                      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Commissions Yet</Text>
                      <Text style={styles.emptyText}>Commissions will appear when your referrals trade</Text>
                    </View>
                  ) : (
                    commissions.map((comm) => (
                      <View key={comm._id} style={[styles.commissionItem, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                        <View style={styles.commissionItemLeft}>
                          <Text style={[styles.commissionSymbol, { color: colors.textPrimary }]}>{comm.symbol}</Text>
                          <Text style={styles.commissionMeta}>Level {comm.level} • {comm.tradeLotSize?.toFixed(2)} lots</Text>
                        </View>
                        <View style={styles.commissionItemRight}>
                          <Text style={styles.commissionAmount}>${comm.commissionAmount?.toFixed(2)}</Text>
                          <View style={[styles.commissionStatus, { backgroundColor: comm.status === 'CREDITED' ? '#22c55e20' : '#ef444420' }]}>
                            <Text style={[styles.commissionStatusText, { color: comm.status === 'CREDITED' ? '#22c55e' : '#ef4444' }]}>{comm.status}</Text>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* Downline Tab */}
              {activeTab === 'downline' && (
                <View>
                  {downline.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="git-network-outline" size={48} color={colors.textMuted} />
                      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Downline Yet</Text>
                      <Text style={styles.emptyText}>Your referral network will appear here</Text>
                    </View>
                  ) : (
                    downline.map((node, idx) => (
                      <View key={node._id || idx} style={[styles.downlineItem, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                        <View style={[styles.downlineAvatar, { backgroundColor: node.isIB ? '#2563EB30' : '#33333' }]}>
                          <Text style={[styles.avatarText, { color: node.isIB ? '#2563EB' : '#888' }]}>{node.firstName?.charAt(0) || '?'}</Text>
                        </View>
                        <View style={styles.downlineInfo}>
                          <Text style={[styles.downlineName, { color: colors.textPrimary }]}>{node.firstName || 'Unknown'}</Text>
                          <Text style={styles.downlineEmail}>{node.email}</Text>
                        </View>
                        <View style={[styles.downlineBadge, { backgroundColor: node.isIB ? '#2563EB20' : '#33333' }]}>
                          <Text style={[styles.downlineBadgeText, { color: node.isIB ? '#2563EB' : '#888' }]}>
                            {node.isIB ? 'IB' : 'User'} • L{(node.level || 0) + 1}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* Withdraw Tab */}
              {activeTab === 'withdraw' && (
                <View style={styles.withdrawContainer}>
                  <View style={[styles.withdrawBalanceCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                    <Text style={[styles.withdrawBalanceLabel, { color: colors.textMuted }]}>Available to Withdraw</Text>
                    <Text style={styles.withdrawBalanceValue}>${ibProfile?.ibWalletBalance?.toFixed(2) || '0.00'}</Text>
                  </View>
                  
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Withdrawal Amount</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary }]}
                    value={withdrawAmount}
                    onChangeText={setWithdrawAmount}
                    placeholder="Enter amount"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                  
                  <TouchableOpacity 
                    style={[styles.withdrawBtn, isSubmitting && styles.btnDisabled]} 
                    onPress={handleWithdraw}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <Text style={styles.withdrawBtnText}>Request Withdrawal</Text>
                    )}
                  </TouchableOpacity>

                  {ibProfile?.pendingWithdrawal > 0 && (
                    <View style={styles.pendingWithdrawal}>
                      <Ionicons name="time-outline" size={16} color="#eab308" />
                      <Text style={styles.pendingWithdrawalText}>Pending: ${ibProfile.pendingWithdrawal.toFixed(2)}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  
  // Apply Container
  applyContainer: { padding: 20, alignItems: 'center' },
  applyIconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2563EB20', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  applyTitle: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  applySubtitle: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  benefitsCard: { borderRadius: 16, padding: 16, width: '100%', marginBottom: 20 },
  benefitsTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  benefitText: { color: '#888', fontSize: 13, flex: 1 },
  applyBtn: { backgroundColor: '#2563EB', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 12 },
  applyBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  btnDisabled: { opacity: 0.6 },
  
  // Status Container
  statusContainer: { padding: 20, alignItems: 'center' },
  statusIconContainer: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  statusTitle: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  statusSubtitle: { color: '#888', fontSize: 14, textAlign: 'center' },
  rejectionReason: { color: '#ef4444', fontSize: 13, marginTop: 12, textAlign: 'center' },
  
  // Stats Grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginBottom: 12 },
  statCard: { width: '48%', borderRadius: 14, padding: 14, borderWidth: 1 },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statLabel: { color: '#888', fontSize: 11 },
  statValue: { fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  
  // Info Cards
  infoCardsRow: { paddingHorizontal: 16, marginBottom: 12 },
  commissionRateCard: { borderRadius: 14, padding: 16, borderWidth: 1 },
  cardLabel: { color: '#888', fontSize: 12, marginBottom: 8 },
  commissionRateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  commissionRateValue: { fontSize: 28, fontWeight: 'bold' },
  commissionRateUnit: { color: '#888', fontSize: 14, fontWeight: 'normal' },
  levelName: { color: '#888', fontSize: 12, marginTop: 4 },
  commissionIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  
  // Referral Link Card
  referralLinkCard: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 14, backgroundColor: '#7c3aed' },
  referralLinkLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginBottom: 4 },
  referralLinkText: { color: '#fff', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 },
  referralCodeText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 12 },
  referralCodeBold: { color: '#fff', fontWeight: 'bold' },
  referralActions: { flexDirection: 'row', gap: 8 },
  copyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 10, borderRadius: 8 },
  copyBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  shareBtn: { width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  
  // Level Progress
  levelProgressCard: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 14, borderWidth: 1 },
  levelProgressHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  levelProgressTitle: { fontSize: 15, fontWeight: '600' },
  progressBarContainer: {},
  progressBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { color: '#888', fontSize: 12 },
  progressPercent: { color: '#2563EB', fontSize: 12, fontWeight: '600' },
  progressBarBg: { height: 6, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#2563EB', borderRadius: 3 },
  progressHint: { color: '#666', fontSize: 11, marginTop: 6 },
  
  // Tabs
  tabsScroll: { marginBottom: 12 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  tabActive: { backgroundColor: '#2563EB' },
  tabText: { color: '#888', fontSize: 12, fontWeight: '500' },
  tabTextActive: { color: '#000' },
  
  // Tab Content
  tabContent: { paddingHorizontal: 16 },
  
  // Level Stats Grid
  levelStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelStatCard: { width: '31%', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1 },
  levelStatLabel: { color: '#888', fontSize: 10 },
  levelStatValue: { fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  levelStatSubLabel: { color: '#666', fontSize: 10 },
  levelStatCommission: { color: '#22c55e', fontSize: 12, fontWeight: '600', marginTop: 4 },
  
  // Empty State
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptyText: { color: '#666', fontSize: 13, marginTop: 6, textAlign: 'center' },
  
  // Referral Item
  referralItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1 },
  referralAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2563EB30', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#2563EB', fontSize: 16, fontWeight: 'bold' },
  referralInfo: { flex: 1, marginLeft: 12 },
  referralName: { fontSize: 14, fontWeight: '600' },
  referralEmail: { color: '#666', fontSize: 12, marginTop: 2 },
  referralDate: { color: '#666', fontSize: 11 },
  
  // Commission Item
  commissionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1 },
  commissionItemLeft: {},
  commissionSymbol: { fontSize: 14, fontWeight: '600' },
  commissionMeta: { color: '#666', fontSize: 11, marginTop: 2 },
  commissionItemRight: { alignItems: 'flex-end' },
  commissionAmount: { color: '#22c55e', fontSize: 15, fontWeight: '600' },
  commissionStatus: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  commissionStatusText: { fontSize: 10, fontWeight: '600' },
  
  // Downline Item
  downlineItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1 },
  downlineAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  downlineInfo: { flex: 1, marginLeft: 12 },
  downlineName: { fontSize: 14, fontWeight: '500' },
  downlineEmail: { color: '#666', fontSize: 11, marginTop: 2 },
  downlineBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  downlineBadgeText: { fontSize: 10, fontWeight: '600' },
  
  // Withdraw
  withdrawContainer: {},
  withdrawBalanceCard: { borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 20, borderWidth: 1 },
  withdrawBalanceLabel: { color: '#888', fontSize: 12 },
  withdrawBalanceValue: { color: '#22c55e', fontSize: 32, fontWeight: 'bold', marginTop: 8 },
  inputLabel: { color: '#888', fontSize: 12, marginBottom: 8 },
  input: { borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1, marginBottom: 16 },
  withdrawBtn: { backgroundColor: '#2563EB', padding: 16, borderRadius: 12, alignItems: 'center' },
  withdrawBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  pendingWithdrawal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  pendingWithdrawalText: { color: '#eab308', fontSize: 13 },
});

export default IBScreen;
