import { EnumConnection, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import axios from 'axios'
import * as dotenv from 'dotenv'
import BottleneckModule from '@modules/bottleneck'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config()

const llo = logger.logMeta.bind(null, { service: 'tool:IntegrityToolMemberTransaction' })

interface DuneResponse {
  execution_id?: string
  query_id?: number
  is_execution_finished?: boolean
  result?: {
    rows: Array<{
      token_address: string
      delegate_votes_changed_count: number
    }>
  }
  error?: string
}

interface TokenCheckResult {
  tokenAddress: string
  network: NetworksEnum
  duneCount: number
  dbCount: number
  isMatch: boolean
  error?: string
}

export const IntegrityToolMemberTransaction: any = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB],
  DUNE_API_KEY: process.env.DUNE_API_KEY,
  DUNE_API_BASE_URL: 'https://api.dune.com/api/v1',
  NETWORK_FILTER: NetworksEnum.ethereumMainnet, // Default network, can be changed manually
  LIMIT_TOKENS: process.env.LIMIT_TOKENS ? parseInt(process.env.LIMIT_TOKENS) : null, // Limit tokens for testing

  start: async () => {
    if (!IntegrityToolMemberTransaction.DUNE_API_KEY) {
      logger.error('DUNE_API_KEY environment variable not set', llo({}))
      throw new Error('DUNE_API_KEY is required')
    }

    logger.info(
      'Starting member transaction integrity check',
      llo({ network: IntegrityToolMemberTransaction.NETWORK_FILTER }),
    )

    try {
      // Query unique token addresses from Plugin collection
      let uniqueTokenAddresses = await IntegrityToolMemberTransaction.getUniqueTokenAddresses()
      logger.info('Found unique token addresses', llo({ count: uniqueTokenAddresses.length }))

      if (uniqueTokenAddresses.length === 0) {
        logger.info('No token addresses found to check', llo({}))
        return
      }

      // Apply limit if specified (for testing)
      if (IntegrityToolMemberTransaction.LIMIT_TOKENS) {
        uniqueTokenAddresses = uniqueTokenAddresses.slice(0, IntegrityToolMemberTransaction.LIMIT_TOKENS)
        logger.info(`Limited to ${IntegrityToolMemberTransaction.LIMIT_TOKENS} tokens for testing`, llo({}))
      }

      // Process tokens in smaller batches for better progress tracking
      const BATCH_SIZE = 10 // Process 10 tokens at a time
      const limiter = BottleneckModule.getDuneLimiter(IntegrityToolMemberTransaction.NETWORK_FILTER)
      const results: TokenCheckResult[] = []

      for (let i = 0; i < uniqueTokenAddresses.length; i += BATCH_SIZE) {
        const batch = uniqueTokenAddresses.slice(i, i + BATCH_SIZE)
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1
        const totalBatches = Math.ceil(uniqueTokenAddresses.length / BATCH_SIZE)

        logger.info(
          `Processing batch ${batchNumber}/${totalBatches}`,
          llo({
            startIndex: i,
            endIndex: Math.min(i + BATCH_SIZE, uniqueTokenAddresses.length),
            tokensInBatch: batch.length,
          }),
        )

        const batchResults = await Promise.all(
          batch.map(async (tokenAddress: string) =>
            limiter.schedule(() => IntegrityToolMemberTransaction.checkToken(tokenAddress)),
          ),
        )

        results.push(...batchResults)

        // Log progress after each batch
        const processed = results.length
        const percentage = ((processed / uniqueTokenAddresses.length) * 100).toFixed(1)
        logger.info(`Progress: ${processed}/${uniqueTokenAddresses.length} tokens processed (${percentage}%)`, llo({}))
      }

      // Analyze results
      const matches = results.filter(r => r.isMatch && !r.error)
      const mismatches = results.filter(r => !r.isMatch && !r.error)
      const errors = results.filter(r => r.error)

      // Generate detailed report
      const report = {
        timestamp: new Date().toISOString(),
        network: IntegrityToolMemberTransaction.NETWORK_FILTER,
        summary: {
          totalTokensChecked: results.length,
          matches: matches.length,
          mismatches: mismatches.length,
          errors: errors.length,
          matchPercentage: ((matches.length / results.length) * 100).toFixed(2) + '%',
        },
        mismatches: mismatches
          .map(m => ({
            tokenAddress: m.tokenAddress,
            duneCount: m.duneCount,
            dbCount: m.dbCount,
            difference: m.duneCount - m.dbCount,
            percentageDifference:
              m.duneCount > 0 ? ((Math.abs(m.duneCount - m.dbCount) / m.duneCount) * 100).toFixed(2) + '%' : 'N/A',
          }))
          .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)), // Sort by difference descending
        errors: errors.map(e => ({
          tokenAddress: e.tokenAddress,
          error: e.error,
        })),
        matches: matches.map(m => ({
          tokenAddress: m.tokenAddress,
          count: m.duneCount,
        })),
      }

      // Save report to file
      const reportPath = path.join(process.cwd(), 'reports', 'memberTransaction')
      if (!fs.existsSync(reportPath)) {
        fs.mkdirSync(reportPath, { recursive: true })
      }

      const filename = `integrity_report_${IntegrityToolMemberTransaction.NETWORK_FILTER}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      const filepath = path.join(reportPath, filename)

      fs.writeFileSync(filepath, JSON.stringify(report, null, 2))
      logger.info(`Report saved to: ${filepath}`, llo({}))

      // Log summary
      logger.info(
        'Integrity check completed',
        llo({
          total: results.length,
          matches: matches.length,
          mismatches: mismatches.length,
          errors: errors.length,
          reportPath: filepath,
        }),
      )

      // If there are mismatches, log the top 10 biggest differences
      if (mismatches.length > 0) {
        const top10Mismatches = report.mismatches.slice(0, 10)
        logger.info(
          'Top 10 mismatches by difference',
          llo({
            mismatches: top10Mismatches,
          }),
        )
      }
    } catch (error) {
      logger.error('Member transaction integrity check failed', llo({ error }))
      throw error
    }
  },

  getUniqueTokenAddresses: async (): Promise<string[]> => {
    const plugins = await Models.Plugin.find({
      tokenAddress: { $exists: true, $ne: null },
      interfaceType: IPluginInterfaceType.tokenVoting,
      isSupported: true,
      status: IPluginStatus.installed,
      network: IntegrityToolMemberTransaction.NETWORK_FILTER,
    }).distinct('tokenAddress')

    return plugins
  },

  checkToken: async (tokenAddress: string): Promise<TokenCheckResult> => {
    try {
      logger.info('Checking token', llo({ tokenAddress }))

      // Get count from Dune
      const duneCount = await IntegrityToolMemberTransaction.getDuneCount(tokenAddress)

      // Get count from database
      const dbCount = await IntegrityToolMemberTransaction.getDbCount(tokenAddress)

      const isMatch = duneCount === dbCount

      logger.info(
        'Token check result',
        llo({
          tokenAddress,
          duneCount,
          dbCount,
          isMatch,
        }),
      )

      return {
        tokenAddress,
        network: IntegrityToolMemberTransaction.NETWORK_FILTER,
        duneCount,
        dbCount,
        isMatch,
      }
    } catch (error: any) {
      logger.error('Failed to check token', llo({ tokenAddress, error: error.message }))
      return {
        tokenAddress,
        network: IntegrityToolMemberTransaction.NETWORK_FILTER,
        duneCount: 0,
        dbCount: 0,
        isMatch: false,
        error: error.message,
      }
    }
  },

  getDuneCount: async (tokenAddress: string): Promise<number> => {
    // You need to create a query on Dune Analytics first and get the query ID
    // For now, let's use a pre-existing query ID or create one
    // This is a placeholder - you'll need to replace with actual query ID
    const DUNE_QUERY_ID = process.env.DUNE_QUERY_ID || '3686182' // Replace with your actual query ID

    try {
      // Execute existing query with parameters
      const executeResponse = await axios.post(
        `${IntegrityToolMemberTransaction.DUNE_API_BASE_URL}/query/${DUNE_QUERY_ID}/execute`,
        {
          query_parameters: {
            token_address: tokenAddress.toLowerCase(),
          },
        },
        {
          headers: {
            'X-Dune-API-Key': IntegrityToolMemberTransaction.DUNE_API_KEY,
            'Content-Type': 'application/json',
          },
        },
      )

      const executionId = executeResponse.data.execution_id
      if (!executionId) {
        throw new Error('Failed to get execution ID from Dune')
      }

      // Poll for results with exponential backoff
      let attempts = 0
      const maxAttempts = 20 // Reduced attempts but with exponential backoff
      let waitTime = 1000 // Start with 1 second

      while (attempts < maxAttempts) {
        const resultResponse = await axios.get<DuneResponse>(
          `${IntegrityToolMemberTransaction.DUNE_API_BASE_URL}/execution/${executionId}/results`,
          {
            headers: {
              'X-Dune-API-Key': IntegrityToolMemberTransaction.DUNE_API_KEY,
            },
          },
        )

        if (resultResponse.data.is_execution_finished) {
          const rows = resultResponse.data.result?.rows || []
          if (rows.length === 0) {
            return 0
          }
          return rows[0].delegate_votes_changed_count || 0
        }

        // Exponential backoff: 1s, 2s, 4s, 8s... up to 10s max
        await new Promise(resolve => setTimeout(resolve, waitTime))
        waitTime = Math.min(waitTime * 2, 10000)
        attempts++
      }

      throw new Error('Dune query timeout')
    } catch (error: any) {
      logger.error('Dune API error', llo({ tokenAddress, error: error.message }))

      // If Dune API fails, we could also try a direct query approach
      // For now, let's provide a more informative error
      if (error.response?.status === 405) {
        logger.error(
          'Dune API endpoint not found. Please ensure you have created a query on Dune Analytics and set DUNE_QUERY_ID env variable',
          llo({}),
        )
        throw new Error(
          'Dune query not configured. Create a query on Dune Analytics with this SQL and set DUNE_QUERY_ID:\n' +
            'SELECT COUNT(*) as delegate_votes_changed_count\n' +
            'FROM ethereum.logs\n' +
            "WHERE topic0 = '0xdec2bacdd2f05b59de34da9b523dff8be42e5e38e818c82fdb0bae774387a724'\n" +
            "AND LOWER(contract_address) = LOWER('{{token_address}}')",
        )
      }
      throw error
    }
  },

  getDbCount: async (tokenAddress: string): Promise<number> => {
    const count = await Models.MemberTransaction.countDocuments({
      tokenAddress: tokenAddress.toLowerCase(),
      network: IntegrityToolMemberTransaction.NETWORK_FILTER,
      type: 'delegate', // Based on the MemberTransaction model, delegate type transactions
    })

    return count
  },
}

export default IntegrityToolMemberTransaction
