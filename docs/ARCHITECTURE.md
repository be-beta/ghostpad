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

### 3.1 O desfoque não é CSS **[D]**

O rascunho previa `backdrop-filter: blur()` no container. **Isso não funciona.**
Dentro do WebView2, `backdrop-filter` só enxerga o conteúdo da própria página —
ele não tem acesso ao que o DWM desenhou atrás da janela. O resultado seria o
app de baixo aparecendo perfeitamente nítido.

O desfoque real vem do sistema operacional, via `window_vibrancy::apply_acrylic`
no backend Rust.

**Acrylic, não Mica.** Mica borra o *wallpaper*, não as janelas de baixo — ou
seja, é inútil para o caso de uso do GhostPad, que é sobrepor conteúdo a outro
aplicativo.

### 3.2 Opacidade é CSS, o blur é nativo **[D]**

O acrylic é aplicado **uma única vez**, com tint quase transparente
`(18, 18, 18, 10)`. O controle de opacidade do usuário mexe numa camada CSS por
cima (`.gp-backdrop`), não no efeito nativo.

Motivo: reaplicar acrylic a cada passo de `Ctrl+]` causaria flicker visível.
Uma camada CSS anima a 60fps sem piscar. O blur permanece constante; só o
escurecimento varia.

### 3.3 Cantos arredondados são nativos **[D]**

O backdrop do acrylic é retangular. Um `border-radius: 16px` só em CSS deixaria
os cantos do desfoque aparecendo por fora da caixa arredondada.

A janela é arredondada de verdade via `DwmSetWindowAttribute` com
`DWMWA_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND`, e aí o acrylic acompanha a
região. O CSS mantém o `border-radius` para o conteúdo interno.

*Windows 10 não tem esse atributo.* A chamada falha e é ignorada — a janela fica
com cantos retos, o app continua funcionando.

### 3.4 Degradação graciosa

`apply_startup_effects()` devolve um `EffectsReport` que diz o que realmente
pegou na máquina do usuário, e emite isso ao frontend no evento
`ghostpad://effects-report`.

O frontend assume o pior até receber o relatório. Se o acrylic falhou, ele muda
para um fundo praticamente sólido (`--gp-opacity: 0.97`) — porque uma janela
transparente **sem** desfoque deixa o texto ilegível sobre o app de baixo.

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

### 5.2 Atalho de resgate — `Ctrl+Alt+G` **[D]**

Registrado **no backend**, globalmente. Ausente no rascunho e não é opcional:
o GhostPad pode estar simultaneamente em modo fantasma, oculto de captura e
posicionado fora da área visível. Nesse estado o frontend está inalcançável,
então a única saída confiável precisa viver fora dele.

`panic_recover` desfaz tudo: desliga fantasma, desliga o modo oculto, mostra,
restaura, traz ao topo, centraliza no monitor atual e devolve o foco.

---

## 6. Persistência

`%APPDATA%/com.ghostpad.app/`

| Arquivo | Conteúdo |
|---|---|
| `settings.json` | opacidade, always-on-top, modo oculto |
| `draft.json` | o texto do usuário |

**[D] Arquivos separados de propósito.** Se as preferências corromperem, o texto
sobrevive. Perder a opacidade preferida é aborrecimento; perder a nota é perder
trabalho.

**[D] O rascunho original não previa persistência do texto** — só `config.json`.
Para um bloco de notas, essa é a funcionalidade número um.

### Autosave com teto

`debounceWithCeiling(600ms, 4000ms)`. O debounce evita escrever a cada tecla; o
teto existe porque, sob digitação contínua — exatamente o caso do ditado por
voz — um debounce puro adiaria a gravação indefinidamente e uma queda levaria a
sessão inteira junto.

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
| 0 | Janela frameless, acrylic, always-on-top, drag, opacidade | **feito** |
| 0.5 | Spike do `SetWindowDisplayAffinity` | **feito, a validar** |
| 1 | Editor e captura instantânea | a fazer |
| 2 | Presença e posicionamento | parcial |
| 3 | HUD e métricas | parcial |
| 4 | Segurança do trabalho | a fazer |
| 5 | Múltiplas notas e split view | a fazer |
| 6 | Teleprompter e modo notch | a fazer |

### Fase 1 — Editor e captura instantânea

- CodeMirror 6 substituindo o `<textarea>` (nada mais muda na casca)
- Atalhos de edição do VS Code: mover/duplicar linhas, multi-cursor, `Tab`
- **Invocação global** `Ctrl+Alt+Space` — mostra, foca e posiciona o cursor a
  partir de qualquer app. Entra na Fase 1 por ser a funcionalidade que mais
  reduz atrito: sem ela, começar a escrever ainda exige `Alt+Tab`.
- **Copiar tudo e limpar** `Ctrl+Shift+Enter` — com desfazer disponível logo
  após, para o caso de limpar por engano
- **Colar sempre sem formatação**
- **Painel de atalhos** `Ctrl+/` — única forma de descobrir recursos num app
  sem menus

### Fase 2 — Presença e posicionamento

- Modo fantasma completo, com atalho global de saída
- **Fade por inatividade** — clareia após alguns segundos sem digitar, volta
  ao receber foco ou movimento do mouse; desligável
- **Snap de metade de tela**, além dos cantos
- **Redimensionar por teclado** `Ctrl+Alt+Shift+setas`

### Fase 3 — HUD e métricas

- Palavras, caracteres, linhas
- **Estimativa de tokens** — rotulada como aproximação
- Estimativa de páginas A4/ABNT — também rotulada como aproximação
- Módulos da barra ligáveis individualmente

### Fase 4 — Segurança do trabalho

- **Snapshots locais** com histórico curto e restauração por atalho
- **Aviso de gravação em andamento** — detecta OBS, Zoom, Teams e Meet ativos
  e sugere o modo oculto; nunca liga sozinho

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
| `Ctrl+[` / `Ctrl+]` | Opacidade | local | 0 |
| `Ctrl+P` | Always-on-top | local | 0 |
| `Ctrl+Shift+G` | Modo fantasma | local | 0 |
| `Ctrl+Shift+H` | Ocultar de gravações | local | 0 |
| `Ctrl+Alt+1..5` | Snap de canto | local | 0 |
| `Ctrl+Q` | Fechar | local | 0 |
| **`Ctrl+Alt+G`** | **Resgate** | **global** | 0 |
| `Ctrl+Alt+Space` | Invocar / focar | global | 1 |
| `Ctrl+Shift+Enter` | Copiar tudo e limpar | local | 1 |
| `Ctrl+/` | Painel de atalhos | local | 1 |
| `Ctrl+Alt+Shift+setas` | Redimensionar | local | 2 |
| `Ctrl+1..9` | Trocar de nota | local | 5 |
