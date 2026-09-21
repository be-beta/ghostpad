# GhostPad

Bloco de notas flutuante, translúcido e sem bordas para Windows.

Fica sempre visível por cima de navegadores, editores e ferramentas de design,
sem cobrir o que está embaixo — para escrever prompts, anotar enquanto analisa
uma interface, ditar por voz ou ler um roteiro durante uma gravação sem que ele
apareça no vídeo.

> **Estado:** Fase 4 — janela, editor, métricas e histórico prontos; múltiplas
> notas e teleprompter em seguida.
> Roteiro completo em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Manifesto

**Escrever não pode custar o que você está olhando.**

Toda anotação feita durante um trabalho visual — analisar uma interface, redigir
um prompt sobre um texto, seguir um roteiro numa gravação — obriga a uma escolha
absurda: ou você vê, ou você escreve. O `Alt+Tab` não é um atalho, é um imposto
cobrado a cada ideia. Bloco de notas cobre a tela. Janela comum rouba o foco. E
toda ferramenta que promete ficar "fora do caminho" acaba pedindo um clique,
um menu, uma barra de título.

O GhostPad existe para que escrever seja a única coisa que você faz.

### Princípios

**1. O texto do usuário é sagrado.**
Nada é mais grave do que perder o que a pessoa acabou de escrever. Por isso a
gravação é atômica, guarda a versão anterior, acontece a cada pausa e nunca
depende de fechar o app direito. Copiar e limpar só limpa se a cópia deu certo,
e ainda assim dá para desfazer. Não existe "quase salvo".

**2. O teclado manda.**
Se uma ação exige tirar a mão do teclado, ela ainda não está pronta. O mouse é
bem-vindo, nunca obrigatório. E como um app sem menus não tem onde se explicar,
ele carrega o próprio mapa: `Ctrl+/`.

**3. Estado invisível precisa gritar.**
Um app que atravessa cliques, some de gravações e fica transparente pode falhar
sem que ninguém perceba. Então: se o modo oculto não funcionar, o aviso diz em
letras claras que você **aparece** na gravação. Se a janela abrir quase
invisível, ela pisca antes de esmaecer para você saber onde está. Se um atalho
global estiver ocupado, o app troca por outro e diz qual. Nada aqui falha calado.

**4. Sempre existe volta.**
Por mais escondido, transparente ou fora da tela que o app esteja, uma tecla o
traz de volta ao normal. Um recurso que pode prender o usuário só pode existir
com a saída construída antes dele.

**5. Presença, não interrupção.**
Sem barra de título, sem moldura, sem ícones disputando atenção. Os controles
aparecem quando o mouse chega perto e somem quando ele sai. A barra de baixo
fica a 35% até você olhar para ela. Discrição é funcionalidade.

**6. Promessa cumprida vale mais que efeito bonito.**
O desfoque do Windows falhou silenciosamente numa máquina real de teste — a API
respondia "sucesso" e pintava um fundo sólido. Ele virou opção; a transparência
real, que funciona em qualquer computador, virou o padrão. Entre o impressionante
e o confiável, o app escolhe o confiável.

**7. Seu texto é seu.**
Tudo vive na sua máquina, em arquivos que você pode abrir com qualquer editor.
Sem conta, sem nuvem, sem telemetria, sem rede.

### O que o GhostPad não é

Não é gerenciador de notas, não organiza sua vida, não sincroniza, não tem
pastas nem etiquetas, não quer virar seu segundo cérebro. É uma superfície para
escrever por cima do que você está fazendo — e sair da frente depois.

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
- **Barra de status modular**: palavras, caracteres, linhas, tokens e páginas
- **Esmaece sozinho** quando fica parado e sem foco
- **Atalhos globais configuráveis**, porque variam de máquina para máquina
- **Histórico local de versões**, para recuperar texto perdido
- **Aviso quando há gravação em andamento**, lembrando de se ocultar
- **Autosave** do texto, com backup

## Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+/` | Painel com todos os atalhos |
| `Ctrl+Alt+Space` | Chama ou esconde o GhostPad, de qualquer app |
| `Ctrl+Shift+Enter` | Copia tudo e limpa (`Ctrl+Z` desfaz) |
| `Ctrl+Shift+S` | Versões anteriores do texto |
| `Ctrl+[` / `Ctrl+]` | Diminui / aumenta a opacidade em 10% |
| `Ctrl+Shift+[` / `]` | Opacidade em saltos de 50% |
| `Ctrl+P` | Alterna sempre-no-topo |
| `Ctrl+Shift+G` | Modo fantasma |
| `Ctrl+Shift+H` | Ocultar de gravações |
| `Ctrl+Alt+1..5` | Encaixa nos cantos |
| `Ctrl+Alt+6..9` / `Ctrl+Alt+0` | Metade da tela / tela toda |
| `Ctrl+Alt+Shift+setas` | Redimensiona a janela |
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
