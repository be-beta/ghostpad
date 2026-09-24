# Distribuição

Como o Harp chega até quem vai usar. A regra que organiza tudo aqui: **nada
custa dinheiro**. O que depende de certificado pago ou de conta de loja fica
registrado como caminho futuro, não como pendência.

## Antes da primeira publicação: as chaves do atualizador

Uma vez só, no computador de quem mantém o projeto:

```bash
npm run updater:keys
```

O comando cria o par de chaves em `../harp-keys`, grava a pública em
`src-tauri/tauri.conf.json` e imprime os dois comandos que mandam a privada para
os segredos do repositório. **Guarde uma cópia da chave privada.** Sem ela,
nenhuma instalação existente aceita atualização, e todo mundo teria de
reinstalar na mão.

Essa assinatura não tem relação com o certificado do Windows. Ela serve para o
app já instalado saber que o arquivo baixado saiu do workflow de release; o
aviso do SmartScreen continua existindo.

## Como publicar uma versão

1. Subir o número da versão em **dois** arquivos — eles precisam bater:
   - `src-tauri/tauri.conf.json` → `version`
   - `package.json` → `version`
2. Commitar.
3. Marcar e empurrar a tag:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

O workflow [`release.yml`](../.github/workflows/release.yml) compila no
`windows-latest`, cria o release e envia três arquivos:

| Arquivo | O que é |
| --- | --- |
| `Harp-Setup.exe` | Instalador NSIS, nome fixo |
| `Harp-Setup.exe.sha256` | Soma de verificação |
| `latest.json` | O que o app instalado lê para saber de versões novas |

O nome fixo é o que permite ao site ter um botão que nunca precisa ser editado:

```
https://github.com/be-beta/harp/releases/latest/download/Harp-Setup.exe
```

Sem tag, o disparo manual do workflow compila e guarda o instalador como
artefato, sem publicar nada. Serve para conferir que o build ainda passa.

## Branches e canais **[D]**

**Não é preciso uma branch para testar e outra para publicar.** Quem decide o
que chega a quem já instalou é a **tag**, não a branch: o workflow só publica
quando uma tag `v*` é empurrada, e o `latest.json` só muda aí. Dá para commitar
na `main` o dia inteiro sem que ninguém receba nada.

Então o fluxo é:

- `main` é onde o trabalho acontece.
- `git tag v0.2.0 && git push origin v0.2.0` quando uma versão estiver pronta.
- Entre uma tag e outra, o disparo manual do workflow compila e guarda o
  instalador como artefato, para testar sem publicar.

Uma segunda branch só passa a valer a pena quando houver mais de uma pessoa
mexendo, ou quando um trabalho longo precisar ficar fora do caminho por
semanas. Enquanto for uma pessoa só, ela adiciona cerimônia e não segurança.

Canal separado de beta também não é necessário agora: **todo mundo é beta
testador**. O dia de separar canais é o dia em que existir gente usando o Harp a
sério, que não pode receber uma versão pela metade — aí entra um segundo
`latest.json` e um endpoint por canal.

## O aviso do SmartScreen **[D]**

O instalador não é assinado, então o Windows mostra a tela azul na primeira
execução. Um certificado OV custa algo entre US$ 200 e US$ 400 por ano, e a
Microsoft Store — que assina por você e elimina o aviso — cobra US$ 19 uma vez
pela conta de desenvolvedor.

A escolha foi distribuir sem gastar nada agora. O custo disso é um atrito real
na primeira instalação, e a forma honesta de lidar com ele é explicar o aviso em
vez de fingir que não existe: o README diz o que é, por que aparece e como
passar. O `SHA256` publicado e o build feito em público no GitHub Actions são o
que sobra de garantia — nenhum binário sai da máquina do autor.

Isso muda no dia em que houver orçamento. A Store é o melhor custo-benefício:
US$ 19 uma vez, assinatura inclusa, atualização automática.

## winget

Só depois de existir um release publicado, porque o manifesto precisa da URL
definitiva e da soma do arquivo.

1. Instalar o `wingetcreate`:

```bash
winget install Microsoft.WingetCreate
```

2. Gerar o manifesto a partir do release:

```bash
wingetcreate new https://github.com/be-beta/harp/releases/latest/download/Harp-Setup.exe
```

Responder com:

- **PackageIdentifier:** `be-beta.Harp`
- **License:** `MIT`
- **ShortDescription:** a frase da seção 1 de [IDENTIDADE.md](IDENTIDADE.md)

3. O comando abre um PR em `microsoft/winget-pkgs`. A revisão é automática na
   maior parte, e costuma levar de horas a poucos dias.

Depois de aprovado, instalar passa a ser:

```bash
winget install be-beta.Harp
```

O winget aceita instalador sem assinatura — o aviso do SmartScreen continua
valendo, mas quem instala pela linha de comando não o vê.

## GitHub Pages

O site fica no mesmo repositório. **Não usar a pasta `/docs`**: ela já é a
documentação técnica, e o Pages publicaria `ARCHITECTURE.md` como página. O
site vai numa pasta própria, publicada por workflow.

## Atualização dentro do app **[D]**

Fora de loja, ninguém atualiza por você: sem isto, cada correção dependeria de a
pessoa lembrar de visitar o repositório. O app procura versão nova trinta
segundos depois de abrir e a cada seis horas.

Três decisões, todas pelo mesmo motivo — um app que promete não interromper não
pode interromper nem para se atualizar:

- **Nenhuma janela.** Aparece um chip na cor de destaque na barra de baixo, e
  nada mais. Sem som, sem pergunta, sem modal.
- **Nunca instala sozinho.** Atualizar fecha o app, e fechar o app sem a pessoa
  mandar é exatamente o que este projeto não faz.
- **Falha calada.** Sem rede, GitHub fora do ar ou manifesto malformado não
  viram aviso: não são problema de quem só queria anotar alguma coisa. O erro
  vai para o console.

## Caminhos que ficam para depois

- **Certificado de assinatura** — tira o SmartScreen, custa por ano.
- **Microsoft Store** — MSIX, US$ 19 uma vez, assinatura e atualização inclusas.
