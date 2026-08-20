import { safeErrorMessage } from '@workspace/helpers/safeError'
import { expect } from 'chai'

describe('Service: aragon-workspace safeErrorMessage', () => {
  it('should not leak an rpc api key from an ethers server error', () => {
    // The shape ethers v6 produces: the whole request url lands in the message.
    const error = new Error(
      'server response 401 Unauthorized (request={ }, response={ }, ' +
        'info={ "requestUrl": "https://eth-mainnet.g.alchemy.com/v2/SOMEVERYLONGSECRETKEY123456", "status": 401 })',
    )

    const message = safeErrorMessage(error)

    expect(message).to.not.contain('SOMEVERYLONGSECRETKEY123456')
    expect(message).to.not.contain('alchemy.com')
  })

  it('should strip a drpc key given as a query param', () => {
    const message = safeErrorMessage(
      new Error('failed calling https://lb.drpc.org/ogrpc?dkey=abc123secret&network=eth'),
    )

    expect(message).to.not.contain('abc123secret')
  })

  it('should keep a message that carries no url readable', () => {
    expect(safeErrorMessage(new Error('could not decode result data'))).to.equal('could not decode result data')
  })

  it('should cut an oversized dump down', () => {
    const message = safeErrorMessage(new Error('x'.repeat(5000)))

    expect(message.length).to.be.lessThan(250)
  })

  it('should describe a thrown non-error', () => {
    expect(safeErrorMessage('plain string failure')).to.equal('plain string failure')
    expect(safeErrorMessage(undefined)).to.equal('unknown error')
  })
})
