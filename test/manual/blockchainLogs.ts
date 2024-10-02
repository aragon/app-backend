import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'
import BottleneckModule from '@modules/bottleneck'
import { retryRequest } from '@helpers/retryRequest'
import ProviderModule from '@modules/provider'
import { PluginSettingHandler } from '@indexer/handlers/pluginSettingHandler'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { Interface, type LogDescription } from 'ethers'
import Web3Helper from '@helpers/web3'

describe('Manual: BlockchainLogs', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('getLogs StagesUpdated', async () => {
    await ProviderModule.connectToAllNetworks()

    const network = NetworksEnum.ethereumSepolia
    const provider = ProviderModule.getProvider(network)!

    const sppTopics = StagedProposalProcessor.abi
      .filter((item: any) => item.type && ['StagesUpdated'].includes(item.name))
      .map((event: any) => new Interface(StagedProposalProcessor.abi).getEvent(event.name)?.topicHash)

    const logs = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(network)!.schedule(async () =>
        provider.getLogs({
          fromBlock: 6678517,
          topics: [...sppTopics],
        }),
      ),
    )

    for (const txLog of logs) {
      const iFace = new Interface(StagedProposalProcessor.abi)
      const event = Web3Helper.parseLog(txLog, iFace) as LogDescription
      const info = Web3Helper.parseInfoLog(txLog, event.name, network)
      await PluginSettingHandler.sppSettingsUpdated(event, info)
      console.log('done', txLog)
    }
  })
})
