import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum, StatusNetworkEnum } from '@types'
import Network from '@models/schema/network'
import { Models } from '@dbModels'

describe('Model: Network', () => {
  let sandbox: SinonSandbox
  let rawNetwork: Partial<Network>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawNetwork = {
      name: NetworksEnum.ethereum,
      status: StatusNetworkEnum.healthy,
      isActive: true,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create Network', async () => {
    const createdNetwork = await Models.Network.create(rawNetwork)

    expect(createdNetwork.id).to.exist
    expect(createdNetwork).to.have.property('name', rawNetwork.name)
    expect(createdNetwork).to.have.property('status', rawNetwork.status)
    expect(createdNetwork).to.have.property('isActive', rawNetwork.isActive)
  })

  it('Should update Network', async () => {
    const createdNetwork = await Models.Network.create(rawNetwork)
    expect(createdNetwork).to.have.property('name', rawNetwork.name)

    await createdNetwork.update({
      status: StatusNetworkEnum.maintenance,
    })

    expect(createdNetwork).to.have.property('status', StatusNetworkEnum.maintenance)
  })

  it('Should get statics', async () => {
    const networks = Models.Network.NETWORKS

    expect(networks.ethereum).to.eq('ethereum')
    expect(Object.keys(networks).length).to.eq(9)

    const statusNetworks = Models.Network.STATUS_NETWORKS
    expect(statusNetworks.healthy).to.eq('healthy')
    expect(Object.keys(statusNetworks).length).to.eq(3)
  })

  it('Should find a Network by name', async () => {
    const rawNetwork = {
      name: NetworksEnum.goerli,
      status: StatusNetworkEnum.maintenance,
      isActive: true,
    }
    await Models.Network.create(rawNetwork)

    const foundNetwork = await Models.Network.findByName(NetworksEnum.goerli)

    expect(foundNetwork).to.not.be.null
    expect(foundNetwork).to.have.property('name', rawNetwork.name)
    expect(foundNetwork).to.have.property('status', rawNetwork.status)
    expect(foundNetwork).to.have.property('isActive', rawNetwork.isActive)
  })

  it('Should findAll', async () => {
    const rawNetwork = {
      name: NetworksEnum.goerli,
      status: StatusNetworkEnum.maintenance,
      isActive: true,
    }
    await Models.Network.create(rawNetwork)
    await Models.Network.create({
      name: NetworksEnum.mumbai,
      status: StatusNetworkEnum.maintenance,
      isActive: false,
    })

    const foundNetworks = await Models.Network.findAll()

    expect(foundNetworks.length).to.eq(1)
  })

  it('Should reload', async () => {
    const createdNetwork = await Models.Network.create(rawNetwork)
    await createdNetwork.reload()

    expect(createdNetwork.name).to.eq(NetworksEnum.ethereum)
  })
})
