import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { SyncToken } from '@services/dataSync/syncToken'
import { NetworksEnum } from '@types'
import dayjs from '@helpers/dayjs'
import logger from '@logger'
import { Models } from '@dbModels'
import CovalentHelper from '@helpers/covalent'

describe('DataSync: syncToken', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('fetchAll', async () => {
    const token1 = await Models.Token.create({
      address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      network: NetworksEnum.mainnet,
      logo: 'fake-logo',
      name: 'ethereum',
      symbol: 'WETH',
      decimals: 18,
      holders: 10,
      totalSupply: 100,
      priceChangeOnDayUsd: 1,
      priceUsd: '0.1',
      lastUpdatedAt: dayjs.utc().subtract(2, 'days').toDate(),
    })
    const token2 = await Models.Token.create({
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      network: NetworksEnum.mainnet,
      logo: 'fake-logo',
      name: 'ethereum',
      symbol: 'USDC',
      decimals: 6,
      holders: 2,
      totalSupply: 12,
      priceChangeOnDayUsd: 1,
      priceUsd: '1',
      lastUpdatedAt: dayjs.utc().subtract(2, 'days').toDate(),
    })

    const stubUpdateToken = sandbox
      .stub(SyncToken, '_updateToken')
      .onFirstCall()
      .resolves(true)
      .onSecondCall()
      .resolves(true)

    const stubLogger = sandbox.stub(logger, 'verbose')

    await SyncToken.fetchAll()

    expect(stubLogger.callCount).to.eq(2)
    expect(stubUpdateToken.callCount).to.eq(2)
    const args: any = stubUpdateToken.args
    expect(args[0][0].id).to.eq(token1.id)
    expect(args[1][0].id).to.eq(token2.id)
  })

  it('_updateToken', async () => {
    const token = await Models.Token.create({
      address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      network: NetworksEnum.mainnet,
      logo: 'fake-logo',
      name: 'ethereum',
      symbol: 'WETH',
      decimals: 18,
      holders: 10,
      totalSupply: 100,
      priceChangeOnDayUsd: 1,
      priceUsd: '0.1',
      lastUpdatedAt: dayjs.utc().subtract(2, 'days').toDate(),
    })
    const mockCovalentTokenData = {
      logo: 'new-fake-logo',
      name: 'New Ethereum',
      symbol: 'NEWETH',
      decimals: 18,
      holders: 20,
      totalSupply: 200,
      priceChangeOnDayUsd: 2,
      priceUsd: '0.2',
    }

    const stubUpdateToken = sandbox.stub(CovalentHelper, 'getToken').resolves(mockCovalentTokenData)
    const stubLogger = sandbox.stub(logger, 'verbose')

    const updatedToken = await SyncToken._updateToken(token)

    expect(stubUpdateToken.calledOnce).to.be.true
    expect(stubLogger.calledOnce).to.be.true
    expect(stubLogger.calledWith('Token updated' as any)).to.be.true
    expect(updatedToken.holders).to.eq(20)
    expect(updatedToken.totalSupply).to.eq(200)
    expect(updatedToken.priceChangeOnDayUsd).to.eq(2)
    expect(updatedToken.priceUsd).to.eq('0.2')
  })

  it('_onError', async () => {
    const stubLogger = sandbox.stub(logger, 'error')

    SyncToken._onError({ id: 'x' } as any, 'error')
    expect(stubLogger.calledOnce).to.be.true
    expect(stubLogger.calledWith('Error while fetching token' as any)).to.be.true
  })
})
