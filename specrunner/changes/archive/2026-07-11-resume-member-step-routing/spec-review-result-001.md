# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Design Gap | design.md | `stateStep` ハードクラッシュ（kill -9）経路が未文書の残存不具合。kill -9 で中断すると signal handler も exit-guard も動かず、resumePoint なし・state.step = member 名・status = "running" が残る。次回 resume 時に `isStaleRunning` が awaiting-resume へ遷移させ、その後 `resolveResumeStep` は stateStep = member 名を返す（`buildAllowedStepSet` に member 名が含まれるため `allowed.has()` を通過する）。pipeline は member 名でループを開始し transition table のミスで escalate に落ちる — #769 と同じ症状。T-02 が "既存動作維持" として明示的に除外しているが、design.md の Risks セクションに記載がない。 | design.md の Risks セクションに「kill -9 停止時は signal handler も exit-guard も動作しないため、resumePoint が書かれず stateStep が member 名のままになる。このパスは本修正スコープ外で既存動作を維持する」と追記して意図的除外を明示する。実装上の変更は不要。 |
| 2 | LOW | Behavioral Gap | spec.md / resume.ts | `checkConsecutiveEscalations`（resume.ts:164）は `resolveResumeStep` 呼び出し前に `resumePoint?.step`（member 名）でジャーナルを照合する。しかし修正後の pipeline が記録する StepRun は coordinator 名 (`custom-reviewers`) であるため、member 名でのルックアップは一致しない。member-step resume で coordinator が 3 回連続 escalate しても `--force` ガードが発動しない。本 request のスコープ外（連続 escalation チェックの仕様変更は除外）だが、既知の制限として spec/design に記載がない。 | design.md の Risks セクションに「連続 escalation チェックは resumePoint.step（member 名）でジャーナルを照合するが、pipeline は coordinator 名で StepRun を記録するため、member-step resume シナリオではガードが機能しない。別 issue での対応を予定」と記載する。実装変更は不要。 |
| 3 | LOW | Test Coverage | spec.md | D2「member → coordinator へのマッピングが発生した場合は INFO ログで通知する」（design.md D2 / T-02）に対応するテストシナリオが spec.md に存在しない。ログ出力は UX の可視性を担う重要な観測可能動作だが、現状の受け入れ基準ではログ有無が検証されない。 | spec.md に「`--from <member名>` を coordinator にマッピングした場合、INFO ログに変換内容が出力されること」のシナリオを追加する。またはテストで `logInfo` の呼び出しをスパイし mapping 発生時のみ呼ばれることを確認する。 |

## Review Notes

### 全体評価

設計・仕様・タスクの三層が一貫して整合している。architect 評価済みの判断（D1〜D4）はすべて理由・却下案とともに記録されており、`signal-state.ts` singleton flag による race 解消（D4）は O(1) 同期処理でシンプルかつ正確。

### 各ファイル確認結果

**request.md**: 背景・現状コードの前提・要件・受け入れ基準が明確。スコープ外の明示も適切。

**design.md**: D1〜D4 の設計判断はいずれも根拠と却下案が揃っている。Risks 2 件（signal handler 例外 / 将来の signal handler 追加漏れ）を列挙している点は良い。ただし kill -9 パスと連続 escalation チェックのギャップが未記載（finding 1, 2）。

**spec.md**: 8 シナリオが request.md の要件 1〜5 をカバー。coordinator を直接指定した場合（`--from custom-reviewers`）、unknown `--from` のエラー維持、exit-guard 単独経路の backstop 動作まで網羅されている。

**tasks.md**: T-01〜T-09 のタスク分解は受け入れ基準付きで追跡可能。第 5 引数を 1 行追加するだけで済む T-03 の制約明示、テスト間状態分離のための `resetSignalHandlerFiredForTest` の設計（T-04/T-08）は実装者にとって明確な指針になっている。

### セキュリティ観点

- `--from` 入力は allowed step set に対して検証されており、マッピング後の coordinator も同じ検証を通過する必要がある。未知の step name が coordinator にリマップされることはない（member 名の一致が前提）。
- `signal-state.ts` の module-level singleton はプロセス内でしか共有されないため、外部からの干渉経路はない。
- OWASP Top 10 の該当項目なし（HTTP エンドポイント・外部入力・永続認証データなし）。
