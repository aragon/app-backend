import logger from '@logger'
import { FunctionFragment, hexlify, Interface } from 'ethers'
import { Multisig } from '@artifacts/Multisig'
import { MajorityVotingBase } from '@artifacts/MajorityVotingBase'
import { IERC20MintableUpgradeable } from '@artifacts/IERC20MintableUpgradeable'
import { ERC20 } from '@artifacts/ERC20'
import { ERC721 } from '@artifacts/ERC721'
import { ERC1155 } from '@artifacts/ERC1155'
import { DAOFactory } from '@artifacts/daoFactory'

const llo = logger.logMeta.bind(null, { service: 'DecodeActions' })

interface Signature {
  method: string
  sig: string
}

class DecodeActions {
  allSignatures: { name: string; signatures: Signature[]; abi: any[] }[]
  data: any

  constructor() {
    this.allSignatures = []
    this.setupSignatures()
  }

  public decodeData(data: string) {
    const dataHex = hexlify(data)
    for (const { name, signatures, abi } of this.allSignatures) {
      const fragment = this.getFunctionFragment(dataHex, signatures)
      if (fragment) {
        try {
          const iface = new Interface(abi)
          const decoded = iface.decodeFunctionData(fragment, dataHex)
          return { name, fragment, decoded }
        } catch (error) {
          logger.error('Error decoding data', llo({ error, name, fragment, dataHex }))
        }
      }
    }
    return null
  }


  getSignaturesFromAbi(abi: any[], name: string): Signature[] {
    return abi
      .filter(item => item.type === 'function')
      .map(item => {
        try {
          const fragment = FunctionFragment.from(item);
          return { method: fragment.name, sig: fragment.format('minimal') };
        } catch (error) {
          logger.warn('Error creating FunctionFragment', llo({ error, item, name, abi }))
          return null;
        }
      })
      .filter((item): item is Signature => item !== null)
  }

  private setupSignatures() {
    const multisigSignatures: Signature[] = this.getSignaturesFromAbi(Multisig.abi, 'Multisig')
    const tokenVotingSignatures: Signature[] = this.getSignaturesFromAbi(MajorityVotingBase.abi, 'MajorityVotingBase')
    const erc20MintableSignatures: Signature[] = this.getSignaturesFromAbi(IERC20MintableUpgradeable.abi, 'IERC20MintableUpgradeable')
    const erc20Signatures: Signature[] = this.getSignaturesFromAbi(ERC20.abi, 'ERC20')
    const erc721Signatures: Signature[] = this.getSignaturesFromAbi(ERC721.abi, 'ERC721')
    const erc1155Signatures: Signature[] = this.getSignaturesFromAbi(ERC1155.abi, 'ERC1155')
    const daoFactorySignatures: Signature[] = this.getSignaturesFromAbi(DAOFactory.abi, 'DAOFactory')

    this.allSignatures = [
      { name: 'DaoFactory', signatures: daoFactorySignatures, abi: DAOFactory.abi },
      { name: 'Multisig', signatures: multisigSignatures, abi: Multisig.abi },
      { name: 'MajorityVotingBase', signatures: tokenVotingSignatures, abi: MajorityVotingBase.abi },
      { name: 'IERC20MintableUpgradeable', signatures: erc20MintableSignatures, abi: IERC20MintableUpgradeable.abi },
      { name: 'ERC20', signatures: erc20Signatures, abi: ERC20.abi },
      { name: 'ERC721', signatures: erc721Signatures, abi: ERC721.abi },
      { name: 'ERC1155', signatures: erc1155Signatures, abi: ERC1155.abi },
    ]
  }

  private getFunctionFragment(dataHex: string, availableSignatures: Signature[]): FunctionFragment | undefined {
    const functionSelector = dataHex.substring(0, 10)
    for (const { sig } of availableSignatures) {
      const fragment = FunctionFragment.from(sig)
      if (functionSelector === fragment.format('sighash')) {
        return fragment
      }
    }
    return undefined
  }
}

export default DecodeActions
