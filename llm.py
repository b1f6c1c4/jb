#!/usr/bin/env python

import psycopg
from tqdm import trange, tqdm
from transformers import AutoModelForCausalLM, T5ForConditionalGeneration, AutoTokenizer
import torch
import sys

if len(sys.argv) not in [3,4]:
    print(f'Usage: {sys.argv[0]} [process|monitor|job_link] postgresql://[username]:[password]@[host]:[port]/[database] [-n]')
    sys.exit(1)

model = T5ForConditionalGeneration.from_pretrained("google/flan-ul2", device_map="cuda:0", torch_dtype=torch.bfloat16, load_in_4bit=True)
tokenizer = AutoTokenizer.from_pretrained("google/flan-ul2")

def get_fields(conn):
    return [('ai_year','smallint','How many years of experiences does the job require? Answer a number only.')]

    with conn.cursor() as cur:
        cur.execute("""
SELECT a.attname as fld,
  pg_catalog.format_type(a.atttypid, a.atttypmod) as ty,
  pg_catalog.col_description(a.attrelid, a.attnum) as cmt
FROM pg_catalog.pg_attribute a
WHERE a.attrelid = (SELECT oid FROM pg_class WHERE relname = 'jobs')
  AND a.attnum > 0 AND NOT a.attisdropped AND a.attname ~ 'ai_.*'
  AND a.attname != 'ai_fail'
ORDER BY a.attnum;""")
        return cur.fetchall()

def process_single(triple,job_link,job_description):
    fld,ty,cmt = triple
    if ty not in ['boolean','smallint']:
        print(f'Unknown type {ty}')
        sys.exit(2)
    jd = 'Read the following job description and answer questions.\n\n'
    jd += job_description[0:16300]
    jd += '\n\n'
    jd += cmt
    try:
        model_inputs = tokenizer([jd], return_tensors='pt').to('cuda')
        generated_ids = model.generate(**model_inputs, max_length=10)
        results = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)
        if ty == 'boolean':
            res = results[0].strip().lower() == "yes"
        else:
            res = int(float(results[0].split(' ')[0]))
        return f"UPDATE jobs SET {fld} = %s WHERE job_link = %s", (res,job_link)
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as e:
        print(f'[{fld}] {job_link} [error]')
        print(e)
        return "UPDATE jobs SET ai_fail = (%s || ',' || ai_fail) WHERE job_link = %s", (fld,job_link)

def execute(cur, obj):
    if len(sys.argv) == 4:
        print(f'cur.execute(*{obj})')
    else:
        cur.execute(*obj)

def process_one(conn,job_link):
    for triple in tqdm(get_fields(conn)):
        fld = triple[0]
        with conn.cursor() as cur:
            cur.execute(f"SELECT job_description FROM jobs WHERE job_link = %s AND {fld} IS NULL AND (ai_fail !~ '(?<![a-z_]){fld}(?![a-z_])')", (job_link,))
            res = cur.fetchone()
            if res != None:
                (jd,) = res
                execute(cur, process_single(triple,job_link,jd))
                print(f'[{job_link}] updated [{fld}]')

def process_all(conn):
    for triple in get_fields(conn):
        fld = triple[0]
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM jobs WHERE {fld} IS NULL AND (ai_fail !~ '(?<![a-z_]){fld}(?![a-z_])')")
            total = cur.fetchone()[0]
        print(f'[[[[{fld}]]]]')
        with tqdm(total=total) as pbar:
            while True:
                with conn.cursor() as cur:
                    cur.execute(f"SELECT job_link,job_description FROM jobs WHERE {fld} IS NULL AND (ai_fail !~ '(?<![a-z_]){fld}(?![a-z_])') LIMIT 10")
                    updates = [process_single(triple,jl,jd) for jl,jd in cur]
                    if len(updates) == 0:
                        break
                    for u in updates:
                        execute(cur, u)
                pbar.update(len(updates))

with psycopg.connect(sys.argv[2], autocommit=True) as conn:
    if sys.argv[1] not in ['process','monitor']:
        process_one(conn, sys.argv[1])
    else:
        process_all(conn)
        if sys.argv[1] == 'monitor':
            print('\n\n')
            print('Listening on <jobs> ...')
            conn.execute('LISTEN jobs')
            for notify in conn.notifies():
                print(notify)
                if notify.payload != '':
                    process_one(conn,notify.payload)
