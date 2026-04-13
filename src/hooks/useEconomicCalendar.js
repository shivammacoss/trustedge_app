import { useState, useEffect, useCallback, useRef } from 'react';

const CALENDAR_API = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

function toImpact(raw) {
  const v = String(raw || '').toLowerCase();
  if (v === 'high' || v === 'holiday') return 'high';
  if (v === 'medium') return 'medium';
  return 'low';
}

function parseEvent(raw) {
  return {
    id: `${raw.date}_${raw.title}`,
    title: raw.title || '',
    country: raw.country || '',
    currency: raw.country || '',
    date: raw.date ? new Date(raw.date) : new Date(),
    impact: toImpact(raw.impact),
    actual: raw.actual ?? null,
    forecast: raw.forecast ?? null,
    previous: raw.previous ?? null,
  };
}

export default function useEconomicCalendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [dayFilter, setDayFilter] = useState('today');
  const [impactFilter, setImpactFilter] = useState('all');
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fetchEvents = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await fetch(CALENDAR_API);
      const data = await res.json();
      if (mounted.current) {
        const parsed = (Array.isArray(data) ? data : []).map(parseEvent);
        setEvents(parsed);
      }
    } catch (e) {
      if (mounted.current) setError(e?.message || 'Failed to fetch calendar');
    }
    if (mounted.current) { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const filteredEvents = useCallback(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const endOfTomorrow = new Date(startOfTomorrow); endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);

    let filtered = events;

    if (dayFilter === 'today') {
      filtered = filtered.filter(e => e.date >= startOfToday && e.date < startOfTomorrow);
    } else if (dayFilter === 'tomorrow') {
      filtered = filtered.filter(e => e.date >= startOfTomorrow && e.date < endOfTomorrow);
    }
    // 'week' = show all

    if (impactFilter !== 'all') {
      filtered = filtered.filter(e => e.impact === impactFilter);
    }

    return filtered.sort((a, b) => a.date - b.date);
  }, [events, dayFilter, impactFilter]);

  return {
    events: filteredEvents(),
    loading, refreshing, error,
    dayFilter, setDayFilter,
    impactFilter, setImpactFilter,
    refresh: () => fetchEvents(true),
  };
}
