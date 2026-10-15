# リリースフローの全体像

[kentrino/await-ready](https://github.com/kentrino/await-ready) と同じ流れで、npm へ公開する。

1. `main` に Conventional Commits のコミットがマージされる。
2. Release ワークフローの `release-please` ジョブが、バージョンと `CHANGELOG.md` を更新するリリース PR を作る。
3. リリース PR がマージされると、release-please が GitHub Release とタグ（`v0.1.0` など）を作る。
4. 同じワークフローの `publish` ジョブが、npm の Trusted Publishing（OIDC）で `--provenance` 付きで公開する。

npm のトークン（`NPM_TOKEN`）は使わない。リリース PR は GitHub App のトークンで作る。`GITHUB_TOKEN` で作った PR では CI が起動せず、必須チェックを満たせないため。

# リポジトリに置くファイル

次のファイルでリリースと依存更新を自動化する。

| ファイル                            | 役割                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `release-please-config.json`        | `release-type: node`、`bump-minor-pre-major`、`initial-version: 0.1.0`、changelog の節 |
| `.release-please-manifest.json`     | `{ ".": "<npm に出ている版>" }`                                                        |
| `.github/workflows/release.yml`     | `release-please` ジョブと `publish` ジョブ                                             |
| `.github/workflows/pinact.yml`      | Actions を SHA に固定する                                                              |
| `.github/renovate.json`             | 依存の更新 PR                                                                          |
| `.github/CODEOWNERS`                | `* @kentrino`                                                                          |
| `LICENSE`                           | MIT License の本文（`docs/issues/0011-license-file`）                                  |
| `package.json` の `repository` ほか | Trusted Publishing の照合に使う（`docs/issues/0012-package-metadata`）                 |

`publish` ジョブは `.github/actions/setup` に `registry-url: https://registry.npmjs.org` を渡し、`vp run ready` のあとで `vp pm publish --access public --no-git-checks --provenance` を実行する。権限は `contents: read` と `id-token: write` にする。

# 人が行う作業の順番

| 順番 | 文書                                  | 内容                                                        |
| ---- | ------------------------------------- | ----------------------------------------------------------- |
| 1    | `initial-publish-npm.md`              | パッケージ名を npm に登録するため、手元から一度公開する     |
| 2    | `configure-github-repository.md`      | マージ設定、ルールセット、Renovate を設定する               |
| 3    | `add-bot-secrets.md`                  | リリース bot の GitHub App を設定する                       |
| 4    | `configure-npm-trusted-publishing.md` | npm に Trusted Publisher を登録し、最初のリリースを確かめる |

Trusted Publisher は npm にパッケージが存在しないと登録できない。そのため、初回だけ手元から公開する。

# リポジトリ名

GitHub リポジトリと npm パッケージの名前は、どちらも `hacksh`。Trusted Publisher は `kentrino/hacksh` の `release.yml` に設定する。
