import { htmlEscape, sanitizeDescriptionHtml } from '@services/aragon-telegram/helpers/telegramHtml'
import { expect } from 'chai'

describe('AragonTelegram: telegramHtml', () => {
  describe('htmlEscape', () => {
    it('escapes the five characters HTML attribute encoding cares about', () => {
      expect(htmlEscape(`a & b < c > d " e ' f`)).to.eq('a &amp; b &lt; c &gt; d &quot; e &#39; f')
    })

    it('escapes & first so &lt; is not double-encoded', () => {
      expect(htmlEscape('<')).to.eq('&lt;')
      expect(htmlEscape('&')).to.eq('&amp;')
      expect(htmlEscape('Tom & Jerry <show>')).to.eq('Tom &amp; Jerry &lt;show&gt;')
    })

    it('escapes double and single quotes so attribute values stay valid', () => {
      expect(htmlEscape('"')).to.eq('&quot;')
      expect(htmlEscape("'")).to.eq('&#39;')
      // Defends `<a href="${escape(x)}">` even if x contains a stray quote.
      expect(htmlEscape('a"b')).to.eq('a&quot;b')
    })

    it('passes through plain strings unchanged', () => {
      expect(htmlEscape('hello world')).to.eq('hello world')
      expect(htmlEscape('')).to.eq('')
    })
  })

  describe('sanitizeDescriptionHtml', () => {
    it('flattens <p>...</p> to blank lines', () => {
      const out = sanitizeDescriptionHtml('<p>One.</p><p>Two.</p>')
      expect(out).to.eq('One.\n\nTwo.')
    })

    it('converts <br> to a single newline', () => {
      const out = sanitizeDescriptionHtml('Line 1<br>Line 2<br/>Line 3')
      expect(out).to.eq('Line 1\nLine 2\nLine 3')
    })

    it('turns <ul><li> items into bullet lines', () => {
      const out = sanitizeDescriptionHtml('<ul><li>One</li><li>Two</li><li>Three</li></ul>')
      expect(out).to.include('• One')
      expect(out).to.include('• Two')
      expect(out).to.include('• Three')
      expect(out).to.not.include('<ul')
      expect(out).to.not.include('<li')
    })

    it('turns <ol><li> items into bullet lines (we do not preserve numbering)', () => {
      const out = sanitizeDescriptionHtml('<ol><li>First</li><li>Second</li></ol>')
      expect(out).to.include('• First')
      expect(out).to.include('• Second')
    })

    it('strips class, style, data-* attributes from supported inline tags', () => {
      const out = sanitizeDescriptionHtml(
        '<strong class="foo" data-x="1">bold</strong> and <code style="color:red">code</code>',
      )
      expect(out).to.eq('<strong>bold</strong> and <code>code</code>')
    })

    it('strips classes from <ul>/<li> wrappers (Aragon ships <ul class="tight" data-tight="true">)', () => {
      const out = sanitizeDescriptionHtml('<ul class="tight" data-tight="true"><li><p>Item</p></li></ul>')
      expect(out).to.not.include('class=')
      expect(out).to.not.include('data-')
      expect(out).to.include('• Item')
    })

    it('keeps <a href> with the href attribute only', () => {
      const out = sanitizeDescriptionHtml('Read <a href="https://example.com" target="_blank" rel="noopener">more</a>.')
      expect(out).to.eq('Read <a href="https://example.com">more</a>.')
    })

    it('escapes special characters inside the href so the attribute stays valid', () => {
      const out = sanitizeDescriptionHtml('<a href="https://x.test/?q=1&r=2">link</a>')
      expect(out).to.include('href="https://x.test/?q=1&amp;r=2"')
    })

    it('converts <h1>–<h6> to a bold line', () => {
      const out = sanitizeDescriptionHtml('<h2>Background</h2><p>body</p>')
      expect(out.startsWith('<b>Background</b>')).to.eq(true)
      expect(out).to.include('body')
    })

    it('strips tags Telegram does not support (div, span, table, img, font)', () => {
      const out = sanitizeDescriptionHtml(
        '<div class="x"><span style="color:red">red</span></div><table><tr><td>cell</td></tr></table><img src="a.png"/>',
      )
      expect(out).to.not.include('<div')
      expect(out).to.not.include('<span')
      expect(out).to.not.include('<table')
      expect(out).to.not.include('<td')
      expect(out).to.not.include('<img')
      // Inner text content of stripped containers is preserved.
      expect(out).to.include('red')
      expect(out).to.include('cell')
    })

    it('preserves all Telegram-supported inline tags', () => {
      const tags = ['b', 'strong', 'i', 'em', 'u', 's', 'del', 'code', 'pre', 'blockquote'] as const
      for (const t of tags) {
        const out = sanitizeDescriptionHtml(`<${t}>x</${t}>`)
        expect(out, `expected <${t}> to survive`).to.eq(`<${t}>x</${t}>`)
      }
    })

    it('decodes &nbsp; to a regular space', () => {
      const out = sanitizeDescriptionHtml('a&nbsp;b')
      expect(out).to.eq('a b')
    })

    it('collapses 3+ consecutive newlines down to 2', () => {
      const out = sanitizeDescriptionHtml('<p>One</p><p></p><p></p><p>Two</p>')
      expect(out).to.not.match(/\n{3,}/)
    })

    it('round-trips a full Aragon proposal description', () => {
      const input =
        '<p><strong>Background</strong></p>' +
        '<p>The v3 contracts have been live on mainnet for 4 months without external review.</p>' +
        '<p><strong>Scope</strong></p>' +
        '<ul class="tight" data-tight="true">' +
        '<li><p>Trail of Bits engagement: 4-week audit of <code>VotingEscrow.sol</code></p></li>' +
        '<li><p>Immunefi bounty: tiered payouts up to 5% of TVL</p></li>' +
        '</ul>' +
        '<p><br></p>'
      const out = sanitizeDescriptionHtml(input)

      // No unsupported tags or attributes survive.
      expect(out).to.not.include('<p>')
      expect(out).to.not.include('<br>')
      expect(out).to.not.include('<ul')
      expect(out).to.not.include('<li')
      expect(out).to.not.include('class=')
      expect(out).to.not.include('data-')

      // Supported inline content survives.
      expect(out).to.include('<strong>Background</strong>')
      expect(out).to.include('<strong>Scope</strong>')
      expect(out).to.include('<code>VotingEscrow.sol</code>')

      // Bullets render and paragraphs are spaced.
      expect(out).to.include('• Trail of Bits engagement')
      expect(out).to.include('• Immunefi bounty')
      expect(out).to.match(/<\/strong>\n\nThe v3 contracts/)
    })

    it('returns an empty string for empty input', () => {
      expect(sanitizeDescriptionHtml('')).to.eq('')
    })

    it('trims leading and trailing whitespace', () => {
      expect(sanitizeDescriptionHtml('   <p>x</p>   ')).to.eq('x')
    })
  })
})
