/**
 * TODO
 */
export function findDefaultExportIdentifierNames(userAST: AST): string[] {
  const defaultExportIdentifiers = userAST
    .find(ExportDefaultDeclaration)
    .nodes()
    .map(node => node.declaration)
    .filter((declarationNode): declarationNode is jscsTypes.Identifier => declarationNode.type === 'Identifier')
    .map(identifierNode => identifierNode.name);

  const namedDefaultExportIdentifiers = userAST
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
}
