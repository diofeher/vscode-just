# Install dependencies
install:
    npm install

# Compile TypeScript
compile:
    npm run build

# Package extension into .vsix
package: compile
    npx @vscode/vsce package

# Install extension locally in VS Code
install-extension: package
    code --install-extension $(ls -t *.vsix | head -1)

# Watch mode for development
watch:
    npx tsc -watch -p ./

# Clean build artifacts
clean:
    rm -rf out *.vsix
