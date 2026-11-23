/**
 * Test Suite for useThemeMode Hook
 *
 * Tests the theme mode hook which provides:
 * - Current theme state (light/dark)
 * - Theme toggle functionality
 * - System preference detection
 * - Theme color utilities
 * - Proper hydration handling
 */

import { useThemeMode } from '@/hooks/useThemeMode'
import { act, renderHook } from '@testing-library/react'

// Mock useTheme from next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn(),
}))

import { useTheme } from 'next-themes'

describe('useThemeMode Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('Theme Detection', () => {
    it('should return dark theme when theme is "dark"', () => {
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'dark',
        setTheme: jest.fn(),
        systemTheme: 'dark',
      })

      const { result } = renderHook(() => useThemeMode())

      expect(result.current.isDark).toBe(true)
      expect(result.current.isLight).toBe(false)
      expect(result.current.theme).toBe('dark')
    })

    it('should return light theme when theme is "light"', () => {
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'light',
        setTheme: jest.fn(),
        systemTheme: 'light',
      })

      const { result } = renderHook(() => useThemeMode())

      expect(result.current.isDark).toBe(false)
      expect(result.current.isLight).toBe(true)
      expect(result.current.theme).toBe('light')
    })

    it('should use system theme when theme is "system"', () => {
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'system',
        setTheme: jest.fn(),
        systemTheme: 'dark',
      })

      const { result } = renderHook(() => useThemeMode())

      expect(result.current.theme).toBe('dark')
      expect(result.current.isDark).toBe(true)
    })
  })

  describe('Hydration', () => {
    it('should have mounted = false initially', () => {
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'dark',
        setTheme: jest.fn(),
        systemTheme: 'dark',
      })

      const { result } = renderHook(() => useThemeMode())

      // Initially not mounted
      expect(result.current.mounted).toBe(false)
    })

    it('should have mounted = true after mount', () => {
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'dark',
        setTheme: jest.fn(),
        systemTheme: 'dark',
      })

      const { result } = renderHook(() => useThemeMode())

      act(() => {
        jest.runAllTimers()
      })

      expect(result.current.mounted).toBe(true)
    })
  })

  describe('Theme Toggle', () => {
    it('should toggle from dark to light', () => {
      const setThemeMock = jest.fn()
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'dark',
        setTheme: setThemeMock,
        systemTheme: 'dark',
      })

      const { result } = renderHook(() => useThemeMode())

      act(() => {
        result.current.toggleTheme()
      })

      expect(setThemeMock).toHaveBeenCalledWith('light')
    })

    it('should toggle from light to dark', () => {
      const setThemeMock = jest.fn()
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'light',
        setTheme: setThemeMock,
        systemTheme: 'light',
      })

      const { result } = renderHook(() => useThemeMode())

      act(() => {
        result.current.toggleTheme()
      })

      expect(setThemeMock).toHaveBeenCalledWith('dark')
    })
  })

  describe('Theme Mode Setting', () => {
    it('should set theme to light', () => {
      const setThemeMock = jest.fn()
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'dark',
        setTheme: setThemeMock,
        systemTheme: 'dark',
      })

      const { result } = renderHook(() => useThemeMode())

      act(() => {
        result.current.setThemeMode('light')
      })

      expect(setThemeMock).toHaveBeenCalledWith('light')
    })

    it('should set theme to dark', () => {
      const setThemeMock = jest.fn()
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'light',
        setTheme: setThemeMock,
        systemTheme: 'light',
      })

      const { result } = renderHook(() => useThemeMode())

      act(() => {
        result.current.setThemeMode('dark')
      })

      expect(setThemeMock).toHaveBeenCalledWith('dark')
    })

    it('should set theme to system', () => {
      const setThemeMock = jest.fn()
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'dark',
        setTheme: setThemeMock,
        systemTheme: 'dark',
      })

      const { result } = renderHook(() => useThemeMode())

      act(() => {
        result.current.setThemeMode('system')
      })

      expect(setThemeMock).toHaveBeenCalledWith('system')
    })
  })

  describe('Color Utilities', () => {
    it('should return dark colors when in dark mode', () => {
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'dark',
        setTheme: jest.fn(),
        systemTheme: 'dark',
      })

      const { result } = renderHook(() => useThemeMode())

      expect(result.current.colors).toBeDefined()
      // Verify that colors object has expected structure
      expect(typeof result.current.colors).toBe('object')
    })

    it('should return light colors when in light mode', () => {
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'light',
        setTheme: jest.fn(),
        systemTheme: 'light',
      })

      const { result } = renderHook(() => useThemeMode())

      expect(result.current.colors).toBeDefined()
      expect(typeof result.current.colors).toBe('object')
    })

    it('should return chart colors', () => {
      ;(useTheme as jest.Mock).mockReturnValue({
        theme: 'dark',
        setTheme: jest.fn(),
        systemTheme: 'dark',
      })

      const { result } = renderHook(() => useThemeMode())

      expect(result.current.chartColors).toBeDefined()
      expect(typeof result.current.chartColors).toBe('object')
    })
  })
})
