import { createAddressMapper } from '@modules/dispatchSimulation/addressMapper'
import { processSimulation } from '@modules/dispatchSimulation/simulationProcessor'
import {
  type IDaoResponse,
  ISimulationStatus,
  type ITenderlyAssetChange,
  type ITenderlyFullResult,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'

describe('Module: dispatchSimulation/simulationProcessor', () => {
  const createMockDao = (
    address: string,
    name: string,
    linkedAccounts: Array<{ address: string; name: string }> = [],
  ) =>
    ({
      address,
      name,
      linkedAccounts,
    }) as IDaoResponse

  const createMockAssetChange = (
    from: string,
    to: string,
    amount: string,
    rawAmount: string,
    symbol = 'USDC',
    decimals = 6,
  ): ITenderlyAssetChange => ({
    type: 'Transfer',
    from,
    to,
    amount,
    raw_amount: rawAmount,
    dollar_value: amount,
    token_info: {
      standard: 'ERC20',
      type: 'Fungible',
      contract_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol,
      name: `${symbol} Token`,
      decimals,
    },
  })

  const createMockTenderlyResult = (
    status: ISimulationStatus,
    assetChanges: ITenderlyAssetChange[] = [],
    error?: string,
  ): ITenderlyFullResult => ({
    status,
    shareUrl: 'https://tenderly.co/simulation/123',
    assetChanges,
    balanceChanges: [],
    contracts: [],
    error,
  })

  describe('processSimulation', () => {
    describe('failed simulations', () => {
      it('should return failed status when simulation status is FAILED', () => {
        const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })
        const tenderlyResult = createMockTenderlyResult(ISimulationStatus.FAILED, [], 'execution reverted')

        const result = processSimulation(tenderlyResult, mapper)

        expect(result.status).to.equal('failed')
        expect(result.error).to.equal('execution reverted')
        expect(result.tenderlyUrl).to.equal('https://tenderly.co/simulation/123')
        expect(result.summaryGroups).to.deep.equal([])
      })

      it('should return failed status when error is present', () => {
        const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })
        const tenderlyResult: ITenderlyFullResult = {
          status: ISimulationStatus.SUCCESS,
          shareUrl: 'https://tenderly.co/simulation/123',
          assetChanges: [],
          balanceChanges: [],
          contracts: [],
          error: 'Some error occurred',
        }

        const result = processSimulation(tenderlyResult, mapper)

        expect(result.status).to.equal('failed')
        expect(result.error).to.equal('Some error occurred')
      })

      it('should use default error message when error is not provided', () => {
        const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })
        const tenderlyResult = createMockTenderlyResult(ISimulationStatus.FAILED)

        const result = processSimulation(tenderlyResult, mapper)

        expect(result.status).to.equal('failed')
        expect(result.error).to.equal('Simulation failed')
      })
    })

    describe('successful simulations', () => {
      it('should return success status with empty groups when no asset changes', () => {
        const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })
        const tenderlyResult = createMockTenderlyResult(ISimulationStatus.SUCCESS)

        const result = processSimulation(tenderlyResult, mapper)

        expect(result.status).to.equal('success')
        expect(result.tenderlyUrl).to.equal('https://tenderly.co/simulation/123')
        expect(result.summaryGroups).to.deep.equal([])
      })

      it('should group DAO addresses separately from external addresses', () => {
        const daoAddress = '0x1111111111111111111111111111111111111111'
        const externalAddress = '0x2222222222222222222222222222222222222222'
        const dao = createMockDao(daoAddress, 'Test DAO')

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })
        const assetChanges = [createMockAssetChange(daoAddress, externalAddress, '100', '100000000')]
        const tenderlyResult = createMockTenderlyResult(ISimulationStatus.SUCCESS, assetChanges)

        const result = processSimulation(tenderlyResult, mapper)

        expect(result.status).to.equal('success')
        expect(result.summaryGroups).to.have.length(2)

        const daoGroup = result.summaryGroups.find(g => g.kind === 'dao')
        const externalGroup = result.summaryGroups.find(g => g.kind === 'external')

        expect(daoGroup).to.exist
        expect(daoGroup!.items).to.have.length(1)
        expect(daoGroup!.items[0].role).to.equal('dao')
        expect(daoGroup!.items[0].tokens[0].amount).to.equal('-100.0')

        expect(externalGroup).to.exist
        expect(externalGroup!.items).to.have.length(1)
        expect(externalGroup!.items[0].role).to.equal('wallet')
        expect(externalGroup!.items[0].tokens[0].amount).to.equal('100.0')
      })

      it('should include linked accounts in DAO group', () => {
        const daoAddress = '0x1111111111111111111111111111111111111111'
        const linkedAccountAddress = '0x2222222222222222222222222222222222222222'
        const externalAddress = '0x3333333333333333333333333333333333333333'

        const dao = createMockDao(daoAddress, 'Main DAO', [{ address: linkedAccountAddress, name: 'LinkedAccount' }])

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })
        const assetChanges = [
          createMockAssetChange(daoAddress, linkedAccountAddress, '50', '50000000'),
          createMockAssetChange(linkedAccountAddress, externalAddress, '30', '30000000'),
        ]
        const tenderlyResult = createMockTenderlyResult(ISimulationStatus.SUCCESS, assetChanges)

        const result = processSimulation(tenderlyResult, mapper)

        const daoGroup = result.summaryGroups.find(g => g.kind === 'dao')
        expect(daoGroup).to.exist
        expect(daoGroup!.items).to.have.length(2)

        const mainDaoItem = daoGroup!.items.find(i => i.role === 'dao')
        const linkedAccountItem = daoGroup!.items.find(i => i.role === 'linkedaccount')

        expect(mainDaoItem).to.exist
        expect(linkedAccountItem).to.exist
      })

      it('should aggregate multiple transfers for same address and token', () => {
        const daoAddress = '0x1111111111111111111111111111111111111111'
        const externalAddress = '0x2222222222222222222222222222222222222222'
        const dao = createMockDao(daoAddress, 'Test DAO')

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })
        const assetChanges = [
          createMockAssetChange(daoAddress, externalAddress, '100', '100000000'),
          createMockAssetChange(daoAddress, externalAddress, '50', '50000000'),
        ]
        const tenderlyResult = createMockTenderlyResult(ISimulationStatus.SUCCESS, assetChanges)

        const result = processSimulation(tenderlyResult, mapper)

        const externalGroup = result.summaryGroups.find(g => g.kind === 'external')
        expect(externalGroup).to.exist
        expect(externalGroup!.items).to.have.length(1)
        expect(externalGroup!.items[0].tokens[0].amount).to.equal('150.0')
      })

      it('should handle transfers that net to zero', () => {
        const daoAddress = '0x1111111111111111111111111111111111111111'
        const externalAddress = '0x2222222222222222222222222222222222222222'
        const dao = createMockDao(daoAddress, 'Test DAO')

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })
        const assetChanges = [
          createMockAssetChange(daoAddress, externalAddress, '100', '100000000'),
          createMockAssetChange(externalAddress, daoAddress, '100', '100000000'),
        ]
        const tenderlyResult = createMockTenderlyResult(ISimulationStatus.SUCCESS, assetChanges)

        const result = processSimulation(tenderlyResult, mapper)

        // Should have no groups since all deltas net to zero
        expect(result.summaryGroups).to.deep.equal([])
      })

      it('should skip changes with zero amounts', () => {
        const daoAddress = '0x1111111111111111111111111111111111111111'
        const externalAddress = '0x2222222222222222222222222222222222222222'
        const dao = createMockDao(daoAddress, 'Test DAO')

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })
        const assetChanges = [createMockAssetChange(daoAddress, externalAddress, '0', '0')]
        const tenderlyResult = createMockTenderlyResult(ISimulationStatus.SUCCESS, assetChanges)

        const result = processSimulation(tenderlyResult, mapper)

        expect(result.summaryGroups).to.deep.equal([])
      })

      it('should skip changes with missing from or to address', () => {
        const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })
        const assetChanges = [
          { ...createMockAssetChange('', '0x2222222222222222222222222222222222222222', '100', '100000000'), from: '' },
          { ...createMockAssetChange('0x1111111111111111111111111111111111111111', '', '100', '100000000'), to: '' },
        ]
        const tenderlyResult = createMockTenderlyResult(ISimulationStatus.SUCCESS, assetChanges)

        const result = processSimulation(tenderlyResult, mapper)

        expect(result.summaryGroups).to.deep.equal([])
      })

      it('should sort DAO group with main DAO first', () => {
        const daoAddress = '0x3333333333333333333333333333333333333333'
        const linkedAccountAddress1 = '0x1111111111111111111111111111111111111111'
        const linkedAccountAddress2 = '0x2222222222222222222222222222222222222222'
        const externalAddress = '0x4444444444444444444444444444444444444444'

        const dao = createMockDao(daoAddress, 'Main DAO', [
          { address: linkedAccountAddress1, name: 'Alpha LinkedAccount' },
          { address: linkedAccountAddress2, name: 'Beta LinkedAccount' },
        ])

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })
        const assetChanges = [
          createMockAssetChange(externalAddress, linkedAccountAddress1, '10', '10000000'),
          createMockAssetChange(externalAddress, linkedAccountAddress2, '20', '20000000'),
          createMockAssetChange(externalAddress, daoAddress, '30', '30000000'),
        ]
        const tenderlyResult = createMockTenderlyResult(ISimulationStatus.SUCCESS, assetChanges)

        const result = processSimulation(tenderlyResult, mapper)

        const daoGroup = result.summaryGroups.find(g => g.kind === 'dao')
        expect(daoGroup).to.exist
        expect(daoGroup!.items[0].role).to.equal('dao')
        expect(daoGroup!.items[0].label).to.equal('Main DAO')
      })

      it('should handle 18 decimal tokens correctly', () => {
        const daoAddress = '0x1111111111111111111111111111111111111111'
        const externalAddress = '0x2222222222222222222222222222222222222222'
        const dao = createMockDao(daoAddress, 'Test DAO')

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })
        const assetChanges = [
          createMockAssetChange(daoAddress, externalAddress, '1.5', '1500000000000000000', 'ETH', 18),
        ]
        const tenderlyResult = createMockTenderlyResult(ISimulationStatus.SUCCESS, assetChanges)

        const result = processSimulation(tenderlyResult, mapper)

        const externalGroup = result.summaryGroups.find(g => g.kind === 'external')
        expect(externalGroup).to.exist
        expect(externalGroup!.items[0].tokens[0].amount).to.equal('1.5')
        expect(externalGroup!.items[0].tokens[0].token.symbol).to.equal('ETH')
      })

      it('should handle missing token_info gracefully', () => {
        const daoAddress = '0x1111111111111111111111111111111111111111'
        const externalAddress = '0x2222222222222222222222222222222222222222'
        const dao = createMockDao(daoAddress, 'Test DAO')

        const mapper = createAddressMapper({ dao, network: NetworksEnum.ethereumMainnet })
        const assetChanges: ITenderlyAssetChange[] = [
          {
            type: 'Transfer',
            from: daoAddress,
            to: externalAddress,
            amount: '100',
            raw_amount: '100000000000000000000',
            token_info: undefined as any,
          },
        ]
        const tenderlyResult = createMockTenderlyResult(ISimulationStatus.SUCCESS, assetChanges)

        const result = processSimulation(tenderlyResult, mapper)

        const externalGroup = result.summaryGroups.find(g => g.kind === 'external')
        expect(externalGroup).to.exist
        expect(externalGroup!.items[0].tokens[0].token.symbol).to.equal('Unknown')
        expect(externalGroup!.items[0].tokens[0].token.name).to.equal('Unknown Token')
      })
    })
  })
})
