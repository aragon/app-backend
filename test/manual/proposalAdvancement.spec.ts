import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { Models } from '@dbModels'
import { RabbitMQHelper } from '@helpers/radditMQ'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { TokenVoting } from '@artifacts/TokenVoting'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { ProposalHandler } from '@handlers/proposalHandler'
import Web3Helper from '@helpers/web3'

describe('Manual: Proposal Advancement', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })
  async function prepareData() {
    const plugins = [
      {
        id: 'ethereum-sepolia-0xf6cd83d77130dd74aaf93ea6cdc65e08340129dab3d9aacf13b1b21d494b6201-0xFc4f542f30436e1B3C8C849487f148208c456133',
        transactionHash: '0xf6cd83d77130dd74aaf93ea6cdc65e08340129dab3d9aacf13b1b21d494b6201',
        blockNumber: 7304345,
        blockTimestamp: 1734524040,
        network: 'ethereum-sepolia',
        address: '0xFc4f542f30436e1B3C8C849487f148208c456133',
        implementationAddress: '0xBa420350B53d2f3e58BF1D0b41Cec7261f87A33d',
        interfaceType: 'tokenVoting',
        status: 'installed',
        isSupported: true,
        daoAddress: '0xFcD5429791a4d934F224D851edB816CA8337224E',
        tokenAddress: '0x0B0E0C2e07324fD29E9b21D48aF43C9a30f4C5DA',
        pluginSetupRepoAddress: '0x6241ad0D3f162028d2e0000f1A878DBc4F5c4aD0',
        sender: '0xFcD5429791a4d934F224D851edB816CA8337224E',
        release: '1',
        build: '5',
        subdomain: 'token-voting',
        permissions: [],
        uninstalled: {
          status: false,
          transactionHash: null,
          blockNumber: null,
          blockTimestamp: null,
        },
        isProcess: true,
        isBody: true,
        isSubPlugin: true,
        metadataIpfs: 'ipfs://QmctqqHHgnhge8edjfVWhCE6bzFFrywJPwYXZ8QKvBfqhh',
        name: 'Token Voting One',
        description: '',
        processKey: null,
        subPlugins: [],
        links: [],
        parentPlugin: '0x73e311c61D74CAbF874C9704a0Fe92c68fd65eDb',
        stageIndex: 0,
      },
      {
        id: 'ethereum-sepolia-0xf6cd83d77130dd74aaf93ea6cdc65e08340129dab3d9aacf13b1b21d494b6201-0x73e311c61D74CAbF874C9704a0Fe92c68fd65eDb',
        transactionHash: '0xf6cd83d77130dd74aaf93ea6cdc65e08340129dab3d9aacf13b1b21d494b6201',
        blockNumber: 7304345,
        blockTimestamp: 1734524040,
        network: 'ethereum-sepolia',
        address: '0x73e311c61D74CAbF874C9704a0Fe92c68fd65eDb',
        implementationAddress: '0x4cCA57aC117Ae35bd0222f8dE52fc4f9c88eBa6f',
        interfaceType: 'spp',
        status: 'installed',
        isSupported: true,
        daoAddress: '0xFcD5429791a4d934F224D851edB816CA8337224E',
        tokenAddress: null,
        pluginSetupRepoAddress: '0xE67b8E026d190876704292442A38163Ce6945d6b',
        sender: '0xFcD5429791a4d934F224D851edB816CA8337224E',
        release: '1',
        build: '8',
        subdomain: 'spp',
        permissions: [],
        uninstalled: {
          status: false,
          transactionHash: null,
          blockNumber: null,
          blockTimestamp: null,
        },
        isProcess: true,
        isBody: false,
        isSubPlugin: false,
        metadataIpfs: 'ipfs://QmWRp4oErcxvzbZiNMYieso2LC51Losn8uxfLg5jZyo9Bb',
        name: 'MultiBody Trial',
        description: '',
        processKey: 'MT',
        subPlugins: [
          {
            addresses: ['0xFc4f542f30436e1B3C8C849487f148208c456133', '0x0918bea91Ec59374631F4E4278C3c92837EC3d39'],
            stageIndex: 0,
          },
          {
            addresses: ['0x45B3F282db2321e83aef02981bb31957Bf354FCb'],
            stageIndex: 1,
          },
          {
            addresses: ['0xF26f304d0A28970a1A0ddE0bEeC60254cF5A7D20'],
            stageIndex: 2,
          },
        ],
        links: [],
        totalStages: 3,
      },
      {
        id: 'ethereum-sepolia-0xf6cd83d77130dd74aaf93ea6cdc65e08340129dab3d9aacf13b1b21d494b6201-0x0918bea91Ec59374631F4E4278C3c92837EC3d39',
        transactionHash: '0xf6cd83d77130dd74aaf93ea6cdc65e08340129dab3d9aacf13b1b21d494b6201',
        blockNumber: 7304345,
        blockTimestamp: 1734524040,
        network: 'ethereum-sepolia',
        address: '0x0918bea91Ec59374631F4E4278C3c92837EC3d39',
        implementationAddress: '0xBa420350B53d2f3e58BF1D0b41Cec7261f87A33d',
        interfaceType: 'tokenVoting',
        status: 'installed',
        isSupported: true,
        daoAddress: '0xFcD5429791a4d934F224D851edB816CA8337224E',
        tokenAddress: '0x0B0E0C2e07324fD29E9b21D48aF43C9a30f4C5DA',
        pluginSetupRepoAddress: '0x6241ad0D3f162028d2e0000f1A878DBc4F5c4aD0',
        sender: '0xFcD5429791a4d934F224D851edB816CA8337224E',
        release: '1',
        build: '5',
        subdomain: 'token-voting',
        permissions: [],
        uninstalled: {
          status: false,
          transactionHash: null,
          blockNumber: null,
          blockTimestamp: null,
        },
        isProcess: true,
        isBody: true,
        isSubPlugin: true,
        metadataIpfs: 'ipfs://QmP8YP9VyJ4XG6hjr3Stu1zjFTkTirkbdGfFUjyCGb2JMr',
        name: 'Token Voting Two',
        description: '',
        processKey: null,
        subPlugins: [],
        links: [],
        parentPlugin: '0x73e311c61D74CAbF874C9704a0Fe92c68fd65eDb',
        stageIndex: 0,
      },
      {
        id: 'ethereum-sepolia-0xf6cd83d77130dd74aaf93ea6cdc65e08340129dab3d9aacf13b1b21d494b6201-0x45B3F282db2321e83aef02981bb31957Bf354FCb',
        transactionHash: '0xf6cd83d77130dd74aaf93ea6cdc65e08340129dab3d9aacf13b1b21d494b6201',
        blockNumber: 7304345,
        blockTimestamp: 1734524040,
        network: 'ethereum-sepolia',
        address: '0x45B3F282db2321e83aef02981bb31957Bf354FCb',
        implementationAddress: '0xBa420350B53d2f3e58BF1D0b41Cec7261f87A33d',
        interfaceType: 'tokenVoting',
        status: 'installed',
        isSupported: true,
        daoAddress: '0xFcD5429791a4d934F224D851edB816CA8337224E',
        tokenAddress: '0x0B0E0C2e07324fD29E9b21D48aF43C9a30f4C5DA',
        pluginSetupRepoAddress: '0x6241ad0D3f162028d2e0000f1A878DBc4F5c4aD0',
        sender: '0xFcD5429791a4d934F224D851edB816CA8337224E',
        release: '1',
        build: '5',
        subdomain: 'token-voting',
        permissions: [],
        uninstalled: {
          status: false,
          transactionHash: null,
          blockNumber: null,
          blockTimestamp: null,
        },
        isProcess: true,
        isBody: true,
        isSubPlugin: true,
        metadataIpfs: 'ipfs://Qmd8j7x7fGXp4Htdhka96ZzdNJ8NkM9AusDrBjHu5UTCq3',
        name: 'Token Voting Three',
        description: '',
        processKey: null,
        subPlugins: [],
        links: [],
        parentPlugin: '0x73e311c61D74CAbF874C9704a0Fe92c68fd65eDb',
        stageIndex: 1,
      },
    ]

    await Promise.all(plugins.map(async plugin => await Models.Plugin.create(plugin)))
  }

  it('should handle the proposal creation and advancement', async function () {
    this.timeout(10000000)
    await ProviderModule.connectToAllNetworks()

    await prepareData()

    const firstTxHash = '0x10fe67c0f747b90452567212f59d4e1f4c48fad7e0ac350de81aa23e1e4787fe'
    const secondTxHash = '0xd4b6ca3c9b7e0dd23f7633dc80073a7c40815dd20bf1e12c4da46d5eb4188e7e'

    const firstProposalEvent = await UnitDepUtils.getData(
      TokenVoting.abi,
      'ProposalCreated',
      firstTxHash,
      NetworksEnum.ethereumSepolia,
    )

    sandbox.stub(ProposalHandler, 'fetchProposalMetadata')

    expect(firstProposalEvent).to.be.not.null

    for (const event of firstProposalEvent) {
      await ProposalHandler.proposalCreated(event.event, event.logInfo)
    }

    const totalProposals = await Models.Proposal.find({}).countDocuments()
    expect(totalProposals).to.be.eq(3)

    const sendTxReceipts = await Web3Helper.getTransactionReceipt(secondTxHash, NetworksEnum.ethereumSepolia)

    const secondEventData = await UnitDepUtils.parseLogsByConfig(
      sendTxReceipts?.logs as any,
      NetworksEnum.ethereumSepolia,
    )

    expect(secondEventData).to.be.not.null

    for (const event of secondEventData) {
      await event.handler(event.event, event.info)
    }

    expect(await Models.Proposal.find({}).countDocuments()).to.be.eq(4)
    const executedProposals = await Models.Proposal.find({ 'executed.status': true }).countDocuments()
    expect(executedProposals).to.be.eq(2)
  })
})
