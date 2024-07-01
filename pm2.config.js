const path = require('path')
const dotenv = require('dotenv')

module.exports = {
  apps: [
    {
      name: 'aragon-api',
      cwd: path.resolve(__dirname, ''),
      script: 'yarn',
      args: 'service:aragon-api',
      autorestart: true,
      env: {
        INSTANCE_ID: 'aragon-api',
        ...dotenv.config({ path: path.resolve(__dirname, '.env.aragon-api') }).parsed,
      },
    },
  ],
}
