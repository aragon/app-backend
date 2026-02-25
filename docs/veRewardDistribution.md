# Exit Fee Reward Distribution

## Overview

When a vKAT holder exits their lock early, an exit fee in KAT is collected. This fee is distributed proportionally to addresses whose voting power was actively used in gauge voting during that epoch.

The core rule: rewards go to the **original token owner**, not the address that cast the vote. If Jordan delegates a 50 VP veNFT to Alice and Alice votes, Jordan gets credit for 50 VP worth of rewards.

Reference spec: [EXIT_FEE_DISTRIBUTION_SPEC](https://github.com/aragon/ve-governance/blob/exp/katana-spec/EXIT_FEE_DISTRIBUTION_SPEC.md)

---

## Contract Setup

| Contract | Address | Purpose |
|---|---|---|
| AddressGaugeVoter | `0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9` | Gauge voting plugin |
| Clock | `0x18b15d288db30411866ceda969dd703c6e29d9d9` | Epoch/timing parameters |
| VotingEscrow | Resolved at runtime via `getEscrowAddress()` | veNFT lock & VP curves |
| EscrowIVotesAdapter | Resolved at runtime via `getIVotesAdapterAddress()` | Delegation tracking |
| Lock NFT | Resolved at runtime via `getNftLockAddress()` | Token ownership |

**Persistent Voting:** The plugin has `enableUpdateVotingPowerHook = true`, meaning votes are stored under epoch 0 and carry forward until the voter resets or re-votes.

---

## Epoch Timing

| Parameter | Value |
|---|---|
| Epoch Duration | 14 days (1,209,600s) |
| Vote Duration | 7 days (604,800s) |
| Vote Window Buffer | 1 hour (3,600s) |
| Snapshot Buffer | 5 minutes (300s) |

All timing is deterministic:

```
epochId       = timestamp / 1,209,600
epochStart    = epochId × 1,209,600
voteEnd       = epochStart + 604,800 - 3,600    (= epochStart + 601,200)
snapshotTs    = voteEnd + 300
```

Timeline for a single epoch:

```
Day 0                     Day 6 + 23h          Day 7             Day 14
│ Voting Window           │ Voting Closes       │                 │ Next Epoch
├─────────────────────────┤─────────────────────┤─────────────────┤
                          ▲
                     voteEnd
                          │
                          +5min = backend_snapshot_ts (earliest reward generation)
```

Reward generation is validated to run within `[voteEnd + 300s, nextEpochStart)`. `VeRewardDistribution.validateEpochWindow()` enforces this.

### Contract Modes

The `enableUpdateVotingPowerHook` flag changes VP resolution:

| | Secure mode (`false`) | Live mode (`true`) |
|---|---|---|
| VP evaluation | `getPastVotes(V, epochStart)` | `getVotes(V)` at vote block |
| `vp_ts[V]` | `epochStart` — same for all voters | `block.timestamp` of V's `vote()` tx |
| Vote storage | Per-epoch: `epochVoteData[epochId]` | Global: `epochVoteData[0]`, persists until reset |
| `writeEpochId` | `epochId` | `0` |

---

## Class Architecture

`VeRewardDistribution` in `src/modules/veRewardDistribution.ts` encapsulates the full reward computation. Constructor takes `{ epochId, pluginAddress, network, rewardTotalAmount }`.

### Methods

| Method | Purpose |
|---|---|
| `init()` | Resolves clock, escrow, adapter, lockNFT addresses + voting period + hook flag |
| `validateEpochWindow()` | Validates current time falls within `[voteEnd + 300s, nextEpochStart)` |
| `resolveOnChainTotal(txHash)` | Parses tx receipt to extract `totalVotingPowerInContract` from Voted/Reset events |
| `resolvePerGaugeOnChainTotals()` | Fetches `totalVotingPowerInGauge` from the latest tx receipt per gauge |
| `resolveRewardEntries(activeVoters)` | Resolves delegation state per voter, batch-fetches VP, returns flat `RewardEntry[]` |
| `computeOwnerRewards(entries, onChainTotal)` | Groups entries by owner, computes proportional rewards with dust redistribution |
| `compute()` | Orchestrates the full pipeline: init → voters → on-chain total → resolve → invariants → result |

### Pipeline flow

```
init()
  → resolve clock, escrow, adapter, lockNFT addresses
  → resolve hookEnabled flag + votingPeriod

validateEpochWindow()
  → reject if outside [voteEnd + 300s, nextEpochStart)

VoteGauge.getActiveVoters()
  → aggregate vote records where blockTimestamp <= voteEnd
  → group by voter, sum usedVP, track latestBlock/latestTxHash

resolveOnChainTotal(latestTxHash)
  → parse tx receipt for totalVotingPowerInContract

resolveRewardEntries(activeVoters)
  → hookEnabled=true:  per-voter delegation snapshots via getDelegationSnapshots()
  → hookEnabled=false: single global aggregation via getActiveDelegations()
  → batch-fetch votingPowerAt(tokenId, vp_ts[V]) for each token

computeOwnerRewards(entries, onChainTotal)
  → group by owner, sum VP
  → rewardAmount = (votingPower * rewardTotalAmount) / onChainTotal
  → dust redistribution to largest recipient

invariant checks (inline in compute())
  → 1a, 1b, 2a, 2b, 3
```

---

## Reward Algorithm (4 Steps)

### Step 1: Determine Active Voters

`VoteGauge.getActiveVoters()` aggregates all vote/reset records where `blockTimestamp <= voteEnd`. Groups by voter, takes their most recent transaction, and sums `votingPowerCastForGauge` across all gauges in that transaction into `usedVP`.

Since the contract resets all previous votes before applying new ones in a single transaction, the most recent transaction always captures the voter's complete state.

**INVARIANT 1a:** `SUM(usedVP) == totalVotingPowerInContract` from the latest on-chain event's tx receipt.

**INVARIANT 1b:** Per-gauge VP sums match on-chain `totalVotingPowerInGauge` values. Fetched via `resolvePerGaugeOnChainTotals()` which gets the latest tx receipt per gauge.

### Step 2: Resolve Delegation Sources Per Voter

For each active voter V, determine which veNFT token IDs were delegated to V at `vp_ts[V]`.

**Secure mode** (`hookEnabled=false`): `TokenDelegation.getActiveDelegations()` — single MongoDB aggregation with `blockNumber <= epochStartBlock`. All voters share the same global timestamp.

**Live mode** (`hookEnabled=true`): `TokenDelegation.getDelegationSnapshots()` + per-voter JS resolution. Each voter's delegation state is resolved at that voter's specific `latestBlock`.

#### Per-voter resolution (live mode)

1. Single DB query returns full delegation history per `(delegator, tokenId)` with snapshots sorted by `(blockNumber desc, logIndex desc)`
2. Groups are pre-indexed into `Map<delegate, groups[]>` for O(1) lookup
3. For each voter, find the first snapshot where `blockNumber <= voter.latestBlock`
4. Include token if `snap.action === 'delegate' && snap.delegate === voter`

This correctly handles re-delegation mid-epoch: if token #274 was delegated to voter A then re-delegated to voter B before A's vote block, A won't see it.

**INVARIANT 2b:** Each token ID appears in exactly one voter's delegation set. A `tokenId → Set<voters>` map is built and duplicates are flagged.

### Step 3: Attribute VP to Original Token Owners

For each delegated token, `votingPowerAt(tokenId, vp_ts[V])` is batch-fetched via `Web3BatchHelper.getLockVotingPowerAtInBatch()`. VP depends on both locked amount and lock age (the escrow uses a decay curve), so raw locked amounts would be inaccurate.

VP is credited to the token's **delegator** (the address that owns and delegated the token), not the voter.

**INVARIANT 2a:** For each voter V, `SUM(votingPowerAt(tokenId, vp_ts[V]))` across delegated tokens must equal `usedVP[V]`. Rounding tolerance is set to the number of gauges.

**INVARIANT 3:** `SUM(credit[owner])` across all owners must equal `onChainTotal`.

### Step 4: Compute Proportional Rewards

```
rewardAmount = (votingPower * rewardTotalAmount) / onChainTotal
```

Integer division dust is redistributed to the largest VP holder so `SUM(rewardAmount) == rewardTotalAmount` exactly.

---

## Campaign Lifecycle

### Draft-to-Real Campaign Reconciliation

Campaigns start as drafts with a random UUID. When the on-chain `CampaignCreated` event is indexed (`capitalDistributorHandler.ts`), the handler detects draft merkle roots and atomically updates `CampaignReward` records to the real campaign ID.

---

## Merkle Tree & Proof Delivery

### Generation

`CapitalDistributorGovernance.generateMerkleData()` builds the tree:

1. Fetch all `CampaignReward` docs for the campaign
2. Call `MerkleTreeHelper.generateTreeWithProofs(rewardEntries)`
3. Bulk-write each member's `proof` and `leaf` back to `CampaignReward`
4. Store `merkleRoot` in `CampaignMerkleRoot`

Triggered asynchronously via RabbitMQ `syncMerkleProofs` queue after upload.

### API Endpoints

Proofs are delivered through two endpoints:

| Endpoint | Proof Field | Scope |
|---|---|---|
| `GET /campaign/reward` | `proof`, `leaf` | Single user, single campaign |
| `GET /campaigns` | `userData.proofs`, `userData.leaf` | Per campaign in paginated list (when `userAddress` provided) |

**Proof gating:** Proofs are only returned when the campaign is active (`active === true`), not ended (`ended !== true`), and within its time window (`startTime <= now <= endTime`). Paused, ended, or time-expired campaigns return `null` for proof/leaf fields.

### Claim Tracking

`capitalDistributorHandler.payoutClaimed()` tracks claims:
- Creates/finds `CampaignReward` for the recipient
- Deduplicates by transaction hash
- Updates `totalClaimed` and `claimCount`

---

## Event Indexing

### Indexed Events

| Event | Source Contract | Handler | Storage |
|---|---|---|---|
| `Voted` | AddressGaugeVoter | `gaugeHandler.gaugeVoted()` | `VoteGauge` (type: 'vote') |
| `Reset` | AddressGaugeVoter | `gaugeHandler.gaugeReset()` | `VoteGauge` (type: 'reset') |
| `TokensDelegated` | EscrowIVotesAdapter | `governanceVeHandler.delegateTokens()` | `TokenDelegation` (action: 'delegate') |
| `TokensUndelegated` | EscrowIVotesAdapter | `governanceVeHandler.unDelegateTokens()` | `TokenDelegation` (action: 'undelegate') |
| `DelegateChanged` | EscrowIVotesAdapter | token handler | `LogDelegateChanged` |
| `CampaignCreated` | CapitalDistributor | `capitalDistributorHandler.campaignCreated()` | `Campaign` |
| `MerkleCampaignSet` | CapitalDistributor | `capitalDistributorHandler.merkleCampaignSet()` | `Campaign.merkleRoot` |
| `PayoutClaimed` | CapitalDistributor | `capitalDistributorHandler.payoutClaimed()` | `CampaignReward.claims` |

---

## Migrations

### syncDelegationEvents

`src/migrations/20260218123151-syncDelegationEvents.ts`

Wipes and re-syncs all `TokensDelegated`, `TokensUndelegated`, `DelegateChanged` events via batch crawling. Uses `bulkWrite` with `$setOnInsert` + upsert for idempotency. Batch-resolves block timestamps via `Web3BatchHelper.callRpcMethod('eth_getBlockByNumber', ...)`.

### syncGaugeVoteEvents

`src/migrations/20260221154805-syncGaugeVoteEvents.ts`

Wipes and re-syncs all `Voted` and `Reset` events with the new `type` field (`'vote' | 'reset'`). Each event creates its own `VoteGauge` document instead of mutating a shared record.

Both migrations bypass the normal indexer flow (no member creation, no governance state updates) and write directly to MongoDB for speed.

---

## CLI Tools

### rewardGenerator

`tools/rewardGenerator.ts` — Computes rewards for a given epoch and pretty-prints invariant checks, active voters, delegation map, and owner rewards. Used for debugging and validation.

### syncGaugeEvents

`tools/syncGaugeEvents.ts` — Reusable tool to re-sync delegation + vote events. Supports multiple plugin addresses. Used for backfills.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Re-delegation mid-epoch | Live mode resolves at each voter's vote block; late re-delegation doesn't retroactively change earlier votes |
| Late delegation (after voter already voted) | Voter must re-vote to pick up new VP; otherwise the late delegator gets nothing |
| Multiple votes in one epoch | Only the latest vote counts (contract resets before re-voting) |
| Vote persistence across epochs | Votes carry over when hook enabled; no re-vote needed each epoch |
| Delegation persistence across epochs | Delegations persist until explicitly changed |
| Zero VP voters | Filtered out by `VoteGauge.getActiveVoters()` |
| Dust from integer division | Redistributed to largest VP holder |

---

## Live Report — Epoch 1463

```
Plugin:       0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9
Network:      katana-mainnet
Epoch:        1463  (writeEpochId=0)
Hook:         true
Escrow:       0xE6a58Cfab1f3E0e2E6154AFD9453233b016dAD2e
Adapter:      0xB61b15b09967FB4B229c17528EfAdE416a21Eb80
Lock NFT:     0x9e8949CCD5a3a07992b11A95732e27Bd0B0Eae2c
On-chain VP:  71000000000000000000

INVARIANTS
  1a   PASS  indexed=71000000000000000000 contract=71000000000000000000
  1b   PASS  5 gauges
  2a   PASS  5/5
  2b   PASS  8 tokens
  3    PASS  owners=71000000000000000000 contract=71000000000000000000

ACTIVE VOTERS (5)
  #  Voter         Used VP           Token VP        Block
  1  0xa439..AE31  45000000000..000  45000000000..000  21771739
  2  0xDDaD..9122  10000000000..000  10000000000..000  22880020
  3  0x735D..4395   8000000000..000   8000000000..000  21203144
  4  0xF828..C3d5   5000000000..000   5000000000..000  23295865
  5  0xb3dA..DCac   3000000000..000   3000000000..000  22886231

DELEGATION MAP (5 entries)
  Voter         Owner         Tokens
  0x735D..4395  0x735D..4395  53, 31
  0xa439..AE31  0xa439..AE31  65, 66, 68
  0xDDaD..9122  0xb4B2..5818  19
  0xb3dA..DCac  0xb3dA..DCac  216
  0xF828..C3d5  0xF828..C3d5  273

OWNER REWARDS (5 owners)
  #  Owner                                         VP     Share
  1  0xa43901c63f7702C407378E55E0d0EB4064a2AE31   45e18   63.38%
  2  0xb4B27119ae8b4FfC65E695aEC4A2593D17735818   10e18   14.08%
  3  0x735D82176A8F35a7d63098769C10017b31D74395    8e18   11.26%
  4  0xF82870f1A8D6F0aB966E560a6e7bFCDCac68C3d5    5e18    7.04%
  5  0xb3dA4c1Ba8De9E04f22B1554a070189F518FDCac    3e18    4.22%
                                                   ----
                                                   71e18   total
```

Voter `0xDDaD` votes with 10e18 VP but the reward goes to owner `0xb4B2` — a delegation where `0xb4B2` delegated token #19 to `0xDDaD`.