/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type LaunchType = 'receita' | 'despesa_fixa' | 'despesa_variavel' | 'divida_parcelamento';
export type LaunchStatus = 'pendente' | 'pago' | 'atrasado';
export type PaymentMethod = 'pix' | 'boleto' | 'cartao' | 'debito_automatico' | 'dinheiro';
export type LaunchOrigin = 'planilha' | 'pdf' | 'manual' | 'itau_statement' | 'extrato' | 'extrato_bradesco' | 'extrato_nubank' | 'extrato_itau';

export interface Launch {
  id: number;
  type: LaunchType;
  category: string;
  category_id?: number;
  subcategory?: string;
  description: string;
  beneficiary?: string;
  value: number;
  due_date?: string; // YYYY-MM-DD
  competence_month: number; // 1-12
  competence_year: number;
  status: LaunchStatus;
  payment_method?: PaymentMethod;
  installment_current?: number;
  installment_total?: number;
  origin: LaunchOrigin;
  pdf_path?: string;
  doc_number?: string;
  barcode?: string;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  type: 'receita' | 'despesa';
  budget_target?: number;
}

export interface HomeMember {
  id: number;
  name: string;
}

export interface Member {
  id: number;
  name: string;
}

export interface BeneficiaryRule {
  id: number;
  beneficiary: string;
  suggested_category: string;
  suggested_category_id: number;
}

export interface AiCache {
  cache_key: string;
  response: string;
  created_at: string;
}

export interface AICacheEntry {
  cache_key: string;
  response: string;
  created_at: string;
}

export interface DbSchema {
  launches: Launch[];
  categories: Category[];
  home_members: HomeMember[];
  beneficiary_rules: BeneficiaryRule[];
  ai_cache: AiCache[];
  goals: Goal[];
  goal_scenarios: GoalScenario[];
}

export interface Summary {
  receita_total: number;
  despesa_total: number;
  despesa_fixa: number;
  despesa_variavel: number;
  saldo: number;
  overdue_count: number;
  warning_count: number;
}

export interface CategoryBreakdown {
  category: string;
  value: number;
}

export interface HistoricalMonth {
  month_label: string; // "Jan/26"
  receitas: number;
  despesas: number;
  saldo: number;
}

export interface DebtListItem {
  id: number;
  description: string;
  installment: string; // "3/12"
  value: number;
  remaining_value: number;
  estimated_end: string;
}

export interface DebtsSummary {
  total_estimated: number;
  list: DebtListItem[];
}

export interface DashboardData {
  summary: Summary;
  categories_breakdown: CategoryBreakdown[];
  pending_bills: Launch[];
  historical_data: HistoricalMonth[];
  debts: DebtsSummary;
}

export interface BudgetStatus {
  category: string;
  target: number;
  spent: number;
  exceeded: boolean;
  type: 'receita' | 'despesa';
}

export interface MarketData {
  usd: number;
  eur: number;
  btc: number;
  ibovespa: number;
  updated_at: string;
}

export interface Projection {
  month_label: string;
  receita_prevista: number;
  despesa_prevista: number;
  saldo_previsto: number;
}

export interface DuplicateGroup {
  id: string; // unique group id
  level: 'exact' | 'fuzzy' | 'same_value';
  launches: Launch[];
}

// Goal Planner Types
export type GoalStatus = 'active' | 'completed' | 'cancelled';
export type ScenarioType = 'financing' | 'savings' | 'hybrid';

export interface Goal {
  id: number;
  name: string;
  description?: string;
  target_value: number;
  current_saved: number;
  monthly_contribution: number;
  start_date: string; // YYYY-MM-DD
  target_date?: string; // YYYY-MM-DD
  priority: number; // 1=Alta, 2=Média, 3=Baixa
  status: GoalStatus;
  category?: string;
  category_id?: number;
  created_at: string;
  updated_at: string;
}

export interface GoalScenario {
  id: number;
  goal_id: number;
  scenario_type: ScenarioType;
  total_value?: number;
  down_payment?: number;
  installments?: number;
  installment_value?: number;
  interest_rate?: number;
  total_cost?: number;
}

export interface SuggestedCut {
  category: string;
  current: number;
  suggested: number;
  saving: number;
}

export interface AlternativeScenario {
  target_date: string;
  monthly_needed: number;
}

export interface Feasibility {
  possible: boolean;
  reason: string;
  suggested_cuts: SuggestedCut[];
  alternative_scenario?: AlternativeScenario;
}

export interface ProjectionItem {
  month: string;
  accumulated: number;
  contribution: number;
}

export interface GoalAnalysis {
  goal: Goal;
  current_financials: {
    avg_monthly_income: number;
    avg_monthly_expenses: number;
    free_cash: number;
    essential_expenses: number;
    discretionary_expenses: number;
  };
  required_monthly: number;
  feasibility: Feasibility;
  projection: ProjectionItem[];
  ai_advice: string;
}

// Authentication
export interface AdminUser {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface AuthToken {
  id: number;
  token: string;
  label?: string;
  created_at: string;
  last_used_at?: string;
  used_at?: string;
  device_id?: string;
}

export interface AppUser {
  id: number;
  username: string;
  password_hash: string;
  device_id: string;
  session_token?: string;
  created_at: string;
}
