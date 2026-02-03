import config from '@config'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import ReorgDetector from '@modules/reorgDetector'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { afterEach, beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('Module: ReorgDetector', () => {
  let sandbox: SinonSandbox
  const network = NetworksEnum.ethereumMainnet

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('checkForReorgs', () => {
    it('should detect no reorgs when hashes match', async () => {
      await Models.BlockRecord.bulkUpsert([
        { network, blockNumber: 100, blockHash: '0xhash100' },
        { network, blockNumber: 101, blockHash: '0xhash101' },
      ])

      sandbox
        .stub(Web3Helper, 'getBlock')
        .withArgs(100, network)
        .resolves({ number: 100, hash: '0xhash100' } as any)
        .withArgs(101, network)
        .resolves({ number: 101, hash: '0xhash101' } as any)

      const result = await ReorgDetector.checkForReorgs(network, 100, 101)
      expect(result.reorgedBlocks).to.have.lengthOf(0)
      expect(result.unchangedBlocks).to.have.lengthOf(2)
      expect(result.newBlocks).to.have.lengthOf(0)
    })

    it('should detect reorg when hash mismatches', async () => {
      await Models.BlockRecord.bulkUpsert([{ network, blockNumber: 100, blockHash: '0xoldHash' }])

      sandbox
        .stub(Web3Helper, 'getBlock')
        .withArgs(100, network)
        .resolves({ number: 100, hash: '0xnewHash' } as any)

      const result = await ReorgDetector.checkForReorgs(network, 100, 100)
      expect(result.reorgedBlocks).to.have.lengthOf(1)
      expect(result.reorgedBlocks[0].storedHash).to.eq('0xoldHash')
      expect(result.reorgedBlocks[0].finalizedHash).to.eq('0xnewHash')
      expect(result.unchangedBlocks).to.have.lengthOf(0)
    })

    it('should identify new blocks when no BlockRecord exists', async () => {
      // No BlockRecord for block 100
      const result = await ReorgDetector.checkForReorgs(network, 100, 100)
      expect(result.newBlocks).to.have.lengthOf(1)
      expect(result.newBlocks[0]).to.eq(100)
      expect(result.reorgedBlocks).to.have.lengthOf(0)
    })

    it('should handle mixed scenario', async () => {
      await Models.BlockRecord.bulkUpsert([
        { network, blockNumber: 100, blockHash: '0xhash100' },
        { network, blockNumber: 102, blockHash: '0xoldHash' },
      ])

      sandbox
        .stub(Web3Helper, 'getBlock')
        .withArgs(100, network)
        .resolves({ number: 100, hash: '0xhash100' } as any)
        .withArgs(102, network)
        .resolves({ number: 102, hash: '0xnewHash' } as any)

      const result = await ReorgDetector.checkForReorgs(network, 100, 102)
      expect(result.unchangedBlocks).to.have.lengthOf(1) // block 100
      expect(result.newBlocks).to.have.lengthOf(1) // block 101
      expect(result.reorgedBlocks).to.have.lengthOf(1) // block 102
    })

    it('should handle getBlock returning null', async () => {
      await Models.BlockRecord.bulkUpsert([{ network, blockNumber: 100, blockHash: '0xhash100' }])

      sandbox.stub(Web3Helper, 'getBlock').resolves(null)

      const result = await ReorgDetector.checkForReorgs(network, 100, 100)
      expect(result.reorgedBlocks).to.have.lengthOf(0)
      expect(result.unchangedBlocks).to.have.lengthOf(0)
      expect(result.newBlocks).to.have.lengthOf(0)
    })
  })

  describe('getLastFinalizedBlock', () => {
    it('should return finalized block number', async () => {
      sandbox.stub(Web3Helper, 'getBlockByTag').resolves({ number: 500 } as any)

      const result = await ReorgDetector.getLastFinalizedBlock(network)
      expect(result).to.eq(500)
    })

    it('should return null when block fetch fails', async () => {
      sandbox.stub(Web3Helper, 'getBlockByTag').resolves(null)

      const result = await ReorgDetector.getLastFinalizedBlock(network)
      expect(result).to.be.null
    })
  })

  describe('getBlockRangeForCheck', () => {
    it('should calculate correct block range', () => {
      const result = ReorgDetector.getBlockRangeForCheck(1000, 800)
      const reorgDepth = config.SERVICES.ARAGON_REORGS.REORG_DEPTH
      const batchSize = config.SERVICES.ARAGON_REORGS.BATCH_SIZE

      expect(result.fromBlock).to.eq(Math.max(801, 1000 - reorgDepth))
      expect(result.toBlock).to.be.lte(result.fromBlock + batchSize - 1)
      expect(result.toBlock).to.be.lte(1000)
    })

    it('should not exceed finalized block', () => {
      const result = ReorgDetector.getBlockRangeForCheck(100, 99)
      expect(result.toBlock).to.be.lte(100)
    })
  })

  describe('updateBlockRecordHashes', () => {
    it('should update block record hashes', async () => {
      await Models.BlockRecord.create({ network, blockNumber: 100, blockHash: '0xold' })

      await ReorgDetector.updateBlockRecordHashes(network, [{ blockNumber: 100, blockHash: '0xnew' }])

      const record = await Models.BlockRecord.findByBlockNumber(network, 100)
      expect(record!.blockHash).to.eq('0xnew')
    })
  })
})
