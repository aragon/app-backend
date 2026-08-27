import logger from '@logger'
import { TelegramBotApp } from '@services/aragon-telegram/bot'
import { expect } from 'chai'
import { type Bot, type Context } from 'grammy'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

// Plausible-looking placeholder; grammy's `Bot` only validates shape, not validity.
const FAKE_TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi'

const BOT_INFO = {
  id: 42,
  is_bot: true as const,
  first_name: 'Aragon',
  username: 'aragon_test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
}

/**
 * Prepares an app for `handleUpdate`-driven tests: sets botInfo (skips the
 * getMe init call) and installs an outermost API transformer so no request
 * ever reaches the network. Returns the inner bot and the captured API calls.
 */
const testable = (app: TelegramBotApp) => {
  const bot = (app as any).bot as Bot<Context>
  bot.botInfo = BOT_INFO
  const apiCalls: { method: string; payload: any }[] = []
  bot.api.config.use(async (_prev, method, payload) => {
    apiCalls.push({ method, payload })
    return { ok: true as const, result: true as any }
  })
  return { bot, apiCalls }
}

let updateId = 1000
const textUpdate = (chatType: 'private' | 'group', userId: number, text = 'hello'): any => ({
  update_id: updateId++,
  message: {
    message_id: updateId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: userId, type: chatType, ...(chatType === 'private' ? { first_name: 'U' } : { title: 'G' }) },
    from: { id: userId, is_bot: false, first_name: 'U' },
    text,
  },
})

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
    const cmds = setMyCommands.firstCall.args[0] as unknown as Array<{ command: string }>
    const names = cmds.map(c => c.command)
    expect(names).to.include('start')
    expect(names).to.include('subscribe')
    expect(names).to.include('unsubscribe')
    expect(names).to.include('dao')
    expect(names).to.include('privacy')
    expect(names).to.include('forget')
  })

  it('processes private-chat updates but drops group-chat updates', async () => {
    const app = new TelegramBotApp(FAKE_TOKEN)
    const { bot, apiCalls } = testable(app)

    await bot.handleUpdate(textUpdate('private', 111))
    expect(apiCalls.length, 'private update should get a reply').to.be.greaterThan(0)

    const before = apiCalls.length
    await bot.handleUpdate(textUpdate('group', 112))
    expect(apiCalls.length, 'group update should be dropped').to.eq(before)
  })

  it('answers unrecognized text with a pointer to /help instead of silence', async () => {
    const app = new TelegramBotApp(FAKE_TOKEN)
    const { bot, apiCalls } = testable(app)

    await bot.handleUpdate(textUpdate('private', 113, 'hey blah blah'))
    const reply = apiCalls.find(c => c.method === 'sendMessage')
    expect(reply).to.exist
    expect(String(reply!.payload.text)).to.include("isn't a command")
    expect(String(reply!.payload.text)).to.include('/help')
  })

  it('treats a pasted organization reference as a subscribe request', async () => {
    const { Models } = await import('@dbModels')
    sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
    const app = new TelegramBotApp(FAKE_TOKEN)
    const { bot, apiCalls } = testable(app)

    await bot.handleUpdate(
      textUpdate(
        'private',
        114,
        'https://app.aragon.org/dao/ethereum-sepolia/0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df',
      ),
    )
    const reply = apiCalls.find(c => c.method === 'sendMessage')
    expect(reply).to.exist
    // The parser accepted the reference and the subscribe flow answered (org unknown here).
    expect(String(reply!.payload.text)).to.include('Organization not found')
  })

  it('rate-limits a user flooding updates and replies once with a slow-down notice', async () => {
    const app = new TelegramBotApp(FAKE_TOKEN)
    const { bot, apiCalls } = testable(app)

    for (let i = 0; i < 7; i++) {
      await bot.handleUpdate(textUpdate('private', 222))
    }

    const notices = apiCalls.filter(
      c => c.method === 'sendMessage' && String(c.payload.text).includes('Too many messages'),
    )
    expect(notices.length).to.be.greaterThan(0)
  })

  it('catches middleware errors, logs them, and apologizes to the user', async () => {
    const app = new TelegramBotApp(FAKE_TOKEN)
    const { bot, apiCalls } = testable(app)
    const errorStub = sandbox.stub(logger, 'error')
    // The text fallback consumes message updates, so trigger the crash from a
    // callback update that no registered callbackQuery pattern matches.
    bot.on('callback_query', () => {
      throw new Error('boom')
    })

    // handleUpdate re-throws a BotError; the runner is what feeds it into
    // `bot.catch`. Simulate that hand-off here.
    try {
      await bot.handleUpdate({
        update_id: updateId++,
        callback_query: {
          id: 'cq1',
          from: { id: 333, is_bot: false, first_name: 'U' },
          chat_instance: 'ci',
          data: 'zz:nomatch',
          message: {
            message_id: updateId,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 333, type: 'private', first_name: 'U' },
          },
        },
      } as any)
    } catch (err: any) {
      await (bot as any).errorHandler(err)
    }

    expect(errorStub.calledOnce).to.be.true
    const apology = apiCalls.find(c => c.method === 'sendMessage' && String(c.payload.text).includes('went wrong'))
    expect(apology).to.exist
  })

  it('swallows API failures when sending the rate-limit notice and the apology', async () => {
    const app = new TelegramBotApp(FAKE_TOKEN)
    const bot = (app as any).bot as Bot<Context>
    bot.botInfo = BOT_INFO
    bot.api.config.use(async () => {
      throw new Error('api down')
    })
    const errorStub = sandbox.stub(logger, 'error')

    // Flood one user past the rate limit — the slow-down reply fails and is swallowed.
    for (let i = 0; i < 7; i++) {
      await bot.handleUpdate(textUpdate('private', 444))
    }

    // Crash a callback handler for a fresh user — the apology reply fails and is swallowed.
    bot.on('callback_query', () => {
      throw new Error('boom')
    })
    try {
      await bot.handleUpdate({
        update_id: updateId++,
        callback_query: {
          id: 'cq2',
          from: { id: 445, is_bot: false, first_name: 'U' },
          chat_instance: 'ci',
          data: 'zz:nomatch',
          message: {
            message_id: updateId,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 445, type: 'private', first_name: 'U' },
          },
        },
      } as any)
    } catch (err: any) {
      await (bot as any).errorHandler(err)
    }

    expect(errorStub.called).to.be.true
  })

  it('start begins polling via the runner and stop halts it exactly once', async () => {
    const stopStub = sinon.stub().resolves()
    const runStub = sinon.stub().returns({ stop: stopStub })
    const { TelegramBotApp: MockedApp } = proxyquire('@services/aragon-telegram/bot', {
      '@grammyjs/runner': { run: runStub },
    })

    const app = new MockedApp(FAKE_TOKEN)
    app.start()
    expect(runStub.calledOnce).to.be.true

    await app.stop()
    expect(stopStub.calledOnce).to.be.true

    // Second stop is a no-op — the runner handle is already cleared.
    await app.stop()
    expect(stopStub.calledOnce).to.be.true
  })
})
