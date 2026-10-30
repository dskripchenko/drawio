# Security policy

draw.io files are often made by someone other than the person viewing them.
The package is built so that a file can never become active content in the
viewer's page.

## What is guaranteed

- **No markup from text.** Labels are HTML in draw.io; here they are read
  as text with a few styles (bold, italic, underline, colour, size, line
  breaks). No tag or attribute of a label reaches the output. Every string
  is escaped by the one SVG builder that produces it.
- **No external content.** A document type declaration with an internal
  subset is refused, so there are no entities to expand. Images are shown
  only when embedded in the file (`data:image/…`); addresses on the web are
  loaded only with `allowExternalImages`.
- **Styles are filtered.** Colours must be hex values, names or
  `rgb()`/`hsl()` of numbers; font names letters and spaces; dash patterns
  numbers. Nothing from a style can add a rule or load a resource.
- **Links are filtered.** Only `http:`, `https:`, `mailto:`, relative
  addresses and anchors; links opening a new tab get
  `rel="noopener noreferrer"`.
- **Bounded work.** XML size, element count and nesting are capped; a
  compressed page may not expand beyond 50 MB (`maxPageSize`).

The SVG returned by `render` is therefore safe to insert with `innerHTML`
without a sanitiser.

## Supported versions

The latest minor version of the current major receives security fixes.

## Reporting a vulnerability

Please report privately through GitHub's
[security advisories](https://github.com/dskripchenko/drawio/security/advisories/new)
rather than a public issue. Include a file that reproduces the problem. You
will get an answer within a few days.
