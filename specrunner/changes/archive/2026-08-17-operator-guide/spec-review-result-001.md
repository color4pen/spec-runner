# Spec Review Result: operator-guide

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 仕様文書間の整合性

- **request.md ↔ design.md**: 9 topic の構成・命名・内容要件が一致。D1〜D6 の設計判断が要件 1〜6 を網羅している。
- **design.md ↔ tasks.md**: T-01〜T-06 の実装順序・受け入れ基準が設計意図と一致。T-01(registry) → T-02(command 登録) → T-03(escalation 導線) → T-04(init snippet) → T-05(skill diet) → T-06(テスト) の順序依存が正しく管理されている。
- **spec.md ↔ test-cases.md**: 全 Requirement に TC が存在し、21 件の TC が spec の各 Scenario と対応付けられている。

### 現行 CLI との照合（command-registry.ts 精読）

ガイド本文で言及されるすべての specrunner コマンドおよび flag を `src/cli/command-registry.ts` で直接確認した。

| コマンド / flag | 実在確認 |
|----------------|---------|
| `job start --detach` / `--issue <n>` | ✓ |
| `job wait <slug>` | ✓ |
| `job show <slug>` | ✓ |
| `job resume --from --force --prompt --prompt-file --apply-canon --adopt-commits --detach` | ✓ |
| `job reopen --from --reason`（`--apply-canon / --adopt-commits / --detach` なし） | ✓ 仕様と一致 |
| `job archive --with-merge` | ✓ |
| `job cancel --restore-draft` | ✓ |
| `job prune --force` | ✓ |
| `job attach --branch` | ✓ |
| `inbox run` | ✓ |
| `login --force` | ✓ |
| `credentials set claude-code / anthropic-api-key` | ✓ |
| `doctor` | ✓ |
| `init` | ✓ |
| `request template` / `request validate` | ✓ |
| `rules new <step> <slug>` | ✓ |
| `reviewers new <name>` | ✓ |
| `config effective [--type <t>]` | ✓ |
| `specrunner ps`（廃止）| 未登録 — parallel-request-workflow 削除で AC 達成 |
| `request review`（廃止）| 未登録 — 同上 |
| `job finish`（廃止）| 未登録 — 同上 |

### escalation 出力面の現状確認

- `formatEscalation`(`src/core/finish/escalation.ts`): ガイドヒント未搭載。T-03 で追加対象。
- `buildCanonEscalationReason`(`src/core/step/canon-escalation.ts`): ガイドヒント未搭載。T-03 で追加対象。leaf モジュール宣言（import は `kernel/report-result` 型のみ）を確認。
- 既存テスト `finish-escalation.test.ts`(TC-023) と `canon-escalation.test.ts`(TC-008/TC-012) は全て `toContain` ベースのため T-03 追加後も green を維持できる。

### 設計パターンの適合確認

- `request-prompt.ts` の「純粋 builder + 薄い handler」パターンと D1 設計が一致。
- `PIPELINE_MAP` drift-guard パターン（単一ソース `toContain`）と D1/T-06 の drift-guard 設計が一致。
- `generateTopLevelUsage()` の group 収集ロジックを確認: `help.group` + `help.summary` 両方の設定が必要。`groupOrder` に `"Guide"` が追加されれば TC-008 が通る構造。

### `resolveCommand` による guide コマンドの解決性検証

`resolveSpec` の実装を追跡: `guide` が children なし・handler あり であれば `resolveCommand(["guide"])` も `resolveCommand(["guide", "escalation"])` も `{ status: "ok" }` を返す。TC-017 の期待値と一致。

### dispatch flow と `requiresRepo` 不在の保証

`bin/specrunner.ts` を確認: `resolveEffectiveRequiresRepo(COMMANDS, canonicalPath)` が false のときは repo 非存在でも guard を素通りする。`guide` に `requiresRepo` を設定しなければ、repo 外での動作が保証される（spec.md: repo 外でも動作する Scenario に対応）。

### 廃止コマンド文字列の現状確認

現時点の 4 skill を走査した:
- `job-run-monitor` / `rebase-finish` / `acceptance-and-issue-audit`: `request review` / `job finish` / `specrunner ps` のいずれも存在しない。
- `parallel-request-workflow`: `request review` を含む。T-05 でディレクトリ丸ごと削除されるため AC 違反にはならない。

### セキュリティ観点

- ガイドコンテンツは静的 TS 定数。ネットワーク・repo 状態に非依存で、path traversal や injection の経路がない。
- CLAUDE.md への自動書込なし（要件 4 明示。`init.ts` の実装でも自動書込は行っていない）。
- `credentials set` の入力 echo 禁止は既存実装で担保済み。
- `--prompt` flag は operator 専用で、既存 CLI が runtime に警告を出力する。ガイドコンテンツへの記載は spec では要件化されていないが、operator 向けコンテンツとして許容範囲内。

---

## 検証できなかった項目

- **各 topic の body prose 内容**: guide 本文は implementer が記述するため現時点では存在しない。body が request.md の記載内容を正確に反映するかは後段ステップで確認が必要。
- **TC-003 の実際の repo 外 binary 実行**: `runGuide()` 直接呼び出しで intent は確認できるが、repo 外ディレクトリから binary を invoke する end-to-end は実施していない。
- **全 9 topic body のコマンド抽出正規表現の適用結果**: body が存在しないため、D6 の抽出パターンが全コマンドを正しく拾うかを現時点で実測できない。

---

## Findings 詳細

### F-01 [HIGH] TC-019 の優先度が "should" だが leaf モジュール不変条件として "must" に昇格すべき

**ファイル**: `specrunner/changes/operator-guide/test-cases.md`（TC-019）

D3 と T-03 の Acceptance Criteria は `canon-escalation.ts` の leaf モジュール制約（`guide.ts` を import しない）を設計不変条件として明示している。しかし TC-019 の Priority が "should" であるため、実装者がこのテストを省略しても test suite は green になり得る。

`guide.ts` が `stdoutWrite` 等の I/O に依存するモジュールになると想定されるため、`canon-escalation.ts` がそれを import した場合は leaf 制約が破れ、unit test での分離テスト性も損なわれる。

**修正**: test-cases.md TC-019 の Priority を `must` に変更し、T-06 の drift-guard 項目に明示的に追加する。

---

### F-02 [MEDIUM] 全 9 topic の body 非空を直接確認するテストケースが欠落

**ファイル**: `specrunner/changes/operator-guide/test-cases.md`（TC-002, TC-021）

受け入れ基準は「全 9 topic の本文を出力することをテストで固定する」と宣言しているが、test-cases.md で body が非空であることを確認するのは TC-021（jobs のみ）と TC-010（escalation のみ）の 2 topic にとどまる。残り 7 topic の body 非空は明示的に保証されない。

tasks.md T-06 には「全 9 topic が本文を返す」とあるが、TC-* として明示されていないため、test-case-gen または code-review ステップで見落とすリスクがある。

**修正**: TC-002 を全 9 topic を対象とした iterable 検証（各 `runGuide(t.name)` が 0 を返しかつ body が非空）に拡張するか、または TC を新設する。

---

### F-03 [MEDIUM] spec.md の「コマンド実在」Scenario がコマンド抽出の制限範囲を明記していない

**ファイル**: `specrunner/changes/operator-guide/spec.md`（Requirement: guide 本文の specrunner コマンドは現行 CLI に実在する）

design.md D6 の Risks 欄には「backtick 内の `specrunner <tokens>` のみを抽出、shorthand 形式（`job resume` 等）は検証対象外」と記載されているが、spec.md の対応 Scenario にはこの制限が記述されていない。

body 内で shorthand のみで記述されたコマンドは機械検証が漏れる。tasks.md T-01 には「完全形 `specrunner <path>` で最低 1 回書く」という対処方針があるが、spec.md の Scenario にも同内容の記述が必要。conformance ステップが spec を正典として機械照合する際にこの漏れが不可視になるリスクがある。

**修正**: spec.md 当該 Scenario の Given/Then に「本文中で backtick 内 `specrunner ` prefix を持つ完全形で最低 1 回記述されたコマンドが検証対象」と明記する。

---

### F-04 [LOW] TC-003 の "integration" 分類と tasks T-06 の unit test 配置が不一致

**ファイル**: `specrunner/changes/operator-guide/test-cases.md`（TC-003）

TC-003 は Category: "integration" だが、tasks.md T-06 は全テストを `src/core/command/__tests__/guide.test.ts`（vitest が unit として扱うディレクトリ）に配置する方針。`requiresRepo` 不在のため `runGuide()` 直接呼び出しで repo 外動作は unit test で確認できる。

実害は小さいが分類の不一致により、将来のテスト整理で誤解が生じる可能性がある。

**修正（任意）**: TC-003 の Category を "unit" に変更するか、binary 実行を伴う真の integration test として `tests/` 配下に分離することを T-06 に明記する。
