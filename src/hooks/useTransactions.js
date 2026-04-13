import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../config';
import { getJsonAuthHeaders } from '../utils/authHeaders';

const PAGE_SIZE = 20;

function normalizeTransaction(raw) {
  return {
    id: raw.id || raw._id || String(Math.random()),
    type: raw.type || raw.transaction_type || 'other',
    amount: Number(raw.amount || 0),
    currency: raw.currency || 'USD',
    status: raw.status || 'completed',
    reference: raw.reference || raw.txn_ref || '',
    description: raw.description || raw.notes || '',
    created_at: raw.created_at || raw.createdAt || new Date().toISOString(),
  };
}

export default function useTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({ total_deposited: 0, total_withdrawn: 0 });

  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const headers = await getJsonAuthHeaders();
      const res = await fetch(`${API_URL}/wallet/summary`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (mounted.current) setSummary({
        total_deposited: Number(data.total_deposited || 0),
        total_withdrawn: Number(data.total_withdrawn || 0),
      });
    } catch (_) {}
  }, []);

  const fetchTransactions = useCallback(async (pageNum = 1, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const headers = await getJsonAuthHeaders();
      // Try to fetch from multiple possible endpoints
      const endpoints = [
        `${API_URL}/wallet/transactions?page=${pageNum}&limit=${PAGE_SIZE}`,
        `${API_URL}/wallet/deposits`,
        `${API_URL}/wallet/withdrawals`,
      ];

      let allItems = [];
      const results = await Promise.allSettled(
        endpoints.map(url => fetch(url, { headers }).then(r => r.ok ? r.json() : null))
      );

      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value) {
          const items = Array.isArray(r.value?.items ?? r.value) ? (r.value.items ?? r.value) : [];
          allItems = [...allItems, ...items.map(normalizeTransaction)];
        }
      });

      // Deduplicate by id
      const seen = new Set();
      allItems = allItems.filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });

      // Sort by date descending
      allItems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (mounted.current) {
        if (pageNum === 1) {
          setTransactions(allItems);
        } else {
          setTransactions(prev => [...prev, ...allItems]);
        }
        setHasMore(allItems.length >= PAGE_SIZE);
        setPage(pageNum);
      }
    } catch (e) {
      if (mounted.current) setError(e?.message || 'Failed to load transactions');
    }
    if (mounted.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchTransactions(1);
  }, [fetchSummary, fetchTransactions]);

  const filteredTransactions = useCallback(() => {
    let list = transactions;
    if (typeFilter !== 'all') {
      list = list.filter(t => t.type.toLowerCase().includes(typeFilter));
    }
    if (statusFilter !== 'all') {
      list = list.filter(t => t.status.toLowerCase() === statusFilter);
    }
    return list;
  }, [transactions, typeFilter, statusFilter]);

  return {
    transactions: filteredTransactions(),
    allTransactions: transactions,
    summary, loading, refreshing, loadingMore, error, hasMore,
    typeFilter, setTypeFilter,
    statusFilter, setStatusFilter,
    refresh: () => { fetchSummary(); fetchTransactions(1, true); },
    loadMore: () => { if (hasMore && !loadingMore) fetchTransactions(page + 1); },
  };
}
