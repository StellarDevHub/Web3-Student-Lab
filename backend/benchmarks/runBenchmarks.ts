/**
 * Automated performance benchmark runner.
 *
 * Floods the playground compiler endpoints with autocannon according to the
 * scenarios in `config.ts`, then reports latency and success ratios using the
 * pure stats module and writes statistical logs (JSON + text) to disk.
 *
 * Usage:
 *   npm run bench                 # run all scenarios against BENCH_BASE_URL
 *   BENCH_CONNECTIONS=100 npm run bench
 *
 * Exit code is non-zero if any scenario misses its thresholds, so this can gate
 * CI. The target API must already be running.
 */

import autocannon from 'autocannon';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScenarios, resolveBaseUrl, resolveHeaders, type BenchmarkScenario } from './config.js';
import { allPassed, formatSummary, summarize, type BenchmarkSummary } from './lib/stats.js';

const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'results');

/** Run a single scenario with autocannon and return its normalised summary. */
async function runScenario(
  baseUrl: string,
  headers: Record<string, string>,
  scenario: BenchmarkScenario
): Promise<BenchmarkSummary> {
  console.log(`\n▶ ${scenario.name} — ${scenario.description}`);

  const result = await autocannon({
    url: `${baseUrl}${scenario.path}`,
    method: scenario.method,
    connections: scenario.connections,
    duration: scenario.duration,
    pipelining: scenario.pipelining ?? 1,
    headers,
    body: scenario.body !== undefined ? JSON.stringify(scenario.body) : undefined,
  });

  return summarize(scenario.name, result, scenario.thresholds);
}

async function main(): Promise<void> {
  const baseUrl = resolveBaseUrl();
  const headers = resolveHeaders();
  const scenarios = buildScenarios();

  console.log(`Performance Benchmark Suite → ${baseUrl}`);
  console.log(`Scenarios: ${scenarios.map((s) => s.name).join(', ')}`);

  const summaries: BenchmarkSummary[] = [];
  for (const scenario of scenarios) {
    try {
      const summary = await runScenario(baseUrl, headers, scenario);
      summaries.push(summary);
      console.log(formatSummary(summary));
    } catch (error) {
      console.error(`✖ ${scenario.name} failed to run:`, (error as Error).message);
      summaries.push(
        summarize(scenario.name, { errors: 1 }, scenario.thresholds) // record as a failure
      );
    }
  }

  // Persist statistical logs.
  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { baseUrl, generatedAt: new Date().toISOString(), summaries };
  const jsonPath = join(RESULTS_DIR, `benchmark-${stamp}.json`);
  const textPath = join(RESULTS_DIR, `benchmark-${stamp}.log`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(textPath, summaries.map(formatSummary).join('\n\n'));

  console.log(`\nStatistical logs written:\n  ${jsonPath}\n  ${textPath}`);

  if (!allPassed(summaries)) {
    console.error('\nOne or more scenarios missed their thresholds.');
    process.exitCode = 1;
  } else {
    console.log('\nAll scenarios passed their thresholds.');
  }
}

main().catch((error) => {
  console.error('Benchmark run crashed:', error);
  process.exitCode = 1;
});
