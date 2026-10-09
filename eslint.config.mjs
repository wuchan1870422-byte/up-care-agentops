import {defineConfig,globalIgnores} from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTS from 'eslint-config-next/typescript';
export default defineConfig([...nextVitals,...nextTS,globalIgnores(['.next/**','output/**','playwright-report/**','test-results/**','next-env.d.ts']),{rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}}]);
