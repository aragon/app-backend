import { NetworksEnum } from '@types'

export const fakePluginMembers = [
  {
    memberAddress: '0x123456789012345678901234567890123456789A',
    pluginAddress: '0xA23456789012345678901234567890123456789B',
    daoAddress: '0xB23456789012345678901234567890123456789C',
    network: NetworksEnum.ethereumMainnet,
  },
  {
    memberAddress: '0x223456789012345678901234567890123456789A',
    pluginAddress: '0xA23456789012345678901234567890123456789B',
    daoAddress: '0xB23456789012345678901234567890123456789C',
    network: NetworksEnum.ethereumMainnet,
  },
  {
    memberAddress: '0x323456789012345678901234567890123456789A',
    pluginAddress: '0xC23456789012345678901234567890123456789D',
    daoAddress: '0xD23456789012345678901234567890123456789E',
    network: NetworksEnum.polygonMainnet,
  },
]
