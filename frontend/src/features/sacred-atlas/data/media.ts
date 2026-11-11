// Curated imagery. Every photograph is a Wikimedia Commons file under a free licence, recorded with author, licence and source page.
// Images are loaded from Commons at the size needed (Special:FilePath redirects to a cached thumbnail); nothing is copied into the repo.
// A place without an entry gets the neutral placeholder: never a guessed or unlicensed picture.

export interface MediaItem {
  file: string;            // Commons file name
  alt: string;
  location: string;
  credit: string;
  license: string;
  licenseUrl: string;
  /** CSS object-position, so crops keep the subject. */
  focal: string;
  verificationPending?: boolean;
}

const BY2 = 'https://creativecommons.org/licenses/by/2.0/';
const BYSA4 = 'https://creativecommons.org/licenses/by-sa/4.0/';
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';

export const MEDIA: Record<string, MediaItem> = {
  hero: { file: '峨眉山风景区 Mount Emei Scenic Area 07.jpg', alt: 'Mount Emei Scenic Area, Sichuan', location: 'Mount Emei, Sichuan, China', credit: 'George N', license: 'CC BY 2.0', licenseUrl: BY2, focal: '50% 45%' },
  jerusalem: { file: 'Jerusalem-2013(2)-View of the Dome of the Rock & Temple Mount 02.jpg', alt: 'The Old City of Jerusalem with the Dome of the Rock', location: 'Jerusalem', credit: 'Andrew Shiva / Wikipedia', license: 'CC BY-SA 4.0', licenseUrl: BYSA4, focal: '50% 55%' },
  emei: { file: 'Golden Summit (Jinding) (17264931860).jpg', alt: 'The Golden Summit of Mount Emei', location: 'Mount Emei, Sichuan, China', credit: 'Min Zhou', license: 'CC BY 2.0', licenseUrl: BY2, focal: '50% 40%' },
  lhasa: { file: 'Potala Palace in Lhasa, Tibet.jpg', alt: 'The Potala Palace above Lhasa', location: 'Lhasa, Tibet Autonomous Region, China', credit: 'Jan Kranendonk', license: 'CC BY-SA 4.0', licenseUrl: BYSA4, focal: '50% 40%', verificationPending: true },
  qingcheng: { file: 'Jianfu Palace, Mount Qingcheng (54530903712).jpg', alt: 'Jianfu Palace, a Daoist temple at the foot of Mount Qingcheng', location: 'Mount Qingcheng, Sichuan, China', credit: 'xiquinhosilva', license: 'CC BY 2.0', licenseUrl: BY2, focal: '50% 50%' },
  xian: { file: "Giant Wild Goose Pagoda, Xi'an, May, 2018-1.jpg", alt: "The Giant Wild Goose Pagoda in Xi'an", location: "Xi'an, Shaanxi, China", credit: 'Alexey Komarov', license: 'CC BY-SA 4.0', licenseUrl: BYSA4, focal: '50% 35%' },
  chengdu: { file: 'Hall - Wenshu Monastery - Chengdu, China - DSC05252.jpg', alt: 'A hall of Wenshu Monastery in Chengdu', location: 'Chengdu, Sichuan, China', credit: 'Daderot', license: 'CC0 1.0', licenseUrl: CC0, focal: '50% 50%' },
  kathmandu: { file: 'Boudhanath stupa, Kathmandu 01.jpg', alt: 'Boudhanath stupa in Kathmandu', location: 'Kathmandu, Nepal', credit: 'Bernard Gagnon', license: 'CC BY-SA 4.0', licenseUrl: BYSA4, focal: '50% 40%' },
};

const STEPS = [330, 500, 960, 1280, 1920];
// Existing source pages checked 2026-11-11. Lhasa could not be retrieved and stays a placeholder.
// Direct thumbnail paths avoid a Special:FilePath HTML redirect.
const THUMB: Record<string, string> = {
  '峨眉山风景区 Mount Emei Scenic Area 07.jpg': '5/56',
  'Golden Summit (Jinding) (17264931860).jpg': '4/4f',
  'Jerusalem-2013(2)-View of the Dome of the Rock & Temple Mount 02.jpg': 'c/c8',
  'Boudhanath stupa, Kathmandu 01.jpg': 'e/e0',
  'Jianfu Palace, Mount Qingcheng (54530903712).jpg': '4/44',
  "Giant Wild Goose Pagoda, Xi'an, May, 2018-1.jpg": '9/91',
  'Hall - Wenshu Monastery - Chengdu, China - DSC05252.jpg': 'd/d5',
};
export const imgUrl = (file: string, width: number) =>
  THUMB[file]
    ? `https://thumb.wikimedia.org/wikipedia/commons/thumb/${THUMB[file]}/${encodeURIComponent(file.replace(/ /g, '_'))}/${width <= 330 ? 330 : width <= 960 ? 960 : 1280}px-${encodeURIComponent(file.replace(/ /g, '_'))}`
    : `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${STEPS.find((s) => s >= width) ?? 1920}`;
export const sourcePage = (file: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;
