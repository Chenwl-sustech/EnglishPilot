import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "vitest";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
test("real PostgreSQL policies isolate users, block direct writes, and enforce CAS", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${a}'), ('${b}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id bigint generated always as identity, bucket_id text, name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
      create function storage.filename(text) returns text language sql immutable as $$select substring($1 from '[^/]+$')$$;
      grant usage on schema public, auth, storage to anon, authenticated;
      grant select, insert, update, delete on storage.objects to anon, authenticated;
      grant usage on all sequences in schema storage to anon, authenticated;`);
    await pg.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610260001_account_sync.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await pg.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`,
    );
    const doc = { version: 1, state: {}, recordings: [], listeningAudio: [] };
    expect(
      (
        await pg.query<{ revision: number }>(
          "select public.englishpilot_sync_commit(0,$1::jsonb) as revision",
          [JSON.stringify(doc)],
        )
      ).rows[0].revision,
    ).toBe(1);
    expect(
      (
        await pg.query<{ revision: number | null }>(
          "select public.englishpilot_sync_commit(0,$1::jsonb) as revision",
          [JSON.stringify(doc)],
        )
      ).rows[0].revision,
    ).toBeNull();
    await expect(
      pg.query("update public.englishpilot_sync_heads set revision=999"),
    ).rejects.toThrow(/permission denied/);
    const hash = "a".repeat(64);
    await pg.query(
      "insert into storage.objects(bucket_id,name) values ('englishpilot-sync',$1)",
      [`${a}/chunks/${hash}`],
    );
    await expect(
      pg.query(
        "insert into storage.objects(bucket_id,name) values ('englishpilot-sync',$1)",
        [`${b}/chunks/${hash}`],
      ),
    ).rejects.toThrow(/row-level security/);
    await pg.exec(`select set_config('request.jwt.claim.sub','${b}',false);`);
    expect(
      (await pg.query("select * from public.englishpilot_sync_heads")).rows,
    ).toHaveLength(0);
    expect((await pg.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    expect(
      (
        await pg.query<{ revision: number }>(
          "select public.englishpilot_sync_commit(0,$1::jsonb) as revision",
          [JSON.stringify(doc)],
        )
      ).rows[0].revision,
    ).toBe(1);
    await pg.exec(
      "reset role; set role anon; select set_config('request.jwt.claim.sub','',false);",
    );
    await expect(
      pg.query("select public.englishpilot_sync_commit(0,$1::jsonb)", [
        JSON.stringify(doc),
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      pg.query("select * from public.englishpilot_sync_heads"),
    ).rejects.toThrow(/permission denied/);
  } finally {
    await pg.close();
  }
}, 30000);
