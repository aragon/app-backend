import logger from '@logger'
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

// Re-export the public surface so callers can `import { ... } from './erc20DelegationActivity'`.
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

const TOKEN_BALANCE_ABI = ['function balanceOf(address account) view returns (uint256)'] as const

const TOKEN_DELEGATE_ABI = ['function delegate(address delegatee)'] as const

/**
 * Drives realistic on-chain ERC20 delegation activity against a token-voting DAO created
 * by the parallel setup. Mints tokens to N holders via an early-executed proposal and then
 * sequentially calls `delegate(target)` per the config (re-delegations included), so each
 * `DelegateChanged` event lands in its own block — important for the indexer's
 * "latest event wins" semantics.
 */
export async function runErc20DelegationActivity(
  dep: TokenVotingDaoDeployment,
  config: Erc20DelegationActivityConfig,
): Promise<Erc20DelegationActivityResult> {
  const provider = getAnvilProvider()

  // 1. Create + fund holder wallets (1 ETH each, gas only).
  const holders: ethers.HDNodeWallet[] = []
  for (let i = 0; i < config.holders.length; i++) {
    const wallet = ethers.Wallet.createRandom().connect(provider)
    await setBalance(wallet.address, 10n ** 18n)
    holders.push(wallet)
  }
  logger.info(`runErc20DelegationActivity: created + funded ${holders.length} holder wallets`)

  // 2. Random member targets — never funded, only ever receive delegation.
  const members = {
    memberA: ethers.Wallet.createRandom().address,
    memberB: ethers.Wallet.createRandom().address,
    memberC: ethers.Wallet.createRandom().address,
  }
  logger.info(
    `runErc20DelegationActivity: member targets memberA=${members.memberA} memberB=${members.memberB} memberC=${members.memberC}`,
  )

  // 3. Build the actions array — one mint(holder, amount) per holder.
  const tokenInterface = new ethers.Interface(TOKEN_MINT_ABI)
  const actions = config.holders.map((spec, i) => ({
    to: dep.token,
    value: 0n,
    data: tokenInterface.encodeFunctionData('mint', [holders[i].address, spec.amount]),
  }))

  // 4. Deployer creates the proposal voting Yes with tryEarlyExecution=true. Deployer holds
  //    100% VP from the setup's seed mint (self-delegated 2 blocks earlier), so this single
  //    call satisfies the support threshold and early-executes the actions in the same tx.
  const tokenVoting = new ethers.Contract(dep.tokenVoting, TOKEN_VOTING_ABI, dep.deployerWallet)
  const nowTs = (await provider.getBlock('latest'))!.timestamp
  // endDate must be >= startDate + minDuration (3600s). Pad by an extra hour so the inevitable
  // block-timestamp drift between calling and mining doesn't bump us under the floor.
  const endDate = BigInt(nowTs) + 7200n

  const tx = await tokenVoting.createProposal('0x', actions, 0, 0, endDate, VoteOption.Yes, true)
  const receipt = await tx.wait()
  logger.info(
    `runErc20DelegationActivity: mint proposal early-executed (block=${receipt!.blockNumber}, txHash=${receipt!.hash})`,
  )

  // Sanity-check the mint executed by reading the first holder's balance.
  const tokenReader = new ethers.Contract(dep.token, TOKEN_BALANCE_ABI, provider)
  const firstHolder = holders[0]
  const firstSpec = config.holders[0]
  const firstBalance: bigint = await tokenReader.balanceOf(firstHolder.address)
  if (firstBalance !== firstSpec.amount) {
    throw new Error(
      `runErc20DelegationActivity: expected first holder ${firstHolder.address} to have balance ${firstSpec.amount} ` +
        `after early-execution, got ${firstBalance}. Likely the proposal did not early-execute (check setup's voting params, ` +
        `deployer self-delegation, and that token mint permissions are granted to the DAO/TokenVoting plugin).`,
    )
  }

  // 5. Run delegations sequentially so each lands in its own block, giving distinct
  //    (block, logIndex) ordering for the indexer's latest-event-wins assertion.
  const delegations: ResolvedErc20Delegation[] = []
  for (const spec of config.delegations) {
    const holderWallet = holders[spec.fromHolder]
    if (!holderWallet) {
      throw new Error(
        `runErc20DelegationActivity: holder index ${spec.fromHolder} out of range (holders=${holders.length})`,
      )
    }
    const targetAddr = members[spec.to]

    const token = new ethers.Contract(dep.token, TOKEN_DELEGATE_ABI, holderWallet)
    const delegateTx = await token.delegate(targetAddr)
    const delegateReceipt = await delegateTx.wait()
    const block = await provider.getBlock(delegateReceipt!.blockNumber)

    delegations.push({
      from: holderWallet.address,
      to: targetAddr,
      transactionHash: delegateReceipt!.hash,
      blockNumber: delegateReceipt!.blockNumber,
      blockTimestamp: Number(block!.timestamp),
    })

    logger.info(
      `runErc20DelegationActivity: holder[${spec.fromHolder}]=${holderWallet.address} → ${spec.to} (${targetAddr}) ` +
        `at block=${delegateReceipt!.blockNumber}`,
    )
  }

  return { holders, members, delegations }
}
