# vscode-just

VS Code extension for [justfiles](https://github.com/casey/just), powered by [just-lsp](https://github.com/terror/just-lsp).

## Features

- Syntax highlighting
- Completions (recipes, variables, builtins)
- Hover documentation
- Go to definition
- Diagnostics
- Rename and find references
- Code actions (run recipes from editor)
- Formatting

## Requirements

Install [just-lsp](https://github.com/terror/just-lsp):

```sh
cargo install just-lsp
```

or

```sh
brew install terror/tap/just-lsp
```

## Settings

| Setting | Description | Default |
|---|---|---|
| `vscode-just.lsp.path` | Path to `just-lsp` binary | `"just-lsp"` |
| `vscode-just.lsp.formatting.indentation` | Custom indentation for formatting | `null` |
| `vscode-just.lsp.rules` | Per-diagnostic-rule severity overrides | `{}` |
