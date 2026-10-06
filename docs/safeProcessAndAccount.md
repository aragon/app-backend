# Safe process and body backend contract

A Safe may be attached to Aragon governance through existing DAO data. A standalone APP-1166 Safe
is registered as an account through a workspace and does not create a DAO or plugin.

## Identity and storage

| Concern | Identity | Storage |
|---|---|---|
| Safe | `(network, safeAddress)` | chain reads, `SafeMember`, `SafeTransaction` |
| standalone Safe account | `(network, safeAddress)` | `SafeAccount`; never `Plugin` or `Dao` |
| DAO association | `(network, daoAddress, safeAddress)` | `Plugin` for an Execute process; `Setting.stages[].plugins` for an SPP body |
| owner | `(network, safeAddress, memberAddress)` | `SafeMember` |
| Safe transaction | `(network, safeAddress, safeTxHash)` | `SafeTransaction` |

The same Safe may serve several DAOs, be both an Execute process and an SPP stage body, and also be
registered as a standalone account. Owner rows and transaction rows are global to the Safe; DAO
relations and account registration are not. A nonce is display and reconciliation data, not
transaction identity, because competing Safe transactions may share a nonce.

## Roles

### DAO Execute process

A DAO-level `EXECUTE_PERMISSION` grant to a Safe creates or reinstalls one DAO-scoped `Plugin` row:

```json
{
  "address": "<safeAddress>",
  "daoAddress": "<daoAddress>",
  "network": "<network>",
  "interfaceType": "safe",
  "status": "installed",
  "isSupported": true,
  "isBody": true,
  "isProcess": true,
  "isSubPlugin": false
}
```

The permission handler probes `getOwners()` before classifying an unknown grantee as a Safe. Revocation uninstalls that DAO association without deleting global owner or transaction rows. Regrant reuses the row and restores the current flags and Execute condition.

Conditional and unconditional grants are both authoritative:

- conditional grant: store the condition and index selector events for this DAO/Safe/condition;
- unconditional grant: clear an older condition and its detected interface;
- same-condition regrant after revocation: replay that condition's selector history so events emitted while the grant was inactive are not skipped.

### SPP stage body

An SPP body remains an entry in `Setting.stages[].plugins`. Its stage configuration is setting-owned. Proposal and DAO enrichment may enrich non-Safe stage plugins only from the same DAO. A top-level Safe process row must not overwrite stage fields such as `brandId`, `proposalType`, `condition`, or report context.

Repeated references to the same Safe are deduplicated when resolving DAO membership associations.

## Members and DAO discovery

Safe membership means Safe ownership, gated by an active DAO association. The association resolver accepts either:

1. an installed DAO-scoped Safe process row; or
2. an active installed SPP setting containing a SAFE-branded stage body.

Controllers resolve this capability before generic plugin records. A legacy or colliding `Plugin`/`PluginMember` row cannot redirect an active Safe relation.

- `GET /v2/members?daoId=<network>-<dao>&pluginAddress=<safe>` returns `SafeMember` owners.
- `GET /v2/members/<owner>/<safe>/exists?network=<network>&daoAddress=<dao>` checks the exact
  association. Omitting `daoAddress` retains the legacy any-active-association check.
- `GET /v2/daos/member/<owner>` discovers DAOs through exact `(network, daoAddress)` pairs. The same DAO address on another network is a different association.

## Creation eligibility

Use the DAO-scoped endpoint for Safe processes:

```text
GET /v2/proposals/can-create-proposal
  ?network=<network>
  &daoAddress=<daoAddress>
  &pluginAddress=<safeAddress>
  &memberAddress=<callerAddress>
```

A Safe request is allowed only when:

1. the caller is a current Safe owner;
2. the exact `(network, daoAddress, safeAddress)` process is installed; and
3. the DAO currently grants that Safe an active `EXECUTE_PERMISSION`.

A current conditional grant counts as eligible here, but this endpoint has no action calldata and
does not predict whether arbitrary actions satisfy that condition. Action-specific condition
evaluation happens later with the real actions. For an unconditional grant, runtime verifies the
plain permission with its empty execute check.

Missing `daoAddress`, a revoked grant, a stranger, or a failed owner read returns `false`. An SPP
body-only Safe is a separate role and is not implicitly an Execute process.

## Transactions and proposals

`SafeTransaction` is unique by `(network, safeAddress, safeTxHash)`. Event hashes are canonicalized before lookup. Pending rivals with the same nonce remain separate rows; execution marks the matching hash executed and only supersedes its rivals.

Ordinary plugin proposals remain DAO-scoped. Execution lookup uses `(network, daoAddress, pluginAddress, proposalIndex)`, preventing a reused plugin address from resolving another DAO's proposal.

## API behavior examples

### Members with a colliding generic plugin row

Before: generic plugin lookup could win and return plugin members or an empty page.

After:

```http
GET /v2/members?daoId=ethereum-mainnet-0xdao&pluginAddress=0xsafe
```

```json
{
  "data": [{ "address": "0xowner" }],
  "metadata": { "totalRecords": 1 }
}
```

### DAO-scoped creation

```http
GET /v2/proposals/can-create-proposal?network=ethereum-mainnet&daoAddress=0xdaoA&pluginAddress=0xsafe&memberAddress=0xowner
```

```json
{ "status": true }
```

The same request with `daoAddress=0xdaoB`, without `daoAddress`, after revoke, or from a non-owner returns:

```json
{ "status": false }
```

## Existing-data backfill

`RegisterSafeProcesses` scans the latest event for each DAO-level Execute grantee, keeps currently
held grants, canonicalizes DAO/Safe addresses with ethers before calling handlers, probes Safe
ownership, and creates, reinstalls, or repairs the canonical DAO-scoped row. In apply mode it also
reads the current owners for every visible Safe through the addition-only reconciliation path, so a
partial `SafeMember` index left by the zero-row seed gate is repaired. It does not deploy anything
or delete owner tuples.

Dry run:

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

`test/unit/tools/registerSafeProcesses.spec.ts` is a local MockDB proof, not a run of the shared
test environment. It records these observable counts:

| run | Safe process `Plugin` | `PluginSlug` | `SafeMember` owner tuples |
|---|---:|---:|---:|
| dry-run before/after | 0 | 0 | 0 |
| apply before → after | 0 → 1 | 0 → 1 | partial 1 → complete 2 |
| identical apply rerun | remains 1 | remains 1 | remains 2 |

The shared command requires:

- the Docker/backend image built from the target revision, with this migration and tool present;
- a transaction-capable MongoDB replica set containing the target data and indexes;
- RPC providers for each selected network that can answer Safe `getOwners()` calls;
- the backend's RabbitMQ broker and queue configuration.

The local proof does not establish a shared-environment run. The backend SME must use a disposable
test-environment Safe and record the selected `(network, daoAddress, safeAddress)` before running:

```bash
pnpm mig:status
pnpm mig:run
pnpm mig:status
TOOL_RUN=RegisterSafeProcesses TARGET_NETWORK=<network> pnpm tool
TOOL_RUN=RegisterSafeProcesses EXECUTE=true TARGET_NETWORK=<network> pnpm tool
TOOL_RUN=RegisterSafeProcesses EXECUTE=true TARGET_NETWORK=<network> pnpm tool
```

The dry run must leave `Plugin`, `PluginSlug`, and `SafeMember` counts unchanged. The first apply
must create or repair the expected rows. The second apply must leave all three counts unchanged.
Inspect `db.Plugin.getIndexes()` and require the named `plugin_safe_association_unique` index to be
unique, partial on `interfaceType: "safe"`, and case-insensitive (`collation.strength: 2`).

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

Reruns are data-idempotent: they reuse the DAO/Safe row, slug, global owners, and current
condition. Invalid persisted grant addresses are counted and logged while valid grants continue.

## Deployment order

1. Deploy database migrations and indexes.
2. Deploy indexer, gateway workers, and API code together.
3. Run the backfill in dry-run mode, then apply it one network at a time.
4. Validate member list, member existence, DAO discovery, creation eligibility, and one real non-empty Safe history read.
5. Deploy frontend process/body filtering only after backend rows report both `isBody: true` and `isProcess: true` and DAO-scoped creation requests include `daoAddress`.

Rolling the frontend first is unsafe: older backend rows can be missing body capability, and an unscoped creation check must fail closed.

## Verification matrix

The focused regression suite covers:

1. Safe process only;
2. SPP body only;
3. both roles in one DAO;
4. the same Safe in two DAOs;
5. repeated Safe references in settings;
6. multiple networks;
7. revoked Execute grant;
8. conditional Execute grant and regrant;
9. missing or failed owner read;
10. Safe transaction hash identity with competing nonces.

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

## Verification results

```text
pnpm type-check    exit 0
pnpm format:check  1044 files checked, no fixes
pnpm lint          542 files checked, no errors (2 existing config infos)
pnpm test:unit     6738 passing, 5 pending
pnpm test:dotonly  no focused tests
```

# Track B — Standalone Safe as an account (APP-1166 recovery)

The APP-1166 account track is separate from the DAO process/body contract above. A Safe with no
Aragon DAO behind it is account-scoped: it is registered through a workspace, lives in its own
collection, and never appears in `Plugin` or `Dao`.

The shared Safe read endpoints already in scope are
(`/v2/safe/:network/:address/{info,queue,history,next-nonce}`), along with the shared cache and
hourly budget, `aragonReports` correlation, and global `SafeMember` owner storage.

## B1. Storage

A new collection, keyed `(network, address)`. A Safe is inserted when it is added to a workspace
and is what makes the Safe known to the indexer and to the read endpoints. Nothing about it is
DAO-shaped and it never appears in `Plugin` or `Dao`.

This is also the missing registration trigger for owner indexing: `AddedOwner` / `RemovedOwner` are
matched network-wide, but `safeBodyMembers` drops every Safe that is not a body, so a standalone
Safe is never indexed today. Registration makes it tracked.

## B2. Members

`SafeMember` is already account-shaped — `(network, safeAddress, memberAddress)` with no DAO field —
so the storage needs no change. What changes is the read: every current path gates on "an active SPP
setting lists this Safe as a stage body", which a standalone Safe never satisfies.

A registered account is the third source of the visibility resolver described above.

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
Aragon context. `SafeTxServiceModule` exposes only `get` today, so this is a new path: one POST,
through the same limiter and budget as every other upstream call.

`confirmSafeTransaction` follows the same route so a confirmation updates the row it belongs to
instead of arriving only on the next queue read. Neither call holds a signature of ours; the wallet
signs, we forward.

# APP-1166 slice plan

Each slice ships on its own. Nothing later is needed for something earlier to be correct. Slices 1–5
are the process, transaction, and membership prerequisites; slices 6–9 are the standalone-account
work that completes APP-1166.

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
- Fill the row as the canonical process row above (`isBody: true`, `isProcess: true`), then
  `PluginSlug.generateSlug`.
- Revoke needs no new code — `uninstallPluginWithPermissionRevoke` is already wired at
  `permissionHandler.ts:102` — but it needs a test, because nothing has ever reached it with a Safe.

Done when granting execute to a Safe makes a process tab appear with an empty proposal list, and
revoking it marks the row uninstalled.

## Slice 3 — The `SafeTransaction` collection

- New `src/models/schema/safeTransaction.ts`. Keyed `(network, safeAddress, safeTxHash)`. Holds the
  envelope, proposer, confirmations last seen, nonce, state, last-refreshed, plus `rawActions` and
  `targets` as described above. Models load themselves from the schema directory, so registration is
  `ICollectionNames` and `IMongoModel` in `src/types/db.ts`, nothing more.
- New `src/modules/safe/safeTransactions.ts` — split a transaction into `rawActions`, derive
  `targets`, upsert a page, reconcile against the nonce.
- `src/modules/safe/safeService.ts` — `readQueue` gains an `afterFetch` hook that runs only on a
  real fetch, never on a cache hit or a stale answer, and is not awaited: bookkeeping must not stand
  between the caller and a page already in hand. No `to` on the upstream read; see the transaction
  contract above.
- Reconciliation uses `SafeChainReaderModule.readNonce`, read in the same hook. Live rows below the
  current nonce become `superseded`. The one that executed at that nonce is not in an
  `executed=false` page at all, so everything this sees below the nonce is a loser.
- An index migration, following `20260827120000-syncSafeCacheIndexes`.

Done when a queue read leaves rows behind with the right states and the right targets, including for
a batched transaction. Serving a list from them comes with the endpoint that needs it.

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
  from an installed current Execute grant and Safe ownership, not from ownership alone. A
  conditional grant counts as eligibility, but this endpoint has no action calldata and does not
  predict whether arbitrary actions satisfy the condition; runtime evaluates actions later.

Done when the members page lists the Safe's owners for a Safe process and can-create matches the
current grant and owner state without pretending to authorize arbitrary calldata.

## Slice 6 — The registered Safe account

New collection keyed `(network, address)`, plus the endpoint that registers one. A Safe is inserted
when it is added to a workspace, and that row is what makes it known to the indexer and the reads.
Nothing else consumes it yet.

Done when a Safe can be registered and read back.

## Slice 7 — Widen the gates to a registered account

- The visibility resolver from slice 5 gains its third source: a registered account.
- The `tracked` check in the owner-event path is widened the same way, so `AddedOwner` and
  `RemovedOwner` continue to update a known standalone Safe even when no DAO association is
  currently present. This is the missing registration trigger called out in B1.

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
