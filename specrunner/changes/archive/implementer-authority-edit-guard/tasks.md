# Tasks: implementer-authority-edit-guard

## [x] T-01: `src/errors.ts` に AUTHORITY_SPEC_EDIT_VIOLATION を追加

### 1-a: ERROR_CODES に追加

`ERROR_CODES` オブジェクトに以下を追加:

```typescript
AUTHORITY_SPEC_EDIT_VIOLATION: "AUTHORITY_SPEC_EDIT_VIOLATION",
```

### 1-b: factory 関数を追加

```typescript
export function authoritySpecEditViolationError(
  stepName: string,
  violatedPaths: string[],
): SpecRunnerError {
  const pathList = violatedPaths.map(p => `  - ${p}`).join("\n");
  return new SpecRunnerError(
    ERROR_CODES.AUTHORITY_SPEC_EDIT_VIOLATION,
    `Authority spec files must be modified via delta spec under specrunner/changes/<slug>/specs/<capability>/spec.md.\nViolating paths:\n${pathList}`,
    `Agent step '${stepName}' attempted to edit authority spec files directly.`,
  );
}
```

---

## [x] T-02: `src/core/step/executor.ts` の `commitAndPush` に authority spec guard を追加

### 2-a: helper 関数を追加 (private method or module-level)

```typescript
const AUTHORITY_SPEC_PREFIX = "specrunner/specs/";

function findAuthoritySpecViolations(filePaths: string[]): string[] {
  return filePaths.filter(p => p.startsWith(AUTHORITY_SPEC_PREFIX));
}
```

### 2-b: staged commit 経路に guard を挿入

`commitAndPush` の `hasChanges === true` 分岐 (現在 L282 付近の commit 直前) に以下を追加:

1. `git diff --cached --name-only` を `gitExec` で実行し、改行区切りで path list を取得
2. `findAuthoritySpecViolations(paths)` で violation path を抽出
3. violation が 1 件以上の場合、`authoritySpecEditViolationError(step.name, violations)` を throw

### 2-c: agent self-commit 経路に guard を挿入

`commitAndPush` の HEAD advanced 分岐 (現在 L270 付近の push-only 前) に以下を追加:

1. `git diff ${headBeforeStep}..${headAfterStep} --name-only` を `gitExec` で実行
2. `findAuthoritySpecViolations(paths)` で violation path を抽出
3. violation が 1 件以上の場合、`authoritySpecEditViolationError(step.name, violations)` を throw

import 追加: `authoritySpecEditViolationError` を `../../errors.js` から import。

---

## [x] T-03: `src/prompts/authority-spec-guard.ts` を新規作成

**新規ファイル**: `src/prompts/authority-spec-guard.ts`

`commit-discipline.ts` と同パターンで shared fragment を定義:

```typescript
/**
 * Authority spec edit guard rule injected into agent step prompts.
 * Centralizes the "no direct authority spec edits" rule.
 */
export const AUTHORITY_SPEC_GUARD_RULE = `## authority spec の編集禁止

\`specrunner/specs/\` 配下のファイルを直接編集してはならない（MUST NOT）。
spec の変更は delta spec（\`specrunner/changes/<slug>/specs/<capability>/spec.md\`）を作成・編集する。
authority spec への直接編集は executor が commit 前に検出し、ステップを halt する。
`;
```

---

## [x] T-04: `src/prompts/implementer-system.ts` に authority-spec-guard を注入

### 変更内容

1. `authority-spec-guard.ts` から `AUTHORITY_SPEC_GUARD_RULE` を import
2. `IMPLEMENTER_SYSTEM_PROMPT` の禁止事項セクションの直前に `${AUTHORITY_SPEC_GUARD_RULE}` を挿入

---

## [x] T-05: `src/prompts/spec-fixer-system.ts` に authority-spec-guard を注入

### 変更内容

1. `authority-spec-guard.ts` から `AUTHORITY_SPEC_GUARD_RULE` を import
2. `SPEC_FIXER_SYSTEM_PROMPT` の禁止事項セクションの直前に `${AUTHORITY_SPEC_GUARD_RULE}` を挿入

---

## [x] T-06: `tests/unit/step/executor.commit.test.ts` に authority spec guard テストを追加

既存の helper (`makeGitSpawnFnWithRevParseSequence`, `makeAgentStep`, etc.) を再利用する。

### TC-AUTH-01: staged で authority spec を含む → reject

- `diff --cached --name-only` → `specrunner/specs/foo/spec.md\nsrc/bar.ts`
- `diff (--cached --quiet)` → exit 1 (hasChanges)
- expect: `AUTHORITY_SPEC_EDIT_VIOLATION` throw
- expect: `git commit` が呼ばれない

### TC-AUTH-02: staged で delta spec のみ → 正常 commit

- `diff --cached --name-only` → `specrunner/changes/my-slug/specs/foo/spec.md`
- `diff (--cached --quiet)` → exit 1 (hasChanges)
- expect: 正常完了、`git commit` + `git push` が呼ばれる

### TC-AUTH-03: staged で authority spec + src 変更 → reject (違反 path のみ列挙)

- `diff --cached --name-only` → `specrunner/specs/foo/spec.md\nsrc/foo.ts`
- expect: `AUTHORITY_SPEC_EDIT_VIOLATION` throw
- expect: error の hint に `specrunner/specs/foo/spec.md` を含み、`src/foo.ts` を含まない

### TC-AUTH-04: agent self-commit で HEAD diff に authority spec → reject

- staged 0, HEAD advanced
- `diff headBefore..headAfter --name-only` → `specrunner/specs/foo/spec.md`
- expect: `AUTHORITY_SPEC_EDIT_VIOLATION` throw
- expect: `git push` が呼ばれない

### TC-AUTH-05: 通常 step (authority spec なし) は既存挙動維持

- `diff --cached --name-only` → `src/foo.ts`
- expect: 正常完了

### TC-AUTH-06: `makeGitSpawnFnWithRevParseSequence` の拡張

既存の `baseResponses` map では `diff` subcommand に対して exit code のみ返している。authority guard テストでは `diff --cached --name-only` に対して stdout (file list) を返す必要がある。

`baseResponses` の `diff` エントリを `args` pattern マッチに拡張するか、`diff` の `stdout` フィールドを返す形に修正する。ただし既存テスト (TC-CAP-NEW-001 〜 008) が壊れないよう後方互換を維持すること。

具体的なアプローチ:
- `baseResponses` に `"diff --cached --name-only"` のような複合キーを追加し、subcommand 単体の `"diff"` より優先マッチさせる
- または `baseResponses` の value に `matcher: (args) => boolean` を追加
- 最小限のアプローチ: subcommand が `diff` の場合、args に `--name-only` が含まれるかで分岐

---

## [x] T-07: `tests/pipeline-integration.test.ts` に TC-AUTH-INT-01 を追加

### TC-AUTH-INT-01: PR #289 / #291 同型 reproduction

type=spec-change の pipeline で implementer step が authority spec + delta spec 両方を編集するシナリオ:

- runner mock が `specrunner/specs/some-cap/spec.md` と `specrunner/changes/test-slug/specs/some-cap/spec.md` 両方を staged に含む diff を返す
- expect: `AUTHORITY_SPEC_EDIT_VIOLATION` で step halt
- expect: delta spec 経路のみならば正常完了する対照テストも追加

既存の pipeline-integration テストパターン (mock runner + mock git spawn) に合わせて実装する。
