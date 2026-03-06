import { Models } from '@dbModels'
import renameDaoSubdaoFieldsMigration from '@src/migrations/20260305120000-renameDaoSubdaoFields'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

describe('migration: renameDaoSubdaoFields', () => {
  const parentAddress = '0x1111111111111111111111111111111111111111'
  const childAddress = '0x2222222222222222222222222222222222222222'

  it('should rename parentDao to parentAccount and subDaos to linkedAccounts', async () => {
    const collection = Models.Dao.collection

    await collection.insertMany([
      {
        id: `ethereum-mainnet-${parentAddress}`,
        address: parentAddress,
        creatorAddress: '0x0000000000000000000000000000000000000001',
        network: NetworksEnum.ethereumMainnet,
        isActive: true,
        parentDao: null,
        subDaos: [childAddress],
      },
      {
        id: `ethereum-mainnet-${childAddress}`,
        address: childAddress,
        creatorAddress: '0x0000000000000000000000000000000000000001',
        network: NetworksEnum.ethereumMainnet,
        isActive: true,
        parentDao: parentAddress,
        subDaos: [],
      },
    ])

    await renameDaoSubdaoFieldsMigration.start()

    const parent = await collection.findOne({ address: parentAddress })
    expect(parent).to.have.property('parentAccount', null)
    expect(parent).to.have.property('linkedAccounts').that.deep.equals([childAddress])
    expect(parent).to.not.have.property('parentDao')
    expect(parent).to.not.have.property('subDaos')

    const child = await collection.findOne({ address: childAddress })
    expect(child).to.have.property('parentAccount', parentAddress)
    expect(child).to.have.property('linkedAccounts').that.deep.equals([])
    expect(child).to.not.have.property('parentDao')
    expect(child).to.not.have.property('subDaos')
  })

  it('should not fail when documents already use new field names', async () => {
    await Models.Dao.create({
      id: `ethereum-mainnet-${parentAddress}`,
      address: parentAddress,
      creatorAddress: '0x0000000000000000000000000000000000000001',
      network: NetworksEnum.ethereumMainnet,
      isActive: true,
      parentAccount: null,
      linkedAccounts: [childAddress],
    } as any)

    await renameDaoSubdaoFieldsMigration.start()

    const doc = await Models.Dao.collection.findOne({ address: parentAddress })
    expect(doc).to.have.property('parentAccount', null)
    expect(doc).to.have.property('linkedAccounts').that.deep.equals([childAddress])
  })

  it('stop should do nothing', async () => {
    await renameDaoSubdaoFieldsMigration.stop()
    expect(true).to.be.true
  })
})
