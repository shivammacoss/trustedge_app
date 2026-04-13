import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

export default function EmptyState({ icon = 'file-tray-outline', title, subtitle }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: colors.bgSecondary }]}>
        <Ionicons name={icon} size={36} color={colors.textMuted} />
      </View>
      <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>
      {subtitle ? <Text style={[styles.sub, { color: colors.textMuted }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  sub: { fontSize: 13, marginTop: 4, textAlign: 'center', maxWidth: 260 },
});
