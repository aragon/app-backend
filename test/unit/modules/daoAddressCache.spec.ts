import { Models } from '@dbModels'
import DaoAddressCache from '@modules/daoAddressCache'
import { DaoList } from '@test/mock/fakeDao'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const { createdAt: _createdAt, ...daoFixture } = DaoList[0]

const createDao = (address: string, network: NetworksEnum) => Models.Dao.create({ ...daoFixture, address, network })

describe('Module: DaoAddressCache', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    DaoAddressCache.clear()
  })

  afterEach(() => {
    sandbox.restore()
    DaoAddressCache.clear()
  })

  it('should load existing DAO addresses on first refresh and resolve any casing to the stored value', async () => {
    const dao = await createDao('0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA', NetworksEnum.ethereumMainnet)

    await DaoAddressCache.refresh(NetworksEnum.ethereumMainnet)

    expect(DaoAddressCache.getChecksummed(NetworksEnum.ethereumMainnet, dao.address.toLowerCase())).to.equal(
      dao.address,
    )
    expect(DaoAddressCache.getChecksummed(NetworksEnum.ethereumMainnet, dao.address)).to.equal(dao.address)
  })

  it('should return undefined for unknown addresses', async () => {
    await DaoAddressCache.refresh(NetworksEnum.ethereumMainnet)

    expect(DaoAddressCache.getChecksummed(NetworksEnum.ethereumMainnet, '0xf2d594f3c93c19d7b1a6f15b5489ffce4b01f7da'))
      .to.be.undefined
  })

  it('should pick up DAOs created after the initial load via the cursor delta', async () => {
    await DaoAddressCache.refresh(NetworksEnum.ethereumMainnet)

    const dao = await createDao('0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA', NetworksEnum.ethereumMainnet)
    await DaoAddressCache.refresh(NetworksEnum.ethereumMainnet)

    expect(DaoAddressCache.getChecksummed(NetworksEnum.ethereumMainnet, dao.address.toLowerCase())).to.equal(
      dao.address,
    )
  })

  it('should keep networks isolated', async () => {
    const dao = await createDao('0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA', NetworksEnum.polygonMainnet)

    await DaoAddressCache.refresh(NetworksEnum.polygonMainnet)
    await DaoAddressCache.refresh(NetworksEnum.ethereumMainnet)

    expect(DaoAddressCache.getChecksummed(NetworksEnum.polygonMainnet, dao.address)).to.equal(dao.address)
    expect(DaoAddressCache.getChecksummed(NetworksEnum.ethereumMainnet, dao.address)).to.be.undefined
  })

  it('should only query the delta window on subsequent refreshes', async () => {
    const findSpy = sandbox.spy(Models.Dao, 'find')

    await DaoAddressCache.refresh(NetworksEnum.ethereumMainnet)
    await DaoAddressCache.refresh(NetworksEnum.ethereumMainnet)

    expect(findSpy.calledTwice).to.be.true
    expect(findSpy.firstCall.args[0]).to.not.have.property('createdAt')
    expect(findSpy.secondCall.args[0]).to.have.property('createdAt')
  })

  it('should not duplicate entries when the overlap window re-returns the same DAO', async () => {
    const dao = await createDao('0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA', NetworksEnum.ethereumMainnet)

    await DaoAddressCache.refresh(NetworksEnum.ethereumMainnet)
    // Cursor sits at the DAO's createdAt, so the 60s overlap re-returns it
    await DaoAddressCache.refresh(NetworksEnum.ethereumMainnet)
    await DaoAddressCache.refresh(NetworksEnum.ethereumMainnet)

    const state = (DaoAddressCache as any).states.get(NetworksEnum.ethereumMainnet)
    expect(state.byLower.size).to.equal(1)
    expect(state.byLower.get(dao.address.toLowerCase())).to.equal(dao.address)
  })

  it('should not run concurrent refreshes for the same network', async () => {
    const findSpy = sandbox.spy(Models.Dao, 'find')

    await Promise.all([
      DaoAddressCache.refresh(NetworksEnum.ethereumMainnet),
      DaoAddressCache.refresh(NetworksEnum.ethereumMainnet),
    ])

    expect(findSpy.calledOnce).to.be.true
  })
})
