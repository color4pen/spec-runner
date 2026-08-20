# Design: --from の検証正本を core に一本化し CLI 静的 enum を撤去する

## Context

`job resume --from` / `job reopen --from` の値検証が CLI と core の 2 箇所に分散している。

CLI 側（`command-registry.ts`）は `values: [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]` という静的 enum でパーサー段に制約を持つ。core 側（`resolve-step.ts`）は `buildAllowedStepSet(reviewers)` で job 状態に応じた許可集合を動的に構築し、`resolveResumeStep` が検証する。

問題: core は custom reviewers がある job で `regression-gate` / `custom-reviewers` / member 名（→ coordinator 写像）を許可するが、CLI の静的 enum がこれらを parser 段で `ARG_ERROR(2)` 拒否するため core に到達できない。さらに CLI の `values` を外した後は、`resolveResumeStep` が throw しても catch が一律 `PrepareError(1, ...)` を投げるため、`--from` による引数誤りと job 状態に起因する失敗で exit code が区別されない。

### 関連コードの前提

| 場所 | 現状 |
|------|------|
| `command-registry.ts:1061` | resume `from` flag: `{ type: "string", values: [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES] as const }` |
| `command-registry.ts:1197` | reopen `from` flag: 同上 |
| `command-registry.ts:368-373` | resume usage: "composite steps ... are not valid --from targets" と記載 |
| `command-registry.ts:500` | reopen usage: 静的 step 一覧のみ列挙 |
| `resume.ts:262-267` | `resolveResumeStep` throw を `PrepareError(1, ...)` で包む |
| `reopen.ts:222-227` | `resolveResumeStep` throw を `PrepareError(1, ...)` で包む |
| `resolve-step.ts` | core は既に正しい。`buildAllowedStepSet` / `resolveResumeStep` / `mapMemberToCoordinator` は触らない |

## Goals / Non-Goals

**Goals**:
- CLI `from` flag から静的 `values` 制約を撤去し、検証を core 一本に集約する
- `--from` 明示指定での resolve 失敗を exit 2、未指定での resume 位置決定失敗を exit 1 に区別する
- usage text を core の実能力に合わせて更新する

**Non-Goals**:
- `buildAllowedStepSet` / `resolveResumeStep` / `mapMemberToCoordinator` の変更
- `--from-issue` 経路の固有変更（flag passthrough で自動適用済み）
- legacy alias の整理・削除
- findings-ledger / regression-gate の裁定接続（issue #1022）

## Decisions

### D1: CLI `from` flag を `{ type: "string" }` に単純化する

`values:` を削除するだけ。flag-parser の enum 検証が無効になり、任意文字列を受理するようになる。検証責務は一切 core へ移譲する。

**Rationale**: parser 段では job state（reviewers の有無）が読めないため、静的 enum は「state 非依存の部分集合」しか表現できない。動的許可集合を CLI parser で再現するには state 読み込みが必要になり、検証が 2 箇所になる。削除して core に一本化するのが唯一の正しい構造。

**Alternatives**: CLI enum を動的化（parser 前に state 読み込み）→ 却下。slug 解決前に state が読めない構造上の矛盾があり、検証 2 箇所問題も残る。

### D2: resume.ts の exit code 区別

`resolveResumeStep` が throw した際、`this.options.from !== undefined` で条件分岐する。

- `from !== undefined` → `PrepareError(2, ...)` （引数誤り、`ARG_ERROR` 相当）
- `from === undefined` → `PrepareError(1, ...)` （job 状態の問題、従来どおり）

catch ブロック内の 1 行条件式で区別できるため、新しい abstraction は不要。

**Rationale**: `--from` を明示指定して resolve 失敗した場合は利用者の引数誤りであり、CLI parser 拒否時代の `ARG_ERROR(2)` 契約を維持する。未指定で復帰点が決定できない場合は job 状態の問題（変更なし）。

**Alternatives**: なし。条件式が唯一の最小変更。

### D3: reopen.ts の exit code 変更（常に exit 2）

`ReopenOptions.from` は `string`（必須）。reopen では `--from` は常に指定されているため、resolve 失敗は常に exit 2。現行の `PrepareError(1, ...)` を `PrepareError(2, ...)` に無条件変更する。

**Rationale**: reopen の `--from` は CLI で必須 check（`ARG_ERROR` で exit）されており、コアに到達する時点で必ず指定されている。よって条件分岐は不要。

**Alternatives**: D2 と同じ条件式を書く → 不要な分岐。`from` が空になることは型上ありえない。

### D4: usage text は定数文字列を直接書き換える

`JOB_RESUME_USAGE` の `--from` 説明を書き換える。動的 step（reviewers がある job での `regression-gate` / `custom-reviewers` / member 名）に言及し、"composite steps are not valid" 注記を削除する。`REOPEN_USAGE` にも同趣旨の注記を追加する。`bite-evidence` の internal step 注記は維持する。

**Rationale**: runtime 生成は不要。compile time 固定の prose で十分。

**Alternatives**: なし。

## Risks / Trade-offs

- [Risk] CLI が任意文字列を受理するため、完全な誤入力は core の error message に委ねられる。→ core は `Available step names: <list>` を throw メッセージに含む（`resolve-step.ts:112-116`）ため利用者体験は維持できる。
- [Risk] reopen の exit code が 1 → 2 に変わることで、既存の reopen エラーハンドリングスクリプトが影響を受ける可能性。→ reopen は operator 専用コマンドであり実害は低い。また従来の exit 1 は設計上の誤りだったため修正が正しい。

## Open Questions

なし。設計判断はすべて request.md の architect 評価で確定済み。
