# Test Cases: readme-command-sync

## TC-01: request show が README から除去されている

- **Category**: Content correctness
- **Priority**: must
- **Source**: Task 1 / 受け入れ基準

**GIVEN** README.md を開く  
**WHEN** Command Reference の Request commands セクションを確認する  
**THEN** `request show` の記載が存在しない

---

## TC-02: request rm が README から除去されている

- **Category**: Content correctness
- **Priority**: must
- **Source**: Task 1 / 受け入れ基準

**GIVEN** README.md を開く  
**WHEN** Command Reference の Request commands セクションを確認する  
**THEN** `request rm` の記載が存在しない

---

## TC-03: job rm が README から除去されている

- **Category**: Content correctness
- **Priority**: must
- **Source**: Task 2 / 受け入れ基準

**GIVEN** README.md を開く  
**WHEN** Command Reference の Job commands セクションを確認する  
**THEN** `job rm` の記載が存在しない

---

## TC-04: job cancel が README に記載されている

- **Category**: Content correctness
- **Priority**: must
- **Source**: Task 2 / 受け入れ基準

**GIVEN** README.md を開く  
**WHEN** Command Reference の Job commands セクションを確認する  
**THEN** `job cancel <jobId>` の記載が存在する

---

## TC-05: managed Quick Start に init --runtime managed が含まれない

- **Category**: Content correctness
- **Priority**: must
- **Source**: Task 3 / 受け入れ基準

**GIVEN** README.md を開く  
**WHEN** managed runtime の Quick Start セクションを確認する  
**THEN** `init --runtime managed` の記載が存在しない

---

## TC-06: managed Quick Start の手順が正しい順序になっている

- **Category**: Content correctness
- **Priority**: must
- **Source**: Task 3 / design.md

**GIVEN** README.md を開く  
**WHEN** managed runtime の Quick Start セクションを確認する  
**THEN** コマンドが以下の順で記載されている:
1. `specrunner init`
2. `specrunner login`
3. `export SPECRUNNER_API_KEY=sk-ant-...`
4. `specrunner runtime setup`
5. `specrunner job start my-feature`

---

## TC-07: README の Request commands が command-registry.ts と 1:1 対応する

- **Category**: Alignment
- **Priority**: must
- **Source**: Task 4 / 受け入れ基準

**GIVEN** `src/cli/command-registry.ts` の COMMANDS.request.subcommands を参照する  
**WHEN** README の Request commands セクションに記載された全サブコマンド名・引数名を照合する  
**THEN** README に記載された識別子が command-registry.ts の定義と過不足なく一致し、`new` / `generate` / `ls` / `validate` / `template` / `review` の 6 コマンドのみ記載されている

---

## TC-08: README の Job commands が command-registry.ts と 1:1 対応する

- **Category**: Alignment
- **Priority**: must
- **Source**: Task 4 / 受け入れ基準

**GIVEN** `src/cli/command-registry.ts` の COMMANDS.job.subcommands を参照する  
**WHEN** README の Job commands セクションに記載された全サブコマンド名・引数名を照合する  
**THEN** README に記載された識別子が command-registry.ts の定義と過不足なく一致し、`start` / `ls` / `show` / `cancel` / `resume` / `finish` の 6 コマンドのみ記載されている

---

## TC-09: bun run typecheck が green

- **Category**: CI
- **Priority**: must
- **Source**: Task 5 / 受け入れ基準

**GIVEN** README.md のみを変更した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーなく終了する

---

## TC-10: bun run test が green

- **Category**: CI
- **Priority**: must
- **Source**: Task 5 / 受け入れ基準

**GIVEN** README.md のみを変更した状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass する

---

## TC-11: README.md 以外のファイルが変更されていない

- **Category**: Scope
- **Priority**: must
- **Source**: request.md スコープ外 / tasks.md「対象ファイル」

**GIVEN** git diff を確認する  
**WHEN** 変更ファイル一覧を確認する  
**THEN** 変更されているファイルは `README.md` のみである

---

## TC-12: README の env / alias セクションが command-registry.ts と一致する

- **Category**: Alignment
- **Priority**: should
- **Source**: Task 4 / design.md 全体照合表

**GIVEN** `src/cli/command-registry.ts` の USAGE 定数を参照する  
**WHEN** README の env（init / login / doctor / runtime）と alias（run）セクションを照合する  
**THEN** コマンド名・引数名が USAGE 定数と一致し、余分な記載も欠落もない

---

## TC-13: init.ts の --runtime flag エラーが README に反映されていない（スコープ外確認）

- **Category**: Out-of-scope verification
- **Priority**: could
- **Source**: request.md スコープ外 / design.md スコープ外

**GIVEN** `src/cli/commands/init.ts` の L15-18 を確認する  
**WHEN** README に `init.ts` 内部のエラーメッセージ（`managed setup`）への言及がないことを確認する  
**THEN** README は `runtime setup` の表記を使用しており、`managed setup` という記載が存在しない  
**NOTE** `init.ts` のエラーメッセージと help テキストの不整合は別 issue として扱う（本件スコープ外）
