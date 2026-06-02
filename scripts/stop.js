import { execSync } from 'child_process';

const ports = [3000, 8765];
let killed = 0;

for (const port of ports) {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique"`,
      { encoding: 'utf8' }
    );
    const pids = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s));
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`  Puerto ${port}: proceso ${pid} cerrado`);
        killed++;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* no process */
  }
}

if (killed === 0) console.log('  No había servidores en los puertos 3000/8765.');
else console.log(`  Listo. Ejecuta: npm start\n`);
