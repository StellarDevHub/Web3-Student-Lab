import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Dialog, DialogTitle, DialogDescription, DialogContent, DialogHeader } from '../Dialog';

describe('Dialog', () => {
  it('renders when open', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogHeader>
          <DialogTitle>Test Dialog</DialogTitle>
          <DialogDescription>Test description</DialogDescription>
        </DialogHeader>
        <DialogContent>Dialog body</DialogContent>
      </Dialog>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Test Dialog')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogTitle>Hidden</DialogTitle>
      </Dialog>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('announces dialog title and description via aria attributes', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogHeader>
          <DialogTitle>Accessible Title</DialogTitle>
          <DialogDescription>Accessible description text</DialogDescription>
        </DialogHeader>
        <DialogContent>Body</DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
    const labelledBy = dialog.getAttribute('aria-labelledby')!;
    const describedBy = dialog.getAttribute('aria-describedby')!;
    expect(labelledBy).toMatch(/-title$/);
    expect(describedBy).toMatch(/-description$/);
    expect(screen.getByText('Accessible Title')).toHaveAttribute('id', labelledBy);
    expect(screen.getByText('Accessible description text')).toHaveAttribute('id', describedBy);
  });

  it('closes on Escape key', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogTitle>Escapable</DialogTitle>
        <DialogContent>Body</DialogContent>
      </Dialog>
    );

    const container = screen.getByRole('dialog').querySelector('[ref]') || screen.getByRole('dialog').firstChild!;
    const inner = screen.getByRole('dialog').querySelector('[class*="max-w-md"]')!;
    fireEvent.keyDown(inner, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('traps focus inside the dialog', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <button>First</button>
          <button>Second</button>
          <button>Third</button>
        </DialogContent>
      </Dialog>
    );

    const buttons = screen.getAllByRole('button');
    const inner = screen.getByRole('dialog').querySelector('[class*="max-w-md"]')!;
    
    buttons[2].focus();
    fireEvent.keyDown(inner, { key: 'Tab', bubbles: true });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('restores focus when closed', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <button>Inside</button>
        </DialogContent>
      </Dialog>
    );

    const outsideButton = document.createElement('button');
    outsideButton.id = 'outside';
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    rerender(
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogContent>
          <button>Inside</button>
        </DialogContent>
      </Dialog>
    );

    expect(document.activeElement).toBe(outsideButton);
    document.body.removeChild(outsideButton);
  });
});
