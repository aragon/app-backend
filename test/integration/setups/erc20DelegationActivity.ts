import { ethers } from 'ethers'
import { setBalance } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'
import { VoteOption } from '../types/gaugesFixture'
import {
  type Erc20DelegationActivityConfig,
  type Erc20DelegationActivityResult,
  type ResolvedErc20Delegation,
  type TokenVotingDaoDeployment,
} from '../types/tokenVotingFixture'

export {
  type DelegationSpec,
  type DelegationTarget,
  type Erc20DelegationActivityConfig,
  type Erc20DelegationActivityResult,
  type HolderSpec,
  type ResolvedErc20Delegation,
  type TokenVotingDaoDeployment,
} from '../types/tokenVotingFixture'

const TOKEN_VOTING_ABI = [
  'function createProposal(bytes _metadata, tuple(address to, uint256 value, bytes data)[] _actions, uint256 _allowFailureMap, uint64 _startDate, uint64 _endDate, uint8 _voteOption, bool _tryEarlyExecution) returns (uint256 proposalId)',
] as const

const TOKEN_MINT_ABI = ['function mint(address to, uint256 amount)'] as const

const TOKEN_DELEGATE_ABI = ['function delegate(address delegatee)'] as const

export async function runErc20DelegationActivity(
  dep: TokenVotingDaoDeployment,
  config: Erc20DelegationActivityConfig,
): Promise<Erc20DelegationActivityResult> {
  const provider = getAnvilProvider()

  const holders: ethers.HDNodeWallet[] = []
  for (let i = 0; i < config.holders.length; i++) {
    const wallet = ethers.Wallet.createRandom().connect(provider)
    await setBalance(wallet.address, 10n ** 18n)
    holders.push(wallet)
  }

  const members = {
    memberA: ethers.Wallet.createRandom().address,
    memberB: ethers.Wallet.createRandom().address,
    memberC: ethers.Wallet.createRandom().address,
  }

  const tokenInterface = new ethers.Interface(TOKEN_MINT_ABI)
  const actions = config.holders.map((spec, i) => ({
    to: dep.token,
    value: 0n,
    data: tokenInterface.encodeFunctionData('mint', [holders[i].address, spec.amount]),
  }))

  const tokenVoting = new ethers.Contract(dep.tokenVoting, TOKEN_VOTING_ABI, dep.deployerSigner)
  const nowTs = (await provider.getBlock('latest'))!.timestamp
  // endDate must be >= startDate + minDuration (3600s); pad against block-timestamp drift.
  const endDate = BigInt(nowTs) + 7200n

  await (await tokenVoting.createProposal('0x', actions, 0, 0, endDate, VoteOption.Yes, true)).wait()

  // Sequential — when two delegates of the same target land in the same block, the indexer's
  // DelegateVotesChanged batch handler can race and overwrite with a stale newBalance.
  const delegations: ResolvedErc20Delegation[] = []
  for (const spec of config.delegations) {
    if (spec.fromHolder < 0 || spec.fromHolder >= holders.length) {
      throw new Error(`holder index ${spec.fromHolder} out of range (holders=${holders.length})`)
    }
    const holderWallet = holders[spec.fromHolder]
    const targetAddr = members[spec.to]
    const token = new ethers.Contract(dep.token, TOKEN_DELEGATE_ABI, holderWallet)
    const receipt = await (await token.delegate(targetAddr)).wait()
    const block = await provider.getBlock(receipt!.blockNumber)
    delegations.push({
      from: holderWallet.address,
      to: targetAddr,
      transactionHash: receipt!.hash,
      blockNumber: receipt!.blockNumber,
      blockTimestamp: Number(block!.timestamp),
    })
  }

  return { holders, members, delegations }
}
