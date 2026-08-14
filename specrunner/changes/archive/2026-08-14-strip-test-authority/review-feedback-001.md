# Code Review Feedback — strip-test-authority — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認(21 files changed)
- `src/prompts/test-materialize-system.ts` — diff + 全文読み取りで Method 節・Evidence 節・初回 message の変更内容を確認
- `src/core/step/implementer.ts` — diff + 読み取りで true/false 分岐の変更内容を確認
- `src/core/step/bite-evidence/oids.ts` — `detectBaseImplementationContamination` 実装を全文確認
- `src/core/step/bite-evidence/gate.ts` — 挿入位置(step 3.5)と deferral 生成内容を確認
- `tests/unit/prompts/test-materialize-red-check-contract.test.ts` — TC-001〜005 の期待値更新を確認
- `tests/unit/prompts/strip-test-authority-contract.test.ts` — TC-001〜004 の新規テストを確認
- `tests/unit/step/test-materialize-boundary.test.ts` — TC-TMB-05/06/07/08 の期待値更新を確認
- `src/core/step/bite-evidence/__tests__/gate.test.ts` — TC-007/TC-008 (strip-test-authority) の追加テストを確認
- `tests/unit/step/implementer-lockfile.test.ts` — TC-009(should) の部分的カバレッジを確認
- `specrunner/changes/strip-test-authority/verification-result.md` — verdict: passed, 11,414 passed / 1 skipped を確認
- `src/state/schema/types.ts` — `StepRun.startedAt` が ISO 8601 string(必須)であることを確認

## 検証できなかった項目

None — 受け入れ基準の全項目を機械的に追跡できた。

## Findings 詳細

### Finding 1: Evidence 節に「書き直し」が残存し Method 節の指示と矛盾する

**ファイル**: `src/prompts/test-materialize-system.ts` line 113  
**重要度**: medium / fixable

#### 現状コード

```
- 期待と観測の不一致があればその内容と対応（書き直し / 再分類の根拠）
```

#### 問題

T-01 で Method 節から「書き直し」命令を削除した一方、Evidence 節の step 固有要求 line 113 には `（書き直し / 再分類の根拠）` が残存している。

- **Method 節(変更後)**: 「expected-red が green だった場合は書き直さない。観測事実と考えられる理由を Evidence に記録し、判断は下流の review に委ねる」
- **Evidence 節(変更なし)**: 「期待と観測の不一致があればその内容と **対応（書き直し / 再分類の根拠）**」

Agent は両節を読む。Method が「書き直すな、理由を記録せよ」と言い、Evidence が「書き直しの根拠を記録せよ」と言う矛盾が生じる。Agent が Evidence のテンプレートに従って架空の「書き直し根拠」を記録する、あるいは矛盾を感知して行動が不定になるリスクがある。

#### テストで捕捉されない理由

既存テストはすべて `extractSection(…, "Method")` で Method 節のみを検査する。Evidence 節の `書き直し` 残存を検出するアサーションが存在しないため、現行テストは全て green のまま通過する。

#### 修正案

```diff
-  - 期待と観測の不一致があればその内容と対応（書き直し / 再分類の根拠）
+  - 期待と観測の不一致があればその内容と考えられる理由（既存実装が要求を満たしている / 分類誤り / 見張れていない疑い等）
```

D1 の「判断は下流の review に委ねる」と整合し、Evidence 節の記録内容を Method 節の指示と一致させる。

---

## 受け入れ基準の充足状況

| 受け入れ基準 | 確認結果 |
|---|---|
| test-materialize prompt に red 強制が含まれない(テスト固定) | ✅ `strip-test-authority-contract.test.ts` TC-001 / `test-materialize-red-check-contract.test.ts` |
| 実行義務と観測記録要求が残る(テスト固定) | ✅ TC-002 / TC-003 |
| green 観測時の指示が「理由の記録」(テスト固定) | ✅ TC-004 |
| implementer prompt にテスト変更禁止が含まれない(テスト固定) | ✅ `test-materialize-boundary.test.ts` TC-TMB-05/07 |
| 再走形状で bite-evidence が strategy-deferred を返す(テスト固定) | ✅ `gate.test.ts` TC-007(strip-test-authority) |
| 初回一巡の bite-evidence 判定が無変更(テスト固定) | ✅ `gate.test.ts` TC-008(strip-test-authority) |
| 更新テストの全列挙と根拠が design に記載 | ✅ design.md D5 — 8項目列挙・根拠明示 |
| typecheck && test が green | ✅ verification-result.md: 11,414 passed |

## 注記

- **contamination 検知ロジック**: 純関数として分離。`resolveBaseCandidateOids` の署名を変えず archive floor への影響ゼロ。`startedAt` ISO 8601 文字列比較は lexicographic に正しい。`ponytail:` コメントで暫定性を明示済み。
- **gate.ts 挿入位置**: baseOid / candidateOid が共に非 null を確認した後、runtime capability check の前(設計通り)。
- **TC-009(should)**: `implementer-lockfile.test.ts` が lockfile 分岐をカバー。tasks.md checkbox と end_turn の専用テストは無いが実装コードで正しく維持済み。should 優先度のため許容範囲。
- **スコープ遵守**: Evidence Base の構築・candidate の effective HEAD 化・step 統合・scenario freeze 変更・test-case-gen 変更はいずれも手つかずであり、スコープ外事項は正しく除外されている。
