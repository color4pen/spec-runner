# Review Feedback 003

- **verdict**: needs-fix

## Summary

iter-2 の 5 件の指摘のうち 4 件が修正済み（FileConfigStore.load / TC-03 spec alignment / CLI audit / TC-13 array test）。ただし iter-2 [major] の ResumeCommand 修正が **不完全** のまま残存している（`loadConfig(cwd)` は `cwd` をそのまま渡しているが `resolveRepoRoot` を経由していない）。それ以外のコア実装（deepMergeConfig / 6-level resolution / byRequestType validation / requestType 伝搬）はすべて設計通りで、`bun run typecheck && bun run test`（2899 tests）も green。

---

## Findings

### [minor] [correctness] `resume.ts:202` — `loadConfig(cwd)` が resolveRepoRoot を経由しない

**File**: `src/core/command/resume.ts:202`

**Description**:
iter-2 の指摘「`ResumeCommand.prepare()` が `loadConfig()` を repoRoot なしで呼ぶ」に対して、`loadConfig(cwd)` へ変更されたが、`cwd = this.options.cwd ?? process.cwd()`（line 70）であり、これはユーザーの作業ディレクトリであって repo root とは限らない。

`bootstrap.ts` および `preflight.ts` は:
```typescript
const repoRoot = await resolveRepoRoot(cwd);
const config = await loadConfig(repoRoot ?? undefined);
```
と 2 ステップで解決しているのに対し、`resume.ts` は `resolveRepoRoot` を介さず `cwd` を直接渡している。

**影響**: ユーザーが `specrunner job resume` をリポジトリのサブディレクトリから実行した場合、`<subdir>/.specrunner/config.json` が探索対象になり、project local config が見つからず user global のみで動作する（project local overlay がサイレントに無視される）。repo root から実行する一般的なケースでは問題なし。

**Fix**: 既存の `loadConfigWithOverlay` helper が正しいパターンを実装しているのでそれを使う:
```typescript
// src/core/command/resume.ts:202
config = await loadConfigWithOverlay(cwd);
// import を追加: import { loadConfigWithOverlay } from "../../cli/load-config-with-overlay.js"
```
または直接:
```typescript
const repoRoot = await resolveRepoRoot(cwd);
config = await loadConfig(repoRoot ?? undefined);
```

なお `bootstrap(cwd, repo)` がすでに正しい repoRoot で config を load しているため、`prepare()` での二重 load を削除して `bootstrap()` の結果を注入する設計変更も選択肢として有効。

---

### [nit] [test-coverage] TC-26 (model: 123 非 string) の専用テストが存在しない

**File**: `tests/config/schema.test.ts`

**Description**:
test-cases.md TC-26（must）は `byRequestType` 内の `model: 123`（非 string）で CONFIG_INVALID になることを要求しているが、`schema.test.ts` の byRequestType セクションには空文字列 key / 空文字列 model / unknown model のテストはあるが `model: 123` の明示的なテストはない。コードの `typeof model !== "string"` チェックが non-string を正しく弾くので動作自体は正しいが、テストで明示されていない。verification tool の「31/31 must covered」は空文字列テストと同一コードパスを通ることで充足とみなしていると推定。

**Fix**: 以下を追加:
```typescript
it("throws CONFIG_INVALID when byRequestType entry model is not a string (number)", () => {
  const raw = makeMinimalRawConfig({
    steps: {
      "code-review": {
        byRequestType: {
          "spec-change": { model: 123 },
        },
      },
    },
  });
  expect(() => validateConfig(raw as never)).toThrow(/CONFIG_INVALID/);
  expect(() => validateConfig(raw as never)).toThrow(/code-review.*byRequestType.*spec-change.*model/);
});
```

---

### [nit] [docs] managed runtime で `byRequestType.model` がサイレント無視される旨が README に未記載

**File**: `README.md`（project local config の設定例セクション）

**Description**:
iter-2 で指摘済み（未対応）。`managed runtime` では step model は agent definition 側で管理されるため、config の `byRequestType.model` / `model` field は無視される。README や project.md の設定例セクションに一文ないと、managed runtime ユーザーが設定しても効かない理由がわからない。

**Fix**: README の byRequestType 設定例の近傍に:
> **Note**: managed runtime (`runtime: "managed"`) では `model` および `byRequestType.model` は無視されます。モデルは agent definition 側で管理されます。

を追加。

---

### [nit] [test-cases] TC-10 が存在しない `provider` フィールドを参照している

**File**: `specrunner/changes/project-config-overlay/test-cases.md:75-78`

**Description**:
iter-2 で指摘済み（未対応）。TC-10 の GIVEN が `base.provider = "claude"` と `overlay.provider = "openai"` を使っているが `SpecRunnerConfig` に `provider` フィールドはない。実テストでは `runtime` フィールドで primitive override を検証しているので動作上の問題はないが、test-cases.md と実テストが乖離している。

**Fix**: TC-10 の GIVEN を `base.runtime = "local"` / `overlay.runtime = "managed"` に書き換え。

---

## iter-2 指摘の対応状況

| # | 指摘 | 状況 |
|---|------|------|
| iter-2 major | `ResumeCommand.prepare()` が `loadConfig()` を repoRoot なしで呼ぶ | 部分修正（`cwd` 渡しは追加されたが `resolveRepoRoot` を経由しない） |
| iter-2 minor | `FileConfigStore.load` の repoRoot 欠落 | ✅ 修正済み |
| iter-2 minor | TC-03 spec alignment（部分 config → CONFIG_INVALID の不整合） | ✅ test-cases.md を実装挙動に合わせて更新済み |
| iter-2 minor | CLI entry audit（managed.ts / command-registry.ts で `loadConfigWithOverlay` 未使用） | ✅ `loadConfigWithOverlay` helper を追加し両ファイルで使用 |
| iter-2 minor | TC-13 array 置換のテスト不在 | ✅ merge.test.ts に追加済み |
| iter-2 nit | TC-10 の `provider` フィールドが schema に存在しない | 未対応 |
| iter-2 nit | managed runtime で model 無視される旨が README に未記載 | 未対応 |
| iter-2 nit | `query-one-shot.ts` に `requestType` 未伝搬 | 未対応（仕様上許容範囲） |

## Test Coverage vs test-cases.md（must）

| カテゴリ | must TC | カバー状況 |
|---------|---------|-----------|
| overlay-load (TC-01〜07) | 7/7 | ✅ covered |
| deep-merge (TC-09〜14) | 6/6 | ✅ covered（TC-13 追加済み） |
| byRequestType-resolution (TC-15〜20) | 6/6 | ✅ covered |
| validation (TC-23〜29) | 7/7 | ✅ covered（TC-26 は同一コードパスで充足、明示テスト欠落は nit） |
| cli-early-validation (TC-33, 35) | 2/2 | ✅ covered（ただし TC-35 の resume 経路は minor 指摘あり） |
| regression (TC-36〜38) | 3/3 | ✅ green |

## Verdict 詳細

resume.ts の修正は「意図は正しいが実装が不完全」——`cwd` を直接 `loadConfig` に渡しており `resolveRepoRoot` を経由していない。影響範囲はサブディレクトリから resume する場合のみで、project local overlay がサイレントに無視される。Fix は `loadConfigWithOverlay(cwd)` に 1 行置換するだけで完了する。コア実装の品質は高く、needs-fix は minor 1 件のみ。
