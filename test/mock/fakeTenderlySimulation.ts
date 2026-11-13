import { ISimulationStatus, type ITenderlyAssetChange, type ITenderlyFullResult, type ITenderlyLog } from '@types'
import { id as keccakId, MaxUint256 } from 'ethers'

export const APPROVAL_EVENT_TOPIC = keccakId('Approval(address,address,uint256)')

const pad = (address: string) => `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`

export const fakeAssetChange = (over: Partial<ITenderlyAssetChange> = {}): ITenderlyAssetChange => ({
  type: 'Transfer',
  from: '0x0ae12AF3878a2d896f5C4DCE3Be7250FB187c0a6',
  to: '0xcccc640018f8c2b00fa45F456017AD2378Eb3447',
  amount: '1000',
  raw_amount: '1000000000',
  dollar_value: '1000',
  token_info: {
    standard: 'ERC20',
    type: 'Fungible',
    contract_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  ...over,
})

/** As Tenderly returns it for a contract whose ABI it does not hold: raw topics, no decode. */
export const fakeApprovalLog = (params: {
  token: string
  owner: string
  spender: string
  amount?: bigint
}): ITenderlyLog => ({
  raw: {
    address: params.token,
    topics: [APPROVAL_EVENT_TOPIC, pad(params.owner), pad(params.spender)],
    data: `0x${(params.amount ?? MaxUint256).toString(16).padStart(64, '0')}`,
  },
})

export const fakeSimulationResult = (over: Partial<ITenderlyFullResult> = {}): ITenderlyFullResult => ({
  status: ISimulationStatus.SUCCESS,
  shareUrl: 'https://www.tdly.co/shared/simulation/abc',
  assetChanges: [],
  balanceChanges: [],
  logs: [],
  contracts: [],
  ...over,
})

/** The three shapes from the Term Finance drain, 2026-08-23. Each defeated the allowlist. */
export const TERM_SHAPES = {
  /** #3, #9, #10 — funds leave during execution. */
  directDrain: () =>
    fakeSimulationResult({
      assetChanges: [
        fakeAssetChange({
          from: '0x330732581D30076137a1159B3aE8780158D902bE',
          to: '0x9F2e520Fbd98b21f4Ad724E87917436794A8a32b',
          raw_amount: '7351900000000000000',
          dollar_value: '25000',
          token_info: {
            standard: 'ERC20',
            type: 'Fungible',
            contract_address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            symbol: 'WETH',
            name: 'Wrapped Ether',
            decimals: 18,
          },
        }),
      ],
    }),

  /** #5 — approves WETH to an outsider. `assetChanges` empty on purpose: nothing moves. */
  delayedDrain: () =>
    fakeSimulationResult({
      logs: [
        fakeApprovalLog({
          token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          owner: '0x70DAbe68E1276aeAf16DfF814a4Ffb9F7AB1ae76',
          spender: '0xf4450c79d1397df4432ebc548eb6b8350697fa58',
        }),
      ],
      callTrace: {
        from: '0x15d6b0CbAaD6E776bBcEb63359AB14699a9450D0',
        to: '0x70DAbe68E1276aeAf16DfF814a4Ffb9F7AB1ae76',
        calls: [
          {
            from: '0x70DAbe68E1276aeAf16DfF814a4Ffb9F7AB1ae76',
            to: '0x9F1c3173581CED1204136cBc628d2fb2407d7AC4',
            function_name: 'setDiscountRateAdapter',
          },
        ],
      },
    }),

  /** #1, #2, #7, #8 — a bare `setPendingGovernor`. No movement, no approval, no event. */
  controlHandover: () =>
    fakeSimulationResult({
      callTrace: {
        from: '0x57A0ccdC3f58185E14b0135462856fFb6cBeA7a7',
        to: '0x0d149C53e588B6337965a78C2Dc5D7052f87bC44',
        calls: [
          {
            from: '0x0d149C53e588B6337965a78C2Dc5D7052f87bC44',
            to: '0x369d94320d06492DE265C025bFaa4Cf513A1845f',
            function_name: 'setPendingGovernor',
          },
        ],
      },
    }),
}
