// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Ignorar carpetas de compilación y archivos de configuración
    ignores: ['eslint.config.mjs', 'dist/', 'node_modules/', 'prisma/'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked, // Nivel estricto de TypeScript
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // --- SEGURIDAD DE TIPOS ---
      '@typescript-eslint/no-explicit-any': 'warn', // Evita el uso de 'any'
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      
      // --- CÓDIGO ASÍNCRONO (CRÍTICO) ---
      '@typescript-eslint/no-floating-promises': 'error', // Te obliga a usar await/catch
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // --- CALIDAD Y LIMPIEZA ---
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      '@typescript-eslint/no-unsafe-assignment': 'off', // Permite mayor flexibilidad con Prisma
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',

      // --- PRETTIER ---
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto',
        },
      ],
    },
  },
);