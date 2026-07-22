# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### ソースコード実測（前提確認）

- `src/core/step/commit-push.ts:117` — `["commit", "-m", commitMessage]`（pathspec なし）を確認。request.md の背景記述と一致。
- `src/core/step/commit-push.ts:102-110` — `commitAndPushTail` の HEAD 前進検出経路が `pushOnly` を呼ぶだけで commit 内容を一切検査しないことを確認。経路 2 の突破口が実際に存在する。
- `src/core/step/commit-push.ts:260-277` — scoped 残余違反（`findWriteScopeViolations` が違反を返した後）の処理を確認。`quarantineViolationEvidence` + `stderrWrite` + `git clean` / `git checkout HEAD` を実行するが throw せず後続 tail（commit + push）へ落ちる。経路 3 の「復元して続行」挙動と一致。
- `src/core/step/commit-push.ts:294-313` — guarded mode の違反検出 → throw のフローを確認。`writeScopeViolationError` を throw する fail-closed 経路が存在し、scoped 残余との非対称が実コードで確認できた。
- `src/core/step/executor.ts:443-461` — `finalizeStepArtifacts` throw → `makeCommitFailHalt` → `return { kind: "halt" }` の経路を確認。これは `deriveStepCompletion`（line 483）より前に発生する。scoped 残余 halt 化で「改変した正典を読んだ step の結果を採用しない」という設計前提が executor の構造で成立している。
- `src/core/step/step-halt.ts:305-316` — `makeCommitFailHalt` が `err.code` を `ErrorInfo.code` としてそのまま保持することを確認。`writeScopeViolationError`（code=`WRITE_SCOPE_VIOLATION`）を throw すれば新 halt 種別を FSM に追加せず halt 化できるという D5 の前提が成立。
- `src/core/step/commit-push.ts:351-393` — `commitFinalState` は `git add -A`（全体）で staged を確認し、staged がなければ push しない。agent 自己 commit 後の worktree は clean（HEAD = 違反 commit）のため、halt 後の checkpoint で staged 変更は 0 → push せず、違反 commit が remote へ到達しないという D2 の不変が成立。
- `src/core/step/write-scope.ts` — leaf module として `src/util/paths.ts` のみを import していることを確認。D5 の「`managedPaths` を引数注入することで leaf 制約を維持」という設計根拠が現実に対応している。
- `src/core/pipeline/round-git-scope.ts:83-102` — `partitionRoundChanges` の `offending = changed − declared − pipelineManaged` 計算を確認。D5 が定義する `findScopedCommitViolations` と同型であることを確認。
- `src/core/step/commit-push.ts:222` — `headBeforeStep` が `commitAndPush` に渡され `commitAndPushTail` へ伝播していることを確認（D7 の前提）。
- `src/core/step/commit-push.ts:104-105` — HEAD 前進検出の null guard: `headBeforeStep && headAfterStep && headAfterStep !== headBeforeStep`。headBeforeStep が null の場合は自己 commit 検出をスキップする（fail-open）。
- `src/util/git-exec.ts:39-51` — `gitExec` が git error 時に null を返すことを確認。T-03 の「git error → null」仕様の根拠。

### 設計整合性検証

- request.md の 3 経路（事前 stage 混入 / 自己 commit 無検査 push / 復元して続行）が、現行 `commit-push.ts` の具体的なコード行で実証されていることを確認。
- spec.md の全 Requirement に Given/When/Then Scenario が存在し、`SHALL` / `MUST NOT` の normative keyword を含むことを確認。
- request.md 受け入れ基準 8 項目すべてに対応する Scenario または tasks.md タスクが存在することを確認。
- design.md の D1〜D7 が request.md の architect 評価済み判断（採用 2 件 / 却下 2 件）と矛盾しないことを確認。
- tasks.md の T-01〜T-11 の Acceptance Criteria と spec.md Requirement・request.md 受け入れ基準の対応を確認。
- TC-023 群（現行: scoped 残余は `resolves`）が T-08 で `rejects with WRITE_SCOPE_VIOLATION` へ更新される対象として正しく同定されていることを確認。
- 既存テスト `write-scope.test.ts` / `write-scope-invariants.test.ts` / `write-scope-rules-consistency.test.ts` の内容を確認し、T-01 の `findScopedCommitViolations` 追加が leaf 制約テスト（TC-010）および既存 `findWriteScopeViolations` テスト（TC-014）に干渉しないことを確認。

### セキュリティ観点

- pathspec `--` セパレータ: `git add -A -- <paths>` / `git commit -- <paths>` / `git diff HEAD -- <path>` はいずれも `--` 後をリテラルパスとして扱うため、パス文字列に `-` や `--` 文字が含まれていても option injection は発生しない。
- SHA 値: `headBeforeStep` / `headAfterStep` は `git rev-parse HEAD` の出力（hex 文字列）であり injection リスクなし。
- quarantine ファイル: `.specrunner/local/<slug>/` に書き出され、gitignore 対象のため commit されない。
- OWASP Top 10: 本変更は CLI ツール内部の git 操作であり、認証・HTTP リクエスト・DB クエリ等に変更はない。A03（Injection）のみ対象となりうるが、上述の pathspec 分離により安全。その他の項目は適用外。

## 検証できなかった項目

- `src/core/step/write-scope.ts` の `findScopedCommitViolations` — まだ存在しない（新規作成対象）。
- T-09 / T-10 の新規テスト — まだ存在しない（実装対象）。
- `git commit -- <pathspec>` の実際の commit tree 内容 — mock ベーステストでは検証不能。T-10 の real-git 統合テストで最終確証を取る設計になっており、適切な二層構造。

## Findings 詳細

### F-01: T-05 が `headBeforeStep=null` 時の挙動を未規定

現行 `commitAndPushTail` は `headBeforeStep && headAfterStep && headAfterStep !== headBeforeStep` の null guard を持ち、`headBeforeStep` が null の場合は HEAD 前進検出全体をスキップする（fail-open）。T-05 の実装タスクは "staged 変更なし + `headBeforeStep !== HEAD`" を分岐条件として記述しており、null 時の挙動（スキップ = 自己 commit 検査なし）を明示していない。`captureHeadSha` が失敗する確率は低いが、自己 commit 検査が暗黙的にスキップされることは spec.md のどの Scenario にも記載がない。

T-05 タスクに「`headBeforeStep` が null の場合は自己 commit 検査をスキップし（fail-open）、現行の HEAD 前進検出と同じ null guard を維持する」と一行追記することで曖昧さが解消される。

---

### F-02: TC-018 が T-05 後に暗黙の `diff` mock 共有に依存する

TC-018 は `diff: { exitCode: 0 }` をモックに設定し、HEAD 前進で push-only 経路が正常動作することを検証する。T-05 実装後、この `diff` モックは（a）staged 判定 `git diff --cached --quiet`（exit 0 = staged なし）と（b）自己 commit range diff `git diff --name-only --no-renames headBeforeStep HEAD`（exit 0 + stdout="" = 変更なし = 違反なし）の両方に使われる。両者は相互排他（staged あり → commit 経路に入り HEAD 前進検出に到達しない）なのでテストは引き続き green になるが、この双方向モック共有はテストコードを読む人には自明でない。

T-08 で TC-018 のモック設定に「`diff: exitCode:0` は staged チェック（no staged）と range diff（no violations）を兼ねる。staged + HEAD 前進の同時要求は発生しない。」のコメントを追加することで、将来の誤読を防げる。

---

### F-03: TC-022（write-scope-invariants）が `findScopedCommitViolations` 呼び出しを未検証

`write-scope-invariants.test.ts` の TC-022 は `commit-push.ts` が `stagingModeFor` と `findWriteScopeViolations` を呼ぶことを grep で機械保証する。T-01 で追加する `findScopedCommitViolations` が `commit-push.ts` から呼ばれることは T-11 の Acceptance Criteria に含まれていない。この関数の呼び出しが削除されても、TC-022 は引き続き green になる（TC-009 相当の unit test は T-09 にあるが、架け橋となる architecture invariant がない）。

T-11 に「`write-scope-invariants.test.ts` に `findScopedCommitViolations` が `commit-push.ts` から呼ばれることを確認する grep チェックを追加する」という项目を追加すると、単一ソース原則の architecture 保証が完結する。

---

### セキュリティ観点（非ブロッキング）

**再開経路のリスク（design.md Risks 節で既知）**: 自己 commit WRITE_SCOPE_VIOLATION halt 後にオペレーターが `git reset` せずに `specrunner job resume` すると、次ステップの `headBeforeStep` が違反 commit の SHA になり、その後の正常 push に相乗りして違反 commit が remote へ到達しうる。設計上の既知リスクであり "スコープ外（過去 commit の遡及監査）" として明示された決定。halt メッセージによる促しは機械強制でなく運用依存。`writeScopeViolationError` の `hint` に「resume 前に `git log` で違反 commit を特定し `git reset --soft <headBeforeStep>` を実行してください」等の具体的手順を追加することで非機械的緩和を強化できる（実装者の判断に委ねる）。
