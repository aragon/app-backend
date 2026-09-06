import { redactPayload, redactUrlKeys } from '@src/logger/redact'
import { expect } from 'chai'

describe('Logger: Redact', () => {
  describe('redactUrlKeys', () => {
    it('redacts the alchemy /v2/<key> path segment', () => {
      const input = 'https://base-mainnet.g.alchemy.com/v2/AbCdEf1234567890AbCdEf1234567890'
      expect(redactUrlKeys(input)).to.equal('https://base-mainnet.g.alchemy.com/v2/[REDACTED]')
    })

    it('redacts the dRPC ?dkey= query param', () => {
      const input = 'https://lb.drpc.org/ogrpc?network=ethereum&dkey=Ab1Cd2Ef3Gh4Ij5Kl6Mn7'
      expect(redactUrlKeys(input)).to.equal('https://lb.drpc.org/ogrpc?network=ethereum&dkey=[REDACTED]')
    })

    it('redacts the ankr rpc.ankr.com/<chain>/<key> path', () => {
      const input = 'https://rpc.ankr.com/eth/abcdef0123456789abcdef0123'
      expect(redactUrlKeys(input)).to.equal('https://rpc.ankr.com/eth/[REDACTED]')
    })

    it('redacts the explorer ?apikey= query param', () => {
      const input = 'https://api.blockscout.com/4663/api?module=contract&apikey=proapi_Ab1Cd2Ef3&action=getsourcecode'
      expect(redactUrlKeys(input)).to.equal(
        'https://api.blockscout.com/4663/api?module=contract&apikey=[REDACTED]&action=getsourcecode',
      )
    })

    it('redacts a serialized "apikey" request param', () => {
      const input = '{"params":{"module":"contract","apikey":"proapi_Ab1Cd2Ef3","chainid":4663}}'
      expect(redactUrlKeys(input)).to.equal('{"params":{"module":"contract","apikey":"[REDACTED]","chainid":4663}}')
    })

    it('leaves URLs without keys untouched', () => {
      const input = 'https://api.example.com/v1/balance?address=0xabc'
      expect(redactUrlKeys(input)).to.equal(input)
    })

    it('does not redact unrelated /v2/ paths on non-alchemy hosts', () => {
      const input = 'https://api.example.com/v2/somelongresourceidentifier12345/balance'
      expect(redactUrlKeys(input)).to.equal(input)
    })

    it('redacts an ankr key that contains a hyphen', () => {
      const input = 'https://rpc.ankr.com/eth/abc-def-1234567890abcdef-0123'
      expect(redactUrlKeys(input)).to.equal('https://rpc.ankr.com/eth/[REDACTED]')
    })

    it('does not touch addresses or tx hashes outside the key segment', () => {
      const input =
        'https://base-mainnet.g.alchemy.com/v2/AbCdEf1234567890AbCdEf1234567890/0x690C2e187c8254a887B35C0B4477ce6787F92855'
      const out = redactUrlKeys(input)
      expect(out).to.include('/v2/[REDACTED]')
      expect(out).to.include('0x690C2e187c8254a887B35C0B4477ce6787F92855')
    })
  })

  describe('redactPayload', () => {
    it('mirrors the real provider warn payload from production logs', () => {
      const fakeAlchemyKey = 'AbCdEf1234567890AbCdEf1234567890'
      const info: any = {
        level: 'warn',
        message: 'RPC returned empty response',
        service: 'modules:Provider',
        network: 'base-mainnet',
        url: `https://base-mainnet.g.alchemy.com/v2/${fakeAlchemyKey}`,
        statusCode: 503,
        statusMessage: 'Service Unavailable',
        requestBody:
          '{"method":"alchemy_getTokenBalances","params":["0x690C2e187c8254a887B35C0B4477ce6787F92855"],"id":301,"jsonrpc":"2.0"}',
      }

      redactPayload(info)

      expect(info.url).to.equal('https://base-mainnet.g.alchemy.com/v2/[REDACTED]')
      expect(info.url).to.not.include(fakeAlchemyKey)
      // Non-secret context preserved verbatim
      expect(info.network).to.equal('base-mainnet')
      expect(info.statusCode).to.equal(503)
      expect(info.statusMessage).to.equal('Service Unavailable')
      // Tx hashes / addresses inside requestBody must NOT be touched
      expect(info.requestBody).to.include('0x690C2e187c8254a887B35C0B4477ce6787F92855')
      expect(info.requestBody).to.include('alchemy_getTokenBalances')
    })

    it('walks nested objects and arrays', () => {
      const info: any = {
        meta: {
          requests: [
            { url: 'https://eth-mainnet.g.alchemy.com/v2/keykeykeykeykeykeykey0', status: 200 },
            { url: 'https://lb.drpc.org/ogrpc?network=base&dkey=AbCdEfGh1234567890', status: 500 },
          ],
        },
      }

      redactPayload(info)

      expect(info.meta.requests[0].url).to.include('/v2/[REDACTED]')
      expect(info.meta.requests[1].url).to.include('dkey=[REDACTED]')
    })

    it('does not mutate Error instances (external transport handles them via serialization)', () => {
      // redactPayload is applied to serialized JSON snapshots only; live Error
      // instances flow through unchanged so the console transport and any
      // libraries holding the original reference are unaffected.
      const originalMessage = 'request to https://eth-mainnet.g.alchemy.com/v2/aaaaaaaaaaaaaaaaaaaaaa failed'
      const err = new Error(originalMessage)
      const originalStack = err.stack

      redactPayload(err)

      expect(err.message).to.equal(originalMessage)
      expect(err.stack).to.equal(originalStack)
    })

    it('does not throw on objects with read-only / non-writable properties', () => {
      // Mirrors the ethers TypeError shape that broke the previous in-place
      // mutation: INVALID_ARGUMENT codes are defined as read-only own props.
      const obj: any = { message: 'invalid address' }
      Object.defineProperty(obj, 'code', {
        value: 'INVALID_ARGUMENT',
        writable: false,
        configurable: false,
        enumerable: true,
      })

      expect(() => redactPayload(obj)).to.not.throw()
      expect(obj.code).to.equal('INVALID_ARGUMENT') // untouched
    })

    it('handles circular references without crashing', () => {
      const a: any = { url: 'https://eth-mainnet.g.alchemy.com/v2/keykeykeykeykeykeykey0' }
      const b: any = { a }
      a.b = b

      expect(() => redactPayload(a)).to.not.throw()
      expect(a.url).to.include('/v2/[REDACTED]')
    })

    it('ignores primitives and null', () => {
      expect(() => redactPayload(null)).to.not.throw()
      expect(() => redactPayload(undefined)).to.not.throw()
      expect(() => redactPayload('plain string' as any)).to.not.throw()
      expect(() => redactPayload(42 as any)).to.not.throw()
    })
  })
})
