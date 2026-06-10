# Tasks: secrets-mask-openai

## T-01: MASK_PATTERNS に OpenAI 系パターンを追加し prefix 抽出を修正する

対象: `src/logger/stdout.ts`

- [x] `MASK_PATTERNS` 配列に以下の 3 パターンを既存 3 パターンの後に追記する
  - `/\bsk-proj-[A-Za-z0-9_-]+/g`
  - `/\bsk-svcacct-[A-Za-z0-9_-]+/g`
  - `/\bsk-[A-Za-z0-9_-]{20,}/g`
- [x] `maskSensitive` 内の prefix 抽出を以下に変更する（`_` が存在しない場合に `-` で fallback）
  ```ts
  const sep = match.indexOf("_") !== -1 ? match.indexOf("_") : match.lastIndexOf("-");
  const prefix = match.slice(0, sep + 1);
  return `${prefix}...`;
  ```

**Acceptance Criteria**:
- `MASK_PATTERNS` が合計 6 エントリになっている
- `maskSensitive("sk-proj-abcdefghijklmnopqrstu")` → `"sk-proj-..."` を返す
- `maskSensitive("sk-svcacct-abcdefghijklmnopqrstu")` → `"sk-svcacct-..."` を返す
- `maskSensitive("sk-abcdefghijklmnopqrstu")` → `"sk-..."` を返す（汎用）
- `maskSensitive("sk-ant-api03-abcdef")` → `"sk-ant-api03-..."` を返す（既存挙動維持）
- `maskSensitive("sk-short")` はマスクされない（汎用パターンの 20 文字下限）

## T-02: maskSensitive のユニットテストを追加する

対象: `src/logger/__tests__/mask-sensitive.test.ts`（新規作成）

- [x] vitest を使って `maskSensitive` をインポートし以下のケースを網羅するテストを書く
  - 既存 3 パターン（`sk-ant-`、`gh[oprsu]_`、`github_pat_`）が正しくマスクされること
  - `sk-proj-` / `sk-svcacct-` / 汎用 `sk-`（≥20 文字）が短縮形に置換されること
  - `sk-short`（< 20 文字）はマスクされないこと
  - 複数キーが混在する文字列で全てがマスクされること
  - キーを含まない文字列はそのまま返ること

**Acceptance Criteria**:
- `bun run test` でこのファイルの全テストが green
- 既存テスト（`log-retention.test.ts`、`pipeline-logger.test.ts`）が無変更で green

## T-03: typecheck && test が green であることを確認する

- [x] `bun run typecheck` が 0 exit で完了すること
- [x] `bun run test` が 0 exit で完了すること

**Acceptance Criteria**:
- 両コマンドが正常終了する
