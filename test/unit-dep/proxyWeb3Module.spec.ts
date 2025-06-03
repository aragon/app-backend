import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { expect } from 'chai'

describe('ProxyWeb3:Module', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('daoAssets', () => {
    it('should fetch daoAssets of a given network', async function () {
      this.timeout(10000000)

      const dao = {
        id: '1',
        address: '0xD7798C9587c2c82c1829d88cd3e3DB2D8e0805bF',
        network: NetworksEnum.peaqMainnet,
        blockNumber: 1212,
      } as any

      sandbox.stub(Models.Dao, 'findByAddress').resolves(dao)

      await DaoTransactions.start(dao)

      const assets = await Models.Asset.find({
        daoAddress: dao.address,
        network: dao.network,
      })

      console.log('assets', assets)
    })

    it('should fetch the historical price by symbol or network/address', async function () {
      this.timeout(10000000)

      const symbol = 'ETH'
      const timeStamp = 1748271727

      const historicalPrice = await ProxyWeb3Provider.fetchHistoricalTokenPrice({
        symbol,
        date: timeStamp,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(historicalPrice).to.be.not.null
      expect(historicalPrice).to.not.eq('0')
    })
  })
})
