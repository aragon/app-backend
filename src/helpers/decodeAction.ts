import { ERC20 } from '@artifacts/ERC20'
import { ERC721 } from '@artifacts/ERC721'
import { ERC1155 } from '@artifacts/ERC1155'
import { IERC20MintableUpgradeable } from '@artifacts/IERC20MintableUpgradeable'
import { MajorityVotingBase } from '@artifacts/MajorityVotingBase'
import { Models } from '@dbModels'
import FourByte from '@helpers/4byte'
import CoinGeckoHelper from '@helpers/coinGecko'
import * as ContractNetspecHelper from '@helpers/contractNetspec'
import ProxyContract from '@helpers/proxyContract'
import Utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import type Proposal from '@models/schema/proposal'
import type Token from '@models/schema/token'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { ProxyToken } from '@modules/proxyToken'
import {
  AddresslistVoting,
  DAO,
  DAOFactory,
  DAORegistry,
  GoveranceERC20,
  MultiSigSetup,
  Multisig,
  PluginRepo,
  PluginRepoFactory,
  PluginRepoRegistry,
  StagedProposalProcessor,
  TokenVoting,
} from '@src/aragonContracts'
import { MemberGovernanceFactory } from '@src/governance'
import IPFSModule from '@src/modules/ipfs'
import { ProposalActionType } from '@src/types'
import {
  type HexAddress,
  IPluginInterfaceType,
  type IProposalAction,
  type IProposalActionInputData,
  type IProposalActionInputDataParameter,
  type IRawAction,
  KnownActionSignature,
  type NetworksEnum,
} from '@types'
import { ethers, FunctionFragment, hexlify, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:DecodeActions' })

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
    if (Web3Utils.isNativeTokenAction(action)) {
      const nativeToken = await Models.Token.findByTokenAddressAndNetwork(ethers.ZeroAddress, document.network!)
      const token = nativeToken.pickFields()

      // Create base member and get member info
      await MemberGovernanceFactory.createBaseMember(action.to)
      const member = await Models.Member.findByAddress(action.to)
      const dao = await Models.Dao.findByAddress(document.daoAddress, document.network)
      const toInfo = await ProxyWeb3Provider.searchDetailsOfContract({
        address: action.to,
        network: document.network!,
      })

      return {
        from: document.daoAddress,
        to: action.to,
        value: action.value,
        data: action.data,
        type: ProposalActionType.TransferNative,
        sender: { address: document.daoAddress, ens: dao?.ens },
        receiver: { address: member?.address || action.to, ens: member?.ens, avatar: member?.avatar },
        amount: action.value,
        token,
        inputData: {
          textSignature: 'Transfer (Native)',
          function: 'NativeTransfer',
          contract: toInfo?.name || 'Wallet Address',
          parameters: [],
        },
      }
    }

    return {
      from: document?.daoAddress!,
      to: action.to,
      data: action.data,
      value: action.value,
      type: ProposalActionType.Unknown,
      inputData: null,
    }
  }

  public async decodeData(action: IRawAction, document: Partial<Proposal>): Promise<IProposalAction | null> {
    const decoded =
      (await this._decodeWithAbi(action, document.network!)) || (await this._decodeFallback(action, document.network!))

    if (!decoded) {
      return {
        from: document?.daoAddress!,
        to: action.to,
        data: action.data,
        value: action.value,
        type: ProposalActionType.Unknown,
        inputData: null,
      }
    }

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
      updateVotingSettings: this._parseVotingSettingUpdateAction.bind(this),
      updateStages: this._parseStageUpdatedOnSppAction.bind(this),
      registerGauge: this._parseRegisterGauge.bind(this),
      createGauge: this._parseCreateGauge.bind(this),
      updateGaugeMetadata: this._parseUpdateGaugeMetadata.bind(this),
    }

    for (const pattern in actionHandlers) {
      if (decoded.textSignature?.toLowerCase().includes(pattern.toLowerCase())) {
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

    /**
     * If we don't have the contract name, we can fetch the contract netspec.
     * The case where contract will be when the 4byte doesn't fetch but the etherscan does.
     */
    if (!decoded.contract) {
      const contractNetspec = await this.parseContractNetspec(action.data.slice(0, 10), action, document.network!)

      if (contractNetspec?.inputs) {
        decoded.notice = contractNetspec.notice
        decoded.contract = contractNetspec.contractName
        decoded.proxyName = contractNetspec.proxyName
        decoded.implementationAddress = contractNetspec.implementationAddress
        decoded.parameters = decoded.parameters.map((param, index) => {
          param.notice = contractNetspec.inputs[index].notice
          param.name = contractNetspec.inputs[index].name
          param.components = contractNetspec.inputs[index].components
          param.type = contractNetspec.inputs[index].type
          return param
        })
      }
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
    const tokenAddress = action.to

    const tokenDetails = await ProxyToken.saveAndGetToken(tokenAddress, document.network!)

    // Create base member and get member info
    await MemberGovernanceFactory.createBaseMember(receiver)
    const member = await Models.Member.findByAddress(receiver)

    if (!member) {
      logger.error('Missing member', llo({ member, receiver, decodedData }))
    }

    if (!tokenDetails) {
      return {
        ...action,
        inputData: decodedData,
        type: ProposalActionType.Mint,
        receivers: {
          address: receiver,
          ens: member?.ens,
          currentBalance: '0',
          newBalance: decodedData.parameters[1].value.toString(),
        },
        totalSupply: '0',
        holdersCount: 0,
        token: {
          address: tokenAddress,
          name: 'Unknown',
          symbol: 'Unknown',
          decimals: 0,
          logo: null,
          priceUsd: null,
        },
      }
    }

    const [currentBalance, tokenInfo] = await Promise.all([
      Web3Helper.getTokenBalanceAtBlock({
        tokenAddress,
        address: receiver,
        network: document.network!,
        blockNumber: document.blockNumber!,
      }),
      CoinGeckoHelper.getToken(tokenAddress, document.network!),
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
      totalSupply: tokenInfo ? tokenInfo.totalSupply : '0',
      holdersCount: tokenInfo ? tokenInfo.holders : 0,
      token: {
        address: tokenDetails.address,
        name: tokenDetails.name,
        symbol: tokenDetails.symbol,
        decimals: tokenDetails.decimals,
        logo: tokenDetails.logo,
        priceUsd: tokenDetails.priceUsd,
      },
    }
  }

  async _parseAddMemberAction(decodedData: IProposalActionInputData, action: IRawAction, document: Partial<Proposal>) {
    if (decodedData.textSignature !== KnownActionSignature.MultisigAddMembers) {
      return null
    }

    const membersInfo = await Promise.all(
      decodedData.parameters[0].value.map(async (address: HexAddress) => {
        await MemberGovernanceFactory.createBaseMember(address)
        const member = await Models.Member.findByAddress(address)
        return { address: member?.address || address, ens: member?.ens, avatar: member?.avatar }
      }),
    )

    const currentMembersInfo = await Models.PluginMember.findAllMembersOfPlugin({
      pluginAddress: document.pluginAddress!,
      network: document.network!,
    })

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

    const membersInfo = await Promise.all(
      decodedData.parameters[0].value.map(async (address: HexAddress) => {
        await MemberGovernanceFactory.createBaseMember(address)
        const member = await Models.Member.findByAddress(address)
        return { address: member?.address || address, ens: member?.ens, avatar: member?.avatar }
      }),
    )

    const currentMembersInfo = await Models.PluginMember.findAllMembersOfPlugin({
      pluginAddress: document.pluginAddress!,
      network: document.network!,
    })

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

    const ipfsUrl = Web3Utils.extractMetadataUri(decodedData.parameters[0].value)
    if (!ipfsUrl) {
      return null
    }

    try {
      const rawMetadata = await IPFSModule.fetchMetadata(ipfsUrl, { retries: 4 })
      if (!rawMetadata) {
        return null
      }
      const proposedMetadata = Web3Utils.parseDaoMetadata(rawMetadata)

      const _existingMetadata: any = existingMetadata
        ? {
            name: existingMetadata.name,
            description: existingMetadata.description,
            avatar: existingMetadata.avatar,
            links: existingMetadata.links || [],
            logo: existingMetadata.logo,
            processKey: existingMetadata.processKey,
            stageNames: existingMetadata.stageNames || [],
          }
        : {}

      /**
       * If the metadata is for a plugin, we need to fetch the contract netspec
       * If we don't fetch for plugin, the netspec would be wrong.
       */
      if (metadataOriginKey === 'pluginAddress') {
        const contractNetspec = await this.parseContractNetspec(decodedData.function, action, document.network!)
        if (contractNetspec?.inputs) {
          decodedData.notice = contractNetspec.notice
          decodedData.contract = contractNetspec.contractName
          decodedData.proxyName = contractNetspec.proxyName
          decodedData.implementationAddress = contractNetspec.implementationAddress
          decodedData.parameters = decodedData.parameters.map((param, index) => {
            param.notice = contractNetspec.inputs[index].notice
            param.name = contractNetspec.inputs[index].name
            param.value = contractNetspec.inputs[index].value
            return param
          })
        }

        return {
          ...action,
          type: ProposalActionType.MetadataPluginUpdate,
          inputData: decodedData,
          proposedMetadata,
          existingMetadata: _existingMetadata,
        }
      }

      return {
        ...action,
        type: ProposalActionType.MetadataUpdate,
        inputData: decodedData,
        proposedMetadata,
        existingMetadata: _existingMetadata,
      }
    } catch (_e) {
      return null
    }
  }

  async _parseMultiSigSettingUpdateAction(
    decodedData: IProposalActionInputData,
    action: IRawAction,
    document: Partial<Proposal>,
  ) {
    if (decodedData.textSignature !== KnownActionSignature.UpdateMultiSigSettings) {
      return null
    }

    const pluginDetails = await Models.Plugin.findByAddress(action.to, document.network)
    if (!pluginDetails) {
      return
    }

    const settings = await Models.Setting.findLastSettingByBlockNumber(pluginDetails.address, document.blockNumber!)

    const existingSettings = settings
      ? {
          minApprovals: settings.minApprovals,
          onlyListed: settings.onlyListed,
        }
      : {}

    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.UpdateMultiSigSettings,
      existingSettings,
      proposedSettings: {
        minApprovals: Number(decodedData.parameters[0].value[1]),
        onlyListed: decodedData.parameters[0].value[0],
      },
    }
  }

  async _parseVotingSettingUpdateAction(
    decodedData: IProposalActionInputData,
    action: IRawAction,
    document: Partial<Proposal>,
  ) {
    if (decodedData.textSignature !== KnownActionSignature.UpdateVoteSettings) {
      return null
    }

    const pluginDetails = await Models.Plugin.findByAddress(action.to, document.network!)

    if (!pluginDetails?.tokenAddress) {
      return null
    }

    const votingToken = await ProxyToken.saveAndGetToken(pluginDetails.tokenAddress, pluginDetails.network)

    if (
      pluginDetails.interfaceType !== IPluginInterfaceType.lockToVote &&
      pluginDetails.interfaceType !== IPluginInterfaceType.tokenVoting
    ) {
      logger.warn(
        `Unsupported plugin type for voting settings update: ${pluginDetails.interfaceType}`,
        llo({ pluginDetails, decodedData }),
      )
      return null
    }

    return pluginDetails.interfaceType === IPluginInterfaceType.tokenVoting
      ? this._parseTokenVotingSettingUpdateAction(decodedData, action, document, pluginDetails, votingToken)
      : this._parseLockToVoteVotingSettingUpdateAction(decodedData, action, document, pluginDetails, votingToken)
  }

  async _parseTokenVotingSettingUpdateAction(
    decodedData: IProposalActionInputData,
    action: IRawAction,
    document: Partial<Proposal>,
    pluginDetails: Plugin,
    votingToken: Token | null,
  ) {
    const activeSettings = await Models.Setting.findLastSettingByBlockNumber(
      pluginDetails.address,
      document.blockNumber!,
    )

    const existingSettings = activeSettings
      ? {
          votingMode: activeSettings?.votingMode,
          supportThreshold: activeSettings?.supportThreshold,
          minParticipation: activeSettings?.minParticipation,
          minDuration: activeSettings?.minDuration,
          minProposerVotingPower: activeSettings?.minProposerVotingPower,
          token: votingToken?.pickFields(),
        }
      : {}

    return {
      type: ProposalActionType.UpdateTokenVoteSettings,
      network: pluginDetails.network,
      ...action,
      inputData: decodedData,
      existingSettings,
      proposedSettings: {
        votingMode: Number(decodedData.parameters[0].value[0]),
        supportThreshold: Number(decodedData.parameters[0].value[1]),
        minParticipation: Number(decodedData.parameters[0].value[2]),
        minDuration: Number(decodedData.parameters[0].value[3]),
        minProposerVotingPower: Number(decodedData.parameters[0].value[4]),
      },
    }
  }

  async _parseLockToVoteVotingSettingUpdateAction(
    decodedData: IProposalActionInputData,
    action: IRawAction,
    document: Partial<Proposal>,
    pluginDetails: Plugin,
    votingToken: Token | null,
  ) {
    const activeSettings = await Models.Setting.findLastSettingByBlockNumber(
      pluginDetails.address,
      document.blockNumber!,
    )

    const existingSettings = activeSettings
      ? {
          votingMode: activeSettings?.votingMode,
          supportThreshold: activeSettings?.supportThreshold,
          minParticipation: activeSettings?.minParticipation,
          minApprovalRatio: activeSettings?.minApprovalRatio,
          minDuration: activeSettings?.minDuration, // it's actually proposalDuration in the case of lock to vote
          minProposerVotingPower: activeSettings?.minProposerVotingPower,
          token: votingToken?.pickFields(),
        }
      : {}

    return {
      type: ProposalActionType.UpdateLockToVoteVoteSettings,
      network: pluginDetails.network,
      ...action,
      inputData: decodedData,
      existingSettings,
      proposedSettings: {
        votingMode: Number(decodedData.parameters[0].value[0]),
        supportThreshold: Number(decodedData.parameters[0].value[1]),
        minParticipation: Number(decodedData.parameters[0].value[2]),
        minApprovalRatio: Number(decodedData.parameters[0].value[3]), // this is additional param in lock to vote!
        minDuration: Number(decodedData.parameters[0].value[4]),
        minProposerVotingPower: Number(decodedData.parameters[0].value[5]),
      },
    }
  }

  async _parseStageUpdatedOnSppAction(
    decodedData: IProposalActionInputData,
    action: IRawAction,
    document: Partial<Proposal>,
  ) {
    if (decodedData.textSignature !== KnownActionSignature.StagesUpdated) {
      return null
    }
    let stages: any
    let existingStages: any = []
    try {
      stages = decodedData.parameters[0].value.map((stageValue: any, index: number) => {
        const plugins = stageValue[0].map((plugin: any) => {
          return {
            addr: plugin[0],
            isManual: plugin[1],
            tryAdvance: plugin[2],
            resultType: plugin[3],
          }
        })

        return {
          bodies: plugins,
          stageIndex: index,
          maxAdvance: Number(stageValue[1]),
          minAdvance: Number(stageValue[2]),
          voteDuration: stageValue[3] ? Number(stageValue[3]) : Number(stageValue[3] || 0),
          approvalThreshold: Number(stageValue[4]),
          vetoThreshold: Number(stageValue[5]),
          cancelable: stageValue[6] ? Boolean(stageValue[6]) : false,
          editable: stageValue[7] ? Boolean(stageValue[7]) : false,
        }
      })

      existingStages = await Models.Setting.findActive({
        daoAddress: document.daoAddress!,
        network: document.network!,
        pluginAddress: document.pluginAddress!,
      })

      existingStages = (existingStages || []).map((stage: any) => {
        return {
          stageIndex: stage.stageIndex,
          maxAdvance: stage.maxAdvance,
          minAdvance: stage.minAdvance,
          voteDuration: stage.voteDuration,
          approvalThreshold: stage.approvalThreshold,
          vetoThreshold: stage.vetoThreshold,
          cancelable: Boolean(stage.cancelable),
          editable: Boolean(stage.editable),
          plugins: stage.plugins.map((plugin: any) => {
            return {
              addr: plugin.address,
              isManual: plugin.isManual,
              tryAdvance: plugin.allowedBody,
              resultType: plugin.proposalType,
            }
          }),
        }
      })
    } catch (_e) {
      stages = []
    }

    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.StagesUpdated,
      proposedSettings: stages,
      existingSettings: existingStages || [],
    }
  }

  async _parseTransferAction(decodedData: IProposalActionInputData, action: IRawAction, document: Partial<Proposal>) {
    const metadata: any = {}

    const setCommonMetadata = async (from: string, to: string, value: string) => {
      const token = await ProxyToken.saveAndGetToken(action.to, document.network!)

      if (token) {
        metadata.token = token.pickFields()
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

  async _parseRegisterGauge(decodedData: IProposalActionInputData, action: IRawAction) {
    if (decodedData.textSignature !== KnownActionSignature.RegisterGauge) {
      return null
    }

    try {
      const gaugeMetadata = await this._fetchMetadata(decodedData.parameters[3].value)

      if (!gaugeMetadata) {
        return null
      }

      return {
        ...action,
        type: ProposalActionType.RegisterGauge,
        inputData: decodedData,
        gaugeMetadata,
      }
    } catch (_e) {
      return null
    }
  }

  async _parseCreateGauge(decodedData: IProposalActionInputData, action: IRawAction) {
    if (decodedData.textSignature !== KnownActionSignature.CreateGauge) {
      return null
    }

    try {
      const gaugeMetadata = await this._fetchMetadata(decodedData.parameters[1].value)

      if (!gaugeMetadata) {
        return null
      }

      return {
        ...action,
        type: ProposalActionType.CreateGauge,
        inputData: decodedData,
        gaugeMetadata,
      }
    } catch (_e) {
      return null
    }
  }

  async _parseUpdateGaugeMetadata(decodedData: IProposalActionInputData, action: IRawAction) {
    if (decodedData.textSignature !== KnownActionSignature.UpdateGaugeMetadata) {
      return null
    }

    try {
      const gaugeMetadata = await this._fetchMetadata(decodedData.parameters[1].value)

      if (!gaugeMetadata) {
        return null
      }

      return {
        ...action,
        type: ProposalActionType.UpdateGaugeMetadata,
        inputData: decodedData,
        gaugeMetadata,
      }
    } catch (_e) {
      return null
    }
  }

  async _fetchMetadata(metadataHex: string) {
    const ipfsUrl = Web3Utils.extractMetadataUri(metadataHex)

    if (!ipfsUrl) {
      return null
    }

    const metadata = await IPFSModule.fetchMetadata(ipfsUrl, { retries: 4 })
    if (!metadata) return null

    return Web3Utils.parseDaoMetadata(metadata)
  }

  async _decodeFallback(action: IRawAction, network: NetworksEnum): Promise<IProposalActionInputData | null> {
    try {
      const dataHex = hexlify(action.data)
      const functionSelector = dataHex.substring(0, 10)
      const response = await FourByte.getSignatures(functionSelector)

      if (!response || response.count === 0) {
        const functionDetails = await this.parseContractNetspec(functionSelector, action, network)
        if (functionDetails) {
          const parameterTypes = functionDetails.inputs
            .map((input: IProposalActionInputDataParameter) => input.type)
            .join(',')
          const textSignature = `${functionDetails.functionName}(${parameterTypes})`

          return {
            function: functionDetails.functionName,
            contract: functionDetails.contractName,
            parameters: functionDetails.inputs,
            notice: functionDetails.notice,
            textSignature,
            proxyName: functionDetails.proxyName,
            implementationAddress: functionDetails.implementationAddress,
          } as any
        }
        return null
      }

      const signatureInfo = response.results[response.results.length - 1]

      const iface = new Interface([`function ${signatureInfo.text_signature}`])
      const decoded = iface.decodeFunctionData(signatureInfo.text_signature, action.data as any)
      const decodedFormatted = JSON.parse(Utils.JSONStringifyCircular(decoded.toArray()))
      const paramters = signatureInfo.text_signature.split('(')[1].split(')')[0]
      const parametersWithValue =
        paramters !== ''
          ? (paramters.split(',').map((item, index) => ({
              type: item,
              value: decodedFormatted[index],
            })) as IProposalActionInputDataParameter[])
          : []

      return {
        function: signatureInfo.text_signature.split('(')[0],
        textSignature: signatureInfo.text_signature,
        parameters: parametersWithValue,
      }
    } catch (error) {
      logger.error('Error decoding action data', llo({ error, action }))
      return null
    }
  }

  async parseContractNetspec(functionName: string, rawAction: IRawAction, network: NetworksEnum) {
    let implementationAddress = await ProxyContract.getImplementationAddress(rawAction.to, network)

    if (!implementationAddress) {
      implementationAddress = rawAction.to
    }

    const contractDetails = await ProxyWeb3Provider.fetchContractSourceCode({
      address: implementationAddress,
      network,
    })

    let proxyDetails: any = null
    if (implementationAddress !== rawAction.to) {
      proxyDetails = await ProxyWeb3Provider.fetchContractSourceCode({
        address: rawAction.to,
        network,
      })
    }

    if (contractDetails && contractDetails.length > 0 && contractDetails[0].SourceCode !== '') {
      const contractAbi = JSON.parse(contractDetails[0].ABI)
      const results = ContractNetspecHelper.parseNetspec(
        contractDetails[0].SourceCode,
        contractDetails[0].ContractName,
        contractAbi,
        contractDetails[0].CompilerVersion,
      )

      const signatures = this._getSignaturesFromAbi(results, contractDetails[0].ContractName)
      const abiWithNetSpec = signatures.find(
        (action: any) => action.sig === ethers.id(functionName).slice(0, 10) || action.sig === functionName,
      )

      if (!abiWithNetSpec) {
        return null
      }

      const iface = new ethers.Interface(contractAbi)
      const decodedData: any =
        abiWithNetSpec?.inputs.length && rawAction.data && rawAction.data !== '0x'
          ? iface.decodeFunctionData(abiWithNetSpec.fragment, rawAction.data).toArray()
          : []

      const decodedFormatted = decodedData.map((item: any) => (typeof item === 'bigint' ? item.toString() : item))

      return {
        functionName: abiWithNetSpec?.method,
        contractName: contractDetails[0].ContractName,
        proxyName: proxyDetails?.length ? proxyDetails[0].ContractName : null,
        implementationAddress: proxyDetails?.length ? implementationAddress : null,
        inputs: abiWithNetSpec?.inputs.map((input: any, index: number) => {
          return {
            name: input.name,
            type: input.type,
            components: input.components,
            value: Array.isArray(decodedFormatted[index])
              ? JSON.parse(Utils.JSONStringifyCircular(decodedFormatted[index]))
              : decodedFormatted[index],
            notice: input.notice,
          }
        }),
        notice: abiWithNetSpec?.notice,
      }
    }

    return null
  }

  async _decodeWithAbi(action: IRawAction, network: NetworksEnum): Promise<IProposalActionInputData | null> {
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

          const functionDetails = await this.parseContractNetspec(action.data.slice(0, 10), action, network)

          /**
           * As the decoded data can be a nested array inside array when there is tuple as paramter
           * JSON strigify circular will convert the big int to string as well.
           */
          const paramsInfo = (functionDetails?.inputs || inputs).map((input: any, index: number) => {
            return {
              name: input.name,
              type: input.type,
              components: input.components,
              value: Array.isArray(decodedFormatted[index])
                ? JSON.parse(Utils.JSONStringifyCircular(decodedFormatted[index]))
                : decodedFormatted[index],
              notice: input.notice,
            }
          }) as IProposalActionInputDataParameter[]

          return {
            function: functionName,
            contract: functionDetails?.contractName || contractName,
            proxyName: functionDetails?.proxyName,
            implementationAddress: functionDetails?.implementationAddress,
            parameters: paramsInfo,
            notice: functionDetails?.notice || notice,
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
