/**
 * Roda o `main.ts` real no navegador, com o Tauri simulado.
 *
 * O HTML vem do proprio `index.html`, para a pagina de teste nunca divergir do
 * app. O que depende do sistema (janela, disco, atalhos) responde com valores
 * plausiveis e fica so em memoria.
 */

import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

const notas = new Map<number, string>([
  [1, "Pauta da reunião de segunda\n- [ ] enviar a ata\n- [x] marcar sala\n\nhttps://exemplo.com/doc"],
]);
const loja = new Map<string, unknown>();

mockWindows("main");
mockIPC(
  (cmd, args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    switch (cmd) {
      case "load_note":
        return notas.get(a.slot as number) ?? "";
      case "save_note":
        notas.set(a.slot as number, a.text as string);
        return null;
      case "close_note":
        notas.delete(a.slot as number);
        return null;
      case "list_snapshots":
        return [];
      case "detect_recorders":
        return [];
      case "get_effects_report":
        return {
          captureExclusionAvailable: true,
          panicShortcut: "Ctrl+Alt+G",
          summonShortcut: "Ctrl+Alt+Space",
        };
      case "plugin:store|load":
        return 1;
      case "plugin:store|get":
        return [loja.get(a.key as string) ?? null, loja.has(a.key as string)];
      case "plugin:store|set":
        loja.set(a.key as string, a.value);
        return null;
      case "plugin:app|version":
        return "0.2.0-dev";
      case "plugin:updater|check":
        return null;
      case "plugin:window|outer_position":
      case "plugin:window|inner_position":
        return { x: 0, y: 0 };
      case "plugin:window|outer_size":
      case "plugin:window|inner_size":
        return { width: window.innerWidth, height: window.innerHeight };
      case "plugin:window|scale_factor":
        return 1;
      case "plugin:opener|open_url":
        console.info("[mock] abriria", a.url);
        return null;
      default:
        return null;
    }
  },
  { shouldMockEvents: true },
);

const html = await (await fetch("/index.html")).text();
const doc = new DOMParser().parseFromString(html, "text/html");
document.body.innerHTML = doc.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, "");
await import("../src/styles.css");
await import("../src/main.ts");
