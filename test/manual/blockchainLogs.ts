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
import {ProposalHandler} from "@indexer/handlers/proposalHandler";
import {TokenVoting} from "@artifacts/TokenVoting";

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

  it('getLogs StagesUpdated', async () => {
    await ProviderModule.connectToAllNetworks()

    const network = NetworksEnum.ethereumSepolia
    const provider = ProviderModule.getProvider(network)!

    const sppTopics = TokenVoting.abi
      .filter((item: any) => item.type && ['ProposalCreated'].includes(item.name))
      .map((event: any) => new Interface(TokenVoting.abi).getEvent(event.name)?.topicHash)

    const logs = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(network)!.schedule(async () =>
        provider.getLogs({
          address: '0x487fb7ADE20923FA31767cbb2d84D4E5bfe507d0',
          fromBlock: 6678518,
          toBlock: 6678519,
          topics: [...sppTopics],
        }),
      ),
    )

    for (const txLog of logs) {
      const iFace = new Interface(TokenVoting.abi)
      const event = Web3Helper.parseLog(txLog, iFace) as LogDescription
      const info = Web3Helper.parseInfoLog(txLog, event.name, network)
      await ProposalHandler.proposalCreated(event, info)
      console.log('done', txLog)
    }
  })
})
