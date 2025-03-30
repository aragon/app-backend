import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import { SubscanProvider } from '@providers/assetTransafersProvider/subscanProvider'
import SubscanApi from '@helpers/subscanApi'
import { ProxyToken } from '@modules/proxyToken'

import type Dao from '@models/schema/dao'
import { ITransactionType, ITokenType, NetworksEnum } from '@types'

describe('Providers: SubscanProvider', () => {
  let sandbox: SinonSandbox
  let dao: Dao
  let fakeAssetTransfer: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    // Create a dummy dao object
    dao = {
      address: '0xDaoAddress',
      network: NetworksEnum.peaqMainnet, // or NetworksEnum.peaqMainnet if using enum
    } as any

    fakeAssetTransfer = [
      {
        from: '0xSomeAddress',
        to: '0xOtherAddress',
        value: '1000',
        blockNum: 10,
        blockTimestamp: 1622548800,
        hash: '0xTxHash1',
        category: 'external' as 'external' | 'erc20',
        uniqueId: 'unique1',
        rawContract: { address: '0xContract1', decimals: 18, name: 'test', symbol: 'test', priceUsd: '0', value: '0' },
      },
    ]
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should not call onTx if token info is not available', async () => {
    sandbox.stub(SubscanApi, 'getAssetTransfer').resolves(fakeAssetTransfer)
    // Stub ProxyToken.saveAndGetToken to return null
    sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
    // Create an onTx stub
    const onTxStub = sandbox.stub().resolves()

    await SubscanProvider.getAssetTransfers(dao, onTxStub)
    expect(onTxStub.notCalled).to.be.true
  })

  it('should not call onTx if token is identified as scam', async () => {
    sandbox.stub(SubscanApi, 'getAssetTransfer').resolves(fakeAssetTransfer)
    const tokenInfo = {
      decimals: 18,
      name: 'Scam Token',
      symbol: 'SCAM',
      priceUsd: '0.1',
      type: ITokenType.ERC20,
    }
    sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(tokenInfo as any)
    sandbox.stub(ProxyToken, 'analyzeIfScamToken').returns(true)
    const onTxStub = sandbox.stub().resolves()

    await SubscanProvider.getAssetTransfers(dao, onTxStub)
    expect(onTxStub.notCalled).to.be.true
  })

  it('should process valid transfers and call onTx with proper transfer logs', async () => {
    const assetTransfers = [
      {
        from: dao.address,
        to: '0xRecipient1',
        value: '1000',
        blockNum: 10,
        blockTimestamp: 1622548801, // example timestamp as a number
        hash: '0xTxHash1',
        category: 'external',
        uniqueId: 'unique1',
        rawContract: { address: '0xContract1', decimals: 18 },
      },
      {
        from: '0xOtherAddress',
        to: dao.address,
        value: '1000000000000000000', // 1 token in wei with 18 decimals
        blockNum: 20,
        blockTimestamp: 1622548800, // example timestamp as a number
        hash: '0xTxHash2',
        category: 'erc20',
        uniqueId: 'unique2',
        rawContract: { address: '0xContract2', decimals: 18 },
      },
    ]
    sandbox.stub(SubscanApi, 'getAssetTransfer').resolves(assetTransfers as any)

    const tokenInfoStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
    tokenInfoStub.withArgs('0xContract1', dao.network).resolves({
      decimals: 18,
      name: 'TokenOne',
      symbol: 'TK1',
      priceUsd: '2',
      type: ITokenType.ERC20,
    } as any)
    tokenInfoStub.withArgs('0xContract2', dao.network).resolves({
      decimals: 18,
      name: 'TokenTwo',
      symbol: 'TK2',
      priceUsd: '3',
      type: ITokenType.ERC20,
    } as any)

    sandbox.stub(ProxyToken, 'analyzeIfScamToken').returns(false)

    const onTxStub = sandbox.stub().resolves()

    await SubscanProvider.getAssetTransfers(dao, onTxStub)
    expect(onTxStub.callCount).to.equal(2)
    const expectedTransferLog1 = {
      from: '0xDaoAddress',
      to: '0xRecipient1',
      value: '1000',
      blockNum: 10,
      blockTimestamp: 1622548801,
      hash: '0xTxHash1',
      category: 'external',
      uniqueId: 'unique1',
      rawContract: {
        address: '0xContract1',
        decimals: 18,
        name: 'TokenOne',
        symbol: 'TK1',
        priceUsd: '2',
        priceUpdatedAt: 1622548801,
        type: ITokenType.ERC20,
      },
    }

    const expectedTransferLog2 = {
      from: '0xOtherAddress',
      to: '0xDaoAddress',
      value: '1.0',
      blockNum: 20,
      blockTimestamp: 1622548800,
      hash: '0xTxHash2',
      category: 'erc20',
      uniqueId: 'unique2',
      rawContract: {
        address: '0xContract2',
        decimals: 18,
        name: 'TokenTwo',
        symbol: 'TK2',
        priceUsd: '3',
        priceUpdatedAt: 1622548800,
        type: ITokenType.ERC20,
      },
    }
    expect(onTxStub.firstCall.args[0]).to.deep.eq(expectedTransferLog1)
    expect(onTxStub.firstCall.args[1]).to.eq(ITransactionType.withdraw)
    expect(onTxStub.firstCall.args[2]).to.deep.eq(dao)
    expect(onTxStub.secondCall.args[0]).to.deep.eq(expectedTransferLog2)
    expect(onTxStub.secondCall.args[1]).to.eq(ITransactionType.deposit)
    expect(onTxStub.secondCall.args[2]).to.deep.eq(dao)
  })
})
