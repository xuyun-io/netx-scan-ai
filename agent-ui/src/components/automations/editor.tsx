import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AutomationFrequency, AutomationSchedule } from '@/lib/api';

export const inputClassName =
  'h-9 w-full rounded-md border border-[#3a4654] bg-[#121922] px-3 text-sm font-normal text-[#dce1eb] outline-none placeholder:text-[#8f98a6] focus:border-[#8378ff] disabled:cursor-not-allowed disabled:opacity-50';

const timezoneOptions = [
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+08:00)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+09:00)' },
  { value: 'America/New_York', label: 'America/New_York' },
];

const weekdayOptions = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

export interface ScheduleEditorProps {
  dayOfMonth: number;
  dayOfWeek: number;
  deliveryTime: string;
  frequency: AutomationFrequency;
  interval: number;
  minuteOffset: string;
  period: 'AM' | 'PM';
  timezone: string;
  onDayOfMonthChange: (value: number) => void;
  onDayOfWeekChange: (value: number) => void;
  onDeliveryTimeChange: (value: string) => void;
  onFrequencyChange: (value: AutomationFrequency) => void;
  onIntervalChange: (value: number) => void;
  onMinuteOffsetChange: (value: string) => void;
  onPeriodChange: (value: 'AM' | 'PM') => void;
  onTimezoneChange: (value: string) => void;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[#d8dee9]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-[#8f98a6]">{hint}</span>}
    </label>
  );
}

export function ScheduleEditor({
  dayOfMonth,
  dayOfWeek,
  deliveryTime,
  frequency,
  interval,
  minuteOffset,
  period,
  timezone,
  onDayOfMonthChange,
  onDayOfWeekChange,
  onDeliveryTimeChange,
  onFrequencyChange,
  onIntervalChange,
  onMinuteOffsetChange,
  onPeriodChange,
  onTimezoneChange,
}: ScheduleEditorProps) {
  const unit =
    frequency === 'hourly'
      ? 'hour(s)'
      : frequency === 'daily'
        ? 'day(s)'
        : frequency === 'weekly'
          ? 'week(s)'
          : 'month(s)';

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Frequency">
          <Select value={frequency} onValueChange={(value) => onFrequencyChange(value as AutomationFrequency)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Every">
          <input
            type="number"
            min={1}
            max={365}
            value={interval}
            onChange={(event) => onIntervalChange(clampNumber(Number(event.target.value), 1, 365))}
            className="h-9 w-[72px] rounded-md border border-[#3a4654] bg-[#121922] px-3 text-sm font-normal text-[#dce1eb] outline-none focus:border-[#8378ff]"
          />
        </Field>
        <div className="pb-2 text-sm font-normal text-[#cbd3df]">{unit}</div>
      </div>

      {frequency === 'hourly' && (
        <Field label="Minute offset" hint="The minute past each hour when the automation runs (0-59).">
          <input
            value={minuteOffset}
            onChange={(event) => onMinuteOffsetChange(event.target.value.replace(/\D/g, '').slice(0, 2))}
            onBlur={() => onMinuteOffsetChange(String(clampNumber(Number(minuteOffset || 0), 0, 59)).padStart(2, '0'))}
            className="h-9 w-[120px] rounded-md border border-[#3a4654] bg-[#121922] px-3 text-sm font-normal text-[#dce1eb] outline-none focus:border-[#8378ff]"
          />
        </Field>
      )}

      {frequency === 'weekly' && (
        <div>
          <div className="mb-2 text-sm font-semibold text-[#d8dee9]">Delivery day</div>
          <div className="flex flex-wrap gap-2">
            {weekdayOptions.map((day) => (
              <button
                key={day.value}
                type="button"
                aria-pressed={dayOfWeek === day.value}
                className={cn(
                  'h-8 min-w-[68px] rounded-full border-2 px-4 text-sm font-semibold transition',
                  dayOfWeek === day.value
                    ? 'border-[#8f82ff] bg-[#8378ff] text-white'
                    : 'border-[#8378ff] text-[#a29aff] hover:bg-[#8378ff]/10',
                )}
                onClick={() => onDayOfWeekChange(day.value)}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {frequency === 'monthly' && (
        <div>
          <div className="mb-2 text-sm font-semibold text-[#d8dee9]">On</div>
          <div className="flex flex-wrap gap-3">
            <Select value="day">
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(dayOfMonth)} onValueChange={(value) => onDayOfMonthChange(Number(value))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {frequency !== 'hourly' && (
        <DeliveryTimeFields
          deliveryTime={deliveryTime}
          period={period}
          timezone={timezone}
          onDeliveryTimeChange={onDeliveryTimeChange}
          onPeriodChange={onPeriodChange}
          onTimezoneChange={onTimezoneChange}
        />
      )}
    </div>
  );
}

function DeliveryTimeFields({
  deliveryTime,
  period,
  timezone,
  onDeliveryTimeChange,
  onPeriodChange,
  onTimezoneChange,
}: {
  deliveryTime: string;
  period: 'AM' | 'PM';
  timezone: string;
  onDeliveryTimeChange: (value: string) => void;
  onPeriodChange: (value: 'AM' | 'PM') => void;
  onTimezoneChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-[#d8dee9]">Delivery time</div>
      <div className="mt-1 text-sm font-normal text-[#9aa3b2]">
        Time is converted to UTC before scheduling. Schedules may shift by one hour during daylight saving transitions.
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        <input
          value={deliveryTime}
          onChange={(event) => onDeliveryTimeChange(event.target.value)}
          onBlur={() => onDeliveryTimeChange(normalizeClockInput(deliveryTime))}
          className="h-9 w-[120px] rounded-md border border-[#3a4654] bg-[#121922] px-3 text-sm font-normal text-[#dce1eb] outline-none focus:border-[#8378ff]"
        />
        <Select value={period} onValueChange={(value) => onPeriodChange(value as 'AM' | 'PM')}>
          <SelectTrigger className="w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
        <Select value={timezone} onValueChange={onTimezoneChange}>
          <SelectTrigger className="w-[290px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {timezoneOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function buildSchedule({
  frequency,
  interval,
  minuteOffset,
  deliveryTime,
  period,
  timezone,
  dayOfWeek,
  dayOfMonth,
}: {
  frequency: AutomationFrequency;
  interval: number;
  minuteOffset: string;
  deliveryTime: string;
  period: 'AM' | 'PM';
  timezone: string;
  dayOfWeek: number;
  dayOfMonth: number;
}): AutomationSchedule {
  if (frequency === 'hourly') {
    return {
      frequency,
      interval: clampNumber(interval, 1, 365),
      minute: clampNumber(Number(minuteOffset || 0), 0, 59),
      hour: 0,
      timezone,
    };
  }
  const { hour, minute } = parseDeliveryTime(deliveryTime, period);
  return {
    frequency,
    interval: clampNumber(interval, 1, 365),
    minute,
    hour,
    dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
    dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
    timezone,
  };
}

function parseDeliveryTime(value: string, period: 'AM' | 'PM') {
  const normalized = normalizeClockInput(value);
  const [rawHour, rawMinute] = normalized.split(':').map(Number);
  let hour = clampNumber(rawHour, 1, 12);
  const minute = clampNumber(rawMinute, 0, 59);
  if (period === 'PM' && hour < 12) {
    hour += 12;
  }
  if (period === 'AM' && hour === 12) {
    hour = 0;
  }
  return { hour, minute };
}

function normalizeClockInput(value: string) {
  const match = value.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) {
    return '08:00';
  }
  const hour = clampNumber(Number(match[1]), 1, 12);
  const minute = clampNumber(Number(match[2] ?? 0), 0, 59);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function weekdayLong(day: number) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day % 7] || 'Monday';
}

export function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function describeAutomationSchedule(schedule: AutomationSchedule) {
  if (schedule.summary) {
    return schedule.summary;
  }
  const interval = schedule.interval || 1;
  const time = `${String(schedule.hour ?? 0).padStart(2, '0')}:${String(schedule.minute ?? 0).padStart(2, '0')}`;
  switch (schedule.frequency) {
    case 'hourly':
      return interval <= 1
        ? `Every hour at minute ${String(schedule.minute ?? 0).padStart(2, '0')}`
        : `Every ${interval} hours at minute ${String(schedule.minute ?? 0).padStart(2, '0')}`;
    case 'daily':
      return interval <= 1 ? `Every day at ${time}` : `Every ${interval} days at ${time}`;
    case 'weekly':
      return interval <= 1
        ? `Every ${weekdayLong(schedule.dayOfWeek || 1)} at ${time}`
        : `Every ${interval} weeks on ${weekdayLong(schedule.dayOfWeek || 1)} at ${time}`;
    case 'monthly':
      return interval <= 1
        ? `Every month on day ${schedule.dayOfMonth || 1} at ${time}`
        : `Every ${interval} months on day ${schedule.dayOfMonth || 1} at ${time}`;
    default:
      return '-';
  }
}
