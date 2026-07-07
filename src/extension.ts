import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const config = vscode.workspace.getConfiguration("vscode-just");
  const command = config.get<string>("lsp.path", "just-lsp");

  const serverOptions: ServerOptions = {
    command,
    args: [],
  };

  const initializationOptions: Record<string, unknown> = {};

  const indentation = config.get<string | null>("lsp.formatting.indentation");
  if (indentation) {
    initializationOptions.formatting = { indentation };
  }

  const rules = config.get<Record<string, string>>("lsp.rules", {});
  if (Object.keys(rules).length > 0) {
    initializationOptions.rules = rules;
  }

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "just" }],
    initializationOptions,
    synchronize: {
      fileEvents:
        vscode.workspace.createFileSystemWatcher("**/justfile"),
    },
  };

  client = new LanguageClient(
    "vscode-just",
    "Just Language Server",
    serverOptions,
    clientOptions
  );

  await client.start();
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
  }
}
