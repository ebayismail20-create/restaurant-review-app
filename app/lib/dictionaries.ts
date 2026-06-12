import type { Lang } from './types';

/**
 * Strongly-typed i18n dictionary.
 *
 * Rules for translators / devs:
 * 1. Use \n for forced line breaks in titles (the CSS uses white-space: pre-line).
 *    DO NOT use <br> — we no longer pipe strings through dangerouslySetInnerHTML.
 * 2. Use {varName} for variable interpolation. Render with format() from this file.
 * 3. Every key in the Dict interface MUST be present in every language.
 * 4. Keep tone consistent: warm, polite, second-person singular where the language allows.
 */
export interface Dict {
  // Navigation / chrome
  back: string;
  langGroupLabel: string; // aria-label for the language switcher group
  langEnLabel: string;
  langFiLabel: string;
  langSvLabel: string;

  // Brand
  brandName: string;
  brandTag: string;

  // Template: {table}, {server}
  tableChip: string;

  // Step labels
  step1of2: string;
  step2of2: string;
  lastStep: string;

  // Rating
  ratingTitle: string;
  continue: string;
  continueDisabledLabel: string; // aria-label when Continue is disabled
  rate_1: string;
  rate_2: string;
  rate_3: string;
  rate_4: string;
  rate_5: string;
  starAriaLabel: string; // Template: {n}
  ratingGroupLabel: string; // aria-label for the star radiogroup

  // Improve / sorry
  improveTitle: string;
  sorryTitle: string;
  sorrySub: string;
  selectMultiple: string;
  positiveTagsGroupLabel: string; // aria-label for the positive tag group
  negativeTagsGroupLabel: string; // aria-label for the negative tag group
  tagsSelectedAnnouncement: string; // SR live region. Template: {n}

  // Positive-flow tags
  tag_food: string;
  tag_wait: string;
  tag_service: string;
  tag_clean: string;
  tag_ambiance: string;
  tag_value: string;

  // Negative-flow tags
  tag_food_bad: string;
  tag_service_bad: string;
  tag_wait_bad: string;
  tag_clean_bad: string;
  tag_price_bad: string;
  tag_other_bad: string;

  // Comment field
  commentLabel: string; // sr-only label
  commentPh: string;
  tagsRequired: string; // Sorry-screen validation: pick a tag before Send.

  // Send / CTA
  sendPrivate: string;
  sendRetry: string;
  sendError: string;

  // Platforms
  platformsTitle: string;
  platformsSub: string;
  googleDesc: string;
  tripDesc: string;
  skipReview: string;

  // Success — copy keyed by outcome so the overlay stays honest about what
  // actually happened (posted publicly / private feedback / urgent alert /
  // internal rating only).
  successTitlePosted: string;
  successMsgPosted: string;
  successTitlePrivate: string;
  successMsgPrivate: string;
  successTitleAlerted: string;
  successMsgAlerted: string;
  successTitleRated: string;
  successMsgRated: string;
  alertChipAlerted: string;
  alertChipPrivate: string;
  alertChipPosted: string;
  alertChipRated: string;
  done: string;

  // Contact (anonymous)
  fabLabel: string;
  orLabel: string;
  anonBadge: string;
  anonPrivacyNote: string; // The honest version of what "anonymous" means
  contactTitle: string;
  contactSub: string;
  contactLabel: string; // sr-only label
  contactPh: string;
  contactSend: string;
}

// --- ENGLISH ----------------------------------------------------------------
const en: Dict = {
  back: 'Back',
  langGroupLabel: 'Language',
  langEnLabel: 'Switch to English',
  langFiLabel: 'Vaihda suomeksi',
  langSvLabel: 'Byt till svenska',

  brandName: 'Bistro Nordic',
  brandTag: 'Fine dining · Helsinki',

  tableChip: 'Table {table} · Server: {server}',

  step1of2: 'Step 1 of 2',
  step2of2: 'Step 2 of 2',
  lastStep: 'Last step',

  ratingTitle: 'How was your\nvisit?',
  continue: 'Continue',
  continueDisabledLabel: 'Select a rating to continue',
  rate_1: 'Disappointing',
  rate_2: 'Underwhelming',
  rate_3: 'Pretty good',
  rate_4: 'Wonderful',
  rate_5: 'Exceptional',
  starAriaLabel: 'Rate {n} out of 5 stars',
  ratingGroupLabel: 'Rating, 1 to 5 stars',

  improveTitle: 'Thank you for being here.\nWhere could we be better?',
  sorryTitle: 'We’re truly sorry.\nLet’s make it right.',
  sorrySub: 'Tell us what happened. The manager will respond personally.',
  selectMultiple: 'Select all that apply',
  positiveTagsGroupLabel: 'Areas to improve',
  negativeTagsGroupLabel: 'What went wrong',
  tagsSelectedAnnouncement: '{n} selected',

  tag_food: 'Food',
  tag_wait: 'Wait time',
  tag_service: 'Service',
  tag_clean: 'Cleanliness',
  tag_ambiance: 'Ambiance',
  tag_value: 'Value',

  tag_food_bad: 'Food quality',
  tag_service_bad: 'Poor service',
  tag_wait_bad: 'Long wait',
  tag_clean_bad: 'Not clean',
  tag_price_bad: 'Overpriced',
  tag_other_bad: 'Other',

  commentLabel: 'Your comment',
  commentPh: 'Tell us more (optional)…',
  tagsRequired: 'Please pick what went wrong, or message the manager privately.',

  sendPrivate: 'Send to manager',
  sendRetry: 'Try again',
  sendError: 'Couldn’t send. Please try again.',

  platformsTitle: 'Help future guests\nfind us.',
  platformsSub: 'Pick a platform — thirty seconds, and it means everything to our team.',
  googleDesc: 'Where most guests discover us',
  tripDesc: 'Trusted by international travellers',
  skipReview: 'Maybe next time',

  successTitlePosted: 'Thank you for sharing',
  successMsgPosted:
    'You just made our team’s day. We’re so grateful for kind guests like you.',
  successTitlePrivate: 'Thank you for telling us',
  successMsgPrivate:
    'The manager reads every word. We’ll use this to make your next visit better.',
  // PHASE-2: once real delivery + a response SLA exist, this can promise
  // them again. Until then the copy must not claim what we can't honor.
  successTitleAlerted: 'The manager is on it',
  successMsgAlerted:
    'Your feedback goes straight to the manager, who reviews every message personally.',
  successTitleRated: 'Thank you for the rating',
  successMsgRated:
    'We’re so glad you enjoyed your visit. We hope to see you again soon.',
  alertChipAlerted: 'Manager notified just now',
  alertChipPrivate: 'Saved to manager inbox',
  alertChipPosted: 'Thank you for sharing',
  alertChipRated: '5-star rating saved',
  done: 'Done',

  fabLabel: 'Contact manager anonymously',
  orLabel: 'Or',
  anonBadge: 'NO NAME, NO EMAIL',
  anonPrivacyNote:
    'We don’t ask for your name or email. We do log the table and the time so the manager can follow up properly.',
  contactTitle: 'Message the\nmanager directly',
  contactSub: 'Skip the comment card. Tell the manager exactly what they need to know.',
  contactLabel: 'Your message to the manager',
  contactPh: 'Write your message here…',
  contactSend: 'Send privately',
};

// --- FINNISH ----------------------------------------------------------------
const fi: Dict = {
  back: 'Takaisin',
  langGroupLabel: 'Kieli',
  langEnLabel: 'Switch to English',
  langFiLabel: 'Vaihda suomeksi',
  langSvLabel: 'Byt till svenska',

  brandName: 'Bistro Nordic',
  brandTag: 'Fine dining · Helsinki',

  tableChip: 'Pöytä {table} · Tarjoilija: {server}',

  step1of2: 'Vaihe 1/2',
  step2of2: 'Vaihe 2/2',
  lastStep: 'Viimeinen vaihe',

  ratingTitle: 'Millainen oli\nvierailusi?',
  continue: 'Jatka',
  continueDisabledLabel: 'Valitse arvosana jatkaaksesi',
  rate_1: 'Pettymys',
  rate_2: 'Latteahko',
  rate_3: 'Ihan kiva',
  rate_4: 'Mahtava',
  rate_5: 'Erinomainen',
  starAriaLabel: 'Anna {n} tähteä viidestä',
  ratingGroupLabel: 'Arvosana, 1–5 tähteä',

  improveTitle: 'Kiitos käynnistäsi.\nMissä olisimme voineet onnistua paremmin?',
  sorryTitle: 'Olemme todella\npahoillamme.',
  sorrySub: 'Kerro mikä meni pieleen. Päällikkö vastaa henkilökohtaisesti.',
  selectMultiple: 'Valitse kaikki sopivat',
  positiveTagsGroupLabel: 'Parannuskohteet',
  negativeTagsGroupLabel: 'Mikä meni pieleen',
  tagsSelectedAnnouncement: 'Valittu {n}',

  tag_food: 'Ruoka',
  tag_wait: 'Odotusaika',
  tag_service: 'Palvelu',
  tag_clean: 'Siisteys',
  tag_ambiance: 'Tunnelma',
  tag_value: 'Hinta-laatu',

  tag_food_bad: 'Ruoan laatu',
  tag_service_bad: 'Huono palvelu',
  tag_wait_bad: 'Pitkä odotus',
  tag_clean_bad: 'Ei siistiä',
  tag_price_bad: 'Liian kallis',
  tag_other_bad: 'Muu',

  commentLabel: 'Kommenttisi',
  commentPh: 'Kerro lisää (valinnainen)…',
  tagsRequired: 'Valitse mikä meni pieleen tai lähetä viesti päällikölle.',

  sendPrivate: 'Lähetä päällikölle',
  sendRetry: 'Yritä uudelleen',
  sendError: 'Lähetys epäonnistui. Yritä uudelleen.',

  platformsTitle: 'Auta tulevia vieraita\nlöytämään meidät.',
  platformsSub: 'Valitse alusta — kolmekymmentä sekuntia, ja se merkitsee tiimillemme paljon.',
  googleDesc: 'Yleisin paikka, josta meidät löydetään',
  tripDesc: 'Kansainvälisten matkailijoiden suosima',
  skipReview: 'Ehkä ensi kerralla',

  successTitlePosted: 'Kiitos jakamisesta',
  successMsgPosted:
    'Teit juuri tiimimme päivästä. Olemme äärettömän kiitollisia ystävällisistä vieraista.',
  successTitlePrivate: 'Kiitos kun kerroit',
  successMsgPrivate:
    'Päällikkö lukee jokaisen sanan. Käytämme palautteesi seuraavan vierailusi parantamiseen.',
  successTitleAlerted: 'Päällikkö hoitaa asian',
  successMsgAlerted:
    'Palautteesi menee suoraan päällikölle, joka käy jokaisen viestin läpi henkilökohtaisesti.',
  successTitleRated: 'Kiitos arvosanasta',
  successMsgRated:
    'Hienoa, että nautit vierailustasi. Toivottavasti tapaamme pian uudelleen.',
  alertChipAlerted: 'Päällikkö hälytetty juuri nyt',
  alertChipPrivate: 'Tallennettu päällikön postilaatikkoon',
  alertChipPosted: 'Kiitos jakamisesta',
  alertChipRated: '5 tähden arvio tallennettu',
  done: 'Valmis',

  fabLabel: 'Ota yhteyttä anonyymisti',
  orLabel: 'Tai',
  anonBadge: 'EI NIMEÄ, EI SÄHKÖPOSTIA',
  anonPrivacyNote:
    'Emme kysy nimeäsi tai sähköpostiasi. Tallennamme pöydän ja kellonajan, jotta päällikkö voi seurata palautteen kunnolla.',
  contactTitle: 'Viesti suoraan\npäällikölle',
  contactSub: 'Ohita palautelomake. Kerro päällikölle juuri se, mitä hänen tulee tietää.',
  contactLabel: 'Viestisi päällikölle',
  contactPh: 'Kirjoita viestisi tähän…',
  contactSend: 'Lähetä luottamuksellisesti',
};

// --- SWEDISH ----------------------------------------------------------------
const sv: Dict = {
  back: 'Tillbaka',
  langGroupLabel: 'Språk',
  langEnLabel: 'Switch to English',
  langFiLabel: 'Vaihda suomeksi',
  langSvLabel: 'Byt till svenska',

  brandName: 'Bistro Nordic',
  brandTag: 'Fine dining · Helsingfors',

  tableChip: 'Bord {table} · Servitör: {server}',

  step1of2: 'Steg 1 av 2',
  step2of2: 'Steg 2 av 2',
  lastStep: 'Sista steget',

  ratingTitle: 'Hur var ditt\nbesök?',
  continue: 'Fortsätt',
  continueDisabledLabel: 'Välj ett betyg för att fortsätta',
  rate_1: 'Besvikande',
  rate_2: 'Sådär',
  rate_3: 'Helt okej',
  rate_4: 'Underbart',
  rate_5: 'Utmärkt',
  starAriaLabel: 'Ge {n} av 5 stjärnor',
  ratingGroupLabel: 'Betyg, 1 till 5 stjärnor',

  improveTitle: 'Tack för att du var här.\nVar kunde vi varit bättre?',
  sorryTitle: 'Vi är verkligen\nledsna.',
  sorrySub: 'Berätta vad som hände. Chefen svarar personligen.',
  selectMultiple: 'Välj alla som passar',
  positiveTagsGroupLabel: 'Områden att förbättra',
  negativeTagsGroupLabel: 'Vad gick fel',
  tagsSelectedAnnouncement: '{n} valda',

  tag_food: 'Mat',
  tag_wait: 'Väntetid',
  tag_service: 'Service',
  tag_clean: 'Renlighet',
  tag_ambiance: 'Atmosfär',
  tag_value: 'Värde',

  tag_food_bad: 'Matens kvalitet',
  tag_service_bad: 'Dålig service',
  tag_wait_bad: 'Lång väntetid',
  tag_clean_bad: 'Inte rent',
  tag_price_bad: 'Överprisat',
  tag_other_bad: 'Annat',

  commentLabel: 'Din kommentar',
  commentPh: 'Berätta mer (valfritt)…',
  tagsRequired: 'Välj vad som gick fel, eller skicka ett privat meddelande.',

  sendPrivate: 'Skicka till chefen',
  sendRetry: 'Försök igen',
  sendError: 'Kunde inte skicka. Försök igen.',

  platformsTitle: 'Hjälp framtida gäster\natt hitta oss.',
  platformsSub: 'Välj en plattform — trettio sekunder, och det betyder allt för vårt team.',
  googleDesc: 'Där flest gäster hittar oss',
  tripDesc: 'Förtroende av internationella resenärer',
  skipReview: 'Kanske nästa gång',

  successTitlePosted: 'Tack för att du delar',
  successMsgPosted:
    'Du gjorde just vårt teams dag. Vi är så tacksamma för snälla gäster som dig.',
  successTitlePrivate: 'Tack för att du berättade',
  successMsgPrivate:
    'Chefen läser varje ord. Vi använder din feedback för att göra ditt nästa besök bättre.',
  successTitleAlerted: 'Chefen tar tag i det',
  successMsgAlerted:
    'Din feedback går direkt till chefen, som personligen går igenom varje meddelande.',
  successTitleRated: 'Tack för betyget',
  successMsgRated:
    'Vi är så glada att du trivdes hos oss. Vi hoppas se dig igen snart.',
  alertChipAlerted: 'Chefen meddelad just nu',
  alertChipPrivate: 'Sparat i chefens inkorg',
  alertChipPosted: 'Tack för att du delar',
  alertChipRated: '5-stjärnigt betyg sparat',
  done: 'Klar',

  fabLabel: 'Kontakta chefen anonymt',
  orLabel: 'Eller',
  anonBadge: 'INGET NAMN, INGEN E-POST',
  anonPrivacyNote:
    'Vi frågar inte efter ditt namn eller din e-post. Vi loggar bordet och tiden så att chefen kan följa upp ordentligt.',
  contactTitle: 'Skicka meddelande\ndirekt till chefen',
  contactSub: 'Hoppa över kommentarsformuläret. Berätta för chefen exakt vad hen behöver veta.',
  contactLabel: 'Ditt meddelande till chefen',
  contactPh: 'Skriv ditt meddelande här…',
  contactSend: 'Skicka privat',
};

export const i18n: Record<Lang, Dict> = { en, fi, sv };

/**
 * Replace {placeholders} in a template string with values.
 * Unknown placeholders are left as-is so missing data is visible in QA.
 */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const v = vars[key];
    return v === undefined ? match : String(v);
  });
}
