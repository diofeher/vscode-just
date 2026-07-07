# Install dependencies
install:
    npm install

# Compile TypeScript
compile:
    npx tsc -p ./

# Package extension into .vsix
package: compile
    npx @vscode/vsce package --no-dependencies

# Install extension locally in VS Code
install-extension: package
    code --install-extension $(ls -t *.vsix | head -1)

# Watch mode for development
watch:
    npx tsc -watch -p ./

# Clean build artifacts
clean:
    rm -rf out *.vsix
