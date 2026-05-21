# anthropic-key-present / anthropic-key-valid を managed-key-* に rename する

## Meta

- **type**: refactoring
- **slug**: managed-key-present-rename
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen

## 背景

PR #238 で `anthropic.apiKey` config field を廃止し、managed runtime の API key を `SPECRUNNER_API_KEY` env var に統一した。これに伴い check 実装は env var の存在チェックに変更されたが、ファイル名と export 名は `anthropic-key-present` / `anthropic-key-valid` のまま残っている。

check の `name` フィールドはすでに `"managed/api-key-present"` / `"managed/api-key-valid"` で正しく更新済みのため**挙動への影響はない**。純粋な命名負債。

関連 issue: #239

## 目的

実装内容 (managed runtime の env var チェック) と命名 (`anthropic-*`) の乖離を解消し、ファイル名・symbol 名を `managed-key-*` に統一する。

## 設計判断

1. **挙動変更なし**: check の `name` フィールド (`managed/api-key-*`) も export 名も呼び出し側 (`src/core/doctor/checks/index.ts`) で参照されるだけ。rename は内部 refactoring に閉じる
2. **2 ファイル同時 rename**: `config/anthropic-key-present.ts` と `auth/anthropic-key-valid.ts` は同じ命名乖離なので同一 request で扱う (#239 提案通り)
3. **spec 影響なし**: doctor check の `name` 文字列 (= spec contract) は変更しないので、`specrunner/specs/` 側の更新は不要 (refactoring type で正当化)

## 要件

### 1. file rename

- `src/core/doctor/checks/config/anthropic-key-present.ts` → `src/core/doctor/checks/config/managed-key-present.ts`
- `src/core/doctor/checks/auth/anthropic-key-valid.ts` → `src/core/doctor/checks/auth/managed-key-valid.ts`

### 2. test file rename

- `tests/core/doctor/checks/config/anthropic-key-present.test.ts` → `tests/core/doctor/checks/config/managed-key-present.test.ts`
- `tests/core/doctor/checks/auth/anthropic-key-valid.test.ts` → `tests/core/doctor/checks/auth/managed-key-valid.test.ts`

### 3. symbol rename

- `anthropicKeyPresentCheck` → `managedKeyPresentCheck`
- `anthropicKeyValidCheck` → `managedKeyValidCheck`

### 4. 参照箇所更新

- `src/core/doctor/checks/index.ts` の import / re-export (L21, L28, L72-73, L99, L102) を新名に更新
- `tests/core/doctor/checks/config/anthropic-key-present.test.ts` 内の import / describe 文字列を新名に追従
- `tests/core/doctor/checks/auth/anthropic-key-valid.test.ts` 内の import / describe 文字列を新名に追従
- `tests/unit/remove-session-timeout.test.ts:188-191` の path 文字列および同箇所の `it()` description 文字列 ("anthropic-key-valid.ts に...") を `managed-key-valid.ts` に更新

### 5. check name (= spec contract) は変更しない

`check.name` フィールド (`"managed/api-key-present"` / `"managed/api-key-valid"`) は外部契約として既に正しいので**触らない**。

## スコープ外

- doctor 全体の命名規約整理 (他に `anthropic-*` 残骸があるなら別 request)
- check name 文字列の変更
- spec 文書 (`specrunner/specs/`) の更新
- `specrunner/requests/active/credentials-provider-parity/request.md` の path 参照更新 (L74 が rename 対象 2 ファイルを直接参照しているが、本 request 完了後に当該 request 側で path 参照を更新する段取り。本 request では他 request の内容を書き換えない)

## 受け入れ基準

- [ ] `src/core/doctor/checks/config/managed-key-present.ts` が存在し、旧 path は削除されている
- [ ] `src/core/doctor/checks/auth/managed-key-valid.ts` が存在し、旧 path は削除されている
- [ ] export 名が `managedKeyPresentCheck` / `managedKeyValidCheck` に変わっている
- [ ] `src/core/doctor/checks/index.ts` が新 path / 新 symbol を import している
- [ ] test file 2 件が rename され、内部の import / describe も追従している
- [ ] `tests/unit/remove-session-timeout.test.ts` の path 参照が新名を指している
- [ ] `bun run typecheck && bun run test` が green
- [ ] `grep -rn "anthropicKeyPresentCheck\|anthropicKeyValidCheck\|anthropic-key-present\|anthropic-key-valid" src/ tests/` が 0 件 (CLAUDE.md などのドキュメント参照は対象外)

## Workflow Options

- enabled: []
