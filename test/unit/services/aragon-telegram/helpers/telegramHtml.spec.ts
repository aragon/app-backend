import { htmlEscape } from '@services/aragon-telegram/helpers/telegramHtml'
import { expect } from 'chai'

describe('AragonTelegram: telegramHtml', () => {
  it('escapes text and HTML attribute characters', () => {
    expect(htmlEscape(`a & b < c > d " e ' f`)).to.eq('a &amp; b &lt; c &gt; d &quot; e &#39; f')
  })

  it('leaves ordinary text unchanged', () => {
    expect(htmlEscape('hello world')).to.eq('hello world')
    expect(htmlEscape('')).to.eq('')
  })
})
