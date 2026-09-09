/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  CreditCard, 
  AlertOctagon, 
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit3,
  Check,
  Calendar,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import GlassCard from './GlassCard.js';
import Modal from './Modal.js';
import { DashboardData, Launch, Category, LaunchStatus, PaymentMethod, LaunchType } from '../types.js';
import { formatCurrency, formatDateBr, getMonthNameBr } from '../utils.js';

interface DashboardTabProps {
  id?: string;
  data: DashboardData | null;
  loading: boolean;
  onTogglePaid: (id: number) => void;
  onQuickPay: (id: number) => void;
  onNewLaunch: () => void;
  currentMonth: number;
  currentYear: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  categories: Category[];
  onUpdateLaunch: (id: number, launch: Partial<Omit<Launch, 'id' | 'created_at'>>) => void;
  onDeleteLaunch: (id: number) => void;
  onDeleteMultipleLaunches: (ids: number[]) => void;
}

const COLORS = ['#6366f1', '#3b82f6', '#ec4899', '#f43f5e', '#eab308', '#10b981', '#a855f7', '#64748b'];

export default function DashboardTab({ 
  id, 
  data, 
  loading, 
  onTogglePaid, 
  onQuickPay, 
  onNewLaunch,
  currentMonth,
  currentYear,
  onPrevMonth,
  onNextMonth,
  categories,
  onUpdateLaunch,
  onDeleteLaunch,
  onDeleteMultipleLaunches
}: DashboardTabProps) {
  const [showOverdueDetails, setShowOverdueDetails] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLaunch, setEditingLaunch] = useState<Launch | null>(null);

  // Form Fields State
  const [type, setType] = useState<LaunchType>('despesa_fixa');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [instCurrent, setInstCurrent] = useState('1');
  const [instTotal, setInstTotal] = useState('12');

  // Confirmation Modal State
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  if (loading || !data) {
    return (
      <div id={id} className="space-y-6">
        {/* Navigation and Top Bar during loading */}
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="flex items-center space-x-4">
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
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onNewLaunch}
              className="inline-flex items-center space-x-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <Plus className="h-4 w-4" />
              <span>Novo Lançamento</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-900 border border-slate-800" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-80 animate-pulse rounded-2xl bg-slate-900 border border-slate-800" />
          <div className="h-80 animate-pulse rounded-2xl bg-slate-900 border border-slate-800" />
        </div>
      </div>
    );
  }

  const { summary, categories_breakdown, pending_bills, historical_data } = data;

  const triggerDeleteConfirm = (launch: Launch) => {
    setConfirmDeleteModal({
      isOpen: true,
      title: 'Excluir Lançamento',
      message: `Tem certeza de que deseja excluir o lançamento "${launch.description}" no valor de ${formatCurrency(launch.value)}? Esta ação não pode ser desfeita.`,
      onConfirm: () => {
        onDeleteLaunch(launch.id);
        setConfirmDeleteModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const startEditing = (launch: Launch) => {
    setEditingLaunch(launch);
    setType(launch.type);
    setCategory(launch.category);
    setDescription(launch.description);
    setValue(launch.value.toString());
    setBeneficiary(launch.beneficiary || '');
    setDueDate(launch.due_date || '');
    setPaymentMethod(launch.payment_method || 'pix');
    setInstCurrent((launch.installment_current || 1).toString());
    setInstTotal((launch.installment_total || 12).toString());
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLaunch) return;
    
    const payload: Partial<Omit<Launch, 'id' | 'created_at'>> = {
      type: type as LaunchType,
      category,
      description,
      value: parseFloat(value),
      beneficiary: beneficiary || undefined,
      due_date: dueDate || undefined,
      payment_method: paymentMethod,
      installment_current: type === 'divida_parcelamento' ? parseInt(instCurrent) : undefined,
      installment_total: type === 'divida_parcelamento' ? parseInt(instTotal) : undefined,
    };

    onUpdateLaunch(editingLaunch.id, payload);
    setIsEditModalOpen(false);
    setEditingLaunch(null);
  };

  const getDaysOverdue = (dueDateStr: string) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDateStr);
    due.setHours(0,0,0,0);
    const diffTime = today.getTime() - due.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const overdueList = pending_bills.filter(l => {
    if (!l.due_date) return false;
    const today = new Date().toISOString().split('T')[0];
    return l.due_date < today;
  });

  const triggerDeleteAllOverdueConfirm = () => {
    const ids = overdueList.map(l => l.id);
    const totalValue = overdueList.reduce((acc, l) => acc + l.value, 0);
    setConfirmDeleteModal({
      isOpen: true,
      title: 'Excluir Todas as Contas Vencidas',
      message: `Tem certeza de que deseja excluir TODAS as ${overdueList.length} contas vencidas (totalizando ${formatCurrency(totalValue)})? Esta ação não pode ser desfeita.`,
      onConfirm: () => {
        onDeleteMultipleLaunches(ids);
        setConfirmDeleteModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const upcomingList = pending_bills.filter(l => {
    if (!l.due_date) return false;
    const today = new Date().toISOString().split('T')[0];
    if (l.due_date < today) return false;
    const diffTime = new Date(l.due_date).getTime() - new Date(today).getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays <= 3;
  });

  // Safe check for pie chart rendering
  const pieData = categories_breakdown.map(item => ({
    name: item.category,
    value: item.value
  }));

  return (
    <div id={id} className="space-y-6 text-slate-100">
      {/* Navigation and Top Bar */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="flex items-center space-x-4">
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
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onNewLaunch}
            className="inline-flex items-center space-x-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Lançamento</span>
          </button>
        </div>
      </div>
      {/* Alert Banner for Overdue / Warning */}
      {(overdueList.length > 0 || upcomingList.length > 0) && (
        <div className="space-y-3">
          {overdueList.length > 0 && (
            <div className="space-y-3">
              {/* Overdue Summary Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-rose-500/35 bg-rose-950/20 px-5 py-4 text-rose-200 gap-3">
                <div className="flex items-center space-x-3">
                  <AlertOctagon className="h-5 w-5 text-rose-500 shrink-0 animate-pulse" />
                  <div>
                    <span className="font-semibold">Contas Atrasadas! </span>
                    Você possui {overdueList.length} {overdueList.length === 1 ? 'conta pendente' : 'contas pendentes'} vencidas. Evite juros adicionais.
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={triggerDeleteAllOverdueConfirm}
                    className="inline-flex items-center space-x-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors focus:outline-none shadow-md shadow-rose-600/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Excluir Todas</span>
                  </button>
                  <button
                    onClick={() => setShowOverdueDetails(!showOverdueDetails)}
                    className="inline-flex items-center space-x-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-300 border border-rose-500/20 transition-colors focus:outline-none"
                  >
                    {showOverdueDetails ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" />
                        <span>Ocultar Detalhes</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" />
                        <span>Visualizar Contas ({overdueList.length})</span>
                      </>
                    )}
                  </button>
                  <span className="hidden sm:inline-block rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-400 border border-rose-500/30">
                    Ação Necessária
                  </span>
                </div>
              </div>

              {/* Overdue Detailed List */}
              {showOverdueDetails && (
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wider px-1 pb-1">
                    Lista de Contas Vencidas
                  </div>
                  <div className="space-y-2">
                    {overdueList.map((launch) => {
                      const days = getDaysOverdue(launch.due_date!);
                      return (
                        <div
                          key={launch.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 p-3.5 hover:border-slate-700 transition-colors gap-3"
                        >
                          <div className="flex items-start space-x-3">
                            <div className="rounded-xl bg-rose-500/10 p-2 text-rose-400 border border-rose-500/20 mt-0.5 animate-pulse">
                              <CreditCard className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="font-semibold text-sm text-slate-200">
                                  {launch.description}
                                </span>
                                <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xxs font-semibold text-rose-400 border border-rose-500/20">
                                  {days === 1 ? 'Atrasado 1 dia' : `Atrasado há ${days} dias`}
                                </span>
                                <span className="rounded-md bg-slate-850 px-2 py-0.5 text-xxs text-slate-400 font-medium border border-slate-800">
                                  {launch.category}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                                {launch.beneficiary && (
                                  <span>
                                    <span className="text-slate-500">Credor:</span> {launch.beneficiary}
                                  </span>
                                )}
                                <span className="flex items-center space-x-1">
                                  <Calendar className="h-3 w-3 text-slate-500" />
                                  <span>Venceu em: {formatDateBr(launch.due_date!)}</span>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end space-x-4 sm:space-x-6 border-t border-slate-800/50 sm:border-t-0 pt-2.5 sm:pt-0">
                            <div className="text-right">
                              <div className="text-base font-bold text-rose-400 font-sans">
                                {formatCurrency(launch.value)}
                              </div>
                              <div className="text-xxs text-slate-500 uppercase tracking-wider">
                                {launch.payment_method ? launch.payment_method.toUpperCase() : 'N/A'}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => startEditing(launch)}
                                className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                                title="Editar Lançamento"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => triggerDeleteConfirm(launch)}
                                className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-rose-400 hover:bg-rose-950/30 hover:border-rose-900/50 transition-colors"
                                title="Excluir Lançamento"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => onTogglePaid(launch.id)}
                                className="inline-flex items-center space-x-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-all shadow-md shadow-emerald-600/10"
                                title="Confirmar Pagamento"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>Pagar</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {upcomingList.length > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-amber-500/35 bg-amber-950/20 px-5 py-4 text-amber-200">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <span className="font-semibold">Vencendo nos próximos 3 dias: </span>
                  {upcomingList.length} {upcomingList.length === 1 ? 'lançamento requer' : 'lançamentos requerem'} pagamento em breve.
                </div>
              </div>
              <span className="hidden sm:inline-block rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-400 border border-amber-500/30">
                Próximos
              </span>
            </div>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Receitas */}
        <GlassCard className="relative overflow-hidden group">
          <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-emerald-500/5 blur-xl group-hover:bg-emerald-500/10 transition-colors" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Receitas Mensais</span>
            <span className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold tracking-tight text-slate-50 font-sans">
              {formatCurrency(summary.receita_total)}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Entradas consolidadas no mês
            </p>
          </div>
        </GlassCard>

        {/* Despesas */}
        <GlassCard className="relative overflow-hidden group">
          <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-rose-500/5 blur-xl group-hover:bg-rose-500/10 transition-colors" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Despesas Totais</span>
            <span className="rounded-xl bg-rose-500/10 p-2.5 text-rose-400 border border-rose-500/20">
              <TrendingDown className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold tracking-tight text-slate-50 font-sans">
              {formatCurrency(summary.despesa_total)}
            </h3>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
              <span>Fixas: {formatCurrency(summary.despesa_fixa)}</span>
              <span>Variáveis: {formatCurrency(summary.despesa_variavel)}</span>
            </div>
          </div>
        </GlassCard>

        {/* Saldo Líquido */}
        <GlassCard className={`relative overflow-hidden group border-l-4 ${summary.saldo >= 0 ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
          <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-indigo-500/5 blur-xl group-hover:bg-indigo-500/10 transition-colors" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Saldo Líquido</span>
            <span className={`rounded-xl p-2.5 border ${summary.saldo >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
              <CreditCard className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className={`text-3xl font-bold tracking-tight font-sans ${summary.saldo >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatCurrency(summary.saldo)}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {summary.saldo >= 0 ? 'Parabéns! Sobrou saldo neste período' : 'Atenção! Orçamento estourado'}
            </p>
          </div>
        </GlassCard>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* History Chart */}
        <div className="lg:col-span-7">
          <GlassCard className="h-96 flex flex-col justify-between">
            <div>
              <h4 className="text-base font-medium text-slate-200">Histórico de Balanço</h4>
              <p className="text-xs text-slate-400 mt-1">Últimos 6 meses de receitas, despesas e saldo líquido</p>
            </div>
            <div className="h-72 min-h-[288px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                <BarChart data={historical_data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month_label" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(val) => `R$${val}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                    labelStyle={{ color: '#f1f5f9', fontWeight: 600 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#e2e8f0' }} />
                  <Bar dataKey="receitas" fill="#10b981" name="Receitas" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" fill="#f43f5e" name="Despesas" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </div>

        {/* Pie Chart */}
        <div className="lg:col-span-5">
          <GlassCard className="h-96 flex flex-col justify-between">
            <div>
              <h4 className="text-base font-medium text-slate-200">Distribuição de Gastos</h4>
              <p className="text-xs text-slate-400 mt-1">Proporção das despesas por categoria de custo</p>
            </div>
            <div className="h-72 min-h-[288px] w-full mt-4 flex items-center justify-center relative">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val: number) => formatCurrency(val)}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-slate-500 text-sm">Nenhuma despesa lançada neste mês</div>
              )}

              {/* Legends container customized inside card space */}
              {pieData.length > 0 && (
                <div className="absolute right-0 bottom-0 max-h-24 overflow-y-auto flex flex-col space-y-1 bg-slate-950/40 p-2 rounded-lg border border-slate-800 text-[10px] text-slate-300 w-36">
                  {pieData.slice(0, 5).map((entry, index) => (
                    <div key={entry.name} className="flex items-center space-x-1.5 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="truncate max-w-[100px]" title={entry.name}>{entry.name}</span>
                    </div>
                  ))}
                  {pieData.length > 5 && <span className="text-slate-500 italic">+ {pieData.length - 5} outras</span>}
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Pending Bills Grid/Table */}
      <GlassCard>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-medium text-slate-200">Próximos Pagamentos (Pendentes)</h4>
            <p className="text-xs text-slate-400 mt-1">Despesas em aberto aguardando conciliação ou liquidação</p>
          </div>
          <button 
            onClick={onNewLaunch}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            + Novo Lançamento
          </button>
        </div>

        <div className="mt-5 overflow-x-auto">
          {pending_bills.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-medium uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Vencimento</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Beneficiário</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-sm">
                {pending_bills.map((launch) => {
                  const isOverdue = launch.due_date && launch.due_date < new Date().toISOString().split('T')[0];
                  return (
                    <tr key={launch.id} className="hover:bg-slate-850/40 transition-colors">
                      <td className="py-3 px-4">
                        <span className={`flex items-center space-x-1.5 font-mono text-xs ${isOverdue ? 'text-rose-400 font-semibold' : 'text-slate-300'}`}>
                          {isOverdue ? <Clock className="h-3.5 w-3.5" /> : null}
                          <span>{formatDateBr(launch.due_date)}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-200">{launch.description}</td>
                      <td className="py-3 px-4">
                        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
                          {launch.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{launch.beneficiary || 'N/A'}</td>
                      <td className="py-3 px-4 text-right font-semibold font-mono text-slate-100">
                        {formatCurrency(launch.value)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => startEditing(launch)}
                            className="rounded-lg border border-slate-800 bg-slate-900/60 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                            title="Editar Lançamento"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => triggerDeleteConfirm(launch)}
                            className="rounded-lg border border-slate-800 bg-slate-900/60 p-1.5 text-rose-400 hover:bg-rose-950/30 hover:border-rose-900/50 transition-colors"
                            title="Excluir Lançamento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onQuickPay(launch.id)}
                            className="inline-flex items-center space-x-1 rounded-lg bg-emerald-600/15 border border-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-600/30 transition-all hover:scale-101"
                            title="Confirmar Pagamento"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>Pagar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-8 text-center text-slate-500 text-sm flex flex-col items-center space-y-2">
              <CheckCircle className="h-8 w-8 text-emerald-500/50" />
              <span>Nenhuma conta pendente para o mês atual. Tudo pago!</span>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Dialog: Edit Form Overlay */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Editar Lançamento"
        size="md"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 text-slate-200">
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

          {/* Payment Method */}
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
              onClick={() => setIsEditModalOpen(false)}
              className="rounded-xl border border-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-850 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      </Modal>

      {/* Dialog: Confirm Delete Modal */}
      <Modal
        isOpen={confirmDeleteModal.isOpen}
        onClose={() => setConfirmDeleteModal(prev => ({ ...prev, isOpen: false }))}
        title={confirmDeleteModal.title}
        size="sm"
      >
        <div className="space-y-4 text-slate-200 text-center py-2">
          <p className="text-sm text-slate-300 leading-relaxed">
            {confirmDeleteModal.message}
          </p>
          <div className="flex items-center justify-center space-x-3 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setConfirmDeleteModal(prev => ({ ...prev, isOpen: false }))}
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
          </div>
        </div>
      </Modal>
    </div>
  );
}
