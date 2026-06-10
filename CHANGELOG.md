# Changelog

## [0.2.0](https://github.com/color4pen/spec-runner/compare/specrunner-v0.1.9...specrunner-v0.2.0) (2026-06-10)


### Features

* code-fixer への approved 時 routing を fixableCount 申告ではなく findings から導出する ([#578](https://github.com/color4pen/spec-runner/issues/578)) ([737c5c7](https://github.com/color4pen/spec-runner/commit/737c5c7de14a64ccd092cc108be44a326f4ad9d3))
* detectPackageManager の lockfile 探索を上位ディレクトリに拡張する ([#573](https://github.com/color4pen/spec-runner/issues/573)) ([f77787e](https://github.com/color4pen/spec-runner/commit/f77787e9fb52d753a59f83c0592858dd66a4eafb))
* issue を起点に job を自動発火する one-shot コマンド（承認ラベル起動 + /resume 再開）を追加する ([#587](https://github.com/color4pen/spec-runner/issues/587)) ([57eed4b](https://github.com/color4pen/spec-runner/commit/57eed4bf179b54eae93e0175a5b98ebf049b80f0))
* job を GitHub issue に紐付け、escalation / 完走を issue コメントで通知する ([#585](https://github.com/color4pen/spec-runner/issues/585)) ([35c148c](https://github.com/color4pen/spec-runner/commit/35c148c66ee14e76a61952027ea06aeab6afe2db))
* judge 系 step の verdict を構造化 findings から CLI が導出する ([#576](https://github.com/color4pen/spec-runner/issues/576)) ([b07ae4b](https://github.com/color4pen/spec-runner/commit/b07ae4b2deff8b2daca7a4f5110ed166e6e48145))
* release は tag を打つ前に gate する（事後 rollback をやめる） ([#466](https://github.com/color4pen/spec-runner/issues/466)) ([6f355b3](https://github.com/color4pen/spec-runner/commit/6f355b36f5803abdcd72aadd431ed03379a99c56))
* request review をパイプラインステップ化する ([#575](https://github.com/color4pen/spec-runner/issues/575)) ([9bed17d](https://github.com/color4pen/spec-runner/commit/9bed17da9c0555947657d03b7cccf60f53c087c8))
* request の現状コード断定を design / request-review が実コードと突き合わせる ([#584](https://github.com/color4pen/spec-runner/issues/584)) ([a4f7251](https://github.com/color4pen/spec-runner/commit/a4f7251c2aa228d22eeb0ac5056070a341588a42))
* test-coverage のファイル拡張子フィルタを拡張する ([#572](https://github.com/color4pen/spec-runner/issues/572)) ([b15e410](https://github.com/color4pen/spec-runner/commit/b15e4107a4736510f30264d6ef82d8c331bcd5fc))
* テスト配置先の tests/ ハードコードを解消し implementer に配置を委ねる ([#569](https://github.com/color4pen/spec-runner/issues/569)) ([4ce0d28](https://github.com/color4pen/spec-runner/commit/4ce0d289b7e86a1461f983178eef67a1ee80df69))


### Bug Fixes

* --help フラグが positional 必須チェックより先に評価されるようにする ([#574](https://github.com/color4pen/spec-runner/issues/574)) ([4dd6420](https://github.com/color4pen/spec-runner/commit/4dd64200086a004926b4dd4dccd0b5a2608012e2))
* adapter の baseBranch fallback を request.md から読む形に修正する ([#571](https://github.com/color4pen/spec-runner/issues/571)) ([623626d](https://github.com/color4pen/spec-runner/commit/623626d75ad3163f73f3117230f83f2be0c2a213))
* codex adapter の outputSchema を OpenAI strict mode 互換に変換する ([#591](https://github.com/color4pen/spec-runner/issues/591)) ([921beb9](https://github.com/color4pen/spec-runner/commit/921beb9653b40bd9eeabeef6f9b2144f68ebca2c))
* judge prompt の decision-needed 定義を絞り、markdown テンプレートの verdict 規則を導出ルールと整合させる ([#586](https://github.com/color4pen/spec-runner/issues/586)) ([dd9fc8d](https://github.com/color4pen/spec-runner/commit/dd9fc8d0b74f24a17ff82261b4cfe150c7c515dc))
* request template と prompt から bun / tests/ のハードコードを除去する ([#570](https://github.com/color4pen/spec-runner/issues/570)) ([a1ebfea](https://github.com/color4pen/spec-runner/commit/a1ebfeadbae7f8c4df627cef81d6ff72ccbc675b))
* test-coverage がプロジェクトの慣習に従ったテスト配置を許可する ([#566](https://github.com/color4pen/spec-runner/issues/566)) ([8e94914](https://github.com/color4pen/spec-runner/commit/8e949146fc7a6950e8100f3e087cf292cb51bde9))
* verification result に実行マシンの絶対パスを残さない ([#590](https://github.com/color4pen/spec-runner/issues/590)) ([d3e4732](https://github.com/color4pen/spec-runner/commit/d3e473274ee5a16dc209df50c2416608c9776f80))


### Miscellaneous Chores

* release 0.2.0 ([a5a5e68](https://github.com/color4pen/spec-runner/commit/a5a5e68a7528cad1be72ac51bf74e9415a1f1f5b))

## [0.1.9](https://github.com/color4pen/spec-runner/compare/specrunner-v0.1.8...specrunner-v0.1.9) (2026-06-08)


### Features

* パッケージマネージャを自動検出して bun ハードコードを解消する ([#562](https://github.com/color4pen/spec-runner/issues/562)) ([077f4fa](https://github.com/color4pen/spec-runner/commit/077f4fac516ceabcd5b11dcdd863a64d4fcbc89d))
* 保護パスを変更する PR を無人マージ対象外にする ([#553](https://github.com/color4pen/spec-runner/issues/553)) ([3345665](https://github.com/color4pen/spec-runner/commit/3345665e077313baba8e6dc3753210f708d0deb2))


### Bug Fixes

* job finish の初回アーカイブで archive ディレクトリ不在により git mv が失敗する ([#551](https://github.com/color4pen/spec-runner/issues/551)) ([3642dd9](https://github.com/color4pen/spec-runner/commit/3642dd9281bf1d190954dabeaf974a8a62e63e44))
* managed-agent adapter の非 null アサーションを safe access に置き換える ([#560](https://github.com/color4pen/spec-runner/issues/560)) ([626501c](https://github.com/color4pen/spec-runner/commit/626501cad104a7a516b507e7a8507d13c7cbfb65))
* request review の parse 失敗時にエラー内容と raw output を保持する ([#564](https://github.com/color4pen/spec-runner/issues/564)) ([b3049c6](https://github.com/color4pen/spec-runner/commit/b3049c66f1ae0cbc2aea6fbd6bec09b20a99a48f))
* validateConfig で未検証のフィールドを検証する ([#558](https://github.com/color4pen/spec-runner/issues/558)) ([1e8a465](https://github.com/color4pen/spec-runner/commit/1e8a4654965456ff9eeae9f975a0ac39603ad291))

## [0.1.8](https://github.com/color4pen/spec-runner/compare/specrunner-v0.1.7...specrunner-v0.1.8) (2026-06-07)


### Features

* `--no-worktree` モードで worktree を作らずに run / resume を実行する ([#547](https://github.com/color4pen/spec-runner/issues/547)) ([bf13ad6](https://github.com/color4pen/spec-runner/commit/bf13ad65efa32b8e4081e587e3cd0d664d6955b2))
* `.specrunner/jobs/` への読み取り依存を slug/sidecar 起点に移行する ([#536](https://github.com/color4pen/spec-runner/issues/536)) ([c0eebc1](https://github.com/color4pen/spec-runner/commit/c0eebc1658dc203efccf8e31c8181ed6ba24e5e6))
* `.specrunner/jobs/` を完全撤去する ([#543](https://github.com/color4pen/spec-runner/issues/543)) ([8827b4e](https://github.com/color4pen/spec-runner/commit/8827b4ec629ad4dec1f668a9694b7466785604de))
* `specrunner request review` に `--model` フラグを追加する ([#546](https://github.com/color4pen/spec-runner/issues/546)) ([7d83730](https://github.com/color4pen/spec-runner/commit/7d8373009d6502d68d252eb2070a5c8eb69d4dd6))
* `specrunner usage` に step × model の内訳を表示する ([#542](https://github.com/color4pen/spec-runner/issues/542)) ([e0ee4e3](https://github.com/color4pen/spec-runner/commit/e0ee4e33ccab60dd2c710c5898ca85fb7f11c7af))
* job state を event journal / projection / liveness に分離し、slug ディレクトリで branch 同伴管理する ([#532](https://github.com/color4pen/spec-runner/issues/532)) ([1d5ab2b](https://github.com/color4pen/spec-runner/commit/1d5ab2b4ae7efb14662a65afa111738b16036847))
* job 終端処理を slug 正本に一本化する ([#535](https://github.com/color4pen/spec-runner/issues/535)) ([2dab4f7](https://github.com/color4pen/spec-runner/commit/2dab4f7985a607efe17d636c8f1860e9a0dd7180))
* JobState に pipeline 同一性（pipelineId）を記録する ([#524](https://github.com/color4pen/spec-runner/issues/524)) ([79ab04a](https://github.com/color4pen/spec-runner/commit/79ab04a70cf51384f217e285cf06b8b269325a52))
* local runtime の state 書き込みを slug/sidecar に一本化する ([#539](https://github.com/color4pen/spec-runner/issues/539)) ([3c376ee](https://github.com/color4pen/spec-runner/commit/3c376ee02a6491376cde523fbb4d8441cc0fc0fe))
* managed runtime の machine-local state を slug キーに移す ([#541](https://github.com/color4pen/spec-runner/issues/541)) ([c4145a7](https://github.com/color4pen/spec-runner/commit/c4145a74188bf479b33472efb4355047c528e708))
* pipeline 構成を PipelineDescriptor + registry に集約し、pipelineId で選択する ([#526](https://github.com/color4pen/spec-runner/issues/526)) ([a0c3d10](https://github.com/color4pen/spec-runner/commit/a0c3d10f5534e10da9b0b2b8fbd71397325d34cb))
* resume の再開位置解決を resumePoint の記録から素直に決定する ([#545](https://github.com/color4pen/spec-runner/issues/545)) ([a251097](https://github.com/color4pen/spec-runner/commit/a2510973adb4b2a2407ab3a0921ab27fedd3d4de))
* run / resume の終端結果を機械可読な --json 契約で出す ([#534](https://github.com/color4pen/spec-runner/issues/534)) ([3f6554a](https://github.com/color4pen/spec-runner/commit/3f6554a2302a15329c25d03859eb622515652356))
* 各 step が入出力を宣言し、実行前に入力の存在を検証する ([#528](https://github.com/color4pen/spec-runner/issues/528)) ([f34ce87](https://github.com/color4pen/spec-runner/commit/f34ce87ae878552ef8967cb067df5c262bee3570))
* 工程の役割と phase を記述子に一級化し、resume とエンジンの収束意味論をそこから導出する ([#527](https://github.com/color4pen/spec-runner/issues/527)) ([f98dbb1](https://github.com/color4pen/spec-runner/commit/f98dbb1979515a7a120c2685a0db6bdc6d438bbe))


### Bug Fixes

* `job ls` がプロセス死亡済みの job を `running` と表示する ([#537](https://github.com/color4pen/spec-runner/issues/537)) ([3da9d5a](https://github.com/color4pen/spec-runner/commit/3da9d5af1eea8b43f2b4271d293781a828d70047))
* archive 後に managed marker が残り幽霊 job が表示される ([#540](https://github.com/color4pen/spec-runner/issues/540)) ([94f525f](https://github.com/color4pen/spec-runner/commit/94f525f897154d94ba977dbc29a222c949b00824))
* request review が構造化 JSON の truncation で parse 失敗し、偽の needs-discussion を返す ([#530](https://github.com/color4pen/spec-runner/issues/530)) ([549dcab](https://github.com/color4pen/spec-runner/commit/549dcabf01052dcdd96c1b4431d2e674dca4f333))
* resume 時に liveness sidecar の pid が更新されない ([#538](https://github.com/color4pen/spec-runner/issues/538)) ([1e8bcd8](https://github.com/color4pen/spec-runner/commit/1e8bcd8c755bcca7fd754e74d99edd38054c1db1))
* signal 中断時の resumePoint に、起動 step でなく中断時の実行中 step を記録する ([#529](https://github.com/color4pen/spec-runner/issues/529)) ([a7f68da](https://github.com/color4pen/spec-runner/commit/a7f68dac87d752b79b3026146423a995404ae51a))
* ループの fixer retry budget が step 生涯で累積し、loop 外からの再入で fresh budget を持てず即 escalate する ([#531](https://github.com/color4pen/spec-runner/issues/531)) ([97488d4](https://github.com/color4pen/spec-runner/commit/97488d4d48b3c4c2ece775dbaef788852f6036aa))

## [0.1.7](https://github.com/color4pen/spec-runner/compare/specrunner-v0.1.6...specrunner-v0.1.7) (2026-06-03)


### Features

* `job archive --with-merge` の `none`（check 未出現）早期マージを grace 待しで塞ぐ ([#523](https://github.com/color4pen/spec-runner/issues/523)) ([45ab0c6](https://github.com/color4pen/spec-runner/commit/45ab0c655ddb2ceb0cebeb1191501179ff33dad4))
* `job archive --with-merge` を「check が解決するまで待つ」本物の wait ループにする ([#521](https://github.com/color4pen/spec-runner/issues/521)) ([0b43f65](https://github.com/color4pen/spec-runner/commit/0b43f6592332d9ecd982493637f147e1a8822a7c))
* finish はプロジェクトの merge gate を bypass せず尊重する ([#516](https://github.com/color4pen/spec-runner/issues/516)) ([2d35fa0](https://github.com/color4pen/spec-runner/commit/2d35fa0bf0f48549aff734cafa91f6d35be1ccff))
* finish を分解し、archive を client-closed な最終片づけコマンドにする ([#518](https://github.com/color4pen/spec-runner/issues/518)) ([4a8f5c8](https://github.com/color4pen/spec-runner/commit/4a8f5c8883f0e3b3326884226592285ac6212bd2))
* 実装が request を達成したかを確認する conformance review step を追加する ([#513](https://github.com/color4pen/spec-runner/issues/513)) ([21dbd5c](https://github.com/color4pen/spec-runner/commit/21dbd5c926abb1b3e7c80168252d473929728fd7))


### Bug Fixes

* **config:** model registry に claude-opus-4-8 を登録する ([#520](https://github.com/color4pen/spec-runner/issues/520)) ([afa402b](https://github.com/color4pen/spec-runner/commit/afa402bf82969251383ce2122c19cb53a9fa2c62))

## [0.1.6](https://github.com/color4pen/spec-runner/compare/specrunner-v0.1.5...specrunner-v0.1.6) (2026-06-03)


### Features

* **auth:** migrate GitHub device flow to GitHub App client ([6751ea9](https://github.com/color4pen/spec-runner/commit/6751ea9c319c1c7cffccc7a76bd0c29648959abf))
* baseline corpus を削除し、残存する読み手と guard を撤去する ([#511](https://github.com/color4pen/spec-runner/issues/511)) ([b3efd4b](https://github.com/color4pen/spec-runner/commit/b3efd4b16dcfde967f0a71871efae4983252c099))
* design は Layer-1（構造が決めない振る舞い）だけを spec に書く ([#506](https://github.com/color4pen/spec-runner/issues/506)) ([ce5073f](https://github.com/color4pen/spec-runner/commit/ce5073f14f4cbee54545c1c10b713b54227e7773))
* GitHub device flow を GitHub App 前提に整合する（spec / doctor / login） ([#500](https://github.com/color4pen/spec-runner/issues/500)) ([0c4223c](https://github.com/color4pen/spec-runner/commit/0c4223c716fef4a64bfd533e7f4a21ba77075f07))
* GitHub host を config 駆動にし port を host 非依存に保つ（+ host↔token 束縛 B-10） ([#502](https://github.com/color4pen/spec-runner/issues/502)) ([8a80684](https://github.com/color4pen/spec-runner/commit/8a80684dda56be48f8435d7763a2d46f4e1f977f))
* GitHub token 解決を gh CLI の env 契約に整合する ([#501](https://github.com/color4pen/spec-runner/issues/501)) ([b6d4a26](https://github.com/color4pen/spec-runner/commit/b6d4a26307219cfe62d2baabaec00b9ea4c8c202))
* scenario→test の「中身の歯」：must TC の test に実質的な assertion を要求する ([#507](https://github.com/color4pen/spec-runner/issues/507)) ([8183a4a](https://github.com/color4pen/spec-runner/commit/8183a4ac0121b0812877d56719ba37c5d6037aca))
* spec を自己完結 Layer-1 spec に再定義し、rule 検証を廃止する ([#510](https://github.com/color4pen/spec-runner/issues/510)) ([8416319](https://github.com/color4pen/spec-runner/commit/84163198da4e0b6af5530633d89b3f2593508c14))
* spec-merge を廃止し finish の pipeline→specs 閉ループを断つ ([#508](https://github.com/color4pen/spec-runner/issues/508)) ([0478c48](https://github.com/color4pen/spec-runner/commit/0478c48d779efb0c76a5eccca1c662d3f835ca48))
* test-case-gen を delta spec の Scenario 起点にし、scenario→test の橋を作る ([#504](https://github.com/color4pen/spec-runner/issues/504)) ([71a62fa](https://github.com/color4pen/spec-runner/commit/71a62faa8e9a8a81977e499fc8aa15711910bebc))
* test-cases.md を「scenario の写し」から「scenario 参照 + テスト戦略」へ（GWT 二重持ち解消） ([#505](https://github.com/color4pen/spec-runner/issues/505)) ([3f2e5db](https://github.com/color4pen/spec-runner/commit/3f2e5dbb5be65966603de82360aa2c27b0350c61))

## [0.1.5](https://github.com/color4pen/spec-runner/compare/specrunner-v0.1.4...specrunner-v0.1.5) (2026-06-01)


### Features

* closure の上向き edge（B-3/B-4）を ratchet で歯付けし R1/R3/R4 を凍結する ([#483](https://github.com/color4pen/spec-runner/issues/483)) ([fbdd23e](https://github.com/color4pen/spec-runner/commit/fbdd23e9a8808806501562e620e94162f085d202))
* job-state-store spec の JobStatus 状態機械をコード／構造 authority に同期する ([#480](https://github.com/color4pen/spec-runner/issues/480)) ([ea6d130](https://github.com/color4pen/spec-runner/commit/ea6d13023752dae6bb9f067403a6fcdac1f86946))
* アーキ構造不変条件（B-1〜B-8 + closure）を core 全体に ratchet 方式で歯付けする ([#482](https://github.com/color4pen/spec-runner/issues/482)) ([a40dbe8](https://github.com/color4pen/spec-runner/commit/a40dbe874e3641a81db69ab32f48ece39e6f1206))

## [0.1.4](https://github.com/color4pen/spec-runner/compare/specrunner-v0.1.3...specrunner-v0.1.4) (2026-05-29)


### Bug Fixes

* release-please に PAT を使わせ publish.yml を発火させる ([#476](https://github.com/color4pen/spec-runner/issues/476)) ([88e8ae0](https://github.com/color4pen/spec-runner/commit/88e8ae032e88269d160a92b990f9c2d27f0879a1))

## [0.1.3](https://github.com/color4pen/spec-runner/compare/specrunner-v0.1.2...specrunner-v0.1.3) (2026-05-29)


### Features

* codex adapter を typed outcome 対応に解除する（contract 準拠 / frozen 解除） ([#475](https://github.com/color4pen/spec-runner/issues/475)) ([ffb4e09](https://github.com/color4pen/spec-runner/commit/ffb4e09ddb8f8ef1b423278096f43b7114b84219))
* routing を typed outcome に cutover する（prose 依存を切る・agent escalation 廃止） ([#472](https://github.com/color4pen/spec-runner/issues/472)) ([d9abb9c](https://github.com/color4pen/spec-runner/commit/d9abb9c236afe383d0402b6e51d7ff7511879ae4))

## [0.1.2](https://github.com/color4pen/spec-runner/compare/specrunner-v0.1.1...specrunner-v0.1.2) (2026-05-28)


### Features

* agent step の完了 signal を report_result custom tool に倒す ([#461](https://github.com/color4pen/spec-runner/issues/461)) ([cb4dfe8](https://github.com/color4pen/spec-runner/commit/cb4dfe84d78b75c29410e715f7deba3f97dbeda9))

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
