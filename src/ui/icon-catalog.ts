/**
 * As 25 categorias de icone das abas.
 *
 * Um conjunto fechado de proposito: com uma lista aberta, escolher um icone
 * vira procurar um icone, e a ideia e identificar uma aba num relance — nao
 * decorar. Nada de logos ou marcas: "codigo" serve a qualquer editor, e um logo
 * envelheceria com o produto que ele representa.
 *
 * `names` guarda o nome de cada conceito nas tres familias comparadas em
 * `dev/icons.html`. So a familia escolhida entra no app (ver `tab-icons.ts`).
 */

export const ICON_IDS = [
  "image",
  "video",
  "audio",
  "code",
  "web",
  "link",
  "data",
  "chart",
  "document",
  "list",
  "tasks",
  "presentation",
  "vector",
  "person",
  "meeting",
  "calendar",
  "idea",
  "bookmark",
  "favorite",
  "work",
  "home",
  "project",
  "research",
  "generic",
  "ai",
] as const;

export type IconId = (typeof ICON_IDS)[number];

export function isIconId(value: unknown): value is IconId {
  return typeof value === "string" && (ICON_IDS as readonly string[]).includes(value);
}

/** Nome do arquivo em cada familia, para a pagina de comparacao. */
export const FAMILY_NAMES: Record<IconId, { heroicons: string; phosphor: string; tabler: string }> = {
  image: { heroicons: "photo", phosphor: "image", tabler: "photo" },
  video: { heroicons: "video-camera", phosphor: "video-camera", tabler: "video" },
  audio: { heroicons: "musical-note", phosphor: "music-note", tabler: "music" },
  code: { heroicons: "code-bracket", phosphor: "code", tabler: "code" },
  web: { heroicons: "globe-alt", phosphor: "globe", tabler: "world" },
  link: { heroicons: "link", phosphor: "link", tabler: "link" },
  data: { heroicons: "table-cells", phosphor: "table", tabler: "table" },
  chart: { heroicons: "chart-bar", phosphor: "chart-bar", tabler: "chart-bar" },
  document: { heroicons: "document-text", phosphor: "file-text", tabler: "file-text" },
  list: { heroicons: "list-bullet", phosphor: "list-bullets", tabler: "list" },
  tasks: { heroicons: "clipboard-document-check", phosphor: "list-checks", tabler: "list-check" },
  presentation: { heroicons: "presentation-chart-bar", phosphor: "presentation-chart", tabler: "presentation" },
  vector: { heroicons: "paint-brush", phosphor: "pen-nib", tabler: "vector" },
  person: { heroicons: "user", phosphor: "user", tabler: "user" },
  meeting: { heroicons: "chat-bubble-left-right", phosphor: "chats-circle", tabler: "messages" },
  calendar: { heroicons: "calendar", phosphor: "calendar-blank", tabler: "calendar" },
  idea: { heroicons: "light-bulb", phosphor: "lightbulb", tabler: "bulb" },
  bookmark: { heroicons: "bookmark", phosphor: "bookmark-simple", tabler: "bookmark" },
  favorite: { heroicons: "star", phosphor: "star", tabler: "star" },
  work: { heroicons: "briefcase", phosphor: "briefcase", tabler: "briefcase" },
  home: { heroicons: "home", phosphor: "house", tabler: "home" },
  project: { heroicons: "folder", phosphor: "folder", tabler: "folder" },
  research: { heroicons: "magnifying-glass", phosphor: "magnifying-glass", tabler: "search" },
  generic: { heroicons: "hashtag", phosphor: "asterisk", tabler: "asterisk" },
  ai: { heroicons: "sparkles", phosphor: "sparkle", tabler: "sparkles" },
};
