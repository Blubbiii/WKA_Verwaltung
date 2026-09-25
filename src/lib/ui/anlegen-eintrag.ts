/**
 * Text and prefill of the "create" entry at the bottom of a picker. With a
 * search that finds nothing, the typed text becomes the proposed name.
 */
export function anlegenEintrag(
  suche: string,
  texte: { neu: string; mitName: string },
  hatTreffer: boolean,
): { text: string; vorbelegung: string } {
  const name = suche.trim();
  if (!name) return { text: texte.neu, vorbelegung: "" };
  return { text: hatTreffer ? texte.neu : texte.mitName.replace("{name}", name), vorbelegung: name };
}
