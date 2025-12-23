import { ITokenType, ITransactionSide, ITransactionType, NetworksEnum } from '@types'

export const FakeTransaction = {
  transactionHash: '0x14c9c85a416679f1b3e89e98e5c1e5d99bb4426d11c5c9e2694d6c9ead52637e',
  blockNumber: 40941880,
  blockTimestamp: 1680186396,
  network: NetworksEnum.polygonMainnet,
  side: ITransactionSide.deposit,
  type: ITransactionType.erc20,
  fromAddress: '0x42c9a3f034592c39028aea70a6e69fbc6ccf6c31',
  toAddress: '0x19e246564b3264fed309d3d004f807d5887e5521',
  value: '1.34553',
  tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  pluginAddress: '0x29E246564b3264fed309D3D004f807D5887e5521',
  daoAddress: '0x19E246564b3264fed309D3D004f807D5887e5521',
  tokenId: null,
  erc721TokenId: null,
  erc1155Metadata: [],
  proposalIndex: null,
  token: {
    network: NetworksEnum.polygonMainnet,
    type: ITokenType.ERC20,
    address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    logo: 'https://logos.covalenthq.com/tokens/1/0xdac17f958d2ee523a2206206994597c13d831ec7.png',
    name: '(PoS) Tether USD',
    symbol: 'USDT',
    decimals: 6,
    snapshot: {
      priceUsd: '1.0004114',
      priceUpdatedAt: 1680186396,
    },
  },
  amountUsd: '1.3460835510419997',
}
