---
title: hacksh の出力が一つの経路を通らない
theme: terminal-output
---

# Problem

hacksh は出力の種類ごとに別の経路で書いている。

- バージョンは `console.log` で書く。
- ヘルプは `showUsage` を通り、書き先は `runMain` の `showUsage` オプションか `console.log` である。
- 使い方のエラーは `console.error` と `showUsage` で書き、それ以外のエラーは `console.error` で書く。`onError` を渡した場合は、エラーの表示が利用者に任される。

ここに `run` からの出力（0018）と対話入力の表示（0021）が加わると、経路がさらに増える。経路ごとに書き方が違うため、出力形式の切り替え（0019）や見た目の統一（0020）を、すべての出力に漏れなく効かせる場所がない。テストで出力を確かめるにも、経路ごとに差し替えが要る。

解決後は、hacksh が書くすべての出力（ヘルプ、バージョン、エラー、`run` からの出力、対話入力の表示）が同じ一つの printer を通る。printer を呼び出しごとに差し替えれば、すべての出力を受け取れる。

# Rules

- hacksh から出る出力は、すべて同じ printer を通る。
- 依存は `zod`（peer）以外に増やさない。

# Open Decisions

- printer が受け取る単位（種類付きの構造化された値か、整形済みの文字列か）。
- 標準出力と標準エラーの振り分けを、printer が決めるか、呼び出し側が決めるか。
- 既存の公開 API（`showUsage` の `write`、`RunMainOptions.showUsage`、`onError`、`renderUsage`）を printer とどう両立させるか、または置き換えるか。
- 対話入力の読み取り（標準入力）も printer の責務に含めるか。

# Related Files

- `src/run.ts` — バージョン・ヘルプ・エラーの出力と `RunMainOptions`
- `src/usage.ts` — `showUsage`・`renderUsage`・`ShowUsageCallback`
- `src/errors.ts` — 表示されるエラーの型
