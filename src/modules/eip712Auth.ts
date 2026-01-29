import { Models } from '@dbModels'
import ProviderModule from '@modules/provider'
import { type HexAddress, IPluginInterfaceType, NetworksEnum } from '@types'
import { verifyTypedData } from 'ethers'

export enum EIP712ActionType {
  prepareCampaign = 'PREPARE_CAMPAIGN',
}

const EIP712_DOMAIN_NAME = 'Aragon Campaign'
const EIP712_DOMAIN_VERSION = '1'

const EIP712_TYPES = {
  PrepareCampaign: [
    { name: 'action', type: 'string' },
    { name: 'daoAddress', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'expiresAt', type: 'uint256' },
  ],
}

export interface IEIP712Message {
  action: string
  daoAddress: HexAddress
  nonce: string
  expiresAt: number
}

export interface IEIP712TypedData {
  domain: {
    name: string
    version: string
    chainId: number
  }
  types: typeof EIP712_TYPES
  primaryType: string
  message: IEIP712Message
}

const EIP712AuthModule = {
  getDomain: (network: NetworksEnum) => {
    return {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: ProviderModule.getChainId(network),
    }
  },

  buildTypedData: (params: {
    daoAddress: HexAddress
    network: NetworksEnum
    nonce: string
    expiresAt: number
    action: string
  }): IEIP712TypedData => {
    const { daoAddress, network, nonce, expiresAt, action } = params

    return {
      domain: EIP712AuthModule.getDomain(network),
      types: EIP712_TYPES,
      primaryType: 'PrepareCampaign',
      message: {
        action,
        daoAddress,
        nonce,
        expiresAt,
      },
    }
  },

  recoverSigner: (params: {
    daoAddress: HexAddress
    network: NetworksEnum
    nonce: string
    expiresAt: number
    action: string
    signature: string
  }): HexAddress => {
    const { daoAddress, network, nonce, expiresAt, action, signature } = params

    const domain = EIP712AuthModule.getDomain(network)
    const message: IEIP712Message = {
      action,
      daoAddress,
      nonce,
      expiresAt,
    }

    const recoveredAddress = verifyTypedData(domain, EIP712_TYPES, message, signature)

    return recoveredAddress as HexAddress
  },

  generateMessage: async (params: {
    daoAddress: HexAddress
    network: NetworksEnum
    action: string
  }): Promise<{ typedData: IEIP712TypedData; nonce: string; expiresAt: number }> => {
    const { daoAddress, network, action } = params

    const nonceDoc = await Models.SignatureNonce.generate({
      daoAddress,
      network,
      action,
    })

    const typedData = EIP712AuthModule.buildTypedData({
      daoAddress,
      network,
      nonce: nonceDoc.nonce,
      expiresAt: nonceDoc.expiresAt,
      action,
    })

    return {
      typedData,
      nonce: nonceDoc.nonce,
      expiresAt: nonceDoc.expiresAt,
    }
  },

  verifyAndConsume: async (params: {
    daoAddress: HexAddress
    network: NetworksEnum
    nonce: string
    signature: string
    action: string
  }): Promise<{ valid: boolean; signer?: HexAddress; error?: string }> => {
    const { daoAddress, network, nonce, signature, action } = params

    // First, find the nonce WITHOUT consuming it to verify signature
    const nonceDoc = await Models.SignatureNonce.findValidNonce(nonce)

    if (!nonceDoc) {
      return { valid: false, error: 'Invalid, expired, or already used nonce' }
    }

    if (nonceDoc.daoAddress !== daoAddress) {
      return { valid: false, error: 'Nonce does not match daoAddress' }
    }

    if (nonceDoc.network !== network) {
      return { valid: false, error: 'Nonce does not match network' }
    }

    if (nonceDoc.action !== action) {
      return { valid: false, error: 'Nonce does not match action' }
    }

    // Verify signature BEFORE consuming the nonce
    let signer: HexAddress
    try {
      signer = EIP712AuthModule.recoverSigner({
        daoAddress,
        network,
        nonce,
        expiresAt: nonceDoc.expiresAt,
        action,
        signature,
      })
    } catch {
      return { valid: false, error: 'Invalid signature' }
    }

    // Only consume the nonce after successful signature verification
    const consumed = await Models.SignatureNonce.consumeNonce(nonce)
    if (!consumed) {
      return { valid: false, error: 'Invalid, expired, or already used nonce' }
    }

    return { valid: true, signer }
  },

  checkMultisigMember: async (params: {
    signer: HexAddress
    daoAddress: HexAddress
    network: NetworksEnum
  }): Promise<{ authorized: boolean; error?: string }> => {
    const { signer, daoAddress, network } = params

    const multisigPlugin = await Models.Plugin.findOne({
      daoAddress,
      network,
      interfaceType: IPluginInterfaceType.multisig,
    })

    if (!multisigPlugin) {
      return { authorized: false, error: 'DAO does not have a multisig plugin' }
    }

    const member = await Models.PluginMember.findByPluginAndMember(network, multisigPlugin.address, signer)

    if (!member) {
      return { authorized: false, error: 'Signer is not a multisig member' }
    }

    return { authorized: true }
  },
}

export default EIP712AuthModule
