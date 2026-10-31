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
};

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
