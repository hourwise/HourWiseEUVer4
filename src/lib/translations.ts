export type Language = 'en' | 'en-GB';

type RegionalRuleGroup = {
  country: string;
  rules: string[];
};

type RegionalRulesByLanguage = Record<string, RegionalRuleGroup>;

export const regionalRules: Record<Language, RegionalRulesByLanguage> = {
  en: {
    uk: {
      country: 'United Kingdom',
      rules: [
        'Use local speed and access restrictions alongside tachograph planning.',
        'Check bridge heights, weight limits, and hazardous goods route controls before departure.',
      ],
    },
    eu: {
      country: 'European Union',
      rules: [
        'Regional road restrictions and environmental zones can affect route viability.',
        'Verify local low-emission, tunnel, and weekend HGV restrictions for each country entered.',
      ],
    },
  },
  'en-GB': {
    uk: {
      country: 'United Kingdom',
      rules: [
        'Use local speed and access restrictions alongside tachograph planning.',
        'Check bridge heights, weight limits, and hazardous goods route controls before departure.',
      ],
    },
    eu: {
      country: 'European Union',
      rules: [
        'Regional road restrictions and environmental zones can affect route viability.',
        'Verify local low-emission, tunnel, and weekend HGV restrictions for each country entered.',
      ],
    },
  },
};
