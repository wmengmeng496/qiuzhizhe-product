import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'out',
      'dist',
      'node_modules',
      'server',
      'supabase',
      '*.config.ts',
      'vite-env.d.ts',
      '**/._*'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json']
      }
    }
  }
);
