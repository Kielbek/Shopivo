import { ART_BACKGROUNDS, ART_MOTIFS, artSvg, suggestBackground, suggestMotif } from './category-art';

describe('category art', () => {
  it('matches common Polish category names to a fitting motif', () => {
    const cases: Record<string, string> = {
      Sukienki: 'dress', 'Bluzki i koszule': 'shirt', Koszulki: 'tshirt', Spodnie: 'trousers', 'Kurtki i płaszcze': 'jacket',
      Bielizna: 'socks', Wyprzedaż: 'sale', 'Buty sportowe': 'sneaker', Plecaki: 'bag', Smartfony: 'phone', Laptopy: 'laptop',
      'Karma dla psa': 'pets', Biżuteria: 'ring', 'Dekoracje': 'lamp', Prezenty: 'gift', Narzędzia: 'tools',
    };
    for (const [name, id] of Object.entries(cases)) expect(suggestMotif(name).id, name).toBe(id);
  });

  it('falls back to the generic motif for unknown names', () => {
    expect(suggestMotif('Xyzzy').id).toBe('shop');
  });

  it('gives a stable background for the same name', () => {
    expect(suggestBackground('Sukienki')).toBe(suggestBackground('sukienki'));
    expect(ART_BACKGROUNDS).toContain(suggestBackground('Cokolwiek'));
  });

  it('produces a self-contained 4:5 SVG (no external references)', () => {
    for (const m of ART_MOTIFS) {
      const svg = artSvg(m, ART_BACKGROUNDS[0]!);
      expect(svg).toContain('viewBox="0 0 400 500"');
      expect(svg).not.toMatch(/href|url\(|<script|<image/i);
    }
  });
});

describe('industry graphics', () => {
  it('every store industry has an existing motif', async () => {
    const { INDUSTRIES } = await import('./industries');
    const { industryArtId } = await import('../store/industry-picker');
    const ids = new Set(ART_MOTIFS.map((m) => m.id));
    for (const i of INDUSTRIES) expect(ids.has(industryArtId(i.id)), i.id).toBe(true);
    expect(ids.size).toBe(ART_MOTIFS.length);
  });

  it('new motifs are found by category names too', () => {
    expect(suggestMotif('Gry wideo').id).toBe('gamepad');
    expect(suggestMotif('Zabawki i gry').id).toBe('toys');
    expect(suggestMotif('Farby i lakiery').id).toBe('paint');
    expect(suggestMotif('Artykuły szkolne').id).toBe('pencil');
    expect(suggestMotif('Namioty').id).toBe('tent');
  });
});
