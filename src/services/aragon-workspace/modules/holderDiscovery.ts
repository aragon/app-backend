import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
// Imported by concrete path, not the @modules/crawlers barrel: web3BatchHelper
// imports that barrel and tickContext imports web3BatchHelper, so entering
// through the barrel from here leaves CrawlerErrorHandler half-initialised.
import HyperSyncClientModule from '@modules/crawlers/hyperSyncClient'
import { HyperSyncLogCrawler } from '@modules/crawlers/hyperSyncLogCrawler'
import ProviderModule from '@modules/provider'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { type HexAddress, type IIndexerConfig, type ILogInfo, type NetworksEnum } from '@types'
import { type IWorkspaceHolder } from '@workspace/types/workspace'
import { getAddress, Interface, type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'workspace:HolderDiscovery' })

/**
 * Only the two events that move a role.
 *
 * OwnershipTransferred is not here: `owner()` is a live read the detector already
 * makes, so replaying ownership history would re-derive an answer we have.
 * RoleAdminChanged is not here either — it re-parents a role, it does not grant one.
 */
/**
 * JSON fragments, not human-readable strings: LogProcessingEngine.formatLog picks
 * the fragment with `item.name === event && item.type === 'event'`, which only
 * works on objects. Strings parse fine into an Interface but match nothing there,
 * so every log would be dropped as unparseable.
 */
const ROLE_EVENT_INPUTS = [
  { indexed: true, name: 'role', type: 'bytes32' },
  { indexed: true, name: 'account', type: 'address' },
  { indexed: true, name: 'sender', type: 'address' },
]

const ABI = [
  { anonymous: false, inputs: ROLE_EVENT_INPUTS, name: 'RoleGranted', type: 'event' },
  { anonymous: false, inputs: ROLE_EVENT_INPUTS, name: 'RoleRevoked', type: 'event' },
]

const iface = new Interface(ABI)
const ROLE_GRANTED = iface.getEvent('RoleGranted')!.topicHash
const ROLE_REVOKED = iface.getEvent('RoleRevoked')!.topicHash

const hasRoleInterface = new Interface(['function hasRole(bytes32 role, address account) view returns (bool)'])

/** One target and the roles on it that actually gate a function. */
export type IHolderQuery = { target: HexAddress; roles: string[] }

const HolderDiscovery = {
  /**
   * Finds who holds the roles that gate something.
   *
   * Callers pass only what they could not answer another way — a role is in here
   * because the probe proved a function demands it AND the contract is not
   * enumerable, so its members cannot simply be read. Everything else (open
   * functions, ownership, enumerable members) is already known and never reaches
   * this crawl.
   *
   * All targets go in one query: HyperSync ORs the selections server-side, and
   * its cost tracks matched data rather than blocks crossed.
   */
  forTargets: async (queries: IHolderQuery[], network: NetworksEnum): Promise<IWorkspaceHolder[]> => {
    const wanted = queries.filter(query => query.roles.length > 0)
    if (!wanted.length) return []

    if (!HyperSyncClientModule.isSupported(network)) {
      // Loud on purpose: returning nothing would read as "no holders".
      throw new Error(`HolderDiscovery needs HyperSync, which does not serve ${network}`)
    }

    // `${target}:${role}` -> accounts still holding it after the replay.
    const roleHolders = new Map<string, Set<string>>()

    const fromBlock = await HolderDiscovery._earliestDeploymentBlock(
      wanted.map(query => query.target),
      network,
    )

    // A dropped log is a grant or revoke we never saw, so the fold below is no
    // longer the current holder set. The crawler resolves normally after a fatal
    // stream error, which makes this the only way to tell the two apart.
    const failures: string[] = []

    await new HyperSyncLogCrawler({
      network,
      events: HolderDiscovery._events(roleHolders),
      fromBlock,
      stopOnError: false,
      onError: error => {
        failures.push(error.message)
        logger.warn('Holder replay error', llo({ network, error: error.message }))
      },
      // topics[0] = the event, topics[1] = the role. Both filtered server-side, so
      // grants of roles that gate nothing never reach us.
      logSelections: wanted.map(query => ({
        address: [query.target],
        topics: [[ROLE_GRANTED, ROLE_REVOKED], query.roles],
      })),
    }).crawl()

    if (failures.length) {
      // Same reason the unsupported-network case throws: an incomplete replay
      // presented as the answer reads as "these are all the holders".
      throw new Error(
        `Holder replay incomplete after ${failures.length} error(s): ${[...new Set(failures)].slice(0, 3).join('; ')}`,
      )
    }

    const holders: IWorkspaceHolder[] = []

    for (const [compound, accounts] of roleHolders) {
      const [target, role] = compound.split(':') as [HexAddress, string]
      for (const account of accounts) {
        // hasRole is the authority — events can be replayed across a reorg.
        if (await HolderDiscovery._stillHasRole(target, role, account as HexAddress, network)) {
          holders.push({ target, role, account: account as HexAddress })
        }
      }
    }

    logger.verbose('Holders discovered', llo({ network, targets: wanted.length, holders: holders.length }))
    return holders
  },

  /**
   * The earliest block any of the targets was deployed at.
   *
   * Nothing can have granted a role before its contract existed, so scanning from
   * genesis just burns through empty history. One query covers every target, so
   * the start is the earliest of them; if any target cannot be resolved we fall
   * back to 0 rather than risk starting after its own logs.
   */
  _earliestDeploymentBlock: async (targets: HexAddress[], network: NetworksEnum): Promise<number> => {
    const blocks = await Promise.all(
      targets.map(async address => {
        try {
          const creation = await ProxyWeb3Provider.fetchContractCreation({ address, network })
          return creation?.blockNumber ?? 0
        } catch (error) {
          logger.warn('Could not resolve deployment block, scanning from genesis', llo({ address, network, error }))
          return 0
        }
      }),
    )

    const resolved = blocks.filter(block => block > 0)
    const fromBlock = resolved.length === targets.length ? Math.min(...resolved) : 0

    logger.verbose('Holder replay start block', llo({ network, fromBlock, targets: targets.length }))
    return fromBlock
  },

  /**
   * Handlers that fold the log stream into current holders. Order is guaranteed:
   * the crawler sorts each batch by block, transaction and log index before
   * dispatching, so a grant then revoke in one block resolves as the chain saw it.
   */
  _events: (roleHolders: Map<string, Set<string>>): IIndexerConfig[] => {
    const roleChange = (granted: boolean) => async (parsedEvent: LogDescription, info: ILogInfo) => {
      const key = `${getAddress(info.address)}:${parsedEvent.args.role as string}`
      const account = getAddress(parsedEvent.args.account as string)

      const accounts = roleHolders.get(key) ?? new Set<string>()
      granted ? accounts.add(account) : accounts.delete(account)
      roleHolders.set(key, accounts)
    }

    return [
      { event: 'RoleGranted', topic: ROLE_GRANTED, config: [{ abi: ABI as any, handler: roleChange(true) }] },
      { event: 'RoleRevoked', topic: ROLE_REVOKED, config: [{ abi: ABI as any, handler: roleChange(false) }] },
    ]
  },

  /** Unreachable RPC keeps the replayed holder; an explicit false drops it. */
  _stillHasRole: async (
    target: HexAddress,
    role: string,
    account: HexAddress,
    network: NetworksEnum,
  ): Promise<boolean> => {
    try {
      const result = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () =>
          ProviderModule.getAnyRpcProvider(network).call({
            to: target,
            data: hasRoleInterface.encodeFunctionData('hasRole', [role, account]),
          }),
        ),
      )
      const [holds] = hasRoleInterface.decodeFunctionResult('hasRole', result)
      return holds === true
    } catch (error) {
      logger.verbose('hasRole unreachable, keeping the replayed holder', llo({ target, role, account, error }))
      return true
    }
  },
}

export default HolderDiscovery
