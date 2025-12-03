import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'
import { Models } from '@dbModels'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import AragonPluginsService from '@plugins/index'
import ConfigIndexerHelper from '@helpers/configIndexer'
import PoolingCrawler from '@modules/poolingCrawler'
import utils from '@helpers/utils'
import { LibUtils } from '@test/lib/unit-dep/lib'

describe.only('Integ: Token', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('test get token', async () => {
    const network = NetworksEnum.ethereumSepolia
    const tokenAddress = '0x78AB36461370261268516F389F5F82EDBE7aA234'

    await ProxyToken.saveAndGetToken(tokenAddress, network)

    sandbox.stub(Models.Plugin, 'findByAddress').resolves({
      address: '0xPluginAddress',
      network: NetworksEnum.ethereumSepolia,
      interfaceType: IPluginInterfaceType.tokenVoting,
      tokenAddress,
    })

    const startStub = sandbox.stub(LogTokenVoting, 'start').resolves()

    await AragonPluginsService.pluginQueue({
      address: '0xPluginAddress',
      network: NetworksEnum.ethereumSepolia,
    })

    expect(startStub.called).to.be.true
  })

  it.skip('test the crawler issue', async function () {
    this.timeout(10000000000)
    const network = NetworksEnum.cornMainnet
    const blockNumber = 913077
    const logService = ConfigIndexerHelper.builders.indexer(network)

    await Models.ConfigIndexer.create({
      network,
      service: logService,
      lastSync: blockNumber,
    })

    await PoolingCrawler.start({
      logService,
      network,
    })
  })

  it('should test why the token has no price', async function () {
    this.timeout(100000000000)
    const tokens = [
      {
        network: NetworksEnum.katanaMainnet,
        addresses: [
          '0x297612c171fc8ADce32ac333085a9Ee1F2BCC1Da',
          '0x5A7F82cd95410CB9eCf569696EFBE2c387A2fabB',
          '0x7fcD9451f3ADA8f9Aaa5E5ac0e443Dfa32DE1b8A',
        ],
      },
      {
        network: NetworksEnum.ethereumMainnet,
        addresses: [
          '0xa117000000f279D81A1D3cc75430fAA017FA5A2e',
          '0xb6b59b3fa1ce026209BBE538E4b455ABF3173D32',
          '0x1b6ec227ceBeC25118270efbb4b67642fc29965E',
        ],
      },
      {
        network: NetworksEnum.chilizMainnet,
        addresses: [
          '0x60F397acBCfB8f4e3234C659A3E10867e6fA6b67',
          '0xA15C3b8b5D43E8EFa529eb0fE873A229424f311F',
          '0xEf1AF98AC21F57e750D2e91d0af51C3Aa16fE1A9',
        ],
      },
      {
        network: NetworksEnum.optimismMainnet,
        addresses: ['0x0000000000000000000000000000000000000000', '0x3E3F51a5d2Cc9A3d55b57de3c5aE50507b8208d8'],
      },
      {
        network: NetworksEnum.zksyncMainnet,
        addresses: [
          '0xb2c5a37A4C37c16DDd21181F6Ddbc989c3D36cDC',
          '0xD68e01Ce7ae75E6B31C221BD3CdE43CBBEb320dD',
          '0xf03f4Bf48b108360bAf1597Fb8053Ebe0F5245dA',
        ],
      },
      {
        network: NetworksEnum.arbitrumMainnet,
        addresses: [
          '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
          '0xE81f7AE0c574BA1BDF6796ce8564353eeE7d99BC',
          '0xb98c7e67f63d198BD96574073AD5B3427a835796',
        ],
      },
      {
        network: NetworksEnum.baseMainnet,
        addresses: ['0x9DF1188C78D9dd58823BDDc19dcE5A473566b53b', '0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a'],
      },
      {
        network: NetworksEnum.zksyncSepolia,
        addresses: ['0x581dd8a76420652142F15d2486CD8C6726413f8B'],
      },
      {
        network: NetworksEnum.ethereumSepolia,
        addresses: [
          '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
          '0xEFc3F113f7031924A9f5Cfe634F866305419fCCA',
          '0xfa077A1CA6F02AffeC4eC61Dfd8610e73DA57325',
        ],
      },
      {
        network: NetworksEnum.polygonMainnet,
        addresses: ['0x45EB8DeEBFDB162e14b8C7992A0B007BF6a41860', '0xD3596C81FcAb699192dc79C8e25f1362E3dFf89A'],
      },
      {
        network: NetworksEnum.peaqMainnet,
        addresses: ['0x0000000000000000000000000000000000000809', '0x2ee4dd6653B0eC4bbcE4eAEedC2D46411707B260'],
      },
      {
        network: NetworksEnum.cornMainnet,
        addresses: ['0xda5dDd7270381A7C2717aD10D1c0ecB19e3CDFb2', '0x9Aa0EC050ff566f9f939C2a41A0408db7ddBCf75'],
      },
      {
        network: NetworksEnum.avaxMainnet,
        addresses: ['0xD92812776dc0ACe616628b1524791Fa761080f73', '0x6dB369F836607c4a74282A2327ECB0f2D022507d'],
      },
    ]

    for (const token of tokens) {
      const nativeToken = await ProxyToken.saveAndGetToken(utils.zeroAddress, token.network)
      expect(!!nativeToken).to.be.true
      console.log(nativeToken)

      for (const address of token.addresses) {
        const tokenDb = await ProxyToken.saveAndGetToken(address, token.network)
        expect(!!tokenDb).to.be.true
        console.log(tokenDb)
      }
    }
  })

  it.only('should do a test of sync a complete dao', async function () {
    this.timeout(10000000000)
    const network = NetworksEnum.arbitrumMainnet
    const daoAddress = '0x108f48E558078C8eF2eb428E0774d7eCd01F6B1d'

    const libUtil = new LibUtils({
      daoAddress,
      network,
      config: {
        sandbox,
      },
    })

    await libUtil.syncCompleteDao(15500000)
  })
})
