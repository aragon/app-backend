import config from '@config'
import PinataHelper from '@helpers/pinata'
import ipfs from '@modules/ipfs'
import Pinata from '@pinata/sdk'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Manual: Pinata', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('get data', async () => {
    const cid = 'QmVGCibCLPgqA8eszxQJMzQFcmQAdrkyhTGH6EB5ERivsR'
    const data = await PinataHelper.getData(cid)
    console.log(data) // eslint-disable-line no-console
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

  it('Should pin the spp metadata', async () => {
    config.PINATA.JWT = ''
    PinataHelper.pinata = new Pinata({ pinataJWTKey: config.PINATA.JWT })

    const metadataMultiSig = {
      name: 'SPP MultiSig',
      description: 'This is the MultiSig contract for the SPP',
      links: [
        {
          name: 'SPP MultiSig',
          url: 'https://spp.io/multisig',
        },
      ],
    }

    const cidMultiSig = await PinataHelper.uploadAndPinMetadata(metadataMultiSig)
    console.log('MultiSig', '0x' + Buffer.from(cidMultiSig as string, 'utf8').toString('hex')) // eslint-disable-line no-console

    const metadataTokenVoting = {
      name: 'SPP Token Voting',
      description: 'This is the Token Voting contract for the SPP',
      links: [
        {
          name: 'SPP Token Voting',
          url: 'https://spp.io/token-voting',
        },
      ],
    }

    const cidTokenVoting = await PinataHelper.uploadAndPinMetadata(metadataTokenVoting)
    console.log('TokenVoting', '0x' + Buffer.from(cidTokenVoting as string, 'utf8').toString('hex')) // eslint-disable-line no-console

    const metadataSpp = {
      name: 'SPP',
      processKey: 'tagSpp',
      links: [
        {
          name: 'SPP',
          url: 'https://spp.io',
        },
      ],
      description: 'This is the SPP Metadata',
      stageNames: ['MultiSig Stage', 'Token Voting Stage'],
    }

    const cidSpp = await PinataHelper.uploadAndPinMetadata(metadataSpp)
    console.log('SPP', '0x' + Buffer.from(cidSpp as string, 'utf8').toString('hex')) // eslint-disable-line no-console
  })
})
