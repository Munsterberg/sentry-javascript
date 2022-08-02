import * as jscsTypes from 'jscodeshift';
import { default as jscodeshiftDefault } from 'jscodeshift';

import { makeParser } from './parsers';

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
const { ExportSpecifier, Identifier, Node, VariableDeclaration, VariableDeclarator } = jscs;

export type AST<T = jscsTypes.ASTNode> = jscsTypes.Collection<T>;
type ASTPath<T = jscsTypes.ASTNode> = jscsTypes.ASTPath<T>;
type IdentifierNode = jscsTypes.Identifier;
type ExportSpecifierNode = jscsTypes.ExportSpecifier;
type VariableDeclarationNode = jscsTypes.VariableDeclaration;

/**
 * Create an AST based on the given code.
 *
 * @param code The code to convert to an AST.
 * @param isTS Flag indicating what parser to use.
 * @throws Parsing error if the code is unparsable
 * @returns The AST
 */
export function makeAST(code: string, isTS: boolean): AST {
  const parser = isTS ? makeParser('tsx') : makeParser('jsx');
  // If this errors, it will be caught in the calling function, where we know more information and can construct a
  // better warning message
  return jscs(code, { parser });
}

/**
 * Find all nodes which represent Identifiers with the given name
 *
 * @param ast The code, in AST form
 * @param name The Identifier name to search for
 * @returns A collection of NodePaths pointing to any nodes which were found
 */
export function findIdentifiers(ast: AST, name: string): AST<IdentifierNode> {
  const identifierFilter = function (path: ASTPath<IdentifierNode>): boolean {
    // Check that what we have is indeed an Identifier, and that the name matches
    //
    // Note: If we were being super precise about this, we'd also check the context in which the identifier is being
    // used, because there are some cases where we actually don't want to be renaming things (if the identifier is being
    // used to name a class property, for example). But the chances that someone is going to have a class property in a
    // nextjs page file with the same name as one of the canonical functions are slim to none, so for simplicity we can
    // stop filtering here. If this ever becomes a problem, more precise filter checks can be found in a comment at the
    // bottom of this file.
    return path.node.name === name;
  };

  return ast.find(Identifier).filter(identifierFilter);
}

/**
 * Find all nodes which are declarations of variables with the given name
 *
 * @param ast The code, in AST form
 * @param name The variable name to search for
 * @returns A collection of NodePaths pointing to any nodes which were found
 */
export function findDeclarations(ast: AST, name: string): AST<VariableDeclarationNode> {
  // Check for a structure of the form
  //
  //     node: VariableDeclaration
  //      \
  //       declarations: VariableDeclarator[]
  //        \
  //         0 : VariableDeclarator
  //          \
  //           id: Identifier
  //            \
  //             name: string
  //
  // where `name` matches the given name.
  const declarationFilter = function (path: ASTPath<VariableDeclarationNode>): boolean {
    return (
      path.node.declarations.length === 1 &&
      VariableDeclarator.check(path.node.declarations[0]) &&
      Identifier.check(path.node.declarations[0].id) &&
      path.node.declarations[0].id.name === name
    );
  };

  return ast.find(VariableDeclaration).filter(declarationFilter);
}

/**
 * Find all nodes which are exports of variables with the given name
 *
 * @param ast The code, in AST form
 * @param name The variable name to search for
 * @returns A collection of NodePaths pointing to any nodes which were found
 */
export function findExports(ast: AST, name: string): AST<ExportSpecifierNode> {
  const exportFilter = function (path: ASTPath<ExportSpecifierNode>): boolean {
    return ExportSpecifier.check(path.node) && path.node.exported.name === name;
  };

  return ast.find(ExportSpecifier).filter(exportFilter);
}

/**
 * Remove comments from all nodes in the given AST.
 *
 * Note: Comments are not nodes in and of themselves, but are instead attached to the nodes above and below them.
 *
 * @param ast The code, in AST form
 */
export function removeComments(ast: AST): void {
  const nodesWithComments = ast.find(Node).filter(path => !!path.node.comments);
  nodesWithComments.forEach(path => (path.node.comments = null));
}

/**
 * Find an unused identifier name in the AST by repeatedly adding underscores to the beginning of the given original
 * name until we find one which hasn't already been taken.
 *
 * @param userAST The AST to search
 * @param origName The original name we want to alias
 * @returns
 */
export function findAvailibleAlias(userAST: AST, origName: string): string {
  let foundAvailableName = false;
  let newName = origName;

  while (!foundAvailableName) {
    // Prefix the original function name (or the last name we tried) with an underscore and search for identifiers with
    // the new name in the AST
    newName = `_${newName}`;
    const existingIdentifiers = findIdentifiers(userAST, newName);

    // If we haven't found anything, we're good to go
    foundAvailableName = existingIdentifiers.length === 0;
  }

  return newName;
}

/**
 * More precise version of `identifierFilter`, used in `findIdentifiers`, which accounts for context. See note in
 * `findIdentifiers` above.
 */

// const {
//   AssignmentExpression,
//   CallExpression,
//   ExportSpecifier,
//   FunctionDeclaration,
//   Identifier,
//   MemberExpression,
//   Node,
//   Property,
//   ReturnStatement,
//   VariableDeclaration,
//   VariableDeclarator,
// } = jscs;
//
// const identifierFilter = function (path: ASTPath<Identifier>): boolean {
//   const node = path.node;
//   const parentPath = path.parent as ASTPath;
//   const parent = parentPath.node;
//
//   const hasCorrectName = node.name === name;
//
//   // Check that the identifier is being used in a valid context, one in which we do in fact want to replace it.
//   //
//   // Note: There are a million ways identifiers can be used - this is just a subset, but it should hit 99% of cases.
//   // If anyone every files an issue because we're doing an incomplete job of transforming their code, get a
//   // representative sample from them and throw it into https://astexplorer.net/ or
//   // https://rajasegar.github.io/ast-finder/ (making sure in either case to set the parser to `recast`) to figure out
//   // what to add below. (Find the `Identifier` node and note its parent's `type` value and the name of the key under
//   // which it lives.) Note that neither tool seems to be able to handle the `export` keyword for some reason, but for
//   // anything other than the case already included below, `ExportSpecifier` will be at least the grandparent; given
//   // that we only care about recognizing the parent, we can just remove `export` from the sample code and it won't
//   // make any difference to the part we care about.
//   //
//   // In all of the examples in the comments below, the identifer we're interested in is `someFunc`.
//   const contextIsValid =
//     // `export const someFunc = ...` or `const someFunc = ...` or `let someFunc`
//     (VariableDeclarator.check(parent) && parent.id === node) ||
//     // `export { someFunc }` or `export { someOtherFunc as someFunc }`
//     (ExportSpecifier.check(parent) && parent.exported === node) ||
//     // `export function someFunc() { ... }` or `function someFunc() { ... }`
//     (FunctionDeclaration.check(parent) && parent.id === node) ||
//     // `someFunc = ...`
//     (AssignmentExpression.check(parent) && parent.left === node) ||
//     // `someVariable = someFunc`
//     (AssignmentExpression.check(parent) && parent.right === node) ||
//     // `const someVariable = someFunc`
//     (VariableDeclarator.check(parent) && parent.init === node) ||
//     // `someFunc.someProperty`
//     (MemberExpression.check(parent) && parent.object === node) ||
//     // `{ someProperty: someFunc }`
//     (Property.check(parent) && parent.value === node) ||
//     // `someOtherFunc(someFunc)`
//     (CallExpression.check(parent) && parent.arguments.includes(node)) ||
//     // `return someFunc`
//     (ReturnStatement.check(parent) && parent.argument === node);
//
//   return hasCorrectName && contextIsValid;
// };
