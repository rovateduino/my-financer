const singularRules: Record<string, string> = {
  'dizimos': 'dizimo',
  'dízimos': 'dízimo',
  'dizimo': 'dizimo',
  'dízimo': 'dízimo',
  'contas': 'conta',
  'contas de consumo': 'conta de consumo',
  'pagamentos': 'pagamento',
  'pagamentos da': 'pagamento da',
  'luzes': 'luz'
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularizeToken(token: string): string {
  if (token.endsWith('s') && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

export function stringsAreSimilar(s1: string, s2: string): boolean {
  const norm1 = normalizeText(s1);
  const norm2 = normalizeText(s2);
  if (!norm1 || !norm2) return false;
  if (norm1 === norm2) return true;

  const normalized1 = singularRules[norm1] || norm1;
  const normalized2 = singularRules[norm2] || norm2;
  if (normalized1 === normalized2) return true;

  const tokens1 = normalized1.split(' ').map(singularizeToken);
  const tokens2 = normalized2.split(' ').map(singularizeToken);

  const set1 = new Set(tokens1.filter(Boolean));
  const set2 = new Set(tokens2.filter(Boolean));

  const intersection = new Set([...set1].filter(token => set2.has(token)));
  const union = new Set([...set1, ...set2]);
  const score = union.size > 0 ? intersection.size / union.size : 0;

  return score >= 0.5;
}

export function isDuplicate(l1: any, l2: any): boolean {
  const v1 = Number(l1.value || 0);
  const v2 = Number(l2.value || 0);
  const absDiff = Math.abs(v1 - v2);
  const relDiff = v1 > 0 ? absDiff / v1 : (v2 > 0 ? absDiff / v2 : 0);
  // Consider same value if absolute difference is tiny or relative difference within 5%
  const sameVal = absDiff < 0.05 || relDiff <= 0.05;

  const sameBeneficiary = Boolean(
    l1.beneficiary && l2.beneficiary && stringsAreSimilar(l1.beneficiary, l2.beneficiary)
  );
  const sameDueDate = Boolean(l1.due_date && l2.due_date && l1.due_date === l2.due_date);
  const descSimilar = stringsAreSimilar(l1.description || '', l2.description || '');

  // If descriptions are identical/similar, flag as duplicate regardless of small value differences
  if (descSimilar) return true;

  // If values are similar, it's a potential duplicate even if other fields differ
  if (sameVal) {
    if (sameBeneficiary && sameDueDate) return true;

    // If dates are near (<=7 days) consider duplicate
    if (l1.due_date && l2.due_date) {
      const d1 = new Date(l1.due_date).getTime();
      const d2 = new Date(l2.due_date).getTime();
      const diffDays = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
      if (diffDays <= 7) return true;
    }

    // If missing dates, treat same value as potential duplicate
    if (!l1.due_date || !l2.due_date) return true;
  }

  return false;
}
