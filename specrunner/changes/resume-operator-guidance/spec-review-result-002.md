# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周 findings の解消確認

**Finding 1（前周 low/fixable）: T-02 が buildAdoptionHaltMessage に渡す slug 変数を特定していない**

tasks.md T-02 を Read tool で読み直した。現在の記述:
> "`buildAdoptionHaltMessage` を呼ぶ際、`slug` 引数には `resolvedSlug`（`getJobSlug(state)` で得られる正規 slug）を渡す。Gate 2 が `buildAdoptEscalationMessage` に渡す変数（resume.ts:434）と同一であり、`this.slug`（ユーザー入力 slug、short Job ID prefix の可能性あり）は使用しない。"

修正済み。resume.ts:225 で `const resolvedSlug = getJobSlug(state)` が定義され、Gate 1 halt branches（379-384 / 385-391）はこのスコープ内にあるため型も `string`（non-null は `if (resolvedSlug !== null)` ガードで保証）。解消済み。

**Finding 2（前周 low/decision-needed）: bite-evidence が --from ヘルプの有効値一覧に表示される**

tasks.md T-03 を確認。現在の記述:
> "`CLI_STEP_NAMES` に含まれる `bite-evidence` は内部 step（通常の operator は使用しない）である旨を注記として添える。"

spec-fixer は「一覧に含めつつ注記を添える」方針を選択した。step-names.ts を確認: `CLI_STEP_NAMES = ["verification", "bite-evidence", "pr-create"]` であり、flag-parser の `values` 検証が `bite-evidence` を有効値として受け入れる現状に変更はない。ヘルプテキストで operator に内部専用である旨を伝えることで UX 上の問題を緩和する判断。解消済み。

---

### Spec.md — 全 Requirements の適合確認

spec.md に 5 つの Requirement があることを確認した。

| Requirement | request.md 要件 | MUST 有 | Scenario 数 | 確認状況 |
|---|---|---|---|---|
| 採用系 preflight を統合した単一 halt | 要件 1 | ✅ | 3 | ✅ |
| 統合 halt メッセージの形式 | 要件 2 | ✅ | 1 | ✅ |
| preflight は副作用を持たず fail-closed を維持する | 要件 3 | ✅ | 2 | ✅ |
| job resume の詳細ヘルプ | 要件 4 | ✅ | 1 | ✅ |
| 未解決 slug の報告文言 | 要件 5 | ✅ | 1 | ✅ |

---

### Design.md — 設計決定とコード整合確認

**D1（preflight は halt 境界で遅延実行）**: resume.ts を Read した。Gate 1 fail-closed halt に至る 2 枝は lines 379-384（Conditions 2/3/4 不満）と 385-391（Condition 1 不満）。どちらも現在は即 throw で Gate 2 へ到達しない。T-02 の「両 else 枝を preflight 統合 halt に置き換える」指示はコード構造と整合している。

**D2（commits-only は buildAdoptEscalationMessage を不変で使い続ける）**: adopt-commits.ts を Read した。`buildAdoptEscalationMessage` は署名・実装ともに TC-U5 の想定通り存在する。新規 `buildAdoptionHaltMessage` の追加は別 export として T-01 に定義され、既存関数を破壊しない設計。

**D3（flag は検出結果から導出、失敗時は fail-closed）**: spec.md Requirement 3 Scenario「未知 commit 検出失敗時の fail-closed」と tasks.md T-02 / T-01 の `commitDetectionFailed` フラグ処理が三者で一致している。

**D4（JOB_RESUME_USAGE）**: command-registry.ts を確認。`ARCHIVE_USAGE`（line 267）・`REOPEN_USAGE`（line 282）のテンプレートリテラル形式が存在し、T-03 の「同じテンプレートリテラル形式」指示が既存パターンに従うことを確認。`REOPEN_USAGE` が `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ")` で --from 有効値を列挙しており、T-03 の「REOPEN_USAGE の書式に倣う」指示が具体的に追いつける。

**D5（resolveId 文言は共用のため不変、resume 側で包む）**: tasks.md T-04 の文言 `"Job not found: no active job with slug or job ID prefix '${this.slug}'"` が "Job not found" を保持するため、TC-RESUME-010 が `stderrCalls.some((args) => String(args[0]).includes("Job not found"))` を確認するアサーションは無改変で通過することを確認。

---

### Tasks.md — T-01 から T-06 の完全性確認

**T-01**: `buildAdoptionHaltMessage` の引数・出力形式・3 分岐（canon-only / canon+commits / 検出失敗）・代替案の提示・`buildAdoptEscalationMessage` 不変の制約が網羅されている。

**T-02**: halt 実行前の preflight `detectUnadoptedCommits` 挿入箇所（2 枝）・`resolvedSlug` 使用・exit 128 carve-out・`commitDetectionFailed` フラグ・logError/stderrWrite の出力順（Gate 2 慣習に倣う）・Gate 2 二重評価防止が明示されている。

**T-03**: 11 flag すべての列挙・相互排他 2 組・`--from` 有効値（AGENT + CLI）・bite-evidence 注記・複合 step 除外注記・`usage: JOB_RESUME_USAGE` フィールドの配線が列挙されている。

**T-04**: `this.slug` を用いた slug 語彙の文言・"Job not found" 保持・resolveId 本体不変の 3 点が明示されている。

**T-05**: 更新を許可するファイルリスト（request 許容リスト 5 ファイル + help-flag-dispatch）が明確。TC-U5（adopt-commits.test.ts）が不変であることも明記。

**T-06**: 新規テストが 6 観点をカバーし、既存 mock パターン踏襲・新フレームワーク不使用の制約が明記されている。

---

### セキュリティ観点（入力検証、OWASP Top 10 該当箇所）

**--prompt フラグ**: command-registry.ts line 691 に `"Warning: --prompt の内容は agent prompt に直接注入されます。外部入力をそのまま渡さないでください。"` の警告が既存実装済み。本変更はこの経路に干渉しない。

**slug 入力**: `this.slug` はユーザー入力文字列で、T-04 のエラーメッセージに template literal で埋め込まれる。出力先は stderr ログ（ターミナル表示のみ）であり SQL/HTML インジェクションの経路はない。slug 形式バリデーション（SLUG_REGEX）は detach 経路にのみ存在し、not-found エラー経路は通常の文字列表示。許容範囲内。

**preflight の git 呼び出し**: `detectUnadoptedCommits` は `git rev-list HEAD --not --remotes=origin` の read-only 操作。実行は halt する場合のみに限定（正常経路コスト不変）。コマンドライン引数にユーザー入力は含まれない（slug はコマンドに渡さない、worktree パスは resolvedWorktreePath で解決済み）。注入リスクなし。

---

## 検証できなかった項目

- T-06 で追加予定のテストコードの実際の実装（spec-review 段階では未生成）
- `buildAdoptionHaltMessage` の実装（T-01 未実装、spec-review 段階では存在しない）
- `typecheck && test` の green（実装・テスト未生成のため）

## Findings 詳細

前周指摘 2 件は解消済み。今周の新規 finding はなし。
