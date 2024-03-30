import * as vscode from 'vscode';

export const BASE_LANGUAGE = 'ru';
export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_CODE_LENGTH = 2;

export const languages: Language[] = [
    {
      name: 'Afrikaans',
      value: 'af',
      code: 'af_ZA'
    },
    {
      name: 'Albanian',
      value: 'sq',
      code: 'sq_AL'
    },
    {
      name: 'Arabic',
      value: 'ar',
      code: 'ar_AE'
    },
    {
      name: 'Armenian',
      value: 'hy',
      code: 'hy_AM'
    },
    {
      name: 'Azeerbaijani',
      value: 'az',
      code: 'az_AZ'
    },
    {
      name: 'Basque',
      value: 'eu',
      code: 'eu_ES'
    },
    {
      name: 'Belarusian',
      value: 'be',
      code: 'be_BY'
    },
    {
      name: 'Bengali',
      value: 'bn',
      code: 'bn_BD'
    },
    {
      name: 'Bosnian',
      value: 'bs',
      code: 'be_BY'
    },
    {
      name: 'Bulgarian',
      value: 'bg',
      code: 'bs_BA'
    },
    {
      name: 'Catalan',
      value: 'ca',
      code: 'ca_ES'
    },
    {
      name: 'Cebuano',
      value: 'ceb',
      code: 'ceb_PH'
    },
    {
      name: 'Chinese',
      value: 'zh-CN',
      code: 'zh_CN'
    },
    {
      name: 'Corsican',
      value: 'co',
      code: 'co_IT'
    },
    {
      name: 'Croatian',
      value: 'hr',
      code: 'hr_HR'
    },
    {
      name: 'Czech',
      value: 'cs',
      code: 'cs_CZ'
    },
    {
      name: 'Danish',
      value: 'da',
      code: 'da_DK'
    },
    {
      name: 'Dutch',
      value: 'nl',
      code: 'nl_NL'
    },
    {
      name: 'English',
      value: 'en',
      code: 'en_US'
    },
    {
      name: 'Esperanto',
      value: 'eo',
      code: 'eo_PL'
    },
    {
      name: 'Estonian',
      value: 'et',
      code: 'et_EE'
    },
    {
      name: 'Finnish',
      value: 'fi',
      code: 'fi_FI'
    },
    {
      name: 'French',
      value: 'fr',
      code: 'fr_FR'
    },
    {
      name: 'Frisian',
      value: 'fy',
      code: 'fy_NL'
    },
    {
      name: 'Galician',
      value: 'gl',
      code: 'gl_ES'
    },
    {
      name: 'Georgian',
      value: 'ka',
      code: 'ka_GE'
    },
    {
      name: 'German',
      value: 'de',
      code: 'de_DE'
    },
    {
      name: 'Greek',
      value: 'el',
      code: 'el_GR'
    },
    {
      name: 'Gujarati',
      value: 'gu',
      code: 'gu_IN'
    },
    {
      name: 'Haitian Creole',
      value: 'ht',
      code: 'ht_HT'
    },
    {
      name: 'Hausa',
      value: 'ha',
      code: 'ha_NG'
    },
    {
      name: 'Hawaiian',
      value: 'haw',
      code: 'ha_NG'
    },
    {
      name: 'Hebrew',
      value: 'he',
      code: 'he_IL'
    },
    {
      name: 'Hindi',
      value: 'hi',
      code: 'hi_IN'
    },
    {
      name: 'Hmong',
      value: 'hmn',
      code: 'hm_CN'
    },
    {
      name: 'Hungarian',
      value: 'hu',
      code: 'hu_HU'
    },
    {
      name: 'Icelandic',
      value: 'is',
      code: 'is_IS'
    },
    {
      name: 'Igbo',
      value: 'ig',
      code: 'ig_NG'
    },
    {
      name: 'Indonesian',
      value: 'id',
      code: 'id_ID'
    },
    {
      name: 'Irish',
      value: 'ga',
      code: 'ga_IE'
    },
    {
      name: 'Italian',
      value: 'it',
      code: 'it_IT'
    },
    {
      name: 'Japanese',
      value: 'ja',
      code: 'ja_JP'
    },
    {
      name: 'Javanese',
      value: 'jw',
      code: 'jw_ID'
    },
    {
      name: 'Kannada',
      value: 'kn',
      code: 'kn_IN'
    },
    {
      name: 'Kazakh',
      value: 'kk',
      code: 'kk_KZ'
    },
    {
      name: 'Khmer',
      value: 'km',
      code: 'km_KH'
    },
    {
      name: 'Korean',
      value: 'ko',
      code: 'ko_KR'
    },
    {
      name: 'Kurdish',
      value: 'ku',
      code: 'ku'
    },
    {
      name: 'Kyrgyz',
      value: 'ky',
      code: 'ky_KG'
    },
    {
      name: 'Lao',
      value: 'lo',
      code: 'lo_LA'
    },
    {
      name: 'Latin',
      value: 'la',
      code: 'la'
    },
    {
      name: 'Latvian',
      value: 'lv',
      code: 'lv_LV'
    },
    {
      name: 'Lithuanian',
      value: 'lt',
      code: 'lt_LT'
    },
    {
      name: 'Luxembourgish',
      value: 'lb',
      code: 'lb_LU'
    },
    {
      name: 'Macedonian',
      value: 'mk',
      code: 'mk_MK'
    },
    {
      name: 'Malagasy',
      value: 'mg',
      code: 'mg_MG'
    },
    {
      name: 'Malay',
      value: 'ms',
      code: 'ms_MY'
    },
    {
      name: 'Malayalam',
      value: 'ml',
      code: 'ml_IN'
    },
    {
      name: 'Maltese',
      value: 'mt',
      code: 'mt_MT'
    },
    {
      name: 'Maori',
      value: 'mi',
      code: 'mi_NZ'
    },
    {
      name: 'Marathi',
      value: 'mr',
      code: 'mr_IN'
    },
    {
      name: 'Mongolian',
      value: 'mn',
      code: 'mn_MN'
    },
    {
      name: 'Myanmar',
      value: 'my',
      code: 'my_MM'
    },
    {
      name: 'Nepali',
      value: 'ne',
      code: 'ne_NP'
    },
    {
      name: 'Norwegian',
      value: 'no',
      code: 'no_NO'
    },
    {
      name: 'Nyanja',
      value: 'ny',
      code: 'ny_MW'
    },
    {
      name: 'Pashto',
      value: 'ps',
      code: 'ps_AR'
    },
    {
      name: 'Persian',
      value: 'fa',
      code: 'fa_IR'
    },
    {
      name: 'Polish',
      value: 'pl',
      code: 'pl_PL'
    },
    {
      name: 'Portuguese',
      value: 'pt',
      code: 'pt_PT'
    },
    {
      name: 'Punjabi',
      value: 'pa',
      code: 'pa_IN'
    },
    {
      name: 'Romanian',
      value: 'ro',
      code: 'ro_RO'
    },
    {
      name: 'Russian',
      value: 'ru',
      code: 'ru_RU'
    },
    {
      name: 'Samoan',
      value: 'sm',
      code: 'sm_WS'
    },
    {
      name: 'Scots Gaelic',
      value: 'gd',
      code: 'db_UK'
    },
    {
      name: 'Serbian',
      value: 'sr',
      code: 'sr_SP'
    },
    {
      name: 'Sesotho',
      value: 'st',
      code: 'st_LS'
    },
    {
      name: 'Shona',
      value: 'sn',
      code: 'sn_ZW'
    },
    {
      name: 'Sindhi',
      value: 'sd',
      code: 'sd'
    },
    {
      name: 'Sinhala',
      value: 'si',
      code: 'si_LK'
    },
    {
      name: 'Slovak',
      value: 'sk',
      code: 'sk_SK'
    },
    {
      name: 'Slovenian',
      value: 'sl',
      code: 'sl_SI'
    },
    {
      name: 'Somali',
      value: 'so',
      code: 'so_SO'
    },
    {
      name: 'Spanish',
      value: 'es',
      code: 'es_ES'
    },
    {
      name: 'Sundanese',
      value: 'su',
      code: 'su_ID'
    },
    {
      name: 'Swahili',
      value: 'sw',
      code: 'sw_KE'
    },
    {
      name: 'Swedish',
      value: 'sv',
      code: 'sv_SE'
    },
    {
      name: 'Tagalog',
      value: 'tl',
      code: 'tl_PH'
    },
    {
      name: 'Tajik',
      value: 'tg',
      code: 'tg_TJ'
    },
    {
      name: 'Tamil',
      value: 'ta',
      code: 'ta_IN'
    },
    {
      name: 'Telugu',
      value: 'te',
      code: 'te_IN'
    },
    {
      name: 'Thai',
      value: 'th',
      code: 'th_TH'
    },
    {
      name: 'Turkish',
      value: 'tr',
      code: 'tr_TR'
    },
    {
      name: 'Ukrainian',
      value: 'uk',
      code: 'uk_UA'
    },
    {
      name: 'Urdu',
      value: 'ur',
      code: 'ur_PK'
    },
    {
      name: 'Uzbek',
      value: 'uz',
      code: 'uz_UZ'
    },
    {
      name: 'Vietnamese',
      value: 'vi',
      code: 'vi_VN'
    },
    {
      name: 'Welsh',
      value: 'cy',
      code: 'cy_GB'
    },
    {
      name: 'Xhosa',
      value: 'xh',
      code: 'xh_ZA'
    },
    {
      name: 'Yiddish',
      value: 'yi',
      code: 'yi_IL'
    },
    {
      name: 'Yoruba',
      value: 'yo',
      code: 'yo'
    },
    {
      name: 'Zulu',
      value: 'zu',
      code: 'zu_ZA'
    }
  ];

export function getLanguagePickerList(selected: string[]): vscode.QuickPickItem[] {
  const getLanguageItems = (languages: Language[]) => 
      languages
        ? languages.map(
          label => new LanguageQuickPickItem(
              label.value,
              label.name,
              selected.includes(label.value)
          )
        )
        : [];

  return getLanguageItems(languages.filter(l => {return l.value !== DEFAULT_LANGUAGE;}));
}

class LanguageQuickPickItem implements vscode.QuickPickItem {

	constructor(
    public readonly code: string, 
    public readonly name: string, 
    public readonly picked: boolean
  ) {
	}

	get label(): string {
		return this.code;
	}

	get description(): string {
		return this.name;
	}

	get alwaysShow(): boolean {
		return this.picked;
	}
}

interface Language {
  name: string,
  value: string
  code: string
}
