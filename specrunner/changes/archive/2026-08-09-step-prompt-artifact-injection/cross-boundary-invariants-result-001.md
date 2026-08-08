# Cross-Boundary Invariants Review — step-prompt-artifact-injection — iter 1

## Scope

**Reviewer**: cross-boundary-invariants  
**Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。  
**Files examined**: `src/adapter/shared/artifact-bundle.ts`, `src/adapter/claude-code/agent-runner.ts`, `src/adapter/codex/agent-runner.ts`, `tests/setup-fs-spy.ts`, `vitest.config.ts`, `src/adapter/codex/__tests__/resume-prompt-injection.test.ts`, `tests/adapter/codex/agent-runner.test.ts`, `tests/adapter/codex/agent-runner-transient-retry.test.ts`, `tests/unit/adapter/shared/artifact-bundle.test.ts`, `src/adapter/claude-code/__tests__/artifact-bundle-injection.test.ts`, `src/adapter/codex/__tests__/artifact-bundle-injection.test.ts`, `specrunner/changes/step-prompt-artifact-injection/design.md`, `specrunner/changes/step-prompt-artifact-injection/tasks.md`

---

## 検証結果サマリー

| 観点 | 結果 |
|------|------|
| claude-code adapter — タイムアウト開始順序 | ✅ (timer は buildArtifactBundle より後: L510-513 vs L462) |
| codex adapter — タイムアウト開始順序 | ⚠️ F-001 参照 |
| resume-prompt-injection 既存テストのバイト同一不変条件 | ⚠️ F-002 参照 |
| setup-fs-spy.ts のグローバル副作用 | ⚠️ F-003 参照 |
| node:fs/promises の双重モック競合（14 ファイル） | ✅ (test-file mock が precedence を持つ、全テスト通過確認) |
| managed adapter への非波及 | ✅ (共有層を経由しないインライン組み立て、変更なし) |
| --no-worktree モードの cwd 整合性 | ✅ (noWorktree でも cwd = リポジトリルート → change folder 到達可) |
| buildMessage 文言不変条件 | ✅ (src/core/step/ 配下の変更ゼロ確認) |
| step 別 artifact 可用性タイミング | ✅ ("その時点で存在するもの" のみ同梱 = 想定動作) |
| 合計サイズチェック前の全ファイル読み込み | ✅ (upper bound は 6 × 64KB ≈ 384KB、許容範囲) |

---

## F-001 [medium · fixable]

**タイトル**: codex adapter — `buildArtifactBundle` がタイムアウト timer 起動の後に実行される

**ファイル**: `src/adapter/codex/agent-runner.ts` L325–332

**背景**:  
codex adapter はコメント（L316–318）の通り、fake-timer テストの都合上 `setTimeout` を「any async work より前」に登録することを不変条件としている。この変更で `buildArtifactBundle`（6 件並列 `readFile`、最大 1 await）が `setTimeout` 登録の直後に追加された。

```
L325  const abortController = new AbortController();
L327  if (...) timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
L331  const baseMessage = step.buildMessage(state, stepCtx);
L332  const artifactBundle = await buildArtifactBundle(cwd, ctx.slug);  ← NEW
...
      thread.runStreamed(fullPrompt, { signal: abortController.signal })  ← agent 開始
```

**破られた不変条件**:  
`abortController.abort()` は `runStreamed`（agent 実行）が開始した後にのみ到達可能であるという前提。

`buildArtifactBundle` の await 中に fake timer が発火すると `abortController.abort()` が先に呼ばれ、`runStreamed` が呼ばれるより前に signal が aborted 状態になる。  
既存の fake-timer テスト（`tests/adapter/codex/agent-runner.test.ts:284`、`agent-runner-transient-retry.test.ts:222`）のモック実装は:

```typescript
opts?.signal?.addEventListener("abort", () => reject(new Error("...")));
```

`AbortSignal.addEventListener("abort", ...)` は既に aborted の signal には retroactive に呼ばれない（W3C仕様）。よって abort が `runStreamed` 呼び出し前に発火した場合、reject が呼ばれず `runPromise` がハングする。

**現在安全な理由**:  
両 fake-timer テストとも `cwd: "/fake/cwd"` を使用。存在しないパスへの `readFile` は ENOENT で即座に返るため、`buildArtifactBundle` は実質ゼロレイテンシで "``"` を返す。fake timer が発火する前に `runStreamed` が呼ばれる順序が保たれ、テストは通過している。

**リスク**:  
将来 fake-timer テストで実在の change folder（mkdtemp + artifacts）を使うケースが追加された場合、`buildArtifactBundle` の await が fake timer 発火より後に解決せず、abort が agent 開始前に呼ばれる競合が顕在化する。

**対処候補**（決定は実装者へ）:
- (A) `buildArtifactBundle` を `setTimeout` 登録の「前」に移す（claude-code adapter と同形にする）。fake-timer テスト側のコード変更不要。
- (B) `runStreamed` モックに `if (signal?.aborted) { reject(...); }` ガードを追加しておく（今後の fake-timer テスト向けの防御的パターン）。
- (C) 現状維持（cwd は常に fake/non-existent であることを前提）。ただし将来の fake-timer テスト追加者がこの制約を知らない場合のリスクを許容する。

claude-code adapter は `buildArtifactBundle`（L462）の後に timeout 登録（L510–513）を行っており、同問題を持たない。

---

## F-002 [low · decision-needed]

**タイトル**: `resume-prompt-injection.test.ts` のバイト同一不変条件が環境条件付きになった

**ファイル**: `src/adapter/codex/__tests__/resume-prompt-injection.test.ts` L143–157

**破られた不変条件**:  
変更前: `"leaves the main turn prompt byte-identical when resumePrompt is unset"` の通過条件は「`buildArtifactBundle` が存在しない」というコード上の事実で保証されていた。  
変更後: 通過条件は「`testCwd = os.tmpdir()/codex-resume-prompt-test` 以下に `specrunner/changes/test-slug/` が存在しない」という環境上の事実に依存する。

```typescript
// L93: 固定パス（mkdtemp ではない）
const testCwd = path.join(os.tmpdir(), "codex-resume-prompt-test");
```

追加されたコメント（L142）はこの前提を明示しているが、テスト setup でパスの non-existence を機械的に保証するコードはない。

**現在安全な理由**:  
`codex-resume-prompt-test` ディレクトリはテスト内でも CI でも作成されない。ENOENT → `buildArtifactBundle` は `""` を返し、プロンプトはバイト同一。

**リスク**:  
開発者がそのディレクトリ構造を手動作成した環境でテストを実行すると、`buildArtifactBundle` が非空を返し byte-identical assertion が失敗する。CI 環境では問題なし。

**対処候補**（決定は実装者へ）:
- (A) 現状維持（コメントで十分と判断）。
- (B) `testCwd` を `beforeAll` で `mkdtemp` に変更し、`afterAll` で削除。他のテストと同形の完全 isolation にする。

---

## F-003 [low · decision-needed]

**タイトル**: `setup-fs-spy.ts` が `artifact-bundle.test.ts` TC-010/TC-011 の実行可否を hidden dependency として支えている

**ファイル**: `vitest.config.ts` + `tests/setup-fs-spy.ts` + `tests/unit/adapter/shared/artifact-bundle.test.ts`

**破られた不変条件**:  
`vitest.config.ts` の `setupFiles` に追加した `tests/setup-fs-spy.ts` が `node:fs/promises` をグローバルにミュータブルオブジェクトでラップする（実関数を spread した plain object）。

`artifact-bundle.test.ts` TC-010（L238）と TC-011（L276）は `vi.spyOn(fs, "readFile")` を使用。これは ESM sealed namespace では `"Cannot spy on export"` で失敗するが、global setup のラップで解決している。テストファイル自体には `vi.mock("node:fs/promises")` が無く、グローバル setup への依存がファイル内から見えない。

**現在安全な理由**:  
全 724 テストファイルで通過確認済み。既存テストの `vi.mock("node:fs/promises", ...)` はテストファイルレベルのモックが setupFiles モックより優先されるため競合しない。

**リスク**:  
`vitest.config.ts` から `setupFiles` エントリを削除（または変更）すると、TC-010/TC-011 が `"Cannot spy on export"` でクラッシュするが、テストファイルを見ただけでは原因が分からない。

**対処候補**（決定は実装者へ）:
- (A) 現状維持（`setup-fs-spy.ts` のコメントに十分な説明あり）。
- (B) `artifact-bundle.test.ts` の先頭に `// Requires tests/setup-fs-spy.ts global setup for vi.spyOn(fs, "readFile")` コメントを追加し、依存を明示する。

---

## Observations（非ブロッキング）

### O-001: `design.md` が `</artifact>` リテラルを含む

`specrunner/changes/step-prompt-artifact-injection/design.md` の D6 セクション（コードフェンス内 L125–131）に `</artifact>` リテラルが存在する。このジョブの後続 step で `design.md` が bundle に含まれると、XML 風タグ構造が壊れる。

design.md:139–142 に「既知リスク」として明記済み。LLM agent はコードフェンスの文脈から内容を正確に解釈でき、必要なら `Read` で取得もできるため、機能的破壊は発生しない（fail-open）。対処済みのため Findings に含めない。

---

## 判定根拠（evidence）

| 分類 | 件数 |
|------|------|
| checked（実際に検証した項目） | 10 |
| skipped（スコープ内だが未検証） | 0 |
| unverified（未確認として宣言） | 0 |
