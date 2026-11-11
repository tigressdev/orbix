import type { CulturalEvent, Source } from '../types';

// Calendar intelligence for the travel window. Dates come from the traveller's research brief (2026-11-11) and are recorded
// with the calendar they belong to. Local ceremonies, temple fairs and lantern shows are NEVER listed as confirmed here.

const BRIEF: Source = { label: 'Traveller research brief, Sacred Atlas specification (2026-11-11)', kind: 'traveler-brief' };
const STATE_COUNCIL: Source = { label: 'General Office of the State Council: annual public-holiday notice (confirm the 2027 notice)', url: 'https://www.gov.cn/', kind: 'official' };
const VERIFIED = '2026-11-11';

export const EVENTS: CulturalEvent[] = [
  {
    id: 'cny-2027', name: 'The Fire Goat Year', localName: '春节 · 丁未年', romanization: 'Chūnjié · Dīngwèi nián', englishName: 'Chinese Lunar New Year (Year of the Fire Goat, also rendered Sheep or Ram)',
    dateStart: '2027-02-06', dateEnd: '2027-02-06', calendarSystem: 'Chinese lunisolar calendar (农历), 1st day of the 1st month',
    traditions: ['Chinese popular religion', 'Family and ancestral ritual', 'Chinese Buddhism', 'Daoism'], locations: ['BEIJING', 'SHANGHAI', 'SHENZHEN', 'CHENGDU', 'XIAN'],
    significance: 'The most important family festival of the Chinese year: reunion, ancestral offerings, temple visits and the turning of the sexagenary cycle to 丁未.',
    officialHolidayStatus: 'public-holiday-period', verifiedEventStatus: 'calendar-date',
    expectedTravelImpact: { level: 'very-high', notes: ['The Spring Festival travel rush (春运) surrounds the holiday.', 'Some shops, restaurants and attractions change hours.'] },
    sources: [BRIEF], lastVerified: VERIFIED,
  },
  {
    id: 'losar-2027', name: 'Losar', localName: 'ལོ་གསར', romanization: 'Lo gsar', englishName: 'Tibetan New Year (Female Fire Sheep year)',
    dateStart: '2027-02-07', dateEnd: '2027-02-07', calendarSystem: 'Tibetan lunisolar calendar (referenced Phugpa reckoning)',
    traditions: ['tibetan-buddhism'], locations: ['lhasa', 'kathmandu'],
    significance: 'New Year in the Tibetan calendar, with household and monastic rites. Its calendar is computed differently from the Chinese one: the two new years can fall on different days.',
    officialHolidayStatus: 'regional', verifiedEventStatus: 'tentative-date',
    expectedTravelImpact: { level: 'unknown', notes: ['Foreign access to Tibet around this period is uncertain.'] },
    sources: [BRIEF], lastVerified: VERIFIED, distinctFrom: ['cny-2027'],
  },
  {
    id: 'spring-holiday-2027', name: 'Spring Festival', localName: '春节假期', romanization: 'Chūnjié jiàqī', englishName: 'Official Spring Festival public-holiday period',
    dateStart: '2027-02-05', dateEnd: '2027-02-13', calendarSystem: 'Gregorian (national holiday schedule)',
    traditions: ['Civil calendar'], locations: ['BEIJING', 'SHANGHAI', 'SHENZHEN', 'CHENGDU', 'XIAN'],
    significance: 'The statutory holiday. It is shorter than the festive season, which continues to the Lantern Festival.',
    officialHolidayStatus: 'public-holiday-period', verifiedEventStatus: 'calendar-date',
    expectedTravelImpact: { level: 'very-high', notes: ['Highest domestic rail and air demand at both ends of the holiday.', 'Accommodation availability uncertain: reserve early.', 'Attraction schedules may change; some museums close on set days.'] },
    sources: [BRIEF, STATE_COUNCIL], lastVerified: VERIFIED,
  },
  {
    id: 'lantern-2027', name: 'Lantern Festival', localName: '元宵节', romanization: 'Yuánxiāo Jié', englishName: 'Lantern Festival (15th day of the first lunar month)',
    dateStart: '2027-02-20', dateEnd: '2027-02-20', calendarSystem: 'Chinese lunisolar calendar, 15th day of the 1st month',
    traditions: ['Chinese popular religion', 'Chinese Buddhism', 'Daoism'], locations: ['BEIJING', 'SHANGHAI', 'CHENGDU', 'XIAN'],
    significance: 'Closes the New Year season with lanterns, riddles and tangyuan. Not a national public holiday.',
    officialHolidayStatus: 'not-a-public-holiday', verifiedEventStatus: 'calendar-date',
    expectedTravelImpact: { level: 'moderate', notes: ['Crowds at lantern displays; local programmes and tickets must be verified separately.'] },
    sources: [BRIEF], lastVerified: VERIFIED, distinctFrom: ['chotrul-2027'],
  },
  {
    id: 'chotrul-2027', name: 'Chötrul Düchen', localName: 'ཆོ་འཕྲུལ་དུས་ཆེན', romanization: 'Cho ’phrul dus chen', englishName: 'Day of Miracles (Tibetan Buddhist observance)',
    dateStart: '2027-02-20', dateEnd: '2027-02-20', calendarSystem: 'Tibetan lunisolar calendar, 15th day of the 1st month',
    traditions: ['tibetan-buddhism'], locations: ['lhasa', 'kathmandu'],
    significance: 'Commemorates the miracles attributed to the Buddha at Śrāvastī; culmination of the Mönlam prayer period. Same Gregorian date as the Lantern Festival in 2027, but a distinct observance.',
    officialHolidayStatus: 'not-a-public-holiday', verifiedEventStatus: 'tentative-date',
    expectedTravelImpact: { level: 'unknown', notes: ['Local schedules unverified.'] },
    sources: [BRIEF], lastVerified: VERIFIED, distinctFrom: ['lantern-2027'],
  },
];

/** Gregorian window the timeline emphasises. */
export const FESTIVAL_WINDOW = { start: '2027-02-06', end: '2027-02-20' };
