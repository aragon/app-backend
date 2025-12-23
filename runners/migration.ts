import MigrationService from '@modules/migration'
import Runner, { stopApp } from '@modules/runner'

// Set up callback to stop after migrations complete
MigrationService.setOnComplete(async () => {
  await stopApp(MigrationService, 0, 1000)
})

Runner(MigrationService)
