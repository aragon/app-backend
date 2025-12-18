import { ConfigEvents, ConfigState } from '@state/configState'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('State: ConfigState', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    ConfigState.instance = undefined as any
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should enforce a singleton pattern', () => {
    const firstInstance = ConfigState.getInstance()
    const secondInstance = ConfigState.getInstance()
    expect(firstInstance).to.equal(secondInstance)
  })

  it('should allow setting and getting a config item', () => {
    const configState = ConfigState.getInstance()
    configState.setConfigItem('testKey', 'testValue')
    expect(configState.getConfigItem('testKey')).to.equal('testValue')
  })

  it('should emit CONFIG_UPDATED on setConfigItem', done => {
    const configState = ConfigState.getInstance()
    configState.addConfigListener(ConfigEvents.CONFIG_UPDATED, ({ key, value }) => {
      expect(key).to.equal('testKey')
      expect(value).to.equal('testValue')
      done()
    })
    configState.setConfigItem('testKey', 'testValue')
  })

  it('should allow removing a config item', () => {
    const configState = ConfigState.getInstance()
    configState.setConfigItem('testKey', 'testValue')
    configState.removeConfigItem('testKey')
    expect(configState.getConfigItem('testKey')).to.be.undefined
  })

  it('should emit CONFIG_ITEM_REMOVED on removeConfigItem', done => {
    const configState = ConfigState.getInstance()
    configState.setConfigItem('testKey', 'testValue')
    configState.addConfigListener(ConfigEvents.CONFIG_ITEM_REMOVED, ({ key, value }) => {
      expect(key).to.equal('testKey')
      expect(value).to.equal('testValue')
      done()
    })
    configState.removeConfigItem('testKey')
  })

  it('should correctly manage event listeners', () => {
    const configState = ConfigState.getInstance()
    const callback = sandbox.fake()
    configState.addConfigListener(ConfigEvents.CONFIG_UPDATED, callback)
    configState.setConfigItem('testKey', 'testValue')
    configState.removeConfigListener(ConfigEvents.CONFIG_UPDATED, callback)
    configState.setConfigItem('testKey2', 'testValue2')
    expect(callback.callCount).to.equal(1)
  })

  it('should return all config items correctly', () => {
    const configState = ConfigState.getInstance()
    configState.setConfigItem('testKey1', 'testValue1')
    configState.setConfigItem('testKey2', 'testValue2')

    const allConfigItems = configState.getAllConfigItems()

    expect(allConfigItems).to.deep.equal({
      testKey1: 'testValue1',
      testKey2: 'testValue2',
    })

    allConfigItems['testKey3'] = 'testValue3'
    expect(configState.getConfigItem('testKey3')).to.be.undefined // Ensure 'testKey3' was not actually added to the config
  })
})
