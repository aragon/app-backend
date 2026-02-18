# Exit Fee Reward Attribution

## Overview

When a vKAT holder exits their lock early, an exit fee in KAT is collected. This fee is distributed proportionally to all addresses whose voting power was actively used in gauge voting during that epoch. The [EXIT_FEE_DISTRIBUTION_SPEC](https://github.com/aragon/ve-governance/blob/exp/katana-spec/EXIT_FEE_DISTRIBUTION_SPEC.md) defines a 4-step algorithm with invariant checks at each step.

The core rule: rewards go to the **original token owner**, not the address that cast the vote. If Jordan delegates a 50 VP veNFT to Alice and Alice votes, Jordan gets credit for 50 VP worth of rewards.

The implementation lives in `src/modules/veRewardDistribution.ts` as the `VeRewardDistribution` class. Usage:

```ts
const result = await new VeRewardDistribution({ epochId, pluginAddress, network }).compute()
```

---

## Class Architecture

`VeRewardDistribution` encapsulates the full reward computation pipeline. The constructor takes `{ epochId, pluginAddress, network }` and all resolved state (contract addresses, voting period, hook flag) is held as instance fields after `init()`.

### Methods

| Method | Purpose |
|--------|---------|
| `init()` | Resolves clock, escrow, adapter, lockNFT addresses + voting period + hook flag |
| `getActiveVoters()` | Delegates to `GaugeGovernance.getActiveVoters()`, returns `ActiveVoter[]` |
| `resolveOnChainTotal(latestTxHash)` | Parses the latest voter's tx receipt to extract `totalVotingPowerInContract` from `Voted`/`Reset` events |
| `resolveRewardEntries(activeVoters, maxBlock)` | Resolves delegation state per voter via DB aggregation, batch-fetches VP, returns flat `RewardEntry[]` |
| `computeOwnerRewards(entries, onChainTotal)` | Groups entries by owner, computes `shareBps` against `onChainTotal` |
| `compute()` | Orchestrates the full pipeline: init -> voters -> onChainTotal -> resolve -> invariants -> result |

### Pipeline flow inside `compute()`

```
init()
  -> resolve clock, escrow, adapter, lockNFT addresses
  -> resolve hookEnabled flag + votingPeriod

getActiveVoters()
  -> GaugeGovernance queries VoteGauge from MongoDB
  -> returns ActiveVoter[] sorted by latestBlock desc

resolveOnChainTotal(activeVoters[0].latestTxHash)
  -> parses tx receipt for totalVotingPowerInContract
  -> derives maxBlock from activeVoters[0].latestBlock

resolveRewardEntries(activeVoters, maxBlock)
  -> hookEnabled=true:  DB aggregation with per-voter snapshot resolution
  -> hookEnabled=false: DB aggregation with single global maxBlock
  -> batch-fetches votingPowerAt for each (tokenId, timestamp)
  -> returns RewardEntry[] { tokenId, owner, voter, votingPower }

computeOwnerRewards(entries, onChainTotal)
  -> groups by owner, sums VP, computes shareBps

invariant checks (inline in compute())
  -> 1a, 1b, 2a, 2b, 3
```

---

## Epoch Timing & Contract Modes

The spec defines three critical timestamps, resolved through the `Clock` contract at `0x3A2c796c7Fca5EB0eB182D575Fe5645c5A08ad00`:

- **`epochStart`** = `epochId * EPOCH_DURATION` (2 weeks / 1,209,600s)
- **`vote_finalization_ts`** = `epochStart + VOTE_DURATION - VOTE_WINDOW_BUFFER` = `epochStart + 601,200`
- **`vp_ts[V]`** = the timestamp at which the contract evaluated voter V's voting power

The `AddressGaugeVoter` contract has a flag `enableUpdateVotingPowerHook` that changes behavior:

| | Secure mode (`false`) | Live mode (`true`) |
|---|---|---|
| VP evaluation | `getPastVotes(V, epochStart)` | `getVotes(V)` at vote block |
| `vp_ts[V]` | `epochStart` — same for all voters | `block.timestamp` of V's `vote()` tx — per voter |
| Vote storage | Per-epoch: `epochVoteData[epochId]` | Global: `epochVoteData[0]`, persists until reset |
| `writeEpochId` | `epochId` | `0` |

When `enableUpdateVotingPowerHook` is enabled, `epochTotalVotingPowerCast(epochId)` returns 0 on-chain even though votes exist — the data is stored under epoch 0. The system computes `writeEpochId = hookEnabled ? 0 : epochId` and uses it for all contract verification queries.

---

## Step 1: Determine Active Voters

**Spec**: Index all `Voted` and `Reset` events for epoch N up to `vote_finalization_ts`. For each address, process chronologically — `Voted` sets active, `Reset` sets inactive. Compute `usedVP[V] = SUM(votingPowerCastForGauge)` across gauges.

**Implementation**: `GaugeGovernance.getActiveVoters()` queries `VoteGauge` documents from MongoDB. The aggregation pipeline matches on `{ pluginAddress, network, blockTimestamp: { $lte: voteEnd } }`, groups by voter, sums `votingPowerCastForGauge` into `usedVP`, and tracks each voter's `latestBlock`, `latestLogIndex`, `latestTxHash`, and `latestBlockTimestamp`. Returns `ActiveVoter[]` sorted by `latestBlock` descending.

The class derives `maxBlock` from `activeVoters[0].latestBlock` (the highest block) and `onChainTotal` by parsing `activeVoters[0].latestTxHash` via `resolveOnChainTotal()`. This receipt parsing extracts `totalVotingPowerInContract` from `Voted`/`Reset` events emitted by the plugin in that transaction.

**INVARIANT 1a**: `SUM(usedVP) == onChainTotal`. The indexed voter VP totals must match the on-chain `totalVotingPowerInContract` from the latest voter's transaction receipt.

**INVARIANT 1b**: Per-gauge sums must match. `GaugeGovernance.getPerGaugeVP()` sums per-gauge VP from active voters and compares against `onChainTotal`.

---

## Step 2: Resolve Delegation Sources Per Voter

**Spec**: For each active voter V, determine which token IDs were delegated to V at `vp_ts[V]`. Build from `TokensDelegated` minus `TokensUndelegated` events up to `vp_ts[V]`. For each token, determine owner from the latest `Transfer` event. Result: `delegation_map[V] = { owner: [tokenIds] }`.

**Implementation**: `resolveRewardEntries()` uses two different strategies depending on the hook mode:

### Secure mode (`hookEnabled=false`)

Uses `TokenDelegation.findActiveDelegationsAtBlock()` — a single MongoDB aggregation against the `TokenDelegation` collection. All voters share the same global `maxBlock`, so a single aggregation with `blockNumber <= maxBlock` groups by `(delegator, delegate, tokenId)`, takes `$first` action (latest), and filters for `action === 'delegate'`.

### Live mode (`hookEnabled=true`) — Per-voter delegation snapshots

Each voter's delegation state must be evaluated at that voter's specific `latestBlock`, not a global max. This is handled by `TokenDelegation.getDelegationSnapshots()` + JS-side per-voter resolution.

**Why per-voter?** In live mode, VP is evaluated at the voter's vote block. If token #274 was delegated to voter A at block 100 but undelegated at block 200, and voter A voted at block 150, token #274 should count for voter A. But another voter B who voted at block 250 should NOT see token #274 as delegated to A.

#### DB aggregation (`getDelegationSnapshots`)

Single query that returns full delegation history per token:

```
$match    { contractAddress, network, blockNumber <= globalMaxBlock }
$unwind   tokenIds array into individual docs
$sort     { blockNumber: -1, logIndex: -1 }
$group    by (delegator, tokenId):
            snapshots: $push { action, blockNumber, logIndex, delegate }
            delegates: $addToSet delegate
$match    { delegates includes any voter address }
```

Groups by `(delegator, tokenId)` so each token has a single timeline of all delegation events. The `delegates` field (via `$addToSet`) collects all unique delegate addresses for pre-filtering.

#### JS-side per-voter resolution

```
1. Pre-index groups into Map<delegate, groups[]> for O(1) lookup per voter
2. For each voter:
   a. Get groups where voter appears in delegates
   b. For each group, find first snapshot where blockNumber <= voter.latestBlock
      (first match = latest event at or before voter's block, due to desc sort)
   c. Check: snap.action === 'delegate' AND snap.delegate === voter.voter
   d. If both pass → include { tokenId, voter, owner: group.delegator }
```

**Block-level granularity**: The snapshot find uses `blockNumber <= voter.latestBlock` without logIndex filtering. Since snapshots are sorted by `(blockNumber desc, logIndex desc)`, the first match picks the latest event (highest logIndex) at the voter's block. This gives "state after all events in the block" semantics, matching on-chain block-boundary state resolution.

#### Re-delegation example

Token #274 event sequence:
```
Block 23296664 logIndex:13  TokensDelegated(0xc1d6 -> 0xDDaD, [274])
Block 23296675 logIndex:11  TokensUndelegated(0xc1d6 -> 0xDDaD, [274])
Block 23296675 logIndex:12  TokensDelegated(0xc1d6 -> 0xc1d6, [274])
```

Group `(0xc1d6, 274)` snapshots (desc order):
```
{ delegate: 0xc1d6, block: 23296675, logIndex: 12, action: delegate }  <- latest
{ delegate: 0xDDaD, block: 23296675, logIndex: 11, action: undelegate }
{ delegate: 0xDDaD, block: 23296664, logIndex: 13, action: delegate }
```

- Voter `0xDDaD` at block 23296675: first match = `{delegate: 0xc1d6}` -> `0xc1d6 !== 0xDDaD` -> excluded
- Voter `0xc1d6` at block 23297390: first match = `{delegate: 0xc1d6}` -> action=delegate, delegate matches -> included

**INVARIANT 2b**: Each token ID must appear in exactly one voter's delegation set. A `tokenId -> Set<voters>` map is built and duplicates are flagged.

---

## Step 3: Attribute VP to Original Token Owners

**Spec**: For each token in `delegation_map[V]`, call `votingPowerAt(tokenId, vp_ts[V])` and credit the VP to the token's owner, not the voter.

**Implementation**: `resolveRewardEntries()` flattens all `(voter, owner, tokenId)` tuples and batch-fetches VP through `Web3BatchHelper.getLockVotingPowerAtInBatch()`. This encodes multiple `votingPowerAt(uint256, uint256)` calls and executes them as batched `eth_call` RPCs.

`votingPowerAt` is used rather than `locked(tokenId).amount` because the VotingEscrow uses a decay curve (`bias = constant * amount + linear * amount * elapsed`). Two tokens locked for the same amount but at different times have different VP.

The VP timestamp per voter follows the spec:
- **Live mode**: `vp_ts[V] = V.latestBlockTimestamp`
- **Secure mode**: `vp_ts[V] = epochStart`

Credits accumulate per owner:

```
credit[owner] += votingPowerAt(tokenId, vp_ts[V])
```

**INVARIANT 2a**: For each voter V, `SUM(votingPowerAt(tokenId, vp_ts[V]))` across all delegated tokens must equal `usedVP[V]`.

**INVARIANT 3**: `SUM(credit[owner])` across all owners must equal `onChainTotal`. Every unit of VP used in voting is attributed to exactly one token owner.

---

## Step 4: Compute Proportional Rewards

**Spec**: `reward[owner] = (credit[owner] / total_credit) * total_fees`.

`computeOwnerRewards()` groups entries by owner and computes `shareBps = (votingPower * 10000) / onChainTotal`. The caller applies the fee amount:

```
reward[owner] = (ownerReward.votingPower * totalFees) / contractTotal
```

---

## Worked Example

Alice owns tokens #1 (60 VP) and #2 (40 VP), self-delegates both. Jordan owns token #3 (50 VP), delegates to Alice. Alice votes. Exit fees = 150 KAT.

**Event replay:**
```
Transfer(0x0, Alice, #1)                    -> ownership: {#1: Alice}
Transfer(0x0, Alice, #2)                    -> ownership: {#1: Alice, #2: Alice}
Transfer(0x0, Jordan, #3)                   -> ownership: {#1: Alice, #2: Alice, #3: Jordan}
TokensDelegated(Alice, Alice, [#1, #2])     -> delegation: {#1->Alice, #2->Alice}
TokensDelegated(Jordan, Alice, [#3])        -> delegation: {#1->Alice, #2->Alice, #3->Alice}
```

**Checkpoint at Alice's vote block:**
```
delegation_map[Alice] = {
  Alice:  [#1, #2],
  Jordan: [#3],
}
```

**VP attribution:**
```
votingPowerAt(#1, ts) = 60  -> credit[Alice]  += 60
votingPowerAt(#2, ts) = 40  -> credit[Alice]  += 40
votingPowerAt(#3, ts) = 50  -> credit[Jordan] += 50
```

**Invariants:**
```
1a: 150 == onChainTotal (from tx receipt)    pass
1b: per-gauge totals match                   pass
2a: 60 + 40 + 50 = 150 == usedVP[Alice]     pass
2b: tokens {#1, #2, #3} each appear once     pass
3:  100 + 50 = 150 == onChainTotal           pass
```

**Rewards:**
```
reward[Alice]  = (100 / 150) * 150 = 100 KAT  (66.7%)
reward[Jordan] = (50 / 150)  * 150 =  50 KAT  (33.3%)
```

Jordan gets rewarded for the VP the token contributed, even though Alice cast the vote.

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

Notable: voter `0xDDaD` votes with 10e18 VP but the reward goes to owner `0xb4B2` — a delegation where `0xb4B2` delegated token #19 to `0xDDaD`. Voter `0x735D` has on-chain VP of 14e18 but only used 8e18, indicating more delegated power than was voted with (partial gauge allocation or VP acquired after voting).
