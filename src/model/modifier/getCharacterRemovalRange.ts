/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+draft_js
 */

import {EntityMap} from '../immutable/EntityMap';
import {
  getEndOffset,
  getStartOffset,
  SelectionState,
} from '../immutable/SelectionState';
import {DraftRemovalDirection} from '../constants/DraftRemovalDirection';
import {getEntityAt} from '../immutable/ContentBlock';
import getRangesForDraftEntity from './getRangesForDraftEntity';
import invariant from '../../fbjs/invariant';
import DraftEntitySegments from './DraftEntitySegments';
import {BlockNode} from '../immutable/BlockNode';

/**
 * Given a SelectionState and a removal direction, determine the entire range
 * that should be removed from a ContentState. This is based on any entities
 * within the target, with their `mutability` values taken into account.
 *
 * For instance, if we are attempting to remove part of an "immutable" entity
 * range, the entire entity must be removed. The returned `SelectionState`
 * will be adjusted accordingly.
 */
function getCharacterRemovalRange(
  entityMap: EntityMap,
  startBlock: BlockNode,
  endBlock: BlockNode,
  selectionState: SelectionState,
  direction: DraftRemovalDirection,
): SelectionState {
  const start = getStartOffset(selectionState);
  const end = getEndOffset(selectionState);
  const startEntityKey = getEntityAt(startBlock, start);
  const endEntityKey = getEntityAt(endBlock, end - 1);
  if (!startEntityKey && !endEntityKey) {
    return selectionState;
  }
  let newSelectionState = selectionState;
  if (startEntityKey && startEntityKey === endEntityKey) {
    newSelectionState = getEntityRemovalRange(
      entityMap,
      startBlock,
      newSelectionState,
      direction,
      startEntityKey,
      true,
      true,
    );
  } else if (startEntityKey && endEntityKey) {
    const startSelectionState = getEntityRemovalRange(
      entityMap,
      startBlock,
      newSelectionState,
      direction,
      startEntityKey,
      false,
      true,
    );
    const endSelectionState = getEntityRemovalRange(
      entityMap,
      endBlock,
      newSelectionState,
      direction,
      endEntityKey,
      false,
      false,
    );
    newSelectionState = {
      ...newSelectionState,
      anchorOffset: startSelectionState.anchorOffset,
      focusOffset: endSelectionState.focusOffset,
      isBackward: false,
    };
  } else if (startEntityKey) {
    const startSelectionState = getEntityRemovalRange(
      entityMap,
      startBlock,
      newSelectionState,
      direction,
      startEntityKey,
      false,
      true,
    );
    newSelectionState = {
      ...newSelectionState,
      anchorOffset: getStartOffset(startSelectionState),
      isBackward: false,
    };
  } else if (endEntityKey) {
    const endSelectionState = getEntityRemovalRange(
      entityMap,
      endBlock,
      newSelectionState,
      direction,
      endEntityKey,
      false,
      false,
    );
    newSelectionState = {
      ...newSelectionState,
      focusOffset: getEndOffset(endSelectionState),
      isBackward: false,
    };
  }
  return newSelectionState;
}

function getEntityRemovalRange(
  entityMap: EntityMap,
  block: BlockNode,
  selectionState: SelectionState,
  direction: DraftRemovalDirection,
  entityKey: string,
  isEntireSelectionWithinEntity: boolean,
  isEntityAtStart: boolean,
): SelectionState {
  let start = getStartOffset(selectionState);
  let end = getEndOffset(selectionState);
  const entity = entityMap.__get(entityKey);
  const mutability = entity.mutability;
  const sideToConsider = isEntityAtStart ? start : end;

  // `MUTABLE` entities can just have the specified range of text removed
  // directly. No adjustments are needed.
  if (mutability === 'MUTABLE') {
    return selectionState;
  }

  // Find the entity range that overlaps with our removal range.
  const entityRanges = getRangesForDraftEntity(block, entityKey).filter(
    range => sideToConsider <= range.end && sideToConsider >= range.start,
  );

  invariant(
    entityRanges.length == 1,
    'There should only be one entity range within this removal range.',
  );

  const entityRange = entityRanges[0];

  // For `IMMUTABLE` entity types, we will remove the entire entity range.
  if (mutability === 'IMMUTABLE') {
    return {
      ...selectionState,
      anchorOffset: entityRange.start,
      focusOffset: entityRange.end,
      isBackward: false,
    };
  }

  // For `SEGMENTED` entity types, determine the appropriate segment to
  // remove.
  if (!isEntireSelectionWithinEntity) {
    if (isEntityAtStart) {
      end = entityRange.end;
    } else {
      start = entityRange.start;
    }
  }

  const removalRange = DraftEntitySegments.getRemovalRange(
    start,
    end,
    block.text.slice(entityRange.start, entityRange.end),
    entityRange.start,
    direction,
  );

  return {
    ...selectionState,
    anchorOffset: removalRange.start,
    focusOffset: removalRange.end,
    isBackward: false,
  };
}
export default getCharacterRemovalRange;
