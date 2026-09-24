# Documentação do Harp

Quatro documentos, cada um com um leitor diferente. Comece pelo que corresponde
ao que você veio fazer.

| Documento | Para quem | O que responde |
| --- | --- | --- |
| [../README.md](../README.md) | Quem chega ao repositório | O que é, como instalar, atalhos, como rodar o projeto |
| [IDENTIDADE.md](IDENTIDADE.md) | Quem vai **escrever sobre** o Harp | Manifesto, tese, público, tom de voz, identidade visual, briefing do site |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Quem vai **mexer no código** | Como o app é feito e por que cada decisão foi tomada |
| [DISTRIBUICAO.md](DISTRIBUICAO.md) | Quem vai **publicar** | Como sair uma versão, chaves, winget, GitHub Pages |

## Se você veio construir o site

Leia [IDENTIDADE.md](IDENTIDADE.md) inteiro antes de escrever a primeira linha.
Ele traz o manifesto canônico, o tom de voz e o briefing.

Duas coisas que costumam dar errado e estão resolvidas lá:

- **A seção 11 lista o que o produto realmente faz.** Toda afirmação do site tem
  de sair de lá ou do README. Não invente recurso.
- **A seção 8 define o tom.** Sem hipérbole, sem exclamação, sem emoji. O
  manifesto já é a amostra do registro certo.

O botão de download aponta para um endereço fixo que nunca precisa ser editado:

```
https://github.com/be-beta/harp/releases/latest/download/Harp-Setup.exe
```

Vale avisar na página sobre o aviso do SmartScreen — sem isso, boa parte das
pessoas desiste na primeira tela. O texto está no README, em **Instalação**.

## Convenção de escrita

As decisões nos documentos são marcadas com **[D]** e sempre trazem o motivo.
Uma decisão registrada sem o porquê vira regra sem dono: ninguém sabe se ainda
vale, e ninguém se sente autorizado a mudá-la.
