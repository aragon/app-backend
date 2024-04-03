import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Provider from '@modules/provider'
import { NetworksEnum } from '@types'
import { WebSocketProvider } from 'ethers'
import Logger from '@logger'
import config from '@config'

describe('Module: provider', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('connectToNetwork', async () => {
    const mockNetwork = NetworksEnum.mainnet
    const mockUrl = 'wss://ethereum-rpc.publicnode.com'

    const mockWebSocket = {
      onopen: sandbox.stub(),
      onerror: sandbox.stub(),
    }

    sandbox.stub(WebSocketProvider.prototype, 'websocket').get(() => mockWebSocket)
    const stubConfig = sandbox.stub(Provider.configState, 'setConfigItem')
    const stubLogger = sandbox.stub(Logger, 'info')

    const promise = Provider.connectToNetwork(mockNetwork, mockUrl)
    mockWebSocket.onopen()

    await promise
    expect(stubLogger.calledOnce).to.be.true
    expect(stubConfig.calledOnce).to.be.true
    expect(stubConfig.calledWith(NetworksEnum.mainnet)).to.be.true
  })

  it('connectToAllNetworks', async () => {
    config.BLOCKCHAIN_NODES.MAINNET = 'wss://ethereum-rpc.publicnode.com'
    const stubConneect = sandbox.stub(Provider, 'connectToNetwork')
    await Provider.connectToAllNetworks()

    expect(stubConneect.callCount).to.eq(1)
  })
})
