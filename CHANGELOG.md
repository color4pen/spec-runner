# Changelog

## [0.1.1](https://github.com/color4pen/spec-runner/compare/specrunner-v0.1.0...specrunner-v0.1.1) (2026-05-27)


### Features

* add GitHub OAuth authentication and app foundation (Phase 2) ([91842e5](https://github.com/color4pen/spec-runner/commit/91842e5be791cf3d891308355aacbe7f8b797053))
* add specrunner doctor command — environment / dependency / auth diagnostics ([#49](https://github.com/color4pen/spec-runner/issues/49)) ([435c273](https://github.com/color4pen/spec-runner/commit/435c273c15701722250120bd25d3a73b723147e8))
* AgentRunner port 抽出 + Claude Code SDK local runtime 追加 ([#80](https://github.com/color4pen/spec-runner/issues/80)) ([bc98f51](https://github.com/color4pen/spec-runner/commit/bc98f516bdb70b4fae8a89d5750773720ddf9945))
* bootstrap session lifecycle with layer separation ([#5](https://github.com/color4pen/spec-runner/issues/5)) ([d2b42f0](https://github.com/color4pen/spec-runner/commit/d2b42f0515d88d7155c84ddca0c3b49a765d86f8))
* code-review / code-fixer step 追加（実装層レビューループ確立） ([#38](https://github.com/color4pen/spec-runner/issues/38)) ([4b0f6e4](https://github.com/color4pen/spec-runner/commit/4b0f6e4a3b49df97cebb9105f3c2fb8de1672214))
* detect bootstrap status on repository registration ([#9](https://github.com/color4pen/spec-runner/issues/9)) ([08f6e92](https://github.com/color4pen/spec-runner/commit/08f6e92bd21854a6a421a0c805d05603081ce7bc))
* externalize step execution config to config.json ([#95](https://github.com/color4pen/spec-runner/issues/95)) ([0be13f6](https://github.com/color4pen/spec-runner/commit/0be13f67f60ac8be29c0139be17f5f61edee86bb))
* finish コマンド再設計 — 1-PR モデル + slug schema 化 + Phase 0 pre-flight ([#56](https://github.com/color4pen/spec-runner/issues/56)) ([a06d428](https://github.com/color4pen/spec-runner/commit/a06d428cdfca660c31a550da5e2dbf9d4b526784))
* implement CLI core pipeline (specrunner run propose) ([#19](https://github.com/color4pen/spec-runner/issues/19)) ([00069ef](https://github.com/color4pen/spec-runner/commit/00069ef0d6b55895462a8f7108b05a8b84d57193))
* implement specrunner finish command ([#51](https://github.com/color4pen/spec-runner/issues/51)) ([8e600e7](https://github.com/color4pen/spec-runner/commit/8e600e739c2325c385b05ccfdf8687773c43c3e2))
* implementer / verification / build-fixer steps (spec→code self-correct loop) ([#36](https://github.com/color4pen/spec-runner/issues/36)) ([5a7a628](https://github.com/color4pen/spec-runner/commit/5a7a628c12ddea458f14c0d65691d8ffcae4c468))
* managed agent bootstrap with repository registration ([#3](https://github.com/color4pen/spec-runner/issues/3)) ([20c3429](https://github.com/color4pen/spec-runner/commit/20c3429de09f32e32f1aef888ed51514066a257d))
* Phase 1 PoC - SpecRunner on Managed Agents ([cffb928](https://github.com/color4pen/spec-runner/commit/cffb928641d0e6ea1095f9ab69b67ac79846d6fa))
* pr-create step 追加（self-host pipeline 完成形） ([#40](https://github.com/color4pen/spec-runner/issues/40)) ([a6073f2](https://github.com/color4pen/spec-runner/commit/a6073f2bc39764a701ce4b04b12f49a598b8daa4))
* propose openspec CLI integration + per-step model/maxTurns config ([#91](https://github.com/color4pen/spec-runner/issues/91)) ([673d0fe](https://github.com/color4pen/spec-runner/commit/673d0feec79d766f46efa1d5cf07525326daad26))
* remove session timeout from step pipeline ([#60](https://github.com/color4pen/spec-runner/issues/60)) ([bdefcf8](https://github.com/color4pen/spec-runner/commit/bdefcf835906bf1b49dd8f8976ed904708278cd1))
* request create + propose session pipeline ([#6](https://github.com/color4pen/spec-runner/issues/6)) ([7480b1d](https://github.com/color4pen/spec-runner/commit/7480b1df27d1d730f9bfeeb7791fd8e21cfd451e))
* slug delegation and branch tracking via Custom Tool ([#11](https://github.com/color4pen/spec-runner/issues/11)) ([e3be90c](https://github.com/color4pen/spec-runner/commit/e3be90ce37a5e20dc498de84a380473588894d60))
* spec-fixer + iteration loop primitive ([#24](https://github.com/color4pen/spec-runner/issues/24)) ([b2eee50](https://github.com/color4pen/spec-runner/commit/b2eee50be845fabb8d72c81427df1bc43d3dd9fe))
* spec-review session integration (propose → spec-review pipeline) ([#22](https://github.com/color4pen/spec-runner/issues/22)) ([812d05c](https://github.com/color4pen/spec-runner/commit/812d05c24dd327a5cfa0d3209407acc9a53db230))
* unify review-side exit contract for Managed Agents ([#46](https://github.com/color4pen/spec-runner/issues/46)) ([3890ee5](https://github.com/color4pen/spec-runner/commit/3890ee503aa00a102c2087ff2d8476288bc71526))


### Bug Fixes

* add delta spec format rules to propose system prompt ([#100](https://github.com/color4pen/spec-runner/issues/100)) ([689a6c2](https://github.com/color4pen/spec-runner/commit/689a6c2101b56dbc4494e7772d294f7da4164e35))
* add missing baseBranch to spec-review-lightweight test fixtures ([#148](https://github.com/color4pen/spec-runner/issues/148)) ([a577101](https://github.com/color4pen/spec-runner/commit/a5771015919d222116871becc6c4a5c463ab51b9))
* archive --skip-specs auto-detect を openspec nested convention に合わせる ([#65](https://github.com/color4pen/spec-runner/issues/65)) ([#67](https://github.com/color4pen/spec-runner/issues/67)) ([adc55ca](https://github.com/color4pen/spec-runner/commit/adc55cac3ffdd71f3519330d30c7243d81af5140))
* archive orphan openspec/changes/readme-status-section after dogfooding-006 ([#55](https://github.com/color4pen/spec-runner/issues/55)) ([b027f9e](https://github.com/color4pen/spec-runner/commit/b027f9e8832b45993fa38d54c1804e4ac8794394))
* ci.yml の node compat check パスを tsup 出力に合わせる ([06841d1](https://github.com/color4pen/spec-runner/commit/06841d13e0729e0d9f3717966b525bcd816ebd1e))
* code-fixer requiresCommit を false に再修正（並列 PR マージ時の巻き戻し） ([2372a64](https://github.com/color4pen/spec-runner/commit/2372a6470f2907919a174614493af8a642baf1f4))
* detect when writing-agent step ends without advancing branch HEAD ([#69](https://github.com/color4pen/spec-runner/issues/69)) ([b95b26d](https://github.com/color4pen/spec-runner/commit/b95b26df237d8991ed60bc2e509be4b1ea5aac0b))
* force light mode and add explicit input colors ([e987ba8](https://github.com/color4pen/spec-runner/commit/e987ba892f8281b1e89dedad7e1e40fe089261a9))
* local runtime bugs + finish preflight MERGED bypass ([#89](https://github.com/color4pen/spec-runner/issues/89)) ([28e7603](https://github.com/color4pen/spec-runner/commit/28e7603a35c45fbc882144832d2c787109bfc2f3))
* local runtime sets state.branch after propose step ([#87](https://github.com/color4pen/spec-runner/issues/87)) ([17aecfd](https://github.com/color4pen/spec-runner/commit/17aecfd37a55d0d1ee57bf0a80f10b324cc5a785))
* local runtime uses step.completionVerdict when resultContent is null ([#86](https://github.com/color4pen/spec-runner/issues/86)) ([57ea4d9](https://github.com/color4pen/spec-runner/commit/57ea4d960f62fddba83b822948504bd479ca0989))
* make review verdict parser more tolerant of format variations ([43c0e1d](https://github.com/color4pen/spec-runner/commit/43c0e1d4b30ac1539425808306b775246a4513dc))
* propagate verification-result.md to feature branch for build-fixer ([#68](https://github.com/color4pen/spec-runner/issues/68)) ([f828b4c](https://github.com/color4pen/spec-runner/commit/f828b4c829b27ad737e785dfdfb06515c722188d))
* propose agent stub upgrade + slug single-source-of-truth ([#42](https://github.com/color4pen/spec-runner/issues/42)) ([40e35e1](https://github.com/color4pen/spec-runner/commit/40e35e11a7ebac6ab35afd4af422981835c98e60))
* reconcile cli-commands count drift and remove test-slug residue ([#53](https://github.com/color4pen/spec-runner/issues/53)) ([d72015a](https://github.com/color4pen/spec-runner/commit/d72015a6ff1a067d0bfbc84a825c023adc31ec7d))
* register Custom Tool in agent and fix propose navigation regression ([#15](https://github.com/color4pen/spec-runner/issues/15)) ([1d8d075](https://github.com/color4pen/spec-runner/commit/1d8d075befa0beb224c32e3cec9712f64695ed3d))
* register-branch 削除テストでディレクトリ不在時に ENOENT を回避 ([#118](https://github.com/color4pen/spec-runner/issues/118)) ([fc6da87](https://github.com/color4pen/spec-runner/commit/fc6da873fd1f13c0e580c7b3dc8fa63f9f9b1dd0))
* release-please を manifest モードに切り替え、0.x での major bump を防止 ([3254be2](https://github.com/color4pen/spec-runner/commit/3254be2cd12fddaae88ece50ccd7191ec831527b))
* remove duplicate Requirements in cli-commands baseline ([ed1ef2d](https://github.com/color4pen/spec-runner/commit/ed1ef2dbf54cda39af07a6d02eeb6ca276385b33))
* replace ClaudeCodeRunner subprocess with SDK query() ([#84](https://github.com/color4pen/spec-runner/issues/84)) ([55e407f](https://github.com/color4pen/spec-runner/commit/55e407fd34b2e3190d1fd1145f88a661d90bd8df))
* run verification against feature branch via temp worktree ([#74](https://github.com/color4pen/spec-runner/issues/74)) ([#79](https://github.com/color4pen/spec-runner/issues/79)) ([cd922f2](https://github.com/color4pen/spec-runner/commit/cd922f29efe3a6d5c9c9a52db72892b766356528))
* **runtime:** PR [#389](https://github.com/color4pen/spec-runner/issues/389)/[#390](https://github.com/color4pen/spec-runner/issues/390) rebase 後の semantic conflict を解消し managed の DRY も整理 ([#392](https://github.com/color4pen/spec-runner/issues/392)) ([69b10d7](https://github.com/color4pen/spec-runner/commit/69b10d7bf064e2b57d7a371ecb5490d5c0c0c1ac))
* workspace branch mount + propose role boundary ([#44](https://github.com/color4pen/spec-runner/issues/44)) ([c0d79ea](https://github.com/color4pen/spec-runner/commit/c0d79eafe9fd8a56b327674b69f920789cea3c2b))
* workspace chat scroll and hydration issues ([6c17092](https://github.com/color4pen/spec-runner/commit/6c17092cd858bd2d2e8f37e2df8b070f87f2e77d))
* 統合テストの step 名を propose → design に修正 ([53526c5](https://github.com/color4pen/spec-runner/commit/53526c59aa3c4bad835b79f3731b73f89082dbd8))


### Reverts

* undo naive hotfixes to executor.ts, propose.ts, review-verdict.ts ([364cc45](https://github.com/color4pen/spec-runner/commit/364cc45b568e1603e1343b3096f823bcca0204a6))
