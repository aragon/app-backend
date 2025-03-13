// import { EnumConnection, IEventLogMember, IMultiSigLogs, type IService, NetworksEnum } from '@types'
// import UnitDepUtils from '@test/lib/unit-dep/utils'
// import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
// import { ProposalHandler } from '@handlers/proposalHandler'
// import { SharedLogs } from '@artifacts/shared'
//
// export const ToolsManualSyncMissingProposals: IService = {
//   NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],
//
//   start: async () => {
//     const network = NetworksEnum.ethereumMainnet
//     const tx = await UnitDepUtils.getData(
//       SharedLogs.abi,
//       IMultiSigLogs.ProposalCreated,
//       '0xb149cc26dc21150ffd0c07613d677f89658ee9bfeea9b733b0c6444bc59060f7',
//       network,
//     )
//
//     for (const { event, logInfo } of tx) {
//       await ProposalHandler.proposalCreated(event, logInfo)
//     }
//
//     console.log(tx)
//   },
//
//   stop: async () => {},
// }
//
// export default ToolsManualSyncMissingProposals
