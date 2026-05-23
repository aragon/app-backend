import { Models } from '@dbModels'
import { MemberGovernanceFactory } from '@src/governance'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import CoinGeckoHelper from '@helpers/coinGecko'

describe('Integ: Delegation Events', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should do a test of sync a complete dao', async function () {
    this.timeout(10000000000)
    const network = NetworksEnum.ethereumMainnet
    const daoAddress = '0xf204245b0B05E9A0780761E326552A569c1D6ceb'

    sandbox.stub(CoinGeckoHelper, 'getToken').resolves(false)

    const libUtil = new LibUtils({
      daoAddress,
      network,
      config: {
        sandbox,
        blockLimit: 24624000,
      },
    })

    await libUtil.syncCompleteDao(24541644)

    const pluginAddress = '0x17a1688C56087aDe762721180e1cC1E831C73719'
    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)

    const governance = MemberGovernanceFactory.createFromPlugin(plugin)
    const members = await governance.findAndPaginateMembers({
      extraParams: {
        network,
        pluginAddress,
        tokenAddress: plugin.tokenAddress,
      },
    })

    expect(members.data).to.be.an('array').that.is.not.empty
    const expectedMembers = [
      '0x097c39E5E576A8706404CD0D81e05b522f5bCAfF',
      '0xA36baB9f9e2392c00A2251caF382f5559C00f4De',
      '0xD292e652c5e39f07B1211fB602C000fff01954Db',
      '0x899B0f364444e7faeD9E3A607341a2e9Ab350B01',
      '0x2c763b8760AA5946DB9602a8DE095000D0E292C4',
      '0x7601D3b38108C05b1e1B967C623B56a6d6f81989',
      '0x4717f20F534C1732a2F987a126181eeF5413Cad3',
    ]

    expect(members.data.length).to.equal(expectedMembers.length)
    expectedMembers.forEach(expectedMember => {
      const member = members.data.find((m: any) => m.address === expectedMember)
      expect(member).to.exist
    })
  })
})
