"use client";

import { motion, useSpring, useMotionValue } from "framer-motion";
import { useEffect, useState, useRef } from "react";

interface RemoteCursorProps {
  x: number;
  y: number;
  height: number;
  color: string;
  name: string;
  isActive: boolean;
  visible: boolean;
}

const SPRING_CONFIG = {
  stiffness: 300,
  damping: 25,
  mass: 0.5,
};

const NAME_TAG_FADE_DELAY = 2000;
const NAME_TAG_FADE_DURATION = 800;

export function RemoteCursor({
  x,
  y,
  height,
  color,
  name,
  isActive,
  visible,
}: RemoteCursorProps) {
  const [showNameTag, setShowNameTag] = useState(true);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use motion values with spring physics for smooth cursor movement
  const motionX = useMotionValue(x);
  const motionY = useMotionValue(y);
  const springX = useSpring(motionX, SPRING_CONFIG);
  const springY = useSpring(motionY, SPRING_CONFIG);

  useEffect(() => {
    motionX.set(x);
    motionY.set(y);
  }, [x, y, motionX, motionY]);

  // Handle name tag visibility based on activity
  useEffect(() => {
    if (isActive) {
      setShowNameTag(true);

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }

      // Start fade-out timer after inactivity
      inactivityTimerRef.current = setTimeout(() => {
        fadeTimerRef.current = setTimeout(() => {
          setShowNameTag(false);
        }, NAME_TAG_FADE_DURATION);
      }, NAME_TAG_FADE_DELAY);
    }

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
      }
    };
  }, [isActive]);

  if (!visible) {
    return null;
  }

  const cursorHeight = Math.max(height, 18);

  return (
    <motion.div
      className="pointer-events-none absolute left-0 top-0 z-50"
      style={{
        x: springX,
        y: springY,
      }}
    >
      {/* Cursor indicator */}
      <div className="relative">
        <svg
          width="20"
          height="24"
          viewBox="0 0 20 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-lg"
          style={{
            color: color,
            transform: "translate(-2px, -2px)",
          }}
        >
          <path
            d="M4.5 0L4.5 18L8 14.5L11.5 21L14 19.5L10.5 13L16 13L4.5 0Z"
            fill="currentColor"
            stroke="white"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>

        {/* Name tag */}
        <motion.div
          initial={{ opacity: 1, scale: 1 }}
          animate={{
            opacity: showNameTag ? 1 : 0,
            scale: showNameTag ? 1 : 0.9,
          }}
          transition={{
            opacity: { duration: NAME_TAG_FADE_DURATION / 1000 },
            scale: { duration: 0.2 },
          }}
          className="absolute left-4 top-4 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold text-white shadow-md"
          style={{
            backgroundColor: color,
          }}
        >
          {name}
        </motion.div>
      </div>

      {/* Cursor vertical line indicator at the exact text position */}
      <div
        className="absolute rounded-sm opacity-60"
        style={{
          left: 0,
          top: 0,
          width: 2,
          height: cursorHeight,
          backgroundColor: color,
          transform: "translateX(-1px)",
        }}
      />
    </motion.div>
  );
}
