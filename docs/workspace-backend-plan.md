# Workspace backend implementation plan

Status: approved direction. Phases 1, 2 and 4 are implemented; phase 3 covers directly selected Safes only (see section 5). Nothing is deployed.

Source: `../../workspace.md` and the current backend source. This review establishes code coverage, not deployment or production-data coverage.

## 1. Confirmed scope

- A workspace supports accounts across multiple networks from the first release.
- The frontend supplies account selection from the workspace configuration. Backend workspace persistence is not required for this phase.
- Safe integration already exists and must be reused.
- Plan the assets, transactions, proposals, and members views before changing application code.

The meeting notes defer encryption, automated discovery, and workspace access control. Treat those as later features. Metadata, account labels, nicknames, social links, and target-contract references belong to the descriptor. Aggregation requests need account references and filters, not the entire descriptor.

Proposed MVP account types: indexed Aragon DAOs and Safes. Other executor types can be represented by future adapters; implementing EOA, governor, and timelock support is outside this first delivery. Asset coverage initially follows fungible/native balances; NFT portfolios and DeFi position valuation need separate scope decisions.

## 2. Existing implementation and reuse

| Concern | Evidence | Planning consequence |
| --- | --- | --- |
| Linked DAO aggregation | `src/services/aragon-api/controllers/{asset,transaction,proposal}.ts` | Reuse model queries, but extract explicit account scope instead of relying on parent/linked DAO expansion. |
| Asset grouping | `src/models/schema/asset.ts` | Existing grouping uses token address and network; add account allocations and defined total semantics. |
| Transaction identity | `src/models/schema/transaction.ts` | IDs include DAO address; the same event can produce two account records. Define event identity separately for workspace grouping. |
| Member sources | `src/governance/index.ts`, `src/services/aragon-api/controllers/member.ts` | Membership depends on governance type. `PluginMember` alone is insufficient for token/escrow governance. |
| Safe routes and gateway | `src/services/aragon-api/routers/v2/safe.ts`, `src/services/aragon-gateway/safe.ts` | Reuse info, queue, and next-nonce infrastructure. Gateway consumer is already registered. |
| Safe reads | `src/modules/safe/safeService.ts`, `safeChainReader.ts` | Owners/configuration come from chain; pending queue comes from Safe Transaction Service. Preserve cache, quota, error, and freshness behavior. |
| Safe governance relationships | `src/handlers/pluginSettingHandler.ts`, `src/modules/permissionEntities.ts` | Safe stage bodies and external proposers are already represented. Reuse these relationships. |
| Asset/history collection | `src/services/aragon-dao/{daoAssets,daoTransactions}.ts`, `src/modules/daoAddressCache.ts`, `src/modules/poolingCrawler.ts` | Collection remains DAO-oriented. Address-based asset reads do not establish standalone Safe balance/history completeness. |
| Versioned routing | `src/services/aragon-api/routers/index.ts` | V2 and V3 coexist; unversioned routes prefer V3. Add workspace routes deliberately and test explicit and fallback paths. |

The existing Safe queue fetches `executed: false`. It is not an executed-history source. Existing Safe unit tests cover routes, controller, gateway, chain reader, parsing, caching, and service behavior; they have not been run as part of this planning-only review.

## 3. Domain boundaries

An account is identified by `(network, normalized address)`. Workspace membership is a selection, not an ownership relationship. The same account can appear in multiple descriptors.

Introduce a shared account-scope resolver with these rules:

1. Validate supported networks and addresses, normalize casing, deduplicate exact pairs, and enforce an account limit.
2. Resolve known account type and per-resource capabilities using existing indexed data and Safe reads. A supplied type is a hint, not proof of support or authority.
3. Match exact pairs: `(network A AND address X) OR (network B AND address Y)`. Independent network/address lists would produce unintended combinations.
4. Apply resource filters after establishing scope. Filters can narrow results but cannot expand the selected accounts.
5. Empty account selection returns an empty result without querying all records.
6. Do not automatically add linked DAOs, target contracts, or Safe treasury holdings. The config must explicitly select treasury accounts.

For governance views, resolve the selected accounts' governance relationships. A Safe acting as an SPP body may appear as a governance source without its treasury becoming part of workspace assets. Deduplicate a source reached through multiple relationships and retain all relevant account/process references. Define whether its unrelated queue entries belong in the selected DAO's proposal feed; do not assume all Safe activity belongs to that DAO.

Keep account references and governance references separate in new response contracts. Existing OSX storage can retain its DAO/plugin associations; this phase does not require a repository-wide rename or a new general governance graph.

## 4. Proposed API contract

Add a workspace query surface that composes existing data access. Prefer additive routes over changing existing single-DAO response shapes:

- `POST /v2/workspaces/query/accounts`
- `POST /v2/workspaces/query/assets`
- `POST /v2/workspaces/query/transactions`
- `POST /v2/workspaces/query/proposals`
- `POST /v2/workspaces/query/members`

These are read queries. POST carries a bounded structured account list without long URLs; it does not create a workspace. Route names/version remain a review decision.

Illustrative request shape, not implementation code:

```json
{
  "accounts": [
    { "network": "ethereum-mainnet", "address": "0x..." },
    { "network": "base-mainnet", "address": "0x..." }
  ],
  "filters": {},
  "pagination": { "limit": 25, "cursor": null }
}
```

Proposed limits: 100 distinct accounts and a maximum page size of 50. The account limit is provisional until capacity testing; the page-size limit matches the current API. Filter fields and sort keys are resource-specific allowlists. Network-specific token/governance filters use complete references, not unqualified addresses.

Common response concepts:

- `data`: normalized items with source identity and account/governance references.
- `pagination`: continuation cursor, `hasMore`, and a result version where snapshot consistency is used.
- `coverage`: status per account and resource: ready, syncing, unsupported, or unavailable; stale data is an additional flag with its observation time.
- `partial`: some selected sources could not contribute. Totals explicitly describe only covered data when partial.
- Exact counts only when computable for the selected filtered result; otherwise omit them. Do not add upstream counts that include duplicates or use different filters.

Invalid input fails validation. A supported account with a temporary source failure remains in coverage instead of disappearing. Some usable sources can return a partial response; a complete source outage returns a service error. A fully unsupported selection returns explicit unsupported coverage, not a successful-looking empty portfolio. Preserve the current Safe error codes when mapping source failures.

The API does not need wallet authentication for these public-data reads. Workspace selection does not grant transaction permissions. Do not persist private descriptor content in public DAO/member records or log the full descriptor. Application cache keys include canonical scope and filters; descriptor titles and nicknames are not cache identity.

## 5. Resource behavior

### Assets

- Default grouping: `(network, token address)`, with normalized decimal-string amounts and per-account allocations.
- Native tokens retain network identity; token symbols never establish equivalence.
- A workspace USD total uses the complete filtered selection, not only the current page. Include pricing/freshness coverage and distinguish unpriced from zero-value assets.
- Apply account deduplication before summing, and spam filters consistently to data and totals.
- Reuse existing balance/price primitives. Verify token discovery, initial balances, refresh, and missing-data handling for standalone Safes before claiming support.

### Transactions

- Proposed first meaning: recorded transfers and executions. Pending Safe approvals appear in the proposals/tasks view; this placement needs product agreement.
- Sort across networks by event timestamp with a stable source ID tie-breaker. Do not compare block numbers across chains.
- Return account participation and mark transfers between selected accounts as internal.
- Group ERC20/NFT events only with proven event identity, including chain, transaction, log, and token/item identity where necessary. Do not deduplicate by transaction hash alone.
- Native transfers and execution-derived actions need source-specific identity. If existing data cannot prove two records are the same event, preserve them as account activity rather than silently collapsing them.
- An execution and its resulting transfer remain different record kinds and can be linked.
- Preserve original IDs for existing detail/action endpoints.

### Proposals / pending decisions

- Use a discriminated result: Aragon proposal or Safe queued transaction. Preserve native details rather than forcing Safe confirmations into vote totals.
- Aragon identity: network, plugin, proposal ID. Safe identity: network, Safe address, Safe transaction hash. Nonce alone is not unique because competing transactions can share it.
- Sort by creation/submission time, with stable source identity. Preserve the native status and expose a common status only where the mapping is justified.
- Keep governance source, related account/process references, and execution targets separate. Include only verified targets; destination calldata alone does not prove an executor relationship.
- Proposed default: top-level Aragon proposals and relevant pending Safe decisions, with subproposals available through an explicit filter. Historical Safe decisions require an additional history source.
- Implemented shape: indexed proposals are the paginated `data`; queued Safe transactions are returned whole in `pending`, one queue page (50) per Safe, sorted by submission time. A queue larger than that page is reported as `partial` coverage, not paged. Merging `pending` into the paginated list waits on the mixed-feed decision in section 6.
- Two ways a Safe contributes: a directly selected Safe contributes its whole queue; a Safe found in a selected DAO's active settings (SPP stage body branded as Safe, or external proposer) contributes only transactions addressed to that process plugin, tagged with `via`. A Safe that is both is read once, as a selected account. Coverage lists related Safes after the selection with the same `via`.
- Pending queue membership does not itself prove executability. Reuse nonce/liveness information and keep actions under the existing Safe transaction flow.

### Members

- Build a union of governance-specific memberships plus Safe owners. Resolve DAO governance using the existing factory and underlying token/plugin/escrow models.
- Canonical member rows retain network-qualified address identity by default; identical contract addresses on different chains are not assumed to represent the same member.
- Each row contains memberships with account, governance, role, and source-specific voting data. Deduplicate repeated memberships.
- Do not sum voting power across unrelated tokens or governance bodies. Workspace member count and governance membership count are different metrics.
- Filtering, deduplication, and ordering happen before pagination. Concatenating existing paginated member lists is insufficient.
- Catching a failed member source must produce unavailable coverage, not a false empty member list.
- Implemented: one governance source is read up to 20 pages of 50 per request; a larger source marks its DAO's members coverage `partial`. Members are merged, filtered and sorted in memory before paging.

## 6. Pagination and Safe capacity: resolve before implementation

DAO records are queryable in Mongo; the Safe queue is a mutable, offset-paginated upstream source. Fetching one page from each source and sorting it cannot guarantee a complete globally ordered page.

Recommended direction: Mongo keyset pagination for indexed history and proposals; a bounded shared snapshot or minimal read projection for Safe queues when they participate in a globally paginated feed. Reuse the gateway as the refresh owner and its existing Safe cache/budget. Do not introduce a second independent Safe poller.

Before choosing the mixed-feed mechanism, validate upstream ordering/filter support, queue sizes, existing cache reuse, mutation during paging, and quota cost. A snapshot must not be marked complete if refresh stopped early. If a complete view cannot fit the agreed limits, return explicit syncing/partial coverage or narrow the supported capacity; never silently truncate it.

Cursor identity binds normalized accounts, filters, sort, schema version, and any source snapshot versions. Changing selection or filters requires a new cursor. An expired snapshot requires a refresh. Document that indexed history uses a live keyset view unless a stronger snapshot is implemented; reorgs and deletions may invalidate previous results. A list snapshot does not establish transaction-action validity: existing live Safe nonce and signing checks remain authoritative.

The checked-in Safe global budget defaults to 300 upstream calls/hour; deployed values are unverified. At 100 Safes, one queue-page refresh per Safe already consumes 100 calls before pagination or nonce allocation. Shared caching reduces duplicate viewers' cost but cannot eliminate the cost of distinct Safes. Agree refresh cadence, cold-load behavior, account cap, and quota allocation after measuring this scenario.

## 7. Delivery sequence and completion criteria

| Phase | Deliverable | Completion evidence |
| --- | --- | --- |
| 0. Contract and coverage decisions | Final API examples, scope rules, source/status mapping, Safe balance/history coverage matrix, mixed-feed strategy and capacity limits | Resolve the decisions below; use representative accounts to establish data coverage when implementation discovery is authorized. No assumption that existing routes imply complete history. |
| 1. Shared scope and account coverage | Validator/resolver, exact-pair query builder, account capability response, resource coverage mapping | Empty/duplicate/mixed-network scopes work; filtering cannot broaden selection; one account failure is correctly represented. |
| 2. Assets and recorded transactions | Workspace queries over existing records; allocations, totals, event semantics, stable history pagination | Cross-network fixtures, internal transfers, token identity, missing prices, and filtered totals pass. Any Safe collection gaps are completed as separately scoped work before full support is advertised. |
| 3. Proposal and Safe queue aggregation | Aragon/Safe result mapping, source discovery, shared queue refresh/snapshot integration, pagination | Competing Safe transactions, source overlap, queue mutation, stale/rate-limited sources, and multi-page completeness are covered. Done so far: result mapping, rate-limited/unsupported coverage, Safes of selected DAO processes via active settings. Open: snapshot paging, multi-page completeness. |
| 4. Member aggregation | Governance-aware union with Safe owners and scoped metrics | Token, multisig, escrow, and Safe examples yield correct memberships and counts; no global voting-power total. |
| 5. Integration and rollout | Frontend contract fixtures, measured query plans, observability, operational rollout | Warm/cold capacity tests, explicit-version/root-route tests, existing DAO/Safe regressions, and migration/backfill checks pass. |

Safe asset/history ingestion is a conditional workstream, not a rewrite of the existing Safe integration. If needed, define tracked-account lifecycle, initial backfill range, checkpoints, refresh scheduling, and supported token/transfer kinds. Do not create fake DAO records or launch unbounded historical scans from a page read. A tracked-account collection may be necessary even though workspace configurations remain client-owned.

Add indexes based on representative Mongo explain plans. Measured on the dev cluster (same data volume as prod) with a two-account scope: the timestamp-sorted transaction feed fetched all 28k rows of the accounts and sorted in memory (6.3 s), while the same scope sorted by block number used a sorted index merge (4 ms). `Transaction` now has `{ daoAddress, network, blockTimestamp, id }` to match. Proposals and assets already used indexes for the scope match. Audit missing timestamps and event identifiers before enabling their corresponding sort/group semantics. New projections/indexes should be additive and backfillable; feature rollout can be disabled without disrupting existing account endpoints.

## 8. Validation matrix

- Same address on two networks; two addresses on two networks with unintended cross-pairs present in the database.
- Duplicate accounts, empty scope, maximum scope, invalid networks/addresses, filter outside scope, and cursor reused with changed filters.
- One account is both directly selected and reached through a governance relationship.
- Same token symbol on different chains, native token per chain, zero-decimal tokens, missing prices, and totals independent of page size.
- One internal transfer indexed for both accounts; multiple logs in one transaction; native batch actions; execution plus transfer.
- Equal timestamps, page boundaries, records arriving between pages, missing timestamps, reorg handling, and expired mixed-feed snapshots.
- Safe queue exceeding one page; competing transactions at one nonce; nonce advances; upstream throttling; stale cache; unsupported Safe network; total outage.
- Member belongs to multiple governance bodies; same address on multiple networks; token membership absent from PluginMember; failed member provider.
- Existing linked-DAO and single-DAO responses and Safe next-nonce behavior remain compatible.
- Capacity fixtures at 1, 10, and 100 accounts, including cold caches and multiple simultaneous viewers. Measure response latency, Mongo work, RPC/queue fan-out, and Safe budget consumption before setting an operational SLO.

## 9. Decisions for plan review

| Decision | Recommendation | State |
| --- | --- | --- |
| Multiple networks | Supported from day one | Confirmed by user |
| Workspace storage | Client-provided config/account list | Confirmed by user |
| Safe infrastructure | Reuse existing backend integration | Confirmed |
| Query surface | Additive POST workspace query routes | Proposed |
| Account scope | Exact config selection, no implicit treasury expansion | Proposed |
| Pending Safe placement | Proposals/tasks view; executed activity in transactions | Confirmed |
| Safe governance association | Include only decisions demonstrably relevant to selected processes unless the Safe account itself is selected | Needs contract/examples |
| Member identity | Network-qualified address with governance memberships | Proposed; confirm desired UI grouping |
| Safe assets/history | Verify collection coverage and implement only demonstrated gaps | Open technical prerequisite |
| Mixed-feed paging | Shared bounded snapshots/projection, refreshed through existing gateway | Open technical prerequisite |
| Capacity/refresh targets | Start with 100-account test target; agree supported cap against quota and measured latency | Open technical prerequisite |

Planning is complete when these decisions have concrete examples and the remaining technical prerequisites have bounded discovery tasks. Application implementation starts only after the plan review; this document does not authorize deployment or a data backfill.
