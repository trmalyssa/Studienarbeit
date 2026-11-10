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

// Zwischenbilanz nach diesen Runden (3, 6, 9)
const ZWISCHENBILANZ_ALLE = 3;
const ZB_TOLERANZ = 3;            // so viele Punkte unter dem Soll gelten noch als „auf Kurs“

// Wissen: Anteil am Endergebnis
const WISSEN_ANTEIL = 0.2;        // Endergebnis = 80 % Nachhaltigkeit + 20 % Wissen

// Anhörung: Wer ein Anliegen schneller wegklickt, als man es lesen kann,
// verliert am Rundenende Akzeptanz.
const LESETEMPO = 5;              // Wörter pro Sekunde (zügiges Lesen)
const MINDEST_LESEZEIT = 3;       // Sekunden, mindestens
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
  strand: { name: "Merle", rolle: "betreibt den Strandkiosk", x: 41.3, y: 36.5, farbe: "#E2A92B" },
  meer:   { name: "Jannik", rolle: "Kutterfischer im Hafen", x: 92.6, y: 56.5, farbe: "#1D4F8C" },
  land:   { name: "Ole", rolle: "Schichtleiter im Gewerbegebiet", x: 74.5, y: 28.5, farbe: "#5E7D4E" }
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
// Ohne Eingriff wechselt der Fakt alle faktDauer ms (bei 12 s / 4 s also 3 Fakten).
// Überspringen (Enter, Leertaste, Maustaste) zeigt sofort den nächsten Fakt und startet nur die
// Faktuhr neu, die Gesamtuhr läuft unverändert weiter.
const LADEBILDSCHIRM = {
  gesamtDauer: 9000,      // ms, feste Gesamtlaufzeit des Ladebildschirms
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
// Pro Ladung werden ohne Eingriff 3 Fakten gezeigt; der Rest ist Puffer fürs Überspringen.
// Erst wenn alle Fakten einmal dran waren, wird neu gemischt (siehe naechsterFakt).
const MEERESFAKTEN = [
  {
    id: "schweinswal-ostsee", kategorie: "bedroht", titel: "Der letzte Wal vor der Haustür",
    text: "Der Schweinswal ist der einzige Wal, der in deutschen Meeren heimisch ist. In der zentralen " +
      "Ostsee leben nur noch rund 500 Tiere, die Population gilt als akut vom Aussterben bedroht. " +
      "Viele verenden als Beifang in Stellnetzen.",
    quelle: { name: "Deutsche Umwelthilfe, 2021",
      url: "https://www.duh.de/presse/pressemitteilungen/pressemitteilung/ostsee-schweinswal-vom-aussterben-bedroht-umweltschuetzer-starten-petition-gegen-stellnetze-in-meere/" }
  },
  {
    id: "schweinswal-nordsee", kategorie: "nordsee", titel: "Schweinswale zählen aus der Luft",
    text: "Bei Zählflügen im Sommer 2019 schätzten Fachleute knapp 28.000 Schweinswale in der deutschen " +
      "Nordsee. Im Schutzgebiet Sylter Außenriff stellte das Monitoring in den Jahren davor einen starken " +
      "Rückgang fest.",
    quelle: { name: "Bundesamt für Naturschutz, Monitoringbericht 2019",
      url: "https://www.bfn.de/sites/default/files/2022-05/2019-monitoringbericht-schweinswale.pdf" }
  },
  {
    id: "seehund", kategorie: "wattenmeer", titel: "Weniger Seehunde im Watt",
    text: "Im August 2023 zählten Fachleute im Wattenmeer von Dänemark, Deutschland und den Niederlanden " +
      "22.621 Seehunde: der niedrigste Stand seit 2010 und der dritte Rückgang in Folge. Die Ursache ist " +
      "noch unklar. Diskutiert werden Nahrungsmangel, Störungen, Beifang und die Konkurrenz durch Kegelrobben.",
    quelle: { name: "ORF nach Gemeinsamem Wattenmeersekretariat, 2023", url: "https://orf.at/stories/3338410/" }
  },
  {
    id: "auster", kategorie: "rueckkehr", titel: "Die verschwundene Auster",
    text: "Die Europäische Auster galt in der deutschen Nordsee im 20. Jahrhundert als fast ausgestorben, " +
      "vor allem durch Überfischung. Inzwischen wird sie wieder angesiedelt, etwa auf einem Pilotriff im " +
      "Borkum Riffgrund. Eine einzige Auster kann am Tag bis zu 240 Liter Meerwasser filtern.",
    quelle: { name: "Bundesamt für Naturschutz, Faltblatt 2022",
      url: "https://www.bfn.de/sites/default/files/2022-08/2022-faltblatt-die-wiederansiedlung-der-europaeischen-auster-bfn.pdf" }
  },
  {
    id: "rochen", kategorie: "bedroht", titel: "Haie und Rochen in Not",
    text: "In deutschen Meeren leben zehn Arten von Haien und Rochen dauerhaft. Bis auf den Kleingefleckten " +
      "Katzenhai gelten alle als bedroht. Der Glattrochen ist hier bereits verschollen, Nagelrochen und " +
      "Dornhai sind vom Aussterben bedroht. Hauptursache ist der Beifang in Schleppnetzen.",
    quelle: { name: "Umwelt im Unterricht (Bundesumweltministerium)",
      url: "https://www.umwelt-im-unterricht.de/hintergrund/gefaehrdete-arten-rochen-und-haie-in-deutschen-meeren/" }
  },
  {
    id: "eissturmvogel", kategorie: "nordsee", titel: "Plastik im Vogelmagen",
    text: "89 % der Eissturmvögel, die zwischen 2019 und 2023 tot an der deutschen Nordseeküste gefunden " +
      "wurden, hatten Plastik im Magen. Bei rund 48 % waren es mehr als 0,1 Gramm. Das Ziel der " +
      "Nordsee-Anrainerstaaten liegt bei höchstens 10 %.",
    quelle: { name: "Umweltbundesamt, Indikator Kunststoffmüll in der Nordsee",
      url: "https://www.umweltbundesamt.de/daten/umweltindikatoren/indikator-kunststoffmuell-in-der-nordsee" }
  },
  {
    id: "zugvoegel", kategorie: "wattenmeer", titel: "Drehkreuz für Zugvögel",
    text: "Das Wattenmeer ist seit 2009 UNESCO-Weltnaturerbe. Jedes Jahr rasten hier 10 bis 12 Millionen " +
      "Zugvögel, und rund 10.000 Tier- und Pflanzenarten leben in diesem Lebensraum.",
    quelle: { name: "Landesportal Schleswig-Holstein",
      url: "https://www.schleswig-holstein.de/DE/landesportal/land-und-leute/landschaft-natur/wattenmeer" }
  },
  {
    id: "stoer", kategorie: "bedroht", titel: "Der größte Fisch, den es hier nicht mehr gibt",
    text: "Der Europäische Stör wurde bis zu 5,4 m lang und 800 kg schwer. In Deutschland gilt er seit den " +
      "1970er-Jahren als ausgestorben. Seit 2008 setzen Forschende Jungstöre in Elbe und Havel aus, " +
      "bis 2015 rund 19.000 Tiere.",
    quelle: { name: "Leibniz-Institut für Gewässerökologie (IGB), 2015", url: "https://idw-online.de/de/news630239" }
  },
  {
    id: "ocean-census", kategorie: "entdeckt", titel: "866 neue Meeresarten",
    text: "Das Forschungsprogramm Ocean Census meldete im April 2025 866 neu entdeckte Meeresarten, darunter " +
      "einen Hai. Bis eine neue Art offiziell beschrieben ist, können über 13 Jahre vergehen. Fachleute " +
      "schätzen, dass erst rund 10 % des Lebens im Meer bekannt sind.",
    quelle: { name: "University of Essex, 2025",
      url: "https://www.essex.ac.uk/news/2025/04/14/ocean-census-and-university-of-essex-discover-866-new-species" }
  },
  {
    id: "korallen", kategorie: "weltmeer", titel: "Die größte Korallenbleiche",
    text: "Seit 2023 läuft die vierte weltweite Korallenbleiche. Bis zum Frühjahr 2025 waren 84 % der " +
      "Korallenriffe der Welt in 82 Ländern und Gebieten von Hitzestress betroffen. Ursache ist ungewöhnlich " +
      "warmes Meerwasser.",
    quelle: { name: "NOAA und International Coral Reef Initiative, 2025",
      url: "https://maritime-executive.com/article/unprecedented-bleaching-event-affects-84-percent-of-world-s-corals" }
  },
  {
    id: "hochsee", kategorie: "weltmeer", titel: "Schutz für die Hohe See",
    text: "Seit dem 17. Januar 2026 gilt das UN-Hochseeabkommen. Damit lassen sich erstmals auch Schutzgebiete " +
      "in Meeren ausweisen, die keinem Staat gehören. Es ist ein wichtiger Schritt zum Ziel, 30 % der " +
      "Meere unter Schutz zu stellen.",
    quelle: { name: "SeafoodSource, 2025",
      url: "https://www.seafoodsource.com/news/environment-sustainability/high-seas-treaty-crosses-ratification-threshold-enters-force-in-january-2026" }
  },
  {
    id: "thunfisch", kategorie: "rueckkehr", titel: "Der Thunfisch ist zurück",
    text: "Große Blauflossenthunfische waren in den nordischen Meeren über ein halbes Jahrhundert lang sehr " +
      "selten. Inzwischen tauchen sie im Spätsommer und Herbst wieder auf. Forschende haben 18 Tiere mit " +
      "Satellitensendern markiert, um ihre Wanderungen zu verfolgen.",
    quelle: { name: "Aarestrup et al., Scientific Reports 2022", url: "https://doi.org/10.1038/s41598-022-15819-x" }
  },
  // ----- Erweiterung: Meeresmüll, Klima, Wattenmeer -----
  {
    id: "plastik-eintrag", kategorie: "muell", titel: "Millionen Tonnen Plastik pro Jahr",
    text: "Aus 192 Küstenländern gelangten im Jahr 2010 schätzungsweise 4,8 bis 12,7 Millionen Tonnen " +
      "Plastikmüll ins Meer. Grundlage der Schätzung sind Daten zu Abfallmengen, Bevölkerungsdichte und " +
      "Abfallentsorgung der einzelnen Länder.",
    quelle: { name: "Jambeck et al., Science 2015", url: "https://doi.org/10.1126/science.1260352" }
  },
  {
    id: "geisternetze", kategorie: "muell", titel: "Geisternetze im Müllstrudel",
    text: "Im Großen Pazifischen Müllteppich treiben auf 1,6 Millionen Quadratkilometern mindestens 79.000 " +
      "Tonnen Plastik. Mindestens 46 % dieser Masse sind verlorene oder zurückgelassene Fischernetze, " +
      "sogenannte Geisternetze.",
    quelle: { name: "Lebreton et al., Scientific Reports 2018", url: "https://doi.org/10.1038/s41598-018-22939-w" }
  },
  {
    id: "tiefsee-tuete", kategorie: "muell", titel: "Plastik am tiefsten Punkt",
    text: "Im Marianengraben filmte ein Tauchroboter eine Plastiktüte in 10.898 Metern Tiefe. Eine " +
      "Auswertung von 30 Jahren Tiefseeaufnahmen zeigte außerdem: 89 % der gefundenen Plastikteile " +
      "waren Einwegprodukte.",
    quelle: { name: "Chiba et al., Marine Policy 2018", url: "https://doi.org/10.1016/j.marpol.2018.03.022" }
  },
  {
    id: "spuelsaum", kategorie: "muell", titel: "Müll im Spülsaum",
    text: "Auf 100 Metern Nordseestrand finden sich im Mittel knapp 400 Müllteile, an der Ostsee sind es " +
      "rund 70. Mindestens 70 % davon sind Kunststoffe.",
    quelle: { name: "Umweltbundesamt, Runder Tisch Meeresmüll",
      url: "https://www.umweltbundesamt.de/presse/pressemitteilungen/runder-tisch-gegen-meeresmuell-geht-in-die-zweite" }
  },
  {
    id: "reifenabrieb", kategorie: "muell", titel: "Mikroplastik von der Straße",
    text: "Reifenabrieb ist die größte Quelle für Mikroplastik in Deutschland. Fachleute schätzen die Menge " +
      "auf 60.000 bis 100.000 Tonnen im Jahr, rechnerisch rund 1 Kilogramm pro Kopf. Über Luft und " +
      "Regenwasser gelangt er in Flüsse und schließlich ins Meer.",
    quelle: { name: "Fraunhofer UMSICHT, 2024", url: "https://idw-online.de/de/news826927" }
  },
  {
    id: "sauerstoff", kategorie: "weltmeer", titel: "Jeder zweite Atemzug",
    text: "Etwa die Hälfte des Sauerstoffs, der auf der Erde entsteht, stammt aus dem Meer. Den größten " +
      "Teil produziert Plankton, also winzige Algen, Pflanzen und Bakterien, die im Wasser treiben und " +
      "Photosynthese betreiben.",
    quelle: { name: "NOAA Ocean Service", url: "https://oceanservice.noaa.gov/facts/ocean-oxygen.html" }
  },
  {
    id: "versauerung", kategorie: "klima", titel: "Das Meer wird saurer",
    text: "Das Meer nimmt rund 30 % des Kohlendioxids auf, das in die Atmosphäre gelangt. Dadurch ist der " +
      "pH-Wert an der Meeresoberfläche seit Beginn der Industrialisierung um etwa 0,1 gesunken. Das " +
      "entspricht rund 30 % mehr Säure und erschwert Muscheln und Korallen den Bau ihrer Kalkschalen.",
    quelle: { name: "NOAA, Ocean Acidification",
      url: "https://www.noaa.gov/education/resource-collections/ocean-coasts/ocean-acidification" }
  },
  {
    id: "ozeanwaerme", kategorie: "klima", titel: "Der größte Wärmespeicher",
    text: "Rund 90 % der zusätzlichen Wärme, die durch den menschengemachten Treibhauseffekt entsteht, hat " +
      "das Meer aufgenommen. Das meiste davon steckt in den oberen 700 Metern.",
    quelle: { name: "NASA, Vital Signs: Ocean Warming", url: "https://climate.nasa.gov/vital-signs/ocean-warming/" }
  },
  {
    id: "seegras", kategorie: "klima", titel: "Klimaschützer am Meeresgrund",
    text: "Seegraswiesen bedecken nur etwa 0,2 % des Meeresbodens, speichern aber rund 10 % des im Meer " +
      "gebundenen Kohlenstoffs. Pro Fläche können sie Kohlenstoff bis zu 35-mal schneller binden als " +
      "tropischer Regenwald. Auch im Wattenmeer wachsen Seegraswiesen.",
    quelle: { name: "UN-Umweltprogramm (UNEP)",
      url: "https://www.unep.org/news-and-stories/story/seagrass-secret-weapon-fight-against-global-heating" }
  },
  {
    id: "watt-weltrekord", kategorie: "wattenmeer", titel: "Das größte Watt der Welt",
    text: "Das Wattenmeer von Dänemark, Deutschland und den Niederlanden ist das größte zusammenhängende " +
      "System aus Sand- und Schlickwatt der Erde. Es gehört zu den letzten großen Gezeitenlandschaften, " +
      "in denen natürliche Prozesse weitgehend ungestört ablaufen.",
    quelle: { name: "UNESCO-Welterbezentrum", url: "https://whc.unesco.org/en/list/1314" }
  },
  {
    id: "kegelrobbe", kategorie: "rueckkehr", titel: "Rekord bei den Kegelrobben",
    text: "Die Kegelrobbe ist das größte Raubtier Deutschlands. Im Frühjahr 2024 zählten Fachleute im " +
      "Wattenmeer und auf Helgoland 11.515 Tiere, 9 % mehr als im Vorjahr. Im Winter davor kamen 2.547 " +
      "Jungtiere zur Welt.",
    quelle: { name: "Gemeinsames Wattenmeersekretariat, 2024", url: "https://waddensea-worldheritage.org/node/2239" }
  },
  {
    id: "schutzgebiete", kategorie: "nordsee", titel: "Fast die Hälfte geschützt",
    text: "Rund 45 % der deutschen Meeresgebiete in Nord- und Ostsee sind als Schutzgebiete ausgewiesen, " +
      "in der Nordsee etwa 43 %, in der Ostsee etwa 51 % (Stand April 2024). Die küstenfernen Gebiete " +
      "gehören zum europäischen Schutzgebietsnetz Natura 2000.",
    quelle: { name: "Bundesamt für Naturschutz, Hintergrundpapier 2026",
      url: "https://www.bfn.de/sites/default/files/2026-01/2026%2001%2016%20Hintergrund%20Meere_Schutzgebiete_aktualisiert_pac.pdf" }
  },
  {
    id: "kabeljau", kategorie: "nordsee", titel: "Der Kabeljau zieht nach Norden",
    text: "Mit dem wärmeren Wasser verändert sich die Nordsee: Kälteliebende Fische wie der Kabeljau weichen " +
      "nach Norden aus, wärmeliebende Arten aus dem Süden wandern ein. Am Südrand seines Verbreitungsgebiets " +
      "ist der Kabeljau inzwischen fast verschwunden.",
    quelle: { name: "Umweltbundesamt, Monitoringbericht Klimaanpassung",
      url: "https://www.umweltbundesamt.de/monitoring-zur-das/handlungsfelder/fischerei/fi-i-1/indikator" }
  },
  {
    id: "tiefsee-gesehen", kategorie: "entdeckt", titel: "Kaum ein Blick in die Tiefe",
    text: "Weniger als 0,001 % des Tiefseebodens haben Menschen bisher mit eigenen Augen oder Kameras " +
      "gesehen. Das entspricht etwa der Fläche des kleinsten US-Bundesstaats Rhode Island.",
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

// Mittlere Säulenindizes über alle gespielten Runden (für die Auswertung)
function saeulenDurchschnitt(z) {
  const gespielt = z.verlauf.filter(function (s) { return s.runde >= 1; });
  const out = { oeko: 0, oekonomie: 0, sozial: 0 };
  if (!gespielt.length) return out;
  SAEULEN.forEach(function (sa) {
    out[sa.id] = runden1(gespielt.reduce(function (a, s) { return a + rundenGewicht(s.runde) * s.saeulen[sa.id]; }, 0) /
      gespielt.reduce(function (a, s) { return a + rundenGewicht(s.runde); }, 0));
  });
  return out;
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

// Vergleichslinie „Weiter so“: Was wäre ohne eine einzige Maßnahme geschehen?
let bauCache = null;
function weiterSoVerlauf() {
  if (bauCache) return bauCache;
  const z = neuerZustand(function () { return 0.5; });
  z.ereignisPlan = {};
  for (let r = 1; r <= RUNDEN; r++) {
    z.auswahl = leereAuswahl();
    rundeAbschliessen(z, {});
  }
  bauCache = { verlauf: z.verlauf, score: gesamtScore(z), saeulen: saeulenDurchschnitt(z) };
  return bauCache;
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

// ---------- Zwischenbilanz nach Runde 3, 6 und 9 ----------
// Der Sollkurs (KURS) ist der Maßstab: Weil alle Maßnahmen verzögert wirken und die
// Artenvielfalt der Meeresgesundheit hinterherläuft, steigt er anfangs flach und später steiler.
// „Auf Kurs“ heißt: höchstens ZB_TOLERANZ Punkte unter dem Sollwert dieser Runde.
function kursGrenze(id, runde) {
  const soll = kursSoll(id, runde);
  if (id !== "strandmuell") return soll - ZB_TOLERANZ;
  // Müll: Wert, dessen Müllpunkte ZB_TOLERANZ unter denen des Sollwerts liegen
  const mp = Math.max(0, muellPunkte(soll) - ZB_TOLERANZ) / 100;
  return Math.round(Math.exp(Math.log(MUELL_START) - mp * (Math.log(MUELL_START) - Math.log(MUELL_SCHWELLE))));
}

const ZB_HINWEISE = {
  belastung: {
    muell: "Die größte Belastung für das Meer ist der Müll, der jede Runde neu dazukommt. Das i neben " +
      "dem Strandmüll in der Kopfleiste zeigt, welche Quelle am meisten beiträgt.",
    wasser: "Die größte Belastung für das Meer kommt gerade nicht vom Strand. Was fließt außer Müll " +
      "noch aus Fabriken und Orten ins Wasser?",
    fischerei: "Die Fischerei setzt dem Meer gerade am stärksten zu. Was passiert mit Netzen, die niemand " +
      "mehr einholt, und wo könnten sich Bestände erholen?",
    klima: "Die Erwärmung belastet das Meer stärker als alles andere. Dagegen hilft nichts sofort. Lohnt " +
      "es sich, früh damit anzufangen?"
  },
  artenvielfalt: "Die Artenvielfalt folgt der Meeresgesundheit mit Verzögerung. Tiere brauchen außerdem " +
    "Rückzugsorte, an denen sie nicht gestört werden. Prüfe auch, ob eine Maßnahme ihnen dauerhaft " +
    "Nahrung oder Lebensraum nimmt.",
  muellEintrag: "Der Strand füllt sich schneller wieder, als er sauber wird. Aufräumen bekämpft das " +
    "Symptom. Wo entsteht der Müll?",
  muellBestand: "Der neue Müll ist schon deutlich gesunken. Der alte Bestand am Strand baut sich aber nur " +
    "langsam von selbst ab.",
  wirtschaft: "Die Betriebe kommen unter Druck. Ohne Wirtschaft sinken auch deine Einnahmen und die " +
    "Akzeptanz. Gibt es Projekte, die Arbeit schaffen, ohne dem Meer zu schaden?",
  tourismus: "Gäste bleiben weg. Sie achten auf saubere Strände und klares Wasser, aber auch darauf, " +
    "was die Region ihnen bietet.",
  akzeptanz: "Die Menschen tragen deine Entscheidungen immer weniger mit. Erklärst du genug, und hörst " +
    "du ihnen zu? Auch zu viele Gäste können die Stimmung kippen lassen.",
  budget: "Dein Budget ist im Minus. Laufende Kosten und teure Projekte zehren an den Rücklagen."
};

function zwischenbilanzBerechnen(z, runde, belastungen) {
  const s = z.verlauf[z.verlauf.length - 1];
  const start = z.verlauf[0];
  const punkte = [
    ["meeresgesundheit", "Meeresgesundheit"], ["artenvielfalt", "Artenvielfalt"], ["strandmuell", "Strandmüll"],
    ["wirtschaft", "Wirtschaft"], ["tourismus", "Tourismus"], ["akzeptanz", "Akzeptanz"]
  ].map(function (e) {
    const muell = e[0] === "strandmuell";
    return { id: e[0], name: e[1], wert: s[e[0]], start: start[e[0]], soll: Math.round(kursSoll(e[0], runde)),
      grenze: Math.round(kursGrenze(e[0], runde)), einheit: muell ? " Teile" : " %", hoeher: !muell };
  });
  punkte.forEach(function (p) {
    // Abstand zum Sollkurs auf der Skala 0 bis 100 (für die Rangfolge der Hinweise)
    p.abstand = Math.max(0, kennzahlPunkte(p.id, p.soll) - kennzahlPunkte(p.id, p.wert));
    p.ok = p.abstand <= ZB_TOLERANZ;
  });
  const budgetOk = s.budget >= 0;
  const daneben = punkte.filter(function (p) { return !p.ok; }).length + (budgetOk ? 0 : 1);

  let status;
  if (daneben === 0) {
    status = { id: "gut", titel: "Du bist auf einem guten Weg",
      text: "Alle Kennzahlen liegen auf Kurs zum guten Umweltzustand. Halte die Richtung: In den Runden " +
        zielFenster().von + " bis " + zielFenster().bis + " müssen alle Bedingungen gleichzeitig erfüllt sein." };
  } else if (daneben <= 2) {
    status = { id: "teilweise", titel: "Teilweise auf Kurs",
      text: "Vieles entwickelt sich in die richtige Richtung, aber " + daneben +
        (daneben === 1 ? " Kennzahl liegt" : " Kennzahlen liegen") + " hinter dem Weg zum Ziel zurück." };
  } else {
    status = { id: "kritisch", titel: "Kurskorrektur nötig",
      text: daneben + " Kennzahlen liegen deutlich hinter dem Weg zum Ziel zurück. In diesem Tempo " +
        "erreichst du den guten Umweltzustand nicht rechtzeitig." };
  }

  // Hinweise zu den zwei schwächsten Kennzahlen, ohne die Lösung zu verraten
  const hinweise = [];
  if (!budgetOk) hinweise.push(ZB_HINWEISE.budget);
  punkte.filter(function (p) { return !p.ok; })
    .sort(function (a, b) { return b.abstand - a.abstand; })
    .slice(0, budgetOk ? 2 : 1)
    .forEach(function (p) {
      if (p.id === "meeresgesundheit") {
        const groesste = Object.keys(belastungen).sort(function (a, b) { return belastungen[b] - belastungen[a]; })[0];
        hinweise.push(ZB_HINWEISE.belastung[groesste]);
      } else if (p.id === "strandmuell") {
        hinweise.push(z.eintrag.gesamt > 30 ? ZB_HINWEISE.muellEintrag : ZB_HINWEISE.muellBestand);
      } else {
        hinweise.push(ZB_HINWEISE[p.id]);
      }
    });
  if (!hinweise.length) {
    const knappste = punkte.slice().sort(function (a, b) {
      return (kennzahlPunkte(a.id, a.wert) - kennzahlPunkte(a.id, a.soll)) -
             (kennzahlPunkte(b.id, b.wert) - kennzahlPunkte(b.id, b.soll));
    })[0];
    hinweise.push("Am knappsten ist gerade: " + knappste.name + ". Behalte diese Kennzahl im Auge.");
  }

  // Maßnahmen, deren Wirkung noch aussteht
  const ausstehend = [];
  z.effekte.forEach(function (e) {
    if (e.massnahme && e.start > runde && ausstehend.indexOf(e.massnahme) < 0) ausstehend.push(e.massnahme);
  });

  return { runde: runde, status: status, punkte: punkte, budget: s.budget, budgetOk: budgetOk,
    hinweise: hinweise, ausstehend: ausstehend.length };
}

// Rechnet eine komplette Runde durch und liefert einen Bericht.
// Ablauf: Anhörung → Maßnahmen der drei Säulen verbuchen → aktive Wirkungen →
//         Müllbilanz → Kennzahlen → Einnahmen → Verlauf → Zwischenbilanz →
//         nächste Runde vorbereiten
function rundeAbschliessen(z, auswahl) {
  auswahl = auswahl || {};
  const r = z.runde;
  const vorher = momentaufnahme(z, r);
  const akzeptanzStart = z.akzeptanz;
  const bericht = {
    runde: r, entscheidungen: [],
    neuWirksam: [], ausgelaufen: [], foerderungen: [],
    ereignis: null, anhoerung: [], zwischenbilanz: null
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

  // 6b. Zwischenbilanz nach Runde 3, 6, 9
  if (r % ZWISCHENBILANZ_ALLE === 0 && r < RUNDEN) {
    bericht.zwischenbilanz = zwischenbilanzBerechnen(z, r, ziel.belastungen);
  }

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
  zieleAnzeigen();
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

function zieleAnzeigen() {
  const z = zustand;
  const s = momentaufnahme(z, z.runde);
  el("zielZusatz").textContent = "Alle Bedingungen müssen in Runde " + zielFenster().von + " bis " +
    zielFenster().bis + " gleichzeitig erfüllt sein";
  const liste = el("zielListe");
  liste.innerHTML = "";
  ZIELE.forEach(function (ziel) {
    const ok = ziel.pruefen(s);
    const li = document.createElement("li");
    li.className = ok ? "ziel-ok" : "ziel-offen";
    li.innerHTML =
      '<span class="ziel-punkt" aria-hidden="true"></span>' +
      '<span class="ziel-text">' + ziel.text + "</span>" +
      '<span class="ziel-wert">' + ziel.wert(s) + "</span>" +
      '<span class="sr-only">' + (ok ? "erfüllt" : "nicht erfüllt") + "</span>";
    liste.appendChild(li);
  });
  const score = gesamtScore(z);
  el("anzeigeScore").textContent = score === null ? "noch keine Runde gespielt" : zahl(score, 1) + " von 100";
  const wissen = wissensScore(z);
  el("anzeigeWissen").textContent = wissen === null
    ? "noch keine Frage beantwortet"
    : zahl(wissen, 1) + " von 100 (" + z.quiz.richtig + " von " + z.quiz.gestellt + " richtig)";
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

// Kopf der Ökologie-Spalte: Bereich dieser Runde, dazu der Anteil seiner Müllquelle am neuen Müll
function bereichBannerHtml(z, region) {
  const stil = BEREICH_STIL[region];
  const quelle = QUELLEN.find(function (q) { return q.id === region; });
  const anteil = z.eintrag && z.eintrag.gesamt > 0 ? Math.round(100 * z.eintrag[region] / z.eintrag.gesamt) : null;
  return '<div class="bereich-banner" style="--bereich:' + stil.farbe + ";--bereich-flaeche:" + stil.flaeche + '">' +
      '<span class="bereich-symbol">' + bereichSymbolSvg(region) + "</span>" +
      '<span class="bereich-text">' +
        '<span class="bereich-label">Bereich dieser Runde</span>' +
        '<strong class="bereich-name">' + bereichName(region) + "</strong>" +
      "</span>" +
    "</div>" +
    (anteil === null ? "" : '<p class="bereich-quelle">Müllquelle hier: ' + quelle.name + ", " + anteil +
      " % des neuen Mülls</p>");
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
    if (s.id === "oeko" && !z.beendet) {
      kopf.insertAdjacentHTML("beforeend", bereichBannerHtml(z, region));
    } else {
      kopf.appendChild(elementBauen("p", "saeule-untertitel", s.untertitel));
    }
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
function figurSvg(farbe) {
  return '<svg class="person-figur" viewBox="0 0 20 30" aria-hidden="true" focusable="false">' +
    '<circle cx="10" cy="6" r="5" fill="#F2D2B6" stroke="#12304A" stroke-width="1.4"/>' +
    '<path d="M3 29 L3 18 Q3 12 10 12 Q17 12 17 18 L17 29 Z" fill="' + farbe + '" stroke="#12304A" stroke-width="1.4"/>' +
    "</svg>";
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
      '<span class="person-blase" aria-hidden="true">' + (a.gelesen ? "✓" : "…") + "</span>" + figurSvg(p.farbe) +
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
// Beschriftet sind nur Fabrik und große Hotels; die Legende steht darunter.
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

function meerFarbe(meeresgesundheit) {
  const t = begrenzen((meeresgesundheit - 25) / 65, 0, 1);
  return mischfarbe([139, 168, 152], [74, 152, 206], t);
}

// ---------- Hilfsfunktionen für die Kartengrafiken ----------

// Verlauf des Flusses als zwei Bézier-Abschnitte [Start, Kontrolle 1, Kontrolle 2, Ende].
// Der Müllfänger nutzt dieselben Punkte, damit er genau quer im Fluss liegt.
function flussAbschnitte() {
  const yMuendung = kuestenlinie(196) + STRAND_BREITE;
  return [
    [[146, -4], [118, 26], [206, 44], [176, 70]],
    [[176, 70], [146, 96], [196, yMuendung - 18], [196, yMuendung + 4]]
  ];
}

// Punkt und Flussrichtung (normiert) auf einem Bézier-Abschnitt, t von 0 bis 1
function bezierPunkt(a, t) {
  const u = 1 - t;
  const x = u * u * u * a[0][0] + 3 * u * u * t * a[1][0] + 3 * u * t * t * a[2][0] + t * t * t * a[3][0];
  const y = u * u * u * a[0][1] + 3 * u * u * t * a[1][1] + 3 * u * t * t * a[2][1] + t * t * t * a[3][1];
  const dx = 3 * (u * u * (a[1][0] - a[0][0]) + 2 * u * t * (a[2][0] - a[1][0]) + t * t * (a[3][0] - a[2][0]));
  const dy = 3 * (u * u * (a[1][1] - a[0][1]) + 2 * u * t * (a[2][1] - a[1][1]) + t * t * (a[3][1] - a[2][1]));
  const laenge = Math.hypot(dx, dy) || 1;
  return { x: x, y: y, rx: dx / laenge, ry: dy / laenge };
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
  const laenge = 26 + groesse * 3.2;
  const breite = 8 + groesse * 1.5;               // halbe Breite an der breitesten Stelle
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

  const deckkraft = begrenzen(0.14 + groesse / 70, 0.15, 0.45);
  let s = '<path d="' + umriss(1, 0.4) + '" fill="#8A6A3B" opacity="' + deckkraft.toFixed(2) + '" ' +
    'stroke="#8A6A3B" stroke-opacity="0.45" stroke-width="0.8" stroke-dasharray="3 3"/>';
  s += '<path d="' + umriss(0.62, 1.7) + '" fill="#6E5230" opacity="' + (deckkraft * 0.9).toFixed(2) + '"/>';
  // Schwebstoffe im Wasser
  const r = zufallsfolge(91);
  const teilchen = Math.round(3 + groesse / 3);
  for (let i = 0; i < teilchen; i++) {
    const s1 = 0.25 + r() * 0.65;
    const q = (r() - 0.5) * breite * 0.9 * s1;
    s += '<circle cx="' + (ox + dx * laenge * s1 + nx * q).toFixed(1) + '" cy="' + (oy + dy * laenge * s1 + ny * q).toFixed(1) +
      '" r="' + (0.9 + r() * 0.8).toFixed(1) + '" fill="#5B4428" opacity="0.55"/>';
  }
  return s;
}

// Großes Hotel: Fenster in Reihen, Schild „Hotel“, Eingang mit Vordach, Fahne
function hotelGrossSvg(x, y, tinte) {
  const b = 34;
  const h = 30;
  let s = '<rect x="' + x + '" y="' + y + '" width="' + b + '" height="' + h + '" fill="#FBF8F1" stroke="' + tinte + '" stroke-width="1.2"/>';
  s += '<rect x="' + (x - 1.5) + '" y="' + (y - 3) + '" width="' + (b + 3) + '" height="3.5" fill="' + tinte + '"/>';
  // Fahne auf dem Dach
  s += '<line x1="' + (x + b - 5) + '" y1="' + (y - 3) + '" x2="' + (x + b - 5) + '" y2="' + (y - 11) + '" stroke="' + tinte + '" stroke-width="0.9"/>' +
    '<path d="M' + (x + b - 5) + "," + (y - 11) + " l6,1.6 l-6,1.6 Z\" fill=\"#E2A92B\"/>";
  // Schild
  s += '<rect x="' + (x + 4) + '" y="' + (y + 2.5) + '" width="' + (b - 8) + '" height="7.5" rx="1" fill="#1D4F8C"/>' +
    '<text x="' + (x + b / 2) + '" y="' + (y + 8.6) + '" text-anchor="middle" font-size="6.4" font-weight="700" ' +
    'letter-spacing="0.4" fill="#ffffff">Hotel</text>';
  // Fenster: 2 Reihen à 4, mit Balkonlinie
  for (let reihe = 0; reihe < 2; reihe++) {
    const fy = y + 12.5 + reihe * 6.5;
    for (let spalte = 0; spalte < 4; spalte++) {
      s += '<rect x="' + (x + 3.5 + spalte * 7.4) + '" y="' + fy + '" width="4.2" height="4" fill="#9CC7E0" stroke="' + tinte + '" stroke-width="0.5"/>';
    }
    s += '<line x1="' + (x + 2.5) + '" y1="' + (fy + 4.6) + '" x2="' + (x + b - 2.5) + '" y2="' + (fy + 4.6) + '" stroke="' + tinte + '" stroke-width="0.5" opacity="0.6"/>';
  }
  // Eingang mit Vordach
  s += '<rect x="' + (x + b / 2 - 3) + '" y="' + (y + h - 5.5) + '" width="6" height="5.5" fill="' + tinte + '"/>' +
    '<rect x="' + (x + b / 2 - 5) + '" y="' + (y + h - 7) + '" width="10" height="1.6" fill="#1D4F8C"/>';
  return s;
}

// Kleines Gästehaus: Satteldach, zwei Fenster, ohne Schrift
function hotelKleinSvg(x, y, tinte) {
  let s = '<path d="M' + (x - 1.5) + "," + y + " L" + (x + 9) + "," + (y - 7) + " L" + (x + 19.5) + "," + y + ' Z" ' +
    'fill="#B8694A" stroke="' + tinte + '" stroke-width="1"/>';
  s += '<rect x="' + x + '" y="' + y + '" width="18" height="13" fill="#FBF8F1" stroke="' + tinte + '" stroke-width="1.2"/>';
  s += '<rect x="' + (x + 2.5) + '" y="' + (y + 3) + '" width="4" height="4" fill="#9CC7E0" stroke="' + tinte + '" stroke-width="0.5"/>' +
    '<rect x="' + (x + 11.5) + '" y="' + (y + 3) + '" width="4" height="4" fill="#9CC7E0" stroke="' + tinte + '" stroke-width="0.5"/>' +
    '<rect x="' + (x + 7.5) + '" y="' + (y + 8) + '" width="3" height="5" fill="' + tinte + '"/>';
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

// Fabrik: graue Halle mit Sheddach, Schornstein, Fensterband, Rolltor und Schild.
// x, y = linke obere Ecke der Halle, b/h = Breite/Höhe, zacken = Zahl der Dachzacken
function fabrikSvg(x, y, b, h, zacken, schrift, tinte) {
  const zahn = b / zacken;
  const kx = x + b * 0.76;                 // Schornstein hinter dem Dach
  const kb = Math.max(6, b * 0.145);
  const kh = h + 2;
  let s = '<rect x="' + kx.toFixed(1) + '" y="' + (y - kh) + '" width="' + kb.toFixed(1) + '" height="' + (kh + 2) + '" fill="#9AA4AC" stroke="' + tinte + '" stroke-width="1.2"/>' +
    '<rect x="' + kx.toFixed(1) + '" y="' + (y - kh + 6) + '" width="' + kb.toFixed(1) + '" height="2.6" fill="#5F6B75"/>' +
    '<rect x="' + kx.toFixed(1) + '" y="' + (y - kh + 12) + '" width="' + kb.toFixed(1) + '" height="2.6" fill="#5F6B75"/>';
  let dach = "M" + x + "," + y;
  for (let i = 0; i < zacken; i++) {
    dach += " L" + (x + i * zahn).toFixed(1) + "," + (y - 8) + " L" + (x + (i + 1) * zahn).toFixed(1) + "," + y;
  }
  s += '<path d="' + dach + ' Z" fill="#7F8B94" stroke="' + tinte + '" stroke-width="1.1" stroke-linejoin="round"/>';
  for (let i = 0; i < zacken; i++) {
    s += '<line x1="' + (x + i * zahn + 1.2).toFixed(1) + '" y1="' + (y - 6.5) + '" x2="' + (x + i * zahn + 1.2).toFixed(1) + '" y2="' + (y - 1) +
      '" stroke="#C9D6DE" stroke-width="1.4"/>';
  }
  s += '<rect x="' + x + '" y="' + y + '" width="' + b + '" height="' + h + '" fill="#B4BCC2" stroke="' + tinte + '" stroke-width="1.2"/>';
  // Schild
  const sh = schrift + 1.6;
  s += '<rect x="' + (x + 6) + '" y="' + (y + 3) + '" width="' + (b - 12) + '" height="' + sh.toFixed(1) + '" rx="1" fill="#ffffff" stroke="' + tinte + '" stroke-width="0.8"/>' +
    '<text x="' + (x + b / 2) + '" y="' + (y + 3 + sh * 0.78).toFixed(1) + '" text-anchor="middle" font-size="' + schrift + '" font-weight="700" ' +
    'letter-spacing="0.5" fill="' + tinte + '">FABRIK</text>';
  // Fensterband links, Rolltor rechts
  const tor = Math.round(h * 0.45);
  const fenster = Math.floor((b - tor - 10) / 7);
  for (let i = 0; i < fenster; i++) {
    s += '<rect x="' + (x + 4 + i * 7) + '" y="' + (y + h - 9) + '" width="5" height="5" fill="#DCE3E8" stroke="' + tinte + '" stroke-width="0.5"/>';
  }
  s += '<rect x="' + (x + b - tor - 4) + '" y="' + (y + h - tor) + '" width="' + tor + '" height="' + tor + '" fill="#8C969E" stroke="' + tinte + '" stroke-width="0.8"/>';
  for (let i = 1; i < 4; i++) {
    const ly = y + h - tor + i * tor / 4;
    s += '<line x1="' + (x + b - tor - 4) + '" y1="' + ly.toFixed(1) + '" x2="' + (x + b - 4) + '" y2="' + ly.toFixed(1) + '" stroke="' + tinte + '" stroke-width="0.4"/>';
  }
  return s;
}

// ---------- Müll als kleine Symbole ----------
// Drei flache Farbfamilien: Plastik (weiß/hellblau), Glas (grün), Essensreste (gelb/orange).
// Jede Form hat eine Füllfarbe und einen dünnen Rand, keine Glanzlichter oder Etiketten.
// Alle Formen sind um (0,0) gezeichnet, etwa 12 Einheiten lang (Strand ist 22 breit).
const MUELL_FARBEN = {
  plastik: { flaeche: "#EEF5F8", flaeche2: "#CFE2EC", rand: "#4F6B80" },
  glas:    { flaeche: "#6E9E4A", flaeche2: "#A5CB82", rand: "#3F6328" },
  essen:   { flaeche: "#EDB53C", flaeche2: "#E07B39", kern: "#F6E6BE", rand: "#94660F" }
};

function muellFormen() {
  const p = MUELL_FARBEN.plastik;
  const g = MUELL_FARBEN.glas;
  const e = MUELL_FARBEN.essen;
  const linie = function (farbe) {
    return ' stroke="' + farbe + '" stroke-width="0.55" stroke-linejoin="round"';
  };
  return {
    // Plastik: liegende Flasche (Boden links, Verschluss rechts), Tüte, Verpackung
    flasche: '<path d="M-6,-2.2 H1.6 Q3,-2.2 3.8,-1 H5 V1 H3.8 Q3,2.2 1.6,2.2 H-6 Q-6.8,2.2 -6.8,1.4 V-1.4 Q-6.8,-2.2 -6,-2.2 Z" ' +
      'fill="' + p.flaeche + '"' + linie(p.rand) + "/>" +
      '<rect x="5" y="-1.35" width="1.6" height="2.7" rx="0.3" fill="' + p.flaeche2 + '"' + linie(p.rand) + "/>",
    tuete: '<path d="M-4,-4.6 H-2 V-2.4 Q0,-1 2,-2.4 V-4.6 H4 L4.7,4 Q0,5.3 -4.7,4 Z" fill="' + p.flaeche + '"' + linie(p.rand) + "/>",
    verpackung: '<path d="M-2.7,-3.6 L-2,-3.1 L-1.35,-3.6 L-0.7,-3.1 L0,-3.6 L0.7,-3.1 L1.35,-3.6 L2,-3.1 L2.7,-3.6 V3.6 ' +
      'L2,3.1 L1.35,3.6 L0.7,3.1 L0,3.6 L-0.7,3.1 L-1.35,3.6 L-2,3.1 L-2.7,3.6 Z" fill="' + p.flaeche2 + '"' + linie(p.rand) + "/>",
    // Glas: heile Flasche mit langem Hals und zerbrochene Flasche mit Scherben
    glasflasche: '<path d="M-6,-2.3 H0.6 Q2.4,-2.3 3,-1 H6.4 V1 H3 Q2.4,2.3 0.6,2.3 H-6 Q-6.8,2.3 -6.8,1.5 V-1.5 Q-6.8,-2.3 -6,-2.3 Z" ' +
      'fill="' + g.flaeche + '"' + linie(g.rand) + "/>",
    scherbe: '<path d="M5.6,-1 H3.6 Q2.8,-2.4 1.2,-2.4 H-3 L-4.3,-1.3 L-3.3,-0.5 L-5,0.5 L-3.7,1.3 L-4.6,2.4 H1.2 Q2.8,2.4 3.6,1 H5.6 Z" ' +
      'fill="' + g.flaeche + '"' + linie(g.rand) + "/>" +
      '<polygon points="-7.4,-1.8 -5.9,0.2 -8,0.6" fill="' + g.flaeche2 + '"' + linie(g.rand) + "/>" +
      '<polygon points="-7.6,2 -6.2,1.6 -6.8,3.3" fill="' + g.flaeche2 + '"' + linie(g.rand) + "/>",
    // Essensreste: Apfelbutzen (aufrecht) und Bananenschale
    apfel: '<path d="M-2.2,-2.3 Q-0.5,0 -2.2,2.3 H2.2 Q0.5,0 2.2,-2.3 Z" fill="' + e.kern + '"' + linie(e.rand) + "/>" +
      '<path d="M-2.6,-2.3 Q0,-4.8 2.6,-2.3 Q0,-1.6 -2.6,-2.3 Z" fill="' + e.flaeche2 + '"' + linie(e.rand) + "/>" +
      '<path d="M-2.6,2.3 Q0,1.6 2.6,2.3 Q0,4.6 -2.6,2.3 Z" fill="' + e.flaeche2 + '"' + linie(e.rand) + "/>" +
      '<path d="M0,-3.6 Q0.2,-4.6 0.9,-5.1" fill="none" stroke="' + e.rand + '" stroke-width="0.6" stroke-linecap="round"/>',
    banane: '<path d="M0,-2.8 Q-3.8,-1.8 -4.6,3.2 Q-2.6,2 -0.6,-1.4 Z M0,-2.8 Q3.8,-1.6 4.7,2.6 Q2.6,1.7 0.6,-1.4 Z ' +
      'M-0.6,-2.4 Q-1,1.2 0.2,4.8 Q1.6,1.2 0.6,-2.4 Z" fill="' + e.flaeche + '"' + linie(e.rand) + "/>" +
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

function muellSymbolSvg(form, x, y, winkel, groesse) {
  return '<g transform="translate(' + x.toFixed(1) + "," + y.toFixed(1) + ") rotate(" + Math.round(winkel) + ") scale(" +
    groesse.toFixed(2) + ')">' + MUELL_FORMEN[form] + "</g>";
}

// ---------- Wo Müll liegen darf ----------
// Hotspots liegen an den Verursachern. Gebäude, Fluss, Infopunkte und Personen bleiben frei.
// Infopunkte und Personen stehen in Prozent der Karte; hier in Karteneinheiten umgerechnet.
function muellSperrflaechen(z) {
  const flaechen = [
    [612, 26, 70, 54], [482, 24, 42, 42], [527, 40, 24, 26],     // Fabrik, Hotel, Gästehaus
    [730, 90, 22, 80], [647, 76, 10, 34]                           // Hafensteg, Abwasserrohr
  ];
  if (istUmgesetzt(z, "gewerbe")) {
    flaechen.push([684, 48, 54, 36], [424, 32, 42, 42], [465, 54, 24, 26], [549, 64, 24, 26]);
  }
  INFOPUNKTE.forEach(function (p) {
    flaechen.push([p.x * 8 - 15, p.y * 3.2 - 14, 30, 38]);       // Knopf und Beschriftung
  });
  if (istUmgesetzt(z, "schilder")) {
    muelleimerOrte().forEach(function (o) { flaechen.push([o.x - 6, o.y - 14, 12, 15]); });
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

// Punkte auf der Flussmitte, für Abstände zum Fluss und für Müll im Fluss
function flussPunkte() {
  const fluss = flussAbschnitte();
  const punkte = [];
  fluss.forEach(function (abschnitt, i) {
    for (let t = 0; t <= 1; t += 0.05) {
      const p = bezierPunkt(abschnitt, t);
      p.s = i + t;                                             // Lage im Fluss: 0 = Quelle, 2 = Mündung
      punkte.push(p);
    }
  });
  return punkte;
}

function abstandZumFluss(x, y, punkte) {
  return Math.min.apply(null, punkte.map(function (p) { return Math.hypot(p.x - x, p.y - y); }));
}

// Hotspots am Strand: Abschnitt von x bis x + b, Anteile der Müllarten, Anzahl Plätze
// Hotspots an Land: Ellipse um (x, y) mit Halbachsen rx, ry; „amFluss“ = entlang beider Ufer.
// quelle: welcher Eintrag die Menge an Land steuert (strand = Strandbesucher, land = Hinterland)
const MUELL_HOTSPOTS = {
  strand: [
    { id: "muendung",  x: 160, b: 140, arten: { plastik: 1 }, plaetze: 8 },
    { id: "kiosk",     x: 350, b: 62,  arten: { plastik: 0.85, essen: 0.15 }, plaetze: 5 },
    { id: "hotels",    x: 420, b: 170, arten: { essen: 0.7, plastik: 0.3 }, plaetze: 10 },
    { id: "industrie", x: 600, b: 128, arten: { glas: 0.75, plastik: 0.25 }, plaetze: 8 }
  ],
  land: [
    { id: "hotels",    x: 505, y: 74, rx: 92, ry: 24, arten: { essen: 0.75, plastik: 0.25 }, plaetze: 8, quelle: "strand" },
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
  const fluss = flussPunkte();
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
        const p = bezierPunkt(flussAbschnitte()[Math.min(1, Math.floor(stelle))], stelle - Math.floor(stelle));
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
      if (abstandZumFluss(x, y, fluss) < 13) continue;                     // nicht im Fluss
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
  const fluss = flussAbschnitte();
  let s = "";
  for (let i = 0; i < FLUSS_MUELL_MAX; i++) {
    let lage = 0.1 + (i + r()) / FLUSS_MUELL_MAX * 1.8;                   // 0 bis 2 über beide Abschnitte
    if (muellfaengerWirkt) lage = 0.1 + (lage - 0.1) * (1.22 / 1.9);       // nur oberhalb der Barriere
    const abschnitt = fluss[Math.min(1, Math.floor(lage))];
    const p = bezierPunkt(abschnitt, lage - Math.floor(lage));
    const quer = (r() - 0.5) * 6;
    const form = MUELL_ARTEN.plastik[Math.floor(r() * MUELL_ARTEN.plastik.length)];
    const winkel = Math.atan2(p.ry, p.rx) * 180 / Math.PI + (r() - 0.5) * 30;
    if (i >= anzahl) continue;
    s += muellSymbolSvg(form, p.x - p.ry * quer, p.y + p.rx * quer, winkel, 0.8);
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
    s += muellSymbolSvg(form, x, y, winkel, 1.2) +
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

// Mülleimer mit Recycling-Zeichen, (x, y) = Mitte am Boden
function muelleimerSvg(x, y, tinte) {
  const f = HAFEN_FARBEN;
  return '<g transform="translate(' + x.toFixed(1) + "," + y.toFixed(1) + ') scale(1.2)">' +
    '<ellipse cx="0" cy="0.3" rx="3.4" ry="0.8" fill="' + tinte + '" opacity="0.18"/>' +
    '<path d="M-3,-7 H3 L2.4,0 H-2.4 Z" fill="' + f.eimer + '" stroke="' + tinte + '" stroke-width="0.6" stroke-linejoin="round"/>' +
    '<rect x="-1.1" y="-9.5" width="2.2" height="1.1" rx="0.4" fill="' + f.eimerDeckel + '" stroke="' + tinte + '" stroke-width="0.4"/>' +
    '<rect x="-3.7" y="-8.6" width="7.4" height="1.7" rx="0.5" fill="' + f.eimerDeckel + '" stroke="' + tinte + '" stroke-width="0.5"/>' +
    '<circle cx="0" cy="-3.6" r="1.55" fill="none" stroke="#FFFFFF" stroke-width="0.7" stroke-dasharray="2.6 0.65"/>' +
    "</g>";
}

// Mülleimer: verteilt am Strand, einer am Hotel, einer an der Fabrik (y = Boden)
function muelleimerOrte() {
  const strand = [40, 262, 395, 575, 700].map(function (x) {
    return { x: x, y: kuestenlinie(x) + 13 };
  });
  return strand.concat([{ x: 528, y: 82 }, { x: 628, y: 97 }]);
}

function seekarteSvg(z) {
  const k = z.kennzahlen;
  const w = aktiveWirkung(z, Math.min(z.runde, RUNDEN));
  const wirksam = function (id) {
    return istUmgesetzt(z, id) && z.umgesetzt[id][0] < z.runde;
  };
  const tinte = "#12304A";
  let s = "";

  s += '<svg viewBox="0 0 ' + KARTE_B + " " + KARTE_H + '" xmlns="http://www.w3.org/2000/svg" ' +
    'preserveAspectRatio="xMidYMid slice" focusable="false">';
  s += "<defs>" +
    '<pattern id="schraffur" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<line x1="0" y1="0" x2="0" y2="9" stroke="#B0307A" stroke-width="1.2" opacity="0.35"/></pattern>' +
    '<linearGradient id="tiefe" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>' +
    '<stop offset="1" stop-color="#0b2238" stop-opacity="0.12"/></linearGradient>' +
    "</defs>";

  // Meer mit Tiefenverlauf und Tiefenlinien
  s += '<rect width="' + KARTE_B + '" height="' + KARTE_H + '" fill="' + meerFarbe(k.meeresgesundheit) + '"/>';
  s += '<rect width="' + KARTE_B + '" height="' + KARTE_H + '" fill="url(#tiefe)"/>';
  [52, 104, 160].forEach(function (versatz, i) {
    s += '<polyline points="' + linienPunkte(versatz) + '" fill="none" stroke="' + tinte + '" ' +
      'stroke-opacity="0.22" stroke-width="1"' + (i === 1 ? ' stroke-dasharray="6 5"' : "") + "/>";
  });

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
    [[96, 262], [136, 286], [176, 260], [216, 284], [256, 262]].forEach(function (p) {
      const x = p[0];
      const y = p[1];
      s += '<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y - 20) + '" stroke="#ffffff" stroke-width="2"/>' +
        '<path d="M' + x + "," + (y - 20) + " l-8,-4 M" + x + "," + (y - 20) + " l8,-4 M" + x + "," + (y - 20) +
        ' l0,9" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>' +
        '<circle cx="' + x + '" cy="' + (y - 20) + '" r="1.8" fill="' + tinte + '"/>';
    });
  }

  // Strand und Land
  s += '<polygon points="0,0 ' + linienPunkte(STRAND_BREITE) + ' 800,0" fill="#EAD7A4"/>';
  s += '<polygon points="0,0 ' + linienPunkte(0) + ' 800,0" fill="#D5E0C3"/>';
  s += '<polyline points="' + linienPunkte(STRAND_BREITE) + '" fill="none" stroke="' + tinte + '" stroke-width="1.4"/>';

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

  // Fluss mit Mündung
  const fluss = flussAbschnitte();
  s += '<path d="M' + fluss[0][0].join(",") + " C" + fluss[0].slice(1).map(function (p) { return p.join(","); }).join(" ") +
    " C" + fluss[1].slice(1).map(function (p) { return p[0] + "," + p[1].toFixed(1); }).join(" ") +
    '" fill="none" stroke="#86B9D6" stroke-width="16" stroke-linecap="round"/>';

  // Müll im Fluss: der Fluss trägt Müll aus dem Hinterland ins Meer
  s += flussMuellSvg(z, wirksam("muellfaenger"));

  // Müllfänger: schwimmende Barriere schräg quer durch den Fluss. Sie lenkt den Müll
  // zum Ufer, wo ein Sammelkorb ihn auffängt.
  if (istUmgesetzt(z, "muellfaenger")) {
    const p = bezierPunkt(fluss[1], 0.3);
    const qx = -p.ry;                     // quer zur Flussrichtung
    const qy = p.rx;
    const halb = 17;                      // reicht über beide Ufer (Fluss ist 16 breit)
    const schraeg = 3;                    // Versatz in Flussrichtung: Barriere liegt schräg
    const ax = p.x - qx * halb - p.rx * schraeg;
    const ay = p.y - qy * halb - p.ry * schraeg;
    const bx = p.x + qx * halb + p.rx * schraeg;
    const by = p.y + qy * halb + p.ry * schraeg;
    s += '<line x1="' + ax.toFixed(1) + '" y1="' + ay.toFixed(1) + '" x2="' + bx.toFixed(1) + '" y2="' + by.toFixed(1) +
      '" stroke="#E8662A" stroke-width="2.4" stroke-linecap="round"/>';
    [0.36, 0.5, 0.64].forEach(function (t) {
      s += '<circle cx="' + (ax + (bx - ax) * t).toFixed(1) + '" cy="' + (ay + (by - ay) * t).toFixed(1) +
        '" r="2.2" fill="#E8662A" stroke="' + tinte + '" stroke-width="0.7"/>';
    });
    // Pfosten an beiden Ufern
    [[ax, ay], [bx, by]].forEach(function (e) {
      s += '<rect x="' + (e[0] - 1.6).toFixed(1) + '" y="' + (e[1] - 1.6).toFixed(1) + '" width="3.2" height="3.2" fill="' + tinte + '"/>';
    });
    // Sammelkorb am unteren Ende der Barriere, davor aufgestauter Müll
    const kx = bx + qx * 3.5;
    const ky = by + qy * 3.5;
    s += '<rect x="' + (kx - 4).toFixed(1) + '" y="' + (ky - 3.5).toFixed(1) + '" width="8" height="7" fill="#ffffff" stroke="' + tinte + '" stroke-width="1"/>' +
      '<path d="M' + (kx - 1.3).toFixed(1) + "," + (ky - 3.5).toFixed(1) + " v7 M" + (kx + 1.3).toFixed(1) + "," + (ky - 3.5).toFixed(1) + " v7 M" +
      (kx - 4).toFixed(1) + "," + ky.toFixed(1) + ' h8" stroke="' + tinte + '" stroke-width="0.6"/>';
    [[0.43, "flasche"], [0.57, "tuete"], [0.66, "verpackung"]].forEach(function (t) {
      s += muellSymbolSvg(t[1], ax + (bx - ax) * t[0] - p.rx * 3.2, ay + (by - ay) * t[0] - p.ry * 3.2, 30, 0.42);
    });
  }

  // Ort: zu Beginn ein Hotel und ein Gästehaus. Mit „Gewerbegebiet erweitern“
  // wächst der Ort um ein zweites Hotel und zwei Gästehäuser.
  const gewerbe = istUmgesetzt(z, "gewerbe");
  const haeuser = [
    { x: 486, y: 32, gross: true },
    { x: 530, y: 50, gross: false }
  ];
  if (gewerbe) {
    haeuser.push({ x: 428, y: 40, gross: true }, { x: 468, y: 64, gross: false }, { x: 552, y: 74, gross: false });
  }
  haeuser.forEach(function (h) {
    s += h.gross ? hotelGrossSvg(h.x, h.y, tinte) : hotelKleinSvg(h.x, h.y, tinte);
  });

  // Fabrik mit Schornstein; Rauch nur, solange das CO2-Gesetz noch nicht wirkt
  s += fabrikSvg(616, 46, 62, 30, 4, 7.6, tinte);
  if (!wirksam("co2")) {
    s += '<circle cx="668" cy="10" r="5" fill="#8C99A3" opacity="0.6"/>' +
      '<circle cx="677" cy="5" r="6" fill="#8C99A3" opacity="0.45"/>' +
      '<circle cx="689" cy="3" r="7" fill="#8C99A3" opacity="0.3"/>';
  }
  // Gewerbegebiet erweitert: zweite, kleinere Fabrik rechts daneben
  if (gewerbe) s += fabrikSvg(688, 56, 46, 24, 3, 6.2, tinte);

  // Abwasserrohr zum Meer
  s += '<line x1="652" y1="76" x2="652" y2="' + (kuestenlinie(652) + STRAND_BREITE + 6).toFixed(1) +
    '" stroke="' + tinte + '" stroke-width="2"/>';

  // Hafen: Steg mit Holzplanken und Pfählen; mit Kreuzfahrtanleger wird er zum T
  const yHafen = kuestenlinie(742) + STRAND_BREITE;
  const kreuzfahrt = istUmgesetzt(z, "kreuzfahrt");
  const steg = stegSvg(yHafen - 4, kreuzfahrt, tinte);
  s += steg.svg;
  if (istUmgesetzt(z, "netzrueckgabe")) {
    s += '<rect x="736" y="' + (yHafen + 6).toFixed(1) + '" width="10" height="8" rx="1.2" fill="#2E8B57" stroke="' + tinte + '" stroke-width="0.6"/>';
  }
  // Fischkutter am Steg
  s += kutterSvg(772, yHafen + 56, 1, false, tinte);
  // Zwei Kreuzfahrtschiffe am T-Stück: eines in der linken Ecke zwischen Steg und Querstück,
  // eines rechts unter dem Querstück
  if (kreuzfahrt) {
    s += kreuzfahrtschiffSvg(703, steg.yEnde - 8, 0.9, tinte) + kreuzfahrtschiffSvg(768, steg.tUnten + 25, 0.9, tinte);
  }
  // Höhere Fangquoten: zwei weitere Kutter fischen auf See
  if (istUmgesetzt(z, "quoten")) {
    s += kutterSvg(300, 205, 0.8, true, tinte) + kutterSvg(765, 300, 0.8, false, tinte);
  }

  // Mülleimer: verteilt am Strand, je einer am Hotel und an der Fabrik
  if (istUmgesetzt(z, "schilder")) {
    muelleimerOrte().forEach(function (o) { s += muelleimerSvg(o.x, o.y, tinte); });
  }

  // Forschungsboje
  if (istUmgesetzt(z, "forschung")) {
    s += '<line x1="290" y1="238" x2="290" y2="226" stroke="' + tinte + '" stroke-width="1.4"/>' +
      '<circle cx="290" cy="242" r="5.5" fill="#E2A92B" stroke="' + tinte + '" stroke-width="1.2"/>';
  }

  // Treibgut im Wasser (Eintrag): Plastikflaschen und -tüten nahe dem Strand
  s += treibgutSvg(treibgutAnzahl(z));

  // Fische (Artenvielfalt)
  const r3 = zufallsfolge(57);
  const fische = Math.round(k.artenvielfalt / 9);
  for (let i = 0; i < 12; i++) {
    const x = 40 + r3() * 700;
    const y = 214 + r3() * 90;
    const richtung = r3() > 0.5 ? 1 : -1;
    if (i < fische) {
      s += '<g transform="translate(' + x.toFixed(1) + "," + y.toFixed(1) + ") scale(" + richtung + ',1)" fill="' + tinte + '" opacity="0.72">' +
        '<ellipse rx="7.5" ry="3.2"/><path d="M6,0 L12,-4 L12,4 Z"/></g>';
    }
  }

  // Müll am Strand und an Land, gebündelt an den Verursachern.
  // Hinten liegende Teile zuerst, damit vordere sie überdecken.
  strandMuellListe(z).concat(landMuellListe(z)).sort(function (a, b) { return a.y - b.y; }).forEach(function (m) {
    s += muellSymbolSvg(m.form, m.x, m.y, m.winkel, m.groesse);
  });

  // Bereich der Runde: gestrichelte Umrandung in der Farbe des Bereichs (wie im Spaltenkopf der Ökologie)
  if (!z.beendet) s += bereichUmrandungSvg(regionDerRunde(z.runde));

  s += "</svg>";
  return s;
}

// Umriss von Land, Strand oder Meer, entlang derselben Küstenlinie wie die Karte.
// Der Umriss liegt eine halbe Linienbreite innerhalb des Kartenrands, damit er überall sichtbar bleibt.
function bereichUmrandungSvg(region) {
  const stil = BEREICH_STIL[region];
  const r = 1.5;
  const kante = function (versatz) {
    const p = [];
    for (let x = 0; x <= KARTE_B; x += 10) {
      p.push(begrenzen(x, r, KARTE_B - r) + "," + (kuestenlinie(x) + versatz).toFixed(1));
    }
    return p;
  };
  let punkte;
  if (region === "land") {
    punkte = [r + "," + r].concat(kante(-r), [(KARTE_B - r) + "," + r]);
  } else if (region === "strand") {
    punkte = kante(r).concat(kante(STRAND_BREITE - r).reverse());
  } else {
    punkte = kante(STRAND_BREITE + r).concat([(KARTE_B - r) + "," + (KARTE_H - r), r + "," + (KARTE_H - r)]);
  }
  return '<polygon points="' + punkte.join(" ") + '" fill="' + stil.farbe + '" fill-opacity="0.08" stroke="' +
    stil.farbe + '" stroke-width="2.6" stroke-dasharray="10 6" stroke-linejoin="round" pointer-events="none"/>';
}

function seekarteAnzeigen() {
  const z = zustand;
  el("seekarte").innerHTML = seekarteSvg(z);
  el("kartenStatus").textContent = z.beendet
    ? "Endstand nach " + RUNDEN + " Runden"
    : "Ökologie-Maßnahmen dieser Runde gelten für den Bereich " + bereichName(regionDerRunde(z.runde)) +
      " (auf der Karte gestrichelt umrandet). " + aktuellesLevel(z.runde).text;

  // Legende: nur Symbole, die gerade auf der Karte zu sehen sind
  const w = aktiveWirkung(z, Math.min(z.runde, RUNDEN));
  const arten = { plastik: false, glas: false, essen: false };
  strandMuellListe(z).concat(landMuellListe(z)).forEach(function (m) { arten[m.art] = true; });
  const eintraege = [
    [legendenSymbol("flasche", -20, 1.1), "Plastikmüll", arten.plastik],
    [legendenSymbol("scherbe", -15, 1.05), "Glas", arten.glas],
    [legendenSymbol("apfel", 0, 1.1), "Essensreste", arten.essen],
    [legendenSymbol("tuete", 10, 0.8), "Plastiktüte", treibgutAnzahl(z) > 0],
    [legendenSvg(muelleimerSvg(0, 0, "#12304A"), "-7 -12.5 14 13.5"), "Mülleimer", istUmgesetzt(z, "schilder")],
    [legendenSvg('<g fill="#12304A" opacity="0.72"><ellipse rx="7.5" ry="3.2"/><path d="M6,0 L12,-4 L12,4 Z"/></g>',
      "-8.5 -6 21 12"), "Fische", true],
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
// So folgen Quiz → Bericht → Zwischenbilanz → Ereignis aufeinander.
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
        "<p>Bringe die Region in einen guten Umweltzustand und <strong>halte diesen in den Runden " + zielFenster().von + " bis " + zielFenster().bis + " stabil</strong>. Dazu gehört mehr als saubere Strände: Auch Wirtschaft und Rückhalt der Bevölkerung müssen tragfähig bleiben.</p>" +
        "<p>Um das zu erreichen, setzt du jede Runde gezielte Maßnahmen um. Aber Vorsicht: Jede Entscheidung verändert das Gefüge vor Ort, und nicht jede Maßnahme wird bei allen gut ankommen.</p>" +
        "<p><strong>Die Endwertung:</strong><br>" +
        "• " + Math.round((1 - WISSEN_ANTEIL) * 100) + " % Nachhaltigkeitsscore: Wie genau folgst du dem Sollkurs, in allen drei Säulen?<br>" +
        "• " + Math.round(WISSEN_ANTEIL * 100) + " % Wissensscore aus den Quizfragen</p>"
    },
    {
      titel: "Drei Entscheidungen pro Runde",
      html:
        "<p>Nachhaltigkeit ruht auf drei Säulen. Pro Runde entscheidest du in jeder Säule einmal:</p>" +
        "<ul>" +
        "<li><strong>Ökologie:</strong> Schutz für Meer und Artenvielfalt. Der Bereich wechselt jede Runde: Strand, Meer, Land.</li>" +
        "<li><strong>Ökonomie:</strong> Tourismus und Wirtschaft füllen dein Budget, belasten aber oft das Meer.</li>" +
        "<li><strong>Soziales:</strong> Die Akzeptanz und Zufriedenheit der Bevölkerung.</li>" +
        "</ul>" +
        "<p><strong>Wichtige Regeln:</strong></p>" +
        "<ul>" +
        "<li>Du kannst in jedem Bereich auch diese Runde nichts machen und Budget sparen.</li>" +
        "<li>Strandmüll ist ein Bestand - jede Runde kommt neuer Müll aus drei Quellen hinzu.</li>" +
        "<li>Viele Maßnahmen wirken verzögert und auf mehrere Säulen zugleich.</li>" +
        "<li>Einschränkende Maßnahmen brauchen mindestens " + AKZEPTANZ_SPERRE + " % Akzeptanz, und sie kosten Zustimmung, die nicht von selbst zurückkommt.</li>" +
        "<li>Die schwächste Säule zählt doppelt: Wer eine Säule vernachlässigt, verliert Punkte, auch wenn die anderen glänzen.</li>" +
        "<li>In den Runden " + namenListe(OTTER_RUNDEN.map(String)) + " taucht unten links im Meer ein Otter auf. Klicke ihn an, wenn du wissen willst, wie du gerade stehst.</li>" +
        "</ul>"
    }
  ];
}

function einfuehrungZeigen(schrittNr) {
  const seiten = einfuehrungSeiten();
  einfuehrungSchritt = begrenzen(schrittNr, 0, seiten.length - 1);
  const seite = seiten[einfuehrungSchritt];
  el("einfuehrungTitel").innerHTML = seite.titel;
  el("einfuehrungInhalt").innerHTML = seite.html;
  el("einfuehrungPunkte").innerHTML = seiten.map(function (_, i) {
    return '<span class="' + (i === einfuehrungSchritt ? "aktiv" : "") + '"></span>';
  }).join("");
  el("einfuehrungZurueck").classList.toggle("unsichtbar", einfuehrungSchritt === 0);
  el("einfuehrungWeiter").textContent = einfuehrungSchritt === seiten.length - 1 ? "Spiel starten" : "Weiter";
  popupOeffnen("popupEinfuehrung");
}

function einfuehrungWeiter() {
  if (einfuehrungSchritt < einfuehrungSeiten().length - 1) {
    einfuehrungZeigen(einfuehrungSchritt + 1);
  } else {
    popupSchliessen("popupEinfuehrung");
  }
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
  zieleAnzeigen();
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
  const rw = bericht.richtwerte;
  let html = "";

  // Entscheidungen der drei Säulen
  html += '<section class="bericht-block"><h3>Deine Entscheidungen</h3>';
  bericht.entscheidungen.forEach(function (e) {
    html += '<div class="bericht-entscheidung">' +
      '<p class="bericht-saeule">' + e.saeule.name + "</p>";
    if (e.massnahme) {
      html += '<p class="bericht-massnahme">' + e.massnahme.name + "</p><p>" + e.erklaerung + "</p>";
    } else {
      html += '<p class="bericht-massnahme gedaempft">Zurückgestellt</p>';
    }
    html += "</div>";
  });
  html += "</section>";

  // Veränderungen: Balken wie im Spiel, die von „vorher“ nach „jetzt“ wandern
  html += '<section class="bericht-block"><h3>Was sich verändert hat</h3>' + veraenderungHtml(bericht) +
    '<p class="vb-legende"><span><span class="ziel-strich" aria-hidden="true"></span>Mindestwert</span>' +
    '<span><span class="vb-richtwert-zeichen" aria-hidden="true"></span>Richtwert, auf den die Kennzahl zustrebt</span>' +
    '<span><span class="vb-vorher-zeichen" aria-hidden="true"></span>Stand vorher</span></p>' +
    '<p class="klein">Jede Kennzahl bewegt sich pro Runde höchstens ' + MAX_AENDERUNG +
    " Punkte auf ihren Richtwert zu. Der Richtwert ergibt sich aus dem Zustand der Region.</p></section>";

  // Belastungen der Meeresgesundheit
  const b = rw.belastungen;
  const gesamt = b.muell + b.wasser + b.fischerei + b.klima;
  const teile = [
    { name: "Müll", wert: b.muell, klasse: "bl-muell" },
    { name: "Abwasser", wert: b.wasser, klasse: "bl-wasser" },
    { name: "Fischerei", wert: b.fischerei, klasse: "bl-fischerei" },
    { name: "Erwärmung", wert: b.klima, klasse: "bl-klima" }
  ];
  html += '<section class="bericht-block"><h3>Belastungen der Meeresgesundheit</h3>' +
    '<div class="belastung-balken">' + teile.map(function (t) {
      return '<span class="' + t.klasse + '" style="width:' + t.wert + '%"></span>';
    }).join("") + "</div>" +
    '<ul class="belastung-legende">' + teile.map(function (t) {
      return '<li><span class="lg ' + t.klasse + '" aria-hidden="true"></span>' + t.name + " " + t.wert + "</li>";
    }).join("") + "</ul>" +
    '<p class="klein">Richtwert der Meeresgesundheit = 100 − ' + gesamt + " = " + rw.meeresgesundheit +
    " %. Die Artenvielfalt folgt der Meeresgesundheit mit einer Runde Verzögerung.</p></section>";

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
    : bericht.zwischenbilanz ? "Zur Zwischenbilanz" : "Weiter zu Runde " + zustand.runde;
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
  const danach = function () {
    if (b && b.ereignis) ereignisZeigen(b.ereignis);
  };
  if (b && b.zwischenbilanz) {
    zwischenbilanzZeigen(b.zwischenbilanz, danach);
  } else {
    danach();
  }
}

// ---------- Zwischenbilanz ----------
function zwischenbilanzZeigen(zb, nachher) {
  let html = '<div class="zb-status zb-' + zb.status.id + '">' +
    '<p class="zb-titel">' + zb.status.titel + "</p><p>" + zb.status.text + "</p></div>";

  html += '<section class="bericht-block"><h3>Stand nach Runde ' + zb.runde + "</h3>" +
    '<table class="bericht-tabelle zb-tabelle"><thead><tr><th>Kennzahl</th><th>Start</th><th>jetzt</th>' +
    "<th>Soll nach Runde " + zb.runde + '</th><th>Kurs</th></tr></thead><tbody>';
  zb.punkte.forEach(function (p) {
    html += '<tr><th scope="row">' + p.name + "</th><td>" + zahl(p.start) + p.einheit + "</td><td><strong>" +
      zahl(p.wert) + p.einheit + "</strong></td><td>" + (p.hoeher ? "mind. " : "höchstens ") +
      zahl(p.grenze) + p.einheit + "</td>" +
      '<td class="' + (p.ok ? "trend-gut" : "trend-schlecht") + '">' + (p.ok ? "auf Kurs" : "zurück") + "</td></tr>";
  });
  html += '<tr><th scope="row">Budget</th><td>' + euro(STARTBUDGET) + "</td><td><strong>" + euro(zb.budget) +
    "</strong></td><td>nicht im Minus</td>" +
    '<td class="' + (zb.budgetOk ? "trend-gut" : "trend-schlecht") + '">' + (zb.budgetOk ? "auf Kurs" : "zurück") + "</td></tr>";
  html += "</tbody></table>" +
    '<p class="klein">Das Soll ist der Sollkurs, der auch in die Wertung eingeht: Wer ihm folgt, erreicht den guten ' +
    "Umweltzustand ab Runde " + zielFenster().von + ". Weil Maßnahmen verzögert wirken, steigt er anfangs flach. " +
    "Die Spalte „Soll“ zeigt die Grenze, bis zu der du noch als auf Kurs giltst.</p></section>";

  html += '<section class="bericht-block"><h3>Was du verbessern kannst</h3><ul class="liste-kompakt">' +
    zb.hinweise.map(function (h) { return "<li>" + h + "</li>"; }).join("") + "</ul>" +
    (zb.ausstehend
      ? '<p class="klein">' + zb.ausstehend + (zb.ausstehend === 1 ? " deiner Maßnahmen entfaltet ihre" :
        " deiner Maßnahmen entfalten ihre") + " Wirkung erst in den nächsten Runden.</p>"
      : "") +
    "</section>";

  el("zbTitel").textContent = "Zwischenbilanz nach Runde " + zb.runde;
  el("zbInhalt").innerHTML = html;
  el("zbInhalt").scrollTop = 0;
  popupOeffnen("popupZwischenbilanz", nachher);
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

function mindestLesezeit(text) {
  const woerter = text.trim().split(/\s+/).length;
  return Math.max(MINDEST_LESEZEIT, woerter / LESETEMPO);
}

// Öffnet das Anliegen. Es lässt sich nur einmal öffnen.
function anliegenOeffnen(index) {
  const a = zustand.anliegen[index];
  if (!a || a.gelesen) return;
  const p = PERSONEN[a.region];
  anliegenIndex = index;
  anliegenStart = Date.now();
  el("anliegenFigur").innerHTML = figurSvg(p.farbe);
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
  a.zuSchnell = sekunden < mindestLesezeit(a.text);
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
    "der Rundenbericht, die Zwischenbilanz und der Otter in den Runden " + namenListe(OTTER_RUNDEN.map(String)) + ". " +
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

function bewertungZeigen() {
  el("bewertungInhalt").innerHTML = bewertungHtml();
  popupOeffnen("popupBewertung");
}

// Startbildschirm: Spielinfo mit der Bewertung darunter
function spielinfoZeigen() {
  el("ueberBewertung").innerHTML = bewertungHtml();
  el("popupUeber").querySelector(".popup-inhalt").scrollTop = 0;
  popupOeffnen("popupUeber");
}

// ---------- Endauswertung ----------
const REIHEN = [
  { id: "meeresgesundheit", name: "Meeresgesundheit", farbe: "#1F6FB2" },
  { id: "artenvielfalt",    name: "Artenvielfalt",    farbe: "#2E8B57" },
  { id: "wirtschaft",       name: "Wirtschaft",       farbe: "#8A6D1F" },
  { id: "tourismus",        name: "Tourismus",        farbe: "#E8662A" },
  { id: "akzeptanz",        name: "Akzeptanz",        farbe: "#7A4FA0" }
];

// Liniendiagramm als SVG; Beschriftungen stehen außerhalb der Zeichenfläche
function diagrammSvg(verlauf, reihen, yMax, schwelle, schwelleFarbe) {
  const B = 960, H = 250, li = 44, re = 12, ob = 10, un = 30;
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
    s += '<text x="' + xPos(r) + '" y="' + (H - 8) + '" text-anchor="middle" class="achse">' + r + "</text>";
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
  const ziel = zielAuswertung(z);
  let html = "";

  html += '<div class="ergebnis ' + (ziel.erreicht ? "ergebnis-ok" : "ergebnis-offen") + '">' +
    '<div class="ergebnis-score"><span class="ergebnis-zahl">' + zahl(ende, 1) + "</span>" +
    '<span class="ergebnis-einheit">Endergebnis von 100</span></div>' +
    '<div class="ergebnis-text"><p class="ergebnis-titel">' +
    (ziel.erreicht ? "Guter Umweltzustand erreicht" : "Guter Umweltzustand nicht erreicht") + "</p>" +
    "<p>" + (ziel.erreicht
      ? "Du hast alle Mindestbedingungen in den Runden " + (RUNDEN - ZIEL_RUNDEN + 1) + " bis " + RUNDEN + " gehalten."
      : "Diese Bedingungen waren in den Runden " + (RUNDEN - ZIEL_RUNDEN + 1) + " bis " + RUNDEN + " nicht durchgehend erfüllt: " +
        ziel.details.filter(function (d) { return !d.erfuellt; }).map(function (d) { return d.ziel.text; }).join("; ") + ".") +
    "</p>" +
    '<p class="ergebnis-teile">Nachhaltigkeit <strong>' + zahl(nachhaltigkeit, 1) + "</strong> × " +
    Math.round((1 - WISSEN_ANTEIL) * 100) + " % + Wissen <strong>" + (wissen === null ? "–" : zahl(wissen, 1)) +
    "</strong> × " + Math.round(WISSEN_ANTEIL * 100) + " %</p>" +
    "</div></div>";

  // Vergleich mit „Weiter so“ und Säulen im Verlauf
  const bau = weiterSoVerlauf();
  const bauEnde = bau.verlauf[bau.verlauf.length - 1];
  const dein = z.verlauf[z.verlauf.length - 1];
  const vorsprung = runden1(nachhaltigkeit - bau.score);
  const saeulenReihen = z.verlauf.map(function (v, i) {
    return { runde: v.runde, oeko: v.saeulen.oeko, oekonomie: v.saeulen.oekonomie, sozial: v.saeulen.sozial,
      score: v.score, bau: bau.verlauf[i].score };
  });
  const SAEULEN_REIHEN = [
    { id: "oeko", name: "Ökologie", farbe: "#2E8B57" },
    { id: "oekonomie", name: "Ökonomie", farbe: "#1D4F8C" },
    { id: "sozial", name: "Soziales", farbe: "#7A4FA0" },
    { id: "score", name: "Rundenscore", farbe: "#12304A", dick: true },
    { id: "bau", name: "„Weiter so“ (ohne Maßnahmen)", farbe: "#E8662A", gestrichelt: true }
  ];
  html += '<section class="bericht-block"><h3>Dein Weg im Vergleich zu „Weiter so“</h3>' +
    '<div class="vergleich-kasten"><p>Ohne eine einzige Maßnahme hätte die Region <strong>' + zahl(bau.score, 1) +
    "</strong> Punkte erreicht (Ökologie " + zahl(bau.saeulen.oeko) + ", Ökonomie " + zahl(bau.saeulen.oekonomie) +
    ", Soziales " + zahl(bau.saeulen.sozial) + "). Du hast <strong>" + zahl(nachhaltigkeit, 1) + "</strong> erreicht: " +
    "<strong>" + vorzeichen(vorsprung) + "</strong> Punkte.</p>" +
    "<p>Ohne Eingreifen stünde die Region in Runde " + RUNDEN + " bei Meeresgesundheit " + bauEnde.meeresgesundheit +
    " %, Strandmüll " + zahl(bauEnde.strandmuell) + " Teilen und Akzeptanz " + bauEnde.akzeptanz +
    " %. Bei dir: Meeresgesundheit " + dein.meeresgesundheit + " %, Strandmüll " + zahl(dein.strandmuell) +
    " Teile, Akzeptanz " + dein.akzeptanz + " %.</p></div>" +
    '<div class="diagramm">' + diagrammSvg(saeulenReihen, SAEULEN_REIHEN, 100, null, "#12304A") + "</div>" +
    '<ul class="diagramm-legende">' + SAEULEN_REIHEN.map(function (r) {
      return '<li><span class="linie' + (r.gestrichelt ? " gestrichelt orange" : "") + '"' +
        (r.gestrichelt ? "" : ' style="background:' + r.farbe + '"') + "></span>" + r.name + "</li>";
    }).join("") + "</ul>" +
    '<p class="klein">Die Linien zeigen, wie nah jede Säule am Sollkurs war (100 = auf oder über dem Kurs).</p></section>';

  html += '<section class="bericht-block"><h3>Verlauf der Kennzahlen</h3>' +
    '<div class="diagramm">' + diagrammSvg(z.verlauf, REIHEN, 100, GUTER_ZUSTAND.meeresgesundheit, "#12304A") + "</div>" +
    '<ul class="diagramm-legende">' + REIHEN.map(function (r) {
      return '<li><span class="linie" style="background:' + r.farbe + '"></span>' + r.name + "</li>";
    }).join("") + '<li><span class="linie gestrichelt"></span>Mindestwert Meeresgesundheit und Artenvielfalt ' +
    GUTER_ZUSTAND.meeresgesundheit + " %</li></ul></section>";

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

  html += '<section class="bericht-block"><h3>Strandmüll in Teilen pro 100 m</h3>' +
    '<div class="diagramm">' + diagrammSvg(z.verlauf, [{ id: "strandmuell", farbe: "#C8382E" }], 300, MUELL_SCHWELLE, "#2E8B57") + "</div>" +
    '<ul class="diagramm-legende"><li><span class="linie" style="background:#C8382E"></span>Strandmüll</li>' +
    '<li><span class="linie gestrichelt gruen"></span>EU-Schwellenwert 20</li></ul></section>';

  // Wissen
  const freiwillige = INFOPUNKTE.filter(function (p) { return p.runde !== INFOPUNKT_PFLICHT_RUNDE; });
  const freiwilligGelesen = freiwillige.filter(function (p) { return infopunktGelesen(z, p.id); }).length;
  html += '<section class="bericht-block"><h3>Dein Wissen</h3>' +
    "<p>Du hast <strong>" + z.quiz.richtig + " von " + z.quiz.gestellt + "</strong> Quizfragen richtig " +
    "beantwortet und <strong>" + freiwilligGelesen + " von " + freiwillige.length +
    "</strong> freiwilligen Infopunkten gelesen.</p></section>";

  // Deine Entscheidungen
  const entscheidungen = [];
  for (const id in z.umgesetzt) {
    const m = massnahmeFinden(id);
    z.umgesetzt[id].forEach(function (r) {
      entscheidungen.push({ runde: r, name: m.name, saeule: saeuleFinden(m.saeule).name });
    });
  }
  entscheidungen.sort(function (a, b) { return a.runde - b.runde; });
  html += '<section class="bericht-block"><h3>Deine Entscheidungen</h3>' +
    (entscheidungen.length
      ? '<ol class="entscheidungen">' + entscheidungen.map(function (e) {
          return '<li><span class="runde-marke">Runde ' + e.runde + "</span>" + e.name +
            ' <span class="gedaempft">(' + e.saeule + ")</span></li>";
        }).join("") + "</ol>"
      : "<p>Du hast keine Maßnahme umgesetzt.</p>") + "</section>";

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
// Ablauf: Name bestätigen → ladebildschirmStarten() → genau LADEBILDSCHIRM.gesamtDauer (12 s) lang
// Meeresfakten → danach startet das Spiel (Einführung).
//
// Zwei voneinander unabhängige Uhren:
//   1. Gesamtuhr  (gesamtDauer, 12 s): startet einmal und wird NIE verlängert oder verkürzt.
//                 Sie steuert den großen Ladebalken und das Ende des Ladebildschirms.
//   2. Faktuhr    (faktDauer, 4 s): läuft pro Fakt. Ist sie abgelaufen, erscheint der nächste Fakt.
//                 Beim Überspringen startet sie sofort neu. Ohne Eingriff: Fakt 1 bei 0 s,
//                 Fakt 2 bei 4 s, Fakt 3 bei 8 s, Ende bei 12 s.
//
// Die Uhren laufen über setTimeout und Zeitstempel (performance.now), nicht über die Bildrate.
// requestAnimationFrame zeichnet nur die Balken. So bleiben die 12 s auch bei ruckelnder
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
//   anzahl       wie viele Fakten in dieser Ladung schon gezeigt wurden (für „Fakt 2“)
//   endeTimer    setTimeout-ID der Gesamtuhr
//   faktTimer    setTimeout-ID der Faktuhr
//   schleife     requestAnimationFrame-ID der Zeichenschleife
//   abbruch      AbortController der Eingabe-Listener
//   stapel       gemischte Fakten; gezogen wird von oben, leer → neu mischen.
//                So wiederholt sich kein Fakt, bevor alle einmal dran waren.
//   fertig       Rückruf, der genau einmal nach Ablauf der 12 s läuft
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

// Anteil 0…1 der verstrichenen Zeit des aktuellen Fakts (für die Faktuhr in der Karte)
function faktFortschritt(seitFaktStart, einstellung) {
  const e = einstellung || LADEBILDSCHIRM;
  return Math.min(1, Math.max(0, seitFaktStart / e.faktDauer));
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

// Trennstriche im großen Balken: dort wechselt der Fakt, wenn niemand überspringt (4 s, 8 s)
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
  ladeFaktZeigen(lade.fakt, lade.anzahl);
  lade.faktTimer = setTimeout(ladeNaechsterFakt, LADEBILDSCHIRM.faktDauer);
}

function ladeFaktZeigen(f, nummer) {
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
  el("ladeNummer").textContent = "Fakt " + nummer;
  karte.classList.add("fakt-ein");
}

// Zeichenschleife: rechnet nichts fort, sondern liest nur die Uhren ab
function ladeSchleife(zeit) {
  if (!lade.aktiv) return;
  ladeZeichnen(zeit);
  lade.schleife = requestAnimationFrame(ladeSchleife);
}

// Zeichnet großen Balken, Prozentzahl, Statuszeile und Faktuhr für den Zeitpunkt "jetzt"
function ladeZeichnen(jetzt) {
  const verstrichen = jetzt - lade.startZeit;
  const gesamt = ladeGesamtFortschritt(verstrichen);
  el("ladeFuellung").style.transform = "scaleX(" + gesamt.toFixed(4) + ")";
  el("ladeFaktUhr").style.transform = "scaleX(" + (1 - faktFortschritt(jetzt - lade.faktStart)).toFixed(4) + ")";

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
// Die Gesamtuhr bleibt unberührt, das Ende nach 12 s verschiebt sich also nicht.
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
    zbWeiter: function () { popupFertig("popupZwischenbilanz"); },
    quizWeiter: quizWeiter,
    infoKnopf: budgetZeigen,
    muellInfoKnopf: muellPopupZeigen,
    bewertungKnopf: bewertungZeigen,
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
    budgetSchliessen: "popupBudget", bewertungSchliessen: "popupBewertung",
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
  // und ladeAufraeumen() nach Ablauf der 12 s wieder ab (siehe ladeListenerAnmelden).
}

// Prüft, ob index.html und style.css zur Version dieses Skripts passen.
// Passt etwas nicht (z. B. alte Datei oder Browser-Cache), erscheint ein Hinweis statt einer kaputten Seite.
const BENOETIGTE_ELEMENTE = ["anzeigeWissen", "auswahlUebersicht", "popupInfo", "infoOk", "popupQuiz",
  "quizWeiter", "popupZwischenbilanz", "zbWeiter", "massnahmenListe", "personen", "muellInfoKnopf",
  "popupMuell", "muellInhalt", "muellSchliessen", "entscheidungen", "startSzene", "startBilder", "ladebildschirm",
  "ladeKarte", "ladeFuellung", "ladeBalken", "ladeMarken", "ladeFaktUhr", "ladeWeiter", "startVollbild", "popupQuellen", "popupUeber", "bildNachweis", "ueberBewertung", "startSonne", "startWolken", "startMeer", "startWindsack", "startHalme",
  "popupOtter", "otterOk", "otterInhalt", "zielZusatz"];

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
    ladeGesamtFortschritt: ladeGesamtFortschritt, faktFortschritt: faktFortschritt, ladePhase: ladePhase,
    naechsterFakt: naechsterFakt, faktenZiehen: faktenZiehen
  };

}