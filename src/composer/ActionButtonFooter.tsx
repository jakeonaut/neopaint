import React, { useCallback, useContext, useMemo } from 'react';
import styled, { CSSProperties } from "styled-components";
import { CompositionContext } from './contexts/CompositionContextProvider';
import { SongSettingsContext } from './contexts/SongSettingsContextProvider';
import { InputMode, SubdivisionType, TimeSignature } from './consts';
import { SubdivisionTypeContext } from './contexts/SubdivisionTypeContextProvider';
import { ClipboardContext } from './contexts/ClipboardContextProvider';
import { TimeSignatureContext } from './contexts/TimeSignatureContextProvider';
import { PlayheadContext } from './contexts/PlayheadContextProvider';
import { PlayTheSongContext } from './contexts/PlayTheSongContextProvider';
import { MouseDownContext } from './contexts/MouseDownContextProvider';
import { ClickedSelectedNotesContext } from './contexts/ClickedSelectedNotesContextProvider';

export const ActionButtonsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

export const ActionButton = styled.div`
  font-size: 24px;
  cursor: pointer;
  image-rendering: pixelated;
  user-select: none;
`;

const PixelActionButton = styled(ActionButton)`
  border: 1px solid black;
  padding-right: 1px;
`;

const PixelButton = styled.div<{ $y: number, $inverted: boolean }>`
  background: ${({ $y, $inverted }) => `url('./toolicons1x.png') repeat scroll ${
    $inverted ? '-25px' : '0'
  } ${$y}px transparent`};
  width: 25px;
  height: 21px;
  image-rendering: pixelated;
`;

function PlayStopButton() {
  const {
    handleStopComposition,
    handlePlayComposition,
    handleStopLoop,
    handleStartLoop,
    _isPlaying,
    _isLooping,
  } = useContext(PlayTheSongContext)!;

  return (
    <>
      <ActionButton onClick={_isPlaying ? handleStopComposition : () => handlePlayComposition({
        shouldLoop: _isLooping,
      })} title="Play/Stop: Space (Shift+Space to toggle Loop)">
        {_isPlaying ? '⏹️' : '▶️'}
      </ActionButton>
      <ActionButton onClick={_isLooping ? handleStopLoop : handleStartLoop}>
        {!_isLooping ? '📴' : '🔁'}
      </ActionButton>
    </>
  );
}

function CutButton({ onClick } : { onClick: () => void }) {
  const { _selectedNotes, _clickedNote } = useContext(ClickedSelectedNotesContext)!;
  return (
    <ActionButton
      title="Cut: ctrl+x"
      onClick={onClick}
      style={Object.values(_selectedNotes).length > 0 || _clickedNote !== undefined ? {} : { filter: 'opacity(0.5)' }}
    >
      ✂️
    </ActionButton>
  );
}

function CopyButton({ onClick } : { onClick: () => void }) {
  const { _selectedNotes, _clickedNote } = useContext(ClickedSelectedNotesContext)!;
  const containerStyle = useMemo(
    () => (Object.values(_selectedNotes).length > 0 || _clickedNote !== undefined ? {} : { filter: 'opacity(0.5)' }),
    [_clickedNote, _selectedNotes]
  );
  return (
    <ActionButton
      title="Copy: ctrl+c"
      onClick={onClick}
      style={containerStyle}
    >
      📑
    </ActionButton>
  );
}

function PasteButton({ onClick } : { onClick: () => void }) {
  const { _copiedNotes } = useContext(ClipboardContext)!;
  const containerStyle = useMemo(() => (_copiedNotes.length > 0 ? {} : { filter: 'opacity(0.5)' }), [_copiedNotes.length]);
  return (
    <ActionButton
      title="Paste: ctrl+v"
      onClick={onClick}
      style={containerStyle}
    >
      📋
    </ActionButton>
  );
}


function InputDefaultButton({
  _inputMode,
  setInputMode,
}: {
  _inputMode: InputMode,
  setInputMode: (inputMode: InputMode, isMouseDown: boolean) => void
}) {
  const { isCompositionMouseDownRef } = useContext(MouseDownContext)!;
  const setInputModeToDefault = useCallback(
    () => setInputMode(InputMode.DEFAULT, isCompositionMouseDownRef.current),
    [isCompositionMouseDownRef, setInputMode]
  );
  const containerStyle = useMemo(() => ({
    paddingBottom: 4,
    paddingTop: 1,
    ...(_inputMode === InputMode.DEFAULT ? { background: 'gray', cursor: 'unset', } : {}),
  } as CSSProperties), [_inputMode]);

  return (
    <PixelActionButton
      onClick={setInputModeToDefault}
      style={containerStyle}>
        <PixelButton $y={-147} $inverted={_inputMode === InputMode.DEFAULT} title="Place Notes" />
    </PixelActionButton>
  );
}

function InputSelectionButton({
  _inputMode,
  setInputMode,
}: {
  _inputMode: InputMode,
  setInputMode: (inputMode: InputMode, isMouseDown: boolean) => void
}) {
  const { isCompositionMouseDownRef } = useContext(MouseDownContext)!;
  const setInputModeToSelect = useCallback(
    () => setInputMode(InputMode.SELECT, isCompositionMouseDownRef.current),
    [isCompositionMouseDownRef, setInputMode]
  );
  const containerStyle = useMemo(() => ({
    paddingBottom: 3,
    paddingTop: 2,
    marginLeft: -6,
    ...(_inputMode === InputMode.SELECT ? { background: 'gray', cursor: 'unset' } : {}),
  } as CSSProperties), [_inputMode]);
  return (
    <PixelActionButton
      onClick={setInputModeToSelect}
      style={containerStyle}>
      <PixelButton $y={-21} $inverted={_inputMode === InputMode.SELECT} title="Select Notes: Click or Hold Shift" />
    </PixelActionButton>
  );
}

function InputDeleteButton({
  _inputMode,
  setInputMode,
}: {
  _inputMode: InputMode,
  setInputMode: (inputMode: InputMode, isMouseDown: boolean) => void
}) {
  const { isCompositionMouseDownRef } = useContext(MouseDownContext)!;
  const setInputModeToDelete = useCallback(
    () => setInputMode(InputMode.DELETE, isCompositionMouseDownRef.current),
    [isCompositionMouseDownRef, setInputMode]
  );
  const containerStyle = useMemo(() => ({
    paddingBottom: 3,
    paddingTop: 2,
    marginLeft: -6,
    ...(_inputMode === InputMode.DELETE ? { background: 'gray', cursor: 'unset' } : {}),
  } as CSSProperties), [_inputMode]);
  return (
    <PixelActionButton
      onClick={setInputModeToDelete}
      style={containerStyle}>
      <PixelButton $y={-105} $inverted={_inputMode === InputMode.DELETE} title="Delete Notes: Click or Hold Ctrl/Cmd" />
    </PixelActionButton>
  );
}

function InputSubdivisionTypeButton() {
  const { 
    _subdivisionType,
    subdivisionTypeRef,
    setSubdivisionType,
  } = useContext(SubdivisionTypeContext)!;
  const onToggleSubdivisionType = useCallback(() => {
    if (subdivisionTypeRef.current === SubdivisionType.q) {
      setSubdivisionType(SubdivisionType.t);
    } else if (subdivisionTypeRef.current === SubdivisionType.t) {
      setSubdivisionType(SubdivisionType.q);
    }
  }, [setSubdivisionType, subdivisionTypeRef]);

  const containerStyle = useMemo(() => ({ paddingBottom: 4, paddingTop: 1, paddingRight: 0 } as CSSProperties), []);

  return (
    <PixelActionButton
      onClick={onToggleSubdivisionType}
      style={containerStyle}>
      <PixelButton $y={-63} $inverted={_subdivisionType === SubdivisionType.t} 
      title="Sixteenth or Triplet Mode: Q" />
    </PixelActionButton>
  );
}

function InputTimeSignatureButton() {
  const { 
    _timeSignature,
    timeSignatureRef,
    setTimeSignature,
  } = useContext(TimeSignatureContext)!;
  const onToggleTimeSignature = useCallback(() => {
    if (timeSignatureRef.current === TimeSignature.ts4_4) {
      setTimeSignature(TimeSignature.ts3_4);
    } else if (timeSignatureRef.current === TimeSignature.ts3_4) {
      setTimeSignature(TimeSignature.ts4_4);
    }
  }, [setTimeSignature, timeSignatureRef]);

  const containerStyle = useMemo(() => ({
    paddingBottom: 4,
    paddingTop: 1,
    // position: 'absolute',
    // left: 3,
    paddingRight: 0 
  } as CSSProperties), []);

  return (
    <PixelActionButton
      onClick={onToggleTimeSignature}
      style={containerStyle}>
      <PixelButton $y={-84} $inverted={_timeSignature === TimeSignature.ts3_4} 
        title="Time Signature: R" />
    </PixelActionButton>
  );
}

function TempoInput() {
  const { _tempo, setTempo } = useContext(SongSettingsContext)!;
  const onTempoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTempo(parseInt(e.target.value));
  }, [setTempo]);

  return (
    <>
      <label htmlFor="tempo" style={{position: "relative", left: "8px"}}>
        Tempo:
      </label>
      <input
        id="tempo"
        type="range"
        min="20"
        max="200"
        value={_tempo}
        onChange={onTempoChange}
        style={{width: "70px"}}
      />
      <label htmlFor="tempo" style={{position: "relative", left: "-2px"}}>
        {_tempo}
      </label>
    </>
  );
}

export function ActionButtonFooter({
  _inputMode,
  setInputMode,
  tryCopySelectedNotes,
  tryCutSelectedNotes,
  tryPasteCopiedNotes,
}: {
  _inputMode: InputMode,
  setInputMode: (inputMode: InputMode, isMouseDown: boolean) => void,
  tryCopySelectedNotes: () => void,
  tryCutSelectedNotes: () => void,
  tryPasteCopiedNotes: (e: PointerEvent | KeyboardEvent) => void
}) {
  const containerStyle = useMemo(() => ({ marginTop: 1, justifyContent: 'center' }), []);
  return (
    <ActionButtonsContainer style={containerStyle}>
      <PlayStopButton />
      <TempoInput />
      <InputDefaultButton _inputMode={_inputMode} setInputMode={setInputMode} />
      <InputDeleteButton _inputMode={_inputMode} setInputMode={setInputMode} />
      <InputSelectionButton _inputMode={_inputMode} setInputMode={setInputMode} />
      &nbsp;
      <InputTimeSignatureButton />
      <InputSubdivisionTypeButton />
      {/* <!-- These don't seem to be working right. But ctrl+c etc. does --> */}
      {/* <CutButton onClick={tryCutSelectedNotes} />
      <CopyButton onClick={tryCopySelectedNotes} />
      <PasteButton onClick={tryPasteCopiedNotes} /> */}
    </ActionButtonsContainer>
  );
}