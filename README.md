# GRIST BOM Importer

Custom widget dla Grist do importowania struktur BOM (Bill of Materials) z plików XLSX i CSV wyeksportowanych z programów CAD (Autodesk Inventor, NX, Solid Edge).

## 🚀 Szybki start

### 1. Hostowanie na GitHub Pages

Wtyczka jest już skonfigurowana do automatycznego deployu na GitHub Pages za pomocą GitHub Actions.

1. **Wypchnij ten folder na swoje repozytorium GitHub** (np. `GRIST-BOM-importer_public`)
2. **Włącz GitHub Pages:**
   - Przejdź do: `Settings → Pages`
   - Wybierz **Source: GitHub Actions**
   - Zapisz

3. **Workflow uruchomi się automatycznie** po wypchnięciu na branch `main`
4. **Widget będzie dostępny pod:**
   ```
   https://twoj-username.github.io/GRIST-BOM-importer_public/
   ```

---

## ⚙️ Instalacja w Grist

1. **Otwórz dokument Grist**
2. **Dodaj widget:**
   - Kliknij **"Customize" → "Add Widget" → "Custom"**
   - Wklej URL: `https://twoj-username.github.io/GRIST-BOM-importer_public/`
3. **⚠️ WAŻNE: Ustaw "Access Level" na "Full Access"**
   - Widget potrzebuje dostępu do tabel: `BOM_CAD`, `BOM_struktura`, `Projekty`
4. **Zapisz i gotowe!**

---

## 📦 Wymagane tabele w Grist

| Tabela | Opis | Typ |
|--------|------|-----|
| `BOM_CAD` | Biblioteka części (globalna) | Tabela |
| `BOM_struktura` | Drzewo struktury BOM | Tabela |
| `Projekty` | Lista projektów | Tabela |

---

## 📄 Obsługiwane formaty plików

- **XLSX** (Excel) - pełne wsparcie
- **CSV** - pełne wsparcie

### Wymagane kolumny w pliku:
- `Item` - Numer pozycji
- `Part Number` - Numer części
- `Description` - Opis

### Opcjonalne kolumny:
- `QTY` / `Quantity` / `Unit QTY` / `Ilość`
- `Stock Number`
- `REV` / `Revision`
- `Material`
- `Appearance`
- `Mass`
- `Vendor`
- `Producent` / `Manufacturer`

---

## 🔧 Rozwój lokalny

1. **Zainstaluj zależności:**
   ```bash
   npm install
   ```

2. **Uruchom serwer developerski:**
   ```bash
   npm run dev
   ```

3. **Testuj lokalnie:**
   - Otwórz: `http://localhost:5173/`

---

## 📝 Informacje techniczne

- **Framework:** Vue 3 + TypeScript
- **Bundler:** Vite
- **Parsowanie XLSX:** SheetJS (xlsx)
- **Grist API:** grist-plugin-api
