# GhostPad

Bloco de notas flutuante, translúcido e sem bordas para Windows.

Fica sempre visível por cima de navegadores, editores e ferramentas de design,
sem cobrir o que está embaixo — para escrever prompts, anotar enquanto analisa
uma interface, ditar por voz ou ler um roteiro durante uma gravação sem que ele
apareça no vídeo.

> **Estado:** Fase 1 — editor CodeMirror e captura instantânea, em teste.
> Roteiro completo em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Recursos

- **Sempre no topo**, sem barra de título nem bordas
- **Transparência real** sobre o app de baixo, com desfoque opcional
- **Opacidade ajustável** por teclado, em tempo real
- **Modo fantasma** — o mouse atravessa a janela
- **Invisível em gravações** — OBS, Zoom, Teams e Meet não capturam a janela
- **Snap de cantos** consciente de multi-monitor e escala de tela
- **Chamada instantânea** de qualquer app com `Ctrl+Alt+Space`
- **Editor com atalhos do VS Code**: mover e duplicar linhas, multi-cursor
- **Copiar tudo e limpar** para o ciclo de escrever prompts
- **Autosave** do texto, com backup

## Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+/` | Painel com todos os atalhos |
| `Ctrl+Alt+Space` | Chama ou esconde o GhostPad, de qualquer app |
| `Ctrl+Shift+Enter` | Copia tudo e limpa (`Ctrl+Z` desfaz) |
| `Ctrl+[` / `Ctrl+]` | Diminui / aumenta a opacidade em 10% |
| `Ctrl+Shift+[` / `]` | Opacidade em saltos de 50% |
| `Ctrl+P` | Alterna sempre-no-topo |
| `Ctrl+Shift+G` | Modo fantasma |
| `Ctrl+Shift+H` | Ocultar de gravações |
| `Ctrl+Alt+1..5` | Encaixa nos cantos |
| `Ctrl+Shift+B` | Alterna o fundo: transparente, desfoque, acrylic |
| `Ctrl+Q` | Fecha |
| `Ctrl+Alt+G` | **Resgate** — desfaz todos os modos e traz a janela de volta |

O resgate é global: funciona mesmo com a janela em modo fantasma, oculta ou
fora da área visível. Se outro programa já usar `Ctrl+Alt+G`, o GhostPad passa
para `Ctrl+Alt+Shift+G` e mostra o atalho ativo nos avisos.

## Requisitos de desenvolvimento

- Node.js 20+
- Rust (stable, target `x86_64-pc-windows-msvc`)
- Visual Studio Build Tools com o **workload C++** e o Windows SDK
- WebView2 Runtime (já vem no Windows 11)

## Rodando

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

Gera instaladores NSIS e MSI em `src-tauri/target/release/bundle/`.

## Licença

A definir.
