import Runner from '@modules/runner'
import AragonAPIService from '@services/aragon-api'
import AragonIndexerService from '@services/aragon-indexer'
import AragonRatesService from '@services/aragon-rates'

Runner([{ app: AragonAPIService }, { app: AragonIndexerService }, { app: AragonRatesService }])
