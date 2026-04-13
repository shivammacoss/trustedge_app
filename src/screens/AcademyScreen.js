import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import useAcademy from '../hooks/useAcademy';
import ScreenHeader from '../components/ui/ScreenHeader';

const PHASE_COLORS = ['#2196f3','#2196f3','#2196f3','#14b8a6','#f59e0b','#3b82f6','#a855f7','#eab308'];
const PHASE_ICONS = ['◆','●','◉','■','◆','▲','◇','★'];

function ProgressBar({ pct, color, height = 6 }) {
  return (
    <View style={[s.progressBg, { height }]}>
      <View style={[s.progressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color, height }]} />
    </View>
  );
}

export default function AcademyScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const academy = useAcademy();
  const [quizModal, setQuizModal] = useState(null); // { phaseIndex, questionIndex, answers }
  const [moduleModal, setModuleModal] = useState(null); // phaseIndex

  // Quiz logic
  const startQuiz = useCallback((phaseIndex) => {
    setQuizModal({ phaseIndex, questionIndex: 0, answers: [], score: null });
  }, []);

  const answerQuiz = useCallback((optionIndex) => {
    setQuizModal(prev => {
      if (!prev || prev.score !== null) return prev;
      const phase = academy.phases[prev.phaseIndex];
      const quiz = phase.quiz || [];
      const q = quiz[prev.questionIndex];
      const isCorrect = q && optionIndex === q.correct;
      const newAnswers = [...prev.answers, { questionId: q?.id, selected: optionIndex, correct: isCorrect }];
      if (prev.questionIndex + 1 >= quiz.length) {
        const score = Math.round((newAnswers.filter(a => a.correct).length / quiz.length) * 100);
        academy.completeQuiz(phase.id, score);
        return { ...prev, answers: newAnswers, score };
      }
      return { ...prev, questionIndex: prev.questionIndex + 1, answers: newAnswers };
    });
  }, [academy]);

  const renderPhaseCard = ({ item: phase, index }) => {
    const color = phase.color || PHASE_COLORS[index] || '#2196f3';
    const icon = PHASE_ICONS[index] || '◆';
    const unlocked = academy.isPhaseUnlocked(index);
    const prog = academy.phaseProgress(index);
    const quizScore = academy.completedQuizzes[phase.id];

    return (
      <TouchableOpacity
        style={[s.phaseCard, { backgroundColor: colors.bgCard, borderColor: unlocked ? color + '40' : colors.border }]}
        onPress={() => unlocked && setModuleModal(index)}
        activeOpacity={unlocked ? 0.7 : 1}
      >
        <View style={s.phaseRow}>
          <View style={[s.phaseIcon, { backgroundColor: color + '15' }]}>
            <Text style={{ fontSize: 18, color }}>{icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.phaseTitleRow}>
              <Text style={[s.phaseNum, { color }]}>PHASE {phase.num}</Text>
              <Text style={[s.phaseDur, { color: colors.textMuted }]}>{phase.duration}</Text>
              {!unlocked && (
                <View style={[s.lockedBadge, { backgroundColor: colors.bgSecondary }]}>
                  <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                  <Text style={[s.lockedText, { color: colors.textMuted }]}>{t('academy.locked')}</Text>
                </View>
              )}
            </View>
            <Text style={[s.phaseTitle, { color: colors.textPrimary }]}>{phase.title}</Text>
            <Text style={[s.phaseSub, { color: colors.textSecondary }]}>{phase.subtitle}</Text>
          </View>
          <View style={s.phaseRight}>
            <Text style={[s.phaseCount, { color: colors.textMuted }]}>{prog.done}/{prog.total}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </View>
        <ProgressBar pct={prog.pct} color={color} />
        {quizScore != null && (
          <View style={[s.quizBadge, { backgroundColor: quizScore >= 60 ? colors.success + '15' : colors.error + '15' }]}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: quizScore >= 60 ? colors.success : colors.error }}>
              Quiz: {quizScore}%
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Module list modal
  const currentPhase = moduleModal != null ? academy.phases[moduleModal] : null;
  const currentProg = moduleModal != null ? academy.phaseProgress(moduleModal) : null;

  // Quiz modal
  const quizPhase = quizModal ? academy.phases[quizModal.phaseIndex] : null;
  const quizQuestions = quizPhase?.quiz || [];
  const currentQuestion = quizModal && quizModal.score === null ? quizQuestions[quizModal.questionIndex] : null;

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      <ScreenHeader title={t('academy.title')} subtitle={t('academy.subtitle')} onBack={() => navigation.goBack()} />

      {/* Overall stats */}
      <View style={s.statsBar}>
        {[
          { val: academy.phases.length, label: t('academy.phases') },
          { val: academy.totalModules, label: t('academy.modules') },
          { val: academy.totalCompleted, label: t('academy.completed') },
          { val: `${academy.progressPct}%`, label: t('academy.progress') },
        ].map(st => (
          <View key={st.label} style={s.statItem}>
            <Text style={[s.statVal, { color: colors.textPrimary }]}>{st.val}</Text>
            <Text style={[s.statLbl, { color: colors.textMuted }]}>{st.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <ProgressBar pct={academy.progressPct} color={colors.primary} height={8} />
      </View>

      <FlatList
        data={academy.phases}
        keyExtractor={p => String(p.id)}
        renderItem={renderPhaseCard}
        contentContainerStyle={s.list}
      />

      {/* Module detail modal */}
      <Modal visible={moduleModal != null} transparent animationType="slide" onRequestClose={() => setModuleModal(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { backgroundColor: colors.bgCard }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>{currentPhase?.title}</Text>
              <TouchableOpacity onPress={() => setModuleModal(null)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {currentPhase?.modules.map((mod, i) => {
                const done = academy.completedModules[mod.id];
                return (
                  <TouchableOpacity
                    key={mod.id}
                    style={[s.moduleRow, { borderBottomColor: colors.border }]}
                    onPress={() => { academy.completeModule(mod.id); }}
                  >
                    <View style={[s.moduleCheck, { borderColor: done ? colors.success : colors.border, backgroundColor: done ? colors.success : 'transparent' }]}>
                      {done && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.modTitle, { color: colors.textPrimary }]}>{mod.title}</Text>
                      <Text style={[s.modMeta, { color: colors.textMuted }]}>{mod.topics} topics · {mod.minutes} min</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {/* Quiz button */}
              {currentPhase?.quiz?.length > 0 && currentProg?.done === currentProg?.total && (
                <TouchableOpacity
                  style={[s.quizBtn, { backgroundColor: colors.primary }]}
                  onPress={() => { setModuleModal(null); startQuiz(moduleModal); }}
                >
                  <Ionicons name="school-outline" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('academy.beginQuiz')}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Quiz modal */}
      <Modal visible={!!quizModal} transparent animationType="fade" onRequestClose={() => setQuizModal(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { backgroundColor: colors.bgCard }]}>
            {quizModal?.score !== null && quizModal?.score !== undefined ? (
              // Results
              <View style={s.quizResults}>
                <View style={[s.scoreCircle, { borderColor: quizModal.score >= 60 ? colors.success : colors.error }]}>
                  <Text style={[s.scoreText, { color: quizModal.score >= 60 ? colors.success : colors.error }]}>
                    {quizModal.score}%
                  </Text>
                </View>
                <Text style={[s.modalTitle, { color: colors.textPrimary, textAlign: 'center', marginTop: 16 }]}>
                  {t('academy.quizComplete')}
                </Text>
                <Text style={[s.quizMsg, { color: colors.textSecondary }]}>
                  {quizModal.score >= 60 ? t('academy.passMessage') : t('academy.failMessage')}
                </Text>
                <View style={s.quizActions}>
                  {quizModal.score < 60 && (
                    <TouchableOpacity style={[s.quizActionBtn, { backgroundColor: colors.primary }]}
                      onPress={() => startQuiz(quizModal.phaseIndex)}>
                      <Text style={{ color: '#fff', fontWeight: '600' }}>{t('academy.retakeQuiz')}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[s.quizActionBtn, { backgroundColor: colors.bgSecondary }]}
                    onPress={() => setQuizModal(null)}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{t('common.close')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : currentQuestion ? (
              // Question
              <View>
                <Text style={[s.qCounter, { color: colors.textMuted }]}>
                  {t('academy.questionOf', { current: quizModal.questionIndex + 1, total: quizQuestions.length })}
                </Text>
                <Text style={[s.qText, { color: colors.textPrimary }]}>{currentQuestion.question}</Text>
                {currentQuestion.options.map((opt, i) => (
                  <TouchableOpacity key={i}
                    style={[s.optionBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
                    onPress={() => answerQuiz(i)}
                  >
                    <View style={[s.optCircle, { borderColor: colors.primary }]}>
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>{String.fromCharCode(65 + i)}</Text>
                    </View>
                    <Text style={[s.optText, { color: colors.textPrimary }]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  statsBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, paddingHorizontal: 16 },
  statItem: { alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '800' },
  statLbl: { fontSize: 10, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  progressBg: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' },
  progressFill: { borderRadius: 10 },
  phaseCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginTop: 12 },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  phaseIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  phaseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 },
  phaseNum: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  phaseDur: { fontSize: 10 },
  lockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  lockedText: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase' },
  phaseTitle: { fontSize: 16, fontWeight: '700' },
  phaseSub: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  phaseRight: { alignItems: 'center', gap: 4 },
  phaseCount: { fontSize: 13, fontWeight: '600' },
  quizBadge: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  moduleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  moduleCheck: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  modTitle: { fontSize: 14, fontWeight: '600' },
  modMeta: { fontSize: 11, marginTop: 2 },
  quizBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, paddingVertical: 14, borderRadius: 12 },
  quizResults: { alignItems: 'center', paddingVertical: 20 },
  scoreCircle: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, justifyContent: 'center', alignItems: 'center' },
  scoreText: { fontSize: 32, fontWeight: '800' },
  quizMsg: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  quizActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  quizActionBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  qCounter: { fontSize: 12, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  qText: { fontSize: 16, fontWeight: '600', lineHeight: 24, marginBottom: 20 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  optCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  optText: { fontSize: 14, fontWeight: '500', flex: 1 },
});
