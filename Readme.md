![Aragon](https://res.cloudinary.com/dbktgy3vg/image/upload/v1689668058/aragon-app_hpima1.png)

<p align="center">
  <a href="https://aragon.org/">Aragon website</a>
  •
  <a href="https://devs.aragon.org/">Developer Portal</a>
  •
  <a href="https://aragonproject.typeform.com/to/LngekEhU">Join our Developer Community</a>
  •
  <a href="https://aragonproject.typeform.com/dx-contribution">Contribute</a>
</p>
<br/>

# Aragon App Backend

The Aragon App Backend is a vital component designed to empower the Aragon App.
It ensures efficient on-chain data retrieval and continuous synchronization, acting as a pivotal bridge to the
blockchain.
This backend solution optimizes the app's performance, guaranteeing users access to the latest, most precise data
without compromising on speed or efficiency.

## Prerequisites

- Docker ([https://docs.docker.com/install](https://docs.docker.com/install))
- NodeJS find version in `.nvmrc` file (prefer install
  with [https://github.com/nvm-sh/nvm](https://github.com/nvm-sh/nvm))
- MongoDB v7 (prefer install with [https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-os-x/))
- IDE (prefer [https://www.jetbrains.com/webstorm/download](https://www.jetbrains.com/webstorm/download))

## Getting Started

Follow these steps to set up the Aragon App-Backend locally:

#### Clone repository

```sh
git clone https://github.com/aragon/app-backend.git
```

### Install the project's dependencies:

```bash
yarn install
```

#### Environment

You can set environment variables in the `.env` file, you can find examples in .env.sample

## Run locally

- Run service API

```bash
yarn service:api
```

- Run service Indexer

```bash
yarn service:indexer
```

## Run with Docker

- Run dependencies (mongoDb)

```bash
yarn docker:dependencies
```

- Run all services

```bash
yarn docker:services
```

- Run only service API

```bash
docker-compose up --build -d service-api
```

- Run only service Indexer

```bash
docker-compose up --build -d service-indexer
```

Access the Aragon App by opening [http://localhost:3000](http://localhost:3000) in your web browser.

#### Tests

- Format all files

```bash
yarn format:fix
```

- Lint the code

```bash
yarn lint
```

- Unit Test

```bash
yarn test:unit
```

- Unit Test with coverage

```bash
yarn test:unit:coverage && yarn test:unit:coverage:report
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## Security

If you believe you've found a security issue, we encourage you to notify us. We welcome working with you to resolve the
issue promptly.

Security Contact Email: sirt@aragon.org

Please do not use the issue tracker for security issues.

## Learn More

For more information about Aragon and its ecosystem, please visit the [Aragon website](https://aragon.org/) and explore
our [Developer Portal](https://devs.aragon.org/).

Join our [Developer Community](https://aragonproject.typeform.com/to/LngekEhU) to stay updated and contribute to the
growth of decentralized governance.

## License

[GNU AGPLv3](./LICENSE)
