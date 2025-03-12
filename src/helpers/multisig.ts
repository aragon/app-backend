import { type HexAddress, type NetworksEnum } from '@types'
import logger from '@logger'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'helpers:MultisigHelper' })

const MultisigHelper = {
  findSettings: async (
    pluginAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<{ minApprovals: number; onlyListed: boolean } | undefined> => {
    const settings = await Web3Helper.getMultisigSettings(pluginAddress, network)

    let minApprovals: any
    const onlyListed = settings?.onlyListed || false

    if (settings && Object.prototype.hasOwnProperty.call((settings as any).toObject(), 'minApprovals')) {
      minApprovals = Number(settings?.minApprovals)
    }

    if (minApprovals !== undefined) {
      return { minApprovals, onlyListed }
    }

    logger.error('MinApprovals not found', llo({ pluginAddress, network }))
  },
}

export default MultisigHelper
