import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { ContractInfo } from '@services/aragon-dao/contractInfo'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import ProxyContract from '@helpers/proxyContract'
import * as ContractNetspecHelper from '@helpers/contractNetspec'
import DecodeActions from '@helpers/decodeAction'
import TokenDetailProvider from '@providers/tokenDetailProvider/providerFactory'

describe('AragonDao: contractInfo', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getContractInfo', () => {
    it('should return if contract is not a verified contract', async () => {
      let fetchVerifiedContractDataStub = sandbox.stub(ContractInfo, 'fetchVerifiedContractData').resolves(null)

      sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)

      let result = await ContractInfo.getContractInfo(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(fetchVerifiedContractDataStub.calledOnce).to.be.true
      expect(fetchVerifiedContractDataStub.calledWith(NetworksEnum.ethereumSepolia, '0xaddress')).to.be.true
      expect(result).to.be.null
    })

    it('should return contract info if contract is a verified contract and proxy', async () => {
      let fetchVerifiedContractDataStub = sandbox.stub(ContractInfo, 'fetchVerifiedContractData')

      let getImplementationAddressStub = sandbox
        .stub(ProxyContract, 'getImplementationAddress')
        .resolves('0ximplementationAddress')

      fetchVerifiedContractDataStub.onFirstCall().resolves({ name: 'name', functions: [{ name: 'function1' }] })
      fetchVerifiedContractDataStub.onSecondCall().resolves({ name: 'name2', functions: [{ name: 'function2' }] })

      let result = await ContractInfo.getContractInfo(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(fetchVerifiedContractDataStub.calledTwice).to.be.true
      expect(fetchVerifiedContractDataStub.firstCall.calledWith(NetworksEnum.ethereumSepolia, '0xaddress')).to.be.true
      expect(
        fetchVerifiedContractDataStub.secondCall.calledWith(NetworksEnum.ethereumSepolia, '0ximplementationAddress'),
      ).to.be.true
      expect(getImplementationAddressStub.calledOnce).to.be.true
      expect(getImplementationAddressStub.calledWith('0xaddress', NetworksEnum.ethereumSepolia)).to.be.true

      expect(result).to.deep.equal({
        implementationAddress: '0ximplementationAddress',
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        name: 'name2',
        proxyName: 'name',
        functions: [{ name: 'function1' }, { name: 'function2' }],
      })
    })
  })

  describe('fetchVerifiedContractData', () => {
    it('should return null if contract details are empty', async () => {
      let fetchContractSourceCodeStub = sandbox.stub(TokenDetailProvider, 'fetchContractSourceCode').resolves([])

      let result = await ContractInfo.fetchVerifiedContractData(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(fetchContractSourceCodeStub.calledOnce).to.be.true
      expect(fetchContractSourceCodeStub.calledWith('0xaddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(result).to.be.null
    })

    it('should return null if contract source code is not verified', async () => {
      let fetchContractSourceCodeStub = sandbox
        .stub(TokenDetailProvider, 'fetchContractSourceCode')
        .resolves([{ SourceCode: '', ContractName: 'contractName', ABI: '[]' }])

      let result = await ContractInfo.fetchVerifiedContractData(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(fetchContractSourceCodeStub.calledOnce).to.be.true
      expect(fetchContractSourceCodeStub.calledWith('0xaddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(result).to.be.null
    })

    it('should return if the contract netspec returns empty', async () => {
      let fetchContractSourceCodeStub = sandbox
        .stub(TokenDetailProvider, 'fetchContractSourceCode')

        .resolves([{ SourceCode: 'sourceCode', ContractName: 'contractName', ABI: '[]' }])

      const parseNetspecStub = sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns([])

      let result = await ContractInfo.fetchVerifiedContractData(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(fetchContractSourceCodeStub.calledOnce).to.be.true
      expect(fetchContractSourceCodeStub.calledWith('0xaddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(parseNetspecStub.calledOnce).to.be.true
      expect(parseNetspecStub.args[0][0]).to.be.eq('sourceCode')
      expect(parseNetspecStub.args[0][1]).to.be.eq('contractName')
      expect(parseNetspecStub.args[0][2]).to.be.deep.eq([])
      expect(result).to.be.null
    })

    it('should return contract data if everything is okay', async () => {
      let fetchContractSourceCodeStub = sandbox
        .stub(TokenDetailProvider, 'fetchContractSourceCode')

        .resolves([{ SourceCode: 'sourceCode', ContractName: 'contractName', ABI: '[]' }])

      const parseNetspecStub = sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns([
        {
          name: 'function1',
          inputs: [],
          notice: 'Test',
          type: 'function',
          stateMutability: 'payable',
        },
      ])

      let result = await ContractInfo.fetchVerifiedContractData(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(fetchContractSourceCodeStub.calledOnce).to.be.true
      expect(fetchContractSourceCodeStub.calledWith('0xaddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(parseNetspecStub.calledOnce).to.be.true
      expect(parseNetspecStub.args[0][0]).to.be.eq('sourceCode')
      expect(parseNetspecStub.args[0][1]).to.be.eq('contractName')
      expect(parseNetspecStub.args[0][2]).to.be.deep.eq([])
      expect(result).to.be.deep.eq({
        name: 'contractName',
        functions: [
          { name: 'function1', type: 'function', stateMutability: 'payable', parameters: [], notice: 'Test' },
        ],
      })
    })
  })

  it('should parseContractAbi', () => {
    let abiResult = [
      {
        type: 'function',
        stateMutability: 'payable',
        name: 'function1',
        inputs: [],
        notice: 'Test function',
      },
      {
        type: 'function',
        stateMutability: 'view',
        name: 'function2',
        inputs: [],
        notice: 'Test',
      },
      {
        type: 'constructor',
        stateMutability: 'payable',
        name: 'function3',
        inputs: [],
        notice: 'Test',
      },
    ]

    let result = ContractInfo.parseContractAbi(abiResult)

    expect(result).to.be.deep.eq([
      { name: 'function1', type: 'function', stateMutability: 'payable', parameters: [], notice: 'Test function' },
    ])
  })
})
