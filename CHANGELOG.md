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
