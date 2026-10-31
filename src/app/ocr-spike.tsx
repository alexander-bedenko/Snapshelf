import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { MlKitLatinOcrEngine } from '@/platform/ocr/android/MlKitLatinOcrEngine';

// Dev-only spike: runs OCR over fixtures pushed to the app's external files dir
// (see docs/STATUS.md) and logs results for tests/ocr-accuracy/run.js.
const FIXTURES_DIR = 'file:///sdcard/Android/data/com.snapshelf.app/files/fixtures';
const FIXTURES = ['ru-notes', 'ru-chat', 'en-article', 'en-settings', 'pl-todo', 'pl-message'];

export default function OcrSpike() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!__DEV__) return;
    const engine = new MlKitLatinOcrEngine();
    (async () => {
      for (const name of FIXTURES) {
        try {
          const r = await engine.recognize(`${FIXTURES_DIR}/${name}.png`, ['ru', 'en', 'pl']);
          console.log(
            'OCR_SPIKE ' +
              JSON.stringify({ name, engine: r.engine, durationMs: r.durationMs, text: r.text }),
          );
          setLines((l) => [...l, `${name}: ${r.durationMs} ms`]);
        } catch (e) {
          console.log('OCR_SPIKE ' + JSON.stringify({ name, error: String(e) }));
          setLines((l) => [...l, `${name}: ERROR ${String(e)}`]);
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
