import Runner, { stopApp } from '@modules/runner'
import MigrationService from '@modules/migration'

// Set up callback to stop after migrations complete
MigrationService.setOnComplete(async () => {
  await stopApp(MigrationService, 0, 1000)
})

Runner(MigrationService)
