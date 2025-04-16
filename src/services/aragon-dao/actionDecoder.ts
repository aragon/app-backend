import DecodeActions from '@helpers/decodeAction'
import { type IRawAction } from '@types'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'

const ActionDecode = {
  decode: async (action: IRawAction) => {
    const decodeHelper = new DecodeActions()
    if (Web3Utils.isNativeTokenAction(action)) {
      return decodeHelper.decodeTransfer(action, {
        network: action.network!,
        daoAddress: action.from,
      })
    }

    const blockNumber = await Web3Helper.getBlockNumber('latest', action.network!)

    const decodedData = await decodeHelper.decodeData(action, {
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
