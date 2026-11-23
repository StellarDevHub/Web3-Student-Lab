import {
  ValidationContext,
  ASTVisitor,
  GraphQLError,
  FragmentDefinitionNode,
  SelectionSetNode,
  Kind
} from 'graphql';

/**
 * Custom Depth Limit validation rule
 */
export const depthLimitRule = (maxDepthInput: number | (() => number)) => {
  return (context: ValidationContext): ASTVisitor => {
    const fragments: Record<string, FragmentDefinitionNode> = {};
    const maxDepth = typeof maxDepthInput === 'function' ? maxDepthInput() : maxDepthInput;

    return {
      FragmentDefinition(node) {
        fragments[node.name.value] = node;
      },
      OperationDefinition(node) {
        const depth = calculateDepth(node.selectionSet, fragments);
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(`Query exceeds maximum depth of ${maxDepth} (actual depth: ${depth})`, {
              extensions: { code: 'DEPTH_LIMIT_EXCEEDED' },
            })
          );
        }
      },
    };
  };
};

function calculateDepth(
  selectionSet: SelectionSetNode,
  fragments: Record<string, FragmentDefinitionNode>,
  seenFragments = new Set<string>()
): number {
  let maxDepth = 0;

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.selectionSet) {
        const depth = 1 + calculateDepth(selection.selectionSet, fragments, seenFragments);
        if (depth > maxDepth) {
          maxDepth = depth;
        }
      } else {
        if (1 > maxDepth) {
          maxDepth = 1;
        }
      }
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragmentName = selection.name.value;
      if (!seenFragments.has(fragmentName)) {
        seenFragments.add(fragmentName);
        const fragment = fragments[fragmentName];
        if (fragment) {
          const depth = calculateDepth(fragment.selectionSet, fragments, seenFragments);
          if (depth > maxDepth) {
            maxDepth = depth;
          }
        }
        seenFragments.delete(fragmentName);
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const depth = calculateDepth(selection.selectionSet, fragments, seenFragments);
      if (depth > maxDepth) {
        maxDepth = depth;
      }
    }
  }

  return maxDepth;
}

/**
 * Custom Complexity/Cost Limit validation rule
 */
export const getFieldCost = (fieldName: string): number => {
  // Sensible costs for connection and nested fields
  const connectionFields = ['students', 'courses', 'enrollments', 'certificates', 'modules', 'lessons'];
  if (connectionFields.includes(fieldName)) {
    return 10; // Connection fields
  }

  const nestedFields = ['student', 'course', 'learningProgress'];
  if (nestedFields.includes(fieldName)) {
    return 5; // Nested object fields
  }

  return 1; // Default scalar or other fields
};

export const complexityLimitRule = (maxComplexityInput: number | (() => number)) => {
  return (context: ValidationContext): ASTVisitor => {
    const fragments: Record<string, FragmentDefinitionNode> = {};
    let totalComplexity = 0;
    const maxComplexity = typeof maxComplexityInput === 'function' ? maxComplexityInput() : maxComplexityInput;

    const calculateComplexity = (
      selectionSet: SelectionSetNode,
      seenFragments = new Set<string>()
    ): number => {
      let complexity = 0;

      for (const selection of selectionSet.selections) {
        if (selection.kind === Kind.FIELD) {
          const fieldName = selection.name.value;
          const cost = getFieldCost(fieldName);
          complexity += cost;

          if (selection.selectionSet) {
            complexity += calculateComplexity(selection.selectionSet, seenFragments);
          }
        } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
          const fragmentName = selection.name.value;
          if (!seenFragments.has(fragmentName)) {
            seenFragments.add(fragmentName);
            const fragment = fragments[fragmentName];
            if (fragment) {
              complexity += calculateComplexity(fragment.selectionSet, seenFragments);
            }
            seenFragments.delete(fragmentName);
          }
        } else if (selection.kind === Kind.INLINE_FRAGMENT) {
          complexity += calculateComplexity(selection.selectionSet, seenFragments);
        }
      }

      return complexity;
    };

    return {
      FragmentDefinition(node) {
        fragments[node.name.value] = node;
      },
      OperationDefinition(node) {
        totalComplexity = calculateComplexity(node.selectionSet);
        if (totalComplexity > maxComplexity) {
          context.reportError(
            new GraphQLError(`Query complexity of ${totalComplexity} exceeds maximum complexity budget of ${maxComplexity}`, {
              extensions: { code: 'COMPLEXITY_LIMIT_EXCEEDED' },
            })
          );
        }
      },
    };
  };
};
