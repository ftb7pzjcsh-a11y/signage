// Fetches today's and tomorrow's Programme of Meetings at UN Headquarters and writes meetings/meetings.json.
// Runs in GitHub Actions. If the source refuses or fails, the previous file is kept and the screen goes on.
import { readFile, writeFile } from 'node:fs/promises';

const SOURCE = 'https://conferences.unite.un.org/announcements/api/display';
const LOCATION = 'New York';
const OUT = 'meetings/meetings.json';
const log = (...a) => console.log('[meetings]', ...a);

// Date in New York as YYYY-MM-DD, with an optional day offset
function nyDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const tidy = s => String(s || '').replace(/\s+/g, ' ').trim();

// Keep only what the screen needs. Links to other services (urlConfig) are dropped on purpose.
function clean(a) {
  const title = tidy(a.titleNoOrgPrefix || a.title);
  return {
    id: a.id,
    body: tidy(a.clientAbbreviatedName || a.clientName),
    bodyFull: tidy(a.clientName),
    title,
    room: tidy(a.roomName),
    roomCode: tidy(a.roomNumber),
    from: a.timeFrom,
    to: a.timeTo,
    showFrom: a.showTimeFrom !== false,
    showTo: a.showTimeTo !== false,
    intergov: !!a.isIntergovernmental,
    closed: !!a.isClosed,
    cancelled: !!a.isCancelled,
    following: !!a.isFollowing,
    informal: /informal/i.test(title)
  };
}

async function fetchDay(date) {
  const url = `${SOURCE}?location=${encodeURIComponent(LOCATION).replace(/%20/g, '+')}&roomName=&date=${date}T08:00:00`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json', 'User-Agent': 'UN-signage-meetings-board (GitHub Actions)' } });
    if (res.status === 403) throw new Error('403: the source refuses requests from outside its own display page. Ask DGACM for access.');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.announcements)) throw new Error('unexpected answer');
    return data.announcements.filter(a => a && a.isListDisplay !== false).map(clean)
      .filter(m => m.from && m.from.startsWith(date))
      .sort((a, b) => a.from.localeCompare(b.from) || a.room.localeCompare(b.room));
  } finally { clearTimeout(timer); }
}

async function main() {
  const dates = [nyDate(0), nyDate(1)];
  const days = [];
  for (const date of dates) {
    try {
      days.push({ date, meetings: await fetchDay(date) });
      log(`${date}: ${days[days.length - 1].meetings.length} meetings`);
    } catch (err) {
      log(`${date}: ${err.message}`);
      if (date === dates[0]) { log('Today could not be read: keeping the previous file.'); return; }
    }
  }
  let previous = {};
  try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
  const same = JSON.stringify(previous.days) === JSON.stringify(days);
  const out = { fetched_at: new Date().toISOString(), location: LOCATION, days };
  // Rewrite when the programme changed, or at least once an hour so the screen can tell the feed is alive
  if (same && previous.fetched_at && Date.now() - Date.parse(previous.fetched_at) < 3600000) { log('No change.'); return; }
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  log('Saved.');
}

main().catch(err => log(`Unexpected error: ${err.message}`));
