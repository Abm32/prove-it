import * as esbuild from 'esbuild';

const options = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  entryPoints: {
    'overlay/main': 'ui/overlay/main.ts',
    'dash/main': 'ui/dash/main.ts',
  },
  outdir: 'public',
};

if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}
