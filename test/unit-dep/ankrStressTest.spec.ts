import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3BatchHelper from '@src/helpers/web3BatchHelper'
import { NetworksEnum } from '@src/types'
import logger from '@logger'
import TokenUtils from '@helpers/tokenUtils'

describe.only('Stress Test: Ankr Account Balances Batch', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should process large batches of wallet addresses', async function () {
    this.timeout(300000) // 5 minutes
    const daoUrl = 'https://dev.backend.aragon.in/daos?networks=ethereum-mainnet&pageSize=10'
    const result = await fetch(daoUrl)

    if (!result.ok) {
      throw new Error(`Failed to fetch DAOs: ${result.statusText}`)
    }

    const daos = (await result.json()).data.map((dao: any) => dao.address)

    const startTime = Date.now()

    const balances = await Web3BatchHelper.getAnkrAccountBalancesInBatch(daos, NetworksEnum.ethereumMainnet)

    const endTime = Date.now()

    console.log(JSON.stringify(balances, null, 2))

    logger.info('Processed', {
      count: balances.length,
      duration: `${(endTime - startTime) / 1000} seconds`,
    })
  })

  it.only('testing if the ankr returns the gov token or not', async function () {
    const network = NetworksEnum.polygonMainnet
    const address = '0x0762b99d6afDAce71f7745cAa603d88F177E994F'

    const result = await Web3BatchHelper.getAnkrAccountBalancesInBatch([address], network)

    const assets = result[address].assets

    const safeTokens = assets.filter(asset => !TokenUtils.analyzeIfScamToken(asset.tokenName, asset.tokenSymbol))
    logger.info('Safe tokens', {
      dao: address,
      count: safeTokens.length,
      tokens: safeTokens.map(t => ({
        name: t.tokenName,
        symbol: t.tokenSymbol,
        balanceUsd: t.balanceUsd,
        amount: t.balance,
        logo: t.thumbnail,
      })),
    })
  })
})
