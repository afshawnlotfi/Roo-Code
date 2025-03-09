/**
 * Real benchmark script for comparing JavaScript and Rust file scanning implementations
 * 
 * This script uses the actual Rust implementation to benchmark performance.
 */

const { performance } = require('perf_hooks');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Import the JavaScript implementation
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

// Import the Rust implementation
let rustScanner;
try {
  rustScanner = require('./index.js');
  console.log('Successfully loaded Rust implementation');
} catch (error) {
  console.error('Failed to load Rust implementation:', error);
  process.exit(1);
}

// Benchmark function
async function runBenchmark(dirPath, recursive, limit, iterations) {
  console.log(`\nBenchmarking directory: ${dirPath}`);
  console.log(`Parameters: recursive=${recursive}, limit=${limit}, iterations=${iterations}`);
  
  // Warm-up
  await listFilesJS(dirPath, recursive, Math.min(limit, 100));
  try {
    rustScanner.listFiles(dirPath, recursive, limit);
  } catch (error) {
    console.error('Error during Rust warm-up:', error);
  }
  
  // Benchmark JavaScript implementation
  const jsResults = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const files = await listFilesJS(dirPath, recursive, limit);
    const end = performance.now();
    jsResults.push({ duration: end - start, fileCount: files.length });
    console.log(`JS iteration ${i+1}: ${files.length} files in ${(end - start).toFixed(2)}ms`);
  }
  
  // Benchmark Rust implementation
  const rustResults = [];
  for (let i = 0; i < iterations; i++) {
    try {
      const start = performance.now();
      const files = rustScanner.listFiles(dirPath, recursive, limit);
      const end = performance.now();
      rustResults.push({ duration: end - start, fileCount: files.length });
      console.log(`Rust iteration ${i+1}: ${files.length} files in ${(end - start).toFixed(2)}ms`);
    } catch (error) {
      console.error(`Error in Rust iteration ${i+1}:`, error);
    }
  }
  
  // Calculate and display results
  const jsAvg = jsResults.reduce((sum, r) => sum + r.duration, 0) / jsResults.length;
  const rustAvg = rustResults.length > 0 
    ? rustResults.reduce((sum, r) => sum + r.duration, 0) / rustResults.length 
    : 0;
  const speedup = rustAvg > 0 ? jsAvg / rustAvg : 0;
  
  console.log(`\nResults:`);
  console.log(`JavaScript implementation: ${jsAvg.toFixed(2)}ms`);
  console.log(`Rust implementation: ${rustAvg.toFixed(2)}ms`);
  console.log(`Speedup: ${speedup.toFixed(2)}x`);
  
  return { jsAvg, rustAvg, speedup };
}

// Run benchmarks for different repository sizes
async function main() {
  console.log('File Scanner Benchmark (Real Implementation)');
  console.log('===========================================');
  console.log('This benchmark compares the performance of JavaScript and Rust implementations');
  console.log('for file scanning operations in repositories of different sizes.');
  
  // Small repository (current directory, non-recursive)
  await runBenchmark('.', false, 100, 3);
  
  // Medium repository (recursive scan of current directory)
  await runBenchmark('.', true, 1000, 3);
  
  // Large repository (recursive scan with higher limit)
  await runBenchmark('.', true, 5000, 2);
  
  console.log('\nBenchmark complete!');
}

// Run the benchmark
main().catch(console.error);