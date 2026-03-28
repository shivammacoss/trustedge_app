import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

const DashboardScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [marketWatchNews, setMarketWatchNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [accountData, setAccountData] = useState(null);
  const [portfolioData, setPortfolioData] = useState(null);
  const [userName, setUserName] = useState('');
  const refreshIntervalRef = useRef(null);

  useEffect(() => {
    loadUserData();
    fetchAccountData();
    fetchPortfolioSummary();
    fetchMarketWatchNews();
    
    refreshIntervalRef.current = setInterval(() => {
      fetchMarketWatchNews();
    }, 60000);
    
    // Refresh account data every 10s
    const accountInterval = setInterval(() => {
      fetchAccountData();
      fetchPortfolioSummary();
    }, 10000);
    
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      clearInterval(accountInterval);
    };
  }, []);

  const loadUserData = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (token) {
        const res = await fetch(`${API_URL}/profile`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUserName(data.first_name || data.email?.split('@')[0] || 'Trader');
        }
      }
    } catch (e) {
      const stored = await SecureStore.getItemAsync('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUserName(parsed.first_name || parsed.email?.split('@')[0] || 'Trader');
      }
    }
  };

  const fetchAccountData = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;
      const res = await fetch(`${API_URL}/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const accounts = data.items || data || [];
      if (accounts.length > 0) {
        // Sum up all accounts
        const totals = accounts.reduce((acc, a) => ({
          balance: acc.balance + (Number(a.balance) || 0),
          equity: acc.equity + (Number(a.equity) || 0),
          free_margin: acc.free_margin + (Number(a.free_margin) || 0),
          margin_used: acc.margin_used + (Number(a.margin_used) || 0),
          credit: acc.credit + (Number(a.credit) || 0),
        }), { balance: 0, equity: 0, free_margin: 0, margin_used: 0, credit: 0 });
        totals.count = accounts.length;
        setAccountData(totals);
      }
    } catch (e) {
      console.error('Error fetching accounts:', e);
    }
  };

  const fetchPortfolioSummary = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;
      const res = await fetch(`${API_URL}/portfolio/summary`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPortfolioData(data);
      }
    } catch (e) {
      console.error('Error fetching portfolio:', e);
    }
  };

  const fetchMarketWatchNews = async () => {
    try {
      // Try RSS feed directly (no /news endpoint in PTD2)
      const rssResponse = await fetch('https://feeds.content.dowjones.io/public/rss/mw_topstories');
      const rssText = await rssResponse.text();
      const items = parseRSSFeed(rssText);
      setMarketWatchNews(items);
    } catch (e) {
      console.error('Error fetching news:', e);
      setMarketWatchNews([
        { id: '1', title: 'Markets Update: Check back shortly for the latest news', source: 'MarketWatch', time: 'Just now', category: 'Markets', url: 'https://www.marketwatch.com' },
      ]);
    } finally {
      setLoadingNews(false);
    }
  };

  const parseRSSFeed = (xmlText) => {
    const items = [];
    const itemMatches = xmlText.match(/<item>([\s\S]*?)<\/item>/g) || [];
    
    itemMatches.slice(0, 20).forEach((item, index) => {
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      const categoryMatch = item.match(/<category>(.*?)<\/category>/);
      
      if (titleMatch) {
        items.push({
          id: `mw-${index}`,
          title: titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
          url: linkMatch ? linkMatch[1] : 'https://www.marketwatch.com',
          time: pubDateMatch ? formatTimeAgo(pubDateMatch[1]) : '',
          category: categoryMatch ? categoryMatch[1] : 'Markets',
          source: 'MarketWatch'
        });
      }
    });
    return items;
  };

  const formatTimeAgo = (datetime) => {
    if (!datetime) return '';
    const now = new Date();
    const date = new Date(datetime);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchAccountData(),
      fetchPortfolioSummary(),
      fetchMarketWatchNews(),
    ]);
    setRefreshing(false);
  };

  const openNewsUrl = (url) => {
    if (url) Linking.openURL(url);
  };

  const formatMoney = (val) => {
    const num = Number(val) || 0;
    return num >= 0 ? `$${num.toFixed(2)}` : `-$${Math.abs(num).toFixed(2)}`;
  };

  const quickActions = [
    { id: 'trade', icon: 'trending-up', label: 'Trade', screen: 'MainTrading', color: '#22c55e', desc: 'Open Chart' },
    { id: 'accounts', icon: 'wallet-outline', label: 'Accounts', screen: 'Accounts', color: '#2563EB', desc: 'Manage' },
    { id: 'wallet', icon: 'card-outline', label: 'Wallet', screen: 'Wallet', color: '#f59e0b', desc: 'Deposit/Withdraw' },
    { id: 'copy', icon: 'people-circle-outline', label: 'Social', screen: 'Social', color: '#8b5cf6', desc: 'Copy trading' },
    { id: 'ib', icon: 'briefcase-outline', label: 'Business', screen: 'Business', params: { initialTab: 'ib' }, color: '#ec4899', desc: 'Referral & IB' },
    { id: 'support', icon: 'chatbubbles-outline', label: 'Support', screen: 'Support', color: '#06b6d4', desc: 'Help' },
  ];

  const pnl = Number(portfolioData?.total_pnl || portfolioData?.unrealized_pnl || 0);
  const todayPnl = Number(portfolioData?.today_pnl || 0);

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Welcome Header */}
      <View style={styles.welcomeSection}>
        <View>
          <Text style={[styles.welcomeText, { color: colors.textMuted }]}>Welcome back,</Text>
          <Text style={[styles.userNameText, { color: colors.textPrimary }]}>{userName} 👋</Text>
        </View>
        <TouchableOpacity 
          style={[styles.notifBtn, { backgroundColor: colors.bgCard }]}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Account Overview Card */}
      {accountData && (
        <View style={styles.overviewCard}>
          <View style={styles.overviewGradient}>
            <View style={styles.overviewHeader}>
              <Text style={styles.overviewLabel}>Total Balance</Text>
              <View style={styles.accountCountBadge}>
                <Text style={styles.accountCountText}>{accountData.count} Account{accountData.count > 1 ? 's' : ''}</Text>
              </View>
            </View>
            <Text style={styles.overviewBalance}>{formatMoney(accountData.balance)}</Text>
            
            <View style={styles.overviewStatsRow}>
              <View style={styles.overviewStat}>
                <Text style={styles.overviewStatLabel}>Equity</Text>
                <Text style={[styles.overviewStatValue, { color: accountData.equity >= accountData.balance ? '#a7f3d0' : '#fca5a5' }]}>
                  {formatMoney(accountData.equity)}
                </Text>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewStat}>
                <Text style={styles.overviewStatLabel}>Free Margin</Text>
                <Text style={styles.overviewStatValue}>{formatMoney(accountData.free_margin)}</Text>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewStat}>
                <Text style={styles.overviewStatLabel}>P&L</Text>
                <Text style={[styles.overviewStatValue, { color: pnl >= 0 ? '#a7f3d0' : '#fca5a5' }]}>
                  {pnl >= 0 ? '+' : ''}{formatMoney(pnl)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Quick Stats */}
      <View style={styles.quickStatsRow}>
        <View style={[styles.quickStatCard, { backgroundColor: colors.bgCard }]}>
          <View style={[styles.quickStatIcon, { backgroundColor: '#22c55e20' }]}>
            <Ionicons name="trending-up" size={20} color="#22c55e" />
          </View>
          <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Open Trades</Text>
          <Text style={[styles.quickStatValue, { color: colors.textPrimary }]}>
            {portfolioData?.open_positions || 0}
          </Text>
        </View>
        <View style={[styles.quickStatCard, { backgroundColor: colors.bgCard }]}>
          <View style={[styles.quickStatIcon, { backgroundColor: '#2563EB20' }]}>
            <Ionicons name="time" size={20} color="#2563EB" />
          </View>
          <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Margin Used</Text>
          <Text style={[styles.quickStatValue, { color: colors.textPrimary }]}>
            {formatMoney(accountData?.margin_used || 0)}
          </Text>
        </View>
        <View style={[styles.quickStatCard, { backgroundColor: colors.bgCard }]}>
          <View style={[styles.quickStatIcon, { backgroundColor: todayPnl >= 0 ? '#22c55e20' : '#ef444420' }]}>
            <Ionicons name={todayPnl >= 0 ? 'arrow-up' : 'arrow-down'} size={20} color={todayPnl >= 0 ? '#22c55e' : '#ef4444'} />
          </View>
          <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Today</Text>
          <Text style={[styles.quickStatValue, { color: todayPnl >= 0 ? '#22c55e' : '#ef4444' }]}>
            {todayPnl >= 0 ? '+' : ''}{formatMoney(todayPnl)}
          </Text>
        </View>
      </View>

      {/* Quick Actions Grid */}
      <View style={styles.quickActionsSection}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          {quickActions.map(action => (
            <TouchableOpacity 
              key={action.id} 
              style={[styles.quickActionCard, { backgroundColor: colors.bgCard }]}
              onPress={() => navigation.navigate(action.screen, action.params)}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: action.color + '15' }]}>
                <Ionicons name={action.icon} size={24} color={action.color} />
              </View>
              <Text style={[styles.quickActionLabel, { color: colors.textPrimary }]}>{action.label}</Text>
              <Text style={[styles.quickActionDesc, { color: colors.textMuted }]}>{action.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* MarketWatch News */}
      <View style={styles.newsSection}>
        <View style={styles.newsSectionHeader}>
          <View style={styles.newsTitleRow}>
            <Ionicons name="newspaper-outline" size={20} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Market News</Text>
          </View>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        
        {loadingNews ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <View style={styles.newsContent}>
            {marketWatchNews.map((item, index) => (
              <TouchableOpacity 
                key={item.id || index} 
                style={[styles.newsItem, { backgroundColor: colors.bgCard }]}
                onPress={() => openNewsUrl(item.url)}
                activeOpacity={0.7}
              >
                <View style={styles.newsItemHeader}>
                  <View style={styles.newsCategory}>
                    <Text style={styles.newsCategoryText}>{item.category || 'Markets'}</Text>
                  </View>
                  <Text style={[styles.newsTime, { color: colors.textMuted }]}>{item.time}</Text>
                </View>
                <Text style={[styles.newsTitle, { color: colors.textPrimary }]} numberOfLines={3}>{item.title}</Text>
                <View style={styles.newsMeta}>
                  <View style={styles.sourceRow}>
                    <Ionicons name="globe-outline" size={12} color={colors.textMuted} />
                    <Text style={[styles.newsSource, { color: colors.textMuted }]}>{item.source}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  
  // Welcome
  welcomeSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 20 },
  welcomeText: { fontSize: 14, fontWeight: '500' },
  userNameText: { fontSize: 24, fontWeight: '800', marginTop: 2 },
  notifBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  
  // Overview Card
  overviewCard: { marginHorizontal: 16, marginBottom: 16, borderRadius: 20, overflow: 'hidden' },
  overviewGradient: { backgroundColor: '#111', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#1f1f1f' },
  overviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  overviewLabel: { color: '#999', fontSize: 13, fontWeight: '500' },
  accountCountBadge: { backgroundColor: '#ffffff10', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  accountCountText: { color: '#ccc', fontSize: 11, fontWeight: '600' },
  overviewBalance: { color: '#fff', fontSize: 32, fontWeight: '800', marginBottom: 16, letterSpacing: -0.5 },
  overviewStatsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overviewStat: { flex: 1, alignItems: 'center' },
  overviewStatLabel: { color: '#666', fontSize: 11, fontWeight: '500', marginBottom: 4 },
  overviewStatValue: { color: '#ddd', fontSize: 14, fontWeight: '700' },
  overviewDivider: { width: 1, height: 30, backgroundColor: '#333' },
  
  // Quick Stats
  quickStatsRow: { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 20 },
  quickStatCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  quickStatIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickStatLabel: { fontSize: 11, fontWeight: '500', marginBottom: 4 },
  quickStatValue: { fontSize: 14, fontWeight: '700' },
  
  // Quick Actions
  quickActionsSection: { marginHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickActionCard: { width: (width - 42) / 3, borderRadius: 14, padding: 14, alignItems: 'center' },
  quickActionIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickActionLabel: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  quickActionDesc: { fontSize: 10, fontWeight: '400' },
  
  // News
  newsSection: { flex: 1, marginTop: 4 },
  newsSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 12 },
  newsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ef444420', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444', marginRight: 4 },
  liveText: { color: '#ef4444', fontSize: 10, fontWeight: '700' },
  loadingContainer: { justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  newsContent: { marginHorizontal: 16 },
  newsItem: { borderRadius: 14, padding: 16, marginBottom: 10 },
  newsItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  newsCategory: { backgroundColor: '#2563EB20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  newsCategoryText: { color: '#2563EB', fontSize: 11, fontWeight: '600' },
  newsTitle: { fontSize: 15, fontWeight: '500', lineHeight: 22, marginBottom: 10 },
  newsMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  newsSource: { fontSize: 12 },
  newsTime: { fontSize: 11 },
});

export default DashboardScreen;
