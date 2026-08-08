# Cross-Boundary Invariants Review — step-prompt-artifact-injection — iter 2

## Scope

**Reviewer**: cross-boundary-invariants  
**Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。  
**Files examined**: `src/adapter/codex/agent-runner.ts`, `src/adapter/claude-code/agent-runner.ts`, `src/adapter/shared/artifact-bundle.ts`, `src/adapter/codex/__tests__/resume-prompt-injection.test.ts`, `src/adapter/codex/__tests__/artifact-bundle-injection.test.ts`, `src/adapter/claude-code/__tests__/artifact-bundle-injection.test.ts`, `tests/unit/adapter/shared/artifact-bundle.test.ts`, `tests/setup-fs-spy.ts`, `vitest.config.ts`, `tests/adapter/codex/agent-runner.test.ts`, `tests/adapter/codex/agent-runner-transient-retry.test.ts`

---

## iter 1 findings の解消状況

| Iter-1 finding | 対処 | 結果 |
|----------------|------|------|
| F-001 [medium] codex abort race — fake-timer hang | `executeTurn` 内で `runStreamed` 呼び出し後に `signal.aborted` を確認して即 throw。hanging promise は await しないため hang 解消。 | ✅ 解消 |
| F-002 [low] resume-prompt-injection 固定パス | `testCwd` を `mkdtemp` + `beforeAll/afterAll` に変更（`codex-resume-prompt-test-<random>`）。 | ✅ 解消 |
| F-003 [low] setup-fs-spy 隠れ依存 | `artifact-bundle.test.ts` 冒頭に `NOTE: TC-010 and TC-011 use vi.spyOn(fs, 'readFile')…` 説明コメントを追加。 | ✅ 解消 |

---

## 検証結果サマリー（iter 2 新規検証）

| 観点 | 結果 |
|------|------|
| `executeTurn` の `signal.aborted` チェックと外部 retry 機構の整合 | ✅ (`isTransientError` / `resumeFallback` はいずれも `signal.aborted` ガード付き) |
| 中断後の `streamedResult` が unhandled rejection にならないか | ⚠️ F-001 参照 |
| claude-code adapter のタイムアウト開始順序 | ✅ (`setTimeout` は `buildArtifactBundle` の **後** L510–513 で登録、race 問題なし) |
| `INPUT_ARTIFACT_NAMES` と `CANONICAL_DOC_NAMES` の乖離 | ✅ 意図的（`rules.md` は入力 artifact だが canon binding 対象外、設計一致） |
| 既存 fake-timer テストの callCount 不変条件 | ✅ (`runStreamed` が先に呼ばれるため `callCount` は従来どおり 1 回インクリメント) |
| prompt 組み立て順序不変条件（baseMessage→artifact→resume→additional→directive）| ✅ 両 adapter で同形 |
| managed adapter への非波及 | ✅（共有層を経由せず、変更なし） |
| `setup-fs-spy.ts` と `vitest.config.ts` の整合 | ✅（`setupFiles` に登録あり、テストファイルに依存コメントあり） |

---

## F-001 [low · fixable]

**タイトル**: `executeTurn` が `streamedResult` を await せずに破棄した場合、Codex SDK が後発で reject すると unhandled Promise rejection になる

**ファイル**: `src/adapter/codex/agent-runner.ts` L385–389

**背景**:  
iter 1 の F-001 に対し、`executeTurn` 内で `runStreamed` を先に呼んだ後にシグナルを確認する以下のパターンが導入された:

```typescript
const streamedResult = thread.runStreamed(prompt, opts);  // (1) 先に呼ぶ
if (opts.signal?.aborted) {                                 // (2) シグナル確認
  throw opts.signal.reason ?? new Error("The operation was aborted");
}
const { events } = await streamedResult;                    // (3) await
```

(2) が true のとき、(3) は実行されず `streamedResult` は `.catch()` なしで破棄される。

**破られた不変条件**:  
「adapter が呼び出した非同期 I/O の Promise は必ず await または `.catch()` でハンドルされる」という暗黙の前提。  
Bun の `unhandledRejection` 挙動は Node.js 15+ と同様で、未ハンドルの rejction はプロセスを exit code 1 で終了させる。

**リスク条件**（すべてを同時に満たす必要がある）:

1. `timeoutMs` が設定されており、かつ `buildArtifactBundle` の I/O（最大 6 ファイルの parallel readFile）中にタイムアウトが発火する — 実用的タイムアウト（分～時間単位）では発生しない
2. Codex SDK の `runStreamed` が、既に aborted な signal を受け取った際に Promise を非同期 reject する — SDK がシグナルをチェックしない限り発生しない
3. 同一 process 内で rejection が発火する前にプロセスが exit しない

**現在安全な理由**:  
- テストはすべて `cwd: "/fake/cwd"` → `buildArtifactBundle` は ENOENT で即座に `""` を返すため、signal は (2) の時点で aborted でない。fake-timer テストでも同様。  
- 本番環境での `buildArtifactBundle` I/O は SSD なら < 10ms、実用タイムアウトは分単位以上のため、race window は事実上ゼロ。

**修正方法**（決定は実装者へ）:  
(A) abort 時に `streamedResult` に `.catch(() => {})` を付けて rejection を抑制する:

```typescript
const streamedResult = thread.runStreamed(prompt, opts);
if (opts.signal?.aborted) {
  streamedResult.catch(() => {}); // suppress potential SDK rejection
  throw opts.signal.reason ?? new Error("The operation was aborted");
}
const { events } = await streamedResult;
```

(B) 現状維持（race window が事実上ゼロであり、SDK がシグナルを正しくハンドルすること前提）。

---

## Observations（非ブロッキング）

### O-001: iter-1 F-001 の修正コメントに軽微な記述ズレ

**ファイル**: `src/adapter/codex/agent-runner.ts` L325

```
// executeTurn calls signal.throwIfAborted() before invoking runStreamed,
```

実際のコードは `runStreamed` を**先に呼んでから** `opts.signal?.aborted` をチェックする（`throwIfAborted()` ではなく `if (opts.signal?.aborted) { throw ... }`）。  
`executeTurn` 内の L378–384 コメントは正確に実装を説明している。L325 のコメントは「before invoking runStreamed」が誤りで、機能的影響はないが将来の読者が混乱する可能性がある。

---

## 判定根拠（evidence）

| 分類 | 件数 |
|------|------|
| checked（実際に検証した項目） | 8 |
| skipped（スコープ内だが未検証） | 0 |
| unverified（未確認として宣言） | 0 |
