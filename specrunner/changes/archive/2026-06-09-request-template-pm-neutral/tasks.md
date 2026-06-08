# Tasks: request template と prompt から bun / tests/ のハードコードを除去

## T-01: request template の受け入れ基準を PM 非依存にする

- [x] `src/core/command/request.ts:48` の受け入れ基準行を PM 名を含まない wording に変更する（例: `` - [ ] `typecheck && test` が green ``）。`bun` を含めない
- [x] `tests/unit/core/command/request.test.ts:121` の `expect(content).toContain("bun run typecheck && bun run test")` を新しい wording に合わせて更新する
- [ ] `tests/unit/core/command/request.test.ts` の `buildValidRequestMd` fixture（58 行目付近の受け入れ基準）が parse を通る限り変更不要だが、整合のため新 wording に合わせてもよい（任意）

**Acceptance Criteria**:
- `buildScaffoldTemplate()` / `executeTemplate()` の出力に `bun` という文字列が含まれない
- `tests/unit/core/command/request.test.ts` が green

## T-02: build-fixer prompt の test 配置を implementer（#569）方針に揃える

- [x] `src/prompts/build-fixer-system.ts:33` の `` 対応する test を `tests/` 配下に追加する `` を、固定ディレクトリを指定しない wording に変更する（例: 「対応する test を追加する（配置先はプロジェクトの既存テストの配置パターンに従う。特定ディレクトリを指定しない）」）
- [ ] `tests/prompts/build-fixer-system.test.ts` の TC-024 は `test-cases.md` AND（`GIVEN`|`WHEN`|`test を追加`|`` test を `tests/` ``）の OR 条件で判定している。新 wording が `test-cases.md` 参照と GIVEN/WHEN 参照を保持していれば green を維持できることを確認する。残った dead な `` `test を `tests/`` `` 分岐は整理してよい（任意）

**Acceptance Criteria**:
- `BUILD_FIXER_SYSTEM_PROMPT` に固定パス `tests/` が含まれない
- `tests/prompts/build-fixer-system.test.ts` が green

## T-03: phases.ts / runner.ts の stale JSDoc を PM 検出ベースに更新する

- [x] `src/core/verification/phases.ts:4` の `` All phases run as `bun run <script>` via the runner. `` を、PM 検出で決定される run コマンドで実行する旨に更新する
- [x] `src/core/verification/runner.ts:43` の `` runs via `bun run <script>` `` を、検出した package manager の run コマンドで実行する旨に更新する
- [x] `src/core/verification/runner.ts:248` の `` via `bun run <script>` `` を、検出した package manager の run コマンドで実行する旨に更新する
- [x] JSDoc / comment のみの変更とし、実行ロジック（振る舞い）は変更しない

**Acceptance Criteria**:
- `src/core/verification/phases.ts` および `src/core/verification/runner.ts` に `bun run` という文字列が含まれない（grep で 0 件）
- verification の振る舞いに変更がない（diff は comment のみ）

## T-04: 全体検証

- [x] `bun run typecheck && bun run test` が green
- [x] `bun run lint` が green
- [x] `specrunner request template` の出力に `bun` が含まれないことを確認する

**Acceptance Criteria**:
- typecheck / test / lint がすべて green
- request template 出力に `bun` が含まれないことを確認済み
