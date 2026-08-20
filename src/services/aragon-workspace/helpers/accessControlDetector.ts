import ContractHelper from '@helpers/contractHelper'
import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type HexAddress, type NetworksEnum } from '@types'
import WorkspaceConfig from '@workspace/config'
import {
  type IAccessControlDetectOptions,
  type IAccessControlGuard,
  IAccessControlGuardRequirement,
  type IAccessControlReport,
  type IAccessControlRole,
  IAccessControlScheme,
} from '@workspace/types/accessControl'
import {
  AbiCoder,
  type FunctionFragment,
  Interface,
  type ParamType,
  type Provider,
  ZeroAddress,
  ZeroHash,
  ethers,
} from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helper:AccessControlDetector' })

/**
 * ERC-165 id of OZ's `IAccessControl` — the XOR of hasRole, getRoleAdmin,
 * grantRole, revokeRole and renounceRole. Ownable has no registered id, so
 * ERC-165 can only ever confirm the roles scheme, never the ownable one.
 */
const IACCESS_CONTROL_INTERFACE_ID = '0x7965db0b'

/**
 * Custom-error selectors OZ v5 reverts with. `AccessControlUnauthorizedAccount`
 * carries the required role in its second argument, which is what makes the
 * probe able to recover a function -> role map without contract source.
 */
const REVERT_SELECTORS = {
  ownableUnauthorized: '0x118cdaa7', // OwnableUnauthorizedAccount(address)
  accessControlUnauthorized: '0xe2517d3f', // AccessControlUnauthorizedAccount(address,bytes32)
  accessManagedUnauthorized: '0x068ca9d8', // AccessManagedUnauthorized(address)
  errorString: '0x08c379a0', // Error(string) — the OZ v4 revert shape
} as const

/** OZ v4 reverts with plain strings; these identify the two authorisation ones. */
const V4_OWNABLE_MESSAGE = 'Ownable: caller is not the owner'
const V4_ACCESS_CONTROL_MESSAGE = /^AccessControl: account 0x[0-9a-fA-F]{40} is missing role (0x[0-9a-fA-F]{64})$/

const DEFAULT_ADMIN_ROLE = ZeroHash

/**
 * Address the probe calls claim to come from. Nothing has ever been deployed
 * to it and it holds no roles anywhere, so a call from it exercises the
 * unauthorised branch of every guard.
 */
const DEFAULT_PROBE_FROM = '0x00000000000000000000000000000000000Ac0DE'

const DEFAULT_MAX_PROBES = 64

/** Signatures that fingerprint each scheme in the ABI, before any RPC call. */
const SCHEME_SIGNATURES = {
  ownable: ['owner()', 'transferOwnership(address)'],
  ownable2Step: ['pendingOwner()', 'acceptOwnership()'],
  accessControl: ['hasRole(bytes32,address)', 'getRoleAdmin(bytes32)'],
  accessControlEnumerable: ['getRoleMember(bytes32,uint256)', 'getRoleMemberCount(bytes32)'],
  accessManaged: ['authority()', 'setAuthority(address)'],
} as const

const READER_ABI = [
  'function owner() view returns (address)',
  'function pendingOwner() view returns (address)',
  'function authority() view returns (address)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function getRoleAdmin(bytes32 role) view returns (bytes32)',
  'function getRoleMemberCount(bytes32 role) view returns (uint256)',
  'function getRoleMember(bytes32 role, uint256 index) view returns (address)',
]

const readerInterface = new Interface(READER_ABI)

const AccessControlDetector = {
  /**
   * Classifies a contract's access-control scheme from its ABI plus a handful
   * of on-chain reads, and — when `probeGuards` is set — recovers which role
   * each state-changing function demands.
   *
   * Returns null when the address holds no bytecode or no ABI can be obtained;
   * callers must treat null as "undetermined", never as "no access control".
   */
  detect: async (
    address: HexAddress,
    network: NetworksEnum,
    options: IAccessControlDetectOptions = {},
  ): Promise<IAccessControlReport | null> => {
    try {
      const normalizedAddress = ethers.getAddress(address) as HexAddress

      const bytecode = await ContractHelper.getBytecode(normalizedAddress, network)
      if (!bytecode) {
        return null
      }

      const abi = await AccessControlDetector._resolveAbi(normalizedAddress, network, options.abi)
      if (!abi) {
        logger.verbose('No ABI available, cannot classify access control', llo({ address: normalizedAddress, network }))
        return null
      }

      const contractInterface = new Interface(abi as ReadonlyArray<any>)
      const functions = contractInterface.fragments.filter(
        (fragment): fragment is FunctionFragment => fragment.type === 'function',
      )
      const signatures = new Set(functions.map(fn => fn.format('sighash')))
      const schemes = AccessControlDetector._fingerprintSchemes(signatures)

      const provider = ProviderModule.getAnyRpcProvider(network)
      const hasRoles =
        schemes.includes(IAccessControlScheme.accessControl) ||
        schemes.includes(IAccessControlScheme.accessControlEnumerable)

      const supportsAccessControlInterface = signatures.has('supportsInterface(bytes4)')
        ? await AccessControlDetector._supportsAccessControl(provider, normalizedAddress, network)
        : null

      const [owner, pendingOwner, authority] = await Promise.all([
        signatures.has('owner()')
          ? AccessControlDetector._readAddress(provider, normalizedAddress, network, 'owner')
          : null,
        signatures.has('pendingOwner()')
          ? AccessControlDetector._readAddress(provider, normalizedAddress, network, 'pendingOwner')
          : null,
        signatures.has('authority()')
          ? AccessControlDetector._readAddress(provider, normalizedAddress, network, 'authority')
          : null,
      ])

      const roles = hasRoles
        ? await AccessControlDetector._readRoles(
            provider,
            normalizedAddress,
            network,
            contractInterface,
            functions,
            schemes.includes(IAccessControlScheme.accessControlEnumerable),
          )
        : []

      const guards = options.probeGuards
        ? await AccessControlDetector._probeGuards(
            provider,
            normalizedAddress,
            network,
            contractInterface,
            functions,
            options,
          )
        : null

      if (guards && owner) {
        await AccessControlDetector._inferOwnerGuards(
          provider,
          normalizedAddress,
          network,
          contractInterface,
          functions,
          guards,
          owner,
        )
      }

      await AccessControlDetector._appendProbedRoles(provider, normalizedAddress, network, roles, guards)

      return {
        address: normalizedAddress,
        network,
        schemes,
        supportsAccessControlInterface,
        owner,
        pendingOwner,
        authority,
        roles,
        guards,
      }
    } catch (error) {
      logger.warn('Failed to detect access control', llo({ address, network, error }))
      return null
    }
  },

  /** Prefers a caller-supplied ABI; otherwise falls back to the DB-cached explorer lookup. */
  _resolveAbi: async (
    address: HexAddress,
    network: NetworksEnum,
    provided?: ReadonlyArray<unknown>,
  ): Promise<ReadonlyArray<unknown> | null> => {
    if (provided?.length) {
      return provided
    }

    const sourceCode = await ContractHelper.getSourceCode(address, network)
    if (!sourceCode?.[0]?.ABI) {
      return null
    }

    try {
      // Unverified contracts come back with a prose message where the ABI should be
      const parsed = JSON.parse(sourceCode[0].ABI)
      return Array.isArray(parsed) && parsed.length ? parsed : null
    } catch {
      return null
    }
  },

  /** Pure ABI shape matching — no RPC, no bytecode, no source. */
  _fingerprintSchemes: (signatures: Set<string>): IAccessControlScheme[] => {
    const has = (required: ReadonlyArray<string>) => required.every(signature => signatures.has(signature))
    const schemes: IAccessControlScheme[] = []

    if (has(SCHEME_SIGNATURES.ownable)) {
      schemes.push(IAccessControlScheme.ownable)
      if (has(SCHEME_SIGNATURES.ownable2Step)) {
        schemes.push(IAccessControlScheme.ownable2Step)
      }
    }

    if (has(SCHEME_SIGNATURES.accessControl)) {
      schemes.push(IAccessControlScheme.accessControl)
      if (has(SCHEME_SIGNATURES.accessControlEnumerable)) {
        schemes.push(IAccessControlScheme.accessControlEnumerable)
      }
    }

    if (has(SCHEME_SIGNATURES.accessManaged)) {
      schemes.push(IAccessControlScheme.accessManaged)
    }

    return schemes
  },

  /**
   * ERC-165 check. Any failure (no such function, revert, rpc error) means the
   * contract does not answer as an `IAccessControl`, which the ABI fingerprint
   * may still contradict — a false here is weaker evidence than a true.
   */
  _supportsAccessControl: async (
    provider: Provider,
    address: HexAddress,
    network: NetworksEnum,
  ): Promise<boolean | null> => {
    try {
      const result = await AccessControlDetector._staticCall(provider, network, {
        to: address,
        data: readerInterface.encodeFunctionData('supportsInterface', [IACCESS_CONTROL_INTERFACE_ID]),
      })
      const [supported] = readerInterface.decodeFunctionResult('supportsInterface', result)

      return supported === true
    } catch (error) {
      logger.verbose('Contract does not answer the ERC-165 access control check', llo({ address, error }))
      return null
    }
  },

  _readAddress: async (
    provider: Provider,
    address: HexAddress,
    network: NetworksEnum,
    functionName: 'owner' | 'pendingOwner' | 'authority',
  ): Promise<HexAddress | null> => {
    try {
      const result = await AccessControlDetector._staticCall(provider, network, {
        to: address,
        data: readerInterface.encodeFunctionData(functionName, []),
      })
      const [value] = readerInterface.decodeFunctionResult(functionName, result)

      // ZeroAddress is kept rather than nulled: a renounced owner is a real answer
      return value as HexAddress
    } catch (error) {
      logger.verbose('Failed to read privileged address', llo({ address, functionName, error }))
      return null
    }
  },

  /**
   * Reads the role ids the contract publishes as `bytes32 public constant`
   * getters, then each one's admin and — for enumerable contracts only — its
   * members. Roles never exposed as a getter are invisible here by design;
   * those surface through the guard probe or a log replay.
   */
  _readRoles: async (
    provider: Provider,
    address: HexAddress,
    network: NetworksEnum,
    contractInterface: Interface,
    functions: FunctionFragment[],
    enumerable: boolean,
  ): Promise<IAccessControlRole[]> => {
    const candidates = functions.filter(
      fn =>
        fn.inputs.length === 0 &&
        fn.outputs.length === 1 &&
        fn.outputs[0].type === 'bytes32' &&
        /^[A-Z][A-Z0-9_]*$/.test(fn.name),
    )

    // The ABI comes from the target's own verified source, so its length is the
    // target's choice. Each getter costs a call plus an admin and member read.
    const getters = candidates.slice(0, WorkspaceConfig.MAX_ROLE_GETTERS)
    if (candidates.length > getters.length) {
      logger.warn(
        'Role getter candidates truncated',
        llo({ address, candidates: candidates.length, probed: getters.length }),
      )
    }

    const roles = await Promise.all(
      getters.map(async getter => {
        try {
          const result = await AccessControlDetector._staticCall(provider, network, {
            to: address,
            data: contractInterface.encodeFunctionData(getter.name, []),
          })
          const [roleId] = AbiCoder.defaultAbiCoder().decode(['bytes32'], result)

          return { id: roleId as string, name: getter.name }
        } catch (error) {
          logger.verbose('Failed to read role constant', llo({ address, role: getter.name, error }))
          return null
        }
      }),
    )

    const discovered = roles.filter((role): role is { id: string; name: string } => role !== null)
    if (!discovered.some(role => role.id === DEFAULT_ADMIN_ROLE)) {
      discovered.unshift({ id: DEFAULT_ADMIN_ROLE, name: 'DEFAULT_ADMIN_ROLE' })
    }

    const described = await Promise.all(
      discovered.map(async role =>
        AccessControlDetector._describeRole(provider, address, network, role.id, role.name, enumerable),
      ),
    )

    return described.filter(AccessControlDetector._looksLikeRole)
  },

  /**
   * The getter shape — zero-arg, returns bytes32, SCREAMING_SNAKE name — also
   * matches constants that are not roles at all, `DOMAIN_SEPARATOR` being the
   * common one. Keep a candidate only when something corroborates it: the OZ
   * naming convention, or a member actually holding it.
   *
   * DEFAULT_ADMIN_ROLE always stays; it is synthesised rather than discovered.
   * Roles named by a probe skip this entirely — a revert demanding a role is
   * proof enough — because _appendProbedRoles adds them after this runs.
   */
  _looksLikeRole: (role: IAccessControlRole): boolean => {
    if (role.id === DEFAULT_ADMIN_ROLE) return true
    if (role.name?.endsWith('_ROLE')) return true
    return (role.members?.length ?? 0) > 0
  },

  /** Resolves one role's admin and, when the contract is enumerable, its holders. */
  _describeRole: async (
    provider: Provider,
    address: HexAddress,
    network: NetworksEnum,
    roleId: string,
    name: string | null,
    enumerable: boolean,
  ): Promise<IAccessControlRole> => {
    const adminRole = await AccessControlDetector._readRoleAdmin(provider, address, network, roleId)
    const members = enumerable ? await AccessControlDetector._readRoleMembers(provider, address, network, roleId) : null

    return { id: roleId, name, adminRole, members }
  },

  _readRoleAdmin: async (
    provider: Provider,
    address: HexAddress,
    network: NetworksEnum,
    roleId: string,
  ): Promise<string | null> => {
    try {
      const result = await AccessControlDetector._staticCall(provider, network, {
        to: address,
        data: readerInterface.encodeFunctionData('getRoleAdmin', [roleId]),
      })
      const [adminRole] = readerInterface.decodeFunctionResult('getRoleAdmin', result)

      return adminRole as string
    } catch (error) {
      logger.verbose('Failed to read role admin', llo({ address, roleId, error }))
      return null
    }
  },

  _readRoleMembers: async (
    provider: Provider,
    address: HexAddress,
    network: NetworksEnum,
    roleId: string,
  ): Promise<HexAddress[] | null> => {
    try {
      const countResult = await AccessControlDetector._staticCall(provider, network, {
        to: address,
        data: readerInterface.encodeFunctionData('getRoleMemberCount', [roleId]),
      })
      const [count] = readerInterface.decodeFunctionResult('getRoleMemberCount', countResult)

      // The target decides this number, so it is clamped before it sizes an
      // allocation: a contract answering 1e9 would otherwise build a billion
      // promises and queue that many eth_calls.
      const reported = Number(count)
      const total = Number.isFinite(reported) ? Math.max(0, Math.min(reported, WorkspaceConfig.MAX_ROLE_MEMBERS)) : 0
      if (reported > total) {
        logger.warn('Role member count truncated', llo({ address, roleId, reported, enumerated: total }))
      }

      const members = await Promise.all(
        Array.from({ length: total }, async (_unused, index) => {
          const memberResult = await AccessControlDetector._staticCall(provider, network, {
            to: address,
            data: readerInterface.encodeFunctionData('getRoleMember', [roleId, index]),
          })
          const [member] = readerInterface.decodeFunctionResult('getRoleMember', memberResult)

          return member as HexAddress
        }),
      )

      return members
    } catch (error) {
      logger.verbose('Failed to enumerate role members', llo({ address, roleId, error }))
      return null
    }
  },

  /**
   * Staticcalls every state-changing function from an unprivileged address and
   * reads the authorisation error out of the revert data. Nothing here can
   * write state — `eth_call` only — so it is safe against live contracts.
   *
   * Zero-valued arguments can trip an unrelated `require` before the modifier
   * runs, which surfaces as `unknown` rather than `none`. Absence of evidence,
   * not evidence of absence.
   */
  _probeGuards: async (
    provider: Provider,
    address: HexAddress,
    network: NetworksEnum,
    contractInterface: Interface,
    functions: FunctionFragment[],
    options: IAccessControlDetectOptions,
  ): Promise<IAccessControlGuard[]> => {
    const probeFrom = options.probeFrom ?? DEFAULT_PROBE_FROM
    const maxProbes = options.maxProbes ?? DEFAULT_MAX_PROBES
    const mutating = functions.filter(fn => fn.stateMutability !== 'view' && fn.stateMutability !== 'pure')

    if (mutating.length > maxProbes) {
      logger.warn(
        'Probe budget exhausted, guard map is partial',
        llo({ address, network, probed: maxProbes, skipped: mutating.length - maxProbes }),
      )
    }

    return Promise.all(
      mutating.slice(0, maxProbes).map(async fn => {
        const guard: IAccessControlGuard = {
          selector: fn.selector,
          signature: fn.format('sighash'),
          requirement: IAccessControlGuardRequirement.unknown,
          role: null,
        }

        try {
          const data = contractInterface.encodeFunctionData(fn, fn.inputs.map(AccessControlDetector._zeroValueFor))
          await AccessControlDetector._staticCall(provider, network, { to: address, data, from: probeFrom })

          // Got past every check: the function is callable by anyone
          return { ...guard, requirement: IAccessControlGuardRequirement.none }
        } catch (error) {
          return { ...guard, ...AccessControlDetector._classifyRevert(error) }
        }
      }),
    )
  },

  /**
   * Second probe pass for the guards the first one could not classify.
   *
   * A pre-0.8 `onlyOwner` is `require(msg.sender == owner)`, which reverts with
   * no data at all — there is no selector or string to match, so it lands as
   * `unknown`. But the difference in behaviour is still observable: re-run the
   * same call as the owner, and if it now gets through, the thing blocking the
   * unprivileged caller was the ownership check.
   *
   * Mutates the guards in place and marks each one `inferred`, because this is
   * evidence rather than proof — a function gated on something the owner happens
   * to satisfy (a balance, a whitelist) would behave exactly the same way.
   *
   * Still `eth_call` only, so nothing here can write state.
   */
  _inferOwnerGuards: async (
    provider: Provider,
    address: HexAddress,
    network: NetworksEnum,
    contractInterface: Interface,
    functions: FunctionFragment[],
    guards: IAccessControlGuard[],
    owner: HexAddress,
  ): Promise<void> => {
    if (owner === ZeroAddress) return

    const bySelector = new Map(functions.map(fn => [fn.selector, fn]))
    const unresolved = guards.filter(guard => guard.requirement === IAccessControlGuardRequirement.unknown)

    await Promise.all(
      unresolved.map(async guard => {
        const fn = bySelector.get(guard.selector)
        if (!fn) return

        try {
          const data = contractInterface.encodeFunctionData(fn, fn.inputs.map(AccessControlDetector._zeroValueFor))
          await AccessControlDetector._staticCall(provider, network, { to: address, data, from: owner })

          // Blocked for nobody, fine for the owner: ownership was the gate.
          guard.requirement = IAccessControlGuardRequirement.owner
          guard.role = null
          guard.inferred = true
        } catch {
          // Reverts for the owner too, so the block was something else entirely.
        }
      }),
    )

    const inferred = guards.filter(guard => guard.inferred).length
    if (inferred) {
      logger.verbose('Inferred owner guards from a differential probe', llo({ address, network, inferred }))
    }
  },

  /**
   * Maps revert data onto a requirement. Recognises the OZ v5 custom errors
   * and the OZ v4 revert strings; anything else stays `unknown`.
   */
  _classifyRevert: (error: unknown): Pick<IAccessControlGuard, 'requirement' | 'role'> => {
    const data = AccessControlDetector._extractRevertData(error)
    if (!data) {
      return { requirement: IAccessControlGuardRequirement.unknown, role: null }
    }

    const selector = data.slice(0, 10).toLowerCase()
    const payload = `0x${data.slice(10)}`

    if (selector === REVERT_SELECTORS.ownableUnauthorized) {
      return { requirement: IAccessControlGuardRequirement.owner, role: null }
    }

    if (selector === REVERT_SELECTORS.accessManagedUnauthorized) {
      return { requirement: IAccessControlGuardRequirement.authority, role: null }
    }

    if (selector === REVERT_SELECTORS.accessControlUnauthorized) {
      try {
        const [, role] = AbiCoder.defaultAbiCoder().decode(['address', 'bytes32'], payload)
        return { requirement: IAccessControlGuardRequirement.role, role: role as string }
      } catch {
        return { requirement: IAccessControlGuardRequirement.role, role: null }
      }
    }

    if (selector === REVERT_SELECTORS.errorString) {
      try {
        const [message] = AbiCoder.defaultAbiCoder().decode(['string'], payload)

        if (message === V4_OWNABLE_MESSAGE) {
          return { requirement: IAccessControlGuardRequirement.owner, role: null }
        }

        const missingRole = V4_ACCESS_CONTROL_MESSAGE.exec(message as string)
        if (missingRole) {
          return { requirement: IAccessControlGuardRequirement.role, role: missingRole[1] }
        }
      } catch {
        // Fall through to unknown
      }
    }

    return { requirement: IAccessControlGuardRequirement.unknown, role: null }
  },

  /** Revert data sits in a different place depending on how far up the error bubbled. */
  _extractRevertData: (error: unknown): string | null => {
    const candidate = error as { data?: unknown; info?: { error?: { data?: unknown } }; error?: { data?: unknown } }
    const sources = [candidate?.data, candidate?.info?.error?.data, candidate?.error?.data]

    for (const source of sources) {
      if (typeof source === 'string' && source.startsWith('0x') && source.length >= 10) {
        return source
      }
    }

    return null
  },

  /**
   * Builds the zero value for an ABI parameter so a function can be probed
   * without knowing anything about its arguments.
   */
  _zeroValueFor: (param: ParamType): unknown => {
    if (param.baseType === 'array') {
      const length = param.arrayLength ?? -1
      return length > 0 ? Array.from({ length }, () => AccessControlDetector._zeroValueFor(param.arrayChildren!)) : []
    }

    if (param.baseType === 'tuple') {
      return (param.components ?? []).map(AccessControlDetector._zeroValueFor)
    }

    if (param.baseType === 'address') return ZeroAddress
    if (param.baseType === 'bool') return false
    if (param.baseType === 'string') return ''
    if (param.baseType === 'bytes') return '0x'
    if (param.baseType.startsWith('bytes')) return ZeroHash.slice(0, 2 + Number(param.baseType.slice(5)) * 2)

    return 0
  },

  /**
   * Roles the probe named but no public getter exposes. An unresolvable role
   * id is itself worth surfacing, so these land in the report with a null name
   * rather than being dropped.
   */
  _appendProbedRoles: async (
    provider: Provider,
    address: HexAddress,
    network: NetworksEnum,
    roles: IAccessControlRole[],
    guards: IAccessControlGuard[] | null,
  ): Promise<void> => {
    if (!guards?.length) {
      return
    }

    const known = new Set(roles.map(role => role.id.toLowerCase()))
    const missing = [
      ...new Set(
        guards.map(guard => guard.role).filter((role): role is string => !!role && !known.has(role.toLowerCase())),
      ),
    ]

    for (const roleId of missing) {
      roles.push(await AccessControlDetector._describeRole(provider, address, network, roleId, null, false))
    }
  },

  _staticCall: async (
    provider: Provider,
    network: NetworksEnum,
    transaction: { to: string; data: string; from?: string },
  ): Promise<string> =>
    retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => provider.call(transaction))),
}

export default AccessControlDetector
