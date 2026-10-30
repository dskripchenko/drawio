import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Node scripts that also hand code to a browser page.
const scriptGlobals = Object.fromEntries(
  ['process', 'console', 'URL', 'window', 'document', 'CSS', 'DOMPoint'].map((name) => [name, 'readonly']),
)

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ['dist', 'coverage', 'tests/browser/output'] },
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: scriptGlobals } },
)
