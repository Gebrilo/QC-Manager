# Bundled fonts

## Tajawal (`Tajawal-Regular.ttf`, `Tajawal-Bold.ttf`)
Used by the PDF report generator (`src/lib/reportPdfDocument.tsx`) because it
covers **both Latin and Arabic** as a static TTF — the PDF standard font
(Helvetica) has no Arabic glyphs, which made Arabic text render as garbled
symbols. Source: Google Fonts (https://fonts.google.com/specimen/Tajawal),
licensed under the SIL Open Font License 1.1 (OFL).
