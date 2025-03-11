import * as sinon from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import { SubscanProvider } from '@providers/assetTransafersProvider/subscanProvider'
import { AlchemyProvider } from '@providers/assetTransafersProvider/alchemyProvider'
import AssetTransferProvider from '@providers/assetTransafersProvider/providerFactory'

describe('Asset Transfer Provider Factory', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should get account transfers on peqa', async () => {
    const getAssetTransfersStubWithSubscan = sandbox.stub(SubscanProvider, 'getAssetTransfers').resolves([
      {
        tokenBalance: '1',
        contractAddress: '0xTokenContract',
      },
    ])

    const getAssetTransfersStubWithAlchemy = sandbox.stub(AlchemyProvider, 'getAssetTransfers').resolves([
      {
        tokenBalance: '1',
        contractAddress: '0xTokenContract',
      },
    ])

    const dao = {
      address: 'daoAddress',
      network: NetworksEnum.peaqMainnet,
    }

    const onTx = async (_txLog: any, _side: any, _dao: any) => {
      return
    }

    await AssetTransferProvider.getAssetTransfers(dao as any, onTx)
    expect(getAssetTransfersStubWithAlchemy.calledOnce).to.be.false
    expect(getAssetTransfersStubWithSubscan.calledOnce).to.be.true
    expect(getAssetTransfersStubWithSubscan.calledWith(dao, onTx)).to.be.true
  })

  it('should get account transfers on other alchemy', async () => {
    const getAssetTransfersStubWithSubscan = sandbox.stub(SubscanProvider, 'getAssetTransfers').resolves([
      {
        tokenBalance: '1',
        contractAddress: '0xTokenContract',
      },
    ])

    const getAssetTransfersStubWithAlchemy = sandbox.stub(AlchemyProvider, 'getAssetTransfers').resolves([
      {
        tokenBalance: '1',
        contractAddress: '0xTokenContract',
      },
    ])

    const dao = {
      address: 'daoAddress',
      network: NetworksEnum.ethereumMainnet,
    }

    const onTx = async (_txLog: any, _side: any, _dao: any) => {
      return
    }

    await AssetTransferProvider.getAssetTransfers(dao as any, onTx)
    expect(getAssetTransfersStubWithSubscan.calledOnce).to.be.false
    expect(getAssetTransfersStubWithAlchemy.calledOnce).to.be.true
    expect(getAssetTransfersStubWithAlchemy.calledWith(dao, onTx)).to.be.true
  })
})
