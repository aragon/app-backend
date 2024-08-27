// import * as sinon from 'sinon'
// import { SinonSandbox } from 'sinon'
// import { expect } from 'chai'
// import { DaoAssets } from '@rates/daoAsset'
// import { Models } from '@dbModels'
// import DBCrawler from '@models/utils/crawler'
// import { HexAddress, IAlchemyTokenBalance, ITokenType, NetworksEnum } from '@types'
// import Logger from '@logger'
// import type Dao from '@models/schema/dao'
// import Web3Helper from '@helpers/web3'
// import utils from '@helpers/utils'
// import logger from '@logger'
// import { ProxyToken } from '@modules/proxyToken'
//
// describe('Indexer:Aggregator:Assets', () => {
//   let sandbox: SinonSandbox
//
//   beforeEach(async () => {
//     sandbox = sinon.createSandbox()
//   })
//
//   afterEach(async () => {
//     sandbox?.restore()
//   })
//
//   describe('start', async () => {
//     it('should start the AggregatorAssets', async () => {
//       const stubLogger = sandbox.stub(Logger, 'verbose')
//       const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')
//
//       await DaoAssets.start()
//
//       expect(stubLogger.calledWith('End DaoAssets' as any)).to.be.true
//       expect(crawlerStub.calledOnce).to.be.true
//     })
//
//     it('should error the DaoAssets', async () => {
//       const stubLoggerError = sandbox.stub(Logger, 'error')
//       const stubLogger = sandbox.stub(Logger, 'verbose')
//       const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
//         await this.onError(true)
//       })
//
//       await DaoAssets.start()
//
//       expect(stubLogger.calledWith('End DaoAssets' as any)).to.be.true
//       expect(stubLoggerError.calledOnce).to.be.true
//       expect(crawlerStub.calledOnce).to.be.true
//     })
//   })
//
//   describe('onDocument', async () => {
//     it('should call onDocument and create asset', async () => {
//       const document: Partial<Dao> = {
//         address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
//         network: NetworksEnum.ethereumMainnet,
//       }
//       const fakeEthBalance = '1000000000000000000'
//       const fakeTokenBalances: IAlchemyTokenBalance[] = [
//         { contractAddress: '0xTokenAddress1', tokenBalance: '150000' },
//         { contractAddress: '0xTokenAddress2', tokenBalance: '200000' },
//       ]
//       const fakeNativeToken = {
//         address: utils.zeroAddress,
//         name: 'Token3',
//         symbol: 'T3',
//         decimals: 18,
//         network: document.network,
//       }
//
//       const fakeToken = {
//         address: fakeTokenBalances[0].contractAddress,
//         name: 'Token1',
//         symbol: 'T1',
//         decimals: 18,
//         network: document.network,
//       }
//
//       const fakeToken2 = {
//         address: fakeTokenBalances[1].contractAddress,
//         name: 'Token2',
//         symbol: 'T2',
//         decimals: 18,
//         network: document.network,
//       }
//
//       const stubDaoTvl = sandbox.stub(DaoAssets, 'daoTvl').resolves()
//       const stubGetBalance = sandbox.stub(Web3Helper, 'getBalance').resolves(fakeEthBalance as any)
//       const stubGetTokenBalances = sandbox.stub(Web3Helper, 'getTokenBalances').resolves(fakeTokenBalances as any)
//       const stubGetToken = sandbox
//         .stub(ProxyToken, 'saveAndGetToken')
//         .onCall(0)
//         .resolves(fakeNativeToken as any)
//         .onCall(1)
//         .resolves(fakeToken as any)
//         .onCall(2)
//         .resolves(fakeToken2 as any)
//       const stubLogger = sandbox.stub(Logger, 'verbose')
//
//       await DaoAssets.onDocument(document as any)
//
//       expect(stubGetBalance.callCount).to.eq(1)
//       expect(stubGetBalance.calledWith(document.address, document.network)).to.be.true
//       expect(stubGetTokenBalances.callCount).to.eq(1)
//       expect(stubGetTokenBalances.calledWith(document.address, document.network)).to.be.true
//       expect(stubGetToken.calledThrice).to.be.true
//       expect(stubLogger.calledThrice).to.be.true
//
//       const assets = await Models.Asset.findAssetsByDao(
//         document.address as HexAddress,
//         document.network as NetworksEnum,
//       )
//       expect(assets.length).to.equal(3)
//       expect(stubDaoTvl.calledOnce).to.be.true
//
//       const asset1 = assets.find((asset: any) => asset.tokenAddress === fakeTokenBalances[0].contractAddress)
//       const asset2 = assets.find((asset: any) => asset.tokenAddress === fakeTokenBalances[1].contractAddress)
//       const asset3 = assets.find((asset: any) => asset.tokenAddress === utils.zeroAddress)
//
//       expect(asset1.daoAddress).to.equal(document.address)
//       expect(asset1.network).to.equal(document.network)
//       expect(asset1.tokenAddress).to.equal(fakeTokenBalances[0].contractAddress)
//       expect(asset1.amount).to.equal(fakeTokenBalances[0].tokenBalance)
//
//       expect(asset2.daoAddress).to.equal(document.address)
//       expect(asset2.network).to.equal(document.network)
//       expect(asset2.tokenAddress).to.equal(fakeTokenBalances[1].contractAddress)
//       expect(asset2.amount).to.equal(fakeTokenBalances[1].tokenBalance)
//
//       expect(asset3.daoAddress).to.equal(document.address)
//       expect(asset3.network).to.equal(document.network)
//       expect(asset3.tokenAddress).to.equal(fakeNativeToken.address)
//       expect(asset3.amount).to.equal(fakeEthBalance)
//     })
//
//     it('should call onDocument and update asset', async () => {
//       const document: Partial<Dao> = {
//         address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
//         network: NetworksEnum.ethereumMainnet,
//       }
//       const fakeEthBalance = '5000000000000000000'
//       const fakeTokenBalances: IAlchemyTokenBalance[] = [{ contractAddress: '0xTokenAddress1', tokenBalance: '550000' }]
//
//       await Models.Asset.create({
//         network: NetworksEnum.ethereumMainnet,
//         daoAddress: document.address,
//         tokenAddress: utils.zeroAddress,
//         amount: '1000000000000000000',
//       })
//
//       await Models.Asset.create({
//         network: NetworksEnum.ethereumMainnet,
//         daoAddress: document.address,
//         tokenAddress: fakeTokenBalances[0].contractAddress,
//         amount: '150000',
//       })
//
//       const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
//         address: fakeTokenBalances[0].contractAddress,
//       } as any)
//       const stubGetBalance = sandbox.stub(Web3Helper, 'getBalance').resolves(fakeEthBalance as any)
//       const stubGetTokenBalances = sandbox.stub(Web3Helper, 'getTokenBalances').resolves(fakeTokenBalances as any)
//       const stubLogger = sandbox.stub(Logger, 'verbose')
//       const stubDaoTvl = sandbox.stub(DaoAssets, 'daoTvl').resolves()
//
//       await DaoAssets.onDocument(document as any)
//
//       expect(stubGetBalance.callCount).to.eq(1)
//       expect(stubGetBalance.calledWith(document.address, document.network)).to.be.true
//       expect(stubGetTokenBalances.callCount).to.eq(1)
//       expect(stubGetTokenBalances.calledWith(document.address, document.network)).to.be.true
//       expect(stubLogger.calledTwice).to.be.true
//       expect(saveAndGetTokenStub.calledTwice).to.be.true
//       expect(stubDaoTvl.calledOnce).to.be.true
//
//       const asset = await Models.Asset.findExistingLog({
//         daoAddress: document.address as HexAddress,
//         tokenAddress: fakeTokenBalances[0].contractAddress as HexAddress,
//         network: document.network as NetworksEnum,
//       })
//       expect(asset.daoAddress).to.equal(document.address)
//       expect(asset.network).to.equal(document.network)
//       expect(asset.tokenAddress).to.equal(fakeTokenBalances[0].contractAddress)
//       expect(asset.amount).to.equal(fakeTokenBalances[0].tokenBalance)
//
//       const asset2 = await Models.Asset.findExistingLog({
//         daoAddress: document.address as HexAddress,
//         tokenAddress: utils.zeroAddress as HexAddress,
//         network: document.network as NetworksEnum,
//       })
//       expect(asset2.daoAddress).to.equal(document.address)
//       expect(asset2.tokenAddress).to.equal(utils.zeroAddress)
//       expect(asset2.amount).to.equal(fakeEthBalance)
//     })
//
//     it('should call onDocument and fail', async () => {
//       const document: Partial<Dao> = {
//         address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
//         network: NetworksEnum.ethereumMainnet,
//       }
//
//       const stubGetBalance = sandbox.stub(Web3Helper, 'getBalance').rejects(new Error('Error'))
//       const stubLogger = sandbox.stub(Logger, 'error')
//
//       await DaoAssets.onDocument(document as any)
//
//       expect(stubGetBalance.callCount).to.eq(1)
//       expect(stubGetBalance.calledWith(document.address, document.network)).to.be.true
//       expect(stubLogger.calledOnce).to.be.true
//     })
//   })
//
//   it('daoTvl', async () => {
//     const daoDb = await Models.Dao.create({
//       blockTimestamp: 1719577230,
//       address: '0xee0627bA21e9114336977482372486d084497efa',
//       creatorAddress: '0xEFbB4E6e5CF4bB4Ae8Cdc2c109da90D2a2433B50',
//       network: NetworksEnum.ethereumMainnet,
//       tvlUSD: 0,
//     } as any)
//
//     const tokenNativeDb = await Models.Token.create({
//       network: NetworksEnum.ethereumMainnet,
//       type: ITokenType.ERC20,
//       address: utils.zeroAddress,
//       logo: 'fake-logo',
//       name: 'ethereum',
//       symbol: 'ETH',
//       decimals: 18,
//       holders: 10,
//       totalSupply: '100',
//       priceChangeOnDayUsd: '1',
//       priceUsd: '100',
//     })
//
//     const tokenDb = await Models.Token.create({
//       network: NetworksEnum.ethereumMainnet,
//       type: ITokenType.ERC20,
//       address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
//       logo: 'fake-logo',
//       name: 'ethereum',
//       symbol: 'WETH',
//       decimals: 18,
//       holders: 10,
//       totalSupply: '100',
//       priceChangeOnDayUsd: '1',
//       priceUsd: '1',
//     })
//
//     await Models.Asset.create({
//       network: NetworksEnum.ethereumMainnet,
//       daoAddress: daoDb.address,
//       tokenAddress: tokenNativeDb.address,
//       amount: '1000000000000000000',
//     })
//
//     await Models.Asset.create({
//       network: NetworksEnum.ethereumMainnet,
//       daoAddress: daoDb.address,
//       tokenAddress: tokenDb.address,
//       amount: '500000000000000000',
//     })
//
//     const stubLogger = sandbox.stub(logger, 'verbose')
//
//     await DaoAssets.daoTvl(daoDb.address, daoDb.network)
//
//     const reloadDao = await daoDb.reload()
//
//     expect(reloadDao.tvlUSD).to.be.equal(100.5)
//     expect(stubLogger.calledOnceWith('Update Dao tvlUSD' as any)).to.be.true
//   })
// })
