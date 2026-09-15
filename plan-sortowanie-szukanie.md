# Plan: Nowe pole "Szukaj pozycji" + sortowanie hierarchiczne wg dowolnej kolumny

## Kontekst (zbadany z kodu)

- Stack: Vue 3 (`<script setup>`), TypeScript, Vite. Brak testów automatycznych.
- Drzewo BOM: `tree.value: BOMNode[]` w `App.vue`. Każdy `BOMNode` ma `children: BOMNode[]` (relacje rodzic-dziecko definiuje `item` w notacji kropkowej, np. `1.1.2`, ale struktura drzewa opiera się na tablicach `children`, nie na kolejności).
- Istniejący `searchQuery` w `App.vue` to **filtr** — ukrywa węzły niedopasowane (`filterUtils.ts: isNodeVisible`, `hasMatchingDescendant`), auto-rozwija pasujące gałęzie. To NIE jest to, o co prosi użytkownik.
- Renderowanie: `App.vue` iteruje `tree` → `TreeNode.vue` rekursywnie po `visibleChildren`. Kolumny nagłówka: Item, Part Number, BOM Structure, QTY, Description, Stock Number, REV, Material, Appearance, Mass, Vendor, Akcja.
- `BOMNode.rawData` zawiera surowe pola (Stock_Number, REV, Material, Appearance, Mass, Vendor, ...).
- Sortowanie nie wpływa na poprawność synchronizacji z Grist (`syncToGrist` w `gristApi.ts` iteruje po relacjach, nie po kolejności) — ale dla bezpieczeństwa sortujemy tylko warstwę widoku.

## Wymagania użytkownika

1. **Nowe pole "Szukaj pozycji"** — niezależne od istniejącego filtru. Ma **znaleźć** konkretną pozycję wg dowolnego pola (tj. przejść do niej / ją podświetlić), a nie filtrować listę.
2. **Sortowanie wg dowolnej kolumny** — klikalne nagłówki kolumn. Kryterium sortowania stosowane **poziomami**: najpierw sortowany jest pierwszy poziom złożenia, a następnie dzieci wewnątrz każdego rodzica są sortowane wg tego samego kryterium (rekursywnie w dół drzewa).

## Założenia do walidacji z użytkownikiem

- A1: "Szukaj pozycji" = nawigacja (znajdź + podświetl + przewiń + przejdź do następnego/poprzedniego trafienia), NIE kolejny filtr. Istniejący `searchQuery` zostaje bez zmian.
- A2: Sortowanie dotyczy tylko widoku (kolejność renderowania), nie modyfikuje `tree.value` ani danych wysyłanych do Grist.
- A3: Sortowanie po `item` odbywa się numerycznie po komponentach kropkowych (`1.2` < `1.10`), nie leksykograficznie.
- A4: Domyślny stan = brak sortowania (kolejność z pliku). Kliknięcie nagłówka: rosnąco → malejąco → wyłączone (cykl 3-stanowy).
- A5: Sortowanie i "Szukaj pozycji" współpracują z istniejącym filtrem i ukrytymi dziećmi Inseparable.

## Architektura

### 1. Sortowanie hierarchiczne (warstwa widoku)

**Nowy plik: `src/utils/sortUtils.ts`**

```ts
export type SortColumn =
  | 'item' | 'partNumber' | 'bomStructure' | 'qty' | 'description'
  | 'stock' | 'rev' | 'material' | 'appearance' | 'mass' | 'vendor' | 'action';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

// Mapa kolumna -> funkcja wyciągająca wartość porównawczą z BOMNode
export function getSortValue(node: BOMNode, column: SortColumn): string | number

// Porównanie z uwzględnieniem typu (number dla qty/item, string dla reszty)
function compareNodes(a: BOMNode, b: BOMNode, column: SortColumn, dir: SortDirection): number

// Rekursywne sortowanie KOPII tablic dzieci (te same obiekty węzłów, nowa kolejność)
export function sortTreeHierarchically(nodes: BOMNode[], state: SortState): BOMNode[]
```

Kluczowe punkty:
- `getSortValue` dla `item` rozbija `node.item` po `.` i porównuje tablice liczb (sortowanie naturalne).
- `sortTreeHierarchically` sortuje `nodes`, następnie dla każdego węzła rekursywnie sortuje jego `children` (nowa tablica, te same referencje obiektów — zachowuje `selected`/`expanded`/`gristId`).
- Gdy `state.column === null` → zwraca oryginalną kolejność (brak sortowania).

**Modyfikacja `App.vue`:**
- Nowy stan: `const sortState = ref<SortState>({ column: null, direction: 'asc' })`.
- Nowy computed `displayTree`: `sortTreeHierarchically(tree.value, sortState.value)`. Renderowanie `TreeNode` iteruje po `displayTree` zamiast `tree`.
- `TreeNode.vue`: props `node`/`children` pozostają tymi samymi obiektami — sortowanie zmienia tylko kolejność w tablicy, więc `v-model`/`selected`/`expanded` działają bez zmian.
- Nagłówki kolumn w `.tree-header` stają się klikalne: `@click="toggleSort('partNumber')"`. Wskaźnik kierunku (▲/▼/brak) obok etykiety. Kolumny `col-expand`, `col-check`, `col-action` nie są sortowalne.
- `toggleSort(column)`: jeśli inna kolumna → ustaw `column`, `direction='asc'`; jeśli ta sama → `asc→desc→null`.

### 2. Pole "Szukaj pozycji" (nawigacja, nie filtr)

**Nowy plik: `src/utils/searchUtils.ts`**

```ts
// Znajdź wszystkie węzły pasujące do zapytania (dowolne pole, jak nodeMatchesQuery)
export function findAllMatches(nodes: BOMNode[], query: string): BOMNode[]

// Ścieżka od korzenia do węzła (tablica przodków) — do rozwinięcia gałęzi
export function getAncestorPath(node: BOMNode, root: BOMNode[]): BOMNode[] | null
```

Uwaga: `BOMNode` nie ma referencji do rodzica. Aby zbudować ścieżkę przodków, trzeba przejść drzewo od korzenia lub dodać pole `parent: BOMNode | null` w `buildTree`/`calculateDiff`. **Decyzja:** dodać pole `parentRef?: BOMNode` (opcjonalne, ustawiane przy budowaniu drzewa i po diff), by unikać O(n) skanowania przy każdym "następny/poprzedni".

**Modyfikacja `App.vue`:**
- Nowy stan: `const findQuery = ref('')`, `const matchList = ref<BOMNode[]>([])`, `const matchIndex = ref(-1)`, `const currentMatch = computed(...)`.
- UI: nowe pole tekstowe w toolbarze (obok istniejącego filtru, z wyraźną etykietą "Szukaj pozycji" i przyciskami ‹ › oraz licznikiem "3/12"). Enter = następny, Shift+Enter = poprzedni.
- Akcja `executeFind()`:
  1. `matchList.value = findAllMatches(visibleFlatNodes.value, findQuery.value)` (szuka w węzłach widocznych, z pominięciem ukrytych przez Inseparable).
  2. `matchIndex.value = 0`.
  3. `expandToMatch(currentMatch)` — rozwija wszystkich przodków `currentMatch` (`ancestor.expanded = true`).
  4. `scrollToMatch(currentMatch)` — przewija do wiersza (wymaga `ref`/`data-id` na wierszu w `TreeNode.vue`).
- `nextMatch()` / `prevMatch()` — zmienia `matchIndex`, rozwija przodków, przewija.
- Podświetlenie: `TreeNode.vue` otrzymuje prop `highlightedKey?: string` (np. `item + partNumber`); węzeł pasujący dostaje klasę `is-find-match` (inny kolor niż `is-match` z filtru).
- Czyszczenie `findQuery` resetuje `matchList`/`matchIndex` i podświetlenie.
- Współpraca z filtrem: jeśli `searchQuery` (filtr) ukrywa węzeł, "Szukaj pozycji" go nie znajdzie (szuka w `visibleFlatNodes`).

**Modyfikacja `TreeNode.vue`:**
- Nowy prop `highlightedKey?: string`.
- Atrybut `:data-node-key="node.item + '|' + node.partNumber"` na `.node-row` (do `scrollIntoView`).
- Klasa `is-find-match` gdy `highlightedKey === nodeKey`.

### 3. Style

- Wskaźniki sortowania w nagłówkach (▲/▼) — drobny CSS w `App.vue`.
- Pole "Szukaj pozycji" — reuse stylów `.search-box`/`.search-input` z nową klasą wyróżniającą.
- `.is-find-match` — wyraźne tło (np. pomarańczowe `rgba(251, 191, 36, 0.25)`), odrębne od `.is-match` (niebieskie).

## Plan wdrożenia (kolejność)

1. `src/utils/sortUtils.ts` — logika sortowania + `getSortValue` + `sortTreeHierarchically`.
2. `src/utils/searchUtils.ts` — `findAllMatches`, `getAncestorPath` (z `parentRef`).
3. `bomParser.ts` (`buildTree`) + `diffLogic.ts` (`calculateDiff`): ustaw `parentRef` przy budowaniu/diffie (i dla węzłów phantom w fazie 4).
4. `App.vue`: stan sortowania, `displayTree` computed, klikalne nagłówki, `toggleSort`.
5. `App.vue`: stan "Szukaj pozycji", `executeFind`/`nextMatch`/`prevMatch`, `expandToMatch`, `scrollToMatch`.
6. `TreeNode.vue`: prop `highlightedKey`, `data-node-key`, klasa `is-find-match`.
7. Style: nagłówki sortowalne, pole szukania, podświetlenie.
8. Weryfikacja: `npm run build` (vue-tsc + vite), ręczne testy w przeglądarce (`npm run dev`):
   - sortowanie po każdej kolumnie, cykl 3-stanowy, sortowanie hierarchiczne (dzieci sortowane osobno),
   - szukanie pozycji, nawigacja ‹ ›, rozwijanie gałęzi, przewijanie,
   - współpraca z filtrem i Inseparable,
   - synchronizacja z Grist nadal poprawna (kolejność nie wpływa na diff).

## Pliki do modyfikacji

| Plik | Zmiana |
|---|---|
| `src/utils/sortUtils.ts` | NOWY — logika sortowania hierarchicznego |
| `src/utils/searchUtils.ts` | NOWY — findAllMatches, getAncestorPath |
| `src/utils/bomParser.ts` | `buildTree`: ustaw `parentRef` |
| `src/utils/diffLogic.ts` | `calculateDiff`: ustaw `parentRef` (w tym phantom nodes) |
| `src/types/grist.d.ts` lub `bomParser.ts` | dodać `parentRef?: BOMNode` do `BOMNode` |
| `src/App.vue` | stan sortowania + `displayTree`, klikalne nagłówki, pole "Szukaj pozycji", logika nawigacji |
| `src/components/TreeNode.vue` | prop `highlightedKey`, `data-node-key`, klasa `is-find-match`, render po `displayTree` |

## Ryzyka / uwagi

- **`parentRef` i reaktywność:** dodanie pola do obiektów `BOMNode` jest bezpieczne (nie jest reaktywne przez `ref`, ale `tree` jest `ref` na tablicy; modyfikacje węzłów są mutacjami, co Vue toleruje dla `ref<BOMNode[]>`). Trzeba uważać, by `parentRef` nie tworzył cykli przy `JSON.parse(JSON.stringify(...))` w `processFile` — tam robiona jest głęboka kopia `fileData`, `parentRef` trzeba ustawić **po** `calculateDiff`, nie kopiować go przez JSON (JSON.stringify pominie cykliczne `parentRef` → `undefined`, co jest OK).
- **Sortowanie a `key` w `v-for`:** obecnie `:key="node.item + node.partNumber"`. Sortowanie zmienia kolejność, ale `key` pozostaje stabilny → Vue poprawnie przeniesie węzły bez utraty stanu.
- **Wydajność:** `displayTree` computed rekursywnie sortuje przy każdej zmianie `tree`/`sortState`. Dla BOM ≤ 10000 wierszy (limit w `bomParser.ts`) akceptowalne; można dodać `memo` jeśli wolno.
- **Scroll:** `scrollToMatch` wymaga, by wiersz miał stabilny atrybut do `querySelector` + `scrollIntoView({ block: 'center' })`.
