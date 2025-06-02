import Runner, { stopApps } from '@modules/runner'
import MigrationService from '@modules//migration'

// Set up callback to stop after migrations complete
MigrationService.setOnComplete(() => {
  stopApps([{ app: MigrationService }], 0, 1000)
})

Runner([{ app: MigrationService }])
