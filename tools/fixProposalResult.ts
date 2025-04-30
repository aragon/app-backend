import { EnumConnection, type IService, NetworksEnum } from '@types'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { ProposalHandler } from '@handlers/proposalHandler'

export const FixProposalResult: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const network = NetworksEnum.ethereumSepolia
    const txHash = '0x3bd7bb1f7ae85868ffd9cf7eeeb74c499c1372349a138108f4c3591841aed3b4'

    const resultEvents = await UnitDepUtils.getData(
      StagedProposalProcessor.abi,
      'ProposalResultReported',
      txHash,
      network,
    )

    for (const { event, logInfo } of resultEvents) {
      await ProposalHandler.proposalResultReport(event, logInfo)
    }
  },

  stop: async () => {},
}

export default FixProposalResult
