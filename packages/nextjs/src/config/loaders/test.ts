import * as jscsTypes from 'jscodeshift';
import { default as jscodeshiftDefault } from 'jscodeshift';

import { makeAST } from './ast';

// In `jscodeshift`, the exports look like this:
//
//     function core(...) { ... }
//     core.ABC = ...
//     core.XYZ = ...
//     module.exports = core
//
// In other words, when required/imported, the module is both a callable function and an object containing all sorts of
// properties. Meanwhile, its TS export is a namespace continaing the types of all of the properties attached to `core`.
// In order to use the types, we thus need to use `import *` syntax. But when we do that, Rollup only sees it as a
// namespace, and will complain if we try to use it as a function. In order to get around this, we take advantage of the
// fact that Rollup wraps imports in its own version of TS's `esModuleInterop` functions, aliasing the export to a
// `default` property inside the export. (So, here, we basically end up with `core.default = core`.) When referenced
// through that alias, `core` is correctly seen as callable by Rollup. Outside of a Rollup context, however, that
// `default` alias doesn't exist. So, we try both and use whichever one is defined. (See
// https://github.com/rollup/rollup/issues/1267.)
const jscodeshiftNamespace = jscsTypes;
const jscs = jscodeshiftDefault || jscodeshiftNamespace;

// These are types not in the TS sense, but in the instance-of-a-Type-class sense
const { ExportDefaultDeclaration, ExportSpecifier } = jscs;

const inputs = [
  `
    import { asdf } from 'asdf';
    export default () => undefined;
    `,
  `
    const asdf = 1;
    export default asdf;
    `,
  `
  const other = 2;
  const asdf = 1;
  export const a = 1;
  export {
    other,
    asdf as default
  };
  `,
  "export { wohoo as default } from 'asdf'",
];

const results = inputs.map(input => {
  const ast = makeAST(input, true);

  const defaultExportIdentifiers = ast
    .find(ExportDefaultDeclaration)
    .nodes()
    .map(node => node.declaration)
    .filter((declarationNode): declarationNode is jscsTypes.Identifier => declarationNode.type === 'Identifier')
    .map(identifierNode => identifierNode.name);

  const namedDefaultExportIdentifiers = ast
    .find(ExportSpecifier)
    .nodes()
    .filter(exportSpecifierNode => {
      const exportedNode = exportSpecifierNode.exported;
      return exportedNode.type === 'Identifier' && exportedNode.name === 'default';
    })
    .map(defaultAliasExportSpecifierNode => defaultAliasExportSpecifierNode.local)
    .filter(
      (potentiallyLocalNode): potentiallyLocalNode is jscsTypes.Identifier =>
        !!potentiallyLocalNode && potentiallyLocalNode.type === 'Identifier',
    )
    .map(localNode => localNode.name);

  return [...defaultExportIdentifiers, ...namedDefaultExportIdentifiers];
});
