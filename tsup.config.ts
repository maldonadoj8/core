import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index':         'src/index.ts',
    'store/index':   'src/store/index.ts',
    'react/index':   'src/react/index.ts',
    'compat/index':  'src/compat/index.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: true,
  treeshake: true,
  clean: true,
  sourcemap: true,
  external: ['react', 'react-dom'],
  outDir: 'dist',
});
