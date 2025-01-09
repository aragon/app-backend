import DecodeActions from '@helpers/decodeAction'
import { type IRawAction } from '@types'
import Web3Helper from '@helpers/web3'

const ActionDecode = {
  decode: async (action: IRawAction) => {
    const decodeHelper = new DecodeActions()
    if (action.data?.length >= 10 && Web3Helper.isNativeTokenAction(action.data)) {
      return decodeHelper.decodeTransfer(action, {
        network: action.network!,
        daoAddress: action.from,
      })
    }

    const blockNumber = await Web3Helper.getBlockNumber('latest', action.network!)

    const decodedData = decodeHelper.decodeData(action, {
      network: action.network!,
      daoAddress: action.from,
      pluginAddress: action.to,
      blockNumber,
    })

    if (!decodedData) {
      return null
    }

    return decodedData
  },
}

export default ActionDecode
