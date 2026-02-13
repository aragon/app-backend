# Exit Fee Reward Attribution

## Overview

When a vKAT holder exits their lock early, an exit fee in KAT is collected. This fee is distributed proportionally to all addresses whose voting power was actively used in gauge voting during that epoch. The [EXIT_FEE_DISTRIBUTION_SPEC](https://github.com/aragon/ve-governance/blob/exp/katana-spec/EXIT_FEE_DISTRIBUTION_SPEC.md) defines a 4-step algorithm with invariant checks at each step.

The core rule: rewards go to the **original token owner**, not the address that cast the vote. If Jordan delegates a 50 VP veNFT to Alice and Alice votes, Jordan gets credit for 50 VP worth of rewards.

The implementation lives in `src/modules/veRewardDistribution.ts` — a single function `computeRewardDistribution({ epochId, pluginAddress, network })` that runs the full pipeline and returns the result with all invariant checks.

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

Note: `vote()` has no `whenVotingActive` modifier on-chain — only `reset()` does. Users can call `vote()` anytime during an epoch, even after the voting window closes. The `Voted` event still emits the correct `epochId` from the Clock, so the DB queries filter by `epochId`.

---

## Step 1: Determine Active Voters

**Spec**: Index all `Voted` and `Reset` events for epoch N up to `vote_finalization_ts`. For each address, process chronologically — `Voted` sets active, `Reset` sets inactive. Compute `usedVP[V] = SUM(votingPowerCastForGauge)` across gauges.

**Implementation**: `GaugeGovernance.getActiveVoters()` queries `VoteGauge` documents from MongoDB. The aggregation pipeline matches on `{ pluginAddress, network, $or: [{ epochId }, { blockTimestamp: { $lte: voteEnd } }] }`, groups by voter, sums `votingPowerCastForGauge` into `usedVP`, and tracks each voter's `latestBlock` and `latestBlockTimestamp`.

The `$or` handles both modes: `epochId` catches votes in the current epoch (including persistent votes from hook mode), and `blockTimestamp <= voteEnd` catches votes within the voting window.

**INVARIANT 1a**: `SUM(usedVP) == epochTotalVotingPowerCast[writeEpochId]`. Verified by querying `epochTotalVotingPowerCast(writeEpochId)` directly on the GaugeVoter contract.

**INVARIANT 1b**: Per-gauge sums must match. `epochGaugeVotes(writeEpochId, gauge)` is queried for each gauge and compared against indexed per-gauge totals from `GaugeGovernance.getPerGaugeVP()`.

---

## Step 2: Resolve Delegation Sources Per Voter

**Spec**: For each active voter V, determine which token IDs were delegated to V at `vp_ts[V]`. Build from `TokensDelegated` minus `TokensUndelegated` events up to `vp_ts[V]`. For each token, determine owner from the latest `Transfer` event. Result: `delegation_map[V] = { owner: [tokenIds] }`.

**Implementation**: Three event types are crawled from contract deployment up to `maxBlock` (the highest block among active voters):

| Event | Contract | Extracted data |
|-------|----------|----------------|
| `Transfer(from, to, tokenId)` | Lock NFT (ERC721) | Token ownership |
| `TokensDelegated(sender, delegatee, tokenIds[])` | EscrowIVotesAdapter | Token-level delegation |
| `TokensUndelegated(sender, delegatee, tokenIds[])` | EscrowIVotesAdapter | Delegation removal |

Contract deployment blocks are fetched via `ProxyWeb3Provider.fetchContractCreation()`. Events are crawled using `Web3Helper.crawlEvents()` from deployment up to `maxBlock`.

### Per-voter checkpoints

The spec requires resolving delegation at `vp_ts[V]`, which differs per voter in live mode. `GaugeHelper.buildVoterCheckpoints()` handles this:

- **Secure mode**: One checkpoint block at `epochStart` for all voters
- **Live mode**: One checkpoint per unique voter `latestBlock`

### Event replay

`GaugeHelper.resolveDelegationSources()` replays all events chronologically, maintaining two state maps:

```
ownershipMap:     tokenId → current owner address
tokenDelegation:  tokenId → delegatee address
```

Processing rules:
1. **Transfer**: Set `ownershipMap[tokenId] = to`. If the token changed hands (`from != 0x0` and `to != from`), clear `tokenDelegation[tokenId]` — the new owner has not explicitly delegated it.
2. **TokensDelegated**: Set `tokenDelegation[tokenId] = delegatee` for each token.
3. **TokensUndelegated**: Delete `tokenDelegation[tokenId]` for each token.

At each checkpoint block, the system snapshots: scans `tokenDelegation` for entries where `delegatee == V`, looks up the owner in `ownershipMap`, and groups by owner into `delegation_map[V]`.

**INVARIANT 2b**: Each token ID must appear in exactly one voter's delegation set. A `tokenId → [voters]` map is built and duplicates are flagged.

---

## Step 3: Attribute VP to Original Token Owners

**Spec**: For each token in `delegation_map[V]`, call `votingPowerAt(tokenId, vp_ts[V])` and credit the VP to the token's owner, not the voter.

**Implementation**: `GaugeHelper.attributeVPToOwners()` flattens all `(voter, owner, tokenId)` entries from the delegation map and batch-fetches VP through `Web3BatchHelper.getLockVotingPowerAtInBatch()`. This encodes multiple `votingPowerAt(uint256, uint256)` calls and executes them as batched `eth_call` RPCs.

`votingPowerAt` is used rather than `locked(tokenId).amount` because the VotingEscrow uses a decay curve (`bias = constant * amount + linear * amount * elapsed`). Two tokens locked for the same amount but at different times have different VP.

The VP timestamp per voter follows the spec:
- **Live mode**: `vp_ts[V] = V.latestBlockTimestamp`
- **Secure mode**: `vp_ts[V] = epochStart`

Credits accumulate per owner:

```
credit[owner] += votingPowerAt(tokenId, vp_ts[V])
```

**INVARIANT 2a**: For each voter V, `SUM(votingPowerAt(tokenId, vp_ts[V]))` across all delegated tokens must equal `usedVP[V]`. Cross-checked against the adapter by calling `getVotes(V)` (live mode) or `getPastVotes(V, epochStart)` (secure mode).

**INVARIANT 3**: `SUM(credit[owner])` across all owners must equal `epochTotalVotingPowerCast(writeEpochId)`. Every unit of VP used in voting is attributed to exactly one token owner.

---

## Step 4: Compute Proportional Rewards

**Spec**: `reward[owner] = (credit[owner] / total_credit) * total_fees`.

The module returns `ownerRewards` with each owner's `votingPower` (their share of total VP). The caller applies the fee amount:

```
reward[owner] = (ownerReward.votingPower * totalFees) / contractTotal
```

---

## Worked Example

Alice owns tokens #1 (60 VP) and #2 (40 VP), self-delegates both. Jordan owns token #3 (50 VP), delegates to Alice. Alice votes. Exit fees = 150 KAT.

**Event replay:**
```
Transfer(0x0, Alice, #1)                    → ownershipMap: {#1: Alice}
Transfer(0x0, Alice, #2)                    → ownershipMap: {#1: Alice, #2: Alice}
Transfer(0x0, Jordan, #3)                   → ownershipMap: {#1: Alice, #2: Alice, #3: Jordan}
TokensDelegated(Alice, Alice, [#1, #2])     → tokenDelegation: {#1→Alice, #2→Alice}
TokensDelegated(Jordan, Alice, [#3])        → tokenDelegation: {#1→Alice, #2→Alice, #3→Alice}
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
votingPowerAt(#1, ts) = 60  → credit[Alice]  += 60
votingPowerAt(#2, ts) = 40  → credit[Alice]  += 40
votingPowerAt(#3, ts) = 50  → credit[Jordan] += 50
```

**Invariants:**
```
1a: 150 == epochTotalVotingPowerCast(0)       ✓
1b: per-gauge totals match contract           ✓
2a: 60 + 40 + 50 = 150 == usedVP[Alice]      ✓
2b: tokens {#1, #2, #3} each appear once      ✓
3:  100 + 50 = 150 == contractTotal           ✓
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
╔══════════════════════════════════════════════════════════════════════════════╗
║                        REWARD DISTRIBUTION REPORT                           ║
╚══════════════════════════════════════════════════════════════════════════════╝

  Plugin:       0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9
  Network:      katana-mainnet
  Epoch:        1463  (writeEpochId=0)
  Hook:         true
  Escrow:       0xE6a58Cfab1f3E0e2E6154AFD9453233b016dAD2e
  Adapter:      0xB61b15b09967FB4B229c17528EfAdE416a21Eb80
  Lock NFT:     0x9e8949CCD5a3a07992b11A95732e27Bd0B0Eae2c
  On-chain VP:  71000000000000000000

  INVARIANTS
  ──────────────────────────────────────────────────────────────────────────
  1a   PASS  indexed=71000000000000000000 contract=71000000000000000000
  1b   PASS  5 gauges
  2a   PASS  5/5
  2b   PASS  8 tokens
  3    PASS  owners=71000000000000000000 contract=71000000000000000000

  GAUGES (5)
  ──────────────────────────────────────────────────────────────────────────
  #  Gauge                                       Indexed VP     Contract VP   Share
  1  0x5F88..3009                          55977000000..000  55977000000..000  78.84%
  2  0x6205..D2B5                           7390000000..000   7390000000..000  10.40%
  3  0x2A2C..7A6B                           5233000000..000   5233000000..000   7.37%
  4  0x7446..395c                           1200000000..000   1200000000..000   1.69%
  5  0x4014..0E7F                           1200000000..000   1200000000..000   1.69%

  ACTIVE VOTERS (5)
  ──────────────────────────────────────────────────────────────────────────
  #  Voter         Used VP           Token VP        On-chain VP      Block
  1  0xa439..AE31  45000000000..000  45000000000..000  45000000000..000  21771739
  2  0xDDaD..9122  10000000000..000  10000000000..000  10000000000..000  22880020
  3  0x735D..4395   8000000000..000   8000000000..000  14000000000..000  21203144
  4  0xF828..C3d5   5000000000..000   5000000000..000   5000000000..000  23295865
  5  0xb3dA..DCac   3000000000..000   3000000000..000   3000000000..000  22886231

  DELEGATION MAP (5 entries)
  ──────────────────────────────────────────────────────────────────────────
  Voter         Owner         Tokens
  0x735D..4395  0x735D..4395  53, 31
  0xa439..AE31  0xa439..AE31  65, 66, 68
  0xDDaD..9122  0xb4B2..5818  19
  0xb3dA..DCac  0xb3dA..DCac  216
  0xF828..C3d5  0xF828..C3d5  273

  OWNER REWARDS (5 owners)
  ──────────────────────────────────────────────────────────────────────────
  #  Owner                                         VP     Share
  1  0xa43901c63f7702C407378E55E0d0EB4064a2AE31   45e18   63.38%
  2  0xb4B27119ae8b4FfC65E695aEC4A2593D17735818   10e18   14.08%
  3  0x735D82176A8F35a7d63098769C10017b31D74395    8e18   11.26%
  4  0xF82870f1A8D6F0aB966E560a6e7bFCDCac68C3d5    5e18    7.04%
  5  0xb3dA4c1Ba8De9E04f22B1554a070189F518FDCac    3e18    4.22%
                                                   ────
                                                   71e18   total
```

Notable: voter `0xDDaD` votes with 10e18 VP but the reward goes to owner `0xb4B2` — a delegation where `0xb4B2` delegated token #19 to `0xDDaD`. Voter `0x735D` has on-chain VP of 14e18 but only used 8e18, indicating more delegated power than was voted with (partial gauge allocation or VP acquired after voting).
