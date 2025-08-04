import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'
import {
  IClockMode,
  IGovernanceErc20Logs,
  type IIndexerConfig,
  IPluginInterfaceType,
  IPluginStatus, ITokenType,
  NetworksEnum,
} from '@types'
import { ProxyToken } from '@modules/proxyToken'

import { PluginList } from '@test/mock/fakePlugins'
import { Models } from '@dbModels'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import ConfigIndexerHelper from '@helpers/configIndexer'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import configIndexer from '@indexer/configIndexer'
import { type Log } from 'ethers'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import logger from '@logger'
import { FakeToken } from '@test/mock/fakeToken'

describe.only('Batch Request', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('usage of delegation events', async function () {
    this.timeout(10000000)
    const tokenAddress = '0x4200000000000000000000000000000000000042'
    const network = NetworksEnum.optimismMainnet
    const fakePlugin = {
      ...PluginList[0],
      tokenAddress,
      status: IPluginStatus.installed,
      interfaceType: IPluginInterfaceType.tokenVoting,
      network,
      address: '0x6Adb3baB5730852eB53987EA89D8e8f16393C200',
    }
    const plugin = await Models.Plugin.create(fakePlugin)
    const token = await Models.Token.create({
      ...FakeToken,
      address: tokenAddress,
      network,
      type: ITokenType.ERC20,
      blockNumber: 6490467,
      clockMode: IClockMode.BlockNumber
    })


    const configGovLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IGovernanceErc20Logs).includes(item.event as any),
    )
    logger.info('starting to crawl')
    const tokenCrawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: [...configGovLogs],
      address: [plugin.tokenAddress],
      fromBlock: token?.blockNumber || plugin?.blockNumber,
      onError: async (error: any, log: any) => LogTokenVoting.processError(error, plugin, log),
      logService: ConfigIndexerHelper.builders.token(token!.type, token!.network, token!.address),
      stopOnError: true,
      skipLogProcessing: true,
      filterLogs: async (logs: Log[]) => {
        await GovernanceErc20Handler.processBatchDelegateVotesChanged(tokenAddress, plugin.network, logs)
      },
    })

    await tokenCrawler.crawl()
  })
})
