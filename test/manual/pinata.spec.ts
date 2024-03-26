import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import PinataHelper from '@helpers/pinata'
import ipfs from '@modules/ipfs'

describe('Manual: Pinata', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('upload, pin and fetch metadata', async () => {
    const list = await PinataHelper.pinList()
    console.log(list) // eslint-disable-line no-console

    const metadata = {
      name: 'Manual Test DAO Name',
      avatar: 'fake-avatar',
      description: 'Description of your DAO',
      links: [
        { name: 'Link 1', url: 'https://example.com/link1' },
        { name: 'Link 2', url: 'https://example.com/link2' },
      ],
    }

    const cid = await PinataHelper.uploadAndPinMetadata(metadata)
    console.log(cid) // eslint-disable-line no-console

    const list2 = await PinataHelper.pinList()
    console.log(list2) // eslint-disable-line no-console

    const content = await ipfs.fetchMetadata(cid!)
    console.log(content) // eslint-disable-line no-console
  })
})
