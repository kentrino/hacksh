# Changelog

## [0.14.0](https://github.com/kentrino/hacksh/compare/v0.13.0...v0.14.0) (2026-10-28)


### ⚠ BREAKING CHANGES

* **api:** Printer factories, output-mode helpers, and renderer-facing types move to `hacksh/printer`. Argument aliases, environment bindings, value names, labels, and descriptions come from Zod metadata; `argOptions` and positional `_` are removed in favor of `.meta(...)` and `positionals`. Interactive input moves from `logger` to `context.prompt`. `consolePrinter`, `createStreamPrinter`, usage writer overrides, and automatic standalone usage output are removed; `showUsage` requires a printer and `renderUsage` returns a string synchronously. Context uses `command` and `input.argv`, `input.unknown`, and `input.passthrough` instead of `cmd`, `rawArgs`, `extraArgs`, and `passthrough`. `runCommand` infers handler results, `version` is reserved when the command is defined, and `createMain` is removed in favor of `runMain`.

### Refactoring

* **api:** narrow the public command surface ([#49](https://github.com/kentrino/hacksh/issues/49)) ([3b04e8b](https://github.com/kentrino/hacksh/commit/3b04e8bf49ef3a25bd101ffb4371dd304a201fab))

## [0.13.0](https://github.com/kentrino/hacksh/compare/v0.12.0...v0.13.0) (2026-10-28)


### Features

* **exec:** skip one call when dryRun is true ([#47](https://github.com/kentrino/hacksh/issues/47)) ([2184de4](https://github.com/kentrino/hacksh/commit/2184de4fe1eb3cfc231aa2b6f17b7a3b7fe58bb7))

## [0.12.0](https://github.com/kentrino/hacksh/compare/v0.11.0...v0.12.0) (2026-10-22)


### ⚠ BREAKING CHANGES

* unknown options and excess positional arguments now fail by default. Set allowUnknownArgs: true for commands that intentionally consume extraArgs.

### Features

* reject unknown arguments by default ([#43](https://github.com/kentrino/hacksh/issues/43)) ([a12825a](https://github.com/kentrino/hacksh/commit/a12825a314139f59b9f823a9ab9e9c1d65bb6d7e))

## [0.11.0](https://github.com/kentrino/hacksh/compare/v0.10.0...v0.11.0) (2026-10-20)


### Features

* **run:** pass a per-invocation AbortSignal to run, exec, and prompts ([#40](https://github.com/kentrino/hacksh/issues/40)) ([0811786](https://github.com/kentrino/hacksh/commit/0811786f8db2eda1293d02614ed00cfdf61bb708))

## [0.10.0](https://github.com/kentrino/hacksh/compare/v0.9.0...v0.10.0) (2026-10-20)


### Features

* **errors:** add HackshExitError to choose the runMain exit status ([#38](https://github.com/kentrino/hacksh/issues/38)) ([83bfa7c](https://github.com/kentrino/hacksh/commit/83bfa7c504a3e7f9e2baa57e9095f89bd3ce3ad0))

## [0.9.0](https://github.com/kentrino/hacksh/compare/v0.8.0...v0.9.0) (2026-10-20)


### Features

* **command:** reject options that shadow the builtin --help and --version ([#36](https://github.com/kentrino/hacksh/issues/36)) ([0a5a957](https://github.com/kentrino/hacksh/commit/0a5a9578557e944750f9ca1317dbeb73495e0541))

## [0.8.0](https://github.com/kentrino/hacksh/compare/v0.7.0...v0.8.0) (2026-10-20)


### Features

* **run:** fall back to the executable's package.json version ([#34](https://github.com/kentrino/hacksh/issues/34)) ([d483e7c](https://github.com/kentrino/hacksh/commit/d483e7cf78f84f1e663bc793499dbc540a295815))

## [0.7.0](https://github.com/kentrino/hacksh/compare/v0.6.0...v0.7.0) (2026-10-20)


### Features

* **exec:** show redacted command starts and refuse terminal conflicts ([#32](https://github.com/kentrino/hacksh/issues/32)) ([ee7ae8a](https://github.com/kentrino/hacksh/commit/ee7ae8a2cfb975845968b39dd53acbde800c2387))

## [0.6.0](https://github.com/kentrino/hacksh/compare/v0.5.4...v0.6.0) (2026-10-20)


### Features

* **exec:** run external commands from the command context ([#30](https://github.com/kentrino/hacksh/issues/30)) ([6709b72](https://github.com/kentrino/hacksh/commit/6709b721f18f220fd566dbcae41bb9cc50bfb538))

## [0.5.4](https://github.com/kentrino/hacksh/compare/v0.5.3...v0.5.4) (2026-10-20)


### Miscellaneous

* **skills:** move verify-hacksh to .agents/skills and symlink .cursor/skills ([#27](https://github.com/kentrino/hacksh/issues/27)) ([836fbf6](https://github.com/kentrino/hacksh/commit/836fbf632fe51ee34b270abfbbff31df8b3116bd))

## [0.5.3](https://github.com/kentrino/hacksh/compare/v0.5.2...v0.5.3) (2026-10-20)


### CI/CD

* **release:** hide docs commits from release notes ([#25](https://github.com/kentrino/hacksh/issues/25)) ([3da70b2](https://github.com/kentrino/hacksh/commit/3da70b28324eb7e12f193491027ca480daa1f692))

## [0.5.2](https://github.com/kentrino/hacksh/compare/v0.5.1...v0.5.2) (2026-10-20)


### Documentation

* **issues:** park deferred issues with triage reasons ([#23](https://github.com/kentrino/hacksh/issues/23)) ([866b0a0](https://github.com/kentrino/hacksh/commit/866b0a05b56bce22915919560ce764eb9fd68a08))

## [0.5.1](https://github.com/kentrino/hacksh/compare/v0.5.0...v0.5.1) (2026-10-20)


### Documentation

* **agents:** replace plan execution skills with complete-theme ([#21](https://github.com/kentrino/hacksh/issues/21)) ([d446c34](https://github.com/kentrino/hacksh/commit/d446c342bbc5e3b7dc9ad60025aaa66f7afdd89c))

## [0.5.0](https://github.com/kentrino/hacksh/compare/v0.4.2...v0.5.0) (2026-10-18)


### ⚠ BREAKING CHANGES

* **args:** read named options from command-path environment variables ([#19](https://github.com/kentrino/hacksh/issues/19))

### Features

* **args:** read named options from command-path environment variables ([#19](https://github.com/kentrino/hacksh/issues/19)) ([35908d1](https://github.com/kentrino/hacksh/commit/35908d1f2e63512bc8b1d15e256bdbccd86daaac))

## [0.4.2](https://github.com/kentrino/hacksh/compare/v0.4.1...v0.4.2) (2026-10-18)


### Miscellaneous

* **skills:** add verify-hacksh skill for consumer CLI proofs ([#17](https://github.com/kentrino/hacksh/issues/17)) ([dc454f9](https://github.com/kentrino/hacksh/commit/dc454f9728bcea356ce8c7e3844e4e0c5295eda5))

## [0.4.1](https://github.com/kentrino/hacksh/compare/v0.4.0...v0.4.1) (2026-10-18)


### Documentation

* **issues:** split issues into open and closed directories ([#15](https://github.com/kentrino/hacksh/issues/15)) ([48b28d0](https://github.com/kentrino/hacksh/commit/48b28d043fed10974def5fe40b4d27238125c818))

## [0.4.0](https://github.com/kentrino/hacksh/compare/v0.3.0...v0.4.0) (2026-10-15)


### Breaking Changes

* Rename the public error classes and issue type to `HackshUsageError`, `HackshValidationError`, and `HackshIssue`. Update imports and serialized error-name checks to the new names. Verification scripts now use `HACKSH_MINIMUM_NODE` and `HACKSH_TYPE_TESTS`.

### Refactoring

* **api:** align public symbols with the Hacksh name ([#13](https://github.com/kentrino/hacksh/issues/13)) ([aa0d55a](https://github.com/kentrino/hacksh/commit/aa0d55aa345eec0b548a10113fbc42defc0eff5a))

## [0.3.0](https://github.com/kentrino/hacksh/compare/v0.2.1...v0.3.0) (2026-10-15)


### ⚠ BREAKING CHANGES

* Remove negatedDescription from ArgOptions and UsageOptionSummary. Boolean help now uses --[no-]name, and UsageOptionSummary requires negatable.

### Features

* document boolean negation in help automatically ([#11](https://github.com/kentrino/hacksh/issues/11)) ([4c480d1](https://github.com/kentrino/hacksh/commit/4c480d1f632b27adc456e7982aeed947d83beb41))

## [0.2.1](https://github.com/kentrino/hacksh/compare/v0.2.0...v0.2.1) (2026-10-15)


### Documentation

* organize CLI roadmap and publication rules ([#9](https://github.com/kentrino/hacksh/issues/9)) ([de08dcc](https://github.com/kentrino/hacksh/commit/de08dcca3280350e36431a6655540dff8d5eac37))

## [0.2.0](https://github.com/kentrino/hacksh/compare/v0.1.2...v0.2.0) (2026-10-15)


### Features

* add structured terminal output and interactive prompts ([#7](https://github.com/kentrino/hacksh/issues/7)) ([3520297](https://github.com/kentrino/hacksh/commit/3520297321fcfd2f55187e184d2de9aceb07653b))

## [0.1.2](https://github.com/kentrino/hacksh/compare/v0.1.1...v0.1.2) (2026-10-15)


### Bug Fixes

* declare bundled types for npm discovery ([#5](https://github.com/kentrino/hacksh/issues/5)) ([97d4fe5](https://github.com/kentrino/hacksh/commit/97d4fe56aa2d3397e0b36634d65e61c36b7fea22))

## [0.1.1](https://github.com/kentrino/hacksh/compare/v0.1.0...v0.1.1) (2026-10-15)


### CI/CD

* match root release PRs without a component ([#3](https://github.com/kentrino/hacksh/issues/3)) ([8e20950](https://github.com/kentrino/hacksh/commit/8e20950fed522ecac097b7f44e9a170746d6bc1e))

## 0.1.0 (2026-10-15)


### ⚠ BREAKING CHANGES

* rename the npm package to hacksh
* declare positional arguments as a tuple in the _ field
* merge alias and argDisplay into argOptions

### Features

* automate releases and complete package metadata ([#1](https://github.com/kentrino/hacksh/issues/1)) ([e8b72f2](https://github.com/kentrino/hacksh/commit/e8b72f23d9f7243fdb02a9e070864b99a38bd80b))
* declare positional arguments as a tuple in the _ field ([8ffc295](https://github.com/kentrino/hacksh/commit/8ffc2950f451e5c78db586a4e43e767c599fda3e))
* define commands from zod schemas ([b8749e9](https://github.com/kentrino/hacksh/commit/b8749e96d242b95054da624f0203de7c54e22160))
* expand help and boolean arguments ([641fd49](https://github.com/kentrino/hacksh/commit/641fd494ce2640ea5697a2d689f65efd7bbceb1b))
* expose phase one composition APIs ([91a444a](https://github.com/kentrino/hacksh/commit/91a444ac8154c5a2aec573a614656590c9483383))
* merge alias and argDisplay into argOptions ([cc9bff8](https://github.com/kentrino/hacksh/commit/cc9bff802c0d919fb98b2efd6cc28d9ad5a2fc4d))
* parse and validate command arguments ([cf78d51](https://github.com/kentrino/hacksh/commit/cf78d518038b787c7bb63dbed70c6072fbd951dd))
* route commands and render CLI help ([36702d7](https://github.com/kentrino/hacksh/commit/36702d76816554b07e71e6cbcd1704e0bee04b44))
* support hidden subcommands ([9301166](https://github.com/kentrino/hacksh/commit/9301166430061662082eebada79623ea6ce68ebe))
* support variadic positional arguments ([9026062](https://github.com/kentrino/hacksh/commit/9026062774a30cc8c504a09f712e1b979c817f2f))


### Bug Fixes

* cover aliases and reserved option names ([40818bc](https://github.com/kentrino/hacksh/commit/40818bc4281096234c8bafc58024e29ad23f8c5f))
* enforce boolean token syntax ([f98d917](https://github.com/kentrino/hacksh/commit/f98d91716b1637462446a20b8ee4e3d389b7778d))
* harden phase one API boundaries ([ad085ec](https://github.com/kentrino/hacksh/commit/ad085ece42ed73262968f02f03a57959127e24fe))
* preserve inline boolean values during validation ([13111cf](https://github.com/kentrino/hacksh/commit/13111cf1da8561d5f719f2e2caabd8eb9e71fab8))
* **skills:** reduce repeated context in plan execution ([8c492b2](https://github.com/kentrino/hacksh/commit/8c492b2ff79582ddb665eed0c9fe077b3fecf03e))
* unify CLI token handling across runtimes ([b30133a](https://github.com/kentrino/hacksh/commit/b30133a39ed786e25d2157bde84390fa08b93239))


### Documentation

* accept help and boolean review ([757f077](https://github.com/kentrino/hacksh/commit/757f077362286286e0421c15259476c1470be758))
* accept hidden subcommand implementation ([72789cb](https://github.com/kentrino/hacksh/commit/72789cbd92c00b74abdfa289c3b13d10fa4d204b))
* accept phase 2 completion audit ([7e58e4c](https://github.com/kentrino/hacksh/commit/7e58e4c0f12ef92161f37c67c4ea854fa6d64d5c))
* accept phase 3 integration ([6885cf2](https://github.com/kentrino/hacksh/commit/6885cf2488488e378fd03a7c5fdd1c89e5e50d61))
* accept variadic implementation review ([cd88d4e](https://github.com/kentrino/hacksh/commit/cd88d4ea6516056e45137722186575e34c23c651))
* add release playbooks for npm and GitHub ([c419900](https://github.com/kentrino/hacksh/commit/c41990084fb183b2acd04661887ad93f20257ec0))
* **agents:** format issues before implementation handoff ([fc61228](https://github.com/kentrino/hacksh/commit/fc612280f18ab53ac03ee36556d4816f742b669b))
* **agents:** pass verified runtime commands to workers ([e0618e4](https://github.com/kentrino/hacksh/commit/e0618e48b8b141dd6534ea7121e21010d8113d5c))
* assign help and boolean implementation ([34a6203](https://github.com/kentrino/hacksh/commit/34a62035c86d4f06bcb3e1c6850800621376bb46))
* assign phase 2 final integration ([9c3e37b](https://github.com/kentrino/hacksh/commit/9c3e37b0a294ae640ea9a5414edeed4679351a83))
* assign variadic implementation ([8e478f8](https://github.com/kentrino/hacksh/commit/8e478f8489cd57d43574a6e13ba2e4a343a4639a))
* **cli-framework:** close completed execution sessions ([04194b0](https://github.com/kentrino/hacksh/commit/04194b05720e64e9db99230551045c6b2b25a13a))
* **cli-framework:** map release acceptance evidence ([ce8886b](https://github.com/kentrino/hacksh/commit/ce8886ba1503b84ce0ec5eed4789c771e939ce87))
* **cli-framework:** record delegated implementation session ([9a0d448](https://github.com/kentrino/hacksh/commit/9a0d44809f2cc3213b6116b0a9dec7f4225e145a))
* **cli-framework:** record first-release execution scope ([c24511c](https://github.com/kentrino/hacksh/commit/c24511caa70d8ae075518b092df88854114bb9ff))
* **cli-framework:** record integration progress and review session ([74fa3b3](https://github.com/kentrino/hacksh/commit/74fa3b37d6851a632efbbf476a1d200a2a40ec90))
* **cli-framework:** record review findings and correction round ([e77ea86](https://github.com/kentrino/hacksh/commit/e77ea8645d383c3c35d30a15b415762a12e1c488))
* **cli-framework:** record schema and parser progress ([de910d2](https://github.com/kentrino/hacksh/commit/de910d23ced5b1d7c84ffe897ec3f88631b397f6))
* **cli-framework:** record second review correction round ([53a78c9](https://github.com/kentrino/hacksh/commit/53a78c9c008ea6f9eb091159d8d905b8cc858336))
* **cli-framework:** record verified first-release completion ([a75897d](https://github.com/kentrino/hacksh/commit/a75897dbd94290aa7da72924f67a5a36f37fe02d))
* **execute-plan:** add plan execution supervisor skill ([ef52680](https://github.com/kentrino/hacksh/commit/ef5268080a5e9a61eebfc4b49c02939f10a7313d))
* **execute-plan:** define phased issue acceptance workflow ([4bf0eaf](https://github.com/kentrino/hacksh/commit/4bf0eaf8240b9cfe45186ebfec2934183ce4db1e))
* **execute-plans:** add multi-plan goal workflow with retrospectives ([0655f46](https://github.com/kentrino/hacksh/commit/0655f46f5a701c320fe961196b84923b12268891))
* **plan:** add zod-based cli framework design ([2655ff2](https://github.com/kentrino/hacksh/commit/2655ff2e74ba3e5d8a448af38b681c6b23704005))
* **plan:** phase remaining CLI framework features ([076170b](https://github.com/kentrino/hacksh/commit/076170b4d2cef1de1d10e984142b8252eb1e7d22))
* **plan:** record phase 1 execution contracts and acceptance ([649e4fc](https://github.com/kentrino/hacksh/commit/649e4fcd776b61bf94e868b6039729aa85a80b67))
* **plan:** record verified phase 1 completion ([f99f985](https://github.com/kentrino/hacksh/commit/f99f985ffc3a6634b2029fc244aa9657467dccaf))
* **plan:** revise cli framework interfaces ([4959fcb](https://github.com/kentrino/hacksh/commit/4959fcb06ad29726c95ac5469ba6cd0cf18209f1))
* **plan:** simplify cli framework api ([455463c](https://github.com/kentrino/hacksh/commit/455463ced8acedfa10a0cad8d92255769721c3d0))
* **plan:** split CLI framework extension and defer later phases ([f43188f](https://github.com/kentrino/hacksh/commit/f43188f875d62830ab428c599ea77771899d480a))
* raise issue for argDisplay label fields ([b4ad1ae](https://github.com/kentrino/hacksh/commit/b4ad1ae70b7aaf48e234dd416b666ace631bab36))
* raise issue for positional arguments outside schema ([ca4441c](https://github.com/kentrino/hacksh/commit/ca4441c09c617f12a7f6013ff2b5b518c31436ef))
* raise OSS readiness theme and issues ([5e3e3ed](https://github.com/kentrino/hacksh/commit/5e3e3eddbcafd87530afa8f85a7c63b551253f61))
* record applied phase 2 workflow improvement ([555ac64](https://github.com/kentrino/hacksh/commit/555ac6400c2aed7d61c42a8cc8ce786b90f8854e))
* record applied phase 3 workflow improvement ([bbab676](https://github.com/kentrino/hacksh/commit/bbab6760dce5a882c45ef8d8d3023b1c5c6b2c19))
* record help and boolean evidence ([fc052d9](https://github.com/kentrino/hacksh/commit/fc052d9e81756daded3e56b7b2fb2d9bfb71f67c))
* record help review corrections ([eab6916](https://github.com/kentrino/hacksh/commit/eab6916aa916dd9e869d28ec0c49c4d61acf05ab))
* record hidden command integration evidence ([45d263c](https://github.com/kentrino/hacksh/commit/45d263cf9d93f3be26a9b689354c2bfc2ee583ea))
* record hidden subcommand evidence ([a60bc63](https://github.com/kentrino/hacksh/commit/a60bc63ecccf587f642045c444addef723b52941))
* record phase 2 implementation issues ([1b1567a](https://github.com/kentrino/hacksh/commit/1b1567a83ae38d46c2b4ad5280a1661280838786))
* record phase 2 integration evidence ([58888b1](https://github.com/kentrino/hacksh/commit/58888b1f6c2d51f37eb13d1def74e091b2c65081))
* record phase 2 retrospective ([763a4ce](https://github.com/kentrino/hacksh/commit/763a4cebc9af40b2760ebc6266f79d1ce2df1640))
* record phase 3 execution issues ([a843989](https://github.com/kentrino/hacksh/commit/a8439895d94cec8ae26a4260ff53978d5b6dedda))
* record phase 3 retrospective ([4b331ff](https://github.com/kentrino/hacksh/commit/4b331ff10dc5b281a032fdb9ac18d789146d5331))
* record review handoff and integration prerequisite ([81c09ee](https://github.com/kentrino/hacksh/commit/81c09ee29db623bdefe2a39e84d93295149f584f))
* record variadic implementation evidence ([1f317a6](https://github.com/kentrino/hacksh/commit/1f317a6518fb1d71c818d2ad17973d81c66818e9))
* remove completed issues and plans ([bee0536](https://github.com/kentrino/hacksh/commit/bee0536b76dfc3abe492f80b0cd11539157faa34))
* split deferred items into themes and issues ([5a39d5a](https://github.com/kentrino/hacksh/commit/5a39d5a60a7866e42ddd0aed26224b9ce36812c4))


### Tests

* cover hidden commands in packed consumers ([78afef1](https://github.com/kentrino/hacksh/commit/78afef111079b9772ced16ebf3d5bad6c2afc5ca))
* exercise packed Node and Deno consumers ([a236dc3](https://github.com/kentrino/hacksh/commit/a236dc3187de82cee454e033e32648d282fdb159))
* integrate phase 2 packed consumers ([c94f5dc](https://github.com/kentrino/hacksh/commit/c94f5dc734ead8ccef40dfb757c8606c87cafbd7))
* make minimum Node runner explicit ([009d2db](https://github.com/kentrino/hacksh/commit/009d2dbcdbd3fb6916a438e6a0014cf6d41ba01e))
* make process output assertion color-independent ([83652c9](https://github.com/kentrino/hacksh/commit/83652c975be9e9efcb31475d79f8b0c83dae4d09))
* verify CLI consumers and package behavior ([09ef753](https://github.com/kentrino/hacksh/commit/09ef753edd47ad794c3cc9e478471a4d694682b9))
* verify packed phase one consumers ([269df37](https://github.com/kentrino/hacksh/commit/269df37a5d99fe793362e5d1abbab0230ccffff4))


### Miscellaneous

* rename the npm package to hacksh ([d12e917](https://github.com/kentrino/hacksh/commit/d12e917f38fe8596f9fec3f999dc8e735d6af507))
* **repo:** bootstrap pnpm project with vite-plus and ci ([36edd3b](https://github.com/kentrino/hacksh/commit/36edd3bf43d2925225452fce565c5ddb27665b60))
