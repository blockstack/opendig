#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const ORIGINAL_DIR = process.cwd();
const PACKAGES_DIR = path.resolve(ORIGINAL_DIR, 'packages');

// Get all package directories
const packages = fs.readdirSync(PACKAGES_DIR).filter(item => {
  const itemPath = path.join(PACKAGES_DIR, item);
  return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
});

console.log(`Found ${packages.length} packages to process`);

// Process all packages
const results = packages
  .map(dir => {
    const json = path.join(PACKAGES_DIR, dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(json, 'utf8'));

    if (pkg.private === true) {
      console.log(`Skipping package: ${pkg.name}`);
      return null;
    }

    console.log(`\nProcessing package: ${pkg.name}`);
    process.chdir(path.join(PACKAGES_DIR, dir));

    // Run npm publish dry-run
    const result = spawnSync('npm', ['publish', '--dry-run'], { encoding: 'utf8' });
    const output = `${result.stdout}\n${result.stderr}`;

    // Extract values using inline functions
    const shasum = extractFromOutput(output, /npm notice shasum:\s+([a-f0-9]{40})/);
    const integrity = extractFromOutput(
      output,
      /npm notice integrity:\s+(sha\d+-[A-Za-z0-9+/=]+(?:\[\.\.\.\][A-Za-z0-9+/=]*==?)?)/
    );

    console.log(`  Package: ${pkg.name}`);
    console.log(`  Tarball hash: ${integrity}`);
    console.log(`  Shasum: ${shasum}`);

    // Check latest published version on npm registry
    const registryCheck = spawnSync('curl', [`https://registry.npmjs.org/${pkg.name}/latest`], {
      encoding: 'utf8',
    });
    const registryData = JSON.parse(registryCheck.stdout);
    const registryShasum = registryData.dist?.shasum;

    const status = registryShasum === shasum ? 'matches' : `DIFFERS`;
    console.log(`  ${status}`);

    return {
      name: pkg.name,
      tarballHash: integrity,
      shasum,
    };
  })
  .filter(Boolean) as PackageInfo[];

// Restore original directory
process.chdir(ORIGINAL_DIR);

// Output final results
console.log('\n=== PACKAGE BUILD RESULTS ===');
console.table(results);

// HELPERS
function extractFromOutput(output: string, regex: RegExp): string {
  return (
    output
      .split('\n')
      .map(line => line.match(regex)?.[1])
      .find(Boolean) || 'Not found'
  );
}

interface PackageInfo {
  name: string;
  tarballHash: string;
  shasum: string;
}
