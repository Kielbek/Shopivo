/**
 * Ready-made category graphics: original flat Shopivo motifs (same style as the panel illustrations) on a pastel
 * background. They are rendered in the browser to a PNG and uploaded like any category photo, so the storefront
 * gets the usual image variants. Motifs are drawn in a 200×200 box.
 */

export interface ArtMotif { id: string; label: string; svg: string; match: RegExp }
export interface ArtBackground { id: string; label: string; color: string }

const G = '#36AE2C';
const GD = '#1E7F4F';
const O = '#F2A93B';
const OD = '#DD8A1E';
const C = '#EF7D62';
const CD = '#D9604A';
const B = '#4A78B8';
const BD = '#365E96';
const K = '#2F3430';
const W = '#FFFFFF';
const SH = 'rgba(15,18,16,0.10)';

export const ART_BACKGROUNDS: ArtBackground[] = [
  { id: 'mint', label: 'Miętowe', color: '#DDF3DA' },
  { id: 'sand', label: 'Piaskowe', color: '#F7E9D3' },
  { id: 'blush', label: 'Różowe', color: '#F8DFD8' },
  { id: 'sky', label: 'Błękitne', color: '#DCE8F5' },
  { id: 'lilac', label: 'Liliowe', color: '#E7E0F3' },
  { id: 'stone', label: 'Szare', color: '#ECEDE9' },
];

export const ART_MOTIFS: ArtMotif[] = [
  {
    id: 'dress', label: 'Sukienka', match: /sukien|spódnic|kobiet|damsk/i,
    svg: `<ellipse cx="100" cy="176" rx="56" ry="7" fill="${SH}"/>
      <path d="M84 24v26M116 24v26" stroke="${CD}" stroke-width="5" stroke-linecap="round"/>
      <path d="M78 48h44l-5 38H83z" fill="${C}"/><path d="M83 86h34l38 86H45z" fill="${C}"/>
      <rect x="82" y="82" width="36" height="9" rx="3" fill="${CD}"/><path d="M100 96v70M78 120l-12 46M122 120l12 46" stroke="${W}" stroke-opacity=".28" stroke-width="3" stroke-linecap="round"/>`,
  },
  {
    id: 'shirt', label: 'Koszula', match: /koszul[aei]\b|koszule|bluzk|elegan|garnitur/i,
    svg: `<ellipse cx="100" cy="178" rx="56" ry="7" fill="${SH}"/>
      <path d="M68 34l18-8h28l18 8 22 22 10 106-18 4-12-90v96H72V76L60 166l-18-4 10-106z" fill="${B}"/>
      <path d="M86 26l14 18 14-18-4 22-10 6-10-6z" fill="${W}"/><path d="M100 50v120" stroke="${BD}" stroke-width="3"/>
      <circle cx="106" cy="70" r="3" fill="${W}"/><circle cx="106" cy="92" r="3" fill="${W}"/><circle cx="106" cy="114" r="3" fill="${W}"/><circle cx="106" cy="136" r="3" fill="${W}"/>
      <rect x="76" y="76" width="16" height="12" rx="2" fill="${BD}"/>`,
  },
  {
    id: 'tshirt', label: 'Koszulka', match: /koszul|t-?shirt|bluz|\btop(y|ów)?\b|odzie|ubra|męsk|polo/i,
    svg: `<ellipse cx="100" cy="176" rx="54" ry="7" fill="${SH}"/>
      <path d="M68 40l20-12h24l20 12 26 30-20 14-12-12v94H74V72L62 84 42 70z" fill="${O}"/>
      <path d="M88 28q12 14 24 0" fill="none" stroke="${W}" stroke-width="4" stroke-linecap="round"/>
      <path d="M62 84l12-12M138 84l-12-12" stroke="${OD}" stroke-width="3" stroke-linecap="round"/>`,
  },
  {
    id: 'trousers', label: 'Spodnie', match: /spodn|jeans|dżins|legins|szort/i,
    svg: `<ellipse cx="100" cy="178" rx="50" ry="6" fill="${SH}"/>
      <path d="M64 24h72l8 148h-32l-12-100-12 100H56z" fill="${B}"/><rect x="64" y="24" width="72" height="12" rx="2" fill="${BD}"/>
      <path d="M100 36v26M72 40q8 14 18 14M128 40q-8 14-18 14" fill="none" stroke="${W}" stroke-opacity=".45" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="100" cy="30" r="2.6" fill="${O}"/>`,
  },
  {
    id: 'jacket', label: 'Kurtka', match: /kurtk|płaszcz|plaszcz|marynark|okryci|parka|zimow/i,
    svg: `<ellipse cx="100" cy="178" rx="58" ry="7" fill="${SH}"/>
      <path d="M60 44l26-16h28l26 16 20 104-18 6-10-58v76H62V96l-10 58-18-6z" fill="${GD}"/>
      <path d="M86 28l14 44 14-44" fill="none" stroke="${G}" stroke-width="6" stroke-linejoin="round"/>
      <path d="M100 72v98" stroke="${W}" stroke-opacity=".5" stroke-width="2.5"/><rect x="70" y="112" width="18" height="4" rx="2" fill="${G}"/><rect x="112" y="112" width="18" height="4" rx="2" fill="${G}"/>`,
  },
  {
    id: 'sneaker', label: 'Buty', match: /but|obuw|sneak|trampk|kozak|sandał|klapk|szpilk/i,
    svg: `<ellipse cx="102" cy="150" rx="74" ry="7" fill="${SH}"/>
      <path d="M34 120c0-22 8-44 26-48l30 22c22 4 54 6 70 22 8 8 8 14 8 18H34z" fill="${G}"/>
      <path d="M60 72l30 22-8 10L56 86z" fill="${GD}"/>
      <path d="M30 132h142a8 8 0 0 1 0 16H38a8 8 0 0 1-8-8z" fill="${W}"/><path d="M30 140h150" stroke="#DADDD6" stroke-width="2"/>
      <path d="M94 98l-6 10M104 101l-6 10M114 104l-6 10" stroke="${W}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M120 120c10-6 24-6 34-2" fill="none" stroke="${O}" stroke-width="5" stroke-linecap="round"/>`,
  },
  {
    id: 'bag', label: 'Torebka', match: /torb|torebk|plecak|portfel|walizk|kosmetycz/i,
    svg: `<ellipse cx="100" cy="174" rx="58" ry="7" fill="${SH}"/>
      <path d="M72 76v-18a28 28 0 0 1 56 0v18" fill="none" stroke="${CD}" stroke-width="7" stroke-linecap="round"/>
      <rect x="44" y="70" width="112" height="98" rx="16" fill="${C}"/>
      <path d="M44 92a16 16 0 0 1 16-16h80a16 16 0 0 1 16 16v14H44z" fill="${CD}"/>
      <rect x="90" y="100" width="20" height="16" rx="4" fill="${O}"/>`,
  },
  {
    id: 'socks', label: 'Bielizna i skarpety', match: /bieliz|skarpet|majt|biustonosz|piżam|rajstop|koszul.*noc/i,
    svg: `<ellipse cx="100" cy="176" rx="56" ry="6" fill="${SH}"/>
      <g transform="translate(24 6)"><path d="M70 22h32v84l-6 30c-4 16-26 20-40 10l-12-8c-10-8-8-22 4-26l22-10z" fill="${C}"/><rect x="70" y="22" width="32" height="14" rx="3" fill="${CD}"/></g>
      <path d="M62 30h32v84l-6 30c-4 16-26 20-40 10l-12-8c-10-8-8-22 4-26l22-10z" fill="${G}"/><rect x="62" y="30" width="32" height="14" rx="3" fill="${GD}"/>
      <path d="M62 58h32M62 72h32" stroke="${W}" stroke-width="5"/>`,
  },
  {
    id: 'sale', label: 'Wyprzedaż', match: /wyprzed|promoc|outlet|rabat|okazj|black|sale|taniej/i,
    svg: `<ellipse cx="104" cy="176" rx="56" ry="7" fill="${SH}"/>
      <g transform="rotate(-14 100 100)"><path d="M40 60h86l38 40-38 40H40a10 10 0 0 1-10-10V70a10 10 0 0 1 10-10z" fill="${O}"/>
      <circle cx="134" cy="100" r="8" fill="${W}"/>
      <circle cx="62" cy="84" r="9" fill="none" stroke="${W}" stroke-width="6"/><circle cx="98" cy="116" r="9" fill="none" stroke="${W}" stroke-width="6"/>
      <path d="M100 78l-40 44" stroke="${W}" stroke-width="7" stroke-linecap="round"/></g>`,
  },
  {
    id: 'new', label: 'Nowości', match: /nowo|nowe|new|premier|kolekcj|bestsel|polecan/i,
    svg: `<path d="M100 20l14 46 46 14-46 14-14 46-14-46-46-14 46-14z" fill="${G}"/>
      <path d="M156 116l6 18 18 6-18 6-6 18-6-18-18-6 18-6z" fill="${O}"/><path d="M50 128l5 14 14 5-14 5-5 14-5-14-14-5 14-5z" fill="${GD}"/>`,
  },
  {
    id: 'kids', label: 'Dla dzieci', match: /dzie|niemowl|baby|maluch|przedszkol|szkoln/i,
    svg: `<ellipse cx="100" cy="176" rx="54" ry="7" fill="${SH}"/>
      <circle cx="66" cy="46" r="16" fill="${OD}"/><circle cx="134" cy="46" r="16" fill="${OD}"/><circle cx="66" cy="46" r="7" fill="#F6C98A"/><circle cx="134" cy="46" r="7" fill="#F6C98A"/>
      <ellipse cx="100" cy="132" rx="46" ry="42" fill="${O}"/><ellipse cx="100" cy="138" rx="24" ry="22" fill="#F6C98A"/>
      <circle cx="100" cy="70" r="38" fill="${O}"/><ellipse cx="100" cy="84" rx="16" ry="12" fill="#F6C98A"/>
      <circle cx="86" cy="64" r="4" fill="${K}"/><circle cx="114" cy="64" r="4" fill="${K}"/><ellipse cx="100" cy="80" rx="6" ry="4.5" fill="${K}"/>`,
  },
  {
    id: 'toys', label: 'Zabawki i gry', match: /zabaw|klock|gry|gra |puzzl|planszów|konsol/i,
    svg: `<ellipse cx="100" cy="174" rx="66" ry="7" fill="${SH}"/>
      <rect x="40" y="114" width="56" height="56" rx="8" fill="${B}"/><rect x="104" y="114" width="56" height="56" rx="8" fill="${C}"/><rect x="72" y="54" width="56" height="56" rx="8" fill="${G}"/>
      <path d="M58 128h20v28H58zM122 132l10 24h-20z" fill="${W}" fill-opacity=".85"/><circle cx="100" cy="82" r="12" fill="${W}" fill-opacity=".85"/>`,
  },
  {
    id: 'cap', label: 'Czapki i akcesoria', match: /czap|kapelusz|akcesor|szal|rękawicz|pask|krawat/i,
    svg: `<ellipse cx="104" cy="160" rx="64" ry="7" fill="${SH}"/>
      <path d="M40 120a60 60 0 0 1 120 0z" fill="${GD}"/><path d="M100 60a60 60 0 0 1 60 60h-24a36 60 0 0 0-36-60z" fill="${G}"/>
      <path d="M38 118h126c14 0 22 8 22 14H44a6 6 0 0 1-6-6z" fill="${GD}"/><circle cx="100" cy="58" r="6" fill="${O}"/>`,
  },
  {
    id: 'watch', label: 'Zegarki', match: /zegar|smartwatch/i,
    svg: `<rect x="80" y="20" width="40" height="160" rx="12" fill="${K}"/>
      <circle cx="100" cy="100" r="44" fill="${O}"/><circle cx="100" cy="100" r="34" fill="${W}"/>
      <path d="M100 78v22l14 10" fill="none" stroke="${K}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="100" cy="100" r="4" fill="${C}"/>`,
  },
  {
    id: 'glasses', label: 'Okulary', match: /okular|optyk|soczew/i,
    svg: `<ellipse cx="100" cy="146" rx="70" ry="6" fill="${SH}"/>
      <path d="M24 92l10-28M176 92l-10-28" stroke="${K}" stroke-width="6" stroke-linecap="round"/>
      <circle cx="62" cy="104" r="32" fill="${K}"/><circle cx="138" cy="104" r="32" fill="${K}"/><path d="M90 98q10-10 20 0" fill="none" stroke="${K}" stroke-width="7"/>
      <circle cx="62" cy="104" r="24" fill="${B}"/><circle cx="138" cy="104" r="24" fill="${B}"/><path d="M50 94l10-8M126 94l10-8" stroke="${W}" stroke-width="5" stroke-linecap="round" stroke-opacity=".7"/>`,
  },
  {
    id: 'ring', label: 'Biżuteria', match: /biżut|bizut|pierście|kolczyk|naszyjnik|bransolet|złot|srebr|jubil/i,
    svg: `<ellipse cx="100" cy="176" rx="50" ry="6" fill="${SH}"/>
      <circle cx="100" cy="118" r="48" fill="none" stroke="${O}" stroke-width="14"/>
      <path d="M78 58l22-30 22 30-22 22z" fill="${G}"/><path d="M78 58h44M100 28v52" stroke="${W}" stroke-opacity=".5" stroke-width="2.5"/>
      <path d="M150 40l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="${O}"/>`,
  },
  {
    id: 'cosmetics', label: 'Kosmetyki', match: /kosmet|makija|szmink|krem|pielęg|uroda|beauty|włos|paznok/i,
    svg: `<ellipse cx="100" cy="176" rx="64" ry="7" fill="${SH}"/>
      <rect x="44" y="92" width="44" height="78" rx="10" fill="${G}"/><rect x="54" y="72" width="24" height="22" rx="4" fill="${GD}"/><rect x="52" y="116" width="28" height="22" rx="4" fill="${W}" fill-opacity=".85"/>
      <rect x="112" y="110" width="40" height="60" rx="6" fill="${K}"/><rect x="116" y="74" width="32" height="38" rx="4" fill="#B9BDB6"/>
      <path d="M120 74V46l24 10v18z" fill="${C}"/>`,
  },
  {
    id: 'perfume', label: 'Perfumy', match: /perfum|zapach|woda toalet|dezodor/i,
    svg: `<ellipse cx="100" cy="176" rx="52" ry="7" fill="${SH}"/>
      <rect x="86" y="30" width="28" height="22" rx="5" fill="${O}"/><rect x="92" y="50" width="16" height="14" fill="${OD}"/>
      <rect x="52" y="62" width="96" height="110" rx="24" fill="#B8D8EE"/><rect x="66" y="94" width="68" height="40" rx="8" fill="${W}"/>
      <path d="M78 110h44M84 120h32" stroke="#B9BDB6" stroke-width="4" stroke-linecap="round"/><path d="M64 78q-4 30 2 70" fill="none" stroke="${W}" stroke-width="5" stroke-linecap="round" stroke-opacity=".7"/>`,
  },
  {
    id: 'phone', label: 'Telefony i elektronika', match: /telefon|smartfon|elektron|gsm|ładowar|kabl|tablet/i,
    svg: `<ellipse cx="100" cy="182" rx="46" ry="6" fill="${SH}"/>
      <rect x="58" y="14" width="84" height="164" rx="16" fill="${K}"/><rect x="65" y="28" width="70" height="132" rx="6" fill="${G}"/>
      <rect x="86" y="19" width="28" height="5" rx="2.5" fill="#55595A"/>
      <rect x="74" y="40" width="24" height="24" rx="6" fill="${W}" fill-opacity=".9"/><rect x="102" y="40" width="24" height="24" rx="6" fill="${O}"/>
      <rect x="74" y="70" width="24" height="24" rx="6" fill="${C}"/><rect x="102" y="70" width="24" height="24" rx="6" fill="${W}" fill-opacity=".9"/>
      <rect x="74" y="134" width="52" height="16" rx="8" fill="${GD}"/>`,
  },
  {
    id: 'laptop', label: 'Komputery', match: /laptop|komputer|pc|monitor|notebook|drukark|klawiatur|myszk/i,
    svg: `<ellipse cx="100" cy="166" rx="84" ry="7" fill="${SH}"/>
      <rect x="40" y="40" width="120" height="84" rx="8" fill="${K}"/><rect x="48" y="48" width="104" height="68" rx="3" fill="${B}"/>
      <path d="M48 104l26-24 18 16 20-22 40 30v12H48z" fill="${G}"/><circle cx="130" cy="66" r="7" fill="${O}"/>
      <path d="M22 128h156l-8 18a8 8 0 0 1-7 4H37a8 8 0 0 1-7-4z" fill="#B9BDB6"/><rect x="86" y="128" width="28" height="5" rx="2.5" fill="#8E958D"/>`,
  },
  {
    id: 'headphones', label: 'Audio', match: /słuchaw|sluchaw|audio|głośnik|glosnik|muzy|winyl|płyt/i,
    svg: `<ellipse cx="100" cy="176" rx="60" ry="7" fill="${SH}"/>
      <path d="M44 116V96a56 56 0 0 1 112 0v20" fill="none" stroke="${K}" stroke-width="12" stroke-linecap="round"/>
      <rect x="32" y="104" width="34" height="62" rx="14" fill="${C}"/><rect x="134" y="104" width="34" height="62" rx="14" fill="${C}"/>
      <rect x="56" y="112" width="12" height="46" rx="6" fill="${K}"/><rect x="132" y="112" width="12" height="46" rx="6" fill="${K}"/>`,
  },
  {
    id: 'lamp', label: 'Dom i dekoracje', match: /dom|wnętrz|wnetrz|dekorac|oświetl|oswietl|lamp|świec|swiec|tekstyl|pościel/i,
    svg: `<ellipse cx="100" cy="178" rx="40" ry="6" fill="${SH}"/>
      <path d="M66 26h68l20 60H46z" fill="${O}"/><path d="M66 26h68l4 12H62z" fill="${OD}"/>
      <rect x="96" y="86" width="8" height="70" fill="${K}"/><rect x="70" y="154" width="60" height="14" rx="7" fill="${K}"/>
      <path d="M70 96l-14 22M130 96l14 22M100 96v20" stroke="${O}" stroke-width="4" stroke-linecap="round" stroke-opacity=".6"/>`,
  },
  {
    id: 'sofa', label: 'Meble', match: /mebl|sofa|kanap|fotel|krzes|stół|stol|szaf|łóżk|lozk/i,
    svg: `<ellipse cx="100" cy="170" rx="80" ry="7" fill="${SH}"/>
      <rect x="40" y="58" width="120" height="58" rx="16" fill="${GD}"/>
      <rect x="22" y="86" width="34" height="68" rx="14" fill="${G}"/><rect x="144" y="86" width="34" height="68" rx="14" fill="${G}"/>
      <rect x="48" y="106" width="104" height="40" rx="10" fill="${G}"/><path d="M100 106v40" stroke="${GD}" stroke-width="3"/>
      <path d="M34 154v12M166 154v12" stroke="${K}" stroke-width="6" stroke-linecap="round"/><rect x="62" y="70" width="26" height="26" rx="8" fill="${O}"/>`,
  },
  {
    id: 'plant', label: 'Ogród i rośliny', match: /ogród|ogrod|rośl|rosl|kwiat|nasion|donicz|balkon/i,
    svg: `<ellipse cx="100" cy="178" rx="44" ry="6" fill="${SH}"/>
      <ellipse cx="80" cy="76" rx="14" ry="36" transform="rotate(-30 80 76)" fill="${G}"/><ellipse cx="122" cy="72" rx="14" ry="38" transform="rotate(28 122 72)" fill="${GD}"/>
      <ellipse cx="100" cy="58" rx="13" ry="42" fill="#41C336"/>
      <path d="M62 112h76l-10 62H72z" fill="${C}"/><rect x="56" y="104" width="88" height="14" rx="4" fill="${CD}"/>`,
  },
  {
    id: 'kitchen', label: 'Kuchnia', match: /kuch|kubk|kubek|naczy|garn|patel|kaw|herbat|sztućc|zastaw/i,
    svg: `<ellipse cx="96" cy="176" rx="58" ry="7" fill="${SH}"/>
      <path d="M136 92h8a20 20 0 0 1 0 40h-8" fill="none" stroke="${GD}" stroke-width="10"/>
      <rect x="44" y="74" width="96" height="98" rx="14" fill="${G}"/><rect x="44" y="74" width="96" height="16" rx="8" fill="${GD}"/>
      <path d="M74 60q8-10 0-20M94 60q8-10 0-20M114 60q8-10 0-20" fill="none" stroke="#B9BDB6" stroke-width="4" stroke-linecap="round"/>
      <path d="M92 132l-10-10a7 7 0 0 1 10-9 7 7 0 0 1 10 9z" fill="${W}"/>`,
  },
  {
    id: 'books', label: 'Książki i biuro', match: /książ|ksiaz|papier|biur|zeszyt|długopis|dlugopis|notes|kalendar|szkoł|szkol/i,
    svg: `<ellipse cx="100" cy="176" rx="64" ry="7" fill="${SH}"/>
      <rect x="40" y="140" width="120" height="30" rx="4" fill="${B}"/><rect x="50" y="112" width="110" height="28" rx="4" fill="${O}"/><rect x="34" y="84" width="112" height="28" rx="4" fill="${G}"/>
      <path d="M46 98h88M60 126h88M50 155h100" stroke="${W}" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
      <path d="M118 22l30 18-36 52-14 6 2-16z" fill="${C}"/><path d="M118 22l30 18" stroke="${CD}" stroke-width="6"/>`,
  },
  {
    id: 'sport', label: 'Sport', match: /sport|fitnes|siłown|silown|rower|piłk|pilk|trening|biegan|joga|turyst|outdoor/i,
    svg: `<ellipse cx="100" cy="150" rx="72" ry="7" fill="${SH}"/>
      <rect x="62" y="94" width="76" height="14" rx="7" fill="#B9BDB6"/>
      <rect x="30" y="66" width="22" height="70" rx="8" fill="${K}"/><rect x="50" y="76" width="16" height="50" rx="6" fill="${G}"/>
      <rect x="148" y="66" width="22" height="70" rx="8" fill="${K}"/><rect x="134" y="76" width="16" height="50" rx="6" fill="${G}"/>`,
  },
  {
    id: 'pets', label: 'Zwierzęta', match: /zwierz|pies|psa|kot|karm|akwar|gryzo|weteryn/i,
    svg: `<ellipse cx="100" cy="178" rx="56" ry="7" fill="${SH}"/>
      <ellipse cx="100" cy="96" rx="32" ry="28" fill="${OD}"/><ellipse cx="62" cy="66" rx="12" ry="16" fill="${OD}"/><ellipse cx="138" cy="66" rx="12" ry="16" fill="${OD}"/>
      <ellipse cx="84" cy="40" rx="12" ry="16" fill="${OD}"/><ellipse cx="116" cy="40" rx="12" ry="16" fill="${OD}"/>
      <rect x="62" y="148" width="76" height="16" rx="8" fill="${W}"/><circle cx="60" cy="146" r="10" fill="${W}"/><circle cx="60" cy="166" r="10" fill="${W}"/><circle cx="140" cy="146" r="10" fill="${W}"/><circle cx="140" cy="166" r="10" fill="${W}"/>`,
  },
  {
    id: 'food', label: 'Żywność', match: /żywn|zywn|spożyw|spozyw|owoc|warzyw|jedzen|słodycz|slodycz|eko|bio|deli|przypraw/i,
    svg: `<ellipse cx="100" cy="178" rx="52" ry="7" fill="${SH}"/>
      <path d="M100 58c-18-14-60-10-60 36 0 44 28 82 48 76 6-2 18-2 24 0 20 6 48-32 48-76 0-46-42-50-60-36z" fill="${C}"/>
      <path d="M100 58c-2-14 4-28 14-34" fill="none" stroke="${K}" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="128" cy="40" rx="18" ry="9" transform="rotate(-24 128 40)" fill="${G}"/>
      <path d="M62 92q2-18 18-22" fill="none" stroke="${W}" stroke-width="6" stroke-linecap="round" stroke-opacity=".6"/>`,
  },
  {
    id: 'gift', label: 'Prezenty', match: /prezent|upomink|okoliczn|zestaw|święt|swiat|walentyn|urodzin/i,
    svg: `<ellipse cx="100" cy="176" rx="60" ry="7" fill="${SH}"/>
      <rect x="44" y="84" width="112" height="88" rx="6" fill="${G}"/><rect x="36" y="66" width="128" height="26" rx="6" fill="${GD}"/>
      <rect x="92" y="66" width="16" height="106" fill="${O}"/>
      <path d="M100 66c-10-22-40-30-40-12 0 10 18 12 40 12zM100 66c10-22 40-30 40-12 0 10-18 12-40 12z" fill="none" stroke="${O}" stroke-width="8" stroke-linejoin="round"/>`,
  },
  {
    id: 'tools', label: 'Narzędzia', match: /narzęd|narzed|budow|majster|remont|warsztat|elektronarz|śrub|srub/i,
    svg: `<ellipse cx="100" cy="176" rx="60" ry="7" fill="${SH}"/>
      <g transform="rotate(40 100 100)"><rect x="92" y="62" width="16" height="104" rx="6" fill="${OD}"/><rect x="62" y="30" width="76" height="34" rx="6" fill="${K}"/><path d="M138 30h12l-6 18h-6z" fill="${K}"/></g>
      <g transform="rotate(-40 100 100)"><rect x="93" y="70" width="14" height="96" rx="7" fill="#B9BDB6"/><path d="M84 34a22 22 0 0 0 32 0v28a16 16 0 0 1-32 0z" fill="#B9BDB6"/><rect x="92" y="130" width="16" height="40" rx="6" fill="${C}"/></g>`,
  },
  {
    id: 'auto', label: 'Motoryzacja', match: /moto|samoch|auto|opon|części|czesci/i,
    svg: `<ellipse cx="100" cy="164" rx="82" ry="7" fill="${SH}"/>
      <path d="M30 126v-18c0-8 6-14 14-14h12l20-26h56l22 26h6c8 0 14 6 14 14v18a6 6 0 0 1-6 6H36a6 6 0 0 1-6-6z" fill="${B}"/>
      <path d="M82 76h22v20H66zM110 76h20l16 20h-36z" fill="#CFE2F3"/>
      <circle cx="66" cy="134" r="18" fill="${K}"/><circle cx="66" cy="134" r="7" fill="#B9BDB6"/><circle cx="142" cy="134" r="18" fill="${K}"/><circle cx="142" cy="134" r="7" fill="#B9BDB6"/>
      <rect x="164" y="104" width="10" height="8" rx="3" fill="${O}"/>`,
  },
  {
    id: 'shop', label: 'Ogólna', match: /$^/,
    svg: `<ellipse cx="100" cy="176" rx="56" ry="7" fill="${SH}"/>
      <path d="M76 62v-12a24 24 0 0 1 48 0v12" fill="none" stroke="${OD}" stroke-width="7" stroke-linecap="round"/>
      <rect x="46" y="58" width="108" height="112" rx="10" fill="${O}"/><rect x="46" y="58" width="108" height="14" rx="7" fill="#F6C26F"/>
      <circle cx="100" cy="116" r="26" fill="${W}"/><path d="M100 99l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="${G}"/>`,
  },
];

/** Best motif for a category name (falls back to the generic shopping bag). */
export function suggestMotif(name: string): ArtMotif {
  return ART_MOTIFS.find((m) => m.match.test(name)) ?? ART_MOTIFS.at(-1)!;
}

/** Background colour for a category: stable for the same name, varied across names (neighbouring tiles differ). */
export function suggestBackground(name: string): ArtBackground {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ART_BACKGROUNDS[h % ART_BACKGROUNDS.length]!;
}

/** Full graphic as SVG (4:5 like the storefront tiles, motif centred so a square crop also works). */
export function artSvg(motif: ArtMotif, background: ArtBackground, width = 400, height = 500): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 400 500">`
    + `<rect width="400" height="500" fill="${background.color}"/>`
    + `<circle cx="200" cy="250" r="156" fill="#FFFFFF" fill-opacity="0.5"/>`
    + `<g transform="translate(70 120) scale(1.3)">${motif.svg}</g></svg>`;
}

/** Renders the graphic to a PNG file (1000×1250) ready for the regular category image upload. */
export async function renderArtPng(motif: ArtMotif, background: ArtBackground, fileName: string): Promise<File> {
  const svg = artSvg(motif, background, 1000, 1250);
  // data: URL, not blob: — the panel's Content-Security-Policy allows only 'self' and data: images.
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Nie udało się przygotować grafiki.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1250;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Przeglądarka nie obsługuje rysowania grafiki.');
    ctx.drawImage(img, 0, 0, 1000, 1250);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Nie udało się przygotować grafiki.');
    return new File([blob], fileName, { type: 'image/png' });
  }
}
