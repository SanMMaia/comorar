# Comorar — Divisão de despesas entre moradores

App mobile-first (PWA) para dividir despesas de uma mesma casa entre os moradores, com rateio, balanço automático e anexo de comprovantes.

## 1. Visão e objetivo

Permitir que moradores de uma mesma casa registrem despesas (aluguel, luz, água, mercado, internet...) e saibam, a qualquer momento, **quem deve quanto para quem** — com rateio justo e comprovante anexado.

**Diferencial:** mobile-first, sem gasto com publicação (PWA instalável no home screen do iPhone/iOS) e leitura de comprovantes via OCR gratuito (NVIDIA NIM).

## 2. Personas / Público

- **Inquilinos** dividindo aluguel + contas (2 a N pessoas).
- **Casa dividida entre amigos** com compras coletivas variáveis.
- Casais / famílias que dividem custo da casa.

## 3. Escopo da v1 (MVP)

### Funcionalidades

- **Login com Supabase Auth** (email+senha e opcional Google/Apple).
- **Conta "Casa"**: criar casa e convidar moradores por código.
- **Lançamento de despesa** com:
  - **Fornecedor** (obrigatório) — auto-complete a partir do histórico da casa
  - Descrição (opcional) — ex.: "Conta de luz junho"
  - Valor (obrigatório)
  - Categoria (obrigatório): aluguel, luz, água, internet, mercado, outro
  - Quem pagou (obrigatório)
  - Comprovante/boleto anexado (foto; armazenado no Supabase Storage)
- **Rateio** da despesa entre moradores — ver seção 5.
- **Balanço automático**: quem deve quem, com sugestão de compensação mínima de transferências.
- **Liquidação**: marcar rateio como pago quando o morador paga sua parte.
- **Histórico mensal** com agrupamento por fornecedor/categoria.
- **Recorrências com projeção futura**:
  - Cadastro de contas que se repetem (aluguel, luz, internet...) com fornecedor, categoria, valor previsto, dia do vencimento e regra de rateio.
  - Lançamentos **"previstos"** gerados automaticamente até +12 meses (projeção futura).
  - Na data, o morador **anexa o boleto/comprovante, atualiza o valor se mudou e confirma** — a despesa vira real e o rateio é criado automaticamente.
  - Previstas não confirmadas permanecem na projeção; podem ser canceladas sem cobrança.

### Fora do escopo v1

- Extrato mensal em PDF (v1.5)
- Lembretes / notificações push (v2)
- Compras de mercado com itens, ajustes (IOU) e contas conjuntas (v2)
- Saldo acumulado e compensação automática (v2)
- Login social obrigatório (opcional)

## 4. Regras de negócio

### Rateio

Cada despesa define a regra de divisão entre os **moradores ativos** da casa:

| Regra | Como calcula |
|---|---|
| **Igual** | Divide o valor pelo nº de moradores ativos |
| **Percentual fixo** | Cada morador tem um % configurado (soma deve dar 100) — ex.: quem usa o quarto maior paga mais |
| **Só quem consumiu** | Seleciona os moradores incluídos; divide entre eles (igual ou por % pré-configurado) |

- O percentual fixo é configurado por casa (podendo ser sobrescrito numa despesa específica).
- Moradores convidados mas ainda sem conta não participam do rateio.

### Balanço e liquidação

- Cada rateio gera uma obrigação `morador B deve R$ X para morador A` (quem pagou é o credor).
- Ao saldar, a obrigação é marcada como paga, reduzindo o saldo geral.
- O balanço mensal mostra: **quanto você deve** e **quanto devem para você**.

### Recorrências e projeção futura

- **Recorrência** = uma conta que se repete (ex.: "Enel, todo dia 10"). Gera lançamentos **previstos** automaticamente até **+12 meses** de antecedência.
- **Previsão** respeita o calendário: dia 31 cai no último dia do mês (30, 28/fev...).
- **Valor previsto** é estimativa — luz e mercado variam. Ao **confirmar** a prevista (anexando boleto), o valor é **editável e pré-preenchido pelo OCR** — ou seja, o morador pode ajustar antes de salvar.
- **Ciclo de vida da despesa recorrente:**
  ```
  prevista (gerada automaticamente, aparece na projeção "próximas contas")
    → confirmada (anexou boleto + valor ajustado + salvo → vira despesa real c/ rateio)
    → cancelada (skip do mês; não entra no balanço)
  ```
- A regra de rateio da recorrência é herdada; o **responsável pelo pagamento** pode ser fixo, definido por padrão na recorrência, ou rotativo (cada mês um morador) — configurável.
- Projeção vs histórico: a tela separa **"Próximas contas"** (previstas) das **confirmadas** (já lançadas no mês).

## 5. Modelo de dados (Supabase)

Usuários autenticados vêm da tabela `auth.users` do Supabase.

### `casas`
| campo | tipo | obs |
|---|---|---|
| id | uuid PK | |
| nome | text | |
| codigo_convite | text | código curto para entrar na casa |

### `casa_morador`
| campo | tipo | obs |
|---|---|---|
| id | uuid PK | |
| casa_id | uuid FK | |
| user_id | uuid FK → auth.users | |
| role | text | `owner` / `member` |
| ativo | bool | |
| criado_em | timestamptz | |

### `regras_rateio` (percentual fixo por casa)
| campo | tipo | obs |
|---|---|---|
| casa_id | uuid FK | |
| user_id | uuid FK | |
| percentual | numeric | 0–100 |

### `recorrencias`
| campo | tipo | obs |
|---|---|---|
| id | uuid PK | |
| casa_id | uuid FK | |
| fornecedor | text | ex.: "Enel", "aluguel" |
| descricao | text | opcional |
| categoria | enum | aluguel, luz, água, internet, mercado, outro |
| valor_previsto | numeric(12,2) | estimativa padrão |
| dia_vencimento | int | 1–31 (dias inexistentes = último dia do mês) |
| intervalo | enum | `mensal` / `semanal` / `quinzenal` / `anual` |
| tipo_rateio | enum | `igual` / `percentual` / `consumo` |
| pagador_padrao | uuid FK | opcional; null = definir na confirmação |
| rotativo | bool | pagamento alterna entre moradores (ex.: cada mês um) |
| ativa | bool | |
| criado_em | timestamptz | |

### `despesas`
| campo | tipo | obs |
|---|---|---|
| id | uuid PK | |
| casa_id | uuid FK | |
| fornecedor | text | obrigatório |
| descricao | text | opcional |
| valor | numeric(12,2) | > 0 |
| categoria | enum | aluguel, luz, água, internet, mercado, outro |
| pago_por | uuid FK | morador que pagou (credor) |
| tipo_rateio | enum | `igual` / `percentual` / `consumo` |
| status | enum | `prevista` / `confirmada` / `cancelada` |
| origem_recorrencia_id | uuid FK | null se lançada manualmente |
| data | date | |
| comprovante_url | text | caminho no Storage |
| ocr_resultado | jsonb | dados extraídos do recibo (para revisão) |
| criado_em | timestamptz | |

### `rateios`
| campo | tipo | obs |
|---|---|---|
| id | uuid PK | |
| despesa_id | uuid FK | |
| morador_id | uuid FK | devedor |
| valor_rateado | numeric(12,2) | |
| pago | bool | |
| pago_em | timestamptz | |
| confirmado_por | uuid FK | credor que confirmou o pagamento |

### `obrigacoes` (derivado / a partir do rateio)
Quem deve para quem, por mês — resultante dos `rateios` não pagos, agrupado por devedor→credor, permitindo o cálculo do balanço e da **compensação mínima**.

> RLS (Row Level Security) ativo em todas as tabelas: membro ativo da casa pode ler; apenas `owner` pode alterar regras e anexos.

## 6. OCR de comprovantes (NVIDIA NIM — gratuito)

Fluxo:

```
câmera/upload (#input capture) → imagem → Supabase Storage
   → Edge Function chama NVIDIA NIM (OpenAI-compatible)
      POST https://integrate.api.nvidia.com/v1/chat/completions
      model: nvidia/nemotron-parse (fallback: meta/llama-3.2-90b-vision-instruct)
      prompt: extrair {fornecedor, valor, data, categoria} → JSON
   → pré-preenche o formulário → usuário confirma → salva despesas
```

- **Free tier**: até 40 req/min, sem cartão de crédito. Mais que suficiente para uso doméstico.
- **Fallback**: se o OCR falhar ou a cota esgotar, o formulário fica totalmente manual.
- **Boleto (v1.5)**: leitura da linha digitável via câmera (`jsQR`) + decodificação local (`boleto-utils`) — extrai valor/vencimento sem IA.

## 7. Stack

| Camada | Tecnologia | Motivo |
|---|---|---|
| App | React + Vite (**PWA**, mobile-first) | Zero custo de publicação, instala no iOS/Android home screen, código único |
| Auth + Banco + Storage + Edge Functions | **Supabase** | Login, Postgres com RLS, storage de comprovantes, serverless p/ OCR |
| OCR | **NVIDIA NIM** (nemotron-parse / llama-3.2-90b-vision) | Gratuito, OpenAI-compatible |
| Embrulho p/ loja (futuro) | Capacitor | Reaproveita o mesmo código se um dia publicar |

## 8. Fluxo de telas (esboço)

1. **Login / Criar conta** (Supabase Auth)
2. **Onboarding** — criar casa ou entrar via código de convite
3. **Home** — resumo do mês: "Você deve R$ X ∙ Devem a você R$ Y", últimos lançamentos
4. **Nova despesa** — [foto/OCR ou manual] → fornecedor → valor → categoria → quem pagou → rateio → salvar
5. **Lista mensal** — despesas do mês, filtro por categoria/fornecedor
6. **Detalhe da despesa** — dados, rateio por morador, foto do comprovante, status de cada pagamento
7. **Balanço / Liquidação** — quem deve a quem; confirmar recebimento
8. **Recorrências** — criar/editar contas que se repetem
9. **Próximas contas (projeção)** — previstas dos próximos 12 meses: "Anexar boleto" → confirmar/cancelar cada uma
10. **Perfil** — configurar taxa fixa de rateio, sair da casa

## 9. Roadmap

### v1 — MVP (core)
- Auth (Supabase), casa + convite, lançamento manual, rateio, balanço, liquidação, anexo de foto, histórico mensal.
- **Recorrências + projeção futura** (auto-geração de previstas em +12 meses, confirmar/cancelar com anexo de boleto e ajuste de valor).

### v1.5
- OCR de comprovante via NIM (nemotron-parse) com revisão manual.
- Leitura de linha digitável de boleto.
- Auto-complete de fornecedor pelo histórico.
- **Extrato mensal em PDF** (seção 10.2).
- **Backup/restauração JSON** dos dados da casa (seção 10.6).

### v2
- **Lembretes e notificações** — push, e-mail e inbox in-app (seção 10.1).
- **Compras de mercado com itens** — divisão pelo que cada um levou (seção 10.4).
- **Ajustes (IOU) e contas conjuntas / caixinhas** (seção 10.5).
- **Saldo acumulado e compensação automática** — saldo em aberto persiste, balanço sugere o menor nº de transferências (seção 10.3).
- **Chave Pix por morador** — copia-e-cola para cobrar/quitadar (seção 10.7).
- **Comparativo mês a mês** de gastos por categoria (seção 10.8).
- Pagamento rotativo automático por recorrência.
- Login social (Google/Apple).
- Publicação na App Store via Capacitor (quando o usuário quiser investir nos US$ 99/ano).

### v2.5
- **Orçamento por categoria** com alerta de estouro (seção 10.9).
- **Despesa parcelada** — valor entra no balanço de forma proporcional por mês (seção 10.10).
- **Consumo real por medidor** — água/luz por leitura (kWh/m³) em vez de rateio fixo (seção 10.11).
- **Otimizações técnicas contínuas** (seção 10.12).

## 10. Recursos futuros — base de design

Bases e regras de negócio dos recursos planejados, servindo de referência para a implementação de cada um.

### 10.1 Lembretes e notificações (v2)

**Objetivo:** avisar o morador quando uma conta prevista está próxima do vencimento, quando é criado um rateio contra ele e quando alguém confirma o pagamento.

- **Canais:**
  - **Inbox in-app**: notificações lidas/não lidas na Home (funciona em qualquer navegador/PWA — incluindo iOS).
  - **Web Push** (VAPID): somente em PWA instalado no home screen (iOS 16.4+); em Android/navegadores desktop também funciona.
  - **E-mail** (fallback): lembrete de vencimento, quando push não estiver disponível.
- **Tabelas novas:**
  | tabela | campos | obs |
  |---|---|---|
  | `notificacoes` | id, user_id, tipo, titulo, corpo, link_destino, lida, criado_em | inbox in-app |
  | `preferencias_notificacao` | user_id, **ativo**, dias_antecedencia, canais | padrão: ativo=sim, 3 dias, inbox+push |
- **Rotina:** `pg_cron` diário → Edge Function consulta previstas a vencer em N dias e eventos recentes (rateio criado, pagamento confirmado) → grava na inbox e dispara push/e-mail.
- **Regras:** não notificar sobre previstas canceladas; resgatar preferência por usuário; a notificação leva à tela correta (próximas contas / pagar).

### 10.2 Extrato mensal em PDF (v1.5)

**Objetivo:** exportar o resumo do mês (período) em PDF para arquivar/compartilhar.

- **Geração no cliente** (jsPDF/pdf-lib) — sem custo de servidor. Futuro: gerar via Edge Function e salvar no Storage (bucket `extratos`) para link permanente.
- **Conteúdo:** despesas agrupadas por categoria, rateio por morador, status de cada rateio (pago/pendente), quem deve quem no período e saldo líquido por morador.
- **Base de dados:** derivado de `despesas` + `rateios` — nenhuma tabela nova obrigatória.
- **Regras:** período selecionável; o extrato reflete o estado no momento da exportação; opção de incluir comprovantes e caminho do boleto (v2.1).

### 10.3 Saldo acumulado e compensação automática (v2)

**Objetivo:** o saldo não "zera" no fim do mês — persiste enquanto houver rateio pendente — e o balanço sugere a **quantidade mínima de transferências** para quitar tudo.

- **Saldo acumulado:** rateio não pago continua no balanço até ser confirmado; a tela de balanço passa a oferecer duas visões — "este mês" e "acumulado (em aberto)".
- **Compensação mínima:** a partir das obrigações devedor→credor, calcula-se o **saldo líquido por par** (A deve B e B deve A → vale só a diferença) e então o conjunto mínimo de transferências que zera o sistema (heurística greedy sobre o grafo de dívidas).
- **Base de dados:** nenhuma tabela nova obrigatória (cálculo derivado de `rateios`); view `saldos_acumulados` (opcional) para performance do balanço.
- **Regras:** ao confirmar pagamento, abate primeiro saldos mais antigos; liquidar um rateio não apaga histórico — apenas muda o status para pago.

### 10.4 Compras de mercado com itens (v2)

**Objetivo:** dividir a nota do supermercado **pelo que cada um levou**, em vez de rateio simples.

- **Tabela nova `itens_despesa`:**
  | campo | tipo | obs |
  |---|---|---|
  | id | uuid PK | |
  | despesa_id | uuid FK → despesas | |
  | descricao | text | ex.: "Café 1kg" |
  | valor | numeric(12,2) | |
  | donos | uuid[] | moradores que consomem esse item |
  | criado_em | timestamptz | |
- **Fluxo:** despesa com flag `mercado=true` → lista de itens + quem consume cada um → soma por morador → gera `rateios` (tipo_rateio `consumo`) automaticamente.
- **Regras:**
  - Item sem dono → dividido igualmente entre todos (ex.: papel higiênico/temperos de uso comum).
  - Item com múltiplos donos → dividido entre eles (igual ou por %).
  - Editar itens **recalcula** o rateio e mostra a diferença de saldo antes de salvar.
  - O valor total da despesa deve ser ≈ soma dos itens (± centavos; pequena diferença entra como "comum").

### 10.5 Ajustes (IOU) e contas conjuntas / caixinhas (v2)

**Objetivo:** registrar dinheiro entre moradores que **não é** gasto de consumo — acordos manuais e um fundo comum da casa.

- **Ajuste = "A deve R$ X para B"** direto, sem despesa/voucher:
  | tabela `ajustes` | tipo | obs |
  |---|---|---|
  | id | uuid PK | |
  | casa_id | uuid FK | |
  | de_user | uuid FK | devedor |
  | para_user | uuid FK | credor |
  | valor | numeric(12,2) | |
  | motivo | text | ex.: "devolução do mercado" |
  | data | date | |
  | criado_em | timestamptz | |
  → gera obrigação devedor→credor no balanço, igual a um rateio.
- **Conta conjunta (caixinha)** = fundo comum com aporte dos moradores:
  - `caixinhas`: id, casa_id, nome, saldo, regra (igual/percentual), ativa, criado_em
  - `movimentos_caixinha`: id, caixinha_id, morador_id, tipo (entrada/saída), valor, descricao, data
- **Regras:**
  - Ajuste pode ser anulado, mas só com confirmação e da parte/credor (evita edição unilateral).
  - Aporte na caixinha é combinado entre a casa (não gera obrigação automática).
  - O **saldo da caixinha fica fora do balanço de despesas** — é recurso à parte, mas pode ser citado na compensação (ex.: usar o saldo para quitar rateios).

### 10.6 Backup / restauração (v1.5)

**Objetivo:** exportar os dados da casa (despesas, rateios, recorrências, ajustes, moradores) e poder restaurá-los numa conta nova recriada.

- **Formato:** JSON com versão de schema (`schema_version`) — futuro-proof se o modelo mudar.
- **Escopo de privacidade:** o backup traz só os dados da **casa do usuário**; o download gera um arquivo no Storage acessível apenas a moradores ativos.
- **Restauração:** valida o JSON, recria registros com novos UUIDs e mantém as referências consistentes (moradores que saíram viram placeholders "ex-morador").
- **Regras:** export não gera/consome cota OCR; banco não permite sobrescrever dados existentes sem confirmação explícita.

### 10.7 Chave Pix por morador (v2)

**Objetivo:** acelerar a liquidação — o credor copia a chave Pix do devedor (ou vice-versa) direto na tela de Pagar.

- **Tabela nova `chaves_pix`:** id, user_id, chave, tipo (`cpf`/`email`/`telefone`/`aleatoria`), principal (bool), criado_em.
- **Local na UI:** perfil de cada morador; badge "Pix" no cartão do morador ao confirmar pagamento.
- **Regras:** dado financeiro sensível → visível somente para moradores ativos da mesma casa; edição/exclusão apenas pelo dono da chave; validação de formato por tipo.

### 10.8 Comparativo mês a mês (v2)

**Objetivo:** visualizar a evolução do gasto por categoria/fornecedor para decidir sobre recorrências (ex.: "luz subiu 30% desde maio").

- **Cálculo:** derivado de `despesas` confirmadas (sem canceladas/previstas), agrupado por `categoria` + mês.
- **UI:** gráfico de barras/linhas simples (SVG/CSS puro — sem lib de gráficos) + tabela de variação percentual mês a mês.
- **Base de dados:** nenhuma tabela nova — recomenda-se a view `gasto_mensal_por_categoria` (casa_id, mes, categoria, total).

### 10.9 Orçamento por categoria (v2.5)

**Objetivo:** definir limite mensal por categoria (ex.: mercado ≤ R$ 800) e saber quanto ainda falta.

- **Tabela nova `orcamentos`:** casa_id, categoria, limite (numeric(12,2)), mes_referencia (date ou null = todo mês), criado_em.
- **Alerta:** ao lançar/confirmar despesa, se a soma do mês ultrapassar o limite → aviso no lançamento e destaque na Home ("mercado: R$ 850/800").
- **Regras:** orçamento vale para despesas confirmadas (apenas previstas não contam); pode ter `mes_referencia` fixo ou recorrente.

### 10.10 Despesa parcelada (v2.5)

**Objetivo:** dividir o valor de uma compra grande (ex.: 12x) de modo que cada parcela entre no balanço do respectivo mês.

- **Tabela nova `parcelas`:** id, despesa_id, numero (1..N), valor, data_vencimento, paga (bool).
- **Fluxo:** no lançamento escolhe "parcelar em Nx" → a despesa pai permanece como referência e cada parcela gera seu próprio `rateio` no mês da data de vencimento.
- **Regras:** cancelar a despesa cancela parcelas futuras (não as pagas); o comprovante fica na despesa pai; o comparativo/orçamento conta apenas a parcela do mês.

### 10.11 Consumo real por medidor (v2.5)

**Objetivo:** substituir o rateio fixo de água/luz por **leitura real** do medidor — justo quando há diferença de consumo entre moradores.

- **Tabela nova `leituras_medidor`:** id, casa_id, tipo (`agua`/`luz`), morador_id, leitura, data_leitura, criado_em.
- **Cálculo:** consumo = leitura atual − leitura anterior; total da conta ÷ consumo total → tarifa por unidade → valor por morador (gera `rateios` consumo).
- **Regras:** leituras inválidas (menores que a anterior) são recusadas; morador que não informa leitura cai no rateio igual por padrão ("chute padrão" configurável).

### 10.12 Otimizações técnicas contínuas (transversal)

- **Supabase Realtime:** atualização instantânea entre moradores (lançou despesa → todos veem sem refresh), replicando/complementando o estado local.
- **Compressão da foto do comprovante** antes do upload (resize + WebP no client) — reduz Storage, banda e custo de OCR.
- **Cache no front** (React Query/SWR): `useQuery` deduplicando buscas, refetch automático e stale-time por tela.
- **Índices e views:** `despesas(casa_id, data)`, `rateios(despesa_id)`, views `saldo_acumulado`, `gasto_mensal_por_categoria` para o balanço não ler tudo cru.
- **Testes E2E (Playwright):** fluxo crítico lançar despesa → rateio → quitar; roda no CI.
- **Dark mode/tema:** CSS variables já empregadas → alternância barata via `data-theme`.
- **Accessibilidade iOS:** aumentar alvos de toque (≥44px), `prefers-reduced-motion`, contraste nos acentos — alinhado com a skill `ios-pwa-native-feel`.

## 11. Configuração inicial

1. Criar projeto no Supabase (free plan).
2. Habilitar Auth (email+senha) e Storage (bucket `comprovantes`).
3. Rodar o schema SQL da seção 5 (tabelas + RLS).
4. Criar chave da NVIDIA NIM em `build.nvidia.com` → `integrate.api.nvidia.com/v1`.
5. Deploy da Edge Function `ocr` apontando para a NIM com a variável de ambiente `NIM_API_KEY`.
6. Agendar geração de previstas (Supabase pg_cron, rotina diária que cria lançamentos a vencer nos próximos 12 meses).
7. Rodar o app: `npm install` + `npm run dev` (front React/Vite).