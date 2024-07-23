import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'
import CovalentHelper from '@helpers/covalent'

describe('Manual: Covalent', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should get token price', async () => {
    const zeroAddress = '0x0000000000000000000000000000000000000000'
    const ethereumMainnet = await CovalentHelper.getToken(zeroAddress, NetworksEnum.ethereumMainnet)
    console.log(ethereumMainnet) // 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE

    const polygonMainnet = await CovalentHelper.getToken(zeroAddress, NetworksEnum.polygonMainnet)
    console.log(polygonMainnet) // 0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0

    const arbitrumMainnet = await CovalentHelper.getToken(zeroAddress, NetworksEnum.arbitrumMainnet)
    console.log(arbitrumMainnet) // 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE

    const ethereumSepolia = await CovalentHelper.getToken(zeroAddress, NetworksEnum.ethereumSepolia)
    console.log(ethereumSepolia) // 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE

    const zksyncSepolia = await CovalentHelper.getToken(zeroAddress, NetworksEnum.zksyncSepolia)
    console.log(zksyncSepolia) // 0x0000000000000000000000000000000000000000

    const zksyncMainnet = await CovalentHelper.getToken(zeroAddress, NetworksEnum.zksyncMainnet)
    console.log(zksyncMainnet) // 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
  })
})
