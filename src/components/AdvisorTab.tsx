/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  Activity, 
  ShieldCheck, 
  TrendingUp, 
  AlertTriangle,
  Info,
  Loader2
} from 'lucide-react';
import Markdown from 'react-markdown';
import { DashboardData } from '../types.js';
import { formatCurrency, retryFetch } from '../utils.js';
import GlassCard from './GlassCard.js';

interface AdvisorTabProps {
  id?: string;
  data: DashboardData | null;
  advice: string;
  loadingAdvice: boolean;
  onRefreshAdvice: () => void;
  currentMonth?: number;
  currentYear?: number;
}

export default function AdvisorTab({ id, data, advice, loadingAdvice, onRefreshAdvice, currentMonth, currentYear }: AdvisorTabProps) {
  if (!data) {
    return (
      <div id={id} className="h-96 animate-pulse rounded-2xl bg-slate-900 border border-slate-800" />
    );
  }

  const [reserveMode, setReserveMode] = useState<'recommended' | 'manual'>(() => {
    try { return (localStorage.getItem('mf.reserve.mode') as 'recommended' | 'manual') || 'recommended'; } catch { return 'recommended'; }
  });
  const [currentSaved, setCurrentSaved] = useState<string>(() => {
    try { const v = localStorage.getItem('mf.reserve.current'); return v && parseFloat(v) > 0 ? v : ''; } catch { return ''; }
  });
  const [monthlySaving, setMonthlySaving] = useState<string>(() => {
    try { const v = localStorage.getItem('mf.reserve.monthly'); return v && parseFloat(v) > 0 ? v : ''; } catch { return ''; }
  });
  const [manualTarget, setManualTarget] = useState<string>(() => {
    try { const v = localStorage.getItem('mf.reserve.target'); return v && parseFloat(v) > 0 ? v : ''; } catch { return ''; }
  });

  const { summary, debts } = data;
  const income = summary.receita_total || 1;
  const expense = summary.despesa_total || 0;
  const fixed = summary.despesa_fixa || 0;
  const net = summary.saldo;

  // 1. Calculate Health Score
  // Saving Rate: (income - expense) / income (Ideal: > 20% = +40pts)
  const savingRate = Math.max(0, (net / income) * 100);
  let savingScore = Math.min(40, (savingRate / 20) * 40);

  // Fixed Committing Rate: fixed / income (Ideal: < 50%. Lower is better. If < 50% = +40pts, else decr)
  const fixedRate = (fixed / income) * 100;
  let fixedScore = 40;
  if (fixedRate > 50) {
    fixedScore = Math.max(0, 40 - (fixedRate - 50) * 0.8);
  }

  // Debt Ratio: total_estimated_debts / income (Ideal: < 100%. If 0 = +20pts)
  const debtRatio = (debts.total_estimated / income) * 100;
  let debtScore = Math.max(0, 20 - (debtRatio / 10));

  // Overdue impact
  let overduePenalty = summary.overdue_count * 15;

  const rawScore = savingScore + fixedScore + debtScore - overduePenalty;
  const healthScore = Math.round(Math.max(10, Math.min(100, rawScore)));

  const currentSavedNum = parseFloat(currentSaved) || 0;
  const monthlySavingNum = parseFloat(monthlySaving) || 0;
  const manualTargetNum = parseFloat(manualTarget) || 0;

  useEffect(() => {
    try {
      localStorage.setItem('mf.reserve.mode', reserveMode);
      localStorage.setItem('mf.reserve.current', currentSavedNum ? String(currentSavedNum) : '0');
      localStorage.setItem('mf.reserve.monthly', monthlySavingNum ? String(monthlySavingNum) : '0');
      localStorage.setItem('mf.reserve.target', manualTargetNum ? String(manualTargetNum) : '0');
    } catch { /* ignore */ }
  }, [reserveMode, currentSaved, monthlySaving, manualTarget]);

  // Reserve AI analysis (considers Objetivos tab)
  const [reserveAdvice, setReserveAdvice] = useState<string>('');
  const [loadingReserve, setLoadingReserve] = useState(false);

  const handleAnalyzeReserve = async () => {
    setLoadingReserve(true);
    try {
      const params = new URLSearchParams({
        currentSaved: currentSaved || '0',
        monthlySaving: monthlySaving || '0',
        manual: reserveMode === 'manual' ? 'true' : 'false',
      });
      if (reserveMode === 'manual' && manualTargetNum > 0) params.set('target', manualTarget || '0');
      if (currentMonth) params.set('month', String(currentMonth));
      if (currentYear) params.set('year', String(currentYear));
      const res = await retryFetch(`/api/reserve/analysis?${params.toString()}`);
      if (res.ok) {
        const payload = await res.json();
        setReserveAdvice(typeof payload.advice === 'string' ? payload.advice : '');
      }
    } catch (err) {
      console.error('Erro ao analisar reserva:', err);
    } finally {
      setLoadingReserve(false);
    }
  };

  // 2. Emergency Reserve calculations (6 months of monthly fixed expenses)
  const recommendedReserve = fixed * 6 || 15000; // fallback if fixed is 0
  const reserveTarget = reserveMode === 'manual' && manualTargetNum > 0 ? manualTargetNum : recommendedReserve;
  const reserveRemaining = Math.max(0, reserveTarget - currentSavedNum);
  const reserveProgress = Math.round(Math.min(100, (currentSavedNum / reserveTarget) * 100));
  const monthsToComplete = monthlySavingNum > 0 ? Math.ceil(reserveRemaining / monthlySavingNum) : null;

  return (
    <div id={id} className="space-y-6 text-slate-100">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left column: Diagnostics & Reserve */}
        <div className="lg:col-span-5 space-y-6">
          {/* Health Score */}
          <GlassCard className="relative overflow-hidden">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2">
              <Activity className="h-4 w-4 text-indigo-400" />
              <span>Score de Saúde Financeira</span>
            </h4>

            <div className="flex flex-col items-center justify-center py-6">
              <div className="relative flex items-center justify-center h-32 w-32 rounded-full border-4 border-slate-800 bg-slate-950/40 shadow-inner">
                {/* Score text */}
                <div className="text-center">
                  <span className="text-4xl font-extrabold font-sans text-slate-50">{healthScore}</span>
                  <span className="text-slate-500 font-semibold block text-[10px] uppercase tracking-wide mt-0.5">Pontos</span>
                </div>
              </div>

              {/* Status labels */}
              <div className="mt-5 text-center">
                <span className={`inline-block rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wider border ${
                  healthScore >= 80 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : healthScore >= 55 
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}>
                  {healthScore >= 80 ? 'Excelente' : healthScore >= 55 ? 'Regular' : 'Crítico'}
                </span>
                <p className="text-slate-400 text-xs mt-2.5 max-w-xs mx-auto leading-relaxed">
                  {healthScore >= 80 && 'Sua saúde financeira está excelente! Baixo comprometimento de renda fixa e excelente taxa de poupança.'}
                  {healthScore >= 55 && healthScore < 80 && 'Suas finanças estão estáveis, mas tome cuidado com o teto de custos de parcelamentos e contas.'}
                  {healthScore < 55 && 'Atenção urgente! Suas contas fixas estão tomando muito de sua renda ou existem boletos vencidos pendentes.'}
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Emergency Reserve */}
          <GlassCard>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              <span>Reserva de Emergência</span>
            </h4>

            <div className="space-y-4">
              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setReserveMode('recommended')}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    reserveMode === 'recommended'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Alvo Recomendado
                </button>
                <button
                  onClick={() => setReserveMode('manual')}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    reserveMode === 'manual'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Alvo Manual
                </button>
              </div>

              {reserveMode === 'manual' && (
                <div>
                  <label className="block text-xxs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Alvo da Reserva (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualTarget}
                    onChange={e => setManualTarget(e.target.value)}
                    className="w-full rounded-lg bg-slate-950/40 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                    placeholder="Ex: 30000"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xxs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Valor em Mãos (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={currentSaved}
                    onChange={e => setCurrentSaved(e.target.value)}
                    className="w-full rounded-lg bg-slate-950/40 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="block text-xxs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Guarda por Mês (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={monthlySaving}
                    onChange={e => setMonthlySaving(e.target.value)}
                    className="w-full rounded-lg bg-slate-950/40 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {reserveMode === 'manual' ? 'Alvo (manual):' : 'Alvo Recomendado (6m):'}
                  <span className="ml-1 font-semibold font-mono text-slate-200">{formatCurrency(reserveTarget)}</span>
                </span>
                <span>
                  Faltam: <span className="font-semibold font-mono text-slate-200">{formatCurrency(reserveRemaining)}</span>
                </span>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between text-xxs font-semibold uppercase text-slate-500 mb-1.5">
                  <span>Progresso da Reserva</span>
                  <span className="font-bold text-slate-300">{reserveProgress}%</span>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-850 overflow-hidden border border-slate-800/50">
                  <div 
                    style={{ width: `${reserveProgress}%` }}
                    className="h-full rounded-full bg-indigo-500 shadow-md shadow-indigo-500/20"
                  />
                </div>
              </div>

              {monthsToComplete !== null && (
                <p className="text-xxs font-semibold text-slate-500">
                  Tempo estimado para concluir: <span className="text-indigo-400">{monthsToComplete} {monthsToComplete === 1 ? 'mês' : 'meses'}</span>
                </p>
              )}

              <div className="rounded-xl bg-slate-950/30 p-3.5 border border-slate-850/80 text-xs text-slate-400 leading-relaxed flex items-start space-x-2.5">
                <Info className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  Sua reserva garante estabilidade para despesas fixas. Mantenha os aportes mensais em investimentos de alta liquidez e baixo risco (ex: Tesouro Selic ou CDB 100% CDI).
                </span>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Right column: AI recommendations markdown panel */}
        <div className="lg:col-span-7">
          <GlassCard className="h-full flex flex-col justify-between min-h-[500px]">
            <div>
              <div className="flex items-center justify-between border-b border-slate-850 pb-4 mb-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-200 flex items-center space-x-2">
                    <Sparkles className="h-5 w-5 text-indigo-400" />
                    <span>Recomendações Inteligentes IA</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">Conselhos personalizados gerados com inteligência baseada em seus saldos</p>
                </div>
                <button
                  onClick={onRefreshAdvice}
                  disabled={loadingAdvice}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50"
                  title="Atualizar Conselhos"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingAdvice ? 'animate-spin text-indigo-400' : ''}`} />
                </button>
              </div>

              {/* Advice markdown text container */}
              <div className="text-left text-sm text-slate-300 overflow-y-auto max-h-[55vh] pr-2 scrollbar-thin">
                {loadingAdvice ? (
                  <div className="py-24 text-center text-slate-500 space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-500" />
                    <p className="text-sm">A IA do My Financer está analisando seu fluxo mensal...</p>
                    <p className="text-xxs text-slate-600">Calculando indicadores, metas e traçando recomendações</p>
                  </div>
                ) : advice ? (
                  <div className="markdown-body prose prose-invert max-w-none text-slate-350 leading-relaxed space-y-4">
                    <Markdown>{advice}</Markdown>
                  </div>
                ) : (
                  <div className="py-24 text-center text-slate-500">
                    <Sparkles className="h-10 w-10 text-indigo-500/40 mx-auto mb-3" />
                    <span>Nenhum conselho disponível. Clique em recarregar para gerar insights!</span>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-850 pt-3 flex items-center justify-between text-xxs font-semibold tracking-wider text-slate-500 bg-slate-950/25 -mx-6 -mb-6 px-6 py-3">
              <span>Modelo Utilizado: Gemini 3.5 Flash (12h Cache)</span>
              <span>100% Offline & Seguro</span>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Reserve AI Analysis (crosses with Objetivos) */}
      <GlassCard className="mt-6">
        <div className="flex items-center justify-between border-b border-slate-850 pb-4 mb-4">
          <div>
            <h4 className="text-base font-semibold text-slate-200 flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-indigo-400" />
              <span>Análise Inteligente da Reserva</span>
            </h4>
            <p className="text-xs text-slate-400 mt-1">A IA cruza sua reserva com os objetivos da aba "Objetivos"</p>
          </div>
          <button
            onClick={handleAnalyzeReserve}
            disabled={loadingReserve}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 flex items-center space-x-2"
          >
            <Sparkles className={`h-4 w-4 ${loadingReserve ? 'animate-pulse' : ''}`} />
            <span>Analisar com IA</span>
          </button>
        </div>

        <div className="text-left text-sm text-slate-300 overflow-y-auto max-h-[55vh] pr-2 scrollbar-thin">
          {loadingReserve ? (
            <div className="py-16 text-center text-slate-500 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-500" />
              <p className="text-sm">A IA está cruzando sua reserva com seus objetivos...</p>
            </div>
          ) : reserveAdvice ? (
            <div className="markdown-body prose prose-invert max-w-none text-slate-350 leading-relaxed space-y-4">
              <Markdown>{reserveAdvice}</Markdown>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500">
              <Sparkles className="h-10 w-10 text-indigo-500/40 mx-auto mb-3" />
              <span>Defina sua reserva acima e clique em "Analisar com IA" para receber insights cruzados com seus objetivos.</span>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
