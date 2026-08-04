import React, { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { beatFromEvent, getRelativeBeatWidth, lightColor, mediumColor, MidiBeat, midiNoteFromEvent, MidiNoteNum, pianoRollBeats, pianoRollKeys, SubdivisionType, TimeSignature, veryLightColor } from "../consts";
import styled from "styled-components";
import { toMidi } from "../../smplr/smplr/midi";
import { DebouncedState } from "use-debounce/dist/useDebouncedCallback";
import { BeatSizeContext } from "../contexts/BeatSizeContextProvider";
import { SubdivisionTypeContext } from "../contexts/SubdivisionTypeContextProvider";
import { TimeSignatureContext } from "../contexts/TimeSignatureContextProvider";

const GridContainer = styled.div<{
  $beatWidth: number,
  $beatHeight: number,
}>`
  width: ${({ $beatWidth }) => `${$beatWidth * pianoRollBeats.length}px`};
  height: ${({ $beatHeight }) => `${$beatHeight * pianoRollKeys.length + 17}px`};
  cursor: pointer;
  pointer-events: unset;
`;

type MouseHandler = (e: React.PointerEvent<HTMLDivElement>, midiBeat: MidiBeat, midiNote: MidiNoteNum) => boolean | undefined;

export function CompositionGrid({
  children: allRenderedNotes,
  playheadNode,
  renderedPianoRollKeys,
  handleMouseDown,
  handleDoubleClick,
  handleMouseMove,
}: {
  children: React.ReactNode,
  playheadNode: React.ReactNode,
  renderedPianoRollKeys: React.ReactNode,
  handleMouseDown: MouseHandler,
  handleDoubleClick: MouseHandler,
  handleMouseMove: DebouncedState<MouseHandler>,
}) {
  const { _beatWidth, _beatHeight } = useContext(BeatSizeContext)!;
  const { _subdivisionType } = useContext(SubdivisionTypeContext)!;
  const subdivision = _subdivisionType === SubdivisionType.q ? 4 : 3;
  const { _timeSignature } = useContext(TimeSignatureContext)!;
  const timeSignature = _timeSignature === TimeSignature.ts4_4 ? 4 : 3
  const beatWidth = useMemo(() => getRelativeBeatWidth(_subdivisionType, _beatWidth), [_subdivisionType, _beatWidth]);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const _canvasSizeRef = useRef({ width: 0, height: 0});
  const handleResize = useCallback(() => {
    if (gridRef) {
      _canvasSizeRef.current = { width: gridRef.current!.clientWidth - 1, height: gridRef.current!.clientHeight - 17 };
    }
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      // Does this clear the image? idk..
      canvas.width = 0;
      canvas.height = 0;
      canvas.width = _canvasSizeRef.current.width;
      canvas.height = _canvasSizeRef.current.height;
      canvas.style.width = `${_canvasSizeRef.current.width}px`;
      canvas.style.height = `${_canvasSizeRef.current.height}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.lineWidth = 1;
      const lineDash = [2, 2];
      const CANVAS_HALF_PIXEL_OFFSET = 0.5;
      // Draw the vertical lines
      for (let i = 0; i < pianoRollBeats.length - 1; i++) {
        const idx = i + 1;
        ctx.beginPath();
        ctx.setLineDash(idx % subdivision === 0 ? [] : lineDash);
        ctx.strokeStyle = idx % (subdivision * timeSignature) === 0
          ? "black"
          : idx % subdivision === 0 
            ? mediumColor
            : veryLightColor;
        const x = (beatWidth * idx) - CANVAS_HALF_PIXEL_OFFSET;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      // Draw the horizontal lines
      for (let j = 0; j < pianoRollKeys.length - 1; j++) {
        ctx.beginPath();
        const midiNote = pianoRollKeys[j];
        ctx.setLineDash(midiNote[0] === "C" ? [] : lineDash);
        ctx.strokeStyle = midiNote[0] === "C" ? mediumColor : lightColor;
        const y = ((_beatHeight-1) * (j+1)) - CANVAS_HALF_PIXEL_OFFSET;
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }
  }, [_beatHeight, beatWidth, subdivision, timeSignature]);
  const canvas = useMemo(() => <canvas
    width={_canvasSizeRef.current.width}
    height={_canvasSizeRef.current.height}
    style={{
      width: `${_canvasSizeRef.current.width}px`,
      height: `${_canvasSizeRef.current.height}px`,
      imageRendering: "pixelated",
      position: "relative",
      top: 17,
      left: 30,
      zIndex: -2,
    }}
    ref={canvasRef}
  ></canvas>, []);
  useEffect(() => {
    handleResize();
    // Don't actually need this... Grid doesn't resize, will always stay same size inside the resizing scroller window.
    // window.addEventListener("resize", handleResize);
    // return () => {
    //   window.removeEventListener("resize", handleResize);
    // };
  }, [handleResize]);
  // -1. for some reason _beatHeight is set to 15 but the piano roll keys and grid uses 14.
  const beatHeight = _beatHeight - 1;

  const getMidiBeatAndNoteFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const midiBeat = beatFromEvent({
      target: e.target as unknown as HTMLDivElement,
      clientX: e.clientX - 30,
    }, beatWidth);
    const midiNote = midiNoteFromEvent({
      target: e.target as unknown as HTMLDivElement,
      clientY: e.clientY - 17,
    }, beatHeight);
    return {midiBeat, midiNote};
  }
  
  return (
    <>
      {playheadNode}
      {renderedPianoRollKeys}
      {allRenderedNotes}
      <GridContainer
        $beatWidth={_beatWidth}
        $beatHeight={beatHeight}
        ref={gridRef}
        onPointerDown={(e) => {
          const {midiBeat, midiNote} = getMidiBeatAndNoteFromEvent(e);
          handleMouseDown(e, midiBeat, toMidi(midiNote)!);
        }}
        onPointerMove={(e) => {
          const {midiBeat, midiNote} = getMidiBeatAndNoteFromEvent(e);
          handleMouseMove(e, midiBeat, toMidi(midiNote)!);
        }}
        onDoubleClick={(e) => {
          const {midiBeat, midiNote} = getMidiBeatAndNoteFromEvent(e as any as React.PointerEvent<HTMLDivElement>);
          handleDoubleClick(e as any as React.PointerEvent<HTMLDivElement>, midiBeat, toMidi(midiNote)!);
        }}
      >
        {canvas}
      </GridContainer>
    </>
  );
}
