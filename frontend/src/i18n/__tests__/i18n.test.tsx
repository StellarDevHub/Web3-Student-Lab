import { describe, expect, it, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { I18nProvider, useI18n } from '../index';

describe('I18nProvider & useI18n hook', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = 'app:locale=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <I18nProvider>{children}</I18nProvider>
  );

  it('provides default locale as en', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe('en');
  });

  it('updates locale instantly and sets cookie and localStorage', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });

    act(() => {
      result.current.setLocale('es');
    });

    expect(result.current.locale).toBe('es');
    expect(window.localStorage.getItem('app:locale')).toBe('es');
    expect(document.cookie).toContain('app:locale=es');
  });

  it('formats currency according to locale', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });

    act(() => {
      result.current.setLocale('en');
    });
    expect(result.current.formatCurrency(100)).toContain('100.00');

    act(() => {
      result.current.setLocale('zh');
    });
    expect(result.current.formatCurrency(100)).toContain('100.00');
  });

  it('formats dates according to locale', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    const date = new Date('2026-01-01T00:00:00Z');

    expect(result.current.formatDate(date)).toBeTruthy();
  });

  it('supports pluralization helper', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });

    const singular = result.current.pluralize(1, 'courses.page.count_available', 'courses.page.count_available', { count: 1 });
    expect(singular).toBe('1 module available');

    const plural = result.current.pluralize(5, 'courses.page.count_available', 'courses.page.count_available', { count: 5 });
    expect(plural).toBe('5 modules available');
  });
});
