import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import { Interface } from 'ethers'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { isContractAddressInBloom, isTopicInBloom } from 'ethereum-bloom-filters'

describe('Manual: BlockchainLogs', () => {
  it.skip('should check if address and topic are in bloom filter', async () => {
    await ProviderModule.connectToAllNetworks()

    const network = NetworksEnum.ethereumSepolia

    const address = '0x104e8e245b97B82DD0413D20Eb631CF6f883E3D2'

    const provider = ProviderModule.providerProxies[network].provider

    const coreProvider = await provider.config.getProvider()

    const blockDetails = await Promise.allSettled(
      [6923547, 6923548, 6923549, 6923550, 6923551, 7157001].map(blockNumber =>
        coreProvider._send('eth_getBlockByNumber', ['0x' + blockNumber.toString(16), false], 'getBlockByNumber', true),
      ),
    )

    const logsToSearch = new Interface(StagedProposalProcessor.abi).getEvent('StagesUpdated')?.topicHash!

    const blocks = blockDetails
      .map((block: any) => ({ number: Number(block.value.number), logsBloom: block.value.logsBloom }))
      .filter((block: any) => {
        const logBloom = block.logsBloom
        if (!logBloom) return

        if (isTopicInBloom(logBloom, logsToSearch)) {
          if (isContractAddressInBloom(logBloom, address)) {
            return block
          }
        }
      })

    for (const block of blocks) {
      console.log(`Found Logs In number: ${block.number}`)
    }
  })
})
