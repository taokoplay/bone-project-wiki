# HTML attachment preview

Status: HTML attachment reading shipped in 0.2.1; full-pane presentation and non-destructive activation synchronization are included in 0.2.2. No additional permissions or record-format changes are introduced.

## Behavior

A raw `.html` or `.htm` file discovered inside a knowledge category remains an attachment, with its original filename and path. An explicit read adds a derived `htmlPreview` containing the entry filename, source files and any missing optional resources. The same projection is provided for managed attachment records containing HTML source files. Existing prototype records keep their normal preview behavior. No eager reindex, record conversion or source rewrite is required.

The renderer displays the page through the same `buildPrototype` sanitizer and opaque-origin `sandbox="allow-scripts"` iframe used by prototypes. Full source data is not put into the panel DOM. System open and reveal actions remain available. Preview data is omitted from summaries and persisted metadata.

HTML documents, managed attachments and prototypes fill the entire right content pane. The panel adds no file heading, padding, border, corner radius or fixed minimum preview height around a healthy page. The iframe follows the pane's current width and height and owns document scrolling. Markdown and other assets retain their existing content spacing.

A compact floating disclosure provides system-open/reveal actions when available, plus preview limitations. It supports keyboard activation and Escape. Opening it does not resize or reload the page. Resource warnings remain visible above the remaining preview; read failures and limits display an alert and preserve file actions.

## Local resources and limits

Raw HTML source is loaded only after a host filesystem stat and workspace check. Resource discovery finds local stylesheet links, classic script sources, image sources and CSS image URLs. References are decoded and normalized relative to their source file. Only references that remain lexically within the HTML file's directory are eligible; absolute paths, protocol URLs, controls, backslashes, dotfiles and escaping traversal are rejected before I/O. Reads retain the host filesystem permission and symlink checks. No host sandbox or filesystem rule is bypassed.

The bundle contains at most 100 files and 10 MiB of actual source/image bytes. Metadata is checked before reading and actual payload sizes are checked afterward, so file growth or a stale size cannot silently bypass the aggregate limit. Source dependencies are loaded once. PNG, JPEG, WEBP and GIF image data use the existing host preview API. Missing optional assets are listed while readable HTML remains visible. Root read failure and bundle limits produce explicit localized notices and preserve the attachment record and external open actions.

Managed attachments reuse their stored bundle and do not discover additional filesystem sources. Their existing prototype validation enforces source paths and bundle limits.

## Isolation and lifecycle

The existing sanitizer and CSP are preserved: no same-origin access to the panel, no plugin bridge, network requests, remote resources, popups, form submission, module imports or child frames. Preview remains suited to self-contained documents and classic local interactions. It does not provide an unrestricted browser for applications with external dependencies.

All asynchronous host reads check the expected workspace before returning. Project switches cannot display results from the old project. Returning focus from an iframe within the same document does not trigger activation synchronization. Real activation checks external changes in the background without clearing the tree or current selection. Results cannot replace a held pointer target, newer input/navigation, an editor draft or another project's view; unchanged readers and iframe interactions remain intact. Event listeners are disposed when the panel closes. Explicit refresh retains the full reload path.

## Verification

- `html-preview.test.cjs` covers raw Chinese paths, cached attachment records, uppercase HTM, managed HTML attachments, local CSS/JS/images, rejected remote/absolute/traversal references, missing assets, read failure, count/size limits, non-persisted preview projection and workspace changes.
- `tests/html-flow.py` uses the real panel, service and temporary filesystem. It verifies visible content, CSS/scripts/images, interaction, panel isolation, blocked fetch, source reload, managed attachments and prototypes, warnings/errors, all four preview edges matching the pane at several sizes, internal scrolling, keyboard/file actions and restored Markdown read/edit spacing.
- `tests/focus-flow.py` reproduces activation between a physical mouse press and release, then verifies one-click opening, late sync/read results, selection/editor retention, external updates and input during a pending snapshot. `renderer/focus-refresh.test.mjs` covers request ordering, project changes, pointer/input guards, iframe focus, disposal and observable failures.
- Existing service, memory, extension-loader, CDP panel and full editor flows remain required regressions.

No user-owned HTML file is altered by validation, and no running installation or market release is replaced as part of local candidate verification.
