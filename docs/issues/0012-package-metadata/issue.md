---
title: npm とリポジトリにプロジェクトの紹介情報がない
theme: oss-readiness
---

# Problem

`package.json` には `description`、`repository`、`homepage`、`bugs`、`keywords`、`author` がない。npm に公開すると、パッケージページにソースへのリンクや説明が表示されず、検索にもかかりにくい。provenance 付きで公開する場合は `repository` とソースのリポジトリが一致している必要があるが、それも満たせない。

GitHub リポジトリ `kentrino/zitty` も、公開状態なのに description、website、topics が空である。

解決後は、npm と GitHub のどちらからでも、プロジェクトの説明、ソース、報告先にたどり着ける。

# Open Decisions

- `description` と GitHub の description に使う一文。
- `keywords` と topics に入れる語（`cli`、`zod`、`citty` など）。
- `homepage` を README にするか、別のドキュメントサイトにするか。

# Related Files

- `package.json` — 紹介情報のフィールドがない
