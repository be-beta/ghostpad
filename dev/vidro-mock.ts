import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

declare global {
  interface Window {
    __png?: Uint8Array;
    __chamadas: string[];
  }
}

window.__chamadas = [];

// Com o painel do navegador escondido, `requestAnimationFrame` nao dispara e o
// canvas nunca redesenha. So no teste: no app a janela esta sempre visivel
// enquanto o Vidro esta aberto.
window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 16);
mockWindows("vidro");
mockIPC(
  (cmd, args) => {
    window.__chamadas.push(cmd);
    if (cmd === "vidro_finish") {
      // O corpo bruto chega como ArrayBuffer ou Uint8Array.
      const corpo = args as unknown as ArrayBuffer | Uint8Array;
      window.__png = corpo instanceof Uint8Array ? corpo : new Uint8Array(corpo);
    }
    if (cmd === "plugin:store|load") return 1;
    if (cmd === "plugin:store|get") return [null, false];
    return null;
  },
  { shouldMockEvents: true },
);

// Um "desktop" de mentira atras do vidro, claro de um lado e escuro do outro,
// para ver o contraste das anotacoes sobre os dois.
document.documentElement.style.background =
  "linear-gradient(90deg, #f4f4f4 0 50%, #1b1b1f 50% 100%)";

const html = await (await fetch("/vidro.html")).text();
const doc = new DOMParser().parseFromString(html, "text/html");
document.body.className = doc.body.className;
document.body.innerHTML = doc.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, "");
await import("../src/vidro/vidro.ts");

// O `listen` do Vidro se registra de forma assincrona; no app o evento chega
// muito depois, aqui e preciso esperar um instante.
await new Promise((r) => setTimeout(r, 300));
const { emit } = await import("@tauri-apps/api/event");
const dpr = window.devicePixelRatio || 1;
await emit("harp://vidro-open", {
  width: Math.round(window.innerWidth * dpr),
  height: Math.round(window.innerHeight * dpr),
  scale: dpr,
});
