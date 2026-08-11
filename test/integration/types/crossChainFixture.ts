export interface CrossChainDaoDeployment {
  dao: string
  adminPlugin: string
  controller: string
  executor: string
  adapter: string
  router: string
  pluginRepo: string
  deployer: string
  minFailedMessageGas: string
  forwardMessageTxHash: string
  innerTransferTarget: string
  selectorCondition: string
  selectorTarget: string
  allowedSelector: string
  disallowedSelector: string
}
