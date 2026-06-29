import { solveSchedule } from './solver.js';
self.onmessage = (event) => { const { data, options, jobId } = event.data; try {
    let last = 0;
    let latest;
    const result = solveSchedule(data, { ...options, onProgress: (progress, snapshot) => { latest = snapshot ?? latest; const n = Date.now(); if (n - last >= 250) {
            last = n;
            self.postMessage({ type: 'progress', jobId, progress, snapshot: latest });
        } } });
    self.postMessage({ type: 'result', jobId, result });
}
catch (error) {
    self.postMessage({ type: 'error', jobId, error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error) });
} };
