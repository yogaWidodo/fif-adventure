'use client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventListItem {
  id: string;
  name: string;
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
}

interface EventSelectorProps {
  events: EventListItem[];
  value: string | null;        // event_id terpilih, null = tidak dipilih
  onChange: (eventId: string | null) => void;
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Dropdown selector for events, used in team create/edit modals.
 * Displays each event as "{name} (Active)" or "{name} (Archived)" based on is_active.
 * If no events available, shows a disabled placeholder option.
 *
 * Requirements: 1.1, 1.3, 1.5
 */
export default function EventSelector({ events, value, onChange, disabled }: EventSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    onChange(selectedValue || null);
  };

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest font-adventure text-muted-foreground/50 mb-2">
        Event
      </label>

      {events.length === 0 ? (
        <select
          disabled
          value=""
          onChange={() => {}}
          className="w-full bg-transparent border-b-2 border-primary/20 focus:border-primary/60 outline-none py-2 font-adventure text-sm text-foreground transition-colors [&>option]:bg-black [&>option]:text-white"
        >
          <option disabled value="">No events available</option>
        </select>
      ) : (
        <select
          value={value ?? ''}
          onChange={handleChange}
          disabled={disabled}
          className="w-full bg-transparent border-b-2 border-primary/20 focus:border-primary/60 outline-none py-2 font-adventure text-sm text-foreground transition-colors [&>option]:bg-black [&>option]:text-white"
        >
          <option value="">— Select Event —</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name} ({event.is_active ? 'Active' : 'Archived'})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
