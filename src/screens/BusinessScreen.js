import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';
import { useTheme } from '../context/ThemeContext';
import IBScreen from './IBScreen';

const MAIN_TABS = [
  { id: 'ib', label: 'IB Program' },
  { id: 'sub-broker', label: 'Sub-Broker' },
  { id: 'network', label: 'My Network' },
];

function fmt(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

function NetworkTreeNode({ node, depth, colors }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = node.children || [];
  const hasChildren = children.length > 0;

  return (
    <View style={{ marginLeft: depth * 14 }}>
      <TouchableOpacity
        style={[styles.treeRow, { backgroundColor: colors.bgSecondary }]}
        onPress={() => hasChildren && setExpanded(!expanded)}
        activeOpacity={hasChildren ? 0.7 : 1}
      >
        <Text style={[styles.treeChevron, { color: colors.textMuted }]}>
          {hasChildren ? (expanded ? '▼' : '▶') : '•'}
        </Text>
        <Text style={[styles.treeName, { color: colors.textPrimary }]} numberOfLines={1}>
          {node.name || node.email || '—'}
        </Text>
        <Text style={[styles.treeLevel, { color: colors.primary }]}>L{node.depth ?? node.level ?? 0}</Text>
        <Text style={[styles.treeEarned, { color: colors.textMuted }]}>${fmt(node.total_earned)}</Text>
        {!node.is_active && (
          <View style={styles.inactivePill}>
            <Text style={styles.inactivePillText}>inactive</Text>
          </View>
        )}
      </TouchableOpacity>
      {expanded &&
        hasChildren &&
        children.map((child) => <NetworkTreeNode key={child.id} node={child} depth={depth + 1} colors={colors} />)}
    </View>
  );
}

export default function BusinessScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState(route.params?.initialTab || 'ib');

  useFocusEffect(
    useCallback(() => {
      const t = route.params?.initialTab;
      if (t === 'ib' || t === 'sub-broker' || t === 'network') setTab(t);
    }, [route.params?.initialTab])
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHit} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Business</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabScroll, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabScrollContent}
      >
        {MAIN_TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[
              styles.mainTab,
              {
                backgroundColor: tab === t.id ? colors.primary : isDark ? colors.bgSecondary : colors.bgHover,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setTab(t.id)}
          >
            <Text
              style={[
                styles.mainTabText,
                { color: tab === t.id ? '#fff' : colors.textSecondary },
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.body}>
        {tab === 'ib' && (
          <IBScreen navigation={navigation} route={{ params: { hideMainHeader: true } }} />
        )}
        {tab === 'sub-broker' && <SubBrokerPanel colors={colors} />}
        {tab === 'network' && <NetworkPanel colors={colors} />}
      </View>
    </View>
  );
}

function SubBrokerPanel({ colors }) {
  const [status, setStatus] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [companyName, setCompanyName] = useState('');

  const load = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;
      const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const sRes = await fetch(`${API_URL}/business/status`, { headers: h });
      const s = await sRes.json().catch(() => ({}));
      setStatus(s);
      let dash = null;
      if (s.is_ib) {
        try {
          const dRes = await fetch(`${API_URL}/business/sub-broker/dashboard`, { headers: h });
          if (dRes.ok) dash = await dRes.json();
        } catch (_) {}
      }
      setDashboard(dash);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/business/apply-sub-broker`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        Alert.alert('Submitted', data.message || 'Sub-broker application submitted for review.');
        await load();
      } else {
        Alert.alert('Error', data.detail || data.message || 'Failed to apply');
      }
    } catch (e) {
      Alert.alert('Error', 'Network error');
    }
    setApplying(false);
  };

  const copyCode = async (code) => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    Alert.alert('Copied', 'Referral code copied');
  };

  if (loading) {
    return (
      <View style={styles.panelCenter}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const pending = status?.application_status === 'pending' && !status?.is_ib;

  if (status?.is_ib && !dashboard && !pending) {
    return (
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ padding: 24 }}
      >
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.muted, { color: colors.textMuted, textAlign: 'center' }]}>
            Could not load sub-broker dashboard. Pull to refresh or try again.
          </Text>
          <TouchableOpacity style={[styles.applyBtn, { backgroundColor: colors.primary, marginTop: 16 }]} onPress={load}>
            <Text style={styles.applyBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (pending) {
    return (
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={styles.pendingEmoji}>⏳</Text>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Application pending</Text>
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            Your sub-broker application is under review.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (dashboard) {
    const stats = [
      { label: 'Clients', value: String(dashboard.direct_clients ?? 0) },
      { label: 'Total earned', value: `$${fmt(dashboard.total_earned)}` },
      { label: 'Pending', value: `$${fmt(dashboard.pending_payout)}` },
      { label: 'Commission', value: `$${fmt(dashboard.total_commission)}` },
    ];
    return (
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View style={styles.statGrid}>
          {stats.map((c) => (
            <View key={c.label} style={[styles.statBox, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[styles.statBoxLabel, { color: colors.textMuted }]}>{c.label}</Text>
              <Text style={[styles.statBoxVal, { color: colors.textPrimary }]}>{c.value}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.muted, { color: colors.textMuted, marginBottom: 8 }]}>Your referral code</Text>
          <View style={styles.codeRow}>
            <Text style={[styles.codeText, { color: colors.primary }]}>{dashboard.referral_code}</Text>
            <TouchableOpacity style={[styles.copyBtn, { backgroundColor: colors.primary }]} onPress={() => copyCode(dashboard.referral_code)}>
              <Text style={styles.copyBtnText}>Copy</Text>
            </TouchableOpacity>
          </View>
        </View>
        {Array.isArray(dashboard.clients) && dashboard.clients.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, paddingHorizontal: 0 }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary, paddingHorizontal: 16, marginBottom: 8 }]}>
              Your clients
            </Text>
            {dashboard.clients.map((c) => (
              <View key={c.user_id} style={[styles.clientRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{c.name || c.email}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{c.email}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>${fmt(c.total_balance)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{fmtDate(c.joined_at)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Become a Sub-Broker</Text>
        <Text style={[styles.muted, { color: colors.textMuted, marginTop: 8 }]}>
          Partner with us as a sub-broker. Get your own referral code, manage clients, and earn revenue share on
          their trading activity.
        </Text>
        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Company name (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
          value={companyName}
          onChangeText={setCompanyName}
          placeholder="Your company name"
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity
          style={[styles.applyBtn, { backgroundColor: colors.primary }, applying && { opacity: 0.6 }]}
          onPress={handleApply}
          disabled={applying}
        >
          {applying ? <ActivityIndicator color="#fff" /> : <Text style={styles.applyBtnText}>Apply as Sub-Broker</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function NetworkPanel({ colors }) {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    setErr(null);
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;
      const res = await fetch(`${API_URL}/business/ib/tree`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setTree(null);
        setErr('not_ib');
        return;
      }
      const data = await res.json();
      setTree(data);
    } catch (e) {
      setTree(null);
      setErr('error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <View style={styles.panelCenter}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (err === 'not_ib' || !tree) {
    return (
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.muted, { color: colors.textMuted, textAlign: 'center' }]}>
            You need to be an approved IB to see your network.
          </Text>
        </View>
      </ScrollView>
    );
  }

  const nodes = tree.tree || [];

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={styles.netHead}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Your MLM network</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tree.total_nodes ?? 0} members</Text>
        </View>
        <Text style={[styles.muted, { color: colors.textMuted, marginTop: 8 }]}>
          Code: <Text style={{ color: colors.primary, fontWeight: '700' }}>{tree.root?.referral_code}</Text>
          {' · '}
          Level: L{tree.root?.level}
          {' · '}
          Earned: <Text style={{ color: colors.profitColor, fontWeight: '700' }}>${fmt(tree.root?.total_earned)}</Text>
        </Text>
      </View>
      {nodes.length === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.muted, { color: colors.textMuted, textAlign: 'center' }]}>
            No downline yet. Share your referral link to grow your network.
          </Text>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, paddingVertical: 8 }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 8, paddingHorizontal: 12 }]}>
            Downline tree
          </Text>
          {nodes.map((n) => (
            <NetworkTreeNode key={n.id} node={n} depth={0} colors={colors} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backHit: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  tabScroll: { maxHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  tabScrollContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  mainTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 8,
  },
  mainTabText: { fontSize: 12, fontWeight: '600' },
  body: { flex: 1 },
  panelCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  card: {
    margin: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  muted: { fontSize: 13, lineHeight: 20 },
  pendingEmoji: { fontSize: 36, textAlign: 'center', marginBottom: 8 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 12, gap: 10 },
  statBox: {
    width: '47%',
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statBoxLabel: { fontSize: 11, fontWeight: '600' },
  statBoxVal: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  codeText: { fontSize: 18, fontWeight: '800', flex: 1 },
  copyBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  copyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  clientRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputLabel: { fontSize: 12, marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  applyBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  netHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  treeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 8,
    gap: 6,
  },
  treeChevron: { width: 18, fontSize: 10 },
  treeName: { flex: 1, fontSize: 13, fontWeight: '600' },
  treeLevel: { fontSize: 11, fontWeight: '700' },
  treeEarned: { fontSize: 11, fontVariant: ['tabular-nums'] },
  inactivePill: { backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  inactivePillText: { fontSize: 9, color: '#ef4444', fontWeight: '600' },
});
