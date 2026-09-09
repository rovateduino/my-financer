/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

export function formatDateBr(dateIso?: string): string {
  if (!dateIso) return 'N/A';
  const parts = dateIso.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateIso;
}

export function getMonthNameBr(monthNum: number): string {
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return months[monthNum - 1] || '';
}

export function getShortMonthBr(monthNum: number): string {
  const months = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];
  return months[monthNum - 1] || '';
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem('my-financer.auth.token');
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem('my-financer.auth.token', token);
    } else {
      localStorage.removeItem('my-financer.auth.token');
    }
  } catch (error) {
    console.error('Erro ao salvar token:', error);
  }
}

export function getDeviceId(): string {
  try {
    const electronApi = (window as unknown as { electronAPI?: { getDeviceId?: () => string } }).electronAPI;
    const nativeDeviceId = electronApi?.getDeviceId?.();
    if (nativeDeviceId) return nativeDeviceId;
    const storageKey = 'my-financer.device.id';
    const current = localStorage.getItem(storageKey);
    if (current) return current;
    const generated = crypto.randomUUID();
    localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return `browser-${crypto.randomUUID()}`;
  }
}

export async function retryFetch(
  url: string,
  options: RequestInit = {},
  retries: number = 2,
  timeout: number = 8000
): Promise<Response> {
  let lastError: Error | undefined;

  const token = getStoredToken();
  if (token && !(options.headers && 'Authorization' in options.headers)) {
    options = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      }
    };
  }

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 401) {
        setStoredToken(null);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('my-financer-auth-expired'));
        }
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error as Error;

      if (i < retries) {
        const backoffMs = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}
