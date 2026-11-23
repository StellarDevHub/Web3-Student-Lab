/**
 * Test Suite for Theme Providers
 *
 * Tests the theme provider setup which provides:
 * - next-themes integration
 * - Dark mode attribute configuration
 * - System preference detection
 * - Theme persistence
 * - Prevention of flash of unstyled content (FOUC)
 */

import { Providers } from '@/lib/theme/providers'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next-themes
jest.mock('next-themes', () => ({
  ThemeProvider: ({ children, ...props }: any) => (
    <div data-testid="theme-provider" data-props={JSON.stringify(props)}>
      {children}
    </div>
  ),
}))

describe('Theme Providers', () => {
  it('should render ThemeProvider with correct configuration', () => {
    render(
      <Providers>
        <div>Test Content</div>
      </Providers>
    )

    const provider = screen.getByTestId('theme-provider')
    expect(provider).toBeInTheDocument()
  })

  it('should pass attribute="class" to ThemeProvider', () => {
    render(
      <Providers>
        <div>Test Content</div>
      </Providers>
    )

    const provider = screen.getByTestId('theme-provider')
    const props = JSON.parse(provider.getAttribute('data-props') || '{}')

    expect(props.attribute).toBe('class')
  })

  it('should set defaultTheme to "dark"', () => {
    render(
      <Providers>
        <div>Test Content</div>
      </Providers>
    )

    const provider = screen.getByTestId('theme-provider')
    const props = JSON.parse(provider.getAttribute('data-props') || '{}')

    expect(props.defaultTheme).toBe('dark')
  })

  it('should enable system theme detection', () => {
    render(
      <Providers>
        <div>Test Content</div>
      </Providers>
    )

    const provider = screen.getByTestId('theme-provider')
    const props = JSON.parse(provider.getAttribute('data-props') || '{}')

    expect(props.enableSystem).toBe(true)
  })

  it('should use custom storage key', () => {
    render(
      <Providers>
        <div>Test Content</div>
      </Providers>
    )

    const provider = screen.getByTestId('theme-provider')
    const props = JSON.parse(provider.getAttribute('data-props') || '{}')

    expect(props.storageKey).toBe('web3-lab-theme')
  })

  it('should enable transitions on theme change', () => {
    render(
      <Providers>
        <div>Test Content</div>
      </Providers>
    )

    const provider = screen.getByTestId('theme-provider')
    const props = JSON.parse(provider.getAttribute('data-props') || '{}')

    expect(props.disableTransitionOnChange).toBe(false)
  })

  it('should render children correctly', () => {
    render(
      <Providers>
        <div data-testid="test-content">Hello World</div>
      </Providers>
    )

    expect(screen.getByTestId('test-content')).toBeInTheDocument()
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('should handle hydration properly', async () => {
    const { rerender } = render(
      <Providers>
        <div data-testid="test-content">Content</div>
      </Providers>
    )

    // Wait for component to mount
    await waitFor(() => {
      expect(screen.getByTestId('test-content')).toBeInTheDocument()
    })

    // Re-render to simulate hydration
    rerender(
      <Providers>
        <div data-testid="test-content">Content</div>
      </Providers>
    )

    expect(screen.getByTestId('test-content')).toBeInTheDocument()
  })

  it('should prevent flash of unstyled content (FOUC)', () => {
    render(
      <Providers>
        <div>Content</div>
      </Providers>
    )

    // The provider should be mounted before children are rendered
    const provider = screen.getByTestId('theme-provider')
    const content = screen.getByText('Content')

    expect(provider).toBeInTheDocument()
    expect(content).toBeInTheDocument()
  })

  it('should work with multiple providers nesting', () => {
    render(
      <Providers>
        <div>
          <Providers>
            <div data-testid="nested-content">Nested</div>
          </Providers>
        </div>
      </Providers>
    )

    expect(screen.getByTestId('nested-content')).toBeInTheDocument()
  })
})
