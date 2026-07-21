/**
 * Domino, NameMasker's mascot: an original raccoon whose mask is drawn in
 * verdigris — the brand color doing the masking. Design approved by Chris
 * (body option B, scan pose D3). Three moments only, never near the flags:
 * peeking over the empty paste box, covering his eyes while a scan runs
 * ("not peeking"), and a small pop beside "all reviewed". Colors are the
 * fixed Greenroom palette.
 */

const GRAPHITE = '#22272b';
const PAPER = '#f4f6f5';
const VERDIGRIS = '#1f6f60';

/** Peeking over an edge, tail trailing as a ringed underline. ~150x64. */
export const DOMINO_PEEK = `
<svg width="150" height="64" viewBox="0 0 150 64" aria-hidden="true">
  <path d="M22 59 C 44 42, 64 54, 92 60" fill="none" stroke="${VERDIGRIS}" stroke-width="9" stroke-linecap="round"/>
  <path d="M22 59 C 44 42, 64 54, 92 60" fill="none" stroke="${GRAPHITE}" stroke-width="9" stroke-linecap="butt" stroke-dasharray="7 11"/>
  <circle cx="89" cy="12" r="8" fill="${GRAPHITE}"/><circle cx="115" cy="12" r="8" fill="${GRAPHITE}"/>
  <circle cx="89" cy="13.5" r="4" fill="${PAPER}"/><circle cx="115" cy="13.5" r="4" fill="${PAPER}"/>
  <circle cx="102" cy="32" r="22" fill="${PAPER}" stroke="${GRAPHITE}" stroke-width="2.5"/>
  <path d="M81 33 Q87 24 96 27.5 Q102 30 108 27.5 Q117 24 123 33 Q117 42 108 39 Q102 36.8 96 39 Q87 42 81 33 Z" fill="${VERDIGRIS}"/>
  <ellipse cx="93.5" cy="32.5" rx="5" ry="4.7" fill="#fff"/><circle cx="94.3" cy="33.2" r="2.4" fill="${GRAPHITE}"/><circle cx="95.2" cy="31.8" r=".8" fill="#fff"/>
  <ellipse cx="110.5" cy="32.5" rx="5" ry="4.7" fill="#fff"/><circle cx="109.7" cy="33.2" r="2.4" fill="${GRAPHITE}"/><circle cx="110.6" cy="31.8" r=".8" fill="#fff"/>
  <ellipse cx="102" cy="44" rx="3.4" ry="2.4" fill="${GRAPHITE}"/>
  <path d="M98 48 Q102 50 106 48" fill="none" stroke="${GRAPHITE}" stroke-width="1.8" stroke-linecap="round"/>
  <rect x="86" y="56" width="12" height="8" rx="4" fill="${PAPER}" stroke="${GRAPHITE}" stroke-width="2"/>
  <rect x="106" y="56" width="12" height="8" rx="4" fill="${PAPER}" stroke="${GRAPHITE}" stroke-width="2"/>
</svg>`;

/**
 * The Unmask face's Domino: mask pushed up onto his forehead, bare eyes —
 * this is the side where masks come off. Drawn for the dark card: ears
 * carry a paper stroke so they read against graphite.
 */
export const DOMINO_UNMASKED = `
<svg width="150" height="64" viewBox="0 0 150 64" aria-hidden="true">
  <path d="M22 59 C 44 42, 64 54, 92 60" fill="none" stroke="${VERDIGRIS}" stroke-width="9" stroke-linecap="round"/>
  <path d="M22 59 C 44 42, 64 54, 92 60" fill="none" stroke="${GRAPHITE}" stroke-width="9" stroke-linecap="butt" stroke-dasharray="7 11"/>
  <circle cx="89" cy="12" r="8" fill="${GRAPHITE}" stroke="${PAPER}" stroke-width="1.5"/><circle cx="115" cy="12" r="8" fill="${GRAPHITE}" stroke="${PAPER}" stroke-width="1.5"/>
  <circle cx="89" cy="13.5" r="4" fill="${PAPER}"/><circle cx="115" cy="13.5" r="4" fill="${PAPER}"/>
  <circle cx="102" cy="32" r="22" fill="${PAPER}" stroke="${GRAPHITE}" stroke-width="2.5"/>
  <path d="M84 21.5 Q92 15.5 102 17 Q112 15.5 120 21.5 Q112 26.5 102 25 Q92 26.5 84 21.5 Z" fill="${VERDIGRIS}"/>
  <ellipse cx="93.5" cy="33.5" rx="4.8" ry="4.5" fill="#fff" stroke="${GRAPHITE}" stroke-width="1.4"/><circle cx="94.2" cy="34.2" r="2.3" fill="${GRAPHITE}"/><circle cx="95" cy="32.9" r=".8" fill="#fff"/>
  <ellipse cx="110.5" cy="33.5" rx="4.8" ry="4.5" fill="#fff" stroke="${GRAPHITE}" stroke-width="1.4"/><circle cx="109.8" cy="34.2" r="2.3" fill="${GRAPHITE}"/><circle cx="110.6" cy="32.9" r=".8" fill="#fff"/>
  <ellipse cx="102" cy="44.5" rx="3.4" ry="2.4" fill="${GRAPHITE}"/>
  <path d="M98 48.5 Q102 50.5 106 48.5" fill="none" stroke="${GRAPHITE}" stroke-width="1.8" stroke-linecap="round"/>
  <rect x="86" y="56" width="12" height="8" rx="4" fill="${PAPER}" stroke="${GRAPHITE}" stroke-width="2"/>
  <rect x="106" y="56" width="12" height="8" rx="4" fill="${PAPER}" stroke="${GRAPHITE}" stroke-width="2"/>
</svg>`;

/** Paws over eyes: scanning on your device, not peeking. ~54x35 inline. */
export const DOMINO_SCAN = `
<svg width="54" height="35" viewBox="0 0 150 96" aria-hidden="true">
  <circle cx="57" cy="24" r="11" fill="${GRAPHITE}"/><circle cx="93" cy="24" r="11" fill="${GRAPHITE}"/>
  <circle cx="57" cy="26" r="6" fill="${PAPER}"/><circle cx="93" cy="26" r="6" fill="${PAPER}"/>
  <circle cx="75" cy="54" r="27" fill="${PAPER}" stroke="${GRAPHITE}" stroke-width="2.5"/>
  <path d="M49 55 Q56 44 67 48 Q75 51 83 48 Q94 44 101 55 Q94 66 83 62 Q75 59.5 67 62 Q56 66 49 55 Z" fill="${VERDIGRIS}"/>
  <ellipse cx="64" cy="55" rx="8.4" ry="7.6" fill="${PAPER}" stroke="${GRAPHITE}" stroke-width="2.2"/>
  <ellipse cx="86" cy="55" rx="8.4" ry="7.6" fill="${PAPER}" stroke="${GRAPHITE}" stroke-width="2.2"/>
  <path d="M60 51 L60 59 M64 50.5 L64 59.5 M68 51 L68 59" stroke="${GRAPHITE}" stroke-width="1.1" opacity=".5"/>
  <path d="M82 51 L82 59 M86 50.5 L86 59.5 M90 51 L90 59" stroke="${GRAPHITE}" stroke-width="1.1" opacity=".5"/>
  <ellipse cx="75" cy="69" rx="4" ry="2.8" fill="${GRAPHITE}"/>
  <path d="M70 74 Q75 76 80 74" fill="none" stroke="${GRAPHITE}" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

/** Paw on the mask's edge: the job is done. ~44x33 inline. */
export const DOMINO_DONE = `
<svg width="44" height="33" viewBox="0 0 100 74" aria-hidden="true">
  <circle cx="32" cy="12" r="8" fill="${GRAPHITE}"/><circle cx="68" cy="12" r="8" fill="${GRAPHITE}"/>
  <circle cx="32" cy="13.5" r="4.5" fill="${PAPER}"/><circle cx="68" cy="13.5" r="4.5" fill="${PAPER}"/>
  <circle cx="50" cy="38" r="20" fill="${PAPER}" stroke="${GRAPHITE}" stroke-width="2.2"/>
  <path d="M31 39 Q37 30 45 33 Q50 35.5 55 33 Q63 30 69 39 Q63 48 55 45.5 Q50 43.5 45 45.5 Q37 48 31 39 Z" fill="${VERDIGRIS}"/>
  <ellipse cx="43" cy="38.5" rx="4.6" ry="4.3" fill="#fff"/><circle cx="43.8" cy="39.2" r="2.2" fill="${GRAPHITE}"/><circle cx="44.6" cy="37.9" r=".8" fill="#fff"/>
  <ellipse cx="57" cy="38.5" rx="4.6" ry="4.3" fill="#fff"/><circle cx="56.2" cy="39.2" r="2.2" fill="${GRAPHITE}"/><circle cx="57" cy="37.9" r=".8" fill="#fff"/>
  <ellipse cx="50" cy="48.5" rx="3" ry="2.2" fill="${GRAPHITE}"/>
  <path d="M46.5 52.5 Q50 54.5 53.5 52.5" fill="none" stroke="${GRAPHITE}" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;
