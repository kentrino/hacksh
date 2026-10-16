---
title: 未知の引数を確認しなくても実行が進む
theme: reliable-invocation
---

# Problem

未知のオプションや余った位置引数は extraArgs に残るが、run が確認しなくても実行できる。--dry-rnu のような誤記は、期待したフラグが有効にならないまま副作用へ進む原因になる。

通常の CLI と引数転送用のラッパーで、未知の入力の扱いを明示できるようにする。

# Rules

- 拒否・保持の方針を明示する。通常の CLI では拒否を推奨し、既定値変更の互換性を検討する。
- -- 以降の passthrough と未知の入力を区別する。
- 候補は提示しても、自動補正・曖昧な省略一致で実行しない。
- 拒否は run と副作用のある setup より前に行う。

# Acceptance Criteria

- 未知の長短オプション、余剰位置引数、親子各段階の未知の入力を検証する。
- 拒否時に対象トークンを構造化エラーとして得られ、run が呼ばれない。
- 保持モードは順序を保ち、明示的な passthrough を壊さない。
- help/version と未知の入力が同時にある場合の優先順位を文書化する。

# Open Decisions

- 方針の設定場所と親子間の継承、既存 extraArgs 利用者への移行。
- 未知のオプションの後の値を、保持モードでどのように扱うか。

# Related Files

- `src/parser.ts`
- `src/run.ts`
- `docs/issues/0009-structured-cli-errors/issue.md`
