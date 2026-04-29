## Array-Compatibility Note

既存 spec `openspec/specs/spec-review-session/spec.md` には以下の Requirement が残る:

1. 「spec-review セッションは標準ツールのみで作成される」
2. 「architect + spec-reviewer の役割を 1 セッションで担う」
3. 「sessions.retrieve() ポーリングで検知する」
4. 「独立した timeout を持つ」

これらは `state.steps["spec-review"]` の配列化（`StepResult[]`）に対し **意味的な変更を必要としない**。各 Requirement は「1 セッション = 1 iteration の StepResult」の単位で成立し、複数 iteration にわたって繰り返し適用される。

Scenario 内の `state.steps["spec-review"].verdict` 参照はすべて **`state.steps["spec-review"][i].verdict`** または **`getLatestStepResult(state, "spec-review").verdict`** の形式として解釈する。本 delta の MODIFIED Requirements ではこの解釈を前提に記述する。

---

## MODIFIED Requirements

### Requirement: verdict ファイルは GitHub API で取得し行頭マッチでパースする

セッション完了後、CLI は MUST `fetchSpecReviewResult(deps, slug, branch, iteration): Promise<string | null>` を呼び（内部実装は `PipelineDeps.githubFetch` を使った raw fetch。404 は 1 秒間隔で最大 3 回までリトライしてから null を返す）、戻り値の文字列に対して `/^- \*\*verdict\*\*:\s*(approved|needs-fix|escalation)\s*$/m` でパースする。最初にマッチした verdict 行を採用する（first-write-wins）。`iteration` は SHALL 1-origin で findings ファイル名のサフィックス（`spec-review-result-{NNN}.md`、3 桁ゼロ埋め）に対応する。

#### Scenario: iteration ごとに別ファイル

- **WHEN** iter=1 の spec-review が完了し、続いて iter=2 の spec-review が完了する
- **THEN** `state.steps["spec-review"][0].findingsPath` が `openspec/changes/<slug>/spec-review-result-001.md`、`state.steps["spec-review"][1].findingsPath` が `openspec/changes/<slug>/spec-review-result-002.md` であり、それぞれ独立した verdict ファイルとして記録される

#### Scenario: approved

- **WHEN** verdict ファイルに `- **verdict**: approved` の行が含まれる
- **THEN** state.steps["spec-review"] 末尾要素の verdict が `approved` になり、state.status は `success`

#### Scenario: needs-fix

- **WHEN** verdict ファイルに `- **verdict**: needs-fix` の行が含まれる
- **THEN** state.steps["spec-review"] 末尾要素の verdict が `needs-fix` になり、stdout に findings サマリが出力される（loop プリミティブが次 iter の判定に使う）

#### Scenario: escalation

- **WHEN** verdict ファイルに `- **verdict**: escalation` の行が含まれる
- **THEN** state.steps["spec-review"] 末尾要素の verdict が `escalation` になり、loop プリミティブは fixer を起動せずに loop を抜ける

### Requirement: spec-review セッションには初回メッセージとして system prompt 派生のテンプレートを送る

セッション作成直後、CLI は MUST `events.send` で `user.message` 1 件を送信する。本文には change folder のパス（`openspec/changes/<slug>/`）、request type、有効化された opt-in フラグ、verdict ファイルの出力先パス（`openspec/changes/<slug>/spec-review-result-{NNN}.md`、`{NNN}` は 1-origin iteration の 3 桁ゼロ埋め）、verdict 行のフォーマット指示を含める。ユーザー入力は SHALL `<user-request>...</user-request>` XML タグで囲み、プロンプトインジェクションを構造的に防御する。

#### Scenario: 初回メッセージ送信（iteration ごとのファイル名）

- **WHEN** iter=2 の spec-review セッションが作成された直後
- **THEN** `events.send` が 1 度呼ばれ、本文に `<user-request>` と `</user-request>` の対、change folder パス、`spec-review-result-002.md` の文字列、`- **verdict**:` のフォーマット指示が含まれる

### Requirement: verdict ファイル不在時のフェイルセーフ

`fetchSpecReviewResult` が null を返した（内部リトライ後も 404）場合、CLI は MUST state.status を `failed`、error.code を `SPEC_REVIEW_RESULT_NOT_FOUND` に設定する。verdict 行がパースできない場合は SHALL state.steps["spec-review"] 末尾要素の verdict を `escalation`、stderr に `Spec-review verdict could not be parsed; treating as escalation.` を出力する。リトライ回数（最大 3 回）と間隔（1 秒）は `fetchSpecReviewResult` の内部仕様であり、本 Requirement では呼び出し側の挙動のみを定義する。loop プリミティブから見ると `escalation` verdict の挙動と同じく fixer を起動せずに loop を抜ける。

#### Scenario: ファイル 404 (リトライ後も null)

- **WHEN** `fetchSpecReviewResult` が null を返す（内部リトライをすべて消費した後）
- **THEN** state.status が `failed`、error.code が `SPEC_REVIEW_RESULT_NOT_FOUND` になる

#### Scenario: verdict 行が無い

- **WHEN** verdict ファイルは存在するが verdict 行がパースできない
- **THEN** state.steps["spec-review"] 末尾要素の verdict が `escalation` になり、stderr に warning メッセージが出力される（state.status は `success` のまま）。loop プリミティブは fixer を起動せずに loop を抜ける
