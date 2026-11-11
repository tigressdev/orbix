// Google Flights result-page extractor (run in the page's JS console, or via the browser tool's javascript action).
//
//   const lines = extract('BEIJING', '2027-02-14');   // block label (destination city) and departure date
//
// Each flight result carries an accessible label such as:
//   "From 196 US dollars. This price does not include overhead bin access. 1 stop flight with Lufthansa. Leaves ... at 7:50 AM on ... and
//    arrives at ... at 5:00 AM on .... Total duration 14 hr 10 min. Layover (1 of 1) is a 3 hr 25 min layover at Munich ... in Munich."
// The function turns every label into one line of the import format (see data/browser_quotes_*.txt):
//   ORIG>DEST dep arr +days price stops duration airlines ~ AIRPORT:layover,... ~ bag:carry=yes|no
// Notes: use curr=USD in the URL so prices are quoted natively in dollars. "carry=yes" only means the source flags no overhead-bin
// restriction; checked-bag rules are not in the labels. Rail legs (AccesRail) and premium cabins are skipped.
function extract(blockDest, dateISO) {
  const AP = { 'Madrid-Barajas': 'MAD', 'Ferenc Liszt': 'BUD', 'Beijing Capital': 'PEK', 'Daxing': 'PKX', 'Sheremetyevo': 'SVO', 'Vnukovo': 'VKO',
    'Domodedovo': 'DME', 'Pudong': 'PVG', 'Hongqiao': 'SHA', "Bao'an": 'SZX', 'Changi': 'SIN', 'Tianhe': 'WUH', 'Tianfu': 'TFU', 'Shuangliu': 'CTU',
    'Xianyang': 'XIY', 'Dali': 'DLU', 'Istanbul Airport': 'IST', 'Sabiha': 'SAW', 'Havel': 'PRG', 'Zurich': 'ZRH', 'Vienna': 'VIE', 'Zagreb': 'ZAG',
    'Krak': 'KRK', 'Nikola Tesla': 'BEG', 'Geneva': 'GVA', 'Chopin': 'WAW', 'Heathrow': 'LHR', 'Frankfurt': 'FRA', 'Munich': 'MUC', 'Brussels': 'BRU',
    'Chongqing': 'CKG', 'Abu Dhabi': 'AUH', 'Dubai': 'DXB', 'Hamad': 'DOH', 'Casablanca': 'CMN', 'Hong Kong': 'HKG', 'Urumqi': 'URC', 'mqi': 'URC',
    'Heydar': 'GYD', 'Suvarnabhumi': 'BKK', 'Incheon': 'ICN', 'Taoyuan': 'TPE', 'Amsterdam': 'AMS', 'Charles de Gaulle': 'CDG', 'Kuala Lumpur': 'KUL', 'Ben Gurion': 'TLV', 'Belgrade': 'BEG', 'Esenbo': 'ESB', 'Henri Coand': 'OTP', 'Adnan Menderes': 'ADB', 'Athens International': 'ATH' };
  const MON = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
  const code = (name) => { for (const k in AP) if (name.includes(k)) return AP[k]; return '?' + name.replace(/[^A-Za-z]+/g, '_').slice(0, 12); };   // '?x' = add it to AP
  const to24 = (t) => { const m = t.match(/(\d+):(\d+) ([AP]M)/); return String((+m[1]) % 12 + (m[3] === 'PM' ? 12 : 0)).padStart(2, '0') + ':' + m[2]; };
  const dur = (min) => { const h = Math.floor(min / 60), m = min % 60; return h && m ? h + 'h' + String(m).padStart(2, '0') : h ? h + 'h' : m + 'm'; };
  const mins = (h, m) => (+h || 0) * 60 + (+m || 0);
  const year = +dateISO.slice(0, 4), startMonth = new Date(dateISO).getUTCMonth();
  const labels = [...new Set([...document.querySelectorAll('[aria-label^="From "]')].map((a) => a.getAttribute('aria-label')))];
  const rows = []; let firstOrigin = null, skipped = 0;
  for (const l of labels) {
    if (/Business|First class|Premium|AccesRail/i.test(l)) { skipped++; continue; }
    const price = l.match(/^From ([\d,]+) (?:Brazilian reals|US dollars)/);
    const t = l.match(/Leaves (.+?) at (\d+:\d+ [AP]M) on \w+, (\w+) (\d+) and arrives at (.+?) at (\d+:\d+ [AP]M) on \w+, (\w+) (\d+)\./);
    if (!price || !t) { skipped++; continue; }
    const o = code(t[1]), d = code(t[5]); firstOrigin = firstOrigin || o;
    const dm = MON[t[3]], am = MON[t[7]], roll = dm < startMonth ? 1 : 0;
    const days = Math.round((Date.UTC(year + (am < dm ? 1 : 0) + roll, am, +t[8]) - Date.UTC(year + roll, dm, +t[4])) / 864e5);
    const stops = /Nonstop/.test(l) ? 0 : +(l.match(/(\d+) stops? flight/) || [0, 0])[1];
    const du = l.match(/Total duration (?:(\d+) hr)?\s*(?:(\d+) min)?/);
    const airlines = ((l.match(/flight with ([^.]+)\./) || [0, ''])[1]).replace(/,?\s+and\s+/g, ', ');
    const via = [...l.matchAll(/is an? (?:(\d+) hr)?\s*(?:(\d+) min)?\s*(?:overnight )?layover at (.+?) in /g)].map((m) => code(m[3]) + ':' + dur(mins(m[1], m[2])));
    const carry = /does not include overhead bin access/.test(l) ? 'no' : 'yes';
    rows.push([`${o}>${d}`, to24(t[2]), to24(t[6]), '+' + days, price[1].replace(/,/g, ''), Math.max(stops, via.length), dur(mins(du[1], du[2])),
      airlines + (via.length ? ' ~ ' + via.join(',') : '') + ' ~ bag:carry=' + carry].join(' '));
  }
  return `@${firstOrigin || '???'} ${blockDest} ${dateISO}\n${rows.join('\n')}\n# ${rows.length} flights (${skipped} skipped)`;
}
