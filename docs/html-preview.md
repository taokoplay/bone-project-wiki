# HTML attachment preview

Status: implementation candidate, 0.2.1. This change fixes ordinary HTML attachments that previously displayed only a file card. It does not add permissions or change existing record formats.

## Behavior

A raw `.html` or `.htm` file discovered inside a knowledge category remains an attachment, with its original filename and path. An explicit read adds a derived `htmlPreview` containing the entry filename, source files and any missing optional resources. The same projection is provided for managed attachment records containing HTML source files. Existing prototype records keep their normal preview behavior. No eager reindex, record conversion or source rewrite is required.

The renderer displays the page through the same `buildPrototype` sanitizer and opaque-origin `sandbox="allow-scripts"` iframe used by prototypes. Full source data is not put into the panel DOM. System open and reveal actions remain available. Preview data is omitted from summaries and persisted metadata.

## Local resources and limits

Raw HTML source is loaded only after a host filesystem stat and workspace check. Resource discovery finds local stylesheet links, classic script sources, image sources and CSS image URLs. References are decoded and normalized relative to their source file. Only references that remain lexically within the HTML file's directory are eligible; absolute paths, protocol URLs, controls, backslashes, dotfiles and escaping traversal are rejected before I/O. Reads retain the host filesystem permission and symlink checks. No host sandbox or filesystem rule is bypassed.

The bundle contains at most 100 files and 10 MiB of actual source/image bytes. Metadata is checked before reading and actual payload sizes are checked afterward, so file growth or a stale size cannot silently bypass the aggregate limit. Source dependencies are loaded once. PNG, JPEG, WEBP and GIF image data use the existing host preview API. Missing optional assets are listed while readable HTML remains visible. Root read failure and bundle limits produce explicit localized notices and preserve the attachment record and external open actions.

Managed attachments reuse their stored bundle and do not discover additional filesystem sources. Their existing prototype validation enforces source paths and bundle limits.

## Isolation and lifecycle

The existing sanitizer and CSP are preserved: no same-origin access to the panel, no plugin bridge, network requests, remote resources, popups, form submission, module imports or child frames. Preview remains suited to self-contained documents and classic local interactions. It does not provide an unrestricted browser for applications with external dependencies.

All asynchronous host reads check the expected workspace before returning. Project switches cannot display results from the old project. Returning focus from an iframe within the same document does not trigger the application-reactivation refresh that would replace a file-tree click; genuine window reactivation keeps the existing refresh path.

## Verification

- `html-preview.test.cjs` covers raw Chinese paths, cached attachment records, uppercase HTM, managed HTML attachments, local CSS/JS/images, rejected remote/absolute/traversal references, missing assets, read failure, count/size limits, non-persisted preview projection and workspace changes.
- `tests/html-flow.py` uses the real panel, service and temporary filesystem. It verifies visible content, CSS color, local script execution, image decoding, button interaction, panel-origin isolation, blocked fetch, source edit/reload, managed attachment rendering, missing-resource notice, responsive geometry and file selection after iframe interaction.
- Existing service, memory, extension-loader, CDP panel and full editor flows remain required regressions.

No user-owned HTML file is altered by validation, and no running installation or market release is replaced as part of local candidate verification.
