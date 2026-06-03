# Tasks: remove-baseline-corpus

## T-01: corpus 本体を削除する

- [x] `specrunner/specs/` ディレクトリを再帰的に削除する

**Acceptance Criteria**:
- `specrunner/specs/` が存在しない

## T-02: baseline path helper を撤去する

- [x] `src/util/paths.ts` から `SPECS_DIR` 定数を削除する
- [x] `src/util/paths.ts` から `specsDirRel()` 関数を削除する
- [x] `src/util/paths.ts` から `baselineSpecPath()` 関数を削除する

**Acceptance Criteria**:
- `baselineSpecPath` / `specsDirRel` / `SPECS_DIR` への参照が `src/` 内に残らない

## T-03: DynamicContext から specIndex を撤去する

- [x] `src/git/dynamic-context.ts` から `SpecIndexEntry` interface を削除する
- [x] `src/git/dynamic-context.ts` の `DynamicContext` interface から `specIndex` フィールドを削除する
- [x] `src/git/dynamic-context.ts` から `collectSpecIndex()` 関数を削除する（`extractPurpose` / `countRequirements` ヘルパー含む）
- [x] `src/git/dynamic-context.ts` の `collectDynamicContext()` から `collectSpecIndex` 呼び出しと `specIndex` 代入を削除する
- [x] `src/git/dynamic-context.ts` の `specsDirRel` import を削除する

**Acceptance Criteria**:
- `SpecIndexEntry` / `specIndex` / `collectSpecIndex` への参照が `src/` に残らない

## T-04: design-system.ts の Baseline Specs テーブル注入を撤去する

- [x] `src/prompts/design-system.ts` の `buildInitialMessage` から specIndex テーブル生成ブロック（`if (dynamicContext.specIndex ...)`）を削除する
- [x] `src/prompts/design-system.ts` の「Baseline Spec 参照」セクション（`specrunner/specs/` 配下の Read 許可 guidance）を削除する

**Acceptance Criteria**:
- `design-system.ts` に `specIndex` / `specrunner/specs/` への参照が残らない

## T-05: commit-push.ts の baseline 編集検出を撤去する

- [x] `src/core/step/commit-push.ts` から `AUTHORITY_SPEC_PREFIX` 定数を削除する
- [x] `src/core/step/commit-push.ts` から `findAuthoritySpecViolations()` 関数を削除する
- [x] `commitAndPush()` 内の agent self-commit path にある `findAuthoritySpecViolations` 呼び出しと warning 出力を削除する
- [x] `commitAndPush()` 内の staged changes path にある `findAuthoritySpecViolations` 呼び出しと warning 出力を削除する

**Acceptance Criteria**:
- `commit-push.ts` に `findAuthoritySpecViolations` / `AUTHORITY_SPEC_PREFIX` / `specrunner/specs/` が残らない

## T-06: prompt から baseline 関連 guidance を撤去する

- [x] `src/prompts/rules.ts`: 「共通禁止」セクションの `specrunner/specs/` 直接編集禁止 2 行を削除する
- [x] `src/prompts/rules.ts`: System Facts の「Authority spec (baseline)」行を削除する
- [x] `src/prompts/rules.ts`: System Facts の「Baseline edit protection」行を削除する
- [x] `src/prompts/rules.ts`: 「見る側の規律」セクションから baseline 参照 guidance（`specrunner/specs/<capability>/spec.md` を読む指示）を削除する
- [x] `src/prompts/rules.ts`: 「正規経路」の code-fixer baseline 記述を削除する
- [x] `src/prompts/code-fixer-system.ts`: 禁止事項の「authority spec（`specrunner/specs/` 配下）の変更」行を削除する
- [x] `src/prompts/request-generate-system.ts`: authority path 記述禁止ルールを削除する
- [x] `src/prompts/request-review-system.ts`: 「Authority path intent」チェック（Step 2 内の 3 分岐）を削除する
- [x] `src/prompts/request-review-system.ts`: HIGH severity 定義の「authority path」記述を削除する
- [x] `src/core/command/request.ts`: template 内の authority path 記述禁止コメントを削除する

**Acceptance Criteria**:
- prompt に baseline read-only / 直接編集禁止 guidance が残らない
- `specrunner/specs/` への参照が `src/` 内に残らない

## T-07: テストを修正する

- [x] `tests/git/dynamic-context.test.ts`: TC-DC-015 〜 TC-DC-018（specIndex 関連テスト群）を削除する。`specsDirRel` import を削除する
- [x] `tests/prompts/dynamic-context-prompts.test.ts`: TC-DC-011 〜 TC-DC-014（Baseline Specs テーブル関連テスト）を削除する。全テスト内の `specIndex` フィールドを `DynamicContext` リテラルから削除する
- [x] `tests/pipeline-integration.test.ts`: specIndex fixture データを削除する。TC-DC-102 テストスイートを削除する。TC-AUTH-INT-01・TC-AUTH-INT-02 スイート（`findAuthoritySpecViolations` warning 動作検証）を削除する。DynamicContext リテラルから `specIndex` を削除する
- [x] `tests/prompts/spec-review-system.test.ts`: DynamicContext リテラルから `specIndex` を削除する
- [x] `tests/prompts/design-system.test.ts`: `specrunner/specs/` 参照テストを削除する。DynamicContext リテラルから `specIndex` を削除する
- [x] `tests/unit/prompts/design-system.test.ts`: DynamicContext リテラルから `specIndex` フィールドを削除する（line 128, 148 付近の 2 箇所）
- [x] `tests/unit/step/executor.commit.test.ts`: `findAuthoritySpecViolations` / `specrunner/specs/` 関連テストケースを削除または修正する
- [x] `tests/unit/step/code-review.test.ts`: DynamicContext リテラルから `specIndex` を削除する
- [x] `tests/adapter/codex/agent-runner.test.ts`: DynamicContext リテラルから `specIndex` を削除する
- [x] `tests/unit/command/request-review.test.ts`: `specrunner/specs/` 参照アサーションを削除する

**Acceptance Criteria**:
- `specIndex` / `SpecIndexEntry` への参照が `tests/` に残らない
- `bun run typecheck && bun run test` が green
