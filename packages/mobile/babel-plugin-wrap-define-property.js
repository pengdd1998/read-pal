// Babel plugin to wrap Object.defineProperty(global, ...) calls in try-catch.
// This prevents crashes from pnpm monorepo duplicate module instances in Metro bundles.
module.exports = function ({ types: t }) {
  return {
    visitor: {
      ExpressionStatement(path) {
        // Skip if already inside a try block
        if (path.findParent((p) => p.isTryStatement())) return;

        const expr = path.node.expression;
        if (
          t.isCallExpression(expr) &&
          t.isMemberExpression(expr.callee) &&
          t.isIdentifier(expr.callee.object, { name: 'Object' }) &&
          t.isIdentifier(expr.callee.property, { name: 'defineProperty' }) &&
          expr.arguments.length >= 2 &&
          t.isIdentifier(expr.arguments[0]) &&
          (expr.arguments[0].name === 'global' || expr.arguments[0].name === 'globalThis')
        ) {
          const tryBlock = t.blockStatement([path.node]);
          const catchClause = t.catchClause(null, t.blockStatement([]));
          const tryStatement = t.tryStatement(tryBlock, catchClause);
          path.replaceWith(tryStatement);
        }
      },
    },
  };
};
