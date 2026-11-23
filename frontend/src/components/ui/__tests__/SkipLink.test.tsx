import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SkipLink, SkipLinkTarget } from '../SkipLink';

describe('SkipLink', () => {
  it('renders a skip link with default text', () => {
    render(<SkipLink />);
    const link = screen.getByText('Skip to main content');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('renders with custom main content ID', () => {
    render(<SkipLink mainContentId="custom-content" />);
    const links = screen.getAllByText('Skip to main content');
    const link = links.find((l) => l.getAttribute('href') === '#custom-content');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '#custom-content');
  });

  it('renders with custom href', () => {
    render(<SkipLink href="#app-content" />);
    const links = screen.getAllByText('Skip to main content');
    const link = links.find((l) => l.getAttribute('href') === '#app-content');
    expect(link).toBeInTheDocument();
  });

  it('renders custom children text', () => {
    render(<SkipLink>Skip to navigation</SkipLink>);
    expect(screen.getByText('Skip to navigation')).toBeInTheDocument();
  });

  it('renders multiple skip link targets', () => {
    render(
      <SkipLink
        targets={[
          { id: 'content', label: 'Skip to content' },
          { id: 'nav', label: 'Skip to nav' },
        ]}
      />
    );

    expect(screen.getByText('Skip to main content')).toBeInTheDocument();
    expect(screen.getByText('Skip to content')).toBeInTheDocument();
    expect(screen.getByText('Skip to nav')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<SkipLink className="custom-class" />);
    const link = document.querySelector('.custom-class');
    expect(link).toBeInTheDocument();
  });

  it('passes additional props to the anchor element', () => {
    render(<SkipLink data-testid="skip-link-test" />);
    expect(screen.getByTestId('skip-link-test')).toBeInTheDocument();
  });

  it('renders skip links with skip-link class for CSS visibility', () => {
    render(
      <SkipLink
        targets={[
          { id: 'content', label: 'Skip to content' },
        ]}
      />
    );

    const links = document.querySelectorAll('.skip-link');
    expect(links.length).toBeGreaterThanOrEqual(2);
  });
});

describe('SkipLinkTarget', () => {
  it('renders a main element with id and tabIndex', () => {
    render(
      <SkipLinkTarget id="main-content">
        <p>Content</p>
      </SkipLinkTarget>
    );

    const element = document.getElementById('main-content');
    expect(element).toBeInTheDocument();
    expect(element?.tagName).toBe('MAIN');
    expect(element?.tabIndex).toBe(-1);
  });

  it('renders with custom element type', () => {
    render(
      <SkipLinkTarget id="section-1" as="section">
        <p>Section content</p>
      </SkipLinkTarget>
    );

    const element = document.getElementById('section-1');
    expect(element?.tagName).toBe('SECTION');
  });

  it('renders as a div element', () => {
    render(
      <SkipLinkTarget id="div-target" as="div">
        <p>Div content</p>
      </SkipLinkTarget>
    );

    const element = document.getElementById('div-target');
    expect(element?.tagName).toBe('DIV');
  });

  it('renders as a nav element', () => {
    render(
      <SkipLinkTarget id="nav-target" as="nav">
        <p>Nav content</p>
      </SkipLinkTarget>
    );

    const element = document.getElementById('nav-target');
    expect(element?.tagName).toBe('NAV');
  });

  it('applies custom className', () => {
    render(
      <SkipLinkTarget id="test" className="custom-class">
        <p>Test</p>
      </SkipLinkTarget>
    );

    const element = document.getElementById('test');
    expect(element?.className).toContain('custom-class');
  });

  it('renders children', () => {
    render(
      <SkipLinkTarget id="test">
        <span data-testid="child">Child content</span>
      </SkipLinkTarget>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
