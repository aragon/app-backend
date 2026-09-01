import IpfsProviders from '@modules/ipfsProviders'
import { expect } from 'chai'

// live contract test against the delegated routing endpoint and a real provider gateway,
// using proposal metadata that is pinned on Pinata (providers stay discoverable)
const LIVE_CID = 'bafkreifstrrnt2dsum6t5edwmnk72k2zl5v2frhujfgy5dtyjxlpvx3xjy'

describe('Integ: IpfsProviders', () => {
  it('discovers http providers and fetches verified content end to end', async function () {
    this.timeout(60000)

    const providers = await IpfsProviders.findHttpProviders(LIVE_CID, 20000)
    expect(providers.length).to.be.greaterThan(0)
    expect(providers[0]).to.match(/^https:\/\//)

    let content: any = null
    for (const provider of providers) {
      content = await IpfsProviders.fetchVerifiedContent(provider, LIVE_CID, 20000)
      if (content) break
    }

    expect(content).to.not.be.null
    expect(content.title).to.eq('Approve & Deposit to Llamalend WBTC/CRVUSD Pool')
  })
})
