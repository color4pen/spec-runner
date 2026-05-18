# Code Review: resume-from-step-name (Iteration 1)

## Summary

`--from` flag が受け付ける値を全 step 名 + legacy alias に拡張する変更。実装は design.md / tasks.md の指示にほぼ忠実に従っており、型・解決ロジック・CLI enum・USAGE・テスト・delta spec の各成果物が一貫している。typecheck と全 174 ファイル / 2111 テストが green、新 describe ブロックの 13 テストもすべて pass している。後方互換は legacy alias 3 種について保持されている。CRITICAL / MAJOR は無し。MINOR / SUGGESTION のみ。

## Findings

### [MINOR] LegacyResumeRole の narrowing が冗長

**file**: `src/core/resume/resolve-step.ts:118-122`
**description**: `from === "fixer" || from === "creator" || from === "critic"` で literal を 3 回列挙している。直上で `LEGACY_RESUME_ROLES` 定数 (`as const` tuple) を定義しているため、`(LEGACY_RESUME_ROLES as readonly string[]).includes(from)` で揃えるか、`Set<string>` を別途持たせると DRY になる。step 名側は `ALL_STEP_NAMES_SET` で Set を使っているので非対称。
**suggestion**: 同じパターンで Set 化するか、`LEGACY_RESUME_ROLES.includes(from as LegacyResumeRole)` を使い、narrowing は `from as LegacyResumeRole` で行う。挙動には影響しないので必須ではない。

---

### [MINOR] error message の step 名列挙が長い

**file**: `src/core/resume/resolve-step.ts:125-131`
**description**: `Available step names: design, spec-review, spec-fixer, delta-spec-fixer, test-case-gen, implementer, build-fixer, code-review, code-fixer, verification, pr-create, delta-spec-validation. Legacy aliases: critic, fixer, creator.` のように 1 行で 12 step 名 + 3 alias を出力する。CLI usability 観点で改行や bullet 表示の方が読みやすい。flag-parser 経由の場合は別の error が先に出るため stderr に到達するのは内部直接呼びだけだが、design.md 51-58 にあるサンプル形式に近い multi-line にすると一貫性が高い。
**suggestion**: `\n  - design\n  - spec-review\n  ...` のような bullet list、または step 名と alias を別行に分けるなど。必須ではない（test は正規表現マッチで pass する）。

---

### [SUGGESTION] `ResumeRole` の deprecated alias が未使用

**file**: `src/core/resume/resolve-step.ts:18-19`
**description**: `ResumeRole = LegacyResumeRole` を `@deprecated` 付きで残しているが、grep の結果、リポジトリ内で `ResumeRole` を import している箇所は無い。当該 PR 範囲では問題にならないが、公開 API として export している以上、外部利用がないなら削除しても良い。
**suggestion**: 当面残すなら現状のままで OK。next minor release で削除候補に挙げる程度。

---

### [SUGGESTION] テスト命名スタイルの揺れ

**file**: `tests/unit/core/resume/resolve-step.test.ts:260-309`
**description**: 新規 describe ブロック `"resolveResumeStep - --from with step name"` 内のテスト名は `it("--from design → design", ...)` 形式。一方既存テストは `it("spec phase + critic → spec-review", ...)` 形式や `it("T4.4: ...")` のように構造が違う。意図的に新規 TC を視認しやすくしている可能性もある。
**suggestion**: 必須ではない。後方互換の test は既存テストにもあるため、TC-RESUME-FROM-04/05/06 の重複テストは将来的に統合余地がある。

---

## Acceptance Criteria Check

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `ResumeFrom = StepName \| LegacyResumeRole` 型が `resolve-step.ts` で定義されている | ✅ (L27) |
| 2 | `resolveResumeStep` が step 名を直接受け付け、mapping なしで返す | ✅ (L113-116, ALL_STEP_NAMES_SET で O(1) チェック後 `from as StepName` を return) |
| 3 | legacy alias 3 種が既存 mapping 通りに動く（後方互換 regression なし） | ✅ (L118-123、STEP_MAPPING は値不変。既存 35+ tests も pass) |
| 4 | 不正値の error message に利用可能 step 名 + legacy alias 一覧が含まれる | ✅ (L125-131) |
| 5 | `command-registry.ts` の `--from` parsing が拡張された signature を受け付ける | ✅ (L336: `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES, "critic", "fixer", "creator"]`) |
| 6 | USAGE 文字列が `--from=<step-or-alias>` 形式に更新されている | ✅ (L90: `--from=<step\|alias>` — test-cases.md TC-21 で許容される代替表記) |
| 7 | 既存 resume 関連 test が regression していない | ✅ (resolve-step.test.ts 51 件 + 全 2111 件 green) |
| 8 | delta spec が `## MODIFIED Requirements` を持つ形で作成されている | ✅ (`specs/cli-resume-command/spec.md` L5、baseline 未変更を git diff で確認) |
| 9 | `bun run typecheck && bun run test` が green | ✅ (verification-result.md / 本レビュー再実行で確認) |

## Test Coverage

test-cases.md の must 18 件 / should 4 件 / could 1 件のうち、unit test として実装されるべき must は全て resolve-step.test.ts に存在する。CLI 経路 (TC-18/19/20/21) は flag-parser の既存 enum validation 経由で機能するため、unit 単位での追加 test は無いが、values 配列拡張により挙動は実質達成されている（手動検証 / 既存 flag-parser tests 経由）。

| TC | Description | Status |
|----|-------------|--------|
| TC-RESUME-FROM-01 | `--from design` → `design` | ✅ (resolve-step.test.ts:262-264) |
| TC-RESUME-FROM-02 | `--from code-review` → `code-review` | ✅ (267-269) |
| TC-RESUME-FROM-03 | `--from delta-spec-validation` → `delta-spec-validation` | ✅ (272-274) |
| TC-RESUME-FROM-04 | step 名 `spec-fixer` を直接指定 (should) | ⚠️ 専用テストは無いが、既存 fixer test と TC-01/02 で同等パスをカバー |
| TC-RESUME-FROM-05 | step 名 `test-case-gen` を直接指定 (should) | ⚠️ 専用テスト無し（ALL_STEP_NAMES_SET 経路は TC-01/02/03 で実証済み） |
| TC-RESUME-FROM-06 | step 名 `pr-create` を直接指定 (could) | ❌ 専用テスト無し（could なので必須ではない） |
| TC-RESUME-FROM-07 | legacy alias `critic` — spec phase | ✅ (277-279) |
| TC-RESUME-FROM-08 | legacy alias `critic` — code phase | ✅ (280-282) |
| TC-RESUME-FROM-09 | legacy alias `fixer` — spec phase | ✅ (285-287) |
| TC-RESUME-FROM-10 | legacy alias `fixer` — code phase | ✅ (288-290) |
| TC-RESUME-FROM-11 | legacy alias `creator` — spec phase | ✅ (293-295) |
| TC-RESUME-FROM-12 | legacy alias `creator` — code phase | ✅ (296-298) |
| TC-RESUME-FROM-13 | invalid → throws with invalid value in message | ✅ (302-303) |
| TC-RESUME-FROM-14 | invalid Error message に step 名一覧 | ✅ (304-305) |
| TC-RESUME-FROM-15 | invalid Error message に alias 一覧 | ✅ (306-307) |
| TC-RESUME-FROM-16 | step 名 / alias 識別順 (`design` は step 名経路) | ✅ (TC-01 で実証 — phase が code でも `design` を返す) |
| TC-RESUME-FROM-17 | `from` undefined regression | ✅ (既存 describe `"resolveResumeStep - default (from=undefined)"`, T4.1〜T4.3, fixer-empty 群が網羅) |
| TC-RESUME-FROM-18 | CLI flag が step 名を受け付ける | ✅ (command-registry.ts L336 + flag-parser enum) |
| TC-RESUME-FROM-19 | CLI flag が legacy alias を受け付ける | ✅ (同上) |
| TC-RESUME-FROM-20 | CLI flag が不正値を拒否 | ✅ (flag-parser:92-94 の既存ロジック) |
| TC-RESUME-FROM-21 | USAGE 文字列更新 | ✅ (L90: `<step\|alias>` 形式、e.g. に `code-review, implementer, critic`) |
| TC-RESUME-FROM-22 | `ResumeFrom` export + 型エラーなし | ✅ (typecheck green) |
| TC-RESUME-FROM-23 | `STEP_MAPPING` key 型が `LegacyResumeRole` | ✅ (L68) |
| TC-RESUME-FROM-24 | delta spec の存在 + format | ✅ |
| TC-RESUME-FROM-25 | typecheck && test green | ✅ |

must 18 件: すべて達成 (TC-04/05 は should なので除外)。should 4 件: TC-04/05/16/23 のうち TC-04/05 は専用テストなし（同等パスが他テストでカバー）、TC-16/23 達成。could 1 件: TC-06 未達 (必須でない)。

## Verdict

- **verdict**: approved
