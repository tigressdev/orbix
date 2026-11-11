import type { JourneyTemplate } from '../types';

export const CATALOG_VERSION = '2026-11-11.1';

// Starting configurations, never promises of available travel. Every template ends in Madrid before the confirmed return flight.
export const TEMPLATES: JourneyTemplate[] = [
  {
    id: 'abrahamic-buddhist', title: 'The Abrahamic–Buddhist Corridor',
    focus: 'Abrahamic religious history, the transmission of Buddhism, Chinese religious traditions and Tibetan Buddhism.',
    stops: [{ id: 'MADRID', kind: 'city' }, { id: 'jerusalem', kind: 'site', conditional: true }, { id: 'BEIJING', kind: 'city' }, { id: 'xian', kind: 'site' }, { id: 'chengdu', kind: 'site' }, { id: 'lhasa', kind: 'site', conditional: true }, { id: 'SHANGHAI', kind: 'city' }, { id: 'MOSCOW', kind: 'city' }, { id: 'MADRID', kind: 'city' }],
    note: 'Not feasible until Jerusalem’s security advice and Tibet permits are both resolved.',
  },
  {
    id: 'himalayan', title: 'The Himalayan Path',
    focus: 'Himalayan traditions, Tibetan Buddhism, mountain landscapes and regional cultural exchange.',
    stops: [{ id: 'MADRID', kind: 'city' }, { id: 'kathmandu', kind: 'site', conditional: true }, { id: 'lhasa', kind: 'site', conditional: true }, { id: 'chengdu', kind: 'site' }, { id: 'BEIJING', kind: 'city' }, { id: 'MOSCOW', kind: 'city' }, { id: 'MADRID', kind: 'city' }],
    note: 'Permit, altitude and seasonal-closure warnings apply. Beijing would no longer be the entry to China.',
  },
  {
    id: 'sacred-mountains', title: 'The Chinese Sacred Mountains',
    focus: 'Buddhist and Daoist geography inside China. The principal fallback when border crossings or Tibet permits are unsuitable.',
    stops: [{ id: 'MADRID', kind: 'city' }, { id: 'BEIJING', kind: 'city' }, { id: 'wutai', kind: 'site' }, { id: 'xian', kind: 'site' }, { id: 'chengdu', kind: 'site' }, { id: 'qingcheng', kind: 'site' }, { id: 'emei', kind: 'site' }, { id: 'SHANGHAI', kind: 'city' }, { id: 'MOSCOW', kind: 'city' }, { id: 'MADRID', kind: 'city' }],
    note: 'Qingcheng and Emei are chapters of the Chengdu stay, not flight nodes.',
  },
];
