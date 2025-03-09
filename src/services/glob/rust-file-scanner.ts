import * as path from "path"
import { performance } from "perf_hooks"
import { arePathsEqual } from "../../utils/path"

// Type declarations for Node.js globals
declare const process: {
    platform: string;
    env: Record<string, string | undefined>;
};
declare function require(id: string): any;

// Import the Rust implementation
// In a real implementation, this would be properly installed as a dependency
let rustScanner: {
	listFiles: (dirPath: string, recursive: boolean, limit: number) => string[]
	benchmarkFileScan: (dirPath: string, recursive: boolean, limit: number) => { fileCount: number; durationMs: number }
} | null = null

// Try to load the Rust implementation, but don't fail if it's not available
try {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	rustScanner = require("../../../native/roo-file-scanner")
} catch (error) {
	console.warn("Rust file scanner not available, falling back to JavaScript implementation")
}

/**
 * Determines if a repository is large enough to benefit from the Rust implementation
 * This is a simple heuristic that can be adjusted based on benchmarks
 */
export async function isLargeRepository(dirPath: string): Promise<boolean> {
	// For demonstration purposes, we'll consider any repository with more than 1000 files as "large"
	// In a real implementation, this would be more sophisticated
	try {
		// Use a quick sample to estimate repository size
		const [files, _] = await import("./list-files").then((m) => m.listFiles(dirPath, true, 1000))
		return files.length >= 1000
	} catch (error) {
		return false
	}
}

/**
 * Enhanced version of listFiles that uses the Rust implementation for large repositories
 * Falls back to the JavaScript implementation if Rust is not available or for small repositories
 */
export async function enhancedListFiles(
	dirPath: string,
	recursive: boolean,
	limit: number,
): Promise<[string[], boolean]> {
	const absolutePath = path.resolve(dirPath)

	// Do not allow listing files in root or home directory
	const root = process.platform === "win32" ? path.parse(absolutePath).root : "/"
	const isRoot = arePathsEqual(absolutePath, root)
	if (isRoot) {
		return [[root], false]
	}

	// Check if we should use the Rust implementation
	const useRust =
		rustScanner !== null &&
		process.env.ROO_USE_RUST_OPTIMIZATIONS !== "false" &&
		(process.env.ROO_USE_RUST_OPTIMIZATIONS === "true" || (await isLargeRepository(dirPath)))

	if (useRust) {
		try {
			console.log(`Using Rust implementation for ${dirPath} (recursive: ${recursive}, limit: ${limit})`)
			const startTime = performance.now()

			// Call the Rust implementation
			const files = rustScanner!.listFiles(dirPath, recursive, limit)

			const duration = performance.now() - startTime
			console.log(`[RustOptimization] Listed ${files.length} files in ${duration.toFixed(2)}ms using Rust implementation`)

			return [files, files.length >= limit]
		} catch (error) {
			console.warn(`Failed to use Rust implementation, falling back to JS: ${error}`)
		}
	}

	// Fall back to the original JavaScript implementation
	return import("./list-files").then((m) => m.listFiles(dirPath, recursive, limit))
}

/**
 * Benchmark function to compare performance between JavaScript and Rust implementations
 */
export async function benchmarkFileScanners(dirPath: string, recursive: boolean, limit: number): Promise<{
	js: { fileCount: number; durationMs: number }
	rust: { fileCount: number; durationMs: number } | null
	speedup: number | null
}> {
	// Benchmark JavaScript implementation
	const jsStart = performance.now()
	const [jsFiles, _] = await import("./list-files").then((m) => m.listFiles(dirPath, recursive, limit))
	const jsDuration = performance.now() - jsStart

	const jsResult = {
		fileCount: jsFiles.length,
		durationMs: jsDuration,
	}

	// Benchmark Rust implementation if available
	let rustResult = null
	let speedup = null

	if (rustScanner !== null) {
		try {
			rustResult = rustScanner.benchmarkFileScan(dirPath, recursive, limit)
			speedup = jsResult.durationMs / rustResult.durationMs
		} catch (error) {
			console.warn(`Failed to benchmark Rust implementation: ${error}`)
		}
	}

	return {
		js: jsResult,
		rust: rustResult,
		speedup,
	}
}