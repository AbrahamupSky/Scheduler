'use client';

import React, { useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';

/* ─────────────────────────── Types ─────────────────────────── */
type Team = { id: number; name: string };

type ShiftTemplate = {
  shift: string;
  jobType: string;
  day: string;
  startTime: string;
  endTime: string;
  required: number;
};

type MemberAvailability = {
  name: string;
  job?: string | null;
  position?: string | null;
  ranking?: number | null;
  leadership?: string | null;
  minHoursWeek?: number | null;
  maxHoursWeek?: number | null;
  minDaysWeek?: number | null;
  maxDaysWeek?: number | null;
  notes?: string | null;
  windows: { dayOfWeek: number; startTime: string; endTime: string }[];
};

type ScheduleEntry = {
  day: string;
  date: string;
  shift: string;
  jobType: string;
  startTime: string;
  endTime: string;
  required: number;
  assigned: string[];
  notes?: string;
};

type AIScheduleResult = {
  schedule: ScheduleEntry[];
  summary: string;
  warnings: string[];
  stats: {
    totalShifts: number;
    fullyStaffed: number;
    understaffed: number;
    employeeHours: Record<string, number>;
  };
};

/* ─────────────────────────── Helpers ─────────────────────────── */
const DAY_INT_TO_NAME = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextSundayYMD() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (7 - day));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDayOfWeek(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

function hhmm24(t: string) {
  if (!t) return t;
  const m = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (!m) return t;
  let h = Number(m[1]),
    min = Number(m[2]);
  const ap = m[3]?.toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function shiftHours(start: string, end: string) {
  const s = toMinutes(hhmm24(start));
  let e = toMinutes(hhmm24(end));
  if (e < s) e += 1440;
  return (e - s) / 60;
}

/* ── Parse raw CSV rows (from localStorage) into typed arrays ── */
const _GEN_ALL_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const _GEN_DAY_INT: Record<string,number> = { sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6 };

function _genNormTime(t?: string | null): string | null {
  if (!t) return null;
  const s = String(t).trim();
  if (!s || s.toLowerCase() === 'off') return null;
  // HH:MM or HH:MM:SS
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) return `${String(m24[1]).padStart(2,'0')}:${m24[2]}`;
  // 12-hour: "10:00 AM", "10:00AM", "10AM"
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (m12) {
    let h = Number(m12[1]); const min = Number(m12[2] ?? 0); const ap = m12[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }
  return null;
}

// Build a case-insensitive column accessor for a row
function _ciGet(r: Record<string,string>, key: string): string {
  const kl = key.toLowerCase();
  const found = Object.keys(r).find(k => k.toLowerCase() === kl);
  return found ? String(r[found] ?? '').trim() : '';
}

function parseRawShiftRows(rows: Record<string,string>[]): ShiftTemplate[] {
  if (!rows.length) return [];

  // Case-insensitive day detection
  const headers = Object.keys(rows[0]);
  const headerLower = headers.map(h => h.toLowerCase());
  const dayColMap: Record<string, string> = {}; // canonical day name → actual header key
  for (const day of _GEN_ALL_DAYS) {
    const idx = headerLower.indexOf(day.toLowerCase());
    if (idx !== -1) dayColMap[day] = headers[idx];
  }
  const isPivoted = Object.keys(dayColMap).length > 0;

  console.log('[Generate] parseRawShiftRows — rows:', rows.length, 'headers:', headers, 'isPivoted:', isPivoted);

  const out: ShiftTemplate[] = [];

  if (isPivoted) {
    for (const r of rows) {
      const shiftName = String(r[headers[0]] ?? '').trim();
      if (!shiftName) continue;
      const lower = shiftName.toLowerCase();
      let jobType = '';
      if (lower.includes('boh') || lower.includes('back') || lower.includes('kitchen')) jobType = 'BOH';
      else if (lower.includes('foh') || lower.includes('front')) jobType = 'FOH';
      else if (lower.includes('truck') || lower.includes('delivery')) jobType = 'TRUCK';
      else if (lower.includes('prep')) jobType = 'PREP';

      for (const [day, colKey] of Object.entries(dayColMap)) {
        const val = String(r[colKey] ?? '').trim();
        if (!val) continue;
        // Split on newline or semicolon for multiple entries per cell
        const entries = val.split(/[\n;]/).map(e => e.trim()).filter(Boolean);
        for (const entry of entries) {
          // Match "HH:MM AM - HH:MM PM" or "HH:MM-HH:MM" or "HH:MM AM-HH:MM PM"
          const dashMatch = entry.match(/^(.+?)\s*[-–]\s*(.+)$/);
          if (!dashMatch) continue;
          const start = _genNormTime(dashMatch[1].trim());
          const end = _genNormTime(dashMatch[2].trim());
          if (start && end) out.push({ shift: shiftName, jobType, day, startTime: start, endTime: end, required: 1 });
        }
      }
    }
  } else {
    // Flat format — try multiple possible column name variants
    for (const r of rows) {
      const shift = _ciGet(r,'Shift') || _ciGet(r,'Shift Name') || _ciGet(r,'ShiftName') || String(r[headers[0]] ?? '').trim();
      const jobType = _ciGet(r,'Job_Type') || _ciGet(r,'JobType') || _ciGet(r,'Job Type') || '';
      const day = _ciGet(r,'Day') || _ciGet(r,'Weekday') || _ciGet(r,'Day of Week') || '';
      const start = _genNormTime(_ciGet(r,'Start_Time') || _ciGet(r,'StartTime') || _ciGet(r,'Start Time') || _ciGet(r,'Start'));
      const end = _genNormTime(_ciGet(r,'End_Time') || _ciGet(r,'EndTime') || _ciGet(r,'End Time') || _ciGet(r,'End'));
      const required = parseInt(_ciGet(r,'Required') || _ciGet(r,'# Required') || '1', 10) || 1;
      if (!shift || !day || !start || !end) continue;
      out.push({ shift, jobType, day, startTime: start, endTime: end, required });
    }
  }

  console.log('[Generate] parseRawShiftRows — output templates:', out.length, out.slice(0,2));
  return out;
}

function parseRawAvailRows(rows: Record<string,string>[]): MemberAvailability[] {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  const isNewFmt = _GEN_ALL_DAYS.some(d => headers.includes(d));
  const map = new Map<string, MemberAvailability>();

  for (const r of rows) {
    const name = r['Name']?.trim();
    if (!name) continue;
    if (!map.has(name)) {
      map.set(name, {
        name,
        job: r['Job']?.trim() || r['Position']?.trim() || null,
        position: r['Position']?.trim() || null,
        leadership: r['Leadership']?.trim() || null,
        minHoursWeek: parseFloat(r['Min hours per week'] ?? r['Min Hours/Week'] ?? '') || 0,
        maxHoursWeek: parseFloat(r['Max hours per week'] ?? r['Max Hours/Week'] ?? '') || 40,
        windows: [],
      });
    }
    const mem = map.get(name)!;
    if (isNewFmt) {
      for (const day of _GEN_ALL_DAYS) {
        if (!headers.includes(day)) continue;
        const val = String(r[day] ?? '').trim();
        const lower = val.toLowerCase();
        if (!val || lower.includes('unavailable')) continue;
        let start: string | null, end: string | null;
        if (lower === 'available all day') { start = '00:00'; end = '23:59'; }
        else {
          const match = val.match(/partially\s+available\s*(.+)/i);
          if (!match) continue;
          const range = match[1].trim();
          const dash = range.indexOf(' - ');
          if (dash === -1) continue;
          start = _genNormTime(range.slice(0, dash).trim());
          end = _genNormTime(range.slice(dash + 3).trim());
        }
        if (start && end) mem.windows.push({ dayOfWeek: _GEN_DAY_INT[day.toLowerCase()], startTime: start, endTime: end });
      }
    } else {
      for (const day of _GEN_ALL_DAYS) {
        const start = _genNormTime(r[`${day} Start`] ?? r[`${day}Start`] ?? '');
        const end = _genNormTime(r[`${day} End`] ?? r[`${day}End`] ?? '');
        if (start && end) mem.windows.push({ dayOfWeek: _GEN_DAY_INT[day.toLowerCase()], startTime: start, endTime: end });
      }
    }
  }
  return Array.from(map.values());
}

/* ─────────────────────────── Types ─────────────────────────── */
type SchedulingRulesType = {
  minHoursPerWeek: number;
  maxHoursPerWeek: number;
  maxDaysPerWeek: number;
  minRestHours: number;
  maxShiftHours: number;
  allowOvertime: boolean;
  enforceFairness: boolean;
  preferAvailability: boolean;
  notes: string | null;
};

const DEFAULT_RULES: SchedulingRulesType = {
  minHoursPerWeek: 0,
  maxHoursPerWeek: 40,
  maxDaysPerWeek: 6,
  minRestHours: 10,
  maxShiftHours: 10,
  allowOvertime: false,
  enforceFairness: true,
  preferAvailability: true,
  notes: null,
};

/* ─────────────────────────── Main Component ─────────────────────────── */
export default function AIScheduleGenerator() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(nextSundayYMD());

  const [members, setMembers] = useState<MemberAvailability[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [schedulingRules, setSchedulingRules] = useState<SchedulingRulesType>(DEFAULT_RULES);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [aiResult, setAIResult] = useState<AIScheduleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'schedule' | 'stats' | 'raw'>(
    'schedule',
  );
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [rawCsvText, setRawCsvText] = useState<string>('');

  const [shiftsSource, setShiftsSource] = useState<'api' | 'csv'>('api');
  const [availSource, setAvailSource] = useState<'api' | 'csv'>('api');

  const shiftsFileRef = useRef<HTMLInputElement>(null);
  const availFileRef = useRef<HTMLInputElement>(null);
  // AbortController ref — cancelled whenever a CSV is uploaded or team changes
  const teamFetchAbort = useRef<AbortController | null>(null);

  const token =
    typeof window !== 'undefined'
      ? (localStorage.getItem('authToken') ?? '')
      : '';
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  /* ── Load teams ── */
  useEffect(() => {
    fetch('/api/teams', { cache: 'no-store', headers: authHeaders })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTeams(data);
          if (data.length) {
            const storedId = Number(localStorage.getItem('currentTeamId'));
            const match = storedId && data.find((t: Team) => t.id === storedId);
            setTeamId(match ? match.id : data[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  /* ── Load team data when team changes ── */
  useEffect(() => {
    if (!teamId) return;

    teamFetchAbort.current?.abort();
    const ctrl = new AbortController();
    teamFetchAbort.current = ctrl;

    setShiftsSource('api');
    setAvailSource('api');
    setError(null);
    setAIResult(null);
    setSavedId(null);

    // Prefer localStorage CSVs uploaded via TeamData — they represent the
    // most recent upload and bypass any stale DB data.
    let hadLocalShifts = false;
    let hadLocalAvail = false;
    try {
      const raw = localStorage.getItem(`shifts_csv_${teamId}`);
      console.log(`[Generate] shifts_csv_${teamId} in localStorage:`, raw ? `${JSON.parse(raw).length} rows` : 'NOT FOUND');
      if (raw) {
        const parsed = parseRawShiftRows(JSON.parse(raw));
        if (parsed.length) { setTemplates(parsed); setShiftsSource('csv'); hadLocalShifts = true; }
        else console.warn('[Generate] parseRawShiftRows returned 0 — check column names in CSV');
      }
    } catch (e) { console.error('[Generate] shifts localStorage error', e); }
    try {
      const raw = localStorage.getItem(`avail_csv_${teamId}`);
      console.log(`[Generate] avail_csv_${teamId} in localStorage:`, raw ? `${JSON.parse(raw).length} rows` : 'NOT FOUND');
      if (raw) {
        const parsed = parseRawAvailRows(JSON.parse(raw));
        if (parsed.length) { setMembers(parsed); setAvailSource('csv'); hadLocalAvail = true; }
        else console.warn('[Generate] parseRawAvailRows returned 0 — check column names in CSV');
      }
    } catch (e) { console.error('[Generate] avail localStorage error', e); }

    // Always fetch scheduling rules (they're never in localStorage)
    fetch(`/api/teams/${teamId}/rules`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => { if (d?.rules) setSchedulingRules(d.rules); })
      .catch(() => {});

    if (hadLocalShifts && hadLocalAvail) return; // nothing else to fetch from DB

    setLoading(true);

    Promise.all([
      hadLocalAvail
        ? Promise.resolve(null)
        : fetch(`/api/teams/${teamId}/availability`, { headers: authHeaders, signal: ctrl.signal }).then((r) => r.json()),
      hadLocalShifts
        ? Promise.resolve(null)
        : fetch(`/api/teams/${teamId}/shifts`, { headers: authHeaders, signal: ctrl.signal }).then((r) => r.json()),
    ])
      .then(([avail, shiftsData]) => {
        if (ctrl.signal.aborted) return;
        if (!hadLocalAvail && avail) {
          const memberMap = new Map<number, MemberAvailability>();
          if (Array.isArray(avail?.members)) {
            for (const m of avail.members) memberMap.set(m.id, { ...m, windows: [] });
          }
          if (Array.isArray(avail?.windows)) {
            for (const w of avail.windows) {
              const m = memberMap.get(w.memberId);
              if (m) m.windows.push({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime });
            }
          }
          setMembers(Array.from(memberMap.values()));
        }
        if (!hadLocalShifts && shiftsData) {
          setTemplates(Array.isArray(shiftsData?.templates) ? shiftsData.templates : []);
        }
      })
      .catch(() => { if (!ctrl.signal.aborted) setError('Error loading team data.'); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
  }, [teamId]);

  /* ── CSV helpers ── */
  function normTime(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    const ap = m[3]?.toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  const DAY_NAME_TO_INT: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  function parseShiftsCsv(file: File) {
    // Cancel any in-flight API fetch so it can't overwrite our CSV data
    teamFetchAbort.current?.abort();
    setLoading(false);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res: Papa.ParseResult<Record<string, string>>) => {
        const parsed: ShiftTemplate[] = [];
        for (const raw of res.data) {
          const row: Record<string, string> = {};
          Object.keys(raw).forEach((k) => {
            row[k.trim()] = String(raw[k] ?? '').trim();
          });
          const shift = row['Shift'];
          const jobType = row['Job_Type'] || '';
          const day = row['Day'];
          const startTime = normTime(row['Start_Time']);
          const endTime = normTime(row['End_Time']);
          const required = parseInt(row['Required'] || '1', 10) || 1;
          if (!shift || !day || !startTime || !endTime) continue;
          parsed.push({ shift, jobType, day, startTime, endTime, required });
        }
        setTemplates(parsed);
        setShiftsSource('csv');
      },
      error: () => setError('Failed to parse Shift Requirements CSV.'),
    });
  }

  function parseAvailabilityCsv(file: File) {
    // Cancel any in-flight API fetch so it can't overwrite our CSV data
    teamFetchAbort.current?.abort();
    setLoading(false);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res: Papa.ParseResult<Record<string, string>>) => {
        const WEEK = [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ];
        const parsed: MemberAvailability[] = [];
        for (const raw of res.data) {
          const row: Record<string, string> = {};
          Object.keys(raw).forEach((k) => {
            row[k.trim()] = String(raw[k] ?? '').trim();
          });
          const name = row['Name'];
          if (!name) continue;
          const job = row['Job'] || row['Job_Type'] || null;
          const position = row['Position'] || null;
          const leadership = row['Leadership'] || null;
          const minHoursWeek = parseFloat(row['Min Hours'] || '0') || 0;
          const maxHoursWeek = parseFloat(row['Max Hours'] || '40') || 40;
          const windows: MemberAvailability['windows'] = [];
          for (const dayName of WEEK) {
            const start = normTime(row[`${dayName} Start`]);
            const end = normTime(row[`${dayName} End`]);
            if (!start || !end) continue;
            const dayOfWeek = DAY_NAME_TO_INT[dayName.toLowerCase()];
            windows.push({ dayOfWeek, startTime: start, endTime: end });
          }
          parsed.push({
            name,
            job,
            position,
            leadership,
            minHoursWeek,
            maxHoursWeek,
            windows,
          });
        }
        setMembers(parsed);
        setAvailSource('csv');
      },
      error: () => setError('Failed to parse Availability CSV.'),
    });
  }

  /* ── Build the 6-day schedule via OpenAI ── */
  async function generateSchedule() {
    if (!teamId || !members.length || !templates.length) {
      setError(
        'You need to load availability and shift data for the selected team.',
      );
      return;
    }

    setGenerating(true);
    setError(null);
    setAIResult(null);
    setActiveTab('schedule');
    setSavedId(null);

    // Build Mon–Sat dates
    const monDate = addDays(startDate, 1);
    const dates: { date: string; dayName: string; dayOfWeek: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = addDays(monDate, i);
      dates.push({
        date: d,
        dayName: DAY_INT_TO_NAME[getDayOfWeek(d)],
        dayOfWeek: getDayOfWeek(d),
      });
    }

    // ── Pre-compute eligible employees per shift (hard availability gate) ──
    // This runs client-side before the AI ever sees the data, so invalid
    // assignments are structurally impossible: the AI only receives names
    // that actually cover the shift window.
    function computeEligibleNames(dayOfWeek: number, startMin: number, endMin: number): string {
      const eligible: string[] = [];
      for (const m of members) {
        if (!m.windows?.length) {
          // No availability data recorded → can't exclude them
          eligible.push(m.name);
          continue;
        }
        const dayWins = m.windows.filter((w) => w.dayOfWeek === dayOfWeek);
        if (dayWins.length === 0) continue; // has data for other days but not this one → unavailable
        if (dayWins.some((w) => toMinutes(w.startTime) <= startMin && toMinutes(w.endTime) >= endMin)) {
          eligible.push(m.name);
        }
      }
      return eligible.join(';');
    }

    // ── Build CSV input for the AI ──
    const shiftRows = dates.flatMap(({ date, dayName, dayOfWeek }) =>
      templates
        .filter((t) =>
          t.day.toLowerCase().startsWith(dayName.toLowerCase().slice(0, 3)),
        )
        .map((t) => {
          const startMin = toMinutes(t.startTime);
          const endMin = toMinutes(t.endTime);
          return {
            Day: dayName,
            Date: date,
            Shift: t.shift,
            JobType: t.jobType,
            StartTime: t.startTime,
            EndTime: t.endTime,
            Required: t.required,
            EligibleEmployees: computeEligibleNames(dayOfWeek, startMin, endMin),
          };
        }),
    );

    const availRows: Record<string, string | number>[] = [];
    for (const m of members) {
      const windows = dates.flatMap(({ dayName, dayOfWeek }) =>
        m.windows
          .filter((w) => w.dayOfWeek === dayOfWeek)
          .map((w) => ({ Day: dayName, StartTime: w.startTime, EndTime: w.endTime })),
      );
      if (windows.length === 0) {
        availRows.push({
          Name: m.name, Job: m.job ?? '', Position: m.position ?? '',
          Leadership: m.leadership ?? '',
          MinHoursWeek: m.minHoursWeek ?? 0, MaxHoursWeek: m.maxHoursWeek ?? 40,
          Day: '', StartTime: '', EndTime: '',
        });
      } else {
        for (const w of windows) {
          availRows.push({
            Name: m.name, Job: m.job ?? '', Position: m.position ?? '',
            Leadership: m.leadership ?? '',
            MinHoursWeek: m.minHoursWeek ?? 0, MaxHoursWeek: m.maxHoursWeek ?? 40,
            Day: w.Day, StartTime: w.StartTime, EndTime: w.EndTime,
          });
        }
      }
    }

    const shiftCsvText = Papa.unparse(shiftRows);
    const availCsvText = Papa.unparse(availRows);

    const sr = schedulingRules ?? DEFAULT_RULES;

    const prompt = `You are an expert restaurant scheduler. Generate a complete Mon–Sat schedule from the CSV data below.

=== SHIFT REQUIREMENTS ===
${shiftCsvText}

=== EMPLOYEE AVAILABILITY ===
${availCsvText}

=== SCHEDULING RULES (set by the manager — follow exactly) ===
Min hours per employee per week: ${sr.minHoursPerWeek}h
Max hours per employee per week: ${sr.maxHoursPerWeek}h (${sr.allowOvertime ? 'overtime IS allowed — you may exceed this if needed' : 'overtime NOT allowed — do not exceed this'})
Max days per employee per week: ${sr.maxDaysPerWeek} days
Min rest between consecutive shifts: ${sr.minRestHours}h
Max shift length per employee per day: ${sr.maxShiftHours}h (truck carry-over included)
Balance workload fairly: ${sr.enforceFairness ? 'YES — prioritize employees with fewer cumulative hours' : 'NO — fill shifts without worrying about equal distribution'}${sr.notes ? `\n\nManager notes (read carefully and apply):\n${sr.notes}` : ''}

SCHEDULING RULES:
1. AVAILABILITY HARD CONSTRAINT — NO EXCEPTIONS. Each shift row in SHIFT REQUIREMENTS contains an EligibleEmployees column that lists the ONLY employees whose availability covers that exact shift window. You MUST assign ONLY names that appear in the EligibleEmployees list for each specific shift. Do NOT assign anyone whose name is absent from that list, even if they appear in the Employee Availability table. If EligibleEmployees has fewer names than Required, assign only those available and explain in Notes — leaving a slot unfilled is correct; assigning someone not on the list is always wrong.
2. Job type matching is PREFERRED but NOT required. If an employee's job classification matches the shift type (e.g., BOH staff on BOH shifts), prefer that assignment. However, if no matching employees are available, assign any available employee regardless of job type — do NOT leave a shift unstaffed because of job classification alone. Leaders, Directors, and employees without a specific job type can work any shift.
3. TRUCK CARRY-OVER: If an employee finishes a TRUCK shift at time X and a regular shift starts at exactly time X, they may work both back-to-back with no rest gap required.
4. For all other consecutive shifts, require at least ${sr.minRestHours} hours rest between them.
5. Do NOT exceed ${sr.maxShiftHours} hours total per employee per day (truck + carry-over combined).
6. Respect each employee's MinHoursWeek and MaxHoursWeek columns from the availability table AND the weekly min/max from the Scheduling Rules section above.
7. ${sr.enforceFairness ? 'BALANCE: Assign employees with fewer cumulative weekly hours first to distribute work fairly.' : 'STAFFING: Fill each shift with any eligible employee — fairness distribution is not required this week.'}
8. DAY OFF: Every employee — regardless of role (Team Leader, Director, Team Member, etc.) — must have at least one full day off during the Mon–Sat week. Rules: (a) If an employee's availability already marks them as Unavailable/Off on one or more days, those days ARE their day(s) off — do not force an additional day off, just schedule them normally on the days they are available. (b) Only if an employee is available all 6 days (Mon–Sat) must you leave them unscheduled on at least one of those days. (c) Sunday being closed does NOT count as anyone's day off.
9. If a slot cannot be filled, still include the shift entry with fewer assigned names and explain in Notes.

CRITICAL: Your ENTIRE response must be ONLY the four sections below — no introduction, no explanation, no markdown, nothing else before or after.

SCHEDULE
Day,Date,Shift,JobType,StartTime,EndTime,Required,Assigned,Notes
<one CSV data row per shift — Assigned = semicolon-separated names e.g. John;Jane — Notes = empty if fully staffed>

SUMMARY
<one plain sentence about overall coverage>

WARNINGS
<one warning per line — write NONE if no warnings>

STATS
Employee,Hours
<one row per employee with total weekly hours>`;

    try {
      const response = await fetch('/api/openai/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5.4-mini',
          max_completion_tokens: 16000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setError(
          'Request failed: ' +
            (err?.error?.message || `HTTP ${response.status}`),
        );
        return;
      }

      const data = await response.json();
      const text: string = data.choices?.[0]?.message?.content ?? '';

      setRawCsvText(text);
      try {
        // Normalize line endings, strip markdown fences
        const cleaned = text
          .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          .replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');

        // Match any line that contains ONLY a known section keyword
        // (surrounded by optional decoration: ===, #, *, -, spaces)
        const SECTION_RE = /^[=\-#*\s]*\b(SCHEDULE|SUMMARY|WARNINGS?|STATS?)\b[=\-#*\s]*$/i;
        const sections: Record<string, string> = {};
        let current = '';
        for (const line of cleaned.split('\n')) {
          const m = line.trim().match(SECTION_RE);
          if (m) {
            const raw = m[1].toUpperCase();
            current = raw.startsWith('WARNING') ? 'WARNINGS'
                    : raw.startsWith('STAT')    ? 'STATS'
                    : raw; // SCHEDULE or SUMMARY
            sections[current] = '';
          } else if (current) {
            sections[current] += line + '\n';
          }
        }

        // Fallback: if no sections found at all, treat the whole response as
        // the schedule block (Claude sometimes skips the headers entirely)
        if (!sections['SCHEDULE'] && !sections['SUMMARY']) {
          const csvStart = cleaned.search(/^Day,/im);
          if (csvStart !== -1) sections['SCHEDULE'] = cleaned.slice(csvStart);
        }

        const schedText = sections['SCHEDULE']?.trim() ?? '';
        if (!schedText) throw new Error('No SCHEDULE section found');

        const schedRows = Papa.parse<Record<string, string>>(schedText, {
          header: true, skipEmptyLines: true,
        }).data;

        const schedule: ScheduleEntry[] = schedRows.map((r) => ({
          day: r['Day'] ?? '',
          date: r['Date'] ?? '',
          shift: r['Shift'] ?? '',
          jobType: r['JobType'] ?? '',
          startTime: r['StartTime'] ?? '',
          endTime: r['EndTime'] ?? '',
          required: parseInt(r['Required'] || '1', 10) || 1,
          assigned: r['Assigned']
            ? r['Assigned'].split(';').map((s) => s.trim()).filter(Boolean)
            : [],
          notes: r['Notes'] || undefined,
        }));

        const summary = sections['SUMMARY']?.trim() ?? '';
        const warningsRaw = sections['WARNINGS']?.trim() ?? '';
        const warnings =
          !warningsRaw || warningsRaw.toUpperCase() === 'NONE'
            ? []
            : warningsRaw.split('\n').map((s) => s.trim()).filter(Boolean);

        const statRows = Papa.parse<Record<string, string>>(
          sections['STATS']?.trim() ?? '', { header: true, skipEmptyLines: true },
        ).data;
        const employeeHours: Record<string, number> = {};
        for (const r of statRows) {
          const name = r['Employee']?.trim();
          const hours = parseFloat(r['Hours'] || '0');
          if (name) employeeHours[name] = hours;
        }

        // ── Hard availability validation ──────────────────────────────
        // Build lookup: name (lowercase) → dayOfWeek → windows[]
        // Only remove an assignment when we have a confirmed window for that day
        // AND the shift falls outside it. If we have no data → keep the assignment.
        const availByName = new Map<string, Map<number, { s: number; e: number }[]>>();
        for (const m of members) {
          if (!m.windows?.length) continue; // no data → skip, don't penalise
          const dayMap = new Map<number, { s: number; e: number }[]>();
          for (const w of m.windows) {
            const arr = dayMap.get(w.dayOfWeek) ?? [];
            const s = toMinutes(hhmm24(w.startTime));
            const e = toMinutes(hhmm24(w.endTime));
            if (Number.isFinite(s) && Number.isFinite(e) && e > 0) {
              arr.push({ s, e });
              dayMap.set(w.dayOfWeek, arr);
            }
          }
          if (dayMap.size > 0) availByName.set(m.name.trim().toLowerCase(), dayMap);
        }

        function personCanWork(name: string, dayName: string, shiftStart: string, shiftEnd: string): boolean {
          const dayIdx = _GEN_DAY_INT[dayName.toLowerCase()];
          if (dayIdx === undefined) return true; // unknown day — keep
          const dayMap = availByName.get(name.trim().toLowerCase());
          if (!dayMap || dayMap.size === 0) return true; // no availability data at all — keep
          const windows = dayMap.get(dayIdx);
          if (!windows || windows.length === 0) {
            // Has availability data for OTHER days but none for this day → unavailable
            return false;
          }
          const ss = toMinutes(hhmm24(shiftStart));
          let se = toMinutes(hhmm24(shiftEnd));
          if (se < ss) se += 1440; // overnight
          return windows.some(({ s, e }) => s <= ss && e >= se);
        }

        const violationWarnings: string[] = [];
        const validatedSchedule: ScheduleEntry[] = schedule.map((entry) => {
          const validAssigned = entry.assigned.filter((name) => {
            const ok = personCanWork(name, entry.day, entry.startTime, entry.endTime);
            if (!ok) {
              violationWarnings.push(
                `Removed ${name} from ${entry.shift} on ${entry.day} (${entry.startTime}–${entry.endTime}): outside their availability.`
              );
            }
            return ok;
          });
          return { ...entry, assigned: validAssigned };
        });

        const allWarnings = [...violationWarnings, ...warnings];

        const fullyStaffed = validatedSchedule.filter((s) => s.assigned.length >= s.required).length;
        const understaffed = validatedSchedule.filter((s) => s.assigned.length < s.required).length;

        setAIResult({
          schedule: validatedSchedule,
          summary,
          warnings: allWarnings,
          stats: { totalShifts: validatedSchedule.length, fullyStaffed, understaffed, employeeHours },
        });
      } catch (parseErr) {
        setError('The AI returned an unexpected format: ' + (parseErr instanceof Error ? parseErr.message : String(parseErr)));
      }
    } catch (e) {
      setError(
        'Error communicating with Claude: ' +
          (e instanceof Error ? e.message : 'Unknown error'),
      );
    } finally {
      setGenerating(false);
    }
  }

  /* ── Save schedule to DB ── */
  async function saveScheduleToDB() {
    if (!aiResult || !teamId) return;
    setSavingSchedule(true);
    const weekStart = addDays(startDate, 1);
    const weekEnd = addDays(startDate, 6);
    try {
      const scheduleData = {
        shifts: aiResult.schedule.map((entry) => ({
          shiftId: `${entry.date}_${entry.shift}_${entry.startTime}`,
          date: entry.date,
          weekday: entry.day.slice(0, 3).toUpperCase(),
          shiftName: entry.shift,
          jobType: entry.jobType,
          startHHMM: entry.startTime,
          endHHMM: entry.endTime,
          required: entry.required,
          assigned: entry.assigned.map((name, i) => ({ memberId: i, name })),
          unfilled: Math.max(0, entry.required - entry.assigned.length),
        })),
        stats: {
          hoursByMember: aiResult.stats.employeeHours,
          shiftsByMember: {},
          unfilledShifts: aiResult.stats.understaffed,
          totalUnfilledSlots: aiResult.schedule.reduce(
            (acc, s) => acc + Math.max(0, s.required - s.assigned.length),
            0,
          ),
        },
        notes: [...aiResult.warnings, aiResult.summary],
      };

      const res = await fetch(`/api/teams/${teamId}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          name: `AI Schedule – Week of ${weekStart}`,
          startDate: weekStart,
          endDate: weekEnd,
          optimization: 'AI_GENERATED',
          data: scheduleData,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result?.error ?? 'Failed to save');
      if (result?.savedScheduleId) setSavedId(result.savedScheduleId);
    } catch (e) {
      setError('Error saving the schedule: ' + (e instanceof Error ? e.message : 'unknown'));
    } finally {
      setSavingSchedule(false);
    }
  }

  /* ── Staffing color ── */
  function staffColor(assigned: number, required: number) {
    if (assigned >= required) return '#22c55e';
    if (assigned > 0) return '#f59e0b';
    return '#ef4444';
  }

  const selectedTeam = teams.find((t) => t.id === teamId);
  const endDate = addDays(startDate, 6);

  /* ─────────────────────────── Render ─────────────────────────── */
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            🧠
          </div>
          <div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                margin: 0,
                letterSpacing: '-0.5px',
              }}
            >
              Generate Schedule
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Smart Scheduler
            </p>
          </div>
        </div>
      </div>

      {/* Config Panel */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr auto',
            gap: 16,
            alignItems: 'end',
          }}
        >
          {/* Team */}
          <div>
            <label
              style={{
                fontSize: 12,
                color: 'var(--text-2)',
                display: 'block',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Team
            </label>
            <select
              value={teamId ?? ''}
              onChange={(e) => setTeamId(Number(e.target.value))}
              disabled={generating}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Week start (Sunday) */}
          <div>
            <label
              style={{
                fontSize: 12,
                color: 'var(--text-2)',
                display: 'block',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Week Starting (Sunday)
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={generating}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: 14,
              }}
            />
          </div>

          {/* Info */}
          <div style={{ paddingBottom: 2 }}>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-2)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Info
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span
                style={{
                  background: members.length
                    ? 'var(--success-soft)'
                    : 'var(--danger-soft)',
                  color: members.length ? 'var(--success)' : 'var(--danger)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                👥 {members.length} employees
              </span>
              <span
                style={{
                  background: templates.length
                    ? 'var(--accent-soft)'
                    : 'var(--danger-soft)',
                  color: templates.length
                    ? 'var(--accent-text)'
                    : 'var(--danger)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                📋 {templates.length} shifts
              </span>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={generateSchedule}
            disabled={
              generating ||
              loading ||
              !teamId ||
              !members.length ||
              !templates.length
            }
            style={{
              padding: '12px 28px',
              background: generating ? 'var(--elevated)' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: generating ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              boxShadow: generating
                ? 'none'
                : '0 4px 20px rgba(99,102,241,0.4)',
            }}
          >
            {generating ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-block',
                    animation: 'spin 1s linear infinite',
                  }}
                >
                  ⟳
                </span>
                Generating...
              </span>
            ) : (
              '⚡ Generate Schedule'
            )}
          </button>
        </div>

        {loading && (
          <div
            style={{
              marginTop: 16,
              fontSize: 13,
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ animation: 'pulse 1.5s ease infinite' }}>●</span>{' '}
            Loading team data...
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              background: 'var(--danger-soft)',
              border: '1px solid var(--danger)',
              borderRadius: 12,
              padding: '14px 18px',
              color: 'var(--danger)',
              fontSize: 14,
            }}
          >
            ⚠️ {error}
          </div>
          {rawCsvText && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12, color: 'var(--text-3)', cursor: 'pointer' }}>
                View raw AI response
              </summary>
              <pre style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 6, whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>
                {rawCsvText}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Generating animation */}
      {generating && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: 32,
            marginBottom: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>🧠</div>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Building schedule from availability and shift templates...
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
            Balancing {members.length} employees across {templates.length}{' '}
            shifts for Mon–Sat
          </p>
          <div
            style={{
              marginTop: 20,
              height: 4,
              background: 'var(--elevated)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: '40%',
                background: 'var(--accent)',
                borderRadius: 2,
                animation: 'loading 1.5s ease-in-out infinite',
              }}
            />
          </div>
        </div>
      )}

      {/* Results */}
      {aiResult && !generating && (
        <div>
          {/* Tab bar + Save button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', gap: 4 }}>
              {(['schedule', 'stats', 'raw'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    background:
                      activeTab === tab ? 'var(--accent)' : 'var(--elevated)',
                    color: activeTab === tab ? '#fff' : 'var(--text-2)',
                    border:
                      activeTab === tab ? 'none' : '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  {tab === 'schedule'
                    ? '📅 Horario'
                    : tab === 'stats'
                      ? '📊 Stats'
                      : '🔍 Raw CSV'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {savedId && (
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--success)',
                    background: 'var(--success-soft)',
                    padding: '6px 12px',
                    borderRadius: 8,
                  }}
                >
                  ✓ Saved #{savedId}
                </span>
              )}
              <button
                onClick={saveScheduleToDB}
                disabled={savingSchedule || !!savedId}
                style={{
                  padding: '9px 20px',
                  background: savedId
                    ? 'var(--elevated)'
                    : 'var(--success-soft)',
                  color: savedId ? 'var(--text-3)' : 'var(--success)',
                  border: '1px solid',
                  borderColor: savedId ? 'var(--border)' : 'var(--success)',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: savedId ? 'default' : 'pointer',
                }}
              >
                {savingSchedule
                  ? 'Saving...'
                  : savedId
                    ? 'Saved ✓'
                    : '💾 Save Schedule'}
              </button>
            </div>
          </div>

          {/* Summary bar */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '14px 20px',
              marginBottom: 20,
              display: 'flex',
              gap: 24,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--accent)', flex: 1 }}>
              💬 {aiResult.summary}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Total shifts:</span>{' '}
                <b style={{ color: 'var(--text)' }}>
                  {aiResult.stats.totalShifts}
                </b>
              </span>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: '#22c55e' }}>✓</span>{' '}
                <b style={{ color: 'var(--text)' }}>
                  {aiResult.stats.fullyStaffed}
                </b>
              </span>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: '#ef4444' }}>⚠</span>{' '}
                <b style={{ color: 'var(--text)' }}>
                  {aiResult.stats.understaffed}
                </b>
              </span>
            </div>
          </div>

          {/* Warnings */}
          {aiResult.warnings.length > 0 && (
            <div
              style={{
                background: 'color-mix(in srgb, #f59e0b 12%, transparent)',
                border: '1px solid #d97706',
                borderRadius: 12,
                padding: '12px 18px',
                marginBottom: 16,
              }}
            >
              {aiResult.warnings.map((w, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    color: '#d97706',
                    marginBottom: i < aiResult.warnings.length - 1 ? 4 : 0,
                  }}
                >
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div>
              {DAYS_OF_WEEK.map((dayName) => {
                const dayEntries = aiResult.schedule.filter(
                  (s) => s.day === dayName,
                );
                if (!dayEntries.length) return null;
                const dateStr = dayEntries[0].date;

                return (
                  <div
                    key={dayName}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      marginBottom: 16,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Day header */}
                    <div
                      style={{
                        padding: '14px 20px',
                        background: 'var(--elevated)',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: 'var(--accent)',
                        }}
                      >
                        {dayName}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                        {dateStr}
                      </span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: 12,
                          background: 'var(--bg)',
                          padding: '3px 10px',
                          borderRadius: 20,
                          color: 'var(--text-2)',
                        }}
                      >
                        {dayEntries.length} shifts
                      </span>
                    </div>

                    {/* Shifts */}
                    <div
                      style={{ padding: '12px 16px', display: 'grid', gap: 8 }}
                    >
                      {dayEntries.map((entry, i) => {
                        const filled = entry.assigned.length;
                        const needed = entry.required;
                        const color = staffColor(filled, needed);

                        return (
                          <div
                            key={i}
                            style={{
                              background: 'var(--bg)',
                              border: `1px solid var(--border)`,
                              borderLeft: `3px solid ${color}`,
                              borderRadius: 10,
                              padding: '12px 16px',
                              display: 'grid',
                              gridTemplateColumns: '1fr auto',
                              gap: 12,
                              alignItems: 'center',
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 6,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    background: 'var(--accent-soft)',
                                    color: 'var(--accent-text)',
                                  }}
                                >
                                  {entry.jobType}
                                </span>
                                <span
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: 'var(--text)',
                                  }}
                                >
                                  {entry.shift}
                                </span>
                                <span
                                  style={{
                                    fontSize: 13,
                                    color: 'var(--text-2)',
                                  }}
                                >
                                  {entry.startTime} – {entry.endTime}
                                </span>
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: 'var(--text-2)',
                                  }}
                                >
                                  (
                                  {shiftHours(
                                    entry.startTime,
                                    entry.endTime,
                                  ).toFixed(1)}
                                  h)
                                </span>
                              </div>

                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 6,
                                }}
                              >
                                {entry.assigned.map((name, j) => (
                                  <span
                                    key={j}
                                    style={{
                                      fontSize: 12,
                                      padding: '3px 10px',
                                      borderRadius: 20,
                                      background: 'var(--surface)',
                                      border: '1px solid var(--border)',
                                      color: 'var(--text)',
                                    }}
                                  >
                                    {name}
                                  </span>
                                ))}
                                {Array.from({
                                  length: Math.max(0, needed - filled),
                                }).map((_, j) => (
                                  <span
                                    key={`empty-${j}`}
                                    style={{
                                      fontSize: 12,
                                      padding: '3px 10px',
                                      borderRadius: 20,
                                      background: 'var(--danger-soft)',
                                      border: '1px dashed var(--danger)',
                                      color: 'var(--danger)',
                                    }}
                                  >
                                    Unassigned
                                  </span>
                                ))}
                              </div>

                              {entry.notes && (
                                <div
                                  style={{
                                    marginTop: 6,
                                    fontSize: 12,
                                    color: '#f59e0b',
                                  }}
                                >
                                  ⚠ {entry.notes}
                                </div>
                              )}
                            </div>

                            {/* Staffing indicator */}
                            <div style={{ textAlign: 'center' }}>
                              <div
                                style={{
                                  fontSize: 18,
                                  fontWeight: 800,
                                  color,
                                }}
                              >
                                {filled}/{needed}
                              </div>
                              <div
                                style={{ fontSize: 11, color: 'var(--text-3)' }}
                              >
                                {filled >= needed ? 'Complete' : 'Incomplete'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 20,
              }}
            >
              {/* Hours per employee */}
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <h3
                  style={{
                    margin: '0 0 16px 0',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  ⏱ Hours assigned per employee
                </h3>
                {Object.entries(aiResult.stats.employeeHours)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, hours]) => {
                    const member = members.find((m) => m.name === name);
                    const max = member?.maxHoursWeek ?? 40;
                    const pct = Math.min(100, (hours / max) * 100);
                    const barColor =
                      pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';

                    return (
                      <div key={name} style={{ marginBottom: 12 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                            fontSize: 13,
                          }}
                        >
                          <span>{name}</span>
                          <span style={{ color: barColor, fontWeight: 700 }}>
                            {hours}h / {max}h
                          </span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: 'var(--elevated)',
                            borderRadius: 3,
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: barColor,
                              borderRadius: 3,
                              transition: 'width 0.5s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Coverage summary */}
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <h3
                  style={{
                    margin: '0 0 16px 0',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  📊 Coverage by Day
                </h3>
                {DAYS_OF_WEEK.map((day) => {
                  const entries = aiResult.schedule.filter(
                    (s) => s.day === day,
                  );
                  const total = entries.reduce((acc, s) => acc + s.required, 0);
                  const filled = entries.reduce(
                    (acc, s) => acc + s.assigned.length,
                    0,
                  );
                  const pct =
                    total > 0 ? Math.round((filled / total) * 100) : 0;
                  const color =
                    pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';

                  return (
                    <div key={day} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                          fontSize: 13,
                        }}
                      >
                        <span>{day}</span>
                        <span style={{ color, fontWeight: 700 }}>
                          {filled}/{total} slots ({pct}%)
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: 'var(--elevated)',
                          borderRadius: 3,
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: color,
                            borderRadius: 3,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}

                <div
                  style={{
                    marginTop: 20,
                    padding: '12px 16px',
                    background: 'var(--bg)',
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 13,
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ color: 'var(--text-2)' }}>
                      Complete shifts
                    </span>
                    <span style={{ color: '#22c55e', fontWeight: 700 }}>
                      {aiResult.stats.fullyStaffed}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: 'var(--text-2)' }}>
                      Incomplete shifts
                    </span>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>
                      {aiResult.stats.understaffed}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Raw CSV Tab */}
          {activeTab === 'raw' && (
            <div
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 20,
                overflow: 'auto',
                maxHeight: 500,
              }}
            >
              <pre
                style={{
                  fontSize: 12,
                  color: 'var(--accent)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {rawCsvText}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!aiResult && !generating && !error && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px dashed var(--border)',
            borderRadius: 16,
            padding: 48,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🗓️</div>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Ready to generate your schedule!
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-2)' }}>
            Select a team with availability and shifts loaded, then press{' '}
            <strong style={{ color: 'var(--accent)' }}>
              ⚡ Generate Schedule
            </strong>
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes loading {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(-100%); }
        }
        select option { background: var(--bg); }
      `}</style>
    </div>
  );
}
