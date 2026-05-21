# Code Review: hardcode-github-client-id — Iteration 1

- **verdict**: approved
- **reviewer**: code-review agent
- **date**: 2026-05-16

---

## Summary

仕様に従い `getGithubClientId()` の throw を除去し hardcode fallback を追加する変更。構造的には正しく実装されており、must テストケースは全て網羅、verification は 1903 テスト全 pass。

---

## Findings

### [INFO] placeholder client_id は production では機能しない

**File**: `src/auth/constants.ts:8`

```ts
const GITHUB_CLIENT_ID = "Ov23liXXXXXXXXXX"; // TODO: replace with actual SpecRunner OAuth App client_id
```

tasks.md の完了注記・request.md スコープ外節の両方で明示されている既知の TODO。この PR のスコープは "throw を除去して fallback ロジックを修正する" であり、実際の OAuth App client_id の提供は別工程。記録として残す。

`SPECRUNNER_GITHUB_CLIENT_ID` が unset のまま本番環境で使うと GitHub Device Flow が失敗する。placeholder を実際の値に差し替えた後に本 PR は production ready となる。

---

### [INFO] stale comment in github-device.test.ts

**File**: `tests/github-device.test.ts:12-14`

```ts
// The Device Flow client_id is fail-fast required (no placeholder fallback).
// Tests provide a stub value; individual tests that exercise env-missing
// behavior delete it locally and restore via afterEach.
```

1行目のコメントが旧動作（throw する仕様）のまま残っている。本 PR で fallback が追加されたため「no placeholder fallback」は虚偽になっている。`beforeEach` でスタブを設定する意図は変わらないが、コメント理由が古い。

---

### [INFO] prefix assertion はGitHub新形式OAuthアプリを前提とする

**File**: `tests/auth/constants.test.ts:12,26`

```ts
expect(result).toMatch(/^Ov23li/);
```

`Ov23li` は GitHub新形式OAuthアプリ (GitHub App 発行) の client_id 先頭6文字として一般的。旧形式 (`Iv1.x`) の OAuth App を使う場合はこの正規表現が実際の値と食い違いテストが落ちる。実際の OAuth App 作成時に client_id フォーマットを確認してテストを合わせること。

---

## Test Coverage

| Test Case | Priority | 対応テスト | 判定 |
|---|---|---|---|
| TC-001: env unset → hardcode 返却 | must | `tests/auth/constants.test.ts` | ✅ |
| TC-002: env set → env 値返却 | must | `tests/auth/constants.test.ts` | ✅ |
| TC-003: env 空文字 → hardcode fallback | must | `tests/auth/constants.test.ts` | ✅ |
| TC-004: env unset で throw しない | must | TC-001 に内包（return 確認で throw なし） | ✅ |
| TC-005: doctor env unset → pass + built-in message | must | `tests/core/doctor/checks/env/github-client-id.test.ts` | ✅ |
| TC-006: doctor env unset → warn でない | must | TC-005 に内包 | ✅ |
| TC-007: doctor env set → pass (回帰) | should | `tests/core/doctor/checks/env/github-client-id.test.ts` | ✅ |
| TC-008: typecheck clean | must | verification-result.md (exit 0) | ✅ |
| TC-009: test suite green | must | verification-result.md (1903 passed) | ✅ |
| TC-010: GITHUB_CLIENT_ID_MISSING 残存 | could | `src/errors.ts:31` grep 確認 | ✅ |

---

## 実装品質

- `getGithubClientId()` の `|| GITHUB_CLIENT_ID` による fallback は意図通り（空文字も hardcode に落ちる）
- doctor check は `hint` フィールドを含まない返値になっており、TC-005 の AND 条件を満たす
- `tests/auth/constants.test.ts` は `afterEach` で env をクリーンアップしており isolation 良好
- `GITHUB_CLIENT_ID_MISSING` は `src/errors.ts:31` に残存（参照箇所なし、削除不要のスコープ外）

---

## Action Items

| # | 種別 | 対応 |
|---|---|---|
| 1 | 後続作業 | OAuth App 作成後に `GITHUB_CLIENT_ID` 定数を実値に差し替える |
| 2 | 軽微 | `tests/github-device.test.ts:12` コメントを "fallback to built-in client_id when env is absent" 相当に更新する |
