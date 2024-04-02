import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import SatsumaHelper from '@helpers/satsuma'
import { NetworksEnum } from '@types'

describe('Manual: Satsuma', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should getDaos', async () => {
    const network = NetworksEnum.mainnet
    const response = await SatsumaHelper.getDaos(network, {
      limit: 10,
      skip: 0,
      orderProp: 'id',
      order: 'desc',
    })
    console.log(response) // eslint-disable-line no-console
  })

  it('should getTokenVotingMembers', async () => {
    // const daoaddress = '0x59447788F9dCf2df550F257F3692a07f05b922D7'
    const pluginAddress = '0xb85380977ec3435aebc13e29b01af990393bded9'
    const network = NetworksEnum.mainnet
    const response = await SatsumaHelper.getTokenVotingMembers(network, pluginAddress, {
      limit: 100,
      skip: 0,
      orderProp: 'address',
      order: 'asc',
    })
    console.log(response) // eslint-disable-line no-console
  })

  it('should getMultiSigMembers', async () => {
    // const daoaddress = '0x59447788F9dCf2df550F257F3692a07f05b922D7'
    const pluginAddress = '0x0673c13d48023efa609c20e5e351763b99dd67de'
    const network = NetworksEnum.mainnet
    const response = await SatsumaHelper.getMultiSigMembers(network, pluginAddress, {
      limit: 100,
      skip: 0,
      orderProp: 'address',
      order: 'asc',
    })
    console.log(response) // eslint-disable-line no-console
  })
})
