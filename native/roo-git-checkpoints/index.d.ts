/* tslint:disable */
/* eslint-disable */

export interface InitResult {
  created: boolean
  durationMs: number
  baseHash: string
}

export interface SaveResult {
  commitHash?: string
  durationMs: number
}

export interface BenchmarkResult {
  initDurationMs: number
  saveDurationMs: number
  totalDurationMs: number
}

export class RustCheckpointService {
  constructor(taskId: string, checkpointsDir: string, workspaceDir: string)
  
  initShadowGit(): InitResult
  
  saveCheckpoint(message: string): SaveResult
}

export function benchmarkCheckpointOperations(
  taskId: string,
  checkpointsDir: string,
  workspaceDir: string
): BenchmarkResult