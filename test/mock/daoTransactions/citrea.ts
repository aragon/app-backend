import { NetworksEnum } from '@types'

// Real Citrea mainnet DAO used to verify ERC20 transfer sync end-to-end.
// The DAO received 5 JUCY (token 0x28CeBE1B35B04f9f39c42fC5CA80160C4608FA0B)
// at block 5814770.
// See https://explorer.mainnet.citrea.xyz/token/0x28CeBE1B35B04f9f39c42fC5CA80160C4608FA0B
//
// `blockNumber` is the crawl lower bound. It is pinned just before the JUCY
// deposit block so test runtime stays bounded as the chain advances — a
// full-history scan from NODES_CITREA_MAINNET_FROM_BLOCK would grow linearly
// with the chain and eventually become flaky.
export const CITREA_JUCY_TOKEN = '0x28CeBE1B35B04f9f39c42fC5CA80160C4608FA0B'
export const CITREA_JUCY_DEPOSIT_BLOCK = 5814770

export const citreaDaoForTransactions = {
  id: `${NetworksEnum.citreaMainnet}-0x10FD1a9E6aA2635bAED729A4f4a1f43e470C6dB2`,
  isActive: true,
  isHidden: false,
  isSupported: true,
  network: NetworksEnum.citreaMainnet,
  transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  blockNumber: CITREA_JUCY_DEPOSIT_BLOCK - 500,
  blockTimestamp: 1700000000,
  address: '0x10FD1a9E6aA2635bAED729A4f4a1f43e470C6dB2',
  implementationAddress: '0x0000000000000000000000000000000000000000',
  creatorAddress: '0x0000000000000000000000000000000000000000',
  ens: null,
  subdomain: null,
  version: '1.3.0',
}
