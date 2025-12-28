import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { TokenVoting } from '@artifacts/TokenVoting'
import { Models } from '@dbModels'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import { ProposalHandler } from '@handlers/proposalHandler'
import { retryRequest } from '@helpers/retryRequest'
import Web3Utils from '@helpers/web3Utils'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { ProxyToken } from '@modules/proxyToken'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import { IConnectionType, IProviderType, NetworksEnum } from '@types'
import { Interface, type LogDescription } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Manual: BlockchainLogs', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('BlockchainLogs LogTokenVoting', async () => {
    await ProviderModule.connectToAllNetworks()

    const doc = {
      id: 'polygon-mainnet-0x2d701c46ba375af10fcd08d40d8776442f2b70d1f0d31adf60b7abf861d9536f-0xea817f210A3Bf9B6B9266aFb1cdf5dC534dD96Be',
      transactionHash: '0x2d701c46ba375af10fcd08d40d8776442f2b70d1f0d31adf60b7abf861d9536f',
      blockNumber: 50276912,
      blockTimestamp: 1700709936,
      network: 'polygon-mainnet',
      address: '0xea817f210A3Bf9B6B9266aFb1cdf5dC534dD96Be',
      implementationAddress: '0x3Ce7C13D183eB46E4Dd5828710954aa92D3086b1',
      interfaceType: 'tokenVoting',
      status: 'installed',
      isSupported: true,
      daoAddress: '0xaFe8123417B112B352B356F0eA50becC471Ed853',
      tokenAddress: '0x46122a25470728244fB45Fe3955F965e6ccf8fB8',
      pluginSetupRepoAddress: '0xae67aea0B830ed4504B36670B5Fa70c5C386Bb58',
      sender: '0x51Ead12DEcD31ea75e1046EdFAda14dd639789b8',
      release: '1',
      build: '1',
      subdomain: 'token-voting',
      permissions: [
        {
          where: '0xea817f210A3Bf9B6B9266aFb1cdf5dC534dD96Be',
          who: '0xaFe8123417B112B352B356F0eA50becC471Ed853',
          condition: '0x0000000000000000000000000000000000000000',
          permissionId: '0xbba35d41610b7d25c8e486006535c76bd423091563e694d206ae3d71ce949fe5',
        },
        {
          where: '0xea817f210A3Bf9B6B9266aFb1cdf5dC534dD96Be',
          who: '0xaFe8123417B112B352B356F0eA50becC471Ed853',
          condition: '0x0000000000000000000000000000000000000000',
          permissionId: '0x821b6e3a557148015a918c89e5d092e878a69854a2d1a410635f771bd5a8a3f5',
        },
        {
          where: '0xaFe8123417B112B352B356F0eA50becC471Ed853',
          who: '0xea817f210A3Bf9B6B9266aFb1cdf5dC534dD96Be',
          condition: '0x0000000000000000000000000000000000000000',
          permissionId: '0xbf04b4486c9663d805744005c3da000eda93de6e3308a4a7a812eb565327b78d',
        },
        {
          where: '0x46122a25470728244fB45Fe3955F965e6ccf8fB8',
          who: '0xaFe8123417B112B352B356F0eA50becC471Ed853',
          condition: '0x0000000000000000000000000000000000000000',
          permissionId: '0xb737b436e6cc542520cb79ec04245c720c38eebfa56d9e2d99b043979db20e4c',
        },
      ],
      uninstalled: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      isProcess: true,
      isBody: true,
      isSubPlugin: false,
      metadataIpfs: null,
      name: null,
      description: null,
      processKey: null,
      subPlugins: [],
      links: [],
    }

    const plugin = await Models.Plugin.create(doc)
    const token = await ProxyToken.saveAndGetToken(plugin.tokenAddress, plugin.network)

    await LogTokenVoting.start(plugin, token!)
  })

  it('getLogs StagesUpdated', async () => {
    await ProviderModule.connectToAllNetworks()

    const network = NetworksEnum.ethereumSepolia
    const provider = ProviderModule.getProvider(network, IProviderType.ARAGON, IConnectionType.RPC)

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
      const event = Web3Utils.parseLog(txLog, iFace) as LogDescription
      const info = Web3Utils.parseInfoLog(txLog, event.name, network)
      await PluginSettingHandler.sppSettingsUpdated(event, info)
      console.log('done', txLog)
    }
  })

  it('getLogs StagesUpdated', async () => {
    await ProviderModule.connectToAllNetworks()

    const network = NetworksEnum.ethereumSepolia
    const provider = ProviderModule.getProvider(network, IProviderType.ARAGON, IConnectionType.RPC)

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
      const event = Web3Utils.parseLog(txLog, iFace) as LogDescription
      const info = Web3Utils.parseInfoLog(txLog, event.name, network)
      await ProposalHandler.proposalCreated(event, info)
      console.log('done', txLog)
    }
  })
})
