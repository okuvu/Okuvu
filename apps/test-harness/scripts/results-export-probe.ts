process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/okuvu';

async function main() {
  const { initTRPC } = await import('@trpc/server');
  const { prisma } = await import('../src/lib/prisma');
  const { resultsExportRouter } = await import('../src/server/routers/results-export');
  const XLSX = await import('xlsx');

  const caller: any = initTRPC.context<any>().create().createCallerFactory(resultsExportRouter)({
    session: { user: { id: 'probe', email: 'p@local', name: 'P', role: 'PI', environments: ['sandbox', 'staging'] } },
    prisma,
  });

  const dry = await caller.exportRuns({ dryRun: true });
  console.log('dryRun:', dry);

  const out = await caller.exportRuns({ dryRun: false });
  const bytes = Buffer.from(out.base64, 'base64');
  const wb = XLSX.read(bytes, { type: 'buffer' });
  console.log('file:', out.fileName, 'bytes:', bytes.length);
  console.log('sheets:', wb.SheetNames);
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name] ?? {}) as Record<string, unknown>[];
    console.log(`  ${name}: ${rows.length} rows, headers:`, rows.length ? Object.keys(rows[0]).join(',') : '(none)');
  }
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
