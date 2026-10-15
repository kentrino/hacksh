# リリース bot の認証情報を設定する

GitHub Actions がリリース bot の GitHub App トークンを作れるように、次の値をリポジトリに設定する。

- Variable: `RELEASE_BOT_APP_ID`
- Secret: `RELEASE_BOT_PRIVATE_KEY`

名前は takibi に揃える。await-ready は同じ用途に `AWAIT_READY_BOT_APP_ID` と `AWAIT_READY_BOT_PRIVATE_KEY` を使っている。

この値を使うワークフロー:

- `.github/workflows/release.yml`：リリース PR の作成と auto-merge の設定
- `.github/workflows/pinact.yml`：Actions を SHA に固定するコミットの push

# 1. （人）GitHub App を確かめる

takibi と同じ GitHub App を使い、2 つ目の App は作らない。

1. [GitHub App のインストール設定](https://github.com/settings/installations/152797047)を開く。
2. **Repository access** に `kentrino/zitty` を加える。
3. [GitHub Apps の設定](https://github.com/settings/apps)から App を開く。
4. **General** ページで **App ID** を確かめる。takibi の手順書では `4553309` である。
5. takibi で使っている秘密鍵（PEM ファイル）が手元にない場合だけ、**Private keys** で **Generate a private key** を選び、PEM ファイルをダウンロードする。

Client ID、Client secret、Installation ID は使わない。既存の秘密鍵は再ダウンロードできないので、手元にない場合は新しく作る。

# 2. （人）リポジトリに値を設定する

GitHub CLI でログインしてから、リポジトリのルートで次を実行する。

```sh
export RELEASE_BOT_APP_ID=4553309
export RELEASE_BOT_PRIVATE_KEY_PATH=/path/to/private-key.pem

gh variable set RELEASE_BOT_APP_ID --body "$RELEASE_BOT_APP_ID"
gh secret set RELEASE_BOT_PRIVATE_KEY < "$RELEASE_BOT_PRIVATE_KEY_PATH"

unset RELEASE_BOT_APP_ID RELEASE_BOT_PRIVATE_KEY_PATH
```

PEM ファイルの中身をコマンドの引数やシェル変数に入れない。PEM ファイルはリポジトリの中に置かない。設定後は安全な場所へ移すか、不要なら削除する。

# 3. 確かめる

```sh
gh variable list
gh secret list
```

`RELEASE_BOT_APP_ID` と `RELEASE_BOT_PRIVATE_KEY` が表示されればよい。Secret の値は表示されない。

`release.yml` が `main` にある状態でこの設定が欠けていると、`main` への push のたびに Release ワークフローが App トークンの作成で失敗する。
