import React, { CSSProperties, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioContextContext,
  CursorPosition,
  getRelativeBeatWidth,
  getGridBeatFromMidiBeat,
  getMidiBeatFromGridBeat,
  getPlacedNotesFromComposition,
  InputMode,
  MidiBeat,
  MidiNoteNum,
  NoteId,
  NoteIdWithOffset,
  pianoRollKeys,
  zIndex_resetPlayheadButton,
  getStartOfMeasureFromBeat,
  getEndOfMeasureFromBeat,
  DOUBLE_CLICK_SECOND_BUFFER,
  InstrumentInstruction,
  TOUCH_SCROLL_SECOND_BUFFER,
  distBetween,
  TOUCH_SCROLL_PIXEL_DELTA_BUFFER,
  windowSetTimeout,
  triggerTimeoutEarly,
} from "../consts";
import styled from "styled-components";
import { toMidi } from "../../smplr/smplr/midi";
import { UserInstrumentContext } from "../contexts/UserInstrumentContextProvider";
import _ from "lodash";
import { CompositionGrid } from "./CompositionGrid";
import { SubdivisionTypeContext } from "../contexts/SubdivisionTypeContextProvider";
import { PristineContext } from "../contexts/PristineContextProvider";
import { AllRenderedNotes } from "./AllRenderedNotes";
import { PlayheadContext } from "../contexts/PlayheadContextProvider";
import { MouseDownContext } from "../contexts/MouseDownContextProvider";
import { ClickedSelectedNotesContext } from "../contexts/ClickedSelectedNotesContextProvider";
import { CompositionActionsContext } from "../contexts/CompositionActionsContextProvider";
import { useThrottledCallback } from "use-debounce";
import { BeatSizeContext } from "../contexts/BeatSizeContextProvider";
import { TimeSignatureContext } from "../contexts/TimeSignatureContextProvider";
import { UndoRedoContext } from "../contexts/UndoRedoContextProvider";
import { PlayTheSongContext } from "../contexts/PlayTheSongContextProvider";

const CompositionContainer = styled.div`
  display: flex; 
  flex-direction: column;
  position: relative;
  flex-grow: 1;
  min-height: 0;
`;

const CompositionGridContainer = styled.div`
  overflow: auto;
  overscroll-behavior: contain;
  border-bottom: 2px solid black;
  width: calc(100% - 1px);
  margin-bottom: 2px;
  -webkit-tap-highlight-color: transparent;
`;

const PianoRollKeysContainer = styled.div`
  display: flex;
  flex-direction: column;
  position: sticky;
  left: 0px;
  z-index: 2;
`;

const PianoRollKeysSubContainer = styled.div<{ $beatHeight: number }>`
  position: absolute;
  top: 16px;
  border-top: 1px solid black;
`;

export function CompositionCanvas({
  children: playheadNode,
  _inputMode,
  inputModeRef,
  setInputMode,
}: {
  children: React.ReactNode,
  _inputMode: InputMode,
  inputModeRef: React.RefObject<InputMode>;
  setInputMode: (inputMode: InputMode) => void;
}) {
  const [dontScrollForNow, setDontScrollForNow] = useState(false);
  const audioContext = useContext(AudioContextContext)!;
  const {
    userInstrumentsRef,
    userInstrumentIndexRef,
    setUserInstrumentIndex,
  } = useContext(UserInstrumentContext)!;
  const { setPristine } = useContext(PristineContext)!;
  const {
    compositionRef,
    _compositionByInstructionIdRef,
  } = useContext(CompositionActionsContext)!;
  const {incrementBabyDanceFrame} = useContext(PlayTheSongContext)!;
  const { timeSignatureRef } = useContext(TimeSignatureContext)!;
  const {
    isCompositionMouseDownRef: isMouseDownRef,
    setIsCompositionMouseDown: setIsMouseDown,
    isTemporaryTouchStartRef,
    setIsTemporaryTouchStart,
    whenWasMouseDownedRef,
    onCompositionMouseUpRef,
  } = useContext(MouseDownContext)!;
  const {
    clickedNoteRef, setClickedNote,
    selectedNotesRef, setSelectedNotes,
    toggleSelectionOnNoteSet,
    heldPianoKeys,
    setHeldPianoKeys,
  } = useContext(ClickedSelectedNotesContext)!;
  const {
    addCompositionNotes,
    removeCompositionNotes,
  } = useContext(CompositionActionsContext)!;
  const { 
    _subdivisionType,
    subdivisionTypeRef,
    setSubdivisionType,
  } = useContext(SubdivisionTypeContext)!;
  const {
    _userPlayheadBounds,
    userPlayheadBoundsRef,
    setUserPlayheadBounds,
  } = useContext(PlayheadContext)!;
  const { addToUndoStack } = useContext(UndoRedoContext)!;
  const { _beatWidth, _beatHeight } = useContext(BeatSizeContext)!;
  const pianoKeyWidth = 30;
  const beatWidth = useMemo(() => getRelativeBeatWidth(_subdivisionType, _beatWidth), [_subdivisionType, _beatWidth]);
  
  const [_cursorXOffset, _setCursorXOffset] = useState(0);
  const [_cursorPosition, _setCursorPosition] = useState<
    CursorPosition | undefined
  >();
  const [_startingCursorPos, _setStartingCursorPos] = useState<
    CursorPosition | undefined
  >();

  const cursorXOffsetRef = useRef(_cursorXOffset);
  const hasMouseMovedRef = useRef(false);
  const cursorPositionRef = useRef(_cursorPosition);
  const startingCursorPosRef = useRef(_startingCursorPos);

  const setCursorXOffset = useCallback((newCursorXOffset: number) => {
    cursorXOffsetRef.current = newCursorXOffset;
    _setCursorXOffset(newCursorXOffset); 
  }, []);
  const setCursorPosition = useCallback((newCursorPosition: CursorPosition | undefined) => {
    if (_.isEqual(cursorPositionRef.current, newCursorPosition)) {
      return;
    }
    cursorPositionRef.current = newCursorPosition;
    _setCursorPosition(newCursorPosition);
  }, []);
  const setStartingCursorPos = useCallback((newStartingCursorPos: CursorPosition | undefined) => {
    if (_.isEqual(startingCursorPosRef.current, newStartingCursorPos)) {
      return;
    }
    startingCursorPosRef.current = newStartingCursorPos;
    _setStartingCursorPos(newStartingCursorPos);
  }, []);

  const isNoteSelected = useCallback((noteId: NoteId) => {
    return !!Object.keys(selectedNotesRef.current).find((n) => parseInt(n) === noteId);
  }, [selectedNotesRef]);

  const handleMouseDown = useCallback(
    (
      e: React.PointerEvent<HTMLDivElement>,
      midiBeat: MidiBeat,
      midiNote: MidiNoteNum,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      onCompositionMouseUpRef.current = undefined;
      if (inputModeRef.current === InputMode.DEFAULT
          && Object.values(selectedNotesRef.current).length > 0
          && (!clickedNoteRef.current || !isNoteSelected(clickedNoteRef.current))) {
        setSelectedNotes({});
        return false;
      }
      if (inputModeRef.current === InputMode.DELETE) {
        prevCompositionByIdWhenIStartedErasingRef.current = {..._compositionByInstructionIdRef.current};
      }
      const secondsSince = (Date.now() - whenWasMouseDownedRef.current) / 1000.0;
      if (secondsSince < DOUBLE_CLICK_SECOND_BUFFER) {
        return false;
      }
      setIsMouseDown(true);
      setCursorPosition({ midiNote, midiBeat: midiBeat - cursorXOffsetRef.current });
      setStartingCursorPos({ midiNote, midiBeat, clientPos: { x: e.clientX, y: e.clientY }});
      if (e.pointerType !== "mouse") {
        setIsTemporaryTouchStart(windowSetTimeout(() => {
          setIsTemporaryTouchStart(undefined);
          setDontScrollForNow(true);
          if (audioContext.state === "suspended") {
            audioContext.resume();
          }
          userInstrumentsRef.current[userInstrumentIndexRef.current].sf2Sampler?.start({ note: midiNote, duration: 0.25 });
        }, TOUCH_SCROLL_SECOND_BUFFER * 1000));
      } else if (e.pointerType === "mouse") {
        if (!clickedNoteRef.current && inputModeRef.current === InputMode.DEFAULT) {
          if (audioContext.state === "suspended") {
            audioContext.resume();
          }
          userInstrumentsRef.current[userInstrumentIndexRef.current].sf2Sampler?.start({ note: midiNote, duration: 0.25 });
        }
      }
      hasMouseMovedRef.current = false;
      return false;
    },
    [onCompositionMouseUpRef, inputModeRef, selectedNotesRef, clickedNoteRef, isNoteSelected, whenWasMouseDownedRef, setIsMouseDown, setIsTemporaryTouchStart, setCursorPosition, setStartingCursorPos, setSelectedNotes, _compositionByInstructionIdRef, audioContext, userInstrumentsRef, userInstrumentIndexRef]
  );
  const justSelectedNoteRef = useRef<InstrumentInstruction | undefined>(undefined);
  const handleDoubleClick = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    midiBeat: MidiBeat,
    midiNote: MidiNoteNum,
  ) => {
    const startOfMeasure = getStartOfMeasureFromBeat(midiBeat, timeSignatureRef.current);
    const endOfMeasure = getEndOfMeasureFromBeat(midiBeat, timeSignatureRef.current);
    const notesInMeasure = {...(Object.entries(_compositionByInstructionIdRef.current).reduce((acc, [noteId, instrumentInstruction]) => {
      if (instrumentInstruction.midiBeat > startOfMeasure && instrumentInstruction.midiBeat <= endOfMeasure) {
        return {
          ...acc,
          [noteId]: {
            noteId: parseInt(noteId),
            offset: { x: 0, y: 0 },
          },
        };
      }
      return acc;
    }, {} as Record<string, NoteIdWithOffset>))};
    if (inputModeRef.current === InputMode.SELECT) {
      // Quickly temporarily reverse the selection of the justSelectedNote so that when we
      // toggle on the set below, it's in the right "state". (otherwise shift double clicking
      // reverses the selection of the clicked on note twice, leaving it unchanged...) 
      if (justSelectedNoteRef.current) {
        const selectedNoteIds = Object.keys(selectedNotesRef.current);
        if (selectedNoteIds.includes(justSelectedNoteRef.current.noteId.toString())) {
          delete selectedNotesRef.current[justSelectedNoteRef.current.noteId.toString()];
        } else {
          selectedNotesRef.current = {
            ...selectedNotesRef.current,
            [justSelectedNoteRef.current.noteId.toString()]: {
              noteId: justSelectedNoteRef.current.noteId,
              offset: { x: 0, y: 0 },
            },
          };
        }
      }
      justSelectedNoteRef.current = undefined;
      toggleSelectionOnNoteSet(notesInMeasure);
    } else if (inputModeRef.current === InputMode.DELETE) {
      removeCompositionNotes(Object.keys(notesInMeasure), true /* shouldAddToUndoStack */);
    }
    return false;
  }, [timeSignatureRef, _compositionByInstructionIdRef, inputModeRef, toggleSelectionOnNoteSet, selectedNotesRef, removeCompositionNotes]);

  const mouseUpCleanup = useCallback((e: PointerEvent, shouldTriggerTimeoutEarly: boolean) => {
    setClickedNote(undefined);
    if (isTemporaryTouchStartRef.current) {
      if (shouldTriggerTimeoutEarly) {
        triggerTimeoutEarly(isTemporaryTouchStartRef.current);
      } else {
        window.clearTimeout(isTemporaryTouchStartRef.current)
      }
    }
    setIsTemporaryTouchStart(undefined);
    setIsMouseDown(false);
    setCursorPosition(undefined);
    setStartingCursorPos(undefined);
    if (e.pointerType === "mouse") {
      if (onCompositionMouseUpRef.current) {
        onCompositionMouseUpRef.current();
      } else if (!e.shiftKey && inputModeRef.current === InputMode.SELECT) {
        setInputMode((e.metaKey || e.ctrlKey) ? InputMode.DELETE : InputMode.DEFAULT);
      } else if (!e.metaKey && !e.ctrlKey && inputModeRef.current === InputMode.DELETE) {
        setInputMode(e.shiftKey ? InputMode.SELECT : InputMode.DEFAULT);
      }
    }
    onCompositionMouseUpRef.current = undefined;
    setCursorXOffset(0);
    hasMouseMovedRef.current = false;
  }, [inputModeRef, isTemporaryTouchStartRef, onCompositionMouseUpRef, setClickedNote, setCursorPosition, setCursorXOffset, setInputMode, setIsMouseDown, setIsTemporaryTouchStart, setStartingCursorPos]);
  const prevCompositionByIdWhenIStartedErasingRef = useRef<{[x: string]: InstrumentInstruction} | undefined>(undefined);
  const handleMouseUp = useCallback(
    (e: PointerEvent) => {
      setDontScrollForNow(false);
      if (isMouseDownRef.current && cursorPositionRef.current && startingCursorPosRef.current) {
        const midiNote = cursorPositionRef.current.midiNote;
        if (inputModeRef.current === InputMode.DEFAULT) {
          if ((!clickedNoteRef.current || hasMouseMovedRef.current)) {
            setPristine(false);
            if (!clickedNoteRef.current) {
              const noteWidth = Math.abs(cursorPositionRef.current.midiBeat - startingCursorPosRef.current.midiBeat) + 1;
              const gridBeat = Math.min(cursorPositionRef.current.midiBeat, startingCursorPosRef.current.midiBeat);
              const midiBeat = getMidiBeatFromGridBeat(gridBeat, subdivisionTypeRef.current, subdivisionTypeRef.current);
              addCompositionNotes(
                [{
                  midiBeat,
                  midiNote,
                  noteWidth,
                  userInstrumentIndex: userInstrumentIndexRef.current,
                  subdivisionType: subdivisionTypeRef.current,
                }],
                true, /* shouldAddToUndoStack */
              );
            } else {
              const clickedNote = _compositionByInstructionIdRef.current[clickedNoteRef.current!.toString()];
              const prevCompositionByInstructionId = {..._compositionByInstructionIdRef.current};
              // We're about to do that at the end of this function, so don't do it here
              const shouldAddToUndoStack = false;
              const instrumentInstructionsById = removeCompositionNotes(
                [
                  clickedNoteRef.current.toString(),
                  ...Object.keys(selectedNotesRef.current).filter((noteId) => noteId !== clickedNoteRef.current!.toString()),
                ],
                shouldAddToUndoStack, /* false */
              );
              const gridBeat = cursorPositionRef.current.midiBeat + cursorXOffsetRef.current;
              const midiBeat = getMidiBeatFromGridBeat(gridBeat, subdivisionTypeRef.current, clickedNote.subdivisionType);
              addCompositionNotes(
                [
                  // Place the note that you were clicking and dragging
                  {
                    noteId: clickedNoteRef.current,
                    midiBeat,
                    midiNote: toMidi(midiNote)!,
                    noteWidth: clickedNote.noteWidth,
                    userInstrumentIndex: clickedNote.userInstrumentIndex,
                    subdivisionType: clickedNote.subdivisionType,
                  },
                  // Place all other notes that were currently selected
                  ...(Object.entries(selectedNotesRef.current).filter(
                    ([noteId, _]) => noteId !== clickedNoteRef.current!.toString()
                  ).map(
                    ([noteId, noteWithOffset]) => {
                      const instrumentInstruction = instrumentInstructionsById[parseInt(noteId)];
                      const offset = noteWithOffset.offset;
                      const gridBeat = cursorPositionRef.current!.midiBeat + cursorXOffsetRef.current + offset.x;
                      const newMidiBeat = getMidiBeatFromGridBeat(gridBeat, subdivisionTypeRef.current, instrumentInstruction.subdivisionType);
                      const newMidiNote = toMidi(midiNote)! - offset.y;
                      // Update the offset and midiBeat / midiNote for the selection too..,
                      // globalSelectedNotes[noteId].instrumentInstruction.midiBeat = newMidiBeat;
                      // globalSelectedNotes[noteId].instrumentInstruction.midiNote = newMidiNote;
                      // globalSelectedNotes[noteId].offset = { x: 0, y: 0 };
                      return {
                        noteId: parseInt(noteId),
                        midiBeat: newMidiBeat,
                        midiNote: newMidiNote,
                        noteWidth: instrumentInstruction.noteWidth,
                        userInstrumentIndex: instrumentInstruction.userInstrumentIndex,
                        subdivisionType: instrumentInstruction.subdivisionType,
                      };
                    }))
                ],
                shouldAddToUndoStack, /* false */
              );
              addToUndoStack({
                newState: {composition: {..._compositionByInstructionIdRef.current}},
                oldState: {composition: {...prevCompositionByInstructionId}},
              });
              // TODO(jaketrower): idk what this is for.
              // fuck it just clear the selected notes
              // setSelectedNotes({});
            }
          } else if (clickedNoteRef.current && !hasMouseMovedRef.current) {
            const secondsSince = (Date.now() - whenWasMouseDownedRef.current) / 1000.0;
            if (secondsSince < DOUBLE_CLICK_SECOND_BUFFER) {
              const prevCompositionByInstructionId = {..._compositionByInstructionIdRef.current};
              removeCompositionNotes([clickedNoteRef.current.toString()], false /* shouldAddToUndoStack */);
              removeCompositionNotes(Object.keys(selectedNotesRef.current), false /* shouldAddToUndoStack */);
              addToUndoStack({
                newState: {composition: {..._compositionByInstructionIdRef.current}},
                oldState: {composition: {...prevCompositionByInstructionId}},
              });
              setSelectedNotes({});
            }
            // const clickedNote = compositionByInstructionIdRef.current[clickedNoteRef.current.toString()];
            // const newSelectedNotes = {
            //   ...selectedNotesRef.current,
            //   [clickedNote.noteId]: {
            //     instrumentInstruction: clickedNote,
            //     offset: { x: 0, y: 0 },
            //   }
            // };
            // setSelectedNotes(newSelectedNotes);
          }
        } else if (inputModeRef.current === InputMode.SELECT) {
          const bounds = {
            left: getMidiBeatFromGridBeat(Math.min(cursorPositionRef.current.midiBeat, startingCursorPosRef.current.midiBeat), subdivisionTypeRef.current, subdivisionTypeRef.current),
            top: Math.min(toMidi(cursorPositionRef.current.midiNote)!, toMidi(startingCursorPosRef.current.midiNote)!), 
            right: getMidiBeatFromGridBeat(Math.max(cursorPositionRef.current.midiBeat, startingCursorPosRef.current.midiBeat), subdivisionTypeRef.current, subdivisionTypeRef.current, true),
            bottom: Math.max(toMidi(cursorPositionRef.current.midiNote)!, toMidi(startingCursorPosRef.current.midiNote)!),
          }
          const newlySelectedNotes = Object.values(getPlacedNotesFromComposition(compositionRef.current, userInstrumentsRef.current, bounds));
          if (newlySelectedNotes.length === 1) {
            justSelectedNoteRef.current = newlySelectedNotes[0];
          }
          const newlySelectedNotesToSelect = {
            ...(newlySelectedNotes.reduce((acc, note) => (
              {
                ...acc,
                [note.noteId]: {
                  instrumentInstruction: note,
                  offset: { x: 0, y: 0 },
                }
              } as NoteIdWithOffset), {})
            ),
          };
          toggleSelectionOnNoteSet(newlySelectedNotesToSelect);
          // TODO(jaketrower): Should this happen in other cases ? should it always be the case when modifying setSelectedNotes ?
          const selectedNoteIds = Object.keys(selectedNotesRef.current);
          let possibleUserInstrumentIndex = _compositionByInstructionIdRef.current[selectedNoteIds[0]]?.userInstrumentIndex;
          if (selectedNoteIds.length > 0 && selectedNoteIds.every(
            (noteId) => _compositionByInstructionIdRef.current[noteId].userInstrumentIndex === possibleUserInstrumentIndex)) {
            setUserInstrumentIndex(possibleUserInstrumentIndex);
          }
        }
      }
      mouseUpCleanup(e, true /* shouldTriggerTimeoutEarly */);

      if (!!prevCompositionByIdWhenIStartedErasingRef.current) {
        addToUndoStack({
          newState: { composition: {..._compositionByInstructionIdRef.current}},
          oldState: { composition: {...prevCompositionByIdWhenIStartedErasingRef.current}},
        });
      }
      prevCompositionByIdWhenIStartedErasingRef.current = undefined;
      // TODO(jaketrower): do this with the window document too like handleKeyDown
      return false;
    },
    [isMouseDownRef, mouseUpCleanup, inputModeRef, clickedNoteRef, setPristine, subdivisionTypeRef, addCompositionNotes, userInstrumentIndexRef, _compositionByInstructionIdRef, removeCompositionNotes, selectedNotesRef, addToUndoStack, whenWasMouseDownedRef, setSelectedNotes, compositionRef, userInstrumentsRef, toggleSelectionOnNoteSet, setUserInstrumentIndex]
  );
  const handleMouseMove = useCallback(
    (
      e: React.PointerEvent<HTMLDivElement>,
      midiBeat: MidiBeat,
      midiNote: MidiNoteNum
    ) => {
      const delta = startingCursorPosRef.current?.clientPos ? distBetween(startingCursorPosRef.current.clientPos, {x: e.clientX, y: e.clientY}) : 0;
      if (isTemporaryTouchStartRef.current && delta >= TOUCH_SCROLL_PIXEL_DELTA_BUFFER) {
        window.clearTimeout(isTemporaryTouchStartRef.current);
        setIsTemporaryTouchStart(undefined);
        mouseUpCleanup(e as any as PointerEvent, false /* shouldTriggerTimeoutEarly */);
        return false;
      }
      if (
        isMouseDownRef.current &&
        cursorPositionRef.current &&
        (cursorPositionRef.current.midiBeat !== midiBeat ||
          cursorPositionRef.current.midiNote !== midiNote)
      ) {
        hasMouseMovedRef.current = true;
        const isDeleteClick = inputModeRef.current === InputMode.DELETE || e.button === 2 || e.buttons === 2;
        if (inputModeRef.current === InputMode.DEFAULT) {
          if (midiNote !== cursorPositionRef.current.midiNote) {
            if (isDeleteClick) {
              return false;
            }
            if (clickedNoteRef.current) {
              userInstrumentsRef.current[userInstrumentIndexRef.current].sf2Sampler?.start({
                note: midiNote,
                duration: 0.25,
              });
            } else {
              userInstrumentsRef.current[userInstrumentIndexRef.current].sf2Sampler?.start({
                note: midiNote,
                duration: 0.25,
              });
            }
          }
        }
        setCursorPosition({ midiNote, midiBeat });
        if (isDeleteClick) {
          const bounds = {
            left: getMidiBeatFromGridBeat(cursorPositionRef.current.midiBeat, subdivisionTypeRef.current, subdivisionTypeRef.current),
            top: toMidi(cursorPositionRef.current.midiNote)!, 
            right: getMidiBeatFromGridBeat(cursorPositionRef.current.midiBeat, subdivisionTypeRef.current, subdivisionTypeRef.current, true),
            bottom: toMidi(cursorPositionRef.current.midiNote)!,
          }
          const newlyDeletedNotes = getPlacedNotesFromComposition(compositionRef.current, userInstrumentsRef.current, bounds);
          // Don't add to undo stack, we will deal with it in handleMouseUp with prevCompositionByIdWhenIStartedErasingRef.
          removeCompositionNotes(Object.keys(newlyDeletedNotes), false /* shouldAddToUndoStack */);
        }
      }
      return false;
    },
    [isMouseDownRef, isTemporaryTouchStartRef, inputModeRef, setCursorPosition, setIsTemporaryTouchStart, mouseUpCleanup, clickedNoteRef, userInstrumentsRef, userInstrumentIndexRef, subdivisionTypeRef, compositionRef, removeCompositionNotes]
  );
  const throttledHandleMouseMove = useThrottledCallback(handleMouseMove, 10);

  const handlePlacedNoteMouseDown = useCallback(
    (
      e: React.PointerEvent<HTMLDivElement>,
      noteId: NoteId,
    ) => {
      setDontScrollForNow(true);
      onCompositionMouseUpRef.current = undefined;
      e.preventDefault();
      if (inputModeRef.current !== InputMode.DEFAULT && inputModeRef.current !== InputMode.DELETE) return;
      const isDeleteClick = e.button === 2 || e.buttons === 2 || inputModeRef.current === InputMode.DELETE;
      const clientRect = (e.target as Element).getBoundingClientRect();
      setCursorXOffset(-Math.floor((e.pageX - clientRect.left) / beatWidth));
      const instrumentInstruction = _compositionByInstructionIdRef.current[noteId];
      if (isNoteSelected(noteId)) {
        if (isDeleteClick) {
          const prevCompositionByInstructionId = {..._compositionByInstructionIdRef.current};
          // We're about to do that at the end of this function, so don't do it here
          const shouldAddToUndoStack = false;
          removeCompositionNotes([noteId.toString()], shouldAddToUndoStack);
          removeCompositionNotes(Object.keys(selectedNotesRef.current), shouldAddToUndoStack);
          addToUndoStack({
            newState: {composition: {..._compositionByInstructionIdRef.current}},
            oldState: {composition: {...prevCompositionByInstructionId}},
          });
          setSelectedNotes({});
        } else {
          if (e.pointerType !== "mouse") {
            setIsTemporaryTouchStart(windowSetTimeout(() => {
              setIsTemporaryTouchStart(undefined);
              setDontScrollForNow(true);
              userInstrumentsRef.current[instrumentInstruction.userInstrumentIndex].sf2Sampler?.start({ note: instrumentInstruction.midiNote, duration: 0.25 });
            }, TOUCH_SCROLL_SECOND_BUFFER * 1000));
          }
          setClickedNote(noteId);
          Object.entries(selectedNotesRef.current).forEach(([noteWithOffsetId, noteWithOffset]) => {
            if (noteWithOffsetId === noteId.toString()) return;
            const instrumentInstructionWithOffset = _compositionByInstructionIdRef.current[noteWithOffsetId];
            // offset: { }
            noteWithOffset.offset = {
              x: instrumentInstructionWithOffset.midiBeat - instrumentInstruction.midiBeat,
              y: instrumentInstruction.midiNote - instrumentInstructionWithOffset.midiNote,
            }
          });
          setSelectedNotes({...selectedNotesRef.current});
        }
      } else {
        if (isDeleteClick) {
          removeCompositionNotes([noteId.toString()], true /* shouldAddToUndoStack */);
        } else {
          setClickedNote(noteId);
          setSelectedNotes({});
        }
      }
      if (!isDeleteClick) {
        if (e.pointerType === "mouse") {
          userInstrumentsRef.current[instrumentInstruction.userInstrumentIndex].sf2Sampler?.start({ note: instrumentInstruction.midiNote, duration: 0.25 });
        }
        setSubdivisionType(instrumentInstruction.subdivisionType);
        handleMouseDown(
          e, 
          getGridBeatFromMidiBeat(instrumentInstruction.midiBeat, instrumentInstruction.subdivisionType),
          instrumentInstruction.midiNote
        );
      }
    },
    [onCompositionMouseUpRef, inputModeRef, setCursorXOffset, beatWidth, _compositionByInstructionIdRef, isNoteSelected, removeCompositionNotes, selectedNotesRef, addToUndoStack, setSelectedNotes, setClickedNote, setIsTemporaryTouchStart, userInstrumentsRef, setSubdivisionType, handleMouseDown]
  );

  const resetUserPlayheadBounds = useCallback(() => {
    if (!userPlayheadBoundsRef.current) return;
    setUserPlayheadBounds(undefined);
  }, [setUserPlayheadBounds, userPlayheadBoundsRef]);

  useEffect(() => {
    document.addEventListener("pointerup", handleMouseUp);
    return () => {
      document.removeEventListener("pointerup", handleMouseUp)
    };
  }, [handleMouseUp]);

  const maybeDisableTouchActionStyle = useMemo(() => {
    return { touchAction: dontScrollForNow ? 'none' : 'manipulation'};
  }, [dontScrollForNow]);

  const resetUserPlayheadButton = useMemo(
    () => (<div style={{
      cursor: _userPlayheadBounds === undefined ? 'default' : 'pointer',
      opacity: _userPlayheadBounds === undefined ? 0.25 : 1,
      position: 'absolute',
      top: -6,
      left: 10,
      background: "white",
      fontSize: 18,
      border: '1px solid black',
      padding: '0px 2px 2px 2px',
      lineHeight: '14px',
      width: 12,
      zIndex: zIndex_resetPlayheadButton,
      boxShadow: "2px 2px 0px 0px rgba(0,0,0,0.50)",
    }} onClick={resetUserPlayheadBounds}>↺</div>),
    [resetUserPlayheadBounds, _userPlayheadBounds]
  );

  const pianoRollKeysContainerStyle = useMemo(() => ({
    height: _beatHeight - 1,
  }), [_beatHeight]);
  const pianoRollKeyBaseStyle = useMemo(() => ({
    width: pianoKeyWidth,
    minWidth: pianoKeyWidth,
    textAlign: "right",
    userSelect: "none",
    cursor: 'pointer',
    borderRight: '1px solid black',
    borderBottom: '1px solid black',
    height: _beatHeight - 2,
    fontSize: 12,
    background: 'white',
    color: 'black',
  }), [_beatHeight]);
  const currUserInstrument = userInstrumentsRef.current[userInstrumentIndexRef.current];
  const pianoRollKeyStyle = useCallback((midiNote: string, isLast: boolean, isHeld: boolean) => ({
    ...pianoRollKeyBaseStyle,
    ...(midiNote[1] === 'b' ? {
      background: 'gray',
      color: 'white',
    } : {}),
    ...(isHeld && currUserInstrument?.color ? {
      background: midiNote[1] === 'b' ? '#424141' : currUserInstrument?.color,
      color: midiNote[1] === 'b' ? currUserInstrument?.color : 'black',
    } : {}),
    ...(isLast ? {
      borderBottom: 'unset',
      height: _beatHeight - 1,
    } : {}),
  } as CSSProperties), [_beatHeight, currUserInstrument?.color, pianoRollKeyBaseStyle]);
  const renderedPianoRollKeys = useMemo(() => (
    <PianoRollKeysContainer>
      <PianoRollKeysSubContainer $beatHeight={_beatHeight}>
        {pianoRollKeys.map((midiNote, idx) => (
          <div
            key={`row-${midiNote}`}
            style={pianoRollKeysContainerStyle}
          >
            <div style={pianoRollKeyStyle(midiNote, idx === pianoRollKeys.length - 1, heldPianoKeys[midiNote]?.key || heldPianoKeys[midiNote]?.mouse)}
              onPointerDown={() => {
                heldPianoKeys[midiNote] = { ...heldPianoKeys[midiNote], mouse: true };
                setHeldPianoKeys({...heldPianoKeys});
                incrementBabyDanceFrame();
                userInstrumentsRef.current[userInstrumentIndexRef.current].sf2Sampler?.start({ note: midiNote, duration: 0.25 }); 
              }}
              onPointerOver={(e) => {
                if (e.buttons === 1) {
                  heldPianoKeys[midiNote] = { ...heldPianoKeys[midiNote], mouse: true };
                  setHeldPianoKeys({...heldPianoKeys});
                  incrementBabyDanceFrame();
                  userInstrumentsRef.current[userInstrumentIndexRef.current].sf2Sampler?.start({ note: midiNote, duration: 0.25 }); 
                }
              }}
              onPointerLeave={(e) => {
                if (e.buttons === 1 && midiNote in heldPianoKeys) {
                  heldPianoKeys[midiNote].mouse = false;
                  setHeldPianoKeys({...heldPianoKeys});
                }
              }}
              onPointerUp={(e) => {
                if (midiNote in heldPianoKeys) {
                  heldPianoKeys[midiNote].mouse = false;
                  setHeldPianoKeys({...heldPianoKeys});
                }
              }}
            >
              {midiNote}
            </div>
          </div>
        ))}
      </PianoRollKeysSubContainer>
    </PianoRollKeysContainer>
  ), [_beatHeight, heldPianoKeys, incrementBabyDanceFrame, pianoRollKeyStyle, pianoRollKeysContainerStyle, setHeldPianoKeys, userInstrumentIndexRef, userInstrumentsRef])

  const allRenderedNotes = useMemo(() => (
    <AllRenderedNotes
      handlePlacedNoteMouseDown={handlePlacedNoteMouseDown}
      _inputMode={_inputMode}
      _cursorXOffset={_cursorXOffset}
      _cursorPosition={_cursorPosition}
      _startingCursorPos={_startingCursorPos}
    />
  ), [_cursorPosition, _cursorXOffset, _inputMode, _startingCursorPos, handlePlacedNoteMouseDown]);

  const renderedCompositionGrid = useMemo(() => (
    <CompositionGrid
      handleMouseDown={handleMouseDown}
      handleDoubleClick={handleDoubleClick}
      handleMouseMove={throttledHandleMouseMove}
      playheadNode={playheadNode}
      renderedPianoRollKeys={renderedPianoRollKeys}
    >
      {allRenderedNotes}
    </CompositionGrid>
  ), [handleMouseDown, handleDoubleClick, throttledHandleMouseMove, playheadNode, renderedPianoRollKeys, allRenderedNotes]);
  const compositionScrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (compositionScrollerRef.current) {
      const compositionScroller = compositionScrollerRef.current;
      if (window.matchMedia("(pointer: coarse)").matches) {
        if (window.innerWidth > window.innerHeight) {
          compositionScroller.scrollTo(0, compositionScroller.clientHeight * 2);
        } else {
          compositionScroller.scrollTo(0, compositionScroller.clientHeight);
        }
      } else {
        compositionScroller.scrollTo(0, compositionScroller.clientHeight / 2);
      }
    }
  }, [compositionScrollerRef]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (dontScrollForNow) {
      e.stopPropagation();
      e.preventDefault();
      return false;
    }
  }, [dontScrollForNow]);
  useEffect(() => {
    const compositionScroller = compositionScrollerRef.current;
    if (compositionScroller) {
      compositionScroller.addEventListener('touchmove', handleTouchMove, { passive: false });
    }
    return () => {
      if (compositionScroller) {
        compositionScroller.removeEventListener('touchmove', handleTouchMove);
      }
    }
  }, [handleTouchMove]);

  return (
    <CompositionContainer onContextMenu={(e) => e.preventDefault()}>
      {resetUserPlayheadButton}
      <CompositionGridContainer ref={compositionScrollerRef} style={maybeDisableTouchActionStyle}>
        {renderedCompositionGrid}
      </CompositionGridContainer>
    </CompositionContainer>
  );
}
