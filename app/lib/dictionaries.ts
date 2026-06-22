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

  // Step labels
  step1of2: string;
  step2of2: string;
  lastStep: string;

  // Rating
  ratingTitle: string;
  ratingHint: string; // quiet "tap a star" invitation, unrated state only
  effortCue: string; // effort-setting pill under the stars ("20 seconds · 2 steps")
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
  tag_other: string;
  youGaveStars: string;

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
  commentPrivacy: string; // GDPR microcopy under the comment box
  tagsRequired: string; // Sorry-screen validation: pick a tag before Send.

  // Send / CTA
  sendPrivate: string;
  sendRetry: string;
  sendError: string;

  // Platforms
  platformsTitle: string;
  platformsSub: string;
  // Neutral variant shown when a 1-4★ guest reaches the platforms screen via
  // "share publicly too" — no presumption they were delighted.
  platformsTitleNeutral: string;
  platformsSubNeutral: string;
  platformCardCta: string; // action sub-line on each review-platform card
  reviewStarterHint: string; // calm nudge to beat the blank-Google-box
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
  sharePublicAlso: string; // secondary CTA: offer a public review to every guest
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

  step1of2: 'Step 1 of 2',
  step2of2: 'Step 2 of 2',
  lastStep: 'Last step',

  ratingTitle: 'How was your\nvisit?',
  ratingHint: 'Tap a star to rate',
  effortCue: '20 seconds · 2 quick steps',
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
  tag_other: 'Other',
  youGaveStars: 'You gave us {n} stars',

  tag_food_bad: 'Food quality',
  tag_service_bad: 'Poor service',
  tag_wait_bad: 'Long wait',
  tag_clean_bad: 'Not clean',
  tag_price_bad: 'Overpriced',
  tag_other_bad: 'Other',

  commentLabel: 'Your comment',
  commentPh: 'Tell us more (optional)…',
  commentPrivacy: 'Private to the venue · auto-deleted after 90 days',
  tagsRequired: 'Please pick what went wrong, or message the manager privately.',

  sendPrivate: 'Send to manager',
  sendRetry: 'Try again',
  sendError: 'Couldn’t send. Please try again.',

  platformsTitle: 'You made\nour day!',
  platformsSub: 'A few kind words help our small team more than you’d think — it only takes about 30 seconds.',
  platformsTitleNeutral: 'Share your\nexperience',
  platformsSubNeutral: 'Your honest review helps other guests know what to expect — about 30 seconds.',
  platformCardCta: 'Leave a review · 30 sec',
  reviewStarterHint: 'Not sure what to write? A sentence or two is perfect.',
  skipReview: 'Maybe next time',

  // Tapping a platform only OPENS the review page — we can't know the guest
  // actually posted, so this copy must not claim they did. It thanks them for
  // the visit and frames reviews generally, true either way.
  successTitlePosted: 'Thank you!',
  successMsgPosted:
    'Every review helps future guests discover us. We’d love to welcome you back soon.',
  successTitlePrivate: 'Thank you for telling us',
  successMsgPrivate:
    'The manager reads every word. We’ll use this to make your next visit better.',
  // PHASE-2: once real delivery + a response SLA exist, this can promise
  // them again. Until then the copy must not claim what we can't honor.
  successTitleAlerted: 'The manager is on it',
  successMsgAlerted:
    'Your feedback goes straight to the manager, who reviews every message personally.',
  // Shown ONLY when a 5★ guest taps "Maybe next time" (declines a public
  // review). Must answer the "no" graciously — not thank them for a "rating"
  // they don't perceive submitting. Honest: 5★ means they did enjoy it.
  successTitleRated: 'Thanks for visiting!',
  successMsgRated:
    'No problem at all — we’re so glad you enjoyed your time with us. We hope to see you again soon.',
  sharePublicAlso: 'Share publicly',
  done: 'Done',

  fabLabel: 'Contact manager anonymously',
  orLabel: 'Or',
  anonBadge: 'NO NAME, NO EMAIL',
  anonPrivacyNote:
    'We don’t ask for your name or email. We log the table and the time so the manager can follow up — and messages are auto-deleted after 90 days.',
  contactTitle: 'Message the\nmanager directly',
  contactSub: 'Prefer to write it yourself? Tell the manager exactly what happened.',
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

  step1of2: 'Vaihe 1/2',
  step2of2: 'Vaihe 2/2',
  lastStep: 'Viimeinen vaihe',

  ratingTitle: 'Millainen oli\nvierailusi?',
  ratingHint: 'Napauta tähteä',
  effortCue: '20 sekuntia · 2 nopeaa vaihetta',
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
  tag_other: 'Muu',
  youGaveStars: 'Annoit meille {n} tähteä',

  tag_food_bad: 'Ruoan laatu',
  tag_service_bad: 'Huono palvelu',
  tag_wait_bad: 'Pitkä odotus',
  tag_clean_bad: 'Ei siistiä',
  tag_price_bad: 'Liian kallis',
  tag_other_bad: 'Muu',

  commentLabel: 'Kommenttisi',
  commentPh: 'Kerro lisää (valinnainen)…',
  commentPrivacy: 'Vain ravintolalle · poistetaan 90 päivän jälkeen',
  tagsRequired: 'Valitse mikä meni pieleen tai lähetä viesti päällikölle.',

  sendPrivate: 'Lähetä päällikölle',
  sendRetry: 'Yritä uudelleen',
  sendError: 'Lähetys epäonnistui. Yritä uudelleen.',

  platformsTitle: 'Ihanaa\nkuulla!',
  platformsSub: 'Muutama ystävällinen sana auttaa pientä tiimiämme enemmän kuin uskotkaan — se vie vain noin 30 sekuntia.',
  platformsTitleNeutral: 'Jaa\nkokemuksesi',
  platformsSubNeutral: 'Rehellinen arviosi auttaa muita vieraita tietämään, mitä odottaa — noin 30 sekuntia.',
  platformCardCta: 'Jätä arvio · 30 s',
  reviewStarterHint: 'Etkö tiedä mitä kirjoittaa? Pari lausetta riittää hyvin.',
  skipReview: 'Ehkä ensi kerralla',

  successTitlePosted: 'Kiitos!',
  successMsgPosted:
    'Jokainen arvio auttaa tulevia vieraita löytämään meidät. Tervetuloa uudelleen pian.',
  successTitlePrivate: 'Kiitos kun kerroit',
  successMsgPrivate:
    'Päällikkö lukee jokaisen sanan. Käytämme palautteesi seuraavan vierailusi parantamiseen.',
  successTitleAlerted: 'Päällikkö hoitaa asian',
  successMsgAlerted:
    'Palautteesi menee suoraan päällikölle, joka käy jokaisen viestin läpi henkilökohtaisesti.',
  successTitleRated: 'Kiitos käynnistä!',
  successMsgRated:
    'Ei hätää — olemme iloisia, että viihdyit. Toivottavasti näemme taas pian.',
  sharePublicAlso: 'Jaa julkisesti',
  done: 'Valmis',

  fabLabel: 'Ota yhteyttä anonyymisti',
  orLabel: 'Tai',
  anonBadge: 'EI NIMEÄ, EI SÄHKÖPOSTIA',
  anonPrivacyNote:
    'Emme kysy nimeäsi tai sähköpostiasi. Tallennamme pöydän ja kellonajan, jotta päällikkö voi seurata palautetta — viestit poistetaan 90 päivän kuluttua.',
  contactTitle: 'Viesti suoraan\npäällikölle',
  contactSub: 'Kirjoitatko mieluummin itse? Kerro päällikölle tarkalleen, mitä tapahtui.',
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

  step1of2: 'Steg 1 av 2',
  step2of2: 'Steg 2 av 2',
  lastStep: 'Sista steget',

  ratingTitle: 'Hur var ditt\nbesök?',
  ratingHint: 'Tryck på en stjärna',
  effortCue: '20 sekunder · 2 snabba steg',
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
  tag_other: 'Annat',
  youGaveStars: 'Du gav oss {n} stjärnor',

  tag_food_bad: 'Matens kvalitet',
  tag_service_bad: 'Dålig service',
  tag_wait_bad: 'Lång väntetid',
  tag_clean_bad: 'Inte rent',
  tag_price_bad: 'Överprisat',
  tag_other_bad: 'Annat',

  commentLabel: 'Din kommentar',
  commentPh: 'Berätta mer (valfritt)…',
  commentPrivacy: 'Privat för restaurangen · raderas efter 90 dagar',
  tagsRequired: 'Välj vad som gick fel, eller skicka ett privat meddelande.',

  sendPrivate: 'Skicka till chefen',
  sendRetry: 'Försök igen',
  sendError: 'Kunde inte skicka. Försök igen.',

  platformsTitle: 'Vad roligt\natt höra!',
  platformsSub: 'Några vänliga ord hjälper vårt lilla team mer än du tror — det tar bara cirka 30 sekunder.',
  platformsTitleNeutral: 'Dela din\nupplevelse',
  platformsSubNeutral: 'Ditt ärliga omdöme hjälper andra gäster att veta vad de kan förvänta sig — cirka 30 sekunder.',
  platformCardCta: 'Lämna ett omdöme · 30 sek',
  reviewStarterHint: 'Vet du inte vad du ska skriva? Ett par meningar räcker fint.',
  skipReview: 'Kanske nästa gång',

  successTitlePosted: 'Tack!',
  successMsgPosted:
    'Varje omdöme hjälper framtida gäster att hitta oss. Välkommen tillbaka snart.',
  successTitlePrivate: 'Tack för att du berättade',
  successMsgPrivate:
    'Chefen läser varje ord. Vi använder din feedback för att göra ditt nästa besök bättre.',
  successTitleAlerted: 'Chefen tar tag i det',
  successMsgAlerted:
    'Din feedback går direkt till chefen, som personligen går igenom varje meddelande.',
  successTitleRated: 'Tack för besöket!',
  successMsgRated:
    'Inga problem alls — vi är så glada att du trivdes hos oss. Vi hoppas att vi ses snart igen.',
  sharePublicAlso: 'Dela offentligt',
  done: 'Klar',

  fabLabel: 'Kontakta chefen anonymt',
  orLabel: 'Eller',
  anonBadge: 'INGET NAMN, INGEN E-POST',
  anonPrivacyNote:
    'Vi frågar inte efter ditt namn eller din e-post. Vi loggar bordet och tiden så att chefen kan följa upp — meddelanden raderas efter 90 dagar.',
  contactTitle: 'Skicka meddelande\ndirekt till chefen',
  contactSub: 'Skriver du hellre själv? Berätta för chefen exakt vad som hände.',
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
