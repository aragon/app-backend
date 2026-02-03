import { Models } from '@dbModels'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logNotFound, logValid } from './baseValidator'

async function validateSettingExists(eventName: string, info: ILogInfo): Promise<void> {
  const setting = await Models.Setting.findActive({ pluginAddress: info.address, network: info.network })
  if (!setting) {
    logNotFound(eventName, info, { pluginAddress: info.address })
    return
  }
  logValid(eventName, info)
}

async function validateLogPolicyCreated(eventName: string, info: ILogInfo): Promise<void> {
  const record = await Models.LogPolicy.findOne({
    transactionHash: info.transactionHash,
    network: info.network,
    blockNumber: info.blockNumber,
  })
  if (!record) {
    logNotFound(eventName, info)
    return
  }
  logValid(eventName, info)
}

export const PolicyValidator = {
  streamSourceSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSettingExists('SourceSettingsUpdated:stream', info)
  },

  drainSourceSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSettingExists('SourceSettingsUpdated:drain', info)
  },

  pluginDefined: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSettingExists('PluginDefined', info)
  },

  ratioModelSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSettingExists('ModelSettingsUpdated:ratio', info)
  },

  equalRatioModelSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSettingExists('ModelSettingsUpdated:equalRatio', info)
  },

  gaugeModelSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSettingExists('ModelSettingsUpdated:gauge', info)
  },

  bracketsModelSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSettingExists('ModelSettingsUpdated:brackets', info)
  },

  routerSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSettingExists('RouterSettingsUpdated', info)
  },

  multiRouterSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSettingExists('RouterSettingsUpdated:multi', info)
  },

  cowSwapRouterSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSettingExists('RouterSettingsUpdated:cowSwap', info)
  },

  claimerSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSettingExists('ClaimerSettingsUpdated', info)
  },

  multiClaimerSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSettingExists('ClaimerSettingsUpdated:multi', info)
  },

  drainBalanceSourceDeployed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPolicyCreated('DrainBalanceSourceDeployed', info)
  },

  requiredBalanceSourceDeployed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPolicyCreated('RequiredBalanceSourceDeployed', info)
  },

  streamBalanceSourceDeployed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPolicyCreated('StreamBalanceSourceDeployed', info)
  },

  fixedBalanceSourceDeployed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPolicyCreated('FixedBalanceSourceDeployed', info)
  },

  ratioModelDeployed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPolicyCreated('RatioModelDeployed', info)
  },

  equalRatioModelDeployed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPolicyCreated('EqualRatioModelDeployed', info)
  },

  bracketsModelDeployed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPolicyCreated('BracketsModelDeployed', info)
  },

  addressGaugeRatioModelDeployed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPolicyCreated('AddressGaugeRatioModelDeployed', info)
  },

  tokenGaugeRatioModelDeployed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPolicyCreated('TokenGaugeRatioModelDeployed', info)
  },
}
