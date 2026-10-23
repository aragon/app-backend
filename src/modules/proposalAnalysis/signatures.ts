/**
 * Function selector table for the proposal analysis.
 *
 * The detectors classify actions by what function they call, not by `ProposalActionType`: the
 * decoder only assigns a type to the handful of actions the UI renders specially, while `grant`,
 * `upgradeToAndCall` or `applyInstallation` come back as `Unknown` with a decoded `inputData`. And
 * when the decoder fails completely (`inputData: null`) the first four bytes of the calldata are
 * still there, so a selector lookup lets a rule fire on an undecoded permission grant.
 *
 * The table is built from the contract artifacts this repository already ships plus a few
 * signatures (UUPS proxies, ERC20) that have no artifact of their own.
 */

import { Admin } from '@artifacts/Admin'
import { CrossChainController } from '@artifacts/CrossChainController'
import { DAO } from '@artifacts/dao'
import { DaoV2 } from '@artifacts/daoV2'
import { ERC20 } from '@artifacts/ERC20'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { LockToVote } from '@artifacts/LockToVote'
import { MajorityVotingBase } from '@artifacts/MajorityVotingBase'
import { Multisig } from '@artifacts/Multisig'
import { PermissionManager } from '@artifacts/PermissionManager'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { TokenVoting } from '@artifacts/TokenVoting'
import { Interface, id } from 'ethers'

export interface IKnownFunction {
  name: string
  /** Canonical text signature, e.g. `grant(address,address,bytes32)`. */
  signature: string
}

const EXTRA_SIGNATURES = [
  'upgradeTo(address)',
  'upgradeToAndCall(address,bytes)',
  'transfer(address,uint256)',
  'transferFrom(address,address,uint256)',
  'safeTransferFrom(address,address,uint256)',
  'approve(address,uint256)',
  'mint(address,uint256)',
]

const ARTIFACTS: Array<{ abi: any[] }> = [
  DAO,
  DaoV2,
  PermissionManager,
  PluginSetupProcessor,
  Multisig,
  TokenVoting,
  MajorityVotingBase,
  LockToVote,
  StagedProposalProcessor,
  Admin,
  CrossChainController,
  GovernanceERC20,
  ERC20,
]

function buildTable(): Map<string, IKnownFunction> {
  const table = new Map<string, IKnownFunction>()

  for (const artifact of ARTIFACTS) {
    const iface = new Interface(artifact.abi)
    iface.forEachFunction(fragment => {
      if (!table.has(fragment.selector)) {
        table.set(fragment.selector, { name: fragment.name, signature: fragment.format('sighash') })
      }
    })
  }

  for (const signature of EXTRA_SIGNATURES) {
    const selector = id(signature).slice(0, 10)
    if (!table.has(selector)) {
      table.set(selector, { name: signature.slice(0, signature.indexOf('(')), signature })
    }
  }

  return table
}

const TABLE = buildTable()

const KnownSignatures = {
  /** The `0x`-prefixed 4-byte selector of a calldata string, or null when there is none. */
  selectorOf(data: string | null | undefined): string | null {
    if (!data || data.length < 10 || !data.startsWith('0x')) {
      return null
    }
    return data.slice(0, 10).toLowerCase()
  },

  lookup(selector: string | null): IKnownFunction | null {
    if (!selector) {
      return null
    }
    return TABLE.get(selector.toLowerCase()) ?? null
  },
}

export default KnownSignatures
