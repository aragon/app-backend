import { type IAssessmentWrapper } from '@types'
import { Interface, type Result, type TransactionDescription } from 'ethers'

/**
 * Signatures the checks understand without any contract lookup; a fragment joins this list with
 * the check that reads it. Decoding is pure: the calldata either matches or stays undecoded
 * until block-pinned ABI resolution exists. Amounts are kept as decimal strings, never numbers.
 */
const ASSET_FRAGMENTS = [
  'function transfer(address to, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
  'function approve(address spender, uint256 amount)',
  'function increaseAllowance(address spender, uint256 addedValue)',
  'function decreaseAllowance(address spender, uint256 subtractedValue)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)',
  'function setApprovalForAll(address operator, bool approved)',
  'function mint(address to, uint256 amount)',
  'function burn(uint256 amount)',
  'function burnFrom(address account, uint256 amount)',
  'function freezeMinting()',
  'function grant(address where, address who, bytes32 permissionId)',
  'function grantWithCondition(address where, address who, bytes32 permissionId, address condition)',
  'function revoke(address where, address who, bytes32 permissionId)',
  'function applySingleTargetPermissions(address where, (uint8 operation, address who, bytes32 permissionId)[] items)',
  'function applyMultiTargetPermissions((uint8 operation, address where, address who, address condition, bytes32 permissionId)[] items)',
  'function upgradeTo(address newImplementation)',
  'function upgradeToAndCall(address newImplementation, bytes data)',
  'function upgrade(address proxy, address implementation)',
  'function upgradeAndCall(address proxy, address implementation, bytes data)',
  'function initialize(bytes metadata, address initialOwner, address trustedForwarder, string daoURI)',
  'function initializeFrom(uint8 previousProtocolVersion, bytes initData)',
  'function applyInstallation(address _dao, (((uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, address plugin, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions, bytes32 helpersHash) _params)',
  'function applyUpdate(address _dao, (address plugin, ((uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, bytes initData, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions, bytes32 helpersHash) _params)',
  'function applyUninstallation(address _dao, (address plugin, ((uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions) _params)',
  'function setTrustedForwarder(address _trustedForwarder)',
  'function registerStandardCallback(bytes4 _interfaceId, bytes4 _callbackSelector, bytes4 _magicNumber)',
  'function setSignatureValidator(address _signatureValidator)',
  'function setTargetConfig((address target, uint8 operation) _targetConfig)',
  'function enableModule(address module)',
  'function disableModule(address prevModule, address module)',
  'function setGuard(address guard)',
  'function setTxCooldown(uint256 cooldown)',
  'function setTxExpiration(uint256 expiration)',
  'function setTxNonce(uint256 nonce)',
  'function skipExpired()',
  'function transferOwnership(address newOwner)',
  'function acceptOwnership()',
  'function renounceOwnership()',
  'function setPendingGovernor(address pendingGovernor)',
  'function acceptGovernor()',
  'function setGuardian(address guardian)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  'function renounceRole(bytes32 role, address account)',
  'function updateVotingSettings((uint8 votingMode, uint32 supportThreshold, uint32 minParticipation, uint64 minDuration, uint256 minProposerVotingPower) _votingSettings)',
  'function updateVotingSettings((uint8 votingMode, uint32 supportThresholdRatio, uint32 minParticipationRatio, uint32 minApprovalRatio, uint64 proposalDuration, uint256 minProposerVotingPower) _votingSettings)',
  'function updateMultisigSettings((bool onlyListed, uint16 minApprovals) _multisigSettings)',
  'function addAddresses(address[] _members)',
  'function removeAddresses(address[] _members)',
  'function addOwnerWithThreshold(address owner, uint256 _threshold)',
  'function removeOwner(address prevOwner, address owner, uint256 _threshold)',
  'function swapOwner(address prevOwner, address oldOwner, address newOwner)',
  'function changeThreshold(uint256 _threshold)',
  'function updateStages(((address addr, bool isManual, bool tryAdvance, uint8 resultType)[] bodies, uint64 maxAdvance, uint64 minAdvance, uint64 voteDuration, uint16 approvalThreshold, uint16 vetoThreshold, bool cancelable, bool editable)[] _stages)',
]

/** Selectors whose target is a token contract, so its standard is worth knowing. */
export const TOKEN_CALL_NAMES = new Set([
  'transfer',
  'transferFrom',
  'approve',
  'increaseAllowance',
  'decreaseAllowance',
  'safeTransferFrom',
  'safeBatchTransferFrom',
  'setApprovalForAll',
  'mint',
  'burn',
  'burnFrom',
  'freezeMinting',
])

/**
 * Calls that carry other calls. The DAO's own execute, Safe transactions (direct and from a
 * module), the Zodiac Delay queue, the Zodiac Roles module, and Multicall3. Operation 1 on the
 * Safe family is a delegatecall, which runs the target's code with the Safe's storage.
 */
const WRAPPER_FRAGMENTS = [
  'function execute(bytes32 callId, (address to, uint256 value, bytes data)[] actions, uint256 allowFailureMap)',
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)',
  'function execTransactionFromModule(address to, uint256 value, bytes data, uint8 operation)',
  'function execTransactionFromModuleReturnData(address to, uint256 value, bytes data, uint8 operation)',
  'function executeNextTx(address to, uint256 value, bytes data, uint8 operation)',
  'function callTargetFunctionWithRole(address targetContract, bytes data, uint16 role)',
  'function upgradeToAndCall(address newImplementation, bytes data)',
  'function upgradeAndCall(address proxy, address implementation, bytes data)',
  'function aggregate((address target, bytes callData)[] calls)',
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls)',
  'function aggregate3Value((address target, bool allowFailure, uint256 value, bytes callData)[] calls)',
]

export interface IInnerCall {
  to: string
  value: string
  data: string
  operation: 'call' | 'delegatecall'
}

const KnownAbi = {
  _interface: new Interface(ASSET_FRAGMENTS),
  _wrappers: new Interface(WRAPPER_FRAGMENTS),
  _wrapperSelectors: new Set(
    WRAPPER_FRAGMENTS.map(f => Interface.from([f]).fragments[0]).map(f => (f as any).selector as string),
  ),

  selectorOf(data: string): string | null {
    const hex = (data ?? '').toLowerCase()
    return hex.length >= 10 ? hex.slice(0, 10) : null
  },

  /** Whether the action was decoded by the built-in list, so its argument names are the ones the rules read. A verified overload of the same name is not. */
  isBuiltin(action: { abi: { source: string } | null; decoded: unknown }): boolean {
    return !!action.decoded && action.abi?.source === 'builtin'
  },

  /** The typed ethers view of a built-in call, for adapters that need structured arguments; null when it is not one. */
  parse(data: string): TransactionDescription | null {
    try {
      return KnownAbi._interface.parseTransaction({ data })
    } catch {
      return null
    }
  },

  /** Returns null for anything outside the fragment list or with calldata that does not fit it. */
  decode(data: string): { signature: string; name: string; args: Record<string, string> } | null {
    try {
      const parsed = KnownAbi._interface.parseTransaction({ data })
      if (!parsed) return null
      return {
        signature: parsed.signature,
        name: parsed.name,
        args: KnownAbi._args(parsed.fragment.inputs, parsed.args),
      }
    } catch {
      return null
    }
  },

  isWrapperSelector(selector: string | null): boolean {
    return !!selector && KnownAbi._wrapperSelectors.has(selector)
  },

  /** The calls a wrapper carries, in order, or null when the calldata is not a wrapper the builder knows or does not fit it. `target` is the wrapper's own address, which a proxy upgrade calls back into. */
  decodeWrapper(data: string, target: string): { wrapper: IAssessmentWrapper; calls: IInnerCall[] } | null {
    try {
      const parsed = KnownAbi._wrappers.parseTransaction({ data })
      if (!parsed) return null
      const wrapper = parsed.name as IAssessmentWrapper
      const op = (v: unknown): IInnerCall['operation'] => (String(v) === '1' ? 'delegatecall' : 'call')
      switch (wrapper) {
        case 'execute':
          return {
            wrapper,
            calls: parsed.args.actions.map((a: Result) => ({
              to: a.to,
              value: a.value.toString(),
              data: a.data,
              operation: 'call',
            })),
          }
        case 'execTransaction':
        case 'execTransactionFromModule':
        case 'execTransactionFromModuleReturnData':
        case 'executeNextTx':
          return {
            wrapper,
            calls: [
              {
                to: parsed.args.to,
                value: parsed.args.value.toString(),
                data: parsed.args.data,
                operation: op(parsed.args.operation),
              },
            ],
          }
        case 'callTargetFunctionWithRole':
          return {
            wrapper,
            calls: [{ to: parsed.args.targetContract, value: '0', data: parsed.args.data, operation: 'call' }],
          }
        case 'upgradeToAndCall':
        case 'upgradeAndCall': {
          // The call runs on the proxy right after the upgrade, with the new code; empty data carries nothing.
          const proxy = wrapper === 'upgradeAndCall' ? parsed.args.proxy : target
          const data = String(parsed.args.data)
          return { wrapper, calls: data === '0x' ? [] : [{ to: proxy, value: '0', data, operation: 'call' }] }
        }
        case 'aggregate':
          return {
            wrapper,
            calls: parsed.args.calls.map((c: Result) => ({
              to: c.target,
              value: '0',
              data: c.callData,
              operation: 'call',
            })),
          }
        case 'aggregate3':
          return {
            wrapper,
            calls: parsed.args.calls.map((c: Result) => ({
              to: c.target,
              value: '0',
              data: c.callData,
              operation: 'call',
            })),
          }
        case 'aggregate3Value':
          return {
            wrapper,
            calls: parsed.args.calls.map((c: Result) => ({
              to: c.target,
              value: c.value.toString(),
              data: c.callData,
              operation: 'call',
            })),
          }
        default:
          return null
      }
    } catch {
      return null
    }
  },

  _args(inputs: readonly { name: string; type: string }[], values: Result): Record<string, string> {
    const args: Record<string, string> = {}
    inputs.forEach((input, i) => {
      const value = values[i]
      args[input.name || String(i)] = typeof value === 'bigint' ? value.toString() : String(value)
    })
    return args
  },
}

export default KnownAbi
