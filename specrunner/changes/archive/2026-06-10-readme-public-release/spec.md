# Spec: README を公開向けに拡充する

## Requirements

### Requirement: README pipeline 節の step 名は STEP_NAMES と一致しなければならない

README の pipeline 概要が参照する step 名は、`src/kernel/step-names.ts` の `STEP_NAMES` が定義する
canonical な値と一致し続けなければならない（MUST）。`STEP_NAMES` の全値が README 本文に出現しなければならない。
これにより、step の追加・改名時に README が無言で陳腐化することを防ぐ。

#### Scenario: 全 canonical step 名が README に存在する

**Given** `src/kernel/step-names.ts` が `STEP_NAMES` を export している
**When** ドリフトガードテストが `README.md` の本文と `Object.values(STEP_NAMES)` を突き合わせる
**Then** `STEP_NAMES` の全値（`request-review` / `design` / `spec-review` / `spec-fixer` / `test-case-gen` / `implementer` / `verification` / `build-fixer` / `code-review` / `code-fixer` / `conformance` / `adr-gen` / `pr-create`）が README に出現する

#### Scenario: canonical でない step 名は混入していない（改名検出）

**Given** ある step が将来 `STEP_NAMES` 上で改名される
**When** README が旧名のまま残り新名を含まない
**Then** ドリフトガードテストは「新名が README に存在しない」ことで失敗する

### Requirement: README は公開向け 4 節を備えなければならない

README は (A) 安定性宣言、(B) pipeline 概要、(C) コスト目安、(D) 前提と対応範囲の 4 節を
含まなければならない（MUST）。各節は `##` 見出しを持つ。

#### Scenario: 4 つの新節見出しが README に存在する

**Given** 本変更が README に 4 節を追記した後の状態
**When** ドリフトガードテストが README の見出しを走査する
**Then** 安定性宣言・pipeline 概要・コスト目安・前提と対応範囲に対応する 4 つの `##` 見出しが存在する

### Requirement: 追記は既存節を変更してはならない

本変更は README への追記のみであり（MUST）、既存節（Installation / Quick Start / Environment Variables /
Command Reference / Configuration / Runtime Modes / Troubleshooting）の本文に差分を生じさせてはならない。

#### Scenario: 既存節のテキストが不変である

**Given** 変更前の README の既存節
**When** 本変更を適用する
**Then** 既存節の各行は変更前と同一で、差分は新節の挿入のみである
