import React, { createContext, useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_BEAT_WIDTH, DEFAULT_BEAT_HEIGHT, DEFAULT_BEAT_WIDTH_MOBILE, DEFAULT_BEAT_HEIGHT_MOBILE } from "../consts";

export function BeatSizeContextProvider({ children } : { children: React.ReactNode }) {
  const [_beatWidth, _setBeatWidth] = useState(DEFAULT_BEAT_WIDTH);
  const [_beatHeight, _setBeatHeight] = useState(DEFAULT_BEAT_HEIGHT);

  const beatWidthRef = useRef(_beatWidth);
  const beatHeightRef = useRef(_beatHeight);

  const setBeatWidth = useCallback((newBeatWidth: number) => {
    beatWidthRef.current = newBeatWidth;
    _setBeatWidth(newBeatWidth);
  }, []);

  const setBeatHeight = useCallback((newBeatHeight: number) => {
    beatHeightRef.current = newBeatHeight;
    _setBeatHeight(newBeatHeight);
  }, []);

  const onResize = useCallback(() => {
    setBeatWidth(DEFAULT_BEAT_WIDTH);
    setBeatHeight(DEFAULT_BEAT_HEIGHT);
    if (window.matchMedia("(pointer: coarse)").matches) {
      setBeatWidth(DEFAULT_BEAT_WIDTH_MOBILE);
      setBeatHeight(DEFAULT_BEAT_HEIGHT_MOBILE);
    }
  }, [setBeatHeight, setBeatWidth]);
  useEffect(() => {
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    }
  }, [onResize]);

  return (
    <BeatSizeContext value={{
      _beatWidth,
      beatWidthRef,
      _beatHeight,
      beatHeightRef,
    }}>
      {children}
    </BeatSizeContext>
  );
}

export const BeatSizeContext = createContext<{
  _beatWidth: number,
  beatWidthRef: React.RefObject<number>,
  _beatHeight: number,
  beatHeightRef: React.RefObject<number>,
} | undefined>(undefined);