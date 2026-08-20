# ADR-20260820: Issue を job authority にしない

## ステータス

accepted。ADR-20260605（event journal / projection の branch-borne state）と ADR-20260715（remote checkpoint と reattachment 境界）の補完。両 ADR が「git だけが durable state」と定めた上で、GitHub issue が job lifecycle の入口（start / resume）になったとき issue 側の何を信じてよいかを構造として固定する。

## コンテキスト

issue 番号だけを入力に job を起動・再開する経路が成立した（`job start --from-issue` / `job resume --from-issue`）。この経路では GitHub issue が 3 つの顔を持つ:

- issue 本文（request.md 形式の要求記述）
- issue コメント（escalation 通知 marker — jobId を含む機械可読 anchor）
- Development linked branches（issue ↔ feature branch の GitHub 側リンク）

放置すると、これらが branch-borne checkpoint と並ぶ**第二の正本**に育つ危険がある。issue 本文を再開時に再読すれば「どの request が正か」が二重化し、Development リンクを identity として信じれば「リンクの付け替え・削除」が state 破壊と等価になる。今後 event source（Actions dispatch・inbox・別 transport）が増えるほど、この役割の曖昧さは経路ごとに再発明される。

ADR-20260715 D4 は「discovery policy は別問題」として branch の発見戦略を切り出していた。issue 起点経路はその discovery policy の最初の実装であり、答えを構造として固定する時点にある。

## 決定

issue 側の 3 つの顔に、それぞれ**一つの役割だけ**を与える。

- **D1（issue 本文 = request source ／ entrance fidelity reference。job state authority ではない）**: issue 本文は job state authority ではない。`job start --from-issue` では**一度だけ request source として消費**され、draft（request.md）へ複写された時点で開始後の正典は change folder の request.md になる（この経路は inbox 起点と同じく fidelity gate の対象外 — 本文がそのまま request になるため比較対象が無い）。既存 request + `--issue` の経路では issue 本文は request source ではなく **entrance fidelity reference** であり、issue fidelity gate が着手前に request.md と比較する（non-propagation — 本文を state / log に保存しない）。gate halt 後の request-review entrance への resume では、収束のため issue 本文が**再取得・再評価されうる**（`specrunner/adr/2026-08-06-issue-request-fidelity-gate.md` の契約）。いずれの経路でも issue 本文が開始後の正典・state authority になることはない。
- **D2（escalation marker / Development link = locator）**: issue コメントの escalation marker と Development linked branches は **candidate 発見のための index** であり、authority を持たない。marker は「どの jobId か」、リンクは「どの branch が候補か」を与えるだけで、その正しさは常に checkpoint 側で確定する。index の欠落・不整合は「発見できない」エラー（fail-closed の案内付き）であって state の破壊ではない — 明示指定の手動経路（`job attach --branch` → `job resume`）が常に成立する。リンク登録は best-effort とし、登録失敗で job を止めない。
- **D3（branch-borne checkpoint = identity / state authority）**: job の identity と state の正本は `origin/<branch>` HEAD の checkpoint のみ。issue 起点の確定は candidate branch の checkpoint が持つ identity（jobId / issueNumber / branch）の一致照合で行い、確定できなければ暗黙選択せず fail-closed で停止する。検証の中身は ADR-20260715 D2（tree の性質検証）を継承する。
- **D4（event source が増えても役割分担は不変）**: 新しい入口（CI dispatch・別 transport・将来の event source)は、入力を request source として一度だけ消費し、外部システム上の参照は locator に留め、確定と state は checkpoint に委ねる同じ 3 分担を継承する。入口が増えても authority は checkpoint の一本のままにする。

## 構造的含意

- **reattachment 束縛の 2 相化**: 発見（locator）と確定（checkpoint identity）が分離され、`dynamic-model.md` reattachment の candidate 発見／確定として記述される。ADR-20260715 D4 の「discovery policy は別問題」への答えがこの locator 相。
- **issue-target 境界**: issue 側の 3 役割を実装として封じる境界が `core/issue-target/`（`components.md` IssueTarget）。resume face が issue 本文を読まないことは narrow interface（`getIssue` を構造的に持たない）で表現され、能力の不在が規約でなく型で保証される。
- **非対称の固定**: issue → job は locator 経由の発見・確定、job → issue は通知（escalation marker・terminal comment）の出力。双方向に state を同期しない — issue 側に state の写しを置く機構を作らない。

## 検討した代替案

- **issue コメントに job state（の要約）を書いて機械可読の正本にする**: GitHub API 依存の第二正本になり、checkpoint との乖離時にどちらを信じるかの裁定問題を持ち込む。コメントは通知（人間向け＋marker）に留める。却下。
- **Development リンクを identity として信頼する**: リンクは GitHub 上で人手により付け替え・削除できる可変 index であり、identity の担い手にすると外部操作が state 破壊になる。index に降格し、確定は checkpoint 照合に置く。却下。
- **issue 本文を開始後も正典として扱い、任意の経路で再読・同期する**: request.md との二重正本になり、乖離時にどちらを信じるかの裁定問題を持ち込む。issue 本文の参照は entrance fidelity reference（request-review entrance の gate とその resume 再評価）に限定し、それ以外の pipeline / resume 経路は本文を読まない。却下。
- **locator の欠落時に `origin/*` を走査して補完する**: ADR-20260715 D4 が却下済み（走査コスト・誤検出・排他）。欠落は明示指定の手動経路へ案内する。却下。

## 結果

- **Positive**: 入口（issue・Actions・inbox）がいくつ増えても、job の正本は branch-borne checkpoint の一本に保たれる。issue 側の外部操作（リンク付け替え・コメント削除）の blast radius は「発見に失敗する」までに限定され、state を壊せない。手動経路（明示 branch 指定）が常に脱出口として残る。
- **Negative**: locator の index が壊れた場合の復旧は人間の明示操作に委ねられる（機械の暗黙補完をしない選択の裏面）。escalation marker はコメント全走査を要し、comment 数に比例したコストを払う（実用上 1 ページに収まる規模で運用）。

---

> issue 起点の CLI 契約（`--from-issue` のエラー分類・exit code・rebind 手順）は behavior（spec / `specrunner/adr/` の issue-target 各 ADR）が定める。本 ADR は役割固定の構造判断のみ。
