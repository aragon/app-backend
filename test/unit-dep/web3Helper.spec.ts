import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import CovalentHelper from '@helpers/covalent'
import Web3Utils from '@helpers/web3Utils'
import Web3Provider from '@modules/proxyProvider/web3Provider'

describe('ProxyWeb3 && Web3Helper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('supportsInterface', async () => {
    const tokenAddress = '0x722905AF564B93D6175250Ca0316cB87Ff6F9c6A'
    const network = NetworksEnum.ethereumSepolia
    const supportsERC721 = await Web3Helper.supportsInterface(tokenAddress, Web3Utils.ERC721_INTERFACE_ID, network)
    expect(supportsERC721).to.be.true
  })

  it('getBlockNumber', async () => {
    const network = NetworksEnum.ethereumSepolia
    const blockNumber = await Web3Helper.getBlockNumber('latest', network)
    expect(blockNumber > 7998117).to.be.true
  })

  it('getBlock', async () => {
    const blockNumber = 5963492
    const network = NetworksEnum.ethereumSepolia
    const block = await Web3Helper.getBlock(blockNumber, network)
    expect(block?.number).to.eq(blockNumber)
  })

  it('getBlockTimestamp', async () => {
    const blockNumber = 5963492
    const network = NetworksEnum.ethereumSepolia
    const timestamp = await Web3Helper.getBlockTimestamp(blockNumber, network)
    expect(timestamp).to.eq(1716493704)
  })

  it('getTokenBalanceAtBlock', async () => {
    const address = '0x268d0D66931bb3525070c01F8c29c03b23f2f058'
    const tokenAddress = '0x722905AF564B93D6175250Ca0316cB87Ff6F9c6A'
    const blockNumber = 7997991
    const network = NetworksEnum.ethereumSepolia
    const value = await Web3Helper.getTokenBalanceAtBlock({ address, tokenAddress, blockNumber, network })
    expect(value).to.eq('4')
  })

  it('getTokenBalances', async () => {
    const address = '0x951dcBafc1D80B9cD612915e9CcF5Ada06d6566E'
    const network = NetworksEnum.ethereumMainnet
    sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves({ totalSupply: '0', totalHolders: 0 } as any)
    sandbox.stub(CovalentHelper, 'getToken').resolves(null as any)

    const tokenBalances = await Web3Provider.getTokenBalances({
      address,
      network,
    })

    expect(tokenBalances.length > 0).to.be.true
    expect(tokenBalances[0].contractAddress).to.exist
    expect(tokenBalances[0].tokenBalance).to.exist
    expect(tokenBalances[0].originalBalance).to.exist
  })

  it('getTransaction', async () => {
    const txHash = '0x80cb58a41639792825ef5a567de3c12ab78098b54b06f3e753428667ef5b1410'
    const network = NetworksEnum.ethereumSepolia
    const tx = await Web3Helper.getTransaction(txHash, network)
    expect(tx).to.be.an('object')
    expect(tx?.hash).to.eq(txHash)
  })

  it('getTransactionReceipt', async () => {
    const txHash = '0x80cb58a41639792825ef5a567de3c12ab78098b54b06f3e753428667ef5b1410'
    const network = NetworksEnum.ethereumSepolia
    const tx = await Web3Helper.getTransactionReceipt(txHash, network)
    expect(tx).to.be.an('object')
    expect(tx?.hash).to.eq(txHash)
  })

  it('getTokenTotalSupply', async () => {
    const address = '0xe4fBbB0B11b3B48D10B4753a1D2c00244b247b33'
    const network = NetworksEnum.ethereumMainnet
    const value = await Web3Helper.getTokenTotalSupply(address, network)
    expect(value).to.eq(500000000000000000000n)
  })

  it('getTokenInfo', async () => {
    const address = '0xe4fBbB0B11b3B48D10B4753a1D2c00244b247b33'
    const network = NetworksEnum.ethereumMainnet
    const token = await Web3Helper.getTokenInfo(address, network)
    expect(token.address).to.eq(address)
    expect(token.decimals).to.eq(18)
    expect(token.name).to.eq('Fabrice Custom Token')
    expect(token.symbol).to.eq('FCT')
    expect(token.totalSupply).to.eq('500000000000000000000')
  })

  it('getDataFromTxReceipt', async () => {
    const txHash = '0x80cb58a41639792825ef5a567de3c12ab78098b54b06f3e753428667ef5b1410'
    const network = NetworksEnum.ethereumSepolia
    const tx = await Web3Helper.getTransactionReceipt(txHash, network)
    expect(tx).to.be.an('object')
    expect(tx?.hash).to.eq(txHash)
  })

  it('getERC20Balance', async () => {
    const memberAddress = '0x284803C34A3F049f787E2562e6F8C084bdBC3197'
    const tokenAddress = '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F'
    const network = NetworksEnum.ethereumSepolia
    const value = (await Web3Helper.getERC20Balance(memberAddress, tokenAddress, network)) as bigint
    expect(value > 0n).to.be.true
  })

  it('getDaoOsVersion', async () => {
    const daoAddress = '0xeD6b0722e88E8fDDF5a4e4F863Dc4672940A0D4e'
    const network = NetworksEnum.ethereumSepolia
    const version = await Web3Helper.getDaoOsVersion(daoAddress, network)
    expect(version).to.eq('1.4.0')
  })

  it('getMultisigSettings', async () => {
    const pluginAddress = '0x3BBAa1762bDA9C3B028Cd016d0997C472f467534'
    const network = NetworksEnum.ethereumSepolia
    const settings = await Web3Helper.getMultisigSettings(pluginAddress, network)
    expect(settings?.onlyListed).to.be.true
    expect(settings?.minApprovals).to.eq(1n)
  })

  it('isMultisigMemberAtBlock', async () => {
    const pluginAddress = '0x3BBAa1762bDA9C3B028Cd016d0997C472f467534'
    const memberAddress = '0x0bD654d08C5e0e5646096957acF5f8fb186F58Bd'
    let blockNumber = 6196998
    const network = NetworksEnum.ethereumSepolia
    const result = await Web3Helper.isMultisigMemberAtBlock(pluginAddress, memberAddress, blockNumber, network)
    expect(result).to.be.true

    blockNumber = 6196907
    const result2 = await Web3Helper.isMultisigMemberAtBlock(pluginAddress, memberAddress, blockNumber, network)
    expect(result2).to.be.false
  })

  it('getBlockReceipts', async () => {
    const blockNumber = 6929939
    const network = NetworksEnum.ethereumSepolia
    const txs = await Web3Helper.getBlockReceipts(network, blockNumber)
    expect(txs.length).to.eq(135)
  })

  it('getTargetConfig', async () => {
    const pluginAddress = '0x6d675B3992ffb4cb8e67f30eDc2Eb00F3cA4290e'
    const network = NetworksEnum.ethereumSepolia
    const address = await Web3Helper.getTargetConfig(network, pluginAddress)
    expect(address).to.eq('0xC4b92daE1271D8AAD9531edCCf70715a01E722e3')
  })

  it('getVotingEscrowAddress', async () => {
    const pluginAddress = '0x69E8D5151d71d4cde35b5076aF3023C7D54d379E'
    const network = NetworksEnum.ethereumMainnet
    const votingEscrowAddress = await Web3Helper.getVotingEscrowAddress(pluginAddress, network)
    expect(votingEscrowAddress).to.eq('0xA55eD5808aeCDF23AE3782C1443185f5D2363ce7')
  })

  it('getLockTokenAddress', async () => {
    const votingEscrowAddress = '0xA55eD5808aeCDF23AE3782C1443185f5D2363ce7'
    const network = NetworksEnum.ethereumMainnet
    const tokenAddress = await Web3Helper.getLockTokenAddress(votingEscrowAddress, network)
    expect(tokenAddress).to.eq('0x1b6ec227ceBeC25118270efbb4b67642fc29965E')
  })

  it('getTokenNameAndSymbol', async () => {
    const tokenAddress = '0x1b6ec227ceBeC25118270efbb4b67642fc29965E'
    const network = NetworksEnum.ethereumMainnet
    const token = await Web3Helper.getTokenNameAndSymbol(tokenAddress, network)
    expect(token).to.be.an('object')
    expect(token?.name).to.eq('Voting Escrow PUFFER')
    expect(token?.symbol).to.eq('vePUFFER')
  })
})
