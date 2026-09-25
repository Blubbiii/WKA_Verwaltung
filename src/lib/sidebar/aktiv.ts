/** The nav target a path belongs to: the longest href that matches it. */
export function aktivesZiel(pathname: string, hrefs: Iterable<string>): string | null {
  let bestes: string | null = null;
  for (const href of hrefs) {
    if ((pathname === href || pathname.startsWith(href + "/")) && (!bestes || href.length > bestes.length)) {
      bestes = href;
    }
  }
  return bestes;
}
