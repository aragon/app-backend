import { Models } from '@dbModels'
import logger from '@logger'
import { removeJunkTransfersMigration } from '@src/migrations/20261108125533-removeJunkTransfers'
import { NetworksEnum } from '@types'
import { DaoList } from '@test/mock/fakeDao'
import { FakeAsset } from '@test/mock/fakeAsset'
import { FakeTransaction } from '@test/mock/fakeTransaction'
import { expect } from 'chai'
import * as sinon from 'sinon'

const network = NetworksEnum.polygonMainnet
const daoAddress = DaoList[0].address
const trackedSafe = '0x0000000000000000000000000000000000000001'
const untrackedSafe = '0x0000000000000000000000000000000000000002'
const junkAddress = '0x0000000000000000000000000000000000000003'
const zeroAddress = '0x0000000000000000000000000000000000000000'

async function seedTransaction(id: string, address: string, txNetwork = network) {
  await Models.Transaction.create({ ...FakeTransaction, id, network: txNetwork, daoAddress: address })
}

async function seedAsset(id: string, address: string, assetNetwork = network) {
  await Models.Asset.create({ ...FakeAsset, id, network: assetNetwork, daoAddress: address })
}

describe('Migration: removeJunkTransfers', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('deletes transfers and assets outside DAOs and tracked Safes', async () => {
    await Models.Dao.create({ ...DaoList[0] })
    await Models.SafeAccount.track(network, trackedSafe)
    await Models.SafeAccount.ensure(network, untrackedSafe)

    await Promise.all([
      seedTransaction('dao', daoAddress),
      seedTransaction('tracked', trackedSafe),
      seedTransaction('untracked', untrackedSafe),
      seedTransaction('junk', junkAddress),
      seedTransaction('zero', zeroAddress),
      seedAsset('dao', daoAddress),
      seedAsset('tracked', trackedSafe),
      seedAsset('untracked', untrackedSafe),
      seedAsset('junk', junkAddress),
      seedAsset('zero', zeroAddress),
    ])

    await removeJunkTransfersMigration.start()

    const transactions = await Models.Transaction.find({}, { id: 1 }).lean()
    const assets = await Models.Asset.find({}, { id: 1 }).lean()
    expect(transactions.map(row => row.id).sort()).to.deep.equal(['dao', 'tracked'])
    expect(assets.map(row => row.id).sort()).to.deep.equal(['dao', 'tracked'])
  })

  it('keeps an address only on the network with its DAO', async () => {
    await Models.Dao.create({ ...DaoList[0] })
    await seedTransaction('polygon', daoAddress)
    await seedTransaction('ethereum', daoAddress, NetworksEnum.ethereumMainnet)
    await seedAsset('polygon', daoAddress)
    await seedAsset('ethereum', daoAddress, NetworksEnum.ethereumMainnet)

    await removeJunkTransfersMigration.start()

    expect((await Models.Transaction.find({}, { id: 1 }).lean()).map(row => row.id)).to.deep.equal(['polygon'])
    expect((await Models.Asset.find({}, { id: 1 }).lean()).map(row => row.id)).to.deep.equal(['polygon'])
  })

  it('keeps the same rows on a second run', async () => {
    await Models.Dao.create({ ...DaoList[0] })
    await seedTransaction('dao', daoAddress)
    await seedTransaction('junk', junkAddress)
    await seedAsset('dao', daoAddress)
    await seedAsset('junk', junkAddress)

    await removeJunkTransfersMigration.start()
    const afterFirst = {
      transactions: await Models.Transaction.find({}).lean(),
      assets: await Models.Asset.find({}).lean(),
    }

    await removeJunkTransfersMigration.start()

    expect(await Models.Transaction.find({}).lean()).to.deep.equal(afterFirst.transactions)
    expect(await Models.Asset.find({}).lean()).to.deep.equal(afterFirst.assets)
  })

  it('deletes junk addresses across multiple batches', async () => {
    const addresses = Array.from({ length: 501 }, (_, i) => `0x${(i + 1000).toString(16).padStart(40, '0')}`)
    await Models.Transaction.insertMany(
      addresses.map((address, i) => ({ ...FakeTransaction, id: `tx-${i}`, daoAddress: address })),
    )
    await Models.Asset.insertMany(
      addresses.map((address, i) => ({ ...FakeAsset, id: `asset-${i}`, daoAddress: address })),
    )

    await removeJunkTransfersMigration.start()

    expect(await Models.Transaction.countDocuments()).to.equal(0)
    expect(await Models.Asset.countDocuments()).to.equal(0)
  })

  it('deletes a large set of junk addresses', async () => {
    const rows = Array.from({ length: 25_001 }, (_, i) => ({
      ...FakeTransaction,
      id: `tx-${i}`,
      daoAddress: `0x${(i + 1000).toString(16).padStart(40, '0')}`,
    }))
    await Models.Transaction.collection.insertMany(rows)

    await removeJunkTransfersMigration.start()

    expect(await Models.Transaction.countDocuments()).to.equal(0)
  })
})
