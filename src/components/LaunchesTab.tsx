/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Clock, 
  HelpCircle,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Calendar
} from 'lucide-react';
import { Launch, Category, DuplicateGroup, LaunchType, PaymentMethod, LaunchStatus } from '../types.js';
import { formatCurrency, formatDateBr, getMonthNameBr } from '../utils.js';
import { stringsAreSimilar } from '../duplicateDetection.js';
import GlassCard from './GlassCard.js';
import Modal from './Modal.js';

interface LaunchesTabProps {
  id?: string;
  launches: Launch[];
  categories: Category[];
  currentMonth: number;
  currentYear: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onAddLaunch: (launch: Omit<Launch, 'id' | 'created_at'>) => void;
  onUpdateLaunch: (id: number, launch: Partial<Omit<Launch, 'id' | 'created_at'>>) => void;
  onDeleteLaunch: (id: number) => void;
  onTogglePaid: (id: number) => void;
  duplicateGroups: DuplicateGroup[];
  loadingDuplicates: boolean;
  onFetchDuplicates: () => void;
  viewAllMonths: boolean;
  onToggleViewAllMonths: (val: boolean) => void;
  onDeleteMultipleLaunches: (ids: number[]) => void;
}

export default function LaunchesTab({
  id,
  launches,
  categories,
  currentMonth,
  currentYear,
  onPrevMonth,
  onNextMonth,
  onAddLaunch,
  onUpdateLaunch,
  onDeleteLaunch,
  onTogglePaid,
  duplicateGroups,
  loadingDuplicates,
  onFetchDuplicates,
  viewAllMonths,
  onToggleViewAllMonths,
  onDeleteMultipleLaunches
}: LaunchesTabProps) {
  // Filters state
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [originFilter, setOriginFilter] = useState('');

  // Form modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLaunch, setEditingLaunch] = useState<Launch | null>(null);

  // Form field states
  const [type, setType] = useState<LaunchType>('despesa_fixa');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [value, setValue] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<LaunchStatus>('pendente');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [instCurrent, setInstCurrent] = useState('');
  const [instTotal, setInstTotal] = useState('');
  
  // Validation errors
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Duplicate Modal State
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Confirmation Modal State
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'confirm' | 'success';
    onConfirm: () => void;
    onClose: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'confirm',
    onConfirm: () => {},
    onClose: () => {},
  });

  const triggerDeleteConfirm = (launch: Launch) => {
    setConfirmDeleteModal({
      isOpen: true,
      title: 'Excluir Lançamento',
      message: `Tem certeza de que deseja excluir o lançamento "${launch.description}" no valor de ${formatCurrency(launch.value)}? Esta ação não pode ser desfeita.`,
      type: 'confirm',
      onConfirm: () => {
        onDeleteLaunch(launch.id);
        // Refresh duplicate groups (without closing the modal)
        onFetchDuplicates();
        // Após excluir, mostra mensagem de sucesso (não fecha automaticamente!)
        setConfirmDeleteModal(prev => ({
          ...prev,
          title: 'Sucesso!',
          message: 'Lançamento excluído com sucesso!',
          type: 'success'
        }));
      },
      onClose: () => setConfirmDeleteModal(prev => ({ ...prev, isOpen: false }))
    });
  };

  const triggerKeepOnlyOneConfirm = (group: DuplicateGroup) => {
    const [toKeep, ...toDelete] = group.launches;
    if (toDelete.length > 0) {
      setConfirmDeleteModal({
        isOpen: true,
        title: 'Manter Apenas Um Lançamento',
        message: `Isso manterá o lançamento "${toKeep.description}" e removerá ${toDelete.length} duplicatas. Confirma?`,
        type: 'confirm',
        onConfirm: () => {
          toDelete.forEach(l => onDeleteLaunch(l.id));
          // Refresh duplicate groups (without closing the modal)
          onFetchDuplicates();
          // Após exclusão, mostra sucesso
          setConfirmDeleteModal(prev => ({
            ...prev,
            title: 'Sucesso!',
            message: 'Duplicatas resolvidas com sucesso!',
            type: 'success'
          }));
        },
        onClose: () => setConfirmDeleteModal(prev => ({ ...prev, isOpen: false }))
      });
    }
  };

  const handleDeleteAllFiltered = () => {
    const ids = filteredLaunches.map(l => l.id);
    const totalValue = filteredLaunches.reduce((acc, l) => acc + l.value, 0);
    console.log('Deleting filtered launches with IDs:', ids);
    setConfirmDeleteModal({
      isOpen: true,
      title: 'Excluir Todos os Lançamentos Exibidos',
      message: `Tem certeza de que deseja excluir TODOS os ${filteredLaunches.length} lançamentos exibidos na lista (totalizando ${formatCurrency(totalValue)})? Esta ação não pode ser desfeita.`,
      type: 'confirm',
      onConfirm: () => {
        console.log('Confirmed deletion of IDs:', ids);
        onDeleteMultipleLaunches(ids);
        // Refresh duplicate groups (without closing the modal)
        onFetchDuplicates();
        // Após exclusão, mostra sucesso
        setConfirmDeleteModal(prev => ({
          ...prev,
          title: 'Sucesso!',
          message: `${ids.length} lançamentos excluídos com sucesso!`,
          type: 'success'
        }));
      },
      onClose: () => setConfirmDeleteModal(prev => ({ ...prev, isOpen: false }))
    });
  };

  // Filter launches list
  const filteredLaunches = launches.filter(l => {
    const matchesSearch = l.description.toLowerCase().includes(search.toLowerCase()) || 
                          (l.beneficiary && l.beneficiary.toLowerCase().includes(search.toLowerCase()));
    const matchesCat = catFilter ? l.category === catFilter : true;
    const matchesStatus = statusFilter ? l.status === statusFilter : true;
    const matchesOrigin = originFilter ? l.origin === originFilter : true;
    return matchesSearch && matchesCat && matchesStatus && matchesOrigin;
  });

  const handleOpenNewForm = () => {
    setEditingLaunch(null);
    setType('despesa_fixa');
    setCategory(categories.find(c => c.type === 'despesa')?.name || '');
    setDescription('');
    setBeneficiary('');
    setValue('');
    setStatus('pendente');
    setPaymentMethod('pix');
    setInstCurrent('');
    setInstTotal('');
    // pre-fill date of active month
    const today = new Date();
    const padMonth = currentMonth.toString().padStart(2, '0');
    setDueDate(`${currentYear}-${padMonth}-10`);
    setValidationErrors([]);
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (launch: Launch) => {
    setEditingLaunch(launch);
    setType(launch.type);
    setCategory(launch.category);
    setDescription(launch.description);
    setBeneficiary(launch.beneficiary || '');
    setValue(launch.value.toString());
    setDueDate(launch.due_date || '');
    setStatus(launch.status);
    setPaymentMethod(launch.payment_method || 'pix');
    setInstCurrent(launch.installment_current?.toString() || '');
    setInstTotal(launch.installment_total?.toString() || '');
    setValidationErrors([]);
    setIsFormOpen(true);
  };

  const validateForm = () => {
    const errors: string[] = [];
    const numVal = parseFloat(value);
    
    if (!editingLaunch) {
      // Required fields only for new launches
      if (!beneficiary.trim()) {
        errors.push('Beneficiário é obrigatório');
      }
      if (!dueDate) {
        errors.push('Data de vencimento é obrigatória');
      }
    }
    
    if (value) {
      if (isNaN(numVal) || numVal <= 0) {
        errors.push('Valor deve ser um número positivo');
      }
    } else if (!editingLaunch) {
      errors.push('Valor é obrigatório');
    }
    
    if (dueDate) {
      const date = new Date(dueDate);
      if (isNaN(date.getTime())) {
        errors.push('Data inválida');
      }
    }
    
    if (category) {
      const validCategories = categories.map(c => c.name);
      if (!validCategories.includes(category)) {
        errors.push('Categoria inválida');
      }
    }
    
    return errors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm();
    
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    const numVal = parseFloat(value);
    const payload: Omit<Launch, 'id' | 'created_at'> = {
      type,
      category,
      description,
      beneficiary: beneficiary || undefined,
      value: numVal,
      due_date: dueDate || undefined,
      competence_month: currentMonth,
      competence_year: currentYear,
      status,
      payment_method: paymentMethod || undefined,
      installment_current: instCurrent ? parseInt(instCurrent) : undefined,
      installment_total: instTotal ? parseInt(instTotal) : undefined,
      origin: 'manual'
    };

    if (editingLaunch) {
      onUpdateLaunch(editingLaunch.id, payload);
    } else {
      onAddLaunch(payload);
    }
    setIsFormOpen(false);
    setValidationErrors([]);
  };

  const handleVerifyDuplicates = () => {
    onFetchDuplicates();
    setIsDuplicateModalOpen(true);
  };

  const handleKeepOnlyOne = (group: DuplicateGroup) => {
    triggerKeepOnlyOneConfirm(group);
  };

  const handleAutoKeep = (group: DuplicateGroup) => {
    // Choose principal by origin preference, then by created_at (older first)
    const originPriority: Record<string, number> = {
      manual: 0,
      planilha: 1,
      extrato: 2,
      pdf: 3,
      itau_statement: 4,
      '': 5,
      undefined: 5
    };

    const sorted = [...group.launches].sort((a, b) => {
      const pa = originPriority[a.origin as string] ?? 5;
      const pb = originPriority[b.origin as string] ?? 5;
      if (pa !== pb) return pa - pb;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });

    const toKeep = sorted[0];
    const toDelete = sorted.slice(1);

    setConfirmDeleteModal({
      isOpen: true,
      title: 'Auto Selecionar Principal',
      message: `Manter "${toKeep.description}" e remover ${toDelete.length} lançamento(s) automaticamente?`,
      type: 'confirm',
      onConfirm: async () => {
        try {
          const ids = group.launches.map(l => l.id);
          const resp = await fetch('/api/launches/duplicates/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
          });
          if (!resp.ok) {
            const err = await resp.text();
            setConfirmDeleteModal(prev => ({ ...prev, title: 'Erro', message: err || 'Falha ao resolver duplicatas', type: 'success' }));
            return;
          }
          await onFetchDuplicates();
          setConfirmDeleteModal(prev => ({
            ...prev,
            title: 'Sucesso!',
            message: `${toDelete.length} lançamento(s) removido(s).`,
            type: 'success'
          }));
        } catch (e: any) {
          setConfirmDeleteModal(prev => ({ ...prev, title: 'Erro', message: e?.message || String(e), type: 'success' }));
        }
      },
      onClose: () => setConfirmDeleteModal(prev => ({ ...prev, isOpen: false }))
    });
  };

  const getDuplicateGroupReasons = (group: DuplicateGroup) => {
    const reasons: string[] = [];
    const base = group.launches[0];
    const hasSameValue = group.launches.every(item => Math.abs(item.value - base.value) < 0.05);
    const hasSameDate = group.launches.every(item => Boolean(item.due_date) && Boolean(base.due_date) && item.due_date === base.due_date);
    const hasSameBeneficiary = group.launches.every(item => {
      const a = (item.beneficiary || '').trim().toLowerCase();
      const b = (base.beneficiary || '').trim().toLowerCase();
      return a && b && a === b;
    });
    const hasSimilarDescription = group.launches.some((item, index) => {
      if (index === 0) return false;
      return stringsAreSimilar(base.description, item.description);
    });

    if (hasSameValue) reasons.push(`mesmo valor de ${formatCurrency(base.value)}`);
    if (hasSameDate) reasons.push('mesma data de vencimento');
    if (hasSameBeneficiary && base.beneficiary) reasons.push(`mesmo beneficiário (${base.beneficiary})`);
    if (hasSimilarDescription) reasons.push('descrições semelhantes ou equivalentes');
    if (reasons.length === 0) reasons.push('padrões de repetição detectados');

    return reasons;
  };

  return (
    <div id={id} className="space-y-6 text-slate-100">
      {/* Navigation and Top Bar */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="flex items-center space-x-4">
          {!viewAllMonths ? (
            <>
              <button
                onClick={onPrevMonth}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-2 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                title="Mês Anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="text-left">
                <h2 className="text-xl font-bold tracking-tight text-slate-50">
                  {getMonthNameBr(currentMonth)} {currentYear}
                </h2>
                <p className="text-xs text-slate-400">Navegação de fluxo financeiro</p>
              </div>
              <button
                onClick={onNextMonth}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-2 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                title="Próximo Mês"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : (
            <div className="text-left py-1">
              <h2 className="text-xl font-bold tracking-tight text-slate-50 flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-indigo-400" />
                <span>Todos os Lançamentos</span>
              </h2>
              <p className="text-xs text-slate-400">Exibindo histórico completo (todos os meses)</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View toggle */}
          <button
            onClick={() => onToggleViewAllMonths(!viewAllMonths)}
            className={`inline-flex items-center space-x-2 rounded-xl px-4 py-2.5 text-sm font-semibold border transition-all ${
              viewAllMonths
                ? 'bg-indigo-600/15 border-indigo-500/25 text-indigo-300 hover:bg-indigo-600/30'
                : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>{viewAllMonths ? 'Ver por Mês' : 'Ver Todos os Meses'}</span>
          </button>

          {/* Delete All currently filtered launches */}
          {filteredLaunches.length > 0 && (
            <button
              onClick={handleDeleteAllFiltered}
              className="inline-flex items-center space-x-2 rounded-xl bg-rose-600/15 border border-rose-500/20 px-4 py-2.5 text-sm font-semibold text-rose-400 hover:bg-rose-600/30 transition-colors focus:outline-none"
              title="Excluir todos os lançamentos atualmente exibidos sob os filtros ativos"
            >
              <Trash2 className="h-4 w-4 text-rose-400" />
              <span>Excluir Tudo</span>
            </button>
          )}

          <button
            onClick={handleVerifyDuplicates}
            className="inline-flex items-center space-x-2 rounded-xl bg-indigo-600/15 border border-indigo-500/25 px-4 py-2.5 text-sm font-semibold text-indigo-300 hover:bg-indigo-600/35 transition-colors focus:outline-none"
          >
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <span>Duplicatas</span>
          </button>

          <button
            onClick={handleOpenNewForm}
            className="inline-flex items-center space-x-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <Plus className="h-4 w-4" />
            <span>Novo</span>
          </button>
        </div>
      </div>

      {/* Filter Options */}
      <GlassCard className="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 items-center">
          {/* Search bar */}
          <div className="relative sm:col-span-4">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar por descrição ou beneficiário..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950/40 py-2 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Category filter */}
          <div className="relative sm:col-span-2">
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/40 py-2 px-3 text-sm text-slate-300 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Todas as Categorias</option>
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Origin filter */}
          <div className="relative sm:col-span-3">
            <select
              value={originFilter}
              onChange={e => setOriginFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/40 py-2 px-3 text-sm text-slate-300 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Todas as Origens</option>
              <option value="manual">Manual</option>
              <option value="pdf">Boleto PDF</option>
              <option value="planilha">Planilha</option>
              <option value="extrato_bradesco">Bradesco</option>
              <option value="extrato_nubank">Nubank</option>
              <option value="extrato_itau">Itaú</option>
              <option value="itau_statement">Itaú Statement</option>
              <option value="extrato">Outro Extrato</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="relative sm:col-span-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/40 py-2 px-3 text-sm text-slate-300 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Todos os Status</option>
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
            </select>
          </div>

          {/* Clean filters button */}
          <div className="sm:col-span-1 text-center">
            <button
              onClick={() => { setSearch(''); setCatFilter(''); setStatusFilter(''); setOriginFilter(''); }}
              className="rounded-xl border border-slate-850 p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all focus:outline-none"
              title="Limpar Filtros"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Launches Table List */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {filteredLaunches.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-medium uppercase tracking-wider text-slate-400 bg-slate-950/20">
                  <th className="py-3.5 px-5">Data/Venc.</th>
                  <th className="py-3.5 px-5">Descrição</th>
                  <th className="py-3.5 px-5">Categoria</th>
                  <th className="py-3.5 px-5">Beneficiário</th>
                  <th className="py-3.5 px-5">Origem</th>
                  <th className="py-3.5 px-5 text-right">Valor</th>
                  <th className="py-3.5 px-5 text-center">Status</th>
                  <th className="py-3.5 px-5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-sm">
                {filteredLaunches.map((launch) => {
                  const isRevenue = launch.type === 'receita';
                  const isPaid = launch.status === 'pago';
                  const isOverdue = !isPaid && launch.due_date && launch.due_date < new Date().toISOString().split('T')[0];

                  return (
                    <tr key={launch.id} className="hover:bg-slate-850/20 transition-colors">
                      {/* Due date */}
                      <td className="py-3.5 px-5 font-mono text-xs">
                        <span className={isOverdue ? 'text-rose-400 font-semibold' : 'text-slate-300'}>
                          {formatDateBr(launch.due_date)}
                        </span>
                      </td>

                      {/* Description */}
                      <td className="py-3.5 px-5 font-medium text-slate-100">
                        <div className="flex flex-col">
                          <span>{launch.description}</span>
                          {launch.installment_total && (
                            <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                              Parcela {launch.installment_current}/{launch.installment_total}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-5">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                          isRevenue ? 'bg-emerald-500/5 text-emerald-300 border-emerald-500/15' : 'bg-slate-800/80 text-slate-300 border-slate-700/50'
                        }`}>
                          {launch.category}
                        </span>
                      </td>

                      {/* Beneficiary */}
                      <td className="py-3.5 px-5 text-slate-400">{launch.beneficiary || 'N/A'}</td>

                      {/* Origin tag */}
                      <td className="py-3.5 px-5 text-xs text-slate-500 capitalize">
                        {launch.origin === 'manual' ? 'Manual' : launch.origin === 'pdf' ? 'Boleto PDF' : launch.origin === 'planilha' ? 'Planilha' : launch.origin === 'extrato_bradesco' ? 'Bradesco' : launch.origin === 'extrato_nubank' ? 'Nubank' : launch.origin === 'extrato_itau' ? 'Itaú' : launch.origin === 'extrato' ? 'Outro' : 'Extrato'}
                      </td>

                      {/* Value */}
                      <td className="py-3.5 px-5 text-right font-semibold font-mono">
                        <span className={isRevenue ? 'text-emerald-400' : 'text-slate-100'}>
                          {isRevenue ? '+' : '-'} {formatCurrency(launch.value)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-5 text-center">
                        <button
                          onClick={() => onTogglePaid(launch.id)}
                          className={`inline-flex items-center space-x-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-all hover:scale-101 ${
                            isPaid 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : isOverdue 
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                        >
                          {isPaid ? <Check className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                          <span>{isPaid ? 'Pago' : isOverdue ? 'Atrasado' : 'Pendente'}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => handleOpenEditForm(launch)}
                            className="rounded-lg border border-slate-800 bg-slate-900/60 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                            title="Editar Lançamento"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => triggerDeleteConfirm(launch)}
                            className="rounded-lg border border-slate-800 bg-slate-900/60 p-1.5 text-rose-400 hover:bg-rose-950/30 hover:border-rose-900/50 transition-colors"
                            title="Excluir Lançamento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onTogglePaid(launch.id)}
                            className={`inline-flex items-center space-x-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all hover:scale-101 ${
                              isPaid
                                ? 'bg-emerald-600/15 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/30'
                                : 'bg-amber-600/15 border border-amber-500/20 text-amber-400 hover:bg-amber-600/30'
                            }`}
                            title={isPaid ? 'Estornar / Marcar como Pendente' : 'Confirmar Pagamento'}
                          >
                            {isPaid ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            <span>{isPaid ? 'Pago' : 'Pagar'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-12 text-center text-slate-500 text-sm flex flex-col items-center space-y-3">
              <Filter className="h-10 w-10 text-slate-600/70" />
              <span>Nenhum lançamento encontrado para os filtros selecionados.</span>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Dialog: Manual Form Overlay */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingLaunch ? 'Editar Lançamento' : 'Novo Lançamento'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-slate-200">
          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
              <ul className="list-disc list-inside text-xs text-rose-300 space-y-1">
                {validationErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          {/* Type picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tipo de Fluxo</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setType('receita'); setCategory(categories.find(c => c.type === 'receita')?.name || ''); }}
                className={`py-2 px-4 rounded-xl font-semibold text-sm border transition-colors ${
                  type === 'receita' ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Receita
              </button>
              <button
                type="button"
                onClick={() => { setType('despesa_fixa'); setCategory(categories.find(c => c.type === 'despesa')?.name || ''); }}
                className={`py-2 px-4 rounded-xl font-semibold text-sm border transition-colors ${
                  type !== 'receita' ? 'bg-rose-600/20 text-rose-300 border-rose-500/40' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Despesa
              </button>
            </div>
          </div>

          {/* Expense Subtype Picker (only visible if type !== 'receita') */}
          {type !== 'receita' && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Subtipo de Despesa</label>
              <div className="grid grid-cols-3 gap-2">
                {(['despesa_fixa', 'despesa_variavel', 'divida_parcelamento'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`py-2 px-2 rounded-xl text-xs font-medium border transition-colors capitalize ${
                      type === t ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40' : 'bg-slate-850 border-slate-800 text-slate-400'
                    }`}
                  >
                    {t === 'despesa_fixa' ? 'Fixa' : t === 'despesa_variavel' ? 'Variável' : 'Parcelamento'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Category selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Categoria</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2.5 px-3 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                {categories.filter(c => c.type === (type === 'receita' ? 'receita' : 'despesa')).map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Value */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="0,00"
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Descrição</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Aluguel do Mês, Supermercado"
              required
              className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Beneficiary */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Credor/Beneficiário</label>
              <input
                type="text"
                value={beneficiary}
                onChange={e => setBeneficiary(e.target.value)}
                placeholder="Ex: Souza & Reis, Enel, Enel S/A"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Due date */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Data de Vencimento</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-3 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Payment Method & Installments */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Forma de Pagamento</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2.5 px-3 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="pix">PIX</option>
                <option value="boleto">Boleto Bancário</option>
                <option value="cartao">Cartão de Crédito</option>
                <option value="debito_automatico">Débito Automático</option>
                <option value="dinheiro">Dinheiro Físico</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Status Inicial</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as LaunchStatus)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2.5 px-3 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="pendente">Pendente</option>
                <option value="pago">Pago / Recebido</option>
              </select>
            </div>
          </div>

          {/* Parcela counts if division */}
          {type === 'divida_parcelamento' && (
            <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-950/30 p-3 border border-slate-850">
              <div>
                <label className="block text-xxs font-semibold uppercase tracking-wider text-slate-400 mb-1">Parcela Atual</label>
                <input
                  type="number"
                  min="1"
                  value={instCurrent}
                  onChange={e => setInstCurrent(e.target.value)}
                  placeholder="Ex: 3"
                  className="w-full rounded-lg border border-slate-850 bg-slate-950/50 py-1.5 px-3 text-sm text-slate-100 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xxs font-semibold uppercase tracking-wider text-slate-400 mb-1">Total Parcelas</label>
                <input
                  type="number"
                  min="1"
                  value={instTotal}
                  onChange={e => setInstTotal(e.target.value)}
                  placeholder="Ex: 12"
                  className="w-full rounded-lg border border-slate-850 bg-slate-950/50 py-1.5 px-3 text-sm text-slate-100 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Submit buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="rounded-xl border border-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-850 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors focus:outline-none"
            >
              {editingLaunch ? 'Salvar Alterações' : 'Criar Lançamento'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Dialog: Duplicate Verification Resolver */}
      <Modal
        isOpen={isDuplicateModalOpen}
        onClose={() => setIsDuplicateModalOpen(false)}
        title="Detector de Duplicatas Inteligente"
        size="lg"
      >
        <div className="space-y-4 text-slate-300 text-sm">
          <div className="rounded-xl bg-indigo-600/10 border border-indigo-500/20 p-4 text-indigo-300">
            <p className="font-semibold flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-indigo-400" />
              <span>Análise Consolidada do Período</span>
            </p>
            <p className="text-xs text-indigo-400/90 mt-1">
              O My Financer faz uma varredura de 3 níveis em busca de cobranças idênticas de mesmo valor, beneficiários duplicados e datas de vencimento redundantes.
            </p>
          </div>

          {loadingDuplicates ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-indigo-500 mb-3" />
              <span>Escaneando lançamentos em tempo real...</span>
            </div>
          ) : duplicateGroups.length > 0 ? (
            <div className="space-y-5">
              <p className="font-medium text-slate-200">Encontramos {duplicateGroups.length} {duplicateGroups.length === 1 ? 'grupo' : 'grupos'} de potenciais duplicatas:</p>

              {duplicateGroups.map((group) => (
                <div key={group.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="flex items-center space-x-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="font-semibold text-amber-400 capitalize text-xs bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {group.level === 'exact' ? 'Alta suspeita' : group.level === 'fuzzy' ? 'Suspeita de duplicidade' : 'Mesmo valor'}
                      </span>
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleKeepOnlyOne(group)}
                        className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
                      >
                        Manter apenas um
                      </button>
                      <button
                        onClick={() => handleAutoKeep(group)}
                        className="rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-850 transition-colors"
                        title="Selecionar automaticamente o principal com base em origem/data"
                      >
                        Auto
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                    <p className="font-semibold text-amber-300">Possível duplicata. Motivos:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {getDuplicateGroupReasons(group).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-amber-300/90">
                      Sugestão: revise os lançamentos, mantenha o mais correto e remova os demais se for repetição.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {group.launches.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs bg-slate-900 p-2.5 rounded-lg border border-slate-850">
                        <div>
                          <p className="font-medium text-slate-200">{item.description}</p>
                          <p className="text-slate-400 text-xxs mt-0.5">Vencimento: {formatDateBr(item.due_date)} | Origem: {item.origin}</p>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="font-bold font-mono text-slate-200">{formatCurrency(item.value)}</span>
                          <button
                            onClick={() => triggerDeleteConfirm(item)}
                            className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-slate-800"
                            title="Excluir individual"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center space-y-3">
              <Check className="h-10 w-10 text-emerald-500 bg-emerald-500/10 rounded-full p-2 border border-emerald-500/20" />
              <span className="font-medium text-slate-200">Nenhum lançamento duplicado encontrado!</span>
              <p className="text-xs text-slate-500 max-w-sm">Suas contas estão limpas, bem categorizadas e sem qualquer redundância neste mês.</p>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-slate-800/80">
            <button
              onClick={() => setIsDuplicateModalOpen(false)}
              className="rounded-xl border border-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-850 transition-colors"
            >
              Fechar Painel
            </button>
          </div>
        </div>
      </Modal>

      {/* Dialog: Confirm Delete Modal */}
      <Modal
        isOpen={confirmDeleteModal.isOpen}
        onClose={confirmDeleteModal.onClose}
        title={confirmDeleteModal.title}
        size="sm"
      >
        <div className="space-y-4 text-slate-200 text-center py-2">
          <p className="text-sm text-slate-300 leading-relaxed">
            {confirmDeleteModal.message}
          </p>
          <div className="flex items-center justify-center space-x-3 pt-4 border-t border-slate-800/80">
            {confirmDeleteModal.type === 'confirm' ? (
              <>
                <button
                  type="button"
                  onClick={confirmDeleteModal.onClose}
                  className="rounded-xl border border-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-850 transition-colors focus:outline-none"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteModal.onConfirm}
                  className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 transition-colors shadow-lg shadow-rose-600/10 focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  Confirmar Exclusão
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={confirmDeleteModal.onClose}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Fechar
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
