/* Подключение к базе статистики (YDB serverless в личном облаке автора) — для setup.mjs и stats.mjs.
   Ключ не хранится: токен берётся у `yc --profile personal iam create-token` (вход автора на этой машине).
   Если рядом есть ключ сервисного аккаунта `telemetry-reader.local.json` (в .gitignore) — берём его.
   Профиль `default` (рабочий) не трогаем никогда. docs/ANALYTICS.md */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Driver, TokenAuthService, IamAuthService, getSACredentialsFromJson } from 'ydb-sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const CONF = JSON.parse(fs.readFileSync(path.join(here, 'cloud.json'), 'utf8'));
export { CONF };

const quiet = { error () {}, warn () {}, info () {}, debug () {}, trace () {}, fatal () {} };

function auth () {
  const key = path.join(root, 'telemetry-reader.local.json');
  if (fs.existsSync(key)) return new IamAuthService(getSACredentialsFromJson(key));
  const token = execFileSync('yc', ['--profile', 'personal', 'iam', 'create-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!token) throw new Error('yc --profile personal iam create-token: пустой токен');
  return new TokenAuthService(token);
}

export async function connect () {
  const driver = new Driver({ endpoint: CONF.endpoint, database: CONF.database, authService: auth(), logger: quiet });
  if (!(await driver.ready(15000))) throw new Error('YDB не ответила за 15 с (' + CONF.endpoint + ')');
  return driver;
}

/** выполнить YQL, вернуть строки первого набора (или всех — all) как объекты */
export async function q (driver, text, all = false) {
  return driver.queryClient.do({
    fn: async session => {
      const res = await session.execute({ text });
      const sets = [];
      for await (const rs of res.resultSets) {
        const rows = [];
        for await (const row of rs.rows) rows.push(row);
        sets.push(rows);
      }
      await res.opFinished;
      return all ? sets : (sets[0] || []);
    },
  });
}
