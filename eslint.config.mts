import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'scripts',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json', 'tests/*.ts'],
					// tests は tsconfig の外なので既定プロジェクトで読む。既定の上限 8 本ではテストを増やせない
					maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 50,
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	// テストは Node で動く(プラグインには入らない)ので、Node の組み込みを読んでよい
	{
		files: ['tests/**'],
		rules: { 'obsidianmd/no-nodejs-modules': 'off' },
	},
	// recommended は manifest.json を lint の対象に入れないので、validate-manifest を当てる組を足す
	{
		files: ['manifest.json'],
		plugins: { obsidianmd },
		languageOptions: { parser: tseslint.parser },
		rules: { 'obsidianmd/validate-manifest': 'error' },
	},
);
