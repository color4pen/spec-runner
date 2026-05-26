# ADR-20260526: test isolation — compile-time 削除 + runtime globalSetup による二重防御

**Date**: 2026-05-26
**Status**: accepted

## Context

dogfood 中の `job ls` で `.specrunner/jobs/` 配下に test 由来の fixture が 46 件混入していることが判明した。原因は `tests/helpers/store-factory.ts` の `defaultStoreFactory` が `process.cwd()` を repoRoot として使うため、test 経由で `StepExecutor` や `PipelineDeps` に渡されると prod の `<repoRoot>/.specrunner/jobs/` に state file が直接書き込まれていた。

現時点の test code は多くが `makeStoreFactory(tempDir)` を使う形に移行していたが、`defaultStoreFactory` が削除されていないため以下の問題が構造的に残っていた:

1. **意図的でない使用**: 開発者が `makeStoreFactory(tempDir)` の代わりに `defaultStoreFactory` を渡すだけで再発できる
2. **静的検出不可**: `defaultStoreFactory` 自体は valid な export のため、使用しても型エラーにならない
3. **既存汚染**: 過去の書き込みによる 46 件の fixture が prod jobs dir に残存している

## Decision

### D1: `defaultStoreFactory` を削除し `makeStoreFactory` を唯一の test factory にする

`tests/helpers/store-factory.ts` から `defaultStoreFactory` export を完全に削除する。`makeStoreFactory(tempDir)` が唯一の test factory となる。

`defaultStoreFactory` を import しているコードは TypeScript compile error になるため、使用しようとした時点で即座に検出される（runtime より前）。

**「guard して失敗させる」ではなく「削除して存在させない」を選んだ理由**: `defaultStoreFactory` を残して内部で guard する設計（例: `VITEST` 環境変数を検出して temp dir にリダイレクト）は暗黙の挙動を作り出し、デバッグ時に「なぜ違うパスに書いているのか」が不明瞭になる。削除すれば判断する場面が消える。

### D2: 14 test file を `makeStoreFactory(tempDir)` に移行する

`defaultStoreFactory` を使っていた 14 test file を `makeStoreFactory(tempDir)` に移行する。各 test file は `beforeEach` で `fs.mkdtemp()` + `afterEach` で `fs.rm()` のパターンを持つ。

### D3: vitest globalSetup で prod path への書き込みを検出する safety net を追加する

`tests/global-setup.ts` を新規作成し、`vitest.config.ts` の `globalSetup` に登録する。

- `setup()`: test suite 実行前に `.specrunner/jobs/` のファイルリストをスナップショット
- `teardown()`: 実行後との差分を検出し、新規ファイルが増えていたら error を throw

D1 の compile-time guard は `defaultStoreFactory` 経由のパスを塞ぐが、`makeStoreFactory(process.cwd())` や `new JobStateStore(id, process.cwd())` を直接書く経路は防ぎきれない。D3 はこれを runtime で捕捉する二重防御として機能する。

### D4: 非 UUID v4 形式のファイルを test 由来 fixture として識別・削除する

prod の `.specrunner/jobs/` 内のファイルを以下の基準で分類する:

- **UUID v4 形式** (`xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx.json`): 本物の job → 維持
- **非 UUID 形式**: test 由来 → 削除

`JobStateStore.create()` は `randomUUID()` で jobId を生成するため、prod で作成された job は必ず UUID v4 形式になる。一方 test で hardcode された jobId は `tc-cap-001-job`・`err-code-test-job`・`test-pipeline-job` 等の人間可読文字列であり、このパターンで確実に分類できる。

### D5: prod code (`src/`) には test 知識を入れない

`JobStateStore` constructor 内で `VITEST` 環境変数を検出して挙動を変える実装は採用しない。prod code が test 環境を知ることは関心の分離を破壊する。isolation は test infrastructure 側（test helper / globalSetup）で完結させる。

## Alternatives Considered

### Alternative 1: `defaultStoreFactory` 内部で `VITEST` 環境変数を検出して temp dir にリダイレクト

```ts
export const defaultStoreFactory = makeStoreFactory(
  process.env.VITEST ? os.tmpdir() : process.cwd()
);
```

- **Pros**: 既存コードの変更を最小化できる
- **Cons**: 暗黙の挙動。テスト環境でなぜ違うパスに書かれるのかが不明瞭。`VITEST` 環境変数を誤って設定した prod 環境での誤動作リスク。debuggability の低下
- **Why not**: 「判断する場面を消す」原則と逆行する。削除の方がシンプル

### Alternative 2: `JobStateStore` constructor 内に test 環境検出を入れる

```ts
class JobStateStore {
  constructor(jobId: string, repoRoot = process.env.VITEST ? os.tmpdir() : process.cwd()) { ... }
}
```

- **Pros**: あらゆる経路での prod path 書き込みを防止できる
- **Cons**: prod code に test 知識が侵入する。prod/test 以外の環境（CI の prod 相当実行など）での予期しない挙動
- **Why not**: D5 の方針と矛盾。test infrastructure で完結させるべき問題

### Alternative 3: CI でのみ前後 diff assert を行う

- **Pros**: 実装コストが低い
- **Cons**: local 開発者が気づかないまま commit・push してから発覚する。feedback loop が長い
- **Why not**: D3 の vitest globalSetup により local でも即座に検出できる

### Alternative 4: lint rule (ESLint/custom) で `defaultStoreFactory` import を禁止する

- **Pros**: compile より前の静的検出
- **Cons**: AST 解析の実装コストが高い。false positive のリスク。lint は別途セットアップが必要
- **Why not**: `defaultStoreFactory` を削除する方がシンプルで確実。lint rule は存在するものを禁止するためのもの

## Consequences

### Positive

- `defaultStoreFactory` を import しようとした時点で compile error になり、開発者が意図せず prod path に書くことが構造的に不可能になる
- vitest globalSetup により、compile-time guard をすり抜けた経路（`makeStoreFactory(process.cwd())` 等）も runtime で検出される
- `bun run test` が green なら prod path への書き込みがないことが保証される（test suite 実行のたびに自動検証）
- prod code (`src/`) には test 知識が一切入らないため、関心の分離が維持される

### Negative

- 14 test file の一括移行が必要になる（D2）。ただし移行パターンは `beforeEach`/`afterEach` の定型コードのみ
- globalSetup は `.specrunner/jobs/` が存在しない環境では ENOENT を黙殺するため、権限エラー等の別種の I/O 障害もサイレントになる可能性がある（将来的な改善候補: `err.code !== 'ENOENT'` で再 throw）

### Known Debt

- `.specrunner/jobs/` は `.gitignore` で除外されているため、fixture cleanup は PR diff に現れず再現性を PR で保証できない。他開発者環境に残存する非 UUID ファイルは各自で削除が必要
- `globalSetup` の teardown において ENOENT 以外のエラーが黙殺される（review-feedback-001 [info] として記録済み）

## References

- Request: `specrunner/changes/test-isolation-guard/request.md`
- Design: `specrunner/changes/test-isolation-guard/design.md`
- Delta spec: `specrunner/changes/test-isolation-guard/specs/test-isolation-guard/spec.md`
- Related: `specrunner/adr/2026-05-22-job-state-store-di.md`（`storeFactory` DI 導入の背景）
