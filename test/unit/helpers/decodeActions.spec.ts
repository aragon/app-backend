import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import DecodeActions from '@helpers/decodeActions'
import { expect } from 'chai'

describe.only('Helpers: DecodeActions', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('decodeData', () => {
    it('Should decodeData', async () => {
      const decodeActions = new DecodeActions()

      const action = {
        to: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        value: '0',
        data: '0x40c10f19000000000000000000000000284803c34a3f049f787e2562e6f8c084bdbc31970000000000000000000000000000000000000000000000000de0b6b3a7640000',
      }

      const result = decodeActions.decodeData(action.data)
      const toAddress = result?.decoded[0].toLowerCase()
      expect(toAddress).to.be.equal('0x284803c34a3f049f787e2562e6f8c084bdbc3197')
    })
  })
})
