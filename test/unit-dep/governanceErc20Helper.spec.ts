import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IClockMode, NetworksEnum } from '@types'
import GovernanceErc20Helper from '@helpers/governanceErc20'

describe('GovernanceErc20Helper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('getPastVotes', async () => {
    const memberAddress = '0xc1d60f584879f024299DA0F19Cdb47B931E35b53'
    const tokenAddress = '0xe4fBbB0B11b3B48D10B4753a1D2c00244b247b33'
    const blockNumber = 16733703
    const blockTimestamp = 1677672875
    const network = NetworksEnum.ethereumMainnet
    const pastVotes = await GovernanceErc20Helper.getPastVotes(
      memberAddress,
      tokenAddress,
      blockNumber,
      blockTimestamp,
      network,
      IClockMode.BlockNumber,
    )
    expect(pastVotes).to.eq('500000000000000000000')
  })

  it('getVotes', async () => {
    const memberAddress = '0xc1d60f584879f024299DA0F19Cdb47B931E35b53'
    const tokenAddress = '0xe4fBbB0B11b3B48D10B4753a1D2c00244b247b33'
    const network = NetworksEnum.ethereumMainnet
    const pastVotes = await GovernanceErc20Helper.getVotes(memberAddress, tokenAddress, network)
    expect(pastVotes).to.eq(500000000000000000000n)
  })

  it('getPastTotalSupply', async () => {
    const tokenAddress = '0xe4fBbB0B11b3B48D10B4753a1D2c00244b247b33'
    const blockNumber = 16733703
    const network = NetworksEnum.ethereumMainnet
    const totalSupply = await GovernanceErc20Helper.getPastTotalSupply({
      blockNumber,
      network,
      tokenAddress,
      blockTimestamp: 0,
      clockMode: IClockMode.BlockNumber,
    })
    expect(totalSupply).to.eq('500000000000000000000')
  })

  it('getDelegates', async () => {
    const memberAddress = '0xc1d60f584879f024299DA0F19Cdb47B931E35b53'
    const tokenAddress = '0xe4fBbB0B11b3B48D10B4753a1D2c00244b247b33'
    const network = NetworksEnum.ethereumMainnet
    const delegate = await GovernanceErc20Helper.getDelegates(memberAddress, tokenAddress, network)
    expect(delegate).to.eq('0xc1d60f584879f024299DA0F19Cdb47B931E35b53')
  })
})
