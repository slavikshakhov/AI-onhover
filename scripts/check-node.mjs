const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`Hover Ask AI requires Node.js 22.12+; you are running ${process.version}.\nRun: nvm install && nvm use && npm ci\nThen retry your command.`);
  process.exit(1);
}
