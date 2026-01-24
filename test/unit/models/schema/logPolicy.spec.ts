import { Models } from '@dbModels'
import LogPolicy from '@models/schema/logPolicy'
import { IEventLogPolicyType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: LogPolicy', () => {
  let sandbox: SinonSandbox
  let rawLogPolicy: Partial<LogPolicy>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawLogPolicy = {
      event: IEventLogPolicyType.DrainBalanceSourceDeployed,
      transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      transactionIndex: 5,
      logIndex: 10,
      blockNumber: 1000000,
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      network: NetworksEnum.ethereumMainnet,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('create', () => {
    it('Should create LogPolicy with auto-generated id', async () => {
      const createdLog = await Models.LogPolicy.create(rawLogPolicy)

      expect(createdLog.id).to.exist
      expect(createdLog.id).to.eq(
        `${rawLogPolicy.network}-${rawLogPolicy.transactionHash}-${rawLogPolicy.transactionIndex}-${rawLogPolicy.logIndex}-${rawLogPolicy.event}`,
      )
      expect(createdLog.event).to.eq(rawLogPolicy.event)
      expect(createdLog.transactionHash).to.eq(rawLogPolicy.transactionHash)
      expect(createdLog.transactionIndex).to.eq(rawLogPolicy.transactionIndex)
      expect(createdLog.logIndex).to.eq(rawLogPolicy.logIndex)
      expect(createdLog.blockNumber).to.eq(rawLogPolicy.blockNumber)
      expect(createdLog.address).to.eq(rawLogPolicy.address)
      expect(createdLog.network).to.eq(rawLogPolicy.network)
    })

    it('Should create LogPolicy with provided id', async () => {
      const customId = 'custom-log-policy-id'
      const logWithId = { ...rawLogPolicy, id: customId }

      const createdLog = await Models.LogPolicy.create(logWithId)

      expect(createdLog.id).to.eq(customId)
    })

    it('Should throw error when network is missing', async () => {
      const invalidLog = { ...rawLogPolicy, network: undefined }

      await expect(Models.LogPolicy.create(invalidLog)).to.be.rejectedWith('network is required')
    })

    it('Should throw error when transactionHash is missing', async () => {
      const invalidLog = { ...rawLogPolicy, transactionHash: undefined }

      await expect(Models.LogPolicy.create(invalidLog)).to.be.rejectedWith('transactionHash is required')
    })

    it('Should throw error when transactionIndex is missing', async () => {
      const invalidLog = { ...rawLogPolicy, transactionIndex: undefined }

      await expect(Models.LogPolicy.create(invalidLog)).to.be.rejectedWith('transactionIndex is required')
    })

    it('Should throw error when logIndex is missing', async () => {
      const invalidLog = { ...rawLogPolicy, logIndex: undefined }

      await expect(Models.LogPolicy.create(invalidLog)).to.be.rejectedWith('logIndex is required')
    })

    it('Should throw error when event is missing', async () => {
      const invalidLog = { ...rawLogPolicy, event: undefined }

      await expect(Models.LogPolicy.create(invalidLog)).to.be.rejectedWith('event is required')
    })
  })

  describe('getEntityId', () => {
    it('Should generate correct entity id', () => {
      const entityId = Models.LogPolicy.getEntityId({
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xabc',
        transactionIndex: 1,
        logIndex: 2,
        event: IEventLogPolicyType.DrainBalanceSourceDeployed,
      })

      expect(entityId).to.eq(
        `${NetworksEnum.ethereumMainnet}-0xabc-1-2-${IEventLogPolicyType.DrainBalanceSourceDeployed}`,
      )
    })
  })

  describe('findExistingLog', () => {
    it('Should find existing log by params', async () => {
      const createdLog = await Models.LogPolicy.create(rawLogPolicy)

      const foundLog = await Models.LogPolicy.findExistingLog({
        network: rawLogPolicy.network!,
        transactionHash: rawLogPolicy.transactionHash!,
        transactionIndex: rawLogPolicy.transactionIndex!,
        logIndex: rawLogPolicy.logIndex!,
        event: rawLogPolicy.event!,
      })

      expect(foundLog?.id).to.eq(createdLog.id)
    })

    it('Should return null when log not found', async () => {
      const foundLog = await Models.LogPolicy.findExistingLog({
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xnonexistent',
        transactionIndex: 0,
        logIndex: 0,
        event: IEventLogPolicyType.DrainBalanceSourceDeployed,
      })

      expect(foundLog).to.be.null
    })
  })

  describe('findByEntityId', () => {
    it('Should find log by entity id', async () => {
      const createdLog = await Models.LogPolicy.create(rawLogPolicy)

      const foundLog = await Models.LogPolicy.findByEntityId(createdLog.id)

      expect(foundLog?.id).to.eq(createdLog.id)
    })

    it('Should return null when entity id not found', async () => {
      const foundLog = await Models.LogPolicy.findByEntityId('nonexistent-id')

      expect(foundLog).to.be.null
    })
  })

  describe('findByAddress', () => {
    it('Should find log by address and network', async () => {
      const createdLog = await Models.LogPolicy.create(rawLogPolicy)

      const foundLog = await Models.LogPolicy.findByAddress(rawLogPolicy.address!, rawLogPolicy.network!)

      expect(foundLog?.id).to.eq(createdLog.id)
    })

    it('Should return null when address not found', async () => {
      const foundLog = await Models.LogPolicy.findByAddress(
        '0x0000000000000000000000000000000000000000',
        NetworksEnum.ethereumMainnet,
      )

      expect(foundLog).to.be.null
    })
  })

  describe('findLatestByNetwork', () => {
    it('Should find latest log by network sorted by blockNumber', async () => {
      const log1 = { ...rawLogPolicy, blockNumber: 1000, logIndex: 1 }
      const log2 = { ...rawLogPolicy, blockNumber: 2000, logIndex: 2 }
      const log3 = { ...rawLogPolicy, blockNumber: 1500, logIndex: 3 }

      await Models.LogPolicy.create(log1)
      await Models.LogPolicy.create(log2)
      await Models.LogPolicy.create(log3)

      const latestLog = await Models.LogPolicy.findLatestByNetwork(rawLogPolicy.network!)

      expect(latestLog?.blockNumber).to.eq(2000)
    })

    it('Should return null when no logs for network', async () => {
      const latestLog = await Models.LogPolicy.findLatestByNetwork(NetworksEnum.polygonMainnet)

      expect(latestLog).to.be.null
    })
  })

  describe('findByEvent', () => {
    it('Should find logs by event type and network', async () => {
      const log1 = { ...rawLogPolicy, logIndex: 1, event: IEventLogPolicyType.DrainBalanceSourceDeployed }
      const log2 = { ...rawLogPolicy, logIndex: 2, event: IEventLogPolicyType.DrainBalanceSourceDeployed }
      const log3 = { ...rawLogPolicy, logIndex: 3, event: IEventLogPolicyType.RatioModelDeployed }

      await Models.LogPolicy.create(log1)
      await Models.LogPolicy.create(log2)
      await Models.LogPolicy.create(log3)

      const logs = await Models.LogPolicy.findByEvent(
        IEventLogPolicyType.DrainBalanceSourceDeployed,
        rawLogPolicy.network!,
      )

      expect(logs.length).to.eq(2)
      logs.forEach(log => {
        expect(log.event).to.eq(IEventLogPolicyType.DrainBalanceSourceDeployed)
      })
    })

    it('Should return empty array when no logs for event type', async () => {
      const logs = await Models.LogPolicy.findByEvent(
        IEventLogPolicyType.RatioModelDeployed,
        NetworksEnum.polygonMainnet,
      )

      expect(logs).to.be.an('array').that.is.empty
    })
  })

  describe('update', () => {
    it('Should update log fields', async () => {
      const createdLog = await Models.LogPolicy.create(rawLogPolicy)
      const newBlockNumber = 2000000

      await createdLog.update({ blockNumber: newBlockNumber })

      expect(createdLog.blockNumber).to.eq(newBlockNumber)
    })

    it('Should not update required field with falsy value', async () => {
      const createdLog = await Models.LogPolicy.create(rawLogPolicy)
      const originalNetwork = createdLog.network

      await createdLog.update({ network: null as any })

      expect(createdLog.network).to.eq(originalNetwork)
    })

    it('Should skip update when field does not exist in schema', async () => {
      const createdLog = await Models.LogPolicy.create(rawLogPolicy)

      await createdLog.update({ nonExistentField: 'some value' } as any)

      expect(createdLog).to.exist
    })

    it('Should not update field when value is equal', async () => {
      const createdLog = await Models.LogPolicy.create(rawLogPolicy)

      await createdLog.update({ blockNumber: rawLogPolicy.blockNumber })

      expect(createdLog.blockNumber).to.eq(rawLogPolicy.blockNumber)
    })
  })

  describe('reload', () => {
    it('Should reload log from database', async () => {
      const createdLog = await Models.LogPolicy.create(rawLogPolicy)

      const reloadedLog = await createdLog.reload()

      expect(reloadedLog?.id).to.eq(createdLog.id)
    })
  })
})
