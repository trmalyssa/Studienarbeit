"use strict";
// ==========================================================
// OCEAN BALANCE – Management-Planspiel zum Meeresschutz
// ==========================================================
// Aufbau der Datei
//   1. Spielregeln        alle Stellschrauben für das Balancing
//   2. Maßnahmen          reine Daten
//   3. Ereignisse         reine Daten
//   4. Förderprogramme    reine Daten
//   4b. Anhörung          Personen und ihre Anliegen
//   4c. Wissen            Infopunkte und Quizfragen
//   4d. Startbildschirm   Meeresfakten und Hintergrundbilder
//   5. Spielzustand
//   6. Simulationsmodell  reine Rechenfunktionen, ohne Anzeige
//   7. Anzeige
//   8. Seekarte (SVG)
//   9. Pop-ups
//  10. Spielablauf
//  11. Leaderboard
//  12. Start
//
// Grundidee des Modells
// - Strandmüll ist ein BESTAND. Er sinkt durch natürlichen Abtrag, durch
//   Aufräumen und durch maschinelle Reinigung und steigt jede Runde durch neuen
//   EINTRAG aus drei Quellen.
//   Bestand (neu) = Bestand − Reinigung − natürlicher Abtrag + Eintrag
// - Jede Kennzahl strebt auf einen RICHTWERT zu, der sich aus dem Zustand der
//   Region ergibt (z. B. Meeresgesundheit = 100 − Summe der Belastungen).
//   Pro Runde bewegt sie sich höchstens MAX_AENDERUNG Punkte. Dadurch wirken
//   Maßnahmen verzögert, aber nachvollziehbar.
// - Pro Runde trifft der Spieler DREI Entscheidungen, je eine pro Säule der
//   Nachhaltigkeit: Ökologie, Ökonomie und Soziales. Jede Säule kann er auch
//   zurückstellen. Die ökologischen Maßnahmen wechseln mit der Region im Fokus
//   (Strand → Meer → Land).
// - GELD IST KNAPP: Das Budget reicht nicht für alle Maßnahmen. Wer alles
//   kaufen will, scheitert; wer nichts tut, auch. Jede Runde heißt deshalb:
//   Was ist jetzt am wichtigsten, und was kann warten?
// - VIELE WEGE: Für jedes Problem gibt es mindestens zwei Lösungen mit
//   unterschiedlichen Nebenwirkungen (hart gegen sanft, Vorbeugen gegen
//   Aufräumen, Wachstum gegen grüne Wirtschaft). Es gibt keine Pflicht-Maßnahme.
// - GEGENSPIELER: Zu viele Gäste kosten Akzeptanz, mehr Gäste bringen mehr Müll,
//   Schutz kostet oft Wirtschaft, Wachstum belastet oft das Meer.
// - Wissen: Infopunkte auf der Karte (Runde 1 Pflicht, danach freiwillig),
//   Quiz am Rundenende und ein Abschlussquiz ergeben den Wissensscore.
// - Endergebnis = 80 % Nachhaltigkeitsscore + 20 % Wissensscore.

// ==========================================================
// 1. SPIELREGELN
// ==========================================================
const RUNDEN = 12;              // Spieldauer
const ZIEL_RUNDEN = 3;          // das Ziel muss in den letzten 3 Runden (10 bis 12) gleichzeitig erfüllt sein
                                // (alle Texte im Spiel leiten sich aus diesem Wert ab: siehe zielFenster())
const STARTBUDGET = 8000;
const GRUNDEINKOMMEN = 1200;    // fester Anteil pro Runde
const EINKOMMEN_FAKTOR = 0.9;   // Anteil aus Tourismus × Wirtschaft (je in %)
const KOSTEN_FAKTOR = 1.5;      // Preisniveau aller Maßnahmen (Knappheit des Budgets)

// Kennzahlen nähern sich ihrem Richtwert: pro Runde wird dieser Anteil der
// Lücke geschlossen, höchstens aber MAX_AENDERUNG Prozentpunkte.
const ANNAEHERUNG = 0.6;
const MAX_AENDERUNG = 5;
// Die Akzeptanz reagiert träger, Sofortwirkungen von Maßnahmen klingen langsam ab
const AKZEPTANZ_ANNAEHERUNG = 0.3;
const AKZEPTANZ_MAX_AENDERUNG = 4;
const AKZEPTANZ_SPERRE = 40;    // einschränkende Maßnahmen erst ab dieser Akzeptanz
// Gegenspieler des Tourismus: Ab dieser Gästezahl fühlen sich Einheimische
// überrannt. Jeder Punkt darüber senkt den Richtwert der Akzeptanz um UEBERLAUFEN.
const TOURISMUS_GRENZE = 72;
const UEBERLAUFEN = 0.5;

// Müll in Teilen pro 100 m Strand
const MUELL_START = 250;        // Ausgangslage, nahe am OSPAR-Median 2018–2020 (252)
const MUELL_SCHWELLE = 20;      // EU-Schwellenwert: unter 20 Teile = guter Umweltzustand
const MUELL_ABTRAG = 0.5;       // Anteil des Bestands, der pro Runde natürlich verschwindet (Wellen, Wind, Gezeiten)
// Neuer Müll pro Runde aus drei Quellen (ohne Maßnahmen). Der Strand-Anteil
// gilt bei Tourismus 60 %; zur Hälfte wächst er mit der Zahl der Gäste.
const EINTRAG_GRUND = { strand: 15, meer: 12.5, land: 15.5 };
const TOURISMUS_BEZUG = 60;

// Belastungen der Meeresgesundheit (Punkte, die vom Höchstwert 100 abgehen)
const DRUCK_START = { wasser: 7, fischerei: 6, klima: 3 };
// Gegenspieler der Ökologie: Wachstum belastet das Meer. Für jeden Punkt über diesen Grenzen
// kommt Belastung durch Abwasser, Schiffsverkehr und Küstenbebauung dazu.
const WACHSTUM_GRENZE = { tourismus: 60, wirtschaft: 58 };
const WACHSTUM_DRUCK = { tourismus: 0.15, wirtschaft: 0.15 };
// Müll belastet das Meer vor allem über den laufenden Eintrag, weniger über
// den Bestand am Strand. Deshalb hilft Aufräumen dem Meer nur wenig.
const MUELL_DRUCK = { eintrag: 22, bestand: 8 };
const EINTRAG_START = EINTRAG_GRUND.strand + EINTRAG_GRUND.meer + EINTRAG_GRUND.land;

const STARTWERTE = {
  meeresgesundheit: 52,
  artenvielfalt: 52,
  wirtschaft: 50,
  tourismus: 60,
  akzeptanz: 70
};

// Sonderereignisse (Sturmflut, Algenblüte …) sind vorerst ausgeschaltet, damit
// sich das Grundkonzept ungestört prüfen lässt. Zum Einschalten auf true setzen.
const EREIGNISSE_AKTIV = false;
// Zufallsereignisse: so viele, in diesen Runden. Level 1 bleibt ereignisfrei,
// in Level 3 bleibt Zeit, den guten Umweltzustand zu stabilisieren.
const EREIGNIS_RUNDEN = { von: 4, bis: 8, anzahl: 4 };

// kostenFaktor: Preisnachlass oder -aufschlag auf alle Maßnahmen in diesem Level.
// Level 1 ist eine Aufbauhilfe: Wer früh handelt, kommt günstiger weg.
// gewicht: So stark zählt der Rundenscore dieses Levels im Nachhaltigkeitsscore. In der Einarbeitung
// zählt er halb (Ausprobieren soll sich nicht rächen), in der Stabilisierung eineinhalbfach.
const LEVEL = [
  { nr: 1, name: "Einarbeitung",  von: 1,  bis: 3,  kostenFaktor: 0.8, gewicht: 0.5,
    text: "Finde heraus, wie deine Maßnahmen wirken. Aufbauhilfe: Alle Maßnahmen sind 20 % günstiger, und diese Runden zählen nur halb." },
  { nr: 2, name: "Bewährung",     von: 4,  bis: 9,  kostenFaktor: 1,   gewicht: 1,
    text: "Senke den Müll-Eintrag an allen drei Quellen. Die Aufbauhilfe ist ausgelaufen." },
  { nr: 3, name: "Stabilisieren", von: 10, bis: 12, kostenFaktor: 1,   gewicht: 1.5,
    text: "Zielprüfung: Halte den guten Umweltzustand bis zum Ende. Diese Runden zählen eineinhalbfach." }
];

// Drei Säulen der Nachhaltigkeit: pro Runde eine Entscheidung je Säule
const SAEULEN = [
  { id: "oeko",      name: "Ökologie", untertitel: "Meer und Artenvielfalt" },
  { id: "oekonomie", name: "Ökonomie", untertitel: "Tourismus und Wirtschaft" },
  { id: "sozial",    name: "Soziales", untertitel: "Akzeptanz der Bevölkerung" }
];
const ZURUECKSTELLEN = "zurueckstellen";   // Entscheidung: in dieser Säule nichts umsetzen
const ANGEBOT_PRO_SAEULE = 3;              // so viele Maßnahmen werden je Säule angeboten

// Reihenfolge der Regionen; jede Runde gelten die Ökologie-Maßnahmen für einen dieser Bereiche
const REGIONEN_FOLGE = ["strand", "meer", "land"];

// Darstellung der Bereiche: eigene Farbe und eigenes Symbol, damit sofort klar ist,
// für welchen Bereich die Ökologie-Maßnahmen dieser Runde gelten (Spaltenkopf und Karte)
const BEREICH_STIL = {
  strand: { farbe: "#A86A12", flaeche: "#FBF0DA" },
  meer:   { farbe: "#0F6E8C", flaeche: "#E1F1F6" },
  land:   { farbe: "#4E7A2A", flaeche: "#E8F1DF" }
};

// Otter: taucht in diesen Runden unten links im Meer auf und meldet kurz den Zwischenstand.
// Freiwillig, ohne Strafe. Ersetzt die frühere Sollkurs-Anzeige in der Seitenleiste.
const OTTER_RUNDEN = [3, 6, 9];
const OTTER_ORT = { x: 6.5, y: 94 };   // Fußpunkt der Figur in Prozent der Kartenbreite/-höhe


// Wissen: Anteil am Endergebnis
const WISSEN_ANTEIL = 0.2;        // Endergebnis = 80 % Nachhaltigkeit + 20 % Wissen

// Anhörung: Wer ein Anliegen schneller als nach MINDEST_LESEZEIT Sekunden wegklickt,
// hat es nur überflogen und verliert am Rundenende Akzeptanz.
const MINDEST_LESEZEIT = 2;       // Sekunden
const ANHOERUNG_STRAFE = 3;       // Akzeptanzpunkte

const BEREICHE = [
  { id: "strand", name: "Strand" },
  { id: "meer",   name: "Meer" },
  { id: "land",   name: "Land" }
];

// Die drei Quellen des Strandmülls
const QUELLEN = [
  { id: "strand", name: "Strandbesucher" },
  { id: "meer",   name: "Fischerei und Schifffahrt" },
  { id: "land",   name: "Flüsse und Hinterland" }
];

// Mindestwerte des „guten Umweltzustands“. Sie gelten in den letzten ZIEL_RUNDEN Runden gleichzeitig.
// Die Werte sind so gesetzt, dass mehrere unterschiedliche Wege das Ziel erreichen (geprüft mit
// tools/ziel-suche.js); höhere Werte machten es auf allen Wegen unerreichbar.
const GUTER_ZUSTAND = { meeresgesundheit: 75, artenvielfalt: 75, wirtschaft: 55, tourismus: 50, akzeptanz: 55 };
const AKZEPTANZ_MINDEST = GUTER_ZUSTAND.akzeptanz;

// Balken in der Seitenleiste (Akzeptanz steht im Kopfbalken)
const KENNZAHLEN = [
  { id: "meeresgesundheit", name: "Meeresgesundheit", mindest: GUTER_ZUSTAND.meeresgesundheit },
  { id: "artenvielfalt",    name: "Artenvielfalt",    mindest: GUTER_ZUSTAND.artenvielfalt },
  { id: "wirtschaft",       name: "Wirtschaft",       mindest: GUTER_ZUSTAND.wirtschaft },
  { id: "tourismus",        name: "Tourismus",        mindest: GUTER_ZUSTAND.tourismus }
];

// ---------- Bewertung: Kurs halten statt Rohwerte sammeln ----------
// Früher war der Score der Durchschnitt aller Rohwerte über alle 12 Runden. Dadurch war 100 Punkte
// rechnerisch unmöglich (Runde 1 liegt immer am Start) und „Nichts tun“ ergab schon 53 Punkte.
// Jetzt gilt: Jede Kennzahl hat in jeder Runde einen SOLLKURS (KURS). Maßnahmen wirken verzögert,
// deshalb steigt er anfangs flach. Wer auf oder über dem Kurs liegt, bekommt den Kursgrad 1;
// darunter sinkt der Kursgrad auf 0 (nach KURS_TOLERANZ Punkten).
const KURS_TOLERANZ = 8;
// Die drei Säulen bündeln die Kennzahlen (Anteile je Säule, Summe = 1)
const SAEULEN_KENNZAHLEN = {
  oeko:      { meeresgesundheit: 0.4, artenvielfalt: 0.3, strandmuell: 0.3 },
  oekonomie: { wirtschaft: 0.5, tourismus: 0.5 },
  sozial:    { akzeptanz: 1 }
};
// Rundenscore = (1 − SCHWAECHSTE) × Mittelwert der drei Säulen + SCHWAECHSTE × schwächste Säule.
// So lässt sich ein Defizit in einer Säule durch die anderen nur zur Hälfte ausgleichen
// („starke Nachhaltigkeit“: Natur, Wirtschaft und Gesellschaft sind nicht beliebig austauschbar).
const SAEULEN_SCHWAECHSTE = 0.6;

// Sollkurs als Stützpunkte [Runde, Sollwert]; dazwischen wird linear gerechnet, danach gilt der letzte Wert.
// Die Werte stammen aus dem Balancing-Test (tools/kurs-ableiten.js) und werden dort geprüft:
// Es muss mindestens ein Weg geben, der in allen 12 Runden auf Kurs liegt (= 100 Punkte).
const KURS = {
  meeresgesundheit: [[0, 52],[1, 53],[2, 55],[3, 57],[4, 60],[5, 64],[6, 68],[7, 70],[8, 72],[9, 74],[10, 75]],
  artenvielfalt:    [[0, 52],[2, 52],[3, 53],[4, 57],[5, 61],[6, 65],[7, 69],[8, 72],[9, 74],[10, 75]],
  strandmuell:      [[0, 250],[1, 175],[2, 135],[3, 105],[4, 85],[5, 60],[6, 48],[7, 42],[8, 36],[9, 26],[10, 19]],   // Teile pro 100 m: weniger ist besser
  wirtschaft:       [[0, 50],[3, 51],[6, 54],[9, 56]],
  tourismus:        [[0, 52]],
  akzeptanz:        [[0, 56]]
};

const KENNZAHL_NAMEN = {
  meeresgesundheit: "Meeresgesundheit",
  artenvielfalt:    "Artenvielfalt",
  strandmuell:      "Strandmüll",
  wirtschaft:       "Wirtschaft",
  tourismus:        "Tourismus",
  akzeptanz:        "Akzeptanz"
};

// Mindestbedingungen für den „guten Umweltzustand“.
// s = Momentaufnahme einer Runde (siehe momentaufnahme)
function mindestZiel(id, name, mindest) {
  return { id: id, text: name + " mind. " + mindest + " %",
    pruefen: function (s) { return s[id] >= mindest; },
    wert: function (s) { return s[id] + " %"; } };
}
const ZIELE = [
  mindestZiel("meeresgesundheit", "Meeresgesundheit", GUTER_ZUSTAND.meeresgesundheit),
  mindestZiel("artenvielfalt", "Artenvielfalt", GUTER_ZUSTAND.artenvielfalt),
  { id: "strandmuell", text: "Strandmüll unter " + MUELL_SCHWELLE + " Teile pro 100 m",
    pruefen: function (s) { return s.strandmuell < MUELL_SCHWELLE; },
    wert: function (s) { return s.strandmuell + " Teile"; } },
  mindestZiel("wirtschaft", "Wirtschaft", GUTER_ZUSTAND.wirtschaft),
  mindestZiel("tourismus", "Tourismus", GUTER_ZUSTAND.tourismus),
  mindestZiel("akzeptanz", "Akzeptanz", GUTER_ZUSTAND.akzeptanz),
  { id: "budget", text: "Budget nicht im Minus",
    pruefen: function (s) { return s.budget >= 0; },
    wert: function (s) { return euro(s.budget); } }
];

// Ampelfarben der Balken: grün = Mindestwert erreicht, gelb = knapp darunter, rot = weit entfernt
const AMPEL = { gruen: "#2E8B57", gelb: "#E2A92B", rot: "#C8382E" };
const AMPEL_ABSTAND = 20;   // bis so viele Punkte unter dem Mindestwert ist der Balken gelb

// ==========================================================
// 2. MASSNAHMEN (nur Daten)
// ==========================================================
// saeule          oeko | oekonomie | sozial
// bereich         nur Ökologie: Region im Fokus (strand | meer | land)
// kosten          einmalige Kosten (Basispreis, vor KOSTEN_FAKTOR und Level-Faktor)
// kostenAnstieg   bei wiederholbaren Maßnahmen: Aufschlag für jede weitere Umsetzung
// laufendeKosten  Kosten in jeder Runde ab der Umsetzung (Folgekosten)
// wiederholbar    darf mehrfach gewählt werden
// einschraenkend  schränkt Bürger oder Betriebe ein: nur ab AKZEPTANZ_SPERRE
// akzeptanz       sofortige Änderung der Akzeptanz
// reinigung       Anteil des Strandmülls, der sofort entfernt wird
// wirkungen       Liste verzögerter Wirkungen:
//                   ab     = Runden bis zum Wirkungsbeginn (0 = in dieser Runde)
//                   dauer  = Anzahl Runden (weglassen = dauerhaft)
//                   wirkung: eintragStrand/-Meer/-Land = Faktor (0.6 heißt −40 %)
//                            druckWasser/-Fischerei/-Klima = Belastung (+/− Punkte)
//                            tourismus/wirtschaft/artenvielfalt/akzeptanz
//                            = Verschiebung des Richtwerts (+/− Punkte)
//                            reinigung = Anteil des Strandmülls, der JEDE Runde entfernt wird
//                            einnahmen = zusätzliches Geld pro Runde (€)
//                   popup  = Meldung beim Wirkungsbeginn
// teaser          VOR der Entscheidung: nur anteasern, keine Zahlen
// erklaerung(r)   NACH der Entscheidung: Wirkungskette erklären (r = Runde)
const MASSNAHMEN = [
  // ================= ÖKOLOGIE: Strand =================
  {
    id: "schilder", saeule: "oeko", bereich: "strand",
    name: "Mülleimer und Hinweisschilder",
    beschreibung: "Entlang des Strandes werden Mülleimer mit Deckel und Hinweisschilder aufgestellt.",
    kosten: 2500,
    akzeptanz: 0,
    wirkungen: [{ ab: 2, wirkung: { eintragStrand: 0.6 } }],
    teaser: "Wer einen Mülleimer in der Nähe hat, lässt weniger liegen. Aber ändern Menschen ihr Verhalten sofort?",
    erklaerung: function (r) {
      return "Gewohnheiten ändern sich langsam: Ab Runde " + (r + 2) + " hinterlassen Strandbesucher " +
        "40 % weniger Müll, dann aber dauerhaft.";
    }
  },
  {
    id: "kontrollen", saeule: "oeko", bereich: "strand",
    name: "Strandkontrollen und Bußgelder",
    beschreibung: "Streifen des Ordnungsamts kontrollieren den Strand und verhängen Bußgelder fürs Liegenlassen von Müll.",
    kosten: 3000, laufendeKosten: 300, einschraenkend: true,
    akzeptanz: -8,
    wirkungen: [{ ab: 1, wirkung: { eintragStrand: 0.5, tourismus: -3, akzeptanz: -3 } }],
    teaser: "Strafen schrecken ab. Doch wie reagieren Einheimische und Gäste auf ständige Kontrollen?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " halbieren die Kontrollen den Müll von Strandbesuchern. Dafür kosten " +
        "die Streifen jede Runde 300 €, die Akzeptanz ist gesunken, und der Strand wirkt auf manche " +
        "Gäste weniger einladend. Der Ärger über die Kontrollen bleibt: Der Richtwert der Akzeptanz " +
        "liegt dauerhaft um 3 Punkte niedriger.";
    }
  },
  {
    id: "brutschutz", saeule: "oeko", bereich: "strand",
    name: "Brutzonen am Strand abzäunen",
    beschreibung: "Abschnitte des Strandes werden während der Brutzeit für Spaziergänger und Hunde gesperrt.",
    kosten: 2000, einschraenkend: true,
    akzeptanz: -3,
    wirkungen: [{ ab: 0, wirkung: { artenvielfalt: 6, tourismus: -2, akzeptanz: -2 } }],
    teaser: "Seltene Vögel brüten mitten im Sand. Wo legen sich dann die Gäste hin?",
    erklaerung: function () {
      return "Vögel wie der Sandregenpfeifer legen ihre Eier gut getarnt in eine Mulde im Sand. In den " +
        "abgezäunten Zonen brüten sie ungestört, die Artenvielfalt erholt sich schneller. Der Strand ist " +
        "dafür kleiner, einige Gäste und Hundebesitzer ärgern sich. Der Richtwert der Akzeptanz liegt " +
        "dauerhaft um 2 Punkte niedriger.";
    }
  },
  {
    id: "strandreinigung", saeule: "oeko", bereich: "strand",
    name: "Maschinelle Strandreinigung",
    beschreibung: "Eine Maschine siebt täglich den Sand und holt Müll heraus. Die Gemeinde zahlt Betrieb und Wartung.",
    kosten: 3000, laufendeKosten: 350,
    akzeptanz: 0,
    wirkungen: [{ ab: 1, wirkung: { reinigung: 0.6, artenvielfalt: -3, tourismus: 2 } }],
    teaser: "Der Strand sieht jeden Morgen frisch aus. Doch was holt so ein Sieb noch aus dem Sand?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " entfernt die Maschine jede Runde 60 % des Strandmülls, und gepflegte " +
        "Strände ziehen Gäste an. Sie siebt aber auch Tang und Treibsel ab. Davon leben Strandflöhe, " +
        "Würmer und damit die Vögel: Die Artenvielfalt sinkt dauerhaft. Am Müll-Eintrag ändert die " +
        "Maschine nichts, sie räumt nur hinter ihm her. Betrieb und Wartung kosten 350 € pro Runde.";
    }
  },

  // ================= ÖKOLOGIE: Meer =================
  {
    id: "netzrueckgabe", saeule: "oeko", bereich: "meer",
    name: "Netz-Rückgabestation im Hafen",
    beschreibung: "Fischer geben alte und beschädigte Netze im Hafen kostenlos ab. Die Netze werden recycelt.",
    kosten: 2500, laufendeKosten: 150,
    akzeptanz: 2,
    wirkungen: [{ ab: 1, wirkung: { eintragMeer: 0.4, druckFischerei: -3 } }],
    teaser: "Ein großer Teil des Meeresmülls stammt nicht vom Strand. Woher kommt er dann?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " gehen 60 % weniger Netze und Leinen über Bord. Das senkt den Eintrag " +
        "aus Fischerei und Schifffahrt und schützt Tiere vor Geisternetzen. Die Station kostet " +
        "150 € pro Runde.";
    }
  },
  {
    id: "geisternetze", saeule: "oeko", bereich: "meer",
    name: "Geisternetze bergen",
    beschreibung: "Taucher bergen verlorene Fischernetze von Wracks und vom Meeresboden.",
    kosten: 1800, kostenAnstieg: 300, wiederholbar: true,
    akzeptanz: 2,
    wirkungen: [{ ab: 0, dauer: 2, wirkung: { druckFischerei: -4 } }],
    teaser: "Geborgene Netze fangen keine Tiere mehr. Doch kommen neue nach?",
    erklaerung: function (r) {
      return "Die Bergung entlastet das Meer in Runde " + r + " und " + (r + 1) + ". Solange weiter Netze " +
        "verloren gehen, baut sich die Belastung danach wieder auf. Dauerhaft hilft nur, den Verlust " +
        "neuer Netze zu verhindern.";
    }
  },
  {
    id: "schutzgebiet", saeule: "oeko", bereich: "meer",
    name: "Meeresschutzgebiet ausweisen",
    beschreibung: "In einem Teil des Meeres werden Fischerei und Schiffsverkehr dauerhaft verboten.",
    kosten: 5000, einschraenkend: true,
    akzeptanz: -8,
    wirkungen: [
      { ab: 1, wirkung: { druckFischerei: -6, eintragMeer: 0.8, wirtschaft: -3, akzeptanz: -3 } },
      { ab: 1, wirkung: { artenvielfalt: 8 } }
    ],
    teaser: "Die Tierwelt bekommt einen Rückzugsort. Doch wer verzichtet auf Einnahmen, und wie schnell erholt sich die Natur?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " sinkt die Belastung durch Fischerei, und die Fischerei verliert " +
        "dauerhaft Einnahmen. Im Schutzgebiet können sich die Bestände erholen. Das braucht Zeit: Die " +
        "Artenvielfalt steigt Runde für Runde, höchstens 5 Punkte pro Runde. Als Ausgleich zahlt der " +
        "EU-Meeresschutzfonds jede Runde 700 €. Fischerei und Betriebe tragen die Auflagen nur " +
        "widerwillig: Der Richtwert der Akzeptanz liegt dauerhaft um 3 Punkte niedriger.";
    }
  },
  {
    id: "selektivfang", saeule: "oeko", bereich: "meer",
    name: "Schonende Fanggeräte fördern",
    beschreibung: "Der Staat bezahlt Fischern den Umbau auf Netze mit Fluchtfenstern für Jungfische und Meeressäuger.",
    kosten: 3200,
    akzeptanz: 2,
    wirkungen: [
      { ab: 1, wirkung: { druckFischerei: -4, wirtschaft: -1 } },
      { ab: 2, wirkung: { artenvielfalt: 3 } }
    ],
    teaser: "Jungfische und Schweinswale sollen aus dem Netz entkommen können. Reicht das, ohne dass Fanggebiete gesperrt werden?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " landen weniger Jungfische und Meeressäuger als Beifang im Netz, die " +
        "Belastung durch Fischerei sinkt. Die Fischer verdienen durch den Umbau etwas weniger. Ab Runde " +
        (r + 2) + " erholt sich die Artenvielfalt leicht. Das wirkt schwächer als ein Schutzgebiet, " +
        "kostet dafür aber keine Akzeptanz und keine Fangverbote.";
    }
  },
  {
    id: "hafenabfall", saeule: "oeko", bereich: "meer",
    name: "Abfallabgabe für Schiffe im Hafen",
    beschreibung: "Schiffe müssen ihren Müll im Hafen abgeben und dürfen ihn nicht mehr auf See entsorgen. Die Hafenkontrolle prüft die Abgabe.",
    kosten: 2800, laufendeKosten: 100,
    akzeptanz: 1,
    wirkungen: [{ ab: 1, wirkung: { eintragMeer: 0.45 } }],
    teaser: "Auf See sieht niemand zu, was über Bord geht. Was ändert sich, wenn die Abgabe im Hafen Pflicht wird?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " gelangen 55 % weniger Abfälle von Schiffen ins Meer, weil sie ihren Müll im Hafen " +
        "abgeben müssen. Das wirkt nur auf den Teil des Mülls, der von See kommt. Strandbesucher und Flüsse " +
        "bleiben davon unberührt. Die Hafenkontrolle kostet 100 € pro Runde.";
    }
  },
  {
    id: "forschung", saeule: "oeko", bereich: "meer",
    name: "Forschung zu Plastikmüll",
    beschreibung: "Die Region finanziert eine Studie zu Herkunft und Wegen des Plastikmülls.",
    kosten: 3000,
    akzeptanz: 2,
    wirkungen: [{
      ab: 3,
      wirkung: { eintragStrand: 0.85, eintragMeer: 0.85, eintragLand: 0.85, druckFischerei: -1 },
      popup: {
        titel: "Forschungsdurchbruch",
        text: "Die Studie zeigt, über welche Wege der meiste Müll an deine Küste gelangt. Ab jetzt " +
          "lassen sich alle Maßnahmen gezielter einsetzen: Der Eintrag aus allen drei Quellen sinkt um 15 %."
      }
    }],
    teaser: "Forschung kostet Geld und zeigt zunächst keinen sichtbaren Erfolg. Machen die Erkenntnisse später den Unterschied?",
    erklaerung: function (r) {
      return "Die Studie läuft drei Runden. Ab Runde " + (r + 3) + " können alle Maßnahmen gezielter " +
        "eingesetzt werden: Der Eintrag aus allen drei Quellen sinkt um 15 %.";
    }
  },

  // ================= ÖKOLOGIE: Land =================
  {
    id: "pfand", saeule: "oeko", bereich: "land",
    name: "Pfand auf Einwegverpackungen",
    beschreibung: "Auf Flaschen und Dosen wird ein Pfand erhoben. Händler stellen Rücknahmeautomaten auf.",
    kosten: 4000, einschraenkend: true,
    akzeptanz: -4,
    wirkungen: [
      { ab: 1, dauer: 2, wirkung: { wirtschaft: -3, akzeptanz: -2 } },
      { ab: 2, wirkung: { eintragStrand: 0.5, eintragLand: 0.5 } }
    ],
    teaser: "Was etwas wert ist, wirft man seltener weg. Doch was sagen Handel und Kundschaft dazu?",
    erklaerung: function (r) {
      return "Der Handel investiert zuerst in Rücknahmeautomaten, das bremst die Wirtschaft zwei Runden " +
        "lang. Ab Runde " + (r + 2) + " sinkt der Müll von Strandbesuchern und aus dem Hinterland " +
        "jeweils um die Hälfte, weil Flaschen und Dosen zurückgebracht werden. Während der Umstellung " +
        "ärgern sich Handel und Kundschaft, die Akzeptanz sinkt zwei Runden lang.";
    }
  },
  {
    id: "muellfaenger", saeule: "oeko", bereich: "land",
    name: "Müllfänger an den Flussmündungen",
    beschreibung: "Schwimmende Barrieren fangen Müll in den Flüssen ab, bevor er das Meer erreicht.",
    kosten: 3500, laufendeKosten: 200,
    akzeptanz: 1,
    wirkungen: [{ ab: 1, wirkung: { eintragLand: 0.35 } }],
    teaser: "Viel Müll reist aus dem Binnenland an. Lässt er sich unterwegs aufhalten?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " halten die Barrieren 65 % des Mülls aus Flüssen und Hinterland " +
        "zurück. Sie müssen regelmäßig geleert werden, das kostet 200 € pro Runde.";
    }
  },
  {
    id: "abwasser", saeule: "oeko", bereich: "land",
    name: "Abwasser-Einleitverbot",
    beschreibung: "Betriebe dürfen kein ungeklärtes Abwasser mehr ins Meer leiten und müssen Kläranlagen nachrüsten.",
    kosten: 5000, einschraenkend: true,
    akzeptanz: -6,
    wirkungen: [
      { ab: 1, wirkung: { druckWasser: -8, eintragLand: 0.8 } },
      { ab: 1, dauer: 3, wirkung: { wirtschaft: -6, akzeptanz: -3 } },
      { ab: 4, wirkung: { wirtschaft: 2 } }
    ],
    teaser: "Sauberes Wasser kostet die Industrie neue Anlagen. Wie verkraftet die Wirtschaft das, und wer profitiert?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " gelangen deutlich weniger Nähr- und Schadstoffe ins Meer, eine der " +
        "größten Belastungen der Meeresgesundheit. Die Nachrüstung bremst die Wirtschaft drei Runden " +
        "lang und kostet Rückhalt bei den betroffenen Betrieben. Ab Runde " + (r + 4) +
        " profitieren die modernisierten Betriebe leicht.";
    }
  },
  {
    id: "aue", saeule: "oeko", bereich: "land",
    name: "Flussaue renaturieren",
    beschreibung: "Der begradigte Fluss bekommt Seitenarme und Auwiesen zurück. Die Landwirte erhalten Ausgleichsflächen.",
    kosten: 3800,
    akzeptanz: 2,
    wirkungen: [{ ab: 3, wirkung: { druckWasser: -5, eintragLand: 0.85, artenvielfalt: 3 } }],
    teaser: "Ein Fluss mit Auwiesen reinigt sich fast von selbst. Aber wie lange dauert es, bis Pflanzen und Tiere zurückkehren?",
    erklaerung: function (r) {
      return "Bagger legen Flussarme frei, Auwiesen entstehen. Bis die Vegetation steht, vergehen Jahre. Ab Runde " +
        (r + 3) + " halten die Auen Nährstoffe zurück (Abwasserbelastung sinkt), fangen 15 % des Mülls aus dem " +
        "Hinterland ab und bieten Tieren Lebensraum. Gegen starke Einleitungen reicht das allein nicht.";
    }
  },
  {
    id: "co2", saeule: "oeko", bereich: "land",
    name: "CO2-Gesetz für die Industrie",
    beschreibung: "Die Industrie der Region muss ihren CO2-Ausstoß gesetzlich senken.",
    kosten: 4000, einschraenkend: true,
    akzeptanz: -6,
    wirkungen: [
      { ab: 1, dauer: 3, wirkung: { wirtschaft: -6, akzeptanz: -3 } },
      { ab: 3, wirkung: { druckKlima: -5 } },
      { ab: 4, wirkung: { wirtschaft: 4 } }
    ],
    teaser: "Klimaschutz gilt als Aufgabe für die ganze Welt. Kann eine Region damit ihr eigenes Meer schützen?",
    erklaerung: function (r) {
      return "Die Umstellung belastet die Betriebe drei Runden lang. Ab Runde " + (r + 3) + " sinkt im " +
        "Spiel die Belastung durch Erwärmung und Versauerung, ab Runde " + (r + 4) + " zahlen sich die " +
        "neuen Technologien für die Wirtschaft aus. Die Umstellung kostet drei Runden lang Rückhalt. " +
        "Eine Region allein kann das Klima nicht retten; die Maßnahme steht für ihren Beitrag.";
    }
  },

  // ================= ÖKONOMIE: Tourismus und Wirtschaft =================
  {
    id: "kreuzfahrt", saeule: "oekonomie",
    name: "Kreuzfahrtanleger ausbauen",
    beschreibung: "Der Hafen bekommt einen Anleger, an dem große Kreuzfahrtschiffe festmachen können.",
    kosten: 3500,
    akzeptanz: -2,
    wirkungen: [{ ab: 1, wirkung: { tourismus: 8, wirtschaft: 4, eintragMeer: 1.3, druckWasser: 3 } }],
    teaser: "Tausende Gäste an einem Tag bringen Geld in die Stadt. Was bringen die Schiffe sonst noch mit?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " legen Kreuzfahrtschiffe an. Tourismus und Wirtschaft wachsen spürbar, " +
        "deine Einnahmen steigen. Die Schiffe hinterlassen aber Abwasser und Abfall: Der Eintrag aus " +
        "Schifffahrt steigt um 30 %, und das Wasser wird stärker belastet. Viele Anwohner stört der Andrang.";
    }
  },
  {
    id: "quoten", saeule: "oekonomie",
    name: "Fangquoten anheben",
    beschreibung: "Die Region beantragt höhere Fangmengen für die heimische Fischerei.",
    kosten: 500,
    akzeptanz: 4,
    wirkungen: [{ ab: 0, wirkung: { wirtschaft: 5, druckFischerei: 5 } }],
    teaser: "Mehr Fang, mehr Einnahmen, kaum Kosten. Wie viele Fische bleiben für morgen?",
    erklaerung: function () {
      return "Die Fischer freuen sich, die Wirtschaft wächst sofort. Dafür werden dauerhaft mehr Fische " +
        "gefangen, als nachwachsen können. Die Belastung durch Fischerei steigt, und mit der " +
        "Meeresgesundheit sinkt später auch die Artenvielfalt.";
    }
  },
  {
    id: "gewerbe", saeule: "oekonomie",
    name: "Gewerbegebiet erweitern",
    beschreibung: "Am Ortsrand entsteht Platz für neue Betriebe aus Handwerk, Logistik und Lebensmittelverarbeitung.",
    kosten: 3000,
    akzeptanz: 2,
    wirkungen: [{ ab: 1, wirkung: { wirtschaft: 7, eintragLand: 1.25, druckWasser: 2 } }],
    teaser: "Neue Betriebe bedeuten neue Arbeitsplätze. Wohin fließen ihr Abwasser und ihr Abfall?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " arbeiten neue Betriebe in der Region, die Wirtschaft wächst dauerhaft. " +
        "Mit ihnen gelangt mehr Abfall über die Flüsse an die Küste (+25 %), und das Wasser wird etwas " +
        "stärker belastet. Was andere Maßnahmen an Land erreichen, wird teilweise wieder aufgezehrt.";
    }
  },
  {
    id: "oekotourismus", saeule: "oekonomie",
    name: "Siegel für sanften Tourismus",
    beschreibung: "Gastgeber, die Müll vermeiden, regional einkaufen und Gäste über das Watt informieren, erhalten ein Umweltsiegel.",
    kosten: 2500,
    akzeptanz: 1,
    wirkungen: [
      { ab: 1, dauer: 2, wirkung: { tourismus: -4 } },
      { ab: 3, wirkung: { tourismus: 7, eintragStrand: 0.85 } }
    ],
    teaser: "Ein Umweltsiegel kostet die Gastgeber erst einmal Mühe. Zieht es später Gäste an, die bewusster reisen?",
    erklaerung: function (r) {
      return "Zwei Runden lang stellen die Betriebe um, einige Angebote fallen weg. Ab Runde " + (r + 3) +
        " zieht das Siegel dauerhaft Gäste an, die weniger Müll hinterlassen (−15 % Müll von Strandbesuchern).";
    }
  },
  {
    id: "windpark", saeule: "oekonomie",
    name: "Offshore-Windpark genehmigen",
    beschreibung: "Vor der Küste entsteht ein Windpark. Der Hafen wird zum Stützpunkt für Bau und Wartung.",
    kosten: 4500,
    akzeptanz: -3,
    wirkungen: [
      { ab: 0, dauer: 2, wirkung: { artenvielfalt: -4 } },
      { ab: 2, wirkung: { wirtschaft: 6, druckKlima: -2 } }
    ],
    teaser: "Saubere Energie und neue Jobs im Hafen. Doch was hören Schweinswale während des Baus?",
    erklaerung: function (r) {
      return "Beim Rammen der Fundamente entsteht unter Wasser starker Lärm. Schweinswale meiden das Gebiet, " +
        "zwei Runden lang leidet die Artenvielfalt. Ab Runde " + (r + 2) + " schafft der Windpark dauerhaft " +
        "Arbeitsplätze in Hafen und Wartung und senkt den Beitrag der Region zur Erwärmung.";
    }
  },
  {
    id: "fischmarkt", saeule: "oekonomie",
    name: "Regionale Fischvermarktung",
    beschreibung: "Fischer verkaufen ihren Fang direkt an Restaurants und auf einem Markt im Hafen, zu besseren Preisen.",
    kosten: 2000,
    akzeptanz: 2,
    wirkungen: [{ ab: 1, wirkung: { wirtschaft: 3, druckFischerei: -2 } }],
    teaser: "Wer seinen Fisch direkt und teurer verkauft, muss vielleicht weniger fangen. Kaufen die Kunden mit?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " verdienen die Fischer pro Kilo mehr. Die Wirtschaft wächst leicht, und " +
        "weil sich kleinere Fänge lohnen, sinkt die Belastung durch Fischerei etwas.";
    }
  },
  {
    id: "hotels", saeule: "oekonomie",
    name: "Umweltauflagen für Hotels",
    beschreibung: "Hotels müssen Mehrweggeschirr anbieten, Abfall trennen und ihr Abwasser besser klären.",
    kosten: 2000, einschraenkend: true,
    akzeptanz: -3,
    wirkungen: [
      { ab: 1, wirkung: { eintragStrand: 0.8, eintragLand: 0.9, druckWasser: -2 } },
      { ab: 1, dauer: 2, wirkung: { tourismus: -12, akzeptanz: -2 } },
      { ab: 3, wirkung: { tourismus: 5 } }
    ],
    teaser: "Für die Hotels wird es erst einmal teuer. Wie reagieren die Gäste, und lohnt sich ein grünes Image?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " fallen weniger Abfall und Abwasser an. Zwei Runden lang bremsen " +
        "höhere Preise den Tourismus, und die Einheimischen murren. Ab Runde " + (r + 3) +
        " zieht das grüne Image dauerhaft zusätzliche Gäste an.";
    }
  },
  {
    id: "werbung", saeule: "oekonomie",
    name: "Werbekampagne für die Küste",
    beschreibung: "Plakate, Online-Anzeigen und Reiseblogs werben für Urlaub in der Region.",
    kosten: 1500, kostenAnstieg: 500, wiederholbar: true,
    akzeptanz: 0,
    wirkungen: [{ ab: 0, dauer: 2, wirkung: { tourismus: 7 } }],
    teaser: "Mehr Gäste füllen die Kassen. Und den Strand?",
    erklaerung: function (r) {
      return "In Runde " + r + " und " + (r + 1) + " kommen mehr Gäste. Das bringt Einnahmen, aber mehr " +
        "Gäste hinterlassen auch mehr Müll am Strand, und wenn es zu viele werden, fühlen sich die " +
        "Einheimischen überrannt. Danach lässt der Effekt nach. Jede weitere Kampagne kostet 500 € mehr.";
    }
  },
  {
    id: "kurtaxe", saeule: "oekonomie",
    name: "Kurtaxe für Gäste",
    beschreibung: "Übernachtungsgäste zahlen eine Abgabe, die direkt in die Gemeindekasse fließt.",
    kosten: 1200, einschraenkend: true,
    akzeptanz: -5,
    wirkungen: [{ ab: 1, wirkung: { tourismus: -3, einnahmen: 500, akzeptanz: -3 } }],
    teaser: "Wer die Küste nutzt, könnte sie auch mitbezahlen. Doch wie viel Abgabe nehmen Gäste und Einheimische hin?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 1) + " fließen jede Runde zusätzlich 500 € in deine Kasse. Dafür buchen etwas " +
        "weniger Gäste, und viele Betriebe und Anwohner lehnen die Abgabe ab. Das Verursacherprinzip bringt " +
        "Geld für den Meeresschutz, kostet aber dauerhaft Rückhalt: Der Richtwert der Akzeptanz " +
        "liegt um 3 Punkte niedriger.";
    }
  },

  // ================= SOZIALES: Akzeptanz =================
  {
    id: "aufraeumen", saeule: "sozial",
    name: "Freiwillige Strand-Aufräumaktion",
    beschreibung: "Freiwillige und Gemeinde sammeln an einem Aktionstag den Müll am Strand ein.",
    kosten: 1200, kostenAnstieg: 300, wiederholbar: true,
    akzeptanz: 2, reinigung: 0.9,
    wirkungen: [],
    teaser: "Nach einem Tag ist der Strand sauber. Aber wie lange bleibt er es?",
    erklaerung: function () {
      return "Die Aktion hat rund 90 % des Mülls vom Strand entfernt. Am Eintrag ändert sie nichts: " +
        "Strandbesucher, Fischerei und Flüsse bringen jede Runde neuen Müll. Ohne Maßnahmen an den " +
        "Quellen steigt der Bestand deshalb wieder an. Freiwillige lassen sich nicht beliebig oft " +
        "mobilisieren: Jede weitere Aktion kostet 300 € mehr.";
    }
  },
  {
    id: "buergerdialog", saeule: "sozial",
    name: "Bürgerdialog und Infokampagne",
    beschreibung: "Infoabende, Strandführungen und eine Kampagne erklären, warum Schutzmaßnahmen nötig sind.",
    kosten: 1000, kostenAnstieg: 500, wiederholbar: true,
    akzeptanz: 10,
    wirkungen: [],
    teaser: "Menschen tragen Entscheidungen eher mit, wenn sie sie verstehen. Hält dieser Effekt an?",
    erklaerung: function () {
      return "Die Akzeptanz ist sofort um 10 Punkte gestiegen. Ohne sichtbare Erfolge wie saubere Strände " +
        "und eine stabile Wirtschaft sinkt sie in den nächsten Runden wieder. Jede weitere Kampagne " +
        "kostet 500 € mehr, weil neue Formate nötig sind.";
    }
  },
  {
    id: "umweltbildung", saeule: "sozial",
    name: "Umweltbildung an Schulen",
    beschreibung: "Schulen nehmen Meeresschutz in den Unterricht auf, mit Strandprojekten und Exkursionen.",
    kosten: 2000,
    akzeptanz: 3,
    wirkungen: [
      { ab: 2, wirkung: { akzeptanz: 5 } },
      { ab: 3, wirkung: { eintragStrand: 0.75 } }
    ],
    teaser: "Wer früh lernt, handelt später anders. Aber wie lange dauert es, bis man das am Strand sieht?",
    erklaerung: function (r) {
      return "Ab Runde " + (r + 2) + " steigt die Akzeptanz dauerhaft etwas, weil Familien das Thema mit " +
        "nach Hause nehmen. Ab Runde " + (r + 3) + " hinterlassen Strandbesucher 25 % weniger Müll.";
    }
  },
  {
    id: "runderTisch", saeule: "sozial",
    name: "Runder Tisch mit Fischerei und Betrieben",
    beschreibung: "Fischer, Hotels, Betriebe und Naturschutz beraten gemeinsam über die nächsten Schritte.",
    kosten: 1500, kostenAnstieg: 500, wiederholbar: true,
    akzeptanz: 5,
    wirkungen: [{ ab: 1, dauer: 3, wirkung: { akzeptanz: 4 } }],
    teaser: "Wer mitreden darf, trägt Entscheidungen eher mit. Aber ersetzt Reden das Handeln?",
    erklaerung: function (r) {
      return "Die Akzeptanz steigt sofort um 5 Punkte, und von Runde " + (r + 1) + " bis " + (r + 3) +
        " tragen die Beteiligten deine Entscheidungen eher mit. Am Müll und am Meer ändert der Runde " +
        "Tisch selbst nichts. Jedes weitere Treffen kostet 500 € mehr.";
    }
  },
  {
    id: "umstiegshilfe", saeule: "sozial",
    name: "Umstiegshilfe für betroffene Betriebe",
    beschreibung: "Betriebe, die von Auflagen getroffen werden, bekommen Beratung und Übergangshilfen für neue Geschäftsmodelle.",
    kosten: 3000,
    akzeptanz: 3,
    wirkungen: [{ ab: 1, dauer: 4, wirkung: { wirtschaft: 4, akzeptanz: 2 } }],
    teaser: "Strenge Auflagen treffen vor allem die, die vom Meer leben. Was bekommen sie, wenn sie mitziehen sollen?",
    erklaerung: function (r) {
      return "Von Runde " + (r + 1) + " bis " + (r + 4) + " federt die Hilfe wirtschaftliche Härten ab: Der " +
        "Richtwert der Wirtschaft steigt um 4 Punkte, der der Akzeptanz um 2. Einen Dauereffekt gibt es " +
        "nicht, danach müssen die Betriebe tragfähig sein. Ein gerechter Übergang gehört zur Nachhaltigkeit: " +
        "Wer die Last trägt, soll nicht allein gelassen werden.";
    }
  },
  {
    id: "fischerkooperation", saeule: "sozial",
    name: "Kooperation mit der Küstenfischerei",
    beschreibung: "Fischer, Forschung und Naturschutz erfassen gemeinsam Fangdaten und vereinbaren freiwillige Schonzeiten.",
    kosten: 2500,
    akzeptanz: 4,
    wirkungen: [{ ab: 1, wirkung: { druckFischerei: -2, wirtschaft: 1 } }],
    teaser: "Fischer kennen das Meer am besten. Was passiert, wenn sie mitentscheiden dürfen, statt nur Auflagen zu bekommen?",
    erklaerung: function (r) {
      return "Die Akzeptanz steigt sofort um 4 Punkte. Ab Runde " + (r + 1) + " sinkt die Belastung durch " +
        "Fischerei dauerhaft etwas, weil sich die Beteiligten an Absprachen halten, die sie selbst " +
        "mitgestaltet haben. Beteiligung ersetzt keine Schutzgebiete, macht sie aber leichter durchsetzbar.";
    }
  }
];

// Klartext für die Bausteine einer Wirkung (für Berichte)
const WIRKUNG_TEXTE = {
  eintragStrand:  "Müll von Strandbesuchern",
  eintragMeer:    "Müll aus Fischerei und Schifffahrt",
  eintragLand:    "Müll aus Flüssen und Hinterland",
  druckWasser:    "Belastung durch Abwasser",
  druckFischerei: "Belastung durch Fischerei",
  druckKlima:     "Belastung durch Erwärmung",
  tourismus:      "Richtwert Tourismus",
  wirtschaft:     "Richtwert Wirtschaft",
  artenvielfalt:  "Richtwert Artenvielfalt",
  akzeptanz:      "Richtwert Akzeptanz",
  reinigung:      "Strandreinigung pro Runde",
  einnahmen:      "Zusatzeinnahmen pro Runde"
};

// ==========================================================
// 3. EREIGNISSE (nur Daten)
// ==========================================================
// ausloesen(z) liefert, was passiert:
//   text, strandmuell (+Teile), akzeptanz (+/−), budget (+/−),
//   wirkungen: [{ dauer, wirkung }] ab der aktuellen Runde,
//   foerderaufruf: { massnahme, bisRunde, betrag }
const EREIGNISSE = [
  {
    id: "sturmflut", titel: "Sturmflut",
    ausloesen: function () {
      return {
        text: "Ein schwerer Herbststurm drückt das Wasser weit auf den Strand. Die Wellen spülen " +
          "60 Müllteile pro 100 m aus dem Meer an.",
        strandmuell: 60
      };
    }
  },
  {
    id: "algenbluete", titel: "Hitzewelle und Algenblüte",
    ausloesen: function (z) {
      const vorgesorgt = istUmgesetzt(z, "abwasser");
      return {
        text: vorgesorgt
          ? "Eine Hitzewelle erwärmt das Küstenwasser. Weil kaum noch Abwasser eingeleitet wird, " +
            "fehlen den Algen die Nährstoffe. Die Blüte bleibt schwach."
          : "Eine Hitzewelle erwärmt das Küstenwasser. Nährstoffe aus Abwässern lassen Algen " +
            "massenhaft wachsen, Badestellen werden gesperrt.",
        wirkungen: [
          { dauer: 2, wirkung: { druckKlima: 5, druckWasser: vorgesorgt ? 1 : 8 } },
          { dauer: 1, wirkung: { tourismus: vorgesorgt ? -2 : -8 } }
        ]
      };
    }
  },
  {
    id: "havarie", titel: "Frachter verliert Container",
    ausloesen: function () {
      return {
        text: "Bei schwerer See verliert ein Frachter vor der Küste mehrere Container. Verpackungen und " +
          "Kunststoffgranulat treiben an (+40 Teile pro 100 m). Viele Menschen fordern jetzt mehr Meeresschutz.",
        strandmuell: 40,
        akzeptanz: 6,
        wirkungen: [{ dauer: 2, wirkung: { druckWasser: 4 } }]
      };
    }
  },
  {
    id: "reisebericht", titel: "Reisebericht im Fernsehen",
    ausloesen: function (z) {
      if (z.strandmuell < 80) {
        return {
          text: "Ein Reisemagazin zeigt deine sauberen Strände. Die Buchungen steigen, und mit den " +
            "zusätzlichen Gästen kommt auch zusätzlicher Müll.",
          wirkungen: [{ dauer: 2, wirkung: { tourismus: 10 } }]
        };
      }
      return {
        text: "Ein Reisemagazin zeigt Bilder vom vermüllten Strand. Viele Gäste buchen um.",
        wirkungen: [{ dauer: 2, wirkung: { tourismus: -10 } }]
      };
    }
  },
  {
    id: "krise", titel: "Konjunktureinbruch",
    ausloesen: function () {
      return {
        text: "Die Nachfrage nach Produkten aus der Region bricht ein. Betriebe melden Kurzarbeit, " +
          "und die Stimmung gegenüber neuen Auflagen kippt.",
        akzeptanz: -6,
        wirkungen: [{ dauer: 2, wirkung: { wirtschaft: -6 } }]
      };
    }
  },
  {
    id: "foerderaufruf", titel: "EU-Förderaufruf",
    ausloesen: function (z) {
      // Fördert die erste Maßnahme gegen Müll-Eintrag, die noch fehlt
      const kandidaten = ["muellfaenger", "netzrueckgabe", "pfand", "abwasser"];
      const offen = kandidaten.filter(function (id) { return !istUmgesetzt(z, id); });
      if (offen.length === 0) {
        return {
          text: "Die EU zeichnet deine Region als Vorbild im Kampf gegen Meeresmüll aus. Du erhältst " +
            "eine Prämie von 2.000 €.",
          budget: 2000
        };
      }
      const m = massnahmeFinden(offen[0]);
      const bis = Math.min(RUNDEN, z.runde + 2);
      return {
        text: "Die EU fördert Maßnahmen gegen Meeresmüll: Setzt du bis Ende von Runde " + bis +
          " die Maßnahme „" + m.name + "“ um, erhältst du einmalig 2.500 €.",
        foerderaufruf: { massnahme: m.id, bisRunde: bis, betrag: 2500 }
      };
    }
  }
];

// ==========================================================
// 4. FÖRDERPROGRAMME (nur Daten)
// ==========================================================
// Fördermittel gibt es nicht automatisch für gute Werte, sondern nur unter
// konkreten Bedingungen. Sie werden in jeder Runde gezahlt, in der die
// Bedingung erfüllt ist (geprüft mit den Werten am Rundenende).
const FOERDERPROGRAMME = [
  {
    id: "meeresschutzfonds", name: "EU-Meeresschutzfonds", betrag: 700,
    bedingung: "Meeresschutzgebiet ist ausgewiesen.",
    pruefen: function (z) { return istUmgesetzt(z, "schutzgebiet"); }
  },
  {
    id: "sauberekueste", name: "Landesprogramm Saubere Küste", betrag: 400,
    bedingung: "Strandmüll unter 60 Teilen pro 100 m.",
    pruefen: function (z) { return z.strandmuell < 60; }
  },
  {
    id: "artenpraemie", name: "Bundesprogramm Biologische Vielfalt", betrag: 500,
    bedingung: "Artenvielfalt mindestens 70 %.",
    pruefen: function (z) { return z.kennzahlen.artenvielfalt >= 70; }
  },
  {
    id: "blauewirtschaft", name: "EU-Programm Blaue Wirtschaft", betrag: 600,
    bedingung: "Wirtschaft mindestens 55 % und Meeresgesundheit mindestens 65 %.",
    pruefen: function (z) { return z.kennzahlen.wirtschaft >= 55 && z.kennzahlen.meeresgesundheit >= 65; }
  }
];

// ==========================================================
// 4b. ANHÖRUNG: PERSONEN UND IHRE ANLIEGEN (nur Daten)
// ==========================================================
// Jede Region hat eine Person. x/y = Standort auf der Seekarte in Prozent
// (Füße der Figur). Aus den Aussagen wird jede Runde die wichtigste gewählt,
// deren Bedingung zutrifft und die noch nicht gesagt wurde.
// wenn(z, w): z = Spielzustand, w = aktive Wirkungen der Runde
const PERSONEN = {
  strand: { name: "Merle", rolle: "betreibt den Strandkiosk", x: 70.3, y: 37, farbe: "#E2A92B", kleidung: "kiosk" },
  meer:   { name: "Jannik", rolle: "Kutterfischer im Hafen", x: 92.6, y: 56.5, farbe: "#1D4F8C", kleidung: "fischer" },
  land:   { name: "Ole", rolle: "Schichtleiter im Gewerbegebiet", x: 74.5, y: 28.5, farbe: "#5E7D4E", kleidung: "arbeiter" }
};

// true, wenn die Maßnahme in den letzten n Runden umgesetzt wurde
function kuerzlich(z, id, n) {
  if (!istUmgesetzt(z, id)) return false;
  const liste = z.umgesetzt[id];
  return z.runde - liste[liste.length - 1] <= n;
}

function belastungFischerei(w) {
  return DRUCK_START.fischerei + w.druckFischerei;
}

function belastungAbwasser(w) {
  return DRUCK_START.wasser + w.druckWasser;
}

const AUSSAGEN = {
  strand: [
    { id: "akzeptanz", prio: 9, wenn: function (z) { return z.akzeptanz < 45; },
      text: "Viele hier haben das Gefühl, dass über ihre Köpfe hinweg entschieden wird. Wenn du erklärst, " +
        "warum die Maßnahmen nötig sind, ziehen die Leute eher mit." },
    { id: "ueberlaufen", prio: 8.5, wenn: function (z) { return z.kennzahlen.tourismus > TOURISMUS_GRENZE; },
      text: "In der Hochsaison ist der Strand so voll, dass die Einheimischen ihn meiden. Mein Kiosk läuft, " +
        "aber im Ort wächst der Ärger über Lärm, Verkehr und liegengebliebenen Müll. Mehr Gäste sind nicht " +
        "automatisch besser." },
    { id: "gaeste", prio: 8, wenn: function (z) { return z.kennzahlen.tourismus < 50; },
      text: "Die Buchungen gehen zurück. Gäste wollen einen sauberen Strand und klares Wasser. Ohne Gäste " +
        "muss ich meinen Kiosk bald schließen." },
    { id: "kreuzfahrt", prio: 7.5, wenn: function (z) { return kuerzlich(z, "kreuzfahrt", 2); },
      text: "Wenn ein Kreuzfahrtschiff anlegt, ist mein Kiosk leer gekauft. Aber danach liegt der Strand " +
        "voller Becher, und die Stammgäste beschweren sich über den Trubel." },
    { id: "kontrollen", prio: 7, wenn: function (z) { return kuerzlich(z, "kontrollen", 2); },
      text: "Seit die Streifen kontrollieren, fühlen sich manche Gäste beobachtet. Es liegt weniger Müll " +
        "herum, aber ich hoffe, die Gäste kommen trotzdem wieder." },
    { id: "kurtaxe", prio: 7, wenn: function (z) { return kuerzlich(z, "kurtaxe", 2); },
      text: "An der Kasse im Hotel schimpfen die Gäste über die neue Abgabe. Die Gemeinde hat jetzt Geld " +
        "für den Strand, aber ein paar Stammgäste haben schon angekündigt, nächstes Jahr woanders zu buchen." },
    { id: "hotels", prio: 7, wenn: function (z) { return kuerzlich(z, "hotels", 2); },
      text: "Die Hotels stöhnen über die neuen Auflagen und haben die Preise erhöht. Ich hoffe, das grüne " +
        "Image lockt bald neue Gäste an." },
    { id: "maschine", prio: 6.8, wenn: function (z) { return kuerzlich(z, "strandreinigung", 2); },
      text: "Morgens zieht die Maschine ihre Bahnen, und der Strand glänzt. Aber der Tang am Spülsaum ist " +
        "verschwunden, und mit ihm die Vögel, die dort immer nach Futter gesucht haben." },
    { id: "brut", prio: 6.5, wenn: function (z) { return kuerzlich(z, "brutschutz", 2); },
      text: "Ein Teil des Strandes ist jetzt abgesperrt. Manche Gäste schimpfen, andere bleiben stehen und " +
        "beobachten die Vögel. Ich verkaufe sogar Ferngläser." },
    { id: "nachschub", prio: 6, wenn: function (z) { return kuerzlich(z, "aufraeumen", 2) && z.eintrag.gesamt > 25; },
      text: "Nach der Aufräumaktion war der Strand wunderschön. Aber jede Woche wird neuer Müll angespült. " +
        "Woher kommt das eigentlich alles?" },
    { id: "liegenlassen", prio: 5, wenn: function (z, w) { return w.eintragStrand > 0.9 && z.strandmuell > 80; },
      text: "Jeden Morgen sammle ich Flaschen und Verpackungen vor meinem Kiosk auf. Viele Gäste lassen " +
        "ihren Müll einfach liegen, und Mülleimer gibt es kaum." },
    { id: "aufklaerung", prio: 4, wenn: function (z) { return !istUmgesetzt(z, "umweltbildung"); },
      text: "Viele Gäste wissen gar nicht, wie lange eine Plastikflasche im Meer bleibt. Vielleicht hilft " +
        "Aufklärung auf Dauer mehr als jeder Strafzettel." },
    { id: "sauber", prio: 3, wenn: function (z) { return z.strandmuell < 60; },
      text: "So sauber war der Strand seit Jahren nicht. Jetzt dürfen wir nicht nachlassen, sonst sieht es " +
        "in zwei Saisons wieder aus wie früher." },
    { id: "standard", prio: 0, wenn: function () { return true; },
      text: "Der Strand ist unser Aushängeschild. Was hier liegen bleibt, sehen die Gäste zuerst, und was " +
        "ins Meer gelangt, kommt irgendwann zurück." }
  ],
  meer: [
    { id: "abwasser", prio: 8, wenn: function (z, w) { return !istUmgesetzt(z, "abwasser") && belastungAbwasser(w) >= 10; },
      text: "Vor der Einleitstelle der Fabrik ist das Wasser trüb, und im Sommer stinkt es. Da finde ich " +
        "kaum noch Fisch." },
    { id: "quoten", prio: 7.8, wenn: function (z) { return kuerzlich(z, "quoten", 3); },
      text: "Die höheren Quoten helfen mir gerade, die Raten für den Kutter zu zahlen. Aber die alten " +
        "Kollegen sagen: Wer heute zu viel fängt, hat morgen nichts mehr im Netz." },
    { id: "windpark", prio: 7.6, wenn: function (z) { return kuerzlich(z, "windpark", 1); },
      text: "Draußen wird gerammt, das hört man bis in den Hafen. Die Schweinswale sind verschwunden. " +
        "Hoffentlich kommen sie zurück, wenn der Lärm aufhört." },
    { id: "schutzFolge", prio: 7, wenn: function (z) { return kuerzlich(z, "schutzgebiet", 2); },
      text: "Seit das Schutzgebiet gesperrt ist, muss ich weiter rausfahren. Das kostet Diesel und Zeit. " +
        "Ich hoffe, es lohnt sich irgendwann." },
    { id: "selektiv", prio: 6.8, wenn: function (z) { return kuerzlich(z, "selektivfang", 2); },
      text: "Die neuen Netze mit Fluchtfenstern kosten mich anfangs ein paar Kilo Fang. Dafür sehe ich " +
        "weniger Jungfische und Beifang an Bord. Ob das reicht, wenn die Bestände so klein sind?" },
    { id: "netze", prio: 7, wenn: function (z) { return !istUmgesetzt(z, "netzrueckgabe"); },
      text: "Bei jedem Sturm gehen Netze verloren, und ein kaputtes Netz zu entsorgen kostet uns Geld. " +
        "Gäbe es eine kostenlose Abgabe im Hafen, würden das viele nutzen." },
    { id: "schutzSorge", prio: 7.5, wenn: function (z) { return !istUmgesetzt(z, "schutzgebiet"); },
      text: "Die Fänge werden jedes Jahr kleiner. Ich weiß, dass sich die Bestände erholen müssen. Aber " +
        "wenn ihr Fanggebiete sperrt, wovon soll ich dann leben?" },
    { id: "schutzErfolg", prio: 5, wenn: function (z) { return istUmgesetzt(z, "schutzgebiet") && z.kennzahlen.artenvielfalt >= 65; },
      text: "Am Rand des Schutzgebiets fange ich wieder größere Fische. Die Jungfische wachsen dort in " +
        "Ruhe auf. Damit hätte ich nicht gerechnet." },
    { id: "altnetze", prio: 4, wenn: function (z, w) { return istUmgesetzt(z, "netzrueckgabe") && belastungFischerei(w) >= 6; },
      text: "Die Rückgabestation wird gut angenommen. Aber am Meeresboden liegen noch die alten Netze von " +
        "früher. Die fangen weiter Fische, ohne dass sie jemand einholt." },
    { id: "klar", prio: 3, wenn: function (z) { return z.kennzahlen.meeresgesundheit >= 80; },
      text: "Das Wasser ist so klar wie lange nicht. Wenn das so bleibt, hat auch mein Sohn eine Zukunft " +
        "als Fischer." },
    { id: "standard", prio: 0, wenn: function () { return true; },
      text: "Ob es dem Meer gut geht, merke ich zuerst im Netz. Wenn die Fische fehlen, fehlt uns allen " +
        "hier die Lebensgrundlage." }
  ],
  land: [
    { id: "akzeptanz", prio: 9, wenn: function (z) { return z.akzeptanz < 45; },
      text: "Im Werk heißt es, an der Küste wird über unsere Köpfe hinweg entschieden. Redet mit den Leuten, " +
        "bevor die nächste Auflage kommt." },
    { id: "arbeit", prio: 8, wenn: function (z) { return z.kennzahlen.wirtschaft < 45; },
      text: "Die Auftragslage ist schlecht, und jede neue Auflage macht es schwerer. Umweltschutz ist " +
        "wichtig, aber die Leute brauchen auch ihre Arbeit." },
    { id: "gewerbe", prio: 7.5, wenn: function (z) { return kuerzlich(z, "gewerbe", 2); },
      text: "Im neuen Gewerbegebiet wird eingestellt, das freut uns. Nur der Graben dahinter sieht nach " +
        "jedem Regen aus wie eine Müllkippe." },
    { id: "klaerFolge", prio: 7, wenn: function (z) { return kuerzlich(z, "abwasser", 3); },
      text: "Die Nachrüstung der Kläranlage kostet uns gerade viel, Kurzarbeit ist im Gespräch. Ich hoffe, " +
        "das zahlt sich aus, wie versprochen." },
    { id: "aue", prio: 6.5, wenn: function (z) { return kuerzlich(z, "aue", 3); },
      text: "Wo früher der Bach im Betonbett lief, wachsen jetzt Weiden. Bis das Wasser wirklich klarer " +
        "wird, dauert es noch, aber die Kinder spielen schon wieder am Ufer." },
    { id: "fluss", prio: 6, wenn: function (z) { return !istUmgesetzt(z, "muellfaenger"); },
      text: "Nach jedem Regen treibt der Fluss Plastik aus der ganzen Gegend Richtung Küste. Der Müll kommt " +
        "nicht nur vom Strand, sondern von uns allen hier im Hinterland." },
    { id: "abwasserSorge", prio: 5, wenn: function (z) { return !istUmgesetzt(z, "abwasser"); },
      text: "Alle zeigen wegen des Abwassers auf unser Werk. Eine Kläranlage nachzurüsten geht, aber nicht " +
        "über Nacht. Wenn es zu schnell geht, stehen Arbeitsplätze auf dem Spiel." },
    { id: "pfand", prio: 4, wenn: function (z) { return !istUmgesetzt(z, "pfand"); },
      text: "In den Straßengräben liegen überall Dosen und Einwegflaschen. Wenn eine Flasche Geld wert " +
        "wäre, würde sie niemand wegwerfen." },
    { id: "schornstein", prio: 3, wenn: function (z) { return !istUmgesetzt(z, "co2") && z.runde >= 4; },
      text: "Unser Schornstein raucht noch wie vor zwanzig Jahren. Wer modernisiert, ist auf Dauer " +
        "konkurrenzfähiger. Nur der Anfang ist teuer." },
    { id: "standard", prio: 0, wenn: function () { return true; },
      text: "Hier im Hinterland merkt man kaum, was an der Küste passiert. Dabei hängt alles zusammen: Was " +
        "wir in den Fluss werfen, liegt später am Strand." }
  ]
};

// ==========================================================
// 4c. WISSEN: INFOPUNKTE UND QUIZ (nur Daten)
// ==========================================================
// Schauplatz: eine Küstenregion an der deutschen Nordsee, am Rand des Wattenmeers.
//
// Infopunkte (i-Zeichen auf der Karte), jeder mit genau einem Fakt:
// - Runde 1: je ein Infopunkt für Strand, Meer und Land. Pflicht: Erst danach
//   melden sich die Menschen vor Ort. Die Fakten kommen im Quiz von Runde 1 vor.
// - Ab Runde 2: ein Infopunkt pro Runde, im Gebiet der Runde (Strand → Meer → Land).
//   Freiwillig und nur in seiner Runde sichtbar. Die Frage dazu kommt im Abschlussquiz.
// x/y = Mitte des Zeichens auf der Karte in Prozent
const INFOPUNKT_PFLICHT_RUNDE = 1;

const INFOPUNKTE = [
  // ---------- Runde 1: Pflicht ----------
  {
    id: "schwelle", runde: 1, region: "strand", x: 15, y: 40, titel: "Wie viel Müll ist zu viel?",
    text: "An Stränden des Nordostatlantiks liegen im Mittel rund 250 Müllteile auf 100 m. Als guter " +
      "Umweltzustand gilt in der EU: weniger als 20 Teile."
  },
  {
    id: "ueberfischung", runde: 1, region: "meer", x: 50, y: 80, titel: "Leere Netze",
    text: "Weltweit gelten 37,7 % der überwachten Fischbestände als überfischt (FAO-Bericht 2024). " +
      "Der Anteil steigt seit Jahrzehnten."
  },
  {
    id: "meeresspiegel", runde: 1, region: "land", x: 30, y: 17, titel: "Steigendes Wasser",
    text: "Der Meeresspiegel steigt, weil Eis an Land schmilzt und sich erwärmtes Wasser ausdehnt. " +
      "Schmelzendes Meereis hebt ihn nicht an, denn es schwimmt bereits."
  },

  // ---------- ab Runde 2: freiwillig, im Wechsel der Gebiete ----------
  {
    id: "tiefsee", runde: 2, region: "meer", x: 70, y: 86, titel: "Unbekannte Tiefe",
    text: "Mehr als 90 % des Ozeans sind Tiefsee, also tiefer als 200 m. Gesehen haben Menschen davon " +
      "nur einen winzigen Bruchteil: weniger als 0,001 % des Tiefseebodens.",
    frage: {
      frage: "Welcher Anteil des Tiefseebodens wurde schon direkt gesehen, mit eigenen Augen oder Kameras?",
      antworten: ["weniger als 0,001 %", "rund 5 %", "rund 27 %", "rund 50 %"], richtig: 0,
      erklaerung: "Vermessen per Echolot ist inzwischen gut ein Viertel des Meeresbodens. Gesehen wurde " +
        "aber weniger als 0,001 % des Tiefseebodens. Vermessen heißt also noch lange nicht erforscht."
    }
  },
  {
    id: "fluss", runde: 3, region: "land", x: 32, y: 10, titel: "Müll auf Reisen",
    text: "Viel Müll an der Küste wird gar nicht am Strand weggeworfen. Flüsse tragen Verpackungen, " +
      "Flaschen und Mikroplastik aus dem Binnenland bis ins Meer.",
    frage: {
      frage: "Woher kommt ein großer Teil des Mülls an der Küste, außer von Strandbesuchern?",
      antworten: [
        "Strandbesucher sind die einzige Quelle.",
        "Flüsse tragen ihn aus dem Binnenland ins Meer.",
        "Er entsteht durch Ebbe und Flut im Watt.",
        "Er stammt fast nur von anderen Kontinenten."
      ], richtig: 1,
      erklaerung: "Flüsse sammeln Abfall aus dem ganzen Hinterland ein. Deshalb wirken Maßnahmen an Land " +
        "auch am Strand, zum Beispiel Müllfänger an den Flussmündungen."
    }
  },
  {
    id: "kegelrobbe", runde: 4, region: "strand", x: 8, y: 39, titel: "Gast auf der Sandbank",
    text: "Die Kegelrobbe ist das größte Raubtier Deutschlands. Um 1910 war sie im Wattenmeer durch " +
      "Bejagung ausgerottet. Seit sie streng geschützt ist, wächst der Bestand wieder.",
    frage: {
      frage: "Welches Tier ist das größte frei lebende Raubtier Deutschlands?",
      antworten: ["Wolf", "Kegelrobbe", "Braunbär", "Seeadler"], richtig: 1,
      erklaerung: "Kegelrobben-Männchen werden über 2 m lang und deutlich schwerer als 200 kg. Nach " +
        "Jagdverbot und besserem Schutz leben heute wieder Tausende im Wattenmeer."
    }
  },
  {
    id: "schweinswal", runde: 5, region: "meer", x: 30, y: 72, titel: "Der heimische Wal",
    text: "Der Schweinswal ist der einzige heimische Wal in Nord- und Ostsee. Seine wichtigste " +
      "Kinderstube in der deutschen Nordsee liegt vor Sylt und Amrum.",
    frage: {
      frage: "Welcher Wal ist in der deutschen Nordsee heimisch und zieht hier seine Jungen auf?",
      antworten: ["Blauwal", "Orca", "Schweinswal", "Pottwal"], richtig: 2,
      erklaerung: "Der Schweinswal ist der einzige heimische Wal in Nord- und Ostsee. Beifang in " +
        "Stellnetzen und Lärm, etwa beim Bau von Offshore-Anlagen, gefährden ihn."
    }
  },
  {
    id: "naehrstoffe", runde: 6, region: "land", x: 96, y: 27, titel: "Zu viel Dünger im Wasser",
    text: "Nährstoffe aus Abwasser und Dünger lassen Algen massenhaft wachsen. Sterben die Algen ab, " +
      "verbraucht ihr Abbau den Sauerstoff im Wasser.",
    frage: {
      frage: "Warum können Nährstoffe aus Abwasser Fische töten?",
      antworten: [
        "Sie sind für Fische so giftig wie Öl.",
        "Abgestorbene Algen verbrauchen beim Abbau den Sauerstoff im Wasser.",
        "Sie machen das Wasser zu salzig.",
        "Sie kühlen das Wasser stark ab."
      ], richtig: 1,
      erklaerung: "Die Nährstoffe selbst sind nicht das Problem, sondern die Algenblüte, die sie auslösen. " +
        "Beim Abbau der abgestorbenen Algen entstehen sauerstoffarme Zonen, in denen kaum etwas überlebt."
    }
  },
  {
    id: "gezeiten", runde: 7, region: "strand", x: 62, y: 38, titel: "Ebbe und Flut",
    text: "An der Nordsee steigt und fällt das Wasser zweimal am Tag. Bei Ebbe fällt das Watt trocken, " +
      "und Würmer, Muscheln und Schnecken werden für Vögel erreichbar.",
    frage: {
      frage: "Wie oft fällt das Watt an der Nordsee ungefähr pro Tag trocken?",
      antworten: ["einmal", "zweimal", "viermal", "gar nicht, es ist immer bedeckt"], richtig: 1,
      erklaerung: "Die Gezeiten wiederholen sich etwa alle 12 Stunden und 25 Minuten. Deshalb gibt es " +
        "pro Tag zweimal Niedrigwasser, jeden Tag ein wenig später."
    }
  },
  {
    id: "seegras", runde: 8, region: "meer", x: 22, y: 72, titel: "Wiesen unter Wasser",
    text: "Seegraswiesen wachsen im flachen, klaren Wasser. Sie sind Kinderstube für junge Fische und " +
      "speichern Kohlenstoff im Boden.",
    frage: {
      frage: "Welche Aufgabe erfüllen Seegraswiesen?",
      antworten: [
        "Sie lösen Algenblüten aus.",
        "Sie filtern Plastik vollständig aus dem Wasser.",
        "Sie dienen jungen Fischen als Kinderstube und speichern Kohlenstoff.",
        "Sie sind eine eingeschleppte Art, die bekämpft werden muss."
      ], richtig: 2,
      erklaerung: "Seegras ist eine Blütenpflanze, keine Alge. Es braucht Licht. Deshalb schadet ihm " +
        "trübes Wasser durch Nährstoffe aus Abwasser besonders."
    }
  },
  {
    id: "versauerung", runde: 9, region: "land", x: 88, y: 9, titel: "Saurer werdendes Meer",
    text: "Der Ozean nimmt rund 30 % des Kohlendioxids auf, das in die Luft gelangt. Dadurch ist das " +
      "Oberflächenwasser seit Beginn der Industrialisierung um rund 30 % saurer geworden.",
    frage: {
      frage: "Was passiert mit dem Meerwasser, wenn es Kohlendioxid aus der Luft aufnimmt?",
      antworten: ["Es wird saurer.", "Es wird süßer.", "Es wird kälter.", "Es verdunstet schneller."], richtig: 0,
      erklaerung: "Gelöstes CO2 bildet Kohlensäure. Der pH-Wert ist seit der Industrialisierung um 0,1 " +
        "gesunken. Muscheln, Schnecken und Korallen fällt es dadurch schwerer, ihre Kalkschalen zu bilden."
    }
  },
  {
    id: "sandregenpfeifer", runde: 10, region: "strand", x: 17, y: 39, titel: "Nest im Sand",
    text: "Der Sandregenpfeifer legt seine Eier gut getarnt in eine flache Mulde im Sand. In Deutschland " +
      "gilt er als vom Aussterben bedroht.",
    frage: {
      frage: "Warum sind Vögel wie der Sandregenpfeifer am Strand besonders gefährdet?",
      antworten: [
        "Sie brüten direkt im Sand, wo Gelege leicht zertreten oder gestört werden.",
        "Sie fressen ausschließlich Plastik.",
        "Sie können nicht fliegen.",
        "Sie brüten nur im Winter, wenn Stürme die Nester zerstören."
      ], richtig: 0,
      erklaerung: "Spaziergänger, Hunde und Strandbetrieb stören die Brut. Abgezäunte Brutzonen helfen, " +
        "auch wenn der Strand für die Gäste dann etwas kleiner wird."
    }
  },
  {
    id: "pottwal", runde: 11, region: "meer", x: 84, y: 84, titel: "Rekordtaucher",
    text: "Pottwale jagen Tintenfische in über 2.000 m Tiefe. Dort ist der Druck rund 200-mal so hoch " +
      "wie an der Oberfläche.",
    frage: {
      frage: "Wie tief tauchen Pottwale auf der Jagd nach Tintenfischen?",
      antworten: ["etwa 20 m", "etwa 200 m", "über 2.000 m", "über 20.000 m"], richtig: 2,
      erklaerung: "Pottwale tauchen über 2 km tief. Ihre Lunge fällt dabei kontrolliert zusammen. Über " +
        "20.000 m ist unmöglich: Die tiefste Stelle des Ozeans liegt bei rund 11 km."
    }
  },
  {
    id: "doggerland", runde: 12, region: "land", x: 46, y: 9, titel: "Versunkenes Land",
    text: "Vor rund 10.000 Jahren verband eine große Landmasse England mit dem Festland, dort, wo heute " +
      "die südliche Nordsee liegt. Als die Gletscher der Eiszeit schmolzen, stieg der Meeresspiegel und " +
      "überflutete dieses Doggerland.",
    frage: {
      frage: "Was lag vor rund 10.000 Jahren dort, wo heute die südliche Nordsee ist?",
      antworten: ["ein tiefer Ozeangraben", "Land, das England mit dem Festland verband",
        "ein aktives Vulkangebiet", "eine Wüste"], richtig: 1,
      erklaerung: "Forschende nennen es Doggerland. Vor rund 8.000 Jahren war es fast ganz versunken. " +
        "Ein Beispiel dafür, wie stark ein steigender Meeresspiegel Küsten verändert."
    }
  }
];

// Quizfragen am Rundenende. art: "infopunkt" = aus den Infopunkten der Runde,
// "vorab" = kam noch nicht vor, die Erklärung bringt das Wissen (Pretesting),
// "spiel" = aus dem Spielgeschehen. Runden ohne Frage: nur der Infopunkt.
const FRAGEN = [
  // Runde 1: drei Fragen zu den drei Pflicht-Infopunkten
  { id: "schwelle", runde: 1, art: "infopunkt",
    frage: "Wie viele Müllteile auf 100 m Strand gelten in der EU höchstens als guter Umweltzustand?",
    antworten: ["weniger als 20", "weniger als 100", "weniger als 250", "weniger als 500"], richtig: 0,
    erklaerung: "Die EU-Mitgliedstaaten haben 20 Teile auf 100 m als Schwellenwert festgelegt. Zu " +
      "Spielbeginn liegen an deinem Strand rund 250 Teile, mehr als zwölfmal so viel." },
  { id: "ueberfischt", runde: 1, art: "infopunkt",
    frage: "Welcher Anteil der weltweit überwachten Fischbestände gilt als überfischt?",
    antworten: ["rund 10 %", "rund 25 %", "rund 38 %", "rund 60 %"], richtig: 2,
    erklaerung: "Laut FAO-Bericht 2024 sind es 37,7 %, und der Anteil steigt seit Jahrzehnten. Große, " +
      "gut verwaltete Bestände stehen meist besser da als kleine." },
  { id: "meereis", runde: 1, art: "infopunkt",
    frage: "Was hebt den Meeresspiegel NICHT direkt an?",
    antworten: ["schmelzende Gletscher in den Alpen", "schmelzendes Meereis in der Arktis",
      "die Ausdehnung von erwärmtem Meerwasser", "schmelzendes Eis auf Grönland"], richtig: 1,
    erklaerung: "Meereis schwimmt bereits und verdrängt so viel Wasser, wie es beim Schmelzen hinzufügt. " +
      "Den Anstieg verursachen Eis an Land, das ins Meer fließt, und die Ausdehnung des wärmer " +
      "werdenden Wassers. Tief liegende Inseln und Küsten sind dadurch bedroht." },

  // Runde 2
  { id: "kartiert", runde: 2, art: "vorab",
    frage: "Welcher Anteil des Meeresbodens ist mit moderner Technik (Fächerecholot) genau vermessen?",
    antworten: ["rund 5 %", "rund 27 %", "rund 60 %", "rund 90 %"], richtig: 1,
    erklaerung: "Laut dem Projekt Seabed 2030 waren es im Juni 2025 27,3 %. Satelliten liefern zwar eine " +
      "grobe Karte des gesamten Bodens, Details zeigt aber erst das Echolot vom Schiff aus. Die oft " +
      "zitierten „5 % erforscht“ sind keine belegte Zahl." },
  { id: "ozeane", runde: 2, art: "vorab",
    frage: "Welche Aufzählung nennt die fünf Ozeane der Erde?",
    antworten: [
      "Pazifik, Atlantik, Indischer Ozean, Mittelmeer und Nordsee",
      "Pazifik, Atlantik, Indischer, Arktischer und Südlicher Ozean",
      "Atlantik, Pazifik, Karibik, Arktischer Ozean und Ostsee",
      "Pazifik, Atlantik, Rotes Meer, Indischer und Südlicher Ozean"
    ], richtig: 1,
    erklaerung: "Die fünf Ozeane bedecken zusammen rund 70 % der Erde. Nordsee, Ostsee oder Mittelmeer " +
      "sind Meere, also Teile oder Nebenmeere eines Ozeans. Die Nordsee gehört zum Atlantik." },

  // Runde 3
  { id: "druck", runde: 3, art: "vorab",
    frage: "Um wie viel steigt der Wasserdruck mit jeweils 10 m Wassertiefe?",
    antworten: ["um etwa 0,1 bar", "um etwa 1 bar", "um etwa 10 bar", "um etwa 100 bar"], richtig: 1,
    erklaerung: "Druck ist Kraft pro Fläche: p = ρ · g · h ≈ 1.025 kg/m³ · 9,81 m/s² · 10 m ≈ 100.000 N/m² " +
      "= 1 bar. In 10 m Tiefe drückt also zusätzlich eine Kraft von etwa 100.000 Newton auf jeden " +
      "Quadratmeter. Im Marianengraben, rund 11 km tief, sind es etwa 1.100 bar." },
  { id: "waerme", runde: 3, art: "vorab",
    frage: "Welcher Anteil der zusätzlichen Wärme durch den Klimawandel landet im Ozean?",
    antworten: ["rund 10 %", "rund 30 %", "rund 50 %", "über 90 %"], richtig: 3,
    erklaerung: "Der Ozean nimmt über 90 % der zusätzlichen Wärme auf. Das bremst die Erwärmung an Land, " +
      "lässt aber das Wasser sich ausdehnen und setzt Fischen, Seegras und Korallen zu." },

  // Fragen zum Drei-Säulen-Modell und zu Zielkonflikten (Runden 4, 6, 9 und 10)
  { id: "saeulen", runde: 4, art: "spiel",
    frage: "Wofür steht das Drei-Säulen-Modell der Nachhaltigkeit?",
    antworten: [
      "Ökologie, Ökonomie und Soziales sollen gleichzeitig berücksichtigt werden.",
      "Drei Staaten teilen sich die Verantwortung für ein Meer.",
      "Erst kommt die Wirtschaft, dann die Umwelt, dann die Gesellschaft.",
      "Abfall wird vermieden, verwertet und entsorgt."
    ], richtig: 0,
    erklaerung: "Nachhaltige Entwicklung heißt nach dem Brundtland-Bericht von 1987, die Bedürfnisse der " +
      "Gegenwart zu befriedigen, ohne die Möglichkeiten künftiger Generationen zu gefährden. Das " +
      "Drei-Säulen-Modell baut darauf auf und verlangt, Ökologie, Ökonomie und Soziales gleichwertig zu " +
      "behandeln (so etwa die Enquete-Kommission des Bundestages). Im Spiel sind das deine drei " +
      "Entscheidungen pro Runde." },
  { id: "konflikt", runde: 6, art: "spiel",
    frage: "Eine Gemeinde führt Bußgelder für Müll am Strand ein. Welcher Zielkonflikt ist am wahrscheinlichsten?",
    antworten: [
      "Ökologie gegen Soziales: Der Strand wird sauberer, aber die Zustimmung sinkt.",
      "Es gibt keinen Konflikt, weil ein sauberer Strand allen gleich nützt.",
      "Ökonomie gegen Technik: Die Streifen brauchen neue Software.",
      "Soziales gegen Soziales: Alle Anwohner sind automatisch dafür."
    ], richtig: 0,
    erklaerung: "Maßnahmen wirken selten nur auf eine Säule. Kontrollen senken den Müll, stoßen aber bei " +
      "Einheimischen und Gästen auf Widerstand, und wer die Last trägt, ist nicht immer derjenige, der " +
      "profitiert. Im Spiel kostet ein solcher Beschluss deshalb dauerhaft Zustimmung." },
  { id: "starke", runde: 9, art: "spiel",
    frage: "Was unterscheidet starke von schwacher Nachhaltigkeit?",
    antworten: [
      "Bei starker Nachhaltigkeit lässt sich Natur nur begrenzt durch Geld oder Technik ersetzen.",
      "Starke Nachhaltigkeit gilt nur für große Staaten.",
      "Schwache Nachhaltigkeit verbietet jede wirtschaftliche Nutzung der Natur.",
      "Beide meinen dasselbe, nur das Wort ist ein anderes."
    ], richtig: 0,
    erklaerung: "Schwache Nachhaltigkeit nimmt an, dass sich Verluste an Natur durch Geld und Technik " +
      "ausgleichen lassen, solange das Gesamtvermögen nicht sinkt. Starke Nachhaltigkeit hält manche " +
      "Naturleistungen für unersetzbar. Deshalb zieht im Spiel die schwächste Säule den Score stärker " +
      "nach unten: Eine starke Wirtschaft gleicht ein krankes Meer nicht aus." },
  { id: "uebergang", runde: 10, art: "spiel",
    frage: "Was meint der Begriff „gerechter Übergang“ (Just Transition)?",
    antworten: [
      "Wer durch Umweltauflagen Arbeit oder Einkommen verliert, wird beim Umstieg unterstützt.",
      "Alle Betriebe müssen gleichzeitig dieselben Auflagen erfüllen.",
      "Der Staat übernimmt sämtliche Kosten des Umweltschutzes.",
      "Schutzmaßnahmen werden verschoben, bis alle zustimmen."
    ], richtig: 0,
    erklaerung: "Der Gedanke stammt aus der Arbeitswelt und wird unter anderem von der Internationalen " +
      "Arbeitsorganisation (ILO) vertreten: Der Wandel zu einer umweltverträglichen Wirtschaft soll " +
      "Beschäftigte und Gemeinden nicht allein belasten. Im Spiel entspricht dem die Umstiegshilfe für " +
      "betroffene Betriebe." },

  // ab Runde 5: einzelne Fragen; Runde 4 und 10 bringen nur den Infopunkt
  { id: "geisternetz", runde: 5, art: "vorab",
    frage: "Was passiert mit Fischernetzen, die im Meer verloren gehen?",
    antworten: [
      "Sie zersetzen sich in wenigen Wochen.",
      "Sie fangen weiter Fische, Robben und Vögel, obwohl sie niemand mehr einholt.",
      "Sie sinken ab und sind dann harmlos.",
      "Sie werden von Bakterien abgebaut und düngen das Meer."
    ], richtig: 1,
    erklaerung: "Solche Geisternetze bestehen meist aus Kunststoff und halten viele Jahre. Tiere verfangen " +
      "sich darin und verenden. Dauerhaft hilft am meisten, wenn gar nicht erst Netze verloren gehen." },
  { id: "krake", runde: 6, art: "vorab",
    frage: "Wie viele Herzen hat ein Krake?",
    antworten: ["eines", "zwei", "drei", "acht"], richtig: 2,
    erklaerung: "Zwei Kiemenherzen pumpen das Blut durch die Kiemen, ein Körperherz versorgt den Rest des " +
      "Körpers. Sein Blut ist blau, weil es kupferhaltiges Hämocyanin statt Hämoglobin enthält." },
  { id: "mikroplastik", runde: 7, art: "vorab",
    frage: "Ab welcher Größe nennt man Kunststoffteilchen Mikroplastik?",
    antworten: ["kleiner als 5 mm", "kleiner als 5 cm", "kleiner als 0,001 mm", "nur Plastik aus Kosmetik"], richtig: 0,
    erklaerung: "Als Mikroplastik gelten Teilchen unter 5 mm. Ein großer Teil entsteht, wenn Flaschen, " +
      "Tüten oder Netze durch Sonne und Wellen zerfallen. Wer heute Müll vom Strand holt, verhindert " +
      "also auch das Mikroplastik von morgen." },
  { id: "bestand", runde: 8, art: "spiel",
    frage: "Warum bleibt ein aufgeräumter Strand nicht lange sauber?",
    antworten: [
      "Weil Müll im Sand von selbst nach oben wandert.",
      "Weil Aufräumaktionen den Müll nur verschieben.",
      "Weil jede Runde neuer Müll von Besuchern, aus der Fischerei und aus Flüssen nachkommt.",
      "Weil Möwen den Müll aus den Mülleimern zurück an den Strand tragen."
    ], richtig: 2,
    erklaerung: "Strandmüll ist ein Bestand mit Zufluss. Aufräumen senkt den Bestand einmalig, am Zufluss " +
      "ändert es nichts. Dauerhaft sauber wird der Strand erst, wenn weniger neuer Müll entsteht." },
  { id: "sauerstoff", runde: 9, art: "vorab",
    frage: "Welcher Anteil des Sauerstoffs, der jedes Jahr auf der Erde entsteht, wird im Meer gebildet?",
    antworten: ["fast nichts", "rund 10 %", "rund die Hälfte", "fast alles"], richtig: 2,
    erklaerung: "Winziges Plankton bildet rund die Hälfte des Sauerstoffs. Fast genauso viel verbrauchen " +
      "Meereslebewesen und der Abbau toter Biomasse aber wieder. Was wir atmen, stammt größtenteils aus " +
      "dem Vorrat der Atmosphäre, der sich über Jahrmillionen aufgebaut hat." },
  { id: "blauwal", runde: 11, art: "vorab",
    frage: "Welches ist das größte Tier, das nach heutigem Wissen je auf der Erde gelebt hat?",
    antworten: ["Brachiosaurus", "Megalodon", "Blauwal", "Pottwal"], richtig: 2,
    erklaerung: "Der Blauwal wird über 30 m lang und deutlich über 100 t schwer. Er ernährt sich fast " +
      "nur von Krill, kleinen Krebstieren, die er aus dem Wasser filtert." }
];

// ==========================================================
// 4d. STARTBILDSCHIRM: MEERESFAKTEN UND HINTERGRUNDBILDER (nur Daten)
// ==========================================================
// Hintergrundbilder: eigene Fotos in den Ordner "bilder" legen (Querformat,
// mindestens 1920 px breit, ruhige Motive wie Dünen, Strand oder Watt).
// Fehlt ein Bild, wird es übersprungen. Fehlen alle, erscheint eine
// gezeichnete Küstenszene. "nachweis" steht unten rechts auf dem Startbildschirm
// und im Pop-up „Quellen“ (bei Fotos mit CC-Lizenz Pflicht).
const HINTERGRUNDBILDER = [
  { datei: "bilder/start-1.jpg", nachweis: "" },
  { datei: "bilder/start-2.jpg", nachweis: "" },
  { datei: "bilder/start-3.jpg", nachweis: "" },
  { datei: "bilder/start-4.jpg", nachweis: "" }
];

const START_BILD_DAUER = 16000;   // ms, so lange steht ein Hintergrundbild
const START_VERSION = "Version 10";

// Ladebildschirm nach Namenseingabe und Spielstart (siehe Abschnitt „Ladebildschirm“ unten).
// Feste Gesamtdauer: Der Ladebildschirm steht immer genau gesamtDauer ms, egal wie oft übersprungen wird.
// Ohne Eingriff wechselt der Fakt alle faktDauer ms (bei 8 s / 4 s also 2 Fakten, jeder volle 4 s).
// gesamtDauer sollte ein Vielfaches von faktDauer sein, sonst wird der letzte Fakt abgeschnitten.
// Überspringen (Enter, Leertaste, Maustaste) zeigt sofort den nächsten Fakt und startet nur die
// Faktuhr neu, die Gesamtuhr läuft unverändert weiter.
const LADEBILDSCHIRM = {
  gesamtDauer: 8000,      // ms, feste Gesamtlaufzeit des Ladebildschirms (2 × faktDauer)
  faktDauer: 4000          // ms, so lange steht ein Fakt, wenn niemand überspringt
};

// Statuszeile unter dem Balken, eine pro Drittel der Gesamtzeit
const LADE_STATUS = [
  "Küstenabschnitt wird vermessen …",
  "Müllfunde werden gezählt …",
  "Region wird übergeben …"
];

// Kurze Zusatzzeile neben dem Titel; bei jedem Öffnen des Startbildschirms eine andere
const START_SPLASH = [
  "Schütze das Watt, rette die Zukunft!",
  "Wie viel Müll verträgt ein Strand?",
  "Deine Küste. Deine Verantwortung.",
  "Weniger als 20 Teile auf 100 m!",
  "Nachhaltigkeit ist kein Zufallsprodukt!",
  "Vorbeugen schlägt Aufräumen."
];

const FAKT_KATEGORIEN = {
  nordsee:    { name: "Nordsee",      farbe: "#6CB8E8" },
  wattenmeer: { name: "Wattenmeer",   farbe: "#7FD1B9" },
  bedroht:    { name: "Bedroht",      farbe: "#F2867A" },
  entdeckt:   { name: "Neu entdeckt", farbe: "#B9A3F0" },
  rueckkehr:  { name: "Rückkehr",     farbe: "#FFD166" },
  weltmeer:   { name: "Weltmeer",     farbe: "#A9D3EE" },
  muell:      { name: "Meeresmüll",   farbe: "#F4A261" },
  klima:      { name: "Klima & Meer", farbe: "#F7A8C8" }
};

// Fakten für den Ladebildschirm. Jeder Fakt hat eine überprüfbare Quelle (Name + Link), die im
// Ladebildschirm unter dem Text und im Pop-up „Quellen“ erscheint.
// Aufbau: titel = die Kernaussage (kurz, mit der wichtigsten Zahl), text = ein bis zwei kurze
// Sätze Zusatzinfo. In 4 s muss beides lesbar sein, also knapp halten.
// Pro Ladung werden ohne Eingriff 2 Fakten gezeigt; der Rest ist Puffer fürs Überspringen.
// Erst wenn alle Fakten einmal dran waren, wird neu gemischt (siehe naechsterFakt).
const MEERESFAKTEN = [
  {
    id: "schweinswal-ostsee", kategorie: "bedroht",
    titel: "Nur noch rund 500 Schweinswale in der Ostsee",
    text: "Deutschlands einziger heimischer Wal ist dort akut vom Aussterben bedroht. Viele sterben als Beifang in Stellnetzen.",
    quelle: { name: "Deutsche Umwelthilfe, 2021",
      url: "https://www.duh.de/presse/pressemitteilungen/pressemitteilung/ostsee-schweinswal-vom-aussterben-bedroht-umweltschuetzer-starten-petition-gegen-stellnetze-in-meere/" }
  },
  {
    id: "schweinswal-nordsee", kategorie: "nordsee",
    titel: "Knapp 28.000 Schweinswale in der Nordsee",
    text: "So viele schätzten Fachleute 2019 nach Zählflügen. Am Sylter Außenriff ging der Bestand zuvor stark zurück.",
    quelle: { name: "Bundesamt für Naturschutz, Monitoringbericht 2019",
      url: "https://www.bfn.de/sites/default/files/2022-05/2019-monitoringbericht-schweinswale.pdf" }
  },
  {
    id: "seehund", kategorie: "wattenmeer",
    titel: "Seehunde: tiefster Stand seit 2010",
    text: "2023 zählten Fachleute im Wattenmeer 22.621 Tiere, der dritte Rückgang in Folge. Die Ursache ist noch unklar.",
    quelle: { name: "ORF nach Gemeinsamem Wattenmeersekretariat, 2023", url: "https://orf.at/stories/3338410/" }
  },
  {
    id: "auster", kategorie: "rueckkehr",
    titel: "Eine Auster filtert bis zu 240 Liter am Tag",
    text: "In der Nordsee war sie durch Überfischung fast ausgestorben. Heute wird sie wieder angesiedelt, etwa im Borkum Riffgrund.",
    quelle: { name: "Bundesamt für Naturschutz, Faltblatt 2022",
      url: "https://www.bfn.de/sites/default/files/2022-08/2022-faltblatt-die-wiederansiedlung-der-europaeischen-auster-bfn.pdf" }
  },
  {
    id: "rochen", kategorie: "bedroht",
    titel: "Fast alle Haie und Rochen sind bedroht",
    text: "Von zehn heimischen Arten ist nur der Kleingefleckte Katzenhai nicht gefährdet. Hauptursache ist Beifang.",
    quelle: { name: "Umwelt im Unterricht (Bundesumweltministerium)",
      url: "https://www.umwelt-im-unterricht.de/hintergrund/gefaehrdete-arten-rochen-und-haie-in-deutschen-meeren/" }
  },
  {
    id: "eissturmvogel", kategorie: "nordsee",
    titel: "89 % der Eissturmvögel haben Plastik im Magen",
    text: "Untersucht wurden tote Vögel von der Nordseeküste (2019–2023). Bei 48 % war es über 0,1 g, Ziel sind höchstens 10 %.",
    quelle: { name: "Umweltbundesamt, Indikator Kunststoffmüll in der Nordsee",
      url: "https://www.umweltbundesamt.de/daten/umweltindikatoren/indikator-kunststoffmuell-in-der-nordsee" }
  },
  {
    id: "zugvoegel", kategorie: "wattenmeer",
    titel: "Bis zu 12 Millionen Zugvögel rasten im Watt",
    text: "Und das jedes Jahr. Das Wattenmeer ist seit 2009 UNESCO-Weltnaturerbe und Heimat von rund 10.000 Arten.",
    quelle: { name: "Landesportal Schleswig-Holstein",
      url: "https://www.schleswig-holstein.de/DE/landesportal/land-und-leute/landschaft-natur/wattenmeer" }
  },
  {
    id: "stoer", kategorie: "bedroht",
    titel: "Der Stör wurde bis zu 5,4 Meter lang",
    text: "In Deutschland gilt er seit den 1970er-Jahren als ausgestorben. Seit 2008 werden Jungstöre in Elbe und Havel ausgesetzt.",
    quelle: { name: "Leibniz-Institut für Gewässerökologie (IGB), 2015", url: "https://idw-online.de/de/news630239" }
  },
  {
    id: "ocean-census", kategorie: "entdeckt",
    titel: "866 neue Meeresarten entdeckt",
    text: "Das meldete Ocean Census 2025, darunter ein Hai. Bekannt sind erst rund 10 % des Lebens im Meer.",
    quelle: { name: "University of Essex, 2025",
      url: "https://www.essex.ac.uk/news/2025/04/14/ocean-census-and-university-of-essex-discover-866-new-species" }
  },
  {
    id: "korallen", kategorie: "weltmeer",
    titel: "84 % der Korallenriffe leiden unter Hitze",
    text: "Die vierte weltweite Korallenbleiche läuft seit 2023 und hat Riffe in 82 Ländern und Gebieten erfasst.",
    quelle: { name: "NOAA und International Coral Reef Initiative, 2025",
      url: "https://maritime-executive.com/article/unprecedented-bleaching-event-affects-84-percent-of-world-s-corals" }
  },
  {
    id: "hochsee", kategorie: "weltmeer",
    titel: "Erstmals Schutz für die Hohe See",
    text: "Seit Januar 2026 gilt das UN-Hochseeabkommen. Es erlaubt Schutzgebiete in Meeren, die keinem Staat gehören.",
    quelle: { name: "SeafoodSource, 2025",
      url: "https://www.seafoodsource.com/news/environment-sustainability/high-seas-treaty-crosses-ratification-threshold-enters-force-in-january-2026" }
  },
  {
    id: "thunfisch", kategorie: "rueckkehr",
    titel: "Der Blauflossenthunfisch ist zurück",
    text: "Über 50 Jahre war er in den nordischen Meeren selten. Heute taucht er wieder auf, Satellitensender verfolgen seine Wege.",
    quelle: { name: "Aarestrup et al., Scientific Reports 2022", url: "https://doi.org/10.1038/s41598-022-15819-x" }
  },
  // ----- Erweiterung: Meeresmüll, Klima, Wattenmeer -----
  {
    id: "plastik-eintrag", kategorie: "muell",
    titel: "Bis zu 12,7 Millionen Tonnen Plastik ins Meer",
    text: "So viel Plastikmüll gelangte 2010 schätzungsweise aus 192 Küstenländern ins Meer, in nur einem Jahr.",
    quelle: { name: "Jambeck et al., Science 2015", url: "https://doi.org/10.1126/science.1260352" }
  },
  {
    id: "geisternetze", kategorie: "muell",
    titel: "Fast die Hälfte ist altes Fischernetz",
    text: "Mindestens 46 % des Großen Pazifischen Müllteppichs sind verlorene Netze, sogenannte Geisternetze.",
    quelle: { name: "Lebreton et al., Scientific Reports 2018", url: "https://doi.org/10.1038/s41598-018-22939-w" }
  },
  {
    id: "tiefsee-tuete", kategorie: "muell",
    titel: "Eine Plastiktüte in 10.898 Metern Tiefe",
    text: "Ein Tauchroboter filmte sie im Marianengraben. 89 % des gefundenen Tiefseeplastiks waren Einwegprodukte.",
    quelle: { name: "Chiba et al., Marine Policy 2018", url: "https://doi.org/10.1016/j.marpol.2018.03.022" }
  },
  {
    id: "spuelsaum", kategorie: "muell",
    titel: "Rund 400 Müllteile auf 100 m Strand",
    text: "So viel liegt im Mittel an der Nordsee, an der Ostsee rund 70. Mindestens 70 % davon sind Kunststoff.",
    quelle: { name: "Umweltbundesamt, Runder Tisch Meeresmüll",
      url: "https://www.umweltbundesamt.de/presse/pressemitteilungen/runder-tisch-gegen-meeresmuell-geht-in-die-zweite" }
  },
  {
    id: "reifenabrieb", kategorie: "muell",
    titel: "Reifenabrieb: Mikroplastik-Quelle Nr. 1",
    text: "In Deutschland bis zu 100.000 Tonnen im Jahr. Über Regenwasser und Flüsse gelangt er bis ins Meer.",
    quelle: { name: "Fraunhofer UMSICHT, 2024", url: "https://idw-online.de/de/news826927" }
  },
  {
    id: "sauerstoff", kategorie: "weltmeer",
    titel: "Jeder zweite Atemzug kommt aus dem Meer",
    text: "Etwa die Hälfte des Sauerstoffs der Erde stammt aus dem Meer, vor allem von winzigem Plankton.",
    quelle: { name: "NOAA Ocean Service", url: "https://oceanservice.noaa.gov/facts/ocean-oxygen.html" }
  },
  {
    id: "versauerung", kategorie: "klima",
    titel: "Das Meer ist rund 30 % saurer geworden",
    text: "Es schluckt etwa 30 % des CO₂ aus der Luft. Muscheln und Korallen fällt der Bau ihrer Kalkschalen dadurch schwerer.",
    quelle: { name: "NOAA, Ocean Acidification",
      url: "https://www.noaa.gov/education/resource-collections/ocean-coasts/ocean-acidification" }
  },
  {
    id: "ozeanwaerme", kategorie: "klima",
    titel: "90 % der Extra-Wärme steckt im Meer",
    text: "Das Meer hat fast die gesamte zusätzliche Wärme des Treibhauseffekts aufgenommen, vor allem in den oberen 700 m.",
    quelle: { name: "NASA, Vital Signs: Ocean Warming", url: "https://climate.nasa.gov/vital-signs/ocean-warming/" }
  },
  {
    id: "seegras", kategorie: "klima",
    titel: "Seegras bindet CO₂ bis zu 35-mal schneller",
    text: "Schneller als tropischer Regenwald, pro Fläche. Auf 0,2 % des Meeresbodens speichert es 10 % des Kohlenstoffs im Meer.",
    quelle: { name: "UN-Umweltprogramm (UNEP)",
      url: "https://www.unep.org/news-and-stories/story/seagrass-secret-weapon-fight-against-global-heating" }
  },
  {
    id: "watt-weltrekord", kategorie: "wattenmeer",
    titel: "Das größte Watt der Welt liegt vor unserer Küste",
    text: "Nirgends gibt es mehr zusammenhängendes Sand- und Schlickwatt. Die Natur läuft hier weitgehend ungestört ab.",
    quelle: { name: "UNESCO-Welterbezentrum", url: "https://whc.unesco.org/en/list/1314" }
  },
  {
    id: "kegelrobbe", kategorie: "rueckkehr",
    titel: "Rekord: 11.515 Kegelrobben gezählt",
    text: "So viele lebten 2024 im Wattenmeer und auf Helgoland, 9 % mehr als im Vorjahr. Sie ist Deutschlands größtes Raubtier.",
    quelle: { name: "Gemeinsames Wattenmeersekretariat, 2024", url: "https://waddensea-worldheritage.org/node/2239" }
  },
  {
    id: "schutzgebiete", kategorie: "nordsee",
    titel: "45 % unserer Meere sind Schutzgebiete",
    text: "In der Nordsee sind es etwa 43 %, in der Ostsee etwa 51 % (Stand April 2024).",
    quelle: { name: "Bundesamt für Naturschutz, Hintergrundpapier 2026",
      url: "https://www.bfn.de/sites/default/files/2026-01/2026%2001%2016%20Hintergrund%20Meere_Schutzgebiete_aktualisiert_pac.pdf" }
  },
  {
    id: "kabeljau", kategorie: "nordsee",
    titel: "Der Kabeljau flieht nach Norden",
    text: "Das wärmere Wasser vertreibt ihn, wärmeliebende Arten wandern ein. Im Süden seines Gebiets ist er fast verschwunden.",
    quelle: { name: "Umweltbundesamt, Monitoringbericht Klimaanpassung",
      url: "https://www.umweltbundesamt.de/monitoring-zur-das/handlungsfelder/fischerei/fi-i-1/indikator" }
  },
  {
    id: "tiefsee-gesehen", kategorie: "entdeckt",
    titel: "Weniger als 0,001 % der Tiefsee gesehen",
    text: "Mehr haben Menschen bisher nicht vom Tiefseeboden beobachtet: eine Fläche etwa so groß wie Rhode Island.",
    quelle: { name: "NPR nach Bell et al., Science Advances 2025",
      url: "https://www.npr.org/2025/05/07/nx-s1-5387502/deep-seafloor-ocean-mapped-rhode-island" }
  }
];

// ==========================================================
// 5. SPIELZUSTAND
// ==========================================================
let zustand = null;          // wird bei jedem neuen Spiel neu erzeugt
let spielerName = "";

function leereAuswahl() {
  return { oeko: null, oekonomie: null, sozial: null };
}

function neuerZustand(zufall) {
  const z = {
    runde: 1,
    budget: STARTBUDGET,
    akzeptanz: STARTWERTE.akzeptanz,
    kennzahlen: {
      meeresgesundheit: STARTWERTE.meeresgesundheit,
      artenvielfalt:    STARTWERTE.artenvielfalt,
      wirtschaft:       STARTWERTE.wirtschaft,
      tourismus:        STARTWERTE.tourismus
    },
    strandmuell: MUELL_START,
    eintrag: null,             // erwarteter Eintrag in der aktuellen Runde
    umgesetzt: {},             // id der Maßnahme → Liste der Runden
    effekte: [],               // { quelle, massnahme, start, ende, wirkung, popup, gemeldet }
    ereignisPlan: ereignisPlanErstellen(zufall || Math.random),
    ereignis: null,            // Ereignis der aktuellen Runde
    foerderaufruf: null,       // offener EU-Förderaufruf
    auswahl: leereAuswahl(),   // je Säule: null = offen, ZURUECKSTELLEN oder id der Maßnahme
    zuletzt: null,             // aufgeklappte Karte im Entscheidungsfenster (id der Maßnahme oder "zurueckstellen:<säule>")
    trend: {},                 // Änderung jeder Kennzahl in der letzten Runde
    verlauf: [],               // Momentaufnahmen: Index 0 = Start, dann je Runde
    anliegen: [],              // Anliegen der aktuellen Runde (Sprechblasen)
    anhoerung: { gesamt: 0, zuSchnell: 0 },   // Zähler für die Auswertung (Zuhören)
    gesagt: [],                // bereits geäußerte Aussagen, z. B. "meer:netze"
    infopunkteGelesen: [],     // ids der geöffneten Infopunkte
    otterGelesen: [],          // Runden, in denen der Otter angeklickt wurde
    muellBilanz: null,         // Müllbilanz der letzten Runde (für das Strandmüll-Pop-up)
    quiz: { richtig: 0, gestellt: 0, ergebnisse: [] },
    beendet: false
  };
  z.eintrag = eintragBerechnen(z, aktiveWirkung(z, 1));
  z.anliegen = anliegenErstellen(z);
  z.verlauf.push(momentaufnahme(z, 0));
  return z;
}

// Verteilt die Zufallsereignisse auf zufällige Runden (jedes Ereignis höchstens einmal)
function ereignisPlanErstellen(zufall) {
  if (!EREIGNISSE_AKTIV) return {};
  const runden = [];
  for (let r = EREIGNIS_RUNDEN.von; r <= EREIGNIS_RUNDEN.bis; r++) {
    runden.push(r);
  }
  const ids = EREIGNISSE.map(function (e) { return e.id; });
  mischen(runden, zufall);
  mischen(ids, zufall);
  const plan = {};
  for (let i = 0; i < EREIGNIS_RUNDEN.anzahl && i < ids.length; i++) {
    plan[runden[i]] = ids[i];
  }
  return plan;
}

function mischen(liste, zufall) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    const tmp = liste[i];
    liste[i] = liste[j];
    liste[j] = tmp;
  }
}

// ==========================================================
// 6. SIMULATIONSMODELL (reine Rechenfunktionen, keine Anzeige)
// ==========================================================
function begrenzen(wert, min, max) {
  return Math.min(max, Math.max(min, wert));
}

function runden1(wert) {
  return Math.round(wert * 10) / 10;
}

function massnahmeFinden(id) {
  return MASSNAHMEN.find(function (m) { return m.id === id; }) || null;
}

function saeuleFinden(id) {
  return SAEULEN.find(function (s) { return s.id === id; });
}

function istUmgesetzt(z, id) {
  return Boolean(z.umgesetzt[id] && z.umgesetzt[id].length > 0);
}

// Aktuelle Kosten: Basispreis plus Aufschlag für jede frühere Umsetzung (wiederholbare
// Maßnahmen), mal Preisniveau (KOSTEN_FAKTOR) und Level-Faktor, auf 50 € gerundet
function kostenBerechnen(z, m) {
  const bisher = z.umgesetzt[m.id] ? z.umgesetzt[m.id].length : 0;
  const basis = m.kosten + (m.kostenAnstieg || 0) * bisher;
  const level = aktuellesLevel(Math.min(z.runde, RUNDEN));
  return Math.round(basis * KOSTEN_FAKTOR * level.kostenFaktor / 50) * 50;
}

function aktuellesLevel(runde) {
  return LEVEL.find(function (l) { return runde >= l.von && runde <= l.bis; }) || LEVEL[LEVEL.length - 1];
}

// Summe aller Wirkungen, die in einer Runde aktiv sind
function aktiveWirkung(z, runde) {
  const w = {
    eintragStrand: 1, eintragMeer: 1, eintragLand: 1,
    druckWasser: 0, druckFischerei: 0, druckKlima: 0,
    tourismus: 0, wirtschaft: 0, artenvielfalt: 0, akzeptanz: 0,
    reinigung: 0, einnahmen: 0
  };
  z.effekte.forEach(function (e) {
    const aktiv = e.start <= runde && (e.ende === null || runde < e.ende);
    if (!aktiv) return;
    for (const schluessel in e.wirkung) {
      if (schluessel.indexOf("eintrag") === 0) {
        w[schluessel] *= e.wirkung[schluessel];   // Faktoren werden multipliziert
      } else {
        w[schluessel] += e.wirkung[schluessel];   // Punkte werden addiert
      }
    }
  });
  return w;
}

// Neuer Müll pro Runde aus den drei Quellen
function eintragBerechnen(z, w) {
  const gaeste = 0.3 + 0.7 * z.kennzahlen.tourismus / TOURISMUS_BEZUG;   // mehr Gäste = mehr Müll
  const e = {
    strand: runden1(EINTRAG_GRUND.strand * gaeste * w.eintragStrand),
    meer:   runden1(EINTRAG_GRUND.meer * w.eintragMeer),
    land:   runden1(EINTRAG_GRUND.land * w.eintragLand)
  };
  e.gesamt = runden1(e.strand + e.meer + e.land);
  return e;
}

// 0 = so vermüllt wie zu Beginn, 1 = EU-Schwellenwert erreicht
function sauberkeit(muell) {
  return begrenzen((MUELL_START - muell) / (MUELL_START - MUELL_SCHWELLE), 0, 1);
}

function belastungenBerechnen(w, muell, eintrag, k) {
  const wachstum = WACHSTUM_DRUCK.tourismus * Math.max(0, k.tourismus - WACHSTUM_GRENZE.tourismus) +
                   WACHSTUM_DRUCK.wirtschaft * Math.max(0, k.wirtschaft - WACHSTUM_GRENZE.wirtschaft);
  return {
    muell: Math.round(MUELL_DRUCK.eintrag * Math.min(1, eintrag / EINTRAG_START) +
                      MUELL_DRUCK.bestand * Math.min(1, muell / MUELL_START)),
    wasser:    Math.max(0, Math.round(DRUCK_START.wasser + w.druckWasser + wachstum)),
    fischerei: Math.max(0, DRUCK_START.fischerei + w.druckFischerei),
    klima:     Math.max(0, DRUCK_START.klima + w.druckKlima)
  };
}

// Richtwerte: dorthin bewegen sich die Kennzahlen
function richtwerteBerechnen(z, w, muellNeu, eintrag) {
  const k = z.kennzahlen;
  const b = belastungenBerechnen(w, muellNeu, eintrag, k);
  const s = sauberkeit(muellNeu);
  const summe = b.muell + b.wasser + b.fischerei + b.klima;
  // Überlaufener Ort: Ab TOURISMUS_GRENZE sinkt die Akzeptanz mit jedem Punkt mehr Gäste
  const ueberlaufen = UEBERLAUFEN * Math.max(0, k.tourismus - TOURISMUS_GRENZE);
  return {
    belastungen: b,
    // 100 minus alle Belastungen
    meeresgesundheit: begrenzen(Math.round(100 - summe), 0, 100),
    // folgt der Meeresgesundheit der Vorrunde (Verzögerung), Fischerei belastet zusätzlich
    artenvielfalt: begrenzen(Math.round(k.meeresgesundheit - 0.5 * b.fischerei + w.artenvielfalt), 0, 100),
    // Gäste mögen saubere Strände und klares Wasser
    tourismus: begrenzen(Math.round(48 + 15 * s + 0.3 * (k.meeresgesundheit - 45) + w.tourismus), 0, 100),
    // hängt am Tourismus und an Auflagen für die Betriebe
    wirtschaft: begrenzen(Math.round(48 + 0.35 * (k.tourismus - 50) + w.wirtschaft), 0, 100),
    // steigt mit Arbeitsplätzen und sichtbaren Erfolgen, sinkt bei Überlaufen
    akzeptanz: begrenzen(Math.round(48 + 0.4 * (k.wirtschaft - 50) + 10 * s + w.akzeptanz - ueberlaufen), 0, 100)
  };
}

// Bewegt einen Wert schrittweise auf seinen Richtwert zu
function schritt(wert, richtwert, anteil, max) {
  let d = (richtwert - wert) * anteil;
  d = begrenzen(d, -max, max);
  d = Math.sign(d) * Math.round(Math.abs(d));
  return begrenzen(wert + d, 0, 100);
}

function laufendeKostenBerechnen(z) {
  let summe = 0;
  const liste = [];
  MASSNAHMEN.forEach(function (m) {
    if (m.laufendeKosten && istUmgesetzt(z, m.id)) {
      summe += m.laufendeKosten;
      liste.push({ name: m.name, betrag: m.laufendeKosten });
    }
  });
  return { summe: summe, liste: liste };
}

// Einnahmen einer Runde = Grundeinkommen + Faktor × Tourismus × Wirtschaft
//                       + Zusatzeinnahmen (z. B. Kurtaxe) + Förderprogramme − laufende Kosten
function einnahmenBerechnen(z) {
  const k = z.kennzahlen;
  const anteil = Math.round(EINKOMMEN_FAKTOR * k.tourismus * k.wirtschaft);
  const programme = FOERDERPROGRAMME.filter(function (f) { return f.pruefen(z); });
  const foerderung = programme.reduce(function (s, f) { return s + f.betrag; }, 0);
  const laufend = laufendeKostenBerechnen(z);
  const zusatz = aktiveWirkung(z, Math.min(z.runde, RUNDEN)).einnahmen;
  return {
    grund: GRUNDEINKOMMEN,
    anteil: anteil,
    zusatz: zusatz,
    programme: programme,
    foerderung: foerderung,
    laufend: laufend,
    summe: GRUNDEINKOMMEN + anteil + zusatz + foerderung - laufend.summe
  };
}

// Müllpunkte auf logarithmischer Skala: Jede Halbierung des Bestands zählt
// gleich viel. Von 250 auf 125 Teile bringt so viel wie von 40 auf 20.
// 100 Punkte gibt es erst unter dem Schwellenwert, also ab MUELL_SCHWELLE − 1 Teilen.
function muellPunkte(muell) {
  const bestwert = MUELL_SCHWELLE - 1;
  const anteil = (Math.log(MUELL_START) - Math.log(Math.max(muell, 1))) /
                 (Math.log(MUELL_START) - Math.log(bestwert));
  return begrenzen(anteil, 0, 1) * 100;
}

// ---------- Sollkurs, Säulenindizes und Rundenscore ----------
// Runden, in denen alle Mindestbedingungen gleichzeitig erfüllt sein müssen (z. B. 10 bis 12)
function zielFenster() {
  return { von: RUNDEN - ZIEL_RUNDEN + 1, bis: RUNDEN };
}

// Sollwert einer Kennzahl in einer Runde: linear zwischen den Stützpunkten von KURS
function kursSoll(id, runde) {
  const p = KURS[id];
  if (runde <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (runde <= p[i][0]) {
      const a = p[i - 1];
      const b = p[i];
      return a[1] + (b[1] - a[1]) * (runde - a[0]) / (b[0] - a[0]);
    }
  }
  return p[p.length - 1][1];
}

// Alle Kennzahlen auf einer Skala von 0 bis 100 (beim Strandmüll: Müllpunkte)
function kennzahlPunkte(id, wert) {
  return id === "strandmuell" ? muellPunkte(wert) : wert;
}

// Kursgrad: 1 = auf oder über dem Sollkurs, 0 = KURS_TOLERANZ Punkte darunter
function kursGrad(id, wert, runde) {
  const luecke = kennzahlPunkte(id, kursSoll(id, runde)) - kennzahlPunkte(id, wert);
  return begrenzen(1 - luecke / KURS_TOLERANZ, 0, 1);
}

// Index jeder Säule (0 bis 100) in einer Momentaufnahme
function saeulenIndizes(s) {
  const index = {};
  Object.keys(SAEULEN_KENNZAHLEN).forEach(function (saeule) {
    const anteile = SAEULEN_KENNZAHLEN[saeule];
    index[saeule] = Object.keys(anteile).reduce(function (summe, id) {
      return summe + anteile[id] * 100 * kursGrad(id, s[id], s.runde);
    }, 0);
  });
  return index;
}

// Rundenscore: Mittelwert der drei Säulen, zur Hälfte aber durch die schwächste Säule gedeckelt
function scoreBerechnen(s) {
  const index = saeulenIndizes(s);
  const werte = Object.keys(index).map(function (id) { return index[id]; });
  const mittel = werte.reduce(function (a, b) { return a + b; }, 0) / werte.length;
  const schwaechste = Math.min.apply(null, werte);
  return runden1((1 - SAEULEN_SCHWAECHSTE) * mittel + SAEULEN_SCHWAECHSTE * schwaechste);
}

function momentaufnahme(z, runde) {
  const s = {
    runde: runde,
    meeresgesundheit: z.kennzahlen.meeresgesundheit,
    artenvielfalt: z.kennzahlen.artenvielfalt,
    wirtschaft: z.kennzahlen.wirtschaft,
    tourismus: z.kennzahlen.tourismus,
    akzeptanz: z.akzeptanz,
    strandmuell: z.strandmuell,
    eintrag: z.eintrag ? z.eintrag.gesamt : 0,
    budget: z.budget
  };
  const index = saeulenIndizes(s);
  s.saeulen = { oeko: runden1(index.oeko), oekonomie: runden1(index.oekonomie), sozial: runden1(index.sozial) };
  s.score = scoreBerechnen(s);
  return s;
}

// Nachhaltigkeitsscore: gewichteter Durchschnitt der Rundenscores (Gewicht je Level, siehe LEVEL)
function rundenGewicht(runde) {
  return aktuellesLevel(runde).gewicht;
}

function gesamtScore(z) {
  const gespielt = z.verlauf.filter(function (s) { return s.runde >= 1; });
  if (gespielt.length === 0) return null;
  const summe = gespielt.reduce(function (a, s) { return a + rundenGewicht(s.runde) * s.score; }, 0);
  const gewicht = gespielt.reduce(function (a, s) { return a + rundenGewicht(s.runde); }, 0);
  return runden1(summe / gewicht);
}

// Kennzahlen einer Säule, die in einer Momentaufnahme hinter dem Sollkurs liegen
function rueckstaende(s, saeuleId) {
  return Object.keys(SAEULEN_KENNZAHLEN[saeuleId]).filter(function (id) {
    return kursGrad(id, s[id], s.runde) < 1;
  }).map(function (id) {
    return { id: id, name: KENNZAHL_NAMEN[id], wert: s[id], soll: Math.round(kursSoll(id, s.runde)),
      einheit: id === "strandmuell" ? " Teile" : " %", hoeher: id !== "strandmuell" };
  });
}

// Schwächste Säule einer Momentaufnahme (bei Gleichstand die erste)
function schwaechsteSaeule(s) {
  return SAEULEN.slice().sort(function (a, b) { return s.saeulen[a.id] - s.saeulen[b.id]; })[0];
}

// Maßnahmen, die in einer Runde umgesetzt wurden
function massnahmenInRunde(z, runde) {
  const liste = [];
  Object.keys(z.umgesetzt).forEach(function (id) {
    if (z.umgesetzt[id].indexOf(runde) >= 0) liste.push(massnahmeFinden(id));
  });
  return liste;
}

// Die größten Konflikte des Spiels: Runden, in denen eine Säule deutlich nachgab,
// zusammen mit den Maßnahmen dieser Runde (Anlass für die Reflexion)
function konflikte(z, anzahl) {
  const liste = [];
  for (let i = 1; i < z.verlauf.length; i++) {
    const davor = z.verlauf[i - 1];
    const jetzt = z.verlauf[i];
    SAEULEN.forEach(function (sa) {
      const fall = davor.saeulen[sa.id] - jetzt.saeulen[sa.id];
      if (fall >= 8 && i > 1) {
        liste.push({ runde: jetzt.runde, saeule: sa, von: davor.saeulen[sa.id], auf: jetzt.saeulen[sa.id],
          fall: fall, grund: rueckstaende(jetzt, sa.id), massnahmen: massnahmenInRunde(z, jetzt.runde) });
      }
    });
  }
  return liste.sort(function (a, b) { return b.fall - a.fall; }).slice(0, anzahl || 3);
}

// Kompetenzprofil (vereinfachte Stealth Assessment): Aus dem Spielverhalten wird abgeleitet,
// wie gut jemand Nachhaltigkeit anwendet. Jede Kompetenz hat eine Messgröße (Beleg) und einen Wert 0 bis 100.
function kompetenzProfil(z) {
  const gespielt = z.verlauf.filter(function (s) { return s.runde >= 1; });
  const mittel = function (liste, f) {
    return liste.length ? liste.reduce(function (a, s) { return a + f(s); }, 0) / liste.length : 0;
  };
  const start = z.verlauf[0].eintrag;   // Müll-Eintrag zu Spielbeginn
  const ende = z.verlauf[z.verlauf.length - 1].eintrag;
  const senkung = begrenzen(1 - ende / start, 0, 1);
  const mitte = gespielt.filter(function (s) { return aktuellesLevel(s.runde).nr === 2; });
  const hoerte = z.anhoerung.gesamt ? 1 - z.anhoerung.zuSchnell / z.anhoerung.gesamt : 1;
  const wissen = wissensScore(z);
  const liste = [
    { id: "ursachen", name: "Ursachen statt Symptome",
      wert: Math.round(100 * begrenzen(senkung / 0.7, 0, 1)),
      beleg: "Der Müll-Eintrag pro Runde sank um " + Math.round(senkung * 100) + " % (Ziel: 70 %)." },
    { id: "vorausschauen", name: "Vorausschauend handeln",
      wert: Math.round(mittel(mitte, function (s) { return s.saeulen.oeko; })),
      beleg: "Ökologie lag in den Runden 4 bis 9, in denen frühere Maßnahmen wirken, zu " +
        Math.round(mittel(mitte, function (s) { return s.saeulen.oeko; })) + " % auf Kurs." },
    { id: "abwaegen", name: "Säulen abwägen",
      wert: Math.round(mittel(gespielt, function (s) { return Math.min(s.saeulen.oeko, s.saeulen.oekonomie, s.saeulen.sozial); })),
      beleg: "Die schwächste Säule lag im Schnitt bei " +
        Math.round(mittel(gespielt, function (s) { return Math.min(s.saeulen.oeko, s.saeulen.oekonomie, s.saeulen.sozial); })) +
        " von 100." },
    { id: "beteiligen", name: "Menschen mitnehmen",
      wert: Math.round(0.5 * mittel(gespielt, function (s) { return s.saeulen.sozial; }) + 0.5 * 100 * hoerte),
      beleg: "Soziales lag im Schnitt bei " + Math.round(mittel(gespielt, function (s) { return s.saeulen.sozial; })) +
        " von 100, " + (z.anhoerung.gesamt - z.anhoerung.zuSchnell) + " von " + z.anhoerung.gesamt + " Anliegen hast du aufmerksam gelesen." },
    { id: "wissen", name: "Wissen anwenden",
      wert: wissen === null ? 0 : Math.round(wissen),
      beleg: wissen === null ? "Keine Quizfrage beantwortet." : z.quiz.richtig + " von " + z.quiz.gestellt + " Quizfragen richtig." }
  ];
  return liste;
}

// Wissensscore: Anteil richtiger Antworten (Rundenquiz und Abschlussquiz)
function wissensScore(z) {
  if (!z.quiz.gestellt) return null;
  return runden1(100 * z.quiz.richtig / z.quiz.gestellt);
}

// Endergebnis = (1 − WISSEN_ANTEIL) × Nachhaltigkeit + WISSEN_ANTEIL × Wissen
function endScore(z) {
  const n = gesamtScore(z);
  const w = wissensScore(z);
  if (n === null) return null;
  if (w === null) return n;
  return runden1((1 - WISSEN_ANTEIL) * n + WISSEN_ANTEIL * w);
}

// Prüft die Mindestbedingungen in den letzten ZIEL_RUNDEN Runden
function zielAuswertung(z) {
  const pruefrunden = z.verlauf.filter(function (s) { return s.runde > RUNDEN - ZIEL_RUNDEN; });
  const details = ZIELE.map(function (ziel) {
    return {
      ziel: ziel,
      erfuellt: pruefrunden.length === ZIEL_RUNDEN && pruefrunden.every(ziel.pruefen)
    };
  });
  return {
    erreicht: details.every(function (d) { return d.erfuellt; }),
    details: details
  };
}

// Region, der eine Runde gewidmet ist (Strand → Meer → Land → Strand …)
function regionDerRunde(runde) {
  return REGIONEN_FOLGE[(runde - 1) % REGIONEN_FOLGE.length];
}

function bereichName(id) {
  return BEREICHE.find(function (b) { return b.id === id; }).name;
}

// Zeigt höchstens ANGEBOT_PRO_SAEULE Einträge; bei mehr rückt mit jedem
// Versatz ein anderer Ausschnitt nach. Reihenfolge bleibt erhalten.
function ausschnitt(offen, versatz) {
  if (offen.length <= ANGEBOT_PRO_SAEULE) return offen;
  const start = versatz % offen.length;
  const auswahl = [];
  for (let i = 0; i < ANGEBOT_PRO_SAEULE; i++) {
    auswahl.push(offen[(start + i) % offen.length]);
  }
  return offen.filter(function (m) { return auswahl.indexOf(m) >= 0; });
}

function offeneMassnahmen(z, filter) {
  return MASSNAHMEN.filter(function (m) {
    return filter(m) && (m.wiederholbar || !istUmgesetzt(z, m.id));
  });
}

// Angebot einer Säule in einer Runde.
// Ökologie: Maßnahmen der Region im Fokus, bei jedem Besuch rückt eine andere nach.
// Ökonomie und Soziales: wechselnder Ausschnitt aller offenen Maßnahmen.
function angebot(z, saeule, runde) {
  if (saeule === "oeko") {
    const region = regionDerRunde(runde);
    const offen = offeneMassnahmen(z, function (m) { return m.saeule === "oeko" && m.bereich === region; });
    return ausschnitt(offen, Math.floor((runde - 1) / REGIONEN_FOLGE.length));
  }
  const offen = offeneMassnahmen(z, function (m) { return m.saeule === saeule; });
  return ausschnitt(offen, runde - 1);
}

// Ab welcher Runde steht eine Maßnahme nach dieser Runde wieder zur Wahl? Gerechnet wird mit dem
// heutigen Stand (die aktuelle Auswahl gilt als umgesetzt); spätere Entscheidungen können das noch
// verschieben. Ökologie: nur in jeder dritten Runde, wenn ihr Bereich wieder an der Reihe ist.
// Ergebnis: Rundennummer oder null (bis Spielende nicht mehr im Angebot)
function naechstesAngebot(z, m) {
  const kopie = { umgesetzt: Object.assign({}, z.umgesetzt) };
  SAEULEN.forEach(function (s) {
    const id = z.auswahl[s.id];
    if (id && id !== ZURUECKSTELLEN) kopie.umgesetzt[id] = (kopie.umgesetzt[id] || []).concat([z.runde]);
  });
  const schritt = m.saeule === "oeko" ? REGIONEN_FOLGE.length : 1;
  for (let r = z.runde + schritt; r <= RUNDEN; r += schritt) {
    if (angebot(kopie, m.saeule, r).indexOf(m) >= 0) return r;
  }
  return null;
}

function istAngeboten(z, m) {
  return angebot(z, m.saeule, z.runde).indexOf(m) >= 0;
}

// Summe der geplanten Kosten, ohne die angegebene Säule
function geplanteKosten(z, ausserSaeule) {
  let summe = 0;
  SAEULEN.forEach(function (s) {
    const id = z.auswahl[s.id];
    if (s.id === ausserSaeule || !id || id === ZURUECKSTELLEN) return;
    const m = massnahmeFinden(id);
    if (m) summe += kostenBerechnen(z, m);
  });
  return summe;
}

function entscheidungenOffen(z) {
  return SAEULEN.filter(function (s) { return !z.auswahl[s.id]; });
}

// Wählt für jede Region dieser Runde das wichtigste Anliegen.
// Runde 1: alle drei Regionen, danach nur die Region der Runde.
function anliegenErstellen(z) {
  const regionen = z.runde === 1 ? REGIONEN_FOLGE.slice() : [regionDerRunde(z.runde)];
  const w = aktiveWirkung(z, z.runde);
  return regionen.map(function (region) {
    const passend = AUSSAGEN[region].filter(function (a) { return a.wenn(z, w); });
    const neu = passend.filter(function (a) { return z.gesagt.indexOf(region + ":" + a.id) < 0; });
    const auswahl = (neu.length ? neu : passend).slice().sort(function (a, b) { return b.prio - a.prio; })[0];
    z.gesagt.push(region + ":" + auswahl.id);
    return { region: region, aussage: auswahl.id, text: auswahl.text, gelesen: false, zuSchnell: false };
  });
}

function offeneAnliegen(z) {
  return z.anliegen.filter(function (a) { return !a.gelesen; });
}

function infopunktGelesen(z, id) {
  return z.infopunkteGelesen.indexOf(id) >= 0;
}

// Infopunkte der aktuellen Runde (nur in ihrer Runde sichtbar)
function sichtbareInfopunkte(z) {
  if (z.beendet) return [];
  return INFOPUNKTE.filter(function (p) { return p.runde === z.runde; });
}

// Pflicht-Infopunkte (Runde 1), die noch nicht gelesen sind
function pflichtInfosOffen(z) {
  if (z.runde !== INFOPUNKT_PFLICHT_RUNDE) return [];
  return sichtbareInfopunkte(z).filter(function (p) { return !infopunktGelesen(z, p.id); });
}

function rundeBereit(z) {
  return !z.beendet && pflichtInfosOffen(z).length === 0 && offeneAnliegen(z).length === 0 &&
    entscheidungenOffen(z).length === 0;
}

// Kann die Maßnahme gerade gewählt werden? Das Budget berücksichtigt die
// in den anderen Säulen geplanten Maßnahmen.
function massnahmeStatus(z, m) {
  if (!istAngeboten(z, m)) {
    return { moeglich: false, art: "nicht-angeboten", grund: "In dieser Runde nicht im Angebot" };
  }
  if (!m.wiederholbar && istUmgesetzt(z, m.id)) {
    return { moeglich: false, art: "fertig", grund: "Umgesetzt in Runde " + z.umgesetzt[m.id][0] };
  }
  if (m.einschraenkend && z.akzeptanz < AKZEPTANZ_SPERRE) {
    return { moeglich: false, art: "gesperrt", grund: "Gesperrt: Akzeptanz unter " + AKZEPTANZ_SPERRE + " %" };
  }
  if (z.budget - geplanteKosten(z, m.saeule) < kostenBerechnen(z, m)) {
    return { moeglich: false, art: "budget", grund: "Budget reicht nicht" };
  }
  return { moeglich: true, art: "", grund: "" };
}

// Prüfung beim Verbuchen (Akzeptanz vom Rundenbeginn, damit Anzeige und Rechnung übereinstimmen)
function buchbar(z, m, akzeptanzStart) {
  return istAngeboten(z, m) &&
    (m.wiederholbar || !istUmgesetzt(z, m.id)) &&
    !(m.einschraenkend && akzeptanzStart < AKZEPTANZ_SPERRE) &&
    z.budget >= kostenBerechnen(z, m);
}

// Wirkung in Klartext, z. B. "Müll von Strandbesuchern −40 %"
function wirkungBeschreiben(wirkung) {
  return Object.keys(wirkung).map(function (k) {
    const v = wirkung[k];
    if (k.indexOf("eintrag") === 0) {
      return WIRKUNG_TEXTE[k] + " " + vorzeichen(Math.round((v - 1) * 100)) + " %";
    }
    if (k === "reinigung") return WIRKUNG_TEXTE[k] + " " + Math.round(v * 100) + " %";
    if (k === "einnahmen") return WIRKUNG_TEXTE[k] + " " + vorzeichen(v) + " €";
    return WIRKUNG_TEXTE[k] + " " + vorzeichen(v);
  }).join(", ");
}

// Löst das geplante Ereignis der aktuellen Runde aus (falls vorhanden)
function ereignisAusloesen(z) {
  const id = z.ereignisPlan[z.runde];
  if (!id) {
    z.ereignis = null;
    return null;
  }
  const ereignis = EREIGNISSE.find(function (e) { return e.id === id; });
  const folge = ereignis.ausloesen(z);
  // Sofortfolgen fließen auch in den angezeigten Trend ein
  if (folge.strandmuell) {
    z.strandmuell += folge.strandmuell;
    z.trend.strandmuell = (z.trend.strandmuell || 0) + folge.strandmuell;
  }
  if (folge.akzeptanz) {
    const vorher = z.akzeptanz;
    z.akzeptanz = begrenzen(z.akzeptanz + folge.akzeptanz, 0, 100);
    z.trend.akzeptanz = (z.trend.akzeptanz || 0) + (z.akzeptanz - vorher);
  }
  if (folge.budget) z.budget += folge.budget;
  (folge.wirkungen || []).forEach(function (e) {
    z.effekte.push({
      quelle: ereignis.titel, massnahme: null,
      start: z.runde, ende: z.runde + e.dauer,
      wirkung: e.wirkung, popup: null, gemeldet: true
    });
  });
  if (folge.foerderaufruf) z.foerderaufruf = folge.foerderaufruf;
  z.ereignis = { id: id, titel: ereignis.titel, text: folge.text };
  return z.ereignis;
}

// Rechnet eine komplette Runde durch und liefert einen Bericht.
// Ablauf: Anhörung → Maßnahmen der drei Säulen verbuchen → aktive Wirkungen →
//         Müllbilanz → Kennzahlen → Einnahmen → Verlauf →
//         nächste Runde vorbereiten
function rundeAbschliessen(z, auswahl) {
  auswahl = auswahl || {};
  const r = z.runde;
  const vorher = momentaufnahme(z, r);
  const akzeptanzStart = z.akzeptanz;
  const bericht = {
    runde: r, entscheidungen: [],
    neuWirksam: [], ausgelaufen: [], foerderungen: [],
    ereignis: null, anhoerung: []
  };

  // 0. Anhörung: Wer Anliegen überflogen hat, verliert Akzeptanz
  z.anliegen.forEach(function (a) {
    const p = PERSONEN[a.region];
    z.anhoerung.gesamt += 1;
    if (a.zuSchnell) z.anhoerung.zuSchnell += 1;
    if (a.zuSchnell) z.akzeptanz = begrenzen(z.akzeptanz - ANHOERUNG_STRAFE, 0, 100);
    bericht.anhoerung.push({ person: p, region: a.region, zuSchnell: a.zuSchnell });
  });

  // 1. Maßnahmen der drei Säulen verbuchen
  let aktion = 0;   // Anteil des Strandmülls, den eine Aufräumaktion in dieser Runde entfernt
  SAEULEN.forEach(function (s) {
    const id = auswahl[s.id];
    const m = id && id !== ZURUECKSTELLEN ? massnahmeFinden(id) : null;
    if (!m || m.saeule !== s.id || !buchbar(z, m, akzeptanzStart)) {
      bericht.entscheidungen.push({ saeule: s, massnahme: null, erklaerung: "" });
      return;
    }
    z.budget -= kostenBerechnen(z, m);
    z.akzeptanz = begrenzen(z.akzeptanz + (m.akzeptanz || 0), 0, 100);
    aktion = Math.max(aktion, m.reinigung || 0);
    m.wirkungen.forEach(function (e) {
      const start = r + e.ab;
      z.effekte.push({
        quelle: m.name, massnahme: m.id,
        start: start, ende: e.dauer ? start + e.dauer : null,
        wirkung: e.wirkung, popup: e.popup || null, gemeldet: false
      });
    });
    if (!z.umgesetzt[m.id]) z.umgesetzt[m.id] = [];
    z.umgesetzt[m.id].push(r);
    bericht.entscheidungen.push({ saeule: s, massnahme: m, erklaerung: m.erklaerung(r) });
  });

  // 2. Wirkungen dieser Runde (inklusive der eben verbuchten)
  const w = aktiveWirkung(z, r);
  z.effekte.forEach(function (e) {
    if (e.start === r && !e.gemeldet) {
      e.gemeldet = true;
      bericht.neuWirksam.push({
        titel: e.popup ? e.popup.titel : e.quelle,
        text: e.popup ? e.popup.text : wirkungBeschreiben(e.wirkung)
      });
    }
    if (e.ende === r) bericht.ausgelaufen.push({ titel: e.quelle, text: wirkungBeschreiben(e.wirkung) });
  });

  // 3. Müllbilanz: Bestand − Reinigung − Abtrag + Eintrag
  //    Reinigung = Aufräumaktion und Strandreinigungsmaschine; beide wirken nacheinander
  const eintrag = eintragBerechnen(z, w);
  const bestand = z.strandmuell;
  const maschine = begrenzen(w.reinigung, 0, 0.9);
  const entfernt = Math.round(bestand * (1 - (1 - aktion) * (1 - maschine)));
  const abtrag = Math.round((bestand - entfernt) * MUELL_ABTRAG);
  const neu = Math.max(0, Math.round(bestand - entfernt - abtrag + eintrag.gesamt));
  bericht.muell = { runde: r, bestand: bestand, entfernt: entfernt, abtrag: abtrag, eintrag: eintrag, neu: neu };
  z.muellBilanz = bericht.muell;
  z.strandmuell = neu;

  // 4. Kennzahlen bewegen sich auf ihre Richtwerte zu
  const ziel = richtwerteBerechnen(z, w, neu, eintrag.gesamt);
  KENNZAHLEN.forEach(function (kz) {
    z.kennzahlen[kz.id] = schritt(z.kennzahlen[kz.id], ziel[kz.id], ANNAEHERUNG, MAX_AENDERUNG);
  });
  z.akzeptanz = schritt(z.akzeptanz, ziel.akzeptanz, AKZEPTANZ_ANNAEHERUNG, AKZEPTANZ_MAX_AENDERUNG);
  bericht.richtwerte = ziel;

  // 5. Einnahmen und Förderungen
  const einnahmen = einnahmenBerechnen(z);
  z.budget += einnahmen.summe;
  bericht.einnahmen = einnahmen;

  if (z.foerderaufruf) {
    const fa = z.foerderaufruf;
    if (istUmgesetzt(z, fa.massnahme)) {
      z.budget += fa.betrag;
      bericht.foerderungen.push("EU-Förderaufruf erfüllt: einmalig " + euro(fa.betrag) + ".");
      z.foerderaufruf = null;
    } else if (r >= fa.bisRunde) {
      bericht.foerderungen.push("EU-Förderaufruf verpasst: Die Frist ist abgelaufen.");
      z.foerderaufruf = null;
    }
  }

  // 6. Verlauf und Trend
  z.eintrag = eintrag;
  const nachher = momentaufnahme(z, r);
  z.verlauf.push(nachher);
  ["meeresgesundheit", "artenvielfalt", "wirtschaft", "tourismus", "akzeptanz", "strandmuell"]
    .forEach(function (id) { z.trend[id] = nachher[id] - vorher[id]; });
  bericht.vorher = vorher;
  bericht.nachher = nachher;

  // 7. Nächste Runde vorbereiten
  z.runde = r + 1;
  z.auswahl = leereAuswahl();
  z.zuletzt = null;
  if (z.runde > RUNDEN) {
    z.beendet = true;
    z.ereignis = null;
  } else {
    bericht.ereignis = ereignisAusloesen(z);
    z.eintrag = eintragBerechnen(z, aktiveWirkung(z, z.runde));
  }
  z.anliegen = z.beendet ? [] : anliegenErstellen(z);
  return bericht;
}

// ---------- Quiz ----------
function quizFuerRunde(runde) {
  return FRAGEN.filter(function (f) { return f.runde === runde; });
}

// Abschlussquiz: eine Frage zu jedem freiwilligen Infopunkt (ab Runde 2)
function abschlussFragen() {
  return INFOPUNKTE.filter(function (p) { return p.frage; }).map(function (p) {
    return Object.assign({ id: "ip_" + p.id, art: "infopunkt", infopunkt: p.id }, p.frage);
  });
}

function quizAntwortWerten(z, frage, index) {
  const ok = index === frage.richtig;
  z.quiz.gestellt += 1;
  if (ok) z.quiz.richtig += 1;
  z.quiz.ergebnisse.push({ id: frage.id, richtig: ok });
  return ok;
}
// ==========================================================
// 7. ANZEIGE
// ==========================================================
function el(id) {
  return document.getElementById(id);
}

function euro(betrag) {
  const b = Math.round(betrag);
  return (b < 0 ? "−" : "") + Math.abs(b).toLocaleString("de-DE") + " €";
}

function zahl(wert, stellen) {
  return Number(wert).toLocaleString("de-DE", { maximumFractionDigits: stellen || 0 });
}

function vorzeichen(wert) {
  if (wert > 0) return "+" + zahl(wert, 1);
  if (wert < 0) return "−" + zahl(Math.abs(wert), 1);
  return "±0";
}

// Farbe eines Balkens, gemessen am Mindestwert der Kennzahl
function ampelFarbe(wert, mindest) {
  if (wert >= mindest) return AMPEL.gruen;
  return wert >= mindest - AMPEL_ABSTAND ? AMPEL.gelb : AMPEL.rot;
}

// Akzeptanz: rot unterhalb der Sperre für einschränkende Maßnahmen
function akzeptanzFarbe(wert) {
  if (wert >= AKZEPTANZ_MINDEST) return AMPEL.gruen;
  return wert >= AKZEPTANZ_SPERRE ? AMPEL.gelb : AMPEL.rot;
}

function trendHtml(diff, hoeherIstBesser) {
  if (!diff) return "";
  const gut = hoeherIstBesser ? diff > 0 : diff < 0;
  return '<span class="trend ' + (gut ? "trend-gut" : "trend-schlecht") + '">' +
    (diff > 0 ? "▲" : "▼") + " " + zahl(Math.abs(diff), 1) + "</span>";
}

function alleAnzeigen() {
  kopfleisteAnzeigen();
  seekarteAnzeigen();
  markerAnzeigen();
  muellAnzeigen();
  kennzahlenAnzeigen();
  massnahmenAnzeigen();
  rundenKnopfAnzeigen();
}

function kopfleisteAnzeigen() {
  const z = zustand;
  const runde = Math.min(z.runde, RUNDEN);
  el("anzeigeRunde").textContent = runde;
  el("anzeigeLevel").textContent = z.beendet
    ? "Spiel beendet"
    : "Level " + aktuellesLevel(runde).nr + ": " + aktuellesLevel(runde).name;

  const leiste = el("rundenLeiste");
  leiste.innerHTML = "";
  for (let r = 1; r <= RUNDEN; r++) {
    const feld = document.createElement("span");
    feld.className = "runden-feld level-" + aktuellesLevel(r).nr;
    if (r < z.runde) {
      feld.classList.add("fertig");
    } else if (r === z.runde) {
      feld.classList.add("aktuell");
    }
    leiste.appendChild(feld);
  }

  const budget = el("anzeigeBudget");
  budget.textContent = euro(z.budget);
  budget.classList.toggle("im-minus", z.budget < 0);

  el("anzeigeAkzeptanz").textContent = z.akzeptanz + " %";
  const balken = el("akzeptanzBalken");
  balken.style.width = z.akzeptanz + "%";
  balken.style.backgroundColor = akzeptanzFarbe(z.akzeptanz);
}

// Strandmüll in der Kopfleiste: Zahl und Balken mit Markierung beim EU-Schwellenwert
const MUELL_SKALA = 300;   // Teile pro 100 m, die einem vollen Balken entsprechen

function muellProzent(teile) {
  return begrenzen(teile / MUELL_SKALA * 100, 0, 100);
}

function muellAnzeigen() {
  const z = zustand;
  el("anzeigeMuell").textContent = zahl(z.strandmuell);
  const fuellung = el("muellFuellung");
  fuellung.style.width = muellProzent(z.strandmuell) + "%";
  fuellung.classList.toggle("unter-schwelle", z.strandmuell < MUELL_SCHWELLE);
  el("muellSchwelle").style.left = muellProzent(MUELL_SCHWELLE) + "%";
  if (!el("popupMuell").classList.contains("versteckt")) el("muellInhalt").innerHTML = muellPopupHtml();
}

// Inhalt des Pop-ups „Strandmüll“: Bestand, neuer Müll pro Quelle, Bilanz der letzten Runde.
// Wird bei jedem Öffnen neu berechnet und passt sich so jeder Runde an.
function muellPopupHtml() {
  const z = zustand;
  const runde = Math.min(z.runde, RUNDEN);
  let html = '<div class="muell-stand">' +
    '<p class="muell-zahl"><strong>' + zahl(z.strandmuell) + "</strong><span>Teile pro 100 m Strand</span></p>" +
    '<p class="muell-trend">' + (z.trend.strandmuell
      ? trendHtml(z.trend.strandmuell, false) + " seit letzter Runde"
      : "Ausgangslage zu Spielbeginn") + "</p>" +
    '<div class="muell-skala" aria-hidden="true">' +
      '<span class="muell-fuellung' + (z.strandmuell < MUELL_SCHWELLE ? " unter-schwelle" : "") +
        '" style="width:' + muellProzent(z.strandmuell) + '%"></span>' +
      '<span class="muell-schwelle" style="left:' + muellProzent(MUELL_SCHWELLE) + '%"></span>' +
    "</div>" +
    '<p class="tafel-fuss"><span class="schwelle-zeichen" aria-hidden="true"></span>' +
    "EU-Schwellenwert für einen guten Umweltzustand: unter " + MUELL_SCHWELLE + " Teile</p></div>";

  html += '<section class="bericht-block"><h3>' + (z.beendet ? "Neuer Müll pro Runde zum Spielende" :
    "Neuer Müll in Runde " + runde) + "</h3>" +
    '<div class="eintrag-liste">' + QUELLEN.map(function (q) {
      const wert = z.eintrag[q.id];
      return '<div class="eintrag-zeile"><span class="eintrag-name">' + q.name + "</span>" +
        '<span class="eintrag-balken"><span style="width:' + begrenzen(wert / 40 * 100, 0, 100) + '%"></span></span>' +
        '<span class="eintrag-wert">' + zahl(wert, 1) + "</span></div>";
    }).join("") + "</div>" +
    '<p class="eintrag-summe">Zusammen <strong>' + zahl(z.eintrag.gesamt, 1) + "</strong> Teile pro 100 m</p>" +
    (z.beendet ? "" : '<p class="klein">Stand vor deinen Entscheidungen dieser Runde. Maßnahmen, die jetzt ' +
      "beschlossen werden, sind darin noch nicht enthalten.</p>") + "</section>";

  const b = z.muellBilanz;
  html += '<section class="bericht-block"><h3>' + (b ? "Bilanz von Runde " + b.runde : "Bilanz") + "</h3>";
  html += b ? bilanzHtml(b) : "<p>Nach der ersten Runde siehst du hier, wie sich der Bestand verändert hat.</p>";
  html += '<p class="tafel-fuss">Bestand der nächsten Runde = Bestand − Reinigung − natürlicher Abtrag ' +
    "(" + Math.round(MUELL_ABTRAG * 100) + " % des Rests) + neuer Müll</p></section>";
  return html;
}

function muellPopupZeigen() {
  el("muellInhalt").innerHTML = muellPopupHtml();
  el("muellInhalt").scrollTop = 0;
  popupOeffnen("popupMuell");
}

function kennzahlenErstellen() {
  const liste = el("kennzahlenListe");
  liste.innerHTML = "";
  KENNZAHLEN.forEach(function (k) {
    const zeile = document.createElement("div");
    zeile.className = "kennzahl";
    zeile.innerHTML =
      '<div class="kennzahl-kopf">' +
        '<span class="kennzahl-name">' + k.name + "</span>" +
        '<span class="kennzahl-wert" id="wert-' + k.id + '"></span>' +
      "</div>" +
      '<div class="balken">' +
        '<div class="balken-fuellung" id="balken-' + k.id + '"></div>' +
        '<div class="balken-ziel" style="left:' + k.mindest + '%" title="Mindestwert ' + k.mindest + ' %"></div>' +
      "</div>";
    liste.appendChild(zeile);
  });
}

function kennzahlenAnzeigen() {
  const z = zustand;
  KENNZAHLEN.forEach(function (k) {
    const wert = z.kennzahlen[k.id];
    const balken = el("balken-" + k.id);
    balken.style.width = wert + "%";
    balken.style.backgroundColor = ampelFarbe(wert, k.mindest);
    el("wert-" + k.id).innerHTML = trendHtml(z.trend[k.id], true) + "<strong>" + wert + " %</strong>";
  });
}

// ---------- Entscheidungsfenster ----------
// Drei gleich hohe Spalten (Ökologie, Ökonomie, Soziales). Jede Maßnahme ist eine Karte:
// Ein Klick klappt sie auf und zeigt Beschreibung, Leitfrage und die Bedeutung der Etiketten;
// gewählt wird erst mit dem Knopf in der aufgeklappten Karte. Es ist immer höchstens eine Karte offen.

// Symbol eines Bereichs (gleiche Linienführung wie die Seekarte, Farbe über currentColor)
function bereichSymbolSvg(region) {
  const linie = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  let inhalt;
  if (region === "strand") {
    // Sonnenschirm im Sand
    inhalt = '<path d="M4.5 11.5 A7.5 7.5 0 0 1 19.5 11.5 Z" fill="currentColor"/>' +
      '<path d="M12 11.5 V19" ' + linie + "/>" +
      '<path d="M2.5 20 Q12 16.5 21.5 20" ' + linie + "/>";
  } else if (region === "meer") {
    // drei Wellen
    inhalt = [7, 12, 17].map(function (y) {
      return '<path d="M2.5 ' + y + " q2.4 -2.6 4.8 0 t4.8 0 t4.8 0 t4.8 0" + '" ' + linie + "/>";
    }).join("");
  } else {
    // Baum und Haus auf festem Boden
    inhalt = '<circle cx="7.5" cy="9" r="4.2" fill="currentColor"/>' +
      '<path d="M7.5 12.5 V19.5" ' + linie + "/>" +
      '<path d="M13.5 19.5 V12.5 L17.5 9 L21.5 12.5 V19.5 Z" ' + linie + "/>" +
      '<path d="M2 19.5 H22" ' + linie + "/>";
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + inhalt + "</svg>";
}

// Kopf des Entscheidungsfensters: Bereich dieser Runde
function bereichBannerHtml(z, region) {
  const stil = BEREICH_STIL[region];
  return '<div class="bereich-banner" style="--bereich:' + stil.farbe + ";--bereich-flaeche:" + stil.flaeche + '">' +
      '<span class="bereich-symbol">' + bereichSymbolSvg(region) + "</span>" +
      '<span class="bereich-text">' +
        '<span class="bereich-label">Bereich dieser Runde</span>' +
        '<strong class="bereich-name">' + bereichName(region) + "</strong>" +
      "</span>" +
    "</div>";
}

function massnahmenAnzeigen() {
  const z = zustand;
  const runde = Math.min(z.runde, RUNDEN);
  const region = regionDerRunde(runde);

  // Hinweis auf offenen Förderaufruf (nur mit Sonderereignissen)
  const hinweis = el("foerderHinweis");
  if (z.foerderaufruf && !z.beendet) {
    const m = massnahmeFinden(z.foerderaufruf.massnahme);
    hinweis.textContent = "EU-Förderaufruf: „" + m.name + "“ bis Ende von Runde " +
      z.foerderaufruf.bisRunde + " umsetzen und " + euro(z.foerderaufruf.betrag) + " erhalten.";
    hinweis.classList.remove("versteckt");
  } else {
    hinweis.classList.add("versteckt");
  }

  // Bereich dieser Runde steht im Kopf über allen drei Spalten
  el("bereichAnzeige").innerHTML = z.beendet ? "" : bereichBannerHtml(z, region);

  const liste = el("massnahmenListe");
  liste.innerHTML = "";

  SAEULEN.forEach(function (s) {
    // Drei Zeilen je Spalte (Kopf, Maßnahmen, „Nichts tun“). Über CSS-Subgrid liegen sie in allen
    // Spalten auf gleicher Höhe, und alle Spalten sind gleich hoch.
    const gruppe = elementBauen("section", "saeule saeule-" + s.id);
    gruppe.setAttribute("aria-label", s.name);
    const entschieden = Boolean(z.auswahl[s.id]);

    const kopf = elementBauen("div", "saeule-kopf");
    const titel = elementBauen("div", "saeule-titelzeile");
    titel.appendChild(elementBauen("h3", "saeule-titel", s.name));
    titel.appendChild(elementBauen("span", "saeule-status " + (entschieden ? "fertig" : "offen"),
      entschieden ? "entschieden" : "offen"));
    kopf.appendChild(titel);
    kopf.appendChild(elementBauen("p", "saeule-untertitel", s.untertitel));
    gruppe.appendChild(kopf);

    const stapel = elementBauen("div", "saeule-optionen");
    const optionen = angebot(z, s.id, runde);
    optionen.forEach(function (m) { stapel.appendChild(massnahmeKarte(m)); });
    if (s.id === "oeko") {
      const erledigt = MASSNAHMEN.filter(function (m) {
        return m.saeule === "oeko" && m.bereich === region && !m.wiederholbar && istUmgesetzt(z, m.id);
      });
      if (erledigt.length) {
        stapel.appendChild(elementBauen("p", "gruppe-notiz", "Bereits umgesetzt: " +
          erledigt.map(function (m) { return m.name; }).join(", ") + "."));
      }
    }
    if (!optionen.length) {
      stapel.appendChild(elementBauen("p", "gruppe-notiz", "In diesem Bereich sind alle Maßnahmen umgesetzt."));
    }
    gruppe.appendChild(stapel);

    const fuss = elementBauen("div", "saeule-fuss");
    fuss.appendChild(zurueckKarte(s));
    gruppe.appendChild(fuss);

    liste.appendChild(gruppe);
  });

  uebersichtAnzeigen();
}

// Etikett zur Verfügbarkeit: Muss ich mich jetzt entscheiden, oder kommt die Maßnahme wieder?
function zeitMerkmal(z, m, status, gewaehlt) {
  if (z.beendet || z.runde >= RUNDEN || gewaehlt || status.art === "fertig" || status.art === "nicht-angeboten") {
    return null;
  }
  const wieder = naechstesAngebot(z, m);
  if (wieder === null) {
    return { text: "letzte Gelegenheit", art: "zeit",
      erklaerung: "Letzte Gelegenheit: Nach dieser Runde steht die Maßnahme voraussichtlich nicht mehr zur Wahl." };
  }
  if (m.saeule === "oeko") {
    return { text: "wieder in Runde " + wieder, art: "zeit",
      erklaerung: "Wieder in Runde " + wieder + ": Maßnahmen für den Bereich " + bereichName(m.bereich) +
        " stehen nur in jeder dritten Runde zur Wahl." };
  }
  if (wieder > z.runde + 1) {
    return { text: "nur diese Runde", art: "zeit",
      erklaerung: "Nur diese Runde: Das Angebot wechselt. Voraussichtlich steht die Maßnahme erst in Runde " +
        wieder + " wieder zur Wahl." };
  }
  return null;
}

// Gemeinsamer Aufbau jeder Karte: Kopf (Knopf zum Aufklappen) und aufklappbarer Inhalt
function karteBauen(k) {
  const z = zustand;
  const offen = z.zuletzt === k.schluessel;
  const karte = elementBauen("div", "massnahme" + (k.klasse ? " " + k.klasse : ""));
  if (k.gewaehlt) karte.classList.add("gewaehlt");
  if (offen) karte.classList.add("offen");
  const detailId = "karte-" + k.schluessel.replace(/[^a-z0-9]/gi, "-");

  const kopf = document.createElement("button");
  kopf.type = "button";
  kopf.className = "massnahme-kopfknopf";
  kopf.setAttribute("aria-expanded", offen ? "true" : "false");
  kopf.setAttribute("aria-controls", detailId);
  kopf.dataset.karte = k.schluessel;
  kopf.innerHTML =
    '<span class="massnahme-kopf">' +
      '<span class="massnahme-name">' + k.name + "</span>" +
      '<span class="massnahme-kosten">' + k.kosten + "</span>" +
      '<span class="massnahme-pfeil" aria-hidden="true"></span>' +
    "</span>" +
    (k.merkmale.length ? '<span class="massnahme-merkmale">' + k.merkmale.map(function (t) {
      return '<span class="merkmal' + (t.art ? " merkmal-" + t.art : "") + '">' + t.text + "</span>";
    }).join("") + "</span>" : "") +
    (k.gewaehlt ? '<span class="massnahme-gewaehlt">Ausgewählt</span>'
      : k.grund ? '<span class="massnahme-status">' + k.grund + "</span>" : "");
  kopf.addEventListener("click", function () { karteUmschalten(k.schluessel); });
  karte.appendChild(kopf);

  const detail = elementBauen("div", "massnahme-detail");
  detail.id = detailId;
  detail.hidden = !offen;
  if (offen) {
    const erklaerungen = k.merkmale.filter(function (t) { return t.erklaerung; });
    detail.innerHTML =
      '<p class="massnahme-text">' + k.text + "</p>" +
      (k.frage ? '<p class="massnahme-frage">' + k.frage + "</p>" : "") +
      (erklaerungen.length ? '<ul class="merkmal-erklaerung">' + erklaerungen.map(function (t) {
        return "<li>" + t.erklaerung + "</li>";
      }).join("") + "</ul>" : "");
    const aktion = elementBauen("div", "massnahme-aktion");
    const waehlen = document.createElement("button");
    waehlen.type = "button";
    waehlen.className = (k.gewaehlt ? "knopf-sekundaer" : "knopf-primaer") + " knopf-klein";
    waehlen.textContent = k.gewaehlt ? "Auswahl aufheben" : k.waehlenText;
    waehlen.disabled = z.beendet || (!k.gewaehlt && !k.moeglich);
    waehlen.dataset.waehlen = k.schluessel;
    waehlen.addEventListener("click", k.aktion);
    aktion.appendChild(waehlen);
    if (!k.gewaehlt && !k.moeglich && k.grund) {
      aktion.appendChild(elementBauen("span", "massnahme-grund", k.grund));
    }
    detail.appendChild(aktion);
  }
  karte.appendChild(detail);
  return karte;
}

function massnahmeKarte(m) {
  const z = zustand;
  const status = massnahmeStatus(z, m);
  const gewaehlt = z.auswahl[m.saeule] === m.id;

  const merkmale = [];
  if (m.laufendeKosten) {
    merkmale.push({ text: "+" + euro(m.laufendeKosten) + " pro Runde",
      erklaerung: "Folgekosten: Nach der Umsetzung kostet die Maßnahme jede Runde " + euro(m.laufendeKosten) + "." });
  }
  if (m.wiederholbar) {
    merkmale.push({ text: "wiederholbar",
      erklaerung: "Wiederholbar: Du kannst die Maßnahme mehrmals umsetzen." +
        (m.kostenAnstieg ? " Jede weitere Umsetzung kostet " + euro(m.kostenAnstieg) + " mehr (vor Rabatten)." : "") });
  }
  if (m.einschraenkend) {
    merkmale.push({ text: "einschränkend",
      erklaerung: "Einschränkend: Die Maßnahme setzt Regeln durch und kostet Zustimmung. Sie ist nur ab " +
        AKZEPTANZ_SPERRE + " % Akzeptanz möglich." });
  }
  if (z.foerderaufruf && z.foerderaufruf.massnahme === m.id) {
    merkmale.push({ text: "gefördert",
      erklaerung: "Gefördert: Setzt du die Maßnahme bis Ende von Runde " + z.foerderaufruf.bisRunde +
        " um, erhältst du " + euro(z.foerderaufruf.betrag) + " aus dem EU-Förderaufruf." });
  }
  if (m.wiederholbar && istUmgesetzt(z, m.id)) merkmale.push({ text: z.umgesetzt[m.id].length + "× umgesetzt" });
  const zeit = zeitMerkmal(z, m, status, gewaehlt);
  if (zeit) merkmale.push(zeit);

  return karteBauen({
    schluessel: m.id,
    klasse: (status.art ? "status-" + status.art : "") + (!status.moeglich && !gewaehlt ? " nicht-waehlbar" : ""),
    name: m.name,
    kosten: euro(kostenBerechnen(z, m)),
    merkmale: merkmale,
    gewaehlt: gewaehlt,
    moeglich: status.moeglich,
    grund: status.grund,
    text: m.beschreibung,
    frage: m.teaser,
    waehlenText: "Maßnahme wählen",
    aktion: function () { massnahmeWaehlen(m.id); }
  });
}

// Karte „Nichts tun“: in dieser Säule bewusst nichts umsetzen
function zurueckKarte(s) {
  const z = zustand;
  return karteBauen({
    schluessel: ZURUECKSTELLEN + ":" + s.id,
    klasse: "zurueck",
    name: "Nichts tun",
    kosten: euro(0),
    merkmale: [],
    gewaehlt: z.auswahl[s.id] === ZURUECKSTELLEN,
    moeglich: true,
    grund: "",
    text: "Du setzt in diesem Bereich in dieser Runde nichts um und sparst das Budget. " +
      "Laufende Wirkungen und Folgekosten gelten weiter.",
    frage: "",
    waehlenText: "Nichts tun wählen",
    aktion: function () { zurueckstellen(s.id); }
  });
}

// Aufklappen und Zuklappen: Ein Klick auf eine andere Karte schließt die offene
function karteUmschalten(schluessel) {
  const z = zustand;
  z.zuletzt = z.zuletzt === schluessel ? null : schluessel;
  massnahmenAnzeigen();
  fokusAuf('[data-karte="' + schluessel + '"]');
}

// Nach dem Neuzeichnen den Tastaturfokus wieder auf denselben Knopf setzen
function fokusAuf(selektor) {
  const ziel = el("massnahmenListe").querySelector(selektor);
  if (ziel) ziel.focus({ preventScroll: true });
}

function uebersichtAnzeigen() {
  const z = zustand;
  const feld = el("auswahlUebersicht");
  if (z.beendet) {
    feld.innerHTML = "";
    return;
  }
  const entschieden = SAEULEN.length - entscheidungenOffen(z).length;
  const kosten = geplanteKosten(z, null);
  feld.innerHTML =
    '<span class="uebersicht-zaehler' + (entschieden === SAEULEN.length ? " komplett" : "") + '">' +
      entschieden + " von " + SAEULEN.length + " entschieden</span>" +
    '<span class="uebersicht-kosten">Kosten <strong>' + euro(kosten) + "</strong> · danach <strong" +
      (z.budget - kosten < 0 ? ' class="im-minus"' : "") + ">" + euro(z.budget - kosten) + "</strong></span>";
}

function rundenKnopfAnzeigen() {
  const z = zustand;
  const knopf = el("naechsteRunde");
  const pflicht = pflichtInfosOffen(z);
  const offen = offeneAnliegen(z);
  const saeulenOffen = entscheidungenOffen(z);
  knopf.disabled = !rundeBereit(z);
  knopf.textContent = z.beendet ? "Spiel beendet"
    : z.runde === RUNDEN ? "Letzte Runde beenden" : "Runde " + z.runde + " beenden";

  // Hinweis unter dem Knopf: was noch fehlt
  const hinweis = el("anhoerungHinweis");
  const ueberflogen = z.anliegen.filter(function (a) { return a.zuSchnell; });
  hinweis.className = "anhoerung-hinweis";
  if (z.beendet) {
    hinweis.textContent = "";
  } else if (pflicht.length) {
    hinweis.textContent = "Lies zuerst die Infopunkte zu " +
      namenListe(pflicht.map(function (p) { return bereichName(p.region); })) +
      ". Klicke dazu auf die blauen i-Zeichen in der Karte.";
  } else if (offen.length) {
    const namen = offen.map(function (a) { return PERSONEN[a.region].name; });
    hinweis.textContent = "Hör dir an, was " + namenListe(namen) +
      (offen.length > 1 ? " zu sagen haben" : " zu sagen hat") + ". Klicke dazu auf die Sprechblase in der Karte.";
  } else if (saeulenOffen.length) {
    hinweis.textContent = "Noch offen: " + namenListe(saeulenOffen.map(function (s) { return s.name; })) +
      ". Wähle eine Maßnahme oder stelle den Bereich zurück.";
  } else if (ueberflogen.length) {
    hinweis.classList.add("warnung");
    hinweis.textContent = namenListe(ueberflogen.map(function (a) { return PERSONEN[a.region].name; })) +
      (ueberflogen.length > 1 ? " fühlen" : " fühlt") + " sich übergangen. Am Rundenende sinkt die Akzeptanz um " +
      ANHOERUNG_STRAFE * ueberflogen.length + " Punkte.";
  } else {
    hinweis.textContent = quizFuerRunde(z.runde).length
      ? "Alles entschieden. Zum Rundenende wartet ein kurzes Quiz."
      : "Alles entschieden.";
  }
}

function namenListe(namen) {
  if (namen.length <= 1) return namen.join("");
  return namen.slice(0, -1).join(", ") + " und " + namen[namen.length - 1];
}

// ---------- Marker auf der Seekarte: Infopunkte und Personen ----------
// Einfache Figur mit Kopf, Haaren, Armen und Beinen. Ein Erkennungsmerkmal pro Person:
// Merle (Kiosk) trägt eine Schürze, Jannik (Kutter) Südwester und Ölzeug, Ole (Gewerbegebiet)
// Schutzhelm und Warnstreifen. Licht von links oben wie im Titelbild: rechte Körperhälfte etwas dunkler.
const FIGUR_STIL = {
  kiosk:    { haut: "#F2D2B6", haare: "#8A4B2A", hose: "#3C5A78" },
  fischer:  { haut: "#EBC6A4", haare: "#6B4A2E", hose: "#E2A92B" },
  arbeiter: { haut: "#F0CDAE", haare: "#4A3524", hose: "#4A4F57" }
};

function figurSvg(person) {
  const stil = FIGUR_STIL[person.kleidung] || FIGUR_STIL.kiosk;
  const farbe = person.farbe;
  const tinte = "#12304A";
  const linie = ' stroke="' + tinte + '" stroke-width="0.9" stroke-linejoin="round"';
  const arm = function (d) {
    return '<path d="' + d + '" fill="none" stroke="' + tinte + '" stroke-width="3.1" stroke-linecap="round"/>' +
      '<path d="' + d + '" fill="none" stroke="' + farbe + '" stroke-width="1.6" stroke-linecap="round"/>';
  };
  let s = '<svg class="person-figur" viewBox="0 0 20 30" aria-hidden="true" focusable="false">';
  // Schatten am Boden (Licht von links oben)
  s += '<ellipse cx="11" cy="29" rx="6.2" ry="1.1" fill="#0B2238" opacity="0.22"/>';
  // Beine und Schuhe
  s += '<path d="M6.8,20.5 L7,28.2 L9.6,28.2 L9.7,22.4 L10.3,22.4 L10.4,28.2 L13,28.2 L13.2,20.5 Z" fill="' + stil.hose + '"' + linie + "/>";
  s += '<path d="M6.6,28.6 H9.8 M10.2,28.6 H13.4" stroke="' + tinte + '" stroke-width="1.4" stroke-linecap="round"/>';
  // Arme hinter dem Körper, Hände
  s += arm("M5.6,13.6 Q3.9,17 4.5,20.6") + arm("M14.4,13.6 Q16.1,17 15.5,20.6");
  s += '<circle cx="4.5" cy="21.2" r="1.15" fill="' + stil.haut + '"' + linie.replace("0.9", "0.7") + "/>" +
    '<circle cx="15.5" cy="21.2" r="1.15" fill="' + stil.haut + '"' + linie.replace("0.9", "0.7") + "/>";
  // Oberkörper mit Schattenseite rechts
  s += '<path d="M5.2,21.6 L5.3,15 Q5.5,11.7 10,11.5 Q14.5,11.7 14.7,15 L14.8,21.6 Z" fill="' + farbe + '"' + linie + "/>";
  s += '<path d="M10.6,11.6 Q14.4,11.9 14.6,15 L14.7,21.2 L11.4,21.2 Q12.4,16 10.6,11.6 Z" fill="#0B2238" opacity="0.14"/>';
  if (person.kleidung === "kiosk") {
    // Schürze mit Träger und Tasche
    s += '<path d="M7.2,15.2 H12.8 L13.2,21.8 H6.8 Z" fill="#FBF8F1"' + linie.replace("0.9", "0.6") + "/>" +
      '<path d="M7.6,15.2 L8.6,12 M12.4,15.2 L11.4,12" stroke="#FBF8F1" stroke-width="0.8"/>' +
      '<path d="M8.6,18.4 H11.4 V20 H8.6 Z" fill="none" stroke="' + farbe + '" stroke-width="0.5"/>';
  } else if (person.kleidung === "fischer") {
    // Latzhose aus gelbem Ölzeug über dem blauen Pullover
    s += '<path d="M7,16 H13 L13.2,21.8 H6.8 Z" fill="' + stil.hose + '"' + linie.replace("0.9", "0.6") + "/>" +
      '<path d="M7.6,16 L7.4,12.4 M12.4,16 L12.6,12.4" stroke="' + stil.hose + '" stroke-width="0.9"/>';
  } else {
    // Warnstreifen auf der Arbeitsjacke
    s += '<path d="M5.4,17.2 H14.6 M5.4,19.4 H14.6" stroke="#F1E9A8" stroke-width="0.9"/>';
  }
  // Hals und Kopf
  s += '<rect x="9" y="9.6" width="2" height="2.4" fill="' + stil.haut + '"/>';
  s += '<circle cx="10" cy="6.6" r="4.2" fill="' + stil.haut + '"' + linie + "/>";
  s += '<circle cx="8.5" cy="6.9" r="0.45" fill="' + tinte + '"/><circle cx="11.5" cy="6.9" r="0.45" fill="' + tinte + '"/>' +
    '<path d="M8.9,8.6 Q10,9.3 11.1,8.6" fill="none" stroke="' + tinte + '" stroke-width="0.5" stroke-linecap="round"/>';
  if (person.kleidung === "kiosk") {
    // Haare mit Zopf
    s += '<path d="M14,4.6 Q16.8,6.2 15.6,10.2" fill="none" stroke="' + stil.haare + '" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M5.8,6.4 Q5.8,2 10,2.2 Q14.2,2 14.2,6.4 Q12.8,4 10,4.2 Q7.2,4 5.8,6.4 Z" fill="' + stil.haare + '"' + linie.replace("0.9", "0.6") + "/>";
  } else if (person.kleidung === "fischer") {
    // Bart und Südwester
    s += '<path d="M6.3,7.8 Q10,12.4 13.7,7.8 Q12.8,9.9 10,10 Q7.2,9.9 6.3,7.8 Z" fill="' + stil.haare + '"/>' +
      '<path d="M8.9,8.7 Q10,9.2 11.1,8.7" fill="none" stroke="' + stil.haut + '" stroke-width="0.6" stroke-linecap="round"/>';
    s += '<path d="M5.2,5.4 Q5.4,1 10,1.1 Q14.6,1 14.8,5.4 Q17.4,5.9 17.2,6.8 Q10,5.6 2.8,6.8 Q2.6,5.9 5.2,5.4 Z" fill="#E2A92B"' +
      linie.replace("0.9", "0.7") + "/>";
  } else {
    // Schutzhelm
    s += '<path d="M5.5,5.4 Q5.5,1 10,1 Q14.5,1 14.5,5.4 Z" fill="#E8662A"' + linie.replace("0.9", "0.7") + "/>" +
      '<path d="M4.2,5.6 H15.8" stroke="' + tinte + '" stroke-width="1.4" stroke-linecap="round"/>' +
      '<path d="M4.4,5.5 H15.6" stroke="#E8662A" stroke-width="0.6" stroke-linecap="round"/>' +
      '<path d="M8,2.6 Q9,1.8 10.4,1.8" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="0.6" stroke-linecap="round"/>';
  }
  return s + "</svg>";
}

// Knopf über der Karte; ort.x/ort.y in Prozent der Kartenbreite/-höhe
function kartenKnopf(klasse, ort, label, html, aktion) {
  const knopf = elementBauen("button", klasse);
  knopf.type = "button";
  knopf.style.left = ort.x + "%";
  knopf.style.top = ort.y + "%";
  knopf.setAttribute("aria-label", label);
  knopf.innerHTML = html;
  knopf.addEventListener("click", aktion);
  return knopf;
}

function markerAnzeigen() {
  const z = zustand;
  const ebene = el("personen");
  ebene.innerHTML = "";

  // Infopunkte der Runde (Runde 1: einer pro Gebiet, danach einer im Gebiet der Runde)
  sichtbareInfopunkte(z).forEach(function (p) {
    const gelesen = infopunktGelesen(z, p.id);
    const gebiet = bereichName(p.region);
    ebene.appendChild(kartenKnopf("marker " + (gelesen ? "gelesen" : "ungelesen"), p,
      "Infopunkt " + gebiet + (gelesen ? " (gelesen, erneut öffnen)" : " öffnen"),
      '<span class="marker-zeichen" aria-hidden="true">' + (gelesen ? "✓" : "i") + "</span>" +
      '<span class="marker-name" aria-hidden="true">' + gebiet + "</span>",
      function () { infopunktOeffnen(p.id); }));
  });

  // Otter mit dem Zwischenstand (freiwillig, auch vor den Infopunkten anklickbar)
  if (otterDa(z)) {
    const gelesen = z.otterGelesen.indexOf(z.runde) >= 0;
    ebene.appendChild(kartenKnopf("person otter " + (gelesen ? "gelesen" : "ungelesen"), OTTER_ORT,
      gelesen ? "Otter: Zwischenstand noch einmal ansehen" : "Otter: Zwischenstand ansehen",
      '<span class="person-blase" aria-hidden="true">' + (gelesen ? "✓" : "!") + "</span>" + otterSvg() +
      '<span class="person-name" aria-hidden="true">Otter</span>',
      otterOeffnen));
  }

  // Personen erst, wenn die Pflicht-Infopunkte gelesen sind
  if (pflichtInfosOffen(z).length) return;
  z.anliegen.forEach(function (a, index) {
    const p = PERSONEN[a.region];
    const wer = p.name + " (" + bereichName(a.region) + ")";
    const knopf = kartenKnopf("person " + (a.gelesen ? "gelesen" : "ungelesen"), p,
      a.gelesen ? wer + ": Anliegen gehört" : "Anliegen von " + wer + " anhören",
      '<span class="person-blase" aria-hidden="true">' + (a.gelesen ? "✓" : "…") + "</span>" + figurSvg(p) +
      '<span class="person-name" aria-hidden="true">' + p.name + "</span>",
      function () { anliegenOeffnen(index); });
    knopf.disabled = a.gelesen;
    ebene.appendChild(knopf);
  });
}

// ==========================================================
// 8. SEEKARTE (SVG)
// ==========================================================
// Die Karte zeigt den Zustand der Region: Wasserfarbe = Meeresgesundheit,
// Müllsymbole an Strand und Land = Strandmüll und Eintrag, gebündelt an den Verursachern (Glas bei der
// Industrie, Essensreste bei den Hotels, Plastik an Flussmündung und Kiosk), Müll im Fluss und
// schwimmender Plastikmüll = Eintrag, Fische = Artenvielfalt.
// Beschriftet sind nur Fabrik, große Hotels und der Kiosk; die Legende steht darunter.
const KARTE_B = 800;
const KARTE_H = 320;
const STRAND_BREITE = 22;

function kuestenlinie(x) {
  return 104 + 9 * Math.sin(x / 95) + 5 * Math.sin(x / 41 + 1);
}

function linienPunkte(versatz) {
  const p = [];
  for (let x = 0; x <= KARTE_B; x += 10) {
    p.push(x + "," + (kuestenlinie(x) + versatz).toFixed(1));
  }
  return p.join(" ");
}

// Gleiche Startzahl = gleiche Folge: Symbole springen nicht von Runde zu Runde
function zufallsfolge(startwert) {
  let s = startwert;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function mischfarbe(a, b, t) {
  return "rgb(" + a.map(function (c, i) { return Math.round(c + (b[i] - c) * t); }).join(",") + ")";
}

// Wasserfarbe nach Meeresgesundheit: trübes Graugrün (schlecht) bis klares Blau wie im Titelbild (gut).
// flach = am Ufer, tief = offene See
function meerFarben(meeresgesundheit) {
  const t = begrenzen((meeresgesundheit - 25) / 65, 0, 1);
  return {
    flach: mischfarbe([164, 180, 150], [98, 166, 206], t),
    tief: mischfarbe([104, 128, 112], [36, 92, 136], t)
  };
}

// ---------- Hilfsfunktionen für die Kartengrafiken ----------

// Verlauf des Flusses als zwei Bézier-Abschnitte [Start, Kontrolle 1, Kontrolle 2, Ende].
// Lage s im Fluss: 0 = Quelle (oben), 1 = Ende des ersten Abschnitts, 2 = Mündung.
const FLUSS_ABSCHNITTE = [
  [[146, -4], [118, 26], [206, 44], [176, 70]],
  [[176, 70], [146, 96], [196, kuestenlinie(196) + STRAND_BREITE - 18], [196, kuestenlinie(196) + STRAND_BREITE + 4]]
];

// Mit „Flussaue renaturieren“ (aue = true) schlängelt sich der Fluss: Die Mitte schwingt quer zur
// Flussrichtung, zur Mündung hin läuft die Schwingung aus, damit die Mündung an ihrem Platz bleibt.
const MAEANDER = { weite: 11, wellen: 1.75 };

// Grundverlauf (ohne Mäander) an der Stelle t als [x, y]
function flussGrund(t) {
  const a = FLUSS_ABSCHNITTE[Math.min(1, Math.floor(t))];
  const u = t - Math.min(1, Math.floor(t));
  const v = 1 - u;
  return [0, 1].map(function (k) {
    return v * v * v * a[0][k] + 3 * v * v * u * a[1][k] + 3 * v * u * u * a[2][k] + u * u * u * a[3][k];
  });
}

// Normierte Richtung zwischen zwei Punkten
function richtung(p1, p2) {
  const l = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
  return [(p2[0] - p1[0]) / l, (p2[1] - p1[1]) / l];
}

// Punkt auf der Flussmitte an der Stelle s, mit normierter Flussrichtung (rx, ry)
function flussPunkt(s, aue) {
  const h = 0.01;
  const lage = function (t) {
    const b = flussGrund(t);
    if (!aue) return b;
    const d = richtung(flussGrund(Math.max(0, t - h)), flussGrund(Math.min(2, t + h)));
    const aus = MAEANDER.weite * Math.sin(t * Math.PI * 2 * MAEANDER.wellen) * Math.min(1, (2 - t) / 0.45);
    return [b[0] - d[1] * aus, b[1] + d[0] * aus];
  };
  const p = lage(s);
  const d = richtung(lage(Math.max(0, s - h)), lage(Math.min(2, s + h)));
  return { x: p[0], y: p[1], rx: d[0], ry: d[1], s: s };
}

// Breite des Flusses an der Stelle s (0 = Quelle oben, 2 = Mündung): zum Meer hin breiter,
// an der Mündung öffnet er sich trichterförmig
function flussBreite(s) {
  return 9 + 2.6 * s + 11 * Math.pow(Math.max(0, (s - 1.55) / 0.45), 2);
}

// Punkte entlang der Flussmitte, schritte pro Abschnitt (fein genug für weiche Ufer)
function flussMitte(schritte, aue) {
  const punkte = [];
  for (let k = 0; k <= 2 * schritte; k++) punkte.push(flussPunkt(k / schritte, aue));
  return punkte;
}

// Umriss des Flusses als geschlossene Punktliste: halbe Breite × faktor + zusatz zu beiden Seiten.
// Das Ufer schwingt leicht, damit es natürlich wirkt.
function flussUmriss(faktor, zusatz, aue) {
  const links = [];
  const rechts = [];
  flussMitte(aue ? 30 : 14, aue).forEach(function (p) {
    const halb = flussBreite(p.s) / 2 * faktor + zusatz;
    const welle = 0.5 * Math.sin(p.s * 23) * faktor;
    links.push([p.x - p.ry * (halb + welle), p.y + p.rx * (halb + welle)]);
    rechts.push([p.x + p.ry * (halb - welle), p.y - p.rx * (halb - welle)]);
  });
  return links.concat(rechts.reverse());
}

// Offene Linie parallel zu einem Ufer (seite 1 = links, -1 = rechts), abstand vom Ufer nach außen (+) oder innen (-)
function flussUferLinie(seite, abstand, aue) {
  return "M" + flussMitte(aue ? 30 : 14, aue).map(function (p) {
    const halb = (flussBreite(p.s) / 2 + abstand) * seite;
    return (p.x - p.ry * halb).toFixed(1) + "," + (p.y + p.rx * halb).toFixed(1);
  }).join(" L");
}

// Geschlossene, weiche Umrisslinie durch alle Punkte (Catmull-Rom als Bézier-Pfad)
function glatterPfad(punkte) {
  const n = punkte.length;
  let d = "M" + punkte[0][0].toFixed(1) + "," + punkte[0][1].toFixed(1);
  for (let i = 0; i < n; i++) {
    const p0 = punkte[(i - 1 + n) % n];
    const p1 = punkte[i];
    const p2 = punkte[(i + 1) % n];
    const p3 = punkte[(i + 2) % n];
    d += " C" + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + "," + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) +
      " " + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + "," + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) +
      " " + p2[0].toFixed(1) + "," + p2[1].toFixed(1);
  }
  return d + " Z";
}

// Abwasserfahne: beginnt schmal am Rohr, wird weiter draußen breiter und
// franst unregelmäßig aus. groesse = Belastung durch Abwasser (Punkte).
function abwasserFahneSvg(ox, oy, groesse) {
  const laenge = Math.min(2 * (26 + groesse * 3.2), (KARTE_H - 8 - oy) * 1.07);   // doppelte Größe, endet vor dem Kartenrand
  const breite = 2 * (8 + groesse * 1.5);         // halbe Breite an der breitesten Stelle
  const ax = -0.38;                                // Fahne treibt leicht nach links
  const ay = 1;
  const al = Math.hypot(ax, ay);
  const dx = ax / al;
  const dy = ay / al;
  const nx = -dy;
  const ny = dx;

  const umriss = function (faktor, phase) {
    const links = [];
    const rechts = [];
    const schritte = 9;
    for (let i = 0; i <= schritte; i++) {
      const s = i / schritte;
      // schmaler Hals am Rohr, fächert auf, rundes Ende; Wellen im Rand wirken natürlich
      const profil = s < 0.7
        ? 0.1 + 0.9 * Math.pow(Math.sin(s / 0.7 * Math.PI / 2), 1.4)
        : 1 - 0.6 * Math.pow((s - 0.7) / 0.3, 2);
      const w = breite * faktor * profil *
        (1 + 0.15 * Math.sin(s * 9 + phase) + 0.07 * Math.sin(s * 17 + 2 * phase));
      const mx = ox + dx * laenge * faktor * s + 4 * Math.sin(s * 4 + phase) * s;
      const my = oy + dy * laenge * faktor * s;
      links.push([mx + nx * Math.max(w, 1.2), my + ny * Math.max(w, 1.2)]);
      rechts.push([mx - nx * Math.max(w, 1.2) * 0.85, my - ny * Math.max(w, 1.2) * 0.85]);
    }
    return glatterPfad(links.concat(rechts.reverse()));
  };

  const deckkraft = begrenzen(0.18 + groesse / 70, 0.2, 0.5);
  // Die Fahne „atmet“ langsam vom Rohr aus (Drehpunkt = Rohrmündung), der dunkle Kern pulsiert
  let s = '<g class="ka-abwasser" style="transform-origin:' + ox + "px " + oy + "px;" + animStil(9) + '">';
  s += '<path d="' + umriss(1, 0.4) + '" fill="#8A6A3B" opacity="' + deckkraft.toFixed(2) + '" filter="url(#kaWeich)"/>';
  s += '<path d="' + umriss(1, 0.4) + '" fill="none" stroke="#8A6A3B" stroke-opacity="0.4" stroke-width="0.8" stroke-dasharray="3 3"/>';
  s += '<path class="ka-abwasser-kern" style="' + animStil(6) + '" d="' + umriss(0.62, 1.7) + '" fill="#6E5230" fill-opacity="' +
    (deckkraft * 0.9).toFixed(2) + '" filter="url(#kaWeich)"/>';
  s += "</g>";
  // Wirbel an der Rohrmündung: kleine Ringe, die sich ausbreiten und verblassen
  for (let i = 0; i < 2; i++) {
    s += '<ellipse class="ka-wirbel" style="' + animStil(3.2, i * 1.6) + '" cx="' + ox + '" cy="' + (oy - 2) +
      '" rx="5" ry="2.6" fill="none" stroke="#E9DCC0" stroke-width="0.9"/>';
  }
  // Schwebstoffe: treiben von der Mündung die Fahne entlang hinaus und lösen sich auf
  const r = zufallsfolge(91);
  const teilchen = Math.round(4 + groesse / 3);
  for (let i = 0; i < teilchen; i++) {
    const s1 = 0.55 + r() * 0.4;
    const q = (r() - 0.5) * breite * 0.9 * s1;
    const zx = dx * laenge * s1 + nx * q;
    const zy = dy * laenge * s1 + ny * q;
    const dauer = 6 + r() * 3;
    s += '<circle class="ka-teilchen" cx="' + ox + '" cy="' + oy + '" r="' + (0.9 + r() * 0.8).toFixed(1) + '" fill="#5B4428" ' +
      'style="--zx:' + zx.toFixed(1) + "px;--zy:" + zy.toFixed(1) + "px;" + animStil(dauer, i * dauer / teilchen) + '"/>';
  }
  return s;
}

// ---------- Bewegte Teile der Karte: Fische, Rauch, Abwasser ----------
// Die Bewegungen laufen als CSS-Animationen (style.css, Abschnitt „Seekarte: Bewegung“).
// Die Karte wird nach jeder Entscheidung neu gezeichnet. Damit dabei nichts springt, bekommt jede
// Animation eine negative Verzögerung aus der laufenden Uhr: Sie steht nach dem Neuzeichnen genau
// dort, wo sie ohne Neuzeichnen gerade wäre. Bei „Bewegung reduzieren“ steht alles still.
function animStil(dauer, versatz) {
  const t = performance.now() / 1000 + (versatz || 0);
  return "animation-duration:" + dauer.toFixed(2) + "s;animation-delay:-" + (t % dauer).toFixed(2) + "s;";
}

// Lichtreflexe auf dem Meer wie im Titelbild: kurze, helle Striche, nach unten seltener
function meerGlitzerSvg() {
  const r = zufallsfolge(73);
  let d = "";
  for (let i = 0; i < 34; i++) {
    const x = r() * KARTE_B;
    const y = kuestenlinie(x) + STRAND_BREITE + 14 + Math.pow(r(), 1.3) * 180;
    if (y > KARTE_H - 4) continue;
    d += "M" + x.toFixed(1) + "," + y.toFixed(1) + " h" + (6 + r() * 18).toFixed(1) + " ";
  }
  return '<path d="' + d + '" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="1.2" stroke-linecap="round"/>';
}

// Wiese: weiche, etwas dunklere Grasflecken und kleine grüne Grasbüschel im Binnenland
// (hinter der Dünenkante). Hotels, Fabrik und Fluss bleiben frei.
function wiesenSvg() {
  const r = zufallsfolge(83);
  let s = '<g filter="url(#kaWeich)" fill="#A9BC7C">';
  [[60, 40, 38, 14], [300, 30, 46, 12], [250, 76, 40, 10], [380, 60, 30, 10], [600, 18, 34, 9], [770, 60, 26, 12]].forEach(function (f) {
    s += '<ellipse cx="' + f[0] + '" cy="' + f[1] + '" rx="' + f[2] + '" ry="' + f[3] + '" opacity="0.45"/>';
  });
  s += "</g>";
  const farben = ["#7E9A4E", "#91AB5B", "#6B8743", "#A3B868"];
  s += '<g fill="none" stroke-linecap="round" stroke-width="0.8" opacity="0.8">';
  for (let i = 0; i < 90; i++) {
    const x = 6 + r() * (KARTE_B - 12);
    const y = 6 + r() * (kuestenlinie(x) - 26);
    if (x > 118 && x < 218) continue;                              // Fluss
    if (x > 420 && x < 760 && y > 14) continue;                    // Ort und Fabrik
    let d = "";
    for (let j = 0; j < 3; j++) {
      const neigung = (j - 1) * 1.6 + (r() - 0.5);
      const hoehe = 3 + r() * 2.5;
      d += "M" + (x + j * 0.8).toFixed(1) + "," + y.toFixed(1) + " l" + neigung.toFixed(1) + "," + (-hoehe).toFixed(1) + " ";
    }
    s += '<path d="' + d + '" stroke="' + farben[Math.floor(r() * farben.length)] + '"/>';
  }
  return s + "</g>";
}

// Bäume auf den freien Landflächen: runde Laubbäume und schlanke Kiefern, flach gezeichnet
// mit Licht von oben links (wie die Sonne im Titelbild) und weichem Schatten nach rechts unten.
// Die Plätze halten Abstand zu Infopunkten, Personen, Gebäuden, Fluss und den Müll-Schwerpunkten.
const BAEUME = [
  // x, y (Fuß), Größe, Art
  [22, 44, 1.25, "laub"], [52, 27, 1.05, "kiefer"], [80, 66, 1.35, "laub"], [104, 36, 1, "laub"], [38, 88, 0.95, "kiefer"],
  [224, 26, 1.05, "kiefer"], [294, 78, 1.25, "laub"], [340, 30, 1, "laub"],
  [786, 28, 1.1, "kiefer"], [772, 56, 0.95, "laub"]
];

function baumSvg(x, y, g, art) {
  const t = function (wert) { return wert.toFixed(1); };
  let s = '<ellipse cx="' + t(x + 4 * g) + '" cy="' + t(y) + '" rx="' + t(8 * g) + '" ry="' + t(2.6 * g) + '" fill="#0B2238" opacity="0.16"/>';
  if (art === "kiefer") {
    s += '<rect x="' + t(x - 0.9 * g) + '" y="' + t(y - 5 * g) + '" width="' + t(1.8 * g) + '" height="' + t(5 * g) + '" fill="#6E5236"/>';
    [[0, 9, 6.5], [-5.5, 8, 5.2], [-10.5, 6.5, 4]].forEach(function (ebene, i) {
      const unten = y - 4 * g + ebene[0] * g;
      const oben = unten - ebene[1] * g;
      const b = ebene[2] * g;
      s += '<path d="M' + t(x - b) + "," + t(unten) + " L" + t(x) + "," + t(oben) + " L" + t(x + b) + "," + t(unten) + ' Z" fill="' +
        (i === 2 ? "#4F7444" : "#456A3C") + '"/>' +
        '<path d="M' + t(x - b) + "," + t(unten) + " L" + t(x) + "," + t(oben) + " L" + t(x - b * 0.15) + "," + t(unten) + ' Z" fill="#6C9157"/>';
    });
    return s;
  }
  s += '<rect x="' + t(x - 1 * g) + '" y="' + t(y - 7 * g) + '" width="' + t(2 * g) + '" height="' + t(7 * g) + '" rx="' + t(0.6 * g) + '" fill="#7A5A3A"/>';
  s += '<g fill="#5F8243">' +
    '<circle cx="' + t(x - 4 * g) + '" cy="' + t(y - 10 * g) + '" r="' + t(5 * g) + '"/>' +
    '<circle cx="' + t(x + 4.2 * g) + '" cy="' + t(y - 10.5 * g) + '" r="' + t(5 * g) + '"/>' +
    '<circle cx="' + t(x) + '" cy="' + t(y - 15 * g) + '" r="' + t(6 * g) + '"/></g>';
  s += '<g fill="#7FA157">' +
    '<circle cx="' + t(x - 5 * g) + '" cy="' + t(y - 11.5 * g) + '" r="' + t(3.2 * g) + '"/>' +
    '<circle cx="' + t(x - 1.6 * g) + '" cy="' + t(y - 16.8 * g) + '" r="' + t(3.8 * g) + '"/></g>';
  s += '<circle cx="' + t(x - 2.8 * g) + '" cy="' + t(y - 18 * g) + '" r="' + t(1.6 * g) + '" fill="#A3BE73"/>';
  return s;
}

function baeumeSvg() {
  return BAEUME.slice().sort(function (a, b) { return a[1] - b[1]; }).map(function (b) {
    return baumSvg(b[0], b[1], b[2], b[3]);
  }).join("");
}

// Strandhafer auf der Dünenkante: kleine Büschel aus drei bis fünf Halmen (Farben wie im Titelbild).
// Hotels, Fabrik und Fluss bleiben frei.
function strandhaferSvg() {
  const r = zufallsfolge(47);
  const farben = ["#A8A05E", "#8D8A4B", "#B4A86A", "#6E7442"];
  const frei = function (x, y) {
    if (x > 120 && x < 230) return false;                        // Fluss und Mündung
    if (x > 420 && x < 770 && y < 104) return false;             // Ort, Fabrik, Steg
    return true;
  };
  let s = '<g fill="none" stroke-linecap="round" opacity="0.85">';
  for (let i = 0; i < 70; i++) {
    const x = 6 + r() * (KARTE_B - 12);
    const naheKueste = r() < 0.75;
    const y = naheKueste ? kuestenlinie(x) - 1 - r() * 12 : 10 + r() * (kuestenlinie(x) - 30);
    if (!frei(x, y)) continue;
    const farbe = farben[Math.floor(r() * farben.length)];
    const halme = 3 + Math.floor(r() * 3);
    let d = "";
    for (let j = 0; j < halme; j++) {
      const neigung = (j - (halme - 1) / 2) * 2.2 + (r() - 0.3) * 1.8;
      const hoehe = 5 + r() * 4;
      d += "M" + (x + j * 0.7).toFixed(1) + "," + y.toFixed(1) + " q" + (neigung * 0.3).toFixed(1) + "," + (-hoehe * 0.6).toFixed(1) +
        " " + neigung.toFixed(1) + "," + (-hoehe).toFixed(1) + " ";
    }
    s += '<path d="' + d + '" stroke="' + farbe + '" stroke-width="0.9"/>';
  }
  return s + "</g>";
}

// ---------- Fische ----------
// Arten und Merkmale nach der Fischseite der Schutzstation Wattenmeer
// (schutzstation-wattenmeer.de/wissen/tiere/fische). Zu Beginn (Artenvielfalt um 50) schwimmen nur
// die zwei häufigsten Arten: Hering (in Schwärmen) und Sandgrundel („auffallend häufig“). Erholt sich
// die Artenvielfalt, kommen mehr Tiere und weitere Arten dazu: die Jungfische der „Kinderstube“
// (Scholle, Wittling, Hornhecht), dann Standfische (Seeskorpion, Steinpicker) und zuletzt Katzenhai und
// Nagelrochen, die an der Wattenmeerküste heute selten bzw. ausgerottet sind.
// ab = nötige Artenvielfalt; anzahl = Stufen [ab Artenvielfalt, Tiere]; schwarm = Fische pro Tier;
// boden = lebt am Grund (schwimmt weiter unten und ruhiger)
const FISCH_ARTEN = [
  { id: "hering",      name: "Hering",      ab: 0,  anzahl: [[0, 1], [40, 2], [62, 3], [80, 4]], schwarm: 3 },
  { id: "grundel",     name: "Sandgrundel", ab: 0,  anzahl: [[0, 1], [45, 2], [66, 3], [85, 4]], boden: true },
  { id: "scholle",     name: "Scholle",     ab: 57, anzahl: [[57, 1], [72, 2]], boden: true },
  { id: "wittling",    name: "Wittling",    ab: 62, anzahl: [[62, 1], [78, 2]] },
  { id: "hornhecht",   name: "Hornhecht",   ab: 67, anzahl: [[67, 1]], schwarm: 2 },
  { id: "seeskorpion", name: "Seeskorpion", ab: 72, anzahl: [[72, 1]], boden: true },
  { id: "steinpicker", name: "Steinpicker", ab: 77, anzahl: [[77, 1]], boden: true },
  { id: "katzenhai",   name: "Katzenhai",   ab: 84, anzahl: [[84, 1]], groesse: 1.1 },
  { id: "rochen",      name: "Nagelrochen", ab: 91, anzahl: [[91, 1]], boden: true, groesse: 1.15 }
];

function sichtbareFischArten(artenvielfalt) {
  return FISCH_ARTEN.filter(function (a) { return artenvielfalt >= a.ab; });
}

// Fische in Seitenansicht (Rochen und Scholle von oben), Kopf links, um (0,0), etwa 16 Einheiten lang.
// Ohne Umrisslinie wie im Titelbild: dunklerer Rücken, hellerer Bauch, kleines Auge mit Lichtpunkt.
// Die Schwanzflosse steht in einer eigenen Gruppe, damit sie schlagen kann.
function fischAuge(x, y, r) {
  return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#1E3445"/>' +
    '<circle cx="' + (x - r * 0.35).toFixed(2) + '" cy="' + (y - r * 0.35).toFixed(2) + '" r="' + (r * 0.35).toFixed(2) + '" fill="#FFFFFF" opacity="0.8"/>';
}

function fischSchwanz(inhalt) {
  return '<g class="ka-fisch-schwanz">' + inhalt + "</g>";
}

const FISCH_FORMEN = {
  // Hering: schlank, silbern, blaugrüner Rücken, gegabelte Schwanzflosse
  hering: function () {
    return fischSchwanz('<path d="M6,0 L11,-3.6 L9.3,0 L11,3.6 Z" fill="#7FA2B8"/>') +
      '<path d="M-0.6,-2.9 L1.4,-4.4 L2.6,-2.6 Z" fill="#4E7E9C"/>' +
      '<path d="M-8,0 C-6.4,-2.7 0.5,-3.3 6.4,-1 L6.4,1 C0.5,3.1 -6.4,2.7 -8,0 Z" fill="#DCE7EC"/>' +
      '<path d="M-8,0 C-6.4,-2.7 0.5,-3.3 6.4,-1 L6.4,-0.2 C1,-1.3 -4.5,-1.1 -8,0 Z" fill="#4E7E9C"/>' +
      '<path d="M-6,0.9 C-2,1.9 2,1.7 5.5,0.7" fill="none" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="0.5"/>' +
      fischAuge(-5.6, -0.5, 0.75);
  },
  // Sandgrundel: klein, keulenförmig, sandfarben mit dunklen Tupfen, zwei Rückenflossen, Augen oben
  grundel: function () {
    return fischSchwanz('<path d="M5.8,0.15 L9.2,-2.1 Q10.2,0.15 9.2,2.4 Z" fill="#B9A27A"/>') +
      '<path d="M-2.6,-2.6 L-1.4,-4 L0,-2.3 Z M1.2,-1.8 L2.2,-3.2 L4,-1.2 Z" fill="#B9A27A"/>' +
      '<path d="M-6.5,0.3 C-6.5,-2.6 -2.5,-3 0.5,-1.9 C3,-1 5,-0.7 6.2,-0.5 L6.2,0.8 C4.5,1.1 2,1.9 -1,2.3 C-4.5,2.6 -6.5,2.1 -6.5,0.3 Z" fill="#D4C098"/>' +
      '<path d="M-6.5,0.3 C-6.5,-2.6 -2.5,-3 0.5,-1.9 C3,-1 5,-0.7 6.2,-0.5 L6.2,0 C3,-0.2 -1,-0.6 -6.5,0.3 Z" fill="#A68D63"/>' +
      '<g fill="#7F6A48" opacity="0.7"><circle cx="-2" cy="-0.6" r="0.5"/><circle cx="1" cy="-0.4" r="0.45"/><circle cx="3.6" cy="-0.2" r="0.4"/></g>' +
      fischAuge(-4.6, -1.9, 0.75);
  },
  // Scholle: Plattfisch von oben, rundlich mit Flossensaum, bräunlich mit orangen Flecken, Augen auf einer Seite
  scholle: function () {
    return fischSchwanz('<path d="M7.6,0 L11.2,-2.6 Q12,0 11.2,2.6 Z" fill="#B9A47E"/>') +
      '<ellipse cx="0" cy="0" rx="8.6" ry="5.6" fill="#B9A47E" opacity="0.85"/>' +
      '<ellipse cx="0" cy="0" rx="7" ry="4.4" fill="#9A8463"/>' +
      '<ellipse cx="-1" cy="-1" rx="4.5" ry="2.2" fill="#B49E78" opacity="0.6"/>' +
      '<path d="M-5,0.3 Q0,-0.6 7,0" fill="none" stroke="#7E6A4C" stroke-opacity="0.5" stroke-width="0.35"/>' +
      '<g fill="#E07B39"><circle cx="-2" cy="-1.8" r="0.75"/><circle cx="1.8" cy="1.4" r="0.75"/><circle cx="3.8" cy="-1.5" r="0.7"/>' +
      '<circle cx="-0.6" cy="2.2" r="0.7"/><circle cx="-4" cy="1.3" r="0.6"/></g>' +
      fischAuge(-5.4, -1.2, 0.6) + fischAuge(-4.4, -2.5, 0.6);
  },
  // Wittling: „kleiner Bruder des Kabeljaus“, drei Rücken- und zwei Afterflossen, ohne Kinnfaden
  wittling: function () {
    return fischSchwanz('<path d="M6.6,0 L10.8,-3.2 L10.4,0 L10.8,3.2 Z" fill="#B7AA8A"/>') +
      '<path d="M-3.5,-2.8 L-2.6,-4.6 L-1,-3 Z M-0.4,-3 L0.8,-4.4 L2.6,-2.4 Z M3.2,-2.2 L4.3,-3.4 L5.8,-1.6 Z" fill="#A69777"/>' +
      '<path d="M-0.5,2.8 L0.8,4 L2.4,2.5 Z M3,2.2 L4.2,3.3 L5.8,1.7 Z" fill="#C9C0A6"/>' +
      '<path d="M-9,0 C-7,-2.9 0,-3.4 7,-1.1 L7,1.1 C0,3.4 -7,3 -9,0 Z" fill="#E3E1D6"/>' +
      '<path d="M-9,0 C-7,-2.9 0,-3.4 7,-1.1 L7,-0.2 C1,-1.2 -5,-1 -9,0 Z" fill="#A69777"/>' +
      '<path d="M-6.5,-0.6 Q0,-1.4 6.5,-0.4" fill="none" stroke="#8C7F62" stroke-width="0.35"/>' +
      '<circle cx="-4.6" cy="0.5" r="0.55" fill="#4A4232" opacity="0.7"/>' +
      fischAuge(-6.6, -0.6, 0.75);
  },
  // Hornhecht: sehr schlank mit gezähntem „Schnabel“, blaugrüner Rücken
  hornhecht: function () {
    return fischSchwanz('<path d="M10.6,0 L14.4,-2.4 L13,0 L14.4,2.4 Z" fill="#4F8A90"/>') +
      '<path d="M6.5,-1.2 L8.5,-2.3 L9.6,-0.9 Z M6.5,1.2 L8.5,2.3 L9.6,0.9 Z" fill="#2F6F78"/>' +
      '<path d="M-5.6,-0.35 L-13.5,0 L-5.6,0.5 Z" fill="#2F6F78"/>' +
      '<path d="M-6,0 C-2,-1.5 6,-1.6 11,-0.6 L11,0.6 C6,1.6 -2,1.4 -6,0 Z" fill="#DCE6E3"/>' +
      '<path d="M-6,0 C-2,-1.5 6,-1.6 11,-0.6 L11,-0.05 C6,-0.5 -1,-0.5 -6,0 Z" fill="#2F6F78"/>' +
      fischAuge(-4.4, -0.3, 0.6);
  },
  // Seeskorpion: großer Kopf mit weitem Maul, marmoriert, Flossen braun-weiß quergestreift
  seeskorpion: function () {
    return fischSchwanz('<path d="M6.2,0.1 L10.2,-2.8 Q11,0.1 10.2,3 Z" fill="#D9CBAE"/>' +
      '<path d="M8.2,-1.6 V1.8" stroke="#7A6143" stroke-width="0.5"/>') +
      '<path d="M-4.5,-3.5 L-3.6,-5.6 L-2.6,-3.6 L-1.6,-5.2 L-0.4,-3.1 L0.8,-4.4 L2,-2.6 Z" fill="#9A8160"/>' +
      '<path d="M-8.5,0.6 C-9,-3.2 -4.5,-4.4 -1,-3.4 C2,-2.5 5,-1.2 6.6,-0.6 L6.6,0.8 C4.5,1.5 1,3 -3.5,3.4 C-7,3.6 -8.4,2.4 -8.5,0.6 Z" fill="#7C6549"/>' +
      '<g fill="#C9B48C" opacity="0.8"><ellipse cx="-4" cy="-1.2" rx="1.4" ry="0.9"/><ellipse cx="0" cy="-0.6" rx="1.1" ry="1.4"/>' +
      '<ellipse cx="3.4" cy="-0.1" rx="0.9" ry="1.1"/></g>' +
      '<path d="M-3.2,0.4 C-0.5,0.6 1.6,2.8 1.4,5 C-0.8,4.4 -2.8,2.8 -3.2,0.4 Z" fill="#E9DFC9"/>' +
      '<path d="M-2.4,1.6 L0.6,2.8 M-2,3 L0.6,4.3" stroke="#7A6143" stroke-width="0.5"/>' +
      '<path d="M-8.6,0.4 Q-7,1.2 -5.6,0.5" fill="none" stroke="#3F3020" stroke-width="0.45"/>' +
      fischAuge(-6, -1.6, 0.8);
  },
  // Steinpicker: eckige Knochenplatten, langer Schwanzstiel, graubraun gebändert, Kinnfäden
  steinpicker: function () {
    return fischSchwanz('<path d="M9.2,0 L12,-1.8 L12,1.8 Z" fill="#7C7568"/>') +
      '<path d="M-7.5,0.5 L-6,-2.1 L-2,-2.7 L3,-1.3 L9.5,-0.5 L9.5,0.6 L3,1.3 L-2,2.4 L-6,2.4 Z" fill="#9C9587"/>' +
      '<path d="M-7.5,0.5 L-6,-2.1 L-2,-2.7 L3,-1.3 L9.5,-0.5 L9.5,0 L3,-0.4 L-2,-0.8 Z" fill="#6E675B"/>' +
      '<path d="M-3.8,-2.4 L-4,2.3 M-0.4,-2.2 L-0.6,2 M2.8,-1.3 V1.3 M6,-0.9 V0.9" stroke="#565046" stroke-width="0.9" stroke-opacity="0.6"/>' +
      '<path d="M-6,0.6 L9,0.1" stroke="#C9C2B3" stroke-width="0.35"/>' +
      '<path d="M-4.5,0.6 C-3,0.2 -1,1.4 -1.6,3.8 C-3.4,3.8 -4.8,2.4 -4.5,0.6 Z" fill="#B5AD9C" opacity="0.9"/>' +
      '<path d="M-7.2,1.3 l-0.8,1.5 M-6.6,1.6 l-0.2,1.7 M-6,1.8 l0.3,1.5" stroke="#5E574C" stroke-width="0.35" stroke-linecap="round"/>' +
      '<path d="M-5.6,-2.1 L-5.2,-3.2 L-4.6,-2.3" fill="none" stroke="#6E675B" stroke-width="0.5"/>' +
      fischAuge(-5.6, -1, 0.7);
  },
  // Kleingefleckter Katzenhai: langgestreckt, sandfarben mit dunklen Punkten, breite Brustflossen
  katzenhai: function () {
    let flecken = "";
    [[-8, -0.6], [-5.4, 0.8], [-3.6, -1.2], [-1, 0.4], [1.4, -1.3], [3.6, 0.6], [5.8, -0.7], [8, 0.2], [-6.6, -1.6], [0.6, 1.5]].forEach(function (f, i) {
      flecken += '<circle cx="' + f[0] + '" cy="' + f[1] + '" r="' + (0.35 + (i % 3) * 0.1).toFixed(2) + '"/>';
    });
    return fischSchwanz('<path d="M11.6,0 L17.6,-2.6 L16.4,-0.4 L14.6,1.2 Z" fill="#B59C70"/>') +
      '<path d="M-4,1.6 L-1,5 L0.2,1.8 Z M5,1.8 L6.6,3.2 L7.6,1.5 Z" fill="#B89E73"/>' +
      '<path d="M2,-2 L4,-4.2 L5.4,-1.8 Z M7.4,-1.2 L8.8,-2.8 L9.8,-1 Z" fill="#B59C70"/>' +
      '<path d="M-12,0.6 C-12,-1.8 -6,-2.6 0,-2.2 C6,-1.8 10,-1 12,-0.4 L12,0.8 C8,1.4 2,2.4 -4,2.6 C-9,2.7 -12,2.1 -12,0.6 Z" fill="#D7C29B"/>' +
      '<path d="M-12,0.6 C-12,-1.8 -6,-2.6 0,-2.2 C6,-1.8 10,-1 12,-0.4 L12,0.1 C6,-0.6 -4,-0.8 -12,0.6 Z" fill="#B59C70"/>' +
      '<g fill="#5F4E36" opacity="0.75">' + flecken + "</g>" +
      '<path d="M-7,-0.4 v1.5 M-6.2,-0.4 v1.5" stroke="#9C8460" stroke-width="0.3"/>' +
      fischAuge(-9.2, -0.4, 0.6);
  },
  // Nagelrochen von oben: rautenförmig wie ein Kinderdrachen mit langem Schwanz, dunkelgrau mit
  // hellen, dunkel umrandeten Flecken und einer Dornenreihe bis zur Schwanzspitze
  rochen: function () {
    let dornen = "";
    for (let x = -3; x <= 14; x += 1.7) dornen += '<circle cx="' + x.toFixed(1) + '" cy="0" r="0.28"/>';
    return '<path d="M3.5,-0.5 L16,-0.3 L16,0.3 L3.5,0.5 Z" fill="#5E6468"/>' +
      '<g class="ka-rochen-fluegel">' +
      '<path d="M-9.5,0 Q-6,-2 -1,-8.6 Q3,-3 5,0 Q3,3 -1,8.6 Q-6,2 -9.5,0 Z" fill="#6E7478"/>' +
      '<path d="M-8,0 Q-4,-1.4 0,-3 Q3,-1 3.6,0 Q3,1 0,3 Q-4,1.4 -8,0 Z" fill="#868C8F" opacity="0.7"/>' +
      '<g fill="#D8D2C2" stroke="#2A2E31" stroke-width="0.3"><circle cx="-2" cy="-4.4" r="0.7"/><circle cx="-2" cy="4.4" r="0.7"/>' +
      '<circle cx="1" cy="-2.2" r="0.6"/><circle cx="1" cy="2.2" r="0.6"/></g></g>' +
      '<g fill="#C9C1AE">' + dornen + "</g>" +
      fischAuge(-5.5, -0.9, 0.45) + fischAuge(-5.5, 0.9, 0.45);
  }
};

// Ein Tier (oder ein kleiner Schwarm) auf der Karte. Es schwimmt ein Stück geradeaus, wendet und
// schwimmt zurück; die Schwanzflosse schlägt dabei leicht. Bodenfische bewegen sich kürzer und langsamer.
function fischSvg(art, x, y, richtung, nummer) {
  const r = zufallsfolge(200 + nummer * 13);
  const weg = art.boden ? 10 + r() * 14 : 26 + r() * 30;
  // nicht über den Kartenrand hinausschwimmen
  const sx = richtung === 1 ? Math.max(x, 18 + weg) : Math.min(x, KARTE_B - 18 - weg);
  const dauer = art.boden ? 22 + r() * 12 : 14 + r() * 10;
  const g = (art.groesse || 1) * 1.5;
  let inhalt = "";
  if (art.schwarm) {
    [[0, 0], [8, -5], [10, 4.5]].slice(0, art.schwarm).forEach(function (v) {
      inhalt += '<g transform="translate(' + v[0] + "," + v[1] + ') scale(0.8)">' + FISCH_FORMEN[art.id]() + "</g>";
    });
  } else {
    inhalt = FISCH_FORMEN[art.id]();
  }
  return '<g transform="translate(' + sx.toFixed(1) + "," + y.toFixed(1) + ") scale(" + (richtung * g).toFixed(2) + "," + g + ')">' +
    '<g class="ka-fisch" style="--weg:-' + weg.toFixed(1) + "px;" + animStil(dauer, r() * dauer) + '" opacity="0.92">' +
    inhalt + "</g></g>";
}

// Alle Fische zur aktuellen Artenvielfalt. Jedes Tier hat einen festen Platz (gleiche Zufallsfolge),
// damit nichts springt, wenn die Karte neu gezeichnet wird. Bodenfische schwimmen weiter unten.
function fischeSvg(artenvielfalt) {
  const tiere = [];
  FISCH_ARTEN.forEach(function (art, artNummer) {
    if (artenvielfalt < art.ab) return;
    let anzahl = 0;
    art.anzahl.forEach(function (stufe) { if (artenvielfalt >= stufe[0]) anzahl = stufe[1]; });
    for (let n = 0; n < anzahl; n++) {
      const r = zufallsfolge(300 + artNummer * 37 + n * 11);
      let x = 0;
      let y = 0;
      for (let versuch = 0; versuch < 25; versuch++) {
        x = 50 + r() * 690;
        y = art.boden ? 252 + r() * 50 : 208 + r() * 78;
        const frei = !(x < 100 && y > 262) &&                                   // Otter unten links
          !tiere.some(function (t) { return Math.abs(t.x - x) < 34 && Math.abs(t.y - y) < 14; });
        if (frei) break;
      }
      tiere.push({ art: art, x: x, y: y, richtung: r() > 0.5 ? 1 : -1, nummer: artNummer * 10 + n });
    }
  });
  return tiere.sort(function (a, b) { return a.y - b.y; }).map(function (t) {
    return fischSvg(t.art, t.x, t.y, t.richtung, t.nummer);
  }).join("");
}

// ---------- Gebäude in Schrägansicht ----------
// Die Karte wird von Süden (vom Meer aus) schräg von oben betrachtet. Deshalb sieht man bei jedem
// Gebäude die Vorderseite, das Dach von oben und die rechte Seitenwand; die Tiefe läuft nach oben
// und etwas nach rechts. Die Sonne steht links oben wie im Titelbild: Dachflächen hell,
// Vorderseite mittel, rechte Seite im Schatten. Statt schwarzer Umrisse nur weiche, dunklere Kanten.
const SCHRAEG = { x: 0.3, y: -0.52 };
const BAU_KANTE = ' stroke="#4E4538" stroke-opacity="0.4" stroke-width="0.6" stroke-linejoin="round"';

function schraeg(t) {
  return { x: t * SCHRAEG.x, y: t * SCHRAEG.y };
}

function vieleck(punkte) {
  return "M" + punkte.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" L") + " Z";
}

// Quader: Vorderseite von x bis x + b und von oben bis oben + h, Tiefe t
function quaderSvg(x, oben, b, h, t, farben) {
  const d = schraeg(t);
  const unten = oben + h;
  return '<path d="' + vieleck([[x + b, oben], [x + b + d.x, oben + d.y], [x + b + d.x, unten + d.y], [x + b, unten]]) +
    '" fill="' + farben.seite + '"' + BAU_KANTE + "/>" +
    '<path d="' + vieleck([[x, oben], [x + d.x, oben + d.y], [x + b + d.x, oben + d.y], [x + b, oben]]) +
    '" fill="' + farben.dach + '"' + BAU_KANTE + "/>" +
    '<rect x="' + x.toFixed(1) + '" y="' + oben.toFixed(1) + '" width="' + b + '" height="' + h + '" fill="' + farben.front + '"' + BAU_KANTE + "/>";
}

// Fenster auf der Vorderseite: Glas mit Lichtkante oben links und Sims
function fensterSvg(x, y, b, h) {
  return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + b + '" height="' + h + '" fill="url(#kaGlas)" stroke="#6F8796" stroke-opacity="0.6" stroke-width="0.4"/>' +
    '<path d="M' + (x + 0.6).toFixed(1) + "," + (y + h - 0.7).toFixed(1) + " V" + (y + 0.6).toFixed(1) + " H" + (x + b * 0.55).toFixed(1) +
    '" fill="none" stroke="#FFFFFF" stroke-opacity="0.7" stroke-width="0.5"/>' +
    '<path d="M' + (x - 0.4).toFixed(1) + "," + (y + h + 0.3).toFixed(1) + " H" + (x + b + 0.4).toFixed(1) + '" stroke="#B9AB8F" stroke-width="0.6"/>';
}

// Fenster auf der rechten Seitenwand (Parallelogramm in Tiefenrichtung)
function seitenFensterSvg(xWand, y, t0, t1, h) {
  const a = schraeg(t0);
  const e = schraeg(t1);
  return '<path d="' + vieleck([[xWand + a.x, y + a.y], [xWand + e.x, y + e.y], [xWand + e.x, y + e.y + h], [xWand + a.x, y + a.y + h]]) +
    '" fill="#8FAFC2" opacity="0.85"/>';
}

// Maße einer Fabrik. x, y, b, h beschreiben die Grundfläche wie früher (Unterkante y + h bleibt),
// damit Müll, Personen und Mülleimer weiter frei stehen.
function fabrikMasse(x, y, b, h) {
  const hv = Math.round(h * 0.72);                 // sichtbare Höhe der Vorderseite
  const oben = y + h - hv;
  const t = Math.round(h * 0.75);
  const d = schraeg(t);
  const kr = Math.max(2.6, b * 0.055);             // Radius des Schornsteins
  const kx = x + b * 0.8 + d.x * 0.55;             // steht hinten rechts auf dem Dach
  const kFuss = oben + d.y * 0.55 - 3;
  return { hv: hv, oben: oben, t: t, d: d, kr: kr, kx: kx, kFuss: kFuss, kSpitze: kFuss - (h + 2) };
}

// Oberkante des Schornsteins einer Fabrik (für den Rauch)
function schornsteinSpitze(x, y, b, h) {
  const m = fabrikMasse(x, y, b, h);
  return { x: m.kx, y: m.kSpitze };
}

// Rauchwolken: steigen aus dem Schornstein, treiben mit dem Wind nach rechts, wachsen und verblassen
function rauchSvg(spitze, groesse, versatz) {
  const wolken = 5;
  const dauer = 6.5;
  let s = '<g filter="url(#kaRauchWeich)">';
  for (let i = 0; i < wolken; i++) {
    const zx = (30 + i * 3) * groesse;               // Wind von links: Rauch zieht flach nach rechts
    const zy = -(9 + (i % 2) * 3) * groesse;
    s += '<circle class="ka-rauch" cx="' + spitze.x.toFixed(1) + '" cy="' + (spitze.y + 1).toFixed(1) + '" r="' + (5.2 * groesse).toFixed(1) +
      '" fill="' + (i % 2 ? "#8F9BA4" : "#7A8791") + '" style="--zx:' + zx.toFixed(1) + "px;--zy:" + zy.toFixed(1) + "px;" +
      animStil(dauer, versatz + i * dauer / wolken) + '"/>';
  }
  return s + "</g>";
}

// Hotel, Kiosk und Gästehäuser werden auf der Karte so stark vergrößert (deutlich größer als die Fische)
const ORT_GROESSE = 1.3;

// Großes Hotel: Flachdach mit Dachaufbau und Fahne, Schild „Hotel“, drei Fensterreihen mit Balkonen,
// Eingang mit Vordach. x = linke Kante der Vorderseite, unten = Unterkante (Boden).
const HOTEL_MASSE = { b: 46, h: 32, t: 18 };

function hotelGrossSvg(x, unten) {
  const b = HOTEL_MASSE.b;
  const h = HOTEL_MASSE.h;
  const t = HOTEL_MASSE.t;
  const oben = unten - h;
  let s = quaderSvg(x, oben, b, h, t, { front: "url(#kaWandHell)", seite: "#D8CCB3", dach: "#EEE9DE" });
  // Dachfläche mit Attika (heller Rand)
  const dachPunkt = function (k, dx) {
    const p = schraeg(t * k);
    return [x + dx + p.x, oben + p.y];
  };
  s += '<path d="' + vieleck([dachPunkt(0.12, 1.6), dachPunkt(0.88, 1.6), dachPunkt(0.88, b - 1.6), dachPunkt(0.12, b - 1.6)]) + '" fill="#DAD3C4"/>';
  // Dachaufbau
  const aufbau = schraeg(t * 0.3);
  s += quaderSvg(x + 6 + aufbau.x, oben + aufbau.y - 4, 11, 4, t * 0.4, { front: "#E6DDCB", seite: "#C9BC9F", dach: "#F4F0E7" });
  // Fahne hinten rechts auf dem Dach
  const f = schraeg(t * 0.7);
  const fx = x + b - 5 + f.x;
  const fy = oben + f.y;
  s += '<line x1="' + fx.toFixed(1) + '" y1="' + fy.toFixed(1) + '" x2="' + fx.toFixed(1) + '" y2="' + (fy - 12).toFixed(1) +
    '" stroke="#5E5A52" stroke-width="0.9"/>' +
    '<path d="M' + fx.toFixed(1) + "," + (fy - 12).toFixed(1) + " q3.6,-0.7 7.2,1.7 q-3.6,1 -7.2,2.2 Z\" fill=\"#E2A92B\"/>";
  // Schild
  s += '<rect x="' + (x + 6) + '" y="' + (oben + 2.4) + '" width="' + (b - 12) + '" height="8" rx="1.2" fill="#1D4F8C"/>' +
    '<text x="' + (x + b / 2) + '" y="' + (oben + 8.6) + '" text-anchor="middle" font-size="7" font-weight="700" ' +
    'letter-spacing="0.5" fill="#ffffff">Hotel</text>';
  // Fenster: drei Reihen à fünf mit Balkonbrüstung, dazu Fenster auf der Seitenwand
  for (let reihe = 0; reihe < 3; reihe++) {
    const fy2 = oben + 13 + reihe * 5.6;
    for (let spalte = 0; spalte < 5; spalte++) s += fensterSvg(x + 3.6 + spalte * 8.3, fy2, 5, 3.4);
    s += '<rect x="' + (x + 2.4) + '" y="' + (fy2 + 3.2).toFixed(1) + '" width="' + (b - 4.8) + '" height="1" fill="#FFFFFF" opacity="0.75"/>';
    s += seitenFensterSvg(x + b, fy2, t * 0.16, t * 0.4, 3.2) + seitenFensterSvg(x + b, fy2, t * 0.58, t * 0.82, 3.2);
  }
  // Eingang mit Vordach
  s += '<rect x="' + (x + b / 2 - 3.2) + '" y="' + (unten - 5) + '" width="6.4" height="5" fill="#3D4F5E"/>' +
    '<path d="' + vieleck([[x + b / 2 - 6, unten - 5.8], [x + b / 2 + 6, unten - 5.8], [x + b / 2 + 6.8, unten - 7.4], [x + b / 2 - 5.2, unten - 7.4]]) +
    '" fill="#2F64A0"/>' +
    '<rect x="' + (x + b / 2 - 6) + '" y="' + (unten - 5.8) + '" width="12" height="1" fill="#1D4F8C"/>';
  return s;
}

// Strandkiosk: kleine Holzbude mit Pultdach, Schild „KIOSK“ auf dem Dach, rot-weiß gestreifte Markise
// über der Verkaufsklappe, Tresen mit Getränken, Eis-Aufsteller davor.
// x = linke Kante der Vorderseite, unten = Unterkante (Boden).
const KIOSK_MASSE = { b: 22, h: 12, t: 10 };

function kioskSvg(x, unten) {
  const b = KIOSK_MASSE.b;
  const h = KIOSK_MASSE.h;
  const t = KIOSK_MASSE.t;
  const oben = unten - h;
  const d = schraeg(t);
  let s = quaderSvg(x, oben, b, h, t, { front: "url(#kaHolz)", seite: "#A9805A", dach: "#5E7F8F" });
  // senkrechte Bretterfugen
  let fugen = "";
  for (let fx = x + 3; fx < x + b; fx += 3) fugen += "M" + fx + "," + (oben + 0.4) + " V" + (unten - 0.4) + " ";
  s += '<path d="' + fugen + '" stroke="#8A6440" stroke-opacity="0.35" stroke-width="0.4"/>';
  // Verkaufsklappe mit Tresen und Getränken
  s += '<rect x="' + (x + 3) + '" y="' + (oben + 3.4) + '" width="' + (b - 6) + '" height="5" fill="#4A3A2C"/>' +
    '<rect x="' + (x + 2.4) + '" y="' + (oben + 8.2) + '" width="' + (b - 4.8) + '" height="1.3" fill="#E9D7B4"/>';
  [[4.4, "#E8662A"], [6.4, "#6FA8CB"], [8.4, "#2E8B57"], [13.6, "#E2A92B"], [15.6, "#C8382E"]].forEach(function (g) {
    s += '<rect x="' + (x + g[0]) + '" y="' + (oben + 6.4) + '" width="1.2" height="1.8" rx="0.3" fill="' + g[1] + '"/>';
  });
  // Markise: rot-weiß gestreift, steht schräg nach vorne heraus
  const markise = [[x - 1, oben + 4.6], [x + b + 1, oben + 4.6], [x + b, oben + 0.6], [x, oben + 0.6]];
  s += '<path d="' + vieleck(markise) + '" fill="#FFFFFF"' + BAU_KANTE + "/>";
  let streifen = "";
  for (let i = 0; i < 6; i++) {
    const a = (b + 2) / 6;
    if (i % 2) continue;
    streifen += vieleck([[x - 1 + i * a, oben + 4.6], [x - 1 + (i + 1) * a, oben + 4.6],
      [x + (i + 1) * b / 6, oben + 0.6], [x + i * b / 6, oben + 0.6]]) + " ";
  }
  s += '<path d="' + streifen + '" fill="#D9473C"/>';
  let zacken = "M" + (x - 1) + "," + (oben + 4.6);
  for (let i = 0; i < 6; i++) {
    const a = (b + 2) / 6;
    zacken += " q" + (a / 2).toFixed(2) + ",2 " + a.toFixed(2) + ",0";
  }
  s += '<path d="' + zacken + '" fill="#D9473C" stroke="#9E2E26" stroke-opacity="0.5" stroke-width="0.4"/>';
  // Schild „KIOSK“ auf dem Dach (steht in der Mitte der Dachfläche)
  const m = schraeg(t * 0.45);
  const sx = x + 1.5 + m.x;
  const sy = oben + m.y - 7.6;
  s += '<path d="M' + (sx + 3) + "," + (sy + 7.6) + " V" + (sy + 6) + " M" + (sx + b - 6) + "," + (sy + 7.6) + " V" + (sy + 6) +
    '" stroke="#5E5A52" stroke-width="0.8"/>';
  s += '<rect x="' + sx.toFixed(1) + '" y="' + sy.toFixed(1) + '" width="' + (b - 3) + '" height="6.4" rx="1.2" fill="#E2A92B" stroke="#9A6E14" stroke-opacity="0.6" stroke-width="0.5"/>' +
    '<text x="' + (sx + (b - 3) / 2).toFixed(1) + '" y="' + (sy + 5).toFixed(1) + '" text-anchor="middle" font-size="5.2" font-weight="700" ' +
    'letter-spacing="0.5" fill="#12304A">KIOSK</text>';
  // Eis-Aufsteller rechts vor der Bude
  const ax = x + b + d.x * 0.2 + 3;
  s += '<path d="M' + (ax - 2) + "," + unten + " L" + ax + "," + (unten - 6.4) + " L" + (ax + 2) + "," + unten + '" fill="none" stroke="#5E5A52" stroke-width="0.6"/>' +
    '<rect x="' + (ax - 2.2) + '" y="' + (unten - 7.4) + '" width="4.4" height="4.6" rx="0.6" fill="#FFFFFF" stroke="#6C7880" stroke-opacity="0.6" stroke-width="0.4"/>' +
    '<path d="M' + (ax - 0.9) + "," + (unten - 5.4) + " L" + ax + "," + (unten - 3.2) + " L" + (ax + 0.9) + "," + (unten - 5.4) + ' Z" fill="#D9A55A"/>' +
    '<circle cx="' + ax + '" cy="' + (unten - 5.9) + '" r="1" fill="#F2A7B8"/>';
  return s;
}

// Kleines Gästehaus: Satteldach (First parallel zur Vorderseite), Giebel an der rechten Seite,
// zwei Fenster und Tür. x, y = linke obere Ecke der früheren Vorderansicht (18 × 13), Unterkante bleibt.
function hotelKleinSvg(x, y) {
  const b = 18;
  const h = 10;
  const t = 12;
  const giebel = 6.5;
  const oben = y + 13 - h;
  const unten = oben + h;
  const d = schraeg(t);
  const m = schraeg(t / 2);
  // rechte Seitenwand mit Giebeldreieck
  let s = '<path d="' + vieleck([[x + b, unten], [x + b, oben], [x + b + m.x, oben + m.y - giebel], [x + b + d.x, oben + d.y],
    [x + b + d.x, unten + d.y]]) + '" fill="#D8CCB3"' + BAU_KANTE + "/>";
  s += seitenFensterSvg(x + b, oben + 2.2, t * 0.32, t * 0.62, 3);
  // Vorderseite
  s += '<rect x="' + x + '" y="' + oben + '" width="' + b + '" height="' + h + '" fill="url(#kaWandHell)"' + BAU_KANTE + "/>";
  s += fensterSvg(x + 2.4, oben + 2.2, 3.8, 3.4) + fensterSvg(x + 11.8, oben + 2.2, 3.8, 3.4);
  s += '<rect x="' + (x + 7.4) + '" y="' + (unten - 5.2) + '" width="3.2" height="5.2" fill="#7A5A3A"/>';
  // Dachfläche zum Betrachter, steht an den Seiten etwas über; Ziegelreihen und heller First
  const traufe = [[x - 1.4, oben + 0.6], [x + b + 1.4, oben + 0.6]];
  const first = [[x - 1.4 + m.x, oben + m.y - giebel], [x + b + 1.4 + m.x, oben + m.y - giebel]];
  s += '<path d="' + vieleck([traufe[0], first[0], first[1], traufe[1]]) + '" fill="url(#kaZiegel)"' + BAU_KANTE + "/>";
  let reihen = "";
  for (let k = 1; k < 4; k++) {
    const a = k / 4;
    const ya = traufe[0][1] + (first[0][1] - traufe[0][1]) * a;
    const xa = traufe[0][0] + (first[0][0] - traufe[0][0]) * a;
    reihen += "M" + xa.toFixed(1) + "," + ya.toFixed(1) + " h" + (b + 2.8) + " ";
  }
  s += '<path d="' + reihen + '" stroke="#7E3F27" stroke-opacity="0.28" stroke-width="0.5"/>';
  s += '<path d="M' + first[0][0].toFixed(1) + "," + first[0][1].toFixed(1) + " H" + first[1][0].toFixed(1) +
    '" stroke="#E6A386" stroke-width="0.8" stroke-linecap="round"/>';
  // kleiner Schornstein auf dem Dach
  s += quaderSvg(x + 12.5 + m.x * 0.6, oben + m.y * 0.6 - giebel * 0.75 - 2, 2.2, 3, 2, { front: "#B0634A", seite: "#8F4A35", dach: "#C77A60" });
  return s;
}

// Schild „Brutgebiet“: auf der Spitze stehendes Dreieck mit grünem Rand, Vogel auf dem Nest
function brutSchildSvg(x, boden, tinte) {
  const spitze = boden - 6;
  const oben = spitze - 15;
  let s = '<line x1="' + x + '" y1="' + boden + '" x2="' + x + '" y2="' + spitze + '" stroke="' + tinte + '" stroke-width="1.5"/>';
  s += '<path d="M' + (x - 9.5) + "," + oben + " L" + (x + 9.5) + "," + oben + " L" + x + "," + spitze + ' Z" ' +
    'fill="#ffffff" stroke="#2E8B57" stroke-width="2.2" stroke-linejoin="round"/>';
  // Nest
  s += '<path d="M' + (x - 4) + "," + (oben + 6.3) + " Q" + x + "," + (oben + 9.4) + " " + (x + 4) + "," + (oben + 6.3) + ' Z" fill="' + tinte + '"/>';
  // Vogel: Körper, Hals, Kopf, Schnabel
  s += '<ellipse cx="' + (x - 0.6) + '" cy="' + (oben + 5) + '" rx="3" ry="1.7" fill="#ffffff" stroke="' + tinte + '" stroke-width="0.7"/>' +
    '<path d="M' + (x + 1.6) + "," + (oben + 4.2) + " L" + (x + 2.3) + "," + (oben + 1.6) + '" stroke="' + tinte + '" stroke-width="0.9"/>' +
    '<circle cx="' + (x + 2.6) + '" cy="' + (oben + 1.4) + '" r="1.1" fill="' + tinte + '"/>' +
    '<path d="M' + (x + 3.5) + "," + (oben + 1.3) + " l1.5,0.3 l-1.5,0.4 Z\" fill=\"#E2A92B\"/>";
  return s;
}

// Fabrik: Halle mit Sheddach (Zacken laufen von vorne nach hinten), Oberlichter, Schornstein hinten
// rechts auf dem Dach, Fensterband, Rolltor und Schild. x, y, b, h = Grundfläche wie früher,
// zacken = Zahl der Dachzacken, schrift = Schriftgröße des Schilds
function fabrikSvg(x, y, b, h, zacken, schrift) {
  const m = fabrikMasse(x, y, b, h);
  const d = m.d;
  const oben = m.oben;
  const unten = y + h;
  // rechte Seitenwand
  let s = '<path d="' + vieleck([[x + b, oben], [x + b + d.x, oben + d.y], [x + b + d.x, unten + d.y], [x + b, unten]]) +
    '" fill="#8F999F"' + BAU_KANTE + "/>";
  // Sheddach: schräge Dachflächen, am First ein Streifen Oberlicht
  const zahn = b / zacken;
  const zh = 6;
  for (let i = 0; i < zacken; i++) {
    const x0 = x + i * zahn;
    const x1 = x0 + zahn;
    s += '<path d="' + vieleck([[x0, oben - zh], [x1, oben], [x1 + d.x, oben + d.y], [x0 + d.x, oben - zh + d.y]]) +
      '" fill="url(#kaShed)"' + BAU_KANTE + "/>";
    s += '<path d="M' + (x0 + 0.8).toFixed(1) + "," + (oben - zh + 0.9).toFixed(1) + " l" + d.x.toFixed(1) + "," + d.y.toFixed(1) +
      '" stroke="#D6E8F2" stroke-width="1.3" stroke-linecap="round"/>';
    s += '<path d="' + vieleck([[x0, oben], [x0, oben - zh], [x1, oben]]) + '" fill="#B9C1C6"' + BAU_KANTE + "/>";
  }
  // Vorderseite
  s += '<rect x="' + x + '" y="' + oben + '" width="' + b + '" height="' + m.hv + '" fill="url(#kaWandGrau)"' + BAU_KANTE + "/>";
  // Rolltor rechts, Schild und Fensterband links davon
  const tor = Math.round(m.hv * 0.45);
  const torX = x + b - tor - 4;
  const sh = schrift + 1.6;
  s += '<rect x="' + (x + 5) + '" y="' + (oben + 2.4) + '" width="' + (torX - x - 8) + '" height="' + sh.toFixed(1) + '" rx="1" fill="#FBFAF6" stroke="#6C7880" stroke-width="0.5"/>' +
    '<text x="' + (x + 5 + (torX - x - 8) / 2).toFixed(1) + '" y="' + (oben + 2.4 + sh * 0.78).toFixed(1) + '" text-anchor="middle" font-size="' + schrift +
    '" font-weight="700" letter-spacing="0.5" fill="#2E4352">FABRIK</text>';
  const fy = Math.max(oben + 2.4 + sh + 1.4, unten - 8.5);
  const fh = Math.min(4.6, unten - fy - 2);
  for (let fx = x + 4; fx + 5 <= torX - 2; fx += 7) s += fensterSvg(fx, fy, 5, fh);
  s += '<rect x="' + torX + '" y="' + (unten - tor) + '" width="' + tor + '" height="' + tor + '" fill="#7C878F"' + BAU_KANTE + "/>";
  let lamellen = "";
  for (let i = 1; i < 5; i++) lamellen += "M" + torX + "," + (unten - tor + i * tor / 5).toFixed(1) + " h" + tor + " ";
  s += '<path d="' + lamellen + '" stroke="#5F6A72" stroke-width="0.4"/>';
  // Schornstein: Zylinder mit Licht von links, zwei dunkle Ringe, Öffnung oben
  const kl = m.kx - m.kr;
  s += '<rect x="' + kl.toFixed(1) + '" y="' + m.kSpitze.toFixed(1) + '" width="' + (2 * m.kr).toFixed(1) + '" height="' + (m.kFuss - m.kSpitze).toFixed(1) +
    '" fill="url(#kaZylinder)"/>';
  [0.18, 0.34].forEach(function (a) {
    const ry = m.kSpitze + (m.kFuss - m.kSpitze) * a;
    s += '<rect x="' + kl.toFixed(1) + '" y="' + ry.toFixed(1) + '" width="' + (2 * m.kr).toFixed(1) + '" height="2.2" fill="#5C666E" opacity="0.8"/>';
  });
  s += '<ellipse cx="' + m.kx.toFixed(1) + '" cy="' + m.kFuss.toFixed(1) + '" rx="' + m.kr.toFixed(1) + '" ry="' + (m.kr * 0.45).toFixed(1) + '" fill="#8C979E"/>' +
    '<ellipse cx="' + m.kx.toFixed(1) + '" cy="' + m.kSpitze.toFixed(1) + '" rx="' + m.kr.toFixed(1) + '" ry="' + (m.kr * 0.45).toFixed(1) +
    '" fill="#3E474E" stroke="#9AA4AC" stroke-width="0.6"/>';
  return s;
}

// ---------- Müll als kleine Symbole ----------
// Drei Farbfamilien: Plastik (weiß/hellblau), Glas (grün), Essensreste (gelb/orange).
// Im Stil des Titelbilds: weiche, farbige Kanten statt Tinte, Licht von links oben (helle Glanzkante),
// Etikett oder Muster für Wiedererkennbarkeit. Am Boden liegender Müll wirft einen kleinen Schatten
// (siehe muellSymbolSvg), schwimmender nicht.
// Alle Formen sind um (0,0) gezeichnet, etwa 12 Einheiten lang (Strand ist 22 breit).
const MUELL_FARBEN = {
  plastik: { flaeche: "#EEF5F8", flaeche2: "#CFE2EC", etikett: "#6FA8CB", rand: "#6F8A9C" },
  glas:    { flaeche: "#6E9E4A", flaeche2: "#A5CB82", etikett: "#EFE6CC", rand: "#4C7334" },
  essen:   { flaeche: "#EDB53C", flaeche2: "#E07B39", kern: "#F6E6BE", rand: "#A9761A" }
};

function muellFormen() {
  const p = MUELL_FARBEN.plastik;
  const g = MUELL_FARBEN.glas;
  const e = MUELL_FARBEN.essen;
  const linie = function (farbe) {
    return ' stroke="' + farbe + '" stroke-opacity="0.8" stroke-width="0.45" stroke-linejoin="round"';
  };
  const glanz = function (d, deckkraft) {
    return '<path d="' + d + '" fill="none" stroke="#FFFFFF" stroke-opacity="' + (deckkraft || 0.75) + '" stroke-width="0.6" stroke-linecap="round"/>';
  };
  return {
    // Plastik: liegende Flasche mit Etikett (Boden links, Verschluss rechts), Tüte mit Falten, bunte Verpackung
    flasche: '<path d="M-6,-2.2 H1.6 Q3,-2.2 3.8,-1 H5 V1 H3.8 Q3,2.2 1.6,2.2 H-6 Q-6.8,2.2 -6.8,1.4 V-1.4 Q-6.8,-2.2 -6,-2.2 Z" ' +
      'fill="' + p.flaeche + '" fill-opacity="0.95"' + linie(p.rand) + "/>" +
      '<rect x="-4" y="-2.2" width="3.8" height="4.4" fill="' + p.etikett + '" opacity="0.85"/>' +
      '<rect x="5" y="-1.35" width="1.6" height="2.7" rx="0.3" fill="' + p.etikett + '"' + linie(p.rand) + "/>" +
      glanz("M-5.6,-1.3 H-4.4 M0.4,-1.3 H2.2"),
    tuete: '<path d="M-4,-4.6 H-2 V-2.4 Q0,-1 2,-2.4 V-4.6 H4 L4.7,4 Q0,5.3 -4.7,4 Z" fill="' + p.flaeche + '" fill-opacity="0.92"' + linie(p.rand) + "/>" +
      '<path d="M-1.6,-0.4 Q-0.6,1.8 -1.8,3.8 M1.8,0 Q1,2 2.2,4" fill="none" stroke="' + p.rand + '" stroke-opacity="0.35" stroke-width="0.4"/>' +
      '<path d="M-2.6,1.4 H2.6" stroke="' + p.etikett + '" stroke-opacity="0.7" stroke-width="0.9"/>' +
      glanz("M-3.2,-0.8 L-3.6,2.6", 0.6),
    verpackung: '<path d="M-2.7,-3.6 L-2,-3.1 L-1.35,-3.6 L-0.7,-3.1 L0,-3.6 L0.7,-3.1 L1.35,-3.6 L2,-3.1 L2.7,-3.6 V3.6 ' +
      'L2,3.1 L1.35,3.6 L0.7,3.1 L0,3.6 L-0.7,3.1 L-1.35,3.6 L-2,3.1 L-2.7,3.6 Z" fill="' + p.flaeche2 + '"' + linie(p.rand) + "/>" +
      '<rect x="-2.7" y="-1.2" width="5.4" height="2.4" fill="#E8662A" opacity="0.75"/>' +
      glanz("M-1.8,-2.4 V-1.6 M-1.8,1.8 V2.4", 0.7),
    // Glas: heile Flasche mit Etikett und langem Hals, zerbrochene Flasche mit Scherben
    glasflasche: '<path d="M-6,-2.3 H0.6 Q2.4,-2.3 3,-1 H6.4 V1 H3 Q2.4,2.3 0.6,2.3 H-6 Q-6.8,2.3 -6.8,1.5 V-1.5 Q-6.8,-2.3 -6,-2.3 Z" ' +
      'fill="' + g.flaeche + '" fill-opacity="0.92"' + linie(g.rand) + "/>" +
      '<rect x="-4.6" y="-2.3" width="3.6" height="4.6" fill="' + g.etikett + '" opacity="0.85"/>' +
      glanz("M-5.8,-1.3 H-4.9 M-0.6,-1.3 H1 M3.4,-0.4 H5.8", 0.6),
    scherbe: '<path d="M5.6,-1 H3.6 Q2.8,-2.4 1.2,-2.4 H-3 L-4.3,-1.3 L-3.3,-0.5 L-5,0.5 L-3.7,1.3 L-4.6,2.4 H1.2 Q2.8,2.4 3.6,1 H5.6 Z" ' +
      'fill="' + g.flaeche + '" fill-opacity="0.92"' + linie(g.rand) + "/>" +
      '<polygon points="-7.4,-1.8 -5.9,0.2 -8,0.6" fill="' + g.flaeche2 + '"' + linie(g.rand) + "/>" +
      '<polygon points="-7.6,2 -6.2,1.6 -6.8,3.3" fill="' + g.flaeche2 + '"' + linie(g.rand) + "/>" +
      glanz("M-2.6,-1.4 H1.4", 0.6),
    // Essensreste: Apfelbutzen (aufrecht) und Bananenschale mit braunen Stellen
    apfel: '<path d="M-2.2,-2.3 Q-0.5,0 -2.2,2.3 H2.2 Q0.5,0 2.2,-2.3 Z" fill="' + e.kern + '"' + linie(e.rand) + "/>" +
      '<path d="M-2.6,-2.3 Q0,-4.8 2.6,-2.3 Q0,-1.6 -2.6,-2.3 Z" fill="' + e.flaeche2 + '"' + linie(e.rand) + "/>" +
      '<path d="M-2.6,2.3 Q0,1.6 2.6,2.3 Q0,4.6 -2.6,2.3 Z" fill="' + e.flaeche2 + '"' + linie(e.rand) + "/>" +
      '<path d="M-0.3,-0.8 l0.3,0.6 M0.4,0.4 l-0.2,0.6" stroke="#6B4A2A" stroke-width="0.5" stroke-linecap="round"/>' +
      '<path d="M0,-3.6 Q0.2,-4.6 0.9,-5.1" fill="none" stroke="#7A5A3A" stroke-width="0.6" stroke-linecap="round"/>' +
      glanz("M-1.6,-3.1 Q-0.8,-3.7 0,-3.8", 0.7),
    banane: '<path d="M0,-2.8 Q-3.8,-1.8 -4.6,3.2 Q-2.6,2 -0.6,-1.4 Z M0,-2.8 Q3.8,-1.6 4.7,2.6 Q2.6,1.7 0.6,-1.4 Z ' +
      'M-0.6,-2.4 Q-1,1.2 0.2,4.8 Q1.6,1.2 0.6,-2.4 Z" fill="' + e.flaeche + '"' + linie(e.rand) + "/>" +
      '<g fill="#8A5A1E" opacity="0.6"><circle cx="-3" cy="1.6" r="0.45"/><circle cx="3.2" cy="1.2" r="0.4"/><circle cx="0.3" cy="2.6" r="0.35"/></g>' +
      '<rect x="-0.5" y="-4.6" width="1" height="1.9" rx="0.3" fill="' + e.rand + '"/>'
  };
}
const MUELL_FORMEN = muellFormen();

// Formen je Müllart; liegende Formen werden flach gedreht, aufrechte nur leicht geneigt
const MUELL_ARTEN = {
  plastik: ["flasche", "tuete", "verpackung", "flasche"],
  glas: ["scherbe", "glasflasche", "scherbe"],
  essen: ["apfel", "banane"]
};
const MUELL_AUFRECHT = ["apfel", "banane", "tuete", "verpackung"];

// schwimmt = true: im Wasser, ohne Schatten (Treibgut, Müll im Fluss).
// Jedes Teil steckt in einer Gruppe .ka-muell, damit die Minikarte der Einführung es ausblenden kann.
function muellSymbolSvg(form, x, y, winkel, groesse, schwimmt) {
  let s = "";
  if (!schwimmt) {
    const tief = MUELL_AUFRECHT.indexOf(form) >= 0 ? 4.4 : 2;
    s += '<ellipse cx="' + (x + 1.4 * groesse).toFixed(1) + '" cy="' + (y + tief * groesse).toFixed(1) + '" rx="' + (5.4 * groesse).toFixed(1) +
      '" ry="' + (1.5 * groesse).toFixed(1) + '" fill="#3B2F1E" opacity="0.16"/>';
  }
  return '<g class="ka-muell">' + s + '<g transform="translate(' + x.toFixed(1) + "," + y.toFixed(1) + ") rotate(" + Math.round(winkel) +
    ") scale(" + groesse.toFixed(2) + ')">' + MUELL_FORMEN[form] + "</g></g>";
}

// ---------- Wo Müll liegen darf ----------
// Hotspots liegen an den Verursachern. Gebäude, Fluss, Infopunkte und Personen bleiben frei.
// Infopunkte und Personen stehen in Prozent der Karte; hier in Karteneinheiten umgerechnet.
function muellSperrflaechen(z) {
  const flaechen = [
    [612, 26, 74, 54], [434, 16, 76, 76], [508, 72, 44, 33],     // Fabrik, Hotel, Kiosk
    [730, 90, 22, 80], [647, 76, 10, 34]                           // Hafensteg, Abwasserrohr
  ];
  if (istUmgesetzt(z, "gewerbe")) {
    flaechen.push([684, 46, 58, 38], [374, 14, 76, 72], [516, 34, 36, 38], [548, 16, 36, 38]);
  }
  INFOPUNKTE.forEach(function (p) {
    flaechen.push([p.x * 8 - 15, p.y * 3.2 - 14, 30, 38]);       // Knopf und Beschriftung
  });
  if (istUmgesetzt(z, "schilder")) {
    muelleimerOrte().forEach(function (o) { flaechen.push([o.x - 6, o.y - 14, 12, 15]); });
    hinweisSchildOrte().forEach(function (o) { flaechen.push([o.x - 9, o.y - 26, 18, 27]); });
  }
  if (istUmgesetzt(z, "muellfaenger")) {
    const m = muellfaengerLage(istUmgesetzt(z, "aue")).rechts;
    flaechen.push([m[0] - 6, m[1] - 24, 34, 30]);
  }
  Object.keys(PERSONEN).forEach(function (id) {
    const p = PERSONEN[id];
    flaechen.push([p.x * 8 - 13, p.y * 3.2 - 40, 26, 46]);       // Figur mit Sprechblase und Name
  });
  return flaechen;
}

function imRechteck(x, y, flaechen) {
  return flaechen.some(function (f) {
    return x > f[0] && x < f[0] + f[2] && y > f[1] && y < f[1] + f[3];
  });
}

// Abstand zum Ufer (nicht zur Flussmitte), weil der Fluss zur Mündung hin breiter wird
function abstandZumFluss(x, y, punkte) {
  return Math.min.apply(null, punkte.map(function (p) { return Math.hypot(p.x - x, p.y - y) - flussBreite(p.s) / 2; }));
}

// Hotspots am Strand: Abschnitt von x bis x + b, Anteile der Müllarten, Anzahl Plätze
// Hotspots an Land: Ellipse um (x, y) mit Halbachsen rx, ry; „amFluss“ = entlang beider Ufer.
// quelle: welcher Eintrag die Menge an Land steuert (strand = Strandbesucher, land = Hinterland)
const MUELL_HOTSPOTS = {
  strand: [
    { id: "muendung",  x: 160, b: 140, arten: { plastik: 1 }, plaetze: 8 },
    { id: "hotels",    x: 316, b: 188, arten: { essen: 0.7, plastik: 0.3 }, plaetze: 10 },
    { id: "kiosk",     x: 506, b: 92,  arten: { plastik: 0.85, essen: 0.15 }, plaetze: 5 },
    { id: "industrie", x: 600, b: 128, arten: { glas: 0.75, plastik: 0.25 }, plaetze: 8 }
  ],
  land: [
    { id: "hotels",    x: 470, y: 70, rx: 96, ry: 24, arten: { essen: 0.75, plastik: 0.25 }, plaetze: 8, quelle: "strand" },
    { id: "industrie", x: 664, y: 80, rx: 86, ry: 30, arten: { glas: 0.65, plastik: 0.35 }, plaetze: 7, quelle: "land" },
    { id: "fluss", amFluss: true, arten: { plastik: 0.8, glas: 0.2 }, plaetze: 6, quelle: "land" }
  ]
};
const MUELL_STRAND_MAX = 32;
const MUELL_ABSTAND = 9;          // Mindestabstand zwischen zwei Symbolen

function formWaehlen(arten, r) {
  let wert = r();
  let art = "plastik";
  Object.keys(arten).some(function (a) {
    wert -= arten[a];
    art = a;
    return wert <= 0;
  });
  const formen = MUELL_ARTEN[art];
  return { art: art, form: formen[Math.floor(r() * formen.length)] };
}

function muellTeil(art, form, x, y, r, groesseLiegend, groesseAufrecht) {
  const aufrecht = MUELL_AUFRECHT.indexOf(form) >= 0;
  return {
    art: art, form: form, x: x, y: y,
    winkel: aufrecht ? (r() - 0.5) * 30 : (r() < 0.5 ? 0 : 180) + (r() - 0.5) * 24,
    groesse: aufrecht ? groesseAufrecht : groesseLiegend
  };
}

// Feste Plätze je Hotspot (gleiche Zufallsfolge = Müll springt nicht von Runde zu Runde).
// Rang = Platznummer / Plätze: Bei weniger Müll leeren sich alle Hotspots gleichmäßig.
function hotspotPlaetze(z, lage) {
  const sperre = muellSperrflaechen(z);
  const aue = istUmgesetzt(z, "aue");
  const fluss = flussMitte(20, aue);
  const r = zufallsfolge(lage === "strand" ? 7 : 13);
  const alle = [];
  MUELL_HOTSPOTS[lage].forEach(function (h) {
    const eigene = [];
    for (let versuch = 0; versuch < 400 && eigene.length < h.plaetze; versuch++) {
      let x;
      let y;
      if (lage === "strand") {
        x = h.x + r() * h.b;
        y = kuestenlinie(x) + 7 + r() * 10;
      } else if (h.amFluss) {
        // Ufer im Mittel- und Unterlauf, abwechselnd links und rechts
        const stelle = 0.5 + r() * 1.25;
        const p = flussPunkt(stelle, aue);
        const seite = (r() < 0.5 ? -1 : 1) * (14 + r() * 7);
        x = p.x - p.ry * seite;
        y = p.y + p.rx * seite;
      } else {
        const winkel = r() * 2 * Math.PI;
        const radius = Math.sqrt(r());
        x = h.x + Math.cos(winkel) * h.rx * radius;
        y = h.y + Math.sin(winkel) * h.ry * radius;
      }
      if (x < 8 || x > KARTE_B - 8 || y < 10) continue;
      if (lage === "land" && y > kuestenlinie(x) - 6) continue;            // nicht im Sand
      if (imRechteck(x, y, sperre)) continue;
      if (abstandZumFluss(x, y, fluss) < 6) continue;                      // nicht im Fluss und nicht direkt am Ufer
      if (eigene.concat(alle).some(function (m) { return Math.hypot(m.x - x, m.y - y) < MUELL_ABSTAND; })) continue;
      const wahl = formWaehlen(h.arten, r);
      const teil = lage === "strand"
        ? muellTeil(wahl.art, wahl.form, x, y, r, 1.1, 1.25)
        : muellTeil(wahl.art, wahl.form, x, y, r, 0.95, 1.1);
      teil.hotspot = h.id;
      teil.quelle = h.quelle;
      teil.rang = (eigene.length + 0.5) / h.plaetze;
      eigene.push(teil);
    }
    Array.prototype.push.apply(alle, eigene);
  });
  return alle.sort(function (a, b) { return a.rang - b.rang; });
}

// Strand: Anzahl folgt dem Strandmüll (Bestand)
function strandMuellListe(z) {
  const anzahl = Math.min(MUELL_STRAND_MAX, Math.round(z.strandmuell / 8));
  return hotspotPlaetze(z, "strand").slice(0, anzahl);
}

// Land: um die Hotels folgt der Müll den Strandbesuchern, um Fabrik und Fluss dem Eintrag aus dem Hinterland
function landMuellListe(z) {
  const anteil = {
    strand: begrenzen(z.eintrag.strand / EINTRAG_GRUND.strand, 0, 1),
    land: begrenzen(z.eintrag.land / EINTRAG_GRUND.land, 0, 1)
  };
  return hotspotPlaetze(z, "land").filter(function (m) { return m.rang < anteil[m.quelle]; });
}

// Müll im Fluss: treibt mit der Strömung Richtung Meer. Ein wirksamer Müllfänger hält ihn auf.
const FLUSS_MUELL_MAX = 7;

function flussMuellSvg(z, muellfaengerWirkt) {
  const anzahl = Math.min(FLUSS_MUELL_MAX, Math.round(z.eintrag.land / 3.2));
  const r = zufallsfolge(19);
  const aue = istUmgesetzt(z, "aue");
  let s = "";
  for (let i = 0; i < FLUSS_MUELL_MAX; i++) {
    let lage = 0.1 + (i + r()) / FLUSS_MUELL_MAX * 1.8;                   // 0 bis 2 über beide Abschnitte
    if (muellfaengerWirkt) lage = 0.1 + (lage - 0.1) * (1.22 / 1.9);       // nur oberhalb der Barriere
    const p = flussPunkt(lage, aue);
    const quer = (r() - 0.5) * 6;
    const form = MUELL_ARTEN.plastik[Math.floor(r() * MUELL_ARTEN.plastik.length)];
    const winkel = Math.atan2(p.ry, p.rx) * 180 / Math.PI + (r() - 0.5) * 30;
    if (i >= anzahl) continue;
    s += muellSymbolSvg(form, p.x - p.ry * quer, p.y + p.rx * quer, winkel, 0.8, true);
  }
  return s;
}

// Treibgut nahe dem Strand: schwimmende Plastikflaschen und -tüten mit kleinen Wellen
const TREIBGUT_MAX = 18;
const TREIBGUT_FORMEN = ["flasche", "tuete", "flasche", "tuete", "verpackung", "flasche"];

function treibgutSvg(anzahl) {
  const r = zufallsfolge(31);
  let s = "";
  for (let i = 0; i < TREIBGUT_MAX; i++) {
    const x = 26 + r() * 690;
    const y = kuestenlinie(x) + STRAND_BREITE + 9 + Math.pow(r(), 1.3) * 42;
    const form = TREIBGUT_FORMEN[Math.floor(r() * TREIBGUT_FORMEN.length)];
    const winkel = form === "flasche" ? (r() - 0.5) * 30 + (r() < 0.5 ? 180 : 0) : (r() - 0.5) * 50;
    if (i >= anzahl) continue;
    s += muellSymbolSvg(form, x, y, winkel, 1.2, true) +
      '<path d="M' + (x - 8).toFixed(1) + "," + (y + 5.6).toFixed(1) + " q4,-1.8 8,0 t8,0\" fill=\"none\" " +
      'stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="0.8" stroke-linecap="round"/>';
  }
  return s;
}

function treibgutAnzahl(z) {
  return Math.min(TREIBGUT_MAX, Math.round(z.eintrag.gesamt / 5));
}

// Kleines Symbol für die Legende unter der Karte. Breite und Höhe stehen direkt am SVG,
// damit die Größe auch ohne passende CSS-Regel stimmt.
// Legendentext zu den Fischen: welche Arten gerade zu sehen sind
function fischLegende(artenvielfalt) {
  const namen = sichtbareFischArten(artenvielfalt).map(function (a) { return a.name; });
  return "Fische: " + (namen.length <= 3
    ? namenListe(namen)
    : namen.slice(0, 2).join(", ") + " und " + (namen.length - 2) + " weitere Arten");
}

function legendenSvg(inhalt, viewBox) {
  return '<svg class="lg-symbol" width="20" height="15" viewBox="' + viewBox + '" aria-hidden="true" focusable="false">' +
    inhalt + "</svg>";
}

function legendenSymbol(form, winkel, groesse) {
  return legendenSvg('<g transform="rotate(' + (winkel || 0) + ") scale(" + (groesse || 1) + ')">' + MUELL_FORMEN[form] + "</g>",
    "-8 -6 16 12");
}

// ---------- Hafen, Schiffe und Mülleimer ----------
// Flache Grafiken mit dünnem Tintenrand wie Hotels und Fabrik; Farben aus dem Spiel:
// Tinte, Rot (Rumpf unten), Blau (Rumpf), Creme (Aufbauten), Orange (Winde), Holz (Steg).
const HAFEN_FARBEN = {
  creme: "#FBF1DC",
  rumpf: "#2F5F86",
  rumpfHell: "#4C7FA8",
  unterwasser: "#C8382E",
  fenster: "#9CC7E0",
  mast: "#F1E2C4",
  takel: "#8E6E5A",
  holz: "#CDB68A",
  holzFuge: "#A68C5E",
  pfahl: "#8C7350",
  pfahlKopf: "#B39B6E",
  eimer: "#3E6E8C",
  eimerDeckel: "#2B526E"
};

// Fischkutter in Seitenansicht, Bug rechts. (x, y) = Mitte auf der Wasserlinie.
function kutterSvg(x, y, groesse, spiegeln, tinte) {
  const f = HAFEN_FARBEN;
  let s = '<g transform="translate(' + x.toFixed(1) + "," + y.toFixed(1) + ") scale(" + (spiegeln ? -groesse : groesse) +
    "," + groesse + ')">';
  // Kielwasser
  s += '<path d="M-24,6.2 q3,-1.4 6,0 t6,0 M-30,8.4 q3,-1.4 6,0" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" ' +
    'stroke-width="0.9" stroke-linecap="round"/>';
  // Takelage und Masten (hinter dem Rumpf)
  s += '<path d="M-11,-22 L-18,-3 M-11,-22 L-2,-12 M10,-20 L17,-7 M10,-20 L3,-7 M-11,-22 L10,-20" fill="none" ' +
    'stroke="' + f.takel + '" stroke-width="0.4"/>';
  s += '<path d="M-11,-12 V-22.5 M10,-6 V-20.5" stroke="' + tinte + '" stroke-width="1.9" stroke-linecap="round"/>' +
    '<path d="M-11,-12 V-22.5 M10,-6 V-20.5" stroke="' + f.mast + '" stroke-width="1" stroke-linecap="round"/>';
  // Ruderhaus mit Bullaugen und rotem Dach, Kiste am Heck
  s += '<rect x="-17.5" y="-7" width="4.6" height="4.2" fill="' + f.creme + '" stroke="' + tinte + '" stroke-width="0.7"/>';
  s += '<rect x="-13.5" y="-12.2" width="11.5" height="9.4" fill="' + f.creme + '" stroke="' + tinte + '" stroke-width="0.8"/>' +
    '<rect x="-14.4" y="-13.8" width="13.3" height="1.9" rx="0.5" fill="' + f.unterwasser + '" stroke="' + tinte + '" stroke-width="0.6"/>';
  [-10.6, -7.7, -4.8].forEach(function (bx) {
    s += '<circle cx="' + bx + '" cy="-8.6" r="1.05" fill="' + f.fenster + '" stroke="' + tinte + '" stroke-width="0.45"/>';
  });
  // Netzwinde
  s += '<circle cx="3.6" cy="-5.4" r="2.3" fill="#E8662A" stroke="' + tinte + '" stroke-width="0.6"/>' +
    '<circle cx="3.6" cy="-5.4" r="0.8" fill="' + tinte + '"/>';
  // Rumpf: oben blau mit hellem Streifen, unten rot, Bug hochgezogen
  const rumpf = "M-18.5,-3 H7.5 Q11.5,-3 13.5,-7.2 H18.5 Q17.6,0.4 13.2,5 H-14.2 Q-17.4,2.2 -18.5,-3 Z";
  s += '<path d="' + rumpf + '" fill="' + f.rumpf + '"/>';
  s += '<path d="M-18.3,-2 H7.8 Q12,-2 14.1,-6.1 H18.3" fill="none" stroke="' + f.rumpfHell + '" stroke-width="1.2"/>';
  s += '<path d="M-16.7,1.6 H16 Q15,3.8 13.2,5 H-14.2 Q-15.9,3.6 -16.7,1.6 Z" fill="' + f.unterwasser + '"/>';
  s += '<path d="' + rumpf + '" fill="none" stroke="' + tinte + '" stroke-width="0.9" stroke-linejoin="round"/>';
  return s + "</g>";
}

// Kreuzfahrtschiff in Seitenansicht, Bug rechts. (x, y) = Mitte auf der Wasserlinie.
function kreuzfahrtschiffSvg(x, y, groesse, tinte) {
  const f = HAFEN_FARBEN;
  let s = '<g transform="translate(' + x.toFixed(1) + "," + y.toFixed(1) + ") scale(" + groesse + ')">';
  const linie = ' stroke="' + tinte + '" stroke-width="0.9" stroke-linejoin="round"';
  // Schornsteine
  s += '<rect x="-12" y="-24.5" width="2.6" height="7" rx="0.6" fill="' + tinte + '"/>' +
    '<rect x="-7.8" y="-23" width="2.6" height="5.5" rx="0.6" fill="' + tinte + '"/>';
  // Oberdeck (weiß) und Panoramadeck (hellblau) mit Fensterreihe
  s += '<path d="M-18,-18 H6 Q8.4,-18 9.6,-15.6 L11,-12.6 H-18 Z" fill="#FFFFFF"' + linie + "/>";
  s += '<path d="M-24.5,-13 H14.5 L19,-6 H-24.5 Z" fill="#BFE6F4"' + linie + "/>";
  for (let i = 0; i < 8; i++) {
    s += '<rect x="' + (-22 + i * 4.6).toFixed(1) + '" y="-10.6" width="2.6" height="1.8" rx="0.3" fill="' + tinte + '"/>';
  }
  // Rumpf: weißes Band, darunter rot; Bug steigt an
  s += '<path d="M-27.5,-6 H21.5 L29,-9 L27.6,-1.6 H-27.5 Z" fill="#FFFFFF"' + linie + "/>";
  s += '<rect x="19.5" y="-5" width="1.8" height="1.6" fill="' + tinte + '"/><rect x="23" y="-5.6" width="1.8" height="1.6" fill="' + tinte + '"/>';
  s += '<path d="M-27.5,-1.6 H27.6 Q26,5 21.6,8 H-23 Q-26.4,5.4 -27.5,-1.6 Z" fill="' + f.unterwasser + '"' + linie + "/>";
  // Wellen an der Wasserlinie
  s += '<path d="M-30,9.2 q3.5,-1.8 7,0 t7,0 t7,0 t7,0 t7,0 t7,0 t7,0 t7,0 t7,0" fill="none" stroke="#FFFFFF" ' +
    'stroke-opacity="0.6" stroke-width="0.9" stroke-linecap="round"/>';
  return s + "</g>";
}

// Steg von oben: Holzplanken, Pfähle an beiden Rändern. Mit Kreuzfahrtanleger als T.
function stegSvg(yOben, tStueck, tinte) {
  const f = HAFEN_FARBEN;
  const links = 734;
  const rechts = 748;
  const yEnde = yOben + (tStueck ? 78 : 70);
  const tLinks = 682;
  const tRechts = 798;
  const tBreite = 12;
  let umriss = "M" + links + "," + yOben + " H" + rechts + " V" + yEnde;
  umriss += tStueck
    ? " H" + tRechts + " V" + (yEnde + tBreite) + " H" + tLinks + " V" + yEnde + " H" + links + " Z"
    : " H" + links + " Z";
  let s = '<path d="' + umriss + '" fill="' + f.holz + '"/>';
  // Planken: quer im Steg, im T-Stück längs zum Steg
  let fugen = "";
  for (let y = yOben + 4; y < yEnde - 1; y += 4) fugen += "M" + (links + 0.6) + "," + y + " H" + (rechts - 0.6) + " ";
  if (tStueck) {
    for (let x = tLinks + 4; x < tRechts - 1; x += 4) fugen += "M" + x + "," + (yEnde + 0.6) + " V" + (yEnde + tBreite - 0.6) + " ";
  }
  s += '<path d="' + fugen + '" stroke="' + f.holzFuge + '" stroke-width="0.6"/>';
  s += '<path d="' + umriss + '" fill="none" stroke="' + tinte + '" stroke-width="1" stroke-linejoin="round"/>';
  // Pfähle als kleine runde Köpfe an den Rändern
  const pfahl = function (px, py) {
    return '<circle cx="' + px + '" cy="' + py.toFixed(1) + '" r="1.7" fill="' + f.pfahl + '" stroke="' + tinte + '" stroke-width="0.55"/>' +
      '<circle cx="' + (px - 0.4) + '" cy="' + (py - 0.4).toFixed(1) + '" r="0.7" fill="' + f.pfahlKopf + '"/>';
  };
  for (let y = yOben + 10; y <= yEnde - (tStueck ? 6 : 4); y += 12) {
    s += pfahl(links - 0.4, y) + pfahl(rechts + 0.4, y);
  }
  if (tStueck) {
    for (let x = tLinks + 4; x <= tRechts - 3; x += 14) {
      if (x > links - 4 && x < rechts + 4) continue;                    // Stegansatz frei lassen
      s += pfahl(x, yEnde - 0.4);
    }
    for (let x = tLinks + 4; x <= tRechts - 3; x += 14) s += pfahl(x, yEnde + tBreite + 0.4);
  }
  return { svg: s, yEnde: yEnde, tUnten: yEnde + tBreite };
}

// Mülleimer mit Recycling-Zeichen, (x, y) = Mitte am Boden. Schräg von oben gesehen:
// leicht konische Tonne mit Licht von links, Deckel als Ellipse, Schatten nach rechts unten.
function muelleimerSvg(x, y, tinte) {
  const f = HAFEN_FARBEN;
  const kante = ' stroke="' + tinte + '" stroke-opacity="0.55" stroke-width="0.45" stroke-linejoin="round"';
  return '<g transform="translate(' + x.toFixed(1) + "," + y.toFixed(1) + ') scale(1.2)">' +
    '<ellipse cx="1.4" cy="0.1" rx="3.8" ry="1" fill="#0B2238" opacity="0.2"/>' +
    '<path d="M-3,-6.6 L-2.5,-0.5 Q0,0.5 2.5,-0.5 L3,-6.6 Z" fill="' + f.eimer + '"' + kante + "/>" +
    '<path d="M0.9,-6.6 L3,-6.6 L2.5,-0.5 Q1.7,-0.1 0.8,0 Z" fill="#000000" opacity="0.18"/>' +
    '<path d="M-2.2,-5.8 L-1.9,-1.2" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="0.6" stroke-linecap="round"/>' +
    '<circle cx="0" cy="-3.6" r="1.45" fill="none" stroke="#FFFFFF" stroke-width="0.65" stroke-dasharray="2.4 0.65"/>' +
    '<ellipse cx="0" cy="-6.8" rx="3.5" ry="1.25" fill="' + f.eimerDeckel + '"' + kante + "/>" +
    '<ellipse cx="-0.6" cy="-7" rx="1.9" ry="0.55" fill="#FFFFFF" opacity="0.22"/>' +
    '<rect x="-1" y="-8.6" width="2" height="1.2" rx="0.4" fill="' + f.eimerDeckel + '"' + kante + "/>" +
    "</g>";
}

// Windrad auf See: Fundament im Wasser, weißer Turm mit Schattenseite, Gondel, Rotor dreht sich
// langsam (CSS). Gezeichnet um den Fußpunkt (0,0) und mit groesse skaliert. Ein unsichtbarer Kreis um
// die Nabe macht sie zur Mitte der Rotorgruppe, damit der Rotor sich genau um die Nabe dreht.
// nummer versetzt die Drehung, damit nicht alle gleich stehen.
function windradSvg(x, y, nummer, groesse) {
  const n = -22.6;                                  // Höhe der Nabe
  let s = '<g transform="translate(' + x + "," + y + ") scale(" + (groesse || 1) + ')">';
  s += '<ellipse cx="0" cy="0.6" rx="4.6" ry="1.5" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="0.6"/>' +
    '<ellipse cx="3" cy="0.8" rx="5" ry="1.2" fill="#0B2238" opacity="0.15"/>' +
    '<rect x="-1.7" y="-3.2" width="3.4" height="3.6" fill="#E2A92B"/>' +
    '<rect x="0.2" y="-3.2" width="1.5" height="3.6" fill="#B9861D"/>' +
    '<path d="M-1.1,-3.2 L-0.6,' + (n + 1) + " L0.6," + (n + 1) + ' L1.1,-3.2 Z" fill="#F4F6F7"/>' +
    '<path d="M0,-3.2 L0,' + (n + 1) + " L0.6," + (n + 1) + ' L1.1,-3.2 Z" fill="#C9D2D8"/>' +
    '<rect x="-1.4" y="' + (n - 1.2) + '" width="4.4" height="2.5" rx="0.9" fill="#E9EDEF" stroke="#8C9AA4" stroke-width="0.25"/>';
  let fluegel = '<circle cx="0" cy="' + n + '" r="11.4" fill="none"/>';
  [0, 120, 240].forEach(function (w) {
    fluegel += '<path transform="rotate(' + w + " 0 " + n + ')" d="M0,' + n + ' l-0.9,-1.2 l0.9,-10 l0.9,1.4 Z" ' +
      'fill="#FAFBFB" stroke="#9AA7B0" stroke-width="0.25" stroke-linejoin="round"/>';
  });
  s += '<g class="ka-rotor" style="' + animStil(5 + nummer * 0.4, nummer * 0.7) + '">' + fluegel + "</g>";
  return s + '<circle cx="0" cy="' + n + '" r="1.1" fill="#DDE3E6" stroke="#8C9AA4" stroke-width="0.25"/></g>';
}

// Forschungsboje: gelber Schwimmkörper mit rotem Band, kleiner Mast mit Antenne und Licht, Wellenring
function bojeSvg(x, y) {
  return '<ellipse cx="' + x + '" cy="' + (y + 4) + '" rx="8" ry="2" fill="none" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="0.8"/>' +
    '<ellipse cx="' + (x + 2.5) + '" cy="' + (y + 4.4) + '" rx="6" ry="1.5" fill="#0B2238" opacity="0.18"/>' +
    '<path d="M' + x + "," + (y - 4) + " V" + (y - 15) + '" stroke="#5E5A52" stroke-width="1"/>' +
    '<path d="M' + (x - 2.4) + "," + (y - 11) + " H" + (x + 2.4) + '" stroke="#5E5A52" stroke-width="0.7"/>' +
    '<circle cx="' + x + '" cy="' + (y - 15.6) + '" r="1.2" fill="#E8662A"/>' +
    '<path d="M' + (x - 5.6) + "," + y + " A5.6,4.6 0 0 1 " + (x + 5.6) + "," + y + " Q" + x + "," + (y + 5) + " " + (x - 5.6) + "," + y + ' Z" fill="#E2A92B"/>' +
    '<path d="M' + (x - 5.5) + "," + (y + 0.6) + " Q" + x + "," + (y + 5) + " " + (x + 5.5) + "," + (y + 0.6) + " L" + (x + 5) + "," + (y + 2.4) +
    " Q" + x + "," + (y + 6) + " " + (x - 5) + "," + (y + 2.4) + ' Z" fill="#C8382E"/>' +
    '<path d="M' + (x + 1) + "," + (y - 4.4) + " A5.6,4.6 0 0 1 " + (x + 5.6) + "," + y + " Q" + (x + 3.5) + "," + (y + 2.6) + " " + (x + 1.2) + "," + (y + 3) +
    ' Z" fill="#000000" opacity="0.14"/>' +
    '<path d="M' + (x - 3.4) + "," + (y - 2.4) + " Q" + (x - 2) + "," + (y - 3.8) + " " + x + "," + (y - 4) +
    '" fill="none" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="0.8" stroke-linecap="round"/>';
}

// Hinweisschild „Müll in den Eimer“: gelbe Raute mit weißem Rand auf einem Pfosten, darauf eine Figur,
// die Abfall in einen Mülleimer wirft (wie das bekannte Piktogramm). (x, boden) = Fuß des Pfostens.
function hinweisSchildSvg(x, boden) {
  const t = "#1F1F1F";
  return '<g transform="translate(' + x.toFixed(1) + "," + boden.toFixed(1) + ') scale(1.15)">' +
    '<ellipse cx="2" cy="0.2" rx="3.4" ry="0.9" fill="#0B2238" opacity="0.2"/>' +
    '<rect x="-0.6" y="-10" width="1.2" height="10" fill="#6B6258"/>' +
    '<path d="M0,-21.6 L7.4,-14.2 L0,-6.8 L-7.4,-14.2 Z" fill="#FFFFFF" stroke="#8C8478" stroke-opacity="0.5" stroke-width="0.3"/>' +
    '<path d="M0,-20.4 L6.2,-14.2 L0,-8 L-6.2,-14.2 Z" fill="#E9B92F"/>' +
    '<path d="M0,-19.4 L5.2,-14.2 L0,-9 L-5.2,-14.2 Z" fill="none" stroke="' + t + '" stroke-width="0.35"/>' +
    // Mülleimer mit Gitter
    '<path d="M-3.4,-13.6 H-0.6 L-0.9,-10.6 H-3.1 Z" fill="none" stroke="' + t + '" stroke-width="0.4"/>' +
    '<path d="M-3.2,-12.6 H-0.8 M-3,-11.6 H-1 M-2,-13.6 V-10.6" stroke="' + t + '" stroke-width="0.25"/>' +
    // Abfall im Flug und Figur
    '<rect x="-2.6" y="-15.4" width="1.2" height="0.9" transform="rotate(-20 -2 -15)" fill="' + t + '"/>' +
    '<circle cx="1.9" cy="-17" r="0.8" fill="' + t + '"/>' +
    '<path d="M1.7,-15.9 L2.2,-12.9 M2.2,-12.9 L1.3,-10.4 M2.2,-12.9 L2.9,-10.4 M1.8,-15.2 L-0.6,-15.4" fill="none" stroke="' + t + '" ' +
    'stroke-width="0.85" stroke-linecap="round"/>' +
    "</g>";
}

function hinweisSchildOrte() {
  return [236, 345, 718].map(function (x) {
    return { x: x, y: kuestenlinie(x) + 15 };
  });
}

// Mülleimer: verteilt am Strand, einer am Hotel, einer an der Fabrik (y = Boden)
function muelleimerOrte() {
  const strand = [40, 262, 395, 590, 700].map(function (x) {
    return { x: x, y: kuestenlinie(x) + 13 };
  });
  return strand.concat([{ x: 474, y: 100 }, { x: 628, y: 97 }]);
}

// Müllauffangstation im Fluss (nach dem Vorbild schwimmender Flussreiniger): Eine Schwimmbarriere aus
// Bojen liegt schräg im Fluss und leitet den Müll zum rechten Ufer. Dort hebt ein Förderband ihn aus dem
// Wasser in einen Container auf einem Ponton; ein Dach mit Solarmodul liefert den Strom.
function muellfaengerLage(aue) {
  const p = flussPunkt(1.3, aue);
  const halb = flussBreite(1.3) / 2;
  // quer zur Flussrichtung: (-ry, rx) zeigt zum linken Ufer
  return {
    p: p,
    links: [p.x - p.ry * (halb + 2) - p.rx * 5, p.y + p.rx * (halb + 2) - p.ry * 5],
    rechts: [p.x + p.ry * (halb - 1) + p.rx * 2, p.y - p.rx * (halb - 1) + p.ry * 2]
  };
}

function muellfaengerSvg(aue) {
  const m = muellfaengerLage(aue);
  const a = m.links;
  const e = m.rechts;
  const winkel = Math.atan2(e[1] - a[1], e[0] - a[0]) * 180 / Math.PI;
  // Schwimmbarriere: Seil mit abwechselnd gelben und orangen Schwimmkörpern
  let s = '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + e[0].toFixed(1) + '" y2="' + e[1].toFixed(1) +
    '" stroke="#5E5A52" stroke-width="0.6"/>';
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    s += '<ellipse cx="' + (a[0] + (e[0] - a[0]) * t).toFixed(1) + '" cy="' + (a[1] + (e[1] - a[1]) * t).toFixed(1) + '" rx="1.7" ry="1.1" ' +
      'transform="rotate(' + Math.round(winkel) + " " + (a[0] + (e[0] - a[0]) * t).toFixed(1) + " " + (a[1] + (e[1] - a[1]) * t).toFixed(1) + ')" ' +
      'fill="' + (i % 2 ? "#F2C14E" : "#E8662A") + '" stroke="#9A5A1E" stroke-opacity="0.6" stroke-width="0.3"/>';
  }
  // aufgestauter Müll vor der Barriere (flussaufwärts)
  [[0.4, "flasche"], [0.58, "tuete"], [0.74, "verpackung"], [0.88, "flasche"]].forEach(function (t, i) {
    s += muellSymbolSvg(t[1], a[0] + (e[0] - a[0]) * t[0] - m.p.rx * 3, a[1] + (e[1] - a[1]) * t[0] - m.p.ry * 3, winkel + i * 40, 0.42, true);
  });
  // Ponton am rechten Ufer, Vorderkante unten links bei (x, y)
  const x = e[0] + 1;
  const y = e[1] + 4;
  s += quaderSvg(x, y - 3.5, 20, 3.5, 9, { front: "#56636D", seite: "#434F57", dach: "#7F8D97" });
  // Förderband vom Wasser schräg hinauf zum Container, mit Querleisten
  s += '<path d="' + vieleck([[x - 5, y - 0.6], [x - 3, y - 2.4], [x + 8, y - 13], [x + 6, y - 11.2]]) + '" fill="#2F3A42"/>';
  let leisten = "";
  for (let k = 1; k < 6; k++) {
    const t = k / 6;
    leisten += "M" + (x - 5 + 11 * t).toFixed(1) + "," + (y - 0.6 - 10.6 * t).toFixed(1) + " l2,-1.8 ";
  }
  s += '<path d="' + leisten + '" stroke="#9AA7B0" stroke-width="0.5"/>';
  // Container (oben offen, Müll schaut heraus) mit Recycling-Kreis
  const cu = y - 4.5;
  s += quaderSvg(x + 7, cu - 8, 12, 8, 6, { front: "#3E8E5A", seite: "#2F6E45", dach: "#24392C" });
  [["#EEF5F8", 9.5], ["#6E9E4A", 12.5], ["#E8662A", 15.5]].forEach(function (b) {
    s += '<rect x="' + (x + b[1]).toFixed(1) + '" y="' + (cu - 10.2).toFixed(1) + '" width="2.2" height="1.5" rx="0.4" fill="' + b[0] + '"/>';
  });
  s += '<circle cx="' + (x + 13) + '" cy="' + (cu - 4) + '" r="2" fill="none" stroke="#FFFFFF" stroke-width="0.7" stroke-dasharray="2.8 0.8"/>';
  // Dach mit Solarmodul auf zwei Stützen
  const d = schraeg(6);
  s += '<path d="M' + (x + 7.6) + "," + (cu - 8) + " V" + (cu - 14) + " M" + (x + 18.4) + "," + (cu - 8) + " V" + (cu - 14) +
    '" stroke="#5E5A52" stroke-width="0.7"/>';
  s += '<path d="' + vieleck([[x + 6, cu - 14], [x + 20, cu - 14], [x + 20 + d.x, cu - 14 + d.y], [x + 6 + d.x, cu - 14 + d.y]]) +
    '" fill="#2B4C7E" stroke="#C9D6DE" stroke-width="0.4"/>' +
    '<path d="M' + (x + 10.7) + "," + (cu - 14) + " l" + d.x.toFixed(1) + "," + d.y.toFixed(1) + " M" + (x + 15.3) + "," + (cu - 14) +
    " l" + d.x.toFixed(1) + "," + d.y.toFixed(1) + '" stroke="#C9D6DE" stroke-width="0.35"/>';
  return s;
}

function seekarteSvg(z) {
  const k = z.kennzahlen;
  const w = aktiveWirkung(z, Math.min(z.runde, RUNDEN));
  const wirksam = function (id) {
    return istUmgesetzt(z, id) && z.umgesetzt[id][0] < z.runde;
  };
  const tinte = "#12304A";
  let s = "";

  const farben = meerFarben(k.meeresgesundheit);
  // Flusswasser: trüb bei viel Eintrag aus dem Hinterland, klar bei wenig
  const flussTruebung = begrenzen(z.eintrag.land / EINTRAG_GRUND.land, 0, 1);
  const flussFarbe = mischfarbe([112, 178, 214], [140, 162, 140], flussTruebung);
  s += '<svg viewBox="0 0 ' + KARTE_B + " " + KARTE_H + '" xmlns="http://www.w3.org/2000/svg" ' +
    'preserveAspectRatio="xMidYMid slice" focusable="false">';
  s += "<defs>" +
    '<pattern id="schraffur" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<line x1="0" y1="0" x2="0" y2="9" stroke="#B0307A" stroke-width="1.2" opacity="0.35"/></pattern>' +
    // Meer: hell am Ufer, dunkler zur offenen See (wie das Meer im Titelbild)
    '<linearGradient id="kaMeer" x1="0" y1="' + (104 + STRAND_BREITE) + '" x2="0" y2="' + KARTE_H + '" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="' + farben.flach + '"/><stop offset="1" stop-color="' + farben.tief + '"/></linearGradient>' +
    '<linearGradient id="kaLand" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#C9D6AC"/><stop offset="1" stop-color="#DCDAAE"/></linearGradient>' +
    '<linearGradient id="kaSand" x1="0" y1="90" x2="0" y2="140" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="#EDE0BF"/><stop offset="1" stop-color="#DCC89C"/></linearGradient>' +
    '<linearGradient id="kaDuene" x1="0" y1="80" x2="0" y2="118" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="#C7C08F" stop-opacity="0"/><stop offset="1" stop-color="#B8A477" stop-opacity="0.75"/></linearGradient>' +
    // Fluss: oben je nach Eintrag aus dem Hinterland klar bis trüb, zur Mündung in die Meeresfarbe übergehend
    '<linearGradient id="kaFluss" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' + flussFarbe + '"/><stop offset="1" stop-color="' + farben.flach + '"/></linearGradient>' +
    // Gebäude: Wände mit Licht von oben, Dachziegel, Sheddach, Schornstein mit Licht von links, Glas
    '<linearGradient id="kaWandHell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFBF2"/>' +
    '<stop offset="1" stop-color="#EADFC8"/></linearGradient>' +
    '<linearGradient id="kaWandGrau" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8CED2"/>' +
    '<stop offset="1" stop-color="#A9B1B6"/></linearGradient>' +
    '<linearGradient id="kaZiegel" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#A85A3C"/>' +
    '<stop offset="1" stop-color="#CF8463"/></linearGradient>' +
    '<linearGradient id="kaShed" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B3BCC2"/>' +
    '<stop offset="1" stop-color="#8E989F"/></linearGradient>' +
    '<linearGradient id="kaZylinder" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C9D0D5"/>' +
    '<stop offset="0.45" stop-color="#AEB7BD"/><stop offset="1" stop-color="#7C878F"/></linearGradient>' +
    '<linearGradient id="kaGlas" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C6E0EE"/>' +
    '<stop offset="1" stop-color="#7FA9C2"/></linearGradient>' +
    '<linearGradient id="kaHolz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D9B48A"/>' +
    '<stop offset="1" stop-color="#BF9466"/></linearGradient>' +
    // Sonnenlicht oben links, wie die Sonne im Titelbild
    '<radialGradient id="kaLicht" cx="40" cy="-30" r="420" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="#FFF8E4" stop-opacity="0.45"/><stop offset="0.5" stop-color="#FFF8E4" stop-opacity="0.1"/>' +
    '<stop offset="1" stop-color="#FFF8E4" stop-opacity="0"/></radialGradient>' +
    '<filter id="kaSchatten" x="-20%" y="-20%" width="150%" height="160%">' +
    '<feDropShadow dx="1.6" dy="2.2" stdDeviation="1.4" flood-color="#0B2238" flood-opacity="0.28"/></filter>' +
    '<filter id="kaWeich" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>' +
    '<filter id="kaRauchWeich" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="0.9"/></filter>' +
    "</defs>";

  // Meer mit Tiefenverlauf, sanften Dünungslinien und Lichtreflexen
  s += '<rect width="' + KARTE_B + '" height="' + KARTE_H + '" fill="url(#kaMeer)"/>';
  [52, 104, 160].forEach(function (versatz) {
    s += '<polyline points="' + linienPunkte(versatz) + '" fill="none" stroke="#FFFFFF" ' +
      'stroke-opacity="0.1" stroke-width="1.3"/>';
  });
  s += meerGlitzerSvg();

  // Fische (Artenvielfalt): mehr Tiere und mehr Arten, je besser es der Artenvielfalt geht (siehe FISCH_ARTEN)
  s += fischeSvg(k.artenvielfalt);

  // Abwasserfahne vor dem Rohr (größer und dunkler bei hoher Abwasserbelastung)
  const abwasser = Math.max(0, DRUCK_START.wasser + w.druckWasser);
  if (abwasser > 6) {
    const yRohr = kuestenlinie(652) + STRAND_BREITE;
    s += abwasserFahneSvg(652, yRohr + 6, abwasser);
  }

  // Schutzgebiet (wie ein Sperrgebiet auf Seekarten)
  if (istUmgesetzt(z, "schutzgebiet")) {
    s += '<path d="M372,214 L612,198 L648,300 L356,308 Z" fill="url(#schraffur)" stroke="#B0307A" ' +
      'stroke-width="1.6" stroke-dasharray="11 5"/>';
  }

  // Offshore-Windpark (links unten)
  if (istUmgesetzt(z, "windpark")) {
    // doppelt so große Windräder, deshalb weiter auseinander (der Otter unten links bleibt frei)
    [[112, 264], [170, 294], [228, 260], [286, 292], [344, 264]].forEach(function (p, i) {
      s += windradSvg(p[0], p[1], i, 2);
    });
  }

  // Strand und Land: Sandverlauf, nasser Sand und Schaumkante am Wasser, Dünenkante mit Strandhafer
  s += '<polyline points="' + linienPunkte(STRAND_BREITE + 5) + '" fill="none" stroke="' + farben.flach + '" ' +
    'stroke-width="12" stroke-opacity="0.55" filter="url(#kaWeich)"/>';
  s += '<polygon points="0,0 ' + linienPunkte(STRAND_BREITE) + ' 800,0" fill="url(#kaSand)"/>';
  s += '<polyline points="' + linienPunkte(STRAND_BREITE - 2.5) + '" fill="none" stroke="#C4AD80" stroke-width="5" stroke-opacity="0.45"/>';
  s += '<polyline points="' + linienPunkte(STRAND_BREITE + 0.6) + '" fill="none" stroke="#FFFFFF" stroke-width="2.2" ' +
    'stroke-opacity="0.9" stroke-linejoin="round"/>';
  s += '<polyline points="' + linienPunkte(STRAND_BREITE + 5) + '" fill="none" stroke="#FFFFFF" stroke-width="1.2" ' +
    'stroke-opacity="0.45" stroke-dasharray="38 14 10 24" stroke-linecap="round"/>';
  s += '<polygon points="0,0 ' + linienPunkte(0) + ' 800,0" fill="url(#kaLand)"/>';
  s += '<polygon points="0,' + (kuestenlinie(0) - 16).toFixed(1) + " " + linienPunkte(-16) + " " +
    linienPunkte(0).split(" ").reverse().join(" ") + '" fill="url(#kaDuene)"/>';
  s += wiesenSvg();
  s += strandhaferSvg();
  s += baeumeSvg();

  // Brutzone am Strand: rot gestrichelter Bereich links der Flussmündung, mit Schild.
  // Das Schild steht links, damit Müllfänger und Infopunkte am Strand frei bleiben.
  if (istUmgesetzt(z, "brutschutz")) {
    const oben = [];
    const unten = [];
    for (let x = 82; x <= 180; x += 7) {
      oben.push(x + "," + (kuestenlinie(x) + 3).toFixed(1));
      unten.unshift(x + "," + (kuestenlinie(x) + STRAND_BREITE - 3).toFixed(1));
    }
    s += '<polygon points="' + oben.concat(unten).join(" ") + '" fill="#C8382E" fill-opacity="0.08" ' +
      'stroke="#C8382E" stroke-width="1.5" stroke-dasharray="4 3" stroke-linejoin="round"/>';
    s += brutSchildSvg(94, kuestenlinie(94) + STRAND_BREITE - 6, tinte);
  }

  // Fluss mit Mündung: wird zum Meer hin breiter und öffnet sich trichterförmig. Feuchtes Ufer,
  // tiefere Rinne in der Mitte, Lichtkante am linken (sonnigen) Ufer und Glanzstriche, die flussabwärts ziehen.
  // Mit „Flussaue renaturieren“ schlängelt er sich, mit grüner Aue und zwei Altwassern daneben.
  const aue = istUmgesetzt(z, "aue");
  const flussD = "M" + flussMitte(aue ? 30 : 14, aue).map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" L");
  // Der Fluss endet an der Schaumkante und geht dort ins Meer über (Ausschnitt nur über Land und Strand)
  s += '<clipPath id="kaFlussRaum"><polygon points="0,0 ' + linienPunkte(STRAND_BREITE + 1) + ' 800,0"/></clipPath>';
  s += '<g clip-path="url(#kaFlussRaum)">';
  if (aue) {
    s += '<path d="' + glatterPfad(flussUmriss(1, 17, aue)) + '" fill="#97BD72" opacity="0.55" filter="url(#kaWeich)"/>';
    [[0.62, 1], [1.12, -1]].forEach(function (a) {
      const p = flussPunkt(a[0], aue);
      const abstand = (flussBreite(a[0]) / 2 + 11) * a[1];
      s += '<ellipse cx="' + (p.x - p.ry * abstand).toFixed(1) + '" cy="' + (p.y + p.rx * abstand).toFixed(1) +
        '" rx="6.5" ry="3" fill="url(#kaFluss)" stroke="#7E9A4E" stroke-opacity="0.6" stroke-width="0.8"/>';
    });
  }
  s += '<path d="' + glatterPfad(flussUmriss(1, 4, aue)) + '" fill="#B9A97C" opacity="0.6" filter="url(#kaWeich)"/>' +
    '<path d="' + glatterPfad(flussUmriss(1, 1.4, aue)) + '" fill="#9E8D62" opacity="0.45"/>' +
    '<path d="' + glatterPfad(flussUmriss(1, 0, aue)) + '" fill="url(#kaFluss)"/>' +
    '<path d="' + glatterPfad(flussUmriss(0.42, 0, aue)) + '" fill="' + farben.tief + '" opacity="0.28" filter="url(#kaWeich)"/>' +
    '<path d="' + flussUferLinie(1, -1.2, aue) + '" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="0.9" stroke-linecap="round"/>' +
    '<path class="ka-fluss-glanz" style="' + animStil(7) + '" d="' + flussD + '" fill="none" stroke="#FFFFFF" stroke-opacity="0.38" ' +
    'stroke-width="1.1" stroke-linecap="round" stroke-dasharray="7 16"/>' +
    '<path class="ka-fluss-glanz" style="' + animStil(11, 3) + '" d="' + flussUferLinie(-1, -3.2, aue) + '" fill="none" stroke="#FFFFFF" ' +
    'stroke-opacity="0.25" stroke-width="0.8" stroke-linecap="round" stroke-dasharray="3 20"/>' +
    "</g>";

  // Müll im Fluss: der Fluss trägt Müll aus dem Hinterland ins Meer
  s += flussMuellSvg(z, wirksam("muellfaenger"));
  if (istUmgesetzt(z, "muellfaenger")) s += muellfaengerSvg(aue);

  // Ort: zu Beginn ein Hotel und ein Gästehaus. Mit „Gewerbegebiet erweitern“
  // wächst der Ort um ein zweites Hotel und zwei Gästehäuser.
  const gewerbe = istUmgesetzt(z, "gewerbe");
  // Hotel und Kiosk stehen nah am Strand: das Hotel an der Dünenkante, der Kiosk direkt am Sand.
  // unten = Unterkante (Boden) des Gebäudes
  const haeuser = [
    { art: "hotel", x: 440, unten: 88 },
    { art: "kiosk", x: 512, unten: 103 }
  ];
  if (gewerbe) {
    haeuser.push({ art: "hotel", x: 380, unten: 84 }, { art: "gast", x: 520, unten: 70 }, { art: "gast", x: 552, unten: 52 });
  }
  // Abwasserrohr zum Meer (unter den Gebäuden, damit es aus der Fabrik kommt)
  const yRohrEnde = (kuestenlinie(652) + STRAND_BREITE + 6).toFixed(1);
  s += '<line x1="652" y1="76" x2="652" y2="' + yRohrEnde + '" stroke="#4D5B66" stroke-width="3.4" stroke-linecap="round"/>' +
    '<line x1="652" y1="76" x2="652" y2="' + yRohrEnde + '" stroke="#A9B3BA" stroke-width="1.4" stroke-linecap="round"/>';

  // Rauch steigt aus den Schornsteinen, solange das CO2-Gesetz noch nicht wirkt.
  // Er liegt unter den Gebäuden und quillt so oben aus dem Schornstein heraus.
  if (!wirksam("co2")) {
    s += rauchSvg(schornsteinSpitze(616, 46, 62, 30), 1, 0);
    if (gewerbe) s += rauchSvg(schornsteinSpitze(688, 56, 46, 24), 0.75, 1.3);
  }

  // Gebäude mit weichem Schatten, von hinten nach vorne gezeichnet (nach Unterkante),
  // damit vordere Gebäude die hinteren überdecken
  const gebaeude = haeuser.map(function (h) {
    const svg = h.art === "hotel" ? hotelGrossSvg(h.x, h.unten)
      : h.art === "kiosk" ? kioskSvg(h.x, h.unten)
      : hotelKleinSvg(h.x, h.unten - 13);
    return { unten: h.unten, svg: '<g transform="translate(' + h.x + "," + h.unten + ") scale(" + ORT_GROESSE + ") translate(" +
      (-h.x) + "," + (-h.unten) + ')">' + svg + "</g>" };
  });
  // Fabrik mit Schornstein; mit „Gewerbegebiet erweitern“ eine zweite, kleinere Fabrik rechts daneben
  gebaeude.push({ unten: 76, svg: fabrikSvg(616, 46, 62, 30, 4, 7.6) });
  if (gewerbe) gebaeude.push({ unten: 80, svg: fabrikSvg(688, 56, 46, 24, 3, 6.2) });
  s += '<g filter="url(#kaSchatten)">' + gebaeude.sort(function (a, b) { return a.unten - b.unten; }).map(function (g) {
    return g.svg;
  }).join("") + "</g>";


  // Hafen: Steg mit Holzplanken und Pfählen; mit Kreuzfahrtanleger wird er zum T
  const yHafen = kuestenlinie(742) + STRAND_BREITE;
  const kreuzfahrt = istUmgesetzt(z, "kreuzfahrt");
  // Steg und Schiffe mit weicherer Kante als die Schilder, passend zu den Gebäuden
  const kante = "#3B5366";
  const steg = stegSvg(yHafen - 4, kreuzfahrt, kante);
  s += '<g filter="url(#kaSchatten)">' + steg.svg;
  if (istUmgesetzt(z, "netzrueckgabe")) {
    s += '<rect x="736" y="' + (yHafen + 6).toFixed(1) + '" width="10" height="8" rx="1.2" fill="#2E8B57" stroke="' + kante + '" stroke-width="0.6"/>';
  }
  // Fischkutter am Steg
  s += kutterSvg(776, yHafen + 56, 1.3, false, kante);
  // Zwei Kreuzfahrtschiffe am T-Stück: eines in der linken Ecke zwischen Steg und Querstück,
  // eines rechts unter dem Querstück
  if (kreuzfahrt) {
    s += kreuzfahrtschiffSvg(690, steg.yEnde - 8, 1.25, kante) + kreuzfahrtschiffSvg(756, steg.tUnten + 30, 1.25, kante);
  }
  // Höhere Fangquoten: zwei weitere Kutter fischen auf See
  if (istUmgesetzt(z, "quoten")) {
    s += kutterSvg(290, 200, 1.15, true, kante) + kutterSvg(765, 300, 1.15, false, kante);
  }
  s += "</g>";

  // Mülleimer (am Strand, am Hotel, an der Fabrik) und Hinweisschilder am Strand
  if (istUmgesetzt(z, "schilder")) {
    muelleimerOrte().forEach(function (o) { s += muelleimerSvg(o.x, o.y, tinte); });
    hinweisSchildOrte().forEach(function (o) { s += hinweisSchildSvg(o.x, o.y); });
  }

  // Forschungsboje
  if (istUmgesetzt(z, "forschung")) s += bojeSvg(420, 192);      // außerhalb des Windparks

  // Treibgut im Wasser (Eintrag): Plastikflaschen und -tüten nahe dem Strand
  s += treibgutSvg(treibgutAnzahl(z));

  // Müll am Strand und an Land, gebündelt an den Verursachern.
  // Hinten liegende Teile zuerst, damit vordere sie überdecken.
  strandMuellListe(z).concat(landMuellListe(z)).sort(function (a, b) { return a.y - b.y; }).forEach(function (m) {
    s += muellSymbolSvg(m.form, m.x, m.y, m.winkel, m.groesse);
  });

  // Licht von oben links, wie die Sonne im Titelbild
  s += '<rect width="' + KARTE_B + '" height="' + KARTE_H + '" fill="url(#kaLicht)" pointer-events="none"/>';

  s += "</svg>";
  return s;
}

function seekarteAnzeigen() {
  const z = zustand;
  el("seekarte").innerHTML = seekarteSvg(z);

  // Legende: nur Symbole, die gerade auf der Karte zu sehen sind
  const w = aktiveWirkung(z, Math.min(z.runde, RUNDEN));
  const arten = { plastik: false, glas: false, essen: false };
  strandMuellListe(z).concat(landMuellListe(z)).forEach(function (m) { arten[m.art] = true; });
  // Gebäude für die Legende: Defs (Verläufe) liegen in der Karte; hier eigene, gleich benannte Verläufe
  const gebaeudeDefs = '<defs><linearGradient id="lgWand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFBF2"/>' +
    '<stop offset="1" stop-color="#EADFC8"/></linearGradient><linearGradient id="lgHolz" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#D9B48A"/><stop offset="1" stop-color="#BF9466"/></linearGradient></defs>';
  const legendeGebaeude = function (svg) {
    return gebaeudeDefs + svg.replace(/url\(#kaWandHell\)/g, "url(#lgWand)").replace(/url\(#kaHolz\)/g, "url(#lgHolz)")
      .replace(/url\(#kaGlas\)/g, "#A9CFE3");
  };
  const eintraege = [
    [legendenSvg(legendeGebaeude(hotelGrossSvg(0, 0)), "-2 -56 62 58"), "Hotel", true],
    [legendenSvg(legendeGebaeude(kioskSvg(0, 0)), "-3 -24 34 25"), "Strandkiosk", true],
    [legendenSymbol("flasche", -20, 1.1), "Plastikmüll", arten.plastik],
    [legendenSymbol("scherbe", -15, 1.05), "Glas", arten.glas],
    [legendenSymbol("apfel", 0, 1.1), "Essensreste", arten.essen],
    [legendenSymbol("tuete", 10, 0.8), "Plastiktüte", treibgutAnzahl(z) > 0],
    [legendenSvg(muelleimerSvg(0, 0, "#12304A"), "-7 -12.5 14 13.5"), "Mülleimer", istUmgesetzt(z, "schilder")],
    [legendenSvg(hinweisSchildSvg(0, 0), "-9 -26 18 26"), "Hinweisschild", istUmgesetzt(z, "schilder")],
    [legendenSvg('<rect x="-10.5" y="-7" width="25" height="14" rx="3.5" fill="#3F84B5"/>' + FISCH_FORMEN.hering(),
      "-10.5 -7 25 14"), fischLegende(z.kennzahlen.artenvielfalt), true],
    ["lg-wasser", "Wasserfarbe, Meeresgesundheit", true],
    ["lg-abwasser", "Abwasserfahne", DRUCK_START.wasser + w.druckWasser > 6],
    ["lg-schutz", "Meeresschutzgebiet", istUmgesetzt(z, "schutzgebiet")],
    ["lg-brut", "Brutzone", istUmgesetzt(z, "brutschutz")],
    [legendenSvg('<g stroke="#3E5A70" stroke-width="1.4" stroke-linecap="round" fill="none">' +
      '<path d="M0,6 V-2 M0,-2 l-5,-2.5 M0,-2 l5,-2.5 M0,-2 l0,5"/></g><circle cx="0" cy="-2" r="1.2" fill="#12304A"/>',
      "-8 -6 16 12"), "Windpark", istUmgesetzt(z, "windpark")]
  ];
  el("kartenLegende").innerHTML = eintraege.filter(function (e) { return e[2]; }).map(function (e) {
    const zeichen = e[0].charAt(0) === "<" ? e[0] : '<span class="lg ' + e[0] + '" aria-hidden="true"></span>';
    return "<li>" + zeichen + e[1] + "</li>";
  }).join("");
}

// ==========================================================
// 9. POP-UPS
// ==========================================================
// nachher (optional) läuft genau einmal, wenn das Pop-up mit popupFertig geschlossen wird.
// So folgen Quiz → Bericht → Ereignis aufeinander.
const nachSchliessen = {};

function popupOeffnen(id, nachher) {
  const overlay = el(id);
  overlay.classList.remove("versteckt");
  nachSchliessen[id] = nachher || null;
  const fokus = overlay.querySelector("[data-fokus]") || overlay.querySelector("button, input");
  if (fokus) fokus.focus();
}

function popupSchliessen(id) {
  el(id).classList.add("versteckt");
}

function popupFertig(id) {
  popupSchliessen(id);
  const nachher = nachSchliessen[id];
  nachSchliessen[id] = null;
  if (nachher) nachher();
}

// ---------- Einführung ----------
// Drei Seiten: Willkommen, Ziel (Status-Balken pendeln zwischen Ist- und Soll-Zustand) und
// „Befreie die Küste von Müll“ (Minikarte räumt sich bis auf drei Müllteile auf).
// start(inhalt) läuft, sobald die Seite sichtbar ist, und startet ihre Animation.
let einfuehrungSchritt = 0;

function einfuehrungSeiten() {
  return [
    {
      titel: "Willkommen, " + escapeHtml(spielerName) + "!",
      html:
        "<p>Du bist <strong>Küstenmanager:in</strong> einer Region an der Nordsee, direkt am Wattenmeer.</p>" +
        "<p>Der Strand und das Meer sind hier stark mit Müll belastet. Außerdem setzen Abwasser und Fischerei den Tieren zu.</p>"
    },
    {
      titel: "Dein Ziel: ein guter Umweltzustand!",
      html:
        "<p>Bringe die Region in einen guten Umweltzustand und halte diesen in den Runden " + zielFenster().von + " bis " +
        zielFenster().bis + " stabil.</p>" + zielBalkenHtml() +
        "<p>Um das zu erreichen, setzt du jede Runde gezielte Maßnahmen um. Aber Vorsicht: Jede Entscheidung verändert " +
        "das Gefüge vor Ort, und nicht jede Maßnahme wird bei allen gut ankommen.</p>",
      start: zielBalkenAnimieren
    },
    {
      titel: "Befreie die Küste von Müll",
      html: '<div class="seekarte minikarte" role="img" aria-label="Die Karte deiner Region: Erst liegt überall Müll, ' +
        'dann wird sie sauber, bis nur noch drei Teile übrig sind.">' + seekarteSvg(zustand) + "</div>",
      breit: true,
      start: minikarteAufraeumen
    }
  ];
}

function einfuehrungZeigen(schrittNr) {
  const seiten = einfuehrungSeiten();
  einfuehrungSchritt = begrenzen(schrittNr, 0, seiten.length - 1);
  const seite = seiten[einfuehrungSchritt];
  el("einfuehrungTitel").innerHTML = seite.titel;
  el("popupEinfuehrung").querySelector(".popup").classList.toggle("popup-breit", Boolean(seite.breit));
  el("einfuehrungInhalt").innerHTML = seite.html;
  el("einfuehrungPunkte").innerHTML = seiten.map(function (_, i) {
    return '<span class="' + (i === einfuehrungSchritt ? "aktiv" : "") + '"></span>';
  }).join("");
  el("einfuehrungZurueck").classList.toggle("unsichtbar", einfuehrungSchritt === 0);
  el("einfuehrungWeiter").textContent = einfuehrungSchritt === seiten.length - 1 ? "Spiel starten" : "Weiter";
  popupOeffnen("popupEinfuehrung");
  if (seite.start) seite.start(el("einfuehrungInhalt"));
}

function einfuehrungWeiter() {
  if (einfuehrungSchritt < einfuehrungSeiten().length - 1) {
    einfuehrungZeigen(einfuehrungSchritt + 1);
  } else {
    popupSchliessen("popupEinfuehrung");
  }
}

// Status-Balken wie in der Seitenleiste, dazu Akzeptanz und Strandmüll.
// ist = Startwert, soll = Mindestwert des guten Umweltzustands (Strandmüll: knapp unter dem Schwellenwert);
// liegt ein Wert schon darüber, bleibt er stehen.
function zielBalkenZeilen() {
  const z = zustand;
  return KENNZAHLEN.map(function (k) {
    return { name: k.name, ist: z.kennzahlen[k.id], soll: Math.max(z.kennzahlen[k.id], k.mindest), marke: k.mindest,
      einheit: " %", breite: function (x) { return x; }, farbe: function (x) { return ampelFarbe(x, k.mindest); } };
  }).concat([
    { name: "Akzeptanz", ist: z.akzeptanz, soll: Math.max(z.akzeptanz, AKZEPTANZ_MINDEST), marke: AKZEPTANZ_MINDEST,
      einheit: " %", breite: function (x) { return x; }, farbe: akzeptanzFarbe },
    { name: "Strandmüll", ist: z.strandmuell, soll: MUELL_SCHWELLE - 2, marke: muellProzent(MUELL_SCHWELLE),
      einheit: " Teile", breite: muellProzent, farbe: function (x) { return x < MUELL_SCHWELLE ? AMPEL.gruen : AMPEL.rot; } }
  ]);
}

function zielBalkenHtml() {
  return '<div class="kennzahlen-liste ziel-balken">' + zielBalkenZeilen().map(function (k) {
    return '<div class="kennzahl"><div class="kennzahl-kopf"><span class="kennzahl-name">' + k.name + "</span>" +
      '<span class="kennzahl-wert"><strong>' + zahl(k.ist) + k.einheit + "</strong></span></div>" +
      '<div class="balken"><div class="balken-fuellung" style="width:' + k.breite(k.ist) + "%;background-color:" + k.farbe(k.ist) + '"></div>' +
      '<div class="balken-ziel" style="left:' + k.marke + '%"></div></div></div>';
  }).join("") + "</div>";
}

// Balken, Zahl und Farbe pendeln in einer Schleife: 1 s Ist-Wert stehen, weich zum Soll-Wert wechseln,
// 1 s Soll-Wert stehen, weich zurück zum Ist-Wert wechseln. Bei „Bewegung reduzieren“ stehen sie still.
const ZIEL_BALKEN_TAKT = { stehen: 1000, wechseln: 1500 };

function zielBalkenAnimieren(inhalt) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const zeilen = zielBalkenZeilen();
  const fuellungen = inhalt.querySelectorAll(".ziel-balken .balken-fuellung");
  const zahlen = inhalt.querySelectorAll(".ziel-balken .kennzahl-wert strong");
  const halb = ZIEL_BALKEN_TAKT.stehen + ZIEL_BALKEN_TAKT.wechseln;     // Ist → Soll, danach Soll → Ist
  const beginn = performance.now();
  const bild = function (jetzt) {
    if (!inhalt.contains(fuellungen[0])) return;              // Seite gewechselt oder Fenster neu gefüllt
    const zeit = (jetzt - beginn) % (2 * halb);
    const t = begrenzen(((zeit % halb) - ZIEL_BALKEN_TAKT.stehen) / ZIEL_BALKEN_TAKT.wechseln, 0, 1);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const anteil = zeit < halb ? e : 1 - e;                   // 0 = Ist, 1 = Soll
    zeilen.forEach(function (k, i) {
      const wert = k.ist + (k.soll - k.ist) * anteil;
      fuellungen[i].style.width = k.breite(wert) + "%";
      fuellungen[i].style.backgroundColor = k.farbe(wert);
      zahlen[i].textContent = zahl(Math.round(wert)) + k.einheit;
    });
    requestAnimationFrame(bild);
  };
  requestAnimationFrame(bild);
}

// Minikarte: Der Müll verschwindet nach und nach von links nach rechts, drei verteilte Teile bleiben liegen
function minikarteAufraeumen(inhalt) {
  const teile = Array.prototype.filter.call(inhalt.querySelectorAll(".ka-muell"), function (t) {
    return !t.parentElement.closest(".ka-muell");
  }).map(function (t) { return { el: t, x: t.getBBox().x }; }).sort(function (a, b) { return a.x - b.x; });
  const bleiben = [0.15, 0.5, 0.85].map(function (a) { return Math.round(a * (teile.length - 1)); });
  const weg = teile.filter(function (_, i) { return bleiben.indexOf(i) < 0; });
  const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  weg.forEach(function (t, i) {
    t.el.style.transition = "opacity 0.7s ease, transform 0.7s ease";
    t.el.style.transitionDelay = ruhig ? "0s" : (0.9 + i * 3 / weg.length).toFixed(2) + "s";
  });
  // zwei Bilder warten, damit der volle Ist-Zustand erst gezeichnet ist
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      weg.forEach(function (t) { t.el.classList.add("ka-muell-weg"); });
    });
  });
}

// ---------- Infopunkt (Pop-up mit einem Fakt) ----------

function infopunktOeffnen(id) {
  const p = INFOPUNKTE.find(function (x) { return x.id === id; });
  const pflicht = p.runde === INFOPUNKT_PFLICHT_RUNDE;
  el("infoArt").textContent = "Infopunkt " + bereichName(p.region);
  el("infoTitel").textContent = p.titel;
  el("infoInhalt").innerHTML = '<p class="info-fakt">' + p.text + "</p>";
  el("infoNotiz").textContent = pflicht
    ? "Dieser Fakt kommt im Quiz am Ende der Runde vor."
    : "Merk dir das, es könnte später gefragt werden.";
  popupOeffnen("popupInfo", function () {
    const z = zustand;
    const warOffen = pflichtInfosOffen(z).length > 0;
    if (!infopunktGelesen(z, id)) z.infopunkteGelesen.push(id);
    markerAnzeigen();
    rundenKnopfAnzeigen();
    seekarteAnzeigen();
    if (warOffen && pflichtInfosOffen(z).length === 0) {
      el("anhoerungHinweis").textContent = "Jetzt melden sich die Menschen vor Ort. Klicke auf die Sprechblasen in der Karte.";
    }
  });
}

// ---------- Quiz ----------
const quiz = { fragen: [], index: 0, titel: "", beantwortet: false };

const QUIZ_HINWEISE = {
  infopunkt: "Aus den Infopunkten der Karte",
  vorab: "Neu für dich: Rate ruhig, die Erklärung folgt.",
  spiel: "Aus dem Spiel"
};

function quizStarten(fragen, titel, nachher) {
  quiz.fragen = fragen;
  quiz.index = 0;
  quiz.titel = titel;
  quizFrageZeigen();
  popupOeffnen("popupQuiz", nachher);
}

function quizFrageZeigen() {
  const f = quiz.fragen[quiz.index];
  quiz.beantwortet = false;
  el("quizTitel").textContent = quiz.titel;
  el("quizFortschritt").textContent = "Frage " + (quiz.index + 1) + " von " + quiz.fragen.length +
    (QUIZ_HINWEISE[f.art] ? " · " + QUIZ_HINWEISE[f.art] : "");
  el("quizFrage").textContent = f.frage;
  const liste = el("quizAntworten");
  liste.innerHTML = "";
  // Die Antworten stehen bei jeder Frage in neuer Reihenfolge, damit die richtige nicht immer an derselben Stelle steht
  const reihenfolge = f.antworten.map(function (_, i) { return i; });
  mischen(reihenfolge, Math.random);
  reihenfolge.forEach(function (i) {
    const knopf = elementBauen("button", "quiz-antwort", f.antworten[i]);
    knopf.type = "button";
    knopf.dataset.index = String(i);
    knopf.addEventListener("click", function () { quizAntwortWaehlen(i); });
    liste.appendChild(knopf);
  });
  const erkl = el("quizErklaerung");
  erkl.innerHTML = "";
  erkl.className = "quiz-erklaerung versteckt";
  const weiter = el("quizWeiter");
  weiter.disabled = true;
  weiter.textContent = quiz.index === quiz.fragen.length - 1 ? "Fertig" : "Nächste Frage";
  const erste = liste.querySelector("button");
  if (erste) erste.focus();
}

function quizAntwortWaehlen(index) {
  if (quiz.beantwortet) return;
  quiz.beantwortet = true;
  const f = quiz.fragen[quiz.index];
  const ok = quizAntwortWerten(zustand, f, index);
  el("quizAntworten").querySelectorAll("button").forEach(function (knopf) {
    const i = Number(knopf.dataset.index);
    knopf.disabled = true;
    if (i === f.richtig) {
      knopf.classList.add("richtig");
    } else if (i === index) {
      knopf.classList.add("falsch");
    }
  });
  const erkl = el("quizErklaerung");
  erkl.className = "quiz-erklaerung " + (ok ? "ist-richtig" : "ist-falsch");
  erkl.innerHTML = "<strong>" + (ok ? "Richtig." : "Nicht ganz. Richtig ist: " + escapeHtml(f.antworten[f.richtig]) + ".") +
    "</strong> " + f.erklaerung;
  const weiter = el("quizWeiter");
  weiter.disabled = false;
  weiter.focus();
}

function quizWeiter() {
  if (!quiz.beantwortet) return;
  if (quiz.index < quiz.fragen.length - 1) {
    quiz.index += 1;
    quizFrageZeigen();
    return;
  }
  popupFertig("popupQuiz");
}

// ---------- Rundenbericht: erklärt NACH der Entscheidung ----------
let aktuellerBericht = null;

function berichtZeigen(bericht) {
  aktuellerBericht = bericht;
  let html = "";

  // Entscheidungen der drei Säulen: zuerst nur die Überschriften, die Erklärung klappt per ▼ auf
  html += '<section class="bericht-block"><h3>Deine Entscheidungen</h3>';
  bericht.entscheidungen.forEach(function (e) {
    const kopf = '<span class="bericht-saeule">' + e.saeule.name + "</span>" +
      '<span class="bericht-massnahme' + (e.massnahme ? "" : " gedaempft") + '">' +
      (e.massnahme ? e.massnahme.name : "Zurückgestellt") + "</span>";
    html += e.massnahme
      ? '<details class="bericht-entscheidung"><summary>' + kopf +
        '<span class="bericht-pfeil" aria-hidden="true">▼</span></summary>' +
        '<p class="bericht-erklaerung">' + e.erklaerung + "</p></details>"
      : '<div class="bericht-entscheidung">' + kopf + "</div>";
  });
  html += "</section>";

  // Veränderungen: Balken wie im Spiel, die von „vorher“ nach „jetzt“ wandern
  html += '<section class="bericht-block"><h3>Was sich verändert hat</h3>' + veraenderungHtml(bericht) +
    '<p class="vb-legende"><span><span class="ziel-strich" aria-hidden="true"></span>Mindestwert</span>' +
    '<span><span class="vb-richtwert-zeichen" aria-hidden="true"></span>Richtwert, auf den die Kennzahl zustrebt</span>' +
    '<span><span class="vb-vorher-zeichen" aria-hidden="true"></span>Stand vorher</span></p>' +
    '<p class="klein">Jede Kennzahl bewegt sich pro Runde höchstens ' + MAX_AENDERUNG +
    " Punkte auf ihren Richtwert zu. Der Richtwert ergibt sich aus dem Zustand der Region.</p></section>";

  // Anhörung
  if (bericht.anhoerung.length) {
    html += '<section class="bericht-block"><h3>Anhörung</h3><ul class="liste-kompakt">';
    bericht.anhoerung.forEach(function (a) {
      html += "<li>" + a.person.name + " (" + bereichName(a.region) + "): " + (a.zuSchnell
        ? '<span class="trend-schlecht">nur überflogen, Akzeptanz −' + ANHOERUNG_STRAFE + "</span>"
        : "aufmerksam angehört") + "</li>";
    });
    html += "</ul></section>";
  }

  // Neu wirksam / ausgelaufen / Förderungen
  if (bericht.neuWirksam.length || bericht.ausgelaufen.length || bericht.foerderungen.length) {
    html += '<section class="bericht-block"><h3>Wirkungen und Förderungen</h3><ul class="liste-kompakt">';
    bericht.neuWirksam.forEach(function (e) {
      html += "<li><strong>Wirkt jetzt: " + e.titel + ".</strong> " + e.text + "</li>";
    });
    bericht.ausgelaufen.forEach(function (e) {
      html += "<li><strong>Nicht mehr wirksam: " + e.titel + ".</strong> " + e.text + "</li>";
    });
    bericht.foerderungen.forEach(function (t) {
      html += "<li>" + t + "</li>";
    });
    html += "</ul></section>";
  }

  el("berichtTitel").textContent = "Bericht zu Runde " + bericht.runde;
  el("berichtInhalt").innerHTML = html;
  el("berichtInhalt").scrollTop = 0;
  el("berichtWeiter").textContent = zustand.beendet
    ? "Zum Abschlussquiz"
    : "Weiter zu Runde " + zustand.runde;
  popupOeffnen("popupBericht");
  berichtAnimieren(el("berichtInhalt"));
}

// ---------- Rundenbericht: animierte Balken ----------
// Jede Zeile beschreibt ihre Animation als Folge von Schritten { v: Wert, w: Breite in %, f: Farbe }.
// Kennzahlen haben zwei Schritte (vorher → jetzt), der Strandmüll einen Schritt je Posten der Müllbilanz.

function vbZeileHtml(o) {
  const erster = o.schritte[0];
  const letzter = o.schritte[o.schritte.length - 1];
  const diff = letzter.v - erster.v;
  const klasse = diff === 0 ? "" : ((diff > 0) === o.besser ? "trend-gut" : "trend-schlecht");
  return '<div class="vb-zeile' + (o.zusatzKlasse ? " " + o.zusatzKlasse : "") + '" data-schritte=\'' +
      JSON.stringify(o.schritte) + "' data-einheit=\"" + o.einheit + '">' +
    '<div class="vb-kopf">' +
      '<span class="vb-name">' + o.name + "</span>" +
      '<span class="vb-werte">' +
        '<span class="vb-alt">' + zahl(erster.v) + o.einheit + "</span>" +
        '<span class="vb-pfeil" aria-hidden="true">→</span>' +
        '<strong class="vb-zahl" aria-hidden="true">' + zahl(erster.v) + o.einheit + "</strong>" +
        '<span class="sr-only">jetzt ' + zahl(letzter.v) + o.einheit + "</span>" +
        '<span class="vb-diff ' + klasse + '">' + vorzeichen(diff) + "</span>" +
      "</span>" +
    "</div>" +
    '<div class="balken vb-balken">' +
      '<div class="vb-vorher" style="width:' + erster.w + '%"></div>' +
      '<div class="balken-fuellung vb-fuellung" style="width:' + erster.w + "%;background-color:" + erster.f + '"></div>' +
      '<div class="vb-vorher-strich" style="left:' + erster.w + '%"></div>' +
      o.marken +
    "</div>" +
    (o.fuss ? '<p class="vb-fuss">' + o.fuss + "</p>" : "") +
    "</div>";
}

function veraenderungHtml(bericht) {
  const v = bericht.vorher;
  const n = bericht.nachher;
  const rw = bericht.richtwerte;
  const mb = bericht.muell;
  let html = '<div class="vb-liste">';

  // Kennzahlen und Akzeptanz: Ampelfarbe wie in der Seitenleiste und der Kopfleiste
  const reihen = KENNZAHLEN.map(function (k) {
    return { id: k.id, name: k.name, marke: k.mindest, markeTitel: "Mindestwert " + k.mindest + " %",
      farbe: function (x) { return ampelFarbe(x, k.mindest); } };
  }).concat([{ id: "akzeptanz", name: "Akzeptanz", marke: AKZEPTANZ_SPERRE,
    markeTitel: "Unter " + AKZEPTANZ_SPERRE + " % sind einschränkende Maßnahmen gesperrt", farbe: akzeptanzFarbe }]);
  reihen.forEach(function (k) {
    const richtwert = begrenzen(rw[k.id], 0, 100);
    html += vbZeileHtml({
      name: k.name, einheit: " %", besser: true,
      schritte: [v[k.id], n[k.id]].map(function (x) { return { v: x, w: begrenzen(x, 0, 100), f: k.farbe(x) }; }),
      marken: '<div class="balken-ziel" style="left:' + k.marke + '%" title="' + k.markeTitel + '"></div>' +
        '<div class="vb-richtwert" style="left:' + richtwert + '%" title="Richtwert ' + rw[k.id] + ' %"></div>',
      fuss: "strebt zu " + rw[k.id] + " %"
    });
  });

  // Strandmüll: Der Balken läuft die Müllbilanz Posten für Posten ab
  const muellSchritt = function (x) {
    return { v: x, w: muellProzent(x), f: x < MUELL_SCHWELLE ? AMPEL.gruen : AMPEL.rot };
  };
  const posten = [
    { titel: "Reinigung", wert: -mb.entfernt, art: "gut" },
    { titel: "natürlicher Abtrag", wert: -mb.abtrag, art: "gut" },
    { titel: "neuer Eintrag", wert: mb.neu - (mb.bestand - mb.entfernt - mb.abtrag), art: "schlecht" }
  ];
  const schritte = [muellSchritt(mb.bestand)];
  let stand = mb.bestand;
  posten.forEach(function (p, i) {
    stand += p.wert;
    if (p.wert) {
      p.schritt = schritte.length;
      schritte.push(Object.assign(muellSchritt(stand), { posten: i }));
    }
  });
  html += vbZeileHtml({
    name: "Strandmüll", einheit: "", besser: false, zusatzKlasse: "vb-muell",
    schritte: schritte,
    marken: '<div class="vb-schwelle" style="left:' + muellProzent(MUELL_SCHWELLE) +
      '%" title="EU-Schwellenwert: unter ' + MUELL_SCHWELLE + ' Teile"></div>',
    fuss: "Teile pro 100 m Strand, Ziel unter " + MUELL_SCHWELLE
  });
  // Müllbilanz: einmal, direkt am Strandmüll-Balken; der aktive Posten leuchtet während der Animation auf
  html += '<div class="vb-muellbilanz">' + posten.map(function (p, i) {
    const text = p.wert > 0 ? "+" + zahl(p.wert) : p.wert < 0 ? "−" + zahl(-p.wert) : "0";
    return '<span class="vb-posten ' + p.art + '" data-posten="' + i + '"><strong>' + text + "</strong>" +
      p.titel + "</span>";
  }).join("") + "</div>" +
    '<p class="klein vb-eintrag">Eintrag: Strandbesucher ' + zahl(mb.eintrag.strand, 1) + ", Fischerei und Schifffahrt " +
    zahl(mb.eintrag.meer, 1) + ", Flüsse und Hinterland " + zahl(mb.eintrag.land, 1) + " Teile pro 100 m.</p>";

  // Budget: ohne Balken
  const bDiff = n.budget - v.budget;
  html += '<div class="vb-zeile vb-budget"><div class="vb-kopf">' +
    '<span class="vb-name">Budget</span>' +
    '<span class="vb-werte"><span class="vb-alt">' + euro(v.budget) + "</span>" +
    '<span class="vb-pfeil" aria-hidden="true">→</span><strong>' + euro(n.budget) + "</strong>" +
    '<span class="vb-diff ' + (bDiff === 0 ? "" : bDiff > 0 ? "trend-gut" : "trend-schlecht") + '">' +
    (bDiff >= 0 ? "+" : "−") + euro(Math.abs(bDiff)) + "</span></span></div></div>";

  return html + "</div>";
}

// Startet die Balkenanimation im Rundenbericht. Ein neuer Aufruf bricht eine laufende Animation ab.
const VB_DAUER = 900;      // ms pro Schritt
const VB_VERSATZ = 160;    // ms Versatz zwischen den Zeilen
let vbLauf = 0;

function berichtAnimieren(container) {
  const lauf = ++vbLauf;
  const ruhig = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const zeilen = Array.prototype.slice.call(container.querySelectorAll(".vb-zeile[data-schritte]"));
  zeilen.forEach(function (zeile, i) {
    const schritte = JSON.parse(zeile.getAttribute("data-schritte"));
    const einheit = zeile.getAttribute("data-einheit");
    const fuellung = zeile.querySelector(".vb-fuellung");
    const zahlFeld = zeile.querySelector(".vb-zahl");
    const zeigen = function (wert) { zahlFeld.textContent = zahl(wert) + einheit; };
    const posten = function (s) {
      container.querySelectorAll(".vb-posten").forEach(function (p) {
        p.classList.toggle("aktiv", s.posten !== undefined && +p.getAttribute("data-posten") === s.posten);
      });
    };
    const ende = function () {
      const s = schritte[schritte.length - 1];
      fuellung.style.width = s.w + "%";
      fuellung.style.backgroundColor = s.f;
      zeigen(s.v);
      zeile.classList.add("fertig");
      if (zeile.classList.contains("vb-muell")) posten({});
    };
    if (ruhig || schritte.length < 2) { ende(); return; }

    const schritt = function (k) {
      if (lauf !== vbLauf) return;
      if (k >= schritte.length) { ende(); return; }
      const von = schritte[k - 1].v;
      const s = schritte[k];
      fuellung.style.transitionDuration = VB_DAUER + "ms";
      fuellung.style.width = s.w + "%";
      fuellung.style.backgroundColor = s.f;
      if (zeile.classList.contains("vb-muell")) posten(s);
      const t0 = performance.now();
      const zaehlen = function (t) {
        if (lauf !== vbLauf) return;
        const x = Math.min(1, (t - t0) / VB_DAUER);
        const weich = 1 - Math.pow(1 - x, 3);
        zeigen(Math.round(von + (s.v - von) * weich));
        if (x < 1) {
          requestAnimationFrame(zaehlen);
        } else {
          setTimeout(function () { schritt(k + 1); }, 150);
        }
      };
      requestAnimationFrame(zaehlen);
    };
    setTimeout(function () { schritt(1); }, 350 + i * VB_VERSATZ);
  });
}

function bilanzFeld(titel, wert, art) {
  return '<div class="bilanz-feld ' + art + '"><span class="bilanz-wert">' + wert +
    '</span><span class="bilanz-titel">' + titel + "</span></div>";
}

// Müllbilanz einer Runde: vorher − Reinigung − Abtrag + Eintrag = danach
function bilanzHtml(b) {
  return '<div class="bilanz">' +
    bilanzFeld("Bestand vorher", zahl(b.bestand), "") +
    bilanzFeld("Reinigung", b.entfernt ? "−" + zahl(b.entfernt) : "0", "gut") +
    bilanzFeld("natürlicher Abtrag", "−" + zahl(b.abtrag), "gut") +
    bilanzFeld("neuer Eintrag", "+" + zahl(b.eintrag.gesamt, 1), "schlecht") +
    bilanzFeld("Bestand danach", zahl(b.neu), "summe") + "</div>";
}

function berichtWeiter() {
  popupSchliessen("popupBericht");
  const b = aktuellerBericht;
  if (zustand.beendet) {
    abschlussQuizStarten();
    return;
  }
  if (b && b.ereignis) ereignisZeigen(b.ereignis);
}

// ---------- Ereignis ----------
function ereignisZeigen(ereignis) {
  el("ereignisTitel").textContent = ereignis.titel;
  el("ereignisText").textContent = ereignis.text;
  popupOeffnen("popupEreignis");
}

// ---------- Anliegen (Sprechblase) ----------
let anliegenIndex = -1;
let anliegenStart = 0;


// Öffnet das Anliegen. Es lässt sich nur einmal öffnen.
function anliegenOeffnen(index) {
  const a = zustand.anliegen[index];
  if (!a || a.gelesen) return;
  const p = PERSONEN[a.region];
  anliegenIndex = index;
  anliegenStart = Date.now();
  el("anliegenFigur").innerHTML = figurSvg(p);
  el("anliegenName").textContent = p.name;
  el("anliegenRolle").textContent = p.rolle + ", Region " + bereichName(a.region);
  el("anliegenText").textContent = "„" + a.text + "“";
  popupOeffnen("popupAnliegen");
}

// Schließen: zu kurz gelesen = übergangen
function anliegenSchliessen() {
  const a = zustand.anliegen[anliegenIndex];
  popupSchliessen("popupAnliegen");
  if (!a) return;
  const sekunden = (Date.now() - anliegenStart) / 1000;
  a.gelesen = true;
  a.zuSchnell = sekunden < MINDEST_LESEZEIT;
  anliegenIndex = -1;
  markerAnzeigen();
  rundenKnopfAnzeigen();
}

// ---------- Otter: kurzer Zwischenstand in Runde 3, 6 und 9 ----------
function otterDa(z) {
  return !z.beendet && OTTER_RUNDEN.indexOf(z.runde) >= 0;
}

// Seeotter im Stil der Karte: flache Farben, dunkle Kontur, schaut aus dem Wasser
function otterSvg() {
  const tinte = "#12304A";
  const fell = "#8A5A3B";
  const hell = "#D9B48C";
  return '<svg class="otter-figur" viewBox="0 0 34 28" aria-hidden="true" focusable="false">' +
    // Ohren
    '<circle cx="11.2" cy="5" r="1.7" fill="' + fell + '" stroke="' + tinte + '" stroke-width="1.2"/>' +
    '<circle cx="22.8" cy="5" r="1.7" fill="' + fell + '" stroke="' + tinte + '" stroke-width="1.2"/>' +
    // Körper
    '<path d="M9 26 C8 17 10.5 11.5 17 11.5 C23.5 11.5 26 17 25 26" fill="' + fell + '" stroke="' + tinte + '" stroke-width="1.4"/>' +
    '<path d="M12.6 26 C12.6 19.5 14.2 16.6 17 16.6 C19.8 16.6 21.4 19.5 21.4 26 Z" fill="' + hell + '"/>' +
    // Kopf
    '<ellipse cx="17" cy="9" rx="6.8" ry="5.9" fill="' + fell + '" stroke="' + tinte + '" stroke-width="1.4"/>' +
    '<ellipse cx="17" cy="11" rx="3.6" ry="2.5" fill="' + hell + '"/>' +
    '<ellipse cx="17" cy="9.9" rx="1.25" ry="0.85" fill="' + tinte + '"/>' +
    '<circle cx="14.2" cy="7.6" r="0.95" fill="' + tinte + '"/>' +
    '<circle cx="19.8" cy="7.6" r="0.95" fill="' + tinte + '"/>' +
    '<path d="M13.2 11 H9.6 M13.2 12 L9.9 13 M20.8 11 H24.4 M20.8 12 L24.1 13" stroke="' + tinte + '" stroke-width="0.6" stroke-linecap="round"/>' +
    // Pfoten
    '<ellipse cx="14.3" cy="18.2" rx="1.7" ry="1.25" fill="#6E4329" stroke="' + tinte + '" stroke-width="0.9"/>' +
    '<ellipse cx="19.7" cy="18.2" rx="1.7" ry="1.25" fill="#6E4329" stroke="' + tinte + '" stroke-width="0.9"/>' +
    // Wasserlinie
    '<path d="M1 24.5 Q5 22.5 9 24.5 T17 24.5 T25 24.5 T33 24.5 V28 H1 Z" fill="#FFFFFF" fill-opacity="0.35"/>' +
    '<path d="M1 24.5 Q5 22.5 9 24.5 T17 24.5 T25 24.5 T33 24.5" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>' +
    "</svg>";
}

// Zwischenstand aus der letzten Momentaufnahme: Welche Kennzahlen liegen hinter dem Kurs?
// Gleicher Maßstab wie die Wertung (kursGrad), aber nur in Worten und ohne Fachbegriffe.
function otterStand(s) {
  const kennzahlen = Object.keys(KENNZAHL_NAMEN).map(function (id) {
    const soll = kursSoll(id, s.runde);
    const muell = id === "strandmuell";
    return { name: KENNZAHL_NAMEN[id], muell: muell,
      wert: muell ? zahl(Math.round(s[id])) + " Teile" : s[id] + " %",
      soll: muell ? "höchstens " + zahl(Math.round(soll)) + " Teile" : Math.round(soll) + " %",
      hinten: kursGrad(id, s[id], s.runde) < 1,
      luecke: kennzahlPunkte(id, soll) - kennzahlPunkte(id, s[id]) };
  });
  const hinten = kennzahlen.filter(function (k) { return k.hinten; })
    .sort(function (a, b) { return b.luecke - a.luecke; });
  const imPlan = kennzahlen.filter(function (k) { return !k.hinten; });

  let titel;
  let satz;
  if (!hinten.length) {
    titel = "Alles auf Kurs";
    satz = "Alle sechs Kennzahlen liegen da, wo sie jetzt sein sollten. Halte die Richtung.";
  } else if (hinten.length <= 2) {
    titel = "Fast auf Kurs";
    satz = "Das meiste läuft nach Plan. Hier hängst du hinterher:";
  } else {
    titel = "Kurskorrektur nötig";
    satz = "Mehrere Kennzahlen hängen hinterher. In diesem Tempo wird es knapp:";
  }
  let html = '<p class="otter-satz">' + satz + "</p>";
  if (hinten.length) {
    html += '<ul class="otter-liste">' + hinten.slice(0, 3).map(function (k) {
      return "<li><strong>" + k.name + "</strong> " + k.wert + '<span class="otter-soll">jetzt nötig: ' + k.soll + "</span></li>";
    }).join("") + "</ul>";
    if (imPlan.length) {
      html += '<p class="klein">Im Plan: ' + namenListe(imPlan.map(function (k) { return k.name; })) + ".</p>";
    }
  }
  return { titel: titel, html: html };
}

function otterOeffnen() {
  const z = zustand;
  if (!otterDa(z)) return;
  const s = z.verlauf[z.verlauf.length - 1];
  const stand = otterStand(s);
  el("otterFigur").innerHTML = otterSvg();
  el("otterTitel").textContent = stand.titel;
  el("otterUntertitel").textContent = "Der Otter meldet deinen Stand nach Runde " + s.runde + ".";
  el("otterInhalt").innerHTML = stand.html;
  if (z.otterGelesen.indexOf(z.runde) < 0) z.otterGelesen.push(z.runde);
  popupOeffnen("popupOtter");
}

function otterSchliessen() {
  popupSchliessen("popupOtter");
  markerAnzeigen();
}

// ---------- Budget: wie es sich zusammensetzt ----------
function budgetZeigen() {
  const z = zustand;
  const k = z.kennzahlen;
  const ein = einnahmenBerechnen(z);
  const faktor = String(EINKOMMEN_FAKTOR).replace(".", ",");
  let html = "<h3>Einnahmen pro Runde</h3>" +
    '<table class="info-tabelle"><tbody>' +
    "<tr><td>Grundeinkommen der Region</td><td>" + euro(GRUNDEINKOMMEN) + "</td></tr>" +
    "<tr><td>Steuern und Abgaben aus Tourismus und Wirtschaft<br>" +
    '<span class="klein">' + faktor + " × Tourismus × Wirtschaft = " + faktor + " × " + k.tourismus + " × " +
    k.wirtschaft + "</span></td><td>" + euro(ein.anteil) + "</td></tr>";
  if (ein.zusatz) {
    html += "<tr><td>Zusätzliche Abgaben<br>" +
      '<span class="klein">z. B. Kurtaxe: fester Betrag pro Runde</span></td><td>' + euro(ein.zusatz) + "</td></tr>";
  }
  FOERDERPROGRAMME.forEach(function (f) {
    const erfuellt = f.pruefen(z);
    html += "<tr><td>" + f.name + '<br><span class="klein">Bedingung: ' + f.bedingung + " " +
      (erfuellt ? "Erfüllt." : "Noch nicht erfüllt.") + "</span></td><td>" +
      (erfuellt ? euro(f.betrag) : '<span class="gedaempft">0 €</span>') + "</td></tr>";
  });
  ein.laufend.liste.forEach(function (l) {
    html += "<tr><td>Laufende Kosten: " + l.name + "</td><td>−" + euro(l.betrag) + "</td></tr>";
  });
  html += '<tr class="summe-zeile"><td>Einnahmen beim aktuellen Stand</td><td>' + euro(ein.summe) + "</td></tr>" +
    "</tbody></table>" +
    '<p class="klein">Gezahlt wird am Ende jeder Runde, berechnet mit den Werten nach der Runde. Steigen ' +
    "Tourismus und Wirtschaft, steigen auch deine Einnahmen.</p>";

  html += "<h3>Ausgaben</h3>" +
    '<ul class="liste-kompakt">' +
    "<li><strong>Einmalige Kosten</strong> zahlst du in der Runde, in der du eine Maßnahme umsetzt. " +
    "Pro Runde kannst du bis zu drei Maßnahmen umsetzen, eine je Säule.</li>" +
    "<li><strong>Laufende Kosten</strong> einiger Maßnahmen werden jede Runde von den Einnahmen abgezogen.</li>" +
    "<li><strong>Wiederholbare Maßnahmen</strong> werden mit jeder Umsetzung teurer.</li>" +
    "</ul>";

  el("budgetInhalt").innerHTML = html;
  popupOeffnen("popupBudget");
}

// ---------- Bewertung: Ziel und Score ----------
// Inhalt der Bewertung: im Spiel als eigenes Pop-up, auf dem Startbildschirm unter „Spielinfo“
function bewertungHtml() {
  const fenster = zielFenster();
  let html = "<h3>Guter Umweltzustand</h3>" +
    "<p>Das Spiel gilt als gewonnen, wenn in den Runden " + fenster.von + " bis " + fenster.bis +
    " alle Mindestbedingungen gleichzeitig erfüllt sind. Welche das sind und wie du gerade stehst, zeigt " +
    "die Tafel „Ziel: guter Umweltzustand“.</p>";

  html += "<h3>Endergebnis</h3>" +
    '<table class="info-tabelle"><tbody>' +
    "<tr><td>Nachhaltigkeitsscore</td><td>" + Math.round((1 - WISSEN_ANTEIL) * 100) + " %</td></tr>" +
    "<tr><td>Wissensscore</td><td>" + Math.round(WISSEN_ANTEIL * 100) + " %</td></tr>" +
    "</tbody></table>";

  html += "<h3>Nachhaltigkeitsscore: den Kurs halten</h3>" +
    "<p>Jede Kennzahl hat in jeder Runde einen <strong>Sollwert</strong>. Wie weit du davon entfernt bist, zeigen " +
    "der Rundenbericht und der Otter in den Runden " + namenListe(OTTER_RUNDEN.map(String)) + ". " +
    "Der Sollkurs steigt anfangs flach, weil Maßnahmen verzögert wirken, und endet bei den Mindestwerten des guten " +
    "Umweltzustands. Wer auf oder über dem Sollwert liegt, bekommt die volle Punktzahl. Liegt eine Kennzahl darunter, " +
    "sinkt ihre Punktzahl bis auf null, sobald sie " + KURS_TOLERANZ + " Punkte (beim Strandmüll: Müllpunkte) hinter dem " +
    "Soll liegt. Mehr als nötig bringt keine Extrapunkte: Ein Meer, das schon gesund ist, gleicht keine Armut aus.</p>" +
    '<table class="info-tabelle"><tbody>';
  SAEULEN.forEach(function (sa) {
    const anteile = SAEULEN_KENNZAHLEN[sa.id];
    html += "<tr><td>" + sa.name + "</td><td>" + Object.keys(anteile).map(function (id) {
      return KENNZAHL_NAMEN[id] + (Object.keys(anteile).length > 1 ? " " + Math.round(anteile[id] * 100) + " %" : "");
    }).join(", ") + "</td></tr>";
  });
  html += "</tbody></table>" +
    "<p>Aus den drei Säulen wird der <strong>Rundenscore</strong>: " + Math.round((1 - SAEULEN_SCHWAECHSTE) * 100) +
    " % Mittelwert der drei Säulen plus " + Math.round(SAEULEN_SCHWAECHSTE * 100) + " % die schwächste Säule. " +
    "Ein Defizit in einer Säule lässt sich so durch die anderen nur teilweise ausgleichen. Das entspricht der " +
    "Idee der starken Nachhaltigkeit: Natur, Wirtschaft und Gesellschaft sind nicht beliebig austauschbar.</p>" +
    "<p>Der Nachhaltigkeitsscore ist der gewichtete Durchschnitt aller Rundenscores: Die Runden der " +
    "Einarbeitung zählen halb, die der Bewährung voll und die der Stabilisierung eineinhalbfach. " +
    "100 Punkte sind möglich, wenn du in jeder Runde auf oder über dem Sollkurs liegst. " +
    "Der Strandmüll zählt logarithmisch: Jede Halbierung bringt gleich viele Punkte, 100 gibt es unter " +
    MUELL_SCHWELLE + " Teilen.</p>" +
    '<p class="klein">Geld zählt nicht in den Score, entscheidet aber, was du dir leisten kannst.</p>';

  html += "<h3>Wissensscore</h3>" +
    "<p>Anteil deiner richtigen Antworten in allen Quizfragen: im Quiz am Ende jeder Runde und im " +
    "Abschlussquiz zu den Infopunkten. Der Wissensscore beeinflusst den Zustand der Region nicht.</p>";

  html += "<h3>Rangfolge im Leaderboard</h3>" +
    "<p>Spiele, die den guten Umweltzustand erreicht haben, stehen immer vor allen anderen. " +
    "Innerhalb dieser Gruppen entscheidet das Endergebnis.</p>";

  return html;
}

// Startbildschirm: Spielinfo mit der Bewertung darunter
function spielinfoZeigen() {
  el("ueberBewertung").innerHTML = bewertungHtml();
  el("popupUeber").querySelector(".popup-inhalt").scrollTop = 0;
  popupOeffnen("popupUeber");
}

// ---------- Endauswertung ----------
// Bewertungstext zum Endergebnis (0 bis 100), abgestuft statt „erreicht / nicht erreicht“
function bewertungsText(ergebnis) {
  const wert = runden1(ergebnis);
  if (wert >= 100) return "Perfekt!! Alles richtig umgesetzt.";
  if (wert >= 90) return "Wow, fast perfekt!";
  if (wert >= 80) return "Gut, weiter so!";
  if (wert >= 75) return "Naja, schon gut, aber geht noch besser.";
  return "Da geht noch mehr. Probier es gleich noch einmal!";
}
const REIHEN = [
  { id: "meeresgesundheit", name: "Meeresgesundheit", farbe: "#1F6FB2" },
  { id: "artenvielfalt",    name: "Artenvielfalt",    farbe: "#2E8B57" },
  { id: "wirtschaft",       name: "Wirtschaft",       farbe: "#8A6D1F" },
  { id: "tourismus",        name: "Tourismus",        farbe: "#E8662A" },
  { id: "akzeptanz",        name: "Akzeptanz",        farbe: "#7A4FA0" }
];

// Liniendiagramm als SVG; Beschriftungen stehen außerhalb der Zeichenfläche
function diagrammSvg(verlauf, reihen, yMax, schwelle, schwelleFarbe) {
  const B = 520, H = 190, li = 36, re = 8, ob = 8, un = 24;
  const breite = B - li - re;
  const hoehe = H - ob - un;
  const xPos = function (r) { return li + r / RUNDEN * breite; };
  const yPos = function (w) { return ob + hoehe - begrenzen(w, 0, yMax) / yMax * hoehe; };
  let s = '<svg viewBox="0 0 ' + B + " " + H + '" xmlns="http://www.w3.org/2000/svg" role="img">';
  for (let i = 0; i <= 4; i++) {
    const w = yMax / 4 * i;
    const y = yPos(w);
    s += '<line x1="' + li + '" y1="' + y + '" x2="' + (B - re) + '" y2="' + y + '" stroke="#C9D6DE" stroke-width="1"/>';
    s += '<text x="' + (li - 8) + '" y="' + (y + 4) + '" text-anchor="end" class="achse">' + zahl(w) + "</text>";
  }
  for (let r = 0; r <= RUNDEN; r += 2) {
    s += '<text x="' + xPos(r) + '" y="' + (H - 6) + '" text-anchor="middle" class="achse">' + r + "</text>";
  }
  if (schwelle !== null) {
    s += '<line x1="' + li + '" y1="' + yPos(schwelle) + '" x2="' + (B - re) + '" y2="' + yPos(schwelle) +
      '" stroke="' + schwelleFarbe + '" stroke-width="1.5" stroke-dasharray="6 4"/>';
  }
  reihen.forEach(function (reihe) {
    const punkte = verlauf.map(function (v) { return xPos(v.runde).toFixed(1) + "," + yPos(v[reihe.id]).toFixed(1); });
    s += '<polyline points="' + punkte.join(" ") + '" fill="none" stroke="' + reihe.farbe + '" stroke-width="' +
      (reihe.dick ? 3.2 : 2.2) + '" stroke-linejoin="round"' + (reihe.gestrichelt ? ' stroke-dasharray="7 5"' : "") + "/>";
  });
  s += "</svg>";
  return s;
}

function auswertungZeigen() {
  const z = zustand;
  const ende = endScore(z);
  const nachhaltigkeit = gesamtScore(z);
  const wissen = wissensScore(z);
  let html = "";

  html += '<div class="ergebnis ' + (runden1(ende) >= 75 ? "ergebnis-ok" : "ergebnis-offen") + '">' +
    '<div class="ergebnis-score"><span class="ergebnis-zahl">' + zahl(ende, 1) + "</span>" +
    '<span class="ergebnis-einheit">Endergebnis von 100</span></div>' +
    '<div class="ergebnis-text"><p class="ergebnis-titel">' + bewertungsText(ende) + "</p>" +
    '<p class="ergebnis-teile">Nachhaltigkeit <strong>' + zahl(nachhaltigkeit, 1) + "</strong> × " +
    Math.round((1 - WISSEN_ANTEIL) * 100) + " % + Wissen <strong>" + (wissen === null ? "–" : zahl(wissen, 1)) +
    "</strong> × " + Math.round(WISSEN_ANTEIL * 100) + " %</p>" +
    "</div></div>";

  // Verlauf: Kennzahlen und Strandmüll nebeneinander (auf schmalen Bildschirmen untereinander)
  html += '<section class="bericht-block diagramm-paar"><div><h3>Verlauf der Kennzahlen</h3>' +
    '<div class="diagramm">' + diagrammSvg(z.verlauf, REIHEN, 100, GUTER_ZUSTAND.meeresgesundheit, "#12304A") + "</div>" +
    '<ul class="diagramm-legende">' + REIHEN.map(function (r) {
      return '<li><span class="linie" style="background:' + r.farbe + '"></span>' + r.name + "</li>";
    }).join("") + '<li><span class="linie gestrichelt"></span>Mindestwert ' + GUTER_ZUSTAND.meeresgesundheit + " %</li></ul></div>" +
    '<div><h3>Strandmüll in Teilen pro 100 m</h3>' +
    '<div class="diagramm">' + diagrammSvg(z.verlauf, [{ id: "strandmuell", farbe: "#C8382E" }], 300, MUELL_SCHWELLE, "#2E8B57") + "</div>" +
    '<ul class="diagramm-legende"><li><span class="linie" style="background:#C8382E"></span>Strandmüll</li>' +
    '<li><span class="linie gestrichelt gruen"></span>EU-Schwellenwert ' + MUELL_SCHWELLE + "</li></ul></div></section>";

  // Kompetenzprofil und Zielkonflikte
  html += '<section class="bericht-block"><h3>Dein Kompetenzprofil</h3>' +
    '<p class="klein">Aus deinem Spielverhalten abgeleitet, ohne zusätzliche Fragen.</p>' +
    '<ul class="profil-liste">' + kompetenzProfil(z).map(function (k) {
      return '<li><div class="profil-kopf"><span>' + k.name + "</span><strong>" + k.wert + " von 100</strong></div>" +
        '<div class="profil-balken" role="img" aria-label="' + k.name + ": " + k.wert + ' von 100"><span style="width:' + k.wert +
        '%"></span></div><p class="profil-beleg">' + k.beleg + "</p></li>";
    }).join("") + "</ul></section>";

  const konfl = konflikte(z, 3);
  html += '<section class="bericht-block"><h3>Wo es geknirscht hat</h3>' + (konfl.length
    ? '<ul class="konflikt-liste">' + konfl.map(function (k) {
        return "<li><strong>Runde " + k.runde + ": " + k.saeule.name + " fiel von " + zahl(k.von) + " auf " + zahl(k.auf) +
          ".</strong> " + (k.massnahmen.length ? "Umgesetzt wurde: " + k.massnahmen.map(function (m) { return m.name; }).join(", ") + ". " : "") +
          (k.grund.length ? "Hinter dem Kurs lagen: " + k.grund.map(function (g) {
            return g.name + " " + zahl(g.wert) + g.einheit + " statt " + (g.hoeher ? "" : "höchstens ") + zahl(g.soll) + g.einheit;
          }).join(", ") + "." : "") + "</li>";
      }).join("") + "</ul>"
    : "<p>Keine Säule ist in einer Runde deutlich eingebrochen. Du hast die Zielkonflikte früh abgefedert.</p>") +
    "</section>";

  // Wissen
  const freiwillige = INFOPUNKTE.filter(function (p) { return p.runde !== INFOPUNKT_PFLICHT_RUNDE; });
  const freiwilligGelesen = freiwillige.filter(function (p) { return infopunktGelesen(z, p.id); }).length;
  html += '<section class="bericht-block"><h3>Dein Wissen</h3>' +
    "<p>Du hast <strong>" + z.quiz.richtig + " von " + z.quiz.gestellt + "</strong> Quizfragen richtig " +
    "beantwortet und <strong>" + freiwilligGelesen + " von " + freiwillige.length +
    "</strong> freiwilligen Infopunkten gelesen.</p></section>";

  // Deine Entscheidungen: jede Runde eine Zeile, je Säule eine Spalte. So steht jede umgesetzte
  // Maßnahme an ihrem Platz, auch wiederholte (z. B. Aufräumaktion in mehreren Runden).
  const proRunde = [];
  for (let r = 1; r <= RUNDEN; r++) proRunde.push({ oeko: [], oekonomie: [], sozial: [] });
  let anzahlMassnahmen = 0;
  Object.keys(z.umgesetzt).forEach(function (id) {
    const m = massnahmeFinden(id);
    if (!m) return;
    z.umgesetzt[id].forEach(function (r) {
      if (r < 1 || r > RUNDEN) return;
      proRunde[r - 1][m.saeule].push(m.name);
      anzahlMassnahmen += 1;
    });
  });
  html += '<details class="bericht-block aufklapp-block"><summary><h3>Deine Entscheidungen</h3>' +
    '<span class="klein">' + anzahlMassnahmen + " Maßnahmen</span>" +
    '<span class="bericht-pfeil" aria-hidden="true">▼</span></summary>' +
    (anzahlMassnahmen
      ? '<p class="klein">„–“ heißt: in dieser Säule zurückgestellt.</p>' +
        '<div class="entscheidungen-rahmen"><table class="entscheidungen-tabelle"><thead><tr><th scope="col">Runde</th>' +
        SAEULEN.map(function (sl) { return '<th scope="col">' + sl.name + "</th>"; }).join("") + "</tr></thead><tbody>" +
        proRunde.map(function (zeile, i) {
          return '<tr><th scope="row">' + (i + 1) + "</th>" + SAEULEN.map(function (sl) {
            const namen = zeile[sl.id];
            return '<td data-saeule="' + sl.name + '">' + (namen.length ? namen.join("<br>") : '<span class="gedaempft">–</span>') + "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>"
      : "<p>Du hast keine Maßnahme umgesetzt.</p>") + "</details>";

  html += '<section class="bericht-block reflexion"><h3>Zum Nachdenken</h3><ul class="liste-kompakt">' +
    "<li>Welche Maßnahme hat den Müll-Eintrag am stärksten gesenkt? Warum hätte Aufräumen allein nicht gereicht?</li>" +
    "<li>Welche Maßnahme für die Wirtschaft hat dem Meer geschadet, und hat sich das gelohnt?</li>" +
    "<li>Wo musstest du zwischen Meeresschutz, Wirtschaft und Akzeptanz abwägen, und wie hast du entschieden? Wer hat die Last getragen, und wie hast du sie abgefedert?</li>" +
    "<li>Wann hat eine Säule deinen Score nach unten gezogen, obwohl die anderen gut standen? Was sagt das über Nachhaltigkeit als Gleichgewicht?</li>" +
    "<li>Welche Wirkung kam verzögert? Was würdest du in einer neuen Runde früher anpacken?</li>" +
    "<li>Welche Anliegen von Merle, Jannik und Ole haben deine Entscheidungen beeinflusst?</li>" +
    "</ul></section>";

  el("auswertungInhalt").innerHTML = html;
  el("auswertungInhalt").scrollTop = 0;
  popupOeffnen("popupAuswertung");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// ==========================================================
// 10. SPIELABLAUF
// ==========================================================
function massnahmeWaehlen(id) {
  const z = zustand;
  const m = massnahmeFinden(id);
  if (!m || z.beendet) return;
  if (z.auswahl[m.saeule] === id) {
    z.auswahl[m.saeule] = null;          // erneuter Klick hebt die Auswahl auf
  } else if (massnahmeStatus(z, m).moeglich) {
    z.auswahl[m.saeule] = id;
  } else {
    return;
  }
  z.zuletzt = id;
  auswahlAktualisieren();
}

function auswahlAktualisieren() {
  massnahmenAnzeigen();
  rundenKnopfAnzeigen();
  // Fokus bleibt auf dem Knopf in der offenen Karte (oder auf ihrem Kopf, falls er gesperrt ist)
  if (zustand.zuletzt) {
    fokusAuf('[data-waehlen="' + zustand.zuletzt + '"]:not(:disabled)');
    if (!el("massnahmenListe").contains(document.activeElement)) fokusAuf('[data-karte="' + zustand.zuletzt + '"]');
  }
}

function zurueckstellen(saeule) {
  const z = zustand;
  if (z.beendet) return;
  z.auswahl[saeule] = z.auswahl[saeule] === ZURUECKSTELLEN ? null : ZURUECKSTELLEN;
  z.zuletzt = ZURUECKSTELLEN + ":" + saeule;
  auswahlAktualisieren();
}

// Rundenende: erst das Quiz der Runde, dann der Bericht
function rundeBeenden() {
  const z = zustand;
  if (!rundeBereit(z)) return;
  const abschliessen = function () {
    const bericht = rundeAbschliessen(zustand, zustand.auswahl);
    alleAnzeigen();
    berichtZeigen(bericht);
  };
  const fragen = quizFuerRunde(z.runde);
  if (fragen.length) {
    quizStarten(fragen, "Quiz zu Runde " + z.runde, abschliessen);
  } else {
    abschliessen();
  }
}

function abschlussQuizStarten() {
  quizStarten(abschlussFragen(), "Abschlussquiz", spielAbschliessen);
}

function neuesSpielStarten(name) {
  spielerName = name;
  zustand = neuerZustand();
  alleAnzeigen();
  startbildschirmVerbergen();
  einfuehrungZeigen(0);
}

// Nach dem Abschlussquiz: Spielstand speichern und Auswertung zeigen
function spielAbschliessen() {
  alleAnzeigen();
  spielstandSpeichern();
  auswertungZeigen();
}

function zumStartbildschirm() {
  document.querySelectorAll(".overlay").forEach(function (o) {
    popupSchliessen(o.id);
    nachSchliessen[o.id] = null;
  });
  zustand = neuerZustand();
  alleAnzeigen();
  startbildschirmZeigen();
}

// ---------- Startbildschirm: Hintergrund, Splash ----------
// Aufbau wie ein Spiele-Hauptmenü: Titel oben, Knöpfe in der Mitte.
// Die Meeresfakten erscheinen im Ladebildschirm (siehe unten).
const start = {
  aktiv: false,
  bilder: [], bildIndex: -1, bildTimer: null
};

function startbildschirmVorbereiten() {
  const szene = kuestenSzene();
  el("startSzene").innerHTML = szene.basis;
  el("startWolken").innerHTML = szene.wolken;
  el("startWindsack").innerHTML = szene.windsack;
  szeneVorbereiten(szene);
  window.addEventListener("resize", startGroesseAnpassen);
  el("startSonne").innerHTML = sonneSvg();
  el("startVersion").textContent = "Ocean Balance · " + START_VERSION;

  if (!document.fullscreenEnabled) el("startVollbild").classList.add("versteckt");
  document.addEventListener("fullscreenchange", vollbildKnopfAktualisieren);
  vollbildKnopfAktualisieren();

  bilderLaden();
}

function startbildschirmZeigen() {
  el("startbildschirm").classList.remove("versteckt");
  start.aktiv = true;
  el("startSplash").textContent = START_SPLASH[Math.floor(Math.random() * START_SPLASH.length)];
  bildTimerStarten();
  startGroesseAnpassen();
  szeneStarten();
}

// Beim Spielstart: Startbildschirm ausblenden und alle Wechsel anhalten
function startbildschirmVerbergen() {
  el("startbildschirm").classList.add("versteckt");
  start.aktiv = false;
  clearTimeout(start.bildTimer);
  szeneAnhalten();
}

// ---------- Ladebildschirm ----------
// Ablauf: Name bestätigen → ladebildschirmStarten() → genau LADEBILDSCHIRM.gesamtDauer (8 s) lang
// Meeresfakten → danach startet das Spiel (Einführung).
//
// Zwei voneinander unabhängige Uhren:
//   1. Gesamtuhr  (gesamtDauer, 8 s): startet einmal und wird NIE verlängert oder verkürzt.
//                 Sie steuert den großen Ladebalken und das Ende des Ladebildschirms.
//   2. Faktuhr    (faktDauer, 4 s): läuft pro Fakt. Ist sie abgelaufen, erscheint der nächste Fakt.
//                 Beim Überspringen startet sie sofort neu. Ohne Eingriff: Fakt 1 bei 0 s,
//                 Fakt 2 bei 4 s, Ende bei 8 s. Die Faktuhr ist unsichtbar (kein Balken über dem Fakt).
//
// Die Uhren laufen über setTimeout und Zeitstempel (performance.now), nicht über die Bildrate.
// requestAnimationFrame zeichnet nur den Ladebalken. So bleiben die 8 s auch bei ruckelnder
// Darstellung oder einem Tab im Hintergrund exakt (der Browser pausiert dort nur das Zeichnen).
//
// Alle Eingabe-Listener hängen an einem AbortController: Ein einziges abort() beim Beenden
// entfernt sie vollständig, damit nach dem Laden keine Listener (Memory Leaks, Geister-Skips) übrig bleiben.
//
// Zustand während des Ladens (lade):
//   aktiv        läuft der Ladebildschirm gerade?
//   startZeit    performance.now() beim Start; Ende = startZeit + gesamtDauer
//   faktStart    performance.now(), seit der aktuelle Fakt steht
//   fakt         der angezeigte Fakt
//   anzahl       wie viele Fakten in dieser Ladung schon gezeigt wurden
//   endeTimer    setTimeout-ID der Gesamtuhr
//   faktTimer    setTimeout-ID der Faktuhr
//   schleife     requestAnimationFrame-ID der Zeichenschleife
//   abbruch      AbortController der Eingabe-Listener
//   stapel       gemischte Fakten; gezogen wird von oben, leer → neu mischen.
//                So wiederholt sich kein Fakt, bevor alle einmal dran waren.
//   fertig       Rückruf, der genau einmal nach Ablauf der 8 s läuft
const lade = {
  aktiv: false,
  startZeit: 0, faktStart: 0,
  fakt: null, anzahl: 0,
  endeTimer: null, faktTimer: null, schleife: 0,
  abbruch: null,
  prozent: -1, phase: -1,
  stapel: [], fertig: null
};

// Anteil 0…1 der verstrichenen Gesamtzeit (für den großen Balken)
function ladeGesamtFortschritt(verstrichen, einstellung) {
  const e = einstellung || LADEBILDSCHIRM;
  return Math.min(1, Math.max(0, verstrichen / e.gesamtDauer));
}

// Phase 0, 1 oder 2 der Gesamtzeit (je ein Drittel); bestimmt die Statuszeile unter dem Balken.
// Hängt nur an der Gesamtuhr, Überspringen ändert sie also nicht.
function ladePhase(verstrichen, einstellung) {
  const anzahl = LADE_STATUS.length;
  return Math.min(anzahl - 1, Math.floor(ladeGesamtFortschritt(verstrichen, einstellung) * anzahl));
}

// Zieht den nächsten Fakt vom gemischten Stapel. Ist der Stapel leer, wird neu gemischt.
// "ausser": dieser Fakt darf nicht direkt noch einmal kommen (Übergang zwischen zwei Mischungen).
function naechsterFakt(ausser, zufall) {
  if (!lade.stapel.length) {
    lade.stapel = MEERESFAKTEN.slice();
    mischen(lade.stapel, zufall || Math.random);
    const oben = lade.stapel.length - 1;
    if (ausser && lade.stapel.length > 1 && lade.stapel[oben] === ausser) {
      lade.stapel[oben] = lade.stapel[0];          // Doppelten nach unten tauschen
      lade.stapel[0] = ausser;
    }
  }
  return lade.stapel.pop();
}

// Zieht mehrere verschiedene Fakten (z. B. für Tests oder eine Vorschau)
function faktenZiehen(anzahl, zufall) {
  const n = Math.min(anzahl, MEERESFAKTEN.length);
  const gezogen = [];
  while (gezogen.length < n) {
    const fakt = naechsterFakt(gezogen[gezogen.length - 1], zufall);
    if (gezogen.indexOf(fakt) === -1) gezogen.push(fakt);
  }
  return gezogen;
}

// Öffnet den Ladebildschirm. fertig() läuft genau einmal, nach exakt gesamtDauer ms.
function ladebildschirmStarten(fertig) {
  ladeAufraeumen();                                // falls noch ein alter Durchlauf hängt
  lade.fertig = fertig;
  lade.aktiv = true;
  lade.anzahl = 0;
  lade.fakt = null;
  lade.prozent = -1;
  lade.phase = -1;

  ladeMarkenSetzen();
  el("startbildschirm").classList.add("laedt");    // Menü ausblenden, Hintergrund läuft weiter
  el("ladebildschirm").classList.remove("versteckt");
  el("ladeWeiter").disabled = false;

  lade.startZeit = performance.now();
  ladeListenerAnmelden();
  ladeNaechsterFakt();                             // Fakt 1, startet auch die Faktuhr

  // Gesamtuhr: einmal gestellt, durch Überspringen nie verändert
  lade.endeTimer = setTimeout(ladebildschirmBeenden, LADEBILDSCHIRM.gesamtDauer);

  ladeZeichnen(lade.startZeit);
  el("ladeWeiter").focus();
  lade.schleife = requestAnimationFrame(ladeSchleife);
}

// Trennstriche im Ladebalken: dort wechselt der Fakt, wenn niemand überspringt (bei 4 s)
function ladeMarkenSetzen() {
  const anzahl = Math.round(LADEBILDSCHIRM.gesamtDauer / LADEBILDSCHIRM.faktDauer);
  let html = "";
  for (let i = 1; i < anzahl; i++) {
    html += '<span class="lade-marke" style="left: ' + (i / anzahl * 100).toFixed(3) + '%"></span>';
  }
  el("ladeMarken").innerHTML = html;
}

// Zeigt den nächsten Fakt und stellt die Faktuhr neu (4 s ab jetzt).
// Wird von der Faktuhr selbst und vom Überspringen aufgerufen.
function ladeNaechsterFakt() {
  if (!lade.aktiv) return;
  clearTimeout(lade.faktTimer);                    // laufende Faktuhr verwerfen (Reset beim Skip)
  lade.fakt = naechsterFakt(lade.fakt);
  lade.anzahl += 1;
  lade.faktStart = performance.now();
  ladeFaktZeigen(lade.fakt);
  lade.faktTimer = setTimeout(ladeNaechsterFakt, LADEBILDSCHIRM.faktDauer);
}

function ladeFaktZeigen(f) {
  const kat = FAKT_KATEGORIEN[f.kategorie];
  const karte = el("ladeKarte");
  karte.classList.remove("fakt-ein");
  void karte.offsetWidth;                          // Einblendung neu starten
  const chip = el("ladeKategorie");
  chip.textContent = kat.name;
  chip.style.setProperty("--kat", kat.farbe);
  el("ladeTitel").textContent = f.titel;
  el("ladeText").textContent = f.text;
  const quelle = el("ladeQuelle");
  quelle.textContent = f.quelle.name;
  quelle.href = f.quelle.url;
  quelle.title = f.quelle.url;                     // volle Adresse beim Überfahren
  karte.classList.add("fakt-ein");
}

// Zeichenschleife: rechnet nichts fort, sondern liest nur die Uhren ab
function ladeSchleife(zeit) {
  if (!lade.aktiv) return;
  ladeZeichnen(zeit);
  lade.schleife = requestAnimationFrame(ladeSchleife);
}

// Zeichnet Ladebalken, Prozentzahl und Statuszeile für den Zeitpunkt "jetzt"
function ladeZeichnen(jetzt) {
  const verstrichen = jetzt - lade.startZeit;
  const gesamt = ladeGesamtFortschritt(verstrichen);
  el("ladeFuellung").style.transform = "scaleX(" + gesamt.toFixed(4) + ")";

  const prozent = Math.round(gesamt * 100);
  if (prozent !== lade.prozent) {                  // Text und ARIA nur bei Änderung anfassen
    lade.prozent = prozent;
    el("ladeProzent").textContent = prozent + " %";
    el("ladeBalken").setAttribute("aria-valuenow", String(prozent));
  }
  const phase = ladePhase(verstrichen);
  if (phase !== lade.phase) {
    lade.phase = phase;
    el("ladeStatus").textContent = LADE_STATUS[phase];
  }
}

// Aktuellen Fakt überspringen: sofort der nächste Fakt, Faktuhr startet neu.
// Die Gesamtuhr bleibt unberührt, das Ende nach 8 s verschiebt sich also nicht.
function ladeUeberspringen() {
  if (!lade.aktiv) return;
  ladeNaechsterFakt();
}

// Nach Ablauf der Gesamtuhr: Balken auf 100 %, alles abbauen, dann das Spiel starten
function ladebildschirmBeenden() {
  if (!lade.aktiv) return;
  ladeZeichnen(lade.startZeit + LADEBILDSCHIRM.gesamtDauer);   // sichtbar voll, auch wenn ein Bild fehlte
  el("ladeStatus").textContent = "Bereit!";
  ladeAufraeumen();
  el("ladebildschirm").classList.add("versteckt");
  el("startbildschirm").classList.remove("laedt");
  const fertig = lade.fertig;
  lade.fertig = null;
  if (fertig) fertig();
}

// Gibt alles frei, was der Ladebildschirm belegt: beide Uhren, die Zeichenschleife und
// sämtliche Eingabe-Listener. Mehrfacher Aufruf ist unschädlich.
function ladeAufraeumen() {
  lade.aktiv = false;
  clearTimeout(lade.endeTimer);
  clearTimeout(lade.faktTimer);
  cancelAnimationFrame(lade.schleife);
  lade.endeTimer = null;
  lade.faktTimer = null;
  lade.schleife = 0;
  if (lade.abbruch) {
    lade.abbruch.abort();                          // entfernt alle Listener aus ladeListenerAnmelden
    lade.abbruch = null;
  }
}

// Meldet die Eingaben an, die einen Fakt überspringen. Nur solange der Ladebildschirm läuft.
//   Enter / Leertaste        keydown auf document
//   linke Maustaste, Tippen  click
//   mittlere Maustaste       auxclick (mousedown verhindert vorher das Auto-Scrollen)
//   rechte Maustaste         contextmenu (das Browsermenü wird unterdrückt)
function ladeListenerAnmelden() {
  lade.abbruch = new AbortController();
  const optionen = { signal: lade.abbruch.signal };
  const flaeche = el("ladebildschirm");
  document.addEventListener("keydown", ladeTaste, optionen);
  flaeche.addEventListener("click", ladeKlick, optionen);
  flaeche.addEventListener("auxclick", ladeKlick, optionen);
  flaeche.addEventListener("mousedown", ladeMittelklickVorbereiten, optionen);
  flaeche.addEventListener("contextmenu", ladeKlick, optionen);
}

// Klick mit einer Maustaste irgendwo auf den Ladebildschirm (auch auf „Weiter“) überspringt den Fakt.
// Ausnahmen: Der Quellenlink soll sich normal öffnen, und wer Text markiert, will nicht weiter.
function ladeKlick(ereignis) {
  if (ereignis.target.closest && ereignis.target.closest("a")) return;
  // Rechtsklick kommt als contextmenu; das zusätzliche auxclick der rechten Taste ignorieren,
  // sonst würde ein Rechtsklick zwei Fakten überspringen
  if (ereignis.type === "auxclick" && ereignis.button !== 1) return;
  if (ereignis.type === "contextmenu") ereignis.preventDefault();
  else if (window.getSelection && String(window.getSelection()) !== "") return;
  ladeUeberspringen();
}

// Mittlere Maustaste: Auto-Scrollen des Browsers verhindern, damit der Klick als auxclick ankommt
function ladeMittelklickVorbereiten(ereignis) {
  if (ereignis.button === 1 && !(ereignis.target.closest && ereignis.target.closest("a"))) {
    ereignis.preventDefault();
  }
}

// Leertaste oder Enter überspringen den Fakt.
// Liegt der Fokus auf einem Knopf oder Link, löst der Browser bei Leertaste/Enter selbst einen
// Klick aus; dann hier nichts tun, sonst würde doppelt übersprungen.
// defaultPrevented: Das Enter aus der Namenseingabe startet das Laden und darf nicht gleich überspringen.
// repeat: Gedrückt gehaltene Tasten zählen nur einmal.
function ladeTaste(ereignis) {
  if (!lade.aktiv || ereignis.defaultPrevented || ereignis.repeat) return;
  const taste = ereignis.key;
  if (taste !== " " && taste !== "Enter") return;
  const ziel = ereignis.target;
  if (ziel.closest && ziel.closest("button, a")) return;
  ereignis.preventDefault();
  ladeUeberspringen();
}

// ---------- Hintergrundbilder ----------
// Lädt die Bilder aus HINTERGRUNDBILDER. Nur Bilder, die tatsächlich vorhanden sind,
// kommen in den Wechsel. Darunter liegt immer die gezeichnete Küstenszene.
function bilderLaden() {
  HINTERGRUNDBILDER.forEach(function (b) {
    const bild = new Image();
    bild.onload = function () {
      const ebene = elementBauen("div", "start-bild");
      ebene.style.backgroundImage = 'url("' + b.datei + '")';
      el("startBilder").appendChild(ebene);
      el("startbildschirm").classList.add("mit-fotos");     // gezeichnete Sonne ausblenden
      start.bilder.push({ ebene: ebene, nachweis: b.nachweis || "" });
      if (start.bilder.length === 1) bildZeigen(0);
      if (start.bilder.length === 2) bildTimerStarten();
    };
    bild.src = b.datei;
  });
}

function bildZeigen(index) {
  if (!start.bilder.length) return;
  const vorher = start.bilder[start.bildIndex];
  start.bildIndex = index % start.bilder.length;
  const neu = start.bilder[start.bildIndex];
  if (vorher && vorher !== neu) {
    vorher.ebene.classList.remove("aktiv");
    vorher.ebene.classList.add("vorher");             // Zoom läuft beim Ausblenden weiter
    setTimeout(function () { vorher.ebene.classList.remove("vorher"); }, 3000);
  }
  neu.ebene.classList.remove("vorher");
  neu.ebene.classList.add("aktiv");
  el("bildNachweis").textContent = neu.nachweis ? "Foto: " + neu.nachweis : "";
}

function bildTimerStarten() {
  clearTimeout(start.bildTimer);
  if (!start.aktiv || start.bilder.length < 2) return;
  start.bildTimer = setTimeout(function () {
    bildZeigen(start.bildIndex + 1);
    bildTimerStarten();
  }, START_BILD_DAUER);
}

// ---------- Vollbild ----------
function vollbildUmschalten() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(function () {});
  } else if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(function () {});
  }
}

function vollbildKnopfAktualisieren() {
  const an = Boolean(document.fullscreenElement);
  const knopf = el("startVollbild");
  knopf.setAttribute("aria-label", an ? "Vollbild beenden" : "Vollbild");
  knopf.title = an ? "Vollbild beenden" : "Vollbild";
  knopf.classList.toggle("ist-vollbild", an);
}

// ---------- Pop-up: Quellen ----------
function quellenZeigen() {
  let html = "<h3>Fakten im Ladebildschirm</h3><ol class=\"quellen-liste\">";
  MEERESFAKTEN.forEach(function (f) {
    html += "<li><strong>" + escapeHtml(f.titel) + "</strong><br>" +
      '<a href="' + escapeHtml(f.quelle.url) + '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(f.quelle.name) + "</a></li>";
  });
  html += "</ol>";

  const nachweise = start.bilder.filter(function (b) { return b.nachweis; });
  html += "<h3>Hintergrundbilder</h3>";
  if (nachweise.length) {
    html += '<ul class="liste-kompakt">' + nachweise.map(function (b) {
      return "<li>" + escapeHtml(b.nachweis) + "</li>";
    }).join("") + "</ul>";
  } else if (start.bilder.length) {
    html += "<p>Für die Hintergrundbilder ist noch kein Bildnachweis eingetragen (HINTERGRUNDBILDER in script.js).</p>";
  } else {
    html += "<p>Gezeichnete Küstenszene, Teil des Spiels.</p>";
  }
  html += "<h3>Fische auf der Karte</h3>" +
    "<p>Arten und Aussehen (" + escapeHtml(FISCH_ARTEN.map(function (a) { return a.name; }).join(", ")) + ") nach: " +
    '<a href="https://www.schutzstation-wattenmeer.de/wissen/tiere/fische/" target="_blank" rel="noopener noreferrer">' +
    "Schutzstation Wattenmeer, Fische der Nordsee</a></p>";
  html += '<p class="klein">Die Fakten zeigen den Stand der jeweiligen Quelle. Zahlen zu Beständen ändern ' +
    "sich mit jeder neuen Zählung.</p>";
  el("quellenInhalt").innerHTML = html;
  el("quellenInhalt").scrollTop = 0;
  popupOeffnen("popupQuellen");
}

// ---------- Gezeichnete Küstenszene (Ersatz, solange keine Fotos vorhanden sind) ----------
// Position der Sonne in der Szene (Koordinaten der viewBox 1600 × 900)
const SONNE = { x: 150, y: 92 };

// Sonne mit Wolke davor. Liegt ÜBER der Abdunklung, damit sie hell leuchtet;
// die Lichtstrahlen bleiben in der Szene darunter und wirken dadurch dezent.
function sonneSvg() {
  const sx = SONNE.x;
  const sy = SONNE.y;
  let s = '<svg viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" focusable="false">';
  s += "<defs>" +
    '<radialGradient id="soGlanz" cx="' + sx + '" cy="' + sy + '" r="300" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="#FFFDF4"/><stop offset="0.14" stop-color="#FFF6D6" stop-opacity="0.9"/>' +
    '<stop offset="0.4" stop-color="#FFE8AE" stop-opacity="0.28"/><stop offset="1" stop-color="#FFE8AE" stop-opacity="0"/></radialGradient>' +
    '<filter id="soWeich" x="-40%" y="-120%" width="180%" height="340%"><feGaussianBlur stdDeviation="18"/></filter>' +
    '<filter id="soKante" x="-40%" y="-120%" width="180%" height="340%"><feGaussianBlur stdDeviation="9"/></filter>' +
    "</defs>";
  s += '<circle cx="' + sx + '" cy="' + sy + '" r="300" fill="url(#soGlanz)"/>';
  s += '<circle cx="' + sx + '" cy="' + sy + '" r="34" fill="#FFFFFF"/>';
  // Wolke verdeckt die untere Hälfte der Sonne: dunklerer Körper, oben vom Licht gesäumt
  const wolke = [[-70, 46, 115, 32], [55, 40, 130, 36], [180, 58, 115, 30], [-175, 64, 95, 26], [20, 72, 165, 30]];
  s += '<g filter="url(#soWeich)" fill="#C9D8E6" opacity="0.95">';
  wolke.forEach(function (e) {
    s += '<ellipse cx="' + (sx + e[0]) + '" cy="' + (sy + e[1] + 8) + '" rx="' + e[2] + '" ry="' + e[3] + '"/>';
  });
  s += "</g>";
  s += '<g filter="url(#soKante)" fill="#FFF8E6" opacity="0.85">' +
    '<ellipse cx="' + (sx + 10) + '" cy="' + (sy + 22) + '" rx="105" ry="13"/>' +
    '<ellipse cx="' + (sx + 135) + '" cy="' + (sy + 34) + '" rx="70" ry="10"/>' +
    '<ellipse cx="' + (sx - 120) + '" cy="' + (sy + 44) + '" rx="55" ry="9"/></g>';
  s += "</svg>";
  return s;
}

// Himmel, Nordsee, Strand und Dünen mit Strandhafer, angelehnt an einen Blick von der Düne aufs Meer.
// Die Szene besteht aus mehreren Ebenen, damit nur das neu gezeichnet wird, was sich bewegt:
//   basis    = stehender Hintergrund (Himmel, Lichtstrahlen, Meer, Strand, Dünen), SVG mit Weichzeichner
//   wolken   = Wolkenband, zieht als Ganzes von links nach rechts (CSS-Transform, kaum Rechenlast)
//   meer     = Glitzern, Brandung und Möwen (Canvas)
//   windsack = kleines SVG, flattert per CSS
//   halme    = Strandhafer im Wind (Canvas)
const UFER = "M0,700 C320,646 720,604 1110,584 C1310,574 1480,569 1600,567";

// Möwe als Silhouette: kurzer linker Flügel, langer, nach oben geschwungener rechter Flügel (Mitte = Körper)
const VOGEL_PFAD = "M-62,-4 C-44,-20 -20,-16 -2,6 C14,-14 40,-34 66,-38 C44,-26 24,-8 8,14 " +
  "C3,19 -4,19 -8,13 C-22,-2 -42,-12 -62,-4 Z";

// Vögel am Himmel, links und rechts neben dem Titel: x, y, Größe, Dauer des Auf und Ab in s, Verzögerung in s
const START_VOEGEL = [
  [190, 335, 0.5, 5.2, 0],
  [292, 292, 0.36, 4.4, -1.8],
  [1420, 272, 0.44, 5.8, -3.1]
];

// Windsack: eigenes kleines SVG (Mast bei x = 0, Mastspitze bei y = 0, Fuß bei y = 252).
// Steht rechts auf der Düne, siehe windsackPlatzieren().
const WINDSACK_BOX = { x: -8, y: -6, breite: 232, hoehe: 264, mast: 252 };

// Oberkante der rechten Düne (zwei Bézierkurven aus der Szene)
const DUENE_RECHTS = [
  [[540, 900], [760, 800], [990, 700], [1240, 662]],
  [[1240, 662], [1400, 640], [1520, 644], [1600, 654]]
];

function kuestenSzene() {
  const r = zufallsfolge(23);
  const zahl1 = function (x) { return x.toFixed(1); };
  const svgKopf = function (breite, verhaeltnis) {
    return '<svg viewBox="0 0 ' + breite + ' 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="' +
      verhaeltnis + '" focusable="false">';
  };

  // ===== Ebene 1: stehender Hintergrund =====
  let s = svgKopf(1600, "xMidYMid slice");
  s += "<defs>" +
    '<linearGradient id="szHimmel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F6EA8"/>' +
    '<stop offset="0.6" stop-color="#86B5D8"/><stop offset="1" stop-color="#D9E8EF"/></linearGradient>' +
    '<linearGradient id="szMeer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1F4A6E"/>' +
    '<stop offset="1" stop-color="#3B7CA3"/></linearGradient>' +
    '<linearGradient id="szSand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E8DABA"/>' +
    '<stop offset="1" stop-color="#D6C296"/></linearGradient>' +
    '<linearGradient id="szDuene" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B8A477"/>' +
    '<stop offset="1" stop-color="#7F6F4E"/></linearGradient>' +
    "</defs>";

  // Himmel
  s += '<rect width="1600" height="522" fill="url(#szHimmel)"/>';

  // Sonne oben links, halb hinter einer Wolke, mit Lichtstrahlen nach rechts unten.
  // Die Strahlen liegen unterhalb des Winkels zum Titel, damit er gut lesbar bleibt.
  const sx = SONNE.x;
  const sy = SONNE.y;
  s += '<radialGradient id="szStrahl" cx="' + sx + '" cy="' + sy + '" r="1250" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="#FFF8E4" stop-opacity="0.6"/><stop offset="0.4" stop-color="#FFF8E4" stop-opacity="0.18"/>' +
    '<stop offset="1" stop-color="#FFF8E4" stop-opacity="0"/></radialGradient>' +
    '<filter id="szStrahlWeich" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>';
  s += '<g filter="url(#szStrahlWeich)" fill="url(#szStrahl)">';
  [[36, 2.2], [41, 4.5], [47, 1.6], [52, 3.6], [58, 2.6], [64, 5], [70, 2], [76, 3.4], [82, 1.8]].forEach(function (st) {
    const w1 = (st[0] - st[1] / 2) * Math.PI / 180;
    const w2 = (st[0] + st[1] / 2) * Math.PI / 180;
    const laenge = 1100 + r() * 400;
    s += '<path d="M' + sx + "," + sy + " L" + zahl1(sx + Math.cos(w1) * laenge) + "," + zahl1(sy + Math.sin(w1) * laenge) +
      " L" + zahl1(sx + Math.cos(w2) * laenge) + "," + zahl1(sy + Math.sin(w2) * laenge) + ' Z"/>';
  });
  s += "</g>";

  // Meer, Strand, ferner Brandungssaum und Dünen
  s += '<rect y="520" width="1600" height="380" fill="url(#szMeer)"/>';
  s += '<path d="' + UFER + ' L1600,900 L0,900 Z" fill="url(#szSand)"/>';
  s += '<path d="M0,684 C320,632 720,592 1110,574 C1310,565 1480,561 1600,559" fill="none" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="3"/>';
  s += '<path d="M540,900 C760,800 990,700 1240,662 C1400,640 1520,644 1600,654 L1600,900 Z" fill="url(#szDuene)"/>';
  s += '<path d="M0,830 C120,800 250,808 370,846 C430,866 470,884 490,900 L0,900 Z" fill="url(#szDuene)"/>';
  s += "</svg>";
  const basis = s;

  // ===== Ebene 2: Wolkenband =====
  // Das Band ist doppelt so breit wie der Bildschirm und enthält dieselben Wolken zweimal.
  // Es wandert um eine Bildschirmbreite nach rechts und springt dann unsichtbar zurück.
  // Die Wolken liegen über und unter dem Titel, damit er lesbar bleibt.
  const rw = zufallsfolge(41);
  const wolken = [
    // x, y, Größe, Deckkraft
    [250, 62, 0.62, 0.55], [1020, 48, 0.5, 0.5],
    [620, 405, 0.8, 0.78], [1340, 382, 0.9, 0.8], [130, 452, 0.55, 0.7], [960, 462, 0.62, 0.68]
  ].map(function (w) {
    const teile = [];
    for (let i = 0; i < 5; i++) {
      teile.push([(rw() - 0.5) * 240 * w[2], (rw() - 0.5) * 34 * w[2], (80 + rw() * 90) * w[2], (22 + rw() * 18) * w[2]]);
    }
    return { x: w[0], y: w[1], deckkraft: w[3], teile: teile };
  });
  let sw = svgKopf(3200, "none");
  sw += '<defs><filter id="szWolkeWeich" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="20"/></filter></defs>';
  [0, 1600].forEach(function (versatz) {
    wolken.forEach(function (w) {
      sw += '<g filter="url(#szWolkeWeich)" fill="#FFFFFF" opacity="' + w.deckkraft + '">';
      w.teile.forEach(function (t) {
        sw += '<ellipse cx="' + zahl1(versatz + w.x + t[0]) + '" cy="' + zahl1(w.y + t[1]) +
          '" rx="' + zahl1(t[2]) + '" ry="' + zahl1(t[3]) + '"/>';
      });
      sw += "</g>";
    });
  });
  sw += "</svg>";

  // ===== Ebene 3: bewegte Teile (werden auf zwei Canvas gezeichnet, siehe szeneZeichnen) =====
  // Viele bewegte SVG-Teile auf voller Bildschirmgröße wären zu langsam, weil das ganze SVG
  // bei jeder Bewegung neu gerastert wird. Hier werden nur die Daten vorbereitet.

  // Lichtreflexe auf dem Meer: drei Gruppen, die abwechselnd aufleuchten und leicht treiben
  const glitzer = [[], [], []];
  for (let i = 0; i < 46; i++) {
    const y = 528 + Math.pow(r(), 1.5) * 130;
    const x = r() * 1600;
    const l = 20 + r() * 90;
    glitzer[i % 3].push({ x: x, y: y, l: l, deckkraft: 0.08 + r() * 0.14 });
  }

  // Strandhafer: viele Halme, hinten kleiner, vorne größer.
  // Gespeichert werden Fußpunkt, Kontroll- und Endpunkt relativ zum Fuß, Farbe, Breite und Windverhalten.
  const rh = zufallsfolge(57);
  const kammRechts = function (x) {
    return x >= 1240 ? 662 : 662 + 238 * Math.pow((1240 - x) / 700, 1.6);
  };
  const kammLinks = function (x) {
    return 800 + 100 * Math.pow(Math.abs(x - 190) / 300, 1.8);
  };
  const halme = [];
  for (let i = 0; i < 520; i++) {
    const links = i < 90;
    const x = links ? r() * 480 : 600 + r() * 1000;
    const kamm = links ? kammLinks(x) : kammRechts(x);
    if (kamm >= 895) continue;
    const y = kamm + 4 + Math.pow(r(), 1.4) * (900 - kamm);
    halme.push({ x: x, y: y });
  }
  halme.sort(function (a, b) { return a.y - b.y; });
  const farben = ["#A8A05E", "#8D8A4B", "#C3B67C", "#6E7442", "#B4A86A"];
  const halmDaten = halme.map(function (h) {
    const tiefe = (h.y - 640) / 260;                     // 0 = hinten, 1 = vorne
    const hoehe = (40 + r() * 80) * (0.6 + tiefe * 1.1);
    const neigung = (r() - 0.35) * hoehe * 0.55;
    return {
      x: h.x, y: h.y,
      qx: neigung * 0.25, qy: -hoehe * 0.6,              // Kontrollpunkt relativ zum Fuß
      ex: neigung, ey: -hoehe,                           // Spitze relativ zum Fuß
      farbe: farben[Math.floor(r() * farben.length)],
      breite: 1.4 + tiefe * 2.2,
      versatz: (h.x / 1600) * 1.6 + rh() * 0.7,          // s; die Böe erreicht rechte Halme später
      ausschlag: 2.5 + rh() * 3                          // Grad nach rechts
    };
  });

  const windsack = '<svg viewBox="' + WINDSACK_BOX.x + " " + WINDSACK_BOX.y + " " + WINDSACK_BOX.breite + " " +
    WINDSACK_BOX.hoehe + '" xmlns="http://www.w3.org/2000/svg" focusable="false">' +
    windsackSvg(0, WINDSACK_BOX.mast, 0) + "</svg>";

  return { basis: basis, wolken: sw, windsack: windsack, glitzer: glitzer, halme: halmDaten };
}

// ---------- Bewegte Szene: Meer (Glitzern, Brandung, Vögel) und Strandhafer ----------
// Zwei Canvas: "startMeer" liegt unter dem Windsack, "startHalme" davor.
// Gezeichnet wird mit etwa 30 Bildern pro Sekunde, nur solange der Startbildschirm sichtbar ist.
const HALM_BOE = 4.2;                                    // s, Strandhafer einmal hin und zurück
const WELLE_DAUER = 7;                                   // s, eine Welle läuft hoch und wieder ab
const WELLEN_VERSATZ = [0, 3.5];                         // s, zwei Wellen im Wechsel
const GLITZER_DAUER = 12.6;                              // s, Reflexe einmal hell und wieder schwach
const szeneAnim = {
  glitzer: [], halme: [], meer: null, gras: null,
  k: 1, dx: 0, dy: 0, dpr: 1, schleife: 0, zuletzt: 0,
  ufer: null, vogel: null
};

// Umrechnung Szene (1600 × 900, wie "xMidYMid slice") → Bildschirmpixel
function szenenMassstab() {
  const b = window.innerWidth;
  const h = window.innerHeight;
  const k = Math.max(b / 1600, h / 900);
  return { b: b, h: h, k: k, dx: (b - 1600 * k) / 2, dy: (h - 900 * k) / 2 };
}

function szeneVorbereiten(szene) {
  szeneAnim.glitzer = szene.glitzer;
  szeneAnim.halme = szene.halme;
  szeneAnim.ufer = new Path2D(UFER);
  szeneAnim.vogel = new Path2D(VOGEL_PFAD);
}

function szeneGroesseAnpassen() {
  const m = szenenMassstab();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  szeneAnim.k = m.k;
  szeneAnim.dx = m.dx;
  szeneAnim.dy = m.dy;
  szeneAnim.dpr = dpr;
  [["startMeer", "meer"], ["startHalme", "gras"]].forEach(function (paar) {
    const leinwand = el(paar[0]);
    leinwand.width = Math.round(m.b * dpr);
    leinwand.height = Math.round(m.h * dpr);
    szeneAnim[paar[1]] = leinwand.getContext("2d");
  });
  szeneZeichnen(performance.now());
}

// Leert ein Canvas und stellt es auf Szenenkoordinaten um
function leinwandVorbereiten(c) {
  const d = szeneAnim.dpr;
  const k = szeneAnim.k * d;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, c.canvas.width, c.canvas.height);
  c.setTransform(k, 0, 0, k, szeneAnim.dx * d, szeneAnim.dy * d);
  c.lineCap = "round";
}

// weicher Übergang 0 … 1
function weich(t) {
  return t * t * (3 - 2 * t);
}

// Lage und Deckkraft einer Welle im Verlauf p (0 … 1):
// läuft bis 42 % den Strand hinauf, dann langsamer zurück und löst sich dabei auf
function welleZustand(p) {
  const verschiebung = p < 0.42 ? -12 + 28 * weich(p / 0.42) : 16 - 28 * weich((p - 0.42) / 0.58);
  let deckkraft;
  if (p < 0.12) deckkraft = p / 0.12;
  else if (p < 0.42) deckkraft = 1;
  else if (p < 0.8) deckkraft = 1 - 0.5 * (p - 0.42) / 0.38;
  else deckkraft = 0.5 * (1 - (p - 0.8) / 0.2);
  // nasser Sand: wird dunkel, wenn die Welle oben ist, und trocknet langsam
  let nass = 0;
  if (p >= 0.3 && p < 0.45) nass = (p - 0.3) / 0.15;
  else if (p >= 0.45) nass = Math.pow(1 - (p - 0.45) / 0.55, 1.6);
  return { dy: verschiebung, deckkraft: deckkraft, nass: nass };
}

function uferStrich(c, dy, farbe, deckkraft, breite) {
  c.save();
  c.translate(0, dy);
  c.globalAlpha = deckkraft;
  c.strokeStyle = farbe;
  c.lineWidth = breite;
  c.stroke(szeneAnim.ufer);
  c.restore();
}

function meerZeichnen(t) {
  const c = szeneAnim.meer;
  if (!c) return;
  leinwandVorbereiten(c);

  // Lichtreflexe
  c.strokeStyle = "#FFFFFF";
  c.lineWidth = 2;
  szeneAnim.glitzer.forEach(function (gruppe, i) {
    const phase = 0.5 - 0.5 * Math.cos(2 * Math.PI * (t + i * 2.1) / GLITZER_DAUER);   // 0 … 1
    const hell = 1 - 0.7 * phase;
    const drift = 10 * phase;
    gruppe.forEach(function (g) {
      c.globalAlpha = g.deckkraft * hell;
      c.beginPath();
      c.moveTo(g.x + drift, g.y);
      c.lineTo(g.x + g.l + drift, g.y);
      c.stroke();
    });
  });

  // Brandung: nasser Sand, flaches Wasser, Schaumkante, Schaumspuren
  WELLEN_VERSATZ.forEach(function (versatz) {
    const p = (((t + versatz) % WELLE_DAUER) + WELLE_DAUER) % WELLE_DAUER / WELLE_DAUER;
    const w = welleZustand(p);
    if (w.nass > 0) uferStrich(c, 13, "#B59C6C", 0.55 * w.nass, 22);
    if (w.deckkraft <= 0) return;
    uferStrich(c, w.dy - 8, "#9CCDE6", 0.4 * w.deckkraft, 30);
    uferStrich(c, w.dy + 5, "#FFFFFF", 0.8 * w.deckkraft, 4.5);
    c.setLineDash([46, 20, 14, 28]);
    uferStrich(c, w.dy - 1, "#FFFFFF", 0.4 * w.deckkraft, 2);
    c.setLineDash([]);
  });

  // Möwen: gleiten auf und ab und kippen dabei leicht
  c.fillStyle = "#172A3A";
  c.globalAlpha = 0.85;
  START_VOEGEL.forEach(function (v) {
    const phase = 0.5 - 0.5 * Math.cos(2 * Math.PI * (t + v[4]) / v[3]);              // 0 … 1
    c.save();
    c.translate(v[0], v[1]);
    c.scale(v[2], v[2]);
    c.translate(0, -12 + 26 * phase);
    c.rotate((-3 + 6 * phase) * Math.PI / 180);
    c.fill(szeneAnim.vogel);
    c.restore();
  });
  c.globalAlpha = 1;
}

// Strandhafer: jeder Halm neigt sich um seinen Fußpunkt zwischen leicht links und deutlich rechts
function halmeZeichnen(t) {
  const c = szeneAnim.gras;
  if (!c) return;
  leinwandVorbereiten(c);
  c.globalAlpha = 0.9;
  const grad = Math.PI / 180;
  szeneAnim.halme.forEach(function (h) {
    const welle = 0.5 - 0.5 * Math.cos(2 * Math.PI * (t - h.versatz) / HALM_BOE);     // 0 … 1, weich
    const winkel = (-1.5 + (h.ausschlag + 1.5) * welle) * grad;
    const cos = Math.cos(winkel);
    const sin = Math.sin(winkel);
    c.beginPath();
    c.moveTo(h.x, h.y);
    c.quadraticCurveTo(h.x + h.qx * cos - h.qy * sin, h.y + h.qx * sin + h.qy * cos,
      h.x + h.ex * cos - h.ey * sin, h.y + h.ex * sin + h.ey * cos);
    c.strokeStyle = h.farbe;
    c.lineWidth = h.breite;
    c.stroke();
  });
}

function szeneZeichnen(zeit) {
  const t = zeit / 1000;
  meerZeichnen(t);
  halmeZeichnen(t);
}

function szeneSchleife(zeit) {
  szeneAnim.schleife = 0;
  if (!start.aktiv || el("startbildschirm").classList.contains("mit-fotos")) return;   // Fotos verdecken die Szene
  if (zeit - szeneAnim.zuletzt >= 32) {
    szeneAnim.zuletzt = zeit;
    szeneZeichnen(zeit);
  }
  szeneAnim.schleife = requestAnimationFrame(szeneSchleife);
}

function szeneStarten() {
  szeneZeichnen(performance.now());
  const ruhig = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!ruhig && !szeneAnim.schleife) szeneAnim.schleife = requestAnimationFrame(szeneSchleife);
}

function szeneAnhalten() {
  cancelAnimationFrame(szeneAnim.schleife);
  szeneAnim.schleife = 0;
}

function startGroesseAnpassen() {
  if (!start.aktiv) return;
  szeneGroesseAnpassen();
  windsackPlatzieren();
}

// Höhe der Dünenkante an der Stelle x (Koordinaten der Szene 1600 × 900)
function duenenKante(x) {
  const kurve = x < 1240 ? DUENE_RECHTS[0] : DUENE_RECHTS[1];
  const punkt = function (t, i) {
    const u = 1 - t;
    return u * u * u * kurve[0][i] + 3 * u * u * t * kurve[1][i] + 3 * u * t * t * kurve[2][i] + t * t * t * kurve[3][i];
  };
  let a = 0;
  let b = 1;
  for (let i = 0; i < 30; i++) {                         // x(t) steigt stetig: Intervall halbieren
    const m = (a + b) / 2;
    if (punkt(m, 0) < x) a = m; else b = m;
  }
  return punkt((a + b) / 2, 1);
}

// Stellt den Windsack rechts auf die Düne, mit dem Fuß auf der Dünenkante.
// Die Szene wird mit "slice" skaliert, das Menü aber in Pixeln gesetzt. Deshalb wird die Lage
// bei jeder Größenänderung neu berechnet.
function windsackPlatzieren() {
  if (!start.aktiv) return;
  const ebene = el("startWindsack");
  const m = szenenMassstab();
  const b = m.b;
  const k = m.k;
  const dx = m.dx;
  const dy = m.dy;
  // Mast rechts auf der Düne; bei schmalem Fenster so weit nach links, dass der Sack ganz zu sehen ist
  const sackRechts = (WINDSACK_BOX.breite + WINDSACK_BOX.x) * k;
  const mastX = Math.min(dx + 1380 * k, b - sackRechts - 12);
  const fussY = dy + (duenenKante((mastX - dx) / k) + 6) * k;
  ebene.style.left = (mastX + WINDSACK_BOX.x * k).toFixed(1) + "px";
  ebene.style.top = (fussY - (WINDSACK_BOX.mast - WINDSACK_BOX.y) * k).toFixed(1) + "px";
  ebene.style.width = (WINDSACK_BOX.breite * k).toFixed(1) + "px";
  ebene.style.height = (WINDSACK_BOX.hoehe * k).toFixed(1) + "px";
}

// Rot-weißer Windsack an einem Mast. Der Wind weht von links, der Sack zeigt nach rechts.
// Er besteht aus drei ineinander gesteckten Teilen, die leicht versetzt flattern.
function windsackSvg(mastX, boden, oben) {
  const zahl1 = function (x) { return x.toFixed(1); };
  const holz = "#4E3B3B";
  const oeffnungX = mastX + 34;                          // Mitte des Rings
  const oeffnungY = oben + 34;
  const laenge = 176;
  const h0 = 31;                                         // halbe Höhe an der Öffnung
  const mitte = function (t) { return oeffnungY + 12 * t * t; };            // Mittellinie hängt zur Spitze leicht durch
  const halb = function (t) { return h0 * (1 - 0.52 * t); };
  const xBei = function (t) { return oeffnungX + laenge * t; };
  const grenzen = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const farben = ["#E0504D", "#FBE3E1", "#E0504D", "#FBE3E1", "#E0504D"];

  const segment = function (i) {
    const t1 = grenzen[i];
    const t2 = grenzen[i + 1] + (i < 4 ? 0.006 : 0);      // minimal überlappen, damit keine Fugen entstehen
    const tm = (t1 + t2) / 2;
    const ausbeulung = 2.5;
    let p = '<path d="M' + zahl1(xBei(t1)) + "," + zahl1(mitte(t1) - halb(t1)) +
      " Q" + zahl1(xBei(tm)) + "," + zahl1(mitte(tm) - halb(tm) - ausbeulung) + " " + zahl1(xBei(t2)) + "," + zahl1(mitte(t2) - halb(t2)) +
      " L" + zahl1(xBei(t2)) + "," + zahl1(mitte(t2) + halb(t2)) +
      " Q" + zahl1(xBei(tm)) + "," + zahl1(mitte(tm) + halb(tm) + ausbeulung) + " " + zahl1(xBei(t1)) + "," + zahl1(mitte(t1) + halb(t1)) +
      ' Z" fill="' + farben[i] + '"/>';
    // Schatten an der Unterseite
    p += '<path d="M' + zahl1(xBei(t1)) + "," + zahl1(mitte(t1) + halb(t1) * 0.35) +
      " L" + zahl1(xBei(t2)) + "," + zahl1(mitte(t2) + halb(t2) * 0.35) +
      " L" + zahl1(xBei(t2)) + "," + zahl1(mitte(t2) + halb(t2)) +
      " Q" + zahl1(xBei(tm)) + "," + zahl1(mitte(tm) + halb(tm) + ausbeulung) + " " + zahl1(xBei(t1)) + "," + zahl1(mitte(t1) + halb(t1)) +
      ' Z" fill="#6B1E1C" fill-opacity="0.16"/>';
    // Glanzlicht auf den hinteren Segmenten
    if (i >= 2) {
      const a = t1 + (t2 - t1) * 0.25;
      const b = t1 + (t2 - t1) * 0.7;
      p += '<path d="M' + zahl1(xBei(a)) + "," + zahl1(mitte(a) + halb(a) * 0.12) + " L" + zahl1(xBei(b)) + "," +
        zahl1(mitte(b) + halb(b) * 0.02) + '" stroke="#FFFFFF" stroke-opacity="' + (i % 2 ? 0.9 : 0.4) +
        '" stroke-width="3" stroke-linecap="round"/>';
    }
    return p;
  };

  // Ein flatterndes Teil dreht sich um seinen Anfangspunkt
  const teilAuf = function (t, verzoegerung, von, bis) {
    return '<g class="windsack-teil" style="transform-origin:' + zahl1(xBei(t)) + "px " + zahl1(mitte(t)) + "px;animation-delay:" +
      verzoegerung + "s;--von:" + von + "deg;--bis:" + bis + 'deg">';
  };

  let s = '<g class="windsack">';
  // Mast
  s += '<line x1="' + mastX + '" y1="' + boden + '" x2="' + mastX + '" y2="' + (oben + 4) +
    '" stroke="' + holz + '" stroke-width="7" stroke-linecap="round"/>';
  // Drei Streben vom Mast zum Ring
  s += '<path d="M' + mastX + "," + oeffnungY + " L" + (oeffnungX + 2) + "," + (oeffnungY - h0 + 1) +
    " M" + mastX + "," + oeffnungY + " L" + (oeffnungX + 6) + "," + oeffnungY +
    " M" + mastX + "," + oeffnungY + " L" + (oeffnungX + 2) + "," + (oeffnungY + h0 - 1) +
    '" fill="none" stroke="' + holz + '" stroke-width="3.5" stroke-linecap="round"/>';
  // Sack: Öffnung mit zwei Segmenten, darin die Mitte, darin die Spitze
  s += teilAuf(0, 0, -3, 2.5);
  s += segment(0) + segment(1);
  s += teilAuf(0.4, -0.25, -3.5, 4);
  s += segment(2);
  s += teilAuf(0.6, -0.5, -5, 6);
  s += segment(3) + segment(4);
  s += "</g></g>";
  // Ring an der Öffnung
  s += '<ellipse cx="' + oeffnungX + '" cy="' + oeffnungY + '" rx="6.5" ry="' + h0 + '" fill="#A93A37"/>';
  s += "</g></g>";
  return s;
}

// ---------- Namenseingabe ----------

function namePopupOeffnen() {
  el("nameEingabe").value = "";
  el("nameFehler").textContent = "";
  popupOeffnen("popupName");
}

function nameBestaetigen() {
  const name = el("nameEingabe").value.trim();
  if (name === "") {
    el("nameFehler").textContent = "Bitte gib einen Namen ein.";
    return;
  }
  popupSchliessen("popupName");
  ladebildschirmStarten(function () { neuesSpielStarten(name); });
}

// ==========================================================
// 11. LEADERBOARD
// ==========================================================
// Online-Tabelle (Supabase). Beide Werte leer lassen = nur lokale Tabelle in diesem Browser.
// Tabelle in Supabase anlegen (SQL-Editor):
//   create table leaderboard (
//     id bigint generated always as identity primary key,
//     erstellt timestamptz default now(),
//     name text, score numeric, nachhaltigkeit numeric, wissen numeric,
//     ziel_erreicht boolean, runden int,
//     meeresgesundheit int, artenvielfalt int, wirtschaft int, tourismus int, akzeptanz int,
//     strandmuell int, eintrag_strand numeric, eintrag_meer numeric, eintrag_land numeric, budget int
//   );
//   alter table leaderboard enable row level security;
//   create policy "lesen"    on leaderboard for select using (true);
//   create policy "eintragen" on leaderboard for insert with check (true);
// Eine bestehende Tabelle erweitern:
//   alter table leaderboard add column nachhaltigkeit numeric, add column wissen numeric;
const SUPABASE_URL = "";   // z. B. "https://abcdefgh.supabase.co"
const SUPABASE_KEY = "";   // Schlüssel "anon public" aus den Supabase-Projekteinstellungen
const SUPABASE_TABELLE = "leaderboard";
const LOKAL_SCHLUESSEL = "oceanBalanceLeaderboardV4";   // V4: neue Bewertung, alte Einträge sind nicht vergleichbar

function onlineAktiv() {
  return SUPABASE_URL !== "" && SUPABASE_KEY !== "";
}

function supabaseAnfrage(pfad, optionen) {
  optionen = optionen || {};
  optionen.headers = Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json"
  }, optionen.headers || {});
  return fetch(SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + pfad, optionen).then(function (antwort) {
    if (!antwort.ok) throw new Error("HTTP " + antwort.status);
    return antwort;
  });
}

// Endwerte des Spiels (Namen der Felder = Spaltennamen der Tabelle)
function spielstandEintrag() {
  const z = zustand;
  const ende = z.verlauf[z.verlauf.length - 1];
  return {
    name: spielerName,
    score: endScore(z),
    nachhaltigkeit: gesamtScore(z),
    wissen: wissensScore(z),
    ziel_erreicht: zielAuswertung(z).erreicht,
    runden: ende.runde,
    meeresgesundheit: ende.meeresgesundheit,
    artenvielfalt: ende.artenvielfalt,
    wirtschaft: ende.wirtschaft,
    tourismus: ende.tourismus,
    akzeptanz: ende.akzeptanz,
    strandmuell: ende.strandmuell,
    eintrag_strand: z.eintrag.strand,
    eintrag_meer: z.eintrag.meer,
    eintrag_land: z.eintrag.land,
    budget: ende.budget
  };
}

function lokaleEintraege() {
  try {
    return JSON.parse(localStorage.getItem(LOKAL_SCHLUESSEL)) || [];
  } catch (fehler) {
    return [];
  }
}

function lokalSpeichern(eintrag) {
  try {
    const liste = lokaleEintraege();
    liste.push(eintrag);
    localStorage.setItem(LOKAL_SCHLUESSEL, JSON.stringify(liste));
  } catch (fehler) {
    // Speichern nicht möglich (z. B. privater Modus): Spiel läuft trotzdem weiter
  }
}

function spielstandSpeichern() {
  const eintrag = spielstandEintrag();
  if (!onlineAktiv()) {
    lokalSpeichern(eintrag);
    return Promise.resolve();
  }
  return supabaseAnfrage(SUPABASE_TABELLE, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(eintrag)
  }).catch(function () {
    lokalSpeichern(eintrag);
  });
}

function eintraegeLaden() {
  if (!onlineAktiv()) {
    return Promise.resolve({
      eintraege: lokaleEintraege(),
      hinweis: "Es werden nur Spielstände aus diesem Browser angezeigt."
    });
  }
  return supabaseAnfrage(SUPABASE_TABELLE + "?select=*&order=ziel_erreicht.desc,score.desc&limit=100")
    .then(function (antwort) { return antwort.json(); })
    .then(function (liste) { return { eintraege: liste, hinweis: "" }; })
    .catch(function () {
      return {
        eintraege: lokaleEintraege(),
        hinweis: "Die Online-Tabelle ist nicht erreichbar. Angezeigt werden die Spielstände aus diesem Browser."
      };
    });
}

function elementBauen(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text !== undefined) {
    e.textContent = text;   // textContent: Namen können keinen Code einschleusen
  }
  return e;
}

function optionalZahl(wert) {
  return wert === null || wert === undefined ? "–" : zahl(wert, 1);
}

const LEADERBOARD_SPALTEN = [
  { titel: "Name",             klasse: "spalte-name", wert: function (e) { return e.name; } },
  { titel: "Endergebnis",      klasse: "spalte-score", wert: function (e) { return optionalZahl(e.score); } },
  { titel: "Nachhaltigkeit",   wert: function (e) { return optionalZahl(e.nachhaltigkeit); } },
  { titel: "Wissen",           wert: function (e) { return optionalZahl(e.wissen); } },
  { titel: "Guter Zustand",    wert: function (e) { return e.ziel_erreicht ? "erreicht" : "nein"; } },
  { titel: "Meeresgesundheit", wert: function (e) { return e.meeresgesundheit + " %"; } },
  { titel: "Artenvielfalt",    wert: function (e) { return e.artenvielfalt + " %"; } },
  { titel: "Wirtschaft",       wert: function (e) { return e.wirtschaft + " %"; } },
  { titel: "Tourismus",        wert: function (e) { return e.tourismus + " %"; } },
  { titel: "Akzeptanz",        wert: function (e) { return e.akzeptanz + " %"; } },
  { titel: "Strandmüll",       wert: function (e) { return e.strandmuell; } },
  { titel: "Eintrag Strand",   wert: function (e) { return zahl(e.eintrag_strand, 1); } },
  { titel: "Eintrag Meer",     wert: function (e) { return zahl(e.eintrag_meer, 1); } },
  { titel: "Eintrag Land",     wert: function (e) { return zahl(e.eintrag_land, 1); } }
];

// Sortierung: erst „guter Zustand erreicht“, dann Endergebnis
function leaderboardTabelleBauen(eintraege) {
  const sortiert = eintraege.slice().sort(function (a, b) {
    if (Boolean(a.ziel_erreicht) !== Boolean(b.ziel_erreicht)) return a.ziel_erreicht ? -1 : 1;
    return Number(b.score) - Number(a.score);
  });

  const tabelle = elementBauen("table", "leaderboard-tabelle");
  const kopf = document.createElement("tr");
  kopf.appendChild(elementBauen("th", "", "Platz"));
  LEADERBOARD_SPALTEN.forEach(function (s) { kopf.appendChild(elementBauen("th", s.klasse || "", s.titel)); });
  const thead = document.createElement("thead");
  thead.appendChild(kopf);
  tabelle.appendChild(thead);

  const tbody = document.createElement("tbody");
  sortiert.forEach(function (eintrag, index) {
    const zeile = document.createElement("tr");
    if (eintrag.ziel_erreicht) zeile.className = "zeile-erreicht";
    zeile.appendChild(elementBauen("td", "", String(index + 1)));
    LEADERBOARD_SPALTEN.forEach(function (s) {
      zeile.appendChild(elementBauen("td", s.klasse || "", String(s.wert(eintrag))));
    });
    tbody.appendChild(zeile);
  });
  tabelle.appendChild(tbody);
  return tabelle;
}

function leaderboardOeffnen() {
  const status = el("leaderboardStatus");
  const rahmen = el("leaderboardTabelle");
  status.textContent = "Spielstände werden geladen.";
  rahmen.textContent = "";
  popupOeffnen("popupLeaderboard");

  eintraegeLaden().then(function (ergebnis) {
    let text = ergebnis.hinweis;
    if (ergebnis.eintraege.length === 0) {
      text = (text ? text + " " : "") + "Noch keine Spielstände. Spiele eine Partie bis Runde " + RUNDEN + ", um hier zu erscheinen.";
    } else {
      rahmen.appendChild(leaderboardTabelleBauen(ergebnis.eintraege));
    }
    status.textContent = text;
  });
}

// ==========================================================
// 12. START
// ==========================================================
function oberflaecheVerbinden() {
  // Knopf → Aktion
  const aktionen = {
    startNeuesSpiel: namePopupOeffnen,
    startLeaderboard: leaderboardOeffnen,
    nameOk: nameBestaetigen,
    einfuehrungWeiter: einfuehrungWeiter,
    einfuehrungZurueck: function () { einfuehrungZeigen(einfuehrungSchritt - 1); },
    naechsteRunde: rundeBeenden,
    berichtWeiter: berichtWeiter,
    infoOk: function () { popupFertig("popupInfo"); },
    quizWeiter: quizWeiter,
    infoKnopf: budgetZeigen,
    muellInfoKnopf: muellPopupZeigen,
    anliegenOk: anliegenSchliessen,
    otterOk: otterSchliessen,
    beendenKnopf: function () { popupOeffnen("popupBeenden"); },   // unvollständige Spiele kommen nicht ins Leaderboard
    beendenOk: zumStartbildschirm,
    auswertungLeaderboard: leaderboardOeffnen,
    auswertungNeu: function () { zumStartbildschirm(); namePopupOeffnen(); },
    auswertungStart: zumStartbildschirm,
    startUeber: spielinfoZeigen,
    startQuellen: quellenZeigen,
    startVollbild: vollbildUmschalten
  };
  // Knopf → Pop-up, das er nur schließt
  const schliessen = {
    nameAbbrechen: "popupName", ereignisOk: "popupEreignis", muellSchliessen: "popupMuell",
    budgetSchliessen: "popupBudget",
    beendenAbbrechen: "popupBeenden", leaderboardSchliessen: "popupLeaderboard",
    ueberSchliessen: "popupUeber", quellenSchliessen: "popupQuellen"
  };
  Object.keys(schliessen).forEach(function (id) {
    aktionen[id] = function () { popupSchliessen(schliessen[id]); };
  });
  Object.keys(aktionen).forEach(function (id) { el(id).addEventListener("click", aktionen[id]); });

  // Enter bestätigt den Namen. preventDefault verhindert, dass derselbe Tastendruck danach
  // auch den Knopf „Weiter“ der Einführung auslöst (sonst startet sie auf Seite 2).
  el("nameEingabe").addEventListener("keydown", function (ereignis) {
    if (ereignis.key !== "Enter") return;
    ereignis.preventDefault();
    if (!ereignis.repeat) nameBestaetigen();
  });

  // Ladebildschirm: Die Listener fürs Überspringen meldet ladebildschirmStarten() selbst an
  // und ladeAufraeumen() nach Ablauf der 8 s wieder ab (siehe ladeListenerAnmelden).
}

// Prüft, ob index.html und style.css zur Version dieses Skripts passen.
// Passt etwas nicht (z. B. alte Datei oder Browser-Cache), erscheint ein Hinweis statt einer kaputten Seite.
const BENOETIGTE_ELEMENTE = ["auswahlUebersicht", "popupInfo", "infoOk", "popupQuiz",
  "quizWeiter", "massnahmenListe", "personen", "muellInfoKnopf",
  "popupMuell", "muellInhalt", "muellSchliessen", "entscheidungen", "startSzene", "startBilder", "ladebildschirm",
  "ladeKarte", "ladeFuellung", "ladeBalken", "ladeMarken", "ladeWeiter", "startVollbild", "popupQuellen", "popupUeber", "bildNachweis", "ueberBewertung", "startSonne", "startWolken", "startMeer", "startWindsack", "startHalme",
  "popupOtter", "otterOk", "otterInhalt"];

function versionPruefen() {
  const fehlend = BENOETIGTE_ELEMENTE.filter(function (id) { return !document.getElementById(id); });
  const cssNeu = getComputedStyle(document.documentElement).getPropertyValue("--layout-version").trim() === "11";
  if (!fehlend.length && cssNeu) return true;
  const hinweis = document.createElement("div");
  hinweis.setAttribute("role", "alert");
  hinweis.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;" +
    "padding:24px;background:#F3F7F9;font:16px/1.5 system-ui,sans-serif;color:#12304A";
  hinweis.innerHTML = '<div style="max-width:560px;padding:24px;background:#fff;border-left:6px solid #C8382E;border-radius:8px">' +
    '<h2 style="margin:0 0 8px">Dateien passen nicht zusammen</h2>' +
    "<p>script.js ist die neue Version, aber " +
    (fehlend.length ? "<strong>index.html</strong>" : "") + (fehlend.length && !cssNeu ? " und " : "") +
    (!cssNeu ? "<strong>style.css</strong>" : "") + " noch nicht. Ersetze alle drei Dateien " +
    "(index.html, style.css, script.js) und lade die Seite neu, notfalls mit Strg + F5.</p></div>";
  document.body.appendChild(hinweis);
  return false;
}

if (typeof document !== "undefined" && versionPruefen()) {
  zustand = neuerZustand();
  kennzahlenErstellen();
  oberflaecheVerbinden();
  alleAnzeigen();
  startbildschirmVorbereiten();
  startbildschirmZeigen();
}

// Für automatische Balancing-Tests mit Node.js (im Browser ohne Bedeutung)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    neuerZustand: neuerZustand, rundeAbschliessen: rundeAbschliessen, massnahmeStatus: massnahmeStatus,
    zielAuswertung: zielAuswertung, gesamtScore: gesamtScore, wissensScore: wissensScore, endScore: endScore,
    MASSNAHMEN: MASSNAHMEN, RUNDEN: RUNDEN, SAEULEN: SAEULEN, ZURUECKSTELLEN: ZURUECKSTELLEN,
    angebot: angebot, kostenBerechnen: kostenBerechnen, quizFuerRunde: quizFuerRunde,
    abschlussFragen: abschlussFragen, quizAntwortWerten: quizAntwortWerten, FRAGEN: FRAGEN, INFOPUNKTE: INFOPUNKTE,
    istUmgesetzt: istUmgesetzt, einnahmenBerechnen: einnahmenBerechnen,
    MEERESFAKTEN: MEERESFAKTEN, FAKT_KATEGORIEN: FAKT_KATEGORIEN, LADEBILDSCHIRM: LADEBILDSCHIRM,
    ladeGesamtFortschritt: ladeGesamtFortschritt, ladePhase: ladePhase,
    naechsterFakt: naechsterFakt, faktenZiehen: faktenZiehen
  };

}