const path = require('path')
const dotenv = require('dotenv')

module.exports = {
  apps: [
    {
      name: 'aragon-api',
      cwd: path.resolve(__dirname, ''),
      script: 'yarn',
      args: 'service:aragon-api',
      restart_delay: 15000,
      env: {
        INSTANCE_ID: 'aragon-api',
        ...dotenv.config({ path: path.resolve(__dirname, '.env.aragon-api') }).parsed,
      },
    },
    {
      name: 'aragon-indexer',
      cwd: path.resolve(__dirname, ''),
      script: 'yarn',
      args: 'service:aragon-indexer',
      restart_delay: 5000,
      env: {
        INSTANCE_ID: 'aragon-indexer',
        ...dotenv.config({ path: path.resolve(__dirname, '.env.aragon-indexer') }).parsed,
      },
    },
    {
      name: 'aragon-dao',
      cwd: path.resolve(__dirname, ''),
      script: 'yarn',
      args: 'service:aragon-dao',
      autorestart: true,
      env: {
        INSTANCE_ID: 'aragon-dao',
        ...dotenv.config({ path: path.resolve(__dirname, '.env.aragon-dao') }).parsed,
      },
    },
    {
      name: 'aragon-transactions',
      cwd: path.resolve(__dirname, ''),
      script: 'yarn',
      args: 'service:aragon-transactions',
      autorestart: true,
      env: {
        INSTANCE_ID: 'aragon-transactions',
        ...dotenv.config({ path: path.resolve(__dirname, '.env.aragon-transactions') }).parsed,
      },
    },
    {
      name: 'aragon-plugins',
      cwd: path.resolve(__dirname, ''),
      script: 'yarn',
      args: 'service:aragon-plugins',
      exec_mode: 'fork',
      instances: 4,
      autorestart: true,
      env: {
        INSTANCE_ID: 'aragon-plugins',
        ...dotenv.config({ path: path.resolve(__dirname, '.env.aragon-plugins') }).parsed,
      },
    },
    {
      name: 'aragon-rates',
      cwd: path.resolve(__dirname, ''),
      script: 'yarn',
      args: 'service:aragon-rates',
      autorestart: true,
      env: {
        INSTANCE_ID: 'aragon-rates',
        ...dotenv.config({ path: path.resolve(__dirname, '.env.aragon-rates') }).parsed,
      },
    },
    {
      name: 'aragon-sync',
      cwd: path.resolve(__dirname, ''),
      script: 'yarn',
      args: 'service:aragon-sync',
      autorestart: false,
      env: {
        INSTANCE_ID: 'aragon-sync',
        ...dotenv.config({ path: path.resolve(__dirname, '.env.aragon-sync') }).parsed,
      },
    },
    {
      name: 'aragon-tools',
      cwd: path.resolve(__dirname, ''),
      script: 'yarn',
      args: 'tool',
      autorestart: false,
      env: {
        INSTANCE_ID: 'aragon-tools',
        ...dotenv.config({ path: path.resolve(__dirname, '.env.aragon-tools') }).parsed,
      },
    },
  ],
}
