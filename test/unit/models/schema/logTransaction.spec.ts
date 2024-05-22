import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ITransactionType, NetworksEnum } from '@types'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import LogTransaction from '@models/schema/logTransaction'

describe('Model: LogTransaction', () => {
  let sandbox: SinonSandbox
  let rawLogTransaction: Partial<LogTransaction>
  let ethereumNetwork: Network

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    ethereumNetwork = await Models.Network.create({
      name: NetworksEnum.mainnet,
      status: 'healthy',
    })

    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const actionIndex = 1
    const entityId = Models.LogTransaction.getEntityId(transactionHash, ITransactionType.deposit, actionIndex)

    rawLogTransaction = {
      entityId,
      transactionHash,
      blockNumber: 3,
      network: NetworksEnum.mainnet,
      type: ITransactionType.deposit,
      from: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      to: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      amount: 100,
      tokenAddress: '0x0000000000000000000000000000000000000000',
      tokenId: '1',
      reference: 'test-reference',
      actionIndex,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create LogTransaction', async () => {
    it('Should create LogTransaction', async () => {
      const entityId = Models.LogTransaction.getEntityId(
        rawLogTransaction.transactionHash,
        rawLogTransaction.actionIndex,
      )
      rawLogTransaction.entityId = entityId
      const createdLogTransaction = await Models.LogTransaction.create(rawLogTransaction)

      expect(createdLogTransaction.id).to.exist
      expect(createdLogTransaction.entityId).to.eq(rawLogTransaction.entityId)
      expect(createdLogTransaction.transactionHash).to.eq(rawLogTransaction.transactionHash)
      expect(createdLogTransaction.blockNumber).to.eq(rawLogTransaction.blockNumber)
      expect(createdLogTransaction.network).to.eq(rawLogTransaction.network)
      expect(createdLogTransaction.type).to.eq(rawLogTransaction.type)
      expect(createdLogTransaction.from).to.eq(rawLogTransaction.from)
      expect(createdLogTransaction.to).to.eq(rawLogTransaction.to)
      expect(createdLogTransaction.amount).to.eq(rawLogTransaction.amount)
      expect(createdLogTransaction.tokenAddress).to.eq(rawLogTransaction.tokenAddress)
      expect(createdLogTransaction.tokenId).to.eq(rawLogTransaction.tokenId)
      expect(createdLogTransaction.reference).to.eq(rawLogTransaction.reference)
      expect(createdLogTransaction.actionIndex).to.eq(rawLogTransaction.actionIndex)
    })

    it('Should create LogTransaction without entityId', async () => {
      const entityId = Models.LogTransaction.getEntityId(
        rawLogTransaction.transactionHash,
        rawLogTransaction.type,
        rawLogTransaction.actionIndex,
      )
      const createdLogTransaction = await Models.LogTransaction.create(rawLogTransaction)

      expect(createdLogTransaction.id).to.exist
      expect(createdLogTransaction.entityId).to.eq(entityId)
      expect(createdLogTransaction.transactionHash).to.eq(rawLogTransaction.transactionHash)
      expect(createdLogTransaction.blockNumber).to.eq(rawLogTransaction.blockNumber)
      expect(createdLogTransaction.network).to.eq(rawLogTransaction.network)
      expect(createdLogTransaction.type).to.eq(rawLogTransaction.type)
      expect(createdLogTransaction.from).to.eq(rawLogTransaction.from)
      expect(createdLogTransaction.to).to.eq(rawLogTransaction.to)
      expect(createdLogTransaction.amount).to.eq(rawLogTransaction.amount)
      expect(createdLogTransaction.tokenAddress).to.eq(rawLogTransaction.tokenAddress)
      expect(createdLogTransaction.tokenId).to.eq(rawLogTransaction.tokenId)
      expect(createdLogTransaction.reference).to.eq(rawLogTransaction.reference)
      expect(createdLogTransaction.actionIndex).to.eq(rawLogTransaction.actionIndex)
    })
  })

  it('Should update LogTransaction', async () => {
    const createdLogTransaction = await Models.LogTransaction.create(rawLogTransaction)
    expect(createdLogTransaction.blockNumber).to.eq(rawLogTransaction.blockNumber)

    await createdLogTransaction.update({
      blockNumber: 2,
    })

    expect(createdLogTransaction.blockNumber).to.eq(2)
  })

  it('Should getEntityId', async () => {
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const actionIndex = 1
    const type = ITransactionType.deposit
    const entityId = Models.LogTransaction.getEntityId(transactionHash, type, actionIndex)
    expect(entityId).to.eq(`${transactionHash}-${type}-${actionIndex}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogTransaction = await Models.LogTransaction.create(rawLogTransaction)
    const foundLogTransaction = await Models.LogTransaction.findExistingLog(
      createdLogTransaction.transactionHash,
      createdLogTransaction.type,
      createdLogTransaction.actionIndex,
    )
    expect(foundLogTransaction?.entityId).to.eq(createdLogTransaction.entityId)
  })

  it('Should findByEntityId', async () => {
    const createdLogTransaction = await Models.LogTransaction.create(rawLogTransaction)
    const foundLogTransaction = await Models.LogTransaction.findByEntityId(createdLogTransaction.entityId)
    expect(foundLogTransaction?.entityId).to.eq(createdLogTransaction.entityId)
  })

  it('Should reload', async () => {
    const createdLogTransaction = await Models.LogTransaction.create(rawLogTransaction)
    await createdLogTransaction.reload()

    expect(createdLogTransaction.tokenAddress).to.eq(rawLogTransaction.tokenAddress)
  })
})
