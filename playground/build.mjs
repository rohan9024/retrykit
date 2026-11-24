import { mkdir, cp } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await cp('index.html', 'dist/index.html');
await cp('main.js', 'dist/main.js');
console.log('Fault Lab playground built to playground/dist');
