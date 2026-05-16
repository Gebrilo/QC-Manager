module.exports = {
  meta: {
    id: 'no-bare-projectId',
    type: 'problem',
    docs: {
      description: 'Bare `projectId` is ambiguous — use `qcProjectId` (UUID) or `tuleapProjectId` (integer) instead.',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      ambiguous: 'Ambiguous identifier `projectId` — use `qcProjectId` (QC UUID) or `tuleapProjectId` (Tuleap integer) instead.',
    },
    schema: [],
  },

  create(context) {
    return {
      Identifier(node) {
        if (node.name === 'projectId') {
          context.report({
            node,
            messageId: 'ambiguous',
          });
        }
      },
    };
  },
};