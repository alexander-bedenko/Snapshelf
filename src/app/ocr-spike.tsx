import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { MlKitLatinOcrEngine } from '@/platform/ocr/android/MlKitLatinOcrEngine';
import { TesseractOcrEngine } from '@/platform/ocr/android/TesseractOcrEngine';
import type { OcrEngine } from '@/platform/ocr/OcrEngine';
import { ScriptRoutingOcrEngine } from '@/platform/ocr/ScriptRoutingOcrEngine';

// Dev-only spike: runs OCR over fixtures copied into the app's internal files dir
// (see docs/STATUS.md) and logs results for tests/ocr-accuracy/run.js.
const FIXTURES_DIR = 'file:///data/data/com.snapshelf.app/files/fixtures';
const FIXTURES = ['ru-notes', 'ru-chat', 'en-article', 'en-settings', 'pl-todo', 'pl-message'];

// Each engine is measured separately; `routed` is what the app uses. The id goes into the log so
// `npm run ocr:accuracy -- --adb --engine <id>` can score one engine at a time.
function engines(): { id: string; engine: OcrEngine }[] {
  const mlkit = new MlKitLatinOcrEngine();
  const tesseract = new TesseractOcrEngine();
  return [
    { id: 'mlkit-latin', engine: mlkit },
    { id: 'tesseract', engine: tesseract },
    { id: 'routed', engine: new ScriptRoutingOcrEngine(tesseract, mlkit) },
  ];
}

export default function OcrSpike() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!__DEV__) return;
    (async () => {
      for (const { id, engine } of engines()) {
        for (const name of FIXTURES) {
          try {
            const r = await engine.recognize(`${FIXTURES_DIR}/${name}.png`, ['ru', 'en', 'pl']);
            console.log(
              'OCR_SPIKE ' +
                JSON.stringify({
                  name,
                  run: id,
                  engine: r.engine,
                  durationMs: r.durationMs,
                  text: r.text,
                }),
            );
            setLines((l) => [...l, `${id} ${name}: ${r.engine} ${r.durationMs} ms`]);
          } catch (e) {
            console.log('OCR_SPIKE ' + JSON.stringify({ name, run: id, error: String(e) }));
            setLines((l) => [...l, `${id} ${name}: ERROR ${String(e)}`]);
          }
        }
      }
      console.log('OCR_SPIKE_DONE');
    })();
  }, []);

  if (!__DEV__) return null;
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64 }}>
      <Text>OCR spike (dev only)</Text>
      {lines.map((l) => (
        <Text key={l}>{l}</Text>
      ))}
    </ScrollView>
  );
}
