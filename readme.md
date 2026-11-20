# QNX Codelabs

Found within this repo is the source code for the QNX codelabs hosted at https://qnx.github.io/codelabs/.
Follow [`Create your OWn Codelab and Contribute to QNX`](https://qnx.github.io/codelabs/codelab-to-create-codelab/#0) for contributions.


## Metadata standard

Every codelab starts with a metadata block (see [`markdown/markdown-template.md`](markdown/markdown-template.md)). The landing page uses these fields:

| Key | Required | Value |
|---|---|---|
| `id` | yes | Same as the `.md` filename. It becomes the URL `docs/<id>/`. |
| `categories` | yes | 1–2 **topics** as display labels, e.g. `AI & ML, Camera & Sensors`. These become the Topic filters, and a new label becomes a new filter automatically. |
| `tags` | yes | Exactly one **level**: `beginner`, `intermediate` or `advanced`. |
| `platforms` | no | Hardware or host, e.g. `Raspberry Pi 5, QEMU`. These become the Platform filters. |
| `published` | yes | `YYYY-MM-DD`, set once when first published and never changed. It drives the newest-first order and the "New" badge. |
| `featured` | no | `true` shows the codelab in the Featured row (max 3). Defaults to `false`. |
| `status` | yes | `published`, or `draft`/`hidden` to keep it off the landing page. |

## Rendering

```bash
claat export -f html -o docs ./markdown/<folder>/<file>.md   # render one codelab
node generate-codelabs.js                                    # rebuild docs/codelabs-list.js
node --test 'test/*.test.js'                                 # run the landing page tests
```

Changing only metadata such as `featured` or `published` doesn't need a re-export. Rerun `node generate-codelabs.js`.
