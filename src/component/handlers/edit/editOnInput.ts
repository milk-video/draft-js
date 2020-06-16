/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+draft_js
 */

import UserAgent from 'fbjs/lib/UserAgent';
import {
  EditorState,
  getBlockTree,
  pushContent,
} from '../../../model/immutable/EditorState';
import keyCommandPlainBackspace from './commands/keyCommandPlainBackspace';
import DraftEditor from '../../base/DraftEditor.react';
import {SyntheticInputEvent} from '../../utils/eventTypes';
import {SelectionObject} from '../../utils/DraftDOMTypes';
import {nullthrows} from '../../../fbjs/nullthrows';
import findAncestorOffsetKey from '../../selection/findAncestorOffsetKey';
import DraftOffsetKey from '../../selection/DraftOffsetKey';
import {getBlockForKey, getEntity} from '../../../model/immutable/ContentState';
import {notEmptyKey} from '../../utils/draftKeyUtils';
import {
  getEntityAt,
  getInlineStyleAt,
} from '../../../model/immutable/ContentBlockNode';
import DraftModifier from '../../../model/modifier/DraftModifier';
import {
  getEndOffset,
  getStartOffset,
} from '../../../model/immutable/SelectionState';

const isGecko = UserAgent.isEngine('Gecko');

const DOUBLE_NEWLINE = '\n\n';

function onInputType(inputType: string, editorState: EditorState): EditorState {
  switch (inputType) {
    case 'deleteContentBackward':
      return keyCommandPlainBackspace(editorState);
  }
  return editorState;
}

/**
 * This function serves two purposes
 *
 * 1. To update the editorState and call onChange method with the new
 * editorState. This editorState is calculated in editOnBeforeInput but the
 * onChange method is not called with the new state until this method does it.
 * It is done to handle a specific case where certain character inputs might
 * be replaced with something else. E.g. snippets ('rc' might be replaced
 * with boilerplate code for react component). More information on the
 * exact problem can be found here -
 * https://github.com/facebook/draft-js/commit/07892ba479bd4dfc6afd1e0ed179aaf51cd138b1
 *
 * 2. intended to handle spellcheck and autocorrect changes,
 * which occur in the DOM natively without any opportunity to observe or
 * interpret the changes before they occur.
 *
 * The `input` event fires in contentEditable elements reliably for non-IE
 * browsers, immediately after changes occur to the editor DOM. Since our other
 * handlers override or otherwise handle cover other varieties of text input,
 * the DOM state should match the model in all controlled input cases. Thus,
 * when an `input` change leads to a DOM/model mismatch, the change should be
 * due to a spellcheck change, and we can incorporate it into our model.
 */
export default function editOnInput(
  editor: DraftEditor,
  e: SyntheticInputEvent,
): void {
  if (editor._pendingStateFromBeforeInput !== undefined) {
    editor.update(editor._pendingStateFromBeforeInput);
    editor._pendingStateFromBeforeInput = undefined;
  }
  // at this point editor is not null for sure (after input)
  const castedEditorElement: HTMLElement = editor.editor as any;
  const domSelection = castedEditorElement.ownerDocument.defaultView!.getSelection() as SelectionObject;

  const {anchorNode, isCollapsed} = domSelection;
  const isNotTextOrElementNode =
    // Auto generated from flowToTs. Please clean me!
    (anchorNode === null || anchorNode === undefined
      ? undefined
      : anchorNode.nodeType) !== Node.TEXT_NODE &&
    // Auto generated from flowToTs. Please clean me!
    (anchorNode === null || anchorNode === undefined
      ? undefined
      : anchorNode.nodeType) !== Node.ELEMENT_NODE;

  if (anchorNode == null || isNotTextOrElementNode) {
    // TODO: (t16149272) figure out context for this change
    return;
  }

  if (
    anchorNode.nodeType === Node.TEXT_NODE &&
    (anchorNode.previousSibling !== null || anchorNode.nextSibling !== null)
  ) {
    // When typing at the beginning of a visual line, Chrome splits the text
    // nodes into two. Why? No one knows. This commit is suspicious:
    // https://chromium.googlesource.com/chromium/src/+/a3b600981286b135632371477f902214c55a1724
    // To work around, we'll merge the sibling text nodes back into this one.
    const span = anchorNode.parentNode;
    if (span == null) {
      // Handle null-parent case.
      return;
    }
    anchorNode.nodeValue = span.textContent;
    for (
      let child = span.firstChild;
      child != null;
      child = child.nextSibling
    ) {
      if (child !== anchorNode) {
        span.removeChild(child);
      }
    }
  }

  let domText = anchorNode.textContent || '';
  const editorState = editor._latestEditorState;
  const offsetKey = nullthrows(findAncestorOffsetKey(anchorNode));
  const {blockKey, decoratorKey, leafKey} = DraftOffsetKey.decode(offsetKey);

  const {start, end} = getBlockTree(editorState, blockKey)?.[
    decoratorKey
  ]?.leaves?.[leafKey];

  const content = editorState.currentContent;
  const block = getBlockForKey(content, blockKey);
  const modelText = block.text.slice(start, end);

  // Special-case soft newlines here. If the DOM text ends in a soft newline,
  // we will have manually inserted an extra soft newline in DraftEditorLeaf.
  // We want to remove this extra newline for the purpose of our comparison
  // of DOM and model text.
  if (domText.endsWith(DOUBLE_NEWLINE)) {
    domText = domText.slice(0, -1);
  }

  // No change -- the DOM is up to date. Nothing to do here.
  if (domText === modelText) {
    // This can be buggy for some Android keyboards because they don't fire
    // standard onkeydown/pressed events and only fired editOnInput
    // so domText is already changed by the browser and ends up being equal
    // to modelText unexpectedly.
    // Newest versions of Android support the dom-inputevent-inputtype
    // and we can use the `inputType` to properly apply the state changes.

    /* $FlowFixMe inputType is only defined on a draft of a standard.
     * https://w3c.github.io/input-events/#dom-inputevent-inputtype */
    const inputType = (e.nativeEvent as any).inputType;
    if (inputType) {
      const newEditorState = onInputType(inputType, editorState);
      if (newEditorState !== editorState) {
        editor.restoreEditorDOM();
        editor.update(newEditorState);
        return;
      }
    }
    return;
  }

  const selection = editorState.selection;

  // We'll replace the entire leaf with the text content of the target.
  const targetRange = {
    ...selection,
    anchorOffset: start,
    focusOffset: end,
    isBackward: false,
  };

  const entityKey = getEntityAt(block, start);
  const entity = notEmptyKey(entityKey) ? getEntity(entityKey) : null;
  const entityType = entity != null ? entity.mutability : null;
  const preserveEntity = entityType === 'MUTABLE';

  // Immutable or segmented entities cannot properly be handled by the
  // default browser undo, so we have to use a different change type to
  // force using our internal undo method instead of falling through to the
  // native browser undo.
  const changeType = preserveEntity ? 'spellcheck-change' : 'apply-entity';

  const newContent = DraftModifier.replaceText(
    content,
    targetRange,
    domText,
    getInlineStyleAt(block, start),
    preserveEntity ? getEntityAt(block, start) : null,
  );

  let anchorOffset, focusOffset, startOffset, endOffset;

  if (isGecko) {
    // Firefox selection does not change while the context menu is open, so
    // we preserve the anchor and focus values of the DOM selection.
    anchorOffset = domSelection.anchorOffset;
    focusOffset = domSelection.focusOffset;
    startOffset = start + Math.min(anchorOffset, focusOffset);
    endOffset = startOffset + Math.abs(anchorOffset - focusOffset);
    anchorOffset = startOffset;
    focusOffset = endOffset;
  } else {
    // Browsers other than Firefox may adjust DOM selection while the context
    // menu is open, and Safari autocorrect is prone to providing an inaccurate
    // DOM selection. Don't trust it. Instead, use our existing SelectionState
    // and adjust it based on the number of characters changed during the
    // mutation.
    const charDelta = domText.length - modelText.length;
    startOffset = getStartOffset(selection);
    endOffset = getEndOffset(selection);

    anchorOffset = isCollapsed ? endOffset + charDelta : startOffset;
    focusOffset = endOffset + charDelta;
  }

  // Segmented entities are completely or partially removed when their
  // text content changes. For this case we do not want any text to be selected
  // after the change, so we are not merging the selection.
  const contentWithAdjustedDOMSelection = {
    ...newContent,
    selectionBefore: content.selectionAfter,
    selectionAfter: {...selection, anchorOffset, focusOffset},
  };

  editor.update(
    pushContent(editorState, contentWithAdjustedDOMSelection, changeType),
  );
}
