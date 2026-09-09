export interface RecommendationFallbackOptions {
  net: number;
  income: number;
  fixed: number;
  variable: number;
  launchesCount: number;
  categoriesCount: number;
}

export interface GoalAnalysisFallbackOptions {
  goalName: string;
  targetValue: number;
  currentSaved: number;
  requiredMonthly: number;
  feasible: boolean;
  freeCash: number;
  suggestedCuts: Array<{ category: string; current: number; suggested: number; saving: number }>;
  alternativeScenario?: { target_date?: string; monthly_needed?: number };
}

export interface ReserveAnalysisFallbackOptions {
  reserveTarget: number;
  currentSaved: number;
  monthlySaving: number;
  remaining: number;
  monthsToComplete: number | null;
  goalsCount: number;
  isManual: boolean;
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export function buildRecommendationFallbackAdvice(options: RecommendationFallbackOptions) {
  const { net, income, fixed, variable, launchesCount, categoriesCount } = options;

  let advice = `### 📊 Diagnóstico Financeiro Offline
Seu saldo líquido de **${formatCurrency(net)}** está sob controle.

#### Recomendações Básicas:
1. **Reserva de Emergência:** Tente poupar pelo menos **15% a 20%** de sua renda mensal de ${formatCurrency(income)}. Atualmente você tem ${formatCurrency(fixed)} alocados em despesas fixas.
2. **Método 50-30-20:** Distribua seus gastos focando em 50% para necessidades, 30% para desejos e 20% para investimentos.
3. **Cartão de Crédito:** Monitore os parcelamentos ativos para que não acumulem e tomem todo o seu orçamento futuro.

**Resumo do mês:** ${launchesCount} lançamentos em ${categoriesCount} categorias.`;

  if (net < 0) {
    advice = `### ⚠️ Alerta de Orçamento Negativo
Seu saldo está negativo em **${formatCurrency(net)}** para este mês!

#### Ações Urgentes Recomendadas:
1. **Corte Despesas Variáveis:** Suas despesas variáveis somam **${formatCurrency(variable)}**. Reduza jantares, assinaturas não utilizadas e compras por impulso imediatamente.
2. **Negocie Dívidas:** Analise seus parcelamentos e empréstimos ativos para tentar portabilidade ou descontos para quitação.
3. **Evite Cheque Especial:** Taxas de juros no Brasil são altíssimas. Use PIX ou dinheiro para controlar a saída de caixa em tempo real.
`;
  } else if (net > 3000) {
    advice = `### 🚀 Excelente Desempenho Financeiro
Parabéns! Sobrou um saldo super positivo de **${formatCurrency(net)}**.

#### Dicas de Multiplicação de Patrimônio:
1. **Tesouro Selic / CDB Liquidez Diária:** Deixe sua reserva de emergência rendendo de forma segura.
2. **Aporte em Investimentos:** Considere diversificar parte deste saldo em renda variável, fundos imobiliários ou previdência privada se sua reserva já estiver completa (6 meses de custos fixos).
3. **Quitação Antecipada:** Se tiver parcelamentos ou empréstimos ativos, use esse dinheiro para quitar parcelas de trás para frente, ganhando descontos em juros.
`;
  }

  return advice;
}

export function buildGoalAnalysisOfflineAdvice(options: GoalAnalysisFallbackOptions) {
  const {
    goalName,
    targetValue,
    currentSaved,
    requiredMonthly,
    feasible,
    freeCash,
    suggestedCuts,
    alternativeScenario
  } = options;

  const remaining = Math.max(0, targetValue - currentSaved);
  const statusLabel = feasible ? 'viável' : 'não é viável';
  const progress = targetValue > 0 ? ((currentSaved / targetValue) * 100).toFixed(0) : '0';

  let advice = `### 🎯 Análise Offline do Objetivo
O objetivo **${goalName}** está **${statusLabel}** com o cenário atual.

- Valor alvo: **${formatCurrency(targetValue)}**
- Valor já guardado: **${formatCurrency(currentSaved)}**
- Faltam: **${formatCurrency(remaining)}**
- Aporte mensal necessário: **${formatCurrency(requiredMonthly)}**
- Dinheiro livre disponível: **${formatCurrency(freeCash)}**
- Progresso atual: **${progress}%** do alvo

#### Próximos passos
1. Defina um aporte automático mensal para não depender de sobra no fim do mês.
2. Revise despesas discricionárias e priorize o objetivo até o prazo definido.
3. Se necessário, reduza o valor do objetivo ou estenda o prazo para manter o plano realista.
`;

  if (!feasible) {
    advice += `\n#### Ajustes recomendados\n- O aporte mensal necessário de **${formatCurrency(requiredMonthly)}** é maior do que o dinheiro livre disponível de **${formatCurrency(freeCash)}**.\n`;
  }

  if (suggestedCuts.length > 0) {
    advice += `\n#### Cortes sugeridos\n${suggestedCuts
      .slice(0, 3)
      .map(cut => `- **${cut.category}**: reduzir cerca de **${formatCurrency(cut.saving)}** por mês.`)
      .join('\n')}\n`;
  }

  if (alternativeScenario?.target_date) {
    advice += `\n#### Cenário alternativo\n- Novo prazo sugerido: **${alternativeScenario.target_date}**\n`;
  }

  if (alternativeScenario?.monthly_needed) {
    advice += `- Aporte mensal necessário no cenário alternativo: **${formatCurrency(alternativeScenario.monthly_needed)}**\n`;
  }

  return advice;
}

export function buildReserveAnalysisOfflineAdvice(options: ReserveAnalysisFallbackOptions) {
  const {
    reserveTarget,
    currentSaved,
    monthlySaving,
    remaining,
    monthsToComplete,
    goalsCount,
    isManual
  } = options;

  const percentage = reserveTarget > 0 ? ((currentSaved / reserveTarget) * 100).toFixed(0) : '0';
  const monthsText = monthsToComplete !== null && Number.isFinite(monthsToComplete)
    ? `${monthsToComplete} meses`
    : 'indefinido';

  return `### 🛡️ Análise da Reserva de Emergência (Offline)
- **Alvo:** ${formatCurrency(reserveTarget)} (${isManual ? 'manual' : '6 meses de custos fixos'})
- **Em mãos:** ${formatCurrency(currentSaved)}
- **Guarda por mês:** ${formatCurrency(monthlySaving)}
- **Situação:** Você já tem ${percentage}% da reserva. Faltam ${formatCurrency(remaining)} e a conclusão estimada é em **${monthsText}**.

#### Conciliação com seus Objetivos
Você tem ${goalsCount} objetivo(s) cadastrados. Priorize a reserva de emergência antes de aportes em objetivos de longo prazo, a menos que o objetivo seja urgente.

#### Próximos passos
1. Mantenha a reserva em investimentos de alta liquidez e baixo risco (Tesouro Selic ou CDB 100% CDI).
2. Se o aporte mensal for muito baixo, revise despesas discricionárias para acelerar a reserva.`;
}
