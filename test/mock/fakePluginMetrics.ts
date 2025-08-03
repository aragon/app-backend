import { NetworksEnum } from '@types'

export const fakePluginMetrics = [
  {
    memberAddress: '0x123456789012345678901234567890123456789A',
    pluginAddress: '0xA23456789012345678901234567890123456789B',
    daoAddress: '0xB23456789012345678901234567890123456789C',
    network: NetworksEnum.ethereumMainnet,
    voteCount: 10,
    proposalCount: 5,
    lastActivity: 1234567890,
    firstActivity: 1234567800,
  },
  {
    memberAddress: '0x223456789012345678901234567890123456789A',
    pluginAddress: '0xA23456789012345678901234567890123456789B',
    daoAddress: '0xB23456789012345678901234567890123456789C',
    network: NetworksEnum.ethereumMainnet,
    voteCount: 20,
    proposalCount: 8,
    lastActivity: 1234567900,
    firstActivity: 1234567700,
  },
  {
    memberAddress: '0x323456789012345678901234567890123456789A',
    pluginAddress: '0xC23456789012345678901234567890123456789D',
    daoAddress: '0xD23456789012345678901234567890123456789E',
    network: NetworksEnum.polygonMainnet,
    voteCount: 0,
    proposalCount: 0,
    lastActivity: null,
    firstActivity: null,
  },
]
