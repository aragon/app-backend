import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { aragonGateway } from '@helpers/aragonGateway'
import config from '@config'
import { ChainRpcGateway, NetworksEnum } from '@types'

describe('Helpers: AragonGateway', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('getRpcClient', function () {
    const network = 'ethereum'
    const expectedUrl = `${config.ARAGON.GATEWAY_URL}/v1.0/rpc/${ChainRpcGateway[network]}/${config.ARAGON.GATEWAY_IPFS_API_KEY}`

    const client = aragonGateway.getRpcClient(network)

    expect(client.uid).to.exist
    expect(client.transport.url).to.eq(expectedUrl)
  })

  it('getIpfsClient', function () {
    const network = NetworksEnum.ethereum
    const isTestnet = false
    const environment = isTestnet ? 'test' : 'prod'
    const expectedUrl = `${config.ARAGON.GATEWAY_URL}/v1.0/ipfs/${environment}/api/v0/`

    const client = aragonGateway.getIpfsClient(network)

    expect(client.url.toString()).to.equal(expectedUrl)
    expect(client.headers['X-API-KEY']).to.equal(config.ARAGON.GATEWAY_IPFS_API_KEY)
  })

  it('_buildRpcUrl', function () {
    const network = NetworksEnum.ethereum
    const expectedUrl = `${config.ARAGON.GATEWAY_URL}/v1.0/rpc/${ChainRpcGateway[network]}/${config.ARAGON.GATEWAY_IPFS_API_KEY}`
    const url = aragonGateway._buildRpcUrl(network)
    expect(url).to.equal(expectedUrl)
  })

  it('_buildIpfsUrl', function () {
    const network = NetworksEnum.ethereum
    const isTestnet = false
    const environment = isTestnet ? 'test' : 'prod'
    const expectedUrl = `${config.ARAGON.GATEWAY_URL}/v1.0/ipfs/${environment}/api/v0`
    const url = aragonGateway._buildIpfsUrl(network)
    expect(url).to.equal(expectedUrl)
  })
})
