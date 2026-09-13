import { performance } from 'node:perf_hooks';
import { doctorCommand } from './src/commands/doctor.ts'; // You'll need to run this with tsx

async function runBenchmark() {
  const start = performance.now();
  await doctorCommand();
  const end = performance.now();
  console.log(`Execution time: ${(end - start).toFixed(2)} ms`);
}

runBenchmark();
