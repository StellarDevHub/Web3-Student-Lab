import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InlineComment, { CommentThread } from '../InlineComment';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockComment: CommentThread = {
  id: 'test-comment-1',
  line: 10,
  author: {
    id: 'user-1',
    name: 'John Doe',
    color: '#ff0000',
  },
  content: 'This is a test comment',
  timestamp: new Date('2023-01-01'),
  replies: [],
  isResolved: false,
};

const mockCurrentUser = {
  id: 'user-1',
  name: 'John Doe',
  color: '#ff0000',
};

describe('InlineComment', () => {
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnReply = vi.fn();
  const mockOnResolve = vi.fn();
  const mockOnUnresolve = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders comment with author and content', () => {
    render(
      <InlineComment
        comment={mockComment}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={mockCurrentUser}
      />
    );

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('This is a test comment')).toBeInTheDocument();
  });

  it('shows edit button for own comment', () => {
    render(
      <InlineComment
        comment={mockComment}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={mockCurrentUser}
      />
    );

    const editButton = screen.getByTitle('Edit comment');
    expect(editButton).toBeInTheDocument();
  });

  it('hides edit button for other users comment', () => {
    const otherUser = { ...mockCurrentUser, id: 'user-2' };
    
    render(
      <InlineComment
        comment={mockComment}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={otherUser}
      />
    );

    const editButton = screen.queryByTitle('Edit comment');
    expect(editButton).not.toBeInTheDocument();
  });

  it('enters edit mode when edit button is clicked', async () => {
    render(
      <InlineComment
        comment={mockComment}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={mockCurrentUser}
      />
    );

    const editButton = screen.getByTitle('Edit comment');
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByDisplayValue('This is a test comment')).toBeInTheDocument();
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  it('saves edited comment', async () => {
    render(
      <InlineComment
        comment={mockComment}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={mockCurrentUser}
      />
    );

    const editButton = screen.getByTitle('Edit comment');
    fireEvent.click(editButton);

    const textarea = screen.getByDisplayValue('This is a test comment');
    fireEvent.change(textarea, { target: { value: 'Updated comment content' } });

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnEdit).toHaveBeenCalledWith('test-comment-1', 'Updated comment content');
    });
  });

  it('shows replies when they exist', () => {
    const commentWithReplies: CommentThread = {
      ...mockComment,
      replies: [
        {
          id: 'reply-1',
          author: {
            id: 'user-2',
            name: 'Jane Smith',
            color: '#00ff00',
          },
          content: 'This is a reply',
          timestamp: new Date('2023-01-02'),
        },
      ],
    };

    render(
      <InlineComment
        comment={commentWithReplies}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={mockCurrentUser}
      />
    );

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('This is a reply')).toBeInTheDocument();
  });

  it('shows reply button for unresolved comments', () => {
    render(
      <InlineComment
        comment={mockComment}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={mockCurrentUser}
      />
    );

    expect(screen.getByText('Reply')).toBeInTheDocument();
  });

  it('hides reply button for resolved comments', () => {
    const resolvedComment: CommentThread = {
      ...mockComment,
      isResolved: true,
    };

    render(
      <InlineComment
        comment={resolvedComment}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={mockCurrentUser}
      />
    );

    expect(screen.queryByText('Reply')).not.toBeInTheDocument();
  });

  it('calls onReply when reply is submitted', async () => {
    render(
      <InlineComment
        comment={mockComment}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={mockCurrentUser}
      />
    );

    const replyButton = screen.getByText('Reply');
    fireEvent.click(replyButton);

    const replyTextarea = screen.getByPlaceholderText('Write a reply...');
    fireEvent.change(replyTextarea, { target: { value: 'This is my reply' } });

    const sendButton = screen.getByTitle('Post Rebuttal');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockOnReply).toHaveBeenCalledWith('test-comment-1', 'This is my reply');
    });
  });

  it('calls onResolve when resolve button is clicked', () => {
    render(
      <InlineComment
        comment={mockComment}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={mockCurrentUser}
      />
    );

    const resolveButton = screen.getByTitle('Resolve comment');
    fireEvent.click(resolveButton);

    expect(mockOnResolve).toHaveBeenCalledWith('test-comment-1');
  });

  it('calls onUnresolve when unresolve button is clicked', () => {
    const resolvedComment: CommentThread = {
      ...mockComment,
      isResolved: true,
    };

    render(
      <InlineComment
        comment={resolvedComment}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={mockCurrentUser}
      />
    );

    const unresolveButton = screen.getByTitle('Reopen comment');
    fireEvent.click(unresolveButton);

    expect(mockOnUnresolve).toHaveBeenCalledWith('test-comment-1');
  });

  it('shows resolved indicator for resolved comments', () => {
    const resolvedComment: CommentThread = {
      ...mockComment,
      isResolved: true,
    };

    render(
      <InlineComment
        comment={resolvedComment}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={mockCurrentUser}
      />
    );

    const indicator = screen.getByRole('generic'); // The color indicator
    expect(indicator).toHaveClass('bg-green-500');
  });

  it('shows pending indicator for unresolved comments', () => {
    render(
      <InlineComment
        comment={mockComment}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onReply={mockOnReply}
        onResolve={mockOnResolve}
        onUnresolve={mockOnUnresolve}
        currentUser={mockCurrentUser}
      />
    );

    const indicator = screen.getByRole('generic'); // The color indicator
    expect(indicator).toHaveClass('bg-yellow-500');
  });
});
