import type { MarketingConfig, LegalPages } from "./types";

// =============================================================================
// DEFAULT MARKETING CONFIGURATION
// =============================================================================

export const DEFAULT_MARKETING_CONFIG: MarketingConfig = {
  hero: {
    title: "Die Zukunft der Windpark-Verwaltung",
    subtitle:
      "Optimieren Sie Ihre Erträge mit intelligenter Verwaltungssoftware. Von SCADA-Anbindung bis zur automatisierten Abrechnung - alles in einer Plattform.",
  },
  features: [
    {
      title: "SCADA-Integration",
      description:
        "Automatische Erfassung und Analyse von Betriebsdaten Ihrer Windkraftanlagen in Echtzeit.",
      icon: "activity",
    },
    {
      title: "Automatisierte Abrechnung",
      description:
        "Stromerlös-Abrechnungen, Gutschriften und Gesellschafter-Ausschuettungen auf Knopfdruck.",
      icon: "credit-card",
    },
    {
      title: "Gesellschafter-Portal",
      description:
        "Selbstbedienungsportal für Gesellschafter mit Dokumentenzugang, Abstimmungen und Berichten.",
      icon: "users",
    },
    {
      title: "GoBD-konforme Archivierung",
      description:
        "Revisionssichere Dokumentenarchivierung mit Integritaetsprüfung und Audit-Trail.",
      icon: "shield",
    },
    {
      title: "Multi-Mandantenfaehig",
      description:
        "Verwalten Sie mehrere Windparks und Gesellschaften in einer einzigen Installation.",
      icon: "building",
    },
    {
      title: "Intelligentes Dashboard",
      description:
        "Konfigurierbare Dashboards mit Echtzeit-KPIs, Diagrammen und Benachrichtigungen.",
      icon: "layout-dashboard",
    },
  ],
  pricing: {
    basePrice: 50,
    turbinePrice: 10,
    userPrice: 5,
    annualDiscountPercent: 10,
    maxTurbines: 100,
    maxUsers: 50,
  },
  cta: {
    title: "Bereit für die Zukunft?",
    subtitle:
      "WindparkManager wurde von Branchenexperten entwickelt und wird bereits von zahlreichen Betreibergesellschaften eingesetzt. Starten Sie jetzt Ihre kostenlose Testphase.",
  },
};

// =============================================================================
// DEFAULT LEGAL PAGES
// =============================================================================

export const DEFAULT_LEGAL_PAGES: LegalPages = {
  impressum: [
    '<h2>Angaben gemaess &sect; 5 TMG</h2>',
    '<p>[Firmenname]<br/>[Rechtsform, z.B. GmbH &amp; Co. KG]<br/>[Strasse und Hausnummer]<br/>[PLZ] [Ort]</p>',
    '<h3>Vertreten durch</h3>',
    '<p>[Name des/der Geschaeftsfuehrer(s)]</p>',
    '<h3>Kontakt</h3>',
    '<p>Telefon: [Telefonnummer]<br/>E-Mail: [E-Mail-Adresse]</p>',
    '<h3>Registereintrag</h3>',
    '<p>Eintragung im Handelsregister.<br/>Registergericht: [Amtsgericht]<br/>Registernummer: [HRA/HRB-Nummer]</p>',
    '<h3>Umsatzsteuer-ID</h3>',
    '<p>Umsatzsteuer-Identifikationsnummer gemaess &sect; 27a Umsatzsteuergesetz:<br/>[DE-Nummer]</p>',
    '<h3>Verantwortlich fuer den Inhalt nach &sect; 55 Abs. 2 RStV</h3>',
    '<p>[Name]<br/>[Adresse]</p>',
    '<h3>Streitschlichtung</h3>',
    '<p>Die Europaeische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer">https://ec.europa.eu/consumers/odr/</a>.<br/>Unsere E-Mail-Adresse finden Sie oben im Impressum.</p>',
    '<p>Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>',
  ].join("\n"),

  datenschutz: [
    '<h2>1. Datenschutz auf einen Blick</h2>',
    '<h3>Allgemeine Hinweise</h3>',
    '<p>Die folgenden Hinweise geben einen einfachen Ueberblick darueber, was mit Ihren personenbezogenen Daten passiert, wenn Sie diese Website nutzen. Personenbezogene Daten sind alle Daten, mit denen Sie persoenlich identifiziert werden koennen.</p>',
    '<h3>Datenerfassung auf dieser Website</h3>',
    '<p><strong>Wer ist verantwortlich fuer die Datenerfassung auf dieser Website?</strong><br/>Die Datenverarbeitung auf dieser Website erfolgt durch den Websitebetreiber. Dessen Kontaktdaten koennen Sie dem <a href="/impressum">Impressum</a> entnehmen.</p>',
    '<p><strong>Wie erfassen wir Ihre Daten?</strong><br/>Ihre Daten werden zum einen dadurch erhoben, dass Sie uns diese mitteilen, z.B. durch Eingabe in ein Kontaktformular oder bei der Registrierung. Andere Daten werden automatisch oder nach Ihrer Einwilligung beim Besuch der Website durch unsere IT-Systeme erfasst. Das sind vor allem technische Daten (z.B. Internetbrowser, Betriebssystem oder Uhrzeit des Seitenaufrufs).</p>',
    '<p><strong>Welche Rechte haben Sie bezueglich Ihrer Daten?</strong><br/>Sie haben jederzeit das Recht, unentgeltlich Auskunft ueber Herkunft, Empfaenger und Zweck Ihrer gespeicherten personenbezogenen Daten zu erhalten. Sie haben ausserdem ein Recht, die Berichtigung oder Loeschung dieser Daten zu verlangen.</p>',
    '<h2>2. Hosting</h2>',
    '<p>Diese Website wird auf eigenen Servern / bei [Hosting-Anbieter] gehostet. Die personenbezogenen Daten, die auf dieser Website erfasst werden, werden auf den Servern des Hosters gespeichert.</p>',
    '<h2>3. Allgemeine Hinweise und Pflichtinformationen</h2>',
    '<h3>Hinweis zur verantwortlichen Stelle</h3>',
    '<p>Die verantwortliche Stelle fuer die Datenverarbeitung auf dieser Website ist:<br/><br/>[Firmenname]<br/>[Strasse]<br/>[PLZ Ort]<br/><br/>Telefon: [Telefonnummer]<br/>E-Mail: [E-Mail-Adresse]</p>',
    '<h3>Speicherdauer</h3>',
    '<p>Soweit innerhalb dieser Datenschutzerklaerung keine speziellere Speicherdauer genannt wurde, verbleiben Ihre personenbezogenen Daten bei uns, bis der Zweck fuer die Datenverarbeitung entfaellt.</p>',
    '<h3>Ihre Rechte (DSGVO Art. 15-21)</h3>',
    '<ul>',
    '<li><strong>Auskunftsrecht (Art. 15):</strong> Sie koennen Auskunft ueber Ihre gespeicherten Daten verlangen.</li>',
    '<li><strong>Berichtigungsrecht (Art. 16):</strong> Sie koennen die Berichtigung unrichtiger Daten verlangen.</li>',
    '<li><strong>Loeschrecht (Art. 17):</strong> Sie koennen die Loeschung Ihrer Daten verlangen.</li>',
    '<li><strong>Einschraenkung (Art. 18):</strong> Sie koennen die Einschraenkung der Verarbeitung verlangen.</li>',
    '<li><strong>Datenuebertragbarkeit (Art. 20):</strong> Sie koennen Ihre Daten in maschinenlesbarem Format erhalten.</li>',
    '<li><strong>Widerspruchsrecht (Art. 21):</strong> Sie koennen der Verarbeitung widersprechen.</li>',
    '</ul>',
    '<h3>Beschwerderecht bei der Aufsichtsbehoerde</h3>',
    '<p>Im Falle von Verstoessen gegen die DSGVO steht den Betroffenen ein Beschwerderecht bei einer Aufsichtsbehoerde zu.</p>',
    '<h2>4. Datenerfassung auf dieser Website</h2>',
    '<h3>Cookies</h3>',
    '<p>Diese Website verwendet ausschliesslich <strong>technisch notwendige Cookies</strong>. Ein technisch notwendiges Cookie ist das Sitzungs-Cookie fuer die Anmeldung (<code>next-auth.session-token</code>). Dieses Cookie wird bei der Anmeldung gesetzt und nach 24 Stunden oder beim Abmelden geloescht.</p>',
    '<p>Es werden <strong>keine</strong> Tracking-Cookies, Analyse-Cookies oder Werbe-Cookies verwendet. Weitere Informationen finden Sie auf unserer <a href="/cookies">Cookie-Seite</a>.</p>',
    '<h3>Server-Log-Dateien</h3>',
    '<p>Der Provider der Seiten erhebt und speichert automatisch Informationen in Server-Log-Dateien: Browsertyp, Betriebssystem, Referrer URL, Hostname, Uhrzeit der Serveranfrage und IP-Adresse. Grundlage ist Art. 6 Abs. 1 lit. f DSGVO.</p>',
    '<h3>Registrierung und Benutzerkonto</h3>',
    '<p>Bei der Registrierung werden folgende Daten gespeichert: E-Mail-Adresse, Name (optional), Passwort (verschluesselt mit bcrypt). Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragsdurchfuehrung).</p>',
    '<h3>Audit-Protokollierung</h3>',
    '<p>Zur Sicherstellung der Integritaet werden Aenderungen an Geschaeftsdaten protokolliert (Audit-Log). Dabei werden Zeitstempel, Benutzer-ID, IP-Adresse und Art der Aenderung gespeichert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Audit-Logs werden gemaess handels- und steuerrechtlicher Vorschriften mindestens 10 Jahre aufbewahrt.</p>',
    '<h2>5. Auftragsverarbeitung</h2>',
    '<p>Wir setzen folgende Dienstleister als Auftragsverarbeiter ein:</p>',
    '<ul>',
    '<li><strong>Hosting:</strong> [Anbieter] &mdash; Betrieb der Server-Infrastruktur</li>',
    '<li><strong>E-Mail-Versand:</strong> [Anbieter] &mdash; Versand von Benachrichtigungen und Rechnungen</li>',
    '<li><strong>Fehler-Monitoring:</strong> Sentry (Functional Software, Inc.) &mdash; Erfassung von Anwendungsfehlern</li>',
    '</ul>',
    '<p>Mit allen Auftragsverarbeitern wurden Vertraege nach Art. 28 DSGVO geschlossen.</p>',
    '<h2>6. Aenderung dieser Datenschutzerklaerung</h2>',
    '<p>Wir behalten uns vor, diese Datenschutzerklaerung anzupassen, damit sie stets den aktuellen rechtlichen Anforderungen entspricht.</p>',
    '<p><em>Stand: [Datum einfuegen]</em></p>',
  ].join("\n"),

  cookies: [
    '<h2>Welche Cookies verwenden wir?</h2>',
    '<p>WindparkManager verwendet ausschliesslich <strong>technisch notwendige Cookies</strong>. Es werden keine Tracking-, Analyse- oder Werbe-Cookies eingesetzt.</p>',
    '<h3>Technisch notwendige Cookies</h3>',
    '<table><thead><tr><th>Name</th><th>Zweck</th><th>Speicherdauer</th><th>Typ</th></tr></thead><tbody>',
    '<tr><td><code>next-auth.session-token</code></td><td>Authentifizierung und Sitzungsverwaltung nach der Anmeldung</td><td>24 Stunden (oder bis zum Abmelden)</td><td>Erstanbieter, HTTP-Only</td></tr>',
    '<tr><td><code>next-auth.csrf-token</code></td><td>Schutz vor Cross-Site-Request-Forgery (CSRF) bei der Anmeldung</td><td>Sitzung</td><td>Erstanbieter</td></tr>',
    '<tr><td><code>next-auth.callback-url</code></td><td>Weiterleitung nach erfolgreicher Anmeldung</td><td>Sitzung</td><td>Erstanbieter</td></tr>',
    '</tbody></table>',
    '<h3>Lokaler Speicher (Local Storage)</h3>',
    '<table><thead><tr><th>Name</th><th>Zweck</th><th>Speicherdauer</th></tr></thead><tbody>',
    '<tr><td><code>wpm-cookie-consent</code></td><td>Speichert, ob der Cookie-Hinweis bestaetigt wurde</td><td>Dauerhaft (bis manuell geloescht)</td></tr>',
    '<tr><td><code>theme</code></td><td>Bevorzugtes Farbschema (hell/dunkel)</td><td>Dauerhaft</td></tr>',
    '</tbody></table>',
    '<h3>Drittanbieter-Cookies</h3>',
    '<p>Es werden <strong>keine Drittanbieter-Cookies</strong> gesetzt. Wir verwenden keinen Google Analytics, Facebook Pixel oder vergleichbare Tracking-Dienste.</p>',
    '<h3>Rechtsgrundlage</h3>',
    '<p>Technisch notwendige Cookies werden auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse) gesetzt. Sie sind fuer den Betrieb der Website erforderlich und koennen nicht deaktiviert werden, ohne die Funktion der Anwendung einzuschraenken.</p>',
    '<h3>Cookies verwalten</h3>',
    '<p>Sie koennen Cookies jederzeit in Ihren Browsereinstellungen verwalten oder loeschen. Beachten Sie, dass das Loeschen des Sitzungs-Cookies eine erneute Anmeldung erfordert.</p>',
  ].join("\n"),
};
