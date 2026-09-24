# Harp — ideação, identidade e proposta

Documento de referência para qualquer pessoa (ou agente) que vá escrever sobre o
Harp: site, loja, README, texto de lançamento. Quem for construir o site deve ler
este arquivo antes de escrever a primeira linha.

O nome anterior do projeto era GhostPad. A troca para Harp já está feita em todo
o código, e a pasta de dados de quem usou a versão antiga é migrada sozinha na
primeira abertura.

---

## 1. Em uma frase

**Harp é escrita centrada no contexto: um bloco de notas translúcido que fica
por cima do que você está olhando, para que anotar não custe a tela.**

## 2. Manifesto

Texto canônico. Não reescrever sem necessidade; se o site precisar de uma versão
curta, cortar frases inteiras em vez de parafrasear.

> **Harp**
> Escrever não pode custar o que você está olhando.
> A tela deixou de ser uma página.
>
> Hoje, enquanto escrevemos, também observamos, comparamos, testamos, editamos,
> apresentamos, ouvimos e decidimos. Existe informação acontecendo em toda
> parte, ainda assim, quando precisamos escrever, quase sempre abrimos uma
> página em branco.
>
> Harp parte de outra ideia.
> A escrita pode existir junto do que estamos fazendo. O centro continua sendo
> aquilo que está diante dos nossos olhos.
> A escrita centrada no contexto.
>
> Cada detalhe parte da mesma pergunta:
> como escrever sem precisar abandonar o que está acontecendo?
>
> Isso também muda o que esperamos de uma ferramenta de escrita.
> Ela precisa ser rápida o suficiente para acompanhar uma observação e previsível
> o suficiente para nunca exigir atenção quando ela não é necessária.
>
> Harp foi pensado para esse momento.
> _Uma nova relação entre escrita e tela._

## 3. A tese

O argumento que sustenta o produto, em três passos:

1. **O documento em branco foi desenhado para a página, não para a tela.** Ele
   assume que escrever é a tarefa inteira e pede a tela inteira em troca.
2. **Nem toda escrita é a tarefa principal.** Muita anotação é secundária:
   acontece enquanto se analisa uma interface, se testa um fluxo, se lê um
   contrato, se grava um vídeo. Aí a página em branco cobra um preço absurdo —
   ou você vê, ou você escreve.
3. **Para essa escrita, a ferramenta certa é outra.** Não um editor menor: um
   editor que divide a tela com o trabalho em vez de disputá-la.

O Harp não compete com o Word, o Notion ou o Obsidian. Compete com o `Alt+Tab`.

## 4. Para quem

Quem trabalha olhando e anotando ao mesmo tempo: quem escreve prompts diante do
resultado, quem revisa uma interface, quem lê roteiro durante uma gravação, quem
transcreve uma reunião, quem estuda com um vídeo aberto.

O traço comum não é a profissão, é a hierarquia: **a anotação é o secundário**.
Quem escreve um livro já tem ferramenta boa. Quem anota enquanto faz outra coisa
não tem.

## 5. O que o Harp não é

Dizer isto evita que o site prometa o que o app não entrega:

- Não é um gerenciador de conhecimento: não tem base, nem links entre notas, nem
  busca global no acervo.
- Não é um editor de texto rico: não tem estilos, tabelas nem exportação.
- Não é colaborativo, não tem nuvem, não tem conta. Tudo é local.
- Não tem IA dentro.

## 6. Modelo

Gratuito, sem conta, sem anúncio, sem telemetria. **A proposta é vender a ideia
sem vender nada.** O sucesso se mede por quantas pessoas entendem o conceito, não
por quantas baixam.

Isso define o tom do site: ele é um **argumento**, não uma página de produto com
lista de recursos. A lista existe, mas depois.

## 7. O nome

**Harp** — harpa, e harpia. A harpa porque o gesto é leve e o instrumento vive de
cordas paralelas que soam juntas, como camadas na tela. A harpia porque ela
enxerga de cima e age sem ruído.

O ícone atual (`assets/harp.svg`) é uma harpa. O gerador de ícones do app é
`scripts/make-icon.mjs`.

## 8. Tom de voz

O manifesto já é a amostra. Regras extraídas dele:

- **Frases curtas, afirmativas.** Sem "e se você pudesse", sem pergunta retórica
  que não seja respondida na frase seguinte.
- **Sem hipérbole.** Nada de "revolucionário", "mágico", "reinventa", "o futuro
  da escrita". A ideia se sustenta sem adjetivo.
- **Sem exclamação.** Sem emoji.
- **Concreto antes de abstrato.** "Escrever um prompt olhando o resultado" vale
  mais que "aumentar a produtividade".
- **Nunca fala mal de quem usa.** O problema é da ferramenta.
- **Primeira pessoa do plural** no manifesto ("quando precisamos escrever"),
  segunda pessoa no resto ("você").

## 9. Identidade visual

A linguagem visual do produto já existe no app, e o site deve herdá-la em vez de
inventar outra:

- **Translucidez.** É o traço central. O fundo do app deixa passar o que está
  atrás; o site deve mostrar isso literalmente — o Harp sobre uma tela real de
  trabalho, nunca recortado em fundo branco.
- **Camadas.** Texto sobre conteúdo, não ao lado dele.
- **Paleta.** Fundo quase preto (`#121212`) no escuro, quase branco (`#f4f4f6`)
  no claro. O app tem sete cores de destaque, cada uma com um tom por tema —
  menta, azul, violeta, âmbar, coral, roxo (`#3215ad` no claro) e cinza. A lista
  exata está em `src/core/theme.ts`. Menta é a padrão; o roxo é a cor preferida
  do autor para a marca.
- **Tipografia.** O app traz Inter, DM Serif Text, EB Garamond, IBM Plex Mono,
  DM Mono, Syne e Comic Neue — todas OFL, já no repositório. Inter é a padrão da
  interface. O site deve usar uma dessas.
- **Cantos arredondados de 8 px**, linhas de 1 px muito discretas, nenhuma
  sombra pesada.

## 10. Briefing do site

**Objetivo:** fazer a pessoa entender a tese em menos de trinta segundos e sair
com o app instalado ou com a ideia na cabeça — nessa ordem de importância.

**Estrutura sugerida** (quem construir pode discordar, com motivo):

1. **Abertura** — a frase "Escrever não pode custar o que você está olhando." e
   uma demonstração visual do Harp sobre uma tela de trabalho real. Um botão de
   download, sem formulário.
2. **A tese** — o manifesto, respirado, não como bloco único.
3. **Os momentos** — três ou quatro situações concretas (prompt diante do
   resultado, roteiro numa gravação, anotação sobre uma interface, transcrição
   de reunião). Imagem ou vídeo curto em cada.
4. **O que ele faz** — aí sim os recursos, secos (ver seção 11).
5. **Download** — Windows, gratuito, link para a versão mais recente.

**Restrições:**

- Página única, estática, sem framework pesado — ela vai no GitHub Pages.
- Sem rastreamento, sem cookie, sem fonte carregada de servidor de terceiros.
  Um site sobre não invadir a tela de ninguém não coleta nada.
- Precisa funcionar em tema claro e escuro.
- Português primeiro. O app fala português, inglês e espanhol; o site pode
  seguir depois.
- Toda afirmação sobre o produto tem de sair da seção 11 ou do README. **Não
  inventar recurso.**

## 11. O que o produto realmente faz

Fatos verificáveis, para o site não prometer o que não existe:

- Janela translúcida, sem bordas, sempre por cima, com opacidade ajustável.
- **Modo fantasma:** cliques atravessam a janela.
- **Oculto de gravações:** a janela não aparece em captura nem em
  compartilhamento de tela (`WDA_EXCLUDEFROMCAPTURE`, Windows 10 2004+).
- **Invocação global:** aparece e some com um atalho, de qualquer aplicativo.
- Até cinco notas em abas, com histórico de versões local.
- **Teleprompter** com rolagem contínua, modo faixa no topo da tela e modo tela
  cheia.
- Abrir e salvar `.txt` e `.md`.
- **Markdown onde ele ajuda:** listas continuam sozinhas no Enter, negrito e
  itálico por atalho. Não é texto formatado — o arquivo continua sendo texto.
- **Endereços no texto viram links:** `Ctrl+clique` abre no navegador. Não há
  inserir link nem esconder o endereço atrás de um rótulo.
- Posições rápidas: cantos, metades, tela inteira.
- Três idiomas, sete fontes, tema claro/escuro/sistema, cor de destaque.
- Tudo local. Nenhuma conta, nenhum cadastro. A única conexão que o app faz é
  procurar versão nova, e ela não envia nada sobre quem usa.
- **Atualização dentro do app:** um ponto discreto sobre a engrenagem quando há
  versão nova; instala quando a pessoa clica, nunca sozinho.
- **Download livre.** Não é preciso conta no GitHub, nem conta nenhuma, para
  baixar ou para receber atualizações.
- **Windows.** Requer WebView2, já incluso no Windows 11.

Os sete princípios de engenharia que estão no README são **internos** — explicam
decisões de código. O manifesto da seção 2 é o texto público. Não misturar os
dois.

## 12. Pendências

- [x] Renomear GhostPad → Harp no código. Identificador novo:
      `io.github.be-beta.harp`.
- [x] Licença MIT.
- [ ] Completar o nome do autor na licença (está só "Bernardo").
- [x] Site no mesmo repositório, em pasta própria (não em `/docs`, que já é a
      documentação técnica). Ver [DISTRIBUICAO.md](DISTRIBUICAO.md).
- [ ] Primeira versão publicada em Releases.
