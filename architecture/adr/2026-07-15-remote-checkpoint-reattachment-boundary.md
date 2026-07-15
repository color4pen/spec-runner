# ADR-20260715: remote checkpoint と machine-local reattachment 境界

## ステータス

accepted。構造判断のみを定める。ADR-20260605（event journal / projection / liveness 分解）が約束した cross-environment resume を、検証可能な checkpoint と再束縛契約まで閉じる補完 ADR。CLI・fetch 戦略・attach 後の振る舞いは behavior（spec ＋ `specrunner/adr/`）が担う。

accepted は decision（構造判断）が accepted であることを意味し、**提供済み機能を主張しない** ―― CLI behavior・検証エラー・実装は後続仕様（behavior）である。

## コンテキスト

ADR-20260605 は truth（`events.jsonl` ＋ `state.json`）を branch-borne に置き、結果として「git だけが durable state（clone / CI checkout で完全 ＝ cross-env resume）」を掲げた。しかしその約束を成立させる要件が未定義のまま残った:

- **発見**: job の索引は machine-local sidecar（`.specrunner/local/*`）の走査に閉じており、`origin/<branch>` 上の checkpoint から job を発見する経路が無い。
- **検証**: branch 上の state が「本当に再開可能か」を判定する述語が無く、sidecar を信じるしかない。
- **再束縛**: liveness（`worktreePath` / `pid` / `session`）は machine-local sidecar 前提で、別環境で feature branch の HEAD から実行コンテキストを再構築する経路が無い。

加えて、実行経路には state persist と git 副作用の**二相境界**がある（B-13/B-14 の commit ownership）。この境界は cross-env recovery を直撃する:

- state persist → push 失敗: ローカルだけ最新。
- push → state persist 失敗: remote に不完全な checkpoint。
- commit 成功・push 失敗: 再送責務が要る。

したがって「awaiting-resume になったら push する」だけでは不足で、**何をもって remote-resumable と呼ぶか**の定義が要る。

## 決定

- **D1（remote checkpoint は単一 commit の性質）**: remote checkpoint は projection（state）・journal（events）・resume に要る成果物を**同一 tree** に収めた単一 commit とする。`remote-resumable` は送信側が立てるフラグではなく、`origin/<branch>` の HEAD に対して検証可能な**述語**。単一 ref の atomic 更新なので distributed transaction は導入しない ―― commit が原子であることが二相境界を局所に押し戻す。push 前は locally resumable、ref 更新後だけ remotely resumable であり、この公開ラグは失敗ではなく**能力差**として扱う。

- **D2（attach は tree を検証してから再束縛）**: attach は `origin/<branch>` HEAD の tree が自己整合であることを検証して初めて liveness を生成する。検証項目 = journal / projection の整合、`state.status` が quiescent（attach-then-resume では `awaiting-resume`）、resume point と pipeline 定義の解決可能性、必須成果物・snapshot の存在、repository / job / branch identity の一致。フラグ信頼ではなく tree の性質検証に責務を閉じる。

- **D3（machine-local reconstruction contract）**: machine-local state は、branch-borne checkpoint から**導出可能**か、または**意味的連続性を失わず新規割当可能**でなければならない。実行継続に必要な durable fact を machine-local にのみ保持してはならない。`worktreePath` は規約から導出、`pid` / `session` は attach 時に新規割当される ―― tree から「導出」はされないが再割当で連続性を保つ。この区別を invariant に含める。現状の liveness sidecar はこの条件を概ね満たす（`jobId` は branch-borne、`worktreePath` / `pid` は再割当可能、top-level `session` は実質不使用で継続情報は journal の `StepRun.sessionId`）。欠けているのは sidecar の中身ではなく、その再構築経路の実装。

- **D4（射程は quiescent job の attach に限定）**: 対象は owner が checkpoint で手放した quiescent job（attach-then-resume では `awaiting-resume`）。`running`（owner 生存・不明）の別マシン takeover は非目標 ―― 必要なら lease / epoch（fencing）を持つ別 ADR。branch は明示指定とし、`origin/*` の暗黙走査はしない（discovery policy は別問題）。

## 構造的含意

- **remote-checkpoint 述語**: `remote-resumable(branch)` は `origin/<branch>` HEAD tree の自己整合性で定義される検証可能述語。`domain-model.md` の JobState Aggregate 不変条件に反映。
- **reattachment 束縛**: attach → validate → materialize → rebind の実行時束縛。tree 検証が閉じて初めて liveness を再 establish する。`dynamic-model.md` の Runtime bindings に反映。
- **reconstruction contract**: liveness の再導出不変を「導出可能 or 意味的連続性を保つ再割当可能」へ強める。`dynamic-model.md` の liveness 束縛不変に反映。
- **二相境界は局所に留まる**: 実行経路の state-persist / git 副作用の二相性（B-13/B-14）は維持。remote-resumability を「単一 commit が origin に乗った瞬間」と定義することで、二相を transactional にする必要をなくす。
- **歯 / B 系の非掲載**: 本 ADR が定めるのは**永続化境界と再束縛の意味論**であり、その適合性は **attach 時の checkpoint 検証**（D2）によって判定される。したがって現時点では静的構造不変として `model.md` に重複掲載しない。attach のコンポーネント境界・依存方向が実装段階で確定し、静的に守るべき構造が生まれた時点で B 系を追加すればよい ―― 今入れると、まだ存在しない実装構造まで accepted に見せてしまう。

## 検討した代替案

- **commit と push を分散トランザクション（2PC）で束ねる**: 単一 ref 更新は atomic なので不要。checkpoint を単一 commit に畳めば二相性は局所（liveness のための persist 先行）に留められる。却下。
- **送信側が remote-resumable フラグを state に書く**: 送信側は二相の隙間で落ちうる。フラグは checkpoint の完全性を保証しない。述語を tree に対して検証する D2 を採る。却下。
- **`running` job の別マシン takeover を本 ADR で扱う**: 所有権の移譲には lease / epoch（fencing）が要り、失敗意味論の質が異なる。射程を quiescent に限定し、takeover は別 ADR に分離。
- **`origin/*` を走査して job を暗黙発見**: 走査コスト・誤検出・排他の問題を持ち込む。発見は明示 branch 指定とし、discovery policy は behavior の別問題に切り出す。却下。

## 結果

- **Positive**: ADR-20260605 が掲げた cross-env resume が、検証可能な述語（D1）と再束縛契約（D2/D3）で閉じる。二相境界は局所に留まり、新たな distributed machinery を導入しない。
- **Negative**: 公開ラグ（locally resumable だが remotely 未成立）の窓が存在する ―― 失敗でなく能力差として運用に開示する。attach は毎回 tree の完全検証を要する（コスト）。machine-local reconstruction の経路は現状未実装であり、behavior 相での実装を要する。

---

> attach の観測可能な振る舞い（`job attach --branch ...` の CLI、fetch 戦略、エラー分類、attach 後に自動 resume するか）は behavior（spec / `specrunner/adr/`）が定める。本 ADR は構造のみで、振る舞いは参照に留める。
