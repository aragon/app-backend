import logger from '@logger'
import { ethers, FunctionFragment, hexlify, Interface } from 'ethers'
import { Multisig } from '@artifacts/Multisig'
import { MajorityVotingBase } from '@artifacts/MajorityVotingBase'
import { IERC20MintableUpgradeable } from '@artifacts/IERC20MintableUpgradeable'
import { ERC20 } from '@artifacts/ERC20'
import { ERC721 } from '@artifacts/ERC721'
import { ERC1155 } from '@artifacts/ERC1155'
import { DAOFactory } from '@artifacts/daoFactory'
import { DAO } from '@artifacts/dao'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import FourByte from '@helpers/4byte'
import Web3Helper from '@helpers/web3'
import type Proposal from '@models/schema/proposal'
import {
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
import { UtilsIndexer } from '@indexer/utils/indexer'
import Covalent from '@helpers/covalent'
import IPFSModule from '@src/modules/ipfs'

const llo = logger.logMeta.bind(null, { service: 'DecodeActions' })

interface Signature {
  method: string
  sig: string
  fragment: FunctionFragment
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
      return {
        from: document.daoAddress,
        to: action.to,
        value: action.value,
        data: action.data,
        type: ProposalActionType.Transfer,
        sender: { address: document.daoAddress }, // TODO: Add a way to find and add ens
        receiver: { address: action.to },
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
    const decoded = (await this._decodeWithAbi(action, document)) || (await this._decodeFallback(action.data))

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
    }

    for (const pattern in actionHandlers) {
      if (decoded.textSignature!.toLowerCase().includes(pattern.toLowerCase())) {
        const parsedAction = await actionHandlers[pattern](decoded, action, document)
        if (parsedAction) {
          return parsedAction
        }
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
    const receiver = decodedData.parameters[0].value

    const [currentBalance, tokenInfo, token] = await Promise.all([
      Web3Helper.getERC20Balance(receiver, action.to, document.network!),
      Covalent.getTokenInfo(action.to, document.network!),
      UtilsIndexer.saveAndGetToken(action.to, document.network!),
    ])

    return {
      inputData: decodedData,
      type: ProposalActionType.Mint,
      receivers: {
        address: receiver,
        currentBalance: currentBalance.toString(),
        newBalance: decodedData.parameters[1].value.toString(),
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
    const currentMembers = await Models.LogMember.getMultiSigMemberAtBlockNumber(
      document.daoAddress!,
      document.blockNumber!,
      document.network!,
    )

    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.MultisigAddMembers,
      members: decodedData.parameters.map((address: any) => ({ address })),
      currentMembers: currentMembers.members,
    }
  }

  async _parseRemoveMemberAction(
    decodedData: IProposalActionInputData,
    action: IRawAction,
    document: Partial<Proposal>,
  ) {
    const currentMembers = await Models.LogMember.getMultiSigMemberAtBlockNumber(
      document.daoAddress!,
      document.blockNumber!,
      document.network!,
    )

    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.MultisigRemoveMembers,
      members: decodedData.parameters.map((address: any) => ({ address })),
      currentMembers: currentMembers.members,
    }
  }

  async _parseUpdateDaoMetadata(
    decodedData: IProposalActionInputData,
    action: IRawAction,
    document: Partial<Proposal>,
  ) {
    const existingMetadata = await Models.LogDaoMetadata.getMetadataAtBlockNumber(
      document.daoAddress,
      document.blockNumber,
      document.network,
    )

    const ipfsUrl = Web3Helper.extractMetadataUri(decodedData.parameters[0].value)
    if (!ipfsUrl) {
      return null
    }

    try {
      const proposedMetadata = await IPFSModule.fetchMetadata(ipfsUrl)
      if (!proposedMetadata) {
        return null
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

  async _parseMultiSigSettingUpdateAction(
    decodedData: IProposalActionInputData,
    action: IRawAction,
    document: Partial<Proposal>,
  ) {
    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.UpdateMultiSigSettings,
      proposedSettings: [
        {
          term: 'minApprovals',
          definition: decodedData.parameters[0].value[1],
        },
      ],
      existingSettings: [
        {
          term: 'minApprovals',
          definition: document.settings!.minApprovals,
        },
      ],
    }
  }

  async _parseTokenVotingSettingUpdateAction(
    decodedData: IProposalActionInputData,
    action: IRawAction,
    document: Partial<Proposal>,
  ) {
    const tupleType = ['uint8', 'uint32', 'uint32', 'uint64', 'uint256']
    const parameters = decodedData.parameters[0].value.map((value: any, index: any) => ({
      type: tupleType[index],
      value: typeof value === 'object' ? value.toString() : value,
    }))

    return {
      ...action,
      inputData: decodedData,
      type: ProposalActionType.UpdateVoteSettings,
      proposedSettings: [
        { term: 'votingMode', definition: decodedData.parameters[0].value[0] },
        { term: 'supportThreshold', definition: decodedData.parameters[0].value[1].toString() },
        { term: 'minParticipation', definition: decodedData.parameters[0].value[2].toString() },
        { term: 'minDuration', definition: decodedData.parameters[0].value[3] },
        { term: 'minProposerVotingPower', definition: decodedData.parameters[0].value[4].toString() },
      ],
      existingSettings: [
        { term: 'votingMode', definition: document.settings!.votingMode },
        { term: 'supportThreshold', definition: document.settings!.supportThreshold },
        { term: 'minParticipation', definition: document.settings!.minParticipation },
        { term: 'minDuration', definition: document.settings!.minDuration },
        { term: 'minProposerVotingPower', definition: document.settings!.minProposerVotingPower },
      ],
    }
  }

  async _parseTransferAction(decodedData: IProposalActionInputData, action: IRawAction, document: Partial<Proposal>) {
    const metadata: any = {}

    const setCommonMetadata = async (from: string, to: string, value: string) => {
      const token = await UtilsIndexer.saveAndGetToken(action.to, document.network!)

      if (token) {
        metadata.token = _.pick(token, ['address', 'name', 'symbol', 'decimals', 'logo', 'type', 'priceUsd'])
        metadata.from = from
        metadata.to = to
        metadata.value = value.toString()
      }
    }

    switch (decodedData.textSignature) {
      case KnownActionSignature.Transfer:
        await setCommonMetadata(document.daoAddress!, decodedData.parameters[0].value, decodedData.parameters[0].value)
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
      inputData: decodedData,
      type: ProposalActionType.Transfer,
      sender: { address: metadata.from },
      receiver: { address: metadata.to },
      amount: metadata.value,
      token: {
        name: metadata.token.name,
        symbol: metadata.token.symbol,
        decimals: metadata.token.decimals,
        logo: metadata.token.logo,
        priceUsd: metadata.token.priceUsd,
        address: metadata.token.address,
      },
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
      const decodedFormatted = decoded.toArray().map((item: any) => (item instanceof BigInt ? item.toString() : item))
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

    const contractDetails = await Etherscan.fetchContractSourceCode(implementationAddress, network)
    if (contractDetails) {
      const results = ContractNetspecHelper.parseNetspec(
        contractDetails.SourceCode,
        contractDetails.ContractName,
        JSON.parse(contractDetails.ABI),
      )

      const abiWithNetspec = results.find((action: any) => action.name === functionName)
      return {
        contractName: contractDetails.ContractName,
        inputs: abiWithNetspec?.inputs,
        notice: abiWithNetspec?.notice,
      }
    }

    return null
  }

  async _decodeWithAbi(action: IRawAction, document: Partial<Proposal>): Promise<IProposalActionInputData | null> {
    const dataHex = hexlify(action.data)
    for (const { contractName, signatures, abi } of this.allSignatures) {
      const fragment = this._getFunctionFragment(dataHex, signatures)
      if (fragment) {
        try {
          const iface = new Interface(abi)
          const decoded = iface.decodeFunctionData(fragment, dataHex)
          const decodedFormatted = decoded
            .toArray()
            .map((item: any) => (item instanceof BigInt ? item.toString() : item))
          const functionName = fragment.name

          const parameters = fragment.inputs.map((input: any) => input.type).join(',')
          const textSignature = `${functionName}(${parameters})`
          const paramsInfo = fragment.inputs.map((input: any, index: number) => ({
            name: input.name,
            type: input.type,
            value: decodedFormatted[index],
          })) as IProposalActionInputDataParameter[]

          const contractNetspec = await this.parseContractNetspec(functionName, action.to, document.network!)
          if (contractNetspec) {
            contractNetspec.inputs.forEach((input: any, index: number) => {
              paramsInfo[index].notice = input.notice
            })

            return {
              function: functionName,
              contract: contractNetspec.contractName,
              parameters: paramsInfo,
              notice: contractNetspec.notice,
              textSignature,
            }
          }

          return {
            textSignature,
            function: functionName,
            contract: contractName,
            parameters: paramsInfo,
          }
        } catch (error) {
          logger.error('Error decoding action data with abi', llo({ error, contractName, fragment, dataHex }))
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
          return { method: item.name, sig, fragment }
        } catch (error) {
          logger.warn('Error creating FunctionFragment', llo({ error, item, name, abi }))
          return null
        }
      })
      .filter((item): item is Signature => item !== null)
  }

  _setupSignatures() {
    const multisigSignatures: Signature[] = this._getSignaturesFromAbi(Multisig.abi, 'Multisig')
    const tokenVotingSignatures: Signature[] = this._getSignaturesFromAbi(MajorityVotingBase.abi, 'MajorityVotingBase')
    const erc20MintableSignatures: Signature[] = this._getSignaturesFromAbi(
      IERC20MintableUpgradeable.abi,
      'IERC20MintableUpgradeable',
    )
    const erc20Signatures: Signature[] = this._getSignaturesFromAbi(ERC20.abi, 'ERC20')
    const erc721Signatures: Signature[] = this._getSignaturesFromAbi(ERC721.abi, 'ERC721')
    const erc1155Signatures: Signature[] = this._getSignaturesFromAbi(ERC1155.abi, 'ERC1155')
    const daoFactorySignatures: Signature[] = this._getSignaturesFromAbi(DAOFactory.abi, 'DAOFactory')
    const governanceSignatures: Signature[] = this._getSignaturesFromAbi(GovernanceERC20.abi, 'GovernanceERC20')
    const daoSignatures: Signature[] = this._getSignaturesFromAbi(DAO.abi, 'DAO')

    this.allSignatures = [
      { contractName: 'DaoFactory', signatures: daoFactorySignatures, abi: DAOFactory.abi },
      { contractName: 'Multisig', signatures: multisigSignatures, abi: Multisig.abi },
      { contractName: 'MajorityVotingBase', signatures: tokenVotingSignatures, abi: MajorityVotingBase.abi },
      {
        contractName: 'IERC20MintableUpgradeable',
        signatures: erc20MintableSignatures,
        abi: IERC20MintableUpgradeable.abi,
      },
      { contractName: 'ERC20', signatures: erc20Signatures, abi: ERC20.abi },
      { contractName: 'ERC721', signatures: erc721Signatures, abi: ERC721.abi },
      { contractName: 'ERC1155', signatures: erc1155Signatures, abi: ERC1155.abi },
      { contractName: 'GovernanceERC20', signatures: governanceSignatures, abi: GovernanceERC20.abi },
      { contractName: 'DAO', signatures: daoSignatures, abi: DAO.abi },
    ]
  }

  _getFunctionFragment(dataHex: string, availableSignatures: Signature[]): FunctionFragment | undefined {
    const functionSelector = dataHex.substring(0, 10)
    for (const { sig, fragment } of availableSignatures) {
      if (functionSelector === sig) {
        return fragment
      }
    }
    return undefined
  }
}

export default DecodeActions
