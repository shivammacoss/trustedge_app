import { useState, useCallback, useMemo } from 'react';

const STANDARD_LOT = 100000;

export default function useRiskCalculator() {
  const [instrument, setInstrument] = useState('EURUSD');
  const [lotSize, setLotSize] = useState('0.01');
  const [leverage, setLeverage] = useState('100');
  const [direction, setDirection] = useState('buy');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [accountCurrency, setAccountCurrency] = useState('USD');
  const [riskAmount, setRiskAmount] = useState('');
  const [stopLossPips, setStopLossPips] = useState('');
  const [swapLong, setSwapLong] = useState('-0.5');
  const [swapShort, setSwapShort] = useState('-0.3');

  const pipValue = useMemo(() => {
    const lot = parseFloat(lotSize) || 0.01;
    // Standard pip value for most USD pairs
    return lot * STANDARD_LOT * 0.0001;
  }, [lotSize]);

  const calcMargin = useCallback(() => {
    const lot = parseFloat(lotSize) || 0;
    const lev = parseFloat(leverage) || 1;
    const price = parseFloat(entryPrice) || 1;
    const notional = lot * STANDARD_LOT * price;
    return notional / lev;
  }, [lotSize, leverage, entryPrice]);

  const calcPnl = useCallback(() => {
    const entry = parseFloat(entryPrice) || 0;
    const exit = parseFloat(exitPrice) || 0;
    const lot = parseFloat(lotSize) || 0;
    if (!entry || !exit) return 0;
    const diff = direction === 'buy' ? exit - entry : entry - exit;
    return diff * lot * STANDARD_LOT;
  }, [entryPrice, exitPrice, lotSize, direction]);

  const calcLotSize = useCallback(() => {
    const risk = parseFloat(riskAmount) || 0;
    const slPips = parseFloat(stopLossPips) || 0;
    if (!risk || !slPips) return 0;
    const pipVal = STANDARD_LOT * 0.0001; // per 1 lot
    return risk / (slPips * pipVal);
  }, [riskAmount, stopLossPips]);

  const calcSwap = useCallback(() => {
    const lot = parseFloat(lotSize) || 0;
    const longRate = parseFloat(swapLong) || 0;
    const shortRate = parseFloat(swapShort) || 0;
    return {
      longDaily: lot * longRate,
      shortDaily: lot * shortRate,
    };
  }, [lotSize, swapLong, swapShort]);

  return {
    instrument, setInstrument,
    lotSize, setLotSize,
    leverage, setLeverage,
    direction, setDirection,
    entryPrice, setEntryPrice,
    exitPrice, setExitPrice,
    accountCurrency, setAccountCurrency,
    riskAmount, setRiskAmount,
    stopLossPips, setStopLossPips,
    swapLong, setSwapLong,
    swapShort, setSwapShort,
    pipValue,
    calcMargin, calcPnl, calcLotSize, calcSwap,
  };
}
