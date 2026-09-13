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

- Extrato em PDF (v1.5)
- Notificações push / lembretes de cobrança (v2)
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
- Extrato mensal em PDF.

### v2
- Notificações push e lembretes de cobrança.
- Pagamento rotativo automático por recorrência.
- Login social (Google/Apple).
- Publicação na App Store via Capacitor (quando o usuário quiser investir nos US$ 99/ano).

## 10. Configuração inicial

1. Criar projeto no Supabase (free plan).
2. Habilitar Auth (email+senha) e Storage (bucket `comprovantes`).
3. Rodar o schema SQL da seção 5 (tabelas + RLS).
4. Criar chave da NVIDIA NIM em `build.nvidia.com` → `integrate.api.nvidia.com/v1`.
5. Deploy da Edge Function `ocr` apontando para a NIM com a variável de ambiente `NIM_API_KEY`.
6. Agendar geração de previstas (Supabase pg_cron, rotina diária que cria lançamentos a vencer nos próximos 12 meses).
7. Rodar o app: `npm install` + `npm run dev` (front React/Vite).