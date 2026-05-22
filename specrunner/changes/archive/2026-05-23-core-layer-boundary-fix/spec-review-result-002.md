# Spec Review Result

- **verdict**: approved
- **change**: core-layer-boundary-fix
- **type**: spec-change
- **review**: 002 (re-review after spec-fixer)

---

## Summary

review-001 の MUST FIX / SHOULD FIX / INFO の 3 件がすべて解消されている。delta spec・tasks.md・design.md の整合性を確認し、新たなブロッカーはなし。

---

## review-001 Findings の解消確認

### Finding 1 [MUST FIX] → ✅ 解消

`specrunner/changes/core-layer-boundary-fix/specs/one-shot-query/spec.md` に `## Renamed` セクションが追加され、Requirement ヘッダーも新名前 "reviewer / manager / generator は OneShotQueryClient port に依存する" に更新されている。delta-spec-rule の Renamed 記法（`- "old" → "new"` 形式）に準拠している。

### Finding 2 [SHOULD FIX] → ✅ 解消

`tasks.md` Task 6 から原案の 6a / 6b（`import ClaudeCodeOneShotQueryClient` を core 層に追加する指示）が除去されており、revised 版のみが残っている。module-boundary 違反を新規に作り込む誤誘導リスクは解消された。

### Finding 3 [INFO] → ✅ 対応済み

Task 6c に `- [ ] \`executeReview\` / \`executeCreate\` の内部から \`loadConfig()\` 呼び出しを削除` が追加されており、config 読み込みが cli 側に一元化される流れが明示されている。

---

## Fresh Review

### delta spec 形式バリデーション

rules.md の delta spec 記法ルールとの照合:

| ルール | 状態 |
|--------|------|
| `## Requirements` を使用（旧 ADDED/MODIFIED 形式なし） | ✅ |
| 各 Requirement が `### Requirement:` ヘッダーを持つ | ✅ |
| 各 Requirement が `#### Scenario:` を 1 つ以上持つ | ✅ (4 Scenario) |
| MUST / SHALL normative keyword を含む | ✅ |
| `## Renamed` が `"old" → "new"` 形式 | ✅ |
| ヘッダーと Scenario の間にコードブロックなし | ✅ |

### 受け入れ基準とタスクの対応

| 受け入れ基準 | 対応タスク |
|-------------|-----------|
| `grep adapter/ src/core` = 0 | Task 3/4/5 + Task 9 regression test |
| `grep cli/ src/core` = 0 | Task 7a + Task 9 regression test |
| `grep @anthropic-ai/claude-agent-sdk src/core/request` = 0 | Task 4/5 + Task 9 regression test |
| OneShotQueryClient port が core/port/ に存在 | Task 1 |
| reviewer/manager/generator が port に依存 | Task 3/4/5 |
| 境界違反 regression test | Task 9 |
| delta spec 更新 | Task 10 |
| run/resume 両経路で進捗表示が従来どおり | Task 7c/7d (resume.ts を明示的にカバー) |
| typecheck & test green | Task 11 |

全受け入れ基準にタスクが対応している。

### 設計整合性

- **D1 → Task 7**: EventBus をコンストラクタ注入、ProgressDisplay を cli 層に移管。`wireProgressDisplay` factory で run/resume 両経路を共通化。resume 経路の表示劣化を防ぐ設計が明示されている。✅
- **D2/D3 → Task 1/2**: `OneShotQueryClient` port の interface 設計は既存 `SessionClient`/`AgentRunner` と同一粒度。SDK 固有型（AsyncGenerator / SDKMessage）を port に持ち込まない設計。✅
- **D4 → Task 6**: composition point で具象を注入し、default fallback（`queryFn ?? query`）を完全削除。暗黙 SDK 呼び出し経路を閉じる。✅
- **D5 → Task 8**: `mockQueryFn` (AsyncGenerator) → `OneShotQueryClient` mock（`run: vi.fn()`）の移行が全テスト対象で明示されている。✅

### 注意点（ブロッカーなし）

Task 7d の補足に「run.ts では verbose/slug が prepare() 内で確定するため `options.verbose ?? false` / `preflightResult.request.slug` で代替する」旨が記されており、実装者への配慮がある。実装フェーズで動作確認が必要だが、設計上の抜けではない。

---

## Security Considerations

純粋なアーキテクチャリファクタリングであり、外部 API・入力処理・認証フローへの変更はない。OWASP Top 10 に該当する新リスクはなし。SDK default fallback の削除（`queryFn ?? query` の除去）により暗黙的 SDK 呼び出し経路が閉じられ、セキュリティポスチャーは向上する。

---

## What's Good

- 3 件の違反すべてに個別原因分析と解決策が対応しており、抜け漏れがない
- module-boundary spec が stale grep pattern で違反 #3 を検出できない問題を把握しつつ、スコープを切り分けた判断が適切
- regression test を architecture test として独立させ、実行可能な grep コマンドで恒久ガードする設計が明確
- Tasks の `(revised)` サフィックスは残っているが、旧内容が除去されているため実装者への誤誘導リスクはない
