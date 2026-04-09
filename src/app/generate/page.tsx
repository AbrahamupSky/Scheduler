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
const DAY_INT_TO_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  let h = Number(m[1]), min = Number(m[2]);
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


/* ─────────────────────────── Main Component ─────────────────────────── */
export default function AIScheduleGenerator() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(nextSundayYMD());

  const [members, setMembers] = useState<MemberAvailability[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [aiResult, setAIResult] = useState<AIScheduleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'schedule' | 'stats' | 'raw'>('schedule');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);

  const [shiftsSource, setShiftsSource] = useState<'api' | 'csv'>('api');
  const [availSource, setAvailSource] = useState<'api' | 'csv'>('api');

  const shiftsFileRef = useRef<HTMLInputElement>(null);
  const availFileRef = useRef<HTMLInputElement>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') ?? '' : '';
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  /* ── Load teams ── */
  useEffect(() => {
    fetch('/api/teams', { cache: 'no-store', headers: authHeaders })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setTeams(data);
          if (data.length) setTeamId(data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  /* ── Load team data when team changes ── */
  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    setAIResult(null);
    setSavedId(null);

    Promise.all([
      fetch(`/api/teams/${teamId}/availability`, { headers: authHeaders }).then(r => r.json()),
      fetch(`/api/teams/${teamId}/shifts`, { headers: authHeaders }).then(r => r.json()),
    ])
      .then(([avail, shiftsData]) => {
        // Build member availability map
        const memberMap = new Map<number, MemberAvailability>();
        if (Array.isArray(avail?.members)) {
          for (const m of avail.members) {
            memberMap.set(m.id, { ...m, windows: [] });
          }
        }
        if (Array.isArray(avail?.windows)) {
          for (const w of avail.windows) {
            const m = memberMap.get(w.memberId);
            if (m) m.windows.push({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime });
          }
        }
        setMembers(Array.from(memberMap.values()));
        setTemplates(Array.isArray(shiftsData?.templates) ? shiftsData.templates : []);
      })
      .catch(e => setError('Error loading team data.'))
      .finally(() => setLoading(false));
  }, [teamId]);

  /* ── CSV helpers ── */
  function normTime(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
    if (!m) return null;
    let h = Number(m[1]); const min = Number(m[2]);
    const ap = m[3]?.toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  const DAY_NAME_TO_INT: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };

  function parseShiftsCsv(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res: Papa.ParseResult<Record<string, string>>) => {
        const parsed: ShiftTemplate[] = [];
        for (const raw of res.data) {
          const row: Record<string, string> = {};
          Object.keys(raw).forEach(k => { row[k.trim()] = String(raw[k] ?? '').trim(); });
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
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res: Papa.ParseResult<Record<string, string>>) => {
        const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const parsed: MemberAvailability[] = [];
        for (const raw of res.data) {
          const row: Record<string, string> = {};
          Object.keys(raw).forEach(k => { row[k.trim()] = String(raw[k] ?? '').trim(); });
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
          parsed.push({ name, job, position, leadership, minHoursWeek, maxHoursWeek, windows });
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
      setError('You need to load availability and shift data for the selected team.');
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
      dates.push({ date: d, dayName: DAY_INT_TO_NAME[getDayOfWeek(d)], dayOfWeek: getDayOfWeek(d) });
    }

    // ── Convert templates + availability to JSON for MiniMax ──
    const shiftRequirements = dates.flatMap(({ date, dayName }) =>
      templates
        .filter(t => t.day.toLowerCase().startsWith(dayName.toLowerCase().slice(0, 3)))
        .map(t => ({
          day: dayName,
          date,
          shift: t.shift,
          jobType: t.jobType,
          startTime: t.startTime,
          endTime: t.endTime,
          required: t.required,
        }))
    );

    const employeeData = members.map(m => ({
      name: m.name,
      job: m.job ?? null,
      position: m.position ?? null,
      leadership: m.leadership ?? null,
      minHoursWeek: m.minHoursWeek ?? 0,
      maxHoursWeek: m.maxHoursWeek ?? 40,
      availability: dates.map(({ dayName, dayOfWeek }) => ({
        day: dayName,
        windows: m.windows
          .filter(w => w.dayOfWeek === dayOfWeek)
          .map(w => ({ start: w.startTime, end: w.endTime })),
      })).filter(d => d.windows.length > 0),
    }));

    const inputPayload = { shiftRequirements, employees: employeeData };

    const prompt = `You are an expert restaurant scheduler. Generate a complete Mon–Sat schedule from the JSON data below.

INPUT DATA:
${JSON.stringify(inputPayload, null, 2)}

SCHEDULING RULES:
1. Only assign an employee to a shift if they have an availability window covering the full shift time on that day.
2. Match job types: FOH staff → FOH shifts, BOH staff → BOH shifts, TRUCK → TRUCK. A member with multiple roles can work either matching type.
3. TRUCK CARRY-OVER: If an employee finishes a TRUCK shift at time X and a regular shift starts at exactly time X, they may work both back-to-back with no rest gap required.
4. For all other consecutive shifts, require at least 10 hours rest between them.
5. Do NOT exceed 10 hours total per employee per day (truck + carry-over combined).
6. Respect each employee's minHoursWeek and maxHoursWeek.
7. BALANCE: Assign employees with fewer cumulative weekly hours first to distribute work fairly.
8. If a slot cannot be filled, still include the shift entry with fewer assigned names and explain in "notes".

OUTPUT: Respond ONLY with valid JSON — no markdown fences, no explanation, nothing else.

{
  "schedule": [
    {
      "day": "Monday",
      "date": "YYYY-MM-DD",
      "shift": "shift name from shiftRequirements",
      "jobType": "FOH|BOH|TRUCK|PREP",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "required": 2,
      "assigned": ["Name1", "Name2"],
      "notes": "optional — only if understaffed or truck carry-over used"
    }
  ],
  "summary": "One sentence describing overall coverage quality",
  "warnings": ["Any understaffed shifts or rule conflicts"],
  "stats": {
    "totalShifts": 0,
    "fullyStaffed": 0,
    "understaffed": 0,
    "employeeHours": { "EmployeeName": 0.0 }
  }
}`;

    try {
      const response = await fetch('/api/minimax/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'MiniMax-Text-01',
          max_tokens: 8000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setError('Request failed: ' + (err?.error?.message || `HTTP ${response.status}`));
        return;
      }

      const data = await response.json();
      const text: string = data.choices?.[0]?.message?.content ?? '';

      try {
        const clean = text.replace(/```json\n?|```/g, '').trim();
        const result: AIScheduleResult = JSON.parse(clean);
        setAIResult(result);
      } catch {
        setError('The model returned invalid JSON. Please try again.');
      }
    } catch (e) {
      setError('Error communicating with MiniMax: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setGenerating(false);
    }
  }

  /* ── Save schedule to DB ── */
  async function saveScheduleToDB() {
    if (!aiResult || !teamId) return;
    setSavingSchedule(true);
    try {
      const scheduleData = {
        teamId,
        startDate,
        endDate: addDays(startDate, 6),
        shifts: aiResult.schedule.map(entry => ({
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
          totalUnfilledSlots: aiResult.schedule.reduce((acc, s) =>
            acc + Math.max(0, s.required - s.assigned.length), 0),
        },
        notes: [...aiResult.warnings, aiResult.summary],
      };

      const res = await fetch(`/api/teams/${teamId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          startDate: addDays(startDate, 1),
          endDate: addDays(startDate, 6),
          scheduleName: `IA Schedule - Week of ${addDays(startDate, 1)}`,
          optimization: 'BALANCED_WORKLOAD',
        }),
      });

      const data = await res.json();
      if (data?.savedScheduleId) setSavedId(data.savedScheduleId);
    } catch {
      setError('Error saving the schedule.');
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

  const selectedTeam = teams.find(t => t.id === teamId);
  const endDate = addDays(startDate, 6);

  /* ─────────────────────────── Render ─────────────────────────── */
  return (
    <div style={{
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      background: '#0f1117',
      minHeight: '100vh',
      color: '#e8e8f0',
      padding: '24px',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>🧠</div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>
              Generate Schedule
            </h1>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
              Smart Scheduler
            </p>
          </div>
        </div>
      </div>

      {/* Config Panel */}
      <div style={{
        background: '#1a1d2e',
        border: '1px solid #2d3148',
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 16, alignItems: 'end' }}>
          {/* Team */}
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
              Team
            </label>
            <select
              value={teamId ?? ''}
              onChange={e => setTeamId(Number(e.target.value))}
              disabled={generating}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                background: '#0f1117', border: '1px solid #2d3148',
                color: '#e8e8f0', fontSize: 14, cursor: 'pointer',
              }}
            >
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Week start (Sunday) */}
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
              Week Starting (Sunday)
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              disabled={generating}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                background: '#0f1117', border: '1px solid #2d3148',
                color: '#e8e8f0', fontSize: 14,
              }}
            />
          </div>

          {/* Info */}
          <div style={{ paddingBottom: 2 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
              Info
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{
                background: members.length ? '#14532d' : '#3f1515',
                color: members.length ? '#86efac' : '#fca5a5',
                padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              }}>
                👥 {members.length} employees
              </span>
              <span style={{
                background: templates.length ? '#1e3a5f' : '#3f1515',
                color: templates.length ? '#93c5fd' : '#fca5a5',
                padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              }}>
                📋 {templates.length} shifts
              </span>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={generateSchedule}
            disabled={generating || loading || !teamId || !members.length || !templates.length}
            style={{
              padding: '12px 28px',
              background: generating
                ? '#3d3f6a'
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: generating ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              boxShadow: generating ? 'none' : '0 4px 20px rgba(99,102,241,0.4)',
            }}
          >
            {generating ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                Generating...
              </span>
            ) : '⚡ Generate Schedule'}
          </button>
        </div>

        {loading && (
          <div style={{ marginTop: 16, fontSize: 13, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ animation: 'pulse 1.5s ease infinite' }}>●</span> Loading team data...
          </div>
        )}
      </div>

      {/* CSV Upload Panel */}
      <div style={{
        background: '#1a1d2e', border: '1px solid #2d3148',
        borderRadius: 16, padding: 20, marginBottom: 24,
      }}>
        <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
          CSV Override (optional)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Shifts CSV */}
          <div>
            <input
              ref={shiftsFileRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) parseShiftsCsv(f); e.target.value = ''; }}
            />
            <button
              onClick={() => shiftsFileRef.current?.click()}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 10,
                background: shiftsSource === 'csv' ? '#14532d' : '#0f1117',
                border: `1px dashed ${shiftsSource === 'csv' ? '#166534' : '#3d4068'}`,
                color: shiftsSource === 'csv' ? '#86efac' : '#6b7280',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
              }}
            >
              📄 {shiftsSource === 'csv' ? `Shifts loaded from CSV (${templates.length} shifts) ✓` : 'Upload Shift Requirements CSV'}
            </button>
            <div style={{ fontSize: 11, color: '#4b5563', marginTop: 5 }}>
              Columns: Shift, Job_Type, Day, Start_Time, End_Time, Required
            </div>
          </div>

          {/* Availability CSV */}
          <div>
            <input
              ref={availFileRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) parseAvailabilityCsv(f); e.target.value = ''; }}
            />
            <button
              onClick={() => availFileRef.current?.click()}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 10,
                background: availSource === 'csv' ? '#14532d' : '#0f1117',
                border: `1px dashed ${availSource === 'csv' ? '#166534' : '#3d4068'}`,
                color: availSource === 'csv' ? '#86efac' : '#6b7280',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
              }}
            >
              👥 {availSource === 'csv' ? `Availability loaded from CSV (${members.length} employees) ✓` : 'Upload Availability CSV'}
            </button>
            <div style={{ fontSize: 11, color: '#4b5563', marginTop: 5 }}>
              Columns: Name, Job, Position, Leadership, Min Hours, Max Hours, {'{Day}'} Start, {'{Day}'} End
            </div>
          </div>

        </div>
      </div>

      {error && (
        <div style={{
          background: '#3f1515', border: '1px solid #7f1d1d',
          borderRadius: 12, padding: '14px 18px', marginBottom: 20,
          color: '#fca5a5', fontSize: 14,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Generating animation */}
      {generating && (
        <div style={{
          background: '#1a1d2e', border: '1px solid #2d3148',
          borderRadius: 16, padding: 32, marginBottom: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🧠</div>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Building schedule from availability and shift templates...
          </p>
          <p style={{ fontSize: 13, color: '#6b7280' }}>
            Balancing {members.length} employees across {templates.length} shifts for Mon–Sat
          </p>
          <div style={{ marginTop: 20, height: 4, background: '#2d3148', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: '40%',
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              borderRadius: 2,
              animation: 'loading 1.5s ease-in-out infinite',
            }} />
          </div>
        </div>
      )}

      {/* Results */}
      {aiResult && !generating && (
        <div>
          {/* Tab bar + Save button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['schedule', 'stats', 'raw'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    background: activeTab === tab ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#1a1d2e',
                    color: activeTab === tab ? '#fff' : '#6b7280',
                    border: activeTab === tab ? 'none' : '1px solid #2d3148',
                    cursor: 'pointer',
                  }}
                >
                  {tab === 'schedule' ? '📅 Horario' : tab === 'stats' ? '📊 Stats' : '🔍 Raw JSON'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {savedId && (
                <span style={{ fontSize: 13, color: '#86efac', background: '#14532d', padding: '6px 12px', borderRadius: 8 }}>
                  ✓ Saved #{savedId}
                </span>
              )}
              <button
                onClick={saveScheduleToDB}
                disabled={savingSchedule || !!savedId}
                style={{
                  padding: '9px 20px',
                  background: savedId ? '#1a1d2e' : '#14532d',
                  color: savedId ? '#4b5563' : '#86efac',
                  border: '1px solid',
                  borderColor: savedId ? '#2d3148' : '#166534',
                  borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: savedId ? 'default' : 'pointer',
                }}
              >
                {savingSchedule ? 'Saving...' : savedId ? 'Saved ✓' : '💾 Save Schedule'}
              </button>
            </div>
          </div>

          {/* Summary bar */}
          <div style={{
            background: '#1a1d2e', border: '1px solid #2d3148',
            borderRadius: 12, padding: '14px 20px', marginBottom: 20,
            display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <div style={{ fontSize: 13, color: '#a5b4fc', flex: 1 }}>
              💬 {aiResult.summary}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: '#6b7280' }}>Total shifts:</span>{' '}
                <b style={{ color: '#e8e8f0' }}>{aiResult.stats.totalShifts}</b>
              </span>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: '#22c55e' }}>✓</span>{' '}
                <b style={{ color: '#e8e8f0' }}>{aiResult.stats.fullyStaffed}</b>
              </span>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: '#ef4444' }}>⚠</span>{' '}
                <b style={{ color: '#e8e8f0' }}>{aiResult.stats.understaffed}</b>
              </span>
            </div>
          </div>

          {/* Warnings */}
          {aiResult.warnings.length > 0 && (
            <div style={{
              background: '#2d1f0e', border: '1px solid #78350f',
              borderRadius: 12, padding: '12px 18px', marginBottom: 16,
            }}>
              {aiResult.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 13, color: '#fcd34d', marginBottom: i < aiResult.warnings.length - 1 ? 4 : 0 }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div>
              {DAYS_OF_WEEK.map(dayName => {
                const dayEntries = aiResult.schedule.filter(s => s.day === dayName);
                if (!dayEntries.length) return null;
                const dateStr = dayEntries[0].date;

                return (
                  <div key={dayName} style={{
                    background: '#1a1d2e', border: '1px solid #2d3148',
                    borderRadius: 14, marginBottom: 16, overflow: 'hidden',
                  }}>
                    {/* Day header */}
                    <div style={{
                      padding: '14px 20px',
                      background: 'linear-gradient(90deg, #1e2235, #1a1d2e)',
                      borderBottom: '1px solid #2d3148',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#a5b4fc' }}>{dayName}</span>
                      <span style={{ fontSize: 13, color: '#4b5563' }}>{dateStr}</span>
                      <span style={{
                        marginLeft: 'auto', fontSize: 12,
                        background: '#0f1117', padding: '3px 10px', borderRadius: 20,
                        color: '#6b7280',
                      }}>
                        {dayEntries.length} shifts
                      </span>
                    </div>

                    {/* Shifts */}
                    <div style={{ padding: '12px 16px', display: 'grid', gap: 8 }}>
                      {dayEntries.map((entry, i) => {
                        const filled = entry.assigned.length;
                        const needed = entry.required;
                        const color = staffColor(filled, needed);

                        return (
                          <div key={i} style={{
                            background: '#0f1117',
                            border: `1px solid #2d3148`,
                            borderLeft: `3px solid ${color}`,
                            borderRadius: 10,
                            padding: '12px 16px',
                            display: 'grid',
                            gridTemplateColumns: '1fr auto',
                            gap: 12,
                            alignItems: 'center',
                          }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{
                                  fontSize: 12, fontWeight: 700, padding: '2px 8px',
                                  borderRadius: 6,
                                  background: entry.jobType === 'FOH' ? '#1e3a5f' :
                                    entry.jobType === 'BOH' ? '#1a2e1a' :
                                    entry.jobType === 'TRUCK' ? '#2d1f0e' : '#2d1442',
                                  color: entry.jobType === 'FOH' ? '#93c5fd' :
                                    entry.jobType === 'BOH' ? '#86efac' :
                                    entry.jobType === 'TRUCK' ? '#fcd34d' : '#d8b4fe',
                                }}>
                                  {entry.jobType}
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f0' }}>
                                  {entry.shift}
                                </span>
                                <span style={{ fontSize: 13, color: '#6b7280' }}>
                                  {entry.startTime} – {entry.endTime}
                                </span>
                                <span style={{ fontSize: 12, color: '#6b7280' }}>
                                  ({shiftHours(entry.startTime, entry.endTime).toFixed(1)}h)
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {entry.assigned.map((name, j) => (
                                  <span key={j} style={{
                                    fontSize: 12, padding: '3px 10px', borderRadius: 20,
                                    background: '#1a1d2e', border: '1px solid #2d3148',
                                    color: '#c4c9e8',
                                  }}>
                                    {name}
                                  </span>
                                ))}
                                {Array.from({ length: Math.max(0, needed - filled) }).map((_, j) => (
                                  <span key={`empty-${j}`} style={{
                                    fontSize: 12, padding: '3px 10px', borderRadius: 20,
                                    background: '#3f1515', border: '1px dashed #7f1d1d',
                                    color: '#fca5a5',
                                  }}>
                                    Unassigned
                                  </span>
                                ))}
                              </div>

                              {entry.notes && (
                                <div style={{ marginTop: 6, fontSize: 12, color: '#f59e0b' }}>
                                  ⚠ {entry.notes}
                                </div>
                              )}
                            </div>

                            {/* Staffing indicator */}
                            <div style={{ textAlign: 'center' }}>
                              <div style={{
                                fontSize: 18, fontWeight: 800, color,
                              }}>
                                {filled}/{needed}
                              </div>
                              <div style={{ fontSize: 11, color: '#4b5563' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Hours per employee */}
              <div style={{
                background: '#1a1d2e', border: '1px solid #2d3148',
                borderRadius: 14, padding: 20,
              }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700 }}>
                  ⏱ Hours assigned per employee
                </h3>
                {Object.entries(aiResult.stats.employeeHours)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, hours]) => {
                    const member = members.find(m => m.name === name);
                    const max = member?.maxHoursWeek ?? 40;
                    const pct = Math.min(100, (hours / max) * 100);
                    const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';

                    return (
                      <div key={name} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                          <span>{name}</span>
                          <span style={{ color: barColor, fontWeight: 700 }}>{hours}h / {max}h</span>
                        </div>
                        <div style={{ height: 6, background: '#2d3148', borderRadius: 3 }}>
                          <div style={{
                            height: '100%', width: `${pct}%`,
                            background: barColor, borderRadius: 3,
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Coverage summary */}
              <div style={{
                background: '#1a1d2e', border: '1px solid #2d3148',
                borderRadius: 14, padding: 20,
              }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 700 }}>
                  📊 Coverage by Day
                </h3>
                {DAYS_OF_WEEK.map(day => {
                  const entries = aiResult.schedule.filter(s => s.day === day);
                  const total = entries.reduce((acc, s) => acc + s.required, 0);
                  const filled = entries.reduce((acc, s) => acc + s.assigned.length, 0);
                  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
                  const color = pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';

                  return (
                    <div key={day} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                        <span>{day}</span>
                        <span style={{ color, fontWeight: 700 }}>{filled}/{total} slots ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: '#2d3148', borderRadius: 3 }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: color, borderRadius: 3,
                        }} />
                      </div>
                    </div>
                  );
                })}

                <div style={{ marginTop: 20, padding: '12px 16px', background: '#0f1117', borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: '#6b7280' }}>Complete shifts</span>
                    <span style={{ color: '#22c55e', fontWeight: 700 }}>{aiResult.stats.fullyStaffed}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#6b7280' }}>Incomplete shifts</span>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>{aiResult.stats.understaffed}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Raw JSON Tab */}
          {activeTab === 'raw' && (
            <div style={{
              background: '#0f1117', border: '1px solid #2d3148',
              borderRadius: 14, padding: 20, overflow: 'auto', maxHeight: 500,
            }}>
              <pre style={{ fontSize: 12, color: '#a5b4fc', margin: 0, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(aiResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!aiResult && !generating && !error && (
        <div style={{
          background: '#1a1d2e', border: '1px dashed #2d3148',
          borderRadius: 16, padding: 48, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🗓️</div>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Ready to generate your schedule!
          </p>
          <p style={{ fontSize: 14, color: '#6b7280' }}>
            Select a team with availability and shifts loaded, then press{' '}
            <strong style={{ color: '#a5b4fc' }}>⚡ Generate Schedule</strong>
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
        select option { background: #0f1117; }
      `}</style>
    </div>
  );
}