import { telegramErrorMeta } from '@services/aragon-telegram/helpers/telegramError'
import { expect } from 'chai'
import { GrammyError } from 'grammy'

const grammyError = (errorCode: number, description: string) =>
  new GrammyError(
    `Call to 'sendMessage' failed! (${errorCode}: ${description})`,
    { ok: false, error_code: errorCode, description },
    'sendMessage',
    { chat_id: 123456789, text: 'New proposal in Andr DAO' },
  )

describe('AragonTelegram: telegramErrorMeta', () => {
  it('keeps the failure details of a Telegram API error and drops the payload', () => {
    const meta = telegramErrorMeta(grammyError(400, 'Bad Request: message is too long'))

    expect(meta).to.deep.eq({
      name: 'GrammyError',
      description: 'Bad Request: message is too long',
      errorCode: 400,
      method: 'sendMessage',
    })
  })

  it('never lets the chat id or message text through', () => {
    const meta = telegramErrorMeta(grammyError(403, 'Forbidden: bot was blocked by the user'))

    const serialized = JSON.stringify(meta)
    expect(serialized).to.not.include('123456789')
    expect(serialized).to.not.include('chat_id')
    expect(serialized).to.not.include('Andr DAO')
  })

  it('reports a plain error by name and message', () => {
    const meta = telegramErrorMeta(new TypeError('fetch failed'))
    expect(meta).to.deep.eq({ name: 'TypeError', description: 'fetch failed' })
  })

  it('falls back to a string for anything that is not an error', () => {
    expect(telegramErrorMeta('socket hang up')).to.deep.eq({
      name: 'UnknownError',
      description: 'socket hang up',
    })
  })
})
