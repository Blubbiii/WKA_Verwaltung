/**
 * FRISTEN FÜR VERSPRECHEN, DIE NICHT ANTWORTEN
 * ==============================================
 *
 * Ein `await` ohne Frist verlässt sich darauf, dass die Gegenseite entweder
 * antwortet oder scheitert. Bei Redis stimmt beides nicht.
 *
 * BullMQ verlangt `maxRetriesPerRequest: null`, und der Reconnect-Versuch gibt
 * bewusst nie auf. In ioredis heisst das: ein Befehl, der bei getrennter
 * Verbindung abgesetzt wird, landet in der Offline-Warteschlange und wartet
 * dort unbegrenzt. Er wirft nicht — ein `try/catch` darum fängt nichts, weil
 * es nichts zu fangen gibt.
 *
 * ## Was daraus wurde
 *
 * Bei abgeschaltetem Redis gemessen: `/api/admin/jobs`,
 * `/api/admin/jobs/stats` und `/api/admin/system/status` antworteten nach 45
 * bzw. 60 Sekunden immer noch nicht. Zwei davon prüfen sogar vorab auf
 * `isRedisHealthy()` und haben eine fertige 503-Antwort parat — sie kamen nur
 * nie bis dorthin, weil die Prüfung selbst wartete.
 *
 * Jeder hängende Aufruf hält dabei eine Verbindung offen. Ein Redis-Ausfall
 * wächst so von einer Teilstörung (Hintergrundjobs stehen still) zu einer
 * Belastung des Webservers.
 *
 * ## Warum diese Datei
 *
 * `/api/health` hatte das Problem längst erkannt und ein eigenes
 * `withTimeout` an SEINER Aufrufstelle gebaut. Die Falle blieb damit für jeden
 * anderen Aufrufer bestehen — und genau das ist passiert. Beim Beheben wären
 * zwei weitere Kopien entstanden. Also: eine.
 */

/**
 * Wartet höchstens `ms` Millisekunden auf `versprechen`.
 *
 * @returns den Wert, oder `ersatz` (Vorgabe `null`), wenn die Frist verstreicht
 *
 * Ein abgelaufenes Versprechen wird **nicht** abgebrochen — das kann JavaScript
 * nicht. Es läuft im Hintergrund weiter und wird ignoriert.
 *
 * Das ist **nicht** in jedem Fall folgenlos, auch wenn hier zunächst das
 * Gegenteil stand. Bei ioredis landet ein Befehl, der bei getrennter
 * Verbindung abgesetzt wird, in der Offline-Warteschlange und bleibt dort:
 * Wer im Sekundentakt prüft, sammelt während eines Ausfalls beliebig viele
 * an, und beim Wiederverbinden laufen sie alle auf einmal los. Deshalb fragt
 * `isRedisHealthy` inzwischen zuerst `redis.status` ab und setzt gar keinen
 * Befehl ab, solange die Verbindung nicht steht.
 *
 * Die Regel daraus: eine Frist begrenzt das **Warten**, nicht die **Wirkung**.
 * Wo der abgelaufene Aufruf etwas hinterlässt, muss er zusätzlich verhindert
 * oder abgebrochen werden — bei `fetch` etwa über `AbortSignal.timeout`.
 *
 * Ein Fehlschlag des Versprechens wird **nicht** abgefangen. Wer scheitert,
 * soll scheitern; diese Funktion regelt nur, wie lange gewartet wird. Wer
 * beides will, hängt sein eigenes `.catch()` an:
 *
 *     await mitFrist(redis.ping().catch(() => null), 1_000)
 */
export function mitFrist<T>(versprechen: Promise<T>, ms: number): Promise<T | null>;
export function mitFrist<T, E>(versprechen: Promise<T>, ms: number, ersatz: E): Promise<T | E>;
export function mitFrist<T, E>(
  versprechen: Promise<T>,
  ms: number,
  ersatz?: E,
): Promise<T | E | null> {
  const ausweg = ersatz === undefined ? null : ersatz;
  let uhr: ReturnType<typeof setTimeout> | undefined;

  const wecker = new Promise<E | null>((aufloesen) => {
    uhr = setTimeout(() => aufloesen(ausweg as E), ms);
    // Ein offener Timer darf den Node-Prozess nicht am Beenden hindern.
    if (typeof uhr === "object" && uhr && "unref" in uhr) {
      (uhr as { unref: () => void }).unref();
    }
  });

  /*
    `finally` mit `clearTimeout` — nicht bloss `unref`.

    Erste Fassung hatte nur `unref()`. Das verhindert, dass der Timer den
    Prozess offenhaelt, raeumt ihn aber NICHT weg: er lebt bis zum Ablauf
    weiter, samt seiner Closure. Bei einer Lebendpruefung im Sekundentakt
    haengen so dauernd Timer in der Luft, die niemand mehr braucht.

    Aufgefallen beim Gegenlesen durch ein zweites Modell — der urspruengliche
    Test prueefte auch nur das `unref`, also genau die halbe Sache.
  */
  return Promise.race([versprechen, wecker]).finally(() => {
    if (uhr !== undefined) clearTimeout(uhr);
  });
}
