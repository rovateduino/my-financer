import React, { useState, useEffect } from 'react';
import { Goal, GoalAnalysis, GoalScenario } from '../types';
import { retryFetch } from '../utils';
import Modal from './Modal';
import GlassCard from './GlassCard';

const GoalsTab: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [analysis, setAnalysis] = useState<GoalAnalysis | null>(null);
  const [scenarios, setScenarios] = useState<GoalScenario[]>([]);
  const [showModal, setShowModal] = useState<'create' | 'edit' | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [formData, setFormData] = useState<Partial<Goal>>({});
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [loadingScenarios, setLoadingScenarios] = useState(false);

  // Fetch goals
  const fetchGoals = async () => {
    try {
      const res = await retryFetch('/api/goals');
      if (res.ok) {
        setGoals(await res.json());
      }
    } catch (err) {
      console.error('Erro ao buscar objetivos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  // Handle create goal
  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await retryFetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(null);
        fetchGoals();
        setFormData({});
      }
    } catch (err) {
      console.error('Erro ao criar objetivo:', err);
    }
  };

  // Handle update goal
  const handleUpdateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const goalId = selectedGoal?.id || formData.id;
    if (!goalId) return;
    try {
      const res = await retryFetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(null);
        setSelectedGoal(null);
        fetchGoals();
        setFormData({});
        if (showDetails) {
          fetchGoalDetails(goalId);
        }
      }
    } catch (err) {
      console.error('Erro ao atualizar objetivo:', err);
    }
  };

  // Handle delete goal
  const handleDeleteGoal = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja excluir este objetivo?')) return;
    try {
      const res = await retryFetch(`/api/goals/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchGoals();
        if (selectedGoal?.id === id) {
          setSelectedGoal(null);
          setShowDetails(false);
        }
      }
    } catch (err) {
      console.error('Erro ao excluir objetivo:', err);
    }
  };

  // Fetch goal details (analysis + scenarios)
  const fetchGoalDetails = async (id: number) => {
    setLoadingAnalysis(true);
    setLoadingScenarios(true);
    try {
      const [analysisRes, scenariosRes] = await Promise.all([
        retryFetch(`/api/goals/${id}/analysis`),
        retryFetch(`/api/goals/${id}/scenarios`)
      ]);
      if (analysisRes.ok) setAnalysis(await analysisRes.json());
      if (scenariosRes.ok) setScenarios(await scenariosRes.json());
    } catch (err) {
      console.error('Erro ao buscar detalhes do objetivo:', err);
    } finally {
      setLoadingAnalysis(false);
      setLoadingScenarios(false);
    }
  };

  // Open goal details
  const openDetails = async (goal: Goal) => {
    setSelectedGoal(goal);
    setShowDetails(true);
    fetchGoalDetails(goal.id);
  };

  // Calculate progress percentage
  const getProgress = (goal: Goal) => {
    return Math.min(100, Math.max(0, (goal.current_saved / goal.target_value) * 100));
  };

  // Get priority color
  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return 'bg-red-500';
      case 2: return 'bg-yellow-500';
      case 3: return 'bg-green-500';
      default: return 'bg-blue-500';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Planejamento de Objetivos</h1>
          <p className="text-gray-400">Planeje e acompanhe suas metas financeiras</p>
        </div>
        <button
          onClick={() => {
            setFormData({
              start_date: new Date().toISOString().split('T')[0],
              priority: 1,
              status: 'active',
              monthly_contribution: 0,
              current_saved: 0
            });
            setShowModal('create');
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Novo Objetivo
        </button>
      </div>

      {/* Goals list */}
      {loading ? (
        <div className="text-center text-gray-400 py-8">Carregando...</div>
      ) : goals.length === 0 ? (
        <GlassCard className="text-center py-12">
          <p className="text-gray-400 mb-4">Você ainda não tem objetivos cadastrados.</p>
          <button
              onClick={() => {
                setFormData({
                  start_date: new Date().toISOString().split('T')[0],
                  priority: 1,
                  status: 'active',
                  monthly_contribution: 0,
                  current_saved: 0
                });
                setShowModal('create');
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Criar Primeiro Objetivo
            </button>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map(goal => (
            <GlassCard key={goal.id} className="cursor-pointer">
              <div onClick={() => openDetails(goal)}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-white">{goal.name}</h3>
                    <p className="text-sm text-gray-400">{goal.description}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs text-white ${getPriorityColor(goal.priority)}`}>
                    {goal.priority === 1 ? 'Alta' : goal.priority === 2 ? 'Média' : 'Baixa'}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-300">
                    <span>Progresso</span>
                    <span>{getProgress(goal).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${getProgress(goal)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">
                      R$ {goal.current_saved.toFixed(2)}</span>
                    <span className="text-gray-400">
                      de R$ {goal.target_value.toFixed(2)}
                    </span>
                  </div>
                </div>

                {goal.target_date && (
                  <div className="mt-3 text-xs text-gray-500">
                    Prazo: {new Date(goal.target_date).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedGoal(goal);
                    setFormData(goal);
                    setShowModal('edit');
                  }}
                  className="flex-1 px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-lg transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteGoal(goal.id);
                  }}
                  className="flex-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                >
                  Excluir
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal !== null}
        onClose={() => {
          setShowModal(null);
          setFormData({});
        }}
        title={showModal === 'create' ? 'Novo Objetivo' : 'Editar Objetivo'}
      >
        <form onSubmit={showModal === 'create' ? handleCreateGoal : handleUpdateGoal} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Nome</label>
            <input
              type="text"
              required
              value={formData.name ?? ''}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              placeholder="Ex: Carro Novo"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
            <textarea
              value={formData.description ?? ''}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              rows={3}
              placeholder="Descrição do objetivo (opcional)"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Valor Alvo (R$)</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.target_value ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  setFormData({ ...formData, target_value: v === '' ? undefined : parseFloat(v) });
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="80000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Valor Já Economizado (R$)</label>
              <input
                type="number"
                step="0.01"
                value={formData.current_saved ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  setFormData({ ...formData, current_saved: v === '' ? undefined : parseFloat(v) });
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="5000"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Contribuição Mensal (R$)</label>
            <input
              type="number"
              step="0.01"
              value={formData.monthly_contribution ?? ''}
              onChange={e => {
                const v = e.target.value;
                setFormData({ ...formData, monthly_contribution: v === '' ? undefined : parseFloat(v) });
              }}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              placeholder="1000"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Data de Início</label>
              <input
                type="date"
                required
                value={formData.start_date ?? ''}
                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Data Alvo (opcional)</label>
              <input
                type="date"
                value={formData.target_date ?? ''}
                onChange={e => setFormData({ ...formData, target_date: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Prioridade</label>
              <select
                value={formData.priority ?? 1}
                onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value={1}>Alta</option>
                <option value={2}>Média</option>
                <option value={3}>Baixa</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
              <select
                value={formData.status ?? 'active'}
                onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="active">Ativo</option>
                <option value="completed">Concluído</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setShowModal(null);
                setFormData({});
              }}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              {showModal === 'create' ? 'Criar' : 'Atualizar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Goal Details Modal */}
      <Modal
        isOpen={showDetails}
        onClose={() => {
          setShowDetails(false);
          setSelectedGoal(null);
          setAnalysis(null);
          setScenarios([]);
        }}
        title={selectedGoal?.name || 'Detalhes do Objetivo'}
        size="lg"
      >
        {loadingAnalysis || loadingScenarios ? (
          <div className="text-center text-gray-400 py-8">Carregando análise...</div>
        ) : analysis ? (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <GlassCard>
                <h3 className="text-sm text-gray-400 mb-1">Valor Alvo</h3>
                <p className="text-2xl font-bold text-white">R$ {analysis.goal.target_value.toFixed(2)}</p>
              </GlassCard>
              <GlassCard>
                <h3 className="text-sm text-gray-400 mb-1">Valor Já Economizado</h3>
                <p className="text-2xl font-bold text-green-400">R$ {analysis.goal.current_saved.toFixed(2)}</p>
              </GlassCard>
              <GlassCard>
                <h3 className="text-sm text-gray-400 mb-1">Valor Mensal Necessário</h3>
                <p className="text-2xl font-bold text-blue-400">R$ {analysis.required_monthly.toFixed(2)}</p>
              </GlassCard>
            </div>

            {/* Feasibility */}
            <GlassCard className={`border-l-4 border-l-blue-500`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-3 h-3 rounded-full ${analysis.feasibility.possible ? 'bg-green-500' : 'bg-red-500'}`} />
                <h3 className="font-semibold text-white">
                  {analysis.feasibility.possible ? 'Objetivo Viável' : 'Objetivo Não Viável'}
                </h3>
              </div>
              <p className="text-gray-400">{analysis.feasibility.reason}</p>
            </GlassCard>

            {/* Suggested Cuts */}
            {analysis.feasibility.suggested_cuts.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Sugestões de Cortes de Gastos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {analysis.feasibility.suggested_cuts.map((cut, index) => (
                    <GlassCard key={index} className="p-3">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-white">{cut.category}</span>
                        <span className="text-green-400">Economia de R$ {cut.saving.toFixed(2)}</span>
                      </div>
                      <div className="text-sm text-gray-400">De R$ {cut.current.toFixed(2)} → R$ {cut.suggested.toFixed(2)}</div>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {/* AI Advice */}
            <GlassCard>
              <h3 className="text-lg font-semibold text-white mb-3">Conselho do Orientador Financeiro</h3>
              <div className="text-gray-300 whitespace-pre-wrap">{analysis.ai_advice}</div>
            </GlassCard>

            {/* Projection Chart Placeholder (simplified table) */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Projeção Mensal</h3>
              <GlassCard className="max-h-64 overflow-y-auto">
                <div className="space-y-2">
                  {analysis.projection.map((item, index) => (
                    <div key={index} className="flex justify-between items-center border-b border-gray-700 pb-2 last:border-b-0">
                      <span className="text-gray-300">{item.month}</span>
                      <span className="font-medium text-white">Acumulado: R$ {item.accumulated.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>

            {/* Scenarios */}
            {scenarios.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Cenários</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {scenarios.map(scenario => (
                    <GlassCard key={scenario.id} className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 bg-purple-600 text-white text-xs rounded-full">
                          {scenario.scenario_type === 'financing' ? 'Financiamento' : scenario.scenario_type === 'savings' ? 'Economia' : 'Híbrido'}
                        </span>
                      </div>
                      {scenario.down_payment !== undefined && (
                        <div className="text-sm text-gray-400">Entrada: R$ {scenario.down_payment.toFixed(2)}</div>
                      )}
                      {scenario.installments && (
                        <div className="text-sm text-gray-400">Parcelas: {scenario.installments}x</div>
                      )}
                      {scenario.installment_value !== undefined && (
                        <div className="text-lg font-semibold text-white mt-1">
                          Parcela: R$ {scenario.installment_value.toFixed(2)}</div>
                      )}
                      {scenario.total_cost !== undefined && (
                        <div className="text-sm text-gray-400">Custo Total: R$ {scenario.total_cost.toFixed(2)}</div>
                      )}
                  </GlassCard>
                ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-700">
              <button
                onClick={() => {
                  setFormData(selectedGoal || {});
                  setShowModal('edit');
                }}
                className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg"
              >
                Editar
              </button>
              <button
                onClick={() => handleDeleteGoal(selectedGoal!.id)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Excluir
              </button>
              <button
                onClick={() => {
                  setShowDetails(false);
                  setSelectedGoal(null);
                  setAnalysis(null);
                  setScenarios([]);
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default GoalsTab;
