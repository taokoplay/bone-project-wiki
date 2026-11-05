# Markdown reading and editing

## User behavior

Opening an existing Markdown document, standalone memory, or handoff starts in
read-only mode. The content is formatted as a document, with an explicit **Edit
record** button. Creating a new record starts in source editing mode and keeps
the existing debounced automatic save behavior.

**Read mode** waits for the latest source input to save before displaying the
formatted document. Inputs made during an in-flight save or snapshot remain in
the editor and save against the returned revision. A failed save or revision
conflict leaves the editor and its draft intact. The existing workspace/session
change and unload guards still apply. Changing modes on the same document
preserves an unfinished document-memory association form.

The viewer supports CommonMark-style headings, paragraphs, emphasis, strong text,
strikethrough, inline/fenced/indented code, ordered and unordered nested lists,
blockquotes, horizontal rules, reference links, GFM tables and disabled task
checkboxes. Tables and code blocks scroll horizontally within the document.
Typography, borders, colors and controls follow the host light/dark theme.

Ordinary `.md` files copied into the knowledge directory use the same viewer.
Reading alone does not rewrite, convert or move those files. Source editing
continues to use the existing save/identity/revision contracts.

Linked memory summaries remain read-only projections. Only a verified current
source can supply their rendered summary. Non-current sources withhold the old
summary and keep the current-source navigation/status card.

## Rendering boundary

The bundled Marked 16.4.2 lexer parses syntax locally; no runtime dependency
installation or CDN request is needed. Its tokens are rendered through a small
allowlist of DOM constructors. Source HTML is displayed literally and is never
inserted into the active panel DOM. Only HTTP, HTTPS, mailto and fragment links
receive an `href`; external links use a separate context with
`noopener noreferrer`. Unsupported link targets remain ordinary text.

Embedded PNG/JPEG/WebP/GIF data images can display. Relative/remote images retain
their alternative text and source hint without automatically reading files or
making network requests. SVG/data-HTML images, scripts, styles and arbitrary HTML
are not activated. Markdown reading does not change the existing HTML iframe
sandbox, filesystem permissions or memory retrieval rules.

`renderer/marked.mjs` is the unmodified upstream ESM distribution, pinned to
16.4.2 (SHA-256
`6540aa2544be84b3abdd9424fa287120e9ed7c7600512dd92c097493121a5951`).
`THIRD_PARTY_LICENSES.md` ships with the runtime. To reproduce the vendor copy
from an existing provisioned package, run:

```bash
node scripts/vendor-markdown.mjs /path/to/marked
```

## Acceptance

`tests/markdown-flow.py` uses the real panel, service and temporary filesystem to
verify ordinary and managed Markdown reading, rich formatting, HTML/URL safety,
source edit/save/read/reload, inputs during a held write or snapshot, conflict
draft retention and theme/responsive overflow. Existing standalone browser and
memory flows verify workspace/session isolation, document association drafts,
source navigation and stale-summary withholding. `tests/html-flow.py` protects
the HTML preview path.
