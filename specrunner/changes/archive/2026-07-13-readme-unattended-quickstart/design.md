# Design: README Quick Start を無人ループ中心に再構成

## Context

`README.md` の Quick Start（5–22 行）は現在 attended フロー（`request new` → `run` → `job archive`）を一次パスとして提示している。しかし SpecRunner の設計上の一次ストーリーは無人ループ（issue 起票 → 承認ラベル付与 → `inbox run` で発火 → PR → escalation は issue コメント → `/resume`）である。

既存のドキュメント構造：

- `README.md:101–113`「Automation with GitHub Issues」節に無人ループの概要が既に存在する。
- `docs/operations.md` に認証3層・crontab・issue ジェスチャー・スケジューリング例・inbox 挙動詳細が揃っている。
- 承認ラベルのデフォルトは `specrunner-approved`。

本変更は README の導線順序の変更のみであり、機構・コマンド・docs の内容は変更しない。

## Goals / Non-Goals

**Goals**:

- README Quick Start の第一パスを無人ループにする。
- attended フローを代替パスとして Quick Start 内に残す（削除しない）。
- スケジューラの詳細（crontab/launchd/GitHub Actions）は Quick Start に展開せず、`docs/operations.md` へのリンクで参照させる。

**Non-Goals**:

- inbox / tick / resume の機構変更。
- `docs/operations.md` の書き換え。
- 新規コマンド・フラグの追加。
- Quick Start 以外の README 節の変更。

## Decisions

### D1: Quick Start を「無人ループ → attended フロー（代替）」の二段構成に再編

**Rationale**: 一次ストーリー（無人ループ）を先に見せることで、初読者が SpecRunner の主要な使い方を最初に把握できる。attended フローを後段の「代替パス」小節に移動することで、どちらの経路も一画面に収まる。

**Alternatives considered**:
- 無人ループだけに絞る（attended フロー削除）→ 小規模・単発利用では attended が有効なため却下（architect 判断済み）。
- 無人ループの詳細を全部 Quick Start に展開する → 重複・肥大化につながるため却下（architect 判断済み）。

### D2: スケジューラ起動例は最小限（crontab 1 行）にとどめ、詳細は `docs/operations.md` へリンク

**Rationale**: Quick Start の役割は「最短で動かせる導線」であり、全ての設定オプションを網羅する場ではない。crontab 1 行の最小例を示し、詳細は既存の `docs/operations.md` に委ねることで、各事実が一箇所に留まる。

**Alternatives considered**:
- GitHub Actions 例も Quick Start に展開する → Quick Start が長くなりすぎるため却下。

### D3: 無人ループの「入口 → 承認 → tick → PR → escalation 応答」を順番通りに番号付きで提示

**Rationale**: 初読者が「次に何をするか」を番号で追える構成にすることで、最短導線として機能する。現状の「Automation with GitHub Issues」節は散文的であり Quick Start には不向き。

**Alternatives considered**:
- 箇条書き（番号なし）→ 手順の順序が伝わりにくいため却下。

## Risks / Trade-offs

- [Risk] Quick Start が2パス構成になることで若干長くなる → `docs/operations.md` へのリンクで詳細を委ねることで Quick Start の長さを抑制する。
- [Risk] attended フローを「代替」と明示することで、attended ユーザーが疎外感を感じる → 「小規模・単発利用向け」と補足することで用途を明示し疎外感を緩和する。

## Open Questions

なし。architect 評価済みの設計判断により、主要な分岐点は解消されている。
