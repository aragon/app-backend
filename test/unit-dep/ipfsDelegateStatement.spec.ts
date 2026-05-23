import config from '@config'
import logger from '@logger'
import IpfsController from '@services/aragon-api/controllers/ipfs'
import { expect } from 'chai'

const PINATA_PIN_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS'

const pinJson = async (payload: Record<string, unknown>, cidVersion: 0 | 1): Promise<string> => {
  const response = await fetch(PINATA_PIN_JSON_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.PINATA.JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pinataMetadata: { name: `delegate-statement-integ-v${cidVersion}-${Date.now()}-${Math.random()}` },
      pinataOptions: { cidVersion },
      pinataContent: payload,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Pinata pinJSONToIPFS failed: ${response.status} ${body}`)
  }

  const data = (await response.json()) as { IpfsHash: string }
  logger.info(`Pinned JSON to IPFS via Pinata: ${data.IpfsHash} (CIDv${cidVersion})`)
  return data.IpfsHash
}

const cidv0Regex = /^Qm[a-zA-Z0-9]{44}$/
const cidv1Regex = /^b[a-z2-7]{58}$/

const expectMatchingCid = (cid: string, cidVersion: 0 | 1) => {
  const regex = cidVersion === 0 ? cidv0Regex : cidv1Regex
  expect(cid).to.match(regex, `expected CIDv${cidVersion}, got ${cid}`)
}

describe('Integ: IPFS delegate statement', () => {
  before(function () {
    if (!config.PINATA.JWT) {
      this.skip()
    }
  })

  describe('delegate statement test', () => {
    for (const cidVersion of [0, 1] as const) {
      describe(`CIDv${cidVersion}`, () => {
        it('round-trips a delegate statement', async () => {
          const payload = {
            version: 1,
            type: 'statement',
            format: 'markdown',
            content: `integ-v${cidVersion}-${Date.now()}: long-term protocol health.`,
          }
          const cid = await pinJson(payload, cidVersion)
          expectMatchingCid(cid, cidVersion)

          const resolved = await IpfsController.getDelegateStatement(cid)

          expect(resolved).to.deep.equal({
            version: 1,
            type: 'statement',
            format: 'markdown',
            content: payload.content,
          })
        })

        it('strips unknown top-level fields', async () => {
          const payload = {
            version: 1,
            type: 'statement',
            format: 'markdown',
            content: `integ-strip-v${cidVersion}-${Date.now()}: kept content.`,
            extra: 'should be dropped',
          }
          const cid = await pinJson(payload, cidVersion)

          const resolved = await IpfsController.getDelegateStatement(cid)

          expect(resolved).to.deep.equal({
            version: 1,
            type: 'statement',
            format: 'markdown',
            content: payload.content,
          })
        })

        it('throws badParams (422) when content is empty', async () => {
          const payload = {
            version: 1,
            type: 'statement',
            format: 'markdown',
            content: '',
          }
          const cid = await pinJson(payload, cidVersion)

          await expect(IpfsController.getDelegateStatement(cid)).to.be.rejectedWith('badParams')
        })
      })
    }
  })

  describe('deadline enforcement on unreachable CIDs', () => {
    const unreachableCidv0 = `Qm${'z'.repeat(44)}`
    const unreachableCidv1 = `b${'a'.repeat(58)}`

    for (const [label, cid] of [
      ['CIDv0', unreachableCidv0],
      ['CIDv1', unreachableCidv1],
    ] as const) {
      it(`rejects with notFound within the total deadline budget (${label})`, async function () {
        this.timeout(45000)

        const start = Date.now()
        await expect(IpfsController.getDelegateStatement(cid)).to.be.rejectedWith('notFound')
        const elapsed = Date.now() - start

        expect(elapsed).to.be.lessThan(20000, `took ${elapsed}ms — total deadline not enforced`)
      })
    }
  })
})
