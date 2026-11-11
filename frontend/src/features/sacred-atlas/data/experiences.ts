// What a visitor could actually do, see and ask at each place. Editorial suggestions only: nothing here is a booked or confirmed
// activity. `verified: false` renders as "Possible cultural experience — local schedule not confirmed".
export type ExpKind = 'walk' | 'visit' | 'day-trip' | 'overnight' | 'practice' | 'festival' | 'museum';
export interface Experience { title: string; kind: ExpKind; text: string; hours?: string; verified: boolean }
export interface Living { title: string; text: string }
export interface SiteStory {
  summary: string;                               // accessible introduction, about 100 words
  experiences: Experience[];
  living: Living[];
  /** Short sourced orientation for each "question to explore" (same order as site.questions). */
  answers: { text: string; related: string[] }[];
}

export const STORIES: Record<string, SiteStory> = {
  jerusalem: {
    summary: 'Within one square kilometre of walled city stand the Western Wall, the Church of the Holy Sepulchre and the Dome of the Rock. Each belongs to a different story about how the divine meets human history: a covenant and a lost Temple, a death and resurrection, a night journey and a first direction of prayer. Walking between them takes minutes; understanding why they do not merge takes much longer. Jerusalem is the clearest place on earth to see sacred meaning laid down in layers, and to see that shared reverence does not mean shared belief.',
    experiences: [
      { title: 'Walk the four quarters of the Old City', kind: 'walk', text: 'Jewish, Christian, Muslim and Armenian quarters, gate to gate.', hours: 'Half a day', verified: false },
      { title: 'The Holy Sepulchre under the Status Quo', kind: 'visit', text: 'See how six communities share one church by fixed custom.', hours: '2 h', verified: false },
      { title: 'Western Wall plaza', kind: 'visit', text: 'Open prayer space at the surviving Temple Mount retaining wall.', hours: '1 h', verified: false },
      { title: 'Israel Museum and the Shrine of the Book', kind: 'museum', text: 'Dead Sea Scrolls and a model of Second Temple Jerusalem.', hours: '3 h', verified: false },
    ],
    living: [
      { title: 'Friday to Sunday', text: 'Friday prayers at al-Aqsa, the Jewish Sabbath from Friday sunset, and Sunday liturgies follow one another in the same streets.' },
      { title: 'Shared custody', text: 'The Status Quo arrangements fix which community prays where and when inside the Holy Sepulchre.' },
    ],
    answers: [
      { text: 'Through successive layers rather than a single event: the Israelite Temple, the Christian memory of the passion on the same hills, and the early Islamic sanctification of the Temple platform. Each tradition read the earlier layers through its own scripture.', related: [] },
      { text: 'Rabbinic Judaism reshaped worship around prayer, study and memory of the Temple; the absence itself became a religious fact. Compare how Lhasa or Emei are living institutions that pilgrims enter.', related: ['lhasa', 'emei'] },
      { text: 'By detailed, inherited rules about space and time, enforced by custom and by civil authorities; small changes can become major disputes.', related: [] },
    ],
  },
  emei: {
    summary: 'Mount Emei rises more than three thousand metres above the Sichuan basin, and for over a thousand years pilgrims have climbed it temple by temple toward the Golden Summit. It is the mountain of Samantabhadra, the bodhisattva of practice and vows, usually shown riding a white elephant. The climb itself is the teaching: forest paths, monasteries where monks still chant at dawn, and, on a clear morning, a sea of cloud below the summit. A short ride away, the seventy-one-metre Leshan Buddha sits carved into a river cliff.',
    experiences: [
      { title: 'Baoguo Temple and the lower mountain', kind: 'walk', text: 'The gateway monastery and forest paths at the foot of the mountain.', hours: 'Half a day', verified: false },
      { title: 'Wannian Temple', kind: 'visit', text: 'The Song-dynasty bronze of Samantabhadra on a white elephant.', hours: '2–3 h', verified: false },
      { title: 'Golden Summit at sunrise', kind: 'overnight', text: 'Stay high on the mountain for the cloud sea; winter ice and cable-car operation decide access.', hours: 'Overnight', verified: false },
      { title: 'Leshan Giant Buddha', kind: 'day-trip', text: 'The cliff-carved Maitreya at the meeting of three rivers.', hours: 'Half a day', verified: false },
      { title: 'Monastery stay or guided visit', kind: 'practice', text: 'Some temples receive guests or offer guided visits and meditation sessions.', verified: false },
    ],
    living: [
      { title: 'Pilgrimage on foot', text: 'Many Chinese pilgrims still walk sections of the mountain, bowing at each temple.' },
      { title: 'Daily liturgy', text: 'Morning and evening chanting in working monasteries; visitors may usually observe quietly.' },
    ],
    answers: [
      { text: 'By translation in the broad sense: Buddhist ideas were expressed in Chinese vocabulary, bodhisattvas were given homes on mountains already revered in Daoist geography, and monasteries took on roles familiar from Chinese family and state ritual.', related: ['xian', 'wutai', 'qingcheng'] },
      { text: 'Institutions are how a teaching about impermanence is transmitted across generations: monasteries train people, hold texts and organise practice. Permanence of the vehicle is not permanence of the self.', related: ['lhasa'] },
      { text: 'It was begun in 713 by a monk hoping to calm dangerous river currents, funded over ninety years by local donors and officials: a devotional image that was also public works.', related: [] },
    ],
  },
  lhasa: {
    summary: 'At 3,650 metres, Lhasa is the heart of Tibetan Buddhist pilgrimage. Pilgrims circle the Jokhang temple clockwise along the Barkhor, many of them measuring the route with full-body prostrations. Above the city stands the Potala, the winter palace of the Dalai Lamas, and at its edges the great Gelug monastic universities of Sera and Drepung, where monks still test each other in formal debate. For a foreign visitor, Lhasa is also a place of strict conditions: permits, an authorised guide, and time to adjust to the altitude.',
    experiences: [
      { title: 'Barkhor circuit', kind: 'walk', text: 'Walk the pilgrim route around the Jokhang, clockwise.', hours: '1–2 h', verified: false },
      { title: 'Jokhang Temple', kind: 'visit', text: 'The most revered temple in Tibet, founded in the 7th century.', hours: '2 h', verified: false },
      { title: 'Potala Palace', kind: 'visit', text: 'Timed tickets with daily limits; many stairs at altitude.', hours: '3 h', verified: false },
      { title: 'Monastic debate at Sera', kind: 'practice', text: 'Afternoon debate in the courtyard on many weekdays.', hours: '1–2 h', verified: false },
    ],
    living: [
      { title: 'Kora', text: 'Circumambulation of temples, palaces and whole mountains as a daily practice.' },
      { title: 'Butter lamps and prostration', text: 'Offerings of light and full-length prostrations before the Jokhang.' },
      { title: 'Monastic education', text: 'Years of memorisation and debate leading to the geshe degree.' },
    ],
    answers: [
      { text: 'They organise space and time: the city is arranged around circuits, the year around festivals such as the Mönlam prayer period, and a life around vows, offerings and merit.', related: ['kathmandu'] },
      { text: 'Debate tests whether a student can defend a philosophical position under pressure; in the Gelug school reasoning is treated as part of the path, not only preparation for it.', related: [] },
      { text: 'Through repetition: thousands of people walking the same circuits daily for centuries make the route itself the sacred object. Compare the single focal points of Jerusalem.', related: ['jerusalem', 'wutai'] },
    ],
  },
  wutai: {
    summary: 'Five flat-topped peaks in northern Shanxi form the earthly home of Mañjuśrī, the bodhisattva of wisdom. Monks from across Asia were already travelling here in the Tang dynasty, hoping for a vision of him. Two of China’s oldest surviving timber halls, at Nanchan and Foguang temples, stand in the surrounding hills, and the valley town of Taihuai is crowded with monasteries, including Tibetan and Mongolian foundations. In February the mountain is deep in winter: beautiful, very cold, and not always reachable.',
    experiences: [
      { title: 'Taihuai monasteries', kind: 'walk', text: 'Xiantong, Tayuan with its white stupa, and Pusading above the town.', hours: '1 day', verified: false },
      { title: 'Foguang Temple East Hall', kind: 'day-trip', text: 'A timber hall of 857 CE with Tang sculpture.', hours: 'Half a day', verified: false },
      { title: 'Winter stay in a monastery town', kind: 'overnight', text: 'Check heating, road status and which temples are open.', verified: false },
    ],
    living: [
      { title: 'Two Buddhisms side by side', text: 'Chinese monasteries and Tibetan-tradition monasteries share the same valley.' },
      { title: 'Pilgrimage of the five terraces', text: 'A circuit of the five peaks, mostly made in the warmer months.' },
    ],
    answers: [
      { text: 'It localised Indian scripture in Chinese landscape: a text named a cool mountain in the north-east, and Chinese Buddhists identified it with Wutai, giving China a sacred centre of its own.', related: ['emei'] },
      { text: 'Mañjuśrī is central to Tibetan Buddhism too, and Qing emperors, who patronised Tibetan Buddhism, supported monasteries here as a meeting ground of their Chinese, Mongol and Tibetan subjects.', related: ['lhasa'] },
    ],
  },
  qingcheng: {
    summary: 'An hour from Chengdu, a green, wet mountain with temples half hidden in the forest. Tradition places the first Celestial Master, Zhang Daoling, here in the second century, at the beginning of Daoism as an organised religion. The paths, pavilions and the Cave of the Celestial Master follow the terrain instead of reshaping it. Next door, the Dujiangyan irrigation works have divided a river without a dam for more than two thousand years: an engineering answer to the same question the Daoists asked, how to act without forcing.',
    experiences: [
      { title: 'Front mountain temple path', kind: 'walk', text: 'Jianfu Palace, the Cave of the Celestial Master, Shangqing Palace near the top.', hours: '4–5 h', verified: false },
      { title: 'Dujiangyan irrigation system', kind: 'day-trip', text: 'See the fish-mouth levee that splits the Min River.', hours: 'Half a day', verified: false },
      { title: 'Tea and Daoist music', kind: 'practice', text: 'Some temples host tea, music or qigong sessions.', verified: false },
    ],
    living: [
      { title: 'Resident Daoist clergy', text: 'Quanzhen-tradition priests live and hold rites in the mountain temples.' },
      { title: 'Self-cultivation', text: 'Breath, movement and dietary practices aimed at harmony and long life.' },
    ],
    answers: [
      { text: 'As belonging, not dominion: humans are one expression of the Dao among many, and wisdom lies in following the grain of things. Mountains are the natural place to learn it.', related: ['emei'] },
      { text: 'Many read Dujiangyan as wu wei in practice: it guides the river by its own tendencies, with no dam. Others see any large intervention as a tension with the ideal. Both readings are defensible.', related: [] },
    ],
  },
  xian: {
    summary: 'As Chang’an, this was the largest city in the world and the eastern end of the Silk Road. Monks, merchants and envoys brought Buddhism, Christianity of the Church of the East, Zoroastrianism and Islam through its gates. Here Kumārajīva and later Xuanzang turned Indian scriptures into Chinese, in the process reshaping what the texts meant. The Wild Goose Pagodas, a stele of 781 recording Christians in Tang China, and a mosque built like a Chinese courtyard temple are the visible remains of that exchange.',
    experiences: [
      { title: 'Giant Wild Goose Pagoda and Da Ci’en Temple', kind: 'visit', text: 'Built for the scriptures Xuanzang carried from India.', hours: '2 h', verified: false },
      { title: 'Forest of Steles', kind: 'museum', text: 'Find the 781 stele of the “Luminous Religion”.', hours: '2 h', verified: false },
      { title: 'Great Mosque and the Muslim quarter', kind: 'walk', text: 'A mosque in Chinese courtyard form; prayer hall access may be limited.', hours: '2 h', verified: false },
      { title: 'City wall at lantern season', kind: 'festival', text: 'Lantern displays have been held on the wall around the New Year in past years.', verified: false },
    ],
    living: [
      { title: 'Hui Muslim neighbourhood', text: 'A community with many centuries of continuity around the Great Mosque.' },
      { title: 'Working Buddhist temples', text: 'Da Ci’en and Daxingshan remain active monasteries.' },
    ],
    answers: [
      { text: 'It changes. Early translators borrowed Daoist terms for Buddhist ideas, which coloured how Chinese readers understood them; later translators coined new vocabulary to correct this.', related: ['emei', 'qingcheng'] },
      { text: 'State patronage, the ability to speak in local intellectual terms, and durable institutions mattered. Buddhism gained all three; the Church of the East depended on foreign communities and court favour and faded after the 9th century.', related: [] },
    ],
  },
  chengdu: {
    summary: 'Chengdu is the base camp for Sichuan’s sacred landscapes. In the city, Wenshu Monastery is a working Chan temple with a tea garden where locals spend the afternoon, and Qingyang Palace is one of the best-known Daoist temples in south-west China. From here Mount Qingcheng is a day trip, Mount Emei and the Leshan Buddha a two- or three-day chapter, and Lhasa a permit-dependent onward journey. It turns three separate destinations into one stay.',
    experiences: [
      { title: 'Wenshu Monastery and tea garden', kind: 'visit', text: 'Halls, vegetarian restaurant and tea under the trees.', hours: '2–3 h', verified: false },
      { title: 'Qingyang Palace', kind: 'visit', text: 'Daoist temple traditionally linked with Laozi.', hours: '1–2 h', verified: false },
      { title: 'Spring Festival temple fair', kind: 'festival', text: 'Temple fairs and lantern displays have been held in the city around the New Year in past years.', verified: false },
    ],
    living: [{ title: 'Temple tea culture', text: 'Monastery courtyards double as neighbourhood living rooms.' }],
    answers: [{ text: 'An urban temple serves a neighbourhood: daily offerings, funerals, festivals, tea. A mountain monastery is a destination that pilgrims travel to and that trains monastics apart from the city.', related: ['emei', 'qingcheng'] }],
  },
  kathmandu: {
    summary: 'In the Kathmandu Valley, Hindu temples and Buddhist stupas stand in the same squares, and many festivals belong to both communities. At Boudhanath, Tibetan pilgrims circle one of the largest stupas in the world beneath its painted eyes; on its hill, Swayambhunath is the centre of the Newars’ own Buddhism; by the river, Pashupatinath is one of the great temples of Shiva. It is a living example of religious plurality, and a possible Himalayan gateway, with conditions.',
    experiences: [
      { title: 'Boudhanath at dusk', kind: 'walk', text: 'Join the clockwise circuit as butter lamps are lit.', hours: '2 h', verified: false },
      { title: 'Swayambhunath', kind: 'visit', text: 'Hilltop stupa over the valley.', hours: '2 h', verified: false },
      { title: 'Patan Durbar Square', kind: 'visit', text: 'Malla-era palace and temples; Patan Museum.', hours: 'Half a day', verified: false },
      { title: 'Losar at Boudha', kind: 'festival', text: 'The Tibetan community marks the New Year around the stupa.', verified: false },
    ],
    living: [
      { title: 'Shared festivals', text: 'Hindu and Buddhist Newars take part in many of the same processions.' },
      { title: 'Householder priests', text: 'Newar Buddhism is led by married priestly lineages, not celibate monks.' },
    ],
    answers: [{ text: 'By sharing places and festivals while keeping distinct priesthoods, texts and identities. Some deities are honoured by both under different names; the communities do not regard themselves as one religion.', related: ['jerusalem'] }],
  },
};

/** Things associated with the season in the cities of the main route. None is a confirmed 2027 programme. */
export const CITY_EXPERIENCES: Record<string, Experience[]> = {
  BEIJING: [
    { title: 'Yonghe Temple (Lama Temple)', kind: 'visit', text: 'A Tibetan Buddhist monastery in the capital; very busy at the New Year, when many come to pray.', hours: '2 h', verified: false },
    { title: 'Temple fairs (miaohui)', kind: 'festival', text: 'Fairs at parks such as Ditan and Longtan have been a Spring Festival tradition in past years.', verified: false },
    { title: 'White Cloud Temple', kind: 'visit', text: 'Beijing’s principal Daoist temple, seat of the Quanzhen tradition.', hours: '2 h', verified: false },
    { title: 'Temple of Heaven', kind: 'visit', text: 'Where emperors performed the rites that tied the dynasty to the cosmos.', hours: '3 h', verified: false },
    { title: 'Lantern Festival evening', kind: 'festival', text: 'Lantern displays and tangyuan on the fifteenth day; venues change each year.', verified: false },
  ],
  SHANGHAI: [
    { title: 'Yuyuan lantern displays', kind: 'festival', text: 'The Yu Garden area has staged large lantern displays around the New Year in past years.', verified: false },
    { title: 'Jade Buddha Temple', kind: 'visit', text: 'An active Chan monastery in the city.', hours: '1–2 h', verified: false },
    { title: 'Longhua Temple and pagoda', kind: 'visit', text: 'Shanghai’s largest and oldest temple complex.', hours: '2 h', verified: false },
  ],
  XIAN: [],
  CHENGDU: [],
};
