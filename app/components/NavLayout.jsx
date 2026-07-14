'use client';

import React, { useEffect, useRef } from 'react';
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import PcSideNav from './PcSideNav';
import MobileBottomNav from './MobileBottomNav';

const MOBILE_MAIN_TABS = ['home', 'market', 'global', 'mine'];
const SWIPE_BLOCK_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="slider"]',
  '[role="dialog"]',
  '[role="menu"]',
  '[data-no-tab-swipe]',
  'canvas',
  'video',
  '.recharts-wrapper',
  '.PhotoView-Portal'
].join(',');

const isHorizontalScroller = (element) => {
  if (!(element instanceof HTMLElement) || element.scrollWidth <= element.clientWidth + 2) return false;
  const { overflowX } = window.getComputedStyle(element);
  return overflowX === 'auto' || overflowX === 'scroll';
};

const shouldIgnoreSwipe = (target, boundary) => {
  if (!(target instanceof Element) || target.closest(SWIPE_BLOCK_SELECTOR)) return true;

  let element = target;
  while (element && element !== boundary) {
    if (isHorizontalScroller(element)) return true;
    element = element.parentElement;
  }
  return false;
};

export default function NavLayout({
  children,
  mainTab,
  setMainTab,
  isMobile,
  containerRef,
  containerClassName,
  containerWidth,
  showThemeTransition,
  setShowThemeTransition,
  mobileBottomNavHidden
}) {
  const swipeX = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const gestureRef = useRef(null);
  const animationRef = useRef(null);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => () => animationRef.current?.stop(), []);

  const settleSwipe = (target = 0) => {
    animationRef.current?.stop();
    animationRef.current = animate(swipeX, target, {
      type: 'spring',
      stiffness: reduceMotion ? 700 : 520,
      damping: reduceMotion ? 60 : 38,
      mass: 0.72
    });
  };

  const resetGesture = () => {
    gestureRef.current = null;
    settleSwipe(0);
  };

  const handleTouchStart = (event) => {
    if (!isMobile || event.touches.length !== 1 || shouldIgnoreSwipe(event.target, event.currentTarget)) return;

    animationRef.current?.stop();
    const touch = event.touches[0];
    gestureRef.current = {
      id: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: performance.now(),
      axis: null,
      deltaX: 0
    };
  };

  const handleTouchMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture) return;

    const touch = Array.from(event.touches).find((item) => item.identifier === gesture.id);
    if (!touch) return;
    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;

    if (!gesture.axis) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) * 1.15 ? 'x' : 'y';
      if (gesture.axis === 'y') {
        gestureRef.current = null;
        return;
      }
    }

    gesture.deltaX = deltaX;
    if (event.cancelable) event.preventDefault();

    const currentIndex = MOBILE_MAIN_TABS.indexOf(mainTab);
    const atStart = currentIndex === 0 && deltaX > 0;
    const atEnd = currentIndex === MOBILE_MAIN_TABS.length - 1 && deltaX < 0;
    const resistance = atStart || atEnd ? 0.28 : 0.72;
    const visualDelta = Math.sign(deltaX) * Math.min(Math.abs(deltaX) * resistance, 88);
    swipeX.set(visualDelta);
  };

  const handleTouchEnd = (event) => {
    const gesture = gestureRef.current;
    if (!gesture) return;

    const touch = Array.from(event.changedTouches).find((item) => item.identifier === gesture.id);
    if (touch) gesture.deltaX = touch.clientX - gesture.startX;
    gestureRef.current = null;

    if (gesture.axis !== 'x') {
      settleSwipe(0);
      return;
    }

    const elapsed = Math.max(performance.now() - gesture.startTime, 1);
    const distance = Math.abs(gesture.deltaX);
    const velocity = distance / elapsed;
    const shouldSwitch = distance >= 56 || (distance >= 32 && velocity >= 0.32);
    const direction = gesture.deltaX < 0 ? 1 : -1;
    const currentIndex = MOBILE_MAIN_TABS.indexOf(mainTab);
    const nextIndex = currentIndex + direction;

    suppressClickUntilRef.current = performance.now() + 350;
    if (!shouldSwitch || nextIndex < 0 || nextIndex >= MOBILE_MAIN_TABS.length) {
      settleSwipe(0);
      return;
    }

    setMainTab(MOBILE_MAIN_TABS[nextIndex]);
    swipeX.set(direction > 0 ? 42 : -42);
    settleSwipe(0);
  };

  const handleClickCapture = (event) => {
    if (performance.now() >= suppressClickUntilRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickUntilRef.current = 0;
  };

  return (
    <>
      <PcSideNav value={mainTab} onChange={setMainTab} />
      <motion.div
        ref={containerRef}
        className={`${containerClassName}${isMobile ? ' mobile-tab-swipe-surface' : ''}`}
        data-main-tab={mainTab}
        style={{ width: isMobile ? '100%' : containerWidth, x: swipeX }}
        onTouchStartCapture={handleTouchStart}
        onTouchMoveCapture={handleTouchMove}
        onTouchEndCapture={handleTouchEnd}
        onTouchCancelCapture={resetGesture}
        onClickCapture={handleClickCapture}
      >
        <AnimatePresence>
          {showThemeTransition && (
            <motion.div
              className="theme-transition-overlay"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                className="theme-transition-circle"
                initial={{ scale: 0, opacity: 0.5 }}
                animate={{ scale: 2.5, opacity: 0 }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                onAnimationComplete={() => setShowThemeTransition(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {children}

        {isMobile && (
          <MobileBottomNav value={mainTab} onChange={setMainTab} hidden={mobileBottomNavHidden && mainTab === 'home'} />
        )}
      </motion.div>
    </>
  );
}
