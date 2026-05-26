# Test Cases: lint-mechanical-verification

## Category Index

- [A. Config Schema Validation](#a-config-schema-validation)
- [B. Command Normalization](#b-command-normalization)
- [C. Command Execution (`sh -c`)](#c-command-execution-sh--c)
- [D. Verification Runner Branching](#d-verification-runner-branching)
- [E. Failure Output Display](#e-failure-output-display)
- [F. Backward Compatibility / Fallback](#f-backward-compatibility--fallback)
- [G. ESLint Setup](#g-eslint-setup)
- [H. Dogfood Integration](#h-dogfood-integration)
- [I. Documentation](#i-documentation)

---

## A. Config Schema Validation

### A-01 — string command が valid と判定される

- **Category**: Config Schema Validation
- **Priority**: must
- **Source**: Task 2, Task 13 / 受け入れ基準「command schema が `string | { name?: string; run: string }` の union 型として認識される」

**GIVEN** `verification.commands` に non-empty string の要素のみを含む配列を設定した config  
**WHEN** `validateConfig()` を呼ぶ  
**THEN** validation が通過し、error を返さない

---

### A-02 — `{ run }` object (name 省略) が valid と判定される

- **Category**: Config Schema Validation
- **Priority**: must
- **Source**: Task 2, Task 13

**GIVEN** `verification.commands` の要素に `{ "run": "pytest -v" }` (name 無し object) を含む config  
**WHEN** `validateConfig()` を呼ぶ  
**THEN** validation が通過し、error を返さない

---

### A-03 — `{ name, run }` object が valid と判定される

- **Category**: Config Schema Validation
- **Priority**: must
- **Source**: Task 2, Task 13

**GIVEN** `verification.commands` の要素に `{ "name": "type", "run": "mypy" }` を含む config  
**WHEN** `validateConfig()` を呼ぶ  
**THEN** validation が通過し、error を返さない

---

### A-04 — string / object が混在する配列が valid と判定される

- **Category**: Config Schema Validation
- **Priority**: must
- **Source**: Task 2, Task 13

**GIVEN** `verification.commands` に `["ruff check", { "run": "pytest -v" }, { "name": "type", "run": "mypy" }]` を設定した config  
**WHEN** `validateConfig()` を呼ぶ  
**THEN** validation が通過し、error を返さない

---

### A-05 — `verification` section が undefined (未定義) でも valid と判定される

- **Category**: Config Schema Validation
- **Priority**: must
- **Source**: Task 2, Task 13 / D3 fallback 戦略

**GIVEN** `verification` key を含まない config  
**WHEN** `validateConfig()` を呼ぶ  
**THEN** validation が通過し、error を返さない

---

### A-06 — `commands` が空配列でも valid と判定される

- **Category**: Config Schema Validation
- **Priority**: must
- **Source**: Task 2, Task 13

**GIVEN** `verification.commands` が `[]` の config  
**WHEN** `validateConfig()` を呼ぶ  
**THEN** validation が通過し、error を返さない

---

### A-07 — `commands` が配列でない場合に CONFIG_INVALID を返す

- **Category**: Config Schema Validation
- **Priority**: must
- **Source**: Task 2, Task 13

**GIVEN** `verification.commands` に文字列 (`"bun run test"`) を直接設定した config (配列でない)  
**WHEN** `validateConfig()` を呼ぶ  
**THEN** `CONFIG_INVALID` エラーが返り、error message に `verification.commands` というキーパスが含まれる

---

### A-08 — commands 要素が空文字列の場合に CONFIG_INVALID を返す

- **Category**: Config Schema Validation
- **Priority**: must
- **Source**: Task 2, Task 13

**GIVEN** `verification.commands` に空文字列 `""` を含む config  
**WHEN** `validateConfig()` を呼ぶ  
**THEN** `CONFIG_INVALID` エラーが返り、error message に `verification.commands[N]` というキーパスが含まれる

---

### A-09 — object 要素の `run` が空文字列の場合に CONFIG_INVALID を返す

- **Category**: Config Schema Validation
- **Priority**: must
- **Source**: Task 2, Task 13

**GIVEN** `verification.commands` に `{ "name": "lint", "run": "" }` を含む config  
**WHEN** `validateConfig()` を呼ぶ  
**THEN** `CONFIG_INVALID` エラーが返り、error message に `verification.commands[N].run` というキーパスが含まれる

---

### A-10 — commands 要素が string でも object でもない場合に CONFIG_INVALID を返す

- **Category**: Config Schema Validation
- **Priority**: must
- **Source**: Task 2, Task 13

**GIVEN** `verification.commands` に `42` (number) を含む config  
**WHEN** `validateConfig()` を呼ぶ  
**THEN** `CONFIG_INVALID` エラーが返り、error message に不正な型であることが示される

---

### A-11 — `verification` が object でない場合に CONFIG_INVALID を返す

- **Category**: Config Schema Validation
- **Priority**: should
- **Source**: Task 2

**GIVEN** `verification` に文字列 `"commands"` を設定した config  
**WHEN** `validateConfig()` を呼ぶ  
**THEN** `CONFIG_INVALID` エラーが返る

---

## B. Command Normalization

### B-01 — string が `{ name: undefined, run: string }` に正規化される

- **Category**: Command Normalization
- **Priority**: must
- **Source**: Task 3, Task 11 / 受け入れ基準「各 schema variant で normalize が正しく動く unit test」

**GIVEN** `normalizeCommands(["ruff check"])` を呼ぶ  
**WHEN** 関数が実行される  
**THEN** `[{ name: undefined, run: "ruff check" }]` が返る

---

### B-02 — `{ run }` (name 省略) が `{ name: undefined, run }` に正規化される

- **Category**: Command Normalization
- **Priority**: must
- **Source**: Task 3, Task 11

**GIVEN** `normalizeCommands([{ run: "pytest -v" }])` を呼ぶ  
**WHEN** 関数が実行される  
**THEN** `[{ name: undefined, run: "pytest -v" }]` が返る

---

### B-03 — `{ name, run }` がそのまま保持される

- **Category**: Command Normalization
- **Priority**: must
- **Source**: Task 3, Task 11

**GIVEN** `normalizeCommands([{ name: "type", run: "mypy" }])` を呼ぶ  
**WHEN** 関数が実行される  
**THEN** `[{ name: "type", run: "mypy" }]` が返る

---

### B-04 — 混在配列の全要素が正しく正規化される

- **Category**: Command Normalization
- **Priority**: must
- **Source**: Task 3, Task 11

**GIVEN** `normalizeCommands(["ruff check", { run: "pytest -v" }, { name: "type", run: "mypy" }])` を呼ぶ  
**WHEN** 関数が実行される  
**THEN** 3 要素の配列が返り、順序・値が仕様通りに正規化されている

---

### B-05 — 空配列を渡すと空配列が返る

- **Category**: Command Normalization
- **Priority**: should
- **Source**: Task 3

**GIVEN** `normalizeCommands([])` を呼ぶ  
**WHEN** 関数が実行される  
**THEN** `[]` が返る

---

## C. Command Execution (`sh -c`)

### C-01 — exit code 0 の command が passed として扱われる

- **Category**: Command Execution
- **Priority**: must
- **Source**: Task 4 / 要件「exit code 0 → passed」

**GIVEN** `spawnCommand("exit 0", cwd)` を呼ぶ  
**WHEN** コマンドが実行される  
**THEN** exit code 0 が返り、passed 判定される

---

### C-02 — exit code 非ゼロの command が failed として扱われる

- **Category**: Command Execution
- **Priority**: must
- **Source**: Task 4 / 要件「non-zero → failed」

**GIVEN** `spawnCommand("exit 1", cwd)` を呼ぶ  
**WHEN** コマンドが実行される  
**THEN** exit code 1 が返り、failed 判定される

---

### C-03 — `&&` 連結 command が shell 経由で実行される

- **Category**: Command Execution
- **Priority**: must
- **Source**: D2「`sh -c <command>` 経由で実行」/ 要件「`ruff check && mypy` のような連結 OK」

**GIVEN** `spawnCommand("true && true", cwd)` を呼ぶ  
**WHEN** コマンドが実行される  
**THEN** exit code 0 が返る (shell 連結が機能する)

---

### C-04 — パイプを含む command が実行される

- **Category**: Command Execution
- **Priority**: should
- **Source**: D2「パイプ / リダイレクト / glob / 環境変数展開を使用可能」

**GIVEN** `spawnCommand("echo hello | grep hello", cwd)` を呼ぶ  
**WHEN** コマンドが実行される  
**THEN** exit code 0 が返る

---

### C-05 — stdout / stderr が collect される

- **Category**: Command Execution
- **Priority**: should
- **Source**: Task 4「stdout / stderr を collect」

**GIVEN** `spawnCommand("echo 'out' && echo 'err' >&2", cwd)` を呼ぶ  
**WHEN** コマンドが実行される  
**THEN** stdout に `out` が、stderr に `err` が含まれる

---

## D. Verification Runner Branching

### D-01 — `commands` 定義時に commands 経路が使われる

- **Category**: Verification Runner Branching
- **Priority**: must
- **Source**: Task 5, Task 12 / 受け入れ基準「配列順に sequential 実行される」

**GIVEN** `verification.commands` に 2 要素の配列を持つ project local config  
**WHEN** `runVerification()` を実行する  
**THEN** 2 つの command が配列の順番通りに実行され、phase 検出 fallback は使われない

---

### D-02 — `commands` 未定義時に phase 検出 fallback が発動する

- **Category**: Verification Runner Branching
- **Priority**: must
- **Source**: Task 5, Task 12 / 受け入れ基準「`commands` 未定義時、現状の phase 検出 fallback で既存挙動と一致」

**GIVEN** `verification` section を含まない project local config  
**WHEN** `runVerification()` を実行する  
**THEN** 既存の `PHASE_SCRIPTS`（`bun run build`, `bun run typecheck` 等）経路が発動する

---

### D-03 — commands 経路で全 command passed の場合 verdict が passed になる

- **Category**: Verification Runner Branching
- **Priority**: must
- **Source**: Task 12

**GIVEN** `verification.commands` に 3 つの command を設定し、全て exit code 0 で終了する  
**WHEN** `runVerification()` を実行する  
**THEN** verdict が `passed` になる

---

### D-04 — commands 経路で 2 番目が failed の場合 3 番目以降が skipped になる (fail-fast)

- **Category**: Verification Runner Branching
- **Priority**: must
- **Source**: Task 5, Task 12 / 要件「fail-fast (= 1 件失敗で残り skip)」

**GIVEN** `verification.commands` に 3 つの command を設定し、2 番目が exit code 1 で失敗する  
**WHEN** `runVerification()` を実行する  
**THEN** 3 番目の command は実行されず skipped 扱いになり、verdict が `failed` になる

---

### D-05 — commands 配列が空の場合 VERIFICATION_NO_RUNNABLE_PHASES に相当する挙動になる

- **Category**: Verification Runner Branching
- **Priority**: should
- **Source**: Task 5 / 「空配列は valid（= 全 command skip → VERIFICATION_NO_RUNNABLE_PHASES と同等）」

**GIVEN** `verification.commands` が空配列 `[]` の config  
**WHEN** `runVerification()` を実行する  
**THEN** verdict が `failed` になり、VERIFICATION_NO_RUNNABLE_PHASES に相当するエラーが報告される

---

### D-06 — `PhaseResult.phase` に `name` が設定されている場合はその name が使われる

- **Category**: Verification Runner Branching
- **Priority**: must
- **Source**: Task 5 / 「`PhaseResult` の `phase` field には `name` があればそれを、無ければ command 文字列を使用」

**GIVEN** `{ "name": "lint", "run": "bun run lint" }` を commands に含む config  
**WHEN** `runVerification()` を実行する  
**THEN** PhaseResult の phase field が `"lint"` になる

---

### D-07 — `PhaseResult.phase` に `name` が無い場合は command 文字列が使われる

- **Category**: Verification Runner Branching
- **Priority**: must
- **Source**: Task 5 / 「`name` が無ければ command 文字列を使用」

**GIVEN** `"bun run test"` (string) を commands に含む config  
**WHEN** `runVerification()` を実行する  
**THEN** PhaseResult の phase field が `"bun run test"` になる

---

## E. Failure Output Display

### E-01 — name あり failure 時に `Step '<name>' failed` が表示される

- **Category**: Failure Output Display
- **Priority**: must
- **Source**: Task 12, D6 / 要件「`name` があれば「`Step '<name>' failed`」」/ 受け入れ基準「name あれば label 表示」

**GIVEN** `{ "name": "type", "run": "mypy" }` が失敗する commands 設定  
**WHEN** `runVerification()` を実行する  
**THEN** failure output に `Step 'type' failed` が含まれる

---

### E-02 — name なし failure 時に `Step '<command>' failed` が表示される

- **Category**: Failure Output Display
- **Priority**: must
- **Source**: Task 12, D6 / 要件「`name` が無ければ command 自体を表示」/ 受け入れ基準「無ければ command 文字列表示」

**GIVEN** `"mypy"` (string) が失敗する commands 設定  
**WHEN** `runVerification()` を実行する  
**THEN** failure output に `Step 'mypy' failed` が含まれる

---

### E-03 — verification-result.md の出力に name が反映される

- **Category**: Failure Output Display
- **Priority**: should
- **Source**: Task 5 / 「verification-result.md の出力: commands 経路でも同じ format」

**GIVEN** `{ "name": "lint" }` を含む commands 設定で verification を実行した後の verification-result.md  
**WHEN** Phase Results 表を確認する  
**THEN** phase 列に `lint` が表示される (command 文字列ではなく name)

---

## F. Backward Compatibility / Fallback

### F-01 — `verification.commands` 未設定の既存 TS/Bun project で regression なし

- **Category**: Backward Compatibility
- **Priority**: must
- **Source**: D3, Task 5, Task 12 / 受け入れ基準「regression なし」

**GIVEN** `.specrunner/config.json` に `verification` section が無い TS/Bun project  
**WHEN** `runVerification()` を実行する  
**THEN** 既存の `build / typecheck / test / lint / security` phase が `bun run` で順次実行され、動作が従来と変わらない

---

### F-02 — `verification` section はあるが `commands` key が undefined の場合も fallback が発動する

- **Category**: Backward Compatibility
- **Priority**: must
- **Source**: D3, Task 5

**GIVEN** `{ "verification": {} }` (commands 無し) の config  
**WHEN** `runVerification()` を実行する  
**THEN** phase 検出 fallback が発動し、`PHASE_SCRIPTS` 経路が使われる

---

### F-03 — 旧 `PhaseName` / `PHASE_SCRIPTS` が fallback 経路で引き続き動作する

- **Category**: Backward Compatibility
- **Priority**: must
- **Source**: D3 / 要件「旧 `PhaseName` / `PHASE_SCRIPTS` の固定 phase 概念は本 request 後も internal 互換 fallback として残す」

**GIVEN** fallback 経路が選択される設定  
**WHEN** `runVerification()` を実行し build/typecheck/test/lint/security script が全て存在する  
**THEN** 全 phase が順次実行され、`PHASE_SCRIPTS` の定義通りに `bun run <name>` が呼ばれる

---

## G. ESLint Setup

### G-01 — `bun run lint` が 0 warnings / 0 errors で完了する

- **Category**: ESLint Setup
- **Priority**: must
- **Source**: Task 7, 8, 9 / 受け入れ基準「`bun run lint` が動き、0 warnings / 0 errors になっている」

**GIVEN** eslint.config.js と package.json の lint script が設定された spec-runner repo  
**WHEN** `bun run lint` を実行する  
**THEN** exit code 0 で終了し、stdout に warnings / errors がゼロであることが示される

---

### G-02 — 既存 11 件の dead code 違反が解消されている

- **Category**: ESLint Setup
- **Priority**: must
- **Source**: Task 9 / 受け入れ基準「既存 11 件の dead code が解消されている」

**GIVEN** 11 件の違反対象ファイル (job-show.ts, ps.ts, pipeline-run.ts, runner.ts, event-bus.ts, derive-usage.ts, orchestrator.ts, spec-merge.ts, design-system.ts, job-state-store.ts) を修正した状態  
**WHEN** `bun run lint` を実行する  
**THEN** これらのファイルに関する `no-unused-vars` / `prefer-const` / redundant-disable 警告が一切出ない

---

### G-03 — eslint.config.js が flat config 形式で `typescript-eslint.configs.recommended` を base にしている

- **Category**: ESLint Setup
- **Priority**: must
- **Source**: Task 8 / 要件「base: `typescript-eslint.configs.recommended`」

**GIVEN** repo root の `eslint.config.js`  
**WHEN** ファイルの内容を確認する  
**THEN** flat config 形式であり、`typescript-eslint.configs.recommended` を spread / extends している

---

### G-04 — `src/` のみが lint 対象で `tests/` は対象外

- **Category**: ESLint Setup
- **Priority**: must
- **Source**: Task 8, D5 / 要件「ignores: `dist/**`, `node_modules/**`, `tests/**`, `**/*.test.ts`, `**/__tests__/**`」

**GIVEN** eslint.config.js の ignores 設定  
**WHEN** `bun run lint` を実行する  
**THEN** `tests/` 配下のファイルに関する lint エラーは報告されない

---

### G-05 — 追加 rule (prefer-const, no-unreachable 等) が有効になっている

- **Category**: ESLint Setup
- **Priority**: should
- **Source**: Task 8 / 要件「追加 rule: `prefer-const`, `no-unreachable`, `no-empty`, `no-constant-condition`」

**GIVEN** `eslint.config.js` の rules 設定  
**WHEN** `prefer-const` / `no-unreachable` / `no-empty` / `no-constant-condition` に違反するコードを `src/` に追加して lint する  
**THEN** それぞれの rule で警告が報告される

---

### G-06 — `--max-warnings 0` が設定されており warning 1 件で CI が落ちる

- **Category**: ESLint Setup
- **Priority**: must
- **Source**: Task 8 / 要件「`"lint": "eslint ./src --max-warnings 0"`」

**GIVEN** `package.json` の lint script が `eslint ./src --max-warnings 0`  
**WHEN** warning が 1 件以上ある状態で `bun run lint` を実行する  
**THEN** exit code が非ゼロになる

---

### G-07 — `bun run typecheck && bun run test` が green のまま

- **Category**: ESLint Setup
- **Priority**: must
- **Source**: Task 9 / 受け入れ基準「`bun run typecheck && bun run test` が green」

**GIVEN** dead code 11 件修正後の状態  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 両コマンドが exit code 0 で完了する (regression なし)

---

## H. Dogfood Integration

### H-01 — `.specrunner/config.json` に `verification.commands` が設定されている

- **Category**: Dogfood Integration
- **Priority**: must
- **Source**: Task 10 / 受け入れ基準「`.specrunner/config.json` で `verification.commands` に `"bun run lint"` が追加され」

**GIVEN** repo root の `.specrunner/config.json`  
**WHEN** ファイルの内容を確認する  
**THEN** `verification.commands` 配列に `"bun run lint"` が含まれ、`"bun run build"`, `"bun run typecheck"`, `"bun run test"` も含まれている

---

### H-02 — dogfood verify pipeline で `bun run lint` が実行される

- **Category**: Dogfood Integration
- **Priority**: must
- **Source**: Task 10 / 受け入れ基準「lint が verify pipeline で走る」

**GIVEN** Task 10 で設定した `.specrunner/config.json` と Task 5 で実装した commands 経路  
**WHEN** spec-runner 自身の verify pipeline を実行する  
**THEN** `bun run lint` コマンドが commands 経路で実行される

---

### H-03 — dogfood verify pipeline で commands が設定順に実行される

- **Category**: Dogfood Integration
- **Priority**: must
- **Source**: Task 10 / 受け入れ基準「配列順に sequential 実行される」

**GIVEN** `.specrunner/config.json` の `verification.commands` が `["bun run build", "bun run typecheck", "bun run test", "bun run lint"]`  
**WHEN** verify pipeline を実行する  
**THEN** build → typecheck → test → lint の順で実行される

---

### H-04 — 既存の他の config 設定が `verification` 追加で壊れない

- **Category**: Dogfood Integration
- **Priority**: should
- **Source**: Task 10 / 「既存 config に deep merge で追記（他の設定を壊さない）」

**GIVEN** `verification` 以外の設定（例: `llm`, `github` 等）を含む既存の `.specrunner/config.json`  
**WHEN** `verification` section を追加する  
**THEN** 他の設定値が変わらず保持される

---

## I. Documentation

### I-01 — `specrunner/project.md` に `verification.commands` schema の説明が追加されている

- **Category**: Documentation
- **Priority**: must
- **Source**: Task 14 / 受け入れ基準「`specrunner/project.md`: verification セクションに schema の説明と config 例を追加」

**GIVEN** 更新後の `specrunner/project.md`  
**WHEN** verification セクションを確認する  
**THEN** `verification.commands` の schema 説明（string / object union 型、`sh -c` 経由実行、fail-fast、未定義時 fallback）と config 例が記載されている

---

### I-02 — `README.md` に lint failure の troubleshooting が追記されている

- **Category**: Documentation
- **Priority**: must
- **Source**: Task 15 / 受け入れ基準「`README.md`: troubleshooting に lint failure 対処の 1 段落追記」

**GIVEN** 更新後の `README.md`  
**WHEN** troubleshooting セクションを確認する  
**THEN** `bun run lint --fix` で auto fix し残りを手動修正する旨の説明が追記されている

---

### I-03 — delta spec の verification-runner spec が design と整合している

- **Category**: Documentation
- **Priority**: should
- **Source**: Task 16

**GIVEN** `specrunner/changes/lint-mechanical-verification/specs/verification-runner/spec.md`  
**WHEN** design.md の Affected Specs と照合する  
**THEN** commands 配列抽象化の変更内容が spec に反映されている

---

### I-04 — delta spec の cli-config-store spec が design と整合している

- **Category**: Documentation
- **Priority**: should
- **Source**: Task 17

**GIVEN** `specrunner/changes/lint-mechanical-verification/specs/cli-config-store/spec.md`  
**WHEN** design.md の Affected Specs と照合する  
**THEN** `verification` section の config schema 追加が spec に反映されている

---
