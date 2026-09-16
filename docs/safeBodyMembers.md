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

**4. Retraction** is a single reconcile, `syncDao(daoAddress, network)`, called from
`PluginSettingHandler.sppSettingsUpdated` (body set changed) and
`PluginSetupProcessorHandler.uninstallationApplied` (plugin gone). A dropped, replaced or uninstalled
body simply stops appearing in the desired set and its rows are deleted. Memberships from other
routes are separate documents and are untouched.

A failed owner read throws rather than reporting an empty owner set, and `syncDao` then leaves every
row alone and returns `null`: stale membership beats withdrawing real memberships because a provider
blipped. Only a revert or an undecodable response (`CALL_EXCEPTION` / `BAD_DATA`) means "this body is
not a Safe".

**5. Backfill.** `src/migrations/20260917101500-safeBodyMembers.ts` builds the `Setting` index and
reconciles every DAO that has stage bodies. It runs automatically on deploy, and because `syncDao`
reconciles rather than inserts, re-running it changes nothing. A DAO that returned `null` fails the
migration: `MigrationService` marks it failed and re-runs it on the next deploy, so an outage cannot
complete the one backfill there is with zero rows seeded.

## Identifying a Safe body

A stage body with **no Plugin document** whose `getOwners()` answers. `brandId` is not used: it
defaults to `other` on settings written before that field existed, which is exactly the population
the backfill exists for.

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
