/**
 * Mahnwesen.
 *
 * Lag bis zur Entschlackung unter `/buchhaltung/zahlungen` als Reiter neben
 * dem SEPA-Zahllauf. Beides ist gefallen: die Buecher fuehrt der
 * Steuerberater, Zahlungen laufen ueber die Bank.
 *
 * Geblieben ist das Mahnwesen — und das gehoert zu den Rechnungen. Es holt
 * sich seine Kandidaten aus den offenen Posten, nicht aus einer Buchhaltung,
 * und hatte auch vorher keine einzige Abhaengigkeit dorthin.
 */

import MahnwesenInhalt from "./mahnwesen-inhalt";

export default function MahnwesenSeite() {
  return <MahnwesenInhalt />;
}
