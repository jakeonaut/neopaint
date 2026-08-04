import React, { useCallback, useContext, useMemo } from "react";
import { CursorPosition, InputMode, NoteId, pianoRollKeys, zIndex_rectSelect, getRelativeBeatWidth, getMidiBeatFromGridBeat } from "../consts";
import { UserInstrumentContext } from "../contexts/UserInstrumentContextProvider";
import { CompositionContext } from "../contexts/CompositionContextProvider";
import { SubdivisionTypeContext } from "../contexts/SubdivisionTypeContextProvider";
import { PlacedNote } from "./PlacedNote";
import { toMidi } from "../../smplr/smplr/midi";
import styled from "styled-components";
import { MouseDownContext } from "../contexts/MouseDownContextProvider";
import { ClickedSelectedNotesContext } from "../contexts/ClickedSelectedNotesContextProvider";
import { CompositionActionsContext } from "../contexts/CompositionActionsContextProvider";
import { BeatSizeContext } from "../contexts/BeatSizeContextProvider";


const PlacedNotesOverlay = styled.div<{ $shouldMouseIgnoreMe: boolean }>`
  position: sticky;
  pointer-events: ${({ $shouldMouseIgnoreMe }) => $shouldMouseIgnoreMe ? 'none' : 'unset' };
  touch-action: ${({ $shouldMouseIgnoreMe }) => $shouldMouseIgnoreMe ? 'none' : 'manipulation' };
  z-index: 1;
`;

const PlacedNotesOffset = styled.div`
  position: relative;
  top: 16px;
  left: 30px;
`;

const RectSelector = styled.div<{ $left: number, $top: number, $width: number, $height: number }>`
  background: #76feff54;
  outline: 1px dashed #004cff54;
  position: absolute;
  left: ${({ $left }) => `${$left}px`};
  top: ${({ $top }) => `${$top}px`};
  width: ${({ $width }) => `${$width}px`};
  height: ${({ $height }) => `${$height}px`};
  z-index: ${zIndex_rectSelect};
  pointer-events: none;
`;

function StaticPlacedNotes({
  handlePlacedNoteMouseDown,
}: {
  handlePlacedNoteMouseDown: (e: React.PointerEvent<HTMLDivElement>, noteId: NoteId) => void
}) {
  const { _userInstruments } = useContext(UserInstrumentContext)!;
  const {
    _composition,
  } = useContext(CompositionContext)!;
  const {
    _compositionByInstructionIdRef,
  } = useContext(CompositionActionsContext)!;
  const {
    _clickedNote,
    _selectedNotes,
  } = useContext(ClickedSelectedNotesContext)!;
  const clickedNote = useMemo(
    () => _clickedNote ? _compositionByInstructionIdRef.current[_clickedNote.toString()] : undefined,
    [_clickedNote, _compositionByInstructionIdRef]);
  const topmostMidiNote = useMemo(() => toMidi(pianoRollKeys[0])!, []);

  const isNoteSelected = useCallback((noteId: NoteId) => {
    return !!Object.keys(_selectedNotes).find((n) => parseInt(n) === noteId);
  }, [_selectedNotes]);
    
  return (<>
    {/* STATIC(ISH) PLACED NOTES */}
    {Object.entries(_composition).map(([_, notesPerBeat]) =>
      Object.entries(notesPerBeat).map(([_, instrumentInstructions]) => 
        Object.values(instrumentInstructions).map((instrumentInstruction) => {
          if (clickedNote && (instrumentInstruction.noteId === clickedNote.noteId || isNoteSelected(instrumentInstruction.noteId))) {
            return null;
          }
          const userInstrument = _userInstruments[instrumentInstruction.userInstrumentIndex];
          const bgColor = userInstrument.color ?? 'gray';
          const visible = userInstrument.visible ?? true;
          return (<PlacedNote
            key={instrumentInstruction.noteId}
            topmostMidiNote={topmostMidiNote}
            bgColor={bgColor}
            visible={visible}
            instrumentInstruction={instrumentInstruction}
            onMouseDown={handlePlacedNoteMouseDown}
            isNoteSelected={isNoteSelected(instrumentInstruction.noteId)}
          />);
        })))}
  </>);
}

function CreatedNote({
  _inputMode,
  _cursorPosition,
  _startingCursorPos,
}: {
  _inputMode: InputMode,
  _cursorPosition: CursorPosition | undefined,
  _startingCursorPos: CursorPosition | undefined,
}) {
  const {
    _userInstruments,
    _userInstrumentIndex,
  } = useContext(UserInstrumentContext)!;
  const { _clickedNote } = useContext(ClickedSelectedNotesContext)!;
  const { _subdivisionType } = useContext(SubdivisionTypeContext)!;
  const { _isTemporaryTouchStart } = useContext(MouseDownContext)!;
  const topmostMidiNote = useMemo(() => toMidi(pianoRollKeys[0])!, []);
  const userInstrument = _userInstruments[_userInstrumentIndex];

  return (<>
    {/* DRAGGING TO CREATE A NEW NOTE */}
    {_inputMode === InputMode.DEFAULT
      && _startingCursorPos
      && _cursorPosition
      && !_clickedNote
      && !_isTemporaryTouchStart
      && (
        <PlacedNote
          topmostMidiNote={topmostMidiNote}
          bgColor={userInstrument.color ?? "gray"}
          visible={userInstrument.visible}
          instrumentInstruction={{
            noteId: -1,
            midiBeat: getMidiBeatFromGridBeat(Math.min(_cursorPosition.midiBeat, _startingCursorPos.midiBeat), _subdivisionType, _subdivisionType),
            midiNote: _cursorPosition.midiNote,
            noteWidth: Math.abs(_startingCursorPos.midiBeat - _cursorPosition.midiBeat) + 1,
            subdivisionType: _subdivisionType,
            userInstrumentIndex: _userInstrumentIndex,
          }}
          isClickedNote
        />
      )}
  </>);
}

function DraggingExistingNote({
  _inputMode,
  _cursorXOffset,
  _cursorPosition,
  _startingCursorPos,
}: {
  _inputMode: InputMode,
  _cursorXOffset: number,
  _cursorPosition: CursorPosition | undefined,
  _startingCursorPos: CursorPosition | undefined,
}) {
  const { _userInstruments } = useContext(UserInstrumentContext)!;
  const {
    _compositionByInstructionIdRef,
  } = useContext(CompositionActionsContext)!;
  const {
    _clickedNote,
    _selectedNotes,
  } = useContext(ClickedSelectedNotesContext)!;
  const { 
    _subdivisionType,
  } = useContext(SubdivisionTypeContext)!;
  const clickedNote = useMemo(
    () => _clickedNote ? _compositionByInstructionIdRef.current[_clickedNote.toString()] : undefined,
    [_clickedNote, _compositionByInstructionIdRef]);
  const topmostMidiNote = useMemo(() => toMidi(pianoRollKeys[0])!, []);

  const isNoteSelected = useCallback((noteId: NoteId) => {
    return !!Object.keys(_selectedNotes).find((n) => parseInt(n) === noteId);
  }, [_selectedNotes]);
  
  const clickedNoteUserInstrument = clickedNote ? _userInstruments[clickedNote.userInstrumentIndex] : undefined;

  return (<>
    {/* DRAGGING EXISTING NOTE */}
    {_inputMode === InputMode.DEFAULT
      && _startingCursorPos
      && _cursorPosition
      && clickedNote
      && clickedNoteUserInstrument
      && (
        <>
          <PlacedNote
            topmostMidiNote={topmostMidiNote}
            bgColor={clickedNoteUserInstrument.color}
            visible={clickedNoteUserInstrument.visible}
            instrumentInstruction={{
              noteId: clickedNote.noteId,
              midiBeat: getMidiBeatFromGridBeat(_cursorPosition.midiBeat + _cursorXOffset, _subdivisionType, clickedNote.subdivisionType),
              midiNote: _cursorPosition.midiNote,
              noteWidth: clickedNote.noteWidth,
              subdivisionType: clickedNote.subdivisionType,
              userInstrumentIndex: clickedNote.userInstrumentIndex,
            }}
            isNoteSelected={isNoteSelected(clickedNote.noteId)}
            isClickedNote
          />
          {Object.entries(_selectedNotes).map(([noteId, noteWithOffset]) => {
            const instrumentInstructionWithOffset = _compositionByInstructionIdRef.current[noteId];
            const userInstrument = _userInstruments[instrumentInstructionWithOffset.userInstrumentIndex];
            return (noteId !== clickedNote.toString()
            && (<PlacedNote
              key={noteId}
              topmostMidiNote={topmostMidiNote}
              bgColor={userInstrument.color}
              visible={userInstrument.visible}
              instrumentInstruction={{
                noteId: instrumentInstructionWithOffset.noteId,
                midiBeat: getMidiBeatFromGridBeat(
                  _cursorPosition.midiBeat + _cursorXOffset + noteWithOffset.offset.x, 
                  _subdivisionType, 
                  instrumentInstructionWithOffset.subdivisionType
                ),
                midiNote: _cursorPosition.midiNote - noteWithOffset.offset.y,
                noteWidth: instrumentInstructionWithOffset.noteWidth,
                subdivisionType: instrumentInstructionWithOffset.subdivisionType,
                userInstrumentIndex: instrumentInstructionWithOffset.userInstrumentIndex,
              }}
              isNoteSelected
              isClickedNote
            />
            ))
          })}
        </>
      )}
  </>);
}

function DraggingRectSelector({
  _inputMode,
  _cursorPosition,
  _startingCursorPos,
}: {
  _inputMode: InputMode,
  _cursorPosition: CursorPosition | undefined,
  _startingCursorPos: CursorPosition | undefined,
}) {
  const { _beatWidth, _beatHeight } = useContext(BeatSizeContext)!;
  const { _subdivisionType } = useContext(SubdivisionTypeContext)!;
  const beatWidth = useMemo(() => getRelativeBeatWidth(_subdivisionType, _beatWidth), [_subdivisionType, _beatWidth]);

  const topmostMidiNote = useMemo(() => toMidi(pianoRollKeys[0])!, []);
  
  return (<>
    {/* DRAGGING THE RECT SELECTOR TO SELECT PLACED NOTES */}
    {_inputMode === InputMode.SELECT
      && _startingCursorPos
      && _cursorPosition
      // && Math.min(_cursorPosition.midiBeat, _startingCursorPos.midiBeat) === index
      // && Math.max(toMidi(_cursorPosition.midiNote)!, toMidi(_startingCursorPos.midiNote)!) === toMidi(midiNote)
      && (
        <RectSelector
          $left={1 + ((Math.min(_cursorPosition.midiBeat, _startingCursorPos.midiBeat) - 1) * beatWidth)}
          $top={1 + ((Math.min(
            topmostMidiNote - _cursorPosition.midiNote, 
            topmostMidiNote - _startingCursorPos.midiNote
          )) * (_beatHeight - 1))}
          $width={(Math.abs(_startingCursorPos.midiBeat - _cursorPosition.midiBeat) + 1) * beatWidth - 1}
          $height={(Math.abs(toMidi(_startingCursorPos.midiNote)! - toMidi(_cursorPosition.midiNote)!) + 1) * (_beatHeight - 1) - 1}
        />
      )}
  </>);
}

export function AllRenderedNotes({
  _inputMode,
  _cursorXOffset,
  _cursorPosition,
  _startingCursorPos,
  handlePlacedNoteMouseDown,
}: {
  _inputMode: InputMode,
  _cursorXOffset: number,
  _cursorPosition: CursorPosition | undefined,
  _startingCursorPos: CursorPosition | undefined,
  handlePlacedNoteMouseDown: (e: React.PointerEvent<HTMLDivElement>, noteId: NoteId) => void
}) {
  const { _isCompositionMouseDown: _isMouseDown } = useContext(MouseDownContext)!;

  const staticPlacedNotes = useMemo(
    () => <StaticPlacedNotes handlePlacedNoteMouseDown={handlePlacedNoteMouseDown} />,
    [handlePlacedNoteMouseDown]);
  const createdNote = useMemo(
    () => <CreatedNote _inputMode={_inputMode} _cursorPosition={_cursorPosition} _startingCursorPos={_startingCursorPos} />,
    [_cursorPosition, _inputMode, _startingCursorPos]);
  const draggingExistingNote = useMemo(
    () => <DraggingExistingNote _inputMode={_inputMode} _cursorXOffset={_cursorXOffset} _cursorPosition={_cursorPosition} _startingCursorPos={_startingCursorPos} />,
    [_cursorPosition, _cursorXOffset, _inputMode, _startingCursorPos]);
  const draggingRectSelector = useMemo(
    () => <DraggingRectSelector _inputMode={_inputMode} _cursorPosition={_cursorPosition} _startingCursorPos={_startingCursorPos} />,
    [_cursorPosition, _inputMode, _startingCursorPos]);
  return (
    <PlacedNotesOverlay $shouldMouseIgnoreMe={_isMouseDown || _inputMode === InputMode.SELECT}>
      <PlacedNotesOffset>
        {staticPlacedNotes}
        {createdNote}
        {draggingExistingNote}
        {draggingRectSelector}
      </PlacedNotesOffset>
    </PlacedNotesOverlay>
  );
}