/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  CalendarDays, 
  FileSpreadsheet, 
  PiggyBank, 
  Sparkles, 
  Settings, 
  Cpu, 
  Clock, 
  HelpCircle,
  Menu,
  X,
  Target,
  PanelLeftClose,
  PanelRightOpen,
  LogOut
} from 'lucide-react';

// Simple hook for localStorage persistence (works in Electron too)
function usePersistentState<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = typeof value === 'function' ? (value as (prev: T) => T)(state) : value;
      setState(valueToStore);
      localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  return [state, setValue];
}

// Tabs Components
import DashboardTab from './components/DashboardTab.js';
import LaunchesTab from './components/LaunchesTab.js';
import ImportTab from './components/ImportTab.js';
import BudgetsTab from './components/BudgetsTab.js';
import AdvisorTab from './components/AdvisorTab.js';
import SettingsTab from './components/SettingsTab.js';
import GoalsTab from './components/GoalsTab.js';
import CommandPalette from './components/CommandPalette.js';
import ToastContainer, { Toast, ToastType } from './components/Toast.js';
import LoginScreen from './components/LoginScreen.js';

// Types and Utilities
import { Launch, Category, HomeMember, BeneficiaryRule, DuplicateGroup, DashboardData } from './types.js';
import { retryFetch, getStoredToken, setStoredToken } from './utils.js';

export default function App() {
  const [authStatus, setAuthStatus] = useState<'checking' | 'loggedOut' | 'loggedIn'>('checking');
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Validate stored token on startup
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthStatus('loggedOut');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/auth/validate', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setAuthStatus('loggedIn');
        } else {
          setStoredToken(null);
          setAuthStatus('loggedOut');
        }
      } catch {
        setAuthStatus('loggedOut');
      }
    })();
  }, []);

  const handleLogout = () => {
    setStoredToken(null);
    setAuthStatus('loggedOut');
    setActiveTab('dashboard');
  };
  const logSetActiveTab = (newTab: string) => {
    console.log('logSetActiveTab called! New tab:', newTab, 'Stack trace:', new Error().stack);
    setActiveTab(newTab);
    // Refresh data when switching to relevant tabs to get fresh data
    if (newTab === 'launches' || newTab === 'dashboard') {
      refreshFinancials();
    }
    if (newTab === 'budgets') {
      fetchBudgets();
    }
    if (newTab === 'advisor' && !advice) {
      fetchAdvice();
    }
    if (newTab === 'settings') {
      fetchConfig();
    }
  };
  
  useEffect(() => {
    console.log('activeTab changed to:', activeTab);
  }, [activeTab]);

  // Core Data State
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<HomeMember[]>([]);
  const [rules, setRules] = useState<BeneficiaryRule[]>([]);
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [viewAllMonths, setViewAllMonths] = useState<boolean>(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [advice, setAdvice] = useState<string>('');
  const [budgets, setBudgets] = useState<any[]>([]);

  // Loading States
  const [loadingDashboard, setLoadingDashboard] = useState<boolean>(true);
  const [loadingAdvice, setLoadingAdvice] = useState<boolean>(false);
  const [loadingDuplicates, setLoadingDuplicates] = useState<boolean>(false);

  // Layout UI State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = usePersistentState<boolean>('my-financer.sidebar.collapsed', false);
  const [currentTime, setCurrentTime] = useState<string>('');
  
  // Toast Notifications State
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdCounter = React.useRef(0);

  const addToast = (type: ToastType, message: string, duration?: number) => {
    const id = toastIdCounter.current++;
    setToasts(prev => [...prev, { id, type, message, duration }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  useEffect(() => {
    const handleAuthExpired = () => {
      setToasts([]);
      setAuthStatus('loggedOut');
    };

    window.addEventListener('my-financer-auth-expired', handleAuthExpired);
    return () => window.removeEventListener('my-financer-auth-expired', handleAuthExpired);
  }, []);

  // Dynamic Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);



  // Fetch Budgets (Category limits vs spending)
  const fetchBudgets = async () => {
    try {
      const res = await retryFetch(`/api/budgets?month=${currentMonth}&year=${currentYear}`);
      if (res.ok) {
        const data = await res.json();
        setBudgets(data);
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao carregar orçamentos');
      }
    } catch (err) {
      console.error('Erro ao buscar orçamentos:', err);
      addToast('error', 'Erro de conexão ao carregar orçamentos');
    }
  };

  const refreshFinancials = () => {
    fetchDashboard();
    fetchLaunches();
    fetchBudgets();
  };

  // Fetch configs (Categories, Members, Rules)
  const fetchConfig = async () => {
    try {
      const res = await retryFetch('/api/v1/config');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        setMembers(data.members || []);
        setRules(data.rules || []);
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao carregar configurações');
      }
    } catch (err) {
      console.error('Erro ao buscar configurações:', err);
      addToast('error', 'Erro de conexão ao carregar configurações');
    }
  };

  // Fetch Dashboard (also returns summaries, pie charts, and pending list)
  const fetchDashboard = async () => {
    setLoadingDashboard(true);
    try {
      const res = await retryFetch(`/api/dashboard?month=${currentMonth}&year=${currentYear}`);
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao carregar dados do painel');
      }
    } catch (err) {
      console.error('Erro ao buscar dados do painel:', err);
      addToast('error', 'Erro de conexão ao carregar dados do painel');
    } finally {
      setLoadingDashboard(false);
    }
  };

  // Fetch Launches for the active month or all launches
  const fetchLaunches = async () => {
    try {
      const url = viewAllMonths 
        ? `/api/v1/launches?all=true`
        : `/api/v1/launches?month=${currentMonth}&year=${currentYear}`;
      const res = await retryFetch(url);
      if (res.ok) {
        const data = await res.json();
        setLaunches(Array.isArray(data) ? data : (data.launches || []));
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao carregar lançamentos');
      }
    } catch (err) {
      console.error('Erro ao buscar lançamentos:', err);
      addToast('error', 'Erro de conexão ao carregar lançamentos');
    }
  };

  // Fetch Advisor recommendations (cached) - fails gracefully
  const fetchAdvice = async () => {
    setLoadingAdvice(true);
    try {
      const res = await retryFetch(`/api/recommendations?month=${currentMonth}&year=${currentYear}`);
      if (res.ok) {
        const data = await res.json();
        setAdvice(typeof data.advice === 'string' ? data.advice : '');
      } else {
        const err = await res.json();
        addToast('warning', `Falha ao carregar conselhos: ${err.error || 'Erro desconhecido'}`);
        setAdvice('');
      }
    } catch (err) {
      console.error('Erro ao buscar recomendações:', err);
      addToast('warning', 'Falha ao conectar com a IA, modo offline ativado');
      setAdvice('');
    } finally {
      setLoadingAdvice(false);
    }
  };

  // Fetch Potential Duplicates in real-time
  const fetchDuplicates = async () => {
    setLoadingDuplicates(true);
    try {
      const res = await retryFetch(`/api/launches/duplicates/all?month=${currentMonth}&year=${currentYear}`);
      if (res.ok) {
        const data = await res.json();
        setDuplicateGroups(Array.isArray(data) ? data : (data.duplicate_groups || []));
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao carregar duplicatas');
      }
    } catch (err) {
      console.error('Erro ao buscar duplicatas:', err);
      addToast('error', 'Erro de conexão ao carregar duplicatas');
    } finally {
      setLoadingDuplicates(false);
    }
  };

  // Trigger loading of all data on month/year changes
  useEffect(() => {
    if (authStatus !== 'loggedIn') return;
    fetchConfig();
    refreshFinancials();
  }, [currentMonth, currentYear, authStatus]);

  // Trigger launches update when viewAllMonths changes or when the launches tab is opened
  useEffect(() => {
    if (authStatus !== 'loggedIn') return;
    if (activeTab === 'launches') {
      fetchLaunches();
    }
  }, [activeTab, viewAllMonths, currentMonth, currentYear, authStatus]);

  // Advisor advice updates when active tab changes to "advisor"
  useEffect(() => {
    if (authStatus !== 'loggedIn') return;
    if (activeTab === 'advisor' && !advice) {
      fetchAdvice();
    }
  }, [activeTab, currentMonth, currentYear, authStatus]);

  // Keyboard shortcut listener for Ctrl+K
  useEffect(() => {
    const handleGlobalShortcut = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !isInput) {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, []);

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Actions / Mutations
  const handleTogglePaid = async (id: number) => {
    try {
      const res = await retryFetch(`/api/launches/toggle-paid/${id}`, { method: 'POST' });
      if (res.ok) {
        refreshFinancials();
        addToast('success', 'Status de pagamento atualizado!');
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao atualizar status de pagamento');
      }
    } catch (err) {
      console.error('Erro ao alternar status de pagamento:', err);
      addToast('error', 'Erro de conexão ao atualizar status');
    }
  };

  const handleAddLaunch = async (payload: Omit<Launch, 'id' | 'created_at'>) => {
    try {
      const res = await retryFetch('/api/launches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        refreshFinancials();
        addToast('success', 'Lançamento adicionado!');
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao adicionar lançamento');
      }
    } catch (err) {
      console.error('Erro ao adicionar lançamento:', err);
      addToast('error', 'Erro de conexão ao adicionar lançamento');
    }
  };

  const handleUpdateLaunch = async (id: number, payload: Partial<Omit<Launch, 'id' | 'created_at'>>) => {
    try {
      const res = await retryFetch(`/api/launches/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        refreshFinancials();
        addToast('success', 'Lançamento atualizado!');
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao atualizar lançamento');
      }
    } catch (err) {
      console.error('Erro ao atualizar lançamento:', err);
      addToast('error', 'Erro de conexão ao atualizar lançamento');
    }
  };

  const handleDeleteLaunch = async (id: number) => {
    try {
      const res = await retryFetch(`/api/launches/${id}`, { method: 'DELETE' });
      if (res.ok) {
        refreshFinancials();
        addToast('success', 'Lançamento excluído!');
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao excluir lançamento');
      }
    } catch (err) {
      console.error('Erro ao excluir lançamento:', err);
      addToast('error', 'Erro de conexão ao excluir lançamento');
    }
  };

  const handleDeleteMultipleLaunches = async (ids: number[]) => {
    console.log('handleDeleteMultipleLaunches called with IDs:', ids);
    try {
      const res = await retryFetch('/api/launches/batch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      console.log('Response status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('Response data:', data);
        refreshFinancials();
        addToast('success', `${ids.length} lançamento(s) excluído(s)!`);
      } else {
        const errorData = await res.json();
        console.error('Error from server:', errorData);
        addToast('error', errorData.error || 'Falha ao excluir lançamentos');
      }
    } catch (err) {
      console.error('Erro ao excluir lançamentos:', err);
      addToast('error', 'Erro de conexão ao excluir lançamentos');
    }
  };

  // Smart imports actions
  const handleImportExcel = async (file: File): Promise<{ imported: number; skipped_duplicates: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await retryFetch(`/api/import/excel?month=${currentMonth}&year=${currentYear}`, {
      method: 'POST',
      body: formData
    }, 0, 120000);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || err.message || 'Falha no processamento da planilha');
    }
    refreshFinancials();
    return await res.json();
  };

  const handleImportItau = async (file: File): Promise<{ total_found: number; imported: number; skipped_duplicates: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await retryFetch('/api/import/itau-statement', {
      method: 'POST',
      body: formData
    }, 0, 120000);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || err.message || 'Falha ao importar extrato');
    }
    const data = await res.json();
    
    if (data.detectedMonth && data.detectedYear) {
      setCurrentMonth(data.detectedMonth);
      setCurrentYear(data.detectedYear);
      setTimeout(() => {
        logSetActiveTab('launches');
      }, 500);
    } else {
      refreshFinancials();
    }
    return data;
  };

  const handleExtractPdf = async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await retryFetch('/api/import/pdf', {
      method: 'POST',
      body: formData
    }, 0, 120000);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || err.message || 'Falha ao analisar PDF do boleto');
    }
    return await res.json();
  };

  const handleBatchImport = async (): Promise<any> => {
    const res = await retryFetch('/api/import/batch', {
      method: 'POST'
    }, 0, 120000);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || err.message || 'Falha na importação em lote');
    }
    const data = await res.json();
    refreshFinancials();
    return data;
  };

  // Config / Management mutations
  const handleAddCategory = async (name: string, type: 'receita' | 'despesa', target: number) => {
    try {
      const res = await retryFetch('/api/config/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, budget_target: target })
      });
      if (res.ok) {
        fetchConfig();
        refreshFinancials();
        addToast('success', 'Categoria criada!');
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao criar categoria');
      }
    } catch (err) {
      console.error('Erro ao criar categoria:', err);
      addToast('error', 'Erro de conexão ao criar categoria');
    }
  };

  const handleUpdateCategoryBudget = async (name: string, type: 'receita' | 'despesa', target: number) => {
    console.log('handleUpdateCategoryBudget called with:', { name, target, currentActiveTab: activeTab });
    try {
      const res = await retryFetch('/api/config/categories/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, budget_target: target })
      });
      if (res.ok) {
        console.log('fetch successful, calling fetchConfig and fetchBudgets');
        fetchConfig();
        fetchBudgets();
        addToast('success', 'Meta da categoria atualizada!');
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao atualizar meta');
      }
    } catch (err) {
      console.error('Erro ao atualizar meta da categoria:', err);
      addToast('error', 'Erro de conexão ao atualizar meta');
    }
  };

  const handleDeleteCategory = async (name: string) => {
    try {
      const res = await retryFetch('/api/config/categories/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        fetchConfig();
        refreshFinancials();
        addToast('success', 'Categoria excluída!');
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao excluir categoria');
      }
    } catch (err) {
      throw new Error((err as any)?.message || 'Erro de conexão ao excluir categoria');
    }
  };

  const handleAddMember = async (name: string) => {
    try {
      const res = await retryFetch('/api/config/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        fetchConfig();
        addToast('success', 'Membro adicionado!');
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao adicionar membro');
      }
    } catch (err) {
      console.error('Erro ao adicionar membro:', err);
      addToast('error', 'Erro de conexão ao adicionar membro');
    }
  };

  const handleDeleteMember = async (id: number) => {
    try {
      const safeId = Math.floor(Number(id));
      const res = await retryFetch(`/api/config/members/${safeId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchConfig();
        addToast('success', 'Membro removido!');
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao remover membro');
      }
    } catch (err) {
      throw new Error((err as any)?.message || 'Erro de conexão ao remover membro');
    }
  };

  const handleAddRule = async (beneficiary: string, suggested_category: string) => {
    try {
      const res = await retryFetch('/api/config/rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiary, suggested_category })
      });
      if (res.ok) {
        fetchConfig();
        addToast('success', 'Regra criada!');
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao criar regra');
      }
    } catch (err) {
      console.error('Erro ao criar regra de beneficiário:', err);
      addToast('error', 'Erro de conexão ao criar regra');
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      const safeId = Math.floor(Number(id));
      const res = await retryFetch(`/api/config/rules/${safeId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchConfig();
        addToast('success', 'Regra removida!');
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao remover regra');
      }
    } catch (err) {
      throw new Error((err as any)?.message || 'Erro de conexão ao remover regra');
    }
  };

  const handleClearCache = async () => {
    try {
      const res = await retryFetch('/api/ai-cache/clear', { method: 'POST' });
      if (res.ok) {
        setAdvice('');
        if (activeTab === 'advisor') fetchAdvice();
        addToast('success', 'Cache limpo!');
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao limpar cache');
      }
    } catch (err) {
      console.error('Erro ao limpar cache:', err);
      addToast('error', 'Erro de conexão ao limpar cache');
    }
  };

  const handleRefreshAdvice = async () => {
    await handleClearCache();
  };

  // Programmatic Backup downloads
  const handleExportBackup = async () => {
    try {
      const res = await retryFetch('/api/backup/export');
      if (!res.ok) {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao exportar backup');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'financer_db.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addToast('success', 'Backup exportado!');
    } catch (err) {
      console.error('Erro ao exportar backup:', err);
      addToast('error', 'Erro de conexão ao exportar backup');
    }
  };

  const handleImportBackup = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await retryFetch('/api/backup/import', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        addToast('success', 'Backup restaurado com sucesso!');
        fetchConfig();
        refreshFinancials();
        setAdvice('');
      } else {
        const err = await res.json();
        addToast('error', err.error || `Erro ao restaurar backup`);
      }
    } catch (err) {
      console.error('Erro ao importar backup:', err);
      addToast('error', 'Erro de conexão ao importar backup');
    }
  };

  const handleResetDatabase = async () => {
    try {
      const res = await retryFetch('/api/db/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESETAR_BANCO' })
      });
      if (res.ok) {
        addToast('success', 'Banco resetado com sucesso!');
        fetchConfig();
        refreshFinancials();
        setAdvice('');
      } else {
        const err = await res.json();
        addToast('error', err.error || 'Falha ao resetar o banco');
      }
    } catch (err) {
      console.error('Erro ao resetar banco:', err);
      addToast('error', 'Erro de conexão ao resetar banco');
    }
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => !prev);
  };

  // Nav menu list
  const navItems = [
    { id: 'dashboard', label: 'Painel Geral', icon: LayoutDashboard },
    { id: 'launches', label: 'Lançamentos', icon: CalendarDays },
    { id: 'import', label: 'Importação Inteligente', icon: FileSpreadsheet },
    { id: 'budgets', label: 'Metas e Orçamento', icon: PiggyBank },
    { id: 'goals', label: 'Objetivos', icon: Target },
    { id: 'advisor', label: 'Conselheiro IA', icon: Sparkles },
    { id: 'settings', label: 'Configurações', icon: Settings }
  ];

  if (authStatus !== 'loggedIn') {
    if (authStatus === 'checking') {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
          <div className="flex flex-col items-center space-y-4">
            <span className="rounded-2xl bg-indigo-600 p-4 text-white animate-pulse">
              <Cpu className="h-8 w-8" />
            </span>
            <p className="text-sm text-slate-400">Carregando...</p>
          </div>
        </div>
      );
    }
    return <LoginScreen onAuthenticated={() => setAuthStatus('loggedIn')} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row antialiased">
      {/* Sidebar - Desktop Layout */}
      <aside className="hidden md:flex flex-col bg-slate-900 border-r border-slate-800 shrink-0">
        <div className={`border-b border-slate-800 ${isSidebarCollapsed ? 'p-3' : 'p-6'}`}>
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!isSidebarCollapsed && (
              <div className="flex items-center space-x-2.5">
                <span className="rounded-xl bg-indigo-600 p-2 text-white">
                  <Cpu className="h-5 w-5" />
                </span>
                <div>
                  <h1 className="font-extrabold text-base tracking-tight text-white leading-none">My Financer</h1>
                  <span className="text-[10px] text-indigo-400 font-semibold tracking-wider uppercase mt-0.5 block">Offline & Inteligente</span>
                </div>
              </div>
            )}
            {isSidebarCollapsed && (
              <span className="rounded-xl bg-indigo-600 p-2 text-white">
                <Cpu className="h-5 w-5" />
              </span>
            )}
            <button
              type="button"
              onClick={toggleSidebar}
              className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              title={isSidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
              aria-label={isSidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {isSidebarCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => logSetActiveTab(item.id)}
                className={`flex w-full items-center rounded-xl py-3 text-sm font-semibold transition-all ${
                  isSidebarCollapsed ? 'justify-center px-0' : 'space-x-3.5 px-4'
                } ${
                  isActive 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
                }`}
                title={isSidebarCollapsed ? item.label : undefined}
              >
                <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {!isSidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Command shortcut footer */}
        <div className={`border-t border-slate-800 bg-slate-950/20 text-xxs font-medium text-slate-500 ${isSidebarCollapsed ? 'px-2 py-4 text-center' : 'p-4 text-center'}`}>
          {!isSidebarCollapsed ? (
            <>
              Pressione <kbd className="rounded bg-slate-800 px-1.5 py-0.5 border border-slate-700/50 text-slate-400 font-mono">Ctrl+K</kbd> para comandos
            </>
          ) : (
            <span className="block text-[10px]">Ctrl+K</span>
          )}
        </div>

        {/* Logout */}
        <div className="border-t border-slate-800 p-2.5">
          <button
            type="button"
            onClick={handleLogout}
            className={`flex w-full items-center rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400 ${isSidebarCollapsed ? 'justify-center' : ''}`}
            title="Sair"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!isSidebarCollapsed && <span className="ml-2.5">Sair</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden bg-slate-900 border-b border-slate-800 flex items-center justify-between px-5 py-4 shrink-0">
        <div className="flex items-center space-x-2.5">
          <span className="rounded-xl bg-indigo-600 p-1.5 text-white">
            <Cpu className="h-5 w-5" />
          </span>
          <h1 className="font-extrabold text-sm tracking-tight text-white uppercase">My Financer</h1>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={handleLogout}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
            title="Sair"
          >
            <LogOut className="h-5 w-5" />
          </button>
          <button
            onClick={() => setIsMobileMenuOpen(prev => !prev)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 px-5 py-4 space-y-2 absolute top-[65px] left-0 right-0 z-40 shadow-xl">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { logSetActiveTab(item.id); setIsMobileMenuOpen(false); }}
                  className={`flex w-full items-center space-x-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                    isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-850'
                  }`}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
        </div>
      )}

      {/* Main Content Pane */}
      <main className="grow flex flex-col min-w-0 bg-slate-950">
        {/* Top bar header info */}
        <header className="hidden md:flex items-center justify-between px-8 py-5 border-b border-slate-900 bg-slate-950/10 shrink-0">
          <div>
            <span className="text-xxs font-bold text-indigo-400 uppercase tracking-wider block">Sistema de Controle</span>
            <span className="text-xs text-slate-500 font-medium mt-0.5">Ambiente seguro, offline e local</span>
          </div>

          <div className="flex items-center space-x-6">
            {/* Clock */}
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 bg-slate-900/40 border border-slate-850 px-3.5 py-1.5 rounded-xl font-mono">
              <Clock className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span>{currentTime} Brasília</span>
            </div>
            {/* Resident counts */}
            {members.length > 0 && (
              <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 bg-slate-900/40 border border-slate-850 px-3.5 py-1.5 rounded-xl">
                <span>Residência: {members.length} {members.length === 1 ? 'membro' : 'membros'}</span>
              </div>
            )}
          </div>
        </header>

        {/* Workspace body */}
        <section className="grow p-5 md:p-8 overflow-y-auto">
          <div className="h-full">
            <div style={{ display: activeTab === 'dashboard' ? '' : 'none' }}>
              <DashboardTab
                data={dashboardData}
                loading={loadingDashboard}
                onTogglePaid={handleTogglePaid}
                onQuickPay={handleTogglePaid}
                onNewLaunch={() => { logSetActiveTab('launches'); }}
                currentMonth={currentMonth}
                currentYear={currentYear}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                categories={categories}
                onUpdateLaunch={handleUpdateLaunch}
                onDeleteLaunch={handleDeleteLaunch}
                onDeleteMultipleLaunches={handleDeleteMultipleLaunches}
              />
            </div>
            <div style={{ display: activeTab === 'launches' ? '' : 'none' }}>
              <LaunchesTab
                launches={launches}
                categories={categories}
                currentMonth={currentMonth}
                currentYear={currentYear}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                onAddLaunch={handleAddLaunch}
                onUpdateLaunch={handleUpdateLaunch}
                onDeleteLaunch={handleDeleteLaunch}
                onTogglePaid={handleTogglePaid}
                duplicateGroups={duplicateGroups}
                loadingDuplicates={loadingDuplicates}
                onFetchDuplicates={fetchDuplicates}
                viewAllMonths={viewAllMonths}
                onToggleViewAllMonths={setViewAllMonths}
                onDeleteMultipleLaunches={handleDeleteMultipleLaunches}
              />
            </div>
            <div style={{ display: activeTab === 'import' ? '' : 'none' }}>
              <ImportTab
                categories={categories}
                onImportExcel={handleImportExcel}
                onImportItau={handleImportItau}
                onExtractPdf={handleExtractPdf}
                onConfirmPdfLaunch={handleAddLaunch}
                onBatchImport={handleBatchImport}
                addToast={addToast}
              />
            </div>
            <div style={{ display: activeTab === 'budgets' ? '' : 'none' }}>
              <BudgetsTab
                budgets={budgets}
                onUpdateCategoryBudget={handleUpdateCategoryBudget}
                categories={categories}
              />
            </div>
            <div style={{ display: activeTab === 'goals' ? '' : 'none' }}>
              <GoalsTab />
            </div>
            <div style={{ display: activeTab === 'advisor' ? '' : 'none' }}>
              <AdvisorTab
                data={dashboardData}
                advice={advice}
                loadingAdvice={loadingAdvice}
                onRefreshAdvice={handleRefreshAdvice}
                currentMonth={currentMonth}
                currentYear={currentYear}
              />
            </div>
            <div style={{ display: activeTab === 'settings' ? '' : 'none' }}>
              <SettingsTab
                categories={categories}
                members={members}
                rules={rules}
                onAddCategory={handleAddCategory}
                onDeleteCategory={handleDeleteCategory}
                onAddMember={handleAddMember}
                onDeleteMember={handleDeleteMember}
                onAddRule={handleAddRule}
                onDeleteRule={handleDeleteRule}
                onClearCache={handleClearCache}
                onExportBackup={handleExportBackup}
                onImportBackup={handleImportBackup}
                onResetDatabase={handleResetDatabase}
              />
            </div>
          </div>
        </section>
      </main>

      {/* Command Palette Keyboard Triggered */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        setTab={logSetActiveTab}
        onNewLaunch={() => { logSetActiveTab('launches'); }}
        onClearCache={handleClearCache}
      />
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}