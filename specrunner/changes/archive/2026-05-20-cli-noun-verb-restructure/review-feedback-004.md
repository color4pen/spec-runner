# Review Feedback 004

## Verdict
- **verdict**: approved

## Summary

iter 3 で残っていた [low] 指摘（`src/cli/command-registry.ts` の `job show` ハンドラの dead code）が iter 4 のコミット `5bc779f` で正しく修正された。if/else 両分岐の `await runJobShow(input)` が単一呼び出しに collapsed され、コメントの「validate strictly」と実装の乖離も解消。タイポなし、削除以外の副作用なし。

ビルド・型検査・テスト全件（2418 tests / 221 files）green。typecheck clean。

iter 1〜4 で挙がった指摘はすべて解決済み。merge 可能。

---

## Findings

### [info] iter 3 の dead code 指摘が修正完了

**File**: `src/cli/command-registry.ts` L299-305

```typescript
show: {
  flags: {},
  positional: { name: "jobId|slug", required: true },
  handler: async (parsed) => {
    await runJobShow(parsed.positional!);
  },
},
```

iter 2/3 で指摘した if/else 重複が完全に削除され、ハンドラはフラット 1 行に簡素化された。コミットメッセージ（`5bc779f`）も指摘元（iter 3 LOW finding）を正しくリファレンスしている。

`UUID_REGEX` import は残るが `job rm`（L316）と `job finish --job`（L373）で引き続き使われているため適切。`SLUG_REGEX` も `request validate`（L214）と `request review`（L241）で使用中で残置適切。

---

### [info] テスト網羅性は完全

verification-result.md の「56/56 must TCs covered」は iter 3 の修正（TC-36 追加）以降は正確。`removed-commands.test.ts` L73-148 で TC-31/32/33/34/35/36/40 すべて網羅。iter 1 で指摘した TC-33/34 欠落も iter 2 で TC-36 と合わせて補完済み。

iter 4 のコード変更（dead code 削除のみ）はテスト挙動に影響しない — `job show` の振り分けは `runJobShow` 内（`src/cli/job-show.ts` L24-45）で行われており、ハンドラ側の分岐は元々何もしていなかった。テスト数も 2415 → 2418 → 2418 と推移（iter 1 → iter 2 → iter 4）し、減少なし。

---

## Test Coverage

| Category | TCs | テストファイル | 状態 |
|---|---|---|---|
| worktree-guard | TC-01〜07 | `specrunner-worktree-guard.test.ts` (TC-WG-001〜008) | ✅ |
| request-commands | TC-08〜20 | `request-new.test.ts` / `request-show.test.ts` / `request-rm.test.ts` / 他 | ✅ |
| job-commands | TC-21〜29 | `job-show.test.ts` / `specrunner-resume-dispatch.test.ts` / 他 | ✅ |
| aliases | TC-30 | (`run` alias は worktree-guard test TC-WG-006 でも検証) | ✅ |
| removed-commands | TC-31, 32, 33, 34, 35, 36, 40 | `removed-commands.test.ts` L73-148 | ✅ |
| runtime-commands | TC-37〜39 | `runtime-tc.test.ts` | ✅ |
| help-output | TC-41, 43 | `help-output-tc.test.ts` | ✅ |
| readme | TC-44 | `readme-tc.test.ts` | ✅ |
| validation | TC-45〜51 | `validation-tc.test.ts` / 各 request-*.test.ts | ✅ |
| delta-spec | TC-52〜55 | `verification/delta-spec-cli-noun-verb.test.ts` | ✅ |
| build | TC-56 | verification-result.md (build + typecheck + test) | ✅ |
| adr | TC-57 | `adr-tc.test.ts` | ✅ |

**must TCs**: 56/56 covered（iter 3 修正後の状態を iter 4 でも維持）
**should TCs**: TC-58〜66 は実装挙動として動作するが個別テストの網羅状況は混在（regression なし）

---

## Confirmed Fixes Across Iterations

| Iteration | 指摘 | 修正コミット | 状態 |
|---|---|---|---|
| iter 1 [major] | `progress.ts:50` の `specrunner finish` → `specrunner job finish` | (iter 2 で対応) | ✅ |
| iter 1 [minor] | TC-33 / TC-34 テスト欠落 | (iter 2 で対応) | ✅ |
| iter 1 [info] / iter 2 [low] / iter 3 [low] | `job show` ハンドラの dead code | `5bc779f` (iter 4) | ✅ |
| iter 2 [medium] | TC-36 テスト欠落（false positive coverage） | (iter 3 で対応) | ✅ |

---

## Positive Observations

- noun-verb 体系（`request` / `job` / `runtime`）は design.md AD-1〜AD-10 通りに実装、命名一貫性あり
- worktree guard の `guardedSubcommands` 設計（AD-2）は subcommand dispatch path の guard 漏れを根本解決し、テスト（TC-WG-001〜008）も網羅的
- slug validation（`/^[a-z0-9][a-z0-9-]{0,63}$/`）は `request new/show/rm/validate/review` の 5 エントリポイントで一貫して適用、path traversal 攻撃を exit 2 で拒否
- UUID validation（`/^[a-f0-9-]{36}$/`）は `job rm` / `job finish --job` で一貫して適用、不正 jobId を exit 1 で拒否
- `request validate` / `request review` の slug/file 両受けロジックは file path 優先 → slug fallback の順序で正しく実装、後方互換維持
- `managed` → `runtime` rename は key 変更のみで internal handler 関数は rename せず（AD-4 通り）、最小変更
- ADR 002（`docs/adr/002-cli-noun-verb-restructure.md`）に 5 つの判断（noun-verb / 責務境界 / run alias / runtime rename / guardedSubcommands）すべて記録、`Consequences` セクションも明示
- README は新体系の最短フロー（`init → login → request new → job start → job ls → job finish`）+ failure flow + alias + runtime modes で再構成済み
- delta spec 4 capability（cli-commands / cli-finish-command / cli-resume-command / managed-cli-commands）すべて更新済み
- iter 4 のコード変更は最小限（9 行 → 1 行）、副作用ゼロ、コミットメッセージで指摘元を明示

---

## Conclusion

iter 1〜3 で挙がった major/medium/minor/info の全指摘が iter 4 終了時点で解消済み。コード品質・型安全性・テスト網羅性・ドキュメント整備のすべての軸で fixes required な箇所は残存しない。merge 可能と判断する。

**verdict**: approved
