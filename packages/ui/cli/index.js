#!/usr/bin/env node

/**
 * Orbit UI CLI
 * Usage: npx @layera-labs/ui add <component>
 */

const fs = require('fs');
const path = require('path');

const COMPONENTS = [
  'button',
  'input',
  'sidebar',
  'tabs',
  'dialog',
  'slider',
  'loading',
  'tooltip',
  'dropdown',
  'color-picker',
  'accordion',
  'context-menu',
  'toast',
  'resizable',
];

function showHelp() {
  console.log(`
Orbit UI CLI

Usage:
  npx @layera-labs/ui add <component>     Add a component to your project
  npx @layera-labs/ui list                List all available components
  npx @layera-labs/ui help                Show this help message

Available components:
${COMPONENTS.map((c) => `  - ${c}`).join('\n')}
`);
}

function addComponent(name) {
  const componentName = name.toLowerCase();

  if (!COMPONENTS.includes(componentName)) {
    console.error(`❌ Component "${name}" not found.`);
    console.log(`\nAvailable components:\n${COMPONENTS.map((c) => `  - ${c}`).join('\n')}`);
    process.exit(1);
  }

  // Source file path
  const packageDir = path.resolve(__dirname, '..');
  const srcFile = path.join(packageDir, 'src', 'components', `${componentName}.tsx`);

  if (!fs.existsSync(srcFile)) {
    console.error(`❌ Source file not found: ${srcFile}`);
    process.exit(1);
  }

  // Target directory (components/ui relative to cwd)
  const targetDir = path.resolve(process.cwd(), 'components', 'ui');
  const targetFile = path.join(targetDir, `orbit-${componentName}.tsx`);

  // Create directory if needed
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`📁 Created ${path.relative(process.cwd(), targetDir)}`);
  }

  // Copy component file
  const content = fs.readFileSync(srcFile, 'utf-8');
  fs.writeFileSync(targetFile, content);

  console.log(`✅ Added ${componentName} to ${path.relative(process.cwd(), targetFile)}`);
  console.log(`\nImport it in your project:`);
  console.log(`  import { Orbit${toPascalCase(componentName)} } from '@/components/ui/orbit-${componentName}';`);
}

function listComponents() {
  console.log('Available components:\n');
  COMPONENTS.forEach((c) => {
    console.log(`  • ${c}`);
  });
}

function toPascalCase(str) {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// Main
const [, , command, ...args] = process.argv;

switch (command) {
  case 'add':
    if (!args[0]) {
      console.error('❌ Please specify a component name.');
      console.log('Usage: npx @layera-labs/ui add <component>');
      process.exit(1);
    }
    addComponent(args[0]);
    break;
  case 'list':
    listComponents();
    break;
  case 'help':
  default:
    showHelp();
    break;
}
