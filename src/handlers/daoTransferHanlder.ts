import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import { TransferProcessorFactory } from '@transfers'
import { EnumQueueName, type HexAddress, type ILogInfo, ITransactionSide, ITransactionType } from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handlers:DaoTransferHandler' })

export const DaoTransferHandler = {
  _queueTokenAssetSync: (daoAddress: HexAddress, tokenAddress: HexAddress, info: ILogInfo) =>
    RabbitMQHelper.sendMessage(EnumQueueName.daoAssets, {
      id: `${daoAddress}-${tokenAddress}`,
      params: { address: daoAddress, network: info.network, tokenAddress },
    }),

  _queueNativeAssetSync: (daoAddress: HexAddress, info: ILogInfo) =>
    RabbitMQHelper.sendMessage(EnumQueueName.daoAssets, {
      id: `${daoAddress}-native`,
      params: { address: daoAddress, network: info.network, native: true },
    }),

  incomingErc20Transfer: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.to ?? parsedEvent.args[1]
    const token = await ProxyToken.saveAndGetToken(info.address, info.network)

    const processor = TransferProcessorFactory.create(ITransactionType.erc20, info.network, daoAddress, {
      decimals: token?.decimals,
      transactionSide: ITransactionSide.deposit,
    })

    if (processor.validateTransfer(parsedEvent)) {
      logger.verbose(
        'ERC20 Transfer to DAO',
        llo({
          network: info.network,
          from: parsedEvent.args.from ?? parsedEvent.args[0],
          to: parsedEvent.args.to ?? parsedEvent.args[1],
          value: (parsedEvent.args.amount ?? parsedEvent.args.value ?? parsedEvent.args[2]).toString(),
          tokenAddress: info.address,
          txHash: info.transactionHash,
        }),
      )

      const transferData = processor.prepareTransferData(parsedEvent, info)
      await processor.save(transferData)
      await DaoTransferHandler._queueTokenAssetSync(daoAddress, info.address, info)
    }
  },

  incomingErc721Transfer: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.to ?? parsedEvent.args[1]
    const processor = TransferProcessorFactory.create(ITransactionType.erc721, info.network, daoAddress, {
      transactionSide: ITransactionSide.deposit,
    })

    if (processor.validateTransfer(parsedEvent)) {
      logger.verbose(
        'ERC721 Transfer to DAO',
        llo({
          network: info.network,
          from: parsedEvent.args.from ?? parsedEvent.args[0],
          to: parsedEvent.args.to ?? parsedEvent.args[1],
          tokenId: (parsedEvent.args.tokenId ?? parsedEvent.args[2]).toString(),
          tokenAddress: info.address,
          txHash: info.transactionHash,
        }),
      )

      const transferData = processor.prepareTransferData(parsedEvent, info)
      await processor.save(transferData)
    }
  },

  withdrawErc20Transfer: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.from ?? parsedEvent.args[0]
    // Get token information with correct decimals
    const token = await ProxyToken.saveAndGetToken(info.address, info.network)

    // Create processor for outgoing ERC20 transfers
    const processor = TransferProcessorFactory.create(ITransactionType.erc20, info.network, daoAddress, {
      decimals: token?.decimals,
      transactionSide: ITransactionSide.withdraw,
    })

    // Validate and process the transfer
    if (processor.validateTransfer(parsedEvent)) {
      logger.verbose(
        'ERC20 Transfer from DAO',
        llo({
          network: info.network,
          from: parsedEvent.args.from ?? parsedEvent.args[0],
          to: parsedEvent.args.to ?? parsedEvent.args[1],
          value: (parsedEvent.args.amount ?? parsedEvent.args.value ?? parsedEvent.args[2]).toString(),
          tokenAddress: info.address,
          txHash: info.transactionHash,
        }),
      )

      const transferData = processor.prepareTransferData(parsedEvent, info)
      await processor.save(transferData)
      await DaoTransferHandler._queueTokenAssetSync(daoAddress, info.address, info)
    }
  },

  withdrawErc721Transfer: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.from ?? parsedEvent.args[0]
    // Create processor for outgoing ERC721 transfers
    const processor = TransferProcessorFactory.create(ITransactionType.erc721, info.network, daoAddress, {
      transactionSide: ITransactionSide.withdraw,
    })

    // Validate and process the transfer
    if (processor.validateTransfer(parsedEvent)) {
      logger.verbose(
        'NFT Transfer from DAO',
        llo({
          network: info.network,
          from: parsedEvent.args.from ?? parsedEvent.args[0],
          to: parsedEvent.args.to ?? parsedEvent.args[1],
          tokenId: (parsedEvent.args.tokenId ?? parsedEvent.args[2]).toString(),
          tokenAddress: info.address,
          txHash: info.transactionHash,
        }),
      )

      const transferData = processor.prepareTransferData(parsedEvent, info)
      await processor.save(transferData)
    }
  },

  // native
  incomingNativeDeposits: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = info.address
    // Create processor for native deposits
    const processor = TransferProcessorFactory.create(ITransactionType.native, info.network, daoAddress, {
      transactionSide: ITransactionSide.deposit,
    })

    if (parsedEvent.args.amount === 0n) {
      return
    }

    logger.verbose(
      'Native Token Deposited to DAO',
      llo({
        network: info.network,
        sender: parsedEvent.args.sender ?? parsedEvent.args[0], // sender address
        amount: (parsedEvent.args.amount ?? parsedEvent.args[1]).toString(), // amount in wei
        daoAddress: info.address,
        txHash: info.transactionHash,
        blockNumber: info.blockNumber,
      }),
    )

    const transferData = processor.prepareTransferData(parsedEvent, info)
    await processor.save(transferData)
    await DaoTransferHandler._queueNativeAssetSync(daoAddress, info)
  },

  withdrawNativeDeposits: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = info.address

    // Track how many native transfers we've processed for logging
    let nativeTransfersSaved = 0

    // The Executed event typically has structure:
    // event Executed(
    //   address indexed actor,
    //   bytes32 indexed callId,
    //   Action[] actions,
    //   uint256 allowFailureMap,
    //   uint256 failureMap,
    //   bytes[] execResults
    // )
    //
    // Where Action is:
    // struct Action {
    //   address to;
    //   uint256 value;
    //   bytes data;
    // }

    // Check if there are actions in the event (3rd argument contains the actions array)
    if (parsedEvent.args.length >= 3) {
      const actions = parsedEvent.args[2]

      if (Array.isArray(actions)) {
        // Process each action in the Executed event
        for (let index = 0; index < actions.length; index++) {
          const action = actions[index]

          // Extract action fields (supporting both named and positional access)
          const value = action.value || action[1]
          const to = action.to || action[0]

          // Native transfers have value > 0 and empty or minimal data
          if (value && value.toString() !== '0') {
            // Create processor for outgoing native transfer
            const processor = TransferProcessorFactory.create(ITransactionType.native, info.network, daoAddress, {
              transactionSide: ITransactionSide.withdraw,
            })

            // Prepare the transfer data
            const pseudoParsedEvent = {
              name: 'NativeTransfer',
              signature: 'NativeTransfer(address,uint256)',
              args: [to, value], // For NativeDeposited event format
            } as any

            // For batch actions in Executed events, we use actionIndex for unique identification
            const transferData = processor.prepareTransferData(pseudoParsedEvent, info)

            // Add the actionIndex to identify this specific action within the batch
            transferData.actionIndex = index

            // Save the transfer
            await processor.save(transferData)

            nativeTransfersSaved++

            logger.verbose(
              'Native transfer saved from Executed event',
              llo({
                network: info.network,
                to,
                value: value.toString(),
                txHash: info.transactionHash,
                actionIndex: index,
                totalSaved: nativeTransfersSaved,
              }),
            )
          }
        }
      }
    }

    if (nativeTransfersSaved > 0) {
      await DaoTransferHandler._queueNativeAssetSync(daoAddress, info)
    }
  },
}
