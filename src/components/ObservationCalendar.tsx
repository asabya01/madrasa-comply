import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalObservation {
  id: string;
  date: string;             // YYYY-MM-DD — either scheduled_date or observed_at date
  teacher_name: string;
  subject: string;
  obs_status: 'scheduled' | 'completed' | 'cancelled';
}

interface Props {
  observations: CalObservation[];
  month: Date;
  onMonthChange: (d: Date) => void;
  onDayClick: (date: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3b82f6',
  completed: '#437a22',
  cancelled: '#ef4444',
};

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Component ────────────────────────────────────────────────────────────────

export function ObservationCalendar({ observations, month, onMonthChange, onDayClick }: Props) {
  const year     = month.getFullYear();
  const monthIdx = month.getMonth();
  const [popoverDate, setPopoverDate] = useState<string | null>(null);

  const firstDayOfWeek = new Date(year, monthIdx, 1).getDay(); // 0 = Sun
  const daysInMonth    = new Date(year, monthIdx + 1, 0).getDate();
  const today          = new Date().toISOString().slice(0, 10);

  // Map date string → observations on that day
  const byDate = useMemo(() => {
    const map = new Map<string, CalObservation[]>();
    for (const obs of observations) {
      if (!map.has(obs.date)) map.set(obs.date, []);
      map.get(obs.date)!.push(obs);
    }
    return map;
  }, [observations]);

  // Cells: null = empty leading padding, number = day of month
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function handleDayClick(dateStr: string, hasDots: boolean) {
    if (!hasDots) return;
    setPopoverDate(dateStr === popoverDate ? null : dateStr);
    onDayClick(dateStr);
  }

  const popoverObs = popoverDate ? (byDate.get(popoverDate) ?? []) : [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* Month navigation */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <button
          onClick={() => { setPopoverDate(null); onMonthChange(new Date(year, monthIdx - 1, 1)); }}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-semibold text-gray-900">
          {MONTH_NAMES[monthIdx]} {year}
        </h3>
        <button
          onClick={() => { setPopoverDate(null); onMonthChange(new Date(year, monthIdx + 1, 1)); }}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) {
            return (
              <div
                key={`pad-${i}`}
                className="h-20 bg-gray-50/40 border-r border-b border-gray-100"
              />
            );
          }

          const dateStr  = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayObs   = byDate.get(dateStr) ?? [];
          const isToday  = dateStr === today;
          const isWeekend = (i % 7 === 0) || (i % 7 === 6);
          const isActive = popoverDate === dateStr;

          return (
            <div
              key={dateStr}
              onClick={() => handleDayClick(dateStr, dayObs.length > 0)}
              className={[
                'h-20 border-r border-b border-gray-100 p-1.5 flex flex-col transition-colors',
                dayObs.length > 0 ? 'cursor-pointer' : '',
                isWeekend ? 'bg-gray-50/30' : 'bg-white',
                isActive ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : '',
                dayObs.length > 0 && !isActive ? 'hover:bg-gray-50' : '',
              ].filter(Boolean).join(' ')}
            >
              {/* Day number */}
              <span
                className={[
                  'text-xs font-medium mb-1 w-5 h-5 flex items-center justify-center rounded-full self-start',
                  isToday ? 'bg-[#01696f] text-white' : 'text-gray-700',
                ].join(' ')}
              >
                {day}
              </span>

              {/* Status dots */}
              <div className="flex flex-wrap gap-0.5 flex-1 content-start overflow-hidden">
                {dayObs.slice(0, 5).map((obs) => (
                  <span
                    key={obs.id}
                    title={`${obs.teacher_name} · ${obs.subject} (${obs.obs_status})`}
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[obs.obs_status] ?? '#9ca3af' }}
                  />
                ))}
                {dayObs.length > 5 && (
                  <span className="text-[9px] text-gray-400 leading-none mt-0.5">
                    +{dayObs.length - 5}
                  </span>
                )}
              </div>

              {/* Single-observation quick label */}
              {dayObs.length === 1 && (
                <p className="text-[9px] text-gray-500 truncate leading-tight">
                  {dayObs[0].teacher_name}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Popover — observations for selected day */}
      {popoverDate && popoverObs.length > 0 && (
        <div className="border-t border-gray-200 bg-gray-50 px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">
              {new Date(popoverDate + 'T00:00:00').toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </p>
            <button
              onClick={() => setPopoverDate(null)}
              className="text-gray-400 hover:text-gray-600 text-xs"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1.5">
            {popoverObs.map((obs) => (
              <div
                key={obs.id}
                className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200 text-xs"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: STATUS_COLORS[obs.obs_status] ?? '#9ca3af' }}
                />
                <span className="font-medium text-gray-800 truncate">{obs.teacher_name}</span>
                {obs.subject !== 'General' && (
                  <span className="text-gray-400 truncate">· {obs.subject}</span>
                )}
                <span
                  className="ml-auto shrink-0 capitalize px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: `${STATUS_COLORS[obs.obs_status]}18`,
                    color: STATUS_COLORS[obs.obs_status],
                  }}
                >
                  {obs.obs_status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-5 px-5 py-3 border-t border-gray-100 bg-gray-50/50">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-500 capitalize">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
