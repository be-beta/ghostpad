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

## 6. Persistência

`%APPDATA%/com.ghostpad.app/`

| Arquivo | Conteúdo | Quem grava |
|---|---|---|
| `settings.json` | opacidade, topo, modo oculto, fundo | `tauri-plugin-store` |
| `draft.txt` | o texto do usuário | `notes.rs`, direto |
| `draft.bak.txt` | versão imediatamente anterior | `notes.rs` |
| `draft.json` | formato antigo, lido só para migrar | — |

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
- Atalhos globais configuráveis pelo usuário (resgate e invocação)
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
| `Ctrl+[` / `Ctrl+]` | Opacidade, passos de 10% (20–100%, padrão 90%) | local | 0 |
| `Ctrl+P` | Always-on-top | local | 0 |
| `Ctrl+Shift+G` | Modo fantasma | local | 0 |
| `Ctrl+Shift+H` | Ocultar de gravações | local | 0 |
| `Ctrl+Alt+1..5` | Snap de canto | local | 0 |
| `Ctrl+Q` | Fechar | local | 0 |
| `Ctrl+Shift+B` | Alterna o fundo (transparente, desfoque, acrylic) | local | 0 |
| **`Ctrl+Alt+G`** ¹ | **Resgate** | **global** | 0 |
| `Ctrl+Alt+Space` | Invocar / focar | global | 1 |
| `Ctrl+Shift+Enter` | Copiar tudo e limpar | local | 1 |
| `Ctrl+/` | Painel de atalhos | local | 1 |
| `Ctrl+Alt+Shift+setas` | Redimensionar | local | 2 |
| `Ctrl+1..9` | Trocar de nota | local | 5 |

¹ Se ocupado, cai para `Ctrl+Alt+Shift+G` e depois `Ctrl+Alt+Shift+F12`.
