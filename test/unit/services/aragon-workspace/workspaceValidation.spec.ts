import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import WorkspaceSchema from '@workspace/api/validation'
import { expect } from 'chai'

const CREATOR = '0x29A6f32f36EDeD399763524018F17F03B1435b18'
const DAO_REGISTRY = '0x7a62da7B56fB3bfCdF70E900787010Bc4c9Ca42e'

const createParams = (overrides: Record<string, unknown> = {}) => ({
  name: 'osx-core',
  creator: CREATOR,
  network: NetworksEnum.ethereumMainnet,
  targets: [DAO_REGISTRY],
  ...overrides,
})

const validate = (params: Record<string, unknown>) =>
  ValidationSchema.validateParams(WorkspaceSchema.createWorkspace, params)

/** Resolves to true when the schema rejected the params. */
const rejects = async (params: Record<string, unknown>) => {
  try {
    await validate(params)
    return false
  } catch {
    return true
  }
}

describe('Service: aragon-workspace create validation', () => {
  it('should accept a title, description and https logo', async () => {
    const params = await validate(
      createParams({ title: 'OSx Core', description: 'Core contracts.', logo: 'https://aragon.org/logo.png' }),
    )

    expect(params.title).to.equal('OSx Core')
    expect(params.description).to.equal('Core contracts.')
    expect(params.logo).to.equal('https://aragon.org/logo.png')
  })

  it('should accept a workspace with none of them', async () => {
    const params = await validate(createParams())

    expect(params.title).to.equal(undefined)
  })

  it('should refuse a logo that is not http or https', async () => {
    // The value ends up as an image source in a browser.
    expect(await rejects(createParams({ logo: 'javascript:alert(1)' }))).to.equal(true)
    expect(await rejects(createParams({ logo: 'data:image/png;base64,AAAA' }))).to.equal(true)
    expect(await rejects(createParams({ logo: 'not a url' }))).to.equal(true)
  })

  it('should refuse an oversized description or title', async () => {
    expect(await rejects(createParams({ title: 'x'.repeat(121) }))).to.equal(true)
    expect(await rejects(createParams({ description: 'x'.repeat(1001) }))).to.equal(true)
  })
})
