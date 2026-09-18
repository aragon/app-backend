# Safe owners as DAO members

A Safe configured as an external body of an SPP process can contribute its owners to DAO member
counts. The Safe emits owner changes and the SPP setting records the body relation; those facts are
joined by `@modules/safe/safeBodyMembers` and the consumers that use its relation helpers.

## Storage

Safe ownership is global. `SafeMember` has no DAO field and is unique by
`(network, safeAddress, memberAddress)` with the id
`${network}-${safeAddress}-${memberAddress}`.

| collection | fields | ownership scope |
|---|---|---|
| `SafeMember` | `network`, `safeAddress`, `memberAddress`, `id` | one row per Safe owner on a network |
| `PluginMember` | normal plugin membership fields | admin and multisig/plugin membership only |

The old per-DAO `PluginMember` rows with `source: safe` were written only by pre-refactor revisions
of this branch; fresh deployments have none. The later conversion migration reads any such rows
through the raw collection, upserts the global tuple regardless of the current setting brand, and
deletes each legacy row only after the destination write succeeds or the tuple is confirmed after a
duplicate-key error. Malformed rows are logged and left in place. A valid-row write or delete
failure fails the migration so the row remains available for the migration runner to retry.

`SafeMember` has lookup indexes for network, Safe, and owner access. `Setting` retains the reverse
body-address index `{ network, status, 'stages.plugins.address' }` for network-wide owner events.

## Decisions

**1. Global, event-sourced ownership — not per-DAO ownership.**

`AddedOwner` and `RemovedOwner` are registered for both Safe ABI event shapes (indexed and
unindexed owner topics) with historical indexing disabled. The events are matched network-wide,
but a successful relation lookup filters out unknown Safes with no current DAO relation. Previously
seeded Safes keep updating when their DAO relations lapse. If relation discovery fails, the event
still mutates ownership rather than treating an unknown relation as absent. This can retain an
unrelated Safe's ownership during an outage; DAO visibility still requires the settings gate below.
An addition upserts one global tuple; a removal deletes that tuple once.

The handler finds every DAO whose active installed SPP setting currently refers to the Safe and
fans out one `daoMetrics` refresh per DAO. Failed discovery cannot fan out metrics. A SafeMember row
may remain while no DAO refers to the Safe; it grants no DAO visibility until a valid setting relation
exists.

`ChangedThreshold` is not followed. Membership does not depend on the threshold, and the live
threshold is served from chain by `SafeChainReaderModule.readInfo`.

**2. DAO visibility comes from settings.**

A SafeMember contributes to a DAO only when all of these conditions hold:

- the `Setting` is active;
- one nested stage body has both the requested Safe address and `brandId: safe` in the same
  `$elemMatch`;
- the setting's parent `Plugin` is installed and has SPP interface type.

The address and brand must be paired in the same nested match; independent dotted predicates can
match different bodies. Counts and API controllers use this relation gate instead of treating a
SafeMember row as a direct DAO membership.

**3. Seeding is SAFE-only and has a zero-row gate.**

When SPP settings change, and in
`src/migrations/20260917101500-safeBodyMembers.ts` for existing installations, the module discovers
unique SAFE-branded bodies from active settings whose parent SPP plugin is installed. For each Safe
with no existing `SafeMember` row on that network, it reads `getOwners()` once and upserts the global
owner tuples. Safe reads, base-member writes, and owner persistence failures are logged at the seed
boundary and do not throw through settings persistence or migration execution.

The zero-row gate deliberately avoids replacing an owner set that an event has already started to
populate. An owner event or a partial insert can therefore create some rows before a full seed; the
zero-row gate then skips the snapshot. There is no completeness checker or automatic retry
machinery. The chain reader remains strict; only the seed boundary catches its failures.

**4. Counts are distinct wallets.**

`daoMetrics.members` (`Dao.countUniqueMembers`) counts distinct wallet addresses across token,
lock, admin/multisig plugin, and settings-visible SafeMember routes. A wallet present through more
than one route counts once. This is not the number used for SPP stage thresholds: thresholds count
bodies from `Setting.stages`.

The Safe conversion migration also queues one existing `daoMetrics` message per unique legacy
`(network, daoAddress)` after its successful conversion pass, so materialized counts can recompute
under the settings-derived relation rules.

**5. No Safe-specific crawler retry or retraction path.**

Setting and uninstall handlers do not call `syncDao`, `syncDaoOrThrow`, or a Safe-specific retry
queue. Uninstalling an SPP parent or deactivating a setting removes the DAO relation for queries and
metrics; it does not delete global SafeMember ownership. Owner events continue to update the global
row even when the relation is temporarily absent. The existing event replay endpoint remains a
manual way to replay handlers when an operator explicitly requests it.

## Identifying a Safe body

A body grants DAO membership through Safe ownership only when its nested setting body is branded
`safe`, its setting is active, and its parent plugin is an installed SPP. The backfill uses the same `seedDao`
boundary rather than probing unbranded or ordinary plugin bodies. Legacy bodies still branded
`other` are excluded. Neither migration changes body brands; including those bodies requires an
explicit brand correction.

Body, DAO, and owner addresses read from chain are normalized with ethers before event and relation
joins. The raw legacy conversion preserves the stored network/address tuple while constructing the
contracted global id.

## Endpoints

- `GET /v2/members?daoId=…&pluginAddress=<safe>` validates the active installed SPP SAFE-body
  relation, then reads the matching `SafeMember` rows. It does not fall back to direct DAO fields on
  a legacy PluginMember row.
- `GET /v2/daos/member/:address` resolves SafeMember owners through active SAFE-branded SPP
  settings, batching the owned Safe addresses into one relation query per network. Normal
  admin/multisig membership continues to use PluginMember.
- `GET /v2/members/:memberAddress/:pluginAddress/exists` applies the same settings relation gate for
  Safe bodies.
- `daoMetrics.members` uses the distinct-wallet count described above.
