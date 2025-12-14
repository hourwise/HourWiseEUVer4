import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import * as Localization from 'expo-localization';

// 1. PASTE YOUR REAL URL HERE
// 2. CHANGE 'en.json' TO '{{lng}}.json'
// 3. REMOVE THE COMMIT HASH IF PRESENT (the long string between /raw/ and /{{lng}}/)
const loadPath = 'https://gist.githubusercontent.com/hourwise/c06849a939279bd1a01d47d1b0dc0c5f/raw/{{lng}}.json';

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    debug: true,
    fallbackLng: 'en',
    lng: Localization.getLocales()[0].languageCode,
    supportedLngs: ['en', 'de', 'fr', 'es', 'it', 'pl', 'ro', 'nl', 'pt'],

    ns: ['translation'],
    defaultNS: 'translation',

    backend: {
      loadPath: loadPath,
      requestOptions: { cache: 'no-store' } // Keep this for now! It helps debugging.
    },

    keySeparator: false,

    interpolation: {
      escapeValue: false,
    },

    react: {
      useSuspense: true,
    }
  });

export default i18n;
