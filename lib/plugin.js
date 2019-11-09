const assert = require('assert');

const {
  getObjectBody,
  getObjectParent,
  getPropertyName,
} = require('./utils/ast');
const { compareFunctions } = require('./utils/compareFunctions');

function createNodeSwapper(context) {
  const sourceCode = context.getSourceCode();

  function isInline(node) {
    const objectParent = getObjectParent(node);
    return (
      Boolean(objectParent) &&
      objectParent.loc.start.line === objectParent.loc.end.line
    );
  }

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

    // if (isInline(node)) {
    //   start =
    //     prevSibling.range[1] +
    //     (node.loc.start.column - prevSibling.loc.end.column);
    // } else {
    //   start = node.range[0] - node.loc.start.column;
    // }

    // if (isInline(node)) {
    //   console.log(prevSibling);
    //   start = prevSibling.range[1] + 1;
    // } else {
    //   start = node.range[0] - node.loc.start.column;
    // }

    // console.log([start, end], node.range, `|${sourceCode.getText(node)}|`);
    return [start, end];
  }

  /* function isInline(node) {
    const objectParent = getObjectParent(node);
    return (
      Boolean(objectParent) &&
      objectParent.loc.start.line === objectParent.loc.end.line
    );
  }

  function isLastMember(node) {
    return (
      sourceCode.getTokensAfter(node, {
        filter: n => n.type === node.type,
        includeComments: false,
      }).length === 0
    );
  } */

  // function isLastMember(node) {
  //   return (
  //     sourceCode.getTokensAfter(node, {
  //       filter: n => n.type === node.type,
  //       includeComments: false,
  //     }).length === 0
  //   );
  // }

  function isLastMember(node) {
    const objectParent = getObjectParent(node);
    const body = getObjectBody(objectParent);
    // console.log(body);
    return body.indexOf(node) === body.length - 1;
  }

  function getRangeWithIndent(node) {
    return [getIndentRange(node)[0], node.range[1]];
  }

  // function getRangeWithPunctuator(node) {
  //   const punctuator = getNodePunctuator(node);
  //   return [node.range[0], punctuator ? punctuator.range[1] : node.range[1]];
  // }

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
    // if (!objectParent) {
    //   console.log(node);
    // }
    const body = getObjectBody(objectParent);
    let punctuator;

    // console.log(node.type);

    // if (body) {
    // eslint-disable-next-line no-restricted-syntax
    for (const member of body) {
      // if (member.type === node.type) {
      punctuator = getNodePunctuator(member);
      // }
      if (punctuator) {
        break;
      }
    }
    // }

    return punctuator ? punctuator.value : '';
  }

  /**
   * Returns "key: value(,|;)", appending the Punctuator if necessary
   */
  function getTerminatedText(node) {
    const punctuator = getMemberPunctuatorText(node);
    let text = sourceCode.getText(node);
    // console.log(text, `punctuator = |${punctuator}|`);
    if (/* isInline(node) && */ !/[,;]$/.test(text.trimEnd())) {
      // console.log(text, punctuator);
      text += punctuator;
    }
    return text;
  }

  // function getFormattedText(node, punctuator = true) {
  //   return `${getIndentText(node)}${
  //     punctuator ? getTerminatedText(node) : sourceCode.getText(node)
  //   }`;
  // }

  function getFormattedText(node) {
    return `${getIndentText(node)}${sourceCode.getText(node)}`;
  }

  return (fixer, sortedBody, currentNode, replaceNode) => {
    // console
    //   .log
    //   // sortedBody.indexOf(currentNode),
    //   // sortedBody.indexOf(replaceNode),
    //   // sortedBody.length,
    //   ();
    // console.log(sortedBody.map(n => sourceCode.getText(n)));
    // console.log(sortedBody.indexOf(replaceNode));
    // console.log(
    //   sortedBody.indexOf(currentNode),
    //   sortedBody.indexOf(replaceNode),
    // );
    // assert(sortedBody.indexOf(currentNode) < sortedBody.indexOf(replaceNode));

    // const isDefinitelyLast =
    //   // sortedBody.indexOf(currentNode) === sortedBody.length - 2 &&
    //   sortedBody.indexOf(replaceNode) === sortedBody.length - 1;

    const objectParent = getObjectParent(currentNode);
    const body = getObjectBody(objectParent);

    const R = [currentNode, replaceNode].reduce((acc, node) => {
      const otherNode = node === currentNode ? replaceNode : currentNode;
      const comments = sourceCode.getCommentsBefore(node);
      const nextSibling = sourceCode.getTokenAfter(node);
      // const punctuator = getNodePunctuator(node);
      // console.log(punctuator);
      // const p = sourceCode.getTokenAfter(otherNode);
      let text = getFormattedText(
        node,
        // !(node === currentNode && !isDefinitelyLast),
        //   ? p.value === '}' &&
        //       sortedBody.indexOf(node) < sortedBody.indexOf(otherNode)
        //   : true,
      );
      // console.log(`|${text}|`);

      // console.log(
      //   text,
      //   isDefinitelyLast,
      //   // text.endsWith(nextSibling.value),
      //   nextSibling.value,
      // );

      // if (node === replaceNode && isDefinitelyLast && punctuator) {
      //   // const punctuator = getNodePunctuator(node);
      //   // console.log(punctuator);
      //   // if (punctuator) {
      //   text = text.replace(punctuator.value, '');
      //   // }
      // }

      // if (
      //   // node === replaceNode &&
      //   nextSibling &&
      //   text.endsWith(nextSibling.value)
      // ) {
      //   // const punctuator = getNodePunctuator(node);
      //   // console.log(punctuator);
      //   // if (punctuator) {
      //   // text = text.replace(nextSibling.value, '');
      //   // }
      //   acc.push(fixer.remove(nextSibling));
      //   // } else {
      //   //   acc.push(fixer.remove(nextSibling));
      // } else {
      //   console.log(`|${text}${nextSibling.value}|`);
      // }

      if (/* node === replaceNode &&  */ nextSibling) {
        // console.log(nextSibling === punctuator);

        // console.log(nextSibling.type, nextSibling.value);

        // if (nextSibling.type === 'Punctuator' && nextSibling.value !== '}') {

        // }

        if (
          nextSibling.type === 'Punctuator'
          /*  &&
          !text.endsWith(nextSibling.value) */
        ) {
          // If this isn't the last node in the list, append a new punctuator
          // if (sortedBody.indexOf(node) !== sortedBody.length - 1) {
          //   text += getMemberPunctuatorText(node);
          // }

          // console.log(nextSibling.value);

          /* if (nextSibling.value !== '}') {
            acc.push(fixer.remove(nextSibling));
            // console.log(`|${text}${nextSibling.value}|`);
          } else {
            console.log(`|${text}${nextSibling.value}|`);
          } */

          // console.log(`|${text}${nextSibling.value}|`);

          if (nextSibling.value === '}') {
            // console.log(`|${text}|`);
            if (sortedBody.indexOf(node) !== sortedBody.length - 1) {
              // console.log(getNodePunctuator(node));
              // console.log(sortedBody.indexOf(node), body.indexOf(node));
              // console.log(`|${text}|`);
              if (!/[,;]$/.test(text)) {
                text += getMemberPunctuatorText(node);
              }
            }
            // console.log(
            //   `|${text}${nextSibling.value}|`,
            //   getNodePunctuator(node),
            // );
            // console.dir(node, { depth: 10 });
            // if (text)
          } else {
            //
            if (!/[,;]$/.test(text)) {
              // console.log(
              //   `|${text}|`,
              //   sortedBody.indexOf(node),
              //   body.indexOf(otherNode),
              // );
              // if (sortedBody.indexOf(node) !== sortedBody.length - 1) {
              //   text += getMemberPunctuatorText(node);
              // }
              if (
                sortedBody.indexOf(node) === sortedBody.length - 1 &&
                sortedBody.indexOf(node) === body.indexOf(otherNode)
              ) {
                // console.log(
                //   `|${text}|`,
                //   sortedBody.indexOf(node),
                //   body.indexOf(otherNode),
                // );
              } else {
                text += getMemberPunctuatorText(node);
              }
              acc.push(fixer.remove(nextSibling));
            }
          }

          /* if (sortedBody.indexOf(node) !== sortedBody.length - 1) {
            text += getMemberPunctuatorText(node);
          } */

          /* const punctuator = getNodePunctuator(node);

          if (
            // node === currentNode &&
            // !punctuator ||
            punctuator !== nextSibling &&
            /[,;]$/.test(text)
            // text.endsWith(punctuator.value)
          ) {
            console.log(
              sortedBody.indexOf(otherNode) === sortedBody.length - 1,
              `|${text}|`,
              punctuator,
            );
          } */

          // console.log(sortedBody.indexOf(node));

          // if (nextSibling.value !== '}') {
          //   acc.push(fixer.remove(nextSibling));
          //   // text += getMemberPunctuatorText(node);
          //   // } else if (node !== replaceNode) {
          //   //   text += getMemberPunctuatorText(node);
          // }

          // console.log(`|${text}|`);
        } else if (
          sortedBody.indexOf(node) === sortedBody.length - 1 &&
          sortedBody.indexOf(node) === body.indexOf(otherNode)
          // && isInline(node)
        ) {
          // if (/[,;]$/.test(text)) {
          //   console.log(`|${text}${nextSibling.value}|`);
          // }
          // text = text.replace(/[,;]$/, '');
          text = text.replace(/,$/, '');
          // console.log(`|${text}|`);
        }

        // if (text.endsWith(nextSibling.value)) {
        //   // const punctuator = getNodePunctuator(node);
        //   // console.log(punctuator);
        //   // if (punctuator) {
        //   // text = text.replace(nextSibling.value, '');
        //   // }
        //   acc.push(fixer.remove(nextSibling));
        //   // } else {
        //   //   acc.push(fixer.remove(nextSibling));
        // } else {
        //   // console.log(`|${text}${nextSibling.value}|`);
        // }
      }

      // console.log(p);

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

      // if (punctuator || sourceCode.getText(node).endsWith(nextSibling.value)) {
      //   acc.push(fixer.remove(nextSibling));
      // }

      acc.push(fixer.insertTextBefore(otherNode, text), fixer.remove(node));

      // if (nextSibling && text.endsWith(nextSibling.value)) {
      //   // console.log(nextSibling);
      //   acc.push(fixer.remove(nextSibling));
      // }

      // if (nextSibling.value !== '}') {
      //   acc.push(fixer.remove(nextSibling));
      // }

      acc.push(...comments.map(n => fixer.removeRange(getLineRange(n))));

      return acc;
    }, []);

    // console.log(R);

    return R;
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
