import { performance } from 'node:perf_hooks';
import net from 'node:net';

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function runBenchmark() {
  const start = performance.now();
  for (const port of [5173, 3000, 8080]) {
    const available = await isPortAvailable(port);
  }
  const end = performance.now();
  console.log(`Sequential execution time: ${(end - start).toFixed(2)} ms`);

  const start2 = performance.now();
  const results = await Promise.all([5173, 3000, 8080].map(p => isPortAvailable(p)));
  const end2 = performance.now();
  console.log(`Concurrent execution time: ${(end2 - start2).toFixed(2)} ms`);
}

runBenchmark();
