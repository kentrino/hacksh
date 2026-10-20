---
title: コマンド定義を必要になるまで読み込めない
theme: citty-parity
parked: low-priority
---

# Problem

`subCommands` は定義オブジェクトの Record だけを受け付け、`args` などの定義も値で渡す必要がある。そのため、すべての子の定義とその依存モジュールが起動時に評価される。サブコマンドが多い CLI では、選択しない子の読み込みが起動時間に加わる。定義を非同期に組み立てる必要がある場合も、起動前にすべてを解決しておく必要がある。

解決後は、1回の実行で選択したコマンドとヘルプ表示に必要な定義だけが読み込まれる。

# Rules

- 公開関数の同期・非同期の契約を変えない。`parseArgs`・`renderUsage`・`showUsage` は将来のコマンド解決のために既に async である。

# Open Decisions

- 対象を個々の子に限るか、コマンド情報や `args` を含む定義全体に広げるか。
- 親のヘルプで子の一覧を出すときに、子の定義をどこまで読み込むか。
- 読み込みに失敗したときのエラーの種類。

# Related Files

- `src/command.ts` — `CommandDef` と `defineCommand` の検査
- `src/run.ts` — サブコマンドの解決
- `README.md` — 公開関数の非同期契約
