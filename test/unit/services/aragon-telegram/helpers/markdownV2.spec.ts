import { MarkdownV2 } from '@services/aragon-telegram/helpers/markdownV2'
import { expect } from 'chai'

describe('AragonTelegram: MarkdownV2', () => {
  describe('escape', () => {
    it('returns empty string for null/undefined/empty', () => {
      expect(MarkdownV2.escape(null)).to.eq('')
      expect(MarkdownV2.escape(undefined)).to.eq('')
      expect(MarkdownV2.escape('')).to.eq('')
    })

    it('escapes every reserved MarkdownV2 character', () => {
      // Each char in the reserved set should be prefixed with a backslash.
      const reserved = '_*[]()~`>#+-=|{}.!\\'
      const escaped = MarkdownV2.escape(reserved)
      // 18 reserved chars → 18 escapes added (length doubles)
      expect(escaped).to.eq(
        reserved
          .split('')
          .map(c => `\\${c}`)
          .join(''),
      )
    })

    it('leaves plain text alone', () => {
      expect(MarkdownV2.escape('hello world')).to.eq('hello world')
    })

    it('escapes only the reserved chars in mixed text', () => {
      expect(MarkdownV2.escape('Andr_test')).to.eq('Andr\\_test')
      expect(MarkdownV2.escape('foo.bar(baz)')).to.eq('foo\\.bar\\(baz\\)')
    })
  })

  describe('truncate', () => {
    it('returns the input untouched if shorter than max', () => {
      expect(MarkdownV2.truncate('abc', 10)).to.eq('abc')
    })

    it('returns the input untouched at exactly the max length', () => {
      expect(MarkdownV2.truncate('abcde', 5)).to.eq('abcde')
    })

    it('truncates with an ellipsis when over max', () => {
      expect(MarkdownV2.truncate('abcdef', 5)).to.eq('abcd…')
    })

    it('handles a max of zero gracefully', () => {
      expect(MarkdownV2.truncate('abc', 0)).to.eq('…')
    })
  })
})
