/* eslint-disable max-lines */
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
const { ExportSpecifier, ExportNamedDeclaration, ExportAllDeclaration } = jscs;

export type AST<T = jscsTypes.ASTNode> = jscsTypes.Collection<T>;

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

function getExportIdentifiersFromRestElement(restElement: jscsTypes.RestElement): string[] {
  const identifiers: string[] = [];

  if (restElement.argument.type === 'Identifier') {
    identifiers.push(restElement.argument.name);
  } else if (restElement.argument.type === 'ArrayPattern') {
    identifiers.push(...getExportIdentifiersFromArrayPattern(restElement.argument));
  } else if (restElement.argument.type === 'ObjectPattern') {
    identifiers.push(...getExportIdentifiersFromObjectPattern(restElement.argument));
  } else if (restElement.argument.type === 'RestElement') {
    identifiers.push(...getExportIdentifiersFromRestElement(restElement.argument));
  }

  return identifiers;
}

function getExportIdentifiersFromArrayPattern(arrayPattern: jscsTypes.ArrayPattern): string[] {
  const identifiers: string[] = [];

  arrayPattern.elements.forEach(element => {
    if (element?.type === 'Identifier') {
      identifiers.push(element.name);
    } else if (element?.type === 'ObjectPattern') {
      identifiers.push(...getExportIdentifiersFromObjectPattern(element));
    } else if (element?.type === 'ArrayPattern') {
      identifiers.push(...getExportIdentifiersFromArrayPattern(element));
    } else if (element?.type === 'RestElement') {
      identifiers.push(...getExportIdentifiersFromRestElement(element));
    }
  });

  return identifiers;
}

function getExportIdentifiersFromObjectPattern(objectPatternNode: jscsTypes.ObjectPattern): string[] {
  const identifiers: string[] = [];

  objectPatternNode.properties.forEach(property => {
    if (property.type === 'Property') {
      if (property.value.type === 'Identifier') {
        identifiers.push(property.value.name);
      } else if (property.value.type === 'ObjectPattern') {
        identifiers.push(...getExportIdentifiersFromObjectPattern(property.value));
      } else if (property.value.type === 'ArrayPattern') {
        identifiers.push(...getExportIdentifiersFromArrayPattern(property.value));
      } else if (property.value.type === 'RestElement') {
        identifiers.push(...getExportIdentifiersFromRestElement(property.value));
      }
      // @ts-ignore seems to be a bug in the jscs typing
    } else if (property.type === 'RestElement') {
      // @ts-ignore seems to be a bug in the jscs typing
      identifiers.push(...getExportIdentifiersFromRestElement(property));
    }
  });

  return identifiers;
}

/**
 * TODO
 */
export function getExportIdentifiers(ast: AST): string[] {
  const identifiers: string[] = [];

  const namedExportDeclarationNodes = ast
    .find(ExportNamedDeclaration)
    .nodes()
    .map(namedExportDeclarationNode => namedExportDeclarationNode.declaration);

  namedExportDeclarationNodes
    .filter(
      (declarationNode): declarationNode is jscsTypes.VariableDeclaration =>
        declarationNode !== null && declarationNode.type === 'VariableDeclaration',
    )
    .map(variableDeclarationNode => variableDeclarationNode.declarations)
    .reduce((prev, curr) => [...prev, ...curr], []) // flatten
    .forEach(declarationNode => {
      if (declarationNode.type === 'Identifier' || declarationNode.type === 'JSXIdentifier') {
        identifiers.push(declarationNode.name);
      } else if (declarationNode.type === 'TSTypeParameter') {
        // noop
      } else if (declarationNode.id.type === 'Identifier') {
        identifiers.push(declarationNode.id.name);
      } else if (declarationNode.id.type === 'ObjectPattern') {
        identifiers.push(...getExportIdentifiersFromObjectPattern(declarationNode.id));
      } else if (declarationNode.id.type === 'ArrayPattern') {
        identifiers.push(...getExportIdentifiersFromArrayPattern(declarationNode.id));
      } else if (declarationNode.id.type === 'RestElement') {
        identifiers.push(...getExportIdentifiersFromRestElement(declarationNode.id));
      }
    });

  namedExportDeclarationNodes
    .filter(
      (declarationNode): declarationNode is jscsTypes.ClassDeclaration | jscsTypes.FunctionDeclaration =>
        declarationNode !== null && declarationNode.type === 'ClassDeclaration',
    )
    .map(node => node.id)
    .filter((id): id is jscsTypes.Identifier => id !== null && id.type === 'Identifier')
    .forEach(id => identifiers.push(id.name));

  namedExportDeclarationNodes
    .filter(
      (declarationNode): declarationNode is jscsTypes.ClassDeclaration | jscsTypes.FunctionDeclaration =>
        declarationNode !== null && declarationNode.type === 'FunctionDeclaration',
    )
    .map(node => node.id)
    .filter((id): id is jscsTypes.Identifier => id !== null && id.type === 'Identifier')
    .forEach(id => identifiers.push(id.name));

  ast
    .find(ExportSpecifier)
    .nodes()
    .forEach(specifier => {
      if (specifier.exported.name !== 'default') {
        identifiers.push(specifier.exported.name);
      }
    });

  ast
    .find(ExportAllDeclaration)
    .nodes()
    .forEach(declaration => {
      if (declaration.exported) {
        identifiers.push(declaration.exported.name);
      }
    });

  return [...new Set(identifiers)];
}

/**
 * TODO
 */
export function hasDefaultExport(_ast: AST): boolean {
  // TODO
  return true;
}
