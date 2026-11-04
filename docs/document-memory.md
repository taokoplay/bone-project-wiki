# Document-linked project memory

Status: implementation candidate, 0.2.0. The feature adds a backward-compatible document-memory workflow; it does not change host permissions or introduce an external model call.

## Ownership

The knowledge document owns the full rules, scope, exceptions and evidence. A memory record owns only a short summary, a reading trigger and a stable reference. The master context is derived from those records; it is not a second editable copy of the rules.

`recordId` is a stable identity separate from the existing filename-based `id`. New managed documents receive a UUID. Legacy managed documents derive an identity from their original metadata, without a read-time rewrite; the identity is persisted on their next managed save. Plain Markdown is adopted before linking. Existing titles, paths, IDs, revisions and version-1 records remain readable. Renaming or moving through the service preserves `recordId`. Old applications can still read the content, but do not understand the new association fields and may discard them when rewriting a record.

## Public workflow

1. Start with `snapshot`, retain its `workspacePath`, and initialize if needed.
2. Search for an existing document and memory. Read before updating.
3. For a user-confirmed important rule, call `remember` with a knowledge category, `kind: "document"`, `status: "confirmed"`, title, full content, `summary` (1–800 characters), `readWhen` (1–240 characters), and source. Existing documents use the explicit `recordId` selector and `expectedRevision`. Filename-based `id` remains supported; if it also names a different stable document identity, the service reports `AMBIGUOUS_DOCUMENT`.
4. The service validates input, writes and verifies the document, then creates or updates its memory association. It reports complete success only with `linked: true`.
5. If the document succeeded but the memory write failed, the result contains the saved `document`, `memory: null`, `linked: false` and `linkError`. Retry using that document's ID and revision; do not create a second document. The panel retains the short-summary draft.
6. Read the current full source with `{action: "read", recordId, section: "knowledge"}`. The same explicit selector is supported for updates. A short summary never replaces the source for detailed business decisions.

Simple explicit preferences keep the existing `save(kind: "memory")` path. Viewing or querying knowledge alone is not authorization to organize it or persist a rule.

## Reference format and freshness

A linked memory has additive `documentRef` metadata:

- `recordId`: the stable document identity; never an arbitrary filesystem path.
- `contentHash`: SHA-256 of the exact source body when the summary was confirmed.
- `readWhen`: the user-facing description of relevant tasks.

Read results and snapshot metadata expose a derived `documentLink`, with the current document's identity, title, project-relative path, revision and status when available. This projection is not persisted as another source of truth.

| State | Context behavior |
| --- | --- |
| current | Include the bounded summary, reading trigger and source reference. |
| stale | The source body changed; withhold the old summary and retain a pointer to the current source. |
| draft | The source is unconfirmed; withhold the summary. |
| archived | The source was archived; withhold the summary. |
| missing | The source is gone; show the broken association. |
| unreadable | The source or memory cannot be verified; withhold its summary. |
| ambiguous | Multiple active documents share an identity; refuse to select a rule. |

A title or category change preserves the association and current summary because body content is unchanged. A body change requires reading the new source and calling `remember` with a refreshed summary. The plugin does not invent a new summary or silently replace user-confirmed business rules.

## Read and security boundaries

Input intent classification is separate from stored-memory eligibility. A stored paragraph containing words such as "whether" or "是否" remains normal prose. Context-only requests are not facts. Sensitive-content, path, workspace, lifecycle, size and symlink checks remain applicable. Legacy empty requests are excluded from automatic context without deleting their files.

The extension reads knowledge only for existing document associations, validates paths within the project knowledge tree, and verifies the actual identities of all Markdown candidates within the existing scan limits. Size and modification-time caches cannot exclude possible duplicate identities. Unverified sources withhold summaries. Only summaries and references enter automatic context, never the complete knowledge library. Every included source remains reference data rather than higher-priority instructions.

Public README, catalog copy and release notes must not include personal absolute paths, machine usernames, credentials or local package locations. Development fixtures and validation artifacts do not ship.

Source titles are filtered before being stored or projected into memory; personal paths and sensitive titles remain available only through explicit document access. A safe title is used for the memory summary and automatic context. The panel captures summary drafts on input, keys them by workspace and document identity, preserves them through same-project refresh and document autosave, and guards leaving or closing with unsaved input. Project switches cannot reuse another project's draft.

Task selection and candidate isolation are specified in [Task-relevant memory retrieval](memory-retrieval.md). Optional memory-only `scopePaths` and `importance` metadata are accepted by `save(kind: "memory")` and `remember`; they never modify document ownership or file permissions. Context admits confirmed applicable memories only and emits complete facts or full-read routes within its presentation budget.

## Acceptance scenarios

- Save a confirmed topic document and short memory; reload both, then follow the association to the full source.
- Rename and move the source; the same association resolves the current title, location and revision.
- Change the body; old summary disappears, then `remember` refreshes the same memory record.
- Draft, archive, delete, corrupt or duplicate the source; the corresponding non-current state never supplies the old rule.
- Reject invalid or request-only summaries before any document write; document-write failure creates no memory.
- Fail memory persistence after document success; report partial success, retain the panel draft, and retry without duplication.
- Load stored prose containing interrogative words; do not save a context-only request or a query as a fact.
- Restore an existing project without an eager data migration, preserving other user records and permissions.
- Change an unrelated cached document's identity without changing size or timestamps; detect ambiguity and withhold the summary.
- Name an unrelated file after a source's stable identity; reject ambiguous legacy lookup and resolve the explicit `recordId` selector correctly.
- Keep private source titles out of persisted/projected memory and automatic context, including after a source rename.
- Preserve unsent summary input through focus refresh and source autosave; isolate copied identities across projects and guard unsaved departures.
