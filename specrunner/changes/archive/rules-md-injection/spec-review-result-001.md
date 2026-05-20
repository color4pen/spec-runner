# Spec Review Result: rules-md-injection

- **verdict**: needs-fix
- **date**: 2026-05-20
- **reviewer**: spec-reviewer agent

---

## Summary

`specrunner/rules.md` を source of truth として設け、change folder にコピーして全 agent に Read 取得させることで「業界慣習 MADR が agent の context で発火して ADR を `docs/adr/` に配置してしまう」事故を構造的に抑止する変更。

Concrete deltas:
1. `specrunner/rules.md` 新設（7 セクション、ADR 配置の特記含む）
2. worktree setup で `specrunner/rules.md` → `specrunner/changes/<slug>/rules.md` コピー（local.ts + managed.ts）
3. 11 agent system prompt 冒頭に identity priming + Read 指示を追加
4. `fragments.ts` から `SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` を削除、`buildSystemPrompt` を簡素化
5. `fragment-coverage.test.ts` 更新、`common-context-catch.test.ts` 更新、`rules-md.test.ts` 新設

---

## Completeness

概ね良好。request.md の受け入れ基準は tasks.md T-01〜T-08 に 1:1 対応している。テスト戦略（静的 unit test のみ、LLM integration test なし）は CI 決定論性の観点で正当。

軽微なギャップ:
- 既存の `SPEC_RUNNER_COMMON_CONTEXT` は「10 step state machine」と書きつつリストは 11 項目。T-01 でそのまま移行すると不整合が rules.md に持ち込まれる。

## Consistency

- design.md と request.md の方針 D1〜D5 は整合。
- delta spec の MODIFIED/ADDED/REMOVED ヘッダーは baseline と一致しており、自動分類ツールが正常に機能する。
- **delta spec の `## Removed` ブロックが Requirement 名ではなく Scenario 名を列挙している。** DELTA_SPEC_FORMAT では `## Removed` は `- "requirement name"` のリスト形式が契約。Scenario 削除は MODIFIED Requirement 内に吸収されるため `## Removed` ブロック自体が不要（現バリデーションツールは許容しているが非カノニカル）。
- T-04 で `buildSystemPrompt` の call site 6 ファイルを列挙しているが、他の call site が implicit prepend に依存していないことの確認が tasks.md に明示されていない。

## Security

- `specrunner/rules.md` はリポジトリに commit され PR レビューを経る。ランタイム時にユーザー入力が混入する経路はなく、prompt injection の新たなベクターは導入されない。
- **潜在リスク（LOW）**: コピー先 `specrunner/changes/<slug>/rules.md` は design step の write 可能パス内に存在する。buggy / malicious な design step が同一 job の rules.md を上書きすると、後続 step の Read 指示が効かなくなる。cross-job への影響は worktree 分離で防がれているため最悪ケースは同一 job のみ。

## Feasibility

- 11 agent prompt への BASE 定型句追加は機械的に適用可能。`delta-spec-fixer` の除外理由（`SPEC_FIXER_SYSTEM_PROMPT` 流用）は `src/core/step/delta-spec-fixer.ts:27` で検証済みで正当。
- **bootstrap 問題（HIGH）**: `local.ts` / `managed.ts` の worktree setup で `fs.cp(specrunner/rules.md, ...)` を実行するが、この PR の自身の worktree 含め `specrunner/rules.md` が存在しない場合に ENOENT で throw する。tasks.md T-02 は `git add` 失敗を non-fatal と記載するが、`fs.cp` 自体のガードが記述されていない。

---

## Findings（要修正）

| # | Severity | Category | 場所 | 説明 | 修正案 |
|---|----------|----------|------|------|--------|
| 1 | HIGH | feasibility | tasks.md T-02 | `fs.cp(specrunner/rules.md, ...)` が rules.md 未存在時に ENOENT で throw する。T-01（rules.md 新設）と T-02（cp ロジック）が同一 PR に含まれるため、自身の worktree 実行でも安全性を確保する必要がある。 | `fs.access(src).then(() => fs.cp(...)).catch(() => warn())` でガード、または tasks.md に「T-01 が先にコミットされることを前提」と受け入れ基準として明記する。 |
| 2 | MEDIUM | consistency | delta spec `## Removed` ブロック | Requirement 名ではなく Scenario 名（例: "builder が common context を自動 prepend する"）が列挙されている。DELTA_SPEC_FORMAT では `## Removed` は Requirement 名のリスト。 | `## Removed` ブロックを削除するか、Requirement 名形式に変換する。Scenario 削除は MODIFIED Requirement 内の不在で表現される。 |
| 3 | MEDIUM | testing | tasks.md T-07 | 静的 test は「design / code-review prompt が `docs/adr/` を含まない」を検証するが、実際の事故は **agent が出力する design.md 内の path 文字列**が原因であり、prompt の静的内容では catch できない。 | test の限界（入力側の structural guard のみで出力挙動は保証しない）を design.md の Risks セクションに明記する。acceptance criteria に「静的入力ガードとしての位置づけ」を追記する。 |
| 4 | MEDIUM | security | design.md / tasks.md | コピー後の `changes/<slug>/rules.md` が design step の write 可能範囲内にあり、同一 job 内での上書き可能性が未記録。 | design.md の Risks または制約として明記する（受容か対策かの判断を記録）。 |

---

## Findings（非ブロッキング・改善提案）

| # | Severity | Category | 説明 |
|---|----------|----------|------|
| 5 | LOW | completeness | `SPEC_RUNNER_COMMON_CONTEXT` の「10 step」記述は items が 11 個。rules.md 移行時に修正推奨。 |
| 6 | LOW | maintainability | `specrunner/rules.md` のパス文字列が local.ts / managed.ts に重複。`rulesFilePath()` ヘルパーを `src/util/paths.ts` に置くと drift リスクが減る。 |
| 7 | LOW | consistency | `buildSystemPrompt` の既存 call site 全数確認と「implicit prepend に依存していたコードが存在しないこと」を tasks.md T-04 の完了基準に追記推奨。 |

---

## Requirements Mapping

| # | request.md 受け入れ基準 | tasks.md / delta spec | 状態 |
|---|---|---|---|
| 1 | `specrunner/rules.md` 新設（7 セクション） | T-01 / spec §rules.md 存在と構造的保証 | ✅ covered |
| 2 | worktree setup での rules.md コピー | T-02 | ⚠️ covered with finding #1 |
| 3 | 全 agent prompt 冒頭に identity priming + Read 指示 | T-03 / spec §System prompt の builder 経由構成 | ✅ covered |
| 4 | 3 fragment 削除 + `buildSystemPrompt` 簡素化 | T-04 / spec §Fragment 集約 export + Builder 純粋関数 | ✅ covered |
| 5-1 | `fragment-coverage.test.ts` 更新 | T-05 | ✅ covered |
| 5-2 | `common-context-catch.test.ts` 更新 | T-06 | ✅ covered |
| 6 | 静的 unit test 新設 | T-07 / spec §Inject 漏れの構造的検出 | ⚠️ covered with finding #3 |
| 7 | typecheck + test green | T-08 | ✅ covered |
| 8 | ADR に方針記録 | pipeline の adr-gen step | ✅ covered by pipeline |

---

## 総評

設計の核心（acquired > given）は正当であり、代替案比較も妥当。delta spec の構造も baseline と整合している。ブロッキング修正は 2 点:

1. **T-02 の fs.cp ENOENT ガード**（または前提条件の明記）
2. **delta spec `## Removed` ブロックの形式修正**

Finding #3（テスト限界の明記）と Finding #4（security リスクの記録）は design.md / tasks.md の加筆で対応可能。いずれもコアアーキテクチャの変更は不要であり、escalation は不要。
