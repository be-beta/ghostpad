# Harp

**Escrita centrada no contexto.** Um bloco de notas translúcido que fica por
cima do que você está olhando, para que anotar não custe a tela.

Windows, gratuito, tudo local.

> **Estado:** primeira versão pública — `v0.1.0`, em beta.
> Janela, editor, métricas, histórico, múltiplas notas, teleprompter e
> atualização dentro do app.
> Documentação em [docs/](docs/README.md): arquitetura, identidade e distribuição.
>
> O projeto se chamou **GhostPad** até aqui. Quem usou a versão antiga não perde
> nada: a pasta de dados é migrada na primeira abertura.

## Manifesto

**Escrever não pode custar o que você está olhando.**
A tela deixou de ser uma página.

Hoje, enquanto escrevemos, também observamos, comparamos, testamos, editamos,
apresentamos, ouvimos e decidimos. Existe informação acontecendo em toda parte,
ainda assim, quando precisamos escrever, quase sempre abrimos uma página em
branco.

Harp parte de outra ideia. A escrita pode existir junto do que estamos fazendo.
O centro continua sendo aquilo que está diante dos nossos olhos.

Cada detalhe parte da mesma pergunta: como escrever sem precisar abandonar o que
está acontecendo? Isso também muda o que esperamos de uma ferramenta de escrita.
Ela precisa ser rápida o suficiente para acompanhar uma observação e previsível
o suficiente para nunca exigir atenção quando ela não é necessária.

_Uma nova relação entre escrita e tela._

## Princípios de engenharia

Estes explicam decisões de código, e não são texto de apresentação — esse está
no manifesto acima.

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

## O que o Harp não é

Não é gerenciador de notas, não organiza sua vida, não sincroniza, não tem
pastas nem etiquetas, não quer virar seu segundo cérebro. É uma superfície para
escrever por cima do que você está fazendo — e sair da frente depois.

## Instalação

[**Baixar o Harp**](https://github.com/be-beta/harp/releases/latest/download/Harp-Setup.exe)
— Windows 10 (2004+) ou 11, gratuito.

O instalador ainda não é assinado, então na primeira vez o Windows mostra a tela
azul do **SmartScreen**. Não é vírus nem erro: é o aviso que o Windows dá a todo
programa novo sem certificado, que custa algumas centenas de dólares por ano.
Para continuar, clique em **Mais informações** e depois em **Executar assim
mesmo**.

Quem preferir conferir antes: cada versão publica o `SHA256` do instalador ao
lado dele, e o arquivo é construído em público pelo
[workflow de release](.github/workflows/release.yml) — ninguém, nem o autor,
envia um binário feito na própria máquina.

## Recursos

- **Sempre no topo**, sem barra de título nem bordas
- **Transparência real** sobre o app de baixo, com desfoque opcional
- **Opacidade ajustável** por teclado, em tempo real
- **Modo fantasma** — o mouse atravessa a janela
- **Invisível em gravações** — OBS, Zoom, Teams e Meet não capturam a janela
- **Snap de cantos** consciente de multi-monitor e escala de tela
- **Endereços viram links** — `Ctrl+clique` abre no navegador
- **Atualização dentro do app**, sem loja e sem instalar nada por conta própria
- **Chamada instantânea** de qualquer app com `Ctrl+Alt+Space`
- **Editor com atalhos do VS Code**: mover e duplicar linhas, multi-cursor
- **Copiar tudo e limpar** para o ciclo de escrever prompts
- **Barra de status modular**: palavras, caracteres, linhas, tokens e páginas
- **Esmaece sozinho** quando fica parado e sem foco
- **Atalhos globais configuráveis**, porque variam de máquina para máquina
- **Abrir e salvar arquivos** `.txt` e `.md`, sem depender de outro editor
- **Até cinco anotações** em abas discretas no topo, cada uma com seu desfazer
- **Histórico local de versões**, para recuperar texto perdido
- **Aviso quando há gravação em andamento**, lembrando de se ocultar
- **Teleprompter** com rolagem automática e modo faixa para gravações
- **Português, inglês e espanhol**, com oito opções de fonte embutidas
- **Tema claro, escuro ou do sistema**, com cor de destaque à escolha
- **Autosave** do texto, com backup

## Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+/` | Painel com todos os atalhos |
| `Ctrl+Alt+Space` | Chama ou esconde o Harp, de qualquer app |
| `Ctrl+Shift+Enter` | Copia tudo e limpa (`Ctrl+Z` desfaz) |
| `Ctrl+S` / `Ctrl+Shift+S` | Salvar / salvar como |
| `Ctrl+O` | Abrir arquivo de texto |
| `Ctrl+1` … `Ctrl+5` | Troca de aba |
| `Ctrl+T` / `Ctrl+W` | Nova aba / fechar aba |
| `Ctrl+Alt+P` / `Ctrl+Alt+N` | Teleprompter / modo faixa |
| `Ctrl+Alt+F` | Teleprompter em tela cheia |
| `Ctrl+clique` | Abre o endereço sob o cursor |
| `Ctrl+=` / `Ctrl+−` | Aumenta / diminui o tamanho do texto |
| `Ctrl+,` | Configurações: idioma, fonte e tamanho |
| `Ctrl+Shift+V` | Versões anteriores do texto |
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
fora da área visível. Se outro programa já usar `Ctrl+Alt+G`, o Harp passa
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

MIT — ver [LICENSE](LICENSE).
