# Safe owners as DAO members

A Safe configured as an external body of an SPP process is a plugin on the DAO, so its owners are
members of that DAO — the same chain that makes a multisig body's signers members. Nothing on chain
states that relation: the Safe emits owner changes, the SPP emits body configuration, and
`@modules/safe/safeBodyMembers` is the only place the two are joined.

## Storage

`PluginMember` rows with `source: safe` (`IPluginMemberSource`) and `pluginAddress` set to the Safe.

| | plugin row | safe row |
|---|---|---|
| `pluginAddress` | multisig/admin plugin | Safe |
| Plugin document | exists | none |
| `id` | `network-member-plugin` | `network-member-safe-dao` |

The id differs because a plugin belongs to exactly one DAO and a Safe does not; the DAO segment is
what lets one Safe confer membership on several DAOs at once.

## Decisions

**1. Event-sourced, seeded from chain — not a read-time union.**
`AddedOwner` / `RemovedOwner` are registered in the indexer (`@indexer/configIndexer`) and handled by
`@handlers/safeOwnerHandler`. The owner set of a body is seeded from `getOwners()` whenever the body
set changes, so only later changes need following and historical crawling stays off. The index
therefore lags chain by the crawler's polling interval.

A read-time union of `getOwners()` was rejected: `GET /v2/daos/member/:address` and Explore's Member
filter are address-wide, so answering one page would mean reading every Safe on every DAO.

`ChangedThreshold` is not followed. Membership does not depend on the threshold, and the live
threshold is served from chain by `SafeChainReaderModule.readInfo`.

Safe ≤ 1.3.0 and ≥ 1.4.0 share `topic0` for these events but differ on whether the owner is an
indexed topic, so both ABI shapes are registered for the same topic (`@artifacts/Safe`).

**2. Fan-out.** `findDaosWithSafeBody` returns every DAO whose active `Setting` lists the Safe as a
stage body of a still-installed plugin. One `AddedOwner` writes a row per DAO; one `RemovedOwner`
withdraws them all. The `Setting` index `{ network, status, 'stages.plugins.address' }` exists for
this query: the events are network-wide, so it runs on logs that mostly match nothing.

**3. What the member count counts.** `daoMetrics.members` (`Dao.countUniqueMembers`) is a count of
distinct member **wallets** — token holders, lock holders, plugin member lists, and Safe body owners
— deduplicated, so a wallet that is both a token holder and a Safe owner counts once.

It is never the number an SPP stage threshold is compared against. `approvalThreshold` and
`vetoThreshold` live on `Setting.stages` and count **bodies**. A DAO whose only body is a 2-of-3 Safe
has one body and three members.

**4. Retraction** is a single reconcile, `syncDao(daoAddress, network)`, reached through
`syncDaoOrThrow` from `PluginSettingHandler.sppSettingsUpdated` (body set changed) and
`PluginSetupProcessorHandler.uninstallationApplied` (plugin gone). Both handlers also reconcile
when the matching log is already persisted, so a duplicate delivery can recover a prior failed
reconciliation. A dropped, replaced or uninstalled body simply stops appearing in the desired set
and its rows are deleted. Memberships from other routes are separate documents and are untouched.

An inconclusive owner read throws rather than reporting an empty owner set. That includes no
deployed bytecode (`getCode()` returns `0x`), undecodable or empty return data (`BAD_DATA`), and
transport or other errors. `syncDao` then leaves every row alone and returns `null`: stale
membership beats withdrawing real memberships when a provider blips. A `readOwners` `null` is
reserved for conclusive non-Safe answers: the zero address, or `CALL_EXCEPTION` from `getOwners()`
after bytecode was present. A newly encountered body then contributes no rows; existing rows for a
still-configured body are retained conservatively, and rows are withdrawn when that body is no longer
configured. A genuine EOA or a contract with an empty fallback can look like the no-code/empty-data
cases, so this policy fails the backfill and requires manual classification rather than guessing.

**5. Live retry and manual recovery.** The setting and uninstall handlers call `syncDaoOrThrow`
immediately, including on an existing-log path. When `syncDao` returns `null`, that guard throws.
The realtime `PoolingCrawler`'s underlying `BlockchainLogCrawler` uses `stopOnError: true`, so the
error happens before `onSaveProgress` and the `ConfigIndexer` cursor is not advanced. The next
pooling tick retries the same logs after the RPC recovers. There is no Safe-members RabbitMQ queue,
worker, retry queue or dead-letter queue.

The existing admin `/event-replay` endpoint queues a transaction for the `eventReplay` worker, which
replays configured handlers and reports per-handler failures. It isolates those failures rather than
retrying them automatically, so an administrator must submit the replay again after fixing the
underlying problem. This is the manual recovery path when the crawler is stopped or a specific
transaction needs reprocessing.

**6. Backfill.** `src/migrations/20260917101500-safeBodyMembers.ts` builds the `Setting` index and
reconciles every DAO that has stage bodies. It runs automatically on deploy, and because `syncDao`
reconciles rather than inserts, re-running it changes nothing. A DAO that returned `null` fails the
migration: `MigrationService` marks it failed and re-runs it on the next deploy, so an outage cannot
complete the one backfill there is with zero rows seeded.

## Identifying a Safe body

A stage body with **no Plugin document** whose `getOwners()` answers. `brandId` is not used:
legacy settings default it to `other`, and those bodies are still probed. A deployed custom body
whose `getOwners()` reverts is conclusively skipped; no-code or empty-fallback bodies require the
manual classification described above.

## Address casing

Body addresses, DAO addresses and owner addresses are all ethers-decoded and therefore EIP-55
checksummed on both sides of every join, which are exact-match. Nothing here lowercases.

## Endpoints

- `GET /v2/members?daoId=…&pluginAddress=<safe>` — the Safe body's member list. As with every other
  body type this endpoint requires `pluginAddress`; a Safe has no Plugin document, so the controller
  falls back to the `PluginMember` rows directly.
- `GET /v2/daos/member/:address` — Safe rows name their DAO directly instead of resolving through a
  Plugin document.
- `GET /v2/members/:memberAddress/:pluginAddress/exists` — answers for a Safe body unchanged.
- `daoMetrics.members` — see decision 3.
