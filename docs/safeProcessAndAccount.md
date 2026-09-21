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

Two things are the same whatever role it plays, and that is deliberate. `SafeMember` is keyed
`(network, safeAddress, memberAddress)` with no DAO field, so the owner set is stored once.
`SafeTransaction` is keyed `(network, safeAddress, safeTxHash)`, so a Safe's transactions are stored
once. Only what a row *touches* differs, and that is data on the row.

What the roles do change is that two things have to be plural from the start, and are called out
where they belong: the rule that decides whether a Safe is visible to a caller (A5), and the Aragon
context carried by a Safe transaction (A4).

## Decisions taken

1. The execute-permission Safe becomes a real `Plugin` row. Every process endpoint then works
   unchanged, instead of a second dispatcher for one account type.
2. The standalone Safe does not. `Plugin.daoAddress` is required and there is no DAO.
3. A Safe transaction lives in `SafeTransaction` and nowhere else. Pending and executed, standalone
   Safe and DAO-attached Safe, all one collection and one shape. It is never projected into
   `Proposal`.
4. `SafeTransaction` is an index, never the signing authority. It gives a Safe transaction an Aragon
   identity so it can be listed, linked and searched. The envelope and the `safeTxHash` are re-read
   from the Safe service at the moment of signing. A stale copy is fine for a list and is not fine
   for a hash somebody signs.
5. `safeTxHash` is the identity, everywhere. It is what the Safe app links by, what Kevin's
   components address a transaction by, and the EIP-712 hash of the envelope, so it is derived from
   the transaction rather than assigned. There is no per-transaction numbering: the ticket floated
   `SAFE-1` and nothing was built against it.
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
(`pluginSlug.ts:17`) and an unlisted type returns `null`, which means no slug at all. The entry gives
the *process* a slug; individual transactions are addressed by `safeTxHash` and are not numbered.

## A3. Why a Safe transaction is not a `Proposal`

The obvious move is to project each Safe transaction into `Proposal`, so the existing list, page and
actions endpoint serve it with no special casing. It was the plan and it was dropped, for reasons
worth keeping written down.

- **A standalone Safe cannot have one.** `Proposal.daoAddress` is `required` and there is no DAO, so
  track B could never use the same storage. Two storage models for the same object is worse than one
  that is slightly less convenient.
- **A pending transaction cannot have one either.** `transactionHash`, `blockNumber`, `startDate`
  and `endDate` are all `required`, and a transaction that has not executed has none of them.
  Projecting only on execution means pending and executed live in different collections and every
  list has to stitch them.
- **Relaxing those fields is a change to shared ground.** Token voting, multisig, admin, SPP and
  gauge all use that schema, and it would be relaxed for the benefit of one type that is mostly null
  in it anyway: no stages, no voting settings, no metadata, no creator in the Aragon sense.
- **Nothing is gained.** The app does not address these by proposal identity. Kevin's components
  take `safeTxHash` and link by it; the list card is labelled "Safe transaction" with no number.

So `SafeTransaction` holds every Safe transaction, pending and executed, DAO-attached and
standalone. A DAO-attached Safe differs only in what its rows *touch*, which is `targets` on the row,
not a different table.

Two things still come from the DAO side, and neither needs a `Proposal`:

- `DaoExecutionHandler.executedEvent` (`daoExecutionHandler.ts:27`) keeps writing its `Transaction`
  row per `Executed` event, as it does for every direct execution. That is the account-level record
  and it is unchanged.
- The classification bug that slice 2 introduced still has to be fixed there — see slice 4.

## A4. The `SafeTransaction` collection

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

The associations arrive with correlation, not with the collection itself. Until then `targets`
below carries what the row touches, which is all the filtering needs.

**How a row lands. Two ways, because they cover different gaps:**

- *Upsert from a read.* Every queue or history page the gateway fetches is written down. This
  catches transactions created in the Safe app, picks up confirmations collected outside Aragon, and
  is where executed transactions come from. It costs nothing extra because the read is happening
  anyway.
- *Write-through on propose.* The app submits the transaction through us instead of through its own
  proxy, so the row is written at creation with real Aragon context attached rather than re-derived
  from calldata later. It also leaves one holder of the Safe API key, which is what APP-1099 asked
  for. Kevin's proxy file already says the writes are expected to move here.

No scheduler and no new crawl. A Safe nobody looks at and nobody proposes through simply has no
rows, which is correct.

**Read-through is enough to render, not enough to react.** An owner opening the page is what fetches
the queue, so the other owners always see a transaction that was created while they were away. What
it cannot do is tell them without them looking — a notification, a pending count on a dashboard.
That needs the propose endpoint, or polling, and nothing asks for it yet.

**What it is not.** It is not the authority. Before anything is signed, the envelope and the
`safeTxHash` come from a fresh Safe read. The app already checks the hash under the Safe's on-chain
version and threshold, so this needs no work on its side. The stored row drives the list, the link
and the search; the fresh read drives the signature.

**Correlation moves here.** `aragonReports` is recomputed per queue page on every read today. Stored
on the row, it is computed once when the row is written.

**"Does this concern that DAO" is answered from the row, never upstream.**

The obvious move is a `to` filter on the queue read, the way `readHistory` already has one. It is
wrong. A batched Safe transaction's `to` is the MultiSend contract and the real call sits inside the
packed payload, so an upstream filter — which only ever sees the envelope — drops every batch the
app composes, silently.

So the queue is fetched unfiltered and the row carries what the transaction actually calls:

- `rawActions`, in the same `{to, value, data}` shape a DAO `Executed` event hands over: one action
  for a plain call, one per inner call for a MultiSend. Splitting is the only new code; everything
  after it is the existing `DecodeActions` path, so a Safe transaction's actions decode exactly the
  way a DAO execution's do.
- `targets`, the addresses those actions call. This is what the filter reads.

Decoding does not happen here. `DecodeActions` costs ABI lookups, and a Safe polled every 30s would
spend them repeatedly on answers that never change. Recording is pure parsing; decoding happens once
on a worker, when the row is written.

**Coverage stays honest.** A list served from rows still reports `stale` and `partial` the way
`src/modules/workspace/pending.ts` already does, because rows are only as fresh as the last read
that touched them.

**Rivals are explained on the transaction, not in the list.** Two pending transactions can hold the
same nonce and only one can ever execute. The list does not try to explain that; the transaction's
own view says it, the way the body card already does.

**Reconciliation.** The Safe's on-chain nonce settles which rows are dead. A live row below the
current nonce can never execute, and at the executed nonce every row except the one that landed is
dead too. Both become `superseded`.

The nonce is a chain read, so it costs no Safe quota, and it is the same rule the app already
applies in `SafeTransactionState` — `isExecuted: false` is not the same as pending. Reconciliation
runs wherever the nonce is already in hand, which is the hook that records a page.

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

- New `src/models/schema/safeTransaction.ts`. Keyed `(network, safeAddress, safeTxHash)`. Holds the
  envelope, proposer, confirmations last seen, nonce, state, last-refreshed, plus `rawActions` and
  `targets` as A4 describes. Models load themselves from the schema directory, so registration is
  `ICollectionNames` and `IMongoModel` in `src/types/db.ts`, nothing more.
- New `src/modules/safe/safeTransactions.ts` — split a transaction into `rawActions`, derive
  `targets`, upsert a page, reconcile against the nonce.
- `src/modules/safe/safeService.ts` — `readQueue` gains an `afterFetch` hook that runs only on a
  real fetch, never on a cache hit or a stale answer, and is not awaited: bookkeeping must not stand
  between the caller and a page already in hand. No `to` on the upstream read; see A4.
- Reconciliation uses `SafeChainReaderModule.readNonce`, read in the same hook. Live rows below the
  current nonce become `superseded`. The one that executed at that nonce is not in an
  `executed=false` page at all, so everything this sees below the nonce is a loser.
- An index migration, following `20260827120000-syncSafeCacheIndexes`.

Done when a queue read leaves rows behind with the right states and the right targets, including
for a batched transaction. Serving a list from them comes with the endpoint that needs it.

## Slice 4 — Executed transactions, and their actions

Two things, and a fix that has to come first.

**Fix the classification. Slice 2 broke it.** `callIdToProposalIndex` (`daoExecutionHandler.ts:219`)
does `BigInt(callId).toString()` on any callId, so it practically never returns null, and
`isPluginExecution = callIdIndex != null && !!plugin`. Before slice 2 a Safe had no `Plugin` row so
the second half was false and a Safe execution was correctly a direct one. Now it is true, which
mislabels the `Transaction` row with a meaningless `pluginAddress` and `proposalIndex`, and — the
real damage — stops `triggerDaoRefresh` firing, because that only runs when both are absent. A Safe
moving DAO funds would no longer refresh transfers, assets or metrics. Exclude `interfaceType: safe`
from the classification; that leaves every other plugin type exactly as it was. Its own commit,
because it is a live bug rather than part of the feature.

**Executed transactions get rows.** `afterFetch` is on `readQueue` only, so nothing records the
history page. Adding the same hook to `readHistory` is what makes an executed transaction exist in
our data at all, with its nonce and its onchain transaction hash. No `Proposal`, no projection, no
`safeRead` message from `aragon-dao` to the gateway — the executed half arrives the same way the
pending half does.

**Actions get decoded once.** A row carries `rawActions` from the split, which is pure parsing.
Turning those into readable actions is `DecodeActions`, the same path a direct DAO execution uses,
and it costs ABI lookups — so it runs once when a row is written, on a worker, never on a refresh.
A Safe polled every 30 seconds must not re-decode what has not changed.

**Only new transactions.** Executions already sitting in `Transaction` are left alone. Backfilling
means a Safe history read per DAO and real quota, and it is a one-shot tool when it is wanted.

Done when an executed Safe transaction has a row with its nonce, its onchain hash and its decoded
actions, and a Safe moving DAO funds refreshes that DAO again.

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
   the same release. Kevin's `safeTransactionService` already says the file goes away "once the
   writes are given a backend endpoint", so it is expected — but it is a code comment, not an
   agreement, and the timing is his.
4. **How a list is served.** Rows exist; nothing reads them yet. Whether the Safe process's
   transactions come back from a route of their own or get folded into an existing one is decided
   with whoever builds the page, not before.

# Not in this pass

The `safeBodyMembers` cleanup and the resync rework (`docs/prCleanup.md`), and the Safe read-budget
split across workspace accounts.
