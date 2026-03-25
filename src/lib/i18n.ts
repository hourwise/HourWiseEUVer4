import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import ChainedBackend from 'i18next-chained-backend';
import resourcesToBackend from 'i18next-resources-to-backend';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

// Import local English backup
import enTranslations from './i18n/en.json';

// We prioritize en-GB for EU compliance (date formats, currency, etc.)
const supportedLanguages = [
  'en-GB', 'de', 'fr', 'es', 'it', 'pl', 'ro', 'nl', 'pt', 'uk', 'hu', 'bg', 'lt', 'cs', 'sk', 'lv', 'tr'
];

// Map en-GB back to en for remote requests as the server hosts en.json
const getLoadPath = (lngs: string[]) => {
  const lng = lngs[0] === 'en-GB' ? 'en' : lngs[0];
  return `https://www.hourwiseeu.co.uk/locales/${lng}.json`;
};

const languageDetector = {
  type: 'languageDetector' as const,
  async: true,
  detect: async (callback: (lang: string) => void) => {
    const saved = await AsyncStorage.getItem('user-language');
    // If user saved 'en', migrate them to 'en-GB'
    if (saved === 'en') {
      return callback('en-GB');
    }
    if (saved && supportedLanguages.includes(saved)) {
      return callback(saved);
    }

    const locale = Localization.getLocales()?.[0];
    const deviceLang = locale?.languageCode || 'en';

    // Force en-GB for any English variant to ensure proper EU voice/formatting
    if (deviceLang === 'en') {
      return callback('en-GB');
    }

    callback(supportedLanguages.includes(deviceLang) ? deviceLang : 'en-GB');
  },
  init: () => {},
  cacheUserLanguage: async (lang: string) => {
    await AsyncStorage.setItem('user-language', lang);
  },
};

i18n
  .use(ChainedBackend)
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    debug: __DEV__,
    fallbackLng: 'en-GB',
    supportedLngs: supportedLanguages,
    ns: ['translation'],
    defaultNS: 'translation',
    keySeparator: '.',
    interpolation: {
      escapeValue: false,
      formatSeparator: ',',
    },
    backend: {
      backends: [
        HttpBackend,
        resourcesToBackend({
          'en-GB': { translation: enTranslations },
          'en': { translation: enTranslations }
        })
      ],
      backendOptions: [
        {
          loadPath: getLoadPath,
          queryStringParams: { v: '1.0.2' },
          requestOptions: { cache: 'no-store' }
        },
        {}
      ],
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
