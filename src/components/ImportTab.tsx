/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  FileUp, 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  Settings2, 
  Grid, 
  Loader2, 
  Sparkles,
  Info
} from 'lucide-react';
import { Launch, Category, LaunchType, PaymentMethod, LaunchStatus } from '../types.js';
import { formatCurrency, formatDateBr } from '../utils.js';
import GlassCard from './GlassCard.js';
import ErrorBoundary from './ErrorBoundary.js';

interface ImportTabProps {
  id?: string;
  categories: Category[];
  onImportExcel: (file: File) => Promise<{ imported: number; skipped_duplicates: number }>;
  onImportItau: (file: File) => Promise<{ total_found: number; imported: number; skipped_duplicates: number }>;
  onExtractPdf: (file: File) => Promise<{
    barcode?: string;
    value: number;
    due_date?: string;
    beneficiary?: string;
    suggested_category?: string;
  }>;
  onConfirmPdfLaunch: (launch: Omit<Launch, 'id' | 'created_at'>) => void;
  onBatchImport: () => Promise<any>;
  addToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, duration?: number) => void;
}

export default function ImportTab({
  id,
  categories,
  onImportExcel,
  onImportItau,
  onExtractPdf,
  onConfirmPdfLaunch,
  onBatchImport,
  addToast
}: ImportTabProps) {
  const [activeImportType, setActiveImportType] = useState<'boleto' | 'itau' | 'excel'>('boleto');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // Verification State for Boleto PDF extraction
  const [verificationData, setVerificationData] = useState<any | null>(null);
  
  // Verification Form fields
  const [type, setType] = useState<LaunchType>('despesa_fixa');
  const [category, setCategory] = useState('Outros');
  const [description, setDescription] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [value, setValue] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [barcode, setBarcode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('boleto');

  // Success Results for statement/spreadsheet batch imports
  const [batchResult, setBatchResult] = useState<any | null>(null);
  const [batchImportResult, setBatchImportResult] = useState<any | null>(null);
  const [batchImportLoading, setBatchImportLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (selectedFile: File) => {
    setFile(selectedFile);
    setVerificationData(null);
    setBatchResult(null);
  };

  const handleProcessFile = async () => {
    if (!file) return;

    setLoading(true);
    try {
      if (activeImportType === 'excel') {
        const res = await onImportExcel(file);
        setBatchResult({
          title: 'Planilha Excel Importada!',
          desc: `Efetivamos o processamento do arquivo "${file.name}".`,
          details: [
            { label: 'Registros Criados', value: res.imported, color: 'text-emerald-400' },
            { label: 'Registros Duplicados (Ignorados)', value: res.skipped_duplicates, color: 'text-slate-400' }
          ]
        });
        addToast('success', `Planilha importada! ${res.imported} lançamento(s) criado(s).`);
      } else if (activeImportType === 'itau') {
        const res = await onImportItau(file);
        setBatchResult({
          title: 'Extrato Bancário Integrado!',
          desc: `Efetivamos o processamento automático por Inteligência Artificial do extrato "${file.name}".`,
          details: [
            { label: 'Transações Localizadas', value: res.total_found, color: 'text-indigo-400' },
            { label: 'Lançamentos Criados', value: res.imported, color: 'text-emerald-400' },
            { label: 'Transações Duplicadas (Ignoradas)', value: res.skipped_duplicates, color: 'text-slate-400' }
          ]
        });
        addToast('success', `Extrato importado! ${res.imported} lançamento(s) criado(s).`);
      } else if (activeImportType === 'boleto') {
        const res = await onExtractPdf(file);
        
        // Populate pre-fill fields
        setCategory(res.suggested_category || 'Outros');
        setDescription(`Pagamento de ${res.beneficiary || 'Boleto'}`);
        setBeneficiary(res.beneficiary || '');
        setValue(res.value?.toString() || '0.00');
        setDueDate(res.due_date || '');
        setBarcode(res.barcode || '');
        setType('despesa_fixa');
        setPaymentMethod('boleto');

        setVerificationData(res);
        addToast('info', 'Dados do boleto extraídos! Confira antes de salvar.');
      }
    } catch (err: any) {
      addToast('error', `Falha ao importar: ${err.message || err}`);
    } finally {
      setLoading(false);
      setFile(null);
    }
  };

  const handleConfirmVerification = (e: React.FormEvent) => {
    e.preventDefault();
    const numVal = parseFloat(value);
    if (isNaN(numVal) || numVal <= 0) {
      addToast('error', 'Informe um valor monetário válido.');
      return;
    }

    const padMonth = dueDate ? parseInt(dueDate.split('-')[1]) : new Date().getMonth() + 1;
    const padYear = dueDate ? parseInt(dueDate.split('-')[0]) : new Date().getFullYear();

    const payload: Omit<Launch, 'id' | 'created_at'> = {
      type,
      category,
      description,
      beneficiary: beneficiary || undefined,
      value: numVal,
      due_date: dueDate || undefined,
      competence_month: padMonth,
      competence_year: padYear,
      status: 'pendente', // imported boletos are unpaid by default
      payment_method: paymentMethod,
      barcode: barcode || undefined,
      origin: 'pdf'
    };

    onConfirmPdfLaunch(payload);
    
    // reset states
    setVerificationData(null);
    setFile(null);
  };

  const handleBatchImportClick = async () => {
    setBatchImportLoading(true);
    try {
      const result = await onBatchImport();
      setBatchImportResult(result);
      addToast('success', 'Importação em lote concluída!');
    } catch (err: any) {
      addToast('error', `Erro na importação em lote: ${err.message || err}`);
    } finally {
      setBatchImportLoading(false);
    }
  };

  return (
    <ErrorBoundary fallback={<div className="rounded-2xl border border-red-800/50 bg-red-950/30 p-6 text-sm text-red-200">Não foi possível carregar a importação. Verifique o console e tente novamente.</div>}>
      <div id={id} className="space-y-6 text-slate-100">
      {/* Batch Import Button */}
      <GlassCard>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-200 flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-emerald-400" />
              <span>Importação em Lote da Pasta dados-referencia</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1.5">
              Importa automaticamente todos os PDFs, boletos, extratos e planilhas da pasta dados-referencia do projeto.
            </p>
          </div>
          <button
            onClick={handleBatchImportClick}
            disabled={batchImportLoading}
            className={`inline-flex items-center space-x-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all ${
              batchImportLoading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer shadow-emerald-600/10'
            }`}
          >
            {batchImportLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processando...</span>
              </>
            ) : (
              <>
                <span>Importar Tudo</span>
              </>
            )}
          </button>
        </div>
        {/* Batch Import Results */}
        {batchImportResult && (
          <div className="mt-6 border-t border-slate-850 pt-6">
            <h4 className="text-sm font-semibold text-slate-200 mb-4">Resultado da Importação</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                <div className="text-xs text-slate-400">Total de Arquivos</div>
                <div className="text-lg font-bold text-slate-100">{batchImportResult.total}</div>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                <div className="text-xs text-slate-400">Boletos Importados</div>
                <div className="text-lg font-bold text-indigo-400">{batchImportResult.boletos_importados}</div>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                <div className="text-xs text-slate-400">Extratos Importados</div>
                <div className="text-lg font-bold text-blue-400">{batchImportResult.extratos_importados}</div>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                <div className="text-xs text-slate-400">Planilhas Importadas</div>
                <div className="text-lg font-bold text-purple-400">{batchImportResult.planilhas_importadas}</div>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                <div className="text-xs text-slate-400">Duplicatas Ignoradas</div>
                <div className="text-lg font-bold text-slate-500">{batchImportResult.skipped_duplicates}</div>
              </div>
            </div>
            {batchImportResult.errors && batchImportResult.errors.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-red-400 mb-2">Erros:</div>
                <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-3 text-xs text-red-300 space-y-1">
                  {batchImportResult.errors.map((err: any, idx: number) => (
                    <div key={idx}><span className="font-bold">{err.file}:</span> {err.error}</div>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => setBatchImportResult(null)}
              className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
            >
              Limpar Resultado
            </button>
          </div>
        )}
      </GlassCard>
      
      {/* Selector of Import Type */}
      <div className="flex space-x-1.5 rounded-xl bg-slate-950/40 p-1 border border-slate-850/80 max-w-2xl">
        <button
          onClick={() => { setActiveImportType('boleto'); setFile(null); setVerificationData(null); setBatchResult(null); }}
          className={`flex-1 rounded-lg py-2.5 text-xs font-semibold tracking-wide uppercase transition-all ${
            activeImportType === 'boleto' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Boleto PDF
        </button>
        <button
          onClick={() => { setActiveImportType('itau'); setFile(null); setVerificationData(null); setBatchResult(null); }}
          className={`flex-1 rounded-lg py-2.5 text-xs font-semibold tracking-wide uppercase transition-all ${
            activeImportType === 'itau' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Extrato (IA Gemini)
        </button>
        <button
          onClick={() => { setActiveImportType('excel'); setFile(null); setVerificationData(null); setBatchResult(null); }}
          className={`flex-1 rounded-lg py-2.5 text-xs font-semibold tracking-wide uppercase transition-all ${
            activeImportType === 'excel' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Planilha Excel
        </button>
      </div>

      {!verificationData && !batchResult && (
        <GlassCard>
          <div className="text-left mb-6">
            <h3 className="text-base font-semibold text-slate-200 flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-indigo-400" />
              <span>
                {activeImportType === 'boleto' && 'Extração Inteligente de Boletos'}
                {activeImportType === 'itau' && 'Leitura e Lançamento de Extrato Bancário'}
                {activeImportType === 'excel' && 'Importador de Planilhas de Lançamento'}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1.5">
              {activeImportType === 'boleto' && 'Arraste o arquivo PDF do boleto. Extrairemos o código de barras, vencimento, valor e credor via IA.'}
              {activeImportType === 'itau' && 'Processe extratos bancários mensais em PDF de qualquer banco (Itaú, Bradesco, Santander, Banco do Brasil, Nubank, etc.) de forma automatizada via Inteligência Artificial.'}
              {activeImportType === 'excel' && 'Importe planilhas financeiras estruturadas. O sistema processa transações de gastos e receitas.'}
            </p>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl py-12 px-6 cursor-pointer transition-all duration-200 ${
              dragging 
                ? 'border-indigo-500 bg-indigo-500/5' 
                : file 
                  ? 'border-emerald-500/40 bg-emerald-500/5' 
                  : 'border-slate-800 hover:border-slate-700 hover:bg-slate-850/20'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={activeImportType === 'excel' ? '.xlsx, .xls' : '.pdf'}
              onChange={handleFileSelectChange}
              className="hidden"
            />
            {file ? (
              <FileText className="h-12 w-12 text-emerald-400 mb-4 animate-bounce" />
            ) : (
              <FileUp className="h-12 w-12 text-indigo-400 mb-4" />
            )}
            
            <p className="font-semibold text-slate-200 text-sm">
              {file ? file.name : 'Selecione ou arraste o arquivo aqui'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {file ? `${(file.size / 1024).toFixed(1)} KB` : `Apenas arquivos ${activeImportType === 'excel' ? '.xlsx ou .xls' : '.pdf'}`}
            </p>

            {file && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="mt-4 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
              >
                Remover Arquivo
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleProcessFile}
              disabled={!file || loading}
              className={`inline-flex items-center space-x-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all ${
                !file || loading 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none' 
                  : 'bg-indigo-600 hover:bg-indigo-500 cursor-pointer shadow-indigo-600/10'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analisando Dados...</span>
                </>
              ) : (
                <>
                  <span>Processar e Analisar</span>
                </>
              )}
            </button>
          </div>
        </GlassCard>
      )}

      {/* Verification Screen: Pre-filled Boleto Data Form */}
      {verificationData && activeImportType === 'boleto' && (
        <GlassCard>
          <div className="border-b border-slate-850 pb-4 mb-6">
            <h4 className="text-base font-semibold text-slate-200 flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-emerald-400" />
              <span>Verificar Informações do Boleto</span>
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Extraímos as informações abaixo via IA. Por favor, confirme os campos antes de salvar o lançamento.
            </p>
          </div>

          <form onSubmit={handleConfirmVerification} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Category selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Categoria Sugerida</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2.5 px-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {categories.filter(c => c.type === 'despesa').map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Value */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Valor do Boleto (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-3 text-sm text-slate-100 font-mono font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Descrição do Lançamento</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Beneficiary */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Beneficiário/Credor</label>
                <input
                  type="text"
                  value={beneficiary}
                  onChange={e => setBeneficiary(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Vencimento do Boleto</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Barcode line */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Linha Digitável / Código de Barras</label>
              <input
                type="text"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="Nenhum código extraído"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-2 px-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-850">
              <button
                type="button"
                onClick={() => setVerificationData(null)}
                className="rounded-xl border border-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-400 hover:text-slate-200 transition-colors"
              >
                Recomeçar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors focus:outline-none"
              >
                Confirmar e Registrar Despesa
              </button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* Batch Import Success Screen */}
      {batchResult && (
        <GlassCard className="text-center py-8">
          <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
          <h4 className="text-lg font-bold text-slate-100">{batchResult.title}</h4>
          <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">{batchResult.desc}</p>

          <div className="mt-6 max-w-sm mx-auto rounded-xl border border-slate-850 bg-slate-950/40 p-4 divide-y divide-slate-850 space-y-3">
            {batchResult.details.map((item: any, i: number) => (
              <div key={i} className={`flex items-center justify-between text-sm pt-2 ${i === 0 ? 'pt-0' : ''}`}>
                <span className="text-slate-400 font-medium">{item.label}</span>
                <span className={`font-mono font-bold ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setBatchResult(null)}
            className="mt-6 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Importar Outro Arquivo
          </button>
        </GlassCard>
      )}
      </div>
    </ErrorBoundary>
  );
}
