# CoMorar — Proposta de redesign (simplificação radical)

> Documento de decisão. Baseado na auditoria do código de 18/09/2026 (páginas, libs, RLS/RPCs e migrations) e nas diretrizes de `ia-alvo-comorar.md` e `README.md`. Toda alteração funcional implementada a partir desta proposta **deve** listar-se aqui.

## 0. Gerenciar expectativa

- Este app já tem **funcionalidades de sobra** (mercado por itens, medidor, parcelas, IOU, caixinhas, orçamento, relatórios, backup, Pix, notificações, OCR local). O problema **não é falta de recurso** — é que eles **competem entre si** por atenção dentro de telas densas.
- O redesign não tira recurso nenhum do back (tabelas, RPCs e RLS ficam). Ele **reconta a história** que o app conta ao usuário.
- Meta de adoção de curto prazo: do "login" ao "marcar uma conta como paga" em **menos de 20 segundos**, sem ler instrução.

---

## 1. Diagnóstico (o que está afastando o usuário)

### 1.1 Telas com múltiplos focos competindo

- **Início** (`Home.tsx`) mostra 3 números grandes distintos (gasto do mês + "você deve" + "devem a você", linhas 119–155) *com dois significados diferentes segundo o papel* (owner vê "gasto total", morador vê "sua parte"), depois previstas, depois últimas despesas — tudo sem uma pergunta única orientando a leitura.
- **Pagar** (`Pagar.tsx`, 773 linhas) tem lista do mês + abas "este mês/próximas" + link a recorrentes + botão "+ Avulsa" + 2 modais diferentes (pagamento e boleto) + OCR + Pix + "ignorar" + undo + Dica.
- **Avulsa** (`DespesaAvulsa.tsx`, 981 linhas) tem 3 modos (normal/mercado/medidor), rateio (3 regras), parcelamento, OCR, comprovante, combobox de fornecedor, "usar dados da última". Decisões-chave (divide como? quem paga?) ficam em `<details>` "Mais opções".
- **Perfil** (`Perfil.tsx`) é um depósito: convite + moradores + Pix + tema + categorias + taxas + recorrentes + relatórios + orçamento + backup + sair da casa + sair da conta.

### 1.2 Complexidade que vaza da regra para a interface

- Vocabulário técnico exposto: **rateio, recorrência, lançamento, prevista, cancelada, confirmada** — o usuário comum pensa em "conta", "mês", "paga/pendente".
- O mesmo objeto tem rótulos diferentes entre telas: `cancelada` vira "ignorado" (`RecorrenciaDetalhe`), "cancelada" (`DespesaDetalhe`) e "ignorar mês" (botão).
- Decisões de negócio importantes escondidas em `<details class="opcoes">`: tipo de rateio e pagador padrão da recorrência (`RecorrenciaForm`), limite em "outra categoria" (`Orcamento`).
- "Você deve" com escopo diferente em telas diferentes (mês na Home × total em aberto no Balanço) — a própria `ia-alvo-comorar.md` já aponta isso (item 3.1).
- A confirmação de ações críticas usa `window.confirm` em 5 páginas, sheet em 1 (`Orcamento`) e **nada** em `RecorrenciaDetalhe` — três padrões para a mesma operação.
- Botão dentro de `<Link>` (`Projecao.tsx:199–211`), two padrões de "ignorar" com/sem confirm.
- Re-tap de "Voltar" via `navigate(-1)` em quase todas as telas — quebra ao abrir por link direto.

### 1.3 Redundâncias que geram "função pela metade"

- **Ajustes (IOU)** têm backend pronto (`0027`) e código cliente pronto (`useAjustes`, `ajustesEmObrigacoes` em `dados.ts`) mas **nenhuma tela**. O owner ainda vê o balanço **sem** ajustes enquanto o morador vê **com** ajustes (`meu_saldo` RPC) — assimetria de valores.
- **Caixinhas** têm schema + trigger de saldo (`0027`) e **nenhuma UI**.
- Duas entradas de lançamento: `/nova` (Pagar) + `/avulsa` + `/despesa/:id/editar` (todos apontando para fluxos próximos). `ia-alvo` item 3.5 pede consolidar em "+ Pagar".
- Comprovante aparece em 2 cards no mesmo detalhe (`DespesaDetalhe.tsx:223` e `:337`).
- Previções aparecem na Home, no Pagar, no Extrato e nas Recorrências — quatro lugares, affordances diferentes.

### 1.4 Bugs de produto (lógica)

- Cache de despesas sem invalidação no logout (`dados.ts` global, `AppContext.signOut` não limpa) — vaza dados entre sessões no TTL de 30s.
- `percentuais` com semântica dupla em `rateioEspecial` (pesos brutos no campo "0–100").
- `calcularRateio` não valida soma 100; chamador fora da UI renormaliza em silêncio.
- Extrato em PDF do morador soma previstas no valor cheio, mas confirmadas pela própria parte — assimetria (`extratoPdf.ts:48`).
- `dicas.ts` sem try/catch em localStorage.
- `comprovante.ts` pode subir Blob vazio e `removerComprovante` engole erro.

> Bug lógico fica fora do escopo visual; entra na **Fase 4** abaixo.

---

## 2. Público-alvo e princípios de design

**Público:** adolescente no primeiro apartamento (pouca atenção, nunca leu um manual) e adulto exausto do trabalho (quer 1 toque, não 10 campos). Os dois abandonam no 3º entrave.

Princípios (em ordem de prioridade):

1. **Uma pergunta por tela.** Toda tela tem exatamente UM verbo guia. Ex.: Início = "quanto do mês já está resolvido?" · Pagar = "você pagou uma conta?" · Saldo = "quem deve quanto?"
2. **Ações, não vocabulário.** As únicas palavras novas que o usuário aprende: **conta**, **parte**, **acerto**. Todo termo técnico (rateio, recorrência, prevista, lançamento) some da UI.
3. **Zero fricção no caminho feliz.** A ação mais comum (marcar uma conta como paga) não exige preencher valor nem vencimento nem comprovante — tudo tem default e o usuário só confirma.
4. **Defaults inteligentes.** "Quem pagou = Eu", "Data = hoje", "Divisão = igual para todos", "Comprovante = opcional". Correção é barata; pergunta a menos é ganho.
5. **Um padrão para cada ação.** Sheet para confirmar, push para editar, inline para micro-ações. Nunca `window.confirm`. Nunca botão dentro de link.
6. **Pessoal antes de coletivo.** Home prioriza "meu mês"; o extrato completo da casa é um segundo passo, não a porta de entrada.
7. **Consistência de vocabulário** (seção 4) aplicada a badges, botões e empty-states.

---

## 3. Arquitetura de informação (navegação)

Mantém o modelo atual (mais saudável que o do README): **4 abas + centro +Pagre**. Renomeia rótulos para a fala do usuário e delimita o QUE cada aba mostra, eliminando o conteúdo "órfão".

| Aba | Rótulo | Uma pergunta | Conteúdo (só isso) | Natureza |
|---|---|---|---|---|
| `/` | **Início** | "Como está meu mês?" | Card de saldo único (escopo = mês atual), contas a pagar do mês (só as que me envolvem), últimas 4 contas pagas que me envolvem. **Sem** gasto total da casa, **sem** link a relatórios. | Pessoal |
| `/mes` | **Gastos** | "O que aconteceu este mês?" | Extrato da casa com navegação de mês + busca. Filtros por categoria só dentro do filtro (não na Home). | Coletivo |
| `/balanco` | **Meu saldo** | "Quem deve quanto pra quem?" | **Só o meu**: "preciso pagar" (com Pix) + "vão me pagar". Owner ganha um modo "casa inteira" com unidades mínimas de transferência. | Pessoal |
| `/nova` | **+ Pagar** | "Você pagou alguma conta hoje?" | Fluxo único em 2 passos (seção 6.4). Boleto/OCR/Pix entram como "mitigar digitação", nunca como obstáculo. | Coletivo |
| `/perfil` | **Perfil** | "Onde fica a config?" | Grupos: **Casa** (convite, moradores, taxas, categorias) · **Minhas coisas** (chave Pix, tema) · **Gestão** (contas que se repetem, relatórios, orçamento, backup — só owner ativo) · **Conta** (sair). | Gestão |

Regras de navegação:
- **Toda despesa é clicável → detalhe** (Home, Gastos, Pagar, Recorrências). Ações secundárias (ignorar, pagar, boleto) **não** ficam dentro de links.
- **One "voltar" consciente**: substituir `navigate(-1)` por destino explícito (ex.: "Voltar para Gastos"). Onde não houver origem conhecida, `useNavigate(-1)` com fallback.
- Cross-fade entre abas (já existe) e push com slide para hierarquia (já existe) são mantidos.

---

## 4. Vocabulário único (glossário de UI)

| Termo dado ao usuário | Substitui | Onde |
|---|---|---|
| **Conta** | despesa / lançamento | listas, detalhe, botões |
| **Paguei** (botão) | "Confirmar pagamento" | fluxo + Pagar |
| **Minha parte** | "rateio / valor_rateado" | todas as listas |
| **Acertar** | "liquidar / registrar pagamento" | Meu saldo |
| **Igual para todos** | rateio igual | select de divisão |
| **Dividir diferente** | percentual / consumo / "só quem usa" | painel de divisão |
| **Conta que se repete** | recorrência | Perfil/gestão |
| **Próxima conta** | prevista | Home, Gastos |
| **Atrasada** | "atrasado" (badge) | badges |
| **Paga / Pendente / Ignorada** | confirmada / prevista / cancelada | badges em toda a UI |

Badge padrão de status de conta: **a vencer** (azul/muted) · **atrasada** (vermelho) · **paga** (verde) · **sua parte pendente** (âmbar) · **ignorada** (cinza). Nunca "prevista"/"confirmada"/"cancelada" na interface.

---

## 5. Regras de negócio recriadas (simplificação da lente, mesmos dados)

As regras de **cálculo** (rateio igual/percentual/consumo, compensação mínima, recorrência +12m, medidor, mercado) **permanecem** — já estão corretas e testadas. O que muda é o **contrato que a UI apresenta ao usuário**, e 5 regras de produto ganham correção:

### 5.1 Modelo mental: 3 verbos
1. **Gasta** → "Paguei uma conta" (prevista ou nova). O app pergunta pouco e divide sozinho.
2. **Deve** → A dívida de cada um é calculada automaticamente; ninguém edita "quanto devo".
3. **Acerta** → Quem deve transfere (Pix), marca como pago; quem recebe confirma. Acerto pode ser parcial.

### 5.2 Regras do caminho feliz (valores-padrão)
- **Divisão padrão = igual entre moradores ativos.** Percentual e consumo são exceção explícita ("dividir diferente") — nunca o default silencioso.
- **Quem pagou = o usuário**, pré-selecionado. Só muda se ele diz.
- **Data = data de hoje**, editável.
- **Valor real de uma próxima conta** = valor previsto, pré-preenchido; o usuário só ajusta se saiu diferente.
- **Comprovante = opcional** em todo o fluxo; no fluxo rápido, "pagar" nem abre foto: há botão "ver boleto" secundário.

### 5.3 Correções de lógica que viram regra de produto
1. **Balanço único e consistente**: `meu_saldo` (RPC, inclui ajustes) vira **fonte única** para o saldo pessoal — inclusive para o owner. A tela do owner usa a RPC por período, e o modo "matriz da casa" usa `compactarTransferencias(obrigacoesDe(despesas) + ajustesEmObrigacoes(ajustes))`. **Bug de assimetria (1.4) fecha aqui.** (Fase 3.)
2. **Saldo na Home sempre "em aberto do mês"**; o rótulo explicita: "mês de setembro" ou "total em aberto". Nunca dois números iguais com escopo diferente sem rótulo.
3. **Estado visível da conta = 3**: próxima/paga/ignorada. A tela (despesa prevista) "volta a ser próxima" em vez de "desfazer pagamento".
4. **Recorrência criada sem decisões escondidas**: tipo de divisão e "quem paga por padrão" saem do `<details>` e ficam em 1 passo opcional "igual para sempre?" com defaults. (Ver 6.6.)
5. **Ignorar = não cobra, não apaga.** Destino do botão "Ignorar" documenta explicitamente que a recorrência continua para os próximos meses.

### 5.4 Regras mantidas (registro para não regredir)
- Quem pagou não deve a si mesmo (ja nasce pago).
- Soma do rateio = valor da conta, centavos resolvidos.
- Morador inativo não entra em divisão nova.
- Percentual soma 100 (±0,5).
- Item de mercado sem dono = comum (divide todo mundo).
- Medidor: quem não informa leitura entra na média; leitura atual < anterior é recusada.
- Previções geradas até +12 meses; dia 31 cai no último dia do mês.
- Backup/restauração só do owner.

---

## 6. Redesign tela a tela (antes → depois)

### 6.1 Login
**Antes:** 2 segmentos + 3 campos; sem "esqueci a senha"; sem mostrar senha.
**Depois:** uma decisão (entrar/criar), link "Esqueci a senha" (`resetPasswordForEmail` → e-mail), toggle 👁 de senha, copy curta ("Sua casa, suas contas, um app.").

### 6.2 Onboarding
**Antes:** título genérico + parágrafo longo + 2 formas no mesmo card.
**Depois:** 2 grandes escolhas visuais ("Criar casa" / "Tenho um código"). Criar = 1 campo (nome) + "você é o responsável". Entrar = 1 campo (código). Texto de apoio em 1 linha.

### 6.3 Início (Home)
**Antes:** 3 números + previstas + últimas + dicas + rodapé de owner.
**Depois:**
1. `h1` curto com saudação: "Seu mês" + subtítulo "setembro de 2026".
2. **Card saldo único** = a pergunta da tela: linha "Você deve" + número grande; linha menor "vão te pagar R$ X" + link "Ver acerto".
3. **"Contas do mês para pagar"** — só as que me envolvem, em lista com botão **"Paguei ✓"** direto na linha (não abre sheet na Home; executa rápido com feedback otimista). Atrasadas em vermelho por badge.
4. **"Acabou de pagar"** — últimas 4 contas pagas que me envolvem.
5. Nem Dica, nem rodapé de owner. Empty states com 1 ação.

### 6.4 + Pagar
**Antes:** abas mês/próximas + link contas recorrentes + "avulsa" + dicas + rodapé.
**Depois — fluxo em 2 passos:**
1. **Passo 1 (lista):** "Contas do mês para pagar" (previstas, somente do mês, agrupadas) cada uma com botão **Paguei**. Aba "próximas" vira link discreto. Sem Dica.
2. **Passo 2 (sheet único):** valor (pré-preenchido), quem pagou (pré="eu"), data (pré=vencimento), e **uma** área colapsada discreta: "anexar boleto/ler QR". Botão final: **"Marcar como paga"**.
3. **Nova conta avulsa** entra como botão adjacente que **reusa o mesmo componente** (sem rota paralela `/avulsa` por dentro da aba; consolidação da `ia-alvo`).

### 6.5 Gastos (extrato)
**Antes:** busca + chips de categoria no topo + exportar PDF + linha de total.
**Depois:** navegação de mês fixa no topo; busca como ícone que abre; categorias em filtro (sheet) não em chips permanentes; "Exportar PDF" em menu ⋯. Badges pelo vocabulário novo. Filtrar "só o que me envolve" como toggle inicial (default: tudo), respeitando 0025 (casa inteira visível).

### 6.6 Conta que se repete (recorrência)
**Antes:** formulário com "Mais opções" escondendo divisão e pagador.
**Depois:** 4 campos visíveis (fornecedor, valor, quando repete, dia); painel "divisão" em 1 passo com defaults; sem `details` para decisão-chave. Previsões futuras visíveis como "próximas contas" com botão "pular mês" usando sheet de confirmação.

### 6.7 Meu saldo
**Antes:** owner usa `obrigacoesDe` (sem ajustes) e morador usa RPC (com ajustes).
**Depois:** fonte única = RPC `meu_saldo` (conserta a assimetria), com filtro de período (mês / acumulado). Duas seções: "Você deve" (com botão **Copiar Pix** e **Registrar acerto**) e "Devem a você" (com **Confirmar recebimento**). Owner: chave "ver a casa toda" abre a matriz mínima de transferências.

### 6.8 Detalhe da conta
**Antes:** 5 badges + card info + card comprovante + card boleto duplicado + 4 botões.
**Depois:** badge único de status; valor gigante; linha "paguei/fulano pagou em [data]"; uma seção "quem divide" (lista "parte de cada um" com estado pago/pendente + botão marcar a minha); **um** card de comprovante com "anexar/substituir/ver" e ampliar em lightbox; "Editar"/"Excluir" agrupados em ⋯ (owner), com sheet de confirmação de exclusão. Desfazer pagamento vira "voltar a ser próxima" (administrativo, sheet).

### 6.9 Perfil
**Antes:** depósito único.
**Depois:** 4 grupos com títulos claros (seção 3). Member vê: Casa (moradores, convite) + Minhas coisas (Pix, tema) + Conta (sair). Owner adiciona: Gestão (contas que se repetem, relatórios, orçamento, categorias, taxas, backup). Cada grupo em `card-flush` com links → telas (já existem).

### 6.10 Orçamento
**Antes:** informação redundante 4x por card + details + 2 padrões de modal.
**Depois:** barra única + texto único ("R$ 850 de R$ 800 → 6% acima"), badge só de estado; adicionar limite por sheet (padrão do app); remover com sheet de confirmação.

### 6.11 Notificações
**Antes:** nota de rodapé expondo limitação + lista sem paginação.
**Depois:** limitação (push/e-mail) escondida; seções "novas/lidas"; manter ponta roll. Sem texto técnico.

---

## 7. Componentes novos (design system mínimo)

| Componente | Função | Substitui |
|---|---|---|
| `Confirmacao` (sheet) | Confirmar ação destrutiva na mesma linguagem do app (botão perigoso destacado) | `window.confirm` em todas as páginas (Fase 2) |
| `EmptyState` | Estado vazio com 1 ação e copy do vocabulário novo | `div.empty` soltas |
| `BadgeStatus` | Badge com as 5 acepções do glossário | badges ad-hoc |
| `BotaoPagar` / linha "Paguei" | Marca paga otimista direto da lista | sheet de confirmação na Home |
| `CabeçalhoMês` | Navegação mês ← → com total, reutilizada em Gastos e Início | duplicação `voltarMes/avancarMes` |

---

## 8. Recursos: implementado vs planejado (matriz para o fluxo da proposta)

Fonte: migrations (`supabase/migrations`), README §10 e `ia-alvo`. Backend está à frente do front — 2 recursos estão "pela metade" justamente no ponto que o usuário chamou de "função pela metade".

| Recurso | Back | Front | Situação | Onde entra no redesign |
|---|---|---|---|---|
| Auth + casa + convite | ✅ | ✅ | OK | Fluxo Onboarding (6.2) |
| Despesa + rateio (igual/percentual/consumo) | ✅ | ✅ | OK | Vocabulário + defaults (5.2) |
| Balanço + compensação mínima + acerto | ✅ | ✅ | **Corrigido (18/09)** | Fonte única `meu_saldo` (5.3.1, 6.7) |
| Previsões +12m (pg_cron) | ✅ | ✅ | OK | "Próxima conta" (4, 6.6) |
| Comprovante (storage + OCR local + boleto + Pix) | ✅ | ✅ | OK | Nunca bloqueia (6.4) |
| Notificações in-app + pref. | ✅ | ✅ | Push/email faltam (README 10.1) → esconder limitação | 6.11 |
| Relatórios (resumo_mensal) | ✅ | ✅ | Só owner | Perfil/Gestão |
| Orçamento (orcamento_uso + aviso) | ✅ | ✅ | OK | 6.10 |
| Mercado por itens (10.4) | ✅ | ✅ | OK | Esconder atrás de "dividir por itens" |
| Parcelas (10.10) | ✅ | ✅ | OK | Só no fluxo avulso |
| Medidor água/luz (10.11) | ✅ | ✅ | OK | Só quando categoria é água/luz |
| Chave Pix (10.7) | ✅ | ✅ | OK | Meu saldo (6.7) |
| Backup/restauração (10.6) | ✅ | ✅ | Só owner | Perfil/Gestão |
| **Ajustes / IOU (10.5)** | ✅ | ✅ | **Feito (18/09)** | **Meu saldo**: "Anotar acerto" + confirmar/cancelar (Fase 3) - corrige bug 1.4 |
| **Caixinhas (10.5)** | ✅ | ✅ | **Feito (18/09)** | Perfil/Gestão (Fase 4) — criar, depositar/retirar, extrato, excluir |
| PDF extrato (10.2) | — | ✅ | OK | Menu ⋯ em Gastos |
| Push/e-mail lembrete (10.1) | — | — | Planejado | silenciosamente fora (6.11) |
| Compensação automática de saldo acumulado (10.3) | — | — | **Parcial** (meu_saldo tem aberto) | Meu saldo com período (6.7) |
| Editável rls por envolvimento (ia-alvo §5) | ⚠️ revertido 0025 | — | Decidiu-se por casa inteira | manter |

**Decisão de produto:** nada de aba nova. Tudo novo entra por + Pagar, Meu saldo ou Perfil/Gestão (alinha com `ia-alvo` §4).

---

## 9. Roadmap de implementação

### Fase 1 — Primeiro contato (sem tocar em lógica)
Login, Onboarding, Início, + Pagar caminho feliz, rótulos da aba, vocabulário nas listas, `Confirmacao` componente. *Objetivo: 20s do login à ação.*

**Implementado em 18/09/2026:**
- [x] `Confirmacao` (sheet) criado em `src/components/Confirmacao.tsx` + CSS `.sheet-titulo`/`.btn-mudo`.
- [x] Início: foco único "Você deve" por mês; "Contas do mês para pagar" e "Acabou de pagar"; Dica e rodapé de owner removidos; empty state de 1 ação.
- [x] Login: "Esqueci a senha" (`resetPasswordForEmail`), mostrar/ocultar senha, copy curto.
- [x] Onboarding: copy enxuto.
- [x] Perfil reorganizado em **Sua casa / Minhas coisas / Gestão / Minha conta**; Pix saiu da lista de moradores para card próprio; recorrentes renomeadas para "Contas que se repetem".
- [x] Confirmações por sheet no Perfil (remover morador, sair da casa, restaurar backup) e no Detalhe (excluir, desfazer pagamento).
- [x] Badge de status no Detalhe no novo vocabulário (Atrasada / A vencer / Paga / Ignorada).
- Pendente (segue na Fase 2): `window.confirm` restantes em `Pagar`, `Projecao`, `RecorrenciaEditar`, `Orcamento`, `Categorias`; detalhe com comprovante unificado.

### Fase 2 — Confiança e consistência
`BadgeStatus`, `EmptyState`, substituir todos os `window.confirm`, unificar "voltar" com destino, detalhe da conta enxuto, Gastos com filtro em sheet.

**Implementado em 18/09/2026:**
- [x] Todos os `window.confirm` convertidos para o sheet `Confirmacao` — agora **zero** no código (`Categorias`, `RecorrenciaEditar`, `Projecao`, `Orcamento`, `Pagar`, além de `Perfil`/`DespesaDetalhe` na Fase 1).
- [x] Vocabulário novo nas listas: badges **Atrasada / A vencer / Paga / Ignorada** em `Pagar`, `Projecao`, `ListaMensal`, `RecorrenciaDetalhe`; títulos "Contas que se repetem", "Categorias"; "Nenhuma conta neste mês"; "Divisão" no lugar de "Rateio" (Detalhe de recorrente).
- [x] `Pagar`/`Projecao`: Dica removida (foco na ação); link com botão interno corrigido (div role=link + navigate) em `Projecao`.
- Pendente (opcional): componente `BadgeStatus`/`EmptyState` compartilhado; filtro de categoria em sheet na Gastos; "voltar" com destino em todas as telas.

### Fase 3 — Correções de produto
Balanço com fonte única (`meu_saldo`) + tela de **Ajustes (IOU)** no Meu saldo; cache invalidado no logout; validação de percentual no lib; conserto da soma de previstas do PDF; `rateioEspecial` com contrato limpo.

**Implementado em 18/09/2026:**
- [x] Cache de despesas invalidado no logout e no evento `SIGNED_OUT` (`src/state/AppContext.tsx`) — corrige vazamento de dados entre sessões.
- [x] PDF (`src/lib/extratoPdf.ts`): previstas agora somam **a parte do morador** (antes, valor cheio na visão não-owner); vocabulário no corpo ("Contas", "A vencer"/"Paga"/"Pendente"/"Confirmada").
- [x] `src/lib/rateio.ts`: novo `validarPercentuais(…)` (mensagem única para a regra 100%) usado por `Regras` e `DespesaAvulsa`; campo `pesos` adicionado ao `ConfigRateio` para a regra `consumo`, separando peso de percentual.
- [x] `src/lib/rateioEspecial.ts`: mercado e medidor agora usam `pesos` (pesos brutos) em vez de sobrecarregar `percentuais` com semântica "0–100".
- [x] **Balanço em fonte única** (`src/pages/Balanco.tsx`): owner passou a usar a RPC `meu_saldo` (inclui ajustes) para o próprio card; a matriz da casa usa `compactarTransferencias(obrigacoesDe(despesas) + ajustesEmObrigacoes(ajustes))`. Acerto de par com IOU paga os acertos anotados.
- [x] **Tela de Ajustes (IOU)** no Meu saldo: "Anotar acerto" (quem deve → para quem, valor, motivo), lista de "Acertos anotados" com **Confirmar** (credor marca pago) e **Cancelar** (via sheet, atualiza `cancelado`); botão inativo para os demais.
- [x] `useAjustes` passou a expor `recarregar` para refrescar após operações.

### Fase 4 — Gestão e polimento
Perfil em grupos (6.9), orçamento (6.10), notificações (6.11), caixinhas (UI básica em Perfil/Gestão), estados (loading/empty/error/offline), a11y.

**Implementado em 18/09/2026:**
- [x] Perfil em grupos já vinha da Fase 1 (**Sua casa / Minhas coisas / Gestão / Minha conta**).
- [x] Orçamento (6.10): `<details>` de "outra categoria" removido — agora botão **"Adicionar limite"** abre o sheet com seletor de categoria; botões de mês com `aria-label`.
- [x] Notificações (6.11): limitação de push/e-mail **escondida** (rodapé removido); lista em seções **Novas / Lidas**; vocabulário sem termos técnicos.
- [x] **Caixinhas** (`src/pages/Caixinhas.tsx` + rota `/perfil/caixinhas` + link em Perfil/Gestão): criar caixinha (sheet, owner), depositar/retirar (qualquer morador, saldo via trigger 0027), extrato por caixinha, excluir (sheet, owner). "divisão: igual" explícita (regra percentual é vestigial no schema).
- [x] Estados: empty-states com 1 ação e ícone nas telas novas (caixinhas, notificações); loading padrão do app.
- [x] a11y: `aria-label` nos botões de navegação de mês (Orçamento, Gastos); rotulagem já existente mantida (nav inferior, sino, sheets como `alertdialog`).
- [x] Vocabulário: `previstos` → "a vencer" no cabeçalho de Gastos.
- Pendente (opcional): `BadgeStatus`/`EmptyState` compartilhados; detalhe da conta com comprovante unificado; filtro de categoria em sheet na Gastos; "voltar" com destino em toda a hierarquia.

---

## 10. Critérios de aceite (toda fase)

- [ ] Não quebra rota, RPC, RLS nem cálculo existente.
- [ ] Badges/blás só usam o vocabulário da seção 4.
- [ ] Nenhuma `window.confirm` restante nas telas tocadas (sheet em todas).
- [ ] "Voltar" com destino explicitado quando a origem é conhecida.
- [ ] Nenhuma decisão de negócio exige abrir `<details>` no caminho feliz.
- [ ] Lint + testes (`npm test`) + build (`npm run build`) passam.