# ADR-20260718: pipeline-owned evidence の authorship 境界（agent は evidence を偽造できない）

## ステータス

proposed。構造判断のみを定める。ADR-20260713（execution ownership）・ADR-20260715（remote checkpoint 境界）・ADR-20260716（assurance profile）・ADR-20260717（assurance provenance floor）の trust-root に位置する。assurance の再導出が信頼する **pipeline-owned evidence（journal ＝ events.jsonl / state.json と、そこから fold される commit OID / verdict）を、agent が偽造できない**境界を定める。実装経路は後続 behavior（spec ＋ request）が担う。

## コンテキスト

ADR-20260717 は floor の権威を「最終 HEAD で機械達成された provenance」に置き、達成判定を記録された anchor（test-case-gen / spec-review / test-materialize / implementer の commit OID）で git tree から再導出する。しかし **その anchor（commit OID）・verdict・scenario/spec の凍結基準は、すべて journal に記録された値に根を持つ**。そして journal は現状:

- **agent の writable worktree（cwd）内**にある。agent sandbox の `allowWrite` は `[cwd, cwd/**]`、tool guard は cwd 内を全許可するため、agent は journal を Edit / Write / Bash で直接書ける。
- per-node commit（`git add -A`）で **agent の code 変更と同一 commit** に載る。tampered journal と tampered code を分離するものが無い。
- **事後の改竄検査が無い**。既存の main-checkout guard は main checkout ＋ `.specrunner/**`（config）を監視し、worktree の branch-borne journal（`specrunner/changes/<slug>/…`）を見ない。resume は on-disk state を素通りし、attach は self-consistency（fold / counter / profile digest / identity）のみ検証して authenticity を検証しない。

したがって assurance の連鎖全体が、agent が書き換え可能な evidence に根を張っている。脅威は単一の書込 API に留まらない — 少なくとも次を反例（歯）として想定する:

1. Edit / Write による直接変更
2. Bash による変更
3. git plumbing / self-commit で tree だけを差し替える
4. agent 実行中に process が落ち、post-run 検査を通さず resume / attach する
5. journal と state を整合させたまま同時改竄する

prompt による禁止は enforcement にならない。また「post-run に hash を比較するだけ」では、検査前 crash が抜け道になる。よって authorship を構造的に pipeline へ固定し、あらゆる終了・crash・resume・attach 経路でその固定が破れない境界が要る。

## 決定

- **D1（不変：evidence は偽造できない）**: agent は、正常終了・異常終了・crash・resume / attach のいずれを経ても、**forged な pipeline-owned evidence を正規記録として成立させられない**。pipeline-owned evidence とは journal（events.jsonl / state.json）と、そこから fold される commit OID / verdict を指す。

- **D2（authorship 境界：evidence は pipeline のみが author する）**: pipeline-owned evidence は **pipeline（runner）だけが author する**。agent の writable scope は OS sandbox 層と tool-guard 層の**双方で** journal を除外する。この境界は sandbox が利用不能なとき **fail-closed**（本境界について unsandboxed な degrade を許さない）。raw filesystem 経路（Bash）と commit 経路の**両方**を閉じる（#783 の sandbox fail-open と #464 の commit denylist が対応する二経路）。

- **D3（committed-tree を durable anchor と照合する）**: agent 実行の前に、pipeline は evidence の trusted 状態を agent の届かない **durable anchor**（不変の git 履歴、または agent が到達できない pipeline 管理の ref）に固定する。per-node commit 後、**committed tree の journal が pipeline-authored anchor と一致すること**を検証する。不一致は偽造。これは write 防止をすり抜ける経路（git plumbing / self-commit の tree 差し替え）も捕える。#464 の commit-time path guard を、agent-writable 扱いされている journal path（`specrunner/changes/<slug>`、dot 無し）まで拡張する位置づけ。

- **D4（post-run 限定でなく crash / resume / attach 経路でも再検証）**: D3 の検証は agent 直後だけでなく **resume と attach の経路でも enforce する**。検査前 crash が forged evidence を洗浄できないよう、resume / attach は journal を durable anchor / 不変履歴に照合してから正規記録として扱う。attach は現状 self-consistency しか見ないため、authenticity 述語を追加する。

- **D5（違反時は trusted bytes へ戻してから halt）**: 偽造を検知したら、tampered bytes のまま進めず・persist せず、durable anchor から **trusted evidence を復元してから halt（escalation）する**。agent が journal のどちらも author できなくなれば、整合を保った同時改竄（反例 5）は構造的に成立しない。

- **D6（out-of-loop authority は不変）**: archive floor（ADR-20260717）は記録 anchor で git から再導出し続ける。本 ADR はその **anchor を記録する journal を偽造不能にすることで、再導出を端から端まで健全にする**。

## 構造的含意

- **trust-root の移動**: assurance spine の根が「git から再導出するが journal の anchor は信頼する」から「journal 自体が pipeline-authored で偽造不能」へ移る。ADR-20260717 の revision binding が残した残余（anchor OID 自体が journal 由来で改竄可能）を閉じる。
- **二層で独立に enforce**: 書込境界を OS sandbox と committed-tree 照合の**二層**で守る。sandbox の degrade（#783）だけでも、plumbing のすり抜け（#464 の gap）だけでも境界は破れない。
- **journal は branch-borne のまま**: resume / attach の durability のため journal は feature branch に commit され続ける。制約するのは location でなく **authorship**。
- **resume / attach に authenticity 述語が加わる**: 現状の self-consistency（fold / counter / digest / identity）に、evidence が pipeline-authored である検証が重なる。
- **degrade の意味が変わる**: 本境界について sandbox 利用不能は「そのまま実行」でなく halt。

## 検討した代替案

- **prompt でジャーナル改変を禁止する**: enforcement にならない。agent は無視できる。却下。
- **post-run に hash 比較だけ行う**: 検査前 crash が forged evidence を洗浄する。resume / attach 経路で再検証しなければならない（D4）。却下。
- **`.specrunner/**` のみの path denylist（現 #464 の射程）**: branch-borne journal は `specrunner/changes/`（dot 無し）配下で agent-writable のまま残る。境界を journal まで拡張する（D3）。却下。
- **`deriveAchievedAssurance` の再導出だけに依拠する**: 記録 commit OID の anchor を信頼しており、その anchor は偽造可能な journal に根がある。journal を偽造不能にして初めて再導出が健全（D6）。却下。
- **OS sandbox 単独（unavailable で fail-open、Bash が bypass）**: #783 の degrade 穴。境界は fail-closed かつ sandbox から独立でなければならない（D2 / D3）。却下。

## 結果

- **Positive**: assurance spine が信頼できる root を得る。記録される anchor / verdict が偽造不能になり、floor の再導出が端から端まで健全になる。ADR-20260717 が残した「anchor OID 自体が journal 由来」の残余を閉じる。#464（commit 経路）と #783（sandbox 経路）を、単一の authorship 境界の下に統合できる。
- **Negative**: journal の書込経路を pipeline 専有へ作り直す必要がある。sandbox fail-closed は「利用不能でも実行」の degrade 経路を本境界について塞ぐ（unavailable は halt）。committed-tree 照合は per-node の検査＋resume / attach 再検査のコストを足す。

---

> agent sandbox の scoping・committed-tree 照合の機構・durable anchor の実体・trusted bytes 復元経路・resume / attach の authenticity 述語といった「何をするか」は後続 behavior（spec ／ request）が担う。本 ADR は authorship 境界のみで、実装経路は主張しない。#464 / #783 は本境界の下に接続する。
