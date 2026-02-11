import { Models } from '@dbModels'
import Contract from '@models/schema/contract'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: Contract', () => {
  let sandbox: SinonSandbox
  let rawContract: Partial<Contract>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawContract = {
      network: NetworksEnum.ethereumMainnet,
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      bytecode: '0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe',
      bytecodeHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      sourceCode: 'pragma solidity ^0.8.0; contract Test {}',
      abi: '[{"type":"function","name":"test"}]',
      contractName: 'TestContract',
      isVerified: true,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create Contract', async () => {
    const createdContract = await Models.Contract.create(rawContract)

    expect(createdContract.id).to.exist
    expect(createdContract.address).to.eq(rawContract.address)
    expect(createdContract.network).to.eq(rawContract.network)
    expect(createdContract.bytecode).to.eq(rawContract.bytecode)
    expect(createdContract.bytecodeHash).to.eq(rawContract.bytecodeHash)
    expect(createdContract.sourceCode).to.eq(rawContract.sourceCode)
    expect(createdContract.abi).to.eq(rawContract.abi)
    expect(createdContract.contractName).to.eq(rawContract.contractName)
    expect(createdContract.isVerified).to.eq(rawContract.isVerified)
  })

  it('Should create Contract with defaults', async () => {
    const minimalContract = {
      network: NetworksEnum.ethereumMainnet,
      address: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      bytecode: '0x6080604052',
      bytecodeHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    }

    const createdContract = await Models.Contract.create(minimalContract)

    expect(createdContract.id).to.exist
    expect(createdContract.sourceCode).to.eq(null)
    expect(createdContract.abi).to.eq(null)
    expect(createdContract.contractName).to.eq(null)
    expect(createdContract.isVerified).to.eq(false)
  })

  it('Should getEntityId', async () => {
    const address = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const network = NetworksEnum.ethereumMainnet
    const entityId = Models.Contract.getEntityId({ address, network })
    expect(entityId).to.eq(`${address}-${network}`)
  })

  it('Should findExistingLog', async () => {
    const createdContract = await Models.Contract.create(rawContract)
    const foundContract = await Models.Contract.findExistingLog({
      address: createdContract.address,
      network: createdContract.network,
    })
    expect(foundContract?.id).to.eq(createdContract.id)
  })

  it('Should findByEntityId', async () => {
    const createdContract = await Models.Contract.create(rawContract)
    const foundContract = await Models.Contract.findByEntityId(createdContract.id)
    expect(foundContract?.id).to.eq(createdContract.id)
  })

  it('Should getBytecode', async () => {
    const createdContract = await Models.Contract.create(rawContract)
    const bytecode = await Models.Contract.getBytecode(createdContract.address, createdContract.network)
    expect(bytecode).to.eq(rawContract.bytecode)
  })

  it('Should return null for getBytecode when contract not found', async () => {
    const bytecode = await Models.Contract.getBytecode(
      '0x0000000000000000000000000000000000000000',
      NetworksEnum.ethereumMainnet,
    )
    expect(bytecode).to.eq(null)
  })

  it('Should getSourceCode', async () => {
    const createdContract = await Models.Contract.create(rawContract)
    const sourceCode = await Models.Contract.getSourceCode(createdContract.address, createdContract.network)
    expect(sourceCode).to.eq(rawContract.sourceCode)
  })

  it('Should return null for getSourceCode when contract not found', async () => {
    const sourceCode = await Models.Contract.getSourceCode(
      '0x0000000000000000000000000000000000000000',
      NetworksEnum.ethereumMainnet,
    )
    expect(sourceCode).to.eq(null)
  })

  it('Should return null for getSourceCode when sourceCode is null', async () => {
    const contractWithoutSource = {
      network: NetworksEnum.ethereumMainnet,
      address: '0x1111111111111111111111111111111111111111',
      bytecode: '0x6080604052',
      bytecodeHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
    }
    await Models.Contract.create(contractWithoutSource)

    const sourceCode = await Models.Contract.getSourceCode(contractWithoutSource.address, contractWithoutSource.network)
    expect(sourceCode).to.eq(null)
  })

  it('Should update Contract', async () => {
    const createdContract = await Models.Contract.create(rawContract)
    expect(createdContract.isVerified).to.eq(true)

    await createdContract.update({
      isVerified: false,
      contractName: 'UpdatedContract',
    })

    expect(createdContract.isVerified).to.eq(false)
    expect(createdContract.contractName).to.eq('UpdatedContract')
  })

  it('Should not update required field with falsy value', async () => {
    const createdContract = await Models.Contract.create(rawContract)
    const originalNetwork = createdContract.network

    await createdContract.update({
      network: null as any,
    })

    expect(createdContract.network).to.eq(originalNetwork)
  })

  it('Should skip update when field does not exist in schema', async () => {
    const createdContract = await Models.Contract.create(rawContract)

    await createdContract.update({
      nonExistentField: 'some value',
    } as any)

    expect(createdContract).to.exist
  })

  it('Should reload', async () => {
    const createdContract = await Models.Contract.create(rawContract)
    await createdContract.reload()

    expect(createdContract.address).to.eq(rawContract.address)
  })
})
