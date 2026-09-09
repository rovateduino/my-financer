/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  PiggyBank, 
  AlertTriangle, 
  Settings2, 
  CheckCircle2, 
  Info,
  DollarSign
} from 'lucide-react';
import { Category, BudgetStatus } from '../types.js';
import { formatCurrency } from '../utils.js';
import GlassCard from './GlassCard.js';
import Modal from './Modal.js';

interface BudgetsTabProps {
  id?: string;
  budgets: BudgetStatus[];
  onUpdateCategoryBudget: (name: string, type: 'receita' | 'despesa', target: number) => void;
  categories: Category[];
}

export default function BudgetsTab({ id, budgets, onUpdateCategoryBudget, categories }: BudgetsTabProps) {
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [limitValue, setLimitValue] = useState('');

  const expenseBudgets = budgets.filter(b => b.type === 'despesa');

  // Calculate global totals
  const totalLimit = expenseBudgets.reduce((sum, b) => sum + b.target, 0);
  const totalSpent = expenseBudgets.reduce((sum, b) => sum + b.spent, 0);
  const totalExceeded = expenseBudgets.filter(b => b.exceeded).length;

  const globalPercentage = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

  const handleOpenLimitModal = (categoryName: string, currentTarget: number) => {
    setSelectedCategory(categoryName);
    setLimitValue(currentTarget.toString());
    setIsLimitModalOpen(true);
  };

  const handleSaveLimit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetVal = parseFloat(limitValue);
    if (isNaN(targetVal) || targetVal < 0) {
      return;
    }

    const cat = categories.find(c => c.name === selectedCategory);
    if (cat) {
      onUpdateCategoryBudget(selectedCategory, cat.type, targetVal);
      setIsLimitModalOpen(false);
    }
  };

  return (
    <div id={id} className="space-y-6 text-slate-100">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Total Limit */}
        <GlassCard>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Teto de Gastos Definido</span>
            <span className="rounded-xl bg-indigo-500/10 p-2.5 text-indigo-400 border border-indigo-500/20">
              <PiggyBank className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-slate-50 font-sans">
              {formatCurrency(totalLimit)}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Soma das metas de despesas mensais
            </p>
          </div>
        </GlassCard>

        {/* Consumido */}
        <GlassCard>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Total Consumido</span>
            <span className={`rounded-xl p-2.5 border ${globalPercentage > 90 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>
              <DollarSign className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold tracking-tight text-slate-50 font-sans">
              {formatCurrency(totalSpent)}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {totalLimit > 0 ? `${globalPercentage.toFixed(1)}% do orçamento total consumido` : 'Defina limites para acompanhar o progresso'}
            </p>
          </div>
        </GlassCard>

        {/* Limites Ultrapassados */}
        <GlassCard className={`border-l-4 ${totalExceeded > 0 ? 'border-l-rose-500' : 'border-l-emerald-500'}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Limites Estourados</span>
            <span className={`rounded-xl p-2.5 border ${totalExceeded > 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
              <AlertTriangle className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className={`text-2xl font-bold tracking-tight font-sans ${totalExceeded > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {totalExceeded} {totalExceeded === 1 ? 'categoria' : 'categorias'}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {totalExceeded > 0 ? 'Requer atenção imediata nos gastos' : 'Parabéns! Todos os limites estão em dia'}
            </p>
          </div>
        </GlassCard>
      </div>

      {/* Global Progress Bar */}
      {totalLimit > 0 && (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between text-sm font-medium text-slate-350">
            <span>Orçamento Geral do Mês</span>
            <span className="font-semibold font-mono">{globalPercentage.toFixed(1)}%</span>
          </div>
          <div className="mt-3 h-3.5 w-full rounded-full bg-slate-800 overflow-hidden border border-slate-700/30">
            <div 
              style={{ width: `${Math.min(globalPercentage, 100)}%` }}
              className={`h-full rounded-full transition-all duration-500 ${
                globalPercentage > 100 
                  ? 'bg-rose-500 shadow-lg shadow-rose-500/20' 
                  : globalPercentage > 85 
                    ? 'bg-amber-500' 
                    : 'bg-indigo-500'
              }`}
            />
          </div>
        </GlassCard>
      )}

      {/* Categories Budgets Table / Progress bars */}
      <GlassCard>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h4 className="text-base font-semibold text-slate-200">Acompanhamento por Categoria</h4>
            <p className="text-xs text-slate-400 mt-1">Gerencie e monitore limites de custos específicos por categoria</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {expenseBudgets.map((b) => {
            const hasLimit = b.target > 0;
            const percentage = hasLimit ? (b.spent / b.target) * 100 : 0;
            
            // Dynamic colors based on thresholds
            let barColor = 'bg-emerald-500';
            let textColor = 'text-emerald-400';
            let bgGlow = 'bg-emerald-500/5';
            let borderStyle = 'border-slate-850';

            if (b.exceeded) {
              barColor = 'bg-rose-500 animate-pulse';
              textColor = 'text-rose-400';
              bgGlow = 'bg-rose-500/5';
              borderStyle = 'border-rose-500/25 bg-rose-950/5';
            } else if (percentage > 90) {
              barColor = 'bg-orange-500';
              textColor = 'text-orange-400';
              bgGlow = 'bg-orange-500/5';
            } else if (percentage > 60) {
              barColor = 'bg-amber-500';
              textColor = 'text-amber-400';
              bgGlow = 'bg-amber-500/5';
            }

            return (
              <div 
                key={b.category} 
                className={`rounded-xl border p-4 flex flex-col justify-between transition-colors ${borderStyle} ${bgGlow}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-semibold text-slate-200 text-sm">{b.category}</span>
                    <div className="mt-1 flex items-center space-x-1.5 font-mono text-xs text-slate-400">
                      <span>Gasto: {formatCurrency(b.spent)}</span>
                      <span>•</span>
                      <span>Limite: {hasLimit ? formatCurrency(b.target) : 'Sem Limite'}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenLimitModal(b.category, b.target)}
                    className="rounded-lg p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors focus:outline-none"
                    title="Definir Limite"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                </div>

                {hasLimit ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xxs font-semibold tracking-wide uppercase text-slate-500 mb-1.5">
                      <span>Progresso</span>
                      <span className={`font-bold font-mono ${textColor}`}>{percentage.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-850 overflow-hidden border border-slate-800/55">
                      <div 
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                      />
                    </div>
                    {b.exceeded && (
                      <div className="mt-2 text-xxs font-semibold text-rose-400 flex items-center space-x-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>Orçamento ultrapassado em R$ {(b.spent - b.target).toLocaleString('pt-BR')}!</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 text-xs italic text-slate-500 flex items-center space-x-1">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    <span>Nenhum teto de custos definido para esta categoria.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Set limit Modal */}
      <Modal
        isOpen={isLimitModalOpen}
        onClose={() => setIsLimitModalOpen(false)}
        title={`Definir Limite — ${selectedCategory}`}
        size="sm"
      >
        <form onSubmit={handleSaveLimit} className="space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            Configure o teto máximo de despesa mensal recomendado para **{selectedCategory}**. O sistema irá avisá-lo de forma inteligente quando atingir 60%, 90% e 100% deste limite.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Limite Mensal (R$)</label>
            <input
              type="number"
              step="0.01"
              value={limitValue}
              onChange={e => setLimitValue(e.target.value)}
              placeholder="0,00"
              required
              className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsLimitModalOpen(false)}
              className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors focus:outline-none"
            >
              Salvar Limite
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
