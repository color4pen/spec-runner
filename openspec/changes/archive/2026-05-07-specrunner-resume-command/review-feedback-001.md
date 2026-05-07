# Code Review — specrunner-resume-command — Iteration 1

## Summary

ドメインロジック（resolve-step, safety, resolve-job）は設計通りに正しく分離されており、pipeline 再利用のための `createStandardPipeline` 抽出も適切。CLI 引数パースも堅実。ただし `resume.ts` が `PipelineDeps.request` を構築する際に `content: ""` を渡しており、全 pipeline step が `deps.request.content` を参照するため、再開後の agent プロンプトにリクエスト本文が注入されない。これは全再開パスに影響する correctness 問題。テストも宣言済み 10 ケースのうち 4 ケースが未実装。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 5 | 0.30 | 1.50 |
| security | 8 | 0.25 | 2.00 |
| architecture | 7 | 0.15 | 1.05 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 6 | 0.10 | 0.60 |
| testing | 5 | 0.10 | 0.50 |
| **Total** | | | **6.45** |

- **pass threshold**: 7.0
- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/cli/resume.ts:163-169 | `request` オブジェクトの `content: ""` が空文字。全 pipeline step（propose, spec-review, implementer, code-review, code-fixer, build-fixer, spec-fixer の 7 step）が `deps.request.content` を prompt 構築に使用するため、再開後の agent が request 本文を受け取れない | `state.request.path` から request.md を読み込み `parseRequestMd()` で `ParsedRequest` を取得する。最低限 `await fs.readFile(requestPath, "utf-8")` で content を埋める |
| 2 | HIGH | correctness | src/cli/resume.ts:169 | `enabled: []` が空配列。`ParsedRequest.enabled` は pipeline の optional feature（test-case-generator, module-architect 等）を制御する。元の run で有効だった feature が resume 時に無効化される | `parseRequestMd()` を使って request.md から再パースする。`enabled` は request.md の Meta セクションから derive される |
| 3 | MEDIUM | testing | tests/unit/cli/resume.test.ts | ファイルヘッダに TC-RESUME-001（happy path）、TC-RESUME-004（--force override）、TC-RESUME-006（fallback step）、TC-RESUME-008（escalation + --force）の 4 ケースが宣言されているが実装がない。happy path と --force の統合テストが欠落 | 4 ケースを実装する。TC-RESUME-001 と TC-RESUME-004 は `mockHeavyDependencies()` を使って pipeline 呼び出しまでの統合テストにする |
| 4 | MEDIUM | maintainability | src/cli/resume.ts:220-235,285-295 | `deps` オブジェクトの構築が local runtime パスと managed runtime パスで二重に記述されている | `deps` 構築を worktree 管理の前に一度だけ行い、`pipelineCwd` のみ後から差し替える |
| 5 | MEDIUM | maintainability | tests/unit/cli/resume.test.ts:79-125 | `vi.mock()` が `mockHeavyDependencies()` 関数内にネストされている。Vitest は mock をホイストするため現在は動作するが、将来バージョンでエラーになる旨の警告が verification ログに出力されている | `vi.mock()` をファイルトップレベルに移動し、`describe` / `beforeEach` 内では `vi.mocked(fn).mockReturnValue(...)` で差し替える |
| 6 | LOW | maintainability | src/cli/resume.ts:120 | エラーメッセージが日本語（"再開位置が不明です"）。他の全エラーメッセージは英語で統一されている | `"Error: Resume position unknown. Specify --from to set the resume step."` に変更する |
| 7 | LOW | maintainability | src/cli/resume.ts:190-194 | `cleanupWorktreeOnFailure` 内で `loadJobState` を dynamic import (`await import("../state/store.js")`) している。同ファイルの top-level で `updateJobState` を static import 済み | `import { loadJobState, updateJobState } from "../state/store.js"` に static import を追加する |
| 8 | LOW | maintainability | src/cli/resume.ts:163 | `request` オブジェクトに `path` フィールドがあるが `ParsedRequest` 型に `path` は存在しない。TypeScript の構造的部分型で許容されるが意図が不明瞭 | Finding #1 の修正で `parseRequestMd()` を使えば自動的に解消される |

## Iteration Comparison

_(Iteration 1 — 比較対象なし)_

## Convergence Trend

_(Iteration 1 — 初回)_
