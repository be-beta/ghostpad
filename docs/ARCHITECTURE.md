# GhostPad — Documento de Arquitetura

> Revisão 2 — incorpora as correções técnicas feitas sobre o rascunho inicial.
> As decisões marcadas com **[D]** mudaram em relação à primeira versão e o
> motivo está registrado, porque todas elas são contraintuitivas.

---

## 1. Visão geral

GhostPad é um bloco de notas flutuante, translúcido e sem bordas para Windows.
O objetivo é eliminar o `Alt+Tab` durante criação de prompts, análise de
interfaces, ditado por voz e gravação de tutoriais.

Três pilares:

- **Fricção zero com o mouse** — operação quase inteiramente por teclado.
- **Presença não-intrusiva** — translúcido, sem barra de título, sem menus fixos.
- **Fluidez multiuso** — do rascunho rápido ao teleprompter invisível em gravações.

---

## 2. Stack

| Camada | Escolha | Versão travada |
|---|---|---|
| Framework | Tauri v2 (Rust + WebView2) | 2.11.5 |
| Frontend | TypeScript + Vite | TS 6.0, Vite 8 |
| Editor | CodeMirror 6 | Fase 1 |
| Efeitos de janela | `window-vibrancy` | 0.8.0 |
| APIs Win32 | crate `windows` | **0.61** |
| Atalhos globais | `tauri-plugin-global-shortcut` | 2.3.2 |
| Persistência | `tauri-plugin-store` | 2.4.4 |

**[D] A versão do crate `windows` não é livre.** O Tauri 2.11.5 já depende de
`windows 0.61.3`. Se o `Cargo.toml` puxar outra versão, o `HWND` devolvido por
`window.hwnd()` é um tipo *diferente* do `HWND` importado e o projeto não
compila. Ao atualizar o Tauri, rode `cargo tree -i windows` e espelhe a versão.

---

## 3. Camada visual

### 3.1 O fundo padrão é transparência real, não desfoque **[D]**

*Revisado após o primeiro teste em máquina real.*

O rascunho previa `backdrop-filter: blur()` em CSS. Isso não funciona: dentro do
WebView2 ele só enxerga a própria página, nunca o app de baixo.

A primeira implementação usou o acrylic do DWM (`window_vibrancy::apply_acrylic`).
No teste em Windows 11 25H2 (build 26200) a janela ficou **completamente
sólida**. A investigação, com capturas sobre um fundo listrado de alto contraste,
mostrou:

| Fundo | Resultado |
|---|---|
| Sem efeito nativo | **transparente de verdade** |
| Acrylic (`DWMSBT_TRANSIENTWINDOW`) | sólido, mesmo com a API retornando sucesso |
| Blur legado (`ACCENT_ENABLE_BLURBEHIND`) | sólido, mesmo com a API retornando sucesso |

Transparência do sistema ligada, economia de energia desligada, sessão local.
A causa exata na máquina não foi isolada — e isso já é a conclusão de produto:

- **O retorno da API não prova que o efeito aparece.** Não dá para detectar a
  falha e cair para outro modo automaticamente.
- **O acrylic do Windows 11 vira cor sólida quando a janela perde o foco**, por
  design. Uma sobreposição passa a maior parte do tempo sem foco — o usuário
  está clicando no app de baixo.

Decisão: **transparência real é o padrão**, porque é o único modo que funciona
em qualquer máquina e com a janela sem foco. Desfoque (`blur`) e `acrylic` ficam
disponíveis como escolha explícita (`Ctrl+Shift+B`), e o acrylic avisa ao ser
ativado que some sem foco.

Desfoque confiável e independente do foco fica registrado como pesquisa futura
(por exemplo, capturar a região atrás da janela e desfocar no próprio app).

### 3.2 Opacidade é CSS, nunca o efeito nativo

O efeito nativo, quando ligado, usa tint quase transparente `(18, 18, 18, 10)`.
O controle de opacidade mexe numa camada CSS por cima (`.gp-backdrop`), que
anima a 60fps sem piscar. Reaplicar o efeito do DWM a cada `Ctrl+]` piscaria.

### 3.3 Cantos arredondados são nativos

`DwmSetWindowAttribute` com `DWMWA_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND`, para
o fundo nativo acompanhar a forma. No Windows 10 a chamada falha e é ignorada.

### 3.4 Relatório de capacidades

`get_effects_report` devolve o que foi possível verificar: cantos, exclusão de
captura e o atalho de resgate efetivamente registrado. É consultado pelo
frontend como comando, não emitido como evento — o setup do Rust roda antes de o
frontend montar, e o evento se perdia.

### 3.5 Legibilidade

O texto leva `text-shadow: 0 1px 2px rgba(0,0,0,.45)`. Custa nada e é o que
mantém o texto legível quando a opacidade está baixa sobre um fundo claro.

---

## 4. Conflitos de design resolvidos

### 4.1 Modo fantasma versus ditado por voz **[D]**

`set_ignore_cursor_events(true)` faz o mouse atravessar a janela. Mas no
instante em que o usuário clica no app de baixo, **o foco de teclado vai
junto**. Como Wispr Flow e afins digitam na janela focada, o ditado cairia no
navegador, não no GhostPad.

Consequências arquiteturais:

- Modo fantasma e captura por ditado são **estados mutuamente exclusivos**, não
  recursos que convivem. A UI trata como tal.
- Todo atalho que precise funcionar em modo fantasma tem que ser **global**
  (`tauri-plugin-global-shortcut`), não um keymap do CodeMirror.
- O modo fantasma pinta uma borda de destaque na janela. Sem isso não há
  nenhuma pista visual de que os cliques estão atravessando.
- O modo fantasma **nunca** é restaurado no boot. Iniciar num estado que não
  responde a cliques, antes de o usuário entender por quê, é armadilha.

### 4.2 `Alt + Setas` estava duplicado **[D]**

O rascunho mapeava `Alt+Up/Down` para mover linhas (CodeMirror) **e**
`Alt + Setas` para snap de cantos. Não dá para ter os dois.

Além disso, `"snapTopLeft": "Alt+Up+Left"` não é um acelerador válido — não
existe combinação com duas teclas não-modificadoras.

Resolução: as setas ficam com o editor; o snap passa para `Ctrl+Alt+dígito`.

### 4.3 Falha silenciosa é inaceitável no modo oculto

Se `SetWindowDisplayAffinity` falhar e o app não avisar, o usuário acredita que
está escondido, grava o vídeo e só descobre depois de publicar. Por isso o
comando propaga o erro e a UI mostra um aviso explícito de que ele **aparece**
na gravação.

---

## 5. Backend Rust

```
src-tauri/src/
  lib.rs         setup, plugins, registro de comandos, atalho de resgate
  window_fx.rs   tudo que é Win32: acrylic, cantos, display affinity, snap
```

### Comandos expostos

| Comando | Função |
|---|---|
| `set_always_on_top` | Alterna o always-on-top |
| `set_click_through` | Modo fantasma |
| `set_exclude_from_capture` | Invisibilidade em gravações |
| `snap_to_corner` | Encaixe nos cantos do **monitor atual** |
| `panic_recover` | Rede de resgate |

### 5.1 Snap consciente de multi-monitor e DPI **[D]**

Ausente no rascunho. `snap_to_corner` usa `current_monitor()` (não o primário),
trabalha sobre a `work_area` (respeita a barra de tarefas onde quer que ela
esteja) e converte a margem por `scale_factor()` — senão a janela escorrega em
telas com escala diferente de 100%.

### 5.2 Atalho de resgate com alternativas **[D]**

Registrado **no backend**, globalmente. O GhostPad pode estar simultaneamente em
modo fantasma, oculto de captura e fora da área visível; nesse estado o frontend
está inalcançável.

No primeiro teste, `Ctrl+Alt+G` já estava tomado pelo **Google Drive** (busca de
arquivos). Para lançamento público isso é regra, não exceção: atalhos globais
são disputados. O backend tenta, em ordem, e usa o primeiro livre:

1. `Ctrl+Alt+G`
2. `Ctrl+Alt+Shift+G`
3. `Ctrl+Alt+Shift+F12`

O atalho registrado vai no relatório de capacidades e a UI mostra o **atalho
real** nos avisos. Se nenhum estiver livre, o aviso orienta a voltar pela barra
de tarefas. Tornar o atalho configurável pelo usuário entra na Fase 2.

---

## 5.3 Mover, redimensionar e reabrir no mesmo lugar **[D]**

*Revisado após teste.*

**Arraste e redimensionamento são feitos à mão**, com `startDragging()` e
`startResizeDragging()`, não com `data-tauri-drag-region`. O atributo não
funcionou no botão de alça e, com duplo clique, maximizava a janela. A janela
também é `maximizable: false`.

- **Arrastar:** zona central do topo (pílula aparece no hover), alça de pontos
  junto aos controles, e áreas vazias da barra de status.
- **Redimensionar:** alças invisíveis de 8 px nas bordas e **13×13 px nos
  cantos** (começaram com 18 px, que cobriam metade do botão de atalhos). A borda nativa de uma janela sem moldura tem poucos pixels. A faixa
  de arraste antes ocupava o topo inteiro e engolia a borda superior; agora só a
  zona central arrasta.
- Os controles ficam afastados 22 px do canto para não disputar clique com a
  alça de canto, e a barra de status tem folga extra embaixo e à direita pelo
  mesmo motivo.

As teclas de colchete são lidas por `event.code` (`BracketLeft`/`BracketRight`),
não pelo símbolo: com Shift o navegador reporta `{` e `}`, e o símbolo muda
conforme o layout do teclado.

**Posição e tamanho são restaurados** (`window_state.rs`), no Rust e antes de a
janela aparecer (`visible: false` até restaurar), sem salto visual. A janela
nunca depende do frontend para ficar visível.

Proteções, porque opacidade e posição salvas podem esconder o app:

- Geometria que não deixa 80×80 px visíveis em algum monitor é descartada e a
  janela abre centralizada.
- **Revelação ao abrir:** a janela aparece opaca e esmaece em 0,7 s até a
  opacidade salva. Quem fechou com 20% num canto sobre um fundo parecido sempre
  vê onde o app abriu, sem perder a preferência.

---

## 5.4 Disco e varreduras fora da thread principal **[D]**

*Encontrado por um sintoma pequeno:* o cursor do mouse piscava ao digitar, mas
só quando o ponteiro estava sobre a janela do GhostPad.

No Tauri, comando **síncrono** é resolvido na thread que processa a mensagem —
a principal (`body_blocking` → `kind.block(...)` no `tauri-macros`). Comando
`async` vai para `async_runtime::spawn`, numa thread de trabalho.

O autosave gravava com `sync_all()` (força a escrita ao disco) a cada pausa de
digitação, na thread principal. A janela ficava sem responder por instantes e o
Windows trocava o cursor para o de "ocupado" — visível apenas sobre a janela
travada. O cursor piscando era sintoma de travamento real da interface.

Todos os comandos que tocam disco (`notes.rs`) ou varrem processos (`watch.rs`)
são `async` agora.

### Arquivos de texto do usuário

`Ctrl+S` salva e `Ctrl+O` abre, pelo diálogo nativo (`tauri-plugin-dialog`).
Gravação atômica, como a do rascunho interno.

**O arquivo do usuário nunca é gravado sozinho.** O autosave continua indo só
para o rascunho interno; o arquivo dele muda quando ele manda salvar. Abrir um
arquivo entra como edição normal, então `Ctrl+Z` traz de volta o texto anterior.

---

## 5.5 Arquivos, busca e o cursor que sumia

**Tipo de arquivo escolhido na janela do Windows.** Os filtros do diálogo são
separados (`*.txt`, `*.md`), então o formato é decidido no próprio diálogo
nativo, sem mais um passo dentro do app.

**"Copiar tudo e limpar" começa uma anotação nova**, então o arquivo associado
é esquecido. Antes, salvar depois disso sobrescrevia o arquivo da anotação
anterior. `Ctrl+S` salva no arquivo atual, `Ctrl+Shift+S` é "salvar como".

**Painel de busca em português e mais simples.** Traduzido pelo mapa
`EditorState.phrases`; "expressão regular" e "palavra inteira" foram escondidas,
porque um bloco de notas não precisa das duas e cada opção a mais é ruído no
meio da escrita. Campos e botões ganharam área de clique maior.

**O cursor do mouse sumindo ao digitar não é do app [D].** É a opção do Windows
"Ocultar ponteiro ao digitar" (`SPI_GETMOUSEVANISH`), confirmada ligada na
máquina de teste. Some ao digitar, volta ao mover o mouse, e vale para qualquer
aplicativo com foco de teclado. Não há como um app desativá-la só para si — é
preferência do sistema, em Configurações do mouse → Opções do ponteiro.

O travamento que *era* nosso (gravação em disco na thread principal) está na
seção anterior e foi corrigido.

---

## 6. Persistência

`%APPDATA%/com.ghostpad.app/`

| Arquivo | Conteúdo | Quem grava |
|---|---|---|
| `settings.json` | opacidade, topo, modo oculto, fundo | `tauri-plugin-store` |
| `draft.txt` | o texto do usuário | `notes.rs`, direto |
| `draft.bak.txt` | versão imediatamente anterior | `notes.rs` |
| `draft.json` | formato antigo, lido só para migrar | — |
| `window.json` | posição e tamanho da janela | `window_state.rs` |

**Preferências e texto separados de propósito.** Se as preferências corromperem,
o texto sobrevive.

### 6.1 O texto não usa o plugin de store **[D]**

*Revisado após teste:* ao reabrir depois de um `Ctrl+Q`, apareceu um texto
antigo. O plugin de store mantém uma cópia em memória e regrava o arquivo quando
o processo sai; com mais de uma instância viva, uma cópia desatualizada pode
sobrescrever o texto novo. A sequência exata não foi reproduzida, então a
correção elimina a classe inteira do problema:

- **Escrita atômica no Rust** — grava num `.tmp`, força ao disco (`sync_all`),
  guarda a versão anterior em `draft.bak.txt` e só então substitui. Uma queda no
  meio deixa o arquivo anterior intacto, nunca um arquivo pela metade.
- **Gravações serializadas** — fila no frontend e mutex no backend; uma
  gravação antiga nunca termina depois de uma nova.
- **Instância única** (`tauri-plugin-single-instance`) — abrir de novo traz a
  janela existente para frente em vez de criar uma segunda.
- **Fechamento sem reentrada** — segurar `Ctrl+Q` repetia o evento e disparava
  vários fechamentos concorrentes.

Leitura: `draft.txt`, senão `draft.bak.txt`, senão migra `draft.json`.

### 6.2 Autosave com teto

Debounce de 400ms com teto de 2s. O debounce evita gravar a cada tecla; o teto
existe porque sob digitação contínua — exatamente o ditado por voz — um debounce
puro adiaria a gravação indefinidamente.

---

## 7. Tipografia

Padrão: **Inter**.

Embutidas (todas OFL, redistribuição permitida): Inter, DM Serif Text,
EB Garamond, IBM Plex Mono, DM Mono, Syne, Comic Neue.

**[D] Google Sans Flex foi removida.** O rascunho a listava sob "Bundle OFL",
mas ela é proprietária do Google e não pode ser redistribuída. Substitutos
plausíveis, se quiser uma segunda sans geométrica: Open Sans, Rubik ou Geist.

Fontes locais do sistema continuam suportadas por campo livre nas configurações.

---

## 8. Roteiro

Todas as ideias levantadas na revisão foram aprovadas e distribuídas pelas
fases. O critério de ordem é: primeiro o que elimina atrito no uso diário,
depois o que protege o trabalho, por último os modos especializados.

| Fase | Entrega | Estado |
|---|---|---|
| 0 | Janela frameless, transparência, always-on-top, drag, opacidade | **feito** |
| 0.5 | Spike do `SetWindowDisplayAffinity` | **feito, validado no OBS** |
| 1 | Editor e captura instantânea | **feito, em teste** |
| 2 | Presença e posicionamento | **feito, em teste** |
| 3 | HUD e métricas | **feito, em teste** |
| 4 | Segurança do trabalho | **feito, em teste** |
| 5 | Múltiplas notas e split view | a fazer |
| 6 | Teleprompter e modo notch | a fazer |

### Fase 1 — Editor e captura instantânea

- CodeMirror 6 (`src/editor/editor.ts`) substituindo o `<textarea>`
- Atalhos de edição do VS Code: mover/duplicar linhas, `Ctrl+D`, `Alt+Clique`
  para multi-cursor (o padrão do CodeMirror é `Ctrl+Clique`), `Tab`
- Markdown discreto: títulos maiores, negrito/itálico renderizados, marcadores
  esmaecidos; `Ctrl+B` / `Ctrl+I` alternam a formatação
- Busca com `Ctrl+F`, com o painel no visual do app
- **Invocação global** — `Ctrl+Alt+Space` (alternativas `Ctrl+Shift+Space`,
  `Ctrl+Alt+Shift+Space`). Chama a janela, desliga o fantasma e foca o editor;
  se a janela já está em foco, minimiza.
- **Copiar tudo e limpar** `Ctrl+Shift+Enter` — só limpa se a cópia deu certo,
  e a limpeza é desfazível com `Ctrl+Z`. `Ctrl+Shift+C` copia sem limpar.
- **Colar sem formatação** — o CodeMirror só aceita texto puro; um filtro remove
  espaço rígido e caracteres de largura zero vindos de páginas web
- **Painel de atalhos** `Ctrl+/` ou o botão `?` na barra. Mostra os atalhos
  globais que foram registrados de fato.

**Conflitos removidos do keymap padrão do CodeMirror:** `Mod-[` e `Mod-]`
(indentação → opacidade), `Mod-/` (comentar → painel), `Mod-i` (selecionar nó →
itálico), `Mod-Alt-g`. Os atalhos do app rodam com `Prec.highest` antes de
qualquer atalho do editor.

**Fonte:** Inter Variable empacotada via `@fontsource-variable/inter`.

### Fase 2 — Presença e posicionamento

- **Tamanho externo × interno [D]** — `outer_size()` inclui a moldura invisível
  (borda de redimensionamento e sombra), enquanto `set_size()` define a área
  interna. Na máquina de teste isso dava 22×13 px de diferença, que vazava para
  os dois eixos a cada ajuste: mexer na largura empurrava a altura. Agora todo
  alvo é tratado como tamanho externo e convertido antes de aplicar.
- **Encaixe num canto devolve o tamanho de trabalho** — o app guarda o último
  tamanho escolhido pelo usuário e o restaura ao encaixar num canto; sem isso,
  quem usasse "tela cheia" ficava preso com a janela enorme. Sem preferência
  salva, o padrão é uma coluna estreita e discreta (24% × 46% da área útil).
- **O tamanho preferido só muda por ação deliberada [D]** — o atalho de
  redimensionar e o fim de um arraste de borda. A primeira versão inferia a
  preferência do evento `Resized`, marcando os encaixes do app para ignorá-los;
  não funcionou, porque o Windows dispara o evento mais de uma vez por mudança e
  o encaixe em metade da tela virava "preferência". O arraste de borda é nativo
  e o webview não recebe o `mouseup` que o encerra, então o fim do gesto é
  detectado pela pausa nos eventos de redimensionamento.
- O tamanho preferido é gravado em `window.json` **separado da geometria**: a
  janela pode ser fechada ocupando metade da tela, e isso não pode virar o
  tamanho de trabalho da próxima sessão.
- **Redimensionar por teclado** `Ctrl+Alt+Shift+setas`, em passos de 40 px.
  Não usa `Ctrl+Alt+setas` porque em máquinas com gráfico Intel essa combinação
  gira a tela inteira — é o caso da máquina de desenvolvimento.
- **Encaixe em metades** `Ctrl+Alt+6…9` e tela toda em `Ctrl+Alt+0`, seguindo os
  cantos em `Ctrl+Alt+1…5`. O redimensionamento respeita o tamanho mínimo e
  nunca ultrapassa a área útil do monitor.
- **Esmaecimento por inatividade** — depois de 45 s a janela cai para metade da
  opacidade escolhida. Só acontece com a janela **sem foco e sem o mouse em
  cima**: nos dois casos a pessoa provavelmente está lendo, e sumir com o texto
  seria o contrário do que ela quer. Qualquer sinal de presença restaura na
  hora. Liga e desliga clicando na porcentagem da barra de status; um ponto
  verde indica que está ativo.
- **Atalhos globais configuráveis** (`shortcuts.rs`) — no painel `Ctrl+/`, o
  botão "alterar" grava a próxima combinação. A troca só vale se o sistema
  aceitar o novo atalho; se estiver em uso, nada muda e o motivo aparece. O
  atalho antigo só é liberado depois que o novo entra, então a ação nunca fica
  sem saída. As teclas são gravadas por `event.code`, independentes do layout.

A opacidade pintada e a opacidade preferida viraram coisas separadas no código:
o esmaecimento muda o que está na tela sem tocar na preferência do usuário.

### Fase 3 — HUD e métricas

Cinco módulos (`src/ui/metrics.ts`), ligados e desligados no menu `⋯` da barra:
palavras, caracteres, linhas, **tokens** e **páginas A4/ABNT**. Padrão: palavras
e tokens, porque o uso central do app é escrever prompt.

**Duas métricas são aproximações e a interface admite isso com o sinal `~`:**

- **Tokens** — `caracteres ÷ 3,8`. A regra difundida (÷ 4) vem do inglês;
  português gasta mais tokens pela acentuação e por palavras mais longas. Cada
  modelo tem seu tokenizador, então o número é estimativa por natureza.
- **Páginas** — `caracteres ÷ 2100`, que é o que cabe numa página A4 em ABNT
  (fonte 12, entrelinha 1,5, margens 3/2 cm). Mostrada com uma casa decimal:
  "0,4 pág." diz mais sobre o progresso que "0 pág.".

Prometer precisão onde ela não existe seria pior do que aproximar com honestidade.

### Barra adaptável à largura **[D]**

Os dois lados da barra crescem em direções opostas e, numa janela de 360 px
lógicos, se sobrepunham — encontrado por captura de tela, não em teste manual.
Um `ResizeObserver` escreve a faixa de largura no `body` e o CSS decide o que
esconder, do menos para o mais importante:

| Largura | O que sai |
|---|---|
| < 520 px | rótulos dos chips (fica só o ponto de estado) e o chip de fundo |
| < 400 px | todas as métricas além da primeira |

### Fase 4 — Segurança do trabalho

**Histórico local de versões** (`Ctrl+Shift+S`). O `notes.rs` guarda o texto que
está sendo **substituído**, não o atual — o atual já está em `draft.txt`; o que
não existe em lugar nenhum é o que acabou de ser sobrescrito. No máximo uma
versão a cada 3 minutos de edição, 20 versões mantidas, em
`%APPDATA%/com.ghostpad.app/snapshots/*.txt`.

Restaurar entra como edição normal do editor, então `Ctrl+Z` desfaz a
restauração. Um recurso de recuperação não pode ser ele próprio uma perda.

**Aviso de gravação em andamento.** O `watch.rs` varre os nomes dos processos em
execução e reconhece OBS, Streamlabs, Zoom, Teams, Loom, Camtasia, Bandicam,
ShadowPlay, ScreenRec e ShareX. Se algum estiver aberto e o modo oculto estiver
desligado, um aviso lembra o `Ctrl+Shift+H`.

- **Nunca liga o modo oculto sozinho.** Sumir da tela sem o usuário pedir seria
  pior que o problema que resolve.
- **Um aviso por programa por sessão**, senão o alerta vira ruído e a pessoa
  aprende a ignorá-lo.
- Só nomes de processos: nada de inspecionar janelas ou conteúdo.
- A varredura tem **teste automatizado** (`cargo test`) verificando que enxerga
  processos reais do sistema. Uma falha silenciosa aqui devolveria lista vazia e
  pareceria "nenhum gravador aberto" — exatamente o tipo de mentira tranquila
  que o resto do projeto evita.

### Fase 5 — Múltiplas notas e split view

- **Notas múltiplas** por `Ctrl+1..9`
- Split view 50/50 com separador redimensionável

### Fase 6 — Teleprompter e modo notch

- Rolagem por `requestAnimationFrame`, 10–150 px/s, pausa no `Espaço`
- Linha de foco central opcional
- Modo notch: faixa de 3 linhas centralizada no topo, com máscara gradiente

---

## 9. Atalhos

| Atalho | Ação | Escopo | Fase |
|---|---|---|---|
| `Ctrl+[` / `Ctrl+]` | Opacidade, passos de 10% (20–100%, padrão 90%) | local | 0 |
| `Ctrl+Shift+[` / `]` | Opacidade em saltos de 50% | local | 1 |
| `Ctrl+P` | Always-on-top | local | 0 |
| `Ctrl+Shift+G` | Modo fantasma | local | 0 |
| `Ctrl+Shift+H` | Ocultar de gravações | local | 0 |
| `Ctrl+Alt+1..5` | Snap de canto | local | 0 |
| `Ctrl+Q` | Fechar | local | 0 |
| `Ctrl+Shift+B` | Alterna o fundo (transparente, desfoque, acrylic) | local | 0 |
| **`Ctrl+Alt+G`** ¹ | **Resgate** | **global** | 0 |
| `Ctrl+Alt+Space` ² | Chamar / esconder | global | 1 |
| `Ctrl+Shift+C` | Copiar tudo | local | 1 |
| `Ctrl+Shift+S` | Versões anteriores do texto | local | 4 |
| `Ctrl+B` / `Ctrl+I` | Negrito / itálico | local | 1 |
| `Ctrl+F` | Buscar e substituir | local | 1 |
| `Ctrl+Shift+Enter` | Copiar tudo e limpar | local | 1 |
| `Ctrl+/` | Painel de atalhos | local | 1 |
| `Ctrl+Alt+Shift+setas` | Redimensionar | local | 2 |
| `Ctrl+Alt+6…9` / `Ctrl+Alt+0` | Metade da tela / tela toda | local | 2 |
| `Ctrl+Alt+Shift+setas` | Redimensionar | local | 2 |
| `Ctrl+1..9` | Trocar de nota | local | 5 |

¹ Se ocupado, cai para `Ctrl+Alt+Shift+G` e depois `Ctrl+Alt+Shift+F12`.
² Se ocupado, cai para `Ctrl+Shift+Space` e depois `Ctrl+Alt+Shift+Space`.
