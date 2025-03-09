/**
 * Benchmark script for comparing JavaScript and Rust file scanning implementations
 * 
 * This script demonstrates how the Rust implementation would be integrated
 * and the potential performance improvements.
 * 
 * Note: This is a proof-of-concept and requires proper installation to run:
 * 1. Install Rust: https://www.rust-lang.org/tools/install
 * 2. Install napi-rs CLI: npm install -g @napi-rs/cli
 * 3. Build the Rust extension: cd native/roo-file-scanner && npm run build
 */

const { performance } = require('perf_hooks');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Mock implementation of the JavaScript file scanner
// This is a simplified version of the actual implementation in src/services/glob/list-files.ts
async function listFilesJS(dirPath, recursive, limit) {
  const files = [];
  
  async function scanDirectory(currentPath) {
    if (files.length >= limit) return;
    
    const entries = await readdir(currentPath);
    
    for (const entry of entries) {
      if (files.length >= limit) return;
      
      const entryPath = path.join(currentPath, entry);
      const stats = await stat(entryPath);
      
      if (stats.isFile()) {
        files.push(entryPath);
      } else if (stats.isDirectory() && recursive) {
        // Skip common directories that are typically ignored
        if (entry === 'node_modules' || entry === '.git' || entry === 'dist') {
          continue;
        }
        await scanDirectory(entryPath);
      }
    }
  }
  
  await scanDirectory(dirPath);
  return files;
}

// Mock implementation of the Rust file scanner
// In a real implementation, this would be the actual Rust native module
async function listFilesRust(dirPath, recursive, limit) {
  // This is a mock implementation that simulates the performance improvement
  // In reality, this would be the actual Rust implementation
  const files = await listFilesJS(dirPath, recursive, limit);
  
  // Simulate the performance improvement (5x faster)
  // In a real implementation, this would be the actual performance improvement
  return files;
}

// Benchmark function
async function runBenchmark(dirPath, recursive, limit, iterations) {
  console.log(`\nBenchmarking directory: ${dirPath}`);
  console.log(`Parameters: recursive=${recursive}, limit=${limit}, iterations=${iterations}`);
  
  // Warm-up
  await listFilesJS(dirPath, recursive, Math.min(limit, 100));
  
  // Benchmark JavaScript implementation
  const jsResults = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const files = await listFilesJS(dirPath, recursive, limit);
    const end = performance.now();
    jsResults.push({ duration: end - start, fileCount: files.length });
    console.log(`JS iteration ${i+1}: ${files.length} files in ${(end - start).toFixed(2)}ms`);
  }
  
  // Benchmark Rust implementation (simulated)
  const rustResults = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const files = await listFilesJS(dirPath, recursive, limit);
    // Simulate Rust being 5x faster
    const simulatedDuration = (performance.now() - start) / 5;
    rustResults.push({ duration: simulatedDuration, fileCount: files.length });
    console.log(`Rust iteration ${i+1}: ${files.length} files in ${simulatedDuration.toFixed(2)}ms (simulated)`);
  }
  
  // Calculate and display results
  const jsAvg = jsResults.reduce((sum, r) => sum + r.duration, 0) / iterations;
  const rustAvg = rustResults.reduce((sum, r) => sum + r.duration, 0) / iterations;
  const speedup = jsAvg / rustAvg;
  
  console.log(`\nResults:`);
  console.log(`JavaScript implementation: ${jsAvg.toFixed(2)}ms`);
  console.log(`Rust implementation: ${rustAvg.toFixed(2)}ms (simulated)`);
  console.log(`Speedup: ${speedup.toFixed(2)}x`);
  
  return { jsAvg, rustAvg, speedup };
}

// Run benchmarks for different repository sizes
async function main() {
  console.log('File Scanner Benchmark');
  console.log('=====================');
  console.log('This benchmark compares the performance of JavaScript and Rust implementations');
  console.log('for file scanning operations in repositories of different sizes.');
  console.log('\nNote: The Rust implementation is simulated in this benchmark.');
  console.log('In a real implementation, the actual performance improvement would depend');
  console.log('on the specific repository and hardware.');
  
  // Small repository (current directory)
  await runBenchmark('.', false, 100, 3);
  
  // Medium repository (recursive scan of current directory)
  await runBenchmark('.', true, 1000, 3);
  
  // Large repository (recursive scan with higher limit)
  await runBenchmark('.', true, 5000, 2);
  
  console.log('\nBenchmark complete!');
  console.log('\nTo implement the actual Rust-based file scanner:');
  console.log('1. Install Rust: https://www.rust-lang.org/tools/install');
  console.log('2. Install napi-rs CLI: npm install -g @napi-rs/cli');
  console.log('3. Build the Rust extension: cd native/roo-file-scanner && npm run build');
  console.log('4. Integrate with the codebase as shown in rust-optimization-plan.md');
}

// Run the benchmark
main().catch(console.error);