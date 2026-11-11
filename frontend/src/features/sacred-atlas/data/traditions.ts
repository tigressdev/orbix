import type { ComparativeTheme, Tradition, TraditionId } from '../types';

// Comparative summaries written for orientation, not as definitions. Each tradition is internally plural; every answer
// carries a "diversity" note. Similarities shown elsewhere are comparative observations, not claims of historical influence.

export const THEMES: { id: ComparativeTheme; title: string; question: string }[] = [
  { id: 'condition', title: 'The human condition', question: 'What is the fundamental problem of human existence?' },
  { id: 'suffering', title: 'Suffering', question: 'How is suffering interpreted?' },
  { id: 'goal', title: 'Liberation and salvation', question: 'What is the ultimate religious or philosophical objective?' },
  { id: 'sacred', title: 'The sacred', question: 'How is transcendence or ultimate reality understood?' },
  { id: 'ethics', title: 'Ethics', question: 'How should a person live?' },
  { id: 'ritual', title: 'Ritual', question: 'What role do religious practices play?' },
  { id: 'time', title: 'Time', question: 'How are history, cycles, mortality and eternity understood?' },
  { id: 'nature', title: 'Humanity and nature', question: 'What is humanity’s place in the cosmos?' },
];

export const TRADITION_LABEL: Record<TraditionId, string> = {
  judaism: 'Judaism', christianity: 'Christianity', islam: 'Islam', buddhism: 'Buddhism', 'chinese-buddhism': 'Chinese Buddhism',
  'tibetan-buddhism': 'Tibetan Buddhism', daoism: 'Daoism', hinduism: 'Hinduism', 'newar-buddhism': 'Newar Buddhism',
};

export const CAUTIONS = [
  'Buddhist liberation (nirvāṇa) is not the same as Christian salvation: one is the cessation of craving and rebirth, the other reconciliation with a personal God.',
  'The Dao is not the Abrahamic God: it is not a personal creator who commands, though religious Daoism venerates deities, including a deified Laozi.',
  'Buddhism, Daoism and the Abrahamic religions do not share a single historical origin. Parallels are comparative observations.',
  'Chinese Buddhism and Tibetan Buddhism are distinct: different canons, schools, languages and ritual emphases.',
];

export const TRADITIONS: Tradition[] = [
  {
    id: 'judaism', name: 'Judaism', family: 'Abrahamic', originNote: 'Ancient Israelite religion, reshaped after 70 CE into Rabbinic Judaism.',
    branches: ['Rabbinic (historical mainstream)', 'Karaite', 'Orthodox, including Hasidic', 'Conservative / Masorti', 'Reform', 'Reconstructionist'],
    themes: {
      condition: { summary: 'Humans are made in the image of God and given commandments. The problem is faithfulness to the covenant against the inclination to do wrong (yetzer ha-ra), not an inherited original sin.', diversity: 'Philosophical (Maimonides) and mystical (Kabbalah) readings frame the human situation very differently.' },
      suffering: { summary: 'Wrestled with rather than solved: Job and Lamentations hold protest and trust together. Suffering may be read as consequence, test or mystery.', diversity: 'Post-Holocaust theologies range from renewed covenant to radical questioning.' },
      goal: { summary: 'A life sanctified through the commandments (mitzvot) within a covenantal people, with hope for messianic redemption and the world to come. “Salvation” is not usually the organizing term.', diversity: 'Emphasis on the afterlife and the messianic age varies widely between movements.' },
      sacred: { summary: 'One God, creator and transcendent, yet present to Israel (Shekhinah) and revealed in Torah.', diversity: 'Kabbalah describes divine emanations (sefirot); rationalist thought stresses God’s unknowability.' },
      ethics: { summary: 'Halakha, the path of law interpreted through rabbinic tradition: justice, charity (tzedakah), care for the stranger.', diversity: 'Movements differ on how binding and how changeable halakha is.' },
      ritual: { summary: 'Sabbath, festivals, daily prayer and dietary law. After the Temple, prayer and study took the place of sacrifice.', diversity: 'Observance ranges from strict to selective.' },
      time: { summary: 'History is the arena of covenant; weekly and yearly cycles re-enact remembered events such as the Exodus at Passover.', diversity: 'Messianic expectation is literal for some, symbolic for others.' },
      nature: { summary: 'Creation is good; humanity is placed in it to work and guard it. Agricultural law (sabbatical year) limits use of land.', diversity: 'Modern Jewish environmental ethics draws on these sources selectively.' },
    },
    sources: [{ label: 'Michael Fishbane, Judaism: Revelation and Traditions (HarperSanFrancisco, 1987)', kind: 'scholarly' }, { label: 'Encyclopaedia Britannica: Judaism', url: 'https://www.britannica.com/topic/Judaism', kind: 'reference' }],
  },
  {
    id: 'christianity', name: 'Christianity', family: 'Abrahamic', originNote: 'Emerged from Second Temple Judaism in the 1st century CE around Jesus of Nazareth.',
    branches: ['Catholic', 'Eastern Orthodox', 'Oriental Orthodox', 'Church of the East', 'Protestant (Lutheran, Reformed, Anglican, Baptist, Methodist, Pentecostal…)'],
    themes: {
      condition: { summary: 'Humanity is estranged from God by sin. Western traditions after Augustine speak of original sin; Eastern Orthodoxy stresses inherited mortality and corruption rather than inherited guilt.', diversity: 'Views on free will and grace divided Augustinians, Pelagians, Calvinists and Arminians.' },
      suffering: { summary: 'Read through the cross: God shares human suffering in Christ, and suffering can be joined to redemption, while evil remains evil.', diversity: 'Theodicies range from free-will defences to an emphasis on lament and mystery.' },
      goal: { summary: 'Salvation: reconciliation with God through Christ, resurrection and eternal life. Orthodoxy speaks of theosis (participation in God).', diversity: 'Justification by faith (Protestant) and grace through the sacraments (Catholic, Orthodox) are major differences.' },
      sacred: { summary: 'One God as Trinity: Father, Son and Holy Spirit, incarnate in Jesus Christ.', diversity: 'Christological disputes (Chalcedon, 451) still distinguish Orthodox, Oriental Orthodox and the Church of the East.' },
      ethics: { summary: 'Love of God and neighbour; the Sermon on the Mount; virtue and grace.', diversity: 'Natural-law ethics (Catholic) and scripture-centred ethics (many Protestants) reason differently.' },
      ritual: { summary: 'Baptism and the Eucharist are central; worship follows a liturgical year.', diversity: 'Seven sacraments in Catholic and Orthodox churches; most Protestants recognize two.' },
      time: { summary: 'Linear history from creation through incarnation to final fulfilment, with the liturgical year as a cycle inside that line.', diversity: 'Eschatology ranges from imminent expectation to realized and symbolic readings.' },
      nature: { summary: 'Creation is good but fallen and awaits renewal. Humans are given dominion, often read as stewardship.', diversity: 'Franciscan and Orthodox traditions give nature a sacramental or liturgical role.' },
    },
    sources: [{ label: 'Alister E. McGrath, Christian Theology: An Introduction (Wiley-Blackwell, 6th ed., 2016)', kind: 'scholarly' }, { label: 'Encyclopaedia Britannica: Christianity', url: 'https://www.britannica.com/topic/Christianity', kind: 'reference' }],
  },
  {
    id: 'islam', name: 'Islam', family: 'Abrahamic', originNote: 'Founded on the revelation received by the Prophet Muhammad in 7th-century Arabia.',
    branches: ['Sunni (Hanafi, Maliki, Shafi‘i, Hanbali legal schools)', 'Shi‘a (Twelver, Ismaili, Zaydi)', 'Ibadi', 'Sufi orders (across both)'],
    themes: {
      condition: { summary: 'Humans are created with a sound innate disposition (fitra) but are prone to forgetfulness and heedlessness (ghafla). There is no inherited original sin.', diversity: 'Theological schools (Ash‘ari, Maturidi, Mu‘tazili) differ on human freedom and divine decree.' },
      suffering: { summary: 'A test (ibtila’) and a means of purification, met with patience (sabr) and trust in God (tawakkul).', diversity: 'Debates over divine justice and power produced distinct theodicies.' },
      goal: { summary: 'Submission (islam) to God and success (falah) in this life and the hereafter; Paradise by God’s mercy, through faith and righteous deeds.', diversity: 'Sufism stresses nearness to God in this life as well.' },
      sacred: { summary: 'Strict monotheism (tawhid): God is one, without partner, transcendent, revealed in the Qur’an and known through His names.', diversity: 'Philosophers, theologians and mystics describe God’s attributes in different vocabularies.' },
      ethics: { summary: 'Shari‘a as the divinely guided way, worked out in jurisprudence (fiqh): justice, charity, honesty, family obligations.', diversity: 'Legal schools and modern reformers interpret it differently.' },
      ritual: { summary: 'The five pillars: testimony of faith, daily prayer, almsgiving, fasting in Ramadan, pilgrimage to Mecca.', diversity: 'Shi‘a practice adds commemorations such as Ashura; Sufi orders add dhikr.' },
      time: { summary: 'Linear history of prophets from Adam to Muhammad, moving toward the Day of Judgement; a lunar calendar dated from the Hijra.', diversity: 'Eschatological expectations differ, notably on the Mahdi.' },
      nature: { summary: 'Nature is full of signs (ayat) of God; humans are trustees (khalifa) responsible for it.', diversity: 'Contemporary Islamic environmental ethics builds on this trusteeship.' },
    },
    sources: [{ label: 'Jonathan P. Berkey, The Formation of Islam (Cambridge, 2003)', kind: 'scholarly' }, { label: 'Seyyed Hossein Nasr et al. (eds.), The Study Quran (HarperOne, 2015)', kind: 'scholarly' }],
  },
  {
    id: 'buddhism', name: 'Buddhism', family: 'Indic', originNote: 'Teachings of Siddhārtha Gautama (the Buddha), north India, c. 5th century BCE.',
    branches: ['Theravāda', 'Mahāyāna, including East Asian schools (Chan/Zen, Pure Land, Tiantai, Huayan)', 'Vajrayāna (Tibetan, Newar, Shingon)'],
    themes: {
      condition: { summary: 'Existence is marked by dukkha (unsatisfactoriness), rooted in craving and ignorance of impermanence and not-self.', diversity: 'Mahāyāna adds emptiness and, in East Asia, buddha-nature as an inherent potential.' },
      suffering: { summary: 'The central diagnosis (the first two Noble Truths), explained causally through dependent origination, not as divine punishment.', diversity: 'Schools differ on how karma and rebirth operate.' },
      goal: { summary: 'Nirvāṇa: the ending of craving and release from the cycle of rebirth. Mahāyāna aims at full Buddhahood for the sake of all beings.', diversity: 'Pure Land devotion seeks rebirth in a Buddha’s land as a stage on the path.' },
      sacred: { summary: 'No creator God. Ultimate truth is framed as Dharma, nirvāṇa, or emptiness (śūnyatā); gods exist but remain inside the cycle of rebirth.', diversity: 'Buddha-nature teachings in East Asia describe a positive ultimate, debated by other schools.' },
      ethics: { summary: 'Precepts and the Noble Eightfold Path; intention shapes karma; non-harm and compassion.', diversity: 'Monastic discipline (vinaya) differs between traditions.' },
      ritual: { summary: 'Meditation, chanting, offerings, merit-making and monastic life.', diversity: 'Lay devotion dominates in many places; meditation is central for some, minor for others.' },
      time: { summary: 'Vast cosmic cycles and rebirth, within which the path is a practice leading out.', diversity: 'Teachings on the decline of the Dharma shaped East Asian schools.' },
      nature: { summary: 'Humans share a continuum with all sentient beings; a human birth is a rare opportunity for practice.', diversity: 'East Asian thinkers debated whether plants and landscapes have buddha-nature.' },
    },
    sources: [{ label: 'Peter Harvey, An Introduction to Buddhism (Cambridge, 2nd ed., 2013)', kind: 'scholarly' }, { label: 'Rupert Gethin, The Foundations of Buddhism (Oxford, 1998)', kind: 'scholarly' }],
  },
  {
    id: 'tibetan-buddhism', name: 'Tibetan Buddhism', family: 'Indic (Vajrayāna)', originNote: 'Transmitted from India from the 7th–8th centuries; schools formed from the 11th century.',
    branches: ['Nyingma', 'Sakya', 'Kagyu', 'Gelug', 'Jonang', 'Bön (a distinct, related tradition)'],
    themes: {
      condition: { summary: 'Shares the Buddhist diagnosis; stresses that the mind’s nature is clear and luminous, obscured by afflictive emotions.', diversity: 'Schools disagree on how to describe that nature (e.g. “self-empty” and “other-empty” views).' },
      suffering: { summary: 'Rebirth among six realms; mind-training (lojong) teaches turning adversity into the path.', diversity: '' },
      goal: { summary: 'Buddhahood for the benefit of all beings, motivated by bodhicitta; tantric methods are held to make it possible in one life.', diversity: 'Dzogchen (Nyingma) and Mahāmudrā (Kagyu) are distinct culminating practices.' },
      sacred: { summary: 'Emptiness understood through Madhyamaka philosophy; enlightened deities in tantra are expressions of awakened mind, not creator gods. Local spirits inhabit the landscape.', diversity: 'Gelug scholasticism and Nyingma contemplative traditions frame this differently.' },
      ethics: { summary: 'Monastic vows, bodhisattva vows and tantric commitments; compassion as the basis of the path.', diversity: '' },
      ritual: { summary: 'Initiation, guru devotion, mantra and visualization, prostration, circumambulation (kora) and formal debate.', diversity: 'Different schools hold different ritual cycles and festivals.' },
      time: { summary: 'Rebirth, recognised reincarnate teachers (tulku), and the Kālacakra cosmology.', diversity: '' },
      nature: { summary: 'Mountains, lakes and caves are sacred places (néri), abodes of deities and destinations of pilgrimage.', diversity: '' },
    },
    sources: [{ label: 'Geoffrey Samuel, Civilized Shamans (Smithsonian, 1993)', kind: 'scholarly' }, { label: 'Matthew T. Kapstein, The Tibetans (Blackwell, 2006)', kind: 'scholarly' }],
  },
  {
    id: 'daoism', name: 'Daoism', family: 'Chinese', originNote: 'Classical texts (Laozi, Zhuangzi) from the 4th–3rd c. BCE; organized religion from the 2nd c. CE (Celestial Masters).',
    branches: ['Zhengyi (Celestial Masters)', 'Shangqing', 'Lingbao', 'Quanzhen (monastic)'],
    themes: {
      condition: { summary: 'People lose their spontaneity through excess desire, rigid distinctions and coercive convention, drifting from the Dao.', diversity: 'Scholars debate how far “philosophical” and “religious” Daoism can be separated.' },
      suffering: { summary: 'Arises from resisting the course of things. Zhuangzi relativises even life and death; religious Daoism also treats illness and misfortune through ritual.', diversity: '' },
      goal: { summary: 'Harmony with the Dao: sagely spontaneity in the classics; in religious traditions, longevity, transcendence (becoming a xian) and cosmic renewal.', diversity: 'Inner alchemy (neidan) and liturgical traditions describe the goal differently.' },
      sacred: { summary: 'The Dao is the nameless source and pattern of all things, not a personal creator. Religious Daoism venerates many deities, including a deified Laozi.', diversity: '' },
      ethics: { summary: 'Simplicity, frugality, non-contention and wu wei (non-coercive action); precepts for priests and monastics.', diversity: 'Quanzhen monastic rules draw on Buddhist models.' },
      ritual: { summary: 'Offering rites (jiao), fasts (zhai), ordination, talismans, meditation and breath cultivation.', diversity: '' },
      time: { summary: 'Cycles of yin and yang and the five phases; the cosmos unfolds from the Dao and is periodically renewed.', diversity: '' },
      nature: { summary: 'Humanity is part of nature. Mountains are places of cultivation and hold “grotto-heavens” (dongtian).', diversity: '' },
    },
    sources: [{ label: 'Isabelle Robinet, Taoism: Growth of a Religion (Stanford, 1997)', kind: 'scholarly' }, { label: 'Chad Hansen, “Daoism”, Stanford Encyclopedia of Philosophy', url: 'https://plato.stanford.edu/entries/daoism/', kind: 'reference' }],
  },
];
