import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';
import { useTheme } from '../context/ThemeContext';

const TIMEFRAMES = [
  { label: '1M', period: '1m' },
  { label: '3M', period: '3m' },
  { label: '6M', period: '6m' },
  { label: '1Y', period: '1y' },
  { label: 'All', period: 'all' },
];

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'history', label: 'History' },
];

async function authHeaders() {
  const token = await SecureStore.getItemAsync('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function EquityMiniChart({ curve, colors }) {
  if (!curve || curve.length === 0) {
    return (
      <View style={[styles.chartEmpty, { borderColor: colors.border }]}>
        <Text style={[styles.chartEmptyText, { color: colors.textMuted }]}>No closed trades in this period</Text>
      </View>
    );
  }
  const maxPoints = 48;
  let pts = curve;
  if (pts.length > maxPoints) {
    const step = Math.ceil(pts.length / maxPoints);
    pts = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  }
  const equities = pts.map((p) => Number(p.equity) || 0);
  const minE = Math.min(...equities);
  const maxE = Math.max(...equities);
  const range = maxE - minE || 1;
  const lastUp = equities.length >= 2 && equities[equities.length - 1] >= equities[0];
  const barColor = lastUp ? colors.profitColor : colors.lossColor;

  return (
    <View style={styles.sparklineRow}>
      {equities.map((eq, i) => {
        const h = 4 + ((eq - minE) / range) * 32;
        return (
          <View
            key={i}
            style={[styles.sparklineBar, { height: Math.max(4, h), backgroundColor: barColor, opacity: 0.65 + (i / equities.length) * 0.35 }]}
          />
        );
      })}
    </View>
  );
}

export default function PortfolioScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('overview');
  const [tf, setTf] = useState('1M');
  const [summary, setSummary] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [trades, setTrades] = useState([]);
  const [histPage, setHistPage] = useState(1);
  const [histPages, setHistPages] = useState(1);
  const [histLoading, setHistLoading] = useState(false);
  const firstLoadRef = useRef(true);

  const period = TIMEFRAMES.find((t) => t.label === tf)?.period || '1m';

  const loadMain = useCallback(async () => {
    try {
      setError(null);
      if (firstLoadRef.current) setLoading(true);
      const h = await authHeaders();
      const [sRes, pRes] = await Promise.all([
        fetch(`${API_URL}/portfolio/summary`, { headers: h }),
        fetch(`${API_URL}/portfolio/performance?period=${encodeURIComponent(period)}`, { headers: h }),
      ]);
      if (!sRes.ok) {
        const err = await sRes.json().catch(() => ({}));
        throw new Error(err.detail || err.message || `Summary ${sRes.status}`);
      }
      if (!pRes.ok) {
        const err = await pRes.json().catch(() => ({}));
        throw new Error(err.detail || err.message || `Performance ${pRes.status}`);
      }
      const sData = await sRes.json();
      const pData = await pRes.json();
      setSummary(sData);
      setPerformance(pData);
    } catch (e) {
      setError(e.message || 'Failed to load portfolio');
    } finally {
      setLoading(false);
      firstLoadRef.current = false;
    }
  }, [period]);

  const loadTrades = useCallback(async (page) => {
    setHistLoading(true);
    try {
      const h = await authHeaders();
      const res = await fetch(
        `${API_URL}/portfolio/trades?page=${page}&per_page=40`,
        { headers: h }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load trades');
      const items = data.items || [];
      setTrades((prev) => (page === 1 ? items : [...prev, ...items]));
      setHistPages(data.pages || 1);
      setHistPage(page);
    } catch (e) {
      setError(e.message);
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMain();
  }, [loadMain]);

  useEffect(() => {
    if (tab === 'history') {
      setTrades([]);
      loadTrades(1);
    }
  }, [tab, loadTrades]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMain();
    if (tab === 'history') await loadTrades(1);
    setRefreshing(false);
  };

  const stats = performance?.stats;
  const holdings = Array.isArray(summary?.holdings) ? summary.holdings : [];
  const equityCurve = performance?.equity_curve || [];
  const monthly = performance?.monthly_breakdown || [];
  const symbols = performance?.symbol_breakdown || [];

  const unrealPct =
    summary && summary.total_balance
      ? ((summary.total_unrealized_pnl || 0) / (summary.total_balance || 1)) * 100
      : 0;

  const renderStatCard = (label, value, subValue, trendUp) => (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: isDark ? colors.bgSecondary : colors.bgHover,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
      {subValue ? (
        <Text
          style={[
            styles.statSub,
            { color: trendUp ? colors.profitColor : colors.lossColor },
          ]}
          numberOfLines={1}
        >
          {subValue}
        </Text>
      ) : null}
    </View>
  );

  if (loading && !summary) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading portfolio…</Text>
      </View>
    );
  }

  if (error && !summary) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary, paddingTop: insets.top, paddingHorizontal: 24 }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={[styles.errText, { color: colors.textSecondary }]}>{error}</Text>
        <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => { setLoading(true); loadMain(); }}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.primary }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backHit} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Portfolio</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.tabChip,
                tab === t.id && { borderBottomColor: colors.primary, borderBottomWidth: 3 },
                { borderColor: colors.border },
              ]}
              onPress={() => setTab(t.id)}
            >
              <Text
                style={[
                  styles.tabChipText,
                  { color: colors.textMuted },
                  tab === t.id && { color: colors.primary, fontWeight: '700' },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'overview' && (
          <>
            <View style={styles.statGrid}>
              {renderStatCard(
                'Total balance',
                fmtMoney(summary?.total_balance ?? 0),
                `${unrealPct >= 0 ? '+' : ''}${unrealPct.toFixed(2)}% unrealized`,
                (summary?.total_unrealized_pnl ?? 0) >= 0
              )}
              {renderStatCard(
                'Total P&L',
                (() => {
                  const at = summary?.pnl_breakdown?.all_time ?? 0;
                  return `${at >= 0 ? '+' : ''}${fmtMoney(at)}`;
                })(),
                'All-time closed',
                (summary?.pnl_breakdown?.all_time ?? 0) >= 0
              )}
              {renderStatCard(
                'Win rate',
                stats ? `${Number(stats.win_rate).toFixed(1)}%` : '—',
                stats ? `${stats.total_trades} trades` : null,
                stats && stats.win_rate >= 50
              )}
              {renderStatCard(
                'Sharpe',
                stats ? Number(stats.sharpe_ratio).toFixed(2) : '—',
                stats ? `Return ${fmtMoney(stats.total_return || 0)}` : null,
                (stats?.total_return ?? 0) >= 0
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={styles.cardHead}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Holdings</Text>
                <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                  {summary?.open_positions_count ?? 0} open positions
                </Text>
              </View>
              {holdings.length === 0 ? (
                <Text style={[styles.emptyLine, { color: colors.textMuted }]}>No open positions</Text>
              ) : (
                holdings.map((h, idx) => (
                  <View
                    key={`${h.symbol}-${idx}`}
                    style={[styles.holdingRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.holdingSym, { color: colors.textPrimary }]}>{h.symbol}</Text>
                      <Text style={[styles.holdingSub, { color: colors.textMuted }]}>
                        {Number(h.total_lots ?? h.lots ?? 0).toFixed(2)} lots · avg {Number(h.avg_open_price ?? h.entry_price ?? 0).toFixed(5)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.holdingPrice, { color: colors.accent }]}>
                        {Number(h.current_price ?? 0).toFixed(5)}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: (h.unrealized_pnl ?? h.pnl ?? 0) >= 0 ? colors.profitColor : colors.lossColor,
                        }}
                      >
                        {(h.unrealized_pnl ?? h.pnl ?? 0) >= 0 ? '+' : ''}
                        {fmtMoney(h.unrealized_pnl ?? h.pnl ?? 0)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 10 }]}>P&amp;L breakdown</Text>
              {['today', 'this_week', 'this_month', 'all_time'].map((k) => {
                const label = k === 'this_week' ? 'This week' : k === 'this_month' ? 'This month' : k === 'all_time' ? 'All time' : 'Today';
                const v = summary?.pnl_breakdown?.[k] ?? 0;
                return (
                  <View key={k} style={[styles.pnlRow, { borderBottomColor: colors.border }]}>
                    <Text style={{ color: colors.textSecondary }}>{label}</Text>
                    <Text style={{ fontWeight: '600', color: v >= 0 ? colors.profitColor : colors.lossColor }}>
                      {v >= 0 ? '+' : ''}
                      {fmtMoney(v)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {tab === 'performance' && (
          <>
            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={styles.cardHead}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Equity curve</Text>
                <View style={styles.tfRow}>
                  {TIMEFRAMES.map((t) => (
                    <TouchableOpacity
                      key={t.label}
                      onPress={() => setTf(t.label)}
                      style={[
                        styles.tfBtn,
                        { borderColor: colors.border, backgroundColor: isDark ? colors.bgSecondary : colors.bgHover },
                        tf === t.label && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tfBtnText,
                          { color: colors.textMuted },
                          tf === t.label && { color: '#fff', fontWeight: '700' },
                        ]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <EquityMiniChart curve={equityCurve} colors={colors} />
              {stats ? (
                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Max DD</Text>
                    <Text style={[styles.metricVal, { color: colors.lossColor }]}>{fmtMoney(stats.max_drawdown)}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Return %</Text>
                    <Text style={[styles.metricVal, { color: (stats.total_return_pct ?? 0) >= 0 ? colors.profitColor : colors.lossColor }]}>
                      {(stats.total_return_pct ?? 0) >= 0 ? '+' : ''}
                      {Number(stats.total_return_pct).toFixed(2)}%
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            {monthly.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 10 }]}>Monthly</Text>
                {monthly.slice(-8).map((m) => (
                  <View key={m.month} style={[styles.pnlRow, { borderBottomColor: colors.border }]}>
                    <Text style={{ color: colors.textSecondary }}>{m.month}</Text>
                    <Text style={{ fontWeight: '600', color: (m.profit ?? 0) >= 0 ? colors.profitColor : colors.lossColor }}>
                      {(m.profit ?? 0) >= 0 ? '+' : ''}
                      {fmtMoney(m.profit)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {symbols.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 10 }]}>By symbol</Text>
                {symbols.slice(0, 12).map((s) => (
                  <View key={s.symbol} style={[styles.symBreakRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{s.symbol}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                        {s.trades} trades{typeof s.win_rate === 'number' ? ` · ${s.win_rate}% WR` : ''}
                      </Text>
                    </View>
                    <Text style={{ fontWeight: '700', color: (s.profit ?? 0) >= 0 ? colors.profitColor : colors.lossColor }}>
                      {(s.profit ?? 0) >= 0 ? '+' : ''}
                      {fmtMoney(s.profit)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {tab === 'history' && (
          <View style={{ paddingHorizontal: 16 }}>
            {histLoading && trades.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            ) : trades.length === 0 ? (
              <Text style={[styles.emptyLine, { color: colors.textMuted, textAlign: 'center', marginTop: 32 }]}>No trades</Text>
            ) : (
              <>
                <FlatList
                  data={trades}
                  keyExtractor={(item) => String(item.id)}
                  scrollEnabled={false}
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  initialNumToRender={10}
                  updateCellsBatchingPeriod={50}
                  renderItem={({ item }) => {
                    const pnl = item.pnl ?? item.profit ?? 0;
                    const side = (item.side || '').toUpperCase();
                    return (
                      <View style={[styles.histRow, { borderBottomColor: colors.border, backgroundColor: colors.bgCard }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.holdingSym, { color: colors.textPrimary }]}>{item.symbol}</Text>
                          <Text style={[styles.holdingSub, { color: colors.textMuted }]}>
                            {side} · {Number(item.lots ?? 0).toFixed(2)} · {item.close_time || item.closed_at || '—'}
                          </Text>
                        </View>
                        <Text style={{ fontWeight: '700', color: pnl >= 0 ? colors.profitColor : colors.lossColor }}>
                          {pnl >= 0 ? '+' : ''}
                          {fmtMoney(pnl)}
                        </Text>
                      </View>
                    );
                  }}
                />
                {histPage < histPages && (
                  <TouchableOpacity
                    style={[styles.loadMore, { borderColor: colors.primary }]}
                    onPress={() => loadTrades(histPage + 1)}
                    disabled={histLoading}
                  >
                    {histLoading ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={{ color: colors.primary, fontWeight: '600' }}>Load more</Text>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backHit: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  scroll: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  errText: { textAlign: 'center', marginTop: 12, marginBottom: 16 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  tabRow: { flexDirection: 'row', marginHorizontal: 12, marginTop: 12, gap: 8 },
  tabChip: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabChipText: { fontSize: 13 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginTop: 14, gap: 10 },
  statCard: {
    width: '47%',
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statLabel: { fontSize: 11, fontWeight: '600', marginBottom: 6 },
  statValue: { fontSize: 16, fontWeight: '700' },
  statSub: { fontSize: 11, marginTop: 4 },
  card: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHead: { marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardMeta: { fontSize: 12, marginTop: 4 },
  emptyLine: { fontSize: 14, paddingVertical: 12 },
  holdingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  holdingSym: { fontSize: 15, fontWeight: '700' },
  holdingSub: { fontSize: 12, marginTop: 4 },
  holdingPrice: { fontSize: 13, fontWeight: '600' },
  pnlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  symBreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tfRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tfBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  tfBtnText: { fontSize: 11, fontWeight: '600' },
  sparklineRow: { flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 2, marginTop: 8 },
  sparklineBar: { flex: 1, borderRadius: 2, minWidth: 3 },
  chartEmpty: {
    height: 80,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  chartEmptyText: { fontSize: 13 },
  metricsRow: { flexDirection: 'row', marginTop: 16, gap: 16 },
  metric: { flex: 1 },
  metricLabel: { fontSize: 12, marginBottom: 4 },
  metricVal: { fontSize: 15, fontWeight: '700' },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderBottomWidth: 0,
  },
  loadMore: {
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
});
