# OpenSpec 技術リファレンス

OpenSpec は AI コーディングアシスタント向けの仕様駆動開発（SDD）フレームワーク。

## 基本概念

### Change

変更の単位。`openspec/changes/<name>/` フォルダとして管理。

```
openspec/changes/add-dark-mode/
├── proposal.md      # 意図、スコープ、アプローチ
├── design.md        # 技術的アプローチ、設計判断
├── tasks.md         # 実装チェックリスト
└── specs/           # Delta specs（差分仕様）
    └── ui/spec.md
```

### Artifacts

| Artifact | 目的 |
|----------|------|
| **proposal.md** | 何を、なぜ、どうやって |
| **specs/** | 振る舞いの変更（ADDED/MODIFIED/REMOVED） |
| **design.md** | 技術的アプローチ、アーキテクチャ判断 |
| **tasks.md** | 実装タスクのチェックリスト |

フロー: `proposal → specs → design → tasks → implement`

### Specs（仕様）

システムの振る舞いを記述する「真実の源」。`openspec/specs/` に格納。

```
openspec/specs/
├── auth/spec.md
├── payments/spec.md
└── ui/spec.md
```

構造:
- **Requirements**: RFC 2119 キーワード（MUST, SHOULD）
- **Scenarios**: Given/When/Then 形式

### Delta Specs

既存仕様への変更を記述：

```markdown
## ADDED Requirements
- ダークモード切り替えが可能であること

## MODIFIED Requirements
- テーマ設定は localStorage に保存する（以前: cookie）

## REMOVED Requirements
- レガシーテーマAPI
```

## CLI コマンド

### セットアップ

```bash
npm install -g @fission-ai/openspec@latest
openspec init --tools claude
```

### Core プロファイル（4コマンド）

| コマンド | 目的 |
|----------|------|
| `/opsx:propose <説明>` | 変更作成 + 全アーティファクト生成 |
| `/opsx:explore [topic]` | アイデア検討・調査（アーティファクト非生成） |
| `/opsx:apply [name]` | tasks.md に基づいて実装 |
| `/opsx:archive [name]` | 完了した変更をアーカイブ |

### 拡張コマンド

| コマンド | 目的 |
|----------|------|
| `/opsx:new <name>` | 変更フォルダのみ作成 |
| `/opsx:continue [name]` | 次のアーティファクトを段階的に作成 |
| `/opsx:ff [name]` | 全アーティファクトを一括作成 |
| `/opsx:verify [name]` | 実装が仕様と一致しているか検証 |
| `/opsx:sync [name]` | Delta specs をメイン仕様にマージ |
| `/opsx:bulk-archive` | 複数変更を一括アーカイブ |

### CLI コマンド（シェル）

```bash
openspec init                    # プロジェクト初期化
openspec init --tools claude     # Claude Code 用に初期化
openspec config profile          # プロファイル選択（core/custom）
openspec update                  # スキル・コマンドを再生成
openspec list --json             # アクティブな変更一覧
openspec status --change <name> --json  # 変更のステータス
openspec instructions apply --change <name> --json  # 実装指示取得
openspec validate <name>         # 仕様整合性検証
```

## ワークフローパターン

### クイックフィーチャー（明確な要件）

```
/opsx:propose "認証機能を追加"
/opsx:apply
/opsx:verify
/opsx:archive
```

### 探索的アプローチ（要件不明確）

```
/opsx:explore "パフォーマンス改善の選択肢"
/opsx:new perf-optimization
/opsx:continue
/opsx:apply
```

### 段階的進行

```
/opsx:new add-feature
/opsx:continue   # proposal 作成
/opsx:continue   # specs 作成
/opsx:continue   # design 作成
/opsx:continue   # tasks 作成
/opsx:apply
```

## ディレクトリ構造

```
openspec/
├── project.md           # プロジェクト概要
├── config.yaml          # 設定
├── schemas/             # カスタムスキーマ
├── specs/               # メイン仕様
│   └── <capability>/spec.md
└── changes/
    ├── <active-change>/  # アクティブな変更
    │   ├── proposal.md
    │   ├── design.md
    │   ├── tasks.md
    │   └── specs/
    └── archive/          # 完了した変更
        └── YYYY-MM-DD-<name>/
```

## Schemas

ワークフローをカスタマイズ可能。デフォルトは `spec-driven`。

```yaml
# openspec/schemas/research-first/.openspec-schema.yaml
artifacts:
  - research
  - proposal
  - design
  - tasks
```

## ツール対応

21+ の AI ツールに対応：
- Claude Code
- Cursor / Windsurf
- GitHub Copilot
- Amazon Q
- Gemini CLI
- Continue
- RooCode
- その他

### ツール別構文

| ツール | 構文 |
|--------|------|
| Claude Code | `/opsx:propose` |
| Cursor/Windsurf | `/opsx-propose` |
| Trae | `/openspec-propose` |

## 参考リンク

- [GitHub](https://github.com/Fission-AI/OpenSpec)
- [公式サイト](https://openspec.dev/)
- [コマンドリファレンス](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md)
- [ワークフローガイド](https://github.com/Fission-AI/OpenSpec/blob/main/docs/workflows.md)
