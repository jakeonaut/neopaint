import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { PlayheadContext } from "./contexts/PlayheadContextProvider";
import { CompositionContext } from "./contexts/CompositionContextProvider";
import { TimeSignatureContext } from "./contexts/TimeSignatureContextProvider";
import { AudioContextContext, beatFromEvent, getEndOfMeasureFromBeat, getEndOfMeasureToLoopAtBeat, getStartOfMeasureFromBeat, InputMode, InstrumentInstruction, mediumColor, NoteIdWithOffset, pianoRollBeats, pianoRollKeys, playCompositionNotesAtBeat, zIndex_playhead } from "./consts";
import { SongSettingsContext } from "./contexts/SongSettingsContextProvider";
import { UserInstrumentContext } from "./contexts/UserInstrumentContextProvider";
import { PlayheadPosXContext } from "./contexts/PlayheadPosXContextProvider";
import { BabyDanceFrameContext, PlayTheSongContext } from "./contexts/PlayTheSongContextProvider";
import { CompositionActionsContext } from "./contexts/CompositionActionsContextProvider";
import { BeatSizeContext } from "./contexts/BeatSizeContextProvider";
import { ClickedSelectedNotesContext } from "./contexts/ClickedSelectedNotesContextProvider";

const PlayheadContainer = styled.div<{ $beatHeight: number }>`
  content: ' ';
  position: sticky;
  top: 0;
  user-select: none;
  pointer-events: none;
  z-index: 4;
`;

const PlayheadTopLeftCoverup = styled.div`
  width: 30px;
  height: 16px;
  background: white;
  position: absolute;
  border-bottom: 1px solid black;
`;

const PlayheadStickyContainer = styled.div<{ $isMouseDown: boolean, $beatWidth: number }>`
  position: absolute;
  background: white;
  top: 0px;
  left: 30px;
  width: ${({ $beatWidth }) => `${(pianoRollBeats.length * $beatWidth)}px`};
  cursor: ${({ $isMouseDown }) => $isMouseDown ? 'grabbing' : 'pointer'};
  height: 16px;
  border-bottom: 1px double ${mediumColor};
  z-index: ${zIndex_playhead};
  pointer-events: all;
`;

const PlayheadSubContainer = styled.div`
  position: relative;
  margin-right: 30px;
`;

const BabyPlayheadImg = styled.img<{ $frame: number, $yFrame: number, $playheadPosX: number, $beatWidth: number, $preventPointerEvents: boolean }>`
  width: 20px;
  height: 20px;
  image-rendering: pixelated;
  background-image: url("baby_dance_sheet.png");
  position: absolute;
  background-position: ${({ $frame, $yFrame }) => `${$frame * -20}px ${$yFrame * -20}px`};
  left: ${({ $playheadPosX, $beatWidth }) => `${Math.max($playheadPosX - $beatWidth - 2, -2)}px`};
  top: -4px;
  cursor: grab;
  z-index: 1;
  user-select: none;
  ...(${({ $preventPointerEvents }) => $preventPointerEvents ? { pointerEvents: 'none' } : {}});
`;

const PixelCoda = styled.div<{
  $y: number,
  $left: number,
  $inverted: boolean,
  $isHidden: boolean,
  $preventPointerEvents: boolean,
  $opacity: number,
}>`
  background: ${({ $y, $inverted }) => `url('./toolicons1x.png') repeat scroll ${
    $inverted ? '-25px' : '0'
  } ${$y}px transparent`};
  width: 16px;
  height: 15px;
  image-rendering: pixelated;
  cursor: grab;
  position: absolute;
  top: 2px;
  left: ${({ $left }) => `${$left}px`};
  user-select: none;
  display: ${({ $isHidden }) => $isHidden ? 'none': 'unset'};
  opacity: ${({ $opacity }) => $opacity};
  pointer-events: ${({ $preventPointerEvents }) => $preventPointerEvents ? 'none' : 'normal' };
`;

export function PlayheadNode({
  _inputMode,
  inputModeRef,
}: {
  _inputMode: InputMode,
  inputModeRef: React.RefObject<InputMode>;
}) {
  const { babyDanceFrame, babyDanceYFrame } = useContext(BabyDanceFrameContext)!;
  const {
    handleQuickPlayResetAtCurrentBeat,
    _isPlaying,
    isPlayingRef,
    _isLooping,
    incrementBabyDanceFrame,
  } = useContext(PlayTheSongContext)!;
  const {
    _userPlayheadBounds,
    userPlayheadBoundsRef,
    setUserPlayheadBounds,
  } = useContext(PlayheadContext)!;
  const { tempoRef } = useContext(SongSettingsContext)!;
  const audioContext = useContext(AudioContextContext)!;
  const { _beatWidth, beatWidthRef, _beatHeight } = useContext(BeatSizeContext)!;
  const { userInstrumentsRef } = useContext(UserInstrumentContext)!;
  const { _farthestRightNoteEnd } = useContext(CompositionContext)!;
  const { _compositionByInstructionIdRef, compositionRef } = useContext(CompositionActionsContext)!;
  const { _timeSignature, timeSignatureRef } = useContext(TimeSignatureContext)!;
  const { _playheadPosX, playheadPosXRef, setPlayheadPosX, } = useContext(PlayheadPosXContext)!;
  const { toggleSelectionOnNoteSet } = useContext(ClickedSelectedNotesContext)!;

  const [_babyMouseDown, _setBabyMouseDown] = useState(false);
  const [_codaMouseDown, _setCodaMouseDown] = useState(false);
  const [_playheadMouseDown, _setPlayheadMouseDown] = useState(false);

  const playheadMouseDownRef = useRef(_playheadMouseDown);
  const babyMouseDownRef = useRef(_babyMouseDown);
  const startingPlayheadCursorPos = useRef(0);
  const cursorPos = useRef(0);
  const playheadNodeElementRef = useRef<HTMLDivElement>(null);

  const endOfMeasureToLoopAtBeat = useMemo(
    () => getEndOfMeasureToLoopAtBeat(
      _farthestRightNoteEnd, 
      _timeSignature,
      _userPlayheadBounds,
    ),
    [_farthestRightNoteEnd, _timeSignature, _userPlayheadBounds]
  );

  const setPlayheadMouseDown = useCallback((newPlayheadMouseDown: boolean) => {
    playheadMouseDownRef.current = newPlayheadMouseDown;
    _setPlayheadMouseDown(newPlayheadMouseDown);
  }, []);
  const setBabyMouseDown = useCallback((newBabyMouseDown: boolean) => {
    babyMouseDownRef.current = newBabyMouseDown;
    _setBabyMouseDown(newBabyMouseDown);
  }, []);

  const handleCodaLeftMouseDown = useCallback((e: React.PointerEvent) => {
    if (inputModeRef.current === InputMode.SELECT) { return false; }

    const start = beatFromEvent({ target: playheadNodeElementRef.current! as HTMLDivElement, clientX: e.clientX - 30 }, beatWidthRef.current);
    setPlayheadMouseDown(true);
    _setCodaMouseDown(true);
    startingPlayheadCursorPos.current = (userPlayheadBoundsRef.current?.end ?? endOfMeasureToLoopAtBeat);
    cursorPos.current = start;
    e.stopPropagation();
    return false;
  }, [beatWidthRef, endOfMeasureToLoopAtBeat, inputModeRef, setPlayheadMouseDown, userPlayheadBoundsRef]);

  const handleCodaRightMouseDown = useCallback((e: React.PointerEvent) => {
    if (inputModeRef.current === InputMode.SELECT) { return false; }

    const start = beatFromEvent({ target: playheadNodeElementRef.current! as HTMLDivElement, clientX: e.clientX - 30 }, beatWidthRef.current);
    setPlayheadMouseDown(true);
    _setCodaMouseDown(true);
    startingPlayheadCursorPos.current = userPlayheadBoundsRef.current?.start ?? 0;
    cursorPos.current = start;
    e.stopPropagation();
    return false;
  }, [beatWidthRef, inputModeRef, setPlayheadMouseDown, userPlayheadBoundsRef]);

  const handleBabyMouseDown = useCallback((e: React.PointerEvent) => {
    if (inputModeRef.current === InputMode.SELECT) { return false; }

    const cursorBeat = playheadPosXRef.current / beatWidthRef.current;
    setBabyMouseDown(true);
    if (!isPlayingRef.current) {
      playCompositionNotesAtBeat({
        audioContext,
        composition: compositionRef.current,
        midiBeat: cursorBeat,
        tempo: tempoRef.current,
        userInstruments: userInstrumentsRef.current,
        incrementBabyDanceFrame,
      });
    }
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, [audioContext, beatWidthRef, compositionRef, incrementBabyDanceFrame, inputModeRef, isPlayingRef, playheadPosXRef, setBabyMouseDown, tempoRef, userInstrumentsRef]);

  const handleMouseDown = useCallback((e: React.PointerEvent) => {
    if (inputModeRef.current === InputMode.SELECT) { return false; }

    const start = beatFromEvent({ target: e.target as HTMLDivElement, clientX: e.clientX }, beatWidthRef.current);
    setBabyMouseDown(true);
    startingPlayheadCursorPos.current = start;
    cursorPos.current = start;
    setPlayheadPosX((start) * beatWidthRef.current);
    if (isPlayingRef.current) {
      handleQuickPlayResetAtCurrentBeat();
    } else {
      playCompositionNotesAtBeat({
        audioContext,
        composition: compositionRef.current,
        midiBeat: start,
        tempo: tempoRef.current,
        userInstruments: userInstrumentsRef.current,
        incrementBabyDanceFrame,
      });
    }
    e.stopPropagation();
    e.preventDefault();
    return false;
  }, [audioContext, beatWidthRef, compositionRef, handleQuickPlayResetAtCurrentBeat, incrementBabyDanceFrame, inputModeRef, isPlayingRef, setBabyMouseDown, setPlayheadPosX, tempoRef, userInstrumentsRef]);

  const selectNotesByMeasure = useCallback((startOfMeasure: number, endOfMeasure: number, compositionByInstructionId: Record<string, InstrumentInstruction>) => {
    // TODO(jaketrower): check if they're all selected, and if so, unselect them, otherwise, select them.
    toggleSelectionOnNoteSet({
      ...(Object.entries(compositionByInstructionId).reduce((acc, [noteId, instrumentInstruction]) => {
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
      }, {} as Record<string, NoteIdWithOffset>)),
    })
  }, [toggleSelectionOnNoteSet]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const cursorBeat = beatFromEvent({ target: playheadNodeElementRef.current!, clientX: e.clientX - 30 }, beatWidthRef.current);
    const startOfClickedMeasure = getStartOfMeasureFromBeat(cursorBeat, timeSignatureRef.current);
    const endOfClickedMeasure = getEndOfMeasureFromBeat(cursorBeat, timeSignatureRef.current);
    if (inputModeRef.current === InputMode.SELECT) {
      selectNotesByMeasure(startOfClickedMeasure, endOfClickedMeasure, _compositionByInstructionIdRef.current);
      return false;
    }

    if ((e.shiftKey) && userPlayheadBoundsRef.current !== undefined) {
      setUserPlayheadBounds({
        start: Math.min(userPlayheadBoundsRef.current.start, startOfClickedMeasure),
        end: Math.max(userPlayheadBoundsRef.current.end ?? 0, endOfClickedMeasure),
      });
    } else {
      setUserPlayheadBounds({
        start: startOfClickedMeasure,
        end: endOfClickedMeasure,
      });
    }
  }, [beatWidthRef, _compositionByInstructionIdRef, inputModeRef, selectNotesByMeasure, setUserPlayheadBounds, timeSignatureRef, userPlayheadBoundsRef]);

  const handleMouseMove = useCallback((e: PointerEvent) => {
    if (inputModeRef.current === InputMode.SELECT) { return false; }

    const cursorBeat = beatFromEvent({ target: playheadNodeElementRef.current!, clientX: e.clientX - 30 }, beatWidthRef.current);
    if (cursorBeat === cursorPos.current || (
      !babyMouseDownRef.current && !playheadMouseDownRef.current
    )) return;
    if (babyMouseDownRef.current) {
      setPlayheadPosX((cursorBeat) * beatWidthRef.current);
      playCompositionNotesAtBeat({
        audioContext,
        composition: compositionRef.current,
        midiBeat: cursorBeat,
        tempo: tempoRef.current,
        userInstruments: userInstrumentsRef.current,
        incrementBabyDanceFrame,
      });
    } else if (playheadMouseDownRef.current) {
      if (cursorBeat < startingPlayheadCursorPos.current) {
        setUserPlayheadBounds({
          start: cursorBeat - 1,
          end: startingPlayheadCursorPos.current,
        });
      } else if (cursorBeat === startingPlayheadCursorPos.current) {
        setUserPlayheadBounds({
          start: cursorBeat - 1,
          end: cursorBeat,
        });
      } else {
        setUserPlayheadBounds({
          start: startingPlayheadCursorPos.current,
          end: cursorBeat,
        });
      }
    }
    cursorPos.current = cursorBeat;
  }, [audioContext, beatWidthRef, compositionRef, incrementBabyDanceFrame, inputModeRef, setPlayheadPosX, setUserPlayheadBounds, tempoRef, userInstrumentsRef]);

  const handleMouseUp = useCallback(() => {
    setPlayheadMouseDown(false);
    setBabyMouseDown(false);
    _setCodaMouseDown(false);
    startingPlayheadCursorPos.current = 0;
    cursorPos.current = 0
  }, [setBabyMouseDown, setPlayheadMouseDown]);
  
  useEffect(() => {
    document.addEventListener("pointerup", handleMouseUp);
    document.addEventListener("pointermove", handleMouseMove);
    return () => {
      document.removeEventListener("pointerup", handleMouseUp);
      document.removeEventListener("pointermove", handleMouseMove);
    };
  }, [handleMouseUp, handleMouseMove]);

  const codaSpriteY = useMemo(() => _isLooping ? -189 : -210, [_isLooping]);

  return (
    <PlayheadContainer
      ref={playheadNodeElementRef}
      onPointerDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      $beatHeight={_beatHeight}
    >
      <PlayheadTopLeftCoverup />
      <PlayheadStickyContainer $beatWidth={_beatWidth} $isMouseDown={_babyMouseDown || _codaMouseDown}>
        <PlayheadSubContainer>
          <BabyPlayheadImg
            onPointerDown={handleBabyMouseDown}
            src="trans.png"
            $frame={babyDanceFrame}
            $yFrame={babyDanceYFrame}
            $playheadPosX={_playheadPosX}
            $preventPointerEvents={_babyMouseDown || _playheadMouseDown || _codaMouseDown || _isPlaying}
            $beatWidth={_beatWidth}
          />
          <PixelCoda
            onPointerDown={handleCodaLeftMouseDown}
            $y={codaSpriteY}
            $left={_userPlayheadBounds?.start !== undefined ? _userPlayheadBounds.start * _beatWidth: 0}
            $inverted={false}
            $isHidden={_userPlayheadBounds === undefined || _userPlayheadBounds.start === 0}
            $preventPointerEvents={_babyMouseDown || _playheadMouseDown || _codaMouseDown}
            $opacity={1.0}
          />
          <PixelCoda
            onPointerDown={handleCodaRightMouseDown}
            $y={codaSpriteY}
            $left={_userPlayheadBounds?.end !== undefined ? (_userPlayheadBounds.end - 1) * _beatWidth : (endOfMeasureToLoopAtBeat - 1) * _beatWidth}
            $inverted={true}
            $isHidden={!_isLooping && _userPlayheadBounds?.end === undefined}
            $preventPointerEvents={_babyMouseDown || _playheadMouseDown || _codaMouseDown || _userPlayheadBounds?.end === undefined}
            $opacity={_userPlayheadBounds?.end === undefined ? 0.25 : 1.0}
          />
        </PlayheadSubContainer>
      </PlayheadStickyContainer>
    </PlayheadContainer>
  );
}