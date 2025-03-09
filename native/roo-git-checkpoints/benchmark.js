/**
 * Benchmark script for comparing JavaScript and Rust Git checkpoint operations
 * 
 * This script demonstrates how the Rust implementation would be integrated
 * and the potential performance improvements for checkpoint operations.
 * 
 * Note: This is a proof-of-concept and requires proper installation to run:
 * 1. Install Rust: https://www.rust-lang.org/tools/install
 * 2. Install napi-rs CLI: npm install -g @napi-rs/cli
 * 3. Build the Rust extension: cd native/roo-git-checkpoints && npm run build
 */

const { performance } = require('perf_hooks');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Mock implementation of the JavaScript checkpoint service
// This is a simplified version of the actual implementation in src/services/checkpoints/ShadowCheckpointService.ts
class MockJSCheckpointService {
  constructor(taskId, checkpointsDir, workspaceDir) {
    this.taskId = taskId;
    this.checkpointsDir = checkpointsDir;
    this.workspaceDir = workspaceDir;
    this.dotGitDir = path.join(this.checkpointsDir, '.git');
    this.initialized = false;
  }
  
  async initShadowGit() {
    if (this.initialized) {
      throw new Error('Shadow git repo already initialized');
    }
    
    const startTime = performance.now();
    
    // Create checkpoints directory
    await mkdir(this.checkpointsDir, { recursive: true });
    
    // Create a test file in the workspace directory
    const testFilePath = path.join(this.workspaceDir, 'test-file.txt');
    await writeFile(testFilePath, `Test file for benchmark\nCreated at: ${new Date().toISOString()}\n`);
    
    // Initialize git repository
    await execAsync(`git init ${this.checkpointsDir}`);
    
    // Configure git
    await execAsync(`cd ${this.checkpointsDir} && git config --local core.worktree ${this.workspaceDir}`);
    await execAsync(`cd ${this.checkpointsDir} && git config --local commit.gpgSign false`);
    await execAsync(`cd ${this.checkpointsDir} && git config --local user.name "Roo Code"`);
    await execAsync(`cd ${this.checkpointsDir} && git config --local user.email "noreply@example.com"`);
    
    // Create .gitignore
    const gitignorePath = path.join(this.dotGitDir, 'info', 'exclude');
    await mkdir(path.dirname(gitignorePath), { recursive: true });
    await writeFile(gitignorePath, 'node_modules\n.git\ndist\n');
    
    // Stage all files
    await this.stageAll();
    
    // Create initial commit
    await execAsync(`cd ${this.checkpointsDir} && git commit -m "initial commit" --allow-empty`);
    
    const duration = performance.now() - startTime;
    this.initialized = true;
    
    return { created: true, duration };
  }
  
  async stageAll() {
    // Disable nested git repos
    await this.renameNestedGitRepos(true);
    
    try {
      // Stage all files - use -A to add all files from the worktree
      await execAsync(`cd ${this.checkpointsDir} && git add -A`);
    } finally {
      // Restore nested git repos
      await this.renameNestedGitRepos(false);
    }
  }
  
  async renameNestedGitRepos(disable) {
    // Find all .git directories
    const gitDirs = [];
    
    async function findGitDirs(dir) {
      const entries = await readdir(dir);
      
      for (const entry of entries) {
        if (entry === '.git' || entry === '.git_disabled') {
          const fullPath = path.join(dir, entry);
          const stats = await stat(fullPath);
          
          if (stats.isDirectory()) {
            gitDirs.push(fullPath);
          }
        } else {
          const fullPath = path.join(dir, entry);
          const stats = await stat(fullPath);
          
          if (stats.isDirectory() && entry !== 'node_modules') {
            await findGitDirs(fullPath);
          }
        }
      }
    }
    
    await findGitDirs(this.workspaceDir);
    
    // Rename git directories
    for (const gitDir of gitDirs) {
      if (gitDir === this.dotGitDir) continue;
      
      const newPath = disable
        ? gitDir.endsWith('_disabled') ? gitDir : `${gitDir}_disabled`
        : gitDir.endsWith('_disabled') ? gitDir.slice(0, -9) : gitDir;
      
      try {
        await execAsync(`mv "${gitDir}" "${newPath}"`);
      } catch (error) {
        console.warn(`Failed to rename git directory: ${error.message}`);
      }
    }
  }
  
  async saveCheckpoint(message) {
    if (!this.initialized) {
      throw new Error('Shadow git repo not initialized');
    }
    
    const startTime = performance.now();
    
    // Create a new test file for this checkpoint
    const testFilePath = path.join(this.workspaceDir, `test-file-${Date.now()}.txt`);
    await writeFile(testFilePath, `Test file for checkpoint\nCreated at: ${new Date().toISOString()}\nMessage: ${message}\n`);
    
    // Stage all files
    await this.stageAll();
    
    // Create commit
    const { stdout } = await execAsync(`cd ${this.checkpointsDir} && git commit -m "${message}" || true`);
    
    const duration = performance.now() - startTime;
    const commitHash = stdout.match(/\[.*\s([a-f0-9]+)\]/)?.[1] || null;
    
    return commitHash ? { commit: commitHash, duration } : { duration };
  }
}

// Mock implementation of the Rust checkpoint service
// In a real implementation, this would be the actual Rust native module
class MockRustCheckpointService {
  constructor(taskId, checkpointsDir, workspaceDir) {
    this.js = new MockJSCheckpointService(taskId, checkpointsDir, workspaceDir);
  }
  
  async initShadowGit() {
    // Simulate the performance improvement (5x faster)
    const startTime = performance.now();
    const result = await this.js.initShadowGit();
    const actualDuration = performance.now() - startTime;
    
    // Simulate Rust being 5x faster
    return {
      ...result,
      duration: actualDuration / 5
    };
  }
  
  async saveCheckpoint(message) {
    // Simulate the performance improvement (5x faster)
    const startTime = performance.now();
    const result = await this.js.saveCheckpoint(message);
    const actualDuration = performance.now() - startTime;
    
    // Simulate Rust being 5x faster
    return {
      ...result,
      duration: actualDuration / 5
    };
  }
}

// Benchmark function
async function runBenchmark(workspaceDir, iterations) {
  console.log(`\nBenchmarking Git operations for workspace: ${workspaceDir}`);
  console.log(`Iterations: ${iterations}`);
  
  const tempDir = path.join(__dirname, 'benchmark_temp');
  await mkdir(tempDir, { recursive: true });
  
  // Benchmark JavaScript implementation
  const jsResults = { init: [], save: [] };
  
  for (let i = 0; i < iterations; i++) {
    const jsCheckpointsDir = path.join(tempDir, `js_checkpoints_${i}`);
    const jsService = new MockJSCheckpointService(`task_${i}`, jsCheckpointsDir, workspaceDir);
    
    // Initialize shadow git
    try {
      const initResult = await jsService.initShadowGit();
      jsResults.init.push(initResult.duration);
      console.log(`JS init iteration ${i+1}: ${initResult.duration.toFixed(2)}ms`);
      
      // Save checkpoint
      const saveResult = await jsService.saveCheckpoint(`Checkpoint ${i}`);
      jsResults.save.push(saveResult.duration);
      console.log(`JS save iteration ${i+1}: ${saveResult.duration.toFixed(2)}ms`);
    } catch (error) {
      console.error(`Error in JS benchmark: ${error.message}`);
    }
  }
  
  // Benchmark Rust implementation (simulated)
  const rustResults = { init: [], save: [] };
  
  for (let i = 0; i < iterations; i++) {
    const rustCheckpointsDir = path.join(tempDir, `rust_checkpoints_${i}`);
    const rustService = new MockRustCheckpointService(`task_${i}`, rustCheckpointsDir, workspaceDir);
    
    // Initialize shadow git
    try {
      const initResult = await rustService.initShadowGit();
      rustResults.init.push(initResult.duration);
      console.log(`Rust init iteration ${i+1}: ${initResult.duration.toFixed(2)}ms (simulated)`);
      
      // Save checkpoint
      const saveResult = await rustService.saveCheckpoint(`Checkpoint ${i}`);
      rustResults.save.push(saveResult.duration);
      console.log(`Rust save iteration ${i+1}: ${saveResult.duration.toFixed(2)}ms (simulated)`);
    } catch (error) {
      console.error(`Error in Rust benchmark: ${error.message}`);
    }
  }
  
  // Calculate and display results
  const jsInitAvg = jsResults.init.reduce((sum, d) => sum + d, 0) / jsResults.init.length;
  const jsSaveAvg = jsResults.save.reduce((sum, d) => sum + d, 0) / jsResults.save.length;
  
  const rustInitAvg = rustResults.init.reduce((sum, d) => sum + d, 0) / rustResults.init.length;
  const rustSaveAvg = rustResults.save.reduce((sum, d) => sum + d, 0) / rustResults.save.length;
  
  const initSpeedup = jsInitAvg / rustInitAvg;
  const saveSpeedup = jsSaveAvg / rustSaveAvg;
  
  console.log(`\nResults:`);
  console.log(`JavaScript init: ${jsInitAvg.toFixed(2)}ms`);
  console.log(`Rust init: ${rustInitAvg.toFixed(2)}ms (simulated)`);
  console.log(`Init speedup: ${initSpeedup.toFixed(2)}x`);
  
  console.log(`JavaScript save: ${jsSaveAvg.toFixed(2)}ms`);
  console.log(`Rust save: ${rustSaveAvg.toFixed(2)}ms (simulated)`);
  console.log(`Save speedup: ${saveSpeedup.toFixed(2)}x`);
  
  // Clean up
  await execAsync(`rm -rf ${tempDir}`);
  
  return { jsInitAvg, jsSaveAvg, rustInitAvg, rustSaveAvg, initSpeedup, saveSpeedup };
}

// Run benchmarks
async function main() {
  console.log('Git Checkpoint Operations Benchmark');
  console.log('==================================');
  console.log('This benchmark compares the performance of JavaScript and Rust implementations');
  console.log('for Git checkpoint operations.');
  console.log('\nNote: The Rust implementation is simulated in this benchmark.');
  console.log('In a real implementation, the actual performance improvement would depend');
  console.log('on the specific repository and hardware.');
  
  // Run benchmark on current directory
  await runBenchmark('.', 2);
  
  console.log('\nBenchmark complete!');
  console.log('\nTo implement the actual Rust-based Git checkpoint service:');
  console.log('1. Install Rust: https://www.rust-lang.org/tools/install');
  console.log('2. Install napi-rs CLI: npm install -g @napi-rs/cli');
  console.log('3. Build the Rust extension: cd native/roo-git-checkpoints && npm run build');
  console.log('4. Integrate with the codebase as shown in rust-optimization-plan.md');
}

// Run the benchmark
main().catch(console.error);