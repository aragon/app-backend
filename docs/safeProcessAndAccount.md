# Safe as a process, Safe as an account

Two stories, two shapes. They share the Safe read layer that already exists and nothing else.

- **APP-1165** — a Safe holding `EXECUTE_PERMISSION` on a DAO shows up as a process of that DAO.
  DAO-scoped, so it lands in `Plugin`.
- **APP-1166** — a Safe with no Aragon DAO behind it. Account-scoped, so it lives in its own
  collection and is registered through a workspace, never in `Plugin`.

What already exists and is not re-specified here: the Safe read endpoints
(`/v2/safe/:network/:address/{info,queue,history,next-nonce}`), the shared cache and hourly budget,
`aragonReports` correlation, and `SafeMember` owner storage (PR #1578, unmerged).

## One Safe, three roles

The same Safe address on the same network can play all three at once, and each is recorded somewhere
different:

| role | recorded as | scope |
|---|---|---|
| SPP body | an entry in `Setting.stages[].plugins` with `brandId: safe` | per DAO, per stage |
| process | a `Plugin` row, `interfaceType: safe`, `isProcess: true` | per (Safe, DAO) |
| account | a row in the registered-account collection | per (network, Safe) |

`SafeMember` is keyed `(network, safeAddress, memberAddress)` with no DAO field, so the owner set is
stored once however many roles the Safe plays. Nothing below changes that.

What the roles do change is that two things have to be plural from the start, and are called out
where they belong: the rule that decides whether a Safe is visible to a caller (A5), and the Aragon
context carried by a Safe transaction (A4).

## Decisions taken

1. The execute-permission Safe becomes a real `Plugin` row. Every process endpoint then works
   unchanged, instead of a second dispatcher for one account type.
2. The standalone Safe does not. `Plugin.daoAddress` is required and there is no DAO.
3. Proposals are hybrid: executed transactions come from what we already index, pending ones come
   from a `SafeTransaction` collection of our own.
4. `SafeTransaction` is an index, never the signing authority. It gives a Safe transaction an Aragon
   identity so it can be listed, linked and searched next to real proposals. The envelope and the
   `safeTxHash` are re-read from the Safe service at the moment of signing. A stale copy is fine for
   a list and is not fine for a hash somebody signs.
5. An executed Safe proposal carries the real Safe nonce, read from Safe history. It is the number
   an owner recognises, and a log index is not.
6. `can-create-proposal` for a Safe process answers the same way a DAO does — the real permission
   check, not "is an owner".
7. Assets for a Safe come from our own asset pipeline, extended to an account key. Not from the Safe
   service.

---

# Track A — Safe as a process

## A1. The Plugin row

Created by the permission handler when `EXECUTE_PERMISSION` is granted on a DAO to an address that
is a Safe. Marked uninstalled when it is revoked, through the path that already exists.

Filled from the `Granted` log: `address` (`who`), `daoAddress` (`where`), `network`,
`transactionHash`, `blockNumber`, `blockTimestamp`, `sender`, `conditionAddress` (the event's
`condition`, which `permissionHandler.ts:46` already resolves for execute grants).

Set by us: `interfaceType: safe` (new enum value — the app deliberately kept `external-safe` for its
slot id and left a bare `safe` free), `status: installed`, `isProcess: true`, `isSupported: true`,
`isBody: false`, `isSubPlugin: false`, `isPolicy: false`, `hasTarget: false`, `isObjection: false`.

Left null: every PSP-repo field (`pluginSetupRepoAddress`, `release`, `build`, `subdomain`,
`metadataIpfs`, `name`, `description`, `links`, `permissions`), every SPP field (`totalStages`,
`subPlugins`, `stageIndex`, `parentPlugin`), and `tokenAddress`, `votingEscrow`,
`lockManagerAddress`, `proposalCreationConditionAddress`, `enableOfacCheck`. Nothing in the process
list reads them. The app shows the address, per the ticket.

Owners, threshold and version are not Plugin fields and are not copied into one. They stay on
`/v2/safe/:network/:address/info`, which is a chain read and costs no Safe quota.

`isBody` stays `false` even when the same Safe is also a stage body of that DAO. A body is an entry
in `Setting.stages[].plugins`, not a `Plugin` row — that is already true of every external body
today, and the two roles are recorded in different places on purpose. The flag describes what this
row is, not everything the Safe does.

## A2. Indexing

`permissionHandler.handleGrantOnDao` already calls `PluginHandler.installPluginOnPermissionGranted`
for execute grants. That function starts with `Models.Plugin.findByAddress(who)` and returns when
there is no row (`pluginHandler.ts:708`), which is always the case for a Safe.

Add one branch: no plugin row, and `who` is a Safe, then create the row above.

The Safe probe is `SafeChainReaderModule.readOwners`. It already answers exactly what is needed —
`null` when the address is conclusively not a Safe (zero address, or `getOwners` reverts on a
contract that has code), and it throws when the read is inconclusive. A throw must not create a row
and must not swallow the permission write; the grant is recorded either way and the row can be
created on a later pass.

Revoke needs no new code once the row exists: `uninstallPluginWithPermissionRevoke` is already
wired at `permissionHandler.ts:102`.

`IPluginSlug` needs a `safe` entry. `PluginSlug._defaultSlug` is a switch on `interfaceType`
(`pluginSlug.ts:17`) and an unlisted type returns `null`, which means no slug at all. With the entry
added, `SAFE-1` / `SAFE-2` numbering comes from the existing slug machinery and needs nothing else.

## A3. Proposals — the executed half

Nothing new is indexed.

`DaoExecutionHandler.executedEvent` (`daoExecutionHandler.ts:27`) already writes one `Transaction`
row per DAO `Executed` event, including direct executions with no plugin and no proposal. The row
carries `fromAddress: actor` (the Safe), `toAddress: daoAddress`, `rawActions`, `actionCount`, and
the `executionActions` queue decodes the actions afterwards.

So every past and future Safe execution against the DAO is already on disk, decoded, with no Safe
API involvement.

One thing to watch: once the Safe has a Plugin row, `saveExecutionTransaction` will find it through
`Models.Plugin.findByAddress(actor)`. It stays classified as a direct execution because
`isPluginExecution` also needs `callIdIndex != null`, and a Safe passes its own `_callId` which is
not a proposal index. Worth a test so a later change to that condition does not silently reclassify
every Safe execution.

**Making them proposals.** A `Proposal` row is created for each such execution, so the existing
proposal list, proposal page, actions endpoint and slug all work with no read-side special casing:

| Proposal field | Safe execution source |
|---|---|
| `pluginAddress` | the Safe |
| `daoAddress` | the DAO |
| `proposalIndex` | the Safe nonce, as a string |
| `incrementalId` | existing per-plugin counter |
| `transactionHash`, `blockNumber`, `blockTimestamp` | the execution |
| `creatorAddress` | the execution actor |
| `startDate` / `endDate` | execution timestamp |
| `rawActions` / `actions` | already decoded on the `executionActions` queue |
| `executed` | true, with hash and block |
| `title`, `description`, `metadataUri` | null — a Safe transaction has no metadata |

The Safe nonce is not in the `Executed` event. It comes from a Safe history read keyed by the
execution transaction hash — `/history` already filters by `to` and by nonce bounds, and the
executed page carries the transaction hash of each execution, so one page read resolves a batch of
executions rather than one call each.

That read spends Safe quota, which is why it happens once at projection time and never on the read
path. If the history read fails, the `Proposal` row is not written and the execution is projected on
a later pass; a row with a guessed nonce would be worse than a row that arrives late.

## A4. Proposals — the pending half, and the `SafeTransaction` collection

A pending Safe transaction is the Safe's equivalent of a proposal: something the owners sign and
then execute. It exists off-chain only, so nothing indexes it today and every viewer pays for it.
It gets a row of our own.

**Shape.** Keyed `(network, safeAddress, safeTxHash)`. `safeTxHash` is the identity, not the nonce:
two rival transactions can hold the same nonce, so a nonce is not unique while a transaction is
pending. The row holds the envelope fields, the proposer, the confirmations last seen, the nonce,
the state it was last seen in (`live`, `superseded`, `executed`), and when it was last refreshed.

**The Aragon context is a list.** One Safe's queue mixes every role it plays: `reportProposalResult`
calls as an SPP body, `DAO.execute` calls as a process, plain transfers as an account. A single
`(daoId, pluginAddress)` on the row cannot describe a transaction that matters to two DAOs, and a
MultiSend can carry calls for both in one envelope. So the row holds an array of associations —
role, DAO, plugin, stage, and the decoded report where there is one — for the same reason
`aragonReports` is an array. An empty array is an ordinary Safe transaction, which is a real and
common answer, not a missing one.

**How a row lands. Two ways, because they cover different gaps:**

- *Write-through on propose.* The app submits the transaction through us instead of through its own
  proxy, so the row is written at creation with real Aragon context attached rather than re-derived
  from calldata on every later read — which is what `safeProposalReports.ts` does today. It also
  leaves one holder of the Safe API key, which is what APP-1099 asked for.
- *Upsert from the queue read.* Whenever a queue page is read for a Safe, its rows are upserted.
  This catches transactions created in the Safe UI, and picks up confirmations collected outside
  Aragon. It costs nothing extra because the read is happening anyway.

No scheduler and no new crawl. A Safe nobody looks at and nobody proposes through simply has no
rows, which is correct.

**What it is not.** It is not the authority. Before anything is signed, the envelope and the
`safeTxHash` come from a fresh Safe read. The app already checks the hash under the Safe's on-chain
version and threshold, so this needs no work on its side. The stored row drives the list, the link
and the search; the fresh read drives the signature.

**Correlation moves here.** `aragonReports` is recomputed per queue page on every read today. Stored
on the row, it is computed once when the row is written.

**The queue read needs a `to` filter.** Only history has one today (`safeService.ts`, `readQueue`
vs `readHistory`). Add `to` to the queue read and to its cache key, so a Safe process can ask for
its own DAO's transactions rather than the Safe's whole queue.

**Coverage stays honest.** A list served from rows still reports `stale` and `partial` the way
`src/modules/workspace/pending.ts` already does, because rows are only as fresh as the last read
that touched them.

**Rivals stay on the proposal page.** Two pending transactions can hold the same nonce and only one
can ever execute. The process list does not try to explain that; the proposal page says it, the way
the body card already does.

**Reconciliation.** The Safe's on-chain nonce settles which rows are dead. A live row below the
current nonce can never execute, and at the executed nonce every row except the one that landed is
dead too. Both become `superseded`.

The nonce is a chain read, so it costs no Safe quota, and it is the same rule the app already
applies in `SafeTransactionState` — `isExecuted: false` is not the same as pending. Reconciliation
runs wherever the nonce is already in hand: on a queue upsert, and on an execution projection.

`superseded` is our own bookkeeping and nothing leaves the building. Deleting a dead transaction
from the Safe service is a separate, deliberate action: it is destructive, it affects a queue shared
with people who are not using Aragon, and the transaction may have been created in the Safe app by
someone who never asked us to touch it. Not automatic, and not in this pass.

## A5. Voting and members

- Members: `GET /v2/members?daoId=&pluginAddress=<safe>` — the Safe-owner path from PR #1578.

  The rule that decides whether a Safe is visible to a caller now has three sources: a stage body of
  an active setting, a `Plugin` row on this DAO, or a registered account. It is written once, as one
  resolver with three sources behind it, rather than three conditions grafted on one at a time.
  `findActiveSafeBodySettings` is already a raw nested `$elemMatch` living inside the module; adding
  two more branches to it in two different slices is how it stops being readable. Slice 5 writes the
  resolver with the first two sources, slice 7 adds the third.
- Voting terminal: reuse of the Safe body signing work. No backend change.
- Process details: a Safe process has no `Setting` row. Its settings are owners, threshold and
  version from `/v2/safe/.../info`, which is the panel the app already renders in the voting
  terminal. This is the only place the plugin shape does not cover, and it needs no new endpoint.
- `can-create-proposal`: answered the same way a DAO answers it — the real execute-permission check
  for this Safe on this DAO, including its condition when one is set. Being an owner is not the
  question; an owner can queue a transaction the Safe is not allowed to execute, and answering yes
  to that invites a signature nobody can use.

---

# Track B — Standalone Safe as an account

## B1. Storage

A new collection, keyed `(network, address)`. A Safe is inserted when it is added to a workspace and
is what makes the Safe known to the indexer and to the read endpoints. Nothing about it is
DAO-shaped and it never appears in `Plugin` or `Dao`.

This is also the missing registration trigger for owner indexing: `AddedOwner` / `RemovedOwner` are
matched network-wide, but `safeBodyMembers` drops every Safe that is not a body, so a standalone
Safe is never indexed today. Registration makes it tracked.

## B2. Members

`SafeMember` is already account-shaped — `(network, safeAddress, memberAddress)` with no DAO field —
so the storage needs no change. What changes is the read: every current path gates on "an active SPP
setting lists this Safe as a stage body", which a standalone Safe never satisfies.

A registered account is the third source of the visibility resolver described in A5.

## B3. Assets and transactions

Both collections are `daoAddress`-keyed, so a bare Safe address has no path today. The app currently
reads Safe balances straight from the Safe transaction service through its own Next proxy, with a
comment saying the cutover belongs to this work.

Our own asset pipeline is extended to take an account key rather than a DAO address, and a
registered Safe is an account. Balances then come from the same source every DAO's do and stop
spending Safe quota entirely. Transactions follow the same widening.

## B4. Proposals

The same `SafeTransaction` collection serves this track. A standalone Safe has no `Plugin` row and
therefore no slug, so its transactions are addressed by `safeTxHash` rather than by a `SAFE-1` key.
Executed ones come from Safe history rather than from a DAO `Executed` event, since there is no DAO
to emit one.

## B5. Writes

`proposeSafeTransaction` moves behind our backend, because write-through is how a row lands with its
Aragon context (A4). `SafeTxServiceModule` exposes only `get` today, so this is a new path: one
POST, through the same limiter and budget as every other upstream call.

`confirmSafeTransaction` follows the same route so a confirmation updates the row it belongs to
instead of arriving only on the next queue read. Neither call holds a signature of ours; the wallet
signs, we forward.

---

# Slices

Each slice ships on its own. Nothing later is needed for something earlier to be correct.

## Slice 1 — Register the Safe plugin type

Two enum values and one switch case. Nothing reads them yet, which is the point: it lands with no
behaviour change and everything after it can assume they exist.

- `src/types/plugin.ts` — `IPluginInterfaceType.safe`, `IPluginSlug.safe`. The app deliberately kept
  `external-safe` for its own slot id and left a bare `safe` free for us.
- `src/helpers/pluginSlug.ts:17` — a `safe` case in `_defaultSlug`. Without it the switch returns
  `null`, which `generateSlug` reads as "plugin not supported" and no slug is ever minted.

Done when a `Plugin` row carrying `interfaceType: safe` gets a slug, and no existing type changes.

## Slice 2 — Create the Plugin row on an execute grant

- `src/handlers/permissionHandler.ts:44` — the execute-grant block already calls
  `PluginHandler.installPluginOnPermissionGranted`. Add the Safe branch next to it.
- `src/handlers/pluginHandler.ts` — a creator beside `installPluginOnPermissionGranted`, which
  returns at line 708 when `Models.Plugin.findByAddress(who)` finds nothing. That early return is
  always taken for a Safe, so this is a new function rather than a change to that one.
- The Safe probe is `SafeChainReaderModule.readOwners`, unchanged. `null` means conclusively not a
  Safe, so do nothing. A throw means the read was inconclusive: write no row, leave the permission
  row alone, and let a later pass create it. Never let it fail the permission write.
- Fill the row as A1 describes, then `PluginSlug.generateSlug`.
- Revoke needs no new code — `uninstallPluginWithPermissionRevoke` is already wired at
  `permissionHandler.ts:102` — but it needs a test, because nothing has ever reached it with a Safe.

Done when granting execute to a Safe makes a process tab appear with an empty proposal list, and
revoking it marks the row uninstalled.

## Slice 3 — The `SafeTransaction` collection

- New `src/models/schema/safeTransaction.ts`, registered in `src/models/index.ts`. Keyed
  `(network, safeAddress, safeTxHash)`. Holds the envelope, proposer, confirmations last seen,
  nonce, state, last-refreshed, and the Aragon context from A4.
- New `src/modules/safe/safeTransactions.ts` — upsert, reconcile, list.
- `src/modules/safe/safeService.ts` — `readQueue` takes `to` and puts it in the cache key. Only
  `readHistory` has that filter today.
- `src/types/safe.ts`, `src/services/aragon-gateway/safe.ts`,
  `src/services/aragon-api/routers/schema/safe.ts` and `routers/v2/safe.ts` carry `to` through.
- Reconciliation uses `SafeChainReaderModule.readNonce`: live rows below the current nonce become
  `superseded`, and at the executed nonce so does everything except the one that landed. It runs on
  a queue upsert, where the nonce is already being read.
- An index migration, following `20260827120000-syncSafeCacheIndexes`.

Done when the pending list is served from rows, superseded rows are marked without any upstream
call, and a queue read can be scoped to one `to` address.

## Slice 4 — `Proposal` rows from Safe executions

Runs in the `executionActions` worker (`src/services/aragon-dao/index.ts:85`), where the action
decode already happens and where it is off the crawl hot path.

- Project only when the execution's actor has a `Plugin` row of `interfaceType: safe` on that DAO.
- **Gotcha:** `aragon-dao` has no Safe service. `SafeService` runs in the gateway, so the nonce comes
  from a `safeRead` history message the same way `SafeController` asks for one — not a direct call.
- Map the row as the A3 table says. If the history read fails, write nothing and let a later pass
  do it. A row with a guessed nonce is worse than a row that arrives late.
- Pin the existing classification with a test: a Safe execution stays a *direct* execution because
  `isPluginExecution` needs `callIdIndex != null` and a Safe passes its own `_callId`. Once the Safe
  has a Plugin row, `Models.Plugin.findByAddress(actor)` starts finding one, and a later change to
  that condition would silently reclassify every Safe execution.

Done when the executed list, the proposal page and the actions endpoint all work for a Safe process
with no read-side special casing.

## Slice 5 — Members and can-create-proposal

- `src/modules/safe/safeBodyMembers.ts` — replace the inline relation check with one visibility
  resolver, carrying two of its three sources: a stage body of an active setting, and a `Plugin` row
  on this DAO. Slice 7 adds the third. Writing it as a resolver now is what keeps slice 7 from being
  a third branch bolted onto a raw `$elemMatch`.
- `src/services/aragon-api/controllers/member.ts` and `controllers/dao.ts` — call the resolver
  instead of repeating the check.
- `src/services/aragon-gateway/memberInfo.ts:96` — `canCreateProposal` answers for a Safe process
  from the execute permission and its condition, not from ownership.

Done when the members page lists the Safe's owners for a Safe process and can-create matches what
the Safe is actually allowed to execute.

## Slice 6 — The registered Safe account

New collection keyed `(network, address)`, plus the endpoint that registers one. A Safe is inserted
when it is added to a workspace, and that row is what makes it known to the indexer and the reads.
Nothing else consumes it yet.

Done when a Safe can be registered and read back.

## Slice 7 — Widen the gates to a registered account

- The visibility resolver from slice 5 gains its third source: a registered account.
- The `tracked` check in the owner-event path is widened the same way, so `AddedOwner` and
  `RemovedOwner` stop being dropped for a Safe that belongs to no DAO. This is the missing
  registration trigger called out in B1.

Done when a standalone Safe's owners appear as its members and keep up with owner changes.

## Slice 8 — Assets and transactions for an account

The asset pipeline takes an account key rather than a DAO address, and a registered Safe is an
account. Transactions follow the same widening.

Done when a standalone Safe's balances come from our pipeline and the app can stop reading Safe
service balances through its own proxy.

## Slice 9 — `propose` and `confirm` behind our backend

Last, because the app has to drop its Next proxy in the same release.

- `SafeTxServiceModule` gains a `post`, through the same limiter and budget as every read.
- A successful propose writes the `SafeTransaction` row with its Aragon context attached, rather
  than leaving it to be re-derived from calldata later.
- A confirm updates the row it belongs to instead of waiting for the next queue read.

Done when Aragon holds the only Safe API key and a transaction created here exists in our data the
moment it is created.

# Open questions

1. **Refresh floor.** Rows are as fresh as the last read that touched them. Is there a staleness
   beyond which a list read must go upstream before answering, or does the `stale` flag carry it?
2. **Deleting a superseded transaction.** Marking it dead is decided. Whether Aragon ever offers to
   remove it from the Safe queue, and who is allowed to, is left open on purpose.
3. **Slice 9 sequencing.** Moving `propose` behind us needs the app to stop using its Next proxy in
   the same release. Worth confirming with Kevin before slice 9 rather than at it.

# Not in this pass

The `safeBodyMembers` cleanup and the resync rework (`docs/prCleanup.md`), and the Safe read-budget
split across workspace accounts.
