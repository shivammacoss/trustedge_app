import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DEFAULT_MUTED = '#808080';
const DEFAULT_DOWN = '#EC5B5B';

function digitsFor(symbol, instDigits) {
  if (instDigits != null && Number(instDigits) >= 1) return Number(instDigits);
  if (['USDJPY', 'EURJPY', 'GBPJPY'].includes(symbol)) return 3;
  if (['XAUUSD', 'USOIL', 'BTCUSD', 'ETHUSD'].includes(symbol)) return 2;
  if (['US30', 'US500', 'NAS100'].includes(symbol)) return 1;
  return 5;
}

function formatTickTime(iso) {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const Mt5Price = memo(({ value, digits, color }) => {
  if (value == null || !Number.isFinite(value)) {
    return <Text style={[styles.priceFallback, { color }]}>—</Text>;
  }
  const s = value.toFixed(digits);
  const dot = s.indexOf('.');
  if (dot < 0) {
    return (
      <Text style={[styles.pricePlain, { color }]}>{s}</Text>
    );
  }
  const intp = s.slice(0, dot);
  const frac = s.slice(dot + 1).padEnd(digits, '0').slice(0, digits);
  if (frac.length < 3) {
    return (
      <Text style={[styles.pricePlain, { color }]}>
        {intp}.{frac}
      </Text>
    );
  }
  const pipette = frac.slice(-1);
  const bigPips = frac.slice(-3, -1);
  const smallFrac = frac.slice(0, -3);

  return (
    <View style={styles.priceRow}>
      <Text style={[styles.priceSmall, { color }]}>
        {intp}.{smallFrac}
      </Text>
      <Text style={[styles.priceBig, { color }]}>{bigPips}</Text>
      <Text style={[styles.priceSuper, { color }]}>{pipette}</Text>
    </View>
  );
});

const Mt5QuoteRow = memo(function Mt5QuoteRow({
  item,
  liveTick,
  session,
  flashBid,
  flashAsk,
  spreadPipsText,
  onPressRow,
  onToggleStar,
  onChart,
  isDark = true,
  accentColor = '#50A5F1',
  colors: themeColors,
}) {
  const sym = item.symbol;
  const digits = digitsFor(sym, item.digits);
  const bid = liveTick?.bid ?? item.bid ?? 0;
  const ask = liveTick?.ask ?? item.ask ?? 0;
  const ts = liveTick?.timestamp;

  const rowBg = themeColors?.bgCard ?? (isDark ? '#000000' : '#ffffff');
  const rowBorder = themeColors?.border ?? (isDark ? 'rgba(255,255,255,0.08)' : '#e8e8e8');
  const textPrimary = themeColors?.textPrimary ?? (isDark ? '#FFFFFF' : '#1a1a1a');
  const muted = themeColors?.textMuted ?? DEFAULT_MUTED;
  const up = accentColor;
  const down = DEFAULT_DOWN;

  const open = session?.open;
  let ptsStr = '—';
  let pctStr = '—%';
  let changePositive = false;
  let changeNegative = false;
  if (open != null && Number.isFinite(bid) && bid > 0 && open !== 0) {
    const pts = Math.round((bid - open) * 10 ** Math.min(digits, 5));
    const pct = ((bid - open) / open) * 100;
    ptsStr = `${pts > 0 ? '+' : ''}${pts}`;
    pctStr = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    changePositive = pts > 0;
    changeNegative = pts < 0;
  }

  const trendBid = flashBid === 'up' || flashBid === 'down' ? flashBid : 'neutral';
  const trendAsk = flashAsk === 'up' || flashAsk === 'down' ? flashAsk : 'neutral';
  const bidC = trendBid === 'up' ? up : trendBid === 'down' ? down : down;
  const askC = trendAsk === 'up' ? up : trendAsk === 'down' ? down : up;

  const low = session?.low;
  const high = session?.high;
  const rangeLine =
    low != null && high != null && Number.isFinite(bid) && bid > 0
      ? `L: ${low.toFixed(digits)}  H: ${high.toFixed(digits)}`
      : 'L: —  H: —';

  const chartBg = isDark ? 'rgba(80, 165, 241, 0.14)' : `${accentColor}22`;
  const chartBorder = isDark ? 'rgba(80, 165, 241, 0.4)' : `${accentColor}55`;

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: rowBg, borderBottomColor: rowBorder }]}
      onPress={onPressRow}
      activeOpacity={0.75}
    >
      <TouchableOpacity
        style={styles.starBtn}
        onPress={(e) => {
          e?.stopPropagation?.();
          onToggleStar();
        }}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      >
        <Ionicons
          name={item.starred ? 'star' : 'star-outline'}
          size={18}
          color={item.starred ? up : muted}
        />
      </TouchableOpacity>

      <View style={styles.leftCol}>
        <Text
          style={[
            styles.changeLine,
            changePositive && { color: up },
            changeNegative && { color: down },
            !changePositive && !changeNegative && { color: muted },
          ]}
        >
          {ptsStr} {pctStr}
        </Text>
        <Text style={[styles.symbol, { color: textPrimary }]}>{sym}</Text>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: muted }]}>{formatTickTime(ts)}</Text>
          <Ionicons name="time-outline" size={11} color={muted} style={{ marginLeft: 6 }} />
          <Text style={[styles.meta, { marginLeft: 6, color: muted }]}>{spreadPipsText}</Text>
        </View>
      </View>

      <View style={styles.rightCol}>
        <View style={styles.pricesRow}>
          <View style={styles.priceBlock}>
            <Mt5Price value={bid} digits={digits} color={bidC} />
            <Text style={[styles.bidAskLabel, { color: muted }]}>BID</Text>
          </View>
          <View style={[styles.priceBlock, { marginLeft: 14 }]}>
            <Mt5Price value={ask} digits={digits} color={askC} />
            <Text style={[styles.bidAskLabel, { color: muted }]}>ASK</Text>
          </View>
        </View>
        <Text style={[styles.rangeText, { color: muted }]} numberOfLines={1}>
          {rangeLine}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.chartBtnOuter}
        onPress={onChart}
        activeOpacity={0.75}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <View style={[styles.chartBtnInner, { backgroundColor: chartBg, borderColor: chartBorder }]}>
          <Ionicons name="bar-chart" size={19} color={up} />
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

export default Mt5QuoteRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  starBtn: {
    width: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },
  changeLine: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  symbol: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  meta: {
    fontSize: 10,
    fontFamily: 'monospace',
  },
  rightCol: {
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  pricesRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  priceBlock: {
    alignItems: 'flex-end',
  },
  bidAskLabel: {
    fontSize: 8,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  rangeText: {
    fontSize: 9,
    marginTop: 4,
    fontFamily: 'monospace',
    maxWidth: 200,
  },
  chartBtnOuter: {
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartBtnInner: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceSmall: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '600',
  },
  priceBig: {
    fontFamily: 'monospace',
    fontSize: 17,
    fontWeight: '900',
    marginHorizontal: 1,
  },
  priceSuper: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '800',
    marginTop: -6,
  },
  pricePlain: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
  },
  priceFallback: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
});
