import React, { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import styled from "styled-components";
import { AudioContextContext, getARandomNote, InputMode, increaseKeyboardPianoOctaveShift, decreaseKeyboardPianoOctaveShift, getKeyboardPianoKey, NoteIdWithOffset, SubdivisionType, TimeSignature } from "./consts";
import { UserInstrumentContext } from "./contexts/UserInstrumentContextProvider";
import { ActionButton, ActionButtonFooter } from "./ActionButtonFooter";
import { SubdivisionTypeContext } from "./contexts/SubdivisionTypeContextProvider";
import { PristineContext } from "./contexts/PristineContextProvider";
import { ClipboardContext } from "./contexts/ClipboardContextProvider";
import { TimeSignatureContext } from "./contexts/TimeSignatureContextProvider";
import { PlayTheSongContext } from "./contexts/PlayTheSongContextProvider";
import { MouseDownContext } from "./contexts/MouseDownContextProvider";
import { ClickedSelectedNotesContext } from "./contexts/ClickedSelectedNotesContextProvider";
import { CompositionActionsContext } from "./contexts/CompositionActionsContextProvider";
import { ExecuteUndoRedoContext } from "./contexts/ExecuteUndoRedoContextProvider";
import { UndoRedoContext } from "./contexts/UndoRedoContextProvider";
import { PlayheadContext } from "./contexts/PlayheadContextProvider";
import { Input, NoteMessageEvent, PortEvent, WebMidi } from "webmidi";

const Footer = styled.div`
  max-width: 960px;
  display: flex;
  flex-direction: column;
`;

export function Maestro({
  renderChildren,
  _inputMode,
  inputModeRef,
  setInputMode,
  trySetInputMode,
} : {
  renderChildren: (footer: React.ReactElement, undoRedoButtons: React.ReactElement) => React.ReactElement,
  _inputMode: InputMode,
  inputModeRef: React.RefObject<InputMode>,
  setInputMode: (newInputMode: InputMode) => void,
  trySetInputMode: (newInputMode: InputMode, isMouseDown: boolean) => void,
}) {
  const audioContext = useContext(AudioContextContext)!;
  const {
    incrementBabyDanceFrame,
    isLoopingRef,
    _isPlaying,
  } = useContext(PlayTheSongContext)!;
  const { pristine } = useContext(PristineContext)!;

  const {
    userInstrumentsRef,
    userInstrumentIndexRef,
    setUserInstrumentIndex,
  } = useContext(UserInstrumentContext)!;
  const { 
    subdivisionTypeRef,
    setSubdivisionType,
  } = useContext(SubdivisionTypeContext)!;
  const {
    timeSignatureRef,
    setTimeSignature,
  } = useContext(TimeSignatureContext)!;
  const {
    isCompositionMouseDownRef,
    setIsCompositionMouseDown,
    onCompositionMouseUpRef,
  } = useContext(MouseDownContext)!;
  const {
    clickedNoteRef,
    setClickedNote,
    selectedNotesRef,
    setSelectedNotes,
    selectNotesByInstrument,
    toggleSelectionOnNoteSet,
    heldPianoKeys,
    setHeldPianoKeys,
  } = useContext(ClickedSelectedNotesContext)!;
  const { copiedNotesRef, setCopiedNotes, copiedNotesOffsetRef } = useContext(ClipboardContext)!;
  const { debouncedAddToUndoStack, canUndo, canRedo } = useContext(UndoRedoContext)!;
  const { handleUndo, handleRedo } = useContext(ExecuteUndoRedoContext)!;
  const {
    handleStopComposition,
    handlePlayComposition,
  } = useContext(PlayTheSongContext)!;
  const {
    _compositionByInstructionIdRef,
    addCompositionNotes,
    removeCompositionNotes,
  } = useContext(CompositionActionsContext)!;
  const {
    userPlayheadBoundsRef,
    setUserPlayheadBounds,
  } = useContext(PlayheadContext)!;

  const onToggleSubdivisionType = useCallback(() => {
      if (subdivisionTypeRef.current === SubdivisionType.q) {
        setSubdivisionType(SubdivisionType.t);
      } else if (subdivisionTypeRef.current === SubdivisionType.t) {
        setSubdivisionType(SubdivisionType.q);
      }
    }, [setSubdivisionType, subdivisionTypeRef]);

  const onToggleTimeSignature = useCallback(() => {
    if (timeSignatureRef.current === TimeSignature.ts4_4) {
      setTimeSignature(TimeSignature.ts3_4);
    } else if (timeSignatureRef.current === TimeSignature.ts3_4) {
      setTimeSignature(TimeSignature.ts4_4);
    }
  }, [setTimeSignature, timeSignatureRef]);

  const tryCopySelectedNotes = useCallback(() => {
    copiedNotesOffsetRef.current = 0;
    if (Object.keys(selectedNotesRef.current).length > 0) {
      let leftmostMidiBeat = 99999;
      let rightmostMidiBeat = -99999;
      const newlyCopiedNotes = Object.keys(selectedNotesRef.current).map((noteId) => {
        const selectedNote = _compositionByInstructionIdRef.current[noteId];
        const { midiBeat, noteWidth } = selectedNote;
        if (midiBeat < leftmostMidiBeat) leftmostMidiBeat = midiBeat;
        if (midiBeat + noteWidth > rightmostMidiBeat) rightmostMidiBeat = midiBeat + noteWidth;
        return {
          ...selectedNote,
          noteId: -1,
        }
      });
      setCopiedNotes(newlyCopiedNotes);
      copiedNotesOffsetRef.current = rightmostMidiBeat - leftmostMidiBeat;
    } else if (clickedNoteRef.current) {
      const clickedNote = _compositionByInstructionIdRef.current[clickedNoteRef.current];
      setCopiedNotes([{
        ...clickedNote,
        noteId: -1,
      }]);
      copiedNotesOffsetRef.current = clickedNote.noteWidth;
    }
  }, [clickedNoteRef, _compositionByInstructionIdRef, copiedNotesOffsetRef, selectedNotesRef, setCopiedNotes]);

  const tryDeleteSelectedNotes = useCallback(() => {
    if (isCompositionMouseDownRef.current) {
      setIsCompositionMouseDown(false);
    }
    if (Object.keys(selectedNotesRef.current).length > 0) {
      removeCompositionNotes(Object.keys(selectedNotesRef.current), true /* shouldAddToUndoStack */);
      setSelectedNotes({});
      setClickedNote(undefined);
    } else if (clickedNoteRef.current) {
      removeCompositionNotes([clickedNoteRef.current.toString()], true /* shouldAddToUndoStack */);
      setClickedNote(undefined);
    }
  }, [clickedNoteRef, isCompositionMouseDownRef, removeCompositionNotes, selectedNotesRef, setClickedNote, setIsCompositionMouseDown, setSelectedNotes]);

  const tryCutSelectedNotes = useCallback(() => {
    tryCopySelectedNotes();
    tryDeleteSelectedNotes();
    copiedNotesOffsetRef.current = 0;
  }, [copiedNotesOffsetRef, tryCopySelectedNotes, tryDeleteSelectedNotes]);

  const tryPasteCopiedNotes = useCallback((e: KeyboardEvent | PointerEvent) => {
    console.log("TODO: test this while dragging other selected notes...");
    console.log("TODO: need to test the midiBeat increase with different copied subdivision types?")
    const copiedNotes = Object.values(copiedNotesRef.current);
    if (copiedNotes.length === 0) return;
    const possibleOldUserInstrumentIndex = copiedNotes[0].userInstrumentIndex;
    let newUserInstrumentIndex = -1;
    if (copiedNotes.every((note) => note.userInstrumentIndex === possibleOldUserInstrumentIndex)) {
      newUserInstrumentIndex = userInstrumentIndexRef.current;
    }
    const notesToPaste = copiedNotes.map((copiedNote) => {
      return {
        ...copiedNote,
        noteId: undefined,
        midiBeat: copiedNote.midiBeat + copiedNotesOffsetRef.current,
        ...(newUserInstrumentIndex >= 0 ? { userInstrumentIndex: newUserInstrumentIndex } : {}),
      }
    });
    const pastedNotes = addCompositionNotes(notesToPaste, true /* shouldAddToUndoStack */);
    // setIsCompositionMouseDown(true);
    // setClickedNote(topLeftmostCopiedNote.noteId);
    const pastedNotesToSelect = pastedNotes.reduce((acc, note) => {
      return {
        ...acc,
        [note.noteId]: {
          noteId: note.noteId,
          offset: { x: 0, y: 0 },
        },
      };
    }, {} as Record<string, NoteIdWithOffset>);
    if (e.shiftKey) {
      setSelectedNotes({
        ...selectedNotesRef.current,
        ...pastedNotesToSelect,
      })
    } else {
      setSelectedNotes(pastedNotesToSelect);
    }
  }, [addCompositionNotes, copiedNotesOffsetRef, copiedNotesRef, selectedNotesRef, setSelectedNotes, userInstrumentIndexRef]);

  const isShiftKeyDown = useRef(false);
  const isMetaKeyDown = useRef(false);
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      if (e.repeat) {
        return;
      }
      if (document.activeElement?.tagName === "INPUT" && (document.activeElement as HTMLInputElement).type !== "range") {
        return;
      }
      if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
        if (e.shiftKey) {
          if (canRedo && !isCompositionMouseDownRef.current) await handleRedo();
        } else {
          if (canUndo && !isCompositionMouseDownRef.current) await handleUndo();
        }
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (clickedNoteRef.current) {
          // Need to update cursorOffset ??? (not just X but Y too...)
          if (Object.entries(selectedNotesRef.current).length > 0) {
            // Move any other selected notes too (offset)
          }
          e.preventDefault();
          return false;
        } else if (Object.entries(selectedNotesRef.current).length > 0) {
          const selectedNoteIds = Object.keys(selectedNotesRef.current);
          const prevCompositionByInstructionId = {..._compositionByInstructionIdRef.current};
          const removedNoteToShift = Object.values(removeCompositionNotes(
            selectedNoteIds,
            // We're about to do that below, so don't do it here
            false, /* shouldAddToUndoStack */
          ));
          addCompositionNotes(
            [
              ...removedNoteToShift.map((noteToShift) => {
                if (e.key === "ArrowDown") {
                  if (e.shiftKey) { noteToShift.midiNote -= 4; }
                  else { noteToShift.midiNote -= 1; }
                }
                if (e.key === "ArrowUp") {
                  if (e.shiftKey) { noteToShift.midiNote += 4; }
                  else { noteToShift.midiNote += 1; }
                }
                if (e.key === "ArrowLeft") {
                  // TODO(jaketrower): should take into account subdivision type?
                  if (e.shiftKey) { noteToShift.midiBeat -= 4; }
                  else { noteToShift.midiBeat -= 1; }
                }
                if (e.key === "ArrowRight") {
                  if (e.shiftKey) { noteToShift.midiBeat += 4; }
                  else { noteToShift.midiBeat += 1; }
                }
                return { ...noteToShift };
              }),
            ],
            // We're about to do that below, so don't do it here
            false, /* shouldAddToUndoStack */);
          debouncedAddToUndoStack({
            oldState: { composition: prevCompositionByInstructionId},
            newState: { composition: {..._compositionByInstructionIdRef.current}},
          });
          e.preventDefault();
          return false;
        }
      }
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        const notesToSelect = {
          ...(Object.entries(_compositionByInstructionIdRef.current).reduce((acc, [noteId, _]) => ({
            ...acc,
            [noteId]: {
              noteId: parseInt(noteId),
              offset: { x: 0, y: 0 },
            },
          }), {} as Record<string, NoteIdWithOffset>)),
        };
        if (e.shiftKey) {
          toggleSelectionOnNoteSet(notesToSelect);
        } else {
          setSelectedNotes(notesToSelect);
        }
        e.preventDefault();
        return false;
      }
      if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
        tryCopySelectedNotes();
        return false;
      }
      if (e.key === "x" && (e.ctrlKey || e.metaKey)) {
        tryCutSelectedNotes();
        return false;
      }
      if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
        tryPasteCopiedNotes(e);
        return false;
      }
      if (e.key === "q") {
        onToggleSubdivisionType();
        return false;
      }
      if (e.key === "r") {
        if (e.ctrlKey || e.metaKey) {
          return false;
        }
        onToggleTimeSignature();
        return false;
      }
      if (e.key === "Backspace") {
        tryDeleteSelectedNotes();
        return false;
      }
      if (e.key === "Escape") {
        let didDoSomethingElse = false;
        if (isCompositionMouseDownRef.current) {
          setIsCompositionMouseDown(false);
          didDoSomethingElse = true;
        }
        if (clickedNoteRef.current) {
          setClickedNote(undefined);
          didDoSomethingElse = true;
        }
        if (Object.keys(selectedNotesRef.current).length > 0) {
          setSelectedNotes({});
          didDoSomethingElse = true;
        }
        if (!didDoSomethingElse && userPlayheadBoundsRef.current) {
          setUserPlayheadBounds(undefined);
        }
        return false;
      }
      // Isn't this one weird...
      const shiftedNumberIndex = "!@#$%^&*()".indexOf(e.key);
      if (shiftedNumberIndex >= 0) {
        if (userInstrumentsRef.current.length > shiftedNumberIndex) {
          setUserInstrumentIndex(shiftedNumberIndex);
          userInstrumentsRef.current[shiftedNumberIndex].sf2Sampler?.start({
            note: getARandomNote(), duration: 0.25,
          });
          selectNotesByInstrument(shiftedNumberIndex, _compositionByInstructionIdRef.current);
        }
        return false;
      }
      if (!Number.isNaN(parseInt(e.key))) {
        let index = parseInt(e.key);
        if (index === 0) {
          index = 9;
        } else {
          index -= 1
        }
        if (userInstrumentsRef.current.length > index) {
          setUserInstrumentIndex(index);
          userInstrumentsRef.current[index].sf2Sampler?.start({ note: getARandomNote(), duration: 0.25 });
        }
        return false;
      }
      if (e.key === "Shift") {
        isShiftKeyDown.current = true;
        trySetInputMode(InputMode.SELECT, isCompositionMouseDownRef.current);
        if (isCompositionMouseDownRef.current) {
          onCompositionMouseUpRef.current = () => setInputMode(InputMode.SELECT);
        }
        return false;
      }
      if (e.key === "Meta" || e.key === "Control") {
        isMetaKeyDown.current = true;
        trySetInputMode(InputMode.DELETE, isCompositionMouseDownRef.current);
        if (isCompositionMouseDownRef.current) {
          onCompositionMouseUpRef.current = () => setInputMode(InputMode.DELETE);
        }
        return false;
      }
      if (e.code === "Space") {
        _isPlaying && !e.shiftKey ? handleStopComposition() : handlePlayComposition({
          shouldLoop: !e.shiftKey ? isLoopingRef.current : !isLoopingRef.current,
        });
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      if (e.code === "Minus") { // -
        decreaseKeyboardPianoOctaveShift();
        setHeldPianoKeys({});
      }
      if (e.code === "Equal") { // =
        increaseKeyboardPianoOctaveShift();
        setHeldPianoKeys({});
      }
      const playedNote = getKeyboardPianoKey(e.key);
      if (!playedNote) return;
      setHeldPianoKeys((prev) => ({
        ...prev,
        [playedNote]: { ...prev[playedNote], key: true }
      }));
      const currUserInstrument = userInstrumentsRef.current[userInstrumentIndexRef.current];
      if (!currUserInstrument.sf2Sampler) return;
      currUserInstrument.sf2Sampler.start({
        note: playedNote,
        time: audioContext.currentTime,
        duration: 0.25,
      });
      incrementBabyDanceFrame();
    },
    [setHeldPianoKeys, userInstrumentsRef, userInstrumentIndexRef, audioContext.currentTime, incrementBabyDanceFrame, canRedo, handleRedo, canUndo, handleUndo, clickedNoteRef, selectedNotesRef, _compositionByInstructionIdRef, removeCompositionNotes, addCompositionNotes, debouncedAddToUndoStack, toggleSelectionOnNoteSet, setSelectedNotes, tryCopySelectedNotes, tryCutSelectedNotes, tryPasteCopiedNotes, onToggleSubdivisionType, onToggleTimeSignature, tryDeleteSelectedNotes, isCompositionMouseDownRef, userPlayheadBoundsRef, setIsCompositionMouseDown, setClickedNote, setUserPlayheadBounds, setUserInstrumentIndex, selectNotesByInstrument, trySetInputMode, onCompositionMouseUpRef, setInputMode, _isPlaying, handleStopComposition, handlePlayComposition, isLoopingRef]
  );

  const webMidiRef = useRef<typeof WebMidi | undefined>(undefined);
  const onMidiInputNoteOff = useCallback((e: NoteMessageEvent) => {
    const playedNote = e.note.identifier;
    setHeldPianoKeys((prev) => (playedNote in prev ? {
      ...prev,
      [playedNote]: { ...prev[playedNote], key: false }
    } : prev));
  }, [setHeldPianoKeys]);
  const onMidiInputNoteOn = useCallback((e: NoteMessageEvent) => {
    if (e.rawValue === 0 || e.value === 0.0) {
      onMidiInputNoteOff(e);
    } else {
      const playedNote = e.note.identifier;
      if (!playedNote) return;
      setHeldPianoKeys((prev) => ({
        ...prev,
        [playedNote]: { ...prev[playedNote], key: true }
      }));
      const currUserInstrument = userInstrumentsRef.current[userInstrumentIndexRef.current];
      if (!currUserInstrument.sf2Sampler) return;
      currUserInstrument.sf2Sampler.start({
        note: playedNote,
        time: audioContext.currentTime,
        duration: 0.25,
      });
      incrementBabyDanceFrame();
    }
  }, [audioContext, incrementBabyDanceFrame, onMidiInputNoteOff, setHeldPianoKeys, userInstrumentIndexRef, userInstrumentsRef]);
  useEffect(() => {
    const onMidiInputConnected = (e: PortEvent) => {
      if (e.port instanceof Input) {
        (e.port as Input).addListener("noteon", onMidiInputNoteOn);
        (e.port as Input).addListener("noteoff", onMidiInputNoteOff);
      }
    };
    const onMidiInputDisconnected = (e: PortEvent) => {
      if (e.port instanceof Input) {
        (e.port as Input).removeListener("noteon", onMidiInputNoteOn);
        (e.port as Input).removeListener("noteon", onMidiInputNoteOff);
      }
    };
    WebMidi.enable().then((webMidi) => {
      webMidiRef.current = webMidi;
      webMidiRef.current.addListener("connected", onMidiInputConnected);
      webMidiRef.current.addListener("disconnected", onMidiInputConnected);
    }).catch(err => console.log("Error enabling WebMidi: ", err));
    return () => {
      if (webMidiRef.current) {
        webMidiRef.current.removeListener("connected", onMidiInputConnected);
        webMidiRef.current.removeListener("disconnected", onMidiInputDisconnected);
      }
    }
  }, [onMidiInputNoteOff, onMidiInputNoteOn]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.key === "Shift") {
      if (inputModeRef.current === InputMode.SELECT) {
        trySetInputMode(isMetaKeyDown.current ? InputMode.DELETE : InputMode.DEFAULT, isCompositionMouseDownRef.current);
        if (isCompositionMouseDownRef.current) {
          onCompositionMouseUpRef.current = () => setInputMode(isMetaKeyDown.current ? InputMode.DELETE : InputMode.DEFAULT);
        }
      }
      isShiftKeyDown.current = false;
    }
    if (e.key === "Meta" || e.key === "Control") {
      if (inputModeRef.current === InputMode.DELETE) {
        trySetInputMode(isShiftKeyDown.current ? InputMode.SELECT : InputMode.DEFAULT, isCompositionMouseDownRef.current);
        if (isCompositionMouseDownRef.current) {
          onCompositionMouseUpRef.current = () => setInputMode(isShiftKeyDown.current ? InputMode.SELECT : InputMode.DEFAULT);
        }
      }
      isMetaKeyDown.current = false;
    }
    const playedNote = getKeyboardPianoKey(e.key);
    if (!playedNote) return;
    setHeldPianoKeys((prev) => (playedNote in prev ? {
      ...prev,
      [playedNote]: { ...prev[playedNote], key: false }
    } : prev));
  }, [inputModeRef, trySetInputMode, isCompositionMouseDownRef, onCompositionMouseUpRef, setInputMode, setHeldPianoKeys]);

  const handleMouseDown = useCallback((e: PointerEvent) => {
    if (e.shiftKey) return false;
    setSelectedNotes({});
  }, [setSelectedNotes]);

  const handleMouseUp = useCallback((e: PointerEvent) => {

  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("pointerdown", handleMouseDown);
    document.addEventListener("pointerup", handleMouseUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("pointerdown", handleMouseDown);
    document.removeEventListener("pointerup", handleMouseUp);
    };
  }, [handleKeyDown, handleKeyUp, handleMouseDown, handleMouseUp]);
  useEffect(() => {
    if (pristine) {
      window.onbeforeunload = null;
    } else {
      window.onbeforeunload = () => { return true; };
    }
    return () => {
      window.onbeforeunload = null;
    }
  }, [pristine]);

  const footer = useMemo(() => (<Footer>
    <ActionButtonFooter
      _inputMode={_inputMode}
      setInputMode={trySetInputMode}
      tryCopySelectedNotes={tryCopySelectedNotes}
      tryCutSelectedNotes={tryCutSelectedNotes}
      tryPasteCopiedNotes={tryPasteCopiedNotes}
    />
  </Footer>), [_inputMode, tryCopySelectedNotes, tryCutSelectedNotes, tryPasteCopiedNotes, trySetInputMode]);
  const undoRedoButtons = useMemo(() => (<div style={{display: "flex", height: "30px", gap: "4px", marginLeft: "4px"}}>
    <ActionButton title="Undo (Ctrl+Z)" onClick={handleUndo} style={{ opacity: canUndo ? 1 : 0.5}}>↩️</ActionButton>
    <ActionButton title="Redo (Ctrl+Shift+Z)" onClick={handleRedo} style={{ opacity: canRedo ? 1 : 0.5}}>↪️</ActionButton>
  </div>), [handleUndo, canUndo, handleRedo, canRedo]);

  const renderedChildren = useMemo(() => renderChildren(footer, undoRedoButtons), [footer, renderChildren, undoRedoButtons]);
  return renderedChildren;
}
