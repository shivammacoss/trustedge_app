import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export default function TabBar({ tabs, activeTab, onTabPress, scrollable = false }) {
  const { colors } = useTheme();

  const content = tabs.map((tab) => {
    const active = tab.key === activeTab;
    return (
      <TouchableOpacity
        key={tab.key}
        onPress={() => onTabPress(tab.key)}
        style={[
          styles.tab,
          active && { backgroundColor: colors.primary, borderColor: colors.primary },
          !active && { backgroundColor: colors.bgSecondary, borderColor: colors.border },
        ]}
        activeOpacity={0.7}
      >
        <Text style={[styles.tabText, { color: active ? '#fff' : colors.textSecondary }]}>
          {tab.label}
        </Text>
      </TouchableOpacity>
    );
  });

  if (scrollable) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
        {content}
      </ScrollView>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  tabText: { fontSize: 13, fontWeight: '600' },
});
