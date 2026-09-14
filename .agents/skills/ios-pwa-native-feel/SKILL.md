---
name: ios-pwa-native-feel
description: Fazer o Comorar (SPA/PWA) se sentir nativo no iOS — navegação, transições, safe areas, toques e o ciclo do service worker na Vercel. Sem libs de animação. Seções "Correspondência no projeto atual" refletem o código verificado em 13/09/2026.
---

## 0. Gerenciar expectativa

- Este app é uma SPA/PWA mobile-first, não um app nativo. O objetivo é chegar o mais perto possível do comportamento nativo **com custo de manutenção gerenciável** — não clonar 100% do UIKit.
- "Native feel" ≥ "visual nativo": priorize física (durações, direção, feedback tátil visual) sobre pixels exatos.
- Trabalhe por **níveis de esforço**: do comportamento barato e de alto impacto até o caro e de baixo impacto — só vá além do nível 2 se for pedido explicitamente.
- **As seções "Correspondência no projeto atual" são o estado real do código** (verificado), não o ideal. Atualize-as ao tocar nestas áreas.
- **Teste sempre no alvo real** (iPhone físico/device mode), não só nos dev tools.

## 1. Modelo de navegação (consenso Apple HIG + Material)

1. **Tab bar** (3–5 destinos, ícone + rótulo) para top-level. No Comorar: Resumo, Despesas, Balanço, Contas, Perfil.
2. **Push** para hierarquia (lista → detalhe → formulário). Transição: avançar empurra da direita, voltar desliza da esquerda.
3. **Modal / bottom sheet** para tarefas curtas e autocontidas (novo item, pagamento, compartilhar). **Tela cheia (push)** para formulários longos. Formulários devem ser **compactos** — manter tudo visível sem exigir scroll é melhor do que uma página longa.
4. **Transições:** cross-fade entre tabs; slide direcional apenas no push/pop hierárquico; nunca transição vertical; transitions de modal/sheet são deslize para cima.
5. **Re-tap na aba ativa** reseta o scroll (se scroll > 0, `scrollTo({top:0})`; senão re-monta a view se o estado foi perdido). Hoje cada rota re-monta, então o handler de re-tap é barato.
6. **URL é a fonte da verdade** (deep link, reload, share) — a tab bar reflete a rota atual via `NavLink`.

### Correspondência no projeto atual (verificado 13/09/2026)
Tabs: 5 em `NavLink` com ícone+rótulo em `Layout.tsx` — ok; push hierárquico com `viewTransition` — ok; **sem handler de re-tap** que reseta scroll (padrão pede o comportamento; custo baixo pois não há estado de scroll persistente). **Header global removido (commit após 53f22e7):** não há nav bar fixa — cada página tem seu `h1` rolando no conteúdo (Home: "Resumo"; Perfil: `casa.nome`); telas de detalhe usam `.nav-back` próprio. **Editáveis = tela cheia via push** (skill: formulários nunca inline): `RecorrenciaEditar` (`/recorrencia/:id/editar`) e `Regras` (`/perfil/regras`) são páginas próprias abertas por card-link a partir do Detalhe/Perfil; ações administrativas (ativar/desativar, excluir) moram na tela cheia de edição; ações curtas por item (ignorar mês, reativar, liquidar) seguem inline — conforme a skill.

## 2. View Transitions API + React Router v7

1. **Suporte:** same-document é **Baseline 2025** — Chrome/Edge 111+ (mar/2023), Safari 18.0 (set/2024), Firefox 131+ (nov/2024; **o baseline só fecha oficialmente via Firefox 144**). Apenas same-document; cross-document está fora.
2. **A API é de snapshot:** chame `document.startViewTransition(async callback)` (via `v7_startTransition` do router) e o browser tira foto do antes/depois. Não use `framer-motion`/`GSAP` para isso.
3. **Direção push vs pop (avançar desliza da direita, voltar da esquerda):** transição por *transition types* (`types: ['navigation'|'forward'|'back']`) ainda não é confiável — use **`useNavigationType()` + `data-direction` no `<html>`**. Nunca dependa de transition types para o botão back do browser:
   ```tsx
   const { navigationType } = useNavigationType() // 'PUSH' | 'POP' | 'REPLACE'
   useEffect(() => {
     document.documentElement.dataset.direction =
       navigationType === 'POP' ? 'back' : 'forward'
   }, [navigationType])
   ```
   ```css
   [data-direction="forward"]::view-transition-old(root) { animation: vt-sair 0.25s ease-out; }
   [data-direction="forward"]::view-transition-new(root) { animation: vt-entrar 0.25s ease-out; }
   [data-direction="back"]::view-transition-old(root) { animation: vt-entrar 0.25s ease-in reverse; }
   [data-direction="back"]::view-transition-new(root) { animation: vt-sair 0.25s ease-in reverse; }
   ```
   O `setAttribute` deve acontecer **antes** do `startViewTransition` (o `useEffect` pós-navegação captura o estado novo — pode atrasar). Se a SPA usa `router.push` sempre, grave a direção no próprio handler de navegação e no `popstate`/`navigate(-1)`.
4. **Isolar o chrome persistente** (header, tab bar): `view-transition-name: vt-header` / `vt-nav` com `animation: none` — senão o app inteiro "pula" junto com o conteúdo. Elementos com blur/filtro/gradiente que quebram no meio-frame usam o mesmo truque (grupo próprio, animação desligada). Use `:only-child` nos pseudo-elementos para animar só quando o elemento entra/sai de vez.
5. Use o CSS do `root` para o conteúdo principal e **animação discreta**: `transform`/`opacity` apenas (nada de `width/height/top/left`, força layout).
6. **Reduced motion:** respeite `prefers-reduced-motion` (ou `skipTransition`). Animações de 200–400ms.
7. Não confundir com **element-scoped view transitions** (`element.startViewTransition()`) — ainda limitado (Chrome/Edge 147+, sem Safari/Firefox). Não usar no caminho crítico.
8. `view-transition-class` (agrupar animações por tipo no CSS) ainda não é unânime — verifique o suporte antes de depender.

### Correspondência no projeto atual (verificado 13/09/2026)
Já implementado: prop `viewTransition` nos Links de push; `.nav-back`; **`vt-nav` isolado com `animation: none`** (apenas a tab bar — o header fixo foi removido, o título agora rola no conteúdo); **`data-direction` via `useNavigationType()` + POP** (componente `SincronizarDirecao` em `App.tsx`; seletores `[data-direction=...]` no `index.css` — commit 53f22e7); keyframes `vt-sair`/`vt-entrar`; `prefers-reduced-motion` com `!important` (vence a especificidade dos seletores direcionais). **Gaps restantes:** tabs sem cross-fade; itens de lista→detalhe sem shared-element (`view-transition-name` variável), se desejado.

## 3. Safe area, status bar e toques

### Safe area e status bar (ordem de impacto)
1. `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">` — **sem `viewport-fit=cover`, `env(safe-area-inset-*)` retorna 0 e o iOS coloca barras de letterbox**. (Já presente no projeto.)
2. **Cor das áreas seguras é do documento, não do componente:** o iOS pinta notch/home-indicator a partir de `theme-color` + background do `body`. Componente CSS não resolve. O `theme-color` precisa casar com o fundo real (incluindo dark mode).
3. `theme-color` **substituiu** `apple-mobile-web-app-status-bar-style` (iOS 15+) para a cor. `black-translucent` segue sendo o **único** jeito de ficar edge-to-edge de verdade — mas aí o app precisa cuidar de `padding-top: env(safe-area-inset-top)` no header (Dynamic Island ≈ 59px em standalone). Combinar `default` com `viewport-fit=cover` tem bug conhecido de conteúdo sumindo sob a status bar opaca.
4. `padding-bottom: env(safe-area-inset-bottom)` na bottom nav (home indicator ≈ 34px em standalone) — com `calc(... + gap)` para não encostar a tampa no chin.
5. **Altura:** prefira `min-height: 100vh; min-height: 100dvh` (fallback explícito). Em standalone o iOS **mente a altura no cold start**: `100dvh` chega como `100vh` cheio e o teclado não move `dvh`. `100svh` (menor viewport) evita overflow de forma estável, mas desperdiça área quando as barras do Safari recolhem — em standalone elas não existem, então svh≈dvh. Se houver footer fixo com o teclado, meça `visualViewport.height` no resize e sincronize uma var CSS. **Não use `position: fixed` em `body`/`#app`** (bug iOS 26.x de clipe que corta o rodapé).

### Toques (do mais seguro ao mais barato)
- Comece por `touch-action: manipulation` (mata o atraso de duplo toque e o zoom, custo de acessibilidade zero).
- Inputs com `font-size` computado **≥16px** senão o iOS dá auto-zoom ao focar (regra `clamp(16/fontSize, min, max)` do WebKit).
- `-webkit-tap-highlight-color: transparent` **remove o único feedback visual de toque** — só use se houver estados `:active` customizados no lugar. Escopar remoções mais agressivas (`user-select`, `-webkit-touch-callout`) atrás de `@media (display-mode: standalone) and (pointer: coarse)`.
- `overscroll-behavior: contain` no `body` para o bounce não vazar para o fundo cinza do Safari.
- Fonte do sistema: `-apple-system, BlinkMacSystemFont, "Segoe UI", ...` pega SF Pro sem hospedar nada.

### Correspondência no projeto atual (verificado 13/09/2026)
Já: `viewport-fit=cover`; `theme-color` `#0f766e`; `apple-mobile-web-app-status-bar-style=default`; `env(safe-area-inset-bottom)` no `.content` e na bottom-nav; fonte system-ui; inputs herdam **16px** via `font: inherit` no `:root` (sem risco de zoom — a regra `clamp` não é acionada); altura usa **`100svh`** (aceitável em standalone; trocar para `100vh; 100dvh` se aparecer folga). **Gaps:** sem `env(safe-area-inset-top)` no `.app-header` (Dynamic Island pode sobrepor); sem `touch-action: manipulation`; sem `overscroll-behavior: contain`; sem remoção de tap-highlight + `:active` customizado.

## 4. `vite-plugin-pwa` no deploy da Vercel — armadilha mais comum (ordem das mais prováveis)

**Sintoma:** usuário reporta app "quebrado"/"branco" após deploy, principalmente PWA instalado no iOS (não tem pull-to-refresh nem botão reload).

**Causa raiz:** `CacheFirst` (ou precache) do `index.html` + `navigateFallback` = HTML velho referenciando chunks com hash que não existem mais no deploy novo.

**Checklist de hardening:**
1. **Documento em `NetworkFirst`, nunca no precache:**
   - Tire `html` do `globPatterns` (senão o precache tem precedência sobre o runtimeCaching — ver vite-plugin-pwa#887).
   - `navigateFallback: null` (com html fora do precache, o fallback default só serviria HTML morto ou 404 offline).
   - `runtimeCaching` com `NetworkFirst` para `request.mode === 'navigate'` (networkTimeoutSeconds ~3–5, cacheName dedicado) e `CacheFirst` só para assets versionados por hash (`js|css`, imagens, woff2).
   - Trade-off: sem `html` no precache, **offline não funciona na primeira visita** (só após o app ter sido aberto e o documento cacheado). Para este produto, prefira NetworkFirst.
2. `registerType: 'autoUpdate'`, que força `skipWaiting` + `clientsClaim`; **`cleanupOutdatedCaches: true`** para evictar entries antigas de precache.
3. **autoUpdate não recarrega abas abertas por si só.** Importe o virtual module e registre com reload imediato:
   ```ts
   import { registerSW } from 'virtual:pwa-register'
   registerSW({ immediate: true }) // recarrega sozinho ao instalar o SW novo
   ```
   (ou `onNeedReload` para reload controlado/adiado). Sem o import, o SW novo assume mas a aba continua na versão velha. O `d.ts` do virtual module vem do plugin — se o TS reclamar, adicione `/// <reference types="vite-plugin-pwa/client" />`.
4. **`sw.js` com `Cache-Control: public, max-age=0, must-revalidate`** no `vercel.json` — o SW precisa ser buscado fresco a cada navegação, senão o ciclo de update trava:
   ```json
   "headers": [
     { "source": "/sw.js", "headers": [ { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" } ] }
   ]
   ```
5. **Manifest é cacheado agressivamente pelo iOS** — ícone/tema/cores só mudam para usuários que re-instalarem o PWA. Não dependa disso para hotfixes. (Ícones só SVG p/ instalação iOS exigem PNG 180/192/512 — complemento fora do escopo, mas relevante.)
6. **Registro em URL estável** (`/sw.js`, sem hash). Se precisar de kill-switch para usuários presos, sirva um `sw.js` no-op que faça `self.registration.unregister()` + delete de caches no MESMO caminho do SW quebrado.

### Correspondência no projeto atual (verificado 13/09/2026 — `vite.config.ts`, `vercel.json`, `main.tsx`)
Já: `registerType: 'autoUpdate'`; manifest (theme/background `#0f766e`, standalone) e ícones SVG; **hardening completo aplicado no commit 53f22e7:** `globPatterns` **sem `html`** + `navigateFallback: null`; `runtimeCaching` com `NetworkFirst`/`networkTimeoutSeconds: 4` em navigations (cacheName `pages`) + `CacheFirst` em assets; `cleanupOutdatedCaches: true`; `main.tsx` importa `virtual:pwa-register` com `registerSW({ immediate: true })`; `vercel.json` com `Cache-Control: public, max-age=0, must-revalidate` no `/sw.js` (verificado 200 no domínio). Trade-off vigente: offline só após a primeira visita (documento em NetworkFirst). Ícones: adicionar PNG 180/192/512 para instalação no iOS (pendente).

## 5. Quando NÃO aplicar

- Não clonar componentes exatos do UIKit (SF Symbols, sheets) sem avisar do custo de manutenção — ver seção 0.
- Não trazer lib de transição para casos que a View Transitions API cobre; só para gestos contínuos/interrompíveis (swipe-to-dismiss, drag) ou física.
- Não prometer haptics reais no Safari — é sempre visual.
- Não usar bottom nav em desktop wide como navegação "única": em telas largas o padrão é nav rail/tab no topo (Material). Mantenha o mobile-first, mas não force a tab bar em desktop.
- Não usar *transition types* para direção (push/pop) — só `data-direction` via `useNavigationType()`.
- Não remover `tap-highlight` sem entregar `:active` no lugar — senão o toque fica sem feedback nenhum.