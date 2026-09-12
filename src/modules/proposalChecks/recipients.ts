import ContractHelper from '@helpers/contractHelper'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { type HexAddress, type IAssessmentFlatAction, type IResolvedAddress, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:recipients' })

/** "Deployed recently" in the source rules; a product setting if it ever needs to move. */
export const RECENT_DEPLOYMENT_WINDOW_SECONDS = 7 * 24 * 60 * 60

export interface IRecipientContext {
  creator: HexAddress | null
  evidenceBlock: number
  evidenceTime: number
}

/**
 * Resolves every address the actions hand something to, as it was at the evidence block: wallet
 * or contract from the code at that block, verified source or not, when and by whom it was
 * deployed, and whether that was the proposal's creator shortly before. Anything that cannot be
 * established stays null, so a check reports it as unresolved instead of assuming.
 */
/**
 * The two recipient facts the source says to tag, not grade: a contract with no verified source,
 * or one the proposal's creator deployed shortly before. `noun` names the role in the sentence.
 */
export const recipientReview = (recipient: IResolvedAddress | null, noun = 'recipient'): string | null => {
  if (!recipient) return null
  if (recipient.kind === 'contract' && recipient.verified === false)
    return `${noun} is a contract with no verified source`
  if (recipient.deployedByCreator && recipient.recentlyDeployed)
    return `${noun} was deployed by the proposal creator within the last 7 days`
  return null
}

const RecipientResolver = {
  /** Addresses that receive value from the decoded actions; other checks add their own kinds here as they arrive. */
  beneficiaries(actions: readonly IAssessmentFlatAction[]): string[] {
    const out = new Set<string>()
    for (const action of actions) {
      if (action.operation === 'delegatecall') continue
      if (BigInt(action.value || '0') > 0n) out.add(action.target)
      const name = action.decoded?.name
      const args = action.decoded?.args ?? {}
      // A verified overload can carry the same name with other arguments; only an address is a beneficiary.
      const add = (value: string | undefined) => {
        if (value && /^0x[0-9a-f]{40}$/i.test(value)) out.add(value)
      }
      if (
        name === 'transfer' ||
        name === 'transferFrom' ||
        name === 'safeTransferFrom' ||
        name === 'safeBatchTransferFrom'
      )
        add(args.to)
      if (name === 'approve' || name === 'increaseAllowance') add(args.spender)
      if (name === 'mint') add(args.to)
      if (name === 'setApprovalForAll' && args.approved === 'true') add(args.operator)
      // New role holders on external contracts are resolved like recipients.
      if (name === 'transferOwnership') add(args.newOwner)
      if (name === 'setPendingGovernor') add(args.pendingGovernor)
      if (name === 'setGuardian') add(args.guardian)
      if (name === 'grantRole') add(args.account)
      if (name === 'addAddresses') for (const member of (args._members ?? '').split(',')) add(member)
      if (name === 'addOwnerWithThreshold') add(args.owner)
      if (name === 'swapOwner') add(args.newOwner)
    }
    return [...out]
  },

  async resolve(
    addresses: string[],
    network: NetworksEnum,
    context: IRecipientContext,
  ): Promise<Record<string, IResolvedAddress>> {
    const resolved: Record<string, IResolvedAddress> = {}
    for (const address of new Set(addresses.map(a => a.toLowerCase()))) {
      resolved[address] = await RecipientResolver._resolveOne(address, network, context)
    }
    return resolved
  },

  async _resolveOne(address: string, network: NetworksEnum, context: IRecipientContext): Promise<IResolvedAddress> {
    const result: IResolvedAddress = {
      address,
      kind: 'unknown',
      verified: null,
      contractName: null,
      deployedAtBlock: null,
      deployedAt: null,
      deployer: null,
      deployedByCreator: null,
      recentlyDeployed: null,
    }

    try {
      const code = await RecipientResolver._codeAt(address, network, context.evidenceBlock)
      if (code === '0x') return { ...result, kind: 'eoa' }
      result.kind = 'contract'

      const source = await ContractHelper.getSourceCode(address as HexAddress, network)
      result.verified = !!source?.[0]?.ABI
      result.contractName = source?.[0]?.ContractName || null

      const creation = await ProxyWeb3Provider.fetchContractCreation({ address: address as HexAddress, network })
      if (!creation?.transactionHash) return result
      // The explorer answers with the block as a decimal string, which is not a block tag ethers accepts.
      const createdAt = Number(creation.blockNumber)
      if (!Number.isFinite(createdAt)) return result
      result.deployedAtBlock = createdAt
      result.deployedAt = (await Web3Helper.getBlockTimestamp(createdAt, network)) || null
      const tx = await ProviderModule.getAnyRpcProvider(network).getTransaction(creation.transactionHash)
      result.deployer = tx?.from ?? null

      if (result.deployer && context.creator) {
        result.deployedByCreator = result.deployer.toLowerCase() === context.creator.toLowerCase()
      }
      if (result.deployedAt !== null) {
        // The code existed at the evidence block, so a deployment after it is bad data, not a recent deployment.
        const age = context.evidenceTime - result.deployedAt
        result.recentlyDeployed = age >= 0 && age < RECENT_DEPLOYMENT_WINDOW_SECONDS
      }
    } catch (error) {
      logger.warn('proposal checks: recipient could not be fully resolved', llo({ address, network, error }))
    }
    return result
  },

  /** The code the address had at the block, read directly so that an empty result is "a wallet" and not "lookup failed". */
  async _codeAt(address: string, network: NetworksEnum, block: number): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const code: string = await BottleneckModule.getNodeLimiter(network).schedule(() => provider.getCode(address, block))
    return code && code !== '0x' ? code : '0x'
  },
}

export default RecipientResolver
