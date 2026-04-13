import React from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import useTransactions from '../hooks/useTransactions';
import ScreenHeader from '../components/ui/ScreenHeader';
import TabBar from '../components/ui/TabBar';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';

const TYPE_CONFIG = {
  deposit:    { icon: 'arrow-down-circle', color: '#22C55E', label: 'Deposit' },
  withdrawal: { icon: 'arrow-up-circle',   color: '#EF4444', label: 'Withdrawal' },
  transfer:   { icon: 'swap-horizontal',   color: '#3B82F6', label: 'Transfer' },
  trading:    { icon: 'trending-up',       color: '#8B5CF6', label: 'Trading' },
  commission: { icon: 'cash-outline',      color: '#F59E0B', label: 'Commission' },
  adjustment: { icon: 'create-outline',    color: '#6B7280', label: 'Adjustment' },
};

const STATUS_COLORS = {
  completed: '#22C55E', pending: '#F59E0B', failed: '#EF4444', processing: '#3B82F6',
};

function TransactionCard({ item, colors }) {
  const cfg = TYPE_CONFIG[item.type.toLowerCase()] || TYPE_CONFIG.adjustment;
  const statusColor = STATUS_COLORS[item.status.toLowerCase()] || '#6B7280';
  const isPositive = item.amount > 0 && (item.type === 'deposit' || item.type === 'commission');
  const dateStr = new Date(item.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={s.cardRow}>
        <View style={[s.iconWrap, { backgroundColor: cfg.color + '15' }]}>
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{cfg.label}</Text>
          <Text style={[s.cardDate, { color: colors.textMuted }]}>{dateStr} · {timeStr}</Text>
          {item.reference ? <Text style={[s.ref, { color: colors.textMuted }]}>Ref: {item.reference}</Text> : null}
        </View>
        <View style={s.amountCol}>
          <Text style={[s.amount, { color: isPositive ? colors.success : colors.error }]}>
            {isPositive ? '+' : '-'}${Math.abs(item.amount).toFixed(2)}
          </Text>
          <View style={[s.statusBadge, { backgroundColor: statusColor + '15' }]}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function TransactionHistoryScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const txns = useTransactions();

  const typeTabs = [
    { key: 'all', label: t('common.all') },
    { key: 'deposit', label: t('transactions.deposits') },
    { key: 'withdrawal', label: t('transactions.withdrawals') },
    { key: 'transfer', label: t('transactions.transfers') },
    { key: 'trading', label: t('transactions.trading') },
    { key: 'commission', label: t('transactions.commissions') },
  ];

  if (txns.loading) return (
    <View style={[s.center, { backgroundColor: colors.bgPrimary }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      <ScreenHeader title={t('transactions.title')} subtitle={t('transactions.subtitle')} onBack={() => navigation.goBack()} />

      {/* Summary */}
      <View style={s.summaryRow}>
        <StatCard label={t('transactions.totalDeposited')} value={txns.summary.total_deposited} prefix="$" valueColor={colors.success} />
        <StatCard label={t('transactions.totalWithdrawn')} value={txns.summary.total_withdrawn} prefix="$" valueColor={colors.error} />
      </View>

      <TabBar tabs={typeTabs} activeTab={txns.typeFilter} onTabPress={txns.setTypeFilter} scrollable />

      {/* Status filter */}
      <TabBar
        tabs={[
          { key: 'all', label: t('common.all') },
          { key: 'completed', label: t('transactions.completed') },
          { key: 'pending', label: t('transactions.pending') },
          { key: 'failed', label: t('transactions.failed') },
        ]}
        activeTab={txns.statusFilter}
        onTabPress={txns.setStatusFilter}
        scrollable
      />

      <FlatList
        data={txns.transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TransactionCard item={item} colors={colors} />}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={txns.refreshing} onRefresh={txns.refresh} tintColor={colors.primary} />}
        onEndReached={txns.loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={<EmptyState icon="receipt-outline" title={t('transactions.noTransactions')} />}
        ListFooterComponent={txns.loadingMore ? <ActivityIndicator style={{ paddingVertical: 20 }} color={colors.primary} /> : null}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summaryRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardDate: { fontSize: 11, marginTop: 2 },
  ref: { fontSize: 10, marginTop: 2 },
  amountCol: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 16, fontWeight: '800' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
});
