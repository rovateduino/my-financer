# My Financer — Especificação Técnica e de Produto

> Documento vivo — cobre arquitetura, funcionalidades, API, banco, IA, build e deployment.
> Última atualização: 07/08/2026

---

## 1. Visão Geral

Aplicação de controle financeiro pessoal **100% local/offline** (Electron + React + Express + sql.js),
com stack completa para importar dados de diversas fontes e IA opcional para recomendações/análises.

| Camada | Tecnologia | Key Files |
|--------|-----------|-----------|
| Frontend | React 19 + Vite 6 + Tailwind 4 + Motion + Recharts + Lucide | `src/App.tsx`, `src/components/*.tsx`, `src/admin/*.tsx` |
| Backend | Express 4 + sql.js + multer + xlsx + pdf-parse | `server.ts`, `src/db.ts`, `src/duplicateDetection.ts` |
| Desktop | Electron 41 + electron-builder 26 (NSIS) — 2 apps (usuário + admin) | `electron/main.cjs`, `electron/admin-main.cjs`, `electron/preload.cjs` |
| DB | SQLite via sql.js (wasm) | `financer_db.sqlite` |
| Python (aux) | pdfplumber | `leitor_extratos.py`, `requirements.txt` |
| AI | Groq (llama-3.3-70b) → Gemini → DeepSeek → OpenRouter → Ollama (fallback chain) | `server.ts` (generateFinancialAdviceWithFallbacks) |

---

## 2. Arquitetura

### 2.1. Dev mode
```
tsx server.ts  (esbuild + Vite middleware mode)
  → Express API em localhost:3000 (auto-incrementa se busy)
  → Vite dev server (HMR via middleware)
  → React app servido no mesmo endpoint
```

### 2.2. Production mode (Electron) — App do Usuário
```
npm run build  →  dist/ (frontend estático + server.cjs)
electron main.cjs
  → fork('dist/server.cjs') com NODE_ENV=production, FINANCER_DATA_DIR=userData
  → serve dist/ como static
  → BrowserWindow → loadURL(localhost:3000)  (tela de login com token)
```

### 2.3. Production mode (Electron) — App do Administrador
```
electron admin-main.cjs  (empacotado como "My Financer Admin")
  → força userData para %APPDATA%/My Financer (mesmo banco do app do usuário)
  → reusa o servidor existente na porta 3000 se já estiver rodando; senão, faz fork
  → BrowserWindow → loadURL(localhost:3000/admin.html)  (painel de tokens)
```

Os dois executáveis compartilham o mesmo servidor/banco. Se um estiver aberto, o outro
reusa o processo na porta 3000; se os dois estiverem abertos, trabalham sobre os mesmos dados
em tempo real (token gerado no admin é validado imediatamente no app do usuário).

### 2.4. DB layer
- `sql.js` roda 100% em memória (wasm), salva em disco via `fs.writeFileSync`
- Auto-save a cada operação de escrita + shutdown hooks
- Backups automáticos no diretório `backups/` (a cada 24h ou a cada 10 writes)
- Antes do SQLite, o app usava `financer_db.json` — migração automática ainda ativa

---

## 3. Dependências

### Node (package.json)

**`dependencies`** — somente o que o servidor precisa em runtime (empacotado no app):
| Pacote | Uso |
|--------|-----|
| `express` 4 | API REST |
| `multer` 2 | Upload de arquivos |
| `pdf-parse` 2 | Extração de texto de PDF (boleto) |
| `xlsx` 0.18 | Leitura de planilhas Excel |
| `@google/genai` 2.4 | SDK Gemini |
| `sql.js` 1.14 | SQLite via WebAssembly |
| `dotenv` 17 | Carregamento de .env |

**`devDependencies`** — frontend/build (NÃO entram no pacote, reduzindo o exe):
| Pacote | Uso |
|--------|-----|
| `react`, `react-dom` 19 | UI (bundlado pelo Vite) |
| `vite` 6 + `@vitejs/plugin-react` | Build / Dev server |
| `@tailwindcss/vite`, `tailwindcss` 4, `autoprefixer` | CSS utility-first |
| `lucide-react` | Ícones |
| `motion` 12 | Animações |
| `recharts` 3 | Gráficos |
| `react-markdown` 10 | Renderização de texto IA |
| `tsx` 4 | TypeScript runner (dev) |
| `esbuild` 0.25 | Bundle do server (build) |
| `typescript` 5.8 | Type-check |
| `electron` 41 | Desktop wrapper |
| `electron-builder` 26 | Empacotamento NSIS |

> Isso mantém o pacote enxuto: só ~1.6k arquivos (antes ~13.7k), deixando o exe pequeno e rápido de abrir.

### Python (requirements.txt)
| Pacote | Uso |
|--------|-----|
| `pdfplumber` | Extração estruturada de extratos bancários PDF (Bradesco, Itaú, Nubank) |

---

## 4. Estrutura de Arquivos

```
my-financer/
├── server.ts                  # Express API (4211 linhas) — todos os endpoints
├── index.html                 # Entry point HTML do usuário (Vite)
├── admin.html                 # Entry point HTML do administrador (Vite)
├── package.json               # Scripts + dependências + build config (user)
├── electron-builder.admin.json# Config electron-builder para o app de admin
├── tsconfig.json              # TypeScript config (ES2022, bundler mode)
├── vite.config.ts             # Vite config (React + Tailwind + HMR + 2 entradas)
├── leitor_extratos.py         # Python pdfplumber CLI para extratos bancários
├── requirements.txt           # Dependências Python
├── .env                       # API keys (copiado de .env.example, gitignored)
├── .env.example               # Template de chaves
├── financer_db.sqlite         # Banco SQLite (runtime)
├── backups/                   # Backups automáticos do SQLite
├── uploads/                   # Arquivos temporários de upload
├── dist/                      # Build output (vite build + esbuild)
├── release/                   # Installer output — app do usuário
├── release/admin/             # Installer output — app do administrador
├── electron/
│   ├── main.cjs               # Electron main process (app do usuário: fork server + BrowserWindow)
│   ├── admin-main.cjs         # Electron main process (app do admin: mesma userData + admin.html)
│   └── preload.cjs            # Electron preload (contextBridge)
├── src/
│   ├── main.tsx               # React entry point (usuário)
│   ├── App.tsx                # Root component ~971 linhas (tabs, state, fetch)
│   ├── types.ts               # Typescript interfaces (Launch, Category, Goal, etc.)
│   ├── utils.ts               # formatCurrency, formatDateBr, retryFetch
│   ├── db.ts                  # sql.js database layer (~1247 linhas)
│   ├── duplicateDetection.ts  # Lógica de detecção de duplicatas
│   ├── aiFallbacks.ts         # Fallbacks offline para IA
│   ├── index.css              # Tailwind imports + CSS custom
│   ├── admin/
│   │   ├── main.tsx           # React entry point do administrador
│   │   └── AdminApp.tsx       # Painel do admin: setup, login, gerar/revogar tokens, senha
│   └── components/
│       ├── DashboardTab.tsx    # Visão geral, gráficos, contas a pagar, histórico
│       ├── LaunchesTab.tsx     # CRUD de lançamentos, duplicatas, filtros
│       ├── ImportTab.tsx       # Importação: Boleto, Itaú, Excel, Extrato (pdfplumber)
│       ├── BudgetsTab.tsx      # Orçamento vs gastos reais por categoria
│       ├── AdvisorTab.tsx      # Conselheiro IA + Reserva de Emergência
│       ├── GoalsTab.tsx        # Planejador de Objetivos (metas financeiras)
│       ├── SettingsTab.tsx     # Categorias, Membros, Regras, Backup, Reset
│       ├── LoginScreen.tsx     # Tela de login do usuário (somente token)
│       ├── GlassCard.tsx       # Componente UI reutilizável (glassmorphism)
│       ├── Modal.tsx           # Modal genérico
│       ├── Toast.tsx           # Sistema de notificações toast
│       └── CommandPalette.tsx  # Paleta de comandos (Ctrl+K)
├── build/                     # Ícones para o instalador
├── dados-referencia/          # Dados de referência
├── data/                      # Dados auxiliares
├── sample_extrato.txt         # Exemplo de extrato para teste
├── .gitignore
├── README.md
└── spec.md                    # Este documento
```

---

## 5. Modelo de Dados

### 5.1. Launch (Lançamento Financeiro)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | number (PK) | Auto-increment |
| `type` | `'receita' \| 'despesa_fixa' \| 'despesa_variavel' \| 'divida_parcelamento'` | Tipo |
| `category` | string | Nome da categoria |
| `category_id?` | number | FK para categories |
| `subcategory?` | string | Subcategoria |
| `description` | string | Descrição |
| `beneficiary?` | string | Beneficiário/credor |
| `value` | number | Valor (sempre positivo) |
| `due_date?` | string (YYYY-MM-DD) | Data de vencimento |
| `competence_month` | number (1-12) | Mês de competência |
| `competence_year` | number | Ano de competência |
| `status` | `'pendente' \| 'pago' \| 'atrasado'` | Status |
| `payment_method?` | `'pix' \| 'boleto' \| 'cartao' \| 'debito_automatico' \| 'dinheiro'` | Método |
| `installment_current?` | number | Parcela atual |
| `installment_total?` | number | Total de parcelas |
| `origin` | `'planilha' \| 'pdf' \| 'manual' \| 'itau_statement' \| 'extrato'` | Origem |
| `pdf_path?` | string | Caminho do PDF fonte |
| `doc_number?` | string | Nº documento |
| `barcode?` | string | Código de barras |
| `created_at` | string | Timestamp ISO |

### 5.2. Category

| Campo | Tipo |
|-------|------|
| `id` | number (PK) |
| `name` | string (UNIQUE) |
| `type` | `'receita' \| 'despesa'` |
| `budget_target?` | number |

Categorias padrão: Salário, Freelance, Investimentos, Outras Receitas, Aluguel, Energia, Internet, Supermercado, Transporte, Saúde, Lazer, Outros.

### 5.3. HomeMember

| Campo | Tipo |
|-------|------|
| `id` | number (PK) |
| `name` | string (UNIQUE) |

Padrão: `Titular`.

### 5.4. BeneficiaryRule

| Campo | Tipo |
|-------|------|
| `id` | number (PK) |
| `beneficiary` | string (UNIQUE) |
| `suggested_category` | string |
| `suggested_category_id` | number (FK → categories.id) |

Padrão: ENEL → Energia, VIVO → Internet.

### 5.5. Goal (Objetivo Financeiro)

| Campo | Tipo |
|-------|------|
| `id` | number (PK) |
| `name` | string |
| `description?` | string |
| `target_value` | number |
| `current_saved` | number |
| `monthly_contribution` | number |
| `start_date` | string (YYYY-MM-DD) |
| `target_date?` | string (YYYY-MM-DD) |
| `priority` | 1 (Alta) \| 2 (Média) \| 3 (Baixa) |
| `status` | `'active' \| 'completed' \| 'cancelled'` |
| `category?` | string |
| `category_id?` | number (FK) |
| `created_at` | string |
| `updated_at` | string |

### 5.6. GoalScenario

| Campo | Tipo |
|-------|------|
| `id` | number (PK) |
| `goal_id` | number → goals.id |
| `scenario_type` | `'financing' \| 'savings' \| 'hybrid'` |
| `total_value?` | number |
| `down_payment?` | number |
| `installments?` | number |
| `installment_value?` | number |
| `interest_rate?` | number |
| `total_cost?` | number |

### 5.7. AICache

| Campo | Tipo |
|-------|------|
| `cache_key` | string (PK, MD5 hash) |
| `response` | string (texto da advice) |
| `created_at` | string (datetime) |

---

## 6. Tabs / Funcionalidades

### 6.1. Dashboard (`/`)
Cards: resumo financeiro (receita, despesa, saldo), contas atrasadas/próximas, gráfico de categorias (barra horizontal), contas a pagar, histórico 6 meses (barras), dívidas ativas.

### 6.2. Lançamentos
CRUD completo: adicionar, editar, pagar/estornar, excluir (simples e em lote), filtro por mês/ano, visualização "todos os meses", gerenciamento de duplicatas (agrupamento fuzzy).

### 6.3. Importar
Quatro modalidades:
1. **Boleto PDF** — Extrai código de barras, valor, vencimento, beneficiário via `pdf-parse` + regex offline + Gemini opcional. Exibe modal de verificação antes de salvar.
2. **Extrato Itaú** — Extrai texto de PDF (pdf-parse → pdftotext → OCR tesseract → fallback raw), parseia via IA (Gemini/Groq) com fallback offline.
3. **Planilha Excel** — Parseia multi-tabelas (Gastos Fixos, Gastos Variados, Receita) com header detection inteligente. Extrai mês/ano do nome do arquivo.
4. **Extrato Bancário (pdfplumber)** — Chama `leitor_extratos.py` via CLI Python, reconhece Bradesco/Itaú/Nubank, retorna lançamentos estruturados.

### 6.4. Orçamentos
Tabela de categorias mostrando `budget_target` vs `spent` no mês, com indicador visual de estouro.

### 6.5. Conselheiro IA
- Recomendação financeira mensal via IA (fallback chain)
- **Reserva de Emergência**: configurável (localStorage), cálculo de progresso e tempo
- **Análise Inteligente**: cruza reserva + objetivos, sugestões de investimento
- Cache de 12h (MD5)

### 6.6. Objetivos
Planejador de metas: criar/editar/excluir objetivos, cenários (financiamento, poupança, híbrido), análise de viabilidade com projeção mensal e IA.

### 6.7. Configurações
Gerenciar categorias (nome, tipo, budget), membros, regras de beneficiário, export/import de backup (JSON), listar/restaurar backups automáticos, resetar banco.

### 6.8. Paleta de Comandos (Ctrl+K)
Navegação rápida entre abas.

### 6.9. Login e Administração de Tokens
- **App do usuário** (`LoginScreen.tsx`): somente o campo de token — o usuário cola o token `MF-...` gerado pelo administrador e entra. Nenhuma funcionalidade de administração é exibida.
- **App do administrador** (`My Financer Admin`): tela exclusiva para criar a 1ª conta admin (se `setupRequired`), fazer login com usuário/senha, gerar tokens (com rótulo opcional), listar/copiar/revogar tokens, e alterar a senha do admin.
- Os dois acessos são totalmente separados: o login do usuário usa `Authorization: Bearer <token>`; o admin usa `x-admin-token` em endpoints `/api/auth/admin/*`.

---

## 7. API Endpoints

Todas as rotas existem em duas versões: `/api/*` e `/api/v1/*` (equivalentes funcionais).
Todas as rotas `/api/*` exigem `Authorization: Bearer <token>` **exceto** `/api/auth/*` e `/api/health`.

### 7.1. Health & Config
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Health check |
| GET | `/api/config` | Categories + Members + Rules |

### 7.2. Autenticação e Tokens
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/auth/status` | Status do sistema — retorna `{ hasAdmin, setupRequired }` |
| POST | `/api/auth/setup` | Criar 1ª conta de administrador (body: `username`, `password`) |
| POST | `/api/auth/admin/login` | Login admin → retorna `adminToken` (sessão de administração) |
| POST | `/api/auth/admin/logout` | Encerrar sessão de administração |
| GET | `/api/auth/admin/tokens` | Listar tokens de acesso (admin) |
| POST | `/api/auth/admin/tokens` | Gerar novo token de acesso (admin, body: `label?`) |
| DELETE | `/api/auth/admin/tokens/:id` | Revogar token (admin) |
| POST | `/api/auth/admin/password` | Alterar senha do admin (admin) |
| POST | `/api/auth/login` | Login do usuário com token → retorna Bearer token |
| GET | `/api/auth/validate` | Validar token armazenado no app do usuário |

Rotas admin usam o header `x-admin-token` (em vez de `Authorization`). O login do usuário final
usa o token gerado pelo administrador, que vira o Bearer token das demais rotas.

### 7.3. Categories
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/config/categories` | Criar categoria |
| POST | `/api/config/categories/update` | Atualizar budget_target |
| POST | `/api/config/categories/delete` | Excluir categoria |

### 7.4. Members
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/config/members` | Criar membro |
| DELETE | `/api/config/members/:id` | Excluir membro |

### 7.5. Rules
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/config/rule` | Criar regra |
| DELETE | `/api/config/rules/:id` | Excluir regra |

### 7.6. Launches
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/launches?month=&year=&all=` | Listar (filtro por mês/ano ou todos) |
| GET | `/api/launches/:id` | Detalhe |
| POST | `/api/launches` | Criar (com validação + duplicata check → 409) |
| PUT | `/api/launches/:id` | Atualizar |
| DELETE | `/api/launches/:id` | Excluir |
| DELETE | `/api/launches/batch` | Exclusão em lote |
| POST | `/api/launches/toggle-paid/:id` | Alternar pago/pendente |

### 7.7. Duplicates
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/launches/duplicates?description=&beneficiary=&value=` | Verificar duplicata específica |
| GET | `/api/launches/duplicates/all?month=&year=` | Todos os grupos de duplicatas do mês |
| POST | `/api/launches/duplicates/resolve` | Resolver grupo (escolhe principal + deleta resto) |

Critério de matching: mesma data OU (valor ±R$0,05 + similaridade fuzzy de descrição ≥50% via Jaccard com singularização de tokens).

### 7.8. Dashboard
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/dashboard?month=&year=` | Summary + CategoryBreakdown + PendingBills + HistoricalData (6 meses) + Debts |

### 7.9. Budgets & Projections
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/budgets?month=&year=` | BudgetTarget vs Spent por categoria |
| GET | `/api/projections?month=&year=` | Projeção 12 meses (baseado em receitas/despesas fixas) |

### 7.10. Market
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/market` | Cotações USD/EUR/BTC/IBOV (HG Finance API → offline fallback) |

### 7.11. AI / Recommendations
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/recommendations?month=&year=` | Relatório IA (cache 12h, background processing, offline fallback) |
| GET | `/api/reserve/analysis?currentSaved=&monthlySaving=&manual=&target=&month=&year=` | Análise reserva + objetivos (IA) |
| POST | `/api/ai-cache/clear` | Limpar cache de IA |

### 7.12. Import
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/import/pdf` | Boleto PDF (pdf-parse + Gemini) |
| POST | `/api/import/itau-statement` | Extrato Itaú PDF (pdf-parse/pdftotext/OCR + IA parse) |
| POST | `/api/import/excel` | Planilha Excel (xlsx + parser multi-tabela) |
| POST | `/api/v1/import/extrato-pdf` | Extrato bancário via pdfplumber (Python) |
| POST | `/api/import/batch` | Importação em lote de múltiplos PDFs |

### 7.13. Backup & DB
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/backup/export` | Download do banco como JSON |
| POST | `/api/backup/import` | Restaurar de JSON |
| GET | `/api/backup/list` | Listar backups automáticos |
| POST | `/api/backup/restore/:filename` | Restaurar backup específico |
| POST | `/api/db/reset` | Resetar banco para dados padrão (requer `{ confirm: "RESETAR_BANCO" }`) |

### 7.14. Goals
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/goals` | Listar objetivos |
| GET | `/api/goals/:id` | Detalhe |
| POST | `/api/goals` | Criar |
| PUT | `/api/goals/:id` | Atualizar |
| DELETE | `/api/goals/:id` | Excluir |
| GET | `/api/goals/:id/scenarios` | Cenários do objetivo |
| POST | `/api/goals/:id/scenarios` | Adicionar cenário (financing/savings/hybrid com cálculo Price PMT) |
| GET | `/api/goals/:id/analysis?month=&year=` | Análise de viabilidade + projeção + IA advice |

### 7.15. Test
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/test/create-duplicates` | Criar dados de teste para duplicatas |

---

## 8. AI Integration Chain

### 8.1. Providers (fallback order)
1. **Groq** (`GROQ_API_KEY`) — ✅ ativo, modelo `llama-3.3-70b-versatile`
2. **Gemini** (`GEMINI_API_KEY`) — ⚠️ quota esgotada (429), modelo `gemini-2.0-flash-001`
3. **DeepSeek** (`DEEPSEEK_API_KEY`) — ❌ sem saldo (402)
4. **OpenRouter** (`OPENROUTER_API_KEY`) — ❌ inválida (401)
5. **Ollama** (`OLLAMA_API_URL`) — ❌ não instalado

### 8.2. Caching
- Chave: MD5 do resumo financeiro (ou parâmetros específicos)
- TTL: 12 horas
- Armazenamento: tabela `ai_cache` no SQLite
- Limpeza: `POST /api/ai-cache/clear`

### 8.3. Usos da IA
1. **Recomendação mensal** (`/api/recommendations`) — análise financeira + 3 conselhos práticos
2. **Extrato Itaú** — parse de transações de extrato bancário PDF
3. **Boleto** — extração de campos de boleto PDF
4. **Análise de Objetivos** (`/api/goals/:id/analysis`) — viabilidade + cortes + advice
5. **Análise de Reserva** (`/api/reserve/analysis`) — cruzamento reserva × objetivos

### 8.4. Offline fallbacks
- `src/aiFallbacks.ts`: buildRecommendationFallbackAdvice(), buildGoalAnalysisOfflineAdvice(), buildReserveAnalysisOfflineAdvice()
- Regras: saldo negativo → alerta de corte de variáveis; saldo > 3000 → recomenda investimento

---

## 9. Importação de Dados Detalhada

### 9.1. Planilha Excel
- Formato esperado: colunas com cabeçalhos "Gastos Fixos", "Gastos Variados", "Receita"
- Descrição e valor em colunas adjacentes
- Ignora linhas de subtotal/total/saldo
- Extrai mês/ano do nome do arquivo (ex: `Jun_2026`, `julho_2026`)
- Cria categorias automaticamente se não existirem

### 9.2. Boleto PDF
- Extração offline robusta via regex (código de barras 44/47 dígitos, valor, vencimento)
- Se Gemini disponível, refine com IA
- Exibe modal de verificação antes de confirmar

### 9.3. Extrato Itaú
- Pipeline de extração de texto: `pdf-parse` → `pdftotext` (CLI) → OCR via `pdftoppm`+`tesseract` → raw `latin1`
- Parse via IA (Gemini/Groq) com prompt específico
- Fallback offline: data + descrição + valor (positivo/negativo)

### 9.4. Extrato Bancário (pdfplumber Python)
- Chama `python leitor_extratos.py <arquivo>`
- Detecta banco: Bradesco, Itaú, Nubank
- Retorna JSON com lançamentos (data, descrição, tipo, valor)
- Server.ts mapeia para formato Launch e persiste com dedup

---

## 10. Detecção de Duplicatas

```typescript
// src/duplicateDetection.ts
stringsAreSimilar(s1, s2): boolean  // Jaccard ≥ 0.5 após normalização + singularização

// server.ts
isDuplicate(a, b): boolean
// Mesmo valor (±R$0,05) + mesma data OU fuzzy match de descrição
// OU mesmo beneficiário + mesmo valor
```

- `GET /api/launches/duplicates/all` — agrupa por mês
- `POST /api/launches/duplicates/resolve` — escolhe principal (manual > planilha > extrato > pdf > itau_statement) + deleta resto
- Criação de launch via `POST /api/launches` — retorna 409 se duplicata detectada

---

## 11. Segurança e Persistência

- **Autenticação por token**: todas as rotas `/api/*` (exceto `/api/auth/*` e `/api/health`) exigem `Bearer token`. O token é gerado pelo administrador e revogável a qualquer momento (usuário perde o acesso na próxima chamada).
- **Sessão de administração**: conta admin (usuário + senha) protege os endpoints `/api/auth/admin/*` via `x-admin-token`; senha alterável pelo painel.
- **Backups automáticos**: a cada 24h ou a cada 10 escritas, salva em `backups/`
- **Shutdown hooks**: `process.on('exit')`, `SIGINT`, `SIGTERM` salvam DB
- **DB reset**: requer confirmação por string "RESETAR_BANCO"
- **Backup export/import**: formato JSON completo (DbSchema)
- **Chaves de API**: apenas no `.env`, nunca commitadas

---

## 12. Build e Instalação

### 12.1. Development
```bash
npm install
pip install -r requirements.txt    # opcional, para pdfplumber
npm run dev                         # tsx server.ts + Vite middleware
npm run electron:dev                # build + electron (app do usuário)
npm run electron:dev:admin          # build + electron (app do administrador)
```

### 12.2. Production build
```bash
npm run build                       # vite build (index + admin) + esbuild server.cjs
npm run electron:build              # build + electron-builder → My Financer (usuário)
npm run electron:build:admin        # build + electron-builder -c electron-builder.admin.json → My Financer Admin
```

### 12.3. Output
- `release/My Financer Setup 1.0.0.exe` — instalador NSIS (usuário)
- `release/win-unpacked/My Financer.exe` — versão portátil em pasta (abre direto, sem instalar)
- `release/admin/My Financer Admin Setup 1.0.0.exe` — instalador NSIS (admin)
- `release/admin/win-unpacked/My Financer Admin.exe` — versão portátil em pasta (admin)

> **Nota (Ago 2026):** o target `portable` (exe único auto-extraível) foi **removido** dos builds.
> Ele descompactava o app (~124MB, milhares de arquivos) no `%TEMP%` a cada abertura,
> levando ~40s e parecendo travado. O instalador NSIS e o `win-unpacked` abrem em ~5s.

### 12.4. Dados do usuário no Electron
- `FINANCER_DATA_DIR = app.getPath('userData')` (ex: `%APPDATA%/My Financer`)
- Contém: `financer_db.sqlite`, `backups/`, `uploads/`
- O app de administrador força `userData` para `%APPDATA%/My Financer` para **compartilhar o mesmo banco** com o app do usuário (não cria banco separado em `My Financer Admin`).
- Config do admin em `electron-builder.admin.json` (productName + `extraMetadata.main = electron/admin-main.cjs`).

---

## 13. Fixes e Decisões Técnicas Recentes

### 13.1. Input controlled component fix (Jul 2026)
**Problema**: warning React "A component is changing a controlled input to be uncontrolled" ao editar lançamento.
**Causa**: campo `editForm.value` mudava de `0` para `undefined` entre renders quando o campo era numérico vazio.
**Solução**: garantir que `editForm.value` nunca seja `undefined` — converter para `0` sempre que estiver editando e o valor for vazio/inválido.

### 13.2. Integration: pdfplumber (Jul 2026)
- Adicionado `leitor_extratos.py` com pdfplumber para parsing de extratos bancários
- Endpoint: `POST /api/v1/import/extrato-pdf`
- Suporte: Bradesco, Itaú, Nubank
- Server.ts: `runPythonExtractor()` → `mapPythonLaunchToApp()` → dedup → persist

### 13.3. Groq first in fallback chain (Jul 2026)
- Groq movido para 1º lugar na cadeia de IA (era Gemini)
- Gemini sem quota (429), DeepSeek sem saldo (402), OpenRouter inválida (401)

### 13.4. Separação Admin × Usuário (Ago 2026)
- A tela de login do usuário (`LoginScreen.tsx`) agora contém **somente** o campo de token — toda a área de administração foi removida.
- Criado app separado de administração: `admin.html` + `src/admin/AdminApp.tsx` (setup da conta admin, login, gerar/revogar/copiar tokens, alterar senha).
- Criado `electron/admin-main.cjs`, que força `userData = %APPDATA%/My Financer` para **compartilhar o mesmo banco** com o app do usuário.
- `vite.config.ts` ganhou multi-entry build (`index.html` + `admin.html` → `dist/admin.html`).
- `electron-builder.admin.json` gera um segundo executável **"My Financer Admin"** (`extraMetadata.main` aponta para `admin-main.cjs`).
- Servidor reusa processo na porta 3000: abrir os dois apps ao mesmo tempo mantém os dados sincronizados.
- Scripts novos: `electron:dev:admin` e `electron:build:admin`.

### 13.5. Tokens de acesso (Ago 2026)
- Sistema de autenticação por token: admin gera tokens `MF-...`; usuário entra colando o token.
- Endpoints: `/api/auth/*` documentados na seção 7.2.
- Tokens podem ser rotulados (ex: "Notebook da Maria"), têm `created_at`/`last_used_at` e podem ser revogados individualmente.
- Rotas protegidas exigem `Authorization: Bearer <token>`; rotas admin usam `x-admin-token`.

### 13.6. Redução de peso do pacote e fim do portable (Ago 2026)
- **Problema**: `win-unpacked` pesava ~580MB com ~13.700 arquivos (todo o `node_modules` empacotado). O exe portable re-extraía tudo a cada abertura e demorava ~40s+ (parecendo travado).
- **Causa**: o `dist/server.cjs` (bundle esbuild com `--packages=external`) só usa 7 pacotes em runtime; React, Vite, Tailwind, Recharts etc. eram frontend/build e já estão dentro do `dist` compilado.
- **Solução**: movidos todos os pacotes frontend/build para `devDependencies`; `dependencies` ficou só com `express`, `multer`, `pdf-parse`, `xlsx`, `sql.js`, `@google/genai`, `dotenv`.
- **Resultado**: pacote com ~1.6k arquivos; `win-unpacked` e instalador NSIS abrem em ~5s.
- **Removido** o target `portable` dos dois configs (`package.json` e `electron-builder.admin.json`).

---

## 14. Observações Técnicas

- `pdf-parse` é dependência legada; `leitor_extratos.py` (pdfplumber) é o método preferido para extratos
- Todas as rotas têm duplicata `/api/v1/*` por compatibilidade
- `package.json` → `"build"` → `asar: false` (intencional, para facilitar debug e evitar problemas de path) — o mesmo vale para `electron-builder.admin.json`
- A aplicação roda inteiramente sem Electron via `npm run dev` (útil para desenvolvimento web); o painel admin fica disponível em `/admin.html`
- O app foi originalmente criado como applet Google AI Studio (daí o título `My Google AI Studio App` no index.html) e posteriormente migrado para Electron standalone
- Dois executáveis (`My Financer` + `My Financer Admin`) compartilham o mesmo servidor local e o mesmo banco; ambos podem ficar abertos simultaneamente
