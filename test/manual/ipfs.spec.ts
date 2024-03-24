import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import IPFSHelper from '@helpers/ipfs'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

describe('Manual: IPFS', () => {
  let sandbox: SinonSandbox
  let apyKey: any = null

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('fetchMetadataViaGateway', async () => {
    const cid = 'QmegTnRgL45Ecwn99cc97DU71UbMmNW4NdeXNoJPBXnN7M'
    const network = NetworksEnum.goerli
    const metadata = await IPFSHelper.fetchMetadataViaGateway(cid, network)
    console.log(metadata) // eslint-disable-line no-console
  })

  it('fetchMetadataViaRequest', async () => {
    const cid = 'bafkreigrfg3ugcp3wo6mwlxtnae3g72g5q6c2xqawwzccby6radwytgyme'
    const metadata = await IPFSHelper.fetchMetadataViaRequest(cid)
    console.log(metadata) // eslint-disable-line no-console
  })

  it('Should pin meta and expect a real response', async () => {
    try {
      const formData = new FormData()
      formData.append(
        'path',
        JSON.stringify({
          name: 'datdfgg',
          description: 'sdfsdf',
          links: [{ name: 'dfsdf', url: 'https://app.aragon.org/#/create' }],
        }),
      )

      const response = await fetch('https://prod.ipfs.aragon.network/api/v0/add', {
        method: 'POST',
        headers: {
          'X-API-Key': apyKey,
        },
        body: formData,
      })

      const req: any = await response.json()
      expect(req.Hash).to.exist
    } catch (error) {
      console.error('Request failed:', error) // eslint-disable-line no-console
    }
  })
})
