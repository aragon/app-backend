![UnitTest](https://github.com/aragon/app-backend/actions/workflows/app-backend-test.yml/badge.svg?branch=develop)
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

## AragonX App Backend

The AragonX App Backend is a core component of the Aragon ecosystem, designed to index data from blockchain events, emitted by Aragon smart contracts. It provides an API service that enables fast and easy access to this data, facilitating efficient data retrieval for Aragon App and external applications.

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

- Run Aragon API

```bash
yarn service:aragon-api
```

- Run Aragon Indexer

```bash
yarn service:aragon-indexer
```

- Run Aragon Rates

```bash
yarn service:aragon-rates
```

- Run Aragon Admin API

```bash
yarn service:aragon-admin-api
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

- Run only Aragon API

```bash
docker-compose up --build -d service-aragon-api
```

- Run only Aragon Indexer

```bash
docker-compose up --build -d service-aragon-indexer
```

- Run only Aragon Rates

```bash
docker-compose up --build -d service-aragon-rates
```

- Run only Aragon Admin API

```bash
docker-compose up --build -d service-aragon-admin-api
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

#### 增加一个新的插件数据采集功能需要:
1. 定义新的插件类型枚举
2. 在 PluginDetector 中添加类型检测逻辑
3. 在 PluginSettingHandler 中添加设置处理函数
4. 添加必要的事件枚举
5. 创建和导入相应的ABI文件
6. 更新数据模型以支持新插件的特定字段

# 在服务器上创建内部网络
docker network create internal-net

# 在服务器上创建公共网络
docker network create public-net