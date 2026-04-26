# Implementer Decisions

## Task 1: getChangeFolderDirectoryContents

- getChangeFolderFileContent の既存パターンをそのまま踏襲する :: 同一モジュール内で ownership verification + path traversal guard のパターンが確立済みであり、一貫性を優先する
- trailing `/` による prefix collision 防止は不要とする :: `startsWith(changeFolderPath)` + `..` 排除で十分。change folder path はスラッシュ区切りの固有パスであり衝突しない

## Task 2: Tree state management

- expandedDirs を `Set<string>` 、dirChildren を `Map<string, DirectoryEntry[]>` で管理する :: design.md D4 に従う。O(1) toggle check と lazy population の両立
- useState に Set/Map を直接格納し、更新時に new Set/new Map で immutable 更新する :: React の参照比較による再レンダリングを正しくトリガーするため

## Task 3: Tree rendering

- renderFileTree を WorkspaceClient 内のローカル関数として定義する :: コンポーネント分割は non-goal。state への直接アクセスが必要なため

## Task 4: Propose navigation fix

- connectStream と setSelectedManagedSessionId の呼び出しを削除し、session list の refresh のみ残す :: design.md D3 に従う。ユーザーは request detail page に留まる
