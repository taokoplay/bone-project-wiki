# Task-relevant memory retrieval

Status: implementation candidate, included in 0.2.0. This stage improves memory selection and establishes candidate isolation. It does not add a model call, embedding store, background extraction service, cross-project memory, or a new permission.

## Ownership and compatibility

Topic documents remain authoritative for full rules. Memory records hold confirmed summaries, provenance and optional applicability metadata. Task checkpoints remain a host/session responsibility. Existing version-1 records remain readable with project-wide scope and normal priority when the new fields are absent. Reads do not migrate or rewrite existing data.

Two optional memory-only fields are persisted and validated on reads and writes:

- `scopePaths`: up to 16 unique project-relative file or directory paths, each at most 240 characters. An absent or empty list applies across the current project. Absolute paths, backslashes, controls, empty segments, dot traversal and sensitive locations are rejected.
- `importance`: `normal` or `core`. Omitted values preserve existing metadata on update and mean normal priority for legacy records.

The same fields may be passed to `remember`; they apply to the linked memory, not its document. Invalid metadata is rejected before either record is written. Omitted fields preserve the existing memory's policy; an empty scope list explicitly clears restrictions.

## Eligibility and selection

Automatic and manual context use the same pure selection module. Only confirmed, non-sensitive factual memory records are eligible. Drafts are candidates: they remain visible and explicitly readable in the library, but neither their facts nor their routes enter context. Archived records are excluded. Existing document-link freshness checks still withhold summaries of stale, draft, archived, missing, unreadable or ambiguous sources; eligible non-current links may supply their status and current source route without old facts.

Project membership follows the current workspace's memory directory. Restricted records require a matching project-relative task path, either named in the automatic prompt or supplied through `context.paths`. Matching is exact or a directory descendant, not a string prefix; `apps/payments-other` does not match `apps/payments`. Absolute and remote paths do not establish project-relative scope. Missing path evidence excludes restricted memories conservatively.

Selection reads actual memory bodies within existing directory, record and aggregate byte limits. Cached metadata is only a locator and never establishes confirmation, scope or priority. Failed body reads cannot provide cached facts. Memory records beyond the previous newest-eight cutoff can now compete for relevance. Ordinary memories do not cause knowledge-document reads.

The selector extracts bounded English identifiers and Chinese adjacent-character terms from the current query, excluding generic task words. Title, reading trigger and topics carry more weight than body matches. At most two applicable core memories are reserved first; the remaining records rank by lexical relevance, recency and a deterministic identity tie-break. Generic continuation requests without useful terms fall back to recency. Specific queries omit unrelated ordinary records. This is lexical retrieval, not semantic understanding; synonyms and omitted paths may require an explicit search or a clearer task query.

## Complete facts and budgets

Automatic context remains bounded to 1,200 characters and at most six selected memory entries. The existing 180-character per-body limit now decides whether to include the entire normalized body. No fact is sliced to fit. Scope and reading conditions must fit in full alongside an included fact. When either the per-body or total budget prevents a complete entry, the formatter emits only a full-read route; it does not reuse an automatically derived title that could itself contain an incomplete claim. If even the route cannot fit, the entry is omitted.

Manual context uses the same eligibility and ranking with its existing larger presentation budget. Its memory bodies are also complete or replaced by a route. Existing non-memory handoff and overview context behavior, explicit document reads, search and incremental `context.since` listings remain separate surfaces.

## Public entry points and panel

- `save(kind: "memory", status: "draft")` stores a candidate. Confirmation is an explicit update with the current `expectedRevision`.
- `save(kind: "memory", scopePaths, importance)` edits applicability metadata; unrelated edits preserve omitted policy fields.
- `remember(..., scopePaths, importance)` confirms a full document and linked summary with that memory policy.
- `context(query, paths)` supplies task terms and explicit relative task paths.
- The extension supplies the current user prompt as the automatic query without changing turn cancellation or settled-write behavior.

The existing Knowledge/Memory tabs are retained. A collapsed scope/priority editor is available for ordinary memories and in the document association form. Ordinary memory confirmation is a checkbox; unconfirmed drafts carry explanatory text. Settings autosave through the existing editor, and project-change guards disable stale controls. Linked policy is edited through the source association form and preserved on summary refresh.

## Acceptance mapping

`memory-retrieval.test.cjs` enters through the real service and extension event entry points. It covers older relevant rules behind newer unrelated records, Chinese task terms, generic continuation, draft/confirmation transitions, scoped core priority, path boundaries, invalid metadata before writes, cache identity-independent scope verification, document policy persistence, complete reading conditions, exceptions beyond old cutoffs and automatic-title suppression. Public tool fields and bounded pointer fallback are also checked.

`tests/flow.py` exercises candidate creation, confirmation, scoped retrieval, priority persistence through a title edit and withdrawal of confirmation through the real panel, service and Markdown storage. It also covers the existing document-memory association, partial-failure retry and stale-source paths. `tests/extension-host.mjs` verifies the actual host extension loader without a real model, and the standalone CDP acceptance retains prior panel interactions and draft isolation.

The scope parser validates complete prompt tokens before accepting relative paths. Relative-looking suffixes inside absolute locations or URLs do not establish scope. Explicit root-level names such as `package.json` and `Makefile` match their exact scopes. Failed actual memory reads are omitted from context even when a linked row remains cached; library presentation may still show an unavailable association for diagnosis.

The panel serializes autosaves and tracks the edit generation across both the write and subsequent snapshot read. Input entered while either operation is pending remains in the form and is saved against the newly returned revision before any rerender. Browser acceptance pauses a real save request, withdraws confirmation while it is pending, then verifies that the final persisted status is draft. Policy-only association drafts also survive source autosave when the user clears the scope or removes core priority.
