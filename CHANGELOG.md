# Changelog

## [0.4.2](https://github.com/color4pen/spec-runner/compare/specrunner-v0.4.1...specrunner-v0.4.2) (2026-07-22)


### Features

* agent の git 状態変更とスコープ外書込を permission 層で遮断する ([#902](https://github.com/color4pen/spec-runner/issues/902)) ([cc454de](https://github.com/color4pen/spec-runner/commit/cc454de0f860729b54fd98e36881ab961d42382f))
* awaiting-archive job の正規 reopen — 指定 step 以降の承認を失効させて再検証する ([#887](https://github.com/color4pen/spec-runner/issues/887)) ([13ad418](https://github.com/color4pen/spec-runner/commit/13ad41862fd2028c1fb928e4c3941df25e2a1795))
* changed-line-coverage の not-loaded 判定を type-only ファイルで誤検出させない ([#897](https://github.com/color4pen/spec-runner/issues/897)) ([2361b0d](https://github.com/color4pen/spec-runner/commit/2361b0df07eeb4a04a5a3900ab263f4e6f41565f))
* CI の package smoke を初回接触契約の assert に拡張する — npm 配布物・任意 cwd・隔離 XDG で実運用条件を歩く ([#872](https://github.com/color4pen/spec-runner/issues/872)) ([d51c9bc](https://github.com/color4pen/spec-runner/commit/d51c9bc9098389b04b8e6f4b3f8d7378af8f704a))
* CLI の repo root 解決を entry に一本化する — cwd 暗黙仮定で subdirectory 起動が静かに誤動作する問題の構造解 ([#866](https://github.com/color4pen/spec-runner/issues/866)) ([18b5134](https://github.com/color4pen/spec-runner/commit/18b513455f54a5512cd506d22e90828bbfab53ca))
* custom reviewer の承認を canonical 入力 hash に束縛し、全 skip を非 green にする ([#892](https://github.com/color4pen/spec-runner/issues/892)) ([37d51c7](https://github.com/color4pen/spec-runner/commit/37d51c70d7ef303e01cc36edff1aba72b8f39195))
* init が実行結果を報告する — git repo 外の無言スキップと再実行時の無言成功を解消する ([#863](https://github.com/color4pen/spec-runner/issues/863)) ([ab18ab6](https://github.com/color4pen/spec-runner/commit/ab18ab6d1c00bfb0740924e440d1d7293d3ac578))
* job prune --force に削除直前の再検証を入れる — scan 後に active 化した sidecar の削除競合を塞ぐ ([#870](https://github.com/color4pen/spec-runner/issues/870)) ([f5e726f](https://github.com/color4pen/spec-runner/commit/f5e726fb6e5462c9b7a50ef819649d0bff19f3ea))
* job prune を orphan sidecar に拡張する — doctor の生 rm -rf hint を製品コマンド案内に置換する ([#865](https://github.com/color4pen/spec-runner/issues/865)) ([b8f8643](https://github.com/color4pen/spec-runner/commit/b8f8643bdd62c9e0c6d55b0e4f6b2e51f7a845b2))
* judge 完了契約に evidence counts を追加し、確認ゼロ・全 skip を非 green にする ([#882](https://github.com/color4pen/spec-runner/issues/882)) ([0ad0249](https://github.com/color4pen/spec-runner/commit/0ad0249596f7a6a96edc29666564f8d7e63d7b1b))
* judge 系 step の判定チャネルを typed findings に一本化し、result md を evidence report にする ([#879](https://github.com/color4pen/spec-runner/issues/879)) ([2b15e89](https://github.com/color4pen/spec-runner/commit/2b15e8920226c1326c61859938a794138038bc2c))
* local runtime の provider readiness を副作用より前に確立する — auth 欠如が worktree / branch / journal 作成後に発覚する経路を塞ぐ ([#874](https://github.com/color4pen/spec-runner/issues/874)) ([6a788a0](https://github.com/color4pen/spec-runner/commit/6a788a0a7e42550ff9d361fbf56c39e09740c24d))
* pipeline を唯一の committer にする — 検査モデルから合成モデルへ ([#893](https://github.com/color4pen/spec-runner/issues/893)) ([d8dc2d1](https://github.com/color4pen/spec-runner/commit/d8dc2d164be63feff3ff5d2e7bb3748b50bb20e4))
* repo root 解決を 1 invocation につき 1 回にする — handler 内再解決の除去と CWD 不変の識別子一意化 ([#873](https://github.com/color4pen/spec-runner/issues/873)) ([3bf4681](https://github.com/color4pen/spec-runner/commit/3bf4681806ca6ba1ea17e53005fd166580db21a1))
* request-review の完了契約に evidence counts を追加し、確認ゼロの approve を非 green にする ([#889](https://github.com/color4pen/spec-runner/issues/889)) ([b272288](https://github.com/color4pen/spec-runner/commit/b2722885f2641ce9450adf6920fbbfa5fab3bbcf))
* sequential step の commit を write-set 境界で機械強制する ([#883](https://github.com/color4pen/spec-runner/issues/883)) ([e561c0e](https://github.com/color4pen/spec-runner/commit/e561c0e5ecf6a44199cdd2f1351aaf5582b45453))
* write-set 検査を開始 HEAD・index・agent commit まで拡張し、既知の 3 突破経路を閉じる ([#891](https://github.com/color4pen/spec-runner/issues/891)) ([1591a8f](https://github.com/color4pen/spec-runner/commit/1591a8fed458d46488aa79135d68f8e39c8ad161))
* エラー処方の整合 — 誤診 hint の修正・廃止コマンド処方の除去・状態駆動 next steps・doctor の XDG 認識 ([#871](https://github.com/color4pen/spec-runner/issues/871)) ([2c2cdef](https://github.com/color4pen/spec-runner/commit/2c2cdeff3a07aec51792daae2a67cb716da07a20))
* 保護正典への fixable finding を、書けない fixer に routing せず escalation に倒す ([#901](https://github.com/color4pen/spec-runner/issues/901)) ([dd26c54](https://github.com/color4pen/spec-runner/commit/dd26c54982f776ac0dcea550e2bd9b9aa23c5917))
* 全 step prompt を 5 部構成の共通骨格に再構成し、evidence 規律と原因分類を共通化する ([#880](https://github.com/color4pen/spec-runner/issues/880)) ([cb0fd58](https://github.com/color4pen/spec-runner/commit/cb0fd58aa879a5693d616b75974caf65fa9ee59d))
* 記録済み承認を revision に束縛し、stale 承認による reviewer 群 skip を封鎖する ([#885](https://github.com/color4pen/spec-runner/issues/885)) ([c23df19](https://github.com/color4pen/spec-runner/commit/c23df190c8c4e6247f09ec5e917aa8c6c2cbd88b))


### Bug Fixes

* bootstrap の materialization commit を egress 台帳に記録し、初回 push の誤 halt を解消する ([#895](https://github.com/color4pen/spec-runner/issues/895)) ([1938fe1](https://github.com/color4pen/spec-runner/commit/1938fe17c9a03b1ad66c12af5ff35d03faee81f9))
* custom reviewer round の運用欠落 2 件を修正する — pr-create-result の管理パス化と activationPaths の欠落補完 ([#900](https://github.com/color4pen/spec-runner/issues/900)) ([a8b1297](https://github.com/color4pen/spec-runner/commit/a8b12977a0539e3c71d39fc8b0d077ba564a6525))
* lineage event の outputs を実生成ファイルに対応付け、hash を実計算する ([#881](https://github.com/color4pen/spec-runner/issues/881)) ([c743f95](https://github.com/color4pen/spec-runner/commit/c743f9589889e1e78fb4adbb3c82a38b3b24879f))
* TC Source 形式の producer/consumer drift を単一ソース化で修正する ([#878](https://github.com/color4pen/spec-runner/issues/878)) ([b260941](https://github.com/color4pen/spec-runner/commit/b2609411c4f4903ce58fd0f9f5bba0a7ffdf1c0f))

## [0.4.1](https://github.com/color4pen/spec-runner/compare/specrunner-v0.4.0...specrunner-v0.4.1) (2026-07-19)


### Features

* achieved-assurance の達成判定を完成させる — HEAD-green 実測 / scenario 二層凍結 / type↔strategy / spec-review approved（P0 fix-forward） ([#850](https://github.com/color4pen/spec-runner/issues/850)) ([ecca9a7](https://github.com/color4pen/spec-runner/commit/ecca9a752b873119ea7ece0278fd7bc73e06c9f9))
* added-turn 削減の仕上げ — 追加ターン metrics の journal 永続化と code-review post-work turn の除去 ([#827](https://github.com/color4pen/spec-runner/issues/827)) ([b681d42](https://github.com/color4pen/spec-runner/commit/b681d4259c60745052d9eaa61c0dcf942a52eabe))
* approvedAtCommit を「レビュー対象 source revision」として contract test で固定し、round invalidation から pipeline 管理 path を除外する ([#829](https://github.com/color4pen/spec-runner/issues/829)) ([9e56c1f](https://github.com/color4pen/spec-runner/commit/9e56c1f841b9b6a82b2a3999643f09a54301ddc5))
* assurance profile を branch-borne immutable 属性として JobState に載せ、attach で digest 検証する（R1 背骨） ([#843](https://github.com/color4pen/spec-runner/issues/843)) ([3a4c59e](https://github.com/color4pen/spec-runner/commit/3a4c59e5abc0ac617b80d47d8e37af9db0ac52a3))
* assurance を構造化し、archive 時に minimumAssurance floor を out-of-loop で強制する（R2 spine） ([#846](https://github.com/color4pen/spec-runner/issues/846)) ([b3dd52b](https://github.com/color4pen/spec-runner/commit/b3dd52bcd7e906537d0d65fbb932b89071a161b4))
* awaiting-resume guard-halt を制御出口にし、attach 硬化を完了する（closure follow-up） ([#838](https://github.com/color4pen/spec-runner/issues/838)) ([33c9aea](https://github.com/color4pen/spec-runner/commit/33c9aeaab7e3afdf517494c7558978048f088700))
* base/candidate OID を捕捉し、forward strategy の BiteEvidence を機械生成する（R4, MVP） ([#845](https://github.com/color4pen/spec-runner/issues/845)) ([6283bb1](https://github.com/color4pen/spec-runner/commit/6283bb1e4c83ec58e1eb0575a6a9c9f629cf8142))
* bite executor — 隔離 worktree で materialize 済み test を repo の runner で実行可能にする（Phase 2） ([#849](https://github.com/color4pen/spec-runner/issues/849)) ([e917802](https://github.com/color4pen/spec-runner/commit/e917802c7f83bdab79ba9fe87939672c34b018c6))
* changed-files 導出失敗を fail-closed 化する（`listChangedFiles` を DU 化し「導出失敗」と「変更なし」を分離） ([#833](https://github.com/color4pen/spec-runner/issues/833)) ([85a797d](https://github.com/color4pen/spec-runner/commit/85a797d9bd2bb471f7a4d5c54767067d7fcc01b6))
* code-review の post-work self-check が捕捉されない report_result 修正を指示する不整合を解消する ([#821](https://github.com/color4pen/spec-runner/issues/821)) ([084ca14](https://github.com/color4pen/spec-runner/commit/084ca148ff8a0845ff26adb8b19381fd7242d0f2))
* fact-check attestation を source revision にも束縛し、request.md 不変でも source 変化で stale にする ([#826](https://github.com/color4pen/spec-runner/issues/826)) ([884033f](https://github.com/color4pen/spec-runner/commit/884033fc9093be921ad2630baa484e64682895e5))
* git 書き込み副作用の失敗を typed halt 化する（`commitAndPush` / `commitScopedPaths` の silent fail-open を StepHalt へ） ([#834](https://github.com/color4pen/spec-runner/issues/834)) ([d19a6f5](https://github.com/color4pen/spec-runner/commit/d19a6f5610ee2e0cb77d7ea8e4aad46b4393cbf6))
* minimumAssurance floor を「宣言」でなく「最終 HEAD で達成された provenance」で判定する（P0 fix-forward） ([#848](https://github.com/color4pen/spec-runner/issues/848)) ([fe72548](https://github.com/color4pen/spec-runner/commit/fe725487a8654ccbf3b2b76a55dce719c9495632))
* post-work の決定論的 self-check を無条件実行から outputContract（detect→repair）へ移す ([#824](https://github.com/color4pen/spec-runner/issues/824)) ([90179c5](https://github.com/color4pen/spec-runner/commit/90179c5324769351cb4d0a0980c20fa6aca38e0c))
* remote branch から quiescent job を attach する（`job attach --branch`） ([#836](https://github.com/color4pen/spec-runner/issues/836)) ([b33f666](https://github.com/color4pen/spec-runner/commit/b33f6667736b2c25903101753fc7c912fb610ac5))
* remote checkpoint publish/attach correctness closure ([#837](https://github.com/color4pen/spec-runner/issues/837)) ([8b8785f](https://github.com/color4pen/spec-runner/commit/8b8785f40ed78245dd2bb8140fe4e0475b6fdf1d))
* request-review の code 断定 fact-check を attestation として記録し design の再検証重複をなくす ([#822](https://github.com/color4pen/spec-runner/issues/822)) ([06749f1](https://github.com/color4pen/spec-runner/commit/06749f1f1dd48bcc405ab3794b6f733c6854d5ca))
* reviewer の approved を fixer 予算切れで覆さない — 任意修正の省略を明示して次工程へ進む ([#854](https://github.com/color4pen/spec-runner/issues/854)) ([33e9288](https://github.com/color4pen/spec-runner/commit/33e9288997dd02e6c53aea509be3733ac769f54f))
* scenario / spec の凍結・承認を revision（commit OID）に束縛する — 同一 commit 自己整合を廃す（P0 fix-forward） ([#851](https://github.com/color4pen/spec-runner/issues/851)) ([15dd2ed](https://github.com/color4pen/spec-runner/commit/15dd2ed9febc2942a2728bad93bb059d12d57a9e))
* scenario freeze と test-materialize→implement の commit 境界を作る（R3, Option A 二ノード分割） ([#844](https://github.com/color4pen/spec-runner/issues/844)) ([b2d824b](https://github.com/color4pen/spec-runner/commit/b2d824b70c17030183b2120317163ed07d4bc7ab))
* 並列 round の worktree 検査を fail-closed 化する（検査不能を clean と区別し escalation） ([#814](https://github.com/color4pen/spec-runner/issues/814)) ([33bbcac](https://github.com/color4pen/spec-runner/commit/33bbcac350e0a5c86da49315d3234a689a902415))
* 主役 E2E の Machine B を実 `job resume` 経路（ResumeCommand + buildPipelineForJob）で通す ([#839](https://github.com/color4pen/spec-runner/issues/839)) ([a4a27ec](https://github.com/color4pen/spec-runner/commit/a4a27ec70900ec5b84eceef6edd60d5a21467667))
* 追加 AI ターンの構造的削減 — 完了契約の初回注入 / 決定論 skip / ターン種別 metrics ([#823](https://github.com/color4pen/spec-runner/issues/823)) ([83acc2c](https://github.com/color4pen/spec-runner/commit/83acc2c48ce83b33eb89aa1f220ee9cf89d8ce9b))

## [0.4.0](https://github.com/color4pen/spec-runner/compare/specrunner-v0.3.8...specrunner-v0.4.0) (2026-07-14)


### Features

* archive --with-merge の merge 失敗後に job が復旧不能になる問題を修正 ([#792](https://github.com/color4pen/spec-runner/issues/792)) ([b05339d](https://github.com/color4pen/spec-runner/commit/b05339d510230276c61c64b638aada6479aa9dd3))
* build-fixer の config 編集が同一 job 内 verification に反映されず coverage self-heal できない問題を修正 ([#791](https://github.com/color4pen/spec-runner/issues/791)) ([2dce15c](https://github.com/color4pen/spec-runner/commit/2dce15c3eb98958eb52358ca751c83e781f3a101))
* one-shot SDK query の env を stripSecrets 経由に統一し、B-6 の歯を env-omission まで強める ([#780](https://github.com/color4pen/spec-runner/issues/780)) ([9370031](https://github.com/color4pen/spec-runner/commit/9370031022c638c97a13faea6b1ca90b2c41ca43))
* PR ごとの attestation をコメント添付する ([#789](https://github.com/color4pen/spec-runner/issues/789)) ([c51a0a3](https://github.com/color4pen/spec-runner/commit/c51a0a308db3daa52751bb5077410bea2cab7644))
* 不変条件カタログ（doc）と歯（test / allowlist）の B-x ID 集合が一致することを test で固定する ([#777](https://github.com/color4pen/spec-runner/issues/777)) ([8a5d98f](https://github.com/color4pen/spec-runner/commit/8a5d98fd054193198361abd247645fd1e14d2dbe))
* 並列 round の git 副作用を coordinator が round 単位で所有する（scoped staging・非宣言変更 halt） ([#800](https://github.com/color4pen/spec-runner/issues/800)) ([f2d9489](https://github.com/color4pen/spec-runner/commit/f2d948986960ec7b1e1a644dff778acede08ab3c))
* 並列 round の state commit を coordinator が round 単位で所有する（member no-persist） ([#801](https://github.com/color4pen/spec-runner/issues/801)) ([cc3472f](https://github.com/color4pen/spec-runner/commit/cc3472fcabe82aca248b63f6a62bc8798bd2942b))
* 並列 round の入力を immutable にする（共有 deps 不変・resume 配布） ([#799](https://github.com/color4pen/spec-runner/issues/799)) ([7e09e7a](https://github.com/color4pen/spec-runner/commit/7e09e7a5959d9a9b3cff42379b14c1d63b1ba7e8))
* 実行中の local job で OS のアイドルスリープを抑止する（self-caffeinate、[#758](https://github.com/color4pen/spec-runner/issues/758)） ([#781](https://github.com/color4pen/spec-runner/issues/781)) ([4f185f0](https://github.com/color4pen/spec-runner/commit/4f185f0d1dc04ba76080e763ca05b1ee2e4feb4b))
* 逐次経路の single-writer: StepExecutor は実行結果を返し CommitOrchestrator が唯一の commit 者になる ([#798](https://github.com/color4pen/spec-runner/issues/798)) ([94b7236](https://github.com/color4pen/spec-runner/commit/94b72364e288fd405adf78801adb8f682f05349b))


### Bug Fixes

* archive --with-merge の merge-wait が transient BLOCKED で誤 escalation するのを修正 ([#790](https://github.com/color4pen/spec-runner/issues/790)) ([b1c881f](https://github.com/color4pen/spec-runner/commit/b1c881f65b28c108daa3241e28ca487672a2e0d0))
* job stats のコスト集計で usage.json を slug でなく行の jobId / change-dir から解決し、同一 base-slug の誤配を解消する ([#778](https://github.com/color4pen/spec-runner/issues/778)) ([707ec26](https://github.com/color4pen/spec-runner/commit/707ec26ac983e56b079ee550bcf400845f54f95e))


### Miscellaneous Chores

* 次リリースを 0.4.0 として切る ([#805](https://github.com/color4pen/spec-runner/issues/805)) ([80db1fb](https://github.com/color4pen/spec-runner/commit/80db1fb5fa9ade57227e6b7147b32c1ba69779e9))

## [0.3.8](https://github.com/color4pen/spec-runner/compare/specrunner-v0.3.7...specrunner-v0.3.8) (2026-07-10)


### Features

* archive --with-merge が merge 直後に main の整合性検証を実行する ([#752](https://github.com/color4pen/spec-runner/issues/752)) ([fdf6342](https://github.com/color4pen/spec-runner/commit/fdf6342831623575ecbee66013b7b94fa2d7cc6f))
* authority 文書と実装の drift 3 件を修正し、同期テストを意味的照合に拡張する ([#767](https://github.com/color4pen/spec-runner/issues/767)) ([b70cfde](https://github.com/color4pen/spec-runner/commit/b70cfde7321539a5ed26f22d0a24cd8f8598d74e))
* claude-code adapter の Edit / Write ツールに workspace 書き込みスコープを追加する ([#766](https://github.com/color4pen/spec-runner/issues/766)) ([c2afcf5](https://github.com/color4pen/spec-runner/commit/c2afcf55ff288c823552892f121c06a5a46fd58b))
* claude-code adapter の workspace write guard を実測済み構成で再実装する（[#766](https://github.com/color4pen/spec-runner/issues/766) redo） ([#773](https://github.com/color4pen/spec-runner/issues/773)) ([332dc68](https://github.com/color4pen/spec-runner/commit/332dc6800ca174b4a7b883bda50c9fdfb4d3cf13))
* claude-code adapter の書き込みを workspace に SDK native sandbox でスコープする ([#761](https://github.com/color4pen/spec-runner/issues/761)) ([5188200](https://github.com/color4pen/spec-runner/commit/51882001030564eaf382c7d127999c38a21ba0e0))
* event journal の中間破損を fail-closed にする — fold の corruption 検出と counter 逆行検査 ([#770](https://github.com/color4pen/spec-runner/issues/770)) ([ad67c12](https://github.com/color4pen/spec-runner/commit/ad67c12fabedf1ca09be8ef1474ed511c3237701))
* fast pipeline の forbidden surfaces を repo config に外出しする ([#746](https://github.com/color4pen/spec-runner/issues/746)) ([58e2491](https://github.com/color4pen/spec-runner/commit/58e2491a2c7e76113eebddbf1cf64a3eca28d0a7))
* fast pipeline のガード構成データを自己保護する ([#756](https://github.com/color4pen/spec-runner/issues/756)) ([e0a839b](https://github.com/color4pen/spec-runner/commit/e0a839b4f1e8f03c8f3c76b8edae637086fc4c11))
* job ls を運用一覧にする — 区分表示・escalation の可視化・次アクションの提示 ([#745](https://github.com/color4pen/spec-runner/issues/745)) ([49a02be](https://github.com/color4pen/spec-runner/commit/49a02bed3f565755f066d8c493fc56d5a66f1819))
* permissionScope 宣言 pipeline で forbidden surfaces が未設定のとき job start に warning を出す ([#771](https://github.com/color4pen/spec-runner/issues/771)) ([2fbbdae](https://github.com/color4pen/spec-runner/commit/2fbbdaeb2d5a9d1c3a78d5f4e3ed9040cbf717ee))
* run 単位の統計（コスト・収束回数・所要時間）を集計する job stats コマンド ([#744](https://github.com/color4pen/spec-runner/issues/744)) ([1d1589e](https://github.com/color4pen/spec-runner/commit/1d1589efb92fcda0ab94a54f4af82566be48fdf0))
* test-case-gen に繰り返し実行・冪等性の導出軸を追加する ([#750](https://github.com/color4pen/spec-runner/issues/750)) ([9ff21f3](https://github.com/color4pen/spec-runner/commit/9ff21f3bd0aff465bd11b0a59e8281ce82781521))
* verification の test-coverage を TC-ID 存在照合から変更行の実行検証（lcov）に強化する ([#751](https://github.com/color4pen/spec-runner/issues/751)) ([f33e2eb](https://github.com/color4pen/spec-runner/commit/f33e2eb1f45d4150aff1afd0bee98d432a074a59))
* worktree job による main checkout への逃避書き込みを検出する ([#760](https://github.com/color4pen/spec-runner/issues/760)) ([71fd1a0](https://github.com/color4pen/spec-runner/commit/71fd1a0320dd56650e89f3858aac35a70e1d2692))
* 自 repo の verification に changed-line coverage gate を宣言する ([#754](https://github.com/color4pen/spec-runner/issues/754)) ([7573a72](https://github.com/color4pen/spec-runner/commit/7573a728a7f584d12f4836c7c4a0da4785922ac8))
* 設計層 topic 排出 — archive 時に design-level findings を design/topics/ へ機械排出する ([#763](https://github.com/color4pen/spec-runner/issues/763)) ([12a58b8](https://github.com/color4pen/spec-runner/commit/12a58b802a249fc9a3680dbccc5ed9489d6b9d0e))


### Bug Fixes

* custom reviewer member step からの resume を coordinator 経由に修正し、シグナル停止時の interruption 二重記録を解消する ([#772](https://github.com/color4pen/spec-runner/issues/772)) ([e5cb332](https://github.com/color4pen/spec-runner/commit/e5cb332546dcad414588782c4b74cba2f793de40))
* doctor が project-local 設定を読まず designLayer / runtime チェックを誤診断する ([#747](https://github.com/color4pen/spec-runner/issues/747)) ([1f4399c](https://github.com/color4pen/spec-runner/commit/1f4399c1cc0806010ae5cc0cf7144bb5c2f90c3f))
* job ls / job stats の表示・集計を事実に一致させる ([#755](https://github.com/color4pen/spec-runner/issues/755)) ([d8ff80e](https://github.com/color4pen/spec-runner/commit/d8ff80e7fb88c4bd6827727665f479664f40cf6d))
* pipeline 運用の小粒不具合 3 件の一括修正（fixer prompt / exit-guard / worktree cwd の view コマンド） ([#759](https://github.com/color4pen/spec-runner/issues/759)) ([eaf44f1](https://github.com/color4pen/spec-runner/commit/eaf44f10f0dbfafa9d61dc1d212667495f48067f))
* 事後監査で検出した小粒不具合の一括修正 ([#757](https://github.com/color4pen/spec-runner/issues/757)) ([a9bd170](https://github.com/color4pen/spec-runner/commit/a9bd1701a7de0b8a204a31d41683d59a1aaee7ad))


### Reverts

* [#766](https://github.com/color4pen/spec-runner/issues/766) file-tool-write-scope — dontAsk が headless runner で report_result を deny し pipeline を停止させる ([#768](https://github.com/color4pen/spec-runner/issues/768)) ([dd61763](https://github.com/color4pen/spec-runner/commit/dd617630ee38b683807a1e573edc1afb281dc457))

## [0.3.7](https://github.com/color4pen/spec-runner/compare/specrunner-v0.3.6...specrunner-v0.3.7) (2026-07-04)


### Features

* code-review が approved のとき code-fixer の no-op を escalate しない ([#738](https://github.com/color4pen/spec-runner/issues/738)) ([e49e0e6](https://github.com/color4pen/spec-runner/commit/e49e0e6291f50fd560d9fd0af409e2a86c30facd))
* designLayer 有効時に未 push の設計コミットを run 前に警告する ([#743](https://github.com/color4pen/spec-runner/issues/743)) ([b50c31b](https://github.com/color4pen/spec-runner/commit/b50c31bfe04208d135f03f628f21ba7d012ac09f))
* package.json scripts integrity — 新規 script の追加を tampering としない ([#741](https://github.com/color4pen/spec-runner/issues/741)) ([08878cb](https://github.com/color4pen/spec-runner/commit/08878cb17245532068c5f7bb5220ab0b9656c26d))
* verification が silent-skip されたテストを surface する ([#742](https://github.com/color4pen/spec-runner/issues/742)) ([ec69882](https://github.com/color4pen/spec-runner/commit/ec69882b8ff86355210121da87f5502c29bc5e88))
* workspace セットアップを config 化して言語非依存にする ([#736](https://github.com/color4pen/spec-runner/issues/736)) ([8e38894](https://github.com/color4pen/spec-runner/commit/8e38894b23c980e4b9cabc02db9b1f1a9a788b0a))
* 同一 slug の live job があるとき2回目の run を拒否する ([#740](https://github.com/color4pen/spec-runner/issues/740)) ([37743be](https://github.com/color4pen/spec-runner/commit/37743becec8cda6eef8eb311597f605d33cce4a0))

## [0.3.6](https://github.com/color4pen/spec-runner/compare/specrunner-v0.3.5...specrunner-v0.3.6) (2026-07-03)


### Features

* chore（spec 対象外の変更）が design step を通過できるようにする — spec.md output contract を型の spec 免除に整合させる ([#733](https://github.com/color4pen/spec-runner/issues/733)) ([7ccb8fc](https://github.com/color4pen/spec-runner/commit/7ccb8fca2a07d8132bf59412cdb6e769892ce466))
* 設計レイヤ CLI（aozu）の受け口を結線する — request 引用の入口ゲートと取り込み完了の出口 hook ([#730](https://github.com/color4pen/spec-runner/issues/730)) ([6290647](https://github.com/color4pen/spec-runner/commit/62906475059d9038a9eb29be14526b8ea3488f5b))


### Bug Fixes

* archive --with-merge の後片づけで worktree が削除されない（local 実行で worktreePath が常に null） ([#732](https://github.com/color4pen/spec-runner/issues/732)) ([a0a9108](https://github.com/color4pen/spec-runner/commit/a0a91081c2a9de600b36aab590e661c7ce4e60c4))
* パイプラインの verdict 忠実性を直す（表示/導出と記録の食い違い・code-fixer の no-op 空振り） ([#734](https://github.com/color4pen/spec-runner/issues/734)) ([c19c945](https://github.com/color4pen/spec-runner/commit/c19c945e307ad15b1a95e410733bb6c0b4d7d802))

## [0.3.5](https://github.com/color4pen/spec-runner/compare/specrunner-v0.3.4...specrunner-v0.3.5) (2026-06-29)


### Features

* archive→merge ゲートを堅牢化する（merge API 委譲＋transient BLOCKED の待機） ([#727](https://github.com/color4pen/spec-runner/issues/727)) ([acff650](https://github.com/color4pen/spec-runner/commit/acff650da493d3780b534576cceeebeddc226f11))
* orphan worktree（state 無し）の検出と掃除をツールで可能にする ([#728](https://github.com/color4pen/spec-runner/issues/728)) ([f433d0e](https://github.com/color4pen/spec-runner/commit/f433d0ecf0b44ba616c6b7560b34b78efda3c0ab))


### Bug Fixes

* archived だが未マージの job を resume 可能にする ([#726](https://github.com/color4pen/spec-runner/issues/726)) ([160a1c6](https://github.com/color4pen/spec-runner/commit/160a1c6518a4fd3def6dd49cc7649bbd0ff8cf8c))
* zod を dist にバンドルして実行時の外部解決依存を断つ ([#724](https://github.com/color4pen/spec-runner/issues/724)) ([e5a5ea7](https://github.com/color4pen/spec-runner/commit/e5a5ea73b2026adadf99e64649df7ed9fd275055))

## [0.3.4](https://github.com/color4pen/spec-runner/compare/specrunner-v0.3.3...specrunner-v0.3.4) (2026-06-28)


### Features

* archive をブランチ上で先に実行し、base への直接影響を merge のみに限定する ([#723](https://github.com/color4pen/spec-runner/issues/723)) ([15a7580](https://github.com/color4pen/spec-runner/commit/15a758043c97099bf238b6460a0b6b6b91a9fe64))
* cancel 時にジョブを canceled/&lt;slug&gt;-<jobId8>/ へ退避し、キャンセル記録・request の消失を解消する ([#722](https://github.com/color4pen/spec-runner/issues/722)) ([fd8b6a9](https://github.com/color4pen/spec-runner/commit/fd8b6a9fa0e5ef48401d7bc36891e43825f0eff5))
* init で provider を選択し、provider に応じたデフォルトモデルを scaffold に書く + model registry 更新 ([#712](https://github.com/color4pen/spec-runner/issues/712)) ([410d526](https://github.com/color4pen/spec-runner/commit/410d526246754d0739f25a54e927c313197084a5))
* reviewer 活性化ゲートの「変更ファイル導出不能時の無言 skip」を fail-closed に揃える ([#720](https://github.com/color4pen/spec-runner/issues/720)) ([fb7c13e](https://github.com/color4pen/spec-runner/commit/fb7c13edfe0f7fbd87f1b113bd3343a6026d5432))
* カスタムレビュワーの並列実行 + per-reviewer status tracking + invalidation ([#710](https://github.com/color4pen/spec-runner/issues/710)) ([19672c2](https://github.com/color4pen/spec-runner/commit/19672c2988e1b61ee23f13cbb027563aaffec998))
* 全 subprocess spawn を stripSecrets seam に集約し、env 省略による credential 継承を構造的に塞ぐ ([#717](https://github.com/color4pen/spec-runner/issues/717)) ([cf00809](https://github.com/color4pen/spec-runner/commit/cf00809c994089d8f4b76b8a9676f7443480c6c5))


### Bug Fixes

* config 書き込み経路がグローバル config を不必要に書き換える + stale strip が GHES host 設定を消す ([#704](https://github.com/color4pen/spec-runner/issues/704)) ([640b634](https://github.com/color4pen/spec-runner/commit/640b63439a1625bf675a22b059dc1da612cace40))
* GitHub adapter の merge/finish ゲートの fail-open を塞ぐ（非冪等リトライ・チェック取りこぼし・Retry-After） ([#718](https://github.com/color4pen/spec-runner/issues/718)) ([c59c7e9](https://github.com/color4pen/spec-runner/commit/c59c7e9719b666938b3d48badb4e8ba160d3d454))
* hard-crash 後の resume を進捗(state.step)から再構築し、「再開位置が不明」での詰まりを解消する ([#716](https://github.com/color4pen/spec-runner/issues/716)) ([ae756a9](https://github.com/color4pen/spec-runner/commit/ae756a90083269a79efe9dea3cd7e2867370afde))
* judge の findings/scores パース健全性を回復し、verdict 導出の取りこぼし・誤りをなくす ([#713](https://github.com/color4pen/spec-runner/issues/713)) ([6736957](https://github.com/color4pen/spec-runner/commit/6736957525875a097cfc5b19ac4865bd19aadbc8))
* resume の再開 step 検証を実 descriptor 由来にし、reviewer 段の hard-crash 回復不能を解消する ([#719](https://github.com/color4pen/spec-runner/issues/719)) ([f391560](https://github.com/color4pen/spec-runner/commit/f3915601d66dfc59a782fad7da47937a408429c6))
* subprocess / SDK spawn と log から credential を漏らさない（B-6 / B-7 封じ込めの実適用） ([#714](https://github.com/color4pen/spec-runner/issues/714)) ([65c2d7c](https://github.com/color4pen/spec-runner/commit/65c2d7c3ec3f3fe65e2002569dbb3a03b5a5da53))

## [0.3.3](https://github.com/color4pen/spec-runner/compare/specrunner-v0.3.2...specrunner-v0.3.3) (2026-06-15)


### Features

* pipeline profile に権限スコープを宣言し、スコープ超過を diff から導出して既存 escalation に載せる土台を入れる ([#689](https://github.com/color4pen/spec-runner/issues/689)) ([ce4267d](https://github.com/color4pen/spec-runner/commit/ce4267d21a657cb9976903d79f41a7297d216198))
* pipeline を request.md で選択可能にし、scope を強制できない runtime を着手前に拒否する汎用 gate を入れる ([#695](https://github.com/color4pen/spec-runner/issues/695)) ([8da84fe](https://github.com/color4pen/spec-runner/commit/8da84fe143a51b8b4a935c47a20e58db9b677667))
* reviewer phase を持たない pipeline では reviewer を job state に snapshot しない — INV-8 の cleanup（fast pipeline 初回 dogfood） ([#701](https://github.com/color4pen/spec-runner/issues/701)) ([6058191](https://github.com/color4pen/spec-runner/commit/6058191800d38abb3ca07d06e3cbbd19a15f8b46))
* scope を評価できない runtime では breach を黙って通さず escalation する（fail-closed）— RuntimeStrategy に評価可能性 predicate を追加 ([#692](https://github.com/color4pen/spec-runner/issues/692)) ([4f2b8a9](https://github.com/color4pen/spec-runner/commit/4f2b8a9639571a741ca57a00de4ccec562165031))
* test-cases.md を code-review の soft input にし producer に出力保証を移す ＋ descriptor を起動前 validator で検算する（fast STEP_INPUT_MISSING 修正） ([#700](https://github.com/color4pen/spec-runner/issues/700)) ([45160c7](https://github.com/color4pen/spec-runner/commit/45160c764b82f0d112e6cf085f9347a30cde78ae))
* 軽量 fast pipeline profile を追加する — permissionScope を宣言する最初の利用者 ([#696](https://github.com/color4pen/spec-runner/issues/696)) ([7ce64e2](https://github.com/color4pen/spec-runner/commit/7ce64e2aa22213a6cdac6eb867fe042609887086))

## [0.3.2](https://github.com/color4pen/spec-runner/compare/specrunner-v0.3.1...specrunner-v0.3.2) (2026-06-13)


### Features

* agent prompt の完了契約文言（report_result / end_turn）を provider 非依存にする ([#668](https://github.com/color4pen/spec-runner/issues/668)) ([6539e7d](https://github.com/color4pen/spec-runner/commit/6539e7ddf5edf671d82f84ed7bb4f26e27a2d510))
* claude の認証 token を specrunner login で管理し、cron 等 headless 環境で crontab に secrets を書かずに動くようにする ([#683](https://github.com/color4pen/spec-runner/issues/683)) ([23b7156](https://github.com/color4pen/spec-runner/commit/23b7156bc66fbf0c1eeb5e6aad76b7cacd082c0a))
* codex adapter に claude-code adapter と同等の運用機能（retry / 観測性 / 出力検証）を実装する ([#666](https://github.com/color4pen/spec-runner/issues/666)) ([0d0b058](https://github.com/color4pen/spec-runner/commit/0d0b058deb35a2a3f610ba608744e2ee1e8f2f06))
* codex adapter: main turn に完了報告の明示指示を注入し、回収失敗の診断を構造化記録に残す ([#679](https://github.com/color4pen/spec-runner/issues/679)) ([a017970](https://github.com/color4pen/spec-runner/commit/a0179701604aa084ff261046ce073e90139a9bf8))
* decision-needed に選択肢の提示を必須化し、人間の判断を構造化して記録・尊重する ([#685](https://github.com/color4pen/spec-runner/issues/685)) ([82262fc](https://github.com/color4pen/spec-runner/commit/82262fc1186953d55fee593fbcea3d342b3ecaae))
* provider SDK を dynamic import + optionalDependencies 化し、未使用 provider のバイナリ 190MB を install から外せるようにする ([#680](https://github.com/color4pen/spec-runner/issues/680)) ([2422f57](https://github.com/color4pen/spec-runner/commit/2422f572812f533fcfb0f3ae7ed6d40b37c4bbdc))
* resume 時の再開コンテキストを state から自動生成し、素の resume を常に正しくする ([#686](https://github.com/color4pen/spec-runner/issues/686)) ([2979ca6](https://github.com/color4pen/spec-runner/commit/2979ca6b1f901950a51ac1537b46e27e8003404f))
* step 実効設定（model 等）の解決結果と適用 source を可視化するコマンド面を追加する ([#675](https://github.com/color4pen/spec-runner/issues/675)) ([cdc91a6](https://github.com/color4pen/spec-runner/commit/cdc91a69f4ed98e81ba637951697251c5f89a1d7))
* usage / pricing と one-shot デフォルトモデルの provider 中立化 ([#665](https://github.com/color4pen/spec-runner/issues/665)) ([ef893ce](https://github.com/color4pen/spec-runner/commit/ef893ce3c75360f72e1e71351c0ee66ee0980b2d))
* 公開 CLI の体裁: --version コマンドの追加と bin パスの正規化 ([#664](https://github.com/color4pen/spec-runner/issues/664)) ([87d97b6](https://github.com/color4pen/spec-runner/commit/87d97b61a134ee386341c3b47fd551cdc1b07e55))


### Bug Fixes

* archive / cancel の remote branch 削除を冪等にし、auto-delete 済み branch への偽 warning を消す ([#671](https://github.com/color4pen/spec-runner/issues/671)) ([bab13ac](https://github.com/color4pen/spec-runner/commit/bab13aca281c323bd2f8414bceb117a6c48763ef))
* codex adapter が resumePrompt を消費せず、escalation 後の人間判断が agent に届かない ([#682](https://github.com/color4pen/spec-runner/issues/682)) ([a375a5e](https://github.com/color4pen/spec-runner/commit/a375a5ec2c5e6a259489e6fed2d33ee2e89fe6d6))
* codex adapter の completion report 回収を頑健化する（outputSchema 不全環境での fallback と観測性） ([#670](https://github.com/color4pen/spec-runner/issues/670)) ([37cf72e](https://github.com/color4pen/spec-runner/commit/37cf72e23313afb1a53c4f300caeb6897be16f5b))

## [0.3.1](https://github.com/color4pen/spec-runner/compare/specrunner-v0.3.0...specrunner-v0.3.1) (2026-06-12)


### Features

* code 変更後に機械検証を経ずに pr-create へ到達できる遷移経路を塞ぐ ([#657](https://github.com/color4pen/spec-runner/issues/657)) ([254aa6e](https://github.com/color4pen/spec-runner/commit/254aa6ea7983e2f9e238a0b8e98645bef3ded3a9))
* conformance の needs-fix に戻り先 step を導出させ、空振りの implementer 再入を解消する ([#648](https://github.com/color4pen/spec-runner/issues/648)) ([5664ab9](https://github.com/color4pen/spec-runner/commit/5664ab962b89fb4ec9eb73f26d20b0851220202b))
* escalation 通知コメントに branch の compare URL を含め、停止した job の差分確認を GitHub 上で完結させる ([#658](https://github.com/color4pen/spec-runner/issues/658)) ([91b46f5](https://github.com/color4pen/spec-runner/commit/91b46f5f21c2f2d542c74f474e1a432bcca85ebe))
* judge report tool に observations チャネルを追加し、非アクション観察を verdict 駆動から分離する ([#651](https://github.com/color4pen/spec-runner/issues/651)) ([4b3fe6e](https://github.com/color4pen/spec-runner/commit/4b3fe6eb104922c45369a37e929324fde596782c))
* プロジェクトのテスト配置規約を config で宣言し、生成テストの配置を決定的にする ([#643](https://github.com/color4pen/spec-runner/issues/643)) ([109a8f4](https://github.com/color4pen/spec-runner/commit/109a8f4aed4542887f33dd68e05cc34a1bc9fe2f))


### Bug Fixes

* findingRef 検証が実在ディレクトリを不存在と誤判定し、needs-fix を escalation に強制する ([#654](https://github.com/color4pen/spec-runner/issues/654)) ([ee65b0a](https://github.com/color4pen/spec-runner/commit/ee65b0a864b8986c4c06f3c947ed0ec813eda518))
* inbox の reject が承認ラベルを剥がさず、同一 reject コメントを 5 分毎に積み続ける ([#650](https://github.com/color4pen/spec-runner/issues/650)) ([1017c55](https://github.com/color4pen/spec-runner/commit/1017c55e3516ed3547dacd324c7cb11ff71cdca9))
* transient 判定対象の stream idle timeout が code-review でリトライされず halt した ([#656](https://github.com/color4pen/spec-runner/issues/656)) ([86ecf9d](https://github.com/color4pen/spec-runner/commit/86ecf9d5e2c87eb09e79eb3be442494031159a1d))

## [0.3.0](https://github.com/color4pen/spec-runner/compare/specrunner-v0.2.0...specrunner-v0.3.0) (2026-06-11)


### Features

* agent session の一過性エラーを有限回の自動再試行で吸収する ([#600](https://github.com/color4pen/spec-runner/issues/600)) ([74a63f7](https://github.com/color4pen/spec-runner/commit/74a63f7e75e162aa808d3d1d25ca683fa15d91c9))
* git transport（fetch / push）を解決済みトークンで自己認証する ([#614](https://github.com/color4pen/spec-runner/issues/614)) ([ee610f7](https://github.com/color4pen/spec-runner/commit/ee610f7b6c9165239edd8ee7cdb7bc32e8acca42))
* inbox run が孤児化した running job を検出して自動回復する ([#618](https://github.com/color4pen/spec-runner/issues/618)) ([94a7ab2](https://github.com/color4pen/spec-runner/commit/94a7ab22ec909a1536c945e269527dce3b496f6b))
* job cancel 時に request.md を drafts/ に戻すオプションを追加する ([#610](https://github.com/color4pen/spec-runner/issues/610)) ([ad81329](https://github.com/color4pen/spec-runner/commit/ad813297e41de346724434c44bcf5dedf7605775))
* PR の Fixes 行を job state の issueNumber から導出する ([#620](https://github.com/color4pen/spec-runner/issues/620)) ([23fe762](https://github.com/color4pen/spec-runner/commit/23fe762f8678eb77a26eb74740bb417e4264c071))
* step 完了時に宣言された契約を機械検証し、不足は follow-up で修復させる ([#633](https://github.com/color4pen/spec-runner/issues/633)) ([02e0ee8](https://github.com/color4pen/spec-runner/commit/02e0ee887a9b8c994533d85091f1fa2dbb0e9dd5))
* カスタムレビューワーの起動条件を宣言的に指定できるようにする ([#632](https://github.com/color4pen/spec-runner/issues/632)) ([325ec83](https://github.com/color4pen/spec-runner/commit/325ec83f9e5ccf598a2a0675557b80b7c24f9a8c))
* プロジェクト定義のカスタムレビューワー step を宣言的に追加できるようにする ([#628](https://github.com/color4pen/spec-runner/issues/628)) ([e813245](https://github.com/color4pen/spec-runner/commit/e8132452aa9f378ea53e8cf7c2a5b27693f26797))
* レビュー収束後の退行ゲートで累積 findings を最終コードと再照合する ([#631](https://github.com/color4pen/spec-runner/issues/631)) ([3a58c89](https://github.com/color4pen/spec-runner/commit/3a58c89b635737fcaae78a293372dd8b6103e7b6))
* 成果物の lineage と工程ごとの cost 帰属を可視化する（記述子化 R5） ([#612](https://github.com/color4pen/spec-runner/issues/612)) ([8db4941](https://github.com/color4pen/spec-runner/commit/8db4941b9051eb84f02d15d4b555bdd02a684f8e))
* 自動化文脈の GitHub トークン経路を対話ログインと分離する ([#613](https://github.com/color4pen/spec-runner/issues/613)) ([2031f78](https://github.com/color4pen/spec-runner/commit/2031f78ee1d82e2fa6e8e35fd47bc021dc1a793d))


### Bug Fixes

* archive 済み job の machine-local sidecar が削除されず無限に増える ([#637](https://github.com/color4pen/spec-runner/issues/637)) ([a8a831e](https://github.com/color4pen/spec-runner/commit/a8a831e35013c3992579625501fa78bd795fbaf2))
* inbox の start 実行直前に issue の linkage を再確認する ([#621](https://github.com/color4pen/spec-runner/issues/621)) ([10d784d](https://github.com/color4pen/spec-runner/commit/10d784da81a0d85137c4c1514ec3e0cfb11587b7))
* init: .gitignore に node_modules/ を含める ([#617](https://github.com/color4pen/spec-runner/issues/617)) ([5ecd36f](https://github.com/color4pen/spec-runner/commit/5ecd36f53234a365181c10f5032fdba01a9f3074))
* job 一覧が archive 全件をロードし、履歴の長さに比例して遅くなる ([#638](https://github.com/color4pen/spec-runner/issues/638)) ([64f7664](https://github.com/color4pen/spec-runner/commit/64f76643b954e2f46559de0cec3201e245f9d3ed))
* secrets masking に OpenAI 系トークンのパターンを追加する ([#609](https://github.com/color4pen/spec-runner/issues/609)) ([e6f94b4](https://github.com/color4pen/spec-runner/commit/e6f94b47185c0817d648f71fdf7e2ad6faa25b48))
* transient リトライが stream idle timeout と error result 経路を取りこぼす ([#626](https://github.com/color4pen/spec-runner/issues/626)) ([e9d5adb](https://github.com/color4pen/spec-runner/commit/e9d5adbc027af9e2bc65b927b9db5b457b699998))


### Miscellaneous Chores

* release 0.3.0 ([b13ae27](https://github.com/color4pen/spec-runner/commit/b13ae270636214d08190c108c728a20dc08cdd4a))

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
