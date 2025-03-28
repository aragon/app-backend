import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import SubscanApiHelper from '@helpers/subscanApi'
import { expect } from 'chai'
import { ethers } from 'ethers'
import { Models } from '@dbModels'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'

import logger from '@logger'

describe('Manual: Subscan Api', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should get contract from subscan', async () => {
    const address = '0x08633901DdF9cD8e2DC3a073594d0A7DaD6f3f57'
    const network = NetworksEnum.peaqMainnet

    const contract = await SubscanApiHelper.getContractSourceCode(address, network)
    expect(contract).to.be.an('array')
    expect(contract![0]).to.have.property('SourceCode')
  })

  it('should get token details from subscan', async () => {
    const address = '0xf4d9235269a96aadafc9adae454a0618ebe37949'
    const network = NetworksEnum.peaqMainnet

    const tokenDetails = await SubscanApiHelper.getTokenFullDetails(address, network)
    expect(tokenDetails).to.have.property('name')
    expect(tokenDetails).to.have.property('symbol')
    expect(tokenDetails.symbol).to.be.eq('USDT')
  })

  it('should get account balance from subscan', async () => {
    const address = '0x7b8f8799ca7237875be45e2887d2c6ef78765616'
    const network = NetworksEnum.peaqMainnet

    const accountBalance = await SubscanApiHelper.getAccountBalance(address, network)
    expect(accountBalance).to.be.an('array')
  })

  it('should getAssetTransfer from subscan', async () => {
    const address = '0xb3de3b6ac5f8e7b41b834c1509fdd0e56887c9b0'
    const network = NetworksEnum.peaqMainnet

    const assetTransfer = await SubscanApiHelper.getAssetTransfer(address, network)
    expect(assetTransfer).to.be.an('array')
  })

  it('should get the native token', async () => {
    const network = NetworksEnum.peaqMainnet

    const details = await SubscanApiHelper.getNativeTokenInfo(network)
    expect(details).to.have.property('name')
  })

  describe('DaoAssets', () => {
    it('should handle dao assets for peaq', async function () {
      this.timeout(1000000)
      await ProviderModule.connectToAllNetworks()
      const address = ethers.getAddress('0x221e438e4a8fc6569457bae62cbccdb8b5b02a93')

      await DaoAssets.onDocument({
        network: NetworksEnum.peaqMainnet,
        address,
        id: '123',
      } as any)
      const daoAssets = await Models.Asset.find({
        daoAddress: address,
        network: NetworksEnum.peaqMainnet,
      })
      expect(daoAssets).to.be.an('array')
      expect(daoAssets.length).to.be.gt(0)
    })

    it('should handle dao transactions for peaq', async function () {
      this.timeout(1000000)
      await ProviderModule.connectToAllNetworks()
      const address = ethers.getAddress('0x221e438e4a8fc6569457bae62cbccdb8b5b02a93')

      sandbox.stub(Models.Dao, 'findByAddress').resolves({
        network: NetworksEnum.peaqMainnet,
        address,
        id: '123',
      } as any)

      await DaoTransactions.start({
        network: NetworksEnum.peaqMainnet,
        daoAddress: address,
      } as any)
      const daoAssets = await Models.Asset.find({
        daoAddress: address,
        network: NetworksEnum.peaqMainnet,
      })
      expect(daoAssets).to.be.an('array')
      expect(daoAssets.length).to
    })
  })
})
