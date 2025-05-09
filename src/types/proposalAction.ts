import { type ITokenMetadata } from '@src/types/token'
import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export enum ProposalActionType {
  Transfer = 'Transfer',
  TransferNative = 'TransferNative',
  Unknown = 'Unknown',
  Mint = 'Mint',
  MultisigAddMembers = 'MultisigAddMembers',
  MultisigRemoveMembers = 'MultisigRemoveMembers',
  MetadataUpdate = 'MetadataUpdate',
  UpdateMultiSigSettings = 'UpdateMultiSigSettings',
  UpdateVoteSettings = 'UpdateVoteSettings',
  StagesUpdated = 'StagesUpdated',
  MetadataPluginUpdate = 'MetadataPluginUpdate',
}

export interface IRawAction {
  to: string
  data: string
  value: any
  from?: string
  network?: NetworksEnum
}

export interface IProposalInfo {
  id: string
}

export enum KnownActionSignature {
  Transfer = 'transfer(address,uint256)',
  TransferFrom = 'transferFrom(address,address,uint256)',
  SafeTransferFrom = 'safeTransferFrom(address,address,uint256)',
  Mint = 'mint(address,uint256)',
  MultisigAddMembers = 'addAddresses(address[])',
  MultisigRemoveMembers = 'removeAddresses(address[])',
  MetadataUpdate = 'setMetadata(bytes)',
  UpdateMultiSigSettings = 'updateMultisigSettings(tuple)',
  UpdateVoteSettings = 'updateVotingSettings(tuple)',
  StagesUpdated = 'updateStages(tuple[])',
}

export interface IProposalRawAction {
  to: HexAddress
  value: string
  data: HexAddress
  functionName: string
  textSignature: string
  decoded: any[]
  contractName: string
  type: ProposalActionType
  metadata: IActionMetadata
}

export interface ITransfacerActionMeta {
  token: ITokenMetadata
  from: string
  to: string
  value: string
}

export interface IMintActionMeta {
  token: ITokenMetadata
  to: string
  value: string
}

export interface IAddMembersActionMeta {
  addresses: string[]
}

export interface IMultiSigSettingsMeta {
  onlyListed: boolean
  minApprovals: number
}

export interface IVoteSettingsMeta {
  votingMode: number
  supportThreshold: number
  minParticipation: number
  minDuration: number
  minProposerVotingPower: string
}

export type IActionMetadata =
  | ITransfacerActionMeta
  | IMintActionMeta
  | IAddMembersActionMeta
  | IMultiSigSettingsMeta
  | IVoteSettingsMeta

/**
 * ODS Proposal Action Type
 */

export interface IProposalActionInputDataParameter {
  components?: any
  /**
   * The type of the parameter (e.g. address, uint256, uint32, ..).
   */
  type: string
  /**
   * The value of the parameter.
   */
  value: any

  /**
   * The name of the parameter.
   */
  name?: string

  /**
   * Notice of the parameter.
   */
  notice?: string
}

export interface IProposalActionInputData {
  /**
   * Name of the function to call from proposal action.
   */
  function: string
  /**
   * The name of the contract to interact with.
   */
  contract?: string
  /**
   * The parameters to pass to the function.
   */
  parameters: IProposalActionInputDataParameter[]
  /**
   * Notice of the input data.
   */
  notice?: string

  textSignature?: string

  implementationAddress?: string | null
  proxyName?: string
}

export interface ICompositeAddress {
  address: string
  name?: string
}
export interface IProposalAction {
  /**
   * The address to send the transaction from.
   */
  from: string
  /**
   * The address to send the transaction to.
   */
  to: string
  /**
   * The data to send with the transaction.
   */
  data: string
  /**
   * The value to send with the transaction.
   */
  value: string | null
  /**
   * The type of the proposal action.
   */
  type: string
  /**
   * The input data for the proposal action.
   */
  inputData: IProposalActionInputData | null
}

export interface IProposalActionChangeMembers extends IProposalAction {
  /**
   * Adjust member count action
   */
  type: ProposalActionType.MultisigAddMembers | ProposalActionType.MultisigRemoveMembers
  /**
   * The members that are being added or removed
   */
  members: ICompositeAddress[]
  /**
   * The number of members of the DAO when the proposal is created
   */
  currentMembers: number
}

export interface IProposalActionChangeSettingsSetting {
  /**
   * The term of the setting.
   */
  term: string
  /**
   * The definition of the setting.
   */
  definition: string | number
}

export interface IProposalActionChangeSettings extends IProposalAction {
  /**
   * The settings that are proposed to be changed
   */
  proposedSettings: IProposalActionChangeSettingsSetting[]
  /**
   * The settings that are currently in place.
   */
  existingSettings: IProposalActionChangeSettingsSetting[]
}

export interface IProposalActionTokenMintMetadataReceiver extends ICompositeAddress {
  /**
   * Receivers current token balance.
   */
  currentBalance: number
  /**
   * Receivers new token balance after mint.
   */
  newBalance: number

  /**
   * Receiver address.
   */
  address: string
}

export interface IProposalActionTokenMint extends IProposalAction {
  /**
   * Token mint action.
   */
  type: ProposalActionType.Mint
  /**
   * Token receivers.
   */
  receivers: IProposalActionTokenMintMetadataReceiver[]
  /**
   * Total token supply.
   */
  tokenSupply: number
  /**
   * Holders token count.
   */
  holdersCount: number
  /**
   * Token Symbol.
   */
  tokenSymbol: string
}

export interface IProposalActionUpdateMetadataDaoMetadataLink {
  /**
   * Human readable label for link.
   */
  label: string
  /**
   * link href.
   */
  href: string
}

export interface IProposalActionUpdateMetadataDaoMetadata {
  /**
   * Logo url of the DAO.
   */
  logo: string
  /**
   *  Name of the DAO.
   */
  name: string
  /**
   * DAO Description.
   */
  description: string
  /**
   * Array of metadata links.
   */
  links: IProposalActionUpdateMetadataDaoMetadataLink[]
}

export interface IProposalActionUpdateMetadata extends IProposalAction {
  /**
   * UpdateMetadata action.
   */
  type: ProposalActionType.MetadataUpdate
  /**
   * Proposed metadata.
   */
  proposedMetadata: IProposalActionUpdateMetadataDaoMetadata
  /**
   * Existing metadata.
   */
  existingMetadata: IProposalActionUpdateMetadataDaoMetadata
}

export interface IProposalActionWithdrawToken extends IProposalAction {
  /**
   * Withdraw token action type.
   */
  type: ProposalActionType.Transfer
  /**
   * Sender handle (the DAO treasury in this case), object with address and optional ensName.
   */
  sender: ICompositeAddress
  /**
   * Receiver handle, object with address and optional ensName.
   */
  receiver: ICompositeAddress
  /**
   * Amount of tokens to withdraw.
   */
  amount: string
  /**
   * Token details of the token to withdraw.
   */
  token: {
    /**
     * Token name.
     */
    name: string
    /**
     * Token symbol.
     */
    symbol: string
    /**
     * Token decimals.
     */
    decimals: number
    /**
     * Token logo.
     */
    logo: string
    /**
     * Token price in USD.
     */
    priceUsd: string
    /**
     * Token address.
     */
    address: string
  }
}

export interface IEtherScanSource {
  SourceCode: string
  ABI: string
  ContractName: string
}
