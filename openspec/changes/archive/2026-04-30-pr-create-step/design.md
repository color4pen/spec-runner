## Context

SpecRunner pipeline は PR #36（implementer + verification + build-fixer）と PR #38（code-review + code-fixer）の累積で `propose → spec-review (loop) → implementer → verification (loop) → code-review (loop) → end` まで自走する。本 request はこの末尾に **`pr-create` step** を追加し、`code-review approved → pr-create → end` に書き換える last-mile。

現状、code-review が approved した時点で job は `end` に至り、ユーザーが手動で `gh pr create` を打つ必要がある。pipeline の全自走化（要件 → PR 作成）が self-host 完成の最終条件。

設計対称性:

| Layer | 創造的 step | Verdict 生成 | Fixer | Loop 構造 |
|-------|-----------|------------|------|-----------|
| spec | propose | spec-review | spec-fixer | review needs-fix → spec-fixer → review |
| code (build) | implementer | verification | build-fixer | verify fail → build-fixer → verify |
| code (review) | — | code-review | code-fixer | review needs-fix → code-fixer → review |
| **publish** | **pr-create** | — | — | **単発 step（loop なし）** |

pr-create が他の step 群と異なる特徴:
- **冪等でない**: 1 回成功すれば終わり。PR の re-create は不可
- **loop を持たない**: verdict と fixer の組み合わせが存在しない
- **失敗時は escalation 一択**: gh CLI 失敗（rate limit / network / auth）は LLM agent でも fix 困難なため、人間判断を仰ぐ

既存制約:
- `kind` discriminator（PR #36 / ADR-20260430-step-kind-discriminator）により `kind: "agent" | "cli"` が明示される。`pr-create` は `cli` を選ぶ
- `JobState` は session 横断の状態を保持する。本 request で `pullRequest?` field を追加
- request.md の section 抽出は既存 parser（`src/parser/request-md.ts`）を再利用または拡張する

## Goals / Non-Goals

**Goals:**
- code-review approved → pr-create → end の transition を pipeline state machine に組み込む
- `gh pr create` 経由で PR を立てる CLI runner を実装し、verdict 生成は不要（result file に `Status: success | failed` を吐く形で `parseResult` する）
- 同 branch に対する既存 OPEN PR を検出して新規作成を回避（冪等性）
- PR title / body を request.md と pipeline 実行サマリから自動生成
- `JobState.pullRequest = { url, number, createdAt }` を記録し `specrunner ps` で参照可能にする
- ADR を `openspec-workflow/adr/` に出力し、kind=cli 採用判断 / merge 戦略 / commit message 規約 / PR body template 設計を記録する

**Non-Goals:**
- E2E 実機検証 / self-hosting 検証（本 request 完了後に dogfooding として別途実施）
- PR auto-merge / auto-approve（既存 `/request-merge` skill に分離）
- release notes 生成（別 request）
- PR template の rich format（findings table / spec link 等）
- 学習層（EventBus subscriber）/ cost ledger（別系統）
- PR base branch を config 経由で可変にする（初版は `main` 固定）

## Decisions

### D1. `kind: "cli"` を採用する

**選択**: pr-create step は `kind: "cli"` で実装する（`gh` CLI を spec-runner CLI 内で直接 spawn）。

**代替案**: `kind: "agent"` — pr-create 専用 agent を作成し、agent が gh CLI を tool で呼ぶ

**理由**:
- LLM が必要なのは「PR body の整形」だが、これは template + state からの mechanical 抽出で十分
- verification と同じ pattern で実装でき、認知負荷が低い
- LLM コスト不要、retry 機械的、test 容易（`gh` CLI を spawn する process layer をモック可能）
- 失敗時の retry 制御が決定的（rate limit / auth エラーは LLM 介入で fix できない）

### D2. 既存 PR 検出時の挙動

**選択**:
- 同 branch の **OPEN** PR があれば URL を state に記録するだけで success
- 同 branch の **MERGED** PR があれば escalation（branch 再利用ケース。人間判断要）
- 同 branch の **CLOSED** PR があれば escalation（人間判断要）

**理由**:
- pipeline 全体の冪等性（同 branch から再 run 時に既存 OPEN PR を検出して success）が成立する
- MERGED / CLOSED 検出時の自動再作成は branch 命名汚染や履歴破壊リスクがあり、escalation のほうが安全

### D3. PR base branch は `main` 固定

**選択**: 初版は `main` 固定。config 経由可変化は後続 request で対応。

**代替案**: `pipeline-config.yaml` に `pr.baseBranch` を追加して可変にする

**理由**: 現状の SpecRunner workflow は main branch ベースを前提として設計されており、可変化は YAGNI。実需が出てから対応する。

### D4. PR body content は request.md ベースの独立生成

**選択**: PR body は request.md の `## 背景` / `## 目的` + pipeline 実行サマリから独立に生成する。implementer / code-fixer の commit messages は流用しない。

**代替案**: commit messages を集約して PR body に流し込む

**理由**:
- commit messages は noisy になりがち（fix-up / chore / refactor が混在）
- request.md は人間が書いた一次情報で、PR の意図を最も簡潔に表現する
- iteration ごとに commit messages の品質がぶれるが、request.md は固定

PR body の構造:

```markdown
## Summary
<request.md の ## 背景 と ## 目的 を圧縮>

## Workflow
| Phase | Verdict | Iterations | Result Path |
|-------|---------|-----------|-------------|
| spec-review | approved | N | openspec/changes/<slug>/spec-review-result-NNN.md |
| verification | passed | N | <verification log path> |
| code-review | approved | N | openspec/changes/<slug>/review-feedback-NNN.md |

## Test plan
<verification phase 結果から自動生成>

🤖 Generated with SpecRunner
```

### D5. resultFilePath / parseResult contract

**選択**:
- resultFilePath: `openspec/changes/<slug>/pr-create-result.md`
- parseResult: `## Status: success | failed` を regex 抽出して verdict（success / error）に map

**代替案**: 構造化された JSON ファイル（`pr-create-result.json`）

**理由**: 他の step（verification / spec-review / code-review）も markdown を採用しており、人間可読性 + 既存 parser pattern の踏襲を優先。

### D6. 失敗時の retry 戦略

**選択**: retry なし、即 escalation。

**理由**:
- pipeline 全体の冪等性で再実行可能（同 branch から再 run 時に既存 OPEN PR を検出する）
- gh CLI 失敗の典型（rate limit / network / auth expired）は LLM では fix できないため fixer loop に意味がない
- 人間に escalate した方が早い

### D7. transition 削除を 1 PR で完結する（並行運用期を作らない）

**選択**: 既存 `code-review --approved→ end` を **削除** し、新 transition を **同 PR で追加** する。並行運用期間を設けない。

**理由**:
- learned-pattern「migration の完了判定は production 経路の grep」に従う
- pr-create step が削除と追加の両方を 1 commit で完結するため、中間状態（pr-create が登録されていないのに transition だけ更新）が存在しない
- 既存 in-flight job への影響は実質ゼロ（request 単位の short-lived job のため）

### D8. request.md セクション抽出 helper の配置

**選択**: 既存 `src/parser/request-md.ts` を拡張して `## 背景` / `## 目的` を抽出する API を `ParsedRequest` に追加する。pr-create 専用の独立 helper（`src/core/pr-create/request-md-extract.ts`）は作らない。

**代替案**: pr-create 配下に独立 helper を新設（request.md にも記載されている候補）

**理由**: 同じ parser を 2 系統持つと duplication になる。`ParsedRequest` の責務拡大であり、parser layer の責務として自然。

## Risks / Trade-offs

- **[Risk] gh CLI 認証期限切れ** → ユーザーに `specrunner login` 再実行を escalation で promote する（pr-create-result.md の error message に再認証手順を含める）
- **[Risk] PR title が過剰に長い** → request.md の `# {タイトル}` をそのまま使うため 100 文字超のケースあり。GitHub は 256 文字まで許容するが、推奨は 70 文字以下。本 request では truncate せず、後続 request で title shortener を検討
- **[Risk] PR body の summary 圧縮で重要情報が落ちる** → 圧縮は単純な section 抽出（背景/目的の段落をそのまま）に留め、LLM 生成は行わない。情報落ちは発生しない
- **[Risk] 既存 OPEN PR 検出が race condition で失敗する** → `gh pr view` 実行と `gh pr create` 実行の間に他者が PR を作る確率は極小。発生時は GitHub API が duplicate 作成を拒否し、`pr-create-result.md` に error を記録して escalation する
- **[Trade-off] kind=cli 選択 → LLM による rich body 生成は将来 opt-in** → mechanical 抽出で初版を出し、rich format 化は別 request で agent 化を検討

## Migration Plan

1. `proposal.md` / `design.md` / `specs/**` / `tasks.md` の作成（本 request）
2. spec-review 通過後、implementer が以下を順次実装:
   - `src/core/pr-create/runner.ts`
   - `src/core/pr-create/body-template.ts`
   - `src/core/step/pr-create.ts`
   - `JobState` 拡張
   - `STANDARD_TRANSITIONS` 書き換え
   - `src/cli/run.ts` への step 登録
   - `src/parser/request-md.ts` の section 抽出 API 追加
3. verification（test 全 PASS）+ code-review（approved）通過
4. **本 request 内で transition を 1 PR で完結**。並行運用期は設けない
5. ADR を `openspec-workflow/adr/` に追加（kind=cli 採用判断 / merge 戦略 / commit message 規約 / PR body template 設計）

**Rollback**:
- transition 書き換えは git revert で旧 `code-review → end` に戻る
- `JobState.pullRequest` field は optional のため後方互換性あり（未記録 state は undefined）
- `pr-create-result.md` は新規ファイルなので削除のみで rollback 完了

## Open Questions

- PR body の `## Workflow` テーブルに含める iteration 数の上限（最終 iteration のみ vs 全 iteration の遷移を表示）— 初版は最終 iteration のみで十分とする方針だが、code-review 後に検討
- `gh CLI` の version 互換性チェックを pr-create 実行前に行うか — 初版は行わず、失敗時に gh CLI のエラーメッセージを `pr-create-result.md` にそのまま記録する方針
- `specrunner ps` の出力フォーマットに `pullRequest.url` を表示する箇所 — 本 request では state 記録のみ実装し、表示は別 request で対応
