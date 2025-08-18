import { NetworksEnum } from '@types'

export const fakeTokenMembers = [
  {
    memberAddress: '0x123456789012345678901234567890123456789A',
    tokenAddress: '0xA23456789012345678901234567890123456789B',
    network: NetworksEnum.ethereumMainnet,
    votingPower: '1000000000000000000000',
    delegateReceivedCount: 5,
  },
  {
    memberAddress: '0x223456789012345678901234567890123456789A',
    tokenAddress: '0xA23456789012345678901234567890123456789B',
    network: NetworksEnum.ethereumMainnet,
    votingPower: '500000000000000000000',
    delegateReceivedCount: 2,
  },
  {
    memberAddress: '0x323456789012345678901234567890123456789A',
    tokenAddress: '0xA23456789012345678901234567890123456789B',
    network: NetworksEnum.ethereumMainnet,
    votingPower: '0',
    delegateReceivedCount: 0,
  },
]
