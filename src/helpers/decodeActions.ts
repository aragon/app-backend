import logger from '@logger'
import { ethers, FunctionFragment, hexlify, Interface } from 'ethers'
import { Multisig } from '@artifacts/Multisig'
import { MajorityVotingBase } from '@artifacts/MajorityVotingBase'
import { IERC20MintableUpgradeable } from '@artifacts/IERC20MintableUpgradeable'
import { ERC20 } from '@artifacts/ERC20'
import { ERC721 } from '@artifacts/ERC721'
import { ERC1155 } from '@artifacts/ERC1155'
import { DAOFactory } from '@artifacts/daoFactory'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import FourByte from '@helpers/4byte'
import Web3Helper from '@helpers/web3'
import type Proposal from '@models/schema/proposal'
import { type IDecodedData, type IRawAction, KnownActionSignature } from '@types'
import { ProposalActionType } from '@src/types'
import { Models } from '@dbModels'
import IPFSModule from '@modules/ipfs'
import _ from 'lodash'
import { TokenProxy } from '@modules/tokenProxy'

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

  public async decodeTransfer(action: IRawAction, document: Partial<Proposal>): Promise<IDecodedData | null> {
    if (Web3Helper.isNativeTokenAction(action)) {
      const nativeToken = await Models.Token.findByTokenAddressAndNetwork(ethers.ZeroAddress, document.network!)
      const token = _.pick(nativeToken, ['address', 'name', 'symbol', 'decimals', 'logo', 'type'])
      // native token transfer
      return {
        functionName: 'NativeTransfer',
        textSignature: 'nativeTransfer(address,address,uint256)',
        decoded: [document.daoAddress, action.to, action.value],
        type: ProposalActionType.Transfer,
        metadata: {
          from: document.daoAddress,
          to: action.to,
          value: action.value,
          token,
        },
      }
    }

    return null
  }

  public async decodeData(action: IRawAction, document: Partial<Proposal>): Promise<IDecodedData | null> {
    const decoded = (await this._decodeWithAbi(action.data)) || (await this._decodeFallback(action.data))

    if (!decoded) return null

    const actionHandlers: Record<
      string,
      (decoded: IDecodedData, action: IRawAction, document: Partial<Proposal>) => Promise<any>
    > = {
      transfer: this._getMetadataIfTransfer.bind(this),
      mint: this._getMedataIfMint.bind(this),
      addAddresses: this._getMetadataOfAddMultiSigMember.bind(this),
      removeAddresses: this._getMetadataOfRemoveMultiSigMember.bind(this),
      setMetadata: this._getMetadataForMetadataUpdate.bind(this),
      updateMultisigSettings: this._getMetdataOfMultiSigSetting.bind(this),
      updateVotingSettings: this._getMetdataOfVoteSetting.bind(this),
      // TODO: We can add more handlers later
    }

    for (const pattern in actionHandlers) {
      if (decoded.textSignature.toLowerCase().includes(pattern.toLowerCase())) {
        const actionMetaData = await actionHandlers[pattern](decoded, action, document)
        if (actionMetaData) {
          decoded.type = actionMetaData.type
          decoded.metadata = actionMetaData.metadata
        }
        break
      }
    }

    decoded.type = decoded.type ?? ProposalActionType.Unknown
    decoded.metadata = decoded.metadata ?? null

    return decoded
  }

  async _decodeWithAbi(data: string): Promise<IDecodedData | null> {
    const dataHex = hexlify(data)
    for (const { contractName, signatures, abi } of this.allSignatures) {
      const fragment = this._getFunctionFragment(dataHex, signatures)
      if (fragment) {
        try {
          const iface = new Interface(abi)
          const decoded = iface.decodeFunctionData(fragment, dataHex)

          const functionName = fragment.name
          const parameters = fragment.inputs.map((input: any) => input.type).join(',')
          const textSignature = `${functionName}(${parameters})`

          return {
            functionName,
            textSignature,
            decoded: decoded?.toArray(),
            contractName,
          }
        } catch (error) {
          logger.error('Error decoding action data with abi', llo({ error, contractName, fragment, dataHex }))
        }
      }
    }
    return null
  }

  async _decodeFallback(data: string): Promise<IDecodedData | null> {
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

      return {
        functionName: signatureInfo.text_signature.split('(')[0],
        textSignature: signatureInfo.text_signature,
        decoded: decoded?.toArray(),
        type: ProposalActionType.Unknown,
        metadata: null,
      }
    } catch (error) {
      logger.error('Error decoding action data', llo({ error, data }))
      return null
    }
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

  /**
   * Actions handlers based on the readable functionSignature
   */

  async _getMetadataIfTransfer(decodedData: IDecodedData, action: IRawAction, document: Partial<Proposal>) {
    const metadata: any = {}

    const setCommonMetadata = async (from: string, to: string, value: string) => {
      const token = await TokenProxy.saveAndGetToken(action.to, document.network!)

      if (token) {
        metadata.token = _.pick(token, ['address', 'name', 'symbol', 'decimals', 'logo', 'type'])
        metadata.from = from
        metadata.to = to
        metadata.value = value
      }
    }

    switch (decodedData.textSignature) {
      case KnownActionSignature.Transfer:
        await setCommonMetadata(document.daoAddress!, decodedData.decoded[0], decodedData.decoded[1])
        break

      case KnownActionSignature.TransferFrom:
      case KnownActionSignature.SafeTransferFrom:
        await setCommonMetadata(decodedData.decoded[0], decodedData.decoded[1], decodedData.decoded[2])
        break
      default:
        return null
    }

    return {
      type: ProposalActionType.Transfer,
      metadata,
    }
  }

  async _getMetadataOfAddMultiSigMember(decodedData: IDecodedData) {
    if (decodedData.textSignature !== KnownActionSignature.MultisigAddMembers) {
      return null
    }

    return {
      type: ProposalActionType.MultisigAddMembers,
      metadata: {
        addresses: decodedData.decoded[0],
      },
    }
  }

  async _getMetadataOfRemoveMultiSigMember(decodedData: IDecodedData) {
    if (decodedData.textSignature !== KnownActionSignature.MultisigRemoveMembers) {
      return null
    }

    return {
      type: ProposalActionType.MultisigRemoveMembers,
      metadata: {
        addresses: decodedData.decoded[0],
      },
    }
  }

  async _getMedataIfMint(decodedData: IDecodedData, action: IRawAction, document: Partial<Proposal>) {
    if (decodedData.textSignature !== KnownActionSignature.Mint) {
      return null
    }

    const token = await TokenProxy.saveAndGetToken(action.to, document.network!)

    if (token) {
      const metadata = {
        token: _.pick(token, ['address', 'name', 'symbol', 'decimals', 'logo', 'type']),
        to: decodedData.decoded[0],
        value: decodedData.decoded[1],
      }
      return {
        type: ProposalActionType.Mint,
        metadata,
      }
    }

    return null
  }

  async _getMetadataForMetadataUpdate(decodedData: IDecodedData) {
    if (decodedData.textSignature !== KnownActionSignature.MetadataUpdate) {
      return null
    }

    const ipfsUrl = Web3Helper.extractMetadataUri(decodedData.decoded[0])
    if (!ipfsUrl) {
      return null
    }

    try {
      const ifpsContent = await IPFSModule.fetchMetadata(ipfsUrl)
      return {
        type: ProposalActionType.MetadataUpdate,
        metadata: {
          ipfsUrl,
          ...ifpsContent,
        },
      }
    } catch (e) {
      return {
        type: ProposalActionType.MetadataUpdate,
        metadata: {
          ipfsUrl,
        },
      }
    }
  }

  async _getMetdataOfMultiSigSetting(decodedData: IDecodedData) {
    if (decodedData.textSignature !== KnownActionSignature.UpdateMultiSigSettings) {
      return null
    }

    return {
      type: ProposalActionType.UpdateMultiSigSettings,
      metadata: {
        onlyListed: decodedData.decoded[0][0],
        minApprovals: decodedData.decoded[0][1],
      },
    }
  }

  async _getMetdataOfVoteSetting(decodedData: IDecodedData) {
    if (decodedData.textSignature !== KnownActionSignature.UpdateVoteSettings) {
      return null
    }

    return {
      type: ProposalActionType.UpdateVoteSettings,
      metadata: {
        votingMode: decodedData.decoded[0][0],
        supportThreshold: decodedData.decoded[0][1],
        minParticipation: decodedData.decoded[0][2],
        minDuration: decodedData.decoded[0][3],
        minProposerVotingPower: decodedData.decoded[0][4],
      },
    }
  }
}

export default DecodeActions
