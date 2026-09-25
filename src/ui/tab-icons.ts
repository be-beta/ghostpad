/**
 * Os icones das abas, na familia escolhida: Heroicons 16/solid ("micro").
 *
 * Escolhida na comparacao de `dev/icons.html`, olhando os pixels reais da aba
 * recolhida. Abaixo de 1 px de traco, icone de contorno vira borrao cinza; a
 * silhueta preenchida sobrevive, e ainda continua a linguagem do ponto
 * preenchido que a aba recolhida ja usava.
 *
 * Importados um a um, e nao por glob: so os 30 entram no app.
 */

import type { IconId } from "./icon-catalog";
import i_image from "heroicons/16/solid/photo.svg?raw";
import i_video from "heroicons/16/solid/video-camera.svg?raw";
import i_audio from "heroicons/16/solid/musical-note.svg?raw";
import i_code from "heroicons/16/solid/code-bracket.svg?raw";
import i_web from "heroicons/16/solid/globe-alt.svg?raw";
import i_link from "heroicons/16/solid/link.svg?raw";
import i_data from "heroicons/16/solid/table-cells.svg?raw";
import i_chart from "heroicons/16/solid/chart-bar.svg?raw";
import i_document from "heroicons/16/solid/document-text.svg?raw";
import i_list from "heroicons/16/solid/list-bullet.svg?raw";
import i_tasks from "heroicons/16/solid/clipboard-document-check.svg?raw";
import i_presentation from "heroicons/16/solid/presentation-chart-bar.svg?raw";
import i_vector from "heroicons/16/solid/paint-brush.svg?raw";
import i_person from "heroicons/16/solid/user.svg?raw";
import i_meeting from "heroicons/16/solid/chat-bubble-left-right.svg?raw";
import i_calendar from "heroicons/16/solid/calendar.svg?raw";
import i_idea from "heroicons/16/solid/light-bulb.svg?raw";
import i_bookmark from "heroicons/16/solid/bookmark.svg?raw";
import i_favorite from "heroicons/16/solid/star.svg?raw";
import i_work from "heroicons/16/solid/briefcase.svg?raw";
import i_home from "heroicons/16/solid/home.svg?raw";
import i_project from "heroicons/16/solid/folder.svg?raw";
import i_research from "heroicons/16/solid/magnifying-glass.svg?raw";
import i_generic from "heroicons/16/solid/hashtag.svg?raw";
import i_ai from "heroicons/16/solid/sparkles.svg?raw";
import i_fire from "heroicons/16/solid/fire.svg?raw";
import i_bolt from "heroicons/16/solid/bolt.svg?raw";
import i_beaker from "heroicons/16/solid/beaker.svg?raw";
import i_bug from "heroicons/16/solid/bug-ant.svg?raw";
import i_heart from "heroicons/16/solid/heart.svg?raw";

const SVG: Record<IconId, string> = {
  image: i_image,
  video: i_video,
  audio: i_audio,
  code: i_code,
  web: i_web,
  link: i_link,
  data: i_data,
  chart: i_chart,
  document: i_document,
  list: i_list,
  tasks: i_tasks,
  presentation: i_presentation,
  vector: i_vector,
  person: i_person,
  meeting: i_meeting,
  calendar: i_calendar,
  idea: i_idea,
  bookmark: i_bookmark,
  favorite: i_favorite,
  work: i_work,
  home: i_home,
  project: i_project,
  research: i_research,
  generic: i_generic,
  ai: i_ai,
  fire: i_fire,
  bolt: i_bolt,
  beaker: i_beaker,
  bug: i_bug,
  heart: i_heart,
};

/** SVG pronto para o DOM: tamanho pelo CSS, cor pelo `currentColor`. */
export function iconSvg(id: IconId): string {
  return SVG[id].replace(/\s(width|height)="[^"]*"/g, "");
}
