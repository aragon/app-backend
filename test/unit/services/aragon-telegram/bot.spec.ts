import { TelegramBotApp } from '@services/aragon-telegram/bot'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

// Plausible-looking placeholder; grammy's `Bot` only validates shape, not validity.
const FAKE_TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi'

describe('AragonTelegram: TelegramBotApp', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('constructs without throwing and exposes the underlying grammy api', () => {
    const app = new TelegramBotApp(FAKE_TOKEN)
    const api = app.getApi()
    expect(api).to.exist
    expect(typeof api.sendMessage).to.eq('function')
  })

  it('registerMenu publishes the BotFather command list, including /privacy', async () => {
    const app = new TelegramBotApp(FAKE_TOKEN)
    const setMyCommands = sandbox.stub(app.getApi(), 'setMyCommands').resolves(true)
    await app.registerMenu()
    expect(setMyCommands.calledOnce).to.be.true
    const cmds = setMyCommands.firstCall.args[0] as Array<{ command: string }>
    const names = cmds.map(c => c.command)
    expect(names).to.include('start')
    expect(names).to.include('subscribe')
    expect(names).to.include('unsubscribe')
    expect(names).to.include('dao')
    expect(names).to.include('privacy')
    expect(names).to.include('forget')
  })
})
