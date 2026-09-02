export interface MentorSlot {
  id: string;
  mentorId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  booked: number;
  tags: string[];
}

export interface BookingRequest {
  learnerId: string;
  preferredTags: string[];
  earliestAt: string;
}

export function findBestMentorSlot(
  slots: MentorSlot[],
  request: BookingRequest
): MentorSlot | null {
  const earliest = new Date(request.earliestAt).getTime();
  const preferred = new Set(request.preferredTags.map((tag) => tag.toLowerCase()));

  return [...slots]
    .filter((slot) => slot.booked < slot.capacity)
    .filter((slot) => new Date(slot.startsAt).getTime() >= earliest)
    .sort((a, b) => {
      const aMatches = a.tags.filter((tag) => preferred.has(tag.toLowerCase())).length;
      const bMatches = b.tags.filter((tag) => preferred.has(tag.toLowerCase())).length;
      if (aMatches !== bMatches) return bMatches - aMatches;
      const aFill = a.booked / a.capacity;
      const bFill = b.booked / b.capacity;
      if (aFill !== bFill) return aFill - bFill;
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    })[0] ?? null;
}

export function reserveMentorSlot(slots: MentorSlot[], slotId: string): MentorSlot[] {
  return slots.map((slot) => {
    if (slot.id !== slotId) return slot;
    if (slot.booked >= slot.capacity) {
      throw new Error('Mentor slot is full');
    }
    return { ...slot, booked: slot.booked + 1 };
  });
}

export function detectMentorConflicts(slots: MentorSlot[]): string[] {
  const conflicts: string[] = [];
  const byMentor = new Map<string, MentorSlot[]>();
  for (const slot of slots) {
    byMentor.set(slot.mentorId, [...(byMentor.get(slot.mentorId) ?? []), slot]);
  }

  for (const [mentorId, mentorSlots] of byMentor.entries()) {
    const sorted = mentorSlots.sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      if (new Date(previous.endsAt).getTime() > new Date(current.startsAt).getTime()) {
        conflicts.push(`${mentorId}:${previous.id}:${current.id}`);
      }
    }
  }
  return conflicts;
}
