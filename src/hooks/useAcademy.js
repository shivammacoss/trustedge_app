import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { phases, TOTAL_MODULES } from '../data/academyData';

const STORAGE_KEY = 'academy_progress';

export default function useAcademy() {
  // completedModules: { '1.1': true, '2.3': true, ... }
  // completedQuizzes: { 1: score, 2: score, ... }
  const [completedModules, setCompletedModules] = useState({});
  const [completedQuizzes, setCompletedQuizzes] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setCompletedModules(parsed.modules || {});
          setCompletedQuizzes(parsed.quizzes || {});
        }
      } catch (_) {}
      setReady(true);
    })();
  }, []);

  const persist = useCallback(async (mods, quizzes) => {
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify({ modules: mods, quizzes }));
    } catch (_) {}
  }, []);

  const completeModule = useCallback((moduleId) => {
    setCompletedModules(prev => {
      const next = { ...prev, [moduleId]: true };
      persist(next, completedQuizzes);
      return next;
    });
  }, [completedQuizzes, persist]);

  const completeQuiz = useCallback((phaseId, score) => {
    setCompletedQuizzes(prev => {
      const next = { ...prev, [phaseId]: score };
      persist(completedModules, next);
      return next;
    });
  }, [completedModules, persist]);

  const resetProgress = useCallback(async () => {
    setCompletedModules({});
    setCompletedQuizzes({});
    try { await SecureStore.deleteItemAsync(STORAGE_KEY); } catch (_) {}
  }, []);

  const totalCompleted = Object.keys(completedModules).length;
  const progressPct = TOTAL_MODULES > 0 ? Math.round((totalCompleted / TOTAL_MODULES) * 100) : 0;

  const isPhaseUnlocked = useCallback((phaseIndex) => {
    if (phaseIndex === 0) return true;
    // Previous phase must have all modules done + quiz passed
    const prevPhase = phases[phaseIndex - 1];
    if (!prevPhase) return false;
    const allModsDone = prevPhase.modules.every(m => completedModules[m.id]);
    const quizPassed = (completedQuizzes[prevPhase.id] || 0) >= 60;
    return allModsDone && quizPassed;
  }, [completedModules, completedQuizzes]);

  const phaseProgress = useCallback((phaseIndex) => {
    const phase = phases[phaseIndex];
    if (!phase) return { done: 0, total: 0, pct: 0 };
    const total = phase.modules.length;
    const done = phase.modules.filter(m => completedModules[m.id]).length;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [completedModules]);

  return {
    phases, ready,
    completedModules, completedQuizzes,
    totalCompleted, totalModules: TOTAL_MODULES, progressPct,
    completeModule, completeQuiz, resetProgress,
    isPhaseUnlocked, phaseProgress,
  };
}
