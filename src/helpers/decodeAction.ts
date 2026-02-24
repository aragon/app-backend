import logger from '@logger'
import { ethers, FunctionFragment, hexlify, Interface } from 'ethers'
import FourByte from '@helpers/4byte'
import Web3Helper from '@helpers/web3'
import type Proposal from '@models/schema/proposal'
import {
  type HexAddress,
  type IProposalAction,
  type IProposalActionInputData,
  type IProposalActionInputDataParameter,
  type IRawAction,
  KnownActionSignature,
  type NetworksEnum,
} from '@types'
import { ProposalActionType } from '@src/types'
import { Models } from '@dbModels'
import _ from 'lodash'
import * as ContractNetspecHelper from '@helpers/contractNetspec'
import Etherscan from '@helpers/etherscan'
import ProxyContract from '@helpers/proxyContract'
import { ProxyToken } from '@modules/proxyToken'
import Covalent from '@helpers/covalent'
import IPFSModule from '@src/modules/ipfs'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'

import {
  AddresslistVoting,
  DAO,
  DAOFactory,
  DAORegistry,
  GoveranceERC20,
  Multisig,
  MultiSigSetup,
  PluginRepo,
  PluginRepoFactory,
  PluginRepoRegistry,
  TokenVoting,
  StagedProposalProcessor,
} from '@src/aragonContracts'

import { MajorityVotingBase } from '@artifacts/MajorityVotingBase'
import { IERC20MintableUpgradeable } from '@artifacts/IERC20MintableUpgradeable'
import { ERC20 } from '@artifacts/ERC20'
import { ERC721 } from '@artifacts/ERC721'
import { ERC1155 } from '@artifacts/ERC1155'
import Utils from '@helpers/utils'
import { ProxyMember } from '@modules/proxyMember'

const llo = logger.logMeta.bind(null, { service: 'DecodeActions' })

interface Signature {
  method: string
  sig: string
  fragment: FunctionFragment
  notice: string
  inputs: any[]
}

class DecodeActions {
  allSignatures: { contractName: string; signatures: Signature[]; abi: any[] }[]
  data: any

  constructor() {
    this.allSignatures = []
    this._setupSignatures()
  }

  public async decodeTransfer(action: IRawAction, document: Partial<Proposal>): Promise<any> {
    if (Web3Helper.isNativeTokenAction(action)) {
      const nativeToken = await Models.Token.findByTokenAddressAndNetwork(ethers.ZeroAddress, document.network!)
      const token = _.pick(nativeToken, ['address', 'name', 'symbol', 'decimals', 'logo', 'type', 'priceUsd'])

      const member = await ProxyMember.createMember(action.to)
      const dao = await Models.Dao.findByAddress(document.daoAddress, document.network)

      return {
        from: document.daoAddress,
        to: action.to,
        value: action.value,
        data: action.data,
        type: ProposalActionType.Transfer,
        sender: { address: document.daoAddress, ens: dao.ens },
        receiver: { address: member.address, ens: member.ens, avatar: member.avatar },
        amount: action.value,
        token,
        inputData: {
          textSignature: 'nativeTransfer(address,uint256)',
          function: 'NativeTransfer',
          contract: 'NativeToken',
          parameters: [
            {
              type: 'address',
              value: action.to,
            },
            {
              type: 'uint256',
              value: action.value,
            },
          ],
        },
      }
    }

    return null
  }

  public async decodeData(action: IRawAction, document: Partial<Proposal>): Promise<IProposalAction | null> {
    const decoded = (await this._decodeWithAbi(action)) || (await this._decodeFallback(action.data))

    if (!decoded) return null

    const actionHandlers: Record<
      string,
      (decoded: IProposalActionInputData, action: IRawAction, document: Partial<Proposal>) => Promise<any>
    > = {
      transfer: this._parseTransferAction.bind(this),
      mint: this._parseMintAction.bind(this),
      addAddresses: this._parseAddMemberAction.bind(this),
      removeAddresses: this._parseRemoveMemberAction.bind(this),
      setMetadata: this._parseUpdateDaoMetadata.bind(this),
      updateMultisigSettings: this._parseMultiSigSettingUpdateAction.bind(this),
      updateVotingSettings: this._parseTokenVotingSettingUpdateAction.bind(this),
      updateStages: this._parseStageUpdatedOnSppAction.bind(this),
    }

    for (const pattern in actionHandlers) {
      if (decoded.textSignature!.toLowerCase().includes(pattern.toLowerCase())) {
        const parsedAction = await actionHandlers[pattern](
          decoded,
          {
            from: document.daoAddress!,
            to: action.to,
            data: action.data,
            value: action.value,
          },
          document,
        )
        if (parsedAction) {
          return parsedAction
        }
      }
    }

    const contractNetspec = await this.parseContractNetspec(decoded.function, action.to, document.network!)

    if (contractNetspec?.inputs) {
      decoded.notice = contractNetspec.notice
      decoded.contract = contractNetspec.contractName
      decoded.proxyName = contractNetspec.proxyName
      decoded.implementationAddress = contractNetspec.implementationAddress
      decoded.parameters = decoded.parameters.map((param, index) => {
        const netspecInput = contractNetspec.inputs[index]
        if (!netspecInput) return param
        param.notice = netspecInput.notice
        param.name = netspecInput.name
        param.components = netspecInput.components
        param.type = netspecInput.type
        return param
      })
    }

    return {
      from: document?.daoAddress!,
      to: action.to,
      data: action.data,
      value: action.value,
      type: ProposalActionType.Unknown,
      inputData: decoded,
    }
  }

  async _parseMintAction(decodedData: IProposalActionInputData, action: IRawAction, document: Partial<Proposal>) {
    if (decodedData.textSignature !== KnownActionSignature.Mint) {
      return null
    }

    const receiver = decodedData.parameters[0].value
    const member = await ProxyMember.createMember(receiver)

    if (!member) {
      logger.error('Missing member', llo({ member, receiver, decodedData }))
    }

    const [currentBalance, tokenInfo, token] = await Promise.all([
      Web3Helper.getTokenBalanceAtBlock({
        tokenAddress: action.to,
        address: receiver,
        network: document.network!,
        blockNumber: document.blockNumber!,
      }),
      Covalent.getTokenInfo(action.to, document.network!, document.blockNumber),
      ProxyToken.saveAndGetToken(action.to, document.network!),
    ])

    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.Mint,
      receivers: {
        address: receiver,
        ens: member?.ens,
        currentBalance: currentBalance.toString(),
        newBalance: (BigInt(decodedData.parameters[1].value) + BigInt(currentBalance)).toString(),
      },
      totalSupply: tokenInfo?.totalSupply,
      holdersCount: tokenInfo?.totalHolders,
      token: {
        name: token!.name,
        symbol: token!.symbol,
        decimals: token!.decimals,
        logo: token!.logo,
        priceUsd: token!.priceUsd,
        address: token!.address,
      },
    }
  }

  async _parseAddMemberAction(decodedData: IProposalActionInputData, action: IRawAction, document: Partial<Proposal>) {
    if (decodedData.textSignature !== KnownActionSignature.MultisigAddMembers) {
      return null
    }

    const [membersInfo, currentMembersInfo] = await Promise.all([
      Promise.all(
        decodedData.parameters[0].value.map(async (address: HexAddress) => {
          const member = await ProxyMember.createMember(address)
          return { address: member.address, ens: member.ens, avatar: member.avatar }
        }),
      ),
      Models.DaoMemberMapping.findAllMembersOfPlugin({
        pluginAddress: document.pluginAddress!,
        network: document.network!,
      }),
    ])

    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.MultisigAddMembers,
      members: membersInfo,
      currentMembers: currentMembersInfo.length,
    }
  }

  async _parseRemoveMemberAction(
    decodedData: IProposalActionInputData,
    action: IRawAction,
    document: Partial<Proposal>,
  ) {
    if (decodedData.textSignature !== KnownActionSignature.MultisigRemoveMembers) {
      return null
    }

    const [membersInfo, currentMembersInfo] = await Promise.all([
      Promise.all(
        decodedData.parameters[0].value.map(async (address: HexAddress) => {
          const member = await ProxyMember.createMember(address)
          return { address: member.address, ens: member.ens, avatar: member.avatar }
        }),
      ),
      Models.DaoMemberMapping.findAllMembersOfPlugin({
        pluginAddress: document.pluginAddress!,
        network: document.network!,
      }),
    ])

    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.MultisigRemoveMembers,
      members: membersInfo,
      currentMembers: currentMembersInfo.length,
    }
  }

  async _parseUpdateDaoMetadata(
    decodedData: IProposalActionInputData,
    action: IRawAction,
    document: Partial<Proposal>,
  ) {
    if (decodedData.textSignature !== KnownActionSignature.MetadataUpdate) {
      return null
    }

    const [pluginMetadata, daoMetadata] = await Promise.all([
      Models.Dao.findByAddress(action.to, document.network!),
      Models.Plugin.findByAddress(action.to, document.network!),
    ])

    if (!!pluginMetadata && !!daoMetadata) {
      return null
    }

    const metadataOriginKey = document.daoAddress === action.to ? 'daoAddress' : 'pluginAddress'

    const existingMetadata = await Models.LogMetadata.getMetadataAtBlockNumber(
      action.to,
      document.blockNumber!,
      document.network!,
      metadataOriginKey,
    )

    const ipfsUrl = Web3Helper.extractMetadataUri(decodedData.parameters[0].value)
    if (!ipfsUrl) {
      return null
    }

    try {
      const proposedMetadata = await IPFSModule.fetchMetadata(ipfsUrl, { retries: 4 })
      if (!proposedMetadata) {
        return null
      }

      /**
       * If the metadata is for a plugin, we need to fetch the contract netspec
       * If we don't fetch for plugin, the netspec would be wrong.
       */
      if (metadataOriginKey === 'pluginAddress') {
        const contractNetspec = await this.parseContractNetspec(decodedData.function, action.to, document.network!)
        if (contractNetspec?.inputs) {
          decodedData.notice = contractNetspec.notice
          decodedData.contract = contractNetspec.contractName
          decodedData.parameters = decodedData.parameters.map((param, index) => {
            const netspecInput = contractNetspec.inputs[index]
            if (!netspecInput) return param
            param.notice = netspecInput.notice
            param.name = netspecInput.name
            param.components = netspecInput.components
            param.type = netspecInput.type
            return param
          })
        }
      }

      return {
        ...action,
        type: ProposalActionType.MetadataUpdate,
        inputData: decodedData,
        proposedMetadata,
        existingMetadata,
      }
    } catch (e) {
      return null
    }
  }

  async _parseMultiSigSettingUpdateAction(decodedData: IProposalActionInputData, action: IRawAction) {
    if (decodedData.textSignature !== KnownActionSignature.UpdateMultiSigSettings) {
      return null
    }
    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.UpdateMultiSigSettings,
      proposedSettings: {
        minApprovals: Number(decodedData.parameters[0].value[1]),
        onlyListed: decodedData.parameters[0].value[0],
      },
    }
  }

  async _parseTokenVotingSettingUpdateAction(decodedData: IProposalActionInputData, action: IRawAction) {
    if (decodedData.textSignature !== KnownActionSignature.UpdateVoteSettings) {
      return null
    }

    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.UpdateVoteSettings,
      proposedSettings: {
        votingMode: Number(decodedData.parameters[0].value[0]),
        supportThreshold: Number(decodedData.parameters[0].value[1]),
        minParticipation: Number(decodedData.parameters[0].value[2]),
        minDuration: Number(decodedData.parameters[0].value[3]),
        minProposerVotingPower: Number(decodedData.parameters[0].value[4]),
      },
    }
  }

  async _parseStageUpdatedOnSppAction(decodedData: IProposalActionInputData, action: IRawAction) {
    if (decodedData.textSignature !== KnownActionSignature.StagesUpdated) {
      return null
    }
    let stages: any
    try {
      stages = decodedData.parameters[0].value.map((stageValue: any, index: number) => {
        const plugins = stageValue[0].map((plugin: any) => {
          return {
            address: plugin[0],
            isManual: plugin[1],
            allowedBody: plugin[2],
            proposalType: plugin[3],
          }
        })

        return {
          plugins,
          stageIndex: index,
          maxAdvance: Number(stageValue[1]),
          minAdvance: Number(stageValue[2]),
          voteDuration: stageValue[3] ? Number(stageValue[3]) : Number(stageValue[3] || 0),
          approvalThreshold: Number(stageValue[4]),
          vetoThreshold: Number(stageValue[5]),
        }
      })
    } catch (e) {
      stages = []
    }

    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.StagesUpdated,
      proposedSettings: stages,
    }
  }

  async _parseTransferAction(decodedData: IProposalActionInputData, action: IRawAction, document: Partial<Proposal>) {
    const metadata: any = {}

    const setCommonMetadata = async (from: string, to: string, value: string) => {
      const token = await ProxyToken.saveAndGetToken(action.to, document.network!)

      if (token) {
        metadata.token = _.pick(token, ['address', 'name', 'symbol', 'decimals', 'logo', 'type', 'priceUsd'])
        metadata.from = from
        metadata.to = to
        metadata.value = value.toString()
      }
    }

    switch (decodedData.textSignature) {
      case KnownActionSignature.Transfer:
        await setCommonMetadata(document.daoAddress!, decodedData.parameters[0].value, decodedData.parameters[1].value)
        break

      case KnownActionSignature.TransferFrom:
      case KnownActionSignature.SafeTransferFrom:
        await setCommonMetadata(
          decodedData.parameters[0].value,
          decodedData.parameters[1].value,
          decodedData.parameters[2].value,
        )
        break
      default:
        return null
    }

    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.Transfer,
      sender: { address: metadata.from },
      receiver: { address: metadata.to },
      amount: metadata.value,
      token: metadata.token,
    }
  }

  async _decodeFallback(data: string): Promise<IProposalActionInputData | null> {
    try {
      const dataHex = hexlify(data)
      const functionSelector = dataHex.substring(0, 10)
      const response = await FourByte.getSignatures(functionSelector)

      if (!response || response.count === 0) {
        return null
      }

      const signatureInfo = response.results[response.results.length - 1]

      const iface = new Interface([`function ${signatureInfo.text_signature}`])
      const decoded = iface.decodeFunctionData(signatureInfo.text_signature, data as any)
      const decodedFormatted = JSON.parse(Utils.JSONStringifyCircular(decoded.toArray()))
      const paramters = signatureInfo.text_signature.split('(')[1].split(')')[0]
      const parametersWithValue = paramters.split(',').map((item, index) => ({
        type: item,
        value: decodedFormatted[index],
      })) as IProposalActionInputDataParameter[]

      return {
        function: signatureInfo.text_signature.split('(')[0],
        textSignature: signatureInfo.text_signature,
        parameters: parametersWithValue,
      }
    } catch (error) {
      logger.error('Error decoding action data', llo({ error, data }))
      return null
    }
  }

  async parseContractNetspec(functionName: string, address: string, network: NetworksEnum) {
    let implementationAddress = await ProxyContract.getImplementationAddress(address, network)

    if (!implementationAddress) {
      implementationAddress = address
    }

    const contractDetails = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(network)!.schedule(
        async () =>
          Etherscan.fetchContractSourceCode({
            contractAddress: implementationAddress,
            network,
          }),
        { retryRequest: true },
      ),
    )

    if (contractDetails && contractDetails.length > 0 && contractDetails[0].SourceCode !== '') {
      const results = ContractNetspecHelper.parseNetspec(
        contractDetails[0].SourceCode,
        contractDetails[0].ContractName,
        JSON.parse(contractDetails[0].ABI),
      )

      const abiWithNetspec = results.find((action: any) => action.name === functionName)
      return {
        contractName: contractDetails[0].ContractName,
        inputs: abiWithNetspec?.inputs,
        notice: abiWithNetspec?.notice,
      }
    }

    return null
  }

  async _decodeWithAbi(action: IRawAction): Promise<IProposalActionInputData | null> {
    const dataHex = hexlify(action.data)
    for (const { contractName, signatures, abi } of this.allSignatures) {
      const fragmentDetails = this._getFunctionFragment(dataHex, signatures)
      if (fragmentDetails) {
        try {
          const { fragment, inputs, notice } = fragmentDetails
          const iface = new Interface(abi)
          const decoded = iface.decodeFunctionData(fragment, dataHex)
          const decodedFormatted = decoded
            .toArray()
            .map((item: any) => (typeof item === 'bigint' ? item.toString() : item))
          const functionName = fragment.name

          const parameters = fragment.inputs.map((input: any) => input.type).join(',')
          const textSignature = `${functionName}(${parameters})`

          /**
           * Use decoded ABI arity as source of truth so netspec metadata cannot truncate args.
           * JSON stringify circular also converts bigint values to strings in nested tuples/arrays.
           */
          const paramsInfo = fragment.inputs.map((input: any, index: number) => {
            let components: any
            if (input.type.startsWith('tuple')) {
              components = input.components
                ? input.components.map((c: any) => ({ name: c.name, type: c.type }))
                : input.arrayChildren
            }
            return {
              name: input.name,
              type: input.type,
              components,
              value: Array.isArray(decodedFormatted[index])
                ? JSON.parse(Utils.JSONStringifyCircular(decodedFormatted[index]))
                : decodedFormatted[index],
            }
          }) as IProposalActionInputDataParameter[]

          inputs.forEach((input: any, index: number) => {
            paramsInfo[index].notice = input.notice
          })

          return {
            function: functionName,
            contract: contractName,
            parameters: paramsInfo,
            notice,
            textSignature,
          }
        } catch (error) {
          logger.error('Error decoding action data with abi', llo({ error, contractName, dataHex }))
        }
      }
    }
    return null
  }

  _getSignaturesFromAbi(abi: any[], name: string): Signature[] {
    return abi
      .filter(item => item.type === 'function' && item.stateMutability !== 'view' && item.stateMutability !== 'pure')
      .map(item => {
        try {
          const sig = FunctionFragment.getSelector(item.name, item.inputs)
          const fragment = FunctionFragment.from(item)
          return { method: item.name, sig, fragment, notice: item.notice, inputs: item.inputs }
        } catch (error) {
          logger.warn('Error creating FunctionFragment', llo({ error, item, name, abi }))
          return null
        }
      })
      .filter((item): item is Signature => item !== null)
  }

  _setupSignatures() {
    const multisigSignatures: Signature[] = this._getSignaturesFromAbi(Multisig.abi, 'Multisig')
    const erc20MintableSignatures: Signature[] = this._getSignaturesFromAbi(
      IERC20MintableUpgradeable.abi,
      'IERC20MintableUpgradeable',
    )
    const erc20Signatures: Signature[] = this._getSignaturesFromAbi(ERC20.abi, 'ERC20')
    const erc721Signatures: Signature[] = this._getSignaturesFromAbi(ERC721.abi, 'ERC721')
    const erc1155Signatures: Signature[] = this._getSignaturesFromAbi(ERC1155.abi, 'ERC1155')
    const daoFactorySignatures: Signature[] = this._getSignaturesFromAbi(DAOFactory.abi, 'DAOFactory')
    const governanceSignatures: Signature[] = this._getSignaturesFromAbi(GoveranceERC20.abi, 'GovernanceERC20')
    const daoSignatures: Signature[] = this._getSignaturesFromAbi(DAO.abi, 'DAO')
    const tokenVotingSignatures: Signature[] = this._getSignaturesFromAbi(TokenVoting.abi, 'TokenVoting')

    const majorityVotingBaseSignatures: Signature[] = this._getSignaturesFromAbi(
      MajorityVotingBase.abi,
      'MajorityVotingBase',
    )
    const pluginRepoSignatures: Signature[] = this._getSignaturesFromAbi(PluginRepo.abi, 'PluginRepo')
    const pluginRepoFactorySignatures: Signature[] = this._getSignaturesFromAbi(
      PluginRepoFactory.abi,
      'PluginRepoFactory',
    )
    const pluginRepoRegistrySignatures: Signature[] = this._getSignaturesFromAbi(
      PluginRepoRegistry.abi,
      'PluginRepoRegistry',
    )
    const daoRegistrySignatures: Signature[] = this._getSignaturesFromAbi(DAORegistry.abi, 'DAORegistry')
    const multisigSetupSignatures: Signature[] = this._getSignaturesFromAbi(MultiSigSetup.abi, 'MultiSigSetup')
    const addresslistVotingSignatures: Signature[] = this._getSignaturesFromAbi(
      AddresslistVoting.abi,
      'AddresslistVoting',
    )
    const sppPluginSignatures: Signature[] = this._getSignaturesFromAbi(
      StagedProposalProcessor.abi,
      'StagedProposalProcessor',
    )

    this.allSignatures = [
      { contractName: 'TokenVoting', signatures: tokenVotingSignatures, abi: TokenVoting.abi },
      { contractName: 'MajorityVotingBase', signatures: majorityVotingBaseSignatures, abi: MajorityVotingBase.abi },
      { contractName: 'DaoFactory', signatures: daoFactorySignatures, abi: DAOFactory.abi },
      { contractName: 'Multisig', signatures: multisigSignatures, abi: Multisig.abi },
      { contractName: 'ERC20', signatures: erc20Signatures, abi: ERC20.abi },
      { contractName: 'ERC721', signatures: erc721Signatures, abi: ERC721.abi },
      { contractName: 'ERC1155', signatures: erc1155Signatures, abi: ERC1155.abi },
      { contractName: 'GovernanceERC20', signatures: governanceSignatures, abi: GoveranceERC20.abi },
      { contractName: 'DAO', signatures: daoSignatures, abi: DAO.abi },
      { contractName: 'PluginRepo', signatures: pluginRepoSignatures, abi: PluginRepo.abi },
      { contractName: 'PluginRepoFactory', signatures: pluginRepoFactorySignatures, abi: PluginRepoFactory.abi },
      { contractName: 'PluginRepoRegistry', signatures: pluginRepoRegistrySignatures, abi: PluginRepoRegistry.abi },
      { contractName: 'DAORegistry', signatures: daoRegistrySignatures, abi: DAORegistry.abi },
      { contractName: 'MultiSigSetup', signatures: multisigSetupSignatures, abi: MultiSigSetup.abi },
      { contractName: 'AddresslistVoting', signatures: addresslistVotingSignatures, abi: AddresslistVoting.abi },
      { contractName: 'StagedProposalProcessor', signatures: sppPluginSignatures, abi: StagedProposalProcessor.abi },
      {
        contractName: 'IERC20MintableUpgradeable',
        signatures: erc20MintableSignatures,
        abi: IERC20MintableUpgradeable.abi,
      },
    ]
  }

  _getFunctionFragment(dataHex: string, availableSignatures: Signature[]): IExtendedFragment | undefined {
    const functionSelector = dataHex.substring(0, 10)
    for (const { sig, fragment, notice, inputs } of availableSignatures) {
      if (functionSelector === sig) {
        return {
          fragment,
          notice,
          inputs,
        }
      }
    }
    return undefined
  }
}

interface IExtendedFragment {
  fragment: FunctionFragment
  notice: string
  inputs: any[]
}

export default DecodeActions
