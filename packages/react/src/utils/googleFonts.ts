export const FALLBACK_GOOGLE_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Raleway',
  'Oswald',
  'Merriweather',
  'Playfair Display',
  'Source Sans 3',
  'Nunito',
  'Ubuntu',
  'Rubik',
  'Work Sans',
  'Noto Sans',
  'Noto Serif',
  'PT Sans',
  'PT Serif',
  'Roboto Slab',
  'Fira Sans',
  'Mulish',
  'Quicksand',
  'Barlow',
  'Manrope',
  'DM Sans',
  'Karla',
  'Libre Franklin',
  'IBM Plex Sans',
  'IBM Plex Serif',
  'Space Grotesk',
  'Plus Jakarta Sans',
  'Outfit',
  'Sora',
  'Urbanist',
  'Bebas Neue',
  'Anton',
  'Archivo',
  'Cabin',
  'Cormorant Garamond',
  'Crimson Text',
  'Dancing Script',
  'Exo 2',
  'Josefin Sans',
  'Libre Baskerville',
  'Lora',
  'M PLUS Rounded 1c',
  'Mukta',
  'Nanum Gothic',
  'Nunito Sans',
  'Pacifico',
  'Permanent Marker',
  'Playfair',
  'Prompt',
  'Public Sans',
  'Rajdhani',
  'Roboto Condensed',
  'Signika Negative',
  'Titillium Web',
  'Varela Round',
  'Yanone Kaffeesatz',
];

let fontListPromise: Promise<string[]> | null = null;
const loadedFonts = new Set<string>();

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function loadGoogleFont(family: string): void {
  if (typeof document === 'undefined') return;
  const normalized = family.trim();
  if (!normalized || loadedFonts.has(normalized)) return;

  loadedFonts.add(normalized);
  const id = `orbit-google-font-${normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${normalized.split(/\s+/).join('+')}&display=swap`;
  document.head.appendChild(link);
}

export function fetchGoogleFonts(): Promise<string[]> {
  if (fontListPromise) return fontListPromise;

  if (typeof fetch === 'undefined') {
    fontListPromise = Promise.resolve(uniqueSorted(FALLBACK_GOOGLE_FONTS));
    return fontListPromise;
  }

  fontListPromise = fetch('https://fonts.google.com/metadata/fonts')
    .then((response) => {
      if (!response.ok) throw new Error('Failed to load Google Fonts metadata');
      return response.text();
    })
    .then((text) => {
      const clean = text.replace(/^\)\]\}'\s*/, '');
      const data = JSON.parse(clean) as {
        familyMetadataList?: Array<{ family?: string }>;
      };
      const families = data.familyMetadataList?.map((item) => item.family || '') ?? [];
      return uniqueSorted([...families, ...FALLBACK_GOOGLE_FONTS]);
    })
    .catch(() => uniqueSorted(FALLBACK_GOOGLE_FONTS));

  return fontListPromise;
}
