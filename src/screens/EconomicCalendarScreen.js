import React from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import useEconomicCalendar from '../hooks/useEconomicCalendar';
import ScreenHeader from '../components/ui/ScreenHeader';
import TabBar from '../components/ui/TabBar';
import EmptyState from '../components/ui/EmptyState';

const IMPACT_COLORS = { high: '#EF4444', medium: '#F59E0B', low: '#6B7280' };
const IMPACT_ICONS = { high: 'flame', medium: 'flash', low: 'remove' };

function ImpactBadge({ impact, colors }) {
  const bg = IMPACT_COLORS[impact] || IMPACT_COLORS.low;
  return (
    <View style={[s.impactBadge, { backgroundColor: bg + '20' }]}>
      <Ionicons name={IMPACT_ICONS[impact] || 'remove'} size={10} color={bg} />
      <Text style={[s.impactText, { color: bg }]}>{impact.toUpperCase()}</Text>
    </View>
  );
}

function EventCard({ item, colors, t }) {
  const time = item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={s.cardTop}>
        <View style={s.cardTopLeft}>
          <Text style={[s.currency, { color: colors.primary }]}>{item.currency}</Text>
          <Text style={[s.time, { color: colors.textMuted }]}>{time}</Text>
        </View>
        <ImpactBadge impact={item.impact} colors={colors} />
      </View>
      <Text style={[s.eventTitle, { color: colors.textPrimary }]} numberOfLines={2}>{item.title}</Text>
      <View style={s.dataRow}>
        {[
          { label: t('news.actual'), value: item.actual },
          { label: t('news.forecast'), value: item.forecast },
          { label: t('news.previousVal'), value: item.previous },
        ].map(d => (
          <View key={d.label} style={s.dataCol}>
            <Text style={[s.dataLabel, { color: colors.textMuted }]}>{d.label}</Text>
            <Text style={[s.dataValue, { color: d.value != null ? colors.textPrimary : colors.textMuted }]}>
              {d.value ?? '—'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function EconomicCalendarScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const cal = useEconomicCalendar();

  const dayTabs = [
    { key: 'today', label: t('news.today') },
    { key: 'tomorrow', label: t('news.tomorrow') },
    { key: 'week', label: t('news.thisWeek') },
  ];

  const impactTabs = [
    { key: 'all', label: t('common.all') },
    { key: 'high', label: `🔴 ${t('news.high')}` },
    { key: 'medium', label: `🟡 ${t('news.medium')}` },
    { key: 'low', label: `⚪ ${t('news.low')}` },
  ];

  if (cal.loading) return (
    <View style={[s.center, { backgroundColor: colors.bgPrimary }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      <ScreenHeader title={t('news.title')} subtitle={t('news.subtitle')} onBack={() => navigation.goBack()} />
      <TabBar tabs={dayTabs} activeTab={cal.dayFilter} onTabPress={cal.setDayFilter} />
      <TabBar tabs={impactTabs} activeTab={cal.impactFilter} onTabPress={cal.setImpactFilter} scrollable />

      {/* Event count */}
      <View style={s.countRow}>
        <Text style={[s.countText, { color: colors.textSecondary }]}>
          {cal.events.length} {cal.events.length === 1 ? 'event' : 'events'}
        </Text>
      </View>

      <FlatList
        data={cal.events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EventCard item={item} colors={colors} t={t} />}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={cal.refreshing} onRefresh={cal.refresh} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState icon="calendar-outline" title={t('news.noEvents')} />}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  countRow: { paddingHorizontal: 16, paddingBottom: 4 },
  countText: { fontSize: 12, fontWeight: '500' },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currency: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  time: { fontSize: 12, fontWeight: '500' },
  eventTitle: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 10 },
  dataRow: { flexDirection: 'row', gap: 8 },
  dataCol: { flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10, alignItems: 'center' },
  dataLabel: { fontSize: 10, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  dataValue: { fontSize: 14, fontWeight: '700' },
  impactBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  impactText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});
