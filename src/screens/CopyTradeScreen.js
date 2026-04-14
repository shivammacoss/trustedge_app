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
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';
import { useTheme } from '../context/ThemeContext';

const CopyTradeScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('discover');
  const [masters, setMasters] = useState([]);
  const [mySubscriptions, setMySubscriptions] = useState([]);
  const [myCopyTrades, setMyCopyTrades] = useState([]);
  const [myFollowers, setMyFollowers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [selectedMaster, setSelectedMaster] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [copyMode, setCopyMode] = useState('FIXED_LOT');
  const [copyValue, setCopyValue] = useState('0.01');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingMasters, setLoadingMasters] = useState(false);
  
  // Master trader states
  const [myMasterProfile, setMyMasterProfile] = useState(null);
  const [showMasterModal, setShowMasterModal] = useState(false);
  const [masterForm, setMasterForm] = useState({
    displayName: '',
    description: '',
    tradingAccountId: '',
    requestedCommissionPercentage: '10'
  });
  const [applyingMaster, setApplyingMaster] = useState(false);
  
  // Edit subscription states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState(null);
  const [editCopyMode, setEditCopyMode] = useState('FIXED_LOT');
  const [editCopyValue, setEditCopyValue] = useState('0.01');

  useEffect(() => {
    loadUser();
    // Fetch masters immediately - doesn't require user auth
    fetchMasters();
  }, []);

  useEffect(() => {
    if (user) {
      // Set loading false early to show UI, then fetch data in background
      setLoading(false);
      // Fetch user-specific data
      fetchMySubscriptions();
      fetchMyCopyTrades();
      fetchAccounts();
      fetchMyMasterProfile();
    }
  }, [user]);

  useEffect(() => {
    if (myMasterProfile?._id) {
      fetchMyFollowers();
    }
  }, [myMasterProfile]);

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

  const fetchAllData = async () => {
    try {
      await Promise.all([
        fetchMasters(),
        fetchMySubscriptions(),
        fetchMyCopyTrades(),
        fetchAccounts(),
        fetchMyMasterProfile()
      ]);
    } catch (e) {
      console.error('Error fetching data:', e);
    }
    setRefreshing(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
  };

  const fetchMasters = async () => {
    setLoadingMasters(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/social/masters`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { setMasters([]); setLoadingMasters(false); return; }
      const data = await res.json();
      const mastersList = data.items || data.masters || data || [];
      setMasters(Array.isArray(mastersList) ? mastersList : []);
    } catch (e) {
      console.warn('Error fetching masters:', e.message);
    }
    setLoadingMasters(false);
  };

  const fetchMySubscriptions = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;
      const res = await fetch(`${API_URL}/social/subscriptions`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { setMySubscriptions([]); return; }
      const data = await res.json();
      setMySubscriptions(data.items || data.subscriptions || data || []);
    } catch (e) {
      console.error('Error fetching subscriptions:', e);
    }
  };

  const fetchMyCopyTrades = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;
      const res = await fetch(`${API_URL}/portfolio/trades?per_page=50`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { setMyCopyTrades([]); return; }
      const data = await res.json();
      setMyCopyTrades(data.items || data || []);
    } catch (e) {
      console.error('Error fetching copy trades:', e);
    }
  };

  const fetchAccounts = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;
      const res = await fetch(`${API_URL}/accounts`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { setAccounts([]); return; }
      const data = await res.json();
      const items = data.items || data || [];
      const mapped = items.map(a => ({
        ...a,
        _id: a.id || a._id,
        accountId: a.account_number || a.accountId || a.id,
      }));
      setAccounts(mapped);
      if (mapped.length > 0 && !selectedAccount) {
        setSelectedAccount(mapped[0]._id);
        setMasterForm(prev => ({ ...prev, tradingAccountId: mapped[0]._id }));
      }
    } catch (e) {
      console.error('Error fetching accounts:', e);
    }
  };

  const fetchMyMasterProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;
      const res = await fetch(`${API_URL}/social/my-provider`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && (data.id || data._id)) {
        setMyMasterProfile({ ...data, _id: data.id || data._id });
      }
    } catch (e) {
      // User is not a master - that's okay
    }
  };

  const fetchMyFollowers = async () => {
    // TrustEdge doesn't have a dedicated followers endpoint
    setMyFollowers([]);
  };

  const handleApplyMaster = async () => {
    const accountId = masterForm.tradingAccountId || (accounts.length > 0 ? accounts[0]._id : '');
    
    if (!masterForm.displayName.trim()) {
      Alert.alert('Error', 'Please enter a display name');
      return;
    }
    if (!accountId) {
      Alert.alert('Error', 'Please select a trading account');
      return;
    }

    setApplyingMaster(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/social/become-provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          display_name: masterForm.displayName,
          description: masterForm.description,
          account_id: accountId,
          commission_percentage: parseFloat(masterForm.requestedCommissionPercentage) || 10
        })
      });

      const data = await res.json();
      if (res.ok) {
        Alert.alert('Success', 'Application submitted! Please wait for admin approval.');
        setShowMasterModal(false);
        fetchMyMasterProfile();
      } else {
        Alert.alert('Error', data.detail || data.message || 'Failed to submit application');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to submit application');
    }
    setApplyingMaster(false);
  };

  const handleFollow = async () => {
    if (!selectedMaster || !selectedAccount) {
      Alert.alert('Error', 'Please select a trading account');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/social/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          provider_id: selectedMaster.id || selectedMaster._id,
          account_id: selectedAccount,
          copy_mode: copyMode === 'FIXED_LOT' ? 'fixed_lot' : 'multiplier',
          fixed_lot_size: parseFloat(copyValue) || 0.01
        })
      });

      const data = await res.json();
      if (res.ok) {
        Alert.alert('Success', 'Successfully following master trader!');
        setShowFollowModal(false);
        setSelectedMaster(null);
        fetchMySubscriptions();
        fetchMasters();
      } else {
        Alert.alert('Error', data.detail || data.message || 'Failed to follow');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to follow master');
    }
    setIsSubmitting(false);
  };

  const handlePauseResume = async (subscriptionId, currentStatus) => {
    // TrustEdge doesn't have pause/resume endpoint for subscriptions
    Alert.alert('Info', 'Pause/resume is not available on this platform. Please unfollow and follow again if needed.');
  };

  const handleUnfollow = async (subscriptionId) => {
    Alert.alert(
      'Unfollow Master',
      'Are you sure you want to stop following this master?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync('token');
              const res = await fetch(`${API_URL}/social/unfollow/${subscriptionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (res.ok) {
                Alert.alert('Success', 'Successfully unfollowed master');
                fetchMySubscriptions();
                fetchMasters();
              } else {
                const data = await res.json().catch(() => ({}));
                Alert.alert('Error', data.detail || data.message || 'Failed to unfollow');
              }
            } catch (e) {
              Alert.alert('Error', 'Failed to unfollow');
            }
          }
        }
      ]
    );
  };

  const handleEditSubscription = (sub) => {
    setEditingSubscription(sub);
    setEditCopyMode(sub.copyMode || 'FIXED_LOT');
    setEditCopyValue(sub.copyValue?.toString() || '0.01');
    setShowEditModal(true);
  };

  const handleSaveSubscription = async () => {
    if (!editingSubscription) return;

    setIsSubmitting(true);
    try {
      // TrustEdge doesn't have subscription update endpoint
      Alert.alert('Info', 'Subscription editing is not available on this platform. Please unfollow and follow again with new settings.');
      setShowEditModal(false);
      setEditingSubscription(null);
    } catch (e) {
      Alert.alert('Error', 'Failed to update subscription');
    }
    setIsSubmitting(false);
  };

  const filteredMasters = masters.filter(m => 
    m.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isFollowingMaster = (masterId) => {
    return mySubscriptions.some(sub => {
      const subMasterId = sub.masterTraderId?.id || sub.masterTraderId?._id || sub.masterTraderId || sub.provider_id;
      return subMasterId === masterId && (sub.status === 'ACTIVE' || sub.status === 'active');
    });
  };

  const getCopyModeLabel = (mode, value) => {
    switch (mode) {
      case 'FIXED_LOT': return `Fixed: ${value} lots`;
      case 'BALANCE_BASED': return 'Balance Based';
      case 'EQUITY_BASED': return 'Equity Based';
      case 'MULTIPLIER': return `Multiplier: ${value}x`;
      default: return mode;
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const tabs = ['discover', 'subscriptions'];
  if (myMasterProfile?.status === 'ACTIVE') {
    tabs.push('followers');
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bgPrimary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Copy Trading</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Become a Master Banner */}
        {!myMasterProfile && (
          <TouchableOpacity style={[styles.masterBanner, { backgroundColor: `${colors.accent}20`, borderColor: `${colors.accent}50` }]} onPress={() => setShowMasterModal(true)}>
            <View style={[styles.masterBannerIcon, { backgroundColor: `${colors.accent}30` }]}>
              <Ionicons name="trophy" size={24} color={colors.accent} />
            </View>
            <View style={styles.masterBannerText}>
              <Text style={[styles.masterBannerTitle, { color: colors.textPrimary }]}>Become a Master Trader</Text>
              <Text style={[styles.masterBannerSub, { color: colors.textMuted }]}>Share your trades and earn commission</Text>
            </View>
            <View style={[styles.applyBtn, { backgroundColor: colors.accent }]}>
              <Text style={[styles.applyBtnText, { color: '#fff' }]}>Apply</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Master Status Banner */}
        {myMasterProfile && (
          <View style={[
            styles.masterStatusBanner,
            myMasterProfile.status === 'ACTIVE' ? styles.statusActive :
            myMasterProfile.status === 'PENDING' ? styles.statusPending : styles.statusRejected
          ]}>
            <View style={[
              styles.masterBannerIcon,
              myMasterProfile.status === 'ACTIVE' ? styles.iconActive :
              myMasterProfile.status === 'PENDING' ? styles.iconPending : styles.iconRejected
            ]}>
              <Ionicons name="trophy" size={24} color={
                myMasterProfile.status === 'ACTIVE' ? '#22c55e' :
                myMasterProfile.status === 'PENDING' ? '#eab308' : '#ef4444'
              } />
            </View>
            <View style={styles.masterBannerText}>
              <Text style={[styles.masterBannerTitle, { color: colors.textPrimary }]}>{myMasterProfile.displayName}</Text>
              <Text style={styles.masterBannerSub}>
                <Text style={
                  myMasterProfile.status === 'ACTIVE' ? styles.statusTextActive :
                  myMasterProfile.status === 'PENDING' ? styles.statusTextPending : styles.statusTextRejected
                }>{myMasterProfile.status}</Text>
                {myMasterProfile.status === 'ACTIVE' && ` • ${myMasterProfile.stats?.activeFollowers || 0} followers`}
              </Text>
              {myMasterProfile.status === 'REJECTED' && myMasterProfile.rejectionReason && (
                <Text style={styles.rejectionReason}>Reason: {myMasterProfile.rejectionReason}</Text>
              )}
            </View>
            {myMasterProfile.status === 'ACTIVE' && (
              <Text style={styles.commissionText}>{myMasterProfile.approvedCommissionPercentage}%</Text>
            )}
          </View>
        )}

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
          <View style={styles.tabs}>
            {tabs.map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, { backgroundColor: colors.bgSecondary }, activeTab === tab && { backgroundColor: colors.accent }]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === tab && styles.tabTextActive]}>
                  {tab === 'discover' ? 'Discover' :
                   tab === 'subscriptions' ? 'Subscriptions' :
                   tab === 'trades' ? 'Trades' : 'Followers'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Discover Tab */}
        {activeTab === 'discover' && (
          <View style={styles.listContainer}>
            {/* Search */}
            <View style={[styles.searchContainer, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Search masters..."
                placeholderTextColor={colors.textMuted}
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>

            {loadingMasters ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={[styles.emptyText, { color: colors.textMuted, marginTop: 16 }]}>Loading master traders...</Text>
              </View>
            ) : filteredMasters.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={64} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Master Traders</Text>
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No master traders available yet</Text>
                <TouchableOpacity onPress={fetchMasters} style={{ marginTop: 16 }}>
                  <Text style={{ color: colors.accent }}>Tap to refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredMasters.map((master) => {
                const following = isFollowingMaster(master._id);
                return (
                  <View key={master._id} style={[styles.masterCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                    <View style={styles.masterHeader}>
                      <View style={[styles.masterAvatar, { backgroundColor: `${colors.accent}30` }]}>
                        <Text style={[styles.avatarText, { color: colors.accent }]}>{master.displayName?.charAt(0)}</Text>
                      </View>
                      <View style={styles.masterInfo}>
                        <Text style={[styles.masterName, { color: colors.textPrimary }]}>{master.displayName}</Text>
                        <Text style={[styles.masterFollowers, { color: colors.textMuted }]}>{master.stats?.activeFollowers || 0} followers</Text>
                      </View>
                      {following && (
                        <View style={styles.followingBadge}>
                          <Text style={styles.followingBadgeText}>Following</Text>
                        </View>
                      )}
                    </View>
                    
                    <View style={styles.statsGrid}>
                      <View style={styles.statBox}>
                        <Text style={[styles.statBoxLabel, { color: colors.textMuted }]}>Win Rate</Text>
                        <Text style={[styles.statBoxValue, { color: colors.textPrimary }]}>{master.stats?.winRate?.toFixed(1) || 0}%</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={[styles.statBoxLabel, { color: colors.textMuted }]}>Total Trades</Text>
                        <Text style={[styles.statBoxValue, { color: colors.textPrimary }]}>{master.stats?.totalTrades || 0}</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={[styles.statBoxLabel, { color: colors.textMuted }]}>Commission</Text>
                        <Text style={[styles.statBoxValue, { color: colors.textPrimary }]}>{master.approvedCommissionPercentage || 0}%</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={[styles.statBoxLabel, { color: colors.textMuted }]}>Profit</Text>
                        <Text style={[styles.statBoxValue, { color: '#22c55e' }]}>${master.stats?.totalProfitGenerated?.toFixed(2) || '0.00'}</Text>
                      </View>
                    </View>
                    
                    {following ? (
                      <TouchableOpacity style={styles.followingBtn} onPress={() => setActiveTab('subscriptions')}>
                        <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                        <Text style={styles.followingBtnText}>Following</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity 
                        style={[styles.followBtn, { backgroundColor: colors.accent }]}
                        onPress={() => { setSelectedMaster(master); setShowFollowModal(true); }}
                      >
                        <Ionicons name="add-circle-outline" size={18} color="#fff" />
                        <Text style={[styles.followBtnText, { color: '#fff' }]}>Follow</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Subscriptions Tab */}
        {activeTab === 'subscriptions' && (
          <View style={styles.listContainer}>
            {mySubscriptions.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="link-outline" size={64} color="#333" />
                <Text style={styles.emptyTitle}>No Subscriptions</Text>
                <Text style={styles.emptyText}>You're not following any masters yet</Text>
                <TouchableOpacity style={styles.discoverBtn} onPress={() => setActiveTab('discover')}>
                  <Text style={styles.discoverBtnText}>Discover Masters →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              mySubscriptions.map((sub) => (
                <View key={sub._id} style={[styles.subscriptionCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                  <View style={styles.subHeader}>
                    <View style={[styles.masterAvatar, { backgroundColor: `${colors.accent}30` }]}>
                      <Text style={[styles.avatarText, { color: colors.accent }]}>{sub.masterId?.displayName?.charAt(0)}</Text>
                    </View>
                    <View style={styles.subInfo}>
                      <Text style={[styles.subMasterName, { color: colors.textPrimary }]}>{sub.masterId?.displayName}</Text>
                      <Text style={[styles.subCopyMode, { color: colors.textMuted }]}>{getCopyModeLabel(sub.copyMode, sub.copyValue)}</Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      sub.status === 'ACTIVE' ? styles.statusBadgeActive :
                      sub.status === 'PAUSED' ? styles.statusBadgePaused : styles.statusBadgeStopped
                    ]}>
                      <Text style={[
                        styles.statusBadgeText,
                        sub.status === 'ACTIVE' ? styles.statusBadgeTextActive :
                        sub.status === 'PAUSED' ? styles.statusBadgeTextPaused : styles.statusBadgeTextStopped
                      ]}>{sub.status}</Text>
                    </View>
                  </View>
                  
                  <View style={[styles.subStatsGrid, { borderTopColor: colors.border }]}>
                    <View style={styles.subStatBox}>
                      <Text style={[styles.subStatLabel, { color: colors.textMuted }]}>Total Trades</Text>
                      <Text style={[styles.subStatValue, { color: colors.textPrimary }]}>{sub.stats?.totalCopiedTrades || 0}</Text>
                    </View>
                    <View style={styles.subStatBox}>
                      <Text style={[styles.subStatLabel, { color: colors.textMuted }]}>Open / Closed</Text>
                      <Text style={styles.subStatValue}>
                        <Text style={{ color: '#1a73e8' }}>{sub.stats?.openTrades || 0}</Text>
                        {' / '}
                        <Text style={{ color: '#888' }}>{sub.stats?.closedTrades || 0}</Text>
                      </Text>
                    </View>
                    <View style={styles.subStatBox}>
                      <Text style={[styles.subStatLabel, { color: colors.textMuted }]}>Profit</Text>
                      <Text style={[styles.subStatValue, { color: '#22c55e' }]}>+${(sub.stats?.totalProfit || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.subStatBox}>
                      <Text style={[styles.subStatLabel, { color: colors.textMuted }]}>Loss</Text>
                      <Text style={[styles.subStatValue, { color: '#ef4444' }]}>-${(sub.stats?.totalLoss || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.subStatBox}>
                      <Text style={[styles.subStatLabel, { color: colors.textMuted }]}>Net P&L</Text>
                      <Text style={[styles.subStatValue, { color: (sub.stats?.netPnl || 0) >= 0 ? '#22c55e' : '#ef4444' }]}>
                        {(sub.stats?.netPnl || 0) >= 0 ? '+' : ''}${(sub.stats?.netPnl || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.subActions}>
                    <TouchableOpacity style={[styles.editBtn, { backgroundColor: `${colors.accent}20` }]} onPress={() => handleEditSubscription(sub)}>
                      <Ionicons name="settings-outline" size={18} color={colors.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.pauseBtn} onPress={() => handlePauseResume(sub._id, sub.status)}>
                      <Ionicons name={sub.status === 'ACTIVE' ? 'pause' : 'play'} size={18} color={sub.status === 'ACTIVE' ? '#eab308' : '#22c55e'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.unfollowBtn} onPress={() => handleUnfollow(sub._id)}>
                      <Ionicons name="close" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Trades Tab */}
        {activeTab === 'trades' && (
          <View style={styles.listContainer}>
            {myCopyTrades.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="trending-up-outline" size={64} color="#333" />
                <Text style={styles.emptyTitle}>No Copy Trades</Text>
                <Text style={styles.emptyText}>Your copied trades will appear here</Text>
              </View>
            ) : (
              myCopyTrades.map((trade) => (
                <View key={trade._id} style={[styles.tradeCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                  <View style={styles.tradeHeader}>
                    <View>
                      <Text style={[styles.tradeSymbol, { color: colors.textPrimary }]}>{trade.symbol}</Text>
                      <Text style={[styles.tradeMaster, { color: colors.textMuted }]}>From: {trade.masterId?.displayName || '-'}</Text>
                    </View>
                    <View style={[styles.tradeSideBadge, { backgroundColor: trade.side === 'BUY' ? '#22c55e20' : '#ef444420' }]}>
                      <Text style={[styles.tradeSideText, { color: trade.side === 'BUY' ? '#22c55e' : '#ef4444' }]}>{trade.side}</Text>
                    </View>
                  </View>
                  <View style={styles.tradeDetails}>
                    <View style={styles.tradeDetailItem}>
                      <Text style={[styles.tradeDetailLabel, { color: colors.textMuted }]}>Lots</Text>
                      <Text style={[styles.tradeDetailValue, { color: colors.textPrimary }]}>{trade.followerLotSize}</Text>
                    </View>
                    <View style={styles.tradeDetailItem}>
                      <Text style={[styles.tradeDetailLabel, { color: colors.textMuted }]}>Open</Text>
                      <Text style={[styles.tradeDetailValue, { color: colors.textPrimary }]}>{trade.followerOpenPrice?.toFixed(5)}</Text>
                    </View>
                    <View style={styles.tradeDetailItem}>
                      <Text style={[styles.tradeDetailLabel, { color: colors.textMuted }]}>Close</Text>
                      <Text style={[styles.tradeDetailValue, { color: colors.textPrimary }]}>{trade.followerClosePrice?.toFixed(5) || '-'}</Text>
                    </View>
                    <View style={styles.tradeDetailItem}>
                      <Text style={[styles.tradeDetailLabel, { color: colors.textMuted }]}>P/L</Text>
                      <Text style={[styles.tradeDetailValue, { color: (trade.followerPnl || 0) >= 0 ? '#22c55e' : '#ef4444' }]}>
                        {(trade.followerPnl || 0) >= 0 ? '+' : ''}${(trade.followerPnl || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.tradeStatusBadge, { backgroundColor: trade.status === 'OPEN' ? '#1a73e820' : '#22c55e20' }]}>
                    <Text style={[styles.tradeStatusText, { color: trade.status === 'OPEN' ? '#1a73e8' : '#22c55e' }]}>{trade.status}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Followers Tab */}
        {activeTab === 'followers' && myMasterProfile?.status === 'ACTIVE' && (
          <View style={styles.listContainer}>
            {myFollowers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={64} color="#333" />
                <Text style={styles.emptyTitle}>No Followers Yet</Text>
                <Text style={styles.emptyText}>Traders who follow you will appear here</Text>
              </View>
            ) : (
              myFollowers.map((follower) => (
                <View key={follower._id} style={[styles.followerCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                  <View style={styles.followerHeader}>
                    <View style={[styles.masterAvatar, { backgroundColor: `${colors.accent}30` }]}>
                      <Text style={[styles.avatarText, { color: colors.accent }]}>{follower.followerUserId?.firstName?.charAt(0)}</Text>
                    </View>
                    <View style={styles.followerInfo}>
                      <Text style={[styles.followerName, { color: colors.textPrimary }]}>{follower.followerUserId?.firstName} {follower.followerUserId?.lastName}</Text>
                      <Text style={[styles.followerEmail, { color: colors.textMuted }]}>{follower.followerUserId?.email}</Text>
                      <Text style={[styles.followerCopyMode, { color: colors.textMuted }]}>{getCopyModeLabel(follower.copyMode, follower.copyValue)}</Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      follower.status === 'ACTIVE' ? styles.statusBadgeActive : styles.statusBadgePaused
                    ]}>
                      <Text style={[
                        styles.statusBadgeText,
                        follower.status === 'ACTIVE' ? styles.statusBadgeTextActive : styles.statusBadgeTextPaused
                      ]}>{follower.status}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Follow Modal */}
      <Modal visible={showFollowModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.bgSecondary }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Follow Master</Text>
              <TouchableOpacity onPress={() => setShowFollowModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedMaster && (
              <View style={[styles.selectedMaster, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={[styles.masterAvatar, { backgroundColor: `${colors.accent}30` }]}>
                  <Text style={[styles.avatarText, { color: colors.accent }]}>{selectedMaster.displayName?.charAt(0)}</Text>
                </View>
                <Text style={[styles.selectedMasterName, { color: colors.textPrimary }]}>{selectedMaster.displayName}</Text>
              </View>
            )}

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Select Your Account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
              {accounts.map((acc) => (
                <TouchableOpacity
                  key={acc._id}
                  style={[styles.accountCard, { backgroundColor: colors.bgCard, borderColor: colors.border }, selectedAccount === acc._id && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={() => setSelectedAccount(acc._id)}
                >
                  <Text style={[styles.accountNumber, { color: colors.textPrimary }, selectedAccount === acc._id && { color: '#000' }]}>{acc.accountId}</Text>
                  <Text style={[styles.accountBalance, { color: colors.textMuted }, selectedAccount === acc._id && { color: '#000' }]}>${(acc.balance || 0).toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Copy Mode</Text>
            <View style={styles.copyModeRow}>
              {['FIXED_LOT', 'MULTIPLIER'].map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.copyModeBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }, copyMode === mode && { backgroundColor: `${colors.accent}20`, borderColor: colors.accent }]}
                  onPress={() => setCopyMode(mode)}
                >
                  <Text style={[styles.copyModeText, { color: colors.textMuted }, copyMode === mode && { color: colors.accent }]}>
                    {mode === 'FIXED_LOT' ? 'Fixed Lot' : 'Multiplier'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>{copyMode === 'FIXED_LOT' ? 'Lot Size' : 'Multiplier'}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary }]}
              value={copyValue}
              onChangeText={setCopyValue}
              placeholder={copyMode === 'FIXED_LOT' ? '0.01' : '1'}
              placeholderTextColor="#666"
              keyboardType="numeric"
            />
            <Text style={[styles.inputHint, { color: colors.textMuted }]}>
              {copyMode === 'FIXED_LOT' ? 'Fixed lot size for all copied trades' : '1 = Same size, 0.5 = Half, 2 = Double'}
            </Text>

            <TouchableOpacity 
              style={[styles.submitBtn, { backgroundColor: colors.accent }, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleFollow}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, { color: '#fff' }]}>Start Following</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Become Master Modal */}
      <Modal visible={showMasterModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.bgSecondary }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Become a Master</Text>
              <TouchableOpacity onPress={() => setShowMasterModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Display Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary }]}
              value={masterForm.displayName}
              onChangeText={(text) => setMasterForm(prev => ({ ...prev, displayName: text }))}
              placeholder="Your trading name"
              placeholderTextColor="#666"
            />

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Description</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top', backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary }]}
              value={masterForm.description}
              onChangeText={(text) => setMasterForm(prev => ({ ...prev, description: text }))}
              placeholder="Describe your trading strategy..."
              placeholderTextColor="#666"
              multiline
            />

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Trading Account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
              {accounts.map((acc) => (
                <TouchableOpacity
                  key={acc._id}
                  style={[styles.accountCard, { backgroundColor: colors.bgCard, borderColor: colors.border }, masterForm.tradingAccountId === acc._id && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={() => setMasterForm(prev => ({ ...prev, tradingAccountId: acc._id }))}
                >
                  <Text style={[styles.accountNumber, { color: colors.textPrimary }, masterForm.tradingAccountId === acc._id && { color: '#000' }]}>{acc.accountId}</Text>
                  <Text style={[styles.accountBalance, { color: colors.textMuted }, masterForm.tradingAccountId === acc._id && { color: '#000' }]}>${(acc.balance || 0).toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Requested Commission (%)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary }]}
              value={masterForm.requestedCommissionPercentage}
              onChangeText={(text) => setMasterForm(prev => ({ ...prev, requestedCommissionPercentage: text }))}
              placeholder="10"
              placeholderTextColor="#666"
              keyboardType="numeric"
            />
            <Text style={[styles.inputHint, { color: colors.textMuted }]}>Commission you'll earn from followers' profits</Text>

            <TouchableOpacity 
              style={[styles.submitBtn, { backgroundColor: colors.accent }, applyingMaster && styles.submitBtnDisabled]} 
              onPress={handleApplyMaster}
              disabled={applyingMaster}
            >
              {applyingMaster ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, { color: '#fff' }]}>Submit Application</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Subscription Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.bgSecondary }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Edit Subscription</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {editingSubscription && (
              <View style={[styles.selectedMaster, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={[styles.masterAvatar, { backgroundColor: `${colors.accent}30` }]}>
                  <Text style={[styles.avatarText, { color: colors.accent }]}>{editingSubscription.masterId?.displayName?.charAt(0)}</Text>
                </View>
                <Text style={[styles.selectedMasterName, { color: colors.textPrimary }]}>{editingSubscription.masterId?.displayName}</Text>
              </View>
            )}

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Copy Mode</Text>
            <View style={styles.copyModeRow}>
              {['FIXED_LOT', 'MULTIPLIER'].map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.copyModeBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }, editCopyMode === mode && { backgroundColor: `${colors.accent}20`, borderColor: colors.accent }]}
                  onPress={() => setEditCopyMode(mode)}
                >
                  <Text style={[styles.copyModeText, { color: colors.textMuted }, editCopyMode === mode && { color: colors.accent }]}>
                    {mode === 'FIXED_LOT' ? 'Fixed Lot' : 'Multiplier'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>{editCopyMode === 'FIXED_LOT' ? 'Lot Size' : 'Multiplier'}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary }]}
              value={editCopyValue}
              onChangeText={setEditCopyValue}
              placeholder={editCopyMode === 'FIXED_LOT' ? '0.01' : '1'}
              placeholderTextColor="#666"
              keyboardType="numeric"
            />

            <TouchableOpacity 
              style={[styles.submitBtn, { backgroundColor: colors.accent }, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleSaveSubscription}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, { color: '#fff' }]}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  
  // Master Banner
  masterBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, padding: 16, backgroundColor: '#1a73e820', borderRadius: 16, borderWidth: 1, borderColor: '#1a73e850' },
  masterStatusBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  masterBannerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a73e830', justifyContent: 'center', alignItems: 'center' },
  masterBannerText: { flex: 1, marginLeft: 12 },
  masterBannerTitle: { fontSize: 15, fontWeight: '600' },
  masterBannerSub: { color: '#888', fontSize: 12, marginTop: 2 },
  commissionText: { fontSize: 16, fontWeight: 'bold' },
  applyBtn: { backgroundColor: '#1a73e8', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  applyBtnText: { color: '#000', fontSize: 13, fontWeight: '600' },
  
  // Status Banners
  statusActive: { backgroundColor: '#22c55e20', borderColor: '#22c55e50' },
  statusPending: { backgroundColor: '#eab30820', borderColor: '#eab30850' },
  statusRejected: { backgroundColor: '#ef444420', borderColor: '#ef444450' },
  iconActive: { backgroundColor: '#22c55e30' },
  iconPending: { backgroundColor: '#eab30830' },
  iconRejected: { backgroundColor: '#ef444430' },
  statusTextActive: { color: '#22c55e' },
  statusTextPending: { color: '#eab308' },
  statusTextRejected: { color: '#ef4444' },
  rejectionReason: { color: '#ef4444', fontSize: 11, marginTop: 4 },
  
  // Tabs
  tabsScroll: { maxHeight: 50, marginBottom: 8 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: '#1a73e8' },
  tabText: { color: '#666', fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: '#000' },
  
  listContainer: { padding: 16 },
  
  // Search
  searchContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, borderWidth: 1 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14 },
  
  // Empty State
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptyText: { color: '#666', fontSize: 14, marginTop: 8, textAlign: 'center' },
  discoverBtn: { marginTop: 16 },
  discoverBtnText: { color: '#1a73e8', fontSize: 14, fontWeight: '600' },
  
  // Master Card
  masterCard: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  masterHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  masterAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1a73e830', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#1a73e8', fontSize: 18, fontWeight: 'bold' },
  masterInfo: { flex: 1, marginLeft: 12 },
  masterName: { fontSize: 16, fontWeight: '600' },
  masterFollowers: { color: '#666', fontSize: 12, marginTop: 2 },
  followingBadge: { backgroundColor: '#22c55e20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  followingBadgeText: { color: '#22c55e', fontSize: 11, fontWeight: '600' },
  
  // Stats Grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, minWidth: '45%', borderRadius: 10, padding: 12 },
  statBoxLabel: { color: '#666', fontSize: 11 },
  statBoxValue: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  
  // Follow Button
  followBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1a73e8', paddingVertical: 12, borderRadius: 10 },
  followBtnText: { color: '#000', fontSize: 14, fontWeight: '600' },
  followingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#22c55e20', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#22c55e50' },
  followingBtnText: { color: '#22c55e', fontSize: 14, fontWeight: '600' },
  
  // Subscription Card
  subscriptionCard: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  subHeader: { flexDirection: 'row', alignItems: 'center' },
  subInfo: { flex: 1, marginLeft: 12 },
  subMasterName: { fontSize: 16, fontWeight: '600' },
  subCopyMode: { color: '#666', fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  statusBadgeActive: { backgroundColor: '#22c55e20' },
  statusBadgeTextActive: { color: '#22c55e' },
  statusBadgePaused: { backgroundColor: '#eab30820' },
  statusBadgeTextPaused: { color: '#eab308' },
  statusBadgeStopped: { backgroundColor: '#ef444420' },
  statusBadgeTextStopped: { color: '#ef4444' },
  
  // Sub Stats Grid
  subStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, paddingTop: 16, borderTopWidth: 1, gap: 8 },
  subStatBox: { width: '30%', alignItems: 'center', marginBottom: 8 },
  subStatLabel: { color: '#666', fontSize: 10 },
  subStatValue: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  
  // Sub Actions
  subActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  editBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#1a73e820', justifyContent: 'center', alignItems: 'center' },
  pauseBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eab30820', justifyContent: 'center', alignItems: 'center' },
  unfollowBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#ef444420', justifyContent: 'center', alignItems: 'center' },
  
  // Trade Card
  tradeCard: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  tradeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  tradeSymbol: { fontSize: 16, fontWeight: '600' },
  tradeMaster: { color: '#666', fontSize: 12, marginTop: 2 },
  tradeSideBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tradeSideText: { fontSize: 12, fontWeight: '600' },
  tradeDetails: { flexDirection: 'row', gap: 8 },
  tradeDetailItem: { flex: 1, alignItems: 'center' },
  tradeDetailLabel: { color: '#666', fontSize: 10 },
  tradeDetailValue: { fontSize: 13, fontWeight: '500', marginTop: 4 },
  tradeStatusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 12 },
  tradeStatusText: { fontSize: 11, fontWeight: '600' },
  
  // Follower Card
  followerCard: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  followerHeader: { flexDirection: 'row', alignItems: 'center' },
  followerInfo: { flex: 1, marginLeft: 12 },
  followerName: { fontSize: 15, fontWeight: '600' },
  followerEmail: { color: '#666', fontSize: 12, marginTop: 2 },
  followerCopyMode: { color: '#888', fontSize: 11, marginTop: 4 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  
  selectedMaster: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1 },
  selectedMasterName: { fontSize: 16, fontWeight: '600', marginLeft: 12 },
  
  inputLabel: { color: '#888', fontSize: 12, marginBottom: 8, marginTop: 16 },
  accountsScroll: { marginBottom: 8 },
  accountCard: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, marginRight: 8, minWidth: 120, borderWidth: 1 },
  accountCardActive: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  accountNumber: { fontSize: 14, fontWeight: '600' },
  accountBalance: { color: '#666', fontSize: 12, marginTop: 4 },
  
  // Copy Mode
  copyModeRow: { flexDirection: 'row', gap: 8 },
  copyModeBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  copyModeBtnActive: { backgroundColor: '#1a73e820', borderColor: '#1a73e8' },
  copyModeText: { color: '#666', fontSize: 13, fontWeight: '500' },
  copyModeTextActive: { color: '#1a73e8' },
  
  input: { borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1 },
  inputHint: { color: '#666', fontSize: 12, marginTop: 8 },
  
  submitBtn: { backgroundColor: '#1a73e8', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
});

export default CopyTradeScreen;
