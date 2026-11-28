import { IconName } from '@shopivo/shared-ui';

/** Polish labels for option values of theme settings and section properties. */
export const OPTION_LABELS: Record<string, string> = {
  sans: 'Bezszeryfowy (nowoczesny)', serif: 'Szeryfowy (elegancki)', rounded: 'Zaokrąglony (przyjazny)', mono: 'Techniczny',
  editorial: 'Magazynowy (szeryfowe nagłówki + nowoczesny tekst)',
  playful: 'Radosny (zaokrąglone nagłówki + przyjazny tekst)',
  cards: 'Duże kafelki ze zdjęciem', circles: 'Okrągłe zdjęcia z podpisem', cutouts: 'Zdjęcia bez tła (w jednej linii)', grid: 'Siatka', carousel: 'Slider z wyróżnionym produktem',
  flower: 'Kwiatek (zaokrąglone płatki)',
  none: 'Ostre rogi', soft: 'Delikatne', round: 'Mocne',
  plain: 'Bez ramki', bordered: 'Z ramką', shadow: 'Z cieniem',
  classic: 'Logo po lewej, menu obok', centered: 'Logo na środku, menu pod spodem',
  drawer: 'Menu boczne (wysuwane)', bottom: 'Dolny pasek z ikonami',
  yes: 'Tak', no: 'Nie',
  banner: 'Kolorowy baner', split: 'Tekst i zdjęcie obok siebie', image: 'Zdjęcie na całą szerokość',
  small: 'Niski', medium: 'Średni', large: 'Wysoki',
  tiles: 'Kafelki ze zdjęciami', chips: 'Przyciski z nazwami',
  newest: 'Nowości', sale: 'Promocje (największe obniżki)', category: 'Wybrana kategoria (np. nowa kolekcja)',
  bestsellers: 'Bestsellery (najczęściej kupowane)', last_pieces: 'Ostatnie sztuki', top_rated: 'Najlepiej oceniane',
  back_in_stock: 'Wróciły do sprzedaży',
  left: 'Po lewej', right: 'Po prawej', center: 'Wyśrodkowany',
  truck: 'Dostawa', return: 'Zwrot', shield: 'Bezpieczeństwo', card: 'Płatność', gift: 'Prezent', leaf: 'Eko', star: 'Jakość', chat: 'Kontakt',
};

/** Overrides of option labels that depend on the property (same value, different meaning). */
export function optionLabel(prop: string, value: string): string {
  if (prop === 'layout' && value === 'centered') return 'Wyśrodkowany tekst';
  if (prop === 'layout' && value === 'editorial') return 'Magazyn: tekst, dwa przyciski i wysokie zdjęcie';
  if (prop === 'shape' && value === 'rounded') return 'Prostokąt z zaokrągleniem';
  if (prop === 'layout' && value === 'playful') return 'Radosny: duży napis, zdjęcie i falowana krawędź';
  if (prop === 'align' && value === 'left') return 'Do lewej';
  if (prop === 'count') return value;
  if (prop === 'cartStyle') return value === 'page' ? 'Osobna strona koszyka' : 'Wysuwany panel z boku';
  return OPTION_LABELS[value] ?? value;
}

export const SECTION_ICONS: Record<string, IconName> = {
  hero: 'image', usp: 'shieldCheck', categories: 'categories', products: 'products', image_text: 'imagePlus', faq: 'question',
  newsletter: 'mail', reviews: 'star', rich_text: 'pages', blog: 'help', tiles: 'categories', banner: 'image',
};

/** Hints shown in the settings views. */
export const GROUP_HELP: Record<string, string> = {
  'Kolory': 'Kolor główny to przyciski i linki, akcent — wyróżnienia. Tekst musi być dobrze widoczny na tle.',
  'Typografia': 'Krój pisma, zaokrąglenia przycisków i zdjęć oraz wygląd kart produktów w całym sklepie.',
  'Koszyk': 'Wysuwany panel: koszyk otwiera się z boku, a klient zostaje na stronie. Osobna strona: ikona koszyka prowadzi na stronę koszyka, a po dodaniu produktu klient widzi potwierdzenie z linkiem.',
  'Nagłówek': 'Logo, układ górnej belki, pasek informacyjny i to, jak menu wygląda w telefonie.',
  'Stopka': 'Tekst w stopce, zapis na newsletter i linki do mediów społecznościowych.',
};
