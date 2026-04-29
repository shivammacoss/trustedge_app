import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import usePamm from '../hooks/usePamm';
import ScreenHeader from '../components/ui/ScreenHeader';
import TabBar from '../components/ui/TabBar';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';

const TABS = [
  { key: 'allocations', label: 'My Allocations' },
  { key: 'masters', label: 'Fund Managers' },
];

export default function PammScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { masters, allocations, accounts, walletBalance, summary, loading, refreshing, refresh, invest, withdrawAllocation } = usePamm();
  const [tab, setTab] = useState('allocations');
  const [investModal, setInvestModal] = useState(null);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(null);
  const [scaling, setScaling] = useState('100');
  const [submitting, setSubmitting] = useState(false);

  const handleInvest = useCallback(async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { Alert.alert(t('common.error'), 'Enter a valid amount'); return; }
    if (!accountId) { Alert.alert(t('common.error'), 'Select a live trading account'); return; }
    if (num > walletBalance) { Alert.alert(t('common.error'), 'Insufficient wallet balance'); return; }
    const min = Number(investModal?.min_investment || 0);
    if (min > 0 && num < min) { Alert.alert(t('common.error'), `Minimum investment is $${min}`); return; }
    setSubmitting(true);
    try {
      const isMam = (investModal?.master_type || '').toLowerCase() === 'mamm';
      await invest(investModal.id, accountId, num, isMam ? Number(scaling) || 100 : undefined);
      Alert.alert(t('common.success'), 'Investment successful');
      setInvestModal(null); setAmount(''); setScaling('100');
    } catch (e) { Alert.alert(t('common.error'), e.message); }
    setSubmitting(false);
  }, [amount, investModal, invest, t, accountId, walletBalance, scaling]);

  const handleWithdraw = useCallback((alloc) => {
    Alert.alert(t('pamm.withdraw'), `Withdraw from ${alloc.manager_name}?`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: async () => {
        try { await withdrawAllocation(alloc.id); Alert.alert(t('common.success'), 'Withdrawal submitted'); }
        catch (e) { Alert.alert(t('common.error'), e.message); }
      }},
    ]);
  }, [withdrawAllocation, t]);

  const renderAllocation = ({ item }) => (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={s.cardRow}>
        <View style={[s.avatar, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="person" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{item.manager_name}</Text>
          <Text style={[s.cardSub, { color: colors.textMuted }]}>{item.master_type || 'PAMM'} · Joined {new Date(item.joined_at).toLocaleDateString()}</Text>
        </View>
      </View>
      <View style={s.statsRow}>
        <View style={s.statCol}>
          <Text style={[s.statLabel, { color: colors.textMuted }]}>{t('pamm.totalInvested')}</Text>
          <Text style={[s.statVal, { color: colors.textPrimary }]}>${Number(item.allocation_amount || 0).toFixed(2)}</Text>
        </View>
        <View style={s.statCol}>
          <Text style={[s.statLabel, { color: colors.textMuted }]}>{t('pamm.currentValue')}</Text>
          <Text style={[s.statVal, { color: colors.textPrimary }]}>${Number(item.current_value || item.allocation_amount || 0).toFixed(2)}</Text>
        </View>
        <View style={s.statCol}>
          <Text style={[s.statLabel, { color: colors.textMuted }]}>P&L</Text>
          <Text style={[s.statVal, { color: (item.total_pnl || 0) >= 0 ? colors.success : colors.error }]}>
            {(item.total_pnl || 0) >= 0 ? '+' : ''}${Number(item.total_pnl || 0).toFixed(2)}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={[s.withdrawBtn, { borderColor: colors.error + '40' }]} onPress={() => handleWithdraw(item)}>
        <Text style={{ color: colors.error, fontWeight: '600', fontSize: 13 }}>{t('pamm.withdraw')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderMaster = ({ item }) => (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={s.cardRow}>
        <View style={[s.avatar, { backgroundColor: colors.success + '20' }]}>
          <Ionicons name="trending-up" size={20} color={colors.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{item.manager_name}</Text>
          <Text style={[s.cardSub, { color: colors.textMuted }]}>{item.master_type || 'PAMM'} · {item.active_investors || 0} investors</Text>
        </View>
        <View style={[s.badge, { backgroundColor: colors.success + '15' }]}>
          <Text style={{ color: colors.success, fontWeight: '700', fontSize: 13 }}>
            +{Number(item.total_return_pct || 0).toFixed(1)}%
          </Text>
        </View>
      </View>
      <View style={s.statsRow}>
        <View style={s.statCol}>
          <Text style={[s.statLabel, { color: colors.textMuted }]}>{t('pamm.performanceFee')}</Text>
          <Text style={[s.statVal, { color: colors.textPrimary }]}>{item.performance_fee_pct || 0}%</Text>
        </View>
        <View style={s.statCol}>
          <Text style={[s.statLabel, { color: colors.textMuted }]}>{t('pamm.maxDrawdown')}</Text>
          <Text style={[s.statVal, { color: colors.error }]}>{item.max_drawdown_pct || 0}%</Text>
        </View>
        <View style={s.statCol}>
          <Text style={[s.statLabel, { color: colors.textMuted }]}>{t('pamm.minInvestment')}</Text>
          <Text style={[s.statVal, { color: colors.textPrimary }]}>${item.min_investment || 100}</Text>
        </View>
      </View>
      {item.description ? <Text style={[s.desc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text> : null}
      <TouchableOpacity style={[s.investBtn, { backgroundColor: colors.primary }]} onPress={() => {
        setInvestModal(item);
        setAmount(String(item.min_investment || ''));
        setScaling('100');
        if (accounts.length > 0) setAccountId(accounts[0].id);
      }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('pamm.investNow')}</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) return (
    <View style={[s.center, { backgroundColor: colors.bgPrimary }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      <ScreenHeader title={t('pamm.title')} subtitle={t('pamm.subtitle')} onBack={() => navigation.goBack()} />

      {/* Summary */}
      <View style={s.summaryRow}>
        <StatCard label={t('pamm.totalInvested')} value={summary.total_invested} prefix="$" />
        <StatCard label={t('pamm.totalPnl')} value={summary.total_pnl} prefix="$"
          valueColor={summary.total_pnl >= 0 ? colors.success : colors.error} />
      </View>

      <TabBar tabs={TABS.map(tb => ({ ...tb, label: t(`pamm.${tb.key === 'allocations' ? 'myAllocations' : 'availableMasters'}`) }))} activeTab={tab} onTabPress={setTab} />

      {tab === 'allocations' ? (
        <FlatList
          data={allocations}
          keyExtractor={(i) => i.id || String(Math.random())}
          renderItem={renderAllocation}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          ListEmptyComponent={<EmptyState icon="wallet-outline" title={t('pamm.noAllocations')} />}
        />
      ) : (
        <FlatList
          data={masters}
          keyExtractor={(i) => i.id || String(Math.random())}
          renderItem={renderMaster}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          ListEmptyComponent={<EmptyState icon="people-outline" title={t('pamm.noMasters')} />}
        />
      )}

      {/* Invest Modal */}
      <Modal visible={!!investModal} transparent animationType="slide" onRequestClose={() => setInvestModal(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { backgroundColor: colors.bgCard }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>{t('pamm.investNow')}</Text>
              <TouchableOpacity onPress={() => setInvestModal(null)}><Ionicons name="close" size={24} color={colors.textMuted} /></TouchableOpacity>
            </View>
            {investModal && (
              <Text style={[s.modalSub, { color: colors.textSecondary }]}>
                {investModal.manager_name} · Min ${investModal.min_investment || 100} · Wallet ${walletBalance.toFixed(2)}
              </Text>
            )}
            <Text style={[s.inputLabel, { color: colors.textMuted }]}>Live Trading Account</Text>
            <View style={[s.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, padding: 0, marginBottom: 16 }]}>
              {accounts.length === 0 ? (
                <Text style={{ color: colors.error, padding: 14, fontSize: 13 }}>No live account — open one first</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 6 }}>
                  {accounts.map((a) => {
                    const active = accountId === a.id;
                    return (
                      <TouchableOpacity
                        key={a.id}
                        onPress={() => setAccountId(a.id)}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, margin: 4,
                          backgroundColor: active ? colors.primary : colors.bgPrimary,
                          borderWidth: 1, borderColor: active ? colors.primary : colors.border,
                        }}
                      >
                        <Text style={{ color: active ? '#fff' : colors.textPrimary, fontSize: 12, fontWeight: '600' }}>
                          {a.account_number || a.id.slice(0, 8)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
            <Text style={[s.inputLabel, { color: colors.textMuted }]}>{t('pamm.investAmount')}</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              value={amount} onChangeText={(t) => { if (t === '' || /^\d*\.?\d*$/.test(t)) setAmount(t); }}
              placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad"
            />
            {investModal && (investModal.master_type || '').toLowerCase() === 'mamm' && (
              <>
                <Text style={[s.inputLabel, { color: colors.textMuted }]}>Volume Scaling % (1–500)</Text>
                <TextInput
                  style={[s.input, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={scaling} onChangeText={(t) => { if (t === '' || /^\d{0,3}$/.test(t)) setScaling(t); }}
                  placeholder="100" placeholderTextColor={colors.textMuted} keyboardType="number-pad"
                />
              </>
            )}
            <TouchableOpacity
              style={[s.confirmBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
              onPress={handleInvest} disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('pamm.confirmInvest')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summaryRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginTop: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCol: { flex: 1 },
  statLabel: { fontSize: 10, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.3 },
  statVal: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  desc: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  investBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  withdrawBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalSub: { fontSize: 13, marginBottom: 20 },
  inputLabel: { fontSize: 12, fontWeight: '500', marginBottom: 6, textTransform: 'uppercase' },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 16, fontWeight: '600', marginBottom: 20 },
  confirmBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
