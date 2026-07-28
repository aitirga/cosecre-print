import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ExecResult {
  stdout: string
  stderr: string
}

/**
 * Run a binary with an explicit argv array.
 *
 * Deliberately never goes through a shell: print jobs carry user-chosen file
 * paths, and paths containing quotes or spaces are common enough on a real
 * machine ("John's report.pdf") that string-built commands are a real bug
 * source, not a theoretical one.
 */
export async function run(
  file: string,
  args: string[],
  opts: { timeoutMs?: number } = {}
): Promise<ExecResult> {
  const { stdout, stderr } = await execFileAsync(file, args, {
    timeout: opts.timeoutMs ?? 15_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true
  })
  return { stdout: stdout.toString(), stderr: stderr.toString() }
}

/** Like `run`, but resolves to null instead of throwing. */
export async function tryRun(
  file: string,
  args: string[],
  opts: { timeoutMs?: number } = {}
): Promise<ExecResult | null> {
  try {
    return await run(file, args, opts)
  } catch {
    return null
  }
}

/** Run a PowerShell command on Windows. */
export async function runPowerShell(script: string, timeoutMs = 15_000): Promise<ExecResult> {
  return run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeoutMs }
  )
}
