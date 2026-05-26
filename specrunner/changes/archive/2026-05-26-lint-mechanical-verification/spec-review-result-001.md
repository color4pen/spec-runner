# Spec Review Result — lint-mechanical-verification

- **verdict**: approved
- **reviewer**: spec-review agent (local)
- **date**: 2026-05-26

---

## Summary

設計動機・設計決定・受け入れ基準いずれも健全。実装上の minor gap が 3 点あるが、すべて typecheck / test で実装時に発覚・修正可能なレベルであり spec 変更を要しない。

---

## Findings

### F-01: `PhaseResult.phase` の型拡張が tasks で未明示（informational）

**Location**: tasks.md Task 5 / src/core/verification/runner.ts

現行の `PhaseResult.phase: PhaseName` は `"build" | "typecheck" | ...` の union 型。commands 経路では任意の `name` 文字列またはコマンド文字列が入るため `string` への拡張が必須になる。tasks.md にこの型変更が明示されていない。

`bun run typecheck` が必須検証項目なので実装者が発見・修正する経路は確保されているが、「何を変更すべきか」の文書化が不完全。

**判断**: blocking なし。実装者が typecheck で気付ける。

---

### F-02: `name` フィールドの空文字列バリデーションが未定義（informational）

**Location**: specs/cli-config-store/spec.md の validation 要件

`{ "name": "", "run": "cmd" }` の場合、`name` は optional string として valid 扱いになる。失敗時の表示が `Step '' failed` となり視認性が低い。

`run` の空文字列は CONFIG_INVALID として明示的に禁止されているが、`name` については言及がない。

**判断**: edge case として許容範囲。空文字列 name は設定ミスとして自然に気付ける。blocking なし。

---

### F-03: commands 空配列のシナリオが verification-runner spec に不在（informational）

**Location**: specs/verification-runner/spec.md

tasks.md および cli-config-store spec では「空配列は valid（= 全 command skip → VERIFICATION_NO_RUNNABLE_PHASES と同等）」と定義されている。しかし verification-runner spec には対応する scenario がない。

**判断**: 挙動の定義自体は cli-config-store spec と tasks.md で担保されており、実装者への要件伝達は可能。runner spec への scenario 追加は Phase 2 以降で拾えばよい。blocking なし。

---

## Design Validation

| 決定 | 評価 |
|------|------|
| D1: string \| object union schema | GitHub Actions / pre-commit と整合、コスト対効果 OK |
| D2: `sh -c` 実行モデル | 設定ファイルはリポジトリにコミットされる（= commit 権限 = 信頼済み）。injection risk は許容できる trust boundary 内 |
| D3: fallback 戦略 | 既存 dogfood の regression なし。段階的 deprecation として適切 |
| D4: `SpecRunnerConfig` への verification section 追加 | config 深さが増えない。deep merge も既存パターンと同様 |
| D5: recommended preset + strict (`--max-warnings 0`) | `[[feedback_avoid_patchwork]]` と整合、最初から 0 強制は正しい |
| D6: failure output の name / command 使い分け | phase 名と command の mismatch を消す判断として妥当 |

セキュリティ（OWASP Top 10 相当）:
- **コマンドインジェクション**: config 由来のコマンドを `sh -c` 実行する。攻撃に必要な条件はリポジトリへの commit 権限であり、許容できる trust boundary。
- **パストラバーサル**: config path は固定（`<repo-root>/.specrunner/config.json`）。ユーザー入力なし。
- **DoS（タイムアウト不在）**: per-phase timeout は本 request スコープ外として明示済み。現状の fallback 経路と同じ前提。

---

## Acceptance Criteria Coverage

受け入れ基準 11 項目すべてに対応する spec / task / scenario が存在する。

---

## Conclusion

design.md・tasks.md・両 delta spec の整合性は良好。実装者が迷う箇所は F-01（`PhaseResult.phase` 型拡張）のみで、typecheck が安全網として機能する。spec 変更なしに approved とする。
