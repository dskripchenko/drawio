# Getting started

```sh
npm install @dskripchenko/drawio
```

```ts
import { render } from '@dskripchenko/drawio'

const { svg, width, height, page, pages, warnings } = render(fileText)
container.innerHTML = svg
```

`render` takes the text of a `.drawio` file — compressed or plain pages — a
bare `<mxGraphModel>`, or an SVG exported with the diagram inside
(`.drawio.svg`), and draws one page.

| Field      | What it is                                                         |
| ---------- | ------------------------------------------------------------------ |
| `svg`      | The drawing, a complete `<svg>` element as text                    |
| `width`    | Its width in pixels                                                |
| `height`   | Its height in pixels                                               |
| `page`     | The page drawn: `{ index, id, name }`                              |
| `pages`    | The names of all pages, for a page switcher                        |
| `warnings` | What became a placeholder: vendor shapes, images not in the file   |

## Options

```ts
render(fileText, {
  page: 'Architecture', // index, id or name; the first page by default
  title: 'Order flow', // accessible title; defaults to the page name
  idPrefix: 'flow', // ids inside the SVG; unique on the page when a file is shown twice
  padding: 10,
  measureText, // how text is measured; a canvas in the browser by default
  allowExternalImages: false, // load images from http(s) addresses
  limits: { maxLength: 5_000_000 }, // XML limits
  maxPageSize: 10_000_000, // bytes a compressed page may expand to
})
```

## What is drawn

Shapes of the general and flowchart libraries — rectangles, ellipses,
rhombuses, triangles, hexagons, parallelograms, trapezoids, cylinders,
documents, clouds, processes, notes, cards, callouts, people, steps,
delays, displays, data stores, block arrows, crosses, swimlanes (horizontal
and vertical), tables, text, lines — with fills, gradients, strokes,
dashes, opacity, rotation and flips. Connectors with straight, orthogonal,
elbow and entity-relation routing, waypoints, rounded and curved lines,
fixed ports and draw.io's arrowheads, with their labels. Containers,
groups and layers; hidden layers and collapsed containers' contents stay
hidden. Tooltips and links of `UserObject`s, and `%placeholders%` in labels.

Shapes of vendor libraries (`mxgraph.aws4.*`, `mxgraph.azure.*`, …) are not
drawn — their pictures belong to their owners — but shown as a dashed box
with the shape's name.

## Theming

Colours the file sets are drawn as set. Where it leaves the defaults, CSS
custom properties apply, so a page can show such diagrams in a dark theme:

| Variable                     | Default     | Used for                         |
| ---------------------------- | ----------- | -------------------------------- |
| `--drawio-font-family`       | Helvetica…  | Text without a font of its own   |
| `--drawio-background`        | transparent | Behind the drawing               |
| `--drawio-fill`              | `#ffffff`   | Default fill                     |
| `--drawio-stroke`            | `#000000`   | Default lines                    |
| `--drawio-text`              | `#000000`   | Default text                     |
| `--drawio-label-background`  | `#ffffff`   | Behind connector labels          |
| `--drawio-placeholder`       | `#9ca3af`   | Placeholders                     |

Text on a shape the file filled keeps the file's text colour, so it stays
readable on that fill in any theme.

## Reading the model

```ts
import { parseDrawio } from '@dskripchenko/drawio'

const file = parseDrawio(fileText)
file.pages[0].cells.get('api') // { id, parent, value, style, vertex, edge, geometry, data, … }
```

Errors are `DrawioError`, with the line and column of the fault when there is one.
