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

  for (const cidVersion of [0, 1] as const) {
    describe(`CIDv${cidVersion}`, () => {
      it('round-trips a single statement with string content', async () => {
        const payload = {
          version: 1,
          type: 'statement',
          format: 'markdown',
          content: `integ-single-string-v${cidVersion}-${Date.now()}: long-term protocol health.`,
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

      it('round-trips a single statement with object (item-shaped) content', async () => {
        const payload = {
          version: 1,
          type: 'statement',
          format: 'markdown',
          content: {
            format: 'markdown',
            title: 'About me',
            content: `integ-single-object-v${cidVersion}-${Date.now()}: rich item content.`,
          },
        }
        const cid = await pinJson(payload, cidVersion)
        expectMatchingCid(cid, cidVersion)

        const resolved = await IpfsController.getDelegateStatement(cid)

        expect(resolved).to.deep.equal({
          version: 1,
          type: 'statement',
          format: 'markdown',
          content: {
            format: 'markdown',
            title: 'About me',
            content: payload.content.content,
          },
        })
      })

      it('round-trips a multi-statement (statements) shape with array content', async () => {
        const payload = {
          version: 1,
          type: 'statements',
          content: [
            {
              format: 'markdown',
              title: 'Protocol Health',
              content: `integ-multi-1-v${cidVersion}-${Date.now()}: I believe in long-term protocol health.`,
            },
            {
              format: 'markdown',
              content: `integ-multi-2-v${cidVersion}-${Date.now()}: Decentralization first.`,
            },
          ],
        }
        const cid = await pinJson(payload, cidVersion)
        expectMatchingCid(cid, cidVersion)

        const resolved = await IpfsController.getDelegateStatement(cid)

        expect(resolved).to.deep.equal({
          version: 1,
          type: 'statements',
          content: [
            { format: 'markdown', title: 'Protocol Health', content: payload.content[0].content },
            { format: 'markdown', content: payload.content[1].content },
          ],
        })
      })

      it('strips unknown top-level and item-level fields', async () => {
        const payload = {
          version: 1,
          type: 'statements',
          extraTopLevel: 'should be dropped',
          content: [
            {
              format: 'markdown',
              content: `integ-strip-v${cidVersion}-${Date.now()}: kept content.`,
              extraItemLevel: 'should be dropped',
            },
          ],
        }
        const cid = await pinJson(payload, cidVersion)

        const resolved = await IpfsController.getDelegateStatement(cid)

        expect(resolved).to.deep.equal({
          version: 1,
          type: 'statements',
          content: [{ format: 'markdown', content: payload.content[0].content }],
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

      it('throws badParams (422) when multi-statement content is empty array', async () => {
        const payload = {
          version: 1,
          type: 'statements',
          content: [],
        }
        const cid = await pinJson(payload, cidVersion)

        await expect(IpfsController.getDelegateStatement(cid)).to.be.rejectedWith('badParams')
      })
    })
  }
})
