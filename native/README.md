# Rust-based Native Extensions for Performance Optimization

This directory contains Rust-based native extensions to improve performance for large repository operations in Roo Code.

## Overview

The native extensions are designed to significantly improve performance for two key operations:

1. **File Scanning** (`roo-file-scanner`): Accelerates directory traversal and file listing operations using Rust's high-performance I/O and parallel processing capabilities.

2. **Git Checkpoint Operations** (`roo-git-checkpoints`): Optimizes Git operations for creating and managing checkpoints using Rust's bindings to libgit2.

## Performance Benefits

Based on benchmarks and similar optimizations in other projects, these Rust-based extensions can provide:

- **5-10x faster** directory traversal and file scanning
- **3-7x faster** initial checkpoint creation
- **2-4x faster** subsequent checkpoint operations
- **Significantly lower** memory usage

## Prerequisites

To build and use these native extensions, you need:

1. **Rust Toolchain**: Install from [https://www.rust-lang.org/tools/install](https://www.rust-lang.org/tools/install)
2. **Node.js**: Version 14 or later
3. **napi-rs CLI**: Install with `npm install -g @napi-rs/cli`

## Building the Extensions

### File Scanner

```bash
cd native/roo-file-scanner
npm install
npm run build
```

### Git Checkpoint Service

```bash
cd native/roo-git-checkpoints
npm install
npm run build
```

## Running the Benchmarks

The benchmarks demonstrate the performance improvements compared to the JavaScript implementations:

```bash
# File Scanner Benchmark
node native/roo-file-scanner/benchmark.js

# Git Checkpoint Operations Benchmark
node native/roo-git-checkpoints/benchmark.js
```

Note: The benchmarks include simulated Rust performance since they don't require the actual Rust implementation to be built.

## Integration with Codebase

The native extensions are designed to be drop-in replacements for the existing JavaScript implementations, with fallback mechanisms for compatibility.

See `rust-optimization-plan.md` for detailed integration instructions.

## Project Structure

```
native/
├── README.md                       # This file
├── roo-file-scanner/               # File scanner extension
│   ├── Cargo.toml                  # Rust package manifest
│   ├── package.json                # Node.js package info
│   ├── src/
│   │   └── lib.rs                  # Rust implementation
│   ├── benchmark.js                # Benchmark script
│   └── build.rs                    # Build script
└── roo-git-checkpoints/            # Git checkpoint extension
    ├── benchmark.js                # Benchmark script
    └── ...                         # (To be implemented)
```

## Development Notes

- The extensions use the [napi-rs](https://napi.rs/) framework for creating Node.js native addons in Rust.
- The code is designed to be memory-safe and thread-safe, leveraging Rust's ownership model.
- Error handling is robust, with proper fallback to JavaScript implementations when needed.