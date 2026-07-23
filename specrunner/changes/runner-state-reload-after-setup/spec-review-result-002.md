# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### operator 適用済み修正の確認

**F-01（design.md D3 の managed passthrough 記述）**

design.md D3 を精読した。前回 finding の「identity passthrough は実装不可能」に対し、operator は D3 を「fail-closed throw を一次案、managedLocalStore からの load を代替案」に書き換えている。インターフェースシグネチャ `reloadJobState(jobId, slug, workspace)` が `jobState` を受け取らないため passthrough/identity は不可能であること、および D3 が T-03 と整合する形に書き換えられていることを確認した。

**F-02（TC-013 DESTROY コメント + TC-013b 追加）**

tasks.md TC-013 の DESTROY コメントが「`LocalRuntime.reloadJobState()` の実装を破壊すると step 6 が fail する」と訂正されていること、および「本 TC は runtime 層のテストであり、runner.ts 配線の封鎖は TC-013b が担う」という注意書きが追加されていることを確認した。TC-013b が CommandRunner.execute() 経由の統合テストとして新設され、sentinel (`synthesizedCommits: ["sentinel-oid-123"]`) を使って runner.ts が reload 結果を pipeline.run() に渡すことを直接 assert する設計になっていることを確認した。

### 背景・根本原因の確認

`src/core/runtime/workspace-materializer.ts` の new-run アーム（lines 154–256）を直接読んだ:
- `bootstrapState` を slug store に seed（JobStateStore.persist）した後、`updateJobState(worktreePath)` → `updateJobState(request.path)` → `updateJobState(appendSynthesizedCommit)` → `updateJobState(branch)` の順で store のみを更新することを確認
- `runner.ts:169–181` に `worktreePath` / `branch` の手動 mirror ブロックが存在し、`synthesizedCommits` の mirror がないことを確認

### 設計判断の妥当性

**D1（optional/required 分割）**: `RuntimeStrategy` に optional、`RealRuntimeStrategy` に required として追加するパターンは、既存の `assertNoDuplicateLiveJob` / `assertProviderReadiness` / `snapshotMainCheckoutGuard` 等と一貫していることを `src/core/port/runtime-strategy.ts` で確認した。

**D2（LocalRuntime 実装）**: `stateRoot = workspace.worktreePath ?? this.cwd` の導出は、materializer の `slugOpts = { slug, stateRoot: worktreePath }` パターンと整合することを確認した。

**D4（fail-closed エラーパス）**: reload 失敗時のエラーパス（`transitionJob` → `persistJobState` → return 1）は workspace setup 失敗パスと同型で、`workspace` が非 null であることが保証された時点でのみ呼ばれることを確認した。

**D5（field 保全の構造的保証）**: `prepare()` が `reviewers` / `noWorktree` / `issueNumber` を `jobState` に設定し、その後 `workspaceOpts.bootstrapState = jobState` を渡すことを確認。materializer の new-run アームはこの bootstrapState を最初の I/O（seed）として store に書いてから `updateJobState` 群を呼ぶため、reload 後の state にはこれらの field が含まれる構造的保証を確認した。

**D3（ManagedRuntime 実装）**: fail-closed throw を一次案、managedLocalStore からの load を条件付き代替とする設計は、state 不明のまま pipeline を走らせないという #893 以降の一貫方針と整合することを確認した。

### spec.md シナリオの照合

4 要件 × 4 シナリオを tasks.md の各タスク（T-01〜T-07）と照合した:
- Bootstrap OID が pipeline に届く経路 → TC-013（runtime 層）+ TC-013b（runner 配線層）の二層で封鎖
- fail-closed → TC-011
- field 保全 → TC-012
- halt-path 非破壊 → TC-014
- request.md 受け入れ基準「store 直読でなく in-memory 経路の直接 assert」は TC-013b の sentinel 方式で充足されることを確認

### テスト戦略の実現可能性

`tests/unit/core/command/runner.test.ts` を読み、`vi.mock("../../../../src/core/pipeline/index.js", ...)` で `buildPipelineForJob` がモックされていることを確認した。TC-013b が `buildPipelineForJob` のモックまたは `pipeline.run` のスパイを介して `jobState` をキャプチャする設計は既存テストの seam を利用しており実現可能である。

### 型安全性

`NormalizedJobState → JobState` キャストは reload 時点でステップ実行ゼロが不変条件であり安全。T-02 にコメント追記指示あり、適切。`jobState` が `const` 束縛であるため T-04 での `let` 再宣言が必要なことを確認。T-04 に明記されており、実装者への指示は正確。

### セキュリティ確認

- **パス構築**: `stateRoot = workspace.worktreePath ?? this.cwd` — `setupWorkspace()` 成功後の値を使うため信頼済み。`slug` はリクエスト作成時に検証済み。新規の attack surface なし。
- **エラー情報**: RELOAD_FAILED のエラーメッセージは stderr にのみ出力（既存のエラーハンドリングパターンと同一）。
- **外部入力**: reload 操作は runner 自身が書いた store ファイルを読む。外部入力の検証は不要。
- OWASP Top 10 観点で当該変更に固有のリスクなし。

### T-01 JSDoc の確認

T-01 は `RuntimeStrategy` に追加する JSDoc コメントを以下のように指定している:
```
- local: loads from slug store using `workspace.worktreePath ?? cwd` as stateRoot
- managed: passthrough (returns unchanged jobState)
- throws on load error (caller is fail-closed)
```

`managed: passthrough (returns unchanged jobState)` は D3 の operator 修正後（fail-closed throw が一次案）と矛盾する。T-03 は実装を throw とするよう正しく指定しているが、T-01 の JSDoc 記述が残存している。

## 検証できなかった項目

- managed runtime の実際の store topology（`.specrunner/local/<slug>/` での seed 順序保証）を実行ログなしで確定的に検証することはできない。D3 が「実装者が安全性を確認できた場合のみ代替案を採用」とし、一次案を fail-closed throw にしているため、このリスクは設計上ヘッジ済み。

## Findings 詳細

### F-03: T-01 の JSDoc 記述が D3 operator 修正後の設計と不整合

tasks.md T-01 の JSDoc 指示「`managed: passthrough (returns unchanged jobState)`」は、D3 が fail-closed throw に更新された後も訂正されていない。実装者が T-01 を参照して RuntimeStrategy のインターフェース JSDoc を書くと、throw する実装（T-03）と矛盾するコメントが残る。

T-03 の内容は正確であり実装上の問題はないが、interface の JSDoc が「passthrough」と書かれると将来の読者に誤解を与える。

fix: `managed: passthrough (returns unchanged jobState)` を `managed: throws (not implemented; see separate request)` または `managed: fail-closed throw (see T-03/D3)` に変更する。
