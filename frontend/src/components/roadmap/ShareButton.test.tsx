import { render, screen, fireEvent, act } from '@testing-library/react';
import ShareButton from './ShareButton';

const props = { title: 'Foundations', description: 'Ledger basics, accounts, and trustlines.' };

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { href: 'http://localhost/roadmap' },
    writable: true,
  });
  Object.assign(navigator, {
    clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
  window.open = jest.fn();
});

test('renders X, in, and Copy buttons', () => {
  render(<ShareButton {...props} />);
  expect(screen.getByText('X')).toBeInTheDocument();
  expect(screen.getByText('in')).toBeInTheDocument();
  expect(screen.getByText('Copy')).toBeInTheDocument();
});

test('calls window.open with Twitter URL on X click', () => {
  render(<ShareButton {...props} />);
  fireEvent.click(screen.getByText('X'));
  expect(window.open).toHaveBeenCalledWith(
    expect.stringContaining('twitter.com/intent/tweet'),
    '_blank',
    'noopener,noreferrer',
  );
});

test('calls clipboard.writeText with current URL on Copy click', async () => {
  render(<ShareButton {...props} />);
  await act(async () => {
    fireEvent.click(screen.getByText('Copy'));
  });
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost/roadmap');
});

test('shows Copied! after copy and reverts after 1.5s', async () => {
  jest.useFakeTimers();
  render(<ShareButton {...props} />);
  await act(async () => {
    fireEvent.click(screen.getByText('Copy'));
  });
  expect(screen.getByText('Copied!')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1500));
  expect(screen.getByText('Copy')).toBeInTheDocument();
  jest.useRealTimers();
});
