import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollaborativeCanvas } from '../CollaborativeCanvas';
import * as canvasHooks from '@/hooks/useCanvasCollaboration';

// Mock html2canvas and jspdf
vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mock'),
    width: 800,
    height: 600,
  }),
}));

vi.mock('jspdf', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      internal: {
        pageSize: {
          getWidth: () => 210,
          getHeight: () => 297,
        },
      },
      addImage: vi.fn(),
      save: vi.fn(),
    })),
  };
});

// Mock hooks
vi.mock('@/hooks/useCanvasCollaboration', () => {
  return {
    useCanvasCollaboration: vi.fn(),
    useSharedCanvas: vi.fn(),
    useAwareness: vi.fn(),
  };
});

// Mock ResizeObserver for React Flow
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

describe('CollaborativeCanvas', () => {
  const mockAddNode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(canvasHooks.useCanvasCollaboration).mockReturnValue({
      doc: {} as any,
      awareness: {},
      isConnected: true,
    });

    vi.mocked(canvasHooks.useSharedCanvas).mockReturnValue({
      nodes: [],
      edges: [],
      addNode: mockAddNode,
      updateNode: vi.fn(),
      deleteNode: vi.fn(),
      addEdge: vi.fn(),
      deleteEdge: vi.fn(),
    });

    vi.mocked(canvasHooks.useAwareness).mockReturnValue([
      { clientId: 2, name: 'Remote User', color: '#ff0000' }
    ]);
  });

  it('renders correctly', () => {
    render(<CollaborativeCanvas roomId="test-room" userId="user-1" />);
    
    expect(screen.getByText('Canvas: test-room')).toBeInTheDocument();
    expect(screen.getByText(/1 collaborator/)).toBeInTheDocument();
  });

  it('adds standard shape nodes', () => {
    render(<CollaborativeCanvas roomId="test-room" userId="user-1" />);
    
    fireEvent.click(screen.getByText('Add Rectangle'));
    expect(mockAddNode).toHaveBeenCalledWith(expect.objectContaining({
      type: 'default',
      data: { label: 'Rectangle' }
    }));
  });

  it('adds web3 specific nodes', () => {
    render(<CollaborativeCanvas roomId="test-room" userId="user-1" />);
    
    fireEvent.click(screen.getByText('Add Wallet'));
    expect(mockAddNode).toHaveBeenCalledWith(expect.objectContaining({
      type: 'wallet',
      data: expect.objectContaining({ label: 'Wallet', address: '0x1234...abcd' })
    }));

    fireEvent.click(screen.getByText('Add Contract'));
    expect(mockAddNode).toHaveBeenCalledWith(expect.objectContaining({
      type: 'contract',
      data: expect.objectContaining({ label: 'Contract', network: 'Ethereum' })
    }));

    fireEvent.click(screen.getByText('Add Actor'));
    expect(mockAddNode).toHaveBeenCalledWith(expect.objectContaining({
      type: 'actor',
      data: expect.objectContaining({ label: 'Actor' })
    }));
  });
});
