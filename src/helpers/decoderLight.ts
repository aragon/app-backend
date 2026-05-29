import ContractHelper from '@helpers/contractHelper'
import * as ContractNetspecHelper from '@helpers/contractNetspec'
import ProxyContract from '@helpers/proxyContract'
import Utils from '@helpers/utils'
import logger from '@logger'
import {
  type HexAddress,
  type ILightDecodeInputData,
  type ILightDecodeResult,
  type IProposalActionInputDataParameter,
  type IRawActionLight,
  KnownActionSignature,
  type NetworksEnum,
  ProposalActionType,
} from '@types'
import { FunctionFragment, hexlify, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:DecoderLight' })

/** Max recursion depth when decoding nested `execute` / `createProposal` action trees. */
const MAX_NESTED_DEPTH = 3

interface BatchContext {
  proxyMap: Map<string, HexAddress | null>
  sourceMap: Map<string, { abi: any[]; source: string; contractName: string } | null>
  // Parsed NatSpec-enriched ABI, cached per target address so a batch of actions
  // hitting the same contract scans the source code only once.
  netspecMap: Map<string, any[]>
  network: NetworksEnum
}

const SIGNATURE_TYPE_MAP: Record<string, ProposalActionType> = {
  [KnownActionSignature.Transfer]: ProposalActionType.Transfer,
  [KnownActionSignature.TransferFrom]: ProposalActionType.Transfer,
  [KnownActionSignature.SafeTransferFrom]: ProposalActionType.Transfer,
  [KnownActionSignature.Mint]: ProposalActionType.Mint,
  [KnownActionSignature.MultisigAddMembers]: ProposalActionType.MultisigAddMembers,
  [KnownActionSignature.MultisigRemoveMembers]: ProposalActionType.MultisigRemoveMembers,
  [KnownActionSignature.MetadataUpdate]: ProposalActionType.MetadataUpdate,
  [KnownActionSignature.UpdateMultiSigSettings]: ProposalActionType.UpdateMultiSigSettings,
  [KnownActionSignature.UpdateVoteSettings]: ProposalActionType.UpdateTokenVoteSettings,
  [KnownActionSignature.StagesUpdated]: ProposalActionType.StagesUpdated,
  [KnownActionSignature.RegisterGauge]: ProposalActionType.RegisterGauge,
  [KnownActionSignature.CreateGauge]: ProposalActionType.CreateGauge,
  [KnownActionSignature.UpdateGaugeMetadata]: ProposalActionType.UpdateGaugeMetadata,
  [KnownActionSignature.CreateCampaign]: ProposalActionType.CreateCampaign,
  [KnownActionSignature.Execute]: ProposalActionType.Execute,
  [KnownActionSignature.CreateProposalMultisig]: ProposalActionType.CreateProposal,
  [KnownActionSignature.CreateProposalVoting]: ProposalActionType.CreateProposal,
  [KnownActionSignature.CreateProposalSpp]: ProposalActionType.CreateProposal,
  [KnownActionSignature.CreateProposalSppData]: ProposalActionType.CreateProposal,
}

class DecoderLight {
  private _buildBaseResult(action: IRawActionLight): ILightDecodeResult {
    return {
      from: action.from || '',
      to: action.to,
      data: action.data,
      value: action.value,
      type: ProposalActionType.Unknown,
      inputData: null,
    }
  }

  private _buildNativeTransferResult(action: IRawActionLight): ILightDecodeResult {
    return {
      ...this._buildBaseResult(action),
      type: ProposalActionType.TransferNative,
      inputData: {
        function: 'NativeTransfer',
        contract: 'Wallet Address',
        parameters: [],
        textSignature: 'Transfer (Native)',
      },
    }
  }

  async decode(action: IRawActionLight, network: NetworksEnum, depth = 0): Promise<ILightDecodeResult> {
    if (this._isNativeTransfer(action)) {
      return this._buildNativeTransferResult(action)
    }

    const implementationAddress = await ProxyContract.getImplementationAddress(action.to, network)
    const targetAddress = implementationAddress || action.to

    const sourceCode = await ContractHelper.getSourceCode(targetAddress, network)

    if (!sourceCode || sourceCode.length === 0 || !sourceCode[0].ABI) {
      return this._buildBaseResult(action)
    }

    let proxyName: string | null = null
    if (implementationAddress && implementationAddress !== action.to) {
      const proxySource = await ContractHelper.getSourceCode(action.to, network)
      proxyName = proxySource?.[0]?.ContractName || null
    }

    return this._decodeWithSource(action, sourceCode[0], implementationAddress, proxyName, network, depth)
  }

  async decodeBatch(actions: IRawActionLight[], network: NetworksEnum): Promise<ILightDecodeResult[]> {
    if (actions.length === 0) return []
    if (actions.length === 1) return [await this.decode(actions[0], network)]

    const uniqueAddresses = [...new Set(actions.map(a => a.to))]

    const proxyMap = new Map<string, HexAddress | null>()
    const proxyResults = await Promise.all(
      uniqueAddresses.map(async addr => {
        const impl = await ProxyContract.getImplementationAddress(addr, network)
        return { addr, impl }
      }),
    )
    proxyResults.forEach(({ addr, impl }) => proxyMap.set(addr, impl))

    const addressesToFetch = new Set<string>()
    uniqueAddresses.forEach(addr => {
      addressesToFetch.add(addr)
      const impl = proxyMap.get(addr)
      if (impl) addressesToFetch.add(impl)
    })

    const sourceMap = new Map<string, { abi: any[]; source: string; contractName: string } | null>()
    const sourceResults = await Promise.all(
      [...addressesToFetch].map(async addr => {
        const source = await ContractHelper.getSourceCode(addr, network)
        if (source && source.length > 0 && source[0].ABI) {
          try {
            return {
              addr,
              data: {
                abi: JSON.parse(source[0].ABI),
                source: source[0].SourceCode,
                contractName: source[0].ContractName,
              },
            }
          } catch {
            return { addr, data: null }
          }
        }
        return { addr, data: null }
      }),
    )
    sourceResults.forEach(({ addr, data }) => sourceMap.set(addr, data))

    const context: BatchContext = { proxyMap, sourceMap, netspecMap: new Map(), network }
    return Promise.all(actions.map(action => this._decodeWithContext(action, context)))
  }

  private _isNativeTransfer(action: IRawActionLight): boolean {
    const isEmptyData = !action.data || action.data === '0x' || action.data === ''
    try {
      return isEmptyData && BigInt(action.value || 0) > 0n
    } catch {
      return false
    }
  }

  private async _decodeWithContext(action: IRawActionLight, context: BatchContext): Promise<ILightDecodeResult> {
    if (this._isNativeTransfer(action)) {
      return this._buildNativeTransferResult(action)
    }

    const implementationAddress = context.proxyMap.get(action.to) ?? null
    const targetAddress = implementationAddress || action.to
    const sourceData = context.sourceMap.get(targetAddress)

    if (!sourceData) {
      return this._buildBaseResult(action)
    }

    let proxyName: string | null = null
    if (implementationAddress && implementationAddress !== action.to) {
      const proxySource = context.sourceMap.get(action.to)
      proxyName = proxySource?.contractName || null
    }

    const cachedNetspecAbi = context.netspecMap.get(targetAddress)
    const netspecAbi =
      cachedNetspecAbi ?? ContractNetspecHelper.parseNetspec(sourceData.source, sourceData.contractName, sourceData.abi)
    if (!cachedNetspecAbi) {
      context.netspecMap.set(targetAddress, netspecAbi)
    }

    return this._decodeWithAbi(
      action,
      sourceData.abi,
      sourceData.source,
      sourceData.contractName,
      implementationAddress,
      proxyName,
      context.network,
      0,
      netspecAbi,
    )
  }

  private async _decodeWithSource(
    action: IRawActionLight,
    source: { ABI: string; SourceCode: string; ContractName: string; CompilerVersion?: string },
    implementationAddress: HexAddress | null,
    proxyName: string | null,
    network: NetworksEnum,
    depth: number,
  ): Promise<ILightDecodeResult> {
    try {
      const abi = JSON.parse(source.ABI)
      return await this._decodeWithAbi(
        action,
        abi,
        source.SourceCode,
        source.ContractName,
        implementationAddress,
        proxyName,
        network,
        depth,
      )
    } catch (error) {
      logger.warn('Failed to parse ABI', llo({ error, address: action.to }))
      return this._buildBaseResult(action)
    }
  }

  private async _decodeWithAbi(
    action: IRawActionLight,
    abi: any[],
    sourceCode: string,
    contractName: string,
    implementationAddress: HexAddress | null,
    proxyName: string | null,
    network: NetworksEnum,
    depth: number,
    netspecAbi?: any[],
  ): Promise<ILightDecodeResult> {
    try {
      const dataHex = hexlify(action.data)
      const selector = dataHex.substring(0, 10)

      const resolvedNetspecAbi = netspecAbi ?? ContractNetspecHelper.parseNetspec(sourceCode, contractName, abi)

      const functionAbi = resolvedNetspecAbi.find((item: any) => {
        if (item.type !== 'function') return false
        try {
          const sig = FunctionFragment.getSelector(item.name, item.inputs)
          return sig === selector
        } catch {
          return false
        }
      })

      if (!functionAbi) {
        return this._buildBaseResult(action)
      }

      const iface = new Interface(abi)
      const fragment = FunctionFragment.from(functionAbi)
      const decoded = iface.decodeFunctionData(fragment, dataHex)
      const decodedArray = decoded.toArray().map((item: any) => (typeof item === 'bigint' ? item.toString() : item))

      const parameters: IProposalActionInputDataParameter[] = fragment.inputs.map((input, index) => ({
        name: input.name || `param${index}`,
        type: input.type,
        components: (functionAbi.inputs[index] as any)?.components,
        value: Array.isArray(decodedArray[index])
          ? JSON.parse(Utils.JSONStringifyCircular(decodedArray[index]))
          : decodedArray[index],
        notice: (functionAbi.inputs[index] as any)?.notice,
      }))

      const paramTypes = fragment.inputs.map(input => input.type).join(',')
      const textSignature = `${fragment.name}(${paramTypes})`

      const type = SIGNATURE_TYPE_MAP[textSignature] || ProposalActionType.Unknown

      const inputData: ILightDecodeInputData = {
        function: fragment.name,
        contract: contractName,
        parameters,
        notice: (functionAbi as any).notice,
        textSignature,
        implementationAddress: proxyName ? implementationAddress : null,
        proxyName,
      }

      if (type === ProposalActionType.Execute || type === ProposalActionType.CreateProposal) {
        inputData.actions = await this._decodeNestedActions(parameters, action, network, depth)
      }

      return {
        ...this._buildBaseResult(action),
        type,
        inputData,
      }
    } catch (error) {
      logger.warn('Failed to decode action', llo({ error, address: action.to, data: action.data }))
      return this._buildBaseResult(action)
    }
  }

  /**
   * Decodes the nested `IDAO.Action[]` (ethers `tuple[]`) carried by `execute` / `createProposal`
   * calls into a hierarchy of decoded actions. Recursion is capped at MAX_NESTED_DEPTH; deeper
   * actions are kept raw with `type: Unknown`.
   */
  private async _decodeNestedActions(
    parameters: IProposalActionInputDataParameter[],
    parentAction: IRawActionLight,
    network: NetworksEnum,
    depth: number,
  ): Promise<ILightDecodeResult[]> {
    const actionsParam = parameters.find(param => param.type === 'tuple[]')
    const nestedTuples: any[] = Array.isArray(actionsParam?.value) ? (actionsParam!.value as any[]) : []

    if (nestedTuples.length === 0) {
      return []
    }

    // Each tuple is an `IDAO.Action`: [to, value, data] (array) or { to, value, data } (object).
    const toRawAction = (tuple: any): IRawActionLight => ({
      from: parentAction.to,
      to: tuple?.to ?? tuple?.[0],
      value: String(tuple?.value ?? tuple?.[1] ?? '0'),
      data: tuple?.data ?? tuple?.[2] ?? '0x',
    })

    if (depth >= MAX_NESTED_DEPTH) {
      return nestedTuples.map(tuple => this._buildBaseResult(toRawAction(tuple)))
    }

    return Promise.all(nestedTuples.map(tuple => this.decode(toRawAction(tuple), network, depth + 1)))
  }
}

export default DecoderLight
