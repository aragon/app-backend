import logger from '@logger'
import { FunctionFragment, hexlify, Interface } from 'ethers'
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

const llo = logger.logMeta.bind(null, { service: 'DecodeActions' })

interface Signature {
  method: string
  sig: string
  fragment: FunctionFragment
}

interface IDecodedData {
  contractName?: string
  functionName: any
  decoded: any
  textSignature: string
}

class DecodeActions {
  allSignatures: { contractName: string; signatures: Signature[]; abi: any[] }[]
  data: any

  constructor() {
    this.allSignatures = []
    this._setupSignatures()
  }

  public decodeTransfer(
    action: { to: string; value: any; data: any },
    document: Partial<Proposal>,
  ): IDecodedData | null {
    if (Web3Helper.isNativeTokenAction(action)) {
      // native token transfer
      return {
        functionName: 'NativeTransfer',
        textSignature: 'nativeTransfer(address,address,uint256)',
        decoded: [document.daoAddress, action.to, action.value],
      }
    }

    return null
  }

  public async decodeData(data: string): Promise<IDecodedData | null> {
    let decoded = this._decodeWithAbi(data)

    if (!decoded) {
      decoded = await this._decodeFallback(data)
    }

    return decoded
  }

  _decodeWithAbi(data: string): IDecodedData | null {
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

          return { functionName, textSignature, decoded: decoded?.toArray(), contractName }
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
}

export default DecodeActions
