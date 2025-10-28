# Markdown Mermaid PDF

Pandoc と XeLaTeX を用いた Markdown→PDF 変換環境を提供する Docker コンテナです。Mermaid 図表に対応しています。

## 機能

- Markdown から PDF への変換（Pandoc + XeLaTeX）
- Mermaid 図表のサポート（mermaid-filter + Puppeteer + Chromium）
- 日本語フォント対応（Noto Sans CJK JP）
- カスタマイズ可能な PDF 設定

## 必要な環境

- Docker 20.10 以上
- Docker Compose v2 以上（オプション）

## クイックスタート

```bash
# イメージをビルド
make build

# サンプル PDF を生成
make example

# 詳細なコマンドを確認
make help
```

## 使用方法

### Makefile を使用（推奨）

すべてのコマンドは下記の「Makefile コマンド一覧」を参照してください。

```bash
make help  # コマンド一覧を表示
```

### Docker を直接使用

```bash
# PDF を生成
docker run --rm \
  -v $(pwd)/workspace:/workspace \
  markdown-mermaid-pdf:latest \
  document.md output.pdf

# コンテナ内でシェルを起動
docker run --rm -it \
  -v $(pwd)/workspace:/workspace \
  markdown-mermaid-pdf:latest \
  bash

# Docker Compose を使用
docker compose run --rm markdown-mermaid-pdf document.md output.pdf
```

## Makefile コマンド一覧

| コマンド                    | 説明                                  |
| --------------------------- | ------------------------------------- |
| `make build`                | Docker イメージをビルド               |
| `make rebuild`              | キャッシュなしで再ビルド              |
| `make example`              | example.md から PDF を生成            |
| `make test`                 | PDF が正常に生成されるかテスト        |
| `make convert INPUT=<file>` | 指定したファイルを変換                |
| `make shell`                | コンテナ内で bash シェルを起動        |
| `make clean`                | 生成された PDF をクリーンアップ       |
| `make clean-all`            | PDF と Docker イメージを削除          |
| `make info`                 | Docker イメージとツールバージョン表示 |
| `make license-check`        | ライセンスコンプライアンスを検証      |
| `make help`                 | ヘルプメッセージを表示                |

## Mermaid 図表の使用例

`workspace/example.md` に Mermaid 図表を含むサンプルドキュメントがあります。フローチャート、ガントチャート、シーケンス図などに対応しています。

詳細は [Mermaid 公式ドキュメント](https://mermaid.js.org/)を参照してください。

## カスタマイズ

- **Mermaid/Puppeteer 設定**: `/config/.mermaid-config.json`, `/config/.puppeteer.json`, `/config/.mermaid.css`
- **LaTeX 設定**: `/config/header.tex` でフォント、レイアウト、見出しスタイルを変更可能

カスタム設定でイメージを再ビルドする例：

```dockerfile
FROM markdown-mermaid-pdf:latest
COPY my-custom-header.tex /config/header.tex
```

## トラブルシューティング

問題が発生した場合は [TROUBLESHOOTING.md](TROUBLESHOOTING.md) を参照してください。

## ライセンス

このプロジェクトは **MIT License** でライセンスされています。詳細は [LICENSE](LICENSE) を参照してください。

### サードパーティライセンス

この Docker イメージには以下のオープンソースソフトウェアが含まれています：

- Pandoc (GPL v2+), XeLaTeX/TeX Live (LPPL), Chromium (BSD 3-Clause)
- Node.js, mermaid-filter, yq (MIT License)
- Noto Sans CJK JP (SIL Open Font License 1.1)

すべてのコンポーネントは商用利用可能です。詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。

## 参照

- [Pandoc 公式ドキュメント](https://pandoc.org/)
- [Mermaid 公式ドキュメント](https://mermaid.js.org/)
- [mermaid-filter](https://github.com/raghur/mermaid-filter)
