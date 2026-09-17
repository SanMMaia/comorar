# IA alvo — Comorar (referência para o redesign)

> Doc de design para orientar o redesign do layout. Validação de usuário em andamento; nada disso deve virar regra dura até revisão final.

## 1. Princípios

- **Preparado para grupos grandes desde o início.** Testado hoje com poucos moradores, mas o modelo de telas não deve presumir intimidade plena.
- **Três naturezas de conteúdo**, que não se misturam numa mesma tela:
  - **Pessoal** — o que me diz respeito (meu saldo, minhas previstas).
  - **Coletivo** — o registro da casa (extrato, validação de lançamentos).
  - **Gestão/owner** — configuração e visão global (moradores, relatórios, orçamento).
- **Nav enxuto**: 4 abas + centro "+ Pagar". Nova aba só quando uma feature justificar (provável candidata: Caixinhas).
- **Um único número "você deve" por tela**, com escopo explícito no rótulo (mês vs total em aberto) — elimina o duplo "Você deve" atual (Home do mês × Balanço total).

## 2. IA alvo (4 abas + centro)

| Aba | Conteúdo | Natureza |
|---|---|---|
| **Resumo** | Meu saldo *do mês*, minhas previstas, últimas despesas **que me envolvem**, alertas (notificações recentes, orçamento perto do limite) | Pessoal |
| **Extrato** (renomeia "Despesas") | Lançamentos da casa: busca, filtro por categoria, navegação por mês, exportar PDF. Detalhe de cada despesa em `/despesa/:id` | Coletivo |
| **Meu saldo** (renomeia "Balanço") | O que devo a cada pessoa, quem me deve, detalhe dos rateios que formam minha dívida, marcar pago, acerto, histórico do *meu* saldo. Matriz completa só para owner | Pessoal |
| **Perfil** | Centro agrupado: **Casa** (moradores, código, regras, categorias) · **Financeiro** (recorrências, relatórios, orçamento, caixinhas) · **Dados** (Pix, backup, minha conta) | Gestão/owner |
| **+ Pagar** (centro) | Fluxo de lançamento (confirmar prevista / avulsa), incluindo futuros: mercado com itens, parcelada, leitura de medidor | Coletivo† |

† o lançamento registra na casa, mas a revisão pós-lançamento é pessoal (meu rateio).

Itens fixos: **sino de notificações** (inbox; badge de não lidas), **onboarding/login** por fora.

## 3. Correções de redundância/navegação detectadas (deve aplicar no redesign)

1. **"Você deve" duplicado com valores diferentes** — Home (mês) vs Balanço total. Solução: escopos explícitos nos rótulos; Balanço vira "Meu saldo".
2. **Prevista aparece em 3 telas** (Home, Extrato, Recorrências→Próximas contas). Definir: **Home** mostra só as que me envolvem; **Extrato** mostra tudo; **Próximas contas** fica só no grupo Recorrências (owner).
3. **Mesma prevista com affordance inconsistente**: clicável (→ detalhe) em Home/Extrato, e não clicável em Recorrências (só "Ignorar"). Padronizar: toda despesa é clicável → detalhe; ações secundárias não bloqueiam o clique.
4. **Links "contas recorrentes"/"próximas contas"** da Home → `/projecao` (redirect) → volta leva ao Perfil. Corrigir o destino/back para sair da "armadilha do redirect".
5. **Duas entradas de lançamento**: `/nova` (Pagar) e `/despesa/nova` (DespesaAvulsa). Consolidar num único fluxo "+ Pagar".

## 4. Onde entram as features do README (10.x)

| Feature | Aba/superfície | Natureza |
|---|---|---|
| 10.1 Notificações | Sino (feito: inbox). Push/e-mail = sistema | Pessoal |
| 10.2 Extrato PDF | **Extrato** → "Exportar PDF" | Coletivo |
| 10.3 Saldo acumulado | **Meu saldo** → histórico mensal do meu saldo | Pessoal |
| 10.4 Mercado com itens | **+ Pagar**; estrutura no **Extrato**; rateio no **Meu saldo** | Coletivo/pessoal |
| 10.5 IOU / Caixinhas | IOU → **Meu saldo**; caixinhas → **Perfil/Financeiro** (owner), contribuições no Meu saldo | Pessoal/owner |
| 10.6 Backup/restauração | **Perfil/Dados** (owner) | Owner |
| 10.7 Chave Pix | Cadastro **Perfil/Dados**; atalho "copiar Pix" no **Meu saldo/acerto** | Pessoal/owner |
| 10.8 Comparativo mês a mês | **Perfil/Financeiro → Relatórios** (owner) | Owner |
| 10.9 Orçamento por categoria | Gestão em **Relatórios** (owner); destaque na **Home** perto do limite | Owner/pessoal |
| 10.10 Parcelada | **+ Pagar**; parcelas no **Extrato/Meu saldo** | Coletivo/pessoal |
| 10.11 Medidor (água/luz) | **+ Pagar** (leitura); histórico no owner/Relatórios | Coletivo/owner |
| 10.12 Otimizações técnicas | Transversal — sem tela | — |

Regra: **nenhuma nova aba agora**; as features entram pelo fluxo de lançamento, pelos pontos pessoais ou pela central do owner no Perfil.

## 5. Backend — o que já existe vs planejado

**Pronto (implantado):**
- `0016` notificações (tabelas + RLS + triggers + `pg_cron` 04:00).
- `0017` `resumo_mensal(casa, meses)` — alimenta Relatórios (10.8).
- `0018`+`0020` `orcamentos` (tabela + RLS) e `orcamento_uso(casa, mes)` — alimenta 10.9.

**Planejado (não construir ainda):**
- `meu_saldo(casa)` — dívidas/créditos do `auth.uid()` (base para a tela Meu saldo).
- Visibilidade de despesa "só quem participa do rateio" (RLS por envolvimento) — para grupos grandes; requer decisão de produto.
- Notas: RLS de despesas/rateios é por casa hoje (`0001_init.sql:195-221`); delete de despesa é owner-only.

## 6. Decisões em aberto

- [ ] Home: "últimas despesas que me envolvem" (privado) vs "últimas da casa" (transparente).
- [ ] Matriz "quem deve a quem": só owner (recomendado) ou owner + toggle.
- [ ] Até onde o extrato detalha rateios de terceiros (valores de terceiros visíveis ou só do usuário).