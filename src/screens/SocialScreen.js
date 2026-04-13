import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_W } = Dimensions.get('window');

const TABS = [
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'my-copies', label: 'My Copies' },
  { id: 'mamm', label: 'MAM/PAMM' },
  { id: 'investments', label: 'My Investments' },
  { id: 'provider', label: 'Become Provider' },
  { id: 'dashboard', label: 'My Dashboard' },
];

const PROVIDER_TYPES = [
  { value: 'signal_provider', label: 'Signal Provider' },
  { value: 'pamm', label: 'PAMM' },
  { value: 'mamm', label: 'MAMM' },
];

const SORTS = [
  { value: 'total_return_pct', label: 'Return' },
  { value: 'sharpe_ratio', label: 'Sharpe' },
  { value: 'followers_count', label: 'Followers' },
];

async function authHeaders() {
  const token = await SecureStore.getItemAsync('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function SocialScreen({ navigation }) {
  const { colors } = useTheme();
  const accent = colors.primary;
  const accentMuted = `${colors.primary}28`;
  const accentMutedLight = `${colors.primary}1a`;
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('leaderboard');
  const [refreshing, setRefreshing] = useState(false);

  /* Leaderboard */
  const [providers, setProviders] = useState([]);
  const [lbLoading, setLbLoading] = useState(true);
  const [lbError, setLbError] = useState(null);
  const [sortBy, setSortBy] = useState('total_return_pct');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copyTarget, setCopyTarget] = useState(null);

  /* My copies */
  const [copies, setCopies] = useState([]);
  const [copiesLoading, setCopiesLoading] = useState(false);
  const [stoppingId, setStoppingId] = useState(null);

  /* MAM/PAMM */
  const [managed, setManaged] = useState([]);
  const [mammLoading, setMammLoading] = useState(false);
  const [investTarget, setInvestTarget] = useState(null);

  /* Accounts (shared) */
  const [accounts, setAccounts] = useState([]);
  const [copyAccountId, setCopyAccountId] = useState('');
  const [copyAmount, setCopyAmount] = useState('');
  const [copySubmitting, setCopySubmitting] = useState(false);
  const [investAmount, setInvestAmount] = useState('');
  const [investSubmitting, setInvestSubmitting] = useState(false);

  /* Become provider */
  const [provType, setProvType] = useState('signal_provider');
  const [provDesc, setProvDesc] = useState('');
  const [provFee, setProvFee] = useState('20');
  const [provMgmtFee, setProvMgmtFee] = useState('0');
  const [provMin, setProvMin] = useState('100');
  const [provMaxInv, setProvMaxInv] = useState('100');
  const [provAccountId, setProvAccountId] = useState('');
  const [provSubmitting, setProvSubmitting] = useState(false);

  /* My Investments (PAMM allocations) */
  const [allocations, setAllocations] = useState([]);
  const [allocSummary, setAllocSummary] = useState(null);
  const [allocLoading, setAllocLoading] = useState(false);
  const [refillTarget, setRefillTarget] = useState(null);
  const [refillAmount, setRefillAmount] = useState('');
  const [refillSubmitting, setRefillSubmitting] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState(null);

  /* MAMM volume scaling for invest */
  const [investScaling, setInvestScaling] = useState('100');

  /* Dashboard */
  const [dash, setDash] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashError, setDashError] = useState(null);
  const [perfData, setPerfData] = useState(null);
  const [investorsList, setInvestorsList] = useState([]);

  const loadAccounts = async () => {
    try {
      const h = await authHeaders();
      const res = await fetch(`${API_URL}/accounts`, { headers: h });
      const data = await res.json().catch(() => ({}));
      const items = data.items || data || [];
      const list = Array.isArray(items) ? items : [];
      setAccounts(list);
      if (list.length > 0) {
        const firstLive = list.find((a) => !(a.is_demo || a.isDemo || a.accountTypeId?.isDemo));
        const pick = firstLive || list[0];
        const id = pick.id || pick._id;
        setProvAccountId((prev) => prev || id);
        setCopyAccountId((prev) => prev || id);
      }
    } catch (e) {
      setAccounts([]);
    }
  };

  const fetchLeaderboard = useCallback(async () => {
    setLbLoading(true);
    setLbError(null);
    try {
      const h = await authHeaders();
      const q = `sort_by=${sortBy}&page=${page}&per_page=20`;
      const res = await fetch(`${API_URL}/social/leaderboard?${q}`, { headers: h });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLbError(data.detail || data.message || `Error ${res.status}`);
        setProviders([]);
      } else {
        setProviders(data.items || []);
        setPages(Math.max(1, data.pages || 1));
      }
    } catch (e) {
      setLbError(e.message || 'Network error');
      setProviders([]);
    }
    setLbLoading(false);
  }, [sortBy, page]);

  const fetchMyCopies = useCallback(async () => {
    setCopiesLoading(true);
    try {
      const h = await authHeaders();
      const res = await fetch(`${API_URL}/social/my-copies`, { headers: h });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCopies(data.items || []);
      else setCopies([]);
    } catch (e) {
      setCopies([]);
    }
    setCopiesLoading(false);
  }, []);

  const fetchMamm = useCallback(async () => {
    setMammLoading(true);
    try {
      const h = await authHeaders();
      const res = await fetch(`${API_URL}/social/mamm-pamm?page=1&per_page=30`, { headers: h });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setManaged(data.items || []);
      else setManaged([]);
    } catch (e) {
      setManaged([]);
    }
    setMammLoading(false);
  }, []);

  const fetchDashboard = useCallback(async () => {
    setDashLoading(true);
    setDashError(null);
    try {
      const h = await authHeaders();
      const res = await fetch(`${API_URL}/social/my-provider`, { headers: h });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDash(null);
        setDashError(data.detail || 'Not a provider yet');
      } else {
        setDash(data);
        // Fetch performance + investors when provider is approved
        if (data?.status === 'approved' || data?.id) {
          const [perfRes, invRes] = await Promise.all([
            fetch(`${API_URL}/social/master-performance`, { headers: h }).catch(() => null),
            fetch(`${API_URL}/social/master-investors`, { headers: h }).catch(() => null),
          ]);
          if (perfRes?.ok) setPerfData(await perfRes.json().catch(() => null));
          if (invRes?.ok) {
            const invData = await invRes.json().catch(() => ({}));
            setInvestorsList(invData.investors || invData.items || []);
          }
        }
      }
    } catch (e) {
      setDash(null);
      setDashError(e.message);
    }
    setDashLoading(false);
  }, []);

  const fetchAllocations = useCallback(async () => {
    setAllocLoading(true);
    try {
      const h = await authHeaders();
      const res = await fetch(`${API_URL}/social/my-allocations`, { headers: h });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAllocations(data.items || []);
        setAllocSummary(data.summary || null);
      } else {
        setAllocations([]);
        setAllocSummary(null);
      }
    } catch (e) {
      setAllocations([]);
      setAllocSummary(null);
    }
    setAllocLoading(false);
  }, []);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (tab === 'leaderboard') fetchLeaderboard();
  }, [tab, sortBy, page, fetchLeaderboard]);

  useEffect(() => {
    if (tab === 'my-copies') fetchMyCopies();
    if (tab === 'mamm') fetchMamm();
    if (tab === 'investments') fetchAllocations();
    if (tab === 'dashboard') fetchDashboard();
  }, [tab, fetchMyCopies, fetchMamm, fetchAllocations, fetchDashboard]);

  const openDetail = async (id) => {
    setDetailId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const h = await authHeaders();
      const res = await fetch(`${API_URL}/social/providers/${id}`, { headers: h });
      const data = await res.json().catch(() => null);
      if (res.ok) setDetail(data);
      else Alert.alert('Error', data?.detail || 'Failed to load');
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setDetailLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadAccounts(),
      fetchLeaderboard(),
      fetchMyCopies(),
      fetchMamm(),
      fetchAllocations(),
      fetchDashboard(),
    ]);
    setRefreshing(false);
  };

  const submitCopy = async () => {
    if (!copyTarget) return;
    const aid = copyAccountId;
    const amt = parseFloat(copyAmount);
    if (!aid) {
      Alert.alert('Account', 'Select a trading account');
      return;
    }
    if (!amt || amt <= 0) {
      Alert.alert('Amount', 'Enter a valid investment amount');
      return;
    }
    setCopySubmitting(true);
    try {
      const h = await authHeaders();
      const mid = copyTarget.id;
      const url = `${API_URL}/social/copy?master_id=${mid}&account_id=${aid}&amount=${amt}`;
      const res = await fetch(url, { method: 'POST', headers: h });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert('Error', data.detail || 'Could not start copy');
      } else {
        Alert.alert('Success', `Now copying ${copyTarget.provider_name || 'trader'}`);
        setCopyTarget(null);
        setCopyAmount('');
        fetchLeaderboard();
        fetchMyCopies();
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setCopySubmitting(false);
  };

  const stopCopy = (id, name) => {
    Alert.alert('Stop copying', `Stop copying ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: async () => {
          setStoppingId(id);
          try {
            const h = await authHeaders();
            const res = await fetch(`${API_URL}/social/copy/${id}`, { method: 'DELETE', headers: h });
            if (!res.ok) {
              const d = await res.json().catch(() => ({}));
              Alert.alert('Error', d.detail || 'Failed');
            } else {
              setCopies((c) => c.filter((x) => x.id !== id));
            }
          } catch (e) {
            Alert.alert('Error', e.message);
          }
          setStoppingId(null);
        },
      },
    ]);
  };

  const submitInvest = async () => {
    if (!investTarget) return;
    const aid = copyAccountId;
    const amt = parseFloat(investAmount);
    if (!aid) {
      Alert.alert('Account', 'Select account');
      return;
    }
    if (!amt || amt <= 0) {
      Alert.alert('Amount', 'Enter amount');
      return;
    }
    setInvestSubmitting(true);
    try {
      const h = await authHeaders();
      const isMamm = String(investTarget?.master_type || '').toLowerCase() === 'mamm';
      let url = `${API_URL}/social/mamm-pamm/${investTarget.id}/invest?account_id=${aid}&amount=${amt}`;
      if (isMamm && investScaling) {
        url += `&volume_scaling_pct=${parseFloat(investScaling) || 100}`;
      }
      const res = await fetch(url, { method: 'POST', headers: h });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) Alert.alert('Error', data.detail || 'Failed');
      else {
        Alert.alert('Success', 'Investment submitted');
        setInvestTarget(null);
        setInvestAmount('');
        setInvestScaling('100');
        fetchMamm();
        fetchAllocations();
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setInvestSubmitting(false);
  };

  const submitRefill = async () => {
    if (!refillTarget) return;
    const aid = copyAccountId;
    const amt = parseFloat(refillAmount);
    if (!aid) { Alert.alert('Account', 'Select account'); return; }
    if (!amt || amt <= 0) { Alert.alert('Amount', 'Enter a valid amount'); return; }
    setRefillSubmitting(true);
    try {
      const h = await authHeaders();
      const masterId = refillTarget.master_id || refillTarget.id;
      const url = `${API_URL}/social/mamm-pamm/${masterId}/invest?account_id=${aid}&amount=${amt}`;
      const res = await fetch(url, { method: 'POST', headers: h });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert('Error', data.detail || 'Refill failed');
      } else {
        Alert.alert('Success', `Topped up by $${amt}`);
        setRefillTarget(null);
        setRefillAmount('');
        fetchAllocations();
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setRefillSubmitting(false);
  };

  const withdrawAllocation = (alloc) => {
    Alert.alert(
      'Withdraw allocation',
      `Withdraw all funds from ${alloc.manager_name}? This closes positions and returns capital to your wallet.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setWithdrawingId(alloc.id);
            try {
              const h = await authHeaders();
              const masterId = alloc.master_id || alloc.id;
              const res = await fetch(`${API_URL}/social/mamm-pamm/${masterId}/withdraw`, {
                method: 'DELETE',
                headers: h,
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                Alert.alert('Error', data.detail || 'Withdraw failed');
              } else {
                Alert.alert('Success', `Returned $${Number(data.returned_to_wallet || 0).toFixed(2)} to wallet`);
                fetchAllocations();
              }
            } catch (e) {
              Alert.alert('Error', e.message);
            }
            setWithdrawingId(null);
          },
        },
      ]
    );
  };

  const submitBecomeProvider = async () => {
    if (!provAccountId) {
      Alert.alert('Account', 'Select a live trading account');
      return;
    }
    setProvSubmitting(true);
    try {
      const h = await authHeaders();
      const isManager = provType === 'pamm' || provType === 'mamm';
      const params = [
        `account_id=${encodeURIComponent(provAccountId)}`,
        `master_type=${encodeURIComponent(provType)}`,
        `description=${encodeURIComponent(provDesc || '')}`,
        `performance_fee_pct=${encodeURIComponent(provFee || '20')}`,
        `min_investment=${encodeURIComponent(provMin || '100')}`,
        `max_investors=${encodeURIComponent(provMaxInv || '100')}`,
      ];
      if (isManager) {
        params.push(`management_fee_pct=${encodeURIComponent(provMgmtFee || '0')}`);
      }
      const res = await fetch(`${API_URL}/social/become-provider?${params.join('&')}`, {
        method: 'POST',
        headers: h,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) Alert.alert('Error', data.detail || 'Failed to apply');
      else {
        Alert.alert('Submitted', data.message || 'Application sent for review');
        fetchDashboard();
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setProvSubmitting(false);
  };

  const cardBorder = { borderColor: colors.border, backgroundColor: colors.bgCard };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHit}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Social</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.hero,
            {
              backgroundColor: colors.bgCard,
              borderColor: colors.border,
              borderLeftWidth: 4,
              borderLeftColor: accent,
            },
          ]}
        >
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Copy elite traders</Text>
          <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
            Leaderboard, managed accounts, and your provider dashboard — same as web.
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabScrollInner}
        >
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[
                styles.tabChip,
                {
                  backgroundColor: tab === t.id ? accent : colors.bgSecondary,
                  borderColor: tab === t.id ? accent : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabChipText,
                  { color: tab === t.id ? '#fff' : colors.textSecondary },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.body}>
          {tab === 'leaderboard' && (
            <>
              <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Sort by</Text>
              <View style={styles.sortRow}>
                {SORTS.map((s) => (
                  <TouchableOpacity
                    key={s.value}
                    onPress={() => {
                      setSortBy(s.value);
                      setPage(1);
                    }}
                    style={[
                      styles.sortChip,
                      {
                        borderColor: sortBy === s.value ? accent : colors.border,
                        backgroundColor: sortBy === s.value ? accentMutedLight : colors.bgSecondary,
                      },
                    ]}
                  >
                    <Text style={{ color: sortBy === s.value ? accent : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {lbError ? (
                <TouchableOpacity style={[styles.bannerErr, { borderColor: colors.error }]} onPress={fetchLeaderboard}>
                  <Text style={{ color: colors.error, flex: 1 }}>{lbError}</Text>
                  <Text style={{ color: accent, fontWeight: '700' }}>Retry</Text>
                </TouchableOpacity>
              ) : null}

              {lbLoading ? (
                <ActivityIndicator style={{ marginVertical: 32 }} color={accent} />
              ) : providers.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="trophy-outline" size={48} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No providers yet</Text>
                </View>
              ) : (
                providers.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.providerCard, cardBorder]}
                    onPress={() => openDetail(p.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.providerTop}>
                      <View style={[styles.avatar, { backgroundColor: accentMuted }]}>
                        <Text style={[styles.avatarTxt, { color: accent }]}>
                          {(p.provider_name || '?').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.pName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {p.provider_name || 'Trader'}
                        </Text>
                        <Text style={[styles.pFee, { color: colors.textMuted }]}>Fee {p.performance_fee_pct}% · Min ${p.min_investment}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.copyOutlineBtn, { borderColor: accent }]}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          setCopyTarget(p);
                          setCopyAmount(String(Math.max(p.min_investment || 100, 100)));
                        }}
                      >
                        <Text style={{ color: accent, fontWeight: '700', fontSize: 12 }}>Copy</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.roi, { color: p.total_return_pct >= 0 ? colors.success : colors.error }]}>
                      {p.total_return_pct >= 0 ? '+' : ''}
                      {Number(p.total_return_pct).toFixed(2)}%
                    </Text>
                    <Text style={[styles.roiLbl, { color: colors.textMuted }]}>Total ROI</Text>
                    <View style={[styles.stats3, { borderTopColor: colors.border }]}>
                      <View>
                        <Text style={[styles.sLbl, { color: colors.textMuted }]}>Drawdown</Text>
                        <Text style={[styles.sVal, { color: colors.error }]}>{Number(p.max_drawdown_pct).toFixed(2)}%</Text>
                      </View>
                      <View>
                        <Text style={[styles.sLbl, { color: colors.textMuted }]}>Sharpe</Text>
                        <Text style={[styles.sVal, { color: colors.textPrimary }]}>{Number(p.sharpe_ratio).toFixed(2)}</Text>
                      </View>
                      <View>
                        <Text style={[styles.sLbl, { color: colors.textMuted }]}>Followers</Text>
                        <Text style={[styles.sVal, { color: colors.textPrimary }]}>{p.followers_count}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )}

              {pages > 1 && (
                <View style={styles.pager}>
                  <TouchableOpacity disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))} style={styles.pageBtn}>
                    <Text style={{ color: page <= 1 ? colors.textMuted : colors.textPrimary }}>Prev</Text>
                  </TouchableOpacity>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{page} / {pages}</Text>
                  <TouchableOpacity disabled={page >= pages} onPress={() => setPage((p) => p + 1)} style={styles.pageBtn}>
                    <Text style={{ color: page >= pages ? colors.textMuted : colors.textPrimary }}>Next</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {tab === 'my-copies' && (
            <>
              {copiesLoading ? (
                <ActivityIndicator style={{ marginVertical: 24 }} color={accent} />
              ) : copies.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="link-outline" size={48} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Not copying anyone</Text>
                  <TouchableOpacity onPress={() => setTab('leaderboard')} style={{ marginTop: 12 }}>
                    <Text style={{ color: accent, fontWeight: '600' }}>Browse leaderboard →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                copies.map((c) => (
                  <View key={c.id} style={[styles.copyRow, cardBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.copyName, { color: colors.textPrimary }]}>{c.provider_name}</Text>
                      <Text style={[styles.copyMeta, { color: colors.textSecondary }]}>
                        Alloc ${Number(c.allocation_amount).toFixed(2)} · PnL{' '}
                        <Text style={{ color: c.total_profit >= 0 ? colors.success : colors.error }}>
                          {c.total_profit >= 0 ? '+' : ''}${Number(c.total_profit).toFixed(2)}
                        </Text>
                        {' · ROI '}
                        <Text style={{ color: c.total_return_pct >= 0 ? colors.success : colors.error }}>
                          {c.total_return_pct >= 0 ? '+' : ''}
                          {Number(c.total_return_pct).toFixed(2)}%
                        </Text>
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => stopCopy(c.id, c.provider_name)}
                      disabled={stoppingId === c.id}
                      style={styles.stopBtn}
                    >
                      <Text style={{ color: colors.error, fontWeight: '700', fontSize: 12 }}>
                        {stoppingId === c.id ? '…' : 'Stop'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
          )}

          {tab === 'mamm' && (
            <>
              {mammLoading ? (
                <ActivityIndicator style={{ marginVertical: 24 }} color={accent} />
              ) : managed.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="pie-chart-outline" size={48} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No MAM/PAMM programs</Text>
                </View>
              ) : (
                managed.map((a) => (
                  <View key={a.id} style={[styles.mammCard, cardBorder]}>
                    <View style={styles.providerTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pName, { color: colors.textPrimary }]}>{a.manager_name}</Text>
                        <View style={[styles.typeTag, { backgroundColor: accentMutedLight }]}>
                          <Text style={{ color: accent, fontSize: 10, fontWeight: '700' }}>{a.master_type?.toUpperCase()}</Text>
                        </View>
                      </View>
                      <TouchableOpacity style={[styles.copyOutlineBtn, { borderColor: accent }]} onPress={() => setInvestTarget(a)}>
                        <Text style={{ color: accent, fontWeight: '700', fontSize: 12 }}>Invest</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.roi, { color: a.total_return_pct >= 0 ? colors.success : colors.error }]}>
                      {a.total_return_pct >= 0 ? '+' : ''}
                      {Number(a.total_return_pct).toFixed(2)}%
                    </Text>
                    <View style={[styles.stats3, { borderTopColor: colors.border, marginTop: 8 }]}>
                      <View>
                        <Text style={[styles.sLbl, { color: colors.textMuted }]}>Investors</Text>
                        <Text style={[styles.sVal, { color: colors.textPrimary }]}>{a.active_investors}</Text>
                      </View>
                      <View>
                        <Text style={[styles.sLbl, { color: colors.textMuted }]}>Slots</Text>
                        <Text style={[styles.sVal, { color: colors.textPrimary }]}>{a.slots_available}</Text>
                      </View>
                      <View>
                        <Text style={[styles.sLbl, { color: colors.textMuted }]}>Min $</Text>
                        <Text style={[styles.sVal, { color: colors.textPrimary }]}>{a.min_investment}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {tab === 'investments' && (
            <>
              {allocLoading ? (
                <ActivityIndicator style={{ marginVertical: 24 }} color={accent} />
              ) : allocations.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="briefcase-outline" size={48} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No PAMM allocations yet</Text>
                  <TouchableOpacity onPress={() => setTab('mamm')} style={{ marginTop: 12 }}>
                    <Text style={{ color: accent, fontWeight: '600' }}>Browse MAM/PAMM →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {allocSummary && (
                    <View style={[styles.dashCard, cardBorder, { marginBottom: 12 }]}>
                      <View style={[styles.dashRow, { borderBottomColor: colors.border }]}>
                        <Text style={{ color: colors.textMuted }}>Total invested</Text>
                        <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>${Number(allocSummary.total_invested || 0).toFixed(2)}</Text>
                      </View>
                      <View style={[styles.dashRow, { borderBottomColor: colors.border }]}>
                        <Text style={{ color: colors.textMuted }}>Current value</Text>
                        <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>${Number(allocSummary.total_current_value || 0).toFixed(2)}</Text>
                      </View>
                      <View style={[styles.dashRow, { borderBottomColor: colors.border }]}>
                        <Text style={{ color: colors.textMuted }}>Total P&L</Text>
                        <Text style={{ color: (allocSummary.total_pnl || 0) >= 0 ? colors.success : colors.error, fontWeight: '700' }}>
                          {(allocSummary.total_pnl || 0) >= 0 ? '+' : ''}${Number(allocSummary.total_pnl || 0).toFixed(2)}
                        </Text>
                      </View>
                      <View style={[styles.dashRow, { borderBottomColor: colors.border, borderBottomWidth: 0 }]}>
                        <Text style={{ color: colors.textMuted }}>Overall return</Text>
                        <Text style={{ color: (allocSummary.overall_pnl_pct || 0) >= 0 ? colors.success : colors.error, fontWeight: '700' }}>
                          {(allocSummary.overall_pnl_pct || 0) >= 0 ? '+' : ''}{Number(allocSummary.overall_pnl_pct || 0).toFixed(2)}%
                        </Text>
                      </View>
                    </View>
                  )}

                  {allocations.map((a) => (
                    <View key={a.id} style={[styles.mammCard, cardBorder]}>
                      <View style={styles.providerTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pName, { color: colors.textPrimary }]}>{a.manager_name}</Text>
                          <Text style={[styles.pFee, { color: colors.textMuted }]}>
                            Joined {a.joined_at ? new Date(a.joined_at).toLocaleDateString() : '—'} · Fee {a.performance_fee_pct}%
                          </Text>
                        </View>
                        <View style={{
                          paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                          backgroundColor: a.status === 'active' ? colors.success + '20' : colors.textMuted + '20',
                        }}>
                          <Text style={{ color: a.status === 'active' ? colors.success : colors.textMuted, fontSize: 10, fontWeight: '700' }}>
                            {String(a.status || '').toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.stats3, { borderTopColor: colors.border, marginTop: 10 }]}>
                        <View>
                          <Text style={[styles.sLbl, { color: colors.textMuted }]}>Invested</Text>
                          <Text style={[styles.sVal, { color: colors.textPrimary }]}>${Number(a.allocation_amount || 0).toFixed(2)}</Text>
                        </View>
                        <View>
                          <Text style={[styles.sLbl, { color: colors.textMuted }]}>Current</Text>
                          <Text style={[styles.sVal, { color: colors.textPrimary }]}>${Number(a.current_value || 0).toFixed(2)}</Text>
                        </View>
                        <View>
                          <Text style={[styles.sLbl, { color: colors.textMuted }]}>P&L</Text>
                          <Text style={[styles.sVal, { color: (a.total_pnl || 0) >= 0 ? colors.success : colors.error }]}>
                            {(a.total_pnl || 0) >= 0 ? '+' : ''}${Number(a.total_pnl || 0).toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      {a.status === 'active' && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                          <TouchableOpacity
                            style={{
                              flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                              backgroundColor: accentMutedLight, borderWidth: 1, borderColor: accent,
                            }}
                            onPress={() => {
                              setRefillTarget(a);
                              setRefillAmount('');
                            }}
                          >
                            <Text style={{ color: accent, fontWeight: '700', fontSize: 12 }}>Refill</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{
                              flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                              borderWidth: 1, borderColor: colors.error,
                            }}
                            onPress={() => withdrawAllocation(a)}
                            disabled={withdrawingId === a.id}
                          >
                            {withdrawingId === a.id ? (
                              <ActivityIndicator color={colors.error} size="small" />
                            ) : (
                              <Text style={{ color: colors.error, fontWeight: '700', fontSize: 12 }}>Withdraw</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          {tab === 'provider' && (
            <View style={[styles.formCard, cardBorder]}>
              <Text style={[styles.formTitle, { color: colors.textPrimary }]}>Apply as provider</Text>
              <Text style={[styles.formHint, { color: colors.textMuted }]}>
                Uses a live account. Admin approves new providers.
              </Text>

              <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Provider type</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                {PROVIDER_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    onPress={() => setProvType(t.value)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      alignItems: 'center',
                      borderColor: provType === t.value ? accent : colors.border,
                      backgroundColor: provType === t.value ? accentMutedLight : colors.bgSecondary,
                    }}
                  >
                    <Text style={{ color: provType === t.value ? accent : colors.textSecondary, fontWeight: '700', fontSize: 12 }}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Trading account</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {accounts.map((acc) => {
                  const id = acc.id || acc._id;
                  const demo = acc.is_demo || acc.isDemo || acc.accountTypeId?.isDemo;
                  return (
                    <TouchableOpacity
                      key={id}
                      onPress={() => !demo && setProvAccountId(id)}
                      style={[
                        styles.acctPick,
                        {
                          borderColor: provAccountId === id ? accent : colors.border,
                          opacity: demo ? 0.45 : 1,
                        },
                      ]}
                    >
                      <Text style={{ color: colors.textPrimary, fontSize: 12 }} numberOfLines={1}>
                        {acc.accountId || acc.account_number || id?.slice?.(0, 8)}
                        {demo ? ' (demo)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Description</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
                placeholder="Strategy & experience"
                placeholderTextColor={colors.textMuted}
                value={provDesc}
                onChangeText={setProvDesc}
                multiline
              />
              <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Performance fee % (0–50)</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
                value={provFee}
                onChangeText={setProvFee}
                keyboardType="decimal-pad"
              />
              {(provType === 'pamm' || provType === 'mamm') && (
                <>
                  <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Management fee % (0–10)</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
                    value={provMgmtFee}
                    onChangeText={setProvMgmtFee}
                    keyboardType="decimal-pad"
                  />
                </>
              )}
              <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Min investment ($)</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
                value={provMin}
                onChangeText={setProvMin}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Max investors</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
                value={provMaxInv}
                onChangeText={setProvMaxInv}
                keyboardType="number-pad"
              />
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: accent }]}
                onPress={submitBecomeProvider}
                disabled={provSubmitting}
              >
                {provSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnTxt}>Submit application</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {tab === 'dashboard' && (
            <>
              {dashLoading ? (
                <ActivityIndicator style={{ marginVertical: 24 }} color={accent} />
              ) : !dash ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="stats-chart-outline" size={48} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{dashError || 'No provider profile'}</Text>
                  <TouchableOpacity onPress={() => setTab('provider')} style={{ marginTop: 12 }}>
                    <Text style={{ color: accent, fontWeight: '600' }}>Become a provider →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={[styles.dashCard, cardBorder]}>
                    <View style={[styles.dashRow, { borderBottomColor: colors.border }]}>
                      <Text style={{ color: colors.textMuted }}>Status</Text>
                      <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{dash.status}</Text>
                    </View>
                    <View style={[styles.dashRow, { borderBottomColor: colors.border }]}>
                      <Text style={{ color: colors.textMuted }}>Type</Text>
                      <Text style={{ color: colors.textPrimary }}>{dash.master_type}</Text>
                    </View>
                    <View style={[styles.dashRow, { borderBottomColor: colors.border }]}>
                      <Text style={{ color: colors.textMuted }}>Total AUM</Text>
                      <Text style={{ color: colors.textPrimary }}>${Number(perfData?.total_aum ?? dash.total_aum ?? 0).toFixed(2)}</Text>
                    </View>
                    <View style={[styles.dashRow, { borderBottomColor: colors.border }]}>
                      <Text style={{ color: colors.textMuted }}>Investors</Text>
                      <Text style={{ color: colors.textPrimary }}>{perfData?.total_investors ?? dash.active_investors ?? 0}</Text>
                    </View>
                    <View style={[styles.dashRow, { borderBottomColor: colors.border }]}>
                      <Text style={{ color: colors.textMuted }}>Fee earnings</Text>
                      <Text style={{ color: colors.success }}>${Number(perfData?.fee_earnings ?? 0).toFixed(2)}</Text>
                    </View>
                    <View style={[styles.dashRow, { borderBottomColor: colors.border }]}>
                      <Text style={{ color: colors.textMuted }}>Sharpe ratio</Text>
                      <Text style={{ color: colors.textPrimary }}>{Number(perfData?.sharpe_ratio ?? 0).toFixed(2)}</Text>
                    </View>
                    <View style={[styles.dashRow, { borderBottomColor: colors.border }]}>
                      <Text style={{ color: colors.textMuted }}>Max drawdown</Text>
                      <Text style={{ color: colors.error }}>{Number(perfData?.max_drawdown_pct ?? dash.max_drawdown_pct ?? 0).toFixed(2)}%</Text>
                    </View>
                    <View style={[styles.dashRow, { borderBottomColor: colors.border, borderBottomWidth: 0 }]}>
                      <Text style={{ color: colors.textMuted }}>Total return %</Text>
                      <Text style={{ color: (perfData?.total_return_pct ?? dash.total_return_pct ?? 0) >= 0 ? colors.success : colors.error }}>
                        {(perfData?.total_return_pct ?? dash.total_return_pct ?? 0) >= 0 ? '+' : ''}
                        {Number(perfData?.total_return_pct ?? dash.total_return_pct ?? 0).toFixed(2)}%
                      </Text>
                    </View>
                  </View>

                  {Array.isArray(perfData?.monthly_breakdown) && perfData.monthly_breakdown.length > 0 && (
                    <View style={[styles.dashCard, cardBorder, { marginTop: 12 }]}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 13, marginBottom: 12 }}>
                        Monthly performance
                      </Text>
                      {(() => {
                        const maxAbs = Math.max(...perfData.monthly_breakdown.map((m) => Math.abs(m.profit || 0)), 1);
                        return perfData.monthly_breakdown.map((m, i) => {
                          const pct = (Math.abs(m.profit || 0) / maxAbs) * 100;
                          const positive = (m.profit || 0) >= 0;
                          return (
                            <View key={i} style={{ marginBottom: 10 }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{m.month}</Text>
                                <Text style={{ color: positive ? colors.success : colors.error, fontSize: 11, fontWeight: '700' }}>
                                  {positive ? '+' : ''}${Number(m.profit || 0).toFixed(2)}
                                </Text>
                              </View>
                              <View style={{ height: 6, backgroundColor: colors.bgSecondary, borderRadius: 3, overflow: 'hidden' }}>
                                <View
                                  style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    backgroundColor: positive ? colors.success : colors.error,
                                    borderRadius: 3,
                                  }}
                                />
                              </View>
                            </View>
                          );
                        });
                      })()}
                    </View>
                  )}

                  {investorsList.length > 0 && (
                    <View style={[styles.dashCard, cardBorder, { marginTop: 12 }]}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 13, marginBottom: 8 }}>
                        Investors ({investorsList.length})
                      </Text>
                      {investorsList.map((inv, i) => (
                        <View
                          key={inv.id || i}
                          style={[styles.dashRow, { borderBottomColor: colors.border, borderBottomWidth: i === investorsList.length - 1 ? 0 : StyleSheet.hairlineWidth }]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
                              {inv.user_name || inv.user_email || 'Investor'}
                            </Text>
                            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                              ${Number(inv.allocated || 0).toFixed(2)} · {Number(inv.share_pct || 0).toFixed(1)}% share
                            </Text>
                          </View>
                          <Text style={{ color: (inv.pnl || 0) >= 0 ? colors.success : colors.error, fontSize: 12, fontWeight: '700' }}>
                            {(inv.pnl || 0) >= 0 ? '+' : ''}${Number(inv.pnl || 0).toFixed(2)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Provider detail */}
      <Modal visible={!!detailId} animationType="slide" transparent onRequestClose={() => setDetailId(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.bgCard }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Provider</Text>
              <TouchableOpacity onPress={() => setDetailId(null)}>
                <Ionicons name="close" size={26} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {detailLoading ? (
              <ActivityIndicator color={accent} style={{ marginVertical: 24 }} />
            ) : detail ? (
              <ScrollView>
                <Text style={[styles.pName, { color: colors.textPrimary, marginBottom: 8 }]}>{detail.provider_name}</Text>
                <View style={styles.dashGrid}>
                  {[
                    ['ROI %', `${detail.total_return_pct >= 0 ? '+' : ''}${Number(detail.total_return_pct).toFixed(2)}%`],
                    ['Max DD', `${Number(detail.max_drawdown_pct).toFixed(2)}%`],
                    ['Sharpe', Number(detail.sharpe_ratio).toFixed(2)],
                    ['Win rate', `${Number(detail.win_rate).toFixed(1)}%`],
                    ['Trades', String(detail.total_trades)],
                    ['Followers', String(detail.followers_count)],
                  ].map(([k, v]) => (
                    <View key={k} style={[styles.kv, { backgroundColor: colors.bgSecondary }]}>
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>{k}</Text>
                      <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 13 }}>{v}</Text>
                    </View>
                  ))}
                </View>
                {detail.description ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginVertical: 12 }}>{detail.description}</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: detail.is_copying ? colors.border : accent, marginTop: 8 }]}
                  disabled={detail.is_copying}
                  onPress={() => {
                    setDetailId(null);
                    setCopyTarget({
                      id: detail.id,
                      provider_name: detail.provider_name,
                      min_investment: detail.min_investment,
                      performance_fee_pct: detail.performance_fee_pct,
                    });
                    setCopyAmount(String(Math.max(detail.min_investment || 100, 100)));
                  }}
                >
                  <Text style={styles.primaryBtnTxt}>{detail.is_copying ? 'Already copying' : 'Copy this trader'}</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Copy amount modal */}
      <Modal visible={!!copyTarget} animationType="fade" transparent onRequestClose={() => setCopyTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.bgCard }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Copy {copyTarget?.provider_name || ''}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
              Fee {copyTarget?.performance_fee_pct ?? '-'}% · Min ${copyTarget?.min_investment ?? '-'}
            </Text>
            <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Account</Text>
            <ScrollView horizontal style={{ marginBottom: 8 }}>
              {accounts.map((acc) => {
                const id = acc.id || acc._id;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setCopyAccountId(id)}
                    style={[
                      styles.acctPick,
                      { borderColor: copyAccountId === id ? accent : colors.border },
                    ]}
                  >
                    <Text style={{ color: colors.textPrimary, fontSize: 11 }} numberOfLines={1}>
                      {acc.accountId || acc.account_number || String(id).slice(0, 8)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Amount (USD)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
              value={copyAmount}
              onChangeText={setCopyAmount}
              keyboardType="decimal-pad"
              placeholder="Min allocation"
              placeholderTextColor={colors.textMuted}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={() => setCopyTarget(null)}>
                <Text style={{ color: colors.textPrimary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1, backgroundColor: accent }]} onPress={submitCopy} disabled={copySubmitting}>
                {copySubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTxt}>Start</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MAM invest */}
      <Modal visible={!!investTarget} animationType="fade" transparent onRequestClose={() => setInvestTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.bgCard }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Invest — {investTarget?.manager_name}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
              Min ${investTarget?.min_investment} · {String(investTarget?.master_type || '').toUpperCase()}
            </Text>
            <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Account</Text>
            <ScrollView horizontal style={{ marginBottom: 8 }}>
              {accounts.map((acc) => {
                const id = acc.id || acc._id;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setCopyAccountId(id)}
                    style={[styles.acctPick, { borderColor: copyAccountId === id ? accent : colors.border }]}
                  >
                    <Text style={{ color: colors.textPrimary, fontSize: 11 }} numberOfLines={1}>
                      {acc.accountId || acc.account_number || String(id).slice(0, 8)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Amount (USD)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
              value={investAmount}
              onChangeText={setInvestAmount}
              keyboardType="decimal-pad"
              placeholder="Amount"
              placeholderTextColor={colors.textMuted}
            />
            {String(investTarget?.master_type || '').toLowerCase() === 'mamm' && (
              <>
                <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Volume scaling % (1–500)</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
                  value={investScaling}
                  onChangeText={setInvestScaling}
                  keyboardType="decimal-pad"
                  placeholder="100"
                  placeholderTextColor={colors.textMuted}
                />
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={() => setInvestTarget(null)}>
                <Text style={{ color: colors.textPrimary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1, backgroundColor: accent }]} onPress={submitInvest} disabled={investSubmitting}>
                {investSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTxt}>Invest</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Refill PAMM allocation */}
      <Modal visible={!!refillTarget} animationType="fade" transparent onRequestClose={() => setRefillTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.bgCard }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Refill — {refillTarget?.manager_name}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
              Top up your existing allocation
            </Text>
            <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Account</Text>
            <ScrollView horizontal style={{ marginBottom: 8 }}>
              {accounts.map((acc) => {
                const id = acc.id || acc._id;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setCopyAccountId(id)}
                    style={[styles.acctPick, { borderColor: copyAccountId === id ? accent : colors.border }]}
                  >
                    <Text style={{ color: colors.textPrimary, fontSize: 11 }} numberOfLines={1}>
                      {acc.accountId || acc.account_number || String(id).slice(0, 8)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={[styles.inputLbl, { color: colors.textSecondary }]}>Refill amount (USD)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgSecondary }]}
              value={refillAmount}
              onChangeText={setRefillAmount}
              keyboardType="decimal-pad"
              placeholder="Amount to add"
              placeholderTextColor={colors.textMuted}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={() => setRefillTarget(null)}>
                <Text style={{ color: colors.textPrimary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1, backgroundColor: accent }]} onPress={submitRefill} disabled={refillSubmitting}>
                {refillSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTxt}>Add funds</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  backHit: { padding: 8, width: 44 },
  screenTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  hero: { marginHorizontal: 16, borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1 },
  heroTitle: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  heroSub: { fontSize: 13, lineHeight: 18 },
  tabScroll: { maxHeight: 48, marginBottom: 8 },
  tabScrollInner: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  tabChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginRight: 8 },
  tabChipText: { fontSize: 12, fontWeight: '700' },
  body: { paddingHorizontal: 16 },
  sectionHint: { fontSize: 12, marginBottom: 8 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  sortChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  bannerErr: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  emptyBox: { alignItems: 'center', paddingVertical: 36 },
  emptyTitle: { marginTop: 12, fontSize: 15 },
  providerCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  providerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 16, fontWeight: '800' },
  pName: { fontSize: 15, fontWeight: '700' },
  pFee: { fontSize: 11, marginTop: 2 },
  copyOutlineBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  roi: { fontSize: 22, fontWeight: '800', marginTop: 10 },
  roiLbl: { fontSize: 11, marginBottom: 8 },
  stats3: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  sLbl: { fontSize: 10, marginBottom: 2 },
  sVal: { fontSize: 13, fontWeight: '700' },
  pager: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginVertical: 16 },
  pageBtn: { padding: 8 },
  copyRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  copyName: { fontSize: 15, fontWeight: '700' },
  copyMeta: { fontSize: 12, marginTop: 4 },
  stopBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  mammCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  typeTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  formCard: { borderRadius: 14, borderWidth: 1, padding: 16 },
  formTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  formHint: { fontSize: 12, marginBottom: 14 },
  inputLbl: { fontSize: 12, marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, minHeight: 44 },
  acctPick: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginRight: 8 },
  primaryBtn: { marginTop: 20, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: { marginTop: 20, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, alignItems: 'center' },
  dashCard: { borderRadius: 14, borderWidth: 1, padding: 16 },
  dashRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  dashGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kv: { width: Math.min(120, (SCREEN_W - 64) / 3), borderRadius: 8, padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '88%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
});
