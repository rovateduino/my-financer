/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Cpu,
  ShieldCheck,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Plus,
  X,
  Check,
  Lock,
  User,
  RefreshCw,
  LogOut
} from 'lucide-react';

interface AuthTokenEntry {
  id: number;
  token: string;
  label?: string;
  created_at: string;
  last_used_at?: string;
}

async function apiFetch(path: string, options: RequestInit = {}, adminToken?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminToken) headers['x-admin-token'] = adminToken;
  const res = await fetch(path, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Erro de comunicação com o servidor');
  }
  return data;
}

function formatDateBr(iso?: string): string {
  if (!iso) return 'Nunca usado';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Nunca usado';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const inputClass = "w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2.5 px-3.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40";
const primaryBtn = "w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export default function AdminApp() {
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  // Admin session
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminMessage, setAdminMessage] = useState('');

  // Admin setup (first run)
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupError, setSetupError] = useState('');

  // Token management
  const [tokens, setTokens] = useState<AuthTokenEntry[]>([]);
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [generatedToken, setGeneratedToken] = useState('');
  const [generatedCopied, setGeneratedCopied] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);

  // Change password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [appUsername, setAppUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');

  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    apiFetch('/api/auth/status')
      .then((data) => setSetupRequired(!!data.setupRequired))
      .catch(() => setSetupRequired(false))
      .finally(() => setCheckingStatus(false));
  }, []);

  const loadTokens = async (session: string) => {
    setLoadingTokens(true);
    try {
      const list = await apiFetch('/api/auth/admin/tokens', {}, session);
      setTokens(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setAdminError(err?.message || 'Falha ao listar tokens');
    } finally {
      setLoadingTokens(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');
    if (setupUsername.trim().length < 3) {
      setSetupError('Usuário deve ter no mínimo 3 caracteres');
      return;
    }
    if (setupPassword.length < 4) {
      setSetupError('Senha deve ter no mínimo 4 caracteres');
      return;
    }
    if (setupPassword !== setupConfirm) {
      setSetupError('As senhas não coincidem');
      return;
    }
    try {
      await apiFetch('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ username: setupUsername.trim(), password: setupPassword })
      });
      setSetupRequired(false);
      setSetupUsername('');
      setSetupPassword('');
      setSetupConfirm('');
      setAdminMessage('Conta de administrador criada! Faça login para gerenciar os tokens.');
    } catch (err: any) {
      setSetupError(err?.message || 'Falha ao criar conta de administrador');
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    setAdminMessage('');
    try {
      const data = await apiFetch('/api/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username: adminUsername.trim(), password: adminPassword })
      });
      setAdminToken(data.adminToken);
      setAdminUsername('');
      setAdminPassword('');
      await loadTokens(data.adminToken);
    } catch (err: any) {
      setAdminError(err?.message || 'Falha no login do administrador');
    }
  };

  const handleAdminLogout = async () => {
    if (adminToken) {
      try {
        await apiFetch('/api/auth/admin/logout', { method: 'POST' }, adminToken);
      } catch {}
    }
    setAdminToken(null);
    setTokens([]);
    setGeneratedToken('');
    setAdminMessage('');
  };

  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setAdminError('');
    try {
      const data = await apiFetch('/api/auth/admin/tokens', {
        method: 'POST',
        body: JSON.stringify({ label: newTokenLabel.trim() })
      }, adminToken);
      setGeneratedToken(data.token);
      setNewTokenLabel('');
      setAdminMessage('Token gerado com sucesso! Copie-o e envie para o usuário.');
      await loadTokens(adminToken);
    } catch (err: any) {
      setAdminError(err?.message || 'Falha ao gerar token');
    }
  };

  const handleRevokeToken = async (id: number) => {
    if (!adminToken) return;
    if (!confirm('Revogar este token? Usuários conectados com ele perderão o acesso.')) return;
    setAdminError('');
    try {
      await apiFetch(`/api/auth/admin/tokens/${id}`, { method: 'DELETE' }, adminToken);
      setTokens(prev => prev.filter(t => t.id !== id));
      setAdminMessage('Token revogado.');
    } catch (err: any) {
      setAdminError(err?.message || 'Falha ao revogar token');
    }
  };

  const handleCopyGenerated = async () => {
    try {
      await navigator.clipboard.writeText(generatedToken);
      setGeneratedCopied(true);
      setTimeout(() => setGeneratedCopied(false), 2000);
    } catch {
      setAdminMessage('Não foi possível copiar automaticamente. Selecione e copie o token.');
    }
  };

  const handleCopyExisting = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setAdminMessage('Token copiado para a área de transferência.');
    } catch {}
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setAdminError('');
    setAdminMessage('');
    try {
      await apiFetch('/api/auth/admin/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      }, adminToken);
      setCurrentPassword('');
      setNewPassword('');
      setAdminMessage('Senha do administrador alterada com sucesso!');
    } catch (err: any) {
      setAdminError(err?.message || 'Falha ao alterar senha');
    }
  };

  const handleResetAppPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setAdminError('');
    setAdminMessage('');
    try {
      await apiFetch('/api/auth/admin/app-password', {
        method: 'POST',
        body: JSON.stringify({ username: appUsername.trim(), password: appPassword })
      }, adminToken);
      setAppPassword('');
      setAdminMessage('Senha do usuário do app redefinida com sucesso.');
    } catch (err: any) {
      setAdminError(err?.message || 'Falha ao redefinir senha do app');
    }
  };

  if (checkingStatus) {
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-5 antialiased"
      style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(16,185,129,0.12), transparent 60%)' }}>
      <div className="w-full max-w-md space-y-5">
        {/* Branding */}
        <div className="flex flex-col items-center space-y-3">
          <span className="rounded-2xl bg-emerald-600 p-3.5 text-white shadow-lg shadow-emerald-600/25">
            <ShieldCheck className="h-7 w-7" />
          </span>
          <div className="text-center">
            <h1 className="font-extrabold text-2xl tracking-tight text-white">My Financer Admin</h1>
            <p className="text-xs text-emerald-400 font-semibold tracking-wider uppercase mt-1">Administração &amp; Tokens</p>
          </div>
        </div>

        {/* Admin panel card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/65 shadow-xl backdrop-blur-md overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center space-x-2.5">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-slate-100">Área do Administrador</h2>
              <p className="text-[11px] text-slate-500">Gerencie os tokens de acesso dos usuários</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {adminMessage && (
              <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 flex items-start space-x-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{adminMessage}</span>
              </p>
            )}
            {adminError && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{adminError}</p>
            )}

            {!adminToken && (
              <>
                {setupRequired && (
                  <form onSubmit={handleSetup} className="space-y-3">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Nenhuma conta de administrador configurada ainda. Crie a primeira conta para poder gerar os tokens de acesso.
                    </p>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        value={setupUsername}
                        onChange={e => setSetupUsername(e.target.value)}
                        placeholder="Usuário do administrador"
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                          type={showPasswords ? 'text' : 'password'}
                          value={setupPassword}
                          onChange={e => setSetupPassword(e.target.value)}
                          placeholder="Senha"
                          className={`${inputClass} pl-10`}
                        />
                      </div>
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={setupConfirm}
                        onChange={e => setSetupConfirm(e.target.value)}
                        placeholder="Confirmar senha"
                        className={inputClass}
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <button type="button" onClick={() => setShowPasswords(prev => !prev)} className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center space-x-1">
                        {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        <span>{showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}</span>
                      </button>
                    </div>
                    {setupError && (
                      <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{setupError}</p>
                    )}
                    <button type="submit" className={primaryBtn}>Criar Conta de Administrador</button>
                  </form>
                )}

                {!setupRequired && (
                  <form onSubmit={handleAdminLogin} className="space-y-3">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Faça login para gerar e gerenciar os tokens de acesso dos usuários.
                    </p>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        value={adminUsername}
                        onChange={e => setAdminUsername(e.target.value)}
                        placeholder="Usuário do administrador"
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={adminPassword}
                        onChange={e => setAdminPassword(e.target.value)}
                        placeholder="Senha"
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <button type="button" onClick={() => setShowPasswords(prev => !prev)} className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center space-x-1">
                        {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        <span>{showPasswords ? 'Ocultar senha' : 'Mostrar senha'}</span>
                      </button>
                    </div>
                    <button type="submit" className={primaryBtn}>Entrar como Administrador</button>
                  </form>
                )}
              </>
            )}

            {adminToken && (
              <>
                {/* Generate token */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-2">
                    <Plus className="h-4 w-4 text-indigo-400" />
                    <span>Gerar Novo Token</span>
                  </h4>
                  <form onSubmit={handleGenerateToken} className="space-y-3">
                    <input
                      type="text"
                      value={newTokenLabel}
                      onChange={e => setNewTokenLabel(e.target.value)}
                      placeholder="Identificação (opcional, ex: Notebook da Maria)"
                      className={inputClass}
                    />
                    <button type="submit" className={primaryBtn}>Gerar Token de Acesso</button>
                  </form>

                  {generatedToken && (
                    <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2">
                      <p className="text-[11px] text-emerald-400 font-semibold">Token gerado (guarde-o agora, você não poderá vê-lo novamente):</p>
                      <div className="flex items-center space-x-2">
                        <code className="grow rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs text-emerald-300 font-mono break-all select-all">{generatedToken}</code>
                        <button
                          type="button"
                          onClick={handleCopyGenerated}
                          className="shrink-0 rounded-lg bg-emerald-600/20 border border-emerald-500/30 p-1.5 text-emerald-300 hover:bg-emerald-600/30 transition-colors"
                          title="Copiar token"
                        >
                          {generatedCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setGeneratedToken('')}
                          className="shrink-0 rounded-lg bg-slate-800 border border-slate-700 p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                          title="Fechar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Token list */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-2">
                    <RefreshCw className="h-4 w-4 text-indigo-400" />
                    <span>Tokens Existentes ({tokens.length})</span>
                  </h4>
                  {loadingTokens ? (
                    <p className="text-xs text-slate-500">Carregando...</p>
                  ) : tokens.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhum token gerado ainda.</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                      {tokens.map(t => (
                        <div key={t.id} className="flex items-center justify-between bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-200 truncate">{t.label || 'Sem identificação'}</p>
                            <p className="text-[10px] text-slate-500 font-mono truncate">{t.token}</p>
                            <p className="text-[10px] text-slate-600">Criado em {formatDateBr(t.created_at)} · Último uso: {formatDateBr(t.last_used_at)}</p>
                          </div>
                          <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() => handleCopyExisting(t.token)}
                              className="rounded-lg bg-slate-800 border border-slate-700 p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                              title="Copiar token"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRevokeToken(t.id)}
                              className="rounded-lg bg-rose-600/15 border border-rose-500/25 p-1.5 text-rose-400 hover:bg-rose-600/25 transition-colors"
                              title="Revogar token"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Change password */}
                <form onSubmit={handleChangePassword} className="space-y-3 border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                    <Lock className="h-4 w-4 text-indigo-400" />
                    <span>Alterar Senha do Administrador</span>
                  </h4>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Senha atual"
                    className={inputClass}
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Nova senha (mínimo 4 caracteres)"
                    className={inputClass}
                  />
                  <button type="submit" className={primaryBtn}>Alterar Senha</button>
                </form>

                <form onSubmit={handleResetAppPassword} className="space-y-3 border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                    <User className="h-4 w-4 text-emerald-400" />
                    <span>Redefinir Senha do Usuário do App</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">Não altera o token usado nem o computador ativado.</p>
                  <input
                    type="text"
                    value={appUsername}
                    onChange={e => setAppUsername(e.target.value)}
                    placeholder="Usuário do My Financer"
                    className={inputClass}
                  />
                  <input
                    type="password"
                    value={appPassword}
                    onChange={e => setAppPassword(e.target.value)}
                    placeholder="Nova senha (mínimo 4 caracteres)"
                    className={inputClass}
                  />
                  <button type="submit" className={primaryBtn}>Redefinir Senha do App</button>
                </form>

                <button
                  type="button"
                  onClick={handleAdminLogout}
                  className="w-full rounded-xl border border-slate-700 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex items-center justify-center space-x-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sair da Área do Administrador</span>
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-600">
          Ferramenta de administração · Mesmo banco de dados do My Financer
        </p>
      </div>
    </div>
  );
}
