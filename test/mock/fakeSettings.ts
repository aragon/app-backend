import { ISettingStatus, NetworksEnum } from '@types'
export const fakeSettings = {
  transactionHash: '0x6796a9641df93d7902c073eaa8b45019c27e53fb3872f761a2d0a3005da4cd41',
  blockNumber: 40941779,
  blockTimestamp: 1680186182,
  network: NetworksEnum.polygonMainnet,
  status: ISettingStatus.active,
  daoAddress: '0x19E246564b3264fed309D3D004f807D5887e5521',
  pluginAddress: '0x9d5586b4B048Ba9fa847Ae5F169352dc080b3eb3',
  pluginSubdomain: 'token-voting',
  tokenAddress: '0x613ef3f5959688c3b422A545906F844b6f8c8F35',
  votingMode: 1,
  supportThreshold: 500000,
  minParticipation: 150000,
  minDuration: 3600,
  minProposerVotingPower: '0',
}
