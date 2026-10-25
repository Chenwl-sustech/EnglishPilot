# Third-party notices

The root MIT license covers original EnglishPilot program code, not third-party data or dependencies.

## Vocabulary data — CC BY-SA 4.0

The adaptations in `src/lib/data/open-vocabulary.json` and `public/vocabulary-ngsl-nawl.json` contain:

- New General Service List 1.2 — Browne, C., Culligan, B., and Phillips, J.; https://www.newgeneralservicelist.com/new-general-service-list
- New Academic Word List 1.2 — Browne, C., Culligan, B., and Phillips, J.; https://www.newgeneralservicelist.com/new-academic-word-list
- BNC/COCA Level 6 word-family lists 1.0.0 (2017), bands 1–25 — Nation, I.S.P.; Victoria University of Wellington / Te Herenga Waka; https://www.wgtn.ac.nz/lals/resources/paul-nations-resources

Data license: Creative Commons Attribution-ShareAlike 4.0 International, https://creativecommons.org/licenses/by-sa/4.0/ . A copy is in `LICENSES/CC-BY-SA-4.0.txt`. EnglishPilot adaptations remain under that license. Original data sources do not endorse this application.

Full attribution, version information and modifications are retained in `public/open-vocabulary-attribution.txt` and `data-provenance/`. BNC/COCA licensing is evidenced by the publisher's resource-hub grant, not an additional per-file license inside the old ZIP; this distinction is retained in the evidence. No newer/incomplete frequency bands were merged into the 25-band version.

EnglishPilot normalized headwords and family forms, joined official NGSL/NAWL English definitions, removed formatting/duplicates and retained source membership. Missing translations, phonetics, definitions and examples were not invented. The original publisher pages and downloadable materials may change or disappear.

## Publisher exam resources

IELTS, British Council, IDP, Cambridge and ETS/TOEFL materials remain owned by their publishers. The source catalog contains links and identifying metadata. Private locally imported audio, transcripts and exam files are excluded from public source and artifacts. The root MIT license does not grant rights in external exam materials or trademarks.

## Software dependencies

React/Next.js, Capacitor and plugins, Dexie, fflate, lucide-react, ts-fsrs, Zod, Upstash and other npm dependencies retain their original licenses. Runtime dependency license files and package metadata are collected under `LICENSES/npm/` and `LICENSES/npm-dependencies.json`; consult each installed package for the authoritative notice. Build tools retain their own terms.
