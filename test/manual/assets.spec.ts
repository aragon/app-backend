import { Models } from '@dbModels'
import ProviderModule from '@modules/provider'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { NetworksEnum } from '@types'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Manual: Assets', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle reconnection during a loop', async function () {
    this.timeout(1600000) // Increase timeout for the test

    await ProviderModule.connectToAllNetworks()

    const daoAddress = '0x55da37AF02c4e7e0Ce01964A68692f7e32575eFA'
    const network = NetworksEnum.ethereumMainnet

    await DaoAssets.assets({ address: daoAddress, network: network } as any)

    const assets = await Models.Asset.find({ daoAddress, network })
    console.log(assets.map(w => ({ address: w.tokenAddress, amount: w.amount, usd: w.amountUsd })))
    console.log(assets.map(w => ({ address: w.tokenAddress, amount: w.amount, usd: w.amountUsd })))
  })
})
