# QNX Codelabs

Found within this repo is the source code for the QNX codelabs hosted at https://qnx.github.io/codelabs/.

## Layout

- `markdown/` - the codelab sources. Each codelab is a markdown file with a metadata header. This is the source of truth.
- `docs/` - the generated site (rendered HTML and `codelab.json` per codelab, plus the catalogue). Served by GitHub Pages.

## Building a codelab

Codelabs are written in markdown and rendered with [claat](https://github.com/googlecodelabs/tools), Google's Codelabs authoring tool.

Install claat once (requires Go):

```bash
go install github.com/googlecodelabs/tools/claat@latest
```

Export a codelab to rendered HTML. Use an absolute path to the markdown file; a relative path makes claat treat the argument as a Google Drive ID and return a 404:

```bash
claat export /absolute/path/to/markdown/<codelab>/<codelab>.md
```

This creates an output folder named after the `id` field in the markdown header (not the filename), containing `index.html` and `codelab.json`. Preview locally with:

```bash
claat serve
```

## Adding a new codelab

1. Write your codelab as a markdown file under `markdown/`, with the standard metadata header (`id`, `title`, `summary`, `categories`, `tags`, `difficulty`, `status`, `authors`, `feedback_link`). The `id` becomes the output folder name, so keep it unique and URL-safe.
2. Export it with `claat export` (above).
3. Regenerate the catalogue so the new codelab appears on the landing page:

```bash
node generate-codelabs.js
```

The markdown under `markdown/` is the source of truth. The rendered output is generated from it, so edit the markdown, not the generated files.

_Coming soon: contribution process and contributor guidelines._
