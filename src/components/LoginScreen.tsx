/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Cpu, LogIn, ShieldCheck } from 'lucide-react';
import { getDeviceId, setStoredToken } from '../utils.js';

interface LoginScreenProps {
  onAuthenticated: () => void;
}

interface ApiPayload {
  activated?: boolean;
  error?: string;
  sessionToken?: string;
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<ApiPayload> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const response = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({})) as ApiPayload;
  if (!response.ok) throw new Error(data.error || 'Erro de comunicação com o servidor');
  return data;
}

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [activated, setActivated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    const deviceId = encodeURIComponent(getDeviceId());
    apiFetch(`/api/auth/status?deviceId=${deviceId}`)
      .then(data => setActivated(Boolean(data.activated)))
      .catch(() => setLoginError('Não foi possível verificar a ativação deste computador'))
      .finally(() => setCheckingStatus(false));
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');
    if (!username.trim() || password.length < 4) {
      setLoginError('Informe usuário e senha válidos');
      return;
    }
    if (!activated && !token.trim()) {
      setLoginError('Informe o token de ativação fornecido pelo administrador');
      return;
    }

    setLoggingIn(true);
    try {
      const path = activated ? '/api/auth/login' : '/api/auth/activate';
      const data = await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          password,
          token: token.trim(),
          deviceId: getDeviceId()
        })
      });
      setStoredToken(data.sessionToken || null);
      onAuthenticated();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Falha ao autenticar');
    } finally {
      setLoggingIn(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2.5 px-3.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40';
  const primaryBtn = 'w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  if (checkingStatus) {
    return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center"><Cpu className="h-8 w-8 text-indigo-400 animate-pulse" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-5 antialiased">
      <div className="w-full max-w-md space-y-5">
        <div className="flex flex-col items-center space-y-3">
          <span className="rounded-2xl bg-indigo-600 p-3.5 text-white"><Cpu className="h-7 w-7" /></span>
          <div className="text-center"><h1 className="font-extrabold text-2xl tracking-tight text-white">My Financer</h1><p className="text-xs text-indigo-400 font-semibold tracking-wider uppercase mt-1">Offline &amp; Inteligente</p></div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/65 p-6 shadow-xl backdrop-blur-md">
          <div className="flex items-center space-x-2.5 mb-5">
            {activated ? <LogIn className="h-5 w-5 text-indigo-400" /> : <ShieldCheck className="h-5 w-5 text-indigo-400" />}
            <div><h2 className="text-sm font-bold text-slate-100">{activated ? 'Entrar no sistema' : 'Ativar este computador'}</h2><p className="text-[11px] text-slate-500">{activated ? 'Use seu usuário e senha' : 'O token será usado uma única vez'}</p></div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input type="text" value={username} onChange={event => setUsername(event.target.value)} placeholder="Usuário" className={inputClass} autoFocus />
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Senha" className={inputClass} />
            {!activated && <input type="text" value={token} onChange={event => setToken(event.target.value)} placeholder="Token de ativação" className={inputClass} />}
            {loginError && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{loginError}</p>}
            <button type="submit" disabled={loggingIn} className={primaryBtn}>{loggingIn ? 'Aguarde...' : activated ? 'Entrar' : 'Ativar e entrar'}</button>
          </form>
        </div>
        <p className="text-center text-[11px] text-slate-600">Acesso protegido por usuário, senha e ativação única do computador</p>
      </div>
    </div>
  );
}
