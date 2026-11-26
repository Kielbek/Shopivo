import { ProductType, StoreIndustry } from '@shopivo/shared-models';
import { IconName } from '@shopivo/shared-ui';

/** A ready-made variant option (e.g. clothing sizes) the merchant can add with one click and then trim. */
export interface OptionPreset {
  id: string;
  /** Option name as it appears in the store, e.g. "Rozmiar". */
  name: string;
  /** Short label of the preset in the panel, e.g. "Rozmiary odzieży (XS–XXL)". */
  label: string;
  values: string[];
}

/** A starter category tree (names only; created in order, parents first). */
export interface StarterCategory {
  name: string;
  children?: string[];
}

export interface Industry {
  id: StoreIndustry;
  label: string;
  icon: IconName;
  /** Examples shown under the label to help choose. */
  hint: string;
  /** Presets offered first in the variants card (all presets stay available). */
  presets: string[];
  categories: StarterCategory[];
  productType?: ProductType;
  /** Typical parcel (id of a PACKAGE_PRESETS entry) suggested for new products. */
  parcel?: string;
}

/** Common Polish colour names with swatches (used for the colour option). */
export const COLOR_SWATCHES: Record<string, string> = {
  'Czarny': '#111111', 'Biały': '#ffffff', 'Szary': '#9ca3af', 'Grafitowy': '#374151', 'Granatowy': '#1e3a8a', 'Niebieski': '#2563eb',
  'Błękitny': '#7dd3fc', 'Turkusowy': '#14b8a6', 'Zielony': '#16a34a', 'Oliwkowy': '#6b7035', 'Miętowy': '#a7f3d0',
  'Żółty': '#facc15', 'Musztardowy': '#ca8a04', 'Pomarańczowy': '#f97316', 'Czerwony': '#dc2626', 'Bordowy': '#7f1d1d',
  'Różowy': '#f9a8d4', 'Pudrowy róż': '#f3d1d1', 'Fioletowy': '#7c3aed', 'Liliowy': '#c4b5fd', 'Brązowy': '#78350f',
  'Beżowy': '#e7d8bf', 'Kremowy': '#fdf6e3', 'Ecru': '#f2ead3', 'Khaki': '#a3a27a', 'Złoty': '#d4af37', 'Srebrny': '#c0c0c0',
  'Miedziany': '#b87333', 'Wielokolorowy': 'conic-gradient(#dc2626, #facc15, #16a34a, #2563eb, #7c3aed, #dc2626)',
};

export const OPTION_PRESETS: OptionPreset[] = [
  { id: 'size', name: 'Rozmiar', label: 'Rozmiary odzieży (XS–XXL)', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { id: 'size-eu', name: 'Rozmiar', label: 'Rozmiary damskie EU (34–46)', values: ['34', '36', '38', '40', '42', '44', '46'] },
  { id: 'size-kids', name: 'Rozmiar', label: 'Rozmiary dziecięce (56–140 cm)', values: ['56', '62', '68', '74', '80', '86', '92', '98', '104', '110', '116', '122', '128', '134', '140'] },
  { id: 'shoes', name: 'Rozmiar', label: 'Rozmiary obuwia (36–46)', values: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'] },
  { id: 'shoes-kids', name: 'Rozmiar', label: 'Obuwie dziecięce (20–35)', values: ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35'] },
  { id: 'color', name: 'Kolor', label: 'Kolory', values: ['Czarny', 'Biały', 'Szary', 'Granatowy', 'Beżowy'] },
  { id: 'material', name: 'Materiał', label: 'Materiał (tkaniny)', values: ['Bawełna', 'Len', 'Wełna', 'Poliester'] },
  { id: 'finish', name: 'Wykończenie', label: 'Wykończenie mebli', values: ['Dąb naturalny', 'Orzech', 'Biały mat', 'Czarny mat'] },
  { id: 'dimensions', name: 'Wymiar', label: 'Wymiary (cm)', values: ['40 × 60 cm', '60 × 90 cm', '80 × 150 cm', '120 × 170 cm', '160 × 230 cm'] },
  { id: 'capacity', name: 'Pojemność', label: 'Pojemność kosmetyków (ml)', values: ['15 ml', '30 ml', '50 ml', '100 ml'] },
  { id: 'volume', name: 'Pojemność', label: 'Pojemność płynów (l)', values: ['0,5 l', '1 l', '5 l'] },
  { id: 'shade', name: 'Odcień', label: 'Odcienie (kosmetyki)', values: ['Jasny', 'Naturalny', 'Beżowy', 'Ciemny'] },
  { id: 'scent', name: 'Zapach', label: 'Zapachy', values: ['Bezzapachowy', 'Lawenda', 'Cytrusy', 'Wanilia'] },
  { id: 'weight', name: 'Gramatura', label: 'Gramatura (g / kg)', values: ['100 g', '250 g', '500 g', '1 kg'] },
  { id: 'pack', name: 'Opakowanie', label: 'Liczba sztuk w opakowaniu', values: ['1 szt.', '3 szt.', '5 szt.', '10 szt.'] },
  { id: 'storage', name: 'Pamięć', label: 'Pamięć wbudowana (GB)', values: ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'] },
  { id: 'ram', name: 'Pamięć RAM', label: 'Pamięć RAM', values: ['8 GB', '16 GB', '32 GB', '64 GB'] },
  { id: 'warranty', name: 'Gwarancja', label: 'Okres gwarancji', values: ['24 miesiące', '36 miesięcy'] },
  { id: 'ring', name: 'Rozmiar', label: 'Rozmiary pierścionków (10–20)', values: ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'] },
  { id: 'metal', name: 'Kruszec', label: 'Kruszec / próba', values: ['Srebro 925', 'Złoto 333', 'Złoto 585', 'Stal chirurgiczna'] },
  { id: 'chain', name: 'Długość', label: 'Długość łańcuszka', values: ['40 cm', '45 cm', '50 cm', '60 cm'] },
  { id: 'book', name: 'Wydanie', label: 'Wydanie książki', values: ['Okładka miękka', 'Okładka twarda', 'E-book', 'Audiobook'] },
  { id: 'platform', name: 'Platforma', label: 'Platformy gier', values: ['PC', 'PlayStation 5', 'Xbox Series X|S', 'Nintendo Switch'] },
  { id: 'age', name: 'Wiek', label: 'Przedział wieku', values: ['0+', '3+', '6+', '9+', '12+'] },
  { id: 'pet-size', name: 'Rozmiar', label: 'Rozmiar zwierzęcia', values: ['XS', 'S', 'M', 'L', 'XL'] },
  { id: 'paper', name: 'Format', label: 'Formaty papieru', values: ['A6', 'A5', 'A4', 'A3'] },
  { id: 'power', name: 'Zasilanie', label: 'Zasilanie narzędzi', values: ['Akumulatorowe 18 V', 'Sieciowe 230 V'] },
  { id: 'license', name: 'Licencja', label: 'Licencje (produkty cyfrowe)', values: ['Osobista', 'Komercyjna', 'Rozszerzona'] },
  { id: 'format', name: 'Format pliku', label: 'Formaty plików', values: ['PDF', 'EPUB', 'MP3', 'ZIP'] },
  { id: 'frame', name: 'Rozmiar ramy', label: 'Rozmiar ramy roweru', values: ['S', 'M', 'L', 'XL'] },
  { id: 'people', name: 'Liczba osób', label: 'Liczba osób (namioty)', values: ['1-os.', '2-os.', '3-os.', '4-os.'] },
  { id: 'plant-size', name: 'Wielkość', label: 'Wielkość sadzonki', values: ['P9', 'P11', 'C2', 'C5'] },
];

/** Typical parcel sizes for the shipping card (weight in grams, dimensions in millimetres). */
export interface PackagePreset { id: string; label: string; hint: string; weightGrams: number; lengthMm: number; widthMm: number; heightMm: number; }

export const PACKAGE_PRESETS: PackagePreset[] = [
  { id: 'envelope', label: 'Koperta', hint: 'np. biżuteria, karty, cienka odzież', weightGrams: 200, lengthMm: 250, widthMm: 180, heightMm: 20 },
  { id: 'small', label: 'Mała paczka', hint: 'np. kosmetyki, książka, akcesoria', weightGrams: 800, lengthMm: 250, widthMm: 200, heightMm: 80 },
  { id: 'medium', label: 'Średnia paczka', hint: 'np. buty, odzież, mała elektronika', weightGrams: 2000, lengthMm: 380, widthMm: 280, heightMm: 150 },
  { id: 'large', label: 'Duża paczka', hint: 'np. drobne AGD, zestawy, kilka produktów', weightGrams: 8000, lengthMm: 600, widthMm: 400, heightMm: 350 },
  { id: 'xl', label: 'Gabaryt', hint: 'np. meble, rowery — zwykle tylko kurier', weightGrams: 25000, lengthMm: 1200, widthMm: 600, heightMm: 500 },
];

export const INDUSTRIES: Industry[] = [
  { id: 'FASHION', label: 'Odzież', icon: 'shirt', hint: 'ubrania damskie, męskie, bielizna', presets: ['size', 'color', 'size-eu', 'material'], parcel: 'medium',
    categories: [{ name: 'Damskie', children: ['Sukienki', 'Bluzki i koszule', 'Spodnie', 'Kurtki i płaszcze'] },
      { name: 'Męskie', children: ['Koszulki', 'Koszule', 'Spodnie', 'Kurtki'] }, { name: 'Bielizna' }, { name: 'Wyprzedaż' }] },
  { id: 'FOOTWEAR', label: 'Obuwie', icon: 'footprints', hint: 'buty damskie, męskie, dziecięce', presets: ['shoes', 'color', 'shoes-kids'], parcel: 'medium',
    categories: [{ name: 'Damskie', children: ['Sneakersy', 'Botki', 'Szpilki', 'Sandały'] },
      { name: 'Męskie', children: ['Sneakersy', 'Półbuty', 'Trzewiki'] }, { name: 'Dziecięce' }, { name: 'Akcesoria do obuwia' }] },
  { id: 'ELECTRONICS', label: 'Elektronika', icon: 'smartphone', hint: 'telefony, RTV, audio, smart home', presets: ['color', 'storage', 'warranty'], parcel: 'small',
    categories: [{ name: 'Smartfony i telefony', children: ['Smartfony', 'Etui i szkła', 'Ładowarki'] },
      { name: 'Audio', children: ['Słuchawki', 'Głośniki'] }, { name: 'RTV', children: ['Telewizory', 'Soundbary'] }, { name: 'Smart home' }] },
  { id: 'COMPUTERS', label: 'Komputery', icon: 'monitor', hint: 'laptopy, podzespoły, akcesoria', presets: ['ram', 'storage', 'color', 'warranty'], parcel: 'medium',
    categories: [{ name: 'Laptopy' }, { name: 'Komputery stacjonarne' }, { name: 'Podzespoły', children: ['Karty graficzne', 'Procesory', 'Pamięć RAM', 'Dyski'] },
      { name: 'Akcesoria', children: ['Myszy', 'Klawiatury', 'Monitory'] }] },
  { id: 'FURNITURE', label: 'Meble', icon: 'sofa', hint: 'salon, sypialnia, biuro, ogród', presets: ['finish', 'color', 'dimensions', 'material'], parcel: 'xl',
    categories: [{ name: 'Salon', children: ['Sofy i narożniki', 'Stoliki', 'Regały'] }, { name: 'Sypialnia', children: ['Łóżka', 'Szafy', 'Komody'] },
      { name: 'Jadalnia', children: ['Stoły', 'Krzesła'] }, { name: 'Biuro' }] },
  { id: 'HOME', label: 'Dom i wnętrza', icon: 'house', hint: 'dekoracje, tekstylia, kuchnia', presets: ['color', 'dimensions', 'material'], parcel: 'medium',
    categories: [{ name: 'Dekoracje', children: ['Wazony', 'Świece', 'Obrazy i plakaty'] }, { name: 'Tekstylia', children: ['Pościel', 'Ręczniki', 'Dywany'] },
      { name: 'Kuchnia i jadalnia', children: ['Naczynia', 'Sztućce'] }, { name: 'Oświetlenie' }] },
  { id: 'GARDEN', label: 'Ogród', icon: 'sprout', hint: 'rośliny, nasiona, narzędzia ogrodowe', presets: ['plant-size', 'weight', 'pack'], parcel: 'medium',
    categories: [{ name: 'Rośliny', children: ['Kwiaty', 'Krzewy', 'Drzewka owocowe'] }, { name: 'Nasiona' }, { name: 'Nawozy i podłoża' },
      { name: 'Narzędzia ogrodowe' }, { name: 'Meble ogrodowe' }] },
  { id: 'COSMETICS', label: 'Kosmetyki', icon: 'sparkles', hint: 'pielęgnacja, makijaż, włosy', presets: ['capacity', 'shade', 'scent'], parcel: 'small',
    categories: [{ name: 'Pielęgnacja twarzy', children: ['Kremy', 'Serum', 'Oczyszczanie'] }, { name: 'Makijaż', children: ['Twarz', 'Oczy', 'Usta'] },
      { name: 'Włosy' }, { name: 'Ciało' }, { name: 'Zestawy' }] },
  { id: 'PERFUMES', label: 'Perfumy', icon: 'sprayCan', hint: 'perfumy, wody toaletowe, mgiełki', presets: ['capacity'], parcel: 'small',
    categories: [{ name: 'Damskie' }, { name: 'Męskie' }, { name: 'Unisex' }, { name: 'Zestawy upominkowe' }, { name: 'Miniatury' }] },
  { id: 'JEWELLER', label: 'Jubiler', icon: 'gem', hint: 'złoto, srebro, zegarki, obrączki', presets: ['metal', 'ring', 'chain'], parcel: 'envelope',
    categories: [{ name: 'Pierścionki', children: ['Zaręczynowe', 'Obrączki'] }, { name: 'Naszyjniki' }, { name: 'Kolczyki' }, { name: 'Bransoletki' }, { name: 'Zegarki' }] },
  { id: 'SPORTS', label: 'Sport', icon: 'dumbbell', hint: 'fitness, rowery, odzież sportowa', presets: ['size', 'color', 'frame', 'weight'], parcel: 'medium',
    categories: [{ name: 'Fitness i siłownia', children: ['Hantle i obciążenia', 'Maty', 'Akcesoria'] }, { name: 'Rowery i akcesoria' },
      { name: 'Odzież sportowa' }, { name: 'Sporty zimowe' }, { name: 'Suplementy' }] },
  { id: 'AUTOMOTIVE', label: 'Motoryzacja', icon: 'car', hint: 'części, akcesoria, chemia', presets: ['volume', 'pack'], parcel: 'medium',
    categories: [{ name: 'Części samochodowe' }, { name: 'Akcesoria', children: ['Wnętrze', 'Bagażniki', 'Elektronika samochodowa'] },
      { name: 'Chemia i kosmetyki' }, { name: 'Opony i felgi' }, { name: 'Oleje i płyny' }] },
  { id: 'PETS', label: 'Zoologia', icon: 'paw', hint: 'karma i akcesoria dla zwierząt', presets: ['weight', 'pet-size', 'color'], parcel: 'medium',
    categories: [{ name: 'Psy', children: ['Karma', 'Smycze i obroże', 'Legowiska', 'Zabawki'] }, { name: 'Koty', children: ['Karma', 'Żwirek', 'Drapaki'] },
      { name: 'Gryzonie' }, { name: 'Akwarystyka' }] },
  { id: 'TOYS', label: 'Zabawki', icon: 'toy', hint: 'klocki, gry planszowe, pluszaki', presets: ['age', 'color'], parcel: 'medium',
    categories: [{ name: 'Klocki' }, { name: 'Gry planszowe' }, { name: 'Lalki i figurki' }, { name: 'Pluszaki' }, { name: 'Zabawki edukacyjne' }] },
  { id: 'KIDS', label: 'Dla dzieci', icon: 'baby', hint: 'ubranka, wózki, akcesoria', presets: ['size-kids', 'color', 'shoes-kids'], parcel: 'medium',
    categories: [{ name: 'Ubranka', children: ['Niemowlęce', 'Dziewczęce', 'Chłopięce'] }, { name: 'Wózki i foteliki' }, { name: 'Karmienie' },
      { name: 'Pokój dziecka' }, { name: 'Kąpiel i pielęgnacja' }] },
  { id: 'GROCERY', label: 'Sklep spożywczy', icon: 'basket', hint: 'artykuły spożywcze, napoje', presets: ['weight', 'pack', 'volume'], parcel: 'medium',
    categories: [{ name: 'Pieczywo' }, { name: 'Nabiał' }, { name: 'Napoje' }, { name: 'Słodycze i przekąski' }, { name: 'Produkty sypkie' }] },
  { id: 'HOUSEHOLD', label: 'Artykuły przemysłowe', icon: 'wrench', hint: 'chemia, sprzątanie, drobne AGD', presets: ['volume', 'pack'], parcel: 'medium',
    categories: [{ name: 'Chemia gospodarcza' }, { name: 'Sprzątanie' }, { name: 'Drobne AGD' }, { name: 'Artykuły elektryczne' }, { name: 'Przechowywanie' }] },
  { id: 'BUILDING', label: 'Budowlany', icon: 'hardHat', hint: 'materiały, farby, instalacje', presets: ['volume', 'weight', 'color'], parcel: 'large',
    categories: [{ name: 'Materiały budowlane' }, { name: 'Farby i lakiery' }, { name: 'Instalacje', children: ['Hydraulika', 'Elektryka'] }, { name: 'Podłogi' }, { name: 'Łazienka' }] },
  { id: 'TOOLS', label: 'Narzędzia', icon: 'hammer', hint: 'elektronarzędzia, ręczne, warsztat', presets: ['power', 'warranty'], parcel: 'medium',
    categories: [{ name: 'Elektronarzędzia', children: ['Wiertarki i wkrętarki', 'Szlifierki', 'Piły'] }, { name: 'Narzędzia ręczne' },
      { name: 'Akumulatory i ładowarki' }, { name: 'Warsztat' }] },
  { id: 'STATIONERY', label: 'Papiernicze', icon: 'pen', hint: 'zeszyty, przybory, artykuły szkolne', presets: ['paper', 'color', 'pack'], parcel: 'small',
    categories: [{ name: 'Zeszyty i notesy' }, { name: 'Przybory do pisania' }, { name: 'Artykuły szkolne' }, { name: 'Papier' }, { name: 'Plastyka' }] },
  { id: 'BOOKS', label: 'Księgarnia', icon: 'help', hint: 'książki, e-booki, audiobooki', presets: ['book'], parcel: 'small',
    categories: [{ name: 'Literatura piękna' }, { name: 'Kryminał i thriller' }, { name: 'Fantastyka' }, { name: 'Literatura dziecięca' }, { name: 'Poradniki' }] },
  { id: 'MUSIC', label: 'Muzyczny', icon: 'music', hint: 'instrumenty, płyty, akcesoria', presets: ['color'], parcel: 'medium',
    categories: [{ name: 'Gitary', children: ['Klasyczne', 'Akustyczne', 'Elektryczne'] }, { name: 'Klawisze' }, { name: 'Perkusja' }, { name: 'Płyty winylowe' }, { name: 'Akcesoria' }] },
  { id: 'GAMES', label: 'Gry', icon: 'gamepad', hint: 'gry wideo, konsole, planszówki', presets: ['platform'], parcel: 'small',
    categories: [{ name: 'Gry wideo' }, { name: 'Konsole' }, { name: 'Akcesoria do gier' }, { name: 'Gry planszowe' }, { name: 'Gadżety' }] },
  { id: 'HOBBY', label: 'Hobby', icon: 'appearance', hint: 'modelarstwo, plastyka, kolekcje', presets: ['color', 'pack'], parcel: 'small',
    categories: [{ name: 'Modelarstwo' }, { name: 'Malarstwo' }, { name: 'Szycie i dziewiarstwo' }, { name: 'Kolekcjonerstwo' }] },
  { id: 'HANDMADE', label: 'Rękodzieło', icon: 'scissors', hint: 'produkty robione ręcznie', presets: ['color', 'material', 'dimensions'], parcel: 'small',
    categories: [{ name: 'Ceramika' }, { name: 'Biżuteria handmade' }, { name: 'Dekoracje' }, { name: 'Tekstylia' }, { name: 'Na zamówienie' }] },
  { id: 'GIFTS', label: 'Prezenty', icon: 'gift', hint: 'upominki, zestawy, okazje', presets: ['color', 'pack'], parcel: 'small',
    categories: [{ name: 'Dla niej' }, { name: 'Dla niego' }, { name: 'Dla dziecka' }, { name: 'Okazje', children: ['Urodziny', 'Ślub', 'Święta'] }, { name: 'Zestawy prezentowe' }] },
  { id: 'JEWELRY', label: 'Biżuteria', icon: 'gem', hint: 'biżuteria modowa i srebrna', presets: ['metal', 'color', 'chain', 'ring'], parcel: 'envelope',
    categories: [{ name: 'Naszyjniki' }, { name: 'Kolczyki' }, { name: 'Bransoletki' }, { name: 'Pierścionki' }, { name: 'Zestawy' }] },
  { id: 'ACCESSORIES', label: 'Akcesoria', icon: 'glasses', hint: 'torebki, paski, okulary, czapki', presets: ['color', 'material', 'size'], parcel: 'small',
    categories: [{ name: 'Torebki i plecaki' }, { name: 'Portfele' }, { name: 'Paski' }, { name: 'Okulary' }, { name: 'Czapki i szaliki' }] },
  { id: 'MEDICAL', label: 'Medyczny', icon: 'heartPulse', hint: 'sprzęt, ortopedia, opatrunki', presets: ['size', 'pack'], parcel: 'small',
    categories: [{ name: 'Ciśnieniomierze i termometry' }, { name: 'Ortopedia' }, { name: 'Opatrunki' }, { name: 'Rehabilitacja' }, { name: 'Higiena' }] },
  { id: 'ECO', label: 'Ekologiczny', icon: 'leaf', hint: 'żywność BIO, zero waste', presets: ['weight', 'pack', 'capacity'], parcel: 'small',
    categories: [{ name: 'Żywność BIO' }, { name: 'Kosmetyki naturalne' }, { name: 'Zero waste' }, { name: 'Środki czystości eko' }] },
  { id: 'DIGITAL', label: 'Produkty cyfrowe', icon: 'download', hint: 'e-booki, kursy, szablony, pliki', presets: ['license', 'format'], productType: 'DIGITAL',
    categories: [{ name: 'E-booki' }, { name: 'Kursy online' }, { name: 'Szablony' }, { name: 'Grafiki i zdjęcia' }, { name: 'Muzyka i dźwięki' }] },
  { id: 'FOOD', label: 'Żywność', icon: 'apple', hint: 'delikatesy, kawa, herbata, słodycze', presets: ['weight', 'pack'], parcel: 'small',
    categories: [{ name: 'Kawa i herbata' }, { name: 'Słodycze' }, { name: 'Przyprawy' }, { name: 'Przetwory' }, { name: 'Zestawy upominkowe' }] },
  { id: 'OFFICE', label: 'Wyposażenie biura', icon: 'briefcase', hint: 'meble biurowe, materiały, sprzęt', presets: ['color', 'paper', 'pack'], parcel: 'medium',
    categories: [{ name: 'Meble biurowe' }, { name: 'Materiały biurowe' }, { name: 'Papier i etykiety' }, { name: 'Sprzęt biurowy' }, { name: 'Organizacja' }] },
  { id: 'OUTDOOR', label: 'Turystyka', icon: 'tent', hint: 'namioty, plecaki, odzież outdoor', presets: ['size', 'color', 'people'], parcel: 'medium',
    categories: [{ name: 'Namioty' }, { name: 'Plecaki' }, { name: 'Śpiwory i karimaty' }, { name: 'Odzież outdoor' }, { name: 'Kuchnia turystyczna' }] },
  { id: 'GENERAL', label: 'Wielobranżowy', icon: 'grid', hint: 'różne kategorie produktów', presets: ['color', 'size', 'pack'], parcel: 'small',
    categories: [{ name: 'Dom' }, { name: 'Moda' }, { name: 'Elektronika' }, { name: 'Zdrowie i uroda' }, { name: 'Prezenty' }] },
];

export function industryOf(id: StoreIndustry | null | undefined): Industry | null {
  return INDUSTRIES.find((i) => i.id === id) ?? null;
}

/** Presets ordered for an industry: its own first, then the rest. */
export function presetsFor(id: StoreIndustry | null | undefined): { suggested: OptionPreset[]; other: OptionPreset[] } {
  const own = industryOf(id)?.presets ?? [];
  const byId = new Map(OPTION_PRESETS.map((p) => [p.id, p]));
  const suggested = own.map((p) => byId.get(p)).filter((p): p is OptionPreset => !!p);
  return { suggested, other: OPTION_PRESETS.filter((p) => !own.includes(p.id)) };
}
