import { PrometheusStore } from '@modules/prometheusStore'

const MetricsAdminController = {
  getMetrics: async (): Promise<string> => {
    return await PrometheusStore.aggregateAllMetrics()
  },
}

export default MetricsAdminController
