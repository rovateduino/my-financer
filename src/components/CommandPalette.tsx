/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Search, Navigation, Plus, Flame, Settings, Sparkles, FileUp, Calendar } from 'lucide-react';

interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  icon: React.ComponentType<any>;
  action: () => void;
}

interface CommandPaletteProps {
  id?: string;
  isOpen: boolean;
  onClose: () => void;
  setTab: (tab: string) => void;
  onNewLaunch: () => void;
  onClearCache: () => void;
}

export default function CommandPalette({ id, isOpen, onClose, setTab, onNewLaunch, onClearCache }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);

  const commands: CommandItem[] = [
    {
      id: 'go-dashboard',
      title: 'Ir para Painel Geral',
      subtitle: 'Visualizar resumos, gráficos e contas pendentes',
      category: 'Navegação',
      icon: Navigation,
      action: () => { setTab('dashboard'); onClose(); }
    },
    {
      id: 'go-launches',
      title: 'Ir para Lançamentos do Mês',
      subtitle: 'Ver, editar e conciliar lançamentos',
      category: 'Navegação',
      icon: Calendar,
      action: () => { setTab('launches'); onClose(); }
    },
    {
      id: 'go-import',
      title: 'Ir para Importar Arquivo',
      subtitle: 'Importar boletos PDF ou planilhas Excel',
      category: 'Navegação',
      icon: FileUp,
      action: () => { setTab('import'); onClose(); }
    },
    {
      id: 'go-budgets',
      title: 'Ir para Limites de Orçamento',
      subtitle: 'Gerenciar metas de gastos por categoria',
      category: 'Navegação',
      icon: Settings,
      action: () => { setTab('budgets'); onClose(); }
    },
    {
      id: 'go-advisor',
      title: 'Ir para Recomendações da IA',
      subtitle: 'Consultar planejamento estratégico da IA',
      category: 'Navegação',
      icon: Sparkles,
      action: () => { setTab('advisor'); onClose(); }
    },
    {
      id: 'go-settings',
      title: 'Ir para Configurações',
      subtitle: 'Membros da casa, categorias, regras e backup',
      category: 'Navegação',
      icon: Settings,
      action: () => { setTab('settings'); onClose(); }
    },
    {
      id: 'action-new-launch',
      title: 'Criar Novo Lançamento',
      subtitle: 'Adicionar receita ou despesa manualmente',
      category: 'Ações Rápidas',
      icon: Plus,
      action: () => { onNewLaunch(); onClose(); }
    },
    {
      id: 'action-clear-cache',
      title: 'Limpar Cache da IA',
      subtitle: 'Forçar geração de novos insights financeiros',
      category: 'Ações Rápidas',
      icon: Flame,
      action: () => { onClearCache(); onClose(); }
    }
  ];

  const filteredCommands = commands.filter(item =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.subtitle.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (!isInput && e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  useEffect(() => {
    if (itemsContainerRef.current) {
      const selectedEl = itemsContainerRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  return (
    <>
      {isOpen && (
        <div id={id} className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]">
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-xs"
          />

          {/* Dialog Body */}
          <div
            className="relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-slate-800 bg-slate-900/95 shadow-2xl backdrop-blur-md"
          >
            {/* Input Wrapper */}
            <div className="flex items-center border-b border-slate-800 px-4 py-3.5">
              <Search className="h-5 w-5 text-slate-400 mr-3" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Digite um comando ou navegação... (ex: 'painel', 'novo')"
                className="w-full bg-transparent text-slate-100 placeholder-slate-400 focus:outline-none text-base"
              />
              <span className="rounded border border-slate-700 px-1.5 py-0.5 text-xxs font-semibold text-slate-400 uppercase tracking-wide">
                ESC
              </span>
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto py-2" ref={itemsContainerRef}>
              {filteredCommands.length > 0 ? (
                filteredCommands.map((item, index) => {
                  const Icon = item.icon;
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`flex w-full items-center px-4 py-3 text-left transition-colors ${
                        isSelected ? 'bg-indigo-600/20 text-indigo-200 border-l-2 border-indigo-500' : 'text-slate-300 border-l-2 border-transparent'
                      }`}
                    >
                      <Icon className={`h-5 w-5 mr-4 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                      <div className="grow">
                        <div className="flex items-center justify-between">
                          <span className={`font-medium ${isSelected ? 'text-slate-100' : 'text-slate-200'}`}>{item.title}</span>
                          <span className="text-xxs font-medium uppercase tracking-wider text-slate-500">{item.category}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{item.subtitle}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-6 text-center text-slate-500 text-sm">
                  Nenhum comando ou navegação encontrado para "{query}"
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2.5 bg-slate-950/40 text-xxs font-semibold tracking-wider text-slate-500">
              <div className="flex items-center space-x-4">
                <span>Navegar: <kbd className="rounded border border-slate-800 px-1">↓</kbd> <kbd className="rounded border border-slate-800 px-1">↑</kbd></span>
                <span>Selecionar: <kbd className="rounded border border-slate-800 px-1">Enter</kbd></span>
              </div>
              <span>Atalhos rápidos do My Financer</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
