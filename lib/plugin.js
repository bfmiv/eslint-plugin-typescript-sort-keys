const assert = require('assert');

const {
  getObjectBody,
  getObjectParent,
  getPropertyName,
} = require('./utils/ast');
const { compareFunctions } = require('./utils/compareFunctions');

function createNodeSwapper(context) {
  const sourceCode = context.getSourceCode();

  /**
   * Returns the indent range of a node if it's the first on its line.
   * Otherwise, returns a range starting immediately after the previous sibling.
   */
  function getIndentRange(node) {
    const prevSibling = sourceCode.getTokenBefore(node);
    const end = node.range[0];
    let start;

    if (prevSibling.loc.start.line === node.loc.start.line) {
      start = prevSibling.range[1] + 1;
    } else {
      start = node.range[0] - node.loc.start.column;
    }

    return [start, end];
  }

  function getRangeWithIndent(node) {
    return [getIndentRange(node)[0], node.range[1]];
  }

  /**
   * Returns the range for the entire line, including EOL, if node is the only
   * token on its lines. Otherwise, returns the node range.
   */
  function getLineRange(node) {
    const [start] = getRangeWithIndent(node);
    const index = sourceCode.lineStartIndices.findIndex(n => start === n);

    if (index < 0) {
      // Node is not at the beginning of the line
      return node.range;
    }

    const lines = 1 + node.loc.end.line - node.loc.start.line;

    return [
      sourceCode.lineStartIndices[index],
      sourceCode.lineStartIndices[index + lines],
    ];
  }

  function getIndentText(node) {
    return sourceCode.text.slice(...getIndentRange(node));
  }

  function getNodePunctuator(node) {
    const punctuator = sourceCode.getTokenAfter(node, {
      filter: n => n.type === 'Punctuator' && n.value !== ':',
    });
    // Check the punctuator value outside of filter because we
    // want to stop traversal on any terminating punctuator
    return punctuator && /^[,;]$/.test(punctuator.value)
      ? punctuator
      : undefined;
  }

  function getMemberPunctuatorText(node) {
    const objectParent = getObjectParent(node);
    const body = getObjectBody(objectParent);
    let punctuator = getNodePunctuator(node);

    if (!punctuator) {
      // eslint-disable-next-line no-restricted-syntax
      for (const member of body) {
        punctuator = getNodePunctuator(member);
        if (punctuator) {
          break;
        }
      }
    }

    return punctuator ? punctuator.value : '';
  }

  /**
   * Returns node text with indent
   */
  function getFormattedText(node) {
    return `${getIndentText(node)}${sourceCode.getText(node)}`;
  }

  return (fixer, sortedBody, currentNode, replaceNode) => {
    const objectParent = getObjectParent(currentNode);
    const body = getObjectBody(objectParent);

    const r = [currentNode, replaceNode].reduce((acc, node) => {
      const otherNode = node === currentNode ? replaceNode : currentNode;
      const comments = sourceCode.getCommentsBefore(node);
      const nextSibling = sourceCode.getTokenAfter(node);
      // const punctuator = getNodePunctuator(node);
      const isLast = sortedBody.indexOf(node) === sortedBody.length - 1;
      const isLastReplacingLast =
        isLast && sortedBody.indexOf(node) === body.indexOf(otherNode);

      let text = getFormattedText(node);

      if (
        nextSibling &&
        nextSibling.type === 'Punctuator' &&
        getNodePunctuator(node)
      ) {
        acc.push(fixer.remove(nextSibling));
      } else if (isLast) {
        text = text.replace(/,$/, '');
      }

      if (!/[,;]$/.test(text)) {
        text += getMemberPunctuatorText(node);
      }

      if (isLastReplacingLast) {
        text = text.replace(/,$/, '');
      }

      if (comments.length) {
        acc.push(
          fixer.insertTextBefore(
            otherNode,
            comments
              .map(c => sourceCode.getText(c))
              .concat('')
              .join('\n'),
          ),
        );
      }

      acc.push(
        fixer.insertTextBefore(otherNode, text),
        fixer.remove(node),
        ...comments.map(n => fixer.removeRange(getLineRange(n))),
      );

      return acc;
    }, []);

    // console.log(r);

    return r;
  };
}

module.exports = function createReporter(context, createReportObject) {
  // Parse options.
  const order = context.options[0] || 'asc';
  const options = context.options[1];
  const insensitive = (options && options.caseSensitive) === false;
  const natural = Boolean(options && options.natural);
  const computedOrder = [order, insensitive && 'I', natural && 'N']
    .filter(Boolean)
    .join('');

  const compareFn = compareFunctions[computedOrder];
  const swapNodes = createNodeSwapper(context);

  return nodeList => {
    const sortedBody = [...nodeList].sort((a, b) => {
      return compareFn(getPropertyName(a), getPropertyName(b));
    });

    for (let i = 1; i < nodeList.length; i += 1) {
      const prevNode = nodeList[i - 1];
      const currentNode = nodeList[i];
      const prevNodeName = getPropertyName(prevNode);
      const currentNodeName = getPropertyName(currentNode);

      if (compareFn(prevNodeName, currentNodeName) > 0) {
        const targetPosition = sortedBody.indexOf(currentNode);
        const replaceNode = nodeList[targetPosition];
        const { data, ...rest } = createReportObject(currentNode, replaceNode);

        // Sanity check
        assert(
          rest.loc,
          'createReportObject return value must include a node location',
        );
        assert(
          rest.message,
          'createReportObject return value must include a problem message',
        );

        context.report({
          node: currentNode,
          data: {
            thisName: currentNodeName,
            prevName: prevNodeName,
            order,
            insensitive: insensitive ? 'insensitive ' : '',
            natural: natural ? 'natural ' : '',
            ...data,
          },
          fix: fixer => {
            if (currentNode !== replaceNode) {
              return swapNodes(fixer, sortedBody, currentNode, replaceNode);
            }
            return undefined;
          },
          ...rest,
        });
      }
    }
  };
};
