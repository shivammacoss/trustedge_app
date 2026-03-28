import { InteractionManager } from 'react-native';

/**
 * Performance Optimization Utilities for ProTrader App
 * Makes the app smooth like Flipkart and Instagram
 */

// Debounce function to prevent excessive re-renders
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Throttle function for scroll events
export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// Run expensive operations after interactions complete
export const runAfterInteractions = (callback) => {
  InteractionManager.runAfterInteractions(() => {
    callback();
  });
};

// Delay heavy operations to improve perceived performance
export const delayedExecution = (callback, delay = 0) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = callback();
      resolve(result);
    }, delay);
  });
};

// Batch state updates to reduce re-renders
export const batchUpdates = (updates) => {
  requestAnimationFrame(() => {
    updates.forEach(update => update());
  });
};

// FlatList optimization configuration
export const FLATLIST_OPTIMIZATIONS = {
  removeClippedSubviews: true,
  maxToRenderPerBatch: 10,
  windowSize: 5,
  initialNumToRender: 10,
  updateCellsBatchingPeriod: 50,
  getItemLayout: (data, index, itemHeight = 80) => ({
    length: itemHeight,
    offset: itemHeight * index,
    index,
  }),
};

// Image optimization settings
export const IMAGE_CACHE_CONFIG = {
  maxAge: 7 * 24 * 60 * 60, // 7 days
  maxSize: 50 * 1024 * 1024, // 50 MB
};

// Memoization helper for expensive calculations
export const memoize = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
};

// Clear memoization cache when needed
export const clearMemoCache = (memoizedFn) => {
  if (memoizedFn.cache) {
    memoizedFn.cache.clear();
  }
};

// Performance monitoring
export const measurePerformance = (name, fn) => {
  const start = Date.now();
  const result = fn();
  const end = Date.now();
  console.log(`[Performance] ${name} took ${end - start}ms`);
  return result;
};

// Async performance monitoring
export const measurePerformanceAsync = async (name, fn) => {
  const start = Date.now();
  const result = await fn();
  const end = Date.now();
  console.log(`[Performance] ${name} took ${end - start}ms`);
  return result;
};

// Optimize array operations
export const optimizedFilter = (array, predicate) => {
  const result = [];
  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i], i, array)) {
      result.push(array[i]);
    }
  }
  return result;
};

// Optimize map operations
export const optimizedMap = (array, mapper) => {
  const result = new Array(array.length);
  for (let i = 0; i < array.length; i++) {
    result[i] = mapper(array[i], i, array);
  }
  return result;
};

// Check if objects are equal (shallow comparison)
export const shallowEqual = (obj1, obj2) => {
  if (obj1 === obj2) return true;
  if (!obj1 || !obj2) return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (let key of keys1) {
    if (obj1[key] !== obj2[key]) return false;
  }
  
  return true;
};

// Optimize re-renders by comparing props
export const shouldComponentUpdate = (prevProps, nextProps) => {
  return !shallowEqual(prevProps, nextProps);
};

// Lazy load components
export const lazyLoadComponent = (importFunc) => {
  return React.lazy(importFunc);
};

// Preload data for smoother navigation
export const preloadData = async (dataFetchers) => {
  const promises = dataFetchers.map(fetcher => fetcher());
  return Promise.all(promises);
};

export default {
  debounce,
  throttle,
  runAfterInteractions,
  delayedExecution,
  batchUpdates,
  FLATLIST_OPTIMIZATIONS,
  IMAGE_CACHE_CONFIG,
  memoize,
  clearMemoCache,
  measurePerformance,
  measurePerformanceAsync,
  optimizedFilter,
  optimizedMap,
  shallowEqual,
  shouldComponentUpdate,
  lazyLoadComponent,
  preloadData,
};
