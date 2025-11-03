import { BaseGovernance } from '@governance/baseGovernance'
import { Models } from '@dbModels'
import type Gauge from '@models/schema/gauge'
import logger from '@logger'
import { GaugeMetrics } from '@services/aragon-dao/gaugeMetrics'
import GaugeHelper from '@helpers/gauge'

export class GaugeGovernance extends BaseGovernance {
  async getOrCreate(): Promise<any> {
    logger.warn('Gauge governance does not implement getOrCreate member', this.llo({}))
    return null
  }

  async create(): Promise<any> {
    logger.warn('Gauge governance does not implement create member', this.llo({}))
    return null
  }

  async update(): Promise<any> {
    logger.warn('Gauge governance does not implement update member', this.llo({}))
    return null
  }

  async delete(): Promise<boolean> {
    logger.warn('Gauge governance does not implement delete member', this.llo({}))
    return false
  }

  async findOne(): Promise<any> {
    logger.warn('Gauge governance does not implement findOne member', this.llo({}))
    return null
  }

  async findAndPaginateMembers(): Promise<any> {
    logger.warn('Gauge governance does not implement findAndPaginateMembers members', this.llo({}))
    return null
  }

  async updateDaoMetrics(): Promise<any> {
    logger.warn('Gauge governance does not implement updateDaoMetrics', this.llo({}))
    return null
  }

  async createGauge(rawGauge: Partial<Gauge>): Promise<Gauge[]> {
    const gauge = await Models.Gauge.create(rawGauge)
    await GaugeMetrics.epochGaugeMetrics({
      epochId: await GaugeHelper.getGaugeEpochId(gauge.pluginAddress, gauge.network),
      gaugeAddress: gauge.address,
      pluginAddress: gauge.pluginAddress,
      network: gauge.network,
      currentEpochVotingPower: '0',
      totalGaugeVotingPower: '0',
    })
    return gauge
  }
}
