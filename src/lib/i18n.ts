import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

const supportedLanguages = [
  'en','de','fr','es','ro','it','pl','nl','pt','uk','hu','bg','lt','cs','sk','lv','tr'
];

const loadPath = 'https://www.hourwiseeu.co.uk/locales/{{lng}}.json';

const languageDetector = {
  type: 'languageDetector' as const,
  async: true,
  detect: async (callback: (lang: string) => void) => {
    const saved = await AsyncStorage.getItem('user-language');
    if (saved && supportedLanguages.includes(saved)) return callback(saved);

    const deviceLang = Localization.getLocales()?.[0]?.languageCode || 'en';
    callback(supportedLanguages.includes(deviceLang) ? deviceLang : 'en');
  },
  init: () => {},
  cacheUserLanguage: async (lang: string) => {
    await AsyncStorage.setItem('user-language', lang);
  },
};

i18n
  .use(HttpBackend)
  .use(languageDetector)
  .use(initReactI18next)
  // The .init() call is removed from here. App.tsx will now handle initialization.
  ;

export const i18nConfig = {
  debug: true,
  fallbackLng: 'en',
  supportedLngs: supportedLanguages,
  ns: ['translation'],
  defaultNS: 'translation',
  keySeparator: '.',
  interpolation: {
    escapeValue: false,
  },
  backend: {
    loadPath,
    queryStringParams: { v: '1.0.1' }, // <-- Incremented version to bust cache
    requestOptions: { cache: 'no-store' },
  },
  react: {
    useSuspense: false, // We are handling the ready state manually now
  },
};

export default i18n;
