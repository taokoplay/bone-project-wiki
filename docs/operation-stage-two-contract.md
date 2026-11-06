# Stage-two save and latest-search contract

Version: 0.3.4, based on accepted local candidate 0.3.3. This contract covers save/refresh and obsolete search work. It preserves XLSX parsing, memory ownership, permissions and persistent record format.

## Capabilities and compatibility

Both initialized and empty snapshots add:

```text
requestCapabilities: {schemaVersion:1, latestSearch:true, saveSnapshot:true}
```

The public project_wiki schema/actions and existing `wiki` channel remain compatible. Default save still returns a record. No capability means renderer uses the released search/save/snapshot path. The new panel channels are private implementation contracts of the same bundle.

## Latest panel searches

`wiki.search` calls `service.requestLatestSearch(payload)` with:

```text
{action:'search', workspacePath, query, section?, clientId, sequence}
```

Return value is the existing search result array. clientId is a renderer-generated UUID unique to a panel page. sequence is a nonnegative safe integer. Query length, section behavior, scoring, excerpts and result cap remain unchanged. A client cannot choose another action through this channel.

`wiki.search.cancel` calls `service.cancelLatestSearch({clientId,sequence})` outside the request queue. Cancellation means "cancel generations strictly less than sequence"; an out-of-order cancel for generation N must not cancel a new run at N. Lower sequence commands cannot cancel newer runs. Return is `{cancelled:boolean}`; it acknowledges bookkeeping, not completion of an OS read already in progress.

One client owns at most one active search and its latest queued search. Replacing queued work rejects it without filesystem work, removes the old queue slot and appends the latest search after already queued mutations. Running searches stop at the next I/O/check boundary. Normal writes remain FIFO and cannot be cancelled by search input. Direct tool searches are independent and may use their supplied AbortSignal. All request dispatch stays serialized.

Obsolete work rejects with an Error carrying `code:'CANCELLED'` and message `CANCELLED`. That error must propagate through unreadable-source/cache fallback catches. Workspace and unload errors retain their existing codes. Panel generations/context guards suppress obsolete errors/results. Input, clearing, project invalidation and pagehide cancel immediately; debounce remains 220 ms. State is bounded to 32 clients, retains counters only (no queries/results), and disposal terminates read work and queued jobs.

## Panel save and snapshot

`wiki.save` calls `service.saveAndSnapshot(payload)` with the ordinary `{action:'save', workspacePath, ...record fields, expectedRevision}` payload. It cannot dispatch other actions. The entire operation occupies one FIFO queue slot and is not cancelled by latest-search changes.

Success returns:

```text
{entry: savedRecord, snapshot: fullSnapshot}
```

The snapshot has the same shape/meaning as the public snapshot, including fresh linked-memory source projection. The backend reuses verified raw reads/scans only inside this operation. A forced identity scan cannot be satisfied by a weaker metadata scan. Own writes/renames/removals invalidate the affected raw/scanned paths. Final revision guards, target collision guards and write readback use fresh actual bytes, bypassing the cache. There is no cross-operation fact cache and no filesystem transaction claim.

If save committed and a non-context refresh failure follows, return `{entry, snapshot:null, refreshError:'REFRESH_FAILED'}` so the renderer retains the saved revision and can retry without a false revision conflict. WORKSPACE_CHANGED/PLUGIN_UNLOADED/local-workspace errors reject, and no old-project result is applied. Save failures do not report success.

## Renderer application

Existing records retain the same editor DOM, input/selection, focus and scroll during ordinary autosave. New records acquire a usable read-mode action after first save. Explicit read-mode/navigation can still rebuild the detail pane. Preserve editVersion/view/epoch checks across saves and refreshes; newer input must be saved against the returned revision. No state may be assumed unchanged across await.

Apply the returned snapshot without rebuilding the whole shell. Reconcile file-tree metadata/order only as needed; reused buttons/menus must read current IDs/paths/revisions after saves or title-driven rename. Preserve folder expansion, selection, unfinished association drafts and safe first pointer clicks. A pending summary form must confirm against the newly saved document revision, not a captured old record. Updates during a pointer press must not remove or move its target before the click completes.

Preserve current search input unless a deliberate explicit refresh/navigation resets it; new input entered during save must not be overwritten. Cancel invalidated search generations. Source-memory association drafts remain project-isolated. Partial refresh success keeps the editor and saved revision, warns via localized existing notice styling, and retains any newer unsaved input.

UI ownership: renderer/app.mjs integration; new renderer helpers; renderer/document-memory.mjs if needed for updating its record base without losing draft; i18n; test flow server private-channel routes and UI regressions. Backend ownership: service/main, queue/scope/I/O helpers and Node tests. Do not edit each other's files concurrently.

## Required representative checks

- Held save, then newer input and read-mode request: final persisted content is newest and unchanged editor is retained until explicit mode switch.
- Title rename and source association after autosave use current stable identity/revision; unfinished summary/policy drafts survive.
- Search input/clear/project change cancels immediately; late responses cannot affect a newer query or view. Client isolation, duplicate/out-of-order commands, unload and fallback capability absence are tested.
- A superseded running/queued search cannot cancel or overtake queued writes; real service filesystem reads stop after the explicit gate is released and cancellation checked.
- Fresh guards detect same-size/same-mtime external changes before save, verified readback errors, new target collisions and workspace changes. Source identity collisions/stale/missing/unreadable states remain conservative.
- Benchmark save+snapshot on aged 200/800-document fixtures; compare body reads, index writes, UI latency and node identity. Report real results and remaining limitations, not a fixed timing promise.
