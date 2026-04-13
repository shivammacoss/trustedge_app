import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../config';
import { getJsonAuthHeaders } from '../utils/authHeaders';

export default function usePamm() {
  const [masters, setMasters] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [summary, setSummary] = useState({ total_invested: 0, total_current_value: 0, total_pnl: 0, overall_pnl_pct: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fetchMasters = useCallback(async () => {
    try {
      const headers = await getJsonAuthHeaders();
      const res = await fetch(`${API_URL}/pamm/masters`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (mounted.current) setMasters(Array.isArray(data?.items ?? data) ? (data.items ?? data) : []);
    } catch (_) {}
  }, []);

  const fetchAllocations = useCallback(async () => {
    try {
      const headers = await getJsonAuthHeaders();
      const res = await fetch(`${API_URL}/pamm/my-allocations`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (!mounted.current) return;
      const items = Array.isArray(data?.items ?? data) ? (data.items ?? data) : [];
      setAllocations(items);
      const totalInv = items.reduce((s, a) => s + Number(a.allocation_amount || 0), 0);
      const totalVal = items.reduce((s, a) => s + Number(a.current_value || a.allocation_amount || 0), 0);
      const totalPnl = items.reduce((s, a) => s + Number(a.total_pnl || 0), 0);
      setSummary({
        total_invested: totalInv,
        total_current_value: totalVal,
        total_pnl: totalPnl,
        overall_pnl_pct: totalInv > 0 ? (totalPnl / totalInv) * 100 : 0,
      });
    } catch (_) {}
  }, []);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchMasters(), fetchAllocations()]);
    } catch (e) {
      if (mounted.current) setError(e?.message || 'Failed to load PAMM data');
    }
    if (mounted.current) { setLoading(false); setRefreshing(false); }
  }, [fetchMasters, fetchAllocations]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const invest = useCallback(async (masterId, amount) => {
    const headers = await getJsonAuthHeaders();
    const res = await fetch(`${API_URL}/pamm/invest`, {
      method: 'POST', headers, body: JSON.stringify({ master_id: masterId, amount }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || 'Investment failed');
    await fetchAllocations();
    return data;
  }, [fetchAllocations]);

  const withdrawAllocation = useCallback(async (allocationId) => {
    const headers = await getJsonAuthHeaders();
    const res = await fetch(`${API_URL}/pamm/withdraw`, {
      method: 'POST', headers, body: JSON.stringify({ allocation_id: allocationId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || 'Withdrawal failed');
    await fetchAllocations();
    return data;
  }, [fetchAllocations]);

  return {
    masters, allocations, summary, loading, refreshing, error,
    refresh: () => loadAll(true), invest, withdrawAllocation,
  };
}
