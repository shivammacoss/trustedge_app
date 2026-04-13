/**
 * Normalize TrustEdge / gateway responses for instruments and live prices.
 */

/** Map backend segment + symbol to Markets tab (UI uses Title Case names). */
export function normalizeInstrumentCategory(segment, symbol) {
  const s = (segment == null ? '' : String(segment)).toLowerCase().trim();
  const sym = (symbol == null ? '' : String(symbol)).toUpperCase();

  if (s === 'forex' || s === 'fx') return 'Forex';
  if (s === 'crypto') return 'Crypto';
  if (s === 'energies' || s === 'energy') return 'Commodities';
  if (s === 'commodities') {
    if (/^(XAU|XAG|XPT|XPD)/.test(sym)) return 'Metals';
    return 'Commodities';
  }
  if (s === 'metals' || s === 'metal') return 'Metals';
  if (s === 'indices') return 'Indices';
  if (s === 'stocks') return 'Stocks';

  const title = segment ? String(segment).replace(/^./, (c) => c.toUpperCase()) : 'Forex';
  if (['Forex', 'Metals', 'Commodities', 'Crypto', 'Indices', 'Stocks'].includes(title)) return title;
  return 'Forex';
}

export function extractInstrumentRows(payload) {
  if (payload == null) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.instruments)) return payload.instruments;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

export function extractPriceRows(payload) {
  if (payload == null) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.prices)) return payload.prices;
  if (Array.isArray(payload.ticks)) return payload.ticks;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

export function normalizePriceRow(row) {
  if (!row || typeof row !== 'object') return null;
  const rawSym = row.symbol || row.instrument || row.pair || row.name;
  if (rawSym == null || String(rawSym).trim() === '') return null;
  const symbol = String(rawSym).trim().toUpperCase();

  const bidRaw = row.bid ?? row.bid_price ?? row.b ?? row.last ?? row.close ?? row.mid;
  const askRaw = row.ask ?? row.ask_price ?? row.a ?? bidRaw;
  const bid = typeof bidRaw === 'number' ? bidRaw : parseFloat(bidRaw);
  const ask = typeof askRaw === 'number' ? askRaw : parseFloat(askRaw);

  if (!Number.isFinite(bid) && !Number.isFinite(ask)) {
    return { ...row, symbol, bid: 0, ask: 0, spread: 0 };
  }

  const bidN = Number.isFinite(bid) ? bid : Number.isFinite(ask) ? ask : 0;
  const askN = Number.isFinite(ask) ? ask : bidN;
  let spread = row.spread;
  if (spread != null && typeof spread !== 'number') spread = parseFloat(spread);
  if (!Number.isFinite(spread)) spread = Math.abs(askN - bidN);

  return { ...row, symbol, bid: bidN, ask: askN, spread };
}

export function rowsToPriceDict(rows) {
  const dict = {};
  for (const r of rows) {
    const n = normalizePriceRow(r);
    if (n?.symbol) dict[n.symbol] = n;
  }
  return dict;
}

/** Merge server message (array, single tick, or { prices }) into one dict */
export function messageToPriceDict(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return messageToPriceDict(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (typeof raw !== 'object') return {};

  const rows = extractPriceRows(raw);
  if (rows.length) return rowsToPriceDict(rows);

  if (raw.data != null) {
    const nested = messageToPriceDict(raw.data);
    if (Object.keys(nested).length) return nested;
  }
  if (raw.tick != null) {
    const nested = messageToPriceDict(raw.tick);
    if (Object.keys(nested).length) return nested;
  }
  if (raw.quote != null) {
    const nested = messageToPriceDict(raw.quote);
    if (Object.keys(nested).length) return nested;
  }

  const one = normalizePriceRow(raw);
  if (one?.symbol) return { [one.symbol]: one };
  return {};
}
