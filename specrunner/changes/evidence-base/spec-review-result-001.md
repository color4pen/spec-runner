# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### コード現状の照合

- `src/core/step/bite-evidence/oids.ts` — `resolveBaseCandidateOids`（L27-43）・`detectBaseImplementationContamination`（L57-72、ponytail マーカー L55 付き）を読み、request の現状記述と一致することを確認。
- `src/core/step/bite-evidence/gate.ts` — gate 手順 1〜3.5（L79-129）・`FORWARD_TYPES`（L36）・never-throw 構造を確認。`detectBaseImplementationContamination` 呼び出しが gate.ts L122 に存在。
- `src/core/archive/achieved-assurance.ts` — P2.5 汚染検出（L236-246）・base-red 実行（L441-463: `runTestsAtCommit(baseOid, ...)`）・`AssuranceProvenanceRuntime` Pick（L32-38）を確認。
- `src/core/port/runtime-strategy.ts` — `captureHeadSha`（L329）が既存ポートに存在。`runTestsAtCommit`（L700-705）・`RealRuntimeStrategy` 型（L794-825）のパターンを確認。`runTestsOnSynthesizedTree` は未実装（要追加）。
- `src/core/runtime/workspace-materializer.ts`（L213-242）・`src/core/runtime/local.ts`（L419-443）— worktree/no-worktree 両経路ともに bootstrap commit 後に `appendSynthesizedCommit` を呼んでいることを確認。D1 の「`synthesizedCommits[0]` は bootstrap commit」が両経路で成立。
- `src/core/resume/adopt-commits.ts` — `--adopt-commits` は ledger 末尾へ append（`appendSynthesizedCommit` パターン）。index 0 を書き換えない。D1 の「先頭エントリは不変」が成立。

### spec.md 規約チェック

- 全 4 Requirement に normative keyword（SHALL/MUST）あり。
- 各 Requirement に 1 つ以上の Scenario あり。
- Requirement 1: 2 scenarios（再走 shape・resume 同一 tree）✓
- Requirement 2: 1 scenario（adopt-commits candidate 含有）✓
- Requirement 3: 1 scenario（archive floor re-run shape）✓
- Requirement 4: 3 scenarios（非 forward・tamper・unavailable runtime）✓

### design.md 設計根拠の照合

- **D1 根拠**：`synthesizedCommits[0]` の bootstrap commit 記録を両経路で確認。`appendSynthesizedCommit` は末尾 append のみ。D1 の resume 不変性が構成上保証されている。
- **D2**：既存 `runTestsAtCommit` の worktree add → symlink → scoped run → finally cleanup パターンを `local.ts` で確認。`runTestsOnSynthesizedTree` はこれを拡張するだけでよい。
- **D3**：`resolveBaseCandidateOids` が引き続き test-file set 同定に使われる（`listCommitChangedFiles(baseOid)`）。archive floor も同様に `baseOid` を blob freeze anchor (b) に使う。設計上の一貫性あり。
- **D4**：`captureHeadSha` は既に `RuntimeStrategy` ポートに存在（L329）。新規ポートメソッド追加不要。
- **D5**：削除対象 3 箇所（`detectBaseImplementationContamination` / gate 3.5 / P2.5）の場所を実コードで確認。
- **D6**：short-circuit deferred の順序は tasks T-03 に明記されており、HEAD capture はすべての defer 後に来る。
- **D7**：列挙されたテストファイル（gate.test.ts / gate-empty-selection.test.ts / achieved-assurance.test.ts / 5 件の tests/unit/ ファイル / merge-then-archive-floor-provenance.test.ts / bite-evidence-e2e-gate.test.ts）が全てリポジトリ内に存在することを確認。

### test-cases.md の受け入れ基準カバレッジ確認

| request 受け入れ基準 | 対応 TC |
|---|---|
| 再走 shape で red 側汚染なし | TC-001 |
| 初回/resume で同一 Evidence Base | TC-002 |
| adopt-commits が candidate に含まれる | TC-003 |
| 撤去対象の列挙 | design D7（文書ベース）|
| strategy-deferred 挙動不変 | TC-005/006/007（既存テスト green） |
| typecheck && test green | TC-022 |

全基準にカバレッジあり。

### gate.test.ts TC-007 の二重定義確認

`gate.test.ts` に TC-007 が 2 つ（「non-forward type defers」L161 と「strip-test-authority re-run shape」L715）存在することを確認。design D7 は `(strip-test-authority)` 括弧で正しく区別しており実装者に対して十分な識別情報が提示されている。

## 検証できなかった項目

- `runTestsOnSynthesizedTree` の実装詳細（実装前のため）。正確な cleanup 契約・overlay write 失敗時の挙動は実装フェーズで確認が必要。
- 実際の resume / 再走シナリオでの `synthesizedCommits[0]` 不変性（end-to-end の git 操作は review スコープ外）。TC-002 / TC-001 の e2e テストで担保される想定。

## Findings 詳細

### F-001: Spec Requirement 4 が `captureHeadSha → null → strategy-deferred` を列挙していない

Spec Req 4 の deferral リスト「non-forward type / unset scopedTestCommand / unavailable runtime / absent base / job-base reference / empty selection」に、新たに導入される deferral 経路 **「`captureHeadSha` が null を返した場合（candidate HEAD OID が取得できない場合）→ strategy-deferred」** が含まれていない。

design D4 では "captureHeadSha → null → strategy-deferred" と明記されており、tasks T-03 も同様に規定しているが、spec 上に normative 記述がない。実装者は design/tasks を見て正しく実装できるが、spec が単独で読まれたとき仕様が不完全になる。

### F-002: TC-014 がユニットテストとして分類されているが実装手段が不明確

TC-014「detectBaseImplementationContamination is removed with no remaining importers」はカテゴリ `unit`・priority `must` だが、「no remaining importers」はランタイム動作ではなくビルド時静的構造の確認である。typecheck でコンパイルエラーとして検出されるか、grep ベースの確認になるかが spec/tasks に明記されていない。

T-06 の `typecheck && test green` が通れば型エラーとして実質的に担保されるため、TC-014 を独立したランタイム unit test として実装する必要があるかどうかが曖昧。実装者が冗長な grep テストを追加するリスクがある。

### F-003: Archive floor の Evidence Base ref 不在（synthesizedCommits 空）時の fail-closed が spec に scenario なし

spec Requirement 3 の scenario（「Archive floor derives base-red on the Evidence Base for a re-run shape」）は正常系（re-run shape が assurance を得る）のみカバーし、`synthesizedCommits` が空/absent のとき archive floor が fail-closed になる旨の normative scenario がない。TC-018 はこれをカバーするが、sourced が `tasks.md T-04 / design.md D1/D5` であり spec scenario から導出されていない。

design D1 に fail-closed 規定あり（"Empty/absent ledger → null → strategy-deferred (gate) / dimension absent (floor)"）、かつ requirements 4 の gate 向け fail-closed と意味的に整合しているため実装上のリスクは低い。
