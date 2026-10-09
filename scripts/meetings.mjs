// Reads the official meetings of the day from the Journal of the United Nations
// (journal.un.org, "Official meetings", New York) and writes meetings/meetings.json for the screen.
// Source agreed with DGACM: only the meetings published in the Journal are displayed.
// Runs in GitHub Actions. If the Journal can't be read, the previous file is kept.
import { readFile, writeFile } from 'node:fs/promises';

const API = 'https://journal-api.un.org/api/officialsnew/';
const HEADERS = { Location: 'New York', Language: 'en', Accept: 'application/json', 'User-Agent': 'UN-DGC-signage-meetings-board (GitHub Actions)' };
const OUT = 'meetings/meetings.json';
const log = (...a) => console.log('[meetings]', ...a);

function nyDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// The Journal's texts are small HTML fragments ("<p><span>10236th meeting</span></p>")
const plain = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// Long organ names shortened for the screen; anything else is shown as published
const SHORT = {
  'Advisory Committee on Administrative and Budgetary Questions': 'ACABQ',
  'Economic and Social Council': 'ECOSOC'
};
function shortBody(name) {
  const n = plain(name);
  if (SHORT[n]) return SHORT[n];
  const paren = n.match(/\(([^()]*Committee)\)$/);   // "Special Political and Decolonization Committee (Fourth Committee)"
  return paren ? paren[1] : n;
}

// Room code from the Journal's room map file: CR4.jpg -> "4", SCC.jpg -> "SCC", TRI.jpg -> "TRI"
function roomCode(m) {
  const file = String(m.roomLink || '').split('/').pop().replace(/\.\w+$/, '').toUpperCase();
  if (!file || file === 'NOMAP') return '';
  const cr = file.match(/^CR(\d+)$/);
  return cr ? cr[1] : file;
}

export function fromJournal(journal, date) {
  const out = [];
  for (const group of (journal && journal.groups) || []) {
    for (const session of group.sessions || []) {
      for (const m of session.meetings || []) {
        if (!m || !m.id || !m.startDate) continue;
        const bodyFull = plain(m.relatedOrganizationFullName || (m.organization && m.organization.en) || session.name);
        const title = plain(m.meetingNumber && (m.meetingNumber.en || Object.values(m.meetingNumber)[0]));
        const room = plain((m.rooms && m.rooms[0] && m.rooms[0].value) || (m.room && m.room.en)) || (/video|virtual/i.test(title) ? 'Virtual meeting' : '');
        out.push({
          id: m.id,
          body: shortBody(bodyFull),
          bodyFull,
          title,
          session: plain(m.sessionNameText || m.sessionName),
          room,
          roomCode: roomCode(m),
          from: String(m.startDate).slice(0, 19),
          to: String(m.endDate || m.startDate).slice(0, 19),
          showFrom: true,
          showTo: !!m.timeTo,               // the Journal leaves the end time blank when it isn't fixed
          intergov: true,                   // every meeting in "Official meetings" is intergovernmental
          closed: !!m.isClosed,
          cancelled: !!m.isCancelled,
          following: false,
          informal: /informal|consultations/i.test(title),
          link: m.paperSmartLink ? String(m.paperSmartLink).replace(/\/statements$/, '') : ''
        });
      }
    }
  }
  return out.filter(m => m.from.startsWith(date))
    .sort((a, b) => a.from.localeCompare(b.from) || a.room.localeCompare(b.room));
}

async function fetchDay(date) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(API + date, { headers: HEADERS, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
    return fromJournal(await res.json(), date);
  } finally { clearTimeout(timer); }
}

async function main() {
  const today = nyDate(0);
  const days = [];
  try {
    const meetings = await fetchDay(today);
    days.push({ date: today, meetings });
    log(`${today}: ${meetings.length} official meetings`);
  } catch (err) {
    log(`${today}: ${err.message}`);
    log('Today could not be read: keeping the previous file.');
    return;
  }
  // Next day with meetings (skips weekends and holidays), shown at the end of the day
  for (let i = 1; i <= 4; i++) {
    const date = nyDate(i);
    try {
      const meetings = await fetchDay(date);
      log(`${date}: ${meetings.length} official meetings`);
      if (meetings.length) { days.push({ date, meetings }); break; }
    } catch (err) { log(`${date}: ${err.message}`); break; }
  }
  let previous = {};
  try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
  const same = JSON.stringify(previous.days) === JSON.stringify(days) && !previous.sample;
  if (same && previous.fetched_at && Date.now() - Date.parse(previous.fetched_at) < 3600000) { log('No change.'); return; }
  const out = { fetched_at: new Date().toISOString(), source: 'Journal of the United Nations — Official meetings (journal.un.org)', location: 'New York', days };
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  log('Saved.');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(err => log(`Unexpected error: ${err.message}`));
