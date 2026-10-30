# @dskripchenko/drawio

draw.io (diagrams.net) files to SVG — with **no runtime dependencies and no
DOM**.

```ts
import { render } from '@dskripchenko/drawio'

const { svg, pages } = render(fileText, { page: 0 })
element.innerHTML = svg
```

- **Every way the file comes**: `.drawio` with any number of pages, each
  compressed or plain, a bare `<mxGraphModel>`, and an SVG exported with the
  diagram inside (`.drawio.svg`). Decompression is built in.
- **The general and flowchart libraries**: rectangles (rounded, gradients,
  dashes, rotation), ellipses, rhombuses, triangles, hexagons,
  parallelograms, cylinders, documents, clouds, processes, notes, cards,
  callouts, people, steps, delays, block arrows, swimlanes, tables, text,
  embedded images and more.
- **Connectors**: straight, orthogonal, elbow and entity-relation routing,
  waypoints, rounded and curved lines, fixed ports, the arrowheads of
  draw.io (classic, block, open, oval, diamond, the ER crow's feet…),
  labels.
- **Containers, groups and layers**; hidden layers stay hidden.
- **Safe to insert**: HTML in labels never becomes markup — bold, italic,
  colour and line breaks are kept, the rest is dropped; colours are
  validated; links are filtered; remote images are not loaded unless
  allowed; shapes of vendor libraries (`mxgraph.aws4.*`…) are drawn as
  labelled placeholders.

## Documentation

- [Getting started](docs/en/getting-started.md)
- Русский: [начало работы](docs/ru/getting-started.md)
- Deutsch: [Erste Schritte](docs/de/getting-started.md)
- 中文：[快速开始](docs/zh/getting-started.md)

## License

MIT
