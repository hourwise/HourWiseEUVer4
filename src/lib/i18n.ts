import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

// Import local English backup
import enTranslations from './i18n/en.json';

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
  .use(initReactI18next);

export const i18nConfig = {
  debug: true,
  fallbackLng: 'en',
  supportedLngs: supportedLanguages,
  resources: {
    en: {
      translation: enTranslations
    }
  },
  ns: ['translation'],
  defaultNS: 'translation',
  keySeparator: '.',
  interpolation: {
    escapeValue: false,
  },
  backend: {
    loadPath,
    queryStringParams: { v: '1.0.1' },
    requestOptions: { cache: 'no-store' },
    // Only fetch from network if the language is NOT english
    loadPath: (lngs: string[], _namespaces: string[]) => {
        if (lngs.includes('en')) return ''; // Don't fetch English from web
        return loadPath;
    }
  },
  react: {
    useSuspense: false,
  },
};

export default i18n;
