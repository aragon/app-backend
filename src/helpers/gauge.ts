import { GaugeVoter } from '@artifacts/GaugeVoter'
import { retryRequest } from '@helpers/retryRequest'
import Utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import {
  type ActiveVoter,
  type AttributionResult,
  type HexAddress,
  type IFormattedLog,
  IVotingEscrowAdapterLogs,
  NetworksEnum,
  type OwnerReward,
  TokenTransfer,
} from '@types'
import { Contract, ZeroAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:GaugeHelper' })

const GaugeHelper = {
  async getLockNftTokenAddress(pluginAddress: string, network: NetworksEnum): Promise<string | null> {
    try {
      const escrowAddress = await Web3Helper.getVotingEscrowAddress(pluginAddress, network)

      if (escrowAddress) {
        return await Web3Helper.getLockTokenAddress(escrowAddress, network)
      }

      return null
    } catch (_error) {
      return null
    }
  },

  async getGaugeEpochId(pluginAddress: HexAddress, network: NetworksEnum) {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const pluginGaugeInstance = new Contract(pluginAddress, GaugeVoter.abi, provider)
      const epochId = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => pluginGaugeInstance.epochId()),
      )
      return Number(epochId).toString()
    } catch (_error) {
      return null
    }
  },

  async getIVotesAdapterAddress(pluginAddress: HexAddress, network: NetworksEnum): Promise<HexAddress | null> {
    try {
      const abi = ['function ivotesAdapter() view returns (address)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const gaugePluginContract = new Contract(pluginAddress, abi, provider)

      const iVotesAdapterAddress = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          gaugePluginContract.ivotesAdapter(),
        ),
      )

      if (iVotesAdapterAddress === ZeroAddress) {
        return null
      }

      return iVotesAdapterAddress
    } catch (_error) {
      return null
    }
  },

  async getEnableUpdateVotingPowerHookFlag(pluginAddress: HexAddress, network: NetworksEnum): Promise<boolean> {
    try {
      const abi = ['function enableUpdateVotingPowerHook() view returns (bool)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const gaugePluginContract = new Contract(pluginAddress, abi, provider)

      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          gaugePluginContract.enableUpdateVotingPowerHook(),
        ),
      )
    } catch (_error) {
      return false
    }
  },

  async currentEpochStart(pluginAddress: HexAddress, network: NetworksEnum): Promise<number | null> {
    try {
      const abi = ['function currentEpochStart() view returns (uint256)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const gaugePluginContract = new Contract(pluginAddress, abi, provider)

      const currentEpochStart = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          gaugePluginContract.currentEpochStart(),
        ),
      )

      return Number(currentEpochStart)
    } catch (_error) {
      return null
    }
  },

  async getGaugeEpochVoteStart(pluginAddress: HexAddress, network: NetworksEnum): Promise<number | null> {
    try {
      const abi = ['function epochVoteStart() view returns (uint256)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const gaugePluginContract = new Contract(pluginAddress, abi, provider)

      const epochVoteStart = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          gaugePluginContract.epochVoteStart(),
        ),
      )

      return Number(epochVoteStart)
    } catch (_error) {
      return null
    }
  },

  async getEpochDuration(pluginAddress: HexAddress, network: NetworksEnum): Promise<number | null> {
    try {
      const abi = ['function epochDuration() view returns (uint256)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(pluginAddress, abi, provider)

      const epochDuration = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.epochDuration()),
      )

      return Number(epochDuration)
    } catch (_error) {
      return null
    }
  },

  async getVoteDuration(pluginAddress: HexAddress, network: NetworksEnum): Promise<number | null> {
    try {
      const abi = ['function voteDuration() view returns (uint256)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(pluginAddress, abi, provider)

      const voteDuration = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.voteDuration()),
      )

      return Number(voteDuration)
    } catch (_error) {
      return null
    }
  },

  async getCurrentEpoch(pluginAddress: HexAddress, network: NetworksEnum): Promise<number | null> {
    try {
      const abi = ['function currentEpoch() view returns (uint256)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(pluginAddress, abi, provider)

      const currentEpoch = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.currentEpoch()),
      )

      return Number(currentEpoch)
    } catch (_error) {
      return null
    }
  },

  async getVoteWindowBuffer(pluginAddress: HexAddress, network: NetworksEnum): Promise<number | null> {
    try {
      const abi = ['function voteWindowBuffer() view returns (uint256)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(pluginAddress, abi, provider)

      const voteWindowBuffer = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.voteWindowBuffer()),
      )

      return Number(voteWindowBuffer)
    } catch (_error) {
      return null
    }
  },

  async getVotingPeriodEnd(
    clockAddress: HexAddress,
    epochId: number,
    network: NetworksEnum,
  ): Promise<{ voteEnd: number; epochStart: number } | null> {
    const [epochDuration, voteDuration, voteWindowBuffer] = await Promise.all([
      GaugeHelper.getEpochDuration(clockAddress, network),
      GaugeHelper.getVoteDuration(clockAddress, network),
      GaugeHelper.getVoteWindowBuffer(clockAddress, network),
    ])

    if (!epochDuration || !voteDuration || voteWindowBuffer == null) {
      return null
    }

    const voteEnd = epochId * epochDuration + voteDuration - voteWindowBuffer
    const epochStart = epochId * epochDuration

    return { voteEnd, epochStart }
  },

  async getGaugeEpochVoteEnd(pluginAddress: HexAddress, network: NetworksEnum): Promise<number | null> {
    try {
      const abi = ['function epochVoteEnd() view returns (uint256)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const gaugePluginContract = new Contract(pluginAddress, abi, provider)

      const epochVoteEnd = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          gaugePluginContract.epochVoteEnd(),
        ),
      )

      return Number(epochVoteEnd)
    } catch (_error) {
      return null
    }
  },

  async getUsedVotingPower(
    memberAddress: HexAddress,
    pluginAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function usedVotingPower(address account) external view returns (uint256)']
    const contract = new Contract(pluginAddress, abi, provider)
    try {
      const vp = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.usedVotingPower(memberAddress)),
      )
      return BigInt(vp).toString()
    } catch (error) {
      logger.error('Error getting usedVotingPower', llo({ memberAddress, pluginAddress, network, error }))
      return '0'
    }
  },

  async totalVotingPowerCast(pluginAddress: HexAddress, network: NetworksEnum): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function totalVotingPowerCast() public view returns (uint256)']
    const contract = new Contract(pluginAddress, abi, provider)
    try {
      const vp = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.totalVotingPowerCast()),
      )
      return BigInt(vp).toString()
    } catch (error) {
      logger.error('Error getting totalVotingPowerCast', llo({ pluginAddress, network, error }))
      return '0'
    }
  },

  async getGaugeVotes(gaugeAddress: HexAddress, pluginAddress: HexAddress, network: NetworksEnum): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    // Uses getWriteEpochId() internally - returns correct epoch's data
    const abi = ['function gaugeVotes(address _address) public view returns (uint256)']
    const contract = new Contract(pluginAddress, abi, provider)
    try {
      const vp = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.gaugeVotes(gaugeAddress)),
      )
      return BigInt(vp).toString()
    } catch (error) {
      logger.error('Error getting gaugeVotes', llo({ gaugeAddress, pluginAddress, network, error }))
      return '0'
    }
  },

  async epochTotalVotingPowerCast(pluginAddress: HexAddress, epochId: number, network: NetworksEnum): Promise<bigint> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function epochTotalVotingPowerCast(uint256 _epoch) public view returns (uint256)']
    const contract = new Contract(pluginAddress, abi, provider)
    try {
      const vp = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.epochTotalVotingPowerCast(epochId)),
      )
      return BigInt(vp)
    } catch (error) {
      logger.error('Error getting epochTotalVotingPowerCast', llo({ pluginAddress, epochId, network, error }))
      return 0n
    }
  },

  async epochGaugeVotes(
    pluginAddress: HexAddress,
    epochId: number,
    gaugeAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<bigint> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function epochGaugeVotes(uint256 _epoch, address _gauge) public view returns (uint256)']
    const contract = new Contract(pluginAddress, abi, provider)
    try {
      const vp = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.epochGaugeVotes(epochId, gaugeAddress)),
      )
      return BigInt(vp)
    } catch (error) {
      logger.error('Error getting epochGaugeVotes', llo({ pluginAddress, epochId, gaugeAddress, network, error }))
      return 0n
    }
  },

  async getVotes(memberAddress: HexAddress, tokenAddress: HexAddress, network: NetworksEnum): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function getVotes(address account) external view returns (uint256)']
    const contract = new Contract(tokenAddress, abi, provider)
    try {
      const vp = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.getVotes(memberAddress)),
      )
      return BigInt(vp).toString()
    } catch (error) {
      logger.error('Error getting votes', llo({ memberAddress, tokenAddress, network, error }))
      return '0'
    }
  },

  async getPastVotes(
    memberAddress: HexAddress,
    timePoint: number,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function getPastVotes(address account, uint256 timepoint) external view returns (uint256);']
    const contract = new Contract(tokenAddress, abi, provider)
    try {
      const vp = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.getPastVotes(memberAddress, timePoint)),
      )
      return BigInt(vp).toString()
    } catch (error) {
      logger.error('Error getting votes', llo({ memberAddress, tokenAddress, network, error }))
      return '0'
    }
  },

  /**
   * Build voter checkpoint blocks for delegation resolution.
   *
   * vp_ts[V] is the timestamp at which the contract evaluated V's voting power.
   * Both VP balances and delegation state must be resolved at this timestamp.
   *
   *   hookEnabled=false (secure mode):
   *     vp_ts[V] = epochStart (global, same for all voters).
   *     Contract uses getPastVotes(account, currentEpochStart()).
   *     Returns a single checkpoint block at the epochStart timestamp.
   *
   *   hookEnabled=true (live mode):
   *     vp_ts[V] = block timestamp of V's latest vote() tx (per-voter).
   *     Contract uses getVotes(account) at that block.
   *     Returns one checkpoint per unique latestBlock across all voters.
   *
   * Edge Case 1 (Re-delegation Mid-Epoch):
   *   Secure mode — re-delegation after epochStart does NOT affect this epoch.
   *   Live mode — only delegations present at V's vote block are captured.
   *
   * Edge Case 2 (Late Delegation):
   *   If Alice delegates to Bob AFTER Bob voted, the delegation is invisible
   *   at Bob's checkpoint block. Bob's VP reflects only tokens delegated before
   *   his vote. INVARIANT 2 catches any timestamp mismatch.
   *
   * @returns Map of checkpoint block -> voters resolved at that block.
   */
  async buildVoterCheckpoints(
    activeVoters: ActiveVoter[],
    hookEnabled: boolean,
    epochStart: number,
    network: NetworksEnum,
  ): Promise<Map<number, ActiveVoter[]>> {
    const votersByBlock = new Map<number, ActiveVoter[]>()

    if (!hookEnabled) {
      const epochBlock = await Web3Helper.findBlockAtTimestamp(epochStart, network)
      votersByBlock.set(epochBlock, activeVoters)
    } else {
      for (const voter of activeVoters) {
        if (!votersByBlock.has(voter.latestBlock)) votersByBlock.set(voter.latestBlock, [])
        votersByBlock.get(voter.latestBlock)!.push(voter)
      }
    }

    return votersByBlock
  },

  /**
   * Step 2: Resolve delegation sources per voter.
   *
   * Pure synchronous function — takes pre-crawled sorted logs, and checkpoint
   * config from buildVoterCheckpoints(). Replays events incrementally and
   * snapshots delegation state at each checkpoint block.
   *
   * For each active voter V, determines which tokenIds were delegated to V
   * at vp_ts[V], and who owns each token (from the latest Transfer event).
   *
   * Returns delegation_map[V] = { owner_address: [tokenId, ...] }
   *
   * Events processed:
   *   - Transfer (Lock NFT): tracks token ownership (mint/burn/transfer)
   *   - TokensDelegated: token-level delegation to a delegatee
   *   - TokensUndelegated: removes token-level delegation
   *   - DelegateChanged: address-level delegation (applies to all owned tokens)
   *
   * Maintains 3 state maps rebuilt incrementally:
   *   ownershipMap: tokenId -> current owner address
   *   tokenDelegation: tokenId -> delegatee address
   *   addressDelegation: owner address -> delegatee address
   *
   * Edge Case 5 (Delegation Persistence):
   *   Delegations persist across epochs. State is built from ALL historical
   *   events since contract deployment, not just the current epoch.
   *
   * @param sortedLogs     Merged & sorted delegation and transfer events (from deployment to maxBlock)
   * @param votersByBlock  Map of checkpoint block -> voters at that checkpoint
   *   secure mode: single entry { epochBlock: allVoters }
   *   live mode: { v.latestBlock: [voters...] } per unique block
   * @returns Map<voter, Map<owner, tokenIds[]>> — the delegation map
   */
  resolveDelegationSources(
    sortedLogs: IFormattedLog[],
    votersByBlock: Map<number, ActiveVoter[]>,
  ): Map<string, Map<string, string[]>> {
    const checkpointBlocks = [...votersByBlock.keys()].sort((a, b) => a - b)

    const ownershipMap = new Map<string, string>()
    const tokenDelegation = new Map<string, string>()

    const delegationMap = new Map<string, Map<string, string[]>>()

    let logIdx = 0

    for (const checkpoint of checkpointBlocks) {
      while (logIdx < sortedLogs.length && sortedLogs[logIdx].info.blockNumber <= checkpoint) {
        const { event } = sortedLogs[logIdx]

        if (event.name === TokenTransfer.Transfer) {
          const from = event.args.from
          const to = event.args.to
          const tokenId = event.args.tokenId.toString()

          if (to === Utils.zeroAddress) {
            ownershipMap.delete(tokenId)
            tokenDelegation.delete(tokenId)
          } else {
            ownershipMap.set(tokenId, to)
            if (from !== Utils.zeroAddress && to !== from) {
              tokenDelegation.delete(tokenId)
            }
          }
        } else if (event.name === IVotingEscrowAdapterLogs.TokensDelegated) {
          const delegatee = event.args.delegatee
          const tokenIds: bigint[] = event.args.tokenIds
          for (const tid of tokenIds) {
            tokenDelegation.set(tid.toString(), delegatee)
          }
        } else if (event.name === IVotingEscrowAdapterLogs.TokensUndelegated) {
          const tokenIds: bigint[] = event.args.tokenIds
          for (const tid of tokenIds) {
            tokenDelegation.delete(tid.toString())
          }
        }

        logIdx++
      }

      for (const voter of votersByBlock.get(checkpoint)!) {
        const ownerTokensMap = new Map<string, string[]>()

        for (const [tokenId, delegatee] of tokenDelegation) {
          if (delegatee === voter.voter) {
            const owner = ownershipMap.get(tokenId)
            if (owner) {
              if (!ownerTokensMap.has(owner)) ownerTokensMap.set(owner, [])
              ownerTokensMap.get(owner)!.push(tokenId)
            }
          }
        }

        delegationMap.set(voter.voter, ownerTokensMap)
      }
    }

    return delegationMap
  },

  /**
   * Step 3: Attribute VP to original token owners.
   *
   * For each token in delegation_map[V], fetches votingPowerAt(tokenId, vp_ts[V])
   * via RPC and credits the VP to the token's owner (not the voter/delegatee).
   *
   * VP timestamp per voter:
   *   hookEnabled=true  (live mode):   vp_ts[V] = V's latestBlockTimestamp
   *   hookEnabled=false (secure mode):  vp_ts[V] = epochStart (same for all)
   *
   * Uses votingPowerAt(tokenId, vp_ts[V]) for accuracy — the escrow curve
   * (bias = constant * amount + linear * amount * elapsed) makes VP depend
   * on both locked amount and lock age. Raw locked(tokenId).amount would
   * be inaccurate when tokens have different ages.
   *
   * Output: credit[owner] = total VP across all tokens owned by that address.
   * The caller validates INVARIANT 3: SUM(credit[owner]) == epochTotalVotingPowerCast
   *
   * @param activeVoters    Voters with usedVP and latestBlockTimestamp
   * @param delegationMap   From resolveDelegationSources(): voter -> owner -> tokenIds[]
   * @param escrowAddress   VotingEscrowIncreasing contract address
   * @param hookEnabled     Determines vp_ts resolution mode
   * @param epochStart      Epoch start timestamp (used in secure mode)
   * @param network         Network for RPC calls
   * @returns AttributionResult — ownerRewards + voterVPSums for invariant checks
   */
  async attributeVPToOwners(
    activeVoters: ActiveVoter[],
    delegationMap: Map<string, Map<string, string[]>>,
    escrowAddress: HexAddress,
    hookEnabled: boolean,
    epochStart: number,
    network: NetworksEnum,
  ): Promise<AttributionResult> {
    const voterTimestamp = new Map(activeVoters.map(v => [v.voter, v.latestBlockTimestamp]))

    const flatEntries: Array<{ tokenId: string; voter: string; owner: string }> = []
    for (const [voter, ownerMap] of delegationMap) {
      for (const [owner, tokenIds] of ownerMap) {
        for (const tokenId of tokenIds) {
          flatEntries.push({ tokenId, voter, owner })
        }
      }
    }

    const batchParams = flatEntries.map(({ tokenId, voter }) => ({
      escrowAddress,
      tokenId,
      ts: hookEnabled ? voterTimestamp.get(voter)! : epochStart,
    }))

    const vpResults = await Web3BatchHelper.getLockVotingPowerAtInBatch(batchParams, network)

    const voterVPSums = new Map<string, bigint>()
    for (let i = 0; i < flatEntries.length; i++) {
      const { voter } = flatEntries[i]
      voterVPSums.set(voter, (voterVPSums.get(voter) ?? 0n) + vpResults[i].votingPower)
    }

    const ownerCredits = new Map<string, { tokenIds: string[]; votingPower: bigint }>()
    for (let i = 0; i < flatEntries.length; i++) {
      const { owner, tokenId } = flatEntries[i]
      if (!ownerCredits.has(owner)) ownerCredits.set(owner, { tokenIds: [], votingPower: 0n })
      const entry = ownerCredits.get(owner)!
      entry.tokenIds.push(tokenId)
      entry.votingPower += vpResults[i].votingPower
    }

    const ownerRewards: OwnerReward[] = []
    for (const [owner, { tokenIds, votingPower }] of ownerCredits) {
      ownerRewards.push({ owner, tokenIds, votingPower })
    }

    return { ownerRewards, voterVPSums }
  },
}

export default GaugeHelper
