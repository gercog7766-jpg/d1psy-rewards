import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import express from 'express';
import {JSDOM} from 'jsdom';
import {installBlackBox} from '../src/black-box.ts';
import {blackBoxPage, blackBoxScript} from '../src/black-box-ui.ts';

test('black box chat keeps one hour per auction, derives authors and only accepts live posts', async () => {
 const db = new PGlite();
 try {
  await db.exec(`
   create role anon;
   create role authenticated;
   create role service_role bypassrls;
   create table rewards_black_boxes(id uuid primary key, starts_at timestamptz, ends_at timestamptz, closed_at timestamptz);
   create table rewards_users(id uuid primary key, twitch_user_id text, twitch_login text, twitch_display_name text,
    banned boolean not null default false, participation_restricted boolean not null default false);
   grant select on rewards_black_boxes,rewards_users to service_role;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261112204729_black_box_chat.sql', import.meta.url), 'utf8'));
  const live = randomUUID(), finished = randomUUID(), sender = randomUUID(), restricted = randomUUID();
  await db.query(`insert into rewards_black_boxes values
   ($1, now()-interval '20 min', now()+interval '5 min', null),
   ($2, now()-interval '6 hours', now()-interval '1 min', now()-interval '1 min')`, [live, finished]);
  await db.query(`insert into rewards_users values
   ($1, '42', 'nick', 'Настоящий ник', false, false),
   ($2, '91', 'restricted', null, false, true)`, [sender, restricted]);
  await db.query(`insert into rewards_black_box_chat(box_id,user_id,author,message,created_at) values
   ($1,$3,'Ник','Просрочено',now()-interval '61 min'),
   ($1,$3,'Ник','Ещё видно',now()-interval '59 min'),
   ($2,$3,'Ник','Другие торги',now()-interval '2 min')`, [live, finished, sender]);

  const send = (id, twitchId, body) => db.query('select rewards_black_box_chat_send($1,$2,$3)', [id, twitchId, body]);
  const read = async id => (await db.query('select rewards_black_box_chat_read($1) as messages', [id])).rows[0].messages;
  await db.exec('set role authenticated');
  await assert.rejects(read(live), /permission denied/);
  await assert.rejects(send(live, '42', 'Запрещено'), /permission denied/);
  await db.exec('set role service_role');
  await assert.rejects(send(finished, '42', 'Поздно'), /auction_closed/);
  await assert.rejects(send(live, '91', 'Привет'), /participation_restricted/);
  await assert.rejects(send(live, '42', ' '), /invalid_message/);
  await assert.rejects(send(live, '42', '🎁'.repeat(141)), /invalid_message/);
  const message = '🎁'.repeat(140);
  await send(live, '42', ' ' + message + ' ');
  await assert.rejects(send(live, '42', 'Слишком быстро'), /chat_rate_limit/);
  const rows = await read(live);
  assert.deepEqual(rows.map(row => row.message), ['Ещё видно', message]);
  assert.equal(rows[1].author, 'Настоящий ник');
  assert.deepEqual(Object.keys(rows[1]).sort(), ['author', 'createdAt', 'id', 'message']);
  assert.deepEqual((await read(finished)).map(row => row.message), ['Другие торги']);
 } finally {
  await db.close();
 }
});

test('black box chat HTTP requires the session and origin for posting and validates 140 characters', async () => {
 const calls = [], id = randomUUID();
 const app = express();
 app.use(express.json());
 const siteOrigin = 'https://dropso.test';
 installBlackBox(app, {rpc: async (name, args) => {
  calls.push({name, args});
  return {data: [], error: null};
 }}, (req, res, next) => {
  if (!req.get('authorization')) return res.status(401).json({error: 'authentication_required'});
  res.locals.session = {twitchUserId: 'signed-user'};
  next();
 }, (_req, _res, next) => next(), siteOrigin);
 const server = await new Promise(resolve => {
  const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
 });
 try {
  const url = 'http://127.0.0.1:' + server.address().port + '/api/black-box/chat/' + id;
  const post = (body, headers) => fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: JSON.stringify(body)});
  const goodHeaders = {Origin: siteOrigin, Authorization: 'fixture'};
  assert.deepEqual(await (await fetch(url)).json(), {messages: []});
  assert.equal((await post({message: 'Привет'}, {Origin: siteOrigin})).status, 401);
  assert.equal((await post({message: 'Привет'}, {...goodHeaders, Origin: 'https://other.test'})).status, 403);
  assert.equal((await post({message: '🎁'.repeat(141)}, goodHeaders)).status, 400);
  assert.equal((await post({message: '  Привет  ', author: 'spoofed'}, goodHeaders)).status, 200);
  assert.deepEqual(calls, [
   {name: 'rewards_black_box_chat_read', args: {p_box: id}},
   {name: 'rewards_black_box_chat_send', args: {p_box: id, p_twitch_user: 'signed-user', p_message: 'Привет'}}
  ]);
 } finally {
  await new Promise(resolve => server.close(resolve));
 }
});

test('black box chat polls, renders plain text and local timestamps, sends and expires messages', async () => {
 const dom = new JSDOM(blackBoxPage(false), {runScripts: 'outside-only', pretendToBeVisual: true});
 const w = dom.window, q = id => w.document.getElementById(id);
 const intervals = [], calls = [];
 const settle = () => new Promise(resolve => setImmediate(resolve));
 let now = Date.parse('2026-11-12T19:50:00Z'), current = {id: 'auction', endsAt: '2026-11-12T20:00:00Z', startPrice: 10, step: 1};
 const first = {id: '1', author: '<img src=x>', message: '<script>alert(1)</script>', createdAt: '2026-11-12T19:00:00Z'};
 let rows = [first];
 w.Date.now = () => now;
 w.matchMedia = () => ({matches: false});
 w.setInterval = (cb, ms) => intervals.push({cb, ms});
 w.fetch = async (path, options) => {
  if (path === '/api/black-box') {
   return {ok: true, json: async () => ({current, closed: {id: 'auction'}, participants: [], serverNow: new Date(now).toISOString()})};
  }
  if (options.method === 'POST') {
   calls.push(JSON.parse(options.body));
   rows.push({id: '3', author: 'Игрок', message: calls.at(-1).message, createdAt: new Date(now).toISOString()});
  }
  return {ok: true, json: async () => ({messages: rows})};
 };
 try {
  w.eval(blackBoxScript);
  await settle();
  const log = q('chatLog');
  const firstNode = log.querySelector('.chat-message');
  assert(firstNode.textContent.includes(first.message));
  assert(firstNode.textContent.includes(first.author));
  assert.equal(firstNode.querySelector('img,script'), null);
  const time = firstNode.querySelector('time');
  assert.equal(time.dateTime, first.createdAt);
  assert.equal(time.textContent, new w.Intl.DateTimeFormat('ru-RU', {
   hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(Date.parse(first.createdAt)));

  const poll = intervals[0].cb, refreshAuction = intervals[1].cb;
  rows.push({id: '2', author: 'Зритель', message: 'Новая ставка!', createdAt: new Date(now).toISOString()});
  await poll();
  assert.equal(log.querySelector('.chat-message'), firstNode);
  assert.equal(log.querySelectorAll('.chat-message').length, 2);

  const input = q('chatInput'), button = q('chatSubmit');
  input.value = '🎁'.repeat(141);
  input.dispatchEvent(new w.Event('input'));
  assert(button.disabled);
  input.value = 'Моя ставка';
  input.dispatchEvent(new w.Event('input'));
  assert(!button.disabled);
  button.click();
  await settle();
  assert.deepEqual(calls, [{message: 'Моя ставка'}]);
  assert.equal(input.value, '');
  assert(log.textContent.includes('Моя ставка'));

  now += 10 * 60 * 1000;
  current = null;
  await refreshAuction();
  await poll();
  assert(q('chatForm').hidden);
  assert(!firstNode.isConnected, 'one hour old message disappears');
  assert(log.textContent.includes('Моя ставка'), 'recent messages remain readable after the auction');
 } finally {
  w.close();
 }
});
