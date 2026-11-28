# Format szablonów sklepu (silnik v2)

Szablon to katalog `templates/<nazwa>/` z HTML-em i CSS-em projektanta podzielonym na sekcje. Silnik w serwerze witryny (`frontend/apps/storefront/src/engine/`) składa z nich strony na serwerze. Wygląd jest 1:1 z projektem, bo to ten sam kod. Dane sklepu (produkty, kategorie, koszyk) i to, co sprzedawca może edytować, są oznaczone w szablonie.

Stan: **etap 2 zakończony**. Sklepy na szablonie v2 mają w wyglądzie szablonu każdą stronę:
- główną, katalog, kategorię, wyszukiwanie, produkt, koszyk, ulubione;
- zamówienie i potwierdzenie;
- strony informacyjne i blog;
- logowanie, rejestrację, potwierdzenie konta, reset hasła;
- konto (zamówienia, zwroty, opinie, adresy, ustawienia) i zamówienie w koncie ze zgłoszeniem zwrotu;
- potwierdzenie newslettera z maila, opinię z zaproszenia e-mail (`/opinia`) i 404 (także dla nieznanych adresów).

Przed 404 serwer sprawdza przekierowania 301 sklepu. Sklep na szablonie v2 nie korzysta już z aplikacji Angular. Edytor dla v2 to etap 3.

## Struktura pakietu

```
templates/bawiloo/
  template.json        kod, nazwa, wersja (x.y.z), branże, pliki CSS/JS, mapa stron i grup
  styles.css           CSS projektu bez zmian + @font-face + blok „Shopivo additions”
  layout/theme.liquid  szkielet HTML: <head>, nagłówek, treść strony, stopka
  sections/*.liquid    sekcje: HTML + {% schema %} z ustawieniami do edycji
  snippets/*.liquid    fragmenty wielokrotnego użytku ({% render 'product-card', product: p %})
  pages/*.json         domyślny układ każdej strony: index, catalog, product, cart, favorites, not_found,
                       checkout, order, page (strona/wpis), blog, auth (logowanie, rejestracja, potwierdzenie,
                       reset hasła), account, account_order, newsletter — każdy szablon ma własny wygląd każdej z nich
  groups/*.json        nagłówek i stopka (wspólne dla wszystkich stron)
  assets/              grafiki, fonty, skrypt szablonu (template.js)
```

Pakiety wczytują się przy starcie serwera witryny (`SHOPIVO_TEMPLATES_DIR` albo `templates/` obok katalogu roboczego). Uszkodzony pakiet zostaje pominięty, a błąd trafia do logu. Testy (`engine.spec.ts`) wczytują wszystkie pakiety i sprawdzają je.

Sklep korzysta z silnika v2, gdy kod jego szablonu (`theme.code`) odpowiada kodowi pakietu. Pozostałe sklepy i ścieżki obsługuje Angular.

## Sekcja

```liquid
<section id="{{ section.settings.anchor }}">
  <h2{{ section | edit: 'heading' }}>{{ section.settings.heading }}</h2>
  {% for block in section.blocks %}
    <article{{ block | block_attrs }}><h3{{ block | edit: 'title' }}>{{ block.settings.title }}</h3></article>
  {% endfor %}
  {% for product in section.settings.products.items %}{% render 'product-card', product: product %}{% endfor %}
</section>

{% schema %}
{ "name": "Wyróżnione produkty",
  "settings": [ { "id": "heading", "type": "text", "label": "Nagłówek", "default": "NOWOŚCI", "max": 60 },
                { "id": "products", "type": "product_list", "label": "Produkty", "default": { "source": "bestsellers", "count": 6 } } ],
  "blocks": [ { "type": "benefit", "name": "Korzyść", "settings": [ … ] } ],
  "max_blocks": 8 }
{% endschema %}
```

### Typy ustawień

| Typ | Wartość zapisana | W szablonie |
|---|---|---|
| `text`, `textarea` | tekst (`max` znaków) | tekst; `| lines` zamienia nowe linie na `<br>` |
| `url` | `/ścieżka`, `#kotwica`, `https://…`, `mailto:`, `tel:`, `legal:PRIVACY` (strona prawna sklepu) | `{{ x | link }}` |
| `image` | `asset:plik.webp` (grafika szablonu) albo id zdjęcia z biblioteki sklepu | obiekt `{w400, w1200, width, height}`; `| image_url: 'w1200'`, `| image_srcset` |
| `select`, `number`, `checkbox`, `color` | wartość z listy / liczba w `min..max` / tak-nie / `#rrggbb` | wartość |
| `product_list` | `{source, category?, count}`; źródła: `newest`, `bestsellers`, `sale`, `last_pieces`, `top_rated`, `back_in_stock`, `category` | `{items: [produkt…], url}` |
| `category_list` | `{mode: 'top'}` albo `{mode: 'selected', slugs: […]}` | lista kategorii |
| `link_list` | `[{label, url}]` | lista linków |

Zapisana wartość, która nie pasuje do schematu (np. po zmianie szablonu), jest zastępowana wartością domyślną. Strona zawsze się wyświetla.

### Obiekty w szablonie

- `shop`: `name`, `currency`, `categories` (główne), `all_categories`, `legal_links`.
- `cart`: `item_count`, `subtotal`, `lines[]` (`name`, `variant_title`, `quantity`, `unit_price`, `line_total`, `url`, `image`, `color`, `available`), `checkout_ready`.
- **produkt:** `id`, `slug`, `url`, `name`, `price`, `has_range`, `compare_at`, `on_sale`, `discount` (%), `lowest_30d` (Omnibus), `available`, `image`, `color`.
  - `color` to główny kolor zdjęcia, liczony przy wgrywaniu. Tła kart są przyciemniane tym kolorem.
- **strona produktu:** `product` (z `variants`, `images`, `breadcrumbs`, `category_name`, `description`) i `related`.
- **katalog:** `catalog` (`items`, `total`, `page`, `total_pages`, `q`, `category`, `category_name`, `sort`, `sale`, `prev_url`, `next_url`).
- **ulubione:** `favorites`.
- **zamówienie:** `checkout` (`shipping_methods[]` z `price`, `free_from`, `pickup_point`; `payment_methods[]` z `method`, `label`, `fee`; `customer` z danymi zalogowanego klienta i jego domyślnym adresem; `captcha_site_key`).
- **potwierdzenie:** `order` (`number`, `items`, `total`, `paid`, `awaiting_online`, `bank_transfer`, `pickup_point`…) albo nic, gdy brak ciasteczka zamówienia.
- **strona i wpis:** `entry` (`kind`, `title`, `blocks` — treść jako dane: nagłówki, akapity, listy, linki; snippet `rich-text` ją rysuje).
- **blog:** `blog` (`posts`, `page`, `total_pages`, `prev_url`, `next_url`).
- **logowanie i spółka:** `auth` (`view`: `login`, `register`, `verify`, `reset_request`, `reset`; `captcha_site_key`). Zalogowany klient na logowaniu lub rejestracji trafia do `/konto`.
- **konto:** `account` (`tab`, `tabs`, `orders`, `returns`, `reviews`, `addresses`, dane klienta). Gość trafia do logowania z `?powrot=`.
- **zamówienie w koncie:** `account_order` (pozycje, sumy, adres, `awaiting_online`, `return_kinds`, `items[].returnable` i `choices`).
- **newsletter:** `newsletter.action` (`confirm` lub `unsubscribe`).
- **opinia z zaproszenia:** strona bez danych z serwera. Token z linku zna tylko przeglądarka; skrypt wczytuje zamówienie i kopiuje `<template data-shop-review-item>` dla każdego produktu (`[data-shop-review-name]`, pole `productId`, formularz `invite-review`).

Strony konta renderuje serwer: ciasteczko sesji klienta (HttpOnly) trafia tylko do zapytań `/account/…`, razem z nagłówkiem `X-Requested-With` (ochrona CSRF API).
- `page_type`: `index`, `catalog`, `product`, `cart`, `favorites`, `not_found`.

Filtry: `money` (`{{ p.price | money: p.currency }}` daje „17,99 zł”), `lines`, `link`, `asset_url`, `image_url`, `image_srcset`, `edit`, `block_attrs` oraz standardowe filtry Liquid.

Bezpieczeństwo:
- Wszystko, co wypisuje szablon, jest **escapowane**. Wyjątkiem są tylko filtry platformy `lines`, `edit` i `block_attrs`, które same escapują swoje wejście.
- Linki przechodzą przez `safeLink`, który odrzuca `javascript:`, `//host` i `http:`.
- Fragmenty `snippets/` są w pamięci; Liquid nie czyta plików w trakcie renderowania.

## Zachowanie sklepu: atrybuty `data-shop-*`

Skrypt platformy (`engine/runtime/shop.js`, adres `/_shop/runtime.js`) podpina się pod atrybuty w HTML-u projektu, więc wygląd zostaje z szablonu:

| Atrybut | Działanie |
|---|---|
| `button[data-shop-add][data-product=slug]` | dodaje do koszyka; produkt z wariantami otwiera swoją stronę |
| `form[data-shop-add-form]` z polami `variant`, `quantity` | dodanie ze strony produktu |
| `[data-shop-fav=productId]` (`data-on`/`data-off`, `data-aria-on`/`data-aria-off`) | ulubione: `aria-pressed`, tekst, etykieta |
| `[data-shop-cart-set=variantId][data-quantity=n]` | ustawia ilość (0 = usuń), potem odświeża sekcję |
| `[data-shop-cart-count]`, `[data-shop-cart-label="Koszyk ({count})"]`, `[data-shop-fav-count]`, `[data-shop-fav-label]` | liczniki i etykiety |
| `form[data-shop-newsletter]` (pole `email`, zgoda) + `[data-shop-status]` | zapis do newslettera (double opt-in) |
| `form[data-shop-filter]` + `[data-shop-region]` | filtry katalogu: wyniki podmieniają się bez przeładowania, adres się aktualizuje |
| `[data-shop-toast]` | komunikaty „Dodano do koszyka” |
| `form[data-shop-checkout]` | zamówienie: pola `email`, `phone`, `firstName`, `lastName`, `line1`, `postalCode`, `city`, `shippingMethodId` (`data-price`, `data-free-from`, `data-pickup`), `paymentMethod` (`data-fee`), `invoice`, `companyName`, `taxId`, `customerNote`, `termsAccepted`, `marketingConsent`; sumy w `[data-shop-total="shipping|fee|total"]`; paczkomaty w `[data-shop-pickup=methodId]`; błędy w `[data-shop-error]`; walidacja jak na serwerze |
| `[data-shop-toggle=x]` + `[data-shop-when=x]` | pokazuje część formularza po zaznaczeniu pola (np. faktura) |
| `[data-shop-captcha="klucz"]` | Cloudflare Turnstile, gdy sklep ma włączone zabezpieczenie (zamówienie, newsletter) |
| `[data-shop-order]` (`data-wait`), `[data-shop-order-pay]` | potwierdzenie: czeka na płatność online, ponowna płatność |
| `form[data-shop-form="akcja"]` + `[data-shop-error]`, `[data-shop-status]`, `[data-shop-done]` | formularze konta; akcje: `login`, `register`, `verify`, `reset-request`, `reset`, `profile`, `password`, `delete-account`, `address`, `address-delete`, `review`, `return`, `logout`, `order-pay`, `invite-review`. Nazwy pól jak w API. Szablon wybiera tylko akcję, adres zapytania zna skrypt. |
| `[data-shop-needs-link-token]` (+ `[data-shop-link-missing]`) | strony z linku e-mail: token z `#t=` jest zabierany z paska adresu i używany przez formularz |
| `[data-shop-address-edit='{json}']`, `[data-shop-hide-form]` | otwiera formularz adresu (wypełniony lub pusty) i go zamyka |
| `[data-shop-newsletter-link="confirm|unsubscribe"]` + `[data-state]` | potwierdza zapis albo wypisuje z newslettera od razu po wejściu |

Koszyk i ulubione:
- Token koszyka jest w ciasteczku `shopivo_cart`, a ulubione w `shopivo_fav`. Dzięki temu serwer sam rysuje stronę koszyka i ulubionych.
- Te same dane trafiają do localStorage pod kluczami strony zamówienia (`shopivo.cart`, `sf-wishlist`). Klient ma jeden koszyk w całym sklepie.

Po zmianie koszyka skrypt pobiera ponownie wyrenderowaną sekcję: `GET /_shop/sections?path=/koszyk&ids=main`.

Skrypt szablonu (`assets/template.js`) zawiera tylko zachowania z projektu, np. slider i dopasowanie menu.

## Adresy i pamięć podręczna

- `/_t/<kod>/<wersja>/styles.css` i `/_t/<kod>/<wersja>/<plik>`: pliki pakietu, cache 1 rok. Nowa wersja pakietu to nowy adres.
- Strony: `Cache-Control: private, no-cache`, bo licznik koszyka zależy od ciasteczka.
- Podgląd (`?podglad=`): `no-store` i `noindex`.
- SEO: `<title>`, `canonical`, `og:*`, a na stronie produktu JSON-LD `Product`.

## Zasady przenoszenia projektu 1:1

1. CSS projektu kopiujemy bez zmian. Klasy dodane przez platformę muszą istnieć w CSS projektu. Inaczej trafiają do bloku „Shopivo additions”. Test `uses only classes its stylesheet defines` tego pilnuje.
2. Przykładowe dane z JS projektu (produkty, koszyk w localStorage, logowanie demo) zastępujemy prawdziwymi danymi sklepu.
3. Fonty serwujemy z witryny, bez Google Fonts. Font bez polskich liter mapujemy na podobny z pełnym alfabetem (Bawiloo: „Fredoka” → pliki Baloo 2).
4. Wymogi prawne mają pierwszeństwo przed 1:1:
   - przy obniżkach pokazujemy najniższą cenę z 30 dni;
   - dopisek „demo” w newsletterze usuwamy;
   - szablon niczego nie obiecuje za sprzedawcę („Darmowa dostawa” zmieniona na „Szybka dostawa”).
5. Zgodność sprawdzamy zrzutami ekranu oryginału i sklepu na komputerze i telefonie, z tymi samymi danymi.
