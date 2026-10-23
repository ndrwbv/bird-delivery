/* Таблица событий в YDB (идемпотентно: есть — не трогает). node tools/telemetry/setup.mjs. docs/ANALYTICS.md
   Ключ начинается с дня события (day): сводка читает только нужные дни, а не всю таблицу — чтение стоит операций
   бесплатного уровня. Повторная пачка (тот же день, установка, запуск, время, номер) не задваивается. */
import { connect, q, CONF } from './ydb.mjs';

const DDL = `
CREATE TABLE IF NOT EXISTS \`${CONF.table}\` (
  day Date NOT NULL,
  install_id Utf8 NOT NULL,
  session_id Utf8 NOT NULL,
  ts Timestamp NOT NULL,
  seq Uint32 NOT NULL,
  event Utf8,
  version Utf8,
  build Utf8,
  device Utf8,
  data Json,
  test Bool,
  received Timestamp,
  PRIMARY KEY (day, install_id, session_id, ts, seq)
) WITH (
  AUTO_PARTITIONING_BY_SIZE = ENABLED,
  TTL = Interval("P365D") ON received
);`;

const d = await connect();
try {
  await q(d, DDL);
  const n = await q(d, `SELECT COUNT(*) AS n FROM \`${CONF.table}\`;`);
  console.log('таблица', CONF.table, 'готова, строк:', n[0] && n[0].n);
} finally { await d.destroy(); }
