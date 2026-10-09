import * as fs from 'fs';
import * as path from 'path';
import { isEaNativeDocument, parseEaNative } from '../src/ee/ea-import/ea-native.parser';
import { EaPackageNode } from '../src/ee/ea-import/types/ea-import.types';

const buffer = fs.readFileSync(
  path.resolve(__dirname, '../../../samples/CW_BN.xml'),
);
console.log('isNative', isEaNativeDocument(buffer), 'size', buffer.length);
const t = Date.now();
const result = parseEaNative(buffer);
console.log('parse ms', Date.now() - t, 'roots', result.roots.length, 'warnings', result.warnings.length);
for (const w of result.warnings.slice(0, 10)) console.log('  WARN', w.page, '-', w.reason);

let count = 0;
const walk = (n: EaPackageNode, depth: number) => {
  count += 1;
  console.log(
    `${'  '.repeat(depth)}- ${n.name} [id=${n.id}] children=${n.children.length} dias=${n.diagrams.length} docs=${n.documents.length} acts=${n.activities.length}`,
  );
  n.children.forEach((c) => walk(c, depth + 1));
};
result.roots.forEach((r) => walk(r, 0));
console.log('total pages', count);
