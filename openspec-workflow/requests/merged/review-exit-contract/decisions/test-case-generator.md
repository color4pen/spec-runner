# Decision Log — test-case-generator

## Coverage Strategy

pipeline-context.md の must-areas に列挙された 4 領域を個別の must テストケースとして分解する :: 「4 つの must-area が 1 テストケースに混在すると失敗箇所が曖昧になる」ため、各 must-area を独立した TC として分離する。

spec.md の Scenario 単位（合計 12 Scenario）を TC の骨格に使う :: spec.md は already BDD 形式で書かれており、Scenario → TC への変換が最も忠実に仕様を反映でき、重複と漏れが発生しにくい。

error hint factory の iteration 引数化を単一 TC にまとめず「iteration=1, iteration=10, iteration=100」に分割する :: 境界値 (1 桁/2 桁/3 桁) で suffix 計算を個別検証する必要があり、tasks.md T-1.3 が明示的に `iteration=1, 2, 10` の検証を要求しているため。iteration=2 は iteration=1 と同構造のため TC-001 でカバー済みとみなし、100 を境界値として追加する。

## Priority Rationale

spec-review agent が push してから end_turn する E2E 経路 (TC-021) を must にする :: pipeline-context.md must-areas の 1 件目。e2e でしか検証できない振る舞い（agent が実際に git push を実行すること）であり、これが壊れると executor が result file を見つけられず pipeline が escalate する（dogfooding-001 の再現）。

`capabilities.gitWrite === true` の構成検証 (TC-006) を must にする :: pipeline-context.md must-areas の 2 件目。capability 宣言と prompt の矛盾が今回のバグの直接原因であり、regression 防止の要件として明示された。

error hint factory の動的 suffix 計算 (TC-001 〜 TC-005) を must にする :: pipeline-context.md must-areas の 3 件目。`-001`, `-010`, `-100` の 3 桁ゼロ埋めが明示されているため、それぞれ TC として展開する。

executor fetch path と agent message filename の一致 (TC-008, TC-009) を must にする :: pipeline-context.md must-areas の 4 件目（round-trip invariant）。

spec-review system prompt の commit/push 指示 (TC-010) を must にする :: E2E behavioral path を保証するには prompt 内容が先行条件。spec.md に明示的 Scenario がある。

既存 491 tests の regression 0 確認 (TC-018) を must にする :: design.md Constraints と code-review emphasis で明示。これが壊れると本変更自体がリリース不可になる。

dogfooding 完走 (TC-023) を must にする :: request.md 受け入れ基準で明記。ただし manual に分類する（CI 環境で自動実行するにはコスト見積 $5-10 が必要なため）。

## Category Rationale

E2E behavioral path (TC-021, TC-022, TC-023) のうち TC-021 と TC-022 を e2e、TC-023 を manual にする :: TC-021/022 は自動化可能（agent session を test fixture で起動し git log を検証）。TC-023 は dogfooding 専用コマンドで実行するため CI pipeline 外 → manual。

ADR ファイル存在確認 (TC-016, TC-017) を manual にする :: ファイルの存在確認は自動化できるが、「Context section が architecture 差分を説明する」という意味的正しさは人間が確認する必要があるため。

capability 宣言確認 (TC-006, TC-007) を unit にする :: ソースコード読み取りで `capabilities` オブジェクトを assert できる。サービス起動不要。

## Untestable / Blocked Areas

なし — 全 must 領域について spec.md / tasks.md / design.md に十分な仕様記述があり、テストケースを生成できた。

## TC 番号と must-area の対応

| must-area (pipeline-context.md) | 対応 TC |
|---|---|
| spec-review agent が result file を origin に commit + push した上で end_turn する E2E 経路 | TC-010 (prompt), TC-021 (e2e) |
| code-review.ts の `capabilities.gitWrite` が true である構成検証 | TC-006 |
| `specReviewResultNotFoundError` / `codeReviewResultNotFoundError` が iteration 引数から動的に正しい filename suffix を生成する | TC-001, TC-002, TC-003, TC-004, TC-005 |
| executor が GitHub から fetch する result filename と agent が書く filename が `{step}-result-{NNN}.md` 形式で一致する | TC-008, TC-009 |
