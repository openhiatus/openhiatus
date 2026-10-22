import { resolve } from 'node:path';
import { checkArchitecture } from './architecture-rules';

const violations = checkArchitecture(resolve('.'));
for (const violation of violations) {
  console.error(`${violation.file}:${violation.line} (${violation.specifier}): ${violation.reason}`);
}
if (violations.length) process.exitCode = 1;
else console.log('Architecture boundaries passed.');
