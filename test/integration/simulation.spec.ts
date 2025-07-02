import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import {NetworksEnum} from "@types";
import Web3Helper from "@helpers/web3";
import UnitDepUtils from "@test/lib/unit-dep/utils";

describe('Simulation', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should test', async () => {
    const network = NetworksEnum.chilizMainnet
    const txHashes = [
      '0x5e45339481b42299ed84bca76545bfd3748614da69708d3621c0519a850c19c4', //createDaoTxHash
      '0x66af2dab0dd4135e262675ddba71de4a48bf965b2c27f19221c6021000fef665', //pluginInstallationTxHashPrepare & proposal admin
      '0x34771a12dde0a84be07a1bbef860a8caaee8b141c5b9a0aec5b536f0da55fb33', //pluginInstallationTxHashApplied & proposal admin
      '0xf8d82988c91f1a92d6d5ecc1fb29853a685efe8b7257e4f8d316f7f18a1e34af', //proposal spp & proposal multiSig
      '0x02d5e3c344bf1b8be708a5f5fe0b72f860523abae85bdcb62d32cdd26778ee66', //proposal token-voting
    ]

    for (const txHash of txHashes) {
      const txReceipts = await Web3Helper.getTransactionReceipt(txHash, network)
      const logsDaoInstall = await UnitDepUtils.parseLogsByConfig(txReceipts?.logs! as any, network)

      for (const ev of logsDaoInstall) {
        await ev.handler(ev.event, ev.info)
      }
    }
  })
})
