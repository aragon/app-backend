import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { DaoTvl } from '@services/aragon-rates/daoTvl'
import logger from '@logger'
import { Models } from '@dbModels'
import { ITokenType, NetworksEnum } from '@types'

describe('Rates: DaoTvl', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start and update DaoTvl', async () => {
      const daos = [
        {
          network: NetworksEnum.mainnet,
          transactionHash: '0x0',
          blockNumber: 0,
          address: '0x59447788F9dCf2df550F257F3692a07f05b922D7',
          creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          ens: 'dao.eth',
          name: 'fake-name',
          description: 'fake-description',
          avatar: 'fake-avatar',
        },
      ]
      const tokens = [
        {
          network: NetworksEnum.mainnet,
          type: ITokenType.ERC20,
          address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
          implementationAddress: '0x5D4Aa78B08Bc7C530e21bf7447988b1Be7991322',
          logo: 'https://logos.covalenthq.com/tokens/1/0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9.png',
          name: null,
          symbol: 'AAVE',
          decimals: 18,
          totalSupply: '16000000000000000000000000',
          priceChangeOnDayUsd: '-0.44571999999999434',
          priceUsd: '93.06064',
        },
        {
          network: NetworksEnum.mainnet,
          type: ITokenType.native,
          address: '0x0000000000000000000000000000000000000000',
          implementationAddress: null,
          logo: 'https://www.datocms-assets.com/86369/1669619533-ethereum.png',
          name: null,
          symbol: null,
          decimals: 18,
          totalSupply: '0',
          priceChangeOnDayUsd: '-14.000300000000152',
          priceUsd: '3692.1497',
        },
      ]
      const assets = [
        {
          network: NetworksEnum.mainnet,
          daoAddress: '0x59447788F9dCf2df550F257F3692a07f05b922D7',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          amount: '10000000000002319',
        },
        {
          network: NetworksEnum.mainnet,
          daoAddress: '0x59447788F9dCf2df550F257F3692a07f05b922D7',
          tokenAddress: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
          amount: '120000000000000000000',
        },
      ]

      await Promise.all(daos.map(async dao => Models.Dao.create(dao)))
      await Promise.all(tokens.map(async token => Models.Token.create(token)))
      await Promise.all(assets.map(async asset => Models.Asset.create(asset)))

      const stubLogger = sandbox.stub(logger, 'verbose')

      await DaoTvl.start()

      const rawDao = daos[0]
      const daoDb = await Models.Dao.findExistingLog({
        address: rawDao.address,
        network: rawDao.network,
      })

      expect(stubLogger.calledTwice).to.be.true
      expect(daoDb.tvlUSD).to.eq('11204.20')
    })
  })

  it('should query', () => {
    const pipeline = DaoTvl.query()
    expect(pipeline.length).to.eq(10)
  })
})
