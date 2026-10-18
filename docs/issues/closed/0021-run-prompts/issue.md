---
title: run から select などの対話入力を求められない
theme: terminal-output
---

# Problem

`run` のコンテキストには、利用者に選択や確認を求める手段がない。作者は @clack/prompts などを別に使うことになり、その出力はロガー（0018）や出力形式（0019）の判断と無関係に書かれる。

CI 上や AI エージェントからの実行など、対話できない環境で入力を求めると、入力を待って止まるか、ライブラリごとに異なる失敗をする。

解決後は、`run` から選択・確認・文字入力を求められ、人間向けの表示と見た目が揃う。対話できない環境では、入力を待たずに、どの入力が必要だったかを特定できる形で失敗する。利用者が入力を取り消した場合も、作者が区別して扱える。

# Rules

- 対話できない環境で入力を待って止まらない（`terminal-output` テーマ）。
- 誤った呼び出しは別の挙動へ流さず、明確なエラーにする（`ai-native` テーマ）。
- 依存は `zod`（peer）以外に増やさない。入力欄の描画とキー入力の読み取りは自前で書く。
- hacksh から出る出力は、すべて同じ printer を通る（0022）。入力欄の表示もその一つである。

# Open Decisions

- 対応する入力の種類（`select`・`confirm`・`text` から始めるか、`multiselect` なども含めるか）。
- 対話できない環境で、既定値があればそれを使うか、常に失敗するか。
- 入力の取り消し（Ctrl-C など）を、戻り値の特別な値で表すか、例外で表すか。終了コードをどうするか。
- 入力値を引数として渡す手段（同じ値をフラグで指定すれば対話を省ける）を hacksh が用意するか。

# Related Files

- `src/command.ts` — `CommandContext`
- `src/errors.ts` — `HackshUsageError`・`HackshValidationError`
- `docs/issues/open/0009-structured-cli-errors/issue.md` — CLI 実行時のエラーの構造化
- `docs/issues/closed/0022-single-printer/issue.md` — すべての出力が通る printer
