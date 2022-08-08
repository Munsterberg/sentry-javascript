import { getExportIdentifiers, makeAST } from '../../src/config/loaders/ast';

test.each([
  // examples taken from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export
  // Exporting declarations
  ['export let name1, name2; export var name3, name4;', ['name1', 'name2', 'name3', 'name4']],
  ['export const name1 = 1, name2 = 2;', ['name1', 'name2']],
  ['export var name1 = 1, name2 = 2;', ['name1', 'name2']],
  ['export let name1 = 1, name2 = 2;', ['name1', 'name2']],
  ['export function functionName() {}', ['functionName']],
  ['export class ClassName {}', ['ClassName']],
  ['export function* generatorFunctionName() {}', ['generatorFunctionName']],
  [
    'export const { name1, bar: name2, someValue: { someNestedValue: name3 }, ...name4 } = {};',
    ['name1', 'name2', 'name3', 'name4'],
  ],
  ['export const [ name1, name2, ...name3 ] = [1, 2, 3, 4];', ['name1', 'name2', 'name3']],
  [
    'export const { foo: { bar: [{ baz: [name1, ...name2], ...name3 }, name4, name5]} } = {};',
    ['name1', 'name2', 'name3', 'name4', 'name5'],
  ],
  ['export const [{ a: { ...name1 }, b: [,name2] }, name3] = [];', ['name1', 'name2', 'name3']],
  // Export list
  [
    `
    var name1, name2, name3;
    export { name1, name2, name3 };`,
    ['name1', 'name2', 'name3'],
  ],
  [
    `
      var variable1, variable2, name3;
      export { variable1 as name1, variable2 as name2, name3 };`,
    ['name1', 'name2', 'name3'],
  ],
  [
    `
    var name1, name2, name3;
    export { name1 as default, name1, name2 };`,
    ['name1', 'name2'],
  ],
  // Default exports
  ['export default 1;', []],
  ['export default function functionName() {}', []],
  ['export default class ClassName {}', []],
  ['export default function* generatorFunctionName() {}', []],
  ['export default function () {}', []],
  ['export default class {}', []],
  ['export default function* () {}', []],
  // Aggregating modules
  ['export * from "module-name";', []],
  ['export * as name1 from "module-name";', ['name1']],
  ['export { name1, name2 } from "module-name";', ['name1', 'name2']],
  ['export { import1 as name1, import2 as name2, name3 } from "module-name";', ['name1', 'name2', 'name3']],
  ['export { default } from "module-name";', []],
  ['export { default, name1 } from "module-name";', ['name1']],
])('getExportIdentifiers(%s) should return %p', (program, expectedIdentifiers) => {
  const ast = makeAST(program, true);
  expect(getExportIdentifiers(ast)).toStrictEqual(expectedIdentifiers);
});
