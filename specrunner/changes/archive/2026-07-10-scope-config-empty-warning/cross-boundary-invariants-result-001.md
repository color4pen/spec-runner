# Cross-Boundary Invariants Review: scope-config-empty-warning

- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: approved

## Scope

`git diff main...HEAD` — 2 src files changed:
- `src/core/pipeline/scope-warning.ts` (new, +64 lines)
- `src/core/command/runner.ts` (+7 lines at Step 5)

## Review Methodology

変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。各不変条件を 1 つずつ追跡した。

---

## Findings

### SW-CBV-001 — エラーハンドリング境界のシフト (Informational)

**不変条件**: `buildPipelineForJob` 到達後に発生する例外（`getPipelineDescriptor` の "Unknown pipeline id" throw を含む）はすべて pipeline try-catch で捕捉され、teardown・ログクローズ・状態永続化が行われてから exit code 1 で終了する。

**変化**: `scopeConfigWarningForJob` は pipeline try-catch の**外側**に置かれている。`getPipelineDescriptor(pipelineId)` は未知の pipelineId で throw する。この throw が pipeline try-catch に入らず外側の `try...finally` を通り、CLI 呼び出し元（`src/cli/run.ts` / `src/cli/resume.ts` の `catch(err) { logError; return 1 }`）で捕捉される。

**差分の影響**:
- `teardown()` が呼ばれない（cleanup handle 漏れ）
- `closeVerboseLog()` / `closePipelineLog()` が呼ばれない（fd 漏れの可能性）
- ジョブ状態が `failed` として永続化されない
- `keepAlive.release()` は finally により正しく実行される
- ユーザーには error ログ + exit code 1 として正しく見える

**実用影響の評価**: トリガー条件は `jobState.pipelineId` に未登録値が入ること。`getPipelineId()` は `undefined` を "standard" にフォールバックするため null ケースは安全。未知の pipelineId が state に入るのはファイル破損のみであり、現実的に発生しない。発生しても `buildPipelineForJob` 内の同一パスでも同じ例外が throw されるため、変更前も変更後も「ユーザーには error + exit 1」に見える。

**severity**: informational — ニアゼロの発生確率、機能的な結果は同等。fix は不要。

---

### SW-CBV-002 — `resolvePipelineForbiddenSurfaces` カバレッジギャップ (Informational)

**不変条件**: `resolvePipelineForbiddenSurfaces` は現在 `pipelineId === "fast"` のみ config.pipeline.fast に配線され、他は常に `[]` を返す。

**変化**: `scopeConfigWarningForJob` は `applyScopeConfig` 経由でこの resolver を使う。将来 "fast" 以外の pipeline ID で `permissionScope` を宣言した descriptor が registry に追加されると、その pipeline の forbidden は resolver 上常に `[]` となり warning が常時発火する——repo admin が config でどの値を設定しても抑止できない。

**評価**: design.md Risks & Trade-offs セクションに「resolvePipelineForbiddenSurfaces は現状 fast のみ配線. 将来 fast 以外で permissionScope を宣言する profile を registry に追加すると、その profile の forbidden は resolver 上常に空となり warning が常時発火する。これは『resolver 配線が未実装』という別 request の課題であり、本変更の判定（一般形）はそのままで正しい」と明示されている。現在の registry は fast のみが permissionScope を持ち、fast には resolver 配線済みのため影響なし。

**severity**: informational — 将来のリスクとして設計文書に正確に記載済み。現時点での fix は不要。

---

## Invariants Confirmed Not Violated

| 不変条件 | 状態 |
|---|---|
| `applyScopeConfig` の pure 変換契約（permissionScope なし → 参照同一返却、副作用なし） | ✅ 変更なし。当該ファイルは編集されていない |
| `scopeConfigEmptyWarning` の判定が config 解決前ではなく解決後 descriptor に対して行われる | ✅ `scopeConfigWarningForJob` が `applyScopeConfig` 後の descriptor を渡す |
| config の一致（warning 判定と pipeline 実行が同じ config を使う） | ✅ `prepare()` が返す `config` → `scopeConfigWarningForJob(jobState, config)` と `buildDeps(config, ...)` → `deps.config` が同一オブジェクト |
| 1 run 1 warning の構造的保証 | ✅ emission は `execute()` の Step 5 に 1 箇所のみ。`buildPipelineForJob` 内にはない |
| 標準・design-only pipeline での挙動不変 | ✅ `scopeConfigEmptyWarning` は `permissionScope === undefined` で即 null を返す |
| forbidden ≥ 1 で warning なし | ✅ `forbidden.length > 0` で null を返す |
| quiet モードでの warning 抑止 | ✅ `logWarn()` は `isLevelEnabled("default")` を確認。quiet では `LEVEL_ORDER["quiet"](0) < LEVEL_ORDER["default"](1)` で抑止 |
| exit code・状態遷移への無影響 | ✅ warning パスに return / throw なし |
| import 方向（`command → pipeline`、循環なし） | ✅ 既存パターンと同型。`scope-warning.ts` → `resolve-scope`, `registry`, `pipeline-id`, `schema` は既存 import グラフ内 |
| `runner.ts` の既存テスト mock との整合（`vi.mock("../pipeline/index.js")`） | ✅ `scope-warning.ts` を direct import（index 経由ではない）のため mock 衝突なし |
| `buildPipelineForJob` に渡る descriptor の integrity（composeReviewerDescriptor まで保全） | ✅ `scopeConfigWarningForJob` は descriptor を参照のみ。`buildPipelineForJob` は独立して同じ解決フローを実行 |
