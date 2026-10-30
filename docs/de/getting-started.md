# Erste Schritte

```sh
npm install @dskripchenko/drawio
```

```ts
import { render } from '@dskripchenko/drawio'

const { svg, width, height, page, pages, warnings } = render(fileText)
container.innerHTML = svg
```

`render` nimmt den Text einer `.drawio`-Datei — mit komprimierten oder
einfachen Seiten —, ein bloßes `<mxGraphModel>` oder ein mit dem Diagramm
exportiertes SVG (`.drawio.svg`) und zeichnet eine Seite.

| Feld       | Bedeutung                                                              |
| ---------- | ---------------------------------------------------------------------- |
| `svg`      | Die Zeichnung, ein vollständiges `<svg>`-Element als Text              |
| `width`    | Breite in Pixeln                                                       |
| `height`   | Höhe in Pixeln                                                         |
| `page`     | Die gezeichnete Seite: `{ index, id, name }`                           |
| `pages`    | Die Namen aller Seiten, für eine Seitenauswahl                         |
| `warnings` | Was zum Platzhalter wurde: Herstellerformen, Bilder außerhalb der Datei |

## Optionen

```ts
render(fileText, {
  page: 'Architecture', // Index, id oder Name; standardmäßig die erste Seite
  title: 'Bestellablauf', // barrierefreier Titel; standardmäßig der Seitenname
  idPrefix: 'flow', // ids im SVG; eindeutig, wenn eine Datei zweimal auf der Seite steht
  padding: 10,
  measureText, // wie Text gemessen wird; im Browser standardmäßig per Canvas
  allowExternalImages: false, // Bilder von http(s)-Adressen laden
  limits: { maxLength: 5_000_000 }, // XML-Grenzen
  maxPageSize: 10_000_000, // auf wie viele Bytes eine komprimierte Seite anwachsen darf
})
```

## Was gezeichnet wird

Formen der allgemeinen und der Flussdiagramm-Bibliotheken — Rechtecke,
Ellipsen, Rauten, Dreiecke, Sechsecke, Parallelogramme, Trapeze, Zylinder,
Dokumente, Wolken, Prozesse, Notizen, Karten, Sprechblasen, Personen,
Schritte, Verzögerungen, Anzeigen, Datenspeicher, Blockpfeile, Kreuze,
Swimlanes (horizontal und vertikal), Tabellen, Text, Linien — mit Füllungen,
Verläufen, Linien, Strichelung, Deckkraft, Drehung und Spiegelung.
Verbinder mit gerader, orthogonaler, Knie- und ER-Führung, Wegpunkten,
abgerundeten und gekrümmten Linien, festen Anschlusspunkten und den
Pfeilspitzen von draw.io, samt Beschriftungen. Container, Gruppen und
Ebenen; ausgeblendete Ebenen und der Inhalt zugeklappter Container bleiben
verborgen. Tooltips und Links von `UserObject`s sowie `%Platzhalter%` in
Beschriftungen.

Formen von Herstellerbibliotheken (`mxgraph.aws4.*`, `mxgraph.azure.*`, …)
werden nicht gezeichnet — ihre Bilder gehören ihren Eigentümern —, sondern
als gestrichelter Kasten mit dem Namen der Form gezeigt.

## Gestaltung

Farben, die die Datei setzt, werden so gezeichnet. Wo sie die Standardwerte
lässt, gelten CSS-Variablen, sodass eine Seite solche Diagramme in einem
dunklen Thema zeigen kann:

| Variable                     | Standard    | Wofür                              |
| ---------------------------- | ----------- | ---------------------------------- |
| `--drawio-font-family`       | Helvetica…  | Text ohne eigene Schrift           |
| `--drawio-background`        | transparent | Hintergrund der Zeichnung          |
| `--drawio-fill`              | `#ffffff`   | Standardfüllung                    |
| `--drawio-stroke`            | `#000000`   | Standardlinien                     |
| `--drawio-text`              | `#000000`   | Standardtext                       |
| `--drawio-label-background`  | `#ffffff`   | Hinter Verbinderbeschriftungen     |
| `--drawio-placeholder`       | `#9ca3af`   | Platzhalter                        |

Text auf einer Form, die die Datei gefüllt hat, behält die Textfarbe der
Datei, damit er auf dieser Füllung in jedem Thema lesbar bleibt.

## Das Modell lesen

```ts
import { parseDrawio } from '@dskripchenko/drawio'

const file = parseDrawio(fileText)
file.pages[0].cells.get('api') // { id, parent, value, style, vertex, edge, geometry, data, … }
```

Fehler sind `DrawioError`, mit Zeile und Spalte, wenn bekannt.
