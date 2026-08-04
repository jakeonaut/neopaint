import React, { CSSProperties, useCallback, useContext, useMemo } from "react";
import styled from "styled-components";
import { zIndex_placedNote, zIndex_selectedNote, zIndex_clickedNote, InstrumentInstruction, SubdivisionType, NoteId, getRelativeBeatWidth } from "../consts";
import { BeatSizeContext } from "../contexts/BeatSizeContextProvider";

const StyledNote = styled.div<{
  $width: number,
  $height: number,
  $top: number,
  $left: number,
  $bgColor: string,
  $visible: boolean,
  $shouldMouseIgnoreMe: boolean | undefined,
  $isClickedNote?: boolean,
  $isNoteSelected?: boolean,
}>`
  cursor: pointer;
  width: ${({ $width }) => `${$width}px`};
  height: ${({ $height }) => `${$height}px`};
  content: " ";
  background-color: ${({ $bgColor }) => $bgColor};
  position: absolute;
  left: ${({ $left }) => `${$left}px` };
  top: ${({ $top }) => `${$top}px` };
  z-index: ${({ $isClickedNote, $isNoteSelected }) => $isClickedNote
    ? zIndex_clickedNote
    : $isNoteSelected
      ? zIndex_selectedNote
      : zIndex_placedNote };
  border-radius: 0;
  box-shadow: ${({ $isClickedNote, $isNoteSelected }) => `0px 0px 0px ${
    $isNoteSelected ? '1px blue' : '1px black'
  }${
    $isNoteSelected
      ? $isClickedNote ? '' : ', 2px 2px 0px 0px blue'
      : $isClickedNote ? ', 2px 2px 0px 0px black' : ''
  }` };
  opacity: ${({ $visible }) => `${$visible ? '1.0' : '0.5'}`};
`;

export function PlacedNote({
  children,
  topmostMidiNote,
  bgColor,
  visible,
  instrumentInstruction,
  shouldMouseIgnoreMe,
  onMouseDown,
  isClickedNote,
  isNoteSelected,
  style,
}: {
  children?: React.ReactNode
  topmostMidiNote: number;
  bgColor: string;
  visible: boolean;
  instrumentInstruction: InstrumentInstruction,
  shouldMouseIgnoreMe?: boolean;
  onMouseDown?: (e: React.PointerEvent<HTMLDivElement>, noteId: NoteId) => void
  isClickedNote?: boolean;
  isNoteSelected?: boolean;
  style?: CSSProperties
}) {
  const { _beatWidth, _beatHeight } = useContext(BeatSizeContext)!;
  const { midiBeat, midiNote, noteWidth, subdivisionType } = instrumentInstruction;
  const beatWidth = getRelativeBeatWidth(subdivisionType, _beatWidth);
  
  const shouldWiggleShift = ((isClickedNote && !isNoteSelected) || (isNoteSelected && !isClickedNote));
  const topShift = shouldWiggleShift ? -1 : 0
  const y = (topmostMidiNote - midiNote) * (_beatHeight - 1);
  const top = y + 1 + topShift;

  const leftShift = shouldWiggleShift ? -1 : 0;
  const x = (midiBeat - 1) * _beatWidth;
  const tripletLeftShift = subdivisionType === SubdivisionType.t ? (_beatWidth / 3) * ((midiBeat - 1) % 4) : 0;
  const left = x + 1 + leftShift + tripletLeftShift;
  const noteId = useMemo(() => instrumentInstruction.noteId, [instrumentInstruction.noteId]);
  const handleMouseDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => onMouseDown?.(e, noteId),
    [onMouseDown, noteId]
  );
  const handleDoubleClick = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      return false;
    }, [] 
  );
  return (
    <StyledNote
      $bgColor={bgColor}
      $visible={visible}
      $shouldMouseIgnoreMe={shouldMouseIgnoreMe}
      $isNoteSelected={isNoteSelected}
      $top={top}
      $left={left}
      $width={noteWidth * beatWidth - 1}
      $height={_beatHeight - 2}
      $isClickedNote={isClickedNote}
      onPointerDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      style={style}>
      {children}
    </StyledNote>
  );
}