# [0.7.0](https://github.com/aragon/app-backend/compare/v0.6.0...v0.7.0) (2025-07-07)


### Bug Fixes

* **blockNumber:** improve getChainAdjustedBlockNumber for Arbitrum and Cron Network ([5e09fba](https://github.com/aragon/app-backend/commit/5e09fba0ef1fd765750be6b1a6be601ea10d7872))
* **common:** reduce pooling interval for mainnet configuration ([15041a8](https://github.com/aragon/app-backend/commit/15041a8b7ce31490bcfb0a787851aabf5fe497fe))
* **conflict:** fix dev ([5e6a65e](https://github.com/aragon/app-backend/commit/5e6a65ef161be44c91169e8cfa9dc299b0dd6322))
* **dao:** add proposalId to daoTransactions processing ([41363be](https://github.com/aragon/app-backend/commit/41363be8e031b967dcac3011752f6b7db26504cd))
* **memberBalance:** fixed the aggregation query where it was trying to sort on the string field ([1d0ef98](https://github.com/aragon/app-backend/commit/1d0ef984a63fa27b544335762fd3caf3d5cca8a1))
* **memberBalance:** fixed the aggregation query where it was trying to sort on the string field ([1a65cf6](https://github.com/aragon/app-backend/commit/1a65cf68bb442812140b20c32165b543dba751e6))
* **queue:** lint:Fix ([0d67ed5](https://github.com/aragon/app-backend/commit/0d67ed5dcf8c66139b017cebc002f2d0ec568512))
* **queue:** update proposal actions recalculation message and handle RabbitMQ errors ([c52be9d](https://github.com/aragon/app-backend/commit/c52be9d21dcd399a31167731d4dc3bd839e9df02))
* **rate-limiting:** improve handling of rate limit errors in blockchain log crawler ([7b9a8e1](https://github.com/aragon/app-backend/commit/7b9a8e1091675c91348a97695cf127b27e9e5878))
* **spp:** fix of parent proposals during any error on spp pair ([#703](https://github.com/aragon/app-backend/issues/703)) ([6bdbf79](https://github.com/aragon/app-backend/commit/6bdbf7994fb742ed0f682c2d27d9b424b5ac1e49))
* **taskScheduler:** improve task management and error handling in Task Scheduler ([#708](https://github.com/aragon/app-backend/issues/708)) ([641e358](https://github.com/aragon/app-backend/commit/641e358b10daa3cdc8fdeeb088f84f7c41bc9e95))
* **tests:** remove unused session variable from proxyMember tests ([cb390d0](https://github.com/aragon/app-backend/commit/cb390d011a4718c94485cefc114b8e43ecfad4e2))
* **tests:** remove unused session variable from proxyMember tests ([4c52b1f](https://github.com/aragon/app-backend/commit/4c52b1fba28958b875a02a79c2cbf9755e8da662))
* **tests:** update address references in proxyMember tests to valid Ethereum checksum addresses ([72f49fa](https://github.com/aragon/app-backend/commit/72f49faee278703cf751902ee184d0ca88585ec2))
* **tests:** update address references in proxyMember tests to valid Ethereum checksum addresses ([15440f8](https://github.com/aragon/app-backend/commit/15440f85dc2bd69cb70b24181d738f61092ae1fd))
* **test:** update block-scout and chiliz-provider tests with specific valid addresses ([72ac802](https://github.com/aragon/app-backend/commit/72ac802a63defaf8ccee8f453abebce83bef3a68))
* **test:** update block-scout and chiliz-provider tests with specific valid addresses ([329ca5e](https://github.com/aragon/app-backend/commit/329ca5e4e90cbd1649e913ae945822429fc47708))
* **votingPower:** Fetching voting power with batch request with block (timestamp/number) and retry logic until we have value.  ([#667](https://github.com/aragon/app-backend/issues/667)) ([7034822](https://github.com/aragon/app-backend/commit/703482231e1eeb35cac8c2eeba22d0a64cb58fff))


### Features

* add pm2 deployment ([2bc0587](https://github.com/aragon/app-backend/commit/2bc05879d961d2ddb7d73cf2f6fbce195344f82b))
* **cornProvider:** add fetchContractCreation method and corresponding tests ([9a9874d](https://github.com/aragon/app-backend/commit/9a9874d2fdd45d26e9280d7b366a5d6601d11133))
* **dao:** add networks query param to getDaoByMemberAddress ([#670](https://github.com/aragon/app-backend/issues/670)) ([5ef11cb](https://github.com/aragon/app-backend/commit/5ef11cb66d3ff762f31390d67dd8125b19c50029))
* db indexing ([892bdab](https://github.com/aragon/app-backend/commit/892bdabf8ad1a0e14846b3920ce09f6c2fe47505))
* db indexing ([#695](https://github.com/aragon/app-backend/issues/695)) ([8c1d722](https://github.com/aragon/app-backend/commit/8c1d722441ef42469e01e9365cfa1e97f0e241ec))
* decode action set to true only when action.length > 0 ([#704](https://github.com/aragon/app-backend/issues/704)) ([9be21dc](https://github.com/aragon/app-backend/commit/9be21dc27d120e5d2924f1e13dca4387aa1e45fe))
* disable pm2 deployment ([82e42ee](https://github.com/aragon/app-backend/commit/82e42ee9e8e7abe924c116d6073c56442e64e066))
* disable pm2 deployment ([1e69975](https://github.com/aragon/app-backend/commit/1e6997562f88d29c2f5ad453870150ceb79d049b))
* fix category on chiliz transfer ([edbb829](https://github.com/aragon/app-backend/commit/edbb8290d3de257e782593db459860f56d2e79ed))
* fix conflicts ([1b42b95](https://github.com/aragon/app-backend/commit/1b42b95273869ec7e1c801b82cd75099fd5e7d66))
* fix conflicts ([75dd221](https://github.com/aragon/app-backend/commit/75dd221163a7f81a2dbdc0d9a6a3efb0c0bd6459))
* **governance:** enhance deposit and withdraw handling locks and DAO membership ([#706](https://github.com/aragon/app-backend/issues/706)) ([e2b3017](https://github.com/aragon/app-backend/commit/e2b301783dae5357784635ac658e4e583414845e))
* **governance:** enhance deposit and withdraw handling locks and DAO membership ([#706](https://github.com/aragon/app-backend/issues/706)) ([8e794bd](https://github.com/aragon/app-backend/commit/8e794bd12d4f2b73fc2520575eb77a1645d6afbc))
* handle unsupported internal transfer on proposal executed ([#684](https://github.com/aragon/app-backend/issues/684)) ([5d4b48f](https://github.com/aragon/app-backend/commit/5d4b48f47c3578ce1f9b1b24ff986b6549d08e3e))
* handle veGovernance on multiple plugins ([#705](https://github.com/aragon/app-backend/issues/705)) ([3333877](https://github.com/aragon/app-backend/commit/3333877dd718bb4932d02e48d0c664c0c6e64252))
* handle veGovernance on multiple plugins ([#705](https://github.com/aragon/app-backend/issues/705)) ([d5ffe95](https://github.com/aragon/app-backend/commit/d5ffe958a9645a79200ad8ad1482d1a8348efe8e))
* koa router versioning + unit test  ([#687](https://github.com/aragon/app-backend/issues/687)) ([2ed932c](https://github.com/aragon/app-backend/commit/2ed932c7ecca5393e65264ad27fe91422c988ba3))
* mig create internal transactions ([#690](https://github.com/aragon/app-backend/issues/690)) ([8f01de7](https://github.com/aragon/app-backend/commit/8f01de7375c4617edd7f9d0021e4c301465d2e4b))
* migration ([da1fea8](https://github.com/aragon/app-backend/commit/da1fea8f49705ee217d1abc844dcd65523914096))
* migration ([16dc42f](https://github.com/aragon/app-backend/commit/16dc42f120f37872022bab5567decb799e146f5f))
* **proposalHandler:** enhance pairSppProposals to handle sub-proposals and error cases ([#678](https://github.com/aragon/app-backend/issues/678)) ([c0b49ce](https://github.com/aragon/app-backend/commit/c0b49cea38ceb702519b76dc26ec7a202ea60c98))
* **proxyContract:** storageAt and storage methods available one of them on some cases ([f81fb0b](https://github.com/aragon/app-backend/commit/f81fb0b23cc4641351e601259cf625dd7c039dcc))
* **proxyContract:** storageAt and storage methods available one of them on some cases ([fb4c281](https://github.com/aragon/app-backend/commit/fb4c28165315db2d040f8ebeb7109fc1669f63b4))
* rm internal transaction from chiliz, peaq, blockscout, alchemy ([#733](https://github.com/aragon/app-backend/issues/733)) ([dc052c5](https://github.com/aragon/app-backend/commit/dc052c56a262099859dabd91bcd47d8ec1013a13))
* **routescan:** add RouteScan API integration and CornProvider module ([30bb5a2](https://github.com/aragon/app-backend/commit/30bb5a26390344bd48c5aba6459fefe525d21b0d))
* skip transfer events for tokens with >10,000 holders ([#709](https://github.com/aragon/app-backend/issues/709)) ([f22a819](https://github.com/aragon/app-backend/commit/f22a81996887cdf01c2874261a2bfe9cd8abba9f))
* skip transfer events for tokens with >10,000 holders ([#709](https://github.com/aragon/app-backend/issues/709)) ([a370e7c](https://github.com/aragon/app-backend/commit/a370e7c416f5d6dd2ecc18bdb8854e25a5dc510f))
* spp pair proposal wrong try catch ([#702](https://github.com/aragon/app-backend/issues/702)) ([e9eeaaa](https://github.com/aragon/app-backend/commit/e9eeaaa583942521a86750a87f4472169ad23fa0))
* transaction indexing ([#674](https://github.com/aragon/app-backend/issues/674)) ([cae871e](https://github.com/aragon/app-backend/commit/cae871eb93f9a98cd6121504f8f44c60a889bc2d))
* unit test ([2d5a24e](https://github.com/aragon/app-backend/commit/2d5a24e9b47316275fe5f87eee008df50dbda2c8))
* unit test ([db82445](https://github.com/aragon/app-backend/commit/db824456b978a8c7564be535f234316c1d54edb2))
* unit test ([#688](https://github.com/aragon/app-backend/issues/688)) ([f6100e3](https://github.com/aragon/app-backend/commit/f6100e3d8af8e4690e94ddfe240491a95b3f1982))
* v2 routes + validation ([#707](https://github.com/aragon/app-backend/issues/707)) ([44fb7de](https://github.com/aragon/app-backend/commit/44fb7ded531d7e6d8a5db3e554e7658eed7c9477)), closes [#706](https://github.com/aragon/app-backend/issues/706)
* **votes:** add integration test for fetching past votes with retry via blockTimestamp/blockNumber ([#710](https://github.com/aragon/app-backend/issues/710)) ([dd34524](https://github.com/aragon/app-backend/commit/dd345244b8752fbb543fe14ad800446dfc119e5c))
* **votes:** add integration test for fetching past votes with retry via blockTimestamp/blockNumber ([#710](https://github.com/aragon/app-backend/issues/710)) ([a338e87](https://github.com/aragon/app-backend/commit/a338e870a72cb8981fe380574b836701c1032c20))

# [0.6.0](https://github.com/aragon/app-backend/compare/v0.5.2...v0.6.0) (2025-05-29)


### Bug Fixes

* conflicts fix ([e61e88a](https://github.com/aragon/app-backend/commit/e61e88abc92a2756bff06735e75005a2b783aed9))
* dao ens subdomain ([#576](https://github.com/aragon/app-backend/issues/576)) ([4869799](https://github.com/aragon/app-backend/commit/48697999df66ca32b205584bfa32f2e0df3f9ab3))
* **dao:** update document reference in Dao version upgrade logic ([#572](https://github.com/aragon/app-backend/issues/572)) ([719d323](https://github.com/aragon/app-backend/commit/719d3236afa8d9b910da6d33b306015b7ccf9a46))
* file ([#605](https://github.com/aragon/app-backend/issues/605)) ([5298dde](https://github.com/aragon/app-backend/commit/5298dde772dbe420905ed0661324b2672b29087a))
* **logAdmin:** update admin plugin handling and tests ([#593](https://github.com/aragon/app-backend/issues/593)) ([e99edd9](https://github.com/aragon/app-backend/commit/e99edd964233c7d7a5246a7310bb58d0357cd945))
* **logTokenVoting:** adjust onlyHistorical condition based on token block number ([#531](https://github.com/aragon/app-backend/issues/531)) ([54c9169](https://github.com/aragon/app-backend/commit/54c9169f63ce45af3fdb62a584ff39d11ffb5e71))
* mongodb save isHidden status ([#609](https://github.com/aragon/app-backend/issues/609)) ([1290ab4](https://github.com/aragon/app-backend/commit/1290ab43906e7a379625c340a08ac2cd8d52b1b0))
* **permissionHandler:** reorganize permission handling logic and update tests ([#546](https://github.com/aragon/app-backend/issues/546)) ([fa932c5](https://github.com/aragon/app-backend/commit/fa932c59f2932f3767882576da06a472af0f4bab))
* **proxyToken:** fallback to tokenTypeInfo.type for token type ([#574](https://github.com/aragon/app-backend/issues/574)) ([ab32186](https://github.com/aragon/app-backend/commit/ab32186c4fb5c2955fa73135b6c597f4baeba8c5))
* **proxyToken:** skip if goverance token ([#550](https://github.com/aragon/app-backend/issues/550)) ([6b8f48d](https://github.com/aragon/app-backend/commit/6b8f48d285961bddc9547553ada10038b23d8bfc))
* **proxyToken:** skip if goverance token staging ([#551](https://github.com/aragon/app-backend/issues/551)) ([d01d8fc](https://github.com/aragon/app-backend/commit/d01d8fc27970549914fd64f2888c999665cd3650))
* revert replace ens ([#575](https://github.com/aragon/app-backend/issues/575)) ([69acb53](https://github.com/aragon/app-backend/commit/69acb5341dd6d2564c553b0d6f15b23b6ad74006))
* **token:** ignore price fetching for testnet ([#547](https://github.com/aragon/app-backend/issues/547)) ([3dc6f54](https://github.com/aragon/app-backend/commit/3dc6f54b276cf0ab312329347985b60f520b23d5))


### Features

* admin api to set dao status ([#604](https://github.com/aragon/app-backend/issues/604)) ([12ca4fd](https://github.com/aragon/app-backend/commit/12ca4fd13a52222b4eff5dea29c4b947250ddbec))
* **aggregation:** add metadataIpfs field to aggregation and dao structures ([#558](https://github.com/aragon/app-backend/issues/558)) ([dc65481](https://github.com/aragon/app-backend/commit/dc654818f1e5f4be6771c393d665787d6e13da8c))
* **blockScout:** implement getAllTokenHolders method for fetching token holders with pagination ([#532](https://github.com/aragon/app-backend/issues/532)) ([45aa331](https://github.com/aragon/app-backend/commit/45aa331f7179bb0a7e44578ef2f6cd8661b6eb39))
* **crawler:** reset batch size based on run count in getLogsByBatch method ([#535](https://github.com/aragon/app-backend/issues/535)) ([bd5ffbc](https://github.com/aragon/app-backend/commit/bd5ffbcc61ba1a14f6531be8d64760dec24e15fb))
* **dao:** implement getDaoByEns endpoint and associated tests ([#556](https://github.com/aragon/app-backend/issues/556)) ([1eb6654](https://github.com/aragon/app-backend/commit/1eb6654f452ef606348de29466ed6cd44a06958b))
* **dao:** update getDaoDetails to accept network parameter and enhance tests ([#544](https://github.com/aragon/app-backend/issues/544)) ([2424a6d](https://github.com/aragon/app-backend/commit/2424a6d0362b7f588afd85ddb60e1e054e6778e9))
* heath endpoint ([827812b](https://github.com/aragon/app-backend/commit/827812b06d946f07caeade53f87b21fbb5304ad4))
* **memberInfo:** canCreateProposal check on chain ([#560](https://github.com/aragon/app-backend/issues/560)) ([371463c](https://github.com/aragon/app-backend/commit/371463c67426993f583f3fbf5057452cb33a07f0))
* **metadata:** Update existing metadata to the new active plugin and mark old one unsupported  ([#573](https://github.com/aragon/app-backend/issues/573)) ([a59a890](https://github.com/aragon/app-backend/commit/a59a8900b6e788a6159691fe0d9cb18539eb4e52))
* opt covalent token ([#602](https://github.com/aragon/app-backend/issues/602)) ([cdb3168](https://github.com/aragon/app-backend/commit/cdb31680ddaf8a57fcc3b61999b44d15e0c97e5f))
* opt tx category ([#603](https://github.com/aragon/app-backend/issues/603)) ([caa979d](https://github.com/aragon/app-backend/commit/caa979daa5e522073cd5a27a8daa0725d1107260))
* optimism config ([#581](https://github.com/aragon/app-backend/issues/581)) ([1707b99](https://github.com/aragon/app-backend/commit/1707b99d9e60e11c07f855b4f7edd876ada786ff))
* **plugin:** add plugin installation data handling api and tests ([#564](https://github.com/aragon/app-backend/issues/564)) ([d4f615d](https://github.com/aragon/app-backend/commit/d4f615df94b6841da55fa0e30829a8a4d3c54b9f))
* **plugin:** enhance installation data, improved error handling, serialization manually ([#569](https://github.com/aragon/app-backend/issues/569)) ([86f19bb](https://github.com/aragon/app-backend/commit/86f19bb4658c9480b28de15e3f9a0450054b8627))
* **plugin:** implement handleVersionUpgrade for DAO version management ([#571](https://github.com/aragon/app-backend/issues/571)) ([221b194](https://github.com/aragon/app-backend/commit/221b194eabbdcaa92ad3ae0cf98a9bbb490cba4c))
* **proposal:** getProposalDecodedActions endpoint + admin router recalculate actions ([#538](https://github.com/aragon/app-backend/issues/538)) ([11a2819](https://github.com/aragon/app-backend/commit/11a2819c40d608fcc91cf9a7a3be81792710dbed))
* **proposal:** implement canCreateProposal queue handling and related logic ([#562](https://github.com/aragon/app-backend/issues/562)) ([3766929](https://github.com/aragon/app-backend/commit/37669292b803a0fdf755d3cbcbb9c8444f496680))
* **subscan:** implement getAllTokenHolders ([#543](https://github.com/aragon/app-backend/issues/543)) ([94b3590](https://github.com/aragon/app-backend/commit/94b35903bad067c4590f0e9c23780d4bf4fbdcb9))
* **token:** add getClockMode method and integrate CLOCK_MODE handling in getPastVotes ([#529](https://github.com/aragon/app-backend/issues/529)) ([9f8c689](https://github.com/aragon/app-backend/commit/9f8c6892732da3bc54aac70c7443f46c6733107a))
* **tool:** add tool to fix broken transactions for DAOs ([#607](https://github.com/aragon/app-backend/issues/607)) ([13cadfc](https://github.com/aragon/app-backend/commit/13cadfc5dd8002126670a677d13c3b5d7cc152a5))
* **wallet:** safe wallet type return in proposal setting and general setting ([#570](https://github.com/aragon/app-backend/issues/570)) ([9cfea8f](https://github.com/aragon/app-backend/commit/9cfea8f76bc352a6c7990fd1eb9a69e6abf69c77))

## [0.5.2](https://github.com/aragon/app-backend/compare/v0.5.1...v0.5.2) (2025-05-05)


### Bug Fixes

* **govHandler:** Remove waiting time in case of realtime during handling transfer events ([#555](https://github.com/aragon/app-backend/issues/555)) ([37bb9d1](https://github.com/aragon/app-backend/commit/37bb9d1d2ce26b7fe1fd05adb1c11728a1e00c8e)), closes [#551](https://github.com/aragon/app-backend/issues/551) [#554](https://github.com/aragon/app-backend/issues/554)

## [0.5.1](https://github.com/aragon/app-backend/compare/v0.5.0...v0.5.1) (2025-05-05)


### Bug Fixes

* **proxyToken:** skip if goveranance token staging ([#551](https://github.com/aragon/app-backend/issues/551)) ([#553](https://github.com/aragon/app-backend/issues/553)) ([6abeb21](https://github.com/aragon/app-backend/commit/6abeb217e309a931c3602a8c38d616e524007229))

# [0.5.0](https://github.com/aragon/app-backend/compare/v0.4.1...v0.5.0) (2025-04-30)


### Bug Fixes

* format ([14ca2fd](https://github.com/aragon/app-backend/commit/14ca2fd412cbba5ad3dfa770b485910af9a36140))
* **memberEndpoint:** member balance model pagination was lacking network filter ([#502](https://github.com/aragon/app-backend/issues/502)) ([f38aa79](https://github.com/aragon/app-backend/commit/f38aa791ea61f052f25403997705e4105a0619f0))
* pm2 refactor ([#508](https://github.com/aragon/app-backend/issues/508)) ([6628109](https://github.com/aragon/app-backend/commit/6628109bf1947e4f80a92d6d617c9bf8ec2fd9a5))
* **proposal:** expose decoding in proposal endpoints ([#495](https://github.com/aragon/app-backend/issues/495)) ([bb51c1d](https://github.com/aragon/app-backend/commit/bb51c1d943071f9c1de08623a628865c781ffe75))


### Features

* **crawler:** removed parselog for transfer event with manual topic checking ([#515](https://github.com/aragon/app-backend/issues/515)) ([78ef87f](https://github.com/aragon/app-backend/commit/78ef87f31384620d176f5f15dd683a5e6fd03292))
* expose externalBodyResults  ([#524](https://github.com/aragon/app-backend/issues/524)) ([0372d91](https://github.com/aragon/app-backend/commit/0372d913fcc494d80ab60a4905dec0dcb192ec2a))
* heath endpoint ([#523](https://github.com/aragon/app-backend/issues/523)) ([0a4181a](https://github.com/aragon/app-backend/commit/0a4181ad59abc3f160dee80d8e9db13f64afac5c))
* **pagination:** fix pagination and decode action ([#497](https://github.com/aragon/app-backend/issues/497)) ([62c9ae3](https://github.com/aragon/app-backend/commit/62c9ae33be778ab7d4b432b1d8e46eb5b7e4bca9))
* peaq rpc timeout ([#505](https://github.com/aragon/app-backend/issues/505)) ([e637056](https://github.com/aragon/app-backend/commit/e6370562d6422342893d482aa70b5a22662a8dd5))
* **peaq:** debug peaq network ([#498](https://github.com/aragon/app-backend/issues/498)) ([10499fe](https://github.com/aragon/app-backend/commit/10499fe46e80945f6fc1171595d581bb922dd044))
* **rabbitmq:** more config and noop operation to keep alive connection ([#514](https://github.com/aragon/app-backend/issues/514)) ([e5d902a](https://github.com/aragon/app-backend/commit/e5d902a0700e4be161b1d3a1b9d100a19df1b4b5))

## [0.4.1](https://github.com/aragon/app-backend/compare/v0.4.0...v0.4.1) (2025-04-21)


### Bug Fixes

* **hotfix:** rabbitmq heartbeat, refactor parse transfer logs, pm2 restart on crash ([#516](https://github.com/aragon/app-backend/issues/516)) ([4ad6723](https://github.com/aragon/app-backend/commit/4ad672387303022e4ffcf875fd439063f095bbac))

# [0.4.0](https://github.com/aragon/app-backend/compare/v0.3.0...v0.4.0) (2025-04-18)


### Features

* peaq rpc timeout + member query + unit test ([e32a869](https://github.com/aragon/app-backend/commit/e32a86914fab02af0110ef180cee0e5d83c28f91))

# [0.3.0](https://github.com/aragon/app-backend/compare/v0.2.0...v0.3.0) (2025-04-16)


### Bug Fixes

* **blocknumber:** we subtract 1 from the adjust block as the block time is super fast in arbitrum ([#441](https://github.com/aragon/app-backend/issues/441)) ([7d578ec](https://github.com/aragon/app-backend/commit/7d578ec2c93b8332d289c5e2f39250349cbb9233))
* **crawler:**  try catch added on the pooling crawler ([#492](https://github.com/aragon/app-backend/issues/492)) ([024f149](https://github.com/aragon/app-backend/commit/024f149f088fd4b44170b7a1d495b321537d76ae))
* **crawler:** low range should be 5 ([#478](https://github.com/aragon/app-backend/issues/478)) ([5a06b24](https://github.com/aragon/app-backend/commit/5a06b247f66e0068ebbd6b3ab45c77cd209d6292))
* debug metrics ([#432](https://github.com/aragon/app-backend/issues/432)) ([3bbd494](https://github.com/aragon/app-backend/commit/3bbd494cc6c06b42955415ee273a5fb20bb00e7c))
* debug zksync ([#422](https://github.com/aragon/app-backend/issues/422)) ([a85b4d3](https://github.com/aragon/app-backend/commit/a85b4d35898c50511b046fd8122d368a917f8441))
* deployment new service ([#461](https://github.com/aragon/app-backend/issues/461)) ([37f74ed](https://github.com/aragon/app-backend/commit/37f74ed085dd140221455af391f4f7bcca09317f))
* **eventlistener:** remove unwanted transfer events ([#433](https://github.com/aragon/app-backend/issues/433)) ([3e82d34](https://github.com/aragon/app-backend/commit/3e82d344db75d8f94576e2d5e1d503d47bbb26b9))
* fix test using unavailable nodes ([#466](https://github.com/aragon/app-backend/issues/466)) ([90d0024](https://github.com/aragon/app-backend/commit/90d0024e4256bc6447f2809cbb73119ae0602380))
* **memberlist:** member listing now goes with separate logic with all… ([#393](https://github.com/aragon/app-backend/issues/393)) ([b4544d4](https://github.com/aragon/app-backend/commit/b4544d4e34b75056275fa840f4999377cdac96cf))
* **plugin:** install plugin on grant permission ([#453](https://github.com/aragon/app-backend/issues/453)) ([91ff789](https://github.com/aragon/app-backend/commit/91ff789a389eaa427504cb724cfd83cd3308f20e))
* **proposal:** check if parent proposal exist or not on reponse of indexed tx status ([#491](https://github.com/aragon/app-backend/issues/491)) ([d1ae2ed](https://github.com/aragon/app-backend/commit/d1ae2edbc8a5181b1a80197ff4c2dcbfc4b0bbca))
* queue proposal ([#469](https://github.com/aragon/app-backend/issues/469)) ([1b7368a](https://github.com/aragon/app-backend/commit/1b7368a15d142f1024e958ac6f7f2a0d3db8b8b0))
* release yml ([#446](https://github.com/aragon/app-backend/issues/446)) ([7c1efde](https://github.com/aragon/app-backend/commit/7c1efde0420e15bc6e9bf479a67a1ac89bd3a4f6))
* release yml ([#446](https://github.com/aragon/app-backend/issues/446)) ([#447](https://github.com/aragon/app-backend/issues/447)) ([d33e518](https://github.com/aragon/app-backend/commit/d33e51877512ee11c5ccfb98c02e7be857b711bd))
* **token:** taking price Usd from covalent first if covalent has the token info ([#454](https://github.com/aragon/app-backend/issues/454)) ([09860a2](https://github.com/aragon/app-backend/commit/09860a271dfb506f5f9e7995c1db5b03958e7703))


### Features

* aragon-admin-api service && endpoints to push back messaging in queue && Authentication ([#455](https://github.com/aragon/app-backend/issues/455)) ([60c282c](https://github.com/aragon/app-backend/commit/60c282c6a8f3e9807c823f2e1ec21367ffb390ed))
* db indenxing ([3c94b25](https://github.com/aragon/app-backend/commit/3c94b252aace25715520bd779ea75e91bb1d8f85))
* peaq web3 restructure ([#484](https://github.com/aragon/app-backend/issues/484)) ([ec6ce2b](https://github.com/aragon/app-backend/commit/ec6ce2beb13e45e35423af04e1bfdd7c6c358c5c)), closes [#486](https://github.com/aragon/app-backend/issues/486)
* **peaq:** default block number should be of plugin ([#489](https://github.com/aragon/app-backend/issues/489)) ([e23f0ec](https://github.com/aragon/app-backend/commit/e23f0ec1a507883e3ca48edb4fcae50c50a9c229))
* plugin slug check ([#457](https://github.com/aragon/app-backend/issues/457)) ([e7bfcdf](https://github.com/aragon/app-backend/commit/e7bfcdfa5b932088fef76c6d3a66cc4c4b259cb0))
* poolingCrawler ([#470](https://github.com/aragon/app-backend/issues/470)) ([2226fe3](https://github.com/aragon/app-backend/commit/2226fe37c6f84f3649df771939a1b25635e58f99))
* prod release ([#473](https://github.com/aragon/app-backend/issues/473)) ([1915ae2](https://github.com/aragon/app-backend/commit/1915ae240c8f5b13f0f9af8f4bd918ea8bf70dec)), closes [#451](https://github.com/aragon/app-backend/issues/451) [#453](https://github.com/aragon/app-backend/issues/453) [#454](https://github.com/aragon/app-backend/issues/454) [#457](https://github.com/aragon/app-backend/issues/457) [#456](https://github.com/aragon/app-backend/issues/456) [#455](https://github.com/aragon/app-backend/issues/455) [#461](https://github.com/aragon/app-backend/issues/461) [#462](https://github.com/aragon/app-backend/issues/462) [#463](https://github.com/aragon/app-backend/issues/463) [#466](https://github.com/aragon/app-backend/issues/466) [#465](https://github.com/aragon/app-backend/issues/465) [#464](https://github.com/aragon/app-backend/issues/464) [#469](https://github.com/aragon/app-backend/issues/469)
* proposal create handle spp ([#476](https://github.com/aragon/app-backend/issues/476)) ([29c6fc5](https://github.com/aragon/app-backend/commit/29c6fc55010a186209b866b3263928203643360c))
* rabbitmq skip duplicate with no response ([#456](https://github.com/aragon/app-backend/issues/456)) ([67b803b](https://github.com/aragon/app-backend/commit/67b803b362f1446f95e2a7bd4d3d4bf844232be9))
* **rates:** added more info in logs for debug ([#480](https://github.com/aragon/app-backend/issues/480)) ([03edf10](https://github.com/aragon/app-backend/commit/03edf108a9556a718deb8b407f03cc31c16d8fe3))
* release.yml ([#449](https://github.com/aragon/app-backend/issues/449)) ([2bc1a13](https://github.com/aragon/app-backend/commit/2bc1a13b9bcd7c19687b8e526507cbc681bd5bab)), closes [#446](https://github.com/aragon/app-backend/issues/446) [#448](https://github.com/aragon/app-backend/issues/448)
* return proposal created tx with slug ([#465](https://github.com/aragon/app-backend/issues/465)) ([693db03](https://github.com/aragon/app-backend/commit/693db03c5e2d674c1c4cf1c169f3f932ece302c3))

# [0.2.0](https://github.com/aragon/app-backend/compare/v0.1.1...v0.2.0) (2025-03-18)


### Bug Fixes

* alchemy transactions ([#407](https://github.com/aragon/app-backend/issues/407)) ([410b032](https://github.com/aragon/app-backend/commit/410b0326e475be7df03615a236c3c3612c15e7bf))
* dao metrics not count sub proposals, rates missing rabbitmq ([#417](https://github.com/aragon/app-backend/issues/417)) ([260b175](https://github.com/aragon/app-backend/commit/260b1757339d8f4a61b05087bbb1f5bdbaf0e440))
* deploy workflow node version ([a9dfdc6](https://github.com/aragon/app-backend/commit/a9dfdc6b8eb22b1e921fe5ec5bbe16524a5608f9))
* deploy workflow node version ([f613ac4](https://github.com/aragon/app-backend/commit/f613ac441e6626f0566e7ace7ead126afa26b574))
* deploy workflow node version ([606b7ad](https://github.com/aragon/app-backend/commit/606b7ad3dabc69d6935822e6a3c8a1c3f7f5cfda))
* deploy workflow node version ([dfe015d](https://github.com/aragon/app-backend/commit/dfe015d4bc53f2412de8c84151b6a80330a09889))
* deploy workflow node version ([b70d339](https://github.com/aragon/app-backend/commit/b70d3397012e9c53ace15f3a08908edc2e4900b1))
* deploy workflow node version ([304acec](https://github.com/aragon/app-backend/commit/304acecf9248538da1ef2074d227cc1fa51e2e35))
* deploy workflow node version ([438484b](https://github.com/aragon/app-backend/commit/438484b0ef4b6c59d2b4d2f526fac2e2e3d0eef1))
* deploy workflow node version ([b45ed8a](https://github.com/aragon/app-backend/commit/b45ed8a06d728128b260cfdfa56a263202179025))
* deploy workflow node version ([762c604](https://github.com/aragon/app-backend/commit/762c604a3d232f6a0037754da52452ed16d44699))
* deploy workflow node version ([#382](https://github.com/aragon/app-backend/issues/382)) ([37b8ed1](https://github.com/aragon/app-backend/commit/37b8ed18565f9fd35d78eb9aa8d3224464d5c558))
* format ([#389](https://github.com/aragon/app-backend/issues/389)) ([79fa528](https://github.com/aragon/app-backend/commit/79fa528d77d270b2358f382068369f0b3d32d1c2))
* git workflow ([#383](https://github.com/aragon/app-backend/issues/383)) ([6bb2533](https://github.com/aragon/app-backend/commit/6bb253378c7e0b2b99ac97e9ddf5e83beec5243c))
* test release ([#410](https://github.com/aragon/app-backend/issues/410)) ([cfce1bb](https://github.com/aragon/app-backend/commit/cfce1bbbd773eba1be39551c6f97348f8f1aa046))
* uninstall plugin bug ([#411](https://github.com/aragon/app-backend/issues/411)) ([d0ff662](https://github.com/aragon/app-backend/commit/d0ff662b03b10aa3de96d5379c7407fad5865bca))


### Features

* **APP-4063:** Logz too many error event on missing minApproval ([#378](https://github.com/aragon/app-backend/issues/378)) ([02e440b](https://github.com/aragon/app-backend/commit/02e440bd4f6fafa747c88b96e3ea53c5ed07bfaf))
* **APP-4063:** semantic-release ([#379](https://github.com/aragon/app-backend/issues/379)) ([52632e1](https://github.com/aragon/app-backend/commit/52632e1f6277423618d39f35a6d01a749bfebff3))
* **APP-4075:** support multisig abi v2 ([#387](https://github.com/aragon/app-backend/issues/387)) ([bf7d65a](https://github.com/aragon/app-backend/commit/bf7d65ac8d15bcc23eb067dba4b832d7a528d369))
* on revoke only uninstall when plugin hasTarget ([#388](https://github.com/aragon/app-backend/issues/388)) ([7c2db69](https://github.com/aragon/app-backend/commit/7c2db695361588a7648b7e0a74c13d333e625277))
