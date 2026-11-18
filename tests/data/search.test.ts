/**
 * @jest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SqliteRepository } from '@/data/SqliteRepository';
import { ref } from '../helpers/fixtures';
import { openTestRepo } from '../helpers/nodeSqlite';

const FIXTURES = join(__dirname, '..', 'fixtures', 'screenshots');
const MAX = 5;

/** Stores `texts` as processed screenshots s1..sN (s1 oldest). */
async function seed(repo: SqliteRepository, texts: string[]): Promise<void> {
  await repo.upsertDiscovered(texts.map((_, i) => ref(i + 1)));
  await repo.claimBatch(texts.length, 0, MAX);
  for (const [i, text] of texts.entries()) {
    await repo.markProcessed(`s${i + 1}`, { ocrText: text, topic: null, processedAt: 1 });
  }
}

async function ids(repo: SqliteRepository, query: string): Promise<string[]> {
  return (await repo.search(query)).map((r) => r.id).sort();
}

describe('search over the OCR fixtures (ru/en/pl)', () => {
  // The reference texts of the OCR fixtures, keyed by case name (e.g. "pl-todo").
  const cases = readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.expected.txt'))
    .sort()
    .map((f) => ({
      name: f.replace('.expected.txt', ''),
      text: readFileSync(join(FIXTURES, f), 'utf8'),
    }));
  let repo: SqliteRepository;
  let idOf: Record<string, string>;

  beforeAll(async () => {
    ({ repo } = await openTestRepo());
    await seed(
      repo,
      cases.map((c) => c.text),
    );
    idOf = Object.fromEntries(cases.map((c, i) => [c.name, `s${i + 1}`]));
  });

  async function names(query: string): Promise<string[]> {
    const byId = Object.fromEntries(Object.entries(idOf).map(([name, id]) => [id, name]));
    return (await ids(repo, query)).map((id) => byId[id]).sort();
  }

  it.each([
    // [query, expected fixtures]
    ['notifications', ['en-settings']],
    ['NOTIF', ['en-settings']],
    ['example.com', ['en-article', 'ru-notes']],
    ['example.ru', ['ru-chat']],
    ['молоко', ['ru-notes']],
    ['МОЛОК', ['ru-notes']],
    ['понедельник утром', ['ru-chat']],
    ['документы', ['ru-chat']],
    ['отчет', ['ru-notes']], // ё typed as е
    ['всё хорошо', ['ru-chat']],
    ['все хорошо', ['ru-chat']],
    ['zażółć gęślą jaźń', ['pl-todo']],
    ['zazolc gesla jazn', ['pl-todo']], // no diacritics at all, incl. ł → l
    ['łodzią', ['pl-todo']],
    ['LODZIA', ['pl-todo']],
    ['wiadomości', ['pl-message']],
    ['wiadomosci', ['pl-message']],
    ['cześć', ['pl-message']],
    ['dokumenty', ['pl-message']],
    ['jutro rano', ['pl-todo']],
    ['rano', ['pl-message', 'pl-todo']],
    ['+48 501', ['pl-message']],
    ['14:00', ['pl-todo']],
    ['nothing-like-this', []],
  ])('%s → %j', async (query, expected) => {
    expect(await names(query)).toEqual(expected);
  });

  it('returns nothing for a query without words', async () => {
    expect(await repo.search('  ?! ')).toEqual([]);
  });
});

describe('SqliteRepository.search', () => {
  it('requires every word to match', async () => {
    const { repo } = await openTestRepo();
    await seed(repo, ['buy milk', 'buy bread', 'milk and bread']);

    expect(await ids(repo, 'milk')).toEqual(['s1', 's3']);
    expect(await ids(repo, 'milk bread')).toEqual(['s3']);
  });

  it('ranks the better match first, then the newer screenshot', async () => {
    const { repo } = await openTestRepo();
    await seed(repo, [
      'invoice invoice invoice',
      'one invoice among many other words in a long text about something else',
      'one invoice among many other words in a long text about something else',
    ]);

    expect((await repo.search('invoice')).map((r) => r.id)).toEqual(['s1', 's3', 's2']);
  });

  it('respects the limit', async () => {
    const { repo } = await openTestRepo();
    await seed(repo, ['note one', 'note two', 'note three']);

    expect(await repo.search('note', { limit: 2 })).toHaveLength(2);
  });

  it('only finds processed screenshots and follows reprocessing', async () => {
    const { repo } = await openTestRepo();
    await seed(repo, ['old text']);
    await repo.upsertDiscovered([ref(2)]);

    expect(await ids(repo, 'old')).toEqual(['s1']);
    expect(await repo.search('text')).toHaveLength(1);

    await repo.markProcessed('s1', { ocrText: 'new łódź', topic: null, processedAt: 2 });

    expect(await repo.search('old')).toEqual([]);
    expect(await ids(repo, 'lodz')).toEqual(['s1']);
    expect((await repo.search('new'))[0]).toMatchObject({ id: 's1', ocrText: 'new łódź' });
  });
});
