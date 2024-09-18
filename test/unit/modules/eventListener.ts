import * as sinon from 'sinon'
import { expect } from 'chai'
import EventListener from '@modules/eventListener'
import { NetworksEnum } from '@types'

describe('Modules: EventListener', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with the correct properties', () => {
      const config = {
        name: 'IndexerServiceExample',
        abi: [],
        listen: [],
        networkName: NetworksEnum.ethereumSepolia,
      }

      const eventListener = new EventListener(config as any)

      expect(eventListener.name).to.equal(config.name)
      expect(eventListener.abi).to.deep.equal(config.abi)
      expect(eventListener.listen).to.deep.equal(config.listen)
      expect(eventListener.networkName).to.equal(config.networkName)
      expect(eventListener.network).to.equal(config.networkName)
    })
  })
})
