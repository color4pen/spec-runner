# ADR-20260829: bite-evidence gate の削除 — test-materialize 廃止後に保証モデルが成立しない gate を除去する

> 本 ADR は `remove-bite-evidence` request の設計判断を記録する。STANDARD pipeline から `bite-evidence` step を削除し、`implementer` が直接 `verification` へ遷移する構造へ移行する。あわせて gate 専用の production code・assurance floor 次元・runtime primitives・config キーを除去し、legacy job の回復可能性と過去 state/journal の読み込み互換を維持する。

## ステータス

accepted (2026-08-29)

supersedes（部分）: `specrunner/adr/2026-08-16-absorb-test-materialize.md` D3（Evidence Base ネイティブ方式による file-set 同定）— file-set を選択する gate 自体が本 ADR で削除されるため、D3 の file-set 同定の実装詳細は意味を失う。D3 が確立した「testDerivation = scenario revision binding のみ」という縮退定義は変更なし。

## コンテキスト

`bite-evidence` は STANDARD pipeline の `implementer` と `verification` の間に置かれた gate step である。`bug-fix`・`new-feature` 等の forward strategy request type に対し、Evidence Base（EB）と branch HEAD の間で変更されたテストファイルを選び、各ファイルを合成 base tree に対して（**red** を期待）、および HEAD に対して（**green** を期待）実行し、base-red → candidate-green 契約を満たさないファイルがあれば pipeline を halt させた。

**なぜ削除するか。** PR #999（`absorb-test-materialize`）で `test-materialize` step が implementer に統合される際、gate の対象集合が「test-materialize commit が生成した新規テストファイル」から「EB↔HEAD-changed でテストファイルパターンに一致する全ファイル」へ置換された（ADR-20260816 D3）。この置換により gate が依存していた「実装前に実体化された有界なテスト集合」という工程境界は消滅したが、gate 側には「選択された全ファイルは base-red でなければならない」という前提が残った。

その結果、implementer が単に pin 宣言を追加した既存 `gate-check.test.ts` が base-green / candidate-green となり、実装・verification がすべて正常であるにもかかわらず bite-evidence で halt する偽陽性が実運用で発生した。LocalRuntime の隔離 worktree で同一 OID を用いた再現確認もとれており、これは個別ファイルの除外不足ではなく設計上の残滓である。

現行実装を部分修正する（対象集合の絞り込み、per-file provenance、rename 追跡）コストは、gate が現在提供する品質保証の価値を上回ると判断し、gate を丸ごと削除する方針をとる。

### 既存コードの確定事実（実装前の読み取り）

- `src/core/pipeline/types.ts` — `STANDARD_TRANSITIONS` に `IMPLEMENTER / "success"` 行が 3 本（`isTestGenExempt` ガード・`verificationFailedLast` ガード・fall-through の `BITE_EVIDENCE` 行）と `BITE_EVIDENCE` 行が 4 本（`passed`/`strategy-deferred` → verification、`failed`/`error` → escalate）。
- `src/core/step/bite-evidence/` — production 5 モジュール（`step.ts`、`gate.ts`、`oids.ts`、`tamper.ts`、`test-file-selection.ts`）と `__tests__/` 配下のテスト 7 本。
- `src/kernel/step-names.ts` — `STEP_NAMES.BITE_EVIDENCE` と `CLI_STEP_NAMES` への登録。
- `src/state/profile.ts` — `STANDARD_PROFILE.assurance.biteEvidence = "required"`、`AssuranceFloor.biteEvidence`、`BITE_EVIDENCE_RANK`、`satisfiesFloor` の比較分岐。
- `src/core/archive/achieved-assurance.ts` — `resolveEvidenceBaseRev`・`FORWARD_TYPES`・`selectMaterializedTestFiles` をインポートし archive 時に red/green を再実行。`AssuranceProvenanceRuntime` は runtime 4 メソッドの `Pick`。
- `src/config/schema/` — `verification.scopedTestCommand`・`verification.scopedTestPatterns`・`archive.minimumAssurance.biteEvidence` が定義。
- `src/core/port/runtime-strategy.ts` — `listChangedFilesBetweenCommits`・`runTestsAtCommit`・`runTestsOnSynthesizedTree` が `RuntimeStrategy`（optional）と `RealRuntimeStrategy`（required）に宣言。
- `src/core/runtime/local.ts` — 上記 3 primitive の temp-worktree 実装（約 310 行）。
- `src/util/paths.ts` — `biteEvidenceResultPath` と `pipelineManagedPaths` 登録。
- `src/core/types.ts` / `src/core/port/step-types.ts` — `authorizedCanonWriters`（bite-evidence tamper チェック専用）。
- `src/core/resume/resolve-step.ts` — `LEGACY_STEP_ALIASES = { "build-fixer": IMPLEMENTER, "test-materialize": IMPLEMENTER }` のみ。

## 決定

### D1: implementer 遷移行を単一の無条件行に畳む

`IMPLEMENTER / "success"` の 3 行を `implementer success → verification` の単一の unguarded 行に置換し、`BITE_EVIDENCE` の 4 行を削除する。述語 `isTestGenExempt` と `verificationFailedLast` は削除しない。

**Rationale**: gate が消えると 3 行すべての遷移先が同一であり、guard があっても結果が変わらない dead branching になる。行を削除しつつ述語関数を保持することで「この edge に guard が不要になった」と「この述語が未使用である」を分離できる。後者は偽であり（`isTestGenExempt` は `design success → spec-review` 行に、`verificationFailedLast` は `step-context-builder.ts` と `implementer.ts` のコンテキスト構築に使用されている）、前者のみが真である。

**却下した代替案**:
- *ガード付き 3 行を残して遷移先だけ verification に変える* — 3 つのコードパスが 1 つの挙動を持つ誤解を招く構造が残る。
- *guard 関数も一緒に削除する* — 生きた非遷移 consumer が存在し typecheck が落ちる。
- *bite-evidence を no-op pass-through step として残す* — pipeline map と operator 向け進捗出力に「何もしない step」が表示される。

### D2: `src/core/step/bite-evidence/` ディレクトリとその artifact surface を一括削除する

`src/core/step/bite-evidence/`（production 5 モジュール + `__tests__/`）、`STEP_NAMES.BITE_EVIDENCE`、`CLI_STEP_NAMES` 登録、`biteEvidenceResultPath`、`pipelineManagedPaths` エントリ、メッセージテキスト中の `bite-evidence-result.md` 言及をまとめて削除する。

**Rationale**: モジュールは closed subgraph である — すべての export はディレクトリ内か本変更で合わせて削除される call site のいずれかにしか消費されない。唯一の例外は `test-file-selection.ts` が再 export する `matchesGlob` だが、実体は `src/util/glob-match.ts` にあり他の consumer は影響を受けない。step name を同時に削除することで型システムが checker として機能し、見落とした参照はコンパイルエラーになる。

**却下した代替案**:
- *step を削除して `test-file-selection.ts` だけ保持する* — 唯一の他 consumer（`achieved-assurance.ts`）も本変更で絞り込まれるため unreferenced モジュールになる。YAGNI、git history が archive として機能する。
- *`STEP_NAMES.BITE_EVIDENCE` を legacy 定数として保持する* — legacy resume 経路（D8）は plain string を使うため不要であり、残すと新コードが存在しない step を誤参照できてしまう。

### D3: `authorizedCanonWriters` 配管を削除する

`authorizedCanonWriters`（`core/types.ts` と `port/step-types.ts`）、`src/core/pipeline/run.ts` の 2 注入サイト、`src/core/resume/canon-provenance.ts` の `authorizedCanonWriterSteps` を削除する。`canon-provenance.ts` の残りの export は維持し、circular-import 注記を更新する。

**Rationale**: このデータフローは bite-evidence tamper チェックという単一 consumer に流れており、consumer が消えると computed-and-threaded だが何も読まない値になる。dead code より悪く load-bearing に見える。

**却下した代替案**:
- *将来の tamper 機構のために残す* — スコープ外であり、canon-provenance ルールと乖離しながら rot するリスクがある。

### D4: profile と floor lattice から `biteEvidence` 次元を削除し、legacy state type を保持する

`STANDARD_PROFILE.assurance` を `{ testDerivation: "frozen", specReview: "required" }` のみにする。`AssuranceFloor.biteEvidence`・`BITE_EVIDENCE_RANK`・`satisfiesFloor` の比較分岐・`MinimumAssuranceConfig.biteEvidence`（型と zod フィールド）を削除する。`ProfileAssurance` の index signature と `BiteEvidenceLevel` 型は `@legacy-read-only` コメント付きで保持する。

**Rationale**: floor は「宣言された保証」の lattice であり、何も達成できなくなった次元を宣言可能にしたまま fail-closed 評価を走らせると永続的に拒否が起きる。read-side type の保持は constraint 2（既存 state の読み込み互換）に必要な最小限の残留である。`verify-checkpoint.ts` は `policyDigest` を格納済み profile body から再計算するため、`STANDARD_PROFILE` の digest 変化は既存 checkpoint を invalidate しない。

**却下した代替案**:
- *`biteEvidence: "optional"` を standard profile に残す* — 生成者も評価者も存在しない次元を宣言することになり、本変更が除去しようとしている stale guarantee の典型例になる。
- *`BiteEvidenceLevel` / `ProfileAssurance` の named field も削除する* — 既存 `state.json` の parsing が validation でエラーになる。

### D5: archive achieved-provenance を `specReview` + `testDerivation` に絞り込む

`deriveAchievedAssurance` から biteEvidence 導出（EB 解決・forward type チェック・file 選択・テスト 2 回実行）を削除する。`AssuranceProvenanceRuntime` を `Pick<RuntimeStrategy, "readFileAtCommit">` に絞り込む。`config` 引数（テスト実行のスコーピングのためだけに存在）を導出入力から削除し、`merge-then-archive.ts` と `src/cli/archive.ts` の配線も合わせて更新する。残り 2 次元の fail-closed 挙動は変更しない。

**Rationale**: archive floor の役割は「profile が宣言した保証が final HEAD でも成立するか再検証すること」である。次元が消えれば再検証するものもなく、実行していたテストは廃止理由そのものである偽陽性を生む測定だった。`Pick` の絞り込みは型レベルで依存削減を明示し、D7 の runtime primitive 削除を second pass なしで可能にする。

**却下した代替案**:
- *導出は維持して結果を無視する* — archive の最も遅くて壊れやすい部分を何の signal も得ずに実行し続ける。
- *wide な `Pick` を維持して diff を減らす* — D7 をブロックしてモジュールの依存を誤表現する。

### D6: `archive.minimumAssurance.biteEvidence` を明示的 semantic error にする

新しい後段チェック `checkRemovedAssuranceDimension(raw)` を `runSemanticChecks` に登録する。キーが（値が `null` の場合を含め）存在する場合に `CONFIG_INVALID` をスローし、次元が削除されたこととキーを削除する旨を明記したメッセージを出力する。

**Rationale**: zod の構造スキーマ層は `object()` で unknown key を strip する。スキーマフィールドを削除するだけではキーが黙って無視されてしまう — これはまさに本変更が除去しようとしている「宣言した保証が実際には提供されない」という問題になる。semantic check 層は raw object に対して動作するため strip の影響を受けず、`checkStagingExclusionNamespace` と同じ確立済みパターンである。値ではなく「存在」でキーイングすることで `"optional"` も捕捉する。

**却下した代替案**:
- *zod の `never()` フィールドを使う* — エラーメッセージが汎用的になり `null` を一貫して捕捉できない。
- *警告して続行する* — もはや保証されない宣言済みの保証は fail-closed でなければならない。
- *黙って strip する* — 現在の障害モードと同一。

### D7: scoped-test config キーと bite-evidence 専用 runtime primitive 3 本を削除する

`verification.scopedTestCommand`・`verification.scopedTestPatterns`、`listChangedFilesBetweenCommits`・`runTestsAtCommit`・`runTestsOnSynthesizedTree` の port 宣言（`RuntimeStrategy` の optional 宣言と `RealRuntimeStrategy` の required 宣言）、LocalRuntime の実装、ManagedRuntime のスタブ、`IsolatedTestResult` 型を削除する。ユーザー config に残存する `verification.scopedTest*` キーは黙って無視し、エラーにしない。

**Rationale**: これらの primitive は bite-evidence の隔離 per-file 実行のためだけに存在し、gate と archive 導出が消えると caller がゼロになる。LocalRuntime の実装は temp detached worktree と `node_modules` symlinking という本物の複雑さを持つ liability である。D6 との非対称性は意図的である — 保証を「宣言する」キーは保証が消えると fail-closed でなければならないが、「実行をスコープする」だけのキーは実行対象がなくなれば惰性であり、拒否は機能している config を壊す breaking change になる。

**却下した代替案**:
- *`scopedTest*` も hard error にする* — 上記の理由で gratuitous breaking change。
- *runtime primitive を「後で使えるかもしれない」として保持する* — 約 310 行の temp worktree 操作コードが呼ばれない状態で rot する。git history が archive として機能する。

### D8: 単一の legacy alias エントリで全 resume 経路を覆う

`src/core/resume/resolve-step.ts` の `LEGACY_STEP_ALIASES` に `"bite-evidence": STEP_NAMES.VERIFICATION` を追加する。`bite-evidence` を `--from` の候補として広告している command registry の使用方法テキストを削除する。

**Rationale**: `resolveResumeStep` は 3 つの分岐すべて（`--from`・`resumePoint.step`・`stateStep`）で alias map を適用し、`attach` の `checkpoint-policy.ts` も同じ関数を通るため、エントリ 1 件で constraint 1 を全て満たす。`verification` が正しいターゲットである — gate 上で halt したジョブは、gate が escalate しない全結果で遷移していた先に resume するのが適切。これは既存の `"build-fixer"` / `"test-materialize"` エントリと同じパターンであり、機構は実証済み。

**却下した代替案**:
- *各 call site を個別に special-case する* — 同一ルールのコピーが 3 本になる。
- *`implementer` を alias 先にする* — gate 到達前に既に完了した実装作業を冗長に再実行させる。
- *legacy 値をエラーとして拒否する* — constraint 1 に違反し in-flight のジョブを立ち往生させる。

### D9: legacy evidence の read path を保持し、write path を削除する

`JobState.biteEvidence`・`BiteEvidenceRecord`・`state/schema/operations.ts` の配列バリデーション・`Verdict` union の `"strategy-deferred"` メンバー・reopen 時のフィールド保存は `@legacy-read-only` コメント付きで維持する。`ParsedStepResult.biteEvidence`・`StepCompletion.biteEvidence`（フィールドとマッピング）・`commit-orchestrator.ts` の反映は削除し、新規レコードを生成できないようにする。

**Rationale**: constraint 2（既存 state の読み込み互換）を満たしつつ「レコードは歴史的なもの」という不変条件を型システムで強制できる最小の分割である。producer がなくなると将来の `biteEvidence` データは旧 run から来たもの以外にあり得ない。journal fold と `buildAttestation` は step name に依存しないため、旧 `bite-evidence` step-attempt エントリは special handling なしで fold・render される。`"strategy-deferred"` は旧 journal エントリが持つため `Verdict` union に残す必要がある。

**却下した代替案**:
- *state フィールド自体を完全に削除する* — 既存 `state.json` が resume 時に validation エラーになる。
- *write path を残して使用しない* — 何も評価しないデータを再導入する抜け道が残る。

### D10: current-state の記述に限定した文書修正

`README.md` のパイプラインリストを gate なしで renumber し（既に stale だった `test-materialize`・`build-fixer` のエントリも合わせて修正）、`docs/configuration.md` のスコープドテストセクションを削除して `minimumAssurance.biteEvidence` エラーと `scopedTest*` 黙認を説明する短い「removed keys」ノートを追加し、`src/prompts/pipeline-map.ts` の行を削除し、`specrunner/project.md` の言及を削除する。`architecture/` では `domain-model.md` の事実に反するクローズだけを修正し、他の文書と ADR には手を入れない。

**Rationale**: `PIPELINE_MAP` は agent が prompt としてレンダリングする唯一の信頼できる情報源であり、descriptor と一致していなければすべての agent prompt が存在しない step を描写することになる。逆に `architecture/` は CODEOWNERS 管理で pipeline の通常書き込みループの外にある（constraint 4）。他の記述は依然として真であり（legacy レコードの台帳保持は引き続き実施される、divergence-status は歴史的ログ）、修正が必要なのは事実に反するクローズのみ。ADR は不変の歴史的決定であり書き換えない。

**却下した代替案**:
- *全文書でワード `bite` のすべての出現を sweep する* — 歴史を書き換え、オーナーシップ境界を越える。
- *architecture 文書には一切手を入れない* — 今は事実に反することが示された記述を残す。

### D11: 四方向テストトリアージ

**削除**: `bite-evidence/__tests__/` の全テストスイート、pipeline bite-evidence スイート、runtime isolated/scoped/synthesized-tree/changed-files スイート、scoped config スイート、sole-committer bite スイート。

**retarget**: 遷移テーブルスイート、floor/`satisfiesFloor` スイート、minimum-assurance schema と CLI スイート、achieved-assurance スイート（2 次元に縮小）、prompt skeleton drift guard のパイプラインマップアサーション。

**keep**: 旧レコードがパースできることを assert する legacy-compat スイート。

**add**: ルーティング collapsing のリグレッション coverage、legacy resume alias、新 config エラーの各新スイート。

**Rationale**: スイートを削除するのはその対象が消えた場合のみ正しい。step に言及するだけで生きている不変条件を assert しているスイートは retarget しなければ、変更によって coverage が静かに失われる。4 バケットを明示することで「bite が grep で引っかかるものは全削除」というデフォルト行動を防ぎ、legacy-compat 保証が維持される。

### D12: 削除後も残存する bite 固有の語彙を rename または削除する

`materializedTestFiles` 等、bite モデル下でのみ意味をなす識別子を残存サイトで rename または削除する。`selectMaterializedTestFiles`・`DEFAULT_SCOPED_TEST_PATTERNS`・`FORWARD_TYPES`・`resolveEvidenceBaseRev` はモジュールごと消える。最終確認として `bite`・`scopedTest`・`materializedTestFiles` の grep sweep を実施し、intentional legacy reference または historical documentation のみが残っていることを確認する。

**Rationale**: 削除されたモデルの語彙が残ることは、削除された概念が再導入される経路になる。grep sweep は削除が実質的に完了しているかを確認する安価な機械的チェックである。

**却下した代替案**:
- *typecheck のみに依存する* — 文字列・コメント・ドキュメント中の stale な名前は typecheck では検出できない。

## 却下した代替案（全体方針）

### 案 A: gate を部分修正する（対象集合の絞り込み・per-file provenance・rename 追跡）

test-materialize 廃止後に生じた target-set の問題を個別に修正し、bite-evidence step を延命させる案。除外パターンの拡張、per-file provenance の追跡、rename の正しい取り扱いを実装する。

- **Pros**: red→green の機械的検証という保証の発想は維持される。既存の isolation 実行基盤（temp worktree・`node_modules` symlinking・`runTestsOnSynthesizedTree`）を再利用できる。step 名・pipeline 形状を変えず、呼び出し元への影響が小さい。
- **Cons**: 除外ケース（PIN 宣言・snapshot 更新・インフラリファクタリング・既存テストを touch する実装変更）を列挙し続ける追いかけっこになる。1 ファイル内の 1 テストだけが base-red であれば同ファイル内の hollow test を識別できないというファイル単位判定の本質的限界は残る。helper・fixture・test config がオーバーレイされない合成 tree の問題も残る。修正が完了するまでは引き続き偽陽性を生む。
- **Why not**: request.md が「本件は個別ファイルの除外不足ではなく、test-materialize 廃止後も旧対象集合の意味論を引き継いでいる設計上の残滓である」と明確に規定している。design.md のコンテキストが「修正コスト（target-set narrowing・per-file provenance・rename tracking）が gate の現在の提供価値を上回る」と評価している。問題は「除外リストが不完全」ではなく「前提とした工程境界が消滅している」ことであり、部分修正では根本原因は解消しない。

### 案 B: bite-evidence を no-op pass-through step として存続させる

step をパイプラインに残しつつ、常に `passed` を返す no-op 実装に置き換える案（過渡的な削除方法として）。

- **Pros**: パイプラインの step リストに変更が生じない。遷移表・step 名・CLI 表示を一時的に維持できる。
- **Cons**: pipeline map とオペレーター向け進捗出力に何もしない step が表示され続け、実態と乖離したドキュメントが残る。コードベースに dead な step 実装と step name が残り誤参照の温床になる。「bite-evidence が通過した」という表示がジョブの品質について誤った印象を与える。
- **Why not**: D1 の代替案 (c) として設計フェーズで明示的に却下済み。no-op step はドキュメントと実態の乖離を定着させる。step の削除を中途半端な状態で先送りしてもメリットがない。

### 案 C: 代替機構（TC/test 単位の mutation evidence 等）を本変更と同時に設計・実装する

bite-evidence を削除しつつ、hollow test 検出を目的とした後継機構を同一変更で提供する案。

- **Pros**: hollow test 検出の空白期間がなくなる。
- **Cons**: 代替機構は TC/test 単位の mutation evidence 等として根本から再設計が必要であり、本変更と同時に行うには変更スコープが過大になる。現行 gate の問題点（ファイル単位の判定粒度・合成 tree の制約・revision binding の欠如）を繰り返さない設計を急いで実装するリスクがある。
- **Why not**: request.md でスコープ外（「新しい red→green/mutation evidence 機構の設計・実装」）として明示的に先送り済み。gate が提供していた signal はすでに信頼できないものになっており、設計を急ぐことで同様の問題を再導入するリスクが大きい。本変更終了後に別途 request として独立して設計する。

## リスクとトレードオフ

- **[hollow test 検出の消失]** 変更前の tree に対してパスするテストは検出されなくなる — Mitigation: gate は #999 以降の入力で既に偽陽性を生んでいたため、失われる signal は正しいものではなく信頼できないものである。`testDerivation`（scenario freeze）と `specReview` floor は維持される。代替機構は将来の変更に明示的に先送りする。
- **[in-flight job の立ち往生]** `bite-evidence` で halt したジョブが resume 不能になり得る — Mitigation: D8 の alias が `--from`・`resumePoint.step`・`state.step`・attach の全経路を単一 resolver で覆う。リグレッションテストが 3 つの経路すべてを assert する。
- **[legacy state の拒否]** 型の削除で既存 `state.json` がパース不能になる可能性 — Mitigation: D9 でレコード型・配列バリデーション・`"strategy-deferred"` verdict を保持し、legacy-compat スイートがそれを証明する。
- **[policyDigest の変化]** `STANDARD_PROFILE` の digest が変わる — Mitigation: `verify-checkpoint` は格納された body から再計算するため、既存 checkpoint が自己検証し続ける。state migration は不要。
- **[既存 config の破壊]** `minimumAssurance.biteEvidence` を宣言している config が hard fail になる — Mitigation: 意図的（D6）。エラーメッセージがキーと修正方法を明示し、Migration Plan と `docs/configuration.md` に記載する。
- **[大量削除]** 多数のファイルを一度に削除するため見落とし参照が生じるリスク — Mitigation: `typecheck` + `lint` + full `test` + D12 の grep sweep が必須 acceptance criteria。

## 移行計画

1. **設定** — `archive.minimumAssurance.biteEvidence` を `.specrunner.json`（または相当ファイル）から削除してからアップグレードすること。削除しないと config validation が `CONFIG_INVALID` でキー名と修正方法を明示してエラーになる。`verification.scopedTestCommand` と `verification.scopedTestPatterns` は残存していても無視されるため任意のタイミングで削除可能。
2. **in-flight job** — `bite-evidence` で halt または resume ポイントが `bite-evidence` のジョブは自動的に `verification` から継続する。手動 state 編集は不要。
3. **永続 state** — migration なし。既存の `biteEvidence` レコードと journal エントリは読み込み可能なまま。新規レコードは生成されない。
4. **ロールバック** — 変更は純粋な revert である。commit を戻すと step・profile 次元・config キー・runtime primitive が復元される。永続データ形式に変更がないため、変更デプロイ中に書かれた state は revert 後も有効（`biteEvidence` レコードがないだけで、変更前のコードはそれを optional として扱う）。

## 影響

### Positive

- 偽陽性 halt（正当な変更が既存テストを touch しただけで gate される）がなくなる
- `implementer → verification` の直接遷移により pipeline フローが単純になる
- 約 310 行の temp worktree 操作コード（`local.ts` の runtime primitive 実装）が削除される
- `authorizedCanonWriters` の computed-and-threaded dead value が削除される
- `archive` の最も遅くて壊れやすいテスト再実行フェーズが除去される
- `config` の `archive.minimumAssurance.biteEvidence` が黙って strip されなくなり、誤った保証の宣言を明示的に拒否する

### Negative

- hollow test（実装から逆算した鏡写しテスト）の機械的検出手段が失われる。`testDerivation` freeze と `specReview` が引き続き代替の品質保証を提供する。代替機構（TC/test 単位の mutation evidence 等）は別途設計される。

### Known Gaps / Future Work

- `verification.scopedTest*` キーをいずれ hard error にするか、永久に黙って無視するか（D7 は今は無視を選ぶ。将来の deprecation pass で再検討可能）。
- `"strategy-deferred"` を `Verdict` union から削除するタイミング（journal 互換ホライゾンが定義されてから）。
- `ProfileAssurance.biteEvidence` / `BiteEvidenceLevel` の将来的な削除（readable state でフィールドが出現しなくなったことを確認できるシグナルが必要）。
- hollow test 検出の代替機構（本変更のスコープ外として明示的に先送り）。

## 参照

- Request: `specrunner/changes/remove-bite-evidence/request.md`
- Design: `specrunner/changes/remove-bite-evidence/design.md`
- Spec: `specrunner/changes/remove-bite-evidence/spec.md`
- Implementation: `src/core/pipeline/types.ts`・`src/core/pipeline/registry.ts`・`src/state/profile.ts`・`src/core/archive/achieved-assurance.ts`・`src/config/schema/validation.ts`・`src/core/resume/resolve-step.ts`・`src/state/schema/types.ts`・`src/core/port/runtime-strategy.ts`・`src/core/runtime/local.ts`
- Supersedes（部分）: `specrunner/adr/2026-08-16-absorb-test-materialize.md` D3（file-set 同定の EB ネイティブ方式 — gate 自体の削除により意味を失う）
- Related: `specrunner/adr/2026-08-16-absorb-test-materialize.md`（test-materialize 廃止・gate の input set 変化の起点）
- Related: `specrunner/adr/2026-08-15-evidence-base.md`（fork point 解決・red→green 構造の確立）
- Related: `specrunner/adr/2026-08-15-absorb-build-fixer.md`（LEGACY_STEP_ALIASES パターンの確立）
