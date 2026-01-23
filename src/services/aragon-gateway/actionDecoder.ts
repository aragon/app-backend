import { Models } from '@dbModels'
import { ProposalHandler } from '@handlers/proposalHandler'
import DecodeActions from '@helpers/decodeAction'
import DecoderLight from '@helpers/decoderLight'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import { type IQueueContractDecoderLight, type IRawAction } from '@types'

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

  decodeLight: async (params: IQueueContractDecoderLight) => {
    const decoder = new DecoderLight()
    const actionsWithFrom = params.actions.map(action => ({ ...action, from: params.from }))
    return decoder.decodeBatch(actionsWithFrom, params.network)
  },

  proposalActionDecoder: async (id: string) => {
    const proposal = await Models.Proposal.findByEntityId(id)
    if (!proposal) {
      return null
    }

    await ProposalHandler.parseActions(proposal)
  },
}

export default ActionDecode
