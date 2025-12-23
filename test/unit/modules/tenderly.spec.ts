import config from '@config'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import TenderlyModule from '@modules/tenderly'
import { ISimulationStatus, NetworksEnum } from '@types'
import axios from 'axios'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Module: tenderly', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('baseUrl', () => {
    it('should return correct base URL format', () => {
      sandbox.stub(config, 'TENDERLY').value({
        API_URL: 'https://api.tenderly.co/api/v1',
        USER: 'test-user',
        PROJECT: 'test-project',
      })

      const result = TenderlyModule.baseUrl()
      expect(result).to.equal('https://api.tenderly.co/api/v1/account/test-user/project/test-project')
    })
  })

  describe('isConfigured', () => {
    it('should return true when all config values are present', () => {
      sandbox.stub(config, 'TENDERLY').value({
        PROJECT: 'test-project',
        USER: 'test-user',
        ACCESS_KEY: 'test-key',
      })

      const result = TenderlyModule.isConfigured()
      expect(result).to.be.true
    })

    it('should return false when PROJECT is missing', () => {
      sandbox.stub(config, 'TENDERLY').value({
        PROJECT: '',
        USER: 'test-user',
        ACCESS_KEY: 'test-key',
      })

      const result = TenderlyModule.isConfigured()
      expect(result).to.be.false
    })

    it('should return false when USER is missing', () => {
      sandbox.stub(config, 'TENDERLY').value({
        PROJECT: 'test-project',
        USER: '',
        ACCESS_KEY: 'test-key',
      })

      const result = TenderlyModule.isConfigured()
      expect(result).to.be.false
    })

    it('should return false when ACCESS_KEY is missing', () => {
      sandbox.stub(config, 'TENDERLY').value({
        PROJECT: 'test-project',
        USER: 'test-user',
        ACCESS_KEY: '',
      })

      const result = TenderlyModule.isConfigured()
      expect(result).to.be.false
    })
  })

  describe('rpcCall', () => {
    it('should make successful axios post request', async () => {
      const mockResponse = { data: { success: true } }
      const axiosStub = sandbox.stub(axios, 'post').resolves(mockResponse)
      sandbox.stub(config, 'TENDERLY').value({
        ACCESS_KEY: 'test-key',
      })

      const result = await TenderlyModule.rpcCall('https://test.com', { test: 'data' })

      expect(axiosStub.calledOnce).to.be.true
      expect(axiosStub.firstCall.args[0]).to.equal('https://test.com')
      expect(axiosStub.firstCall.args[1]).to.deep.equal({ test: 'data' })
      expect(axiosStub.firstCall.args[2]).to.deep.include({
        headers: {
          'X-Access-Key': 'test-key',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      })
      expect(result).to.deep.equal({ success: true })
    })

    it('should handle axios error', async () => {
      sandbox.stub(axios, 'post').rejects(new Error('Network error'))
      sandbox.stub(config, 'TENDERLY').value({
        ACCESS_KEY: 'test-key',
      })

      const errorStub = sandbox.stub(logger, 'warn')

      const result = await TenderlyModule.rpcCall('https://test.com')

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.firstCall.args[0]).to.equal('Tenderly RPC call failed')

      expect(result).to.be.undefined
    })

    it('should include custom headers', async () => {
      const mockResponse = { data: { success: true } }
      const axiosStub = sandbox.stub(axios, 'post').resolves(mockResponse)
      sandbox.stub(config, 'TENDERLY').value({
        ACCESS_KEY: 'test-key',
      })

      await TenderlyModule.rpcCall('https://test.com', {}, { 'Custom-Header': 'custom-value' })

      expect(axiosStub?.firstCall?.args[2]?.headers).to.deep.include({
        'X-Access-Key': 'test-key',
        'Content-Type': 'application/json',
        'Custom-Header': 'custom-value',
      })
    })
  })

  describe('createShareableUrl', () => {
    it('should return false when not configured', async () => {
      sandbox.stub(TenderlyModule, 'isConfigured').returns(false)

      const result = await TenderlyModule.createShareableUrl('test-id')
      expect(result).to.be.false
    })

    it('should return share_url from response when available', async () => {
      sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
      sandbox.stub(TenderlyModule, 'baseUrl').returns('https://api.tenderly.co/account/user/project')
      sandbox.stub(TenderlyModule, 'rpcCall').resolves({ share_url: 'https://custom.share.url' })

      const result = await TenderlyModule.createShareableUrl('test-id')
      expect(result).to.equal('https://custom.share.url')
    })

    it('should return fallback URL when share_url not in response', async () => {
      sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
      sandbox.stub(TenderlyModule, 'baseUrl').returns('https://api.tenderly.co/account/user/project')
      sandbox.stub(TenderlyModule, 'rpcCall').resolves({})

      const result = await TenderlyModule.createShareableUrl('test-id')
      expect(result).to.equal('https://www.tdly.co/shared/simulation/test-id')
    })
  })

  describe('simulate', () => {
    const mockSimulation = {
      to: '0x1234567890123456789012345678901234567890',
      data: '0xabcdef',
      from: '0x0987654321098765432109876543210987654321',
    }

    it('should return false when not configured', async () => {
      sandbox.stub(TenderlyModule, 'isConfigured').returns(false)

      const result = await TenderlyModule.simulate(mockSimulation, NetworksEnum.ethereumMainnet)
      expect(result).to.be.false
    })

    it('should return success simulation result', async () => {
      sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(TenderlyModule, 'baseUrl').returns('https://api.tenderly.co/account/user/project')
      sandbox.stub(TenderlyModule, 'rpcCall').resolves({
        simulation: { id: 'sim-123' },
        transaction: { error_info: { error_message: '' } },
      })
      sandbox.stub(TenderlyModule, 'createShareableUrl').resolves('https://share.url')

      const result = await TenderlyModule.simulate(mockSimulation, NetworksEnum.ethereumMainnet)

      expect(result).to.deep.include({
        url: 'https://share.url',
        status: ISimulationStatus.SUCCESS,
      })
      expect((result as any).runAt).to.be.a('number')
    })

    it('should return failed simulation result when error message present', async () => {
      sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(TenderlyModule, 'baseUrl').returns('https://api.tenderly.co/account/user/project')
      sandbox.stub(TenderlyModule, 'rpcCall').resolves({
        simulation: { id: 'sim-123' },
        transaction: { error_info: { error_message: 'execution reverted' } },
      })
      sandbox.stub(TenderlyModule, 'createShareableUrl').resolves('https://share.url')

      const result = await TenderlyModule.simulate(mockSimulation, NetworksEnum.ethereumMainnet)

      expect(result).to.deep.include({
        url: 'https://share.url',
        status: ISimulationStatus.FAILED,
      })
    })

    it('should return false when no simulation ID in response', async () => {
      sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(TenderlyModule, 'baseUrl').returns('https://api.tenderly.co/account/user/project')
      sandbox.stub(TenderlyModule, 'rpcCall').resolves({})

      const result = await TenderlyModule.simulate(mockSimulation, NetworksEnum.ethereumMainnet)
      expect(result).to.be.false
    })

    it('should call rpcCall with correct simulation data', async () => {
      sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(TenderlyModule, 'baseUrl').returns('https://api.tenderly.co/account/user/project')
      const rpcCallStub = sandbox.stub(TenderlyModule, 'rpcCall').resolves({})

      await TenderlyModule.simulate(mockSimulation, NetworksEnum.ethereumMainnet)

      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.equal('https://api.tenderly.co/account/user/project/simulate')
      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        network_id: '1',
        from: mockSimulation.from,
        input: mockSimulation.data,
        to: mockSimulation.to,
        gas: 8000000,
        gas_price: '0',
        value: '0',
        save: true,
      })
    })

    it('should handle when createShareableUrl returns false', async () => {
      sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(TenderlyModule, 'baseUrl').returns('https://api.tenderly.co/account/user/project')
      sandbox.stub(TenderlyModule, 'rpcCall').resolves({
        simulation: { id: 'sim-123' },
        transaction: { error_info: { error_message: '' } },
      })
      sandbox.stub(TenderlyModule, 'createShareableUrl').resolves(false)

      const result = await TenderlyModule.simulate(mockSimulation, NetworksEnum.ethereumMainnet)

      expect(result).to.deep.include({
        url: undefined,
        status: ISimulationStatus.SUCCESS,
      })
    })
  })
})
