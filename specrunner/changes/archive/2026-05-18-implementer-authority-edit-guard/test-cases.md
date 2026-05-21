# Test Cases: implementer-authority-edit-guard

Source: request.md / design.md / tasks.md  
Generated: 2026-05-18

---

## TC-AUTH-01 — staged に authority spec を含む → reject

**Category**: Unit / executor guard  
**Priority**: must  
**Source**: T-02 / 要件 1 / 受け入れ基準 1・2

```
GIVEN  AgentStep が commitAndPush を呼び出す
AND    staged に `specrunner/specs/foo/spec.md` が含まれる（hasChanges=true）
WHEN   commitAndPush が staged diff path を検査する
THEN   `AUTHORITY_SPEC_EDIT_VIOLATION` (AuthoritySpecEditViolation) が throw される
AND    `git commit` コマンドは実行されない
```

---

## TC-AUTH-02 — staged に delta spec のみ → 正常 commit

**Category**: Unit / executor guard  
**Priority**: must  
**Source**: T-02 / 要件 2 / 受け入れ基準 4

```
GIVEN  AgentStep が commitAndPush を呼び出す
AND    staged に `specrunner/changes/my-slug/specs/foo/spec.md` のみ含まれる（hasChanges=true）
WHEN   commitAndPush が staged diff path を検査する
THEN   violation は検出されない
AND    `git commit` + `git push` が正常に実行される
```

---

## TC-AUTH-03 — staged に authority spec + src 両方 → reject（違反 path のみ列挙）

**Category**: Unit / executor guard  
**Priority**: must  
**Source**: T-02 / 要件 1・2 / 受け入れ基準 2・6

```
GIVEN  AgentStep が commitAndPush を呼び出す
AND    staged に `specrunner/specs/foo/spec.md` + `src/foo.ts` 両方が含まれる（hasChanges=true）
WHEN   commitAndPush が staged diff path を検査する
THEN   `AUTHORITY_SPEC_EDIT_VIOLATION` が throw される
AND    error message の違反 path 一覧に `specrunner/specs/foo/spec.md` が含まれる
AND    error message の違反 path 一覧に `src/foo.ts` が含まれない
```

---

## TC-AUTH-04 — agent self-commit (HEAD advanced) で HEAD diff に authority spec → reject

**Category**: Unit / executor guard  
**Priority**: must  
**Source**: T-02-2c / 要件 1 / 受け入れ基準 3

```
GIVEN  AgentStep が commitAndPush を呼び出す
AND    staged 変更は 0 件（hasChanges=false）
AND    HEAD が headBeforeStep から advance している（agent self-commit 経路）
AND    `git diff headBeforeStep..HEAD --name-only` に `specrunner/specs/foo/spec.md` が含まれる
WHEN   commitAndPush が HEAD diff path を検査する
THEN   `AUTHORITY_SPEC_EDIT_VIOLATION` が throw される
AND    `git push` コマンドは実行されない
```

---

## TC-AUTH-05 — 通常 step（authority spec なし）は既存挙動維持

**Category**: Unit / executor guard  
**Priority**: must  
**Source**: T-02 / 要件 1（逆条件） / 受け入れ基準 regression なし

```
GIVEN  AgentStep が commitAndPush を呼び出す
AND    staged に `src/foo.ts` のみ含まれる（authority spec なし）
WHEN   commitAndPush が staged diff path を検査する
THEN   violation は検出されない
AND    既存の commit + push フローが正常に完了する
```

---

## TC-AUTH-06 — staged 変更 0 件 + HEAD 変化なし → 既存挙動維持

**Category**: Unit / executor guard  
**Priority**: must  
**Source**: T-02 / TC-AUTH-06 (tasks.md)

```
GIVEN  AgentStep が commitAndPush を呼び出す
AND    staged 変更は 0 件（hasChanges=false）
AND    HEAD も headBeforeStep から変化していない
WHEN   commitAndPush が実行される
THEN   authority spec guard は発動しない
AND    既存の「no-op commit」扱いの挙動が維持される
```

---

## TC-AUTH-07 — CliStep は commitAndPush を通らず authority 編集が許可される

**Category**: Unit / executor guard  
**Priority**: must  
**Source**: 要件 3 / 受け入れ基準 5 / design.md

```
GIVEN  kind="cli" の CliStep（例: spec-merge）が実行される
AND    worktree 上で `specrunner/specs/foo/spec.md` が変更されている
WHEN   runCliStep 経路が実行される
THEN   commitAndPush は呼ばれない
AND    `AUTHORITY_SPEC_EDIT_VIOLATION` は throw されない
AND    spec-merge の正常フローが維持される
```

---

## TC-AUTH-08 — error message に修復方法 (delta spec 案内) が含まれる

**Category**: Unit / error design  
**Priority**: must  
**Source**: 要件 1 / 受け入れ基準 6 / T-01-1b

```
GIVEN  staged に `specrunner/specs/foo/spec.md` が含まれる（violation あり）
WHEN   `authoritySpecEditViolationError(stepName, violatedPaths)` が生成される
THEN   error message に違反 path 一覧が含まれる（例: `- specrunner/specs/foo/spec.md`）
AND    error message に "specrunner/changes/<slug>/specs/<capability>/spec.md" への案内が含まれる
AND    error code は `AUTHORITY_SPEC_EDIT_VIOLATION` である
```

---

## TC-AUTH-09 — `specrunner/changes/` prefix の path は violation と見なされない

**Category**: Unit / path detection  
**Priority**: must  
**Source**: design.md Guard Logic / 要件 2

```
GIVEN  `findAuthoritySpecViolations` に以下の paths が渡される:
       - `specrunner/changes/foo/specs/cap/spec.md`
       - `specrunner/changes/bar/specs/cap/spec.md`
       - `src/core/executor.ts`
WHEN   prefix `specrunner/specs/` でフィルタリングする
THEN   返却 array は空（violations = 0）である
```

---

## TC-AUTH-10 — `specrunner/specs/` prefix の path のみ violation と見なされる

**Category**: Unit / path detection  
**Priority**: must  
**Source**: design.md Guard Logic / 要件 1・2

```
GIVEN  `findAuthoritySpecViolations` に以下の paths が渡される:
       - `specrunner/specs/cap-a/spec.md`
       - `specrunner/changes/my-slug/specs/cap-b/spec.md`
       - `src/foo.ts`
WHEN   prefix `specrunner/specs/` でフィルタリングする
THEN   返却 array は `["specrunner/specs/cap-a/spec.md"]` のみである
```

---

## TC-AUTH-11 — implementer-system.ts prompt に authority 編集禁止 MUST が含まれる

**Category**: Unit / prompt  
**Priority**: must  
**Source**: 要件 4 / 受け入れ基準 7 / T-04

```
GIVEN  `IMPLEMENTER_SYSTEM_PROMPT` を参照する
WHEN   prompt 文字列を検査する
THEN   `specrunner/specs/` 配下の直接編集禁止（MUST NOT）が明示されている
AND    delta spec 経由（`specrunner/changes/<slug>/specs/`）への誘導が含まれる
AND    executor が commit 前に reject する旨が記述されている
```

---

## TC-AUTH-12 — spec-fixer-system.ts prompt に authority 編集禁止 MUST が含まれる

**Category**: Unit / prompt  
**Priority**: must  
**Source**: 要件 4 / 受け入れ基準 7 / T-05

```
GIVEN  `SPEC_FIXER_SYSTEM_PROMPT` を参照する
WHEN   prompt 文字列を検査する
THEN   `specrunner/specs/` 配下の直接編集禁止（MUST NOT）が明示されている
AND    delta spec 経由への誘導が含まれる
```

---

## TC-AUTH-INT-01 — PR #289/291 同型: delta spec + authority 両方編集 → reject

**Category**: Integration / pipeline  
**Priority**: must  
**Source**: 要件 5 (TC-AUTH-INT-01) / 受け入れ基準 8 / T-07

```
GIVEN  type=spec-change の pipeline が実行される
AND    implementer step の mock runner が以下を staged に含む diff を返す:
       - `specrunner/specs/some-cap/spec.md` (authority spec 直接編集)
       - `specrunner/changes/test-slug/specs/some-cap/spec.md` (delta spec)
WHEN   commitAndPush が実行される
THEN   `AUTHORITY_SPEC_EDIT_VIOLATION` で step が halt する
AND    delta spec 経路のみ編集した対照ケースでは正常完了する
AND    pipeline escalation 経路（escalated=true）に乗る
```

---

## TC-AUTH-INT-02 — delta spec のみ編集の spec-change pipeline は正常完了する（対照）

**Category**: Integration / pipeline  
**Priority**: must  
**Source**: T-07 (対照テスト指示) / 要件 2

```
GIVEN  type=spec-change の pipeline が実行される
AND    implementer step の mock runner が `specrunner/changes/test-slug/specs/some-cap/spec.md` のみを staged に含む diff を返す
WHEN   commitAndPush が実行される
THEN   violation は検出されない
AND    pipeline が正常完了する
```

---

## TC-AUTH-13 — authority-spec-guard.ts fragment が正しいルールを含む

**Category**: Unit / prompt fragment  
**Priority**: should  
**Source**: T-03 / design.md Prompt 補強

```
GIVEN  `src/prompts/authority-spec-guard.ts` の `AUTHORITY_SPEC_GUARD_RULE` を参照する
WHEN   文字列を検査する
THEN   `specrunner/specs/` 配下の禁止ルールが含まれる
AND    `specrunner/changes/<slug>/specs/` への誘導が含まれる
AND    executor が halt する旨が記述されている
```

---

## TC-AUTH-14 — 複数の authority spec path が全て列挙される

**Category**: Unit / error design  
**Priority**: should  
**Source**: 要件 1 / 受け入れ基準 6（「1 件ずつ列挙」）

```
GIVEN  staged に複数の authority spec が含まれる:
       - `specrunner/specs/cap-a/spec.md`
       - `specrunner/specs/cap-b/spec.md`
WHEN   `authoritySpecEditViolationError` が生成される
THEN   error message の違反 path 一覧に両方のパスが含まれる
```

---

## TC-AUTH-15 — `bun run typecheck` が green である

**Category**: Build / type check  
**Priority**: must  
**Source**: 受け入れ基準 9

```
GIVEN  本 change の全変更が適用された状態
WHEN   `bun run typecheck` を実行する
THEN   型エラーなしで完了する
```

---

## TC-AUTH-16 — `bun run test` が green である

**Category**: Build / test  
**Priority**: must  
**Source**: 受け入れ基準 9

```
GIVEN  本 change の全変更が適用された状態
WHEN   `bun run test` を実行する
THEN   全テストが pass する（既存テスト含む regression なし）
```

---

## TC-AUTH-17 — spec authority (step-execution-architecture) に Requirement が反映されている

**Category**: Spec authority  
**Priority**: must  
**Source**: 要件 6 / 受け入れ基準 10

```
GIVEN  `specrunner/specs/step-execution-architecture/spec.md` (または同等の capability spec) を参照する
WHEN   Requirement を確認する
THEN   「commitAndPush は AgentStep の commit 前に staged diff path を検査し、`specrunner/specs/` 配下を含む場合 `AuthoritySpecEditViolation` を throw して halt する」が追加されている
AND    Scenario として delta spec のみ / authority spec のみ / 両方 / agent self-commit / CliStep 経路の各ケースが記述されている
```

---

## TC-AUTH-18 — agent self-commit 経路で delta spec のみ HEAD diff → 正常 push

**Category**: Unit / executor guard  
**Priority**: should  
**Source**: 要件 1（逆条件）/ T-02-2c

```
GIVEN  AgentStep が commitAndPush を呼び出す
AND    staged 変更は 0 件（hasChanges=false）
AND    HEAD が advance している（agent self-commit 経路）
AND    `git diff headBeforeStep..HEAD --name-only` に `specrunner/changes/my-slug/specs/foo/spec.md` のみ含まれる
WHEN   commitAndPush が HEAD diff path を検査する
THEN   violation は検出されない
AND    `git push` が正常に実行される
```

---

## TC-AUTH-19 — `specrunner/specs` という文字列から始まるが直後が `/` でないパスは除外

**Category**: Unit / path detection  
**Priority**: could  
**Source**: design.md Guard Logic（prefix 厳密性）

```
GIVEN  `findAuthoritySpecViolations` に以下の paths が渡される:
       - `specrunner/specs-extra/foo/spec.md`  （"specrunner/specs/" prefix に不一致）
WHEN   prefix `specrunner/specs/` でフィルタリングする
THEN   返却 array は空である（violation と見なされない）
```
