import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../config';
import { getJsonAuthHeaders } from '../utils/authHeaders';

export default function usePamm() {
  const [masters, setMasters] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [summary, setSummary] = useState({ total_invested: 0, total_current_value: 0, total_pnl: 0, overall_pnl_pct: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fetchMasters = useCallback(async () => {
    try {
      const headers = await getJsonAuthHeaders();
      const res = await fetch(`${API_URL}/social/mamm-pamm`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (mounted.current) setMasters(Array.isArray(data?.items) ? data.items : []);
    } catch (_) {}
  }, []);

  const fetchAllocations = useCallback(async () => {
    try {
      const headers = await getJsonAuthHeaders();
      const res = await fetch(`${API_URL}/social/my-allocations`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (!mounted.current) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      setAllocations(items);
      if (data?.summary) {
        setSummary({
          total_invested: Number(data.summary.total_invested || 0),
          total_current_value: Number(data.summary.total_current_value || 0),
          total_pnl: Number(data.summary.total_pnl || 0),
          overall_pnl_pct: Number(data.summary.overall_pnl_pct || 0),
        });
      }
    } catch (_) {}
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const headers = await getJsonAuthHeaders();
      const res = await fetch(`${API_URL}/accounts`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      if (mounted.current) setAccounts(items.filter((a) => !a.is_demo));
    } catch (_) {}
  }, []);

  const fetchWallet = useCallback(async () => {
    try {
      const headers = await getJsonAuthHeaders();
      const res = await fetch(`${API_URL}/wallet/summary`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (mounted.current) setWalletBalance(Number(data?.main_wallet_balance || 0));
    } catch (_) {}
  }, []);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchMasters(), fetchAllocations(), fetchAccounts(), fetchWallet()]);
    } catch (e) {
      if (mounted.current) setError(e?.message || 'Failed to load PAMM data');
    }
    if (mounted.current) { setLoading(false); setRefreshing(false); }
  }, [fetchMasters, fetchAllocations, fetchAccounts, fetchWallet]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const invest = useCallback(async (masterId, accountId, amount, volumeScalingPct) => {
    if (!accountId) throw new Error('Select a live trading account first');
    const headers = await getJsonAuthHeaders();
    const params = new URLSearchParams({ account_id: String(accountId), amount: String(amount) });
    if (volumeScalingPct != null) params.set('volume_scaling_pct', String(volumeScalingPct));
    const res = await fetch(`${API_URL}/social/mamm-pamm/${masterId}/invest?${params.toString()}`, {
      method: 'POST', headers, body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || data?.message || 'Investment failed');
    await Promise.all([fetchAllocations(), fetchWallet()]);
    return data;
  }, [fetchAllocations, fetchWallet]);

  const withdrawAllocation = useCallback(async (allocationId) => {
    const headers = await getJsonAuthHeaders();
    const res = await fetch(`${API_URL}/social/mamm-pamm/${allocationId}/withdraw`, {
      method: 'DELETE', headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || data?.message || 'Withdrawal failed');
    await Promise.all([fetchAllocations(), fetchWallet()]);
    return data;
  }, [fetchAllocations, fetchWallet]);

  return {
    masters, allocations, accounts, walletBalance, summary,
    loading, refreshing, error,
    refresh: () => loadAll(true), invest, withdrawAllocation,
  };
}
