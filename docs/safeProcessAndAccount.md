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
| Safe | `(network, safeAddress)` | chain reads, `SafeMember`, `SafeTransaction` |
| standalone Safe account | `(network, safeAddress)` | `SafeAccount`; never `Plugin` or `Dao` |
| DAO association | `(network, daoAddress, safeAddress)` | one canonical `Plugin`; `Setting.stages[].plugins` remains the SPP stage-configuration source |
| owner | `(network, safeAddress, memberAddress)` | `SafeMember` |
| Safe transaction | `(network, safeAddress, safeTxHash)` | `SafeTransaction` |

Two things are the same whatever role it plays, and that is deliberate. `SafeMember` is keyed
`(network, safeAddress, memberAddress)` with no DAO field, so the owner set is stored once.
`SafeTransaction` is keyed `(network, safeAddress, safeTxHash)`, so a Safe's transactions are stored
once. Only what a row *touches* differs, and that is data on the row.

What the roles do change is that two things have to be plural from the start, and are called out
where they belong: the rule that decides whether a Safe is visible to a caller (A5), and the Aragon
context carried by a Safe transaction (A4).

### Canonical DAO association

An active SPP body reference or DAO-level `EXECUTE_PERMISSION` grant creates or reinstalls one
DAO-scoped `Plugin` row. The same row represents both capabilities:

```json
{
  "address": "<safeAddress>",
  "daoAddress": "<daoAddress>",
  "network": "<network>",
  "interfaceType": "safe",
  "status": "installed",
  "isSupported": true,
  "isBody": true,
  "isProcess": false,
  "isSubPlugin": false
}
```

| Active relationship | `status` | `isBody` | `isProcess` |
|---|---|---:|---:|
| SPP body only | `installed` | `true` | `false` |
| Execute only | `installed` | `true` | `true` |
| SPP body and Execute | `installed` | `true` | `true` |
| Execute revoked, SPP remains | `installed` | `true` | `false` |
| SPP removed, Execute remains | `installed` | `true` | `true` |
| neither | `uninstalled` | `false` | `false` |

Duplicate references across SPP stages or settings do not create duplicate rows. The database
enforces one case-insensitive `(network, daoAddress, safeAddress)` Safe association. The same Safe
may independently have different capability flags in different DAOs.

### DAO Execute process

The permission handler probes `getOwners()` before classifying an unknown Execute grantee as a
Safe. Grant reconciles or creates the canonical association. Revocation removes only process
capability; it leaves the association installed when an active SPP body still references the Safe.
When neither relationship remains, the association is uninstalled without deleting global owner
or transaction rows. Regrant reuses the row and restores the current flags and Execute condition.

## A1. The Plugin row

Created by the permission handler when `EXECUTE_PERMISSION` is granted on a DAO to an address that
is a Safe. Marked uninstalled when it is revoked, through the path that already exists.

Filled from the `Granted` log: `address` (`who`), `daoAddress` (`where`), `network`,
`transactionHash`, `blockNumber`, `blockTimestamp`, `sender`, `conditionAddress` (the event's
`condition`, which `permissionHandler.ts:46` already resolves for execute grants).

An SPP body remains an entry in `Setting.stages[].plugins`, and also makes the canonical Safe
association available through ordinary DAO and plugin APIs. Its stage configuration is
setting-owned. Proposal and DAO enrichment may enrich non-Safe stage plugins only from the same
DAO. The top-level Safe association must not overwrite nested stage fields such as `brandId`,
`proposalType`, `proposalCreationConditionAddress`, or report context.

SPP setting updates and parent SPP activation/removal reconcile the row. Repeated references to the
same Safe are deduplicated before persistence.

Owners, threshold and version are not Plugin fields and are not copied into one. They stay on
`/v2/safe/:network/:address/info`, which is a chain read and costs no Safe quota.

Safe membership means Safe ownership, gated by an active DAO association. Both Execute processes
and SPP-only bodies therefore resolve through the installed canonical Safe row; active SPP settings
remain a recovery source while old data is backfilled.

Controllers resolve this capability before generic plugin records. A legacy or colliding
`Plugin`/`PluginMember` row cannot redirect an active Safe relation.

For creation eligibility, a Safe owner with a conditional grant is accepted until selector rows
exist. After indexing starts, the newest block/log event for each `(selector, target, chainId)` wins,
and at least one effective selector must remain allowed. This endpoint has no action calldata;
runtime execution still evaluates the condition against the proposed actions.

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

### Ordinary DAO and plugin responses

An SPP-only Safe is returned as an ordinary plugin record; clients do not need to reconstruct it
from nested settings. Relevant response fields:

```http
GET /v2/plugins/by-dao/ethereum-mainnet/0xdao?interfaceType=safe&isProcess=false
```

```json
[
  {
    "address": "0xsafe",
    "daoAddress": "0xdao",
    "network": "ethereum-mainnet",
    "interfaceType": "safe",
    "status": "installed",
    "isBody": true,
    "isProcess": false
  }
]
```

DAO detail responses include the same `daoAddress` and capability fields in `plugins`. Their SPP
plugin's nested `settings.stages[].plugins[]` still carries its own proposal type and creation
condition; those values are not replaced by the top-level Safe record.

### Members with a colliding generic plugin row

Ordinary plugin execution correlation is keyed by
`(network, daoAddress, pluginAddress, proposalIndex)`. DAO scope is carried through execution,
proposal, slug, and stage lookups so reused plugin addresses and proposal indexes cannot attach
another DAO's metadata.

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

`RegisterSafeProcesses` scans both sides of the relationship: latest DAO-level Execute events,
active SAFE-branded SPP settings, and existing Safe association rows that may need to become
inactive. Held Execute grants still use the on-chain Safe probe before creating an Execute-only
row. SPP-only rows come from the persisted SPP relationship directly; the tool does not invent an
Execute grant or installation. Apply mode reconciles the capability flags and current condition,
then reads current owners for every visible Safe through the addition-only reconciliation path.
It never deletes or rewrites global `SafeMember` or `SafeTransaction` data.

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

Frontend member requests must include `daoAddress` on
`GET /v2/members/:memberAddress/:pluginAddress/exists` when checking a Safe in a specific DAO.
Without it, Safe-capable addresses use the network-wide Safe-owner check; ordinary plugins retain
the unscoped generic membership lookup.
- `can-create-proposal`: answered the same way a DAO answers it — the real execute-permission check
  for this Safe on this DAO, including its condition when one is set. Being an owner is not the
  question; an owner can queue a transaction the Safe is not allowed to execute, and answering yes
  to that invites a signature nobody can use.

Call `GET /v2/proposals/can-create-proposal` with `memberAddress`, `pluginAddress`, `network`, and
`daoAddress` for DAO-bound Safe processes. The DAO scope selects the installed association when the
same Safe address appears elsewhere. The response is `false` when the member is not an owner, the
association is absent or inactive, the Execute grant is absent, or indexed condition selectors no
longer allow execution.

---


## Existing-data repair and deployment

`RegisterSafeProcesses` scans the latest DAO-level `EXECUTE_PERMISSION` event per grantee, keeps
currently held grants, and reuses the live installer to create, reinstall, or repair canonical Safe
process rows. Apply mode also adds missing current owners without deleting stale owner tuples and
replays the current grant condition.

```bash
TOOL_RUN=RegisterSafeProcesses pnpm tool
```

Apply one network first:

```bash
TOOL_RUN=RegisterSafeProcesses EXECUTE=true TARGET_NETWORK=ethereum-mainnet pnpm tool
```

Apply all configured networks only after reviewing the per-network run:

```bash
TOOL_RUN=RegisterSafeProcesses EXECUTE=true pnpm tool
```

### Proven local behavior

`test/unit/tools/registerSafeProcesses.spec.ts` runs against MockDB's real MongoDB 7 replica set, so
it proves index enforcement, duplicate-key races, transactions, and these backfill counts. It is not
a run against the shared environment's data, RPC providers, or RabbitMQ:

| run | canonical Safe `Plugin` | `PluginSlug` | `SafeMember` owner tuples |
|---|---:|---:|---:|
| Execute-only dry-run before/after | 0 | 0 | 0 |
| Execute-only apply before → after | 0 → 1 | 0 → 1 | partial 1 → complete 2 |
| SPP-only apply with duplicate stage references | 0 → 1 | 0 → 1 | 0 → current owners |
| add Execute, then identical rerun | remains 1; flags become `true/true` | remains 1 | remains current owners |

The shared command requires:

- the backend image built from the target revision, with this migration and tool present;
- the target transaction-capable MongoDB replica set and data;
- RPC providers for each selected network that can answer Safe `getOwners()` calls;
- the backend's RabbitMQ broker and queue configuration.

Stop old application/indexer writers first. Run `mig:run` from the new image and require it to
complete before any new application code serves permission grants; otherwise legacy lowercase
writers can race canonical rows during the cutover. The backend SME must then use a disposable
test-environment Safe and record the selected `(network, daoAddress, safeAddress)`:

```bash
pnpm mig:status
pnpm mig:run
pnpm mig:status
TOOL_RUN=RegisterSafeProcesses TARGET_NETWORK=<network> pnpm tool

# Apply one network; rerun to prove idempotence
TOOL_RUN=RegisterSafeProcesses EXECUTE=true TARGET_NETWORK=<network> pnpm tool
```

The dry run must leave `Plugin`, `PluginSlug`, `SafeMember`, and `SafeTransaction` counts unchanged.
The first apply must create or repair the expected SPP-only, Execute-only, and combined rows. The
second apply must leave row counts and capability flags unchanged.
The migration rewrites dependent slug references and merges case-variant permission cursors,
retaining the highest `lastSync` and any terminal `end` state. Inspect `db.Plugin.getIndexes()` and
require `plugin_safe_association_unique` to be unique, partial on `interfaceType: "safe"`, and
case-insensitive (`collation.strength: 2`). Inspect `db.SafeMember.getIndexes()` and require
`safe_member_unique` to be unique and case-insensitive.

1. Stop old application and indexer writers and back up the database.
2. Run `pnpm mig:run`; require `plugin_safe_association_unique` and `safe_member_unique`.
3. With indexer consumers still stopped, dry-run and then apply `RegisterSafeProcesses` one network
   at a time; a second apply must not change `Plugin`, `PluginSlug`, or `SafeMember` counts.
4. Start the new backend.
5. Only then deploy frontend filtering that requires both `isProcess: true` and `isBody: true`.

The command needs the target MongoDB replica set, RPC providers that answer Safe `getOwners()`, and
RabbitMQ. Do not enable a fail-closed `isProcess` authorization gate until this repair has completed.

Failure logs contain `Migration failed` and a field-specific message such as
`invalid Plugin.address` or `invalid SafeMember.memberAddress`. The regex cannot detect an invalid
mixed-case checksum; use the logged value to correct it from the authoritative chain record, then
rerun the migration.

To prove partial owner recovery in the test environment, choose one current owner returned by that
Safe's on-chain `getOwners()`, confirm its `SafeMember` row exists, record the Safe's owner-row
count, delete only that tuple, and confirm the count fell by one. Run the apply command once. The
deleted tuple and original count must be restored. A second identical apply must not change the
count. Do not perform this destructive proof outside the disposable test environment.

Finally run these global, case-insensitive duplicate checks; every result must be empty after the
first apply and after the identical rerun:

```javascript
db.Plugin.aggregate([
  {$match: {interfaceType: 'safe'}},
  {$group: {_id: {
    network: '$network',
    daoAddress: {$toLower: '$daoAddress'},
    address: {$toLower: '$address'}
  }, n: {$sum: 1}}},
  {$match: {n: {$gt: 1}}}
])
db.PluginSlug.aggregate([
  {$group: {_id: {
    network: '$network',
    daoAddress: {$toLower: '$daoAddress'},
    pluginAddress: {$toLower: '$pluginAddress'}
  }, n: {$sum: 1}}},
  {$match: {n: {$gt: 1}}}
])
db.SafeMember.aggregate([
  {$group: {_id: {
    network: '$network',
    safeAddress: {$toLower: '$safeAddress'},
    memberAddress: {$toLower: '$memberAddress'}
  }, n: {$sum: 1}}},
  {$match: {n: {$gt: 1}}}
])
```

Reruns are data-idempotent: they reuse the DAO/Safe row, slug, global owners, transactions, and
current condition. Invalid persisted grant or association addresses are logged while valid
relations continue.

## Deployment order

1. Stop old indexer/application writers.
2. Run the new image's database migrations. Require `plugin_safe_association_unique` and
   `safe_member_unique` to exist with the documented case-insensitive uniqueness.
3. With writers still stopped, run the backfill dry run, apply one network at a time, and run each
   selected network a second time to prove stable counts and flags.
4. Start the new indexer, gateway workers, and API code.
5. Validate the SPP-only (`true/false`), Execute-only (`true/true`), combined (`true/true`), and
   inactive states through both DAO details and `/v2/plugins/by-dao/...`.
6. Validate member list/count/existence, DAO discovery, exact-DAO creation eligibility, and one real
   non-empty Safe history read.
7. Deploy frontend process/body filtering only after the backend response checks pass and
   DAO-scoped creation requests include `daoAddress`.

Rolling the frontend first is unsafe: older backend data has no ordinary SPP-only Safe row, and an
unscoped creation check must fail closed.

## Verification matrix

The focused regression suite covers:

1. Execute-only and SPP-only associations;
2. both roles in one DAO;
3. Execute revoke with SPP retained;
4. SPP removal with Execute retained;
5. neither relationship active;
6. the same Safe in two DAOs with independent authorization;
7. repeated Safe references in settings;
8. nested stage condition and proposal type preservation in a DAO API response;
9. backfill rerun idempotence;
10. conditional Execute grant and regrant;
11. missing or failed owner read;
12. Safe transaction hash identity with competing nonces.

A live dependency smoke in `test/unit-dep/safeProcess.spec.ts` indexes the mainnet association
between `0x9332620B88A26e0e6e0E0e83CC9C7474ea61A62C` (DAO) and
`0x27CE7C8c1675c3b57046Cf56d96061693B6123e8` (Safe). Its first case calls
`LibUtils.syncCompleteDao` across the deployment and permission-grant blocks, then lets the real
handlers run. It asserts the resulting `Models.Dao`, `Models.Plugin`, `Models.PluginSlug`, and
seeded `Models.SafeMember` rows. It does not call `SafeBodyMembersModule`.

Its second case, when `SafeTxServiceModule.isConfigured()` allows it to run, reads the real Safe
queue through `SafeServiceModule.readQueue` and asserts fresh queue metadata and an array of results:

```bash
SAFE_API_KEY=<key> pnpm test:unit-dep
```

A no-Docker module smoke also connects `MockDB`, calls `SafeServiceModule.readHistory` for that
indexed Safe, passes the returned transaction through the real `SafeTransactionsModule.upsert`, and
re-reads the persisted row to verify the canonical `(network, safeAddress, safeTxHash)` identity.

```json
{
  "count": 2,
  "returned": 1,
  "safeTxHash": "0x0d6f299bc6efd5847669c70fb18eac54145fe81f96b1653fc408a64e2cf13865",
  "nonce": "1",
  "identity": "ethereum-mainnet-0x27CE7C8c1675c3b57046Cf56d96061693B6123e8-0x0d6f299bc6efd5847669c70fb18eac54145fe81f96b1653fc408a64e2cf13865",
  "persisted": true
}
```

The smoke supplied an uppercase copy of the returned hash to `upsert`; the persisted hash and
generated identity remained lowercase. The unit-dependency suite still requires its external Mongo
replica set, RabbitMQ, RPC providers, and API key.

The touched dependency and integration specs were not run in this workspace because their Docker,
RPC, RabbitMQ, and Safe API prerequisites are unavailable. The backend SME must run:

```bash
pnpm docker:unit-dep-dependencies
SAFE_API_KEY=<key> pnpm test:unit-dep
pnpm docker:integration
pnpm test:integration
```

## Verification results

```text
pnpm type-check              exit 0
pnpm format:check            1047 files checked, no fixes
pnpm lint                    543 files checked, no errors (2 existing config infos)
pnpm test:unit               6761 passing, 5 pending
pnpm test:dotonly            no focused tests
MockDB controller smoke      one canonical SPP-only Safe row; isBody=true, isProcess=false
```

# Track B — Standalone Safe as an account (APP-1166 recovery)

The APP-1166 account track is separate from the DAO process/body contract above. A Safe with no
Aragon DAO behind it is account-scoped: it is registered through a workspace, lives in its own
collection, and never appears in `Plugin` or `Dao`.

The shared Safe read endpoints already in scope are
(`/v2/safe/:network/:address/{info,queue,history,next-nonce}`), along with the shared cache and
hourly budget, `aragonReports` correlation, and global `SafeMember` owner storage.

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

- `src/handlers/permissionHandler.ts` routes Execute grants through
  `PluginHandler.installPluginOnPermissionGranted`.
- `src/handlers/pluginHandler.ts` — the Safe grant path probes owners through
  `SafeChainReaderModule.readOwners`, creates or reuses the canonical association, and marks both
  capabilities active. `null` means conclusively not a Safe, so it writes no association. A throw
  means the read was inconclusive: it leaves the permission row alone so a later reconciliation can
  create the association.
- The revoke path reconciles against active SPP settings rather than blindly uninstalling the row.
  It clears `isProcess` and the Execute condition while retaining an installed `isBody` association
  when an SPP body remains. Without either relationship it marks the association uninstalled.
- Both grant and revoke keep the permission write independent and refresh the DAO metrics.

Done when granting Execute to a Safe exposes the process, and revoking it removes only the Execute
capability while preserving any active SPP body.

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
moving DAO funds would no longer refresh transfers, assets or metrics. Fixed: `Plugin.findByAddress`
excludes `interfaceType: safe`, so `plugin` is null for a Safe and the execution stays a direct one.
Every other plugin type is exactly as it was.

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
  only when the canonical row is installed with `isProcess: true` and the caller is a current Safe
  owner. An installed SPP-body-only row is rejected before any owner or permission RPC. A
  conditional Execute grant counts as eligibility, but this endpoint has no action calldata and
  does not predict whether arbitrary actions satisfy the condition; runtime evaluates actions
  later. Grant and revoke condition updates target the installed row only, so deprecated rows
  cannot retain or receive the current condition.

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
