// What we know about checked bags. The fare data usually does NOT say (Google's labels only flag the carry-on). Never invent it:
//  1. an observed value from the data always wins;
//  2. otherwise a published airline policy is shown, labelled "typical": it depends on the fare brand, so confirm before you buy;
//  3. otherwise it stays "unknown".
export type CheckedStatus = 'included' | 'typical-included' | 'typical-extra' | 'varies' | 'unknown';

// Long-haul economy. "included" airlines include a 23 kg checked bag in standard economy fares; "extra" are low-cost brands where it is a paid add-on;
// "varies" legacy carriers sell Light/Basic fares without it on many routes.
const INCLUDED = ['royal air maroc', 'air china', 'china eastern', 'china southern', 'hainan', 'sichuan', 'turkish', 'qatar', 'emirates', 'etihad', 'singapore airlines', 'thai', 'aeroflot', 'air serbia'];
const EXTRA = ['ryanair', 'wizz', 'pegasus', 'vueling', 'airasia', 'ajet', 'spring', 'flydubai', 'vietjet', 'transavia', 'easyjet', 'norwegian'];
const VARIES = ['lufthansa', 'klm', 'air france', 'iberia', 'british airways', 'swiss', 'austrian', 'brussels', 'air europa', 'tap', 'aegean', 'ita airways', 'juneyao', 'xiamen', 'shenzhen', 'shanghai airlines'];

const match = (name: string, list: string[]) => list.some((x) => name.toLowerCase().includes(x));

export function checkedBag(airlines: string, observed: string): { status: CheckedStatus; label: string; hint: string } {
  if (observed === 'yes' || observed === 'included') return { status: 'included', label: 'Checked bag included', hint: 'Listed in the fare data.' };
  if (observed === 'no' || observed === 'not_included') return { status: 'unknown', label: 'No checked bag in this fare', hint: 'Listed in the fare data.' };
  const names = airlines.split(',').map((x) => x.trim()).filter(Boolean);
  if (!names.length) return { status: 'unknown', label: 'Checked bag: unknown', hint: 'Not in the fare data and the airline is not recorded.' };
  if (names.every((n) => match(n, INCLUDED))) return { status: 'typical-included', label: 'Checked bag usually included', hint: `Typical ${names.join(' + ')} economy policy, not read from this fare. Confirm the fare before you buy.` };
  if (names.some((n) => match(n, EXTRA))) return { status: 'typical-extra', label: 'Checked bag usually extra', hint: 'Low-cost brand: a checked bag is normally a paid add-on. The budget carries an estimate.' };
  if (names.some((n) => match(n, VARIES))) return { status: 'varies', label: 'Checked bag depends on fare', hint: 'This airline sells fares with and without a checked bag. Check the fare brand.' };
  return { status: 'unknown', label: 'Checked bag: unknown', hint: 'Not in the fare data. The budget carries an estimate.' };
}
