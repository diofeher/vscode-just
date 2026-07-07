import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as child_process from "child_process";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel;

const JUST_LSP_VERSION = "0.4.7";
const GITHUB_RELEASE_URL =
  `https://api.github.com/repos/terror/just-lsp/releases/tags/${JUST_LSP_VERSION}`;

function getPlatformTarget(): { target: string; ext: string } | undefined {
  const platform = process.platform;
  const arch = process.arch;

  const map: Record<string, Record<string, { target: string; ext: string }>> = {
    darwin: {
      arm64: { target: "aarch64-apple-darwin", ext: "tar.gz" },
      x64: { target: "x86_64-apple-darwin", ext: "tar.gz" },
    },
    linux: {
      arm64: { target: "aarch64-unknown-linux-gnu", ext: "tar.gz" },
      x64: { target: "x86_64-unknown-linux-gnu", ext: "tar.gz" },
    },
    win32: {
      arm64: { target: "aarch64-pc-windows-msvc", ext: "zip" },
      x64: { target: "x86_64-pc-windows-msvc", ext: "zip" },
    },
  };

  return map[platform]?.[arch];
}

function getBinaryName(): string {
  return process.platform === "win32" ? "just-lsp.exe" : "just-lsp";
}

function getBinaryPath(context: vscode.ExtensionContext): string {
  return path.join(context.globalStorageUri.fsPath, getBinaryName());
}

function httpGetJson(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const get = (u: string, redirects = 0) => {
      if (redirects > 5) return reject(new Error("Too many redirects"));
      https.get(u, { headers: { "User-Agent": "vscode-just" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(JSON.parse(data)));
        res.on("error", reject);
      }).on("error", reject);
    };
    get(url);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const get = (u: string, redirects = 0) => {
      if (redirects > 5) return reject(new Error("Too many redirects"));
      https.get(u, { headers: { "User-Agent": "vscode-just" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
        file.on("error", reject);
        res.on("error", reject);
      }).on("error", reject);
    };
    get(url);
  });
}

function extractTarGz(archive: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child_process.exec(`tar -xzf "${archive}" -C "${destDir}"`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function extractZip(archive: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child_process.exec(`powershell -Command "Expand-Archive -Path '${archive}' -DestinationPath '${destDir}' -Force"`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function ensureBinary(context: vscode.ExtensionContext): Promise<string> {
  const config = vscode.workspace.getConfiguration("vscode-just");
  const customPath = config.get<string>("lsp.path");
  if (customPath && customPath !== "just-lsp") {
    return customPath;
  }

  const binaryPath = getBinaryPath(context);
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  const platformInfo = getPlatformTarget();
  if (!platformInfo) {
    throw new Error(
      `Unsupported platform: ${process.platform}-${process.arch}. Install just-lsp manually and set vscode-just.lsp.path.`
    );
  }

  const storageDir = context.globalStorageUri.fsPath;
  fs.mkdirSync(storageDir, { recursive: true });

  const release = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Just: Fetching latest just-lsp release..." },
    () => httpGetJson(GITHUB_RELEASE_URL)
  );

  const tag = release.tag_name as string;
  const assetName = `just-lsp-${tag}-${platformInfo.target}.${platformInfo.ext}`;
  const assets = release.assets as Array<{ name: string; browser_download_url: string }>;
  const asset = assets.find((a) => a.name === assetName);

  if (!asset) {
    throw new Error(`No release asset found for ${platformInfo.target}. Install just-lsp manually.`);
  }

  const archivePath = path.join(storageDir, assetName);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Just: Downloading just-lsp ${tag}...` },
    () => downloadFile(asset.browser_download_url, archivePath)
  );

  if (platformInfo.ext === "tar.gz") {
    await extractTarGz(archivePath, storageDir);
  } else {
    await extractZip(archivePath, storageDir);
  }

  // Binary may be inside a subdirectory after extraction
  const extractedBinary = findBinary(storageDir, getBinaryName());
  if (extractedBinary && extractedBinary !== binaryPath) {
    fs.renameSync(extractedBinary, binaryPath);
  }

  if (process.platform !== "win32") {
    fs.chmodSync(binaryPath, 0o755);
  }

  // Cleanup archive
  fs.unlinkSync(archivePath);

  if (!fs.existsSync(binaryPath)) {
    throw new Error("Failed to extract just-lsp binary. Install manually.");
  }

  return binaryPath;
}

function findBinary(dir: string, name: string): string | undefined {
  const direct = path.join(dir, name);
  if (fs.existsSync(direct)) return direct;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const nested = path.join(dir, entry.name, name);
      if (fs.existsSync(nested)) return nested;
    }
  }
  return undefined;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("Just");
  outputChannel.appendLine("Just extension activating...");

  let command: string;
  try {
    command = await ensureBinary(context);
    outputChannel.appendLine(`Using just-lsp binary: ${command}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`Error: ${msg}`);
    vscode.window.showErrorMessage(`Just: ${msg}`);
    return;
  }

  const config = vscode.workspace.getConfiguration("vscode-just");
  const initializationOptions: Record<string, unknown> = {};

  const indentation = config.get<string | null>("lsp.formatting.indentation");
  if (indentation) {
    initializationOptions.formatting = { indentation };
  }

  const rules = config.get<Record<string, string>>("lsp.rules", {});
  if (Object.keys(rules).length > 0) {
    initializationOptions.rules = rules;
  }

  const serverOptions: ServerOptions = {
    command,
    args: [],
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "just" }],
    initializationOptions,
    outputChannel,
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/justfile"),
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
