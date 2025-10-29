import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { ContractInfo } from '@services/aragon-gateway/contractInfo'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import ProxyContract from '@helpers/proxyContract'
import * as ContractNetspecHelper from '@helpers/contractNetspec'
import ProxyWeb3Provider from '@modules/proxyProvider'
import DecodeActions from '@helpers/decodeAction'

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

    it('should return contract info when not a proxy', async () => {
      let fetchVerifiedContractDataStub = sandbox.stub(ContractInfo, 'fetchVerifiedContractData')

      let getImplementationAddressStub = sandbox.stub(ProxyContract, 'getImplementationAddress').resolves('0xaddress')

      fetchVerifiedContractDataStub.onFirstCall().resolves({ name: 'ContractName', functions: [{ name: 'function1' }] })

      let result = await ContractInfo.getContractInfo(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(fetchVerifiedContractDataStub.calledOnce).to.be.true
      expect(getImplementationAddressStub.calledOnce).to.be.true

      expect(result).to.deep.equal({
        implementationAddress: null,
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        name: 'ContractName',
        proxyName: null,
        functions: [{ name: 'function1' }],
      })
    })

    it('should return contract info when mainData is null but implementationData exists', async () => {
      let fetchVerifiedContractDataStub = sandbox.stub(ContractInfo, 'fetchVerifiedContractData')

      let getImplementationAddressStub = sandbox
        .stub(ProxyContract, 'getImplementationAddress')
        .resolves('0ximplementationAddress')

      fetchVerifiedContractDataStub.onFirstCall().resolves(null)
      fetchVerifiedContractDataStub.onSecondCall().resolves({ name: 'ImplName', functions: [{ name: 'function2' }] })

      let result = await ContractInfo.getContractInfo(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(fetchVerifiedContractDataStub.calledTwice).to.be.true

      expect(result?.implementationAddress).to.equal('0ximplementationAddress')
      expect(result?.address).to.equal('0xaddress')
      expect(result?.network).to.equal(NetworksEnum.ethereumSepolia)
      expect(result?.name).to.equal('ImplName')
      expect(result?.functions).to.deep.equal([{ name: 'function2' }])
      // proxyName will be undefined when mainData is null, which is acceptable
    })

    it('should handle when only mainData has functions (no implementationData functions)', async () => {
      let fetchVerifiedContractDataStub = sandbox.stub(ContractInfo, 'fetchVerifiedContractData')

      let getImplementationAddressStub = sandbox
        .stub(ProxyContract, 'getImplementationAddress')
        .resolves('0ximplementationAddress')

      fetchVerifiedContractDataStub
        .onFirstCall()
        .resolves({ name: 'ProxyName', functions: [{ name: 'function1' }, { name: 'function2' }] })
      fetchVerifiedContractDataStub.onSecondCall().resolves({ name: 'ImplName', functions: [] })

      let result = await ContractInfo.getContractInfo(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(result).to.deep.equal({
        implementationAddress: '0ximplementationAddress',
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        name: 'ImplName',
        proxyName: 'ProxyName',
        functions: [{ name: 'function1' }, { name: 'function2' }],
      })
    })
  })

  describe('fetchVerifiedContractData', () => {
    it('should return null if contract details are empty', async () => {
      let fetchContractSourceCodeStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([])

      let result = await ContractInfo.fetchVerifiedContractData(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(fetchContractSourceCodeStub.calledOnce).to.be.true
      expect(
        fetchContractSourceCodeStub.calledWith({
          network: NetworksEnum.ethereumSepolia,
          address: '0xaddress',
        }),
      ).to.be.true
      expect(result).to.be.null
    })

    it('should return null if contract source code is not verified', async () => {
      let fetchContractSourceCodeStub = sandbox
        .stub(ProxyWeb3Provider, 'fetchContractSourceCode')
        .resolves([{ SourceCode: '', ContractName: 'contractName', ABI: '[]' }])

      let result = await ContractInfo.fetchVerifiedContractData(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(fetchContractSourceCodeStub.calledOnce).to.be.true
      expect(
        fetchContractSourceCodeStub.calledWith({
          network: NetworksEnum.ethereumSepolia,
          address: '0xaddress',
        }),
      ).to.be.true
      expect(result).to.be.null
    })

    it('should return if the contract netspec returns empty', async () => {
      let fetchContractSourceCodeStub = sandbox
        .stub(ProxyWeb3Provider, 'fetchContractSourceCode')
        .resolves([{ SourceCode: 'sourceCode', ContractName: 'contractName', ABI: '[]' }])

      const parseNetspecStub = sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns([])

      let result = await ContractInfo.fetchVerifiedContractData(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(fetchContractSourceCodeStub.calledOnce).to.be.true
      expect(
        fetchContractSourceCodeStub.calledWith({
          network: NetworksEnum.ethereumSepolia,
          address: '0xaddress',
        }),
      ).to.be.true
      expect(parseNetspecStub.calledOnce).to.be.true
      expect(parseNetspecStub.args[0][0]).to.be.eq('sourceCode')
      expect(parseNetspecStub.args[0][1]).to.be.eq('contractName')
      expect(parseNetspecStub.args[0][2]).to.be.deep.eq([])
      expect(result).to.be.null
    })

    it('should return contract data if everything is okay', async () => {
      let fetchContractSourceCodeStub = sandbox
        .stub(ProxyWeb3Provider, 'fetchContractSourceCode')
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
      expect(
        fetchContractSourceCodeStub.calledWith({
          network: NetworksEnum.ethereumSepolia,
          address: '0xaddress',
        }),
      ).to.be.true
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

    it('should parse non-empty ABI', async () => {
      const mockABI = [
        {
          name: 'transfer',
          type: 'function',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          stateMutability: 'nonpayable',
        },
      ]

      let fetchContractSourceCodeStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          SourceCode: 'sourceCode',
          ContractName: 'ERC20Token',
          ABI: JSON.stringify(mockABI),
          CompilerVersion: 'v0.8.0',
        },
      ])

      const parseNetspecStub = sandbox.stub(ContractNetspecHelper, 'parseNetspec').returns([
        {
          name: 'transfer',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          notice: 'Transfer tokens',
          type: 'function',
          stateMutability: 'nonpayable',
        },
      ])

      let result = await ContractInfo.fetchVerifiedContractData(NetworksEnum.ethereumSepolia, '0xaddress')

      expect(fetchContractSourceCodeStub.calledOnce).to.be.true
      expect(parseNetspecStub.calledOnce).to.be.true
      expect(parseNetspecStub.args[0][2]).to.be.deep.eq(mockABI)
      expect(parseNetspecStub.args[0][3]).to.be.eq('v0.8.0')
      expect(result).to.be.deep.eq({
        name: 'ERC20Token',
        functions: [
          {
            name: 'transfer',
            type: 'function',
            stateMutability: 'nonpayable',
            parameters: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            notice: 'Transfer tokens',
          },
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

  describe('parseSignature', () => {
    it('should return native transfer data when signature is null', async () => {
      const searchDetailsStub = sandbox.stub(ProxyWeb3Provider, 'searchDetailsOfContract').resolves({
        name: 'TestContract',
      })

      const result = await ContractInfo.parseSignature(null, '0xto', NetworksEnum.ethereumSepolia)

      expect(searchDetailsStub.calledOnce).to.be.true
      expect(
        searchDetailsStub.calledWith({
          address: '0xto',
          network: NetworksEnum.ethereumSepolia,
        }),
      ).to.be.true
      expect(result).to.deep.equal({
        functionName: 'NativeTransfer',
        contractName: 'TestContract',
      })
    })

    it('should return unknown contract name when searchDetailsOfContract returns null', async () => {
      const searchDetailsStub = sandbox.stub(ProxyWeb3Provider, 'searchDetailsOfContract').resolves(null)

      const result = await ContractInfo.parseSignature(null, '0xto', NetworksEnum.ethereumSepolia)

      expect(searchDetailsStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        functionName: 'NativeTransfer',
        contractName: 'Unknown',
      })
    })

    it('should parse contract netspec when signature is provided', async () => {
      const mockDecodeAction = {
        parseContractNetspec: sandbox.stub().resolves({
          functionName: 'transfer',
          contractName: 'ERC20Token',
        }),
      }

      sandbox.stub(DecodeActions.prototype, 'parseContractNetspec').callsFake(mockDecodeAction.parseContractNetspec)

      const result = await ContractInfo.parseSignature('0x1234abcd', '0xto', NetworksEnum.ethereumSepolia)

      expect(mockDecodeAction.parseContractNetspec.calledOnce).to.be.true
      expect(
        mockDecodeAction.parseContractNetspec.calledWith(
          '0x1234abcd',
          {
            to: '0xto',
            data: '0x',
            value: undefined,
          },
          NetworksEnum.ethereumSepolia,
        ),
      ).to.be.true
      expect(result).to.deep.equal({
        functionName: 'transfer',
        contractName: 'ERC20Token',
      })
    })
  })
})
