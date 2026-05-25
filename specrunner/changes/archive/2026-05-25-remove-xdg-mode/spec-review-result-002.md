# Spec Review Result: remove-xdg-mode (Round 2)

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-24

---

## Summary

前回レビュー (001) で指摘した 3 件（F1 MUST / F2・F3 SHOULD）がすべて解消された。delta spec・design.md・tasks.md の整合性は取れており、実装に進める品質に達している。

---

## Resolution Check (001 → 002)

### F1 [MUST FIX] → ✅ 解消

`specrunner/changes/remove-xdg-mode/specs/verbose-execution-log/spec.md` に `### Requirement: logger 層の抽象化` が追加された。

- `initVerboseLog(repoRoot: string, jobId: string)` への signature 変更が明記された
- `resolveXdgStateDir()` を verbose log パス解決に使用してはならない（MUST NOT）が明記された
- baseline の虚偽記述リスクが除去された

### F2 [SHOULD FIX] → ✅ 解消

`tasks.md` Task 7 の managed.ts 対応が確定した。

- "managed runtime は `this.cwd` を持ち job state を書く（`updateJobState()` を lines 149/192 で呼び出す）" と根拠付きで記述
- `storeFactory` を `(id: string) => new JobStateStore(id, this.cwd)` に変更することが明確化された
- implementer に調査・判断を委ねる TODO が消えた

### F3 [SHOULD FIX] → ✅ 解消

`tasks.md` Task 8 の `src/state/store.ts` 対応が確定した。

- "deprecated wrappers を削除する" と明確化
- "呼び出し元は managed.ts のみ → managed.ts 側を直接 `JobStateStore` 使用に更新する" という根拠と対応方針が記述された
- "or 削除を検討" という曖昧表現が除去された

---

## Approved Items (継続)

- request の廃止理由（構造的脆弱性・利用者希薄・コード単純化）は依然として明確で妥当
- design.md D1（repoRoot parameter injection）は純粋関数化・依存可視化・テスト容易性の観点で適切
- design.md D4（repo 外では jobs が存在しないのが正常）の fallback 戦略は合理的
- `cli-config-store` delta spec: `jobs` 廃止後の passthrough 挙動が正確に記述されている
- `job-state-store` delta spec: `repoRoot` parameter 方式への置換が一貫している
- `verbose-execution-log` delta spec: 両 Requirement が整合しており、XDG 分岐の削除と新 signature が網羅されている
- 受け入れ基準はすべて検証可能な形式
- スコープ外（旧 XDG state file 移行・config/credentials パス・worktree 書き込み戦略）の明示が適切

## Security

- XDG silent fallback の削除は予測可能パスへの一本化であり、セキュリティ上のリグレッションなし
- `git rev-parse --show-toplevel` による repoRoot 取得は repo-bound tool として想定内
- 旧 config の `jobs` section passthrough: parse して型に落とさず無視するため injection ベクターなし
- OWASP Top 10 観点での影響なし（認証・入力処理・API・DB クエリへの変更を含まない）
