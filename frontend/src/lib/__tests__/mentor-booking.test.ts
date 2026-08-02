import { describe, expect, it } from 'vitest';
import {
  detectMentorConflicts,
  findBestMentorSlot,
  reserveMentorSlot,
  type MentorSlot,
} from '../mentor-booking';

const slots: MentorSlot[] = [
  {
    id: 'slot-1',
    mentorId: 'mentor-a',
    startsAt: '2026-06-29T10:00:00.000Z',
    endsAt: '2026-06-29T10:30:00.000Z',
    capacity: 2,
    booked: 1,
    tags: ['git', 'pull-request'],
  },
  {
    id: 'slot-2',
    mentorId: 'mentor-b',
    startsAt: '2026-06-29T09:00:00.000Z',
    endsAt: '2026-06-29T09:30:00.000Z',
    capacity: 1,
    booked: 0,
    tags: ['solidity'],
  },
];

describe('mentor booking optimization', () => {
  it('selects the best available slot by tag match and earliest time', () => {
    const slot = findBestMentorSlot(slots, {
      learnerId: 'learner-1',
      preferredTags: ['pull-request'],
      earliestAt: '2026-06-29T08:00:00.000Z',
    });

    expect(slot?.id).toBe('slot-1');
  });

  it('reserves capacity and rejects overbooking', () => {
    const reserved = reserveMentorSlot(slots, 'slot-1');

    expect(reserved.find((slot) => slot.id === 'slot-1')?.booked).toBe(2);
    expect(() => reserveMentorSlot(reserved, 'slot-1')).toThrow('Mentor slot is full');
  });

  it('detects overlapping mentor slots', () => {
    expect(
      detectMentorConflicts([
        ...slots,
        {
          id: 'slot-3',
          mentorId: 'mentor-a',
          startsAt: '2026-06-29T10:15:00.000Z',
          endsAt: '2026-06-29T10:45:00.000Z',
          capacity: 1,
          booked: 0,
          tags: ['git'],
        },
      ])
    ).toEqual(['mentor-a:slot-1:slot-3']);
  });
});
