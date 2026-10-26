import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'

const databaseUrl = process.env.PERFORMANCE_TEST_DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

describeDatabase('Message full-text indexes (PostgreSQL)', () => {
  let client: Client
  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl, statement_timeout: 15000 })
    await client.connect()
    await client.query('BEGIN')
    await client.query(`CREATE TEMP TABLE perf_search_messages (
      id integer, content text, title text, deleted boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP`)
    await client.query(`INSERT INTO perf_search_messages (id,content)
      SELECT g,repeat('ordinary project conversation ',5) FROM generate_series(10,30000) g`)
    await client.query(`INSERT INTO perf_search_messages VALUES
      (1,'alpha','beta',false),(2,'alpha beta',NULL,false),
      (3,NULL,'alpha beta',false),(4,'alpha beta',NULL,true),(5,NULL,NULL,false)`)
    const migration = readFileSync(resolve('prisma/migrations/20261026180000_message_full_text_indexes/migration.sql'), 'utf8')
    await client.query(migration.replaceAll('ON "messages"', 'ON "perf_search_messages"'))
    await client.query('ANALYZE perf_search_messages')
  })
  afterAll(async () => {
    if (!client) return
    try { await client.query('ROLLBACK') } finally { await client.end() }
  })

  it('preserves prefix, null, deleted and separate-field matching semantics', async () => {
    const result = await client.query(`SELECT id FROM perf_search_messages
      WHERE deleted=false AND (
        to_tsvector('simple',coalesce(content,'')) @@ to_tsquery('simple',$1)
        OR to_tsvector('simple',coalesce(title,'')) @@ to_tsquery('simple',$1)) ORDER BY id`, ['alph:* & bet:*'])
    expect(result.rows.map(r => r.id)).toEqual([2, 3])
  })

  it('makes both exact query expressions eligible for indexed search', async () => {
    const result = await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM perf_search_messages
      WHERE deleted=false AND (
        to_tsvector('simple',coalesce(content,'')) @@ to_tsquery('simple',$1)
        OR to_tsvector('simple',coalesce(title,'')) @@ to_tsquery('simple',$1))`, ['alph:* & bet:*'])
    const plan = JSON.stringify(result.rows[0]['QUERY PLAN'])
    expect(plan).toContain('messages_content_search_idx')
    expect(plan).toContain('messages_title_search_idx')
  })
})
