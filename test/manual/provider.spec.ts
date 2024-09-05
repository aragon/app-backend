import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { IWebSocketProvider, IWebSocketStatus, NetworksEnum } from '@types'
import { WebSocketProvider } from 'ethers'
import config from '@config'
import utils from '@helpers/utils'

describe('Manual: Provider', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle reconnection during a loop', async function () {
    this.timeout(60000) // Increase timeout for the test

    const provider = ProviderModule.providerProxies[NetworksEnum.arbitrumMainnet].provider
    const items = 100 // Reduced for practicality in a test scenario

    let reconnectCalled = false
    let fakeWebSocket: any

    // Stub the WebSocket
    fakeWebSocket = {
      readyState: IWebSocketStatus.OPEN,
      addEventListener: (event: string, handler: () => void) => {
        if (event === 'open') {
          setTimeout(() => handler(), 1000) // Simulate open event after 1 second
        }
      },
      removeEventListener: () => {},
    }

    sandbox.stub(provider, 'websocket').get(() => fakeWebSocket)

    // Stub the getBlockNumber method to simulate reconnection
    sandbox.stub(provider, 'getBlockNumber').callsFake(async () => {
      if (!reconnectCalled) {
        reconnectCalled = true
        setTimeout(() => {
          fakeWebSocket.readyState = IWebSocketStatus.CLOSED
          setTimeout(() => {
            fakeWebSocket.readyState = IWebSocketStatus.OPEN
            provider.updateProvider(
              new WebSocketProvider(config.BLOCKCHAIN_NODES.ARBITRUM_MAINNET as any) as IWebSocketProvider,
            )
          }, 2000) // Simulate reconnection after 2 seconds
        }, 2000) // Simulate disconnection after 2 seconds
      }
      return 12345
    })

    // Run the loop to test reconnection handling
    for (let i = 0; i < items; i++) {
      await utils.wait(50)
      const block = await provider.getBlockNumber()
      console.log(block, i)
      if (i % 1000 === 0) {
        console.log('Checked block number', block, 'at iteration', i)
      }
    }
  })
})
