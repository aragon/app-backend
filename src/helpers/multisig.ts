import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { type HexAddress, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:MultisigHelper' })

const MultisigHelper = {
  findSettings: async (
    pluginAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<{ minApprovals: number; onlyListed: boolean } | undefined> => {
    const settings = await Web3Helper.getMultisigSettings(pluginAddress, network)

    const onlyListed = settings?.onlyListed || false
    const minApprovals: any = Number(settings?.minApprovals || 0)

    if (settings?.minApprovals) {
      return { minApprovals, onlyListed }
    }

    logger.error('MinApprovals not found', llo({ pluginAddress, network }))
  },
}

export default MultisigHelper
