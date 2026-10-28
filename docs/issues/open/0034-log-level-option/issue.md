---
title: CLI の利用者がログの量を絞れない
theme: terminal-output
---

# Problem

logger は trace から fatal までの全レベルを常に出力し、表示するレベルを選ぶ手段がない。CLI の利用者は debug や trace の出力を隠せず、作者が詳細な診断ログを書くほど通常の出力が読みにくくなる。作者が独自に `--verbose` などを定義しても、hacksh の logger には反映できない。

解決後は、利用者が実行時に表示するログの最低レベルを選べる。

# Rules

- ログ量の選択は利用者の明示的な指定で決める。出力先が TTY かどうかでログを抑制しない。
- `run` が投げたエラーの表示はログではなく、レベル指定に関係なく出力する。
- 利用者が自分の CLI で使う短い名前（`-v`、`-q` など）を hacksh が予約しない。

# Open Decisions

- 組み込みオプション名（`--log-level` など）と、`HACKSH_LOG_LEVEL` などの環境変数を両方設けるか、その優先順位。
- 作者が `runMain` などでデフォルトのレベルを変えられるか。
- デフォルトのレベル（`info` で debug・trace を隠すか、現在どおり全レベルか）。
- 抑制したログを JSON 出力からも除くか。

# Related Files

- `src/logger.ts` — 全レベルを無条件に printer へ送る
- `src/command.ts` — `help`・`version` を組み込みオプションとして予約している
- `src/printer.ts` — `HACKSH_OUTPUT` による出力形式の選択
