/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  FolderPlus, 
  Trash2, 
  Users, 
  Tag, 
  Database, 
  Flame, 
  Download, 
  Upload, 
  Info,
  RotateCcw,
  X,
  AlertTriangle
} from 'lucide-react';
import { Category, HomeMember, BeneficiaryRule } from '../types.js';
import { formatCurrency } from '../utils.js';
import GlassCard from './GlassCard.js';

interface SettingsTabProps {
  id?: string;
  categories: Category[];
  members: HomeMember[];
  rules: BeneficiaryRule[];
  onAddCategory: (name: string, type: 'receita' | 'despesa', target: number) => void;
  onDeleteCategory: (name: string) => Promise<void>;
  onAddMember: (name: string) => void;
  onDeleteMember: (id: number) => Promise<void>;
  onAddRule: (beneficiary: string, suggested_category: string) => void;
  onDeleteRule?: (id: number) => Promise<void> | void;
  onClearCache: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onResetDatabase: () => void;
}

export default function SettingsTab({
  id,
  categories,
  members,
  rules,
  onAddCategory,
  onDeleteCategory,
  onAddMember,
  onDeleteMember,
  onAddRule,
  onDeleteRule,
  onClearCache,
  onExportBackup,
  onImportBackup,
  onResetDatabase
}: SettingsTabProps) {
  // Category Form State
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'receita' | 'despesa'>('despesa');
  const [catTarget, setCatTarget] = useState('');

  // Member Form State
  const [memberName, setMemberName] = useState('');

  // Rule Form State
  const [ruleBeneficiary, setRuleBeneficiary] = useState('');
  const [ruleCategory, setRuleCategory] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');

  const handleConfirmReset = () => {
    setShowResetConfirm(false);
    setResetConfirmInput('');
    onResetDatabase();
  };

  const handleAddCatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName) return;
    onAddCategory(catName, catType, catTarget ? parseFloat(catTarget) : 0);
    setCatName('');
    setCatTarget('');
    alert('Categoria criada com sucesso!');
  };

  const handleAddMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName) return;
    onAddMember(memberName);
    setMemberName('');
    alert('Membro criado com sucesso!');
  };

  const handleAddRuleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleBeneficiary || !ruleCategory) return;
    onAddRule(ruleBeneficiary, ruleCategory);
    setRuleBeneficiary('');
    alert('Regra de classificação automática de beneficiário criada!');
  };

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (confirm('Restaurar este arquivo de backup irá substituir todos os lançamentos, categorias e configurações atuais. Confirma?')) {
        onImportBackup(e.target.files[0]);
      }
    }
  };

  return (
    <div id={id} className="space-y-6 text-slate-100">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Category manager */}
        <GlassCard>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2">
            <Tag className="h-4 w-4 text-indigo-400" />
            <span>Gestão de Categorias</span>
          </h4>

          {/* Add Category Form */}
          <form onSubmit={handleAddCatSubmit} className="space-y-3 bg-slate-950/20 p-3 rounded-xl border border-slate-850/80 mb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Nome da categoria (ex: Lazer)"
                value={catName}
                onChange={e => setCatName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-800 bg-slate-950/40 py-1.5 px-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <select
                value={catType}
                onChange={e => setCatType(e.target.value as 'receita' | 'despesa')}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/40 py-1.5 px-2 text-xs text-slate-300 focus:outline-none"
              >
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </div>
            {catType === 'despesa' && (
              <input
                type="number"
                placeholder="Meta de gasto recomendada (R$, opcional)"
                value={catTarget}
                onChange={e => setCatTarget(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/40 py-1.5 px-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-1.5 text-xs font-semibold hover:bg-indigo-500 transition-colors"
            >
              Adicionar Categoria
            </button>
          </form>

          {/* Category List */}
          <div className="max-h-60 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-slate-850/60 text-xs">
                <div>
                  <span className="font-semibold text-slate-200">{cat.name}</span>
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide border ${
                    cat.type === 'receita' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15' : 'bg-rose-500/10 text-rose-400 border-rose-500/15'
                  }`}>
                    {cat.type}
                  </span>
                </div>
                <div className="flex items-center space-x-3 text-slate-400">
                  {cat.type === 'despesa' && cat.budget_target ? (
                    <span className="font-mono">Teto: {formatCurrency(cat.budget_target)}</span>
                  ) : null}
                  <button
                    onClick={async () => {
                      if (!confirm('Excluir esta categoria? Lançamentos associados podem ficar sem categoria.')) return;
                      try {
                        await onDeleteCategory(cat.name);
                      } catch (err: any) {
                        setErrorModal({ title: 'Erro ao excluir categoria', message: err?.message || err || 'Erro desconhecido' });
                      }
                    }}
                    className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-850 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Members manager */}
        <GlassCard>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2">
            <Users className="h-4 w-4 text-indigo-400" />
            <span>Membros Residentes da Casa</span>
          </h4>

          {/* Add member Form */}
          <form onSubmit={handleAddMemberSubmit} className="flex space-x-2 bg-slate-950/20 p-3 rounded-xl border border-slate-850/80 mb-4">
            <input
              type="text"
              placeholder="Nome do membro residente (ex: David)"
              value={memberName}
              onChange={e => setMemberName(e.target.value)}
              required
              className="grow rounded-lg border border-slate-800 bg-slate-950/40 py-1.5 px-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold hover:bg-indigo-500 transition-colors shrink-0"
            >
              Adicionar
            </button>
          </form>

          {/* Members List */}
          <div className="max-h-60 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-slate-850/60 text-xs">
                <span className="font-semibold text-slate-200">{member.name}</span>
                <button
                  onClick={async () => {
                    try {
                      await onDeleteMember(member.id);
                    } catch (err: any) {
                      setErrorModal({ title: 'Erro ao excluir membro', message: err?.message || err || 'Erro desconhecido' });
                    }
                  }}
                  className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-850 transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Rules suggestion manager */}
        <GlassCard>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2">
            <FolderPlus className="h-4 w-4 text-indigo-400" />
            <span>Regras de Classificação de Credor</span>
          </h4>

          {/* Add Rule Form */}
          <form onSubmit={handleAddRuleSubmit} className="space-y-3 bg-slate-950/20 p-3 rounded-xl border border-slate-850/80 mb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Texto do Credor (ex: Souza & Reis)"
                value={ruleBeneficiary}
                onChange={e => setRuleBeneficiary(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-800 bg-slate-950/40 py-1.5 px-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <select
                value={ruleCategory}
                onChange={e => setRuleCategory(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-800 bg-slate-950/40 py-1.5 px-2 text-xs text-slate-300 focus:outline-none"
              >
                <option value="">Associe a uma Categoria</option>
                {categories.filter(c => c.type === 'despesa').map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-1.5 text-xs font-semibold hover:bg-indigo-500 transition-colors"
            >
              Mapear Regra
            </button>
          </form>

          {/* Rules List */}
          <div className="max-h-60 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-slate-850/60 text-xs">
                <div>
                  <span className="font-semibold text-slate-250">"{rule.beneficiary}"</span>
                  <span className="text-slate-500 ml-1.5">sugere</span>
                  <span className="text-indigo-400 font-semibold ml-1.5 bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/10">{rule.suggested_category}</span>
                </div>
                {onDeleteRule && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('Excluir esta regra de classificação?')) return;
                      try {
                        await onDeleteRule(rule.id);
                      } catch (err: any) {
                        setErrorModal({ title: 'Erro ao excluir regra', message: err?.message || err || 'Erro desconhecido' });
                      }
                    }}
                    className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-850 transition-colors"
                    title="Excluir regra"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Database backup & Cache operations */}
        <GlassCard className="flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2">
              <Database className="h-4 w-4 text-indigo-400" />
              <span>Diagnósticos & Manutenção do Sistema</span>
            </h4>

            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Todos os dados do My Financer estão armazenados offline e seguros localmente. Use as ferramentas de manutenção abaixo para gerenciar ou redefinir seu ambiente de controle.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Export backup button */}
              <button
                onClick={onExportBackup}
                className="flex items-center justify-between p-4 rounded-xl border border-slate-800 bg-slate-950/30 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <div className="flex items-center space-x-3 text-left">
                  <Download className="h-5 w-5 text-indigo-400 shrink-0" />
                  <div>
                    <p className="font-semibold">Exportar Backup</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Baixar financer_db.json</p>
                  </div>
                </div>
              </button>

              {/* Import backup button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-between p-4 rounded-xl border border-slate-800 bg-slate-950/30 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <div className="flex items-center space-x-3 text-left">
                  <Upload className="h-5 w-5 text-indigo-400 shrink-0" />
                  <div>
                    <p className="font-semibold">Importar Backup</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Substituir base de dados</p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportFileSelect}
                  className="hidden"
                />
              </button>

              {/* Reset database button */}
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center justify-between p-4 rounded-xl border border-rose-500/25 bg-rose-600/10 text-xs text-rose-200 hover:bg-rose-600/20 transition-colors sm:col-span-2"
              >
                <div className="flex items-center space-x-3 text-left">
                  <RotateCcw className="h-5 w-5 text-rose-400 shrink-0" />
                  <div>
                    <p className="font-semibold">Resetar Banco</p>
                    <p className="text-[10px] text-rose-300/80 mt-0.5">Começar do zero com dados padrão</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-850 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            <div className="flex items-start space-x-2.5 max-w-sm">
              <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Limpar o cache do advisor força o sistema a apagar os insights armazenados de 12 horas e refazer uma nova chamada para a IA do Gemini no próximo carregamento.
              </p>
            </div>
            <button
              onClick={() => { onClearCache(); alert('Cache da IA limpo com sucesso! Conselhos serão regenerados no próximo carregamento.'); }}
              className="inline-flex items-center space-x-2 rounded-xl bg-rose-600/15 border border-rose-500/25 px-4 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-600/25 transition-colors focus:outline-none shrink-0"
            >
              <Flame className="h-4 w-4 text-rose-400" />
              <span>Limpar Cache IA</span>
            </button>
          </div>
        </GlassCard>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowResetConfirm(false); setResetConfirmInput(''); }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="text-base font-semibold text-rose-400 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Resetar Banco de Dados
              </h3>
              <button onClick={() => { setShowResetConfirm(false); setResetConfirmInput(''); }} className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-300 leading-relaxed">
                Isso vai apagar <strong className="text-rose-300">TODOS</strong> os seus dados financeiros, incluindo lançamentos, categorias, membros e regras. Esta ação <strong className="text-rose-300">não pode ser desfeita</strong>.
              </p>
              <p className="text-sm text-slate-400">
                Digite <strong className="text-slate-200">CONFIRMAR</strong> abaixo para prosseguir:
              </p>
              <input
                type="text"
                value={resetConfirmInput}
                onChange={e => setResetConfirmInput(e.target.value)}
                placeholder="Digite CONFIRMAR"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="px-5 py-3 border-t border-slate-800 flex gap-3 justify-end">
              <button
                onClick={() => { setShowResetConfirm(false); setResetConfirmInput(''); }}
                className="rounded-lg bg-slate-700/50 border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmReset}
                disabled={resetConfirmInput !== 'CONFIRMAR'}
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                  resetConfirmInput === 'CONFIRMAR'
                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                    : 'bg-rose-900/30 text-rose-700 cursor-not-allowed'
                }`}
              >
                Apagar Tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setErrorModal(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="text-base font-semibold text-rose-400">{errorModal.title}</h3>
              <button onClick={() => setErrorModal(null)} className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{errorModal.message}</p>
            </div>
            <div className="px-5 py-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setErrorModal(null)}
                className="rounded-lg bg-rose-600/20 border border-rose-500/30 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-600/30 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
