import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import useRiskCalculator from '../hooks/useRiskCalculator';
import ScreenHeader from '../components/ui/ScreenHeader';
import TabBar from '../components/ui/TabBar';

const CALC_TABS = [
  { key: 'margin', icon: 'shield-outline' },
  { key: 'pnl', icon: 'trending-up-outline' },
  { key: 'lotsize', icon: 'resize-outline' },
  { key: 'swap', icon: 'swap-horizontal-outline' },
];

function InputRow({ label, value, onChangeText, placeholder, colors, keyboardType = 'decimal-pad' }) {
  return (
    <View style={s.inputRow}>
      <Text style={[s.inputLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        style={[s.input, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.border }]}
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={colors.textMuted} keyboardType={keyboardType}
      />
    </View>
  );
}

function ResultBox({ label, value, valueColor, colors }) {
  return (
    <View style={[s.resultBox, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
      <Text style={[s.resultLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[s.resultValue, { color: valueColor || colors.primary }]}>{value}</Text>
    </View>
  );
}

function DirectionToggle({ direction, setDirection, colors, t }) {
  return (
    <View style={s.dirRow}>
      <Text style={[s.inputLabel, { color: colors.textMuted }]}>{t('riskCalc.direction')}</Text>
      <View style={s.dirBtns}>
        {['buy', 'sell'].map(d => (
          <TouchableOpacity key={d}
            style={[s.dirBtn, direction === d && { backgroundColor: d === 'buy' ? colors.success : colors.error }]}
            onPress={() => setDirection(d)}
          >
            <Text style={{ color: direction === d ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
              {d === 'buy' ? t('riskCalc.buy') : t('riskCalc.sell')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function RiskCalculatorScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const calc = useRiskCalculator();
  const [activeTab, setActiveTab] = useState('margin');

  const tabs = CALC_TABS.map(tb => ({ key: tb.key, label: t(`riskCalc.${tb.key}Calc`) }));

  const marginResult = useMemo(() => calc.calcMargin(), [calc.calcMargin]);
  const pnlResult = useMemo(() => calc.calcPnl(), [calc.calcPnl]);
  const lotResult = useMemo(() => calc.calcLotSize(), [calc.calcLotSize]);
  const swapResult = useMemo(() => calc.calcSwap(), [calc.calcSwap]);

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      <ScreenHeader title={t('riskCalc.title')} subtitle={t('riskCalc.subtitle')} onBack={() => navigation.goBack()} />
      <TabBar tabs={tabs} activeTab={activeTab} onTabPress={setActiveTab} scrollable />

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Instrument display */}
        <View style={[s.instrumentBar, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Ionicons name="bar-chart-outline" size={18} color={colors.primary} />
          <Text style={[s.instrumentText, { color: colors.textPrimary }]}>{calc.instrument}</Text>
        </View>

        {activeTab === 'margin' && (
          <>
            <InputRow label={t('riskCalc.entryPrice')} value={calc.entryPrice} onChangeText={calc.setEntryPrice} placeholder="1.08500" colors={colors} />
            <InputRow label={t('riskCalc.lotSize')} value={calc.lotSize} onChangeText={calc.setLotSize} placeholder="0.01" colors={colors} />
            <InputRow label={t('riskCalc.leverage')} value={calc.leverage} onChangeText={calc.setLeverage} placeholder="100" colors={colors} />
            <DirectionToggle direction={calc.direction} setDirection={calc.setDirection} colors={colors} t={t} />
            <ResultBox label={t('riskCalc.requiredMargin')} value={`$${marginResult.toFixed(2)}`} colors={colors} />
          </>
        )}

        {activeTab === 'pnl' && (
          <>
            <InputRow label={t('riskCalc.entryPrice')} value={calc.entryPrice} onChangeText={calc.setEntryPrice} placeholder="1.08500" colors={colors} />
            <InputRow label={t('riskCalc.exitPrice')} value={calc.exitPrice} onChangeText={calc.setExitPrice} placeholder="1.09000" colors={colors} />
            <InputRow label={t('riskCalc.lotSize')} value={calc.lotSize} onChangeText={calc.setLotSize} placeholder="0.01" colors={colors} />
            <DirectionToggle direction={calc.direction} setDirection={calc.setDirection} colors={colors} t={t} />
            <ResultBox label={t('riskCalc.profitLoss')} value={`${pnlResult >= 0 ? '+' : ''}$${pnlResult.toFixed(2)}`}
              valueColor={pnlResult >= 0 ? colors.success : colors.error} colors={colors} />
          </>
        )}

        {activeTab === 'lotsize' && (
          <>
            <InputRow label={t('riskCalc.riskAmount')} value={calc.riskAmount} onChangeText={calc.setRiskAmount} placeholder="100" colors={colors} />
            <InputRow label={t('riskCalc.stopLossPips')} value={calc.stopLossPips} onChangeText={calc.setStopLossPips} placeholder="20" colors={colors} />
            <ResultBox label={t('riskCalc.recommendedLot')} value={lotResult.toFixed(2)} colors={colors} />
          </>
        )}

        {activeTab === 'swap' && (
          <>
            <InputRow label={t('riskCalc.lotSize')} value={calc.lotSize} onChangeText={calc.setLotSize} placeholder="0.01" colors={colors} />
            <InputRow label={t('riskCalc.swapLong')} value={calc.swapLong} onChangeText={calc.setSwapLong} placeholder="-0.5" colors={colors} />
            <InputRow label={t('riskCalc.swapShort')} value={calc.swapShort} onChangeText={calc.setSwapShort} placeholder="-0.3" colors={colors} />
            <View style={s.swapResults}>
              <ResultBox label={`${t('riskCalc.swapLong')} / ${t('riskCalc.dailyCost')}`}
                value={`$${swapResult.longDaily.toFixed(2)}`}
                valueColor={swapResult.longDaily >= 0 ? colors.success : colors.error} colors={colors} />
              <ResultBox label={`${t('riskCalc.swapShort')} / ${t('riskCalc.dailyCost')}`}
                value={`$${swapResult.shortDaily.toFixed(2)}`}
                valueColor={swapResult.shortDaily >= 0 ? colors.success : colors.error} colors={colors} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 100 },
  instrumentBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  instrumentText: { fontSize: 15, fontWeight: '700' },
  inputRow: { marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 16, fontWeight: '600' },
  dirRow: { marginBottom: 20 },
  dirBtns: { flexDirection: 'row', gap: 10, marginTop: 6 },
  dirBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  resultBox: { borderRadius: 14, borderWidth: 1, padding: 20, alignItems: 'center', marginTop: 8 },
  resultLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  resultValue: { fontSize: 28, fontWeight: '800' },
  swapResults: { gap: 10, marginTop: 8 },
});
