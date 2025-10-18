module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: [
    '@typescript-eslint',
  ],
  rules: {
    // TypeScript specific rules
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    
    // General rules
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
    'prefer-arrow-callback': 'error',
    'no-console': 'off', // We want console logging in CLI tools
    
    // Import rules
    'sort-imports': ['error', {
      ignoreCase: true,
      ignoreDeclarationSort: true,
    }],
    
    // Style rules
    'comma-dangle': ['error', 'always-multiline'],
    'semi': ['error', 'never'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'indent': ['error', 2, { SwitchCase: 1 }],
    'max-len': ['error', { code: 120, ignoreUrls: true, ignoreStrings: true }],
    
    // Error prevention
    'eqeqeq': ['error', 'always'],
    'no-duplicate-imports': 'error',
    'no-return-assign': 'error',
    'no-unneeded-ternary': 'error',
    'no-useless-return': 'error',
  },
  ignorePatterns: [
    'dist',
    'node_modules',
    '*.js',
    '*.mjs',
    '.eslintrc.cjs',
  ],
  overrides: [
    {
      files: ['*.test.ts', '*.spec.ts'],
      env: {
        jest: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
}