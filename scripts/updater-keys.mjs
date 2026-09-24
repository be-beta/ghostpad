/**
 * Cria o par de chaves do atualizador. Roda uma vez, no computador de quem
 * mantem o projeto.
 *
 * A chave privada assina cada instalador publicado; a publica vai no app e e
 * por ela que uma instalacao ja existente confere que o arquivo baixado saiu
 * do workflow de release, e nao de outro lugar. Nao tem relacao com o
 * certificado de assinatura do Windows (esse custa por ano, e e o que tiraria
 * o aviso do SmartScreen).
 *
 * A chave privada fica FORA do repositorio de proposito, e precisa de copia de
 * seguranca: perde-la significa que nenhuma instalacao existente aceitara
 * atualizacao de novo, e todo mundo teria de reinstalar na mao.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pasta = resolve(raiz, "..", "harp-keys");
const chave = join(pasta, "harp.key");
const conf = join(raiz, "src-tauri", "tauri.conf.json");

if (existsSync(chave)) {
  console.error(`Ja existe uma chave em ${chave}.`);
  console.error("Gerar outra invalidaria as instalacoes que ja existem por ai.");
  console.error("Se for mesmo o que voce quer, apague o arquivo antes.");
  process.exit(1);
}

mkdirSync(pasta, { recursive: true });

console.log(`Gerando o par de chaves em ${pasta}...`);

// Chamado pelo caminho do arquivo .js, e nao por `npx`: no Windows, `npx` e um
// .cmd e precisaria de shell, e o shell do Windows descarta um argumento vazio
// -- o `--password ""` chegava sem valor nenhum e a CLI reclamava.
const cli = join(raiz, "node_modules", "@tauri-apps", "cli", "tauri.js");
execFileSync(process.execPath, [cli, "signer", "generate", "-w", chave, "--password", ""], {
  stdio: "inherit",
});

const publica = readFileSync(`${chave}.pub`, "utf8").trim();
const config = readFileSync(conf, "utf8");

if (!config.includes("COLE_AQUI_A_CHAVE_PUBLICA")) {
  console.log("\nA chave publica ja estava preenchida; tauri.conf.json nao foi tocado.");
} else {
  writeFileSync(conf, config.replace("COLE_AQUI_A_CHAVE_PUBLICA", publica), "utf8");
  console.log("\nChave publica gravada em src-tauri/tauri.conf.json.");
}

console.log(`
Faltam dois passos:

  1. Mandar a chave privada para o GitHub, onde o workflow vai usa-la:

     gh secret set TAURI_SIGNING_PRIVATE_KEY --repo be-beta/harp < "${chave}"
     gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo be-beta/harp --body ""

  2. Guardar uma copia de ${chave} em lugar seguro.
     Sem ela, nenhuma instalacao existente aceita atualizacao.

Depois, commitar o tauri.conf.json com a chave publica.
`);
