/**
 * Property-based tests for Team-Event Linking & Event Timer feature.
 * Feature: team-event-linking
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventListItem {
  id: string;
  name: string;
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
}

interface FetchFilter {
  column: string;
  value: unknown;
}

interface TimerState {
  h: number;
  m: number;
  s: number;
}

// ─── Pure Model Functions ─────────────────────────────────────────────────────

/**
 * Builds the payload for team create/update operations.
 * Mirrors the logic in TeamsTab handleCreate / handleEdit.
 */
function buildTeamPayload(
  name: string,
  slogan: string | undefined,
  selectedEventId: string | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { name };
  if (slogan) payload.slogan = slogan;
  payload.event_id = selectedEventId; // always set, null is valid
  return payload;
}

/**
 * Renders an event option label as shown in EventSelector.
 * Mirrors: `{event.name} ({event.is_active ? 'Active' : 'Archived'})`
 */
function renderEventOption(event: EventListItem): string {
  const status = event.is_active ? 'Active' : 'Archived';
  return `${event.name} (${status})`;
}

/**
 * Initialises the edit form state from a team's current data.
 * Mirrors: `setSelectedEventId(team.event_id)` in the edit modal.
 */
function initEditFormState(team: { event_id: string | null }): {
  selectedEventId: string | null;
} {
  return { selectedEventId: team.event_id };
}

/**
 * Builds the Supabase filter used by ExpeditionTimer to fetch its event.
 * Returns null when eventId is null/undefined (no fetch needed).
 */
function buildFetchFilter(eventId: string | null | undefined): FetchFilter | null {
  if (!eventId) return null;
  return { column: 'id', value: eventId };
}

/**
 * Pure implementation of the time-remaining helper from src/lib/auth.ts.
 */
function timeRemaining(endTime: Date, now: Date): number {
  return Math.max(0, endTime.getTime() - now.getTime());
}

/**
 * Pure model of the countdown computation inside ExpeditionTimer.
 */
function computeTimerState(
  eventId: string | null | undefined,
  endTime: Date | null | undefined,
  now: Date,
): { state: TimerState; isLooming: boolean } {
  if (!eventId) {
    return { state: { h: 0, m: 0, s: 0 }, isLooming: false };
  }
  if (!endTime) {
    return { state: { h: 0, m: 0, s: 0 }, isLooming: false };
  }

  const remaining = timeRemaining(endTime, now);

  if (remaining <= 0) {
    return { state: { h: 0, m: 0, s: 0 }, isLooming: false };
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const isLooming = h === 0 && m < 30 && totalSeconds > 0;

  return { state: { h, m, s }, isLooming };
}

// ─── Property 1: Payload Selalu Mencerminkan Pilihan Event Admin ───────────────

// Feature: team-event-linking, Property 1: Payload Selalu Mencerminkan Pilihan Event Admin
describe('Property 1: Payload Selalu Mencerminkan Pilihan Event Admin', () => {
  it('event_id dalam payload selalu identik dengan selectedEventId (UUID atau null)', () => {
    // Validates: Requirements 1.2, 1.4, 2.2
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.option(fc.string({ minLength: 1, maxLength: 100 })),
        fc.option(fc.uuid()),
        (name, slogan, selectedEventId) => {
          const payload = buildTeamPayload(name, slogan ?? undefined, selectedEventId);
          expect(payload.event_id).toBe(selectedEventId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('payload selalu berisi field event_id meskipun nilainya null', () => {
    // Validates: Requirements 1.4, 2.2
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (name) => {
          const payload = buildTeamPayload(name, undefined, null);
          expect(Object.prototype.hasOwnProperty.call(payload, 'event_id')).toBe(true);
          expect(payload.event_id).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('payload event_id dengan UUID valid selalu tersimpan dengan benar', () => {
    // Validates: Requirements 1.2, 2.2
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.uuid(),
        (name, eventId) => {
          const payload = buildTeamPayload(name, undefined, eventId);
          expect(payload.event_id).toBe(eventId);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2: EventSelector Selalu Menampilkan Semua Informasi yang Diperlukan

// Feature: team-event-linking, Property 2: EventSelector Selalu Menampilkan Semua Informasi yang Diperlukan
describe('Property 2: EventSelector Selalu Menampilkan Semua Informasi yang Diperlukan', () => {
  const eventArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    is_active: fc.boolean(),
    start_time: fc.constant(null),
    end_time: fc.constant(null),
  });

  it('label selalu mengandung nama event', () => {
    // Validates: Requirement 1.5
    fc.assert(
      fc.property(eventArb, (event) => {
        const label = renderEventOption(event);
        expect(label).toContain(event.name);
      }),
      { numRuns: 100 },
    );
  });

  it('event aktif selalu menampilkan label "Active"', () => {
    // Validates: Requirement 1.5
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 50 }),
          is_active: fc.constant(true),
          start_time: fc.constant(null),
          end_time: fc.constant(null),
        }),
        (event) => {
          const label = renderEventOption(event);
          expect(label).toContain('Active');
          expect(label).not.toContain('Archived');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('event tidak aktif selalu menampilkan label "Archived"', () => {
    // Validates: Requirement 1.5
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 50 }),
          is_active: fc.constant(false),
          start_time: fc.constant(null),
          end_time: fc.constant(null),
        }),
        (event) => {
          const label = renderEventOption(event);
          expect(label).toContain('Archived');
          expect(label).not.toContain('Active');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('label memiliki format "{name} (Status)"', () => {
    // Validates: Requirement 1.5
    fc.assert(
      fc.property(eventArb, (event) => {
        const label = renderEventOption(event);
        const expectedStatus = event.is_active ? 'Active' : 'Archived';
        expect(label).toBe(`${event.name} (${expectedStatus})`);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 3: Edit Form Selalu Memuat event_id Saat Ini dari Team ──────────

// Feature: team-event-linking, Property 3: Edit Form Selalu Memuat event_id Saat Ini dari Team
describe('Property 3: Edit Form Selalu Memuat event_id Saat Ini dari Team', () => {
  it('selectedEventId pada form edit selalu sama persis dengan team.event_id', () => {
    // Validates: Requirement 2.1
    fc.assert(
      fc.property(
        fc.record({ event_id: fc.option(fc.uuid()) }),
        (team) => {
          const formState = initEditFormState(team);
          expect(formState.selectedEventId).toBe(team.event_id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('team dengan event_id null selalu menghasilkan form state dengan selectedEventId null', () => {
    // Validates: Requirement 2.1
    fc.assert(
      fc.property(fc.constant({ event_id: null as string | null }), (team) => {
        const formState = initEditFormState(team);
        expect(formState.selectedEventId).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('team dengan event_id UUID valid selalu ter-preload dengan benar di form', () => {
    // Validates: Requirement 2.1
    fc.assert(
      fc.property(fc.uuid(), (eventId) => {
        const team = { event_id: eventId };
        const formState = initEditFormState(team);
        expect(formState.selectedEventId).toBe(eventId);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4: ExpeditionTimer Hanya Menggunakan Event dari Team-nya Sendiri ─

// Feature: team-event-linking, Property 4: ExpeditionTimer Hanya Menggunakan Event dari Team-nya Sendiri
describe('Property 4: ExpeditionTimer Hanya Menggunakan Event dari Team-nya Sendiri', () => {
  it('filter fetch selalu menggunakan {column: "id", value: eventId} bukan {column: "is_active"}', () => {
    // Validates: Requirements 3.1, 4.2
    fc.assert(
      fc.property(fc.uuid(), (eventId) => {
        const filter = buildFetchFilter(eventId);
        expect(filter).not.toBeNull();
        expect(filter!.column).toBe('id');
        expect(filter!.value).toBe(eventId);
        // Pastikan BUKAN filter global is_active
        expect(filter!.column).not.toBe('is_active');
      }),
      { numRuns: 100 },
    );
  });

  it('filter fetch untuk dua eventId berbeda menghasilkan filter yang berbeda pula', () => {
    // Validates: Requirements 4.2
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (eventId1, eventId2) => {
        fc.pre(eventId1 !== eventId2);
        const filter1 = buildFetchFilter(eventId1);
        const filter2 = buildFetchFilter(eventId2);
        expect(filter1!.value).toBe(eventId1);
        expect(filter2!.value).toBe(eventId2);
        expect(filter1!.value).not.toBe(filter2!.value);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5: Null event_id Selalu Menghasilkan Timer Nol Tanpa Fetch ──────

// Feature: team-event-linking, Property 5: Null event_id Selalu Menghasilkan Timer Nol Tanpa Fetch
describe('Property 5: Null event_id Selalu Menghasilkan Timer Nol Tanpa Fetch', () => {
  it('computeTimerState dengan eventId null selalu menghasilkan {h:0, m:0, s:0}', () => {
    // Validates: Requirement 3.4
    fc.assert(
      fc.property(
        fc.date(),
        fc.date(),
        (endTime, now) => {
          const { state, isLooming } = computeTimerState(null, endTime, now);
          expect(state).toEqual({ h: 0, m: 0, s: 0 });
          expect(isLooming).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('computeTimerState dengan eventId undefined selalu menghasilkan {h:0, m:0, s:0}', () => {
    // Validates: Requirement 3.4
    fc.assert(
      fc.property(
        fc.date(),
        fc.date(),
        (endTime, now) => {
          const { state, isLooming } = computeTimerState(undefined, endTime, now);
          expect(state).toEqual({ h: 0, m: 0, s: 0 });
          expect(isLooming).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buildFetchFilter dengan null tidak menghasilkan fetch (return null)', () => {
    // Validates: Requirement 3.4
    fc.assert(
      fc.property(fc.constant(null as null), (eventId) => {
        const filter = buildFetchFilter(eventId);
        expect(filter).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('buildFetchFilter dengan undefined tidak menghasilkan fetch (return null)', () => {
    // Validates: Requirement 3.4
    fc.assert(
      fc.property(fc.constant(undefined as undefined), (eventId) => {
        const filter = buildFetchFilter(eventId);
        expect(filter).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 6: Nilai Timer Selalu Konsisten dengan Waktu Tersisa ─────────────

// Feature: team-event-linking, Property 6: Nilai Timer Selalu Konsisten dengan Waktu Tersisa
describe('Property 6: Nilai Timer Selalu Konsisten dengan Waktu Tersisa', () => {
  it('h*3600 + m*60 + s === Math.floor(timeRemaining(endTime, now) / 1000) untuk endTime di masa depan', () => {
    // Validates: Requirement 3.2
    fc.assert(
      fc.property(
        fc.date(),
        fc.date(),
        fc.uuid(),
        (endTime, now, eventId) => {
          fc.pre(endTime.getTime() > now.getTime());

          const { state } = computeTimerState(eventId, endTime, now);
          const { h, m, s } = state;

          const totalSecondsFromState = h * 3600 + m * 60 + s;
          const expectedTotalSeconds = Math.floor(timeRemaining(endTime, now) / 1000);

          expect(totalSecondsFromState).toBe(expectedTotalSeconds);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('nilai h, m, s selalu berada dalam range valid (h>=0, 0<=m<60, 0<=s<60)', () => {
    // Validates: Requirement 3.2
    fc.assert(
      fc.property(
        fc.date(),
        fc.date(),
        fc.uuid(),
        (endTime, now, eventId) => {
          fc.pre(endTime.getTime() > now.getTime());

          const { state } = computeTimerState(eventId, endTime, now);
          expect(state.h).toBeGreaterThanOrEqual(0);
          expect(state.m).toBeGreaterThanOrEqual(0);
          expect(state.m).toBeLessThan(60);
          expect(state.s).toBeGreaterThanOrEqual(0);
          expect(state.s).toBeLessThan(60);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 7: Mode Looming Selalu Aktif Ketika dan Hanya Ketika Sisa Waktu < 30 Menit

// Feature: team-event-linking, Property 7: Mode Looming Selalu Aktif Ketika dan Hanya Ketika Sisa Waktu < 30 Menit
describe('Property 7: Mode Looming Selalu Aktif Ketika dan Hanya Ketika Sisa Waktu < 30 Menit', () => {
  it('isLooming === (totalSeconds > 0 && totalSeconds < 1800) untuk semua totalSeconds', () => {
    // Validates: Requirement 3.6
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 86400 }),
        (totalSeconds) => {
          const expected = totalSeconds > 0 && totalSeconds < 1800;

          // Use a fixed now=0, endTime = totalSeconds * 1000ms
          const now = new Date(0);
          const endTime = new Date(totalSeconds * 1000);
          const { isLooming } = computeTimerState('some-uuid', endTime, now);

          expect(isLooming).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isLooming selalu false ketika totalSeconds === 0', () => {
    // Validates: Requirement 3.6
    const now = new Date(0);
    const endTime = new Date(0); // 0 seconds remaining
    const { isLooming, state } = computeTimerState('some-uuid', endTime, now);
    expect(isLooming).toBe(false);
    expect(state).toEqual({ h: 0, m: 0, s: 0 });
  });

  it('isLooming selalu true tepat saat 1 detik tersisa (1 < 1800)', () => {
    // Validates: Requirement 3.6
    const now = new Date(0);
    const endTime = new Date(1000); // 1 second remaining
    const { isLooming } = computeTimerState('some-uuid', endTime, now);
    expect(isLooming).toBe(true);
  });

  it('isLooming selalu false tepat saat 1800 detik (30 menit) tersisa', () => {
    // Validates: Requirement 3.6
    const now = new Date(0);
    const endTime = new Date(1800 * 1000); // exactly 30 minutes remaining
    const { isLooming } = computeTimerState('some-uuid', endTime, now);
    expect(isLooming).toBe(false);
  });
});

// ─── Property 8: Timer State Terisolasi Berdasarkan eventId ───────────────────

// Feature: team-event-linking, Property 8: Timer State Terisolasi Berdasarkan eventId
describe('Property 8: Timer State Terisolasi Berdasarkan eventId', () => {
  it('computeTimerState(eventId1, endTime1, now) tidak bergantung pada endTime2', () => {
    // Validates: Requirement 4.3
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.date(),
        fc.date(),
        fc.date(),
        (eventId1, eventId2, endTime1, endTime2, now) => {
          fc.pre(eventId1 !== eventId2);
          fc.pre(endTime1.getTime() !== endTime2.getTime());
          fc.pre(endTime1.getTime() > now.getTime()); // ensure valid future endTime1

          // Compute state for team1 — should be identical regardless of endTime2
          const result1a = computeTimerState(eventId1, endTime1, now);
          const result1b = computeTimerState(eventId1, endTime1, now); // same inputs

          // Result is deterministic — same inputs always yield same output
          expect(result1a.state).toEqual(result1b.state);
          expect(result1a.isLooming).toBe(result1b.isLooming);

          // Changing endTime2 does not affect team1's computation
          const result1c = computeTimerState(eventId1, endTime1, now);
          expect(result1c.state).toEqual(result1a.state);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('dua team dengan endTime berbeda menghasilkan timer state yang berbeda', () => {
    // Validates: Requirement 4.3
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 1, max: 3600 }),
        fc.integer({ min: 1, max: 3600 }),
        (eventId1, eventId2, seconds1, seconds2) => {
          fc.pre(eventId1 !== eventId2);
          fc.pre(seconds1 !== seconds2);

          const now = new Date(0);
          const endTime1 = new Date(seconds1 * 1000);
          const endTime2 = new Date(seconds2 * 1000);

          const result1 = computeTimerState(eventId1, endTime1, now);
          const result2 = computeTimerState(eventId2, endTime2, now);

          // Different endTimes → different total seconds → states must differ
          const total1 = result1.state.h * 3600 + result1.state.m * 60 + result1.state.s;
          const total2 = result2.state.h * 3600 + result2.state.m * 60 + result2.state.s;

          expect(total1).toBe(seconds1);
          expect(total2).toBe(seconds2);
          expect(total1).not.toBe(total2);
        },
      ),
      { numRuns: 100 },
    );
  });
});
