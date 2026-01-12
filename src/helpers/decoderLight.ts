import * as ContractNetspecHelper from '@helpers/contractNetspec'
import ProxyContract from '@helpers/proxyContract'
import Utils from '@helpers/utils'
import logger from '@logger'
import ProxyWeb3Provider from '@modules/proxyProvider'
import {
  type HexAddress,
  type ILightDecodeResult,
  type IProposalActionInputDataParameter,
  type IRawActionLight,
  KnownActionSignature,
  type NetworksEnum,
  ProposalActionType,
} from '@types'
import { FunctionFragment, hexlify, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:DecoderLight' })

interface BatchContext {
  proxyMap: Map<string, HexAddress | null>
  sourceMap: Map<string, { abi: any[]; source: string; contractName: string } | null>
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

  async decode(action: IRawActionLight, network: NetworksEnum): Promise<ILightDecodeResult> {
    if (this._isNativeTransfer(action)) {
      return this._buildNativeTransferResult(action)
    }

    const implementationAddress = await ProxyContract.getImplementationAddress(action.to, network)
    const targetAddress = implementationAddress || action.to

    const sourceCode = await ProxyWeb3Provider.fetchContractSourceCode({
      address: targetAddress,
      network,
    })

    if (!sourceCode || sourceCode.length === 0 || !sourceCode[0].ABI) {
      return this._buildBaseResult(action)
    }

    let proxyName: string | null = null
    if (implementationAddress && implementationAddress !== action.to) {
      const proxySource = await ProxyWeb3Provider.fetchContractSourceCode({
        address: action.to,
        network,
      })
      proxyName = proxySource?.[0]?.ContractName || null
    }

    return this._decodeWithSource(action, sourceCode[0], implementationAddress, proxyName)
  }

  async decodeBatch(actions: IRawActionLight[], network: NetworksEnum): Promise<ILightDecodeResult[]> {
    if (actions.length === 0) return []
    if (actions.length === 1) return [await this.decode(actions[0], network)]

    const uniqueAddresses = [...new Set(actions.map(a => a.to.toLowerCase()))]

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
      if (impl) addressesToFetch.add(impl.toLowerCase())
    })

    const sourceMap = new Map<string, { abi: any[]; source: string; contractName: string } | null>()
    const sourceResults = await Promise.all(
      [...addressesToFetch].map(async addr => {
        const source = await ProxyWeb3Provider.fetchContractSourceCode({ address: addr, network })
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

    const context: BatchContext = { proxyMap, sourceMap }
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

  private _decodeWithContext(action: IRawActionLight, context: BatchContext): ILightDecodeResult {
    if (this._isNativeTransfer(action)) {
      return this._buildNativeTransferResult(action)
    }

    const addrLower = action.to.toLowerCase()
    const implementationAddress = context.proxyMap.get(addrLower) ?? null
    const targetAddress = implementationAddress || action.to
    const sourceData = context.sourceMap.get(targetAddress.toLowerCase())

    if (!sourceData) {
      return this._buildBaseResult(action)
    }

    let proxyName: string | null = null
    if (implementationAddress && implementationAddress.toLowerCase() !== addrLower) {
      const proxySource = context.sourceMap.get(addrLower)
      proxyName = proxySource?.contractName || null
    }

    return this._decodeWithAbi(
      action,
      sourceData.abi,
      sourceData.source,
      sourceData.contractName,
      implementationAddress,
      proxyName,
    )
  }

  private _decodeWithSource(
    action: IRawActionLight,
    source: { ABI: string; SourceCode: string; ContractName: string; CompilerVersion?: string },
    implementationAddress: HexAddress | null,
    proxyName: string | null,
  ): ILightDecodeResult {
    try {
      const abi = JSON.parse(source.ABI)
      return this._decodeWithAbi(action, abi, source.SourceCode, source.ContractName, implementationAddress, proxyName)
    } catch (error) {
      logger.warn('Failed to parse ABI', llo({ error, address: action.to }))
      return this._buildBaseResult(action)
    }
  }

  private _decodeWithAbi(
    action: IRawActionLight,
    abi: any[],
    sourceCode: string,
    contractName: string,
    implementationAddress: HexAddress | null,
    proxyName: string | null,
  ): ILightDecodeResult {
    try {
      const dataHex = hexlify(action.data)
      const selector = dataHex.substring(0, 10)

      const netspecAbi = ContractNetspecHelper.parseNetspec(sourceCode, contractName, abi)

      const functionAbi = netspecAbi.find((item: any) => {
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

      return {
        ...this._buildBaseResult(action),
        type,
        inputData: {
          function: fragment.name,
          contract: contractName,
          parameters,
          notice: (functionAbi as any).notice,
          textSignature,
          implementationAddress: proxyName ? implementationAddress : null,
          proxyName,
        },
      }
    } catch (error) {
      logger.warn('Failed to decode action', llo({ error, address: action.to, data: action.data }))
      return this._buildBaseResult(action)
    }
  }
}

export default DecoderLight
