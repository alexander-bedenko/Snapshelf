export type Strings = {
  title: string;
  permissionTitle: string;
  permissionBody: string;
  allow: string;
  deniedTitle: string;
  deniedBody: string;
  tryAgain: string;
  blockedBody: string;
  openSettings: string;
  emptyTitle: string;
  emptyBody: string;
  rescan: string;
  progress: (done: number, total: number) => string;
  status: { pending: string; processing: string; done: string; failed: string };
  noText: string;
  loading: string;
  error: (message: string) => string;
  searchPlaceholder: string;
  searchClear: string;
  noResults: (query: string) => string;
  resultsCount: (count: number) => string;
  back: string;
  foundTitle: string;
  nothingFound: string;
  recognizedText: string;
  screenshotMissing: string;
  entityLabel: { link: string; email: string; phone: string; date: string; task: string };
  taskDone: string;
  taskOpen: string;
  openFailed: (target: string) => string;
  foundCount: (count: number) => string;
};

function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const en: Strings = {
  title: 'Snapshelf',
  permissionTitle: 'Find your screenshots',
  permissionBody:
    'Snapshelf needs access to your photos to find screenshots. Text is recognized on this device and never leaves it.',
  allow: 'Allow access to screenshots',
  deniedTitle: 'Access was not granted',
  deniedBody: 'Without access to photos the app cannot find your screenshots.',
  tryAgain: 'Try again',
  blockedBody: 'Access is turned off. Open the app settings and allow access to photos and videos.',
  openSettings: 'Open settings',
  emptyTitle: 'No screenshots yet',
  emptyBody: 'Take a screenshot and it will show up here.',
  rescan: 'Scan again',
  progress: (done, total) => `Processed ${done} of ${total}`,
  status: { pending: 'Waiting', processing: 'Reading…', done: 'Done', failed: 'Failed' },
  noText: 'No text found',
  loading: 'Loading…',
  error: (message) => `Something went wrong: ${message}`,
  searchPlaceholder: 'Search text in screenshots',
  searchClear: 'Clear search',
  noResults: (query) => `Nothing found for “${query}”`,
  resultsCount: (count) => (count === 1 ? '1 screenshot found' : `${count} screenshots found`),
  back: 'Back',
  foundTitle: 'Found in this screenshot',
  nothingFound: 'No links, dates, contacts or tasks found.',
  recognizedText: 'Recognized text',
  screenshotMissing: 'This screenshot is no longer in the library.',
  entityLabel: { link: 'Link', email: 'Email', phone: 'Phone', date: 'Date', task: 'Task' },
  taskDone: 'Done',
  taskOpen: 'Not done',
  openFailed: (target) => `Could not open ${target}`,
  foundCount: (count) => (count === 1 ? '1 item found' : `${count} items found`),
};

const ru: Strings = {
  title: 'Snapshelf',
  permissionTitle: 'Найдём ваши скриншоты',
  permissionBody:
    'Snapshelf нужен доступ к фото, чтобы найти скриншоты. Текст распознаётся на устройстве и никуда не отправляется.',
  allow: 'Разрешить доступ к скриншотам',
  deniedTitle: 'Доступ не предоставлен',
  deniedBody: 'Без доступа к фото приложение не сможет найти ваши скриншоты.',
  tryAgain: 'Повторить',
  blockedBody: 'Доступ выключен. Откройте настройки приложения и разрешите доступ к фото и видео.',
  openSettings: 'Открыть настройки',
  emptyTitle: 'Скриншотов пока нет',
  emptyBody: 'Сделайте скриншот, и он появится здесь.',
  rescan: 'Проверить снова',
  progress: (done, total) => `Обработано ${done} из ${total}`,
  status: { pending: 'В очереди', processing: 'Читаю…', done: 'Готово', failed: 'Ошибка' },
  noText: 'Текст не найден',
  loading: 'Загрузка…',
  error: (message) => `Что-то пошло не так: ${message}`,
  searchPlaceholder: 'Поиск по тексту скриншотов',
  searchClear: 'Очистить поиск',
  noResults: (query) => `По запросу «${query}» ничего не найдено`,
  resultsCount: (count) =>
    `${ruPlural(count, 'Найден', 'Найдено', 'Найдено')} ${count} ${ruPlural(count, 'скриншот', 'скриншота', 'скриншотов')}`,
  back: 'Назад',
  foundTitle: 'Найдено на скриншоте',
  nothingFound: 'Ссылок, дат, контактов и задач не найдено.',
  recognizedText: 'Распознанный текст',
  screenshotMissing: 'Этого скриншота больше нет в библиотеке.',
  entityLabel: { link: 'Ссылка', email: 'Почта', phone: 'Телефон', date: 'Дата', task: 'Задача' },
  taskDone: 'Сделано',
  taskOpen: 'Не сделано',
  openFailed: (target) => `Не удалось открыть ${target}`,
  foundCount: (count) =>
    `${ruPlural(count, 'Найден', 'Найдено', 'Найдено')} ${count} ${ruPlural(count, 'элемент', 'элемента', 'элементов')}`,
};

export function getStrings(locale: string): Strings {
  return locale.toLowerCase().startsWith('ru') ? ru : en;
}

export function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'en';
  }
}
