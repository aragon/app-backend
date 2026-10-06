# Safe owners as DAO members

A Safe attached to a DAO as an Execute process or an external SPP body contributes its owners to
DAO member reads and distinct-member counts. The Safe emits owner changes; DAO-scoped `Plugin` rows
and SPP settings provide the associations joined by `@modules/safe/safeBodyMembers`.

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
unindexed owner topics) with historical indexing disabled. The events are matched network-wide.
A successful relation lookup filters out a Safe that has never produced a global ownership row and
has no current DAO relation, but a previously known Safe keeps receiving owner updates even when
its DAO association is temporarily absent. If relation discovery fails, the event still mutates
ownership rather than treating an unknown relation as absent. This can retain an unrelated Safe's
ownership during an outage; DAO visibility still requires an active association. An addition upserts
one global tuple; a removal deletes that tuple once.

The handler finds every DAO whose active SPP setting or installed Safe process refers to the Safe
and fans out one `daoMetrics` refresh per DAO. Failed discovery cannot fan out metrics. A
`SafeMember` row may remain while no DAO refers to the Safe; it grants no DAO visibility until a
valid association exists.

`ChangedThreshold` is not followed. Membership does not depend on the threshold, and the live
threshold is served from chain by `SafeChainReaderModule.readInfo`.

**2. DAO visibility comes from an exact association.**

A SafeMember contributes to a DAO when `(network, daoAddress, safeAddress)` resolves through either:

- an installed `Plugin` row with `interfaceType: safe`; or
- an active setting whose installed SPP parent contains the Safe address and `brandId: safe` in the
  same nested `$elemMatch`.

The address and brand must be paired in the same nested match; independent dotted predicates can
match different bodies. Association results are deduplicated. Counts and API controllers resolve
this capability before generic `Plugin` or `PluginMember` rows.

**3. Seeding is SAFE-only and has a zero-row gate.**

When SPP settings change, and in
`src/migrations/20260917101500-safeBodyMembers.ts` for existing installations, the module discovers
unique SAFE-branded bodies from active settings whose parent SPP plugin is installed. For each Safe
with no existing `SafeMember` row on that network, `seedDao` reads `getOwners()` once and upserts
the global owner tuples. Safe reads, base-member writes, and owner persistence failures are logged
at the seed boundary and do not throw through settings persistence or migration execution.

The zero-row gate remains deliberate for ordinary event/settings seeding: it avoids replacing an
owner set that an event has already started to populate. A partial insert can therefore still leave
the snapshot incomplete. The explicit `SafeBodyMembersModule.reconcileOwners` path bypasses that
gate, reads current owners for every visible Safe, canonicalizes Safe and owner addresses with
ethers, and upserts missing tuples without deleting anything. `RegisterSafeProcesses` invokes this
addition-only reconciliation after each applied Safe association, so its manual replay repairs a
partial owner index while leaving possible stale rows for the event path to handle.

## Owner-index recovery proof and operations

The local proof is `test/unit/tools/registerSafeProcesses.spec.ts` and uses the repository's
in-memory MockDB only; it is not a run of the shared test environment. It proves:

| run | Safe process `Plugin` | `PluginSlug` | `SafeMember` owner tuples |
|---|---:|---:|---:|
| dry-run before/after | 0 | 0 | 0 |
| apply before → after | 0 → 1 | 0 → 1 | partial 1 → complete 2 |
| identical apply rerun | remains 1 | remains 1 | remains 2 |

Shared-environment prerequisites, exact migration/backfill commands, the disposable partial-owner
proof, and case-insensitive duplicate checks are documented in `safeProcessAndAccount.md`. The
backend SME must record the before/apply/rerun counts there; local MockDB results must not be
reported as shared-environment execution.

**4. Counts are distinct wallets.**

`daoMetrics.members` (`Dao.countUniqueMembers`) counts distinct wallet addresses across token,
lock, admin/multisig plugin, Safe process, and settings-visible SafeMember routes. A wallet present
through more than one route counts once. This is not the number used for SPP stage thresholds:
thresholds count bodies from `Setting.stages`.

The Safe conversion migration also queues one existing `daoMetrics` message per unique legacy
`(network, daoAddress)` after its successful conversion pass, so materialized counts can recompute
under the settings-derived relation rules.

**5. No Safe-specific crawler retry or retraction path.**

Setting and uninstall handlers do not call `syncDao`, `syncDaoOrThrow`, or a Safe-specific retry
queue. Uninstalling a Safe process or SPP parent, or deactivating a setting, removes that DAO
association for queries and metrics; it does not delete global SafeMember ownership. Owner events
continue to update the global row even when the Safe's DAO association is temporarily absent; the
existing global row keeps the Safe known for that purpose. DAO visibility still requires an active
association.

The Safe grant backfill's owner reconciliation is the recovery path for an arbitrary partial owner
snapshot. Event replay only repairs a known missed owner transition.

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

- `GET /v2/members?daoId=…&pluginAddress=<safe>` resolves an installed Safe process or active
  SAFE-branded SPP body, then reads matching `SafeMember` rows. It does not fall back to a colliding
  plugin or a legacy `PluginMember` row.
- `GET /v2/daos/member/:address` resolves owned Safes to exact `(network, daoAddress)` associations.
  Normal admin/multisig membership continues to use `PluginMember`.
- `GET /v2/members/:memberAddress/:pluginAddress/exists?network=…` applies the same active
  association gate.
- `daoMetrics.members` uses the distinct-wallet count described above.
